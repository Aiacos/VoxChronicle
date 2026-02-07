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

import { MODULE_ID } from '../main.mjs';

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
        'en': 'English',
        'it': 'Italiano',
        'es': 'Español',
        'de': 'Deutsch',
        'fr': 'Français',
        'pt': 'Português',
        'pl': 'Polski',
        'ru': 'Русский',
        'ja': '日本語',
        'zh': '中文'
      },
      default: ''
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
        'auto': 'VOXCHRONICLE.Settings.AudioSourceAuto',
        'microphone': 'VOXCHRONICLE.Settings.AudioSourceMicrophone',
        'webrtc': 'VOXCHRONICLE.Settings.AudioSourceWebRTC'
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

    // DALL-E image quality setting
    game.settings.register(MODULE_ID, 'imageQuality', {
      name: 'VOXCHRONICLE.Settings.ImageQuality',
      hint: 'VOXCHRONICLE.Settings.ImageQualityHint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        'standard': 'VOXCHRONICLE.Settings.ImageQualityStandard',
        'hd': 'VOXCHRONICLE.Settings.ImageQualityHD'
      },
      default: 'standard'
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

    console.log(`${MODULE_ID} | Settings registered successfully`);
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
      ui.notifications?.info(`VoxChronicle: ${service === 'openai' ? 'OpenAI' : 'Kanka'} API key updated. Services will be re-initialized.`);
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
   * @returns {Object} Status of each configuration area
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
   * @returns {Object} Map of speaker IDs to player names
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
   * @param {Object} labels - Map of speaker IDs to player names
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
   * @returns {Object} Audio capture configuration
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
   * @returns {Object} Image generation configuration
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
   * @returns {Object} Entity extraction configuration
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
      const loadingNotif = ui.notifications?.info(game.i18n.localize('VOXCHRONICLE.Validation.ValidatingOpenAI'), { permanent: true });

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
      ui.notifications?.error(game.i18n.format('VOXCHRONICLE.Validation.OpenAIValidationError', { error: error.message }));
      console.error(`${MODULE_ID} | OpenAI API key validation error:`, error);
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
      ui.notifications?.error(game.i18n.localize('VOXCHRONICLE.Validation.KankaTokenNotConfigured'));
      return false;
    }

    try {
      // Show loading notification
      const loadingNotif = ui.notifications?.info(game.i18n.localize('VOXCHRONICLE.Validation.ValidatingKanka'), { permanent: true });

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
      ui.notifications?.error(game.i18n.format('VOXCHRONICLE.Validation.KankaValidationError', { error: error.message }));
      console.error(`${MODULE_ID} | Kanka API token validation error:`, error);
      return false;
    }
  }

  /**
   * Get relationship extraction settings
   *
   * @returns {Object} Relationship extraction configuration
   * @static
   */
  static getRelationshipSettings() {
    return {
      autoExtract: Settings.get('autoExtractRelationships'),
      confidenceThreshold: Settings.get('relationshipConfidenceThreshold'),
      maxPerSession: Settings.get('maxRelationshipsPerSession')
    };
  }
}

export { Settings };
