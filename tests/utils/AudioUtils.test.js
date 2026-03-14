import {
  AudioUtils,
  SUPPORTED_MIME_TYPES,
  MAX_TRANSCRIPTION_SIZE
} from '../../scripts/utils/AudioUtils.mjs';

describe('AudioUtils', () => {
  // ── MediaRecorder mock ──────────────────────────────────────────────

  let originalMediaRecorder;
  let originalURL;
  let originalAudio;
  let originalNavigator;

  beforeEach(() => {
    originalMediaRecorder = globalThis.MediaRecorder;
    originalURL = globalThis.URL;
    originalAudio = globalThis.Audio;

    // Default mock: MediaRecorder with isTypeSupported
    globalThis.MediaRecorder = {
      isTypeSupported: vi.fn((type) => {
        // Support webm and ogg by default
        return type.startsWith('audio/webm') || type.startsWith('audio/ogg');
      })
    };

    // Mock URL
    globalThis.URL = {
      ...globalThis.URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    };

    // Mock Audio constructor
    globalThis.Audio = vi.fn().mockImplementation((url) => {
      const element = {
        src: url,
        addEventListener: vi.fn(),
        play: vi.fn(),
        pause: vi.fn()
      };
      return element;
    });
  });

  afterEach(() => {
    globalThis.MediaRecorder = originalMediaRecorder;
    if (originalURL) {
      globalThis.URL = originalURL;
    }
    if (originalAudio) {
      globalThis.Audio = originalAudio;
    }
  });

  // ── Exported constants ──────────────────────────────────────────────

  describe('exported constants', () => {
    it('should export SUPPORTED_MIME_TYPES array', () => {
      expect(Array.isArray(SUPPORTED_MIME_TYPES)).toBe(true);
      expect(SUPPORTED_MIME_TYPES.length).toBeGreaterThan(0);
    });

    it('should have mimeType, extension, and name on each supported type', () => {
      for (const format of SUPPORTED_MIME_TYPES) {
        expect(format).toHaveProperty('mimeType');
        expect(format).toHaveProperty('extension');
        expect(format).toHaveProperty('name');
      }
    });

    it('should export MAX_TRANSCRIPTION_SIZE as 25MB', () => {
      expect(MAX_TRANSCRIPTION_SIZE).toBe(25 * 1024 * 1024);
    });
  });

  // ── getSupportedMimeType() ──────────────────────────────────────────

  describe('getSupportedMimeType()', () => {
    it('should return the first supported MIME type', () => {
      const result = AudioUtils.getSupportedMimeType();
      // With our mock, audio/webm;codecs=opus is first and supported
      expect(result).toBe('audio/webm;codecs=opus');
    });

    it('should return null when MediaRecorder is undefined', () => {
      delete globalThis.MediaRecorder;
      const result = AudioUtils.getSupportedMimeType();
      expect(result).toBeNull();
    });

    it('should return null when no types are supported', () => {
      globalThis.MediaRecorder = {
        isTypeSupported: vi.fn(() => false)
      };
      const result = AudioUtils.getSupportedMimeType();
      expect(result).toBeNull();
    });

    it('should skip unsupported types and return the first supported one', () => {
      globalThis.MediaRecorder = {
        isTypeSupported: vi.fn((type) => {
          // Only support mp4
          return type === 'audio/mp4';
        })
      };
      const result = AudioUtils.getSupportedMimeType();
      expect(result).toBe('audio/mp4');
    });
  });

  // ── isTypeSupported() ───────────────────────────────────────────────

  describe('isTypeSupported()', () => {
    it('should return true for a supported type', () => {
      expect(AudioUtils.isTypeSupported('audio/webm')).toBe(true);
    });

    it('should return false for an unsupported type', () => {
      expect(AudioUtils.isTypeSupported('audio/flac')).toBe(false);
    });

    it('should return false when MediaRecorder is undefined', () => {
      delete globalThis.MediaRecorder;
      expect(AudioUtils.isTypeSupported('audio/webm')).toBe(false);
    });

    it('should delegate to MediaRecorder.isTypeSupported', () => {
      AudioUtils.isTypeSupported('audio/webm;codecs=opus');
      expect(MediaRecorder.isTypeSupported).toHaveBeenCalledWith('audio/webm;codecs=opus');
    });
  });

  // ── getAllSupportedTypes() ──────────────────────────────────────────

  describe('getAllSupportedTypes()', () => {
    it('should return array of supported format objects', () => {
      const types = AudioUtils.getAllSupportedTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);

      // All returned should be webm or ogg based on our mock
      for (const format of types) {
        expect(
          format.mimeType.startsWith('audio/webm') || format.mimeType.startsWith('audio/ogg')
        ).toBe(true);
      }
    });

    it('should return empty array when MediaRecorder is undefined', () => {
      delete globalThis.MediaRecorder;
      const types = AudioUtils.getAllSupportedTypes();
      expect(types).toEqual([]);
    });

    it('should return empty array when no types are supported', () => {
      globalThis.MediaRecorder = {
        isTypeSupported: vi.fn(() => false)
      };
      const types = AudioUtils.getAllSupportedTypes();
      expect(types).toEqual([]);
    });

    it('should return format objects with correct structure', () => {
      const types = AudioUtils.getAllSupportedTypes();
      for (const format of types) {
        expect(format).toHaveProperty('mimeType');
        expect(format).toHaveProperty('extension');
        expect(format).toHaveProperty('name');
      }
    });
  });

  // ── getExtensionForMimeType() ───────────────────────────────────────

  describe('getExtensionForMimeType()', () => {
    it('should return "webm" for audio/webm', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/webm')).toBe('webm');
    });

    it('should return "webm" for audio/webm;codecs=opus', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/webm;codecs=opus')).toBe('webm');
    });

    it('should return "ogg" for audio/ogg', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/ogg')).toBe('ogg');
    });

    it('should return "ogg" for audio/ogg;codecs=opus', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/ogg;codecs=opus')).toBe('ogg');
    });

    it('should return "mp4" for audio/mp4', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/mp4')).toBe('mp4');
    });

    it('should return "wav" for audio/wav', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/wav')).toBe('wav');
    });

    it('should return "mp3" for audio/mpeg', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/mpeg')).toBe('mp3');
    });

    it('should return "wav" for audio/x-wav via default extensions', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/x-wav')).toBe('wav');
    });

    it('should return "wav" for audio/wave via default extensions', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/wave')).toBe('wav');
    });

    it('should return "audio" for unknown types', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/unknown-format')).toBe('audio');
    });

    it('should handle uppercase MIME types', () => {
      expect(AudioUtils.getExtensionForMimeType('AUDIO/WEBM')).toBe('webm');
    });

    it('should handle types with codec parameters', () => {
      expect(AudioUtils.getExtensionForMimeType('audio/mp4;codecs=mp4a.40.2')).toBe('mp4');
    });
  });

  // ── createAudioBlob() ───────────────────────────────────────────────

  describe('createAudioBlob()', () => {
    it('should create a blob with explicit MIME type', () => {
      const chunks = [new Uint8Array([1, 2, 3]).buffer];
      const blob = AudioUtils.createAudioBlob(chunks, 'audio/mp3');
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mp3');
    });

    it('should fall back to detected MIME type when no type specified', () => {
      const chunks = [new Uint8Array([1, 2, 3]).buffer];
      const blob = AudioUtils.createAudioBlob(chunks);
      // getSupportedMimeType returns 'audio/webm;codecs=opus' with our mock
      expect(blob.type).toBe('audio/webm;codecs=opus');
    });

    it('should fall back to audio/webm when no type detected', () => {
      delete globalThis.MediaRecorder;
      const chunks = [new Uint8Array([1, 2, 3]).buffer];
      const blob = AudioUtils.createAudioBlob(chunks);
      expect(blob.type).toBe('audio/webm');
    });

    it('should handle multiple chunks', () => {
      const chunk1 = new Uint8Array([1, 2, 3]).buffer;
      const chunk2 = new Uint8Array([4, 5, 6]).buffer;
      const blob = AudioUtils.createAudioBlob([chunk1, chunk2], 'audio/webm');
      expect(blob.size).toBe(6);
    });

    it('should handle empty chunks array', () => {
      const blob = AudioUtils.createAudioBlob([], 'audio/webm');
      expect(blob.size).toBe(0);
    });
  });

  // ── blobToFile() ────────────────────────────────────────────────────

  describe('blobToFile()', () => {
    it('should create a File with correct filename and type', () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const file = AudioUtils.blobToFile(blob, 'my-recording');
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('my-recording.webm');
      expect(file.type).toBe('audio/webm');
    });

    it('should use default basename "recording"', () => {
      const blob = new Blob(['data'], { type: 'audio/ogg' });
      const file = AudioUtils.blobToFile(blob);
      expect(file.name).toBe('recording.ogg');
    });

    it('should derive extension from blob type', () => {
      const blob = new Blob(['data'], { type: 'audio/mpeg' });
      const file = AudioUtils.blobToFile(blob, 'test');
      expect(file.name).toBe('test.mp3');
    });

    it('should use "audio" extension for unknown types', () => {
      const blob = new Blob(['data'], { type: 'audio/unknown' });
      const file = AudioUtils.blobToFile(blob, 'test');
      expect(file.name).toBe('test.audio');
    });
  });

  // ── blobToBase64() ──────────────────────────────────────────────────

  describe('blobToBase64()', () => {
    it('should convert blob to base64 data URL', async () => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const result = await AudioUtils.blobToBase64(blob);
      expect(typeof result).toBe('string');
      expect(result).toContain('data:');
    });

    it('should handle audio blob', async () => {
      const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'audio/webm' });
      const result = await AudioUtils.blobToBase64(blob);
      expect(result).toContain('data:');
    });

    it('should reject on FileReader error', async () => {
      // Mock FileReader to simulate error
      const origFileReader = globalThis.FileReader;
      globalThis.FileReader = vi.fn().mockImplementation(() => ({
        readAsDataURL: vi.fn(function () {
          // Trigger error
          setTimeout(() => this.onerror(new Error('read error')), 0);
        }),
        result: null,
        onloadend: null,
        onerror: null
      }));

      const blob = new Blob(['data'], { type: 'audio/webm' });
      await expect(AudioUtils.blobToBase64(blob)).rejects.toThrow(
        'Failed to convert blob to base64'
      );

      globalThis.FileReader = origFileReader;
    });
  });

  // ── blobToArrayBuffer() ─────────────────────────────────────────────

  describe('blobToArrayBuffer()', () => {
    it('should convert blob to ArrayBuffer', async () => {
      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
      const result = await AudioUtils.blobToArrayBuffer(blob);
      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it('should preserve data content', async () => {
      const original = new Uint8Array([10, 20, 30]);
      const blob = new Blob([original], { type: 'audio/webm' });
      const buffer = await AudioUtils.blobToArrayBuffer(blob);
      const view = new Uint8Array(buffer);
      expect(view[0]).toBe(10);
      expect(view[1]).toBe(20);
      expect(view[2]).toBe(30);
    });

    it('should reject on FileReader error', async () => {
      const origFileReader = globalThis.FileReader;
      globalThis.FileReader = vi.fn().mockImplementation(() => ({
        readAsArrayBuffer: vi.fn(function () {
          setTimeout(() => this.onerror(new Error('read error')), 0);
        }),
        result: null,
        onloadend: null,
        onerror: null
      }));

      const blob = new Blob(['data'], { type: 'audio/webm' });
      await expect(AudioUtils.blobToArrayBuffer(blob)).rejects.toThrow(
        'Failed to convert blob to ArrayBuffer'
      );

      globalThis.FileReader = origFileReader;
    });
  });

  // ── base64ToBlob() ──────────────────────────────────────────────────

  describe('base64ToBlob()', () => {
    it('should convert a valid data URL to Blob', () => {
      // Create a known base64 data URL
      const base64Data = btoa('hello world');
      const dataUrl = `data:text/plain;base64,${base64Data}`;

      const blob = AudioUtils.base64ToBlob(dataUrl);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('text/plain');
      expect(blob.size).toBe(11); // 'hello world' is 11 bytes
    });

    it('should handle audio MIME type', () => {
      const base64Data = btoa(String.fromCharCode(0, 1, 2, 3));
      const dataUrl = `data:audio/webm;base64,${base64Data}`;

      const blob = AudioUtils.base64ToBlob(dataUrl);
      expect(blob.type).toBe('audio/webm');
      expect(blob.size).toBe(4);
    });

    it('should throw for invalid data URL format', () => {
      expect(() => AudioUtils.base64ToBlob('not-a-data-url')).toThrow('Invalid data URL format');
    });

    it('should throw for URL without base64 marker', () => {
      expect(() => AudioUtils.base64ToBlob('data:text/plain,hello')).toThrow(
        'Invalid data URL format'
      );
    });

    it('should throw for empty string', () => {
      expect(() => AudioUtils.base64ToBlob('')).toThrow('Invalid data URL format');
    });
  });

  // ── isWithinSizeLimit() ─────────────────────────────────────────────

  describe('isWithinSizeLimit()', () => {
    it('should return true for blob under 25MB', () => {
      const blob = new Blob(['small data'], { type: 'audio/webm' });
      expect(AudioUtils.isWithinSizeLimit(blob)).toBe(true);
    });

    it('should return true for blob exactly at 25MB', () => {
      // Create a blob that reports 25MB size
      const size = 25 * 1024 * 1024;
      const blob = new Blob([new ArrayBuffer(size)], { type: 'audio/webm' });
      expect(AudioUtils.isWithinSizeLimit(blob)).toBe(true);
    });

    it('should return false for blob over 25MB', () => {
      const size = 25 * 1024 * 1024 + 1;
      const blob = new Blob([new ArrayBuffer(size)], { type: 'audio/webm' });
      expect(AudioUtils.isWithinSizeLimit(blob)).toBe(false);
    });

    it('should return true for empty blob', () => {
      const blob = new Blob([], { type: 'audio/webm' });
      expect(AudioUtils.isWithinSizeLimit(blob)).toBe(true);
    });
  });

  // ── getBlobSizeMB() ─────────────────────────────────────────────────

  describe('getBlobSizeMB()', () => {
    it('should return size in megabytes rounded to 2 decimal places', () => {
      const blob = new Blob([new ArrayBuffer(1048576)], { type: 'audio/webm' }); // 1MB
      expect(AudioUtils.getBlobSizeMB(blob)).toBe(1);
    });

    it('should return 0 for empty blob', () => {
      const blob = new Blob([], { type: 'audio/webm' });
      expect(AudioUtils.getBlobSizeMB(blob)).toBe(0);
    });

    it('should round correctly for fractional MB', () => {
      // 1.5 MB = 1572864 bytes
      const blob = new Blob([new ArrayBuffer(1572864)], { type: 'audio/webm' });
      expect(AudioUtils.getBlobSizeMB(blob)).toBe(1.5);
    });

    it('should handle small blobs', () => {
      const blob = new Blob(['hello'], { type: 'audio/webm' }); // 5 bytes
      const sizeMB = AudioUtils.getBlobSizeMB(blob);
      expect(sizeMB).toBeGreaterThanOrEqual(0);
      expect(sizeMB).toBeLessThan(0.01);
    });
  });

  // ── estimateDuration() ──────────────────────────────────────────────

  describe('estimateDuration()', () => {
    it('should estimate duration for audio/webm', () => {
      // 16000 bytes/sec for webm => 160000 bytes = 10 seconds
      const blob = new Blob([new ArrayBuffer(160000)], { type: 'audio/webm' });
      expect(AudioUtils.estimateDuration(blob)).toBe(10);
    });

    it('should estimate duration for audio/ogg', () => {
      const blob = new Blob([new ArrayBuffer(160000)], { type: 'audio/ogg' });
      expect(AudioUtils.estimateDuration(blob)).toBe(10);
    });

    it('should estimate duration for audio/mp4', () => {
      const blob = new Blob([new ArrayBuffer(160000)], { type: 'audio/mp4' });
      expect(AudioUtils.estimateDuration(blob)).toBe(10);
    });

    it('should estimate duration for audio/mpeg', () => {
      const blob = new Blob([new ArrayBuffer(160000)], { type: 'audio/mpeg' });
      expect(AudioUtils.estimateDuration(blob)).toBe(10);
    });

    it('should use wav bitrate for audio/wav', () => {
      // 176400 bytes/sec for WAV
      const blob = new Blob([new ArrayBuffer(176400)], { type: 'audio/wav' });
      expect(AudioUtils.estimateDuration(blob)).toBe(1);
    });

    it('should use default bitrate for unknown types', () => {
      // Should fall back to 16000 bytes/sec
      const blob = new Blob([new ArrayBuffer(160000)], { type: 'audio/unknown' });
      expect(AudioUtils.estimateDuration(blob)).toBe(10);
    });

    it('should handle codecs in MIME type (strip them)', () => {
      // audio/webm;codecs=opus -> baseType is audio/webm
      const blob = new Blob([new ArrayBuffer(160000)], { type: 'audio/webm;codecs=opus' });
      expect(AudioUtils.estimateDuration(blob)).toBe(10);
    });

    it('should return 0 for empty blob', () => {
      const blob = new Blob([], { type: 'audio/webm' });
      expect(AudioUtils.estimateDuration(blob)).toBe(0);
    });
  });

  // ── formatDuration() ────────────────────────────────────────────────

  describe('formatDuration()', () => {
    it('should format seconds only', () => {
      expect(AudioUtils.formatDuration(5)).toBe('0:05');
    });

    it('should format minutes and seconds', () => {
      expect(AudioUtils.formatDuration(125)).toBe('2:05');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(AudioUtils.formatDuration(3661)).toBe('1:01:01');
    });

    it('should pad seconds with leading zero', () => {
      expect(AudioUtils.formatDuration(63)).toBe('1:03');
    });

    it('should pad minutes with leading zero when hours present', () => {
      expect(AudioUtils.formatDuration(3605)).toBe('1:00:05');
    });

    it('should handle zero duration', () => {
      expect(AudioUtils.formatDuration(0)).toBe('0:00');
    });

    it('should handle exactly one hour', () => {
      expect(AudioUtils.formatDuration(3600)).toBe('1:00:00');
    });

    it('should handle large durations', () => {
      // 10 hours 30 minutes 45 seconds = 37845
      expect(AudioUtils.formatDuration(37845)).toBe('10:30:45');
    });

    it('should floor fractional seconds', () => {
      expect(AudioUtils.formatDuration(65.7)).toBe('1:05');
    });
  });

  // ── isValidAudioBlob() ──────────────────────────────────────────────

  describe('isValidAudioBlob()', () => {
    it('should return true for valid audio blob', () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      expect(AudioUtils.isValidAudioBlob(blob)).toBe(true);
    });

    it('should return true for application/ogg blob', () => {
      const blob = new Blob(['data'], { type: 'application/ogg' });
      expect(AudioUtils.isValidAudioBlob(blob)).toBe(true);
    });

    it('should return true for audio/mpeg blob', () => {
      const blob = new Blob(['data'], { type: 'audio/mpeg' });
      expect(AudioUtils.isValidAudioBlob(blob)).toBe(true);
    });

    it('should return false for null', () => {
      expect(AudioUtils.isValidAudioBlob(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(AudioUtils.isValidAudioBlob(undefined)).toBe(false);
    });

    it('should return false for non-blob object', () => {
      expect(AudioUtils.isValidAudioBlob({ size: 100, type: 'audio/webm' })).toBe(false);
    });

    it('should return false for empty blob', () => {
      const blob = new Blob([], { type: 'audio/webm' });
      expect(AudioUtils.isValidAudioBlob(blob)).toBe(false);
    });

    it('should return false for non-audio MIME type', () => {
      const blob = new Blob(['data'], { type: 'text/plain' });
      expect(AudioUtils.isValidAudioBlob(blob)).toBe(false);
    });

    it('should return false for video MIME type', () => {
      const blob = new Blob(['data'], { type: 'video/mp4' });
      expect(AudioUtils.isValidAudioBlob(blob)).toBe(false);
    });

    it('should handle uppercase audio type', () => {
      const blob = new Blob(['data'], { type: 'AUDIO/WEBM' });
      expect(AudioUtils.isValidAudioBlob(blob)).toBe(true);
    });
  });

  // ── getRecorderOptions() ────────────────────────────────────────────

  describe('getRecorderOptions()', () => {
    it('should return default options with detected MIME type', () => {
      const options = AudioUtils.getRecorderOptions();
      expect(options.audioBitsPerSecond).toBe(128000);
      expect(options.mimeType).toBe('audio/webm;codecs=opus');
    });

    it('should use custom MIME type when provided', () => {
      const options = AudioUtils.getRecorderOptions({ mimeType: 'audio/ogg' });
      expect(options.mimeType).toBe('audio/ogg');
    });

    it('should use custom bitrate when provided', () => {
      const options = AudioUtils.getRecorderOptions({ audioBitsPerSecond: 256000 });
      expect(options.audioBitsPerSecond).toBe(256000);
    });

    it('should omit mimeType when no type is supported', () => {
      delete globalThis.MediaRecorder;
      const options = AudioUtils.getRecorderOptions();
      expect(options.audioBitsPerSecond).toBe(128000);
      expect(options.mimeType).toBeUndefined();
    });

    it('should include mimeType when supported type exists', () => {
      const options = AudioUtils.getRecorderOptions();
      expect(options).toHaveProperty('mimeType');
    });
  });

  // ── createAudioElement() ────────────────────────────────────────────

  describe('createAudioElement()', () => {
    it('should create audio element with object URL', () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const audio = AudioUtils.createAudioElement(blob);

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(Audio).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should register an ended event listener for cleanup', () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const audio = AudioUtils.createAudioElement(blob);

      expect(audio.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function), {
        once: true
      });
    });

    it('should revoke object URL on ended event', () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const audio = AudioUtils.createAudioElement(blob);

      // Get the ended callback
      const endedCall = audio.addEventListener.mock.calls.find((call) => call[0] === 'ended');
      const endedCallback = endedCall[1];

      // Invoke it
      endedCallback();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  // ── getMaxTranscriptionSize() ───────────────────────────────────────

  describe('getMaxTranscriptionSize()', () => {
    it('should return the MAX_TRANSCRIPTION_SIZE constant', () => {
      expect(AudioUtils.getMaxTranscriptionSize()).toBe(25 * 1024 * 1024);
    });

    it('should return same value as exported constant', () => {
      expect(AudioUtils.getMaxTranscriptionSize()).toBe(MAX_TRANSCRIPTION_SIZE);
    });
  });

  // ── getBrowserCapabilities() ────────────────────────────────────────

  describe('getBrowserCapabilities()', () => {
    it('should report MediaRecorder as supported when available', () => {
      const caps = AudioUtils.getBrowserCapabilities();
      expect(caps.mediaRecorderSupported).toBe(true);
    });

    it('should report MediaRecorder as unsupported when unavailable', () => {
      delete globalThis.MediaRecorder;
      const caps = AudioUtils.getBrowserCapabilities();
      expect(caps.mediaRecorderSupported).toBe(false);
    });

    it('should report getUserMedia support based on navigator', () => {
      // jsdom may or may not have mediaDevices
      const caps = AudioUtils.getBrowserCapabilities();
      expect(typeof caps.getUserMediaSupported).toBe('boolean');
    });

    it('should include supported formats list', () => {
      const caps = AudioUtils.getBrowserCapabilities();
      expect(Array.isArray(caps.supportedFormats)).toBe(true);
      expect(caps.supportedFormats.length).toBeGreaterThan(0);
    });

    it('should include preferred format', () => {
      const caps = AudioUtils.getBrowserCapabilities();
      expect(caps.preferredFormat).toBe('audio/webm;codecs=opus');
    });

    it('should set canRecord based on all capabilities', () => {
      const caps = AudioUtils.getBrowserCapabilities();
      // canRecord requires MediaRecorder, getUserMedia, and supportedFormats
      expect(typeof caps.canRecord).toBe('boolean');
    });

    it('should return canRecord false when MediaRecorder is missing', () => {
      delete globalThis.MediaRecorder;
      const caps = AudioUtils.getBrowserCapabilities();
      expect(caps.canRecord).toBe(false);
    });

    it('should return empty formats when MediaRecorder is missing', () => {
      delete globalThis.MediaRecorder;
      const caps = AudioUtils.getBrowserCapabilities();
      expect(caps.supportedFormats).toEqual([]);
      expect(caps.preferredFormat).toBeNull();
    });

    it('should report getUserMedia supported when navigator.mediaDevices exists', () => {
      // Ensure navigator.mediaDevices.getUserMedia exists
      const origNavigator = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          ...origNavigator,
          mediaDevices: {
            getUserMedia: vi.fn()
          }
        },
        configurable: true
      });

      const caps = AudioUtils.getBrowserCapabilities();
      expect(caps.getUserMediaSupported).toBe(true);

      Object.defineProperty(globalThis, 'navigator', {
        value: origNavigator,
        configurable: true
      });
    });
  });
});
