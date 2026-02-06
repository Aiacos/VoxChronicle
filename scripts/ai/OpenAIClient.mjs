/**
 * OpenAIClient - Base API Client for OpenAI Services
 *
 * Provides authentication, error handling, and common request functionality
 * for interacting with OpenAI's REST API. Used as a base for TranscriptionService
 * and ImageGenerationService.
 *
 * @class OpenAIClient
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { RateLimiter } from '../utils/RateLimiter.mjs';

/**
 * OpenAI API error types enumeration
 * @enum {string}
 */
const OpenAIErrorType = {
  AUTHENTICATION_ERROR: 'authentication_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  INVALID_REQUEST_ERROR: 'invalid_request_error',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error'
};

/**
 * OpenAI API base URL
 * @constant {string}
 */
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Default request timeout in milliseconds (2 minutes)
 * @constant {number}
 */
const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Custom error class for OpenAI API errors
 *
 * @extends Error
 */
class OpenAIError extends Error {
  /**
   * Create an OpenAI error
   *
   * @param {string} message - Error message
   * @param {string} type - Error type from OpenAIErrorType
   * @param {number} [status] - HTTP status code
   * @param {Object} [details] - Additional error details
   */
  constructor(message, type, status = null, details = null) {
    super(message);
    this.name = 'OpenAIError';
    this.type = type;
    this.status = status;
    this.details = details;
    this.retryAfter = null;

    // Extract retry-after information if available
    if (details?.headers?.['retry-after']) {
      this.retryAfter = parseInt(details.headers['retry-after'], 10) * 1000;
    }
  }

  /**
   * Check if this is a retryable error
   *
   * @returns {boolean} True if the error can be retried
   */
  get isRetryable() {
    return this.type === OpenAIErrorType.RATE_LIMIT_ERROR ||
           this.type === OpenAIErrorType.NETWORK_ERROR ||
           this.type === OpenAIErrorType.TIMEOUT_ERROR ||
           (this.status >= 500 && this.status < 600);
  }
}

/**
 * OpenAIClient base class for OpenAI API interactions
 *
 * @example
 * const client = new OpenAIClient('your-api-key');
 * const response = await client.request('/chat/completions', {
 *   method: 'POST',
 *   body: JSON.stringify({ ... })
 * });
 */
class OpenAIClient {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('OpenAIClient');

  /**
   * OpenAI API key
   * @type {string}
   * @private
   */
  _apiKey = '';

  /**
   * API base URL
   * @type {string}
   * @private
   */
  _baseUrl = OPENAI_BASE_URL;

  /**
   * Rate limiter for API requests
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
   * Create a new OpenAIClient instance
   *
   * @param {string} apiKey - OpenAI API key
   * @param {Object} [options] - Configuration options
   * @param {string} [options.baseUrl] - Custom API base URL
   * @param {number} [options.timeout=120000] - Request timeout in milliseconds
   * @param {number} [options.maxRetries=3] - Maximum retry attempts for failed requests
   */
  constructor(apiKey, options = {}) {
    this._apiKey = apiKey || '';
    this._baseUrl = options.baseUrl || OPENAI_BASE_URL;
    this._timeout = options.timeout || DEFAULT_TIMEOUT_MS;
    this._maxRetries = options.maxRetries ?? 3;

    // Initialize rate limiter with OpenAI preset
    this._rateLimiter = RateLimiter.fromPreset('OPENAI', {
      name: 'OpenAI',
      maxRetries: this._maxRetries
    });

    this._logger.debug('OpenAIClient instance created');
  }

  /**
   * Check if the client is properly configured with an API key
   *
   * @returns {boolean} True if API key is set
   */
  get isConfigured() {
    return Boolean(this._apiKey && this._apiKey.length > 0);
  }

  /**
   * Get the API base URL
   *
   * @returns {string} The base URL
   */
  get baseUrl() {
    return this._baseUrl;
  }

  /**
   * Update the API key
   *
   * @param {string} apiKey - New API key
   */
  setApiKey(apiKey) {
    this._apiKey = apiKey || '';
    this._logger.debug('API key updated');
  }

  /**
   * Build authorization headers for API requests
   *
   * @returns {Object} Headers object with Bearer token
   * @private
   */
  _buildAuthHeaders() {
    if (!this._apiKey) {
      throw new OpenAIError(
        'OpenAI API key not configured. Please add your API key in module settings.',
        OpenAIErrorType.AUTHENTICATION_ERROR
      );
    }

    return {
      'Authorization': `Bearer ${this._apiKey}`
    };
  }

  /**
   * Build common headers for JSON API requests
   *
   * @returns {Object} Headers object
   * @private
   */
  _buildJsonHeaders() {
    return {
      ...this._buildAuthHeaders(),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Build the full URL for an API endpoint
   *
   * @param {string} endpoint - API endpoint path (e.g., '/chat/completions')
   * @returns {string} Full URL
   * @private
   */
  _buildUrl(endpoint) {
    // Ensure endpoint starts with /
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this._baseUrl}${normalizedEndpoint}`;
  }

  /**
   * Create an AbortController with timeout
   *
   * @param {number} [timeout] - Timeout in milliseconds
   * @returns {AbortController} AbortController with timeout signal
   * @private
   */
  _createTimeoutController(timeout) {
    const controller = new AbortController();
    const timeoutMs = timeout || this._timeout;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Store timeout ID for cleanup
    controller.timeoutId = timeoutId;

    return controller;
  }

  /**
   * Parse error response from OpenAI API
   *
   * @param {Response} response - Fetch response object
   * @returns {Promise<OpenAIError>} Parsed error
   * @private
   */
  async _parseErrorResponse(response) {
    let errorData = null;
    let errorMessage = `OpenAI API request failed with status ${response.status}`;
    let errorType = OpenAIErrorType.API_ERROR;

    // Try to parse JSON error response
    try {
      const text = await response.text();
      if (text) {
        errorData = JSON.parse(text);
        if (errorData.error) {
          errorMessage = errorData.error.message || errorMessage;
          if (errorData.error.type) {
            errorType = errorData.error.type;
          }
        }
      }
    } catch (parseError) {
      this._logger.debug('Could not parse error response as JSON');
    }

    // Map HTTP status codes to error types
    switch (response.status) {
      case 401:
        errorType = OpenAIErrorType.AUTHENTICATION_ERROR;
        errorMessage = 'Invalid API key. Please check your OpenAI API key in settings.';
        break;
      case 429:
        errorType = OpenAIErrorType.RATE_LIMIT_ERROR;
        errorMessage = errorMessage || 'Rate limit exceeded. Please try again later.';
        break;
      case 400:
        errorType = OpenAIErrorType.INVALID_REQUEST_ERROR;
        break;
      case 500:
      case 502:
      case 503:
        errorType = OpenAIErrorType.API_ERROR;
        errorMessage = 'OpenAI service temporarily unavailable. Please try again later.';
        break;
    }

    // Extract headers for retry-after
    const headers = {};
    if (response.headers.has('retry-after')) {
      headers['retry-after'] = response.headers.get('retry-after');
    }

    return new OpenAIError(errorMessage, errorType, response.status, {
      response: errorData,
      headers
    });
  }

  /**
   * Make a request to the OpenAI API
   *
   * @param {string} endpoint - API endpoint (e.g., '/chat/completions')
   * @param {Object} [options] - Fetch options
   * @param {string} [options.method='GET'] - HTTP method
   * @param {Object} [options.headers] - Additional headers
   * @param {string|FormData} [options.body] - Request body
   * @param {number} [options.timeout] - Custom timeout for this request
   * @returns {Promise<Object>} Parsed JSON response
   * @throws {OpenAIError} If the request fails
   */
  async request(endpoint, options = {}) {
    if (!this.isConfigured) {
      throw new OpenAIError(
        'OpenAI API key not configured. Please add your API key in module settings.',
        OpenAIErrorType.AUTHENTICATION_ERROR
      );
    }

    const url = this._buildUrl(endpoint);
    const method = options.method || 'GET';

    // Build headers - use JSON headers unless body is FormData
    const isFormData = options.body instanceof FormData;
    const baseHeaders = isFormData
      ? this._buildAuthHeaders()
      : this._buildJsonHeaders();

    const headers = {
      ...baseHeaders,
      ...options.headers
    };

    // Remove Content-Type for FormData (browser sets it with boundary)
    if (isFormData) {
      delete headers['Content-Type'];
    }

    // Create timeout controller
    const controller = this._createTimeoutController(options.timeout);

    // Build fetch options
    const fetchOptions = {
      method,
      headers,
      signal: controller.signal
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    this._logger.debug(`Making ${method} request to ${endpoint}`);

    // Execute request with rate limiting
    return this._rateLimiter.executeWithRetry(async () => {
      try {
        const response = await fetch(url, fetchOptions);

        // Clear timeout
        clearTimeout(controller.timeoutId);

        // Handle error responses
        if (!response.ok) {
          const error = await this._parseErrorResponse(response);

          // If rate limited, pause the rate limiter
          if (error.type === OpenAIErrorType.RATE_LIMIT_ERROR) {
            const pauseDuration = error.retryAfter || 60000;
            this._rateLimiter.pause(pauseDuration);
          }

          throw error;
        }

        // Parse and return JSON response
        const data = await response.json();
        this._logger.debug(`Request to ${endpoint} completed successfully`);
        return data;

      } catch (error) {
        // Clear timeout
        clearTimeout(controller.timeoutId);

        // Handle abort/timeout
        if (error.name === 'AbortError') {
          throw new OpenAIError(
            `Request to ${endpoint} timed out after ${this._timeout}ms`,
            OpenAIErrorType.TIMEOUT_ERROR
          );
        }

        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new OpenAIError(
            'Network error. Please check your internet connection.',
            OpenAIErrorType.NETWORK_ERROR,
            null,
            { originalError: error.message }
          );
        }

        // Re-throw OpenAI errors as-is
        if (error instanceof OpenAIError) {
          throw error;
        }

        // Wrap unknown errors
        throw new OpenAIError(
          error.message || 'Unknown error occurred',
          OpenAIErrorType.API_ERROR,
          null,
          { originalError: error }
        );
      }
    });
  }

  /**
   * Make a POST request with JSON body
   *
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request payload
   * @param {Object} [options] - Additional fetch options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make a POST request with FormData body (for file uploads)
   *
   * @param {string} endpoint - API endpoint
   * @param {FormData} formData - Form data with files
   * @param {Object} [options] - Additional fetch options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async postFormData(endpoint, formData, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: formData
    });
  }

  /**
   * Validate API key by making a simple API call
   *
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    if (!this._apiKey) {
      return false;
    }

    try {
      // Make a minimal request to models endpoint to validate key
      await this.request('/models', { method: 'GET' });
      this._logger.log('API key validated successfully');
      return true;
    } catch (error) {
      if (error.type === OpenAIErrorType.AUTHENTICATION_ERROR) {
        this._logger.warn('API key validation failed: Invalid key');
        return false;
      }
      // Other errors might be temporary, log but don't invalidate
      this._logger.warn('API key validation check failed:', error.message);
      return true; // Assume valid if error is not auth-related
    }
  }

  /**
   * Get rate limiter statistics
   *
   * @returns {Object} Rate limiter stats
   */
  getRateLimiterStats() {
    return this._rateLimiter.getStats();
  }

  /**
   * Reset the rate limiter state
   */
  resetRateLimiter() {
    this._rateLimiter.reset();
    this._logger.debug('Rate limiter reset');
  }
}

// Export the OpenAIClient class and related exports
export { OpenAIClient, OpenAIError, OpenAIErrorType, OPENAI_BASE_URL };
