/**
 * Tests for TranscriptionFactory - Factory for Transcription Service Selection
 *
 * Covers: exports, create (api/local/auto/unknown modes), _createApiService,
 * _createLocalService, _createAutoService, checkLocalBackend,
 * getRecommendedMode, getAvailableModes, error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TranscriptionFactory, TranscriptionMode } from '../../scripts/ai/TranscriptionFactory.mjs';

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

// Hoisted mock for LocalWhisperService healthCheck
const localWhisperMocks = vi.hoisted(() => ({
  healthCheckResult: true,
  healthCheckThrows: false
}));

// Mock TranscriptionService
vi.mock('../../scripts/ai/TranscriptionService.mjs', () => {
  class MockTranscriptionService {
    constructor(provider, options = {}) {
      this.provider = provider;
      this.options = options;
      this.type = 'TranscriptionService';
    }
  }
  return { TranscriptionService: MockTranscriptionService };
});

// Mock LocalWhisperService
vi.mock('../../scripts/ai/LocalWhisperService.mjs', () => {
  class MockLocalWhisperService {
    constructor(backendUrl, options = {}) {
      this.backendUrl = backendUrl;
      this.options = options;
      this.type = 'LocalWhisperService';
    }
    async healthCheck() {
      if (localWhisperMocks.healthCheckThrows) {
        throw new Error('Health check failed');
      }
      return localWhisperMocks.healthCheckResult;
    }
  }
  return { LocalWhisperService: MockLocalWhisperService };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock TranscriptionProvider for tests */
function mockProvider() {
  return { transcribe: vi.fn(), type: 'MockProvider' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranscriptionFactory', () => {
  beforeEach(() => {
    localWhisperMocks.healthCheckResult = true;
    localWhisperMocks.healthCheckThrows = false;
  });

  // ── Exports ────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export TranscriptionFactory class', () => {
      expect(TranscriptionFactory).toBeDefined();
      expect(typeof TranscriptionFactory).toBe('function');
    });

    it('should export TranscriptionMode enum', () => {
      expect(TranscriptionMode.API).toBe('api');
      expect(TranscriptionMode.LOCAL).toBe('local');
      expect(TranscriptionMode.AUTO).toBe('auto');
    });
  });

  // ── create ─────────────────────────────────────────────────────────

  describe('create', () => {
    it('should throw for null config', async () => {
      await expect(TranscriptionFactory.create(null)).rejects.toThrow(
        'requires a configuration object'
      );
    });

    it('should throw for non-object config', async () => {
      await expect(TranscriptionFactory.create('bad')).rejects.toThrow(
        'requires a configuration object'
      );
    });

    it('should throw for undefined config', async () => {
      await expect(TranscriptionFactory.create()).rejects.toThrow(
        'requires a configuration object'
      );
    });

    it('should default to API mode', async () => {
      const service = await TranscriptionFactory.create({
        provider: mockProvider()
      });
      expect(service.type).toBe('TranscriptionService');
    });

    it('should create API service for api mode', async () => {
      const provider = mockProvider();
      const service = await TranscriptionFactory.create({
        mode: 'api',
        provider
      });
      expect(service.type).toBe('TranscriptionService');
      expect(service.provider).toBe(provider);
    });

    it('should create local service for local mode', async () => {
      const service = await TranscriptionFactory.create({
        mode: 'local',
        whisperBackendUrl: 'http://localhost:8080'
      });
      expect(service.type).toBe('LocalWhisperService');
      expect(service.backendUrl).toBe('http://localhost:8080');
    });

    it('should create auto service for auto mode', async () => {
      const service = await TranscriptionFactory.create({
        mode: 'auto',
        provider: mockProvider(),
        whisperBackendUrl: 'http://localhost:8080'
      });
      // Should be local service since healthCheck returns true
      expect(service.type).toBe('LocalWhisperService');
    });

    it('should fall back to API for unknown mode', async () => {
      const service = await TranscriptionFactory.create({
        mode: 'unknown-mode',
        provider: mockProvider()
      });
      expect(service.type).toBe('TranscriptionService');
    });

    it('should pass options to API service', async () => {
      const service = await TranscriptionFactory.create({
        mode: 'api',
        provider: mockProvider(),
        options: { defaultLanguage: 'it' }
      });
      expect(service.options.defaultLanguage).toBe('it');
    });

    it('should pass options to local service', async () => {
      const service = await TranscriptionFactory.create({
        mode: 'local',
        whisperBackendUrl: 'http://localhost:8080',
        options: { defaultLanguage: 'fr' }
      });
      expect(service.options.defaultLanguage).toBe('fr');
    });
  });

  // ── API mode ──────────────────────────────────────────────────────

  describe('API mode', () => {
    it('should throw if no provider provided', async () => {
      await expect(TranscriptionFactory.create({ mode: 'api' })).rejects.toThrow(
        'A transcription provider is required'
      );
    });

    it('should throw if provider is null', async () => {
      await expect(TranscriptionFactory.create({ mode: 'api', provider: null })).rejects.toThrow(
        'A transcription provider is required'
      );
    });
  });

  // ── Local mode ────────────────────────────────────────────────────

  describe('Local mode', () => {
    it('should throw if no backend URL provided', async () => {
      await expect(TranscriptionFactory.create({ mode: 'local' })).rejects.toThrow(
        'Whisper backend URL is required'
      );
    });

    it('should throw if backend URL is empty', async () => {
      await expect(
        TranscriptionFactory.create({ mode: 'local', whisperBackendUrl: '' })
      ).rejects.toThrow('Whisper backend URL is required');
    });
  });

  // ── Auto mode ─────────────────────────────────────────────────────

  describe('Auto mode', () => {
    it('should use local service when backend is healthy', async () => {
      localWhisperMocks.healthCheckResult = true;

      const service = await TranscriptionFactory.create({
        mode: 'auto',
        provider: mockProvider(),
        whisperBackendUrl: 'http://localhost:8080'
      });
      expect(service.type).toBe('LocalWhisperService');
    });

    it('should fall back to API when backend health check fails', async () => {
      localWhisperMocks.healthCheckResult = false;

      const service = await TranscriptionFactory.create({
        mode: 'auto',
        provider: mockProvider(),
        whisperBackendUrl: 'http://localhost:8080'
      });
      expect(service.type).toBe('TranscriptionService');
    });

    it('should fall back to API when backend throws', async () => {
      localWhisperMocks.healthCheckThrows = true;

      const service = await TranscriptionFactory.create({
        mode: 'auto',
        provider: mockProvider(),
        whisperBackendUrl: 'http://localhost:8080'
      });
      expect(service.type).toBe('TranscriptionService');
    });

    it('should fall back to API when no backend URL configured', async () => {
      const service = await TranscriptionFactory.create({
        mode: 'auto',
        provider: mockProvider()
      });
      expect(service.type).toBe('TranscriptionService');
    });

    it('should throw when both services unavailable', async () => {
      localWhisperMocks.healthCheckResult = false;

      await expect(
        TranscriptionFactory.create({
          mode: 'auto',
          whisperBackendUrl: 'http://localhost:8080'
          // no provider
        })
      ).rejects.toThrow('Auto mode failed');
    });

    it('should throw when no backend URL and no provider', async () => {
      await expect(TranscriptionFactory.create({ mode: 'auto' })).rejects.toThrow(
        'Auto mode failed'
      );
    });

    it('should pass options to auto-created local service', async () => {
      localWhisperMocks.healthCheckResult = true;

      const service = await TranscriptionFactory.create({
        mode: 'auto',
        provider: mockProvider(),
        whisperBackendUrl: 'http://localhost:8080',
        options: { defaultLanguage: 'de' }
      });
      expect(service.options.defaultLanguage).toBe('de');
    });

    it('should pass options to auto-created API service', async () => {
      localWhisperMocks.healthCheckResult = false;

      const service = await TranscriptionFactory.create({
        mode: 'auto',
        provider: mockProvider(),
        whisperBackendUrl: 'http://localhost:8080',
        options: { defaultLanguage: 'ja' }
      });
      expect(service.options.defaultLanguage).toBe('ja');
    });
  });

  // ── checkLocalBackend ─────────────────────────────────────────────

  describe('checkLocalBackend', () => {
    it('should return true when backend is healthy', async () => {
      localWhisperMocks.healthCheckResult = true;
      const result = await TranscriptionFactory.checkLocalBackend('http://localhost:8080');
      expect(result).toBe(true);
    });

    it('should return false when backend is not healthy', async () => {
      localWhisperMocks.healthCheckResult = false;
      const result = await TranscriptionFactory.checkLocalBackend('http://localhost:8080');
      expect(result).toBe(false);
    });

    it('should return false when no URL provided', async () => {
      const result = await TranscriptionFactory.checkLocalBackend('');
      expect(result).toBe(false);
    });

    it('should return false when null URL provided', async () => {
      const result = await TranscriptionFactory.checkLocalBackend(null);
      expect(result).toBe(false);
    });

    it('should return false when healthCheck throws', async () => {
      localWhisperMocks.healthCheckThrows = true;
      const result = await TranscriptionFactory.checkLocalBackend('http://localhost:8080');
      expect(result).toBe(false);
    });

    it('should pass options to healthCheck', async () => {
      localWhisperMocks.healthCheckResult = true;
      const result = await TranscriptionFactory.checkLocalBackend('http://localhost:8080', {
        timeout: 1000
      });
      expect(result).toBe(true);
    });
  });

  // ── getRecommendedMode ────────────────────────────────────────────

  describe('getRecommendedMode', () => {
    it('should return auto when both configured', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        openaiApiKey: 'sk-test',
        whisperBackendUrl: 'http://localhost:8080'
      });
      expect(mode).toBe(TranscriptionMode.AUTO);
    });

    it('should return api when only API key configured', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        openaiApiKey: 'sk-test'
      });
      expect(mode).toBe(TranscriptionMode.API);
    });

    it('should return local when only backend URL configured', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        whisperBackendUrl: 'http://localhost:8080'
      });
      expect(mode).toBe(TranscriptionMode.LOCAL);
    });

    it('should return api when nothing configured', () => {
      const mode = TranscriptionFactory.getRecommendedMode({});
      expect(mode).toBe(TranscriptionMode.API);
    });

    it('should handle empty strings as unconfigured', () => {
      const mode = TranscriptionFactory.getRecommendedMode({
        openaiApiKey: '',
        whisperBackendUrl: ''
      });
      expect(mode).toBe(TranscriptionMode.API);
    });
  });

  // ── getAvailableModes ─────────────────────────────────────────────

  describe('getAvailableModes', () => {
    it('should return array of modes', () => {
      const modes = TranscriptionFactory.getAvailableModes();
      expect(Array.isArray(modes)).toBe(true);
      expect(modes).toHaveLength(3);
    });

    it('should include api mode', () => {
      const modes = TranscriptionFactory.getAvailableModes();
      const apiMode = modes.find((m) => m.id === 'api');
      expect(apiMode).toBeDefined();
      expect(apiMode.requiresApiKey).toBe(true);
      expect(apiMode.requiresBackend).toBe(false);
    });

    it('should include local mode', () => {
      const modes = TranscriptionFactory.getAvailableModes();
      const localMode = modes.find((m) => m.id === 'local');
      expect(localMode).toBeDefined();
      expect(localMode.requiresApiKey).toBe(false);
      expect(localMode.requiresBackend).toBe(true);
      expect(localMode.supportsOffline).toBe(true);
    });

    it('should include auto mode', () => {
      const modes = TranscriptionFactory.getAvailableModes();
      const autoMode = modes.find((m) => m.id === 'auto');
      expect(autoMode).toBeDefined();
      expect(autoMode.requiresApiKey).toBe(true);
      expect(autoMode.requiresBackend).toBe(true);
    });

    it('should include descriptions for all modes', () => {
      const modes = TranscriptionFactory.getAvailableModes();
      modes.forEach((mode) => {
        expect(mode.name).toBeDefined();
        expect(mode.description).toBeDefined();
        expect(mode.description.length).toBeGreaterThan(0);
      });
    });
  });
});
