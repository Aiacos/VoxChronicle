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
// import { AudioUtils } from '../utils/AudioUtils.mjs';

/**
 * Possible recording states.
 * @enum {string}
 */
const RecordingState = {
  INACTIVE: 'inactive',
  RECORDING: 'recording',
  PAUSED: 'paused'
};

class AudioRecorder {
  _logger = Logger.createChild('AudioRecorder');

  _mediaRecorder = null;
  _stream = null;
  _state = RecordingState.INACTIVE;

  _audioChunks = []; // Full session storage (all chunks across rotations)
  _liveBuffer = []; // Current active recorder's buffer (reset on rotation)

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

  // Rotation state — guards against concurrent getLatestChunk() calls
  _isRotating = false;
  _pendingOldRecorder = null;
  _rotationStopTimeoutId = null;
  _rotationRejectTimeoutId = null;
  _rotationResolve = null;

  _lastAudioLevel = 0;

  /** @type {string|null} Cached detected codec MIME type */
  _detectedCodec = null;

  /** @type {IDBDatabase|null} IndexedDB handle for crash recovery */
  _persistDB = null;

  /** @type {string|null} Session ID for persistence keys */
  _persistSessionId = null;

  /** @type {number} Counter for persisted chunk indices */
  _persistChunkIndex = 0;

  /** @type {object} */
  _options = {};

  /** @type {object | null} EventBus instance for emitting events (optional) */
  _eventBus = null;

  /** @type {Array} Web Audio source nodes for WebRTC peer streams */
  _peerSourceNodes = [];

  /** @type {MediaStreamAudioDestinationNode|null} Mixing destination for combined streams */
  _mixDestination = null;

  /**
   * Create an AudioRecorder instance.
   * @param {object} [options={}] - Configuration options.
   * @param {boolean} [options.echoCancellation=true] - Enable echo cancellation.
   * @param {boolean} [options.noiseSuppression=true] - Enable noise suppression.
   * @param {string} [options.deviceId] - Specific audio input device ID.
   * @param {object} [options.eventBus] - EventBus instance for emitting events.
   */
  constructor(options = {}) {
    this._eventBus = options.eventBus ?? null;
    this._options = options;
    this._logger.debug('AudioRecorder initialized');
  }

  /**
   * Emit an event on the EventBus, swallowing any errors to prevent
   * bus failures from breaking recording functionality.
   * @param {string} event - Event name (e.g. 'audio:recordingStarted')
   * @param {object} payload - Event payload
   * @private
   */
  _emitSafe(event, payload) {
    try {
      this._eventBus?.emit(event, payload);
    } catch (error) {
      this._logger.warn(`EventBus emit "${event}" failed:`, error);
    }
  }

  /**
   * Invoke a user callback safely, swallowing any errors to prevent
   * user code from crashing the recording flow.
   * @param {string} name - Callback name (e.g. 'onStateChange')
   * @param {...*} args - Arguments to pass to the callback
   * @private
   */
  _callbackSafe(name, ...args) {
    try {
      this._callbacks[name]?.(...args);
    } catch (error) {
      this._logger.warn(`Callback "${name}" threw:`, error);
    }
  }

  /**
   * Current recording state.
   * @returns {string} One of RecordingState values.
   */
  get state() {
    return this._state;
  }

  /**
   * Whether the recorder is actively recording.
   * @returns {boolean}
   */
  get isRecording() {
    return this._state === RecordingState.RECORDING;
  }

  /**
   * Total active recording duration in seconds (excludes paused time).
   * @returns {number}
   */
  get duration() {
    if (!this._lastStartTime && this._totalActiveMs === 0) return 0;
    const current =
      this._state === RecordingState.RECORDING && this._lastStartTime
        ? Date.now() - this._lastStartTime
        : 0;
    return Math.floor((this._totalActiveMs + current) / 1000);
  }

  /**
   * Register callback functions for recorder events.
   * @param {object} callbacks - Callback map (onDataAvailable, onError, onStateChange, onLevelChange).
   */
  setCallbacks(callbacks) {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * Start recording audio from the user's microphone.
   * @param {object} [options={}] - Per-call options (currently unused, reserved for future use).
   * @returns {Promise<void>}
   * @throws {Error} If already recording or if microphone access is denied.
   */
  async startRecording(_options = {}) {
    if (this._state !== RecordingState.INACTIVE) throw new Error('Already recording');

    try {
      // Initialize crash recovery persistence (C1+C2 fix)
      const sessionId = `session-${Date.now()}`;
      await this._initPersistence(sessionId);

      const captureMode = this._options.captureMode || 'microphone';
      let micStream = null;
      let recordingStream;

      // Acquire mic stream unless webrtc-only mode
      if (captureMode !== 'webrtc') {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: this._options.echoCancellation ?? true,
            noiseSuppression: this._options.noiseSuppression ?? true,
            autoGainControl: true,
            ...(this._options.deviceId ? { deviceId: { exact: this._options.deviceId } } : {})
          }
        });
      }

      // Handle capture modes
      if (captureMode === 'webrtc') {
        const peerTracks = this._captureWebRTCStream();
        if (!peerTracks) throw new Error('No WebRTC peers available for audio capture');
        // Create a stream from peer tracks only — need AudioContext first
        micStream = new MediaStream(peerTracks);
        recordingStream = micStream;
      } else if (captureMode === 'mixed') {
        const peerTracks = this._captureWebRTCStream();
        // Set up audio context before mixing (needed for createMediaStreamSource)
        this._setupAudioAnalysis(micStream);
        recordingStream = this._createMixedStream(micStream, peerTracks);
        // Re-connect analyser to mixed stream so level monitoring reflects combined audio
        if (recordingStream !== micStream && this._audioContext && this._analyserNode) {
          try {
            const mixedSource = this._audioContext.createMediaStreamSource(recordingStream);
            mixedSource.connect(this._analyserNode);
          } catch (e) {
            this._logger.warn('Failed to connect analyser to mixed stream:', e);
          }
        }
      } else {
        // Default: microphone only
        recordingStream = micStream;
      }

      this._stream = recordingStream;

      // Set up audio analysis if not already done (mic-only and webrtc modes)
      if (captureMode !== 'mixed') {
        this._setupAudioAnalysis(this._stream);
      }
      this._startLevelMonitoring();

      this._audioChunks = [];
      this._liveBuffer = [];
      this._totalActiveMs = 0;
      this._lastStartTime = Date.now();
      this._startTime = this._lastStartTime;

      this._startNewRecorder();
      this._state = RecordingState.RECORDING;
      this._callbackSafe('onStateChange', this._state);
      this._emitSafe('audio:recordingStarted', { state: this._state, timestamp: Date.now() });
    } catch (error) {
      this._logger.error('Failed to start recording:', error);
      this._emitSafe('audio:error', { error, context: 'startRecording' });
      throw error;
    }
  }

  /**
   * Capture audio streams from Foundry VTT WebRTC peer connections.
   * Iterates over `game.webrtc.client._peerConnections`, extracts live audio
   * tracks from RTCRtpReceiver objects, and wraps each in a MediaStream.
   *
   * @returns {Array<MediaStreamTrack>|null} Array of live audio tracks from peers, or null if none found
   */
  _captureWebRTCStream() {
    try {
      // _peerConnections is a private Foundry API — may change in future v13.x patches
      const client = globalThis.game?.webrtc?.client;
      const peerConnections = client?._peerConnections ?? client?.peerConnections;
      if (!peerConnections || peerConnections.size === 0) return null;

      const tracks = [];
      for (const [peerId, peerData] of peerConnections) {
        try {
          const pc = peerData?.pc;
          if (!pc?.getReceivers) continue;
          for (const receiver of pc.getReceivers()) {
            if (receiver.track?.kind === 'audio' && receiver.track.readyState === 'live') {
              tracks.push(receiver.track);
            }
          }
        } catch (e) {
          this._logger.warn(`Failed to capture WebRTC stream from peer ${peerId}:`, e);
        }
      }

      if (tracks.length === 0) return null;

      this._emitSafe('audio:webrtcCaptured', { peerCount: tracks.length, timestamp: Date.now() });
      this._logger.debug(`Captured ${tracks.length} WebRTC audio track(s)`);
      return tracks;
    } catch (error) {
      this._logger.warn('WebRTC capture failed:', error);
      return null;
    }
  }

  /**
   * Combine microphone and WebRTC peer audio tracks into a single mixed stream
   * using Web Audio API's MediaStreamDestination node.
   *
   * @param {MediaStream} micStream - Local microphone stream
   * @param {Array<MediaStreamTrack>|null} peerTracks - Remote peer audio tracks
   * @returns {MediaStream} Mixed stream or original mic stream if no peers
   */
  _createMixedStream(micStream, peerTracks) {
    if (!peerTracks || peerTracks.length === 0) return micStream;

    try {
      this._mixDestination = this._audioContext.createMediaStreamDestination();

      // Connect mic stream to destination
      const micSource = this._audioContext.createMediaStreamSource(micStream);
      micSource.connect(this._mixDestination);

      // Connect each peer track to destination
      this._peerSourceNodes = [];
      for (const track of peerTracks) {
        const peerStream = new MediaStream([track]);
        const peerSource = this._audioContext.createMediaStreamSource(peerStream);
        peerSource.connect(this._mixDestination);
        this._peerSourceNodes.push(peerSource);
      }

      this._logger.debug(`Mixed ${peerTracks.length} peer track(s) with microphone`);
      return this._mixDestination.stream;
    } catch (error) {
      this._logger.error('Stream mixing failed, falling back to mic only:', error);
      ui?.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.Warnings.WebRTCMixingFailed') ||
          'VoxChronicle: Could not capture peer audio. Recording microphone only.'
      );
      this._peerSourceNodes = [];
      this._mixDestination = null;
      return micStream;
    }
  }

  /**
   * Detect the optimal audio codec for the current browser.
   * Tests codecs in order of preference: WebM/Opus (Chrome/Firefox/Edge),
   * MP4/AAC (Safari primary), MP4 (Safari fallback), WAV (universal).
   * Respects `preferredCodec` option if the codec is supported.
   *
   * @returns {string} Supported MIME type
   * @throws {Error} If no supported codec is found
   */
  _detectOptimalCodec() {
    const preferred = this._options.preferredCodec;
    if (preferred && MediaRecorder.isTypeSupported(preferred)) {
      this._logger.debug(`Using preferred codec: ${preferred}`);
      return preferred;
    }
    if (preferred) {
      this._logger.warn(`Preferred codec "${preferred}" not supported, auto-detecting`);
    }

    const codecs = ['audio/webm;codecs=opus', 'audio/mp4;codecs=aac', 'audio/mp4', 'audio/wav'];
    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) {
        this._logger.debug(`Auto-detected codec: ${codec}`);
        return codec;
      }
    }
    throw new Error('No supported audio codec found');
  }

  /**
   * Create and start a new MediaRecorder on the current stream.
   * Wires up ondataavailable and onerror handlers.
   * @private
   */
  _startNewRecorder() {
    const mimeType = this._detectedCodec || this._detectOptimalCodec();
    this._detectedCodec = mimeType;
    const options = { mimeType, audioBitsPerSecond: 128000 };
    const recorder = new MediaRecorder(this._stream, options);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this._audioChunks.push(e.data);
        // Cap at 5000 chunks (~13 hours at 10s timeslice) to prevent unbounded growth
        // while preserving enough for stopRecording() to assemble full session audio.
        // Chunks are also persisted to IndexedDB for crash recovery.
        if (this._audioChunks.length > 5000) {
          this._audioChunks = this._audioChunks.slice(-5000);
        }
        this._liveBuffer.push(e.data);
        this._persistChunk(e.data, this._persistChunkIndex++);
        this._callbackSafe('onDataAvailable', e.data);
        this._emitSafe('audio:chunkReady', { size: e.data.size, timestamp: Date.now() });
      }
    };

    recorder.onerror = (event) => {
      this._logger.error('MediaRecorder error:', event.error);
      this._callbackSafe('onError', event.error);
      this._emitSafe('audio:error', { error: event.error, context: 'mediaRecorder' });
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
    if (this._isRotating) {
      this._logger.warn('Rotation already in progress, skipping');
      return null;
    }
    this._isRotating = true;

    try {
      return await new Promise((resolve, reject) => {
        this._rotationResolve = resolve;
        const oldRecorder = this._mediaRecorder;
        const chunkBuffer = [...this._liveBuffer];
        this._liveBuffer = [];
        this._pendingOldRecorder = oldRecorder;

        // Redirect old recorder's final data flush to chunk buffer.
        // W3C spec: stop() fires one last ondataavailable BEFORE the stop event.
        oldRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunkBuffer.push(e.data);
            this._audioChunks.push(e.data);
          }
        };

        try {
          this._startNewRecorder();
        } catch (e) {
          this._logger.error('Failed to start new recorder during rotation:', e);
          this._callbackSafe('onError', e);
          // Restore old recorder so recording can continue
          oldRecorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) {
              this._audioChunks.push(ev.data);
              this._liveBuffer.push(ev.data);
            }
          };
          this._mediaRecorder = oldRecorder;
          this._pendingOldRecorder = null;
          reject(new Error(`Recorder rotation failed: ${e.message}`));
          return;
        }

        this._rotationRejectTimeoutId = setTimeout(() => {
          this._pendingOldRecorder = null;
          this._rotationResolve = null;
          oldRecorder.onstop = null;
          oldRecorder.onerror = null;
          try {
            oldRecorder.stop();
          } catch (e) {
            this._logger.debug('Best-effort stop during rotation timeout:', e.message);
          }
          reject(new Error('Chunk rotation timed out'));
        }, 5000);

        oldRecorder.onstop = () => {
          clearTimeout(this._rotationRejectTimeoutId);
          this._rotationRejectTimeoutId = null;
          this._pendingOldRecorder = null;
          this._rotationResolve = null;
          const blob = new Blob(chunkBuffer, { type: oldRecorder.mimeType });
          resolve(blob.size > 0 ? blob : null);
        };

        oldRecorder.onerror = (event) => {
          clearTimeout(this._rotationRejectTimeoutId);
          this._rotationRejectTimeoutId = null;
          this._pendingOldRecorder = null;
          this._rotationResolve = null;
          this._logger.error('Old recorder error during rotation:', event.error);
          this._callbackSafe(
            'onError',
            event.error || new Error('MediaRecorder error during rotation')
          );
          resolve(null);
        };

        this._rotationStopTimeoutId = setTimeout(() => {
          try {
            oldRecorder.stop();
          } catch (e) {
            clearTimeout(this._rotationRejectTimeoutId);
            this._rotationRejectTimeoutId = null;
            this._pendingOldRecorder = null;
            this._rotationResolve = null;
            this._logger.warn('Failed to stop old recorder:', e.message);
            this._callbackSafe('onError', e);
            resolve(null);
          }
        }, 100);
      });
    } finally {
      this._isRotating = false;
      if (this._rotationRejectTimeoutId) {
        clearTimeout(this._rotationRejectTimeoutId);
        this._rotationRejectTimeoutId = null;
      }
      if (this._rotationStopTimeoutId) {
        clearTimeout(this._rotationStopTimeoutId);
        this._rotationStopTimeoutId = null;
      }
      this._rotationResolve = null;
    }
  }

  /**
   * Stop recording and return the full session audio as a single blob.
   *
   * @returns {Promise<Blob|null>} The complete session audio blob, or null if inactive.
   * @throws {Error} If the MediaRecorder fails to stop or times out.
   */
  async stopRecording() {
    if (this._state === RecordingState.INACTIVE) return null;

    // Abort any in-flight rotation first to prevent data loss
    this._abortPendingRotation();

    this._stopLevelMonitoring();
    if (this._lastStartTime) this._totalActiveMs += Date.now() - this._lastStartTime;

    const mimeType = this._mediaRecorder?.mimeType; // capture before cleanup

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._emitSafe('audio:recordingStopped', {
          state: RecordingState.INACTIVE,
          error: 'timeout',
          timestamp: Date.now()
        });
        this.clearPersistedChunks();
        this._cleanup();
        reject(new Error('Stop recording timed out'));
      }, 5000);

      if (!this._mediaRecorder) {
        clearTimeout(timeout);
        this._cleanup();
        reject(new Error('MediaRecorder was nulled before stop could complete (race with cancel)'));
        return;
      }

      this._mediaRecorder.onstop = () => {
        clearTimeout(timeout);
        const fullBlob = new Blob(this._audioChunks, { type: mimeType });
        this.clearPersistedChunks();
        this._cleanup();
        this._emitSafe('audio:recordingStopped', {
          state: RecordingState.INACTIVE,
          size: fullBlob.size,
          timestamp: Date.now()
        });
        resolve(fullBlob);
      };

      this._mediaRecorder.onerror = (event) => {
        clearTimeout(timeout);
        this._emitSafe('audio:recordingStopped', {
          state: RecordingState.INACTIVE,
          error: event.error?.message || 'unknown',
          timestamp: Date.now()
        });
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
    this._totalActiveMs += Date.now() - this._lastStartTime;
    this._lastStartTime = null;
    this._mediaRecorder.pause();
    this._state = RecordingState.PAUSED;
    this._callbackSafe('onStateChange', this._state);
    this._emitSafe('audio:recordingPaused', { state: this._state, timestamp: Date.now() });
  }

  /**
   * Resume a paused recording. Duration tracking resumes.
   */
  resume() {
    if (this._state !== RecordingState.PAUSED) return;
    this._lastStartTime = Date.now();
    this._mediaRecorder.resume();
    this._state = RecordingState.RECORDING;
    this._callbackSafe('onStateChange', this._state);
    this._emitSafe('audio:recordingResumed', { state: this._state, timestamp: Date.now() });
  }

  /**
   * Cancel the recording, discarding all captured audio.
   * Stops the recorder and cleans up without returning a blob.
   * Called by VoxChronicle.destroy() and SessionOrchestrator error paths.
   */
  cancel() {
    if (this._state === RecordingState.INACTIVE) return;
    this._stopLevelMonitoring();
    this._abortPendingRotation();
    try {
      this._mediaRecorder?.stop();
    } catch (e) {
      this._logger.debug('MediaRecorder.stop() during cancel:', e.message);
    }
    this.clearPersistedChunks();
    this._cleanup();
  }

  /**
   * Abort any in-flight chunk rotation, stopping the old recorder
   * and clearing associated timers.
   * @private
   */
  _abortPendingRotation() {
    // Settle any pending rotation Promise BEFORE destroying handlers,
    // otherwise the Promise hangs forever and `finally` never runs.
    if (this._rotationResolve) {
      this._rotationResolve(null);
      this._rotationResolve = null;
    }
    if (this._rotationStopTimeoutId) {
      clearTimeout(this._rotationStopTimeoutId);
      this._rotationStopTimeoutId = null;
    }
    if (this._rotationRejectTimeoutId) {
      clearTimeout(this._rotationRejectTimeoutId);
      this._rotationRejectTimeoutId = null;
    }
    if (this._pendingOldRecorder) {
      this._pendingOldRecorder.onstop = null;
      this._pendingOldRecorder.onerror = null;
      try {
        this._pendingOldRecorder.stop();
      } catch (e) {
        this._logger.debug('Pending old recorder stop during abort:', e.message);
      }
      this._pendingOldRecorder = null;
    }
    this._isRotating = false;
  }

  /**
   * Initialize IndexedDB for crash recovery persistence.
   * @param {string} sessionId - Unique session identifier
   * @returns {Promise<void>}
   */
  async _initPersistence(sessionId) {
    this._persistSessionId = sessionId;
    this._persistChunkIndex = 0;

    try {
      this._persistDB = await new Promise((resolve, reject) => {
        const request = indexedDB.open('vox-chronicle-audio-recovery', 1);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('chunks')) {
            db.createObjectStore('chunks');
          }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (error) {
      this._logger.warn('IndexedDB init failed, crash recovery unavailable:', error);
      this._persistDB = null;
    }
  }

  /**
   * Persist a chunk to IndexedDB for crash recovery.
   * @param {Blob} blob - Audio chunk data
   * @param {number} index - Chunk index
   */
  _persistChunk(blob, index) {
    if (!this._persistDB) return;
    try {
      const tx = this._persistDB.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');
      store.put(
        { data: blob, index, sessionId: this._persistSessionId, timestamp: Date.now() },
        `chunk-${this._persistSessionId}-${index}`
      );
    } catch (error) {
      this._logger.warn('Failed to persist chunk:', error);
    }
  }

  /**
   * Recover persisted chunks from IndexedDB after a crash.
   * @returns {Promise<Array<{data: Blob, index: number}>>} Recovered chunks sorted by index
   */
  async recoverChunks() {
    if (!this._persistDB) return [];
    try {
      const tx = this._persistDB.transaction('chunks', 'readonly');
      const store = tx.objectStore('chunks');
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = (event) => {
          const chunks = event.target.result || [];
          chunks.sort((a, b) => a.index - b.index);
          resolve(chunks);
        };
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (error) {
      this._logger.warn('Failed to recover chunks:', error);
      return [];
    }
  }

  /**
   * Clear all persisted chunks from IndexedDB.
   * Called on successful stop/cancel to clean up recovery data.
   */
  clearPersistedChunks() {
    if (!this._persistDB) return;
    try {
      const tx = this._persistDB.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');
      store.clear();
    } catch (error) {
      this._logger.warn('Failed to clear persisted chunks:', error);
    }
  }

  /**
   * Release all resources: stop stream tracks, close AudioContext,
   * null out references, and transition to INACTIVE.
   * @private
   */
  _cleanup() {
    this._stopLevelMonitoring();
    this._abortPendingRotation();

    if (this._mediaRecorder?.state !== 'inactive') {
      try {
        this._mediaRecorder.stop();
      } catch (e) {
        this._logger.debug('MediaRecorder.stop() during cleanup:', e.message);
      }
    }

    if (this._stream) this._stream.getTracks().forEach((t) => t.stop());

    // Disconnect WebRTC peer source nodes
    for (const node of this._peerSourceNodes) {
      try {
        node.disconnect();
      } catch (e) {
        this._logger.debug('Peer source disconnect during cleanup:', e.message);
      }
    }
    this._peerSourceNodes = [];
    this._mixDestination = null;

    if (this._audioContext) {
      try {
        this._audioContext.close();
      } catch (e) {
        this._logger.debug('AudioContext.close() during cleanup:', e.message);
      }
    }

    this._stream = null;
    this._mediaRecorder = null;
    this._audioContext = null;
    this._analyserNode = null;
    this._sourceNode = null;
    this._audioChunks = [];
    this._liveBuffer = [];
    this._totalActiveMs = 0;
    this._lastStartTime = null;
    this._startTime = null;
    this._lastAudioLevel = 0;
    this._detectedCodec = null;
    this._state = RecordingState.INACTIVE;
    this._callbackSafe('onStateChange', this._state);
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
    } catch (e) {
      this._logger.warn('Audio analysis setup failed:', e);
    }
  }

  /**
   * Start the requestAnimationFrame loop that reads audio levels
   * and fires the onLevelChange callback.
   * @private
   */
  _startLevelMonitoring() {
    // Pre-allocate typed array once — reused across all animation frames
    const data = this._analyserNode ? new Uint8Array(this._analyserNode.frequencyBinCount) : null;
    const monitor = () => {
      if (this._state === RecordingState.RECORDING && this._analyserNode && data) {
        try {
          this._analyserNode.getByteFrequencyData(data);
          const sum = data.reduce((a, b) => a + b, 0);
          this._lastAudioLevel = Math.min(1, sum / (data.length * 128));
          this._callbackSafe('onLevelChange', this._lastAudioLevel);
          this._emitSafe('audio:levelChange', { level: this._lastAudioLevel });
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
   * Get the current audio input level (0–1 range).
   * Updated every animation frame during recording via the level monitor.
   * @returns {number} Current audio level between 0 and 1.
   */
  getAudioLevel() {
    return this._lastAudioLevel || 0;
  }
}

export { AudioRecorder, RecordingState };
