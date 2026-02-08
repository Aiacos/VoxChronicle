/**
 * SessionOrchestrator - Complete Session Workflow Management
 *
 * Central orchestrator that manages the complete VoxChronicle session workflow:
 * 1. Start/stop audio recording
 * 2. Process transcription with speaker diarization
 * 3. Extract entities and identify salient moments
 * 4. Generate AI images for entities and scenes
 * 5. Publish chronicles and entities to Kanka
 *
 * @class SessionOrchestrator
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { WhisperError, WhisperErrorType } from '../ai/WhisperBackend.mjs';
import { LocalWhisperService } from '../ai/LocalWhisperService.mjs';
import { TranscriptionService } from '../ai/TranscriptionService.mjs';

/**
 * Session workflow states
 * @enum {string}
 */
const SessionState = {
  /** No active session */
  IDLE: 'idle',
  /** Recording in progress */
  RECORDING: 'recording',
  /** Recording paused */
  PAUSED: 'paused',
  /** Processing audio/transcription */
  PROCESSING: 'processing',
  /** Extracting entities */
  EXTRACTING: 'extracting',
  /** Generating images */
  GENERATING_IMAGES: 'generating_images',
  /** Publishing to Kanka */
  PUBLISHING: 'publishing',
  /** Session complete */
  COMPLETE: 'complete',
  /** Error occurred */
  ERROR: 'error'
};

/**
 * Default options for session processing
 * @constant {Object}
 */
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
 * SessionOrchestrator class for managing complete session workflows
 *
 * @example
 * const orchestrator = new SessionOrchestrator({
 *   audioRecorder,
 *   transcriptionService,
 *   entityExtractor,
 *   imageGenerationService,
 *   kankaService,
 *   narrativeExporter
 * });
 *
 * await orchestrator.startSession({ title: 'Session 1' });
 * // ... recording ...
 * const result = await orchestrator.stopSession();
 * await orchestrator.publishToKanka();
 */
class SessionOrchestrator {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('SessionOrchestrator');

  /**
   * Audio recording service
   * @type {Object|null}
   * @private
   */
  _audioRecorder = null;

  /**
   * Transcription service
   * @type {Object|null}
   * @private
   */
  _transcriptionService = null;

  /**
   * Entity extraction service
   * @type {Object|null}
   * @private
   */
  _entityExtractor = null;

  /**
   * Image generation service
   * @type {Object|null}
   * @private
   */
  _imageGenerationService = null;

  /**
   * Kanka API service
   * @type {Object|null}
   * @private
   */
  _kankaService = null;

  /**
   * Narrative exporter for chronicle formatting
   * @type {Object|null}
   * @private
   */
  _narrativeExporter = null;

  /**
   * Current session state
   * @type {string}
   * @private
   */
  _state = SessionState.IDLE;

  /**
   * Current session data
   * @type {SessionData|null}
   * @private
   */
  _currentSession = null;

  /**
   * Event callbacks
   * @type {Object}
   * @private
   */
  _callbacks = {
    onStateChange: null,
    onProgress: null,
    onError: null,
    onSessionComplete: null
  };

  /**
   * Transcription configuration for fallback support
   * @type {Object|null}
   * @private
   */
  _transcriptionConfig = null;

  /**
   * Create a new SessionOrchestrator instance
   *
   * @param {Object} services - Required services
   * @param {Object} services.audioRecorder - AudioRecorder instance
   * @param {Object} services.transcriptionService - TranscriptionService instance
   * @param {Object} [services.entityExtractor] - EntityExtractor instance
   * @param {Object} [services.imageGenerationService] - ImageGenerationService instance
   * @param {Object} [services.kankaService] - KankaService instance
   * @param {Object} [services.narrativeExporter] - NarrativeExporter instance
   * @param {Object} [options] - Configuration options
   */
  constructor(services = {}, options = {}) {
    this._audioRecorder = services.audioRecorder || null;
    this._transcriptionService = services.transcriptionService || null;
    this._entityExtractor = services.entityExtractor || null;
    this._imageGenerationService = services.imageGenerationService || null;
    this._kankaService = services.kankaService || null;
    this._narrativeExporter = services.narrativeExporter || null;

    this._options = { ...DEFAULT_SESSION_OPTIONS, ...options };

    this._logger.debug('SessionOrchestrator initialized');
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Get the current session state
   * @returns {string} Current state from SessionState enum
   */
  get state() {
    return this._state;
  }

  /**
   * Check if a session is active (recording or processing)
   * @returns {boolean} True if session is active
   */
  get isSessionActive() {
    return this._state !== SessionState.IDLE &&
           this._state !== SessionState.COMPLETE &&
           this._state !== SessionState.ERROR;
  }

  /**
   * Check if currently recording
   * @returns {boolean} True if recording
   */
  get isRecording() {
    return this._state === SessionState.RECORDING ||
           this._state === SessionState.PAUSED;
  }

  /**
   * Get the current session data
   * @returns {SessionData|null} Current session or null
   */
  get currentSession() {
    return this._currentSession;
  }

  /**
   * Set event callback handlers
   *
   * @param {Object} callbacks - Callback handlers
   * @param {Function} [callbacks.onStateChange] - Called when state changes
   * @param {Function} [callbacks.onProgress] - Called during processing with progress updates
   * @param {Function} [callbacks.onError] - Called when an error occurs
   * @param {Function} [callbacks.onSessionComplete] - Called when session completes
   */
  setCallbacks(callbacks) {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * Update state and notify listeners
   *
   * @param {string} newState - New state from SessionState enum
   * @param {Object} [data] - Additional data to pass with state change
   * @private
   */
  _updateState(newState, data = {}) {
    const oldState = this._state;
    this._state = newState;

    this._logger.debug(`State changed: ${oldState} -> ${newState}`);

    if (this._callbacks.onStateChange) {
      this._callbacks.onStateChange(newState, oldState, data);
    }
  }

  /**
   * Report progress to listeners
   *
   * @param {string} stage - Current processing stage
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} [message] - Optional status message
   * @private
   */
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

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  /**
   * Start a new recording session
   *
   * @param {Object} [sessionOptions] - Session configuration
   * @param {string} [sessionOptions.title] - Session title
   * @param {string} [sessionOptions.date] - Session date (YYYY-MM-DD)
   * @param {Object} [sessionOptions.speakerMap] - Speaker ID to name mapping
   * @param {string} [sessionOptions.language] - Transcription language code
   * @param {Object} [sessionOptions.recordingOptions] - Audio recording options
   * @returns {Promise<void>}
   * @throws {Error} If session cannot be started
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
      // Initialize session data
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

      // Start audio recording
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
   * Stop the current recording session and process the audio
   *
   * @param {Object} [options] - Stop options
   * @param {boolean} [options.processImmediately=true] - Process transcription immediately
   * @returns {Promise<SessionData>} The session data with audio blob
   * @throws {Error} If no recording is in progress
   */
  async stopSession(options = {}) {
    if (!this.isRecording) {
      throw new Error('No recording in progress to stop.');
    }

    const processImmediately = options.processImmediately ?? true;

    this._logger.log('Stopping session...');

    try {
      // Stop audio recording
      const audioBlob = await this._audioRecorder.stopRecording();

      // Update session data
      this._currentSession.endTime = Date.now();
      this._currentSession.audioBlob = audioBlob;

      this._logger.log(`Recording stopped. Duration: ${this._getSessionDuration()}s`);

      // Process immediately if requested
      if (processImmediately) {
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

  /**
   * Pause the current recording
   *
   * @returns {void}
   * @throws {Error} If not recording
   */
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

  /**
   * Resume a paused recording
   *
   * @returns {void}
   * @throws {Error} If not paused
   */
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

  /**
   * Cancel the current session without saving
   *
   * @returns {void}
   */
  cancelSession() {
    if (!this.isSessionActive) {
      return;
    }

    this._logger.log('Cancelling session...');

    // Stop recording if active
    if (this._audioRecorder?.cancel) {
      this._audioRecorder.cancel();
    }

    // Clear session data
    this._currentSession = null;
    this._updateState(SessionState.IDLE);

    this._logger.log('Session cancelled');
  }

  // ============================================================================
  // Transcription Processing
  // ============================================================================

  /**
   * Process transcription for the current session
   *
   * @param {Object} [options] - Processing options
   * @param {Object} [options.speakerMap] - Override speaker mapping
   * @param {string} [options.language] - Override language
   * @returns {Promise<TranscriptionResult>} Transcription result
   * @throws {Error} If no audio to process
   */
  async processTranscription(options = {}) {
    if (!this._currentSession?.audioBlob) {
      throw new Error('No audio blob available for transcription.');
    }

    if (!this._transcriptionService) {
      throw new Error('Transcription service not configured.');
    }

    this._logger.log('Processing transcription...');
    this._updateState(SessionState.PROCESSING);

    try {
      const speakerMap = options.speakerMap || this._currentSession.speakerMap || {};
      const language = options.language || this._currentSession.language;

      // Determine current transcription mode
      const isLocalService = this._transcriptionService instanceof LocalWhisperService;
      const mode = this._transcriptionConfig?.mode || (isLocalService ? 'local' : 'api');

      this._reportProgress('transcription', 0, `Starting transcription (${mode} mode)...`);

      // Transcribe with speaker diarization
      let transcriptResult;
      try {
        transcriptResult = await this._transcriptionService.transcribe(
          this._currentSession.audioBlob,
          {
            speakerMap,
            language,
            onProgress: (progress) => {
              this._reportProgress('transcription', progress.progress,
                `Transcribing chunk ${progress.currentChunk}/${progress.totalChunks}`);
            }
          }
        );
      } catch (transcriptionError) {
        // Handle fallback for auto mode
        if (isLocalService && mode === 'auto') {
          this._logger.warn('Local transcription failed, attempting fallback to API...', transcriptionError.message);

          // Check if we have API key for fallback
          if (!this._transcriptionConfig?.openaiApiKey) {
            throw new Error(
              'Local transcription failed and no OpenAI API key configured for fallback. ' +
              `Error: ${transcriptionError.message}`
            );
          }

          this._reportProgress('transcription', 0, 'Falling back to API transcription...');

          // Create API service for fallback
          const apiService = new TranscriptionService(this._transcriptionConfig.openaiApiKey);

          this._logger.log('Using OpenAI API as fallback');

          // Retry with API service
          transcriptResult = await apiService.transcribe(
            this._currentSession.audioBlob,
            {
              speakerMap,
              language,
              onProgress: (progress) => {
                this._reportProgress('transcription', progress.progress,
                  `Transcribing chunk ${progress.currentChunk}/${progress.totalChunks} (API fallback)`);
              }
            }
          );

          this._logger.log('Fallback to API transcription successful');
        } else {
          // Re-throw if not in auto mode or not a local service error
          throw transcriptionError;
        }
      }

      this._currentSession.transcript = transcriptResult;
      this._reportProgress('transcription', 100, 'Transcription complete');

      this._logger.log(`Transcription complete: ${transcriptResult.segments?.length || 0} segments`);

      // Extract entities if enabled
      if (this._options.autoExtractEntities && this._entityExtractor) {
        await this._extractEntities();
      }

      // Generate images if enabled
      if (this._options.autoGenerateImages && this._imageGenerationService) {
        await this._generateImages();
      }

      this._updateState(SessionState.COMPLETE, { session: this._currentSession });

      // Notify completion
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

  // ============================================================================
  // Entity Extraction
  // ============================================================================

  /**
   * Extract entities from the transcription
   *
   * @param {Object} [options] - Extraction options
   * @returns {Promise<Object>} Extracted entities
   * @private
   */
  async _extractEntities(options = {}) {
    if (!this._currentSession?.transcript?.text) {
      this._logger.warn('No transcript text available for entity extraction');
      return null;
    }

    if (!this._entityExtractor) {
      this._logger.warn('Entity extractor not configured');
      return null;
    }

    this._logger.log('Extracting entities...');
    this._updateState(SessionState.EXTRACTING);
    this._reportProgress('extraction', 0, 'Extracting entities from transcript...');

    try {
      // Get existing entities from Kanka to avoid duplicates
      let existingEntities = [];
      if (this._kankaService) {
        try {
          existingEntities = await this._getExistingKankaEntities();
        } catch (error) {
          this._logger.warn('Could not fetch existing Kanka entities:', error.message);
        }
      }

      // Extract entities and salient moments
      const extractionResult = await this._entityExtractor.extractAll(
        this._currentSession.transcript.text,
        {
          existingEntities,
          ...options
        }
      );

      this._currentSession.entities = {
        characters: extractionResult.characters || [],
        locations: extractionResult.locations || [],
        items: extractionResult.items || []
      };
      this._currentSession.moments = extractionResult.moments || [];

      this._reportProgress('extraction', 100, 'Entity extraction complete');

      this._logger.log(
        `Extracted ${extractionResult.totalCount || 0} entities, ` +
        `${this._currentSession.moments.length} salient moments`
      );

      // Extract relationships if enabled
      if (this._options.autoExtractRelationships && this._entityExtractor.extractRelationships) {
        await this._extractRelationships(extractionResult);
      }

      return extractionResult;

    } catch (error) {
      this._logger.error('Entity extraction failed:', error);
      this._currentSession.errors.push({
        stage: 'extraction',
        error: error.message,
        timestamp: Date.now()
      });
      // Don't throw - extraction failure shouldn't stop the workflow
      return null;
    }
  }

  /**
   * Extract relationships from the transcription
   *
   * @param {Object} extractionResult - Entity extraction result
   * @returns {Promise<Array>} Extracted relationships
   * @private
   */
  async _extractRelationships(extractionResult) {
    if (!this._currentSession?.transcript?.text) {
      this._logger.warn('No transcript text available for relationship extraction');
      return null;
    }

    if (!this._entityExtractor?.extractRelationships) {
      this._logger.warn('Entity extractor does not support relationship extraction');
      return null;
    }

    this._logger.log('Extracting relationships...');
    this._reportProgress('extraction', 0, 'Extracting relationships from transcript...');

    try {
      // Build flat list of all entities
      const allEntities = [
        ...(extractionResult.characters || []),
        ...(extractionResult.locations || []),
        ...(extractionResult.items || [])
      ];

      if (allEntities.length === 0) {
        this._logger.debug('No entities to extract relationships for');
        return [];
      }

      // Extract relationships
      const relationships = await this._entityExtractor.extractRelationships(
        this._currentSession.transcript.text,
        allEntities,
        {
          campaignContext: this._currentSession.title,
          minConfidence: 5
        }
      );

      this._currentSession.relationships = relationships || [];

      this._reportProgress('extraction', 100, 'Relationship extraction complete');

      this._logger.log(`Extracted ${relationships?.length || 0} relationships`);

      return relationships;

    } catch (error) {
      this._logger.error('Relationship extraction failed:', error);
      this._currentSession.errors.push({
        stage: 'relationship_extraction',
        error: error.message,
        timestamp: Date.now()
      });
      // Don't throw - relationship extraction failure shouldn't stop the workflow
      return [];
    }
  }

  /**
   * Get list of existing entity names from Kanka
   *
   * @returns {Promise<string[]>} Array of entity names
   * @private
   */
  async _getExistingKankaEntities() {
    const names = [];

    try {
      // Fetch first page of each entity type
      const [characters, locations, items] = await Promise.all([
        this._kankaService.listCharacters({ page: 1 }),
        this._kankaService.listLocations({ page: 1 }),
        this._kankaService.listItems({ page: 1 })
      ]);

      if (characters?.data) {
        names.push(...characters.data.map(c => c.name));
      }
      if (locations?.data) {
        names.push(...locations.data.map(l => l.name));
      }
      if (items?.data) {
        names.push(...items.data.map(i => i.name));
      }

    } catch (error) {
      this._logger.warn('Failed to fetch existing entities:', error.message);
    }

    return names;
  }

  // ============================================================================
  // Image Generation
  // ============================================================================

  /**
   * Generate images for entities and moments
   *
   * @returns {Promise<Array>} Generated image results
   * @private
   */
  async _generateImages() {
    if (!this._imageGenerationService) {
      this._logger.warn('Image generation service not configured');
      return [];
    }

    const maxImages = this._options.maxImagesPerSession || 5;
    const requests = [];

    // Build image generation requests from moments
    if (this._currentSession.moments?.length > 0) {
      for (const moment of this._currentSession.moments.slice(0, maxImages)) {
        if (moment.imagePrompt) {
          requests.push({
            entityType: 'scene',
            description: moment.imagePrompt,
            options: { quality: this._options.imageQuality },
            meta: { momentId: moment.id, title: moment.title }
          });
        }
      }
    }

    // Add character portraits if we have room
    const remainingSlots = maxImages - requests.length;
    if (remainingSlots > 0 && this._currentSession.entities?.characters?.length > 0) {
      const npcs = this._currentSession.entities.characters
        .filter(c => c.isNPC)
        .slice(0, remainingSlots);

      for (const character of npcs) {
        requests.push({
          entityType: 'character',
          description: `${character.name}: ${character.description}`,
          options: { quality: this._options.imageQuality },
          meta: { characterName: character.name }
        });
      }
    }

    if (requests.length === 0) {
      this._logger.debug('No image generation requests');
      return [];
    }

    this._logger.log(`Generating ${requests.length} images...`);
    this._updateState(SessionState.GENERATING_IMAGES);
    this._reportProgress('images', 0, `Generating ${requests.length} images...`);

    try {
      const results = await this._imageGenerationService.generateBatch(
        requests,
        (progress) => {
          this._reportProgress('images', progress.progress,
            `Generating image ${progress.current}/${progress.total}`);
        }
      );

      // Store results with metadata
      this._currentSession.images = results.map((result, index) => ({
        ...result,
        meta: requests[index]?.meta || {}
      }));

      this._reportProgress('images', 100, 'Image generation complete');
      this._logger.log(`Generated ${results.filter(r => r.success !== false).length} images`);

      return results;

    } catch (error) {
      this._logger.error('Image generation failed:', error);
      this._currentSession.errors.push({
        stage: 'image_generation',
        error: error.message,
        timestamp: Date.now()
      });
      return [];
    }
  }

  // ============================================================================
  // Kanka Publishing
  // ============================================================================

  /**
   * Publish the session to Kanka
   * Creates journal entry (chronicle) and optionally entities with images
   *
   * @param {Object} [options] - Publishing options
   * @param {boolean} [options.createEntities=true] - Create character/location/item entities
   * @param {boolean} [options.uploadImages=true] - Upload generated images to entities
   * @param {boolean} [options.createChronicle=true] - Create journal entry
   * @returns {Promise<KankaPublishResult>} Publishing results
   * @throws {Error} If publishing fails
   */
  async publishToKanka(options = {}) {
    if (!this._currentSession) {
      throw new Error('No session data available to publish.');
    }

    if (!this._kankaService) {
      throw new Error('Kanka service not configured.');
    }

    const createEntities = options.createEntities ?? true;
    const uploadImages = options.uploadImages ?? true;
    const createChronicle = options.createChronicle ?? true;

    this._logger.log('Publishing to Kanka...');
    this._updateState(SessionState.PUBLISHING);
    this._reportProgress('publishing', 0, 'Preparing Kanka export...');

    const results = {
      journal: null,
      characters: [],
      locations: [],
      items: [],
      images: [],
      errors: []
    };

    try {
      // Create entities first (so we can link them to the journal)
      if (createEntities && this._currentSession.entities) {
        await this._createKankaEntities(results, uploadImages);
      }

      // Create chronicle journal
      if (createChronicle) {
        await this._createKankaChronicle(results);
      }

      this._currentSession.kankaResults = results;
      this._reportProgress('publishing', 100, 'Publishing complete');

      this._logger.log('Published to Kanka successfully');

      return results;

    } catch (error) {
      this._logger.error('Publishing failed:', error);
      this._handleError(error, 'publishToKanka');
      throw error;
    }
  }

  /**
   * Create entities in Kanka
   *
   * @param {Object} results - Results object to populate
   * @param {boolean} uploadImages - Whether to upload images
   * @returns {Promise<void>}
   * @private
   */
  async _createKankaEntities(results, uploadImages) {
    const entities = this._currentSession.entities;

    // Create characters
    if (entities.characters?.length > 0) {
      this._reportProgress('publishing', 20, 'Creating characters...');

      for (const character of entities.characters) {
        try {
          const created = await this._kankaService.createIfNotExists('characters', {
            name: character.name,
            entry: character.description,
            type: character.isNPC ? 'NPC' : 'PC'
          });

          if (!created._alreadyExisted) {
            results.characters.push(created);

            // Upload portrait if available
            if (uploadImages) {
              const portrait = this._findImageForEntity('character', character.name);
              if (portrait?.url) {
                try {
                  await this._kankaService.uploadCharacterImage(created.id, portrait.url);
                  results.images.push({ entityId: created.id, entityType: 'character' });
                } catch (imgError) {
                  this._logger.warn(`Failed to upload portrait for ${character.name}:`, imgError.message);
                }
              }
            }
          }
        } catch (error) {
          results.errors.push({ entity: character.name, type: 'character', error: error.message });
        }
      }
    }

    // Create locations
    if (entities.locations?.length > 0) {
      this._reportProgress('publishing', 40, 'Creating locations...');

      for (const location of entities.locations) {
        try {
          const created = await this._kankaService.createIfNotExists('locations', {
            name: location.name,
            entry: location.description,
            type: location.type
          });

          if (!created._alreadyExisted) {
            results.locations.push(created);
          }
        } catch (error) {
          results.errors.push({ entity: location.name, type: 'location', error: error.message });
        }
      }
    }

    // Create items
    if (entities.items?.length > 0) {
      this._reportProgress('publishing', 60, 'Creating items...');

      for (const item of entities.items) {
        try {
          const created = await this._kankaService.createIfNotExists('items', {
            name: item.name,
            entry: item.description,
            type: item.type
          });

          if (!created._alreadyExisted) {
            results.items.push(created);
          }
        } catch (error) {
          results.errors.push({ entity: item.name, type: 'item', error: error.message });
        }
      }
    }
  }

  /**
   * Create chronicle journal in Kanka
   *
   * @param {Object} results - Results object to populate
   * @returns {Promise<void>}
   * @private
   */
  async _createKankaChronicle(results) {
    this._reportProgress('publishing', 80, 'Creating chronicle...');

    // Format chronicle using NarrativeExporter if available
    let chronicleData;

    if (this._narrativeExporter) {
      chronicleData = this._narrativeExporter.export({
        title: this._currentSession.title,
        date: this._currentSession.date,
        segments: this._currentSession.transcript?.segments || [],
        entities: this._currentSession.entities,
        moments: this._currentSession.moments
      }, {
        format: this._options.chronicleFormat,
        includeEntities: true,
        includeMoments: true,
        includeTimestamps: false
      });
    } else {
      // Basic chronicle without NarrativeExporter
      chronicleData = {
        name: this._currentSession.title,
        entry: this._formatBasicChronicle(),
        type: 'Session Chronicle',
        date: this._currentSession.date
      };
    }

    try {
      const journal = await this._kankaService.createJournal(chronicleData);
      results.journal = journal;

      this._currentSession.chronicle = journal;
      this._logger.log(`Chronicle created: ${journal.name} (ID: ${journal.id})`);

    } catch (error) {
      results.errors.push({ entity: chronicleData.name, type: 'journal', error: error.message });
      throw error;
    }
  }

  /**
   * Format a basic chronicle without NarrativeExporter
   *
   * @returns {string} Basic HTML chronicle content
   * @private
   */
  _formatBasicChronicle() {
    const parts = [];
    const session = this._currentSession;

    // Header
    parts.push(`<h2>${session.title}</h2>`);
    parts.push(`<p><em>Date: ${session.date}</em></p>`);

    // Summary of entities
    if (session.entities) {
      const entityCount =
        (session.entities.characters?.length || 0) +
        (session.entities.locations?.length || 0) +
        (session.entities.items?.length || 0);

      if (entityCount > 0) {
        parts.push(`<p>This session introduced ${entityCount} new entities.</p>`);
      }
    }

    // Basic transcript
    if (session.transcript?.segments?.length > 0) {
      parts.push('<h3>Transcript</h3>');
      parts.push('<div class="transcript">');

      for (const segment of session.transcript.segments.slice(0, 50)) {
        const speaker = segment.speaker || 'Unknown';
        const text = segment.text || '';
        parts.push(`<p><strong>${speaker}:</strong> ${text}</p>`);
      }

      if (session.transcript.segments.length > 50) {
        parts.push(`<p><em>... and ${session.transcript.segments.length - 50} more segments</em></p>`);
      }

      parts.push('</div>');
    }

    parts.push('<hr>');
    parts.push('<p><em>Generated by VoxChronicle</em></p>');

    return parts.join('\n');
  }

  /**
   * Find a generated image for an entity
   *
   * @param {string} entityType - Entity type
   * @param {string} entityName - Entity name
   * @returns {Object|null} Image result or null
   * @private
   */
  _findImageForEntity(entityType, entityName) {
    if (!this._currentSession.images?.length) {
      return null;
    }

    return this._currentSession.images.find(img => {
      if (img.success === false) return false;
      if (img.entityType !== entityType) return false;
      if (img.meta?.characterName === entityName) return true;
      return false;
    }) || null;
  }

  // ============================================================================
  // Service Management
  // ============================================================================

  /**
   * Update service instances
   *
   * @param {Object} services - Service instances to update
   */
  setServices(services) {
    if (services.audioRecorder !== undefined) {
      this._audioRecorder = services.audioRecorder;
    }
    if (services.transcriptionService !== undefined) {
      this._transcriptionService = services.transcriptionService;
    }
    if (services.entityExtractor !== undefined) {
      this._entityExtractor = services.entityExtractor;
    }
    if (services.imageGenerationService !== undefined) {
      this._imageGenerationService = services.imageGenerationService;
    }
    if (services.kankaService !== undefined) {
      this._kankaService = services.kankaService;
    }
    if (services.narrativeExporter !== undefined) {
      this._narrativeExporter = services.narrativeExporter;
    }

    this._logger.debug('Services updated');
  }

  /**
   * Update options
   *
   * @param {Object} options - Options to update
   */
  setOptions(options) {
    this._options = { ...this._options, ...options };
    this._logger.debug('Options updated');
  }

  /**
   * Set transcription configuration for fallback support
   *
   * @param {Object} config - Transcription configuration
   * @param {string} config.mode - Transcription mode ('api', 'local', or 'auto')
   * @param {string} [config.openaiApiKey] - OpenAI API key for fallback
   * @param {string} [config.whisperBackendUrl] - Whisper backend URL
   */
  setTranscriptionConfig(config) {
    this._transcriptionConfig = config;
    this._logger.debug('Transcription config updated for fallback support');
  }

  /**
   * Get current options
   *
   * @returns {Object} Current options
   */
  getOptions() {
    return { ...this._options };
  }

  /**
   * Check if all required services are configured
   *
   * @returns {Object} Service status
   */
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
      canPublish: !!this._kankaService
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Generate a unique session ID
   *
   * @returns {string} Session ID
   * @private
   */
  _generateSessionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `session-${timestamp}-${random}`;
  }

  /**
   * Get session duration in seconds
   *
   * @returns {number} Duration in seconds
   * @private
   */
  _getSessionDuration() {
    if (!this._currentSession?.startTime) return 0;
    const endTime = this._currentSession.endTime || Date.now();
    return Math.floor((endTime - this._currentSession.startTime) / 1000);
  }

  /**
   * Handle and log errors
   *
   * @param {Error} error - Error object
   * @param {string} stage - Stage where error occurred
   * @private
   */
  _handleError(error, stage) {
    this._updateState(SessionState.ERROR, { error, stage });

    if (this._currentSession) {
      this._currentSession.errors.push({
        stage,
        error: error.message,
        timestamp: Date.now()
      });
    }

    if (this._callbacks.onError) {
      this._callbacks.onError(error, stage);
    }
  }

  /**
   * Reset orchestrator to idle state
   * Clears current session data
   */
  reset() {
    if (this._audioRecorder?.cancel) {
      this._audioRecorder.cancel();
    }

    this._currentSession = null;
    this._state = SessionState.IDLE;
    this._logger.debug('Orchestrator reset');
  }

  /**
   * Get a summary of the current session
   *
   * @returns {Object|null} Session summary or null
   */
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
      entityCount: this._currentSession.entities ? (
        (this._currentSession.entities.characters?.length || 0) +
        (this._currentSession.entities.locations?.length || 0) +
        (this._currentSession.entities.items?.length || 0)
      ) : 0,
      relationshipCount: this._currentSession.relationships?.length || 0,
      momentCount: this._currentSession.moments?.length || 0,
      imageCount: this._currentSession.images?.filter(i => i.success !== false).length || 0,
      hasChronicle: !!this._currentSession.chronicle,
      errorCount: this._currentSession.errors?.length || 0
    };
  }
}

/**
 * @typedef {Object} SessionData
 * @property {string} id - Unique session identifier
 * @property {string} title - Session title
 * @property {string} date - Session date (YYYY-MM-DD)
 * @property {number} startTime - Session start timestamp
 * @property {number|null} endTime - Session end timestamp
 * @property {Object} speakerMap - Speaker ID to name mapping
 * @property {string|null} language - Transcription language
 * @property {Blob|null} audioBlob - Recorded audio blob
 * @property {Object|null} transcript - Transcription result
 * @property {Object|null} entities - Extracted entities
 * @property {Array|null} relationships - Extracted relationships between entities
 * @property {Array|null} moments - Salient moments
 * @property {Array} images - Generated images
 * @property {Object|null} chronicle - Created Kanka journal
 * @property {Object|null} kankaResults - Full Kanka publishing results
 * @property {Array} errors - Array of errors encountered
 */

/**
 * @typedef {Object} KankaPublishResult
 * @property {Object|null} journal - Created journal entry
 * @property {Array} characters - Created character entities
 * @property {Array} locations - Created location entities
 * @property {Array} items - Created item entities
 * @property {Array} images - Uploaded images
 * @property {Array} errors - Publishing errors
 */

// Export all classes and enums
export {
  SessionOrchestrator,
  SessionState,
  DEFAULT_SESSION_OPTIONS
};
