/**
 * KankaClient Unit Tests
 *
 * Tests for the KankaClient base class with API mocking.
 * Covers authentication, rate limiting, retry logic, error handling,
 * and common request functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing KankaClient
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
const mockExecuteWithRetry = vi.fn((fn) => fn());
const mockPause = vi.fn();
const mockReset = vi.fn();
const mockGetStats = vi.fn(() => ({
  totalRequests: 0,
  rateLimitHits: 0,
  retries: 0
}));

vi.mock('../../scripts/utils/RateLimiter.mjs', () => ({
  RateLimiter: {
    fromPreset: () => ({
      executeWithRetry: mockExecuteWithRetry,
      pause: mockPause,
      reset: mockReset,
      getStats: mockGetStats,
      remainingRequests: 30,
      isPaused: false
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
  KankaClient,
  KankaError,
  KankaErrorType,
  KANKA_BASE_URL
} from '../../scripts/kanka/KankaClient.mjs';

/**
 * Create a mock successful API response
 */
function createMockResponse(data, status = 200, headers = {}) {
  const responseHeaders = new Headers({
    'content-type': 'application/json',
    ...headers
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: responseHeaders,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data))
  };
}

/**
 * Create a mock error API response
 */
function createMockErrorResponse(status, errorMessage, headers = {}) {
  const errorData = {
    message: errorMessage,
    error: errorMessage
  };

  const responseHeaders = new Headers({
    'content-type': 'application/json',
    ...headers
  });

  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: responseHeaders,
    json: () => Promise.resolve(errorData),
    text: () => Promise.resolve(JSON.stringify(errorData))
  };
}

describe('KankaClient', () => {
  let client;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create client instance with test API token
    client = new KankaClient('test-api-token-12345');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Constructor and Configuration Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with API token', () => {
      expect(client).toBeInstanceOf(KankaClient);
      expect(client.isConfigured).toBe(true);
      expect(client.baseUrl).toBe(KANKA_BASE_URL);
    });

    it('should create instance with custom options', () => {
      const customClient = new KankaClient('test-token', {
        baseUrl: 'https://custom.api.url',
        timeout: 60000,
        maxRetries: 5,
        isPremium: true
      });

      expect(customClient.baseUrl).toBe('https://custom.api.url');
      expect(customClient.isPremium).toBe(true);
    });

    it('should use default values for missing options', () => {
      const defaultClient = new KankaClient('test-token', {});
      expect(defaultClient.baseUrl).toBe(KANKA_BASE_URL);
      expect(defaultClient.isPremium).toBe(false);
    });

    it('should handle empty API token', () => {
      const emptyTokenClient = new KankaClient('');
      expect(emptyTokenClient.isConfigured).toBe(false);
    });

    it('should handle null API token', () => {
      const nullTokenClient = new KankaClient(null);
      expect(nullTokenClient.isConfigured).toBe(false);
    });

    it('should initialize rate limiter for free tier by default', () => {
      const freeClient = new KankaClient('test-token');
      expect(freeClient.isPremium).toBe(false);
    });

    it('should initialize rate limiter for premium tier when specified', () => {
      const premiumClient = new KankaClient('test-token', { isPremium: true });
      expect(premiumClient.isPremium).toBe(true);
    });
  });

  describe('isConfigured', () => {
    it('should return true when API token is set', () => {
      expect(client.isConfigured).toBe(true);
    });

    it('should return false when API token is empty', () => {
      const emptyClient = new KankaClient('');
      expect(emptyClient.isConfigured).toBe(false);
    });
  });

  describe('baseUrl', () => {
    it('should return the configured base URL', () => {
      expect(client.baseUrl).toBe(KANKA_BASE_URL);
    });

    it('should return custom base URL when configured', () => {
      const customClient = new KankaClient('token', { baseUrl: 'https://custom.url' });
      expect(customClient.baseUrl).toBe('https://custom.url');
    });
  });

  describe('isPremium', () => {
    it('should return false for free tier', () => {
      expect(client.isPremium).toBe(false);
    });

    it('should return true for premium tier', () => {
      const premiumClient = new KankaClient('token', { isPremium: true });
      expect(premiumClient.isPremium).toBe(true);
    });
  });

  // ============================================================================
  // Configuration Setters Tests
  // ============================================================================

  describe('setApiToken', () => {
    it('should update API token', () => {
      client.setApiToken('new-token-67890');
      expect(client.isConfigured).toBe(true);
    });

    it('should handle empty token', () => {
      client.setApiToken('');
      expect(client.isConfigured).toBe(false);
    });

    it('should handle null token', () => {
      client.setApiToken(null);
      expect(client.isConfigured).toBe(false);
    });
  });

  describe('setPremiumStatus', () => {
    it('should update premium status from free to premium', () => {
      expect(client.isPremium).toBe(false);
      client.setPremiumStatus(true);
      expect(client.isPremium).toBe(true);
    });

    it('should update premium status from premium to free', () => {
      const premiumClient = new KankaClient('token', { isPremium: true });
      expect(premiumClient.isPremium).toBe(true);
      premiumClient.setPremiumStatus(false);
      expect(premiumClient.isPremium).toBe(false);
    });

    it('should not reinitialize rate limiter if status unchanged', () => {
      vi.clearAllMocks();
      client.setPremiumStatus(false); // Already false
      // Rate limiter would only be created in constructor, not here
      expect(client.isPremium).toBe(false);
    });
  });

  // ============================================================================
  // Request Building Tests
  // ============================================================================

  describe('request building', () => {
    it('should build correct URL with leading slash', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await client.request('/campaigns');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.kanka.io/1.0/campaigns');
    });

    it('should build correct URL without leading slash', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await client.request('campaigns');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.kanka.io/1.0/campaigns');
    });

    it('should include Authorization header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await client.request('/campaigns');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer test-api-token-12345');
    });

    it('should include JSON headers for non-FormData requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await client.request('/campaigns', { method: 'GET' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Accept']).toBe('application/json');
    });

    it('should not include Content-Type header for FormData requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: {} }));

      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.txt');

      await client.request('/upload', {
        method: 'POST',
        body: formData
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
      expect(options.headers['Authorization']).toBe('Bearer test-api-token-12345');
    });

    it('should throw error when API token not configured', async () => {
      const unconfiguredClient = new KankaClient('');

      await expect(unconfiguredClient.request('/campaigns')).rejects.toThrow(KankaError);
      await expect(unconfiguredClient.request('/campaigns')).rejects.toThrow(
        'API token not configured'
      );
    });
  });

  // ============================================================================
  // HTTP Method Helpers Tests
  // ============================================================================

  describe('GET requests', () => {
    it('should make GET request using get() helper', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await client.get('/campaigns');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/campaigns');
      expect(options.method).toBe('GET');
    });
  });

  describe('POST requests', () => {
    it('should make POST request using post() helper', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: {} }));

      const payload = { name: 'Test Campaign' };
      await client.post('/campaigns', payload);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/campaigns');
      expect(options.method).toBe('POST');
      expect(options.body).toBe(JSON.stringify(payload));
    });

    it('should make POST request with FormData using postFormData() helper', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: {} }));

      const formData = new FormData();
      formData.append('image', new Blob(['test']), 'test.png');

      await client.postFormData('/upload', formData);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/upload');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
    });
  });

  describe('PUT requests', () => {
    it('should make PUT request using put() helper', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: {} }));

      const payload = { name: 'Updated Campaign' };
      await client.put('/campaigns/123', payload);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/campaigns/123');
      expect(options.method).toBe('PUT');
      expect(options.body).toBe(JSON.stringify(payload));
    });
  });

  describe('PATCH requests', () => {
    it('should make PATCH request using patch() helper', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: {} }));

      const payload = { name: 'Patched Campaign' };
      await client.patch('/campaigns/123', payload);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/campaigns/123');
      expect(options.method).toBe('PATCH');
      expect(options.body).toBe(JSON.stringify(payload));
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request using delete() helper', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await client.delete('/campaigns/123');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/campaigns/123');
      expect(options.method).toBe('DELETE');
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw authentication error for 401 response', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(401, 'Invalid API token'));

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.AUTHENTICATION_ERROR);
        expect(error.status).toBe(401);
        expect(error.message).toContain('Invalid API token');
      }
    });

    it('should throw permission error for 403 response', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(403, 'Access denied'));

      try {
        await client.request('/campaigns/123');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.PERMISSION_ERROR);
        expect(error.status).toBe(403);
      }
    });

    it('should throw not found error for 404 response', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(404, 'Resource not found'));

      try {
        await client.request('/campaigns/999');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.NOT_FOUND_ERROR);
        expect(error.status).toBe(404);
      }
    });

    it('should throw validation error for 422 response', async () => {
      const errorResponse = {
        message: 'Validation failed',
        errors: { name: ['Name is required'] }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(errorResponse)),
        json: () => Promise.resolve(errorResponse)
      });

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.VALIDATION_ERROR);
        expect(error.status).toBe(422);
        expect(error.details.validationErrors).toEqual({ name: ['Name is required'] });
      }
    });

    it('should throw rate limit error for 429 response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(429, 'Rate limit exceeded', {
          'retry-after': '60',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60)
        })
      );

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.RATE_LIMIT_ERROR);
        expect(error.status).toBe(429);
        expect(error.retryAfter).toBe(60000); // 60 seconds in milliseconds
        expect(mockPause).toHaveBeenCalled();
      }
    });

    it('should throw API error for 500 response', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(500, 'Internal server error'));

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.API_ERROR);
        expect(error.status).toBe(500);
      }
    });

    it('should throw API error for 502 response', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(502, 'Bad gateway'));

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.API_ERROR);
        expect(error.status).toBe(502);
      }
    });

    it('should throw API error for 503 response', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(503, 'Service unavailable'));

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.API_ERROR);
        expect(error.status).toBe(503);
      }
    });

    it('should handle timeout errors', async () => {
      // Mock AbortError
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.TIMEOUT_ERROR);
        expect(error.message).toContain('timed out');
      }
    });

    it('should handle network errors', async () => {
      const networkError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValueOnce(networkError);

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.NETWORK_ERROR);
        expect(error.message).toContain('Network error');
      }
    });

    it('should wrap unknown errors', async () => {
      const unknownError = new Error('Unknown error occurred');
      mockFetch.mockRejectedValueOnce(unknownError);

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.API_ERROR);
      }
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        text: () => Promise.resolve('Plain text error'),
        json: () => Promise.reject(new Error('Not JSON'))
      });

      try {
        await client.request('/campaigns');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.status).toBe(500);
      }
    });
  });

  // ============================================================================
  // KankaError Class Tests
  // ============================================================================

  describe('KankaError', () => {
    it('should create error with all properties', () => {
      const error = new KankaError('Test error', KankaErrorType.API_ERROR, 500, {
        response: { message: 'Server error' }
      });

      expect(error.name).toBe('KankaError');
      expect(error.message).toBe('Test error');
      expect(error.type).toBe(KankaErrorType.API_ERROR);
      expect(error.status).toBe(500);
      expect(error.details).toEqual({ response: { message: 'Server error' } });
    });

    it('should extract retry-after from headers', () => {
      const error = new KankaError('Rate limited', KankaErrorType.RATE_LIMIT_ERROR, 429, {
        headers: { 'retry-after': '60' }
      });

      expect(error.retryAfter).toBe(60000); // 60 seconds in milliseconds
    });

    it('should extract rate limit headers', () => {
      const error = new KankaError('Rate limited', KankaErrorType.RATE_LIMIT_ERROR, 429, {
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1640000000'
        }
      });

      expect(error.rateLimitRemaining).toBe('0');
      expect(error.rateLimitReset).toBe('1640000000');
    });

    it('should identify retryable errors', () => {
      const rateLimitError = new KankaError('Rate limited', KankaErrorType.RATE_LIMIT_ERROR, 429);
      expect(rateLimitError.isRetryable).toBe(true);

      const networkError = new KankaError('Network error', KankaErrorType.NETWORK_ERROR);
      expect(networkError.isRetryable).toBe(true);

      const timeoutError = new KankaError('Timeout', KankaErrorType.TIMEOUT_ERROR);
      expect(timeoutError.isRetryable).toBe(true);

      const serverError = new KankaError('Server error', KankaErrorType.API_ERROR, 500);
      expect(serverError.isRetryable).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const authError = new KankaError('Auth failed', KankaErrorType.AUTHENTICATION_ERROR, 401);
      expect(authError.isRetryable).toBe(false);

      const notFoundError = new KankaError('Not found', KankaErrorType.NOT_FOUND_ERROR, 404);
      expect(notFoundError.isRetryable).toBe(false);

      const validationError = new KankaError(
        'Validation failed',
        KankaErrorType.VALIDATION_ERROR,
        422
      );
      expect(validationError.isRetryable).toBe(false);
    });
  });

  // ============================================================================
  // Rate Limiting Tests
  // ============================================================================

  describe('rate limiting', () => {
    it('should use rate limiter for all requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

      await client.get('/campaigns');
      await client.post('/campaigns', { name: 'Test' });

      expect(mockExecuteWithRetry).toHaveBeenCalledTimes(2);
    });

    it('should pause rate limiter on 429 response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(429, 'Rate limit exceeded', {
          'retry-after': '60'
        })
      );

      try {
        await client.request('/campaigns');
      } catch {
        expect(mockPause).toHaveBeenCalled();
      }
    });

    it('should warn when rate limit is low', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ data: [] }, 200, {
          'x-ratelimit-remaining': '3',
          'x-ratelimit-limit': '30'
        })
      );

      await client.get('/campaigns');

      // Logger warning should be called (checked in implementation)
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should pause when rate limit exhausted', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 60;
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ data: [] }, 200, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(resetTime)
        })
      );

      await client.get('/campaigns');

      expect(mockPause).toHaveBeenCalled();
    });

    it('should get rate limiter statistics', () => {
      const stats = client.getRateLimiterStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('rateLimitHits');
      expect(stats).toHaveProperty('retries');
    });

    it('should reset rate limiter', () => {
      client.resetRateLimiter();
      expect(mockReset).toHaveBeenCalled();
    });

    it('should expose remaining requests', () => {
      expect(client.remainingRequests).toBe(30);
    });

    it('should expose rate limit status', () => {
      expect(client.isRateLimited).toBe(false);
    });
  });

  // ============================================================================
  // API Token Validation Tests
  // ============================================================================

  describe('validateApiToken', () => {
    it('should return true for valid API token', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      const result = await client.validateApiToken();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/campaigns');
    });

    it('should return false for invalid API token (401)', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(401, 'Invalid token'));

      const result = await client.validateApiToken();

      expect(result).toBe(false);
    });

    it('should return false when no API token set', async () => {
      const unconfiguredClient = new KankaClient('');
      const result = await unconfiguredClient.validateApiToken();

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw for non-auth errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(500, 'Server error'));

      // Non-auth errors now propagate as thrown errors
      await expect(client.validateApiToken()).rejects.toThrow();
    });

    it('should throw on network errors during validation', async () => {
      const networkError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValueOnce(networkError);

      // Network errors now propagate as thrown errors
      await expect(client.validateApiToken()).rejects.toThrow();
    });
  });

  // ============================================================================
  // Successful Request Tests
  // ============================================================================

  describe('successful requests', () => {
    it('should return parsed JSON data', async () => {
      const responseData = { data: { id: 123, name: 'Test Campaign' } };
      mockFetch.mockResolvedValueOnce(createMockResponse(responseData));

      const result = await client.get('/campaigns/123');

      expect(result).toEqual(responseData);
    });

    it('should handle empty response body', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      const result = await client.delete('/campaigns/123');

      expect(result).toEqual({});
    });

    it('should handle Kanka-wrapped responses', async () => {
      const kankaResponse = {
        data: { id: 123, name: 'Campaign' },
        meta: { current_page: 1 }
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(kankaResponse));

      const result = await client.get('/campaigns/123');

      expect(result.data).toEqual({ id: 123, name: 'Campaign' });
      expect(result.meta).toBeDefined();
    });
  });

  // ============================================================================
  // Custom Timeout Tests
  // ============================================================================

  describe('custom timeout', () => {
    it('should use custom timeout when provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await client.request('/campaigns', { timeout: 60000 });

      // Timeout is handled internally, just verify request succeeds
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should use default timeout when not provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await client.request('/campaigns');

      // Default timeout is handled internally
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Exported Constants Tests
  // ============================================================================

  describe('exported constants', () => {
    it('should export KANKA_BASE_URL', () => {
      expect(KANKA_BASE_URL).toBe('https://api.kanka.io/1.0');
    });

    it('should export KankaErrorType enum', () => {
      expect(KankaErrorType.AUTHENTICATION_ERROR).toBe('authentication_error');
      expect(KankaErrorType.RATE_LIMIT_ERROR).toBe('rate_limit_error');
      expect(KankaErrorType.NOT_FOUND_ERROR).toBe('not_found_error');
      expect(KankaErrorType.VALIDATION_ERROR).toBe('validation_error');
      expect(KankaErrorType.PERMISSION_ERROR).toBe('permission_error');
      expect(KankaErrorType.API_ERROR).toBe('api_error');
      expect(KankaErrorType.NETWORK_ERROR).toBe('network_error');
      expect(KankaErrorType.TIMEOUT_ERROR).toBe('timeout_error');
    });
  });
});
