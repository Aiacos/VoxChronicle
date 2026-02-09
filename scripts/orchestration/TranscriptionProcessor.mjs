/**
 * TranscriptionProcessor - Audio Transcription Workflow Management
 *
 * Handles the transcription workflow with support for both local Whisper
 * and OpenAI API transcription services. Includes automatic fallback from
 * local to API when configured in 'auto' mode.
 *
 * @class TranscriptionProcessor
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { LocalWhisperService } from '../ai/LocalWhisperService.mjs';
import { TranscriptionService } from '../ai/TranscriptionService.mjs';

/**
 * Transcription mode options
 * @enum {string}
 */
const TranscriptionMode = {
  /** Use local Whisper only */
  LOCAL: 'local',
  /** Use OpenAI API only */
  API: 'api',
  /** Try local first, fallback to API on error */
  AUTO: 'auto'
};

/**
 * TranscriptionProcessor class for managing transcription workflows
 *
 * @example
 * const processor = new TranscriptionProcessor({
 *   transcriptionService: localWhisperService,
 *   config: {
 *     mode: 'auto',
 *     openaiApiKey: 'sk-...'
 *   }
 * });
 *
 * const result = await processor.processTranscription(audioBlob, {
 *   speakerMap: { 'SPEAKER_00': 'Game Master' },
 *   language: 'en',
 *   onProgress: (progress, message) => console.log(message)
 * });
 */
class TranscriptionProcessor {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('TranscriptionProcessor');

  /**
   * Primary transcription service (local or API)
   * @type {object | null}
   * @private
   */
  _transcriptionService = null;

  /**
   * Transcription configuration (mode, API key for fallback)
   * @type {object | null}
   * @private
   */
  _config = null;

  /**
   * Create a new TranscriptionProcessor instance
   *
   * @param {object} options - Configuration options
   * @param {object} options.transcriptionService - Primary transcription service (LocalWhisperService or TranscriptionService)
   * @param {object} [options.config] - Transcription configuration
   * @param {string} [options.config.mode='local'] - Transcription mode ('local', 'api', or 'auto')
   * @param {string} [options.config.openaiApiKey] - OpenAI API key for fallback in auto mode
   */
  constructor(options = {}) {
    if (!options.transcriptionService) {
      throw new Error('TranscriptionProcessor requires a transcriptionService');
    }

    this._transcriptionService = options.transcriptionService;
    this._config = options.config || {};

    this._logger.debug('TranscriptionProcessor initialized');
  }

  /**
   * Process transcription for an audio blob
   *
   * @param {Blob} audioBlob - Audio data to transcribe
   * @param {object} [options] - Processing options
   * @param {object} [options.speakerMap] - Speaker ID to name mapping
   * @param {string} [options.language] - Language code (e.g., 'en', 'it')
   * @param {Function} [options.onProgress] - Progress callback (progress: number, message: string)
   * @returns {Promise<TranscriptionResult>} Transcription result with segments and speakers
   * @throws {Error} If transcription fails
   */
  async processTranscription(audioBlob, options = {}) {
    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new Error('Invalid audio blob provided for transcription');
    }

    this._logger.log('Processing transcription...');

    const speakerMap = options.speakerMap || {};
    const language = options.language;
    const onProgress = options.onProgress || (() => {});

    // Determine current transcription mode
    const isLocalService = this._transcriptionService instanceof LocalWhisperService;
    const mode =
      this._config?.mode || (isLocalService ? TranscriptionMode.LOCAL : TranscriptionMode.API);

    onProgress(0, `Starting transcription (${mode} mode)...`);

    try {
      // Attempt transcription with primary service
      const transcriptResult = await this._transcribeWithService(
        this._transcriptionService,
        audioBlob,
        { speakerMap, language, onProgress }
      );

      onProgress(100, 'Transcription complete');
      this._logger.log(
        `Transcription complete: ${transcriptResult.segments?.length || 0} segments`
      );

      return transcriptResult;
    } catch (transcriptionError) {
      // Handle fallback for auto mode with local service
      if (isLocalService && mode === TranscriptionMode.AUTO) {
        this._logger.warn(
          'Local transcription failed, attempting fallback to API...',
          transcriptionError.message
        );

        // Check if we have API key for fallback
        if (!this._config?.openaiApiKey) {
          throw new Error(
            'Local transcription failed and no OpenAI API key configured for fallback. ' +
              `Error: ${transcriptionError.message}`
          );
        }

        onProgress(0, 'Falling back to API transcription...');

        // Create API service for fallback
        const apiService = new TranscriptionService(this._config.openaiApiKey);

        this._logger.log('Using OpenAI API as fallback');

        try {
          // Retry with API service
          const transcriptResult = await this._transcribeWithService(apiService, audioBlob, {
            speakerMap,
            language,
            onProgress: (progress, message) => {
              onProgress(progress, `${message} (API fallback)`);
            }
          });

          this._logger.log('Fallback to API transcription successful');
          onProgress(100, 'Transcription complete (via API fallback)');

          return transcriptResult;
        } catch (fallbackError) {
          this._logger.error('API fallback transcription also failed:', fallbackError);
          throw new Error(
            `Both local and API transcription failed. ` +
              `Local error: ${transcriptionError.message}. ` +
              `API error: ${fallbackError.message}`
          );
        }
      }

      // Re-throw if not in auto mode or not a local service error
      this._logger.error('Transcription failed:', transcriptionError);
      throw transcriptionError;
    }
  }

  /**
   * Transcribe audio with a specific service
   *
   * @param {object} service - Transcription service instance
   * @param {Blob} audioBlob - Audio data to transcribe
   * @param {object} options - Transcription options
   * @returns {Promise<TranscriptionResult>} Transcription result
   * @private
   */
  async _transcribeWithService(service, audioBlob, options) {
    const { speakerMap, language, onProgress } = options;

    return await service.transcribe(audioBlob, {
      speakerMap,
      language,
      onProgress: (progress) => {
        const currentChunk = progress.currentChunk || 1;
        const totalChunks = progress.totalChunks || 1;
        const progressPercent = progress.progress || 0;

        onProgress(progressPercent, `Transcribing chunk ${currentChunk}/${totalChunks}`);
      }
    });
  }

  /**
   * Get the current transcription mode
   *
   * @returns {string} Current mode ('local', 'api', or 'auto')
   */
  getMode() {
    const isLocalService = this._transcriptionService instanceof LocalWhisperService;
    return this._config?.mode || (isLocalService ? TranscriptionMode.LOCAL : TranscriptionMode.API);
  }

  /**
   * Check if fallback to API is available
   *
   * @returns {boolean} True if fallback is configured
   */
  hasFallback() {
    const isLocalService = this._transcriptionService instanceof LocalWhisperService;
    const mode = this.getMode();
    return isLocalService && mode === TranscriptionMode.AUTO && !!this._config?.openaiApiKey;
  }

  /**
   * Update transcription configuration
   *
   * @param {object} config - New configuration
   * @param {string} [config.mode] - Transcription mode
   * @param {string} [config.openaiApiKey] - OpenAI API key for fallback
   */
  updateConfig(config) {
    this._config = { ...this._config, ...config };
    this._logger.debug('Transcription configuration updated');
  }
}

export { TranscriptionProcessor, TranscriptionMode };
