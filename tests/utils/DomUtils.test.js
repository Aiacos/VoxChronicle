import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../scripts/utils/DomUtils.mjs';

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

});
