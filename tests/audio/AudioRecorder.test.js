/**
 * AudioRecorder Unit Tests
 *
 * Tests for the AudioRecorder class with browser API mocking.
 * Covers recording, pause/resume, source switching, error handling,
 * audio level metering, silence detection, and auto-stop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing AudioRecorder
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

// Mock AudioUtils
vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: {
    getRecorderOptions: vi.fn(() => ({ mimeType: 'audio/webm' })),
    createAudioBlob: vi.fn((chunks, mimeType) => new Blob(chunks, { type: mimeType })),
    getBlobSizeMB: vi.fn((blob) => (blob.size / (1024 * 1024)).toFixed(2)),
    formatDuration: vi.fn(
      (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`
    )
  }
}));

// Import after mocks are set up
import {
  AudioRecorder,
  RecordingState,
  CaptureSource
} from '../../scripts/audio/AudioRecorder.mjs';
import { AudioUtils } from '../../scripts/utils/AudioUtils.mjs';

/**
 * Create a mock MediaStream
 */
function createMockMediaStream(audioTracks = 1, videoTracks = 0) {
  const tracks = [];

  for (let i = 0; i < audioTracks; i++) {
    tracks.push({
      kind: 'audio',
      id: `audio-${i}`,
      label: `Microphone ${i}`,
      enabled: true,
      stop: vi.fn()
    });
  }

  for (let i = 0; i < videoTracks; i++) {
    tracks.push({
      kind: 'video',
      id: `video-${i}`,
      label: `Camera ${i}`,
      enabled: true,
      stop: vi.fn()
    });
  }

  return {
    getTracks: vi.fn(() => tracks),
    getAudioTracks: vi.fn(() => tracks.filter((t) => t.kind === 'audio')),
    getVideoTracks: vi.fn(() => tracks.filter((t) => t.kind === 'video'))
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
    if (this.onstop) {
      setTimeout(() => this.onstop(), 0);
    }
  }

  pause() {
    if (this.state === 'recording') {
      this.state = 'paused';
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'recording';
    }
  }

  requestData() {
    if (this.state === 'recording' && this.ondataavailable) {
      const mockData = new Blob([new Uint8Array(1024)], { type: this.mimeType });
      this.ondataavailable({ data: mockData });
    }
  }
}

/**
 * Create a mock AnalyserNode with configurable frequency data
 */
function createMockAnalyserNode(frequencyData = null) {
  const binCount = 128; // fftSize 256 => frequencyBinCount 128
  const defaultData = new Uint8Array(binCount).fill(0);
  const data = frequencyData || defaultData;

  return {
    fftSize: 256,
    frequencyBinCount: binCount,
    getByteFrequencyData: vi.fn((array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = data[i] || 0;
      }
    }),
    connect: vi.fn(),
    disconnect: vi.fn()
  };
}

/**
 * Create a mock AudioContext
 */
function createMockAudioContext() {
  const mockAnalyser = createMockAnalyserNode();
  const mockSource = {
    connect: vi.fn(),
    disconnect: vi.fn()
  };

  return {
    createMediaStreamSource: vi.fn(() => mockSource),
    createAnalyser: vi.fn(() => mockAnalyser),
    close: vi.fn(),
    _mockAnalyser: mockAnalyser,
    _mockSource: mockSource
  };
}

describe('AudioRecorder', () => {
  let recorder;
  let mockGetUserMedia;
  let mockGetDisplayMedia;
  let mockEnumerateDevices;
  let mockPermissionsQuery;
  let mockRAFId;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock navigator.mediaDevices
    mockGetUserMedia = vi.fn();
    mockGetDisplayMedia = vi.fn();
    mockEnumerateDevices = vi.fn();

    global.navigator = {
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
        getDisplayMedia: mockGetDisplayMedia,
        enumerateDevices: mockEnumerateDevices
      },
      permissions: {
        query: (mockPermissionsQuery = vi.fn())
      }
    };

    // Mock MediaRecorder globally
    global.MediaRecorder = MockMediaRecorder;

    // Mock AudioContext globally
    mockRAFId = 0;
    global.AudioContext = vi.fn(() => createMockAudioContext());

    // Mock requestAnimationFrame / cancelAnimationFrame
    global.requestAnimationFrame = vi.fn((cb) => {
      mockRAFId++;
      return mockRAFId;
    });
    global.cancelAnimationFrame = vi.fn();

    // Mock Date.now for duration calculations
    vi.spyOn(Date, 'now').mockReturnValue(1000000);

    // Create recorder instance
    recorder = new AudioRecorder();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.AudioContext;
    delete global.webkitAudioContext;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });

  describe('constructor', () => {
    it('should create instance with default state', () => {
      expect(recorder).toBeInstanceOf(AudioRecorder);
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder.isRecording).toBe(false);
      expect(recorder.captureSource).toBeNull();
      expect(recorder.duration).toBe(0);
    });

    it('should accept constructor options for silence threshold', () => {
      const rec = new AudioRecorder({ silenceThreshold: 0.05 });
      expect(rec._silenceThreshold).toBe(0.05);
    });

    it('should accept constructor options for max duration', () => {
      const rec = new AudioRecorder({ maxDuration: 600000 });
      expect(rec._maxDuration).toBe(600000);
    });

    it('should accept zero maxDuration to disable auto-stop', () => {
      const rec = new AudioRecorder({ maxDuration: 0 });
      expect(rec._maxDuration).toBe(0);
    });

    it('should accept callback options in constructor', () => {
      const onLevelChange = vi.fn();
      const onSilenceDetected = vi.fn();
      const onSoundDetected = vi.fn();
      const onAutoStop = vi.fn();

      const rec = new AudioRecorder({
        onLevelChange,
        onSilenceDetected,
        onSoundDetected,
        onAutoStop
      });

      expect(rec._callbacks.onLevelChange).toBe(onLevelChange);
      expect(rec._callbacks.onSilenceDetected).toBe(onSilenceDetected);
      expect(rec._callbacks.onSoundDetected).toBe(onSoundDetected);
      expect(rec._callbacks.onAutoStop).toBe(onAutoStop);
    });

    it('should use default values when no options are provided', () => {
      const rec = new AudioRecorder();
      expect(rec._silenceThreshold).toBe(0.01);
      expect(rec._maxDuration).toBe(300000);
      expect(rec._callbacks.onLevelChange).toBeNull();
      expect(rec._callbacks.onSilenceDetected).toBeNull();
      expect(rec._callbacks.onSoundDetected).toBeNull();
      expect(rec._callbacks.onAutoStop).toBeNull();
    });
  });

  describe('getters', () => {
    it('should return correct state', () => {
      expect(recorder.state).toBe(RecordingState.INACTIVE);

      recorder._state = RecordingState.RECORDING;
      expect(recorder.state).toBe(RecordingState.RECORDING);

      recorder._state = RecordingState.PAUSED;
      expect(recorder.state).toBe(RecordingState.PAUSED);
    });

    it('should return isRecording based on state', () => {
      expect(recorder.isRecording).toBe(false);

      recorder._state = RecordingState.RECORDING;
      expect(recorder.isRecording).toBe(true);

      recorder._state = RecordingState.PAUSED;
      expect(recorder.isRecording).toBe(false);
    });

    it('should return captureSource', () => {
      expect(recorder.captureSource).toBeNull();

      recorder._captureSource = CaptureSource.MICROPHONE;
      expect(recorder.captureSource).toBe(CaptureSource.MICROPHONE);
    });

    it('should calculate duration correctly', () => {
      expect(recorder.duration).toBe(0);

      recorder._startTime = 1000000 - 5000; // 5 seconds ago
      expect(recorder.duration).toBe(5);

      recorder._startTime = 1000000 - 65000; // 65 seconds ago
      expect(recorder.duration).toBe(65);
    });
  });

  describe('setCallbacks', () => {
    it('should set callback handlers', () => {
      const callbacks = {
        onDataAvailable: vi.fn(),
        onError: vi.fn(),
        onStateChange: vi.fn()
      };

      recorder.setCallbacks(callbacks);

      expect(recorder._callbacks.onDataAvailable).toBe(callbacks.onDataAvailable);
      expect(recorder._callbacks.onError).toBe(callbacks.onError);
      expect(recorder._callbacks.onStateChange).toBe(callbacks.onStateChange);
    });

    it('should merge callbacks with existing ones', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      recorder.setCallbacks({ onDataAvailable: callback1 });
      recorder.setCallbacks({ onError: callback2 });

      expect(recorder._callbacks.onDataAvailable).toBe(callback1);
      expect(recorder._callbacks.onError).toBe(callback2);
    });

    it('should set new audio analysis callbacks via setCallbacks', () => {
      const onLevelChange = vi.fn();
      const onSilenceDetected = vi.fn();
      const onSoundDetected = vi.fn();
      const onAutoStop = vi.fn();

      recorder.setCallbacks({ onLevelChange, onSilenceDetected, onSoundDetected, onAutoStop });

      expect(recorder._callbacks.onLevelChange).toBe(onLevelChange);
      expect(recorder._callbacks.onSilenceDetected).toBe(onSilenceDetected);
      expect(recorder._callbacks.onSoundDetected).toBe(onSoundDetected);
      expect(recorder._callbacks.onAutoStop).toBe(onAutoStop);
    });
  });

  describe('startRecording', () => {
    it('should start microphone recording with default options', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1
        }
      });

      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorder.captureSource).toBe(CaptureSource.MICROPHONE);
      expect(recorder.isRecording).toBe(true);
    });

    it('should start recording with custom audio constraints', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording({
        source: CaptureSource.MICROPHONE,
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 48000
      });

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 48000,
          channelCount: 1
        }
      });
    });

    it('should start recording with specific device ID', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording({
        source: CaptureSource.MICROPHONE,
        deviceId: 'device-123'
      });

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: expect.objectContaining({
          deviceId: { exact: 'device-123' }
        })
      });
    });

    it('should initialize MediaRecorder with correct options', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording({ timeslice: 5000 });

      expect(recorder._mediaRecorder).toBeInstanceOf(MockMediaRecorder);
      expect(recorder._mediaRecorder.stream).toBe(mockStream);
      expect(recorder._mediaRecorder.state).toBe('recording');
      expect(recorder._mediaRecorder.timeslice).toBe(5000);
    });

    it('should throw error if already recording', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValue(mockStream);

      await recorder.startRecording();

      await expect(recorder.startRecording()).rejects.toThrow('Recording already in progress');
    });

    it('should handle microphone permission denial', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      mockGetUserMedia.mockRejectedValueOnce(error);

      await expect(recorder.startRecording()).rejects.toThrow('Microphone access denied');

      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('should handle no microphone found', async () => {
      const error = new Error('Not found');
      error.name = 'NotFoundError';
      mockGetUserMedia.mockRejectedValueOnce(error);

      await expect(recorder.startRecording()).rejects.toThrow('No microphone found');
    });

    it('should handle microphone in use', async () => {
      const error = new Error('Not readable');
      error.name = 'NotReadableError';
      mockGetUserMedia.mockRejectedValueOnce(error);

      await expect(recorder.startRecording()).rejects.toThrow(
        'Microphone is in use by another application'
      );
    });

    it('should call onStateChange callback when starting', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });

      await recorder.startRecording();

      expect(onStateChange).toHaveBeenCalledWith(RecordingState.RECORDING, RecordingState.INACTIVE);
    });

    it('should set up audio analysis when starting recording', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(recorder._audioContext).not.toBeNull();
      expect(recorder._analyserNode).not.toBeNull();
      expect(recorder._sourceNode).not.toBeNull();
    });

    it('should start level monitoring when starting recording', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(global.requestAnimationFrame).toHaveBeenCalled();
      expect(recorder._levelMonitorId).not.toBeNull();
    });

    it('should set up auto-stop timer when starting recording', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      vi.spyOn(Date, 'now').mockReturnValue(1000000);

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(recorder._maxDurationTimeout).not.toBeNull();

      vi.useRealTimers();
    });
  });

  describe('startRecording - Foundry VTT WebRTC', () => {
    it('should use Foundry WebRTC stream if available', async () => {
      const mockStream = createMockMediaStream(1);

      // Mock Foundry VTT game object
      global.game = {
        webrtc: {
          client: {
            getLocalStream: vi.fn(() => mockStream)
          }
        }
      };

      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorder.captureSource).toBe(CaptureSource.FOUNDRY_WEBRTC);
      expect(mockGetUserMedia).not.toHaveBeenCalled();

      delete global.game;
    });

    it('should fallback to microphone if game is undefined', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      expect(mockGetUserMedia).toHaveBeenCalled();
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });

    it('should fallback to microphone if WebRTC client unavailable', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      global.game = { webrtc: null };

      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      expect(mockGetUserMedia).toHaveBeenCalled();

      delete global.game;
    });

    it('should fallback to microphone if no audio tracks in WebRTC', async () => {
      const mockStream = createMockMediaStream(0); // No audio tracks
      const micStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(micStream);

      global.game = {
        webrtc: {
          client: {
            getLocalStream: vi.fn(() => mockStream)
          }
        }
      };

      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      expect(mockGetUserMedia).toHaveBeenCalled();

      delete global.game;
    });
  });

  describe('startRecording - System Audio', () => {
    it('should use display media for system audio capture', async () => {
      const mockStream = createMockMediaStream(1, 1); // Audio + video
      mockGetDisplayMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: true,
        audio: true
      });

      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorder.captureSource).toBe(CaptureSource.SYSTEM_AUDIO);

      // Video tracks should be stopped
      const videoTracks = mockStream.getVideoTracks();
      expect(videoTracks[0].stop).toHaveBeenCalled();
    });

    it('should fallback to microphone if getDisplayMedia not supported', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      // Remove getDisplayMedia
      delete global.navigator.mediaDevices.getDisplayMedia;

      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(mockGetUserMedia).toHaveBeenCalled();
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });

    it('should fallback to microphone if no audio in display media', async () => {
      const displayStream = createMockMediaStream(0, 1); // No audio, only video
      const micStream = createMockMediaStream(1);
      mockGetDisplayMedia.mockResolvedValueOnce(displayStream);
      mockGetUserMedia.mockResolvedValueOnce(micStream);

      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(mockGetUserMedia).toHaveBeenCalled();
      expect(displayStream.getVideoTracks()[0].stop).toHaveBeenCalled();
    });

    it('should fallback to microphone if permission denied', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      mockGetDisplayMedia.mockRejectedValueOnce(error);

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(mockGetUserMedia).toHaveBeenCalled();
    });
  });

  describe('stopRecording', () => {
    beforeEach(async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      await recorder.startRecording();

      // Reset Date.now to simulate passage of time
      Date.now.mockReturnValue(1005000); // 5 seconds later
    });

    it('should stop recording and return audio blob', async () => {
      // Simulate some data chunks
      const chunks = [
        new Blob([new Uint8Array(1024)], { type: 'audio/webm' }),
        new Blob([new Uint8Array(1024)], { type: 'audio/webm' })
      ];
      recorder._audioChunks = chunks;

      const audioBlob = await recorder.stopRecording();

      expect(audioBlob).toBeInstanceOf(Blob);
      expect(AudioUtils.createAudioBlob).toHaveBeenCalledWith(chunks, 'audio/webm');
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder._mediaRecorder).toBeNull();
      expect(recorder._stream).toBeNull();
    });

    it('should throw error if no active recording', async () => {
      await recorder.stopRecording();

      await expect(recorder.stopRecording()).rejects.toThrow('No active recording to stop');
    });

    it('should cleanup stream tracks on stop', async () => {
      const mockStream = recorder._stream;
      const tracks = mockStream.getTracks();

      await recorder.stopRecording();

      tracks.forEach((track) => {
        expect(track.stop).toHaveBeenCalled();
      });
    });

    it('should handle MediaRecorder errors during stop', async () => {
      // Simulate error during stop
      recorder._mediaRecorder.onstop = null;
      recorder._mediaRecorder.onerror = null;

      // Make stop trigger error callback
      const _originalStop = recorder._mediaRecorder.stop;
      recorder._mediaRecorder.stop = function () {
        this.state = 'inactive';
        if (this.onerror) {
          setTimeout(() => this.onerror({ error: new Error('Recording failed') }), 0);
        }
      };

      await expect(recorder.stopRecording()).rejects.toThrow('Recording failed');
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('should stop level monitoring on stopRecording', async () => {
      // Verify level monitor is active
      expect(recorder._levelMonitorId).not.toBeNull();

      await recorder.stopRecording();

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
      expect(recorder._levelMonitorId).toBeNull();
    });

    it('should clean up audio analysis on stopRecording', async () => {
      // Verify audio analysis is set up
      expect(recorder._audioContext).not.toBeNull();
      expect(recorder._analyserNode).not.toBeNull();

      await recorder.stopRecording();

      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
      expect(recorder._sourceNode).toBeNull();
    });

    it('should clear auto-stop timer on stopRecording', async () => {
      expect(recorder._maxDurationTimeout).not.toBeNull();

      await recorder.stopRecording();

      expect(recorder._maxDurationTimeout).toBeNull();
    });
  });

  describe('pause and resume', () => {
    beforeEach(async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      await recorder.startRecording();
    });

    it('should pause recording', () => {
      recorder.pause();

      expect(recorder.state).toBe(RecordingState.PAUSED);
      expect(recorder._mediaRecorder.state).toBe('paused');
    });

    it('should throw error if not recording when pausing', () => {
      recorder.pause();

      expect(() => recorder.pause()).toThrow('Cannot pause - not currently recording');
    });

    it('should resume paused recording', () => {
      recorder.pause();
      recorder.resume();

      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorder._mediaRecorder.state).toBe('recording');
    });

    it('should throw error if not paused when resuming', () => {
      expect(() => recorder.resume()).toThrow('Cannot resume - recording is not paused');
    });

    it('should call onStateChange callbacks on pause and resume', () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });

      recorder.pause();
      expect(onStateChange).toHaveBeenCalledWith(RecordingState.PAUSED, RecordingState.RECORDING);

      onStateChange.mockClear();

      recorder.resume();
      expect(onStateChange).toHaveBeenCalledWith(RecordingState.RECORDING, RecordingState.PAUSED);
    });
  });

  describe('cancel', () => {
    it('should cancel active recording', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      await recorder.startRecording();

      recorder.cancel();

      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder._mediaRecorder).toBeNull();
      expect(recorder._audioChunks).toEqual([]);
    });

    it('should do nothing if not recording', () => {
      expect(() => recorder.cancel()).not.toThrow();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('should cleanup stream on cancel', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      await recorder.startRecording();

      const tracks = mockStream.getTracks();

      recorder.cancel();

      tracks.forEach((track) => {
        expect(track.stop).toHaveBeenCalled();
      });
    });

    it('should clean up audio analysis on cancel', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      await recorder.startRecording();

      expect(recorder._audioContext).not.toBeNull();

      recorder.cancel();

      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
      expect(recorder._sourceNode).toBeNull();
    });

    it('should stop level monitoring on cancel', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      await recorder.startRecording();

      expect(recorder._levelMonitorId).not.toBeNull();

      recorder.cancel();

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
      expect(recorder._levelMonitorId).toBeNull();
    });

    it('should clear auto-stop timer on cancel', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      await recorder.startRecording();

      expect(recorder._maxDurationTimeout).not.toBeNull();

      recorder.cancel();

      expect(recorder._maxDurationTimeout).toBeNull();
    });
  });

  describe('requestData', () => {
    it('should request data from MediaRecorder', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      const onDataAvailable = vi.fn();
      recorder.setCallbacks({ onDataAvailable });

      await recorder.startRecording();

      recorder.requestData();

      expect(onDataAvailable).toHaveBeenCalled();
      expect(onDataAvailable.mock.calls[0][0]).toBeInstanceOf(Blob);
    });

    it('should do nothing if not recording', () => {
      expect(() => recorder.requestData()).not.toThrow();
    });
  });

  describe('getAudioLevel', () => {
    it('should return 0 when no analyser is available', () => {
      expect(recorder.getAudioLevel()).toBe(0);
    });

    it('should return 0 when frequency data is all zeros (silence)', () => {
      // Set up analyser with silence
      recorder._analyserNode = createMockAnalyserNode(new Uint8Array(128).fill(0));

      const level = recorder.getAudioLevel();
      expect(level).toBe(0);
    });

    it('should return a value between 0 and 1 for non-zero audio', () => {
      // Set up analyser with moderate audio levels
      const data = new Uint8Array(128).fill(64);
      recorder._analyserNode = createMockAnalyserNode(data);

      const level = recorder.getAudioLevel();
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThanOrEqual(1);
    });

    it('should return 1 (clamped) for very loud audio', () => {
      // Set up analyser with maximum audio levels
      const data = new Uint8Array(128).fill(255);
      recorder._analyserNode = createMockAnalyserNode(data);

      const level = recorder.getAudioLevel();
      expect(level).toBe(1);
    });

    it('should compute RMS correctly for known data', () => {
      // All values = 128 => RMS = 128 => normalized = 128/128 = 1.0
      const data = new Uint8Array(128).fill(128);
      recorder._analyserNode = createMockAnalyserNode(data);

      const level = recorder.getAudioLevel();
      expect(level).toBe(1);
    });

    it('should call getByteFrequencyData on the analyser node', () => {
      const mockAnalyser = createMockAnalyserNode();
      recorder._analyserNode = mockAnalyser;

      recorder.getAudioLevel();

      expect(mockAnalyser.getByteFrequencyData).toHaveBeenCalled();
    });
  });

  describe('audio analysis setup', () => {
    it('should set up audio analysis during startRecording', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(global.AudioContext).toHaveBeenCalled();
      expect(recorder._audioContext).not.toBeNull();
      expect(recorder._audioContext.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
      expect(recorder._audioContext.createAnalyser).toHaveBeenCalled();
    });

    it('should handle missing AudioContext gracefully', async () => {
      delete global.AudioContext;
      delete global.webkitAudioContext;

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      // Should not throw - recording works without audio analysis
      await recorder.startRecording();

      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
    });

    it('should use webkitAudioContext as fallback', async () => {
      delete global.AudioContext;
      global.webkitAudioContext = vi.fn(() => createMockAudioContext());

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(global.webkitAudioContext).toHaveBeenCalled();
      expect(recorder._audioContext).not.toBeNull();
    });

    it('should handle AudioContext constructor errors gracefully', async () => {
      global.AudioContext = vi.fn(() => {
        throw new Error('AudioContext not allowed');
      });

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      // Should not throw - recording works without audio analysis
      await recorder.startRecording();

      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
      expect(recorder._sourceNode).toBeNull();
    });

    it('should not set up audio analysis if stream is null', () => {
      recorder._setupAudioAnalysis(null);

      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
    });

    it('should connect source to analyser during setup', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(recorder._sourceNode.connect).toHaveBeenCalledWith(recorder._analyserNode);
    });

    it('should set fftSize to 256 on the analyser', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(recorder._analyserNode.fftSize).toBe(256);
    });
  });

  describe('level monitoring', () => {
    it('should start requestAnimationFrame loop when recording starts', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should not start level monitoring if no analyser', async () => {
      delete global.AudioContext;
      delete global.webkitAudioContext;

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // requestAnimationFrame should not be called because analyserNode is null
      expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should call onLevelChange callback during monitoring', async () => {
      const onLevelChange = vi.fn();
      recorder = new AudioRecorder({ onLevelChange });

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Get the callback passed to requestAnimationFrame and invoke it
      const monitorCallback = global.requestAnimationFrame.mock.calls[0][0];
      monitorCallback();

      expect(onLevelChange).toHaveBeenCalled();
      expect(typeof onLevelChange.mock.calls[0][0]).toBe('number');
    });

    it('should not call onLevelChange when paused', async () => {
      const onLevelChange = vi.fn();
      recorder = new AudioRecorder({ onLevelChange });

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();
      recorder.pause();

      onLevelChange.mockClear();

      // Get the callback passed to requestAnimationFrame and invoke it
      const monitorCallback = global.requestAnimationFrame.mock.calls[0][0];
      monitorCallback();

      // Should not call because state is PAUSED
      expect(onLevelChange).not.toHaveBeenCalled();
    });

    it('should cancel animation frame on stop monitoring', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      const monitorId = recorder._levelMonitorId;
      recorder._stopLevelMonitoring();

      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(monitorId);
      expect(recorder._levelMonitorId).toBeNull();
    });

    it('should reset silence state on stop monitoring', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Simulate silence state
      recorder._isSilent = true;
      recorder._silenceStartTime = 999000;

      recorder._stopLevelMonitoring();

      expect(recorder._isSilent).toBe(false);
      expect(recorder._silenceStartTime).toBeNull();
    });
  });

  describe('silence detection', () => {
    it('should detect silence when level drops below threshold', () => {
      recorder._silenceThreshold = 0.05;
      recorder._isSilent = false;

      recorder._detectSilence(0.01); // Below threshold

      expect(recorder._isSilent).toBe(true);
      expect(recorder._silenceStartTime).not.toBeNull();
    });

    it('should call onSilenceDetected with duration when silence continues', () => {
      const onSilenceDetected = vi.fn();
      recorder.setCallbacks({ onSilenceDetected });
      recorder._silenceThreshold = 0.05;

      // First call - transition to silent
      Date.now.mockReturnValue(1000000);
      recorder._detectSilence(0.01);

      // Second call - still silent, 2 seconds later
      Date.now.mockReturnValue(1002000);
      recorder._detectSilence(0.01);

      expect(onSilenceDetected).toHaveBeenCalledWith(2000);
    });

    it('should call onSoundDetected when sound resumes after silence', () => {
      const onSoundDetected = vi.fn();
      recorder.setCallbacks({ onSoundDetected });
      recorder._silenceThreshold = 0.05;

      // Go silent
      recorder._detectSilence(0.01);
      expect(recorder._isSilent).toBe(true);

      // Sound resumes
      recorder._detectSilence(0.5);

      expect(recorder._isSilent).toBe(false);
      expect(recorder._silenceStartTime).toBeNull();
      expect(onSoundDetected).toHaveBeenCalled();
    });

    it('should not call onSoundDetected if not transitioning from silent', () => {
      const onSoundDetected = vi.fn();
      recorder.setCallbacks({ onSoundDetected });
      recorder._silenceThreshold = 0.05;
      recorder._isSilent = false;

      recorder._detectSilence(0.5); // Above threshold, was not silent

      expect(onSoundDetected).not.toHaveBeenCalled();
    });

    it('should not call onSilenceDetected on initial transition to silence', () => {
      const onSilenceDetected = vi.fn();
      recorder.setCallbacks({ onSilenceDetected });
      recorder._silenceThreshold = 0.05;
      recorder._isSilent = false;

      // First detection of silence - should not fire callback yet
      recorder._detectSilence(0.01);

      expect(onSilenceDetected).not.toHaveBeenCalled();
      expect(recorder._isSilent).toBe(true);
    });

    it('should use configurable silence threshold', () => {
      const rec = new AudioRecorder({ silenceThreshold: 0.1 });
      rec._isSilent = false;

      // 0.05 is below 0.1 threshold - should detect silence
      rec._detectSilence(0.05);
      expect(rec._isSilent).toBe(true);
    });

    it('should not detect silence when level equals threshold', () => {
      recorder._silenceThreshold = 0.05;
      recorder._isSilent = false;

      // Exactly at threshold - not below, so not silent
      recorder._detectSilence(0.05);
      expect(recorder._isSilent).toBe(false);
    });
  });

  describe('auto-stop', () => {
    it('should set up auto-stop timer during startRecording', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      vi.spyOn(Date, 'now').mockReturnValue(1000000);

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(recorder._maxDurationTimeout).not.toBeNull();

      vi.useRealTimers();
    });

    it('should not set auto-stop timer when maxDuration is 0', async () => {
      recorder = new AudioRecorder({ maxDuration: 0 });

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(recorder._maxDurationTimeout).toBeNull();
    });

    it('should call onAutoStop callback when max duration is reached', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      vi.spyOn(Date, 'now').mockReturnValue(1000000);

      const onAutoStop = vi.fn();
      recorder = new AudioRecorder({ maxDuration: 5000, onAutoStop });

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Advance time to trigger auto-stop
      vi.advanceTimersByTime(5000);

      expect(onAutoStop).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should auto-stop recording when max duration is reached', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      vi.spyOn(Date, 'now').mockReturnValue(1000000);

      recorder = new AudioRecorder({ maxDuration: 5000 });

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Advance time to trigger auto-stop
      vi.advanceTimersByTime(5000);

      // Wait for the stopRecording promise to resolve
      await vi.runAllTimersAsync();

      expect(recorder.state).toBe(RecordingState.INACTIVE);

      vi.useRealTimers();
    });

    it('should clear auto-stop timer on manual stopRecording', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(recorder._maxDurationTimeout).not.toBeNull();

      await recorder.stopRecording();

      expect(recorder._maxDurationTimeout).toBeNull();
    });

    it('should clear auto-stop timer on cancel', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      expect(recorder._maxDurationTimeout).not.toBeNull();

      recorder.cancel();

      expect(recorder._maxDurationTimeout).toBeNull();
    });

    it('should use custom maxDuration from constructor', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      vi.spyOn(Date, 'now').mockReturnValue(1000000);

      const onAutoStop = vi.fn();
      recorder = new AudioRecorder({ maxDuration: 10000, onAutoStop });

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Should not auto-stop at 5 seconds
      vi.advanceTimersByTime(5000);
      expect(onAutoStop).not.toHaveBeenCalled();

      // Should auto-stop at 10 seconds
      vi.advanceTimersByTime(5000);
      expect(onAutoStop).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('cleanup', () => {
    it('should clean up audio context on cleanup', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      const audioContext = recorder._audioContext;
      const sourceNode = recorder._sourceNode;

      recorder.cancel();

      expect(audioContext.close).toHaveBeenCalled();
      expect(sourceNode.disconnect).toHaveBeenCalled();
      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
      expect(recorder._sourceNode).toBeNull();
    });

    it('should handle disconnect errors gracefully during cleanup', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Make disconnect throw
      recorder._sourceNode.disconnect = vi.fn(() => {
        throw new Error('Already disconnected');
      });

      // Should not throw
      expect(() => recorder.cancel()).not.toThrow();
      expect(recorder._sourceNode).toBeNull();
    });

    it('should handle close errors gracefully during cleanup', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Make close throw
      recorder._audioContext.close = vi.fn(() => {
        throw new Error('Already closed');
      });

      // Should not throw
      expect(() => recorder.cancel()).not.toThrow();
      expect(recorder._audioContext).toBeNull();
    });

    it('should handle cleanup when audio analysis was never set up', async () => {
      delete global.AudioContext;
      delete global.webkitAudioContext;

      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Should not throw even though audio analysis nodes are null
      expect(() => recorder.cancel()).not.toThrow();
    });
  });

  describe('checkMicrophonePermission', () => {
    it('should return granted permission state', async () => {
      mockPermissionsQuery.mockResolvedValueOnce({ state: 'granted' });

      const state = await recorder.checkMicrophonePermission();

      expect(state).toBe('granted');
      expect(mockPermissionsQuery).toHaveBeenCalledWith({ name: 'microphone' });
    });

    it('should return denied permission state', async () => {
      mockPermissionsQuery.mockResolvedValueOnce({ state: 'denied' });

      const state = await recorder.checkMicrophonePermission();

      expect(state).toBe('denied');
    });

    it('should return prompt if Permissions API not supported', async () => {
      delete global.navigator.permissions;

      const state = await recorder.checkMicrophonePermission();

      expect(state).toBe('prompt');
    });

    it('should return prompt if query fails', async () => {
      mockPermissionsQuery.mockRejectedValueOnce(new Error('Not supported'));

      const state = await recorder.checkMicrophonePermission();

      expect(state).toBe('prompt');
    });
  });

  describe('requestMicrophonePermission', () => {
    it('should request and grant microphone permission', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      const granted = await recorder.requestMicrophonePermission();

      expect(granted).toBe(true);
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });

      // Stream should be stopped immediately
      const tracks = mockStream.getTracks();
      tracks.forEach((track) => {
        expect(track.stop).toHaveBeenCalled();
      });
    });

    it('should return false if permission denied', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      mockGetUserMedia.mockRejectedValueOnce(error);

      const granted = await recorder.requestMicrophonePermission();

      expect(granted).toBe(false);
    });

    it('should return false on other errors', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error('Unknown error'));

      const granted = await recorder.requestMicrophonePermission();

      expect(granted).toBe(false);
    });
  });

  describe('getAudioInputDevices', () => {
    it('should return list of audio input devices', async () => {
      const mockDevices = [
        { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone 1' },
        { kind: 'audioinput', deviceId: 'mic2', label: 'Microphone 2' },
        { kind: 'videoinput', deviceId: 'cam1', label: 'Camera 1' },
        { kind: 'audiooutput', deviceId: 'spk1', label: 'Speaker 1' }
      ];
      mockEnumerateDevices.mockResolvedValueOnce(mockDevices);

      const devices = await recorder.getAudioInputDevices();

      expect(devices).toHaveLength(2);
      expect(devices[0].kind).toBe('audioinput');
      expect(devices[1].kind).toBe('audioinput');
    });

    it('should return empty array on error', async () => {
      mockEnumerateDevices.mockRejectedValueOnce(new Error('Not supported'));

      const devices = await recorder.getAudioInputDevices();

      expect(devices).toEqual([]);
    });
  });

  describe('event callbacks', () => {
    it('should call onDataAvailable when chunks arrive', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      const onDataAvailable = vi.fn();
      recorder.setCallbacks({ onDataAvailable });

      await recorder.startRecording();

      // Trigger data available event
      const mockData = new Blob([new Uint8Array(1024)], { type: 'audio/webm' });
      recorder._mediaRecorder.ondataavailable({ data: mockData, size: 1024 });

      expect(onDataAvailable).toHaveBeenCalledWith(mockData, 1);
    });

    it('should call onError when MediaRecorder errors', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      const onError = vi.fn();
      recorder.setCallbacks({ onError });

      await recorder.startRecording();

      // Trigger error event
      const error = new Error('Recording error');
      recorder._mediaRecorder.onerror({ error });

      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should not throw if callbacks are not set', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      await recorder.startRecording();

      // Trigger events without callbacks
      expect(() => {
        recorder._mediaRecorder.ondataavailable({ data: new Blob(), size: 0 });
        recorder._mediaRecorder.onerror({ error: new Error() });
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty data chunks', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      const onDataAvailable = vi.fn();
      recorder.setCallbacks({ onDataAvailable });

      await recorder.startRecording();

      // Trigger empty data
      recorder._mediaRecorder.ondataavailable({ data: null });
      recorder._mediaRecorder.ondataavailable({ data: new Blob(), size: 0 });

      // Should not call callback for empty data
      expect(onDataAvailable).not.toHaveBeenCalled();
    });

    it('should handle multiple stop calls gracefully', async () => {
      const mockStream = createMockMediaStream(1);
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      await recorder.startRecording();

      await recorder.stopRecording();

      await expect(recorder.stopRecording()).rejects.toThrow();
    });

    it('should cleanup properly on start failure', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error('Failed'));

      await expect(recorder.startRecording()).rejects.toThrow();

      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder._stream).toBeNull();
      expect(recorder._mediaRecorder).toBeNull();
    });

    it('should cleanup audio analysis on start failure', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error('Failed'));

      await expect(recorder.startRecording()).rejects.toThrow();

      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
      expect(recorder._sourceNode).toBeNull();
    });
  });
});
