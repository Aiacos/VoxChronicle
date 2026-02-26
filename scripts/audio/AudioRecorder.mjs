/**
 * AudioRecorder - Robust Gapless Audio Capture for VoxChronicle
 *
 * Uses an alternating dual-recorder strategy to ensure 100% valid WebM files
 * for OpenAI while maintaining zero gaps in audio capture.
 *
 * @class AudioRecorder
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { AudioUtils } from '../utils/AudioUtils.mjs';

const RecordingState = {
  INACTIVE: 'inactive',
  RECORDING: 'recording',
  PAUSED: 'paused'
};

const CaptureSource = {
  MICROPHONE: 'microphone',
  FOUNDRY_WEBRTC: 'foundry-webrtc',
  SYSTEM_AUDIO: 'system-audio'
};

class AudioRecorder {
  _logger = Logger.createChild('AudioRecorder');
  
  _mediaRecorder = null;
  _secondaryRecorder = null;
  _stream = null;
  _state = RecordingState.INACTIVE;
  
  _audioChunks = []; // Full session storage
  _liveBuffer = [];  // Current active buffer
  
  _totalActiveMs = 0;
  _lastStartTime = null;
  _startTime = null;

  _callbacks = {
    onDataAvailable: null,
    onError: null,
    onStateChange: null,
    onLevelChange: null
  };

  // Audio analysis
  _audioContext = null;
  _analyserNode = null;
  _sourceNode = null;
  _levelMonitorId = null;

  constructor(options = {}) {
    this._logger.debug('AudioRecorder initialized');
  }

  get state() { return this._state; }
  get isRecording() { return this._state === RecordingState.RECORDING; }
  get duration() {
    if (!this._lastStartTime && this._totalActiveMs === 0) return 0;
    let current = (this._state === RecordingState.RECORDING && this._lastStartTime) ? (Date.now() - this._lastStartTime) : 0;
    return Math.floor((this._totalActiveMs + current) / 1000);
  }

  setCallbacks(callbacks) { this._callbacks = { ...this._callbacks, ...callbacks }; }

  async startRecording(options = {}) {
    if (this._state !== RecordingState.INACTIVE) throw new Error('Already recording');

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
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

  _startNewRecorder() {
    const options = AudioUtils.getRecorderOptions();
    const recorder = new MediaRecorder(this._stream, options);
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this._audioChunks.push(e.data);
        this._liveBuffer.push(e.data);
      }
    };

    recorder.start();
    this._mediaRecorder = recorder;
  }

  /**
   * Rotates the recorder: starts a new one and stops the old one.
   * This is the only way to get a valid, standalone WebM file without gaps.
   */
  async getLatestChunk() {
    if (this._state !== RecordingState.RECORDING) return null;

    return new Promise((resolve) => {
      const oldRecorder = this._mediaRecorder;
      
      // 1. Start the new recorder immediately on the same stream
      this._startNewRecorder();

      // 2. Stop the old recorder a few ms later to ensure overlap
      setTimeout(() => {
        oldRecorder.onstop = () => {
          const blob = new Blob(this._liveBuffer, { type: oldRecorder.mimeType });
          this._liveBuffer = [];
          resolve(blob.size > 0 ? blob : null);
        };
        oldRecorder.stop();
      }, 100);
    });
  }

  async stopRecording() {
    if (this._state === RecordingState.INACTIVE) return null;

    this._stopLevelMonitoring();
    if (this._lastStartTime) this._totalActiveMs += (Date.now() - this._lastStartTime);

    return new Promise((resolve) => {
      this._mediaRecorder.onstop = () => {
        const fullBlob = new Blob(this._audioChunks, { type: this._mediaRecorder.mimeType });
        this._cleanup();
        resolve(fullBlob);
      };
      this._mediaRecorder.stop();
    });
  }

  pause() {
    if (this._state !== RecordingState.RECORDING) return;
    this._totalActiveMs += (Date.now() - this._lastStartTime);
    this._lastStartTime = null;
    this._mediaRecorder.pause();
    this._state = RecordingState.PAUSED;
    this._callbacks.onStateChange?.(this._state);
  }

  resume() {
    if (this._state !== RecordingState.PAUSED) return;
    this._lastStartTime = Date.now();
    this._mediaRecorder.resume();
    this._state = RecordingState.RECORDING;
    this._callbacks.onStateChange?.(this._state);
  }

  _cleanup() {
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    if (this._audioContext) this._audioContext.close();
    this._stream = null;
    this._state = RecordingState.INACTIVE;
    this._callbacks.onStateChange?.(this._state);
  }

  _setupAudioAnalysis(stream) {
    try {
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this._sourceNode = this._audioContext.createMediaStreamSource(stream);
      this._analyserNode = this._audioContext.createAnalyser();
      this._analyserNode.fftSize = 256;
      this._sourceNode.connect(this._analyserNode);
    } catch (e) { this._logger.warn('Analysis failed', e); }
  }

  _startLevelMonitoring() {
    const monitor = () => {
      if (this._state === RecordingState.RECORDING && this._analyserNode) {
        const data = new Uint8Array(this._analyserNode.frequencyBinCount);
        this._analyserNode.getByteFrequencyData(data);
        const sum = data.reduce((a, b) => a + b, 0);
        this._callbacks.onLevelChange?.(Math.min(1, sum / (data.length * 128)));
      }
      this._levelMonitorId = requestAnimationFrame(monitor);
    };
    this._levelMonitorId = requestAnimationFrame(monitor);
  }

  _stopLevelMonitoring() {
    if (this._levelMonitorId) cancelAnimationFrame(this._levelMonitorId);
  }

  getAudioLevel() {
    return 0; // Handled via callback for real-time
  }
}

export { AudioRecorder, RecordingState, CaptureSource };
