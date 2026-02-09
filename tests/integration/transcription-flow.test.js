/**
 * Transcription Flow Integration Tests
 *
 * End-to-end integration tests for the complete transcription workflow.
 * Tests the interaction between AudioRecorder, AudioChunker, and TranscriptionService
 * through real-world scenarios including speaker diarization, chunking, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing services
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

// Mock SensitiveDataFilter
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeObject: vi.fn((obj) => obj),
    sanitizeUrl: vi.fn((url) => url),
    sanitizeMessage: vi.fn((msg) => msg),
    sanitizeString: vi.fn((str) => str)
  }
}));

// Mock global game object for Foundry VTT
globalThis.game = {
  settings: {
    get: vi.fn((module, key) => {
      if (key === 'openaiApiKey') return 'test-openai-key';
      return null;
    }),
    set: vi.fn()
  },
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, _data) => key)
  }
};

/**
 * Create a mock audio blob for testing
 */
function createMockAudioBlob(size = 10240, type = 'audio/webm') {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type });
}

/**
 * Create a mock MediaStream
 */
function createMockMediaStream() {
  const audioTrack = {
    kind: 'audio',
    id: 'audio-track-1',
    label: 'Microphone',
    enabled: true,
    stop: vi.fn()
  };

  return {
    getTracks: vi.fn(() => [audioTrack]),
    getAudioTracks: vi.fn(() => [audioTrack]),
    getVideoTracks: vi.fn(() => [])
  };
}

/**
 * Create a mock MediaRecorder
 */
class MockMediaRecorder {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.mimeType = options?.mimeType || 'audio/webm';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
  }

  start(timeslice) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }

  stop() {
    this.state = 'inactive';
    // Simulate data available
    if (this.ondataavailable) {
      const mockData = createMockAudioBlob(10240);
      this.ondataavailable({ data: mockData });
    }
    // Trigger stop event
    if (this.onstop) {
      setTimeout(() => this.onstop(), 0);
    }
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  static isTypeSupported(mimeType) {
    return mimeType.includes('audio/webm');
  }
}

/**
 * Create mock transcription API responses
 */
function createMockTranscriptionResponse(options = {}) {
  return {
    text:
      options.text ||
      'The brave adventurers entered the dark dungeon. The wizard cast a spell of protection.',
    segments: options.segments || [
      {
        speaker: 'SPEAKER_00',
        text: 'The brave adventurers entered the dark dungeon.',
        start: 0,
        end: 3.2
      },
      {
        speaker: 'SPEAKER_01',
        text: 'The wizard cast a spell of protection.',
        start: 3.2,
        end: 6.0
      }
    ],
    language: options.language || 'en',
    duration: options.duration || 6.0
  };
}

describe('Transcription Flow Integration', () => {
  let mockFetch;
  let mockGetUserMedia;
  let audioRecorder;
  let transcriptionService;
  let audioChunker;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock getUserMedia
    mockGetUserMedia = vi.fn(() => Promise.resolve(createMockMediaStream()));
    global.navigator = {
      ...global.navigator,
      mediaDevices: {
        getUserMedia: mockGetUserMedia
      }
    };

    // Mock MediaRecorder
    global.MediaRecorder = MockMediaRecorder;

    // Import real services
    const { AudioRecorder } = await import('../../scripts/audio/AudioRecorder.mjs');
    const { TranscriptionService } = await import('../../scripts/ai/TranscriptionService.mjs');
    const { AudioChunker } = await import('../../scripts/audio/AudioChunker.mjs');
    const { AudioUtils } = await import('../../scripts/utils/AudioUtils.mjs');

    // Mock AudioUtils after import
    vi.spyOn(AudioUtils, 'isValidAudioBlob').mockReturnValue(true);
    vi.spyOn(AudioUtils, 'getBlobSizeMB').mockImplementation((blob) => blob.size / (1024 * 1024));
    vi.spyOn(AudioUtils, 'blobToFile').mockImplementation(
      (blob, name) => new File([blob], `${name}.webm`, { type: blob.type })
    );
    vi.spyOn(AudioUtils, 'estimateDuration').mockImplementation((blob) =>
      Math.round(blob.size / 16000)
    );
    vi.spyOn(AudioUtils, 'getRecorderOptions').mockReturnValue({ mimeType: 'audio/webm' });
    vi.spyOn(AudioUtils, 'createAudioBlob').mockImplementation(
      (chunks, mimeType) => new Blob(chunks, { type: mimeType })
    );

    // Create service instances
    audioRecorder = new AudioRecorder();
    transcriptionService = new TranscriptionService('test-openai-key');
    audioChunker = new AudioChunker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic transcription workflow', () => {
    it('should complete full transcription from recording to result', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Step 1: Start recording
      await audioRecorder.startRecording({ source: 'microphone' });
      expect(audioRecorder.isRecording).toBe(true);

      // Step 2: Stop recording and get audio blob
      const audioBlob = await audioRecorder.stopRecording();
      expect(audioBlob).toBeDefined();
      expect(audioBlob.type).toContain('audio');

      // Step 3: Transcribe audio
      const transcript = await transcriptionService.transcribe(audioBlob);

      expect(transcript).toBeDefined();
      expect(transcript.text).toBe(mockResponse.text);
      expect(transcript.segments).toHaveLength(2);
      expect(transcript.segments[0].speaker).toBe('SPEAKER_00');
      expect(transcript.segments[1].speaker).toBe('SPEAKER_01');
      expect(transcript.language).toBe('en');
      expect(transcript.duration).toBe(6.0);
    });

    it('should handle transcription with custom language', async () => {
      const mockResponse = createMockTranscriptionResponse({ language: 'it' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const transcript = await transcriptionService.transcribe(audioBlob, { language: 'it' });

      expect(transcript.language).toBe('it');

      // Verify API was called with language parameter
      const formData = mockFetch.mock.calls[0][1].body;
      expect(formData.get('language')).toBe('it');
    });

    it('should handle transcription with multiple speakers', async () => {
      const mockResponse = createMockTranscriptionResponse({
        segments: [
          { speaker: 'SPEAKER_00', text: 'First speaker.', start: 0, end: 2 },
          { speaker: 'SPEAKER_01', text: 'Second speaker.', start: 2, end: 4 },
          { speaker: 'SPEAKER_02', text: 'Third speaker.', start: 4, end: 6 },
          { speaker: 'SPEAKER_00', text: 'First speaker again.', start: 6, end: 8 }
        ]
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const transcript = await transcriptionService.transcribe(audioBlob);

      expect(transcript.segments).toHaveLength(4);

      // Extract unique speakers
      const speakers = new Set(transcript.segments.map((s) => s.speaker));
      expect(speakers.size).toBe(3);
      expect(speakers.has('SPEAKER_00')).toBe(true);
      expect(speakers.has('SPEAKER_01')).toBe(true);
      expect(speakers.has('SPEAKER_02')).toBe(true);
    });
  });

  describe('speaker mapping functionality', () => {
    it('should apply speaker mapping through transcribe options', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const speakerMap = {
        SPEAKER_00: 'Game Master',
        SPEAKER_01: 'Player Alice'
      };

      const transcript = await transcriptionService.transcribe(audioBlob, { speakerMap });

      expect(transcript.segments[0].speaker).toBe('Game Master');
      expect(transcript.segments[1].speaker).toBe('Player Alice');
    });

    it('should handle partial speaker mapping', async () => {
      const mockResponse = createMockTranscriptionResponse({
        segments: [
          { speaker: 'SPEAKER_00', text: 'First.', start: 0, end: 1 },
          { speaker: 'SPEAKER_01', text: 'Second.', start: 1, end: 2 },
          { speaker: 'SPEAKER_02', text: 'Third.', start: 2, end: 3 }
        ]
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      // Only map some speakers
      const speakerMap = {
        SPEAKER_00: 'GM',
        SPEAKER_01: 'Player'
      };

      const transcript = await transcriptionService.transcribe(audioBlob, { speakerMap });

      expect(transcript.segments[0].speaker).toBe('GM');
      expect(transcript.segments[1].speaker).toBe('Player');
      expect(transcript.segments[2].speaker).toBe('SPEAKER_02'); // Unchanged
    });

    it('should preserve original speaker IDs when mapping is empty', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const transcript = await transcriptionService.transcribe(audioBlob, { speakerMap: {} });

      // Should use original speaker IDs
      expect(transcript.segments[0].speaker).toBe('SPEAKER_00');
      expect(transcript.segments[1].speaker).toBe('SPEAKER_01');
    });

    it('should store speaker mapping information in result', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const speakerMap = {
        SPEAKER_00: 'Game Master',
        SPEAKER_01: 'Player'
      };

      const transcript = await transcriptionService.transcribe(audioBlob, { speakerMap });

      expect(transcript.speakers).toBeDefined();
      expect(transcript.speakers.length).toBe(2);
      expect(transcript.speakers[0].isMapped).toBe(true);
      expect(transcript.speakers[1].isMapped).toBe(true);
    });
  });

  describe('audio chunking for large files', () => {
    it('should detect when chunking is needed', () => {
      // Create large blob > 25MB
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024);

      const needsChunking = audioChunker.needsChunking(largeBlob);

      expect(needsChunking).toBe(true);
    });

    it('should not chunk small audio files', () => {
      const smallBlob = createMockAudioBlob(1024 * 1024); // 1MB

      const needsChunking = audioChunker.needsChunking(smallBlob);

      expect(needsChunking).toBe(false);
    });

    it('should split large audio into multiple chunks', async () => {
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024);

      const chunks = await audioChunker.splitIfNeeded(largeBlob);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.size).toBeLessThanOrEqual(25 * 1024 * 1024);
      });
    });

    it('should transcribe each chunk separately and merge results', async () => {
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024);

      // Mock responses for multiple chunks
      const mockResponse1 = createMockTranscriptionResponse({
        text: 'First chunk text.',
        segments: [{ speaker: 'SPEAKER_00', text: 'First chunk text.', start: 0, end: 3 }]
      });

      const mockResponse2 = createMockTranscriptionResponse({
        text: 'Second chunk text.',
        segments: [{ speaker: 'SPEAKER_01', text: 'Second chunk text.', start: 0, end: 3 }]
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse1)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse2)
        });

      const chunks = await audioChunker.splitIfNeeded(largeBlob);

      // Transcribe each chunk
      const transcripts = [];
      let cumulativeDuration = 0;

      for (const chunk of chunks) {
        const transcript = await transcriptionService.transcribe(chunk);

        // Adjust timestamps for merging
        transcript.segments.forEach((segment) => {
          segment.start += cumulativeDuration;
          segment.end += cumulativeDuration;
        });

        transcripts.push(transcript);
        cumulativeDuration += transcript.duration;
      }

      // Verify chunks were processed
      expect(transcripts.length).toBe(chunks.length);

      // Merge transcripts
      const mergedTranscript = {
        text: transcripts.map((t) => t.text).join(' '),
        segments: transcripts.flatMap((t) => t.segments),
        language: transcripts[0].language,
        duration: cumulativeDuration
      };

      expect(mergedTranscript.text).toContain('First chunk text');
      expect(mergedTranscript.text).toContain('Second chunk text');
      expect(mergedTranscript.segments.length).toBeGreaterThanOrEqual(2);
    });

    it('should provide chunking information', () => {
      const largeBlob = createMockAudioBlob(30 * 1024 * 1024);

      const info = audioChunker.getChunkingInfo(largeBlob);

      expect(info.totalSize).toBe(largeBlob.size);
      expect(info.totalSizeMB).toBeCloseTo(30, 1);
      expect(info.needsChunking).toBe(true);
      expect(info.estimatedChunkCount).toBeGreaterThan(1);
    });
  });

  describe('transcription error handling', () => {
    it('should handle API authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            error: {
              message: 'Invalid API key',
              type: 'invalid_request_error'
            }
          })
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await expect(transcriptionService.transcribe(audioBlob)).rejects.toThrow();
    });

    it('should handle API rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () =>
          Promise.resolve({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error'
            }
          })
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await expect(transcriptionService.transcribe(audioBlob)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await expect(transcriptionService.transcribe(audioBlob)).rejects.toThrow(
        'Network request failed'
      );
    });

    it('should handle invalid audio format errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () =>
          Promise.resolve({
            error: {
              message: 'Invalid audio format',
              type: 'invalid_request_error'
            }
          })
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await expect(transcriptionService.transcribe(audioBlob)).rejects.toThrow();
    });

    it('should handle empty audio blob', async () => {
      const emptyBlob = new Blob([], { type: 'audio/webm' });

      // Mock validation to return false for empty blob
      vi.spyOn(await import('../../scripts/utils/AudioUtils.mjs'), 'AudioUtils').mockReturnValue({
        isValidAudioBlob: vi.fn(() => false)
      });

      await expect(transcriptionService.transcribe(emptyBlob)).rejects.toThrow();
    });

    it('should handle server errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: { message: 'Server error' } })
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await expect(transcriptionService.transcribe(audioBlob)).rejects.toThrow();
    });
  });

  describe('transcription options and formats', () => {
    it('should support different response formats', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const transcript = await transcriptionService.transcribe(audioBlob, {
        responseFormat: 'diarized_json'
      });

      expect(transcript.segments).toBeDefined();

      // Verify API was called with correct format
      const formData = mockFetch.mock.calls[0][1].body;
      expect(formData.get('response_format')).toBe('diarized_json');
    });

    it('should use correct transcription model', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await transcriptionService.transcribe(audioBlob);

      const formData = mockFetch.mock.calls[0][1].body;
      expect(formData.get('model')).toBe('gpt-4o-transcribe-diarize');
    });

    it('should support prompt hints for better accuracy', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const prompt = 'This is a fantasy RPG session with magic spells and dragons.';

      await transcriptionService.transcribe(audioBlob, {
        prompt: prompt
      });

      const formData = mockFetch.mock.calls[0][1].body;
      expect(formData.get('prompt')).toBe(prompt);
    });
  });

  describe('transcript data integrity', () => {
    it('should preserve segment timing information', async () => {
      const mockResponse = createMockTranscriptionResponse({
        segments: [
          { speaker: 'SPEAKER_00', text: 'First.', start: 0.0, end: 1.5 },
          { speaker: 'SPEAKER_01', text: 'Second.', start: 1.5, end: 3.2 },
          { speaker: 'SPEAKER_00', text: 'Third.', start: 3.2, end: 5.8 }
        ],
        duration: 5.8
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const transcript = await transcriptionService.transcribe(audioBlob);

      expect(transcript.segments[0].start).toBe(0.0);
      expect(transcript.segments[0].end).toBe(1.5);
      expect(transcript.segments[1].start).toBe(1.5);
      expect(transcript.segments[1].end).toBe(3.2);
      expect(transcript.segments[2].start).toBe(3.2);
      expect(transcript.segments[2].end).toBe(5.8);
      expect(transcript.duration).toBe(5.8);
    });

    it('should maintain segment order', async () => {
      const mockResponse = createMockTranscriptionResponse({
        segments: [
          { speaker: 'SPEAKER_00', text: 'One', start: 0, end: 1 },
          { speaker: 'SPEAKER_01', text: 'Two', start: 1, end: 2 },
          { speaker: 'SPEAKER_02', text: 'Three', start: 2, end: 3 },
          { speaker: 'SPEAKER_00', text: 'Four', start: 3, end: 4 },
          { speaker: 'SPEAKER_01', text: 'Five', start: 4, end: 5 }
        ]
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const transcript = await transcriptionService.transcribe(audioBlob);

      expect(transcript.segments[0].text).toBe('One');
      expect(transcript.segments[1].text).toBe('Two');
      expect(transcript.segments[2].text).toBe('Three');
      expect(transcript.segments[3].text).toBe('Four');
      expect(transcript.segments[4].text).toBe('Five');
    });

    it('should combine segments into full text', async () => {
      const mockResponse = createMockTranscriptionResponse({
        text: 'First. Second. Third.',
        segments: [
          { speaker: 'SPEAKER_00', text: 'First.', start: 0, end: 1 },
          { speaker: 'SPEAKER_01', text: 'Second.', start: 1, end: 2 },
          { speaker: 'SPEAKER_00', text: 'Third.', start: 2, end: 3 }
        ]
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      const transcript = await transcriptionService.transcribe(audioBlob);

      expect(transcript.text).toContain('First');
      expect(transcript.text).toContain('Second');
      expect(transcript.text).toContain('Third');

      // Verify segments text matches full text
      const segmentsText = transcript.segments.map((s) => s.text).join(' ');
      expect(transcript.text).toContain('First');
      expect(segmentsText).toContain('First');
    });
  });

  describe('API request validation', () => {
    it('should send audio as FormData', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await transcriptionService.transcribe(audioBlob);

      const [, options] = mockFetch.mock.calls[0];

      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.headers.Authorization).toMatch(/^Bearer /);
    });

    it('should not set Content-Type header for FormData', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await transcriptionService.transcribe(audioBlob);

      const options = mockFetch.mock.calls[0][1];

      // Content-Type should not be manually set (browser sets it with boundary)
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('should include required FormData fields', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await transcriptionService.transcribe(audioBlob);

      const formData = mockFetch.mock.calls[0][1].body;

      expect(formData.get('file')).toBeDefined();
      expect(formData.get('model')).toBeDefined();
      expect(formData.get('response_format')).toBeDefined();
    });

    it('should use correct OpenAI endpoint', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await transcriptionService.transcribe(audioBlob);

      const url = mockFetch.mock.calls[0][0];

      expect(url).toContain('api.openai.com');
      expect(url).toContain('/v1/audio/transcriptions');
    });

    it('should include API key in Authorization header', async () => {
      const mockResponse = createMockTranscriptionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await audioRecorder.startRecording();
      const audioBlob = await audioRecorder.stopRecording();

      await transcriptionService.transcribe(audioBlob);

      const options = mockFetch.mock.calls[0][1];

      expect(options.headers.Authorization).toBeDefined();
      expect(options.headers.Authorization).toMatch(/^Bearer test-openai-key/);
    });
  });
});
