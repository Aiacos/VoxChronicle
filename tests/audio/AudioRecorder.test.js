import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioRecorder, RecordingState, CaptureSource } from '../../scripts/audio/AudioRecorder.mjs';

// ── Mock helpers ─────────────────────────────────────────────────────────

/**
 * Create a minimal mock MediaStream with controllable tracks.
 */
function createMockStream() {
  const audioTrack = {
    kind: 'audio',
    stop: vi.fn(),
    enabled: true,
    readyState: 'live'
  };
  const videoTrack = {
    kind: 'video',
    stop: vi.fn(),
    enabled: true,
    readyState: 'live'
  };

  return {
    _audioTracks: [audioTrack],
    _videoTracks: [videoTrack],
    getTracks: vi.fn(function () {
      return [...this._audioTracks, ...this._videoTracks];
    }),
    getAudioTracks: vi.fn(function () {
      return this._audioTracks;
    }),
    getVideoTracks: vi.fn(function () {
      return this._videoTracks;
    })
  };
}

/**
 * Create a mock MediaRecorder that fires lifecycle events on demand.
 */
function createMockMediaRecorder() {
  let _state = 'inactive';
  let _ondataavailable = null;
  let _onstop = null;
  let _onerror = null;
  let _mimeType = 'audio/webm;codecs=opus';

  const recorder = {
    get state() { return _state; },
    set state(v) { _state = v; },
    get mimeType() { return _mimeType; },
    set mimeType(v) { _mimeType = v; },

    get ondataavailable() { return _ondataavailable; },
    set ondataavailable(fn) { _ondataavailable = fn; },
    get onstop() { return _onstop; },
    set onstop(fn) { _onstop = fn; },
    get onerror() { return _onerror; },
    set onerror(fn) { _onerror = fn; },

    start: vi.fn(function (_timeslice) {
      _state = 'recording';
    }),
    stop: vi.fn(function () {
      _state = 'inactive';
      // Simulate async onstop
      if (_onstop) {
        queueMicrotask(() => _onstop());
      }
    }),
    pause: vi.fn(function () {
      _state = 'paused';
    }),
    resume: vi.fn(function () {
      _state = 'recording';
    }),
    requestData: vi.fn(function () {
      // no-op
    }),

    // Test helper: simulate data arriving
    _emitData(data) {
      if (_ondataavailable) {
        _ondataavailable({ data });
      }
    },
    // Test helper: simulate error
    _emitError(error) {
      if (_onerror) {
        _onerror({ error });
      }
    }
  };

  return recorder;
}

/**
 * Create a mock AnalyserNode.
 */
function createMockAnalyser(frequencyData = null) {
  const defaultData = new Uint8Array(128).fill(0);
  return {
    frequencyBinCount: 128,
    fftSize: 256,
    getByteFrequencyData: vi.fn((arr) => {
      const src = frequencyData || defaultData;
      for (let i = 0; i < arr.length && i < src.length; i++) {
        arr[i] = src[i];
      }
    })
  };
}

/**
 * Create a mock AudioContext.
 */
function createMockAudioContext(analyser = null) {
  const mockAnalyser = analyser || createMockAnalyser();
  return {
    state: 'running',
    createMediaStreamSource: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn()
    })),
    createAnalyser: vi.fn(() => mockAnalyser),
    close: vi.fn()
  };
}

// ── Global mocks ─────────────────────────────────────────────────────────

let mockStream;
let mockRecorderInstance;
let MockMediaRecorderClass;
let mockAudioContextInstance;

beforeEach(() => {
  mockStream = createMockStream();
  mockRecorderInstance = createMockMediaRecorder();
  mockAudioContextInstance = createMockAudioContext();

  // navigator.mediaDevices.getUserMedia
  if (!globalThis.navigator) {
    globalThis.navigator = {};
  }
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {};
  }
  navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.resolve(mockStream));
  navigator.mediaDevices.getDisplayMedia = vi.fn(() => Promise.resolve(mockStream));
  navigator.mediaDevices.enumerateDevices = vi.fn(() =>
    Promise.resolve([
      { kind: 'audioinput', deviceId: 'default', label: 'Default Mic' },
      { kind: 'audioinput', deviceId: 'mic2', label: 'External Mic' },
      { kind: 'videoinput', deviceId: 'cam1', label: 'Webcam' }
    ])
  );

  // navigator.permissions
  navigator.permissions = {
    query: vi.fn(() => Promise.resolve({ state: 'granted' }))
  };

  // MediaRecorder constructor mock
  MockMediaRecorderClass = vi.fn(function (_stream, _opts) {
    // Copy properties from our singleton mock
    Object.assign(this, {
      state: 'inactive',
      mimeType: mockRecorderInstance.mimeType,
      start: mockRecorderInstance.start,
      stop: mockRecorderInstance.stop,
      pause: mockRecorderInstance.pause,
      resume: mockRecorderInstance.resume,
      requestData: mockRecorderInstance.requestData,
      ondataavailable: null,
      onstop: null,
      onerror: null
    });

    // Intercept property assignments so mockRecorderInstance can trigger them
    const self = this;
    // Store a reference so our test helpers can reach the actual handler
    MockMediaRecorderClass._lastInstance = self;
  });
  MockMediaRecorderClass.isTypeSupported = vi.fn(() => true);
  globalThis.MediaRecorder = MockMediaRecorderClass;

  // AudioContext mock
  globalThis.AudioContext = vi.fn(() => mockAudioContextInstance);

  // requestAnimationFrame / cancelAnimationFrame
  let _rafId = 0;
  globalThis.requestAnimationFrame = vi.fn((cb) => {
    _rafId++;
    // Don't auto-invoke to avoid infinite loops in tests
    return _rafId;
  });
  globalThis.cancelAnimationFrame = vi.fn();
});

afterEach(() => {
  delete globalThis.MediaRecorder;
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('AudioRecorder', () => {

  // ── Exports ────────────────────────────────────────────────────────────

  describe('Exports', () => {
    it('should export RecordingState enum with correct values', () => {
      expect(RecordingState.INACTIVE).toBe('inactive');
      expect(RecordingState.RECORDING).toBe('recording');
      expect(RecordingState.PAUSED).toBe('paused');
    });

    it('should export CaptureSource enum with correct values', () => {
      expect(CaptureSource.MICROPHONE).toBe('microphone');
      expect(CaptureSource.FOUNDRY_WEBRTC).toBe('foundry-webrtc');
      expect(CaptureSource.SYSTEM_AUDIO).toBe('system-audio');
    });
  });

  // ── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create an instance with default options', () => {
      const recorder = new AudioRecorder();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder.isRecording).toBe(false);
      expect(recorder.captureSource).toBeNull();
      expect(recorder.duration).toBe(0);
    });

    it('should accept a custom silenceThreshold', () => {
      const recorder = new AudioRecorder({ silenceThreshold: 0.05 });
      expect(recorder._silenceThreshold).toBe(0.05);
    });

    it('should accept a custom maxDuration', () => {
      const recorder = new AudioRecorder({ maxDuration: 600000 });
      expect(recorder._maxDuration).toBe(600000);
    });

    it('should accept callback options', () => {
      const onLevel = vi.fn();
      const onSilence = vi.fn();
      const onSound = vi.fn();
      const onAutoStop = vi.fn();

      const recorder = new AudioRecorder({
        onLevelChange: onLevel,
        onSilenceDetected: onSilence,
        onSoundDetected: onSound,
        onAutoStop: onAutoStop
      });

      expect(recorder._callbacks.onLevelChange).toBe(onLevel);
      expect(recorder._callbacks.onSilenceDetected).toBe(onSilence);
      expect(recorder._callbacks.onSoundDetected).toBe(onSound);
      expect(recorder._callbacks.onAutoStop).toBe(onAutoStop);
    });

    it('should use default silenceThreshold when not provided', () => {
      const recorder = new AudioRecorder();
      expect(recorder._silenceThreshold).toBe(0.01);
    });

    it('should use default maxDuration when not provided', () => {
      const recorder = new AudioRecorder();
      expect(recorder._maxDuration).toBe(300000);
    });
  });

  // ── Getters ────────────────────────────────────────────────────────────

  describe('getters', () => {
    it('state should return current recording state', () => {
      const recorder = new AudioRecorder();
      expect(recorder.state).toBe('inactive');
    });

    it('isRecording should return true only when recording', () => {
      const recorder = new AudioRecorder();
      expect(recorder.isRecording).toBe(false);

      recorder._state = RecordingState.RECORDING;
      expect(recorder.isRecording).toBe(true);

      recorder._state = RecordingState.PAUSED;
      expect(recorder.isRecording).toBe(false);
    });

    it('captureSource should return null initially', () => {
      const recorder = new AudioRecorder();
      expect(recorder.captureSource).toBeNull();
    });

    it('duration should return 0 when not recording', () => {
      const recorder = new AudioRecorder();
      expect(recorder.duration).toBe(0);
    });

    it('duration should return elapsed seconds when recording', () => {
      vi.useFakeTimers();
      try {
        const recorder = new AudioRecorder();
        recorder._startTime = Date.now();
        vi.advanceTimersByTime(5000);
        expect(recorder.duration).toBe(5);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── setCallbacks ───────────────────────────────────────────────────────

  describe('setCallbacks()', () => {
    it('should merge new callbacks with existing ones', () => {
      const recorder = new AudioRecorder();
      const onError = vi.fn();
      const onStateChange = vi.fn();

      recorder.setCallbacks({ onError, onStateChange });

      expect(recorder._callbacks.onError).toBe(onError);
      expect(recorder._callbacks.onStateChange).toBe(onStateChange);
      // Other callbacks should remain null
      expect(recorder._callbacks.onDataAvailable).toBeNull();
    });

    it('should overwrite existing callbacks', () => {
      const first = vi.fn();
      const second = vi.fn();
      const recorder = new AudioRecorder({ onLevelChange: first });

      recorder.setCallbacks({ onLevelChange: second });
      expect(recorder._callbacks.onLevelChange).toBe(second);
    });
  });

  // ── startRecording - microphone (default) ──────────────────────────────

  describe('startRecording() - microphone', () => {
    it('should start recording from microphone by default', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
            channelCount: 1
          })
        })
      );
      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorder.isRecording).toBe(true);
      expect(recorder.captureSource).toBe(CaptureSource.MICROPHONE);
      expect(recorder._startTime).not.toBeNull();
    });

    it('should pass custom audio constraints', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording({
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 48000,
        channelCount: 2,
        deviceId: 'mic2'
      });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            echoCancellation: false,
            noiseSuppression: false,
            sampleRate: 48000,
            channelCount: 2,
            deviceId: { exact: 'mic2' }
          })
        })
      );
    });

    it('should throw if already recording', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      await expect(recorder.startRecording()).rejects.toThrow(
        'Recording already in progress'
      );
    });

    it('should throw friendly message on NotAllowedError', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.reject(error));

      const recorder = new AudioRecorder();
      await expect(recorder.startRecording()).rejects.toThrow('Microphone access denied');
    });

    it('should throw friendly message on NotFoundError', async () => {
      const error = new Error('No device');
      error.name = 'NotFoundError';
      navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.reject(error));

      const recorder = new AudioRecorder();
      await expect(recorder.startRecording()).rejects.toThrow('No microphone found');
    });

    it('should throw friendly message on NotReadableError', async () => {
      const error = new Error('In use');
      error.name = 'NotReadableError';
      navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.reject(error));

      const recorder = new AudioRecorder();
      await expect(recorder.startRecording()).rejects.toThrow('Microphone is in use');
    });

    it('should re-throw unknown errors from getUserMedia', async () => {
      const error = new Error('Something unexpected');
      error.name = 'SomeOtherError';
      navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.reject(error));

      const recorder = new AudioRecorder();
      await expect(recorder.startRecording()).rejects.toThrow('Something unexpected');
    });

    it('should clean up on failure', async () => {
      navigator.mediaDevices.getUserMedia = vi.fn(() =>
        Promise.reject(new Error('fail'))
      );

      const recorder = new AudioRecorder();
      await expect(recorder.startRecording()).rejects.toThrow('fail');
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder._stream).toBeNull();
    });

    it('should call onStateChange when state transitions to RECORDING', async () => {
      const onStateChange = vi.fn();
      const recorder = new AudioRecorder();
      recorder.setCallbacks({ onStateChange });

      await recorder.startRecording();

      expect(onStateChange).toHaveBeenCalledWith(
        RecordingState.RECORDING,
        RecordingState.INACTIVE
      );
    });

    it('should set up audio analysis pipeline', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      expect(globalThis.AudioContext).toHaveBeenCalled();
      expect(mockAudioContextInstance.createMediaStreamSource).toHaveBeenCalled();
      expect(mockAudioContextInstance.createAnalyser).toHaveBeenCalled();
    });

    it('should start level monitoring when analyser is available', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should start auto-stop timer when maxDuration > 0', async () => {
      vi.useFakeTimers();
      try {
        const onAutoStop = vi.fn();
        const recorder = new AudioRecorder({ maxDuration: 5000, onAutoStop });
        await recorder.startRecording();

        expect(recorder._maxDurationTimeout).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not start auto-stop timer when maxDuration is 0', async () => {
      const recorder = new AudioRecorder({ maxDuration: 0 });
      await recorder.startRecording();

      expect(recorder._maxDurationTimeout).toBeNull();
    });

    it('should accept a custom timeslice', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording({ timeslice: 5000 });

      // The MediaRecorder.start was called with the custom timeslice
      const instance = MockMediaRecorderClass._lastInstance;
      expect(instance.start).toHaveBeenCalledWith(5000);
    });
  });

  // ── startRecording - WebRTC ────────────────────────────────────────────

  describe('startRecording() - foundry-webrtc', () => {
    it('should use Foundry WebRTC stream when available', async () => {
      const webrtcStream = createMockStream();
      globalThis.game.webrtc = {
        client: {
          localStream: webrtcStream
        }
      };

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      expect(recorder.captureSource).toBe(CaptureSource.FOUNDRY_WEBRTC);
      // Should NOT have called getUserMedia since WebRTC stream was used
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it('should fall back to microphone when WebRTC client is not available', async () => {
      globalThis.game.webrtc = null;

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      // Should have fallen back to getUserMedia
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    it('should fall back to microphone when localStream has no audio tracks', async () => {
      const silentStream = createMockStream();
      silentStream._audioTracks = [];
      silentStream.getAudioTracks = vi.fn(() => []);

      globalThis.game.webrtc = {
        client: {
          localStream: silentStream
        }
      };

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    it('should fall back to microphone when game is undefined', async () => {
      const savedGame = globalThis.game;
      delete globalThis.game;

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();

      globalThis.game = savedGame;
    });

    it('should use getLocalStream() when localStream is null', async () => {
      const webrtcStream = createMockStream();
      globalThis.game.webrtc = {
        client: {
          localStream: null,
          getLocalStream: vi.fn(() => webrtcStream)
        }
      };

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.FOUNDRY_WEBRTC });

      expect(globalThis.game.webrtc.client.getLocalStream).toHaveBeenCalled();
    });
  });

  // ── startRecording - system audio ──────────────────────────────────────

  describe('startRecording() - system-audio', () => {
    it('should use getDisplayMedia for system audio capture', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        video: true,
        audio: true
      });
    });

    it('should fall back to microphone when getDisplayMedia is not supported', async () => {
      navigator.mediaDevices.getDisplayMedia = undefined;

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    it('should fall back to microphone when display media has no audio tracks', async () => {
      const noAudioStream = createMockStream();
      noAudioStream._audioTracks = [];
      noAudioStream.getAudioTracks = vi.fn(() => []);
      navigator.mediaDevices.getDisplayMedia = vi.fn(() => Promise.resolve(noAudioStream));

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      // Video tracks should be stopped
      expect(noAudioStream._videoTracks[0].stop).toHaveBeenCalled();
      // Should fall back to microphone
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    it('should stop video tracks after getting system audio', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(mockStream._videoTracks[0].stop).toHaveBeenCalled();
    });

    it('should fall back on NotAllowedError from getDisplayMedia', async () => {
      const error = new Error('denied');
      error.name = 'NotAllowedError';
      navigator.mediaDevices.getDisplayMedia = vi.fn(() => Promise.reject(error));

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    it('should fall back on generic error from getDisplayMedia', async () => {
      navigator.mediaDevices.getDisplayMedia = vi.fn(() =>
        Promise.reject(new Error('generic fail'))
      );

      const recorder = new AudioRecorder();
      await recorder.startRecording({ source: CaptureSource.SYSTEM_AUDIO });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });
  });

  // ── stopRecording ──────────────────────────────────────────────────────

  describe('stopRecording()', () => {
    it('should throw if not recording', async () => {
      const recorder = new AudioRecorder();
      await expect(recorder.stopRecording()).rejects.toThrow('No active recording');
    });

    it('should stop the MediaRecorder and return a blob', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      // Simulate that some audio data was collected
      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';
      const chunk = new Blob([new ArrayBuffer(1024)], { type: 'audio/webm' });
      recorder._audioChunks.push(chunk);

      // Override stop to trigger onstop
      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onstop) {
          queueMicrotask(() => instance.onstop());
        }
      });

      const blob = await recorder.stopRecording();
      expect(blob).toBeInstanceOf(Blob);
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder.isRecording).toBe(false);
    });

    it('should reject if MediaRecorder is not active', async () => {
      const recorder = new AudioRecorder();
      recorder._state = RecordingState.RECORDING;
      recorder._mediaRecorder = { state: 'inactive' };

      await expect(recorder.stopRecording()).rejects.toThrow('MediaRecorder is not active');
    });

    it('should reject if MediaRecorder is null', async () => {
      const recorder = new AudioRecorder();
      recorder._state = RecordingState.RECORDING;
      recorder._mediaRecorder = null;

      await expect(recorder.stopRecording()).rejects.toThrow('MediaRecorder is not active');
    });

    it('should clean up stream tracks after stopping', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';
      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onstop) queueMicrotask(() => instance.onstop());
      });

      recorder._audioChunks.push(new Blob([new ArrayBuffer(100)], { type: 'audio/webm' }));
      await recorder.stopRecording();

      // Stream tracks should be stopped
      for (const track of mockStream.getTracks()) {
        expect(track.stop).toHaveBeenCalled();
      }
    });

    it('should reject if MediaRecorder onerror fires during stop', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';
      const testError = new Error('recorder error');

      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onerror) {
          queueMicrotask(() => instance.onerror({ error: testError }));
        }
      });

      await expect(recorder.stopRecording()).rejects.toThrow('recorder error');
    });

    it('should stop level monitoring on stop', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';
      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onstop) queueMicrotask(() => instance.onstop());
      });

      recorder._audioChunks.push(new Blob([new ArrayBuffer(100)], { type: 'audio/webm' }));
      await recorder.stopRecording();

      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should clear auto-stop timer on stop', async () => {
      vi.useFakeTimers();
      try {
        const recorder = new AudioRecorder({ maxDuration: 60000 });
        await recorder.startRecording();

        const instance = MockMediaRecorderClass._lastInstance;
        instance.state = 'recording';
        instance.stop = vi.fn(function () {
          instance.state = 'inactive';
          if (instance.onstop) queueMicrotask(() => instance.onstop());
        });

        recorder._audioChunks.push(new Blob([new ArrayBuffer(100)], { type: 'audio/webm' }));
        await recorder.stopRecording();

        expect(recorder._maxDurationTimeout).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── pause / resume ─────────────────────────────────────────────────────

  describe('pause()', () => {
    it('should throw if not recording', () => {
      const recorder = new AudioRecorder();
      expect(() => recorder.pause()).toThrow('Cannot pause - not currently recording');
    });

    it('should pause the MediaRecorder and update state', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';

      recorder.pause();

      expect(instance.pause).toHaveBeenCalled();
      expect(recorder.state).toBe(RecordingState.PAUSED);
    });

    it('should call onStateChange callback', async () => {
      const onStateChange = vi.fn();
      const recorder = new AudioRecorder();
      recorder.setCallbacks({ onStateChange });
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';

      onStateChange.mockClear();
      recorder.pause();

      expect(onStateChange).toHaveBeenCalledWith(
        RecordingState.PAUSED,
        RecordingState.RECORDING
      );
    });
  });

  describe('resume()', () => {
    it('should throw if not paused', () => {
      const recorder = new AudioRecorder();
      expect(() => recorder.resume()).toThrow('Cannot resume - recording is not paused');
    });

    it('should resume a paused recording', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';
      recorder.pause();

      instance.state = 'paused';
      recorder.resume();

      expect(instance.resume).toHaveBeenCalled();
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('should do nothing if inactive', () => {
      const recorder = new AudioRecorder();
      recorder.cancel(); // should not throw
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('should stop recording and clean up without returning a blob', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';

      recorder.cancel();

      expect(instance.stop).toHaveBeenCalled();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder._stream).toBeNull();
      expect(recorder._mediaRecorder).toBeNull();
    });

    it('should handle cancel when mediaRecorder is already inactive', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'inactive';

      // Should not throw even though recorder is already inactive
      recorder.cancel();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });
  });

  // ── requestData ────────────────────────────────────────────────────────

  describe('requestData()', () => {
    it('should call requestData on MediaRecorder when recording', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';

      recorder.requestData();
      expect(instance.requestData).toHaveBeenCalled();
    });

    it('should not throw when not recording', () => {
      const recorder = new AudioRecorder();
      recorder.requestData(); // no-op, no throw
    });

    it('should not call requestData when MediaRecorder is paused', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'paused';
      instance.requestData.mockClear();

      recorder.requestData();
      expect(instance.requestData).not.toHaveBeenCalled();
    });
  });

  // ── ondataavailable event handling ─────────────────────────────────────

  describe('ondataavailable event', () => {
    it('should push chunks to _audioChunks and _liveChunks', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      const chunk = new Blob([new ArrayBuffer(512)], { type: 'audio/webm' });

      // Trigger ondataavailable
      instance.ondataavailable({ data: chunk });

      expect(recorder._audioChunks).toHaveLength(1);
      expect(recorder._audioChunks[0]).toBe(chunk);
      expect(recorder._liveChunks).toHaveLength(1);
    });

    it('should call onDataAvailable callback with chunk and count', async () => {
      const onDataAvailable = vi.fn();
      const recorder = new AudioRecorder();
      recorder.setCallbacks({ onDataAvailable });
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      const chunk = new Blob([new ArrayBuffer(256)], { type: 'audio/webm' });
      instance.ondataavailable({ data: chunk });

      expect(onDataAvailable).toHaveBeenCalledWith(chunk, 1);
    });

    it('should ignore empty chunks (size 0)', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.ondataavailable({ data: new Blob([], { type: 'audio/webm' }) });

      expect(recorder._audioChunks).toHaveLength(0);
    });

    it('should ignore null data', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.ondataavailable({ data: null });

      expect(recorder._audioChunks).toHaveLength(0);
    });
  });

  // ── onerror event handling ─────────────────────────────────────────────

  describe('onerror event (during recording)', () => {
    it('should call onError callback', async () => {
      const onError = vi.fn();
      const recorder = new AudioRecorder();
      recorder.setCallbacks({ onError });
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      const testError = new Error('test error');
      instance.onerror({ error: testError });

      expect(onError).toHaveBeenCalledWith(testError);
    });
  });

  // ── getLatestChunk / _rotateRecorder ───────────────────────────────────

  describe('getLatestChunk()', () => {
    it('should return null when not recording', async () => {
      const recorder = new AudioRecorder();
      const result = await recorder.getLatestChunk();
      expect(result).toBeNull();
    });

    it('should return null when mediaRecorder is null', async () => {
      const recorder = new AudioRecorder();
      recorder._state = RecordingState.RECORDING;
      recorder._mediaRecorder = null;
      const result = await recorder.getLatestChunk();
      expect(result).toBeNull();
    });

    it('should rotate the recorder and return accumulated live chunks', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';

      // Simulate some live chunks accumulated
      const chunk1 = new Blob([new ArrayBuffer(100)], { type: 'audio/webm' });
      const chunk2 = new Blob([new ArrayBuffer(200)], { type: 'audio/webm' });
      recorder._liveChunks = [chunk1, chunk2];

      // Override stop to trigger onstop
      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onstop) queueMicrotask(() => instance.onstop());
      });

      const blob = await recorder.getLatestChunk();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(300);
    });

    it('should return null when no live chunks are accumulated', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';
      recorder._liveChunks = [];

      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onstop) queueMicrotask(() => instance.onstop());
      });

      const blob = await recorder.getLatestChunk();
      expect(blob).toBeNull();
    });

    it('should return null when recorder state is not recording or paused', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'inactive';

      const blob = await recorder.getLatestChunk();
      expect(blob).toBeNull();
    });

    it('should return null on rotation error', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';

      // Make stop throw
      instance.stop = vi.fn(function () {
        throw new Error('stop failed');
      });

      const blob = await recorder.getLatestChunk();
      expect(blob).toBeNull();
    });

    it('should handle onerror during rotation', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';

      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onerror) {
          queueMicrotask(() => instance.onerror({ error: new Error('rotation error') }));
        }
      });

      const blob = await recorder.getLatestChunk();
      expect(blob).toBeNull();
    });

    it('should clear _liveChunks after rotation', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';
      recorder._liveChunks = [new Blob([new ArrayBuffer(50)], { type: 'audio/webm' })];

      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onstop) queueMicrotask(() => instance.onstop());
      });

      await recorder.getLatestChunk();
      expect(recorder._liveChunks).toHaveLength(0);
    });
  });

  // ── _startFreshRecorder ────────────────────────────────────────────────

  describe('_startFreshRecorder()', () => {
    it('should create a new MediaRecorder on the existing stream', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      MockMediaRecorderClass.mockClear();
      recorder._startFreshRecorder('audio/webm');

      expect(MockMediaRecorderClass).toHaveBeenCalledWith(
        recorder._stream,
        expect.any(Object)
      );
    });

    it('should do nothing if stream is null', () => {
      const recorder = new AudioRecorder();
      recorder._stream = null;
      recorder._startFreshRecorder('audio/webm'); // should not throw
    });

    it('should start the new recorder with DEFAULT_TIMESLICE', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      MockMediaRecorderClass.mockClear();
      recorder._startFreshRecorder('audio/webm');

      const freshInstance = MockMediaRecorderClass._lastInstance;
      expect(freshInstance.start).toHaveBeenCalledWith(10000);
    });
  });

  // ── getAudioLevel ──────────────────────────────────────────────────────

  describe('getAudioLevel()', () => {
    it('should return 0 when no analyser node exists', () => {
      const recorder = new AudioRecorder();
      expect(recorder.getAudioLevel()).toBe(0);
    });

    it('should return 0 when frequency data is all zeros', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      // The mock analyser fills with zeros by default
      const level = recorder.getAudioLevel();
      expect(level).toBe(0);
    });

    it('should return a positive level for non-zero frequency data', async () => {
      const loudData = new Uint8Array(128).fill(200);
      const loudAnalyser = createMockAnalyser(loudData);
      mockAudioContextInstance.createAnalyser = vi.fn(() => loudAnalyser);

      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const level = recorder.getAudioLevel();
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThanOrEqual(1);
    });

    it('should clamp level to 1.0 maximum', async () => {
      // All 255s should produce level > 1 before clamping
      const maxData = new Uint8Array(128).fill(255);
      const maxAnalyser = createMockAnalyser(maxData);
      mockAudioContextInstance.createAnalyser = vi.fn(() => maxAnalyser);

      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const level = recorder.getAudioLevel();
      expect(level).toBeLessThanOrEqual(1);
    });
  });

  // ── Silence detection ──────────────────────────────────────────────────

  describe('silence detection (_detectSilence)', () => {
    it('should transition to silent when level drops below threshold', () => {
      const recorder = new AudioRecorder({ silenceThreshold: 0.1 });

      recorder._detectSilence(0.05);

      expect(recorder._isSilent).toBe(true);
      expect(recorder._silenceStartTime).not.toBeNull();
    });

    it('should call onSilenceDetected with duration when silence persists', () => {
      vi.useFakeTimers();
      try {
        const onSilenceDetected = vi.fn();
        const recorder = new AudioRecorder({
          silenceThreshold: 0.1,
          onSilenceDetected
        });

        // First call: transition to silent
        recorder._detectSilence(0.05);

        // Advance time
        vi.advanceTimersByTime(2000);

        // Second call while still silent
        recorder._detectSilence(0.05);

        expect(onSilenceDetected).toHaveBeenCalledWith(expect.any(Number));
        const duration = onSilenceDetected.mock.calls[0][0];
        expect(duration).toBeGreaterThanOrEqual(2000);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should call onSoundDetected when sound resumes after silence', () => {
      const onSoundDetected = vi.fn();
      const recorder = new AudioRecorder({
        silenceThreshold: 0.1,
        onSoundDetected
      });

      // Go silent
      recorder._detectSilence(0.05);
      expect(recorder._isSilent).toBe(true);

      // Resume sound
      recorder._detectSilence(0.5);
      expect(recorder._isSilent).toBe(false);
      expect(recorder._silenceStartTime).toBeNull();
      expect(onSoundDetected).toHaveBeenCalledTimes(1);
    });

    it('should not call onSoundDetected if already not silent', () => {
      const onSoundDetected = vi.fn();
      const recorder = new AudioRecorder({
        silenceThreshold: 0.1,
        onSoundDetected
      });

      recorder._detectSilence(0.5); // above threshold, not silent
      expect(onSoundDetected).not.toHaveBeenCalled();
    });

    it('should not call onSilenceDetected on first silent frame (no duration yet)', () => {
      const onSilenceDetected = vi.fn();
      const recorder = new AudioRecorder({
        silenceThreshold: 0.1,
        onSilenceDetected
      });

      // First call transitions to silent but doesn't have duration yet
      recorder._detectSilence(0.05);
      expect(onSilenceDetected).not.toHaveBeenCalled();
    });
  });

  // ── Auto-stop timer ────────────────────────────────────────────────────

  describe('auto-stop timer', () => {
    it('should call onAutoStop and stop recording when timer fires', async () => {
      vi.useFakeTimers();
      try {
        const onAutoStop = vi.fn();
        const recorder = new AudioRecorder({ maxDuration: 1000, onAutoStop });
        await recorder.startRecording();

        // Make stopRecording work
        const instance = MockMediaRecorderClass._lastInstance;
        instance.state = 'recording';
        instance.stop = vi.fn(function () {
          instance.state = 'inactive';
          if (instance.onstop) queueMicrotask(() => instance.onstop());
        });
        recorder._audioChunks.push(new Blob([new ArrayBuffer(100)], { type: 'audio/webm' }));

        // Fire the timer
        vi.advanceTimersByTime(1000);

        expect(onAutoStop).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clear timer when stopRecording is called before timeout', async () => {
      vi.useFakeTimers();
      try {
        const recorder = new AudioRecorder({ maxDuration: 60000 });
        await recorder.startRecording();

        const instance = MockMediaRecorderClass._lastInstance;
        instance.state = 'recording';
        instance.stop = vi.fn(function () {
          instance.state = 'inactive';
          if (instance.onstop) queueMicrotask(() => instance.onstop());
        });
        recorder._audioChunks.push(new Blob([new ArrayBuffer(100)], { type: 'audio/webm' }));

        await recorder.stopRecording();

        // Timer should have been cleared
        expect(recorder._maxDurationTimeout).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── Audio analysis setup ───────────────────────────────────────────────

  describe('_setupAudioAnalysis()', () => {
    it('should not crash when stream is null', () => {
      const recorder = new AudioRecorder();
      recorder._setupAudioAnalysis(null);
      expect(recorder._audioContext).toBeNull();
    });

    it('should handle AudioContext not being available', async () => {
      delete globalThis.AudioContext;
      delete globalThis.webkitAudioContext;

      const recorder = new AudioRecorder();
      recorder._setupAudioAnalysis(mockStream);

      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
    });

    it('should use webkitAudioContext as fallback', async () => {
      delete globalThis.AudioContext;
      const webkitCtx = createMockAudioContext();
      globalThis.webkitAudioContext = vi.fn(() => webkitCtx);

      const recorder = new AudioRecorder();
      recorder._setupAudioAnalysis(mockStream);

      expect(globalThis.webkitAudioContext).toHaveBeenCalled();
      expect(recorder._audioContext).toBe(webkitCtx);
    });

    it('should handle errors during setup gracefully', async () => {
      globalThis.AudioContext = vi.fn(() => {
        throw new Error('AudioContext init failed');
      });

      const recorder = new AudioRecorder();
      recorder._setupAudioAnalysis(mockStream);

      // Should reset to null on error
      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
      expect(recorder._sourceNode).toBeNull();
    });
  });

  // ── Level monitoring ───────────────────────────────────────────────────

  describe('_startLevelMonitoring()', () => {
    it('should not start if no analyser node', () => {
      const recorder = new AudioRecorder();
      recorder._analyserNode = null;

      globalThis.requestAnimationFrame.mockClear();
      recorder._startLevelMonitoring();

      expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should call requestAnimationFrame when analyser exists', () => {
      const recorder = new AudioRecorder();
      recorder._analyserNode = createMockAnalyser();

      globalThis.requestAnimationFrame.mockClear();
      recorder._startLevelMonitoring();

      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('_stopLevelMonitoring()', () => {
    it('should cancel animation frame if active', () => {
      const recorder = new AudioRecorder();
      recorder._levelMonitorId = 42;

      recorder._stopLevelMonitoring();

      expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(42);
      expect(recorder._levelMonitorId).toBeNull();
    });

    it('should reset silence state', () => {
      const recorder = new AudioRecorder();
      recorder._isSilent = true;
      recorder._silenceStartTime = 12345;
      recorder._levelMonitorId = null;

      recorder._stopLevelMonitoring();

      expect(recorder._isSilent).toBe(false);
      expect(recorder._silenceStartTime).toBeNull();
    });

    it('should not call cancelAnimationFrame if no monitor is active', () => {
      const recorder = new AudioRecorder();
      recorder._levelMonitorId = null;

      globalThis.cancelAnimationFrame.mockClear();
      recorder._stopLevelMonitoring();

      expect(globalThis.cancelAnimationFrame).not.toHaveBeenCalled();
    });
  });

  // ── checkMicrophonePermission ──────────────────────────────────────────

  describe('checkMicrophonePermission()', () => {
    it('should return the permission state', async () => {
      const recorder = new AudioRecorder();
      const state = await recorder.checkMicrophonePermission();
      expect(state).toBe('granted');
    });

    it('should return "prompt" when Permissions API is not supported', async () => {
      navigator.permissions = undefined;

      const recorder = new AudioRecorder();
      const state = await recorder.checkMicrophonePermission();
      expect(state).toBe('prompt');
    });

    it('should return "prompt" when permissions.query is not available', async () => {
      navigator.permissions = {};

      const recorder = new AudioRecorder();
      const state = await recorder.checkMicrophonePermission();
      expect(state).toBe('prompt');
    });

    it('should return "prompt" on error', async () => {
      navigator.permissions.query = vi.fn(() => Promise.reject(new Error('fail')));

      const recorder = new AudioRecorder();
      const state = await recorder.checkMicrophonePermission();
      expect(state).toBe('prompt');
    });

    it('should return "denied" when permission is denied', async () => {
      navigator.permissions.query = vi.fn(() =>
        Promise.resolve({ state: 'denied' })
      );

      const recorder = new AudioRecorder();
      const state = await recorder.checkMicrophonePermission();
      expect(state).toBe('denied');
    });
  });

  // ── requestMicrophonePermission ────────────────────────────────────────

  describe('requestMicrophonePermission()', () => {
    it('should return true when permission is granted', async () => {
      const recorder = new AudioRecorder();
      const result = await recorder.requestMicrophonePermission();
      expect(result).toBe(true);
    });

    it('should stop tracks immediately after permission grant', async () => {
      const recorder = new AudioRecorder();
      await recorder.requestMicrophonePermission();

      for (const track of mockStream.getTracks()) {
        expect(track.stop).toHaveBeenCalled();
      }
    });

    it('should return false on NotAllowedError', async () => {
      const error = new Error('denied');
      error.name = 'NotAllowedError';
      navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.reject(error));

      const recorder = new AudioRecorder();
      const result = await recorder.requestMicrophonePermission();
      expect(result).toBe(false);
    });

    it('should return false on other errors', async () => {
      navigator.mediaDevices.getUserMedia = vi.fn(() =>
        Promise.reject(new Error('unexpected'))
      );

      const recorder = new AudioRecorder();
      const result = await recorder.requestMicrophonePermission();
      expect(result).toBe(false);
    });
  });

  // ── getAudioInputDevices ───────────────────────────────────────────────

  describe('getAudioInputDevices()', () => {
    it('should return only audio input devices', async () => {
      const recorder = new AudioRecorder();
      const devices = await recorder.getAudioInputDevices();

      expect(devices).toHaveLength(2); // Two audioinput devices from our mock
      expect(devices.every((d) => d.kind === 'audioinput')).toBe(true);
    });

    it('should return empty array on error', async () => {
      navigator.mediaDevices.enumerateDevices = vi.fn(() =>
        Promise.reject(new Error('fail'))
      );

      const recorder = new AudioRecorder();
      const devices = await recorder.getAudioInputDevices();
      expect(devices).toEqual([]);
    });
  });

  // ── _cleanup ───────────────────────────────────────────────────────────

  describe('_cleanup()', () => {
    it('should reset all state to initial values', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      // Push some data
      recorder._audioChunks.push(new Blob([]));
      recorder._liveChunks.push(new Blob([]));

      recorder._cleanup();

      expect(recorder._mediaRecorder).toBeNull();
      expect(recorder._stream).toBeNull();
      expect(recorder._audioChunks).toEqual([]);
      expect(recorder._liveChunks).toEqual([]);
      expect(recorder._captureSource).toBeNull();
      expect(recorder._startTime).toBeNull();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('should stop all stream tracks', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      recorder._cleanup();

      for (const track of mockStream.getTracks()) {
        expect(track.stop).toHaveBeenCalled();
      }
    });

    it('should close AudioContext if open', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      recorder._cleanup();

      expect(mockAudioContextInstance.close).toHaveBeenCalled();
    });

    it('should handle already-closed AudioContext', () => {
      const recorder = new AudioRecorder();
      recorder._audioContext = { state: 'closed', close: vi.fn() };
      recorder._sourceNode = { disconnect: vi.fn() };

      recorder._cleanup();

      expect(recorder._audioContext).toBeNull();
    });

    it('should handle disconnect error on sourceNode', () => {
      const recorder = new AudioRecorder();
      recorder._sourceNode = {
        disconnect: vi.fn(() => { throw new Error('already disconnected'); })
      };

      // Should not throw
      recorder._cleanupAudioAnalysis();
      expect(recorder._sourceNode).toBeNull();
    });

    it('should handle AudioContext close error', () => {
      const recorder = new AudioRecorder();
      recorder._audioContext = {
        state: 'running',
        close: vi.fn(() => { throw new Error('close failed'); })
      };

      // Should not throw
      recorder._cleanupAudioAnalysis();
      expect(recorder._audioContext).toBeNull();
    });
  });

  // ── _updateState ───────────────────────────────────────────────────────

  describe('_updateState()', () => {
    it('should update state and call onStateChange', () => {
      const onStateChange = vi.fn();
      const recorder = new AudioRecorder();
      recorder.setCallbacks({ onStateChange });

      recorder._updateState(RecordingState.RECORDING);

      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(onStateChange).toHaveBeenCalledWith(RecordingState.RECORDING, RecordingState.INACTIVE);
    });

    it('should not throw when no onStateChange callback is set', () => {
      const recorder = new AudioRecorder();
      recorder._updateState(RecordingState.RECORDING);
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });
  });

  // ── _initializeRecorder ────────────────────────────────────────────────

  describe('_initializeRecorder()', () => {
    it('should throw when no stream is available', async () => {
      const recorder = new AudioRecorder();
      recorder._stream = null;

      await expect(recorder._initializeRecorder()).rejects.toThrow(
        'No media stream available'
      );
    });

    it('should create MediaRecorder with default timeslice (10s)', async () => {
      const recorder = new AudioRecorder();
      recorder._stream = mockStream;

      await recorder._initializeRecorder();

      const instance = MockMediaRecorderClass._lastInstance;
      expect(instance.start).toHaveBeenCalledWith(10000);
    });

    it('should create MediaRecorder with custom timeslice', async () => {
      const recorder = new AudioRecorder();
      recorder._stream = mockStream;

      await recorder._initializeRecorder(3000);

      const instance = MockMediaRecorderClass._lastInstance;
      expect(instance.start).toHaveBeenCalledWith(3000);
    });

    it('should reset audioChunks on initialize', async () => {
      const recorder = new AudioRecorder();
      recorder._stream = mockStream;
      recorder._audioChunks = [new Blob([])];

      await recorder._initializeRecorder();

      expect(recorder._audioChunks).toEqual([]);
    });
  });

  // ── Full recording lifecycle ───────────────────────────────────────────

  describe('full recording lifecycle', () => {
    it('should support start -> pause -> resume -> stop cycle', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const instance = MockMediaRecorderClass._lastInstance;
      instance.state = 'recording';

      // Pause
      recorder.pause();
      expect(recorder.state).toBe(RecordingState.PAUSED);

      // Resume
      instance.state = 'paused';
      recorder.resume();
      expect(recorder.state).toBe(RecordingState.RECORDING);

      // Stop
      instance.state = 'recording';
      instance.stop = vi.fn(function () {
        instance.state = 'inactive';
        if (instance.onstop) queueMicrotask(() => instance.onstop());
      });
      recorder._audioChunks.push(new Blob([new ArrayBuffer(100)], { type: 'audio/webm' }));

      const blob = await recorder.stopRecording();
      expect(blob).toBeInstanceOf(Blob);
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('should support multiple start/stop cycles', async () => {
      const recorder = new AudioRecorder();

      for (let i = 0; i < 3; i++) {
        await recorder.startRecording();

        const instance = MockMediaRecorderClass._lastInstance;
        instance.state = 'recording';
        instance.stop = vi.fn(function () {
          instance.state = 'inactive';
          if (instance.onstop) queueMicrotask(() => instance.onstop());
        });
        recorder._audioChunks.push(new Blob([new ArrayBuffer(50)], { type: 'audio/webm' }));

        const blob = await recorder.stopRecording();
        expect(blob).toBeInstanceOf(Blob);
        expect(recorder.state).toBe(RecordingState.INACTIVE);
      }
    });
  });

  // ── Duration tracking with fake timers ─────────────────────────────────

  describe('duration tracking', () => {
    it('should track elapsed time in seconds', () => {
      vi.useFakeTimers();
      try {
        const recorder = new AudioRecorder();
        recorder._startTime = Date.now();

        expect(recorder.duration).toBe(0);

        vi.advanceTimersByTime(10000); // 10 seconds
        expect(recorder.duration).toBe(10);

        vi.advanceTimersByTime(50000); // +50 seconds = 60 total
        expect(recorder.duration).toBe(60);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should floor fractional seconds', () => {
      vi.useFakeTimers();
      try {
        const recorder = new AudioRecorder();
        recorder._startTime = Date.now();

        vi.advanceTimersByTime(1500); // 1.5 seconds
        expect(recorder.duration).toBe(1);

        vi.advanceTimersByTime(499); // 1.999 seconds
        expect(recorder.duration).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
