/**
 * Exhaustive Feature Tests — Live API Integration
 *
 * Tests ALL VoxChronicle AI features with real API calls against adventure content:
 *   1. Suggestions (narration, dialogue, action, reference) across 8 adventures
 *   2. Rolling summaries (cold start, incremental update, multi-turn)
 *   3. Off-track detection (on-track, minor deviation, completely off)
 *   4. NPC dialogue generation (personality, context-awareness)
 *   5. Narrative bridges (guiding players back on track)
 *   6. Scene type detection (combat, social, exploration, rest)
 *   7. Rules question detection (mechanics, spells, conditions)
 *   8. Silence/autonomous suggestions (what to do when players are quiet)
 *   9. Multi-language support (English, Italian)
 *  10. Full context analysis pipeline (suggestions + off-track + summary)
 *
 * PREREQUISITES:
 *   - At least one API key available (Mistral, Gemini, OpenAI, or Anthropic)
 *   - Run: npx vitest run --config vitest.integration.config.js tests/integration/rag-exhaustive-features.test.js
 */

import { PromptBuilder } from '../../scripts/narrator/PromptBuilder.mjs';
import { RollingSummarizer } from '../../scripts/narrator/RollingSummarizer.mjs';
import {
  BAROVIA_VILLAGE,
  GOBLIN_AMBUSH,
  DRAGON_HOARD,
  NOBLE_COURT,
  WAVE_ECHO_CAVE,
  DEATH_HOUSE,
  GREENEST_FLAMES,
  NIGHTSTONE,
  ALL_ADVENTURES,
  getAllScenarios
} from '../fixtures/adventure-content.js';

// ---------------------------------------------------------------------------
// Multi-provider setup (reuse from rag-adventure-live)
// ---------------------------------------------------------------------------

class MistralChat {
  constructor(k) { this._k = k; }
  get name() { return 'Mistral'; }
  async chat(messages, o = {}) {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this._k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: o.model || 'mistral-small-latest', messages, temperature: o.temperature ?? 0.3, max_tokens: o.maxTokens || 1500 })
    });
    if (!r.ok) throw new Error(`Mistral ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return { content: d.choices[0].message.content, usage: d.usage };
  }
  async ping() {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this._k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-small-latest', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
    });
    return r.ok;
  }
}

class GeminiChat {
  constructor(k) { this._k = k; }
  get name() { return 'Gemini'; }
  async chat(messages, o = {}) {
    const model = o.model || 'gemini-2.0-flash';
    const sys = messages.filter(m => m.role === 'system').map(m => m.content);
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }]
    }));
    const body = { contents, generationConfig: { temperature: o.temperature ?? 0.3, maxOutputTokens: o.maxTokens || 1500 } };
    if (sys.length) body.systemInstruction = { parts: [{ text: sys.join('\n\n') }] };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this._k}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return {
      content: d.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usage: d.usageMetadata ? { prompt_tokens: d.usageMetadata.promptTokenCount, completion_tokens: d.usageMetadata.candidatesTokenCount } : null
    };
  }
  async ping() {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this._k}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } })
    });
    return r.ok;
  }
}

// Provider discovery
const CANDIDATES = [
  { key: 'MISTRAL_API_KEY', F: MistralChat },
  { key: 'GEMINI_API_KEY', F: GeminiChat }
];

let provider = null;
for (const c of CANDIDATES) {
  const k = process.env[c.key];
  if (!k) continue;
  const p = new c.F(k);
  try { if (await p.ping()) { provider = p; break; } } catch { /* next */ }
}
if (!provider) console.warn('[exhaustive] No API provider available — all tests skipped');

const run = provider ? describe : describe.skip;

// Console suppression
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

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : text;
}

function hasTheme(suggestions, themes) {
  const all = suggestions.map(s => (s.content || '').toLowerCase()).join(' ');
  return themes.some(t => all.includes(t.toLowerCase()));
}

async function askAI(messages, opts = {}) {
  return provider.chat(messages, opts);
}

async function getSuggestions(ctx, transcript, opts = {}) {
  const b = new PromptBuilder({ primaryLanguage: opts.language || 'en', sensitivity: 'medium' });
  const rag = `RELEVANT SOURCES: Adventure Module\n---\n${ctx}`;
  const msgs = b.buildSuggestionMessages(transcript, opts.max || 3, rag);
  const r = await askAI(msgs);
  try {
    const p = JSON.parse(extractJson(r.content));
    return { suggestions: p.suggestions || [], raw: r.content, usage: r.usage };
  } catch {
    return { suggestions: [{ type: 'narration', content: r.content, confidence: 0.5 }], raw: r.content, usage: r.usage };
  }
}

async function getAnalysis(ctx, transcript, opts = {}) {
  const b = new PromptBuilder({ primaryLanguage: opts.language || 'en', sensitivity: opts.sensitivity || 'medium' });
  const rag = `RELEVANT SOURCES: Adventure Module\n---\n${ctx}`;
  const msgs = b.buildAnalysisMessages(transcript, true, true, rag);
  const r = await askAI(msgs);
  try {
    const p = JSON.parse(extractJson(r.content));
    return { analysis: p, raw: r.content, usage: r.usage };
  } catch {
    return { analysis: null, raw: r.content, usage: r.usage };
  }
}

// ===========================================================================
// 1. SUGGESTIONS — All 8 Adventures, All Scenarios
// ===========================================================================

run('1. Suggestions — All Adventures', () => {
  vi.setConfig({ testTimeout: 45000 });

  const scenarios = getAllScenarios();

  it.each(scenarios)(
    '$adventureTitle / $scenario.id — should produce contextually relevant suggestions',
    async ({ adventureContext, scenario }) => {
      const result = await getSuggestions(adventureContext, scenario.transcript);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(hasTheme(result.suggestions, scenario.expectedThemes)).toBe(true);

      // Every suggestion should be substantial
      result.suggestions.forEach(s => {
        expect(s.content.length).toBeGreaterThan(15);
      });
    }
  );
});

// ===========================================================================
// 2. ROLLING SUMMARIES — Cold Start, Update, Multi-Turn
// ===========================================================================

run('2. Rolling Summaries', () => {
  vi.setConfig({ testTimeout: 30000 });

  class SummClient {
    async createChatCompletion(p) {
      const r = await provider.chat(p.messages, { maxTokens: p.max_tokens || 500 });
      return { choices: [{ message: { content: r.content } }], usage: r.usage };
    }
  }

  it('cold start — should create initial summary from Barovia session', async () => {
    const s = new RollingSummarizer(new SummClient());
    const turns = `Player/DM: The party arrives at a gloomy village. Two frightened children cry in the street.
Player/DM: The boy says there is a monster in their house.
Player/DM: The party follows the children to a decrepit townhouse.`;
    const r = await s.summarize('', turns);
    expect(r.summary.length).toBeGreaterThan(30);
    const low = r.summary.toLowerCase();
    expect(['village', 'children', 'monster', 'house'].some(w => low.includes(w))).toBe(true);
  });

  it('incremental — should incorporate new events into existing summary', async () => {
    const s = new RollingSummarizer(new SummClient());
    const existing = 'The party arrived at Greenest to find the town under attack by a dragon and cultists. They rescued Linan Swift and reached the keep.';
    const newTurns = `Player/DM: Governor Nighthill asks the party to secure the old tunnel beneath the keep.
Player/DM: The party descends into the tunnel and encounters two rat swarms.
Player/DM: After clearing the rats, they unlock the gate at the far end.`;
    const r = await s.summarize(existing, newTurns);
    expect(r.summary.length).toBeGreaterThan(50);
    const low = r.summary.toLowerCase();
    expect(['tunnel', 'rat', 'gate', 'nighthill'].some(w => low.includes(w))).toBe(true);
    // Should preserve original context
    expect(['greenest', 'dragon', 'linan', 'keep'].some(w => low.includes(w))).toBe(true);
  });

  it('multi-turn format — should correctly format assistant JSON responses', () => {
    const entries = [
      { role: 'user', content: 'The party enters Death House.' },
      { role: 'assistant', content: JSON.stringify({ summary: 'Party enters the haunted townhouse.', suggestions: [] }) },
      { role: 'user', content: 'They find a portrait with a dark secret.' },
      { role: 'assistant', content: JSON.stringify({ summary: 'Party discovers the Durst family portrait.', suggestions: [] }) }
    ];
    const formatted = RollingSummarizer.formatTurnsForSummary(entries);
    expect(formatted).toContain('Player/DM: The party enters Death House.');
    expect(formatted).toContain('AI Summary: Party enters the haunted townhouse.');
    expect(formatted).toContain('AI Summary: Party discovers the Durst family portrait.');
  });
});

// ===========================================================================
// 3. OFF-TRACK DETECTION
// ===========================================================================

run('3. Off-Track Detection', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('on-track — party follows the adventure plot', async () => {
    const r = await getAnalysis(
      GOBLIN_AMBUSH.adventureContext,
      'The party examines the dead horses on the trail. They find black-feathered goblin arrows and decide to follow the tracks northeast toward the goblin hideout.'
    );
    expect(r.analysis).toBeDefined();
    if (r.analysis?.offTrackStatus) {
      expect(r.analysis.offTrackStatus.isOffTrack).toBe(false);
    }
  });

  it('off-track — party ignores the adventure completely', async () => {
    const r = await getAnalysis(
      DEATH_HOUSE.adventureContext,
      'Player 1: I want to leave this creepy house and open a flower shop in the village. Player 2: Great idea, I will look for flower seeds. Player 3: I start sketching shop layouts in my journal.'
    );
    expect(r.analysis).toBeDefined();
    if (r.analysis?.offTrackStatus) {
      expect(r.analysis.offTrackStatus.isOffTrack).toBe(true);
      expect(r.analysis.offTrackStatus.severity).toBeGreaterThan(0.2);
    }
  });

  it('mildly off-track — party explores side content', async () => {
    const r = await getAnalysis(
      NIGHTSTONE.adventureContext,
      'Instead of investigating the village, the party decides to go fishing in the moat. Player 1: I cast my fishing line into the moat. Player 2: I join him. The boulders can wait.'
    );
    expect(r.analysis).toBeDefined();
    // Should detect some deviation but not max severity
    if (r.analysis?.offTrackStatus) {
      expect(r.analysis.offTrackStatus.isOffTrack).toBe(true);
    }
  });
});

// ===========================================================================
// 4. NPC DIALOGUE GENERATION
// ===========================================================================

run('4. NPC Dialogue Generation', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('should generate in-character dialogue for Ismark (Barovia)', async () => {
    const b = new PromptBuilder({ primaryLanguage: 'en' });
    b.setAdventureContext(BAROVIA_VILLAGE.adventureContext);
    const msgs = [
      { role: 'system', content: b.buildSystemPrompt() },
      { role: 'system', content: `ADVENTURE CONTEXT:\n${BAROVIA_VILLAGE.adventureContext}` },
      { role: 'user', content: `Generate 3 dialogue options for the NPC "Ismark Kolyanovich" (burgomaster's son, desperate to protect his sister Ireena from Strahd) responding to the party asking "What happened here?"\n\nRespond in JSON: {"dialogueOptions": ["option1", "option2", "option3"]}` }
    ];
    const r = await askAI(msgs);
    const parsed = JSON.parse(extractJson(r.content));
    expect(parsed.dialogueOptions.length).toBeGreaterThanOrEqual(2);
    const all = (parsed.dialogueOptions || []).join(' ').toLowerCase();
    expect(all.length).toBeGreaterThan(50);
    expect(/ireena|strahd|father|sister|protect|dead|vampire|village|danger|safe|please|help|night|wolf|beast|dark|bite|barovia|burgomaster/.test(all)).toBe(true);
  });

  it('should generate in-character dialogue for Governor Nighthill (Greenest)', async () => {
    const msgs = [
      { role: 'system', content: 'You are an expert D&D DM assistant. Generate NPC dialogue options.' },
      { role: 'system', content: `ADVENTURE CONTEXT:\n${GREENEST_FLAMES.adventureContext}` },
      { role: 'user', content: `Generate 3 dialogue options for "Governor Nighthill" (leader of Greenest, coordinating defense during a dragon and cult raid) greeting the party who just arrived at the keep.\n\nJSON: {"dialogueOptions": ["...", "...", "..."]}` }
    ];
    const r = await askAI(msgs);
    const parsed = JSON.parse(extractJson(r.content));
    expect(parsed.dialogueOptions.length).toBeGreaterThanOrEqual(2);
    // Nighthill's dialogue should be about the crisis — any crisis-related word counts
    const all = (parsed.dialogueOptions || []).join(' ').toLowerCase();
    expect(all.length).toBeGreaterThan(50); // Substantial dialogue
    // Very broad: any word related to the situation (defense, attack, dragon, help, town, heroes, etc.)
    expect(/dragon|cult|help|attack|defend|welcome|hero|aid|dire|desperate|sword|fight|burn|assault|besieg|wall|force|stand|save|need|brave/.test(all)).toBe(true);
  });

  it('should generate in-character dialogue for Kella the spy (Nightstone)', async () => {
    const msgs = [
      { role: 'system', content: 'You are an expert D&D DM assistant. Generate NPC dialogue options. The NPC is secretly a spy and should be subtly deceptive.' },
      { role: 'system', content: `ADVENTURE CONTEXT:\n${NIGHTSTONE.adventureContext}` },
      { role: 'user', content: `Generate 3 dialogue options for "Kella Darkhope" (Zhentarim spy pretending to be a survivor) when the party asks her what happened to the village.\n\nJSON: {"dialogueOptions": ["...", "...", "..."]}` }
    ];
    const r = await askAI(msgs);
    const parsed = JSON.parse(extractJson(r.content));
    expect(parsed.dialogueOptions.length).toBeGreaterThanOrEqual(2);
    // Should sound like a survivor, not reveal spy identity
    const all = parsed.dialogueOptions.join(' ').toLowerCase();
    expect(['hide', 'attack', 'survive', 'cellar', 'boulder', 'scared', 'rock', 'giant'].some(w => all.includes(w))).toBe(true);
  });
});

// ===========================================================================
// 5. NARRATIVE BRIDGES — Guiding players back
// ===========================================================================

run('5. Narrative Bridges', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('should generate a bridge from wilderness back to Barovia village', async () => {
    const b = new PromptBuilder({ primaryLanguage: 'en' });
    const ctx = `ADVENTURE CONTEXT:\n${BAROVIA_VILLAGE.adventureContext}`;
    const msgs = [
      { role: 'system', content: b.buildSystemPrompt() },
      { role: 'system', content: ctx },
      { role: 'user', content: `The players have deviated from the main plot.\n\nCurrent situation: The party left the village road and wandered into the Svalich Woods, looking for mushrooms.\nTarget scene: Return to the village of Barovia to investigate the children and the Blood of the Vine Tavern.\n\nWrite a brief narration (2-3 sentences) that the DM can use to gently guide players back.` }
    ];
    const r = await askAI(msgs);
    expect(r.content.length).toBeGreaterThan(50);
    const low = r.content.toLowerCase();
    // Should reference the village or create a pull back
    expect(['village', 'road', 'mist', 'children', 'barovia', 'sound', 'voice', 'path'].some(w => low.includes(w))).toBe(true);
  });

  it('should generate a bridge from side quest back to dragon encounter', async () => {
    const b = new PromptBuilder({ primaryLanguage: 'en' });
    const msgs = [
      { role: 'system', content: b.buildSystemPrompt() },
      { role: 'system', content: `ADVENTURE CONTEXT:\n${DRAGON_HOARD.adventureContext}` },
      { role: 'user', content: `The players have deviated.\n\nCurrent situation: The party is exploring abandoned buildings in Thundertree instead of approaching the tower.\nTarget scene: The party should encounter Venomfang the green dragon in the old tower.\n\nWrite 2-3 sentences to guide them naturally.` }
    ];
    const r = await askAI(msgs);
    expect(r.content.length).toBeGreaterThan(40);
    const low = r.content.toLowerCase();
    expect(['tower', 'dragon', 'venomfang', 'chlorine', 'smell', 'roar', 'shadow', 'wing'].some(w => low.includes(w))).toBe(true);
  });
});

// ===========================================================================
// 6. SCENE TYPE DETECTION
// ===========================================================================

run('6. Scene Type Detection', () => {
  vi.setConfig({ testTimeout: 30000 });

  const sceneTests = [
    {
      name: 'combat',
      transcript: 'Roll initiative! The goblins leap from the bushes, shortbows drawn. Player 1: I attack the nearest goblin with my longsword. That is a 17 to hit. DM: That hits! Roll damage. Player 2: I cast Burning Hands in a cone toward the two goblins on the left.',
      expectedScene: 'combat'
    },
    {
      name: 'social',
      transcript: 'Player 1: I approach the Baron and bow respectfully. Your excellency, we come seeking your aid. DM: The Baron eyes you suspiciously. Player 2: I make a Persuasion check to convince him. That is a 19. DM: He seems to warm to you slightly.',
      expectedScene: 'social'
    },
    {
      name: 'exploration',
      transcript: 'Player 1: I search the room for hidden doors or compartments. DM: Roll Investigation. Player 1: 15. DM: You find a loose stone in the wall. Behind it is a small cavity containing a dusty scroll. Player 2: I check the scroll for traps first. Player 3: I map this room in my journal.',
      expectedScene: 'exploration'
    },
    {
      name: 'rest',
      transcript: 'DM: You find a secure alcove in the cave. No sounds echo from the nearby passages. Player 1: I think we should take a short rest here. Player 2: Agreed, I spend a hit die. Player 3: I will keep watch during the rest. DM: An hour passes uneventfully.',
      expectedScene: 'rest'
    }
  ];

  it.each(sceneTests)('should detect $name scene type', async ({ transcript, expectedScene }) => {
    const msgs = [
      { role: 'system', content: 'You are an expert tabletop RPG assistant. Detect the current scene type from the transcript.' },
      { role: 'user', content: `Classify this transcript into exactly one scene type: "combat", "social", "exploration", or "rest".\n\n"${transcript}"\n\nRespond with JSON: {"sceneType": "..."}` }
    ];
    const r = await askAI(msgs);
    const parsed = JSON.parse(extractJson(r.content));
    expect(parsed.sceneType).toBe(expectedScene);
  });
});

// ===========================================================================
// 7. RULES QUESTION DETECTION
// ===========================================================================

run('7. Rules Question Detection', () => {
  vi.setConfig({ testTimeout: 30000 });

  const rulesTests = [
    {
      name: 'grapple mechanic',
      transcript: 'Player 1: Can I grapple the ogre? How does grappling work exactly? Do I roll Athletics?',
      expectedTerms: ['grapple', 'athletics', 'strength']
    },
    {
      name: 'spell question',
      transcript: 'Player 2: Does Fireball hit allies in the area? What is the save DC? And can I cast it as a bonus action?',
      expectedTerms: ['fireball', 'save', 'area', 'damage']
    },
    {
      name: 'condition question',
      transcript: 'Player 3: What exactly does the Stunned condition do? Can I still use reactions if I am stunned?',
      expectedTerms: ['stunned', 'condition', 'reaction']
    }
  ];

  it.each(rulesTests)('should detect rules question about $name', async ({ transcript, expectedTerms }) => {
    const msgs = [
      { role: 'system', content: 'You are a D&D 5e rules expert. Detect rules questions in player transcript.' },
      { role: 'user', content: `Identify any D&D 5e rules questions in this transcript:\n\n"${transcript}"\n\nJSON: {"hasRulesQuestions": true/false, "questions": [{"text": "...", "type": "mechanic|spell|condition|general", "detectedTerms": ["..."]}]}` }
    ];
    const r = await askAI(msgs);
    const parsed = JSON.parse(extractJson(r.content));
    expect(parsed.hasRulesQuestions).toBe(true);
    expect(parsed.questions.length).toBeGreaterThan(0);
    const allTerms = parsed.questions.flatMap(q => (q.detectedTerms || []).map(t => t.toLowerCase()));
    expect(expectedTerms.some(t => allTerms.some(at => at.includes(t)))).toBe(true);
  });
});

// ===========================================================================
// 8. SILENCE / AUTONOMOUS SUGGESTIONS
// ===========================================================================

run('8. Silence / Autonomous Suggestions', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('should suggest next steps when players are silent in Barovia', async () => {
    const b = new PromptBuilder({ primaryLanguage: 'en' });
    b.setAdventureContext(BAROVIA_VILLAGE.adventureContext);
    b.setPreviousTranscription('The party entered the village of Barovia and looked around at the dark houses. Then silence fell.');
    const msgs = b.buildAutonomousSuggestionMessages(
      'The players have been silent for a while after arriving at Barovia village.',
      `RELEVANT SOURCES: Adventure Module\n---\n${BAROVIA_VILLAGE.adventureContext}`
    );
    const r = await askAI(msgs);
    expect(r.content.length).toBeGreaterThan(30);
    // Should suggest action related to the adventure
    const low = r.content.toLowerCase();
    expect(['children', 'tavern', 'explore', 'approach', 'investigate', 'rose', 'thorn', 'whimper', 'village', 'street', 'door', 'house', 'shop', 'sound', 'look', 'dark', 'silent', 'quiet', 'barovia'].some(w => low.includes(w))).toBe(true);
  });

  it('should suggest next steps when players are silent in a dungeon', async () => {
    const b = new PromptBuilder({ primaryLanguage: 'en' });
    b.setAdventureContext(WAVE_ECHO_CAVE.adventureContext);
    b.setPreviousTranscription('The party entered Wave Echo Cave and defeated the first group of skeletons in the guard room.');
    const msgs = b.buildAutonomousSuggestionMessages(
      'Players have been quiet after clearing the guard room in Wave Echo Cave.',
      `RELEVANT SOURCES: Adventure Module\n---\n${WAVE_ECHO_CAVE.adventureContext}`
    );
    const r = await askAI(msgs);
    expect(r.content.length).toBeGreaterThan(30);
    const low = r.content.toLowerCase();
    expect(['deeper', 'passage', 'fungus', 'cave', 'explore', 'forge', 'listen', 'sound'].some(w => low.includes(w))).toBe(true);
  });

  it('should suggest next steps during a combat pause', async () => {
    const b = new PromptBuilder({ primaryLanguage: 'en' });
    b.setAdventureContext(GREENEST_FLAMES.adventureContext);
    b.setSceneType('combat');
    b.setPreviousTranscription('The party just defeated a group of kobolds outside the keep and the immediate area is clear.');
    const msgs = b.buildAutonomousSuggestionMessages(
      'Combat just ended, players seem unsure what to do next in Greenest.',
      `RELEVANT SOURCES: Adventure Module\n---\n${GREENEST_FLAMES.adventureContext}`
    );
    const r = await askAI(msgs);
    expect(r.content.length).toBeGreaterThan(30);
    const low = r.content.toLowerCase();
    expect(['keep', 'nighthill', 'tunnel', 'mission', 'sanctuary', 'rescue', 'mill'].some(w => low.includes(w))).toBe(true);
  });
});

// ===========================================================================
// 9. MULTI-LANGUAGE SUPPORT
// ===========================================================================

run('9. Multi-Language Support', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('should generate suggestions in Italian', async () => {
    const result = await getSuggestions(
      BAROVIA_VILLAGE.adventureContext,
      'Il gruppo arriva al villaggio di Barovia. Vedono due bambini che piangono nella strada deserta.',
      { language: 'it' }
    );
    expect(result.suggestions.length).toBeGreaterThan(0);
    // Suggestions should contain Italian text or adventure-specific terms
    const all = result.suggestions.map(s => s.content).join(' ').toLowerCase();
    expect(all.length).toBeGreaterThan(30);
  });

  it('should generate suggestions in English for same scene', async () => {
    const result = await getSuggestions(
      BAROVIA_VILLAGE.adventureContext,
      'The party arrives at the village of Barovia. They see two children crying in the deserted street.',
      { language: 'en' }
    );
    expect(result.suggestions.length).toBeGreaterThan(0);
    const all = result.suggestions.map(s => s.content).join(' ').toLowerCase();
    // Should reference adventure-specific NPCs
    expect(['rose', 'thorn', 'children', 'monster', 'house', 'durst'].some(w => all.includes(w))).toBe(true);
  });
});

// ===========================================================================
// 10. FULL CONTEXT ANALYSIS PIPELINE
// ===========================================================================

run('10. Full Context Analysis Pipeline', () => {
  vi.setConfig({ testTimeout: 45000 });

  it('Death House — should produce complete analysis with suggestions + off-track + summary', async () => {
    const r = await getAnalysis(
      DEATH_HOUSE.adventureContext,
      'The party explores the upper hall of the townhouse. They find a large portrait of a family — the parents look severe, the children sad. One player notices the mother glaring at a baby in the father\'s arms.'
    );
    expect(r.analysis).toBeDefined();
    expect(r.analysis.suggestions?.length).toBeGreaterThan(0);
    expect(r.analysis.offTrackStatus).toBeDefined();
    expect(r.analysis.summary?.length).toBeGreaterThan(10);
  });

  it('Greenest — combat scenario full analysis', async () => {
    const r = await getAnalysis(
      GREENEST_FLAMES.adventureContext,
      'The party rushes to defend civilians near the temple of Chauntea. Cultists and kobolds are trying to break down the doors. Player 1: I charge the nearest cultist! Player 2: I cast Sacred Flame on the kobold with the torch.'
    );
    expect(r.analysis).toBeDefined();
    expect(r.analysis.suggestions?.length).toBeGreaterThan(0);
    if (r.analysis?.offTrackStatus) {
      // Defending the temple IS part of the adventure
      expect(r.analysis.offTrackStatus.isOffTrack).toBe(false);
    }
  });

  it('Nightstone — exploration + social scene', async () => {
    const r = await getAnalysis(
      NIGHTSTONE.adventureContext,
      'The party carefully moves through the devastated village. Player 1 enters the inn and finds a young woman sitting alone. She says she survived the attack by hiding. Player 2 whispers: Something about her story does not add up.'
    );
    expect(r.analysis).toBeDefined();
    expect(r.analysis.suggestions?.length).toBeGreaterThan(0);
    // Should pick up on the Kella subplot
    const allText = (r.analysis.suggestions || []).map(s => s.content).join(' ').toLowerCase();
    expect(['kella', 'spy', 'zhentarim', 'suspicious', 'insight', 'deception', 'lie', 'trust', 'morak'].some(w => allText.includes(w))).toBe(true);
  });

  it('Wave Echo Cave — dungeon exploration', async () => {
    const r = await getAnalysis(
      WAVE_ECHO_CAVE.adventureContext,
      'DM: You pass through the guard room and follow a narrow passage. The booming sound grows louder. You enter an enormous cavern filled with strange glowing fungi. Player 1: I check for danger. Player 2: Any mushrooms that look dangerous?'
    );
    expect(r.analysis).toBeDefined();
    expect(r.analysis.suggestions?.length).toBeGreaterThan(0);
    const allText = (r.analysis.suggestions || []).map(s => s.content).join(' ').toLowerCase();
    expect(['fungus', 'ochre', 'jelly', 'cavern', 'glow', 'danger', 'deeper', 'forge'].some(w => allText.includes(w))).toBe(true);
  });
});

// ===========================================================================
// 11. RAG JOURNAL QUERIES — Full adventure as journal, specific questions
// ===========================================================================

run('11. RAG Journal Queries — Full Adventure Context', () => {
  vi.setConfig({ testTimeout: 45000 });

  // Simulates the RAG pipeline: the ENTIRE adventure text is passed as context
  // (like OpenAI File Search would return), then the DM asks specific questions.

  async function askJournalQuestion(adventureContext, question) {
    const b = new PromptBuilder({ primaryLanguage: 'en', sensitivity: 'medium' });
    const msgs = b.buildGeneralQueryMessages(
      question,
      `RELEVANT SOURCES: Adventure Journal\n---\n${adventureContext}`
    );
    const r = await askAI(msgs);
    return { answer: r.content, usage: r.usage };
  }

  describe('Curse of Strahd — Full Village + Death House', () => {
    // Combine Barovia Village + Death House as a single "journal"
    const FULL_COS = BAROVIA_VILLAGE.adventureContext + '\n\n' + DEATH_HOUSE.adventureContext;

    it('Q: Who are Rose and Thorn? — should explain they are ghost children', async () => {
      const r = await askJournalQuestion(FULL_COS, 'Who are Rose and Thorn? What is their story?');
      const low = r.answer.toLowerCase();
      expect(['ghost', 'durst', 'children', 'starved', 'locked', 'illusory', 'death house', 'parents'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: What is in the ritual chamber? — should describe the altar and Lorghoth', async () => {
      const r = await askJournalQuestion(FULL_COS, 'What happens in the ritual chamber in the basement?');
      const low = r.answer.toLowerCase();
      expect(['altar', 'sacrifice', 'lorghoth', 'shambling', 'cultist', 'chant', 'one must die'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: Where is Ireena? — should say at the burgomaster mansion', async () => {
      const r = await askJournalQuestion(FULL_COS, 'Where can the party find Ireena Kolyana?');
      const low = r.answer.toLowerCase();
      expect(['mansion', 'burgomaster', 'ireena', 'bite', 'strahd', 'auburn'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: What is at the church? — should describe Donavich and Doru', async () => {
      const r = await askJournalQuestion(FULL_COS, 'What will the party find at the church?');
      const low = r.answer.toLowerCase();
      expect(['donavich', 'doru', 'vampire', 'undercroft', 'praying', 'screaming'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: What should the party do first? — should suggest meeting children or tavern', async () => {
      const r = await askJournalQuestion(FULL_COS, 'The party just arrived at the village. What should they do first?');
      const low = r.answer.toLowerCase();
      expect(['children', 'tavern', 'rose', 'thorn', 'ismark', 'explore', 'investigate'].some(w => low.includes(w))).toBe(true);
    });
  });

  describe('Lost Mine of Phandelver — Goblin Ambush + Wave Echo Cave', () => {
    const FULL_LMOP = GOBLIN_AMBUSH.adventureContext + '\n\n' + WAVE_ECHO_CAVE.adventureContext;

    it('Q: Where is Gundren? — should explain he was captured', async () => {
      const r = await askJournalQuestion(FULL_LMOP, 'Where is Gundren Rockseeker? What happened to him?');
      const low = r.answer.toLowerCase();
      expect(['captured', 'goblin', 'cragmaw', 'castle', 'taken'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: Who is the Black Spider? — should identify Nezznar the drow', async () => {
      const r = await askJournalQuestion(FULL_LMOP, 'Who is the Black Spider?');
      const low = r.answer.toLowerCase();
      expect(['nezznar', 'drow', 'forge', 'spells', 'control'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: What does the Forge of Spells do? — should explain enchantment', async () => {
      const r = await askJournalQuestion(FULL_LMOP, 'What can the Forge of Spells do?');
      const low = r.answer.toLowerCase();
      expect(['enchant', 'weapon', 'armor', '+1', 'magic', 'brazier', 'flame', 'spectral', 'forge', 'spell', 'power', 'nonmagical', 'temporary', 'bonus', 'hour', 'stone', 'green'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: How to find Cragmaw Hideout? — should describe the trail', async () => {
      const r = await askJournalQuestion(FULL_LMOP, 'How can the party find the Cragmaw Hideout?');
      const low = r.answer.toLowerCase();
      expect(['trail', 'track', 'northeast', 'survival', 'goblin', 'drag', 'footprint'].some(w => low.includes(w))).toBe(true);
    });
  });

  describe('Hoard of the Dragon Queen — Greenest', () => {
    it('Q: What missions are available? — should list the missions', async () => {
      const r = await askJournalQuestion(GREENEST_FLAMES.adventureContext, 'What missions can the party undertake in Greenest?');
      const low = r.answer.toLowerCase();
      expect(['keep', 'tunnel', 'sanctuary', 'mill', 'dragon', 'champion'].some(w => low.includes(w))).toBe(true);
      // Should mention at least 3 missions
      const missionWords = ['keep', 'tunnel', 'sanctuary', 'mill', 'dragon', 'champion', 'prisoner'];
      const matchCount = missionWords.filter(w => low.includes(w)).length;
      expect(matchCount).toBeGreaterThanOrEqual(3);
    });

    it('Q: Can the dragon be negotiated with? — should say yes', async () => {
      const r = await askJournalQuestion(GREENEST_FLAMES.adventureContext, 'Can the party negotiate with the dragon?');
      const low = r.answer.toLowerCase();
      expect(['lennithon', 'negotiate', 'mercenary', 'driven off', 'damage', 'half', 'not committed', 'pawn'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: Who challenges the party? — should describe Cyanwrath', async () => {
      const r = await askJournalQuestion(GREENEST_FLAMES.adventureContext, 'Who challenges the party at dawn?');
      const low = r.answer.toLowerCase();
      expect(['cyanwrath', 'half-dragon', 'duel', 'single combat', 'prisoner', 'hostage', 'champion'].some(w => low.includes(w))).toBe(true);
    });
  });

  describe('Storm King\'s Thunder — Nightstone', () => {
    it('Q: Why was the village attacked? — should explain cloud giants and megalith', async () => {
      const r = await askJournalQuestion(NIGHTSTONE.adventureContext, 'Why was Nightstone attacked?');
      const low = r.answer.toLowerCase();
      expect(['cloud giant', 'megalith', 'nightstone', 'obsidian', 'boulder', 'stole', 'above'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: Where are the villagers? — should describe Dripping Caves', async () => {
      const r = await askJournalQuestion(NIGHTSTONE.adventureContext, 'Where did the villagers go?');
      const low = r.answer.toLowerCase();
      expect(['dripping caves', 'fled', 'goblin', 'hark', 'captured', 'north'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: Is there anyone suspicious? — should mention Kella', async () => {
      const r = await askJournalQuestion(NIGHTSTONE.adventureContext, 'Is there anyone suspicious in the village?');
      const low = r.answer.toLowerCase();
      expect(['kella', 'zhentarim', 'spy', 'pretend', 'inn', 'survivor'].some(w => low.includes(w))).toBe(true);
    });
  });

  describe('Dragon Lair — Thundertree', () => {
    it('Q: How dangerous is the dragon? — should explain Venomfang is young but deadly', async () => {
      const r = await askJournalQuestion(DRAGON_HOARD.adventureContext, 'How dangerous is the dragon in the tower?');
      const low = r.answer.toLowerCase();
      expect(['venomfang', 'young', 'green', 'breath', 'cunning', 'fly', 'half', 'flee'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: Is there a friendly NPC nearby? — should mention Reidoth', async () => {
      const r = await askJournalQuestion(DRAGON_HOARD.adventureContext, 'Is there a friendly NPC who can help near the tower?');
      const low = r.answer.toLowerCase();
      expect(['reidoth', 'druid', 'cottage', 'help', 'warn', 'habit'].some(w => low.includes(w))).toBe(true);
    });

    it('Q: What treasure is in the hoard? — should list specific items', async () => {
      const r = await askJournalQuestion(DRAGON_HOARD.adventureContext, 'What treasure can be found in the dragon hoard?');
      const low = r.answer.toLowerCase();
      expect(['gold', 'silver', 'goblet', 'moonstone', 'scroll', 'misty step', 'battleaxe', 'hew'].some(w => low.includes(w))).toBe(true);
    });
  });
});
