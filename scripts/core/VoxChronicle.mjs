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

import { MODULE_ID } from '../constants.mjs';
import { SessionOrchestrator } from '../orchestration/SessionOrchestrator.mjs';
import { AudioRecorder } from '../audio/AudioRecorder.mjs';
import { TranscriptionFactory } from '../ai/TranscriptionFactory.mjs';
import { ImageGenerationService } from '../ai/ImageGenerationService.mjs';
import { KankaService } from '../kanka/KankaService.mjs';
import { EntityExtractor } from '../ai/EntityExtractor.mjs';
import { NarrativeExporter } from '../kanka/NarrativeExporter.mjs';
import { VocabularyDictionary } from './VocabularyDictionary.mjs';
import { JournalParser } from '../narrator/JournalParser.mjs';
import { CompendiumParser } from '../narrator/CompendiumParser.mjs';
import { ChapterTracker } from '../narrator/ChapterTracker.mjs';
import { SceneDetector } from '../narrator/SceneDetector.mjs';
import { AIAssistant } from '../narrator/AIAssistant.mjs';
import { RulesReference } from '../narrator/RulesReference.mjs';
import { SessionAnalytics } from '../narrator/SessionAnalytics.mjs';
import { Logger } from '../utils/Logger.mjs';
// RAG (Retrieval-Augmented Generation) services
import { OpenAIClient } from '../ai/OpenAIClient.mjs';
import { EmbeddingService } from '../ai/EmbeddingService.mjs';
import { RAGVectorStore } from '../ai/RAGVectorStore.mjs';
import { RAGRetriever } from '../narrator/RAGRetriever.mjs';
import { SilenceDetector } from '../narrator/SilenceDetector.mjs';
import { Settings } from './Settings.mjs';

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

    // Narrator Master services
    /** @type {object | null} Journal content parser */
    this.journalParser = null;

    /** @type {object | null} Compendium content parser */
    this.compendiumParser = null;

    /** @type {object | null} Chapter tracking for live sessions */
    this.chapterTracker = null;

    /** @type {object | null} Scene transition detector */
    this.sceneDetector = null;

    /** @type {object | null} AI assistant for GM suggestions */
    this.aiAssistant = null;

    /** @type {object | null} Rules reference lookup */
    this.rulesReference = null;

    /** @type {object | null} Session analytics tracker */
    this.sessionAnalytics = null;

    // RAG (Retrieval-Augmented Generation) services
    /** @type {object | null} OpenAI client for RAG embedding requests */
    this.ragOpenAIClient = null;

    /** @type {object | null} Embedding service for generating vector embeddings */
    this.embeddingService = null;

    /** @type {object | null} Vector store for RAG embeddings */
    this.ragVectorStore = null;

    /** @type {object | null} RAG retriever for hybrid search */
    this.ragRetriever = null;

    /** @type {object | null} Silence detector for autonomous suggestions */
    this.silenceDetector = null;

    // State tracking
    /** @type {boolean} Whether the module is fully initialized */
    this.isInitialized = false;
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

      // Initialize Narrator Master services
      this.journalParser = new JournalParser();
      this.compendiumParser = new CompendiumParser();
      this.chapterTracker = new ChapterTracker(this.journalParser);
      this.sceneDetector = new SceneDetector();
      this.sessionAnalytics = new SessionAnalytics();

      // Initialize AI-dependent narrator services (if OpenAI configured)
      if (openaiApiKey) {
        this.aiAssistant = new AIAssistant(openaiApiKey, {
          journalParser: this.journalParser
        });
      }

      // Initialize rules reference (if enabled)
      const rulesDetection = this._getSetting('rulesDetection');
      if (rulesDetection !== false) {
        this.rulesReference = new RulesReference(this.compendiumParser);
      }

      // Initialize RAG services (if enabled and OpenAI configured)
      await this._initializeRAGServices(openaiApiKey);

      // Connect debug mode
      const debugMode = this._getSetting('debugMode');
      if (debugMode) {
        Logger.setDebugMode(true);
      }

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
   * Initialize RAG (Retrieval-Augmented Generation) services
   * Creates embedding service, vector store, retriever, and silence detector
   *
   * @param {string} openaiApiKey - OpenAI API key for embedding generation
   * @returns {Promise<void>}
   * @private
   */
  async _initializeRAGServices(openaiApiKey) {
    try {
      // Get RAG settings
      const ragSettings = Settings.getRAGSettings();

      // Check if RAG is enabled
      if (!ragSettings.enabled) {
        logger.info('RAG services disabled in settings');
        return;
      }

      // Check if OpenAI is configured (required for embeddings)
      if (!openaiApiKey) {
        logger.warn('RAG services require OpenAI API key - skipping initialization');
        return;
      }

      logger.info('Initializing RAG services...');

      // Create dedicated OpenAI client for RAG operations
      this.ragOpenAIClient = new OpenAIClient(openaiApiKey);

      // Initialize Embedding Service
      this.embeddingService = new EmbeddingService({
        openaiClient: this.ragOpenAIClient,
        model: ragSettings.embeddingModel,
        dimensions: ragSettings.embeddingDimensions,
        chunkSize: ragSettings.chunkSize,
        chunkOverlap: ragSettings.chunkOverlap
      });

      // Initialize RAG Vector Store
      this.ragVectorStore = new RAGVectorStore({
        embeddingService: this.embeddingService,
        maxSizeInMB: ragSettings.storageLimitMB,
        dimensions: ragSettings.embeddingDimensions,
        model: ragSettings.embeddingModel,
        persistToIndexedDB: true
      });

      // Initialize the vector store (opens IndexedDB connection)
      await this.ragVectorStore.initialize();

      // Initialize RAG Retriever (hybrid semantic + keyword search)
      this.ragRetriever = new RAGRetriever({
        embeddingService: this.embeddingService,
        vectorStore: this.ragVectorStore,
        journalParser: this.journalParser,
        compendiumParser: this.compendiumParser,
        similarityThreshold: ragSettings.similarityThreshold,
        maxResults: ragSettings.maxResults
      });

      // Initialize Silence Detector for autonomous suggestions
      this.silenceDetector = new SilenceDetector({
        thresholdMs: ragSettings.silenceThresholdMs,
        autoRestart: true
      });

      // Connect RAG services to AIAssistant if available
      if (this.aiAssistant) {
        this.aiAssistant.setRAGRetriever(this.ragRetriever);
        this.aiAssistant.setSilenceDetector(this.silenceDetector);
        logger.debug('RAG services connected to AIAssistant');
      }

      logger.info('RAG services initialized successfully', {
        embeddingModel: ragSettings.embeddingModel,
        dimensions: ragSettings.embeddingDimensions,
        storageLimitMB: ragSettings.storageLimitMB,
        silenceThresholdMs: ragSettings.silenceThresholdMs
      });
    } catch (error) {
      logger.error('Failed to initialize RAG services:', error);
      // Don't throw - RAG is optional functionality
    }
  }

  /**
   * Check if all required services are configured and ready
   *
   * @returns {object} Status of each service
   */
  getServicesStatus() {
    return {
      initialized: this.isInitialized,
      services: {
        audioRecorder: !!this.audioRecorder,
        transcription: !!this.transcriptionService,
        imageGeneration: !!this.imageGenerationService,
        kanka: !!this.kankaService,
        entityExtractor: !!this.entityExtractor,
        narrativeExporter: !!this.narrativeExporter,
        sessionOrchestrator: !!this.sessionOrchestrator,
        journalParser: !!this.journalParser,
        compendiumParser: !!this.compendiumParser,
        chapterTracker: !!this.chapterTracker,
        sceneDetector: !!this.sceneDetector,
        aiAssistant: !!this.aiAssistant,
        rulesReference: !!this.rulesReference,
        sessionAnalytics: !!this.sessionAnalytics,
        // RAG services
        embeddingService: !!this.embeddingService,
        ragVectorStore: !!this.ragVectorStore,
        ragRetriever: !!this.ragRetriever,
        silenceDetector: !!this.silenceDetector
      },
      settings: {
        openaiConfigured: !!this._getSetting('openaiApiKey'),
        kankaConfigured: !!(
          this._getSetting('kankaApiToken') && this._getSetting('kankaCampaignId')
        ),
        ragEnabled: !!this._getSetting('ragEnabled')
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
    }
    VoxChronicle.instance = null;
  }
}

export { VoxChronicle };
