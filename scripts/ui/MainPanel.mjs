/**
 * MainPanel - Unified UI Panel for VoxChronicle
 *
 * A tabbed panel that consolidates all VoxChronicle functionality into a single
 * interface: recording controls, live suggestions, chronicle processing,
 * image generation, transcript viewing, entity management, and analytics.
 *
 * @class MainPanel
 * @extends HandlebarsApplicationMixin(ApplicationV2)
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { debounce } from '../utils/DomUtils.mjs';
import { VoxChronicle } from '../core/VoxChronicle.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Valid tab identifiers for the MainPanel
 * @type {string[]}
 */
const VALID_TABS = ['live', 'chronicle', 'images', 'transcript', 'entities', 'analytics'];

/**
 * MainPanel Application class
 * Provides a unified tabbed interface for all VoxChronicle features
 */
class MainPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {MainPanel|null} */
  static #instance = null;

  /** @type {AbortController|null} */
  #listenerController = null;

  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-main-panel',
    classes: ['vox-chronicle', 'vox-chronicle-panel'],
    window: { title: 'VoxChronicle', resizable: true, minimizable: true },
    position: { width: 420, height: 600 },
    actions: {
      'toggle-recording': MainPanel._onToggleRecording,
      'toggle-pause': MainPanel._onTogglePause,
      'process-session': MainPanel._onProcessSession,
      'publish-kanka': MainPanel._onPublishKanka,
      'generate-image': MainPanel._onGenerateImage,
      'review-entities': MainPanel._onReviewEntities,
      'rag-build-index': MainPanel._onRAGBuildIndex,
      'rag-clear-index': MainPanel._onRAGClearIndex
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/main-panel.hbs` }
  };

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
    this._debouncedRender = debounce(() => this.render(), 150);

    // Register callback so UI updates immediately when suggestions arrive
    if (this._orchestrator?.setCallbacks) {
      this._orchestrator.setCallbacks({
        onStateChange: () => this._debouncedRender()
      });
    }
  }

  /**
   * Get or create the singleton MainPanel instance
   * @param {object} orchestrator - The SessionOrchestrator instance
   * @returns {MainPanel} The singleton instance
   * @static
   */
  static getInstance(orchestrator) {
    if (!MainPanel.#instance) {
      MainPanel.#instance = new MainPanel(orchestrator);
    } else if (orchestrator && MainPanel.#instance._orchestrator !== orchestrator) {
      MainPanel.#instance._orchestrator = orchestrator;
      // Re-register callbacks on the new orchestrator
      if (orchestrator.setCallbacks) {
        orchestrator.setCallbacks({
          onStateChange: () => MainPanel.#instance._debouncedRender()
        });
      }
    }
    return MainPanel.#instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   * @static
   */
  static resetInstance() {
    MainPanel.#instance = null;
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
   * Prepare context data for the template
   * @param {object} options - Render options
   * @returns {Promise<object>} Template data
   */
  async _prepareContext(options) {
    const session = this._orchestrator?.currentSession;
    const ragData = this._getRAGData();

    return {
      isConfigured: true,
      isRecording: this._isRecordingActive(),
      isPaused: this._orchestrator?.state === 'paused',
      isProcessing: this._orchestrator?.state === 'processing',
      duration: this._formatDuration(),
      audioLevel: this._getAudioLevel(),
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
   * Bind non-click event listeners after render
   * @param {object} context - The prepared context
   * @param {object} options - Render options
   */
  _onRender(context, options) {
    this._logger.debug('_onRender called', { activeTab: this._activeTab, isRecording: context?.isRecording });
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    // Tab switching (uses data-tab attribute, not data-action)
    this.element?.querySelectorAll('.vox-chronicle-tab').forEach(el => {
      el.addEventListener('click', (event) => {
        const tab = event.currentTarget.dataset.tab;
        if (tab) this.switchTab(tab);
      }, { signal });
    });
  }

  // ─── Static action handlers (called with `this` = app instance) ────

  static async _onToggleRecording(event, target) {
    return this._handleToggleRecording();
  }

  static async _onTogglePause(event, target) {
    return this._handleTogglePause();
  }

  static async _onProcessSession(event, target) {
    return this._handleProcessSession();
  }

  static async _onPublishKanka(event, target) {
    return this._handlePublishKanka();
  }

  static async _onGenerateImage(event, target) {
    return this._handleGenerateImage();
  }

  static async _onReviewEntities(event, target) {
    return this._handleReviewEntities();
  }

  static async _onRAGBuildIndex(event, target) {
    return this._handleRAGBuildIndex();
  }

  static async _onRAGClearIndex(event, target) {
    return this._handleRAGClearIndex();
  }

  // ─── Instance methods ──────────────────────────────────────────────

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

    // CSS-only tab switching — avoid full re-render
    if (this.element) {
      this.element.querySelectorAll('.tab-content').forEach(el => el.hidden = true);
      const activeContent = this.element.querySelector(`[data-tab-content="${tabName}"]`);
      if (activeContent) activeContent.hidden = false;

      this.element.querySelectorAll('.vox-chronicle-tab').forEach(el =>
        el.classList.toggle('active', el.dataset.tab === tabName)
      );
    } else {
      this.render();
    }
  }

  /**
   * Clean up event listeners on close
   * @param {object} [options] - Close options
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    this._logger.debug('MainPanel closing');
    this.#listenerController?.abort();
    return super.close(options);
  }

  /**
   * Request a debounced render update
   */
  requestRender() {
    this._debouncedRender();
  }

  /**
   * Get RAG indexing status data
   * @returns {object} RAG status data for template
   * @private
   */
  _getRAGData() {
    // Get RAG provider from VoxChronicle singleton
    const voxChronicle = VoxChronicle.getInstance();
    const ragProvider = voxChronicle?.ragProvider;

    // Check if RAG is enabled via settings
    let ragEnabled = false;
    try {
      ragEnabled = game?.settings?.get(MODULE_ID, 'ragEnabled') ?? false;
    } catch {
      // Settings not available
    }

    return {
      enabled: ragEnabled,
      status: ragProvider ? 'ready' : 'idle',
      progress: 0,
      progressText: '',
      vectorCount: 0,
      storageUsage: 'N/A (managed by OpenAI)',
      lastIndexed: null
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
   * Toggle recording on/off based on current state
   * @private
   */
  async _handleToggleRecording() {
    if (!this._orchestrator) {
      this._logger.error('Orchestrator not available');
      return;
    }

    try {
      if (this._isRecordingActive()) {
        // Stop recording - use live mode stop if in live mode, otherwise regular stop
        if (this._orchestrator.isLiveMode) {
          await this._orchestrator.stopLiveMode();
        } else {
          await this._orchestrator.stopSession({ processImmediately: false });
        }
        ui?.notifications?.info(game.i18n?.format('VOXCHRONICLE.Notifications.RecordingStopped', { duration: this._formatDuration() }) || 'Recording stopped');
      } else {
        // Start recording - use live mode by default (real-time AI assistance)
        if (this._orchestrator.hasTranscriptionService) {
          await this._orchestrator.startLiveMode();
        } else {
          await this._orchestrator.startSession();
        }
        ui?.notifications?.info(game.i18n?.localize('VOXCHRONICLE.Notifications.RecordingStarted') || 'Recording started');
      }
      this.render();
    } catch (error) {
      this._logger.error('Toggle recording failed:', error);
      ui?.notifications?.error(error.message);
    }
  }

  /**
   * Toggle pause/resume recording
   * @private
   */
  _handleTogglePause() {
    if (!this._orchestrator) return;

    try {
      if (this._orchestrator.state === 'paused') {
        this._orchestrator.resumeRecording();
      } else {
        this._orchestrator.pauseRecording();
      }
      this.render();
    } catch (error) {
      this._logger.error('Toggle pause failed:', error);
      ui?.notifications?.error(error.message);
    }
  }

  /**
   * Process the session (transcribe audio)
   * @private
   */
  async _handleProcessSession() {
    if (!this._orchestrator?.currentSession?.audioBlob) {
      ui?.notifications?.warn(game.i18n?.localize('VOXCHRONICLE.Panel.NoTranscriptVC') || 'No audio to process');
      return;
    }

    try {
      await this._orchestrator.processTranscription();
      this.render();
    } catch (error) {
      this._logger.error('Process session failed:', error);
      ui?.notifications?.error(error.message);
    }
  }

  /**
   * Publish entities and chronicle to Kanka
   * @private
   */
  async _handlePublishKanka() {
    if (!this._orchestrator?.currentSession?.entities) {
      ui?.notifications?.warn(game.i18n?.localize('VOXCHRONICLE.Panel.NoEntities') || 'No entities to publish');
      return;
    }

    try {
      await this._orchestrator.publishToKanka();
      this.render();
    } catch (error) {
      this._logger.error('Publish to Kanka failed:', error);
      ui?.notifications?.error(error.message);
    }
  }

  /**
   * Generate an AI image from current session context
   * @private
   */
  async _handleGenerateImage() {
    if (!this._orchestrator) return;

    try {
      await this._orchestrator.generateImage?.();
      this.render();
    } catch (error) {
      this._logger.error('Generate image failed:', error);
      ui?.notifications?.error(error.message);
    }
  }

  /**
   * Open entity review dialog
   * @private
   */
  async _handleReviewEntities() {
    try {
      const { EntityPreview } = await import('./EntityPreview.mjs');
      const preview = new EntityPreview({ entities: this._orchestrator?.currentSession?.entities });
      preview.render(true);
    } catch (error) {
      this._logger.error('Review entities failed:', error);
      ui?.notifications?.error(error.message);
    }
  }

  /**
   * Get the current audio input level from the AudioRecorder
   * @returns {number} Audio level as percentage (0-100)
   * @private
   */
  _getAudioLevel() {
    const voxChronicle = VoxChronicle.getInstance();
    const recorder = voxChronicle?.audioRecorder;
    if (!recorder || !recorder.isRecording) return 0;
    // getAudioLevel() returns 0.0-1.0, convert to percentage
    return Math.round((recorder.getAudioLevel?.() || 0) * 100);
  }

  /**
   * Check if recording is currently active (any mode)
   * @returns {boolean}
   * @private
   */
  _isRecordingActive() {
    if (!this._orchestrator) return false;
    const state = this._orchestrator.state;
    return state === 'recording' || state === 'paused' ||
           state === 'live_listening' || state === 'live_transcribing' || state === 'live_analyzing';
  }

  /**
   * Handle RAG build index action
   * @private
   */
  async _handleRAGBuildIndex() {
    const voxChronicle = VoxChronicle.getInstance();
    const ragProvider = voxChronicle?.ragProvider;

    if (!ragProvider) {
      this._logger.warn('RAG provider not available');
      ui?.notifications?.warn(game.i18n?.localize('VOXCHRONICLE.RAG.NotConfigured') || 'RAG not configured');
      return;
    }

    try {
      this._logger.info('Starting RAG index build');

      // Collect journal entries as RAGDocuments
      const documents = [];
      const journals = game?.journal ?? [];
      for (const journal of journals) {
        const pages = journal.pages?.contents ?? [];
        const content = pages
          .map(p => p.text?.content || '')
          .filter(Boolean)
          .join('\n\n');
        if (content) {
          documents.push({
            id: journal.id,
            title: journal.name || journal.id,
            content,
            metadata: { source: 'journal', type: 'journal' }
          });
        }
      }

      this._logger.info(`Building index from ${documents.length} journal documents`);

      // Index documents with progress callback
      const result = await ragProvider.indexDocuments(documents, {
        onProgress: (progress, total, text) => {
          this._logger.debug(`Index progress: ${progress}/${total} - ${text}`);
          this.requestRender();
        }
      });

      this._logger.info(`Index build complete: ${result.indexed} indexed, ${result.failed} failed`);

      // Update last indexed timestamp in settings
      try {
        const metadata = game?.settings?.get(MODULE_ID, 'ragIndexMetadata') || {};
        metadata.lastIndexed = new Date().toISOString();
        await game?.settings?.set(MODULE_ID, 'ragIndexMetadata', metadata);
      } catch {
        // Settings update failed, not critical
      }

      ui?.notifications?.info(game.i18n?.localize('VOXCHRONICLE.RAG.IndexComplete') || 'RAG index built successfully');
      this.render();
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
    const voxChronicle = VoxChronicle.getInstance();
    const ragProvider = voxChronicle?.ragProvider;

    if (!ragProvider) {
      this._logger.warn('RAG provider not available');
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
      await ragProvider.clearIndex();

      // Clear last indexed timestamp
      try {
        const metadata = game?.settings?.get(MODULE_ID, 'ragIndexMetadata') || {};
        delete metadata.lastIndexed;
        await game?.settings?.set(MODULE_ID, 'ragIndexMetadata', metadata);
      } catch {
        // Settings update failed, not critical
      }

      ui?.notifications?.info(game.i18n?.localize('VOXCHRONICLE.RAG.IndexCleared') || 'RAG index cleared');
      this.render();
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
