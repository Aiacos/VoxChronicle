/**
 * SilenceMonitor - Manages Silence Detection and Autonomous Suggestion Triggering
 *
 * Extracted from AIAssistant to separate the silence monitoring responsibility.
 * Coordinates between a SilenceDetector (timer-based silence detection) and
 * an autonomous suggestion generation function (provided by AIAssistant).
 *
 * @class SilenceMonitor
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * SilenceMonitor class - Bridges SilenceDetector events to suggestion generation
 *
 * Owns:
 * - SilenceDetector lifecycle (set, start, stop)
 * - Autonomous suggestion callback management
 * - Silence event handling and suggestion count tracking
 * - Activity recording passthrough to SilenceDetector
 *
 * Does NOT own:
 * - The actual suggestion generation logic (injected via setGenerateSuggestionFn)
 * - OpenAI client configuration checks (caller responsibility)
 *
 * @example
 * const monitor = new SilenceMonitor();
 * monitor.setSilenceDetector(silenceDetector);
 * monitor.setGenerateSuggestionFn(() => aiAssistant._generateAutonomousSuggestion());
 * monitor.setOnAutonomousSuggestionCallback((data) => panel.showSuggestion(data));
 * monitor.startMonitoring();
 */
class SilenceMonitor {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('SilenceMonitor');

  /**
   * Creates a new SilenceMonitor instance
   */
  constructor() {
    /**
     * SilenceDetector instance for timer-based silence detection
     * @type {import('./SilenceDetector.mjs').SilenceDetector|null}
     * @private
     */
    this._silenceDetector = null;

    /**
     * Callback invoked when an autonomous suggestion is generated
     * @type {function|null}
     * @private
     */
    this._onAutonomousSuggestionCallback = null;

    /**
     * Whether silence monitoring is currently active
     * @type {boolean}
     * @private
     */
    this._silenceMonitoringActive = false;

    /**
     * Bound handler for silence events (to allow removal)
     * @type {function|null}
     * @private
     */
    this._boundSilenceHandler = null;

    /**
     * Count of silence-triggered suggestions generated this session
     * @type {number}
     * @private
     */
    this._silenceSuggestionCount = 0;

    /**
     * Injected function that generates an autonomous suggestion.
     * Returns Promise<Suggestion|null>.
     * @type {function|null}
     * @private
     */
    this._generateSuggestionFn = null;

    /**
     * Consecutive suggestion generation failures (resets on success)
     * @type {number}
     * @private
     */
    this._consecutiveSuggestionFailures = 0;

    /**
     * Injected synchronous function that returns true when a live cycle is in flight.
     * When true, silence events are dropped entirely to prevent duplicate suggestions.
     * @type {function|null}
     * @private
     */
    this._isCycleInFlightFn = null;
  }

  // ---------------------------------------------------------------------------
  // Suggestion generation injection
  // ---------------------------------------------------------------------------

  /**
   * Sets the function used to generate autonomous suggestions.
   *
   * This is injected by AIAssistant so that SilenceMonitor does not need
   * to know about chat prompts, RAG context, or OpenAI internals.
   *
   * @param {function} fn - Async function returning Promise<Suggestion|null>
   */
  setGenerateSuggestionFn(fn) {
    this._generateSuggestionFn = fn;
  }

  /**
   * Sets the synchronous function used to check if a live cycle is in flight.
   *
   * When this function returns true, silence events are dropped entirely
   * to prevent duplicate suggestion generation.
   *
   * @param {function} fn - Synchronous function returning boolean
   */
  setIsCycleInFlightFn(fn) {
    this._isCycleInFlightFn = fn;
  }

  // ---------------------------------------------------------------------------
  // SilenceDetector management
  // ---------------------------------------------------------------------------

  /**
   * Sets the SilenceDetector instance for autonomous suggestion triggers
   *
   * If monitoring is currently active, it will be stopped first.
   *
   * @param {import('./SilenceDetector.mjs').SilenceDetector} silenceDetector - SilenceDetector instance
   */
  setSilenceDetector(silenceDetector) {
    // Stop any existing monitoring
    if (this._silenceMonitoringActive) {
      this.stopMonitoring();
    }

    this._silenceDetector = silenceDetector;
    this._logger.debug('SilenceDetector updated');
  }

  /**
   * Gets the SilenceDetector instance
   *
   * @returns {import('./SilenceDetector.mjs').SilenceDetector|null} The SilenceDetector instance or null
   */
  getSilenceDetector() {
    return this._silenceDetector;
  }

  // ---------------------------------------------------------------------------
  // Autonomous suggestion callback
  // ---------------------------------------------------------------------------

  /**
   * Sets the callback function for autonomous suggestions triggered by silence
   *
   * @param {function|null} callback - Callback receiving { suggestion, silenceEvent }, or null to clear
   */
  setOnAutonomousSuggestionCallback(callback) {
    if (callback === null || typeof callback === 'function') {
      this._onAutonomousSuggestionCallback = callback;
    } else {
      this._logger.warn('Invalid autonomous suggestion callback provided, ignoring');
    }
  }

  /**
   * Gets the autonomous suggestion callback
   *
   * @returns {function|null} The callback function or null
   */
  getOnAutonomousSuggestionCallback() {
    return this._onAutonomousSuggestionCallback;
  }

  // ---------------------------------------------------------------------------
  // Monitoring lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Starts silence monitoring for autonomous suggestion triggers
   *
   * Requires a SilenceDetector to be configured. The caller (AIAssistant) is
   * responsible for checking OpenAI client configuration before calling this.
   *
   * @returns {boolean} True if monitoring started successfully, false otherwise
   */
  startMonitoring() {
    if (!this._silenceDetector) {
      this._logger.warn('Cannot start silence monitoring: no SilenceDetector configured');
      return false;
    }

    if (this._silenceMonitoringActive) {
      this._logger.debug('Silence monitoring already active');
      return true;
    }

    // Create bound handler so we can remove it later
    this._boundSilenceHandler = this._handleSilenceEvent.bind(this);
    this._silenceDetector.setOnSilenceCallback(this._boundSilenceHandler);
    this._silenceDetector.start();
    this._silenceMonitoringActive = true;

    this._logger.info('Silence monitoring started');
    return true;
  }

  /**
   * Stops silence monitoring
   */
  stopMonitoring() {
    if (!this._silenceMonitoringActive) {
      this._logger.debug('Silence monitoring not active');
      return;
    }

    if (this._silenceDetector) {
      this._silenceDetector.stop();
      this._silenceDetector.setOnSilenceCallback(null);
    }

    this._silenceMonitoringActive = false;
    this._boundSilenceHandler = null;

    this._logger.info('Silence monitoring stopped');
  }

  /**
   * Records activity to reset the silence timer
   *
   * Call this when transcription is received to prevent silence-triggered suggestions.
   *
   * @returns {boolean} True if activity was recorded, false if monitoring not active
   */
  recordActivity() {
    if (!this._silenceMonitoringActive || !this._silenceDetector) {
      return false;
    }

    return this._silenceDetector.recordActivity();
  }

  // ---------------------------------------------------------------------------
  // State accessors
  // ---------------------------------------------------------------------------

  /**
   * Whether silence monitoring is currently active
   *
   * @returns {boolean} True if monitoring is active
   */
  get isMonitoring() {
    return this._silenceMonitoringActive;
  }

  /**
   * Number of silence-triggered suggestions generated this session
   *
   * @returns {number} The suggestion count
   */
  get silenceSuggestionCount() {
    return this._silenceSuggestionCount;
  }

  // ---------------------------------------------------------------------------
  // Private: Silence event handling
  // ---------------------------------------------------------------------------

  /**
   * Handles a silence event from SilenceDetector
   *
   * Generates an autonomous suggestion via the injected function and
   * invokes the callback if registered.
   *
   * @param {Object} silenceEvent - The silence event from SilenceDetector
   * @param {number} silenceEvent.silenceDurationMs - Duration of silence in milliseconds
   * @param {number} silenceEvent.lastActivityTime - Timestamp of the last recorded activity
   * @param {number} silenceEvent.silenceCount - Number of silence events since start
   * @private
   */
  async _handleSilenceEvent(silenceEvent) {
    // Cycle-in-flight guard: drop silence events when a live cycle is active
    if (this._isCycleInFlightFn?.()) {
      this._logger.debug('Silence event dropped: live cycle in flight');
      return;
    }

    this._logger.info(`Processing silence event #${silenceEvent.silenceCount} (${silenceEvent.silenceDurationMs}ms)`);

    if (!this._generateSuggestionFn) {
      this._logger.warn('Cannot generate autonomous suggestion: no suggestion function configured');
      return;
    }

    try {
      // Generate the suggestion via injected function
      const suggestion = await this._generateSuggestionFn();

      if (!suggestion) {
        this._logger.debug('No autonomous suggestion generated');
        return;
      }

      // Track the suggestion and reset failure counter
      this._silenceSuggestionCount++;
      this._consecutiveSuggestionFailures = 0;

      this._logger.info(`Generated autonomous suggestion: type=${suggestion.type}, confidence=${suggestion.confidence}`);

      // Invoke callback if registered
      if (this._onAutonomousSuggestionCallback) {
        try {
          this._onAutonomousSuggestionCallback({
            suggestion,
            silenceEvent: {
              silenceDurationMs: silenceEvent.silenceDurationMs,
              lastActivityTime: silenceEvent.lastActivityTime,
              silenceCount: silenceEvent.silenceCount
            }
          });
        } catch (callbackError) {
          this._logger.error('Error in autonomous suggestion callback:', callbackError);
        }
      }
    } catch (error) {
      this._logger.error('Failed to generate autonomous suggestion:', error);
      this._consecutiveSuggestionFailures++;
      if (this._consecutiveSuggestionFailures === 3) {
        globalThis.ui?.notifications?.warn(
          globalThis.game?.i18n?.localize('VOXCHRONICLE.Warnings.AutonomousSuggestionFailed')
            || 'VoxChronicle: Autonomous suggestions are failing repeatedly. Check your API key and connection.'
        );
      }
    }
  }
}

export { SilenceMonitor };
