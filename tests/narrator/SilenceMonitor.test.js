import { SilenceMonitor } from '../../scripts/narrator/SilenceMonitor.mjs';

// Suppress Logger console output in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * Creates a mock SilenceDetector
 */
function createMockSilenceDetector() {
  return {
    setOnSilenceCallback: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    recordActivity: vi.fn().mockReturnValue(true)
  };
}

describe('SilenceMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new SilenceMonitor();
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('initializes with null/default values', () => {
      expect(monitor.getSilenceDetector()).toBeNull();
      expect(monitor.getOnAutonomousSuggestionCallback()).toBeNull();
      expect(monitor.isMonitoring).toBe(false);
      expect(monitor.silenceSuggestionCount).toBe(0);
    });
  });

  // =========================================================================
  // setGenerateSuggestionFn
  // =========================================================================
  describe('setGenerateSuggestionFn()', () => {
    it('stores the generate suggestion function', () => {
      const fn = vi.fn();
      monitor.setGenerateSuggestionFn(fn);
      // Verify it's stored (internal, tested via _handleSilenceEvent)
      expect(monitor._generateSuggestionFn).toBe(fn);
    });
  });

  // =========================================================================
  // SilenceDetector management
  // =========================================================================
  describe('setSilenceDetector() / getSilenceDetector()', () => {
    it('sets and gets the detector', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      expect(monitor.getSilenceDetector()).toBe(sd);
    });

    it('replaces an existing detector', () => {
      const sd1 = createMockSilenceDetector();
      const sd2 = createMockSilenceDetector();
      monitor.setSilenceDetector(sd1);
      monitor.setSilenceDetector(sd2);
      expect(monitor.getSilenceDetector()).toBe(sd2);
    });

    it('stops existing monitoring when replacing detector', () => {
      const sd1 = createMockSilenceDetector();
      monitor.setSilenceDetector(sd1);
      monitor.startMonitoring();
      expect(monitor.isMonitoring).toBe(true);

      const sd2 = createMockSilenceDetector();
      monitor.setSilenceDetector(sd2);
      expect(sd1.stop).toHaveBeenCalled();
      expect(monitor.isMonitoring).toBe(false);
    });

    it('does not throw when setting detector without prior monitoring', () => {
      const sd = createMockSilenceDetector();
      expect(() => monitor.setSilenceDetector(sd)).not.toThrow();
    });
  });

  // =========================================================================
  // Autonomous suggestion callback
  // =========================================================================
  describe('setOnAutonomousSuggestionCallback() / getOnAutonomousSuggestionCallback()', () => {
    it('accepts a function', () => {
      const cb = vi.fn();
      monitor.setOnAutonomousSuggestionCallback(cb);
      expect(monitor.getOnAutonomousSuggestionCallback()).toBe(cb);
    });

    it('accepts null', () => {
      monitor.setOnAutonomousSuggestionCallback(vi.fn());
      monitor.setOnAutonomousSuggestionCallback(null);
      expect(monitor.getOnAutonomousSuggestionCallback()).toBeNull();
    });

    it('rejects non-function values', () => {
      const cb = vi.fn();
      monitor.setOnAutonomousSuggestionCallback(cb);
      monitor.setOnAutonomousSuggestionCallback('invalid');
      expect(monitor.getOnAutonomousSuggestionCallback()).toBe(cb); // unchanged
    });

    it('rejects number values', () => {
      monitor.setOnAutonomousSuggestionCallback(42);
      expect(monitor.getOnAutonomousSuggestionCallback()).toBeNull(); // unchanged from initial
    });

    it('rejects object values', () => {
      monitor.setOnAutonomousSuggestionCallback({});
      expect(monitor.getOnAutonomousSuggestionCallback()).toBeNull();
    });

    it('rejects boolean values', () => {
      monitor.setOnAutonomousSuggestionCallback(true);
      expect(monitor.getOnAutonomousSuggestionCallback()).toBeNull();
    });

    it('rejects undefined', () => {
      const cb = vi.fn();
      monitor.setOnAutonomousSuggestionCallback(cb);
      monitor.setOnAutonomousSuggestionCallback(undefined);
      expect(monitor.getOnAutonomousSuggestionCallback()).toBe(cb); // unchanged
    });
  });

  // =========================================================================
  // Monitoring lifecycle
  // =========================================================================
  describe('startMonitoring()', () => {
    it('returns false without a silenceDetector', () => {
      expect(monitor.startMonitoring()).toBe(false);
      expect(monitor.isMonitoring).toBe(false);
    });

    it('starts monitoring with a configured detector', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      expect(monitor.startMonitoring()).toBe(true);
      expect(sd.setOnSilenceCallback).toHaveBeenCalled();
      expect(sd.start).toHaveBeenCalled();
      expect(monitor.isMonitoring).toBe(true);
    });

    it('returns true if already active (idempotent)', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      monitor.startMonitoring();
      expect(monitor.startMonitoring()).toBe(true);
      // Should only have been called once
      expect(sd.start).toHaveBeenCalledTimes(1);
    });

    it('sets up the bound silence handler', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      monitor.startMonitoring();

      // The callback passed to setOnSilenceCallback should be a function
      const callbackArg = sd.setOnSilenceCallback.mock.calls[0][0];
      expect(typeof callbackArg).toBe('function');
    });
  });

  describe('stopMonitoring()', () => {
    it('stops the detector and clears active flag', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      monitor.startMonitoring();
      monitor.stopMonitoring();
      expect(sd.stop).toHaveBeenCalled();
      expect(monitor.isMonitoring).toBe(false);
    });

    it('does nothing if not active', () => {
      // Should not throw
      monitor.stopMonitoring();
      expect(monitor.isMonitoring).toBe(false);
    });

    it('clears the bound handler', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      monitor.startMonitoring();
      expect(monitor._boundSilenceHandler).not.toBeNull();
      monitor.stopMonitoring();
      expect(monitor._boundSilenceHandler).toBeNull();
    });

    it('handles missing detector gracefully when active flag is forced', () => {
      // Edge case: active flag is true but detector was removed
      monitor._silenceMonitoringActive = true;
      monitor._silenceDetector = null;
      // Should not throw
      monitor.stopMonitoring();
      expect(monitor.isMonitoring).toBe(false);
    });
  });

  // =========================================================================
  // Activity recording
  // =========================================================================
  describe('recordActivity()', () => {
    it('returns true when monitoring is active', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      monitor.startMonitoring();
      expect(monitor.recordActivity()).toBe(true);
      expect(sd.recordActivity).toHaveBeenCalled();
    });

    it('returns false when monitoring is not active', () => {
      expect(monitor.recordActivity()).toBe(false);
    });

    it('returns false when detector is not set', () => {
      monitor._silenceMonitoringActive = true; // Force flag
      monitor._silenceDetector = null;
      expect(monitor.recordActivity()).toBe(false);
    });
  });

  // =========================================================================
  // State accessors
  // =========================================================================
  describe('isMonitoring', () => {
    it('returns false initially', () => {
      expect(monitor.isMonitoring).toBe(false);
    });

    it('returns true after start', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      monitor.startMonitoring();
      expect(monitor.isMonitoring).toBe(true);
    });

    it('returns false after stop', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);
      monitor.startMonitoring();
      monitor.stopMonitoring();
      expect(monitor.isMonitoring).toBe(false);
    });
  });

  describe('silenceSuggestionCount', () => {
    it('starts at 0', () => {
      expect(monitor.silenceSuggestionCount).toBe(0);
    });

    it('increments after successful suggestion generation', async () => {
      const suggestion = { type: 'narration', content: 'A suggestion', confidence: 0.8 };
      monitor.setGenerateSuggestionFn(vi.fn().mockResolvedValue(suggestion));

      await monitor._handleSilenceEvent({
        silenceDurationMs: 30000,
        lastActivityTime: Date.now() - 30000,
        silenceCount: 1
      });

      expect(monitor.silenceSuggestionCount).toBe(1);
    });

    it('does not increment when suggestion is null', async () => {
      monitor.setGenerateSuggestionFn(vi.fn().mockResolvedValue(null));

      await monitor._handleSilenceEvent({
        silenceDurationMs: 30000,
        lastActivityTime: Date.now() - 30000,
        silenceCount: 1
      });

      expect(monitor.silenceSuggestionCount).toBe(0);
    });
  });

  // =========================================================================
  // _handleSilenceEvent
  // =========================================================================
  describe('_handleSilenceEvent()', () => {
    it('generates suggestion and invokes callback', async () => {
      const suggestion = { type: 'narration', content: 'A dark figure appears', confidence: 0.8 };
      const generateFn = vi.fn().mockResolvedValue(suggestion);
      const callback = vi.fn();

      monitor.setGenerateSuggestionFn(generateFn);
      monitor.setOnAutonomousSuggestionCallback(callback);

      await monitor._handleSilenceEvent({
        silenceDurationMs: 30000,
        lastActivityTime: Date.now() - 30000,
        silenceCount: 1
      });

      expect(generateFn).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        suggestion: expect.objectContaining({ type: 'narration', content: 'A dark figure appears' }),
        silenceEvent: expect.objectContaining({ silenceCount: 1 })
      }));
      expect(monitor.silenceSuggestionCount).toBe(1);
    });

    it('does nothing without generate suggestion function', async () => {
      const callback = vi.fn();
      monitor.setOnAutonomousSuggestionCallback(callback);

      await monitor._handleSilenceEvent({
        silenceDurationMs: 30000,
        lastActivityTime: Date.now() - 30000,
        silenceCount: 1
      });

      expect(callback).not.toHaveBeenCalled();
      expect(monitor.silenceSuggestionCount).toBe(0);
    });

    it('handles null suggestion gracefully (no callback invocation)', async () => {
      const generateFn = vi.fn().mockResolvedValue(null);
      const callback = vi.fn();

      monitor.setGenerateSuggestionFn(generateFn);
      monitor.setOnAutonomousSuggestionCallback(callback);

      await monitor._handleSilenceEvent({
        silenceDurationMs: 30000,
        lastActivityTime: 0,
        silenceCount: 1
      });

      expect(callback).not.toHaveBeenCalled();
      expect(monitor.silenceSuggestionCount).toBe(0);
    });

    it('handles callback error gracefully', async () => {
      const suggestion = { type: 'narration', content: 'suggestion', confidence: 0.8 };
      const generateFn = vi.fn().mockResolvedValue(suggestion);
      const callback = vi.fn().mockImplementation(() => { throw new Error('callback error'); });

      monitor.setGenerateSuggestionFn(generateFn);
      monitor.setOnAutonomousSuggestionCallback(callback);

      // Should not throw
      await monitor._handleSilenceEvent({ silenceDurationMs: 30000, lastActivityTime: 0, silenceCount: 1 });

      // Suggestion was still tracked
      expect(monitor.silenceSuggestionCount).toBe(1);
    });

    it('handles generate function error gracefully', async () => {
      const generateFn = vi.fn().mockRejectedValue(new Error('API down'));
      monitor.setGenerateSuggestionFn(generateFn);

      // Should not throw
      await monitor._handleSilenceEvent({ silenceDurationMs: 30000, lastActivityTime: 0, silenceCount: 1 });

      expect(monitor.silenceSuggestionCount).toBe(0);
    });

    it('works without a callback registered', async () => {
      const suggestion = { type: 'action', content: 'Do something', confidence: 0.7 };
      const generateFn = vi.fn().mockResolvedValue(suggestion);
      monitor.setGenerateSuggestionFn(generateFn);

      // No callback set - should not throw
      await monitor._handleSilenceEvent({ silenceDurationMs: 30000, lastActivityTime: 0, silenceCount: 2 });

      // Suggestion still counted
      expect(monitor.silenceSuggestionCount).toBe(1);
    });

    it('passes correct silenceEvent data to callback', async () => {
      const suggestion = { type: 'dialogue', content: 'NPC speaks', confidence: 0.9 };
      const generateFn = vi.fn().mockResolvedValue(suggestion);
      const callback = vi.fn();

      monitor.setGenerateSuggestionFn(generateFn);
      monitor.setOnAutonomousSuggestionCallback(callback);

      const silenceEvent = {
        silenceDurationMs: 45000,
        lastActivityTime: 1234567890,
        silenceCount: 3
      };

      await monitor._handleSilenceEvent(silenceEvent);

      expect(callback).toHaveBeenCalledWith({
        suggestion,
        silenceEvent: {
          silenceDurationMs: 45000,
          lastActivityTime: 1234567890,
          silenceCount: 3
        }
      });
    });

    it('increments count across multiple events', async () => {
      const suggestion = { type: 'narration', content: 'A suggestion', confidence: 0.8 };
      const generateFn = vi.fn().mockResolvedValue(suggestion);
      monitor.setGenerateSuggestionFn(generateFn);

      await monitor._handleSilenceEvent({ silenceDurationMs: 30000, lastActivityTime: 0, silenceCount: 1 });
      await monitor._handleSilenceEvent({ silenceDurationMs: 60000, lastActivityTime: 0, silenceCount: 2 });
      await monitor._handleSilenceEvent({ silenceDurationMs: 90000, lastActivityTime: 0, silenceCount: 3 });

      expect(monitor.silenceSuggestionCount).toBe(3);
    });
  });

  // =========================================================================
  // _consecutiveSuggestionFailures
  // =========================================================================
  describe('_consecutiveSuggestionFailures counter', () => {
    const silenceEvent = { silenceDurationMs: 30000, lastActivityTime: 0, silenceCount: 1 };

    it('shows warning via ui.notifications.warn after 3 consecutive failures', async () => {
      const warnFn = vi.fn();
      globalThis.ui = { notifications: { warn: warnFn } };
      globalThis.game = { i18n: { localize: vi.fn((key) => key) } };

      const generateFn = vi.fn().mockRejectedValue(new Error('API down'));
      monitor.setGenerateSuggestionFn(generateFn);

      // First two failures — no warning
      await monitor._handleSilenceEvent({ ...silenceEvent, silenceCount: 1 });
      await monitor._handleSilenceEvent({ ...silenceEvent, silenceCount: 2 });
      expect(warnFn).not.toHaveBeenCalled();

      // Third consecutive failure — warning triggered
      await monitor._handleSilenceEvent({ ...silenceEvent, silenceCount: 3 });
      expect(warnFn).toHaveBeenCalledTimes(1);

      delete globalThis.ui;
      delete globalThis.game;
    });

    it('does not trigger warning for fewer than 3 consecutive failures', async () => {
      const warnFn = vi.fn();
      globalThis.ui = { notifications: { warn: warnFn } };

      const generateFn = vi.fn().mockRejectedValue(new Error('API down'));
      monitor.setGenerateSuggestionFn(generateFn);

      await monitor._handleSilenceEvent({ ...silenceEvent, silenceCount: 1 });
      await monitor._handleSilenceEvent({ ...silenceEvent, silenceCount: 2 });

      expect(warnFn).not.toHaveBeenCalled();
      expect(monitor._consecutiveSuggestionFailures).toBe(2);

      delete globalThis.ui;
    });

    it('resets failure counter on successful suggestion after failures', async () => {
      const generateFn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce({ type: 'narration', content: 'Success!', confidence: 0.8 });

      monitor.setGenerateSuggestionFn(generateFn);

      // Two failures
      await monitor._handleSilenceEvent({ ...silenceEvent, silenceCount: 1 });
      await monitor._handleSilenceEvent({ ...silenceEvent, silenceCount: 2 });
      expect(monitor._consecutiveSuggestionFailures).toBe(2);

      // Success — counter resets
      await monitor._handleSilenceEvent({ ...silenceEvent, silenceCount: 3 });
      expect(monitor._consecutiveSuggestionFailures).toBe(0);
    });
  });

  // =========================================================================
  // Integration: full lifecycle
  // =========================================================================
  describe('full lifecycle', () => {
    it('start -> record activity -> stop', () => {
      const sd = createMockSilenceDetector();
      monitor.setSilenceDetector(sd);

      // Start
      expect(monitor.startMonitoring()).toBe(true);
      expect(monitor.isMonitoring).toBe(true);

      // Record activity
      expect(monitor.recordActivity()).toBe(true);
      expect(sd.recordActivity).toHaveBeenCalled();

      // Stop
      monitor.stopMonitoring();
      expect(monitor.isMonitoring).toBe(false);

      // Activity after stop returns false
      expect(monitor.recordActivity()).toBe(false);
    });

    it('replacing detector mid-session restarts cleanly', () => {
      const sd1 = createMockSilenceDetector();
      const sd2 = createMockSilenceDetector();

      monitor.setSilenceDetector(sd1);
      monitor.startMonitoring();
      expect(monitor.isMonitoring).toBe(true);

      // Replace detector - stops monitoring
      monitor.setSilenceDetector(sd2);
      expect(sd1.stop).toHaveBeenCalled();
      expect(monitor.isMonitoring).toBe(false);

      // Restart with new detector
      expect(monitor.startMonitoring()).toBe(true);
      expect(sd2.setOnSilenceCallback).toHaveBeenCalled();
      expect(sd2.start).toHaveBeenCalled();
      expect(monitor.isMonitoring).toBe(true);
    });
  });
});
