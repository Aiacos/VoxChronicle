/**
 * AudioUtils Unit Tests
 *
 * Tests for the AudioUtils audio processing utilities.
 * Covers MIME type detection, blob conversion, validation, and browser capability detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing AudioUtils
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

// Import after mocks are set up
import { AudioUtils, SUPPORTED_MIME_TYPES, MAX_TRANSCRIPTION_SIZE } from '../../scripts/utils/AudioUtils.mjs';

describe('AudioUtils', () => {
  let mockMediaRecorder;
  let originalMediaRecorder;

  beforeEach(() => {
    vi.clearAllMocks();

    // Save original MediaRecorder if it exists
    originalMediaRecorder = globalThis.MediaRecorder;

    // Create mock MediaRecorder
    mockMediaRecorder = {
      isTypeSupported: vi.fn()
    };
    globalThis.MediaRecorder = mockMediaRecorder;
  });

  afterEach(() => {
    // Restore original MediaRecorder
    if (originalMediaRecorder !== undefined) {
      globalThis.MediaRecorder = originalMediaRecorder;
    } else {
      delete globalThis.MediaRecorder;
    }
  });

  // ============================================================================
  // getSupportedMimeType - MIME Type Detection
  // ============================================================================

  describe('getSupportedMimeType - MIME type detection', () => {
    it('should return first supported MIME type', () => {
      mockMediaRecorder.isTypeSupported.mockImplementation(type =>
        type === 'audio/webm;codecs=opus'
      );

      const result = AudioUtils.getSupportedMimeType();
      expect(result).toBe('audio/webm;codecs=opus');
    });

    it('should return second option if first is not supported', () => {
      mockMediaRecorder.isTypeSupported.mockImplementation(type =>
        type === 'audio/webm'
      );

      const result = AudioUtils.getSupportedMimeType();
      expect(result).toBe('audio/webm');
    });

    it('should return null if no MIME types are supported', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(false);

      const result = AudioUtils.getSupportedMimeType();
      expect(result).toBeNull();
    });

    it('should return null if MediaRecorder is undefined', () => {
      delete globalThis.MediaRecorder;

      const result = AudioUtils.getSupportedMimeType();
      expect(result).toBeNull();
    });

    it('should check MIME types in correct order', () => {
      const checkedTypes = [];
      mockMediaRecorder.isTypeSupported.mockImplementation(type => {
        checkedTypes.push(type);
        return type === 'audio/ogg';
      });

      AudioUtils.getSupportedMimeType();

      expect(checkedTypes[0]).toBe('audio/webm;codecs=opus');
      expect(checkedTypes[1]).toBe('audio/webm');
      expect(checkedTypes[2]).toBe('audio/ogg;codecs=opus');
      expect(checkedTypes[3]).toBe('audio/ogg');
    });
  });

  // ============================================================================
  // isTypeSupported - Individual MIME Type Check
  // ============================================================================

  describe('isTypeSupported - individual MIME type check', () => {
    it('should return true for supported MIME type', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(true);

      const result = AudioUtils.isTypeSupported('audio/webm');
      expect(result).toBe(true);
    });

    it('should return false for unsupported MIME type', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(false);

      const result = AudioUtils.isTypeSupported('audio/flac');
      expect(result).toBe(false);
    });

    it('should return false if MediaRecorder is undefined', () => {
      delete globalThis.MediaRecorder;

      const result = AudioUtils.isTypeSupported('audio/webm');
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // getAllSupportedTypes - Get All Supported MIME Types
  // ============================================================================

  describe('getAllSupportedTypes - get all supported MIME types', () => {
    it('should return all supported MIME types', () => {
      mockMediaRecorder.isTypeSupported.mockImplementation(type =>
        type.includes('webm') || type.includes('ogg')
      );

      const result = AudioUtils.getAllSupportedTypes();
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(format => format.mimeType.includes('webm') || format.mimeType.includes('ogg'))).toBe(true);
    });

    it('should return empty array if no MIME types are supported', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(false);

      const result = AudioUtils.getAllSupportedTypes();
      expect(result).toEqual([]);
    });

    it('should return empty array if MediaRecorder is undefined', () => {
      delete globalThis.MediaRecorder;

      const result = AudioUtils.getAllSupportedTypes();
      expect(result).toEqual([]);
    });

    it('should return format objects with mimeType, extension, and name', () => {
      mockMediaRecorder.isTypeSupported.mockImplementation(type =>
        type === 'audio/webm;codecs=opus'
      );

      const result = AudioUtils.getAllSupportedTypes();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('mimeType');
      expect(result[0]).toHaveProperty('extension');
      expect(result[0]).toHaveProperty('name');
    });
  });

  // ============================================================================
  // getExtensionForMimeType - File Extension Detection
  // ============================================================================

  describe('getExtensionForMimeType - file extension detection', () => {
    it('should return webm for audio/webm', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/webm');
      expect(result).toBe('webm');
    });

    it('should return webm for audio/webm with codecs', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/webm;codecs=opus');
      expect(result).toBe('webm');
    });

    it('should return ogg for audio/ogg', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/ogg');
      expect(result).toBe('ogg');
    });

    it('should return mp4 for audio/mp4', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/mp4');
      expect(result).toBe('mp4');
    });

    it('should return mp4 for audio/mp4 with codecs', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/mp4;codecs=mp4a.40.2');
      expect(result).toBe('mp4');
    });

    it('should return mp3 for audio/mpeg', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/mpeg');
      expect(result).toBe('mp3');
    });

    it('should return wav for audio/wav', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/wav');
      expect(result).toBe('wav');
    });

    it('should return wav for audio/x-wav', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/x-wav');
      expect(result).toBe('wav');
    });

    it('should return wav for audio/wave', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/wave');
      expect(result).toBe('wav');
    });

    it('should return audio for unknown MIME type', () => {
      const result = AudioUtils.getExtensionForMimeType('audio/unknown');
      expect(result).toBe('audio');
    });

    it('should handle MIME type with uppercase', () => {
      const result = AudioUtils.getExtensionForMimeType('AUDIO/WEBM');
      expect(result).toBe('webm');
    });
  });

  // ============================================================================
  // createAudioBlob - Blob Creation
  // ============================================================================

  describe('createAudioBlob - blob creation', () => {
    it('should create blob from chunks with specified MIME type', () => {
      const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
      const mimeType = 'audio/webm';

      const result = AudioUtils.createAudioBlob(chunks, mimeType);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe(mimeType);
    });

    it('should create blob with auto-detected MIME type if not specified', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(true);
      const chunks = [new Uint8Array([1, 2, 3])];

      const result = AudioUtils.createAudioBlob(chunks);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBeTruthy();
    });

    it('should fallback to audio/webm if no MIME type detected', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(false);
      const chunks = [new Uint8Array([1, 2, 3])];

      const result = AudioUtils.createAudioBlob(chunks);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('audio/webm');
    });

    it('should handle empty chunks array', () => {
      const chunks = [];
      const mimeType = 'audio/webm';

      const result = AudioUtils.createAudioBlob(chunks, mimeType);

      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBe(0);
    });
  });

  // ============================================================================
  // blobToFile - Blob to File Conversion
  // ============================================================================

  describe('blobToFile - blob to file conversion', () => {
    it('should convert blob to file with default name', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

      const result = AudioUtils.blobToFile(blob);

      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe('recording.webm');
      expect(result.type).toBe('audio/webm');
    });

    it('should convert blob to file with custom name', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

      const result = AudioUtils.blobToFile(blob, 'my-session');

      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe('my-session.webm');
    });

    it('should use correct extension for ogg blob', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' });

      const result = AudioUtils.blobToFile(blob, 'recording');

      expect(result.name).toBe('recording.ogg');
    });

    it('should use correct extension for mp4 blob', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' });

      const result = AudioUtils.blobToFile(blob, 'recording');

      expect(result.name).toBe('recording.mp4');
    });

    it('should use mp4 extension for mp4 with codecs', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4;codecs=mp4a.40.2' });

      const result = AudioUtils.blobToFile(blob, 'recording');

      expect(result.name).toBe('recording.mp4');
    });
  });

  // ============================================================================
  // blobToBase64 - Blob to Base64 Conversion
  // ============================================================================

  describe('blobToBase64 - blob to base64 conversion', () => {
    it('should convert blob to base64 data URL', async () => {
      const blob = new Blob(['test data'], { type: 'audio/webm' });

      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: vi.fn(function() {
          this.result = 'data:audio/webm;base64,dGVzdCBkYXRh';
          this.onloadend();
        }),
        result: null,
        onloadend: null,
        onerror: null
      };

      globalThis.FileReader = vi.fn(() => mockFileReader);

      const result = await AudioUtils.blobToBase64(blob);

      expect(result).toBe('data:audio/webm;base64,dGVzdCBkYXRh');
      expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(blob);
    });

    it('should reject on FileReader error', async () => {
      const blob = new Blob(['test data'], { type: 'audio/webm' });

      // Mock FileReader with error
      const mockFileReader = {
        readAsDataURL: vi.fn(function() {
          this.onerror();
        }),
        result: null,
        onloadend: null,
        onerror: null
      };

      globalThis.FileReader = vi.fn(() => mockFileReader);

      await expect(AudioUtils.blobToBase64(blob)).rejects.toThrow('Failed to convert blob to base64');
    });
  });

  // ============================================================================
  // blobToArrayBuffer - Blob to ArrayBuffer Conversion
  // ============================================================================

  describe('blobToArrayBuffer - blob to ArrayBuffer conversion', () => {
    it('should convert blob to ArrayBuffer', async () => {
      const blob = new Blob(['test data'], { type: 'audio/webm' });
      const mockArrayBuffer = new ArrayBuffer(9);

      // Mock FileReader
      const mockFileReader = {
        readAsArrayBuffer: vi.fn(function() {
          this.result = mockArrayBuffer;
          this.onloadend();
        }),
        result: null,
        onloadend: null,
        onerror: null
      };

      globalThis.FileReader = vi.fn(() => mockFileReader);

      const result = await AudioUtils.blobToArrayBuffer(blob);

      expect(result).toBe(mockArrayBuffer);
      expect(mockFileReader.readAsArrayBuffer).toHaveBeenCalledWith(blob);
    });

    it('should reject on FileReader error', async () => {
      const blob = new Blob(['test data'], { type: 'audio/webm' });

      // Mock FileReader with error
      const mockFileReader = {
        readAsArrayBuffer: vi.fn(function() {
          this.onerror();
        }),
        result: null,
        onloadend: null,
        onerror: null
      };

      globalThis.FileReader = vi.fn(() => mockFileReader);

      await expect(AudioUtils.blobToArrayBuffer(blob)).rejects.toThrow('Failed to convert blob to ArrayBuffer');
    });
  });

  // ============================================================================
  // base64ToBlob - Base64 to Blob Conversion
  // ============================================================================

  describe('base64ToBlob - base64 to blob conversion', () => {
    beforeEach(() => {
      // Mock atob (base64 decode)
      globalThis.atob = vi.fn((str) => {
        // Simple mock - just return a decoded string
        return 'decoded data';
      });
    });

    it('should convert base64 data URL to blob', () => {
      const dataUrl = 'data:audio/webm;base64,dGVzdCBkYXRh';

      const result = AudioUtils.base64ToBlob(dataUrl);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('audio/webm');
    });

    it('should throw error for invalid data URL format', () => {
      const invalidDataUrl = 'not-a-valid-data-url';

      expect(() => AudioUtils.base64ToBlob(invalidDataUrl)).toThrow('Invalid data URL format');
    });

    it('should handle different MIME types', () => {
      const dataUrl = 'data:audio/ogg;base64,dGVzdCBkYXRh';

      const result = AudioUtils.base64ToBlob(dataUrl);

      expect(result.type).toBe('audio/ogg');
    });

    it('should throw error for data URL without base64 marker', () => {
      const dataUrl = 'data:audio/webm,somedata';

      expect(() => AudioUtils.base64ToBlob(dataUrl)).toThrow('Invalid data URL format');
    });
  });

  // ============================================================================
  // isWithinSizeLimit - Size Limit Check
  // ============================================================================

  describe('isWithinSizeLimit - size limit check', () => {
    it('should return true for blob within size limit', () => {
      const blob = new Blob([new Uint8Array(1024 * 1024)]); // 1MB

      const result = AudioUtils.isWithinSizeLimit(blob);
      expect(result).toBe(true);
    });

    it('should return true for blob exactly at size limit', () => {
      const blob = new Blob([new Uint8Array(MAX_TRANSCRIPTION_SIZE)]);

      const result = AudioUtils.isWithinSizeLimit(blob);
      expect(result).toBe(true);
    });

    it('should return false for blob over size limit', () => {
      const blob = new Blob([new Uint8Array(MAX_TRANSCRIPTION_SIZE + 1)]);

      const result = AudioUtils.isWithinSizeLimit(blob);
      expect(result).toBe(false);
    });

    it('should return true for empty blob', () => {
      const blob = new Blob([]);

      const result = AudioUtils.isWithinSizeLimit(blob);
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // getBlobSizeMB - Size in Megabytes
  // ============================================================================

  describe('getBlobSizeMB - size in megabytes', () => {
    it('should return size in megabytes rounded to 2 decimals', () => {
      const blob = new Blob([new Uint8Array(1024 * 1024)]); // 1MB

      const result = AudioUtils.getBlobSizeMB(blob);
      expect(result).toBe(1.0);
    });

    it('should round to 2 decimal places', () => {
      const blob = new Blob([new Uint8Array(1536 * 1024)]); // 1.5MB

      const result = AudioUtils.getBlobSizeMB(blob);
      expect(result).toBe(1.5);
    });

    it('should return 0 for empty blob', () => {
      const blob = new Blob([]);

      const result = AudioUtils.getBlobSizeMB(blob);
      expect(result).toBe(0);
    });

    it('should handle small blobs', () => {
      const blob = new Blob([new Uint8Array(512 * 1024)]); // 0.5MB

      const result = AudioUtils.getBlobSizeMB(blob);
      expect(result).toBe(0.5);
    });
  });

  // ============================================================================
  // estimateDuration - Duration Estimation
  // ============================================================================

  describe('estimateDuration - duration estimation', () => {
    it('should estimate duration for webm blob', () => {
      const blob = new Blob([new Uint8Array(16000 * 60)], { type: 'audio/webm' }); // 60 seconds at 16000 bytes/sec

      const result = AudioUtils.estimateDuration(blob);
      expect(result).toBe(60);
    });

    it('should estimate duration for ogg blob', () => {
      const blob = new Blob([new Uint8Array(16000 * 120)], { type: 'audio/ogg' }); // 120 seconds at 16000 bytes/sec

      const result = AudioUtils.estimateDuration(blob);
      expect(result).toBe(120);
    });

    it('should estimate duration for wav blob with different bitrate', () => {
      const blob = new Blob([new Uint8Array(176400 * 10)], { type: 'audio/wav' }); // 10 seconds at 176400 bytes/sec

      const result = AudioUtils.estimateDuration(blob);
      expect(result).toBe(10);
    });

    it('should use default bitrate for unknown type', () => {
      const blob = new Blob([new Uint8Array(16000 * 30)], { type: 'audio/unknown' });

      const result = AudioUtils.estimateDuration(blob);
      expect(result).toBe(30);
    });

    it('should return 0 for empty blob', () => {
      const blob = new Blob([], { type: 'audio/webm' });

      const result = AudioUtils.estimateDuration(blob);
      expect(result).toBe(0);
    });
  });

  // ============================================================================
  // formatDuration - Duration Formatting
  // ============================================================================

  describe('formatDuration - duration formatting', () => {
    it('should format seconds only', () => {
      const result = AudioUtils.formatDuration(45);
      expect(result).toBe('0:45');
    });

    it('should format minutes and seconds', () => {
      const result = AudioUtils.formatDuration(125);
      expect(result).toBe('2:05');
    });

    it('should format hours, minutes, and seconds', () => {
      const result = AudioUtils.formatDuration(3665);
      expect(result).toBe('1:01:05');
    });

    it('should pad single digit minutes and seconds in hours format', () => {
      const result = AudioUtils.formatDuration(3605);
      expect(result).toBe('1:00:05');
    });

    it('should handle zero seconds', () => {
      const result = AudioUtils.formatDuration(0);
      expect(result).toBe('0:00');
    });

    it('should handle exactly one minute', () => {
      const result = AudioUtils.formatDuration(60);
      expect(result).toBe('1:00');
    });

    it('should handle exactly one hour', () => {
      const result = AudioUtils.formatDuration(3600);
      expect(result).toBe('1:00:00');
    });

    it('should not pad single digit minutes without hours', () => {
      const result = AudioUtils.formatDuration(65);
      expect(result).toBe('1:05');
    });

    it('should handle large durations', () => {
      const result = AudioUtils.formatDuration(36000); // 10 hours
      expect(result).toBe('10:00:00');
    });
  });

  // ============================================================================
  // isValidAudioBlob - Audio Blob Validation
  // ============================================================================

  describe('isValidAudioBlob - audio blob validation', () => {
    it('should return true for valid audio blob', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

      const result = AudioUtils.isValidAudioBlob(blob);
      expect(result).toBe(true);
    });

    it('should return true for ogg audio blob', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' });

      const result = AudioUtils.isValidAudioBlob(blob);
      expect(result).toBe(true);
    });

    it('should return true for application/ogg blob', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/ogg' });

      const result = AudioUtils.isValidAudioBlob(blob);
      expect(result).toBe(true);
    });

    it('should return false for empty blob', () => {
      const blob = new Blob([], { type: 'audio/webm' });

      const result = AudioUtils.isValidAudioBlob(blob);
      expect(result).toBe(false);
    });

    it('should return false for non-audio blob', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'text/plain' });

      const result = AudioUtils.isValidAudioBlob(blob);
      expect(result).toBe(false);
    });

    it('should return false for null', () => {
      const result = AudioUtils.isValidAudioBlob(null);
      expect(result).toBe(false);
    });

    it('should return false for undefined', () => {
      const result = AudioUtils.isValidAudioBlob(undefined);
      expect(result).toBe(false);
    });

    it('should return false for non-Blob object', () => {
      const result = AudioUtils.isValidAudioBlob({ type: 'audio/webm', size: 100 });
      expect(result).toBe(false);
    });

    it('should handle uppercase MIME type', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'AUDIO/WEBM' });

      const result = AudioUtils.isValidAudioBlob(blob);
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // getRecorderOptions - MediaRecorder Options
  // ============================================================================

  describe('getRecorderOptions - MediaRecorder options', () => {
    it('should return default options with auto-detected MIME type', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(true);

      const result = AudioUtils.getRecorderOptions();

      expect(result).toHaveProperty('audioBitsPerSecond', 128000);
      expect(result).toHaveProperty('mimeType');
    });

    it('should use custom MIME type if provided', () => {
      const result = AudioUtils.getRecorderOptions({ mimeType: 'audio/ogg' });

      expect(result.mimeType).toBe('audio/ogg');
    });

    it('should use custom bitrate if provided', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(true);

      const result = AudioUtils.getRecorderOptions({ audioBitsPerSecond: 256000 });

      expect(result.audioBitsPerSecond).toBe(256000);
    });

    it('should not include mimeType if none detected and none provided', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(false);

      const result = AudioUtils.getRecorderOptions();

      expect(result).not.toHaveProperty('mimeType');
      expect(result).toHaveProperty('audioBitsPerSecond', 128000);
    });

    it('should handle both custom MIME type and bitrate', () => {
      const result = AudioUtils.getRecorderOptions({
        mimeType: 'audio/mp4',
        audioBitsPerSecond: 192000
      });

      expect(result.mimeType).toBe('audio/mp4');
      expect(result.audioBitsPerSecond).toBe(192000);
    });
  });

  // ============================================================================
  // createAudioElement - Audio Element Creation
  // ============================================================================

  describe('createAudioElement - audio element creation', () => {
    let mockAudio;
    let mockObjectURL;

    beforeEach(() => {
      mockObjectURL = 'blob:mock-url';

      // Mock URL.createObjectURL
      globalThis.URL = {
        createObjectURL: vi.fn(() => mockObjectURL),
        revokeObjectURL: vi.fn()
      };

      // Mock Audio constructor
      mockAudio = {
        src: '',
        addEventListener: vi.fn()
      };
      globalThis.Audio = vi.fn(() => mockAudio);
    });

    it('should create audio element from blob', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

      const result = AudioUtils.createAudioElement(blob);

      expect(result).toBe(mockAudio);
      expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(globalThis.Audio).toHaveBeenCalledWith(mockObjectURL);
    });

    it('should add ended event listener for cleanup', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

      AudioUtils.createAudioElement(blob);

      expect(mockAudio.addEventListener).toHaveBeenCalledWith(
        'ended',
        expect.any(Function),
        { once: true }
      );
    });

    it('should revoke object URL when audio ends', () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

      AudioUtils.createAudioElement(blob);

      // Get the event listener callback
      const endedCallback = mockAudio.addEventListener.mock.calls[0][1];

      // Simulate audio ending
      endedCallback();

      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectURL);
    });
  });

  // ============================================================================
  // getMaxTranscriptionSize - Get Max Size Constant
  // ============================================================================

  describe('getMaxTranscriptionSize - get max size constant', () => {
    it('should return MAX_TRANSCRIPTION_SIZE constant', () => {
      const result = AudioUtils.getMaxTranscriptionSize();
      expect(result).toBe(MAX_TRANSCRIPTION_SIZE);
      expect(result).toBe(25 * 1024 * 1024);
    });
  });

  // ============================================================================
  // getBrowserCapabilities - Browser Capabilities Report
  // ============================================================================

  describe('getBrowserCapabilities - browser capabilities report', () => {
    it('should return full capabilities when all features supported', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(true);

      // Mock navigator.mediaDevices
      globalThis.navigator = {
        mediaDevices: {
          getUserMedia: vi.fn()
        }
      };

      const result = AudioUtils.getBrowserCapabilities();

      expect(result).toHaveProperty('mediaRecorderSupported', true);
      expect(result).toHaveProperty('getUserMediaSupported', true);
      expect(result).toHaveProperty('supportedFormats');
      expect(result).toHaveProperty('preferredFormat');
      expect(result).toHaveProperty('canRecord', true);
    });

    it('should indicate MediaRecorder not supported', () => {
      delete globalThis.MediaRecorder;

      const result = AudioUtils.getBrowserCapabilities();

      expect(result.mediaRecorderSupported).toBe(false);
      expect(result.canRecord).toBe(false);
    });

    it('should indicate getUserMedia not supported', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(true);
      globalThis.navigator = {};

      const result = AudioUtils.getBrowserCapabilities();

      expect(result.getUserMediaSupported).toBe(false);
      expect(result.canRecord).toBe(false);
    });

    it('should indicate canRecord false when no formats supported', () => {
      mockMediaRecorder.isTypeSupported.mockReturnValue(false);
      globalThis.navigator = {
        mediaDevices: {
          getUserMedia: vi.fn()
        }
      };

      const result = AudioUtils.getBrowserCapabilities();

      expect(result.supportedFormats).toEqual([]);
      expect(result.canRecord).toBe(false);
    });

    it('should list all supported formats', () => {
      mockMediaRecorder.isTypeSupported.mockImplementation(type =>
        type.includes('webm')
      );
      globalThis.navigator = {
        mediaDevices: {
          getUserMedia: vi.fn()
        }
      };

      const result = AudioUtils.getBrowserCapabilities();

      expect(result.supportedFormats.length).toBeGreaterThan(0);
      expect(result.supportedFormats.every(f => f.mimeType.includes('webm'))).toBe(true);
    });
  });

  // ============================================================================
  // Constants Export
  // ============================================================================

  describe('exported constants', () => {
    it('should export SUPPORTED_MIME_TYPES array', () => {
      expect(SUPPORTED_MIME_TYPES).toBeDefined();
      expect(Array.isArray(SUPPORTED_MIME_TYPES)).toBe(true);
      expect(SUPPORTED_MIME_TYPES.length).toBeGreaterThan(0);
    });

    it('should export MAX_TRANSCRIPTION_SIZE constant', () => {
      expect(MAX_TRANSCRIPTION_SIZE).toBeDefined();
      expect(MAX_TRANSCRIPTION_SIZE).toBe(25 * 1024 * 1024);
    });

    it('SUPPORTED_MIME_TYPES should contain format objects', () => {
      SUPPORTED_MIME_TYPES.forEach(format => {
        expect(format).toHaveProperty('mimeType');
        expect(format).toHaveProperty('extension');
        expect(format).toHaveProperty('name');
      });
    });

    it('should have webm/opus as first preference', () => {
      expect(SUPPORTED_MIME_TYPES[0].mimeType).toBe('audio/webm;codecs=opus');
    });
  });
});
