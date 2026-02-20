import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionAnalytics,
  DEFAULT_BUCKET_SIZE,
  MAX_HISTORY_SIZE
} from '../../scripts/narrator/SessionAnalytics.mjs';

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

describe('SessionAnalytics', () => {
  let analytics;

  beforeEach(() => {
    analytics = new SessionAnalytics();
  });

  // =========================================================================
  // Exports
  // =========================================================================
  describe('exports', () => {
    it('should export the SessionAnalytics class', () => {
      expect(SessionAnalytics).toBeDefined();
      expect(typeof SessionAnalytics).toBe('function');
    });

    it('should export DEFAULT_BUCKET_SIZE constant', () => {
      expect(DEFAULT_BUCKET_SIZE).toBeDefined();
      expect(DEFAULT_BUCKET_SIZE).toBe(60);
    });

    it('should export MAX_HISTORY_SIZE constant', () => {
      expect(MAX_HISTORY_SIZE).toBeDefined();
      expect(MAX_HISTORY_SIZE).toBe(100);
    });
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should create an instance with default options', () => {
      expect(analytics).toBeInstanceOf(SessionAnalytics);
    });

    it('should use default bucket size of 60', () => {
      expect(analytics._bucketSize).toBe(DEFAULT_BUCKET_SIZE);
    });

    it('should accept custom bucket size', () => {
      const a = new SessionAnalytics({ bucketSize: 30 });
      expect(a._bucketSize).toBe(30);
    });

    it('should use default max history size of 100', () => {
      expect(analytics._maxHistorySize).toBe(MAX_HISTORY_SIZE);
    });

    it('should accept custom max history size', () => {
      const a = new SessionAnalytics({ maxHistorySize: 50 });
      expect(a._maxHistorySize).toBe(50);
    });

    it('should start with no active session', () => {
      expect(analytics.isSessionActive()).toBe(false);
      expect(analytics.getCurrentSessionId()).toBeNull();
    });

    it('should start with empty segments', () => {
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should start with empty history', () => {
      expect(analytics.getSessionHistory()).toEqual([]);
    });
  });

  // =========================================================================
  // Session Lifecycle: startSession
  // =========================================================================
  describe('startSession', () => {
    it('should start a session and return the session ID', () => {
      const id = analytics.startSession('test-session-1');
      expect(id).toBe('test-session-1');
    });

    it('should auto-generate session ID if not provided', () => {
      const id = analytics.startSession();
      expect(id).toMatch(/^session-/);
    });

    it('should mark session as active', () => {
      analytics.startSession();
      expect(analytics.isSessionActive()).toBe(true);
    });

    it('should set start time', () => {
      analytics.startSession();
      expect(analytics._currentSession.startTime).toBeDefined();
      expect(typeof analytics._currentSession.startTime).toBe('number');
    });

    it('should reset speaker metrics', () => {
      analytics.startSession('s1');
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.startSession('s2');
      expect(analytics.getSpeakerStats()).toEqual([]);
    });

    it('should reset segments', () => {
      analytics.startSession('s1');
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.startSession('s2');
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should end previous active session before starting new one', () => {
      analytics.startSession('s1');
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.startSession('s2');
      // s1 should be in history
      const history = analytics.getSessionHistory();
      expect(history.length).toBe(1);
      expect(history[0].metadata.sessionId).toBe('s1');
    });

    it('should set session status to active', () => {
      analytics.startSession();
      expect(analytics._currentSession.status).toBe('active');
    });

    it('should set endTime to null', () => {
      analytics.startSession();
      expect(analytics._currentSession.endTime).toBeNull();
    });

    it('should set duration to 0', () => {
      analytics.startSession();
      expect(analytics._currentSession.duration).toBe(0);
    });
  });

  // =========================================================================
  // Session Lifecycle: endSession
  // =========================================================================
  describe('endSession', () => {
    it('should return null if no active session', () => {
      const result = analytics.endSession();
      expect(result).toBeNull();
    });

    it('should save paused session to history when endSession is called', () => {
      analytics.startSession('paused-test');
      analytics.addSegment({ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 5 });
      analytics.pauseSession();
      const summary = analytics.endSession();
      expect(summary).not.toBeNull();
      expect(summary.metadata.sessionId).toBe('paused-test');
      expect(summary.metadata.status).toBe('completed');
      expect(summary.speakerCount).toBeGreaterThanOrEqual(1);
    });

    it('should return a session summary', () => {
      analytics.startSession('test');
      const summary = analytics.endSession();
      expect(summary).toBeDefined();
      expect(summary.metadata).toBeDefined();
      expect(summary.metadata.sessionId).toBe('test');
      expect(summary.metadata.status).toBe('completed');
    });

    it('should set endTime', () => {
      analytics.startSession();
      const summary = analytics.endSession();
      expect(summary.metadata.endTime).toBeDefined();
      expect(typeof summary.metadata.endTime).toBe('number');
    });

    it('should calculate duration', () => {
      analytics.startSession();
      const summary = analytics.endSession();
      expect(summary.metadata.duration).toBeGreaterThanOrEqual(0);
    });

    it('should add session to history', () => {
      analytics.startSession('s1');
      analytics.endSession();
      const history = analytics.getSessionHistory();
      expect(history.length).toBe(1);
      expect(history[0].metadata.sessionId).toBe('s1');
    });

    it('should add sessions to history most recent first', () => {
      analytics.startSession('s1');
      analytics.endSession();
      analytics.startSession('s2');
      analytics.endSession();
      const history = analytics.getSessionHistory();
      expect(history[0].metadata.sessionId).toBe('s2');
      expect(history[1].metadata.sessionId).toBe('s1');
    });

    it('should clear current session after ending', () => {
      analytics.startSession();
      analytics.endSession();
      expect(analytics.isSessionActive()).toBe(false);
      expect(analytics.getCurrentSessionId()).toBeNull();
    });

    it('should trim history when exceeding max size', () => {
      const a = new SessionAnalytics({ maxHistorySize: 3 });
      for (let i = 0; i < 5; i++) {
        a.startSession(`s${i}`);
        a.endSession();
      }
      expect(a.getSessionHistory().length).toBe(3);
    });

    it('should include speaker data in summary', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 10 });
      const summary = analytics.endSession();
      expect(summary.speakerCount).toBe(2);
      expect(summary.speakers['Alice']).toBeDefined();
      expect(summary.speakers['Bob']).toBeDefined();
    });
  });

  // =========================================================================
  // Session Lifecycle: pauseSession / resumeSession
  // =========================================================================
  describe('pauseSession', () => {
    it('should pause an active session', () => {
      analytics.startSession();
      analytics.pauseSession();
      expect(analytics._currentSession.status).toBe('paused');
    });

    it('should do nothing if no session', () => {
      analytics.pauseSession(); // should not throw
      expect(analytics.isSessionActive()).toBe(false);
    });

    it('should do nothing if session is not active', () => {
      analytics.startSession();
      analytics.pauseSession();
      analytics.pauseSession(); // double pause
      expect(analytics._currentSession.status).toBe('paused');
    });

    it('should make isSessionActive return false', () => {
      analytics.startSession();
      analytics.pauseSession();
      expect(analytics.isSessionActive()).toBe(false);
    });
  });

  describe('resumeSession', () => {
    it('should resume a paused session', () => {
      analytics.startSession();
      analytics.pauseSession();
      analytics.resumeSession();
      expect(analytics._currentSession.status).toBe('active');
      expect(analytics.isSessionActive()).toBe(true);
    });

    it('should do nothing if no session', () => {
      analytics.resumeSession(); // should not throw
      expect(analytics.isSessionActive()).toBe(false);
    });

    it('should do nothing if session is active (not paused)', () => {
      analytics.startSession();
      analytics.resumeSession(); // already active
      expect(analytics._currentSession.status).toBe('active');
    });
  });

  // =========================================================================
  // addSegment
  // =========================================================================
  describe('addSegment', () => {
    beforeEach(() => {
      analytics.startSession();
    });

    it('should add a valid segment', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      expect(analytics.getSegmentCount()).toBe(1);
    });

    it('should reject segment without active session', () => {
      analytics.endSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject null segment', () => {
      analytics.addSegment(null);
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject segment without speaker', () => {
      analytics.addSegment({ start: 0, end: 5 });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject segment without start', () => {
      analytics.addSegment({ speaker: 'Alice', end: 5 });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject segment without end', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0 });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject segment with non-number start', () => {
      analytics.addSegment({ speaker: 'Alice', start: 'zero', end: 5 });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should reject segment with non-number end', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 'five' });
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should initialize speaker metrics for new speaker', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      const metrics = analytics.getCurrentMetrics();
      expect(metrics['Alice']).toBeDefined();
      expect(metrics['Alice'].speakerId).toBe('Alice');
    });

    it('should update speaking time incrementally', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Alice', start: 10, end: 20 });
      const metrics = analytics.getCurrentMetrics();
      expect(metrics['Alice'].speakingTime).toBe(15);
    });

    it('should update segment count', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Alice', start: 10, end: 20 });
      const metrics = analytics.getCurrentMetrics();
      expect(metrics['Alice'].segmentCount).toBe(2);
    });

    it('should track firstSpeakTime', () => {
      analytics.addSegment({ speaker: 'Alice', start: 10, end: 15 });
      analytics.addSegment({ speaker: 'Alice', start: 5, end: 8 });
      const metrics = analytics.getCurrentMetrics();
      expect(metrics['Alice'].firstSpeakTime).toBe(5);
    });

    it('should track lastSpeakTime', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Alice', start: 10, end: 20 });
      const metrics = analytics.getCurrentMetrics();
      expect(metrics['Alice'].lastSpeakTime).toBe(20);
    });

    it('should handle multiple speakers', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 10 });
      analytics.addSegment({ speaker: 'Charlie', start: 10, end: 15 });
      const metrics = analytics.getCurrentMetrics();
      expect(Object.keys(metrics).length).toBe(3);
    });

    it('should accept segment with text property', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5, text: 'Hello world' });
      expect(analytics.getSegmentCount()).toBe(1);
    });
  });

  // =========================================================================
  // getSpeakerStats
  // =========================================================================
  describe('getSpeakerStats', () => {
    beforeEach(() => {
      analytics.startSession();
    });

    it('should return empty array when no segments', () => {
      expect(analytics.getSpeakerStats()).toEqual([]);
    });

    it('should return speakers sorted by speaking time (descending)', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 15 });
      const stats = analytics.getSpeakerStats();
      expect(stats[0].speakerId).toBe('Bob');
      expect(stats[1].speakerId).toBe('Alice');
    });

    it('should calculate percentages', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 15 });
      const stats = analytics.getSpeakerStats();
      const totalTime = 15;
      expect(stats[0].percentage).toBeCloseTo((10 / totalTime) * 100, 1);
      expect(stats[1].percentage).toBeCloseTo((5 / totalTime) * 100, 1);
    });

    it('should calculate average segment duration', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Alice', start: 10, end: 20 });
      const stats = analytics.getSpeakerStats();
      expect(stats[0].avgSegmentDuration).toBe(7.5); // 15 / 2
    });
  });

  // =========================================================================
  // getCurrentMetrics
  // =========================================================================
  describe('getCurrentMetrics', () => {
    it('should return empty object when no session', () => {
      expect(analytics.getCurrentMetrics()).toEqual({});
    });

    it('should return a shallow copy', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      const m1 = analytics.getCurrentMetrics();
      const m2 = analytics.getCurrentMetrics();
      expect(m1).toEqual(m2);
      expect(m1).not.toBe(m2);
    });
  });

  // =========================================================================
  // getTimeline
  // =========================================================================
  describe('getTimeline', () => {
    beforeEach(() => {
      analytics.startSession();
    });

    it('should return empty array when no segments', () => {
      expect(analytics.getTimeline()).toEqual([]);
    });

    it('should create buckets for segments', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 30 });
      const timeline = analytics.getTimeline();
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0].timestamp).toBe(0);
    });

    it('should distribute speaking time across buckets', () => {
      // Segment spanning two 60s buckets
      analytics.addSegment({ speaker: 'Alice', start: 50, end: 70 });
      const timeline = analytics.getTimeline();
      expect(timeline.length).toBe(2);
      // First bucket: 50-60 = 10s, Second bucket: 60-70 = 10s
      expect(timeline[0].speakers['Alice']).toBe(10);
      expect(timeline[1].speakers['Alice']).toBe(10);
    });

    it('should track multiple speakers in a bucket', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 30 });
      analytics.addSegment({ speaker: 'Bob', start: 30, end: 50 });
      const timeline = analytics.getTimeline();
      expect(timeline[0].speakers['Alice']).toBe(30);
      expect(timeline[0].speakers['Bob']).toBe(20);
    });

    it('should calculate totalActivity per bucket', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 20 });
      analytics.addSegment({ speaker: 'Bob', start: 20, end: 40 });
      const timeline = analytics.getTimeline();
      expect(timeline[0].totalActivity).toBe(40);
    });

    it('should sort buckets chronologically', () => {
      analytics.addSegment({ speaker: 'Alice', start: 120, end: 130 });
      analytics.addSegment({ speaker: 'Bob', start: 0, end: 10 });
      const timeline = analytics.getTimeline();
      expect(timeline[0].timestamp).toBeLessThan(timeline[1].timestamp);
    });

    it('should accept custom bucket size', () => {
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 30 });
      const timeline = analytics.getTimeline(10);
      // Buckets: 0, 10, 20, 30 (endBucket = floor(30/10)*10 = 30)
      expect(timeline.length).toBe(4);
    });

    it('should use instance bucket size by default', () => {
      const a = new SessionAnalytics({ bucketSize: 10 });
      a.startSession();
      a.addSegment({ speaker: 'Alice', start: 0, end: 30 });
      const timeline = a.getTimeline();
      // Buckets: 0, 10, 20, 30
      expect(timeline.length).toBe(4);
    });
  });

  // =========================================================================
  // getSessionSummary
  // =========================================================================
  describe('getSessionSummary', () => {
    it('should return null when no session', () => {
      expect(analytics.getSessionSummary()).toBeNull();
    });

    it('should return summary for active session', () => {
      analytics.startSession('test');
      const summary = analytics.getSessionSummary();
      expect(summary).toBeDefined();
      expect(summary.metadata.sessionId).toBe('test');
    });

    it('should include metadata', () => {
      analytics.startSession('test');
      const summary = analytics.getSessionSummary();
      expect(summary.metadata.startTime).toBeDefined();
      expect(summary.metadata.status).toBe('active');
    });

    it('should include speaker map', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      const summary = analytics.getSessionSummary();
      expect(summary.speakers['Alice']).toBeDefined();
    });

    it('should calculate totalSpeakingTime', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 15 });
      const summary = analytics.getSessionSummary();
      expect(summary.totalSpeakingTime).toBe(15);
    });

    it('should count speakers', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 10 });
      const summary = analytics.getSessionSummary();
      expect(summary.speakerCount).toBe(2);
    });

    it('should identify dominant speaker', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 20 });
      const summary = analytics.getSessionSummary();
      expect(summary.dominantSpeaker).toBe('Bob');
    });

    it('should identify quietest speaker', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 20 });
      const summary = analytics.getSessionSummary();
      expect(summary.quietestSpeaker).toBe('Alice');
    });

    it('should handle single speaker (dominant and quietest are same)', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      const summary = analytics.getSessionSummary();
      expect(summary.dominantSpeaker).toBe('Alice');
      expect(summary.quietestSpeaker).toBe('Alice');
    });

    it('should handle no speakers', () => {
      analytics.startSession();
      const summary = analytics.getSessionSummary();
      expect(summary.dominantSpeaker).toBeNull();
      expect(summary.quietestSpeaker).toBeNull();
      expect(summary.speakerCount).toBe(0);
    });

    it('should include timeline', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      const summary = analytics.getSessionSummary();
      expect(Array.isArray(summary.timeline)).toBe(true);
    });
  });

  // =========================================================================
  // getSessionHistory
  // =========================================================================
  describe('getSessionHistory', () => {
    it('should return empty array when no history', () => {
      expect(analytics.getSessionHistory()).toEqual([]);
    });

    it('should return all history when no limit', () => {
      analytics.startSession('s1');
      analytics.endSession();
      analytics.startSession('s2');
      analytics.endSession();
      expect(analytics.getSessionHistory().length).toBe(2);
    });

    it('should respect limit parameter', () => {
      analytics.startSession('s1');
      analytics.endSession();
      analytics.startSession('s2');
      analytics.endSession();
      analytics.startSession('s3');
      analytics.endSession();
      expect(analytics.getSessionHistory(2).length).toBe(2);
    });

    it('should return copy of history array', () => {
      analytics.startSession('s1');
      analytics.endSession();
      const h1 = analytics.getSessionHistory();
      const h2 = analytics.getSessionHistory();
      expect(h1).toEqual(h2);
      expect(h1).not.toBe(h2);
    });

    it('should return most recent first', () => {
      analytics.startSession('s1');
      analytics.endSession();
      analytics.startSession('s2');
      analytics.endSession();
      const history = analytics.getSessionHistory();
      expect(history[0].metadata.sessionId).toBe('s2');
    });
  });

  // =========================================================================
  // clearCurrentSession
  // =========================================================================
  describe('clearCurrentSession', () => {
    it('should clear active session without saving to history', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.clearCurrentSession();
      expect(analytics.isSessionActive()).toBe(false);
      expect(analytics.getCurrentSessionId()).toBeNull();
      expect(analytics.getSegmentCount()).toBe(0);
      expect(analytics.getSessionHistory()).toEqual([]);
    });

    it('should be safe to call without active session', () => {
      analytics.clearCurrentSession(); // should not throw
      expect(analytics.isSessionActive()).toBe(false);
    });
  });

  // =========================================================================
  // clearHistory
  // =========================================================================
  describe('clearHistory', () => {
    it('should clear all session history', () => {
      analytics.startSession('s1');
      analytics.endSession();
      analytics.startSession('s2');
      analytics.endSession();
      expect(analytics.getSessionHistory().length).toBe(2);
      analytics.clearHistory();
      expect(analytics.getSessionHistory()).toEqual([]);
    });

    it('should be safe to call when history is empty', () => {
      analytics.clearHistory(); // should not throw
      expect(analytics.getSessionHistory()).toEqual([]);
    });
  });

  // =========================================================================
  // reset
  // =========================================================================
  describe('reset', () => {
    it('should clear current session and history', () => {
      analytics.startSession('s1');
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.endSession();
      analytics.startSession('s2');

      analytics.reset();

      expect(analytics.isSessionActive()).toBe(false);
      expect(analytics.getCurrentSessionId()).toBeNull();
      expect(analytics.getSegmentCount()).toBe(0);
      expect(analytics.getSessionHistory()).toEqual([]);
    });
  });

  // =========================================================================
  // isSessionActive
  // =========================================================================
  describe('isSessionActive', () => {
    it('should return false with no session', () => {
      expect(analytics.isSessionActive()).toBe(false);
    });

    it('should return true for active session', () => {
      analytics.startSession();
      expect(analytics.isSessionActive()).toBe(true);
    });

    it('should return false for paused session', () => {
      analytics.startSession();
      analytics.pauseSession();
      expect(analytics.isSessionActive()).toBe(false);
    });

    it('should return false after ending session', () => {
      analytics.startSession();
      analytics.endSession();
      expect(analytics.isSessionActive()).toBe(false);
    });

    it('should return true after resuming', () => {
      analytics.startSession();
      analytics.pauseSession();
      analytics.resumeSession();
      expect(analytics.isSessionActive()).toBe(true);
    });
  });

  // =========================================================================
  // getCurrentSessionId
  // =========================================================================
  describe('getCurrentSessionId', () => {
    it('should return null with no session', () => {
      expect(analytics.getCurrentSessionId()).toBeNull();
    });

    it('should return session ID when active', () => {
      analytics.startSession('my-session');
      expect(analytics.getCurrentSessionId()).toBe('my-session');
    });

    it('should return null after session ends', () => {
      analytics.startSession();
      analytics.endSession();
      expect(analytics.getCurrentSessionId()).toBeNull();
    });

    it('should still return session ID when paused', () => {
      analytics.startSession('paused-session');
      analytics.pauseSession();
      expect(analytics.getCurrentSessionId()).toBe('paused-session');
    });
  });

  // =========================================================================
  // getSegmentCount
  // =========================================================================
  describe('getSegmentCount', () => {
    it('should return 0 with no session', () => {
      expect(analytics.getSegmentCount()).toBe(0);
    });

    it('should return correct count after adding segments', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.addSegment({ speaker: 'Bob', start: 5, end: 10 });
      expect(analytics.getSegmentCount()).toBe(2);
    });

    it('should not count invalid segments', () => {
      analytics.startSession();
      analytics.addSegment(null);
      analytics.addSegment({ speaker: 'Alice' }); // missing start/end
      expect(analytics.getSegmentCount()).toBe(0);
    });
  });

  // =========================================================================
  // _calculateMetrics (private, tested via public methods)
  // =========================================================================
  describe('_calculateMetrics', () => {
    it('should handle zero total speaking time', () => {
      analytics.startSession();
      // No segments - should not crash
      analytics._calculateMetrics();
      const stats = analytics.getSpeakerStats();
      expect(stats).toEqual([]);
    });

    it('should handle no session gracefully', () => {
      // Should not throw
      analytics._calculateMetrics();
    });

    it('should calculate correct percentages for 3 speakers', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 10 });  // 10s
      analytics.addSegment({ speaker: 'Bob', start: 10, end: 30 });   // 20s
      analytics.addSegment({ speaker: 'Charlie', start: 30, end: 40 }); // 10s
      // Total = 40s
      const stats = analytics.getSpeakerStats();
      const alice = stats.find(s => s.speakerId === 'Alice');
      const bob = stats.find(s => s.speakerId === 'Bob');
      const charlie = stats.find(s => s.speakerId === 'Charlie');
      expect(alice.percentage).toBeCloseTo(25, 0);
      expect(bob.percentage).toBeCloseTo(50, 0);
      expect(charlie.percentage).toBeCloseTo(25, 0);
    });

    it('should handle zero segment count for avgSegmentDuration', () => {
      analytics.startSession();
      analytics._speakerMetrics['Ghost'] = {
        speakerId: 'Ghost',
        speakingTime: 0,
        segmentCount: 0,
        avgSegmentDuration: 0,
        percentage: 0,
        firstSpeakTime: 0,
        lastSpeakTime: 0
      };
      analytics._calculateMetrics();
      expect(analytics._speakerMetrics['Ghost'].avgSegmentDuration).toBe(0);
    });
  });

  // =========================================================================
  // Integration scenarios
  // =========================================================================
  describe('integration scenarios', () => {
    it('should handle a complete session lifecycle', () => {
      const id = analytics.startSession('full-test');
      expect(analytics.isSessionActive()).toBe(true);

      analytics.addSegment({ speaker: 'GM', start: 0, end: 30, text: 'You enter the dungeon' });
      analytics.addSegment({ speaker: 'Player1', start: 30, end: 45, text: 'I look around' });
      analytics.addSegment({ speaker: 'GM', start: 45, end: 90, text: 'You see a dragon' });
      analytics.addSegment({ speaker: 'Player2', start: 90, end: 100, text: 'I attack!' });

      expect(analytics.getSegmentCount()).toBe(4);

      const summary = analytics.endSession();
      expect(summary.metadata.sessionId).toBe('full-test');
      expect(summary.speakerCount).toBe(3);
      expect(summary.totalSpeakingTime).toBe(100);
      expect(summary.dominantSpeaker).toBe('GM'); // 75s
      expect(summary.quietestSpeaker).toBe('Player2'); // 10s
    });

    it('should handle pause/resume cycle', () => {
      analytics.startSession();
      analytics.addSegment({ speaker: 'Alice', start: 0, end: 5 });
      analytics.pauseSession();
      expect(analytics.isSessionActive()).toBe(false);
      analytics.resumeSession();
      expect(analytics.isSessionActive()).toBe(true);
      analytics.addSegment({ speaker: 'Alice', start: 5, end: 10 });
      const summary = analytics.endSession();
      expect(summary.totalSpeakingTime).toBe(10);
    });

    it('should preserve history across multiple sessions', () => {
      for (let i = 0; i < 5; i++) {
        analytics.startSession(`session-${i}`);
        analytics.addSegment({ speaker: `Speaker${i}`, start: 0, end: 10 });
        analytics.endSession();
      }
      const history = analytics.getSessionHistory();
      expect(history.length).toBe(5);
      expect(history[0].metadata.sessionId).toBe('session-4');
      expect(history[4].metadata.sessionId).toBe('session-0');
    });
  });
});
