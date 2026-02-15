/**
 * SessionOrchestrator - Complete RPG Session Workflow Management
 *
 * Orchestrates RPG session processing from recording through transcription,
 * entity extraction, image generation, and publication to Kanka.io.
 *
 * @class SessionOrchestrator
 */
import { Logger } from '../utils/Logger.mjs';
import { TranscriptionProcessor } from './TranscriptionProcessor.mjs';
import { EntityProcessor } from './EntityProcessor.mjs';
import { ImageProcessor } from './ImageProcessor.mjs';
import { KankaPublisher } from './KankaPublisher.mjs';

/** Session workflow states */
const SessionState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  PROCESSING: 'processing',
  EXTRACTING: 'extracting',
  GENERATING_IMAGES: 'generating_images',
  PUBLISHING: 'publishing',
  COMPLETE: 'complete',
  ERROR: 'error',
  LIVE_LISTENING: 'live_listening',
  LIVE_TRANSCRIBING: 'live_transcribing',
  LIVE_ANALYZING: 'live_analyzing'
};

const DEFAULT_SESSION_OPTIONS = {
  autoExtractEntities: true,
  autoExtractRelationships: true,
  autoGenerateImages: true,
  autoPublishToKanka: false,
  confirmEntityCreation: true,
  maxImagesPerSession: 5,
  imageQuality: 'standard',
  includeTranscriptInChronicle: true,
  chronicleFormat: 'full'
};

/**
 * SessionOrchestrator class for managing complete RPG session workflows
 *
 * @example
 * const orchestrator = new SessionOrchestrator(services, options);
 * await orchestrator.startSession({ title: 'Session 1' });
 */
class SessionOrchestrator {
  _logger = Logger.createChild('SessionOrchestrator');
  _audioRecorder = null;
  _transcriptionService = null;
  _entityExtractor = null;
  _imageGenerationService = null;
  _kankaService = null;
  _narrativeExporter = null;
  _state = SessionState.IDLE;
  _currentSession = null;
  _callbacks = {
    onStateChange: null,
    onProgress: null,
    onError: null,
    onSessionComplete: null,
    onSilenceDetected: null
  };

  // Live mode services
  _aiAssistant = null;
  _chapterTracker = null;
  _sceneDetector = null;
  _sessionAnalytics = null;

  // Live mode state
  _liveMode = false;
  _liveCycleTimer = null;
  _liveBatchDuration = 10000;
  _liveTranscript = [];
  _silenceStartTime = null;
  _silenceThreshold = 30000;
  _lastAISuggestions = null;
  _lastOffTrackStatus = null;
  _transcriptionConfig = null;
  _transcriptionProcessor = null;
  _entityProcessor = null;
  _imageProcessor = null;
  _kankaPublisher = null;
  _options = {};

  /**
   * Create a new SessionOrchestrator instance
   *
   * @param {object} [services={}] - Service instances (audioRecorder, transcriptionService,
   * entityExtractor, imageGenerationService, kankaService, narrativeExporter)
   * @param {object} [options={}] - Configuration options (see DEFAULT_SESSION_OPTIONS)
   */
  constructor(services = {}, options = {}) {
    this._audioRecorder = services.audioRecorder || null;
    this._transcriptionService = services.transcriptionService || null;
    this._entityExtractor = services.entityExtractor || null;
    this._imageGenerationService = services.imageGenerationService || null;
    this._kankaService = services.kankaService || null;
    this._narrativeExporter = services.narrativeExporter || null;
    this._aiAssistant = services.aiAssistant || null;
    this._chapterTracker = services.chapterTracker || null;
    this._sceneDetector = services.sceneDetector || null;
    this._sessionAnalytics = services.sessionAnalytics || null;
    this._options = { ...DEFAULT_SESSION_OPTIONS, ...options };
    this._initializeProcessors();
    this._logger.debug('SessionOrchestrator initialized');
  }

  _initializeProcessors() {
    this._transcriptionProcessor = this._transcriptionService
      ? new TranscriptionProcessor({
          transcriptionService: this._transcriptionService,
          config: this._transcriptionConfig
        })
      : null;

    this._entityProcessor = this._entityExtractor
      ? new EntityProcessor({
          entityExtractor: this._entityExtractor,
          kankaService: this._kankaService
        })
      : null;

    this._imageProcessor = this._imageGenerationService
      ? new ImageProcessor({
          imageGenerationService: this._imageGenerationService,
          options: {
            maxImagesPerSession: this._options.maxImagesPerSession,
            imageQuality: this._options.imageQuality
          }
        })
      : null;

    this._kankaPublisher = this._kankaService
      ? new KankaPublisher(this._kankaService, this._narrativeExporter, {
          chronicleFormat: this._options.chronicleFormat
        })
      : null;

    this._logger.debug('Processors initialized');
  }

  get state() {
    return this._state;
  }
  get currentSession() {
    return this._currentSession;
  }
  get isSessionActive() {
    return (
      this._state !== SessionState.IDLE &&
      this._state !== SessionState.COMPLETE &&
      this._state !== SessionState.ERROR
    );
  }
  get isRecording() {
    return this._state === SessionState.RECORDING || this._state === SessionState.PAUSED;
  }

  /**
   * Set event callback handlers
   *
   * @param {object} callbacks - Callback functions (onStateChange, onProgress, onError, onSessionComplete)
   */
  setCallbacks(callbacks) {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  _updateState(newState, data = {}) {
    const oldState = this._state;
    this._state = newState;
    this._logger.debug(`State changed: ${oldState} -> ${newState}`);
    if (this._callbacks.onStateChange) {
      this._callbacks.onStateChange(newState, oldState, data);
    }
  }

  _reportProgress(stage, progress, message = '') {
    if (this._callbacks.onProgress) {
      this._callbacks.onProgress({
        stage,
        progress,
        message,
        state: this._state,
        session: this._currentSession
      });
    }
  }

  /**
   * Start a new recording session
   *
   * @param {object} [sessionOptions={}] - Session configuration (title, date, speakerMap, language, recordingOptions)
   * @returns {Promise<void>}
   * @throws {Error} If session already active or audio recorder not configured
   */
  async startSession(sessionOptions = {}) {
    if (this.isSessionActive) {
      throw new Error('A session is already active. Stop or cancel the current session first.');
    }
    if (!this._audioRecorder) {
      throw new Error('Audio recorder not configured. Cannot start session.');
    }

    this._logger.log('Starting new session...');

    try {
      this._currentSession = {
        id: this._generateSessionId(),
        title: sessionOptions.title || `Session ${new Date().toLocaleDateString()}`,
        date: sessionOptions.date || new Date().toISOString().split('T')[0],
        startTime: Date.now(),
        endTime: null,
        speakerMap: sessionOptions.speakerMap || {},
        language: sessionOptions.language || null,
        audioBlob: null,
        transcript: null,
        entities: null,
        relationships: null,
        moments: null,
        images: [],
        chronicle: null,
        kankaResults: null,
        errors: []
      };

      await this._audioRecorder.startRecording(sessionOptions.recordingOptions || {});
      this._updateState(SessionState.RECORDING, { session: this._currentSession });
      this._logger.log(`Session started: ${this._currentSession.title}`);
    } catch (error) {
      this._logger.error('Failed to start session:', error);
      this._handleError(error, 'startSession');
      throw error;
    }
  }

  /**
   * Stop the current recording session and optionally process the audio
   *
   * @param {object} [options={}] - Stop options (processImmediately)
   * @returns {Promise<object>} Current session data
   * @throws {Error} If no recording in progress
   */
  async stopSession(options = {}) {
    if (!this.isRecording) {
      throw new Error('No recording in progress to stop.');
    }

    this._logger.log('Stopping session...');

    try {
      const audioBlob = await this._audioRecorder.stopRecording();
      this._currentSession.endTime = Date.now();
      this._currentSession.audioBlob = audioBlob;

      this._logger.log(`Recording stopped. Duration: ${this._getSessionDuration()}s`);

      if (options.processImmediately ?? true) {
        await this.processTranscription();
      } else {
        this._updateState(SessionState.IDLE, { session: this._currentSession });
      }

      return this._currentSession;
    } catch (error) {
      this._logger.error('Failed to stop session:', error);
      this._handleError(error, 'stopSession');
      throw error;
    }
  }

  pauseRecording() {
    if (this._state !== SessionState.RECORDING) {
      throw new Error('Cannot pause - not currently recording.');
    }
    if (this._audioRecorder?.pause) {
      this._audioRecorder.pause();
      this._updateState(SessionState.PAUSED);
      this._logger.log('Recording paused');
    }
  }

  resumeRecording() {
    if (this._state !== SessionState.PAUSED) {
      throw new Error('Cannot resume - recording is not paused.');
    }
    if (this._audioRecorder?.resume) {
      this._audioRecorder.resume();
      this._updateState(SessionState.RECORDING);
      this._logger.log('Recording resumed');
    }
  }

  cancelSession() {
    if (!this.isSessionActive) return;
    this._logger.log('Cancelling session...');
    if (this._audioRecorder?.cancel) {
      this._audioRecorder.cancel();
    }
    this._currentSession = null;
    this._updateState(SessionState.IDLE);
    this._logger.log('Session cancelled');
  }

  /**
   * Process transcription for the current session
   *
   * @param {object} [options={}] - Transcription options (speakerMap, language)
   * @returns {Promise<object>} Transcription result
   * @throws {Error} If no audio blob available or transcription service not configured
   */
  async processTranscription(options = {}) {
    if (!this._currentSession?.audioBlob) {
      throw new Error('No audio blob available for transcription.');
    }
    if (!this._transcriptionProcessor) {
      throw new Error('Transcription service not configured.');
    }

    this._logger.log('Processing transcription...');
    this._updateState(SessionState.PROCESSING);

    try {
      const transcriptResult = await this._transcriptionProcessor.processTranscription(
        this._currentSession.audioBlob,
        {
          speakerMap: options.speakerMap || this._currentSession.speakerMap || {},
          language: options.language || this._currentSession.language,
          onProgress: (progress, message) =>
            this._reportProgress('transcription', progress, message)
        }
      );

      this._currentSession.transcript = transcriptResult;
      this._logger.log(
        `Transcription complete: ${transcriptResult.segments?.length || 0} segments`
      );

      if (this._options.autoExtractEntities && this._entityProcessor) {
        await this._extractEntities();
      }

      if (this._options.autoGenerateImages && this._imageProcessor) {
        await this._generateImages();
      }

      this._updateState(SessionState.COMPLETE, { session: this._currentSession });

      if (this._callbacks.onSessionComplete) {
        this._callbacks.onSessionComplete(this._currentSession);
      }

      return transcriptResult;
    } catch (error) {
      this._logger.error('Transcription failed:', error);
      this._handleError(error, 'processTranscription');
      throw error;
    }
  }

  async _extractEntities(options = {}) {
    if (!this._currentSession?.transcript?.text) {
      this._logger.warn('No transcript text available for entity extraction');
      return null;
    }
    if (!this._entityProcessor) {
      this._logger.warn('Entity processor not configured');
      return null;
    }

    this._logger.log('Extracting entities...');
    this._updateState(SessionState.EXTRACTING);

    const extractionResult = await this._entityProcessor.extractEntities(
      this._currentSession.transcript.text,
      {
        ...options,
        onProgress: (progress, message) => this._reportProgress('extraction', progress, message)
      }
    );

    if (!extractionResult) {
      this._currentSession.errors.push({
        stage: 'extraction',
        error: 'Entity extraction failed',
        timestamp: Date.now()
      });
      return null;
    }

    this._currentSession.entities = {
      characters: extractionResult.characters || [],
      locations: extractionResult.locations || [],
      items: extractionResult.items || []
    };
    this._currentSession.moments = extractionResult.moments || [];

    this._logger.log(
      `Extracted ${extractionResult.totalCount || 0} entities, ` +
        `${this._currentSession.moments.length} salient moments`
    );

    if (this._options.autoExtractRelationships) {
      await this._extractRelationships(extractionResult);
    }

    return extractionResult;
  }

  async _extractRelationships(extractionResult) {
    if (!this._currentSession?.transcript?.text || !this._entityProcessor) {
      this._logger.warn('Cannot extract relationships - missing transcript or processor');
      return null;
    }

    this._logger.log('Extracting relationships...');

    const allEntities = [
      ...(extractionResult.characters || []),
      ...(extractionResult.locations || []),
      ...(extractionResult.items || [])
    ];

    if (allEntities.length === 0) {
      this._logger.debug('No entities to extract relationships for');
      return [];
    }

    const relationships = await this._entityProcessor.extractRelationships(
      this._currentSession.transcript.text,
      extractionResult,
      {
        campaignContext: this._currentSession.title,
        minConfidence: 5,
        onProgress: (progress, message) => this._reportProgress('extraction', progress, message)
      }
    );

    if (relationships) {
      this._currentSession.relationships = relationships;
      this._logger.log(`Extracted ${relationships.length} relationships`);
    } else {
      this._currentSession.errors.push({
        stage: 'relationship_extraction',
        error: 'Relationship extraction failed',
        timestamp: Date.now()
      });
    }

    return relationships || [];
  }

  async _generateImages() {
    if (!this._imageProcessor) {
      this._logger.warn('Image processor not configured');
      return [];
    }

    this._logger.log('Generating images...');
    this._updateState(SessionState.GENERATING_IMAGES);

    const results = await this._imageProcessor.generateImages(
      this._currentSession.moments || [],
      this._currentSession.entities || {},
      {
        maxImagesPerSession: this._options.maxImagesPerSession,
        imageQuality: this._options.imageQuality,
        onProgress: (progress, message) => this._reportProgress('images', progress, message)
      }
    );

    if (results && results.length > 0) {
      this._currentSession.images = results;
      this._logger.log(`Generated ${results.filter((r) => r.success !== false).length} images`);
    } else {
      this._currentSession.errors.push({
        stage: 'image_generation',
        error: 'Image generation failed',
        timestamp: Date.now()
      });
    }

    return results;
  }

  /**
   * Publish the session to Kanka
   *
   * @param {object} [options={}] - Publishing options (createEntities, uploadImages, createChronicle)
   * @returns {Promise<object>} Publishing results
   * @throws {Error} If no session data or Kanka service not configured
   */
  async publishToKanka(options = {}) {
    if (!this._currentSession) {
      throw new Error('No session data available to publish.');
    }
    if (!this._kankaPublisher) {
      throw new Error('Kanka service not configured.');
    }

    this._logger.log('Publishing to Kanka...');
    this._updateState(SessionState.PUBLISHING);

    try {
      const results = await this._kankaPublisher.publishSession(this._currentSession, {
        createEntities: options.createEntities ?? true,
        uploadImages: options.uploadImages ?? true,
        createChronicle: options.createChronicle ?? true,
        onProgress: (progress, message) => this._reportProgress('publishing', progress, message)
      });

      this._currentSession.kankaResults = results;
      if (results.journal) {
        this._currentSession.chronicle = results.journal;
      }

      this._logger.log('Published to Kanka successfully');
      return results;
    } catch (error) {
      this._logger.error('Publishing failed:', error);
      this._handleError(error, 'publishToKanka');
      throw error;
    }
  }

  setServices(services) {
    if (services.audioRecorder !== undefined) this._audioRecorder = services.audioRecorder;
    if (services.transcriptionService !== undefined) {
      this._transcriptionService = services.transcriptionService;
    }
    if (services.entityExtractor !== undefined) this._entityExtractor = services.entityExtractor;
    if (services.imageGenerationService !== undefined) {
      this._imageGenerationService = services.imageGenerationService;
    }
    if (services.kankaService !== undefined) this._kankaService = services.kankaService;
    if (services.narrativeExporter !== undefined) {
      this._narrativeExporter = services.narrativeExporter;
    }
    if (services.aiAssistant !== undefined) this._aiAssistant = services.aiAssistant;
    if (services.chapterTracker !== undefined) this._chapterTracker = services.chapterTracker;
    if (services.sceneDetector !== undefined) this._sceneDetector = services.sceneDetector;
    if (services.sessionAnalytics !== undefined) this._sessionAnalytics = services.sessionAnalytics;

    this._initializeProcessors();
    this._logger.debug('Services updated');
  }

  setOptions(options) {
    this._options = { ...this._options, ...options };
    this._logger.debug('Options updated');
  }

  setTranscriptionConfig(config) {
    this._transcriptionConfig = config;
    if (this._transcriptionService) {
      this._transcriptionProcessor = new TranscriptionProcessor({
        transcriptionService: this._transcriptionService,
        config: this._transcriptionConfig
      });
    }
    this._logger.debug('Transcription config updated for fallback support');
  }

  /**
   * Set narrator services after initialization
   * @param {object} services - Narrator service instances
   */
  setNarratorServices(services = {}) {
    if (services.aiAssistant) this._aiAssistant = services.aiAssistant;
    if (services.chapterTracker) this._chapterTracker = services.chapterTracker;
    if (services.sceneDetector) this._sceneDetector = services.sceneDetector;
    if (services.sessionAnalytics) this._sessionAnalytics = services.sessionAnalytics;
    this._logger.debug('Narrator services connected');
  }

  getOptions() {
    return { ...this._options };
  }

  getServicesStatus() {
    return {
      audioRecorder: !!this._audioRecorder,
      transcriptionService: !!this._transcriptionService,
      entityExtractor: !!this._entityExtractor,
      imageGenerationService: !!this._imageGenerationService,
      kankaService: !!this._kankaService,
      narrativeExporter: !!this._narrativeExporter,
      canRecord: !!this._audioRecorder,
      canTranscribe: !!this._transcriptionService,
      canPublish: !!this._kankaService,
      aiAssistant: !!this._aiAssistant,
      chapterTracker: !!this._chapterTracker,
      sceneDetector: !!this._sceneDetector,
      sessionAnalytics: !!this._sessionAnalytics,
      canLiveMode: !!this._audioRecorder && !!this._transcriptionService && !!this._aiAssistant
    };
  }

  _generateSessionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `session-${timestamp}-${random}`;
  }

  _getSessionDuration() {
    if (!this._currentSession?.startTime) return 0;
    const endTime = this._currentSession.endTime || Date.now();
    return Math.floor((endTime - this._currentSession.startTime) / 1000);
  }

  _handleError(error, stage) {
    this._updateState(SessionState.ERROR, { error, stage });
    if (this._currentSession) {
      this._currentSession.errors.push({ stage, error: error.message, timestamp: Date.now() });
    }
    if (this._callbacks.onError) {
      this._callbacks.onError(error, stage);
    }
  }

  reset() {
    if (this._liveCycleTimer) {
      clearTimeout(this._liveCycleTimer);
      this._liveCycleTimer = null;
    }
    this._liveMode = false;
    this._liveTranscript = [];
    this._silenceStartTime = null;
    this._lastAISuggestions = null;
    this._lastOffTrackStatus = null;

    if (this._audioRecorder?.cancel) {
      this._audioRecorder.cancel();
    }
    this._currentSession = null;
    this._state = SessionState.IDLE;
    this._logger.debug('Orchestrator reset');
  }

  /**
   * Check if live mode is active
   * @returns {boolean}
   */
  get isLiveMode() {
    return this._liveMode;
  }

  /**
   * Start live mode - periodic transcription + AI analysis
   * @param {object} [options={}] - Live mode options
   * @returns {Promise<void>}
   */
  async startLiveMode(options = {}) {
    if (this._liveMode) {
      throw new Error('Live mode is already active.');
    }
    if (!this._audioRecorder) {
      throw new Error('Audio recorder not configured.');
    }
    if (!this._transcriptionService) {
      throw new Error('Transcription service not configured for live mode.');
    }

    this._logger.log('Starting live mode...');
    this._liveMode = true;
    this._liveBatchDuration = options.batchDuration || this._liveBatchDuration;
    this._liveTranscript = [];
    this._silenceStartTime = null;
    this._lastAISuggestions = null;
    this._lastOffTrackStatus = null;

    if (!this._currentSession) {
      this._currentSession = {
        id: this._generateSessionId(),
        title: options.title || `Live Session ${new Date().toLocaleDateString()}`,
        date: new Date().toISOString().split('T')[0],
        startTime: Date.now(),
        endTime: null,
        speakerMap: options.speakerMap || {},
        language: options.language || null,
        audioBlob: null,
        transcript: null,
        entities: null,
        relationships: null,
        moments: null,
        images: [],
        chronicle: null,
        kankaResults: null,
        errors: []
      };
    }

    try {
      await this._audioRecorder.startRecording(options.recordingOptions || {});
      this._updateState(SessionState.LIVE_LISTENING);
      this._scheduleLiveCycle();
      this._logger.log('Live mode started');
    } catch (error) {
      this._liveMode = false;
      this._logger.error('Failed to start live mode:', error);
      this._handleError(error, 'startLiveMode');
      throw error;
    }
  }

  /**
   * Stop live mode
   * @returns {Promise<object>} Session data with accumulated transcript
   */
  async stopLiveMode() {
    if (!this._liveMode) {
      throw new Error('Live mode is not active.');
    }

    this._logger.log('Stopping live mode...');
    this._liveMode = false;

    if (this._liveCycleTimer) {
      clearTimeout(this._liveCycleTimer);
      this._liveCycleTimer = null;
    }

    try {
      const audioBlob = await this._audioRecorder.stopRecording();
      if (this._currentSession) {
        this._currentSession.endTime = Date.now();
        this._currentSession.audioBlob = audioBlob;
        if (this._liveTranscript.length > 0) {
          this._currentSession.transcript = {
            text: this._liveTranscript.map(s => s.text).join(' '),
            segments: this._liveTranscript,
            language: this._currentSession.language
          };
        }
      }

      this._updateState(SessionState.IDLE);
      this._logger.log('Live mode stopped');
      return this._currentSession;
    } catch (error) {
      this._logger.error('Failed to stop live mode:', error);
      this._handleError(error, 'stopLiveMode');
      throw error;
    }
  }

  /**
   * Schedule next live cycle iteration
   * @private
   */
  _scheduleLiveCycle() {
    if (!this._liveMode) return;
    this._liveCycleTimer = setTimeout(() => this._liveCycle(), this._liveBatchDuration);
  }

  /**
   * Single live transcription + analysis cycle
   * @private
   */
  async _liveCycle() {
    if (!this._liveMode) return;

    try {
      this._updateState(SessionState.LIVE_TRANSCRIBING);

      const audioChunk = this._audioRecorder.getLatestChunk
        ? await this._audioRecorder.getLatestChunk()
        : null;

      if (audioChunk && audioChunk.size > 0) {
        this._silenceStartTime = null;

        const result = await this._transcriptionService.transcribe(audioChunk, {
          language: this._currentSession?.language,
          speakerMap: this._currentSession?.speakerMap
        });

        if (result?.segments?.length > 0) {
          this._liveTranscript.push(...result.segments);

          if (this._sessionAnalytics) {
            this._sessionAnalytics.addSegment(result.segments);
          }

          if (this._sceneDetector) {
            this._sceneDetector.analyzeText(result.text || '');
          }

          this._updateState(SessionState.LIVE_ANALYZING);
          await this._runAIAnalysis(result);
        }
      } else {
        this._handleSilence();
      }
    } catch (error) {
      this._logger.error('Live cycle error:', error);
      if (this._currentSession) {
        this._currentSession.errors.push({
          stage: 'live_cycle',
          error: error.message,
          timestamp: Date.now()
        });
      }
      if (this._callbacks.onError) {
        this._callbacks.onError(error, 'live_cycle');
      }
    }

    this._updateState(SessionState.LIVE_LISTENING);
    this._scheduleLiveCycle();
  }

  /**
   * Run AI analysis on transcription result
   * @param {object} transcriptionResult - Transcription result
   * @private
   */
  async _runAIAnalysis(transcriptionResult) {
    if (!this._aiAssistant) return;

    try {
      const fullText = this._liveTranscript.map(s => s.text).join(' ');

      const suggestions = await this._aiAssistant.generateSuggestions(fullText, {
        currentChapter: this._chapterTracker?.getCurrentChapter?.() || null
      });

      if (suggestions) {
        this._lastAISuggestions = suggestions;
      }

      const offTrack = await this._aiAssistant.detectOffTrack?.({
        transcript: fullText
      });

      if (offTrack !== undefined) {
        this._lastOffTrackStatus = offTrack;
      }
    } catch (error) {
      this._logger.error('AI analysis error:', error.message);
      if (this._callbacks.onError) {
        this._callbacks.onError(error, 'ai_analysis');
      }
    }
  }

  /**
   * Handle silence detection
   * @private
   */
  _handleSilence() {
    if (!this._silenceStartTime) {
      this._silenceStartTime = Date.now();
      return;
    }

    const silenceDuration = Date.now() - this._silenceStartTime;
    if (silenceDuration >= this._silenceThreshold) {
      this._logger.debug('Silence detected for over 30s');
      if (this._callbacks.onSilenceDetected) {
        this._callbacks.onSilenceDetected(silenceDuration);
      }
    }
  }

  /**
   * Update chapter from scene change
   * @param {object} scene - Foundry scene object
   */
  updateChapter(scene) {
    if (this._chapterTracker) {
      this._chapterTracker.updateFromScene(scene);
    }
  }

  /**
   * Get current AI suggestions
   * @returns {object|null} Latest AI suggestions
   */
  getAISuggestions() {
    return this._lastAISuggestions;
  }

  /**
   * Get current off-track status
   * @returns {object|null} Latest off-track detection result
   */
  getOffTrackStatus() {
    return this._lastOffTrackStatus;
  }

  /**
   * Get current chapter info
   * @returns {object|null} Current chapter info
   */
  getCurrentChapter() {
    return this._chapterTracker?.getCurrentChapter?.() || null;
  }

  getSessionSummary() {
    if (!this._currentSession) return null;

    return {
      id: this._currentSession.id,
      title: this._currentSession.title,
      date: this._currentSession.date,
      state: this._state,
      duration: this._getSessionDuration(),
      hasAudio: !!this._currentSession.audioBlob,
      hasTranscript: !!this._currentSession.transcript,
      segmentCount: this._currentSession.transcript?.segments?.length || 0,
      entityCount: this._currentSession.entities
        ? (this._currentSession.entities.characters?.length || 0) +
          (this._currentSession.entities.locations?.length || 0) +
          (this._currentSession.entities.items?.length || 0)
        : 0,
      relationshipCount: this._currentSession.relationships?.length || 0,
      momentCount: this._currentSession.moments?.length || 0,
      imageCount: this._currentSession.images?.filter((i) => i.success !== false).length || 0,
      hasChronicle: !!this._currentSession.chronicle,
      errorCount: this._currentSession.errors?.length || 0
    };
  }
}

export { SessionOrchestrator, SessionState, DEFAULT_SESSION_OPTIONS };
