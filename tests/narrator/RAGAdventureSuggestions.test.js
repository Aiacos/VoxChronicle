/**
 * RAG Adventure Suggestions & Summaries — Mock-based Integration Tests
 *
 * Tests the full pipeline: adventure context → RAG injection → PromptBuilder →
 * ChatProvider → response parsing, verifying that adventure content correctly
 * flows through the system and produces contextually appropriate suggestions.
 *
 * All API calls are mocked — these tests validate plumbing, not AI output quality.
 * For live API quality tests, see tests/integration/rag-adventure-live.test.js
 */

import { AIAssistant } from '../../scripts/narrator/AIAssistant.mjs';
import { RollingSummarizer } from '../../scripts/narrator/RollingSummarizer.mjs';
import { PromptBuilder } from '../../scripts/narrator/PromptBuilder.mjs';
import {
  ALL_ADVENTURES,
  BAROVIA_VILLAGE,
  GOBLIN_AMBUSH,
  DRAGON_HOARD,
  NOBLE_COURT,
  WAVE_ECHO_CAVE,
  getAllScenarios
} from '../fixtures/adventure-content.js';

// ---------------------------------------------------------------------------
// Console suppression (standard pattern)
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Creates a mock ChatProvider that returns contextually appropriate responses
 * based on the adventure scenario being tested.
 */
function createAdventureChatProvider(scenario) {
  const suggestions = scenario.expectedThemes.slice(0, 3).map((theme, i) => ({
    type: scenario.expectedTypes[i] || 'narration',
    content: `The DM should reference ${theme} in this scene. ${scenario.description}`,
    confidence: 0.8 - i * 0.1,
    pageReference: `Chapter reference for ${theme}`,
    source: { chapter: 'Chapter 3', page: theme, journalName: 'Adventure Module' }
  }));

  return {
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        suggestions,
        offTrackStatus: { isOffTrack: false, severity: 0, reason: 'On track with adventure' },
        relevantPages: ['page-1'],
        summary: `The party is at: ${scenario.description}`
      }),
      usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 }
    })
  };
}

/**
 * Creates a mock RAG provider that returns adventure context as if retrieved
 * from a vector store.
 */
function createAdventureRAGProvider(adventureContext) {
  return {
    query: vi.fn().mockResolvedValue({
      answer: adventureContext,
      sources: [
        { title: 'Adventure Module', excerpt: adventureContext.substring(0, 500) },
        { title: 'NPC Reference', excerpt: 'Key NPCs listed in adventure module' }
      ]
    })
  };
}

/**
 * Creates a mock OpenAI client for RollingSummarizer
 */
function createMockSummarizerClient(summaryResponse) {
  return {
    createChatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: summaryResponse } }],
      usage: { prompt_tokens: 300, completion_tokens: 100 }
    })
  };
}

// ===========================================================================
// SECTION 1: Adventure Context Injection into Prompts
// ===========================================================================

describe('RAG Adventure Context — Prompt Injection', () => {
  let builder;

  beforeEach(() => {
    builder = new PromptBuilder({ primaryLanguage: 'en', sensitivity: 'medium' });
  });

  describe.each(ALL_ADVENTURES)('$title', (adventure) => {
    it('should inject adventure context into suggestion messages', () => {
      const scenario = adventure.scenarios[0];
      const ragContext = `RELEVANT SOURCES: Adventure Module\n---\n${adventure.adventureContext}`;

      const messages = builder.buildSuggestionMessages(
        scenario.transcript,
        3,
        ragContext
      );

      // Must have system prompt + adventure context + user request
      expect(messages.length).toBeGreaterThanOrEqual(3);

      // Adventure context must be in the messages
      const contextMsg = messages.find((m) => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeDefined();
      expect(contextMsg.content).toContain(adventure.adventureContext.substring(0, 100));
    });

    it('should inject adventure context into analysis messages', () => {
      const scenario = adventure.scenarios[0];
      const ragContext = `RELEVANT SOURCES: Adventure Module\n---\n${adventure.adventureContext}`;

      const messages = builder.buildAnalysisMessages(
        scenario.transcript,
        true,  // includeSuggestions
        true,  // checkOffTrack
        ragContext
      );

      const contextMsg = messages.find((m) => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeDefined();
      expect(contextMsg.content).toContain('RELEVANT SOURCES');
    });

    it('should include NPC names from adventure in truncated context', () => {
      builder.setAdventureContext(adventure.adventureContext);

      const scenario = adventure.scenarios[0];
      const messages = builder.buildSuggestionMessages(scenario.transcript, 3, null);

      const contextMsg = messages.find((m) => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeDefined();
      // Verify key NPC names from the adventure are present
      expect(contextMsg.content).toContain('KEY NPCs');
    });
  });

  it('should preserve RAG sources header in formatted context', () => {
    const ragContext = `RELEVANT SOURCES: Village of Barovia, NPC Reference\n---\n${BAROVIA_VILLAGE.adventureContext}`;

    const messages = builder.buildSuggestionMessages(
      'The party enters the village',
      3,
      ragContext
    );

    const contextMsg = messages.find((m) => m.content.includes('ADVENTURE CONTEXT'));
    expect(contextMsg.content).toContain('RELEVANT SOURCES: Village of Barovia');
  });

  it('should prefer RAG context over full adventure text', () => {
    builder.setAdventureContext('This is the full adventure text that should NOT appear');

    const ragContext = 'RAG-retrieved context about Barovia village';
    const messages = builder.buildSuggestionMessages('test', 3, ragContext);

    const contextMsg = messages.find((m) => m.content.includes('ADVENTURE CONTEXT'));
    expect(contextMsg.content).toContain('RAG-retrieved context about Barovia');
    expect(contextMsg.content).not.toContain('should NOT appear');
  });
});

// ===========================================================================
// SECTION 2: Full Pipeline — RAG → Suggestions with Adventure Content
// ===========================================================================

describe('RAG Adventure Suggestions — Full Pipeline', () => {
  describe.each(ALL_ADVENTURES)('$title', (adventure) => {
    adventure.scenarios.forEach((scenario) => {
      describe(`Scenario: ${scenario.id}`, () => {
        let assistant;
        let mockChat;
        let mockRAG;

        beforeEach(() => {
          mockChat = createAdventureChatProvider(scenario);
          mockRAG = createAdventureRAGProvider(adventure.adventureContext);
          assistant = new AIAssistant({ chatProvider: mockChat });
          assistant.setRAGProvider(mockRAG);
        });

        it('should query RAG with the transcription text', async () => {
          await assistant.generateSuggestions(scenario.transcript);

          expect(mockRAG.query).toHaveBeenCalledTimes(1);
          const ragQuery = mockRAG.query.mock.calls[0][0];
          expect(ragQuery).toBe(scenario.transcript);
        });

        it('should pass RAG context to chat provider', async () => {
          await assistant.generateSuggestions(scenario.transcript);

          expect(mockChat.chat).toHaveBeenCalledTimes(1);
          const messages = mockChat.chat.mock.calls[0][0];

          // The messages should include adventure context from RAG
          const allContent = messages.map((m) => m.content).join('\n');
          expect(allContent).toContain('ADVENTURE CONTEXT');
          expect(allContent).toContain('RELEVANT SOURCES');
        });

        it('should return valid suggestion objects', async () => {
          const suggestions = await assistant.generateSuggestions(scenario.transcript);

          expect(suggestions.length).toBeGreaterThan(0);
          suggestions.forEach((s) => {
            expect(s).toHaveProperty('type');
            expect(s).toHaveProperty('content');
            expect(s).toHaveProperty('confidence');
            expect(['narration', 'dialogue', 'action', 'reference']).toContain(s.type);
            expect(s.confidence).toBeGreaterThanOrEqual(0);
            expect(s.confidence).toBeLessThanOrEqual(1);
            expect(s.content.length).toBeGreaterThan(0);
          });
        });

        it('should produce suggestions referencing expected themes', async () => {
          const suggestions = await assistant.generateSuggestions(scenario.transcript);

          const allSuggestionText = suggestions.map((s) => s.content).join(' ');
          const matchedThemes = scenario.expectedThemes.filter((theme) =>
            allSuggestionText.toLowerCase().includes(theme.toLowerCase())
          );

          // At least one expected theme should appear in suggestions
          expect(matchedThemes.length).toBeGreaterThan(0);
        });

        it('should include expected suggestion types', async () => {
          const suggestions = await assistant.generateSuggestions(scenario.transcript);

          const types = suggestions.map((s) => s.type);
          const matchedTypes = scenario.expectedTypes.filter((t) => types.includes(t));
          expect(matchedTypes.length).toBeGreaterThan(0);
        });
      });
    });
  });
});

// ===========================================================================
// SECTION 3: Full Pipeline — analyzeContext with Adventure Content
// ===========================================================================

describe('RAG Adventure Analysis — analyzeContext Pipeline', () => {
  const scenario = BAROVIA_VILLAGE.scenarios[0]; // village-entry

  let assistant;
  let mockChat;
  let mockRAG;

  beforeEach(() => {
    mockChat = createAdventureChatProvider(scenario);
    mockRAG = createAdventureRAGProvider(BAROVIA_VILLAGE.adventureContext);
    assistant = new AIAssistant({ chatProvider: mockChat });
    assistant.setRAGProvider(mockRAG);
  });

  it('should produce full analysis with suggestions and off-track status', async () => {
    const analysis = await assistant.analyzeContext(scenario.transcript);

    expect(analysis).toHaveProperty('suggestions');
    expect(analysis).toHaveProperty('offTrackStatus');
    expect(analysis).toHaveProperty('summary');
    expect(analysis).toHaveProperty('relevantPages');
    expect(analysis).toHaveProperty('rulesQuestions');

    expect(analysis.suggestions.length).toBeGreaterThan(0);
    expect(analysis.offTrackStatus.isOffTrack).toBe(false);
    expect(analysis.summary.length).toBeGreaterThan(0);
  });

  it('should inject RAG context into analysis messages', async () => {
    await assistant.analyzeContext(scenario.transcript);

    const messages = mockChat.chat.mock.calls[0][0];
    const allContent = messages.map((m) => m.content).join('\n');

    expect(allContent).toContain('ADVENTURE CONTEXT');
    // The adventure content should reference Barovia
    expect(allContent).toContain('Barovia');
  });

  it('should build conversation history from analysis turns', async () => {
    await assistant.analyzeContext('The party arrives at the village.');
    await assistant.analyzeContext('They approach the children in the street.');

    // Second call should have conversation history
    expect(mockChat.chat).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// SECTION 4: RAG Context Formatting and Edge Cases
// ===========================================================================

describe('RAG Context Formatting', () => {
  let assistant;
  let mockChat;

  beforeEach(() => {
    mockChat = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          suggestions: [{ type: 'narration', content: 'Test suggestion', confidence: 0.7 }]
        }),
        usage: {}
      })
    };
    assistant = new AIAssistant({ chatProvider: mockChat });
  });

  it('should format RAG context with sources header', () => {
    const ragResult = {
      context: 'The village is shrouded in mist...',
      sources: ['Village of Barovia', 'NPC List']
    };

    const formatted = assistant._formatRAGContext(ragResult);
    expect(formatted).toContain('RELEVANT SOURCES: Village of Barovia, NPC List');
    expect(formatted).toContain('---');
    expect(formatted).toContain('The village is shrouded in mist...');
  });

  it('should handle RAG context without sources', () => {
    const ragResult = { context: 'Some context', sources: [] };
    const formatted = assistant._formatRAGContext(ragResult);

    expect(formatted).toBe('Some context');
    expect(formatted).not.toContain('RELEVANT SOURCES');
  });

  it('should return empty string for null RAG result', () => {
    expect(assistant._formatRAGContext(null)).toBe('');
    expect(assistant._formatRAGContext({ context: '', sources: [] })).toBe('');
  });

  it('should gracefully degrade when RAG provider fails', async () => {
    const failingRAG = {
      query: vi.fn().mockRejectedValue(new Error('RAG service unavailable'))
    };
    assistant.setRAGProvider(failingRAG);

    // Should still produce suggestions (without RAG context)
    const suggestions = await assistant.generateSuggestions('The party enters the tavern.');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should fall back to adventure context when RAG is not configured', async () => {
    // No RAG provider set
    assistant.setAdventureContext(BAROVIA_VILLAGE.adventureContext);

    await assistant.generateSuggestions('The party looks around the village.');

    const messages = mockChat.chat.mock.calls[0][0];
    const contextMsg = messages.find((m) => m.content.includes('ADVENTURE CONTEXT'));
    expect(contextMsg).toBeDefined();
    expect(contextMsg.content).toContain('Village of Barovia');
  });
});

// ===========================================================================
// SECTION 5: Rolling Summarization with Adventure Content
// ===========================================================================

describe('RollingSummarizer — Adventure Content', () => {
  describe.each([
    {
      adventure: BAROVIA_VILLAGE,
      expectedKeywords: ['village', 'children', 'Barovia'],
      summaryResponse:
        'The party arrived at the gloomy village of Barovia. They encountered two frightened children, Rose and Thorn, claiming a monster lurks in their basement. The village appears abandoned, with shops and the tavern closed.'
    },
    {
      adventure: GOBLIN_AMBUSH,
      expectedKeywords: ['goblin', 'ambush', 'horses'],
      summaryResponse:
        'The party discovered dead horses on the Triboar Trail, riddled with black-feathered arrows. Goblin tracks led northeast. After defeating the ambush, they found a trail to the Cragmaw Hideout.'
    },
    {
      adventure: DRAGON_HOARD,
      expectedKeywords: ['dragon', 'tower', 'Venomfang'],
      summaryResponse:
        'The party approached the ruined tower in Thundertree. A young green dragon named Venomfang has claimed the tower. The dragon attempted to manipulate the party into fighting the nearby cultists.'
    },
    {
      adventure: WAVE_ECHO_CAVE,
      expectedKeywords: ['cave', 'echo', 'dwarves'],
      summaryResponse:
        'The party entered Wave Echo Cave, hearing the rhythmic booming that gives it its name. Ancient remains of dwarves and orcs litter the entrance. The legendary Forge of Spells lies deeper within.'
    }
  ])('$adventure.title', ({ adventure, expectedKeywords, summaryResponse }) => {
    let summarizer;
    let mockClient;

    beforeEach(() => {
      mockClient = createMockSummarizerClient(summaryResponse);
      summarizer = new RollingSummarizer(mockClient);
    });

    it('should summarize adventure transcript turns', async () => {
      const scenario = adventure.scenarios[0];
      const formattedTurns = `Player/DM: ${scenario.transcript}`;

      const result = await summarizer.summarize('', formattedTurns);

      expect(result.summary).toBe(summaryResponse);
      expect(result.usage).toBeDefined();
      expect(result.usage.prompt_tokens).toBeGreaterThan(0);
    });

    it('should pass adventure transcript to the API', async () => {
      const scenario = adventure.scenarios[0];
      const formattedTurns = `Player/DM: ${scenario.transcript}`;

      await summarizer.summarize('', formattedTurns);

      expect(mockClient.createChatCompletion).toHaveBeenCalledTimes(1);
      const callArgs = mockClient.createChatCompletion.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m) => m.role === 'user');
      expect(userMessage.content).toContain(scenario.transcript);
    });

    it('should incorporate existing summary when updating', async () => {
      const existingSummary = 'The party set out from Neverwinter on a supply escort mission.';
      const scenario = adventure.scenarios[0];
      const formattedTurns = `Player/DM: ${scenario.transcript}`;

      await summarizer.summarize(existingSummary, formattedTurns);

      const callArgs = mockClient.createChatCompletion.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m) => m.role === 'user');
      expect(userMessage.content).toContain(existingSummary);
      expect(userMessage.content).toContain('updated summary');
    });

    it('should format multi-turn adventure dialogue correctly', () => {
      const entries = [
        { role: 'user', content: 'DM describes the scene and asks what they do' },
        {
          role: 'assistant',
          content: JSON.stringify({
            summary: 'Party explores the area cautiously',
            suggestions: [{ type: 'narration', content: 'test' }]
          })
        },
        { role: 'user', content: 'Player 1 investigates the surroundings' }
      ];

      const formatted = RollingSummarizer.formatTurnsForSummary(entries);

      expect(formatted).toContain('Player/DM: DM describes the scene');
      expect(formatted).toContain('AI Summary: Party explores the area cautiously');
      expect(formatted).toContain('Player/DM: Player 1 investigates');
    });
  });

  it('should handle cold start with empty summary', async () => {
    const mockClient = createMockSummarizerClient('First summary of the session.');
    const summarizer = new RollingSummarizer(mockClient);

    const result = await summarizer.summarize('', 'Player/DM: We arrive at the village.');

    const callArgs = mockClient.createChatCompletion.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m) => m.role === 'user');
    // Cold start should NOT mention "existing summary"
    expect(userMessage.content).toContain('conversation turns from a tabletop RPG session');
    expect(userMessage.content).not.toContain('existing session summary');
  });
});

// ===========================================================================
// SECTION 6: NPC Dialogue Generation with Adventure Context
// ===========================================================================

describe('NPC Dialogue — Adventure Context', () => {
  it('should pass NPC context and adventure context to prompt', async () => {
    const mockChat = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          dialogueOptions: [
            '"Please, you must help us. Take my sister to Vallaki where she will be safe."',
            '"Our father is dead. Strahd\'s wolves come every night."',
            '"I am Ismark, son of the burgomaster. Or what remains of him."'
          ]
        }),
        usage: {}
      })
    };

    const assistant = new AIAssistant({ chatProvider: mockChat });
    assistant.setAdventureContext(BAROVIA_VILLAGE.adventureContext);

    const dialogue = await assistant.generateNPCDialogue(
      'Ismark Kolyanovich',
      'Burgomaster\'s son, desperate to protect his sister Ireena from Strahd',
      'The party enters the tavern and sits down with the lone figure drinking in the corner.'
    );

    expect(dialogue.length).toBeGreaterThan(0);

    // Verify the prompt included NPC name and context
    const messages = mockChat.chat.mock.calls[0][0];
    const allContent = messages.map((m) => m.content).join('\n');
    expect(allContent).toContain('Ismark');
  });
});

// ===========================================================================
// SECTION 7: Off-Track Detection with Adventure Context
// ===========================================================================

describe('Off-Track Detection — Adventure Scenarios', () => {
  it('should detect on-track when party follows adventure plot', async () => {
    const mockChat = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          isOffTrack: false,
          severity: 0,
          reason: 'Party is following the adventure as written — entering the village and meeting the children.'
        }),
        usage: {}
      })
    };

    const assistant = new AIAssistant({ chatProvider: mockChat });
    const mockRAG = createAdventureRAGProvider(BAROVIA_VILLAGE.adventureContext);
    assistant.setRAGProvider(mockRAG);

    const result = await assistant.detectOffTrack(BAROVIA_VILLAGE.scenarios[0].transcript);

    expect(result.isOffTrack).toBe(false);
    expect(result.severity).toBe(0);
  });

  it('should detect off-track when party deviates completely', async () => {
    const mockChat = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          isOffTrack: true,
          severity: 0.8,
          reason: 'Party is ignoring the village entirely and heading into the wilderness.',
          narrativeBridge: 'A desperate cry carries on the wind from the direction of the village...'
        }),
        usage: {}
      })
    };

    const assistant = new AIAssistant({ chatProvider: mockChat });
    assistant.setAdventureContext(BAROVIA_VILLAGE.adventureContext);

    const result = await assistant.detectOffTrack(
      'Player 1: I ignore the village and head north into the forest. Player 2: Yeah, forget this creepy place. Let us just go around it.'
    );

    expect(result.isOffTrack).toBe(true);
    expect(result.severity).toBeGreaterThan(0.5);
    expect(result.narrativeBridge).toBeDefined();
    expect(result.narrativeBridge.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// SECTION 8: Narrative Bridge Generation
// ===========================================================================

describe('Narrative Bridge — Adventure Redirects', () => {
  it('should generate a bridge back to the adventure plot', async () => {
    const bridgeText =
      'As you push through the undergrowth, the mist thickens until you can barely see. The forest seems to push you back toward the road. Through the fog, the silhouette of the village appears again — there is no escaping Barovia so easily.';

    const mockChat = {
      chat: vi.fn().mockResolvedValue({ content: bridgeText, usage: {} })
    };

    const assistant = new AIAssistant({ chatProvider: mockChat });
    assistant.setAdventureContext(BAROVIA_VILLAGE.adventureContext);

    const bridge = await assistant.generateNarrativeBridge(
      'The party left the village road and wandered into the Svalich Woods',
      'Return to the village of Barovia to meet Ismark at the tavern'
    );

    expect(bridge).toBe(bridgeText);
    expect(bridge.length).toBeGreaterThan(20);

    // Verify adventure context was included in the prompt
    const messages = mockChat.chat.mock.calls[0][0];
    const allContent = messages.map((m) => m.content).join('\n');
    expect(allContent).toContain('ADVENTURE CONTEXT');
  });
});

// ===========================================================================
// SECTION 9: Cross-Scenario Coverage — All Scenarios Pass Pipeline
// ===========================================================================

describe('Cross-Scenario Pipeline Validation', () => {
  const allScenarios = getAllScenarios();

  it.each(allScenarios)(
    'should process $adventureTitle / $scenario.id through the full pipeline',
    async ({ adventureContext, scenario }) => {
      const mockChat = createAdventureChatProvider(scenario);
      const mockRAG = createAdventureRAGProvider(adventureContext);

      const assistant = new AIAssistant({ chatProvider: mockChat });
      assistant.setRAGProvider(mockRAG);

      const suggestions = await assistant.generateSuggestions(scenario.transcript);

      // Pipeline completed without error
      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);

      // RAG was queried
      expect(mockRAG.query).toHaveBeenCalledWith(scenario.transcript, expect.any(Object));

      // Chat was called with messages containing adventure context
      const messages = mockChat.chat.mock.calls[0][0];
      const hasContext = messages.some((m) => m.content.includes('ADVENTURE CONTEXT'));
      expect(hasContext).toBe(true);
    }
  );
});

// ===========================================================================
// SECTION 10: Context Window Management with Long Adventures
// ===========================================================================

describe('Context Window — Long Adventure Content', () => {
  it('should truncate adventure context exceeding token budget', () => {
    const builder = new PromptBuilder({ primaryLanguage: 'en' });

    // Create artificially long adventure context (> 32KB)
    const longContext = BAROVIA_VILLAGE.adventureContext.repeat(20);
    builder.setAdventureContext(longContext);

    const messages = builder.buildSuggestionMessages('The party enters.', 3, null);
    const contextMsg = messages.find((m) => m.content.includes('ADVENTURE CONTEXT'));

    expect(contextMsg).toBeDefined();
    // Should be truncated — not the full repeated text
    expect(contextMsg.content.length).toBeLessThan(longContext.length);
  });

  it('should preserve RAG context even when adventure context is long', () => {
    const builder = new PromptBuilder({ primaryLanguage: 'en' });
    builder.setAdventureContext('Very long adventure context'.repeat(1000));

    const ragContext = 'Concise RAG result about the current scene';
    const messages = builder.buildSuggestionMessages('test', 3, ragContext);

    const contextMsg = messages.find((m) => m.content.includes('ADVENTURE CONTEXT'));
    // RAG context should replace (not append to) full adventure text
    expect(contextMsg.content).toContain('Concise RAG result');
    expect(contextMsg.content).not.toContain('Very long adventure context');
  });
});
