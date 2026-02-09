/**
 * LocalWhisperService Unit Tests
 *
 * Tests for the LocalWhisperService class with backend mocking.
 * Covers transcription, speaker mapping, chunking, health checks, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing LocalWhisperService
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
  RateLimiter: vi.fn().mockImplementation(() => ({
    executeWithRetry: vi.fn((fn) => fn()),
    pause: vi.fn(),
    reset: vi.fn(),
    getStats: vi.fn(() => ({ requestsMade: 5, requestsFailed: 0 }))
  }))
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

// Mock AudioUtils
vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: {
    isValidAudioBlob: vi.fn(() => true),
    getBlobSizeMB: vi.fn((blob) => blob.size / (1024 * 1024)),
    blobToFile: vi.fn((blob, name) => new File([blob], `${name}.webm`, { type: blob.type })),
    estimateDuration: vi.fn((blob) => Math.round(blob.size / 16000))
  },
  MAX_TRANSCRIPTION_SIZE: 25 * 1024 * 1024
}));

// Mock AudioChunker
vi.mock('../../scripts/audio/AudioChunker.mjs', () => {
  return {
    AudioChunker: vi.fn(function () {
      // Create new mock functions for each instance
      this.needsChunking = vi.fn(() => false);
      this.splitIfNeeded = vi.fn((blob) => Promise.resolve([blob]));
      this.getChunkingInfo = vi.fn((blob) => ({
        totalSize: blob.size,
        totalSizeMB: blob.size / (1024 * 1024),
        needsChunking: false,
        estimatedChunkCount: 1
      }));
    })
  };
});

// Mock WhisperBackend
vi.mock('../../scripts/ai/WhisperBackend.mjs', () => {
  const mockWhisperBackend = vi.fn(function (baseUrl, options) {
    this.baseUrl = baseUrl || 'http://localhost:8080';
    this._timeout = options?.timeout || 600000;
    this._maxRetries = options?.maxRetries ?? 3;
    this.lastHealthStatus = null;

    this.setBaseUrl = vi.fn((url) => {
      this.baseUrl = url;
      this.lastHealthStatus = null;
    });

    this.healthCheck = vi.fn(() => Promise.resolve(true));
    this.transcribe = vi.fn(() =>
      Promise.resolve({
        text: 'Hello, this is a test transcription.',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Hello, this is', start: 0, end: 2.5 },
          { speaker: 'SPEAKER_01', text: 'a test transcription.', start: 2.5, end: 5.0 }
        ],
        language: 'en',
        duration: 5.0
      })
    );

    this.getServerInfo = vi.fn(() =>
      Promise.resolve({
        capabilities: {
          diarization: true
        }
      })
    );
  });

  return {
    WhisperBackend: mockWhisperBackend,
    WhisperError: class WhisperError extends Error {
      constructor(message, type, status = null, details = null) {
        super(message);
        this.name = 'WhisperError';
        this.type = type;
        this.status = status;
        this.details = details;
      }

      get isRetryable() {
        return (
          this.type === 'timeout_error' ||
          this.type === 'connection_error' ||
          (this.status >= 500 && this.status < 600)
        );
      }
    },
    WhisperErrorType: {
      CONNECTION_ERROR: 'connection_error',
      SERVER_ERROR: 'server_error',
      INVALID_REQUEST_ERROR: 'invalid_request_error',
      TIMEOUT_ERROR: 'timeout_error',
      UNSUPPORTED_FORMAT_ERROR: 'unsupported_format_error'
    },
    DEFAULT_WHISPER_URL: 'http://localhost:8080'
  };
});

// Import after mocks are set up
import {
  LocalWhisperService,
  LocalWhisperResponseFormat,
  LOCAL_TRANSCRIPTION_TIMEOUT_MS
} from '../../scripts/ai/LocalWhisperService.mjs';
import {
  WhisperBackend,
  WhisperError,
  WhisperErrorType
} from '../../scripts/ai/WhisperBackend.mjs';
import { AudioChunker } from '../../scripts/audio/AudioChunker.mjs';
import { AudioUtils } from '../../scripts/utils/AudioUtils.mjs';

/**
 * Create a mock audio blob for testing
 */
function createMockAudioBlob(size = 1024, type = 'audio/webm') {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type });
}

/**
 * Create a mock transcription response from Whisper backend
 */
function createMockTranscriptionResponse(options = {}) {
  return {
    text: options.text || 'Hello, this is a test transcription.',
    segments: options.segments || [
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
    ],
    language: options.language || 'en',
    duration: options.duration || 5.0
  };
}

/**
 * Create a mock transcription response without diarization
 */
function createMockBasicResponse(text = 'Basic transcription text') {
  return {
    text: text,
    language: 'en',
    duration: 3.0
  };
}

describe('LocalWhisperService', () => {
  let service;
  let mockBackend;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create service instance
    service = new LocalWhisperService('http://localhost:8080');

    // Get mock backend instance
    mockBackend = service._backend;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with backend URL', () => {
      expect(service).toBeInstanceOf(LocalWhisperService);
      expect(service.backendUrl).toBe('http://localhost:8080');
    });

    it('should use default URL when not provided', () => {
      const defaultService = new LocalWhisperService();
      expect(defaultService.backendUrl).toBe('http://localhost:8080');
    });

    it('should accept configuration options', () => {
      const options = {
        defaultLanguage: 'it',
        defaultSpeakerMap: { SPEAKER_00: 'GM' },
        timeout: 300000,
        maxRetries: 5
      };

      const customService = new LocalWhisperService('http://custom:9000', options);

      expect(customService.backendUrl).toBe('http://custom:9000');
      expect(customService._defaultLanguage).toBe('it');
      expect(customService._defaultSpeakerMap).toEqual({ SPEAKER_00: 'GM' });
    });

    it('should initialize AudioChunker', () => {
      expect(service._chunker).toBeDefined();
      expect(AudioChunker).toHaveBeenCalled();
    });

    it('should initialize WhisperBackend with options', () => {
      const customService = new LocalWhisperService('http://localhost:8080', {
        timeout: 300000,
        maxRetries: 5
      });

      expect(WhisperBackend).toHaveBeenCalledWith('http://localhost:8080', {
        timeout: 300000,
        maxRetries: 5
      });
    });
  });

  describe('backendUrl property', () => {
    it('should return backend URL', () => {
      expect(service.backendUrl).toBe('http://localhost:8080');
    });

    it('should return custom URL when set', () => {
      const customService = new LocalWhisperService('http://custom:9000');
      expect(customService.backendUrl).toBe('http://custom:9000');
    });
  });

  describe('setBackendUrl', () => {
    it('should update backend URL', () => {
      service.setBackendUrl('http://new-backend:8080');

      expect(mockBackend.setBaseUrl).toHaveBeenCalledWith('http://new-backend:8080');
    });

    it('should reset diarization support cache', () => {
      service._supportsDiarization = true;
      service.setBackendUrl('http://new-backend:8080');

      expect(service._supportsDiarization).toBeNull();
    });
  });

  describe('healthCheck', () => {
    it('should perform health check on backend', async () => {
      mockBackend.healthCheck.mockResolvedValue(true);

      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockBackend.healthCheck).toHaveBeenCalledWith({});
    });

    it('should pass options to backend health check', async () => {
      const options = { timeout: 10000 };
      await service.healthCheck(options);

      expect(mockBackend.healthCheck).toHaveBeenCalledWith(options);
    });

    it('should return false on health check failure', async () => {
      mockBackend.healthCheck.mockResolvedValue(false);

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('lastHealthStatus', () => {
    it('should return last health status from backend', () => {
      mockBackend.lastHealthStatus = true;
      expect(service.lastHealthStatus).toBe(true);
    });

    it('should return null if never checked', () => {
      mockBackend.lastHealthStatus = null;
      expect(service.lastHealthStatus).toBeNull();
    });
  });

  describe('transcribe', () => {
    it('should transcribe audio blob successfully', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockBackend.transcribe.mockResolvedValue(mockResponse);

      const result = await service.transcribe(audioBlob);

      expect(result).toBeDefined();
      expect(result.text).toBe('Hello, this is a test transcription.');
      expect(result.segments).toHaveLength(2);
      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          language: null,
          response_format: 'json',
          task: 'transcribe'
        })
      );
    });

    it('should throw error for invalid audio input', async () => {
      await expect(service.transcribe(null)).rejects.toThrow(
        'Invalid audio input: expected Blob or File'
      );
    });

    it('should throw error for non-Blob input', async () => {
      await expect(service.transcribe('not a blob')).rejects.toThrow(
        'Invalid audio input: expected Blob or File'
      );
    });

    it('should use default language when set', async () => {
      service.setLanguage('it');
      const audioBlob = createMockAudioBlob(1024);

      mockBackend.transcribe.mockResolvedValue(createMockTranscriptionResponse());

      await service.transcribe(audioBlob);

      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          language: 'it'
        })
      );
    });

    it('should override default language with options', async () => {
      service.setLanguage('it');
      const audioBlob = createMockAudioBlob(1024);

      mockBackend.transcribe.mockResolvedValue(createMockTranscriptionResponse());

      await service.transcribe(audioBlob, { language: 'en' });

      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          language: 'en'
        })
      );
    });

    it('should apply speaker mapping', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockBackend.transcribe.mockResolvedValue(mockResponse);

      const speakerMap = {
        SPEAKER_00: 'Game Master',
        SPEAKER_01: 'Player 1'
      };

      const result = await service.transcribe(audioBlob, { speakerMap });

      expect(result.segments[0].speaker).toBe('Game Master');
      expect(result.segments[1].speaker).toBe('Player 1');
      expect(result.segments[0].originalSpeaker).toBe('SPEAKER_00');
      expect(result.segments[1].originalSpeaker).toBe('SPEAKER_01');
    });

    it('should use default speaker map when set', async () => {
      service.setSpeakerMap({
        SPEAKER_00: 'GM',
        SPEAKER_01: 'Player'
      });

      const audioBlob = createMockAudioBlob(1024);
      mockBackend.transcribe.mockResolvedValue(createMockTranscriptionResponse());

      const result = await service.transcribe(audioBlob);

      expect(result.segments[0].speaker).toBe('GM');
      expect(result.segments[1].speaker).toBe('Player');
    });

    it('should support word_timestamps option', async () => {
      const audioBlob = createMockAudioBlob(1024);
      mockBackend.transcribe.mockResolvedValue(createMockTranscriptionResponse());

      await service.transcribe(audioBlob, { word_timestamps: true });

      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          word_timestamps: true
        })
      );
    });

    it('should support temperature option', async () => {
      const audioBlob = createMockAudioBlob(1024);
      mockBackend.transcribe.mockResolvedValue(createMockTranscriptionResponse());

      await service.transcribe(audioBlob, { temperature: 0.5 });

      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          temperature: 0.5
        })
      );
    });

    it('should support responseFormat option', async () => {
      const audioBlob = createMockAudioBlob(1024);
      mockBackend.transcribe.mockResolvedValue(createMockTranscriptionResponse());

      await service.transcribe(audioBlob, {
        responseFormat: LocalWhisperResponseFormat.VERBOSE_JSON
      });

      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          response_format: 'verbose_json'
        })
      );
    });

    it('should handle backend errors', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const error = new WhisperError('Backend error', WhisperErrorType.SERVER_ERROR, 500);

      mockBackend.transcribe.mockRejectedValue(error);

      await expect(service.transcribe(audioBlob)).rejects.toThrow('Backend error');
    });

    it('should warn about invalid audio blobs but continue', async () => {
      AudioUtils.isValidAudioBlob.mockReturnValue(false);

      const audioBlob = createMockAudioBlob(1024);
      mockBackend.transcribe.mockResolvedValue(createMockTranscriptionResponse());

      const result = await service.transcribe(audioBlob);

      expect(result).toBeDefined();
      expect(result.text).toBe('Hello, this is a test transcription.');
    });
  });

  describe('transcribe with chunking', () => {
    it('should use chunked transcription for large files', async () => {
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024); // 30MB
      const chunk1 = createMockAudioBlob(15 * 1024 * 1024);
      const chunk2 = createMockAudioBlob(15 * 1024 * 1024);

      service._chunker.needsChunking.mockReturnValue(true);
      service._chunker.getChunkingInfo.mockReturnValue({
        totalSize: largeBlob.size,
        totalSizeMB: 30,
        needsChunking: true,
        estimatedChunkCount: 2
      });
      service._chunker.splitIfNeeded.mockResolvedValue([chunk1, chunk2]);

      mockBackend.transcribe
        .mockResolvedValueOnce({
          text: 'First chunk.',
          segments: [{ speaker: 'SPEAKER_00', text: 'First chunk.', start: 0, end: 2.0 }],
          language: 'en',
          duration: 2.0
        })
        .mockResolvedValueOnce({
          text: 'Second chunk.',
          segments: [{ speaker: 'SPEAKER_01', text: 'Second chunk.', start: 0, end: 2.0 }],
          language: 'en',
          duration: 2.0
        });

      const result = await service.transcribe(largeBlob);

      expect(result.text).toContain('First chunk.');
      expect(result.text).toContain('Second chunk.');
      expect(result.chunked).toBe(true);
      expect(result.chunkCount).toBe(2);
      expect(mockBackend.transcribe).toHaveBeenCalledTimes(2);
    });

    it('should adjust segment timings for chunks', async () => {
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024);
      const chunk1 = createMockAudioBlob(15 * 1024 * 1024);
      const chunk2 = createMockAudioBlob(15 * 1024 * 1024);

      service._chunker.needsChunking.mockReturnValue(true);
      service._chunker.splitIfNeeded.mockResolvedValue([chunk1, chunk2]);
      service._chunker.getChunkingInfo.mockReturnValue({
        totalSize: largeBlob.size,
        totalSizeMB: 30,
        needsChunking: true,
        estimatedChunkCount: 2
      });

      AudioUtils.estimateDuration.mockReturnValue(60); // 60 seconds per chunk

      mockBackend.transcribe
        .mockResolvedValueOnce({
          text: 'First chunk.',
          segments: [{ speaker: 'SPEAKER_00', text: 'First chunk.', start: 0, end: 2.0 }],
          language: 'en',
          duration: 2.0
        })
        .mockResolvedValueOnce({
          text: 'Second chunk.',
          segments: [{ speaker: 'SPEAKER_01', text: 'Second chunk.', start: 0, end: 2.0 }],
          language: 'en',
          duration: 2.0
        });

      const result = await service.transcribe(largeBlob);

      // First chunk segments should start at 0
      const firstChunkSegments = result.segments.filter((s) => s.originalSpeaker === 'SPEAKER_00');
      expect(firstChunkSegments[0].start).toBe(0);

      // Second chunk segments should be offset by first chunk duration (60s)
      const secondChunkSegments = result.segments.filter((s) => s.originalSpeaker === 'SPEAKER_01');
      expect(secondChunkSegments[0].start).toBe(60);
    });

    it('should call onProgress callback during chunking', async () => {
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024);
      const chunk1 = createMockAudioBlob(15 * 1024 * 1024);
      const chunk2 = createMockAudioBlob(15 * 1024 * 1024);

      service._chunker.needsChunking.mockReturnValue(true);
      service._chunker.splitIfNeeded.mockResolvedValue([chunk1, chunk2]);
      service._chunker.getChunkingInfo.mockReturnValue({
        totalSize: largeBlob.size,
        totalSizeMB: 30,
        needsChunking: true,
        estimatedChunkCount: 2
      });

      mockBackend.transcribe.mockResolvedValue({
        text: 'Chunk text.',
        segments: [],
        language: 'en',
        duration: 2.0
      });

      const onProgress = vi.fn();
      await service.transcribe(largeBlob, { onProgress });

      expect(onProgress).toHaveBeenCalledWith({
        currentChunk: 1,
        totalChunks: 2,
        progress: 0
      });

      expect(onProgress).toHaveBeenCalledWith({
        currentChunk: 2,
        totalChunks: 2,
        progress: 50
      });

      expect(onProgress).toHaveBeenCalledWith({
        currentChunk: 2,
        totalChunks: 2,
        progress: 100
      });
    });

    it('should collect unique speakers from all chunks', async () => {
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024);
      const chunk1 = createMockAudioBlob(15 * 1024 * 1024);
      const chunk2 = createMockAudioBlob(15 * 1024 * 1024);

      service._chunker.needsChunking.mockReturnValue(true);
      service._chunker.splitIfNeeded.mockResolvedValue([chunk1, chunk2]);
      service._chunker.getChunkingInfo.mockReturnValue({
        totalSize: largeBlob.size,
        totalSizeMB: 30,
        needsChunking: true,
        estimatedChunkCount: 2
      });

      mockBackend.transcribe
        .mockResolvedValueOnce({
          text: 'First chunk.',
          segments: [
            { speaker: 'SPEAKER_00', text: 'First chunk.', start: 0, end: 2.0 },
            { speaker: 'SPEAKER_01', text: 'Response.', start: 2.0, end: 4.0 }
          ],
          language: 'en',
          duration: 4.0
        })
        .mockResolvedValueOnce({
          text: 'Second chunk.',
          segments: [{ speaker: 'SPEAKER_02', text: 'Second chunk.', start: 0, end: 2.0 }],
          language: 'en',
          duration: 2.0
        });

      const result = await service.transcribe(largeBlob);

      expect(result.speakers).toHaveLength(3);
      expect(result.speakers.map((s) => s.id)).toContain('SPEAKER_00');
      expect(result.speakers.map((s) => s.id)).toContain('SPEAKER_01');
      expect(result.speakers.map((s) => s.id)).toContain('SPEAKER_02');
    });
  });

  describe('transcribeBasic', () => {
    it('should transcribe with TEXT format', async () => {
      const audioBlob = createMockAudioBlob(1024);
      mockBackend.transcribe.mockResolvedValue('Simple text transcription.');

      const result = await service.transcribeBasic(audioBlob);

      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          response_format: 'text'
        })
      );
    });

    it('should use provided language', async () => {
      const audioBlob = createMockAudioBlob(1024);
      mockBackend.transcribe.mockResolvedValue('Simple text transcription.');

      await service.transcribeBasic(audioBlob, 'it');

      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          language: 'it',
          response_format: 'text'
        })
      );
    });

    it('should use default language when not provided', async () => {
      service.setLanguage('es');
      const audioBlob = createMockAudioBlob(1024);
      mockBackend.transcribe.mockResolvedValue('Simple text transcription.');

      await service.transcribeBasic(audioBlob);

      expect(mockBackend.transcribe).toHaveBeenCalledWith(
        audioBlob,
        expect.objectContaining({
          language: 'es'
        })
      );
    });
  });

  describe('_normalizeResponse', () => {
    it('should handle text-only response', () => {
      const normalized = service._normalizeResponse('Plain text response');

      expect(normalized).toEqual({
        text: 'Plain text response',
        segments: [],
        speakers: []
      });
    });

    it('should handle JSON response with segments', () => {
      const response = {
        text: 'Full text',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1.0 }],
        language: 'en',
        duration: 1.0
      };

      const normalized = service._normalizeResponse(response);

      expect(normalized.text).toBe('Full text');
      expect(normalized.segments).toHaveLength(1);
      expect(normalized.segments[0].speaker).toBe('SPEAKER_00');
      expect(normalized.language).toBe('en');
      expect(normalized.duration).toBe(1.0);
    });

    it('should handle response with words instead of segments', () => {
      const response = {
        text: 'Full text',
        words: [
          { word: 'Hello', start: 0, end: 0.5, speaker: 'SPEAKER_00' },
          { word: 'world', start: 0.5, end: 1.0, speaker: 'SPEAKER_00' }
        ],
        language: 'en'
      };

      const normalized = service._normalizeResponse(response);

      expect(normalized.segments).toHaveLength(1);
      expect(normalized.segments[0].text).toContain('Hello');
      expect(normalized.segments[0].text).toContain('world');
    });

    it('should handle segment with alternative time fields', () => {
      const response = {
        text: 'Full text',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', from: 0, to: 1.0 }]
      };

      const normalized = service._normalizeResponse(response);

      expect(normalized.segments[0].start).toBe(0);
      expect(normalized.segments[0].end).toBe(1.0);
    });

    it('should handle unexpected format gracefully', () => {
      const normalized = service._normalizeResponse(null);

      expect(normalized).toEqual({
        text: '',
        segments: [],
        speakers: []
      });
    });
  });

  describe('_createSegmentsFromWords', () => {
    it('should create segments from word array', () => {
      const words = [
        { word: 'Hello', start: 0, end: 0.5, speaker: 'SPEAKER_00' },
        { word: 'world', start: 0.5, end: 1.0, speaker: 'SPEAKER_00' }
      ];

      const segments = service._createSegmentsFromWords(words);

      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('Hello world');
      expect(segments[0].speaker).toBe('SPEAKER_00');
    });

    it('should split segments on speaker change', () => {
      const words = [
        { word: 'Hello', start: 0, end: 0.5, speaker: 'SPEAKER_00' },
        { word: 'there', start: 0.5, end: 1.0, speaker: 'SPEAKER_01' }
      ];

      const segments = service._createSegmentsFromWords(words);

      expect(segments).toHaveLength(2);
      expect(segments[0].speaker).toBe('SPEAKER_00');
      expect(segments[1].speaker).toBe('SPEAKER_01');
    });

    it('should split segments on long gaps', () => {
      const words = [
        { word: 'Hello', start: 0, end: 0.5, speaker: 'SPEAKER_00' },
        { word: 'world', start: 2.0, end: 2.5, speaker: 'SPEAKER_00' } // 1.5s gap
      ];

      const segments = service._createSegmentsFromWords(words);

      expect(segments).toHaveLength(2);
    });

    it('should handle empty word array', () => {
      const segments = service._createSegmentsFromWords([]);
      expect(segments).toEqual([]);
    });

    it('should handle null or undefined', () => {
      expect(service._createSegmentsFromWords(null)).toEqual([]);
      expect(service._createSegmentsFromWords(undefined)).toEqual([]);
    });
  });

  describe('_mapSpeakersToNames', () => {
    it('should map speaker IDs to names', () => {
      const result = {
        text: 'Full text',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1.0 },
          { speaker: 'SPEAKER_01', text: 'Hi', start: 1.0, end: 2.0 }
        ]
      };

      const speakerMap = {
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      };

      const mapped = service._mapSpeakersToNames(result, speakerMap);

      expect(mapped.segments[0].speaker).toBe('Alice');
      expect(mapped.segments[1].speaker).toBe('Bob');
      expect(mapped.segments[0].originalSpeaker).toBe('SPEAKER_00');
      expect(mapped.segments[1].originalSpeaker).toBe('SPEAKER_01');
    });

    it('should keep original ID when no mapping provided', () => {
      const result = {
        text: 'Full text',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1.0 }]
      };

      const mapped = service._mapSpeakersToNames(result, {});

      expect(mapped.segments[0].speaker).toBe('SPEAKER_00');
      expect(mapped.segments[0].originalSpeaker).toBe('SPEAKER_00');
    });

    it('should build speaker list with mapping info', () => {
      const result = {
        text: 'Full text',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1.0 },
          { speaker: 'SPEAKER_01', text: 'Hi', start: 1.0, end: 2.0 }
        ]
      };

      const speakerMap = {
        SPEAKER_00: 'Alice'
      };

      const mapped = service._mapSpeakersToNames(result, speakerMap);

      expect(mapped.speakers).toHaveLength(2);
      expect(mapped.speakers[0]).toEqual({
        id: 'SPEAKER_00',
        name: 'Alice',
        isMapped: true
      });
      expect(mapped.speakers[1]).toEqual({
        id: 'SPEAKER_01',
        name: 'SPEAKER_01',
        isMapped: false
      });
    });

    it('should handle result without segments', () => {
      const result = {
        text: 'Full text'
      };

      const mapped = service._mapSpeakersToNames(result, {});

      expect(mapped.segments).toEqual([]);
      expect(mapped.speakers).toEqual([]);
    });

    it('should handle null result', () => {
      const mapped = service._mapSpeakersToNames(null, {});

      expect(mapped).toEqual({
        text: '',
        segments: [],
        speakers: []
      });
    });

    it('should preserve additional result properties', () => {
      const result = {
        text: 'Full text',
        segments: [],
        language: 'en',
        duration: 5.0,
        chunked: true,
        chunkCount: 2
      };

      const mapped = service._mapSpeakersToNames(result, {});

      expect(mapped.language).toBe('en');
      expect(mapped.duration).toBe(5.0);
      expect(mapped.chunked).toBe(true);
      expect(mapped.chunkCount).toBe(2);
    });
  });

  describe('setSpeakerMap', () => {
    it('should update default speaker map', () => {
      const speakerMap = {
        SPEAKER_00: 'GM',
        SPEAKER_01: 'Player'
      };

      service.setSpeakerMap(speakerMap);

      expect(service._defaultSpeakerMap).toEqual(speakerMap);
    });

    it('should handle null speaker map', () => {
      service.setSpeakerMap(null);
      expect(service._defaultSpeakerMap).toEqual({});
    });
  });

  describe('getSpeakerMap', () => {
    it('should return copy of speaker map', () => {
      const speakerMap = { SPEAKER_00: 'GM' };
      service.setSpeakerMap(speakerMap);

      const retrieved = service.getSpeakerMap();

      expect(retrieved).toEqual(speakerMap);
      expect(retrieved).not.toBe(speakerMap); // Different object reference
    });

    it('should return empty object when not set', () => {
      expect(service.getSpeakerMap()).toEqual({});
    });
  });

  describe('setLanguage', () => {
    it('should update default language', () => {
      service.setLanguage('it');
      expect(service._defaultLanguage).toBe('it');
    });

    it('should accept null for auto-detect', () => {
      service.setLanguage(null);
      expect(service._defaultLanguage).toBeNull();
    });
  });

  describe('getLanguage', () => {
    it('should return current default language', () => {
      service.setLanguage('es');
      expect(service.getLanguage()).toBe('es');
    });

    it('should return null when not set', () => {
      expect(service.getLanguage()).toBeNull();
    });
  });

  describe('checkDiarizationSupport', () => {
    it('should query backend for capabilities', async () => {
      mockBackend.getServerInfo.mockResolvedValue({
        capabilities: {
          diarization: true
        }
      });

      const result = await service.checkDiarizationSupport();

      expect(result).toBe(true);
      expect(mockBackend.getServerInfo).toHaveBeenCalled();
    });

    it('should cache diarization support result', async () => {
      mockBackend.getServerInfo.mockResolvedValue({
        capabilities: {
          diarization: true
        }
      });

      await service.checkDiarizationSupport();
      await service.checkDiarizationSupport();

      // Should only call once due to caching
      expect(mockBackend.getServerInfo).toHaveBeenCalledTimes(1);
    });

    it('should return false when capabilities not available', async () => {
      mockBackend.getServerInfo.mockResolvedValue({});

      const result = await service.checkDiarizationSupport();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockBackend.getServerInfo.mockRejectedValue(new Error('Server error'));

      const result = await service.checkDiarizationSupport();

      expect(result).toBe(false);
    });

    it('should handle backend without diarization', async () => {
      mockBackend.getServerInfo.mockResolvedValue({
        capabilities: {
          diarization: false
        }
      });

      const result = await service.checkDiarizationSupport();

      expect(result).toBe(false);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return list of supported languages', () => {
      const languages = LocalWhisperService.getSupportedLanguages();

      expect(languages).toBeInstanceOf(Array);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages[0]).toHaveProperty('code');
      expect(languages[0]).toHaveProperty('name');
    });

    it('should include auto-detect option', () => {
      const languages = LocalWhisperService.getSupportedLanguages();
      const autoDetect = languages.find((lang) => lang.code === '');

      expect(autoDetect).toBeDefined();
      expect(autoDetect.name).toBe('Auto-detect');
    });

    it('should include common languages', () => {
      const languages = LocalWhisperService.getSupportedLanguages();
      const codes = languages.map((lang) => lang.code);

      expect(codes).toContain('en');
      expect(codes).toContain('it');
      expect(codes).toContain('es');
      expect(codes).toContain('de');
      expect(codes).toContain('fr');
    });
  });

  describe('estimateTranscriptionTime', () => {
    it('should estimate transcription time', () => {
      const audioBlob = createMockAudioBlob(1024);
      AudioUtils.estimateDuration.mockReturnValue(120); // 120 seconds

      const estimate = service.estimateTranscriptionTime(audioBlob);

      expect(estimate).toHaveProperty('audioLengthSeconds', 120);
      expect(estimate).toHaveProperty('estimatedTranscriptionSeconds', 60); // 0.5 * 120
      expect(estimate).toHaveProperty('realtimeFactor', 0.5);
      expect(estimate).toHaveProperty('note');
    });

    it('should accept custom realtime factor', () => {
      const audioBlob = createMockAudioBlob(1024);
      AudioUtils.estimateDuration.mockReturnValue(120);

      const estimate = service.estimateTranscriptionTime(audioBlob, { realtimeFactor: 0.25 });

      expect(estimate.estimatedTranscriptionSeconds).toBe(30); // 0.25 * 120
      expect(estimate.realtimeFactor).toBe(0.25);
    });

    it('should use default realtime factor of 0.5', () => {
      const audioBlob = createMockAudioBlob(1024);
      AudioUtils.estimateDuration.mockReturnValue(60);

      const estimate = service.estimateTranscriptionTime(audioBlob);

      expect(estimate.realtimeFactor).toBe(0.5);
    });
  });

  describe('LocalWhisperResponseFormat', () => {
    it('should export response format constants', () => {
      expect(LocalWhisperResponseFormat.JSON).toBe('json');
      expect(LocalWhisperResponseFormat.VERBOSE_JSON).toBe('verbose_json');
      expect(LocalWhisperResponseFormat.TEXT).toBe('text');
      expect(LocalWhisperResponseFormat.SRT).toBe('srt');
      expect(LocalWhisperResponseFormat.VTT).toBe('vtt');
    });
  });

  describe('LOCAL_TRANSCRIPTION_TIMEOUT_MS', () => {
    it('should export timeout constant', () => {
      expect(LOCAL_TRANSCRIPTION_TIMEOUT_MS).toBe(600000); // 10 minutes
    });
  });
});
