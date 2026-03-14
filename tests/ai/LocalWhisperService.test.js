/**
 * Tests for LocalWhisperService - Local Whisper Transcription Service
 *
 * Covers: exports, constructor, backendUrl, setBackendUrl, healthCheck,
 * transcribe (single/chunked), _normalizeResponse, _createSegmentsFromWords,
 * _combineChunkResults, _mapSpeakersToNames, speaker map management,
 * language management, transcribeBasic, checkDiarizationSupport,
 * estimateTranscriptionTime, static methods, error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  LocalWhisperService,
  LocalWhisperResponseFormat,
  LOCAL_TRANSCRIPTION_TIMEOUT_MS
} from '../../scripts/ai/LocalWhisperService.mjs';

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

// Hoisted mocks for backend behavior
const backendMocks = vi.hoisted(() => ({
  transcribeResult: { text: 'Hello world', segments: [] },
  healthCheckResult: true,
  serverInfo: null,
  lastHealthStatus: null
}));

// Mock WhisperBackend
vi.mock('../../scripts/ai/WhisperBackend.mjs', () => {
  class MockWhisperBackend {
    constructor(url, options = {}) {
      this.baseUrl = url;
      this.options = options;
    }
    get lastHealthStatus() {
      return backendMocks.lastHealthStatus;
    }
    setBaseUrl(url) {
      this.baseUrl = url;
    }
    async healthCheck(options = {}) {
      return backendMocks.healthCheckResult;
    }
    async transcribe(audioBlob, options = {}) {
      return backendMocks.transcribeResult;
    }
    async getServerInfo() {
      return backendMocks.serverInfo;
    }
  }

  class WhisperError extends Error {
    constructor(message, type, status, details) {
      super(message);
      this.name = 'WhisperError';
      this.type = type;
      this.status = status;
      this.details = details;
    }
  }

  return {
    WhisperBackend: MockWhisperBackend,
    WhisperError,
    WhisperErrorType: {
      CONNECTION_ERROR: 'connection_error',
      SERVER_ERROR: 'server_error',
      INVALID_REQUEST_ERROR: 'invalid_request_error',
      TIMEOUT_ERROR: 'timeout_error',
      UNSUPPORTED_FORMAT_ERROR: 'unsupported_format_error'
    }
  };
});

// Mock AudioChunker
vi.mock('../../scripts/audio/AudioChunker.mjs', () => {
  class MockAudioChunker {
    constructor() {
      this.needsChunking = vi.fn().mockReturnValue(false);
      this.splitIfNeeded = vi.fn().mockResolvedValue([]);
      this.getChunkingInfo = vi.fn().mockReturnValue({
        totalSizeMB: '50.00',
        estimatedChunkCount: 3
      });
    }
  }
  return { AudioChunker: MockAudioChunker };
});

// Hoisted AudioUtils mocks
const audioUtilsMocks = vi.hoisted(() => ({
  isValidAudioBlob: vi.fn().mockReturnValue(true),
  getBlobSizeMB: vi.fn().mockReturnValue('5.00'),
  estimateDuration: vi.fn().mockReturnValue(300)
}));

vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: audioUtilsMocks,
  MAX_TRANSCRIPTION_SIZE: 25 * 1024 * 1024
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createAudioBlob(size = 1024) {
  return new Blob([new ArrayBuffer(size)], { type: 'audio/webm' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalWhisperService', () => {
  let service;

  beforeEach(() => {
    // Re-initialize hoisted mocks
    audioUtilsMocks.isValidAudioBlob.mockReturnValue(true);
    audioUtilsMocks.getBlobSizeMB.mockReturnValue('5.00');
    audioUtilsMocks.estimateDuration.mockReturnValue(300);

    backendMocks.transcribeResult = {
      text: 'Hello world',
      segments: [
        { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 },
        { speaker: 'SPEAKER_01', text: 'world', start: 1, end: 2 }
      ]
    };
    backendMocks.healthCheckResult = true;
    backendMocks.serverInfo = null;
    backendMocks.lastHealthStatus = null;

    service = new LocalWhisperService('http://localhost:8080', {
      defaultLanguage: 'en'
    });
  });

  // ── Exports ────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export LocalWhisperService class', () => {
      expect(LocalWhisperService).toBeDefined();
      expect(typeof LocalWhisperService).toBe('function');
    });

    it('should export LocalWhisperResponseFormat enum', () => {
      expect(LocalWhisperResponseFormat.JSON).toBe('json');
      expect(LocalWhisperResponseFormat.VERBOSE_JSON).toBe('verbose_json');
      expect(LocalWhisperResponseFormat.TEXT).toBe('text');
      expect(LocalWhisperResponseFormat.SRT).toBe('srt');
      expect(LocalWhisperResponseFormat.VTT).toBe('vtt');
    });

    it('should export LOCAL_TRANSCRIPTION_TIMEOUT_MS constant', () => {
      expect(LOCAL_TRANSCRIPTION_TIMEOUT_MS).toBe(600000);
    });
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create instance with backend URL', () => {
      const svc = new LocalWhisperService('http://localhost:9000');
      expect(svc.backendUrl).toBe('http://localhost:9000');
    });

    it('should accept defaultLanguage option', () => {
      const svc = new LocalWhisperService('http://localhost:8080', {
        defaultLanguage: 'it'
      });
      expect(svc.getLanguage()).toBe('it');
    });

    it('should accept defaultSpeakerMap option', () => {
      const map = { SPEAKER_00: 'GM' };
      const svc = new LocalWhisperService('http://localhost:8080', {
        defaultSpeakerMap: map
      });
      expect(svc.getSpeakerMap()).toEqual(map);
    });

    it('should default language to null', () => {
      const svc = new LocalWhisperService('http://localhost:8080');
      expect(svc.getLanguage()).toBe(null);
    });

    it('should default speaker map to empty object', () => {
      const svc = new LocalWhisperService('http://localhost:8080');
      expect(svc.getSpeakerMap()).toEqual({});
    });
  });

  // ── backendUrl ─────────────────────────────────────────────────────

  describe('backendUrl', () => {
    it('should return backend URL', () => {
      expect(service.backendUrl).toBe('http://localhost:8080');
    });
  });

  // ── setBackendUrl ──────────────────────────────────────────────────

  describe('setBackendUrl', () => {
    it('should update backend URL', () => {
      service.setBackendUrl('http://localhost:9090');
      expect(service.backendUrl).toBe('http://localhost:9090');
    });

    it('should reset diarization support cache', () => {
      service._supportsDiarization = true;
      service.setBackendUrl('http://localhost:9090');
      expect(service._supportsDiarization).toBe(null);
    });
  });

  // ── healthCheck ────────────────────────────────────────────────────

  describe('healthCheck', () => {
    it('should delegate to backend healthCheck', async () => {
      backendMocks.healthCheckResult = true;
      const result = await service.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false when backend is not healthy', async () => {
      backendMocks.healthCheckResult = false;
      const result = await service.healthCheck();
      expect(result).toBe(false);
    });

    it('should pass options to backend', async () => {
      const result = await service.healthCheck({ timeout: 1000 });
      expect(result).toBe(true);
    });
  });

  // ── lastHealthStatus ───────────────────────────────────────────────

  describe('lastHealthStatus', () => {
    it('should return null initially', () => {
      expect(service.lastHealthStatus).toBe(null);
    });

    it('should reflect backend lastHealthStatus', () => {
      backendMocks.lastHealthStatus = true;
      expect(service.lastHealthStatus).toBe(true);
    });
  });

  // ── transcribe ─────────────────────────────────────────────────────

  describe('transcribe', () => {
    it('should transcribe a valid audio blob', async () => {
      const blob = createAudioBlob();
      const result = await service.transcribe(blob);
      expect(result).toBeDefined();
      expect(result.text).toBe('Hello world');
    });

    it('should throw on null audio blob', async () => {
      await expect(service.transcribe(null)).rejects.toThrow('Invalid audio input');
    });

    it('should throw on non-Blob input', async () => {
      await expect(service.transcribe('not a blob')).rejects.toThrow('Invalid audio input');
    });

    it('should throw on undefined audio blob', async () => {
      await expect(service.transcribe(undefined)).rejects.toThrow('Invalid audio input');
    });

    it('should warn but continue when audio blob is not valid', async () => {
      audioUtilsMocks.isValidAudioBlob.mockReturnValueOnce(false);
      const blob = createAudioBlob();
      const result = await service.transcribe(blob);
      expect(result).toBeDefined();
    });

    it('should apply speaker map from options', async () => {
      const blob = createAudioBlob();
      const result = await service.transcribe(blob, {
        speakerMap: { SPEAKER_00: 'DM' }
      });
      const dmSegment = result.segments.find((s) => s.speaker === 'DM');
      expect(dmSegment).toBeDefined();
    });

    it('should apply default speaker map', async () => {
      service.setSpeakerMap({ SPEAKER_00: 'Game Master' });
      const blob = createAudioBlob();
      const result = await service.transcribe(blob);
      const gmSegment = result.segments.find((s) => s.speaker === 'Game Master');
      expect(gmSegment).toBeDefined();
    });

    it('should use language from options', async () => {
      const blob = createAudioBlob();
      const result = await service.transcribe(blob, { language: 'fr' });
      expect(result).toBeDefined();
    });

    it('should handle transcription errors', async () => {
      backendMocks.transcribeResult = null;
      // Override the backend transcribe to throw
      service._backend.transcribe = vi.fn().mockRejectedValue(new Error('Backend error'));

      const blob = createAudioBlob();
      await expect(service.transcribe(blob)).rejects.toThrow('Backend error');
    });
  });

  // ── Chunked transcription ──────────────────────────────────────────

  describe('chunked transcription', () => {
    it('should handle chunked transcription when needed', async () => {
      service._chunker.needsChunking.mockReturnValue(true);
      service._chunker.splitIfNeeded.mockResolvedValue([
        createAudioBlob(1024),
        createAudioBlob(1024)
      ]);

      const blob = createAudioBlob();
      const result = await service.transcribe(blob);
      expect(result).toBeDefined();
    });

    it('should call onProgress callback during chunked transcription', async () => {
      service._chunker.needsChunking.mockReturnValue(true);
      service._chunker.splitIfNeeded.mockResolvedValue([
        createAudioBlob(1024),
        createAudioBlob(1024)
      ]);

      const onProgress = vi.fn();
      const blob = createAudioBlob();
      await service.transcribe(blob, { onProgress });

      expect(onProgress).toHaveBeenCalled();
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
      expect(lastCall.progress).toBe(100);
    });
  });

  // ── _normalizeResponse ─────────────────────────────────────────────

  describe('_normalizeResponse', () => {
    it('should handle string response', () => {
      const result = service._normalizeResponse('Hello world');
      expect(result.text).toBe('Hello world');
      expect(result.segments).toEqual([]);
    });

    it('should handle JSON response with segments', () => {
      const result = service._normalizeResponse({
        text: 'Hello',
        segments: [{ speaker: 'A', text: 'Hello', start: 0, end: 1 }]
      });
      expect(result.text).toBe('Hello');
      expect(result.segments).toHaveLength(1);
    });

    it('should handle JSON response without segments but with words', () => {
      const result = service._normalizeResponse({
        text: 'Hello world',
        words: [
          { word: 'Hello', start: 0, end: 0.5 },
          { word: 'world', start: 0.6, end: 1.0 }
        ]
      });
      expect(result.text).toBe('Hello world');
      expect(result.segments.length).toBeGreaterThan(0);
    });

    it('should handle null response as unexpected format', () => {
      const result = service._normalizeResponse(null);
      // null passes typeof === 'object' but is caught by explicit null check
      // The code checks (typeof response === 'object' && response !== null)
      // So null falls through to the fallback case
      expect(result.text).toBe('');
      expect(result.segments).toEqual([]);
    });

    it('should handle empty object response', () => {
      const result = service._normalizeResponse({});
      expect(result.text).toBe('');
      expect(result.segments).toEqual([]);
    });

    it('should preserve language field', () => {
      const result = service._normalizeResponse({
        text: 'Hello',
        language: 'en'
      });
      expect(result.language).toBe('en');
    });

    it('should preserve duration field', () => {
      const result = service._normalizeResponse({
        text: 'Hello',
        duration: 10.5
      });
      expect(result.duration).toBe(10.5);
    });

    it('should normalize segment timestamps with from/to fallback', () => {
      const result = service._normalizeResponse({
        text: 'Hello',
        segments: [{ text: 'Hello', from: 1.0, to: 2.0 }]
      });
      expect(result.segments[0].start).toBe(1.0);
      expect(result.segments[0].end).toBe(2.0);
    });

    it('should handle numeric or boolean response as unexpected format', () => {
      const result = service._normalizeResponse(42);
      expect(result.text).toBe('42');
    });
  });

  // ── _createSegmentsFromWords ───────────────────────────────────────

  describe('_createSegmentsFromWords', () => {
    it('should return empty array for empty words', () => {
      expect(service._createSegmentsFromWords([])).toEqual([]);
    });

    it('should return empty array for null words', () => {
      expect(service._createSegmentsFromWords(null)).toEqual([]);
    });

    it('should create single segment from continuous words', () => {
      const words = [
        { word: 'Hello', start: 0, end: 0.3 },
        { word: 'world', start: 0.4, end: 0.8 }
      ];
      const segments = service._createSegmentsFromWords(words);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toContain('Hello');
      expect(segments[0].text).toContain('world');
    });

    it('should create new segment on speaker change', () => {
      const words = [
        { word: 'Hello', start: 0, end: 0.3, speaker: 'A' },
        { word: 'Hi', start: 0.4, end: 0.6, speaker: 'B' }
      ];
      const segments = service._createSegmentsFromWords(words);
      expect(segments).toHaveLength(2);
      expect(segments[0].speaker).toBe('A');
      expect(segments[1].speaker).toBe('B');
    });

    it('should create new segment on large gap', () => {
      const words = [
        { word: 'Hello', start: 0, end: 0.3 },
        { word: 'world', start: 5.0, end: 5.3 } // 4.7s gap > 1.0s threshold
      ];
      const segments = service._createSegmentsFromWords(words);
      expect(segments).toHaveLength(2);
    });

    it('should handle words without timestamps', () => {
      const words = [{ word: 'Hello' }];
      const segments = service._createSegmentsFromWords(words);
      expect(segments).toHaveLength(1);
      expect(segments[0].start).toBe(0);
    });
  });

  // ── _combineChunkResults ───────────────────────────────────────────

  describe('_combineChunkResults', () => {
    it('should combine multiple chunk results', () => {
      const results = [
        { text: 'Hello', segments: [{ start: 0, end: 1 }] },
        { text: 'world', segments: [{ start: 5, end: 6 }] }
      ];
      const combined = service._combineChunkResults(results, new Set());
      expect(combined.text).toBe('Hello world');
      expect(combined.segments).toHaveLength(2);
      expect(combined.chunked).toBe(true);
      expect(combined.chunkCount).toBe(2);
    });

    it('should return empty result for null input', () => {
      const combined = service._combineChunkResults(null, new Set());
      expect(combined.text).toBe('');
      expect(combined.segments).toEqual([]);
    });

    it('should return empty result for empty array', () => {
      const combined = service._combineChunkResults([], new Set());
      expect(combined.text).toBe('');
    });

    it('should sort segments by start time', () => {
      const results = [
        { text: 'B', segments: [{ start: 5, end: 6 }] },
        { text: 'A', segments: [{ start: 0, end: 1 }] }
      ];
      const combined = service._combineChunkResults(results, new Set());
      expect(combined.segments[0].start).toBe(0);
    });
  });

  // ── _mapSpeakersToNames ────────────────────────────────────────────

  describe('_mapSpeakersToNames', () => {
    it('should map speaker IDs to names', () => {
      const result = {
        text: 'Hello',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }]
      };
      const mapped = service._mapSpeakersToNames(result, { SPEAKER_00: 'GM' });
      expect(mapped.segments[0].speaker).toBe('GM');
      expect(mapped.segments[0].originalSpeaker).toBe('SPEAKER_00');
    });

    it('should handle null result', () => {
      const mapped = service._mapSpeakersToNames(null, {});
      expect(mapped.text).toBe('');
      expect(mapped.segments).toEqual([]);
    });

    it('should handle result without segments', () => {
      const mapped = service._mapSpeakersToNames({ text: 'Hello' }, {});
      expect(mapped.segments).toEqual([]);
      expect(mapped.speakers).toEqual([]);
    });

    it('should handle segments without speaker', () => {
      const result = {
        text: 'Hello',
        segments: [{ text: 'Hello', start: 0, end: 1 }]
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.segments[0].speaker).toBe('Unknown');
    });

    it('should preserve chunking metadata', () => {
      const result = {
        text: 'Hello',
        segments: [],
        chunked: true,
        chunkCount: 2
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.chunked).toBe(true);
      expect(mapped.chunkCount).toBe(2);
    });

    it('should include raw result', () => {
      const result = { text: 'Hello', segments: [] };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.raw).toBe(result);
    });
  });

  // ── Speaker map management ─────────────────────────────────────────

  describe('speaker map management', () => {
    it('should set speaker map', () => {
      service.setSpeakerMap({ SPEAKER_00: 'GM' });
      expect(service.getSpeakerMap()).toEqual({ SPEAKER_00: 'GM' });
    });

    it('should return copy of speaker map', () => {
      service.setSpeakerMap({ SPEAKER_00: 'GM' });
      const map = service.getSpeakerMap();
      map.SPEAKER_00 = 'Modified';
      expect(service.getSpeakerMap().SPEAKER_00).toBe('GM');
    });

    it('should handle null speaker map', () => {
      service.setSpeakerMap(null);
      expect(service.getSpeakerMap()).toEqual({});
    });
  });

  // ── Language management ────────────────────────────────────────────

  describe('language management', () => {
    it('should set language', () => {
      service.setLanguage('fr');
      expect(service.getLanguage()).toBe('fr');
    });

    it('should clear language with null', () => {
      service.setLanguage(null);
      expect(service.getLanguage()).toBe(null);
    });
  });

  // ── transcribeBasic ────────────────────────────────────────────────

  describe('transcribeBasic', () => {
    it('should transcribe with text format', async () => {
      const blob = createAudioBlob();
      const result = await service.transcribeBasic(blob);
      expect(result).toBeDefined();
    });

    it('should use provided language', async () => {
      const blob = createAudioBlob();
      const result = await service.transcribeBasic(blob, 'de');
      expect(result).toBeDefined();
    });

    it('should use default language when none provided', async () => {
      service.setLanguage('it');
      const blob = createAudioBlob();
      const result = await service.transcribeBasic(blob);
      expect(result).toBeDefined();
    });
  });

  // ── checkDiarizationSupport ────────────────────────────────────────

  describe('checkDiarizationSupport', () => {
    it('should return true when backend supports diarization', async () => {
      backendMocks.serverInfo = {
        capabilities: { diarization: true }
      };
      const result = await service.checkDiarizationSupport();
      expect(result).toBe(true);
    });

    it('should return false when backend lacks diarization', async () => {
      backendMocks.serverInfo = {
        capabilities: { diarization: false }
      };
      const result = await service.checkDiarizationSupport();
      expect(result).toBe(false);
    });

    it('should return false when server info is null', async () => {
      backendMocks.serverInfo = null;
      const result = await service.checkDiarizationSupport();
      expect(result).toBe(false);
    });

    it('should return false when server info has no capabilities', async () => {
      backendMocks.serverInfo = {};
      const result = await service.checkDiarizationSupport();
      expect(result).toBe(false);
    });

    it('should cache diarization support result', async () => {
      backendMocks.serverInfo = { capabilities: { diarization: true } };
      await service.checkDiarizationSupport();

      // Change server info - should still return cached value
      backendMocks.serverInfo = { capabilities: { diarization: false } };
      const result = await service.checkDiarizationSupport();
      expect(result).toBe(true);
    });

    it('should return false when getServerInfo throws', async () => {
      service._backend.getServerInfo = vi.fn().mockRejectedValue(new Error('fail'));
      const result = await service.checkDiarizationSupport();
      expect(result).toBe(false);
    });
  });

  // ── estimateTranscriptionTime ──────────────────────────────────────

  describe('estimateTranscriptionTime', () => {
    it('should estimate transcription time', () => {
      const blob = createAudioBlob();
      const estimate = service.estimateTranscriptionTime(blob);
      expect(estimate.audioLengthSeconds).toBe(300);
      expect(estimate.estimatedTranscriptionSeconds).toBe(150); // 300 * 0.5
      expect(estimate.realtimeFactor).toBe(0.5);
      expect(estimate.note).toBeDefined();
    });

    it('should accept custom realtime factor', () => {
      const blob = createAudioBlob();
      const estimate = service.estimateTranscriptionTime(blob, { realtimeFactor: 1.0 });
      expect(estimate.estimatedTranscriptionSeconds).toBe(300);
      expect(estimate.realtimeFactor).toBe(1.0);
    });
  });

  // ── Static methods ─────────────────────────────────────────────────

  describe('static methods', () => {
    it('should return supported languages', () => {
      const langs = LocalWhisperService.getSupportedLanguages();
      expect(Array.isArray(langs)).toBe(true);
      expect(langs.length).toBeGreaterThan(0);
      const autoDetect = langs.find((l) => l.code === '');
      expect(autoDetect).toBeDefined();
      expect(autoDetect.name).toBe('Auto-detect');
    });

    it('should include more languages than cloud service', () => {
      const langs = LocalWhisperService.getSupportedLanguages();
      const ru = langs.find((l) => l.code === 'ru');
      expect(ru).toBeDefined();
      const ko = langs.find((l) => l.code === 'ko');
      expect(ko).toBeDefined();
    });
  });
});
