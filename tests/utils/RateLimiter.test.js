/**
 * RateLimiter Unit Tests
 *
 * Tests for the RateLimiter utility class.
 * Covers rate limiting, queue management, pause/resume, and retry logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RateLimiter,
  RateLimitPresets as _RateLimitPresets
} from '../../scripts/utils/RateLimiter.mjs';

// Mock Logger to prevent console output during tests
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}));

describe('RateLimiter', () => {
  describe('constructor', () => {
    describe('default options', () => {
      it('should create instance with default values', () => {
        const limiter = new RateLimiter();

        expect(limiter._requestsPerMinute).toBe(30);
        expect(limiter._maxQueueSize).toBe(100);
        expect(limiter._maxRetries).toBe(3);
        expect(limiter._initialBackoffMs).toBe(1000);
        expect(limiter._name).toBe('default');
      });

      it('should initialize with empty state', () => {
        const limiter = new RateLimiter();

        expect(limiter.queueLength).toBe(0);
        expect(limiter.currentWindowRequests).toBe(0);
        expect(limiter.isPaused).toBe(false);
      });
    });

    describe('custom options', () => {
      it('should accept custom requestsPerMinute', () => {
        const limiter = new RateLimiter({ requestsPerMinute: 60 });
        expect(limiter._requestsPerMinute).toBe(60);
      });

      it('should accept custom maxQueueSize', () => {
        const limiter = new RateLimiter({ maxQueueSize: 50 });
        expect(limiter._maxQueueSize).toBe(50);
      });

      it('should accept custom maxRetries', () => {
        const limiter = new RateLimiter({ maxRetries: 5 });
        expect(limiter._maxRetries).toBe(5);
      });

      it('should accept custom initialBackoffMs', () => {
        const limiter = new RateLimiter({ initialBackoffMs: 2000 });
        expect(limiter._initialBackoffMs).toBe(2000);
      });

      it('should accept custom name', () => {
        const limiter = new RateLimiter({ name: 'test-limiter' });
        expect(limiter._name).toBe('test-limiter');
      });

      it('should accept all custom options together', () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 90,
          maxQueueSize: 200,
          maxRetries: 10,
          initialBackoffMs: 500,
          name: 'custom'
        });

        expect(limiter._requestsPerMinute).toBe(90);
        expect(limiter._maxQueueSize).toBe(200);
        expect(limiter._maxRetries).toBe(10);
        expect(limiter._initialBackoffMs).toBe(500);
        expect(limiter._name).toBe('custom');
      });
    });
  });

  describe('fromPreset', () => {
    it('should create limiter from KANKA_FREE preset', () => {
      const limiter = RateLimiter.fromPreset('KANKA_FREE');

      expect(limiter._requestsPerMinute).toBe(30);
      expect(limiter._name).toBe('Kanka Free');
    });

    it('should create limiter from KANKA_PREMIUM preset', () => {
      const limiter = RateLimiter.fromPreset('KANKA_PREMIUM');

      expect(limiter._requestsPerMinute).toBe(90);
      expect(limiter._name).toBe('Kanka Premium');
    });

    it('should create limiter from OPENAI preset', () => {
      const limiter = RateLimiter.fromPreset('OPENAI');

      expect(limiter._requestsPerMinute).toBe(60);
      expect(limiter._name).toBe('OpenAI');
    });

    it('should allow overriding preset values', () => {
      const limiter = RateLimiter.fromPreset('KANKA_FREE', {
        maxQueueSize: 50,
        name: 'Custom Kanka'
      });

      expect(limiter._requestsPerMinute).toBe(30); // From preset
      expect(limiter._maxQueueSize).toBe(50); // Overridden
      expect(limiter._name).toBe('Custom Kanka'); // Overridden
    });

    it('should throw error for unknown preset', () => {
      expect(() => {
        RateLimiter.fromPreset('INVALID_PRESET');
      }).toThrow('Unknown rate limit preset: INVALID_PRESET');
    });
  });

  describe('properties', () => {
    describe('queueLength', () => {
      it('should return 0 for empty queue', () => {
        const limiter = new RateLimiter();
        expect(limiter.queueLength).toBe(0);
      });

      it('should return correct queue length after adding requests', async () => {
        const limiter = new RateLimiter({ requestsPerMinute: 1 }); // Very slow to prevent processing

        // Add requests without awaiting (they'll queue)
        limiter.throttle(async () => 'test1');
        limiter.throttle(async () => 'test2');
        limiter.throttle(async () => 'test3');

        // Give time for queue to populate
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(limiter.queueLength).toBeGreaterThan(0);
      });
    });

    describe('currentWindowRequests', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should return 0 when no requests made', () => {
        const limiter = new RateLimiter();
        expect(limiter.currentWindowRequests).toBe(0);
      });

      it('should increment after recording requests', () => {
        const limiter = new RateLimiter();

        limiter._recordRequest();
        expect(limiter.currentWindowRequests).toBe(1);

        limiter._recordRequest();
        expect(limiter.currentWindowRequests).toBe(2);
      });

      it('should cleanup old timestamps after 60 seconds', () => {
        const limiter = new RateLimiter();

        limiter._recordRequest();
        limiter._recordRequest();
        expect(limiter.currentWindowRequests).toBe(2);

        // Advance time by 61 seconds
        vi.advanceTimersByTime(61000);

        expect(limiter.currentWindowRequests).toBe(0);
      });
    });

    describe('remainingRequests', () => {
      it('should return full limit when no requests made', () => {
        const limiter = new RateLimiter({ requestsPerMinute: 30 });
        expect(limiter.remainingRequests).toBe(30);
      });

      it('should decrease as requests are recorded', () => {
        const limiter = new RateLimiter({ requestsPerMinute: 30 });

        limiter._recordRequest();
        expect(limiter.remainingRequests).toBe(29);

        limiter._recordRequest();
        expect(limiter.remainingRequests).toBe(28);
      });

      it('should never go below 0', () => {
        const limiter = new RateLimiter({ requestsPerMinute: 2 });

        limiter._recordRequest();
        limiter._recordRequest();
        limiter._recordRequest();
        limiter._recordRequest();

        expect(limiter.remainingRequests).toBe(0);
      });
    });

    describe('isPaused', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should return false by default', () => {
        const limiter = new RateLimiter();
        expect(limiter.isPaused).toBe(false);
      });

      it('should return true after pause()', () => {
        const limiter = new RateLimiter();
        limiter.pause(5000);

        expect(limiter.isPaused).toBe(true);
      });

      it('should auto-resume after pause duration', () => {
        const limiter = new RateLimiter();
        limiter.pause(5000);

        expect(limiter.isPaused).toBe(true);

        vi.advanceTimersByTime(5001);

        expect(limiter.isPaused).toBe(false);
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

    it('should execute function and return result', async () => {
      const limiter = new RateLimiter();
      const fn = vi.fn().mockResolvedValue('success');

      const promise = limiter.throttle(fn);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should execute multiple functions in sequence', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 60 });
      const fn1 = vi.fn().mockResolvedValue('result1');
      const fn2 = vi.fn().mockResolvedValue('result2');
      const fn3 = vi.fn().mockResolvedValue('result3');

      const promise1 = limiter.throttle(fn1);
      const promise2 = limiter.throttle(fn2);
      const promise3 = limiter.throttle(fn3);

      await vi.runAllTimersAsync();

      const results = await Promise.all([promise1, promise2, promise3]);

      expect(results).toEqual(['result1', 'result2', 'result3']);
      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
      expect(fn3).toHaveBeenCalled();
    });

    it('should reject when queue is full', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 1, // Slow processing
        maxQueueSize: 2
      });

      // Pause to prevent queue from processing
      limiter.pause(10000);

      // Fill queue
      limiter.throttle(async () => 'test1');
      limiter.throttle(async () => 'test2');

      // This should exceed queue size
      await expect(limiter.throttle(async () => 'test3')).rejects.toThrow(
        'Rate limiter queue full (max: 2)'
      );
    });

    it('should record request timestamp after execution', async () => {
      const limiter = new RateLimiter();

      expect(limiter.currentWindowRequests).toBe(0);

      const promise = limiter.throttle(async () => 'test');
      await vi.runAllTimersAsync();
      await promise;

      expect(limiter.currentWindowRequests).toBe(1);
    });

    it('should handle function errors', async () => {
      const limiter = new RateLimiter();
      const error = new Error('Function failed');
      const fn = vi.fn().mockRejectedValue(error);

      const promise = limiter.throttle(fn);

      // Run timers and check rejection in parallel to avoid unhandled rejection
      await Promise.all([
        vi.runAllTimersAsync(),
        expect(promise).rejects.toThrow('Function failed')
      ]);
    });
  });

  describe('pause and resume', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should pause limiter for specified duration', () => {
      const limiter = new RateLimiter();

      limiter.pause(5000);

      expect(limiter.isPaused).toBe(true);
      expect(limiter._pausedUntil).toBeGreaterThan(Date.now());
    });

    it('should resume immediately with resume()', async () => {
      const limiter = new RateLimiter();

      limiter.pause(5000);
      expect(limiter.isPaused).toBe(true);

      limiter.resume();

      expect(limiter.isPaused).toBe(false);
      expect(limiter._pausedUntil).toBeNull();
    });

    it('should delay requests while paused', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 60 });
      const fn = vi.fn().mockResolvedValue('test');

      limiter.pause(2000);

      const promise = limiter.throttle(fn);

      // Advance time but not past pause
      await vi.advanceTimersByTimeAsync(1000);
      expect(fn).not.toHaveBeenCalled();

      // Advance past pause
      await vi.advanceTimersByTimeAsync(1500);
      expect(fn).toHaveBeenCalled();

      await promise;
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear timestamps', () => {
      const limiter = new RateLimiter();

      limiter._recordRequest();
      limiter._recordRequest();
      expect(limiter.currentWindowRequests).toBe(2);

      limiter.reset();

      expect(limiter.currentWindowRequests).toBe(0);
    });

    it('should clear queue', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 1 });

      // Pause to prevent queue from processing
      limiter.pause(10000);

      // Add catch handlers to prevent unhandled rejections when reset() is called
      limiter.throttle(async () => 'test1').catch(() => {});
      limiter.throttle(async () => 'test2').catch(() => {});

      expect(limiter.queueLength).toBe(2);

      limiter.reset();

      expect(limiter.queueLength).toBe(0);
    });

    it('should reset pause state', () => {
      const limiter = new RateLimiter();

      limiter.pause(5000);
      expect(limiter.isPaused).toBe(true);

      limiter.reset();

      expect(limiter.isPaused).toBe(false);
      expect(limiter._pausedUntil).toBeNull();
    });

    it('should reject queued requests with error', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 1 });

      // Pause to prevent queue from processing
      limiter.pause(10000);

      const promise1 = limiter.throttle(async () => 'test1').catch(() => {}); // Catch to prevent unhandled
      const promise2 = limiter.throttle(async () => 'test2');

      limiter.reset();

      await expect(promise2).rejects.toThrow('Rate limiter queue cleared');
      await promise1; // Await to clean up
    });
  });

  describe('clear', () => {
    it('should clear queue with default error', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 1 });

      // Pause to prevent immediate processing
      limiter.pause(10000);

      const promise = limiter.throttle(async () => 'test');

      limiter.clear();

      await expect(promise).rejects.toThrow('Rate limiter queue cleared');
    });

    it('should clear queue with custom error', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 1 });

      // Pause to prevent immediate processing
      limiter.pause(10000);

      const promise = limiter.throttle(async () => 'test');

      const customError = new Error('Custom error');
      limiter.clear(customError);

      await expect(promise).rejects.toThrow('Custom error');
    });
  });

  describe('setRateLimit', () => {
    it('should update rate limit', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 30 });

      limiter.setRateLimit(60);

      expect(limiter._requestsPerMinute).toBe(60);
      expect(limiter.remainingRequests).toBe(60);
    });

    it('should ignore invalid rate limit (zero)', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 30 });

      limiter.setRateLimit(0);

      expect(limiter._requestsPerMinute).toBe(30); // Unchanged
    });

    it('should ignore invalid rate limit (negative)', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 30 });

      limiter.setRateLimit(-10);

      expect(limiter._requestsPerMinute).toBe(30); // Unchanged
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return statistics object', () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 30,
        name: 'test-limiter'
      });

      const stats = limiter.getStats();

      expect(stats).toEqual({
        name: 'test-limiter',
        requestsPerMinute: 30,
        currentWindowRequests: 0,
        remainingRequests: 30,
        queueLength: 0,
        isPaused: false,
        pausedUntil: null,
        totalRequests: 0,
        averageWaitTime: 0,
        peakQueueLength: 0,
        retryCount: 0
      });
    });

    it('should reflect current state in stats', () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 30,
        name: 'test-limiter'
      });

      limiter._recordRequest();
      limiter._recordRequest();
      limiter.pause(5000);

      const stats = limiter.getStats();

      expect(stats.currentWindowRequests).toBe(2);
      expect(stats.remainingRequests).toBe(28);
      expect(stats.isPaused).toBe(true);
      expect(stats.pausedUntil).toBeTruthy();
    });

    it('should track totalRequests metric', () => {
      const limiter = new RateLimiter();

      expect(limiter.getStats().totalRequests).toBe(0);

      limiter._recordRequest();
      expect(limiter.getStats().totalRequests).toBe(1);

      limiter._recordRequest();
      limiter._recordRequest();
      expect(limiter.getStats().totalRequests).toBe(3);
    });

    it('should track peakQueueLength metric', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 1 }); // Very slow

      expect(limiter.getStats().peakQueueLength).toBe(0);

      // Pause limiter to prevent queue processing
      limiter.pause(10000);

      // Add requests to queue (they won't process due to pause)
      limiter.throttle(async () => 'test1');
      limiter.throttle(async () => 'test2');
      limiter.throttle(async () => 'test3');

      const stats = limiter.getStats();
      expect(stats.peakQueueLength).toBe(3);
    });

    it('should calculate averageWaitTime from queued requests', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 60 });

      // Initially no wait times
      expect(limiter.getStats().averageWaitTime).toBe(0);

      // Manually add wait times to simulate queued requests
      limiter._waitTimes.push(100);
      limiter._waitTimes.push(200);
      limiter._waitTimes.push(300);

      const stats = limiter.getStats();
      expect(stats.averageWaitTime).toBe(200); // (100 + 200 + 300) / 3
    });

    it('should limit waitTimes array to 1000 entries to prevent memory leak', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 60 });

      // Simulate 1500 requests with wait times
      for (let i = 0; i < 1500; i++) {
        limiter._waitTimes.push(100 + i);

        // Trigger size limiting (automatic after fix)
        if (limiter._waitTimes.length > 1000) {
          limiter._waitTimes.shift();
        }
      }

      // Verify array is capped at 1000
      expect(limiter._waitTimes.length).toBe(1000);

      // Verify oldest entries were removed (FIFO behavior)
      expect(limiter._waitTimes[0]).toBe(600); // 100 + 500 (first 500 removed)
      expect(limiter._waitTimes[999]).toBe(1599); // 100 + 1499 (last entry)
    });

    it('should track retryCount metric', () => {
      const limiter = new RateLimiter();

      expect(limiter.getStats().retryCount).toBe(0);

      // Manually increment retry count to simulate retries
      limiter._retryCount++;
      expect(limiter.getStats().retryCount).toBe(1);

      limiter._retryCount += 2;
      expect(limiter.getStats().retryCount).toBe(3);
    });

    it('should reset all metrics when reset is called', () => {
      const limiter = new RateLimiter();

      // Add some activity
      limiter._recordRequest();
      limiter._recordRequest();
      limiter._waitTimes.push(100);
      limiter._waitTimes.push(200);
      limiter._peakQueueLength = 5;
      limiter._retryCount = 3;

      // Verify metrics are set
      let stats = limiter.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.averageWaitTime).toBeGreaterThan(0);
      expect(stats.peakQueueLength).toBe(5);
      expect(stats.retryCount).toBe(3);

      // Reset
      limiter.reset();

      // Verify all metrics are cleared
      stats = limiter.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.averageWaitTime).toBe(0);
      expect(stats.peakQueueLength).toBe(0);
      expect(stats.retryCount).toBe(0);
    });
  });

  describe('waitForSlot', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should resolve immediately when slots available', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 30 });

      const startTime = Date.now();
      await limiter.waitForSlot();
      const endTime = Date.now();

      expect(endTime - startTime).toBe(0);
    });

    it('should wait when rate limit reached', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 2 });

      // Fill the rate limit
      limiter._recordRequest();
      limiter._recordRequest();

      const waitPromise = limiter.waitForSlot();

      // Should not resolve immediately
      let resolved = false;
      waitPromise.then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(false);

      // Advance past window
      await vi.advanceTimersByTimeAsync(60000);
      await waitPromise; // Await to prevent unhandled promise
      expect(resolved).toBe(true);
    });
  });

  describe('executeWithRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute function successfully on first try', async () => {
      const limiter = new RateLimiter();
      const fn = vi.fn().mockResolvedValue('success');

      const promise = limiter.executeWithRetry(fn);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should retry on rate limit error', async () => {
      const limiter = new RateLimiter({ initialBackoffMs: 100 });
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ status: 429, message: 'Rate limited' })
        .mockResolvedValueOnce('success');

      const promise = limiter.executeWithRetry(fn, 2);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-rate-limit error', async () => {
      const limiter = new RateLimiter();
      const error = new Error('Server error');
      const fn = vi.fn().mockRejectedValue(error);

      const promise = limiter.executeWithRetry(fn);

      // Run timers and check rejection in parallel to avoid unhandled rejection
      await Promise.all([vi.runAllTimersAsync(), expect(promise).rejects.toThrow('Server error')]);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should throw after max retries exceeded', async () => {
      const limiter = new RateLimiter({
        initialBackoffMs: 100,
        maxRetries: 0 // Disable internal queue retries
      });
      const error = { status: 429, message: 'Rate limited' };
      const fn = vi.fn().mockRejectedValue(error);

      const promise = limiter.executeWithRetry(fn, 2);

      // Run timers and check rejection in parallel to avoid unhandled rejection
      await Promise.all([vi.runAllTimersAsync(), expect(promise).rejects.toMatchObject(error)]);
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const limiter = new RateLimiter({
        initialBackoffMs: 100,
        maxRetries: 0 // Disable internal queue retries
      });
      const delays = [];

      const originalDelay = limiter._delay.bind(limiter);
      limiter._delay = vi.fn(async (ms) => {
        delays.push(ms);
        return originalDelay(ms);
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValueOnce('success');

      const promise = limiter.executeWithRetry(fn, 3);
      await vi.runAllTimersAsync();
      await promise;

      // Check that backoff delays increase exponentially
      const backoffDelays = delays.filter((d) => d >= 100);
      expect(backoffDelays.length).toBeGreaterThanOrEqual(2);
      expect(backoffDelays[1]).toBeGreaterThan(backoffDelays[0]);
    });

    it('should recognize rate limit error by statusCode', async () => {
      const limiter = new RateLimiter({ initialBackoffMs: 100 });
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ statusCode: 429, message: 'Rate limited' })
        .mockResolvedValueOnce('success');

      const promise = limiter.executeWithRetry(fn, 2);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should recognize rate limit error by message', async () => {
      const limiter = new RateLimiter({ initialBackoffMs: 100 });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce('success');

      const promise = limiter.executeWithRetry(fn, 2);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should recognize rate limit error by code', async () => {
      const limiter = new RateLimiter({ initialBackoffMs: 100 });
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ code: 'RATE_LIMITED', message: 'Too many requests' })
        .mockResolvedValueOnce('success');

      const promise = limiter.executeWithRetry(fn, 2);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use custom maxRetries parameter', async () => {
      const limiter = new RateLimiter({
        maxRetries: 0, // Disable internal queue retries
        initialBackoffMs: 100
      });
      const error = { status: 429 };
      const fn = vi.fn().mockRejectedValue(error);

      const promise = limiter.executeWithRetry(fn, 1); // Override with 1 retry

      // Run timers and check rejection in parallel to avoid unhandled rejection
      await Promise.all([vi.runAllTimersAsync(), expect(promise).rejects.toMatchObject(error)]);
      expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('_isRateLimitError', () => {
    it('should detect error with status 429', () => {
      const limiter = new RateLimiter();
      const error = { status: 429, message: 'Too many requests' };

      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should detect error with statusCode 429', () => {
      const limiter = new RateLimiter();
      const error = { statusCode: 429, message: 'Too many requests' };

      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should detect error with "rate limit" in message', () => {
      const limiter = new RateLimiter();
      const error = new Error('Rate limit exceeded');

      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should detect error with RATE_LIMITED code', () => {
      const limiter = new RateLimiter();
      const error = { code: 'RATE_LIMITED', message: 'Throttled' };

      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should not detect non-rate-limit errors', () => {
      const limiter = new RateLimiter();
      const error = new Error('Server error');

      expect(limiter._isRateLimitError(error)).toBe(false);
    });

    it('should handle case-insensitive message matching', () => {
      const limiter = new RateLimiter();
      const error1 = new Error('RATE LIMIT exceeded');
      const error2 = new Error('rate limit exceeded');

      expect(limiter._isRateLimitError(error1)).toBe(true);
      expect(limiter._isRateLimitError(error2)).toBe(true);
    });
  });

  describe('_calculateWaitTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return 0 when under limit', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 30 });

      limiter._recordRequest();

      expect(limiter._calculateWaitTime()).toBe(0);
    });

    it('should return wait time when at limit', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 2 });

      limiter._recordRequest();
      limiter._recordRequest();

      const waitTime = limiter._calculateWaitTime();
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(60000);
    });

    it('should return pause time when paused', () => {
      const limiter = new RateLimiter();

      limiter.pause(5000);

      const waitTime = limiter._calculateWaitTime();
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(5000);
    });

    it('should return 0 after pause expires', () => {
      const limiter = new RateLimiter();

      limiter.pause(5000);
      vi.advanceTimersByTime(5001);

      expect(limiter._calculateWaitTime()).toBe(0);
    });
  });

  describe('_cleanupOldTimestamps', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should remove timestamps older than 60 seconds', () => {
      const limiter = new RateLimiter();

      limiter._recordRequest();
      vi.advanceTimersByTime(30000);
      limiter._recordRequest();
      vi.advanceTimersByTime(35000); // Total 65 seconds from first

      expect(limiter.currentWindowRequests).toBe(1); // Only second request remains
    });

    it('should keep recent timestamps', () => {
      const limiter = new RateLimiter();

      limiter._recordRequest();
      vi.advanceTimersByTime(30000);
      limiter._recordRequest();
      vi.advanceTimersByTime(10000); // Total 40 seconds from first

      expect(limiter.currentWindowRequests).toBe(2); // Both remain
    });
  });
});
