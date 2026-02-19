import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle } from '../../scripts/utils/DomUtils.mjs';

describe('DomUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── debounce ───────────────────────────────────────────────────────────

  describe('debounce()', () => {
    it('should delay execution by the specified delay', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 200);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(199);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset the delay on repeated calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(80);
      debounced(); // Reset timer
      vi.advanceTimersByTime(80);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(20);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the original function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should use the latest arguments when reset', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('first');
      vi.advanceTimersByTime(50);
      debounced('second');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('second');
    });

    it('should preserve "this" context', () => {
      const obj = {
        value: 42,
        method: debounce(function () {
          return this.value;
        }, 50)
      };

      let captured;
      const original = vi.fn(function () {
        captured = this;
      });
      const debounced = debounce(original, 50);

      const context = { name: 'ctx' };
      debounced.call(context);
      vi.advanceTimersByTime(50);
      expect(captured).toBe(context);
    });

    it('should only execute once after rapid successive calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      for (let i = 0; i < 20; i++) {
        debounced();
      }

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    describe('cancel()', () => {
      it('should prevent pending execution', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.cancel();

        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
      });

      it('should be safe to call cancel when no pending execution', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        expect(() => debounced.cancel()).not.toThrow();
      });

      it('should allow new calls after cancel', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.cancel();
        debounced();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ── throttle ───────────────────────────────────────────────────────────

  describe('throttle()', () => {
    it('should execute immediately on the first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should suppress calls within the interval', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled(); // Executes immediately
      throttled(); // Suppressed
      throttled(); // Suppressed

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should allow a call after the interval has elapsed', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      vi.advanceTimersByTime(100);
      throttled();

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to the original function', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('a', 'b');
      expect(fn).toHaveBeenCalledWith('a', 'b');
    });

    it('should preserve "this" context', () => {
      let captured;
      const fn = vi.fn(function () {
        captured = this;
      });
      const throttled = throttle(fn, 100);

      const context = { name: 'ctx' };
      throttled.call(context);
      expect(captured).toBe(context);
    });

    it('should execute at regular intervals during continuous calls', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      // Call every 10ms for 500ms
      // With Date.now() based throttle, setSystemTime controls the clock
      const start = Date.now();
      for (let t = 0; t < 500; t += 10) {
        vi.setSystemTime(start + t);
        throttled();
      }

      // First call at t=0, then at t=100, t=200, t=300, t=400 = 5 calls
      expect(fn.mock.calls.length).toBeGreaterThanOrEqual(4);
      expect(fn.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it('should not execute suppressed calls later', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled(); // Executes
      throttled(); // Suppressed (does not queue)

      vi.advanceTimersByTime(200);
      // Still only 1 call — the suppressed call is dropped
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use the arguments of the executed call, not suppressed calls', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('first');
      throttled('second'); // Suppressed

      expect(fn).toHaveBeenCalledWith('first');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
