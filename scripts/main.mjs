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
      icon: 'fa-solid fa-microphone',
      layer: 'controls',
      visible: true,
      tools: [
        {
          name: 'recorder',
          title: 'VOXCHRONICLE.Controls.Recorder',
          icon: 'fa-solid fa-microphone',
          button: true,
          onClick: async () => {
            const recorder = await getRecorderControls();
            recorder.render(true, { focus: true });
          }
        },
        {
          name: 'speaker-labels',
          title: 'VOXCHRONICLE.Controls.SpeakerLabels',
          icon: 'fa-solid fa-users',
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
          icon: 'fa-solid fa-book',
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
          icon: 'fa-solid fa-project-diagram',
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
          icon: 'fa-solid fa-cog',
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
  injectValidationButton(
    html.find(`input[name="${MODULE_ID}.openaiApiKey"]`),
    'openai',
    () => Settings.validateOpenAIKey()
  );

  injectValidationButton(
    html.find(`input[name="${MODULE_ID}.kankaApiToken"]`),
    'kanka',
    () => Settings.validateKankaToken()
  );
});

// Re-export module ID for backward compatibility
export { MODULE_ID } from './constants.mjs';
