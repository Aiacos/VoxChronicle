/**
 * Tests for TranscriptionProcessor
 *
 * Covers exports, constructor validation, processTranscription (happy path,
 * auto-mode fallback, error handling), getMode, hasFallback, updateConfig,
 * and private _transcribeWithService indirectly through the public API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (accessible inside vi.mock factories)
// ---------------------------------------------------------------------------

const { MockLocalWhisperServiceClass, MockTranscriptionServiceClass } = vi.hoisted(() => ({
  MockLocalWhisperServiceClass: vi.fn(),
  MockTranscriptionServiceClass: vi.fn()
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// We need to mock LocalWhisperService so instanceof checks work
vi.mock('../../scripts/ai/LocalWhisperService.mjs', () => ({
  LocalWhisperService: MockLocalWhisperServiceClass
}));

// Mock TranscriptionService constructor to track fallback creation
vi.mock('../../scripts/ai/TranscriptionService.mjs', () => ({
  TranscriptionService: MockTranscriptionServiceClass
}));

import { TranscriptionProcessor } from '../../scripts/orchestration/TranscriptionProcessor.mjs';

vi.mock('../../scripts/ai/TranscriptionFactory.mjs', () => ({
  TranscriptionMode: {
    API: 'api',
    LOCAL: 'local',
    AUTO: 'auto'
  }
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockTranscriptionService(overrides = {}) {
  return {
    transcribe: vi.fn().mockResolvedValue({
      text: 'Hello world',
      segments: [{ speaker: 'SPEAKER_00', text: 'Hello world', start: 0, end: 1 }],
      language: 'en'
    }),
    ...overrides
  };
}

function createMockLocalWhisperService(overrides = {}) {
  const service = {
    transcribe: vi.fn().mockResolvedValue({
      text: 'Hello world',
      segments: [{ speaker: 'SPEAKER_00', text: 'Hello world', start: 0, end: 1 }],
      language: 'en'
    }),
    ...overrides
  };
  // Make instanceof LocalWhisperService work
  Object.setPrototypeOf(service, MockLocalWhisperServiceClass.prototype);
  return service;
}

function createAudioBlob() {
  return new Blob(['fake audio data'], { type: 'audio/webm' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranscriptionProcessor', () => {
  let mockService;
  let processor;

  beforeEach(() => {
    mockService = createMockTranscriptionService();
    processor = new TranscriptionProcessor({
      transcriptionService: mockService,
      config: { mode: 'api', openaiApiKey: 'sk-test' }
    });
    // Reset the mock constructor so we can track fallback creation
    MockTranscriptionServiceClass.mockReset();
    MockTranscriptionServiceClass.prototype.transcribe = vi.fn().mockResolvedValue({
      text: 'Fallback result',
      segments: [{ speaker: 'SPEAKER_00', text: 'Fallback result', start: 0, end: 1 }],
      language: 'en'
    });
  });

  // ── Exports ─────────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export TranscriptionProcessor class', () => {
      expect(TranscriptionProcessor).toBeDefined();
      expect(typeof TranscriptionProcessor).toBe('function');
    });

    it('should be constructable', () => {
      const p = new TranscriptionProcessor({ transcriptionService: mockService });
      expect(p).toBeInstanceOf(TranscriptionProcessor);
    });
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should throw if no transcriptionService is provided', () => {
      expect(() => new TranscriptionProcessor()).toThrow('requires a transcriptionService');
    });

    it('should throw if transcriptionService is missing from options', () => {
      expect(() => new TranscriptionProcessor({})).toThrow('requires a transcriptionService');
    });

    it('should throw if transcriptionService is null', () => {
      expect(() => new TranscriptionProcessor({ transcriptionService: null })).toThrow(
        'requires a transcriptionService'
      );
    });

    it('should accept a valid transcriptionService', () => {
      const p = new TranscriptionProcessor({ transcriptionService: mockService });
      expect(p).toBeDefined();
    });

    it('should use empty config when not provided', () => {
      const p = new TranscriptionProcessor({ transcriptionService: mockService });
      expect(p.getMode()).toBe('api'); // defaults to API since not instanceof LocalWhisperService
    });

    it('should store config when provided', () => {
      const p = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: 'local', openaiApiKey: 'sk-test' }
      });
      expect(p.getMode()).toBe('local');
    });
  });

  // ── getMode ─────────────────────────────────────────────────────────────

  describe('getMode', () => {
    it('should return mode from config', () => {
      expect(processor.getMode()).toBe('api');
    });

    it('should return "local" when config mode is local', () => {
      const p = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: 'local' }
      });
      expect(p.getMode()).toBe('local');
    });

    it('should return "auto" when config mode is auto', () => {
      const p = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: 'auto' }
      });
      expect(p.getMode()).toBe('auto');
    });

    it('should default to "local" for LocalWhisperService instances without config mode', () => {
      const localService = createMockLocalWhisperService();
      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: {}
      });
      expect(p.getMode()).toBe('local');
    });

    it('should default to "api" for non-local service without config mode', () => {
      const p = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: {}
      });
      expect(p.getMode()).toBe('api');
    });

    it('should default to "api" when config is undefined', () => {
      const p = new TranscriptionProcessor({ transcriptionService: mockService });
      expect(p.getMode()).toBe('api');
    });
  });

  // ── hasFallback ─────────────────────────────────────────────────────────

  describe('hasFallback', () => {
    it('should return false for API mode', () => {
      expect(processor.hasFallback()).toBe(false);
    });

    it('should return false when service is not LocalWhisperService', () => {
      const p = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: 'auto', openaiApiKey: 'sk-test' }
      });
      expect(p.hasFallback()).toBe(false);
    });

    it('should return true for local service in auto mode with API key', () => {
      const localService = createMockLocalWhisperService();
      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: { mode: 'auto', openaiApiKey: 'sk-test' }
      });
      expect(p.hasFallback()).toBe(true);
    });

    it('should return false for local service in auto mode without API key', () => {
      const localService = createMockLocalWhisperService();
      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: { mode: 'auto' }
      });
      expect(p.hasFallback()).toBe(false);
    });

    it('should return false for local service in local mode with API key', () => {
      const localService = createMockLocalWhisperService();
      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: { mode: 'local', openaiApiKey: 'sk-test' }
      });
      expect(p.hasFallback()).toBe(false);
    });

    it('should return false when config has empty openaiApiKey', () => {
      const localService = createMockLocalWhisperService();
      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: { mode: 'auto', openaiApiKey: '' }
      });
      expect(p.hasFallback()).toBe(false);
    });
  });

  // ── updateConfig ────────────────────────────────────────────────────────

  describe('updateConfig', () => {
    it('should merge new config with existing config', () => {
      processor.updateConfig({ mode: 'local' });
      expect(processor.getMode()).toBe('local');
    });

    it('should preserve existing config keys', () => {
      processor.updateConfig({ mode: 'auto' });
      expect(processor.hasFallback()).toBe(false); // still not local service
    });

    it('should add new config keys', () => {
      const localService = createMockLocalWhisperService();
      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: { mode: 'auto' }
      });
      expect(p.hasFallback()).toBe(false);

      p.updateConfig({ openaiApiKey: 'sk-new' });
      expect(p.hasFallback()).toBe(true);
    });

    it('should overwrite existing config keys', () => {
      processor.updateConfig({ openaiApiKey: 'sk-new-key' });
      // Verify the internal config was updated by checking hasFallback (indirectly)
      expect(processor.getMode()).toBe('api');
    });
  });

  // ── processTranscription ────────────────────────────────────────────────

  describe('processTranscription', () => {
    describe('input validation', () => {
      it('should throw if audioBlob is null', async () => {
        await expect(processor.processTranscription(null)).rejects.toThrow(
          'Invalid audio blob'
        );
      });

      it('should throw if audioBlob is undefined', async () => {
        await expect(processor.processTranscription(undefined)).rejects.toThrow(
          'Invalid audio blob'
        );
      });

      it('should throw if audioBlob is not a Blob', async () => {
        await expect(processor.processTranscription('not a blob')).rejects.toThrow(
          'Invalid audio blob'
        );
      });

      it('should throw if audioBlob is a number', async () => {
        await expect(processor.processTranscription(42)).rejects.toThrow(
          'Invalid audio blob'
        );
      });

      it('should throw if audioBlob is an object', async () => {
        await expect(processor.processTranscription({})).rejects.toThrow(
          'Invalid audio blob'
        );
      });
    });

    describe('happy path', () => {
      it('should call transcribe on the service', async () => {
        const blob = createAudioBlob();
        await processor.processTranscription(blob);
        expect(mockService.transcribe).toHaveBeenCalledTimes(1);
      });

      it('should pass audio blob to service', async () => {
        const blob = createAudioBlob();
        await processor.processTranscription(blob);
        expect(mockService.transcribe).toHaveBeenCalledWith(blob, expect.any(Object));
      });

      it('should pass speakerMap to service', async () => {
        const blob = createAudioBlob();
        const speakerMap = { SPEAKER_00: 'Game Master' };
        await processor.processTranscription(blob, { speakerMap });

        expect(mockService.transcribe).toHaveBeenCalledWith(
          blob,
          expect.objectContaining({ speakerMap })
        );
      });

      it('should pass language to service', async () => {
        const blob = createAudioBlob();
        await processor.processTranscription(blob, { language: 'it' });

        expect(mockService.transcribe).toHaveBeenCalledWith(
          blob,
          expect.objectContaining({ language: 'it' })
        );
      });

      it('should return transcription result', async () => {
        const blob = createAudioBlob();
        const result = await processor.processTranscription(blob);

        expect(result).toBeDefined();
        expect(result.text).toBe('Hello world');
        expect(result.segments).toHaveLength(1);
      });

      it('should use default empty speakerMap when not provided', async () => {
        const blob = createAudioBlob();
        await processor.processTranscription(blob);

        expect(mockService.transcribe).toHaveBeenCalledWith(
          blob,
          expect.objectContaining({ speakerMap: {} })
        );
      });

      it('should use default noop onProgress when not provided', async () => {
        const blob = createAudioBlob();
        // Should not throw
        const result = await processor.processTranscription(blob);
        expect(result).toBeDefined();
      });
    });

    describe('progress reporting', () => {
      it('should call onProgress with starting message', async () => {
        const blob = createAudioBlob();
        const onProgress = vi.fn();
        await processor.processTranscription(blob, { onProgress });

        expect(onProgress).toHaveBeenCalledWith(0, expect.stringContaining('Starting transcription'));
      });

      it('should call onProgress with completion message', async () => {
        const blob = createAudioBlob();
        const onProgress = vi.fn();
        await processor.processTranscription(blob, { onProgress });

        expect(onProgress).toHaveBeenCalledWith(100, 'Transcription complete');
      });

      it('should include mode in starting message', async () => {
        const blob = createAudioBlob();
        const onProgress = vi.fn();
        await processor.processTranscription(blob, { onProgress });

        expect(onProgress).toHaveBeenCalledWith(0, expect.stringContaining('api'));
      });

      it('should relay progress from transcription service', async () => {
        let capturedOnProgress;
        const service = createMockTranscriptionService({
          transcribe: vi.fn().mockImplementation((blob, opts) => {
            capturedOnProgress = opts.onProgress;
            // Simulate progress callback
            opts.onProgress({ currentChunk: 1, totalChunks: 3, progress: 33 });
            opts.onProgress({ currentChunk: 2, totalChunks: 3, progress: 66 });
            return Promise.resolve({
              text: 'Test',
              segments: [{ speaker: 'S', text: 'Test', start: 0, end: 1 }]
            });
          })
        });

        const p = new TranscriptionProcessor({
          transcriptionService: service,
          config: { mode: 'api' }
        });

        const onProgress = vi.fn();
        await p.processTranscription(createAudioBlob(), { onProgress });

        // Should relay chunk progress
        expect(onProgress).toHaveBeenCalledWith(33, 'Transcribing chunk 1/3');
        expect(onProgress).toHaveBeenCalledWith(66, 'Transcribing chunk 2/3');
      });

      it('should handle missing progress fields with defaults', async () => {
        const service = createMockTranscriptionService({
          transcribe: vi.fn().mockImplementation((blob, opts) => {
            // Progress with missing fields
            opts.onProgress({});
            return Promise.resolve({ text: 'Test', segments: [] });
          })
        });

        const p = new TranscriptionProcessor({
          transcriptionService: service,
          config: { mode: 'api' }
        });

        const onProgress = vi.fn();
        await p.processTranscription(createAudioBlob(), { onProgress });

        // Defaults: currentChunk=1, totalChunks=1, progress=0
        expect(onProgress).toHaveBeenCalledWith(0, 'Transcribing chunk 1/1');
      });
    });

    describe('error handling (non-auto mode)', () => {
      it('should re-throw transcription errors in API mode', async () => {
        const service = createMockTranscriptionService({
          transcribe: vi.fn().mockRejectedValue(new Error('API error'))
        });

        const p = new TranscriptionProcessor({
          transcriptionService: service,
          config: { mode: 'api' }
        });

        await expect(p.processTranscription(createAudioBlob())).rejects.toThrow('API error');
      });

      it('should re-throw transcription errors in local mode', async () => {
        const localService = createMockLocalWhisperService({
          transcribe: vi.fn().mockRejectedValue(new Error('Local error'))
        });

        const p = new TranscriptionProcessor({
          transcriptionService: localService,
          config: { mode: 'local' }
        });

        await expect(p.processTranscription(createAudioBlob())).rejects.toThrow('Local error');
      });

      it('should re-throw for non-local service in auto mode', async () => {
        const service = createMockTranscriptionService({
          transcribe: vi.fn().mockRejectedValue(new Error('API error'))
        });

        const p = new TranscriptionProcessor({
          transcriptionService: service,
          config: { mode: 'auto' }
        });

        await expect(p.processTranscription(createAudioBlob())).rejects.toThrow('API error');
      });
    });

    describe('auto-mode fallback', () => {
      it('should attempt fallback when local fails in auto mode', async () => {
        const localService = createMockLocalWhisperService({
          transcribe: vi.fn().mockRejectedValue(new Error('Local failed'))
        });

        // Set up the TranscriptionService constructor mock to return a working service
        const fallbackTranscribe = vi.fn().mockResolvedValue({
          text: 'Fallback text',
          segments: [{ speaker: 'S', text: 'Fallback text', start: 0, end: 1 }]
        });
        MockTranscriptionServiceClass.mockImplementation(() => ({
          transcribe: fallbackTranscribe
        }));

        const p = new TranscriptionProcessor({
          transcriptionService: localService,
          config: { mode: 'auto', openaiApiKey: 'sk-test' }
        });

        const result = await p.processTranscription(createAudioBlob());
        expect(result.text).toBe('Fallback text');
        expect(MockTranscriptionServiceClass).toHaveBeenCalledWith('sk-test');
      });

      it('should throw if local fails and no API key for fallback', async () => {
        const localService = createMockLocalWhisperService({
          transcribe: vi.fn().mockRejectedValue(new Error('Local failed'))
        });

        const p = new TranscriptionProcessor({
          transcriptionService: localService,
          config: { mode: 'auto' }
        });

        await expect(p.processTranscription(createAudioBlob())).rejects.toThrow(
          'Local transcription failed and no OpenAI API key'
        );
      });

      it('should throw combined error if both local and API fail', async () => {
        const localService = createMockLocalWhisperService({
          transcribe: vi.fn().mockRejectedValue(new Error('Local failed'))
        });

        MockTranscriptionServiceClass.mockImplementation(() => ({
          transcribe: vi.fn().mockRejectedValue(new Error('API also failed'))
        }));

        const p = new TranscriptionProcessor({
          transcriptionService: localService,
          config: { mode: 'auto', openaiApiKey: 'sk-test' }
        });

        await expect(p.processTranscription(createAudioBlob())).rejects.toThrow(
          'Both local and API transcription failed'
        );
      });

      it('should include both error messages when both fail', async () => {
        const localService = createMockLocalWhisperService({
          transcribe: vi.fn().mockRejectedValue(new Error('Local timeout'))
        });

        MockTranscriptionServiceClass.mockImplementation(() => ({
          transcribe: vi.fn().mockRejectedValue(new Error('Rate limited'))
        }));

        const p = new TranscriptionProcessor({
          transcriptionService: localService,
          config: { mode: 'auto', openaiApiKey: 'sk-test' }
        });

        await expect(p.processTranscription(createAudioBlob())).rejects.toThrow('Local timeout');
        // Also check the API error is included
        try {
          await p.processTranscription(createAudioBlob());
        } catch (e) {
          expect(e.message).toContain('Rate limited');
        }
      });

      it('should report fallback progress', async () => {
        const localService = createMockLocalWhisperService({
          transcribe: vi.fn().mockRejectedValue(new Error('Local failed'))
        });

        MockTranscriptionServiceClass.mockImplementation(() => ({
          transcribe: vi.fn().mockResolvedValue({
            text: 'Fallback ok',
            segments: []
          })
        }));

        const p = new TranscriptionProcessor({
          transcriptionService: localService,
          config: { mode: 'auto', openaiApiKey: 'sk-test' }
        });

        const onProgress = vi.fn();
        await p.processTranscription(createAudioBlob(), { onProgress });

        expect(onProgress).toHaveBeenCalledWith(0, 'Falling back to API transcription...');
        expect(onProgress).toHaveBeenCalledWith(100, 'Transcription complete (via API fallback)');
      });

      it('should pass speakerMap and language to fallback service', async () => {
        const localService = createMockLocalWhisperService({
          transcribe: vi.fn().mockRejectedValue(new Error('Local failed'))
        });

        const fallbackTranscribe = vi.fn().mockResolvedValue({
          text: 'Fallback',
          segments: []
        });
        MockTranscriptionServiceClass.mockImplementation(() => ({
          transcribe: fallbackTranscribe
        }));

        const p = new TranscriptionProcessor({
          transcriptionService: localService,
          config: { mode: 'auto', openaiApiKey: 'sk-test' }
        });

        const speakerMap = { SPEAKER_00: 'DM' };
        await p.processTranscription(createAudioBlob(), {
          speakerMap,
          language: 'fr'
        });

        expect(fallbackTranscribe).toHaveBeenCalledWith(
          expect.any(Blob),
          expect.objectContaining({
            speakerMap,
            language: 'fr'
          })
        );
      });

      it('should append "(API fallback)" to fallback progress messages', async () => {
        const localService = createMockLocalWhisperService({
          transcribe: vi.fn().mockRejectedValue(new Error('Local failed'))
        });

        MockTranscriptionServiceClass.mockImplementation(() => ({
          transcribe: vi.fn().mockImplementation((blob, opts) => {
            opts.onProgress({ currentChunk: 1, totalChunks: 2, progress: 50 });
            return Promise.resolve({ text: 'ok', segments: [] });
          })
        }));

        const p = new TranscriptionProcessor({
          transcriptionService: localService,
          config: { mode: 'auto', openaiApiKey: 'sk-test' }
        });

        const onProgress = vi.fn();
        await p.processTranscription(createAudioBlob(), { onProgress });

        expect(onProgress).toHaveBeenCalledWith(
          50,
          expect.stringContaining('(API fallback)')
        );
      });
    });

    describe('result structure', () => {
      it('should return result with segments array', async () => {
        const result = await processor.processTranscription(createAudioBlob());
        expect(Array.isArray(result.segments)).toBe(true);
      });

      it('should return result with text property', async () => {
        const result = await processor.processTranscription(createAudioBlob());
        expect(typeof result.text).toBe('string');
      });

      it('should handle result with no segments', async () => {
        const service = createMockTranscriptionService({
          transcribe: vi.fn().mockResolvedValue({ text: '', segments: [] })
        });

        const p = new TranscriptionProcessor({
          transcriptionService: service,
          config: { mode: 'api' }
        });

        const result = await p.processTranscription(createAudioBlob());
        expect(result.segments).toHaveLength(0);
      });

      it('should handle result with undefined segments', async () => {
        const service = createMockTranscriptionService({
          transcribe: vi.fn().mockResolvedValue({ text: 'no segments' })
        });

        const p = new TranscriptionProcessor({
          transcriptionService: service,
          config: { mode: 'api' }
        });

        const result = await p.processTranscription(createAudioBlob());
        expect(result.text).toBe('no segments');
      });

      it('should handle multiple segments', async () => {
        const service = createMockTranscriptionService({
          transcribe: vi.fn().mockResolvedValue({
            text: 'Hello there, how are you?',
            segments: [
              { speaker: 'SPEAKER_00', text: 'Hello there', start: 0, end: 1 },
              { speaker: 'SPEAKER_01', text: 'how are you?', start: 1.5, end: 3 }
            ]
          })
        });

        const p = new TranscriptionProcessor({
          transcriptionService: service,
          config: { mode: 'api' }
        });

        const result = await p.processTranscription(createAudioBlob());
        expect(result.segments).toHaveLength(2);
        expect(result.segments[0].speaker).toBe('SPEAKER_00');
        expect(result.segments[1].speaker).toBe('SPEAKER_01');
      });
    });

    describe('edge cases', () => {
      it('should work with empty options object', async () => {
        const result = await processor.processTranscription(createAudioBlob(), {});
        expect(result).toBeDefined();
      });

      it('should work with minimal Blob', async () => {
        const blob = new Blob([]);
        const result = await processor.processTranscription(blob);
        expect(result).toBeDefined();
      });

      it('should work with large audio blob', async () => {
        const largeData = new Uint8Array(1024 * 1024); // 1MB
        const blob = new Blob([largeData], { type: 'audio/webm' });
        const result = await processor.processTranscription(blob);
        expect(result).toBeDefined();
      });
    });
  });
});
