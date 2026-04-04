/**
 * FallbackChatProvider - Decorator that transparently retries across chat providers
 *
 * Wraps a ProviderRegistry and automatically falls back to alternative chat providers
 * when the default provider fails with a retryable error (5xx, 429, timeout, network).
 * Non-retryable errors (400, 401, 403, 404, 422) are thrown immediately.
 *
 * @class FallbackChatProvider
 * @extends ChatProvider
 * @module vox-chronicle
 */

import { ChatProvider } from './ChatProvider.mjs';
import { Logger } from '../../utils/Logger.mjs';

/**
 * HTTP status codes that indicate a client/config error — not worth retrying
 * with another provider since the request itself is invalid.
 * @type {Set<number>}
 */
const NON_RETRYABLE_CODES = new Set([400, 401, 403, 404, 422]);

/**
 * Regex to extract HTTP status codes from error messages.
 * @type {RegExp}
 */
const STATUS_CODE_REGEX = /\b(\d{3})\b/;

export class FallbackChatProvider extends ChatProvider {
  /** @type {object} */
  #registry;

  /** @type {string|null} */
  #lastUsedProvider = null;

  /** @type {boolean} */
  #hasNotifiedFallback = false;

  /**
   * @param {object} registry - ProviderRegistry instance with getProvidersForCapability()
   */
  constructor(registry) {
    super();
    if (!registry) {
      throw new Error('FallbackChatProvider requires a ProviderRegistry instance');
    }
    this.#registry = registry;
    this._logger = Logger.createChild('FallbackChatProvider');
  }

  /**
   * Name of the last provider that successfully handled a request.
   * @returns {string|null}
   */
  get lastUsedProvider() {
    return this.#lastUsedProvider;
  }

  /**
   * Send a chat request, falling back to alternative providers on retryable errors.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {Promise<{content: string, usage: object}>}
   */
  async chat(messages, options = {}) {
    const providers = this.#getProviders();
    let lastError;

    for (let i = 0; i < providers.length; i++) {
      const { name, provider } = providers[i];
      try {
        const result = await provider.chat(messages, options);
        this.#lastUsedProvider = name;
        return result;
      } catch (error) {
        lastError = error;

        if (!this.#isRetryable(error)) {
          throw error;
        }

        this._logger.warn(
          `Provider "${name}" failed with retryable error: ${error.message}`
        );

        // Notify UI on first fallback only
        if (i === 0 && providers.length > 1) {
          this.#notifyFallback(name, providers[i + 1]?.name);
        }
      }
    }

    throw lastError;
  }

  /**
   * Send a streaming chat request, falling back on retryable errors.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    const providers = this.#getProviders();
    let lastError;

    for (let i = 0; i < providers.length; i++) {
      const { name, provider } = providers[i];
      try {
        const stream = provider.chatStream(messages, options);
        // Yield all tokens from the stream
        for await (const chunk of stream) {
          yield chunk;
        }
        this.#lastUsedProvider = name;
        return;
      } catch (error) {
        lastError = error;

        if (!this.#isRetryable(error)) {
          throw error;
        }

        this._logger.warn(
          `Provider "${name}" stream failed with retryable error: ${error.message}`
        );

        if (i === 0 && providers.length > 1) {
          this.#notifyFallback(name, providers[i + 1]?.name);
        }
      }
    }

    throw lastError;
  }

  /**
   * Get chat providers from the registry.
   * @returns {Array<{name: string, provider: object}>}
   * @throws {Error} If no chat providers are available
   */
  #getProviders() {
    const providers = this.#registry.getProvidersForCapability('chat');
    if (!providers || providers.length === 0) {
      throw new Error('No chat providers available');
    }
    return providers;
  }

  /**
   * Determine if an error is retryable (worth trying another provider).
   *
   * Non-retryable: 400, 401, 403, 404, 422 (client/config errors)
   * Retryable: 5xx, 429, timeout, network, unknown
   *
   * @param {Error} error
   * @returns {boolean}
   */
  #isRetryable(error) {
    const statusCode = this.#extractStatusCode(error);
    if (statusCode !== null) {
      return !NON_RETRYABLE_CODES.has(statusCode);
    }
    // AbortError (timeout), network errors, and unknown errors are retryable
    return true;
  }

  /**
   * Extract HTTP status code from an error.
   * Checks error.status property first, then parses from message.
   *
   * @param {Error} error
   * @returns {number|null}
   */
  #extractStatusCode(error) {
    // Check error.status property
    if (typeof error.status === 'number' && error.status >= 100 && error.status < 600) {
      return error.status;
    }

    // Parse from error message
    const match = error.message?.match(STATUS_CODE_REGEX);
    if (match) {
      const code = parseInt(match[1], 10);
      if (code >= 100 && code < 600) {
        return code;
      }
    }

    return null;
  }

  /**
   * Notify the UI that a fallback was activated (once per instance lifetime).
   *
   * @param {string} failedProvider
   * @param {string} nextProvider
   */
  #notifyFallback(failedProvider, nextProvider) {
    if (this.#hasNotifiedFallback) {
      return;
    }
    this.#hasNotifiedFallback = true;

    try {
      const message = globalThis.game?.i18n?.localize('VOXCHRONICLE.Provider.FallbackActivated')
        ?? `Chat provider "${failedProvider}" failed, falling back to "${nextProvider}"`;
      globalThis.ui?.notifications?.info(message);
    } catch {
      // UI not available — silently ignore
    }
  }
}
