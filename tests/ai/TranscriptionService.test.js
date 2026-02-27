/**
 * Tests for TranscriptionService - OpenAI Audio Transcription with Speaker Diarization
 *
 * Covers: exports, constructor, transcribe (single/chunked), speaker mapping,
 * language settings, multi-language mode, circuit breaker, basic transcription,
 * static methods, cost estimation, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  TranscriptionService,
  TranscriptionModel,
  TranscriptionResponseFormat,
  ChunkingStrategy,
  TRANSCRIPTION_TIMEOUT_MS
} from '../../scripts/ai/TranscriptionService.mjs';

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

// Use vi.hoisted to declare mock values that survive vi.restoreAllMocks
const audioUtilsMocks = vi.hoisted(() => ({
  isValidAudioBlob: vi.fn().mockReturnValue(true),
  getBlobSizeMB: vi.fn().mockReturnValue('5.00'),
  blobToFile: vi.fn((blob, _name) => blob),
  estimateDuration: vi.fn().mockReturnValue(300)
}));

// Mock AudioUtils
vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: audioUtilsMocks,
  MAX_TRANSCRIPTION_SIZE: 25 * 1024 * 1024
}));

// Mock VocabularyDictionary
vi.mock('../../scripts/core/VocabularyDictionary.mjs', () => ({
  VocabularyDictionary: vi.fn().mockImplementation(() => ({
    generatePrompt: vi.fn().mockReturnValue('D&D vocabulary prompt')
  }))
}));

// Mock RateLimiter
vi.mock('../../scripts/utils/RateLimiter.mjs', () => {
  const mockRateLimiterInstance = {
    throttle: vi.fn((fn) => fn()),
    executeWithRetry: vi.fn((fn) => fn()),
    pause: vi.fn(),
    reset: vi.fn(),
    getStats: vi.fn().mockReturnValue({})
  };
  class MockRateLimiter {
    constructor() {
      Object.assign(this, {
        throttle: vi.fn((fn) => fn()),
        executeWithRetry: vi.fn((fn) => fn()),
        pause: vi.fn(),
        reset: vi.fn(),
        getStats: vi.fn().mockReturnValue({})
      });
    }
    static fromPreset() {
      return new MockRateLimiter();
    }
  }
  return { RateLimiter: MockRateLimiter };
});

// Mock SensitiveDataFilter
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeUrl: vi.fn((url) => url),
    sanitizeString: vi.fn((s) => s),
    sanitizeObject: vi.fn((o) => o)
  }
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(body)]))
  };
}

function createAudioBlob(size = 1024) {
  return new Blob([new ArrayBuffer(size)], { type: 'audio/webm' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranscriptionService', () => {
  let service;
  let fetchSpy;

  beforeEach(() => {
    // Re-initialize hoisted mocks (vi.restoreAllMocks clears them)
    audioUtilsMocks.isValidAudioBlob.mockReturnValue(true);
    audioUtilsMocks.getBlobSizeMB.mockReturnValue('5.00');
    audioUtilsMocks.blobToFile.mockImplementation((blob, _name) => blob);
    audioUtilsMocks.estimateDuration.mockReturnValue(300);

    fetchSpy = vi.fn().mockResolvedValue(
      mockResponse({
        text: 'Hello world',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1.5 },
          { speaker: 'SPEAKER_01', text: 'world', start: 1.5, end: 3.0 }
        ]
      })
    );
    globalThis.fetch = fetchSpy;

    service = new TranscriptionService('sk-test-key-12345', {
      retryEnabled: false,
      timeout: 5000
    });
  });

  afterEach(() => {
    service.clearQueue();
  });

  // ── Exports ──────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export TranscriptionService class', () => {
      expect(TranscriptionService).toBeDefined();
      expect(typeof TranscriptionService).toBe('function');
    });

    it('should export TranscriptionModel enum', () => {
      expect(TranscriptionModel.GPT4O_DIARIZE).toBe('gpt-4o-transcribe-diarize');
      expect(TranscriptionModel.GPT4O).toBe('gpt-4o-transcribe');
      expect(TranscriptionModel.WHISPER).toBe('whisper-1');
    });

    it('should export TranscriptionResponseFormat enum', () => {
      expect(TranscriptionResponseFormat.DIARIZED_JSON).toBe('diarized_json');
      expect(TranscriptionResponseFormat.JSON).toBe('json');
      expect(TranscriptionResponseFormat.VERBOSE_JSON).toBe('verbose_json');
      expect(TranscriptionResponseFormat.TEXT).toBe('text');
      expect(TranscriptionResponseFormat.SRT).toBe('srt');
      expect(TranscriptionResponseFormat.VTT).toBe('vtt');
    });

    it('should export ChunkingStrategy enum', () => {
      expect(ChunkingStrategy.AUTO).toBe('auto');
      expect(ChunkingStrategy.NONE).toBe('none');
    });

    it('should export TRANSCRIPTION_TIMEOUT_MS constant', () => {
      expect(TRANSCRIPTION_TIMEOUT_MS).toBe(600000);
    });
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create instance with API key', () => {
      const svc = new TranscriptionService('sk-test');
      expect(svc.isConfigured).toBe(true);
    });

    it('should accept defaultLanguage option', () => {
      const svc = new TranscriptionService('sk-test', { defaultLanguage: 'it' });
      expect(svc.getLanguage()).toBe('it');
    });

    it('should accept defaultSpeakerMap option', () => {
      const map = { SPEAKER_00: 'GM' };
      const svc = new TranscriptionService('sk-test', { defaultSpeakerMap: map });
      expect(svc.getSpeakerMap()).toEqual(map);
    });

    it('should set multiLanguageMode to false by default', () => {
      expect(service.isMultiLanguageMode()).toBe(false);
    });

    it('should accept multiLanguageMode option', () => {
      const svc = new TranscriptionService('sk-test', { multiLanguageMode: true });
      expect(svc.isMultiLanguageMode()).toBe(true);
    });

    it('should set default maxConsecutiveErrors to 5', () => {
      const status = service.getCircuitBreakerStatus();
      expect(status.maxErrors).toBe(5);
    });

    it('should accept maxConsecutiveErrors option', () => {
      const svc = new TranscriptionService('sk-test', { maxConsecutiveErrors: 3 });
      expect(svc.getCircuitBreakerStatus().maxErrors).toBe(3);
    });

    it('should initialize with closed circuit breaker', () => {
      const status = service.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(false);
      expect(status.consecutiveErrors).toBe(0);
    });
  });

  // ── transcribe ─────────────────────────────────────────────────────

  describe('transcribe', () => {
    it('should transcribe a valid audio blob', async () => {
      const blob = createAudioBlob();
      const result = await service.transcribe(blob);
      expect(result).toBeDefined();
      expect(result.text).toBe('Hello world');
      expect(result.segments).toHaveLength(2);
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

    it('should use default speaker map from constructor', async () => {
      const svc = new TranscriptionService('sk-test', {
        defaultSpeakerMap: { SPEAKER_00: 'GM' },
        retryEnabled: false
      });
      svc._rateLimiter.executeWithRetry = async (fn) => fn();

      const blob = createAudioBlob();
      const result = await svc.transcribe(blob);
      const gmSegment = result.segments.find(s => s.speaker === 'GM');
      expect(gmSegment).toBeDefined();
    });

    it('should use speakerMap from options over default', async () => {
      service.setSpeakerMap({ SPEAKER_00: 'Default GM' });
      const blob = createAudioBlob();
      const result = await service.transcribe(blob, {
        speakerMap: { SPEAKER_00: 'Custom GM' }
      });
      const gmSegment = result.segments.find(s => s.speaker === 'Custom GM');
      expect(gmSegment).toBeDefined();
    });

    it('should strip prompt for diarize model', async () => {
      const blob = createAudioBlob();
      await service.transcribe(blob, {
        prompt: 'some prompt',
        model: TranscriptionModel.GPT4O_DIARIZE
      });
      // Verifies the method did not throw and completed
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should generate vocabulary prompt for non-diarize model', async () => {
      const blob = createAudioBlob();
      await service.transcribe(blob, {
        model: TranscriptionModel.GPT4O
      });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should warn but continue when audio blob is not valid', async () => {
      const { AudioUtils } = await import('../../scripts/utils/AudioUtils.mjs');
      AudioUtils.isValidAudioBlob.mockReturnValueOnce(false);

      const blob = createAudioBlob();
      const result = await service.transcribe(blob);
      expect(result).toBeDefined();
    });

    it('should reset consecutive errors on success', async () => {
      // Force some errors first
      service._consecutiveErrors = 3;

      const blob = createAudioBlob();
      await service.transcribe(blob);
      expect(service.getCircuitBreakerStatus().consecutiveErrors).toBe(0);
    });

    it('should increment consecutive errors on failure', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network failure'));

      const blob = createAudioBlob();
      await expect(service.transcribe(blob)).rejects.toThrow();
      expect(service.getCircuitBreakerStatus().consecutiveErrors).toBe(1);
    });

    it('should use language option when provided', async () => {
      const blob = createAudioBlob();
      await service.transcribe(blob, { language: 'es' });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should not mutate the caller\'s options object', async () => {
      const blob = createAudioBlob();
      const originalOptions = {
        prompt: 'my custom prompt',
        model: TranscriptionModel.GPT4O_DIARIZE
      };
      // Keep a copy to verify against
      const optionsBefore = { ...originalOptions };

      // The diarize model strips the prompt via `delete options.prompt`.
      // Without the shallow copy fix, the caller's object would be mutated.
      await service.transcribe(blob, originalOptions);

      // The caller's options should be unchanged
      expect(originalOptions).toEqual(optionsBefore);
      expect(originalOptions.prompt).toBe('my custom prompt');
    });

    it('should not mutate options when vocabulary prompt is generated', async () => {
      const blob = createAudioBlob();
      const originalOptions = {
        model: TranscriptionModel.GPT4O // Non-diarize model, vocabulary prompt gets generated
      };

      await service.transcribe(blob, originalOptions);

      // The caller's object should not have a prompt property added
      expect(originalOptions.prompt).toBeUndefined();
      expect(Object.keys(originalOptions)).toEqual(['model']);
    });

    it('should allow reusing same options across multiple calls', async () => {
      const blob = createAudioBlob();
      const reusableOptions = {
        prompt: 'Dungeons and Dragons session',
        model: TranscriptionModel.GPT4O_DIARIZE
      };

      // Call twice with the same options object
      await service.transcribe(blob, reusableOptions);
      await service.transcribe(blob, reusableOptions);

      // The prompt should still be present in the original options
      expect(reusableOptions.prompt).toBe('Dungeons and Dragons session');
    });

    it('should create synthetic fallback segment when diarization returns text but zero segments', async () => {
      // Simulate OpenAI returning text but empty segments (diarization fails silently)
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          text: 'The adventurers entered the dungeon.',
          segments: [],
          duration: 5.0
        })
      );

      const blob = createAudioBlob();
      const result = await service.transcribe(blob);

      // Should have created a single synthetic segment with the full text
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].text).toBe('The adventurers entered the dungeon.');
      expect(result.segments[0].speaker).toBe('Unknown');
      expect(result.segments[0].originalSpeaker).toBe('Unknown');
      expect(result.segments[0].start).toBe(0);
      expect(result.segments[0].end).toBe(5.0);

      // Should also have a speaker entry for 'Unknown'
      const unknownSpeaker = result.speakers.find(s => s.id === 'Unknown');
      expect(unknownSpeaker).toBeDefined();
      expect(unknownSpeaker.isMapped).toBe(false);
    });

    it('should use mapped name for synthetic fallback segment when speakerMap has Unknown key', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          text: 'A mysterious voice echoed.',
          segments: [],
          duration: 3.0
        })
      );

      const blob = createAudioBlob();
      const result = await service.transcribe(blob, {
        speakerMap: { 'Unknown': 'Narrator' }
      });

      // The fail-safe uses speakerMap['Unknown'] || 'Unknown'
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].speaker).toBe('Narrator');
      expect(result.segments[0].originalSpeaker).toBe('Unknown');
      expect(result.segments[0].start).toBe(0);
    });

    it('should enable multi-language tagging when mode is active', async () => {
      service.setMultiLanguageMode(true);

      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          text: 'Hola world',
          language: 'es',
          segments: [
            { speaker: 'SPEAKER_00', text: 'Hola', start: 0, end: 1, language: 'es' },
            { speaker: 'SPEAKER_01', text: 'world', start: 1, end: 2, language: 'en' }
          ]
        })
      );

      const blob = createAudioBlob();
      const result = await service.transcribe(blob);
      expect(result.segments[0].language).toBe('es');
    });
  });

  // ── Chunked transcription ──────────────────────────────────────────

  describe('chunked transcription', () => {
    it('should handle chunked transcription when needed', async () => {
      const { AudioChunker } = await import('../../scripts/audio/AudioChunker.mjs');
      const chunkerInstance = new AudioChunker();
      service._chunker = chunkerInstance;

      chunkerInstance.needsChunking.mockReturnValue(true);
      chunkerInstance.splitIfNeeded.mockResolvedValue([
        createAudioBlob(1024),
        createAudioBlob(1024)
      ]);

      const blob = createAudioBlob(50 * 1024 * 1024);
      const result = await service.transcribe(blob);
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });

    it('should call onProgress callback during chunked transcription', async () => {
      const { AudioChunker } = await import('../../scripts/audio/AudioChunker.mjs');
      const chunkerInstance = new AudioChunker();
      service._chunker = chunkerInstance;

      chunkerInstance.needsChunking.mockReturnValue(true);
      chunkerInstance.splitIfNeeded.mockResolvedValue([
        createAudioBlob(1024),
        createAudioBlob(1024)
      ]);

      const onProgress = vi.fn();
      const blob = createAudioBlob();
      await service.transcribe(blob, { onProgress });

      // Called at least once for each chunk plus completion
      expect(onProgress).toHaveBeenCalled();
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
      expect(lastCall.progress).toBe(100);
    });
  });

  // ── _combineChunkResults ──────────────────────────────────────────

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
      expect(combined.segments).toHaveLength(0);
    });

    it('should return empty result for empty array', () => {
      const combined = service._combineChunkResults([], new Set());
      expect(combined.text).toBe('');
      expect(combined.segments).toHaveLength(0);
    });

    it('should sort segments by start time', () => {
      const results = [
        { text: 'B', segments: [{ start: 5, end: 6 }] },
        { text: 'A', segments: [{ start: 0, end: 1 }] }
      ];
      const combined = service._combineChunkResults(results, new Set());
      expect(combined.segments[0].start).toBe(0);
      expect(combined.segments[1].start).toBe(5);
    });

    it('should include all speakers', () => {
      const speakers = new Set(['SPEAKER_00', 'SPEAKER_01']);
      const results = [{ text: 'hi', segments: [] }];
      const combined = service._combineChunkResults(results, speakers);
      expect(combined.speakers).toContain('SPEAKER_00');
      expect(combined.speakers).toContain('SPEAKER_01');
    });

    it('should handle results with missing segments', () => {
      const results = [
        { text: 'Hello' },
        { text: 'world', segments: [{ start: 1, end: 2 }] }
      ];
      const combined = service._combineChunkResults(results, new Set());
      expect(combined.segments).toHaveLength(1);
    });
  });

  // ── _mapSpeakersToNames ───────────────────────────────────────────

  describe('_mapSpeakersToNames', () => {
    it('should map speaker IDs to names', () => {
      const result = {
        text: 'Hello world',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 },
          { speaker: 'SPEAKER_01', text: 'world', start: 1, end: 2 }
        ]
      };
      const mapped = service._mapSpeakersToNames(result, {
        SPEAKER_00: 'Game Master',
        SPEAKER_01: 'Player 1'
      });
      expect(mapped.segments[0].speaker).toBe('Game Master');
      expect(mapped.segments[1].speaker).toBe('Player 1');
    });

    it('should preserve original speaker IDs', () => {
      const result = {
        text: 'Hello',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }]
      };
      const mapped = service._mapSpeakersToNames(result, { SPEAKER_00: 'GM' });
      expect(mapped.segments[0].originalSpeaker).toBe('SPEAKER_00');
    });

    it('should fall back to original ID when not mapped', () => {
      const result = {
        text: 'Hello',
        segments: [{ speaker: 'SPEAKER_02', text: 'Hello', start: 0, end: 1 }]
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.segments[0].speaker).toBe('SPEAKER_02');
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

    it('should handle segments without speaker field', () => {
      const result = {
        text: 'Hello',
        segments: [{ text: 'Hello', start: 0, end: 1 }]
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.segments[0].speaker).toBe('Unknown');
      expect(mapped.segments[0].originalSpeaker).toBe('Unknown');
    });

    it('should build speaker list with mapping info', () => {
      const result = {
        text: 'Hello',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 },
          { speaker: 'SPEAKER_01', text: 'World', start: 1, end: 2 }
        ]
      };
      const mapped = service._mapSpeakersToNames(result, { SPEAKER_00: 'GM' });
      expect(mapped.speakers).toHaveLength(2);
      const gmSpeaker = mapped.speakers.find(s => s.id === 'SPEAKER_00');
      expect(gmSpeaker.name).toBe('GM');
      expect(gmSpeaker.isMapped).toBe(true);
      const unmappedSpeaker = mapped.speakers.find(s => s.id === 'SPEAKER_01');
      expect(unmappedSpeaker.isMapped).toBe(false);
    });

    it('should preserve language on segments if present', () => {
      const result = {
        text: 'Hola',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hola', start: 0, end: 1, language: 'es' }]
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.segments[0].language).toBe('es');
    });

    it('should preserve chunking metadata', () => {
      const result = {
        text: 'Hello',
        segments: [],
        chunked: true,
        chunkCount: 3
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.chunked).toBe(true);
      expect(mapped.chunkCount).toBe(3);
    });

    it('should include raw result', () => {
      const result = {
        text: 'Hello',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }]
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.raw).toBe(result);
    });

    it('should handle empty speakerMap', () => {
      const result = {
        text: 'Hello',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }]
      };
      const mapped = service._mapSpeakersToNames(result);
      expect(mapped.segments[0].speaker).toBe('SPEAKER_00');
    });

    it('should preserve start=0 without replacing it (nullish coalescing fix)', () => {
      const result = {
        text: 'Hello',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1.5 }]
      };
      const mapped = service._mapSpeakersToNames(result, {});
      // start=0 is a valid timestamp — it must NOT be replaced by a default.
      // The old bug was `segment.start || 0` which treated 0 as falsy.
      // The fix uses `segment.start ?? 0` which only replaces null/undefined.
      expect(mapped.segments[0].start).toBe(0);
      expect(mapped.segments[0].end).toBe(1.5);
    });

    it('should default start to 0 when start is undefined', () => {
      const result = {
        text: 'Hello',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', end: 2.0 }]
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.segments[0].start).toBe(0);
    });

    it('should default start to 0 when start is null', () => {
      const result = {
        text: 'Hello',
        segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: null, end: 2.0 }]
      };
      const mapped = service._mapSpeakersToNames(result, {});
      expect(mapped.segments[0].start).toBe(0);
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

  // ── Language management ─────────────────────────────────────────────

  describe('language management', () => {
    it('should set language', () => {
      service.setLanguage('fr');
      expect(service.getLanguage()).toBe('fr');
    });

    it('should clear language with null', () => {
      service.setLanguage('fr');
      service.setLanguage(null);
      expect(service.getLanguage()).toBe(null);
    });
  });

  // ── Multi-language mode ────────────────────────────────────────────

  describe('multi-language mode', () => {
    it('should enable multi-language mode', () => {
      service.setMultiLanguageMode(true);
      expect(service.isMultiLanguageMode()).toBe(true);
    });

    it('should disable multi-language mode', () => {
      service.setMultiLanguageMode(true);
      service.setMultiLanguageMode(false);
      expect(service.isMultiLanguageMode()).toBe(false);
    });

    it('should only accept true for enabling', () => {
      service.setMultiLanguageMode('yes');
      expect(service.isMultiLanguageMode()).toBe(false);
    });
  });

  // ── _tagSegmentsWithLanguage ──────────────────────────────────────

  describe('_tagSegmentsWithLanguage', () => {
    it('should tag segments with language', () => {
      const result = {
        language: 'en',
        segments: [
          { speaker: 'GM', text: 'Hello', language: 'en' },
          { speaker: 'Player', text: 'Hola', language: 'es' }
        ]
      };
      const tagged = service._tagSegmentsWithLanguage(result);
      expect(tagged.segments[0].speaker).toBe('GM (en)');
      expect(tagged.segments[1].speaker).toBe('Player (es)');
    });

    it('should fall back to result-level language', () => {
      const result = {
        language: 'en',
        segments: [{ speaker: 'GM', text: 'Hello' }]
      };
      const tagged = service._tagSegmentsWithLanguage(result);
      expect(tagged.segments[0].speaker).toBe('GM (en)');
      expect(tagged.segments[0].language).toBe('en');
    });

    it('should return unchanged result with empty segments', () => {
      const result = { segments: [] };
      const tagged = service._tagSegmentsWithLanguage(result);
      expect(tagged).toEqual(result);
    });

    it('should return unchanged result with no segments', () => {
      const result = { text: 'Hello' };
      const tagged = service._tagSegmentsWithLanguage(result);
      expect(tagged).toEqual(result);
    });

    it('should not modify speaker if no language available', () => {
      const result = {
        segments: [{ speaker: 'GM', text: 'Hello' }]
      };
      const tagged = service._tagSegmentsWithLanguage(result);
      expect(tagged.segments[0].speaker).toBe('GM');
    });
  });

  // ── Circuit breaker ────────────────────────────────────────────────

  describe('circuit breaker', () => {
    it('should open circuit after max consecutive errors', async () => {
      const svc = new TranscriptionService('sk-test', {
        maxConsecutiveErrors: 2,
        retryEnabled: false
      });
      svc._rateLimiter.executeWithRetry = async (fn) => fn();

      fetchSpy.mockRejectedValue(new Error('fail'));

      const blob = createAudioBlob();
      await expect(svc.transcribe(blob)).rejects.toThrow();
      await expect(svc.transcribe(blob)).rejects.toThrow();

      // Third call should fail fast with circuit breaker
      await expect(svc.transcribe(blob)).rejects.toThrow('Circuit breaker');
    });

    it('should report open circuit status', () => {
      service._circuitOpen = true;
      service._consecutiveErrors = 5;
      const status = service.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(true);
      expect(status.consecutiveErrors).toBe(5);
    });

    it('should reset circuit breaker', () => {
      service._circuitOpen = true;
      service._consecutiveErrors = 5;
      service.resetCircuitBreaker();
      const status = service.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(false);
      expect(status.consecutiveErrors).toBe(0);
    });

    it('should throw when circuit is open', async () => {
      service._circuitOpen = true;
      const blob = createAudioBlob();
      await expect(service.transcribe(blob)).rejects.toThrow('Circuit breaker');
    });
  });

  // ── transcribeBasic ────────────────────────────────────────────────

  describe('transcribeBasic', () => {
    it('should transcribe with whisper model', async () => {
      const blob = createAudioBlob();
      const result = await service.transcribeBasic(blob);
      expect(result).toBeDefined();
    });

    it('should use provided language', async () => {
      const blob = createAudioBlob();
      await service.transcribeBasic(blob, 'de');
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should use default language when none provided', async () => {
      service.setLanguage('it');
      const blob = createAudioBlob();
      await service.transcribeBasic(blob);
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  // ── Static methods ─────────────────────────────────────────────────

  describe('static methods', () => {
    it('should return supported languages', () => {
      const langs = TranscriptionService.getSupportedLanguages();
      expect(Array.isArray(langs)).toBe(true);
      expect(langs.length).toBeGreaterThan(0);
      expect(langs[0].code).toBe('');
      expect(langs[0].name).toBe('Auto-detect');
      const english = langs.find(l => l.code === 'en');
      expect(english).toBeDefined();
    });

    it('should return available models', () => {
      const models = TranscriptionService.getAvailableModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models).toHaveLength(3);
      const diarize = models.find(m => m.supportsDiarization);
      expect(diarize).toBeDefined();
      expect(diarize.id).toBe(TranscriptionModel.GPT4O_DIARIZE);
    });
  });

  // ── estimateCost ──────────────────────────────────────────────────

  describe('estimateCost', () => {
    it('should estimate cost for audio blob', () => {
      const blob = createAudioBlob();
      const estimate = service.estimateCost(blob);
      expect(estimate.estimatedDurationSeconds).toBeDefined();
      expect(estimate.estimatedDurationMinutes).toBeDefined();
      expect(estimate.estimatedCostUSD).toBeDefined();
      expect(estimate.model).toBe(TranscriptionModel.GPT4O_DIARIZE);
      expect(estimate.pricePerMinute).toBe(0.006);
    });

    it('should use custom model for estimate', () => {
      const blob = createAudioBlob();
      const estimate = service.estimateCost(blob, TranscriptionModel.WHISPER);
      expect(estimate.model).toBe(TranscriptionModel.WHISPER);
    });

    it('should calculate cost based on duration', () => {
      const blob = createAudioBlob();
      const estimate = service.estimateCost(blob);
      // AudioUtils.estimateDuration returns 300 (5 minutes)
      expect(estimate.estimatedDurationMinutes).toBe(5);
      expect(estimate.estimatedCostUSD).toBeCloseTo(0.03, 4);
    });
  });
});
