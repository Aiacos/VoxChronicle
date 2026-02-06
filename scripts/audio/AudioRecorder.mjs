/**
 * AudioRecorder - Audio Capture Service for VoxChronicle
 *
 * Provides audio recording from microphone or Foundry VTT WebRTC streams
 * using the MediaRecorder API. Supports multiple capture modes with
 * automatic fallback to microphone if WebRTC is unavailable.
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
 * Default timeslice for data chunks (10 seconds)
 * @constant {number}
 */
const DEFAULT_TIMESLICE = 10000;

/**
 * AudioRecorder class for capturing audio from microphone or WebRTC
 *
 * @example
 * const recorder = new AudioRecorder();
 * await recorder.startRecording({ source: 'microphone' });
 * // ... recording ...
 * const audioBlob = await recorder.stopRecording();
 */
class AudioRecorder {
  /**
   * Logger instance for this class
   * @type {Object}
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
   * Audio chunks collected during recording
   * @type {Array<Blob>}
   * @private
   */
  _audioChunks = [];

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
   * Recording start timestamp
   * @type {number|null}
   * @private
   */
  _startTime = null;

  /**
   * Event callbacks
   * @type {Object}
   * @private
   */
  _callbacks = {
    onDataAvailable: null,
    onError: null,
    onStateChange: null
  };

  /**
   * Create a new AudioRecorder instance
   */
  constructor() {
    this._logger.debug('AudioRecorder instance created');
  }

  /**
   * Get the current recording state
   * @returns {string} Current state from RecordingState enum
   */
  get state() {
    return this._state;
  }

  /**
   * Check if currently recording
   * @returns {boolean} True if recording is active
   */
  get isRecording() {
    return this._state === RecordingState.RECORDING;
  }

  /**
   * Get the current capture source
   * @returns {string|null} The active capture source or null
   */
  get captureSource() {
    return this._captureSource;
  }

  /**
   * Get recording duration in seconds
   * @returns {number} Duration in seconds, or 0 if not recording
   */
  get duration() {
    if (!this._startTime) return 0;
    return Math.floor((Date.now() - this._startTime) / 1000);
  }

  /**
   * Set event callback handlers
   *
   * @param {Object} callbacks - Callback handlers
   * @param {Function} [callbacks.onDataAvailable] - Called when audio chunk is available
   * @param {Function} [callbacks.onError] - Called when an error occurs
   * @param {Function} [callbacks.onStateChange] - Called when recording state changes
   */
  setCallbacks(callbacks) {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * Start recording audio from the specified source
   *
   * @param {Object} [options] - Recording options
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

      this._captureSource = source;
      this._startTime = Date.now();
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

          this._logger.log(`Recording stopped. Duration: ${AudioUtils.formatDuration(duration)}, Size: ${sizeMB}MB`);

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
    if (this._state !== RecordingState.RECORDING) {
      throw new Error('Cannot pause - not currently recording.');
    }

    if (this._mediaRecorder && this._mediaRecorder.state === 'recording') {
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
    if (this._state !== RecordingState.PAUSED) {
      throw new Error('Cannot resume - recording is not paused.');
    }

    if (this._mediaRecorder && this._mediaRecorder.state === 'paused') {
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
      stream.getTracks().forEach(track => track.stop());
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
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      this._logger.debug(`Found ${audioInputs.length} audio input devices`);
      return audioInputs;
    } catch (error) {
      this._logger.error('Error enumerating devices:', error);
      return [];
    }
  }

  /**
   * Start microphone capture
   *
   * @param {Object} options - Capture options
   * @returns {Promise<void>}
   * @private
   */
  async _startMicrophoneCapture(options = {}) {
    const constraints = {
      audio: {
        echoCancellation: options.echoCancellation ?? true,
        noiseSuppression: options.noiseSuppression ?? true,
        sampleRate: options.sampleRate ?? 44100,
        channelCount: options.channelCount ?? 1
      }
    };

    // Allow specifying a specific device
    if (options.deviceId) {
      constraints.audio.deviceId = { exact: options.deviceId };
    }

    this._logger.debug('Requesting microphone with constraints:', constraints);

    try {
      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._logger.log('Microphone capture started');
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone access denied. Please grant permission to record audio.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Microphone is in use by another application. Please close other applications and try again.');
      }
      throw error;
    }
  }

  /**
   * Attempt to capture Foundry VTT WebRTC audio streams
   * Falls back to microphone if WebRTC is not available
   *
   * @param {Object} options - Capture options
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

    // Try to get the local stream from Foundry's AV system
    const localStream = avClient.getLocalStream?.();

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
   * @param {Object} options - Capture options
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
        audio: true  // Request audio (may not be supported on all platforms)
      });

      // Check if we got audio tracks
      if (this._stream.getAudioTracks().length === 0) {
        // Stop the video tracks since we don't need them
        this._stream.getVideoTracks().forEach(track => track.stop());
        this._logger.warn('No audio track in display media, falling back to microphone');
        return this._startMicrophoneCapture(options);
      }

      // Stop video tracks - we only need audio
      this._stream.getVideoTracks().forEach(track => track.stop());

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

    // Create MediaRecorder
    this._mediaRecorder = new MediaRecorder(this._stream, recorderOptions);

    // Handle data available events
    this._mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this._audioChunks.push(event.data);
        this._logger.debug(`Audio chunk received: ${(event.data.size / 1024).toFixed(2)}KB`);

        // Call user callback if set
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
    const effectiveTimeslice = timeslice || DEFAULT_TIMESLICE;
    this._mediaRecorder.start(effectiveTimeslice);

    this._logger.debug(`MediaRecorder started with ${effectiveTimeslice}ms timeslice`);
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
   * Clean up resources after recording
   *
   * @private
   */
  _cleanup() {
    // Stop all stream tracks
    if (this._stream) {
      this._stream.getTracks().forEach(track => {
        track.stop();
        this._logger.debug(`Stopped track: ${track.kind}`);
      });
      this._stream = null;
    }

    // Reset state
    this._mediaRecorder = null;
    this._audioChunks = [];
    this._captureSource = null;
    this._startTime = null;
    this._updateState(RecordingState.INACTIVE);
  }
}

// Export the AudioRecorder class and enums
export { AudioRecorder, RecordingState, CaptureSource };
