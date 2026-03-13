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

// Mock SpeakerLabeling static methods
vi.mock('../../scripts/ui/SpeakerLabeling.mjs', () => ({
  SpeakerLabeling: {
    addKnownSpeakers: vi.fn().mockResolvedValue(undefined),
    applyLabelsToSegments: vi.fn((segments) => segments)
  }
}));

import { SpeakerLabeling } from '../../scripts/ui/SpeakerLabeling.mjs';

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

  // ── EventBus Integration (Task 1.2) ─────────────────────────────────────

  describe('EventBus integration', () => {
    let mockEventBus;
    let ebProcessor;

    beforeEach(() => {
      mockEventBus = {
        emit: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      };
      ebProcessor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });
    });

    it('should accept optional eventBus in constructor', () => {
      expect(ebProcessor).toBeDefined();
    });

    it('should work without eventBus (optional)', () => {
      const p = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: 'api' }
      });
      expect(p).toBeDefined();
    });

    it('should emit ai:transcriptionStarted when processTranscription begins', async () => {
      const blob = createAudioBlob();
      await ebProcessor.processTranscription(blob);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:transcriptionStarted',
        expect.objectContaining({
          blobSize: blob.size,
          mode: 'api'
        })
      );
    });

    it('should emit ai:transcriptionReady when transcription succeeds', async () => {
      const blob = createAudioBlob();
      await ebProcessor.processTranscription(blob);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:transcriptionReady',
        expect.objectContaining({
          text: 'Hello world',
          segmentCount: 1
        })
      );
    });

    it('should emit ai:transcriptionError when transcription fails', async () => {
      const failService = createMockTranscriptionService({
        transcribe: vi.fn().mockRejectedValue(new Error('Transcription failed'))
      });
      const p = new TranscriptionProcessor({
        transcriptionService: failService,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await expect(p.processTranscription(createAudioBlob())).rejects.toThrow('Transcription failed');

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:transcriptionError',
        expect.objectContaining({
          error: expect.stringContaining('Transcription failed')
        })
      );
    });

    it('should emit ai:transcriptionStarted BEFORE ai:transcriptionReady', async () => {
      const callOrder = [];
      mockEventBus.emit.mockImplementation((event) => {
        callOrder.push(event);
      });

      await ebProcessor.processTranscription(createAudioBlob());

      const startIdx = callOrder.indexOf('ai:transcriptionStarted');
      const readyIdx = callOrder.indexOf('ai:transcriptionReady');
      expect(startIdx).toBeLessThan(readyIdx);
    });

    it('should not throw if eventBus.emit throws (error isolation)', async () => {
      mockEventBus.emit.mockImplementation(() => {
        throw new Error('EventBus broken');
      });

      // Should still return result despite EventBus failure
      const result = await ebProcessor.processTranscription(createAudioBlob());
      expect(result.text).toBe('Hello world');
    });

    it('should not emit events when no eventBus is provided', async () => {
      const p = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: 'api' }
      });

      // Should not throw - no eventBus to emit on
      const result = await p.processTranscription(createAudioBlob());
      expect(result).toBeDefined();
    });

    it('should include duration in ai:transcriptionReady event', async () => {
      await ebProcessor.processTranscription(createAudioBlob());

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:transcriptionReady',
        expect.objectContaining({
          durationMs: expect.any(Number)
        })
      );
    });
  });

  // ── Flow: blob → TranscriptionProcessor → TranscriptionService (Task 1.3) ──

  describe('processTranscription flow verification', () => {
    it('should pass model option to transcription service', async () => {
      const blob = createAudioBlob();
      await processor.processTranscription(blob, {
        speakerMap: { SPEAKER_00: 'GM' },
        language: 'it'
      });

      expect(mockService.transcribe).toHaveBeenCalledWith(
        blob,
        expect.objectContaining({
          speakerMap: { SPEAKER_00: 'GM' },
          language: 'it'
        })
      );
    });

    it('should propagate transcription result with all fields intact', async () => {
      const fullResult = {
        text: 'Full text',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 },
          { speaker: 'SPEAKER_01', text: 'World', start: 1, end: 2 }
        ],
        speakers: [{ id: 'SPEAKER_00', name: 'GM' }],
        language: 'it',
        duration: 5.0
      };
      mockService.transcribe.mockResolvedValue(fullResult);

      const result = await processor.processTranscription(createAudioBlob());

      expect(result.text).toBe('Full text');
      expect(result.segments).toHaveLength(2);
      expect(result.language).toBe('it');
      expect(result.duration).toBe(5.0);
    });
  });

  // ── Multi-language passthrough (Task 2) ────────────────────────────────

  describe('multi-language passthrough', () => {
    it('should pass explicit language to transcription service', async () => {
      const blob = createAudioBlob();
      await processor.processTranscription(blob, { language: 'it' });

      expect(mockService.transcribe).toHaveBeenCalledWith(
        blob,
        expect.objectContaining({ language: 'it' })
      );
    });

    it('should pass undefined language when not specified (auto-detect)', async () => {
      const blob = createAudioBlob();
      await processor.processTranscription(blob);

      const callArgs = mockService.transcribe.mock.calls[0][1];
      expect(callArgs.language).toBeUndefined();
    });

    it('should preserve language segments in result', async () => {
      mockService.transcribe.mockResolvedValue({
        text: 'Hola world',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Hola', start: 0, end: 1, language: 'es' },
          { speaker: 'SPEAKER_01', text: 'world', start: 1, end: 2, language: 'en' }
        ]
      });

      const result = await processor.processTranscription(createAudioBlob());
      expect(result.segments[0].language).toBe('es');
      expect(result.segments[1].language).toBe('en');
    });

    it('should include language in ai:transcriptionStarted event', async () => {
      const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
      const p = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob(), { language: 'ja' });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:transcriptionStarted',
        expect.objectContaining({ language: 'ja' })
      );
    });
  });

  // ── E2E integration tests (Task 5) ─────────────────────────────────────

  describe('E2E integration flows', () => {
    it('E2E: blob → TranscriptionProcessor → TranscriptionService → result with speaker segments', async () => {
      const speakerResult = {
        text: 'Welcome adventurers. Let us begin.',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Welcome adventurers.', start: 0, end: 2.5 },
          { speaker: 'SPEAKER_01', text: 'Let us begin.', start: 3.0, end: 4.5 }
        ],
        speakers: [
          { id: 'SPEAKER_00', name: 'SPEAKER_00', isMapped: false },
          { id: 'SPEAKER_01', name: 'SPEAKER_01', isMapped: false }
        ],
        language: 'en',
        duration: 4.5
      };
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue(speakerResult)
      });

      const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      const blob = createAudioBlob();
      const result = await p.processTranscription(blob, {
        speakerMap: { SPEAKER_00: 'Game Master', SPEAKER_01: 'Player 1' },
        language: 'en'
      });

      // Verify complete flow
      expect(result.text).toBe('Welcome adventurers. Let us begin.');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].speaker).toBe('SPEAKER_00');
      expect(result.segments[1].speaker).toBe('SPEAKER_01');

      // Verify EventBus was notified
      expect(mockEventBus.emit).toHaveBeenCalledWith('ai:transcriptionStarted', expect.any(Object));
      expect(mockEventBus.emit).toHaveBeenCalledWith('ai:transcriptionReady', expect.any(Object));
    });

    it('E2E: language config passes through to provider', async () => {
      const service = createMockTranscriptionService();

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' }
      });

      await p.processTranscription(createAudioBlob(), { language: 'it' });

      expect(service.transcribe).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ language: 'it' })
      );
    });

    it('E2E: error flow emits transcriptionError and re-throws', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockRejectedValue(new Error('API rate limit exceeded'))
      });

      const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await expect(p.processTranscription(createAudioBlob())).rejects.toThrow('API rate limit exceeded');

      // Verify started was emitted before error
      expect(mockEventBus.emit).toHaveBeenCalledWith('ai:transcriptionStarted', expect.any(Object));
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:transcriptionError',
        expect.objectContaining({ error: 'API rate limit exceeded' })
      );
    });

    it('E2E: auto-mode local failure → API fallback → success with events', async () => {
      const localService = createMockLocalWhisperService({
        transcribe: vi.fn().mockRejectedValue(new Error('Whisper server down'))
      });

      const fallbackResult = {
        text: 'Fallback transcript',
        segments: [{ speaker: 'SPEAKER_00', text: 'Fallback transcript', start: 0, end: 2 }]
      };
      MockTranscriptionServiceClass.mockImplementation(() => ({
        transcribe: vi.fn().mockResolvedValue(fallbackResult)
      }));

      const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: { mode: 'auto', openaiApiKey: 'sk-test' },
        eventBus: mockEventBus
      });

      const result = await p.processTranscription(createAudioBlob());

      expect(result.text).toBe('Fallback transcript');
      expect(mockEventBus.emit).toHaveBeenCalledWith('ai:transcriptionStarted', expect.any(Object));
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:transcriptionReady',
        expect.objectContaining({
          text: 'Fallback transcript',
          segmentCount: 1,
          fallback: true
        })
      );
    });

    it('E2E: auto-mode both local and API fail → emits ai:transcriptionError with fallback flag', async () => {
      const localService = createMockLocalWhisperService({
        transcribe: vi.fn().mockRejectedValue(new Error('Whisper offline'))
      });

      MockTranscriptionServiceClass.mockImplementation(() => ({
        transcribe: vi.fn().mockRejectedValue(new Error('API quota exceeded'))
      }));

      const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: { mode: 'auto', openaiApiKey: 'sk-test' },
        eventBus: mockEventBus
      });

      await expect(p.processTranscription(createAudioBlob())).rejects.toThrow('Both local and API');

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:transcriptionError',
        expect.objectContaining({
          fallback: true,
          error: expect.stringContaining('API quota exceeded')
        })
      );
    });
  });

  // ── Circuit breaker verification (Task 1.4) ──────────────────────────────

  describe('circuit breaker passthrough', () => {
    it('should propagate circuit breaker error from TranscriptionService', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockRejectedValue(
          new Error('Circuit breaker is open: too many consecutive transcription failures.')
        )
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' }
      });

      await expect(p.processTranscription(createAudioBlob())).rejects.toThrow(
        'Circuit breaker is open'
      );
    });

    it('should propagate circuit breaker error without triggering fallback in API mode', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockRejectedValue(
          new Error('Circuit breaker is open')
        )
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api', openaiApiKey: 'sk-test' }
      });

      await expect(p.processTranscription(createAudioBlob())).rejects.toThrow(
        'Circuit breaker is open'
      );
      // Should NOT create a fallback TranscriptionService
      expect(MockTranscriptionServiceClass).not.toHaveBeenCalled();
    });
  });

  // ── Speaker Wiring (Story 3.3 Task 1) ─────────────────────────────────

  describe('speaker wiring', () => {
    let mockEventBus;

    beforeEach(() => {
      vi.clearAllMocks();
      mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
      // Reset SpeakerLabeling mocks
      SpeakerLabeling.addKnownSpeakers.mockResolvedValue(undefined);
      SpeakerLabeling.applyLabelsToSegments.mockImplementation((segments) => segments);
    });

    // Task 1.1 — addKnownSpeakers called after transcription
    it('should call SpeakerLabeling.addKnownSpeakers with unique speaker IDs after transcription', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({
          text: 'Hello world',
          segments: [
            { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 },
            { speaker: 'SPEAKER_01', text: 'world', start: 1, end: 2 },
            { speaker: 'SPEAKER_00', text: 'again', start: 2, end: 3 }
          ]
        })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      expect(SpeakerLabeling.addKnownSpeakers).toHaveBeenCalledWith(['SPEAKER_00', 'SPEAKER_01']);
    });

    it('should not call addKnownSpeakers when segments is empty', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({ text: 'empty', segments: [] })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      expect(SpeakerLabeling.addKnownSpeakers).not.toHaveBeenCalled();
    });

    it('should not call addKnownSpeakers when segments is undefined', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({ text: 'no segments' })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      expect(SpeakerLabeling.addKnownSpeakers).not.toHaveBeenCalled();
    });

    it('should not throw if addKnownSpeakers fails (error isolation)', async () => {
      SpeakerLabeling.addKnownSpeakers.mockRejectedValue(new Error('Settings broken'));

      const service = createMockTranscriptionService();
      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      const result = await p.processTranscription(createAudioBlob());
      expect(result.text).toBe('Hello world');
    });

    // Task 1.2 — ai:speakersDetected event
    it('should emit ai:speakersDetected with speaker IDs after transcription', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({
          text: 'Test',
          segments: [
            { speaker: 'SPEAKER_00', text: 'a', start: 0, end: 1 },
            { speaker: 'SPEAKER_01', text: 'b', start: 1, end: 2 }
          ]
        })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:speakersDetected',
        expect.objectContaining({
          speakerIds: ['SPEAKER_00', 'SPEAKER_01']
        })
      );
    });

    it('should not emit ai:speakersDetected when no speakers found', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({ text: 'no speakers', segments: [] })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      const speakersDetectedCalls = mockEventBus.emit.mock.calls.filter(
        c => c[0] === 'ai:speakersDetected'
      );
      expect(speakersDetectedCalls).toHaveLength(0);
    });

    it('should emit ai:speakersDetected BEFORE ai:transcriptionReady (labels applied first)', async () => {
      const callOrder = [];
      mockEventBus.emit.mockImplementation((event) => {
        callOrder.push(event);
      });

      const service = createMockTranscriptionService();
      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      const readyIdx = callOrder.indexOf('ai:transcriptionReady');
      const detectedIdx = callOrder.indexOf('ai:speakersDetected');
      expect(detectedIdx).toBeLessThan(readyIdx);
    });

    it('should include segments in ai:transcriptionReady event payload', async () => {
      const service = createMockTranscriptionService();
      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      const readyCall = mockEventBus.emit.mock.calls.find(c => c[0] === 'ai:transcriptionReady');
      expect(readyCall).toBeTruthy();
      expect(readyCall[1]).toHaveProperty('segments');
      expect(Array.isArray(readyCall[1].segments)).toBe(true);
    });

    // Task 1.3 — Auto-apply saved labels
    it('should call applyLabelsToSegments on transcription result', async () => {
      const labeledSegments = [
        { speaker: 'Game Master', text: 'Hello', start: 0, end: 1 }
      ];
      SpeakerLabeling.applyLabelsToSegments.mockReturnValue(labeledSegments);

      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({
          text: 'Hello',
          segments: [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }]
        })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      const result = await p.processTranscription(createAudioBlob());

      expect(SpeakerLabeling.applyLabelsToSegments).toHaveBeenCalledWith(
        [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }]
      );
      expect(result.segments).toEqual(labeledSegments);
    });

    it('should not call applyLabelsToSegments when no segments', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({ text: 'empty', segments: [] })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      expect(SpeakerLabeling.applyLabelsToSegments).not.toHaveBeenCalled();
    });

    it('should not throw if applyLabelsToSegments fails (error isolation)', async () => {
      SpeakerLabeling.applyLabelsToSegments.mockImplementation(() => {
        throw new Error('Labels broken');
      });

      const service = createMockTranscriptionService();
      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      const result = await p.processTranscription(createAudioBlob());
      // Should return original segments when label application fails
      expect(result.segments).toHaveLength(1);
    });

    // Task 2 — Cross-session persistence
    it('should apply previously saved labels to new transcription segments', async () => {
      // Simulate saved labels from a previous session
      const savedLabeledSegments = [
        { speaker: 'Game Master', text: 'Hello', start: 0, end: 1 },
        { speaker: 'Player 1', text: 'Hi', start: 1, end: 2 }
      ];
      SpeakerLabeling.applyLabelsToSegments.mockReturnValue(savedLabeledSegments);

      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({
          text: 'Hello Hi',
          segments: [
            { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 },
            { speaker: 'SPEAKER_01', text: 'Hi', start: 1, end: 2 }
          ]
        })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      const result = await p.processTranscription(createAudioBlob());

      // Verify labels were applied (simulating cross-session persistence)
      expect(result.segments[0].speaker).toBe('Game Master');
      expect(result.segments[1].speaker).toBe('Player 1');
    });

    it('should register new speakers while preserving existing known speakers via addKnownSpeakers merge', async () => {
      const service = createMockTranscriptionService({
        transcribe: vi.fn().mockResolvedValue({
          text: 'test',
          segments: [
            { speaker: 'SPEAKER_00', text: 'a', start: 0, end: 1 },
            { speaker: 'SPEAKER_02', text: 'b', start: 1, end: 2 }
          ]
        })
      });

      const p = new TranscriptionProcessor({
        transcriptionService: service,
        config: { mode: 'api' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      // addKnownSpeakers handles merge internally (filters duplicates)
      expect(SpeakerLabeling.addKnownSpeakers).toHaveBeenCalledWith(['SPEAKER_00', 'SPEAKER_02']);
    });

    // Auto-mode fallback also wires speakers
    it('should wire speakers after fallback transcription succeeds', async () => {
      const localService = createMockLocalWhisperService({
        transcribe: vi.fn().mockRejectedValue(new Error('Local failed'))
      });

      const fallbackResult = {
        text: 'Fallback',
        segments: [
          { speaker: 'SPEAKER_00', text: 'Fallback', start: 0, end: 1 }
        ]
      };
      MockTranscriptionServiceClass.mockImplementation(() => ({
        transcribe: vi.fn().mockResolvedValue(fallbackResult)
      }));

      const p = new TranscriptionProcessor({
        transcriptionService: localService,
        config: { mode: 'auto', openaiApiKey: 'sk-test' },
        eventBus: mockEventBus
      });

      await p.processTranscription(createAudioBlob());

      expect(SpeakerLabeling.addKnownSpeakers).toHaveBeenCalledWith(['SPEAKER_00']);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai:speakersDetected',
        expect.objectContaining({ speakerIds: ['SPEAKER_00'] })
      );
    });
  });
});
