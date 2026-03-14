/**
 * OpenAIEmbeddingProvider - OpenAI implementation of EmbeddingProvider
 *
 * Implements embed() using the OpenAI Embeddings API.
 * Uses OpenAIClient internally for HTTP transport (retry, queue, rate limiting).
 *
 * @class OpenAIEmbeddingProvider
 * @augments EmbeddingProvider
 * @module vox-chronicle
 */

import { EmbeddingProvider } from './EmbeddingProvider.mjs';
import { OpenAIClient } from '../OpenAIClient.mjs';

export class OpenAIEmbeddingProvider extends EmbeddingProvider {
  #client;

  /**
   * @param {string} apiKey - OpenAI API key
   * @param {object} [options={}]
   * @param {number} [options.timeout=120000] - Request timeout in ms
   */
  constructor(apiKey, options = {}) {
    super();
    this.#client = new OpenAIClient(apiKey, {
      timeout: options.timeout ?? 120000
    });
  }

  /** @returns {string[]} */
  static get capabilities() {
    return ['embed'];
  }

  /**
   * Generate an embedding vector for text.
   * @param {string} text - Text to embed
   * @param {object} [options={}]
   * @param {string} [options.model] - Model to use (default: text-embedding-3-small)
   * @param {AbortSignal} [options.abortSignal]
   * @returns {Promise<{embedding: number[], dimensions: number}>}
   */
  async embed(text, options = {}) {
    this._validateText(text);
    this._validateOptions(options);

    const body = {
      model: options.model ?? 'text-embedding-3-small',
      input: text
    };

    const response = await this.#client.post('/embeddings', body, {
      signal: options.abortSignal,
      queueCategory: 'embedding'
    });

    const embedding = response?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('OpenAI embeddings response missing embedding array');
    }
    return {
      embedding,
      dimensions: embedding.length
    };
  }
}
