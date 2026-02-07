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
import { TranscriptionService } from '../ai/TranscriptionService.mjs';
import { ImageGenerationService } from '../ai/ImageGenerationService.mjs';
import { KankaService } from '../kanka/KankaService.mjs';
import { EntityExtractor } from '../ai/EntityExtractor.mjs';
import { NarrativeExporter } from '../kanka/NarrativeExporter.mjs';

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
    /** @type {Object|null} Audio recording service */
    this.audioRecorder = null;

    /** @type {Object|null} OpenAI transcription service */
    this.transcriptionService = null;

    /** @type {Object|null} OpenAI image generation service */
    this.imageGenerationService = null;

    /** @type {Object|null} Kanka API service */
    this.kankaService = null;

    /** @type {Object|null} Entity extraction service */
    this.entityExtractor = null;

    /** @type {Object|null} Narrative exporter for chronicle formatting */
    this.narrativeExporter = null;

    /** @type {Object|null} Session orchestrator */
    this.sessionOrchestrator = null;

    // State tracking
    /** @type {boolean} Whether the module is fully initialized */
    this.isInitialized = false;

    /** @type {boolean} Whether a recording session is active */
    this.isRecording = false;

    /** @type {Object|null} Current session data */
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
      console.warn(`${MODULE_ID} | VoxChronicle already initialized`);
      return;
    }

    console.log(`${MODULE_ID} | Initializing VoxChronicle services...`);

    try {
      // Get API keys from settings
      const openaiApiKey = this._getSetting('openaiApiKey');
      const kankaApiToken = this._getSetting('kankaApiToken');
      const kankaCampaignId = this._getSetting('kankaCampaignId');
      const audioSettings = {
        echoCancellation: this._getSetting('echoCancellation') ?? true,
        noiseSuppression: this._getSetting('noiseSuppression') ?? true
      };

      // Validate and warn about missing settings
      if (!openaiApiKey) {
        console.warn(`${MODULE_ID} | OpenAI API key not configured`);
      }
      if (!kankaApiToken || !kankaCampaignId) {
        console.warn(`${MODULE_ID} | Kanka API settings not configured`);
      }

      // Initialize audio recorder (always available)
      this.audioRecorder = new AudioRecorder(audioSettings);

      // Initialize OpenAI services (if API key configured)
      if (openaiApiKey) {
        this.transcriptionService = new TranscriptionService(openaiApiKey);
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

      // Check Kanka API token expiration
      await this._checkKankaTokenExpiration();

      // Mark as initialized
      this.isInitialized = true;
      console.log(`${MODULE_ID} | VoxChronicle services initialized successfully`);
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to initialize services:`, error);
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
    } catch (error) {
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
        console.log(`${MODULE_ID} | Kanka API token timestamp initialized (migration)`);
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
        console.warn(`${MODULE_ID} | Kanka API token expires in ${daysRemaining} days (CRITICAL)`);
      } else if (daysRemaining <= 60) {
        // Urgent: 60 days or less
        const message = game.i18n.format('VOXCHRONICLE.Kanka.TokenExpiringUrgent', {
          days: daysRemaining
        });
        ui.notifications.warn(message, { permanent: true });
        console.warn(`${MODULE_ID} | Kanka API token expires in ${daysRemaining} days (URGENT)`);
      } else if (daysRemaining <= 90) {
        // Info: 90 days or less
        const message = game.i18n.format('VOXCHRONICLE.Kanka.TokenExpiring', {
          days: daysRemaining
        });
        ui.notifications.info(message);
        console.info(`${MODULE_ID} | Kanka API token expires in ${daysRemaining} days`);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to check Kanka token expiration:`, error);
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

    console.log(`${MODULE_ID} | Starting recording session...`);

    this.isRecording = true;
    this.currentSession = {
      startTime: Date.now(),
      audioBlobs: [],
      transcript: null,
      entities: []
    };

    // Audio recording will be started by the audioRecorder service
    // await this.audioRecorder.startRecording();

    console.log(`${MODULE_ID} | Recording session started`);
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

    console.log(`${MODULE_ID} | Stopping recording session...`);

    this.isRecording = false;

    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
    }

    // Audio recording will be stopped by the audioRecorder service
    // const audioBlob = await this.audioRecorder.stopRecording();

    console.log(`${MODULE_ID} | Recording session stopped`);

    // Return placeholder - will return actual blob from audioRecorder
    return null;
  }

  /**
   * Process a completed recording session
   * Transcribes audio, extracts entities, and prepares for Kanka export
   *
   * @param {Blob} audioBlob - The recorded audio blob
   * @returns {Promise<Object>} The processed session data
   */
  async processSession(audioBlob) {
    if (!this.transcriptionService) {
      throw new Error('Transcription service not initialized');
    }

    console.log(`${MODULE_ID} | Processing recording session...`);

    // Get speaker labels from settings
    const speakerLabels = this._getSetting('speakerLabels') || {};
    const transcriptionLanguage = this._getSetting('transcriptionLanguage') || null;

    // Transcription and entity extraction will be performed here
    // const transcript = await this.transcriptionService.transcribe(audioBlob, speakerLabels, transcriptionLanguage);
    // const entities = await this.entityExtractor.extractEntities(transcript.text);

    console.log(`${MODULE_ID} | Session processing complete`);

    return {
      transcript: null,
      entities: [],
      salientMoments: []
    };
  }

  /**
   * Publish a processed session to Kanka
   *
   * @param {Object} sessionData - The processed session data
   * @returns {Promise<Object>} The created Kanka entities
   */
  async publishToKanka(sessionData) {
    if (!this.kankaService) {
      throw new Error('Kanka service not initialized');
    }

    console.log(`${MODULE_ID} | Publishing to Kanka...`);

    // Kanka publishing will be handled here
    // const journal = await this.kankaService.createJournal(sessionData);

    console.log(`${MODULE_ID} | Published to Kanka successfully`);

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
   * @returns {Object} Status of each service
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
        kankaConfigured: !!(this._getSetting('kankaApiToken') && this._getSetting('kankaCampaignId'))
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
