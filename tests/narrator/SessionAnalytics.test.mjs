/**
 * SessionAnalytics Unit Tests
 *
 * Tests for the SessionAnalytics class covering session lifecycle,
 * speaker statistics, timeline generation, session summary, history
 * management, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  SessionAnalytics,
  DEFAULT_BUCKET_SIZE,
  MAX_HISTORY_SIZE
} from '../../scripts/narrator/SessionAnalytics.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal valid transcription segment.
 *
 * @param {string} speaker
 * @param {number} start
 * @param {number} end
 * @param {string} [text='']
 * @returns {Object}
 */
function makeSegment(speaker, start, end, text = '') {
  return { speaker, start, end, text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionAnalytics', () => {
  /** @type {SessionAnalytics} */
  let analytics;

  beforeEach(() => {
    analytics = new SessionAnalytics();
  });

  // =========================================================================
  // Construction & defaults
  // =========================================================================

  describe('constructor', () => {
    it('should use default bucket size and history size', () => {
      expect(analytics._bucketSize).toBe(DEFAULT_BUCKET_SIZE);
      expect(analytics._maxHistorySize).toBe(MAX_HISTORY_SIZE);
    });

    it('should accept custom options', () => {
      const custom = new SessionAnalytics({ bucketSize: 30, maxHistorySize: 5 });
      expect(custom._bucketSize).toBe(30);
      expect(custom._maxHistorySize).toBe(5);
    });

    it('should start with no active session', () => {
      expect(analytics.isSessionActive()).toBe(false);
      expect(analytics.getCurrentSessionId()).toBeNull();
    });
  });

  // =========================================================================
  // Session lifecycle
  // =========================================================================

  describe('startSession', () => {
    it('should create an active session with auto-generated ID', () => {
      const id = analytics.startSession();
      expect(id).toMatch(/^session-\d+$/);
      expect(analytics.isSessionActive()).toBe(true);
      expect(analytics.getCurrentSessionId()).toBe(id);
    });

    it('should accept a custom session ID', () => {
      const id = analytics.startSession('my-session');
      expect(id).toBe('my-session');
      expect(analytics.getCurrentSessionId()).toBe('my-session');
    });

    it('should end previous active session when starting a new one', () => {
      analytics.startSession('first');
      analytics.addSegment(makeSegment('Alice', 0, 5));

      // Starting a new session should end the first one
      analytics.startSession('second');

      expect(analytics.getCurrentSessionId()).toBe('second');
      // First session should be in history
      const history = analytics.getSessionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].metadata.sessionId).toBe('first');
    });

    it('should reset segments and metrics when starting a new session', () => {
      analytics.startSession('s1');
      analytics.addSegment(makeSegment('Alice', 0, 10));
      expect(analytics.getSegmentCount()).toBe(1);

      analytics.startSession('s2');
      expect(analytics.getSegmentCount()).toBe(0);
      expect(analytics.getSpeakerStats()).toHaveLength(0);
    });
  });

  describe('endSession', () => {
    it('should return null if no session is active', () => {
      expect(analytics.endSession()).toBeNull();
    });

    it('should return a valid session summary', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 10));

      const summary = analytics.endSession();

      expect(summary).not.toBeNull();
      expect(summary.metadata.sessionId).toBe('test');
      expect(summary.metadata.status).toBe('completed');
      expect(summary.metadata.endTime).toBeGreaterThan(0);
      expect(summary.metadata.duration).toBeGreaterThanOrEqual(0);
      expect(summary.speakerCount).toBe(1);
      expect(summary.totalSpeakingTime).toBe(10);
    });

    it('should clear the current session after ending', () => {
      analytics.startSession('test');
      analytics.endSession();

      expect(analytics.isSessionActive()).toBe(false);
      expect(analytics.getCurrentSessionId()).toBeNull();
    });

    it('should not end a paused session', () => {
      analytics.startSession('test');
      analytics.pauseSession();

      const result = analytics.endSession();
      expect(result).toBeNull();
    });

    it('should add completed session to history', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 5));
      analytics.endSession();

      const history = analytics.getSessionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].metadata.sessionId).toBe('test');
    });
  });

  describe('pauseSession / resumeSession', () => {
    it('should pause an active session', () => {
      analytics.startSession('test');
      analytics.pauseSession();

      expect(analytics.isSessionActive()).toBe(false);
      // Session still exists, just not active
      expect(analytics.getCurrentSessionId()).toBe('test');
    });

    it('should resume a paused session', () => {
      analytics.startSession('test');
      analytics.pauseSession();
      analytics.resumeSession();

      expect(analytics.isSessionActive()).toBe(true);
    });

    it('should not pause if no session is active', () => {
      // Should not throw
      analytics.pauseSession();
      expect(analytics.isSessionActive()).toBe(false);
    });

    it('should not resume if session is not paused', () => {
      analytics.startSession('test');
      // Already active, resume should be a no-op
      analytics.resumeSession();
      expect(analytics.isSessionActive()).toBe(true);
    });
  });

  // =========================================================================
  // Segment ingestion
  // =========================================================================

  describe('addSegment', () => {
    it('should add a valid segment', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 5, 'Hello'));

      expect(analytics.getSegmentCount()).toBe(1);
    });

    it('should reject segment without active session', () => {
      // No session started
      analytics.addSegment(makeSegment('Alice', 0, 5));
      // Should not throw, segment is discarded
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject null segment', () => {
      analytics.startSession('test');
      analytics.addSegment(null);
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject segment without speaker', () => {
      analytics.startSession('test');
      analytics.addSegment({ start: 0, end: 5 });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject segment with non-numeric start', () => {
      analytics.startSession('test');
      analytics.addSegment({ speaker: 'Alice', start: 'zero', end: 5 });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject segment with non-numeric end', () => {
      analytics.startSession('test');
      analytics.addSegment({ speaker: 'Alice', start: 0, end: null });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should accumulate speaking time for the same speaker', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 5));
      analytics.addSegment(makeSegment('Alice', 10, 20));

      const stats = analytics.getSpeakerStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].speakingTime).toBe(15); // 5 + 10
      expect(stats[0].segmentCount).toBe(2);
    });

    it('should track first and last speak times correctly', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 10, 15));
      analytics.addSegment(makeSegment('Alice', 2, 5));
      analytics.addSegment(makeSegment('Alice', 20, 25));

      const stats = analytics.getSpeakerStats();
      expect(stats[0].firstSpeakTime).toBe(2);
      expect(stats[0].lastSpeakTime).toBe(25);
    });
  });

  // =========================================================================
  // Speaker stats calculation
  // =========================================================================

  describe('getSpeakerStats', () => {
    it('should return empty array with no segments', () => {
      analytics.startSession('test');
      expect(analytics.getSpeakerStats()).toEqual([]);
    });

    it('should sort speakers by speaking time descending', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 5));     // 5s
      analytics.addSegment(makeSegment('Bob', 0, 20));       // 20s
      analytics.addSegment(makeSegment('Charlie', 0, 10));   // 10s

      const stats = analytics.getSpeakerStats();
      expect(stats[0].speakerId).toBe('Bob');
      expect(stats[1].speakerId).toBe('Charlie');
      expect(stats[2].speakerId).toBe('Alice');
    });

    it('should calculate participation percentages correctly', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 30));   // 30s
      analytics.addSegment(makeSegment('Bob', 30, 100));    // 70s

      const stats = analytics.getSpeakerStats();
      // Bob: 70%  Alice: 30%
      expect(stats[0].speakerId).toBe('Bob');
      expect(stats[0].percentage).toBeCloseTo(70, 1);
      expect(stats[1].speakerId).toBe('Alice');
      expect(stats[1].percentage).toBeCloseTo(30, 1);
    });

    it('should calculate average segment duration', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 10));   // 10s
      analytics.addSegment(makeSegment('Alice', 20, 40));  // 20s
      // Total: 30s over 2 segments => avg 15s

      const stats = analytics.getSpeakerStats();
      expect(stats[0].avgSegmentDuration).toBeCloseTo(15, 1);
    });
  });

  // =========================================================================
  // Timeline generation
  // =========================================================================

  describe('getTimeline', () => {
    it('should return empty array with no segments', () => {
      analytics.startSession('test');
      expect(analytics.getTimeline()).toEqual([]);
    });

    it('should create a single bucket for a short segment', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 5, 10));

      const timeline = analytics.getTimeline();
      expect(timeline).toHaveLength(1);
      expect(timeline[0].timestamp).toBe(0); // Floor(5/60)*60 = 0
      expect(timeline[0].speakers['Alice']).toBe(5);
      expect(timeline[0].totalActivity).toBe(5);
    });

    it('should split a segment across multiple buckets', () => {
      analytics.startSession('test');
      // Segment from 50s to 70s spans bucket [0,60) and [60,120)
      analytics.addSegment(makeSegment('Alice', 50, 70));

      const timeline = analytics.getTimeline();
      expect(timeline).toHaveLength(2);

      // First bucket [0, 60): overlap is 50-60 = 10s
      expect(timeline[0].timestamp).toBe(0);
      expect(timeline[0].speakers['Alice']).toBeCloseTo(10, 5);

      // Second bucket [60, 120): overlap is 60-70 = 10s
      expect(timeline[1].timestamp).toBe(60);
      expect(timeline[1].speakers['Alice']).toBeCloseTo(10, 5);
    });

    it('should respect custom bucket size', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 25));

      // With bucket size of 10: buckets at 0, 10, 20
      const timeline = analytics.getTimeline(10);
      expect(timeline).toHaveLength(3);
      expect(timeline[0].timestamp).toBe(0);
      expect(timeline[1].timestamp).toBe(10);
      expect(timeline[2].timestamp).toBe(20);
    });

    it('should aggregate multiple speakers in the same bucket', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 5, 15));
      analytics.addSegment(makeSegment('Bob', 20, 30));

      const timeline = analytics.getTimeline();
      // Both are within [0, 60) bucket
      expect(timeline).toHaveLength(1);
      expect(timeline[0].speakers['Alice']).toBe(10);
      expect(timeline[0].speakers['Bob']).toBe(10);
      expect(timeline[0].totalActivity).toBe(20);
    });

    it('should sort buckets chronologically', () => {
      analytics.startSession('test');
      // Add segments in reverse chronological order
      analytics.addSegment(makeSegment('Alice', 120, 130));
      analytics.addSegment(makeSegment('Alice', 0, 10));

      const timeline = analytics.getTimeline();
      expect(timeline.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].timestamp).toBeGreaterThan(timeline[i - 1].timestamp);
      }
    });
  });

  // =========================================================================
  // Session summary
  // =========================================================================

  describe('getSessionSummary', () => {
    it('should return null when no session exists', () => {
      expect(analytics.getSessionSummary()).toBeNull();
    });

    it('should return a complete summary structure', () => {
      analytics.startSession('summary-test');
      analytics.addSegment(makeSegment('Alice', 0, 30));
      analytics.addSegment(makeSegment('Bob', 30, 50));

      const summary = analytics.getSessionSummary();

      // Metadata
      expect(summary.metadata.sessionId).toBe('summary-test');
      expect(summary.metadata.status).toBe('active');

      // Speaker data
      expect(summary.speakerCount).toBe(2);
      expect(summary.totalSpeakingTime).toBe(50); // 30 + 20

      // Dominant/quietest
      expect(summary.dominantSpeaker).toBe('Alice');
      expect(summary.quietestSpeaker).toBe('Bob');

      // Timeline present
      expect(Array.isArray(summary.timeline)).toBe(true);
    });

    it('should identify dominant and quietest speakers correctly', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('GM', 0, 60));       // 60s - dominant
      analytics.addSegment(makeSegment('Player1', 60, 80));  // 20s
      analytics.addSegment(makeSegment('Player2', 80, 85));  // 5s - quietest

      const summary = analytics.getSessionSummary();
      expect(summary.dominantSpeaker).toBe('GM');
      expect(summary.quietestSpeaker).toBe('Player2');
    });
  });

  // =========================================================================
  // History management
  // =========================================================================

  describe('getSessionHistory', () => {
    it('should return empty array initially', () => {
      expect(analytics.getSessionHistory()).toEqual([]);
    });

    it('should store completed sessions in most-recent-first order', () => {
      analytics.startSession('first');
      analytics.addSegment(makeSegment('Alice', 0, 5));
      analytics.endSession();

      analytics.startSession('second');
      analytics.addSegment(makeSegment('Bob', 0, 5));
      analytics.endSession();

      const history = analytics.getSessionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].metadata.sessionId).toBe('second');
      expect(history[1].metadata.sessionId).toBe('first');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        analytics.startSession(`session-${i}`);
        analytics.addSegment(makeSegment('Alice', 0, 1));
        analytics.endSession();
      }

      const limited = analytics.getSessionHistory(2);
      expect(limited).toHaveLength(2);
    });

    it('should trim history to maxHistorySize', () => {
      const small = new SessionAnalytics({ maxHistorySize: 3 });

      for (let i = 0; i < 5; i++) {
        small.startSession(`session-${i}`);
        small.addSegment(makeSegment('Alice', 0, 1));
        small.endSession();
      }

      const history = small.getSessionHistory();
      expect(history).toHaveLength(3);
      // Most recent should be session-4
      expect(history[0].metadata.sessionId).toBe('session-4');
    });
  });

  // =========================================================================
  // State management & reset
  // =========================================================================

  describe('clearCurrentSession', () => {
    it('should clear session without saving to history', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 10));

      analytics.clearCurrentSession();

      expect(analytics.isSessionActive()).toBe(false);
      expect(analytics.getCurrentSessionId()).toBeNull();
      expect(analytics.getSegmentCount()).toBe(0);
      expect(analytics.getSessionHistory()).toHaveLength(0);
    });
  });

  describe('clearHistory', () => {
    it('should clear all session history', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 5));
      analytics.endSession();

      expect(analytics.getSessionHistory()).toHaveLength(1);

      analytics.clearHistory();
      expect(analytics.getSessionHistory()).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('should clear both current session and history', () => {
      // Build up some state
      analytics.startSession('first');
      analytics.addSegment(makeSegment('Alice', 0, 5));
      analytics.endSession();

      analytics.startSession('second');
      analytics.addSegment(makeSegment('Bob', 0, 10));

      // Reset everything
      analytics.reset();

      expect(analytics.isSessionActive()).toBe(false);
      expect(analytics.getCurrentSessionId()).toBeNull();
      expect(analytics.getSegmentCount()).toBe(0);
      expect(analytics.getSessionHistory()).toHaveLength(0);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle a single speaker session', () => {
      analytics.startSession('solo');
      analytics.addSegment(makeSegment('GM', 0, 100));

      const summary = analytics.getSessionSummary();
      expect(summary.speakerCount).toBe(1);
      expect(summary.dominantSpeaker).toBe('GM');
      expect(summary.quietestSpeaker).toBe('GM');
      expect(summary.speakers['GM'].percentage).toBeCloseTo(100, 1);
    });

    it('should handle zero-duration segments', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 5, 5)); // 0 duration

      const stats = analytics.getSpeakerStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].speakingTime).toBe(0);
      expect(stats[0].segmentCount).toBe(1);
    });

    it('should handle session with no segments (empty summary)', () => {
      analytics.startSession('empty');
      const summary = analytics.getSessionSummary();

      expect(summary.speakerCount).toBe(0);
      expect(summary.totalSpeakingTime).toBe(0);
      expect(summary.dominantSpeaker).toBeNull();
      expect(summary.quietestSpeaker).toBeNull();
      expect(summary.timeline).toEqual([]);
    });

    it('should handle many speakers', () => {
      analytics.startSession('crowded');
      for (let i = 0; i < 20; i++) {
        analytics.addSegment(makeSegment(`Speaker_${i}`, i * 10, i * 10 + 5));
      }

      const stats = analytics.getSpeakerStats();
      expect(stats).toHaveLength(20);

      // All speakers should have 5s speaking time
      for (const s of stats) {
        expect(s.speakingTime).toBe(5);
      }
    });

    it('should handle overlapping segments from different speakers', () => {
      analytics.startSession('overlap');
      analytics.addSegment(makeSegment('Alice', 0, 20));
      analytics.addSegment(makeSegment('Bob', 10, 30));

      const summary = analytics.getSessionSummary();
      // Total speaking time is sum of individual times (overlaps not deducted)
      expect(summary.totalSpeakingTime).toBe(40); // 20 + 20
    });

    it('should export constants with expected values', () => {
      expect(DEFAULT_BUCKET_SIZE).toBe(60);
      expect(MAX_HISTORY_SIZE).toBe(100);
    });

    it('getCurrentMetrics should return a copy, not a reference', () => {
      analytics.startSession('test');
      analytics.addSegment(makeSegment('Alice', 0, 10));

      const metrics = analytics.getCurrentMetrics();
      metrics['Alice'] = null; // Mutate the copy

      // Original should be unaffected
      const stats = analytics.getSpeakerStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].speakerId).toBe('Alice');
    });
  });
});
