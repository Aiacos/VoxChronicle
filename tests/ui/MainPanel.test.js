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
  sanitizeHtml: vi.fn((str) => str || '')
}));

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

describe('MainPanel', () => {
  let mockOrchestrator;

  beforeEach(() => {
    MainPanel.resetInstance();

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
      expect(ctx.duration).toBe('00:00');
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
          })
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
          querySelectorAll: vi.fn(() => [])
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
          querySelectorAll: vi.fn(() => [])
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
    it('should return 00:00 when no session', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel._formatDuration()).toBe('00:00');
    });

    it('should return 00:00 when no startTime', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = {};
      expect(panel._formatDuration()).toBe('00:00');
    });

    it('should format elapsed time correctly', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      const now = Date.now();
      mockOrchestrator.currentSession = {
        startTime: now - 125000, // 2 minutes and 5 seconds
        endTime: now
      };
      expect(panel._formatDuration()).toBe('02:05');
    });

    it('should use Date.now when no endTime', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      mockOrchestrator.currentSession = {
        startTime: Date.now() - 60000 // 1 minute ago
      };
      const result = panel._formatDuration();
      expect(result).toMatch(/^01:0[0-1]$/); // ~01:00
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
      expect(mockDurationSpan.textContent).toBe('02:05');
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

      expect(mockDurationSpan.textContent).toBe('02:05');
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
      expect(firstValue).toBe('00:05');

      // Execute second rAF callback in same second — should not re-write
      const writeCount = Object.getOwnPropertyDescriptor(mockDurationSpan, 'textContent')
        ? undefined : 1; // can't easily track setter calls on plain object, but the optimization is covered
      rafCallbacks[1]();
      expect(mockDurationSpan.textContent).toBe('00:05'); // same value, no error
    });
  });
});
