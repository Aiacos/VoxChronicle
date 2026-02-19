import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SilenceDetector,
  DEFAULT_THRESHOLD_MS,
  MIN_THRESHOLD_MS,
  MAX_THRESHOLD_MS
} from '../../scripts/narrator/SilenceDetector.mjs';

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

describe('SilenceDetector', () => {
  let detector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new SilenceDetector();
  });

  afterEach(() => {
    detector.stop();
    vi.useRealTimers();
  });

  // =========================================================================
  // Exports
  // =========================================================================
  describe('exports', () => {
    it('should export the SilenceDetector class', () => {
      expect(SilenceDetector).toBeDefined();
      expect(typeof SilenceDetector).toBe('function');
    });

    it('should export DEFAULT_THRESHOLD_MS constant', () => {
      expect(DEFAULT_THRESHOLD_MS).toBe(30000);
    });

    it('should export MIN_THRESHOLD_MS constant', () => {
      expect(MIN_THRESHOLD_MS).toBe(10000);
    });

    it('should export MAX_THRESHOLD_MS constant', () => {
      expect(MAX_THRESHOLD_MS).toBe(120000);
    });
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should create an instance with default options', () => {
      expect(detector).toBeInstanceOf(SilenceDetector);
    });

    it('should use default threshold of 30000ms', () => {
      expect(detector.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should accept custom threshold', () => {
      const d = new SilenceDetector({ thresholdMs: 20000 });
      expect(d.getThreshold()).toBe(20000);
    });

    it('should clamp threshold to minimum', () => {
      const d = new SilenceDetector({ thresholdMs: 1000 });
      expect(d.getThreshold()).toBe(MIN_THRESHOLD_MS);
    });

    it('should clamp threshold to maximum', () => {
      const d = new SilenceDetector({ thresholdMs: 500000 });
      expect(d.getThreshold()).toBe(MAX_THRESHOLD_MS);
    });

    it('should use default threshold for NaN', () => {
      const d = new SilenceDetector({ thresholdMs: NaN });
      expect(d.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should use default threshold for non-number', () => {
      const d = new SilenceDetector({ thresholdMs: 'invalid' });
      expect(d.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should accept a callback', () => {
      const cb = vi.fn();
      const d = new SilenceDetector({ onSilence: cb });
      expect(d._onSilenceCallback).toBe(cb);
    });

    it('should ignore non-function callback', () => {
      const d = new SilenceDetector({ onSilence: 'not a function' });
      expect(d._onSilenceCallback).toBeNull();
    });

    it('should default autoRestart to true', () => {
      expect(detector._autoRestart).toBe(true);
    });

    it('should accept autoRestart false', () => {
      const d = new SilenceDetector({ autoRestart: false });
      expect(d._autoRestart).toBe(false);
    });

    it('should not be enabled initially', () => {
      expect(detector.isEnabled()).toBe(false);
    });

    it('should not be processing silence initially', () => {
      expect(detector.isProcessingSilence()).toBe(false);
    });

    it('should start with silence count of 0', () => {
      const stats = detector.getStats();
      expect(stats.silenceCount).toBe(0);
    });
  });

  // =========================================================================
  // start
  // =========================================================================
  describe('start', () => {
    it('should enable the detector', () => {
      detector.start();
      expect(detector.isEnabled()).toBe(true);
    });

    it('should set lastActivityTime', () => {
      detector.start();
      const stats = detector.getStats();
      expect(stats.lastActivityTime).toBeDefined();
      expect(typeof stats.lastActivityTime).toBe('number');
    });

    it('should set sessionStartTime', () => {
      detector.start();
      const stats = detector.getStats();
      expect(stats.sessionStartTime).toBeDefined();
    });

    it('should reset silence count', () => {
      detector.start();
      vi.advanceTimersByTime(30000);
      expect(detector.getStats().silenceCount).toBe(1);
      detector.start(); // restart
      expect(detector.getStats().silenceCount).toBe(0);
    });

    it('should reset timer when called while already running', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      vi.advanceTimersByTime(20000); // 20s into first timer
      detector.start(); // restart should reset timer
      vi.advanceTimersByTime(20000); // 20s more, total only 20s from restart
      expect(cb).not.toHaveBeenCalled();
    });

    it('should start the silence timer', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      vi.advanceTimersByTime(30000);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // stop
  // =========================================================================
  describe('stop', () => {
    it('should disable the detector', () => {
      detector.start();
      detector.stop();
      expect(detector.isEnabled()).toBe(false);
    });

    it('should clear the timer', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      detector.stop();
      vi.advanceTimersByTime(60000);
      expect(cb).not.toHaveBeenCalled();
    });

    it('should be safe to call multiple times', () => {
      detector.start();
      detector.stop();
      detector.stop();
      expect(detector.isEnabled()).toBe(false);
    });

    it('should be safe to call without starting', () => {
      detector.stop(); // should not throw
      expect(detector.isEnabled()).toBe(false);
    });

    it('should reset isProcessingSilence', () => {
      detector.start();
      detector.stop();
      expect(detector.isProcessingSilence()).toBe(false);
    });
  });

  // =========================================================================
  // recordActivity
  // =========================================================================
  describe('recordActivity', () => {
    it('should return true when enabled', () => {
      detector.start();
      expect(detector.recordActivity()).toBe(true);
    });

    it('should return false when not enabled', () => {
      expect(detector.recordActivity()).toBe(false);
    });

    it('should reset the silence timer', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      vi.advanceTimersByTime(25000); // 25s
      detector.recordActivity();
      vi.advanceTimersByTime(25000); // 25s more from last activity
      expect(cb).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5000); // 5s more = 30s from last activity
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('should update lastActivityTime', () => {
      detector.start();
      const before = detector.getStats().lastActivityTime;
      vi.advanceTimersByTime(5000);
      detector.recordActivity();
      const after = detector.getStats().lastActivityTime;
      expect(after).toBeGreaterThan(before);
    });
  });

  // =========================================================================
  // setThreshold
  // =========================================================================
  describe('setThreshold', () => {
    it('should update the threshold', () => {
      detector.setThreshold(20000);
      expect(detector.getThreshold()).toBe(20000);
    });

    it('should clamp to minimum', () => {
      detector.setThreshold(1000);
      expect(detector.getThreshold()).toBe(MIN_THRESHOLD_MS);
    });

    it('should clamp to maximum', () => {
      detector.setThreshold(500000);
      expect(detector.getThreshold()).toBe(MAX_THRESHOLD_MS);
    });

    it('should use default for NaN', () => {
      detector.setThreshold(NaN);
      expect(detector.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should not restart timer if value unchanged', () => {
      detector.start();
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.setThreshold(30000); // same as default
      // Timer should not have been affected
    });

    it('should restart timer when changed while enabled', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      vi.advanceTimersByTime(15000); // 15s into 30s timer
      detector.setThreshold(20000);
      // Timer restarted: 20s - 15s elapsed = 5s remaining
      vi.advanceTimersByTime(5000);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('should not restart timer when not enabled', () => {
      detector.setThreshold(20000);
      // No timer to restart - should not throw
      expect(detector.getThreshold()).toBe(20000);
    });
  });

  // =========================================================================
  // getThreshold
  // =========================================================================
  describe('getThreshold', () => {
    it('should return the current threshold', () => {
      expect(detector.getThreshold()).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should reflect changes from setThreshold', () => {
      detector.setThreshold(60000);
      expect(detector.getThreshold()).toBe(60000);
    });
  });

  // =========================================================================
  // setOnSilenceCallback
  // =========================================================================
  describe('setOnSilenceCallback', () => {
    it('should set a callback function', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      expect(detector._onSilenceCallback).toBe(cb);
    });

    it('should accept null to clear callback', () => {
      detector.setOnSilenceCallback(vi.fn());
      detector.setOnSilenceCallback(null);
      expect(detector._onSilenceCallback).toBeNull();
    });

    it('should ignore non-function non-null values', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.setOnSilenceCallback('not a function');
      expect(detector._onSilenceCallback).toBe(cb); // unchanged
    });

    it('should ignore number values', () => {
      detector.setOnSilenceCallback(42);
      expect(detector._onSilenceCallback).toBeNull();
    });
  });

  // =========================================================================
  // setAutoRestart
  // =========================================================================
  describe('setAutoRestart', () => {
    it('should set autoRestart to true', () => {
      detector.setAutoRestart(true);
      expect(detector._autoRestart).toBe(true);
    });

    it('should set autoRestart to false', () => {
      detector.setAutoRestart(false);
      expect(detector._autoRestart).toBe(false);
    });

    it('should coerce truthy values to true', () => {
      detector.setAutoRestart(1);
      expect(detector._autoRestart).toBe(true);
    });

    it('should coerce falsy values to false', () => {
      detector.setAutoRestart(0);
      expect(detector._autoRestart).toBe(false);
    });
  });

  // =========================================================================
  // isEnabled
  // =========================================================================
  describe('isEnabled', () => {
    it('should return false initially', () => {
      expect(detector.isEnabled()).toBe(false);
    });

    it('should return true after start', () => {
      detector.start();
      expect(detector.isEnabled()).toBe(true);
    });

    it('should return false after stop', () => {
      detector.start();
      detector.stop();
      expect(detector.isEnabled()).toBe(false);
    });
  });

  // =========================================================================
  // isProcessingSilence
  // =========================================================================
  describe('isProcessingSilence', () => {
    it('should return false initially', () => {
      expect(detector.isProcessingSilence()).toBe(false);
    });

    it('should return false after silence event completes', () => {
      detector.start();
      vi.advanceTimersByTime(30000);
      // After the callback, _isProcessingSilence is set back to false
      expect(detector.isProcessingSilence()).toBe(false);
    });
  });

  // =========================================================================
  // getTimeSinceLastActivity
  // =========================================================================
  describe('getTimeSinceLastActivity', () => {
    it('should return 0 when not tracking', () => {
      expect(detector.getTimeSinceLastActivity()).toBe(0);
    });

    it('should return elapsed time since last activity', () => {
      detector.start();
      vi.advanceTimersByTime(5000);
      expect(detector.getTimeSinceLastActivity()).toBe(5000);
    });

    it('should reset after recordActivity', () => {
      detector.start();
      vi.advanceTimersByTime(5000);
      detector.recordActivity();
      expect(detector.getTimeSinceLastActivity()).toBe(0);
    });

    it('should accumulate after multiple advances', () => {
      detector.start();
      vi.advanceTimersByTime(3000);
      vi.advanceTimersByTime(2000);
      expect(detector.getTimeSinceLastActivity()).toBe(5000);
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================
  describe('getStats', () => {
    it('should return all stats fields', () => {
      const stats = detector.getStats();
      expect(stats).toHaveProperty('isEnabled');
      expect(stats).toHaveProperty('thresholdMs');
      expect(stats).toHaveProperty('silenceCount');
      expect(stats).toHaveProperty('lastActivityTime');
      expect(stats).toHaveProperty('timeSinceLastActivity');
      expect(stats).toHaveProperty('sessionStartTime');
      expect(stats).toHaveProperty('sessionDurationMs');
      expect(stats).toHaveProperty('hasCallback');
      expect(stats).toHaveProperty('autoRestart');
    });

    it('should return isEnabled=false when not started', () => {
      expect(detector.getStats().isEnabled).toBe(false);
    });

    it('should return isEnabled=true when started', () => {
      detector.start();
      expect(detector.getStats().isEnabled).toBe(true);
    });

    it('should return correct threshold', () => {
      expect(detector.getStats().thresholdMs).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should return silenceCount', () => {
      detector.start();
      vi.advanceTimersByTime(30000);
      expect(detector.getStats().silenceCount).toBe(1);
    });

    it('should return hasCallback=false when no callback', () => {
      expect(detector.getStats().hasCallback).toBe(false);
    });

    it('should return hasCallback=true when callback set', () => {
      detector.setOnSilenceCallback(vi.fn());
      expect(detector.getStats().hasCallback).toBe(true);
    });

    it('should return autoRestart value', () => {
      expect(detector.getStats().autoRestart).toBe(true);
      detector.setAutoRestart(false);
      expect(detector.getStats().autoRestart).toBe(false);
    });

    it('should calculate sessionDurationMs', () => {
      detector.start();
      vi.advanceTimersByTime(5000);
      expect(detector.getStats().sessionDurationMs).toBe(5000);
    });

    it('should return 0 sessionDurationMs when not started', () => {
      expect(detector.getStats().sessionDurationMs).toBe(0);
    });

    it('should return null sessionStartTime when not started', () => {
      expect(detector.getStats().sessionStartTime).toBeNull();
    });
  });

  // =========================================================================
  // resetStats
  // =========================================================================
  describe('resetStats', () => {
    it('should stop monitoring', () => {
      detector.start();
      detector.resetStats();
      expect(detector.isEnabled()).toBe(false);
    });

    it('should reset silence count', () => {
      detector.start();
      vi.advanceTimersByTime(30000);
      expect(detector.getStats().silenceCount).toBe(1);
      detector.resetStats();
      expect(detector.getStats().silenceCount).toBe(0);
    });

    it('should clear lastActivityTime', () => {
      detector.start();
      detector.resetStats();
      expect(detector.getStats().lastActivityTime).toBeNull();
    });

    it('should clear sessionStartTime', () => {
      detector.start();
      detector.resetStats();
      expect(detector.getStats().sessionStartTime).toBeNull();
    });

    it('should preserve threshold setting', () => {
      detector.setThreshold(20000);
      detector.start();
      detector.resetStats();
      expect(detector.getThreshold()).toBe(20000);
    });

    it('should preserve callback setting', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      detector.resetStats();
      expect(detector._onSilenceCallback).toBe(cb);
    });
  });

  // =========================================================================
  // _onSilenceTimeout (private, tested via timer)
  // =========================================================================
  describe('_onSilenceTimeout (via timer)', () => {
    it('should invoke callback with SilenceEvent data', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      vi.advanceTimersByTime(30000);

      expect(cb).toHaveBeenCalledTimes(1);
      const event = cb.mock.calls[0][0];
      expect(event).toHaveProperty('silenceDurationMs');
      expect(event).toHaveProperty('lastActivityTime');
      expect(event).toHaveProperty('silenceCount');
      expect(event.silenceCount).toBe(1);
    });

    it('should increment silence count', () => {
      detector.start();
      vi.advanceTimersByTime(30000);
      expect(detector.getStats().silenceCount).toBe(1);
      vi.advanceTimersByTime(30000);
      expect(detector.getStats().silenceCount).toBe(2);
    });

    it('should not invoke callback when not enabled', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      detector.stop();
      vi.advanceTimersByTime(30000);
      expect(cb).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const cb = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      detector.setOnSilenceCallback(cb);
      detector.start();
      // Should not throw
      vi.advanceTimersByTime(30000);
      expect(cb).toHaveBeenCalledTimes(1);
      // Detector should still be operational
      expect(detector.isEnabled()).toBe(true);
    });

    it('should auto-restart timer after silence event', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      vi.advanceTimersByTime(30000); // first silence
      expect(cb).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(30000); // second silence
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('should not auto-restart when autoRestart is false', () => {
      const cb = vi.fn();
      const d = new SilenceDetector({ onSilence: cb, autoRestart: false });
      d.start();
      vi.advanceTimersByTime(30000); // first silence
      expect(cb).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(30000); // no second silence
      expect(cb).toHaveBeenCalledTimes(1);
      d.stop();
    });

    it('should not invoke callback when no callback registered', () => {
      detector.start();
      // Should not throw even without callback
      vi.advanceTimersByTime(30000);
      expect(detector.getStats().silenceCount).toBe(1);
    });

    it('should use threshold for silence duration when lastActivityTime is null', () => {
      // Force lastActivityTime to null
      detector._lastActivityTime = null;
      detector._isEnabled = true;
      const cb = vi.fn();
      detector._onSilenceCallback = cb;
      detector._onSilenceTimeout();
      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ silenceDurationMs: DEFAULT_THRESHOLD_MS })
      );
    });
  });

  // =========================================================================
  // _clampThreshold (private)
  // =========================================================================
  describe('_clampThreshold', () => {
    it('should return value within valid range', () => {
      expect(detector._clampThreshold(50000)).toBe(50000);
    });

    it('should clamp below minimum', () => {
      expect(detector._clampThreshold(5000)).toBe(MIN_THRESHOLD_MS);
    });

    it('should clamp above maximum', () => {
      expect(detector._clampThreshold(200000)).toBe(MAX_THRESHOLD_MS);
    });

    it('should return default for NaN', () => {
      expect(detector._clampThreshold(NaN)).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should return default for non-number', () => {
      expect(detector._clampThreshold('abc')).toBe(DEFAULT_THRESHOLD_MS);
    });

    it('should accept exact minimum', () => {
      expect(detector._clampThreshold(MIN_THRESHOLD_MS)).toBe(MIN_THRESHOLD_MS);
    });

    it('should accept exact maximum', () => {
      expect(detector._clampThreshold(MAX_THRESHOLD_MS)).toBe(MAX_THRESHOLD_MS);
    });
  });

  // =========================================================================
  // Integration scenarios
  // =========================================================================
  describe('integration scenarios', () => {
    it('should handle activity bursts followed by silence', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();

      // Burst of activity
      vi.advanceTimersByTime(5000);
      detector.recordActivity();
      vi.advanceTimersByTime(5000);
      detector.recordActivity();
      vi.advanceTimersByTime(5000);
      detector.recordActivity();

      // No callback yet
      expect(cb).not.toHaveBeenCalled();

      // Now silence
      vi.advanceTimersByTime(30000);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('should handle start-stop-start cycle', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);

      detector.start();
      vi.advanceTimersByTime(15000);
      detector.stop();
      vi.advanceTimersByTime(30000);
      expect(cb).not.toHaveBeenCalled();

      detector.start();
      vi.advanceTimersByTime(30000);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('should handle threshold change mid-session', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();

      vi.advanceTimersByTime(10000); // 10s in
      detector.setThreshold(15000); // shorten threshold

      // Timer restarts: 15s - 10s elapsed = 5s remaining
      vi.advanceTimersByTime(5000);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('should handle callback change mid-session', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      detector.setOnSilenceCallback(cb1);
      detector.start();

      vi.advanceTimersByTime(15000);
      detector.setOnSilenceCallback(cb2);
      vi.advanceTimersByTime(15000);

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('should track multiple silence events in sequence', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(30000);
      }

      expect(cb).toHaveBeenCalledTimes(5);
      expect(detector.getStats().silenceCount).toBe(5);
    });

    it('should handle resetStats followed by restart', () => {
      const cb = vi.fn();
      detector.setOnSilenceCallback(cb);
      detector.start();
      vi.advanceTimersByTime(30000);
      expect(cb).toHaveBeenCalledTimes(1);

      detector.resetStats();
      expect(detector.getStats().silenceCount).toBe(0);
      expect(detector.isEnabled()).toBe(false);

      detector.start();
      vi.advanceTimersByTime(30000);
      expect(cb).toHaveBeenCalledTimes(2);
      expect(detector.getStats().silenceCount).toBe(1);
    });

    it('should calculate correct time since last activity during auto-restart', () => {
      detector.start();
      vi.advanceTimersByTime(30000); // silence event triggers, auto-restart resets lastActivityTime

      // After auto-restart, time since last activity should be 0 (just reset)
      expect(detector.getTimeSinceLastActivity()).toBe(0);

      vi.advanceTimersByTime(10000);
      expect(detector.getTimeSinceLastActivity()).toBe(10000);
    });
  });
});
