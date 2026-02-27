/**
 * Tests for BaseAPIClient - Abstract base class for API clients
 *
 * Tests the shared functionality extracted from OpenAIClient and KankaClient:
 * baseUrl getter, _buildAuthHeaders, _buildJsonHeaders, _buildUrl,
 * _createTimeoutController, getRateLimiterStats, resetRateLimiter.
 *
 * Uses a concrete TestClient subclass to exercise the abstract base.
 */

import { BaseAPIClient } from '../../scripts/api/BaseAPIClient.mjs';

// ── Test Error Class ─────────────────────────────────────────────────────

class TestError extends Error {
  constructor(message, type, status = null, details = null) {
    super(message);
    this.name = 'TestError';
    this.type = type;
    this.status = status;
    this.details = details;
  }
}

// ── Concrete Subclass for Testing ─────────────────────────────────────────

class TestClient extends BaseAPIClient {
  constructor(apiKey, options = {}) {
    super({
      apiKey,
      baseUrl: options.baseUrl || 'https://test.api.com/v1',
      timeout: options.timeout || 30000,
      loggerName: 'TestClient',
      sanitizeLogger: true,
      authErrorMessage: 'Test API key not configured. Please add your key.',
      AuthErrorClass: TestError,
      authErrorType: 'authentication_error',
      rateLimiter: options.rateLimiter || createMockRateLimiter(),
    });
  }
}

/**
 * Create a mock rate limiter with getStats() and reset() methods
 */
function createMockRateLimiter() {
  return {
    getStats: vi.fn().mockReturnValue({
      name: 'TestLimiter',
      requestsPerMinute: 60,
      currentWindowRequests: 0,
      isPaused: false
    }),
    reset: vi.fn(),
    pause: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('BaseAPIClient', () => {

  // ════════════════════════════════════════════════════════════════════════
  // Constructor
  // ════════════════════════════════════════════════════════════════════════

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const client = new BaseAPIClient();
      expect(client.baseUrl).toBe('');
      expect(client._apiKey).toBe('');
      expect(client._timeout).toBe(30000);
    });

    it('should accept all configuration options', () => {
      const rateLimiter = createMockRateLimiter();
      const client = new BaseAPIClient({
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com/v1',
        timeout: 5000,
        loggerName: 'CustomLogger',
        authErrorMessage: 'Custom error message',
        AuthErrorClass: TestError,
        authErrorType: 'custom_auth_error',
        rateLimiter,
      });

      expect(client._apiKey).toBe('test-key');
      expect(client.baseUrl).toBe('https://api.example.com/v1');
      expect(client._timeout).toBe(5000);
      expect(client._authErrorMessage).toBe('Custom error message');
      expect(client._AuthErrorClass).toBe(TestError);
      expect(client._authErrorType).toBe('custom_auth_error');
      expect(client._rateLimiter).toBe(rateLimiter);
    });

    it('should default AuthErrorClass to Error', () => {
      const client = new BaseAPIClient({});
      expect(client._AuthErrorClass).toBe(Error);
    });

    it('should handle empty apiKey gracefully', () => {
      const client = new BaseAPIClient({ apiKey: '' });
      expect(client._apiKey).toBe('');
    });

    it('should handle null apiKey gracefully', () => {
      const client = new BaseAPIClient({ apiKey: null });
      expect(client._apiKey).toBe('');
    });

    it('should handle undefined apiKey gracefully', () => {
      const client = new BaseAPIClient({ apiKey: undefined });
      expect(client._apiKey).toBe('');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // baseUrl getter
  // ════════════════════════════════════════════════════════════════════════

  describe('baseUrl getter', () => {
    it('should return the configured base URL', () => {
      const client = new TestClient('test-key');
      expect(client.baseUrl).toBe('https://test.api.com/v1');
    });

    it('should return custom base URL', () => {
      const client = new TestClient('test-key', { baseUrl: 'https://custom.api.com/v2' });
      expect(client.baseUrl).toBe('https://custom.api.com/v2');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildAuthHeaders
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildAuthHeaders()', () => {
    it('should return Authorization header with Bearer token', () => {
      const client = new TestClient('my-api-key-123');
      const headers = client._buildAuthHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer my-api-key-123' });
    });

    it('should throw configured error class when API key is empty', () => {
      const client = new TestClient('');
      expect(() => client._buildAuthHeaders()).toThrow(TestError);
    });

    it('should throw configured error class when API key is null', () => {
      const client = new TestClient(null);
      expect(() => client._buildAuthHeaders()).toThrow(TestError);
    });

    it('should include configured error message', () => {
      const client = new TestClient('');
      expect(() => client._buildAuthHeaders()).toThrow('Test API key not configured');
    });

    it('should include configured error type', () => {
      const client = new TestClient('');
      try {
        client._buildAuthHeaders();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.type).toBe('authentication_error');
      }
    });

    it('should use default Error class when no AuthErrorClass configured', () => {
      const client = new BaseAPIClient({ apiKey: '' });
      expect(() => client._buildAuthHeaders()).toThrow(Error);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildJsonHeaders
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildJsonHeaders()', () => {
    it('should include auth, content-type, and accept headers', () => {
      const client = new TestClient('my-key');
      const headers = client._buildJsonHeaders();
      expect(headers.Authorization).toBe('Bearer my-key');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Accept).toBe('application/json');
    });

    it('should throw when API key is missing (delegates to _buildAuthHeaders)', () => {
      const client = new TestClient('');
      expect(() => client._buildJsonHeaders()).toThrow(TestError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildUrl
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildUrl()', () => {
    it('should build URL with endpoint that has leading slash', () => {
      const client = new TestClient('key');
      expect(client._buildUrl('/users')).toBe('https://test.api.com/v1/users');
    });

    it('should add leading slash when endpoint is missing one', () => {
      const client = new TestClient('key');
      expect(client._buildUrl('users')).toBe('https://test.api.com/v1/users');
    });

    it('should handle nested endpoints', () => {
      const client = new TestClient('key');
      expect(client._buildUrl('/campaigns/1/characters')).toBe('https://test.api.com/v1/campaigns/1/characters');
    });

    it('should handle empty endpoint', () => {
      const client = new TestClient('key');
      expect(client._buildUrl('/')).toBe('https://test.api.com/v1/');
    });

    it('should work with custom base URL', () => {
      const client = new TestClient('key', { baseUrl: 'https://example.com/api' });
      expect(client._buildUrl('/data')).toBe('https://example.com/api/data');
    });

    it('should strip trailing slash from baseUrl to prevent double-slash', () => {
      const client = new TestClient('key', { baseUrl: 'https://example.com/api/' });
      expect(client._buildUrl('/data')).toBe('https://example.com/api/data');
    });

    it('should strip multiple trailing slashes from baseUrl', () => {
      const client = new TestClient('key', { baseUrl: 'https://example.com/api///' });
      expect(client._buildUrl('/data')).toBe('https://example.com/api/data');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _createTimeoutController
  // ════════════════════════════════════════════════════════════════════════

  describe('_createTimeoutController()', () => {
    it('should return an AbortController', () => {
      const client = new TestClient('key');
      const controller = client._createTimeoutController();
      expect(controller).toBeInstanceOf(AbortController);
      clearTimeout(controller.timeoutId);
    });

    it('should have a timeoutId property', () => {
      const client = new TestClient('key');
      const controller = client._createTimeoutController();
      expect(controller.timeoutId).toBeDefined();
      clearTimeout(controller.timeoutId);
    });

    it('should use default timeout when none specified', () => {
      const client = new TestClient('key', { timeout: 5000 });
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      const controller = client._createTimeoutController();

      // Find the call that created this timeout (last one)
      const calls = setTimeoutSpy.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toBe(5000);

      clearTimeout(controller.timeoutId);
      setTimeoutSpy.mockRestore();
    });

    it('should use custom timeout when provided', () => {
      const client = new TestClient('key', { timeout: 5000 });
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      const controller = client._createTimeoutController(1000);

      const calls = setTimeoutSpy.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toBe(1000);

      clearTimeout(controller.timeoutId);
      setTimeoutSpy.mockRestore();
    });

    it('should have a signal that is not aborted initially', () => {
      const client = new TestClient('key');
      const controller = client._createTimeoutController();
      expect(controller.signal.aborted).toBe(false);
      clearTimeout(controller.timeoutId);
    });

    it('should abort the signal after timeout expires', async () => {
      vi.useFakeTimers();
      try {
        const client = new TestClient('key', { timeout: 100 });
        const controller = client._createTimeoutController();

        expect(controller.signal.aborted).toBe(false);
        vi.advanceTimersByTime(100);
        expect(controller.signal.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getRateLimiterStats
  // ════════════════════════════════════════════════════════════════════════

  describe('getRateLimiterStats()', () => {
    it('should delegate to rate limiter getStats()', () => {
      const rateLimiter = createMockRateLimiter();
      const client = new TestClient('key', { rateLimiter });

      const stats = client.getRateLimiterStats();

      expect(rateLimiter.getStats).toHaveBeenCalledTimes(1);
      expect(stats).toEqual({
        name: 'TestLimiter',
        requestsPerMinute: 60,
        currentWindowRequests: 0,
        isPaused: false
      });
    });

    it('should return safe defaults when no rate limiter is configured', () => {
      const client = new BaseAPIClient({ apiKey: 'key' });
      const stats = client.getRateLimiterStats();
      expect(stats.name).toBe('none');
      expect(stats.requestsPerMinute).toBe(0);
      expect(stats.isPaused).toBe(false);
      expect(stats.queueLength).toBe(0);
    });

    it('should return fresh stats on each call', () => {
      const rateLimiter = createMockRateLimiter();
      rateLimiter.getStats
        .mockReturnValueOnce({ name: 'TestLimiter', currentWindowRequests: 0 })
        .mockReturnValueOnce({ name: 'TestLimiter', currentWindowRequests: 5 });

      const client = new TestClient('key', { rateLimiter });

      expect(client.getRateLimiterStats().currentWindowRequests).toBe(0);
      expect(client.getRateLimiterStats().currentWindowRequests).toBe(5);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // resetRateLimiter
  // ════════════════════════════════════════════════════════════════════════

  describe('resetRateLimiter()', () => {
    it('should delegate to rate limiter reset()', () => {
      const rateLimiter = createMockRateLimiter();
      const client = new TestClient('key', { rateLimiter });

      client.resetRateLimiter();

      expect(rateLimiter.reset).toHaveBeenCalledTimes(1);
    });

    it('should not throw', () => {
      const client = new TestClient('key');
      expect(() => client.resetRateLimiter()).not.toThrow();
    });

    it('should be a no-op when no rate limiter is configured', () => {
      const client = new BaseAPIClient({ apiKey: 'key' });
      expect(() => client.resetRateLimiter()).not.toThrow();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Subclass behavior (TestClient)
  // ════════════════════════════════════════════════════════════════════════

  describe('subclass behavior', () => {
    it('should use subclass error class for auth failures', () => {
      const client = new TestClient('');
      try {
        client._buildAuthHeaders();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TestError);
        expect(error.name).toBe('TestError');
        expect(error.type).toBe('authentication_error');
      }
    });

    it('should use subclass error message for auth failures', () => {
      const client = new TestClient('');
      try {
        client._buildAuthHeaders();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Test API key not configured');
      }
    });

    it('should inherit all base methods', () => {
      const client = new TestClient('key');
      expect(typeof client._buildAuthHeaders).toBe('function');
      expect(typeof client._buildJsonHeaders).toBe('function');
      expect(typeof client._buildUrl).toBe('function');
      expect(typeof client._createTimeoutController).toBe('function');
      expect(typeof client.getRateLimiterStats).toBe('function');
      expect(typeof client.resetRateLimiter).toBe('function');
      expect(typeof client.baseUrl).toBe('string');
    });
  });
});
