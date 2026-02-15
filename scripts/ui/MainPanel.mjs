/**
 * MainPanel - Unified UI Panel for VoxChronicle
 *
 * A tabbed panel that consolidates all VoxChronicle functionality into a single
 * interface: recording controls, live suggestions, chronicle processing,
 * image generation, transcript viewing, entity management, and analytics.
 *
 * @class MainPanel
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { debounce } from '../utils/DomUtils.mjs';

/**
 * Valid tab identifiers for the MainPanel
 * @type {string[]}
 */
const VALID_TABS = ['live', 'chronicle', 'images', 'transcript', 'entities', 'analytics'];

/**
 * MainPanel Application class
 * Provides a unified tabbed interface for all VoxChronicle features
 */
class MainPanel {
  /** @type {MainPanel|null} */
  static _instance = null;

  /**
   * Get default options for the Application
   * @returns {object} Default application options
   * @static
   */
  static get defaultOptions() {
    return {
      id: 'vox-chronicle-main-panel',
      classes: ['vox-chronicle', 'vox-chronicle-panel'],
      template: `modules/${MODULE_ID}/templates/main-panel.hbs`,
      width: 420,
      height: 600,
      minimizable: true,
      resizable: true,
      title: 'VoxChronicle'
    };
  }

  /**
   * Create a new MainPanel instance
   * @param {object} orchestrator - The SessionOrchestrator instance
   * @param {object} [options] - Application options
   */
  constructor(orchestrator, options = {}) {
    this._orchestrator = orchestrator;
    this._activeTab = 'live';
    this._logger = Logger.createChild('MainPanel');
    this._options = { ...MainPanel.defaultOptions, ...options };
    this._rendered = false;
    this._element = null;
    this._debouncedRender = debounce(() => this.render(false), 150);
  }

  /**
   * Get or create the singleton MainPanel instance
   * @param {object} orchestrator - The SessionOrchestrator instance
   * @returns {MainPanel} The singleton instance
   * @static
   */
  static getInstance(orchestrator) {
    if (!MainPanel._instance) {
      MainPanel._instance = new MainPanel(orchestrator);
    }
    return MainPanel._instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   * @static
   */
  static resetInstance() {
    MainPanel._instance = null;
  }

  /**
   * Get the currently active tab
   * @returns {string} The active tab identifier
   */
  get activeTab() {
    return this._activeTab;
  }

  /**
   * Check whether the panel is currently rendered
   * @returns {boolean} True if rendered
   */
  get isRendered() {
    return this._rendered;
  }

  /**
   * Get data for the template
   * @returns {object} Template data
   */
  getData() {
    const session = this._orchestrator?.currentSession;

    return {
      isConfigured: true,
      isRecording: this._orchestrator?.isRecording || false,
      isPaused: this._orchestrator?.state === 'paused',
      isProcessing: this._orchestrator?.state === 'processing',
      duration: this._formatDuration(),
      audioLevel: 0,
      transcriptionMode: 'auto',
      currentChapter: this._orchestrator?.getCurrentChapter?.() || null,
      activeTab: this._activeTab,
      suggestions: this._orchestrator?.getAISuggestions?.() || [],
      images: session?.images || [],
      imageCount: session?.images?.length || 0,
      segments: session?.transcript?.segments || [],
      hasTranscript: !!session?.transcript,
      entities: session?.entities || null,
      entityCount: this._countEntities(session?.entities),
      hasEntities: !!session?.entities
    };
  }

  /**
   * Switch to a specific tab
   * @param {string} tabName - The tab identifier to switch to
   */
  switchTab(tabName) {
    if (!VALID_TABS.includes(tabName)) {
      this._logger.warn(`Invalid tab: ${tabName}`);
      return;
    }

    this._activeTab = tabName;
    this._logger.debug(`Switched to tab: ${tabName}`);
  }

  /**
   * Render the panel
   * @param {boolean} [force=true] - Whether to force a full re-render
   * @returns {Promise<MainPanel>} This instance for chaining
   */
  async render(force = true) {
    this._rendered = true;
    this._logger.debug('Panel rendered');
    return this;
  }

  /**
   * Close the panel
   */
  close() {
    this._rendered = false;
    this._logger.debug('Panel closed');
  }

  /**
   * Request a debounced render update
   */
  requestRender() {
    this._debouncedRender();
  }

  /**
   * Format the current session duration as MM:SS
   * @returns {string} Formatted duration string
   * @private
   */
  _formatDuration() {
    const session = this._orchestrator?.currentSession;
    if (!session?.startTime) return '00:00';

    const elapsed = Math.floor(((session.endTime || Date.now()) - session.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  /**
   * Count the total number of entities across all types
   * @param {object|null} entities - The entities object with typed arrays
   * @returns {number} Total entity count
   * @private
   */
  _countEntities(entities) {
    if (!entities) return 0;

    return (entities.characters?.length || 0) +
           (entities.locations?.length || 0) +
           (entities.items?.length || 0);
  }
}

export { MainPanel };
