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
  _journalParser = null;

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
    this._logger.log(`Cancelling session (from state: ${this._state})...`);

    // Clear live cycle timer to prevent orphaned cycles
    if (this._liveCycleTimer) {
      clearTimeout(this._liveCycleTimer);
      this._liveCycleTimer = null;
    }
    this._liveMode = false;

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

    this._logger.log(`Extracting entities (text: ${this._currentSession.transcript.text.length} chars)...`);
    this._updateState(SessionState.EXTRACTING);

    const extractionStart = Date.now();
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

    const extractionMs = Date.now() - extractionStart;
    this._logger.log(
      `Extracted ${extractionResult.totalCount || 0} entities, ` +
        `${this._currentSession.moments.length} salient moments in ${extractionMs}ms`
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

    try {
      // Try to find the adventure journal from the active scene
      let journalId = null;
      const scene = typeof canvas !== 'undefined' ? canvas?.scene : null;
      if (scene?.journal) {
        journalId = scene.journal;
        this._logger.log(`Using scene-linked journal: ${journalId}`);
      } else if (typeof game !== 'undefined' && game?.journal?.size > 0) {
        // Fall back to the first world journal
        const firstJournal = game.journal.contents?.[0];
        if (firstJournal) {
          journalId = firstJournal.id;
          this._logger.log(`No scene journal linked, using first world journal: ${firstJournal.name}`);
        }
      }

      if (!journalId) {
        this._logger.warn('No journal found for AI context — suggestions will be generic');
        return;
      }

      // Parse the journal and feed content to AIAssistant
      await this._journalParser.parseJournal(journalId);
      const fullText = this._journalParser.getFullText(journalId);

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
            summary: currentChapter.content?.substring(0, 3000) || ''
          });
          this._logger.log(`Chapter context set: ${currentChapter.title}`);
        }
      }
    } catch (error) {
      this._logger.warn(`Failed to initialize journal context: ${error.message}`);
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
      // Find the adventure journal (same logic as _initializeJournalContext)
      let journalId = null;
      const scene = typeof canvas !== 'undefined' ? canvas?.scene : null;
      if (scene?.journal) {
        journalId = scene.journal;
      } else if (typeof game !== 'undefined' && game?.journal?.size > 0) {
        const firstJournal = game.journal.contents?.[0];
        if (firstJournal) {
          journalId = firstJournal.id;
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
    if (!this._liveMode) {
      this._logger.warn('stopLiveMode called but live mode is not active, ignoring');
      return this._currentSession;
    }

    this._logger.log('Stopping live mode...');
    this._liveMode = false;
    const stopStart = Date.now();

    if (this._liveCycleTimer) {
      clearTimeout(this._liveCycleTimer);
      this._liveCycleTimer = null;
    }

    try {
      // End analytics session before stopping recording
      if (this._sessionAnalytics) {
        this._sessionAnalytics.endSession();
        this._logger.debug('Analytics session ended');
      }

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
      const segmentCount = this._liveTranscript.length;
      const duration = this._currentSession ? this._getSessionDuration() : 0;
      const stopMs = Date.now() - stopStart;
      this._logger.log(`Live mode stopped (${segmentCount} segments, ${duration}s duration, shutdown: ${stopMs}ms)`);
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

    const cycleStart = Date.now();

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
          speakerMap: this._currentSession?.speakerMap
        });

        // Check again after async transcription — session may have been stopped
        if (!this._liveMode) {
          this._logger.debug('Live mode stopped during transcription, discarding result');
          return;
        }

        if (result?.segments?.length > 0) {
          const transcribeMs = Date.now() - transcribeStart;
          const textPreview = (result.text || '').substring(0, 120);
          this._logger.log(`Transcription result: ${result.segments.length} segments in ${transcribeMs}ms, text: "${textPreview}${(result.text || '').length > 120 ? '...' : ''}"`);

          this._liveTranscript.push(...result.segments);

          if (this._sessionAnalytics) {
            for (const segment of result.segments) {
              this._sessionAnalytics.addSegment(segment);
            }
          }

          if (this._sceneDetector) {
            this._sceneDetector.detectSceneTransition(result.text || '');
          }

          this._updateState(SessionState.LIVE_ANALYZING);
          await this._runAIAnalysis(result);

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
    } finally {
      // Always reschedule and restore state if live mode is still active.
      // This MUST be in finally so errors (e.g. getLatestChunk throwing)
      // don't silently kill the live cycle.
      if (this._liveMode) {
        const cycleDuration = Date.now() - cycleStart;
        this._logger.debug(`Live cycle completed in ${cycleDuration}ms`);
        this._updateState(SessionState.LIVE_LISTENING);
        this._scheduleLiveCycle();
      }
    }
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
      const fullText = this._liveTranscript.map(s => s.text).join(' ');
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
          summary: currentChapter.content?.substring(0, 3000) || ''
        });
      }

      this._logger.log(`Running AI analysis (transcript: ${fullText.length} chars, chapter: ${currentChapter?.title || 'none'})`);

      // Use single analyzeContext() call instead of separate generateSuggestions + detectOffTrack
      // This halves latency by making one API call instead of two
      const analysisStart = Date.now();
      const analysis = await this._aiAssistant.analyzeContext(fullText, {
        includeSuggestions: true,
        checkOffTrack: true,
        detectRules: false
      });

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

      if (analysis?.offTrack !== undefined) {
        this._lastOffTrackStatus = analysis.offTrack;
        if (analysis.offTrack.isOffTrack) {
          this._logger.log(`Off-track detected: severity=${analysis.offTrack.severity}, reason="${analysis.offTrack.reason || 'N/A'}"`);
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
