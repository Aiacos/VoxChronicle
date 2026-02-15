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
    const panel = await getMainPanel();
    if (panel.isRendered) {
      panel.close();
    } else {
      panel.render(true);
    }
  },
  speakerLabels: async () => {
    const { SpeakerLabeling } = await import('./ui/SpeakerLabeling.mjs');
    const speakerLabeling = new SpeakerLabeling();
    speakerLabeling.render(true, { focus: true });
  },
  vocabulary: async () => {
    const { VocabularyManager } = await import('./ui/VocabularyManager.mjs');
    const vocabularyManager = new VocabularyManager();
    vocabularyManager.render(true, { focus: true });
  },
  relationshipGraph: async () => {
    const { RelationshipGraph } = await import('./ui/RelationshipGraph.mjs');
    const graph = new RelationshipGraph();
    graph.render(true, { focus: true });
  },
  settings: () => {
    const app = new SettingsConfig();
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
      vc.chapterTracker.onSceneChange(scene.name, scene.id);
    }
  }
});

/**
 * Invalidate journal parser cache when journal entries are modified
 * Ensures the parser picks up changes to journal content
 */
Hooks.on('updateJournalEntry', () => {
  const vc = VoxChronicle.getInstance();
  if (vc.journalParser) {
    vc.journalParser.invalidateCache?.();
  }
});

Hooks.on('createJournalEntry', () => {
  const vc = VoxChronicle.getInstance();
  if (vc.journalParser) {
    vc.journalParser.invalidateCache?.();
  }
});

Hooks.on('deleteJournalEntry', () => {
  const vc = VoxChronicle.getInstance();
  if (vc.journalParser) {
    vc.journalParser.invalidateCache?.();
  }
});

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
 * Create and inject a "Test Connection" validation button next to an API key input field.
 * Handles loading states, success/error icons, and auto-reset.
 *
 * @param {jQuery} inputElement - The input field to attach the button to
 * @param {string} targetName - Identifier for the validation target (e.g. 'openai', 'kanka')
 * @param {Function} validateFn - Async function that returns boolean validation result
 */
function injectValidationButton(inputElement, targetName, validateFn) {
  if (inputElement.length === 0) return;

  const validateButton = $(`
    <button type="button" class="vox-chronicle-validate-button" data-validation-target="${targetName}">
      <i class="fa-solid fa-plug"></i> Test Connection
    </button>
  `);

  inputElement.parent().append(validateButton);

  validateButton.on('click', async (event) => {
    event.preventDefault();
    const button = $(event.currentTarget);
    const icon = button.find('i');

    button.prop('disabled', true);
    icon.removeClass('fa-plug').addClass('fa-spinner fa-spin');

    try {
      const isValid = await validateFn();
      icon.removeClass('fa-spinner fa-spin').addClass(isValid ? 'fa-check' : 'fa-times');
    } catch (error) {
      icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
      logger.error(`${targetName} validation error:`, error);
    }

    setTimeout(() => {
      icon.removeClass('fa-check fa-times').addClass('fa-plug');
      button.prop('disabled', false);
    }, VALIDATION_RESET_DELAY_MS);
  });

  logger.info(`Validation button injected for ${targetName}`);
}

/**
 * Inject validation buttons into the settings configuration UI.
 * Adds "Test Connection" buttons next to API key fields for immediate validation feedback.
 *
 * @param {SettingsConfig} app - The settings configuration application
 * @param {jQuery} html - The rendered HTML element
 */
Hooks.on('renderSettingsConfig', (app, html) => {
  injectValidationButton(html.find(`input[name="${MODULE_ID}.openaiApiKey"]`), 'openai', () =>
    Settings.validateOpenAIKey()
  );

  injectValidationButton(html.find(`input[name="${MODULE_ID}.kankaApiToken"]`), 'kanka', () =>
    Settings.validateKankaToken()
  );

  // Inject dynamic campaign dropdown to replace text input for kankaCampaignId
  const campaignInput = html.find(`input[name="${MODULE_ID}.kankaCampaignId"]`);
  if (campaignInput.length > 0) {
    const currentValue = campaignInput.val() || '';

    // Create select element to replace the text input
    const campaignSelect = $(`
      <select name="${MODULE_ID}.kankaCampaignId" class="vox-chronicle-campaign-select">
        <option value="${currentValue}" selected>${currentValue || game.i18n.localize('VOXCHRONICLE.Settings.CampaignPlaceholder')}</option>
      </select>
    `);

    const refreshButton = $(`
      <button type="button" class="vox-chronicle-validate-button" data-action="refresh-campaigns">
        <i class="fa-solid fa-sync-alt"></i>
      </button>
    `);

    // Replace input with select + refresh button
    campaignInput.replaceWith(campaignSelect);
    campaignSelect.after(refreshButton);

    /**
     * Load Kanka campaigns into the dropdown
     */
    async function loadCampaigns() {
      const token =
        html.find(`input[name="${MODULE_ID}.kankaApiToken"]`).val() ||
        Settings.get('kankaApiToken');

      if (!token || token.trim().length === 0) {
        campaignSelect.html(
          `<option value="">${game.i18n.localize('VOXCHRONICLE.Settings.CampaignNeedsToken')}</option>`
        );
        return;
      }

      const refreshIcon = refreshButton.find('i');
      refreshIcon.addClass('fa-spin');
      campaignSelect.prop('disabled', true);

      try {
        const { KankaClient } = await import('./kanka/KankaClient.mjs');
        const client = new KankaClient(token);
        const campaigns = await client.getCampaigns();

        campaignSelect.empty();
        campaignSelect.append(
          `<option value="">${game.i18n.localize('VOXCHRONICLE.Settings.CampaignPlaceholder')}</option>`
        );

        for (const campaign of campaigns) {
          const selected = campaign.id.toString() === currentValue ? 'selected' : '';
          campaignSelect.append(
            `<option value="${campaign.id}" ${selected}>${campaign.name}</option>`
          );
        }

        if (campaigns.length === 0) {
          campaignSelect.html(
            `<option value="">${game.i18n.localize('VOXCHRONICLE.Settings.CampaignNone')}</option>`
          );
        }
      } catch (error) {
        logger.error('Failed to load campaigns:', error);
        campaignSelect.html(
          `<option value="${currentValue}">${currentValue || game.i18n.localize('VOXCHRONICLE.Settings.CampaignError')}</option>`
        );
      } finally {
        refreshIcon.removeClass('fa-spin');
        campaignSelect.prop('disabled', false);
      }
    }

    // Wire up refresh button
    refreshButton.on('click', (event) => {
      event.preventDefault();
      loadCampaigns();
    });

    // Auto-load campaigns if token exists
    const kankaToken = Settings.get('kankaApiToken');
    if (kankaToken && kankaToken.trim().length > 0) {
      loadCampaigns();
    }

    logger.info('Campaign dropdown injected');
  }
});

// Re-export module ID for backward compatibility
export { MODULE_ID } from './constants.mjs';
