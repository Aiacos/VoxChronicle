/**
 * Tests for WhisperBackend - HTTP Client for Local Whisper Server
 *
 * Covers: exports, WhisperError, constructor, baseUrl, setBaseUrl,
 * lastHealthStatus, healthCheck (with caching), transcribe,
 * _requestWithRetry, _parseErrorResponse, _getErrorType,
 * getServerInfo, error handling, retry logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  WhisperBackend,
  WhisperError,
  WhisperErrorType,
  DEFAULT_WHISPER_URL,
  DEFAULT_TIMEOUT_MS,
  HEALTH_CHECK_TIMEOUT_MS
} from '../../scripts/ai/WhisperBackend.mjs';

// Mock Logger
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn()
    }))
  }
}));

// Mock RateLimiter
vi.mock('../../scripts/utils/RateLimiter.mjs', () => {
  class MockRateLimiter {
    constructor() {
      this.throttle = vi.fn((fn) => fn ? fn() : undefined);
      this.executeWithRetry = vi.fn((fn) => fn());
      this.pause = vi.fn();
      this.reset = vi.fn();
      this.getStats = vi.fn().mockReturnValue({});
    }
    static fromPreset() {
      return new MockRateLimiter();
    }
  }
  return { RateLimiter: MockRateLimiter };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(body, status = 200, contentType = 'application/json') {
  const headers = new Headers({ 'content-type': contentType });
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(body)]))
  };
}

function createAudioBlob(size = 1024) {
  return new Blob([new ArrayBuffer(size)], { type: 'audio/webm' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WhisperBackend', () => {
  let backend;
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(mockResponse({ text: 'Hello' }));
    globalThis.fetch = fetchSpy;

    backend = new WhisperBackend('http://localhost:8080', {
      timeout: 5000,
      maxRetries: 0 // Disable retries for most tests
    });
  });

  // ── Exports ────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export WhisperBackend class', () => {
      expect(WhisperBackend).toBeDefined();
      expect(typeof WhisperBackend).toBe('function');
    });

    it('should export WhisperError class', () => {
      expect(WhisperError).toBeDefined();
      const err = new WhisperError('test', WhisperErrorType.SERVER_ERROR, 500, {});
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WhisperError');
      expect(err.type).toBe(WhisperErrorType.SERVER_ERROR);
      expect(err.status).toBe(500);
    });

    it('should export WhisperErrorType enum', () => {
      expect(WhisperErrorType.CONNECTION_ERROR).toBe('connection_error');
      expect(WhisperErrorType.SERVER_ERROR).toBe('server_error');
      expect(WhisperErrorType.INVALID_REQUEST_ERROR).toBe('invalid_request_error');
      expect(WhisperErrorType.TIMEOUT_ERROR).toBe('timeout_error');
      expect(WhisperErrorType.UNSUPPORTED_FORMAT_ERROR).toBe('unsupported_format_error');
    });

    it('should export DEFAULT_WHISPER_URL', () => {
      expect(DEFAULT_WHISPER_URL).toBe('http://localhost:8080');
    });

    it('should export DEFAULT_TIMEOUT_MS', () => {
      expect(DEFAULT_TIMEOUT_MS).toBe(600000);
    });

    it('should export HEALTH_CHECK_TIMEOUT_MS', () => {
      expect(HEALTH_CHECK_TIMEOUT_MS).toBe(5000);
    });
  });

  // ── WhisperError ───────────────────────────────────────────────────

  describe('WhisperError', () => {
    it('should create error with all properties', () => {
      const err = new WhisperError('test msg', WhisperErrorType.SERVER_ERROR, 500, { foo: 'bar' });
      expect(err.message).toBe('test msg');
      expect(err.type).toBe('server_error');
      expect(err.status).toBe(500);
      expect(err.details).toEqual({ foo: 'bar' });
    });

    it('should default status and details to null', () => {
      const err = new WhisperError('test', WhisperErrorType.CONNECTION_ERROR);
      expect(err.status).toBe(null);
      expect(err.details).toBe(null);
    });

    it('should be retryable for timeout errors', () => {
      const err = new WhisperError('timeout', WhisperErrorType.TIMEOUT_ERROR);
      expect(err.isRetryable).toBe(true);
    });

    it('should be retryable for connection errors', () => {
      const err = new WhisperError('conn', WhisperErrorType.CONNECTION_ERROR);
      expect(err.isRetryable).toBe(true);
    });

    it('should be retryable for 5xx status codes', () => {
      const err = new WhisperError('server', WhisperErrorType.SERVER_ERROR, 503);
      expect(err.isRetryable).toBe(true);
    });

    it('should not be retryable for invalid request errors', () => {
      const err = new WhisperError('bad', WhisperErrorType.INVALID_REQUEST_ERROR, 400);
      expect(err.isRetryable).toBe(false);
    });

    it('should not be retryable for unsupported format errors', () => {
      const err = new WhisperError('format', WhisperErrorType.UNSUPPORTED_FORMAT_ERROR, 415);
      expect(err.isRetryable).toBe(false);
    });
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should use default URL when not specified', () => {
      const b = new WhisperBackend();
      expect(b.baseUrl).toBe(DEFAULT_WHISPER_URL);
    });

    it('should use provided URL', () => {
      const b = new WhisperBackend('http://custom:9090');
      expect(b.baseUrl).toBe('http://custom:9090');
    });

    it('should fall back to default URL for falsy value', () => {
      const b = new WhisperBackend('');
      expect(b.baseUrl).toBe(DEFAULT_WHISPER_URL);
    });

    it('should use default timeout', () => {
      const b = new WhisperBackend();
      expect(b._timeout).toBe(DEFAULT_TIMEOUT_MS);
    });

    it('should accept custom timeout', () => {
      const b = new WhisperBackend('http://localhost:8080', { timeout: 1000 });
      expect(b._timeout).toBe(1000);
    });

    it('should accept custom maxRetries', () => {
      const b = new WhisperBackend('http://localhost:8080', { maxRetries: 5 });
      expect(b._maxRetries).toBe(5);
    });

    it('should default maxRetries to 3', () => {
      const b = new WhisperBackend();
      expect(b._maxRetries).toBe(3);
    });

    it('should initialize lastHealthStatus as null', () => {
      const b = new WhisperBackend();
      expect(b.lastHealthStatus).toBe(null);
    });
  });

  // ── baseUrl ────────────────────────────────────────────────────────

  describe('baseUrl', () => {
    it('should return the base URL', () => {
      expect(backend.baseUrl).toBe('http://localhost:8080');
    });
  });

  // ── setBaseUrl ─────────────────────────────────────────────────────

  describe('setBaseUrl', () => {
    it('should update the base URL', () => {
      backend.setBaseUrl('http://newhost:9090');
      expect(backend.baseUrl).toBe('http://newhost:9090');
    });

    it('should reset health status', () => {
      backend._lastHealthStatus = true;
      backend._lastHealthCheck = Date.now();
      backend.setBaseUrl('http://newhost:9090');
      expect(backend.lastHealthStatus).toBe(null);
      expect(backend._lastHealthCheck).toBe(null);
    });

    it('should use default URL for falsy value', () => {
      backend.setBaseUrl('');
      expect(backend.baseUrl).toBe(DEFAULT_WHISPER_URL);
    });
  });

  // ── healthCheck ────────────────────────────────────────────────────

  describe('healthCheck', () => {
    it('should return true for healthy backend', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}, 200));
      const result = await backend.healthCheck({ useCache: false });
      expect(result).toBe(true);
    });

    it('should return true for 404 (server exists)', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}, 404));
      const result = await backend.healthCheck({ useCache: false });
      expect(result).toBe(true);
    });

    it('should return false for 500 error', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}, 500));
      const result = await backend.healthCheck({ useCache: false });
      expect(result).toBe(false);
    });

    it('should return false for network error', async () => {
      // Both /health and / must fail for health check to return false
      fetchSpy
        .mockRejectedValueOnce(new Error('network'))  // /health fails
        .mockRejectedValueOnce(new Error('network'));  // / fallback also fails
      const result = await backend.healthCheck({ useCache: false });
      expect(result).toBe(false);
    });

    it('should return false for abort error', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      fetchSpy.mockRejectedValueOnce(abortError);
      const result = await backend.healthCheck({ useCache: false });
      expect(result).toBe(false);
    });

    it('should cache health check result', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}, 200));
      await backend.healthCheck({ useCache: true });

      // Second call should use cache, not call fetch again
      const result = await backend.healthCheck({ useCache: true, cacheMaxAge: 60000 });
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should not use cache when useCache is false', async () => {
      fetchSpy.mockResolvedValue(mockResponse({}, 200));
      await backend.healthCheck({ useCache: false });
      await backend.healthCheck({ useCache: false });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should update lastHealthStatus', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}, 200));
      await backend.healthCheck({ useCache: false });
      expect(backend.lastHealthStatus).toBe(true);
    });

    it('should try root endpoint as fallback', async () => {
      // First call to /health fails, fallback to / succeeds
      const healthError = new TypeError('fetch failed');
      fetchSpy
        .mockRejectedValueOnce(healthError) // /health fails
        .mockResolvedValueOnce(mockResponse({}, 200)); // / succeeds

      const result = await backend.healthCheck({ useCache: false });
      expect(result).toBe(true);
    });
  });

  // ── transcribe ─────────────────────────────────────────────────────

  describe('transcribe', () => {
    it('should transcribe a valid audio blob', async () => {
      const blob = createAudioBlob();
      const result = await backend.transcribe(blob);
      expect(result).toEqual({ text: 'Hello' });
    });

    it('should throw on null audio blob', async () => {
      await expect(backend.transcribe(null)).rejects.toThrow('Invalid audio input');
    });

    it('should throw on non-Blob input', async () => {
      await expect(backend.transcribe('not a blob')).rejects.toThrow('Invalid audio input');
    });

    it('should pass language option', async () => {
      const blob = createAudioBlob();
      await backend.transcribe(blob, { language: 'en' });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should pass task option', async () => {
      const blob = createAudioBlob();
      await backend.transcribe(blob, { task: 'translate' });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should pass word_timestamps option', async () => {
      const blob = createAudioBlob();
      await backend.transcribe(blob, { word_timestamps: true });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should pass temperature option', async () => {
      const blob = createAudioBlob();
      await backend.transcribe(blob, { temperature: 0.5 });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should pass response_format option', async () => {
      const blob = createAudioBlob();
      await backend.transcribe(blob, { response_format: 'text' });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should handle text/plain response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse('Hello world', 200, 'text/plain')
      );
      const blob = createAudioBlob();
      const result = await backend.transcribe(blob);
      expect(result).toBe('Hello world');
    });

    it('should throw on server error', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ message: 'Internal error' }, 500)
      );
      const blob = createAudioBlob();
      await expect(backend.transcribe(blob)).rejects.toThrow();
    });

    it('should throw on invalid request', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ message: 'Bad request' }, 400)
      );
      const blob = createAudioBlob();
      await expect(backend.transcribe(blob)).rejects.toThrow();
    });
  });

  // ── _requestWithRetry ──────────────────────────────────────────────

  describe('_requestWithRetry', () => {
    it('should make request to correct URL', async () => {
      await backend._requestWithRetry('/test', { method: 'GET' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.any(Object)
      );
    });

    it('should parse JSON response', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({ data: 'test' }));
      const result = await backend._requestWithRetry('/test', { method: 'GET' });
      expect(result).toEqual({ data: 'test' });
    });

    it('should parse text response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse('plain text', 200, 'text/plain')
      );
      const result = await backend._requestWithRetry('/test', { method: 'GET' });
      expect(result).toBe('plain text');
    });

    it('should throw WhisperError on HTTP error', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ message: 'Not found' }, 404)
      );
      await expect(
        backend._requestWithRetry('/test', { method: 'GET' })
      ).rejects.toThrow(WhisperError);
    });

    it('should throw timeout error on AbortError', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      fetchSpy.mockRejectedValueOnce(abortError);
      await expect(
        backend._requestWithRetry('/test', { method: 'GET' })
      ).rejects.toThrow('timeout');
    });

    it('should retry on timeout with maxRetries > 0', async () => {
      const retryBackend = new WhisperBackend('http://localhost:8080', {
        timeout: 100,
        maxRetries: 1
      });
      // Make _delay instant for test speed
      retryBackend._delay = vi.fn().mockResolvedValue(undefined);

      const abortError = new DOMException('Aborted', 'AbortError');
      fetchSpy
        .mockRejectedValueOnce(abortError) // First attempt - timeout
        .mockResolvedValueOnce(mockResponse({ ok: true })); // Retry succeeds

      const result = await retryBackend._requestWithRetry('/test', { method: 'GET' });
      expect(result).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should wrap unknown errors', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('unknown'));
      await expect(
        backend._requestWithRetry('/test', { method: 'GET' })
      ).rejects.toThrow(WhisperError);
    });

    it('should retry on retryable WhisperError', async () => {
      const retryBackend = new WhisperBackend('http://localhost:8080', {
        timeout: 5000,
        maxRetries: 1
      });
      retryBackend._delay = vi.fn().mockResolvedValue(undefined);

      fetchSpy
        .mockResolvedValueOnce(mockResponse({ message: 'Server error' }, 500))
        .mockResolvedValueOnce(mockResponse({ text: 'ok' }));

      const result = await retryBackend._requestWithRetry('/test', { method: 'GET' });
      expect(result).toEqual({ text: 'ok' });
    });
  });

  // ── _parseErrorResponse ────────────────────────────────────────────

  describe('_parseErrorResponse', () => {
    it('should parse JSON error response', async () => {
      const response = mockResponse({ message: 'Bad request' }, 400);
      const parsed = await backend._parseErrorResponse(response);
      expect(parsed.message).toBe('Bad request');
    });

    it('should parse text error response', async () => {
      const response = mockResponse('Error text', 400, 'text/plain');
      const parsed = await backend._parseErrorResponse(response);
      expect(parsed.message).toBe('Error text');
    });

    it('should fall back to statusText on parse failure', async () => {
      const response = {
        headers: new Headers({ 'content-type': 'application/json' }),
        statusText: 'Bad Request',
        json: vi.fn().mockRejectedValue(new Error('parse error'))
      };
      const parsed = await backend._parseErrorResponse(response);
      expect(parsed.message).toBe('Bad Request');
    });
  });

  // ── _getErrorType ──────────────────────────────────────────────────

  describe('_getErrorType', () => {
    it('should return INVALID_REQUEST_ERROR for 4xx', () => {
      expect(backend._getErrorType(400)).toBe(WhisperErrorType.INVALID_REQUEST_ERROR);
    });

    it('should return UNSUPPORTED_FORMAT_ERROR for 415', () => {
      expect(backend._getErrorType(415)).toBe(WhisperErrorType.UNSUPPORTED_FORMAT_ERROR);
    });

    it('should return SERVER_ERROR for 5xx', () => {
      expect(backend._getErrorType(500)).toBe(WhisperErrorType.SERVER_ERROR);
      expect(backend._getErrorType(503)).toBe(WhisperErrorType.SERVER_ERROR);
    });

    it('should return SERVER_ERROR for other codes', () => {
      expect(backend._getErrorType(301)).toBe(WhisperErrorType.SERVER_ERROR);
    });
  });

  // ── getServerInfo ──────────────────────────────────────────────────

  describe('getServerInfo', () => {
    it('should return server info when available', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ model: 'large-v3', capabilities: { diarization: true } })
      );
      const info = await backend.getServerInfo();
      expect(info).toEqual({ model: 'large-v3', capabilities: { diarization: true } });
    });

    it('should return null when info endpoint not available', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({ message: 'Not found' }, 404));
      const info = await backend.getServerInfo();
      // The 404 throws a WhisperError, caught internally => returns null
      expect(info).toBe(null);
    });

    it('should return null on network error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network'));
      const info = await backend.getServerInfo();
      expect(info).toBe(null);
    });
  });

  // ── _delay ─────────────────────────────────────────────────────────

  describe('_delay', () => {
    it('should return a promise', () => {
      const result = backend._delay(0);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
