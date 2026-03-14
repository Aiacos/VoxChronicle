/**
 * GoogleChatProvider - Google Gemini implementation of ChatProvider
 *
 * Implements chat() and chatStream() using the Google Generative AI API.
 *
 * @class GoogleChatProvider
 * @extends ChatProvider
 * @module vox-chronicle
 */

import { ChatProvider } from './ChatProvider.mjs';
import { Logger } from '../../utils/Logger.mjs';

const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GoogleChatProvider extends ChatProvider {
  #apiKey;
  #logger;

  /**
   * @param {string} apiKey - Google API key
   * @param {Object} [options={}]
   * @param {number} [options.timeout=120000] - Request timeout in ms
   */
  constructor(apiKey, options = {}) {
    super();
    this.#apiKey = apiKey;
    this.#logger = Logger.createChild('GoogleChatProvider');
    this._timeout = options.timeout ?? 120000;
  }

  /** @returns {string[]} */
  static get capabilities() {
    return ['chat', 'chatStream'];
  }

  /**
   * Send a chat completion request via Google Generative AI API.
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options={}]
   * @returns {Promise<{content: string, usage: Object}>}
   */
  async chat(messages, options = {}) {
    this._validateOptions(options);

    const model = options.model ?? 'gemini-2.5-flash';
    const { systemInstruction, contents } = this._convertMessages(messages);

    const body = {
      contents,
      generationConfig: {}
    };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (options.temperature !== undefined) body.generationConfig.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.generationConfig.maxOutputTokens = options.maxTokens;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const url = `${GOOGLE_API_BASE}/${model}:generateContent?key=${this.#apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Google API error ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      return {
        content,
        usage: {
          prompt_tokens: data.usageMetadata?.promptTokenCount ?? 0,
          completion_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          total_tokens: data.usageMetadata?.totalTokenCount ?? 0
        }
      };
    } catch (error) {
      clearTimeout(timeoutId);
      this.#logger.error('Google chat failed:', error.message);
      throw error;
    }
  }

  /**
   * Send a streaming chat completion request via Google Generative AI API.
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    this._validateOptions(options);

    const model = options.model ?? 'gemini-2.5-flash';
    const { systemInstruction, contents } = this._convertMessages(messages);

    const body = { contents, generationConfig: {} };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (options.temperature !== undefined) body.generationConfig.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.generationConfig.maxOutputTokens = options.maxTokens;

    const url = `${GOOGLE_API_BASE}/${model}:streamGenerateContent?key=${this.#apiKey}&alt=sse`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.abortSignal
    });

    if (!response.ok) {
      throw new Error(`Google streaming error ${response.status}`);
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
          try {
            const parsed = JSON.parse(line.slice(6));
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield { token: text, done: false };
          } catch { /* skip non-JSON */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { token: '', done: true };
  }

  /**
   * Convert OpenAI-style messages to Google Generative AI format.
   * @param {Array<{role: string, content: string}>} messages
   * @returns {{ systemInstruction: string|null, contents: Array }}
   * @private
   */
  _convertMessages(messages) {
    let systemInstruction = null;
    const contents = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    return { systemInstruction, contents };
  }
}
