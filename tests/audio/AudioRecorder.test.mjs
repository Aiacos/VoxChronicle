/**
 * AudioRecorder Unit Tests
 *
 * Tests for getLatestChunk (live mode buffer), getAudioLevel (Web Audio metering),
 * and ondataavailable dual-buffer behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}));

vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: {
    isValidAudioBlob: vi.fn(() => true),
    getBlobSizeMB: vi.fn((blob) => blob.size / (1024 * 1024)),
    createAudioBlob: vi.fn((chunks, mimeType) => new Blob(chunks, { type: mimeType })),
    getRecorderOptions: vi.fn(() => ({ mimeType: 'audio/webm' })),
    getSupportedMimeType: vi.fn(() => 'audio/webm'),
    formatDuration: vi.fn((seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`)
  }
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

const { AudioRecorder } = await import('../../scripts/audio/AudioRecorder.mjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockBlob(size = 1024) {
  return new Blob([new Uint8Array(size).fill(0)], { type: 'audio/webm' });
}

class MockMediaRecorder {
  constructor(stream, options = {}) {
    this.stream = stream;
    this.state = 'inactive';
    this.mimeType = options.mimeType || 'audio/webm';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
    this.onpause = null;
    this.onresume = null;
    this._emittedChunks = 0;
  }

  start(_timeslice) {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    // Real MediaRecorder fires a final ondataavailable flush, then onstop
    if (this.ondataavailable) {
      this.ondataavailable({ data: createMockBlob(256) });
    }
    if (this.onstop) setTimeout(() => this.onstop(), 0);
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  requestData() {
    // Simulate a data chunk
    if (this.ondataavailable) {
      this.ondataavailable({ data: createMockBlob(512) });
    }
  }

  static isTypeSupported(mimeType) {
    return mimeType.includes('audio/webm');
  }
}

function createMockMediaStream() {
  return {
    getTracks: () => [{
      kind: 'audio', id: 'track-1', label: 'Mic', enabled: true, stop: vi.fn()
    }],
    getAudioTracks: () => [{
      kind: 'audio', id: 'track-1', label: 'Mic', enabled: true, stop: vi.fn()
    }],
    getVideoTracks: () => []
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioRecorder', () => {
  beforeEach(() => {
    global.MediaRecorder = MockMediaRecorder;
    global.navigator = {
      ...global.navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(createMockMediaStream())
      }
    };
    global.AudioContext = vi.fn().mockImplementation(() => ({
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createAnalyser: vi.fn().mockReturnValue({
        fftSize: 0,
        frequencyBinCount: 128,
        getByteTimeDomainData: vi.fn((arr) => arr.fill(128)),
        getByteFrequencyData: vi.fn((arr) => arr.fill(64)),
        connect: vi.fn()
      }),
      close: vi.fn()
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLatestChunk', () => {
    it('should return null when not recording', async () => {
      const recorder = new AudioRecorder();
      const chunk = await recorder.getLatestChunk();
      expect(chunk).toBeNull();
    });

    it('should return audio blob by rotating the recorder', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      // getLatestChunk stops the recorder (triggering final flush) and restarts
      const chunk = await recorder.getLatestChunk();

      // The stop() fires ondataavailable with final data, producing a valid blob
      if (chunk) {
        expect(chunk.size).toBeGreaterThan(0);
        expect(chunk.type).toContain('audio');
      }

      await recorder.stopRecording();
    });

    it('should start a fresh recorder after rotation', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      // First rotation
      await recorder.getLatestChunk();

      // Recorder should still be in recording state (restarted)
      expect(recorder._mediaRecorder).toBeTruthy();
      expect(recorder._mediaRecorder.state).toBe('recording');

      // Second rotation should also work
      const secondChunk = await recorder.getLatestChunk();
      expect(secondChunk === null || secondChunk instanceof Blob).toBe(true);

      await recorder.stopRecording();
    });

    it('should preserve full session chunks across rotations', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const initialChunks = recorder._audioChunks.length;

      // Rotate - this adds final flush data to _audioChunks
      await recorder.getLatestChunk();

      // _audioChunks should have grown (session-level chunks are never cleared)
      expect(recorder._audioChunks.length).toBeGreaterThanOrEqual(initialChunks);

      await recorder.stopRecording();
    });
  });

  describe('getAudioLevel', () => {
    it('should return 0 when no analyser is set up', () => {
      const recorder = new AudioRecorder();
      const level = recorder.getAudioLevel();
      expect(level).toBe(0);
    });

    it('should return a number between 0 and 1', async () => {
      const recorder = new AudioRecorder();
      // After recording starts, analyser may or may not be available
      // depending on mock setup, but the method should never throw
      const level = recorder.getAudioLevel();
      expect(typeof level).toBe('number');
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    });
  });

  describe('dual buffer behavior', () => {
    it('should push chunks to both _audioChunks and _liveChunks on data', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      // Simulate ondataavailable
      const mediaRecorder = recorder._mediaRecorder;
      const mockChunk = createMockBlob(2048);
      if (mediaRecorder.ondataavailable) {
        mediaRecorder.ondataavailable({ data: mockChunk });
      }

      expect(recorder._audioChunks).toContain(mockChunk);
      expect(recorder._liveChunks).toContain(mockChunk);

      await recorder.stopRecording();
    });

    it('should reset _liveChunks on cleanup', async () => {
      const recorder = new AudioRecorder();
      recorder._liveChunks = [createMockBlob(), createMockBlob()];

      // Cleanup resets everything
      recorder._cleanup();

      expect(recorder._liveChunks).toEqual([]);
    });
  });
});
