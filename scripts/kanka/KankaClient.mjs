/**
 * KankaClient - Base API Client for Kanka.io Services
 *
 * Provides authentication, rate limiting, retry logic, and common request
 * functionality for interacting with the Kanka API. Used as a base for
 * KankaService which handles entity CRUD operations.
 *
 * Rate Limits:
 * - Free tier: 30 requests per minute
 * - Premium tier: 90 requests per minute
 *
 * @class KankaClient
 * @module vox-chronicle
 * @see https://api.kanka.io/docs/
 */

import { Logger } from '../utils/Logger.mjs';
import { RateLimiter } from '../utils/RateLimiter.mjs';
import { SensitiveDataFilter } from '../utils/SensitiveDataFilter.mjs';

/**
 * Kanka API error types enumeration
 * @enum {string}
 */
const KankaErrorType = {
  AUTHENTICATION_ERROR: 'authentication_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  NOT_FOUND_ERROR: 'not_found_error',
  VALIDATION_ERROR: 'validation_error',
  PERMISSION_ERROR: 'permission_error',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error'
};

/**
 * Kanka API base URL
 * @constant {string}
 */
const KANKA_BASE_URL = 'https://api.kanka.io/1.0';

/**
 * Default request timeout in milliseconds (30 seconds)
 * @constant {number}
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum retries for failed requests
 * @constant {number}
 */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Initial backoff delay for retries in milliseconds
 * @constant {number}
 */
const INITIAL_BACKOFF_MS = 2000;

/**
 * Custom error class for Kanka API errors
 *
 * @augments Error
 */
class KankaError extends Error {
  /**
   * Create a Kanka error
   *
   * @param {string} message - Error message
   * @param {string} type - Error type from KankaErrorType
   * @param {number} [status] - HTTP status code
   * @param {object} [details] - Additional error details
   */
  constructor(message, type, status = null, details = null) {
    super(message);
    this.name = 'KankaError';
    this.type = type;
    this.status = status;
    this.details = details;
    this.retryAfter = null;

    // Extract retry-after information if available (Kanka uses seconds)
    if (details?.headers?.['retry-after']) {
      this.retryAfter = parseInt(details.headers['retry-after'], 10) * 1000;
    }

    // Kanka-specific: Extract remaining rate limit info if available
    this.rateLimitRemaining = details?.headers?.['x-ratelimit-remaining'];
    this.rateLimitReset = details?.headers?.['x-ratelimit-reset'];
  }

  /**
   * Check if this is a retryable error
   *
   * @returns {boolean} True if the error can be retried
   */
  get isRetryable() {
    return (
      this.type === KankaErrorType.RATE_LIMIT_ERROR ||
      this.type === KankaErrorType.NETWORK_ERROR ||
      this.type === KankaErrorType.TIMEOUT_ERROR ||
      (this.status >= 500 && this.status < 600)
    );
  }
}

/**
 * KankaClient base class for Kanka API interactions
 *
 * Provides authentication, rate limiting, and common request functionality.
 * The rate limiting implementation follows Kanka's limits:
 * - 30 requests/minute for free tier
 * - 90 requests/minute for premium tier
 *
 * @example
 * const client = new KankaClient('your-api-token', { isPremium: false });
 * const campaigns = await client.request('/campaigns');
 */
class KankaClient {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('KankaClient');

  /**
   * Kanka API token
   * @type {string}
   * @private
   */
  _apiToken = '';

  /**
   * API base URL
   * @type {string}
   * @private
   */
  _baseUrl = KANKA_BASE_URL;

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
   * Maximum retries for failed requests
   * @type {number}
   * @private
   */
  _maxRetries = DEFAULT_MAX_RETRIES;

  /**
   * Whether user has premium Kanka subscription
   * @type {boolean}
   * @private
   */
  _isPremium = false;

  /**
   * Create a new KankaClient instance
   *
   * @param {string} apiToken - Kanka API token (from https://app.kanka.io/settings/api)
   * @param {object} [options] - Configuration options
   * @param {string} [options.baseUrl] - Custom API base URL
   * @param {number} [options.timeout=30000] - Request timeout in milliseconds
   * @param {number} [options.maxRetries=3] - Maximum retry attempts for failed requests
   * @param {boolean} [options.isPremium=false] - Whether user has premium subscription (affects rate limits)
   */
  constructor(apiToken, options = {}) {
    this._apiToken = apiToken || '';
    this._baseUrl = options.baseUrl || KANKA_BASE_URL;
    this._timeout = options.timeout || DEFAULT_TIMEOUT_MS;
    this._maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this._isPremium = options.isPremium ?? false;

    // Initialize rate limiter based on subscription tier
    const preset = this._isPremium ? 'KANKA_PREMIUM' : 'KANKA_FREE';
    this._rateLimiter = RateLimiter.fromPreset(preset, {
      name: `Kanka (${this._isPremium ? 'Premium' : 'Free'})`,
      maxRetries: this._maxRetries,
      initialBackoffMs: INITIAL_BACKOFF_MS
    });

    this._logger.debug(`KankaClient instance created (${preset})`);
  }

  /**
   * Check if the client is properly configured with an API token
   *
   * @returns {boolean} True if API token is set
   */
  get isConfigured() {
    return Boolean(this._apiToken && this._apiToken.length > 0);
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
   * Check if client is configured for premium rate limits
   *
   * @returns {boolean} True if premium
   */
  get isPremium() {
    return this._isPremium;
  }

  /**
   * Update the API token
   *
   * @param {string} apiToken - New API token
   */
  setApiToken(apiToken) {
    this._apiToken = apiToken || '';
    this._logger.debug('API token updated');
  }

  /**
   * Set premium status and update rate limiter accordingly
   *
   * @param {boolean} isPremium - Whether user has premium subscription
   */
  setPremiumStatus(isPremium) {
    if (this._isPremium !== isPremium) {
      this._isPremium = isPremium;

      // Re-create rate limiter with new limits
      const preset = isPremium ? 'KANKA_PREMIUM' : 'KANKA_FREE';
      this._rateLimiter = RateLimiter.fromPreset(preset, {
        name: `Kanka (${isPremium ? 'Premium' : 'Free'})`,
        maxRetries: this._maxRetries,
        initialBackoffMs: INITIAL_BACKOFF_MS
      });

      this._logger.info(`Premium status updated: ${isPremium ? 'Premium' : 'Free'} tier`);
    }
  }

  /**
   * Build authorization headers for API requests
   *
   * @returns {object} Headers object with Bearer token
   * @private
   */
  _buildAuthHeaders() {
    if (!this._apiToken) {
      throw new KankaError(
        'Kanka API token not configured. Please add your API token in module settings.',
        KankaErrorType.AUTHENTICATION_ERROR
      );
    }

    return {
      Authorization: `Bearer ${this._apiToken}`
    };
  }

  /**
   * Build common headers for JSON API requests
   *
   * @returns {object} Headers object
   * @private
   */
  _buildJsonHeaders() {
    return {
      ...this._buildAuthHeaders(),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  /**
   * Build the full URL for an API endpoint
   *
   * @param {string} endpoint - API endpoint path (e.g., '/campaigns')
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
   * Extract rate limit headers from response
   *
   * @param {Response} response - Fetch response object
   * @returns {object} Rate limit information
   * @private
   */
  _extractRateLimitHeaders(response) {
    const headers = {};

    // Kanka rate limit headers
    if (response.headers.has('x-ratelimit-limit')) {
      headers['x-ratelimit-limit'] = response.headers.get('x-ratelimit-limit');
    }
    if (response.headers.has('x-ratelimit-remaining')) {
      headers['x-ratelimit-remaining'] = response.headers.get('x-ratelimit-remaining');
    }
    if (response.headers.has('x-ratelimit-reset')) {
      headers['x-ratelimit-reset'] = response.headers.get('x-ratelimit-reset');
    }
    if (response.headers.has('retry-after')) {
      headers['retry-after'] = response.headers.get('retry-after');
    }

    return headers;
  }

  /**
   * Parse error response from Kanka API
   *
   * @param {Response} response - Fetch response object
   * @returns {Promise<KankaError>} Parsed error
   * @private
   */
  async _parseErrorResponse(response) {
    let errorData = null;
    let errorMessage = `Kanka API request failed with status ${response.status}`;
    let errorType = KankaErrorType.API_ERROR;

    // Extract rate limit headers
    const headers = this._extractRateLimitHeaders(response);

    // Try to parse JSON error response
    try {
      const text = await response.text();
      if (text) {
        errorData = JSON.parse(text);
        // Kanka returns errors in { message: '...', errors: {...} } format
        if (errorData.message) {
          errorMessage = errorData.message;
        }
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      }
    } catch (parseError) {
      this._logger.debug('Could not parse Kanka error response as JSON:', parseError.message);
    }

    // Map HTTP status codes to error types
    switch (response.status) {
      case 401:
        errorType = KankaErrorType.AUTHENTICATION_ERROR;
        errorMessage = 'Invalid API token. Please check your Kanka API token in settings.';
        break;
      case 403:
        errorType = KankaErrorType.PERMISSION_ERROR;
        errorMessage = errorMessage || 'You do not have permission to access this resource.';
        break;
      case 404:
        errorType = KankaErrorType.NOT_FOUND_ERROR;
        errorMessage = errorMessage || 'The requested resource was not found.';
        break;
      case 422:
        errorType = KankaErrorType.VALIDATION_ERROR;
        // Include validation errors in details
        break;
      case 429:
        errorType = KankaErrorType.RATE_LIMIT_ERROR;
        errorMessage = 'Rate limit exceeded. Please wait before making more requests.';
        break;
      case 500:
      case 502:
      case 503:
        errorType = KankaErrorType.API_ERROR;
        errorMessage = 'Kanka service temporarily unavailable. Please try again later.';
        break;
    }

    return new KankaError(errorMessage, errorType, response.status, {
      response: errorData,
      headers,
      validationErrors: errorData?.errors || null
    });
  }

  /**
   * Make a request to the Kanka API
   *
   * @param {string} endpoint - API endpoint (e.g., '/campaigns')
   * @param {object} [options] - Fetch options
   * @param {string} [options.method='GET'] - HTTP method
   * @param {object} [options.headers] - Additional headers
   * @param {string|FormData} [options.body] - Request body
   * @param {number} [options.timeout] - Custom timeout for this request
   * @returns {Promise<object>} Parsed JSON response
   * @throws {KankaError} If the request fails
   */
  async request(endpoint, options = {}) {
    if (!this.isConfigured) {
      throw new KankaError(
        'Kanka API token not configured. Please add your API token in module settings.',
        KankaErrorType.AUTHENTICATION_ERROR
      );
    }

    const url = this._buildUrl(endpoint);
    const method = options.method || 'GET';

    // Build headers - use JSON headers unless body is FormData
    const isFormData = options.body instanceof FormData;
    const baseHeaders = isFormData ? this._buildAuthHeaders() : this._buildJsonHeaders();

    const headers = {
      ...baseHeaders,
      ...options.headers
    };

    // Remove Content-Type for FormData (browser sets it with boundary)
    if (isFormData) {
      delete headers['Content-Type'];
    }

    // Build fetch options (without signal — AbortController is created per attempt)
    const fetchOptions = {
      method,
      headers
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    // Sanitize URL in debug logs to prevent exposing sensitive query parameters
    const sanitizedUrl = SensitiveDataFilter.sanitizeUrl(url);
    this._logger.debug(`Making ${method} request to ${sanitizedUrl}`);
    const requestStartTime = Date.now();

    // Execute request with rate limiting and retry logic
    return this._rateLimiter.executeWithRetry(async () => {
      // Create a fresh AbortController for each attempt so retries are not poisoned
      const controller = this._createTimeoutController(options.timeout);
      try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });

        // Clear timeout
        clearTimeout(controller.timeoutId);

        const elapsed = Date.now() - requestStartTime;

        // Handle error responses FIRST (before processing rate limit headers)
        if (!response.ok) {
          this._logger.debug(`Request ${method} ${sanitizedUrl} failed: status=${response.status}, elapsed=${elapsed}ms`);
          const error = await this._parseErrorResponse(response);

          // If rate limited (429), pause the rate limiter
          if (error.type === KankaErrorType.RATE_LIMIT_ERROR) {
            const pauseDuration = error.retryAfter || 60000;
            this._rateLimiter.pause(pauseDuration);
            this._logger.warn(`Rate limit hit (429), pausing for ${pauseDuration}ms`);
          }

          throw error;
        }

        // Only process rate limit headers on successful responses
        this._handleRateLimitHeaders(response);

        // Parse and return JSON response
        // Kanka wraps data in { data: ... } for most endpoints
        const data = await response.json();
        // Sanitize endpoint to prevent exposing sensitive query parameters
        const sanitizedEndpoint = SensitiveDataFilter.sanitizeString(endpoint);
        this._logger.debug(`Request to ${sanitizedEndpoint} completed: status=${response.status}, elapsed=${elapsed}ms`);
        return data;
      } catch (error) {
        // Clear timeout
        clearTimeout(controller.timeoutId);

        // Handle abort/timeout
        if (error.name === 'AbortError') {
          // Sanitize endpoint to prevent exposing sensitive query parameters
          const sanitizedEndpoint = SensitiveDataFilter.sanitizeString(endpoint);
          throw new KankaError(
            `Request to ${sanitizedEndpoint} timed out after ${this._timeout}ms`,
            KankaErrorType.TIMEOUT_ERROR
          );
        }

        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          // Sanitize error message to prevent exposing sensitive data
          const sanitizedError = SensitiveDataFilter.sanitizeString(error.message);
          throw new KankaError(
            'Network error. Please check your internet connection.',
            KankaErrorType.NETWORK_ERROR,
            null,
            { originalError: sanitizedError }
          );
        }

        // Re-throw Kanka errors as-is
        if (error instanceof KankaError) {
          throw error;
        }

        // Wrap unknown errors
        // Sanitize error message and details to prevent exposing sensitive data
        const sanitizedMessage = SensitiveDataFilter.sanitizeString(
          error.message || 'Unknown error occurred'
        );
        const sanitizedError = SensitiveDataFilter.sanitizeObject(error);
        throw new KankaError(sanitizedMessage, KankaErrorType.API_ERROR, null, {
          originalError: sanitizedError
        });
      }
    });
  }

  /**
   * Handle rate limit headers from response
   *
   * @param {Response} response - Fetch response
   * @private
   */
  _handleRateLimitHeaders(response) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const limit = response.headers.get('x-ratelimit-limit');
    if (remaining !== null) {
      const remainingNum = parseInt(remaining, 10);
      this._logger.debug(`Rate limit: ${remaining}/${limit || '?'} remaining`);

      // Log warning if running low on requests
      if (remainingNum <= 5) {
        this._logger.warn(`Rate limit warning: only ${remainingNum} requests remaining`);
      }

      // If completely exhausted, pause until reset
      if (remainingNum === 0) {
        const resetTimestamp = response.headers.get('x-ratelimit-reset');
        if (resetTimestamp) {
          const resetTime = parseInt(resetTimestamp, 10) * 1000;
          const waitTime = Math.max(0, resetTime - Date.now());
          if (waitTime > 0) {
            this._rateLimiter.pause(waitTime);
            this._logger.warn(`Rate limit exhausted, pausing for ${waitTime}ms`);
          }
        }
      }
    }
  }

  /**
   * Make a GET request
   *
   * @param {string} endpoint - API endpoint
   * @param {object} [options] - Additional fetch options
   * @returns {Promise<object>} Parsed JSON response
   */
  async get(endpoint, options = {}) {
    this._logger.debug(`GET ${endpoint}`);
    return this.request(endpoint, {
      ...options,
      method: 'GET'
    });
  }

  /**
   * Make a POST request with JSON body
   *
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request payload
   * @param {object} [options] - Additional fetch options
   * @returns {Promise<object>} Parsed JSON response
   */
  async post(endpoint, data, options = {}) {
    this._logger.debug(`POST ${endpoint}`);
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make a PUT request with JSON body
   *
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request payload
   * @param {object} [options] - Additional fetch options
   * @returns {Promise<object>} Parsed JSON response
   */
  async put(endpoint, data, options = {}) {
    this._logger.debug(`PUT ${endpoint}`);
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make a PATCH request with JSON body
   *
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request payload
   * @param {object} [options] - Additional fetch options
   * @returns {Promise<object>} Parsed JSON response
   */
  async patch(endpoint, data, options = {}) {
    this._logger.debug(`PATCH ${endpoint}`);
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make a DELETE request
   *
   * @param {string} endpoint - API endpoint
   * @param {object} [options] - Additional fetch options
   * @returns {Promise<object>} Parsed JSON response
   */
  async delete(endpoint, options = {}) {
    this._logger.debug(`DELETE ${endpoint}`);
    return this.request(endpoint, {
      ...options,
      method: 'DELETE'
    });
  }

  /**
   * Make a POST request with FormData body (for file uploads)
   *
   * @param {string} endpoint - API endpoint
   * @param {FormData} formData - Form data with files
   * @param {object} [options] - Additional fetch options
   * @returns {Promise<object>} Parsed JSON response
   */
  async postFormData(endpoint, formData, options = {}) {
    this._logger.debug(`POST (FormData) ${endpoint}`);
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: formData
    });
  }

  /**
   * Fetch all campaigns accessible by the authenticated user
   *
   * @returns {Promise<Array<object>>} Array of campaign objects
   * @throws {KankaError} If the request fails
   * @example
   * const campaigns = await client.getCampaigns();
   * // Returns: [{ id: 1, name: 'My Campaign', ... }, ...]
   */
  async getCampaigns() {
    this._logger.debug('Fetching campaigns from Kanka API');

    try {
      const response = await this.get('/campaigns');
      const campaigns = response.data || [];
      this._logger.debug(`Retrieved ${campaigns.length} campaign(s)`);
      return campaigns;
    } catch (error) {
      this._logger.error('Failed to fetch campaigns:', error.message);
      throw error;
    }
  }

  /**
   * Validate API token by making a simple API call
   *
   * @returns {Promise<boolean>} True if API token is valid
   */
  async validateApiToken() {
    this._logger.debug('Validating API token');
    if (!this._apiToken) {
      this._logger.debug('No API token set, returning false');
      return false;
    }

    try {
      // Make a minimal request to campaigns endpoint to validate token
      await this.request('/campaigns', { method: 'GET' });
      this._logger.log('API token validated successfully');
      return true;
    } catch (error) {
      if (error.type === KankaErrorType.AUTHENTICATION_ERROR) {
        this._logger.warn('API token validation failed: Invalid token');
        return false;
      }
      // Non-auth errors mean we cannot verify — don't assume valid
      const sanitizedMessage = SensitiveDataFilter.sanitizeString(error.message);
      this._logger.error('API token validation could not be completed:', sanitizedMessage);
      throw error;
    }
  }

  /**
   * Get rate limiter statistics
   *
   * @returns {object} Rate limiter stats
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

  /**
   * Get remaining requests in current rate limit window
   *
   * @returns {number} Remaining requests
   */
  get remainingRequests() {
    return this._rateLimiter.remainingRequests;
  }

  /**
   * Check if rate limiter is currently paused
   *
   * @returns {boolean} True if paused
   */
  get isRateLimited() {
    return this._rateLimiter.isPaused;
  }
}

// Export the KankaClient class and related exports
export { KankaClient, KankaError, KankaErrorType, KANKA_BASE_URL };
