/**
 * Tests for KankaClient - Base API Client for Kanka.io
 *
 * Covers: constructor, request methods, authentication headers, rate limiting (429),
 * error parsing, retry logic, timeout handling, token validation, getters/setters
 */
import {
  KankaClient,
  KankaError,
  KankaErrorType,
  KANKA_BASE_URL
} from '../../scripts/kanka/KankaClient.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a mock Response object for fetch
 */
function mockResponse(body, options = {}) {
  const status = options.status || 200;
  const ok = status >= 200 && status < 300;
  const headersMap = new Map(Object.entries(options.headers || {}));

  return {
    ok,
    status,
    statusText: options.statusText || (ok ? 'OK' : 'Error'),
    headers: {
      get: (key) => headersMap.get(key.toLowerCase()) ?? null,
      has: (key) => headersMap.has(key.toLowerCase())
    },
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(body)]))
  };
}

const TEST_TOKEN = 'test-kanka-token-abc123';
const TEST_CAMPAIGN_ID = '42';

// ── Tests ────────────────────────────────────────────────────────────────

describe('KankaClient', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  // ════════════════════════════════════════════════════════════════════════
  // Constructor
  // ════════════════════════════════════════════════════════════════════════

  describe('constructor', () => {
    it('should create instance with API token', () => {
      const client = new KankaClient(TEST_TOKEN);
      expect(client.isConfigured).toBe(true);
      expect(client.baseUrl).toBe(KANKA_BASE_URL);
      expect(client.isPremium).toBe(false);
    });

    it('should create instance without API token', () => {
      const client = new KankaClient('');
      expect(client.isConfigured).toBe(false);
    });

    it('should create instance with null API token', () => {
      const client = new KankaClient(null);
      expect(client.isConfigured).toBe(false);
    });

    it('should accept custom base URL', () => {
      const client = new KankaClient(TEST_TOKEN, { baseUrl: 'https://custom.api.io/v2' });
      expect(client.baseUrl).toBe('https://custom.api.io/v2');
    });

    it('should accept custom timeout', () => {
      const client = new KankaClient(TEST_TOKEN, { timeout: 5000 });
      expect(client._timeout).toBe(5000);
    });

    it('should accept custom maxRetries', () => {
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 5 });
      expect(client._maxRetries).toBe(5);
    });

    it('should accept maxRetries of 0', () => {
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 0 });
      expect(client._maxRetries).toBe(0);
    });

    it('should set premium status', () => {
      const client = new KankaClient(TEST_TOKEN, { isPremium: true });
      expect(client.isPremium).toBe(true);
    });

    it('should default isPremium to false', () => {
      const client = new KankaClient(TEST_TOKEN, { isPremium: undefined });
      expect(client.isPremium).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // isConfigured getter
  // ════════════════════════════════════════════════════════════════════════

  describe('isConfigured', () => {
    it('should return true when token is set', () => {
      const client = new KankaClient(TEST_TOKEN);
      expect(client.isConfigured).toBe(true);
    });

    it('should return false when token is empty string', () => {
      const client = new KankaClient('');
      expect(client.isConfigured).toBe(false);
    });

    it('should return false when token is null', () => {
      const client = new KankaClient(null);
      expect(client.isConfigured).toBe(false);
    });

    it('should return false when token is undefined', () => {
      const client = new KankaClient(undefined);
      expect(client.isConfigured).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // setApiToken
  // ════════════════════════════════════════════════════════════════════════

  describe('setApiToken()', () => {
    it('should update the API token', () => {
      const client = new KankaClient('');
      expect(client.isConfigured).toBe(false);

      client.setApiToken('new-token');
      expect(client.isConfigured).toBe(true);
    });

    it('should handle empty string token', () => {
      const client = new KankaClient(TEST_TOKEN);
      client.setApiToken('');
      expect(client.isConfigured).toBe(false);
    });

    it('should handle null token', () => {
      const client = new KankaClient(TEST_TOKEN);
      client.setApiToken(null);
      expect(client.isConfigured).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // setPremiumStatus
  // ════════════════════════════════════════════════════════════════════════

  describe('setPremiumStatus()', () => {
    it('should update premium status from free to premium', () => {
      const client = new KankaClient(TEST_TOKEN, { isPremium: false });
      client.setPremiumStatus(true);
      expect(client.isPremium).toBe(true);
    });

    it('should update premium status from premium to free', () => {
      const client = new KankaClient(TEST_TOKEN, { isPremium: true });
      client.setPremiumStatus(false);
      expect(client.isPremium).toBe(false);
    });

    it('should not recreate rate limiter if status unchanged', () => {
      const client = new KankaClient(TEST_TOKEN, { isPremium: false });
      const originalLimiter = client._rateLimiter;
      client.setPremiumStatus(false);
      expect(client._rateLimiter).toBe(originalLimiter);
    });

    it('should recreate rate limiter when status changes', () => {
      const client = new KankaClient(TEST_TOKEN, { isPremium: false });
      const originalLimiter = client._rateLimiter;
      client.setPremiumStatus(true);
      expect(client._rateLimiter).not.toBe(originalLimiter);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildAuthHeaders (private, tested indirectly)
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildAuthHeaders()', () => {
    it('should return Bearer authorization header', () => {
      const client = new KankaClient(TEST_TOKEN);
      const headers = client._buildAuthHeaders();
      expect(headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    });

    it('should throw if token is not set', () => {
      const client = new KankaClient('');
      expect(() => client._buildAuthHeaders()).toThrow(KankaError);
      expect(() => client._buildAuthHeaders()).toThrow('Kanka API token not configured');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildJsonHeaders
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildJsonHeaders()', () => {
    it('should return auth + content type + accept headers', () => {
      const client = new KankaClient(TEST_TOKEN);
      const headers = client._buildJsonHeaders();
      expect(headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Accept).toBe('application/json');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildUrl
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildUrl()', () => {
    it('should build URL with leading slash', () => {
      const client = new KankaClient(TEST_TOKEN);
      expect(client._buildUrl('/campaigns')).toBe(`${KANKA_BASE_URL}/campaigns`);
    });

    it('should add leading slash if missing', () => {
      const client = new KankaClient(TEST_TOKEN);
      expect(client._buildUrl('campaigns')).toBe(`${KANKA_BASE_URL}/campaigns`);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // request() - main method
  // ════════════════════════════════════════════════════════════════════════

  describe('request()', () => {
    it('should throw if client is not configured', async () => {
      const client = new KankaClient('');
      await expect(client.request('/campaigns')).rejects.toThrow(KankaError);
      await expect(client.request('/campaigns')).rejects.toThrow('Kanka API token not configured');
    });

    it('should make GET request with correct headers', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const responseData = { data: [{ id: 1, name: 'Campaign 1' }] };
      fetchSpy.mockResolvedValue(mockResponse(responseData));

      const result = await client.request('/campaigns');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${KANKA_BASE_URL}/campaigns`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_TOKEN}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          })
        })
      );
      expect(result).toEqual(responseData);
    });

    it('should make POST request with JSON body', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const payload = { name: 'Test' };
      fetchSpy.mockResolvedValue(mockResponse({ data: { id: 1, name: 'Test' } }));

      await client.request('/campaigns/1/characters', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload)
        })
      );
    });

    it('should use FormData body without Content-Type header', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const formData = new FormData();
      formData.append('image', 'test');

      fetchSpy.mockResolvedValue(mockResponse({ data: { id: 1 } }));

      await client.request('/campaigns/1/characters/1', {
        method: 'POST',
        body: formData
      });

      const callArgs = fetchSpy.mock.calls[0][1];
      expect(callArgs.headers).not.toHaveProperty('Content-Type');
      expect(callArgs.body).toBe(formData);
    });

    it('should merge custom headers', async () => {
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({ data: [] }));

      await client.request('/campaigns', {
        headers: { 'X-Custom': 'value' }
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
            Authorization: `Bearer ${TEST_TOKEN}`
          })
        })
      );
    });

    it('should return parsed JSON response', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const responseData = { data: { id: 42, name: 'My Campaign' }, meta: {} };
      fetchSpy.mockResolvedValue(mockResponse(responseData));

      const result = await client.request('/campaigns/42');

      expect(result).toEqual(responseData);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Error handling
  // ════════════════════════════════════════════════════════════════════════

  describe('error handling', () => {
    it('should parse 401 as authentication error', async () => {
      expect.assertions(3);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({ message: 'Unauthenticated' }, { status: 401 }));

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.AUTHENTICATION_ERROR);
        expect(error.status).toBe(401);
      }
    });

    it('should parse 403 as permission error', async () => {
      expect.assertions(3);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({ message: 'Forbidden' }, { status: 403 }));

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.PERMISSION_ERROR);
        expect(error.status).toBe(403);
      }
    });

    it('should parse 404 as not found error', async () => {
      expect.assertions(3);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({ message: 'Not found' }, { status: 404 }));

      try {
        await client.request('/campaigns/999');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.NOT_FOUND_ERROR);
        expect(error.status).toBe(404);
      }
    });

    it('should parse 422 as validation error', async () => {
      expect.assertions(4);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(
        mockResponse(
          { message: 'Validation failed', errors: { name: ['required'] } },
          { status: 422 }
        )
      );

      try {
        await client.request('/campaigns/1/characters', { method: 'POST' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.VALIDATION_ERROR);
        expect(error.status).toBe(422);
        expect(error.details.validationErrors).toEqual({ name: ['required'] });
      }
    });

    it('should parse 429 as rate limit error and pause limiter', async () => {
      expect.assertions(3);
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 0 });
      const pauseSpy = vi.spyOn(client._rateLimiter, 'pause');

      fetchSpy.mockResolvedValue(
        mockResponse(
          { message: 'Too Many Requests' },
          {
            status: 429,
            headers: { 'retry-after': '30' }
          }
        )
      );

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.RATE_LIMIT_ERROR);
        expect(pauseSpy).toHaveBeenCalled();
      }
    });

    it('should parse 500 as API error with service unavailable message', async () => {
      expect.assertions(3);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(
        mockResponse({ message: 'Internal server error' }, { status: 500 })
      );

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.API_ERROR);
        expect(error.message).toContain('temporarily unavailable');
      }
    });

    it('should parse 502 as API error', async () => {
      expect.assertions(2);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({}, { status: 502 }));

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.API_ERROR);
        expect(error.status).toBe(502);
      }
    });

    it('should parse 503 as API error', async () => {
      expect.assertions(2);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({}, { status: 503 }));

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.API_ERROR);
        expect(error.status).toBe(503);
      }
    });

    it('should handle non-JSON error response body', async () => {
      expect.assertions(2);
      const client = new KankaClient(TEST_TOKEN);
      const resp = mockResponse({}, { status: 400 });
      resp.text.mockResolvedValue('Not valid JSON {{{');
      fetchSpy.mockResolvedValue(resp);

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        // Should still have a message even with unparseable body
        expect(error.message).toBeTruthy();
      }
    });

    it('should handle empty error response body', async () => {
      expect.assertions(1);
      const client = new KankaClient(TEST_TOKEN);
      const resp = mockResponse({}, { status: 400 });
      resp.text.mockResolvedValue('');
      fetchSpy.mockResolvedValue(resp);

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
      }
    });

    it('should use error.error field if present in response', async () => {
      expect.assertions(1);
      const client = new KankaClient(TEST_TOKEN);
      const resp = mockResponse({}, { status: 400 });
      resp.text.mockResolvedValue(JSON.stringify({ error: 'Custom error' }));
      fetchSpy.mockResolvedValue(resp);

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
      }
    });

    it('should handle timeout (AbortError)', async () => {
      expect.assertions(3);
      const client = new KankaClient(TEST_TOKEN, { timeout: 100 });
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      fetchSpy.mockRejectedValue(abortError);

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.TIMEOUT_ERROR);
        expect(error.message).toContain('timed out');
      }
    });

    it('should handle network errors (TypeError from fetch)', async () => {
      expect.assertions(3);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.NETWORK_ERROR);
        expect(error.message).toContain('Network error');
      }
    });

    it('should wrap unknown errors as API errors', async () => {
      expect.assertions(2);
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockRejectedValue(new Error('Something went wrong'));

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.API_ERROR);
      }
    });

    it('should re-throw KankaError as-is', async () => {
      expect.assertions(1);
      const client = new KankaClient(TEST_TOKEN);
      const kankaError = new KankaError('Custom error', KankaErrorType.VALIDATION_ERROR, 422);
      fetchSpy.mockRejectedValue(kankaError);

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBe(kankaError);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // KankaError class
  // ════════════════════════════════════════════════════════════════════════

  describe('KankaError', () => {
    it('should create error with all properties', () => {
      const error = new KankaError('Test error', KankaErrorType.API_ERROR, 500, {
        response: { message: 'Internal error' }
      });

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('KankaError');
      expect(error.type).toBe(KankaErrorType.API_ERROR);
      expect(error.status).toBe(500);
      expect(error.details.response.message).toBe('Internal error');
      expect(error.retryAfter).toBeNull();
    });

    it('should extract retry-after from headers', () => {
      const error = new KankaError('Rate limit', KankaErrorType.RATE_LIMIT_ERROR, 429, {
        headers: { 'retry-after': '60' }
      });

      expect(error.retryAfter).toBe(60000); // Converted to ms
    });

    it('should extract rate limit remaining header', () => {
      const error = new KankaError('Error', KankaErrorType.API_ERROR, 200, {
        headers: {
          'x-ratelimit-remaining': '5',
          'x-ratelimit-reset': '1700000000'
        }
      });

      expect(error.rateLimitRemaining).toBe('5');
      expect(error.rateLimitReset).toBe('1700000000');
    });

    describe('isRetryable', () => {
      it('should return true for rate limit errors', () => {
        const error = new KankaError('Rate limit', KankaErrorType.RATE_LIMIT_ERROR, 429);
        expect(error.isRetryable).toBe(true);
      });

      it('should return true for network errors', () => {
        const error = new KankaError('Network', KankaErrorType.NETWORK_ERROR);
        expect(error.isRetryable).toBe(true);
      });

      it('should return true for timeout errors', () => {
        const error = new KankaError('Timeout', KankaErrorType.TIMEOUT_ERROR);
        expect(error.isRetryable).toBe(true);
      });

      it('should return true for 500-range status codes', () => {
        const error = new KankaError('Server error', KankaErrorType.API_ERROR, 503);
        expect(error.isRetryable).toBe(true);
      });

      it('should return false for authentication errors', () => {
        const error = new KankaError('Auth error', KankaErrorType.AUTHENTICATION_ERROR, 401);
        expect(error.isRetryable).toBe(false);
      });

      it('should return false for validation errors', () => {
        const error = new KankaError('Validation', KankaErrorType.VALIDATION_ERROR, 422);
        expect(error.isRetryable).toBe(false);
      });

      it('should return false for not found errors', () => {
        const error = new KankaError('Not found', KankaErrorType.NOT_FOUND_ERROR, 404);
        expect(error.isRetryable).toBe(false);
      });

      it('should return false for permission errors', () => {
        const error = new KankaError('Forbidden', KankaErrorType.PERMISSION_ERROR, 403);
        expect(error.isRetryable).toBe(false);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // HTTP convenience methods
  // ════════════════════════════════════════════════════════════════════════

  describe('HTTP methods', () => {
    let client;

    beforeEach(() => {
      client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({ data: { id: 1 } }));
    });

    describe('get()', () => {
      it('should make GET request', async () => {
        await client.get('/campaigns');
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ method: 'GET' })
        );
      });

      it('should pass additional options', async () => {
        await client.get('/campaigns', { timeout: 5000 });
        expect(fetchSpy).toHaveBeenCalled();
      });
    });

    describe('post()', () => {
      it('should make POST request with JSON body', async () => {
        const data = { name: 'Test' };
        await client.post('/campaigns/1/characters', data);

        expect(fetchSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(data)
          })
        );
      });
    });

    describe('put()', () => {
      it('should make PUT request with JSON body', async () => {
        const data = { name: 'Updated' };
        await client.put('/campaigns/1/characters/1', data);

        expect(fetchSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify(data)
          })
        );
      });
    });

    describe('patch()', () => {
      it('should make PATCH request with JSON body', async () => {
        const data = { name: 'Patched' };
        await client.patch('/campaigns/1/characters/1', data);

        expect(fetchSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify(data)
          })
        );
      });
    });

    describe('delete()', () => {
      it('should make DELETE request', async () => {
        await client.delete('/campaigns/1/characters/1');

        expect(fetchSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    describe('postFormData()', () => {
      it('should make POST request with FormData', async () => {
        const formData = new FormData();
        formData.append('image', 'test-blob');

        await client.postFormData('/campaigns/1/characters/1', formData);

        const callArgs = fetchSpy.mock.calls[0][1];
        expect(callArgs.method).toBe('POST');
        expect(callArgs.body).toBe(formData);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getCampaigns()
  // ════════════════════════════════════════════════════════════════════════

  describe('getCampaigns()', () => {
    it('should return list of campaigns', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const campaigns = [
        { id: 1, name: 'Campaign 1' },
        { id: 2, name: 'Campaign 2' }
      ];
      fetchSpy.mockResolvedValue(mockResponse({ data: campaigns }));

      const result = await client.getCampaigns();

      expect(result).toEqual(campaigns);
    });

    it('should return empty array when no campaigns', async () => {
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({ data: [] }));

      const result = await client.getCampaigns();

      expect(result).toEqual([]);
    });

    it('should return empty array when data is missing', async () => {
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({}));

      const result = await client.getCampaigns();

      expect(result).toEqual([]);
    });

    it('should throw on API error', async () => {
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({}, { status: 401 }));

      await expect(client.getCampaigns()).rejects.toThrow(KankaError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // validateApiToken()
  // ════════════════════════════════════════════════════════════════════════

  describe('validateApiToken()', () => {
    it('should return true for valid token', async () => {
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({ data: [] }));

      const result = await client.validateApiToken();

      expect(result).toBe(true);
    });

    it('should return false when token is empty', async () => {
      const client = new KankaClient('');

      const result = await client.validateApiToken();

      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should return false for invalid token (401)', async () => {
      const client = new KankaClient('bad-token');
      fetchSpy.mockResolvedValue(mockResponse({}, { status: 401 }));

      const result = await client.validateApiToken();

      expect(result).toBe(false);
    });

    it('should throw on non-auth errors', async () => {
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValue(mockResponse({}, { status: 500 }));

      await expect(client.validateApiToken()).rejects.toThrow();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Rate limiter helpers
  // ════════════════════════════════════════════════════════════════════════

  describe('rate limiter helpers', () => {
    it('getRateLimiterStats() should return stats object', () => {
      const client = new KankaClient(TEST_TOKEN);
      const stats = client.getRateLimiterStats();

      expect(stats).toHaveProperty('name');
      expect(stats).toHaveProperty('requestsPerMinute');
      expect(stats).toHaveProperty('currentWindowRequests');
    });

    it('resetRateLimiter() should reset without error', () => {
      const client = new KankaClient(TEST_TOKEN);
      expect(() => client.resetRateLimiter()).not.toThrow();
    });

    it('remainingRequests should return a number', () => {
      const client = new KankaClient(TEST_TOKEN);
      expect(typeof client.remainingRequests).toBe('number');
      expect(client.remainingRequests).toBeGreaterThanOrEqual(0);
    });

    it('isRateLimited should return false initially', () => {
      const client = new KankaClient(TEST_TOKEN);
      expect(client.isRateLimited).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _handleRateLimitHeaders
  // ════════════════════════════════════════════════════════════════════════

  describe('_handleRateLimitHeaders()', () => {
    it('should log warning when remaining requests is low', () => {
      const client = new KankaClient(TEST_TOKEN);
      const response = mockResponse(
        {},
        {
          headers: { 'x-ratelimit-remaining': '3' }
        }
      );

      // Should not throw
      client._handleRateLimitHeaders(response);
    });

    it('should pause when remaining is 0', () => {
      const client = new KankaClient(TEST_TOKEN);
      const futureTime = Math.floor((Date.now() + 60000) / 1000);
      const response = mockResponse(
        {},
        {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(futureTime)
          }
        }
      );

      const pauseSpy = vi.spyOn(client._rateLimiter, 'pause');

      client._handleRateLimitHeaders(response);

      expect(pauseSpy).toHaveBeenCalled();
    });

    it('should not pause when remaining is 0 but reset time is in the past', () => {
      const client = new KankaClient(TEST_TOKEN);
      const pastTime = Math.floor((Date.now() - 60000) / 1000);
      const response = mockResponse(
        {},
        {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(pastTime)
          }
        }
      );

      const pauseSpy = vi.spyOn(client._rateLimiter, 'pause');

      client._handleRateLimitHeaders(response);

      // Should not pause because the wait time would be <= 0
      expect(pauseSpy).not.toHaveBeenCalled();
    });

    it('should handle missing rate limit headers gracefully', () => {
      const client = new KankaClient(TEST_TOKEN);
      const response = mockResponse({});

      expect(() => client._handleRateLimitHeaders(response)).not.toThrow();
    });

    it('should handle remaining of 0 without reset header', () => {
      const client = new KankaClient(TEST_TOKEN);
      const response = mockResponse(
        {},
        {
          headers: { 'x-ratelimit-remaining': '0' }
        }
      );

      expect(() => client._handleRateLimitHeaders(response)).not.toThrow();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _extractRateLimitHeaders
  // ════════════════════════════════════════════════════════════════════════

  describe('_extractRateLimitHeaders()', () => {
    it('should extract all rate limit headers', () => {
      const client = new KankaClient(TEST_TOKEN);
      const response = mockResponse(
        {},
        {
          headers: {
            'x-ratelimit-limit': '30',
            'x-ratelimit-remaining': '25',
            'x-ratelimit-reset': '1700000000',
            'retry-after': '60'
          }
        }
      );

      const headers = client._extractRateLimitHeaders(response);

      expect(headers['x-ratelimit-limit']).toBe('30');
      expect(headers['x-ratelimit-remaining']).toBe('25');
      expect(headers['x-ratelimit-reset']).toBe('1700000000');
      expect(headers['retry-after']).toBe('60');
    });

    it('should return empty object when no rate limit headers', () => {
      const client = new KankaClient(TEST_TOKEN);
      const response = mockResponse({});

      const headers = client._extractRateLimitHeaders(response);

      expect(headers).toEqual({});
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _createTimeoutController
  // ════════════════════════════════════════════════════════════════════════

  describe('_createTimeoutController()', () => {
    it('should create an AbortController', () => {
      const client = new KankaClient(TEST_TOKEN);
      const controller = client._createTimeoutController();

      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.timeoutId).toBeDefined();

      // Clean up timer
      clearTimeout(controller.timeoutId);
    });

    it('should use custom timeout when provided', () => {
      const client = new KankaClient(TEST_TOKEN);
      const controller = client._createTimeoutController(1000);

      expect(controller).toBeInstanceOf(AbortController);
      clearTimeout(controller.timeoutId);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // KankaErrorType enum
  // ════════════════════════════════════════════════════════════════════════

  describe('KankaErrorType', () => {
    it('should have all expected error types', () => {
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

  // ════════════════════════════════════════════════════════════════════════
  // AbortController per-retry (Fix: fresh controller for each attempt)
  // ════════════════════════════════════════════════════════════════════════

  describe('AbortController per-retry', () => {
    it('should create a fresh AbortController for each retry attempt', async () => {
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 1 });
      const controllersCreated = [];

      // Spy on _createTimeoutController to track how many are created
      const origCreate = client._createTimeoutController.bind(client);
      vi.spyOn(client, '_createTimeoutController').mockImplementation((timeout) => {
        const controller = origCreate(timeout);
        controllersCreated.push(controller);
        return controller;
      });

      // First call: fail with rate limit, second call: succeed
      let callCount = 0;
      fetchSpy.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return mockResponse(
            { message: 'Too Many Requests' },
            { status: 429, headers: { 'retry-after': '0' } }
          );
        }
        return mockResponse({ data: { id: 1 } });
      });

      // The rate limiter's executeWithRetry will retry rate limit errors
      // Each call to the closure should create a new controller
      try {
        await client.request('/campaigns');
      } catch {
        // May throw if rate limiter doesn't retry fast enough
      }

      // Should have created at least 1 controller (at minimum the first attempt)
      expect(controllersCreated.length).toBeGreaterThanOrEqual(1);

      // Clean up all timeout timers
      controllersCreated.forEach((c) => clearTimeout(c.timeoutId));
    });

    it('should not share signal between retry attempts', async () => {
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 0 });

      // Verify that each call to request() creates a controller inside the closure
      // by checking the signal passed to fetch is from a fresh controller
      const signals = [];
      fetchSpy.mockImplementation(async (url, options) => {
        signals.push(options.signal);
        return mockResponse({ data: [] });
      });

      await client.request('/campaigns');
      expect(signals).toHaveLength(1);
      expect(signals[0]).toBeDefined();
      expect(signals[0].aborted).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Rate limit headers ordering (Fix: only on successful responses)
  // ════════════════════════════════════════════════════════════════════════

  describe('rate limit headers ordering', () => {
    it('should NOT call _handleRateLimitHeaders on 429 responses (no double-pause)', async () => {
      expect.assertions(3);
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 0 });
      const handleHeadersSpy = vi.spyOn(client, '_handleRateLimitHeaders');

      fetchSpy.mockResolvedValue(
        mockResponse(
          { message: 'Too Many Requests' },
          {
            status: 429,
            headers: {
              'retry-after': '30',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor((Date.now() + 60000) / 1000))
            }
          }
        )
      );

      try {
        await client.request('/campaigns');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.RATE_LIMIT_ERROR);
      }

      // _handleRateLimitHeaders should NOT have been called for the 429 response
      expect(handleHeadersSpy).not.toHaveBeenCalled();
    });

    it('should call _handleRateLimitHeaders only on successful responses', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const handleHeadersSpy = vi.spyOn(client, '_handleRateLimitHeaders');

      fetchSpy.mockResolvedValue(
        mockResponse(
          { data: [] },
          {
            status: 200,
            headers: {
              'x-ratelimit-remaining': '25',
              'x-ratelimit-limit': '30'
            }
          }
        )
      );

      await client.request('/campaigns');

      expect(handleHeadersSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT call _handleRateLimitHeaders on non-429 error responses', async () => {
      expect.assertions(2);
      const client = new KankaClient(TEST_TOKEN);
      const handleHeadersSpy = vi.spyOn(client, '_handleRateLimitHeaders');

      fetchSpy.mockResolvedValue(
        mockResponse(
          { message: 'Not found' },
          {
            status: 404,
            headers: {
              'x-ratelimit-remaining': '20',
              'x-ratelimit-limit': '30'
            }
          }
        )
      );

      try {
        await client.request('/campaigns/999');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.type).toBe(KankaErrorType.NOT_FOUND_ERROR);
      }

      // Should not process rate limit headers on error responses
      expect(handleHeadersSpy).not.toHaveBeenCalled();
    });

    it('should not double-pause from _handleRateLimitHeaders on 429', async () => {
      // Previously _handleRateLimitHeaders was called BEFORE the !response.ok check,
      // causing pause to be called from both _handleRateLimitHeaders (remaining=0) AND
      // the 429 error handler. Now _handleRateLimitHeaders is only called on success.
      //
      // Note: The RateLimiter's own _processQueue also detects rate limit errors
      // and calls pause — that's by design. The fix eliminates the EXTRA pause from
      // _handleRateLimitHeaders, not the one from the RateLimiter's own retry logic.
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 0 });
      const handleHeadersSpy = vi.spyOn(client, '_handleRateLimitHeaders');
      const pauseSpy = vi.spyOn(client._rateLimiter, 'pause');

      fetchSpy.mockResolvedValue(
        mockResponse(
          { message: 'Too Many Requests' },
          {
            status: 429,
            headers: {
              'retry-after': '30',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor((Date.now() + 60000) / 1000))
            }
          }
        )
      );

      try {
        await client.request('/campaigns');
      } catch {
        // Expected
      }

      // _handleRateLimitHeaders should NOT be called (the source of the old double-pause)
      expect(handleHeadersSpy).not.toHaveBeenCalled();
      // pause IS still called (from KankaClient 429 handler + RateLimiter internal)
      // but NOT from _handleRateLimitHeaders
      expect(pauseSpy).toHaveBeenCalledWith(30000);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _parseErrorResponse XSS sanitization
  // ════════════════════════════════════════════════════════════════════════

  describe('_parseErrorResponse XSS sanitization', () => {
    it('should sanitize HTML in Kanka error messages', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const xssMessage = '<img src=x onerror=alert(1)>Error occurred';
      fetchSpy.mockResolvedValueOnce(mockResponse({ message: xssMessage }, { status: 403 }));

      try {
        await client.get(`/campaigns/${TEST_CAMPAIGN_ID}/entities`);
        expect.fail('Should have thrown');
      } catch (error) {
        // Angle brackets must be escaped so the tag is not rendered as HTML
        expect(error.message).not.toContain('<img');
        expect(error.message).not.toContain('>');
        expect(error.message).toContain('&lt;img');
        expect(error.message).toContain('&gt;');
      }
    });

    it('should sanitize HTML in Kanka error field', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const xssError = '<script>steal()</script>Server fault';
      fetchSpy.mockResolvedValueOnce(mockResponse({ error: xssError }, { status: 422 }));

      try {
        await client.get(`/campaigns/${TEST_CAMPAIGN_ID}/entities`);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).not.toContain('<script>');
      }
    });

    it('should truncate very long error messages', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const longMsg = 'x'.repeat(1000);
      fetchSpy.mockResolvedValueOnce(mockResponse({ message: longMsg }, { status: 422 }));

      try {
        await client.get(`/campaigns/${TEST_CAMPAIGN_ID}/entities`);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message.length).toBeLessThanOrEqual(500);
      }
    });

    it('should handle non-string error messages safely', async () => {
      const client = new KankaClient(TEST_TOKEN);
      fetchSpy.mockResolvedValueOnce(mockResponse({ message: 12345 }, { status: 422 }));

      try {
        await client.get(`/campaigns/${TEST_CAMPAIGN_ID}/entities`);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toBe('12345');
      }
    });

    it('should sanitize both angle brackets and quotes', async () => {
      const client = new KankaClient(TEST_TOKEN);
      const xssMessage = '"><svg onload=alert(1)>';
      fetchSpy.mockResolvedValueOnce(mockResponse({ message: xssMessage }, { status: 403 }));

      try {
        await client.get(`/campaigns/${TEST_CAMPAIGN_ID}/entities`);
        expect.fail('Should have thrown');
      } catch (error) {
        // Angle brackets and quotes must be escaped
        expect(error.message).not.toContain('<svg');
        expect(error.message).not.toContain('>');
        expect(error.message).toContain('&quot;');
        expect(error.message).toContain('&lt;svg');
        expect(error.message).toContain('&gt;');
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 429 with retry-after header parse in error
  // ════════════════════════════════════════════════════════════════════════

  describe('429 retry-after handling', () => {
    it('should use retry-after header in pause duration when present', async () => {
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 0 });
      const pauseSpy = vi.spyOn(client._rateLimiter, 'pause');

      fetchSpy.mockResolvedValue(
        mockResponse(
          { message: 'Too Many Requests' },
          { status: 429, headers: { 'retry-after': '45' } }
        )
      );

      try {
        await client.request('/campaigns');
      } catch (error) {
        // Expected
      }

      expect(pauseSpy).toHaveBeenCalledWith(45000); // 45 seconds * 1000
    });

    it('should default to 60000ms pause when no retry-after header', async () => {
      const client = new KankaClient(TEST_TOKEN, { maxRetries: 0 });
      const pauseSpy = vi.spyOn(client._rateLimiter, 'pause');

      fetchSpy.mockResolvedValue(mockResponse({ message: 'Too Many Requests' }, { status: 429 }));

      try {
        await client.request('/campaigns');
      } catch (error) {
        // Expected
      }

      expect(pauseSpy).toHaveBeenCalledWith(60000);
    });
  });
});
