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

/**
 * Initialize module - called when Foundry VTT initializes
 * This hook fires before the game is fully ready
 * Use this for registering settings and preparing the module
 */
Hooks.once('init', () => {
  // Log module initialization start
  console.log(`${MODULE_ID} | Initializing VoxChronicle module`);

  // Register module settings
  // Note: Settings class will be imported and called here once created
  // Settings.registerSettings();

  // Store module reference on game object for global access
  game[MODULE_ID] = {
    version: '1.0.0',
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
    // Note: VoxChronicle class will be imported and initialized here once created
    // const voxChronicle = VoxChronicle.getInstance();
    // await voxChronicle.initialize();

    // Mark module as ready
    game[MODULE_ID].ready = true;

    console.log(`${MODULE_ID} | All services initialized successfully`);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to initialize module:`, error);
    ui.notifications?.error('VoxChronicle: Failed to initialize module. Check console for details.');
  }
});

// Export module ID for use in other files
export { MODULE_ID };
