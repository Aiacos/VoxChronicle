import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Logger
vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn()
    }))
  }
}));

// Capture mock client instances
let lastMockClient = null;

vi.mock('../../../scripts/ai/OpenAIClient.mjs', () => {
  class MockOpenAIClient {
    constructor(apiKey, options = {}) {
      this.apiKey = apiKey;
      this.options = options;
      this.post = vi.fn();
      lastMockClient = this;
    }
  }
  return {
    OpenAIClient: MockOpenAIClient
  };
});

// Mock game object
globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`)
  }
};

import { OpenAIEmbeddingProvider } from '../../../scripts/ai/providers/OpenAIEmbeddingProvider.mjs';

describe('OpenAIEmbeddingProvider', () => {
  let provider;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    lastMockClient = null;
    provider = new OpenAIEmbeddingProvider('test-api-key');
    mockClient = lastMockClient;
  });

  describe('constructor', () => {
    it('should create an instance that extends EmbeddingProvider', () => {
      expect(provider).toBeDefined();
      expect(typeof provider.embed).toBe('function');
    });

    it('should create internal OpenAIClient with the provided apiKey', () => {
      expect(mockClient).toBeDefined();
      expect(mockClient.apiKey).toBe('test-api-key');
    });

    it('should pass default timeout 120000 to OpenAIClient', () => {
      const p = new OpenAIEmbeddingProvider('key');
      expect(lastMockClient.options.timeout).toBe(120000);
    });

    it('should pass custom timeout to OpenAIClient', () => {
      const p = new OpenAIEmbeddingProvider('key', { timeout: 30000 });
      expect(lastMockClient.options.timeout).toBe(30000);
    });
  });

  describe('static capabilities', () => {
    it('should return embed capability', () => {
      expect(OpenAIEmbeddingProvider.capabilities).toEqual(['embed']);
    });
  });

  describe('embed()', () => {
    const openAIResponse = {
      data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }],
      usage: { prompt_tokens: 5, total_tokens: 5 }
    };

    it('should call client.post with /embeddings endpoint', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.embed('hello world');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/embeddings',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should map OpenAI response to { embedding, dimensions }', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      const result = await provider.embed('hello world');
      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        dimensions: 5
      });
    });

    it('should send text as input in request body', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.embed('test text');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/embeddings',
        expect.objectContaining({ input: 'test text' }),
        expect.any(Object)
      );
    });

    it('should use default model text-embedding-3-small', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.embed('hello');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/embeddings',
        expect.objectContaining({ model: 'text-embedding-3-small' }),
        expect.any(Object)
      );
    });

    it('should use custom model when specified', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.embed('hello', { model: 'text-embedding-3-large' });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/embeddings',
        expect.objectContaining({ model: 'text-embedding-3-large' }),
        expect.any(Object)
      );
    });

    it('should pass abortSignal to client options', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      const controller = new AbortController();
      await provider.embed('hello', { abortSignal: controller.signal });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/embeddings',
        expect.any(Object),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('should validate text input - reject empty string', async () => {
      await expect(provider.embed('')).rejects.toThrow();
    });

    it('should validate text input - reject whitespace-only string', async () => {
      await expect(provider.embed('   ')).rejects.toThrow();
    });

    it('should validate text input - reject non-string', async () => {
      await expect(provider.embed(42)).rejects.toThrow();
    });

    it('should validate options - reject invalid abortSignal', async () => {
      await expect(provider.embed('hello', { abortSignal: 'invalid' })).rejects.toThrow(
        'abortSignal must be an instance of AbortSignal'
      );
    });

    it('should propagate errors from OpenAI client', async () => {
      const error = new Error('API error');
      mockClient.post.mockRejectedValue(error);
      await expect(provider.embed('hello')).rejects.toThrow('API error');
    });

    it('should handle large embedding vectors', async () => {
      const largeEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
      mockClient.post.mockResolvedValue({
        data: [{ embedding: largeEmbedding }],
        usage: { prompt_tokens: 10, total_tokens: 10 }
      });
      const result = await provider.embed('hello');
      expect(result.embedding).toHaveLength(1536);
      expect(result.dimensions).toBe(1536);
    });
  });

  describe('queueCategory (Story 2.3)', () => {
    it('should pass queueCategory "embedding" to post()', async () => {
      mockClient.post.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      });
      await provider.embed('hello');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/embeddings',
        expect.any(Object),
        expect.objectContaining({ queueCategory: 'embedding' })
      );
    });
  });
});
