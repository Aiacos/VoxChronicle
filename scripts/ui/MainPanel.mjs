/**
 * MainPanel - Unified UI Panel for VoxChronicle
 *
 * A tabbed panel that consolidates all VoxChronicle functionality into a single
 * interface: recording controls, live suggestions, chronicle processing,
 * image generation, transcript viewing, entity management, and analytics.
 *
 * @class MainPanel
 * @extends Application
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
class MainPanel extends Application {
  /** @type {MainPanel|null} */
  static _instance = null;

  /**
   * Get default options for the Application
   * @returns {object} Default application options
   * @static
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-main-panel',
      classes: ['vox-chronicle', 'vox-chronicle-panel'],
      template: `modules/${MODULE_ID}/templates/main-panel.hbs`,
      width: 420,
      height: 600,
      minimizable: true,
      resizable: true,
      title: 'VoxChronicle'
    });
  }

  /**
   * Create a new MainPanel instance
   * @param {object} orchestrator - The SessionOrchestrator instance
   * @param {object} [options] - Application options
   */
  constructor(orchestrator, options = {}) {
    super(options);
    this._orchestrator = orchestrator;
    this._activeTab = 'live';
    this._logger = Logger.createChild('MainPanel');
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
    return this.rendered;
  }

  /**
   * Get data for the template
   * @returns {object} Template data
   */
  getData() {
    const session = this._orchestrator?.currentSession;
    const ragData = this._getRAGData();

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
      hasEntities: !!session?.entities,
      // RAG indexing status data
      ragEnabled: ragData.enabled,
      ragStatus: ragData.status,
      ragProgress: ragData.progress,
      ragProgressText: ragData.progressText,
      ragVectorCount: ragData.vectorCount,
      ragStorageUsage: ragData.storageUsage,
      ragLastIndexed: ragData.lastIndexed
    };
  }

  /**
   * Get RAG indexing status data
   * @returns {object} RAG status data for template
   * @private
   */
  _getRAGData() {
    // Get RAG retriever from orchestrator's VoxChronicle instance
    const voxChronicle = this._orchestrator?.voxChronicle;
    const ragRetriever = voxChronicle?.ragRetriever;
    const ragVectorStore = voxChronicle?.ragVectorStore;

    // Check if RAG is enabled via settings
    let ragEnabled = false;
    try {
      ragEnabled = game?.settings?.get(MODULE_ID, 'ragEnabled') ?? false;
    } catch {
      // Settings not available
    }

    // Get indexing status and stats
    let status = 'idle';
    let progress = 0;
    let progressText = '';
    let vectorCount = 0;
    let storageUsage = '0 KB';
    let lastIndexed = null;

    if (ragRetriever) {
      // Get status from RAGRetriever
      const indexStatus = ragRetriever.getIndexStatus?.() || {};
      status = indexStatus.isIndexing ? 'indexing' : (indexStatus.documentCount > 0 ? 'indexed' : 'idle');
      progress = indexStatus.progress || 0;
      progressText = indexStatus.progressText || '';
    }

    if (ragVectorStore) {
      // Get stats from RAGVectorStore
      const stats = ragVectorStore.getStats?.() || {};
      vectorCount = stats.vectorCount || 0;
      storageUsage = this._formatStorageSize(stats.storageSizeBytes || 0);
    }

    // Get last indexed time from settings metadata
    try {
      const metadata = game?.settings?.get(MODULE_ID, 'ragIndexMetadata') || {};
      if (metadata.lastIndexed) {
        lastIndexed = this._formatTimestamp(metadata.lastIndexed);
      }
    } catch {
      // Settings not available
    }

    return {
      enabled: ragEnabled,
      status,
      progress,
      progressText,
      vectorCount,
      storageUsage,
      lastIndexed
    };
  }

  /**
   * Format bytes to human-readable storage size
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string
   * @private
   */
  _formatStorageSize(bytes) {
    if (bytes === 0) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(1);
    return `${size} ${units[i]}`;
  }

  /**
   * Format timestamp to localized date/time string
   * @param {string|number|Date} timestamp - Timestamp to format
   * @returns {string} Formatted timestamp
   * @private
   */
  _formatTimestamp(timestamp) {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  /**
   * Activate event listeners on the rendered HTML
   * @param {jQuery} html - The rendered HTML element
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Tab switching
    html.find('.vox-chronicle-tab').on('click', (event) => {
      const tab = event.currentTarget.dataset.tab;
      if (tab) this.switchTab(tab);
    });

    // Data-action buttons
    html.find('[data-action]').on('click', (event) => {
      const action = event.currentTarget.dataset.action;
      this._handleAction(action, event);
    });
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
    this.render(false);
  }

  /**
   * Request a debounced render update
   */
  requestRender() {
    this._debouncedRender();
  }

  /**
   * Handle data-action button clicks
   * @param {string} action - The action identifier
   * @param {Event} event - The click event
   * @private
   */
  async _handleAction(action, event) {
    this._logger.debug(`Action: ${action}`);

    switch (action) {
      case 'rag-build-index':
        await this._handleRAGBuildIndex();
        break;
      case 'rag-clear-index':
        await this._handleRAGClearIndex();
        break;
      default:
        // Other actions will be wired to orchestrator methods as features are connected
        break;
    }
  }

  /**
   * Handle RAG build index action
   * @private
   */
  async _handleRAGBuildIndex() {
    const voxChronicle = this._orchestrator?.voxChronicle;
    const ragRetriever = voxChronicle?.ragRetriever;

    if (!ragRetriever) {
      this._logger.warn('RAG retriever not available');
      ui?.notifications?.warn(game.i18n?.localize('VOXCHRONICLE.RAG.NotConfigured') || 'RAG not configured');
      return;
    }

    try {
      this._logger.info('Starting RAG index build');

      // Build index with progress callback
      await ragRetriever.buildIndex({
        onProgress: (progress, text) => {
          this._logger.debug(`Index progress: ${progress}% - ${text}`);
          this.requestRender();
        }
      });

      // Update last indexed timestamp in settings
      try {
        const metadata = game?.settings?.get(MODULE_ID, 'ragIndexMetadata') || {};
        metadata.lastIndexed = new Date().toISOString();
        await game?.settings?.set(MODULE_ID, 'ragIndexMetadata', metadata);
      } catch {
        // Settings update failed, not critical
      }

      ui?.notifications?.info(game.i18n?.localize('VOXCHRONICLE.RAG.IndexComplete') || 'RAG index built successfully');
      this.render(false);
    } catch (error) {
      this._logger.error('RAG index build failed:', error);
      ui?.notifications?.error(game.i18n?.format('VOXCHRONICLE.RAG.IndexFailed', { error: error.message }) || `RAG index failed: ${error.message}`);
    }
  }

  /**
   * Handle RAG clear index action
   * @private
   */
  async _handleRAGClearIndex() {
    const voxChronicle = this._orchestrator?.voxChronicle;
    const ragVectorStore = voxChronicle?.ragVectorStore;

    if (!ragVectorStore) {
      this._logger.warn('RAG vector store not available');
      return;
    }

    // Confirm before clearing
    const confirmed = await Dialog?.confirm({
      title: game.i18n?.localize('VOXCHRONICLE.RAG.ClearConfirmTitle') || 'Clear RAG Index',
      content: game.i18n?.localize('VOXCHRONICLE.RAG.ClearConfirmContent') || 'Are you sure you want to clear the RAG index? This will remove all indexed vectors.',
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) {
      return;
    }

    try {
      this._logger.info('Clearing RAG index');
      await ragVectorStore.clear();

      // Clear last indexed timestamp
      try {
        const metadata = game?.settings?.get(MODULE_ID, 'ragIndexMetadata') || {};
        delete metadata.lastIndexed;
        await game?.settings?.set(MODULE_ID, 'ragIndexMetadata', metadata);
      } catch {
        // Settings update failed, not critical
      }

      ui?.notifications?.info(game.i18n?.localize('VOXCHRONICLE.RAG.IndexCleared') || 'RAG index cleared');
      this.render(false);
    } catch (error) {
      this._logger.error('RAG index clear failed:', error);
      ui?.notifications?.error(game.i18n?.format('VOXCHRONICLE.RAG.ClearFailed', { error: error.message }) || `Failed to clear RAG index: ${error.message}`);
    }
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
