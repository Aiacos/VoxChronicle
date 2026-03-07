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
import { RulesLookupService } from '../narrator/RulesLookupService.mjs';
import { SessionAnalytics } from '../narrator/SessionAnalytics.mjs';
import { OpenAIClient } from '../ai/OpenAIClient.mjs';
import { Logger } from '../utils/Logger.mjs';
// RAG (Retrieval-Augmented Generation) services
import { RAGProviderFactory } from '../rag/RAGProviderFactory.mjs';
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
  static #instance = null;

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

    /** @type {object | null} Rules lookup service for two-phase hybrid lookup */
    this.rulesLookupService = null;

    /** @type {object | null} Session analytics tracker */
    this.sessionAnalytics = null;

    // RAG (Retrieval-Augmented Generation) services
    /** @type {import('../rag/RAGProvider.mjs').RAGProvider|null} RAG provider instance */
    this.ragProvider = null;

    /** @type {object | null} Silence detector for autonomous suggestions */
    this.silenceDetector = null;

    // State tracking
    /** @type {boolean} Whether the module is fully initialized */
    this.isInitialized = false;
    /** @type {boolean} Whether reinitialize is deferred until session ends */
    this._reinitializePending = false;
  }

  /**
   * Get the singleton instance of VoxChronicle
   * Creates the instance if it doesn't exist
   *
   * @returns {VoxChronicle} The singleton instance
   * @static
   */
  static getInstance() {
    if (!VoxChronicle.#instance) {
      VoxChronicle.#instance = new VoxChronicle();
    }
    return VoxChronicle.#instance;
  }

  /**
   * Reset the singleton instance. Used for testing.
   * @static
   */
  static resetInstance() {
    if (VoxChronicle.#instance) {
      VoxChronicle.#instance.audioRecorder?.cancel?.();
      VoxChronicle.#instance.silenceDetector?.stop?.();
      VoxChronicle.#instance.sessionOrchestrator?.reset?.();
      if (VoxChronicle.#instance._updateSettingHookId != null) {
        Hooks.off('updateSetting', VoxChronicle.#instance._updateSettingHookId);
      }
      VoxChronicle.#instance.isInitialized = false;
      VoxChronicle._hooksRegistered = false;
    }
    VoxChronicle.#instance = null;
  }

  /**
   * Reset and re-initialize all services.
   * Useful when settings change (e.g. API key updated).
   * @returns {Promise<void>}
   */
  async reinitialize() {
    // Defer reinitialization if a session is active to prevent data loss
    if (this.sessionOrchestrator?.isSessionActive) {
      logger.warn('Reinitialize deferred — a recording session is active. Changes will apply after the session ends.');
      this._reinitializePending = true;
      return;
    }

    // Clean up existing services to prevent resource leaks
    this.audioRecorder?.cancel();
    this.silenceDetector?.stop?.();
    this.sessionOrchestrator?.reset?.();
    this.isInitialized = false;
    this._reinitializePending = false;
    return this.initialize();
  }

  /**
   * Mark initialized and register settings change hook
   * @private
   */
  _registerHooks() {
    this._updateSettingHookId = Hooks.on('updateSetting', (setting) => {
      if (setting.key.startsWith(`${MODULE_ID}.`)) {
        // Invalidate cached settings status on any module setting change
        this._cachedSettingsStatus = null;

        const aiSettings = ['openaiApiKey', 'kankaApiToken', 'ragEnabled', 'transcriptionMode'];
        const key = setting.key.split('.')[1];
        if (aiSettings.includes(key) || this._reinitializePending) {
          logger.info(`Setting '${key}' updated, reinitializing services...`);
          this.reinitialize().catch(err => {
            logger.error(`Reinitialization after '${key}' change failed:`, err);
            ui.notifications?.warn(
              game.i18n?.localize('VOXCHRONICLE.Errors.ReinitializeFailed')
                || 'VoxChronicle: Service reinitialization failed after settings change. Check console.'
            );
          });
        }
      }
    });
  }

  /**
   * Initialize all module services
   * Called from the 'ready' hook when Foundry VTT is fully loaded
   *
   * @returns {Promise<void>}
   * @throws {Error} If initialization fails
   */
  async initialize() {
    logger.info('Initializing VoxChronicle services...');
    
    // Register settings monitor on first init
    if (!VoxChronicle._hooksRegistered) {
      this._registerHooks();
      VoxChronicle._hooksRegistered = true;
    }

    try {
      // Validate server URLs at init (catches invalid URLs saved from previous sessions)
      Settings.validateServerUrls?.();

      // Get and TRIM API keys from settings
      const openaiApiKey = this._getSetting('openaiApiKey')?.trim();
      const kankaApiToken = this._getSetting('kankaApiToken')?.trim();
      const kankaCampaignId = this._getSetting('kankaCampaignId')?.trim();
      
      if (openaiApiKey) {
        logger.info('OpenAI API key loaded');
      } else {
        logger.warn('OpenAI API key is empty or not configured');
      }

      const audioSettings = {
        echoCancellation: this._getSetting('echoCancellation') ?? true,
        noiseSuppression: this._getSetting('noiseSuppression') ?? true
      };

      // Get transcription mode settings
      const transcriptionMode = this._getSetting('transcriptionMode') || 'auto';
      const whisperBackendUrl = this._getSetting('whisperBackendUrl');
      const transcriptionLanguage = this._getSetting('transcriptionLanguage');

      // Initialize audio recorder (if not exists)
      if (!this.audioRecorder) {
        logger.debug('Creating AudioRecorder...');
        this.audioRecorder = new AudioRecorder(audioSettings);
      }

      // Initialize transcription service using factory
      try {
        this.transcriptionService = await TranscriptionFactory.create({
          mode: transcriptionMode,
          openaiApiKey: openaiApiKey,
          whisperBackendUrl: whisperBackendUrl
        });
        logger.info(`Transcription service ready (mode: ${transcriptionMode})`);
      } catch (error) {
        logger.warn(`Transcription service unavailable: ${error.message}`);
        this.transcriptionService = null;
      }

      // Initialize other OpenAI services (if API key configured)
      if (openaiApiKey) {
        this.imageGenerationService = new ImageGenerationService(openaiApiKey);
        this.entityExtractor = new EntityExtractor(openaiApiKey);
        this.aiAssistant = new AIAssistant({
          openaiClient: new OpenAIClient(openaiApiKey),
          primaryLanguage: transcriptionLanguage || 'en'
        });
      } else {
        this.imageGenerationService = null;
        this.entityExtractor = null;
        this.aiAssistant = null;
      }

      // Initialize Kanka services (if configured)
      if (kankaApiToken && kankaCampaignId) {
        this.kankaService = new KankaService(kankaApiToken, kankaCampaignId);
        this.narrativeExporter = new NarrativeExporter();
        if (openaiApiKey) {
          this.narrativeExporter.setOpenAIClient(openaiApiKey);
        }
      } else {
        this.kankaService = null;
        this.narrativeExporter = null;
      }

      // Initialize or UPDATE session orchestrator
      const services = {
        audioRecorder: this.audioRecorder,
        transcriptionService: this.transcriptionService,
        entityExtractor: this.entityExtractor,
        imageGenerationService: this.imageGenerationService,
        kankaService: this.kankaService,
        narrativeExporter: this.narrativeExporter,
        aiAssistant: this.aiAssistant
      };

      if (!this.sessionOrchestrator) {
        logger.debug('Creating SessionOrchestrator...');
        this.sessionOrchestrator = new SessionOrchestrator(services);
      } else {
        logger.debug('Updating SessionOrchestrator services...');
        this.sessionOrchestrator.setServices(services);
      }

      // Sync transcription config
      this.sessionOrchestrator.setTranscriptionConfig({
        mode: transcriptionMode,
        openaiApiKey: openaiApiKey,
        whisperBackendUrl: whisperBackendUrl
      });

      // Initialize Narrator Master services (once)
      if (!this.journalParser) {
        this.journalParser = new JournalParser();
        this.compendiumParser = new CompendiumParser();
        this.chapterTracker = new ChapterTracker({ journalParser: this.journalParser });
        this.sceneDetector = new SceneDetector();
        this.sessionAnalytics = new SessionAnalytics();
      }

      // Connect narrator services to orchestrator
      this.sessionOrchestrator.setNarratorServices({
        aiAssistant: this.aiAssistant,
        chapterTracker: this.chapterTracker,
        sceneDetector: this.sceneDetector,
        sessionAnalytics: this.sessionAnalytics,
        journalParser: this.journalParser
      });

      // Initialize rules reference and lookup service
      if (this._getSetting('rulesDetection') !== false) {
        this.rulesReference = new RulesReference({ language: transcriptionLanguage || 'en' });

        // Create lookup service if we have an OpenAI client for AI synthesis
        if (openaiApiKey) {
          this.rulesLookupService = new RulesLookupService(
            this.rulesReference,
            new OpenAIClient(openaiApiKey),
            { cooldownMs: 5 * 60 * 1000 }
          );
        }

        // Connect RulesReference to AIAssistant for delegated detection
        if (this.aiAssistant) {
          this.aiAssistant.setRulesReference(this.rulesReference);
        }

        // Wire rules services to orchestrator for fire-and-forget lookups
        if (this.sessionOrchestrator) {
          this.sessionOrchestrator.setNarratorServices({
            rulesReference: this.rulesReference,
            rulesLookupService: this.rulesLookupService
          });
        }
      }

      // Initialize RAG services
      await this._initializeRAGServices(openaiApiKey);

      // Check Kanka token expiration and warn user
      await this._checkKankaTokenExpiration();

      // Final status check
      this.isInitialized = true;
      logger.info('VoxChronicle services stabilized');
      
      // Notify UI to refresh badges (v13 ApplicationV2 API)
      const panel = foundry.applications?.instances?.get('vox-chronicle-main-panel');
      if (panel?.rendered) panel.render();
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
    } catch (error) {
      logger.warn(`Failed to read setting '${key}': ${error.message}`);
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
   * Creates RAG provider via factory and connects to AIAssistant
   *
   * @param {string} openaiApiKey - OpenAI API key
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

      // Create RAG provider via factory
      const providerType = ragSettings.provider || 'openai-file-search';
      logger.info(`Initializing RAG services (provider: ${providerType})...`);

      this.ragProvider = RAGProviderFactory.create(providerType);

      // Initialize based on provider type
      if (providerType === 'ragflow') {
        // RAGFlow provider uses its own server + API key
        if (!ragSettings.ragflowBaseUrl || !ragSettings.ragflowApiKey) {
          logger.warn('RAGFlow requires base URL and API key - skipping initialization');
          this.ragProvider = null;
          return;
        }
        await this.ragProvider.initialize({
          baseUrl: ragSettings.ragflowBaseUrl,
          apiKey: ragSettings.ragflowApiKey,
          datasetId: ragSettings.ragflowDatasetId || null,
          chatId: ragSettings.ragflowChatId || null,
          modelName: ragSettings.ragflowModelName || ''
        });

        // Persist dataset + chat IDs for reuse across sessions
        if (this.ragProvider.getDatasetId) {
          const dsId = this.ragProvider.getDatasetId();
          if (dsId) Settings.set('ragflowDatasetId', dsId).catch(e => logger.warn('Failed to persist RAGFlow dataset ID:', e.message));
        }
        if (this.ragProvider.getChatId) {
          const chatId = this.ragProvider.getChatId();
          if (chatId) Settings.set('ragflowChatId', chatId).catch(e => logger.warn('Failed to persist RAGFlow chat ID:', e.message));
        }
      } else {
        // OpenAI File Search provider requires OpenAI API key
        if (!openaiApiKey) {
          logger.warn('RAG services require OpenAI API key - skipping initialization');
          this.ragProvider = null;
          return;
        }
        const ragClient = new OpenAIClient(openaiApiKey);
        await this.ragProvider.initialize({
          client: ragClient,
          vectorStoreId: ragSettings.vectorStoreId || null,
          storeName: `vox-chronicle-${ragSettings.campaignId || 'default'}`
        });

        // Persist vector store ID for reuse across sessions
        if (this.ragProvider.getVectorStoreId) {
          const vsId = this.ragProvider.getVectorStoreId();
          if (vsId) Settings.setRAGVectorStoreId(vsId).catch(e => logger.warn('Failed to persist RAG vector store ID:', e.message));
        }
      }

      // Initialize Silence Detector for autonomous suggestions
      this.silenceDetector = new SilenceDetector({
        thresholdMs: ragSettings.silenceThresholdMs,
        autoRestart: true
      });

      // Connect RAG provider to AIAssistant if available
      if (this.aiAssistant) {
        this.aiAssistant.setRAGProvider(this.ragProvider);
        this.aiAssistant.setSilenceDetector(this.silenceDetector);
        logger.debug('RAG provider connected to AIAssistant');
      }

      // Connect RAG provider to SessionOrchestrator for journal indexing
      if (this.sessionOrchestrator) {
        this.sessionOrchestrator.setRAGProvider(this.ragProvider);
        logger.debug('RAG provider connected to SessionOrchestrator');
      }

      logger.info('RAG services initialized successfully', {
        provider: providerType,
        vectorStoreId: this.ragProvider.getVectorStoreId?.() || 'N/A'
      });
    } catch (error) {
      logger.error('Failed to initialize RAG services:', error);
      this.ragProvider = null;
      ui?.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Errors.RAGInitFailed') ||
        'VoxChronicle: RAG initialization failed. AI suggestions will work without campaign context.'
      );
      // Don't throw - RAG is optional functionality
    }
  }

  /**
   * Check if all required services are configured and ready
   *
   * @returns {object} Status of each service
   */
  getServicesStatus() {
    logger.debug('getServicesStatus called');
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
        rulesLookupService: !!this.rulesLookupService,
        sessionAnalytics: !!this.sessionAnalytics,
        // RAG services
        ragProvider: !!this.ragProvider,
        silenceDetector: !!this.silenceDetector
      },
      settings: this._getCachedSettingsStatus()
    };
  }

  /**
   * Get cached settings status, rebuilding only when invalidated by updateSetting hook
   * @returns {object} Settings configuration status
   * @private
   */
  _getCachedSettingsStatus() {
    if (!this._cachedSettingsStatus) {
      this._cachedSettingsStatus = {
        openaiConfigured: !!this._getSetting('openaiApiKey'),
        kankaConfigured: !!(
          this._getSetting('kankaApiToken') && this._getSetting('kankaCampaignId')
        ),
        ragEnabled: !!this._getSetting('ragEnabled')
      };
    }
    return this._cachedSettingsStatus;
  }
}

export { VoxChronicle };
