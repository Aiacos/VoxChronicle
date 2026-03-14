import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Logger
vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

// Mock game object
globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => key)
  }
};

import {
  CachingChatDecorator,
  CachingEmbeddingDecorator
} from '../../../scripts/ai/providers/CachingProviderDecorator.mjs';
import { CacheManager } from '../../../scripts/utils/CacheManager.mjs';

// ─── Helpers ───────────────────────────────────────────

function createMockChatProvider() {
  return {
    chat: vi.fn().mockResolvedValue({ content: 'hello', usage: { total_tokens: 10 } }),
    chatStream: vi.fn(async function* () {
      yield { token: 'hel', done: false };
      yield { token: 'lo', done: false };
      yield { token: '', done: true };
    }),
    _validateOptions: vi.fn(),
    _logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    constructor: { capabilities: ['chat', 'chatStream'], name: 'MockChatProvider' }
  };
}

function createMockEmbeddingProvider() {
  return {
    embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], dimensions: 3 }),
    _validateText: vi.fn(),
    _validateOptions: vi.fn(),
    _logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    constructor: { capabilities: ['embed'], name: 'MockEmbeddingProvider' }
  };
}

// ─── CachingChatDecorator ──────────────────────────────

describe('CachingChatDecorator', () => {
  let mockProvider;
  let cache;
  let decorator;

  beforeEach(() => {
    mockProvider = createMockChatProvider();
    cache = new CacheManager({ name: 'test-l2-chat', maxSize: 50 });
    decorator = new CachingChatDecorator(mockProvider, cache);
  });

  describe('constructor', () => {
    it('should create decorator with default options', () => {
      expect(decorator).toBeDefined();
    });

    it('should accept custom TTL', () => {
      const custom = new CachingChatDecorator(mockProvider, cache, { ttl: 5000 });
      expect(custom).toBeDefined();
    });

    it('should throw if innerProvider is missing', () => {
      expect(() => new CachingChatDecorator(null, cache)).toThrow();
    });

    it('should throw if cache is missing', () => {
      expect(() => new CachingChatDecorator(mockProvider, null)).toThrow();
    });
  });

  describe('capabilities', () => {
    it('should return same capabilities as inner provider', () => {
      expect(CachingChatDecorator.capabilities).toEqual(['chat', 'chatStream']);
    });
  });

  describe('chat() — cache miss', () => {
    it('should call inner provider on cache miss', async () => {
      const messages = [{ role: 'user', content: 'hello' }];
      const result = await decorator.chat(messages);

      expect(mockProvider.chat).toHaveBeenCalledWith(messages, {});
      expect(result).toEqual({ content: 'hello', usage: { total_tokens: 10 } });
    });

    it('should store result in cache after miss', async () => {
      const messages = [{ role: 'user', content: 'hello' }];
      await decorator.chat(messages);

      expect(cache.size()).toBeGreaterThan(0);
    });
  });

  describe('chat() — cache hit', () => {
    it('should return cached result on cache hit', async () => {
      const messages = [{ role: 'user', content: 'hello' }];
      await decorator.chat(messages);
      mockProvider.chat.mockClear();

      const result = await decorator.chat(messages);
      expect(mockProvider.chat).not.toHaveBeenCalled();
      expect(result).toEqual({ content: 'hello', usage: { total_tokens: 10 } });
    });

    it('should differentiate cache keys by messages content', async () => {
      const msgs1 = [{ role: 'user', content: 'hello' }];
      const msgs2 = [{ role: 'user', content: 'goodbye' }];

      await decorator.chat(msgs1);
      await decorator.chat(msgs2);

      expect(mockProvider.chat).toHaveBeenCalledTimes(2);
    });

    it('should differentiate cache keys by model', async () => {
      const messages = [{ role: 'user', content: 'hello' }];
      await decorator.chat(messages, { model: 'gpt-4o' });
      await decorator.chat(messages, { model: 'gpt-4o-mini' });

      expect(mockProvider.chat).toHaveBeenCalledTimes(2);
    });

    it('should differentiate cache keys by temperature', async () => {
      const messages = [{ role: 'user', content: 'hello' }];
      await decorator.chat(messages, { temperature: 0 });
      await decorator.chat(messages, { temperature: 1 });

      expect(mockProvider.chat).toHaveBeenCalledTimes(2);
    });
  });

  describe('chat() — skipCache', () => {
    it('should bypass cache when skipCache is true', async () => {
      const messages = [{ role: 'user', content: 'hello' }];
      await decorator.chat(messages);
      mockProvider.chat.mockClear();

      await decorator.chat(messages, { skipCache: true });
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    });

    it('should not store result in cache when skipCache is true', async () => {
      const messages = [{ role: 'user', content: 'unique-skip' }];
      await decorator.chat(messages, { skipCache: true });

      // Cache should be empty for this key
      mockProvider.chat.mockClear();
      await decorator.chat(messages);
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    });
  });

  describe('chat() — TTL expiry', () => {
    it('should expire cached entries after TTL', async () => {
      vi.useFakeTimers();
      const shortTTLDecorator = new CachingChatDecorator(mockProvider, cache, { ttl: 1000 });
      const messages = [{ role: 'user', content: 'ttl-test' }];

      await shortTTLDecorator.chat(messages);
      mockProvider.chat.mockClear();

      // Advance past TTL
      vi.advanceTimersByTime(1500);

      await shortTTLDecorator.chat(messages);
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('chat() — error handling', () => {
    it('should propagate errors from inner provider', async () => {
      mockProvider.chat.mockRejectedValue(new Error('API error'));
      const messages = [{ role: 'user', content: 'fail' }];

      await expect(decorator.chat(messages)).rejects.toThrow('API error');
    });

    it('should not cache errors', async () => {
      mockProvider.chat.mockRejectedValueOnce(new Error('API error'));
      mockProvider.chat.mockResolvedValueOnce({ content: 'ok', usage: {} });

      const messages = [{ role: 'user', content: 'retry' }];
      await expect(decorator.chat(messages)).rejects.toThrow('API error');

      const result = await decorator.chat(messages);
      expect(result.content).toBe('ok');
    });
  });

  describe('chatStream() — passthrough', () => {
    it('should delegate chatStream directly without caching', async () => {
      const messages = [{ role: 'user', content: 'stream' }];
      const tokens = [];

      for await (const chunk of decorator.chatStream(messages)) {
        tokens.push(chunk);
      }

      expect(mockProvider.chatStream).toHaveBeenCalledWith(messages, {});
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should pass options through to chatStream', async () => {
      const messages = [{ role: 'user', content: 'stream' }];
      const options = { model: 'gpt-4o', temperature: 0.5 };

      for await (const chunk of decorator.chatStream(messages, options)) {
        // consume
      }

      expect(mockProvider.chatStream).toHaveBeenCalledWith(messages, options);
    });
  });

  describe('options passthrough', () => {
    it('should pass options to inner provider chat (excluding skipCache)', async () => {
      const messages = [{ role: 'user', content: 'opts' }];
      const options = { model: 'gpt-4o', temperature: 0.5, skipCache: true };

      await decorator.chat(messages, options);

      // Inner provider should receive options without skipCache
      const calledOptions = mockProvider.chat.mock.calls[0][1];
      expect(calledOptions.model).toBe('gpt-4o');
      expect(calledOptions.temperature).toBe(0.5);
    });
  });
});

// ─── CachingEmbeddingDecorator ─────────────────────────

describe('CachingEmbeddingDecorator', () => {
  let mockProvider;
  let cache;
  let decorator;

  beforeEach(() => {
    mockProvider = createMockEmbeddingProvider();
    cache = new CacheManager({ name: 'test-l2-embed', maxSize: 50 });
    decorator = new CachingEmbeddingDecorator(mockProvider, cache);
  });

  describe('constructor', () => {
    it('should create decorator with default options', () => {
      expect(decorator).toBeDefined();
    });

    it('should throw if innerProvider is missing', () => {
      expect(() => new CachingEmbeddingDecorator(null, cache)).toThrow();
    });

    it('should throw if cache is missing', () => {
      expect(() => new CachingEmbeddingDecorator(mockProvider, null)).toThrow();
    });
  });

  describe('capabilities', () => {
    it('should return same capabilities as inner provider', () => {
      expect(CachingEmbeddingDecorator.capabilities).toEqual(['embed']);
    });
  });

  describe('embed() — cache miss', () => {
    it('should call inner provider on cache miss', async () => {
      const result = await decorator.embed('test text');

      expect(mockProvider.embed).toHaveBeenCalledWith('test text', {});
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], dimensions: 3 });
    });

    it('should store result in cache after miss', async () => {
      await decorator.embed('test text');
      expect(cache.size()).toBeGreaterThan(0);
    });
  });

  describe('embed() — cache hit', () => {
    it('should return cached result on cache hit', async () => {
      await decorator.embed('test text');
      mockProvider.embed.mockClear();

      const result = await decorator.embed('test text');
      expect(mockProvider.embed).not.toHaveBeenCalled();
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], dimensions: 3 });
    });

    it('should differentiate cache keys by text content', async () => {
      await decorator.embed('hello');
      await decorator.embed('world');
      expect(mockProvider.embed).toHaveBeenCalledTimes(2);
    });

    it('should differentiate cache keys by model', async () => {
      await decorator.embed('hello', { model: 'text-embedding-3-small' });
      await decorator.embed('hello', { model: 'text-embedding-3-large' });
      expect(mockProvider.embed).toHaveBeenCalledTimes(2);
    });
  });

  describe('embed() — skipCache', () => {
    it('should bypass cache when skipCache is true', async () => {
      await decorator.embed('test text');
      mockProvider.embed.mockClear();

      await decorator.embed('test text', { skipCache: true });
      expect(mockProvider.embed).toHaveBeenCalledTimes(1);
    });
  });

  describe('embed() — TTL expiry', () => {
    it('should expire cached entries after TTL', async () => {
      vi.useFakeTimers();
      const shortTTLDecorator = new CachingEmbeddingDecorator(mockProvider, cache, { ttl: 2000 });

      await shortTTLDecorator.embed('ttl-test');
      mockProvider.embed.mockClear();

      vi.advanceTimersByTime(2500);

      await shortTTLDecorator.embed('ttl-test');
      expect(mockProvider.embed).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('embed() — error handling', () => {
    it('should propagate errors from inner provider', async () => {
      mockProvider.embed.mockRejectedValue(new Error('Embed error'));
      await expect(decorator.embed('fail')).rejects.toThrow('Embed error');
    });

    it('should not cache errors', async () => {
      mockProvider.embed.mockRejectedValueOnce(new Error('fail'));
      mockProvider.embed.mockResolvedValueOnce({ embedding: [1], dimensions: 1 });

      await expect(decorator.embed('retry')).rejects.toThrow('fail');
      const result = await decorator.embed('retry');
      expect(result.embedding).toEqual([1]);
    });
  });

  describe('embed() — default TTL', () => {
    it('should use 24h TTL by default for embeddings', async () => {
      vi.useFakeTimers();
      await decorator.embed('default-ttl');
      mockProvider.embed.mockClear();

      // 23 hours — still cached
      vi.advanceTimersByTime(23 * 3600 * 1000);
      await decorator.embed('default-ttl');
      expect(mockProvider.embed).not.toHaveBeenCalled();

      // 25 hours — expired
      vi.advanceTimersByTime(2 * 3600 * 1000);
      await decorator.embed('default-ttl');
      expect(mockProvider.embed).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });
});
