/**
 * Session Analytics Module for VoxChronicle
 *
 * Tracks speaker engagement metrics, session timeline, and player participation.
 * Processes transcription segments to calculate speaking time, participation
 * percentages, and session pacing distribution.
 *
 * Ported from Narrator Master's session-analytics.js.
 *
 * @module vox-chronicle/narrator
 */

import { Logger } from '../utils/Logger.mjs';
import { MODULE_ID } from '../constants.mjs';

/**
 * Default bucket size for timeline visualization (60 seconds)
 * @constant {number}
 */
export const DEFAULT_BUCKET_SIZE = 60;

/**
 * Maximum number of sessions to keep in history
 * @constant {number}
 */
export const MAX_HISTORY_SIZE = 100;

/** @type {ReturnType<typeof Logger.createChild>} */
const log = Logger.createChild('SessionAnalytics');

/**
 * @typedef {Object} SpeakerMetrics
 * @property {string} speakerId - The speaker identifier
 * @property {number} speakingTime - Total speaking time in seconds
 * @property {number} segmentCount - Number of segments spoken
 * @property {number} avgSegmentDuration - Average segment duration in seconds
 * @property {number} percentage - Percentage of total session speaking time
 * @property {number} firstSpeakTime - Timestamp of first speech
 * @property {number} lastSpeakTime - Timestamp of last speech
 */

/**
 * @typedef {Object} TimelineBucket
 * @property {number} timestamp - Start timestamp of the bucket
 * @property {Object.<string, number>} speakers - Map of speakerId to speaking duration in this bucket
 * @property {number} totalActivity - Total speaking time across all speakers in this bucket
 */

/**
 * @typedef {Object} SessionMetadata
 * @property {string} sessionId - Unique session identifier
 * @property {number} startTime - Session start timestamp (ms since epoch)
 * @property {number|null} endTime - Session end timestamp (null if active)
 * @property {number} duration - Total session duration in seconds
 * @property {string} status - Session status ('active', 'completed', 'paused')
 */

/**
 * @typedef {Object} SessionSummary
 * @property {SessionMetadata} metadata - Session metadata
 * @property {Object.<string, SpeakerMetrics>} speakers - Map of speakerId to metrics
 * @property {number} totalSpeakingTime - Total speaking time across all speakers (seconds)
 * @property {number} speakerCount - Number of unique speakers
 * @property {string|null} dominantSpeaker - Speaker ID with most speaking time
 * @property {string|null} quietestSpeaker - Speaker ID with least speaking time
 * @property {TimelineBucket[]} timeline - Session timeline data
 */

/**
 * @typedef {Object} TranscriptionSegment
 * @property {string} speaker - The identified speaker name or ID
 * @property {string} [text] - The transcribed text for this segment
 * @property {number} start - Start time in seconds (relative to session)
 * @property {number} end - End time in seconds (relative to session)
 */

/**
 * SessionAnalytics — Tracks and analyzes player engagement metrics during sessions.
 *
 * Processes transcription segments to calculate speaking time, participation
 * percentages, and session pacing. Supports session lifecycle management
 * (start/pause/resume/end), persistent history, and timeline generation.
 *
 * @export
 * @class SessionAnalytics
 */
export class SessionAnalytics {
  /**
   * Creates a new SessionAnalytics instance.
   *
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.bucketSize=60] - Timeline bucket size in seconds
   * @param {number} [options.maxHistorySize=100] - Maximum sessions to keep in history
   */
  constructor(options = {}) {
    /**
     * Timeline bucket size in seconds
     * @type {number}
     * @private
     */
    this._bucketSize = options.bucketSize || DEFAULT_BUCKET_SIZE;

    /**
     * Maximum history size
     * @type {number}
     * @private
     */
    this._maxHistorySize = options.maxHistorySize || MAX_HISTORY_SIZE;

    /**
     * Current session metadata
     * @type {SessionMetadata|null}
     * @private
     */
    this._currentSession = null;

    /**
     * Current session speaker metrics
     * @type {Object.<string, SpeakerMetrics>}
     * @private
     */
    this._speakerMetrics = {};

    /**
     * Raw segment data for the current session
     * @type {TranscriptionSegment[]}
     * @private
     */
    this._segments = [];

    /**
     * Session history (most recent first)
     * @type {SessionSummary[]}
     * @private
     */
    this._sessionHistory = [];

    /**
     * Session start timestamp offset (for relative timing)
     * @type {number|null}
     * @private
     */
    this._sessionStartOffset = null;
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Starts a new analytics session.
   *
   * If a session is already active it will be ended first (and saved to
   * history) before the new session begins.
   *
   * @param {string} [sessionId] - Optional session ID (auto-generated if not provided)
   * @returns {string} The session ID
   */
  startSession(sessionId = null) {
    // End any active session first
    if (this._currentSession && this._currentSession.status === 'active') {
      log.info('Ending previous active session before starting new one');
      this.endSession();
    }

    const id = sessionId || `session-${Date.now()}`;
    const now = Date.now();

    this._currentSession = {
      sessionId: id,
      startTime: now,
      endTime: null,
      duration: 0,
      status: 'active'
    };

    this._sessionStartOffset = now;
    this._speakerMetrics = {};
    this._segments = [];

    log.info(`Session started: ${id}`);
    return id;
  }

  /**
   * Ends the current session and saves it to history.
   *
   * @returns {SessionSummary|null} The completed session summary, or null if no active session
   */
  endSession() {
    if (!this._currentSession || this._currentSession.status !== 'active') {
      log.warn('No active session to end');
      return null;
    }

    const now = Date.now();
    this._currentSession.endTime = now;
    this._currentSession.duration = (now - this._currentSession.startTime) / 1000;
    this._currentSession.status = 'completed';

    // Calculate final metrics
    this._calculateMetrics();

    // Create session summary
    const summary = this.getSessionSummary();

    // Add to history (most recent first)
    this._sessionHistory.unshift(summary);

    // Trim history if needed
    if (this._sessionHistory.length > this._maxHistorySize) {
      this._sessionHistory = this._sessionHistory.slice(0, this._maxHistorySize);
    }

    log.info(`Session ended: ${this._currentSession.sessionId} (${this._currentSession.duration.toFixed(1)}s)`);

    // Reset current session
    this._currentSession = null;
    this._sessionStartOffset = null;

    return summary;
  }

  /**
   * Pauses the current session.
   */
  pauseSession() {
    if (this._currentSession && this._currentSession.status === 'active') {
      this._currentSession.status = 'paused';
      log.info('Session paused');
    }
  }

  /**
   * Resumes a paused session.
   */
  resumeSession() {
    if (this._currentSession && this._currentSession.status === 'paused') {
      this._currentSession.status = 'active';
      log.info('Session resumed');
    }
  }

  // ---------------------------------------------------------------------------
  // Segment ingestion
  // ---------------------------------------------------------------------------

  /**
   * Adds a transcription segment to the current session.
   *
   * The segment must have at least `speaker`, `start`, and `end` properties.
   * If no session is active or the segment is invalid, a warning is logged
   * and the segment is discarded.
   *
   * @param {TranscriptionSegment} segment - The segment to add
   */
  addSegment(segment) {
    if (!this._currentSession) {
      log.warn('Cannot add segment without active session');
      return;
    }

    if (
      !segment ||
      !segment.speaker ||
      typeof segment.start !== 'number' ||
      typeof segment.end !== 'number'
    ) {
      log.warn('Invalid segment data', segment);
      return;
    }

    this._segments.push(segment);

    // Initialize speaker metrics if this is a new speaker
    if (!this._speakerMetrics[segment.speaker]) {
      this._speakerMetrics[segment.speaker] = {
        speakerId: segment.speaker,
        speakingTime: 0,
        segmentCount: 0,
        avgSegmentDuration: 0,
        percentage: 0,
        firstSpeakTime: segment.start,
        lastSpeakTime: segment.end
      };
    }

    // Update speaker metrics incrementally
    const metrics = this._speakerMetrics[segment.speaker];
    const duration = segment.end - segment.start;

    metrics.speakingTime += duration;
    metrics.segmentCount += 1;
    metrics.lastSpeakTime = Math.max(metrics.lastSpeakTime, segment.end);
    metrics.firstSpeakTime = Math.min(metrics.firstSpeakTime, segment.start);
  }

  // ---------------------------------------------------------------------------
  // Metrics & queries
  // ---------------------------------------------------------------------------

  /**
   * Recalculates derived metrics (percentages, averages) for all speakers.
   * Called automatically when ending a session or fetching a summary.
   *
   * @private
   */
  _calculateMetrics() {
    if (!this._currentSession) {
      return;
    }

    const totalSpeakingTime = Object.values(this._speakerMetrics).reduce(
      (sum, m) => sum + m.speakingTime,
      0
    );

    for (const speakerId in this._speakerMetrics) {
      const metrics = this._speakerMetrics[speakerId];
      metrics.avgSegmentDuration =
        metrics.segmentCount > 0 ? metrics.speakingTime / metrics.segmentCount : 0;
      metrics.percentage =
        totalSpeakingTime > 0 ? (metrics.speakingTime / totalSpeakingTime) * 100 : 0;
    }
  }

  /**
   * Returns speaker statistics sorted by speaking time (descending).
   *
   * @returns {SpeakerMetrics[]} Array of speaker metrics
   */
  getSpeakerStats() {
    // Ensure metrics are up-to-date
    this._calculateMetrics();
    return Object.values(this._speakerMetrics).sort(
      (a, b) => b.speakingTime - a.speakingTime
    );
  }

  /**
   * Returns a shallow copy of the current speaker metrics map.
   *
   * @returns {Object.<string, SpeakerMetrics>} Map of speakerId to metrics
   */
  getCurrentMetrics() {
    return { ...this._speakerMetrics };
  }

  /**
   * Generates timeline data with activity distribution across time buckets.
   *
   * Each bucket covers `bucketSize` seconds and contains a breakdown of
   * speaking time per speaker as well as total activity within that window.
   *
   * @param {number} [bucketSize] - Override bucket size in seconds (defaults to instance setting)
   * @returns {TimelineBucket[]} Array of timeline buckets sorted chronologically
   */
  getTimeline(bucketSize = null) {
    const size = bucketSize || this._bucketSize;
    const buckets = new Map();

    for (const segment of this._segments) {
      const startBucket = Math.floor(segment.start / size) * size;
      const endBucket = Math.floor(segment.end / size) * size;

      for (let bucketStart = startBucket; bucketStart <= endBucket; bucketStart += size) {
        if (!buckets.has(bucketStart)) {
          buckets.set(bucketStart, {
            timestamp: bucketStart,
            speakers: {},
            totalActivity: 0
          });
        }

        const bucket = buckets.get(bucketStart);
        const bucketEnd = bucketStart + size;

        // Calculate overlap between segment and bucket
        const overlapStart = Math.max(segment.start, bucketStart);
        const overlapEnd = Math.min(segment.end, bucketEnd);
        const overlapDuration = Math.max(0, overlapEnd - overlapStart);

        if (!bucket.speakers[segment.speaker]) {
          bucket.speakers[segment.speaker] = 0;
        }

        bucket.speakers[segment.speaker] += overlapDuration;
        bucket.totalActivity += overlapDuration;
      }
    }

    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Returns a complete summary of the current (or most recently completed) session.
   *
   * @returns {SessionSummary|null} The session summary, or null if no session exists
   */
  getSessionSummary() {
    if (!this._currentSession) {
      return null;
    }

    this._calculateMetrics();

    const speakerStats = this.getSpeakerStats();
    const totalSpeakingTime = speakerStats.reduce((sum, s) => sum + s.speakingTime, 0);

    return {
      metadata: { ...this._currentSession },
      speakers: { ...this._speakerMetrics },
      totalSpeakingTime,
      speakerCount: speakerStats.length,
      dominantSpeaker: speakerStats.length > 0 ? speakerStats[0].speakerId : null,
      quietestSpeaker:
        speakerStats.length > 0 ? speakerStats[speakerStats.length - 1].speakerId : null,
      timeline: this.getTimeline()
    };
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  /**
   * Returns the session history (most recent first).
   *
   * @param {number} [limit] - Maximum number of sessions to return (all if omitted)
   * @returns {SessionSummary[]} Array of session summaries
   */
  getSessionHistory(limit = null) {
    if (limit && limit > 0) {
      return this._sessionHistory.slice(0, limit);
    }
    return [...this._sessionHistory];
  }

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  /**
   * Clears the current session data without saving to history.
   */
  clearCurrentSession() {
    this._currentSession = null;
    this._sessionStartOffset = null;
    this._speakerMetrics = {};
    this._segments = [];
  }

  /**
   * Clears all session history.
   */
  clearHistory() {
    this._sessionHistory = [];
  }

  /**
   * Resets the entire instance to its initial state.
   * Clears the current session and all history.
   */
  reset() {
    this.clearCurrentSession();
    this.clearHistory();
    log.info('SessionAnalytics reset');
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  /**
   * Checks if a session is currently active.
   *
   * @returns {boolean} True if a session is active
   */
  isSessionActive() {
    return this._currentSession !== null && this._currentSession.status === 'active';
  }

  /**
   * Returns the current session ID.
   *
   * @returns {string|null} The session ID or null if no session
   */
  getCurrentSessionId() {
    return this._currentSession ? this._currentSession.sessionId : null;
  }

  /**
   * Returns the number of segments in the current session.
   *
   * @returns {number} Segment count
   */
  getSegmentCount() {
    return this._segments.length;
  }
}
