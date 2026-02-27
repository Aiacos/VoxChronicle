/**
 * BaseAPIClient - Abstract base class for API clients
 *
 * Extracts shared functionality from OpenAIClient and KankaClient:
 * - Base URL management
 * - Authorization header building (with configurable error class/message)
 * - JSON header building
 * - URL building with endpoint normalization
 * - Timeout controller creation via AbortController
 * - Rate limiter delegation (stats + reset)
 *
 * Subclasses must provide their own request(), error parsing, and
 * domain-specific logic.
 *
 * @class BaseAPIClient
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * BaseAPIClient abstract base class for API interactions
 *
 * @example
 * class MyClient extends BaseAPIClient {
 *   constructor(apiKey, options = {}) {
 *     super({
 *       apiKey,
 *       baseUrl: options.baseUrl || 'https://api.example.com/v1',
 *       timeout: options.timeout || 30000,
 *       loggerName: 'MyClient',
 *       authErrorMessage: 'My API key not configured.',
 *       AuthErrorClass: MyError,
 *       authErrorType: 'authentication_error',
 *       rateLimiter: myRateLimiter,
 *     });
 *   }
 * }
 */
class BaseAPIClient {
  /**
   * Create a new BaseAPIClient instance
   *
   * @param {object} options - Configuration options
   * @param {string} [options.apiKey=''] - API key or token for authentication
   * @param {string} [options.baseUrl=''] - API base URL
   * @param {number} [options.timeout=30000] - Default request timeout in milliseconds
   * @param {string} [options.loggerName='BaseAPIClient'] - Name for the logger child
   * @param {boolean} [options.sanitizeLogger=true] - Whether to enable log sanitization
   * @param {string} [options.authErrorMessage='API key not configured'] - Error message for missing auth
   * @param {Function} [options.AuthErrorClass=Error] - Error class to throw for auth failures
   * @param {string} [options.authErrorType='authentication_error'] - Error type string for auth failures
   * @param {object|null} [options.rateLimiter=null] - Rate limiter instance
   */
  constructor(options = {}) {
    this._apiKey = options.apiKey || '';
    this._baseUrl = options.baseUrl || '';
    this._timeout = options.timeout || 30000;
    this._logger = Logger.createChild(options.loggerName || 'BaseAPIClient', {
      sanitize: options.sanitizeLogger !== false
    });
    this._authErrorMessage = options.authErrorMessage || 'API key not configured';
    this._AuthErrorClass = options.AuthErrorClass || Error;
    this._authErrorType = options.authErrorType || 'authentication_error';
    this._rateLimiter = options.rateLimiter || null;
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
   * Build authorization headers for API requests
   *
   * Throws the configured AuthErrorClass if no API key is set.
   *
   * @returns {object} Headers object with Bearer token
   * @throws {Error} If API key is not configured (uses configured AuthErrorClass)
   * @private
   */
  _buildAuthHeaders() {
    if (!this._apiKey) {
      throw new this._AuthErrorClass(
        this._authErrorMessage,
        this._authErrorType
      );
    }

    return {
      Authorization: `Bearer ${this._apiKey}`
    };
  }

  /**
   * Build common headers for JSON API requests
   *
   * Includes authorization, Content-Type, and Accept headers.
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
   * Normalizes the endpoint to ensure it starts with a forward slash,
   * then concatenates it with the base URL.
   *
   * @param {string} endpoint - API endpoint path (e.g., '/chat/completions')
   * @returns {string} Full URL
   * @private
   */
  _buildUrl(endpoint) {
    const base = this._baseUrl.replace(/\/+$/, '');
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${normalizedEndpoint}`;
  }

  /**
   * Create an AbortController with timeout
   *
   * The returned controller has a `timeoutId` property that should be
   * cleared with `clearTimeout(controller.timeoutId)` when the request
   * completes (success or error) to prevent timer leaks.
   *
   * @param {number} [timeout] - Timeout in milliseconds (defaults to this._timeout)
   * @returns {AbortController} AbortController with timeout signal and timeoutId property
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
   * Get rate limiter statistics
   *
   * @returns {object} Rate limiter stats
   */
  getRateLimiterStats() {
    if (!this._rateLimiter) {
      return { requests: 0, remaining: 0, resetAt: null };
    }
    return this._rateLimiter.getStats();
  }

  /**
   * Reset the rate limiter state
   */
  resetRateLimiter() {
    if (!this._rateLimiter) {
      return;
    }
    this._rateLimiter.reset();
    this._logger.debug('Rate limiter reset');
  }
}

export { BaseAPIClient };
