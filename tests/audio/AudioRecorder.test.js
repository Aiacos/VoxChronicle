/**
 * AudioRecorder Unit Tests
 *
 * Tests for the AudioRecorder class with browser API mocking.
 * Covers recording, pause/resume, source switching, and error handling.
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
    formatDuration: vi.fn((seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`)
  }
}));

// Import after mocks are set up
import { AudioRecorder, RecordingState, CaptureSource } from '../../scripts/audio/AudioRecorder.mjs';
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
    getAudioTracks: vi.fn(() => tracks.filter(t => t.kind === 'audio')),
    getVideoTracks: vi.fn(() => tracks.filter(t => t.kind === 'video'))
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

describe('AudioRecorder', () => {
  let recorder;
  let mockGetUserMedia;
  let mockGetDisplayMedia;
  let mockEnumerateDevices;
  let mockPermissionsQuery;

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
        query: mockPermissionsQuery = vi.fn()
      }
    };

    // Mock MediaRecorder globally
    global.MediaRecorder = MockMediaRecorder;

    // Mock Date.now for duration calculations
    vi.spyOn(Date, 'now').mockReturnValue(1000000);

    // Create recorder instance
    recorder = new AudioRecorder();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default state', () => {
      expect(recorder).toBeInstanceOf(AudioRecorder);
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder.isRecording).toBe(false);
      expect(recorder.captureSource).toBeNull();
      expect(recorder.duration).toBe(0);
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

      await expect(recorder.startRecording()).rejects.toThrow(
        'Recording already in progress'
      );
    });

    it('should handle microphone permission denial', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      mockGetUserMedia.mockRejectedValueOnce(error);

      await expect(recorder.startRecording()).rejects.toThrow(
        'Microphone access denied'
      );

      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('should handle no microphone found', async () => {
      const error = new Error('Not found');
      error.name = 'NotFoundError';
      mockGetUserMedia.mockRejectedValueOnce(error);

      await expect(recorder.startRecording()).rejects.toThrow(
        'No microphone found'
      );
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

      expect(onStateChange).toHaveBeenCalledWith(
        RecordingState.RECORDING,
        RecordingState.INACTIVE
      );
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
      expect(AudioUtils.createAudioBlob).toHaveBeenCalledWith(
        chunks,
        'audio/webm'
      );
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder._mediaRecorder).toBeNull();
      expect(recorder._stream).toBeNull();
    });

    it('should throw error if no active recording', async () => {
      await recorder.stopRecording();

      await expect(recorder.stopRecording()).rejects.toThrow(
        'No active recording to stop'
      );
    });

    it('should cleanup stream tracks on stop', async () => {
      const mockStream = recorder._stream;
      const tracks = mockStream.getTracks();

      await recorder.stopRecording();

      tracks.forEach(track => {
        expect(track.stop).toHaveBeenCalled();
      });
    });

    it('should handle MediaRecorder errors during stop', async () => {
      // Simulate error during stop
      recorder._mediaRecorder.onstop = null;
      recorder._mediaRecorder.onerror = null;

      // Make stop trigger error callback
      const originalStop = recorder._mediaRecorder.stop;
      recorder._mediaRecorder.stop = function() {
        this.state = 'inactive';
        if (this.onerror) {
          setTimeout(() => this.onerror({ error: new Error('Recording failed') }), 0);
        }
      };

      await expect(recorder.stopRecording()).rejects.toThrow('Recording failed');
      expect(recorder.state).toBe(RecordingState.INACTIVE);
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

      expect(() => recorder.pause()).toThrow(
        'Cannot pause - not currently recording'
      );
    });

    it('should resume paused recording', () => {
      recorder.pause();
      recorder.resume();

      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorder._mediaRecorder.state).toBe('recording');
    });

    it('should throw error if not paused when resuming', () => {
      expect(() => recorder.resume()).toThrow(
        'Cannot resume - recording is not paused'
      );
    });

    it('should call onStateChange callbacks on pause and resume', () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });

      recorder.pause();
      expect(onStateChange).toHaveBeenCalledWith(
        RecordingState.PAUSED,
        RecordingState.RECORDING
      );

      onStateChange.mockClear();

      recorder.resume();
      expect(onStateChange).toHaveBeenCalledWith(
        RecordingState.RECORDING,
        RecordingState.PAUSED
      );
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

      tracks.forEach(track => {
        expect(track.stop).toHaveBeenCalled();
      });
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
      tracks.forEach(track => {
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
  });
});
