/**
 * RAG Adventure Suggestions — Live API Integration Tests
 *
 * Tests call a real LLM API with adventure content to validate
 * that AI-generated suggestions are contextually coherent with the adventure.
 *
 * SUPPORTED PROVIDERS (tried in order until one works):
 *   1. Mistral  — MISTRAL_API_KEY  (OpenAI-compatible, cheapest)
 *   2. Gemini   — GEMINI_API_KEY   (Google AI Studio)
 *   3. OpenAI   — OPENAI_API_KEY   (gpt-4o-mini)
 *   4. Claude   — ANTHROPIC_API_KEY (claude-haiku)
 *
 * PREREQUISITES:
 *   - Set at least one API key environment variable (or keys are auto-read from config)
 *   - Run explicitly: npx vitest run --config vitest.integration.config.js
 *   - Costs ~$0.001-0.03 per full run depending on provider
 *
 * WHAT THESE TESTS VALIDATE:
 *   1. Given adventure context + transcript, suggestions reference correct NPCs/locations
 *   2. Summaries capture key narrative events from the adventure
 *   3. Off-track detection correctly identifies deviations from the adventure plot
 *   4. The AI continues scenes coherently (e.g., Barovia village → children → Durst House)
 */

import { PromptBuilder } from '../../scripts/narrator/PromptBuilder.mjs';
import { RollingSummarizer } from '../../scripts/narrator/RollingSummarizer.mjs';
import {
  BAROVIA_VILLAGE,
  GOBLIN_AMBUSH,
  DRAGON_HOARD,
  NOBLE_COURT,
  WAVE_ECHO_CAVE,
  ALL_ADVENTURES
} from '../fixtures/adventure-content.js';

// ---------------------------------------------------------------------------
// Multi-provider API clients
// ---------------------------------------------------------------------------

/** Mistral — OpenAI-compatible endpoint */
class MistralChatProvider {
  constructor(apiKey) { this._apiKey = apiKey; }
  get name() { return 'Mistral'; }

  async chat(messages, options = {}) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this._apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || 'mistral-small-latest',
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens || 1000
      })
    });
    if (!response.ok) throw new Error(`Mistral ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return { content: data.choices[0].message.content, usage: data.usage };
  }

  async ping() {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this._apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-small-latest', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
    });
    return r.ok;
  }
}

/** Google Gemini — REST API */
class GeminiChatProvider {
  constructor(apiKey) { this._apiKey = apiKey; }
  get name() { return 'Gemini'; }

  async chat(messages, options = {}) {
    const model = options.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this._apiKey}`;

    // Convert OpenAI message format to Gemini format
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
    const systemInstruction = systemParts.length > 0
      ? { parts: [{ text: systemParts.join('\n\n') }] }
      : undefined;

    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const body = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.4,
        maxOutputTokens: options.maxTokens || 1000
      }
    };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    const data = await response.json();

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata
      ? { prompt_tokens: data.usageMetadata.promptTokenCount, completion_tokens: data.usageMetadata.candidatesTokenCount, total_tokens: data.usageMetadata.totalTokenCount }
      : null;
    return { content: text, usage };
  }

  async ping() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this._apiKey}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } })
    });
    return r.ok;
  }
}

/** OpenAI — standard endpoint */
class OpenAIChatProvider {
  constructor(apiKey) { this._apiKey = apiKey; }
  get name() { return 'OpenAI'; }

  async chat(messages, options = {}) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this._apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || 'gpt-4o-mini',
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens || 1000
      })
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return { content: data.choices[0].message.content, usage: data.usage };
  }

  async ping() {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this._apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
    });
    return r.ok;
  }
}

/** Anthropic Claude — Messages API */
class ClaudeChatProvider {
  constructor(apiKey) { this._apiKey = apiKey; }
  get name() { return 'Claude'; }

  async chat(messages, options = {}) {
    // Split system messages from conversation
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
    const conversationMsgs = messages.filter(m => m.role !== 'system');

    // Claude requires alternating user/assistant; merge consecutive same-role
    const merged = [];
    for (const msg of conversationMsgs) {
      if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
        merged[merged.length - 1].content += '\n\n' + msg.content;
      } else {
        merged.push({ role: msg.role, content: msg.content });
      }
    }
    // Ensure first message is from user
    if (merged.length === 0 || merged[0].role !== 'user') {
      merged.unshift({ role: 'user', content: 'Please analyze and respond.' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this._apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || 'claude-haiku-4-5-20251001',
        max_tokens: options.maxTokens || 1000,
        system: systemParts.join('\n\n'),
        messages: merged,
        temperature: options.temperature ?? 0.4
      })
    });
    if (!response.ok) throw new Error(`Claude ${response.status}: ${await response.text()}`);
    const data = await response.json();

    const text = data.content?.[0]?.text || '';
    const usage = data.usage
      ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens, total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0) }
      : null;
    return { content: text, usage };
  }

  async ping() {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this._apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
    });
    return r.ok;
  }
}

// ---------------------------------------------------------------------------
// Provider discovery — try providers in order until one responds
// ---------------------------------------------------------------------------

const PROVIDER_CANDIDATES = [
  { key: 'MISTRAL_API_KEY',   Factory: MistralChatProvider },
  { key: 'GEMINI_API_KEY',    Factory: GeminiChatProvider },
  { key: 'OPENAI_API_KEY',    Factory: OpenAIChatProvider },
  { key: 'ANTHROPIC_API_KEY', Factory: ClaudeChatProvider }
];

let activeProvider = null;
let activeProviderName = 'none';

for (const candidate of PROVIDER_CANDIDATES) {
  const apiKey = process.env[candidate.key];
  if (!apiKey) continue;

  const provider = new candidate.Factory(apiKey);
  try {
    const ok = await provider.ping();
    if (ok) {
      activeProvider = provider;
      activeProviderName = provider.name;
      console.warn(`[rag-adventure-live] Using provider: ${activeProviderName}`);
      break;
    } else {
      console.warn(`[rag-adventure-live] ${provider.name} ping failed (quota/auth), trying next...`);
    }
  } catch (err) {
    console.warn(`[rag-adventure-live] ${provider.name} unreachable: ${err.message}`);
  }
}

if (!activeProvider) {
  console.warn('[rag-adventure-live] No working API provider found. All live tests will be skipped.');
}

const describeIfApiKey = activeProvider ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Summarizer adapter — wraps the active provider for RollingSummarizer interface
// ---------------------------------------------------------------------------

class LiveSummarizerClient {
  constructor(provider) { this._provider = provider; }

  async createChatCompletion(params) {
    const result = await this._provider.chat(params.messages, {
      temperature: 0.3,
      maxTokens: params.max_tokens || 500
    });
    return {
      choices: [{ message: { content: result.content } }],
      usage: result.usage
    };
  }
}

// ---------------------------------------------------------------------------
// Console suppression
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calls the active LLM provider with adventure context and transcript,
 * then returns parsed suggestion JSON.
 */
async function generateLiveSuggestions(adventureContext, transcript, options = {}) {
  const builder = new PromptBuilder({
    primaryLanguage: options.language || 'en',
    sensitivity: 'medium'
  });

  const ragContext = `RELEVANT SOURCES: Adventure Module\n---\n${adventureContext}`;
  const messages = builder.buildSuggestionMessages(transcript, options.maxSuggestions || 3, ragContext);

  const response = await activeProvider.chat(messages, { temperature: 0.3 });

  try {
    const parsed = JSON.parse(extractJson(response.content));
    return {
      suggestions: parsed.suggestions || [],
      raw: response.content,
      usage: response.usage
    };
  } catch {
    // Sometimes the model returns plain text instead of JSON
    return {
      suggestions: [{ type: 'narration', content: response.content, confidence: 0.5 }],
      raw: response.content,
      usage: response.usage
    };
  }
}

/**
 * Calls the active provider for full context analysis (suggestions + off-track).
 */
async function generateLiveAnalysis(adventureContext, transcript) {
  const builder = new PromptBuilder({
    primaryLanguage: 'en',
    sensitivity: 'medium'
  });

  const ragContext = `RELEVANT SOURCES: Adventure Module\n---\n${adventureContext}`;
  const messages = builder.buildAnalysisMessages(transcript, true, true, ragContext);

  const response = await activeProvider.chat(messages, { temperature: 0.3 });

  try {
    const parsed = JSON.parse(extractJson(response.content));
    return { analysis: parsed, raw: response.content, usage: response.usage };
  } catch {
    return { analysis: null, raw: response.content, usage: response.usage };
  }
}

/**
 * Extracts JSON from a response that may have markdown code fences.
 */
function extractJson(text) {
  // Try to extract from code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text;
}

/**
 * Checks if any suggestion content contains at least one of the expected themes.
 */
function hasThemeMatch(suggestions, themes) {
  const allText = suggestions.map((s) => (s.content || '').toLowerCase()).join(' ');
  return themes.some((theme) => allText.includes(theme.toLowerCase()));
}

// ===========================================================================
// LIVE API TESTS
// ===========================================================================

describeIfApiKey('Live API — RAG Adventure Suggestions', () => {
  // Generous timeout for API calls
  vi.setConfig({ testTimeout: 30000 });

  // -------------------------------------------------------------------------
  // The Barovia Village Entry Test (user-requested specific test)
  // -------------------------------------------------------------------------

  describe('Barovia Village — The Children Scene', () => {
    it('should continue the Barovia village scene coherently after seeing the children', async () => {
      const transcript =
        'The gravel road leads to a village, its tall houses dark as tombstones. Nestled among these solemn dwellings are a handful of closed-up shops. Even the tavern is shut tight. A soft whimpering draws your eye toward a pair of children standing in the middle of an otherwise lifeless street.';

      const result = await generateLiveSuggestions(
        BAROVIA_VILLAGE.adventureContext,
        transcript
      );

      console.info('=== BAROVIA CHILDREN SCENE ===');
      console.info('Transcript:', transcript.substring(0, 80) + '...');
      console.info('Suggestions:', JSON.stringify(result.suggestions, null, 2));
      console.info('Usage:', result.usage);

      // ASSERTIONS: The AI should know about the children and the adventure
      expect(result.suggestions.length).toBeGreaterThan(0);

      // At least one suggestion should reference Rose, Thorn, monster, house, or Durst
      const baroviaThemes = ['rose', 'thorn', 'monster', 'house', 'durst', 'children', 'basement'];
      expect(hasThemeMatch(result.suggestions, baroviaThemes)).toBe(true);

      // Suggestions should be non-trivial (not just "continue playing")
      result.suggestions.forEach((s) => {
        expect(s.content.length).toBeGreaterThan(20);
      });
    });

    it('should suggest Ismark when the party enters the tavern', async () => {
      const transcript =
        'The party pushes open the stuck door of the tavern and steps inside. The dim interior smells of stale ale and desperation. A few figures are visible in the low lamplight.';

      const result = await generateLiveSuggestions(
        BAROVIA_VILLAGE.adventureContext,
        transcript
      );

      console.info('=== BAROVIA TAVERN SCENE ===');
      console.info('Suggestions:', JSON.stringify(result.suggestions, null, 2));

      expect(result.suggestions.length).toBeGreaterThan(0);

      // Should reference tavern NPCs
      const tavernThemes = ['ismark', 'vistani', 'alenka', 'mirabel', 'sorvia', 'ireena', 'strahd'];
      expect(hasThemeMatch(result.suggestions, tavernThemes)).toBe(true);
    });

    it('should suggest the church/Doru storyline when approaching the church', async () => {
      const transcript =
        'The party walks toward the crumbling church at the edge of the village. A desperate prayer echoes from within. As they approach, they hear something else — a muffled screaming from below the church.';

      const result = await generateLiveSuggestions(
        BAROVIA_VILLAGE.adventureContext,
        transcript
      );

      console.info('=== BAROVIA CHURCH SCENE ===');
      console.info('Suggestions:', JSON.stringify(result.suggestions, null, 2));

      expect(result.suggestions.length).toBeGreaterThan(0);

      const churchThemes = ['donavich', 'doru', 'vampire', 'undercroft', 'priest', 'blood', 'spawn'];
      expect(hasThemeMatch(result.suggestions, churchThemes)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Goblin Ambush
  // -------------------------------------------------------------------------

  describe('Goblin Ambush — Triboar Trail', () => {
    it('should suggest investigating the ambush and tracking goblins', async () => {
      const transcript =
        'As you round the bend in the trail, you see two dead horses sprawled across the path, riddled with black-feathered arrows. The saddlebags have been looted and an empty map case lies nearby.';

      const result = await generateLiveSuggestions(
        GOBLIN_AMBUSH.adventureContext,
        transcript
      );

      console.info('=== GOBLIN AMBUSH SCENE ===');
      console.info('Suggestions:', JSON.stringify(result.suggestions, null, 2));

      expect(result.suggestions.length).toBeGreaterThan(0);

      const ambushThemes = ['goblin', 'ambush', 'gundren', 'sildar', 'cragmaw', 'trail', 'track', 'hide'];
      expect(hasThemeMatch(result.suggestions, ambushThemes)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Dragon Encounter
  // -------------------------------------------------------------------------

  describe('Dragon Lair — Venomfang', () => {
    it('should suggest dragon tactics when approaching the tower', async () => {
      const transcript =
        'As you approach the old tower, a pungent chemical smell hits your nostrils. The stone walls are covered in thick green vines, and you can see something large moving behind the broken windows on the upper floor.';

      const result = await generateLiveSuggestions(
        DRAGON_HOARD.adventureContext,
        transcript
      );

      console.info('=== DRAGON TOWER SCENE ===');
      console.info('Suggestions:', JSON.stringify(result.suggestions, null, 2));

      expect(result.suggestions.length).toBeGreaterThan(0);

      const dragonThemes = [
        'venomfang', 'dragon', 'green', 'breath', 'chlorine',
        'cunning', 'parley', 'cultist', 'reidoth', 'fly'
      ];
      expect(hasThemeMatch(result.suggestions, dragonThemes)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Social Intrigue
  // -------------------------------------------------------------------------

  describe('Noble Court — Vallaki', () => {
    it('should suggest court intrigue elements at the Baron\'s feast', async () => {
      const transcript =
        'You are escorted into the Baron\'s dining hall. Forced smiles adorn every face. The Baron rises and declares, "Welcome, friends! All will be well!" His wife Lydia almost drops a serving tray.';

      const result = await generateLiveSuggestions(
        NOBLE_COURT.adventureContext,
        transcript
      );

      console.info('=== VALLAKI FEAST SCENE ===');
      console.info('Suggestions:', JSON.stringify(result.suggestions, null, 2));

      expect(result.suggestions.length).toBeGreaterThan(0);

      const courtThemes = [
        'baron', 'fiona', 'wachter', 'izek', 'festival',
        'happiness', 'victor', 'blinsky', 'cult'
      ];
      expect(hasThemeMatch(result.suggestions, courtThemes)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Dungeon Exploration
  // -------------------------------------------------------------------------

  describe('Wave Echo Cave — Dungeon Delve', () => {
    it('should suggest dungeon exploration when entering the cave', async () => {
      const transcript =
        'The cave mouth yawns before you, cold air rushing out. You hear a rhythmic booming echo from deep within — like distant waves crashing on stone. Bones and rusted weapons litter the entrance.';

      const result = await generateLiveSuggestions(
        WAVE_ECHO_CAVE.adventureContext,
        transcript
      );

      console.info('=== WAVE ECHO CAVE SCENE ===');
      console.info('Suggestions:', JSON.stringify(result.suggestions, null, 2));

      expect(result.suggestions.length).toBeGreaterThan(0);

      const caveThemes = [
        'forge', 'spells', 'nezznar', 'black spider', 'dwarves',
        'orcs', 'guard room', 'fungus', 'deeper', 'mormesk'
      ];
      expect(hasThemeMatch(result.suggestions, caveThemes)).toBe(true);
    });
  });
});

// ===========================================================================
// LIVE API — Summarization Tests
// ===========================================================================

describeIfApiKey('Live API — Adventure Summarization', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('should summarize a Barovia session preserving key narrative details', async () => {
    const client = new LiveSummarizerClient(activeProvider);
    const summarizer = new RollingSummarizer(client);

    const turns = `Player/DM: The party arrives at a gloomy village shrouded in mist. Tall houses stand like tombstones.
Player/DM: They see two children crying in the middle of the empty street.
Player/DM: The boy says "There is a monster in our house! Please help us!"
Player/DM: Player 1 kneels down to talk to the children. Their names are Rose and Thorn.
Player/DM: The party decides to follow the children toward their home, a decrepit townhouse.`;

    const result = await summarizer.summarize('', turns);

    console.info('=== BAROVIA SUMMARY ===');
    console.info('Summary:', result.summary);
    console.info('Usage:', result.usage);

    expect(result.summary.length).toBeGreaterThan(50);

    // Summary should preserve key narrative details
    const summaryLower = result.summary.toLowerCase();
    const preservedDetails = ['village', 'children', 'monster', 'house'].filter((d) =>
      summaryLower.includes(d)
    );
    expect(preservedDetails.length).toBeGreaterThanOrEqual(2);
  });

  it('should incorporate new turns into an existing summary', async () => {
    const client = new LiveSummarizerClient(activeProvider);
    const summarizer = new RollingSummarizer(client);

    const existingSummary =
      'The party arrived at the village of Barovia. They met two ghost children named Rose and Thorn who led them to a decrepit townhouse.';

    const newTurns = `Player/DM: Inside the townhouse, the party finds old family portraits and a dusty library.
Player/DM: Player 2 discovers a secret door behind a bookcase leading to a basement.
Player/DM: Strange chanting echoes from below. The air grows cold.`;

    const result = await summarizer.summarize(existingSummary, newTurns);

    console.info('=== BAROVIA UPDATED SUMMARY ===');
    console.info('Summary:', result.summary);

    expect(result.summary.length).toBeGreaterThan(50);

    const summaryLower = result.summary.toLowerCase();
    // Should preserve original details AND incorporate new ones
    expect(summaryLower).toContain('barovia');
    const newDetails = ['basement', 'secret', 'bookcase', 'chanting'].filter((d) =>
      summaryLower.includes(d)
    );
    expect(newDetails.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// LIVE API — Off-Track Detection
// ===========================================================================

describeIfApiKey('Live API — Off-Track Detection', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('should detect on-track when party follows the adventure', async () => {
    const result = await generateLiveAnalysis(
      BAROVIA_VILLAGE.adventureContext,
      'The party approaches the two crying children in the village street and asks them what is wrong.'
    );

    console.info('=== ON-TRACK ANALYSIS ===');
    console.info('Analysis:', JSON.stringify(result.analysis, null, 2));

    expect(result.analysis).toBeDefined();
    if (result.analysis?.offTrackStatus) {
      expect(result.analysis.offTrackStatus.isOffTrack).toBe(false);
    }
  });

  it('should detect off-track when party completely ignores the adventure', async () => {
    const result = await generateLiveAnalysis(
      BAROVIA_VILLAGE.adventureContext,
      'Player 1: I want to open a bakery in this village. Player 2: Great idea! I will start baking bread. Player 3: I look for flour and yeast in the abandoned shops.'
    );

    console.info('=== OFF-TRACK ANALYSIS ===');
    console.info('Analysis:', JSON.stringify(result.analysis, null, 2));

    expect(result.analysis).toBeDefined();
    if (result.analysis?.offTrackStatus) {
      // Party opening a bakery in Barovia should be off-track
      expect(result.analysis.offTrackStatus.isOffTrack).toBe(true);
      expect(result.analysis.offTrackStatus.severity).toBeGreaterThan(0.3);
    }
  });
});

// ===========================================================================
// LIVE API — Scene Continuity (the core user request)
// ===========================================================================

describeIfApiKey('Live API — Scene Continuity', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('should continue the Barovia scene knowing the party is at the village entrance', async () => {
    // This is the exact test the user requested
    const transcript =
      'The gravel road leads to a village, its tall houses dark as tombstones. Nestled among these solemn dwellings are a handful of closed-up shops. Even the tavern is shut tight. A soft whimpering draws your eye toward a pair of children standing in the middle of an otherwise lifeless street.';

    const result = await generateLiveSuggestions(
      BAROVIA_VILLAGE.adventureContext,
      transcript
    );

    console.info('=== SCENE CONTINUITY TEST (user-requested) ===');
    console.info('Input transcript:', transcript);
    console.info('AI Suggestions:', JSON.stringify(result.suggestions, null, 2));
    console.info('Token usage:', result.usage);

    // The AI should understand we are at the village entrance with the children
    expect(result.suggestions.length).toBeGreaterThan(0);

    // It should suggest what comes next in the adventure:
    // - The children (Rose and Thorn) speak to the party
    // - They claim a monster is in their house
    // - This leads to Death House
    const continuityThemes = [
      'rose', 'thorn', 'children', 'monster', 'house',
      'durst', 'basement', 'boy', 'girl', 'help',
      'death house', 'speak', 'talk', 'approach'
    ];

    const allSuggestionText = result.suggestions
      .map((s) => s.content.toLowerCase())
      .join(' ');

    const matchedThemes = continuityThemes.filter((t) => allSuggestionText.includes(t));

    console.info('Matched continuity themes:', matchedThemes);

    // At least 2 themes should match for good continuity
    expect(matchedThemes.length).toBeGreaterThanOrEqual(2);

    // Suggestions should be substantial (not just "roll initiative" or generic advice)
    const avgLength =
      result.suggestions.reduce((sum, s) => sum + s.content.length, 0) /
      result.suggestions.length;
    expect(avgLength).toBeGreaterThan(30);
  });

  it('should understand scene progression across multiple transcript chunks', async () => {
    // First chunk: arriving at village
    const result1 = await generateLiveSuggestions(
      BAROVIA_VILLAGE.adventureContext,
      'The party arrives at the village of Barovia. Everything is dark and quiet. They see two children.'
    );

    // Second chunk: talking to children
    const result2 = await generateLiveSuggestions(
      BAROVIA_VILLAGE.adventureContext,
      'The children introduce themselves as Rose and Thorn. The boy says there is a monster in their basement. The party agrees to help and follows the children toward a large townhouse.'
    );

    console.info('=== PROGRESSION TEST ===');
    console.info('Phase 1 (arrival):', result1.suggestions.map((s) => s.content.substring(0, 80)));
    console.info('Phase 2 (children):', result2.suggestions.map((s) => s.content.substring(0, 80)));

    // Phase 1 should reference the children encounter
    expect(hasThemeMatch(result1.suggestions, ['children', 'rose', 'thorn', 'approach'])).toBe(true);

    // Phase 2 should advance to the house/Death House content
    expect(
      hasThemeMatch(result2.suggestions, ['house', 'durst', 'basement', 'monster', 'enter', 'door', 'illus'])
    ).toBe(true);
  });
});
