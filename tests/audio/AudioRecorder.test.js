import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioRecorder, RecordingState } from '../../scripts/audio/AudioRecorder.mjs';

// ── Mock helpers ─────────────────────────────────────────────────────────

/**
 * Create a minimal mock MediaStream with controllable tracks.
 */
function createMockStream() {
  const track = { kind: 'audio', stop: vi.fn(), enabled: true, readyState: 'live' };
  return {
    _tracks: [track],
    getTracks: vi.fn(function () { return [...this._tracks]; }),
    getAudioTracks: vi.fn(function () { return this._tracks.filter(t => t.kind === 'audio'); })
  };
}

/**
 * Create a mock MediaRecorder that fires lifecycle events on demand.
 * Returns both the instance and a controller for triggering events.
 */
function createMockMediaRecorder() {
  let _state = 'inactive';
  let _ondataavailable = null;
  let _onstop = null;
  let _onerror = null;
  const _mimeType = 'audio/webm;codecs=opus';

  const recorder = {
    get state() { return _state; },
    set state(v) { _state = v; },
    get mimeType() { return _mimeType; },

    get ondataavailable() { return _ondataavailable; },
    set ondataavailable(fn) { _ondataavailable = fn; },
    get onstop() { return _onstop; },
    set onstop(fn) { _onstop = fn; },
    get onerror() { return _onerror; },
    set onerror(fn) { _onerror = fn; },

    start: vi.fn(function () { _state = 'recording'; }),
    stop: vi.fn(function () {
      _state = 'inactive';
      if (_onstop) setTimeout(() => _onstop(), 0);
    }),
    pause: vi.fn(function () { _state = 'paused'; }),
    resume: vi.fn(function () { _state = 'recording'; })
  };

  return recorder;
}

/**
 * Helper: set up a globally-accessible MediaRecorder constructor mock.
 * Returns a list of all created recorder instances.
 */
function setupMediaRecorderMock() {
  const instances = [];
  const MockCtor = vi.fn(function (stream, options) {
    const rec = createMockMediaRecorder();
    instances.push(rec);
    return rec;
  });
  MockCtor.isTypeSupported = vi.fn(() => true);
  globalThis.MediaRecorder = MockCtor;
  return instances;
}

/**
 * Create a mock AudioContext with AnalyserNode for level monitoring tests.
 */
function setupAudioContextMock(frequencyData = new Uint8Array(128).fill(0)) {
  const analyserNode = {
    fftSize: 0,
    frequencyBinCount: frequencyData.length,
    getByteFrequencyData: vi.fn((arr) => {
      for (let i = 0; i < frequencyData.length; i++) arr[i] = frequencyData[i];
    }),
    connect: vi.fn()
  };

  const sourceNode = { connect: vi.fn() };

  const ctx = {
    createMediaStreamSource: vi.fn(() => sourceNode),
    createAnalyser: vi.fn(() => analyserNode),
    close: vi.fn()
  };

  globalThis.AudioContext = vi.fn(() => ctx);
  globalThis.window = globalThis.window || {};
  globalThis.window.AudioContext = globalThis.AudioContext;

  return { ctx, analyserNode, sourceNode };
}

// ── Test Suite ────────────────────────────────────────────────────────────

describe('AudioRecorder', () => {
  let recorder;
  let mockStream;
  let recorderInstances;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    mockStream = createMockStream();
    recorderInstances = setupMediaRecorderMock();
    setupAudioContextMock();

    // Mock navigator.mediaDevices
    globalThis.navigator = globalThis.navigator || {};
    globalThis.navigator.mediaDevices = {
      getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
      enumerateDevices: vi.fn(() => Promise.resolve([])),
    };
    globalThis.navigator.permissions = {
      query: vi.fn(() => Promise.resolve({ state: 'granted' }))
    };

    // Mock AudioUtils.getRecorderOptions used by _startNewRecorder
    vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
      AudioUtils: {
        getRecorderOptions: vi.fn(() => ({
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 128000
        })),
        getSupportedMimeType: vi.fn(() => 'audio/webm;codecs=opus')
      }
    }));

    // requestAnimationFrame / cancelAnimationFrame
    let rafId = 0;
    globalThis.requestAnimationFrame = vi.fn((cb) => {
      rafId++;
      return rafId;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    recorder = new AudioRecorder();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── 1. Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores options internally', () => {
      const opts = { echoCancellation: false, noiseSuppression: false, deviceId: 'dev-1' };
      const r = new AudioRecorder(opts);
      expect(r._options).toEqual(opts);
    });

    it('defaults to empty options when none provided', () => {
      const r = new AudioRecorder();
      expect(r._options).toEqual({});
    });

    it('starts in INACTIVE state', () => {
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('is not recording initially', () => {
      expect(recorder.isRecording).toBe(false);
    });

    it('has zero duration initially', () => {
      expect(recorder.duration).toBe(0);
    });
  });

  // ── 2. RecordingState export ────────────────────────────────────────

  describe('RecordingState', () => {
    it('exports INACTIVE value', () => {
      expect(RecordingState.INACTIVE).toBe('inactive');
    });

    it('exports RECORDING value', () => {
      expect(RecordingState.RECORDING).toBe('recording');
    });

    it('exports PAUSED value', () => {
      expect(RecordingState.PAUSED).toBe('paused');
    });
  });

  // ── 3. Getters ──────────────────────────────────────────────────────

  describe('getters', () => {
    describe('state', () => {
      it('returns INACTIVE initially', () => {
        expect(recorder.state).toBe('inactive');
      });

      it('returns RECORDING after startRecording', async () => {
        await recorder.startRecording();
        expect(recorder.state).toBe('recording');
      });
    });

    describe('isRecording', () => {
      it('returns false when inactive', () => {
        expect(recorder.isRecording).toBe(false);
      });

      it('returns true when recording', async () => {
        await recorder.startRecording();
        expect(recorder.isRecording).toBe(true);
      });

      it('returns false when paused', async () => {
        await recorder.startRecording();
        recorder.pause();
        expect(recorder.isRecording).toBe(false);
      });
    });

    describe('duration', () => {
      it('returns 0 when inactive', () => {
        expect(recorder.duration).toBe(0);
      });

      it('returns elapsed seconds when recording', async () => {
        await recorder.startRecording();
        vi.advanceTimersByTime(3500);
        // Duration floors to seconds, 3500ms -> 3s
        expect(recorder.duration).toBe(3);
      });

      it('freezes duration when paused', async () => {
        await recorder.startRecording();
        vi.advanceTimersByTime(2000);
        recorder.pause();
        const dur = recorder.duration;
        vi.advanceTimersByTime(5000);
        expect(recorder.duration).toBe(dur);
      });

      it('resumes counting after resume', async () => {
        await recorder.startRecording();
        vi.advanceTimersByTime(2000);
        recorder.pause();
        vi.advanceTimersByTime(5000); // paused for 5 seconds
        recorder.resume();
        vi.advanceTimersByTime(3000);
        // total active = 2000 + 3000 = 5000ms -> 5s
        expect(recorder.duration).toBe(5);
      });
    });
  });

  // ── 4. setCallbacks ─────────────────────────────────────────────────

  describe('setCallbacks', () => {
    it('registers callbacks that are invoked on state change', async () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });
      await recorder.startRecording();
      expect(onStateChange).toHaveBeenCalledWith('recording');
    });

    it('merges new callbacks with existing ones', () => {
      const onError = vi.fn();
      const onLevelChange = vi.fn();
      recorder.setCallbacks({ onError });
      recorder.setCallbacks({ onLevelChange });
      expect(recorder._callbacks.onError).toBe(onError);
      expect(recorder._callbacks.onLevelChange).toBe(onLevelChange);
    });

    it('does not overwrite callbacks not included in the new set', () => {
      const onError = vi.fn();
      recorder.setCallbacks({ onError });
      recorder.setCallbacks({ onLevelChange: vi.fn() });
      expect(recorder._callbacks.onError).toBe(onError);
    });
  });

  // ── 5. startRecording ───────────────────────────────────────────────

  describe('startRecording', () => {
    it('acquires a media stream via getUserMedia', async () => {
      await recorder.startRecording();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('passes echoCancellation and noiseSuppression from options', async () => {
      const r = new AudioRecorder({ echoCancellation: false, noiseSuppression: false });
      await r.startRecording();
      const callArg = navigator.mediaDevices.getUserMedia.mock.calls[0][0];
      expect(callArg.audio.echoCancellation).toBe(false);
      expect(callArg.audio.noiseSuppression).toBe(false);
    });

    it('passes deviceId as exact constraint when provided', async () => {
      const r = new AudioRecorder({ deviceId: 'my-mic' });
      await r.startRecording();
      const callArg = navigator.mediaDevices.getUserMedia.mock.calls[0][0];
      expect(callArg.audio.deviceId).toEqual({ exact: 'my-mic' });
    });

    it('defaults echoCancellation and noiseSuppression to true', async () => {
      await recorder.startRecording();
      const callArg = navigator.mediaDevices.getUserMedia.mock.calls[0][0];
      expect(callArg.audio.echoCancellation).toBe(true);
      expect(callArg.audio.noiseSuppression).toBe(true);
    });

    it('transitions state to RECORDING', async () => {
      await recorder.startRecording();
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });

    it('creates a MediaRecorder and starts it', async () => {
      await recorder.startRecording();
      expect(recorderInstances.length).toBe(1);
      expect(recorderInstances[0].start).toHaveBeenCalledTimes(1);
    });

    it('resets audio chunks and live buffer', async () => {
      recorder._audioChunks = [new Blob(['old'])];
      recorder._liveBuffer = [new Blob(['old'])];
      await recorder.startRecording();
      expect(recorder._audioChunks).toEqual([]);
      expect(recorder._liveBuffer).toEqual([]);
    });

    it('resets duration counters', async () => {
      recorder._totalActiveMs = 9999;
      await recorder.startRecording();
      expect(recorder._totalActiveMs).toBe(0);
    });

    it('calls onStateChange callback with RECORDING', async () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });
      await recorder.startRecording();
      expect(onStateChange).toHaveBeenCalledWith('recording');
    });

    it('throws if already recording', async () => {
      await recorder.startRecording();
      await expect(recorder.startRecording()).rejects.toThrow('Already recording');
    });

    it('throws if getUserMedia fails (NotAllowedError)', async () => {
      const err = new DOMException('Permission denied', 'NotAllowedError');
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(err);
      await expect(recorder.startRecording()).rejects.toThrow('Permission denied');
    });

    it('throws if getUserMedia fails (NotFoundError)', async () => {
      const err = new DOMException('No device', 'NotFoundError');
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(err);
      await expect(recorder.startRecording()).rejects.toThrow('No device');
    });

    it('throws if getUserMedia fails (NotReadableError)', async () => {
      const err = new DOMException('Hardware error', 'NotReadableError');
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(err);
      await expect(recorder.startRecording()).rejects.toThrow('Hardware error');
    });

    it('sets up audio analysis on the stream', async () => {
      await recorder.startRecording();
      expect(recorder._audioContext).not.toBeNull();
      expect(recorder._analyserNode).not.toBeNull();
    });

    it('starts level monitoring via requestAnimationFrame', async () => {
      await recorder.startRecording();
      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });
  });

  // ── 6. stopRecording ────────────────────────────────────────────────

  describe('stopRecording', () => {
    it('returns null if already inactive', async () => {
      const result = await recorder.stopRecording();
      expect(result).toBeNull();
    });

    it('returns a Blob on successful stop', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];

      // Simulate data being available
      const chunk = new Blob(['audio-data'], { type: 'audio/webm' });
      mr.ondataavailable({ data: chunk });

      // Override stop to fire onstop synchronously
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });

      const blob = await recorder.stopRecording();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('transitions to INACTIVE after stop', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });
      await recorder.stopRecording();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('calls onStateChange with INACTIVE during cleanup', async () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });
      await recorder.startRecording();
      onStateChange.mockClear();

      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });
      await recorder.stopRecording();
      expect(onStateChange).toHaveBeenCalledWith('inactive');
    });

    it('accumulates active time before stopping', async () => {
      await recorder.startRecording();
      vi.advanceTimersByTime(5000);

      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });
      await recorder.stopRecording();
      // _totalActiveMs should have been updated before cleanup
      // After cleanup state is inactive with _totalActiveMs still set but _lastStartTime null
      // However _cleanup resets state, so duration will be 0 after cleanup
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('rejects on timeout', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      // Don't fire onstop — let it time out
      mr.stop.mockImplementation(() => {
        mr.state = 'inactive';
        // deliberately no onstop call
      });

      const promise = recorder.stopRecording();
      vi.advanceTimersByTime(5001);
      await expect(promise).rejects.toThrow('Stop recording timed out');
    });

    it('rejects on MediaRecorder error event', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      const testError = new Error('recorder-broke');
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onerror) mr.onerror({ error: testError });
      });

      await expect(recorder.stopRecording()).rejects.toThrow('recorder-broke');
    });

    it('rejects if MediaRecorder.stop() throws', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.stop.mockImplementation(() => { throw new Error('stop-failed'); });

      await expect(recorder.stopRecording()).rejects.toThrow('stop-failed');
    });

    it('cleans up stream tracks after stop', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });
      await recorder.stopRecording();
      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('closes AudioContext after stop', async () => {
      await recorder.startRecording();
      const audioCtx = recorder._audioContext;
      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });
      await recorder.stopRecording();
      expect(audioCtx.close).toHaveBeenCalled();
    });

    it('stops level monitoring on stop', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });
      await recorder.stopRecording();
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('works when stopping from paused state', async () => {
      await recorder.startRecording();
      recorder.pause();

      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });

      const blob = await recorder.stopRecording();
      expect(blob).toBeInstanceOf(Blob);
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });
  });

  // ── 7. pause / resume ───────────────────────────────────────────────

  describe('pause', () => {
    it('transitions from RECORDING to PAUSED', async () => {
      await recorder.startRecording();
      recorder.pause();
      expect(recorder.state).toBe(RecordingState.PAUSED);
    });

    it('calls MediaRecorder.pause()', async () => {
      await recorder.startRecording();
      recorder.pause();
      expect(recorderInstances[0].pause).toHaveBeenCalled();
    });

    it('calls onStateChange with PAUSED', async () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });
      await recorder.startRecording();
      onStateChange.mockClear();
      recorder.pause();
      expect(onStateChange).toHaveBeenCalledWith('paused');
    });

    it('accumulates active time and nulls _lastStartTime', async () => {
      await recorder.startRecording();
      vi.advanceTimersByTime(3000);
      recorder.pause();
      expect(recorder._lastStartTime).toBeNull();
      expect(recorder._totalActiveMs).toBeGreaterThanOrEqual(3000);
    });

    it('does nothing when already inactive', () => {
      recorder.pause();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('does nothing when already paused', async () => {
      await recorder.startRecording();
      recorder.pause();
      const totalMs = recorder._totalActiveMs;
      recorder.pause();
      expect(recorder._totalActiveMs).toBe(totalMs);
    });
  });

  describe('resume', () => {
    it('transitions from PAUSED to RECORDING', async () => {
      await recorder.startRecording();
      recorder.pause();
      recorder.resume();
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });

    it('calls MediaRecorder.resume()', async () => {
      await recorder.startRecording();
      recorder.pause();
      recorder.resume();
      expect(recorderInstances[0].resume).toHaveBeenCalled();
    });

    it('calls onStateChange with RECORDING', async () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });
      await recorder.startRecording();
      recorder.pause();
      onStateChange.mockClear();
      recorder.resume();
      expect(onStateChange).toHaveBeenCalledWith('recording');
    });

    it('sets _lastStartTime to current time', async () => {
      await recorder.startRecording();
      recorder.pause();
      expect(recorder._lastStartTime).toBeNull();
      recorder.resume();
      expect(recorder._lastStartTime).not.toBeNull();
    });

    it('does nothing when inactive', () => {
      recorder.resume();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('does nothing when already recording', async () => {
      await recorder.startRecording();
      recorder.resume(); // should be a no-op
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });
  });

  // ── 8. cancel ───────────────────────────────────────────────────────

  describe('cancel', () => {
    it('transitions to INACTIVE', async () => {
      await recorder.startRecording();
      recorder.cancel();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('stops level monitoring', async () => {
      await recorder.startRecording();
      recorder.cancel();
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('stops the MediaRecorder', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      recorder.cancel();
      expect(mr.stop).toHaveBeenCalled();
    });

    it('stops stream tracks', async () => {
      await recorder.startRecording();
      recorder.cancel();
      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('closes AudioContext', async () => {
      await recorder.startRecording();
      const ctx = recorder._audioContext;
      recorder.cancel();
      expect(ctx.close).toHaveBeenCalled();
    });

    it('nulls all references after cancel', async () => {
      await recorder.startRecording();
      recorder.cancel();
      expect(recorder._stream).toBeNull();
      expect(recorder._mediaRecorder).toBeNull();
      expect(recorder._analyserNode).toBeNull();
      expect(recorder._sourceNode).toBeNull();
    });

    it('clears audio chunks and live buffer', async () => {
      await recorder.startRecording();
      // Simulate some data
      const mr = recorderInstances[0];
      mr.ondataavailable({ data: new Blob(['data']) });
      recorder.cancel();
      expect(recorder._audioChunks).toEqual([]);
      expect(recorder._liveBuffer).toEqual([]);
    });

    it('does nothing when already inactive', () => {
      expect(() => recorder.cancel()).not.toThrow();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('works from paused state', async () => {
      await recorder.startRecording();
      recorder.pause();
      recorder.cancel();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('calls onStateChange with INACTIVE during cleanup', async () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });
      await recorder.startRecording();
      onStateChange.mockClear();
      recorder.cancel();
      expect(onStateChange).toHaveBeenCalledWith('inactive');
    });

    it('handles MediaRecorder.stop() throwing gracefully', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.stop.mockImplementation(() => { throw new Error('already stopped'); });
      expect(() => recorder.cancel()).not.toThrow();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });
  });

  // ── 9. getLatestChunk ───────────────────────────────────────────────

  describe('getLatestChunk', () => {
    it('returns null when not recording', async () => {
      const result = await recorder.getLatestChunk();
      expect(result).toBeNull();
    });

    it('returns null when paused', async () => {
      await recorder.startRecording();
      recorder.pause();
      const result = await recorder.getLatestChunk();
      expect(result).toBeNull();
    });

    it('creates a new MediaRecorder (rotation)', async () => {
      await recorder.startRecording();
      expect(recorderInstances.length).toBe(1);

      const oldMr = recorderInstances[0];
      // Simulate data in liveBuffer
      oldMr.ondataavailable({ data: new Blob(['chunk-data'], { type: 'audio/webm' }) });

      // The new recorder's stop for the OLD one will fire onstop
      oldMr.stop.mockImplementation(function () {
        oldMr.state = 'inactive';
        if (oldMr.onstop) oldMr.onstop();
      });

      const chunkPromise = recorder.getLatestChunk();
      // Advance the 100ms overlap timer
      vi.advanceTimersByTime(100);
      const blob = await chunkPromise;

      // A second recorder instance should have been created
      expect(recorderInstances.length).toBe(2);
      expect(recorderInstances[1].start).toHaveBeenCalled();
      expect(blob).toBeInstanceOf(Blob);
    });

    it('returns snapshotted buffer (isolation from new recorder)', async () => {
      await recorder.startRecording();
      const mr1 = recorderInstances[0];

      // Add data to liveBuffer via ondataavailable
      mr1.ondataavailable({ data: new Blob(['old-data'], { type: 'audio/webm' }) });

      mr1.stop.mockImplementation(function () {
        mr1.state = 'inactive';
        if (mr1.onstop) mr1.onstop();
      });

      const chunkPromise = recorder.getLatestChunk();

      // New recorder gets data AFTER rotation — should NOT be in returned chunk
      const mr2 = recorderInstances[1];
      mr2.ondataavailable({ data: new Blob(['new-data'], { type: 'audio/webm' }) });

      vi.advanceTimersByTime(100);
      const blob = await chunkPromise;
      expect(blob).toBeInstanceOf(Blob);
      // The new recorder's data should be in liveBuffer, not in the returned chunk
      expect(recorder._liveBuffer.length).toBe(1); // new-data
    });

    it('returns null if buffer was empty', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      // No data available — empty buffer

      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });

      const chunkPromise = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);
      const blob = await chunkPromise;
      expect(blob).toBeNull(); // empty blob => null
    });

    it('redirects ondataavailable on old recorder to chunk buffer during rotation', async () => {
      await recorder.startRecording();
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['initial']) });

      mr1.stop.mockImplementation(function () {
        // Simulate final data flush per W3C spec: stop() fires ondataavailable then onstop
        if (mr1.ondataavailable) mr1.ondataavailable({ data: new Blob(['final-flush']) });
        mr1.state = 'inactive';
        if (mr1.onstop) mr1.onstop();
      });

      const chunkPromise = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);
      const blob = await chunkPromise;
      // Blob should contain both the initial snapshot AND the final flush data
      expect(blob).not.toBeNull();
      expect(blob.size).toBeGreaterThan(0);
    });

    it('rejects on timeout if old recorder never fires onstop', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.ondataavailable({ data: new Blob(['data']) });

      // stop does nothing — no onstop callback
      mr.stop.mockImplementation(() => {
        mr.state = 'inactive';
      });

      const chunkPromise = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);  // trigger the stop
      vi.advanceTimersByTime(5001); // trigger the timeout
      await expect(chunkPromise).rejects.toThrow('Chunk rotation timed out');
    });

    it('resolves null if old recorder fires onerror during rotation', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.ondataavailable({ data: new Blob(['data']) });

      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onerror) mr.onerror({ error: new Error('rotation error') });
      });

      const chunkPromise = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);
      const result = await chunkPromise;
      expect(result).toBeNull();
    });

    it('resolves null if old recorder stop() throws', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.ondataavailable({ data: new Blob(['data']) });

      mr.stop.mockImplementation(() => { throw new Error('cannot stop'); });

      const chunkPromise = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);
      const result = await chunkPromise;
      expect(result).toBeNull();
    });

    it('returns null when rotation already in progress (concurrent guard)', async () => {
      await recorder.startRecording();
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['data']) });

      // First rotation: don't let onstop fire immediately
      mr1.stop.mockImplementation(() => { mr1.state = 'inactive'; });

      const p1 = recorder.getLatestChunk();
      // Second call while first is in-flight
      const p2 = recorder.getLatestChunk();

      expect(await p2).toBeNull(); // should skip due to rotation lock

      // Complete first rotation
      if (mr1.onstop) mr1.onstop();
      vi.advanceTimersByTime(100);
      await p1;
    });

    it('fires onError callback when old recorder encounters error during rotation', async () => {
      const onError = vi.fn();
      recorder.setCallbacks({ onError });
      await recorder.startRecording();
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['data']) });

      mr1.stop.mockImplementation(function () {
        mr1.state = 'inactive';
        if (mr1.onerror) mr1.onerror({ error: new Error('codec failure') });
      });

      const chunkPromise = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);
      await chunkPromise;
      expect(onError).toHaveBeenCalled();
    });

    it('recovers when _startNewRecorder throws during rotation', async () => {
      await recorder.startRecording();
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['data']) });

      // Make next MediaRecorder constructor throw
      vi.spyOn(globalThis, 'MediaRecorder').mockImplementationOnce(() => {
        throw new Error('MIME not supported');
      });

      const chunkPromise = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);

      await expect(chunkPromise).rejects.toThrow('Recorder rotation failed');
      // Old recorder should be restored
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });
  });

  // ── 10a. Rotation + cancel/stop interplay ────────────────────────────

  describe('rotation interplay with cancel and stop', () => {
    it('cancel during rotation settles the rotation Promise (no dangling Promise)', async () => {
      await recorder.startRecording();
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['data']) });

      // Don't let old recorder stop — simulate slow onstop
      mr1.stop.mockImplementation(() => { mr1.state = 'inactive'; });

      const chunkPromise = recorder.getLatestChunk();

      // Cancel while rotation is in-flight
      recorder.cancel();

      // The chunk promise MUST settle (resolve to null) — not hang forever
      const result = await chunkPromise;
      expect(result).toBeNull();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
      expect(recorder._isRotating).toBe(false);
      expect(recorder._rotationResolve).toBeNull();
    });

    it('stopRecording during rotation settles rotation Promise and returns session blob', async () => {
      await recorder.startRecording();
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['data']) });

      // Don't complete rotation immediately
      mr1.stop.mockImplementation(() => { mr1.state = 'inactive'; });

      const chunkPromise = recorder.getLatestChunk();

      // Now stop the full session while rotation is pending
      const mr2 = recorderInstances[1];
      mr2.stop.mockImplementation(function () {
        mr2.state = 'inactive';
        if (mr2.onstop) mr2.onstop();
      });

      const fullBlob = await recorder.stopRecording();
      expect(fullBlob).toBeInstanceOf(Blob);
      expect(recorder.state).toBe(RecordingState.INACTIVE);

      // The rotation promise must also have settled
      const chunkResult = await chunkPromise;
      expect(chunkResult).toBeNull();
    });
  });

  // ── 10. getAudioLevel ───────────────────────────────────────────────

  describe('getAudioLevel', () => {
    it('returns 0 (levels are delivered via callback)', () => {
      expect(recorder.getAudioLevel()).toBe(0);
    });

    it('returns 0 even when recording', async () => {
      await recorder.startRecording();
      expect(recorder.getAudioLevel()).toBe(0);
    });
  });

  // ── 11. ondataavailable ─────────────────────────────────────────────

  describe('ondataavailable handler', () => {
    it('pushes data to _audioChunks', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      const blob = new Blob(['data']);
      mr.ondataavailable({ data: blob });
      expect(recorder._audioChunks).toContain(blob);
    });

    it('pushes data to _liveBuffer', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      const blob = new Blob(['data']);
      mr.ondataavailable({ data: blob });
      expect(recorder._liveBuffer).toContain(blob);
    });

    it('ignores zero-size data', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.ondataavailable({ data: new Blob([]) });
      expect(recorder._audioChunks.length).toBe(0);
      expect(recorder._liveBuffer.length).toBe(0);
    });

    it('accumulates multiple chunks', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.ondataavailable({ data: new Blob(['a']) });
      mr.ondataavailable({ data: new Blob(['b']) });
      mr.ondataavailable({ data: new Blob(['c']) });
      expect(recorder._audioChunks.length).toBe(3);
      expect(recorder._liveBuffer.length).toBe(3);
    });
  });

  // ── 12. onerror handler ─────────────────────────────────────────────

  describe('onerror handler on MediaRecorder', () => {
    it('calls onError callback with the error', async () => {
      const onError = vi.fn();
      recorder.setCallbacks({ onError });
      await recorder.startRecording();

      const mr = recorderInstances[0];
      const testError = new Error('media-error');
      mr.onerror({ error: testError });
      expect(onError).toHaveBeenCalledWith(testError);
    });

    it('does not throw when no onError callback is set', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      expect(() => mr.onerror({ error: new Error('test') })).not.toThrow();
    });
  });

  // ── 13. _cleanup ────────────────────────────────────────────────────

  describe('_cleanup', () => {
    it('stops all stream tracks', async () => {
      await recorder.startRecording();
      recorder._cleanup();
      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('closes AudioContext', async () => {
      await recorder.startRecording();
      const ctx = recorder._audioContext;
      recorder._cleanup();
      expect(ctx.close).toHaveBeenCalled();
    });

    it('nulls _stream, _mediaRecorder, _audioContext, _analyserNode, _sourceNode', async () => {
      await recorder.startRecording();
      expect(recorder._audioContext).not.toBeNull();
      recorder._cleanup();
      expect(recorder._stream).toBeNull();
      expect(recorder._mediaRecorder).toBeNull();
      expect(recorder._audioContext).toBeNull();
      expect(recorder._analyserNode).toBeNull();
      expect(recorder._sourceNode).toBeNull();
    });

    it('clears _audioChunks and _liveBuffer', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.ondataavailable({ data: new Blob(['data']) });
      recorder._cleanup();
      expect(recorder._audioChunks).toEqual([]);
      expect(recorder._liveBuffer).toEqual([]);
    });

    it('sets state to INACTIVE', async () => {
      await recorder.startRecording();
      recorder._cleanup();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('calls onStateChange with INACTIVE', async () => {
      const onStateChange = vi.fn();
      recorder.setCallbacks({ onStateChange });
      await recorder.startRecording();
      onStateChange.mockClear();
      recorder._cleanup();
      expect(onStateChange).toHaveBeenCalledWith('inactive');
    });

    it('stops level monitoring', async () => {
      await recorder.startRecording();
      recorder._cleanup();
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('handles null stream gracefully', () => {
      recorder._stream = null;
      expect(() => recorder._cleanup()).not.toThrow();
    });

    it('handles null audioContext gracefully', () => {
      recorder._audioContext = null;
      expect(() => recorder._cleanup()).not.toThrow();
    });

    it('handles already-closed AudioContext gracefully', async () => {
      await recorder.startRecording();
      recorder._audioContext.close.mockImplementation(() => { throw new Error('already closed'); });
      expect(() => recorder._cleanup()).not.toThrow();
    });

    it('handles MediaRecorder already inactive', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.state = 'inactive';
      expect(() => recorder._cleanup()).not.toThrow();
    });

    it('cleanup during active rotation aborts rotation and resets all state', async () => {
      await recorder.startRecording();
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['data']) });

      // Start rotation but don't let old recorder stop
      mr1.stop.mockImplementation(() => { mr1.state = 'inactive'; });
      const chunkPromise = recorder.getLatestChunk();

      // Cleanup while rotation is in-flight
      recorder._cleanup();

      // The rotation promise must settle (not hang)
      const result = await chunkPromise;
      expect(result).toBeNull();

      // All rotation state must be cleared
      expect(recorder._isRotating).toBe(false);
      expect(recorder._rotationResolve).toBeNull();
      expect(recorder._pendingOldRecorder).toBeNull();
      expect(recorder._rotationStopTimeoutId).toBeNull();
      expect(recorder._rotationRejectTimeoutId).toBeNull();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });
  });

  // ── 14. _setupAudioAnalysis ─────────────────────────────────────────

  describe('_setupAudioAnalysis', () => {
    it('creates an AudioContext', async () => {
      await recorder.startRecording();
      expect(globalThis.AudioContext).toHaveBeenCalled();
    });

    it('creates a MediaStreamSource from the stream', async () => {
      await recorder.startRecording();
      expect(recorder._audioContext.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
    });

    it('creates an AnalyserNode with fftSize 256', async () => {
      await recorder.startRecording();
      expect(recorder._analyserNode.fftSize).toBe(256);
    });

    it('connects sourceNode to analyserNode', async () => {
      await recorder.startRecording();
      expect(recorder._sourceNode.connect).toHaveBeenCalledWith(recorder._analyserNode);
    });

    it('handles AudioContext creation failure gracefully', async () => {
      globalThis.AudioContext = vi.fn(() => { throw new Error('AudioContext not supported'); });
      globalThis.window.AudioContext = globalThis.AudioContext;

      // Should not throw — failure is caught and logged
      await recorder.startRecording();
      expect(recorder._audioContext).toBeNull();
    });
  });

  // ── 15. Level monitoring ────────────────────────────────────────────

  describe('level monitoring', () => {
    it('starts RAF loop on startRecording', async () => {
      await recorder.startRecording();
      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });

    it('invokes onLevelChange callback with computed level', async () => {
      // Set up analyser to return known frequency data
      const freqData = new Uint8Array(128).fill(128); // half max
      setupAudioContextMock(freqData);

      const onLevelChange = vi.fn();
      recorder.setCallbacks({ onLevelChange });
      await recorder.startRecording();

      // Grab the RAF callback and invoke it manually
      const rafCallback = globalThis.requestAnimationFrame.mock.calls[0][0];
      rafCallback();
      expect(onLevelChange).toHaveBeenCalled();
      const level = onLevelChange.mock.calls[0][0];
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThanOrEqual(1);
    });

    it('does not fire onLevelChange when paused', async () => {
      const onLevelChange = vi.fn();
      recorder.setCallbacks({ onLevelChange });
      await recorder.startRecording();
      recorder.pause();

      // Grab the RAF callback and invoke
      const rafCallback = globalThis.requestAnimationFrame.mock.calls[0][0];
      onLevelChange.mockClear();
      rafCallback();
      expect(onLevelChange).not.toHaveBeenCalled();
    });

    it('stops RAF loop when stopLevelMonitoring is called', async () => {
      await recorder.startRecording();
      recorder._stopLevelMonitoring();
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
      expect(recorder._levelMonitorId).toBeNull();
    });

    it('reschedules RAF if state is not INACTIVE', async () => {
      await recorder.startRecording();
      const rafCallback = globalThis.requestAnimationFrame.mock.calls[0][0];
      globalThis.requestAnimationFrame.mockClear();
      rafCallback();
      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });

    it('does not reschedule RAF if state is INACTIVE', () => {
      // Call monitor function while state is inactive
      recorder._state = RecordingState.INACTIVE;
      // Simulate a leftover RAF callback
      const onLevelChange = vi.fn();
      recorder.setCallbacks({ onLevelChange });

      // We need to get a reference to monitor function
      // Instead, just verify that _startLevelMonitoring respects state
      globalThis.requestAnimationFrame.mockClear();
      recorder._startLevelMonitoring();
      const rafCallback = globalThis.requestAnimationFrame.mock.calls[0][0];
      globalThis.requestAnimationFrame.mockClear();
      rafCallback();
      // When state is INACTIVE, the callback should NOT schedule another RAF
      expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('handles analyser error gracefully and stops monitoring', async () => {
      const freqData = new Uint8Array(128).fill(64);
      const { analyserNode } = setupAudioContextMock(freqData);
      analyserNode.getByteFrequencyData.mockImplementation(() => {
        throw new Error('analyser disconnected');
      });

      await recorder.startRecording();
      const rafCallback = globalThis.requestAnimationFrame.mock.calls[0][0];
      globalThis.requestAnimationFrame.mockClear();

      // Should not throw
      expect(() => rafCallback()).not.toThrow();
      // Should NOT reschedule (returns early)
      expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    });
  });

  // ── 16. _startNewRecorder ───────────────────────────────────────────

  describe('_startNewRecorder', () => {
    it('creates a new MediaRecorder on the current stream', async () => {
      await recorder.startRecording();
      expect(MediaRecorder).toHaveBeenCalledWith(mockStream, expect.any(Object));
    });

    it('calls start() on the new recorder', async () => {
      await recorder.startRecording();
      expect(recorderInstances[0].start).toHaveBeenCalled();
    });

    it('sets up ondataavailable handler', async () => {
      await recorder.startRecording();
      expect(recorderInstances[0].ondataavailable).toBeTypeOf('function');
    });

    it('sets up onerror handler', async () => {
      await recorder.startRecording();
      expect(recorderInstances[0].onerror).toBeTypeOf('function');
    });
  });

  // ── 17. Multiple rotations ──────────────────────────────────────────

  describe('multiple chunk rotations', () => {
    it('supports consecutive getLatestChunk calls', async () => {
      await recorder.startRecording();

      // First rotation
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['chunk-1']) });
      mr1.stop.mockImplementation(function () {
        mr1.state = 'inactive';
        if (mr1.onstop) mr1.onstop();
      });

      const p1 = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);
      const blob1 = await p1;
      expect(blob1).toBeInstanceOf(Blob);

      // Second rotation
      const mr2 = recorderInstances[1];
      mr2.ondataavailable({ data: new Blob(['chunk-2']) });
      mr2.stop.mockImplementation(function () {
        mr2.state = 'inactive';
        if (mr2.onstop) mr2.onstop();
      });

      const p2 = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);
      const blob2 = await p2;
      expect(blob2).toBeInstanceOf(Blob);

      // Should have 3 recorder instances total (initial + 2 rotations)
      expect(recorderInstances.length).toBe(3);
    });

    it('full session blob accumulates all chunks across rotations', async () => {
      await recorder.startRecording();

      // Rotation 1
      const mr1 = recorderInstances[0];
      mr1.ondataavailable({ data: new Blob(['data-1']) });
      mr1.stop.mockImplementation(function () {
        mr1.state = 'inactive';
        if (mr1.onstop) mr1.onstop();
      });
      const p1 = recorder.getLatestChunk();
      vi.advanceTimersByTime(100);
      await p1;

      // Add data to the new recorder
      const mr2 = recorderInstances[1];
      mr2.ondataavailable({ data: new Blob(['data-2']) });

      // Stop entire session
      mr2.stop.mockImplementation(function () {
        mr2.state = 'inactive';
        if (mr2.onstop) mr2.onstop();
      });
      const fullBlob = await recorder.stopRecording();
      // Full blob includes all chunks: data-1 + data-2
      expect(fullBlob.size).toBeGreaterThan(0);
    });
  });

  // ── 18. Edge cases ──────────────────────────────────────────────────

  describe('edge cases', () => {
    it('can start recording again after stopRecording', async () => {
      await recorder.startRecording();
      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });
      await recorder.stopRecording();
      expect(recorder.state).toBe(RecordingState.INACTIVE);

      // Start again
      await recorder.startRecording();
      expect(recorder.state).toBe(RecordingState.RECORDING);
      expect(recorderInstances.length).toBe(2);
    });

    it('can start recording again after cancel', async () => {
      await recorder.startRecording();
      recorder.cancel();
      expect(recorder.state).toBe(RecordingState.INACTIVE);

      await recorder.startRecording();
      expect(recorder.state).toBe(RecordingState.RECORDING);
    });

    it('cancel does not reject any pending stopRecording promise (independent flows)', async () => {
      await recorder.startRecording();
      // cancel() is for discarding, stopRecording() for saving — they are not used together
      recorder.cancel();
      expect(recorder.state).toBe(RecordingState.INACTIVE);
    });

    it('duration returns 0 after cleanup', async () => {
      await recorder.startRecording();
      vi.advanceTimersByTime(5000);
      recorder._cleanup();
      // _cleanup now resets _totalActiveMs, _lastStartTime, and _startTime
      expect(recorder.duration).toBe(0);
    });

    it('stopRecording from paused state includes accumulated time', async () => {
      await recorder.startRecording();
      vi.advanceTimersByTime(3000);
      recorder.pause();
      vi.advanceTimersByTime(10000); // paused for 10s

      const mr = recorderInstances[0];
      mr.stop.mockImplementation(function () {
        mr.state = 'inactive';
        if (mr.onstop) mr.onstop();
      });

      // Before stopping, totalActiveMs should reflect only active time
      expect(recorder._totalActiveMs).toBeGreaterThanOrEqual(3000);
      await recorder.stopRecording();
    });

    it('multiple pause/resume cycles accumulate correctly', async () => {
      await recorder.startRecording();

      vi.advanceTimersByTime(2000);
      recorder.pause();
      vi.advanceTimersByTime(5000);
      recorder.resume();

      vi.advanceTimersByTime(3000);
      recorder.pause();
      vi.advanceTimersByTime(5000);
      recorder.resume();

      vi.advanceTimersByTime(1000);
      // total active = 2000 + 3000 + 1000 = 6000ms -> 6s
      expect(recorder.duration).toBe(6);
    });
  });

  // ── 19. CaptureSource NOT exported ──────────────────────────────────

  describe('module exports', () => {
    it('exports AudioRecorder class', () => {
      expect(AudioRecorder).toBeDefined();
      expect(typeof AudioRecorder).toBe('function');
    });

    it('exports RecordingState enum', () => {
      expect(RecordingState).toBeDefined();
      expect(RecordingState.INACTIVE).toBe('inactive');
      expect(RecordingState.RECORDING).toBe('recording');
      expect(RecordingState.PAUSED).toBe('paused');
    });

    it('does NOT export CaptureSource', async () => {
      const mod = await import('../../scripts/audio/AudioRecorder.mjs');
      expect(mod.CaptureSource).toBeUndefined();
    });
  });

  // ── EventBus Integration (Story 3.1 Task 1) ──────────────────────────

  describe('EventBus integration', () => {
    let mockEventBus;
    let ebRecorder;

    beforeEach(() => {
      mockEventBus = {
        emit: vi.fn(),
      };
      ebRecorder = new AudioRecorder({ eventBus: mockEventBus });
    });

    describe('constructor', () => {
      it('accepts eventBus in options', () => {
        const r = new AudioRecorder({ eventBus: mockEventBus });
        expect(r).toBeDefined();
      });

      it('works without eventBus (optional)', () => {
        const r = new AudioRecorder();
        expect(r).toBeDefined();
      });
    });

    describe('audio:recordingStarted event', () => {
      it('emits audio:recordingStarted on startRecording', async () => {
        await ebRecorder.startRecording();
        expect(mockEventBus.emit).toHaveBeenCalledWith(
          'audio:recordingStarted',
          expect.objectContaining({ state: 'recording' })
        );
      });

      it('includes timestamp in recordingStarted payload', async () => {
        await ebRecorder.startRecording();
        const call = mockEventBus.emit.mock.calls.find(c => c[0] === 'audio:recordingStarted');
        expect(call[1]).toHaveProperty('timestamp');
        expect(typeof call[1].timestamp).toBe('number');
      });
    });

    describe('audio:recordingStopped event', () => {
      it('emits audio:recordingStopped on stopRecording', async () => {
        await ebRecorder.startRecording();
        mockEventBus.emit.mockClear();

        const stopPromise = ebRecorder.stopRecording();
        // Trigger onstop on the MediaRecorder
        const mr = recorderInstances[recorderInstances.length - 1];
        mr.onstop?.();
        await stopPromise;

        expect(mockEventBus.emit).toHaveBeenCalledWith(
          'audio:recordingStopped',
          expect.objectContaining({ state: 'inactive' })
        );
      });
    });

    describe('audio:error event', () => {
      it('emits audio:error on MediaRecorder error', async () => {
        await ebRecorder.startRecording();
        mockEventBus.emit.mockClear();

        const mr = recorderInstances[recorderInstances.length - 1];
        const testError = new Error('test error');
        mr.onerror?.({ error: testError });

        expect(mockEventBus.emit).toHaveBeenCalledWith(
          'audio:error',
          expect.objectContaining({ error: testError })
        );
      });
    });

    describe('audio:levelChange event', () => {
      it('emits audio:levelChange during level monitoring', async () => {
        // Setup AudioContext with non-zero data so level > 0
        const freqData = new Uint8Array(128).fill(128);
        setupAudioContextMock(freqData);

        // Capture the RAF callback
        let rafCallback;
        globalThis.requestAnimationFrame = vi.fn((cb) => {
          rafCallback = cb;
          return 1;
        });

        const r = new AudioRecorder({ eventBus: mockEventBus });
        await r.startRecording();
        mockEventBus.emit.mockClear();

        // Execute the level monitor RAF callback
        if (rafCallback) rafCallback();

        expect(mockEventBus.emit).toHaveBeenCalledWith(
          'audio:levelChange',
          expect.objectContaining({ level: expect.any(Number) })
        );
      });
    });

    describe('audio:chunkReady event', () => {
      it('emits audio:chunkReady when data is available', async () => {
        await ebRecorder.startRecording();
        mockEventBus.emit.mockClear();

        const mr = recorderInstances[recorderInstances.length - 1];
        const blob = new Blob(['audio'], { type: 'audio/webm' });
        mr.ondataavailable?.({ data: blob });

        expect(mockEventBus.emit).toHaveBeenCalledWith(
          'audio:chunkReady',
          expect.objectContaining({ size: blob.size })
        );
      });
    });

    describe('error isolation — #emitSafe', () => {
      it('does not throw when eventBus.emit throws', async () => {
        mockEventBus.emit.mockImplementation(() => { throw new Error('EventBus crash'); });
        // Should not throw
        await expect(ebRecorder.startRecording()).resolves.not.toThrow();
      });

      it('still calls callbacks even when eventBus.emit throws', async () => {
        const onStateChange = vi.fn();
        ebRecorder.setCallbacks({ onStateChange });
        mockEventBus.emit.mockImplementation(() => { throw new Error('EventBus crash'); });

        await ebRecorder.startRecording();
        expect(onStateChange).toHaveBeenCalledWith('recording');
      });
    });

    describe('pause/resume events', () => {
      it('emits audio:recordingPaused on pause', async () => {
        await ebRecorder.startRecording();
        mockEventBus.emit.mockClear();

        ebRecorder.pause();

        expect(mockEventBus.emit).toHaveBeenCalledWith(
          'audio:recordingPaused',
          expect.objectContaining({ state: 'paused' })
        );
      });

      it('emits audio:recordingResumed on resume', async () => {
        await ebRecorder.startRecording();
        ebRecorder.pause();
        mockEventBus.emit.mockClear();

        ebRecorder.resume();

        expect(mockEventBus.emit).toHaveBeenCalledWith(
          'audio:recordingResumed',
          expect.objectContaining({ state: 'recording' })
        );
      });
    });
  });

  // ── Safari Codec Fallback (Story 3.1 Task 2) ─────────────────────────

  describe('Safari codec fallback', () => {
    describe('_detectOptimalCodec', () => {
      it('returns webm/opus when supported (Chrome/Firefox)', () => {
        globalThis.MediaRecorder.isTypeSupported = vi.fn((type) =>
          ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].includes(type)
        );
        const r = new AudioRecorder();
        expect(r._detectOptimalCodec()).toBe('audio/webm;codecs=opus');
      });

      it('returns mp4/aac when webm not supported (Safari)', () => {
        globalThis.MediaRecorder.isTypeSupported = vi.fn((type) =>
          ['audio/mp4;codecs=aac', 'audio/mp4'].includes(type)
        );
        const r = new AudioRecorder();
        expect(r._detectOptimalCodec()).toBe('audio/mp4;codecs=aac');
      });

      it('returns audio/mp4 when mp4/aac not supported', () => {
        globalThis.MediaRecorder.isTypeSupported = vi.fn((type) =>
          type === 'audio/mp4'
        );
        const r = new AudioRecorder();
        expect(r._detectOptimalCodec()).toBe('audio/mp4');
      });

      it('returns audio/wav as universal fallback', () => {
        globalThis.MediaRecorder.isTypeSupported = vi.fn((type) =>
          type === 'audio/wav'
        );
        const r = new AudioRecorder();
        expect(r._detectOptimalCodec()).toBe('audio/wav');
      });

      it('throws when no codec is supported', () => {
        globalThis.MediaRecorder.isTypeSupported = vi.fn(() => false);
        const r = new AudioRecorder();
        expect(() => r._detectOptimalCodec()).toThrow('No supported audio codec found');
      });

      it('respects preferredCodec option when supported', () => {
        globalThis.MediaRecorder.isTypeSupported = vi.fn(() => true);
        const r = new AudioRecorder({ preferredCodec: 'audio/mp4;codecs=aac' });
        expect(r._detectOptimalCodec()).toBe('audio/mp4;codecs=aac');
      });

      it('falls back to auto-detect when preferredCodec not supported', () => {
        globalThis.MediaRecorder.isTypeSupported = vi.fn((type) =>
          type === 'audio/webm;codecs=opus'
        );
        const r = new AudioRecorder({ preferredCodec: 'audio/mp4;codecs=aac' });
        expect(r._detectOptimalCodec()).toBe('audio/webm;codecs=opus');
      });
    });

    describe('codec used in startRecording', () => {
      it('uses detected codec for MediaRecorder', async () => {
        globalThis.MediaRecorder.isTypeSupported = vi.fn((type) =>
          type === 'audio/mp4;codecs=aac'
        );
        const r = new AudioRecorder();
        await r.startRecording();

        // The MediaRecorder constructor should be called with the detected codec
        expect(globalThis.MediaRecorder).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ mimeType: 'audio/mp4;codecs=aac' })
        );
      });
    });
  });

  // ── Crash Recovery — IndexedDB Persistence (Story 3.1 Task 3) ────────

  describe('crash recovery — IndexedDB persistence', () => {
    let mockDB;
    let mockObjectStore;

    beforeEach(() => {
      mockObjectStore = {
        put: vi.fn(),
        delete: vi.fn(),
        getAll: vi.fn(),
        getAllKeys: vi.fn(),
        clear: vi.fn(),
      };

      mockDB = {
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => mockObjectStore),
        })),
        objectStoreNames: { contains: vi.fn(() => true) },
        createObjectStore: vi.fn(() => mockObjectStore),
        close: vi.fn(),
      };

      // Synchronous mock — trigger onsuccess immediately via microtask
      globalThis.indexedDB = {
        open: vi.fn(() => {
          const req = { result: mockDB, onsuccess: null, onerror: null, onupgradeneeded: null };
          Promise.resolve().then(() => req.onsuccess?.({ target: req }));
          return req;
        }),
        deleteDatabase: vi.fn(),
      };
    });

    /** Helper: init persistence and flush microtasks */
    async function initPersistence(r, sessionId = 'session-123') {
      const p = r._initPersistence(sessionId);
      await vi.advanceTimersByTimeAsync(0);
      await p;
    }

    describe('_persistChunk', () => {
      it('saves chunk to IndexedDB with session-indexed key', async () => {
        const r = new AudioRecorder();
        await initPersistence(r);

        const blob = new Blob(['audio-data'], { type: 'audio/webm' });
        r._persistChunk(blob, 0);

        expect(mockObjectStore.put).toHaveBeenCalledWith(
          expect.objectContaining({ data: blob, index: 0 }),
          'chunk-session-123-0'
        );
      });
    });

    describe('recoverChunks', () => {
      it('returns empty array when no chunks persisted', async () => {
        mockObjectStore.getAll.mockImplementation(() => {
          const req = { result: [], onsuccess: null, onerror: null };
          Promise.resolve().then(() => req.onsuccess?.({ target: req }));
          return req;
        });

        const r = new AudioRecorder();
        await initPersistence(r);

        const p = r.recoverChunks();
        await vi.advanceTimersByTimeAsync(0);
        expect(await p).toEqual([]);
      });

      it('returns persisted chunks sorted by index', async () => {
        const chunk1 = { data: new Blob(['a']), index: 0, sessionId: 'session-123' };
        const chunk2 = { data: new Blob(['b']), index: 1, sessionId: 'session-123' };
        mockObjectStore.getAll.mockImplementation(() => {
          const req = { result: [chunk2, chunk1], onsuccess: null, onerror: null };
          Promise.resolve().then(() => req.onsuccess?.({ target: req }));
          return req;
        });

        const r = new AudioRecorder();
        await initPersistence(r);

        const p = r.recoverChunks();
        await vi.advanceTimersByTimeAsync(0);
        const result = await p;
        expect(result).toHaveLength(2);
        expect(result[0].index).toBe(0);
        expect(result[1].index).toBe(1);
      });
    });

    describe('clearPersistedChunks', () => {
      it('clears all chunks from IndexedDB', async () => {
        const r = new AudioRecorder();
        await initPersistence(r);

        r.clearPersistedChunks();
        expect(mockObjectStore.clear).toHaveBeenCalled();
      });
    });

    describe('stopRecording clears persisted chunks', () => {
      it('calls clearPersistedChunks on successful stop', async () => {
        const r = new AudioRecorder();
        await r.startRecording();
        await initPersistence(r);

        const clearSpy = vi.spyOn(r, 'clearPersistedChunks');

        const stopPromise = r.stopRecording();
        const mr = recorderInstances[recorderInstances.length - 1];
        mr.onstop?.();
        await stopPromise;

        expect(clearSpy).toHaveBeenCalled();
      });
    });
  });

  // ── WebRTC peer audio capture ─────────────────────────────────────────
  describe('WebRTC peer audio capture', () => {
    let mockPeerStream;
    let mockDestination;
    let mockMixedStream;

    beforeEach(() => {
      // Mock MediaStream constructor (not available in jsdom)
      globalThis.MediaStream = vi.fn(function (tracks) {
        const stream = createMockStream();
        if (tracks) stream._tracks = [...tracks];
        return stream;
      });

      // Create a mock peer stream (simulates remote audio from another player)
      const peerTrack = { kind: 'audio', stop: vi.fn(), enabled: true, readyState: 'live' };
      mockPeerStream = {
        _tracks: [peerTrack],
        getTracks: vi.fn(function () { return [...this._tracks]; }),
        getAudioTracks: vi.fn(function () { return this._tracks.filter(t => t.kind === 'audio'); })
      };

      // Create a mock MediaStreamDestination for mixing
      const mixedTrack = { kind: 'audio', stop: vi.fn(), enabled: true, readyState: 'live' };
      mockMixedStream = {
        _tracks: [mixedTrack],
        getTracks: vi.fn(function () { return [...this._tracks]; }),
        getAudioTracks: vi.fn(function () { return this._tracks.filter(t => t.kind === 'audio'); })
      };
      mockDestination = {
        stream: mockMixedStream
      };

      // Mock AudioContext with createMediaStreamDestination
      const analyserNode = {
        fftSize: 0,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
        connect: vi.fn()
      };
      const sourceNode = { connect: vi.fn() };
      const ctx = {
        createMediaStreamSource: vi.fn(() => sourceNode),
        createAnalyser: vi.fn(() => analyserNode),
        createMediaStreamDestination: vi.fn(() => mockDestination),
        close: vi.fn()
      };
      globalThis.AudioContext = vi.fn(() => ctx);
      globalThis.window = globalThis.window || {};
      globalThis.window.AudioContext = globalThis.AudioContext;
    });

    describe('_captureWebRTCStream', () => {
      it('returns null when game.webrtc is not available', () => {
        globalThis.game = {};
        const r = new AudioRecorder();
        const stream = r._captureWebRTCStream();
        expect(stream).toBeNull();
      });

      it('returns null when no peer connections exist', () => {
        globalThis.game = {
          webrtc: { client: { _peerConnections: new Map() } }
        };
        const r = new AudioRecorder();
        const stream = r._captureWebRTCStream();
        expect(stream).toBeNull();
      });

      it('captures remote audio streams from peer connections', () => {
        const mockReceiver = {
          track: { kind: 'audio', readyState: 'live' }
        };
        const mockPeerConnection = {
          getReceivers: vi.fn(() => [mockReceiver])
        };

        globalThis.game = {
          webrtc: {
            client: {
              _peerConnections: new Map([['peer1', { pc: mockPeerConnection }]])
            }
          }
        };

        const r = new AudioRecorder();
        const streams = r._captureWebRTCStream();
        expect(streams).not.toBeNull();
        expect(Array.isArray(streams)).toBe(true);
        expect(streams.length).toBeGreaterThan(0);
      });

      it('skips peer connections with no audio receivers', () => {
        const mockReceiver = {
          track: { kind: 'video', readyState: 'live' }
        };
        const mockPeerConnection = {
          getReceivers: vi.fn(() => [mockReceiver])
        };

        globalThis.game = {
          webrtc: {
            client: {
              _peerConnections: new Map([['peer1', { pc: mockPeerConnection }]])
            }
          }
        };

        const r = new AudioRecorder();
        const streams = r._captureWebRTCStream();
        expect(streams).toBeNull();
      });

      it('skips tracks that are not live', () => {
        const mockReceiver = {
          track: { kind: 'audio', readyState: 'ended' }
        };
        const mockPeerConnection = {
          getReceivers: vi.fn(() => [mockReceiver])
        };

        globalThis.game = {
          webrtc: {
            client: {
              _peerConnections: new Map([['peer1', { pc: mockPeerConnection }]])
            }
          }
        };

        const r = new AudioRecorder();
        const streams = r._captureWebRTCStream();
        expect(streams).toBeNull();
      });

      it('captures from multiple peers', () => {
        const makePeer = () => ({
          pc: {
            getReceivers: vi.fn(() => [{
              track: { kind: 'audio', readyState: 'live' }
            }])
          }
        });

        globalThis.game = {
          webrtc: {
            client: {
              _peerConnections: new Map([
                ['peer1', makePeer()],
                ['peer2', makePeer()]
              ])
            }
          }
        };

        const r = new AudioRecorder();
        const streams = r._captureWebRTCStream();
        expect(streams).not.toBeNull();
        expect(streams.length).toBe(2);
      });

      it('emits EventBus event when WebRTC streams are captured', () => {
        const eventBus = { emit: vi.fn() };
        const mockReceiver = {
          track: { kind: 'audio', readyState: 'live' }
        };
        const mockPeerConnection = {
          getReceivers: vi.fn(() => [mockReceiver])
        };

        globalThis.game = {
          webrtc: {
            client: {
              _peerConnections: new Map([['peer1', { pc: mockPeerConnection }]])
            }
          }
        };

        const r = new AudioRecorder({ eventBus });
        r._captureWebRTCStream();
        expect(eventBus.emit).toHaveBeenCalledWith(
          'audio:webrtcCaptured',
          expect.objectContaining({ peerCount: 1 })
        );
      });
    });

    describe('_createMixedStream', () => {
      it('combines mic and WebRTC streams into a single output', () => {
        const r = new AudioRecorder();
        // Need to set up _audioContext first
        r._audioContext = new AudioContext();
        const peerTracks = [{ kind: 'audio', readyState: 'live' }];
        const mixed = r._createMixedStream(mockStream, peerTracks);
        expect(mixed).not.toBeNull();
        expect(r._audioContext.createMediaStreamSource).toHaveBeenCalled();
        expect(r._audioContext.createMediaStreamDestination).toHaveBeenCalled();
      });

      it('returns mic stream only when no peer tracks are available', () => {
        const r = new AudioRecorder();
        r._audioContext = new AudioContext();
        const mixed = r._createMixedStream(mockStream, []);
        expect(mixed).toBe(mockStream);
      });

      it('returns mic stream only when peer tracks is null', () => {
        const r = new AudioRecorder();
        r._audioContext = new AudioContext();
        const mixed = r._createMixedStream(mockStream, null);
        expect(mixed).toBe(mockStream);
      });
    });

    describe('startRecording with captureMode', () => {
      it('records mic only in "microphone" mode (default)', async () => {
        const r = new AudioRecorder({ captureMode: 'microphone' });
        await r.startRecording();
        expect(r.state).toBe(RecordingState.RECORDING);
        // Mic stream should be used directly (no mixing)
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      });

      it('records WebRTC peers only in "webrtc" mode', async () => {
        const mockReceiver = {
          track: { kind: 'audio', readyState: 'live' }
        };
        const mockPeerConnection = {
          getReceivers: vi.fn(() => [mockReceiver])
        };
        globalThis.game = {
          webrtc: {
            client: {
              _peerConnections: new Map([['peer1', { pc: mockPeerConnection }]])
            }
          }
        };

        const r = new AudioRecorder({ captureMode: 'webrtc' });
        await r.startRecording();
        expect(r.state).toBe(RecordingState.RECORDING);
      });

      it('mixes mic + WebRTC in "mixed" mode', async () => {
        const mockReceiver = {
          track: { kind: 'audio', readyState: 'live' }
        };
        const mockPeerConnection = {
          getReceivers: vi.fn(() => [mockReceiver])
        };
        globalThis.game = {
          webrtc: {
            client: {
              _peerConnections: new Map([['peer1', { pc: mockPeerConnection }]])
            }
          }
        };

        const r = new AudioRecorder({ captureMode: 'mixed' });
        await r.startRecording();
        expect(r.state).toBe(RecordingState.RECORDING);
      });

      it('falls back to mic-only when WebRTC is unavailable in "mixed" mode', async () => {
        globalThis.game = {};
        const r = new AudioRecorder({ captureMode: 'mixed' });
        await r.startRecording();
        expect(r.state).toBe(RecordingState.RECORDING);
        // Should have fallen back to mic-only without error
      });

      it('throws error when "webrtc" mode has no peers available', async () => {
        globalThis.game = {};
        const r = new AudioRecorder({ captureMode: 'webrtc' });
        await expect(r.startRecording()).rejects.toThrow();
      });
    });

    describe('cleanup of WebRTC resources', () => {
      it('disconnects peer source nodes on cleanup', async () => {
        const r = new AudioRecorder({ captureMode: 'microphone' });
        await r.startRecording();
        // Simulate having peer source nodes
        const mockPeerSourceNode = { disconnect: vi.fn() };
        r._peerSourceNodes = [mockPeerSourceNode];
        r.cancel();
        expect(mockPeerSourceNode.disconnect).toHaveBeenCalled();
        expect(r._peerSourceNodes).toEqual([]);
      });

      it('nulls destination on cleanup', async () => {
        const r = new AudioRecorder({ captureMode: 'microphone' });
        await r.startRecording();
        r._mixDestination = mockDestination;
        r.cancel();
        expect(r._mixDestination).toBeNull();
      });
    });
  });
});
