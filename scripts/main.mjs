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
  console.log(`${MODULE_ID} | Initializing VoxChronicle module`);

  // Register module settings
  Settings.registerSettings();

  // Store module reference on game object for global access
  game[MODULE_ID] = {
    version: game.modules.get(MODULE_ID)?.version ?? '0.0.0',
    ready: false
  };

  console.log(`${MODULE_ID} | Module settings registered`);
});

/**
 * Module ready - called when Foundry VTT is fully ready
 * All game data is loaded and the canvas is ready
 * Use this to initialize services that depend on game data
 */
Hooks.once('ready', async () => {
  console.log(`${MODULE_ID} | VoxChronicle module ready`);

  try {
    // Initialize the main VoxChronicle singleton
    const voxChronicle = VoxChronicle.getInstance();
    await voxChronicle.initialize();

    // Mark module as ready
    game[MODULE_ID].ready = true;

    console.log(`${MODULE_ID} | All services initialized successfully`);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to initialize module:`, error);
    ui.notifications?.error('VoxChronicle: Failed to initialize module. Check console for details.');
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
        settings: {
          name: 'settings',
          icon: 'fa-solid fa-cog',
          title: 'VOXCHRONICLE.Controls.Settings',
          order: 2,
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

  console.log(`${MODULE_ID} | Scene control buttons registered`);
});

// Export module ID for use in other files
export { MODULE_ID };
