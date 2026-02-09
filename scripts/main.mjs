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

// Module identifier constant - used for settings, logging, and hooks
const MODULE_ID = 'vox-chronicle';

// Import core classes for module initialization
import { Settings } from './core/Settings.mjs';
import { VoxChronicle } from './core/VoxChronicle.mjs';
import { Logger } from './utils/Logger.mjs';

// Create logger instance for main module
const logger = Logger.createChild('main');

/**
 * Singleton reference to the RecorderControls Application
 * Lazy-loaded when first needed
 * @type {RecorderControls|null}
 */
let recorderControlsApp = null;

/**
 * Get or create the RecorderControls application instance
 * @returns {Promise<RecorderControls>} The recorder controls application
 */
async function getRecorderControls() {
  if (!recorderControlsApp) {
    const { RecorderControls } = await import('./ui/RecorderControls.mjs');
    recorderControlsApp = new RecorderControls();
  }
  return recorderControlsApp;
}

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
    version: '1.0.0',
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

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize module:', error);
    ui.notifications?.error(
      'VoxChronicle: Failed to initialize module. Check console for details.'
    );
  }
});

/**
 * Register VoxChronicle controls in the scene controls sidebar
 * This hook adds a new tool group for session recording controls
 *
 * @param {SceneControl[]} controls - The array of scene control groups
 */
Hooks.on('getSceneControlButtons', (controls) => {
  // Only show controls to GMs
  if (!game.user?.isGM) return;

  const isV13 = typeof controls === 'object' && !Array.isArray(controls);

  if (isV13) {
    // Foundry v13: SceneControl requires name, title, icon, activeTool, order, tools
    // SceneControlTool requires name, title, icon, order, and uses onChange (not onClick)
    controls[MODULE_ID] = {
      name: MODULE_ID,
      icon: 'fa-solid fa-microphone',
      title: 'VOXCHRONICLE.Controls.Title',
      activeTool: 'recorder',
      order: 100,
      visible: true,
      tools: {
        recorder: {
          name: 'recorder',
          icon: 'fa-solid fa-microphone',
          title: 'VOXCHRONICLE.Controls.Recorder',
          order: 0,
          button: true,
          onChange: async () => {
            const recorder = await getRecorderControls();
            recorder.render(true, { focus: true });
          }
        },
        speakerLabels: {
          name: 'speakerLabels',
          icon: 'fa-solid fa-users',
          title: 'VOXCHRONICLE.Controls.SpeakerLabels',
          order: 1,
          button: true,
          onChange: async () => {
            const { SpeakerLabeling } = await import('./ui/SpeakerLabeling.mjs');
            const speakerLabeling = new SpeakerLabeling();
            speakerLabeling.render(true, { focus: true });
          }
        },
        vocabulary: {
          name: 'vocabulary',
          icon: 'fa-solid fa-book',
          title: 'VOXCHRONICLE.Controls.Vocabulary',
          order: 2,
          button: true,
          onChange: async () => {
            const { VocabularyManager } = await import('./ui/VocabularyManager.mjs');
            const vocabularyManager = new VocabularyManager();
            vocabularyManager.render(true, { focus: true });
          }
        },
        relationshipGraph: {
          name: 'relationshipGraph',
          icon: 'fa-solid fa-project-diagram',
          title: 'VOXCHRONICLE.Controls.RelationshipGraph',
          order: 3,
          button: true,
          onChange: async () => {
            const { RelationshipGraph } = await import('./ui/RelationshipGraph.mjs');
            const graph = new RelationshipGraph();
            graph.render(true, { focus: true });
          }
        },
        settings: {
          name: 'settings',
          icon: 'fa-solid fa-cog',
          title: 'VOXCHRONICLE.Controls.Settings',
          order: 4,
          button: true,
          onChange: () => {
            const app = new SettingsConfig();
            app.render(true, { focus: true });
            setTimeout(() => {
              const section = document.querySelector(`[data-tab="${MODULE_ID}"]`);
              if (section) section.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
        }
      }
    };
  } else if (Array.isArray(controls)) {
    // Foundry v11/v12: controls is an array, tools is an array
    controls.push({
      name: MODULE_ID,
      title: 'VOXCHRONICLE.Controls.Title',
      icon: 'fas fa-microphone',
      layer: 'controls',
      visible: true,
      tools: [
        {
          name: 'recorder',
          title: 'VOXCHRONICLE.Controls.Recorder',
          icon: 'fas fa-microphone',
          button: true,
          onClick: async () => {
            const recorder = await getRecorderControls();
            recorder.render(true, { focus: true });
          }
        },
        {
          name: 'speaker-labels',
          title: 'VOXCHRONICLE.Controls.SpeakerLabels',
          icon: 'fas fa-users',
          button: true,
          onClick: async () => {
            const { SpeakerLabeling } = await import('./ui/SpeakerLabeling.mjs');
            const speakerLabeling = new SpeakerLabeling();
            speakerLabeling.render(true, { focus: true });
          }
        },
        {
          name: 'vocabulary',
          title: 'VOXCHRONICLE.Controls.Vocabulary',
          icon: 'fas fa-book',
          button: true,
          onClick: async () => {
            const { VocabularyManager } = await import('./ui/VocabularyManager.mjs');
            const vocabularyManager = new VocabularyManager();
            vocabularyManager.render(true, { focus: true });
          }
        },
        {
          name: 'relationship-graph',
          title: 'VOXCHRONICLE.Controls.RelationshipGraph',
          icon: 'fas fa-project-diagram',
          button: true,
          onClick: async () => {
            const { RelationshipGraph } = await import('./ui/RelationshipGraph.mjs');
            const graph = new RelationshipGraph();
            graph.render(true, { focus: true });
          }
        },
        {
          name: 'settings',
          title: 'VOXCHRONICLE.Controls.Settings',
          icon: 'fas fa-cog',
          button: true,
          onClick: () => {
            const app = new SettingsConfig();
            app.render(true, { focus: true });
            setTimeout(() => {
              const section = document.querySelector(`[data-tab="${MODULE_ID}"]`);
              if (section) section.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
        }
      ]
    });
  }

  logger.info('Scene control buttons registered');
});

/**
 * Inject validation buttons into the settings configuration UI
 * Adds "Test Connection" buttons next to API key fields for immediate validation feedback
 *
 * @param {SettingsConfig} app - The settings configuration application
 * @param {jQuery} html - The rendered HTML element
 */
Hooks.on('renderSettingsConfig', (app, html) => {
  // Only inject buttons for our module's settings
  const openAIKeyInput = html.find(`input[name="${MODULE_ID}.openaiApiKey"]`);
  const kankaTokenInput = html.find(`input[name="${MODULE_ID}.kankaApiToken"]`);

  // Inject validation button for OpenAI API key
  // Using fa-solid prefix for Foundry VTT v13 compatibility
  if (openAIKeyInput.length > 0) {
    const validateButton = $(`
      <button type="button" class="vox-chronicle-validate-button" data-validation-target="openai">
        <i class="fa-solid fa-plug"></i> Test Connection
      </button>
    `);

    openAIKeyInput.parent().append(validateButton);

    // Wire up click handler (validation logic will be added in next subtask)
    validateButton.on('click', async (event) => {
      event.preventDefault();
      const button = $(event.currentTarget);
      const icon = button.find('i');

      // Show loading state
      button.prop('disabled', true);
      icon.removeClass('fa-plug').addClass('fa-spinner fa-spin');

      try {
        // Call actual validation method
        const isValid = await Settings.validateOpenAIKey();

        // Update icon based on result
        if (isValid) {
          icon.removeClass('fa-spinner fa-spin').addClass('fa-check');
        } else {
          icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
        }

        // Reset button after 2 seconds
        setTimeout(() => {
          icon.removeClass('fa-check fa-times').addClass('fa-plug');
          button.prop('disabled', false);
        }, 2000);
      } catch (error) {
        // Error state for unexpected exceptions
        icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
        logger.error('OpenAI validation error:', error);

        setTimeout(() => {
          icon.removeClass('fa-times').addClass('fa-plug');
          button.prop('disabled', false);
        }, 2000);
      }
    });

    logger.info('Validation button injected for OpenAI API key');
  }

  // Inject validation button for Kanka API token
  // Using fa-solid prefix for Foundry VTT v13 compatibility
  if (kankaTokenInput.length > 0) {
    const validateButton = $(`
      <button type="button" class="vox-chronicle-validate-button" data-validation-target="kanka">
        <i class="fa-solid fa-plug"></i> Test Connection
      </button>
    `);

    kankaTokenInput.parent().append(validateButton);

    // Wire up click handler (validation logic will be added in next subtask)
    validateButton.on('click', async (event) => {
      event.preventDefault();
      const button = $(event.currentTarget);
      const icon = button.find('i');

      // Show loading state
      button.prop('disabled', true);
      icon.removeClass('fa-plug').addClass('fa-spinner fa-spin');

      try {
        // Call actual validation method
        const isValid = await Settings.validateKankaToken();

        // Update icon based on result
        if (isValid) {
          icon.removeClass('fa-spinner fa-spin').addClass('fa-check');
        } else {
          icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
        }

        // Reset button after 2 seconds
        setTimeout(() => {
          icon.removeClass('fa-check fa-times').addClass('fa-plug');
          button.prop('disabled', false);
        }, 2000);
      } catch (error) {
        // Error state for unexpected exceptions
        icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
        logger.error('Kanka validation error:', error);

        setTimeout(() => {
          icon.removeClass('fa-times').addClass('fa-plug');
          button.prop('disabled', false);
        }, 2000);
      }
    });

    logger.info('Validation button injected for Kanka API token');
  }
});

// Export module ID for use in other files
export { MODULE_ID };
