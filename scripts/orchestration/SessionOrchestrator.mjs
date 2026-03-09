/**
 * SessionOrchestrator - Complete RPG Session Workflow Management
 *
 * Orchestrates RPG session processing from recording through transcription,
 * entity extraction, image generation, and publication to Kanka.io.
 *
 * @class SessionOrchestrator
 */
import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { TranscriptionProcessor } from './TranscriptionProcessor.mjs';
import { EntityProcessor } from './EntityProcessor.mjs';
import { ImageProcessor } from './ImageProcessor.mjs';
import { KankaPublisher } from './KankaPublisher.mjs';
import { NPCProfileExtractor } from '../narrator/NPCProfileExtractor.mjs';
import { CostTracker } from './CostTracker.mjs';

/** Maximum segments in _liveTranscript rolling window */
const MAX_LIVE_SEGMENTS = 100;

/** Maximum cycle durations to track for self-monitoring */
const MAX_CYCLE_DURATIONS = 20;

/** Shutdown deadline in milliseconds */
const SHUTDOWN_DEADLINE_MS = 5000;

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
  maxImagesPerSession: 3,
  imageQuality: 'high',
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
  _isCycleInFlight = false;
  _callbacks = {
    onStateChange: null,
    onProgress: null,
    onError: null,
    onSessionComplete: null,
    onSessionEnd: null,
    onSilenceDetected: null,
    onAISuggestion: null,
    onStreamToken: null,
    onStreamComplete: null,
    onRulesCard: null
  };

  // Live mode services
  _aiAssistant = null;
  _chapterTracker = null;
  _sceneDetector = null;
  _sessionAnalytics = null;
  _journalParser = null;

  // Rules lookup
  _rulesReference = null;
  _rulesLookupService = null;

  // NPC extraction
  _npcExtractor = null;

  // RAG indexing
  _ragProvider = null;
  _contentHashes = {};
  _reindexInProgress = false;
  _reindexQueue = new Set();

  // Live mode state
  _liveMode = false;
  _isStopping = false;
  _consecutiveLiveCycleErrors = 0;
  _aiAnalysisErrorNotified = false;
  _liveCycleTimer = null;
  _liveBatchDuration = 10000;
  _liveTranscript = [];
  _silenceStartTime = null;
  _silenceThreshold = 30000;
  _lastAISuggestions = null;
  _lastOffTrackStatus = null;
  _transcriptionConfig = null;
  _transcriptionProcessor = null;

  // Lifecycle hardening (Phase 04-02)
  _costTracker = null;
  _shutdownController = null;
  _registeredHooks = new Set();
  _currentCyclePromise = null;
  _fullTranscriptText = '';
  _discardedSegmentCount = 0;
  _cycleDurations = [];
  _sessionStartTime = null;
  _transcriptionHealth = 'healthy';
  _aiSuggestionHealth = 'healthy';
  _transcriptionConsecutiveErrors = 0;
  _aiSuggestionConsecutiveErrors = 0;
  _aiSuggestionsPaused = false;
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
   * @param {object} callbacks - Callback functions (onStateChange, onProgress, onError, onSessionComplete, onSessionEnd)
   */
  setCallbacks(callbacks) {
    this._callbacks = { ...this._callbacks, ...callbacks };
    this._logger.debug(`Callbacks set: ${Object.keys(callbacks).filter(k => callbacks[k]).join(', ')}`);
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
    this._logger.debug(`Progress: [${stage}] ${progress}% — ${message || '(no message)'}`);
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
   * Creates a new session data object with standard defaults.
   *
   * @param {Object} [overrides={}] - Values to override defaults
   * @param {string} [overrides.title] - Session title
   * @param {string} [overrides.date] - Session date (YYYY-MM-DD)
   * @param {Object} [overrides.speakerMap] - Speaker ID to name mapping
   * @param {string} [overrides.language] - Session language code
   * @returns {Object} The session object
   * @private
   */
  _createSessionObject(overrides = {}) {
    return {
      id: this._generateSessionId(),
      title: overrides.title || `Session ${new Date().toLocaleDateString()}`,
      date: overrides.date || new Date().toISOString().split('T')[0],
      startTime: Date.now(),
      endTime: null,
      speakerMap: overrides.speakerMap || {},
      language: overrides.language || null,
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
      this._currentSession = this._createSessionObject({
        title: sessionOptions.title,
        date: sessionOptions.date,
        speakerMap: sessionOptions.speakerMap,
        language: sessionOptions.language
      });

      await this._audioRecorder.startRecording(sessionOptions.recordingOptions || {});
      this._updateState(SessionState.RECORDING, { session: this._currentSession });
      this._logger.log(`Session started: ${this._currentSession.title} (id: ${this._currentSession.id})`);
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

      const blobSizeMB = audioBlob ? (audioBlob.size / (1024 * 1024)).toFixed(2) : '0';
      this._logger.log(`Recording stopped. Duration: ${this._getSessionDuration()}s, audio: ${blobSizeMB}MB`);

      if (options.processImmediately ?? true) {
        await this.processTranscription();
      } else {
        this._updateState(SessionState.IDLE, { session: this._currentSession });
      }

      this._callbacks.onSessionEnd?.();
      return this._currentSession;
    } catch (error) {
      this._logger.error('Failed to stop session:', error);
      this._handleError(error, 'stopSession');
      throw error;
    }
  }

  pauseRecording() {
    if (this._state === SessionState.PAUSED) {
      this._logger.debug('Already paused, ignoring duplicate pauseRecording()');
      return;
    }

    const isLive = this._isLiveState(this._state);

    if (this._state !== SessionState.RECORDING && !isLive) {
      throw new Error('Cannot pause - not currently recording.');
    }

    if (this._audioRecorder?.pause) {
      this._audioRecorder.pause();
    }

    // In live mode, also stop the cycle timer so no transcription fires while paused
    if (isLive && this._liveCycleTimer) {
      clearTimeout(this._liveCycleTimer);
      this._liveCycleTimer = null;
      this._logger.log('Live cycle timer paused');
    }

    this._updateState(SessionState.PAUSED);
    this._logger.log(`Recording paused (was ${isLive ? 'live mode' : 'chronicle mode'})`);
  }

  resumeRecording() {
    if (this._state === SessionState.RECORDING || this._isLiveState(this._state)) {
      this._logger.debug('Already recording/live, ignoring duplicate resumeRecording()');
      return;
    }
    if (this._state !== SessionState.PAUSED) {
      throw new Error('Cannot resume - recording is not paused.');
    }
    if (this._audioRecorder?.resume) {
      this._audioRecorder.resume();
    }

    // If live mode is active, resume the live cycle and restore live state
    if (this._liveMode) {
      this._updateState(SessionState.LIVE_LISTENING);
      this._scheduleLiveCycle();
      this._logger.log('Recording resumed (live mode)');
    } else {
      this._updateState(SessionState.RECORDING);
      this._logger.log('Recording resumed (chronicle mode)');
    }
  }

  cancelSession() {
    if (!this.isSessionActive) return;
    if (this._isStopping) {
      this._logger.warn('cancelSession called while stop in progress, ignoring');
      return;
    }
    this._logger.log(`Cancelling session (from state: ${this._state})...`);

    // Clear live cycle timer to prevent orphaned cycles
    if (this._liveCycleTimer) {
      clearTimeout(this._liveCycleTimer);
      this._liveCycleTimer = null;
    }
    this._liveMode = false;

    // Stop silence monitoring
    if (this._aiAssistant) {
      this._aiAssistant.stopSilenceMonitoring();
      this._logger.debug('Silence monitoring stopped');
    }

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

    const audioSizeMB = (this._currentSession.audioBlob.size / (1024 * 1024)).toFixed(2);
    this._logger.log(`Processing transcription (audio: ${audioSizeMB}MB)...`);
    this._updateState(SessionState.PROCESSING);

    const transcriptionStart = Date.now();
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
      const transcriptionMs = Date.now() - transcriptionStart;
      this._logger.log(
        `Transcription complete: ${transcriptResult.segments?.length || 0} segments in ${transcriptionMs}ms`
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

    this._logger.log(`Extracting entities and moments (text: ${this._currentSession.transcript.text.length} chars)...`);
    this._updateState(SessionState.EXTRACTING);

    const extractionStart = Date.now();
    
    // Use consolidated extraction (Entities + Moments in one call)
    // This reduces API calls and cost by 50% compared to separate calls
    const extractionResult = await this._entityProcessor.extractAll(
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
      ui?.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Warnings.EntityExtractionFailed')
          || 'VoxChronicle: Entity extraction failed. Session will continue without entities.'
      );
      return null;
    }

    this._currentSession.entities = {
      characters: extractionResult.characters || [],
      locations: extractionResult.locations || [],
      items: extractionResult.items || []
    };
    this._currentSession.moments = extractionResult.moments || [];

    const extractionMs = Date.now() - extractionStart;
    this._logger.log(
      `Extracted ${extractionResult.totalCount || 0} entities, ` +
        `${this._currentSession.moments.length} salient moments in ${extractionMs}ms`
    );

    if (this._options.autoExtractRelationships && !extractionResult.warnings?.length) {
      await this._extractRelationships(extractionResult);
    } else if (extractionResult.warnings?.length) {
      this._logger.warn('Skipping relationship extraction due to partial entity extraction failure');
    }

    return extractionResult;
  }

  async _extractRelationships(extractionResult) {
    if (!this._currentSession?.transcript?.text || !this._entityProcessor) {
      this._logger.warn('Cannot extract relationships - missing transcript or processor');
      return null;
    }

    const allEntities = [
      ...(extractionResult.characters || []),
      ...(extractionResult.locations || []),
      ...(extractionResult.items || [])
    ];

    this._logger.log(`Extracting relationships (${allEntities.length} entities)...`);

    if (allEntities.length === 0) {
      this._logger.debug('No entities to extract relationships for');
      return [];
    }

    const relStart = Date.now();
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
      const relMs = Date.now() - relStart;
      this._logger.log(`Extracted ${relationships.length} relationships in ${relMs}ms`);
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

    const momentCount = this._currentSession.moments?.length || 0;
    this._logger.log(`Generating images (${momentCount} moments available)...`);
    this._updateState(SessionState.GENERATING_IMAGES);

    const imageStart = Date.now();
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
      const imageMs = Date.now() - imageStart;
      this._logger.log(`Generated ${results.filter((r) => r.success !== false).length} images in ${imageMs}ms`);
    } else {
      this._currentSession.errors.push({
        stage: 'image_generation',
        error: 'Image generation failed',
        timestamp: Date.now()
      });
      globalThis.ui?.notifications?.warn(
        globalThis.game?.i18n?.localize('VOXCHRONICLE.Warnings.ImageGenerationEmpty')
          || 'VoxChronicle: Image generation produced no results. Try again or check your API key.'
      );
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

    // Enrich session with Foundry journal context for entity validation
    await this._enrichSessionWithJournalContext();

    const publishStart = Date.now();
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

      const publishMs = Date.now() - publishStart;
      this._logger.log(`Published to Kanka in ${publishMs}ms (errors: ${results.errors?.length || 0})`);
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
    const updatedKeys = Object.keys(services).filter(k => services[k] !== undefined);
    this._logger.debug(`Services updated: ${updatedKeys.join(', ')}`);
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
    if (services.journalParser) this._journalParser = services.journalParser;
    // Rules services support explicit null clearing (for when rulesDetection is disabled)
    if (Object.hasOwn(services, 'rulesReference')) this._rulesReference = services.rulesReference;
    if (Object.hasOwn(services, 'rulesLookupService')) this._rulesLookupService = services.rulesLookupService;
    this._logger.debug('Narrator services connected');
  }

  /**
   * Set the RAG provider for journal indexing
   * @param {object} ragProvider - RAGProvider instance with indexDocuments method
   */
  setRAGProvider(ragProvider) {
    this._ragProvider = ragProvider;
    this._logger.debug('RAG provider connected');
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

  /**
   * Check if a state is one of the live mode states
   * @param {string} state
   * @returns {boolean}
   * @private
   */
  _isLiveState(state) {
    return state === SessionState.LIVE_LISTENING ||
           state === SessionState.LIVE_TRANSCRIBING ||
           state === SessionState.LIVE_ANALYZING;
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
    this._logger.debug(`Error handler invoked: stage=${stage}, error=${error.message}`);
    this._updateState(SessionState.ERROR, { error, stage });
    if (this._currentSession) {
      this._currentSession.errors.push({ stage, error: error.message, timestamp: Date.now() });
    }
    if (this._callbacks.onError) {
      this._callbacks.onError(error, stage);
    }
  }

  reset() {
    this._logger.debug(`Resetting orchestrator (from state: ${this._state}, liveMode: ${this._liveMode})`);
    if (this._liveCycleTimer) {
      clearTimeout(this._liveCycleTimer);
      this._liveCycleTimer = null;
    }
    this._liveMode = false;
    this._isStopping = false;
    this._liveTranscript = [];
    this._silenceStartTime = null;
    this._lastAISuggestions = null;
    this._lastOffTrackStatus = null;

    if (this._aiAssistant) {
      this._aiAssistant.stopSilenceMonitoring();
    }
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
   * Check if transcription service is available
   * @returns {boolean}
   */
  get hasTranscriptionService() {
    return !!this._transcriptionService;
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

    const batchDuration = options.batchDuration || this._liveBatchDuration;
    this._logger.log(`Starting live mode (batch interval: ${batchDuration}ms)...`);
    this._liveMode = true;
    this._liveBatchDuration = batchDuration;
    this._liveTranscript = [];
    this._silenceStartTime = null;
    this._lastAISuggestions = null;
    this._lastOffTrackStatus = null;
    this._aiAnalysisErrorNotified = false;
    this._consecutiveLiveCycleErrors = 0;

    // Lifecycle hardening initializations (clean slate guarantee)
    this._costTracker = new CostTracker();
    this._shutdownController = new AbortController();
    this._registeredHooks = new Set();
    this._currentCyclePromise = null;
    this._fullTranscriptText = '';
    this._discardedSegmentCount = 0;
    this._cycleDurations = [];
    this._sessionStartTime = Date.now();
    this._transcriptionHealth = 'healthy';
    this._aiSuggestionHealth = 'healthy';
    this._transcriptionConsecutiveErrors = 0;
    this._aiSuggestionConsecutiveErrors = 0;
    this._aiSuggestionsPaused = false;

    if (!this._currentSession) {
      this._currentSession = this._createSessionObject({
        title: options.title || `Live Session ${new Date().toLocaleDateString()}`,
        speakerMap: options.speakerMap,
        language: options.language
      });
    }

    try {
      this._logger.debug(`Live session created: ${this._currentSession.id}`);

      // Start analytics session so addSegment() works during live cycle
      if (this._sessionAnalytics) {
        this._sessionAnalytics.startSession(this._currentSession.id);
        this._logger.debug('Analytics session started');
      }

      // Wire journal context to AIAssistant for meaningful suggestions
      await this._initializeJournalContext();

      await this._audioRecorder.startRecording(options.recordingOptions || {});
      this._updateState(SessionState.LIVE_LISTENING);
      this._scheduleLiveCycle();

      // Register scene change hook for auto-updating chapter during live mode
      this._boundOnSceneChange = () => {
        const currentScene = typeof canvas !== 'undefined' ? canvas?.scene : null;
        if (currentScene && this._chapterTracker) {
          this._chapterTracker.updateFromScene(currentScene);
          this._logger.log(`Chapter updated from scene change: ${currentScene.name || currentScene.id}`);
        }
      };
      if (typeof Hooks !== 'undefined') {
        const hookId = Hooks.on('canvasReady', this._boundOnSceneChange);
        this._registeredHooks.add({ name: 'canvasReady', id: hookId });
        this._logger.debug('Registered canvasReady hook for chapter auto-update');
      }

      // Initialize rolling summarizer and wire cost/budget (Plan 05-03)
      if (this._aiAssistant) {
        // Create RollingSummarizer using AIAssistant's own OpenAI client
        if (this._aiAssistant._openaiClient) {
          this._aiAssistant.initializeRollingSummarizer(this._aiAssistant._openaiClient);
        }

        // Read and apply token budget setting
        let budget = 12000;
        try {
          budget = game?.settings?.get(MODULE_ID, 'contextTokenBudget') || 12000;
        } catch (e) {
          this._logger.debug('Could not read contextTokenBudget setting, using default');
        }
        if (this._aiAssistant._promptBuilder?.setTokenBudget) {
          this._aiAssistant._promptBuilder.setTokenBudget(budget);
        }

        // Wire summarization cost callback to CostTracker
        this._aiAssistant._onSummarizationUsage = (usage) => {
          if (usage) this._costTracker?.addUsage('gpt-4o-mini', usage);
        };
      }

      // Start silence monitoring for autonomous AI suggestions
      if (this._aiAssistant) {
        this._aiAssistant.setOnAutonomousSuggestionCallback((data) => {
          this._logger.info(`Autonomous suggestion received: ${data.suggestion.type}`);
          if (this._callbacks.onAISuggestion) {
            this._callbacks.onAISuggestion(data.suggestion, data.silenceEvent);
          }
          this._lastAISuggestions = [data.suggestion];
          this._updateState(SessionState.LIVE_LISTENING);
        });
        this._aiAssistant.startSilenceMonitoring();
        this._logger.debug('Silence monitoring started for autonomous suggestions');

        // Inject cycle-in-flight guard so silence events are dropped during active cycles
        this._aiAssistant._silenceMonitor?.setIsCycleInFlightFn(() => this._isCycleInFlight);
      }

      this._logger.log('Live mode started');
    } catch (error) {
      this._liveMode = false;
      this._logger.error('Failed to start live mode:', error);
      this._handleError(error, 'startLiveMode');
      throw error;
    }
  }

  /**
   * Auto-detect adventure journal from active scene and feed content to AIAssistant.
   * Uses the scene's linked journal, or falls back to the first world journal.
   * @private
   */
  async _initializeJournalContext() {
    if (!this._aiAssistant || !this._journalParser) return;

    let fullText = '';
    try {
      // 1. Check user-selected journal from settings (Plan 02-02)
      let journalId = null;
      try {
        journalId = globalThis.game?.settings?.get('vox-chronicle', 'activeAdventureJournalId') || null;
        if (journalId) {
          this._logger.log(`Using user-selected journal from settings: ${journalId}`);
        }
      } catch (e) {
        this._logger.debug('Could not read activeAdventureJournalId setting:', e.message);
      }

      // 2. Fall back to scene-linked journal or first world journal
      const scene = typeof canvas !== 'undefined' ? canvas?.scene : null;
      if (!journalId) {
        if (scene?.journal) {
          journalId = scene.journal;
          this._logger.log(`Using scene-linked journal: ${journalId}`);
        } else if (typeof game !== 'undefined' && game?.journal?.size > 0) {
          const firstJournal = game.journal.contents?.[0];
          if (firstJournal) {
            journalId = firstJournal.id;
            this._logger.log(`No scene journal linked, using first world journal: ${firstJournal.name}`);
          }
        }
      }

      if (!journalId) {
        this._logger.warn('No journal found for AI context — suggestions will be generic');
        return;
      }

      // Parse the journal and feed content to AIAssistant
      await this._journalParser.parseJournal(journalId);
      fullText = this._journalParser.getFullText(journalId);

      if (fullText) {
        this._aiAssistant.setAdventureContext(fullText);
        this._logger.log(`Adventure context loaded: ${fullText.length} chars from journal`);
      }

      // Configure ChapterTracker with the selected journal
      if (this._chapterTracker) {
        this._chapterTracker.setSelectedJournal(journalId);

        // Try to detect current chapter from active scene
        if (scene) {
          this._chapterTracker.updateFromScene(scene);
        }

        const currentChapter = this._chapterTracker.getCurrentChapter();
        if (currentChapter) {
          this._aiAssistant.setChapterContext({
            chapterName: currentChapter.title || '',
            subsections: currentChapter.subchapters?.map(s => s.title) || [],
            pageReferences: currentChapter.pageId ? [{
              pageId: currentChapter.pageId,
              pageName: currentChapter.pageName || '',
              journalName: currentChapter.journalName || ''
            }] : [],
            summary: this._chapterTracker.getCurrentChapterContentForAI?.(8000) || currentChapter.content?.substring(0, 3000) || ''
          });
          this._logger.log(`Chapter context set: ${currentChapter.title}`);
        }
      }
    } catch (error) {
      this._logger.warn(`Failed to initialize journal context: ${error.message}`);
      globalThis.ui?.notifications?.info(
        globalThis.game?.i18n?.localize('VOXCHRONICLE.Warnings.JournalContextFailed')
          || 'VoxChronicle: Could not load adventure journal for AI context. Suggestions will be generic.'
      );
    }

    // Parallel non-blocking tasks: NPC extraction + RAG indexing
    const parallelTasks = [];

    // NPC extraction (non-blocking)
    if (fullText && this._aiAssistant?._openaiClient) {
      this._npcExtractor = new NPCProfileExtractor(this._aiAssistant._openaiClient);
      parallelTasks.push(
        this._npcExtractor.extractProfiles(fullText)
          .then(profiles => {
            this._logger.log(`NPC profiles extracted: ${profiles.size} NPCs`);
          })
          .catch(npcError => {
            this._logger.warn(`NPC extraction failed (non-blocking): ${npcError.message}`);
          })
      );
    }

    // RAG indexing (non-blocking — failure does not block live mode start)
    if (this._ragProvider && this._journalParser) {
      parallelTasks.push(
        this._indexJournalsForRAG({
          onProgress: (current, total, message) => {
            if (this._callbacks.onProgress) {
              this._callbacks.onProgress({
                message: message || `Indexing journals: ${current}/${total}`,
                progress: total > 0 ? Math.round((current / total) * 100) : 0
              });
            }
          }
        }).catch(indexError => {
          this._logger.warn(`RAG indexing failed (non-blocking): ${indexError.message}`);
        })
      );
    }

    if (parallelTasks.length > 0) {
      await Promise.allSettled(parallelTasks);
    }
  }

  /**
   * Compute a SHA-256 content hash for staleness detection.
   * @param {string} text - The text content to hash
   * @returns {Promise<string>} Hex-encoded SHA-256 hash
   * @private
   */
  async _computeContentHash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Index selected journals for RAG with content-hash-based staleness detection.
   * Chunks journals at 4800/1200 char boundaries and uploads as RAGDocuments.
   * @param {object} [options={}] - Indexing options
   * @param {Function} [options.onProgress] - Progress callback (current, total, message)
   * @returns {Promise<{indexed: number, skipped: number}>}
   * @private
   */
  async _indexJournalsForRAG(options = {}) {
    if (!this._ragProvider || !this._journalParser) return { indexed: 0, skipped: 0 };

    const primaryId = globalThis.game?.settings?.get(MODULE_ID, 'activeAdventureJournalId') || '';
    const supplementaryIds = globalThis.game?.settings?.get(MODULE_ID, 'supplementaryJournalIds') || [];
    const allJournalIds = [primaryId, ...supplementaryIds].filter(Boolean);

    if (allJournalIds.length === 0) {
      this._logger.debug('No journals selected for RAG indexing');
      return { indexed: 0, skipped: 0 };
    }

    let totalIndexed = 0;
    let totalSkipped = 0;

    for (const journalId of allJournalIds) {
      // Get full text for hash comparison
      const fullText = this._journalParser.getFullText(journalId) || '';
      const currentHash = await this._computeContentHash(fullText);

      // Check staleness
      if (this._contentHashes[journalId] === currentHash) {
        this._logger.debug(`Journal ${journalId} unchanged, skipping re-index`);
        totalSkipped++;
        continue;
      }

      // Get chunks with 4800/1200 char boundaries (~1200/300 tokens)
      const chunks = await this._journalParser.getChunksForEmbedding(journalId, {
        chunkSize: 4800,
        overlap: 1200
      });

      if (chunks.length === 0) {
        this._logger.debug(`Journal ${journalId} has no chunks to index`);
        totalSkipped++;
        continue;
      }

      // Convert chunks to RAGDocuments
      const ragDocs = chunks.map((chunk) => ({
        id: `${journalId}-${chunk.metadata.pageId}-chunk${chunk.metadata.chunkIndex}`,
        title: `${chunk.metadata.journalName} > ${chunk.metadata.pageName} [${chunk.metadata.chunkIndex + 1}/${chunk.metadata.totalChunks}]`,
        content: chunk.text,
        metadata: { ...chunk.metadata, type: 'adventure-journal' }
      }));

      // Index documents
      const result = await this._ragProvider.indexDocuments(ragDocs, {
        onProgress: options.onProgress
      });

      totalIndexed += result.indexed || 0;

      // Store the new hash
      this._contentHashes[journalId] = currentHash;
      this._logger.debug(`Journal ${journalId} indexed: ${result.indexed} docs`);
    }

    this._logger.log(`RAG indexing complete: ${totalIndexed} indexed, ${totalSkipped} skipped`);
    return { indexed: totalIndexed, skipped: totalSkipped };
  }

  /**
   * Re-index a single journal (called from debounced journal edit hooks).
   * Only re-indexes if the journal is in the selected set. Non-blocking with
   * concurrency guard to prevent parallel re-index operations.
   * @param {string} journalId - The journal ID to re-index
   * @returns {Promise<void>}
   */
  async reindexJournal(journalId) {
    // Check if this journal is in the selected set
    const primaryId = globalThis.game?.settings?.get(MODULE_ID, 'activeAdventureJournalId') || '';
    const supplementaryIds = globalThis.game?.settings?.get(MODULE_ID, 'supplementaryJournalIds') || [];
    const isSelected = journalId === primaryId || supplementaryIds.includes(journalId);

    if (!isSelected) {
      this._logger.debug(`Journal ${journalId} not in selected set, skipping re-index`);
      return;
    }

    // Concurrency guard — queue if already in progress
    if (this._reindexInProgress) {
      this._reindexQueue.add(journalId);
      this._logger.debug(`Re-index in progress, queued ${journalId}`);
      return;
    }

    this._reindexInProgress = true;
    try {
      // Clear cached hash so it will be re-indexed
      delete this._contentHashes[journalId];

      // Clear parser cache and re-parse
      this._journalParser.clearAllCache?.();
      await this._journalParser.parseJournal(journalId);

      // Re-index (only the stale journal will actually be indexed)
      await this._indexJournalsForRAG();

      this._logger.log(`Journal ${journalId} re-indexed successfully`);
    } catch (error) {
      this._logger.warn(`Failed to re-index journal ${journalId}: ${error.message}`);
    } finally {
      this._reindexInProgress = false;

      // Process all queued journal IDs
      if (this._reindexQueue.size > 0) {
        const queuedIds = [...this._reindexQueue];
        this._reindexQueue.clear();
        for (const queuedId of queuedIds) {
          await this.reindexJournal(queuedId);
        }
      }
    }
  }

  /**
   * Enrich the current session with Foundry journal data for Kanka publishing.
   * Adds journalText and npcProfiles to _currentSession so KankaPublisher can
   * validate entities against the adventure journal and use journal descriptions.
   * @private
   */
  async _enrichSessionWithJournalContext() {
    if (!this._journalParser) {
      this._logger.debug('No journal parser available - publishing without journal validation');
      return;
    }

    const enrichStart = Date.now();
    try {
      // Use user-selected journal first, then fall back to scene/first journal
      let journalId = globalThis.game?.settings?.get(MODULE_ID, 'activeAdventureJournalId') || null;
      if (!journalId) {
        const scene = typeof canvas !== 'undefined' ? canvas?.scene : null;
        if (scene?.journal) {
          journalId = scene.journal;
        } else if (typeof game !== 'undefined' && game?.journal?.size > 0) {
          const firstJournal = game.journal.contents?.[0];
          if (firstJournal) {
            journalId = firstJournal.id;
          }
        }
      }

      if (!journalId) {
        this._logger.debug('No journal found for entity validation');
        return;
      }

      // Parse the journal (uses cache if already parsed)
      await this._journalParser.parseJournal(journalId);

      // Add full journal text for entity name validation
      const fullText = this._journalParser.getFullText(journalId);
      if (fullText) {
        this._currentSession.journalText = fullText;
        this._logger.debug(`Journal text loaded for publishing: ${fullText.length} chars`);
      }

      // Add NPC profiles for character descriptions
      const npcProfiles = this._journalParser.extractNPCProfiles(journalId);
      if (npcProfiles?.length > 0) {
        this._currentSession.npcProfiles = npcProfiles;
        this._logger.debug(`NPC profiles loaded for publishing: ${npcProfiles.length} profiles`);
      }

      const enrichMs = Date.now() - enrichStart;
      this._logger.debug(`Journal enrichment completed in ${enrichMs}ms`);
    } catch (error) {
      this._logger.warn(`Failed to enrich session with journal context: ${error.message}`);
      // Non-fatal: publishing will proceed without journal validation
    }
  }

  /**
   * Stop live mode
   * @returns {Promise<object>} Session data with accumulated transcript
   */
  async stopLiveMode() {
    if (!this._liveMode && !this._isStopping) {
      this._logger.warn('stopLiveMode called but live mode is not active, ignoring');
      return this._currentSession;
    }
    if (this._isStopping) {
      this._logger.debug('stopLiveMode already in progress, returning current session');
      return this._currentSession;
    }

    this._isStopping = true;
    this._logger.log('Stopping live mode...');
    this._liveMode = false;
    const stopStart = Date.now();

    // Clear cycle timer immediately
    if (this._liveCycleTimer) {
      clearTimeout(this._liveCycleTimer);
      this._liveCycleTimer = null;
    }

    // Create shutdown controller if not already created
    if (!this._shutdownController) {
      this._shutdownController = new AbortController();
    }

    let forceAborted = false;

    try {
      // Race: wait for current cycle OR 5-second deadline
      const currentCycle = this._currentCyclePromise || Promise.resolve();
      let deadlineTimer;
      const deadline = new Promise(resolve => {
        deadlineTimer = setTimeout(() => {
          this._shutdownController.abort();
          forceAborted = true;
          resolve('timeout');
        }, SHUTDOWN_DEADLINE_MS);
      });

      await Promise.race([currentCycle, deadline]);
      clearTimeout(deadlineTimer);

      // Assemble final transcript
      if (this._currentSession) {
        this._currentSession.endTime = Date.now();

        // Use _fullTranscriptText for the complete transcript text (not truncated by rolling window)
        const transcriptText = this._fullTranscriptText || this._liveTranscript.map(s => s.text).join(' ');
        if (this._liveTranscript.length > 0 || this._fullTranscriptText) {
          this._currentSession.transcript = {
            text: transcriptText,
            segments: this._liveTranscript,
            language: this._currentSession.language
          };
        }

        // Graceful audio stop (only if not force-aborted)
        if (!forceAborted) {
          try {
            const audioBlob = await this._audioRecorder.stopRecording();
            this._currentSession.audioBlob = audioBlob;
          } catch (audioErr) {
            this._logger.warn('Audio stop failed, using cancel:', audioErr.message);
            this._audioRecorder?.cancel?.();
          }
        } else {
          // Force-abort: use cancel() per research pitfall 5
          this._audioRecorder?.cancel?.();
        }
      }
    } catch (error) {
      this._logger.error('Error during stop race:', error);
      this._audioRecorder?.cancel?.();
    }

    // Always teardown and reach IDLE
    try {
      await this._fullTeardown();
    } catch (teardownErr) {
      this._logger.error('Teardown error:', teardownErr);
    }

    // Build summary notification
    const duration = this._sessionStartTime
      ? Math.round((Date.now() - this._sessionStartTime) / 60000)
      : 0;
    const suggestionCount = this._lastAISuggestions?.length || 0;
    const cost = this._costTracker?.getTotalCost()?.toFixed(2) || '0.00';
    const summaryMsg = globalThis.game?.i18n?.format('VOXCHRONICLE.Live.SessionSummary', {
      duration: String(duration),
      suggestions: String(suggestionCount),
      cost
    }) || `Session ended: ${duration}min, ${suggestionCount} suggestions, $${cost}`;
    globalThis.ui?.notifications?.info(summaryMsg);

    this._updateState(SessionState.IDLE);
    const stopMs = Date.now() - stopStart;
    this._logger.log(`Live mode stopped (shutdown: ${stopMs}ms, force-aborted: ${forceAborted})`);
    this._isStopping = false;
    this._callbacks.onSessionEnd?.();
    return this._currentSession;
  }

  /**
   * Full teardown of all live mode state, hooks, timers, and controllers.
   * Called from stopLiveMode() and reset(). Safe to call multiple times.
   * @private
   */
  async _fullTeardown() {
    // Unregister all tracked Foundry hooks
    if (this._registeredHooks?.size > 0 && typeof Hooks !== 'undefined') {
      for (const hook of this._registeredHooks) {
        try {
          Hooks.off(hook.name, hook.id);
        } catch (e) {
          this._logger.debug(`Failed to unregister hook ${hook.name}:`, e.message);
        }
      }
    }
    this._registeredHooks = new Set();

    // Legacy hook cleanup (backward compat)
    if (this._boundOnSceneChange && typeof Hooks !== 'undefined') {
      Hooks.off('canvasReady', this._boundOnSceneChange);
    }
    this._boundOnSceneChange = null;

    // Abort shutdown controller and null it for fresh creation on next start
    if (this._shutdownController && !this._shutdownController.signal.aborted) {
      this._shutdownController.abort();
    }
    this._shutdownController = null;

    // Stop silence monitoring and clear cycle-in-flight guard
    if (this._aiAssistant) {
      this._aiAssistant._silenceMonitor?.setIsCycleInFlightFn(null);
      this._aiAssistant.stopSilenceMonitoring?.();
    }

    // Reset cycle-in-flight flag
    this._isCycleInFlight = false;

    // End analytics session
    if (this._sessionAnalytics) {
      this._sessionAnalytics.endSession?.();
    }

    // Clean up NPC extractor
    if (this._npcExtractor) {
      this._npcExtractor.clear?.();
      this._npcExtractor = null;
    }

    // Rules services kept alive for reuse, but clear session-scoped state
    if (this._rulesLookupService) {
      this._rulesLookupService.destroy();
    }

    // Reset state
    this._liveTranscript = [];
    this._fullTranscriptText = '';
    this._discardedSegmentCount = 0;
    this._currentCyclePromise = null;
    this._cycleDurations = [];
    this._transcriptionHealth = 'healthy';
    this._aiSuggestionHealth = 'healthy';
    this._transcriptionConsecutiveErrors = 0;
    this._aiSuggestionConsecutiveErrors = 0;
    this._aiSuggestionsPaused = false;
    this._silenceStartTime = null;
    this._lastAISuggestions = null;
    this._lastOffTrackStatus = null;
    this._consecutiveLiveCycleErrors = 0;
    this._aiAnalysisErrorNotified = false;

    if (this._costTracker) {
      this._costTracker.reset();
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

    // Set synchronously BEFORE the IIFE to prevent microtask gap race with silence timer (Pitfall 4)
    this._isCycleInFlight = true;

    const cycleStart = Date.now();

    // Store promise reference before any async work (pitfall 2)
    this._currentCyclePromise = (async () => {
      try {
        this._updateState(SessionState.LIVE_TRANSCRIBING);

        const audioChunk = this._audioRecorder.getLatestChunk
          ? await this._audioRecorder.getLatestChunk()
          : null;

        // Check if live mode was stopped while we were getting the audio chunk
        if (!this._liveMode) {
          this._logger.debug('Live mode stopped during audio capture, aborting cycle');
          return;
        }

        if (audioChunk && audioChunk.size > 0) {
          this._silenceStartTime = null;
          const chunkSizeMB = (audioChunk.size / (1024 * 1024)).toFixed(2);
          this._logger.log(`Live cycle: got audio chunk ${chunkSizeMB}MB, transcribing...`);

          const transcribeStart = Date.now();
          const result = await this._transcriptionService.transcribe(audioChunk, {
            language: this._currentSession?.language,
            speakerMap: this._currentSession?.speakerMap,
            signal: this._shutdownController?.signal
          });

          // Track transcription cost (billed per audio minute)
          this._costTracker?.addTranscriptionMinutes(this._liveBatchDuration / 1000 / 60);

          // Check again after async transcription — session may have been stopped
          if (!this._liveMode) {
            this._logger.debug('Live mode stopped during transcription, discarding result');
            return;
          }

          if (result?.segments?.length > 0) {
            this._consecutiveLiveCycleErrors = 0;

            // Auto-recovery: successful transcription resets health to green
            this._transcriptionConsecutiveErrors = 0;
            this._transcriptionHealth = 'healthy';

            // Offset segment timestamps based on existing transcript duration
            const offset = this._liveTranscript.length > 0
              ? this._liveTranscript[this._liveTranscript.length - 1].end
              : 0;

            const offsetSegments = result.segments.map(s => ({
              ...s,
              start: s.start + offset,
              end: s.end + offset
            }));

            // Push new segments
            this._liveTranscript.push(...offsetSegments);
            this._silenceStartTime = null;

            // Append to full transcript accumulator (append-only, never truncated)
            const newText = offsetSegments.map(s => s.text).join(' ');
            this._fullTranscriptText += (this._fullTranscriptText ? ' ' : '') + newText;

            // Apply rolling window (keep last MAX_LIVE_SEGMENTS)
            if (this._liveTranscript.length > MAX_LIVE_SEGMENTS) {
              const excess = this._liveTranscript.length - MAX_LIVE_SEGMENTS;
              this._discardedSegmentCount += excess;
              this._liveTranscript = this._liveTranscript.slice(-MAX_LIVE_SEGMENTS);
            }

            // Reset silence detector timer since we got speech
            if (this._aiAssistant) {
              this._aiAssistant.recordActivityForSilenceDetection();
            }

            if (this._sessionAnalytics) {
              for (const segment of offsetSegments) {
                this._sessionAnalytics.addSegment(segment);
              }
            }

            if (this._sceneDetector) {
              this._sceneDetector.detectSceneTransition(result.text || '');
            }

            // Check cost cap before AI analysis
            const costCap = this._getCostCap();
            if (this._costTracker?.isCapExceeded(costCap)) {
              if (!this._aiSuggestionsPaused) {
                this._aiSuggestionsPaused = true;
                this._logger.warn(`Cost cap exceeded ($${costCap}). AI suggestions paused.`);
              }
            }

            // Run AI analysis unless suggestions are paused
            if (!this._aiSuggestionsPaused) {
              this._updateState(SessionState.LIVE_ANALYZING);
              try {
                await this._runAIAnalysis(result);

                // Update AI suggestion health on success
                this._aiSuggestionHealth = 'healthy';
                this._aiSuggestionConsecutiveErrors = 0;
              } catch (aiError) {
                this._aiSuggestionConsecutiveErrors++;
                if (this._aiSuggestionConsecutiveErrors >= 5) {
                  this._aiSuggestionHealth = 'down';
                } else {
                  this._aiSuggestionHealth = 'degraded';
                }
                this._logger.error('AI analysis error:', aiError.message);
              }
            }

            // Check after async AI analysis — session may have been stopped
            if (!this._liveMode) {
              this._logger.debug('Live mode stopped during AI analysis, ending cycle');
              return;
            }
          } else {
            this._logger.debug('Transcription returned no segments');
          }
        } else {
          this._logger.debug('No audio data in this cycle (silence or empty chunk)');
          this._handleSilence();
        }
      } catch (error) {
        this._consecutiveLiveCycleErrors++;

        // Update transcription health based on consecutive errors
        this._transcriptionConsecutiveErrors++;
        if (this._transcriptionConsecutiveErrors >= 5) {
          this._transcriptionHealth = 'down';
        } else if (this._transcriptionConsecutiveErrors >= 2) {
          this._transcriptionHealth = 'degraded';
        }

        this._logger.error('Live cycle error:', error.message);
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
        if (this._consecutiveLiveCycleErrors === 3) {
          ui?.notifications?.warn(
            game.i18n?.localize('VOXCHRONICLE.Errors.LiveCycleRepeatedFailures') ||
            'VoxChronicle: Live transcription is experiencing repeated errors. Check your API key and connection.'
          );
        }
      } finally {
        // Reset cycle-in-flight flag so silence monitor can fire again
        this._isCycleInFlight = false;

        // Self-monitoring: record cycle duration
        const cycleDuration = Date.now() - cycleStart;
        this._cycleDurations.push(cycleDuration);
        if (this._cycleDurations.length > MAX_CYCLE_DURATIONS) {
          this._cycleDurations = this._cycleDurations.slice(-MAX_CYCLE_DURATIONS);
        }

        // Warn if average cycle duration exceeds 2x baseline
        if (this._cycleDurations.length >= 5) {
          const avgDuration = this._cycleDurations.reduce((a, b) => a + b, 0) / this._cycleDurations.length;
          const baseline = this._liveBatchDuration; // ~10-15s default
          if (avgDuration > baseline * 2) {
            this._logger.warn(`Self-monitoring: avg cycle duration ${Math.round(avgDuration)}ms exceeds 2x baseline (${baseline}ms)`);
          }
        }

        // Memory monitoring (Chrome only)
        if (typeof performance !== 'undefined' && performance.memory?.usedJSHeapSize) {
          const heapMB = performance.memory.usedJSHeapSize / (1024 * 1024);
          if (heapMB > 500) {
            this._logger.warn(`Self-monitoring: JS heap ${Math.round(heapMB)}MB exceeds 500MB threshold`);
          }
        }

        // Always reschedule and restore state if live mode is still active.
        if (this._liveMode) {
          this._logger.debug(`Live cycle completed in ${cycleDuration}ms`);
          this._updateState(SessionState.LIVE_LISTENING);
          this._scheduleLiveCycle();
        }

        // Clear promise reference
        this._currentCyclePromise = null;
      }
    })();

    // Await the cycle (callers can also race against _currentCyclePromise)
    await this._currentCyclePromise;
  }

  /**
   * Run AI analysis on transcription result
   * @param {object} transcriptionResult - Transcription result
   * @private
   */
  async _runAIAnalysis(transcriptionResult) {
    if (!this._aiAssistant) {
      this._logger.debug('AI analysis skipped: no AIAssistant configured');
      return;
    }

    // Check if live mode was stopped before starting AI analysis
    if (!this._liveMode) {
      this._logger.debug('AI analysis skipped: live mode no longer active');
      return;
    }

    try {
      // Build context from tail of transcript — avoids serializing entire array
      const windowSize = 15000;
      let contextText = '';
      for (let i = this._liveTranscript.length - 1; i >= 0; i--) {
        const s = this._liveTranscript[i];
        const line = `${s.speaker || 'Unknown'}: ${s.text}`;
        if (contextText.length + line.length + 1 > windowSize) {
          contextText = '... ' + (line + '\n' + contextText).slice(-(windowSize));
          break;
        }
        contextText = contextText ? line + '\n' + contextText : line;
      }

      const currentChapter = this._chapterTracker?.getCurrentChapter?.() || null;

      // Update chapter context on AIAssistant if chapter has changed
      if (currentChapter && this._aiAssistant.setChapterContext) {
        this._aiAssistant.setChapterContext({
          chapterName: currentChapter.title || '',
          subsections: currentChapter.subchapters?.map(s => s.title) || [],
          pageReferences: currentChapter.pageId ? [{
            pageId: currentChapter.pageId,
            pageName: currentChapter.pageName || '',
            journalName: currentChapter.journalName || ''
          }] : [],
          summary: this._chapterTracker?.getCurrentChapterContentForAI?.(8000) || currentChapter.content?.substring(0, 3000) || ''
        });
      }

      // Detect mentioned NPCs and inject into AI context
      if (this._npcExtractor) {
        const mentionedNPCs = this._npcExtractor.detectMentionedNPCs(contextText);
        this._aiAssistant.setNPCProfiles(mentionedNPCs);
      }

      // Fetch and set next chapter lookahead for foreshadowing
      if (this._chapterTracker?.getNextChapterContentForAI) {
        const lookahead = this._chapterTracker.getNextChapterContentForAI(1000);
        this._aiAssistant.setNextChapterLookahead(lookahead);
      }

      this._logger.log(`Running AI analysis (context: ${contextText.length} chars, chapter: ${currentChapter?.title || 'none'})`);

      // Fire-and-forget rules lookup (independent of suggestion cycle)
      try {
        if (this._rulesReference && this._rulesLookupService) {
          const detection = this._rulesReference.detectRulesQuestion(contextText);
          if (detection?.isRulesQuestion && detection.extractedTopic) {
            const lookupPromise = this._rulesLookupService.lookup(detection.extractedTopic, {
              signal: this._shutdownController?.signal
            });
            lookupPromise.then(result => {
              if (result && this._liveMode && this._callbacks.onRulesCard) {
                this._callbacks.onRulesCard({
                  topic: result.question || detection.extractedTopic,
                  compendiumResults: result.compendiumResults,
                  synthesisPromise: result.synthesisPromise,
                  source: 'auto'
                });
              }
            }).catch(err => {
              this._logger.warn('Rules lookup failed:', err.message);
              if (this._liveMode && this._callbacks.onRulesCard) {
                this._callbacks.onRulesCard({
                  topic: detection.extractedTopic,
                  compendiumResults: [],
                  synthesisPromise: null,
                  source: 'auto',
                  unavailable: true
                });
              }
            });
          }
        }
      } catch (err) {
        this._logger.warn('Rules detection failed:', err.message);
      }

      // Try streaming path first (activates MainPanel progressive card display)
      const hasStreaming = typeof this._aiAssistant.generateSuggestionsStreaming === 'function';
      let analysis = null;
      let usedStreaming = false;
      const analysisStart = Date.now();

      if (hasStreaming) {
        try {
          const streamResult = await this._aiAssistant.generateSuggestionsStreaming(contextText, {
            onToken: (accumulatedText) => {
              if (this._callbacks.onStreamToken) {
                this._callbacks.onStreamToken({ text: accumulatedText });
              }
            },
            signal: this._shutdownController?.signal,
            maxSuggestions: 3
          });

          usedStreaming = true;

          // Parse the streamed text into structured suggestion format
          const type = this._detectSuggestionType(streamResult.text);
          const suggestion = {
            type: type,
            content: streamResult.text
          };

          // Fire stream complete callback for MainPanel card finalization
          if (this._callbacks.onStreamComplete) {
            this._callbacks.onStreamComplete({
              text: streamResult.text,
              type: type,
              usage: streamResult.usage || null
            });
          }

          // Build analysis result compatible with existing downstream code
          analysis = {
            suggestions: [suggestion],
            offTrackStatus: undefined,
            usage: streamResult.usage || null,
            model: streamResult.model || 'gpt-4o-mini'
          };

          // Track streaming token costs
          if (streamResult.usage && this._costTracker) {
            this._costTracker.addUsage(analysis.model, streamResult.usage);
          }
        } catch (streamError) {
          this._logger.warn(`Streaming failed, falling back to non-streaming: ${streamError.message}`);
          usedStreaming = false;
        }
      }

      if (!usedStreaming) {
        // Fallback: non-streaming analyzeContext (original path)
        analysis = await this._aiAssistant.analyzeContext(contextText, {
          includeSuggestions: true,
          checkOffTrack: true,
          detectRules: false
        });

        // Track AI suggestion token costs
        if (analysis?.usage && this._costTracker) {
          this._costTracker.addUsage(analysis.model || 'gpt-4o-mini', analysis.usage);
        }
      }

      const analysisMs = Date.now() - analysisStart;
      if (analysis?.suggestions) {
        this._lastAISuggestions = analysis.suggestions;
        this._logger.log(`AI suggestions received: ${analysis.suggestions.length} suggestion(s) in ${analysisMs}ms`);
        for (const s of analysis.suggestions) {
          const preview = (s.content || '').substring(0, 100);
          this._logger.debug(`  [${s.type || 'unknown'}] ${preview}${(s.content || '').length > 100 ? '...' : ''}`);
        }
      } else {
        this._logger.debug('AI analysis returned no suggestions');
      }

      // Live enrichment: append session notes for NPC mentions in suggestions
      if (this._npcExtractor && analysis?.suggestions) {
        for (const suggestion of analysis.suggestions) {
          const profiles = this._npcExtractor.getProfiles();
          for (const [nameLower, profile] of profiles) {
            if (nameLower.length >= 3 && suggestion.content?.toLowerCase().includes(nameLower)) {
              const noteType = suggestion.type || 'interaction';
              this._npcExtractor.addSessionNote(
                profile.name,
                `${noteType}: ${suggestion.content.substring(0, 80)}...`
              );
              break; // One note per suggestion
            }
          }
        }
      }

      if (analysis?.offTrackStatus !== undefined) {
        this._lastOffTrackStatus = analysis.offTrackStatus;
        if (analysis.offTrackStatus.isOffTrack) {
          this._logger.log(`Off-track detected: severity=${analysis.offTrackStatus.severity}, reason="${analysis.offTrackStatus.reason || 'N/A'}"`);
        } else {
          this._logger.debug('Players on track');
        }
      }

      // Trigger UI update immediately so suggestions appear without waiting for next render cycle
      if (this._callbacks.onStateChange) {
        this._callbacks.onStateChange(this._state, this._state, { suggestionsReady: true });
      }
    } catch (error) {
      this._logger.error(`AI analysis error: ${error.message}`);
      if (this._callbacks.onError) {
        this._callbacks.onError(error, 'ai_analysis');
      }
      if (!this._aiAnalysisErrorNotified) {
        this._aiAnalysisErrorNotified = true;
        ui?.notifications?.warn(
          game.i18n?.localize('VOXCHRONICLE.Errors.AIAnalysisFailed') ||
          'VoxChronicle: AI suggestions unavailable. Check your OpenAI API key.'
        );
      }
    }
  }

  /**
   * Detect suggestion type from streamed text content
   * @param {string} text - The streamed suggestion text
   * @returns {string} One of: narration, dialogue, action, reference
   * @private
   */
  _detectSuggestionType(text) {
    if (!text) return 'narration';
    const firstLine = text.split('\n')[0].toLowerCase();
    if (/\b(dialogue|says|speaks|asks|replies|exclaims)\b/.test(firstLine)) return 'dialogue';
    if (/\b(action|combat|attack|fight|strike|defend)\b/.test(firstLine)) return 'action';
    if (/\b(rule|reference|check|dc|saving throw|ability)\b/.test(firstLine)) return 'reference';
    if (/\b(narrat|descri|scene|atmosphere|environ)\b/.test(firstLine)) return 'narration';
    return 'narration';
  }

  /**
   * Handle an on-demand rules query from the UI (e.g. MainPanel search bar)
   * @param {string} question - The rules question to look up
   * @returns {Promise<void>}
   */
  async handleManualRulesQuery(question) {
    if (!this._rulesLookupService) {
      this._logger.warn('Manual rules query ignored — rulesLookupService not available');
      if (this._callbacks.onRulesCard) {
        this._callbacks.onRulesCard({
          topic: question,
          compendiumResults: [],
          synthesisPromise: null,
          source: 'manual',
          unavailable: true
        });
      }
      return;
    }
    try {
      const result = await this._rulesLookupService.lookup(question, {
        skipCooldown: true
      });
      if (result && this._callbacks.onRulesCard) {
        this._callbacks.onRulesCard({
          topic: result.question || question,
          compendiumResults: result.compendiumResults,
          synthesisPromise: result.synthesisPromise,
          source: 'manual'
        });
      }
    } catch (err) {
      this._logger.warn('Manual rules query failed:', err.message);
      if (this._callbacks.onRulesCard) {
        this._callbacks.onRulesCard({
          topic: question,
          compendiumResults: [],
          synthesisPromise: null,
          source: 'manual',
          unavailable: true
        });
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
      this._logger.debug('Silence started');
      return;
    }

    const silenceDuration = Date.now() - this._silenceStartTime;
    if (silenceDuration >= this._silenceThreshold) {
      this._logger.debug(`Silence threshold reached: ${(silenceDuration / 1000).toFixed(1)}s`);
      if (this._callbacks.onSilenceDetected) {
        this._callbacks.onSilenceDetected(silenceDuration);
        // Reset silence timer to prevent repeated triggers every cycle
        this._silenceStartTime = Date.now();
      }
    }
  }

  /**
   * Update chapter from scene change
   * @param {object} scene - Foundry scene object
   */
  updateChapter(scene) {
    this._logger.debug(`updateChapter called (scene: ${scene?.name || scene?.id || 'unknown'})`);
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

  /**
   * Get health status for transcription and AI suggestion services
   * @returns {{transcription: string, aiSuggestions: string}} Health statuses ('healthy'|'degraded'|'down')
   */
  getServiceHealth() {
    return {
      transcription: this._transcriptionHealth,
      aiSuggestions: this._aiSuggestionHealth
    };
  }

  /**
   * Get cost tracking data for UI display
   * @returns {object|null} Token summary from CostTracker, or null if unavailable
   */
  getCostData() {
    return this._costTracker?.getTokenSummary() ?? null;
  }

  /**
   * Get the session cost cap from Foundry settings
   * @returns {number} Cost cap in dollars (0 = disabled)
   * @private
   */
  _getCostCap() {
    try {
      return globalThis.game?.settings?.get(MODULE_ID, 'sessionCostCap') || 5;
    } catch (e) {
      return 5; // Default $5 cap
    }
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
