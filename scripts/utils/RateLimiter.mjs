/**
 * RateLimiter - API Request Throttling Utility for VoxChronicle
 *
 * Provides rate limiting for API requests with queue management,
 * token bucket algorithm, and exponential backoff support.
 *
 * Default configuration supports Kanka API limits:
 * - Free tier: 30 requests per minute
 * - Premium tier: 90 requests per minute
 *
 * @class RateLimiter
 * @module vox-chronicle
 */

import { Logger } from './Logger.mjs';

/**
 * Rate limit presets for known APIs
 * @enum {object}
 */
const RateLimitPresets = {
  KANKA_FREE: { requestsPerMinute: 30, name: 'Kanka Free' },
  KANKA_PREMIUM: { requestsPerMinute: 90, name: 'Kanka Premium' },
  OPENAI: { requestsPerMinute: 60, name: 'OpenAI' } // OpenAI has per-model limits, this is a safe default
};

/**
 * RateLimiter utility class for API request throttling
 * Uses a sliding window algorithm with request queue
 */
class RateLimiter {
  /**
   * Create a new RateLimiter instance
   *
   * @param {object} options - Configuration options
   * @param {number} [options.requestsPerMinute=30] - Maximum requests per minute
   * @param {number} [options.maxQueueSize=100] - Maximum queue size before rejecting requests
   * @param {number} [options.maxRetries=3] - Maximum retries on rate limit errors
   * @param {number} [options.initialBackoffMs=1000] - Initial backoff delay in milliseconds
   * @param {string} [options.name='default'] - Name for logging purposes
   */
  constructor(options = {}) {
    /**
     * Maximum requests allowed per minute
     * @type {number}
     * @private
     */
    this._requestsPerMinute = options.requestsPerMinute ?? 30;

    /**
     * Maximum size of the pending request queue
     * @type {number}
     * @private
     */
    this._maxQueueSize = options.maxQueueSize ?? 100;

    /**
     * Maximum retries on rate limit errors
     * @type {number}
     * @private
     */
    this._maxRetries = options.maxRetries ?? 3;

    /**
     * Initial backoff delay in milliseconds
     * @type {number}
     * @private
     */
    this._initialBackoffMs = options.initialBackoffMs ?? 1000;

    /**
     * Name for logging purposes
     * @type {string}
     * @private
     */
    this._name = options.name ?? 'default';

    /**
     * Timestamps of recent requests (sliding window)
     * @type {number[]}
     * @private
     */
    this._requestTimestamps = [];

    /**
     * Queue of pending requests
     * @type {Array<{resolve: Function, reject: Function, fn: Function, retries: number}>}
     * @private
     */
    this._queue = [];

    /**
     * Whether the queue processor is currently running
     * @type {boolean}
     * @private
     */
    this._processingQueue = false;

    /**
     * Whether the limiter is paused (e.g., due to rate limit response)
     * @type {boolean}
     * @private
     */
    this._paused = false;

    /**
     * Timestamp when the limiter will resume after pause
     * @type {number|null}
     * @private
     */
    this._pausedUntil = null;

    /**
     * Total number of requests made (lifetime counter)
     * @type {number}
     * @private
     */
    this._totalRequests = 0;

    /**
     * Array of wait times in milliseconds for averaging
     * @type {number[]}
     * @private
     */
    this._waitTimes = [];

    /**
     * Maximum queue length observed
     * @type {number}
     * @private
     */
    this._peakQueueLength = 0;

    /**
     * Total number of retries across all requests
     * @type {number}
     * @private
     */
    this._retryCount = 0;

    /**
     * Logger for this instance
     * @type {object}
     * @private
     */
    this._logger = Logger.createChild(`RateLimiter:${this._name}`);
  }

  /**
   * Create a RateLimiter from a preset
   *
   * @param {string} presetName - Name of the preset (e.g., 'KANKA_FREE')
   * @param {object} [overrides] - Additional options to override preset defaults
   * @returns {RateLimiter} A new RateLimiter instance
   */
  static fromPreset(presetName, overrides = {}) {
    const preset = RateLimitPresets[presetName];
    if (!preset) {
      throw new Error(`Unknown rate limit preset: ${presetName}`);
    }
    return new RateLimiter({
      requestsPerMinute: preset.requestsPerMinute,
      name: preset.name,
      ...overrides
    });
  }

  /**
   * Get the interval between requests in milliseconds
   *
   * @returns {number} Minimum interval between requests
   * @private
   */
  get _intervalMs() {
    return (60 * 1000) / this._requestsPerMinute;
  }

  /**
   * Get the number of requests currently in the queue
   *
   * @returns {number} Queue length
   */
  get queueLength() {
    return this._queue.length;
  }

  /**
   * Get the number of requests made in the current window
   *
   * @returns {number} Number of recent requests
   */
  get currentWindowRequests() {
    this._cleanupOldTimestamps();
    return this._requestTimestamps.length;
  }

  /**
   * Get remaining requests available in the current window
   *
   * @returns {number} Number of available request slots
   */
  get remainingRequests() {
    return Math.max(0, this._requestsPerMinute - this.currentWindowRequests);
  }

  /**
   * Check if the limiter is currently paused
   *
   * @returns {boolean} True if paused
   */
  get isPaused() {
    if (this._paused && this._pausedUntil && Date.now() >= this._pausedUntil) {
      this._paused = false;
      this._pausedUntil = null;
    }
    return this._paused;
  }

  /**
   * Remove timestamps older than 1 minute from the sliding window
   *
   * @private
   */
  _cleanupOldTimestamps() {
    const oneMinuteAgo = Date.now() - 60000;
    this._requestTimestamps = this._requestTimestamps.filter((ts) => ts > oneMinuteAgo);
  }

  /**
   * Calculate wait time until a request can be made
   *
   * @returns {number} Wait time in milliseconds (0 if can proceed immediately)
   * @private
   */
  _calculateWaitTime() {
    this._cleanupOldTimestamps();

    // If paused, wait until resume time
    if (this._paused && this._pausedUntil) {
      const pauseWait = this._pausedUntil - Date.now();
      if (pauseWait > 0) {
        return pauseWait;
      }
      this._paused = false;
      this._pausedUntil = null;
    }

    // If under limit, no wait needed
    if (this._requestTimestamps.length < this._requestsPerMinute) {
      return 0;
    }

    // Wait until the oldest request expires from the window
    const oldestTimestamp = this._requestTimestamps[0];
    const waitTime = oldestTimestamp + 60000 - Date.now();
    return Math.max(0, waitTime);
  }

  /**
   * Record a request timestamp
   *
   * @private
   */
  _recordRequest() {
    this._requestTimestamps.push(Date.now());
    this._cleanupOldTimestamps();
    this._totalRequests++;
  }

  /**
   * Pause the limiter for a specified duration (e.g., after receiving 429)
   *
   * @param {number} durationMs - Duration to pause in milliseconds
   */
  pause(durationMs) {
    this._paused = true;
    this._pausedUntil = Date.now() + durationMs;
    this._logger.warn(`Paused for ${durationMs}ms due to rate limit`);
  }

  /**
   * Resume the limiter immediately
   */
  resume() {
    this._paused = false;
    this._pausedUntil = null;
    this._logger.info('Resumed from pause');
    this._processQueue();
  }

  /**
   * Throttle an async function call
   * Waits for rate limit availability before executing
   *
   * @template T
   * @param {function(): Promise<T>} fn - Async function to throttle
   * @returns {Promise<T>} The function result
   */
  async throttle(fn) {
    return new Promise((resolve, reject) => {
      // Check queue size limit
      if (this._queue.length >= this._maxQueueSize) {
        reject(new Error(`Rate limiter queue full (max: ${this._maxQueueSize})`));
        return;
      }

      // Add to queue with timestamp for wait time tracking
      this._queue.push({
        resolve,
        reject,
        fn,
        retries: 0,
        enqueuedAt: Date.now()
      });

      // Track peak queue length
      if (this._queue.length > this._peakQueueLength) {
        this._peakQueueLength = this._queue.length;
      }

      this._logger.debug(`Request queued. Queue length: ${this._queue.length}`);

      // Start processing if not already running
      this._processQueue();
    });
  }

  /**
   * Execute a function with automatic retry on rate limit errors
   *
   * @template T
   * @param {function(): Promise<T>} fn - Async function to execute
   * @param {number} [maxRetries] - Maximum retries (defaults to instance setting)
   * @returns {Promise<T>} The function result
   */
  async executeWithRetry(fn, maxRetries = this._maxRetries) {
    let lastError;
    let backoffMs = this._initialBackoffMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.throttle(fn);
      } catch (error) {
        lastError = error;

        // Check if it's a rate limit error
        if (this._isRateLimitError(error)) {
          if (attempt < maxRetries) {
            this._logger.warn(
              `Rate limit hit, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await this._delay(backoffMs);
            backoffMs *= 2; // Exponential backoff
          }
        } else {
          // Non-rate-limit error, don't retry
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is a rate limit error
   *
   * @param {Error} error - The error to check
   * @returns {boolean} True if rate limit error
   * @private
   */
  _isRateLimitError(error) {
    // Check for common rate limit indicators
    if (error.status === 429 || error.statusCode === 429) {
      return true;
    }
    if (error.message && error.message.toLowerCase().includes('rate limit')) {
      return true;
    }
    if (error.code === 'RATE_LIMITED') {
      return true;
    }
    return false;
  }

  /**
   * Process the request queue
   *
   * @private
   */
  async _processQueue() {
    // Don't start multiple processors
    if (this._processingQueue) {
      return;
    }

    this._processingQueue = true;

    try {
      while (this._queue.length > 0) {
        // Check if paused
        if (this.isPaused) {
          const waitTime = this._pausedUntil - Date.now();
          if (waitTime > 0) {
            this._logger.debug(`Waiting ${waitTime}ms for pause to end`);
            await this._delay(waitTime);
          }
        }

        // Calculate wait time for rate limit
        const waitTime = this._calculateWaitTime();
        if (waitTime > 0) {
          this._logger.debug(`Throttling: waiting ${waitTime}ms before next request`);
          await this._delay(waitTime);
        }

        // Get next item from queue
        const item = this._queue.shift();
        if (!item) {
          break;
        }

        // Track wait time if timestamp available
        if (item.enqueuedAt) {
          const waitTime = Date.now() - item.enqueuedAt;
          this._waitTimes.push(waitTime);
        }

        // Execute the request
        try {
          this._recordRequest();
          const result = await item.fn();
          item.resolve(result);
        } catch (error) {
          // Handle rate limit response from server
          if (this._isRateLimitError(error)) {
            this._logger.warn('Server returned rate limit error');

            // Check for Retry-After header if available
            const retryAfter = error.retryAfter ?? 60000;
            this.pause(retryAfter);

            // Re-queue the request if retries available
            if (item.retries < this._maxRetries) {
              item.retries++;
              this._retryCount++;
              this._queue.unshift(item);
              this._logger.info(
                `Re-queued request for retry (attempt ${item.retries}/${this._maxRetries})`
              );
            } else {
              item.reject(error);
            }
          } else {
            item.reject(error);
          }
        }
      }
    } finally {
      this._processingQueue = false;
    }
  }

  /**
   * Utility function to delay execution
   *
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   * @private
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait until a request slot is available
   * Does not consume the slot, just waits
   *
   * @returns {Promise<void>}
   */
  async waitForSlot() {
    const waitTime = this._calculateWaitTime();
    if (waitTime > 0) {
      await this._delay(waitTime);
    }
  }

  /**
   * Clear the request queue
   *
   * @param {Error} [error] - Optional error to reject pending requests with
   */
  clear(error) {
    const rejectError = error ?? new Error('Rate limiter queue cleared');
    while (this._queue.length > 0) {
      const item = this._queue.shift();
      item.reject(rejectError);
    }
    this._logger.info('Queue cleared');
  }

  /**
   * Reset the limiter state
   * Clears timestamps and queue
   */
  reset() {
    this._requestTimestamps = [];
    this.clear();
    this._paused = false;
    this._pausedUntil = null;
    this._totalRequests = 0;
    this._waitTimes = [];
    this._peakQueueLength = 0;
    this._retryCount = 0;
    this._logger.info('Rate limiter reset');
  }

  /**
   * Update the rate limit configuration
   *
   * @param {number} requestsPerMinute - New requests per minute limit
   */
  setRateLimit(requestsPerMinute) {
    if (requestsPerMinute > 0) {
      this._requestsPerMinute = requestsPerMinute;
      this._logger.info(`Rate limit updated to ${requestsPerMinute} req/min`);
    }
  }

  /**
   * Get current limiter statistics
   *
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      name: this._name,
      requestsPerMinute: this._requestsPerMinute,
      currentWindowRequests: this.currentWindowRequests,
      remainingRequests: this.remainingRequests,
      queueLength: this.queueLength,
      isPaused: this.isPaused,
      pausedUntil: this._pausedUntil ? new Date(this._pausedUntil).toISOString() : null,
      totalRequests: this._totalRequests,
      averageWaitTime: this._waitTimes.length > 0 ? this._waitTimes.reduce((a, b) => a + b, 0) / this._waitTimes.length : 0,
      peakQueueLength: this._peakQueueLength,
      retryCount: this._retryCount
    };
  }
}

// Export the RateLimiter class and presets
export { RateLimiter, RateLimitPresets };
