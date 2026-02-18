/**
 * VoxChronicle - Foundry VTT Session Transcription Module
 * Main entry point for module initialization
 *
 * This module auto-transcribes RPG sessions and publishes chronicles to Kanka
 * with AI-generated content and portraits using OpenAI APIs.
 *
 * @module vox-chronicle
 * @author VoxChronicle Team
 * @license MIT
 */

// Module identifier constant - imported from leaf module to prevent circular dependencies
import { MODULE_ID } from './constants.mjs';

// Import core classes for module initialization
import { Settings } from './core/Settings.mjs';
import { VoxChronicle } from './core/VoxChronicle.mjs';
import { Logger } from './utils/Logger.mjs';

// Create logger instance for main module
const logger = Logger.createChild('main');

/**
 * Singleton reference to the MainPanel Application
 * Lazy-loaded when first needed
 * @type {MainPanel|null}
 */
let mainPanelApp = null;

/**
 * Get or create the MainPanel application instance
 * @returns {Promise<MainPanel>} The main panel application
 */
async function getMainPanel() {
  if (!mainPanelApp) {
    const { MainPanel } = await import('./ui/MainPanel.mjs');
    const voxChronicle = VoxChronicle.getInstance();
    mainPanelApp = MainPanel.getInstance(voxChronicle.sessionOrchestrator);
  }
  return mainPanelApp;
}

/**
 * Tool handler functions for scene controls.
 * Each handler opens the corresponding UI panel.
 * @type {Object<string, Function>}
 */
const toolHandlers = {
  panel: async () => {
    try {
      const existing = foundry.applications.instances.get('vox-chronicle-main-panel');
      if (existing) {
        existing.close();
      } else {
        const panel = await getMainPanel();
        panel.render(true);
      }
    } catch (error) {
      logger.error('Failed to open main panel:', error);
      ui.notifications?.error('VoxChronicle: Failed to open panel. Check console.');
    }
  },
  speakerLabels: async () => {
    try {
      const existing = foundry.applications.instances.get('vox-chronicle-speaker-labeling');
      if (existing) {
        existing.close();
      } else {
        const { SpeakerLabeling } = await import('./ui/SpeakerLabeling.mjs');
        new SpeakerLabeling().render(true);
      }
    } catch (error) {
      logger.error('Failed to open speaker labeling:', error);
      ui.notifications?.error('VoxChronicle: Failed to open speaker labeling. Check console.');
    }
  },
  vocabulary: async () => {
    try {
      const existing = foundry.applications.instances.get('vox-chronicle-vocabulary-manager');
      if (existing) {
        existing.close();
      } else {
        const { VocabularyManager } = await import('./ui/VocabularyManager.mjs');
        new VocabularyManager().render(true);
      }
    } catch (error) {
      logger.error('Failed to open vocabulary manager:', error);
      ui.notifications?.error('VoxChronicle: Failed to open vocabulary manager. Check console.');
    }
  },
  relationshipGraph: async () => {
    try {
      const existing = foundry.applications.instances.get('vox-chronicle-relationship-graph');
      if (existing) {
        existing.close();
      } else {
        const { RelationshipGraph } = await import('./ui/RelationshipGraph.mjs');
        new RelationshipGraph().render(true);
      }
    } catch (error) {
      logger.error('Failed to open relationship graph:', error);
      ui.notifications?.error('VoxChronicle: Failed to open relationship graph. Check console.');
    }
  },
  settings: () => {
    const SettingsApp = foundry?.applications?.settings?.SettingsConfig ?? SettingsConfig;
    const app = new SettingsApp();
    app.render(true, { focus: true });
    setTimeout(() => {
      const section = document.querySelector(`[data-tab="${MODULE_ID}"]`);
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }
};

/**
 * Initialize module - called when Foundry VTT initializes
 * This hook fires before the game is fully ready
 * Use this for registering settings and preparing the module
 */
Hooks.once('init', () => {
  // Log module initialization start
  logger.info('Initializing VoxChronicle module');

  // Register module settings
  Settings.registerSettings();

  // Store module reference on game object for global access
  game[MODULE_ID] = {
    version: game.modules.get(MODULE_ID)?.version ?? '0.0.0',
    ready: false
  };

  logger.info('Module settings registered');
});

/**
 * Module ready - called when Foundry VTT is fully ready
 * All game data is loaded and the canvas is ready
 * Use this to initialize services that depend on game data
 */
Hooks.once('ready', async () => {
  logger.info('VoxChronicle module ready');

  try {
    // Initialize the main VoxChronicle singleton
    const voxChronicle = VoxChronicle.getInstance();
    await voxChronicle.initialize();

    // Mark module as ready
    game[MODULE_ID].ready = true;

    // Enable debug logging if configured in settings
    const debugMode = game.settings.get(MODULE_ID, 'debugMode');
    if (debugMode) {
      Logger.setDebugMode(true);
      logger.info('Debug mode enabled from settings');
    }

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize module:', error);
    ui.notifications?.error(
      'VoxChronicle: Failed to initialize module. Check console for details.'
    );
  }
});

/**
 * Track scene changes for chapter management
 * Updates the chapter tracker when the active scene changes
 */
Hooks.on('canvasReady', () => {
  const vc = VoxChronicle.getInstance();
  if (vc.chapterTracker) {
    const scene = canvas?.scene;
    if (scene) {
      vc.chapterTracker.updateFromScene(scene);
    }
  }
});

/**
 * Invalidate journal parser cache when journal entries are modified
 * Ensures the parser picks up changes to journal content
 */
function invalidateJournalCache() {
  const vc = VoxChronicle.getInstance();
  if (vc.journalParser) {
    vc.journalParser.clearAllCache?.();
  }
}

Hooks.on('updateJournalEntry', invalidateJournalCache);
Hooks.on('createJournalEntry', invalidateJournalCache);
Hooks.on('deleteJournalEntry', invalidateJournalCache);

/**
 * Register VoxChronicle controls in the scene controls sidebar
 * This hook adds a new tool group for session recording controls
 *
 * @param {Object<string, SceneControl>} controls - The scene control groups object
 */
Hooks.on('getSceneControlButtons', (controls) => {
  // Only show controls to GMs
  if (!game.user?.isGM) return;

  controls[MODULE_ID] = {
    name: MODULE_ID,
    icon: 'fa-solid fa-microphone',
    title: 'VOXCHRONICLE.Controls.Title',
    activeTool: 'panel',
    order: 100,
    visible: true,
    tools: {
      panel: {
        name: 'panel',
        icon: 'fa-solid fa-microphone',
        title: 'VOXCHRONICLE.Controls.Panel',
        order: 0,
        button: true,
        onChange: toolHandlers.panel
      },
      speakerLabels: {
        name: 'speakerLabels',
        icon: 'fa-solid fa-users',
        title: 'VOXCHRONICLE.Controls.SpeakerLabels',
        order: 1,
        button: true,
        onChange: toolHandlers.speakerLabels
      },
      vocabulary: {
        name: 'vocabulary',
        icon: 'fa-solid fa-book',
        title: 'VOXCHRONICLE.Controls.Vocabulary',
        order: 2,
        button: true,
        onChange: toolHandlers.vocabulary
      },
      relationshipGraph: {
        name: 'relationshipGraph',
        icon: 'fa-solid fa-project-diagram',
        title: 'VOXCHRONICLE.Controls.RelationshipGraph',
        order: 3,
        button: true,
        onChange: toolHandlers.relationshipGraph
      },
      settings: {
        name: 'settings',
        icon: 'fa-solid fa-cog',
        title: 'VOXCHRONICLE.Controls.Settings',
        order: 4,
        button: true,
        onChange: toolHandlers.settings
      }
    }
  };

  logger.info('Scene control buttons registered');
});

/**
 * Delay before resetting validation button state (ms)
 * @type {number}
 */
const VALIDATION_RESET_DELAY_MS = 2000;

/**
 * Resolve a settings config HTML parameter to a native HTMLElement.
 * Foundry v13 passes a native HTMLElement; v12 passes a jQuery object.
 *
 * @param {HTMLElement|jQuery} html - The rendered HTML from the hook
 * @returns {HTMLElement} The native DOM element
 */
function resolveHtmlElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return html;
}

/**
 * Create and inject a "Test Connection" validation button next to an API key input field.
 * Handles loading states, success/error icons, and auto-reset.
 * Uses native DOM APIs for Foundry v13 compatibility.
 *
 * @param {HTMLElement} container - The settings config container element
 * @param {string} inputName - The input field name attribute to find
 * @param {string} targetName - Identifier for the validation target (e.g. 'openai', 'kanka')
 * @param {Function} validateFn - Async function that returns boolean validation result
 */
function injectValidationButton(container, inputName, targetName, validateFn) {
  const inputElement = container.querySelector(`input[name="${inputName}"]`);
  if (!inputElement) return;

  const validateButton = document.createElement('button');
  validateButton.type = 'button';
  validateButton.className = 'vox-chronicle-validate-button';
  validateButton.dataset.validationTarget = targetName;

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-plug';
  validateButton.appendChild(icon);
  validateButton.append(' Test Connection');

  inputElement.parentElement.appendChild(validateButton);

  validateButton.addEventListener('click', async (event) => {
    event.preventDefault();
    validateButton.disabled = true;
    icon.className = 'fa-solid fa-spinner fa-spin';

    try {
      const isValid = await validateFn();
      icon.className = isValid ? 'fa-solid fa-check' : 'fa-solid fa-times';
    } catch (error) {
      icon.className = 'fa-solid fa-times';
      logger.error(`${targetName} validation error:`, error);
    }

    setTimeout(() => {
      icon.className = 'fa-solid fa-plug';
      validateButton.disabled = false;
    }, VALIDATION_RESET_DELAY_MS);
  });

  logger.info(`Validation button injected for ${targetName}`);
}

/**
 * Inject validation buttons into the settings configuration UI.
 * Adds "Test Connection" buttons next to API key fields for immediate validation feedback.
 * Uses native DOM APIs for Foundry v12/v13 compatibility.
 *
 * @param {SettingsConfig} app - The settings configuration application
 * @param {HTMLElement|jQuery} html - The rendered HTML element (HTMLElement in v13, jQuery in v12)
 */
Hooks.on('renderSettingsConfig', (app, html) => {
  const container = resolveHtmlElement(html);
  if (!container?.querySelector) return;

  injectValidationButton(container, `${MODULE_ID}.openaiApiKey`, 'openai', () =>
    Settings.validateOpenAIKey()
  );

  injectValidationButton(container, `${MODULE_ID}.kankaApiToken`, 'kanka', () =>
    Settings.validateKankaToken()
  );

  // Inject dynamic campaign dropdown to replace text input for kankaCampaignId
  const campaignInput = container.querySelector(`input[name="${MODULE_ID}.kankaCampaignId"]`);
  if (campaignInput) {
    const currentValue = campaignInput.value || '';

    // Create select element to replace the text input
    const campaignSelect = document.createElement('select');
    campaignSelect.name = `${MODULE_ID}.kankaCampaignId`;
    campaignSelect.className = 'vox-chronicle-campaign-select';

    const defaultOption = document.createElement('option');
    defaultOption.value = currentValue;
    defaultOption.selected = true;
    defaultOption.textContent = currentValue || game.i18n.localize('VOXCHRONICLE.Settings.CampaignPlaceholder');
    campaignSelect.appendChild(defaultOption);

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'vox-chronicle-validate-button';
    refreshButton.dataset.action = 'refresh-campaigns';

    const refreshIcon = document.createElement('i');
    refreshIcon.className = 'fa-solid fa-sync-alt';
    refreshButton.appendChild(refreshIcon);

    // Replace input with select + refresh button
    campaignInput.replaceWith(campaignSelect);
    campaignSelect.after(refreshButton);

    /**
     * Load Kanka campaigns into the dropdown
     */
    async function loadCampaigns() {
      const tokenInput = container.querySelector(`input[name="${MODULE_ID}.kankaApiToken"]`);
      const token = tokenInput?.value || Settings.get('kankaApiToken');

      if (!token || token.trim().length === 0) {
        campaignSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = game.i18n.localize('VOXCHRONICLE.Settings.CampaignNeedsToken');
        campaignSelect.appendChild(opt);
        return;
      }

      refreshIcon.classList.add('fa-spin');
      campaignSelect.disabled = true;

      try {
        const { KankaClient } = await import('./kanka/KankaClient.mjs');
        const client = new KankaClient(token);
        const campaigns = await client.getCampaigns();

        campaignSelect.innerHTML = '';

        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = '';
        placeholderOpt.textContent = game.i18n.localize('VOXCHRONICLE.Settings.CampaignPlaceholder');
        campaignSelect.appendChild(placeholderOpt);

        for (const campaign of campaigns) {
          const opt = document.createElement('option');
          opt.value = campaign.id;
          opt.textContent = campaign.name;
          if (campaign.id.toString() === currentValue) opt.selected = true;
          campaignSelect.appendChild(opt);
        }

        if (campaigns.length === 0) {
          campaignSelect.innerHTML = '';
          const noneOpt = document.createElement('option');
          noneOpt.value = '';
          noneOpt.textContent = game.i18n.localize('VOXCHRONICLE.Settings.CampaignNone');
          campaignSelect.appendChild(noneOpt);
        }
      } catch (error) {
        logger.error('Failed to load campaigns:', error);
        campaignSelect.innerHTML = '';
        const errOpt = document.createElement('option');
        errOpt.value = currentValue;
        errOpt.textContent = currentValue || game.i18n.localize('VOXCHRONICLE.Settings.CampaignError');
        campaignSelect.appendChild(errOpt);
      } finally {
        refreshIcon.classList.remove('fa-spin');
        campaignSelect.disabled = false;
      }
    }

    // Wire up refresh button
    refreshButton.addEventListener('click', (event) => {
      event.preventDefault();
      loadCampaigns();
    });

    // Auto-fetch campaigns when user types/pastes Kanka API token
    let tokenDebounceTimer = null;
    const kankaTokenInput = container.querySelector(`input[name="${MODULE_ID}.kankaApiToken"]`);
    if (kankaTokenInput) {
      kankaTokenInput.addEventListener('input', () => {
        clearTimeout(tokenDebounceTimer);
        tokenDebounceTimer = setTimeout(() => {
          const val = kankaTokenInput.value?.trim();
          if (val && val.length > 10) {
            loadCampaigns();
          }
        }, 800);
      });
    }

    // Auto-load campaigns if token exists in saved settings
    const kankaToken = Settings.get('kankaApiToken');
    if (kankaToken && kankaToken.trim().length > 0) {
      loadCampaigns();
    }

    logger.info('Campaign dropdown injected');
  }
});

