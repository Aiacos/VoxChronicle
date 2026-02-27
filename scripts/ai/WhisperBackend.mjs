/**
 * WhisperBackend - HTTP Client for Local Whisper Server
 *
 * Provides communication with a local Whisper server (whisper.cpp, faster-whisper, etc.)
 * running as an HTTP service. Handles health checks, transcription requests, and error
 * handling for offline transcription mode.
 *
 * @class WhisperBackend
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { RateLimiter } from '../utils/RateLimiter.mjs';

/**
 * Whisper backend error types enumeration
 * @enum {string}
 */
const WhisperErrorType = {
  CONNECTION_ERROR: 'connection_error',
  SERVER_ERROR: 'server_error',
  INVALID_REQUEST_ERROR: 'invalid_request_error',
  TIMEOUT_ERROR: 'timeout_error',
  UNSUPPORTED_FORMAT_ERROR: 'unsupported_format_error'
};

/**
 * Default Whisper backend URL (standard whisper.cpp server port)
 * @constant {string}
 */
const DEFAULT_WHISPER_URL = 'http://localhost:8080';

/**
 * Default request timeout in milliseconds (10 minutes for transcription)
 * @constant {number}
 */
const DEFAULT_TIMEOUT_MS = 600000;

/**
 * Health check timeout in milliseconds
 * @constant {number}
 */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Custom error class for Whisper backend errors
 *
 * @augments Error
 */
class WhisperError extends Error {
  /**
   * Create a Whisper error
   *
   * @param {string} message - Error message
   * @param {string} type - Error type from WhisperErrorType
   * @param {number} [status] - HTTP status code
   * @param {object} [details] - Additional error details
   */
  constructor(message, type, status = null, details = null) {
    super(message);
    this.name = 'WhisperError';
    this.type = type;
    this.status = status;
    this.details = details;
  }

  /**
   * Check if this is a retryable error
   *
   * @returns {boolean} True if the error can be retried
   */
  get isRetryable() {
    return (
      this.type === WhisperErrorType.TIMEOUT_ERROR ||
      this.type === WhisperErrorType.CONNECTION_ERROR ||
      (this.status >= 500 && this.status < 600)
    );
  }
}

/**
 * WhisperBackend class for local Whisper server communication
 *
 * @example
 * const backend = new WhisperBackend('http://localhost:8080');
 * const isHealthy = await backend.healthCheck();
 * if (isHealthy) {
 *   const response = await backend.transcribe(audioBlob, { language: 'en' });
 * }
 */
class WhisperBackend {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('WhisperBackend');

  /**
   * Backend server base URL
   * @type {string}
   * @private
   */
  _baseUrl = DEFAULT_WHISPER_URL;

  /**
   * Rate limiter for backend requests
   * @type {RateLimiter}
   * @private
   */
  _rateLimiter = null;

  /**
   * Default request timeout in milliseconds
   * @type {number}
   * @private
   */
  _timeout = DEFAULT_TIMEOUT_MS;

  /**
   * Maximum retry attempts for failed requests
   * @type {number}
   * @private
   */
  _maxRetries = 3;

  /**
   * Last known health status
   * @type {boolean|null}
   * @private
   */
  _lastHealthStatus = null;

  /**
   * Last health check timestamp
   * @type {number|null}
   * @private
   */
  _lastHealthCheck = null;

  /**
   * Create a new WhisperBackend instance
   *
   * @param {string} [baseUrl] - Whisper server base URL
   * @param {object} [options] - Configuration options
   * @param {number} [options.timeout=600000] - Request timeout in milliseconds
   * @param {number} [options.maxRetries=3] - Maximum retry attempts for failed requests
   */
  constructor(baseUrl = DEFAULT_WHISPER_URL, options = {}) {
    this._baseUrl = baseUrl || DEFAULT_WHISPER_URL;
    this._timeout = options.timeout || DEFAULT_TIMEOUT_MS;
    this._maxRetries = options.maxRetries ?? 3;

    // Initialize rate limiter for local backend (more permissive than cloud APIs)
    this._rateLimiter = new RateLimiter({
      requestsPerMinute: 100,
      name: 'WhisperBackend',
      maxRetries: this._maxRetries
    });

    this._logger.debug(`WhisperBackend initialized with URL: ${this._baseUrl}`);
  }

  /**
   * Get the backend base URL
   *
   * @returns {string} The base URL
   */
  get baseUrl() {
    return this._baseUrl;
  }

  /**
   * Update the backend URL
   *
   * @param {string} baseUrl - New base URL
   */
  setBaseUrl(baseUrl) {
    this._baseUrl = baseUrl || DEFAULT_WHISPER_URL;
    this._lastHealthStatus = null; // Invalidate health status
    this._lastHealthCheck = null;
    this._logger.debug(`Backend URL updated to: ${this._baseUrl}`);
  }

  /**
   * Get the last known health status
   *
   * @returns {boolean|null} Last health status, null if never checked
   */
  get lastHealthStatus() {
    return this._lastHealthStatus;
  }

  /**
   * Perform a health check on the Whisper backend
   *
   * @param {object} [options] - Health check options
   * @param {number} [options.timeout=5000] - Health check timeout in milliseconds
   * @param {boolean} [options.useCache=true] - Use cached result if recent
   * @param {number} [options.cacheMaxAge=30000] - Maximum age of cached result in milliseconds
   * @returns {Promise<boolean>} True if backend is healthy and accessible
   */
  async healthCheck(options = {}) {
    this._logger.debug('healthCheck called', { timeout: options.timeout, useCache: options.useCache });
    const t0 = Date.now();
    const timeout = options.timeout || HEALTH_CHECK_TIMEOUT_MS;
    const useCache = options.useCache ?? true;
    const cacheMaxAge = options.cacheMaxAge || 30000;

    // Return cached result if recent enough
    if (useCache && this._lastHealthStatus !== null && this._lastHealthCheck) {
      const age = Date.now() - this._lastHealthCheck;
      if (age < cacheMaxAge) {
        this._logger.debug(`Using cached health status: ${this._lastHealthStatus} (age: ${age}ms)`);
        return this._lastHealthStatus;
      }
    }

    this._logger.debug('Performing health check...');

    try {
      // Try to reach the server with a simple GET request
      // Most Whisper servers have a /health or / endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${this._baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      })
        .catch(async (error) => {
          // If /health doesn't exist, try root endpoint with fresh timeout
          if (error.name !== 'AbortError') {
            clearTimeout(timeoutId);
            const fallbackController = new AbortController();
            const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), timeout);
            try {
              return await fetch(`${this._baseUrl}/`, {
                method: 'GET',
                signal: fallbackController.signal
              });
            } finally {
              clearTimeout(fallbackTimeoutId);
            }
          }
          throw error;
        })
        .finally(() => {
          clearTimeout(timeoutId);
        });

      const isHealthy = response.ok || response.status === 404; // 404 is ok, server exists
      this._lastHealthStatus = isHealthy;
      this._lastHealthCheck = Date.now();

      if (isHealthy) {
        this._logger.debug('Health check passed');
      } else {
        this._logger.warn(`Health check failed: HTTP ${response.status}`);
      }

      return isHealthy;
    } catch (error) {
      this._lastHealthStatus = false;
      this._lastHealthCheck = Date.now();

      if (error.name === 'AbortError') {
        this._logger.warn('Health check timeout');
      } else {
        this._logger.warn(`Health check failed: ${error.message}`);
      }

      return false;
    }
  }

  /**
   * Transcribe audio using the local Whisper backend
   *
   * @param {Blob|File} audioBlob - Audio file to transcribe
   * @param {object} [options] - Transcription options
   * @param {string} [options.language] - ISO language code (e.g., 'en', 'it')
   * @param {string} [options.task='transcribe'] - Task type ('transcribe' or 'translate')
   * @param {boolean} [options.word_timestamps=false] - Include word-level timestamps
   * @param {number} [options.temperature=0] - Sampling temperature (0-1)
   * @param {string} [options.response_format='json'] - Response format ('json', 'text', 'srt', 'vtt')
   * @returns {Promise<object>} Transcription result
   */
  async transcribe(audioBlob, options = {}) {
    this._logger.debug('transcribe called', { blobSize: audioBlob?.size, language: options.language, task: options.task });
    const t0 = Date.now();

    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new WhisperError(
        'Invalid audio input: expected Blob or File',
        WhisperErrorType.INVALID_REQUEST_ERROR
      );
    }

    this._logger.log(
      `Starting local transcription: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`
    );

    // Build FormData for multipart/form-data request
    const formData = new FormData();

    // Append audio file
    const filename = audioBlob.name || 'audio.webm';
    formData.append('file', audioBlob, filename);

    // Append optional parameters
    if (options.language) {
      formData.append('language', options.language);
    }

    if (options.task) {
      formData.append('task', options.task);
    }

    if (options.word_timestamps !== undefined) {
      formData.append('word_timestamps', String(options.word_timestamps));
    }

    if (options.temperature !== undefined) {
      formData.append('temperature', String(options.temperature));
    }

    if (options.response_format) {
      formData.append('response_format', options.response_format);
    }

    try {
      // Apply rate limiting
      await this._rateLimiter.throttle();

      // Send transcription request
      const response = await this._requestWithRetry('/inference', {
        method: 'POST',
        body: formData
      });

      this._logger.log(`Local transcription completed successfully in ${Date.now() - t0}ms`);
      return response;
    } catch (error) {
      this._logger.error(`Local transcription failed after ${Date.now() - t0}ms: ${error.message}`, { blobSize: audioBlob?.size });
      throw error;
    }
  }

  /**
   * Make an HTTP request to the Whisper backend with retry logic
   *
   * @param {string} endpoint - API endpoint path
   * @param {object} options - Fetch options
   * @param {number} [retryCount=0] - Current retry attempt
   * @returns {Promise<object>} Response data
   * @private
   */
  async _requestWithRetry(endpoint, options = {}, retryCount = 0) {
    const url = `${this._baseUrl}${endpoint}`;
    const t0 = Date.now();
    this._logger.debug(`_requestWithRetry ${options.method || 'GET'} ${endpoint}`, { retryCount });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this._timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      }).finally(() => {
        clearTimeout(timeoutId);
      });

      // Handle response
      if (!response.ok) {
        this._logger.debug(`_requestWithRetry ${endpoint} returned HTTP ${response.status} in ${Date.now() - t0}ms`);
        const errorData = await this._parseErrorResponse(response);
        throw new WhisperError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          this._getErrorType(response.status),
          response.status,
          errorData
        );
      }

      this._logger.debug(`_requestWithRetry ${endpoint} completed in ${Date.now() - t0}ms, status: ${response.status}`);

      // Parse response based on content type
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      // Handle timeout
      if (error.name === 'AbortError') {
        const timeoutError = new WhisperError(
          `Request timeout after ${this._timeout}ms`,
          WhisperErrorType.TIMEOUT_ERROR
        );

        // Retry if under max retries
        if (retryCount < this._maxRetries) {
          this._logger.warn(`Timeout, retrying (${retryCount + 1}/${this._maxRetries})...`);
          await this._delay(1000 * (retryCount + 1)); // Exponential backoff
          return this._requestWithRetry(endpoint, options, retryCount + 1);
        }

        throw timeoutError;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const connectionError = new WhisperError(
          `Failed to connect to Whisper backend at ${this._baseUrl}. Is the server running?`,
          WhisperErrorType.CONNECTION_ERROR,
          null,
          { originalError: error.message }
        );

        // Retry if under max retries
        if (retryCount < this._maxRetries) {
          this._logger.warn(
            `Connection failed, retrying (${retryCount + 1}/${this._maxRetries})...`
          );
          await this._delay(2000 * (retryCount + 1)); // Longer backoff for connection issues
          return this._requestWithRetry(endpoint, options, retryCount + 1);
        }

        throw connectionError;
      }

      // Re-throw WhisperError as-is
      if (error instanceof WhisperError) {
        // Retry if error is retryable
        if (error.isRetryable && retryCount < this._maxRetries) {
          this._logger.warn(`Retryable error, retrying (${retryCount + 1}/${this._maxRetries})...`);
          await this._delay(1000 * (retryCount + 1));
          return this._requestWithRetry(endpoint, options, retryCount + 1);
        }

        throw error;
      }

      // Wrap unknown errors
      throw new WhisperError(
        error.message || 'Unknown error during Whisper backend request',
        WhisperErrorType.SERVER_ERROR,
        null,
        { originalError: error }
      );
    }
  }

  /**
   * Parse error response from the server
   *
   * @param {Response} response - Fetch response object
   * @returns {Promise<object>} Parsed error data
   * @private
   */
  async _parseErrorResponse(response) {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        const text = await response.text();
        return { message: text || response.statusText };
      }
    } catch (parseError) {
      this._logger.debug('Could not parse error response body:', parseError.message);
      return { message: response.statusText };
    }
  }

  /**
   * Get error type from HTTP status code
   *
   * @param {number} status - HTTP status code
   * @returns {string} Error type from WhisperErrorType
   * @private
   */
  _getErrorType(status) {
    if (status >= 400 && status < 500) {
      if (status === 415) {
        return WhisperErrorType.UNSUPPORTED_FORMAT_ERROR;
      }
      return WhisperErrorType.INVALID_REQUEST_ERROR;
    }
    if (status >= 500) {
      return WhisperErrorType.SERVER_ERROR;
    }
    return WhisperErrorType.SERVER_ERROR;
  }

  /**
   * Delay helper for retry backoff
   *
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   * @private
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get server information (if supported by backend)
   *
   * @returns {Promise<object | null>} Server info or null if not supported
   */
  async getServerInfo() {
    this._logger.debug('getServerInfo called');
    const t0 = Date.now();
    try {
      const response = await this._requestWithRetry('/info', {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });

      this._logger.debug(`getServerInfo completed in ${Date.now() - t0}ms`);
      return response;
    } catch (error) {
      // Info endpoint may not exist on all backends
      this._logger.debug(`Server info not available after ${Date.now() - t0}ms:`, error.message);
      return null;
    }
  }
}

/**
 * @typedef {object} WhisperTranscriptionResult
 * @property {string} text - Full transcription text
 * @property {Array<object>} [segments] - Transcription segments with timestamps
 * @property {string} [language] - Detected language
 */

// Export classes and enums
export {
  WhisperBackend,
  WhisperError,
  WhisperErrorType,
  DEFAULT_WHISPER_URL,
  DEFAULT_TIMEOUT_MS,
  HEALTH_CHECK_TIMEOUT_MS
};
