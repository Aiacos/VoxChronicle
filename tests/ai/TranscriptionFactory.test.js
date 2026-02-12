/**
 * TranscriptionFactory Unit Tests
 *
 * Tests for the TranscriptionFactory class with mocking.
 * Covers factory methods, mode selection, auto-fallback, and error handling.
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

// Mock Logger before importing TranscriptionFactory
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

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
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

// Mock VocabularyDictionary
vi.mock('../../scripts/core/VocabularyDictionary.mjs', () => ({
  VocabularyDictionary: vi.fn().mockImplementation(() => ({
    generatePrompt: vi.fn(() => 'Fireball, Magic Missile, Dragon, Mind Flayer'),
    initialize: vi.fn(() => Promise.resolve()),
    addTerm: vi.fn((_category, _term) => Promise.resolve(true)),
    removeTerm: vi.fn((_category, _term) => Promise.resolve(true)),
    getTerms: vi.fn((_category) => []),
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

// Mock DND_VOCABULARY
vi.mock('../../scripts/data/dnd-vocabulary.mjs', () => ({
  DND_VOCABULARY: {
    spells: ['Fireball', 'Magic Missile'],
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
    AudioChunker: vi.fn(function () {
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

// Mock TranscriptionService
vi.mock('../../scripts/ai/TranscriptionService.mjs', () => ({
  TranscriptionService: vi.fn(function (apiKey, options = {}) {
    this.apiKey = apiKey;
    this.options = options;
    this.isConfigured = Boolean(apiKey);
    this.transcribe = vi.fn();
    this.transcribeChunks = vi.fn();
    this._type = 'TranscriptionService';
  }),
  TranscriptionModel: {
    GPT4O_AUDIO: 'gpt-4o-audio-preview',
    WHISPER_1: 'whisper-1'
  },
  TranscriptionResponseFormat: {
    JSON: 'json',
    TEXT: 'text',
    SRT: 'srt',
    VERBOSE_JSON: 'verbose_json',
    VTT: 'vtt',
    DIARIZED_JSON: 'diarized_json'
  },
  ChunkingStrategy: {
    NONE: 'none',
    AUTO: 'auto',
    FIXED_SIZE: 'fixed_size',
    FIXED_DURATION: 'fixed_duration'
  }
}));

// Mock LocalWhisperService
vi.mock('../../scripts/ai/LocalWhisperService.mjs', () => ({
  LocalWhisperService: vi.fn(function (backendUrl, options = {}) {
    this.backendUrl = backendUrl;
    this.options = options;
    this.healthCheck = vi.fn(() => Promise.resolve(true));
    this.transcribe = vi.fn();
    this._type = 'LocalWhisperService';
  }),
  LocalWhisperResponseFormat: {
    JSON: 'json',
    VERBOSE_JSON: 'verbose_json',
    TEXT: 'text',
    SRT: 'srt',
    VTT: 'vtt'
  }
}));

// Mock WhisperBackend
vi.mock('../../scripts/ai/WhisperBackend.mjs', () => ({
  WhisperBackend: vi.fn(),
  WhisperError: class WhisperError extends Error {
    constructor(message, type, statusCode) {
      super(message);
      this.type = type;
      this.statusCode = statusCode;
    }
  },
  WhisperErrorType: {
    NETWORK: 'network',
    TIMEOUT: 'timeout',
    SERVER: 'server',
    INVALID_RESPONSE: 'invalid_response',
    UNSUPPORTED_FORMAT: 'unsupported_format',
    CONFIGURATION: 'configuration'
  }
}));

// Import after mocks are set up
import { TranscriptionFactory, TranscriptionMode } from '../../scripts/ai/TranscriptionFactory.mjs';
import { TranscriptionService } from '../../scripts/ai/TranscriptionService.mjs';
import { LocalWhisperService } from '../../scripts/ai/LocalWhisperService.mjs';

describe('TranscriptionFactory', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TranscriptionMode', () => {
    it('should export mode constants', () => {
      expect(TranscriptionMode.API).toBe('api');
      expect(TranscriptionMode.LOCAL).toBe('local');
      expect(TranscriptionMode.AUTO).toBe('auto');
    });
  });

  describe('create()', () => {
    describe('validation', () => {
      it('should throw error if config is missing', async () => {
        await expect(TranscriptionFactory.create()).rejects.toThrow(
          'TranscriptionFactory.create() requires a configuration object'
        );
      });

      it('should throw error if config is not an object', async () => {
        await expect(TranscriptionFactory.create('invalid')).rejects.toThrow(
          'TranscriptionFactory.create() requires a configuration object'
        );
      });

      it('should throw error if config is null', async () => {
        await expect(TranscriptionFactory.create(null)).rejects.toThrow(
          'TranscriptionFactory.create() requires a configuration object'
        );
      });
    });

    describe('API mode', () => {
      it('should create TranscriptionService in API mode', async () => {
        const service = await TranscriptionFactory.create({
          mode: 'api',
          openaiApiKey: 'test-api-key'
        });

        expect(service._type).toBe('TranscriptionService');
        expect(TranscriptionService).toHaveBeenCalledWith('test-api-key', {});
      });

      it('should pass options to TranscriptionService', async () => {
        const options = {
          defaultLanguage: 'it',
          defaultSpeakerMap: { SPEAKER_00: 'GM' }
        };

        await TranscriptionFactory.create({
          mode: 'api',
          openaiApiKey: 'test-api-key',
          options
        });

        expect(TranscriptionService).toHaveBeenCalledWith('test-api-key', options);
      });

      it('should throw error if API key is missing', async () => {
        await expect(
          TranscriptionFactory.create({
            mode: 'api'
          })
        ).rejects.toThrow('OpenAI API key is required for API transcription mode');
      });

      it('should use API mode as default if mode not specified', async () => {
        const service = await TranscriptionFactory.create({
          openaiApiKey: 'test-api-key'
        });

        expect(service._type).toBe('TranscriptionService');
      });
    });

    describe('LOCAL mode', () => {
      it('should create LocalWhisperService in LOCAL mode', async () => {
        const service = await TranscriptionFactory.create({
          mode: 'local',
          whisperBackendUrl: 'http://localhost:8080'
        });

        expect(service._type).toBe('LocalWhisperService');
        expect(LocalWhisperService).toHaveBeenCalledWith('http://localhost:8080', {});
      });

      it('should pass options to LocalWhisperService', async () => {
        const options = {
          defaultLanguage: 'en',
          timeout: 120000
        };

        await TranscriptionFactory.create({
          mode: 'local',
          whisperBackendUrl: 'http://localhost:8080',
          options
        });

        expect(LocalWhisperService).toHaveBeenCalledWith('http://localhost:8080', options);
      });

      it('should throw error if backend URL is missing', async () => {
        await expect(
          TranscriptionFactory.create({
            mode: 'local'
          })
        ).rejects.toThrow('Whisper backend URL is required for local transcription mode');
      });
    });

    describe('AUTO mode', () => {
      it('should use local service if available', async () => {
        const service = await TranscriptionFactory.create({
          mode: 'auto',
          openaiApiKey: 'test-api-key',
          whisperBackendUrl: 'http://localhost:8080'
        });

        expect(service._type).toBe('LocalWhisperService');
        expect(LocalWhisperService).toHaveBeenCalledWith('http://localhost:8080', {});
        expect(service.healthCheck).toHaveBeenCalledWith({
          timeout: 3000,
          useCache: false
        });
      });

      it('should fallback to API if local health check fails', async () => {
        // Mock health check to fail
        vi.mocked(LocalWhisperService).mockImplementationOnce(function (backendUrl, options = {}) {
          this.backendUrl = backendUrl;
          this.options = options;
          this.healthCheck = vi.fn(() => Promise.resolve(false));
          this._type = 'LocalWhisperService';
        });

        const service = await TranscriptionFactory.create({
          mode: 'auto',
          openaiApiKey: 'test-api-key',
          whisperBackendUrl: 'http://localhost:8080'
        });

        expect(service._type).toBe('TranscriptionService');
        expect(TranscriptionService).toHaveBeenCalledWith('test-api-key', {});
      });

      it('should fallback to API if local service throws error', async () => {
        // Mock health check to throw error
        vi.mocked(LocalWhisperService).mockImplementationOnce(function (backendUrl, options = {}) {
          this.backendUrl = backendUrl;
          this.options = options;
          this.healthCheck = vi.fn(() => Promise.reject(new Error('Connection failed')));
          this._type = 'LocalWhisperService';
        });

        const service = await TranscriptionFactory.create({
          mode: 'auto',
          openaiApiKey: 'test-api-key',
          whisperBackendUrl: 'http://localhost:8080'
        });

        expect(service._type).toBe('TranscriptionService');
      });

      it('should fallback to API if backend URL is missing', async () => {
        const service = await TranscriptionFactory.create({
          mode: 'auto',
          openaiApiKey: 'test-api-key'
        });

        expect(service._type).toBe('TranscriptionService');
        expect(LocalWhisperService).not.toHaveBeenCalled();
      });

      it('should throw error if both local and API are unavailable', async () => {
        // Mock health check to fail
        vi.mocked(LocalWhisperService).mockImplementationOnce(function (backendUrl, options = {}) {
          this.backendUrl = backendUrl;
          this.options = options;
          this.healthCheck = vi.fn(() => Promise.resolve(false));
          this._type = 'LocalWhisperService';
        });

        await expect(
          TranscriptionFactory.create({
            mode: 'auto',
            whisperBackendUrl: 'http://localhost:8080'
          })
        ).rejects.toThrow(
          'Auto mode failed: local backend unavailable and no OpenAI API key configured'
        );
      });

      it('should pass options to both services during auto mode', async () => {
        const options = {
          defaultLanguage: 'it',
          timeout: 60000
        };

        await TranscriptionFactory.create({
          mode: 'auto',
          openaiApiKey: 'test-api-key',
          whisperBackendUrl: 'http://localhost:8080',
          options
        });

        expect(LocalWhisperService).toHaveBeenCalledWith('http://localhost:8080', options);
      });
    });

    describe('unknown mode handling', () => {
      it('should fallback to API mode for unknown mode', async () => {
        const service = await TranscriptionFactory.create({
          mode: 'unknown-mode',
          openaiApiKey: 'test-api-key'
        });

        expect(service._type).toBe('TranscriptionService');
      });

      it('should throw error if unknown mode and no API key', async () => {
        await expect(
          TranscriptionFactory.create({
            mode: 'unknown-mode'
          })
        ).rejects.toThrow('OpenAI API key is required for API transcription mode');
      });
    });
  });

  describe('checkLocalBackend()', () => {
    it('should return true if backend is healthy', async () => {
      const isAvailable = await TranscriptionFactory.checkLocalBackend('http://localhost:8080');

      expect(isAvailable).toBe(true);
      expect(LocalWhisperService).toHaveBeenCalledWith('http://localhost:8080');
    });

    it('should return false if backend URL is missing', async () => {
      const isAvailable = await TranscriptionFactory.checkLocalBackend('');

      expect(isAvailable).toBe(false);
      expect(LocalWhisperService).not.toHaveBeenCalled();
    });

    it('should return false if backend URL is null', async () => {
      const isAvailable = await TranscriptionFactory.checkLocalBackend(null);

      expect(isAvailable).toBe(false);
    });

    it('should return false if health check fails', async () => {
      // Mock health check to fail
      vi.mocked(LocalWhisperService).mockImplementationOnce(function (backendUrl) {
        this.backendUrl = backendUrl;
        this.healthCheck = vi.fn(() => Promise.resolve(false));
      });

      const isAvailable = await TranscriptionFactory.checkLocalBackend('http://localhost:8080');

      expect(isAvailable).toBe(false);
    });

    it('should return false if health check throws error', async () => {
      // Mock health check to throw error
      vi.mocked(LocalWhisperService).mockImplementationOnce(function (backendUrl) {
        this.backendUrl = backendUrl;
        this.healthCheck = vi.fn(() => Promise.reject(new Error('Connection timeout')));
      });

      const isAvailable = await TranscriptionFactory.checkLocalBackend('http://localhost:8080');

      expect(isAvailable).toBe(false);
    });

    it('should pass options to health check', async () => {
      const mockHealthCheck = vi.fn(() => Promise.resolve(true));
      vi.mocked(LocalWhisperService).mockImplementationOnce(function (backendUrl) {
        this.backendUrl = backendUrl;
        this.healthCheck = mockHealthCheck;
      });

      const options = { timeout: 5000, useCache: true };
      await TranscriptionFactory.checkLocalBackend('http://localhost:8080', options);

      expect(mockHealthCheck).toHaveBeenCalledWith(options);
    });
  });

  describe('getRecommendedMode()', () => {
    it('should recommend AUTO if both API key and backend URL are available', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        openaiApiKey: 'test-api-key',
        whisperBackendUrl: 'http://localhost:8080'
      });

      expect(mode).toBe(TranscriptionMode.AUTO);
    });

    it('should recommend LOCAL if only backend URL is available', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        whisperBackendUrl: 'http://localhost:8080'
      });

      expect(mode).toBe(TranscriptionMode.LOCAL);
    });

    it('should recommend API if only API key is available', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        openaiApiKey: 'test-api-key'
      });

      expect(mode).toBe(TranscriptionMode.API);
    });

    it('should default to API if neither is available', () => {
      const mode = TranscriptionFactory.getRecommendedMode({});

      expect(mode).toBe(TranscriptionMode.API);
    });

    it('should ignore empty string API key', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        openaiApiKey: '',
        whisperBackendUrl: 'http://localhost:8080'
      });

      expect(mode).toBe(TranscriptionMode.LOCAL);
    });

    it('should ignore empty string backend URL', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        openaiApiKey: 'test-api-key',
        whisperBackendUrl: ''
      });

      expect(mode).toBe(TranscriptionMode.API);
    });
  });

  describe('getAvailableModes()', () => {
    it('should return array of mode descriptors', () => {
      const modes = TranscriptionFactory.getAvailableModes();

      expect(Array.isArray(modes)).toBe(true);
      expect(modes).toHaveLength(3);
    });

    it('should include API mode descriptor', () => {
      const modes = TranscriptionFactory.getAvailableModes();
      const apiMode = modes.find((m) => m.id === TranscriptionMode.API);

      expect(apiMode).toBeDefined();
      expect(apiMode.name).toBe('API Only');
      expect(apiMode.requiresApiKey).toBe(true);
      expect(apiMode.requiresBackend).toBe(false);
      expect(apiMode.supportsOffline).toBe(false);
    });

    it('should include LOCAL mode descriptor', () => {
      const modes = TranscriptionFactory.getAvailableModes();
      const localMode = modes.find((m) => m.id === TranscriptionMode.LOCAL);

      expect(localMode).toBeDefined();
      expect(localMode.name).toBe('Local Whisper');
      expect(localMode.requiresApiKey).toBe(false);
      expect(localMode.requiresBackend).toBe(true);
      expect(localMode.supportsOffline).toBe(true);
    });

    it('should include AUTO mode descriptor', () => {
      const modes = TranscriptionFactory.getAvailableModes();
      const autoMode = modes.find((m) => m.id === TranscriptionMode.AUTO);

      expect(autoMode).toBeDefined();
      expect(autoMode.name).toBe('Auto (Local + API Fallback)');
      expect(autoMode.requiresApiKey).toBe(true);
      expect(autoMode.requiresBackend).toBe(true);
      expect(autoMode.supportsOffline).toBe(true);
    });

    it('should have descriptions for all modes', () => {
      const modes = TranscriptionFactory.getAvailableModes();

      modes.forEach((mode) => {
        expect(mode.description).toBeDefined();
        expect(typeof mode.description).toBe('string');
        expect(mode.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should create API service with full options', async () => {
      const options = {
        defaultLanguage: 'en',
        defaultSpeakerMap: {
          SPEAKER_00: 'Game Master',
          SPEAKER_01: 'Player 1'
        },
        timeout: 120000
      };

      const service = await TranscriptionFactory.create({
        mode: 'api',
        openaiApiKey: 'sk-test123',
        options
      });

      expect(service._type).toBe('TranscriptionService');
      expect(service.apiKey).toBe('sk-test123');
      expect(service.options).toEqual(options);
    });

    it('should create local service with full options', async () => {
      const options = {
        defaultLanguage: 'it',
        timeout: 60000
      };

      const service = await TranscriptionFactory.create({
        mode: 'local',
        whisperBackendUrl: 'http://whisper.local:9000',
        options
      });

      expect(service._type).toBe('LocalWhisperService');
      expect(service.backendUrl).toBe('http://whisper.local:9000');
      expect(service.options).toEqual(options);
    });

    it('should handle auto mode with successful local service', async () => {
      const mockHealthCheck = vi.fn(() => Promise.resolve(true));
      vi.mocked(LocalWhisperService).mockImplementationOnce(function (backendUrl, options = {}) {
        this.backendUrl = backendUrl;
        this.options = options;
        this.healthCheck = mockHealthCheck;
        this._type = 'LocalWhisperService';
      });

      const service = await TranscriptionFactory.create({
        mode: 'auto',
        openaiApiKey: 'sk-test123',
        whisperBackendUrl: 'http://localhost:8080',
        options: { defaultLanguage: 'en' }
      });

      expect(service._type).toBe('LocalWhisperService');
      expect(mockHealthCheck).toHaveBeenCalledWith({
        timeout: 3000,
        useCache: false
      });
    });

    it('should handle auto mode with failed local service fallback', async () => {
      vi.mocked(LocalWhisperService).mockImplementationOnce(function (backendUrl, options = {}) {
        this.backendUrl = backendUrl;
        this.options = options;
        this.healthCheck = vi.fn(() => Promise.reject(new Error('Network error')));
        this._type = 'LocalWhisperService';
      });

      const service = await TranscriptionFactory.create({
        mode: 'auto',
        openaiApiKey: 'sk-test123',
        whisperBackendUrl: 'http://localhost:8080'
      });

      expect(service._type).toBe('TranscriptionService');
      expect(service.apiKey).toBe('sk-test123');
    });
  });
});
