/**
 * EmbeddingProvider - Abstract interface for text embedding providers
 *
 * All embedding providers must extend this class and implement embed().
 *
 * @abstract
 * @class EmbeddingProvider
 * @module vox-chronicle
 */

import { Logger } from '../../utils/Logger.mjs';

export class EmbeddingProvider {
  constructor() {
    if (new.target === EmbeddingProvider) {
      throw new Error('EmbeddingProvider is abstract and cannot be instantiated directly');
    }
    this._logger = Logger.createChild(this.constructor.name);
  }

  /**
   * Capabilities supported by this provider type.
   * @returns {string[]}
   */
  static get capabilities() {
    return ['embed'];
  }

  /**
   * Generate an embedding vector for text.
   * @param {string} text - Text to embed
   * @param {Object} [options={}]
   * @param {string} [options.model]
   * @param {AbortSignal} [options.abortSignal]
   * @returns {Promise<{embedding: number[], dimensions: number}>}
   * @abstract
   */
  async embed(text, options = {}) {
    throw new Error(
      game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotImplemented', { method: 'embed' })
        ?? 'Method embed must be implemented by provider subclass'
    );
  }

  /**
   * Validate that text is a non-empty string.
   * @param {*} text
   * @protected
   */
  _validateText(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new TypeError('text must be a non-empty string');
    }
  }

  /**
   * Validate common options.
   * @param {Object} options
   * @protected
   */
  _validateOptions(options) {
    if (options.abortSignal !== undefined && !(options.abortSignal instanceof AbortSignal)) {
      throw new TypeError('abortSignal must be an instance of AbortSignal');
    }
  }
}
