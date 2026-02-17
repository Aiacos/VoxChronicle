/**
 * RAG Pipeline End-to-End Integration Tests
 *
 * Verifies the complete RAG pipeline integration points:
 * 1. Service wiring and configuration
 * 2. API compatibility between services
 * 3. Integration points (setters/getters work correctly)
 * 4. Error handling across service boundaries
 *
 * These tests verify integration without real API calls (all mocked).
 * Individual service behavior is tested in unit tests (3537 tests).
 *
 * @module tests/integration/rag-pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (must be defined before imports)
// ---------------------------------------------------------------------------

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setDebugMode: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { EmbeddingService } from '../../scripts/ai/EmbeddingService.mjs';
import { RAGVectorStore } from '../../scripts/ai/RAGVectorStore.mjs';
import { RAGRetriever } from '../../scripts/narrator/RAGRetriever.mjs';
import { SilenceDetector } from '../../scripts/narrator/SilenceDetector.mjs';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Creates a mock OpenAI client for testing
 */
function createMockOpenAIClient(overrides = {}) {
  return {
    isConfigured: true,
    post: vi.fn().mockResolvedValue({
      data: [{ embedding: Array(512).fill(0.1) }]
    }),
    ...overrides
  };
}

/**
 * Creates a mock JournalParser
 */
function createMockJournalParser() {
  return {
    parseJournal: vi.fn().mockResolvedValue({
      id: 'journal-adventure',
      name: 'Lost Mine of Phandelver',
      pages: [
        {
          id: 'page-tavern',
          name: 'The Stonehill Inn',
          text: 'The Stonehill Inn is a modest inn in the center of Phandalin.'
        }
      ]
    }),
    getChunksForEmbedding: vi.fn().mockResolvedValue([
      {
        text: 'The Stonehill Inn is a modest inn.',
        metadata: {
          source: 'journal',
          journalId: 'journal-adventure',
          journalName: 'Lost Mine',
          pageId: 'page-tavern',
          pageName: 'The Stonehill Inn'
        }
      }
    ]),
    searchByKeywords: vi.fn().mockReturnValue([
      {
        id: 'page-tavern',
        name: 'The Stonehill Inn',
        text: 'The Stonehill Inn is a modest inn.'
      }
    ])
  };
}

/**
 * Creates a mock CompendiumParser
 */
function createMockCompendiumParser() {
  return {
    getChunksForEmbedding: vi.fn().mockResolvedValue([
      {
        text: 'Goblin. Small humanoid. HP: 7.',
        metadata: {
          source: 'compendium',
          packId: 'dnd5e.monsters',
          packName: 'Monster Manual',
          entryId: 'monster-goblin',
          entryName: 'Goblin'
        }
      }
    ]),
    searchByKeywords: vi.fn().mockReturnValue([])
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('RAG Pipeline End-to-End Integration', () => {
  let mockOpenAIClient;
  let embeddingService;
  let vectorStore;
  let ragRetriever;
  let mockJournalParser;
  let mockCompendiumParser;

  beforeEach(() => {
    mockOpenAIClient = createMockOpenAIClient();
    mockJournalParser = createMockJournalParser();
    mockCompendiumParser = createMockCompendiumParser();

    // Create EmbeddingService with mock client
    embeddingService = new EmbeddingService({
      openaiClient: mockOpenAIClient,
      model: 'text-embedding-3-small',
      dimensions: 512
    });

    // Create RAGVectorStore with embedding service (no IndexedDB for tests)
    vectorStore = new RAGVectorStore({
      embeddingService: embeddingService,
      maxSizeInMB: 100,
      dimensions: 512,
      persistToIndexedDB: false
    });

    // Create RAGRetriever with all services
    ragRetriever = new RAGRetriever({
      embeddingService: embeddingService,
      vectorStore: vectorStore,
      journalParser: mockJournalParser,
      compendiumParser: mockCompendiumParser,
      similarityThreshold: 0.5,
      maxResults: 5
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Pipeline Configuration Tests
  // ---------------------------------------------------------------------------

  describe('Pipeline Configuration', () => {
    it('should report configured status when all services are set', () => {
      expect(embeddingService.isConfigured()).toBe(true);
      expect(vectorStore.isConfigured()).toBe(true);
      expect(ragRetriever.isConfigured()).toBe(true);
    });

    it('should report not configured when embedding service missing', () => {
      const incompleteRetriever = new RAGRetriever({
        vectorStore: vectorStore,
        journalParser: mockJournalParser
      });

      expect(incompleteRetriever.isConfigured()).toBe(false);
    });

    it('should report not configured when vector store missing', () => {
      const incompleteRetriever = new RAGRetriever({
        embeddingService: embeddingService,
        journalParser: mockJournalParser
      });

      expect(incompleteRetriever.isConfigured()).toBe(false);
    });

    it('should have keyword fallback when parsers are available', () => {
      expect(ragRetriever.hasKeywordFallback()).toBe(true);
    });

    it('should not have keyword fallback without parsers', () => {
      const retrieverWithoutParsers = new RAGRetriever({
        embeddingService: embeddingService,
        vectorStore: vectorStore
      });

      expect(retrieverWithoutParsers.hasKeywordFallback()).toBe(false);
    });

    it('should track initial index status as not indexed', () => {
      const status = ragRetriever.getIndexStatus();
      expect(status.isIndexed).toBe(false);
      expect(status.vectorCount).toBe(0);
      expect(status.journalCount).toBe(0);
      expect(status.compendiumCount).toBe(0);
      expect(status.lastIndexed).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Service Wiring Tests
  // ---------------------------------------------------------------------------

  describe('Service Wiring', () => {
    it('should wire EmbeddingService to OpenAIClient', () => {
      expect(embeddingService.isConfigured()).toBe(true);
      expect(embeddingService.getModel()).toBe('text-embedding-3-small');
      expect(embeddingService.getDimensions()).toBe(512);
    });

    it('should wire RAGVectorStore to EmbeddingService', () => {
      expect(vectorStore.isConfigured()).toBe(true);
    });

    it('should allow setting services after construction', () => {
      const retriever = new RAGRetriever({});
      expect(retriever.isConfigured()).toBe(false);

      retriever.setEmbeddingService(embeddingService);
      retriever.setVectorStore(vectorStore);

      expect(retriever.isConfigured()).toBe(true);
    });

    it('should wire parsers for keyword fallback', () => {
      const retriever = new RAGRetriever({});
      expect(retriever.hasKeywordFallback()).toBe(false);

      retriever.setJournalParser(mockJournalParser);
      expect(retriever.hasKeywordFallback()).toBe(true);

      retriever.setJournalParser(null);
      retriever.setCompendiumParser(mockCompendiumParser);
      expect(retriever.hasKeywordFallback()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Embedding Service Tests
  // ---------------------------------------------------------------------------

  describe('Embedding Service Integration', () => {
    it('should generate embeddings via OpenAI client', async () => {
      const text = 'The party enters the tavern.';

      const embedding = await embeddingService.embed(text);

      expect(embedding).toHaveLength(512);
      expect(mockOpenAIClient.post).toHaveBeenCalledWith('/embeddings', expect.objectContaining({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 512
      }));
    });

    it('should reject empty strings', async () => {
      await expect(embeddingService.embed('')).rejects.toThrow();
      await expect(embeddingService.embed('   ')).rejects.toThrow();
    });

    it('should propagate API errors', async () => {
      const failingClient = createMockOpenAIClient({
        post: vi.fn().mockRejectedValue(new Error('API rate limit exceeded'))
      });

      const failingService = new EmbeddingService({
        openaiClient: failingClient
      });

      await expect(failingService.embed('test'))
        .rejects.toThrow('API rate limit exceeded');
    });
  });

  // ---------------------------------------------------------------------------
  // Vector Store Tests
  // ---------------------------------------------------------------------------

  describe('Vector Store Integration', () => {
    it('should add documents to store', async () => {
      const id = await vectorStore.add('Test document', { source: 'journal' });

      expect(id).toBeDefined();
      expect(vectorStore.size()).toBe(1);
    });

    it('should track store statistics', async () => {
      await vectorStore.add('Document 1', { source: 'journal' });
      await vectorStore.add('Document 2', { source: 'journal' });

      const stats = vectorStore.getStats();
      expect(stats.vectorCount).toBe(2);
    });

    it('should search for similar documents', async () => {
      await vectorStore.add('Tavern description', { pageName: 'Tavern' });
      await vectorStore.add('Goblin cave', { pageName: 'Cave' });

      const results = await vectorStore.search('tavern', { topK: 2 });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should clear all documents', async () => {
      await vectorStore.add('Document', { source: 'journal' });
      expect(vectorStore.size()).toBe(1);

      await vectorStore.clear();
      expect(vectorStore.size()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // RAG Retriever Tests
  // ---------------------------------------------------------------------------

  describe('RAG Retriever Integration', () => {
    it('should reject empty queries', async () => {
      await expect(ragRetriever.retrieve('')).rejects.toThrow('Query cannot be empty');
      await expect(ragRetriever.retrieve('   ')).rejects.toThrow('Query cannot be empty');
    });

    it('should track indexed journals', async () => {
      // Manually add to indexed journals (simulating buildIndex)
      ragRetriever._indexedJournals.add('journal-1');
      ragRetriever._indexedJournals.add('journal-2');

      expect(ragRetriever.getIndexedJournals()).toContain('journal-1');
      expect(ragRetriever.getIndexedJournals()).toContain('journal-2');
      expect(ragRetriever.getIndexedJournals()).toHaveLength(2);
    });

    it('should track indexed compendiums', async () => {
      ragRetriever._indexedCompendiums.add('dnd5e.monsters');

      expect(ragRetriever.getIndexedCompendiums()).toContain('dnd5e.monsters');
      expect(ragRetriever.getIndexedCompendiums()).toHaveLength(1);
    });

    it('should clear index correctly', async () => {
      ragRetriever._indexedJournals.add('journal-1');
      ragRetriever._indexedCompendiums.add('pack-1');

      await ragRetriever.clearIndex();

      expect(ragRetriever.getIndexedJournals()).toHaveLength(0);
      expect(ragRetriever.getIndexedCompendiums()).toHaveLength(0);
      expect(ragRetriever.hasIndex()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Silence Detector Tests
  // ---------------------------------------------------------------------------

  describe('Silence Detector Integration', () => {
    let silenceDetector;
    let silenceCallback;

    beforeEach(() => {
      vi.useFakeTimers();
      silenceCallback = vi.fn();
      silenceDetector = new SilenceDetector({
        thresholdMs: 30000, // Must be >= 10000
        onSilence: silenceCallback,
        autoRestart: true
      });
    });

    afterEach(() => {
      silenceDetector.stop();
      vi.useRealTimers();
    });

    it('should create with correct configuration', () => {
      expect(silenceDetector.getThreshold()).toBe(30000);
      expect(silenceDetector.isEnabled()).toBe(false);
      expect(silenceDetector.getStats().hasCallback).toBe(true);
    });

    it('should start and stop correctly', () => {
      expect(silenceDetector.isEnabled()).toBe(false);

      silenceDetector.start();
      expect(silenceDetector.isEnabled()).toBe(true);

      silenceDetector.stop();
      expect(silenceDetector.isEnabled()).toBe(false);
    });

    it('should trigger callback after threshold', () => {
      silenceDetector.start();

      // Advance past threshold
      vi.advanceTimersByTime(31000);

      expect(silenceCallback).toHaveBeenCalledTimes(1);
      expect(silenceCallback).toHaveBeenCalledWith(expect.objectContaining({
        silenceDurationMs: expect.any(Number),
        lastActivityTime: expect.any(Number),
        silenceCount: 1
      }));
    });

    it('should reset timer on activity', () => {
      silenceDetector.start();

      // Advance partially
      vi.advanceTimersByTime(15000);
      expect(silenceCallback).not.toHaveBeenCalled();

      // Record activity
      silenceDetector.recordActivity();

      // Advance past original threshold
      vi.advanceTimersByTime(20000);
      expect(silenceCallback).not.toHaveBeenCalled();

      // Advance full threshold after activity
      vi.advanceTimersByTime(15000);
      expect(silenceCallback).toHaveBeenCalledTimes(1);
    });

    it('should clamp threshold to valid range', () => {
      silenceDetector.setThreshold(5000); // Below minimum
      expect(silenceDetector.getThreshold()).toBe(10000);

      silenceDetector.setThreshold(200000); // Above maximum
      expect(silenceDetector.getThreshold()).toBe(120000);
    });

    it('should track silence statistics', () => {
      silenceDetector.start();

      // First silence
      vi.advanceTimersByTime(31000);
      expect(silenceDetector.getStats().silenceCount).toBe(1);

      // Second silence (auto-restart)
      vi.advanceTimersByTime(31000);
      expect(silenceDetector.getStats().silenceCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Points Summary
  // ---------------------------------------------------------------------------

  describe('Integration Points Summary', () => {
    it('documents all RAG pipeline integration points', () => {
      // This test serves as documentation
      const integrationPoints = {
        'EmbeddingService → OpenAIClient': 'Uses OpenAIClient.post() for embedding API calls',
        'RAGVectorStore → EmbeddingService': 'Uses EmbeddingService.embed() for vector generation',
        'RAGRetriever → RAGVectorStore': 'Uses VectorStore.search() for semantic search',
        'RAGRetriever → JournalParser': 'Uses JournalParser.getChunksForEmbedding() for indexing',
        'RAGRetriever → CompendiumParser': 'Uses CompendiumParser.getChunksForEmbedding() for indexing',
        'RAGRetriever → Keyword Fallback': 'Uses parsers.searchByKeywords() when vector search fails',
        'SilenceDetector → AIAssistant': 'AIAssistant.setSilenceDetector() for autonomous suggestions',
        'RAGRetriever → AIAssistant': 'AIAssistant.setRAGRetriever() for context-aware suggestions',
        'VoxChronicle → All Services': 'VoxChronicle.initialize() wires all RAG services'
      };

      expect(Object.keys(integrationPoints)).toHaveLength(9);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling Tests
  // ---------------------------------------------------------------------------

  describe('Error Handling Across Service Boundaries', () => {
    it('should handle embedding service errors in vector store', async () => {
      const failingClient = createMockOpenAIClient({
        post: vi.fn().mockRejectedValue(new Error('Embedding failed'))
      });

      const failingEmbedding = new EmbeddingService({
        openaiClient: failingClient
      });

      const failingVectorStore = new RAGVectorStore({
        embeddingService: failingEmbedding,
        persistToIndexedDB: false
      });

      await expect(failingVectorStore.add('test document', {}))
        .rejects.toThrow('Embedding failed');
    });

    it('should handle missing required services gracefully', () => {
      const retriever = new RAGRetriever({});

      expect(retriever.isConfigured()).toBe(false);
      expect(retriever.hasKeywordFallback()).toBe(false);
      expect(retriever.hasIndex()).toBe(false);
    });
  });
});
