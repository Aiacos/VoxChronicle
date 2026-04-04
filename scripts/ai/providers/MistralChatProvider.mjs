/**
 * MistralChatProvider - Mistral AI implementation of ChatProvider
 *
 * Implements chat() and chatStream() using the Mistral AI API.
 * Mistral uses an OpenAI-compatible format, so no message conversion is needed.
 *
 * @class MistralChatProvider
 * @augments ChatProvider
 * @module vox-chronicle
 */

import { ChatProvider } from './ChatProvider.mjs';
import { Logger } from '../../utils/Logger.mjs';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

export class MistralChatProvider extends ChatProvider {
  #apiKey;
  #logger;

  /**
   * @param {string} apiKey - Mistral API key
   * @param {object} [options={}]
   * @param {number} [options.timeout=120000] - Request timeout in ms
   */
  constructor(apiKey, options = {}) {
    super();
    this.#apiKey = apiKey;
    this.#logger = Logger.createChild('MistralChatProvider');
    this._timeout = options.timeout ?? 120000;
  }

  /** @returns {string[]} */
  static get capabilities() {
    return ['chat', 'chatStream'];
  }

  /**
   * Send a chat completion request via Mistral AI API.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {Promise<{content: string, usage: object}>}
   */
  async chat(messages, options = {}) {
    this._validateOptions(options);

    const body = {
      model: options.model ?? 'mistral-small-latest',
      messages,
      max_tokens: options.maxTokens ?? 1024
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.#apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Mistral API error ${response.status}: ${errorData.message || response.statusText}`
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';

      return {
        content,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens ?? 0,
          completion_tokens: data.usage?.completion_tokens ?? 0,
          total_tokens: (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0)
        }
      };
    } catch (error) {
      clearTimeout(timeoutId);
      this.#logger.error('Mistral chat failed:', error.message);
      throw error;
    }
  }

  /**
   * Send a streaming chat completion request via Mistral AI API.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    this._validateOptions(options);

    const body = {
      model: options.model ?? 'mistral-small-latest',
      messages,
      max_tokens: options.maxTokens ?? 1024,
      stream: true
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify(body),
      signal: options.abortSignal
    });

    if (!response.ok) {
      throw new Error(`Mistral streaming error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { token: '', done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              yield { token, done: false };
            }
          } catch {
            /* skip non-JSON lines */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { token: '', done: true };
  }
}
