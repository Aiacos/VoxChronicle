/**
 * TranscriptionProcessor Unit Tests
 *
 * Tests for the TranscriptionProcessor class with service mocking.
 * Covers transcription workflows, fallback logic, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing TranscriptionProcessor
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

// Mock LocalWhisperService
vi.mock('../../scripts/ai/LocalWhisperService.mjs', () => ({
  LocalWhisperService: class MockLocalWhisperService {
    transcribe = vi.fn();
  }
}));

// Create a mock TranscriptionService that can be controlled
let mockApiTranscribe = vi.fn();

// Mock TranscriptionService
vi.mock('../../scripts/ai/TranscriptionService.mjs', () => ({
  TranscriptionService: class MockTranscriptionService {
    constructor(apiKey) {
      this.apiKey = apiKey;
      // Use the controllable mock function
      this.transcribe = mockApiTranscribe;
    }
  }
}));

// Import after mocks are set up
import { TranscriptionProcessor, TranscriptionMode } from '../../scripts/orchestration/TranscriptionProcessor.mjs';
import { LocalWhisperService } from '../../scripts/ai/LocalWhisperService.mjs';
import { TranscriptionService } from '../../scripts/ai/TranscriptionService.mjs';

/**
 * Create mock audio blob for testing
 */
function createMockAudioBlob(size = 1024) {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type: 'audio/webm' });
}

/**
 * Create mock transcription result
 */
function createMockTranscriptionResult(options = {}) {
  return {
    text: options.text || 'Test transcription text.',
    segments: options.segments || [
      {
        speaker: 'SPEAKER_00',
        text: 'Hello world',
        start: 0,
        end: 2.5
      },
      {
        speaker: 'SPEAKER_01',
        text: 'Test message',
        start: 2.5,
        end: 5.0
      }
    ],
    speakers: options.speakers || [
      { id: 'SPEAKER_00', name: 'SPEAKER_00', segmentCount: 1, isMapped: false },
      { id: 'SPEAKER_01', name: 'SPEAKER_01', segmentCount: 1, isMapped: false }
    ],
    language: options.language || 'en',
    duration: options.duration || 5.0
  };
}

/**
 * Create mock transcription service (API)
 */
function createMockTranscriptionService() {
  const service = new TranscriptionService('test-api-key');
  service.transcribe = vi.fn().mockResolvedValue(createMockTranscriptionResult());
  return service;
}

/**
 * Create mock local whisper service
 */
function createMockLocalWhisperService() {
  const service = new LocalWhisperService();
  service.transcribe = vi.fn().mockResolvedValue(createMockTranscriptionResult());
  return service;
}

describe('TranscriptionProcessor', () => {
  let processor;
  let mockService;
  let mockAudioBlob;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioBlob = createMockAudioBlob();
    // Reset the API transcribe mock to default success behavior
    mockApiTranscribe = vi.fn().mockResolvedValue(createMockTranscriptionResult());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with API transcription service', () => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });

      expect(processor).toBeInstanceOf(TranscriptionProcessor);
      expect(processor.getMode()).toBe(TranscriptionMode.API);
    });

    it('should create instance with local transcription service', () => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });

      expect(processor).toBeInstanceOf(TranscriptionProcessor);
      expect(processor.getMode()).toBe(TranscriptionMode.LOCAL);
    });

    it('should accept custom config', () => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: {
          mode: TranscriptionMode.AUTO,
          openaiApiKey: 'sk-test-key'
        }
      });

      expect(processor.getMode()).toBe(TranscriptionMode.AUTO);
      expect(processor.hasFallback()).toBe(false); // API service doesn't need fallback
    });

    it('should throw error if no transcription service provided', () => {
      expect(() => {
        new TranscriptionProcessor({});
      }).toThrow('TranscriptionProcessor requires a transcriptionService');
    });

    it('should throw error if transcriptionService is null', () => {
      expect(() => {
        new TranscriptionProcessor({ transcriptionService: null });
      }).toThrow('TranscriptionProcessor requires a transcriptionService');
    });
  });

  describe('processTranscription with API service', () => {
    beforeEach(() => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });
    });

    it('should transcribe audio successfully', async () => {
      const result = await processor.processTranscription(mockAudioBlob);

      expect(result).toBeDefined();
      expect(result.text).toBe('Test transcription text.');
      expect(result.segments).toHaveLength(2);
      expect(mockService.transcribe).toHaveBeenCalledTimes(1);
    });

    it('should pass speaker map to transcription service', async () => {
      const speakerMap = {
        'SPEAKER_00': 'Game Master',
        'SPEAKER_01': 'Player 1'
      };

      await processor.processTranscription(mockAudioBlob, { speakerMap });

      expect(mockService.transcribe).toHaveBeenCalledWith(
        mockAudioBlob,
        expect.objectContaining({ speakerMap })
      );
    });

    it('should pass language to transcription service', async () => {
      await processor.processTranscription(mockAudioBlob, { language: 'it' });

      expect(mockService.transcribe).toHaveBeenCalledWith(
        mockAudioBlob,
        expect.objectContaining({ language: 'it' })
      );
    });

    it('should invoke progress callback during transcription', async () => {
      const onProgress = vi.fn();

      // Mock service to trigger progress callback
      mockService.transcribe = vi.fn(async (blob, options) => {
        if (options.onProgress) {
          options.onProgress({ progress: 50, currentChunk: 1, totalChunks: 1 });
        }
        return createMockTranscriptionResult();
      });

      await processor.processTranscription(mockAudioBlob, { onProgress });

      expect(onProgress).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('transcription')
      );
    });

    it('should handle transcription error', async () => {
      mockService.transcribe = vi.fn().mockRejectedValue(new Error('API error'));

      await expect(
        processor.processTranscription(mockAudioBlob)
      ).rejects.toThrow('API error');
    });

    it('should validate audio blob parameter', async () => {
      await expect(
        processor.processTranscription(null)
      ).rejects.toThrow('Invalid audio blob provided for transcription');

      await expect(
        processor.processTranscription('not-a-blob')
      ).rejects.toThrow('Invalid audio blob provided for transcription');
    });
  });

  describe('processTranscription with Local service', () => {
    beforeEach(() => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: TranscriptionMode.LOCAL }
      });
    });

    it('should transcribe audio successfully with local service', async () => {
      const result = await processor.processTranscription(mockAudioBlob);

      expect(result).toBeDefined();
      expect(result.text).toBe('Test transcription text.');
      expect(result.segments).toHaveLength(2);
      expect(mockService.transcribe).toHaveBeenCalledTimes(1);
    });

    it('should handle local transcription error in LOCAL mode', async () => {
      mockService.transcribe = vi.fn().mockRejectedValue(new Error('Local whisper error'));

      await expect(
        processor.processTranscription(mockAudioBlob)
      ).rejects.toThrow('Local whisper error');
    });

    it('should not attempt fallback in LOCAL mode', async () => {
      mockService.transcribe = vi.fn().mockRejectedValue(new Error('Local error'));

      await expect(
        processor.processTranscription(mockAudioBlob)
      ).rejects.toThrow('Local error');

      // Should only call local service once, no fallback
      expect(mockService.transcribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('processTranscription with AUTO fallback', () => {
    beforeEach(() => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: {
          mode: TranscriptionMode.AUTO,
          openaiApiKey: 'sk-test-fallback-key'
        }
      });
    });

    it('should succeed with local service when no error occurs', async () => {
      const result = await processor.processTranscription(mockAudioBlob);

      expect(result).toBeDefined();
      expect(result.text).toBe('Test transcription text.');
      expect(mockService.transcribe).toHaveBeenCalledTimes(1);
    });

    it('should fallback to API when local service fails', async () => {
      // Make local service fail
      mockService.transcribe = vi.fn().mockRejectedValue(new Error('Local service unavailable'));

      const onProgress = vi.fn();
      const result = await processor.processTranscription(mockAudioBlob, { onProgress });

      expect(result).toBeDefined();
      expect(result.text).toBe('Test transcription text.');

      // Verify progress messages indicate fallback
      expect(onProgress).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringMatching(/fallback|API/i)
      );
    });

    it('should report progress during fallback', async () => {
      mockService.transcribe = vi.fn().mockRejectedValue(new Error('Local error'));

      const onProgress = vi.fn();
      await processor.processTranscription(mockAudioBlob, { onProgress });

      // Check for fallback progress messages
      const progressCalls = onProgress.mock.calls.map(call => call[1]);
      expect(progressCalls.some(msg => msg.includes('fallback'))).toBe(true);
    });

    it('should fail if no API key configured for fallback', async () => {
      // Create processor without API key
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: TranscriptionMode.AUTO }
      });

      mockService.transcribe = vi.fn().mockRejectedValue(new Error('Local error'));

      await expect(
        processor.processTranscription(mockAudioBlob)
      ).rejects.toThrow(/no OpenAI API key configured for fallback/);
    });

    it('should fail with combined error message when both local and API fail', async () => {
      mockService.transcribe = vi.fn().mockRejectedValue(new Error('Local service error'));

      // Make the API fallback also fail
      mockApiTranscribe.mockRejectedValueOnce(new Error('API service error'));

      await expect(
        processor.processTranscription(mockAudioBlob)
      ).rejects.toThrow(/Both local and API transcription failed/);
    });

    it('should pass speaker map to fallback API service', async () => {
      mockService.transcribe = vi.fn().mockRejectedValue(new Error('Local error'));

      const speakerMap = { 'SPEAKER_00': 'GM' };

      await processor.processTranscription(mockAudioBlob, { speakerMap });

      // Verify the API service transcribe was called with speaker map
      expect(mockApiTranscribe).toHaveBeenCalledWith(
        mockAudioBlob,
        expect.objectContaining({ speakerMap })
      );
    });
  });

  describe('getMode', () => {
    it('should return LOCAL for LocalWhisperService without config', () => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });

      expect(processor.getMode()).toBe(TranscriptionMode.LOCAL);
    });

    it('should return API for TranscriptionService without config', () => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });

      expect(processor.getMode()).toBe(TranscriptionMode.API);
    });

    it('should return configured mode when specified', () => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: TranscriptionMode.AUTO }
      });

      expect(processor.getMode()).toBe(TranscriptionMode.AUTO);
    });

    it('should respect mode override for API service', () => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: TranscriptionMode.LOCAL }
      });

      expect(processor.getMode()).toBe(TranscriptionMode.LOCAL);
    });
  });

  describe('hasFallback', () => {
    it('should return true for local service in AUTO mode with API key', () => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: {
          mode: TranscriptionMode.AUTO,
          openaiApiKey: 'sk-test-key'
        }
      });

      expect(processor.hasFallback()).toBe(true);
    });

    it('should return false for local service in AUTO mode without API key', () => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: TranscriptionMode.AUTO }
      });

      expect(processor.hasFallback()).toBe(false);
    });

    it('should return false for local service in LOCAL mode', () => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: {
          mode: TranscriptionMode.LOCAL,
          openaiApiKey: 'sk-test-key'
        }
      });

      expect(processor.hasFallback()).toBe(false);
    });

    it('should return false for API service', () => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: {
          mode: TranscriptionMode.AUTO,
          openaiApiKey: 'sk-test-key'
        }
      });

      expect(processor.hasFallback()).toBe(false);
    });
  });

  describe('updateConfig', () => {
    beforeEach(() => {
      mockService = createMockLocalWhisperService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService,
        config: { mode: TranscriptionMode.LOCAL }
      });
    });

    it('should update mode configuration', () => {
      expect(processor.getMode()).toBe(TranscriptionMode.LOCAL);

      processor.updateConfig({ mode: TranscriptionMode.AUTO });

      expect(processor.getMode()).toBe(TranscriptionMode.AUTO);
    });

    it('should update API key configuration', () => {
      expect(processor.hasFallback()).toBe(false);

      processor.updateConfig({
        mode: TranscriptionMode.AUTO,
        openaiApiKey: 'sk-new-key'
      });

      expect(processor.hasFallback()).toBe(true);
    });

    it('should merge config instead of replacing', () => {
      processor.updateConfig({
        mode: TranscriptionMode.AUTO,
        openaiApiKey: 'sk-test-key'
      });

      expect(processor.getMode()).toBe(TranscriptionMode.AUTO);
      expect(processor.hasFallback()).toBe(true);

      // Update only mode, API key should remain
      processor.updateConfig({ mode: TranscriptionMode.LOCAL });

      expect(processor.getMode()).toBe(TranscriptionMode.LOCAL);
      // Note: hasFallback will be false because mode is LOCAL now
    });

    it('should handle empty config update', () => {
      const originalMode = processor.getMode();

      processor.updateConfig({});

      expect(processor.getMode()).toBe(originalMode);
    });
  });

  describe('edge cases and error handling', () => {
    it('should propagate progress callback errors', async () => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });

      const onProgress = vi.fn().mockImplementation(() => {
        throw new Error('Progress callback error');
      });

      // Progress callback errors should propagate
      await expect(
        processor.processTranscription(mockAudioBlob, { onProgress })
      ).rejects.toThrow('Progress callback error');
    });

    it('should handle missing options object', async () => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });

      const result = await processor.processTranscription(mockAudioBlob);

      expect(result).toBeDefined();
      expect(mockService.transcribe).toHaveBeenCalled();
    });

    it('should handle empty speaker map', async () => {
      mockService = createMockTranscriptionService();
      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });

      await processor.processTranscription(mockAudioBlob, { speakerMap: {} });

      expect(mockService.transcribe).toHaveBeenCalledWith(
        mockAudioBlob,
        expect.objectContaining({ speakerMap: {} })
      );
    });

    it('should handle transcription result with no segments', async () => {
      mockService = createMockTranscriptionService();
      mockService.transcribe = vi.fn().mockResolvedValue({
        text: 'Some text',
        segments: [],
        speakers: [],
        language: 'en',
        duration: 0
      });

      processor = new TranscriptionProcessor({
        transcriptionService: mockService
      });

      const result = await processor.processTranscription(mockAudioBlob);

      expect(result.segments).toHaveLength(0);
    });
  });
});
