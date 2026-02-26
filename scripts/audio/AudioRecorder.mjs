/**
 * AudioRecorder - Robust Gapless Audio Capture for VoxChronicle
 *
 * Uses a single-recorder rotation strategy: when a chunk is requested via
 * {@link getLatestChunk}, a new MediaRecorder is started on the same stream
 * BEFORE the old one is stopped, ensuring zero gaps in audio capture while
 * producing valid standalone WebM files for the OpenAI transcription API.
 *
 * Lifecycle: INACTIVE -> startRecording() -> RECORDING <-> pause()/resume()
 *            RECORDING/PAUSED -> stopRecording() -> INACTIVE (returns blob)
 *            RECORDING/PAUSED -> cancel() -> INACTIVE (discards data)
 *
 * @class AudioRecorder
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { AudioUtils } from '../utils/AudioUtils.mjs';

/**
 * Possible recording states.
 * @enum {string}
 */
const RecordingState = {
  INACTIVE: 'inactive',
  RECORDING: 'recording',
  PAUSED: 'paused'
};

/**
 * Valid audio capture sources (used for settings, not exported).
 * @enum {string}
 */
const CaptureSource = {
  MICROPHONE: 'microphone',
  FOUNDRY_WEBRTC: 'foundry-webrtc',
  SYSTEM_AUDIO: 'system-audio'
};

class AudioRecorder {
  _logger = Logger.createChild('AudioRecorder');

  _mediaRecorder = null;
  _stream = null;
  _state = RecordingState.INACTIVE;

  _audioChunks = []; // Full session storage (all chunks across rotations)
  _liveBuffer = [];  // Current active recorder's buffer (reset on rotation)

  _totalActiveMs = 0;
  _lastStartTime = null;
  _startTime = null;

  /** @type {{ onDataAvailable: Function|null, onError: Function|null, onStateChange: Function|null, onLevelChange: Function|null }} */
  _callbacks = {
    onDataAvailable: null,
    onError: null,
    onStateChange: null,
    onLevelChange: null
  };

  // Audio analysis nodes
  _audioContext = null;
  _analyserNode = null;
  _sourceNode = null;
  _levelMonitorId = null;

  /** @type {object} */
  _options = {};

  /**
   * Create an AudioRecorder instance.
   * @param {object} [options={}] - Configuration options.
   * @param {boolean} [options.echoCancellation=true] - Enable echo cancellation.
   * @param {boolean} [options.noiseSuppression=true] - Enable noise suppression.
   * @param {string} [options.deviceId] - Specific audio input device ID.
   */
  constructor(options = {}) {
    this._options = options;
    this._logger.debug('AudioRecorder initialized');
  }

  /**
   * Current recording state.
   * @returns {string} One of RecordingState values.
   */
  get state() { return this._state; }

  /**
   * Whether the recorder is actively recording.
   * @returns {boolean}
   */
  get isRecording() { return this._state === RecordingState.RECORDING; }

  /**
   * Total active recording duration in seconds (excludes paused time).
   * @returns {number}
   */
  get duration() {
    if (!this._lastStartTime && this._totalActiveMs === 0) return 0;
    const current = (this._state === RecordingState.RECORDING && this._lastStartTime)
      ? (Date.now() - this._lastStartTime)
      : 0;
    return Math.floor((this._totalActiveMs + current) / 1000);
  }

  /**
   * Register callback functions for recorder events.
   * @param {object} callbacks - Callback map (onDataAvailable, onError, onStateChange, onLevelChange).
   */
  setCallbacks(callbacks) { this._callbacks = { ...this._callbacks, ...callbacks }; }

  /**
   * Start recording audio from the user's microphone.
   * @param {object} [options={}] - Per-call options (currently unused, reserved for future use).
   * @returns {Promise<void>}
   * @throws {Error} If already recording or if microphone access is denied.
   */
  async startRecording(options = {}) {
    if (this._state !== RecordingState.INACTIVE) throw new Error('Already recording');

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this._options.echoCancellation ?? true,
          noiseSuppression: this._options.noiseSuppression ?? true,
          autoGainControl: true,
          ...(this._options.deviceId ? { deviceId: { exact: this._options.deviceId } } : {})
        }
      });

      this._setupAudioAnalysis(this._stream);
      this._startLevelMonitoring();

      this._audioChunks = [];
      this._liveBuffer = [];
      this._totalActiveMs = 0;
      this._lastStartTime = Date.now();
      this._startTime = this._lastStartTime;

      this._startNewRecorder();
      this._state = RecordingState.RECORDING;
      this._callbacks.onStateChange?.(this._state);
    } catch (error) {
      this._logger.error('Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Create and start a new MediaRecorder on the current stream.
   * Wires up ondataavailable and onerror handlers.
   * @private
   */
  _startNewRecorder() {
    const options = AudioUtils.getRecorderOptions();
    const recorder = new MediaRecorder(this._stream, options);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this._audioChunks.push(e.data);
        this._liveBuffer.push(e.data);
      }
    };

    recorder.onerror = (event) => {
      this._logger.error('MediaRecorder error:', event.error);
      this._callbacks.onError?.(event.error);
    };

    recorder.start();
    this._mediaRecorder = recorder;
  }

  /**
   * Rotate the recorder and return the audio captured so far as a standalone blob.
   *
   * A new recorder is started on the same stream, then the old recorder is
   * stopped after a brief overlap (~100ms) to ensure gapless capture.
   * The live buffer is snapshotted before rotation to prevent cross-contamination.
   *
   * @returns {Promise<Blob|null>} A valid WebM blob, or null if not recording or empty.
   */
  async getLatestChunk() {
    if (this._state !== RecordingState.RECORDING) return null;

    return new Promise((resolve, reject) => {
      const oldRecorder = this._mediaRecorder;
      const chunkBuffer = this._liveBuffer; // snapshot current buffer
      this._liveBuffer = []; // new recorder gets a fresh buffer

      oldRecorder.ondataavailable = null; // prevent cross-contamination

      this._startNewRecorder();

      const timeout = setTimeout(() => {
        reject(new Error('Chunk rotation timed out'));
      }, 5000);

      oldRecorder.onstop = () => {
        clearTimeout(timeout);
        const blob = new Blob(chunkBuffer, { type: oldRecorder.mimeType });
        resolve(blob.size > 0 ? blob : null);
      };

      oldRecorder.onerror = (event) => {
        clearTimeout(timeout);
        this._logger.error('Old recorder error during rotation:', event.error);
        resolve(null);
      };

      setTimeout(() => {
        try {
          oldRecorder.stop();
        } catch (e) {
          clearTimeout(timeout);
          this._logger.warn('Failed to stop old recorder:', e.message);
          resolve(null);
        }
      }, 100);
    });
  }

  /**
   * Stop recording and return the full session audio as a single blob.
   *
   * @returns {Promise<Blob|null>} The complete session audio blob, or null if inactive.
   * @throws {Error} If the MediaRecorder fails to stop or times out.
   */
  async stopRecording() {
    if (this._state === RecordingState.INACTIVE) return null;

    this._stopLevelMonitoring();
    if (this._lastStartTime) this._totalActiveMs += (Date.now() - this._lastStartTime);

    const mimeType = this._mediaRecorder?.mimeType; // capture before cleanup

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._cleanup();
        reject(new Error('Stop recording timed out'));
      }, 5000);

      this._mediaRecorder.onstop = () => {
        clearTimeout(timeout);
        const fullBlob = new Blob(this._audioChunks, { type: mimeType });
        this._cleanup();
        resolve(fullBlob);
      };

      this._mediaRecorder.onerror = (event) => {
        clearTimeout(timeout);
        this._cleanup();
        reject(event.error || new Error('MediaRecorder error during stop'));
      };

      try {
        this._mediaRecorder.stop();
      } catch (e) {
        clearTimeout(timeout);
        this._cleanup();
        reject(e);
      }
    });
  }

  /**
   * Pause the current recording. Duration tracking is suspended until resume().
   */
  pause() {
    if (this._state !== RecordingState.RECORDING) return;
    this._totalActiveMs += (Date.now() - this._lastStartTime);
    this._lastStartTime = null;
    this._mediaRecorder.pause();
    this._state = RecordingState.PAUSED;
    this._callbacks.onStateChange?.(this._state);
  }

  /**
   * Resume a paused recording. Duration tracking resumes.
   */
  resume() {
    if (this._state !== RecordingState.PAUSED) return;
    this._lastStartTime = Date.now();
    this._mediaRecorder.resume();
    this._state = RecordingState.RECORDING;
    this._callbacks.onStateChange?.(this._state);
  }

  /**
   * Cancel the recording, discarding all captured audio.
   * Stops the recorder and cleans up without returning a blob.
   * Called by VoxChronicle.destroy() and SessionOrchestrator error paths.
   */
  cancel() {
    if (this._state === RecordingState.INACTIVE) return;
    this._stopLevelMonitoring();
    try { this._mediaRecorder?.stop(); } catch (_) { /* already stopped */ }
    this._cleanup();
  }

  /**
   * Release all resources: stop stream tracks, close AudioContext,
   * null out references, and transition to INACTIVE.
   * @private
   */
  _cleanup() {
    this._stopLevelMonitoring();

    if (this._mediaRecorder?.state !== 'inactive') {
      try { this._mediaRecorder.stop(); } catch (_) { /* already stopped */ }
    }

    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    if (this._audioContext) {
      try { this._audioContext.close(); } catch (_) { /* can throw if already closed */ }
    }

    this._stream = null;
    this._mediaRecorder = null;
    this._analyserNode = null;
    this._sourceNode = null;
    this._audioChunks = [];
    this._liveBuffer = [];
    this._state = RecordingState.INACTIVE;
    this._callbacks.onStateChange?.(this._state);
  }

  /**
   * Set up Web Audio API nodes for real-time audio level analysis.
   * @param {MediaStream} stream - The audio stream to analyse.
   * @private
   */
  _setupAudioAnalysis(stream) {
    try {
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this._sourceNode = this._audioContext.createMediaStreamSource(stream);
      this._analyserNode = this._audioContext.createAnalyser();
      this._analyserNode.fftSize = 256;
      this._sourceNode.connect(this._analyserNode);
    } catch (e) { this._logger.warn('Audio analysis setup failed:', e); }
  }

  /**
   * Start the requestAnimationFrame loop that reads audio levels
   * and fires the onLevelChange callback.
   * @private
   */
  _startLevelMonitoring() {
    const monitor = () => {
      if (this._state === RecordingState.RECORDING && this._analyserNode) {
        try {
          const data = new Uint8Array(this._analyserNode.frequencyBinCount);
          this._analyserNode.getByteFrequencyData(data);
          const sum = data.reduce((a, b) => a + b, 0);
          this._callbacks.onLevelChange?.(Math.min(1, sum / (data.length * 128)));
        } catch (e) {
          this._logger.warn('Level monitoring error:', e.message);
          this._stopLevelMonitoring();
          return; // Don't reschedule
        }
      }
      if (this._state !== RecordingState.INACTIVE) {
        this._levelMonitorId = requestAnimationFrame(monitor);
      }
    };
    this._levelMonitorId = requestAnimationFrame(monitor);
  }

  /**
   * Stop the audio level monitoring RAF loop.
   * @private
   */
  _stopLevelMonitoring() {
    if (this._levelMonitorId) {
      cancelAnimationFrame(this._levelMonitorId);
      this._levelMonitorId = null;
    }
  }

  /**
   * Get the current audio input level. Returns 0 because real-time levels
   * are delivered via the onLevelChange callback instead.
   * @returns {number} Always 0.
   */
  getAudioLevel() {
    return 0; // Handled via callback for real-time
  }
}

export { AudioRecorder, RecordingState };
