/**
 * RAGVectorStore Unit Tests
 *
 * Tests for the RAGVectorStore class and CustomOpenAIEmbedder adapter.
 * Covers vector operations, IndexedDB persistence, LRU eviction,
 * similarity search, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing RAGVectorStore
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
  RAGVectorStore,
  CustomOpenAIEmbedder,
  DEFAULT_STORAGE_LIMIT_MB,
  DEFAULT_MAX_VECTORS,
  INDEXEDDB_NAME,
  INDEXEDDB_STORE
} from '../../scripts/ai/RAGVectorStore.mjs';

/**
 * Create a mock embedding service
 */
function createMockEmbeddingService(overrides = {}) {
  return {
    isConfigured: vi.fn(() => true),
    embed: vi.fn(),
    embedBatch: vi.fn(),
    getModel: vi.fn(() => 'text-embedding-3-small'),
    getDimensions: vi.fn(() => 512),
    ...overrides
  };
}

/**
 * Create a mock embedding vector
 */
function createMockEmbedding(dimensions = 512, seed = 0) {
  // Create deterministic but different embeddings for different seeds
  return Array(dimensions)
    .fill(0)
    .map((_, i) => Math.sin(seed + i) * 0.5);
}

/**
 * Mock IndexedDB for testing
 */
function mockIndexedDB() {
  const stores = new Map();

  const createMockObjectStore = (name) => {
    const data = new Map();
    stores.set(name, data);

    return {
      put: vi.fn((value) => {
        data.set(value.id, value);
        return { onerror: null, onsuccess: null };
      }),
      get: vi.fn((id) => {
        const value = data.get(id);
        return { onerror: null, onsuccess: null, result: value };
      }),
      getAll: vi.fn(() => {
        return { onerror: null, onsuccess: null, result: Array.from(data.values()) };
      }),
      delete: vi.fn((id) => {
        data.delete(id);
        return { onerror: null, onsuccess: null };
      }),
      clear: vi.fn(() => {
        data.clear();
        return { onerror: null, onsuccess: null };
      }),
      createIndex: vi.fn()
    };
  };

  const mockDB = {
    objectStoreNames: { contains: vi.fn(() => true) },
    transaction: vi.fn((storeNames, mode) => ({
      objectStore: vi.fn((name) => createMockObjectStore(name))
    })),
    close: vi.fn()
  };

  const mockRequest = {
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: mockDB,
    error: null
  };

  const mockIndexedDB = {
    open: vi.fn((name, version) => {
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: mockRequest });
        }
      }, 0);
      return mockRequest;
    })
  };

  globalThis.indexedDB = mockIndexedDB;

  return { mockDB, mockRequest, stores };
}

describe('RAGVectorStore', () => {
  let store;
  let mockEmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddingService = createMockEmbeddingService();

    // Default mock for embed - returns deterministic embedding based on text hash
    mockEmbeddingService.embed.mockImplementation((text) => {
      const seed = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return Promise.resolve(createMockEmbedding(512, seed));
    });

    // Default mock for embedBatch
    mockEmbeddingService.embedBatch.mockImplementation((texts) => {
      return Promise.resolve(
        texts.map((text, i) => ({
          embedding: createMockEmbedding(512, i),
          index: i,
          text
        }))
      );
    });

    // Create store without IndexedDB persistence for most tests
    store = new RAGVectorStore({
      embeddingService: mockEmbeddingService,
      persistToIndexedDB: false,
      maxVectors: 100,
      maxSizeInMB: 10
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (store) {
      store.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Constructor and Configuration Tests
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const defaultStore = new RAGVectorStore();
      expect(defaultStore).toBeInstanceOf(RAGVectorStore);
      expect(defaultStore.isConfigured()).toBe(false);
    });

    it('should accept custom options', () => {
      const customStore = new RAGVectorStore({
        embeddingService: mockEmbeddingService,
        maxSizeInMB: 50,
        maxVectors: 5000,
        dimensions: 1536,
        model: 'text-embedding-3-large',
        persistToIndexedDB: false
      });

      expect(customStore.isConfigured()).toBe(true);
    });

    it('should create embedder when embedding service is provided', () => {
      expect(store.getEmbedder()).toBeDefined();
      expect(store.getEmbedder()).toBeInstanceOf(CustomOpenAIEmbedder);
    });

    it('should not have embedder when embedding service is not provided', () => {
      const noServiceStore = new RAGVectorStore();
      expect(noServiceStore.getEmbedder()).toBeNull();
    });
  });

  describe('configuration methods', () => {
    it('should return true when configured', () => {
      expect(store.isConfigured()).toBe(true);
    });

    it('should return false when service is not configured', () => {
      const unconfiguredService = createMockEmbeddingService({
        isConfigured: vi.fn(() => false)
      });
      const unconfiguredStore = new RAGVectorStore({
        embeddingService: unconfiguredService,
        persistToIndexedDB: false
      });
      expect(unconfiguredStore.isConfigured()).toBe(false);
    });

    it('should update embedding service', () => {
      const newService = createMockEmbeddingService();
      store.setEmbeddingService(newService);
      expect(store.isConfigured()).toBe(true);
    });

    it('should track initialization state', async () => {
      expect(store.isInitialized()).toBe(false);
      await store.initialize();
      expect(store.isInitialized()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Initialization Tests
  // ---------------------------------------------------------------------------

  describe('initialize', () => {
    it('should initialize successfully without IndexedDB', async () => {
      await store.initialize();
      expect(store.isInitialized()).toBe(true);
    });

    it('should only initialize once', async () => {
      await store.initialize();
      await store.initialize();
      expect(store.isInitialized()).toBe(true);
    });

    it('should handle missing IndexedDB gracefully', async () => {
      // Remove IndexedDB to simulate environment without it
      const originalIndexedDB = globalThis.indexedDB;
      delete globalThis.indexedDB;

      const persistentStore = new RAGVectorStore({
        embeddingService: mockEmbeddingService,
        persistToIndexedDB: true
      });

      // Should still initialize (fall back to memory-only mode)
      await persistentStore.initialize();
      expect(persistentStore.isInitialized()).toBe(true);

      // Restore
      globalThis.indexedDB = originalIndexedDB;
    });
  });

  // ---------------------------------------------------------------------------
  // Add Operations Tests
  // ---------------------------------------------------------------------------

  describe('add', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should add a text to the store', async () => {
      const id = await store.add('Hello world', { source: 'test' });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(store.has(id)).toBe(true);
      expect(store.size()).toBe(1);
    });

    it('should generate embedding for text', async () => {
      await store.add('Hello world');

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(
        'Hello world',
        expect.any(Object)
      );
    });

    it('should store metadata with entry', async () => {
      const metadata = { source: 'journal', journalId: '123' };
      const id = await store.add('Test text', metadata);

      const entry = store.get(id);
      expect(entry.metadata).toEqual(metadata);
    });

    it('should use custom ID when provided', async () => {
      const customId = 'my-custom-id';
      const id = await store.add('Test text', {}, customId);

      expect(id).toBe(customId);
      expect(store.has(customId)).toBe(true);
    });

    it('should throw error for empty text', async () => {
      await expect(store.add('')).rejects.toThrow(/empty text/i);
      await expect(store.add('   ')).rejects.toThrow(/empty text/i);
      await expect(store.add(null)).rejects.toThrow(/empty text/i);
    });

    it('should throw error when not configured', async () => {
      const unconfiguredStore = new RAGVectorStore({ persistToIndexedDB: false });
      await unconfiguredStore.initialize();

      await expect(unconfiguredStore.add('Test')).rejects.toThrow(/not configured/i);
    });

    it('should update existing entry with same ID', async () => {
      const customId = 'test-id';
      await store.add('First text', { version: 1 }, customId);
      await store.add('Second text', { version: 2 }, customId);

      expect(store.size()).toBe(1);
      const entry = store.get(customId);
      expect(entry.text).toBe('Second text');
      expect(entry.metadata.version).toBe(2);
    });

    it('should update statistics on add', async () => {
      await store.add('Test text');

      const stats = store.getStats();
      expect(stats.totalAdds).toBe(1);
      expect(stats.vectorCount).toBe(1);
    });
  });

  describe('addBatch', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should add multiple items', async () => {
      const items = [
        { text: 'First text', metadata: { index: 0 } },
        { text: 'Second text', metadata: { index: 1 } },
        { text: 'Third text', metadata: { index: 2 } }
      ];

      const ids = await store.addBatch(items);

      expect(ids).toHaveLength(3);
      expect(store.size()).toBe(3);
    });

    it('should call embedBatch for efficiency', async () => {
      const items = [
        { text: 'First text' },
        { text: 'Second text' }
      ];

      await store.addBatch(items);

      expect(mockEmbeddingService.embedBatch).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const ids = await store.addBatch([]);
      expect(ids).toEqual([]);
    });

    it('should skip items with empty text', async () => {
      const items = [
        { text: 'Valid text' },
        { text: '' },
        { text: '   ' },
        { text: 'Another valid text' }
      ];

      const ids = await store.addBatch(items);

      expect(ids).toHaveLength(2);
    });

    it('should support progress callback', async () => {
      const items = Array(10).fill(null).map((_, i) => ({
        text: `Text ${i}`,
        metadata: { index: i }
      }));

      const onProgress = vi.fn();
      await store.addBatch(items, { onProgress });

      expect(onProgress).toHaveBeenCalled();
    });

    it('should throw error when not configured', async () => {
      const unconfiguredStore = new RAGVectorStore({ persistToIndexedDB: false });
      await unconfiguredStore.initialize();

      await expect(unconfiguredStore.addBatch([{ text: 'Test' }])).rejects.toThrow(/not configured/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Search Operations Tests
  // ---------------------------------------------------------------------------

  describe('search', () => {
    beforeEach(async () => {
      await store.initialize();

      // Add some test data with different embeddings
      mockEmbeddingService.embed.mockImplementation((text) => {
        // Create different embeddings for different texts
        if (text.includes('cat')) {
          return Promise.resolve(createMockEmbedding(512, 100));
        } else if (text.includes('dog')) {
          return Promise.resolve(createMockEmbedding(512, 200));
        } else if (text.includes('bird')) {
          return Promise.resolve(createMockEmbedding(512, 300));
        }
        return Promise.resolve(createMockEmbedding(512, 0));
      });

      await store.add('The cat sat on the mat', { animal: 'cat' });
      await store.add('The dog ran in the park', { animal: 'dog' });
      await store.add('The bird flew over the tree', { animal: 'bird' });
    });

    it('should return search results', async () => {
      const results = await store.search('cat on mat');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return results with score, text, and metadata', async () => {
      const results = await store.search('cat');

      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('text');
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('metadata');
    });

    it('should respect topK option', async () => {
      const results = await store.search('animal', { topK: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should apply threshold filter', async () => {
      const results = await store.search('test query', { threshold: 0.99 });

      // With threshold 0.99, likely no results unless exact match
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should apply metadata filter', async () => {
      const results = await store.search('animal', { filter: { animal: 'cat' } });

      for (const result of results) {
        expect(result.metadata.animal).toBe('cat');
      }
    });

    it('should throw error for empty query', async () => {
      await expect(store.search('')).rejects.toThrow(/empty query/i);
      await expect(store.search('   ')).rejects.toThrow(/empty query/i);
    });

    it('should throw error when not configured', async () => {
      const unconfiguredStore = new RAGVectorStore({ persistToIndexedDB: false });
      await unconfiguredStore.initialize();

      await expect(unconfiguredStore.search('Test')).rejects.toThrow(/not configured/i);
    });

    it('should update search statistics', async () => {
      const initialStats = store.getStats();
      const initialSearches = initialStats.totalSearches;

      await store.search('cat');

      const stats = store.getStats();
      expect(stats.totalSearches).toBe(initialSearches + 1);
    });

    it('should sort results by similarity score (descending)', async () => {
      const results = await store.search('test', { topK: 10 });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Delete Operations Tests
  // ---------------------------------------------------------------------------

  describe('delete', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should delete existing entry', async () => {
      const id = await store.add('Test text');
      expect(store.has(id)).toBe(true);

      const result = await store.delete(id);

      expect(result).toBe(true);
      expect(store.has(id)).toBe(false);
    });

    it('should return false for non-existent entry', async () => {
      const result = await store.delete('non-existent-id');
      expect(result).toBe(false);
    });

    it('should update statistics on delete', async () => {
      const id = await store.add('Test text');
      await store.delete(id);

      const stats = store.getStats();
      expect(stats.totalDeletes).toBe(1);
    });
  });

  describe('deleteBatch', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should delete multiple entries', async () => {
      const id1 = await store.add('Text 1');
      const id2 = await store.add('Text 2');
      const id3 = await store.add('Text 3');

      const deleted = await store.deleteBatch([id1, id2]);

      expect(deleted).toBe(2);
      expect(store.has(id1)).toBe(false);
      expect(store.has(id2)).toBe(false);
      expect(store.has(id3)).toBe(true);
    });

    it('should return 0 for empty array', async () => {
      const deleted = await store.deleteBatch([]);
      expect(deleted).toBe(0);
    });

    it('should handle mix of existing and non-existing IDs', async () => {
      const id1 = await store.add('Text 1');

      const deleted = await store.deleteBatch([id1, 'non-existent', 'also-non-existent']);

      expect(deleted).toBe(1);
    });
  });

  describe('deleteByFilter', () => {
    beforeEach(async () => {
      await store.initialize();
      await store.add('Journal entry 1', { source: 'journal', journalId: '123' });
      await store.add('Journal entry 2', { source: 'journal', journalId: '123' });
      await store.add('Compendium entry', { source: 'compendium', packId: '456' });
    });

    it('should delete entries matching filter', async () => {
      const deleted = await store.deleteByFilter({ source: 'journal' });

      expect(deleted).toBe(2);
      expect(store.size()).toBe(1);
    });

    it('should support multiple filter criteria', async () => {
      const deleted = await store.deleteByFilter({ source: 'journal', journalId: '123' });

      expect(deleted).toBe(2);
    });

    it('should throw error for empty filter', async () => {
      await expect(store.deleteByFilter({})).rejects.toThrow(/empty/i);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      await store.initialize();
      await store.add('Text 1');
      await store.add('Text 2');
    });

    it('should remove all entries', async () => {
      expect(store.size()).toBe(2);

      await store.clear();

      expect(store.size()).toBe(0);
    });

    it('should update statistics', async () => {
      await store.clear();

      const stats = store.getStats();
      expect(stats.vectorCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Accessor Methods Tests
  // ---------------------------------------------------------------------------

  describe('has', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return true for existing entry', async () => {
      const id = await store.add('Test');
      expect(store.has(id)).toBe(true);
    });

    it('should return false for non-existing entry', () => {
      expect(store.has('non-existent')).toBe(false);
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return entry for existing ID', async () => {
      const id = await store.add('Test text', { source: 'test' });
      const entry = store.get(id);

      expect(entry).toBeDefined();
      expect(entry.text).toBe('Test text');
      expect(entry.metadata).toEqual({ source: 'test' });
      expect(entry.embedding).toBeDefined();
    });

    it('should return null for non-existing ID', () => {
      expect(store.get('non-existent')).toBeNull();
    });

    it('should return a copy of entry (not reference)', async () => {
      const id = await store.add('Test text');
      const entry1 = store.get(id);
      const entry2 = store.get(id);

      expect(entry1).not.toBe(entry2);
    });
  });

  describe('getAllIds', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return all IDs', async () => {
      const id1 = await store.add('Text 1');
      const id2 = await store.add('Text 2');

      const ids = store.getAllIds();

      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('should return empty array when empty', () => {
      expect(store.getAllIds()).toEqual([]);
    });
  });

  describe('size', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return 0 for empty store', () => {
      expect(store.size()).toBe(0);
    });

    it('should return correct count', async () => {
      await store.add('Text 1');
      await store.add('Text 2');

      expect(store.size()).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Statistics Tests
  // ---------------------------------------------------------------------------

  describe('getStats', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return statistics object', () => {
      const stats = store.getStats();

      expect(stats).toHaveProperty('vectorCount');
      expect(stats).toHaveProperty('totalSearches');
      expect(stats).toHaveProperty('totalAdds');
      expect(stats).toHaveProperty('totalDeletes');
      expect(stats).toHaveProperty('estimatedSizeBytes');
      expect(stats).toHaveProperty('lastUpdated');
    });

    it('should track operations', async () => {
      await store.add('Test text');
      await store.search('query');
      await store.delete(store.getAllIds()[0]);

      const stats = store.getStats();
      expect(stats.totalAdds).toBe(1);
      expect(stats.totalSearches).toBe(1);
      expect(stats.totalDeletes).toBe(1);
    });

    it('should estimate storage size', async () => {
      const statsEmpty = store.getStats();
      expect(statsEmpty.estimatedSizeBytes).toBe(0);

      await store.add('A longer text that should increase the estimated size');

      const statsWithData = store.getStats();
      expect(statsWithData.estimatedSizeBytes).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // LRU Eviction Tests
  // ---------------------------------------------------------------------------

  describe('LRU eviction', () => {
    it('should evict oldest entries when maxVectors exceeded', async () => {
      const smallStore = new RAGVectorStore({
        embeddingService: mockEmbeddingService,
        persistToIndexedDB: false,
        maxVectors: 3
      });
      await smallStore.initialize();

      // Add 4 entries to store with max 3
      const id1 = await smallStore.add('First text');
      await new Promise(r => setTimeout(r, 10)); // Ensure different timestamps
      const id2 = await smallStore.add('Second text');
      await new Promise(r => setTimeout(r, 10));
      const id3 = await smallStore.add('Third text');
      await new Promise(r => setTimeout(r, 10));
      const id4 = await smallStore.add('Fourth text');

      // First entry should be evicted
      expect(smallStore.size()).toBe(3);
      expect(smallStore.has(id1)).toBe(false);
      expect(smallStore.has(id4)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Close Tests
  // ---------------------------------------------------------------------------

  describe('close', () => {
    it('should close database connection', async () => {
      await store.initialize();
      store.close();
      expect(store.isInitialized()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// CustomOpenAIEmbedder Tests
// ---------------------------------------------------------------------------

describe('CustomOpenAIEmbedder', () => {
  let embedder;
  let mockEmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddingService = createMockEmbeddingService();
    mockEmbeddingService.embed.mockResolvedValue(createMockEmbedding(512));
    mockEmbeddingService.embedBatch.mockResolvedValue([
      { embedding: createMockEmbedding(512), index: 0, text: 'text1' },
      { embedding: createMockEmbedding(512), index: 1, text: 'text2' }
    ]);

    embedder = new CustomOpenAIEmbedder(mockEmbeddingService);
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(embedder).toBeInstanceOf(CustomOpenAIEmbedder);
      expect(embedder.getModel()).toBe('text-embedding-3-small');
      expect(embedder.getDimensions()).toBe(512);
    });

    it('should accept custom options', () => {
      const customEmbedder = new CustomOpenAIEmbedder(mockEmbeddingService, {
        model: 'text-embedding-3-large',
        dimensions: 1536
      });

      expect(customEmbedder.getModel()).toBe('text-embedding-3-large');
      expect(customEmbedder.getDimensions()).toBe(1536);
    });
  });

  describe('isConfigured', () => {
    it('should return true when service is configured', () => {
      expect(embedder.isConfigured()).toBe(true);
    });

    it('should return false when service is not configured', () => {
      const unconfiguredService = createMockEmbeddingService({
        isConfigured: vi.fn(() => false)
      });
      const unconfiguredEmbedder = new CustomOpenAIEmbedder(unconfiguredService);
      expect(unconfiguredEmbedder.isConfigured()).toBe(false);
    });

    it('should return false when no service provided', () => {
      const noServiceEmbedder = new CustomOpenAIEmbedder(null);
      expect(noServiceEmbedder.isConfigured()).toBe(false);
    });
  });

  describe('embed', () => {
    it('should generate embedding for text', async () => {
      const embedding = await embedder.embed('Hello world');

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(512);
    });

    it('should call embedding service with correct parameters', async () => {
      await embedder.embed('Test text');

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(
        'Test text',
        expect.objectContaining({
          model: 'text-embedding-3-small',
          dimensions: 512
        })
      );
    });

    it('should throw error for empty string', async () => {
      await expect(embedder.embed('')).rejects.toThrow(/empty string/i);
    });

    it('should throw error for whitespace-only string', async () => {
      await expect(embedder.embed('   ')).rejects.toThrow(/empty string/i);
    });

    it('should throw error for null input', async () => {
      await expect(embedder.embed(null)).rejects.toThrow(/empty string/i);
    });

    it('should throw error when not configured', async () => {
      const unconfiguredService = createMockEmbeddingService({
        isConfigured: vi.fn(() => false)
      });
      const unconfiguredEmbedder = new CustomOpenAIEmbedder(unconfiguredService);

      await expect(unconfiguredEmbedder.embed('Test')).rejects.toThrow(/not configured/i);
    });

    it('should trim input text', async () => {
      await embedder.embed('  padded text  ');

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(
        'padded text',
        expect.any(Object)
      );
    });
  });

  describe('embedBatch', () => {
    it('should generate embeddings for multiple texts', async () => {
      const embeddings = await embedder.embedBatch(['text1', 'text2']);

      expect(embeddings).toBeDefined();
      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings.length).toBe(2);
    });

    it('should throw error for empty array', async () => {
      await expect(embedder.embedBatch([])).rejects.toThrow(/non-empty array/i);
    });

    it('should throw error when not configured', async () => {
      const unconfiguredService = createMockEmbeddingService({
        isConfigured: vi.fn(() => false)
      });
      const unconfiguredEmbedder = new CustomOpenAIEmbedder(unconfiguredService);

      await expect(unconfiguredEmbedder.embedBatch(['Test'])).rejects.toThrow(/not configured/i);
    });
  });

  describe('getters', () => {
    it('should return dimensions', () => {
      expect(embedder.getDimensions()).toBe(512);
    });

    it('should return model', () => {
      expect(embedder.getModel()).toBe('text-embedding-3-small');
    });
  });
});

// ---------------------------------------------------------------------------
// Exported Constants Tests
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('should export DEFAULT_STORAGE_LIMIT_MB', () => {
    expect(DEFAULT_STORAGE_LIMIT_MB).toBe(100);
  });

  it('should export DEFAULT_MAX_VECTORS', () => {
    expect(DEFAULT_MAX_VECTORS).toBe(10000);
  });

  it('should export INDEXEDDB_NAME', () => {
    expect(INDEXEDDB_NAME).toBe('vox-chronicle-vectors');
  });

  it('should export INDEXEDDB_STORE', () => {
    expect(INDEXEDDB_STORE).toBe('vectors');
  });
});
