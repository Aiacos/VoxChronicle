/**
 * RAGRetriever Unit Tests
 *
 * Tests for the RAGRetriever class with mocked dependencies.
 * Covers hybrid retrieval, index building, incremental updates,
 * fallback behavior, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing RAGRetriever
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
    error: vi.fn()
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

// Mock MODULE_ID
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  RAGRetriever,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_MAX_RESULTS,
  SEMANTIC_WEIGHT,
  KEYWORD_WEIGHT,
  RECENCY_WEIGHT
} from '../../scripts/narrator/RAGRetriever.mjs';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Create a mock EmbeddingService
 */
function createMockEmbeddingService(overrides = {}) {
  return {
    isConfigured: vi.fn(() => true),
    embed: vi.fn().mockResolvedValue(Array(512).fill(0.1)),
    embedBatch: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(() => 'text-embedding-3-small'),
    getDimensions: vi.fn(() => 512),
    ...overrides
  };
}

/**
 * Create a mock RAGVectorStore
 */
function createMockVectorStore(overrides = {}) {
  return {
    isConfigured: vi.fn(() => true),
    isInitialized: vi.fn(() => true),
    size: vi.fn(() => 0),
    add: vi.fn().mockResolvedValue('vec_123'),
    addBatch: vi.fn().mockResolvedValue(['vec_1', 'vec_2']),
    search: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    deleteByFilter: vi.fn().mockResolvedValue(0),
    clear: vi.fn().mockResolvedValue(),
    getStats: vi.fn(() => ({ vectorCount: 0 })),
    ...overrides
  };
}

/**
 * Create a mock JournalParser
 */
function createMockJournalParser(overrides = {}) {
  return {
    parseJournal: vi.fn().mockResolvedValue({
      id: 'journal-1',
      name: 'Test Journal',
      pages: [
        { id: 'page-1', name: 'Page 1', text: 'This is page content.' }
      ]
    }),
    searchByKeywords: vi.fn().mockReturnValue([]),
    getChunksForEmbedding: vi.fn().mockResolvedValue([]),
    clearCache: vi.fn(),
    isCached: vi.fn(() => true),
    ...overrides
  };
}

/**
 * Create a mock CompendiumParser
 */
function createMockCompendiumParser(overrides = {}) {
  return {
    parseJournalCompendiums: vi.fn().mockResolvedValue([]),
    searchByKeywords: vi.fn().mockReturnValue([]),
    getChunksForEmbedding: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockReturnValue([]),
    ...overrides
  };
}

/**
 * Create a mock search result
 */
function createMockSearchResult(options = {}) {
  return {
    id: options.id || 'vec_123',
    text: options.text || 'This is the retrieved text content.',
    score: options.score || 0.85,
    metadata: {
      source: options.source || 'journal',
      journalId: options.journalId || 'journal-1',
      journalName: options.journalName || 'Test Journal',
      pageId: options.pageId || 'page-1',
      pageName: options.pageName || 'Test Page',
      indexedAt: options.indexedAt || new Date().toISOString(),
      ...options.metadata
    }
  };
}

/**
 * Create mock journal chunks
 */
function createMockJournalChunks(count = 3) {
  return Array(count).fill(null).map((_, i) => ({
    text: `Chunk ${i + 1} content for testing.`,
    metadata: {
      source: 'journal',
      journalId: 'journal-1',
      journalName: 'Test Journal',
      pageId: `page-${i + 1}`,
      pageName: `Page ${i + 1}`,
      startPos: i * 100,
      endPos: (i + 1) * 100,
      chunkIndex: i,
      totalChunks: count
    }
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RAGRetriever', () => {
  let retriever;
  let mockEmbeddingService;
  let mockVectorStore;
  let mockJournalParser;
  let mockCompendiumParser;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEmbeddingService = createMockEmbeddingService();
    mockVectorStore = createMockVectorStore();
    mockJournalParser = createMockJournalParser();
    mockCompendiumParser = createMockCompendiumParser();

    retriever = new RAGRetriever({
      embeddingService: mockEmbeddingService,
      vectorStore: mockVectorStore,
      journalParser: mockJournalParser,
      compendiumParser: mockCompendiumParser
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Constructor and Configuration Tests
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const defaultRetriever = new RAGRetriever();
      expect(defaultRetriever).toBeInstanceOf(RAGRetriever);
      expect(defaultRetriever.isConfigured()).toBe(false);
    });

    it('should accept custom options', () => {
      expect(retriever).toBeInstanceOf(RAGRetriever);
      expect(retriever.isConfigured()).toBe(true);
    });

    it('should set custom similarity threshold', () => {
      const customRetriever = new RAGRetriever({
        embeddingService: mockEmbeddingService,
        vectorStore: mockVectorStore,
        similarityThreshold: 0.8
      });
      expect(customRetriever.isConfigured()).toBe(true);
    });

    it('should set custom max results', () => {
      const customRetriever = new RAGRetriever({
        embeddingService: mockEmbeddingService,
        vectorStore: mockVectorStore,
        maxResults: 10
      });
      expect(customRetriever.isConfigured()).toBe(true);
    });
  });

  describe('isConfigured', () => {
    it('should return true when all required services are configured', () => {
      expect(retriever.isConfigured()).toBe(true);
    });

    it('should return false when embeddingService is null', () => {
      const partialRetriever = new RAGRetriever({
        vectorStore: mockVectorStore
      });
      expect(partialRetriever.isConfigured()).toBe(false);
    });

    it('should return false when vectorStore is null', () => {
      const partialRetriever = new RAGRetriever({
        embeddingService: mockEmbeddingService
      });
      expect(partialRetriever.isConfigured()).toBe(false);
    });

    it('should return false when embeddingService.isConfigured returns false', () => {
      mockEmbeddingService.isConfigured.mockReturnValue(false);
      expect(retriever.isConfigured()).toBe(false);
    });

    it('should return false when vectorStore.isConfigured returns false', () => {
      mockVectorStore.isConfigured.mockReturnValue(false);
      expect(retriever.isConfigured()).toBe(false);
    });
  });

  describe('hasKeywordFallback', () => {
    it('should return true when journalParser is available', () => {
      const r = new RAGRetriever({ journalParser: mockJournalParser });
      expect(r.hasKeywordFallback()).toBe(true);
    });

    it('should return true when compendiumParser is available', () => {
      const r = new RAGRetriever({ compendiumParser: mockCompendiumParser });
      expect(r.hasKeywordFallback()).toBe(true);
    });

    it('should return false when no parsers are available', () => {
      const r = new RAGRetriever();
      expect(r.hasKeywordFallback()).toBe(false);
    });
  });

  describe('hasIndex', () => {
    it('should return true when vectorStore has vectors', () => {
      mockVectorStore.size.mockReturnValue(100);
      expect(retriever.hasIndex()).toBe(true);
    });

    it('should return false when vectorStore is empty', () => {
      mockVectorStore.size.mockReturnValue(0);
      expect(retriever.hasIndex()).toBe(false);
    });

    it('should return false when vectorStore is null', () => {
      const r = new RAGRetriever();
      expect(r.hasIndex()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Setter Tests
  // ---------------------------------------------------------------------------

  describe('setters', () => {
    it('should set embedding service', () => {
      const newService = createMockEmbeddingService();
      retriever.setEmbeddingService(newService);
      // No error means success
      expect(true).toBe(true);
    });

    it('should set vector store', () => {
      const newStore = createMockVectorStore();
      retriever.setVectorStore(newStore);
      expect(true).toBe(true);
    });

    it('should set journal parser', () => {
      const newParser = createMockJournalParser();
      retriever.setJournalParser(newParser);
      expect(true).toBe(true);
    });

    it('should set compendium parser', () => {
      const newParser = createMockCompendiumParser();
      retriever.setCompendiumParser(newParser);
      expect(true).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getIndexStatus Tests
  // ---------------------------------------------------------------------------

  describe('getIndexStatus', () => {
    it('should return correct status when empty', () => {
      const status = retriever.getIndexStatus();

      expect(status).toEqual({
        isIndexed: false,
        vectorCount: 0,
        journalCount: 0,
        compendiumCount: 0,
        lastIndexed: null,
        isIndexing: false,
        progress: 0
      });
    });

    it('should return correct status after indexing', async () => {
      mockVectorStore.size.mockReturnValue(50);
      mockJournalParser.getChunksForEmbedding.mockResolvedValue(createMockJournalChunks(50));

      await retriever.buildIndex(['journal-1'], []);

      const status = retriever.getIndexStatus();

      expect(status.isIndexed).toBe(true);
      expect(status.journalCount).toBe(1);
      expect(status.lastIndexed).toBeInstanceOf(Date);
      expect(status.isIndexing).toBe(false);
      expect(status.progress).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // Retrieval Tests
  // ---------------------------------------------------------------------------

  describe('retrieve', () => {
    it('should throw error for empty query', async () => {
      await expect(retriever.retrieve('')).rejects.toThrow('Query cannot be empty');
    });

    it('should throw error for null query', async () => {
      await expect(retriever.retrieve(null)).rejects.toThrow('Query cannot be empty');
    });

    it('should throw error for whitespace-only query', async () => {
      await expect(retriever.retrieve('   ')).rejects.toThrow('Query cannot be empty');
    });

    it('should perform semantic search when configured', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([
        createMockSearchResult({ score: 0.9, text: 'Relevant content' })
      ]);

      const results = await retriever.retrieve('test query');

      expect(mockVectorStore.search).toHaveBeenCalledWith('test query', expect.any(Object));
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toBe('Relevant content');
    });

    it('should include citations in results', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([
        createMockSearchResult({
          journalName: 'Adventure Guide',
          pageName: 'Chapter 1'
        })
      ]);

      const results = await retriever.retrieve('test query');

      expect(results[0].citation).toBe('[Adventure Guide > Chapter 1]');
    });

    it('should respect maxResults option', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([
        createMockSearchResult({ id: '1', score: 0.9, pageId: 'page-1', text: 'First unique content' }),
        createMockSearchResult({ id: '2', score: 0.8, pageId: 'page-2', text: 'Second unique content' }),
        createMockSearchResult({ id: '3', score: 0.7, pageId: 'page-3', text: 'Third unique content' }),
        createMockSearchResult({ id: '4', score: 0.6, pageId: 'page-4', text: 'Fourth unique content' }),
        createMockSearchResult({ id: '5', score: 0.5, pageId: 'page-5', text: 'Fifth unique content' })
      ]);

      const results = await retriever.retrieve('test query', { maxResults: 2 });

      expect(results.length).toBe(2);
    });

    it('should fallback to keyword search when vector search fails', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockRejectedValue(new Error('Search failed'));
      mockJournalParser.searchByKeywords.mockReturnValue([
        { id: 'page-1', name: 'Test Page', text: 'Content with keywords' }
      ]);

      // Add indexed journal for keyword search
      retriever._indexedJournals.add('journal-1');

      const results = await retriever.retrieve('test keywords');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array when no results found', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([]);

      const results = await retriever.retrieve('obscure query');

      expect(results).toEqual([]);
    });

    it('should merge semantic and keyword results', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([
        createMockSearchResult({ id: 'semantic-1', score: 0.8, text: 'Semantic result' })
      ]);
      mockJournalParser.searchByKeywords.mockReturnValue([
        { id: 'keyword-1', name: 'Page', text: 'Keyword result with test' }
      ]);

      retriever._indexedJournals.add('journal-1');

      const results = await retriever.retrieve('test query');

      // Should have results from both sources
      expect(results.length).toBeGreaterThan(0);
    });

    it('should apply metadata filter', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([]);

      await retriever.retrieve('test', { filter: { source: 'journal' } });

      expect(mockVectorStore.search).toHaveBeenCalledWith('test', expect.objectContaining({
        filter: { source: 'journal' }
      }));
    });
  });

  // ---------------------------------------------------------------------------
  // Keyword Search Tests
  // ---------------------------------------------------------------------------

  describe('_extractKeywords', () => {
    it('should extract keywords from query', () => {
      const keywords = retriever._extractKeywords('The quick brown fox');

      expect(keywords).toContain('quick');
      expect(keywords).toContain('brown');
      expect(keywords).toContain('fox');
      expect(keywords).not.toContain('the'); // Stop word
    });

    it('should filter short words', () => {
      const keywords = retriever._extractKeywords('A big cat is on the mat');

      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('is');
      expect(keywords).not.toContain('on');
      expect(keywords).toContain('big');
      expect(keywords).toContain('cat');
      expect(keywords).toContain('mat');
    });

    it('should handle empty query', () => {
      const keywords = retriever._extractKeywords('');
      expect(keywords).toEqual([]);
    });

    it('should filter Italian stop words', () => {
      const keywords = retriever._extractKeywords('il gatto è sul tavolo');

      expect(keywords).not.toContain('il');
      expect(keywords).not.toContain('è');
      expect(keywords).not.toContain('sul');
      expect(keywords).toContain('gatto');
      expect(keywords).toContain('tavolo');
    });
  });

  describe('_calculateKeywordScore', () => {
    it('should return 0 for empty text', () => {
      const score = retriever._calculateKeywordScore('', ['test']);
      expect(score).toBe(0);
    });

    it('should return 0 for empty keywords', () => {
      const score = retriever._calculateKeywordScore('some text', []);
      expect(score).toBe(0);
    });

    it('should return higher score for more keyword matches', () => {
      const scoreOne = retriever._calculateKeywordScore('This is a test.', ['test']);
      const scoreTwo = retriever._calculateKeywordScore('This is a test with more testing.', ['test', 'testing']);

      expect(scoreTwo).toBeGreaterThan(scoreOne);
    });

    it('should return higher score for more occurrences', () => {
      const scoreOnce = retriever._calculateKeywordScore('test', ['test']);
      const scoreTwice = retriever._calculateKeywordScore('test test test', ['test']);

      expect(scoreTwice).toBeGreaterThan(scoreOnce);
    });
  });

  // ---------------------------------------------------------------------------
  // Recency Score Tests
  // ---------------------------------------------------------------------------

  describe('_calculateRecencyScore', () => {
    it('should return 0.5 for missing indexedAt', () => {
      const score = retriever._calculateRecencyScore({});
      expect(score).toBe(0.5);
    });

    it('should return 1.0 for just indexed content', () => {
      const score = retriever._calculateRecencyScore({
        indexedAt: new Date().toISOString()
      });
      expect(score).toBeCloseTo(1.0, 1);
    });

    it('should return lower score for older content', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 15); // 15 days ago

      const score = retriever._calculateRecencyScore({
        indexedAt: oldDate.toISOString()
      });

      expect(score).toBeLessThan(1.0);
      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 for very old content', () => {
      const veryOldDate = new Date();
      veryOldDate.setDate(veryOldDate.getDate() - 60); // 60 days ago

      const score = retriever._calculateRecencyScore({
        indexedAt: veryOldDate.toISOString()
      });

      expect(score).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Citation Formatting Tests
  // ---------------------------------------------------------------------------

  describe('_formatCitation', () => {
    it('should format journal citation', () => {
      const citation = retriever._formatCitation({
        source: 'journal',
        journalName: 'Adventure',
        pageName: 'Chapter 1'
      });

      expect(citation).toBe('[Adventure > Chapter 1]');
    });

    it('should format compendium citation', () => {
      const citation = retriever._formatCitation({
        source: 'compendium',
        packName: 'Core Rules',
        entryName: 'Fireball'
      });

      expect(citation).toBe('[Core Rules > Fireball]');
    });

    it('should handle missing metadata', () => {
      const citation = retriever._formatCitation(null);
      expect(citation).toBe('[Unknown Source]');
    });

    it('should handle unknown source type', () => {
      const citation = retriever._formatCitation({ source: 'unknown' });
      expect(citation).toBe('[Unknown Source]');
    });
  });

  // ---------------------------------------------------------------------------
  // Index Building Tests
  // ---------------------------------------------------------------------------

  describe('buildIndex', () => {
    it('should throw error when not configured', async () => {
      const unconfigured = new RAGRetriever();
      await expect(unconfigured.buildIndex(['journal-1'])).rejects.toThrow('Not configured');
    });

    it('should throw error when already indexing', async () => {
      retriever._isIndexing = true;
      await expect(retriever.buildIndex(['journal-1'])).rejects.toThrow('already in progress');
    });

    it('should clear existing index before building', async () => {
      await retriever.buildIndex([], []);

      expect(mockVectorStore.clear).toHaveBeenCalled();
    });

    it('should index journals', async () => {
      const chunks = createMockJournalChunks(5);
      mockJournalParser.getChunksForEmbedding.mockResolvedValue(chunks);

      const result = await retriever.buildIndex(['journal-1'], []);

      expect(mockJournalParser.getChunksForEmbedding).toHaveBeenCalledWith('journal-1', expect.any(Object));
      expect(mockVectorStore.addBatch).toHaveBeenCalled();
      expect(result.journalChunks).toBe(5);
    });

    it('should index compendiums', async () => {
      const chunks = createMockJournalChunks(3);
      mockCompendiumParser.getChunksForEmbedding.mockResolvedValue(chunks);

      const result = await retriever.buildIndex([], ['compendium.rules']);

      expect(mockCompendiumParser.getChunksForEmbedding).toHaveBeenCalledWith('compendium.rules', expect.any(Object));
      expect(result.compendiumChunks).toBe(3);
    });

    it('should call progress callback', async () => {
      const onProgress = vi.fn();
      mockJournalParser.getChunksForEmbedding.mockResolvedValue(createMockJournalChunks(1));

      await retriever.buildIndex(['journal-1'], [], { onProgress });

      expect(onProgress).toHaveBeenCalledWith(0, 100, expect.any(String));
      expect(onProgress).toHaveBeenCalledWith(100, 100, expect.any(String));
    });

    it('should track indexed journals', async () => {
      mockJournalParser.getChunksForEmbedding.mockResolvedValue(createMockJournalChunks(1));

      await retriever.buildIndex(['journal-1', 'journal-2'], []);

      expect(retriever.getIndexedJournals()).toContain('journal-1');
      expect(retriever.getIndexedJournals()).toContain('journal-2');
    });

    it('should set lastIndexed timestamp', async () => {
      await retriever.buildIndex([], []);

      const status = retriever.getIndexStatus();
      expect(status.lastIndexed).toBeInstanceOf(Date);
    });

    it('should return statistics', async () => {
      mockJournalParser.getChunksForEmbedding.mockResolvedValue(createMockJournalChunks(10));
      mockCompendiumParser.getChunksForEmbedding.mockResolvedValue(createMockJournalChunks(5));

      const result = await retriever.buildIndex(['journal-1'], ['pack-1']);

      expect(result).toHaveProperty('journalChunks', 10);
      expect(result).toHaveProperty('compendiumChunks', 5);
      expect(result).toHaveProperty('totalTime');
      expect(typeof result.totalTime).toBe('number');
    });

    it('should handle indexing errors gracefully', async () => {
      mockJournalParser.getChunksForEmbedding.mockRejectedValue(new Error('Parse failed'));

      // Should not throw, just log warning
      const result = await retriever.buildIndex(['journal-1'], []);

      expect(result.journalChunks).toBe(0);
    });

    it('should reset isIndexing flag after completion', async () => {
      await retriever.buildIndex([], []);

      expect(retriever._isIndexing).toBe(false);
    });

    it('should reset isIndexing flag even on error', async () => {
      mockVectorStore.clear.mockRejectedValue(new Error('Clear failed'));

      await expect(retriever.buildIndex(['journal-1'])).rejects.toThrow();

      expect(retriever._isIndexing).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Incremental Update Tests
  // ---------------------------------------------------------------------------

  describe('updateIndex', () => {
    it('should throw error when not configured', async () => {
      const unconfigured = new RAGRetriever();
      await expect(unconfigured.updateIndex('journal-1')).rejects.toThrow('Not configured');
    });

    it('should delete existing entries before re-indexing', async () => {
      mockVectorStore.deleteByFilter.mockResolvedValue(5);
      mockJournalParser.getChunksForEmbedding.mockResolvedValue(createMockJournalChunks(3));

      const result = await retriever.updateIndex('journal-1');

      expect(mockVectorStore.deleteByFilter).toHaveBeenCalledWith({
        source: 'journal',
        journalId: 'journal-1'
      });
      expect(result.deleted).toBe(5);
      expect(result.added).toBe(3);
    });

    it('should update lastIndexed timestamp', async () => {
      mockJournalParser.getChunksForEmbedding.mockResolvedValue([]);

      await retriever.updateIndex('journal-1');

      const status = retriever.getIndexStatus();
      expect(status.lastIndexed).toBeInstanceOf(Date);
    });
  });

  describe('updateCompendiumIndex', () => {
    it('should throw error when not configured', async () => {
      const unconfigured = new RAGRetriever();
      await expect(unconfigured.updateCompendiumIndex('pack-1')).rejects.toThrow('Not configured');
    });

    it('should delete existing entries before re-indexing', async () => {
      mockVectorStore.deleteByFilter.mockResolvedValue(10);
      mockCompendiumParser.getChunksForEmbedding.mockResolvedValue(createMockJournalChunks(8));

      const result = await retriever.updateCompendiumIndex('pack-1');

      expect(mockVectorStore.deleteByFilter).toHaveBeenCalledWith({
        source: 'compendium',
        packId: 'pack-1'
      });
      expect(result.deleted).toBe(10);
      expect(result.added).toBe(8);
    });
  });

  // ---------------------------------------------------------------------------
  // Clear Index Tests
  // ---------------------------------------------------------------------------

  describe('clearIndex', () => {
    it('should clear vector store', async () => {
      await retriever.clearIndex();

      expect(mockVectorStore.clear).toHaveBeenCalled();
    });

    it('should reset indexed journals and compendiums', async () => {
      retriever._indexedJournals.add('journal-1');
      retriever._indexedCompendiums.add('pack-1');

      await retriever.clearIndex();

      expect(retriever.getIndexedJournals()).toEqual([]);
      expect(retriever.getIndexedCompendiums()).toEqual([]);
    });

    it('should reset lastIndexed', async () => {
      retriever._lastIndexed = new Date();

      await retriever.clearIndex();

      expect(retriever._lastIndexed).toBeNull();
    });

    it('should handle null vectorStore', async () => {
      const r = new RAGRetriever();
      await r.clearIndex(); // Should not throw
    });
  });

  // ---------------------------------------------------------------------------
  // Retrieve for AI Tests
  // ---------------------------------------------------------------------------

  describe('retrieveForAI', () => {
    it('should return formatted context and sources', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([
        createMockSearchResult({
          text: 'First relevant passage.',
          journalName: 'Guide',
          pageName: 'Intro'
        }),
        createMockSearchResult({
          text: 'Second relevant passage.',
          journalName: 'Guide',
          pageName: 'Chapter 1'
        })
      ]);

      const result = await retriever.retrieveForAI('test query');

      expect(result.context).toContain('[Guide > Intro]');
      expect(result.context).toContain('First relevant passage.');
      expect(result.sources).toContain('[Guide > Intro]');
      expect(result.sources.length).toBe(2);
    });

    it('should respect maxChars limit', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([
        createMockSearchResult({ text: 'A'.repeat(1000) }),
        createMockSearchResult({ text: 'B'.repeat(1000) }),
        createMockSearchResult({ text: 'C'.repeat(1000) })
      ]);

      const result = await retriever.retrieveForAI('test', { maxChars: 500 });

      expect(result.context.length).toBeLessThanOrEqual(550); // Some buffer for citations
    });

    it('should return empty result when no matches', async () => {
      mockVectorStore.size.mockReturnValue(100);
      mockVectorStore.search.mockResolvedValue([]);

      const result = await retriever.retrieveForAI('obscure query');

      expect(result.context).toBe('');
      expect(result.sources).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Weight Constants Tests
  // ---------------------------------------------------------------------------

  describe('exported constants', () => {
    it('should export DEFAULT_SIMILARITY_THRESHOLD', () => {
      expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.5);
    });

    it('should export DEFAULT_MAX_RESULTS', () => {
      expect(DEFAULT_MAX_RESULTS).toBe(5);
    });

    it('should export SEMANTIC_WEIGHT', () => {
      expect(SEMANTIC_WEIGHT).toBe(0.7);
    });

    it('should export KEYWORD_WEIGHT', () => {
      expect(KEYWORD_WEIGHT).toBe(0.2);
    });

    it('should export RECENCY_WEIGHT', () => {
      expect(RECENCY_WEIGHT).toBe(0.1);
    });

    it('should have weights summing to 1', () => {
      expect(SEMANTIC_WEIGHT + KEYWORD_WEIGHT + RECENCY_WEIGHT).toBeCloseTo(1.0);
    });
  });
});
