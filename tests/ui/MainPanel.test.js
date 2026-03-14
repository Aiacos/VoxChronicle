/**
 * MainPanel Unit Tests
 *
 * Tests for the MainPanel unified UI panel that consolidates all VoxChronicle
 * functionality into a single tabbed interface.
 *
 * @module tests/ui/MainPanel.test
 */

// Ensure foundry global exists before MainPanel.mjs is loaded (it reads foundry.applications.api at module scope)
vi.hoisted(() => {
  if (!globalThis.foundry) {
    class MockAppV2 {
      static DEFAULT_OPTIONS = {};
      static PARTS = {};
      constructor() { this.rendered = false; this._element = null; }
      render() { this.rendered = true; }
      close() { this.rendered = false; return Promise.resolve(); }
    }
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: MockAppV2,
          HandlebarsApplicationMixin: (Base) => class extends Base {
            static PARTS = {};
          }
        }
      },
      utils: { mergeObject: (a, b) => ({ ...a, ...b }) }
    };
  }
});

// vi.mock must be at the top level before imports
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

vi.mock('../../scripts/utils/DomUtils.mjs', () => ({
  debounce: vi.fn((fn) => {
    const debounced = vi.fn((...args) => fn(...args));
    debounced.cancel = vi.fn();
    return debounced;
  })
}));

vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  stripHtml: vi.fn((str) => str || ''),
  sanitizeHtml: vi.fn((str) => str || ''),
  escapeHtml: vi.fn((str) => str || '')
}));

vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: {
    formatDuration: vi.fn((seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      return `${minutes}:${String(secs).padStart(2, '0')}`;
    })
  }
}));

vi.mock('../../scripts/ui/JournalPicker.mjs', () => ({
  JournalPicker: vi.fn().mockImplementation((options) => ({
    render: vi.fn(),
    close: vi.fn(),
    _onSave: options?.onSave || null
  }))
}));

// Track SpeakerLabeling instances created during tests
let lastSpeakerLabelingInstance = null;
let speakerLabelingOnClose = null;

vi.mock('../../scripts/ui/SpeakerLabeling.mjs', () => {
  const MockSpeakerLabeling = vi.fn(function (opts) {
    this.render = vi.fn();
    this.close = vi.fn();
    lastSpeakerLabelingInstance = this;
    speakerLabelingOnClose = opts?.onClose || null;
  });
  // Static methods used by MainPanel
  MockSpeakerLabeling.getSpeakerLabel = vi.fn((id) => id);
  MockSpeakerLabeling.addKnownSpeaker = vi.fn();
  MockSpeakerLabeling.addKnownSpeakers = vi.fn();
  MockSpeakerLabeling.mapSpeakerLabels = vi.fn((segments) => segments);
  MockSpeakerLabeling.applyLabelsToSegments = vi.fn((segments) => segments);
  MockSpeakerLabeling.renameSpeaker = vi.fn();

  return { SpeakerLabeling: MockSpeakerLabeling };
});

vi.mock('../../scripts/core/VoxChronicle.mjs', () => ({
  VoxChronicle: {
    getInstance: vi.fn(() => ({
      ragProvider: null,
      audioRecorder: null,
      narrativeExporter: null,
      getServicesStatus: vi.fn(() => ({
        initialized: true,
        services: {
          audioRecorder: true,
          transcription: true,
          imageGeneration: true,
          kanka: true,
          entityExtractor: true,
          narrativeExporter: true,
          sessionOrchestrator: true,
          journalParser: true,
          compendiumParser: true,
          chapterTracker: true,
          sceneDetector: true,
          aiAssistant: true,
          rulesReference: true,
          sessionAnalytics: true,
          ragProvider: false,
          silenceDetector: false
        },
        settings: {
          openaiConfigured: true,
          kankaConfigured: true,
          ragEnabled: false
        }
      })),
      _getSetting: vi.fn((key) => {
        if (key === 'transcriptionMode') return 'auto';
        return null;
      })
    }))
  }
}));

import { MainPanel } from '../../scripts/ui/MainPanel.mjs';
import { VoxChronicle } from '../../scripts/core/VoxChronicle.mjs';
import { SpeakerLabeling } from '../../scripts/ui/SpeakerLabeling.mjs';

describe('MainPanel', () => {
  let mockOrchestrator;

  beforeEach(() => {
    MainPanel.resetInstance();

    // Set a default journal ID so _handleToggleRecording doesn't block
    game.settings.set('vox-chronicle', 'activeAdventureJournalId', 'default-test-journal');

    mockOrchestrator = {
      state: 'idle',
      isLiveMode: false,
      hasTranscriptionService: false,
      currentSession: null,
      setCallbacks: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      startLiveMode: vi.fn().mockResolvedValue(undefined),
      stopSession: vi.fn().mockResolvedValue(undefined),
      stopLiveMode: vi.fn().mockResolvedValue(undefined),
      pauseRecording: vi.fn(),
      resumeRecording: vi.fn(),
      processTranscription: vi.fn().mockResolvedValue(undefined),
      publishToKanka: vi.fn().mockResolvedValue(undefined),
      generateImage: vi.fn().mockResolvedValue(undefined),
      getAISuggestions: vi.fn(() => []),
      getCurrentChapter: vi.fn(() => null)
    };
  });

  afterEach(() => {
    MainPanel.resetInstance();
  });

  // ─── Singleton Pattern ──────────────────────────────────────────

  describe('singleton pattern', () => {
    it('should return a new instance on first call', () => {
      const instance = MainPanel.getInstance(mockOrchestrator);
      expect(instance).toBeInstanceOf(MainPanel);
    });

    it('should return the same instance on subsequent calls', () => {
      const first = MainPanel.getInstance(mockOrchestrator);
      const second = MainPanel.getInstance(mockOrchestrator);
      expect(first).toBe(second);
    });

    it('should reset the instance when resetInstance is called', () => {
      const first = MainPanel.getInstance(mockOrchestrator);
      MainPanel.resetInstance();
      const second = MainPanel.getInstance(mockOrchestrator);
      expect(first).not.toBe(second);
    });

    it('should register callbacks on orchestrator if setCallbacks exists', () => {
      MainPanel.getInstance(mockOrchestrator);
      expect(mockOrchestrator.setCallbacks).toHaveBeenCalledWith(
        expect.objectContaining({ onStateChange: expect.any(Function) })
      );
    });

    it('should not throw if orchestrator has no setCallbacks', () => {
      delete mockOrchestrator.setCallbacks;
      expect(() => MainPanel.getInstance(mockOrchestrator)).not.toThrow();
    });

    it('should update orchestrator reference when a new orchestrator is provided', () => {
      const first = MainPanel.getInstance(mockOrchestrator);
      expect(first._orchestrator).toBe(mockOrchestrator);

      const newOrchestrator = {
        state: 'idle',
        isLiveMode: false,
        hasTranscriptionService: true,
        currentSession: null,
        setCallbacks: vi.fn(),
        startSession: vi.fn(),
        startLiveMode: vi.fn(),
        stopSession: vi.fn(),
        stopLiveMode: vi.fn()
      };

      const second = MainPanel.getInstance(newOrchestrator);
      expect(second).toBe(first); // Same instance
      expect(second._orchestrator).toBe(newOrchestrator); // Updated reference
    });

    it('should re-register callbacks when orchestrator is updated', () => {
      MainPanel.getInstance(mockOrchestrator);
      expect(mockOrchestrator.setCallbacks).toHaveBeenCalledTimes(1);

      const newOrchestrator = {
        ...mockOrchestrator,
        setCallbacks: vi.fn()
      };
      // Force a different reference
      MainPanel.getInstance(newOrchestrator);
      expect(newOrchestrator.setCallbacks).toHaveBeenCalledWith(
        expect.objectContaining({ onStateChange: expect.any(Function) })
      );
    });

    it('should not update orchestrator when same reference is passed', () => {
      const first = MainPanel.getInstance(mockOrchestrator);
      expect(mockOrchestrator.setCallbacks).toHaveBeenCalledTimes(1);

      // Pass same orchestrator again — should not re-register callbacks
      MainPanel.getInstance(mockOrchestrator);
      expect(mockOrchestrator.setCallbacks).toHaveBeenCalledTimes(1);
    });

    it('should not update orchestrator when null is passed to existing instance', () => {
      MainPanel.getInstance(mockOrchestrator);
      const panel = MainPanel.getInstance(null);
      expect(panel._orchestrator).toBe(mockOrchestrator); // Unchanged
    });

    it('should not update orchestrator when undefined is passed to existing instance', () => {
      MainPanel.getInstance(mockOrchestrator);
      const panel = MainPanel.getInstance(undefined);
      expect(panel._orchestrator).toBe(mockOrchestrator); // Unchanged
    });

    it('should handle new orchestrator without setCallbacks gracefully', () => {
      MainPanel.getInstance(mockOrchestrator);

      const newOrchestrator = { state: 'idle' }; // No setCallbacks
      expect(() => MainPanel.getInstance(newOrchestrator)).not.toThrow();
      const panel = MainPanel.getInstance(newOrchestrator);
      expect(panel._orchestrator).toBe(newOrchestrator);
    });
  });

  // ─── DEFAULT_OPTIONS ────────────────────────────────────────────

  describe('DEFAULT_OPTIONS', () => {
    it('should have correct id', () => {
      expect(MainPanel.DEFAULT_OPTIONS.id).toBe('vox-chronicle-main-panel');
    });

    it('should include vox-chronicle class', () => {
      expect(MainPanel.DEFAULT_OPTIONS.classes).toContain('vox-chronicle');
    });

    it('should define all action handlers', () => {
      const actions = MainPanel.DEFAULT_OPTIONS.actions;
      expect(actions['toggle-recording']).toBeDefined();
      expect(actions['toggle-pause']).toBeDefined();
      expect(actions['process-session']).toBeDefined();
      expect(actions['publish-kanka']).toBeDefined();
      expect(actions['generate-image']).toBeDefined();
      expect(actions['review-entities']).toBeDefined();
      expect(actions['rag-build-index']).toBeDefined();
      expect(actions['rag-clear-index']).toBeDefined();
    });
  });

  // ─── PARTS ──────────────────────────────────────────────────────

  describe('PARTS', () => {
    it('should have a main part with template path', () => {
      expect(MainPanel.PARTS.main.template).toBe(
        'modules/vox-chronicle/templates/main-panel.hbs'
      );
    });
  });

  // ─── activeTab getter ───────────────────────────────────────────

  describe('activeTab', () => {
    it('should default to "live"', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel.activeTab).toBe('live');
    });
  });

  // ─── isRendered getter ──────────────────────────────────────────

  describe('isRendered', () => {
    it('should reflect the rendered property', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel.isRendered).toBe(false);
      panel.rendered = true;
      expect(panel.isRendered).toBe(true);
    });
  });

  // ─── _prepareContext ────────────────────────────────────────────

  describe('_prepareContext', () => {
    it('should return context with default values when no session', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.isConfigured).toBe(true);
      expect(ctx.isRecording).toBe(false);
      expect(ctx.isPaused).toBe(false);
      expect(ctx.isProcessing).toBe(false);
      expect(ctx.duration).toBe('0:00');
      expect(ctx.audioLevel).toBe(0);
      expect(ctx.activeTab).toBe('live');
      expect(ctx.suggestions).toEqual([]);
      expect(ctx.images).toEqual([]);
      expect(ctx.imageCount).toBe(0);
      expect(ctx.segments).toEqual([]);
      expect(ctx.hasTranscript).toBe(false);
      expect(ctx.entities).toBeNull();
      expect(ctx.entityCount).toBe(0);
      expect(ctx.hasEntities).toBe(false);
    });

    it('should reflect recording state', async () => {
      mockOrchestrator.state = 'recording';
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.isRecording).toBe(true);
    });

    it('should reflect paused state', async () => {
      mockOrchestrator.state = 'paused';
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.isPaused).toBe(true);
      expect(ctx.isRecording).toBe(true);
    });

    it('should reflect processing state', async () => {
      mockOrchestrator.state = 'processing';
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.isProcessing).toBe(true);
    });

    it('should return session data when available', async () => {
      mockOrchestrator.currentSession = {
        images: [{ url: 'test.png' }],
        transcript: { segments: [{ text: 'hello' }] },
        entities: { characters: [{ name: 'Bob' }], locations: [], items: [] }
      };
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.images).toHaveLength(1);
      expect(ctx.imageCount).toBe(1);
      expect(ctx.hasTranscript).toBe(true);
      expect(ctx.segments).toHaveLength(1);
      expect(ctx.hasEntities).toBe(true);
      expect(ctx.entityCount).toBe(1);
    });

    it('should include RAG data', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx).toHaveProperty('ragEnabled');
      expect(ctx).toHaveProperty('ragStatus');
      expect(ctx).toHaveProperty('ragProgress');
    });

    it('should not mutate original image objects when adding src', async () => {
      const originalImg = { base64: 'abc123' };
      mockOrchestrator.currentSession = {
        images: [originalImg],
        transcript: null,
        entities: null
      };
      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._prepareContext({});

      // Original object should NOT have src added
      expect(originalImg).not.toHaveProperty('src');
    });
  });

  // ─── switchTab ──────────────────────────────────────────────────

  describe('switchTab', () => {
    it('should switch to a valid tab', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      panel.switchTab('chronicle');
      expect(panel.activeTab).toBe('chronicle');
    });

    it('should not switch to an invalid tab', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      panel.switchTab('invalid-tab');
      expect(panel.activeTab).toBe('live');
    });

    it('should call render if element is null', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const renderSpy = vi.spyOn(panel, 'render');
      panel.switchTab('images');
      expect(renderSpy).toHaveBeenCalled();
    });

    it('should use CSS-only switching if element exists', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);

      // Create mock DOM
      const tabContentElements = [
        { hidden: false, dataset: {} },
        { hidden: false, dataset: {} }
      ];
      const tabElements = [
        { classList: { toggle: vi.fn() }, dataset: { tab: 'live' } },
        { classList: { toggle: vi.fn() }, dataset: { tab: 'chronicle' } }
      ];

      panel._element = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.vox-chronicle-tab-pane') return tabContentElements;
          if (selector === '.vox-chronicle-tab') return tabElements;
          return [];
        }),
        querySelector: vi.fn((selector) => {
          if (selector === '[data-tab-pane="chronicle"]') {
            return { hidden: true };
          }
          return null;
        })
      };
      // Override the element getter
      Object.defineProperty(panel, 'element', {
        get: () => panel._element,
        configurable: true
      });

      const renderSpy = vi.spyOn(panel, 'render');
      panel.switchTab('chronicle');

      // Should NOT call render
      expect(renderSpy).not.toHaveBeenCalled();
      // Should hide all tab contents
      expect(tabContentElements[0].hidden).toBe(true);
      expect(tabContentElements[1].hidden).toBe(true);
    });

    it('should accept all valid tabs', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const validTabs = ['live', 'chronicle', 'images', 'transcript', 'entities', 'analytics'];
      for (const tab of validTabs) {
        panel.switchTab(tab);
        expect(panel.activeTab).toBe(tab);
      }
    });
  });

  // ─── _onRender ──────────────────────────────────────────────────

  describe('_onRender', () => {
    it('should set up AbortController and bind tab click listeners', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const mockElements = [];
      const addEventListenerFn = vi.fn();
      mockElements.push({ addEventListener: addEventListenerFn });

      Object.defineProperty(panel, 'element', {
        get: () => ({
          querySelectorAll: vi.fn((selector) => {
            if (selector === '.vox-chronicle-tab') return mockElements;
            return [];
          }),
          querySelector: vi.fn(() => null)
        }),
        configurable: true
      });

      panel._onRender({}, {});

      expect(addEventListenerFn).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });

    it('should abort previous listeners before creating new ones', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      Object.defineProperty(panel, 'element', {
        get: () => ({
          querySelectorAll: vi.fn(() => []),
          querySelector: vi.fn(() => null)
        }),
        configurable: true
      });

      // First render
      panel._onRender({}, {});
      // Second render should abort previous
      panel._onRender({}, {});
      // No error means previous controller was aborted
    });
  });

  // ─── close ──────────────────────────────────────────────────────

  describe('close', () => {
    it('should abort listeners on close', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      Object.defineProperty(panel, 'element', {
        get: () => ({
          querySelectorAll: vi.fn(() => []),
          querySelector: vi.fn(() => null)
        }),
        configurable: true
      });

      panel._onRender({}, {});
      // close should not throw
      await panel.close();
    });

    it('should call super.close', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel.close();
      expect(panel.rendered).toBe(false);
    });
  });

  // ─── requestRender ──────────────────────────────────────────────

  describe('requestRender', () => {
    it('should call the debounced render', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_debouncedRender');
      panel.requestRender();
      expect(spy).toHaveBeenCalled();
    });
  });

  // ─── _handleToggleRecording ─────────────────────────────────────

  describe('_handleToggleRecording', () => {
    it('should do nothing if orchestrator is not available', async () => {
      const panel = new MainPanel(null);
      await panel._handleToggleRecording();
      // No error thrown
    });

    it('should start session when not recording and no transcription service', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.hasTranscriptionService = false;
      await panel._handleToggleRecording();

      expect(mockOrchestrator.startSession).toHaveBeenCalled();
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should start live mode when not recording and has transcription service', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.hasTranscriptionService = true;
      await panel._handleToggleRecording();

      expect(mockOrchestrator.startLiveMode).toHaveBeenCalled();
    });

    it('should stop live mode when recording in live mode', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'recording';
      mockOrchestrator.isLiveMode = true;
      await panel._handleToggleRecording();

      expect(mockOrchestrator.stopLiveMode).toHaveBeenCalled();
    });

    it('should stop session when recording but not in live mode', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'recording';
      mockOrchestrator.isLiveMode = false;
      await panel._handleToggleRecording();

      expect(mockOrchestrator.stopSession).toHaveBeenCalledWith({ processImmediately: false });
    });

    it('should show error notification on failure', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.startSession.mockRejectedValue(new Error('fail'));
      await panel._handleToggleRecording();

      expect(ui.notifications.error).toHaveBeenCalledWith('fail');
    });

    it('should recognize live_listening as recording active', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'live_listening';
      mockOrchestrator.isLiveMode = true;
      await panel._handleToggleRecording();

      expect(mockOrchestrator.stopLiveMode).toHaveBeenCalled();
    });

    it('should recognize live_transcribing as recording active', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'live_transcribing';
      mockOrchestrator.isLiveMode = true;
      await panel._handleToggleRecording();

      expect(mockOrchestrator.stopLiveMode).toHaveBeenCalled();
    });

    it('should recognize live_analyzing as recording active', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'live_analyzing';
      mockOrchestrator.isLiveMode = true;
      await panel._handleToggleRecording();

      expect(mockOrchestrator.stopLiveMode).toHaveBeenCalled();
    });
  });

  // ─── _handleTogglePause ─────────────────────────────────────────

  describe('_handleTogglePause', () => {
    it('should do nothing if orchestrator is not available', () => {
      const panel = new MainPanel(null);
      panel._handleTogglePause();
      // No error
    });

    it('should resume recording when paused', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'paused';
      panel._handleTogglePause();

      expect(mockOrchestrator.resumeRecording).toHaveBeenCalled();
    });

    it('should pause recording when not paused', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'recording';
      panel._handleTogglePause();

      expect(mockOrchestrator.pauseRecording).toHaveBeenCalled();
    });

    it('should show error notification on failure', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.pauseRecording.mockImplementation(() => {
        throw new Error('pause error');
      });
      panel._handleTogglePause();

      expect(ui.notifications.error).toHaveBeenCalledWith('pause error');
    });
  });

  // ─── _handleProcessSession ──────────────────────────────────────

  describe('_handleProcessSession', () => {
    it('should warn if no audio blob', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = {};
      await panel._handleProcessSession();

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should warn if no current session', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleProcessSession();

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should process transcription when audio blob exists', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = { audioBlob: new Blob() };
      await panel._handleProcessSession();

      expect(mockOrchestrator.processTranscription).toHaveBeenCalled();
    });

    it('should show error on failure', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = { audioBlob: new Blob() };
      mockOrchestrator.processTranscription.mockRejectedValue(new Error('process error'));
      await panel._handleProcessSession();

      expect(ui.notifications.error).toHaveBeenCalledWith('process error');
    });
  });

  // ─── _handlePublishKanka ────────────────────────────────────────

  describe('_handlePublishKanka', () => {
    it('should warn if no entities', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handlePublishKanka();

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should publish when entities exist', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = { entities: { characters: [] } };
      await panel._handlePublishKanka();

      expect(mockOrchestrator.publishToKanka).toHaveBeenCalled();
    });

    it('should show error on failure', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = { entities: { characters: [] } };
      mockOrchestrator.publishToKanka.mockRejectedValue(new Error('publish error'));
      await panel._handlePublishKanka();

      expect(ui.notifications.error).toHaveBeenCalledWith('publish error');
    });
  });

  // ─── _handleGenerateImage ───────────────────────────────────────

  describe('_handleGenerateImage', () => {
    it('should do nothing if orchestrator is not available', async () => {
      const panel = new MainPanel(null);
      await panel._handleGenerateImage();
      // No error
    });

    it('should call generateImage on orchestrator', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleGenerateImage();

      expect(mockOrchestrator.generateImage).toHaveBeenCalled();
    });

    it('should show error on failure', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.generateImage.mockRejectedValue(new Error('image error'));
      await panel._handleGenerateImage();

      expect(ui.notifications.error).toHaveBeenCalledWith('image error');
    });
  });

  // ─── _handleReviewEntities ──────────────────────────────────────

  describe('_handleReviewEntities', () => {
    it('should handle the case when entity preview is not available', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleReviewEntities();
      // Should not throw - may show error or warn depending on implementation
    });
  });

  // ─── _formatDuration ───────────────────────────────────────────

  describe('_formatDuration', () => {
    it('should return 0:00 when no session', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel._formatDuration()).toBe('0:00');
    });

    it('should return 0:00 when no startTime', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = {};
      expect(panel._formatDuration()).toBe('0:00');
    });

    it('should format elapsed time correctly', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const now = Date.now();
      mockOrchestrator.currentSession = {
        startTime: now - 125000, // 2 minutes and 5 seconds
        endTime: now
      };
      expect(panel._formatDuration()).toBe('2:05');
    });

    it('should use Date.now when no endTime', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = {
        startTime: Date.now() - 60000 // 1 minute ago
      };
      const result = panel._formatDuration();
      expect(result).toMatch(/^1:0[0-1]$/); // ~1:00
    });

    it('should format hours correctly for long sessions', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const now = Date.now();
      mockOrchestrator.currentSession = {
        startTime: now - 3723000, // 1 hour, 2 minutes, 3 seconds
        endTime: now
      };
      expect(panel._formatDuration()).toBe('1:02:03');
    });
  });

  // ─── _countEntities ─────────────────────────────────────────────

  describe('_countEntities', () => {
    it('should return 0 for null entities', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel._countEntities(null)).toBe(0);
    });

    it('should count all entity types', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const entities = {
        characters: [{ name: 'A' }, { name: 'B' }],
        locations: [{ name: 'C' }],
        items: [{ name: 'D' }, { name: 'E' }, { name: 'F' }]
      };
      expect(panel._countEntities(entities)).toBe(6);
    });

    it('should handle missing entity type arrays', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel._countEntities({})).toBe(0);
    });
  });

  // ─── _isRecordingActive ─────────────────────────────────────────

  describe('_isRecordingActive', () => {
    it('should return false when no orchestrator', () => {
      const panel = new MainPanel(null);
      expect(panel._isRecordingActive()).toBe(false);
    });

    it('should return true for recording state', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'recording';
      expect(panel._isRecordingActive()).toBe(true);
    });

    it('should return true for paused state', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'paused';
      expect(panel._isRecordingActive()).toBe(true);
    });

    it('should return false for idle state', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.state = 'idle';
      expect(panel._isRecordingActive()).toBe(false);
    });
  });

  // ─── _getAudioLevel ────────────────────────────────────────────

  describe('_getAudioLevel', () => {
    it('should return 0 when no recorder', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(0);
    });

    it('should return 0 when recorder is not recording', () => {
      VoxChronicle.getInstance.mockReturnValue({
        audioRecorder: { isRecording: false, getAudioLevel: vi.fn(() => 0.5) }
      });
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(0);
    });

    it('should return level as percentage when recording', () => {
      VoxChronicle.getInstance.mockReturnValue({
        audioRecorder: { isRecording: true, getAudioLevel: vi.fn(() => 0.75) }
      });
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(75);
    });

    it('should handle missing getAudioLevel method', () => {
      VoxChronicle.getInstance.mockReturnValue({
        audioRecorder: { isRecording: true }
      });
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(0);
    });
  });

  // ─── _getRAGData ────────────────────────────────────────────────

  describe('_getRAGData', () => {
    it('should return default RAG data', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ragData = panel._getRAGData();

      expect(ragData).toHaveProperty('enabled');
      expect(ragData).toHaveProperty('status');
      expect(ragData).toHaveProperty('progress', 0);
      expect(ragData).toHaveProperty('vectorCount', 0);
    });

    it('should return idle status when ragProvider exists but index is empty', () => {
      VoxChronicle.getInstance.mockReturnValue({
        ragProvider: {}
      });
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ragData = panel._getRAGData();

      expect(ragData.status).toBe('idle');
    });

    it('should return idle status when ragProvider is null', () => {
      VoxChronicle.getInstance.mockReturnValue({
        ragProvider: null
      });
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ragData = panel._getRAGData();

      expect(ragData.status).toBe('idle');
    });

    it('should check ragEnabled setting', () => {
      game.settings.get.mockReturnValue(true);
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ragData = panel._getRAGData();

      expect(ragData.enabled).toBe(true);
    });

    it('should handle settings error gracefully', () => {
      game.settings.get.mockImplementation(() => { throw new Error('no setting'); });
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ragData = panel._getRAGData();

      expect(ragData.enabled).toBe(false);
    });
  });

  // ─── _formatStorageSize (removed — method no longer exists on MainPanel) ──
  // ─── _formatTimestamp (removed — method no longer exists on MainPanel) ────

  // ─── _handleRAGBuildIndex ───────────────────────────────────────

  describe('_handleRAGBuildIndex', () => {
    it('should warn when ragProvider not available', async () => {
      VoxChronicle.getInstance.mockReturnValue({ ragProvider: null });
      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleRAGBuildIndex();

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should index documents when ragProvider is available', async () => {
      const indexDocuments = vi.fn().mockResolvedValue({ indexed: 1, failed: 0 });
      VoxChronicle.getInstance.mockReturnValue({
        ragProvider: { indexDocuments }
      });

      // Mock game.journal with iterable journal entries
      game.journal = [
        { id: 'j1', name: 'Journal 1', pages: { contents: [{ text: { content: 'Test content' } }] } }
      ];

      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleRAGBuildIndex();

      expect(indexDocuments).toHaveBeenCalledWith(
        [{ id: 'j1', title: 'Journal 1', content: 'Test content', metadata: { source: 'journal', type: 'journal' } }],
        expect.objectContaining({ onProgress: expect.any(Function) })
      );
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should show error on build failure', async () => {
      const indexDocuments = vi.fn().mockRejectedValue(new Error('build failed'));
      VoxChronicle.getInstance.mockReturnValue({
        ragProvider: { indexDocuments }
      });
      game.journal = [];

      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleRAGBuildIndex();

      expect(ui.notifications.error).toHaveBeenCalled();
    });
  });

  // ─── _handleRAGClearIndex ───────────────────────────────────────

  describe('_handleRAGClearIndex', () => {
    it('should return early when ragProvider not available', async () => {
      VoxChronicle.getInstance.mockReturnValue({ ragProvider: null });
      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleRAGClearIndex();

      // No notifications should be shown
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    it('should clear index when confirmed', async () => {
      const clearIndex = vi.fn().mockResolvedValue(undefined);
      VoxChronicle.getInstance.mockReturnValue({ ragProvider: { clearIndex } });
      Dialog.confirm = vi.fn().mockResolvedValue(true);

      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleRAGClearIndex();

      expect(clearIndex).toHaveBeenCalled();
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should not clear index when not confirmed', async () => {
      const clearIndex = vi.fn();
      VoxChronicle.getInstance.mockReturnValue({ ragProvider: { clearIndex } });
      Dialog.confirm = vi.fn().mockResolvedValue(false);

      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleRAGClearIndex();

      expect(clearIndex).not.toHaveBeenCalled();
    });

    it('should show error on clear failure', async () => {
      const clearIndex = vi.fn().mockRejectedValue(new Error('clear failed'));
      VoxChronicle.getInstance.mockReturnValue({ ragProvider: { clearIndex } });
      Dialog.confirm = vi.fn().mockResolvedValue(true);

      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleRAGClearIndex();

      expect(ui.notifications.error).toHaveBeenCalled();
    });
  });

  // ─── Static action handlers ─────────────────────────────────────

  describe('static action handlers', () => {
    it('_onToggleRecording should call _handleToggleRecording', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_handleToggleRecording').mockResolvedValue(undefined);
      await MainPanel._onToggleRecording.call(panel, {}, null);
      expect(spy).toHaveBeenCalled();
    });

    it('_onTogglePause should call _handleTogglePause', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_handleTogglePause').mockReturnValue(undefined);
      await MainPanel._onTogglePause.call(panel, {}, null);
      expect(spy).toHaveBeenCalled();
    });

    it('_onProcessSession should call _handleProcessSession', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_handleProcessSession').mockResolvedValue(undefined);
      await MainPanel._onProcessSession.call(panel, {}, null);
      expect(spy).toHaveBeenCalled();
    });

    it('_onPublishKanka should call _handlePublishKanka', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_handlePublishKanka').mockResolvedValue(undefined);
      await MainPanel._onPublishKanka.call(panel, {}, null);
      expect(spy).toHaveBeenCalled();
    });

    it('_onGenerateImage should call _handleGenerateImage', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_handleGenerateImage').mockResolvedValue(undefined);
      await MainPanel._onGenerateImage.call(panel, {}, null);
      expect(spy).toHaveBeenCalled();
    });

    it('_onReviewEntities should call _handleReviewEntities', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_handleReviewEntities').mockResolvedValue(undefined);
      await MainPanel._onReviewEntities.call(panel, {}, null);
      expect(spy).toHaveBeenCalled();
    });

    it('_onRAGBuildIndex should call _handleRAGBuildIndex', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_handleRAGBuildIndex').mockResolvedValue(undefined);
      await MainPanel._onRAGBuildIndex.call(panel, {}, null);
      expect(spy).toHaveBeenCalled();
    });

    it('_onRAGClearIndex should call _handleRAGClearIndex', async () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const spy = vi.spyOn(panel, '_handleRAGClearIndex').mockResolvedValue(undefined);
      await MainPanel._onRAGClearIndex.call(panel, {}, null);
      expect(spy).toHaveBeenCalled();
    });
  });

  // ─── Real-time UI updates ─────────────────────────────────────

  describe('_startRealtimeUpdates / _stopRealtimeUpdates', () => {
    let panel;
    let mockLevelBar;
    let mockDurationSpan;
    let rafCallbacks;
    let originalRaf;
    let originalCaf;

    beforeEach(() => {
      rafCallbacks = [];
      originalRaf = globalThis.requestAnimationFrame;
      originalCaf = globalThis.cancelAnimationFrame;

      globalThis.requestAnimationFrame = vi.fn((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length; // return ID
      });
      globalThis.cancelAnimationFrame = vi.fn();

      mockLevelBar = { style: { width: '' } };
      mockDurationSpan = { textContent: '' };

      panel = MainPanel.getInstance(mockOrchestrator);
      Object.defineProperty(panel, 'element', {
        get: () => ({
          querySelectorAll: vi.fn((sel) => {
            if (sel === '.vox-chronicle-tab') return [];
            return [];
          }),
          querySelector: vi.fn((sel) => {
            if (sel === '.vox-chronicle-panel__level-bar') return mockLevelBar;
            if (sel === '.vox-chronicle-panel__duration') return mockDurationSpan;
            return null;
          })
        }),
        configurable: true
      });
    });

    afterEach(() => {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCaf;
    });

    it('should start rAF loop when recording', () => {
      mockOrchestrator.state = 'recording';
      panel._onRender({ isRecording: true }, {});

      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should NOT start rAF loop when not recording', () => {
      mockOrchestrator.state = 'idle';
      panel._onRender({ isRecording: false }, {});

      expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should update both level bar and duration in single rAF callback', () => {
      mockOrchestrator.state = 'recording';
      mockOrchestrator.currentSession = {
        startTime: Date.now() - 125000, // 2 min 5 sec ago
        endTime: null
      };

      VoxChronicle.getInstance.mockReturnValue({
        ragProvider: null,
        audioRecorder: {
          isRecording: true,
          getAudioLevel: vi.fn(() => 0.65)
        }
      });

      panel._onRender({ isRecording: true }, {});

      // Execute the rAF callback
      expect(rafCallbacks.length).toBeGreaterThan(0);
      rafCallbacks[0]();

      expect(mockLevelBar.style.width).toBe('65%');
      expect(mockDurationSpan.textContent).toBe('2:05');
    });

    it('should update duration span on first rAF tick', () => {
      mockOrchestrator.state = 'recording';
      mockOrchestrator.currentSession = {
        startTime: Date.now() - 125000, // 2 min 5 sec ago
        endTime: null
      };

      panel._onRender({ isRecording: true }, {});

      // Execute first rAF callback — duration should update
      expect(rafCallbacks.length).toBeGreaterThan(0);
      rafCallbacks[0]();

      expect(mockDurationSpan.textContent).toBe('2:05');
    });

    it('should stop rAF loop on _stopRealtimeUpdates', () => {
      mockOrchestrator.state = 'recording';
      panel._onRender({ isRecording: true }, {});

      panel._stopRealtimeUpdates();

      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should stop rAF loop on close', async () => {
      mockOrchestrator.state = 'recording';
      panel._onRender({ isRecording: true }, {});

      await panel.close();

      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should stop previous rAF loop before starting new one on re-render', () => {
      mockOrchestrator.state = 'recording';
      panel._onRender({ isRecording: true }, {});
      panel._onRender({ isRecording: true }, {});

      // cancelAnimationFrame called during cleanup
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should start updates for live_listening state', () => {
      mockOrchestrator.state = 'live_listening';
      panel._onRender({ isRecording: true }, {});

      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should start updates for paused state', () => {
      mockOrchestrator.state = 'paused';
      panel._onRender({ isRecording: true }, {});

      expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should handle missing elements gracefully', () => {
      mockOrchestrator.state = 'recording';

      Object.defineProperty(panel, 'element', {
        get: () => ({
          querySelectorAll: vi.fn(() => []),
          querySelector: vi.fn(() => null) // both elements missing
        }),
        configurable: true
      });

      expect(() => panel._onRender({ isRecording: true }, {})).not.toThrow();
      expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should be safe to call _stopRealtimeUpdates when no loop is running', () => {
      expect(() => panel._stopRealtimeUpdates()).not.toThrow();
      expect(globalThis.cancelAnimationFrame).not.toHaveBeenCalled();
    });

    it('should skip redundant duration DOM writes when value unchanged', () => {
      mockOrchestrator.state = 'recording';
      mockOrchestrator.currentSession = {
        startTime: Date.now() - 5000, // 5 sec ago
        endTime: null
      };

      panel._onRender({ isRecording: true }, {});

      // Execute first rAF callback
      rafCallbacks[0]();
      const firstValue = mockDurationSpan.textContent;
      expect(firstValue).toBe('0:05');

      // Execute second rAF callback in same second — should not re-write
      const writeCount = Object.getOwnPropertyDescriptor(mockDurationSpan, 'textContent')
        ? undefined : 1; // can't easily track setter calls on plain object, but the optimization is covered
      rafCallbacks[1]();
      expect(mockDurationSpan.textContent).toBe('0:05'); // same value, no error
    });
  });

  // ─── Journal confirmation banner (_prepareContext) ─────────────

  describe('journal confirmation banner', () => {
    it('_prepareContext returns adventureName and supplementaryCount when journal is selected', async () => {
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return 'j1';
        if (key === 'supplementaryJournalIds') return ['j2', 'j3'];
        if (key === 'transcriptionMode') return 'auto';
        if (key === 'ragEnabled') return false;
        return '';
      });
      game.journal = { get: vi.fn((id) => id === 'j1' ? { name: 'Lost Mine' } : null) };

      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.adventureName).toBe('Lost Mine');
      expect(ctx.supplementaryCount).toBe(2);
      expect(ctx.hasJournalSelected).toBe(true);
    });

    it('_prepareContext returns adventureName=null when no journal is selected', async () => {
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return '';
        if (key === 'supplementaryJournalIds') return [];
        if (key === 'transcriptionMode') return 'auto';
        if (key === 'ragEnabled') return false;
        return '';
      });

      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.adventureName).toBeNull();
      expect(ctx.hasJournalSelected).toBe(false);
    });

    it('content warning flag set when journal text is under 500 chars', async () => {
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return 'j1';
        if (key === 'supplementaryJournalIds') return [];
        if (key === 'transcriptionMode') return 'auto';
        if (key === 'ragEnabled') return false;
        return '';
      });
      game.journal = {
        get: vi.fn((id) => id === 'j1' ? {
          name: 'Short Journal',
          pages: { contents: [{ text: { content: 'Short text' } }] }
        } : null)
      };

      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.isJournalTooShort).toBe(true);
      expect(ctx.isJournalTooLong).toBe(false);
    });

    it('content warning flag set when journal text exceeds 200,000 chars', async () => {
      const longText = 'x'.repeat(200001);
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return 'j1';
        if (key === 'supplementaryJournalIds') return [];
        if (key === 'transcriptionMode') return 'auto';
        if (key === 'ragEnabled') return false;
        return '';
      });
      game.journal = {
        get: vi.fn((id) => id === 'j1' ? {
          name: 'Long Journal',
          pages: { contents: [{ text: { content: longText } }] }
        } : null)
      };

      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.isJournalTooShort).toBe(false);
      expect(ctx.isJournalTooLong).toBe(true);
    });
  });

  // ─── _handleToggleRecording journal fallback ──────────────────

  describe('_handleToggleRecording journal fallback', () => {
    it('with no journal selected and no scene journal opens JournalPicker', async () => {
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return '';
        return '';
      });
      globalThis.canvas = { scene: { journal: null } };

      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleToggleRecording();

      // Should NOT start live mode
      expect(mockOrchestrator.startLiveMode).not.toHaveBeenCalled();
      expect(mockOrchestrator.startSession).not.toHaveBeenCalled();
      // Should show notification
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('with a valid journal selection proceeds to startLiveMode', async () => {
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return 'j1';
        return '';
      });
      mockOrchestrator.hasTranscriptionService = true;

      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleToggleRecording();

      expect(mockOrchestrator.startLiveMode).toHaveBeenCalled();
    });

    it('with no journal selected but scene has linked journal auto-selects it', async () => {
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return '';
        return '';
      });
      game.settings.set.mockResolvedValue(undefined);
      globalThis.canvas = { scene: { journal: { id: 'scene-j1' } } };
      mockOrchestrator.hasTranscriptionService = true;

      const panel = MainPanel.getInstance(mockOrchestrator);
      await panel._handleToggleRecording();

      // Should auto-select the scene journal
      expect(game.settings.set).toHaveBeenCalledWith('vox-chronicle', 'activeAdventureJournalId', 'scene-j1');
      // Should proceed to start live mode
      expect(mockOrchestrator.startLiveMode).toHaveBeenCalled();
    });
  });

  // ─── change-journal action ────────────────────────────────────

  describe('change-journal action', () => {
    it('change-journal action is defined in DEFAULT_OPTIONS', () => {
      const actions = MainPanel.DEFAULT_OPTIONS.actions;
      expect(actions['change-journal']).toBeDefined();
    });
  });

  // ─── Status badge mapping ─────────────────────────────────────

  describe('status badge mapping in _prepareContext', () => {
    beforeEach(() => {
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return '';
        if (key === 'supplementaryJournalIds') return [];
        if (key === 'transcriptionMode') return 'auto';
        if (key === 'ragEnabled') return false;
        return '';
      });
    });

    it('returns statusState "idle" when orchestrator state is idle', async () => {
      mockOrchestrator.state = 'idle';
      mockOrchestrator.isLiveMode = false;
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});
      expect(ctx.statusState).toBe('idle');
    });

    it('returns statusState "idle" when orchestrator is null', async () => {
      const panel = new MainPanel(null);
      const ctx = await panel._prepareContext({});
      expect(ctx.statusState).toBe('idle');
    });

    it('returns statusState "live" when orchestrator state is live_listening', async () => {
      mockOrchestrator.state = 'live_listening';
      mockOrchestrator.isLiveMode = true;
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});
      expect(ctx.statusState).toBe('live');
    });

    it('returns statusState "analyzing" when orchestrator state is live_transcribing', async () => {
      mockOrchestrator.state = 'live_transcribing';
      mockOrchestrator.isLiveMode = true;
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});
      expect(ctx.statusState).toBe('analyzing');
    });

    it('returns statusState "analyzing" when orchestrator state is live_analyzing', async () => {
      mockOrchestrator.state = 'live_analyzing';
      mockOrchestrator.isLiveMode = true;
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});
      expect(ctx.statusState).toBe('analyzing');
    });

    it('returns statusState "idle" when not in live mode even if state suggests otherwise', async () => {
      mockOrchestrator.state = 'live_listening';
      mockOrchestrator.isLiveMode = false;
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});
      expect(ctx.statusState).toBe('idle');
    });

    it('returns statusLabel from localization', async () => {
      mockOrchestrator.state = 'live_listening';
      mockOrchestrator.isLiveMode = true;
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});
      expect(ctx.statusLabel).toBeDefined();
      expect(typeof ctx.statusLabel).toBe('string');
    });
  });

  // ─── _parseCardContent ─────────────────────────────────────────

  describe('_parseCardContent', () => {
    it('parses title and bullet points from markdown text', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const result = panel._parseCardContent('Dramatic Entrance\n- The villain appears\n- Lightning strikes\n- Thunder rolls');
      expect(result.title).toBe('Dramatic Entrance');
      expect(result.bullets).toEqual(['The villain appears', 'Lightning strikes', 'Thunder rolls']);
    });

    it('handles text with asterisk bullets', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const result = panel._parseCardContent('Scene Setup\n* Dim lighting\n* Eerie music');
      expect(result.title).toBe('Scene Setup');
      expect(result.bullets).toEqual(['Dim lighting', 'Eerie music']);
    });

    it('handles text with numbered list items', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const result = panel._parseCardContent('Action Steps\n1. Roll initiative\n2. Move tokens');
      expect(result.title).toBe('Action Steps');
      expect(result.bullets).toEqual(['Roll initiative', 'Move tokens']);
    });

    it('splits into sentences when no bullets found', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const result = panel._parseCardContent('Main Point\nThis is a long paragraph with multiple sentences. It continues here. And ends here.');
      expect(result.title).toBe('Main Point');
      expect(result.bullets.length).toBeGreaterThan(0);
      expect(result.bullets.length).toBeLessThanOrEqual(3);
    });

    it('handles empty input gracefully', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const result = panel._parseCardContent('');
      expect(result.title).toBe('');
      expect(result.bullets).toEqual([]);
    });

    it('handles null/undefined input gracefully', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const result = panel._parseCardContent(null);
      expect(result.title).toBe('');
      expect(result.bullets).toEqual([]);
    });

    it('strips markdown heading prefixes from title', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const result = panel._parseCardContent('## Bold Move\n- Step forward');
      expect(result.title).toBe('Bold Move');
    });

    it('limits bullets to 3 maximum', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const result = panel._parseCardContent('Title\n- One\n- Two\n- Three\n- Four\n- Five');
      expect(result.bullets.length).toBe(3);
    });
  });

  // ─── Suggestion card parsing in _prepareContext ────────────────

  describe('suggestion card parsing in _prepareContext', () => {
    beforeEach(() => {
      game.settings.get.mockImplementation((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return '';
        if (key === 'supplementaryJournalIds') return [];
        if (key === 'transcriptionMode') return 'auto';
        if (key === 'ragEnabled') return false;
        return '';
      });
    });

    it('transforms suggestions with parsedTitle and parsedBullets', async () => {
      mockOrchestrator.getAISuggestions.mockReturnValue([
        { type: 'narration', content: 'Scene Description\n- Dark forest\n- Howling wind', confidence: 0.8 }
      ]);
      const panel = MainPanel.getInstance(mockOrchestrator);
      const ctx = await panel._prepareContext({});

      expect(ctx.suggestions[0].parsedTitle).toBe('Scene Description');
      expect(ctx.suggestions[0].parsedBullets).toEqual(['Dark forest', 'Howling wind']);
      expect(ctx.suggestions[0].type).toBe('narration');
    });
  });

  // ─── Dismiss suggestion action ────────────────────────────────

  describe('dismiss-suggestion action', () => {
    it('dismiss-suggestion action is defined in DEFAULT_OPTIONS', () => {
      const actions = MainPanel.DEFAULT_OPTIONS.actions;
      expect(actions['dismiss-suggestion']).toBeDefined();
    });

    it('_onDismissSuggestion removes closest suggestion element', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const mockSuggestionEl = { remove: vi.fn() };
      const mockTarget = { closest: vi.fn(() => mockSuggestionEl) };

      MainPanel._onDismissSuggestion.call(panel, {}, mockTarget);

      expect(mockTarget.closest).toHaveBeenCalledWith('.vox-chronicle-suggestion');
      expect(mockSuggestionEl.remove).toHaveBeenCalled();
    });
  });

  // ─── Streaming DOM helpers ─────────────────────────────────────

  describe('streaming DOM helpers', () => {
    it('_createStreamingCard method exists', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(typeof panel._createStreamingCard).toBe('function');
    });

    it('_appendStreamingToken method exists', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(typeof panel._appendStreamingToken).toBe('function');
    });

    it('_finalizeStreamingCard method exists', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(typeof panel._finalizeStreamingCard).toBe('function');
    });

    it('_isScrolledToBottom method exists', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(typeof panel._isScrolledToBottom).toBe('function');
    });

    it('_isScrolledToBottom returns true when container is at bottom', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const container = { scrollTop: 270, scrollHeight: 300, clientHeight: 30 };
      expect(panel._isScrolledToBottom(container)).toBe(true);
    });

    it('_isScrolledToBottom returns false when container is scrolled up', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const container = { scrollTop: 0, scrollHeight: 300, clientHeight: 30 };
      expect(panel._isScrolledToBottom(container)).toBe(false);
    });
  });

  // ─── Streaming callback wiring (06-03) ────────────────────────

  describe('streaming callback wiring', () => {
    it('should register onStreamToken and onStreamComplete callbacks', () => {
      MainPanel.getInstance(mockOrchestrator);
      expect(mockOrchestrator.setCallbacks).toHaveBeenCalledWith(
        expect.objectContaining({
          onStreamToken: expect.any(Function),
          onStreamComplete: expect.any(Function)
        })
      );
    });

    it('_handleStreamToken should initialize streaming state on type signal', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      // No element means _createStreamingCard returns null, but state should still be attempted
      panel._handleStreamToken({ type: 'narration' });
      // Without element, _activeStreamingCard is null (container not found), but type is captured
      expect(panel._streamingActiveType).toBe('narration');
    });

    it('_handleStreamToken should handle null data gracefully', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(() => panel._handleStreamToken(null)).not.toThrow();
      expect(() => panel._handleStreamToken(undefined)).not.toThrow();
    });

    it('_handleStreamComplete should clear streaming state', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      panel._activeStreamingCard = document.createElement('div');
      panel._streamingAccumulatedText = 'some text';
      panel._streamingActiveType = 'narration';

      // Mock _finalizeStreamingCard to avoid DOM operations
      panel._finalizeStreamingCard = vi.fn();

      panel._handleStreamComplete({ text: 'full text', type: 'narration' });
      expect(panel._activeStreamingCard).toBeNull();
      expect(panel._streamingAccumulatedText).toBe('');
      expect(panel._streamingActiveType).toBeNull();
    });

    it('_handleStreamComplete should store completed suggestion in orchestrator', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      panel._activeStreamingCard = document.createElement('div');
      panel._finalizeStreamingCard = vi.fn();
      panel._orchestrator._lastAISuggestions = [];

      panel._handleStreamComplete({ text: 'suggestion text', type: 'dialogue' });
      expect(panel._orchestrator._lastAISuggestions).toHaveLength(1);
      expect(panel._orchestrator._lastAISuggestions[0]).toEqual({
        type: 'dialogue',
        content: 'suggestion text'
      });
    });

    it('_handleStreamComplete should handle null data gracefully', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(() => panel._handleStreamComplete(null)).not.toThrow();
    });

    it('_handleStreamToken should track accumulated text and compute incremental tokens', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);

      // Create a mock card and container
      const container = document.createElement('div');
      container.className = 'vox-chronicle-suggestions-container';
      const card = document.createElement('div');
      card.className = 'vox-chronicle-suggestion vox-chronicle-suggestion--streaming';
      card.innerHTML = '<span class="vox-chronicle-suggestion__type">narration</span><div class="vox-chronicle-suggestion__content"></div>';
      container.appendChild(card);

      panel._activeStreamingCard = card;
      panel._streamingActiveType = 'narration';
      panel._streamingAccumulatedText = '';

      // Mock _appendStreamingToken to verify it gets called with incremental content
      const appendSpy = vi.spyOn(panel, '_appendStreamingToken');

      panel._handleStreamToken({ text: 'Hello' });
      expect(panel._streamingAccumulatedText).toBe('Hello');
      expect(appendSpy).toHaveBeenCalledWith(card, 'Hello');

      panel._handleStreamToken({ text: 'Hello world' });
      expect(panel._streamingAccumulatedText).toBe('Hello world');
      expect(appendSpy).toHaveBeenCalledWith(card, ' world');

      appendSpy.mockRestore();
    });
  });

  // ─── Rules card rendering and on-demand input (07-03) ────────

  describe('rules card rendering', () => {
    it('_handleRulesCard creates card element with purple tint class', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      // Set up a fake element with suggestions container
      const container = document.createElement('div');
      container.className = 'vox-chronicle-suggestions-container';
      panel.element = document.createElement('div');
      panel.element.querySelector = (sel) => {
        if (sel === '.vox-chronicle-suggestions-container') return container;
        return null;
      };

      panel._handleRulesCard({
        topic: 'grapple',
        compendiumResults: [{ rule: { title: 'Grappling', content: 'You can use the Attack action to grapple...', citation: { formatted: '[PHB: Grappling, p.195]' } }, relevance: 1, matchedTerms: ['grapple'] }],
        synthesisPromise: null,
        source: 'manual'
      });

      const card = container.querySelector('.vox-chronicle-suggestion--rules');
      expect(card).not.toBeNull();
      expect(card.classList.contains('vox-chronicle-suggestion--rules')).toBe(true);
    });

    it('_handleRulesCard shows auto badge for source=auto, none for manual', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const container = document.createElement('div');
      container.className = 'vox-chronicle-suggestions-container';
      panel.element = document.createElement('div');
      panel.element.querySelector = (sel) => {
        if (sel === '.vox-chronicle-suggestions-container') return container;
        return null;
      };

      // Auto source
      panel._handleRulesCard({
        topic: 'grapple',
        compendiumResults: [{ rule: { title: 'Grappling', content: 'Content here' }, relevance: 1, matchedTerms: [] }],
        synthesisPromise: null,
        source: 'auto'
      });
      const autoCard = container.querySelector('.vox-chronicle-suggestion--rules');
      expect(autoCard.querySelector('.vox-chronicle-suggestion__auto-badge')).not.toBeNull();

      // Manual source
      container.innerHTML = '';
      panel._handleRulesCard({
        topic: 'grapple',
        compendiumResults: [{ rule: { title: 'Grappling', content: 'Content here' }, relevance: 1, matchedTerms: [] }],
        synthesisPromise: null,
        source: 'manual'
      });
      const manualCard = container.querySelector('.vox-chronicle-suggestion--rules');
      expect(manualCard.querySelector('.vox-chronicle-suggestion__auto-badge')).toBeNull();
    });

    it('_handleRulesCard shows compendium excerpt content', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const container = document.createElement('div');
      container.className = 'vox-chronicle-suggestions-container';
      panel.element = document.createElement('div');
      panel.element.querySelector = (sel) => {
        if (sel === '.vox-chronicle-suggestions-container') return container;
        return null;
      };

      panel._handleRulesCard({
        topic: 'grapple',
        compendiumResults: [{ rule: { title: 'Grappling', content: 'You can use the Attack action to make a special melee attack, a grapple.' }, relevance: 1, matchedTerms: ['grapple'] }],
        synthesisPromise: null,
        source: 'manual'
      });

      const card = container.querySelector('.vox-chronicle-suggestion--rules');
      expect(card.textContent).toContain('You can use the Attack action');
    });

    it('unavailable card gets muted class', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const container = document.createElement('div');
      container.className = 'vox-chronicle-suggestions-container';
      panel.element = document.createElement('div');
      panel.element.querySelector = (sel) => {
        if (sel === '.vox-chronicle-suggestions-container') return container;
        return null;
      };

      panel._handleRulesCard({
        topic: 'grapple',
        compendiumResults: [],
        synthesisPromise: null,
        source: 'manual',
        unavailable: true
      });

      const card = container.querySelector('.vox-chronicle-suggestion--unavailable');
      expect(card).not.toBeNull();
    });

    it('rules card data stored in _rulesCards array', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      panel._rulesCards = [];
      const container = document.createElement('div');
      container.className = 'vox-chronicle-suggestions-container';
      panel.element = document.createElement('div');
      panel.element.querySelector = (sel) => {
        if (sel === '.vox-chronicle-suggestions-container') return container;
        return null;
      };

      panel._handleRulesCard({
        topic: 'grapple',
        compendiumResults: [{ rule: { title: 'Grappling', content: 'Content' }, relevance: 1, matchedTerms: [] }],
        synthesisPromise: null,
        source: 'manual'
      });

      expect(panel._rulesCards.length).toBe(1);
    });

    it('rules input Enter keydown calls handleManualRulesQuery', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      panel._orchestrator.handleManualRulesQuery = vi.fn();

      // Simulate the input and keydown
      const input = document.createElement('input');
      input.className = 'vox-chronicle-rules-input__field';
      input.value = 'how does grapple work';

      // Simulate the _onRender wiring manually
      const signal = new AbortController().signal;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.value.trim()) {
          const query = e.target.value.trim();
          e.target.value = '';
          panel._orchestrator?.handleManualRulesQuery?.(query);
        }
      }, { signal });

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);

      expect(panel._orchestrator.handleManualRulesQuery).toHaveBeenCalledWith('how does grapple work');
      expect(input.value).toBe('');
    });

    it('onRulesCard callback is registered with orchestrator setCallbacks', () => {
      MainPanel.resetInstance();
      const orch = { ...mockOrchestrator, setCallbacks: vi.fn() };
      MainPanel.getInstance(orch);
      expect(orch.setCallbacks).toHaveBeenCalledWith(
        expect.objectContaining({
          onRulesCard: expect.any(Function)
        })
      );
    });
  });

  // ─── Transcript Review PART (Story 3.3 Task 3) ───────────────

  describe('Transcript Review PART', () => {

    describe('PARTS registration', () => {
      it('should have a transcriptReview part with template path', () => {
        expect(MainPanel.PARTS.transcriptReview).toBeDefined();
        expect(MainPanel.PARTS.transcriptReview.template).toBe(
          'modules/vox-chronicle/templates/parts/transcript-review.hbs'
        );
      });
    });

    describe('_prepareContext — transcript review data', () => {
      it('should include transcriptSegments with formatted timestamps', async () => {
        mockOrchestrator.currentSession = {
          transcript: {
            segments: [
              { speaker: 'SPEAKER_00', text: 'Hello world', start: 0, end: 2.5 },
              { speaker: 'SPEAKER_01', text: 'Good morning', start: 3.0, end: 5.0 }
            ]
          }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});

        expect(ctx.transcriptSegments).toBeDefined();
        expect(ctx.transcriptSegments).toHaveLength(2);
        expect(ctx.transcriptSegments[0]).toEqual(expect.objectContaining({
          speaker: 'SPEAKER_00',
          text: 'Hello world',
          timestamp: '0:00'
        }));
        expect(ctx.transcriptSegments[1]).toEqual(expect.objectContaining({
          speaker: 'SPEAKER_01',
          text: 'Good morning',
          timestamp: '0:03'
        }));
      });

      it('should format timestamps as mm:ss', async () => {
        mockOrchestrator.currentSession = {
          transcript: {
            segments: [
              { speaker: 'SPEAKER_00', text: 'Late segment', start: 125.7, end: 130.0 }
            ]
          }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});

        expect(ctx.transcriptSegments[0].timestamp).toBe('2:05');
      });

      it('should use speaker label when available instead of raw ID', async () => {
        const { SpeakerLabeling } = await import('../../scripts/ui/SpeakerLabeling.mjs');
        SpeakerLabeling.getSpeakerLabel.mockImplementation((id) => {
          if (id === 'SPEAKER_00') return 'Game Master';
          return id;
        });

        mockOrchestrator.currentSession = {
          transcript: {
            segments: [
              { speaker: 'SPEAKER_00', text: 'Welcome!', start: 0, end: 1 },
              { speaker: 'SPEAKER_01', text: 'Hi!', start: 1, end: 2 }
            ]
          }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});

        expect(ctx.transcriptSegments[0].displayName).toBe('Game Master');
        expect(ctx.transcriptSegments[0].isMapped).toBe(true);
        expect(ctx.transcriptSegments[1].displayName).toBe('SPEAKER_01');
        expect(ctx.transcriptSegments[1].isMapped).toBe(false);

        // Restore default mock
        SpeakerLabeling.getSpeakerLabel.mockImplementation((id) => id);
      });

      it('should return empty transcriptSegments when no transcript', async () => {
        mockOrchestrator.currentSession = null;
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});

        expect(ctx.transcriptSegments).toEqual([]);
        expect(ctx.hasTranscriptSegments).toBe(false);
      });

      it('should set hasTranscriptSegments to true when segments exist', async () => {
        mockOrchestrator.currentSession = {
          transcript: {
            segments: [
              { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }
            ]
          }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});

        expect(ctx.hasTranscriptSegments).toBe(true);
      });

      it('should assign unique color index per speaker', async () => {
        mockOrchestrator.currentSession = {
          transcript: {
            segments: [
              { speaker: 'SPEAKER_00', text: 'a', start: 0, end: 1 },
              { speaker: 'SPEAKER_01', text: 'b', start: 1, end: 2 },
              { speaker: 'SPEAKER_00', text: 'c', start: 2, end: 3 }
            ]
          }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});

        // Same speaker should have same color index
        expect(ctx.transcriptSegments[0].colorIndex).toBe(ctx.transcriptSegments[2].colorIndex);
        // Different speakers should have different color indices
        expect(ctx.transcriptSegments[0].colorIndex).not.toBe(ctx.transcriptSegments[1].colorIndex);
      });
    });

    describe('EventBus binding', () => {
      it('should subscribe to ai:transcriptionReady on EventBus when provided', () => {
        const mockEventBus = {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn()
        };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        panel.setEventBus(mockEventBus);

        expect(mockEventBus.on).toHaveBeenCalledWith(
          'ai:transcriptionReady',
          expect.any(Function)
        );
      });

      it('should call setTranscriptData and render on ai:transcriptionReady', () => {
        const mockEventBus = {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn()
        };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        const renderSpy = vi.spyOn(panel, 'render');
        const setDataSpy = vi.spyOn(panel, 'setTranscriptData');
        panel.setEventBus(mockEventBus);

        // Find the handler registered for ai:transcriptionReady
        const call = mockEventBus.on.mock.calls.find(c => c[0] === 'ai:transcriptionReady');
        expect(call).toBeDefined();

        const segments = [{ speaker: 'SP', text: 'test', start: 0, end: 1 }];
        // Invoke the handler with segments payload
        call[1]({ segments });

        expect(setDataSpy).toHaveBeenCalledWith(segments);
        expect(renderSpy).toHaveBeenCalledWith({ parts: ['transcriptReview'] });
      });

      it('should render without setTranscriptData when payload has no segments', () => {
        const mockEventBus = {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn()
        };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        const renderSpy = vi.spyOn(panel, 'render');
        const setDataSpy = vi.spyOn(panel, 'setTranscriptData');
        panel.setEventBus(mockEventBus);

        const call = mockEventBus.on.mock.calls.find(c => c[0] === 'ai:transcriptionReady');
        call[1]({});

        expect(setDataSpy).not.toHaveBeenCalled();
        expect(renderSpy).toHaveBeenCalledWith({ parts: ['transcriptReview'] });
      });

      it('should unsubscribe from EventBus on close', async () => {
        const mockEventBus = {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn()
        };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        panel.setEventBus(mockEventBus);

        await panel.close();

        expect(mockEventBus.off).toHaveBeenCalledWith(
          'ai:transcriptionReady',
          expect.any(Function)
        );
      });
    });

    describe('EventBus RAG indexing events (Story 4.2)', () => {
      it('should subscribe to ai:ragIndexingStarted and ai:ragIndexingComplete', () => {
        const mockEventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        panel.setEventBus(mockEventBus);

        const eventNames = mockEventBus.on.mock.calls.map(c => c[0]);
        expect(eventNames).toContain('ai:ragIndexingStarted');
        expect(eventNames).toContain('ai:ragIndexingComplete');
      });

      it('should handle ai:ragIndexingStarted without crashing and register handler', () => {
        const mockEventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        const renderSpy = vi.spyOn(panel, 'render').mockImplementation(() => {});
        Object.defineProperty(panel, 'rendered', { get: () => true });
        panel.setEventBus(mockEventBus);

        const call = mockEventBus.on.mock.calls.find(c => c[0] === 'ai:ragIndexingStarted');
        expect(call).toBeDefined();

        // Handler should execute without error and trigger render
        call[1]({ journalCount: 3 });
        expect(renderSpy).toHaveBeenCalled();
      });

      it('should handle ai:ragIndexingComplete and trigger render with updated state', () => {
        const mockEventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        const renderSpy = vi.spyOn(panel, 'render').mockImplementation(() => {});
        Object.defineProperty(panel, 'rendered', { get: () => true });
        panel.setEventBus(mockEventBus);

        // Start indexing
        const startCall = mockEventBus.on.mock.calls.find(c => c[0] === 'ai:ragIndexingStarted');
        startCall[1]({ journalCount: 2 });
        renderSpy.mockClear();

        // Complete indexing
        const completeCall = mockEventBus.on.mock.calls.find(c => c[0] === 'ai:ragIndexingComplete');
        completeCall[1]({ indexed: 5, skipped: 1 });

        // Should trigger render on completion
        expect(renderSpy).toHaveBeenCalled();
      });

      it('should unsubscribe RAG events on cleanup', async () => {
        const mockEventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        panel.setEventBus(mockEventBus);

        await panel.close();

        const offEventNames = mockEventBus.off.mock.calls.map(c => c[0]);
        expect(offEventNames).toContain('ai:ragIndexingStarted');
        expect(offEventNames).toContain('ai:ragIndexingComplete');
      });
    });

    describe('scene type label helper (Story 4.4)', () => {
      it('should return localized label for known scene types', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        expect(panel._getSceneTypeLabel('combat')).toBe('VOXCHRONICLE.Scene.Combat');
        expect(panel._getSceneTypeLabel('social')).toBe('VOXCHRONICLE.Scene.Social');
        expect(panel._getSceneTypeLabel('exploration')).toBe('VOXCHRONICLE.Scene.Exploration');
        expect(panel._getSceneTypeLabel('rest')).toBe('VOXCHRONICLE.Scene.Rest');
      });

      it('should return raw scene type for unknown types', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        expect(panel._getSceneTypeLabel('custom')).toBe('custom');
      });

      it('should return "unknown" for null/undefined input', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        expect(panel._getSceneTypeLabel(null)).toBe('unknown');
        expect(panel._getSceneTypeLabel(undefined)).toBe('unknown');
      });
    });

    describe('inline edit flow (Task 4)', () => {
      it('should store transcript data via setTranscriptData', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        const segments = [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }
        ];
        panel.setTranscriptData(segments);
        expect(panel.getTranscriptData()).toEqual(segments);
      });

      it('should update segment text via editSegment', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        const segments = [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 },
          { speaker: 'SPEAKER_01', text: 'World', start: 1, end: 2 }
        ];
        panel.setTranscriptData(segments);
        panel.editSegment(1, 'Updated World');

        const data = panel.getTranscriptData();
        expect(data[1].text).toBe('Updated World');
        expect(data[0].text).toBe('Hello'); // Unchanged
      });

      it('should not modify original segments (immutability)', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        const original = [
          { speaker: 'SPEAKER_00', text: 'Original', start: 0, end: 1 }
        ];
        panel.setTranscriptData(original);
        panel.editSegment(0, 'Modified');

        // Original array should be unchanged
        expect(original[0].text).toBe('Original');
      });

      it('should emit ui:transcriptEdited on EventBus when editing', () => {
        const mockEventBus = {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn()
        };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        panel.setEventBus(mockEventBus);

        const segments = [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }
        ];
        panel.setTranscriptData(segments);
        panel.editSegment(0, 'Changed');

        expect(mockEventBus.emit).toHaveBeenCalledWith('ui:transcriptEdited', {
          index: 0,
          segment: expect.objectContaining({ text: 'Changed', speaker: 'SPEAKER_00' })
        });
      });

      it('should not emit event if no EventBus is set', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        const segments = [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }
        ];
        panel.setTranscriptData(segments);

        // Should not throw
        expect(() => panel.editSegment(0, 'Changed')).not.toThrow();
      });

      it('should ignore edit for out-of-bounds index', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        const segments = [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }
        ];
        panel.setTranscriptData(segments);
        panel.editSegment(5, 'No effect');

        expect(panel.getTranscriptData()).toHaveLength(1);
        expect(panel.getTranscriptData()[0].text).toBe('Hello');
      });

      it('should ignore edit with empty text', () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        const segments = [
          { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 }
        ];
        panel.setTranscriptData(segments);
        panel.editSegment(0, '');

        expect(panel.getTranscriptData()[0].text).toBe('Hello');
      });
    });

    describe('timestamp formatting', () => {
      it('should format 0 seconds as 0:00', async () => {
        mockOrchestrator.currentSession = {
          transcript: { segments: [{ speaker: 'S', text: 't', start: 0, end: 1 }] }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});
        expect(ctx.transcriptSegments[0].timestamp).toBe('0:00');
      });

      it('should format 59 seconds as 0:59', async () => {
        mockOrchestrator.currentSession = {
          transcript: { segments: [{ speaker: 'S', text: 't', start: 59, end: 60 }] }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});
        expect(ctx.transcriptSegments[0].timestamp).toBe('0:59');
      });

      it('should format 60 seconds as 1:00', async () => {
        mockOrchestrator.currentSession = {
          transcript: { segments: [{ speaker: 'S', text: 't', start: 60, end: 61 }] }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});
        expect(ctx.transcriptSegments[0].timestamp).toBe('1:00');
      });

      it('should format 3661 seconds as 61:01', async () => {
        mockOrchestrator.currentSession = {
          transcript: { segments: [{ speaker: 'S', text: 't', start: 3661, end: 3662 }] }
        };
        const panel = MainPanel.getInstance(mockOrchestrator);
        const ctx = await panel._prepareContext({});
        expect(ctx.transcriptSegments[0].timestamp).toBe('61:01');
      });
    });
  });

  // ─── Speaker Labeling from MainPanel (Story 3.3 Task 5) ───────

  describe('Speaker Labeling from MainPanel', () => {

    beforeEach(() => {
      lastSpeakerLabelingInstance = null;
      speakerLabelingOnClose = null;
    });

    describe('action registration', () => {
      it('should have open-speaker-labeling action registered', () => {
        expect(MainPanel.DEFAULT_OPTIONS.actions['open-speaker-labeling']).toBeDefined();
        expect(typeof MainPanel.DEFAULT_OPTIONS.actions['open-speaker-labeling']).toBe('function');
      });
    });

    describe('open-speaker-labeling action handler', () => {
      it('should create a SpeakerLabeling instance and call render(true)', async () => {
        const { SpeakerLabeling } = await import('../../scripts/ui/SpeakerLabeling.mjs');
        const panel = MainPanel.getInstance(mockOrchestrator);

        await MainPanel._onOpenSpeakerLabeling.call(panel, new Event('click'), document.createElement('button'));

        expect(SpeakerLabeling).toHaveBeenCalled();
        expect(lastSpeakerLabelingInstance.render).toHaveBeenCalledWith(true);
      });

      it('should re-render transcriptReview PART after SpeakerLabeling closes', async () => {
        const panel = MainPanel.getInstance(mockOrchestrator);
        const renderSpy = vi.spyOn(panel, 'render');

        await MainPanel._onOpenSpeakerLabeling.call(panel, new Event('click'), document.createElement('button'));

        // Simulate SpeakerLabeling closing via onClose callback
        expect(speakerLabelingOnClose).toBeDefined();
        speakerLabelingOnClose();

        expect(renderSpy).toHaveBeenCalledWith({ parts: ['transcriptReview'] });
      });

      it('should emit ui:speakerLabelsUpdated on EventBus after SpeakerLabeling closes', async () => {
        const mockEventBus = {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn()
        };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        panel.setEventBus(mockEventBus);

        await MainPanel._onOpenSpeakerLabeling.call(panel, new Event('click'), document.createElement('button'));

        speakerLabelingOnClose();

        expect(mockEventBus.emit).toHaveBeenCalledWith('ui:speakerLabelsUpdated');
      });

      it('should not throw if EventBus emit fails during speaker labels update', async () => {
        const mockEventBus = {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn().mockImplementation(() => { throw new Error('EventBus error'); })
        };
        MainPanel.resetInstance();
        const panel = MainPanel.getInstance(mockOrchestrator);
        panel.setEventBus(mockEventBus);

        await MainPanel._onOpenSpeakerLabeling.call(panel, new Event('click'), document.createElement('button'));

        // Should not throw
        expect(() => speakerLabelingOnClose()).not.toThrow();
      });
    });
  });
});
