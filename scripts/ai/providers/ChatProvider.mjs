/**
 * ChatProvider - Abstract interface for chat AI providers
 *
 * All chat providers must extend this class and implement chat() and chatStream().
 * Follows the same abstract class pattern as RAGProvider.mjs.
 *
 * @abstract
 * @class ChatProvider
 * @module vox-chronicle
 */

import { Logger } from '../../utils/Logger.mjs';

export class ChatProvider {
  constructor() {
    if (new.target === ChatProvider) {
      throw new Error('ChatProvider is abstract and cannot be instantiated directly');
    }
    this._logger = Logger.createChild(this.constructor.name);
  }

  /**
   * Capabilities supported by this provider type.
   * @returns {string[]}
   */
  static get capabilities() {
    return ['chat', 'chatStream'];
  }

  /**
   * Send a chat completion request.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @param {string} [options.model]
   * @param {number} [options.temperature]
   * @param {number} [options.maxTokens]
   * @param {AbortSignal} [options.abortSignal]
   * @returns {Promise<{content: string, usage: object}>}
   * @abstract
   */
  async chat(messages, options = {}) {
    throw new Error(
      game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotImplemented', { method: 'chat' }) ??
        'Method chat must be implemented by provider subclass'
    );
  }

  /**
   * Send a streaming chat completion request.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   * @abstract
   */
  async *chatStream(messages, options = {}) {
    throw new Error(
      game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotImplemented', {
        method: 'chatStream'
      }) ?? 'Method chatStream must be implemented by provider subclass'
    );
  }

  /**
   * Validate common options.
   * @param {object} options
   * @protected
   */
  _validateOptions(options) {
    if (options.abortSignal !== undefined && !(options.abortSignal instanceof AbortSignal)) {
      throw new TypeError('abortSignal must be an instance of AbortSignal');
    }
  }
}
