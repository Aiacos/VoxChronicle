/**
 * OpenAIClient Unit Tests
 *
 * Tests for the OpenAIClient base class with API mocking.
 * Covers authentication, request handling, error handling, and rate limiting.
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

// Import after mocks are set up
import { OpenAIClient, OpenAIError, OpenAIErrorType, OPENAI_BASE_URL } from '../../scripts/ai/OpenAIClient.mjs';
import { RateLimiter } from '../../scripts/utils/RateLimiter.mjs';

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

    // Create client instance
    client = new OpenAIClient('test-api-key-12345');
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

      const [url, options] = mockFetch.mock.calls[0];
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

      const [url, options] = mockFetch.mock.calls[0];
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

      const [url, options] = mockFetch.mock.calls[0];
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

      await expect(unconfiguredClient.request('/test-endpoint'))
        .rejects.toThrow(OpenAIError);

      await expect(unconfiguredClient.request('/test-endpoint'))
        .rejects.toThrow('OpenAI API key not configured');
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
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(502, 'Bad gateway', 'api_error')
      );

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
      // Create a client with very short timeout
      const timeoutClient = new OpenAIClient('test-key', { timeout: 10 });

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
      mockFetch.mockRejectedValueOnce(
        new TypeError('Failed to fetch')
      );

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
      mockFetch.mockRejectedValueOnce(
        new Error('Unknown error')
      );

      try {
        await client.request('/test-endpoint');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenAIError);
        expect(error.type).toBe(OpenAIErrorType.API_ERROR);
      }
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      const mockData = { result: 'success' };
      const requestData = { prompt: 'test' };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      const result = await client.post('/test-endpoint', requestData);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.body).toBe(JSON.stringify(requestData));
      expect(result).toEqual(mockData);
    });

    it('should merge custom options', async () => {
      const mockData = { result: 'success' };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

      await client.post('/test-endpoint', { data: 'test' }, {
        timeout: 300000,
        headers: { 'X-Custom': 'value' }
      });

      const [url, options] = mockFetch.mock.calls[0];
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
      const [url, options] = mockFetch.mock.calls[0];

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

    it('should return true for non-auth errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(500, 'Server error', 'api_error')
      );

      const isValid = await client.validateApiKey();

      // Assumes valid if error is not auth-related
      expect(isValid).toBe(true);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(
        new TypeError('Failed to fetch')
      );

      const isValid = await client.validateApiKey();

      // Assumes valid if network error (temporary)
      expect(isValid).toBe(true);
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
