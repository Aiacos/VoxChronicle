/**
 * OpenAIClient Unit Tests
 *
 * Tests for the OpenAIClient base class with API mocking.
 * Covers authentication, request handling, error handling, rate limiting,
 * retry with exponential backoff, sequential request queue, and operation history.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing OpenAIClient
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
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

// Mock RateLimiter
vi.mock('../../scripts/utils/RateLimiter.mjs', () => ({
  RateLimiter: {
    fromPreset: () => ({
      executeWithRetry: vi.fn((fn) => fn()),
      pause: vi.fn(),
      reset: vi.fn(),
      getStats: vi.fn(() => ({ requestsMade: 5, requestsFailed: 0 }))
    })
  }
}));

// Mock SensitiveDataFilter
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeUrl: vi.fn((url) => url),
    sanitizeString: vi.fn((str) => str),
    sanitizeObject: vi.fn((obj) => obj)
  }
}));

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  OpenAIClient,
  OpenAIError,
  OpenAIErrorType,
  OPENAI_BASE_URL
} from '../../scripts/ai/OpenAIClient.mjs';
import { RateLimiter as _RateLimiter } from '../../scripts/utils/RateLimiter.mjs';

/**
 * Create a mock successful API response
 */
function createMockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data))
  };
}

/**
 * Create a mock error API response
 */
function createMockErrorResponse(status, errorMessage, errorType = null) {
  const errorData = {
    error: {
      message: errorMessage,
      type: errorType
    }
  };

  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: new Headers(),
    json: () => Promise.resolve(errorData),
    text: () => Promise.resolve(JSON.stringify(errorData))
  };
}

describe('OpenAIClient', () => {
  let client;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create client instance with retry disabled for base tests
    // (retry/queue are tested in dedicated sections below)
    client = new OpenAIClient('test-api-key-12345', { retryEnabled: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with API key', () => {
      expect(client).toBeInstanceOf(OpenAIClient);
      expect(client.isConfigured).toBe(true);
      expect(client.baseUrl).toBe(OPENAI_BASE_URL);
    });

    it('should handle missing API key', () => {
      const noKeyClient = new OpenAIClient('');
      expect(noKeyClient.isConfigured).toBe(false);
    });

    it('should handle null API key', () => {
      const nullKeyClient = new OpenAIClient(null);
      expect(nullKeyClient.isConfigured).toBe(false);
    });

    it('should accept custom base URL', () => {
      const customClient = new OpenAIClient('test-key', {
        baseUrl: 'https://custom.api.com/v1'
      });
      expect(customClient.baseUrl).toBe('https://custom.api.com/v1');
    });

    it('should accept custom timeout', () => {
      const customClient = new OpenAIClient('test-key', {
        timeout: 300000
      });
      expect(customClient._timeout).toBe(300000);
    });

    it('should accept custom maxRetries', () => {
      const customClient = new OpenAIClient('test-key', {
        maxRetries: 5
      });
      expect(customClient._maxRetries).toBe(5);
    });

    it('should use default timeout when not specified', () => {
      expect(client._timeout).toBe(120000);
    });

    it('should initialize rate limiter', () => {
      expect(client._rateLimiter).toBeDefined();
    });

    it('should initialize retry config with defaults', () => {
      const defaultClient = new OpenAIClient('test-key');
      expect(defaultClient._retryConfig.enabled).toBe(true);
      expect(defaultClient._retryConfig.maxAttempts).toBe(3);
      expect(defaultClient._retryConfig.baseDelay).toBe(1000);
      expect(defaultClient._retryConfig.maxDelay).toBe(60000);
    });

    it('should accept custom retry config', () => {
      const customClient = new OpenAIClient('test-key', {
        retryEnabled: false,
        retryMaxAttempts: 5,
        retryBaseDelay: 2000,
        retryMaxDelay: 30000
      });
      expect(customClient._retryConfig.enabled).toBe(false);
      expect(customClient._retryConfig.maxAttempts).toBe(5);
      expect(customClient._retryConfig.baseDelay).toBe(2000);
      expect(customClient._retryConfig.maxDelay).toBe(30000);
    });

    it('should initialize queue with defaults', () => {
      const defaultClient = new OpenAIClient('test-key');
      expect(defaultClient._requestQueue).toEqual([]);
      expect(defaultClient._isProcessingQueue).toBe(false);
      expect(defaultClient._maxQueueSize).toBe(100);
    });

    it('should accept custom maxQueueSize', () => {
      const customClient = new OpenAIClient('test-key', { maxQueueSize: 50 });
      expect(customClient._maxQueueSize).toBe(50);
    });

    it('should initialize history with defaults', () => {
      const defaultClient = new OpenAIClient('test-key');
      expect(defaultClient._history).toEqual([]);
      expect(defaultClient._maxHistorySize).toBe(50);
    });

    it('should accept custom maxHistorySize', () => {
      const customClient = new OpenAIClient('test-key', { maxHistorySize: 25 });
      expect(customClient._maxHistorySize).toBe(25);
    });
  });

  describe('isConfigured', () => {
    it('should return true when API key is set', () => {
      expect(client.isConfigured).toBe(true);
    });

    it('should return false when API key is empty', () => {
      const emptyClient = new OpenAIClient('');
      expect(emptyClient.isConfigured).toBe(false);
    });

    it('should return false when API key is null', () => {
      const nullClient = new OpenAIClient(null);
      expect(nullClient.isConfigured).toBe(false);
    });
  });

  describe('baseUrl', () => {
    it('should return default base URL', () => {
      expect(client.baseUrl).toBe(OPENAI_BASE_URL);
    });

    it('should return custom base URL when set', () => {
      const customClient = new OpenAIClient('test-key', {
        baseUrl: 'https://custom.api.com'
      });
      expect(customClient.baseUrl).toBe('https://custom.api.com');
    });
  });

  describe('setApiKey', () => {
    it('should update API key', () => {
      client.setApiKey('new-api-key');
      expect(client._apiKey).toBe('new-api-key');
      expect(client.isConfigured).toBe(true);
    });

    it('should handle empty string', () => {
      client.setApiKey('');
      expect(client.isConfigured).toBe(false);
    });

    it('should handle null', () => {
      client.setApiKey(null);
      expect(client.isConfigured).toBe(false);
    });
  });

  describe('request - successful requests', () => {
    it('should make GET request with authorization header', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      const result = await client.request('/test-endpoint');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://api.openai.com/v1/test-endpoint');
      expect(options.method).toBe('GET');
      expect(options.headers.Authorization).toBe('Bearer test-api-key-12345');
      expect(result).toEqual(mockData);
    });

    it('should make POST request with JSON body', async () => {
      const mockData = { result: 'success' };
      const requestBody = { prompt: 'test' };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      await client.request('/test-endpoint', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.body).toBe(JSON.stringify(requestBody));
    });

    it('should make POST request with FormData', async () => {
      const mockData = { result: 'success' };
      const formData = new FormData();
      formData.append('file', 'test-file');

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      await client.request('/test-endpoint', {
        method: 'POST',
        body: formData
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.headers['Content-Type']).toBeUndefined(); // Browser sets this
    });

    it('should normalize endpoint path', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      await client.request('test-endpoint');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/test-endpoint');
    });

    it('should include custom headers', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      await client.request('/test-endpoint', {
        headers: {
          'X-Custom-Header': 'custom-value'
        }
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Custom-Header']).toBe('custom-value');
      expect(options.headers.Authorization).toBe('Bearer test-api-key-12345');
    });

    it('should execute request through rate limiter', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      await client.request('/test-endpoint');

      expect(client._rateLimiter.executeWithRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('request - error handling', () => {
    it('should throw error if API key not configured', async () => {
      const unconfiguredClient = new OpenAIClient('');

      await expect(unconfiguredClient.request('/test-endpoint')).rejects.toThrow(OpenAIError);

      await expect(unconfiguredClient.request('/test-endpoint')).rejects.toThrow(
        'OpenAI API key not configured'
      );
    });

    it('should handle 401 authentication error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(401, 'Invalid API key', 'authentication_error')
      );

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.AUTHENTICATION_ERROR);
        expect(error.status).toBe(401);
      }
    });

    it('should handle 429 rate limit error', async () => {
      const response = createMockErrorResponse(429, 'Rate limit exceeded', 'rate_limit_error');
      response.headers.set('retry-after', '60');

      mockFetch.mockResolvedValueOnce(response);

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.RATE_LIMIT_ERROR);
        expect(error.status).toBe(429);
        expect(error.retryAfter).toBe(60000);
      }

      // Should pause rate limiter
      expect(client._rateLimiter.pause).toHaveBeenCalledWith(60000);
    });

    it('should handle 400 invalid request error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(400, 'Invalid request', 'invalid_request_error')
      );

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.INVALID_REQUEST_ERROR);
        expect(error.status).toBe(400);
      }
    });

    it('should handle 500 server error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(500, 'Internal server error', 'api_error')
      );

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.API_ERROR);
        expect(error.status).toBe(500);
        expect(error.isRetryable).toBe(true);
      }
    });

    it('should handle 502 bad gateway error', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(502, 'Bad gateway', 'api_error'));

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.status).toBe(502);
        expect(error.isRetryable).toBe(true);
      }
    });

    it('should handle 503 service unavailable error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(503, 'Service unavailable', 'api_error')
      );

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.status).toBe(503);
        expect(error.isRetryable).toBe(true);
      }
    });

    it('should handle timeout error', async () => {
      // Create a client with very short timeout and retry disabled
      const timeoutClient = new OpenAIClient('test-key', { timeout: 10, retryEnabled: false });

      // Mock fetch to delay and then throw AbortError
      mockFetch.mockImplementationOnce(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      try {
        await timeoutClient.request('/test-endpoint');
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.TIMEOUT_ERROR);
        expect(error.message).toContain('timed out');
      }
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown network error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.NETWORK_ERROR);
        expect(error.message).toContain('Network error');
      }
    });

    it('should handle malformed error response', async () => {
      const response = {
        ok: false,
        status: 500,
        headers: new Headers(),
        text: () => Promise.resolve('Not JSON')
      };

      mockFetch.mockResolvedValueOnce(response);

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.status).toBe(500);
      }
    });

    it('should wrap unknown errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Unknown error'));

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.API_ERROR);
      }
    });
  });

  describe('request - useQueue and useRetry options', () => {
    it('should bypass queue when useQueue is false', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      const result = await client.request('/test-endpoint', { useQueue: false });

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should bypass retry when useRetry is false', async () => {
      // Create client with retry enabled
      const retryClient = new OpenAIClient('test-api-key-12345', {
        retryEnabled: true,
        retryBaseDelay: 1
      });

      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(500, 'Server error', 'api_error')
      );

      try {
        await retryClient.request('/test-endpoint', { useRetry: false });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.status).toBe(500);
      }

      // Should NOT have retried
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not pass useQueue/useRetry/priority to _makeRequest', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      await client.request('/test-endpoint', {
        method: 'POST',
        useQueue: false,
        useRetry: false,
        priority: 5
      });

      // Verify fetch was called (internal _makeRequest did not break)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.method).toBe('POST');
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      const mockData = { result: 'success' };
      const requestData = { prompt: 'test' };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      const result = await client.post('/test-endpoint', requestData);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];

      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.body).toBe(JSON.stringify(requestData));
      expect(result).toEqual(mockData);
    });

    it('should merge custom options', async () => {
      const mockData = { result: 'success' };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      await client.post(
        '/test-endpoint',
        { data: 'test' },
        {
          timeout: 300000,
          headers: { 'X-Custom': 'value' }
        }
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Custom']).toBe('value');
    });
  });

  describe('postFormData', () => {
    it('should make POST request with FormData', async () => {
      const mockData = { result: 'success' };
      const formData = new FormData();
      formData.append('file', 'test-file');

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      const result = await client.postFormData('/test-endpoint', formData);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];

      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.headers['Content-Type']).toBeUndefined();
      expect(result).toEqual(mockData);
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      const isValid = await client.validateApiKey();

      expect(isValid).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/models');
      expect(options.method).toBe('GET');
    });

    it('should return false for invalid API key', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(401, 'Invalid API key', 'authentication_error')
      );

      const isValid = await client.validateApiKey();

      expect(isValid).toBe(false);
    });

    it('should return false when API key is not set', async () => {
      const unconfiguredClient = new OpenAIClient('');
      const isValid = await unconfiguredClient.validateApiKey();

      expect(isValid).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw non-auth errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(500, 'Server error', 'api_error'));

      await expect(client.validateApiKey()).rejects.toThrow(OpenAIError);

      try {
        mockFetch.mockResolvedValueOnce(createMockErrorResponse(500, 'Server error', 'api_error'));
        await client.validateApiKey();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.API_ERROR);
        expect(error.status).toBe(500);
      }
    });

    it('should throw network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.validateApiKey()).rejects.toThrow(OpenAIError);

      try {
        mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await client.validateApiKey();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.NETWORK_ERROR);
      }
    });
  });

  describe('getRateLimiterStats', () => {
    it('should return rate limiter statistics', () => {
      const stats = client.getRateLimiterStats();

      expect(stats).toEqual({ requestsMade: 5, requestsFailed: 0 });
      expect(client._rateLimiter.getStats).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetRateLimiter', () => {
    it('should reset rate limiter', () => {
      client.resetRateLimiter();

      expect(client._rateLimiter.reset).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// _shouldRetry
// ============================================================================

describe('OpenAIClient - _shouldRetry', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    client = new OpenAIClient('test-key', { retryEnabled: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return true for OpenAIError with isRetryable=true (rate limit)', () => {
    const error = new OpenAIError('Rate limited', OpenAIErrorType.RATE_LIMIT_ERROR, 429);
    expect(client._shouldRetry(error)).toBe(true);
  });

  it('should return true for OpenAIError with isRetryable=true (network)', () => {
    const error = new OpenAIError('Network fail', OpenAIErrorType.NETWORK_ERROR);
    expect(client._shouldRetry(error)).toBe(true);
  });

  it('should return true for OpenAIError with isRetryable=true (timeout)', () => {
    const error = new OpenAIError('Timeout', OpenAIErrorType.TIMEOUT_ERROR);
    expect(client._shouldRetry(error)).toBe(true);
  });

  it('should return true for OpenAIError with 5xx status', () => {
    const error = new OpenAIError('Server error', OpenAIErrorType.API_ERROR, 503);
    expect(client._shouldRetry(error)).toBe(true);
  });

  it('should return false for OpenAIError with 4xx (non-429)', () => {
    const error = new OpenAIError('Bad request', OpenAIErrorType.INVALID_REQUEST_ERROR, 400);
    expect(client._shouldRetry(error)).toBe(false);
  });

  it('should return false for OpenAIError with auth error', () => {
    const error = new OpenAIError('Auth failed', OpenAIErrorType.AUTHENTICATION_ERROR, 401);
    expect(client._shouldRetry(error)).toBe(false);
  });

  it('should return true for plain errors with isNetworkError flag', () => {
    const error = new Error('Network error');
    error.isNetworkError = true;
    expect(client._shouldRetry(error)).toBe(true);
  });

  it('should return true for plain errors with status 429', () => {
    const error = new Error('Rate limited');
    error.status = 429;
    expect(client._shouldRetry(error)).toBe(true);
  });

  it('should return true for plain errors with status 500-599', () => {
    const error = new Error('Server error');
    error.status = 502;
    expect(client._shouldRetry(error)).toBe(true);
  });

  it('should return false for plain errors with status 400-499 (except 429)', () => {
    const error = new Error('Bad request');
    error.status = 400;
    expect(client._shouldRetry(error)).toBe(false);
  });

  it('should return false for unknown errors without status', () => {
    const error = new Error('Something broke');
    expect(client._shouldRetry(error)).toBe(false);
  });
});

// ============================================================================
// _parseRetryAfter
// ============================================================================

describe('OpenAIClient - _parseRetryAfter', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    client = new OpenAIClient('test-key', { retryEnabled: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse numeric Retry-After header (seconds)', () => {
    const response = { headers: new Headers({ 'Retry-After': '30' }) };
    expect(client._parseRetryAfter(response)).toBe(30000);
  });

  it('should parse HTTP-date Retry-After header', () => {
    const futureDate = new Date(Date.now() + 60000);
    const response = { headers: new Headers({ 'Retry-After': futureDate.toUTCString() }) };
    const result = client._parseRetryAfter(response);
    // Should be roughly 60000ms (allow some tolerance)
    expect(result).toBeGreaterThan(50000);
    expect(result).toBeLessThan(70000);
  });

  it('should return null for missing Retry-After header', () => {
    const response = { headers: new Headers() };
    expect(client._parseRetryAfter(response)).toBeNull();
  });

  it('should return null for null response', () => {
    expect(client._parseRetryAfter(null)).toBeNull();
  });

  it('should return null for invalid Retry-After value', () => {
    const response = { headers: new Headers({ 'Retry-After': 'invalid' }) };
    expect(client._parseRetryAfter(response)).toBeNull();
  });

  it('should return null for zero seconds', () => {
    const response = { headers: new Headers({ 'Retry-After': '0' }) };
    expect(client._parseRetryAfter(response)).toBeNull();
  });

  it('should return null for negative seconds', () => {
    const response = { headers: new Headers({ 'Retry-After': '-5' }) };
    expect(client._parseRetryAfter(response)).toBeNull();
  });

  it('should return null for past HTTP-date', () => {
    const pastDate = new Date(Date.now() - 60000);
    const response = { headers: new Headers({ 'Retry-After': pastDate.toUTCString() }) };
    expect(client._parseRetryAfter(response)).toBeNull();
  });
});

// ============================================================================
// _retryWithBackoff
// ============================================================================

describe('OpenAIClient - _retryWithBackoff', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Use very short delays for test speed
    client = new OpenAIClient('test-key', {
      retryEnabled: true,
      retryMaxAttempts: 3,
      retryBaseDelay: 1,
      retryMaxDelay: 10
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should succeed on first attempt without retry', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await client._retryWithBackoff(operation, { operationName: 'test' });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error and succeed on 2nd attempt', async () => {
    const retryableError = new OpenAIError('Server error', OpenAIErrorType.API_ERROR, 500);
    const operation = vi.fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('success');

    const result = await client._retryWithBackoff(operation, { operationName: 'test' });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw immediately on non-retryable error', async () => {
    const nonRetryable = new OpenAIError('Bad request', OpenAIErrorType.INVALID_REQUEST_ERROR, 400);
    const operation = vi.fn().mockRejectedValue(nonRetryable);

    await expect(
      client._retryWithBackoff(operation, { operationName: 'test' })
    ).rejects.toThrow('Bad request');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should exhaust all attempts and throw last error', async () => {
    const retryableError = new OpenAIError('Server error', OpenAIErrorType.API_ERROR, 500);
    const operation = vi.fn().mockRejectedValue(retryableError);

    await expect(
      client._retryWithBackoff(operation, { operationName: 'test' })
    ).rejects.toThrow('Server error');

    expect(operation).toHaveBeenCalledTimes(3); // maxAttempts = 3
  });

  it('should skip retry when retryConfig.enabled is false', async () => {
    const disabledClient = new OpenAIClient('test-key', { retryEnabled: false });
    const retryableError = new OpenAIError('Server error', OpenAIErrorType.API_ERROR, 500);
    const operation = vi.fn().mockRejectedValue(retryableError);

    await expect(
      disabledClient._retryWithBackoff(operation, { operationName: 'test' })
    ).rejects.toThrow('Server error');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should handle maxAttempts of 1 (no retries)', async () => {
    const singleClient = new OpenAIClient('test-key', {
      retryEnabled: true,
      retryMaxAttempts: 1,
      retryBaseDelay: 1
    });
    const retryableError = new OpenAIError('Server error', OpenAIErrorType.API_ERROR, 500);
    const operation = vi.fn().mockRejectedValue(retryableError);

    await expect(
      singleClient._retryWithBackoff(operation, { operationName: 'test' })
    ).rejects.toThrow('Server error');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should use default operationName when not provided', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    await client._retryWithBackoff(operation);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Sequential request queue
// ============================================================================

describe('OpenAIClient - request queue', () => {
  let client;
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    client = new OpenAIClient('test-api-key-12345', {
      retryEnabled: false,
      maxQueueSize: 5
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getQueueSize', () => {
    it('should return 0 for empty queue', () => {
      expect(client.getQueueSize()).toBe(0);
    });
  });

  describe('_enqueueRequest', () => {
    it('should process a single queued request', async () => {
      const operation = vi.fn().mockResolvedValue('result');

      const result = await client._enqueueRequest(operation, {}, 0);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should process multiple queued requests sequentially', async () => {
      const order = [];
      const op1 = vi.fn().mockImplementation(async () => {
        order.push(1);
        return 'first';
      });
      const op2 = vi.fn().mockImplementation(async () => {
        order.push(2);
        return 'second';
      });
      const op3 = vi.fn().mockImplementation(async () => {
        order.push(3);
        return 'third';
      });

      const [r1, r2, r3] = await Promise.all([
        client._enqueueRequest(op1, {}, 0),
        client._enqueueRequest(op2, {}, 0),
        client._enqueueRequest(op3, {}, 0)
      ]);

      expect(r1).toBe('first');
      expect(r2).toBe('second');
      expect(r3).toBe('third');
      expect(order).toEqual([1, 2, 3]);
    });

    it('should process higher priority requests first', async () => {
      const order = [];
      let resolveFirst;
      // First request blocks the queue
      const blockingOp = () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        });

      const lowPriorityOp = vi.fn().mockImplementation(async () => {
        order.push('low');
        return 'low';
      });
      const highPriorityOp = vi.fn().mockImplementation(async () => {
        order.push('high');
        return 'high';
      });

      // Enqueue: first a blocking request, then low, then high
      const p1 = client._enqueueRequest(blockingOp, {}, 0);
      const pLow = client._enqueueRequest(lowPriorityOp, {}, 0);
      const pHigh = client._enqueueRequest(highPriorityOp, {}, 5);

      // Unblock the first request
      resolveFirst('blocked');

      const [r1, rLow, rHigh] = await Promise.all([p1, pLow, pHigh]);

      expect(r1).toBe('blocked');
      expect(rHigh).toBe('high');
      expect(rLow).toBe('low');
      // High priority should have been processed before low
      expect(order).toEqual(['high', 'low']);
    });

    it('should reject when queue is full', async () => {
      // The first enqueued request starts processing immediately (shifted out
      // of the queue by _processQueue), so we need maxQueueSize+1 never-
      // resolving operations to actually fill the pending queue to its limit.
      // maxQueueSize is 5, so we need 6 blocking operations (1 processing + 5 queued).
      for (let i = 0; i < 6; i++) {
        client._enqueueRequest(() => new Promise(() => {}), {}, 0);
      }

      // Allow microtasks to run so _processQueue can shift the first item
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The 7th should throw (synchronously from _enqueueRequest)
      expect(() => {
        client._enqueueRequest(() => Promise.resolve(), {}, 0);
      }).toThrow('Request queue full');
    });

    it('should propagate errors from operations', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(client._enqueueRequest(operation, {}, 0)).rejects.toThrow('Operation failed');
    });
  });

  describe('clearQueue', () => {
    it('should reject all pending requests with cancellation error', async () => {
      let resolveFirst;
      const blockingOp = () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        });

      const p1 = client._enqueueRequest(blockingOp, {}, 0);
      const p2 = client._enqueueRequest(() => Promise.resolve('should not run'), {}, 0);
      const p3 = client._enqueueRequest(() => Promise.resolve('should not run'), {}, 0);

      // Clear the queue (p2 and p3 should be rejected, p1 is already processing)
      client.clearQueue();
      expect(client.getQueueSize()).toBe(0);

      // p2 and p3 should be rejected
      await expect(p2).rejects.toThrow('Request cancelled: queue cleared');
      await expect(p3).rejects.toThrow('Request cancelled: queue cleared');

      // Resolve p1 to clean up
      resolveFirst('done');
      await expect(p1).resolves.toBe('done');
    });

    it('should set isCancelled flag on cancellation error', async () => {
      let resolveFirst;
      const blockingOp = () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        });

      client._enqueueRequest(blockingOp, {}, 0);
      const p2 = client._enqueueRequest(() => Promise.resolve(), {}, 0);

      client.clearQueue();

      try {
        await p2;
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.isCancelled).toBe(true);
      }

      resolveFirst('done');
    });

    it('should not throw when clearing empty queue', () => {
      expect(() => client.clearQueue()).not.toThrow();
    });
  });

  describe('queue integration with request()', () => {
    it('should process request() calls through queue by default', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValue(createMockResponse(mockData));

      const [r1, r2] = await Promise.all([
        client.request('/endpoint1'),
        client.request('/endpoint2')
      ]);

      expect(r1).toEqual(mockData);
      expect(r2).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should bypass queue when useQueue is false', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValue(createMockResponse(mockData));

      const result = await client.request('/test', { useQueue: false });
      expect(result).toEqual(mockData);
    });
  });
});

// ============================================================================
// Operation history
// ============================================================================

describe('OpenAIClient - operation history', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    client = new OpenAIClient('test-key', { retryEnabled: false, maxHistorySize: 5 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('_addToHistory', () => {
    it('should add entries with timestamp', () => {
      client._addToHistory({ operation: 'test', result: 'success' });

      const history = client.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].operation).toBe('test');
      expect(history[0].result).toBe('success');
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('should trim history when exceeding maxHistorySize', () => {
      for (let i = 0; i < 10; i++) {
        client._addToHistory({ index: i });
      }

      const history = client.getHistory();
      expect(history).toHaveLength(5);
      // Should keep the most recent entries
      expect(history[0].index).toBe(5);
      expect(history[4].index).toBe(9);
    });
  });

  describe('getHistory', () => {
    it('should return empty array when no history', () => {
      expect(client.getHistory()).toEqual([]);
    });

    it('should return all history without limit', () => {
      client._addToHistory({ a: 1 });
      client._addToHistory({ b: 2 });
      client._addToHistory({ c: 3 });

      expect(client.getHistory()).toHaveLength(3);
    });

    it('should return limited history when limit is specified', () => {
      client._addToHistory({ a: 1 });
      client._addToHistory({ b: 2 });
      client._addToHistory({ c: 3 });

      const limited = client.getHistory(2);
      expect(limited).toHaveLength(2);
      // Should return the 2 most recent
      expect(limited[0].b).toBe(2);
      expect(limited[1].c).toBe(3);
    });

    it('should return a copy (not the internal array)', () => {
      client._addToHistory({ a: 1 });
      const history = client.getHistory();
      history.push({ fake: true });

      expect(client.getHistory()).toHaveLength(1);
    });
  });

  describe('clearHistory', () => {
    it('should clear all history entries', () => {
      client._addToHistory({ a: 1 });
      client._addToHistory({ b: 2 });

      client.clearHistory();

      expect(client.getHistory()).toEqual([]);
    });
  });
});

// ============================================================================
// Retry integration with request()
// ============================================================================

describe('OpenAIClient - retry integration', () => {
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should retry request() on retryable errors', async () => {
    const client = new OpenAIClient('test-api-key', {
      retryEnabled: true,
      retryMaxAttempts: 3,
      retryBaseDelay: 1,
      retryMaxDelay: 2
    });

    // First two calls fail with 500, third succeeds
    mockFetch
      .mockResolvedValueOnce(createMockErrorResponse(500, 'Server error', 'api_error'))
      .mockResolvedValueOnce(createMockErrorResponse(500, 'Server error', 'api_error'))
      .mockResolvedValueOnce(createMockResponse({ data: 'success' }));

    const result = await client.request('/test', { useQueue: false });

    expect(result).toEqual({ data: 'success' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors in request()', async () => {
    const client = new OpenAIClient('test-api-key', {
      retryEnabled: true,
      retryMaxAttempts: 3,
      retryBaseDelay: 1
    });

    mockFetch.mockResolvedValueOnce(
      createMockErrorResponse(400, 'Bad request', 'invalid_request_error')
    );

    try {
      await client.request('/test', { useQueue: false });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIError);
      expect(error.status).toBe(400);
    }

    // Only one attempt (no retries for 400)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should retry rate limit (429) errors', async () => {
    const client = new OpenAIClient('test-api-key', {
      retryEnabled: true,
      retryMaxAttempts: 2,
      retryBaseDelay: 1,
      retryMaxDelay: 2
    });

    const rateLimitResponse = createMockErrorResponse(429, 'Rate limit', 'rate_limit_error');
    rateLimitResponse.headers.set('retry-after', '1');

    mockFetch
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(createMockResponse({ ok: true }));

    const result = await client.request('/test', { useQueue: false });

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting all retry attempts', async () => {
    const client = new OpenAIClient('test-api-key', {
      retryEnabled: true,
      retryMaxAttempts: 2,
      retryBaseDelay: 1,
      retryMaxDelay: 2
    });

    mockFetch
      .mockResolvedValueOnce(createMockErrorResponse(503, 'Unavailable', 'api_error'))
      .mockResolvedValueOnce(createMockErrorResponse(503, 'Unavailable', 'api_error'));

    try {
      await client.request('/test', { useQueue: false });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIError);
      expect(error.status).toBe(503);
    }

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// OpenAIError
// ============================================================================

describe('OpenAIError', () => {
  describe('constructor', () => {
    it('should create error with message and type', () => {
      const error = new OpenAIError('Test error', OpenAIErrorType.API_ERROR);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.type).toBe(OpenAIErrorType.API_ERROR);
      expect(error.name).toBe('OpenAIError');
      expect(error.status).toBeNull();
      expect(error.details).toBeNull();
    });

    it('should include status code', () => {
      const error = new OpenAIError('Test error', OpenAIErrorType.API_ERROR, 500);

      expect(error.status).toBe(500);
    });

    it('should include details', () => {
      const details = { response: { error: 'details' } };
      const error = new OpenAIError('Test error', OpenAIErrorType.API_ERROR, 500, details);

      expect(error.details).toEqual(details);
    });

    it('should extract retry-after from headers', () => {
      const details = {
        headers: {
          'retry-after': '60'
        }
      };
      const error = new OpenAIError('Rate limited', OpenAIErrorType.RATE_LIMIT_ERROR, 429, details);

      expect(error.retryAfter).toBe(60000); // Converted to milliseconds
    });

    it('should handle missing retry-after header', () => {
      const details = { headers: {} };
      const error = new OpenAIError('Rate limited', OpenAIErrorType.RATE_LIMIT_ERROR, 429, details);

      expect(error.retryAfter).toBeNull();
    });
  });

  describe('isRetryable', () => {
    it('should return true for rate limit errors', () => {
      const error = new OpenAIError('Rate limited', OpenAIErrorType.RATE_LIMIT_ERROR, 429);
      expect(error.isRetryable).toBe(true);
    });

    it('should return true for network errors', () => {
      const error = new OpenAIError('Network error', OpenAIErrorType.NETWORK_ERROR);
      expect(error.isRetryable).toBe(true);
    });

    it('should return true for timeout errors', () => {
      const error = new OpenAIError('Timeout', OpenAIErrorType.TIMEOUT_ERROR);
      expect(error.isRetryable).toBe(true);
    });

    it('should return true for 500 errors', () => {
      const error = new OpenAIError('Server error', OpenAIErrorType.API_ERROR, 500);
      expect(error.isRetryable).toBe(true);
    });

    it('should return true for 502 errors', () => {
      const error = new OpenAIError('Bad gateway', OpenAIErrorType.API_ERROR, 502);
      expect(error.isRetryable).toBe(true);
    });

    it('should return true for 503 errors', () => {
      const error = new OpenAIError('Service unavailable', OpenAIErrorType.API_ERROR, 503);
      expect(error.isRetryable).toBe(true);
    });

    it('should return false for authentication errors', () => {
      const error = new OpenAIError('Invalid key', OpenAIErrorType.AUTHENTICATION_ERROR, 401);
      expect(error.isRetryable).toBe(false);
    });

    it('should return false for invalid request errors', () => {
      const error = new OpenAIError('Bad request', OpenAIErrorType.INVALID_REQUEST_ERROR, 400);
      expect(error.isRetryable).toBe(false);
    });

    it('should return false for 4xx errors', () => {
      const error = new OpenAIError('Not found', OpenAIErrorType.API_ERROR, 404);
      expect(error.isRetryable).toBe(false);
    });
  });
});

describe('OpenAIErrorType', () => {
  it('should export error type constants', () => {
    expect(OpenAIErrorType.AUTHENTICATION_ERROR).toBe('authentication_error');
    expect(OpenAIErrorType.RATE_LIMIT_ERROR).toBe('rate_limit_error');
    expect(OpenAIErrorType.INVALID_REQUEST_ERROR).toBe('invalid_request_error');
    expect(OpenAIErrorType.API_ERROR).toBe('api_error');
    expect(OpenAIErrorType.NETWORK_ERROR).toBe('network_error');
    expect(OpenAIErrorType.TIMEOUT_ERROR).toBe('timeout_error');
  });
});

describe('OPENAI_BASE_URL', () => {
  it('should export base URL constant', () => {
    expect(OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
  });
});
