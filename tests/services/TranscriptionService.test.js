/**
 * TranscriptionService Unit Tests
 *
 * Tests for the TranscriptionService class with API mocking.
 * Covers transcription, speaker mapping, chunking, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global game object for Foundry VTT
globalThis.game = {
  settings: {
    get: vi.fn(() => ({
      character_names: [],
      location_names: [],
      items: [],
      terms: [],
      custom: []
    })),
    set: vi.fn(() => Promise.resolve())
  }
};

// Mock Logger before importing TranscriptionService
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
      getStats: vi.fn(() => ({}))
    })
  }
}));

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock VocabularyDictionary
vi.mock('../../scripts/core/VocabularyDictionary.mjs', () => ({
  VocabularyDictionary: vi.fn().mockImplementation(() => ({
    generatePrompt: vi.fn(() => 'Fireball, Magic Missile, Dragon, Mind Flayer'),
    initialize: vi.fn(() => Promise.resolve()),
    addTerm: vi.fn((category, term) => Promise.resolve(true)),
    removeTerm: vi.fn((category, term) => Promise.resolve(true)),
    getTerms: vi.fn((category) => []),
    getAllTerms: vi.fn(() => ({
      character_names: [],
      location_names: [],
      items: [],
      terms: ['Fireball', 'Magic Missile', 'Dragon'],
      custom: []
    })),
    exportDictionary: vi.fn(() => ({})),
    importDictionary: vi.fn(() => Promise.resolve())
  })),
  VocabularyCategory: {
    CHARACTER_NAMES: 'character_names',
    LOCATION_NAMES: 'location_names',
    ITEMS: 'items',
    TERMS: 'terms',
    CUSTOM: 'custom'
  }
}));

// Mock DND_VOCABULARY (needed by VocabularyDictionary)
vi.mock('../../scripts/data/dnd-vocabulary.mjs', () => ({
  DND_VOCABULARY: {
    spells: ['Fireball', 'Magic Missile', 'Fireball'],
    creatures: ['Dragon', 'Goblin', 'Mind Flayer'],
    classes: ['Wizard', 'Fighter', 'Paladin'],
    conditions: ['Prone', 'Stunned', 'Paralyzed'],
    abilities: ['Strength', 'Dexterity', 'Constitution']
  }
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
    AudioChunker: vi.fn(function() {
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

// Import after mocks are set up
import { TranscriptionService, TranscriptionModel, TranscriptionResponseFormat, ChunkingStrategy } from '../../scripts/ai/TranscriptionService.mjs';
import { OpenAIError, OpenAIErrorType } from '../../scripts/ai/OpenAIClient.mjs';
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
 * Create a mock API response for transcription
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

describe('TranscriptionService', () => {
  let service;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create service instance
    service = new TranscriptionService('test-api-key-12345');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with API key', () => {
      expect(service).toBeInstanceOf(TranscriptionService);
      expect(service.isConfigured).toBe(true);
    });

    it('should accept configuration options', () => {
      const options = {
        defaultLanguage: 'it',
        defaultSpeakerMap: { 'SPEAKER_00': 'GM' },
        timeout: 300000
      };

      const customService = new TranscriptionService('test-key', options);
      expect(customService.getLanguage()).toBe('it');
      expect(customService.getSpeakerMap()).toEqual({ 'SPEAKER_00': 'GM' });
    });

    it('should throw error if API key is missing', () => {
      const noKeyService = new TranscriptionService('');
      expect(noKeyService.isConfigured).toBe(false);
    });
  });

  describe('transcribe', () => {
    it('should send correct FormData to API', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.transcribe(audioBlob);

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/audio/transcriptions');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);

      // Verify FormData contents
      const formData = options.body;
      expect(formData.get('model')).toBe(TranscriptionModel.GPT4O_DIARIZE);
      expect(formData.get('response_format')).toBe(TranscriptionResponseFormat.DIARIZED_JSON);
      expect(formData.get('chunking_strategy')).toBe(ChunkingStrategy.AUTO);
    });

    it('should include language when specified', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.transcribe(audioBlob, { language: 'it' });

      const formData = mockFetch.mock.calls[0][1].body;
      expect(formData.get('language')).toBe('it');
    });

    it('should include prompt when specified', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.transcribe(audioBlob, { prompt: 'RPG session context' });

      const formData = mockFetch.mock.calls[0][1].body;
      expect(formData.get('prompt')).toBe('RPG session context');
    });

    it('should return parsed transcription result', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.transcribe(audioBlob);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('segments');
      expect(result).toHaveProperty('speakers');
      expect(result.text).toBe('Hello, this is a test transcription.');
      expect(result.segments).toHaveLength(2);
    });

    it('should throw error for invalid audio input', async () => {
      await expect(service.transcribe(null)).rejects.toThrow(OpenAIError);
      await expect(service.transcribe('not-a-blob')).rejects.toThrow(OpenAIError);
    });

    it('should handle API errors gracefully', async () => {
      const audioBlob = createMockAudioBlob(1024);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key' } })),
        headers: new Headers()
      });

      await expect(service.transcribe(audioBlob)).rejects.toThrow();
    });
  });

  describe('speaker mapping', () => {
    it('should map speaker IDs to names', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const speakerMap = {
        'SPEAKER_00': 'Game Master',
        'SPEAKER_01': 'Player 1'
      };

      const result = await service.transcribe(audioBlob, { speakerMap });

      expect(result.segments[0].speaker).toBe('Game Master');
      expect(result.segments[0].originalSpeaker).toBe('SPEAKER_00');
      expect(result.segments[1].speaker).toBe('Player 1');
      expect(result.segments[1].originalSpeaker).toBe('SPEAKER_01');
    });

    it('should preserve original speaker ID when not mapped', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Only map one speaker
      const speakerMap = { 'SPEAKER_00': 'GM' };

      const result = await service.transcribe(audioBlob, { speakerMap });

      expect(result.segments[0].speaker).toBe('GM');
      expect(result.segments[1].speaker).toBe('SPEAKER_01'); // Unmapped, keeps original
    });

    it('should build speakers list with mapping info', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const speakerMap = { 'SPEAKER_00': 'GM' };
      const result = await service.transcribe(audioBlob, { speakerMap });

      expect(result.speakers).toHaveLength(2);

      const gmSpeaker = result.speakers.find(s => s.id === 'SPEAKER_00');
      expect(gmSpeaker.name).toBe('GM');
      expect(gmSpeaker.isMapped).toBe(true);

      const unmappedSpeaker = result.speakers.find(s => s.id === 'SPEAKER_01');
      expect(unmappedSpeaker.name).toBe('SPEAKER_01');
      expect(unmappedSpeaker.isMapped).toBe(false);
    });

    it('should use default speaker map from constructor', async () => {
      const customService = new TranscriptionService('test-key', {
        defaultSpeakerMap: { 'SPEAKER_00': 'Default GM' }
      });

      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await customService.transcribe(audioBlob);

      expect(result.segments[0].speaker).toBe('Default GM');
    });
  });

  describe('setSpeakerMap and getSpeakerMap', () => {
    it('should update and retrieve speaker map', () => {
      const speakerMap = {
        'SPEAKER_00': 'GM',
        'SPEAKER_01': 'Fighter',
        'SPEAKER_02': 'Wizard'
      };

      service.setSpeakerMap(speakerMap);
      expect(service.getSpeakerMap()).toEqual(speakerMap);
    });

    it('should clear speaker map with null', () => {
      service.setSpeakerMap({ 'SPEAKER_00': 'GM' });
      service.setSpeakerMap(null);
      expect(service.getSpeakerMap()).toEqual({});
    });
  });

  describe('setLanguage and getLanguage', () => {
    it('should update and retrieve language', () => {
      service.setLanguage('it');
      expect(service.getLanguage()).toBe('it');
    });

    it('should clear language with null', () => {
      service.setLanguage('en');
      service.setLanguage(null);
      expect(service.getLanguage()).toBeNull();
    });
  });

  describe('transcribeBasic', () => {
    it('should use Whisper model without diarization', async () => {
      const audioBlob = createMockAudioBlob(1024);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'Basic transcription' })
      });

      await service.transcribeBasic(audioBlob, 'en');

      const formData = mockFetch.mock.calls[0][1].body;
      expect(formData.get('model')).toBe(TranscriptionModel.WHISPER);
      expect(formData.get('response_format')).toBe(TranscriptionResponseFormat.JSON);
    });
  });

  describe('chunked transcription', () => {
    it('should split large audio and combine results', async () => {
      // Create large audio blob that needs chunking
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024); // 30MB

      // Configure AudioChunker mock to indicate chunking is needed
      const chunkerInstance = new AudioChunker();
      chunkerInstance.needsChunking.mockReturnValue(true);
      chunkerInstance.getChunkingInfo.mockReturnValue({
        totalSize: largeBlob.size,
        totalSizeMB: 30,
        needsChunking: true,
        estimatedChunkCount: 2
      });

      // Return two chunks
      const chunk1 = createMockAudioBlob(15 * 1024 * 1024);
      const chunk2 = createMockAudioBlob(15 * 1024 * 1024);
      chunkerInstance.splitIfNeeded.mockResolvedValue([chunk1, chunk2]);

      // Create service with mocked chunker
      const chunkedService = new TranscriptionService('test-key');
      chunkedService._chunker = chunkerInstance;

      // Mock API responses for each chunk
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            text: 'First part.',
            segments: [{ speaker: 'SPEAKER_00', text: 'First part.', start: 0, end: 2 }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            text: 'Second part.',
            segments: [{ speaker: 'SPEAKER_00', text: 'Second part.', start: 0, end: 2 }]
          })
        });

      const result = await chunkedService.transcribe(largeBlob);

      // Should have made two API calls
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Results should be combined
      expect(result.text).toContain('First part.');
      expect(result.text).toContain('Second part.');
      expect(result.chunked).toBe(true);
      expect(result.chunkCount).toBe(2);
    });

    it('should report progress during chunked transcription', async () => {
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024);

      const chunkerInstance = new AudioChunker();
      chunkerInstance.needsChunking.mockReturnValue(true);
      chunkerInstance.getChunkingInfo.mockReturnValue({
        totalSize: largeBlob.size,
        totalSizeMB: 30,
        needsChunking: true,
        estimatedChunkCount: 2
      });

      const chunk1 = createMockAudioBlob(15 * 1024 * 1024);
      const chunk2 = createMockAudioBlob(15 * 1024 * 1024);
      chunkerInstance.splitIfNeeded.mockResolvedValue([chunk1, chunk2]);

      const chunkedService = new TranscriptionService('test-key');
      chunkedService._chunker = chunkerInstance;

      mockFetch
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            text: 'Part.',
            segments: [{ speaker: 'SPEAKER_00', text: 'Part.', start: 0, end: 1 }]
          })
        });

      const progressCallback = vi.fn();

      await chunkedService.transcribe(largeBlob, { onProgress: progressCallback });

      // Progress should be reported for each chunk plus completion
      expect(progressCallback).toHaveBeenCalledTimes(3);
      expect(progressCallback).toHaveBeenCalledWith(expect.objectContaining({
        currentChunk: 1,
        totalChunks: 2
      }));
    });
  });

  describe('static methods', () => {
    it('getSupportedLanguages returns language list', () => {
      const languages = TranscriptionService.getSupportedLanguages();

      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);

      // Check structure
      const english = languages.find(l => l.code === 'en');
      expect(english).toBeDefined();
      expect(english.name).toBe('English');

      // Auto-detect should be included
      const autoDetect = languages.find(l => l.code === '');
      expect(autoDetect).toBeDefined();
      expect(autoDetect.name).toBe('Auto-detect');
    });

    it('getAvailableModels returns model list', () => {
      const models = TranscriptionService.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBe(3);

      // Check diarization model
      const diarizeModel = models.find(m => m.id === TranscriptionModel.GPT4O_DIARIZE);
      expect(diarizeModel).toBeDefined();
      expect(diarizeModel.supportsDiarization).toBe(true);

      // Check Whisper model
      const whisperModel = models.find(m => m.id === TranscriptionModel.WHISPER);
      expect(whisperModel).toBeDefined();
      expect(whisperModel.supportsDiarization).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost estimate based on audio size', () => {
      // 1 minute of audio at ~128kbps = ~960KB
      const oneMinuteBlob = createMockAudioBlob(960 * 1024, 'audio/webm');

      const estimate = service.estimateCost(oneMinuteBlob);

      expect(estimate).toHaveProperty('estimatedDurationSeconds');
      expect(estimate).toHaveProperty('estimatedDurationMinutes');
      expect(estimate).toHaveProperty('estimatedCostUSD');
      expect(estimate).toHaveProperty('model');
      expect(estimate).toHaveProperty('pricePerMinute');
      expect(estimate.pricePerMinute).toBe(0.006);
    });
  });

  describe('response handling', () => {
    it('should handle empty segments gracefully', async () => {
      const audioBlob = createMockAudioBlob(1024);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          text: 'Transcribed text without segments.'
        })
      });

      const result = await service.transcribe(audioBlob);

      expect(result.text).toBe('Transcribed text without segments.');
      expect(result.segments).toEqual([]);
      expect(result.speakers).toEqual([]);
    });

    it('should include raw response in result', async () => {
      const audioBlob = createMockAudioBlob(1024);
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.transcribe(audioBlob);

      expect(result.raw).toBeDefined();
      expect(result.raw.text).toBe(mockResponse.text);
    });

    it('should handle null response gracefully', async () => {
      const audioBlob = createMockAudioBlob(1024);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null)
      });

      const result = await service.transcribe(audioBlob);

      expect(result.text).toBe('');
      expect(result.segments).toEqual([]);
    });
  });

  describe('exported constants', () => {
    it('should export TranscriptionModel enum', () => {
      expect(TranscriptionModel.GPT4O_DIARIZE).toBe('gpt-4o-transcribe-diarize');
      expect(TranscriptionModel.GPT4O).toBe('gpt-4o-transcribe');
      expect(TranscriptionModel.WHISPER).toBe('whisper-1');
    });

    it('should export TranscriptionResponseFormat enum', () => {
      expect(TranscriptionResponseFormat.DIARIZED_JSON).toBe('diarized_json');
      expect(TranscriptionResponseFormat.JSON).toBe('json');
      expect(TranscriptionResponseFormat.TEXT).toBe('text');
      expect(TranscriptionResponseFormat.SRT).toBe('srt');
      expect(TranscriptionResponseFormat.VTT).toBe('vtt');
    });

    it('should export ChunkingStrategy enum', () => {
      expect(ChunkingStrategy.AUTO).toBe('auto');
      expect(ChunkingStrategy.NONE).toBe('none');
    });
  });
});
