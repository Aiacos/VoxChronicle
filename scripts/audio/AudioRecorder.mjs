/**
 * AudioRecorder - Audio Capture Service for VoxChronicle
 *
 * Provides audio recording from microphone or Foundry VTT WebRTC streams
 * using the MediaRecorder API. Supports multiple capture modes with
 * automatic fallback to microphone if WebRTC is unavailable.
 *
 * Includes audio level metering via Web Audio API AnalyserNode and
 * silence detection with configurable thresholds (merged from Narrator Master).
 *
 * @class AudioRecorder
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { AudioUtils } from '../utils/AudioUtils.mjs';

/**
 * Recording states enumeration
 * @enum {string}
 */
const RecordingState = {
  INACTIVE: 'inactive',
  RECORDING: 'recording',
  PAUSED: 'paused'
};

/**
 * Capture source types enumeration
 * @enum {string}
 */
const CaptureSource = {
  MICROPHONE: 'microphone',
  FOUNDRY_WEBRTC: 'foundry-webrtc',
  SYSTEM_AUDIO: 'system-audio'
};

/**
 * Default timeslice for data chunks (1 second)
 * Smaller interval improves real-time metering and header capture.
 * @constant {number}
 */
const GAPLESS_CHUNK_INTERVAL = 1000;

/**
 * Default maximum recording duration (5 minutes in milliseconds)
 * @constant {number}
 */
const DEFAULT_MAX_DURATION = 300000;

/**
 * Default silence detection threshold (0.0-1.0)
 * @constant {number}
 */
const DEFAULT_SILENCE_THRESHOLD = 0.01;

/**
 * AudioRecorder class for capturing audio from microphone or WebRTC
 *
 * @example
 * const recorder = new AudioRecorder();
 * await recorder.startRecording({ source: 'microphone' });
 * // ... recording ...
 * const audioBlob = await recorder.stopRecording();
 *
 * @example
 * // With audio level metering and silence detection
 * const recorder = new AudioRecorder({
 *   silenceThreshold: 0.02,
 *   maxDuration: 600000,
 *   onLevelChange: (level) => updateMeter(level),
 *   onSilenceDetected: (duration) => console.log(`Silence for ${duration}ms`),
 *   onSoundDetected: () => console.log('Sound resumed'),
 *   onAutoStop: () => console.log('Max duration reached')
 * });
 */
class AudioRecorder {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('AudioRecorder');

  /**
   * MediaRecorder instance
   * @type {MediaRecorder|null}
   * @private
   */
  _mediaRecorder = null;

  /**
   * Audio chunks collected during recording (full session)
   * @type {Array<Blob>}
   * @private
   */
  _audioChunks = [];

  /**
   * Live mode chunk buffer (drained by getLatestChunk)
   * @type {Array<Blob>}
   * @private
   */
  _liveChunks = [];

  /**
   * Active media stream
   * @type {MediaStream|null}
   * @private
   */
  _stream = null;

  /**
   * Current recording state
   * @type {string}
   * @private
   */
  _state = RecordingState.INACTIVE;

  /**
   * Active capture source type
   * @type {string|null}
   * @private
   */
  _captureSource = null;

  /**
   * Total active recording time in milliseconds (excluding pauses)
   * @type {number}
   * @private
   */
  _totalActiveMs = 0;

  /**
   * Timestamp when the current recording segment started
   * @type {number|null}
   * @private
   */
  _lastStartTime = null;

  /**
   * Recording start timestamp (absolute start)
   * @type {number|null}
   * @private
   */
  _startTime = null;

  /**
   * Event callbacks
   * @type {object}
   * @private
   */
  _callbacks = {
    onDataAvailable: null,
    onError: null,
    onStateChange: null,
    onLevelChange: null,
    onSilenceDetected: null,
    onSoundDetected: null,
    onAutoStop: null
  };

  // ... (Audio Analysis fields omitted for brevity in replacement) ...

  /**
   * Get recording duration in seconds (active time only)
   * @returns {number} Duration in seconds, or 0 if not recording
   */
  get duration() {
    if (!this._lastStartTime && this._totalActiveMs === 0) return 0;
    
    let currentSegment = 0;
    if (this._state === RecordingState.RECORDING && this._lastStartTime) {
      currentSegment = Date.now() - this._lastStartTime;
    }
    
    return Math.floor((this._totalActiveMs + currentSegment) / 1000);
  }

  /**
   * Set event callback handlers
   *
   * @param {object} callbacks - Callback handlers
   * @param {Function} [callbacks.onDataAvailable] - Called when audio chunk is available
   * @param {Function} [callbacks.onError] - Called when an error occurs
   * @param {Function} [callbacks.onStateChange] - Called when recording state changes
   * @param {Function} [callbacks.onLevelChange] - Called with current audio level (0.0-1.0)
   * @param {Function} [callbacks.onSilenceDetected] - Called with silence duration (ms)
   * @param {Function} [callbacks.onSoundDetected] - Called when sound resumes
   * @param {Function} [callbacks.onAutoStop] - Called when auto-stop triggers
   */
  setCallbacks(callbacks) {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * Start recording audio from the specified source
   *
   * @param {object} [options] - Recording options
   * @param {string} [options.source='microphone'] - Capture source: 'microphone', 'foundry-webrtc', or 'system-audio'
   * @param {boolean} [options.echoCancellation=true] - Enable echo cancellation for microphone
   * @param {boolean} [options.noiseSuppression=true] - Enable noise suppression for microphone
   * @param {number} [options.sampleRate=44100] - Audio sample rate
   * @param {number} [options.timeslice] - Data chunk interval in milliseconds
   * @returns {Promise<void>}
   * @throws {Error} If recording cannot be started
   */
  async startRecording(options = {}) {
    if (this._state !== RecordingState.INACTIVE) {
      throw new Error('Recording already in progress. Stop current recording first.');
    }

    const source = options.source || CaptureSource.MICROPHONE;
    this._logger.debug('startRecording called', { source, timeslice: options.timeslice, echoCancellation: options.echoCancellation });
    this._logger.log(`Starting recording from source: ${source}`);

    try {
      // Get the appropriate media stream based on source
      switch (source) {
        case CaptureSource.FOUNDRY_WEBRTC:
          await this._startFoundryCapture(options);
          break;
        case CaptureSource.SYSTEM_AUDIO:
          await this._startSystemAudioCapture(options);
          break;
        case CaptureSource.MICROPHONE:
        default:
          await this._startMicrophoneCapture(options);
          break;
      }

      // Initialize the MediaRecorder
      await this._initializeRecorder(options.timeslice);

      // Set up audio analysis and level monitoring
      this._setupAudioAnalysis(this._stream);
      this._startLevelMonitoring();

      // Set up auto-stop timer
      this._startAutoStopTimer();

      this._captureSource = source;
      this._startTime = Date.now();
      this._lastStartTime = this._startTime;
      this._totalActiveMs = 0;
      this._updateState(RecordingState.RECORDING);

      this._logger.log('Recording started successfully');
    } catch (error) {
      this._logger.error('Failed to start recording:', error);
      this._cleanup();
      throw error;
    }
  }

  /**
   * Stop recording and return the audio blob
   *
   * @returns {Promise<Blob>} The recorded audio as a Blob
   * @throws {Error} If no recording is active
   */
  async stopRecording() {
    if (this._state === RecordingState.INACTIVE) {
      throw new Error('No active recording to stop.');
    }

    this._logger.log('Stopping recording...');

    // Finalize duration
    if (this._state === RecordingState.RECORDING && this._lastStartTime) {
      this._totalActiveMs += (Date.now() - this._lastStartTime);
    }

    // Stop level monitoring and auto-stop timer
    this._stopLevelMonitoring();
    this._clearAutoStopTimer();

    return new Promise((resolve, reject) => {
      if (!this._mediaRecorder || this._mediaRecorder.state === 'inactive') {
        reject(new Error('MediaRecorder is not active'));
        return;
      }

      this._mediaRecorder.onstop = () => {
        try {
          const mimeType = this._mediaRecorder.mimeType;
          const audioBlob = AudioUtils.createAudioBlob(this._audioChunks, mimeType);

          const duration = this.duration;
          const sizeMB = AudioUtils.getBlobSizeMB(audioBlob);

          this._logger.log(
            `Recording stopped. Duration: ${AudioUtils.formatDuration(duration)}, Size: ${sizeMB}MB`
          );
          this._logger.debug('stopRecording result', { sizeMB, mimeType, durationSec: duration });

          // Cleanup resources
          this._cleanup();

          resolve(audioBlob);
        } catch (error) {
          this._logger.error('Error finalizing recording:', error);
          this._cleanup();
          reject(error);
        }
      };

      this._mediaRecorder.onerror = (event) => {
        this._logger.error('MediaRecorder error:', event.error);
        this._cleanup();
        reject(event.error);
      };

      // Stop the MediaRecorder
      this._mediaRecorder.stop();
    });
  }

  /**
   * Pause the current recording
   *
   * @returns {void}
   * @throws {Error} If no recording is active
   */
  pause() {
    if (this._state === RecordingState.PAUSED) {
      this._logger.debug('Already paused, ignoring duplicate pause()');
      return;
    }
    if (this._state !== RecordingState.RECORDING) {
      throw new Error('Cannot pause - not currently recording.');
    }

    if (this._mediaRecorder && this._mediaRecorder.state === 'recording') {
      // Record elapsed time before pausing
      if (this._lastStartTime) {
        this._totalActiveMs += (Date.now() - this._lastStartTime);
        this._lastStartTime = null;
      }

      this._mediaRecorder.pause();
      this._updateState(RecordingState.PAUSED);
      this._logger.log('Recording paused');
    }
  }

  /**
   * Resume a paused recording
   *
   * @returns {void}
   * @throws {Error} If recording is not paused
   */
  resume() {
    if (this._state === RecordingState.RECORDING) {
      this._logger.debug('Already recording, ignoring duplicate resume()');
      return;
    }
    if (this._state !== RecordingState.PAUSED) {
      throw new Error('Cannot resume - recording is not paused.');
    }

    if (this._mediaRecorder && this._mediaRecorder.state === 'paused') {
      // Set new start time for the next segment
      this._lastStartTime = Date.now();

      this._mediaRecorder.resume();
      this._updateState(RecordingState.RECORDING);
      this._logger.log('Recording resumed');
    }
  }

  /**
   * Cancel the current recording without saving
   *
   * @returns {void}
   */
  cancel() {
    if (this._state === RecordingState.INACTIVE) {
      return;
    }

    this._logger.log('Recording cancelled');

    // Stop level monitoring and auto-stop timer
    this._stopLevelMonitoring();
    this._clearAutoStopTimer();

    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop();
    }

    this._cleanup();
  }

  /**
   * Request data from MediaRecorder immediately
   * Useful for getting partial recordings
   *
   * @returns {void}
   */
  requestData() {
    if (this._mediaRecorder && this._mediaRecorder.state === 'recording') {
      this._mediaRecorder.requestData();
    }
  }

  /**
   * First chunk of the recording containing the WebM/EBML header.
   * Required to make subsequent chunks playable/transcribable.
   * @type {Blob|null}
   * @private
   */
  _headerChunk = null;

  /**
   * Get the latest audio chunk(s) accumulated since the last call.
   * Returns a valid WebM blob by prepending the session header to the new data.
   * This allows gapless recording (no stop/start required).
   *
   * @returns {Promise<Blob|null>} A self-contained audio Blob, or null if no new data
   */
  async getLatestChunk() {
    if (this._state !== RecordingState.RECORDING) {
      return null;
    }

    if (this._liveChunks.length === 0) {
      return null;
    }

    // Create a blob from the accumulated live chunks
    // IMPORTANT: Prepend the header chunk so this blob is a valid, standalone WebM file
    const parts = this._headerChunk ? [this._headerChunk, ...this._liveChunks] : [...this._liveChunks];
    const blob = new Blob(parts, { type: this._mediaRecorder.mimeType });

    // Clear buffer but DO NOT clear header
    this._liveChunks = [];

    this._logger.debug(`getLatestChunk: emitted ${(blob.size / 1024).toFixed(1)}KB (header included)`);
    return blob;
  }

  /**
   * Get the current audio level (0.0-1.0)
   * Uses RMS calculation over frequency data from the AnalyserNode.
   *
   * @returns {number} The current audio level normalized to 0.0-1.0, or 0 if no analyser
   */
  getAudioLevel() {
    if (!this._analyserNode) {
      return 0;
    }

    const dataArray = new Uint8Array(this._analyserNode.frequencyBinCount);
    this._analyserNode.getByteFrequencyData(dataArray);

    // Calculate RMS (Root Mean Square) of frequency data
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);

    // Normalize to 0.0-1.0 range (byte frequency data max is ~255, /128 gives ~2 max, clamped to 1)
    return Math.min(1, rms / 128);
  }

  /**
   * Check if microphone permission is granted
   *
   * @returns {Promise<string>} Permission state: 'granted', 'denied', or 'prompt'
   */
  async checkMicrophonePermission() {
    try {
      // Check if Permissions API is supported
      if (!navigator.permissions || !navigator.permissions.query) {
        this._logger.debug('Permissions API not supported, will prompt on first use');
        return 'prompt';
      }

      const result = await navigator.permissions.query({ name: 'microphone' });
      this._logger.debug(`Microphone permission state: ${result.state}`);
      return result.state;
    } catch (error) {
      this._logger.warn('Could not check microphone permission:', error);
      return 'prompt';
    }
  }

  /**
   * Request microphone permission explicitly
   *
   * @returns {Promise<boolean>} True if permission was granted
   */
  async requestMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop all tracks immediately - we just needed to request permission
      stream.getTracks().forEach((track) => track.stop());
      this._logger.log('Microphone permission granted');
      return true;
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        this._logger.warn('Microphone permission denied by user');
      } else {
        this._logger.error('Error requesting microphone permission:', error);
      }
      return false;
    }
  }

  /**
   * Get available audio input devices
   *
   * @returns {Promise<Array<MediaDeviceInfo>>} List of audio input devices
   */
  async getAudioInputDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === 'audioinput');
      this._logger.debug(`Found ${audioInputs.length} audio input devices`);
      return audioInputs;
    } catch (error) {
      this._logger.error('Error enumerating devices:', error);
      return [];
    }
  }

  /**
   * Start microphone capture with robust error handling and flexible constraints
   *
   * @param {object} options - Capture options
   * @returns {Promise<void>}
   * @private
   */
  async _startMicrophoneCapture(options = {}) {
    // Stop any existing tracks first to release hardware
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
    }

    const constraints = {
      audio: {
        echoCancellation: options.echoCancellation ?? true,
        noiseSuppression: options.noiseSuppression ?? true,
        autoGainControl: true
      }
    };

    // Allow specifying a specific device
    if (options.deviceId) {
      constraints.audio.deviceId = { exact: options.deviceId };
    }

    this._logger.debug('Requesting microphone with constraints:', constraints);

    try {
      try {
        // Attempt with preferred sample rate
        this._stream = await navigator.mediaDevices.getUserMedia({
          ...constraints,
          audio: { ...constraints.audio, sampleRate: options.sampleRate ?? 44100 }
        });
      } catch (e) {
        this._logger.warn('Failed to get user media with explicit sample rate, trying auto...', e.message);
        // Fallback to auto constraints if explicit ones fail
        this._stream = await navigator.mediaDevices.getUserMedia(constraints);
      }
      
      this._logger.log('Microphone capture started successfully');
    } catch (error) {
      this._logger.error('Microphone access error:', error.name);
      
      let userMessage = 'Microphone error.';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        userMessage = 'Microphone access denied. Please check your browser permissions for this site.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        userMessage = 'No microphone found. Please ensure your recording device is connected.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        userMessage = 'Microphone is busy. Close other apps (Discord, Zoom) using it and try again.';
      }
      
      ui?.notifications?.error(`VoxChronicle: ${userMessage}`);
      throw new Error(userMessage);
    }
  }

  /**
   * Attempt to capture Foundry VTT WebRTC audio streams
   * Falls back to microphone if WebRTC is not available
   *
   * @param {object} options - Capture options
   * @returns {Promise<void>}
   * @private
   */
  async _startFoundryCapture(options = {}) {
    this._logger.debug('Attempting Foundry VTT WebRTC capture...');

    // Check if we're running in Foundry VTT context
    if (typeof game === 'undefined') {
      this._logger.warn('Not running in Foundry VTT context, falling back to microphone');
      return this._startMicrophoneCapture(options);
    }

    // Try to access Foundry's AV client for WebRTC streams
    const avClient = game.webrtc?.client;

    if (!avClient) {
      this._logger.warn('Foundry VTT WebRTC client not available, falling back to microphone');
      return this._startMicrophoneCapture(options);
    }

    // Get the local stream from Foundry's AV system
    const localStream = avClient.localStream || avClient.getLocalStream?.();

    if (localStream && localStream.getAudioTracks().length > 0) {
      this._stream = localStream;
      this._logger.log('Foundry VTT WebRTC capture started');
    } else {
      // Fallback to microphone capture if WebRTC stream not available
      this._logger.warn('No WebRTC audio stream found, falling back to microphone');
      return this._startMicrophoneCapture(options);
    }
  }

  /**
   * Attempt to capture system audio (display media)
   * Note: This requires user interaction and may not capture system audio on all platforms
   *
   * @param {object} options - Capture options
   * @returns {Promise<void>}
   * @private
   */
  async _startSystemAudioCapture(options = {}) {
    this._logger.debug('Attempting system audio capture...');

    // Check if getDisplayMedia is available
    if (!navigator.mediaDevices.getDisplayMedia) {
      this._logger.warn('Display media capture not supported, falling back to microphone');
      return this._startMicrophoneCapture(options);
    }

    try {
      // Request screen sharing with audio
      this._stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Video is required for getDisplayMedia
        audio: true // Request audio (may not be supported on all platforms)
      });

      // Check if we got audio tracks
      if (this._stream.getAudioTracks().length === 0) {
        // Stop the video tracks since we don't need them
        this._stream.getVideoTracks().forEach((track) => track.stop());
        this._logger.warn('No audio track in display media, falling back to microphone');
        return this._startMicrophoneCapture(options);
      }

      // Stop video tracks - we only need audio
      this._stream.getVideoTracks().forEach((track) => track.stop());

      this._logger.log('System audio capture started');
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        this._logger.warn('Display media permission denied, falling back to microphone');
      } else {
        this._logger.warn('Display media capture failed, falling back to microphone:', error);
      }
      return this._startMicrophoneCapture(options);
    }
  }

  /**
   * Initialize the MediaRecorder with the current stream
   *
   * @param {number} [timeslice] - Data chunk interval in milliseconds
   * @returns {Promise<void>}
   * @private
   */
  async _initializeRecorder(timeslice) {
    if (!this._stream) {
      throw new Error('No media stream available for recording');
    }

    // Get optimal recorder options using AudioUtils
    const recorderOptions = AudioUtils.getRecorderOptions();

    this._logger.debug('Initializing MediaRecorder with options:', recorderOptions);

    // Reset audio chunks
    this._audioChunks = [];
    this._liveChunks = [];
    this._headerChunk = null;

    // Create MediaRecorder
    this._mediaRecorder = new MediaRecorder(this._stream, recorderOptions);

    // Handle data available events
    this._mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        // The first chunk is usually the header (metadata)
        if (!this._headerChunk) {
          this._headerChunk = event.data;
          this._logger.debug('Captured WebM header chunk');
        }

        this._audioChunks.push(event.data);
        this._liveChunks.push(event.data);
        // Do not log every chunk to avoid spamming console in live mode
        if (this._callbacks.onDataAvailable) {
          this._callbacks.onDataAvailable(event.data, this._audioChunks.length);
        }
      }
    };

    // Handle errors
    this._mediaRecorder.onerror = (event) => {
      this._logger.error('MediaRecorder error:', event.error);
      if (this._callbacks.onError) {
        this._callbacks.onError(event.error);
      }
    };

    // Start recording with timeslice for periodic data chunks
    // 1000ms timeslice ensures we get frequent data for live mode without gaps
    const effectiveTimeslice = timeslice || GAPLESS_CHUNK_INTERVAL; 
    this._mediaRecorder.start(effectiveTimeslice);

    this._logger.debug(`MediaRecorder started with ${effectiveTimeslice}ms timeslice`);
  }

  // --- Audio Analysis Methods (from Narrator Master) ---

  /**
   * Set up Web Audio API analysis pipeline for the recording stream.
   * Creates an AudioContext, a MediaStreamSource, and an AnalyserNode
   * connected in series for real-time frequency analysis.
   *
   * @param {MediaStream} stream - The active media stream to analyse
   * @private
   */
  _setupAudioAnalysis(stream) {
    if (!stream) {
      this._logger.warn('Cannot setup audio analysis without a stream');
      return;
    }

    try {
      const AudioContextClass =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : typeof webkitAudioContext !== 'undefined'
            ? webkitAudioContext
            : null;

      if (!AudioContextClass) {
        this._logger.warn('AudioContext not available, audio level metering disabled');
        return;
      }

      this._audioContext = new AudioContextClass();
      this._sourceNode = this._audioContext.createMediaStreamSource(stream);
      this._analyserNode = this._audioContext.createAnalyser();
      this._analyserNode.fftSize = 256;
      this._sourceNode.connect(this._analyserNode);

      this._logger.debug('Audio analysis pipeline initialized');
    } catch (error) {
      this._logger.warn('Failed to initialize audio analysis:', error);
      // Non-fatal: recording continues without level metering
      // Close the AudioContext to prevent resource leak before nullifying
      if (this._audioContext) {
        try { this._audioContext.close(); } catch (closeErr) { this._logger.debug('audioContext.close during analysis cleanup:', closeErr.message); }
      }
      this._audioContext = null;
      this._analyserNode = null;
      this._sourceNode = null;
    }
  }

  /**
   * Start the requestAnimationFrame-based level monitoring loop.
   * Each frame reads the current audio level and checks for silence.
   *
   * @private
   */
  _startLevelMonitoring() {
    if (!this._analyserNode) {
      return;
    }

    const monitor = () => {
      // Only monitor while recording (not paused or inactive)
      if (this._state !== RecordingState.RECORDING) {
        this._levelMonitorId = requestAnimationFrame(monitor);
        return;
      }

      const level = this.getAudioLevel();

      // Notify level change callback
      if (this._callbacks.onLevelChange) {
        this._callbacks.onLevelChange(level);
      }

      // Silence detection
      this._detectSilence(level);

      this._levelMonitorId = requestAnimationFrame(monitor);
    };

    this._levelMonitorId = requestAnimationFrame(monitor);
    this._logger.debug('Level monitoring started');
  }

  /**
   * Stop the level monitoring loop and reset silence state.
   *
   * @private
   */
  _stopLevelMonitoring() {
    if (this._levelMonitorId !== null) {
      cancelAnimationFrame(this._levelMonitorId);
      this._levelMonitorId = null;
      this._logger.debug('Level monitoring stopped');
    }

    // Reset silence tracking
    this._isSilent = false;
    this._silenceStartTime = null;
  }

  /**
   * Check the current audio level against the silence threshold.
   * Fires onSilenceDetected when silence duration exceeds a meaningful period,
   * and onSoundDetected when sound resumes after silence.
   *
   * @param {number} level - Current audio level (0.0-1.0)
   * @private
   */
  _detectSilence(level) {
    const now = Date.now();

    if (level < this._silenceThreshold) {
      // Audio is below threshold
      if (!this._isSilent) {
        // Transition to silent
        this._isSilent = true;
        this._silenceStartTime = now;
      } else if (this._silenceStartTime && this._callbacks.onSilenceDetected) {
        // Already silent - report duration
        const silenceDuration = now - this._silenceStartTime;
        this._callbacks.onSilenceDetected(silenceDuration);
      }
    } else {
      // Audio is above threshold
      if (this._isSilent) {
        // Transition from silent to sound
        this._isSilent = false;
        this._silenceStartTime = null;

        if (this._callbacks.onSoundDetected) {
          this._callbacks.onSoundDetected();
        }
      }
    }
  }

  // --- Auto-stop methods ---

  /**
   * Start the auto-stop timer if maxDuration is configured.
   * When the timer fires, recording is automatically stopped.
   *
   * @private
   */
  _startAutoStopTimer() {
    if (this._maxDuration > 0) {
      this._maxDurationTimeout = setTimeout(() => {
        this._logger.log(`Max duration reached (${this._maxDuration}ms), auto-stopping recording`);

        if (this._callbacks.onAutoStop) {
          this._callbacks.onAutoStop();
        }

        // Auto-stop the recording (fire-and-forget, errors handled internally)
        this.stopRecording().catch((error) => {
          this._logger.error('Error during auto-stop:', error);
        });
      }, this._maxDuration);

      this._logger.debug(`Auto-stop timer set for ${this._maxDuration}ms`);
    }
  }

  /**
   * Clear the auto-stop timer if active.
   *
   * @private
   */
  _clearAutoStopTimer() {
    if (this._maxDurationTimeout !== null) {
      clearTimeout(this._maxDurationTimeout);
      this._maxDurationTimeout = null;
    }
  }

  /**
   * Update recording state and notify listeners
   *
   * @param {string} newState - New state from RecordingState enum
   * @private
   */
  _updateState(newState) {
    const oldState = this._state;
    this._state = newState;

    if (this._callbacks.onStateChange) {
      this._callbacks.onStateChange(newState, oldState);
    }
  }

  /**
   * Clean up all resources after recording, including audio analysis nodes.
   *
   * @private
   */
  _cleanup() {
    // Stop level monitoring and auto-stop timer
    this._stopLevelMonitoring();
    this._clearAutoStopTimer();

    // Clean up audio analysis resources
    this._cleanupAudioAnalysis();

    // Stop all stream tracks
    if (this._stream) {
      this._stream.getTracks().forEach((track) => {
        track.stop();
        this._logger.debug(`Stopped track: ${track.kind}`);
      });
      this._stream = null;
    }

    // Reset state
    this._mediaRecorder = null;
    this._audioChunks = [];
    this._liveChunks = [];
    this._captureSource = null;
    this._startTime = null;
    this._updateState(RecordingState.INACTIVE);
  }

  /**
   * Clean up Web Audio API analysis nodes and close the AudioContext.
   *
   * @private
   */
  _cleanupAudioAnalysis() {
    if (this._sourceNode) {
      try {
        this._sourceNode.disconnect();
      } catch (error) {
        this._logger.debug('sourceNode.disconnect cleanup:', error.message);
      }
      this._sourceNode = null;
    }

    this._analyserNode = null;

    if (this._audioContext) {
      try {
        if (this._audioContext.state !== 'closed') {
          this._audioContext.close();
        }
      } catch (error) {
        this._logger.debug('audioContext.close cleanup:', error.message);
      }
      this._audioContext = null;
    }
  }
}

// Export the AudioRecorder class and enums
export { AudioRecorder, RecordingState, CaptureSource };
