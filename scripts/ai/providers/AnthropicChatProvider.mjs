/**
 * AnthropicChatProvider - Anthropic Claude implementation of ChatProvider
 *
 * Implements chat() and chatStream() using the Anthropic Messages API.
 *
 * @class AnthropicChatProvider
 * @augments ChatProvider
 * @module vox-chronicle
 */

import { ChatProvider } from './ChatProvider.mjs';
import { Logger } from '../../utils/Logger.mjs';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicChatProvider extends ChatProvider {
  #apiKey;
  #logger;

  /**
   * @param {string} apiKey - Anthropic API key
   * @param {object} [options={}]
   * @param {number} [options.timeout=120000] - Request timeout in ms
   */
  constructor(apiKey, options = {}) {
    super();
    this.#apiKey = apiKey;
    this.#logger = Logger.createChild('AnthropicChatProvider');
    this._timeout = options.timeout ?? 120000;
  }

  /** @returns {string[]} */
  static get capabilities() {
    return ['chat', 'chatStream'];
  }

  /**
   * Send a chat completion request via Anthropic Messages API.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {Promise<{content: string, usage: object}>}
   */
  async chat(messages, options = {}) {
    this._validateOptions(options);

    // Anthropic uses a separate system parameter, not a system message in the array
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const body = {
      model: options.model ?? 'claude-sonnet-4-20250514',
      messages: userMessages,
      max_tokens: options.maxTokens ?? 1024
    };
    if (systemMessage) body.system = systemMessage.content;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.#apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Anthropic API error ${response.status}: ${errorData.error?.message || response.statusText}`
        );
      }

      const data = await response.json();
      const content = data.content?.[0]?.text ?? '';

      return {
        content,
        usage: {
          prompt_tokens: data.usage?.input_tokens ?? 0,
          completion_tokens: data.usage?.output_tokens ?? 0,
          total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
        }
      };
    } catch (error) {
      clearTimeout(timeoutId);
      this.#logger.error('Anthropic chat failed:', error.message);
      throw error;
    }
  }

  /**
   * Send a streaming chat completion request via Anthropic Messages API.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    this._validateOptions(options);

    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const body = {
      model: options.model ?? 'claude-sonnet-4-20250514',
      messages: userMessages,
      max_tokens: options.maxTokens ?? 1024,
      stream: true
    };
    if (systemMessage) body.system = systemMessage.content;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.#apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body),
      signal: options.abortSignal
    });

    if (!response.ok) {
      throw new Error(`Anthropic streaming error ${response.status}`);
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
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield { token: parsed.delta.text, done: false };
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
