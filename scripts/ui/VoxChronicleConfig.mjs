/**
 * VoxChronicleConfig - Configuration Panel for VoxChronicle Module
 *
 * A Foundry VTT FormApplication that provides a dedicated configuration interface
 * for VoxChronicle settings. Features include:
 * - OpenAI API key management with connection testing
 * - Kanka API token management with connection testing
 * - Dynamic Kanka campaign selection dropdown
 * - Loading states and error handling for async operations
 *
 * @class VoxChronicleConfig
 * @augments FormApplication
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { Settings } from '../core/Settings.mjs';
import { escapeHtml } from '../utils/HtmlUtils.mjs';

/**
 * VoxChronicleConfig FormApplication class
 * Provides a configuration UI for managing VoxChronicle settings
 */
class VoxChronicleConfig extends FormApplication {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('VoxChronicleConfig');

  /**
   * List of available Kanka campaigns
   * @type {Array}
   * @private
   */
  _campaigns = [];

  /**
   * Whether campaigns are currently being loaded
   * @type {boolean}
   * @private
   */
  _isLoadingCampaigns = false;

  /**
   * Error message for campaign loading
   * @type {string|null}
   * @private
   */
  _campaignError = null;

  /**
   * Whether OpenAI validation is in progress
   * @type {boolean}
   * @private
   */
  _isValidatingOpenAI = false;

  /**
   * Whether Kanka validation is in progress
   * @type {boolean}
   * @private
   */
  _isValidatingKanka = false;

  /**
   * Get default options for the FormApplication
   * @returns {object} Default application options
   * @static
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-config',
      title: game.i18n?.localize('VOXCHRONICLE.Config.Title') || 'VoxChronicle Configuration',
      template: `modules/${MODULE_ID}/templates/config.hbs`,
      classes: ['vox-chronicle', 'vox-chronicle-config'],
      width: 500,
      height: 'auto',
      closeOnSubmit: false,
      submitOnClose: false,
      submitOnChange: true,
      resizable: true
    });
  }

  /**
   * Create a new VoxChronicleConfig instance
   * @param {object} [object] - Form data object
   * @param {object} [options] - Application options
   */
  constructor(object = {}, options = {}) {
    super(object, options);
    this._logger.debug('VoxChronicleConfig initialized');
  }

  /**
   * Get data for the template
   * @param {object} _options - Render options
   * @returns {Promise<object>} Template data
   */
  async getData(_options = {}) {
    // Get current settings values
    const openaiApiKey = Settings.get('openaiApiKey') || '';
    const kankaApiToken = Settings.get('kankaApiToken') || '';
    const kankaCampaignId = Settings.get('kankaCampaignId') || '';
    const transcriptionLanguage = Settings.get('transcriptionLanguage') || '';
    const transcriptionMode = Settings.get('transcriptionMode') || 'auto';
    const whisperBackendUrl = Settings.get('whisperBackendUrl') || 'http://localhost:8080';
    const imageQuality = Settings.get('imageQuality') || 'standard';
    const maxImagesPerSession = Settings.get('maxImagesPerSession') ?? 3;
    const autoExtractEntities = Settings.get('autoExtractEntities') ?? true;
    const confirmEntityCreation = Settings.get('confirmEntityCreation') ?? true;

    // Check configuration status
    const hasOpenAIKey = openaiApiKey && openaiApiKey.trim().length > 0;
    const hasKankaToken = kankaApiToken && kankaApiToken.trim().length > 0;
    const hasCampaigns = this._campaigns && this._campaigns.length > 0;

    // Language options
    const languageOptions = {
      '': game.i18n?.localize('VOXCHRONICLE.Settings.LanguageAuto') || 'Auto-detect',
      en: 'English',
      it: 'Italiano',
      es: 'Espa\u00f1ol',
      de: 'Deutsch',
      fr: 'Fran\u00e7ais',
      pt: 'Portugu\u00eas',
      pl: 'Polski',
      ru: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439',
      ja: '\u65e5\u672c\u8a9e',
      zh: '\u4e2d\u6587'
    };

    // Transcription mode options
    const modeOptions = {
      api: game.i18n?.localize('VOXCHRONICLE.Settings.TranscriptionModeAPI') || 'API (OpenAI)',
      local:
        game.i18n?.localize('VOXCHRONICLE.Settings.TranscriptionModeLocal') || 'Local (Whisper)',
      auto: game.i18n?.localize('VOXCHRONICLE.Settings.TranscriptionModeAuto') || 'Auto'
    };

    // Image quality options
    const qualityOptions = {
      standard:
        game.i18n?.localize('VOXCHRONICLE.Settings.ImageQualityStandard') || 'Standard ($0.04)',
      hd: game.i18n?.localize('VOXCHRONICLE.Settings.ImageQualityHD') || 'HD ($0.08)'
    };

    return {
      moduleId: MODULE_ID,

      // API Keys
      openaiApiKey,
      kankaApiToken,
      hasOpenAIKey,
      hasKankaToken,

      // Campaign selection
      campaigns: this._campaigns,
      kankaCampaignId,
      hasCampaigns,
      isLoadingCampaigns: this._isLoadingCampaigns,
      campaignError: this._campaignError,
      canSelectCampaign: hasKankaToken && !this._isLoadingCampaigns && !this._campaignError,

      // Transcription settings
      transcriptionLanguage,
      languageOptions,
      transcriptionMode,
      modeOptions,
      whisperBackendUrl,

      // Image settings
      imageQuality,
      qualityOptions,
      maxImagesPerSession,

      // Entity extraction settings
      autoExtractEntities,
      confirmEntityCreation,

      // Validation state
      isValidatingOpenAI: this._isValidatingOpenAI,
      isValidatingKanka: this._isValidatingKanka,

      // Localization strings
      i18n: {
        title: game.i18n?.localize('VOXCHRONICLE.Config.Title') || 'VoxChronicle Configuration',
        openaiSection:
          game.i18n?.localize('VOXCHRONICLE.Config.OpenAISection') || 'OpenAI Settings',
        openaiKeyLabel: game.i18n?.localize('VOXCHRONICLE.Settings.OpenAIKey') || 'OpenAI API Key',
        openaiKeyHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.OpenAIKeyHint') ||
          'Your OpenAI API key for transcription and image generation',
        kankaSection: game.i18n?.localize('VOXCHRONICLE.Config.KankaSection') || 'Kanka Settings',
        kankaTokenLabel:
          game.i18n?.localize('VOXCHRONICLE.Settings.KankaToken') || 'Kanka API Token',
        kankaTokenHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.KankaTokenHint') ||
          'Your Kanka API token for publishing chronicles',
        campaignLabel: game.i18n?.localize('VOXCHRONICLE.Config.CampaignLabel') || 'Kanka Campaign',
        campaignHint:
          game.i18n?.localize('VOXCHRONICLE.Config.CampaignHint') ||
          'Select the campaign to publish chronicles to',
        campaignPlaceholder:
          game.i18n?.localize('VOXCHRONICLE.Config.CampaignPlaceholder') || 'Select a campaign...',
        campaignLoading:
          game.i18n?.localize('VOXCHRONICLE.Config.CampaignLoading') || 'Loading campaigns...',
        campaignError:
          game.i18n?.localize('VOXCHRONICLE.Config.CampaignError') || 'Failed to load campaigns',
        campaignNone:
          game.i18n?.localize('VOXCHRONICLE.Config.CampaignNone') || 'No campaigns found',
        campaignNeedsToken:
          game.i18n?.localize('VOXCHRONICLE.Config.CampaignNeedsToken') ||
          'Enter a valid Kanka API token first',
        refreshCampaigns:
          game.i18n?.localize('VOXCHRONICLE.Config.RefreshCampaigns') || 'Refresh Campaigns',
        testConnection:
          game.i18n?.localize('VOXCHRONICLE.Config.TestConnection') || 'Test Connection',
        transcriptionSection:
          game.i18n?.localize('VOXCHRONICLE.Config.TranscriptionSection') ||
          'Transcription Settings',
        languageLabel: game.i18n?.localize('VOXCHRONICLE.Settings.Language') || 'Language',
        languageHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.LanguageHint') ||
          'Transcription language (auto-detect if not set)',
        modeLabel:
          game.i18n?.localize('VOXCHRONICLE.Settings.TranscriptionMode') || 'Transcription Mode',
        modeHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.TranscriptionModeHint') ||
          'Choose between API or local transcription',
        whisperUrlLabel:
          game.i18n?.localize('VOXCHRONICLE.Settings.WhisperBackendUrl') || 'Whisper Backend URL',
        whisperUrlHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.WhisperBackendUrlHint') ||
          'URL for local whisper.cpp backend',
        imageSection:
          game.i18n?.localize('VOXCHRONICLE.Config.ImageSection') || 'Image Generation Settings',
        qualityLabel: game.i18n?.localize('VOXCHRONICLE.Settings.ImageQuality') || 'Image Quality',
        qualityHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.ImageQualityHint') ||
          'DALL-E 3 image quality setting',
        maxImagesLabel:
          game.i18n?.localize('VOXCHRONICLE.Settings.MaxImages') || 'Max Images Per Session',
        maxImagesHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.MaxImagesHint') ||
          'Maximum images to generate per session (0 to disable)',
        entitySection:
          game.i18n?.localize('VOXCHRONICLE.Config.EntitySection') || 'Entity Extraction Settings',
        autoExtractLabel:
          game.i18n?.localize('VOXCHRONICLE.Settings.AutoExtract') || 'Auto-Extract Entities',
        autoExtractHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.AutoExtractHint') ||
          'Automatically extract NPCs, locations, and items from transcripts',
        confirmCreationLabel:
          game.i18n?.localize('VOXCHRONICLE.Settings.ConfirmEntities') || 'Confirm Entity Creation',
        confirmCreationHint:
          game.i18n?.localize('VOXCHRONICLE.Settings.ConfirmEntitiesHint') ||
          'Show confirmation dialog before creating entities in Kanka',
        save: game.i18n?.localize('VOXCHRONICLE.Config.Save') || 'Save',
        cancel: game.i18n?.localize('VOXCHRONICLE.Config.Cancel') || 'Cancel'
      }
    };
  }

  /**
   * Activate event listeners for the rendered HTML
   * @param {jQuery} html - The rendered HTML element
   */
  activateListeners(html) {
    super.activateListeners(html);

    // OpenAI test connection button
    html.find('[data-action="test-openai"]').on('click', this._onTestOpenAIConnection.bind(this));

    // Kanka test connection button
    html.find('[data-action="test-kanka"]').on('click', this._onTestKankaConnection.bind(this));

    // Refresh campaigns button
    html.find('[data-action="refresh-campaigns"]').on('click', this._onRefreshCampaigns.bind(this));

    // API token input change - trigger campaign refresh
    html.find('input[name="kankaApiToken"]').on('change', this._onKankaTokenChange.bind(this));

    this._logger.debug('Event listeners activated');

    // Auto-load campaigns if we have a token
    if (Settings.get('kankaApiToken')) {
      this._loadCampaigns();
    }
  }

  /**
   * Handle form submission
   * @param {Event} event - The form submission event
   * @param {object} formData - The form data object
   * @returns {Promise<void>}
   * @protected
   */
  async _updateObject(event, formData) {
    this._logger.log('Saving configuration...');

    try {
      // Save each setting
      if ('openaiApiKey' in formData) {
        await Settings.set('openaiApiKey', formData.openaiApiKey);
      }
      if ('kankaApiToken' in formData) {
        await Settings.set('kankaApiToken', formData.kankaApiToken);
      }
      if ('kankaCampaignId' in formData) {
        await Settings.set('kankaCampaignId', formData.kankaCampaignId);
      }
      if ('transcriptionLanguage' in formData) {
        await Settings.set('transcriptionLanguage', formData.transcriptionLanguage);
      }
      if ('transcriptionMode' in formData) {
        await Settings.set('transcriptionMode', formData.transcriptionMode);
      }
      if ('whisperBackendUrl' in formData) {
        await Settings.set('whisperBackendUrl', formData.whisperBackendUrl);
      }
      if ('imageQuality' in formData) {
        await Settings.set('imageQuality', formData.imageQuality);
      }
      if ('maxImagesPerSession' in formData) {
        await Settings.set('maxImagesPerSession', parseInt(formData.maxImagesPerSession, 10));
      }
      if ('autoExtractEntities' in formData) {
        await Settings.set('autoExtractEntities', formData.autoExtractEntities);
      }
      if ('confirmEntityCreation' in formData) {
        await Settings.set('confirmEntityCreation', formData.confirmEntityCreation);
      }

      this._logger.log('Configuration saved successfully');
    } catch (error) {
      this._logger.error('Failed to save configuration:', error);
      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.Config.SaveFailed') || 'Failed to save configuration'
      );
    }
  }

  /**
   * Handle OpenAI test connection button click
   * @param {Event} event - The click event
   * @private
   */
  async _onTestOpenAIConnection(event) {
    event.preventDefault();

    if (this._isValidatingOpenAI) return;

    const button = $(event.currentTarget);
    const icon = button.find('i');

    this._isValidatingOpenAI = true;
    button.prop('disabled', true);
    icon.removeClass('fa-plug').addClass('fa-spinner fa-spin');

    try {
      const isValid = await Settings.validateOpenAIKey();

      if (isValid) {
        icon.removeClass('fa-spinner fa-spin').addClass('fa-check');
      } else {
        icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
      }
    } catch (error) {
      this._logger.error('OpenAI validation error:', error);
      icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
    } finally {
      this._isValidatingOpenAI = false;

      // Reset button after 2 seconds
      setTimeout(() => {
        icon.removeClass('fa-check fa-times').addClass('fa-plug');
        button.prop('disabled', false);
      }, 2000);
    }
  }

  /**
   * Handle Kanka test connection button click
   * @param {Event} event - The click event
   * @private
   */
  async _onTestKankaConnection(event) {
    event.preventDefault();

    if (this._isValidatingKanka) return;

    const button = $(event.currentTarget);
    const icon = button.find('i');

    this._isValidatingKanka = true;
    button.prop('disabled', true);
    icon.removeClass('fa-plug').addClass('fa-spinner fa-spin');

    try {
      const isValid = await Settings.validateKankaToken();

      if (isValid) {
        icon.removeClass('fa-spinner fa-spin').addClass('fa-check');
        // Also refresh campaigns on successful validation
        await this._loadCampaigns();
      } else {
        icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
      }
    } catch (error) {
      this._logger.error('Kanka validation error:', error);
      icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
    } finally {
      this._isValidatingKanka = false;

      // Reset button after 2 seconds
      setTimeout(() => {
        icon.removeClass('fa-check fa-times').addClass('fa-plug');
        button.prop('disabled', false);
      }, 2000);
    }
  }

  /**
   * Handle refresh campaigns button click
   * @param {Event} event - The click event
   * @private
   */
  async _onRefreshCampaigns(event) {
    event.preventDefault();
    await this._loadCampaigns();
  }

  /**
   * Handle Kanka token input change
   * @param {Event} event - The change event
   * @private
   */
  async _onKankaTokenChange(event) {
    const newToken = event.currentTarget.value;

    // Clear campaigns when token changes
    this._campaigns = [];
    this._campaignError = null;

    if (newToken && newToken.trim().length > 0) {
      // Load campaigns with new token
      await this._loadCampaigns();
    } else {
      // Re-render to show empty state
      this.render(false);
    }
  }

  /**
   * Load campaigns from Kanka API
   * @private
   */
  async _loadCampaigns() {
    const token = Settings.get('kankaApiToken');

    if (!token || token.trim().length === 0) {
      this._campaigns = [];
      this._campaignError = null;
      this.render(false);
      return;
    }

    this._isLoadingCampaigns = true;
    this._campaignError = null;
    this.render(false);

    try {
      // Import KankaClient dynamically to avoid circular dependencies
      const { KankaClient } = await import('../kanka/KankaClient.mjs');
      const client = new KankaClient(token);
      this._campaigns = await client.getCampaigns();
      this._logger.debug(`Loaded ${this._campaigns.length} campaigns`);
    } catch (error) {
      this._logger.error('Failed to load campaigns:', error);
      this._campaignError = error.message || 'Failed to load campaigns';
      this._campaigns = [];
    } finally {
      this._isLoadingCampaigns = false;
      this.render(false);
    }
  }

  /**
   * Render fallback content when template is not available
   * This generates inline HTML for the configuration form
   * @returns {Promise<string>} Inline HTML content
   * @private
   */
  async _renderFallbackContent() {
    const data = await this.getData();

    // Build campaign options
    let campaignOptions = '';
    if (data.isLoadingCampaigns) {
      campaignOptions = `<option value="">${escapeHtml(data.i18n.campaignLoading)}</option>`;
    } else if (data.campaignError) {
      campaignOptions = `<option value="">${escapeHtml(data.i18n.campaignError)}</option>`;
    } else if (!data.hasKankaToken) {
      campaignOptions = `<option value="">${escapeHtml(data.i18n.campaignNeedsToken)}</option>`;
    } else if (!data.hasCampaigns) {
      campaignOptions = `<option value="">${escapeHtml(data.i18n.campaignNone)}</option>`;
    } else {
      campaignOptions = `<option value="">${escapeHtml(data.i18n.campaignPlaceholder)}</option>`;
      for (const campaign of data.campaigns) {
        const selected = campaign.id.toString() === data.kankaCampaignId ? 'selected' : '';
        campaignOptions += `<option value="${campaign.id}" ${selected}>${escapeHtml(campaign.name)}</option>`;
      }
    }

    // Build language options
    let languageOptions = '';
    for (const [value, label] of Object.entries(data.languageOptions)) {
      const selected = value === data.transcriptionLanguage ? 'selected' : '';
      languageOptions += `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
    }

    // Build mode options
    let modeOptions = '';
    for (const [value, label] of Object.entries(data.modeOptions)) {
      const selected = value === data.transcriptionMode ? 'selected' : '';
      modeOptions += `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
    }

    // Build quality options
    let qualityOptions = '';
    for (const [value, label] of Object.entries(data.qualityOptions)) {
      const selected = value === data.imageQuality ? 'selected' : '';
      qualityOptions += `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
    }

    return `
      <form class="vox-chronicle-config-form" autocomplete="off">
        <!-- OpenAI Section -->
        <section class="config-section">
          <h2><i class="fas fa-brain"></i> ${escapeHtml(data.i18n.openaiSection)}</h2>

          <div class="form-group">
            <label for="openaiApiKey">${escapeHtml(data.i18n.openaiKeyLabel)}</label>
            <div class="form-fields">
              <input type="password" name="openaiApiKey" id="openaiApiKey"
                     value="${escapeHtml(data.openaiApiKey)}"
                     placeholder="sk-..." autocomplete="new-password" />
              <button type="button" class="btn-test" data-action="test-openai" title="${escapeHtml(data.i18n.testConnection)}">
                <i class="fas fa-plug"></i>
              </button>
            </div>
            <p class="hint">${escapeHtml(data.i18n.openaiKeyHint)}</p>
          </div>
        </section>

        <!-- Kanka Section -->
        <section class="config-section">
          <h2><i class="fas fa-book"></i> ${escapeHtml(data.i18n.kankaSection)}</h2>

          <div class="form-group">
            <label for="kankaApiToken">${escapeHtml(data.i18n.kankaTokenLabel)}</label>
            <div class="form-fields">
              <input type="password" name="kankaApiToken" id="kankaApiToken"
                     value="${escapeHtml(data.kankaApiToken)}"
                     placeholder="..." autocomplete="new-password" />
              <button type="button" class="btn-test" data-action="test-kanka" title="${escapeHtml(data.i18n.testConnection)}">
                <i class="fas fa-plug"></i>
              </button>
            </div>
            <p class="hint">${escapeHtml(data.i18n.kankaTokenHint)}</p>
          </div>

          <div class="form-group">
            <label for="kankaCampaignId">${escapeHtml(data.i18n.campaignLabel)}</label>
            <div class="form-fields">
              <select name="kankaCampaignId" id="kankaCampaignId"
                      ${!data.canSelectCampaign ? 'disabled' : ''}>
                ${campaignOptions}
              </select>
              <button type="button" class="btn-refresh" data-action="refresh-campaigns"
                      title="${escapeHtml(data.i18n.refreshCampaigns)}"
                      ${!data.hasKankaToken ? 'disabled' : ''}>
                <i class="fas fa-sync-alt ${data.isLoadingCampaigns ? 'fa-spin' : ''}"></i>
              </button>
            </div>
            <p class="hint">${escapeHtml(data.i18n.campaignHint)}</p>
            ${data.campaignError ? `<p class="error">${escapeHtml(data.campaignError)}</p>` : ''}
          </div>
        </section>

        <!-- Transcription Section -->
        <section class="config-section">
          <h2><i class="fas fa-microphone"></i> ${escapeHtml(data.i18n.transcriptionSection)}</h2>

          <div class="form-group">
            <label for="transcriptionLanguage">${escapeHtml(data.i18n.languageLabel)}</label>
            <div class="form-fields">
              <select name="transcriptionLanguage" id="transcriptionLanguage">
                ${languageOptions}
              </select>
            </div>
            <p class="hint">${escapeHtml(data.i18n.languageHint)}</p>
          </div>

          <div class="form-group">
            <label for="transcriptionMode">${escapeHtml(data.i18n.modeLabel)}</label>
            <div class="form-fields">
              <select name="transcriptionMode" id="transcriptionMode">
                ${modeOptions}
              </select>
            </div>
            <p class="hint">${escapeHtml(data.i18n.modeHint)}</p>
          </div>

          <div class="form-group">
            <label for="whisperBackendUrl">${escapeHtml(data.i18n.whisperUrlLabel)}</label>
            <div class="form-fields">
              <input type="text" name="whisperBackendUrl" id="whisperBackendUrl"
                     value="${escapeHtml(data.whisperBackendUrl)}" />
            </div>
            <p class="hint">${escapeHtml(data.i18n.whisperUrlHint)}</p>
          </div>
        </section>

        <!-- Image Section -->
        <section class="config-section">
          <h2><i class="fas fa-image"></i> ${escapeHtml(data.i18n.imageSection)}</h2>

          <div class="form-group">
            <label for="imageQuality">${escapeHtml(data.i18n.qualityLabel)}</label>
            <div class="form-fields">
              <select name="imageQuality" id="imageQuality">
                ${qualityOptions}
              </select>
            </div>
            <p class="hint">${escapeHtml(data.i18n.qualityHint)}</p>
          </div>

          <div class="form-group">
            <label for="maxImagesPerSession">${escapeHtml(data.i18n.maxImagesLabel)}</label>
            <div class="form-fields">
              <input type="number" name="maxImagesPerSession" id="maxImagesPerSession"
                     value="${data.maxImagesPerSession}" min="0" max="10" step="1" />
            </div>
            <p class="hint">${escapeHtml(data.i18n.maxImagesHint)}</p>
          </div>
        </section>

        <!-- Entity Section -->
        <section class="config-section">
          <h2><i class="fas fa-users"></i> ${escapeHtml(data.i18n.entitySection)}</h2>

          <div class="form-group">
            <label for="autoExtractEntities" class="checkbox-label">
              <input type="checkbox" name="autoExtractEntities" id="autoExtractEntities"
                     ${data.autoExtractEntities ? 'checked' : ''} />
              ${escapeHtml(data.i18n.autoExtractLabel)}
            </label>
            <p class="hint">${escapeHtml(data.i18n.autoExtractHint)}</p>
          </div>

          <div class="form-group">
            <label for="confirmEntityCreation" class="checkbox-label">
              <input type="checkbox" name="confirmEntityCreation" id="confirmEntityCreation"
                     ${data.confirmEntityCreation ? 'checked' : ''} />
              ${escapeHtml(data.i18n.confirmCreationLabel)}
            </label>
            <p class="hint">${escapeHtml(data.i18n.confirmCreationHint)}</p>
          </div>
        </section>

        <footer class="sheet-footer flexrow">
          <button type="submit" class="btn-save">
            <i class="fas fa-save"></i> ${escapeHtml(data.i18n.save)}
          </button>
        </footer>
      </form>
    `;
  }

  /**
   * Override _renderInner to provide fallback content if template is missing
   * @param {object} data - Template data
   * @returns {Promise<jQuery>} Rendered inner content
   * @protected
   */
  async _renderInner(data) {
    try {
      return await super._renderInner(data);
    } catch {
      // Template not found, use inline fallback
      this._logger.warn('Template not found, using fallback HTML');
      const html = await this._renderFallbackContent();
      return $(html);
    }
  }
}

// Export the class
export { VoxChronicleConfig };
