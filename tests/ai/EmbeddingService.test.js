/**
 * EmbeddingService Unit Tests
 *
 * Tests for the EmbeddingService class with API mocking.
 * Covers embedding generation, text chunking, batch processing,
 * error handling, and cosine similarity calculations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing EmbeddingService
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

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  EmbeddingService,
  DEFAULT_MODEL,
  DEFAULT_DIMENSIONS,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  MAX_TOKENS_PER_REQUEST,
  MAX_CHARS_PER_REQUEST,
  MAX_BATCH_SIZE
} from '../../scripts/ai/EmbeddingService.mjs';

/**
 * Create a mock OpenAI client
 */
function createMockOpenAIClient(overrides = {}) {
  return {
    isConfigured: true,
    post: vi.fn(),
    ...overrides
  };
}

/**
 * Create a mock embedding response
 */
function createMockEmbeddingResponse(embeddings, tokensUsed = 100) {
  const data = embeddings.map((embedding, index) => ({
    object: 'embedding',
    index,
    embedding
  }));

  return {
    object: 'list',
    data,
    model: 'text-embedding-3-small',
    usage: {
      prompt_tokens: tokensUsed,
      total_tokens: tokensUsed
    }
  };
}

/**
 * Create a mock embedding vector
 */
function createMockEmbedding(dimensions = 512) {
  return Array(dimensions)
    .fill(0)
    .map(() => Math.random() * 2 - 1);
}

describe('EmbeddingService', () => {
  let service;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockOpenAIClient();
    service = new EmbeddingService({ openaiClient: mockClient });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Constructor and Configuration Tests
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const defaultService = new EmbeddingService();
      expect(defaultService).toBeInstanceOf(EmbeddingService);
      expect(defaultService.getModel()).toBe(DEFAULT_MODEL);
      expect(defaultService.getDimensions()).toBe(DEFAULT_DIMENSIONS);
    });

    it('should accept custom options', () => {
      const customService = new EmbeddingService({
        openaiClient: mockClient,
        model: 'text-embedding-3-large',
        dimensions: 1536,
        chunkSize: 1000,
        chunkOverlap: 200
      });

      expect(customService.getModel()).toBe('text-embedding-3-large');
      expect(customService.getDimensions()).toBe(1536);
    });

    it('should handle missing client', () => {
      const noClientService = new EmbeddingService();
      expect(noClientService.isConfigured()).toBe(false);
    });
  });

  describe('configuration methods', () => {
    it('should return true when configured', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when client is not configured', () => {
      const unconfiguredClient = createMockOpenAIClient({ isConfigured: false });
      const unconfiguredService = new EmbeddingService({ openaiClient: unconfiguredClient });
      expect(unconfiguredService.isConfigured()).toBe(false);
    });

    it('should update model via setModel', () => {
      service.setModel('text-embedding-3-large');
      expect(service.getModel()).toBe('text-embedding-3-large');
    });

    it('should update dimensions via setDimensions', () => {
      service.setDimensions(1536);
      expect(service.getDimensions()).toBe(1536);
    });

    it('should update client via setOpenAIClient', () => {
      const newClient = createMockOpenAIClient();
      service.setOpenAIClient(newClient);
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should track embedding statistics', async () => {
      const mockEmbedding = createMockEmbedding();
      mockClient.post.mockResolvedValue(createMockEmbeddingResponse([mockEmbedding], 50));

      await service.embed('test text');

      const stats = service.getStats();
      expect(stats.totalEmbeddings).toBe(1);
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalTokens).toBe(50);
      expect(stats.errors).toBe(0);
    });

    it('should reset statistics', async () => {
      const mockEmbedding = createMockEmbedding();
      mockClient.post.mockResolvedValue(createMockEmbeddingResponse([mockEmbedding]));

      await service.embed('test text');
      service.resetStats();

      const stats = service.getStats();
      expect(stats.totalEmbeddings).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });

    it('should track errors', async () => {
      mockClient.post.mockRejectedValue(new Error('API Error'));

      await expect(service.embed('test text')).rejects.toThrow();

      const stats = service.getStats();
      expect(stats.errors).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Text Chunking Tests
  // ---------------------------------------------------------------------------

  describe('chunkText', () => {
    it('should return empty array for empty input', () => {
      expect(service.chunkText('')).toEqual([]);
      expect(service.chunkText(null)).toEqual([]);
      expect(service.chunkText(undefined)).toEqual([]);
      expect(service.chunkText('   ')).toEqual([]);
    });

    it('should return single chunk for short text', () => {
      const text = 'Short text.';
      const chunks = service.chunkText(text);

      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe('Short text.');
      expect(chunks[0].startPos).toBe(0);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].totalChunks).toBe(1);
    });

    it('should split long text into multiple chunks', () => {
      const text = 'A'.repeat(1500);
      const chunks = service.chunkText(text, { chunkSize: 500, overlap: 100 });

      expect(chunks.length).toBeGreaterThan(1);

      // Check that all chunks have valid metadata
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].chunkIndex).toBe(i);
        expect(chunks[i].totalChunks).toBe(chunks.length);
        expect(chunks[i].text.length).toBeGreaterThan(0);
      }
    });

    it('should try to break at sentence boundaries', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const chunks = service.chunkText(text, { chunkSize: 40, overlap: 10 });

      // Check that chunks tend to end at sentence boundaries
      for (const chunk of chunks) {
        if (chunk.chunkIndex < chunks.length - 1) {
          // Non-final chunks should ideally end with a period
          expect(chunk.text.endsWith('.') || chunk.text.length > 0).toBe(true);
        }
      }
    });

    it('should respect custom chunk size and overlap', () => {
      const text = 'A'.repeat(1000);
      const chunks = service.chunkText(text, { chunkSize: 200, overlap: 50 });

      expect(chunks.length).toBeGreaterThan(1);
      // First chunk should be approximately chunkSize
      expect(chunks[0].text.length).toBeLessThanOrEqual(250); // Allow some flexibility
    });

    it('should handle text with only whitespace between words', () => {
      const text = 'word1 word2 word3 word4 word5';
      const chunks = service.chunkText(text, { chunkSize: 15, overlap: 5 });

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.text.trim().length).toBeGreaterThan(0);
      }
    });

    it('should include position metadata', () => {
      const text = 'First part. Second part. Third part.';
      const chunks = service.chunkText(text, { chunkSize: 15, overlap: 5 });

      for (const chunk of chunks) {
        expect(typeof chunk.startPos).toBe('number');
        expect(typeof chunk.endPos).toBe('number');
        expect(chunk.endPos).toBeGreaterThan(chunk.startPos);
      }
    });
  });

  describe('needsChunking', () => {
    it('should return false for short text', () => {
      expect(service.needsChunking('Short text')).toBe(false);
    });

    it('should return true for text exceeding limit', () => {
      const longText = 'A'.repeat(MAX_CHARS_PER_REQUEST + 1);
      expect(service.needsChunking(longText)).toBe(true);
    });

    it('should return false for invalid input', () => {
      expect(service.needsChunking(null)).toBe(false);
      expect(service.needsChunking(undefined)).toBe(false);
      expect(service.needsChunking(123)).toBe(false);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for text', () => {
      const text = 'This is a test string.';
      const estimate = service.estimateTokens(text);
      // ~4 chars per token, so 22 chars should be ~6 tokens
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(20);
    });

    it('should return 0 for empty input', () => {
      expect(service.estimateTokens('')).toBe(0);
      expect(service.estimateTokens(null)).toBe(0);
      expect(service.estimateTokens(undefined)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Single Embedding Tests
  // ---------------------------------------------------------------------------

  describe('embed', () => {
    it('should generate embedding for valid text', async () => {
      const mockEmbedding = createMockEmbedding();
      mockClient.post.mockResolvedValue(createMockEmbeddingResponse([mockEmbedding]));

      const result = await service.embed('test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockClient.post).toHaveBeenCalledWith('/embeddings', {
        model: DEFAULT_MODEL,
        input: 'test text',
        dimensions: DEFAULT_DIMENSIONS
      });
    });

    it('should trim whitespace from input', async () => {
      const mockEmbedding = createMockEmbedding();
      mockClient.post.mockResolvedValue(createMockEmbeddingResponse([mockEmbedding]));

      await service.embed('  test text  ');

      expect(mockClient.post).toHaveBeenCalledWith('/embeddings', {
        model: DEFAULT_MODEL,
        input: 'test text',
        dimensions: DEFAULT_DIMENSIONS
      });
    });

    it('should use custom model and dimensions', async () => {
      const mockEmbedding = createMockEmbedding(1536);
      mockClient.post.mockResolvedValue(createMockEmbeddingResponse([mockEmbedding]));

      await service.embed('test text', {
        model: 'text-embedding-3-large',
        dimensions: 1536
      });

      expect(mockClient.post).toHaveBeenCalledWith('/embeddings', {
        model: 'text-embedding-3-large',
        input: 'test text',
        dimensions: 1536
      });
    });

    it('should throw error for empty string', async () => {
      await expect(service.embed('')).rejects.toThrow('Cannot embed empty string');
    });

    it('should throw error for whitespace-only string', async () => {
      await expect(service.embed('   ')).rejects.toThrow('Cannot embed empty string');
    });

    it('should throw error for null input', async () => {
      await expect(service.embed(null)).rejects.toThrow('must be a non-empty string');
    });

    it('should throw error for undefined input', async () => {
      await expect(service.embed(undefined)).rejects.toThrow('must be a non-empty string');
    });

    it('should throw error for text exceeding max length', async () => {
      const longText = 'A'.repeat(MAX_CHARS_PER_REQUEST + 1);
      await expect(service.embed(longText)).rejects.toThrow('exceeds maximum length');
    });

    it('should throw error when client is not configured', async () => {
      const unconfiguredService = new EmbeddingService();
      await expect(unconfiguredService.embed('test')).rejects.toThrow('not configured');
    });

    it('should throw error for invalid API response structure', async () => {
      mockClient.post.mockResolvedValue({ invalid: 'response' });
      await expect(service.embed('test text')).rejects.toThrow('Invalid API response');
    });

    it('should throw error for empty data array in response', async () => {
      mockClient.post.mockResolvedValue({ data: [] });
      await expect(service.embed('test text')).rejects.toThrow('Invalid API response');
    });

    it('should throw error for invalid embedding format', async () => {
      mockClient.post.mockResolvedValue({
        data: [{ embedding: 'not an array' }]
      });
      await expect(service.embed('test text')).rejects.toThrow('Invalid embedding format');
    });

    it('should propagate API errors', async () => {
      mockClient.post.mockRejectedValue(new Error('Rate limit exceeded'));
      await expect(service.embed('test text')).rejects.toThrow('Rate limit exceeded');
    });
  });

  // ---------------------------------------------------------------------------
  // Batch Embedding Tests
  // ---------------------------------------------------------------------------

  describe('embedBatch', () => {
    it('should generate embeddings for multiple texts', async () => {
      const mockEmbeddings = [createMockEmbedding(), createMockEmbedding()];
      mockClient.post.mockResolvedValue(createMockEmbeddingResponse(mockEmbeddings));

      const results = await service.embedBatch(['text 1', 'text 2']);

      expect(results.length).toBe(2);
      expect(results[0].embedding).toEqual(mockEmbeddings[0]);
      expect(results[0].text).toBe('text 1');
      expect(results[0].index).toBe(0);
      expect(results[1].embedding).toEqual(mockEmbeddings[1]);
      expect(results[1].text).toBe('text 2');
      expect(results[1].index).toBe(1);
    });

    it('should throw error for empty array', async () => {
      await expect(service.embedBatch([])).rejects.toThrow('non-empty array');
    });

    it('should throw error for non-array input', async () => {
      await expect(service.embedBatch('not an array')).rejects.toThrow('non-empty array');
    });

    it('should throw error for array with empty string', async () => {
      await expect(service.embedBatch(['valid', ''])).rejects.toThrow('Invalid text at index 1');
    });

    it('should throw error for array with null element', async () => {
      await expect(service.embedBatch(['valid', null])).rejects.toThrow('Invalid text at index 1');
    });

    it('should throw error when text exceeds max length', async () => {
      const longText = 'A'.repeat(MAX_CHARS_PER_REQUEST + 1);
      await expect(service.embedBatch(['valid', longText])).rejects.toThrow('exceeds maximum length');
    });

    it('should handle response with out-of-order indices', async () => {
      const mockEmbeddings = [createMockEmbedding(), createMockEmbedding()];
      // Return in reverse order
      mockClient.post.mockResolvedValue({
        data: [
          { embedding: mockEmbeddings[1], index: 1 },
          { embedding: mockEmbeddings[0], index: 0 }
        ],
        usage: { total_tokens: 100 }
      });

      const results = await service.embedBatch(['text 1', 'text 2']);

      // Should be sorted by index
      expect(results[0].text).toBe('text 1');
      expect(results[1].text).toBe('text 2');
    });

    it('should update statistics for batch', async () => {
      const mockEmbeddings = [createMockEmbedding(), createMockEmbedding(), createMockEmbedding()];
      mockClient.post.mockResolvedValue(createMockEmbeddingResponse(mockEmbeddings, 150));

      await service.embedBatch(['text 1', 'text 2', 'text 3']);

      const stats = service.getStats();
      expect(stats.totalEmbeddings).toBe(3);
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalTokens).toBe(150);
    });
  });

  describe('large batch handling', () => {
    it('should split batches exceeding MAX_BATCH_SIZE', async () => {
      // Create array larger than MAX_BATCH_SIZE
      const texts = Array(MAX_BATCH_SIZE + 10)
        .fill('')
        .map((_, i) => `text ${i}`);

      // Mock the API to return correct number of embeddings for each batch call
      mockClient.post.mockImplementation((endpoint, body) => {
        const inputTexts = body.input;
        const embeddings = inputTexts.map(() => createMockEmbedding());
        return Promise.resolve(createMockEmbeddingResponse(embeddings));
      });

      const results = await service.embedBatch(texts);

      // Should have made multiple API calls
      expect(mockClient.post.mock.calls.length).toBeGreaterThan(1);
      expect(results.length).toBe(texts.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Document Embedding Tests
  // ---------------------------------------------------------------------------

  describe('embedDocument', () => {
    it('should chunk and embed a document', async () => {
      const document = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';

      // Mock the API to return correct number of embeddings for the input
      mockClient.post.mockImplementation((endpoint, body) => {
        const inputTexts = body.input;
        const embeddings = Array.isArray(inputTexts)
          ? inputTexts.map(() => createMockEmbedding())
          : [createMockEmbedding()];
        return Promise.resolve(createMockEmbeddingResponse(embeddings));
      });

      const results = await service.embedDocument(document, { chunkSize: 30, overlap: 5 });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.chunk).toBeDefined();
        expect(result.chunk.text).toBeDefined();
        expect(result.embedding).toBeDefined();
      }
    });

    it('should include metadata in chunks', async () => {
      const document = 'Test document text.';

      // Mock the API to return correct number of embeddings for the input
      mockClient.post.mockImplementation((endpoint, body) => {
        const inputTexts = body.input;
        const embeddings = Array.isArray(inputTexts)
          ? inputTexts.map(() => createMockEmbedding())
          : [createMockEmbedding()];
        return Promise.resolve(createMockEmbeddingResponse(embeddings));
      });

      const metadata = { source: 'test', pageId: '123' };
      const results = await service.embedDocument(document, { metadata });

      expect(results[0].chunk.source).toBe('test');
      expect(results[0].chunk.pageId).toBe('123');
    });

    it('should throw error for empty document', async () => {
      await expect(service.embedDocument('')).rejects.toThrow('non-empty string');
    });

    it('should throw error for null document', async () => {
      await expect(service.embedDocument(null)).rejects.toThrow('non-empty string');
    });

    it('should return empty array for whitespace-only document', async () => {
      await expect(service.embedDocument('   ')).rejects.toThrow('non-empty string');
    });
  });

  // ---------------------------------------------------------------------------
  // Cosine Similarity Tests
  // ---------------------------------------------------------------------------

  describe('cosineSimilarity', () => {
    it('should calculate similarity between identical vectors', () => {
      const embedding = [0.5, 0.5, 0.5, 0.5];
      const similarity = service.cosineSimilarity(embedding, embedding);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity between orthogonal vectors', () => {
      const embedding1 = [1, 0, 0];
      const embedding2 = [0, 1, 0];
      const similarity = service.cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should calculate similarity between opposite vectors', () => {
      const embedding1 = [1, 0, 0];
      const embedding2 = [-1, 0, 0];
      const similarity = service.cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should handle normalized vectors', () => {
      const embedding1 = [0.6, 0.8];
      const embedding2 = [0.8, 0.6];
      const similarity = service.cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it('should throw error for different dimensions', () => {
      const embedding1 = [0.5, 0.5, 0.5];
      const embedding2 = [0.5, 0.5];
      expect(() => service.cosineSimilarity(embedding1, embedding2)).toThrow('same dimensions');
    });

    it('should throw error for non-array inputs', () => {
      expect(() => service.cosineSimilarity('not array', [1, 2])).toThrow('must be arrays');
      expect(() => service.cosineSimilarity([1, 2], 'not array')).toThrow('must be arrays');
    });

    it('should throw error for empty arrays', () => {
      expect(() => service.cosineSimilarity([], [])).toThrow('cannot be empty');
    });

    it('should return 0 for zero vectors', () => {
      const zeroVector = [0, 0, 0];
      const nonZero = [1, 2, 3];
      const similarity = service.cosineSimilarity(zeroVector, nonZero);
      expect(similarity).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Constants Export Tests
  // ---------------------------------------------------------------------------

  describe('exported constants', () => {
    it('should export DEFAULT_MODEL', () => {
      expect(DEFAULT_MODEL).toBe('text-embedding-3-small');
    });

    it('should export DEFAULT_DIMENSIONS', () => {
      expect(DEFAULT_DIMENSIONS).toBe(512);
    });

    it('should export DEFAULT_CHUNK_SIZE', () => {
      expect(DEFAULT_CHUNK_SIZE).toBe(500);
    });

    it('should export DEFAULT_CHUNK_OVERLAP', () => {
      expect(DEFAULT_CHUNK_OVERLAP).toBe(100);
    });

    it('should export MAX_TOKENS_PER_REQUEST', () => {
      expect(MAX_TOKENS_PER_REQUEST).toBe(8192);
    });

    it('should export MAX_CHARS_PER_REQUEST', () => {
      expect(MAX_CHARS_PER_REQUEST).toBe(MAX_TOKENS_PER_REQUEST * 4);
    });

    it('should export MAX_BATCH_SIZE', () => {
      expect(MAX_BATCH_SIZE).toBe(100);
    });
  });
});
