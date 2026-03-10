/**
 * OpenAITranscriptionProvider - OpenAI implementation of TranscriptionProvider
 *
 * Implements transcribe() using the OpenAI Audio Transcriptions API.
 * Supports speaker diarization via gpt-4o-transcribe-diarize model.
 * Uses FormData for file upload (NOT JSON).
 *
 * @class OpenAITranscriptionProvider
 * @extends TranscriptionProvider
 * @module vox-chronicle
 */

import { TranscriptionProvider } from './TranscriptionProvider.mjs';
import { OpenAIClient } from '../OpenAIClient.mjs';

export class OpenAITranscriptionProvider extends TranscriptionProvider {
  #client;

  /**
   * @param {string} apiKey - OpenAI API key
   * @param {Object} [options={}]
   * @param {number} [options.timeout=600000] - Request timeout in ms (10 min default)
   */
  constructor(apiKey, options = {}) {
    super();
    this.#client = new OpenAIClient(apiKey, {
      timeout: options.timeout ?? 600000,
      ...options,
    });
  }

  /** @returns {string[]} */
  static get capabilities() {
    return ['transcribe'];
  }

  /**
   * Transcribe audio to text.
   * @param {Blob} audioBlob - Audio data to transcribe
   * @param {Object} [options={}]
   * @param {boolean} [options.diarize=false] - Enable speaker diarization
   * @param {string} [options.language] - Language code (e.g., 'en', 'it')
   * @param {string} [options.prompt] - Context prompt (ignored when diarize is true)
   * @param {AbortSignal} [options.abortSignal]
   * @returns {Promise<{text: string, segments: Array}>}
   */
  async transcribe(audioBlob, options = {}) {
    this._validateAudioBlob(audioBlob);
    this._validateOptions(options);

    const diarize = options.diarize === true;
    const model = diarize ? 'gpt-4o-transcribe-diarize' : (options.model ?? 'gpt-4o-transcribe');
    const responseFormat = diarize ? 'diarized_json' : 'verbose_json';

    const formData = new FormData();
    formData.append('file', audioBlob, audioBlob.name || 'audio.webm');
    formData.append('model', model);
    formData.append('response_format', responseFormat);

    if (options.language) {
      formData.append('language', options.language);
    }

    // gpt-4o-transcribe-diarize does NOT support the prompt parameter
    if (!diarize && options.prompt) {
      formData.append('prompt', options.prompt);
    }

    const response = await this.#client.postFormData('/audio/transcriptions', formData, {
      signal: options.abortSignal,
    });

    return {
      text: response.text,
      segments: response.segments ?? [],
    };
  }
}
