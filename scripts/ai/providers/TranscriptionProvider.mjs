/**
 * TranscriptionProvider - Abstract interface for audio transcription providers
 *
 * All transcription providers must extend this class and implement transcribe().
 *
 * @abstract
 * @class TranscriptionProvider
 * @module vox-chronicle
 */

import { Logger } from '../../utils/Logger.mjs';

export class TranscriptionProvider {
  constructor() {
    if (new.target === TranscriptionProvider) {
      throw new Error('TranscriptionProvider is abstract and cannot be instantiated directly');
    }
    this._logger = Logger.createChild(this.constructor.name);
  }

  /**
   * Capabilities supported by this provider type.
   * @returns {string[]}
   */
  static get capabilities() {
    return ['transcribe'];
  }

  /**
   * Transcribe audio to text with optional speaker diarization.
   * @param {Blob} audioBlob - Audio data to transcribe
   * @param {object} [options={}]
   * @param {string} [options.model]
   * @param {AbortSignal} [options.abortSignal]
   * @returns {Promise<{text: string, segments: Array}>}
   * @abstract
   */
  async transcribe(audioBlob, options = {}) {
    throw new Error(
      game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotImplemented', {
        method: 'transcribe'
      }) ?? 'Method transcribe must be implemented by provider subclass'
    );
  }

  /**
   * Validate that audioBlob is a Blob or blob-like object.
   * @param {*} audioBlob
   * @protected
   */
  _validateAudioBlob(audioBlob) {
    if (
      !audioBlob ||
      typeof audioBlob !== 'object' ||
      typeof audioBlob.size !== 'number' ||
      typeof audioBlob.type !== 'string'
    ) {
      throw new TypeError('audioBlob must be a Blob or an object with size and type properties');
    }
    if (audioBlob.size === 0) {
      throw new TypeError('audioBlob must not be empty (size is 0)');
    }
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
