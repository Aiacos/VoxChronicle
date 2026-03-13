/**
 * CachingProviderDecorator — Cache L2 decorators for AI providers
 *
 * Wraps ChatProvider and EmbeddingProvider with transparent caching.
 * Streaming (chatStream) and non-cacheable operations pass through directly.
 *
 * @module vox-chronicle
 */

import { ChatProvider } from './ChatProvider.mjs';
import { EmbeddingProvider } from './EmbeddingProvider.mjs';
import { CacheManager } from '../../utils/CacheManager.mjs';

/**
 * CachingChatDecorator — Wraps a ChatProvider with L2 cache for chat() calls.
 * chatStream() is always passed through without caching.
 *
 * @extends ChatProvider
 */
export class CachingChatDecorator extends ChatProvider {
  #inner;
  #cache;
  #ttl;

  /**
   * @param {ChatProvider} innerProvider - The provider to wrap
   * @param {CacheManager} cache - Cache instance for L2 storage
   * @param {Object} [options={}]
   * @param {number} [options.ttl=3600000] - Cache TTL in milliseconds (default 1h)
   */
  constructor(innerProvider, cache, options = {}) {
    if (!innerProvider) {
      throw new TypeError('innerProvider is required');
    }
    if (!cache) {
      throw new TypeError('cache is required');
    }
    super();
    this.#inner = innerProvider;
    this.#cache = cache;
    this.#ttl = options.ttl ?? 3600000; // 1h default
  }

  /**
   * Static capabilities — cannot access instance #inner, so returns the
   * superset of capabilities a CachingChatDecorator could expose.
   * For accurate per-instance capabilities, use the instance getter below.
   * @returns {string[]}
   */
  static get capabilities() {
    return ['chat', 'chatStream'];
  }

  /**
   * Returns inner provider capabilities at instance level.
   * This is the authoritative source — always delegates to the wrapped provider.
   * @returns {string[]}
   */
  get capabilities() {
    return this.#inner?.constructor?.capabilities ?? [];
  }

  /**
   * Chat with L2 caching. Cache key is derived from messages + model + temperature + maxTokens + responseFormat.
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options={}]
   * @returns {Promise<{content: string, usage: Object}>}
   */
  async chat(messages, options = {}) {
    if (options.skipCache) {
      const { skipCache, ...innerOptions } = options;
      return this.#inner.chat(messages, innerOptions);
    }

    const key = this.#buildChatKey(messages, options);
    const cached = this.#cache.get(key);
    if (cached) {
      this._logger.debug(`L2 cache hit: ${key}`);
      return cached;
    }

    const result = await this.#inner.chat(messages, options);
    this.#cache.setWithTTL(key, result, this.#ttl);
    return result;
  }

  /**
   * Streaming is never cached — delegates directly to inner provider.
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    yield* this.#inner.chatStream(messages, options);
  }

  /**
   * Build a cache key from messages and options.
   * @param {Array} messages
   * @param {Object} options
   * @returns {string}
   * @private
   */
  #buildChatKey(messages, options) {
    const input = JSON.stringify(messages)
      + (options.model ?? '')
      + (options.temperature ?? '')
      + (options.maxTokens ?? '')
      + (options.responseFormat ? JSON.stringify(options.responseFormat) : '');
    return CacheManager.generateCacheKey(input, 'l2:chat');
  }
}

/**
 * CachingEmbeddingDecorator — Wraps an EmbeddingProvider with L2 cache for embed() calls.
 *
 * @extends EmbeddingProvider
 */
export class CachingEmbeddingDecorator extends EmbeddingProvider {
  #inner;
  #cache;
  #ttl;

  /**
   * @param {EmbeddingProvider} innerProvider - The provider to wrap
   * @param {CacheManager} cache - Cache instance for L2 storage
   * @param {Object} [options={}]
   * @param {number} [options.ttl=86400000] - Cache TTL in milliseconds (default 24h)
   */
  constructor(innerProvider, cache, options = {}) {
    if (!innerProvider) {
      throw new TypeError('innerProvider is required');
    }
    if (!cache) {
      throw new TypeError('cache is required');
    }
    super();
    this.#inner = innerProvider;
    this.#cache = cache;
    this.#ttl = options.ttl ?? 86400000; // 24h default
  }

  /**
   * Static capabilities — cannot access instance #inner, so returns the
   * superset of capabilities a CachingEmbeddingDecorator could expose.
   * For accurate per-instance capabilities, use the instance getter below.
   * @returns {string[]}
   */
  static get capabilities() {
    return ['embed'];
  }

  /**
   * Returns inner provider capabilities at instance level.
   * This is the authoritative source — always delegates to the wrapped provider.
   * @returns {string[]}
   */
  get capabilities() {
    return this.#inner?.constructor?.capabilities ?? [];
  }

  /**
   * Embed with L2 caching. Cache key is derived from text + model.
   * @param {string} text
   * @param {Object} [options={}]
   * @returns {Promise<{embedding: number[], dimensions: number}>}
   */
  async embed(text, options = {}) {
    if (options.skipCache) {
      const { skipCache, ...innerOptions } = options;
      return this.#inner.embed(text, innerOptions);
    }

    const key = this.#buildEmbedKey(text, options);
    const cached = this.#cache.get(key);
    if (cached) {
      this._logger.debug(`L2 cache hit: ${key}`);
      return cached;
    }

    const result = await this.#inner.embed(text, options);
    this.#cache.setWithTTL(key, result, this.#ttl);
    return result;
  }

  /**
   * Build a cache key from text and options.
   * @param {string} text
   * @param {Object} options
   * @returns {string}
   * @private
   */
  #buildEmbedKey(text, options) {
    const input = text + (options.model ?? '');
    return CacheManager.generateCacheKey(input, 'l2:embed');
  }
}
