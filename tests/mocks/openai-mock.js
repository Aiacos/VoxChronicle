/**
 * OpenAI API Mock Utilities
 *
 * Provides mock responses, handlers, and utilities for testing OpenAI API
 * interactions including transcription, image generation, and error scenarios.
 */

import { vi } from 'vitest';

/**
 * Default API endpoints
 */
export const OPENAI_ENDPOINTS = {
  TRANSCRIPTIONS: '/audio/transcriptions',
  IMAGES_GENERATIONS: '/images/generations',
  MODELS: '/models'
};

/**
 * Create a mock audio blob for testing
 *
 * @param {number} size - Blob size in bytes
 * @param {string} type - MIME type
 * @returns {Blob} Mock audio blob
 */
export function createMockAudioBlob(size = 1024, type = 'audio/webm') {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type });
}

/**
 * Create a mock transcription response
 *
 * @param {Object} options - Response options
 * @param {string} [options.text] - Full transcription text
 * @param {Array} [options.segments] - Transcription segments with speaker diarization
 * @param {string} [options.language] - Detected language
 * @param {number} [options.duration] - Audio duration in seconds
 * @returns {Object} Mock transcription response
 */
export function createMockTranscriptionResponse(options = {}) {
  const defaultSegments = [
    {
      speaker: 'SPEAKER_00',
      text: 'Hello, this is',
      start: 0,
      end: 2.5
    },
    {
      speaker: 'SPEAKER_01',
      text: 'a test transcription.',
      start: 2.5,
      end: 5.0
    }
  ];

  const segments = options.segments || defaultSegments;
  const text = options.text || segments.map(s => s.text).join(' ');

  return {
    text,
    segments,
    language: options.language || 'en',
    duration: options.duration || segments[segments.length - 1]?.end || 5.0
  };
}

/**
 * Create a mock image generation response
 *
 * @param {Object} options - Response options
 * @param {string} [options.url] - Generated image URL
 * @param {string} [options.revisedPrompt] - DALL-E revised prompt
 * @returns {Object} Mock image generation response
 */
export function createMockImageGenerationResponse(options = {}) {
  return {
    created: Math.floor(Date.now() / 1000),
    data: [
      {
        url: options.url || 'https://oaidalleapiprodscus.blob.core.windows.net/private/test-image.png',
        revised_prompt: options.revisedPrompt || 'A detailed fantasy RPG character portrait'
      }
    ]
  };
}

/**
 * Create a mock OpenAI error response
 *
 * @param {Object} options - Error options
 * @param {number} [options.status] - HTTP status code
 * @param {string} [options.type] - Error type
 * @param {string} [options.message] - Error message
 * @param {string} [options.code] - Error code
 * @returns {Object} Mock error response
 */
export function createMockErrorResponse(options = {}) {
  const status = options.status || 400;
  const type = options.type || 'invalid_request_error';
  const message = options.message || 'Invalid request';
  const code = options.code || null;

  return {
    error: {
      message,
      type,
      ...(code && { code })
    }
  };
}

/**
 * Create a mock authentication error (401)
 *
 * @returns {Object} Mock authentication error response
 */
export function createMockAuthError() {
  return createMockErrorResponse({
    status: 401,
    type: 'authentication_error',
    message: 'Invalid API key. Please check your OpenAI API key in settings.',
    code: 'invalid_api_key'
  });
}

/**
 * Create a mock rate limit error (429)
 *
 * @param {number} [retryAfter] - Seconds to wait before retry
 * @returns {Object} Mock rate limit error response
 */
export function createMockRateLimitError(retryAfter = 60) {
  return {
    response: createMockErrorResponse({
      status: 429,
      type: 'rate_limit_error',
      message: 'Rate limit exceeded. Please try again later.'
    }),
    headers: {
      'retry-after': String(retryAfter)
    }
  };
}

/**
 * Create a mock server error (500)
 *
 * @returns {Object} Mock server error response
 */
export function createMockServerError() {
  return createMockErrorResponse({
    status: 500,
    type: 'api_error',
    message: 'OpenAI service temporarily unavailable. Please try again later.'
  });
}

/**
 * Create a mock models list response
 *
 * @returns {Object} Mock models response
 */
export function createMockModelsResponse() {
  return {
    data: [
      {
        id: 'gpt-4o-transcribe-diarize',
        object: 'model',
        created: 1677610602,
        owned_by: 'openai'
      },
      {
        id: 'dall-e-3',
        object: 'model',
        created: 1698785189,
        owned_by: 'openai'
      },
      {
        id: 'whisper-1',
        object: 'model',
        created: 1677532384,
        owned_by: 'openai'
      }
    ],
    object: 'list'
  };
}

/**
 * Create a mock fetch response
 *
 * @param {Object} data - Response data
 * @param {Object} options - Response options
 * @param {boolean} [options.ok=true] - Response ok status
 * @param {number} [options.status=200] - HTTP status code
 * @param {Object} [options.headers] - Response headers
 * @returns {Object} Mock fetch response
 */
export function createMockFetchResponse(data, options = {}) {
  const ok = options.ok !== undefined ? options.ok : true;
  const status = options.status || (ok ? 200 : 400);
  const headers = options.headers || {};

  // Create headers object with has() and get() methods
  const headersObj = {
    has: (key) => headers.hasOwnProperty(key.toLowerCase()),
    get: (key) => headers[key.toLowerCase()] || null,
    ...headers
  };

  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    headers: headersObj,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    blob: () => Promise.resolve(new Blob([JSON.stringify(data)]))
  };
}

/**
 * Create a mock fetch handler for successful transcription
 *
 * @param {Object} [responseOptions] - Options for the transcription response
 * @returns {Function} Mock fetch function
 */
export function mockTranscriptionSuccess(responseOptions = {}) {
  const response = createMockTranscriptionResponse(responseOptions);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response));
}

/**
 * Create a mock fetch handler for successful image generation
 *
 * @param {Object} [responseOptions] - Options for the image response
 * @returns {Function} Mock fetch function
 */
export function mockImageGenerationSuccess(responseOptions = {}) {
  const response = createMockImageGenerationResponse(responseOptions);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response));
}

/**
 * Create a mock fetch handler for authentication error
 *
 * @returns {Function} Mock fetch function
 */
export function mockAuthenticationError() {
  const errorResponse = createMockAuthError();
  return vi.fn().mockResolvedValue(
    createMockFetchResponse(errorResponse, { ok: false, status: 401 })
  );
}

/**
 * Create a mock fetch handler for rate limit error
 *
 * @param {number} [retryAfter=60] - Seconds to wait before retry
 * @returns {Function} Mock fetch function
 */
export function mockRateLimitError(retryAfter = 60) {
  const { response, headers } = createMockRateLimitError(retryAfter);
  return vi.fn().mockResolvedValue(
    createMockFetchResponse(response, {
      ok: false,
      status: 429,
      headers
    })
  );
}

/**
 * Create a mock fetch handler for server error
 *
 * @returns {Function} Mock fetch function
 */
export function mockServerError() {
  const errorResponse = createMockServerError();
  return vi.fn().mockResolvedValue(
    createMockFetchResponse(errorResponse, { ok: false, status: 500 })
  );
}

/**
 * Create a mock fetch handler for network error
 *
 * @returns {Function} Mock fetch function
 */
export function mockNetworkError() {
  return vi.fn().mockRejectedValue(
    new TypeError('Failed to fetch')
  );
}

/**
 * Create a mock fetch handler for timeout error
 *
 * @returns {Function} Mock fetch function
 */
export function mockTimeoutError() {
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';
  return vi.fn().mockRejectedValue(abortError);
}

/**
 * Create a mock fetch handler that succeeds after N retries
 *
 * @param {number} failCount - Number of times to fail before succeeding
 * @param {Object} [successResponse] - Response to return on success
 * @returns {Function} Mock fetch function
 */
export function mockSuccessAfterRetries(failCount, successResponse = {}) {
  let attemptCount = 0;
  const errorResponse = createMockServerError();
  const response = successResponse.transcription
    ? createMockTranscriptionResponse(successResponse)
    : createMockImageGenerationResponse(successResponse);

  return vi.fn().mockImplementation(() => {
    attemptCount++;
    if (attemptCount <= failCount) {
      return Promise.resolve(
        createMockFetchResponse(errorResponse, { ok: false, status: 500 })
      );
    }
    return Promise.resolve(createMockFetchResponse(response));
  });
}

/**
 * Create a mock fetch handler that routes to different responses based on endpoint
 *
 * @param {Object} routes - Map of endpoint patterns to mock responses
 * @returns {Function} Mock fetch function
 */
export function mockFetchRouter(routes) {
  return vi.fn().mockImplementation((url) => {
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        if (typeof handler === 'function') {
          return handler();
        }
        return Promise.resolve(createMockFetchResponse(handler));
      }
    }
    // Default: 404
    return Promise.resolve(
      createMockFetchResponse(
        { error: { message: 'Not found', type: 'not_found' } },
        { ok: false, status: 404 }
      )
    );
  });
}

/**
 * Verify that a FormData contains expected fields
 *
 * @param {FormData} formData - FormData to verify
 * @param {Object} expectedFields - Map of field names to expected values/validators
 * @returns {boolean} True if all fields match
 */
export function verifyFormData(formData, expectedFields) {
  for (const [key, expected] of Object.entries(expectedFields)) {
    const actual = formData.get(key);

    if (typeof expected === 'function') {
      if (!expected(actual)) {
        return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * Extract FormData from a fetch call
 *
 * @param {Array} fetchCallArgs - Arguments from fetch mock call (url, options)
 * @returns {FormData|null} FormData if present, null otherwise
 */
export function extractFormDataFromCall(fetchCallArgs) {
  const [, options] = fetchCallArgs;
  if (options && options.body instanceof FormData) {
    return options.body;
  }
  return null;
}

/**
 * Extract JSON body from a fetch call
 *
 * @param {Array} fetchCallArgs - Arguments from fetch mock call (url, options)
 * @returns {Object|null} Parsed JSON if present, null otherwise
 */
export function extractJsonFromCall(fetchCallArgs) {
  const [, options] = fetchCallArgs;
  if (options && typeof options.body === 'string') {
    try {
      return JSON.parse(options.body);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Create mock speaker segments for multi-speaker transcription
 *
 * @param {Array<Object>} speakers - Array of speaker configurations
 * @param {string} speakers[].id - Speaker ID (e.g., 'SPEAKER_00')
 * @param {string} speakers[].text - Text spoken by this speaker
 * @param {number} [speakers[].start] - Start time (auto-calculated if not provided)
 * @param {number} [speakers[].end] - End time (auto-calculated if not provided)
 * @returns {Array<Object>} Array of speaker segments
 */
export function createMockSpeakerSegments(speakers) {
  let currentTime = 0;
  const avgWordsPerSecond = 2.5;

  return speakers.map((speaker) => {
    const wordCount = speaker.text.split(' ').length;
    const duration = wordCount / avgWordsPerSecond;

    const segment = {
      speaker: speaker.id,
      text: speaker.text,
      start: speaker.start !== undefined ? speaker.start : currentTime,
      end: speaker.end !== undefined ? speaker.end : currentTime + duration
    };

    currentTime = segment.end;
    return segment;
  });
}

/**
 * Create a complete mock transcription with multiple speakers and turns
 *
 * @param {number} speakerCount - Number of different speakers
 * @param {number} turnCount - Number of speaking turns
 * @returns {Object} Mock transcription response with realistic segments
 */
export function createMockMultiSpeakerTranscription(speakerCount = 2, turnCount = 4) {
  const segments = [];
  let currentTime = 0;

  const sampleTexts = [
    'Welcome everyone to today\'s session.',
    'I roll for initiative.',
    'The dragon emerges from the cave.',
    'Can I cast a spell?',
    'Roll for perception.',
    'I got a natural twenty!',
    'The spell hits the target.',
    'What do we see in the room?'
  ];

  for (let i = 0; i < turnCount; i++) {
    const speakerId = `SPEAKER_0${i % speakerCount}`;
    const text = sampleTexts[i % sampleTexts.length];
    const wordCount = text.split(' ').length;
    const duration = wordCount / 2.5;

    segments.push({
      speaker: speakerId,
      text,
      start: currentTime,
      end: currentTime + duration
    });

    currentTime += duration + 0.5; // Add pause between turns
  }

  const fullText = segments.map(s => s.text).join(' ');

  return {
    text: fullText,
    segments,
    language: 'en',
    duration: currentTime
  };
}

/**
 * Mock implementation of OpenAI client for testing
 * Provides a complete mock that can be used in place of the real client
 */
export class MockOpenAIClient {
  constructor(apiKey = 'test-key-12345') {
    this._apiKey = apiKey;
    this.transcriptionResponse = null;
    this.imageGenerationResponse = null;
    this.shouldFail = false;
    this.errorToThrow = null;
    this.callLog = [];
  }

  get isConfigured() {
    return Boolean(this._apiKey);
  }

  /**
   * Configure the mock to return a specific transcription response
   */
  setTranscriptionResponse(response) {
    this.transcriptionResponse = response;
  }

  /**
   * Configure the mock to return a specific image generation response
   */
  setImageGenerationResponse(response) {
    this.imageGenerationResponse = response;
  }

  /**
   * Configure the mock to fail with a specific error
   */
  setError(error) {
    this.shouldFail = true;
    this.errorToThrow = error;
  }

  /**
   * Mock request method
   */
  async request(endpoint, options = {}) {
    this.callLog.push({ endpoint, options });

    if (this.shouldFail) {
      throw this.errorToThrow;
    }

    if (endpoint.includes('/audio/transcriptions')) {
      return this.transcriptionResponse || createMockTranscriptionResponse();
    }

    if (endpoint.includes('/images/generations')) {
      return this.imageGenerationResponse || createMockImageGenerationResponse();
    }

    if (endpoint.includes('/models')) {
      return createMockModelsResponse();
    }

    throw new Error(`Unmocked endpoint: ${endpoint}`);
  }

  /**
   * Mock post method
   */
  async post(endpoint, data, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(data) });
  }

  /**
   * Mock postFormData method
   */
  async postFormData(endpoint, formData, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body: formData });
  }

  /**
   * Reset the mock state
   */
  reset() {
    this.transcriptionResponse = null;
    this.imageGenerationResponse = null;
    this.shouldFail = false;
    this.errorToThrow = null;
    this.callLog = [];
  }

  /**
   * Get call history
   */
  getCallLog() {
    return this.callLog;
  }
}
