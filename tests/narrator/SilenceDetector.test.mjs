/**
 * SilenceDetector Unit Tests
 *
 * Tests for the SilenceDetector class with fake timers.
 * Covers start/stop, activity recording, threshold management,
 * callback invocation, auto-restart behavior, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing SilenceDetector
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
  }
}));

import {
  SilenceDetector,
  DEFAULT_THRESHOLD_MS,
  MIN_THRESHOLD_MS,
  MAX_THRESHOLD_MS
} from '../../scripts/narrator/SilenceDetector.mjs';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SilenceDetector', () => {
  let detector;
  let mockCallback;

  beforeEach(() => {
    vi.useFakeTimers();
    mockCallback = vi.fn();
    detector = new SilenceDetector({ onSilence: mockCallback });
  });

  afterEach(() => {
    if (detector) {
      detector.stop();
    }
    vi.useRealTimers();
  });

  // =========================================================================
  // Construction and configuration
  // =========================================================================

  describe('constructor and configuration', () => {
    it('should create an instance with default options', () => {
      const d = new SilenceDetector();
      expect(d.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
      expect(d.isEnabled()).toBe(false);
      expect(d.getStats().hasCallback).toBe(false);
      expect(d.getStats().autoRestart).toBe(true);
    });

    it('should accept custom threshold', () => {
      const d = new SilenceDetector({ thresholdMs: 45000 });
      expect(d.getThreshold()).toBe(45000);
    });

    it('should accept custom callback', () => {
      const callback = vi.fn();
      const d = new SilenceDetector({ onSilence: callback });
      expect(d.getStats().hasCallback).toBe(true);
    });

    it('should accept autoRestart option', () => {
      const d = new SilenceDetector({ autoRestart: false });
      expect(d.getStats().autoRestart).toBe(false);
    });

    it('should clamp threshold below minimum to MIN_THRESHOLD_MS', () => {
      const d = new SilenceDetector({ thresholdMs: 5000 });
      expect(d.getThreshold()).toBe(MIN_THRESHOLD_MS);
    });

    it('should clamp threshold above maximum to MAX_THRESHOLD_MS', () => {
      const d = new SilenceDetector({ thresholdMs: 200000 });
      expect(d.getThreshold()).toBe(MAX_THRESHOLD_MS);
    });

    it('should use default threshold for invalid values', () => {
      const d = new SilenceDetector({ thresholdMs: NaN });
      expect(d.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should ignore non-function callback', () => {
      const d = new SilenceDetector({ onSilence: 'not a function' });
      expect(d.getStats().hasCallback).toBe(false);
    });
  });

  // =========================================================================
  // Exported constants
  // =========================================================================

  describe('exported constants', () => {
    it('should export DEFAULT_THRESHOLD_MS as 30000', () => {
      expect(DEFAULT_THRESHOLD_MS).toBe(30000);
    });

    it('should export MIN_THRESHOLD_MS as 10000', () => {
      expect(MIN_THRESHOLD_MS).toBe(10000);
    });

    it('should export MAX_THRESHOLD_MS as 120000', () => {
      expect(MAX_THRESHOLD_MS).toBe(120000);
    });
  });

  // =========================================================================
  // start() and stop()
  // =========================================================================

  describe('start() and stop()', () => {
    it('should enable detection when start() is called', () => {
      expect(detector.isEnabled()).toBe(false);
      detector.start();
      expect(detector.isEnabled()).toBe(true);
    });

    it('should initialize lastActivityTime on start', () => {
      const now = Date.now();
      detector.start();
      expect(detector.getStats().lastActivityTime).toBe(now);
    });

    it('should initialize sessionStartTime on start', () => {
      const now = Date.now();
      detector.start();
      expect(detector.getStats().sessionStartTime).toBe(now);
    });

    it('should reset silenceCount on start', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(detector.getStats().silenceCount).toBe(1);
      detector.start(); // restart
      expect(detector.getStats().silenceCount).toBe(0);
    });

    it('should disable detection when stop() is called', () => {
      detector.start();
      expect(detector.isEnabled()).toBe(true);
      detector.stop();
      expect(detector.isEnabled()).toBe(false);
    });

    it('should be safe to call stop() multiple times', () => {
      detector.start();
      detector.stop();
      detector.stop(); // should not throw
      expect(detector.isEnabled()).toBe(false);
    });

    it('should clear timer when stop() is called', () => {
      detector.start();
      detector.stop();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS * 2);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should reset timer when start() is called while already running', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS - 5000);
      detector.start(); // reset
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS - 5000);
      expect(mockCallback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5000);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // recordActivity()
  // =========================================================================

  describe('recordActivity()', () => {
    it('should return true when recording activity while enabled', () => {
      detector.start();
      expect(detector.recordActivity()).toBe(true);
    });

    it('should return false when recording activity while disabled', () => {
      expect(detector.recordActivity()).toBe(false);
    });

    it('should reset the silence timer', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS - 5000);
      detector.recordActivity();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS - 5000);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should update lastActivityTime', () => {
      detector.start();
      vi.advanceTimersByTime(10000);
      detector.recordActivity();
      const stats = detector.getStats();
      expect(stats.lastActivityTime).toBe(Date.now());
    });

    it('should prevent silence detection when called before threshold', () => {
      detector.start();
      vi.advanceTimersByTime(25000);
      detector.recordActivity();
      vi.advanceTimersByTime(25000);
      detector.recordActivity();
      vi.advanceTimersByTime(25000);
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Silence detection and callback
  // =========================================================================

  describe('silence detection and callback', () => {
    it('should trigger callback after threshold time', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should not trigger callback before threshold time', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS - 1);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should pass correct silenceDurationMs to callback', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          silenceDurationMs: DEFAULT_THRESHOLD_MS
        })
      );
    });

    it('should pass lastActivityTime to callback', () => {
      const startTime = Date.now();
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          lastActivityTime: startTime
        })
      );
    });

    it('should pass silenceCount to callback', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          silenceCount: 1
        })
      );
    });

    it('should increment silenceCount for each silence event', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenLastCalledWith(
        expect.objectContaining({ silenceCount: 1 })
      );
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenLastCalledWith(
        expect.objectContaining({ silenceCount: 2 })
      );
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenLastCalledWith(
        expect.objectContaining({ silenceCount: 3 })
      );
    });

    it('should not throw if callback throws an error', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const d = new SilenceDetector({ onSilence: errorCallback });
      d.start();
      expect(() => vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS)).not.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      d.stop();
    });

    it('should not trigger callback if no callback is registered', () => {
      const d = new SilenceDetector();
      d.start();
      expect(() => vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS)).not.toThrow();
      d.stop();
    });
  });

  // =========================================================================
  // Auto-restart behavior
  // =========================================================================

  describe('auto-restart behavior', () => {
    it('should auto-restart timer after silence event by default', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should not auto-restart when autoRestart is false', () => {
      const d = new SilenceDetector({
        onSilence: mockCallback,
        autoRestart: false
      });
      d.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS * 2);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      d.stop();
    });

    it('should continue after activity resets', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      detector.recordActivity();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should update lastActivityTime after auto-restart', () => {
      detector.start();
      const beforeSilence = Date.now();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      const afterSilence = detector.getStats().lastActivityTime;
      expect(afterSilence).toBe(beforeSilence + DEFAULT_THRESHOLD_MS);
    });
  });

  // =========================================================================
  // setThreshold()
  // =========================================================================

  describe('setThreshold()', () => {
    it('should update the threshold', () => {
      detector.setThreshold(45000);
      expect(detector.getThreshold()).toBe(45000);
    });

    it('should clamp threshold below minimum', () => {
      detector.setThreshold(5000);
      expect(detector.getThreshold()).toBe(MIN_THRESHOLD_MS);
    });

    it('should clamp threshold above maximum', () => {
      detector.setThreshold(200000);
      expect(detector.getThreshold()).toBe(MAX_THRESHOLD_MS);
    });

    it('should restart timer with new threshold when enabled', () => {
      detector.start();
      vi.advanceTimersByTime(20000);
      detector.setThreshold(60000);
      vi.advanceTimersByTime(30000);
      expect(mockCallback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10000); // 60000 total from activity
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should not do anything if threshold is unchanged', () => {
      detector.setThreshold(DEFAULT_THRESHOLD_MS);
      expect(detector.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should use default for invalid threshold', () => {
      detector.setThreshold('invalid');
      expect(detector.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
    });
  });

  // =========================================================================
  // setOnSilenceCallback()
  // =========================================================================

  describe('setOnSilenceCallback()', () => {
    it('should update the callback', () => {
      const newCallback = vi.fn();
      detector.setOnSilenceCallback(newCallback);
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(newCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should allow setting callback to null', () => {
      detector.setOnSilenceCallback(null);
      expect(detector.getStats().hasCallback).toBe(false);
    });

    it('should ignore invalid callback values', () => {
      detector.setOnSilenceCallback('invalid');
      expect(detector.getStats().hasCallback).toBe(true); // still has original
    });
  });

  // =========================================================================
  // setAutoRestart()
  // =========================================================================

  describe('setAutoRestart()', () => {
    it('should update autoRestart setting', () => {
      detector.setAutoRestart(false);
      expect(detector.getStats().autoRestart).toBe(false);
    });

    it('should convert truthy values to boolean', () => {
      detector.setAutoRestart(1);
      expect(detector.getStats().autoRestart).toBe(true);
    });

    it('should convert falsy values to boolean', () => {
      detector.setAutoRestart(0);
      expect(detector.getStats().autoRestart).toBe(false);
    });
  });

  // =========================================================================
  // getTimeSinceLastActivity()
  // =========================================================================

  describe('getTimeSinceLastActivity()', () => {
    it('should return 0 when not tracking', () => {
      expect(detector.getTimeSinceLastActivity()).toBe(0);
    });

    it('should return elapsed time since last activity', () => {
      detector.start();
      vi.advanceTimersByTime(15000);
      expect(detector.getTimeSinceLastActivity()).toBe(15000);
    });

    it('should reset when activity is recorded', () => {
      detector.start();
      vi.advanceTimersByTime(15000);
      detector.recordActivity();
      expect(detector.getTimeSinceLastActivity()).toBe(0);
    });
  });

  // =========================================================================
  // getStats()
  // =========================================================================

  describe('getStats()', () => {
    it('should return all statistics', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      const stats = detector.getStats();

      expect(stats).toHaveProperty('isEnabled', true);
      expect(stats).toHaveProperty('thresholdMs', DEFAULT_THRESHOLD_MS);
      expect(stats).toHaveProperty('silenceCount', 1);
      expect(stats).toHaveProperty('lastActivityTime');
      expect(stats).toHaveProperty('timeSinceLastActivity');
      expect(stats).toHaveProperty('sessionStartTime');
      expect(stats).toHaveProperty('sessionDurationMs');
      expect(stats).toHaveProperty('hasCallback', true);
      expect(stats).toHaveProperty('autoRestart', true);
    });

    it('should calculate sessionDurationMs correctly', () => {
      detector.start();
      vi.advanceTimersByTime(5000);
      expect(detector.getStats().sessionDurationMs).toBe(5000);
    });

    it('should return 0 sessionDurationMs when not started', () => {
      expect(detector.getStats().sessionDurationMs).toBe(0);
    });
  });

  // =========================================================================
  // resetStats()
  // =========================================================================

  describe('resetStats()', () => {
    it('should stop detection', () => {
      detector.start();
      detector.resetStats();
      expect(detector.isEnabled()).toBe(false);
    });

    it('should reset silenceCount', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(detector.getStats().silenceCount).toBe(1);
      detector.resetStats();
      expect(detector.getStats().silenceCount).toBe(0);
    });

    it('should reset lastActivityTime', () => {
      detector.start();
      vi.advanceTimersByTime(1000);
      expect(detector.getStats().lastActivityTime).not.toBeNull();
      detector.resetStats();
      expect(detector.getStats().lastActivityTime).toBeNull();
    });

    it('should reset sessionStartTime', () => {
      detector.start();
      expect(detector.getStats().sessionStartTime).not.toBeNull();
      detector.resetStats();
      expect(detector.getStats().sessionStartTime).toBeNull();
    });
  });

  // =========================================================================
  // isProcessingSilence()
  // =========================================================================

  describe('isProcessingSilence()', () => {
    it('should return false when not processing', () => {
      detector.start();
      expect(detector.isProcessingSilence()).toBe(false);
    });

    it('should return true during callback execution', () => {
      let wasProcessing = false;
      let localDetector = null;
      const checkCallback = vi.fn(() => {
        wasProcessing = localDetector.isProcessingSilence();
      });
      localDetector = new SilenceDetector({ onSilence: checkCallback });
      localDetector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(wasProcessing).toBe(true);
      expect(localDetector.isProcessingSilence()).toBe(false); // after callback
      localDetector.stop();
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle rapid start/stop cycles', () => {
      for (let i = 0; i < 10; i++) {
        detector.start();
        detector.stop();
      }
      expect(detector.isEnabled()).toBe(false);
    });

    it('should handle threshold at exact minimum', () => {
      const d = new SilenceDetector({
        thresholdMs: MIN_THRESHOLD_MS,
        onSilence: mockCallback
      });
      d.start();
      vi.advanceTimersByTime(MIN_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      d.stop();
    });

    it('should handle threshold at exact maximum', () => {
      const d = new SilenceDetector({
        thresholdMs: MAX_THRESHOLD_MS,
        onSilence: mockCallback
      });
      d.start();
      vi.advanceTimersByTime(MAX_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      d.stop();
    });

    it('should handle activity just before threshold', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS - 1);
      detector.recordActivity();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS - 1);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle activity just after threshold', () => {
      detector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      detector.recordActivity();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle stop during callback', () => {
      let localDetector = null;
      const stopCallback = vi.fn(() => {
        localDetector.stop();
      });
      localDetector = new SilenceDetector({ onSilence: stopCallback });
      localDetector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(stopCallback).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS * 2);
      expect(stopCallback).toHaveBeenCalledTimes(1); // no more calls
    });

    it('should handle setThreshold during callback', () => {
      let localDetector = null;
      const thresholdCallback = vi.fn(() => {
        localDetector.setThreshold(60000);
      });
      localDetector = new SilenceDetector({ onSilence: thresholdCallback });
      localDetector.start();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(thresholdCallback).toHaveBeenCalledTimes(1);
      expect(localDetector.getThreshold()).toBe(60000);
      localDetector.stop();
    });

    it('should work with zero elapsed time edge case', () => {
      detector.start();
      // Immediately advance to threshold
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple activity records in quick succession', () => {
      detector.start();
      vi.advanceTimersByTime(10000);
      detector.recordActivity();
      detector.recordActivity();
      detector.recordActivity();
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Integration-like tests
  // =========================================================================

  describe('integration scenarios', () => {
    it('should work through a typical session lifecycle', () => {
      // Start monitoring
      detector.start();
      expect(detector.isEnabled()).toBe(true);

      // Simulate some activity
      vi.advanceTimersByTime(10000);
      detector.recordActivity();

      // More activity
      vi.advanceTimersByTime(20000);
      detector.recordActivity();

      // No activity, silence triggers
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Activity resumes
      detector.recordActivity();

      // Another silence
      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(2);

      // Stop monitoring
      detector.stop();
      expect(detector.isEnabled()).toBe(false);

      // Verify stats
      expect(detector.getStats().silenceCount).toBe(2);
    });

    it('should support changing threshold mid-session', () => {
      detector.start();

      // Initial threshold 30s, advance 20s
      vi.advanceTimersByTime(20000);

      // Change to 60s
      detector.setThreshold(60000);

      // Advance another 30s (50s total from last activity)
      vi.advanceTimersByTime(30000);
      expect(mockCallback).not.toHaveBeenCalled();

      // Advance to complete 60s from setThreshold
      vi.advanceTimersByTime(30000);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should support swapping callbacks mid-session', () => {
      const callback2 = vi.fn();
      detector.start();

      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();

      // Swap callback
      detector.setOnSilenceCallback(callback2);

      vi.advanceTimersByTime(DEFAULT_THRESHOLD_MS);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });
});
