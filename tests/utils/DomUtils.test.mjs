/**
 * DomUtils Unit Tests
 *
 * Tests for the DomUtils utility functions (debounce, throttle).
 * Covers basic delay behavior, cancel, throttle immediate execution,
 * throttling suppression, context/argument forwarding, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle } from '../../scripts/utils/DomUtils.mjs';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution by the specified delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should only execute once after rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should reset the delay on each call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();

    // Call again, resetting the timer
    debounced();
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the original function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('arg1', 'arg2', 42);
    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 42);
  });

  it('should use the arguments from the last call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('first');
    debounced('second');
    debounced('third');

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('should preserve the calling context (this)', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    const context = { name: 'test-context' };
    debounced.call(context);

    vi.advanceTimersByTime(50);
    expect(fn.mock.instances[0]).toBe(context);
  });

  it('should allow multiple separate executions after delay elapses', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  describe('cancel', () => {
    it('should have a cancel method', () => {
      const debounced = debounce(vi.fn(), 100);
      expect(typeof debounced.cancel).toBe('function');
    });

    it('should prevent pending execution when cancelled', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced.cancel();

      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should be safe to call cancel when nothing is pending', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      // Cancel with no pending call should not throw
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

    it('should be safe to call cancel multiple times', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced.cancel();
      debounced.cancel();
      debounced.cancel();

      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should work with a delay of 0', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 0);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(0);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should work with no arguments', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced();
      vi.advanceTimersByTime(50);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith();
    });
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute immediately on the first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should suppress calls within the throttle interval', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(); // executes (first call)
    throttled(); // suppressed
    throttled(); // suppressed

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should allow execution again after the interval has passed', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(); // executes
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    throttled(); // executes (interval has passed)
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should suppress calls before interval and allow after', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(); // executes at t=0
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    throttled(); // suppressed at t=50
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    throttled(); // executes at t=100
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should pass arguments to the original function', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a', 'b', 123);
    expect(fn).toHaveBeenCalledWith('a', 'b', 123);
  });

  it('should preserve the calling context (this)', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    const context = { name: 'throttle-context' };
    throttled.call(context);

    expect(fn.mock.instances[0]).toBe(context);
  });

  it('should allow multiple executions across multiple intervals', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 50);

    throttled(); // executes at t=0
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    throttled(); // executes at t=50
    expect(fn).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(50);
    throttled(); // executes at t=100
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use arguments from each allowed call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('first');   // executes
    throttled('second');  // suppressed

    vi.advanceTimersByTime(100);
    throttled('third');   // executes

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'first');
    expect(fn).toHaveBeenNthCalledWith(2, 'third');
  });

  describe('edge cases', () => {
    it('should work with an interval of 0 (always executes)', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 0);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should work with no arguments', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith();
    });

    it('should handle rapid successive calls over time', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      // Simulate rapid calls over 500ms
      for (let i = 0; i < 50; i++) {
        throttled();
        vi.advanceTimersByTime(10); // advance 10ms each iteration
      }

      // 500ms total, interval 100ms, so should execute ~6 times
      // (at t=0, t=100, t=200, t=300, t=400, t=500 approximately)
      expect(fn.mock.calls.length).toBeGreaterThanOrEqual(5);
      expect(fn.mock.calls.length).toBeLessThanOrEqual(6);
    });
  });
});
