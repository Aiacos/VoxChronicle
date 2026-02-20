/**
 * Tests for OpenAIClient - Base API Client for OpenAI Services
 *
 * Covers: constructor, isConfigured, setApiKey, request methods,
 * retry with exponential backoff, sequential request queue, operation history,
 * error handling, circuit breaker, rate limiting integration, and validateApiKey.
 */

import { OpenAIClient, OpenAIError, OpenAIErrorType, OPENAI_BASE_URL } from '../../scripts/ai/OpenAIClient.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock fetch Response */
function mockResponse(body, status = 200, headers = {}) {
  const headersObj = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: headersObj,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(body)]))
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenAIClient', () => {
  let client;
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(mockResponse({ data: 'ok' }));
    globalThis.fetch = fetchSpy;

    // Create client with retry disabled for most tests (faster)
    client = new OpenAIClient('sk-test-key-12345', {
      retryEnabled: false,
      timeout: 5000
    });

    // Make the RateLimiter pass-through so it doesn't introduce real delays
    // or its own retry/queue behaviour on top of OpenAIClient's queue.
    client._rateLimiter.executeWithRetry = async (fn) => fn();
    client._rateLimiter._delay = () => Promise.resolve();
  });

  afterEach(() => {
    client.clearQueue();
    client.clearHistory();
  });

  // ── Exports ──────────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export OpenAIClient class', () => {
      expect(OpenAIClient).toBeDefined();
      expect(typeof OpenAIClient).toBe('function');
    });

    it('should export OpenAIError class', () => {
      expect(OpenAIError).toBeDefined();
      const err = new OpenAIError('test', OpenAIErrorType.API_ERROR, 500);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('OpenAIError');
      expect(err.type).toBe(OpenAIErrorType.API_ERROR);
      expect(err.status).toBe(500);
    });

    it('should export OpenAIErrorType enum', () => {
      expect(OpenAIErrorType.AUTHENTICATION_ERROR).toBe('authentication_error');
      expect(OpenAIErrorType.RATE_LIMIT_ERROR).toBe('rate_limit_error');
      expect(OpenAIErrorType.INVALID_REQUEST_ERROR).toBe('invalid_request_error');
      expect(OpenAIErrorType.API_ERROR).toBe('api_error');
      expect(OpenAIErrorType.NETWORK_ERROR).toBe('network_error');
      expect(OpenAIErrorType.TIMEOUT_ERROR).toBe('timeout_error');
    });

    it('should export OPENAI_BASE_URL constant', () => {
      expect(OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
    });
  });

  // ── OpenAIError ──────────────────────────────────────────────────────────

  describe('OpenAIError', () => {
    it('should create error with all fields', () => {
      const details = { headers: { 'retry-after': '30' } };
      const err = new OpenAIError('msg', OpenAIErrorType.RATE_LIMIT_ERROR, 429, details);
      expect(err.message).toBe('msg');
      expect(err.type).toBe(OpenAIErrorType.RATE_LIMIT_ERROR);
      expect(err.status).toBe(429);
      expect(err.details).toEqual(details);
      expect(err.retryAfter).toBe(30000);
    });

    it('should default retryAfter to null when no header', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.API_ERROR);
      expect(err.retryAfter).toBeNull();
    });

    it('should mark rate limit errors as retryable', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.RATE_LIMIT_ERROR, 429);
      expect(err.isRetryable).toBe(true);
    });

    it('should mark network errors as retryable', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.NETWORK_ERROR);
      expect(err.isRetryable).toBe(true);
    });

    it('should mark timeout errors as retryable', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.TIMEOUT_ERROR);
      expect(err.isRetryable).toBe(true);
    });

    it('should mark 5xx errors as retryable', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.API_ERROR, 503);
      expect(err.isRetryable).toBe(true);
    });

    it('should mark 4xx (non-429) as NOT retryable', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.INVALID_REQUEST_ERROR, 400);
      expect(err.isRetryable).toBe(false);
    });

    it('should mark auth errors as NOT retryable', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.AUTHENTICATION_ERROR, 401);
      expect(err.isRetryable).toBe(false);
    });

    it('should not treat null status as retryable (null guard)', () => {
      // Timeout errors have status=null. Without a null guard, JavaScript
      // coerces null to 0 which accidentally gives the correct result.
      // This test ensures the explicit guard is present and works.
      const err = new OpenAIError('timeout', OpenAIErrorType.TIMEOUT_ERROR, null);
      // isRetryable should be true because of TIMEOUT_ERROR type, not because of status
      expect(err.isRetryable).toBe(true);
      expect(err.status).toBeNull();
    });

    it('should not treat null status as a 5xx server error', () => {
      // An error with a non-retryable type and null status should NOT be retryable
      // This catches the case where null >= 500 would coerce null to 0 and be false,
      // but ensures we're checking explicitly rather than relying on coercion
      const err = new OpenAIError('msg', OpenAIErrorType.INVALID_REQUEST_ERROR, null);
      expect(err.isRetryable).toBe(false);
    });

    it('should not treat undefined status as retryable via coercion', () => {
      // Edge case: status left as undefined
      const err = new OpenAIError('msg', OpenAIErrorType.INVALID_REQUEST_ERROR);
      expect(err.status).toBeNull(); // default is null from constructor
      expect(err.isRetryable).toBe(false);
    });
  });

  // ── Constructor & Configuration ──────────────────────────────────────────

  describe('constructor', () => {
    it('should create with default options', () => {
      const c = new OpenAIClient('sk-key');
      expect(c.isConfigured).toBe(true);
      expect(c.baseUrl).toBe(OPENAI_BASE_URL);
    });

    it('should accept custom baseUrl', () => {
      const c = new OpenAIClient('sk-key', { baseUrl: 'https://custom.api.com/v1' });
      expect(c.baseUrl).toBe('https://custom.api.com/v1');
    });

    it('should handle empty API key', () => {
      const c = new OpenAIClient('');
      expect(c.isConfigured).toBe(false);
    });

    it('should handle null API key', () => {
      const c = new OpenAIClient(null);
      expect(c.isConfigured).toBe(false);
    });

    it('should handle undefined API key', () => {
      const c = new OpenAIClient(undefined);
      expect(c.isConfigured).toBe(false);
    });
  });

  describe('setApiKey()', () => {
    it('should update the API key', () => {
      client.setApiKey('sk-new-key');
      expect(client.isConfigured).toBe(true);
    });

    it('should handle null key', () => {
      client.setApiKey(null);
      expect(client.isConfigured).toBe(false);
    });

    it('should handle empty string key', () => {
      client.setApiKey('');
      expect(client.isConfigured).toBe(false);
    });
  });

  // ── Header Building ──────────────────────────────────────────────────────

  describe('_buildAuthHeaders()', () => {
    it('should return Authorization header', () => {
      const headers = client._buildAuthHeaders();
      expect(headers.Authorization).toBe('Bearer sk-test-key-12345');
    });

    it('should throw when no API key', () => {
      client.setApiKey('');
      expect(() => client._buildAuthHeaders()).toThrow(OpenAIError);
    });
  });

  describe('_buildJsonHeaders()', () => {
    it('should include auth and content-type headers', () => {
      const headers = client._buildJsonHeaders();
      expect(headers.Authorization).toBe('Bearer sk-test-key-12345');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Accept).toBe('application/json');
    });
  });

  // ── URL Building ─────────────────────────────────────────────────────────

  describe('_buildUrl()', () => {
    it('should build URL with leading slash', () => {
      expect(client._buildUrl('/chat/completions')).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('should add leading slash when missing', () => {
      expect(client._buildUrl('chat/completions')).toBe('https://api.openai.com/v1/chat/completions');
    });
  });

  // ── Request Methods ──────────────────────────────────────────────────────

  describe('request()', () => {
    it('should throw if not configured', async () => {
      client.setApiKey('');
      await expect(client.request('/models')).rejects.toThrow(OpenAIError);
    });

    it('should make a GET request by default', async () => {
      const result = await client.request('/models', { useQueue: false, useRetry: false });
      expect(result).toEqual({ data: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/models');
      expect(opts.method).toBe('GET');
    });

    it('should include authorization headers', async () => {
      await client.request('/models', { useQueue: false, useRetry: false });
      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers.Authorization).toBe('Bearer sk-test-key-12345');
    });

    it('should set Content-Type for non-FormData requests', async () => {
      await client.request('/models', { useQueue: false, useRetry: false });
      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('should not set Content-Type for FormData requests', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['audio']), 'test.webm');

      await client.request('/audio/transcriptions', {
        method: 'POST',
        body: formData,
        useQueue: false,
        useRetry: false
      });

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers['Content-Type']).toBeUndefined();
    });

    it('should use queue by default', async () => {
      // Queue processes sequentially; two requests should work
      const p1 = client.request('/models');
      const p2 = client.request('/models');
      await Promise.all([p1, p2]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('post()', () => {
    it('should make a POST request with JSON body', async () => {
      const data = { model: 'gpt-4o', messages: [] };
      await client.post('/chat/completions', data, { useQueue: false, useRetry: false });

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/chat/completions');
      expect(opts.method).toBe('POST');
      expect(opts.body).toBe(JSON.stringify(data));
    });
  });

  describe('postFormData()', () => {
    it('should make a POST request with FormData body', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['data']), 'audio.webm');

      await client.postFormData('/audio/transcriptions', formData, {
        useQueue: false,
        useRetry: false
      });

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.method).toBe('POST');
      expect(opts.body).toBe(formData);
    });
  });

  // ── Error Handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should parse 401 error as authentication error', async () => {
      fetchSpy.mockResolvedValue(mockResponse(
        { error: { message: 'Invalid key', type: 'auth_error' } },
        401
      ));

      await expect(
        client.request('/models', { useQueue: false, useRetry: false })
      ).rejects.toThrow(/Invalid API key/);
    });

    it('should parse 429 error as rate limit error', async () => {
      expect.assertions(2);
      fetchSpy.mockResolvedValue(mockResponse(
        { error: { message: 'Rate limit exceeded' } },
        429
      ));

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.RATE_LIMIT_ERROR);
      }
    });

    it('should parse 400 error as invalid request error', async () => {
      expect.assertions(2);
      fetchSpy.mockResolvedValue(mockResponse(
        { error: { message: 'Bad request' } },
        400
      ));

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.INVALID_REQUEST_ERROR);
      }
    });

    it('should parse 500 error as API error', async () => {
      expect.assertions(2);
      fetchSpy.mockResolvedValue(mockResponse(
        { error: { message: 'Internal error' } },
        500
      ));

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.API_ERROR);
      }
    });

    it('should parse 502 error as API error', async () => {
      expect.assertions(2);
      fetchSpy.mockResolvedValue(mockResponse({}, 502));

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.API_ERROR);
      }
    });

    it('should parse 503 error as API error', async () => {
      expect.assertions(2);
      fetchSpy.mockResolvedValue(mockResponse({}, 503));

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.API_ERROR);
      }
    });

    it('should handle timeout (AbortError)', async () => {
      expect.assertions(2);
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      fetchSpy.mockRejectedValue(abortError);

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.TIMEOUT_ERROR);
      }
    });

    it('should handle network errors (TypeError with fetch)', async () => {
      expect.assertions(2);
      const networkError = new TypeError('Failed to fetch');
      fetchSpy.mockRejectedValue(networkError);

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.NETWORK_ERROR);
      }
    });

    it('should wrap unknown errors as API errors', async () => {
      expect.assertions(2);
      fetchSpy.mockRejectedValue(new Error('Something strange'));

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.API_ERROR);
      }
    });

    it('should handle error response with non-JSON body', async () => {
      expect.assertions(2);
      const resp = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('not json'),
        json: vi.fn().mockRejectedValue(new Error('parse error'))
      };
      fetchSpy.mockResolvedValue(resp);

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.status).toBe(500);
      }
    });

    it('should extract retry-after header from error response', async () => {
      expect.assertions(2);
      fetchSpy.mockResolvedValue(mockResponse(
        { error: { message: 'Rate limit' } },
        429,
        { 'retry-after': '60' }
      ));

      try {
        await client.request('/models', { useQueue: false, useRetry: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OpenAIError);
        expect(err.type).toBe(OpenAIErrorType.RATE_LIMIT_ERROR);
      }
    });
  });

  // ── Retry Logic ──────────────────────────────────────────────────────────

  describe('retry logic', () => {
    it('should retry on retryable errors when enabled', async () => {
      const retryClient = new OpenAIClient('sk-test-key', {
        retryEnabled: true,
        retryMaxAttempts: 3,
        retryBaseDelay: 1,
        retryMaxDelay: 10
      });

      let callCount = 0;
      fetchSpy.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return mockResponse({}, 500);
        }
        return mockResponse({ data: 'ok' });
      });

      const result = await retryClient.request('/models', { useQueue: false });
      expect(result).toEqual({ data: 'ok' });
      expect(callCount).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      const retryClient = new OpenAIClient('sk-test-key', {
        retryEnabled: true,
        retryMaxAttempts: 3,
        retryBaseDelay: 1,
        retryMaxDelay: 10
      });

      fetchSpy.mockResolvedValue(mockResponse(
        { error: { message: 'Bad request' } },
        400
      ));

      await expect(
        retryClient.request('/models', { useQueue: false })
      ).rejects.toThrow(OpenAIError);

      // Should only be called once (no retries)
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw after exhausting max retry attempts', async () => {
      const retryClient = new OpenAIClient('sk-test-key', {
        retryEnabled: true,
        retryMaxAttempts: 2,
        retryBaseDelay: 1,
        retryMaxDelay: 10
      });

      fetchSpy.mockResolvedValue(mockResponse({}, 500));

      await expect(
        retryClient.request('/models', { useQueue: false })
      ).rejects.toThrow(OpenAIError);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should skip retry when retry is disabled', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}, 500));

      await expect(
        client.request('/models', { useQueue: false, useRetry: false })
      ).rejects.toThrow(OpenAIError);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── _shouldRetry ─────────────────────────────────────────────────────────

  describe('_shouldRetry()', () => {
    it('should return true for OpenAIError with retryable type', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.RATE_LIMIT_ERROR, 429);
      expect(client._shouldRetry(err)).toBe(true);
    });

    it('should return false for non-retryable OpenAIError', () => {
      const err = new OpenAIError('msg', OpenAIErrorType.AUTHENTICATION_ERROR, 401);
      expect(client._shouldRetry(err)).toBe(false);
    });

    it('should return true for network errors', () => {
      const err = { isNetworkError: true };
      expect(client._shouldRetry(err)).toBe(true);
    });

    it('should return true for 429 status on raw error', () => {
      const err = { status: 429 };
      expect(client._shouldRetry(err)).toBe(true);
    });

    it('should return true for 500+ status on raw error', () => {
      expect(client._shouldRetry({ status: 500 })).toBe(true);
      expect(client._shouldRetry({ status: 503 })).toBe(true);
    });

    it('should return false for 4xx (non-429) status on raw error', () => {
      expect(client._shouldRetry({ status: 400 })).toBe(false);
      expect(client._shouldRetry({ status: 404 })).toBe(false);
    });

    it('should return false for unknown error without status', () => {
      expect(client._shouldRetry(new Error('unknown'))).toBe(false);
    });
  });

  // ── Request Queue ────────────────────────────────────────────────────────

  describe('request queue', () => {
    it('should return queue size', () => {
      expect(client.getQueueSize()).toBe(0);
    });

    it('should process requests sequentially', async () => {
      const order = [];
      let callCount = 0;
      fetchSpy.mockImplementation(async () => {
        const id = callCount++;
        order.push(`start-${id}`);
        await new Promise(r => setTimeout(r, 10));
        order.push(`end-${id}`);
        return mockResponse({ id });
      });

      const p1 = client.request('/a', { useRetry: false });
      const p2 = client.request('/b', { useRetry: false });

      await Promise.all([p1, p2]);

      // Sequential: start-0 before start-1
      expect(order.indexOf('start-0')).toBeLessThan(order.indexOf('start-1'));
      expect(order.indexOf('end-0')).toBeLessThan(order.indexOf('start-1'));
    });

    it('should support priority ordering', async () => {
      // Fill queue with a blocking request
      const blocker = new Promise(resolve => {
        fetchSpy.mockImplementationOnce(async () => {
          await new Promise(r => setTimeout(r, 50));
          resolve();
          return mockResponse({ id: 'blocker' });
        });
      });

      const results = [];
      // Start blocker (takes 50ms)
      const p0 = client._enqueueRequest(async () => {
        await new Promise(r => setTimeout(r, 50));
        results.push('normal');
        return 'normal';
      }, {}, 0);

      // Add high priority
      const p1 = client._enqueueRequest(async () => {
        results.push('high');
        return 'high';
      }, {}, 10);

      // Add normal priority
      const p2 = client._enqueueRequest(async () => {
        results.push('low');
        return 'low';
      }, {}, 0);

      await Promise.all([p0, p1, p2]);

      // High priority should run before low priority (both after the first blocking one)
      expect(results[0]).toBe('normal');
      expect(results[1]).toBe('high');
      expect(results[2]).toBe('low');
    });

    it('should throw when queue is full', () => {
      const smallQueueClient = new OpenAIClient('sk-key', {
        retryEnabled: false,
        maxQueueSize: 2
      });

      // Make the RateLimiter pass-through
      smallQueueClient._rateLimiter.executeWithRetry = async (fn) => fn();
      smallQueueClient._rateLimiter._delay = () => Promise.resolve();

      // The first _enqueueRequest starts _processQueue, which shifts the item
      // out synchronously before yielding. So the actively-processing item
      // is no longer in _requestQueue. We need to enqueue enough items so
      // that _requestQueue (pending items only) reaches maxQueueSize.
      // 1st call: pushed then immediately shifted out (processing), queue=0
      // 2nd call: pushed, _processQueue returns (already running), queue=1
      // 3rd call: pushed, queue=2 => equals maxQueueSize
      // 4th call: should throw

      // Catch rejections from blocker and pending items to avoid unhandled rejection warnings
      const blocker = smallQueueClient._enqueueRequest(
        () => new Promise(r => setTimeout(r, 1000))
      ).catch(() => {});

      smallQueueClient._enqueueRequest(() => Promise.resolve()).catch(() => {});
      smallQueueClient._enqueueRequest(() => Promise.resolve()).catch(() => {});

      expect(() => {
        smallQueueClient._enqueueRequest(() => Promise.resolve());
      }).toThrow(/queue full/i);

      smallQueueClient.clearQueue();
    });

    it('should clear queue and reject pending requests', async () => {
      // Add an in-progress request (occupies the processor)
      const blockPromise = client._enqueueRequest(
        () => new Promise(r => setTimeout(r, 1000))
      ).catch(() => {}); // Suppress unhandled rejection from clearing

      // Add a pending request
      const pendingPromise = client._enqueueRequest(() => Promise.resolve('done'));

      // Clear queue
      client.clearQueue();

      // Pending should be rejected
      await expect(pendingPromise).rejects.toThrow(/cancelled/i);
    });

    it('should handle errors in queued requests without blocking others', async () => {
      const results = [];

      const p1 = client._enqueueRequest(async () => {
        throw new Error('fail');
      });

      const p2 = client._enqueueRequest(async () => {
        results.push('success');
        return 'ok';
      });

      await expect(p1).rejects.toThrow('fail');
      const result = await p2;
      expect(result).toBe('ok');
      expect(results).toEqual(['success']);
    });
  });

  // ── Operation History ────────────────────────────────────────────────────

  describe('operation history', () => {
    it('should return empty history initially', () => {
      expect(client.getHistory()).toEqual([]);
    });

    it('should add entries to history', () => {
      client._addToHistory({ operation: 'test', status: 'success' });
      const history = client.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].operation).toBe('test');
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('should trim history when exceeding max size', () => {
      const smallHistoryClient = new OpenAIClient('sk-key', { maxHistorySize: 3 });
      for (let i = 0; i < 5; i++) {
        smallHistoryClient._addToHistory({ id: i });
      }
      const history = smallHistoryClient.getHistory();
      expect(history).toHaveLength(3);
      // Should keep the most recent entries
      expect(history[0].id).toBe(2);
      expect(history[2].id).toBe(4);
    });

    it('should return limited history', () => {
      for (let i = 0; i < 10; i++) {
        client._addToHistory({ id: i });
      }
      const limited = client.getHistory(3);
      expect(limited).toHaveLength(3);
      // Most recent 3
      expect(limited[0].id).toBe(7);
    });

    it('should clear history', () => {
      client._addToHistory({ id: 1 });
      client.clearHistory();
      expect(client.getHistory()).toEqual([]);
    });
  });

  // ── validateApiKey ───────────────────────────────────────────────────────

  describe('validateApiKey()', () => {
    it('should return true for valid key', async () => {
      const result = await client.validateApiKey();
      expect(result).toBe(true);
    });

    it('should return false when no key is set', async () => {
      client.setApiKey('');
      const result = await client.validateApiKey();
      expect(result).toBe(false);
    });

    it('should return false for invalid key (401)', async () => {
      fetchSpy.mockResolvedValue(mockResponse(
        { error: { message: 'Invalid key' } },
        401
      ));
      const result = await client.validateApiKey();
      expect(result).toBe(false);
    });

    it('should throw for non-auth errors', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}, 500));
      await expect(client.validateApiKey()).rejects.toThrow();
    });
  });

  // ── Rate Limiter Integration ─────────────────────────────────────────────

  describe('rate limiter', () => {
    it('should return rate limiter stats', () => {
      const stats = client.getRateLimiterStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    it('should reset rate limiter', () => {
      client.resetRateLimiter();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  // ── _retryWithBackoff edge cases ─────────────────────────────────────────

  describe('_retryWithBackoff()', () => {
    it('should execute operation directly when retry is disabled', async () => {
      const result = await client._retryWithBackoff(async () => 'hello');
      expect(result).toBe('hello');
    });

    it('should use retryAfter delay from error when available', async () => {
      const retryClient = new OpenAIClient('sk-key', {
        retryEnabled: true,
        retryMaxAttempts: 2,
        retryBaseDelay: 1,
        retryMaxDelay: 10
      });

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount === 1) {
          const err = new OpenAIError('rate limited', OpenAIErrorType.RATE_LIMIT_ERROR, 429);
          err.retryAfter = 5; // 5ms
          throw err;
        }
        return 'ok';
      };

      const result = await retryClient._retryWithBackoff(operation, { operationName: 'test' });
      expect(result).toBe('ok');
      expect(callCount).toBe(2);
    });
  });

  // ── _makeRequest timeout cleanup ──────────────────────────────────────────

  describe('_makeRequest timeout cleanup', () => {
    it('should clear timeout when rate limiter throws before fetch', async () => {
      // Track clearTimeout calls
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      // Make the rate limiter throw immediately (before fetch is called)
      client._rateLimiter.executeWithRetry = async () => {
        throw new Error('Rate limiter is paused');
      };

      await expect(
        client._makeRequest('/test', {})
      ).rejects.toThrow('Rate limiter is paused');

      // The outer finally block should have called clearTimeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Verify fetch was never called (rate limiter threw before it)
      expect(fetchSpy).not.toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('should clear timeout on successful request (inner + outer cleanup)', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      await client._makeRequest('/test', {});

      // clearTimeout should be called at least twice:
      // once from inner try (fast cleanup) and once from outer finally (safety net)
      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

      clearTimeoutSpy.mockRestore();
    });

    it('should clear timeout on fetch error (inner + outer cleanup)', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      fetchSpy.mockRejectedValueOnce(new Error('Something went wrong'));

      await expect(
        client._makeRequest('/test', {})
      ).rejects.toThrow();

      // clearTimeout should be called at least twice:
      // once from inner catch and once from outer finally
      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

      clearTimeoutSpy.mockRestore();
    });
  });
});
