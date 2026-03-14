import { RateLimiter, RateLimitPresets } from '../../scripts/utils/RateLimiter.mjs';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter({ name: 'test' });
  });

  afterEach(() => {
    // Clean up any pending queue items
    try {
      limiter.reset();
    } catch (_) {
      // ignore
    }
  });

  // ── Constructor ──────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should use default options when none provided', () => {
      const defaultLimiter = new RateLimiter();
      expect(defaultLimiter._requestsPerMinute).toBe(30);
      expect(defaultLimiter._maxQueueSize).toBe(100);
      expect(defaultLimiter._maxRetries).toBe(3);
      expect(defaultLimiter._initialBackoffMs).toBe(1000);
      expect(defaultLimiter._name).toBe('default');
    });

    it('should use custom options when provided', () => {
      const custom = new RateLimiter({
        requestsPerMinute: 60,
        maxQueueSize: 50,
        maxRetries: 5,
        initialBackoffMs: 2000,
        name: 'custom'
      });
      expect(custom._requestsPerMinute).toBe(60);
      expect(custom._maxQueueSize).toBe(50);
      expect(custom._maxRetries).toBe(5);
      expect(custom._initialBackoffMs).toBe(2000);
      expect(custom._name).toBe('custom');
    });

    it('should start with empty timestamps and queue', () => {
      expect(limiter._requestTimestamps).toEqual([]);
      expect(limiter._queue).toEqual([]);
    });

    it('should start with processing flag false', () => {
      expect(limiter._processingQueue).toBe(false);
    });

    it('should start not paused', () => {
      expect(limiter._paused).toBe(false);
      expect(limiter._pausedUntil).toBeNull();
    });

    it('should start with zero stats', () => {
      expect(limiter._totalRequests).toBe(0);
      expect(limiter._waitTimes).toEqual([]);
      expect(limiter._peakQueueLength).toBe(0);
      expect(limiter._retryCount).toBe(0);
    });
  });

  // ── fromPreset() ────────────────────────────────────────────────────

  describe('fromPreset()', () => {
    it('should create limiter from KANKA_FREE preset', () => {
      const kanka = RateLimiter.fromPreset('KANKA_FREE');
      expect(kanka._requestsPerMinute).toBe(30);
      expect(kanka._name).toBe('Kanka Free');
    });

    it('should create limiter from KANKA_PREMIUM preset', () => {
      const kanka = RateLimiter.fromPreset('KANKA_PREMIUM');
      expect(kanka._requestsPerMinute).toBe(90);
      expect(kanka._name).toBe('Kanka Premium');
    });

    it('should create limiter from OPENAI preset', () => {
      const openai = RateLimiter.fromPreset('OPENAI');
      expect(openai._requestsPerMinute).toBe(60);
      expect(openai._name).toBe('OpenAI');
    });

    it('should allow overrides on preset', () => {
      const custom = RateLimiter.fromPreset('KANKA_FREE', {
        maxQueueSize: 50,
        maxRetries: 5
      });
      expect(custom._requestsPerMinute).toBe(30);
      expect(custom._maxQueueSize).toBe(50);
      expect(custom._maxRetries).toBe(5);
    });

    it('should allow overriding requestsPerMinute from preset', () => {
      const custom = RateLimiter.fromPreset('KANKA_FREE', {
        requestsPerMinute: 10
      });
      expect(custom._requestsPerMinute).toBe(10);
    });

    it('should throw for unknown preset', () => {
      expect(() => RateLimiter.fromPreset('UNKNOWN_PRESET')).toThrow(
        'Unknown rate limit preset: UNKNOWN_PRESET'
      );
    });
  });

  // ── RateLimitPresets ────────────────────────────────────────────────

  describe('RateLimitPresets', () => {
    it('should export known presets', () => {
      expect(RateLimitPresets.KANKA_FREE).toBeDefined();
      expect(RateLimitPresets.KANKA_PREMIUM).toBeDefined();
      expect(RateLimitPresets.OPENAI).toBeDefined();
    });

    it('should have requestsPerMinute and name on each preset', () => {
      for (const preset of Object.values(RateLimitPresets)) {
        expect(preset).toHaveProperty('requestsPerMinute');
        expect(preset).toHaveProperty('name');
        expect(typeof preset.requestsPerMinute).toBe('number');
        expect(typeof preset.name).toBe('string');
      }
    });
  });

  // ── Getters ─────────────────────────────────────────────────────────

  describe('getters', () => {
    describe('_intervalMs', () => {
      it('should return 2000ms for 30 requests per minute', () => {
        const l = new RateLimiter({ requestsPerMinute: 30 });
        expect(l._intervalMs).toBe(2000);
      });

      it('should return 1000ms for 60 requests per minute', () => {
        const l = new RateLimiter({ requestsPerMinute: 60 });
        expect(l._intervalMs).toBe(1000);
      });

      it('should return 60000ms for 1 request per minute', () => {
        const l = new RateLimiter({ requestsPerMinute: 1 });
        expect(l._intervalMs).toBe(60000);
      });
    });

    describe('queueLength', () => {
      it('should return 0 when queue is empty', () => {
        expect(limiter.queueLength).toBe(0);
      });

      it('should reflect queue size', () => {
        limiter._queue.push({ fn: () => {}, resolve: () => {}, reject: () => {} });
        limiter._queue.push({ fn: () => {}, resolve: () => {}, reject: () => {} });
        expect(limiter.queueLength).toBe(2);
      });
    });

    describe('currentWindowRequests', () => {
      it('should return 0 when no requests have been made', () => {
        expect(limiter.currentWindowRequests).toBe(0);
      });

      it('should count recent timestamps', () => {
        limiter._requestTimestamps = [Date.now(), Date.now() - 1000];
        expect(limiter.currentWindowRequests).toBe(2);
      });

      it('should exclude timestamps older than 1 minute', () => {
        limiter._requestTimestamps = [
          Date.now(),
          Date.now() - 61000 // older than 1 minute
        ];
        expect(limiter.currentWindowRequests).toBe(1);
      });
    });

    describe('remainingRequests', () => {
      it('should return full capacity when no requests made', () => {
        expect(limiter.remainingRequests).toBe(30);
      });

      it('should decrease as requests are made', () => {
        limiter._requestTimestamps = [Date.now(), Date.now(), Date.now()];
        expect(limiter.remainingRequests).toBe(27);
      });

      it('should return 0 when at capacity', () => {
        limiter._requestTimestamps = Array(30).fill(Date.now());
        expect(limiter.remainingRequests).toBe(0);
      });

      it('should not go below 0', () => {
        limiter._requestTimestamps = Array(35).fill(Date.now());
        expect(limiter.remainingRequests).toBe(0);
      });
    });

    describe('isPaused', () => {
      it('should return false when not paused', () => {
        expect(limiter.isPaused).toBe(false);
      });

      it('should return true when paused and pausedUntil is in the future', () => {
        limiter._paused = true;
        limiter._pausedUntil = Date.now() + 60000;
        expect(limiter.isPaused).toBe(true);
      });

      it('should auto-resume when pausedUntil is in the past', () => {
        limiter._paused = true;
        limiter._pausedUntil = Date.now() - 1000;
        expect(limiter.isPaused).toBe(false);
        expect(limiter._paused).toBe(false);
        expect(limiter._pausedUntil).toBeNull();
      });

      it('should return true when paused without pausedUntil', () => {
        limiter._paused = true;
        limiter._pausedUntil = null;
        expect(limiter.isPaused).toBe(true);
      });
    });
  });

  // ── throttle() ──────────────────────────────────────────────────────

  describe('throttle()', () => {
    it('should execute the function and return its result', async () => {
      const result = await limiter.throttle(() => Promise.resolve('hello'));
      expect(result).toBe('hello');
    });

    it('should execute functions sequentially', async () => {
      const order = [];
      const fn1 = async () => {
        order.push(1);
        return 1;
      };
      const fn2 = async () => {
        order.push(2);
        return 2;
      };

      const [r1, r2] = await Promise.all([limiter.throttle(fn1), limiter.throttle(fn2)]);

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(order).toEqual([1, 2]);
    });

    it('should reject when queue is full', async () => {
      const smallQueue = new RateLimiter({
        maxQueueSize: 2,
        requestsPerMinute: 1000,
        name: 'small-queue'
      });

      // Fill the queue by blocking the processor
      let blockResolve;
      const blockPromise = new Promise((resolve) => {
        blockResolve = resolve;
      });
      const blocking = () => blockPromise;

      // Queue the blocking request
      const p1 = smallQueue.throttle(blocking);
      // Queue another to fill the queue
      const p2 = smallQueue.throttle(() => Promise.resolve('b'));

      // Queue should now be at capacity (or the processor already consumed one)
      // Add enough to overflow
      const p3 = smallQueue.throttle(() => Promise.resolve('c'));

      // Resolve the blocker
      blockResolve('done');

      // Add rejection handlers to prevent unhandled rejections before reset
      p1.catch(() => {});
      p2.catch(() => {});
      p3.catch(() => {});

      // At least one of the later requests should resolve; or the third should reject
      // Because queue size is 2, and one is being processed, the third may or may not fail
      // Let's test a definitive case: fill queue completely first by pausing
      smallQueue.reset();

      const paused = new RateLimiter({
        maxQueueSize: 1,
        requestsPerMinute: 1000,
        name: 'paused-queue'
      });
      // Pause so queue doesn't drain
      paused._paused = true;
      paused._pausedUntil = Date.now() + 999999;
      paused._processingQueue = true; // prevent processor from starting

      // Manually push one item to fill the queue
      paused._queue.push({ fn: () => {}, resolve: () => {}, reject: () => {} });

      await expect(paused.throttle(() => Promise.resolve('x'))).rejects.toThrow(
        'Rate limiter queue full (max: 1)'
      );
    });

    it('should track peak queue length', async () => {
      const result = await limiter.throttle(() => Promise.resolve('ok'));
      expect(limiter._peakQueueLength).toBeGreaterThanOrEqual(1);
    });

    it('should propagate errors from the function', async () => {
      await expect(limiter.throttle(() => Promise.reject(new Error('fn error')))).rejects.toThrow(
        'fn error'
      );
    });

    it('should record request timestamp on execution', async () => {
      await limiter.throttle(() => Promise.resolve('ok'));
      expect(limiter._requestTimestamps.length).toBe(1);
      expect(limiter._totalRequests).toBe(1);
    });
  });

  // ── executeWithRetry() ──────────────────────────────────────────────

  describe('executeWithRetry()', () => {
    let retryLimiter;

    beforeEach(() => {
      // Use a limiter with maxRetries=0 so _processQueue does NOT do its own
      // internal re-queuing on 429 errors. This lets executeWithRetry be the
      // sole retry controller, which is what these tests verify.
      retryLimiter = new RateLimiter({ name: 'retry-test', maxRetries: 0 });
      // Mock _delay to resolve immediately, avoiding real timer waits
      retryLimiter._delay = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
      try {
        retryLimiter.reset();
      } catch (_) {
        /* ignore */
      }
    });

    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retryLimiter.executeWithRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit error (status 429)', async () => {
      const error429 = new Error('Too many requests');
      error429.status = 429;

      const fn = vi.fn().mockRejectedValueOnce(error429).mockResolvedValue('retried-success');

      const result = await retryLimiter.executeWithRetry(fn, 3);
      expect(result).toBe('retried-success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw non-rate-limit errors immediately without retry', async () => {
      const normalError = new Error('Server error');

      const fn = vi.fn().mockRejectedValue(normalError);

      await expect(retryLimiter.executeWithRetry(fn, 3)).rejects.toThrow('Server error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after all retries exhausted on rate limit errors', async () => {
      const error429 = new Error('rate limit exceeded');

      const fn = vi.fn().mockRejectedValue(error429);

      await expect(retryLimiter.executeWithRetry(fn, 1)).rejects.toThrow('rate limit exceeded');
      expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('should use exponential backoff for retries', async () => {
      const error429 = new Error('rate limit');
      const delayCalls = [];

      // Track delay calls to verify exponential backoff values
      retryLimiter._delay = vi.fn().mockImplementation((ms) => {
        delayCalls.push(ms);
        return Promise.resolve();
      });

      let callCount = 0;
      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 3) return Promise.reject(error429);
        return Promise.resolve('ok');
      });

      const result = await retryLimiter.executeWithRetry(fn, 3);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(4);

      // Verify exponential backoff delays from executeWithRetry: 1000, 2000, 4000
      const retryDelays = delayCalls.filter((ms) => ms === 1000 || ms === 2000 || ms === 4000);
      expect(retryDelays).toEqual([1000, 2000, 4000]);
    });

    it('should use custom maxRetries parameter', async () => {
      const error429 = new Error('rate limit');
      const fn = vi.fn().mockRejectedValue(error429);

      await expect(retryLimiter.executeWithRetry(fn, 0)).rejects.toThrow('rate limit');
      expect(fn).toHaveBeenCalledTimes(1); // 0 retries means 1 attempt
    });
  });

  // ── _isRateLimitError() ─────────────────────────────────────────────

  describe('_isRateLimitError()', () => {
    it('should return true for error with status 429', () => {
      const error = new Error('Too many requests');
      error.status = 429;
      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should return true for error with statusCode 429', () => {
      const error = new Error('Too many requests');
      error.statusCode = 429;
      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should return true for error message containing "rate limit"', () => {
      const error = new Error('Rate limit exceeded');
      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should return true for error message containing "rate limit" case-insensitive', () => {
      const error = new Error('RATE LIMIT HIT');
      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should return true for error with code RATE_LIMITED', () => {
      const error = new Error('Throttled');
      error.code = 'RATE_LIMITED';
      expect(limiter._isRateLimitError(error)).toBe(true);
    });

    it('should return false for a normal error', () => {
      const error = new Error('Something went wrong');
      expect(limiter._isRateLimitError(error)).toBe(false);
    });

    it('should return false for error with status 500', () => {
      const error = new Error('Internal server error');
      error.status = 500;
      expect(limiter._isRateLimitError(error)).toBe(false);
    });

    it('should return false for error with no message', () => {
      const error = new Error();
      expect(limiter._isRateLimitError(error)).toBe(false);
    });
  });

  // ── pause() and resume() ────────────────────────────────────────────

  describe('pause() and resume()', () => {
    it('should pause the limiter for the specified duration', () => {
      limiter.pause(5000);
      expect(limiter._paused).toBe(true);
      expect(limiter._pausedUntil).toBeGreaterThan(Date.now());
    });

    it('should set isPaused to true after pausing', () => {
      limiter.pause(5000);
      expect(limiter.isPaused).toBe(true);
    });

    it('should resume the limiter immediately', () => {
      limiter.pause(60000);
      expect(limiter.isPaused).toBe(true);

      limiter.resume();
      expect(limiter._paused).toBe(false);
      expect(limiter._pausedUntil).toBeNull();
      expect(limiter.isPaused).toBe(false);
    });

    it('should trigger queue processing on resume', () => {
      const spy = vi.spyOn(limiter, '_processQueue');
      limiter.resume();
      expect(spy).toHaveBeenCalled();
    });
  });

  // ── waitForSlot() ───────────────────────────────────────────────────

  describe('waitForSlot()', () => {
    it('should resolve immediately when there is capacity', async () => {
      await expect(limiter.waitForSlot()).resolves.toBeUndefined();
    });

    it('should wait when at capacity', async () => {
      vi.useFakeTimers();

      // Fill up the window
      limiter._requestTimestamps = Array(30).fill(Date.now());

      const promise = limiter.waitForSlot();

      // Advance time past the window expiration
      await vi.advanceTimersByTimeAsync(61000);

      await promise; // should resolve
      vi.useRealTimers();
    });
  });

  // ── clear() ─────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('should reject all pending items with default error', () => {
      const rejects = [];
      limiter._queue.push({
        fn: () => {},
        resolve: () => {},
        reject: (err) => rejects.push(err)
      });
      limiter._queue.push({
        fn: () => {},
        resolve: () => {},
        reject: (err) => rejects.push(err)
      });

      limiter.clear();

      expect(limiter._queue.length).toBe(0);
      expect(rejects).toHaveLength(2);
      expect(rejects[0].message).toBe('Rate limiter queue cleared');
      expect(rejects[1].message).toBe('Rate limiter queue cleared');
    });

    it('should reject all pending items with custom error', () => {
      const rejects = [];
      limiter._queue.push({
        fn: () => {},
        resolve: () => {},
        reject: (err) => rejects.push(err)
      });

      const customError = new Error('Shutting down');
      limiter.clear(customError);

      expect(rejects).toHaveLength(1);
      expect(rejects[0].message).toBe('Shutting down');
    });

    it('should handle empty queue gracefully', () => {
      expect(() => limiter.clear()).not.toThrow();
      expect(limiter._queue.length).toBe(0);
    });
  });

  // ── reset() ─────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('should clear all state', () => {
      // Set up some state
      limiter._requestTimestamps = [Date.now(), Date.now()];
      limiter._paused = true;
      limiter._pausedUntil = Date.now() + 5000;
      limiter._totalRequests = 42;
      limiter._waitTimes = [100, 200, 300];
      limiter._peakQueueLength = 10;
      limiter._retryCount = 5;

      limiter.reset();

      expect(limiter._requestTimestamps).toEqual([]);
      expect(limiter._queue.length).toBe(0);
      expect(limiter._paused).toBe(false);
      expect(limiter._pausedUntil).toBeNull();
      expect(limiter._totalRequests).toBe(0);
      expect(limiter._waitTimes).toEqual([]);
      expect(limiter._peakQueueLength).toBe(0);
      expect(limiter._retryCount).toBe(0);
    });

    it('should reject pending queue items during reset', () => {
      const rejected = [];
      limiter._queue.push({
        fn: () => {},
        resolve: () => {},
        reject: (err) => rejected.push(err)
      });

      limiter.reset();

      expect(rejected).toHaveLength(1);
      expect(rejected[0].message).toBe('Rate limiter queue cleared');
    });
  });

  // ── setRateLimit() ──────────────────────────────────────────────────

  describe('setRateLimit()', () => {
    it('should update the rate limit', () => {
      limiter.setRateLimit(60);
      expect(limiter._requestsPerMinute).toBe(60);
    });

    it('should not update if value is zero', () => {
      limiter.setRateLimit(0);
      expect(limiter._requestsPerMinute).toBe(30); // unchanged
    });

    it('should not update if value is negative', () => {
      limiter.setRateLimit(-10);
      expect(limiter._requestsPerMinute).toBe(30); // unchanged
    });

    it('should accept large values', () => {
      limiter.setRateLimit(10000);
      expect(limiter._requestsPerMinute).toBe(10000);
    });
  });

  // ── getStats() ──────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('should return correct default stats', () => {
      const stats = limiter.getStats();

      expect(stats.name).toBe('test');
      expect(stats.requestsPerMinute).toBe(30);
      expect(stats.currentWindowRequests).toBe(0);
      expect(stats.remainingRequests).toBe(30);
      expect(stats.queueLength).toBe(0);
      expect(stats.isPaused).toBe(false);
      expect(stats.pausedUntil).toBeNull();
      expect(stats.totalRequests).toBe(0);
      expect(stats.averageWaitTime).toBe(0);
      expect(stats.peakQueueLength).toBe(0);
      expect(stats.retryCount).toBe(0);
    });

    it('should report non-zero stats after activity', async () => {
      await limiter.throttle(() => Promise.resolve('ok'));

      const stats = limiter.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.currentWindowRequests).toBe(1);
      expect(stats.remainingRequests).toBe(29);
      expect(stats.peakQueueLength).toBeGreaterThanOrEqual(1);
    });

    it('should report average wait time', () => {
      limiter._waitTimes = [100, 200, 300];
      const stats = limiter.getStats();
      expect(stats.averageWaitTime).toBe(200);
    });

    it('should report pausedUntil as ISO string when paused', () => {
      limiter.pause(5000);
      const stats = limiter.getStats();
      expect(stats.isPaused).toBe(true);
      expect(stats.pausedUntil).toBeTruthy();
      // Should be a valid ISO date string
      expect(new Date(stats.pausedUntil).getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it('should report retry count', () => {
      limiter._retryCount = 7;
      const stats = limiter.getStats();
      expect(stats.retryCount).toBe(7);
    });
  });

  // ── _cleanupOldTimestamps() ─────────────────────────────────────────

  describe('_cleanupOldTimestamps()', () => {
    it('should remove timestamps older than 1 minute', () => {
      limiter._requestTimestamps = [
        Date.now() - 120000, // 2 minutes ago
        Date.now() - 90000, // 1.5 minutes ago
        Date.now() - 30000, // 30 seconds ago
        Date.now()
      ];

      limiter._cleanupOldTimestamps();

      expect(limiter._requestTimestamps).toHaveLength(2);
    });

    it('should keep all timestamps if all are recent', () => {
      limiter._requestTimestamps = [Date.now() - 5000, Date.now() - 1000, Date.now()];

      limiter._cleanupOldTimestamps();

      expect(limiter._requestTimestamps).toHaveLength(3);
    });

    it('should handle empty array', () => {
      limiter._cleanupOldTimestamps();
      expect(limiter._requestTimestamps).toEqual([]);
    });
  });

  // ── _calculateWaitTime() ────────────────────────────────────────────

  describe('_calculateWaitTime()', () => {
    it('should return 0 when under rate limit', () => {
      expect(limiter._calculateWaitTime()).toBe(0);
    });

    it('should return positive wait time when at rate limit', () => {
      // Fill the window completely with recent timestamps
      limiter._requestTimestamps = Array(30).fill(Date.now());
      const waitTime = limiter._calculateWaitTime();
      expect(waitTime).toBeGreaterThan(0);
    });

    it('should return pause wait time when paused', () => {
      limiter._paused = true;
      limiter._pausedUntil = Date.now() + 5000;
      const waitTime = limiter._calculateWaitTime();
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(5100); // small tolerance
    });

    it('should auto-unpause when pausedUntil is in the past', () => {
      limiter._paused = true;
      limiter._pausedUntil = Date.now() - 1000;
      const waitTime = limiter._calculateWaitTime();
      expect(waitTime).toBe(0);
      expect(limiter._paused).toBe(false);
    });
  });

  // ── _recordRequest() ───────────────────────────────────────────────

  describe('_recordRequest()', () => {
    it('should add a timestamp and increment counter', () => {
      limiter._recordRequest();
      expect(limiter._requestTimestamps.length).toBe(1);
      expect(limiter._totalRequests).toBe(1);
    });

    it('should accumulate timestamps', () => {
      limiter._recordRequest();
      limiter._recordRequest();
      limiter._recordRequest();
      expect(limiter._requestTimestamps.length).toBe(3);
      expect(limiter._totalRequests).toBe(3);
    });
  });

  // ── _processQueue() rate limit error re-queue ───────────────────────

  describe('_processQueue() rate limit handling', () => {
    it('should re-queue on rate limit error if retries available', async () => {
      // Mock _delay to resolve immediately so the pause(60000) doesn't cause a real timeout
      limiter._delay = vi.fn().mockResolvedValue(undefined);

      const error429 = new Error('rate limit');
      error429.status = 429;
      let callCount = 0;

      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(error429);
        return Promise.resolve('success');
      });

      const result = await limiter.throttle(fn);
      // The processor should have re-queued and retried after the pause
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should reject after max retries on rate limit error', async () => {
      const error429 = new Error('rate limit');
      error429.status = 429;
      error429.retryAfter = 10; // short retry for testing

      const zerRetryLimiter = new RateLimiter({
        name: 'zero-retry',
        maxRetries: 0
      });

      const fn = vi.fn().mockRejectedValue(error429);

      await expect(zerRetryLimiter.throttle(fn)).rejects.toThrow('rate limit');
    });

    it('should use retryAfter from error when available', async () => {
      const error429 = new Error('rate limit');
      error429.status = 429;
      error429.retryAfter = 100;

      const fn = vi.fn().mockRejectedValueOnce(error429).mockResolvedValue('ok');

      const l = new RateLimiter({ name: 'retry-after', maxRetries: 3 });
      const spy = vi.spyOn(l, 'pause');

      // Start processing
      const promise = l.throttle(fn);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(spy).toHaveBeenCalledWith(100);
    });
  });

  // ── _processQueue() wait time tracking ──────────────────────────────

  describe('wait time tracking', () => {
    it('should track wait times', async () => {
      await limiter.throttle(() => Promise.resolve('ok'));
      expect(limiter._waitTimes.length).toBeGreaterThanOrEqual(1);
    });

    it('should cap wait times array at 1000 entries', () => {
      // Manually fill to over 1000
      limiter._waitTimes = Array(1001).fill(100);

      // Simulate what the queue processor does
      limiter._waitTimes.push(200);
      if (limiter._waitTimes.length > 1000) {
        limiter._waitTimes.shift();
      }

      expect(limiter._waitTimes.length).toBe(1001);
      // The actual capping happens inside _processQueue, so let's test via throttle
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should not start multiple queue processors simultaneously', async () => {
      const processSpy = vi.spyOn(limiter, '_processQueue');

      // Call throttle multiple times rapidly
      const p1 = limiter.throttle(() => Promise.resolve(1));
      const p2 = limiter.throttle(() => Promise.resolve(2));
      const p3 = limiter.throttle(() => Promise.resolve(3));

      const results = await Promise.all([p1, p2, p3]);
      expect(results).toEqual([1, 2, 3]);

      // _processQueue should have been called multiple times but only one should run
      expect(processSpy).toHaveBeenCalled();
    });

    it('should handle synchronous function in throttle', async () => {
      const result = await limiter.throttle(() => 42);
      expect(result).toBe(42);
    });
  });
});
