/**
 * OpenAIChatProvider - OpenAI implementation of ChatProvider
 *
 * Implements chat() and chatStream() using the OpenAI Chat Completions API.
 * Uses OpenAIClient internally for HTTP transport (retry, queue, rate limiting).
 *
 * @class OpenAIChatProvider
 * @augments ChatProvider
 * @module vox-chronicle
 */

import { ChatProvider } from './ChatProvider.mjs';
import { OpenAIClient } from '../OpenAIClient.mjs';

export class OpenAIChatProvider extends ChatProvider {
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
    return ['chat', 'chatStream'];
  }

  /**
   * Send a chat completion request.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {Promise<{content: string, usage: object}>}
   */
  async chat(messages, options = {}) {
    this._validateOptions(options);

    const body = {
      model: options.model ?? 'gpt-4o',
      messages
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.responseFormat !== undefined) body.response_format = options.responseFormat;

    const response = await this.#client.post('/chat/completions', body, {
      signal: options.abortSignal,
      queueCategory: 'chat'
    });

    const choice = response?.choices?.[0];
    if (!choice) {
      throw new Error('OpenAI chat response missing choices');
    }
    return {
      content: choice.message?.content ?? '',
      usage: response.usage ?? {}
    };
  }

  /**
   * Send a streaming chat completion request.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    this._validateOptions(options);

    const body = {
      model: options.model ?? 'gpt-4o',
      messages
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;

    // NOTE: postStream bypasses the request queue — queueCategory is not applicable for streaming
    for await (const chunk of this.#client.postStream('/chat/completions', body, {
      signal: options.abortSignal
    })) {
      const content = chunk.content;
      if (content !== null && content !== undefined) {
        yield { token: content, done: false };
      }
    }
    yield { token: '', done: true };
  }
}
