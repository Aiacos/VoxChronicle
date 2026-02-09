/**
 * VoxChronicle - Main Module Singleton Class
 *
 * Central controller for the VoxChronicle module. Manages all services
 * and provides a single point of access for module functionality.
 *
 * Uses the singleton pattern to ensure only one instance exists.
 *
 * @class VoxChronicle
 * @module vox-chronicle
 */

import { MODULE_ID } from '../main.mjs';
import { SessionOrchestrator } from '../orchestration/SessionOrchestrator.mjs';
import { AudioRecorder } from '../audio/AudioRecorder.mjs';
import { TranscriptionFactory } from '../ai/TranscriptionFactory.mjs';
import { ImageGenerationService } from '../ai/ImageGenerationService.mjs';
import { KankaService } from '../kanka/KankaService.mjs';
import { EntityExtractor } from '../ai/EntityExtractor.mjs';
import { NarrativeExporter } from '../kanka/NarrativeExporter.mjs';
import { VocabularyDictionary } from './VocabularyDictionary.mjs';
import { Logger } from '../utils/Logger.mjs';

// Create logger instance for VoxChronicle
const logger = Logger.createChild('VoxChronicle');

/**
 * Main VoxChronicle singleton class
 * Manages audio capture, transcription, image generation, and Kanka integration
 */
class VoxChronicle {
  /** @type {VoxChronicle|null} Singleton instance */
  static instance = null;

  /**
   * Private constructor - use getInstance() to access
   * @private
   */
  constructor() {
    // Service references - initialized in initialize()
    /** @type {object | null} Audio recording service */
    this.audioRecorder = null;

    /** @type {object | null} OpenAI transcription service */
    this.transcriptionService = null;

    /** @type {object | null} OpenAI image generation service */
    this.imageGenerationService = null;

    /** @type {object | null} Kanka API service */
    this.kankaService = null;

    /** @type {object | null} Entity extraction service */
    this.entityExtractor = null;

    /** @type {object | null} Narrative exporter for chronicle formatting */
    this.narrativeExporter = null;

    /** @type {object | null} Session orchestrator */
    this.sessionOrchestrator = null;

    // State tracking
    /** @type {boolean} Whether the module is fully initialized */
    this.isInitialized = false;

    /** @type {boolean} Whether a recording session is active */
    this.isRecording = false;

    /** @type {object | null} Current session data */
    this.currentSession = null;
  }

  /**
   * Get the singleton instance of VoxChronicle
   * Creates the instance if it doesn't exist
   *
   * @returns {VoxChronicle} The singleton instance
   * @static
   */
  static getInstance() {
    if (!VoxChronicle.instance) {
      VoxChronicle.instance = new VoxChronicle();
    }
    return VoxChronicle.instance;
  }

  /**
   * Initialize all module services
   * Called from the 'ready' hook when Foundry VTT is fully loaded
   *
   * @returns {Promise<void>}
   * @throws {Error} If initialization fails
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('VoxChronicle already initialized');
      return;
    }

    logger.info('Initializing VoxChronicle services...');

    try {
      // Get API keys from settings
      const openaiApiKey = this._getSetting('openaiApiKey');
      const kankaApiToken = this._getSetting('kankaApiToken');
      const kankaCampaignId = this._getSetting('kankaCampaignId');
      const audioSettings = {
        echoCancellation: this._getSetting('echoCancellation') ?? true,
        noiseSuppression: this._getSetting('noiseSuppression') ?? true
      };

      // Get transcription mode settings
      const transcriptionMode = this._getSetting('transcriptionMode') || 'auto';
      const whisperBackendUrl = this._getSetting('whisperBackendUrl');

      // Validate and warn about missing settings
      if (!openaiApiKey && transcriptionMode !== 'local') {
        logger.warn('OpenAI API key not configured');
      }
      if (!kankaApiToken || !kankaCampaignId) {
        logger.warn('Kanka API settings not configured');
      }

      // Initialize audio recorder (always available)
      this.audioRecorder = new AudioRecorder(audioSettings);

      // Initialize transcription service using factory
      try {
        this.transcriptionService = await TranscriptionFactory.create({
          mode: transcriptionMode,
          openaiApiKey: openaiApiKey,
          whisperBackendUrl: whisperBackendUrl
        });
        logger.info(`Transcription service initialized with mode: ${transcriptionMode}`);
      } catch (error) {
        logger.warn(`Failed to create transcription service: ${error.message}`);
      }

      // Initialize other OpenAI services (if API key configured)
      if (openaiApiKey) {
        this.imageGenerationService = new ImageGenerationService(openaiApiKey);
        this.entityExtractor = new EntityExtractor(openaiApiKey);
      }

      // Initialize Kanka services (if configured)
      if (kankaApiToken && kankaCampaignId) {
        this.kankaService = new KankaService(kankaApiToken, kankaCampaignId);
        this.narrativeExporter = new NarrativeExporter();
        // Set OpenAI client on narrative exporter for AI summaries
        if (this.transcriptionService) {
          this.narrativeExporter.setOpenAIClient(openaiApiKey);
        }
      }

      // Initialize session orchestrator with available services
      this.sessionOrchestrator = new SessionOrchestrator({
        audioRecorder: this.audioRecorder,
        transcriptionService: this.transcriptionService,
        entityExtractor: this.entityExtractor,
        imageGenerationService: this.imageGenerationService,
        kankaService: this.kankaService,
        narrativeExporter: this.narrativeExporter
      });

      // Set transcription config for auto-mode fallback support
      this.sessionOrchestrator.setTranscriptionConfig({
        mode: transcriptionMode,
        openaiApiKey: openaiApiKey,
        whisperBackendUrl: whisperBackendUrl
      });

      // Check Kanka API token expiration
      await this._checkKankaTokenExpiration();

      // Initialize vocabulary dictionary with default D&D terms if empty
      const vocabularyDictionary = new VocabularyDictionary();
      await vocabularyDictionary.initialize();

      // Mark as initialized
      this.isInitialized = true;
      logger.info('VoxChronicle services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Safely get a module setting with error handling
   *
   * @param {string} key - The setting key
   * @returns {*} The setting value or null if not found
   * @private
   */
  _getSetting(key) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch {
      // Setting not registered yet or doesn't exist
      return null;
    }
  }

  /**
   * Check if the Kanka API token is approaching expiration and warn the user
   * Kanka API tokens expire after 364 days
   *
   * @returns {Promise<void>}
   * @private
   */
  async _checkKankaTokenExpiration() {
    try {
      const kankaApiToken = this._getSetting('kankaApiToken');

      // Only check if token is configured
      if (!kankaApiToken) {
        return;
      }

      let tokenCreatedAt = this._getSetting('kankaApiTokenCreatedAt');

      // Migration: if token exists but no timestamp, set it now
      if (!tokenCreatedAt) {
        tokenCreatedAt = Date.now();
        await game.settings.set(MODULE_ID, 'kankaApiTokenCreatedAt', tokenCreatedAt);
        logger.info('Kanka API token timestamp initialized (migration)');
        return; // Don't warn on first run after migration
      }

      // Calculate days since token was created
      const daysSinceCreation = (Date.now() - tokenCreatedAt) / (1000 * 60 * 60 * 24);
      const daysRemaining = Math.floor(364 - daysSinceCreation);

      // Show warning based on days remaining
      if (daysRemaining <= 30) {
        // Critical: 30 days or less
        const message = game.i18n.format('VOXCHRONICLE.Kanka.TokenExpiringCritical', {
          days: daysRemaining
        });
        ui.notifications.error(message, { permanent: true });
        logger.warn(`Kanka API token expires in ${daysRemaining} days (CRITICAL)`);
      } else if (daysRemaining <= 60) {
        // Urgent: 60 days or less
        const message = game.i18n.format('VOXCHRONICLE.Kanka.TokenExpiringUrgent', {
          days: daysRemaining
        });
        ui.notifications.warn(message, { permanent: true });
        logger.warn(`Kanka API token expires in ${daysRemaining} days (URGENT)`);
      } else if (daysRemaining <= 90) {
        // Info: 90 days or less
        const message = game.i18n.format('VOXCHRONICLE.Kanka.TokenExpiring', {
          days: daysRemaining
        });
        ui.notifications.info(message);
        logger.info(`Kanka API token expires in ${daysRemaining} days`);
      }
    } catch (error) {
      logger.error('Failed to check Kanka token expiration:', error);
      // Don't throw - this is a non-critical check
    }
  }

  /**
   * Start a new recording session
   *
   * @returns {Promise<void>}
   * @throws {Error} If recording cannot be started
   */
  async startRecording() {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    if (!this.audioRecorder) {
      throw new Error('Audio recorder not initialized');
    }

    logger.info('Starting recording session...');

    this.isRecording = true;
    this.currentSession = {
      startTime: Date.now(),
      audioBlobs: [],
      transcript: null,
      entities: []
    };

    // Audio recording will be started by the audioRecorder service
    // await this.audioRecorder.startRecording();

    logger.info('Recording session started');
  }

  /**
   * Stop the current recording session
   *
   * @returns {Promise<Blob>} The recorded audio blob
   * @throws {Error} If no recording is in progress
   */
  async stopRecording() {
    if (!this.isRecording) {
      throw new Error('No recording in progress');
    }

    logger.info('Stopping recording session...');

    this.isRecording = false;

    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
    }

    // Audio recording will be stopped by the audioRecorder service
    // const audioBlob = await this.audioRecorder.stopRecording();

    logger.info('Recording session stopped');

    // Return placeholder - will return actual blob from audioRecorder
    return null;
  }

  /**
   * Process a completed recording session
   * Transcribes audio, extracts entities, and prepares for Kanka export
   *
   * @param {Blob} _audioBlob - The recorded audio blob
   * @returns {Promise<object>} The processed session data
   */
  async processSession(_audioBlob) {
    if (!this.transcriptionService) {
      throw new Error('Transcription service not initialized');
    }

    logger.info('Processing recording session...');

    // Get speaker labels from settings
    const _speakerLabels = this._getSetting('speakerLabels') || {};
    const _transcriptionLanguage = this._getSetting('transcriptionLanguage') || null;

    // Transcription and entity extraction will be performed here
    // const transcript = await this.transcriptionService.transcribe(audioBlob, speakerLabels, transcriptionLanguage);
    // const entities = await this.entityExtractor.extractEntities(transcript.text);

    logger.info('Session processing complete');

    return {
      transcript: null,
      entities: [],
      salientMoments: []
    };
  }

  /**
   * Publish a processed session to Kanka
   *
   * @param {object} _sessionData - The processed session data
   * @returns {Promise<object>} The created Kanka entities
   */
  async publishToKanka(_sessionData) {
    if (!this.kankaService) {
      throw new Error('Kanka service not initialized');
    }

    logger.info('Publishing to Kanka...');

    // Kanka publishing will be handled here
    // const journal = await this.kankaService.createJournal(sessionData);

    logger.info('Published to Kanka successfully');

    return {
      journal: null,
      characters: [],
      locations: [],
      items: []
    };
  }

  /**
   * Check if all required services are configured and ready
   *
   * @returns {object} Status of each service
   */
  getServicesStatus() {
    return {
      initialized: this.isInitialized,
      recording: this.isRecording,
      services: {
        audioRecorder: !!this.audioRecorder,
        transcription: !!this.transcriptionService,
        imageGeneration: !!this.imageGenerationService,
        kanka: !!this.kankaService,
        entityExtractor: !!this.entityExtractor,
        narrativeExporter: !!this.narrativeExporter,
        sessionOrchestrator: !!this.sessionOrchestrator
      },
      settings: {
        openaiConfigured: !!this._getSetting('openaiApiKey'),
        kankaConfigured: !!(
          this._getSetting('kankaApiToken') && this._getSetting('kankaCampaignId')
        )
      }
    };
  }

  /**
   * Reset the singleton instance (primarily for testing)
   *
   * @static
   */
  static resetInstance() {
    if (VoxChronicle.instance) {
      VoxChronicle.instance.isInitialized = false;
      VoxChronicle.instance.isRecording = false;
      VoxChronicle.instance.currentSession = null;
    }
    VoxChronicle.instance = null;
  }
}

export { VoxChronicle };
