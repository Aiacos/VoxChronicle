/**
 * TranscriptionFactory - Factory for Transcription Service Selection
 *
 * Creates the appropriate transcription service based on configuration mode:
 * - 'api': Use OpenAI TranscriptionService (cloud-based)
 * - 'local': Use LocalWhisperService (privacy-focused, offline)
 * - 'auto': Try local first, fallback to API if unavailable
 *
 * This factory pattern enables seamless switching between transcription
 * backends without changing orchestration code.
 *
 * @class TranscriptionFactory
 * @module vox-chronicle
 */

import { TranscriptionService } from './TranscriptionService.mjs';
import { LocalWhisperService } from './LocalWhisperService.mjs';
import { Logger } from '../utils/Logger.mjs';

/**
 * Transcription mode enumeration
 * @enum {string}
 */
const TranscriptionMode = {
  /** Use OpenAI API only (requires internet, API key) */
  API: 'api',
  /** Use local Whisper backend only (privacy-focused, offline) */
  LOCAL: 'local',
  /** Try local first, fallback to API if unavailable */
  AUTO: 'auto'
};

/**
 * TranscriptionFactory class
 * Provides static factory methods for creating transcription services
 */
class TranscriptionFactory {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  static _logger = Logger.createChild('TranscriptionFactory');

  /**
   * Create a transcription service based on mode
   *
   * @param {object} config - Configuration object
   * @param {string} config.mode - Transcription mode ('api', 'local', or 'auto')
   * @param {import('./providers/TranscriptionProvider.mjs').TranscriptionProvider} [config.provider] - Transcription provider instance (required for 'api' and 'auto' API fallback modes)
   * @param {string} [config.openaiApiKey] - OpenAI API key (legacy, ignored when provider is given)
   * @param {string} [config.whisperBackendUrl] - Local Whisper backend URL (required for 'local' and 'auto' modes)
   * @param {object} [config.options] - Additional options for the service
   * @param {string} [config.options.defaultLanguage] - Default transcription language
   * @param {object} [config.options.defaultSpeakerMap] - Default speaker ID to name mapping
   * @param {number} [config.options.timeout] - Request timeout in milliseconds
   * @returns {Promise<object>} Transcription service instance
   * @throws {Error} If configuration is invalid or required parameters are missing
   *
   * @example
   * // Create API-based service with provider
   * const provider = new OpenAITranscriptionProvider('sk-...');
   * const service = await TranscriptionFactory.create({
   *   mode: 'api',
   *   provider
   * });
   *
   * @example
   * // Create local service
   * const service = await TranscriptionFactory.create({
   *   mode: 'local',
   *   whisperBackendUrl: 'http://localhost:8080'
   * });
   *
   * @example
   * // Create auto-fallback service
   * const provider = new OpenAITranscriptionProvider('sk-...');
   * const service = await TranscriptionFactory.create({
   *   mode: 'auto',
   *   provider,
   *   whisperBackendUrl: 'http://localhost:8080'
   * });
   */
  static async create(config) {
    this._logger.debug('create called', { mode: config?.mode, hasProvider: Boolean(config?.provider), hasBackendUrl: Boolean(config?.whisperBackendUrl) });
    const t0 = Date.now();

    if (!config || typeof config !== 'object') {
      throw new Error('TranscriptionFactory.create() requires a configuration object');
    }

    const mode = config.mode || TranscriptionMode.API;
    const options = config.options || {};

    this._logger.debug(`Creating transcription service with mode: ${mode}`);

    let service;
    switch (mode) {
      case TranscriptionMode.API:
        service = this._createApiService(config.provider, options);
        break;

      case TranscriptionMode.LOCAL:
        service = this._createLocalService(config.whisperBackendUrl, options);
        break;

      case TranscriptionMode.AUTO:
        service = await this._createAutoService(config.provider, config.whisperBackendUrl, options);
        break;

      default:
        this._logger.warn(`Unknown transcription mode: ${mode}, falling back to 'api'`);
        service = this._createApiService(config.provider, options);
        break;
    }

    this._logger.debug(`create completed in ${Date.now() - t0}ms, service: ${service.constructor.name}`);
    return service;
  }

  /**
   * Create OpenAI API-based transcription service
   *
   * @param {import('./providers/TranscriptionProvider.mjs').TranscriptionProvider} provider - Transcription provider instance
   * @param {object} [options] - Service options
   * @returns {TranscriptionService} OpenAI transcription service
   * @throws {Error} If provider is missing
   * @private
   */
  static _createApiService(provider, options = {}) {
    this._logger.debug('_createApiService called');
    if (!provider) {
      throw new Error('A transcription provider is required for API transcription mode');
    }

    this._logger.log('Creating OpenAI TranscriptionService');

    return new TranscriptionService(provider, options);
  }

  /**
   * Create local Whisper-based transcription service
   *
   * @param {string} backendUrl - Whisper backend URL
   * @param {object} [options] - Service options
   * @returns {LocalWhisperService} Local Whisper transcription service
   * @throws {Error} If backend URL is missing
   * @private
   */
  static _createLocalService(backendUrl, options = {}) {
    this._logger.debug('_createLocalService called', { backendUrl });
    if (!backendUrl) {
      throw new Error('Whisper backend URL is required for local transcription mode');
    }

    this._logger.log(`Creating LocalWhisperService with backend: ${backendUrl}`);

    return new LocalWhisperService(backendUrl, options);
  }

  /**
   * Create auto-fallback transcription service
   * Tries local first, falls back to API if local is unavailable
   *
   * @param {import('./providers/TranscriptionProvider.mjs').TranscriptionProvider} provider - Transcription provider instance for API fallback
   * @param {string} backendUrl - Whisper backend URL
   * @param {object} [options] - Service options
   * @returns {Promise<object>} Transcription service (local or API)
   * @throws {Error} If both services are unavailable
   * @private
   */
  static async _createAutoService(provider, backendUrl, options = {}) {
    this._logger.debug('_createAutoService called', { hasProvider: Boolean(provider), backendUrl });
    this._logger.log('Auto mode: checking local Whisper backend availability...');

    // Try local service first
    if (backendUrl) {
      try {
        const localService = new LocalWhisperService(backendUrl, options);

        // Perform health check with short timeout
        const isHealthy = await localService.healthCheck({
          timeout: 3000,
          useCache: false
        });

        if (isHealthy) {
          this._logger.log('Local Whisper backend is available, using local service');
          return localService;
        } else {
          this._logger.warn('Local Whisper backend health check failed, falling back to API');
        }
      } catch (error) {
        this._logger.warn(`Failed to create local service: ${error.message}, falling back to API`);
      }
    } else {
      this._logger.warn('No Whisper backend URL configured, falling back to API');
    }

    // Fallback to API service
    if (!provider) {
      throw new Error(
        'Auto mode failed: local backend unavailable and no OpenAI API key configured. ' +
          'Please configure either a local Whisper backend or an OpenAI API key.'
      );
    }

    this._logger.log('Falling back to OpenAI TranscriptionService');
    return new TranscriptionService(provider, options);
  }

  /**
   * Check if a local Whisper backend is available
   *
   * @param {string} backendUrl - Whisper backend URL
   * @param {object} [options] - Health check options
   * @returns {Promise<boolean>} True if backend is healthy
   *
   * @example
   * const isAvailable = await TranscriptionFactory.checkLocalBackend('http://localhost:8080');
   * if (isAvailable) {
   *   console.log('Local backend is ready');
   * }
   */
  static async checkLocalBackend(backendUrl, options = {}) {
    this._logger.debug('checkLocalBackend called', { backendUrl });
    const t0 = Date.now();

    if (!backendUrl) {
      this._logger.debug('checkLocalBackend: no URL provided');
      return false;
    }

    try {
      const localService = new LocalWhisperService(backendUrl);
      const result = await localService.healthCheck(options);
      this._logger.debug(`checkLocalBackend completed in ${Date.now() - t0}ms`, { healthy: result });
      return result;
    } catch (error) {
      this._logger.debug(`Backend check failed after ${Date.now() - t0}ms: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the recommended mode based on available configuration
   *
   * @param {object} config - Configuration to evaluate
   * @param {string} [config.openaiApiKey] - OpenAI API key
   * @param {string} [config.whisperBackendUrl] - Whisper backend URL
   * @returns {string} Recommended mode ('api', 'local', or 'auto')
   *
   * @example
   * const mode = TranscriptionFactory.getRecommendedMode({
   *   openaiApiKey: 'sk-...',
   *   whisperBackendUrl: 'http://localhost:8080'
   * });
   * // Returns 'auto' since both are available
   */
  static getRecommendedMode(config) {
    this._logger.debug('getRecommendedMode called', { hasApiKey: Boolean(config?.openaiApiKey), hasProvider: Boolean(config?.provider), hasBackendUrl: Boolean(config?.whisperBackendUrl) });
    const hasApiKey = Boolean(config.openaiApiKey);
    const hasBackendUrl = Boolean(config.whisperBackendUrl);

    if (hasApiKey && hasBackendUrl) {
      return TranscriptionMode.AUTO;
    } else if (hasBackendUrl) {
      return TranscriptionMode.LOCAL;
    } else if (hasApiKey) {
      return TranscriptionMode.API;
    } else {
      this._logger.warn('No transcription backend configured');
      return TranscriptionMode.API; // Default, will fail at creation
    }
  }

  /**
   * Get available transcription modes
   *
   * @returns {Array<object>} List of available modes with descriptions
   */
  static getAvailableModes() {
    return [
      {
        id: TranscriptionMode.API,
        name: 'API Only',
        description: 'Use OpenAI cloud API (requires internet and API key)',
        requiresApiKey: true,
        requiresBackend: false,
        supportsOffline: false
      },
      {
        id: TranscriptionMode.LOCAL,
        name: 'Local Whisper',
        description: 'Use local Whisper backend (privacy-focused, works offline)',
        requiresApiKey: false,
        requiresBackend: true,
        supportsOffline: true
      },
      {
        id: TranscriptionMode.AUTO,
        name: 'Auto (Local + API Fallback)',
        description: 'Try local first, fallback to API if unavailable (recommended)',
        requiresApiKey: true,
        requiresBackend: true,
        supportsOffline: true
      }
    ];
  }
}

// Export class and enums
export { TranscriptionFactory, TranscriptionMode };
