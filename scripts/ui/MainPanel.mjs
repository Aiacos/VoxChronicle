/**
 * MainPanel - Unified UI Panel for VoxChronicle
 *
 * A tabbed panel that consolidates all VoxChronicle functionality into a single
 * interface: recording controls, live suggestions, chronicle processing,
 * image generation, transcript viewing, entity management, and analytics.
 *
 * @class MainPanel
 * @augments HandlebarsApplicationMixin(ApplicationV2)
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { AudioUtils } from '../utils/AudioUtils.mjs';
import { debounce } from '../utils/DomUtils.mjs';
import { stripHtml, sanitizeHtml, escapeHtml } from '../utils/HtmlUtils.mjs';
import { VoxChronicle } from '../core/VoxChronicle.mjs';
import { SpeakerLabeling } from './SpeakerLabeling.mjs';

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

  /** @type {number|null} */
  #realtimeRafId = null;

  /** @type {{vectorCount: number, lastIndexed: string|null, indexing: boolean, progress: number, progressText: string}} */
  #ragCachedStatus = {
    vectorCount: 0,
    lastIndexed: null,
    indexing: false,
    progress: 0,
    progressText: ''
  };

  /** @type {boolean} */
  #ragStatusFetched = false;

  /** @type {Array} */
  #transcriptData = [];

  /** @type {object|null} */
  #eventBus = null;

  /** @type {Function|null} */
  #onTranscriptionReady = null;

  /** @type {Function|null} */
  #onRAGIndexingStarted = null;

  /** @type {Function|null} */
  #onRAGIndexingComplete = null;

  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-main-panel',
    classes: ['vox-chronicle', 'vox-chronicle-panel'],
    window: { title: 'VOXCHRONICLE.Panel.Title', resizable: true, minimizable: true },
    position: { width: 420, height: 600 },
    actions: {
      'toggle-recording': MainPanel._onToggleRecording,
      'toggle-pause': MainPanel._onTogglePause,
      'process-session': MainPanel._onProcessSession,
      'publish-kanka': MainPanel._onPublishKanka,
      'generate-image': MainPanel._onGenerateImage,
      'review-entities': MainPanel._onReviewEntities,
      'rag-build-index': MainPanel._onRAGBuildIndex,
      'rag-clear-index': MainPanel._onRAGClearIndex,
      'change-journal': MainPanel._onChangeJournal,
      'prev-chapter': MainPanel._onPrevChapter,
      'next-chapter': MainPanel._onNextChapter,
      'dismiss-suggestion': MainPanel._onDismissSuggestion,
      'open-speaker-labeling': MainPanel._onOpenSpeakerLabeling,
      'toggle-collapse': MainPanel._onToggleCollapse
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/main-panel.hbs` },
    transcriptReview: { template: `modules/${MODULE_ID}/templates/parts/transcript-review.hbs` }
  };

  /** @type {string|null} */
  #statusMessage = null;

  /** @type {number} */
  #progressPercent = 0;

  /** @type {boolean} */
  #collapsed = false;

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

    // Register Handlebars 'includes' helper for tab filtering (Story 6.2 AC2)
    if (typeof Handlebars !== 'undefined' && !Handlebars.helpers?.includes) {
      Handlebars.registerHelper('includes', function (array, value) {
        return Array.isArray(array) && array.includes(value);
      });
    }
    try {
      this.#collapsed = game?.settings?.get(MODULE_ID, 'panelCollapsed') ?? false;
    } catch (error) {
      this._logger.debug('Failed to read panelCollapsed setting:', error.message);
    }

    // Streaming state (persists across re-renders)
    this._activeStreamingCard = null;
    this._streamingAccumulatedText = '';
    this._streamingActiveType = null;

    // Rules card state (persists across re-renders, cleared on session end)
    this._rulesCards = [];
    this._pendingRulesCards = [];
    this._rulesInputValue = '';
    this._rulesDismissTimeouts = [];

    // Register callbacks so UI updates immediately on state and progress changes
    if (this._orchestrator?.setCallbacks) {
      this._orchestrator.setCallbacks({
        onStateChange: (newState) => {
          if (newState === 'idle') {
            this._rulesCards = [];
            this._pendingRulesCards = [];
            for (const t of this._rulesDismissTimeouts || []) clearTimeout(t);
            this._rulesDismissTimeouts = [];
          }
          // Partial rendering (Story 6.2 AC5): skip full re-render for live state transitions
          // that only change status badge/LED — DOM-direct update via rAF loop handles these
          const isLiveTransition =
            newState === 'live_listening' ||
            newState === 'live_transcribing' ||
            newState === 'live_analyzing';
          if (isLiveTransition && this.element) {
            this._updateLiveStatusDOM(newState);
          } else {
            this._debouncedRender();
          }
        },
        onProgress: (data) => {
          this.#statusMessage = data.message;
          this.#progressPercent = data.progress;
          // DOM-direct update for progress bar (Story 6.2 AC5)
          const progressBar = this.element?.querySelector(
            '.vox-chronicle-panel__cycle-progress-bar'
          );
          if (progressBar) {
            progressBar.style.width = `${data.progress}%`;
          } else {
            this._debouncedRender();
          }
        },
        onStreamToken: (data) => this._handleStreamToken(data),
        onStreamComplete: (data) => this._handleStreamComplete(data),
        onRulesCard: (data) => this._handleRulesCard(data)
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
      // Reset stale RAG status cache so the new provider's status gets fetched
      MainPanel.#instance.#ragStatusFetched = false;
      // Re-register callbacks on the new orchestrator
      if (orchestrator.setCallbacks) {
        orchestrator.setCallbacks({
          onStateChange: (newState) => {
            const inst = MainPanel.#instance;
            if (newState === 'idle') {
              inst._rulesCards = [];
              inst._pendingRulesCards = [];
              for (const t of inst._rulesDismissTimeouts || []) clearTimeout(t);
              inst._rulesDismissTimeouts = [];
            }
            const isLiveTransition =
              newState === 'live_listening' ||
              newState === 'live_transcribing' ||
              newState === 'live_analyzing';
            if (isLiveTransition && inst.element) {
              inst._updateLiveStatusDOM(newState);
            } else {
              inst._debouncedRender();
            }
          },
          onProgress: (data) => {
            const inst = MainPanel.#instance;
            inst.#statusMessage = data.message;
            inst.#progressPercent = data.progress;
            const progressBar = inst.element?.querySelector(
              '.vox-chronicle-panel__cycle-progress-bar'
            );
            if (progressBar) {
              progressBar.style.width = `${data.progress}%`;
            } else {
              inst._debouncedRender();
            }
          },
          onStreamToken: (data) => MainPanel.#instance._handleStreamToken(data),
          onStreamComplete: (data) => MainPanel.#instance._handleStreamComplete(data),
          onRulesCard: (data) => MainPanel.#instance._handleRulesCard(data)
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
    if (MainPanel.#instance) {
      MainPanel.#instance._stopRealtimeUpdates();
      MainPanel.#instance.#listenerController?.abort();
      MainPanel.#instance._debouncedRender?.cancel?.();
      MainPanel.#instance._cleanupEventBus();
    }
    MainPanel.#instance = null;
  }

  /**
   * Set the EventBus for decoupled event subscriptions
   * @param {object} eventBus - EventBus instance with on/off/emit methods
   */
  setEventBus(eventBus) {
    this._cleanupEventBus();
    this.#eventBus = eventBus;

    if (eventBus) {
      this.#onTranscriptionReady = (data) => {
        if (data?.segments) {
          this.setTranscriptData(data.segments);
        }
        this.render({ parts: ['transcriptReview'] });
      };
      eventBus.on('ai:transcriptionReady', this.#onTranscriptionReady);

      this.#onRAGIndexingStarted = (data) => {
        this.#ragCachedStatus.indexing = true;
        this.#ragCachedStatus.progress = 0;
        this.#ragCachedStatus.progressText = `0/${data?.journalCount || 0}`;
        if (this.rendered) this.render();
      };
      eventBus.on('ai:ragIndexingStarted', this.#onRAGIndexingStarted);

      this.#onRAGIndexingComplete = (data) => {
        this.#ragCachedStatus.indexing = false;
        this.#ragCachedStatus.progress = 0;
        this.#ragCachedStatus.progressText = '';
        if (!data?.error) {
          this.#ragCachedStatus.lastIndexed = new Date().toLocaleString();
          if (data?.indexed != null) {
            this.#ragCachedStatus.vectorCount = data.indexed;
          }
        }
        if (this.rendered) this.render();
      };
      eventBus.on('ai:ragIndexingComplete', this.#onRAGIndexingComplete);
    }
  }

  /**
   * Remove EventBus subscriptions
   * @private
   */
  _cleanupEventBus() {
    if (this.#eventBus) {
      if (this.#onTranscriptionReady) {this.#eventBus.off('ai:transcriptionReady', this.#onTranscriptionReady);}
      if (this.#onRAGIndexingStarted) {this.#eventBus.off('ai:ragIndexingStarted', this.#onRAGIndexingStarted);}
      if (this.#onRAGIndexingComplete) {this.#eventBus.off('ai:ragIndexingComplete', this.#onRAGIndexingComplete);}
    }
    this.#eventBus = null;
    this.#onTranscriptionReady = null;
    this.#onRAGIndexingStarted = null;
    this.#onRAGIndexingComplete = null;
  }

  /**
   * Format seconds into mm:ss timestamp string
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted timestamp (e.g., "2:05", "61:01")
   * @private
   */
  _formatTimestamp(seconds) {
    const totalSeconds = Math.floor(seconds || 0);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Build transcript segments with display metadata (speaker label, timestamp, color index)
   * @param {Array} segments - Raw transcript segments
   * @returns {Array} Enriched segments for template rendering
   * @private
   */
  _buildTranscriptSegments(segments) {
    if (!segments || !Array.isArray(segments) || segments.length === 0) return [];

    const speakerColorMap = new Map();
    let colorCounter = 0;

    return segments.map((seg) => {
      const displayName = SpeakerLabeling.getSpeakerLabel(seg.speaker);
      const isMapped = displayName !== seg.speaker;

      if (!speakerColorMap.has(seg.speaker)) {
        speakerColorMap.set(seg.speaker, colorCounter++ % 8);
      }

      return {
        ...seg,
        displayName,
        isMapped,
        timestamp: this._formatTimestamp(seg.start),
        colorIndex: speakerColorMap.get(seg.speaker)
      };
    });
  }

  /**
   * Store transcript segments for in-memory editing
   * @param {Array} segments - Transcript segments array
   */
  setTranscriptData(segments) {
    this.#transcriptData = (segments || []).map((s) => ({ ...s }));
  }

  /**
   * Get the current transcript data (with any edits applied)
   * @returns {Array} Copy of transcript segments
   */
  getTranscriptData() {
    return this.#transcriptData.map((s) => ({ ...s }));
  }

  /**
   * Edit a segment's text by index
   * @param {number} index - Segment index
   * @param {string} newText - New text content
   */
  editSegment(index, newText) {
    if (index < 0 || index >= this.#transcriptData.length) return;
    if (!newText || typeof newText !== 'string' || !newText.trim()) return;

    this.#transcriptData[index] = { ...this.#transcriptData[index], text: newText };

    if (this.#eventBus) {
      try {
        this.#eventBus.emit('ui:transcriptEdited', {
          index,
          segment: { ...this.#transcriptData[index] }
        });
      } catch (e) {
        this._logger.warn('EventBus emit failed:', e);
      }
    }
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

  /** @type {string|null} */
  #cachedChronicleDraft = null;

  /** @type {number} */
  #lastDraftSegmentCount = 0;

  /**
   * Prepare context data for the template
   * @param {object} options - Render options
   * @returns {Promise<object>} Template data
   */
  async _prepareContext(options) {
    const voxChronicle = VoxChronicle.getInstance();
    const status = voxChronicle.getServicesStatus();
    const session = this._orchestrator?.currentSession;
    const ragData = this._getRAGData();

    // Map images to include a displayable src (shallow copy to avoid mutating source objects)
    const images = (session?.images || []).map((img) => {
      if (!img.src && (img.base64 || img.b64_json)) {
        return { ...img, src: `data:image/png;base64,${img.base64 || img.b64_json}` };
      }
      return img;
    });

    // Generate/Update chronicle draft ONLY if segments changed
    const currentSegmentCount = session?.transcript?.segments?.length || 0;
    if (currentSegmentCount > 0 && currentSegmentCount !== this.#lastDraftSegmentCount) {
      const exporter = voxChronicle?.narrativeExporter;
      if (exporter) {
        try {
          const exportData = exporter.export(
            {
              title: session.title,
              date: session.date,
              segments: session.transcript.segments,
              entities: session.entities,
              moments: session.moments
            },
            { format: 'summary' }
          );
          this.#cachedChronicleDraft = sanitizeHtml(exportData.entry);
          this.#lastDraftSegmentCount = currentSegmentCount;
        } catch (err) {
          this._logger.debug('Failed to generate chronicle draft:', err.message);
        }
      }
    } else if (currentSegmentCount === 0) {
      this.#cachedChronicleDraft = null;
      this.#lastDraftSegmentCount = 0;
    }

    // Journal selection data for confirmation banner
    const journalData = this._getJournalSelectionData();

    // Chapter navigation data (visible during live mode)
    const chapterNavData = this._getChapterNavData();

    // Live mode health and cost data
    const health = this._orchestrator?.getServiceHealth?.() || {};
    const costData = this._orchestrator?.getCostData?.() || null;
    const isLiveMode = !!this._orchestrator?.isLiveMode;
    const isStopping = !!this._orchestrator?._isStopping;

    // Format token display (e.g., "12.4K")
    let tokenDisplay = '0';
    if (costData) {
      const tokens = costData.totalTokens || 0;
      tokenDisplay = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : String(tokens);
    }

    // Format cost display (2 decimal places)
    const costDisplay = costData ? costData.totalCost.toFixed(2) : '0.00';

    // Summary age badge — shows how many turns have been summarized
    let summaryBadgeText = null;
    if (isLiveMode) {
      const summarizedCount =
        voxChronicle?.aiAssistant?.summarizedTurnCount ||
        this._orchestrator?._aiAssistant?.summarizedTurnCount ||
        0;
      if (summarizedCount > 0) {
        summaryBadgeText =
          game.i18n?.format('VOXCHRONICLE.SummaryAgeBadge', { count: summarizedCount }) ||
          `Context: ${summarizedCount} turns summarized`;
      }
    }

    // Cost cap warning
    let costCapWarning = null;
    if (this._orchestrator?._aiSuggestionsPaused) {
      let cap = '5.00';
      try {
        cap = String(game?.settings?.get(MODULE_ID, 'sessionCostCap') || 5);
      } catch {
        // Setting unavailable — use default cap display value
      }
      costCapWarning =
        game.i18n?.format('VOXCHRONICLE.Live.CostCapReached', { cap: `$${cap}` }) ||
        `Cost cap reached ($${cap}). AI suggestions paused.`;
    }

    // Status badge mapping — 3 UI states from orchestrator state
    const stateStr = this._orchestrator?.state || 'idle';
    let statusState = 'idle';
    if (stateStr === 'live_listening') {statusState = 'live';} else if (stateStr === 'live_transcribing' || stateStr === 'live_analyzing') {statusState = 'analyzing';}
    if (!isLiveMode) statusState = 'idle';

    const statusKey =
      `VOXCHRONICLE.Live.Status.${  statusState.charAt(0).toUpperCase()  }${statusState.slice(1)}`;
    const statusLabel = game.i18n?.localize(statusKey) || statusState.toUpperCase();

    // Parse suggestion content into structured cards
    const rawSuggestions = this._orchestrator?.getAISuggestions?.() || [];
    const suggestions = rawSuggestions.map((s) => {
      const parsed = this._parseCardContent(s.content);
      return { ...s, parsedTitle: parsed.title, parsedBullets: parsed.bullets };
    });

    return {
      isConfigured: status.settings.openaiConfigured,
      kankaConfigured: status.settings.kankaConfigured,
      hasTranscription: status.services.transcription,
      hasRAG: status.services.ragProvider,
      isRecording: this._isRecordingActive(),
      isLiveMode,
      isStopping,
      transcriptionHealth: health.transcription || 'healthy',
      aiSuggestionHealth: health.aiSuggestions || 'healthy',
      tokenDisplay,
      costDisplay,
      costCapWarning,
      summaryBadgeText,
      // Journal context
      adventureName: journalData.adventureName,
      supplementaryCount: journalData.supplementaryCount,
      hasJournalSelected: journalData.hasJournalSelected,
      isJournalTooShort: journalData.isJournalTooShort,
      isJournalTooLong: journalData.isJournalTooLong,
      isPaused: this._orchestrator?.state === 'paused',
      isProcessing: this._orchestrator?.state === 'processing',
      statusMessage: this.#statusMessage,
      progressPercent: this.#progressPercent,
      duration: this._formatDuration(),
      audioLevel: this._getAudioLevel(),
      transcriptionMode: game.settings?.get(MODULE_ID, 'transcriptionMode') || 'auto',
      currentChapter: this._orchestrator?.getCurrentChapter?.() || null,
      collapsed: this.#collapsed,
      isFirstLaunch:
        !isLiveMode && !this._isRecordingActive() && !this._orchestrator?.currentSession,
      visibleTabs: this._getVisibleTabs(isLiveMode),
      currentSceneType: this._orchestrator?.getCurrentSceneType?.() || 'unknown',
      sceneTypeLabel: this._getSceneTypeLabel(this._orchestrator?.getCurrentSceneType?.()),
      statusState,
      statusLabel,
      activeTab: this._activeTab,
      suggestions,
      images,
      imageCount: images.length,
      segments: session?.transcript?.segments || [],
      hasTranscript: !!session?.transcript,
      transcriptSegments: this._buildTranscriptSegments(
        this.#transcriptData.length > 0 ? this.#transcriptData : session?.transcript?.segments
      ),
      hasTranscriptSegments:
        this.#transcriptData.length > 0 || (session?.transcript?.segments?.length || 0) > 0,
      entities: session?.entities || null,
      entityCount: this._countEntities(session?.entities),
      hasEntities: !!session?.entities,
      chronicleDraft: this.#cachedChronicleDraft,
      hasChronicleDraft: !!this.#cachedChronicleDraft,
      // Chapter navigation
      chapterNavTitle: chapterNavData.currentChapter,
      prevChapter: chapterNavData.prevChapter,
      nextChapter: chapterNavData.nextChapter,
      indexStatus: chapterNavData.indexStatus,
      // RAG indexing status data
      ragEnabled: ragData.enabled,
      ragStatus: ragData.status,
      ragProgress: ragData.progress,
      ragProgressText: ragData.progressText,
      ragVectorCount: ragData.vectorCount,
      ragStorageUsage: ragData.storageUsage,
      ragLastIndexed: ragData.lastIndexed,
      // LED badge state (Story 6.1 AC2)
      badgeState: this._getBadgeState(),
      // Tab badge counts (Story 6.2 AC4)
      suggestionCount: suggestions.length
    };
  }

  /**
   * Get LED badge state based on current orchestrator state
   * @returns {string} 'recording' | 'streaming' | 'idle'
   * @private
   */
  _getBadgeState() {
    const state = this._orchestrator?.state;
    if (state === 'live_analyzing') return 'streaming';
    if (
      state === 'recording' ||
      state === 'live_listening' ||
      state === 'live_transcribing'
    ) {
      return 'recording';
    }
    return 'idle';
  }

  /**
   * Bind non-click event listeners after render
   * @param {object} context - The prepared context
   * @param {object} options - Render options
   */
  _onRender(context, options) {
    this._logger.debug('_onRender called', {
      activeTab: this._activeTab,
      isRecording: context?.isRecording
    });
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    // Clean up previous real-time loops
    this._stopRealtimeUpdates();

    // Tab switching (uses data-tab attribute, not data-action)
    this.element?.querySelectorAll('.vox-chronicle-tab').forEach((el) => {
      el.addEventListener(
        'click',
        (event) => {
          const tab = event.currentTarget.dataset.tab;
          if (tab) this.switchTab(tab);
        },
        { signal }
      );
    });

    // Start real-time updates if recording is active
    if (this._isRecordingActive()) {
      this._startRealtimeUpdates();
    }

    // Recover active streaming card after DOM replacement (Pitfall 5)
    if (this._streamingActiveType && this._streamingAccumulatedText) {
      const recoveredCard = this._createStreamingCard(this._streamingActiveType, null);
      if (recoveredCard) {
        const spinner = recoveredCard.querySelector('.vox-chronicle-suggestion__spinner');
        if (spinner) spinner.remove();
        const content = recoveredCard.querySelector('.vox-chronicle-suggestion__content');
        if (content) content.textContent = this._streamingAccumulatedText;
        this._activeStreamingCard = recoveredCard;
      }
    }

    // Recover rules cards after DOM replacement (same pattern as streaming recovery)
    if (this._rulesCards?.length) {
      const savedCards = this._rulesCards;
      this._rulesCards = [];
      for (const { data } of savedCards) {
        // Re-create card from data; mark synthesis as unavailable if it was in-flight
        const hadPendingSynthesis = data.synthesisPromise != null;
        this._handleRulesCard({
          ...data,
          synthesisPromise: null,
          synthesisUnavailable: hadPendingSynthesis
        });
      }
    }

    // Rules input wiring — persistent input always available
    const rulesInput = this.element?.querySelector('.vox-chronicle-rules-input__field');
    if (rulesInput) {
      rulesInput.value = this._rulesInputValue || '';
      rulesInput.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Enter' && e.target.value.trim()) {
            const query = e.target.value.trim();
            if (!this._orchestrator?.handleManualRulesQuery) {
              this._logger.warn('Rules query submitted but orchestrator is not available');
              return;
            }
            e.target.value = '';
            this._rulesInputValue = '';
            this._orchestrator.handleManualRulesQuery(query);
          }
        },
        { signal }
      );
      rulesInput.addEventListener(
        'input',
        (e) => {
          this._rulesInputValue = e.target.value;
        },
        { signal }
      );
    }

    // Process any pending rules cards queued during tab switch
    if (this._pendingRulesCards?.length) {
      const pending = this._pendingRulesCards;
      this._pendingRulesCards = [];
      for (const cardData of pending) {
        this._handleRulesCard(cardData);
      }
    }

    // Transcript inline editing — dblclick to edit, blur/Enter to save
    this.element
      ?.querySelectorAll('.vox-chronicle-transcript-review__text[data-editable]')
      .forEach((span) => {
        span.addEventListener(
          'dblclick',
          () => {
            span.contentEditable = 'true';
            span.classList.add('vox-chronicle-transcript-review__text--editing');
            span.focus();
          },
          { signal }
        );

        span.addEventListener(
          'blur',
          () => {
            span.contentEditable = 'false';
            span.classList.remove('vox-chronicle-transcript-review__text--editing');
            const row = span.closest('[data-segment-index]');
            if (row) {
              const index = parseInt(row.dataset.segmentIndex, 10);
              const newText = span.textContent;
              this.editSegment(index, newText);
            }
          },
          { signal }
        );

        span.addEventListener(
          'keydown',
          (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              span.blur();
            }
            if (e.key === 'Escape') {
              span.contentEditable = 'false';
              span.classList.remove('vox-chronicle-transcript-review__text--editing');
            }
          },
          { signal }
        );
      });

    // Auto-scroll transcript to bottom
    if (this._activeTab === 'transcript') {
      const container = this.element.querySelector('.vox-chronicle-panel__transcript');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
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

  static async _onChangeJournal(event, target) {
    return this._handleChangeJournal();
  }

  static async _onPrevChapter(event, target) {
    return this._handleChapterNav('prev');
  }

  static async _onNextChapter(event, target) {
    return this._handleChapterNav('next');
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

    // Block switching to tabs not visible in current mode (Story 6.2 AC2)
    const visible = this._getVisibleTabs(!!this._orchestrator?.isLiveMode);
    if (!visible.includes(tabName)) {
      this._logger.debug(`Tab ${tabName} not visible in current mode, ignoring`);
      return;
    }

    this._activeTab = tabName;
    this._logger.debug(`Switched to tab: ${tabName}`);

    // CSS-only tab switching — avoid full re-render
    if (this.element) {
      this.element.querySelectorAll('.vox-chronicle-tab-pane').forEach((el) => (el.hidden = true));
      const activeContent = this.element.querySelector(`[data-tab-pane="${tabName}"]`);
      if (activeContent) activeContent.hidden = false;

      this.element
        .querySelectorAll('.vox-chronicle-tab')
        .forEach((el) =>
          el.classList.toggle('vox-chronicle-tab--active', el.dataset.tab === tabName)
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
    this._stopRealtimeUpdates();
    this.#listenerController?.abort();
    this._debouncedRender?.cancel?.();
    this._cleanupEventBus();
    // Clean up rules state
    for (const t of this._rulesDismissTimeouts || []) clearTimeout(t);
    this._rulesDismissTimeouts = [];
    this._rulesCards = [];
    this._pendingRulesCards = [];
    return super.close(options);
  }

  /**
   * Request a debounced render update
   */
  requestRender() {
    this._debouncedRender();
  }

  /**
   * Get visible tabs based on current session mode
   * @param {boolean} isLiveMode - Whether live mode is active
   * @returns {string[]} Array of visible tab IDs
   * @private
   */
  _getVisibleTabs(isLiveMode) {
    if (isLiveMode) {
      return ['live', 'transcript', 'analytics'];
    }
    if (this._orchestrator?.currentSession) {
      return ['chronicle', 'entities', 'images', 'transcript'];
    }
    return ['live', 'chronicle', 'transcript', 'entities', 'images', 'analytics'];
  }

  /**
   * Get localized scene type label
   * @param {string} sceneType - Scene type key
   * @returns {string} Localized label
   * @private
   */
  _getSceneTypeLabel(sceneType) {
    const labelMap = {
      combat: 'VOXCHRONICLE.Scene.Combat',
      social: 'VOXCHRONICLE.Scene.Social',
      exploration: 'VOXCHRONICLE.Scene.Exploration',
      rest: 'VOXCHRONICLE.Scene.Rest'
    };
    const key = labelMap[sceneType];
    return key ? game.i18n?.localize(key) || sceneType : sceneType || 'unknown';
  }

  /**
   * Get RAG indexing status data from cached state
   * @returns {object} RAG status data for template
   * @private
   */
  _getRAGData() {
    const voxChronicle = VoxChronicle.getInstance();
    const ragProvider = voxChronicle?.ragProvider;

    let ragEnabled = false;
    try {
      ragEnabled = game?.settings?.get(MODULE_ID, 'ragEnabled') ?? false;
    } catch (error) {
      this._logger.debug('Could not read ragEnabled setting:', error.message);
    }

    // On first access with a live provider, kick off async status fetch
    if (ragProvider && !this.#ragStatusFetched) {
      this.#ragStatusFetched = true;
      this._refreshRAGStatus();
    }

    // Determine display status from cached data
    let status = 'idle';
    if (ragProvider && this.#ragCachedStatus.indexing) {
      status = 'indexing';
    } else if (ragProvider && this.#ragCachedStatus.vectorCount > 0) {
      status = 'indexed';
    }

    return {
      enabled: ragEnabled,
      status,
      progress: this.#ragCachedStatus.progress,
      progressText: this.#ragCachedStatus.progressText,
      vectorCount: this.#ragCachedStatus.vectorCount,
      storageUsage: 'N/A (managed by OpenAI)',
      lastIndexed: this.#ragCachedStatus.lastIndexed
    };
  }

  /**
   * Fetch RAG status from provider and update cached state (non-blocking)
   * @private
   */
  async _refreshRAGStatus() {
    try {
      const voxChronicle = VoxChronicle.getInstance();
      const ragProvider = voxChronicle?.ragProvider;
      if (!ragProvider) return;

      const providerStatus = await ragProvider.getStatus();
      this.#ragCachedStatus.vectorCount = providerStatus.documentCount || 0;

      // Also read persisted lastIndexed from settings
      try {
        const metadata = game?.settings?.get(MODULE_ID, 'ragIndexMetadata') || {};
        if (metadata.lastIndexed) {
          this.#ragCachedStatus.lastIndexed = new Date(metadata.lastIndexed).toLocaleString();
        }
      } catch (e) {
        this._logger.warn('Failed to read ragIndexMetadata:', e.message);
      }

      this._logger.debug(`RAG status refreshed: ${this.#ragCachedStatus.vectorCount} docs`);
      if (this.rendered) this.render();
    } catch (error) {
      this._logger.debug('Could not refresh RAG status:', error.message);
    }
  }

  /**
   * Toggle recording on/off based on current state
   * @private
   */
  async _handleToggleRecording() {
    if (!this._orchestrator) {
      this._logger.error('Orchestrator not available');
      ui?.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.Error.OrchestratorUnavailable') ||
          'VoxChronicle is not ready. Please reload the module or check the browser console for errors.'
      );
      return;
    }

    const state = this._orchestrator.state;
    const isLiveMode = this._orchestrator.isLiveMode;
    const isRecActive = this._isRecordingActive();
    this._logger.log('Toggle recording', { state, isLiveMode, isRecordingActive: isRecActive });

    try {
      if (isRecActive) {
        // Stop recording - use live mode stop if in live mode, otherwise regular stop
        if (isLiveMode) {
          await this._orchestrator.stopLiveMode();
        } else {
          await this._orchestrator.stopSession({ processImmediately: false });
        }
        // Auto-transition to chronicle tab after stopping (Story 6.2 AC3)
        if (this._activeTab === 'live') {
          this._activeTab = 'chronicle';
        }
        ui?.notifications?.info(
          game.i18n?.format('VOXCHRONICLE.Notifications.RecordingStopped', {
            duration: this._formatDuration()
          }) || 'Recording stopped'
        );
      } else {
        // Check journal selection before starting
        let journalId = '';
        try {
          journalId = game?.settings?.get(MODULE_ID, 'activeAdventureJournalId') || '';
        } catch (e) {
          this._logger.debug('Could not read activeAdventureJournalId:', e.message);
        }

        // Auto-select scene journal if no journal is selected
        if (!journalId) {
          const sceneJournal = globalThis.canvas?.scene?.journal;
          if (sceneJournal?.id) {
            journalId = sceneJournal.id;
            await game.settings.set(MODULE_ID, 'activeAdventureJournalId', journalId);
            this._logger.info(`Auto-selected scene journal: ${journalId}`);
          }
        }

        // If still no journal, open picker and return
        if (!journalId) {
          ui?.notifications?.warn(
            game.i18n?.localize('VOXCHRONICLE.Panel.SelectJournalFirst') ||
              'Please select an adventure journal first.'
          );
          await this._handleChangeJournal();
          return;
        }

        // Start recording - use live mode by default (real-time AI assistance)
        if (this._orchestrator.hasTranscriptionService) {
          await this._orchestrator.startLiveMode();
        } else {
          await this._orchestrator.startSession();
        }
        ui?.notifications?.info(
          game.i18n?.localize('VOXCHRONICLE.Notifications.RecordingStarted') || 'Recording started'
        );
      }
      this.render();
    } catch (error) {
      this._logger.error('Toggle recording failed:', error);
      ui?.notifications?.error(escapeHtml(error.message));
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
      ui?.notifications?.error(escapeHtml(error.message));
    }
  }

  /**
   * Process the session (transcribe audio)
   * @private
   */
  async _handleProcessSession() {
    if (!this._orchestrator?.currentSession?.audioBlob) {
      ui?.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Panel.NoTranscriptVC') || 'No audio to process'
      );
      return;
    }

    try {
      await this._orchestrator.processTranscription();
      this.render();
    } catch (error) {
      this._logger.error('Process session failed:', error);
      ui?.notifications?.error(escapeHtml(error.message));
    }
  }

  /**
   * Publish entities and chronicle to Kanka
   * @private
   */
  async _handlePublishKanka() {
    if (!this._orchestrator?.currentSession?.entities) {
      ui?.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Panel.NoEntities') || 'No entities to publish'
      );
      return;
    }

    try {
      await this._orchestrator.publishToKanka();
      this.render();
    } catch (error) {
      this._logger.error('Publish to Kanka failed:', error);
      ui?.notifications?.error(escapeHtml(error.message));
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
      ui?.notifications?.error(escapeHtml(error.message));
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
      ui?.notifications?.error(escapeHtml(error.message));
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
    return (
      state === 'recording' ||
      state === 'paused' ||
      state === 'live_listening' ||
      state === 'live_transcribing' ||
      state === 'live_analyzing'
    );
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
      ui?.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.RAG.NotConfigured') || 'RAG not configured'
      );
      return;
    }

    try {
      this._logger.info('Starting RAG index build');

      // Set indexing state for UI feedback
      this.#ragCachedStatus.indexing = true;
      this.#ragCachedStatus.progress = 0;
      this.#ragCachedStatus.progressText = '';
      this.render();

      // Collect journal entries as RAGDocuments
      const documents = [];
      const journals = game?.journal ?? [];

      for (const journal of journals) {
        const pages = journal.pages?.contents ?? [];
        const content = pages
          .map((p) => stripHtml(p.text?.content || ''))
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
          this.#ragCachedStatus.progress = total > 0 ? Math.round((progress / total) * 100) : 0;
          this.#ragCachedStatus.progressText = text;
          this.requestRender();
        }
      });

      this._logger.info(`Index build complete: ${result.indexed} indexed, ${result.failed} failed`);

      // Update cached status
      this.#ragCachedStatus.indexing = false;
      this.#ragCachedStatus.vectorCount = result.indexed;
      this.#ragCachedStatus.progress = 0;
      this.#ragCachedStatus.progressText = '';
      this.#ragCachedStatus.lastIndexed = new Date().toLocaleString();

      // Update last indexed timestamp in settings
      try {
        const metadata = game?.settings?.get(MODULE_ID, 'ragIndexMetadata') || {};
        metadata.lastIndexed = new Date().toISOString();
        await game?.settings?.set(MODULE_ID, 'ragIndexMetadata', metadata);
      } catch (error) {
        this._logger.debug('Could not update ragIndexMetadata setting:', error.message);
      }

      const msg =
        result.failed > 0
          ? `RAG index built: ${result.indexed} indexed, ${result.failed} failed`
          : game.i18n?.localize('VOXCHRONICLE.RAG.IndexComplete') || 'RAG index built successfully';
      ui?.notifications?.info(msg);
      this.render();
    } catch (error) {
      this.#ragCachedStatus.indexing = false;
      this.#ragCachedStatus.progress = 0;
      this.#ragCachedStatus.progressText = '';
      this._logger.error('RAG index build failed:', error);
      ui?.notifications?.error(
        game.i18n?.format('VOXCHRONICLE.RAG.IndexFailed', { error: escapeHtml(error.message) }) ||
          `RAG index failed: ${escapeHtml(error.message)}`
      );
      this.render();
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
      content:
        game.i18n?.localize('VOXCHRONICLE.RAG.ClearConfirmContent') ||
        'Are you sure you want to clear the RAG index? This will remove all indexed vectors.',
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

      // Reset cached status
      this.#ragCachedStatus.vectorCount = 0;
      this.#ragCachedStatus.lastIndexed = null;

      // Clear last indexed timestamp
      try {
        const metadata = game?.settings?.get(MODULE_ID, 'ragIndexMetadata') || {};
        delete metadata.lastIndexed;
        await game?.settings?.set(MODULE_ID, 'ragIndexMetadata', metadata);
      } catch (error) {
        this._logger.debug('Could not clear ragIndexMetadata setting:', error.message);
      }

      ui?.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.RAG.IndexCleared') || 'RAG index cleared'
      );
      this.render();
    } catch (error) {
      this._logger.error('RAG index clear failed:', error);
      ui?.notifications?.error(
        game.i18n?.format('VOXCHRONICLE.RAG.ClearFailed', { error: escapeHtml(error.message) }) ||
          `Failed to clear RAG index: ${escapeHtml(error.message)}`
      );
    }
  }

  /**
   * Format the current session duration using AudioUtils.formatDuration.
   * Returns "H:MM:SS" for sessions over an hour, "M:SS" otherwise.
   * @returns {string} Formatted duration string
   * @private
   */
  _formatDuration() {
    const session = this._orchestrator?.currentSession;
    if (!session?.startTime) return '0:00';
    const elapsed = Math.floor(((session.endTime || Date.now()) - session.startTime) / 1000);
    return AudioUtils.formatDuration(elapsed);
  }

  /**
   * Start real-time DOM updates for audio level bar and duration timer.
   * Uses a single rAF loop for both: level updates every frame (~60fps),
   * duration updates once per second (throttled).
   * @private
   */
  _startRealtimeUpdates() {
    const levelBar = this.element?.querySelector('.vox-chronicle-panel__level-bar');
    const durationSpan = this.element?.querySelector('.vox-chronicle-panel__duration');

    if (!levelBar && !durationSpan) return;

    let lastDurationStr = '';

    const update = () => {
      // Level bar: every frame for smooth animation
      if (levelBar) {
        const level = this._getAudioLevel();
        levelBar.style.width = `${level}%`;
      }

      // Duration: only when the second changes (avoids redundant DOM writes)
      if (durationSpan) {
        const formatted = this._formatDuration();
        // Compare against last written value to skip no-op writes
        if (formatted !== lastDurationStr) {
          durationSpan.textContent = formatted;
          lastDurationStr = formatted;
        }
      }

      this.#realtimeRafId = requestAnimationFrame(update);
    };

    this.#realtimeRafId = requestAnimationFrame(update);
  }

  /**
   * Stop real-time DOM update loops.
   * @private
   */
  _stopRealtimeUpdates() {
    if (this.#realtimeRafId !== null) {
      cancelAnimationFrame(this.#realtimeRafId);
      this.#realtimeRafId = null;
    }
  }

  /**
   * DOM-direct update for live status transitions (Story 6.2 AC5).
   * Avoids full re-render when only the status badge and LED state change.
   * @param {string} newState - The new orchestrator state
   * @private
   */
  _updateLiveStatusDOM(newState) {
    if (!this.element) return;

    // Update status badge text
    const statusMap = {
      live_listening: 'live',
      live_transcribing: 'analyzing',
      live_analyzing: 'analyzing'
    };
    const statusState = statusMap[newState] || 'idle';
    const badge = this.element.querySelector('.vox-chronicle-status-badge');
    if (badge) {
      badge.className = `vox-chronicle-status-badge vox-chronicle-status-badge--${statusState}`;
      const label =
        game.i18n?.localize(`VOXCHRONICLE.Live.Status.${statusState}`) || statusState;
      badge.textContent = label;
    }

    // Update LED badge state (recording vs streaming)
    const badgeState = newState === 'live_analyzing' ? 'streaming' : 'recording';
    const aiBadge = this.element.querySelector('.vox-chronicle-panel__badges .vox-chronicle-badge');
    if (aiBadge) {
      aiBadge.classList.remove('vox-chronicle-badge--recording', 'vox-chronicle-badge--streaming', 'vox-chronicle-badge--idle');
      aiBadge.classList.add(`vox-chronicle-badge--${badgeState}`);
    }
  }

  /**
   * Get journal selection data for the confirmation banner
   * @returns {object} Journal selection context data
   * @private
   */
  _getJournalSelectionData() {
    let primaryId = '';
    let supplementaryIds = [];
    try {
      primaryId = game?.settings?.get(MODULE_ID, 'activeAdventureJournalId') || '';
      supplementaryIds = game?.settings?.get(MODULE_ID, 'supplementaryJournalIds') || [];
    } catch (error) {
      this._logger.debug('Could not read journal settings:', error.message);
    }

    let adventureName = null;
    let isJournalTooShort = false;
    let isJournalTooLong = false;

    if (primaryId) {
      const journal = game?.journal?.get(primaryId);
      adventureName = journal?.name || null;

      // Content length warnings
      if (journal?.pages?.contents) {
        const fullText = journal.pages.contents
          .map((p) => stripHtml(p.text?.content || ''))
          .filter(Boolean)
          .join('\n\n');
        if (fullText.length < 500) isJournalTooShort = true;
        if (fullText.length > 200000) isJournalTooLong = true;
      }
    }

    return {
      adventureName,
      supplementaryCount: supplementaryIds.length,
      hasJournalSelected: !!primaryId && !!adventureName,
      isJournalTooShort,
      isJournalTooLong
    };
  }

  /**
   * Get chapter navigation data from the orchestrator's ChapterTracker
   * @returns {object} Chapter nav context data
   * @private
   */
  _getChapterNavData() {
    const chapterTracker = this._orchestrator?._chapterTracker;
    if (!this._isRecordingActive() || !chapterTracker) {
      return {
        currentChapter: null,
        prevChapter: null,
        nextChapter: null,
        indexStatus: this._getIndexStatus()
      };
    }

    const current = chapterTracker.getCurrentChapter?.();
    const siblings = chapterTracker.getSiblingChapters?.() || {};

    return {
      currentChapter: current?.title || null,
      prevChapter: siblings.prev?.title || null,
      nextChapter: siblings.next?.title || null,
      indexStatus: this._getIndexStatus()
    };
  }

  /**
   * Compute index health indicator status.
   * @returns {'green'|'yellow'|'gray'} green=fresh, yellow=indexing, gray=no index
   * @private
   */
  _getIndexStatus() {
    if (!this._orchestrator?._ragProvider) return 'gray';
    if (this._orchestrator?._reindexInProgress) return 'yellow';
    const hashes = this._orchestrator?._contentHashes;
    if (hashes && Object.keys(hashes).length > 0) return 'green';
    return 'gray';
  }

  /**
   * Handle chapter navigation (prev/next)
   * Manual navigation updates context on the next natural AI cycle, not immediately.
   * @param {'prev'|'next'} direction - Navigation direction
   * @private
   */
  async _handleChapterNav(direction) {
    const chapterTracker = this._orchestrator?._chapterTracker;
    if (!chapterTracker) return;

    try {
      const siblings = chapterTracker.getSiblingChapters?.() || {};
      const target = direction === 'prev' ? siblings.prev : siblings.next;

      if (!target?.title) return;

      chapterTracker.navigateToChapter(target.title);

      const msg =
        game.i18n?.format('VOXCHRONICLE.Panel.ChapterUpdated', { name: target.title }) ||
        `Chapter updated: ${target.title}`;
      ui?.notifications?.info(msg);

      this.render();
    } catch (error) {
      this._logger.error('Chapter navigation failed:', error);
    }
  }

  /**
   * Open the JournalPicker dialog
   * @private
   */
  async _handleChangeJournal() {
    try {
      const { JournalPicker } = await import('./JournalPicker.mjs');
      const picker = new JournalPicker({
        onSave: () => this.render()
      });
      picker.render(true);
    } catch (error) {
      this._logger.error('Failed to open journal picker:', error);
      ui?.notifications?.error(escapeHtml(error.message));
    }
  }

  // ─── Status badge & suggestion card helpers ─────────────────────

  /**
   * Parse freeform AI suggestion text into a structured title + bullets format.
   * First line (after stripping markdown heading prefixes) becomes the title.
   * Lines starting with -, *, or digits become bullets (max 3).
   * If no bullets found, remaining text is split into sentences (max 3).
   *
   * @param {string|null|undefined} text - Raw AI suggestion content
   * @returns {{ title: string, bullets: string[] }}
   */
  _parseCardContent(text) {
    if (!text) return { title: '', bullets: [] };

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return { title: '', bullets: [] };

    // Title: first line, strip markdown heading prefixes
    const title = lines[0].replace(/^#{1,6}\s+/, '');

    // Remaining lines: look for bullet patterns
    const remaining = lines.slice(1);
    const bulletPattern = /^[-*]\s+|^\d+[.)]\s+/;
    const bulletLines = remaining.filter((l) => bulletPattern.test(l));

    let bullets;
    if (bulletLines.length > 0) {
      bullets = bulletLines.map((l) => l.replace(bulletPattern, '')).slice(0, 3);
    } else if (remaining.length > 0) {
      // No bullet markers — split into sentences
      const joined = remaining.join(' ');
      const sentences = joined.split(/(?<=[.!?])\s+/).filter(Boolean);
      bullets = sentences.slice(0, 3);
    } else {
      bullets = [];
    }

    return { title, bullets };
  }

  // ─── Streaming callback handlers (wired by Plan 03) ────────────

  /**
   * Handle a streaming token event from the orchestrator.
   * Creates a streaming card on first call (when data.type is set),
   * then appends accumulated text on subsequent calls.
   *
   * @param {object} data - Token data
   * @param {string} [data.type] - Suggestion type (signals stream start)
   * @param {string} [data.text] - Accumulated text so far
   * @param {string} [data.source] - Optional source label
   * @private
   */
  _handleStreamToken(data) {
    if (!data) return;

    // Stream start: create a new card
    if (data.type && !this._activeStreamingCard) {
      this._activeStreamingCard = this._createStreamingCard(data.type, data.source || null);
      this._streamingActiveType = data.type;
      this._streamingAccumulatedText = '';
    }

    // Token update: append incremental text
    if (data.text && this._activeStreamingCard) {
      const newContent = data.text.slice(this._streamingAccumulatedText.length);
      if (newContent) {
        this._appendStreamingToken(this._activeStreamingCard, newContent);
        this._streamingAccumulatedText = data.text;

        // Auto-scroll if at bottom
        const container = this.element?.querySelector('.vox-chronicle-suggestions-container');
        if (container && this._isScrolledToBottom(container)) {
          container.scrollTop = container.scrollHeight;
        }
      }
    }
  }

  /**
   * Handle a streaming completion event from the orchestrator.
   * Finalizes the active streaming card and stores the completed suggestion.
   *
   * @param {object} data - Completion data
   * @param {string} data.text - Full suggestion text
   * @param {string} data.type - Suggestion type
   * @param {object} [data.usage] - Token usage data
   * @private
   */
  _handleStreamComplete(data) {
    if (!data) return;

    if (this._activeStreamingCard) {
      this._finalizeStreamingCard(this._activeStreamingCard, data.text, data.type);
    }

    // Clear streaming state
    this._activeStreamingCard = null;
    this._streamingAccumulatedText = '';
    this._streamingActiveType = null;

    // Store the completed suggestion in the orchestrator's suggestions array
    // so it persists across re-renders
    if (this._orchestrator?.appendSuggestion) {
      this._orchestrator.appendSuggestion({
        type: data.type || 'narration',
        content: data.text || ''
      });
    }
  }

  // ─── Rules card handler (07-03) ──────────────────────────────

  /**
   * Handle a rules card event from the orchestrator.
   * Creates a rules card in the suggestion feed with compendium excerpt,
   * optional two-phase synthesis update, citation badges, and auto-dismiss for unavailable.
   *
   * @param {object} data - Rules card data
   * @param {string} data.topic - Normalized topic
   * @param {Array} data.compendiumResults - Compendium search results
   * @param {Promise|null} data.synthesisPromise - Promise for AI synthesis
   * @param {string} data.source - 'auto' or 'manual'
   * @param {boolean} [data.unavailable] - Whether lookup failed
   * @private
   */
  _handleRulesCard(data) {
    if (!data) return;

    // Switch to live tab if not already there so the suggestions container is visible
    if (this._activeTab !== 'live') {
      this._activeTab = 'live';
      // Store data and re-render — _onRender will restore rules cards
      this._pendingRulesCards = this._pendingRulesCards || [];
      this._pendingRulesCards.push(data);
      this.render();
      return;
    }

    const container = this.element?.querySelector('.vox-chronicle-suggestions-container');
    if (!container) return;

    // Remove the empty message if present
    const emptyMsg = container.querySelector('.vox-chronicle-panel__empty');
    if (emptyMsg) emptyMsg.remove();

    const card = document.createElement('div');

    if (data.unavailable) {
      // Unavailable card — muted, auto-dismiss after 10s
      card.className =
        'vox-chronicle-suggestion vox-chronicle-suggestion--rules vox-chronicle-suggestion--unavailable';
      card.innerHTML = `
        <span class="vox-chronicle-suggestion__type vox-chronicle-suggestion__type--reference">reference</span>
        <button type="button" class="vox-chronicle-suggestion__dismiss" data-action="dismiss-suggestion" title="${escapeHtml(game.i18n?.localize('VOXCHRONICLE.Live.DismissSuggestion') || 'Dismiss')}"><i class="fa-solid fa-xmark"></i></button>
        <div class="vox-chronicle-suggestion__content">
          <strong class="vox-chronicle-suggestion__title">${escapeHtml(data.topic || game.i18n?.localize('VOXCHRONICLE.Rules.Unavailable') || 'Rules lookup unavailable')}</strong>
          <p>${escapeHtml(game.i18n?.localize('VOXCHRONICLE.Rules.Unavailable') || 'Rules lookup unavailable')}</p>
        </div>
      `;
      container.appendChild(card);

      // Auto-dismiss after 10 seconds with fade animation
      let timeoutRef;
      timeoutRef = setTimeout(() => {
        const idx = this._rulesDismissTimeouts.indexOf(timeoutRef);
        if (idx !== -1) this._rulesDismissTimeouts.splice(idx, 1);
        card.classList.add('vox-chronicle-suggestion--dismissing');
        setTimeout(() => card.remove(), 300);
      }, 10000);
      this._rulesDismissTimeouts.push(timeoutRef);
      return;
    }

    // Normal rules card
    const excerpt = data.compendiumResults?.[0]?.rule?.content?.substring(0, 300) || '';
    const citation = data.compendiumResults?.[0]?.rule?.citation?.formatted || '';
    const hasSynthesis = !!data.synthesisPromise;

    card.className = `vox-chronicle-suggestion vox-chronicle-suggestion--rules${hasSynthesis ? ' vox-chronicle-suggestion--refining' : ''}`;
    card.innerHTML = `
      <span class="vox-chronicle-suggestion__type vox-chronicle-suggestion__type--reference">reference</span>
      ${data.source === 'auto' ? `<span class="vox-chronicle-suggestion__auto-badge">${escapeHtml(game.i18n?.localize('VOXCHRONICLE.Rules.AutoDetected') || 'auto')}</span>` : ''}
      <button type="button" class="vox-chronicle-suggestion__dismiss" data-action="dismiss-suggestion" title="${escapeHtml(game.i18n?.localize('VOXCHRONICLE.Live.DismissSuggestion') || 'Dismiss')}"><i class="fa-solid fa-xmark"></i></button>
      <div class="vox-chronicle-suggestion__content">
        <strong class="vox-chronicle-suggestion__title">${escapeHtml(data.topic || '')}</strong>
        <p class="vox-chronicle-suggestion__excerpt">${escapeHtml(excerpt)}</p>
      </div>
      ${hasSynthesis ? `<span class="vox-chronicle-suggestion__refining"><i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHtml(game.i18n?.localize('VOXCHRONICLE.Rules.Refining') || 'Refining...')}</span>` : ''}
      ${citation ? `<span class="vox-chronicle-suggestion__citation">${escapeHtml(citation)}</span>` : ''}
    `;

    container.appendChild(card);

    this._rulesCards.push({ data });
    // Prevent unbounded growth — keep last 50 rules cards
    if (this._rulesCards.length > 50) {
      this._rulesCards = this._rulesCards.slice(-50);
    }

    // Two-phase update: when synthesis resolves, update card in-place
    if (data.synthesisPromise) {
      data.synthesisPromise
        .then((synthesis) => {
          if (!this.element || !card.isConnected) return; // Panel closed or card detached by re-render

          // Update card content with AI answer
          const content = card.querySelector('.vox-chronicle-suggestion__content');
          if (content && synthesis?.answer) {
            content.innerHTML = `
            <strong class="vox-chronicle-suggestion__title">${escapeHtml(data.topic || '')}</strong>
            <p>${escapeHtml(synthesis.answer)}</p>
          `;
          }

          // Update citations
          if (synthesis?.citations?.length) {
            const existingCitation = card.querySelector('.vox-chronicle-suggestion__citation');
            const citationText = synthesis.citations.join(', ');
            if (existingCitation) {
              existingCitation.textContent = citationText;
            } else {
              const citBadge = document.createElement('span');
              citBadge.className = 'vox-chronicle-suggestion__citation';
              citBadge.textContent = citationText;
              card.appendChild(citBadge);
            }
          }

          // Remove refining state
          card.classList.remove('vox-chronicle-suggestion--refining');
          const refiningEl = card.querySelector('.vox-chronicle-suggestion__refining');
          if (refiningEl) refiningEl.remove();

          // Track synthesis cost
          if (synthesis?.usage) {
            this._orchestrator?._costTracker?.addUsage?.('gpt-4o', synthesis.usage);
          }
        })
        .catch((err) => {
          this._logger.warn('Rules synthesis failed:', err.message);
          if (!card.isConnected) return;
          card.classList.remove('vox-chronicle-suggestion--refining');
          const refiningEl = card.querySelector('.vox-chronicle-suggestion__refining');
          if (refiningEl) {
            refiningEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(game.i18n?.localize('VOXCHRONICLE.Rules.Unavailable') || 'Synthesis unavailable')}`;
            refiningEl.classList.add('vox-chronicle-suggestion__synthesis-failed');
          }
        });
    }
  }

  // ─── Dismiss suggestion handler ────────────────────────────────

  /**
   * Static action handler for dismissing a suggestion card.
   * Removes the closest .vox-chronicle-suggestion ancestor from DOM.
   * @param {Event} event
   * @param {HTMLElement} target
   * @static
   */
  static _onDismissSuggestion(event, target) {
    target.closest('.vox-chronicle-suggestion')?.remove();
  }

  static _onOpenSpeakerLabeling(event, target) {
    const panel = this;
    const labeling = new SpeakerLabeling({
      onClose: () => {
        panel.render({ parts: ['transcriptReview'] });
        if (panel.#eventBus) {
          try {
            panel.#eventBus.emit('ui:speakerLabelsUpdated');
          } catch (e) {
            panel._logger.warn('EventBus emit failed:', e);
          }
        }
      }
    });
    labeling.render(true);
  }

  /**
   * Toggle panel collapsed/expanded state and persist to settings.
   * @param event
   * @param target
   * @static
   */
  static _onToggleCollapse(event, target) {
    this.#collapsed = !this.#collapsed;
    try {
      game?.settings?.set(MODULE_ID, 'panelCollapsed', this.#collapsed);
    } catch (error) {
      this._logger.debug('Failed to persist panelCollapsed setting:', error.message);
    }
    this.element?.classList.toggle('vox-chronicle-panel--collapsed', this.#collapsed);
  }

  /**
   * Get collapsed state for external access.
   * @returns {boolean}
   */
  get collapsed() {
    return this.#collapsed;
  }

  // ─── Streaming DOM helpers (wired by Plan 03) ─────────────────

  /**
   * Create a streaming card skeleton and append it to the suggestions container.
   * @param {string} type - Suggestion type (narration, dialogue, action, reference)
   * @param {string} [source] - Optional source label (e.g. 'auto')
   * @returns {HTMLElement|null} The created card element, or null if container not found
   */
  _createStreamingCard(type, source) {
    const container = this.element?.querySelector('.vox-chronicle-suggestions-container');
    if (!container) return null;

    const wasAtBottom = this._isScrolledToBottom(container);

    const card = document.createElement('div');
    card.className = 'vox-chronicle-suggestion vox-chronicle-suggestion--streaming';
    card.innerHTML = `
      <span class="vox-chronicle-suggestion__type vox-chronicle-suggestion__type--${escapeHtml(type)}">${escapeHtml(type)}</span>
      <div class="vox-chronicle-suggestion__content">
        <span class="vox-chronicle-suggestion__spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHtml(game.i18n?.localize('VOXCHRONICLE.Live.AIThinking') || 'AI thinking...')}</span>
      </div>
      ${source ? `<span class="vox-chronicle-suggestion__source">${escapeHtml(source)}</span>` : ''}
    `;

    container.appendChild(card);

    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    }

    return card;
  }

  /**
   * Append a streaming token to a card's content area.
   * Removes the spinner placeholder if still present.
   * @param {HTMLElement} card - The streaming card element
   * @param {string} token - Text token to append
   */
  _appendStreamingToken(card, token) {
    if (!card) return;

    const spinner = card.querySelector('.vox-chronicle-suggestion__spinner');
    if (spinner) spinner.remove();

    const content = card.querySelector('.vox-chronicle-suggestion__content');
    if (content) {
      content.appendChild(document.createTextNode(token));
    }

  }

  /**
   * Finalize a streaming card by replacing raw text with structured title+bullets.
   * Removes the --streaming modifier class.
   * @param {HTMLElement} card - The streaming card element
   * @param {string} fullText - Complete suggestion text
   * @param {string} type - Suggestion type
   */
  _finalizeStreamingCard(card, fullText, type) {
    if (!card) return;

    const parsed = this._parseCardContent(fullText);
    const content = card.querySelector('.vox-chronicle-suggestion__content');
    if (content) {
      let html = `<strong class="vox-chronicle-suggestion__title">${escapeHtml(parsed.title)}</strong>`;
      if (parsed.bullets.length > 0) {
        html += '<ul class="vox-chronicle-suggestion__bullets">';
        for (const bullet of parsed.bullets) {
          html += `<li>${escapeHtml(bullet)}</li>`;
        }
        html += '</ul>';
      }
      content.innerHTML = html;
    }

    card.classList.remove('vox-chronicle-suggestion--streaming');
  }

  /**
   * Check if a scrollable container is scrolled to (or near) the bottom.
   * @param {HTMLElement} container - Scrollable container element
   * @returns {boolean} True if within 30px of bottom
   */
  _isScrolledToBottom(container) {
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= 30;
  }

  /**
   * Count the total number of entities across all types
   * @param {object|null} entities - The entities object with typed arrays
   * @returns {number} Total entity count
   * @private
   */
  _countEntities(entities) {
    if (!entities) return 0;

    return (
      (entities.characters?.length || 0) +
      (entities.locations?.length || 0) +
      (entities.items?.length || 0)
    );
  }
}

export { MainPanel };
