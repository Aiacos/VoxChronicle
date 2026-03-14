/**
 * OpenAIClient - API Client for OpenAI Services
 *
 * Extends BaseAPIClient with OpenAI-specific functionality:
 * retry with exponential backoff, sequential request queue,
 * operation history, and error handling for OpenAI's REST API.
 * Used internally by OpenAI provider classes (OpenAIChatProvider,
 * OpenAITranscriptionProvider, etc.) as HTTP transport layer.
 *
 * Retry/queue system adapted from Narrator Master's OpenAIServiceBase.
 *
 * @class OpenAIClient
 * @augments BaseAPIClient
 * @module vox-chronicle
 */

import { BaseAPIClient } from '../api/BaseAPIClient.mjs';
import { RateLimiter } from '../utils/RateLimiter.mjs';
import { SensitiveDataFilter } from '../utils/SensitiveDataFilter.mjs';

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
 * @augments Error
 */
class OpenAIError extends Error {
  /**
   * Create an OpenAI error
   *
   * @param {string} message - Error message
   * @param {string} type - Error type from OpenAIErrorType
   * @param {number} [status] - HTTP status code
   * @param {object} [details] - Additional error details
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
    return (
      this.type === OpenAIErrorType.RATE_LIMIT_ERROR ||
      this.type === OpenAIErrorType.NETWORK_ERROR ||
      this.type === OpenAIErrorType.TIMEOUT_ERROR ||
      (this.status !== null && this.status >= 500 && this.status < 600)
    );
  }
}

/**
 * OpenAIClient base class for OpenAI API interactions
 *
 * Features:
 * - Rate limiting via sliding window (RateLimiter)
 * - Retry with exponential backoff and jitter (from NM)
 * - Sequential request queue with priority support (from NM)
 * - Operation history tracking (from NM)
 * - Fetch with timeout via AbortController
 *
 * @example
 * const client = new OpenAIClient('your-api-key');
 * const response = await client.request('/chat/completions', {
 *   method: 'POST',
 *   body: JSON.stringify({ ... })
 * });
 */
class OpenAIClient extends BaseAPIClient {
  /**
   * Create a new OpenAIClient instance
   *
   * @param {string} apiKey - OpenAI API key
   * @param {object} [options] - Configuration options
   * @param {string} [options.baseUrl] - Custom API base URL
   * @param {number} [options.timeout=120000] - Request timeout in milliseconds
   * @param {number} [options.maxRetries=3] - Maximum retry attempts for failed requests (RateLimiter)
   * @param {boolean} [options.retryEnabled=true] - Enable automatic retry with exponential backoff
   * @param {number} [options.retryMaxAttempts=3] - Maximum retry attempts for backoff retries
   * @param {number} [options.retryBaseDelay=1000] - Base delay in ms for exponential backoff
   * @param {number} [options.retryMaxDelay=60000] - Maximum delay in ms between retries
   * @param {number} [options.maxQueueSize=100] - Maximum number of requests that can be queued
   * @param {number} [options.maxHistorySize=50] - Maximum operation history entries to keep
   */
  constructor(apiKey, options = {}) {
    const maxRetries = options.maxRetries ?? 3;

    // Initialize rate limiter with OpenAI preset
    const rateLimiter = RateLimiter.fromPreset('OPENAI', {
      name: 'OpenAI',
      maxRetries
    });

    super({
      apiKey,
      baseUrl: options.baseUrl || OPENAI_BASE_URL,
      timeout: options.timeout || DEFAULT_TIMEOUT_MS,
      loggerName: 'OpenAIClient',
      sanitizeLogger: true,
      authErrorMessage:
        'OpenAI API key not configured. Please add your API key in module settings.',
      AuthErrorClass: OpenAIError,
      authErrorType: OpenAIErrorType.AUTHENTICATION_ERROR,
      rateLimiter
    });

    this._maxRetries = maxRetries;

    // Retry configuration (from NM OpenAIServiceBase)
    this._retryConfig = {
      enabled: options.retryEnabled ?? true,
      maxAttempts: options.retryMaxAttempts ?? 3,
      baseDelay: options.retryBaseDelay ?? 1000,
      maxDelay: options.retryMaxDelay ?? 60000
    };

    // Per-category request queues (Story 2.3: parallel across categories, sequential within)
    /** @type {Map<string, { queue: Array, processing: boolean }>} */
    this._categoryQueues = new Map();
    this._maxQueueSize = options.maxQueueSize ?? 100;

    // Operation history (from NM OpenAIServiceBase)
    this._history = [];
    this._maxHistorySize = options.maxHistorySize ?? 50;

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
   * Update the API key
   *
   * @param {string} apiKey - New API key
   */
  setApiKey(apiKey) {
    this._apiKey = apiKey || '';
    this._logger.debug('API key updated');
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
      this._logger.debug('Could not parse error response as JSON:', parseError.message);
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

  // ---------------------------------------------------------------------------
  // Retry with exponential backoff (from NM OpenAIServiceBase)
  // ---------------------------------------------------------------------------

  /**
   * Determines if an error should be retried
   *
   * @param {Error|OpenAIError} error - The error to check
   * @returns {boolean} True if the error should be retried
   * @private
   */
  _shouldRetry(error) {
    // OpenAIError has a built-in isRetryable getter
    if (error instanceof OpenAIError) {
      return error.isRetryable;
    }

    // Network errors are always retryable
    if (error.isNetworkError) {
      return true;
    }

    // Check HTTP status codes on raw error objects
    if (error.status) {
      if (error.status === 429) return true;
      if (error.status >= 500 && error.status < 600) return true;
      if (error.status >= 400 && error.status < 500) return false;
    }

    return false;
  }

  /**
   * Executes an operation with exponential backoff retry logic
   *
   * Delay formula: min(baseDelay * 2^attempt, maxDelay) + jitter
   * Jitter is a random value between 0 and 25% of the capped delay.
   *
   * @param {Function} operation - Async function to execute
   * @param {object} [context={}] - Context information for logging
   * @param {string} [context.operationName] - Name of the operation being retried
   * @returns {Promise<*>} Result of the operation
   * @throws {Error} If operation fails after all retries or with non-retryable error
   * @private
   */
  async _retryWithBackoff(operation, context = {}) {
    const { operationName = 'API request' } = context;

    // If retry is disabled, just execute once
    if (!this._retryConfig.enabled) {
      return await operation();
    }

    let lastError;
    const maxAttempts = Math.max(1, this._retryConfig.maxAttempts);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await operation();

        // Log retry success if this wasn't the first attempt
        if (attempt > 0) {
          this._logger.info(`${operationName} succeeded after ${attempt + 1} attempts`);
        }

        return result;
      } catch (error) {
        lastError = error;

        const isRetryable = this._shouldRetry(error);
        const isLastAttempt = attempt === maxAttempts - 1;

        if (!isRetryable || isLastAttempt) {
          if (!isRetryable) {
            this._logger.warn(`${operationName} failed with non-retryable error: ${error.message}`);
          } else {
            this._logger.warn(`${operationName} failed after ${maxAttempts} attempts`);
          }
          throw error;
        }

        // Check for retryAfter on the error (from OpenAIError or response)
        let retryAfterDelay = null;
        if (error.retryAfter && error.retryAfter > 0) {
          retryAfterDelay = error.retryAfter;
        }

        // Calculate delay with exponential backoff: baseDelay * 2^attempt
        const exponentialDelay = this._retryConfig.baseDelay * Math.pow(2, attempt);
        const cappedDelay = Math.min(exponentialDelay, this._retryConfig.maxDelay);

        // Use Retry-After delay if it's larger than the exponential delay
        const baseWait = retryAfterDelay ? Math.max(cappedDelay, retryAfterDelay) : cappedDelay;

        // Add jitter: random value between 0 and 25% of the delay
        const jitter = Math.random() * baseWait * 0.25;
        const finalDelay = baseWait + jitter;

        this._logger.warn(
          `${operationName} failed (attempt ${attempt + 1}/${maxAttempts}), retrying in ${Math.round(finalDelay)}ms: ${error.message}`
        );

        await new Promise((resolve) => setTimeout(resolve, finalDelay));
      }
    }

    // Should never reach here, but throw last error if we do
    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Sequential request queue (from NM OpenAIServiceBase)
  // ---------------------------------------------------------------------------

  /**
   * Gets or creates a category queue entry
   *
   * @param {string} category - Queue category name
   * @returns {{ queue: Array, processing: boolean }} Category queue entry
   * @private
   */
  _getCategoryQueue(category) {
    if (!this._categoryQueues.has(category)) {
      this._categoryQueues.set(category, { queue: [], processing: false });
    }
    return this._categoryQueues.get(category);
  }

  /**
   * Enqueues a request for sequential processing with optional priority
   *
   * Requests within the same category are processed sequentially.
   * Requests in different categories proceed in parallel.
   *
   * @param {Function} operation - Async function to execute
   * @param {object} [context={}] - Context information for the request
   * @param {string} [context.queueCategory='default'] - Queue category for parallel processing
   * @param {number} [priority=0] - Priority level (higher = more important, 0 = normal)
   * @returns {Promise<*>} Promise that resolves with the operation result
   * @throws {Error} If queue is full
   * @private
   */
  _enqueueRequest(operation, context = {}, priority = 0) {
    const category = context.queueCategory ?? 'default';
    const cat = this._getCategoryQueue(category);

    if (cat.queue.length >= this._maxQueueSize) {
      throw new Error(`Request queue full (${this._maxQueueSize} requests). Try again later.`);
    }

    return new Promise((resolve, reject) => {
      const request = {
        operation,
        resolve,
        reject,
        context,
        priority
      };

      // Insert based on priority (higher priority first)
      if (priority > 0) {
        const insertIndex = cat.queue.findIndex((req) => req.priority < priority);
        if (insertIndex === -1) {
          cat.queue.push(request);
        } else {
          cat.queue.splice(insertIndex, 0, request);
        }
      } else {
        cat.queue.push(request);
      }

      // Start processing this category if not already processing (fire-and-forget with safety catch)
      if (!cat.processing) {
        this._processCategory(category).catch((err) =>
          this._logger.error('_processCategory crashed unexpectedly:', err)
        );
      }
    });
  }

  /**
   * Processes a category queue sequentially (one at a time)
   *
   * Each request is executed with retry logic. If a request fails after
   * all retries, the error is propagated to the caller while the queue
   * continues processing remaining requests.
   *
   * @param {string} category - Queue category to process
   * @private
   */
  async _processCategory(category) {
    const cat = this._categoryQueues.get(category);
    if (!cat || cat.processing) {
      return;
    }

    cat.processing = true;

    try {
      while (cat.queue.length > 0) {
        const request = cat.queue.shift();

        try {
          const result = await request.operation();
          request.resolve(result);
        } catch (error) {
          request.reject(error);
        }
      }
    } finally {
      cat.processing = false;
    }
  }

  /**
   * Gets the current size of the request queue
   *
   * @param {string} [category] - Specific category to check, or all categories if omitted
   * @returns {number} Number of requests currently queued
   */
  getQueueSize(category) {
    if (category !== undefined) {
      const cat = this._categoryQueues.get(category);
      return cat ? cat.queue.length : 0;
    }
    let total = 0;
    for (const cat of this._categoryQueues.values()) {
      total += cat.queue.length;
    }
    return total;
  }

  /**
   * Gets the list of active queue category names
   *
   * @returns {string[]} Array of category names
   */
  getQueueCategories() {
    return [...this._categoryQueues.keys()];
  }

  /**
   * Clears pending requests from the queue.
   * All queued promises will be rejected with a cancellation error.
   *
   * @param {string} [category] - Specific category to clear, or all categories if omitted
   */
  clearQueue(category) {
    this._logger.debug('clearQueue called', { category: category ?? 'all' });

    const cancellationError = new Error('Request cancelled: queue cleared');
    cancellationError.isCancelled = true;

    if (category !== undefined) {
      const cat = this._categoryQueues.get(category);
      if (!cat) return;
      const queueSize = cat.queue.length;
      while (cat.queue.length > 0) {
        const request = cat.queue.shift();
        request.reject(cancellationError);
      }
      if (queueSize > 0) {
        this._logger.warn(`Cleared ${queueSize} pending request(s) from '${category}' queue`);
      }
      return;
    }

    // Clear all categories
    let totalCleared = 0;
    for (const cat of this._categoryQueues.values()) {
      while (cat.queue.length > 0) {
        const request = cat.queue.shift();
        request.reject(cancellationError);
        totalCleared++;
      }
    }
    if (totalCleared > 0) {
      this._logger.warn(`Cleared ${totalCleared} pending request(s) from all queues`);
    }
  }

  // ---------------------------------------------------------------------------
  // Operation history (from NM OpenAIServiceBase)
  // ---------------------------------------------------------------------------

  /**
   * Adds an entry to the operation history
   *
   * @param {object} entry - The entry to add
   * @private
   */
  _addToHistory(entry) {
    this._history.push({
      ...entry,
      timestamp: new Date()
    });

    // Trim oldest entry if exceeds max size
    while (this._history.length > this._maxHistorySize) {
      this._history.shift();
    }
  }

  /**
   * Gets the operation history
   *
   * @param {number} [limit] - Maximum number of entries to return
   * @returns {Array} Array of history entries (most recent last)
   */
  getHistory(limit) {
    const history = [...this._history];
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Clears the operation history
   */
  clearHistory() {
    this._history = [];
  }

  // ---------------------------------------------------------------------------
  // Core request methods
  // ---------------------------------------------------------------------------

  /**
   * Execute a single raw fetch request to the OpenAI API (no retry/queue).
   *
   * This is the inner implementation that handles authentication, timeout,
   * rate-limiter integration, error parsing, and response handling.
   *
   * @param {string} endpoint - API endpoint (e.g., '/chat/completions')
   * @param {object} [options] - Fetch options
   * @param {string} [options.method='GET'] - HTTP method
   * @param {object} [options.headers] - Additional headers
   * @param {string|FormData} [options.body] - Request body
   * @param {number} [options.timeout] - Custom timeout for this request
   * @param {AbortSignal} [options.signal] - External AbortSignal to cancel the request
   * @returns {Promise<object>} Parsed JSON response
   * @throws {OpenAIError} If the request fails
   * @private
   */
  async _makeRequest(endpoint, options = {}) {
    const url = this._buildUrl(endpoint);
    const method = options.method || 'GET';
    const t0 = Date.now();

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

    // Create timeout controller
    const controller = this._createTimeoutController(options.timeout);

    // Combine external signal (if provided) with timeout signal
    let combinedSignal = controller.signal;
    let fallbackController = null;
    let listenerCleanup = null;

    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(controller.timeoutId);
        throw new OpenAIError(
          'Request aborted: external signal was already aborted',
          OpenAIErrorType.TIMEOUT_ERROR
        );
      }

      if (typeof AbortSignal.any === 'function') {
        combinedSignal = AbortSignal.any([controller.signal, options.signal]);
      } else {
        // Fallback: create a new controller that aborts if either signal fires
        fallbackController = new AbortController();
        listenerCleanup = new AbortController();
        const onAbort = () => fallbackController.abort();
        controller.signal.addEventListener('abort', onAbort, {
          once: true,
          signal: listenerCleanup.signal
        });
        options.signal.addEventListener('abort', onAbort, {
          once: true,
          signal: listenerCleanup.signal
        });
        combinedSignal = fallbackController.signal;
      }
    }

    // Build fetch options
    const fetchOptions = {
      method,
      headers,
      signal: combinedSignal
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    // Sanitize URL in debug logs to prevent exposing sensitive query parameters
    const sanitizedUrl = SensitiveDataFilter.sanitizeUrl(url);
    this._logger.debug(`Making ${method} request to ${sanitizedUrl}`);

    // Execute request with rate limiting (throttle only — retry is handled
    // by the outer _retryWithBackoff wrapper in request(), so using
    // executeWithRetry here would cause double-retry amplification).
    try {
      return await this._rateLimiter.throttle(async () => {
        try {
          const response = await fetch(url, fetchOptions);

          // Clear timeout
          clearTimeout(controller.timeoutId);

          // Handle error responses
          if (!response.ok) {
            this._logger.debug(
              `Request to ${endpoint} returned HTTP ${response.status} in ${Date.now() - t0}ms`
            );
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
          this._logger.debug(
            `Request to ${endpoint} completed successfully in ${Date.now() - t0}ms, status: ${response.status}`
          );
          return data;
        } catch (error) {
          // Clear timeout
          clearTimeout(controller.timeoutId);

          // Handle abort/timeout
          if (error.name === 'AbortError') {
            const sanitizedEndpoint = SensitiveDataFilter.sanitizeString(endpoint);
            throw new OpenAIError(
              `Request to ${sanitizedEndpoint} timed out after ${this._timeout}ms`,
              OpenAIErrorType.TIMEOUT_ERROR
            );
          }

          // Handle network errors
          if (error.name === 'TypeError' && error.message.includes('fetch')) {
            const sanitizedError = SensitiveDataFilter.sanitizeString(error.message);
            throw new OpenAIError(
              'Network error. Please check your internet connection.',
              OpenAIErrorType.NETWORK_ERROR,
              null,
              { originalError: sanitizedError }
            );
          }

          // Re-throw OpenAI errors as-is
          if (error instanceof OpenAIError) {
            throw error;
          }

          // Wrap unknown errors
          const sanitizedMessage = SensitiveDataFilter.sanitizeString(
            error.message || 'Unknown error occurred'
          );
          const sanitizedError = SensitiveDataFilter.sanitizeObject(error);
          throw new OpenAIError(sanitizedMessage, OpenAIErrorType.API_ERROR, null, {
            originalError: sanitizedError
          });
        }
      });
    } finally {
      // Guarantee timeout cleanup even if rate limiter itself throws
      clearTimeout(controller.timeoutId);
      // Clean up fallback abort listeners to prevent memory leaks
      listenerCleanup?.abort();
    }
  }

  /**
   * Make a request to the OpenAI API
   *
   * When the request queue is enabled (default), requests are processed
   * sequentially with retry logic. Set `options.useQueue` to `false` to
   * bypass the queue (still uses retry). Set `options.useRetry` to `false`
   * to also bypass retry logic.
   *
   * @param {string} endpoint - API endpoint (e.g., '/chat/completions')
   * @param {object} [options] - Fetch options
   * @param {string} [options.method='GET'] - HTTP method
   * @param {object} [options.headers] - Additional headers
   * @param {string|FormData} [options.body] - Request body
   * @param {number} [options.timeout] - Custom timeout for this request
   * @param {AbortSignal} [options.signal] - External AbortSignal to cancel the request
   * @param {boolean} [options.useQueue=true] - Whether to use the sequential request queue
   * @param {boolean} [options.useRetry=true] - Whether to use retry with backoff
   * @param {number} [options.priority=0] - Queue priority (higher = processed first)
   * @returns {Promise<object>} Parsed JSON response
   * @throws {OpenAIError} If the request fails
   */
  async request(endpoint, options = {}) {
    this._logger.debug('request called', {
      endpoint,
      method: options.method || 'GET',
      useQueue: options.useQueue ?? true,
      useRetry: options.useRetry ?? true
    });

    if (!this.isConfigured) {
      throw new OpenAIError(
        'OpenAI API key not configured. Please add your API key in module settings.',
        OpenAIErrorType.AUTHENTICATION_ERROR
      );
    }

    // Extract queue/retry options (not passed to _makeRequest)
    const {
      useQueue = true,
      useRetry = true,
      priority = 0,
      queueCategory,
      ...requestOptions
    } = options;

    // The raw fetch operation
    const operation = () => this._makeRequest(endpoint, requestOptions);

    // Wrap with retry if enabled
    const retryWrapped =
      useRetry && this._retryConfig.enabled
        ? () => this._retryWithBackoff(operation, { operationName: endpoint })
        : operation;

    // Wrap with queue if enabled
    if (useQueue) {
      return this._enqueueRequest(
        retryWrapped,
        { operationName: endpoint, queueCategory },
        priority
      );
    }

    return retryWrapped();
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
    this._logger.debug('post called', { endpoint });
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
   * @param {object} [options] - Additional fetch options
   * @returns {Promise<object>} Parsed JSON response
   */
  async postFormData(endpoint, formData, options = {}) {
    this._logger.debug('postFormData called', { endpoint });
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: formData
    });
  }

  /**
   * Stream a POST request to the OpenAI API, yielding token chunks via async iterator.
   *
   * Bypasses the request queue and retry logic — streaming is long-lived and
   * has its own implicit retry (next cycle). Returns an async generator that
   * yields `{ content, usage }` objects for each SSE data chunk.
   *
   * @param {string} endpoint - API endpoint (e.g., '/chat/completions')
   * @param {object} data - Request payload (stream/stream_options are added automatically)
   * @param {object} [options] - Additional options
   * @param {AbortSignal} [options.signal] - External AbortSignal to cancel the stream
   * @yields {{ content: string|null, usage: object|null }} Token chunks
   * @throws {OpenAIError} If the request fails or API key is not configured
   */
  async *postStream(endpoint, data, options = {}) {
    if (!this.isConfigured) {
      throw new OpenAIError(
        'OpenAI API key not configured. Please add your API key in module settings.',
        OpenAIErrorType.AUTHENTICATION_ERROR
      );
    }

    const url = this._buildUrl(endpoint);
    const headers = this._buildJsonHeaders();

    // Create timeout controller
    const controller = this._createTimeoutController();

    // Combine external signal with timeout signal
    let combinedSignal = controller.signal;
    let fallbackController = null;
    let listenerCleanup = null;

    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(controller.timeoutId);
        throw new OpenAIError(
          'Request aborted: external signal was already aborted',
          OpenAIErrorType.TIMEOUT_ERROR
        );
      }

      if (typeof AbortSignal.any === 'function') {
        combinedSignal = AbortSignal.any([controller.signal, options.signal]);
      } else {
        fallbackController = new AbortController();
        listenerCleanup = new AbortController();
        const onAbort = () => fallbackController.abort();
        controller.signal.addEventListener('abort', onAbort, {
          once: true,
          signal: listenerCleanup.signal
        });
        options.signal.addEventListener('abort', onAbort, {
          once: true,
          signal: listenerCleanup.signal
        });
        combinedSignal = fallbackController.signal;
      }
    }

    const body = JSON.stringify({
      ...data,
      stream: true,
      stream_options: { include_usage: true }
    });

    this._logger.debug(`postStream: POST ${endpoint}`);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: combinedSignal
    });

    clearTimeout(controller.timeoutId);

    if (!response.ok) {
      const error = await this._parseErrorResponse(response);
      throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { stream: true });
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const payload = trimmed.slice(6); // Remove 'data: ' prefix
          if (payload === '[DONE]') return;

          try {
            const json = JSON.parse(payload);
            const content = json.choices?.[0]?.delta?.content || null;
            const usage = json.usage || null;

            yield { content, usage };
          } catch (parseError) {
            this._logger.debug('postStream: failed to parse SSE chunk:', parseError.message);
          }
        }
      }
    } finally {
      reader.releaseLock();
      // Clean up fallback abort listeners to prevent memory leaks
      listenerCleanup?.abort();
    }
  }

  /**
   * Validate API key by making a simple API call
   *
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    this._logger.debug('validateApiKey called');
    const t0 = Date.now();

    if (!this._apiKey) {
      this._logger.debug('validateApiKey: no API key set');
      return false;
    }

    try {
      // Make a minimal request to models endpoint to validate key
      // Bypass queue/retry for validation
      await this.request('/models', { method: 'GET', useQueue: false, useRetry: false });
      this._logger.log(`API key validated successfully in ${Date.now() - t0}ms`);
      return true;
    } catch (error) {
      if (error.type === OpenAIErrorType.AUTHENTICATION_ERROR) {
        this._logger.warn(`API key validation failed after ${Date.now() - t0}ms: Invalid key`);
        return false;
      }
      // Non-auth errors mean we cannot verify — don't assume valid
      const sanitizedMessage = SensitiveDataFilter.sanitizeString(error.message);
      this._logger.error(
        `API key validation could not be completed after ${Date.now() - t0}ms:`,
        sanitizedMessage
      );
      throw error;
    }
  }
}

// Export the OpenAIClient class and related exports
export { OpenAIClient, OpenAIError, OpenAIErrorType, OPENAI_BASE_URL };
