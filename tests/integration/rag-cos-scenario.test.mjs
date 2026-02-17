/**
 * RAG Curse of Strahd Scenario Integration Tests
 *
 * End-to-end tests for the RAG pipeline using a real Curse of Strahd passage
 * (Death House, Area 8 - The Study). Verifies that the system can:
 *
 * 1. Index adventure content (journals + compendiums)
 * 2. Retrieve contextually relevant chunks for a room description
 * 3. Keyword-extract D&D-relevant terms from the passage
 * 4. Build proper AI context for DM suggestions
 * 5. Generate actionable DM advice via AIAssistant (with mocked OpenAI)
 * 6. Detect scene type and foreshadowing elements
 *
 * @module tests/integration/rag-cos-scenario
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn()
    }),
    debug: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn(),
    setDebugMode: vi.fn()
  },
  LogLevel: { DEBUG: 0, INFO: 1, LOG: 2, WARN: 3, ERROR: 4, NONE: 5 }
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { EmbeddingService } from '../../scripts/ai/EmbeddingService.mjs';
import { RAGVectorStore } from '../../scripts/ai/RAGVectorStore.mjs';
import { RAGRetriever } from '../../scripts/narrator/RAGRetriever.mjs';
import { AIAssistant } from '../../scripts/narrator/AIAssistant.mjs';

// ---------------------------------------------------------------------------
// Curse of Strahd test data
// ---------------------------------------------------------------------------

/**
 * The target passage - Death House, Area 8: The Study
 */
const COS_STUDY_PASSAGE = `Red velvet drapes cover the windows of this room. An exquisite mahogany desk and a matching high-back chair face the entrance and the fireplace, above which hangs a framed picture of a windmill perched atop a rocky crag. Situated in corners of the room are two overstuffed chairs. Floor-to-ceiling bookshelves line the south wall. A rolling wooden ladder allows one to more easily reach the high shelves.`;

/**
 * Simulated indexed adventure content — chunks from Curse of Strahd journals
 */
const COS_JOURNAL_CHUNKS = [
  {
    text: 'Death House - Area 8: Study. ' + COS_STUDY_PASSAGE + ' The desk has a number of old letters in its drawer. One letter from Strahd von Zarovich congratulates the homeowners Gustav and Elisabeth Durst on the birth of their son Walter. A secret door in the west wall leads to a hidden staircase descending to the basement.',
    metadata: {
      source: 'journal',
      journalId: 'cos-death-house',
      journalName: 'Curse of Strahd - Death House',
      pageId: 'area-8-study',
      pageName: 'Area 8: Study',
      indexedAt: new Date().toISOString()
    }
  },
  {
    text: 'Death House - Area 7: Servants Room. This room contains a simple bed and nightstand. A servant named Mrs. Durst slept here. The room is unremarkable save for a small holy symbol of the Morninglord tucked under the pillow.',
    metadata: {
      source: 'journal',
      journalId: 'cos-death-house',
      journalName: 'Curse of Strahd - Death House',
      pageId: 'area-7-servants',
      pageName: 'Area 7: Servants Room',
      indexedAt: new Date().toISOString()
    }
  },
  {
    text: 'Death House - Area 9: Storage Room. This is a dusty, web-filled storage room with old boxes, crates, and a locked trunk. The trunk contains a cloak of protection, a diary of the maid, and 40 gold pieces.',
    metadata: {
      source: 'journal',
      journalId: 'cos-death-house',
      journalName: 'Curse of Strahd - Death House',
      pageId: 'area-9-storage',
      pageName: 'Area 9: Storage Room',
      indexedAt: new Date().toISOString()
    }
  },
  {
    text: 'Old Bonegrinder. A dilapidated stone windmill stands atop a rocky crag at the base of the Balinok Mountains. The windmill is home to Morgantha and her two daughters, Bella Sunbane and Offalia Wormwiggle — a coven of night hags who sell dream pastries to the people of Barovia. The pastries are made from the ground bones of children.',
    metadata: {
      source: 'journal',
      journalId: 'cos-bonegrinder',
      journalName: 'Curse of Strahd - Locations',
      pageId: 'old-bonegrinder',
      pageName: 'Old Bonegrinder',
      indexedAt: new Date().toISOString()
    }
  },
  {
    text: 'Strahd von Zarovich. Count Strahd von Zarovich is a vampire and the lord of Barovia. He made a pact with dark powers to gain immortality. He resides in Castle Ravenloft overlooking the village of Barovia. Strahd is obsessed with Ireena Kolyana, whom he believes to be a reincarnation of his lost love Tatyana.',
    metadata: {
      source: 'journal',
      journalId: 'cos-npcs',
      journalName: 'Curse of Strahd - NPCs',
      pageId: 'strahd',
      pageName: 'Strahd von Zarovich',
      indexedAt: new Date().toISOString()
    }
  },
  {
    text: 'Gustav and Elisabeth Durst were cultists who worshipped a dark entity beneath their home. Their children, Rosavalda (Rose) and Thornboldt (Thorn), died of starvation after being locked in the attic by the cultists. Their ghosts now haunt the house and lure adventurers inside.',
    metadata: {
      source: 'journal',
      journalId: 'cos-death-house',
      journalName: 'Curse of Strahd - Death House',
      pageId: 'durst-family',
      pageName: 'The Durst Family',
      indexedAt: new Date().toISOString()
    }
  }
];

/**
 * Compendium chunk: exploration rules
 */
const COS_COMPENDIUM_CHUNKS = [
  {
    text: 'Searching a room: A character can use an action to search a room. The DM determines whether there is anything to find. A successful DC 10 Investigation check reveals hidden items. A DC 15 check reveals secret doors.',
    metadata: {
      source: 'compendium',
      packId: 'dnd5e.rules',
      packName: 'D&D 5e Rules',
      entryId: 'exploration-searching',
      entryName: 'Searching',
      indexedAt: new Date().toISOString()
    }
  }
];

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic embedding function that maps text to vectors
 * where similar content produces similar vectors (via keyword overlap).
 *
 * This lets cosine similarity work realistically in tests without OpenAI.
 */
function createDeterministicEmbedder() {
  // Keywords that define semantic "dimensions"
  const semanticDimensions = [
    'study', 'desk', 'bookshelves', 'fireplace', 'windmill',
    'death house', 'durst', 'strahd', 'barovia', 'secret',
    'bonegrinder', 'hag', 'pastries', 'children', 'coven',
    'cultist', 'basement', 'letter', 'ghost', 'haunt',
    'servant', 'holy', 'morninglord', 'storage', 'trunk',
    'ravenloft', 'vampire', 'ireena', 'tatyana', 'castle',
    'search', 'investigation', 'exploration', 'room', 'door',
    'velvet', 'mahogany', 'ladder', 'chair', 'drapes'
  ];

  return function embed(text) {
    const lower = text.toLowerCase();
    const vec = new Array(512).fill(0);

    // Map semantic keywords to embedding dimensions
    for (let i = 0; i < semanticDimensions.length; i++) {
      const kw = semanticDimensions[i];
      // Count occurrences and map to nearby dimensions
      const count = (lower.match(new RegExp(kw, 'g')) || []).length;
      if (count > 0) {
        // Spread signal across a few dimensions for realism
        const base = i * 12;
        vec[base % 512] = 0.3 + (count * 0.2);
        vec[(base + 1) % 512] = 0.2 + (count * 0.1);
        vec[(base + 2) % 512] = 0.1;
      }
    }

    // Add some baseline signal from text length / word diversity
    const words = new Set(lower.split(/\s+/));
    vec[500] = Math.min(words.size / 50, 1.0);
    vec[501] = Math.min(text.length / 2000, 1.0);

    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  };
}

function createMockOpenAIClient(embedFn) {
  return {
    isConfigured: true,
    post: vi.fn().mockImplementation((endpoint, body) => {
      if (endpoint === '/embeddings') {
        const input = body.input;
        const texts = Array.isArray(input) ? input : [input];
        return Promise.resolve({
          data: texts.map(t => ({ embedding: embedFn(t) }))
        });
      }
      if (endpoint === '/chat/completions') {
        return Promise.resolve(createMockChatResponse(body));
      }
      return Promise.reject(new Error(`Unknown endpoint: ${endpoint}`));
    })
  };
}

/**
 * Creates a mock chat response that simulates DM advice for the study scene.
 */
function createMockChatResponse(body) {
  const userMessage = body.messages?.find(m => m.role === 'user')?.content || '';
  const contextMessage = body.messages?.find(m => m.role === 'system' && m.content?.includes('ADVENTURE CONTEXT'))?.content || '';

  // Detect if RAG context was provided (the study passage should be in context)
  const hasStudyContext = contextMessage.includes('Study') || contextMessage.includes('mahogany desk');
  const hasBonegrinderContext = contextMessage.includes('Bonegrinder') || contextMessage.includes('windmill');

  // Build response based on what context was provided
  const suggestions = [];

  if (hasStudyContext) {
    suggestions.push({
      type: 'reference',
      content: 'The players are in Death House, Area 8: The Study. The framed windmill picture above the fireplace foreshadows Old Bonegrinder. Draw attention to it if players investigate the room.',
      pageReference: 'Area 8: Study',
      confidence: 0.95
    });

    suggestions.push({
      type: 'action',
      content: 'Encourage players to search the desk — it contains letters from Strahd von Zarovich. A DC 15 Investigation check reveals the secret door in the west wall leading to the basement.',
      pageReference: 'Area 8: Study',
      confidence: 0.9
    });
  }

  if (hasBonegrinderContext) {
    suggestions.push({
      type: 'narration',
      content: 'If players examine the windmill painting closely, describe it in detail. This is the same windmill they may later encounter at Old Bonegrinder, home to a coven of night hags.',
      pageReference: 'Old Bonegrinder',
      confidence: 0.85
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      type: 'narration',
      content: 'The party is exploring a room. Look for clues and interactive elements.',
      confidence: 0.3
    });
  }

  // Determine off-track status
  const isExplorationTranscript = userMessage.includes('look around') ||
    userMessage.includes('investigate') ||
    userMessage.includes('search') ||
    userMessage.includes('examine');

  return {
    choices: [{
      message: {
        content: JSON.stringify({
          suggestions,
          offTrackStatus: {
            isOffTrack: false,
            severity: 0,
            reason: isExplorationTranscript
              ? 'Players are actively exploring Death House as expected.'
              : 'Players appear to be engaging with the adventure content.'
          },
          relevantPages: ['Area 8: Study', 'Old Bonegrinder', 'The Durst Family'],
          summary: 'The party is exploring the study in Death House. Key items: desk with Strahd letters, windmill painting (foreshadowing), secret door to basement.'
        })
      }
    }]
  };
}

function createMockJournalParser(chunks) {
  return {
    parseJournal: vi.fn().mockResolvedValue({
      id: 'cos-death-house',
      name: 'Curse of Strahd - Death House',
      pages: chunks.map(c => ({
        id: c.metadata.pageId,
        name: c.metadata.pageName,
        text: c.text
      }))
    }),
    getChunksForEmbedding: vi.fn().mockImplementation((journalId) => {
      return Promise.resolve(
        chunks.filter(c => c.metadata.journalId === journalId)
      );
    }),
    searchByKeywords: vi.fn().mockImplementation((_journalId, keywords) => {
      return chunks.filter(chunk => {
        const lower = chunk.text.toLowerCase();
        return keywords.some(kw => lower.includes(kw));
      }).map(c => ({
        id: c.metadata.pageId,
        name: c.metadata.pageName,
        text: c.text
      }));
    })
  };
}

function createMockCompendiumParser(chunks) {
  return {
    getChunksForEmbedding: vi.fn().mockImplementation((packId) => {
      return Promise.resolve(
        chunks.filter(c => c.metadata.packId === packId)
      );
    }),
    searchByKeywords: vi.fn().mockImplementation((_packId, keywords) => {
      return chunks.filter(chunk => {
        const lower = chunk.text.toLowerCase();
        return keywords.some(kw => lower.includes(kw));
      }).map(c => ({
        id: c.metadata.entryId,
        name: c.metadata.entryName,
        text: c.text,
        packName: c.metadata.packName,
        type: 'rule'
      }));
    })
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RAG Curse of Strahd Scenario', () => {
  let embedFn;
  let mockOpenAIClient;
  let embeddingService;
  let vectorStore;
  let ragRetriever;
  let aiAssistant;
  let mockJournalParser;
  let mockCompendiumParser;

  beforeEach(async () => {
    embedFn = createDeterministicEmbedder();
    mockOpenAIClient = createMockOpenAIClient(embedFn);

    embeddingService = new EmbeddingService({
      openaiClient: mockOpenAIClient,
      model: 'text-embedding-3-small',
      dimensions: 512
    });

    vectorStore = new RAGVectorStore({
      embeddingService,
      maxSizeInMB: 100,
      dimensions: 512,
      persistToIndexedDB: false
    });

    mockJournalParser = createMockJournalParser(COS_JOURNAL_CHUNKS);
    mockCompendiumParser = createMockCompendiumParser(COS_COMPENDIUM_CHUNKS);

    ragRetriever = new RAGRetriever({
      embeddingService,
      vectorStore,
      journalParser: mockJournalParser,
      compendiumParser: mockCompendiumParser,
      similarityThreshold: 0.1,  // Low threshold for deterministic embeddings
      maxResults: 5
    });

    aiAssistant = new AIAssistant({
      openaiClient: mockOpenAIClient,
      model: 'gpt-4o-mini',
      sensitivity: 'medium',
      primaryLanguage: 'en',
      ragRetriever,
      useRAG: true,
      ragMaxResults: 5,
      ragMaxChars: 5000
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Phase 1: Index the adventure content
  // =========================================================================

  describe('indexing Curse of Strahd content', () => {
    it('should index Death House journal chunks', async () => {
      const result = await ragRetriever.buildIndex(
        ['cos-death-house', 'cos-bonegrinder', 'cos-npcs'],
        ['dnd5e.rules']
      );

      expect(result.journalChunks).toBe(6);
      expect(result.compendiumChunks).toBe(1);
      expect(ragRetriever.getIndexedJournals()).toContain('cos-death-house');
      expect(ragRetriever.getIndexedJournals()).toContain('cos-bonegrinder');
      expect(ragRetriever.getIndexedCompendiums()).toContain('dnd5e.rules');
    });

    it('should report correct index status after indexing', async () => {
      await ragRetriever.buildIndex(
        ['cos-death-house', 'cos-bonegrinder', 'cos-npcs'],
        ['dnd5e.rules']
      );

      const status = ragRetriever.getIndexStatus();
      expect(status.isIndexed).toBe(true);
      expect(status.vectorCount).toBe(7);  // 6 journal + 1 compendium
      expect(status.journalCount).toBe(3);
      expect(status.compendiumCount).toBe(1);
      expect(status.lastIndexed).toBeInstanceOf(Date);
      expect(status.isIndexing).toBe(false);
      expect(status.progress).toBe(100);
    });
  });

  // =========================================================================
  // Phase 2: RAG retrieval for the study passage
  // =========================================================================

  describe('retrieving context for the study scene', () => {
    beforeEach(async () => {
      await ragRetriever.buildIndex(
        ['cos-death-house', 'cos-bonegrinder', 'cos-npcs'],
        ['dnd5e.rules']
      );
    });

    it('should retrieve study-related chunks for the passage query', async () => {
      const results = await ragRetriever.retrieve(
        'mahogany desk windmill fireplace bookshelves study',
        { maxResults: 5 }
      );

      expect(results.length).toBeGreaterThan(0);

      // At least one result should be from the study page
      const studyResult = results.find(r =>
        r.metadata.pageName === 'Area 8: Study' ||
        r.text.includes('mahogany desk')
      );
      expect(studyResult).toBeDefined();
    });

    it('should retrieve Old Bonegrinder when querying about the windmill', async () => {
      const results = await ragRetriever.retrieve(
        'windmill rocky crag painting picture',
        { maxResults: 5 }
      );

      expect(results.length).toBeGreaterThan(0);

      // Should find the windmill / Bonegrinder chunk
      const windmillResult = results.find(r =>
        r.text.includes('Bonegrinder') || r.text.includes('windmill')
      );
      expect(windmillResult).toBeDefined();
    });

    it('should include proper citations in retrieval results', async () => {
      const results = await ragRetriever.retrieve('study desk letters Strahd');

      for (const result of results) {
        expect(result.citation).toBeDefined();
        expect(result.citation).toMatch(/^\[.+ > .+\]$/);
      }
    });

    it('should retrieve formatted AI context with sources', async () => {
      const { context, sources } = await ragRetriever.retrieveForAI(
        'study room fireplace windmill painting desk'
      );

      expect(context.length).toBeGreaterThan(0);
      expect(sources.length).toBeGreaterThan(0);

      // Context should contain actual adventure text
      expect(context).toMatch(/Study|desk|windmill|Bonegrinder/i);
    });

    it('should combine semantic and keyword results for better coverage', async () => {
      // This query has both semantic overlap and keyword matches
      const results = await ragRetriever.retrieve(
        'Strahd letter desk secret door basement',
        { maxResults: 5 }
      );

      expect(results.length).toBeGreaterThan(0);

      // Each result should have a combined score
      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
        expect(typeof result.semanticScore).toBe('number');
        expect(typeof result.keywordScore).toBe('number');
        expect(typeof result.recencyScore).toBe('number');
      }
    });
  });

  // =========================================================================
  // Phase 3: Keyword extraction from D&D content
  // =========================================================================

  describe('keyword extraction from Curse of Strahd content', () => {
    it('should extract meaningful D&D keywords from the study passage', () => {
      const keywords = ragRetriever._extractKeywords(COS_STUDY_PASSAGE);

      expect(keywords).toContain('velvet');
      expect(keywords).toContain('drapes');
      expect(keywords).toContain('mahogany');
      expect(keywords).toContain('desk');
      expect(keywords).toContain('fireplace');
      expect(keywords).toContain('windmill');
      expect(keywords).toContain('bookshelves');
      expect(keywords).toContain('ladder');
    });

    it('should filter stop words from the passage', () => {
      const keywords = ragRetriever._extractKeywords(COS_STUDY_PASSAGE);

      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('of');
      expect(keywords).not.toContain('and');
      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('an');
    });

    it('should score study text highly for study-related keywords', () => {
      const studyChunk = COS_JOURNAL_CHUNKS[0];
      const keywords = ['desk', 'study', 'windmill', 'fireplace'];

      const score = ragRetriever._calculateKeywordScore(studyChunk.text, keywords);

      // All 4 keywords appear in the study text
      expect(score).toBeGreaterThan(0.6);
    });

    it('should score servant room poorly for study-related keywords', () => {
      const servantChunk = COS_JOURNAL_CHUNKS[1];
      const keywords = ['desk', 'study', 'windmill', 'fireplace'];

      const score = ragRetriever._calculateKeywordScore(servantChunk.text, keywords);

      // None of these keywords appear in the servant room
      expect(score).toBeLessThan(0.3);
    });

    it('should score Bonegrinder highly for windmill keywords', () => {
      const bonegrinderChunk = COS_JOURNAL_CHUNKS[3];
      const keywords = ['windmill', 'crag', 'rocky'];

      const score = ragRetriever._calculateKeywordScore(bonegrinderChunk.text, keywords);

      expect(score).toBeGreaterThan(0.5);
    });
  });

  // =========================================================================
  // Phase 4: AIAssistant analysis with RAG context
  // =========================================================================

  describe('AIAssistant DM advice for the study scene', () => {
    beforeEach(async () => {
      await ragRetriever.buildIndex(
        ['cos-death-house', 'cos-bonegrinder', 'cos-npcs'],
        ['dnd5e.rules']
      );

      // Set chapter context as the DM would have it
      aiAssistant.setChapterContext({
        chapterName: 'Death House',
        subsections: [
          'Area 7: Servants Room',
          'Area 8: Study',
          'Area 9: Storage Room',
          'Secret Staircase to Basement'
        ],
        pageReferences: [
          { pageId: 'area-8-study', pageName: 'Area 8: Study', journalName: 'Curse of Strahd - Death House' },
          { pageId: 'old-bonegrinder', pageName: 'Old Bonegrinder', journalName: 'Curse of Strahd - Locations' }
        ],
        summary: 'The party is exploring Death House, a haunted townhouse in the village of Barovia. They are on the second floor, moving through rooms once occupied by the Durst family.'
      });
    });

    it('should analyze the study transcription and return suggestions', async () => {
      const transcription = `DM reads: "${COS_STUDY_PASSAGE}" Player 1 says: "I want to look around the room, especially at the desk." Player 2 says: "What about that painting of the windmill? I want to examine it closely."`;

      const analysis = await aiAssistant.analyzeContext(transcription);

      expect(analysis).toBeDefined();
      expect(analysis.suggestions).toBeInstanceOf(Array);
      expect(analysis.suggestions.length).toBeGreaterThan(0);
      expect(analysis.offTrackStatus).toBeDefined();
      expect(analysis.summary).toBeDefined();
    });

    it('should identify players as on-track when exploring the study', async () => {
      const transcription = `The players are in the study. Player 1: "I search the desk for any documents." Player 2: "I investigate the bookshelves."`;

      const analysis = await aiAssistant.analyzeContext(transcription);

      expect(analysis.offTrackStatus.isOffTrack).toBe(false);
      expect(analysis.offTrackStatus.severity).toBe(0);
    });

    it('should detect off-track when adventure context is available', async () => {
      const transcription = 'The players are in the study of Death House.';
      aiAssistant.setAdventureContext(COS_JOURNAL_CHUNKS[0].text);

      const offTrack = await aiAssistant.detectOffTrack(transcription);

      expect(offTrack).toBeDefined();
      expect(typeof offTrack.isOffTrack).toBe('boolean');
      expect(typeof offTrack.severity).toBe('number');
      expect(typeof offTrack.reason).toBe('string');
    });

    it('should generate suggestions referencing the windmill foreshadowing', async () => {
      const transcription = `Player asks: "What's that painting above the fireplace? It shows some kind of windmill."`;

      const suggestions = await aiAssistant.generateSuggestions(transcription, {
        maxSuggestions: 3
      });

      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThan(0);

      // Each suggestion should have the required shape
      for (const suggestion of suggestions) {
        expect(suggestion).toHaveProperty('type');
        expect(suggestion).toHaveProperty('content');
        expect(suggestion).toHaveProperty('confidence');
        expect(['narration', 'dialogue', 'action', 'reference']).toContain(suggestion.type);
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should use RAG context in the API call to OpenAI', async () => {
      const transcription = 'Players search the study desk and notice the windmill painting.';

      await aiAssistant.analyzeContext(transcription);

      // Verify the OpenAI client was called with messages containing RAG context
      const chatCall = mockOpenAIClient.post.mock.calls.find(
        call => call[0] === '/chat/completions'
      );
      expect(chatCall).toBeDefined();

      const messages = chatCall[1].messages;

      // Should have system prompt + context + user message
      expect(messages.length).toBeGreaterThanOrEqual(2);

      // Should include an ADVENTURE CONTEXT system message (from RAG)
      const contextMsg = messages.find(m =>
        m.role === 'system' && m.content?.includes('ADVENTURE CONTEXT')
      );
      expect(contextMsg).toBeDefined();
    });

    it('should report RAG as configured', () => {
      expect(aiAssistant.isRAGConfigured()).toBe(true);

      const stats = aiAssistant.getStats();
      expect(stats.ragConfigured).toBe(true);
      expect(stats.ragEnabled).toBe(true);
    });

    it('should include chapter context in system prompt', async () => {
      const transcription = 'The party continues exploring Death House.';

      await aiAssistant.analyzeContext(transcription);

      const chatCall = mockOpenAIClient.post.mock.calls.find(
        call => call[0] === '/chat/completions'
      );
      const systemPrompt = chatCall[1].messages[0].content;

      expect(systemPrompt).toContain('CURRENT CHAPTER: Death House');
      expect(systemPrompt).toContain('Area 8: Study');
    });
  });

  // =========================================================================
  // Phase 5: Full pipeline — index → retrieve → advise
  // =========================================================================

  describe('full pipeline: index → retrieve → advise', () => {
    it('should execute the complete RAG-to-suggestion pipeline', async () => {
      // Step 1: Index
      const indexResult = await ragRetriever.buildIndex(
        ['cos-death-house', 'cos-bonegrinder', 'cos-npcs'],
        ['dnd5e.rules']
      );
      expect(indexResult.journalChunks + indexResult.compendiumChunks).toBe(7);

      // Step 2: Retrieve
      const { context, sources } = await ragRetriever.retrieveForAI(
        'study room desk windmill painting fireplace'
      );
      expect(context.length).toBeGreaterThan(0);
      expect(sources.length).toBeGreaterThan(0);

      // Step 3: Set up AIAssistant with chapter context
      aiAssistant.setChapterContext({
        chapterName: 'Death House - Area 8: Study',
        subsections: ['Desk Letters', 'Windmill Painting', 'Secret Door'],
        summary: 'The study of Gustav Durst, containing a desk with Strahd letters and a painting of Old Bonegrinder.'
      });

      // Step 4: Analyze
      const analysis = await aiAssistant.analyzeContext(
        `DM: "${COS_STUDY_PASSAGE}" Player: "I want to investigate the desk and look at the painting."`,
        { includeSuggestions: true, checkOffTrack: true }
      );

      // Verify full pipeline output
      expect(analysis.suggestions.length).toBeGreaterThan(0);
      expect(analysis.offTrackStatus.isOffTrack).toBe(false);
      expect(analysis.summary).toBeDefined();
      expect(analysis.summary.length).toBeGreaterThan(0);

      // At least one suggestion should reference actionable advice
      const hasActionableSuggestion = analysis.suggestions.some(s =>
        s.type === 'action' || s.type === 'reference'
      );
      expect(hasActionableSuggestion).toBe(true);
    });

    it('should work with keyword-only fallback when vector search is unavailable', async () => {
      // Create a retriever without embedding service (keyword-only mode)
      const keywordOnlyRetriever = new RAGRetriever({
        journalParser: mockJournalParser,
        compendiumParser: mockCompendiumParser
      });

      // Manually set indexed journals for keyword search
      keywordOnlyRetriever._indexedJournals.add('cos-death-house');
      keywordOnlyRetriever._indexedJournals.add('cos-bonegrinder');
      keywordOnlyRetriever._indexedCompendiums.add('dnd5e.rules');

      // Keyword search should still work
      const results = await keywordOnlyRetriever.retrieve(
        'desk windmill fireplace study'
      );

      expect(results.length).toBeGreaterThan(0);

      // Results should be scored by keyword match only
      for (const result of results) {
        expect(result.semanticScore).toBe(0);
        expect(result.keywordScore).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // Phase 6: Scene detection and NPC mention detection
  // =========================================================================

  describe('scene-aware features with the study passage', () => {
    it('should detect NPC mentions in a Curse of Strahd transcription', () => {
      // detectNPCMentions uses \b word-boundary regex on the full name,
      // so the transcription must contain the exact name string.
      const transcription = 'Player 1: "These letters are from Strahd von Zarovich himself!" Player 2: "So Gustav Durst and Elisabeth Durst were in contact with the vampire lord."';

      const npcs = [
        { name: 'Strahd von Zarovich' },
        { name: 'Gustav Durst' },
        { name: 'Elisabeth Durst' },
        { name: 'Rose' },
        { name: 'Thorn' },
        { name: 'Morgantha' }
      ];

      const mentioned = aiAssistant.detectNPCMentions(transcription, npcs);

      expect(mentioned).toContain('Strahd von Zarovich');
      expect(mentioned).toContain('Gustav Durst');
      expect(mentioned).toContain('Elisabeth Durst');
      // Not mentioned in the transcription
      expect(mentioned).not.toContain('Rose');
      expect(mentioned).not.toContain('Morgantha');
    });

    it('should generate chapter recovery options for the study', () => {
      const chapterContext = {
        chapterName: 'Death House',
        subsections: [
          'Area 8: Study',
          'Secret Door to Basement',
          'Desk Letters from Strahd'
        ],
        pageReferences: [
          { pageId: 'area-8-study', pageName: 'Area 8: Study', journalName: 'Death House' },
          { pageId: 'old-bonegrinder', pageName: 'Old Bonegrinder', journalName: 'Locations' }
        ],
        summary: 'Players are exploring the study. Key interactive elements: desk with letters, windmill painting, secret door.'
      };

      const options = aiAssistant.generateChapterRecoveryOptions(chapterContext);

      expect(options.length).toBeGreaterThan(0);

      // Should have a summary option
      const summaryOption = options.find(o => o.type === 'summary');
      expect(summaryOption).toBeDefined();
      expect(summaryOption.label).toBe('Death House');

      // Should have subsection options
      const subsectionOptions = options.filter(o => o.type === 'subsection');
      expect(subsectionOptions.length).toBe(3);
      expect(subsectionOptions.map(o => o.label)).toContain('Area 8: Study');

      // Should have page reference options
      const pageOptions = options.filter(o => o.type === 'page');
      expect(pageOptions.length).toBe(2);
      expect(pageOptions.map(o => o.label)).toContain('Old Bonegrinder');
    });

    it('should generate narrative bridge when players go off-track', async () => {
      const bridge = await aiAssistant.generateNarrativeBridge(
        'Players are arguing about what to eat for dinner in real life and have completely lost focus.',
        'The study in Death House — players should investigate the desk and find the secret door to the basement.'
      );

      expect(bridge).toBeDefined();
      expect(typeof bridge).toBe('string');
      expect(bridge.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Phase 7: Edge cases and error handling
  // =========================================================================

  describe('edge cases', () => {
    it('should handle empty transcription in detectOffTrack', async () => {
      await expect(
        aiAssistant.analyzeContext('')
      ).rejects.toThrow('No transcription provided');
    });

    it('should handle missing RAG index gracefully in analysis', async () => {
      // RAG is configured but index is empty (no buildIndex called)
      expect(aiAssistant.isRAGConfigured()).toBe(false); // hasIndex() returns false

      // Should still work, falling back to adventure context
      aiAssistant.setAdventureContext(COS_JOURNAL_CHUNKS[0].text);
      const analysis = await aiAssistant.analyzeContext('Players explore the study.');

      expect(analysis).toBeDefined();
      expect(analysis.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle incremental index updates', async () => {
      await ragRetriever.buildIndex(['cos-death-house'], []);

      expect(ragRetriever.getIndexedJournals()).toContain('cos-death-house');

      // Update a single journal
      const updateResult = await ragRetriever.updateIndex('cos-death-house');

      expect(updateResult).toHaveProperty('deleted');
      expect(updateResult).toHaveProperty('added');
      expect(ragRetriever.getIndexedJournals()).toContain('cos-death-house');
    });

    it('should clear and rebuild index', async () => {
      await ragRetriever.buildIndex(['cos-death-house'], ['dnd5e.rules']);
      expect(ragRetriever.hasIndex()).toBe(true);

      await ragRetriever.clearIndex();
      expect(ragRetriever.hasIndex()).toBe(false);
      expect(ragRetriever.getIndexedJournals()).toHaveLength(0);
      expect(ragRetriever.getIndexedCompendiums()).toHaveLength(0);

      // Rebuild
      await ragRetriever.buildIndex(['cos-bonegrinder'], []);
      expect(ragRetriever.hasIndex()).toBe(true);
      expect(ragRetriever.getIndexedJournals()).toContain('cos-bonegrinder');
    });
  });
});
