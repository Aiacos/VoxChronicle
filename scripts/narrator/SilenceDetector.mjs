/**
 * SilenceDetector - Timer-Based Silence Detection for VoxChronicle
 *
 * Monitors transcription activity and triggers callbacks when silence
 * (no transcription activity) is detected for a configurable threshold.
 * Used to trigger autonomous AI suggestions during game sessions when
 * players or GM are silent and may need prompting.
 *
 * @class SilenceDetector
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Default silence threshold in milliseconds (30 seconds)
 * @constant {number}
 */
const DEFAULT_THRESHOLD_MS = 30000;

/**
 * Minimum allowed threshold in milliseconds (10 seconds)
 * @constant {number}
 */
const MIN_THRESHOLD_MS = 10000;

/**
 * Maximum allowed threshold in milliseconds (120 seconds / 2 minutes)
 * @constant {number}
 */
const MAX_THRESHOLD_MS = 120000;

/**
 * Represents the data passed to the silence callback
 * @typedef {object} SilenceEvent
 * @property {number} silenceDurationMs - Duration of silence in milliseconds
 * @property {number} lastActivityTime - Timestamp of the last recorded activity
 * @property {number} silenceCount - Number of silence events since start
 */

/**
 * Callback function type for silence events
 * @callback SilenceCallback
 * @param {SilenceEvent} event - The silence event data
 */

/**
 * SilenceDetector class - Monitors for periods of inactivity and triggers callbacks
 *
 * Uses setTimeout-based timers that reset on each transcription activity.
 * Supports continuous monitoring with automatic timer restart after each silence event.
 *
 * @example
 * const detector = new SilenceDetector({
 *   thresholdMs: 30000,
 *   onSilence: (event) => {
 *     console.log(`Silence detected for ${event.silenceDurationMs}ms`);
 *   }
 * });
 * detector.start();
 * // ... when transcription received ...
 * detector.recordActivity();
 * // ... when done ...
 * detector.stop();
 */
class SilenceDetector {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('SilenceDetector');

  /**
   * Creates a new SilenceDetector instance
   *
   * @param {object} [options={}] - Configuration options
   * @param {number} [options.thresholdMs=30000] - Silence threshold in milliseconds (10000-120000)
   * @param {SilenceCallback} [options.onSilence] - Callback function invoked when silence is detected
   * @param {boolean} [options.autoRestart=true] - Whether to automatically restart timer after silence event
   */
  constructor(options = {}) {
    /**
     * Silence threshold in milliseconds
     * @type {number}
     * @private
     */
    this._thresholdMs = this._clampThreshold(options.thresholdMs ?? DEFAULT_THRESHOLD_MS);

    /**
     * Callback function for silence events
     * @type {SilenceCallback|null}
     * @private
     */
    this._onSilenceCallback = typeof options.onSilence === 'function' ? options.onSilence : null;

    /**
     * Whether to automatically restart timer after silence event
     * @type {boolean}
     * @private
     */
    this._autoRestart = options.autoRestart !== false;

    /**
     * Timer ID for the silence detection timeout
     * @type {number|null}
     * @private
     */
    this._silenceTimer = null;

    /**
     * Timestamp of the last recorded activity
     * @type {number|null}
     * @private
     */
    this._lastActivityTime = null;

    /**
     * Whether silence detection is currently enabled
     * @type {boolean}
     * @private
     */
    this._isEnabled = false;

    /**
     * Whether a silence event is currently being processed
     * @type {boolean}
     * @private
     */
    this._isProcessingSilence = false;

    /**
     * Count of silence events since start
     * @type {number}
     * @private
     */
    this._silenceCount = 0;

    /**
     * Start time of the current monitoring session
     * @type {number|null}
     * @private
     */
    this._sessionStartTime = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Starts monitoring for silence
   *
   * Initializes the timer and begins tracking activity. If already enabled,
   * this method will reset the timer and activity tracking.
   */
  start() {
    if (this._isEnabled) {
      this._logger.debug('Silence detection already running, resetting timer');
      this._clearTimer();
    }

    this._isEnabled = true;
    this._lastActivityTime = Date.now();
    this._sessionStartTime = Date.now();
    this._silenceCount = 0;
    this._isProcessingSilence = false;
    this._startTimer();

    this._logger.debug(`Silence detection started with threshold ${this._thresholdMs}ms`);
  }

  /**
   * Stops monitoring for silence
   *
   * Clears the timer and resets state. Safe to call multiple times.
   */
  stop() {
    if (!this._isEnabled) {
      this._logger.debug('Silence detection already stopped');
      return;
    }

    this._isEnabled = false;
    this._clearTimer();
    this._isProcessingSilence = false;

    this._logger.debug('Silence detection stopped');
  }

  /**
   * Records activity (call when transcription is received)
   *
   * Resets the silence timer. Should be called each time meaningful
   * transcription activity occurs (e.g., new speech detected).
   *
   * @returns {boolean} True if activity was recorded, false if not enabled
   */
  recordActivity() {
    if (!this._isEnabled) {
      this._logger.debug('Activity ignored - silence detection not enabled');
      return false;
    }

    this._lastActivityTime = Date.now();
    this._clearTimer();
    this._startTimer();

    this._logger.debug('Activity recorded, silence timer reset');
    return true;
  }

  /**
   * Updates the silence threshold
   *
   * If currently monitoring, the timer will be restarted with the new threshold.
   *
   * @param {number} thresholdMs - New threshold in milliseconds (clamped to 10000-120000)
   */
  setThreshold(thresholdMs) {
    const newThreshold = this._clampThreshold(thresholdMs);

    if (newThreshold === this._thresholdMs) {
      return;
    }

    const oldThreshold = this._thresholdMs;
    this._thresholdMs = newThreshold;

    this._logger.debug(`Threshold changed from ${oldThreshold}ms to ${newThreshold}ms`);

    // Restart timer with new threshold if currently monitoring
    if (this._isEnabled) {
      this._clearTimer();
      this._startTimer();
    }
  }

  /**
   * Gets the current silence threshold
   *
   * @returns {number} Threshold in milliseconds
   */
  getThreshold() {
    return this._thresholdMs;
  }

  /**
   * Sets the silence callback function
   *
   * @param {SilenceCallback|null} callback - The callback function or null to clear
   */
  setOnSilenceCallback(callback) {
    if (callback === null || typeof callback === 'function') {
      this._onSilenceCallback = callback;
    } else {
      this._logger.warn('Invalid callback provided, ignoring');
    }
  }

  /**
   * Sets whether to automatically restart timer after silence event
   *
   * @param {boolean} autoRestart - Whether to auto-restart
   */
  setAutoRestart(autoRestart) {
    this._autoRestart = Boolean(autoRestart);
  }

  /**
   * Checks if silence detection is currently enabled
   *
   * @returns {boolean} True if enabled and monitoring
   */
  isEnabled() {
    return this._isEnabled;
  }

  /**
   * Checks if a silence event is currently being processed
   *
   * @returns {boolean} True if processing a silence event
   */
  isProcessingSilence() {
    return this._isProcessingSilence;
  }

  /**
   * Gets the time elapsed since last activity
   *
   * @returns {number} Milliseconds since last activity, or 0 if not tracking
   */
  getTimeSinceLastActivity() {
    if (!this._lastActivityTime) {
      return 0;
    }
    return Date.now() - this._lastActivityTime;
  }

  /**
   * Gets statistics about the current monitoring session
   *
   * @returns {object} Session statistics
   * @returns {boolean} returns.isEnabled - Whether monitoring is active
   * @returns {number} returns.thresholdMs - Current threshold in milliseconds
   * @returns {number} returns.silenceCount - Number of silence events detected
   * @returns {number|null} returns.lastActivityTime - Timestamp of last activity
   * @returns {number} returns.timeSinceLastActivity - Milliseconds since last activity
   * @returns {number|null} returns.sessionStartTime - When monitoring started
   * @returns {number} returns.sessionDurationMs - Total session duration
   * @returns {boolean} returns.hasCallback - Whether a callback is registered
   * @returns {boolean} returns.autoRestart - Whether auto-restart is enabled
   */
  getStats() {
    return {
      isEnabled: this._isEnabled,
      thresholdMs: this._thresholdMs,
      silenceCount: this._silenceCount,
      lastActivityTime: this._lastActivityTime,
      timeSinceLastActivity: this.getTimeSinceLastActivity(),
      sessionStartTime: this._sessionStartTime,
      sessionDurationMs: this._sessionStartTime ? Date.now() - this._sessionStartTime : 0,
      hasCallback: Boolean(this._onSilenceCallback),
      autoRestart: this._autoRestart
    };
  }

  /**
   * Resets session statistics while maintaining configuration
   *
   * Stops monitoring, resets counts and timestamps, but preserves
   * threshold and callback settings.
   */
  resetStats() {
    this.stop();
    this._silenceCount = 0;
    this._lastActivityTime = null;
    this._sessionStartTime = null;
    this._logger.debug('Session statistics reset');
  }

  // ---------------------------------------------------------------------------
  // Private: Timer management
  // ---------------------------------------------------------------------------

  /**
   * Starts the silence detection timer
   *
   * @private
   */
  _startTimer() {
    // Calculate remaining time if activity was recorded recently
    const elapsed = this._lastActivityTime ? Date.now() - this._lastActivityTime : 0;
    const remainingTime = Math.max(0, this._thresholdMs - elapsed);

    this._silenceTimer = setTimeout(() => {
      this._onSilenceTimeout();
    }, remainingTime);
  }

  /**
   * Clears the silence detection timer
   *
   * @private
   */
  _clearTimer() {
    if (this._silenceTimer !== null) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  /**
   * Handles the silence timeout event
   *
   * Called when the silence timer expires. Invokes the callback
   * and optionally restarts the timer for continuous monitoring.
   *
   * @private
   */
  _onSilenceTimeout() {
    if (!this._isEnabled) {
      return;
    }

    const silenceDurationMs = this._lastActivityTime
      ? Date.now() - this._lastActivityTime
      : this._thresholdMs;

    this._silenceCount++;
    this._isProcessingSilence = true;

    this._logger.info(
      `Silence detected after ${silenceDurationMs}ms (event #${this._silenceCount})`
    );

    // Invoke callback if registered
    if (this._onSilenceCallback) {
      try {
        const event = {
          silenceDurationMs,
          lastActivityTime: this._lastActivityTime,
          silenceCount: this._silenceCount
        };
        const result = this._onSilenceCallback(event);
        if (result && typeof result.catch === 'function') {
          result.catch((err) =>
            this._logger.error('Error in async silence callback:', err.message)
          );
        }
      } catch (error) {
        this._logger.error('Error in silence callback:', error.message);
      }
    }

    this._isProcessingSilence = false;

    // Restart timer for next silence period if auto-restart is enabled
    if (this._autoRestart && this._isEnabled) {
      // Reset activity time to now so next silence is measured from this point
      this._lastActivityTime = Date.now();
      this._startTimer();
      this._logger.debug('Timer restarted for next silence detection');
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Utility methods
  // ---------------------------------------------------------------------------

  /**
   * Clamps threshold value to valid range
   *
   * @param {number} value - The threshold value to clamp
   * @returns {number} The clamped value
   * @private
   */
  _clampThreshold(value) {
    if (typeof value !== 'number' || isNaN(value)) {
      this._logger.warn(`Invalid threshold value: ${value}, using default`);
      return DEFAULT_THRESHOLD_MS;
    }

    if (value < MIN_THRESHOLD_MS) {
      this._logger.warn(`Threshold ${value}ms below minimum, clamping to ${MIN_THRESHOLD_MS}ms`);
      return MIN_THRESHOLD_MS;
    }

    if (value > MAX_THRESHOLD_MS) {
      this._logger.warn(`Threshold ${value}ms above maximum, clamping to ${MAX_THRESHOLD_MS}ms`);
      return MAX_THRESHOLD_MS;
    }

    return value;
  }
}

export { SilenceDetector, DEFAULT_THRESHOLD_MS, MIN_THRESHOLD_MS, MAX_THRESHOLD_MS };
