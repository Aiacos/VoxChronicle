/**
 * WhisperBackend Unit Tests
 *
 * Tests for the WhisperBackend class with API mocking.
 * Covers health checks, transcription, error handling, and retry logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing WhisperBackend
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
vi.mock('../../scripts/utils/RateLimiter.mjs', () => {
  class MockRateLimiter {
    constructor(maxRequestsOrOptions, windowMs, options = {}) {
      // Handle both constructor signatures: new RateLimiter(options) or new RateLimiter(maxRequests, windowMs, options)
      if (typeof maxRequestsOrOptions === 'object' && windowMs === undefined) {
        // Options object signature
        this.options = maxRequestsOrOptions;
        this.requestsPerMinute = maxRequestsOrOptions.requestsPerMinute || 30;
      } else {
        // Positional arguments signature (legacy)
        this.maxRequests = maxRequestsOrOptions;
        this.windowMs = windowMs;
        this.options = options;
      }
      this.throttle = vi.fn(() => Promise.resolve());
      this.reset = vi.fn();
      this.getStats = vi.fn(() => ({
        requestCount: 0,
        windowStart: Date.now()
      }));
    }
  }

  return {
    RateLimiter: MockRateLimiter
  };
});

// Mock SensitiveDataFilter
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    filterUrl: vi.fn((url) => url)
  }
}));

// Import after mocks are set up
import {
  WhisperBackend,
  WhisperError,
  WhisperErrorType,
  DEFAULT_WHISPER_URL,
  DEFAULT_TIMEOUT_MS,
  HEALTH_CHECK_TIMEOUT_MS
} from '../../scripts/ai/WhisperBackend.mjs';

/**
 * Create a mock audio blob for testing
 */
function createMockAudioBlob(size = 1024 * 1024, type = 'audio/webm') {
  const data = new Uint8Array(size).fill(0);
  const blob = new Blob([data], { type });
  blob.name = 'test-audio.webm';
  return blob;
}

/**
 * Create a mock transcription response
 */
function createMockTranscriptionResponse() {
  return {
    text: 'Hello, this is a test transcription from local Whisper.',
    segments: [
      {
        id: 0,
        start: 0.0,
        end: 2.5,
        text: 'Hello, this is a test'
      },
      {
        id: 1,
        start: 2.5,
        end: 5.0,
        text: 'transcription from local Whisper.'
      }
    ],
    language: 'en'
  };
}

describe('WhisperBackend', () => {
  let backend;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock Date.now for cache testing
    vi.spyOn(Date, 'now').mockReturnValue(1000000);

    // Create backend instance
    backend = new WhisperBackend();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default URL', () => {
      expect(backend).toBeInstanceOf(WhisperBackend);
      expect(backend.baseUrl).toBe(DEFAULT_WHISPER_URL);
    });

    it('should create instance with custom URL', () => {
      const customUrl = 'http://192.168.1.100:9000';
      const customBackend = new WhisperBackend(customUrl);
      expect(customBackend.baseUrl).toBe(customUrl);
    });

    it('should accept configuration options', () => {
      const options = {
        timeout: 300000,
        maxRetries: 5
      };
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, options);
      expect(customBackend).toBeInstanceOf(WhisperBackend);
      expect(customBackend._timeout).toBe(300000);
      expect(customBackend._maxRetries).toBe(5);
    });

    it('should use default URL if null is provided', () => {
      const customBackend = new WhisperBackend(null);
      expect(customBackend.baseUrl).toBe(DEFAULT_WHISPER_URL);
    });

    it('should use default URL if empty string is provided', () => {
      const customBackend = new WhisperBackend('');
      expect(customBackend.baseUrl).toBe(DEFAULT_WHISPER_URL);
    });

    it('should initialize rate limiter', () => {
      expect(backend._rateLimiter).toBeDefined();
      expect(backend._rateLimiter.throttle).toBeDefined();
      expect(typeof backend._rateLimiter.throttle).toBe('function');
    });

    it('should accept maxRetries of 0', () => {
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, { maxRetries: 0 });
      expect(customBackend._maxRetries).toBe(0);
    });
  });

  describe('setBaseUrl', () => {
    it('should update the base URL', () => {
      const newUrl = 'http://localhost:9000';
      backend.setBaseUrl(newUrl);
      expect(backend.baseUrl).toBe(newUrl);
    });

    it('should invalidate health cache on URL change', () => {
      backend._lastHealthStatus = true;
      backend._lastHealthCheck = Date.now();

      backend.setBaseUrl('http://localhost:9000');

      expect(backend._lastHealthStatus).toBeNull();
      expect(backend._lastHealthCheck).toBeNull();
    });

    it('should use default URL if null is provided', () => {
      backend.setBaseUrl('http://custom.url');
      backend.setBaseUrl(null);
      expect(backend.baseUrl).toBe(DEFAULT_WHISPER_URL);
    });
  });

  describe('healthCheck', () => {
    it('should return true when server is healthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const result = await backend.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_WHISPER_URL}/health`,
        expect.objectContaining({
          method: 'GET'
        })
      );
      expect(backend.lastHealthStatus).toBe(true);
    });

    it('should return true when server returns 404 (server exists)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await backend.healthCheck();

      expect(result).toBe(true);
      expect(backend.lastHealthStatus).toBe(true);
    });

    it('should return false when server is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await backend.healthCheck();

      expect(result).toBe(false);
      expect(backend.lastHealthStatus).toBe(false);
    });

    it('should return false when health check times out', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate timeout by listening to abort signal
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
          // Never resolve to simulate slow server
        });
      });

      const result = await backend.healthCheck({ timeout: 100 });

      expect(result).toBe(false);
      expect(backend.lastHealthStatus).toBe(false);
    });

    it('should try fallback endpoint if /health fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found')).mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const result = await backend.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use cached result when recent', async () => {
      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });
      await backend.healthCheck();

      // Second call within cache time
      vi.spyOn(Date, 'now').mockReturnValue(1020000); // 20 seconds later
      const result = await backend.healthCheck({ cacheMaxAge: 30000 });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should not use cache when disabled', async () => {
      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });
      await backend.healthCheck();

      // Second call with cache disabled
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });
      const result = await backend.healthCheck({ useCache: false });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Called again
    });

    it('should refresh cache when expired', async () => {
      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });
      await backend.healthCheck();

      // Second call after cache expiry
      vi.spyOn(Date, 'now').mockReturnValue(1040000); // 40 seconds later
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });
      const result = await backend.healthCheck({ cacheMaxAge: 30000 });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Called again
    });

    it('should respect custom timeout', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate timeout by listening to abort signal
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
          // Never resolve to simulate slow server
        });
      });

      const result = await backend.healthCheck({ timeout: 100 });

      expect(result).toBe(false);
    });

    it('should return false on server error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await backend.healthCheck();

      expect(result).toBe(false);
      expect(backend.lastHealthStatus).toBe(false);
    });
  });

  describe('transcribe', () => {
    it('should transcribe audio successfully', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse)
      });

      const result = await backend.transcribe(audioBlob);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_WHISPER_URL}/inference`,
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      );
      expect(backend._rateLimiter.throttle).toHaveBeenCalled();
    });

    it('should throw error for invalid audio input', async () => {
      await expect(backend.transcribe(null)).rejects.toThrow(WhisperError);
      await expect(backend.transcribe('not a blob')).rejects.toThrow(WhisperError);
    });

    it('should include language option in request', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      let capturedFormData;
      mockFetch.mockImplementationOnce((url, options) => {
        capturedFormData = options.body;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve(mockResponse)
        });
      });

      await backend.transcribe(audioBlob, { language: 'it' });

      expect(capturedFormData.get('language')).toBe('it');
    });

    it('should include task option in request', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      let capturedFormData;
      mockFetch.mockImplementationOnce((url, options) => {
        capturedFormData = options.body;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve(mockResponse)
        });
      });

      await backend.transcribe(audioBlob, { task: 'translate' });

      expect(capturedFormData.get('task')).toBe('translate');
    });

    it('should include word_timestamps option in request', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      let capturedFormData;
      mockFetch.mockImplementationOnce((url, options) => {
        capturedFormData = options.body;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve(mockResponse)
        });
      });

      await backend.transcribe(audioBlob, { word_timestamps: true });

      expect(capturedFormData.get('word_timestamps')).toBe('true');
    });

    it('should include temperature option in request', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      let capturedFormData;
      mockFetch.mockImplementationOnce((url, options) => {
        capturedFormData = options.body;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve(mockResponse)
        });
      });

      await backend.transcribe(audioBlob, { temperature: 0.5 });

      expect(capturedFormData.get('temperature')).toBe('0.5');
    });

    it('should include response_format option in request', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      let capturedFormData;
      mockFetch.mockImplementationOnce((url, options) => {
        capturedFormData = options.body;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve(mockResponse)
        });
      });

      await backend.transcribe(audioBlob, { response_format: 'srt' });

      expect(capturedFormData.get('response_format')).toBe('srt');
    });

    it('should handle text response format', async () => {
      const audioBlob = createMockAudioBlob();
      const mockTextResponse = 'This is plain text transcription';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: () => Promise.resolve(mockTextResponse)
      });

      const result = await backend.transcribe(audioBlob);

      expect(result).toBe(mockTextResponse);
    });

    it('should include all options in request', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      let capturedFormData;
      mockFetch.mockImplementationOnce((url, options) => {
        capturedFormData = options.body;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve(mockResponse)
        });
      });

      await backend.transcribe(audioBlob, {
        language: 'en',
        task: 'transcribe',
        word_timestamps: true,
        temperature: 0.2,
        response_format: 'json'
      });

      expect(capturedFormData.get('language')).toBe('en');
      expect(capturedFormData.get('task')).toBe('transcribe');
      expect(capturedFormData.get('word_timestamps')).toBe('true');
      expect(capturedFormData.get('temperature')).toBe('0.2');
      expect(capturedFormData.get('response_format')).toBe('json');
    });
  });

  describe('error handling', () => {
    it('should throw WhisperError on HTTP 400 error', async () => {
      const audioBlob = createMockAudioBlob();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ error: 'Invalid request' })
      });

      await expect(backend.transcribe(audioBlob)).rejects.toThrow(WhisperError);
    });

    it('should throw WhisperError on HTTP 415 unsupported format error', async () => {
      const audioBlob = createMockAudioBlob();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 415,
        statusText: 'Unsupported Media Type',
        headers: new Map([['content-type', 'text/plain']]),
        text: () => Promise.resolve('Unsupported audio format')
      });

      try {
        await backend.transcribe(audioBlob);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(WhisperError);
        expect(error.type).toBe(WhisperErrorType.UNSUPPORTED_FORMAT_ERROR);
        expect(error.status).toBe(415);
      }
    });

    it('should throw WhisperError on HTTP 500 server error', async () => {
      const audioBlob = createMockAudioBlob();
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, { maxRetries: 0 });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ error: 'Server error' })
      });

      try {
        await customBackend.transcribe(audioBlob);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(WhisperError);
        expect(error.type).toBe(WhisperErrorType.SERVER_ERROR);
        expect(error.status).toBe(500);
        expect(error.isRetryable).toBe(true);
      }
    });

    it('should throw timeout error and retry', async () => {
      const audioBlob = createMockAudioBlob();
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, {
        timeout: 100,
        maxRetries: 1
      });

      mockFetch.mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate timeout by listening to abort signal
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
          // Never resolve to simulate slow server
        });
      });

      try {
        await customBackend.transcribe(audioBlob);
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error).toBeInstanceOf(WhisperError);
        expect(error.type).toBe(WhisperErrorType.TIMEOUT_ERROR);
        expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
      }
    });

    it('should throw connection error and retry', async () => {
      const audioBlob = createMockAudioBlob();
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, { maxRetries: 1 });

      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await customBackend.transcribe(audioBlob);
        expect.fail('Should have thrown connection error');
      } catch (error) {
        expect(error).toBeInstanceOf(WhisperError);
        expect(error.type).toBe(WhisperErrorType.CONNECTION_ERROR);
        expect(error.details.originalError).toContain('fetch');
        expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
      }
    });

    it('should not retry on non-retryable errors', async () => {
      const audioBlob = createMockAudioBlob();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'text/plain']]),
        text: () => Promise.resolve('Invalid audio')
      });

      try {
        await backend.transcribe(audioBlob);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(WhisperError);
        expect(error.type).toBe(WhisperErrorType.INVALID_REQUEST_ERROR);
        expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
      }
    });

    it('should handle error response without content-type', async () => {
      const audioBlob = createMockAudioBlob();
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, { maxRetries: 0 });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
        text: () => Promise.resolve('')
      });

      try {
        await customBackend.transcribe(audioBlob);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(WhisperError);
        expect(error.type).toBe(WhisperErrorType.SERVER_ERROR);
        expect(error.status).toBe(500);
      }
    });

    it('should wrap unknown errors', async () => {
      const audioBlob = createMockAudioBlob();

      mockFetch.mockRejectedValueOnce(new Error('Unknown error'));

      try {
        await backend.transcribe(audioBlob);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(WhisperError);
        expect(error.type).toBe(WhisperErrorType.SERVER_ERROR);
      }
    });

    it('should retry on server error (5xx)', async () => {
      const audioBlob = createMockAudioBlob();
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, { maxRetries: 1 });
      const mockResponse = createMockTranscriptionResponse();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve('Service temporarily unavailable')
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve(mockResponse)
        });

      const result = await customBackend.transcribe(audioBlob);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('getServerInfo', () => {
    it('should return server info when available', async () => {
      const mockInfo = {
        version: '1.0.0',
        model: 'whisper-large-v3',
        capabilities: ['transcribe', 'translate']
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockInfo)
      });

      const result = await backend.getServerInfo();

      expect(result).toEqual(mockInfo);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DEFAULT_WHISPER_URL}/info`,
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should return null when info endpoint is not supported', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'text/plain']]),
        text: () => Promise.resolve('Not found')
      });

      const result = await backend.getServerInfo();

      expect(result).toBeNull();
    });

    it('should return null on server error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await backend.getServerInfo();

      expect(result).toBeNull();
    });
  });

  describe('WhisperError', () => {
    it('should create error with all properties', () => {
      const error = new WhisperError('Test error', WhisperErrorType.SERVER_ERROR, 500, {
        detail: 'error details'
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('WhisperError');
      expect(error.message).toBe('Test error');
      expect(error.type).toBe(WhisperErrorType.SERVER_ERROR);
      expect(error.status).toBe(500);
      expect(error.details).toEqual({ detail: 'error details' });
    });

    it('should identify retryable errors', () => {
      const timeoutError = new WhisperError('Timeout', WhisperErrorType.TIMEOUT_ERROR);
      expect(timeoutError.isRetryable).toBe(true);

      const connectionError = new WhisperError('Connection', WhisperErrorType.CONNECTION_ERROR);
      expect(connectionError.isRetryable).toBe(true);

      const serverError = new WhisperError('Server', WhisperErrorType.SERVER_ERROR, 500);
      expect(serverError.isRetryable).toBe(true);

      const serverError503 = new WhisperError('Server', WhisperErrorType.SERVER_ERROR, 503);
      expect(serverError503.isRetryable).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const clientError = new WhisperError('Client', WhisperErrorType.INVALID_REQUEST_ERROR, 400);
      expect(clientError.isRetryable).toBe(false);

      const unsupportedError = new WhisperError(
        'Unsupported',
        WhisperErrorType.UNSUPPORTED_FORMAT_ERROR,
        415
      );
      expect(unsupportedError.isRetryable).toBe(false);
    });
  });

  describe('constants', () => {
    it('should export correct default values', () => {
      expect(DEFAULT_WHISPER_URL).toBe('http://localhost:8080');
      expect(DEFAULT_TIMEOUT_MS).toBe(600000);
      expect(HEALTH_CHECK_TIMEOUT_MS).toBe(5000);
    });

    it('should export error types', () => {
      expect(WhisperErrorType.CONNECTION_ERROR).toBe('connection_error');
      expect(WhisperErrorType.SERVER_ERROR).toBe('server_error');
      expect(WhisperErrorType.INVALID_REQUEST_ERROR).toBe('invalid_request_error');
      expect(WhisperErrorType.TIMEOUT_ERROR).toBe('timeout_error');
      expect(WhisperErrorType.UNSUPPORTED_FORMAT_ERROR).toBe('unsupported_format_error');
    });
  });

  describe('retry logic', () => {
    it('should respect maxRetries setting', async () => {
      const audioBlob = createMockAudioBlob();
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, { maxRetries: 2 });

      // Mock _delay to avoid actual delays
      vi.spyOn(customBackend, '_delay').mockResolvedValue();

      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(customBackend.transcribe(audioBlob)).rejects.toBeInstanceOf(WhisperError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry when maxRetries is 0', async () => {
      const audioBlob = createMockAudioBlob();
      const customBackend = new WhisperBackend(DEFAULT_WHISPER_URL, { maxRetries: 0 });

      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      try {
        await customBackend.transcribe(audioBlob);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(WhisperError);
        expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
      }
    });

    it('should succeed after retry', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      // Mock setTimeout to avoid actual delays
      vi.useFakeTimers();

      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse)
      });

      const transcribePromise = backend.transcribe(audioBlob);

      // Fast-forward through retry delay
      await vi.runAllTimersAsync();

      const result = await transcribePromise;

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('edge cases', () => {
    it('should handle blob without name property', async () => {
      const data = new Uint8Array(1024).fill(0);
      const audioBlob = new Blob([data], { type: 'audio/webm' });
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse)
      });

      const result = await backend.transcribe(audioBlob);

      expect(result).toEqual(mockResponse);
    });

    it('should handle large audio files', async () => {
      const largeBlob = createMockAudioBlob(50 * 1024 * 1024); // 50MB
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse)
      });

      const result = await backend.transcribe(largeBlob);

      expect(result).toEqual(mockResponse);
    });

    it('should handle undefined options', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse)
      });

      const result = await backend.transcribe(audioBlob, undefined);

      expect(result).toEqual(mockResponse);
    });

    it('should handle empty options object', async () => {
      const audioBlob = createMockAudioBlob();
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse)
      });

      const result = await backend.transcribe(audioBlob, {});

      expect(result).toEqual(mockResponse);
    });
  });
});
