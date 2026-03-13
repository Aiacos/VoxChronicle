/**
 * ImageProvider - Abstract interface for image generation providers
 *
 * All image providers must extend this class and implement generateImage().
 *
 * @abstract
 * @class ImageProvider
 * @module vox-chronicle
 */

import { Logger } from '../../utils/Logger.mjs';

export class ImageProvider {
  constructor() {
    if (new.target === ImageProvider) {
      throw new Error('ImageProvider is abstract and cannot be instantiated directly');
    }
    this._logger = Logger.createChild(this.constructor.name);
  }

  /**
   * Capabilities supported by this provider type.
   * @returns {string[]}
   */
  static get capabilities() {
    return ['generateImage'];
  }

  /**
   * Generate an image from a text prompt.
   * @param {string} prompt - Text description of the image
   * @param {Object} [options={}]
   * @param {string} [options.model]
   * @param {AbortSignal} [options.abortSignal]
   * @returns {Promise<{data: string, format: string}>}
   * @abstract
   */
  async generateImage(prompt, options = {}) {
    throw new Error(
      game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotImplemented', { method: 'generateImage' })
        ?? 'Method generateImage must be implemented by provider subclass'
    );
  }

  /**
   * Validate that prompt is a non-empty string.
   * @param {*} prompt
   * @protected
   */
  _validatePrompt(prompt) {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new TypeError('prompt must be a non-empty string');
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
