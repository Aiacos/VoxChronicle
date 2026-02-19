/**
 * VoxChronicle - Settings Configuration Class
 *
 * Handles registration and management of all module settings including
 * API keys for OpenAI and Kanka, campaign configuration, and user preferences.
 *
 * Settings are registered in Foundry VTT's settings system with appropriate
 * scopes (client vs world) based on whether they should be per-user or shared.
 *
 * @class Settings
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';

// Create logger instance for Settings
const logger = Logger.createChild('Settings');

/**
 * Settings configuration class for VoxChronicle
 * Provides static methods for registering and accessing module settings
 */
class Settings {
  /**
   * Register all module settings with Foundry VTT
   * Should be called during the 'init' hook
   *
   * @static
   */
  static registerSettings() {
    // ==========================================
    // API Key Settings
    // ==========================================

    // OpenAI API Key (client-side, per user)
    // Each user can have their own API key for cost tracking
    game.settings.register(MODULE_ID, 'openaiApiKey', {
      name: 'VOXCHRONICLE.Settings.OpenAIKey',
      hint: 'VOXCHRONICLE.Settings.OpenAIKeyHint',
      scope: 'client',
      config: true,
      type: String,
      default: '',
      onChange: () => {
        // Re-initialize services when API key changes
        Settings._onApiKeyChange('openai');
      }
    });

    // Kanka API Token (world-wide, shared across all users)
    // Typically the GM's token for campaign management
    game.settings.register(MODULE_ID, 'kankaApiToken', {
      name: 'VOXCHRONICLE.Settings.KankaToken',
      hint: 'VOXCHRONICLE.Settings.KankaTokenHint',
      scope: 'world',
      config: true,
      type: String,
      default: '',
      onChange: () => {
        Settings._onApiKeyChange('kanka');
      }
    });

    // ==========================================
    // Kanka Campaign Settings
    // ==========================================

    // Kanka Campaign ID (world-wide)
    // The numeric ID of the Kanka campaign to publish to
    game.settings.register(MODULE_ID, 'kankaCampaignId', {
      name: 'VOXCHRONICLE.Settings.KankaCampaign',
      hint: 'VOXCHRONICLE.Settings.KankaCampaignHint',
      scope: 'world',
      config: true,
      type: String,
      default: ''
    });

    // ==========================================
    // Transcription Settings
    // ==========================================

    // Transcription Language (world-wide)
    // Specifying language improves transcription accuracy
    game.settings.register(MODULE_ID, 'transcriptionLanguage', {
      name: 'VOXCHRONICLE.Settings.Language',
      hint: 'VOXCHRONICLE.Settings.LanguageHint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        '': 'VOXCHRONICLE.Settings.LanguageAuto',
        en: 'English',
        it: 'Italiano',
        es: 'Español',
        de: 'Deutsch',
        fr: 'Français',
        pt: 'Português',
        pl: 'Polski',
        ru: 'Русский',
        ja: '日本語',
        zh: '中文'
      },
      default: ''
    });

    // Transcription Mode (world-wide)
    // Choose between API-based, local whisper, or automatic mode
    game.settings.register(MODULE_ID, 'transcriptionMode', {
      name: 'VOXCHRONICLE.Settings.TranscriptionMode',
      hint: 'VOXCHRONICLE.Settings.TranscriptionModeHint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        api: 'VOXCHRONICLE.Settings.TranscriptionModeAPI',
        local: 'VOXCHRONICLE.Settings.TranscriptionModeLocal',
        auto: 'VOXCHRONICLE.Settings.TranscriptionModeAuto'
      },
      default: 'auto'
    });

    // Whisper Backend URL (world-wide)
    // URL for local whisper.cpp backend
    game.settings.register(MODULE_ID, 'whisperBackendUrl', {
      name: 'VOXCHRONICLE.Settings.WhisperBackendUrl',
      hint: 'VOXCHRONICLE.Settings.WhisperBackendUrlHint',
      scope: 'world',
      config: true,
      type: String,
      default: 'http://localhost:8080'
    });

    // Show Transcription Mode Indicator (client-side)
    // Display current transcription mode in the UI
    game.settings.register(MODULE_ID, 'showTranscriptionModeIndicator', {
      name: 'VOXCHRONICLE.Settings.ShowTranscriptionModeIndicator',
      hint: 'VOXCHRONICLE.Settings.ShowTranscriptionModeIndicatorHint',
      scope: 'client',
      config: true,
      type: Boolean,
      default: true
    });

    // ==========================================
    // Vocabulary Dictionary Settings
    // ==========================================

    // Custom Vocabulary Dictionary (world-wide)
    // Stores campaign-specific terms for improved transcription accuracy
    // Categories: character_names, location_names, items, terms, custom
    game.settings.register(MODULE_ID, 'customVocabularyDictionary', {
      name: 'VOXCHRONICLE.Settings.VocabularyDictionary',
      hint: 'VOXCHRONICLE.Settings.VocabularyDictionaryHint',
      scope: 'world',
      config: false, // Hidden from config menu - managed via UI
      type: Object,
      default: {
        character_names: [],
        location_names: [],
        items: [],
        terms: [],
        custom: []
      }
    });

    // ==========================================
    // Audio Settings
    // ==========================================

    // Audio capture source preference
    game.settings.register(MODULE_ID, 'audioCaptureSource', {
      name: 'VOXCHRONICLE.Settings.AudioSource',
      hint: 'VOXCHRONICLE.Settings.AudioSourceHint',
      scope: 'client',
      config: true,
      type: String,
      choices: {
        auto: 'VOXCHRONICLE.Settings.AudioSourceAuto',
        microphone: 'VOXCHRONICLE.Settings.AudioSourceMicrophone',
        webrtc: 'VOXCHRONICLE.Settings.AudioSourceWebRTC'
      },
      default: 'auto'
    });

    // Enable echo cancellation
    game.settings.register(MODULE_ID, 'echoCancellation', {
      name: 'VOXCHRONICLE.Settings.EchoCancellation',
      hint: 'VOXCHRONICLE.Settings.EchoCancellationHint',
      scope: 'client',
      config: true,
      type: Boolean,
      default: true
    });

    // Enable noise suppression
    game.settings.register(MODULE_ID, 'noiseSuppression', {
      name: 'VOXCHRONICLE.Settings.NoiseSuppression',
      hint: 'VOXCHRONICLE.Settings.NoiseSuppressionHint',
      scope: 'client',
      config: true,
      type: Boolean,
      default: true
    });

    // ==========================================
    // Image Generation Settings
    // ==========================================

    // gpt-image-1 quality setting (low, medium, high, auto)
    game.settings.register(MODULE_ID, 'imageQuality', {
      name: 'VOXCHRONICLE.Settings.ImageQuality',
      hint: 'VOXCHRONICLE.Settings.ImageQualityHint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        low: 'VOXCHRONICLE.Settings.ImageQualityLow',
        medium: 'VOXCHRONICLE.Settings.ImageQualityMedium',
        high: 'VOXCHRONICLE.Settings.ImageQualityHigh',
        auto: 'VOXCHRONICLE.Settings.ImageQualityAuto'
      },
      default: 'high'
    });

    // Maximum images per session
    game.settings.register(MODULE_ID, 'maxImagesPerSession', {
      name: 'VOXCHRONICLE.Settings.MaxImages',
      hint: 'VOXCHRONICLE.Settings.MaxImagesHint',
      scope: 'world',
      config: true,
      type: Number,
      range: {
        min: 0,
        max: 10,
        step: 1
      },
      default: 3
    });

    // ==========================================
    // Entity Extraction Settings
    // ==========================================

    // Enable automatic entity extraction
    game.settings.register(MODULE_ID, 'autoExtractEntities', {
      name: 'VOXCHRONICLE.Settings.AutoExtract',
      hint: 'VOXCHRONICLE.Settings.AutoExtractHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // Require confirmation before creating entities
    game.settings.register(MODULE_ID, 'confirmEntityCreation', {
      name: 'VOXCHRONICLE.Settings.ConfirmEntities',
      hint: 'VOXCHRONICLE.Settings.ConfirmEntitiesHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // ==========================================
    // Relationship Extraction Settings
    // ==========================================

    // Enable automatic relationship extraction
    game.settings.register(MODULE_ID, 'autoExtractRelationships', {
      name: 'VOXCHRONICLE.Settings.AutoExtractRelationships',
      hint: 'VOXCHRONICLE.Settings.AutoExtractRelationshipsHint',
      scope: 'client',
      config: true,
      type: Boolean,
      default: true
    });

    // Relationship confidence threshold
    game.settings.register(MODULE_ID, 'relationshipConfidenceThreshold', {
      name: 'VOXCHRONICLE.Settings.RelationshipConfidenceThreshold',
      hint: 'VOXCHRONICLE.Settings.RelationshipConfidenceThresholdHint',
      scope: 'world',
      config: true,
      type: Number,
      range: {
        min: 1,
        max: 10,
        step: 1
      },
      default: 5
    });

    // Maximum relationships per session
    game.settings.register(MODULE_ID, 'maxRelationshipsPerSession', {
      name: 'VOXCHRONICLE.Settings.MaxRelationships',
      hint: 'VOXCHRONICLE.Settings.MaxRelationshipsHint',
      scope: 'world',
      config: true,
      type: Number,
      range: {
        min: 0,
        max: 50,
        step: 1
      },
      default: 20
    });

    // ==========================================
    // Speaker Labeling (Non-config settings)
    // ==========================================

    // Speaker Labels (JSON map of speaker IDs to names)
    // Configured via custom menu, not standard settings UI
    game.settings.register(MODULE_ID, 'speakerLabels', {
      name: 'VOXCHRONICLE.Settings.SpeakerLabels',
      hint: 'VOXCHRONICLE.Settings.SpeakerLabelsHint',
      scope: 'world',
      config: false, // Configured via custom menu
      type: Object,
      default: {}
    });

    // ==========================================
    // Session Storage (Internal settings)
    // ==========================================

    // Store pending sessions that haven't been published yet
    game.settings.register(MODULE_ID, 'pendingSessions', {
      name: 'Pending Sessions',
      hint: 'Sessions waiting to be published to Kanka',
      scope: 'world',
      config: false,
      type: Array,
      default: []
    });

    // Last known speaker IDs (for suggestion during labeling)
    game.settings.register(MODULE_ID, 'knownSpeakers', {
      name: 'Known Speakers',
      hint: 'Previously detected speaker IDs',
      scope: 'world',
      config: false,
      type: Array,
      default: []
    });

    // Kanka API Token Creation Timestamp (for expiration tracking)
    game.settings.register(MODULE_ID, 'kankaApiTokenCreatedAt', {
      name: 'Kanka Token Created At',
      hint: 'Timestamp when the Kanka API token was first set',
      scope: 'world',
      config: false,
      type: Number,
      default: 0
    });

    // ==========================================
    // Narrator Master Settings
    // ==========================================

    // Multi-language transcription mode
    game.settings.register(MODULE_ID, 'multiLanguageMode', {
      name: 'VOXCHRONICLE.Settings.MultiLanguageMode',
      hint: 'VOXCHRONICLE.Settings.MultiLanguageModeHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });

    // Transcription batch duration for live mode
    game.settings.register(MODULE_ID, 'transcriptionBatchDuration', {
      name: 'VOXCHRONICLE.Settings.TranscriptionBatchDuration',
      hint: 'VOXCHRONICLE.Settings.TranscriptionBatchDurationHint',
      scope: 'world',
      config: true,
      type: Number,
      range: { min: 5000, max: 30000, step: 1000 },
      default: 10000
    });

    // Off-track sensitivity level
    game.settings.register(MODULE_ID, 'offTrackSensitivity', {
      name: 'VOXCHRONICLE.Settings.OffTrackSensitivity',
      hint: 'VOXCHRONICLE.Settings.OffTrackSensitivityHint',
      scope: 'world',
      config: true,
      type: String,
      default: 'medium',
      choices: {
        low: 'VOXCHRONICLE.Settings.SensitivityLow',
        medium: 'VOXCHRONICLE.Settings.SensitivityMedium',
        high: 'VOXCHRONICLE.Settings.SensitivityHigh'
      }
    });

    // Enable rules detection
    game.settings.register(MODULE_ID, 'rulesDetection', {
      name: 'VOXCHRONICLE.Settings.RulesDetection',
      hint: 'VOXCHRONICLE.Settings.RulesDetectionHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // Rules source
    game.settings.register(MODULE_ID, 'rulesSource', {
      name: 'VOXCHRONICLE.Settings.RulesSource',
      hint: 'VOXCHRONICLE.Settings.RulesSourceHint',
      scope: 'world',
      config: true,
      type: String,
      default: 'auto',
      choices: {
        auto: 'VOXCHRONICLE.Settings.RulesSourceAuto',
        dnd5e: 'VOXCHRONICLE.Settings.RulesSourceDnD5e'
      }
    });

    // Debug mode
    game.settings.register(MODULE_ID, 'debugMode', {
      name: 'VOXCHRONICLE.Settings.DebugMode',
      hint: 'VOXCHRONICLE.Settings.DebugModeHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => Logger.setDebugMode(value)
    });

    // ==========================================
    // RAG Configuration Settings
    // ==========================================

    // Enable RAG (Retrieval-Augmented Generation) for context-aware suggestions
    game.settings.register(MODULE_ID, 'ragEnabled', {
      name: 'VOXCHRONICLE.Settings.RAGEnabled',
      hint: 'VOXCHRONICLE.Settings.RAGEnabledHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // RAG provider selection
    game.settings.register(MODULE_ID, 'ragProvider', {
      name: 'VOXCHRONICLE.Settings.RAGProvider',
      hint: 'VOXCHRONICLE.Settings.RAGProviderHint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        'openai-file-search': 'VOXCHRONICLE.Settings.RAGProviderOpenAIFileSearch'
      },
      default: 'openai-file-search'
    });

    // Maximum number of source results per query
    game.settings.register(MODULE_ID, 'ragMaxResults', {
      name: 'VOXCHRONICLE.Settings.RAGMaxResults',
      hint: 'VOXCHRONICLE.Settings.RAGMaxResultsHint',
      scope: 'world',
      config: true,
      type: Number,
      range: { min: 1, max: 20, step: 1 },
      default: 5
    });

    // Automatically index journals on session start
    game.settings.register(MODULE_ID, 'ragAutoIndex', {
      name: 'VOXCHRONICLE.Settings.RAGAutoIndex',
      hint: 'VOXCHRONICLE.Settings.RAGAutoIndexHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // Silence detection threshold (milliseconds)
    game.settings.register(MODULE_ID, 'ragSilenceThresholdMs', {
      name: 'VOXCHRONICLE.Settings.RAGSilenceThreshold',
      hint: 'VOXCHRONICLE.Settings.RAGSilenceThresholdHint',
      scope: 'world',
      config: true,
      type: Number,
      range: { min: 10000, max: 120000, step: 5000 },
      default: 30000
    });

    // Persisted vector store ID (internal, not shown in config)
    game.settings.register(MODULE_ID, 'ragVectorStoreId', {
      scope: 'world',
      config: false,
      type: String,
      default: ''
    });

    // ==========================================
    // API Retry Settings
    // ==========================================

    // Enable API retry
    game.settings.register(MODULE_ID, 'apiRetryEnabled', {
      name: 'VOXCHRONICLE.Settings.ApiRetryEnabled',
      hint: 'VOXCHRONICLE.Settings.ApiRetryEnabledHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    // Maximum retry attempts
    game.settings.register(MODULE_ID, 'apiRetryMaxAttempts', {
      name: 'VOXCHRONICLE.Settings.ApiRetryMaxAttempts',
      hint: 'VOXCHRONICLE.Settings.ApiRetryMaxAttemptsHint',
      scope: 'world',
      config: true,
      type: Number,
      range: { min: 0, max: 10, step: 1 },
      default: 3
    });

    // Base delay between retries
    game.settings.register(MODULE_ID, 'apiRetryBaseDelay', {
      name: 'VOXCHRONICLE.Settings.ApiRetryBaseDelay',
      hint: 'VOXCHRONICLE.Settings.ApiRetryBaseDelayHint',
      scope: 'world',
      config: true,
      type: Number,
      range: { min: 500, max: 10000, step: 500 },
      default: 1000
    });

    // Maximum delay between retries
    game.settings.register(MODULE_ID, 'apiRetryMaxDelay', {
      name: 'VOXCHRONICLE.Settings.ApiRetryMaxDelay',
      hint: 'VOXCHRONICLE.Settings.ApiRetryMaxDelayHint',
      scope: 'world',
      config: true,
      type: Number,
      range: { min: 5000, max: 120000, step: 5000 },
      default: 60000
    });

    // Maximum API queue size
    game.settings.register(MODULE_ID, 'apiQueueMaxSize', {
      name: 'VOXCHRONICLE.Settings.ApiQueueMaxSize',
      hint: 'VOXCHRONICLE.Settings.ApiQueueMaxSizeHint',
      scope: 'world',
      config: true,
      type: Number,
      range: { min: 5, max: 100, step: 5 },
      default: 100
    });

    // ==========================================
    // Hidden Internal Settings (Narrator Master)
    // ==========================================

    // Image gallery storage
    game.settings.register(MODULE_ID, 'imageGallery', {
      scope: 'world',
      config: false,
      type: Object,
      default: {}
    });

    // Panel position storage (client-scoped)
    game.settings.register(MODULE_ID, 'panelPosition', {
      scope: 'client',
      config: false,
      type: Object,
      default: {}
    });

    logger.info('Settings registered successfully');
  }

  /**
   * Handle API key changes by notifying the user
   *
   * @param {string} service - The service whose key changed ('openai' or 'kanka')
   * @private
   * @static
   */
  static _onApiKeyChange(service) {
    // Notify user that services may need re-initialization
    if (game.ready) {
      ui.notifications?.info(
        `VoxChronicle: ${service === 'openai' ? 'OpenAI' : 'Kanka'} API key updated. Services will be re-initialized.`
      );
    }
  }

  /**
   * Get a setting value with type safety
   *
   * @param {string} key - The setting key
   * @returns {*} The setting value
   * @static
   */
  static get(key) {
    return game.settings.get(MODULE_ID, key);
  }

  /**
   * Set a setting value
   *
   * @param {string} key - The setting key
   * @param {*} value - The value to set
   * @returns {Promise<*>} The updated value
   * @static
   */
  static async set(key, value) {
    return game.settings.set(MODULE_ID, key, value);
  }

  /**
   * Check if OpenAI API is configured
   *
   * @returns {boolean} True if OpenAI API key is set
   * @static
   */
  static isOpenAIConfigured() {
    const key = Settings.get('openaiApiKey');
    return key && key.trim().length > 0;
  }

  /**
   * Check if Kanka API is configured
   *
   * @returns {boolean} True if Kanka API token and campaign ID are set
   * @static
   */
  static isKankaConfigured() {
    const token = Settings.get('kankaApiToken');
    const campaignId = Settings.get('kankaCampaignId');
    return token && token.trim().length > 0 && campaignId && campaignId.trim().length > 0;
  }

  /**
   * Check if all required settings are configured
   *
   * @returns {object} Status of each configuration area
   * @static
   */
  static getConfigurationStatus() {
    return {
      openai: Settings.isOpenAIConfigured(),
      kanka: Settings.isKankaConfigured(),
      ready: Settings.isOpenAIConfigured() && Settings.isKankaConfigured()
    };
  }

  /**
   * Get speaker labels with fallback to empty object
   *
   * @returns {object} Map of speaker IDs to player names
   * @static
   */
  static getSpeakerLabels() {
    try {
      return Settings.get('speakerLabels') || {};
    } catch {
      return {};
    }
  }

  /**
   * Update speaker labels
   *
   * @param {object} labels - Map of speaker IDs to player names
   * @returns {Promise<void>}
   * @static
   */
  static async setSpeakerLabels(labels) {
    await Settings.set('speakerLabels', labels);
  }

  /**
   * Get the transcription language setting
   *
   * @returns {string|null} Language code or null for auto-detect
   * @static
   */
  static getTranscriptionLanguage() {
    const lang = Settings.get('transcriptionLanguage');
    return lang && lang.trim().length > 0 ? lang : null;
  }

  /**
   * Get audio capture settings
   *
   * @returns {object} Audio capture configuration
   * @static
   */
  static getAudioSettings() {
    return {
      source: Settings.get('audioCaptureSource'),
      echoCancellation: Settings.get('echoCancellation'),
      noiseSuppression: Settings.get('noiseSuppression')
    };
  }

  /**
   * Get image generation settings
   *
   * @returns {object} Image generation configuration
   * @static
   */
  static getImageSettings() {
    return {
      quality: Settings.get('imageQuality'),
      maxPerSession: Settings.get('maxImagesPerSession')
    };
  }

  /**
   * Get entity extraction settings
   *
   * @returns {object} Entity extraction configuration
   * @static
   */
  static getEntitySettings() {
    return {
      autoExtract: Settings.get('autoExtractEntities'),
      confirmCreation: Settings.get('confirmEntityCreation')
    };
  }

  /**
   * Validate OpenAI API key
   * Makes a test request to verify the API key is valid
   *
   * @returns {Promise<boolean>} True if validation succeeds, false otherwise
   * @static
   */
  static async validateOpenAIKey() {
    // Check if API key is configured
    if (!Settings.isOpenAIConfigured()) {
      ui.notifications?.error(game.i18n.localize('VOXCHRONICLE.Validation.OpenAIKeyNotConfigured'));
      return false;
    }

    try {
      // Show loading notification
      const loadingNotif = ui.notifications?.info(
        game.i18n.localize('VOXCHRONICLE.Validation.ValidatingOpenAI'),
        { permanent: true }
      );

      // Import VoxChronicle dynamically to avoid circular dependencies
      const { VoxChronicle } = await import('./VoxChronicle.mjs');
      const voxChronicle = VoxChronicle.getInstance();

      // Check if transcription service is initialized
      if (!voxChronicle.transcriptionService) {
        // Try to get the API key and create a temporary client
        const { OpenAIClient } = await import('../ai/OpenAIClient.mjs');
        const apiKey = Settings.get('openaiApiKey');
        const tempClient = new OpenAIClient(apiKey);
        const isValid = await tempClient.validateApiKey();

        // Clear loading notification
        if (loadingNotif) loadingNotif.remove();

        // Show result
        if (isValid) {
          ui.notifications?.info(game.i18n.localize('VOXCHRONICLE.Validation.OpenAIKeyValid'));
          return true;
        } else {
          ui.notifications?.error(game.i18n.localize('VOXCHRONICLE.Validation.OpenAIKeyInvalid'));
          return false;
        }
      }

      // Use existing service to validate
      const isValid = await voxChronicle.transcriptionService.validateApiKey();

      // Clear loading notification
      if (loadingNotif) loadingNotif.remove();

      // Show result notification
      if (isValid) {
        ui.notifications?.info(game.i18n.localize('VOXCHRONICLE.Validation.OpenAIKeyValid'));
        return true;
      } else {
        ui.notifications?.error(game.i18n.localize('VOXCHRONICLE.Validation.OpenAIKeyInvalid'));
        return false;
      }
    } catch (error) {
      ui.notifications?.error(
        game.i18n.format('VOXCHRONICLE.Validation.OpenAIValidationError', { error: error.message })
      );
      logger.error('OpenAI API key validation error:', error);
      return false;
    }
  }

  /**
   * Validate Kanka API token
   * Makes a test request to verify the API token is valid
   *
   * @returns {Promise<boolean>} True if validation succeeds, false otherwise
   * @static
   */
  static async validateKankaToken() {
    // Check if API token is configured
    if (!Settings.isKankaConfigured()) {
      ui.notifications?.error(
        game.i18n.localize('VOXCHRONICLE.Validation.KankaTokenNotConfigured')
      );
      return false;
    }

    try {
      // Show loading notification
      const loadingNotif = ui.notifications?.info(
        game.i18n.localize('VOXCHRONICLE.Validation.ValidatingKanka'),
        { permanent: true }
      );

      // Import VoxChronicle dynamically to avoid circular dependencies
      const { VoxChronicle } = await import('./VoxChronicle.mjs');
      const voxChronicle = VoxChronicle.getInstance();

      // Check if Kanka service is initialized
      if (!voxChronicle.kankaService) {
        // Try to get the API token and create a temporary client
        const { KankaClient } = await import('../kanka/KankaClient.mjs');
        const apiToken = Settings.get('kankaApiToken');
        const tempClient = new KankaClient(apiToken);
        const isValid = await tempClient.validateApiToken();

        // Clear loading notification
        if (loadingNotif) loadingNotif.remove();

        // Show result
        if (isValid) {
          ui.notifications?.info(game.i18n.localize('VOXCHRONICLE.Validation.KankaTokenValid'));
          return true;
        } else {
          ui.notifications?.error(game.i18n.localize('VOXCHRONICLE.Validation.KankaTokenInvalid'));
          return false;
        }
      }

      // Use existing service to validate
      const isValid = await voxChronicle.kankaService.validateApiToken();

      // Clear loading notification
      if (loadingNotif) loadingNotif.remove();

      // Show result notification
      if (isValid) {
        ui.notifications?.info(game.i18n.localize('VOXCHRONICLE.Validation.KankaTokenValid'));
        return true;
      } else {
        ui.notifications?.error(game.i18n.localize('VOXCHRONICLE.Validation.KankaTokenInvalid'));
        return false;
      }
    } catch (error) {
      ui.notifications?.error(
        game.i18n.format('VOXCHRONICLE.Validation.KankaValidationError', { error: error.message })
      );
      logger.error('Kanka API token validation error:', error);
      return false;
    }
  }

  /**
   * Get relationship extraction settings
   *
   * @returns {object} Relationship extraction configuration
   * @static
   */
  static getRelationshipSettings() {
    return {
      autoExtract: Settings.get('autoExtractRelationships'),
      confidenceThreshold: Settings.get('relationshipConfidenceThreshold'),
      maxPerSession: Settings.get('maxRelationshipsPerSession')
    };
  }

  /**
   * Get all narrator/live-mode related settings
   *
   * @returns {object} Narrator settings configuration
   * @static
   */
  static getNarratorSettings() {
    return {
      multiLanguageMode: Settings.get('multiLanguageMode'),
      transcriptionBatchDuration: Settings.get('transcriptionBatchDuration'),
      offTrackSensitivity: Settings.get('offTrackSensitivity'),
      rulesDetection: Settings.get('rulesDetection'),
      rulesSource: Settings.get('rulesSource'),
      debugMode: Settings.get('debugMode')
    };
  }

  /**
   * Get API retry configuration settings
   *
   * @returns {object} Retry settings configuration
   * @static
   */
  static getRetrySettings() {
    return {
      enabled: Settings.get('apiRetryEnabled'),
      maxAttempts: Settings.get('apiRetryMaxAttempts'),
      baseDelay: Settings.get('apiRetryBaseDelay'),
      maxDelay: Settings.get('apiRetryMaxDelay'),
      queueMaxSize: Settings.get('apiQueueMaxSize')
    };
  }

  /**
   * Check if narrator/live features have required settings
   *
   * @returns {boolean} True if narrator features can be used
   * @static
   */
  static isNarratorConfigured() {
    return Settings.isOpenAIConfigured();
  }

  /**
   * Get RAG (Retrieval-Augmented Generation) configuration settings
   *
   * @returns {object} RAG configuration
   * @static
   */
  static getRAGSettings() {
    return {
      enabled: Settings.get('ragEnabled'),
      provider: Settings.get('ragProvider'),
      maxResults: Settings.get('ragMaxResults'),
      autoIndex: Settings.get('ragAutoIndex'),
      silenceThresholdMs: Settings.get('ragSilenceThresholdMs'),
      vectorStoreId: Settings.get('ragVectorStoreId')
    };
  }

  /**
   * Persist the vector store ID for reuse across sessions
   *
   * @param {string} vectorStoreId - OpenAI vector store ID
   * @returns {Promise<void>}
   * @static
   */
  static async setRAGVectorStoreId(vectorStoreId) {
    await Settings.set('ragVectorStoreId', vectorStoreId || '');
  }

  /**
   * Check if RAG is properly configured and can be used
   *
   * @returns {boolean} True if RAG can be used
   * @static
   */
  static isRAGConfigured() {
    return Settings.isOpenAIConfigured() && Settings.get('ragEnabled');
  }
}

export { Settings };
