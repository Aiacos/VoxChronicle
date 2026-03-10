/**
 * OpenAIImageProvider - OpenAI implementation of ImageProvider
 *
 * Implements generateImage() using the OpenAI Images API with gpt-image-1.
 * Returns base64 data (NOT URLs).
 *
 * @class OpenAIImageProvider
 * @extends ImageProvider
 * @module vox-chronicle
 */

import { ImageProvider } from './ImageProvider.mjs';
import { OpenAIClient } from '../OpenAIClient.mjs';

export class OpenAIImageProvider extends ImageProvider {
  #client;

  /**
   * @param {string} apiKey - OpenAI API key
   * @param {Object} [options={}]
   * @param {number} [options.timeout=300000] - Request timeout in ms (5 min default)
   */
  constructor(apiKey, options = {}) {
    super();
    this.#client = new OpenAIClient(apiKey, {
      timeout: options.timeout ?? 300000,
      ...options,
    });
  }

  /** @returns {string[]} */
  static get capabilities() {
    return ['generateImage'];
  }

  /**
   * Generate an image from a text prompt.
   * @param {string} prompt
   * @param {Object} [options={}]
   * @param {string} [options.model='gpt-image-1']
   * @param {string} [options.size='1024x1024']
   * @param {string} [options.quality='medium']
   * @param {AbortSignal} [options.abortSignal]
   * @returns {Promise<{data: string, format: string}>}
   */
  async generateImage(prompt, options = {}) {
    this._validatePrompt(prompt);
    this._validateOptions(options);

    const body = {
      model: options.model ?? 'gpt-image-1',
      prompt,
      n: 1,
      size: options.size ?? '1024x1024',
      quality: options.quality ?? 'medium',
    };

    const response = await this.#client.post('/images/generations', body, {
      signal: options.abortSignal,
    });

    const imageData = response?.data?.[0];
    if (!imageData?.b64_json) {
      throw new Error('OpenAI image response missing b64_json data');
    }
    return {
      data: imageData.b64_json,
      format: 'png',
    };
  }
}
