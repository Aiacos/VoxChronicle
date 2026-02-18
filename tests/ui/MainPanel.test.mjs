/**
 * MainPanel Unit Tests
 *
 * Tests for the MainPanel unified UI component.
 * Covers singleton management, tab switching, template data,
 * duration formatting, entity counting, render lifecycle,
 * action handlers, recording states, audio level, and RAG data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockApplicationV2, createMockHandlebarsApplicationMixin, createMockFoundryUtils } from '../helpers/foundry-mock.js';

// Set up Foundry globals BEFORE importing MainPanel (which extends ApplicationV2)
// Source code destructures from foundry.applications.api at module level
const _MockAppV2 = createMockApplicationV2();
const _MockHAM = createMockHandlebarsApplicationMixin();
globalThis.ApplicationV2 = _MockAppV2;
globalThis.HandlebarsApplicationMixin = _MockHAM;
globalThis.foundry = {
  utils: createMockFoundryUtils(),
  applications: { api: { ApplicationV2: _MockAppV2, HandlebarsApplicationMixin: _MockHAM } }
};

// Mock VoxChronicle singleton (used by _getRAGData, _getAudioLevel, _handleRAGBuildIndex)
let mockVoxChronicleInstance = {};
vi.mock('../../scripts/core/VoxChronicle.mjs', () => ({
  VoxChronicle: {
    getInstance: () => mockVoxChronicleInstance
  }
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}));

vi.mock('../../scripts/utils/DomUtils.mjs', () => ({
  debounce: (fn) => fn
}));

// Set up game globals for settings access
globalThis.game = {
  settings: {
    get: vi.fn((module, key) => {
      if (key === 'ragEnabled') return false;
      if (key === 'ragIndexMetadata') return {};
      return null;
    }),
    set: vi.fn().mockResolvedValue(undefined)
  },
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key) => key)
  },
  journal: [],
  packs: []
};

globalThis.ui = {
  notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
};

const { MainPanel } = await import('../../scripts/ui/MainPanel.mjs');

/**
 * Create a mock orchestrator with optional overrides
 * @param {object} overrides - Properties to override on the mock
 * @returns {object} Mock orchestrator
 */
function createMockOrchestrator(overrides = {}) {
  return {
    currentSession: null,
    isRecording: false,
    state: 'idle',
    getCurrentChapter: vi.fn().mockReturnValue(null),
    getAISuggestions: vi.fn().mockReturnValue([]),
    getOffTrackStatus: vi.fn().mockReturnValue(null),
    ...overrides
  };
}

describe('MainPanel', () => {
  let mockOrchestrator;

  beforeEach(() => {
    MainPanel.resetInstance();
    mockOrchestrator = createMockOrchestrator();
    mockVoxChronicleInstance = {
      audioRecorder: null,
      ragRetriever: null,
      ragVectorStore: null
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    MainPanel.resetInstance();
  });

  describe('singleton', () => {
    it('should create instance via getInstance', () => {
      const panel = MainPanel.getInstance(mockOrchestrator);
      expect(panel).toBeInstanceOf(MainPanel);
    });

    it('should return same instance on subsequent calls', () => {
      const p1 = MainPanel.getInstance(mockOrchestrator);
      const p2 = MainPanel.getInstance(mockOrchestrator);
      expect(p1).toBe(p2);
    });

    it('should reset instance', () => {
      const p1 = MainPanel.getInstance(mockOrchestrator);
      MainPanel.resetInstance();
      const p2 = MainPanel.getInstance(mockOrchestrator);
      expect(p1).not.toBe(p2);
    });
  });

  describe('constructor', () => {
    it('should set default active tab to live', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel.activeTab).toBe('live');
    });

    it('should store orchestrator reference', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._orchestrator).toBe(mockOrchestrator);
    });

    it('should not be rendered initially', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel.isRendered).toBe(false);
    });
  });

  describe('DEFAULT_OPTIONS', () => {
    it('should have correct default options', () => {
      const opts = MainPanel.DEFAULT_OPTIONS;
      expect(opts.id).toBe('vox-chronicle-main-panel');
      expect(opts.position.width).toBe(420);
      expect(opts.position.height).toBe(600);
      expect(opts.window.title).toBe('VoxChronicle');
    });

    it('should have all action handlers registered', () => {
      const actions = MainPanel.DEFAULT_OPTIONS.actions;
      expect(actions['toggle-recording']).toBe(MainPanel._onToggleRecording);
      expect(actions['toggle-pause']).toBe(MainPanel._onTogglePause);
      expect(actions['process-session']).toBe(MainPanel._onProcessSession);
      expect(actions['publish-kanka']).toBe(MainPanel._onPublishKanka);
      expect(actions['generate-image']).toBe(MainPanel._onGenerateImage);
      expect(actions['review-entities']).toBe(MainPanel._onReviewEntities);
      expect(actions['rag-build-index']).toBe(MainPanel._onRAGBuildIndex);
      expect(actions['rag-clear-index']).toBe(MainPanel._onRAGClearIndex);
    });
  });

  describe('PARTS', () => {
    it('should define main template part', () => {
      expect(MainPanel.PARTS.main.template).toContain('main-panel.hbs');
    });
  });

  describe('switchTab', () => {
    it('should switch to valid tab', () => {
      const panel = new MainPanel(mockOrchestrator);
      panel.switchTab('chronicle');
      expect(panel.activeTab).toBe('chronicle');
    });

    it('should switch to all valid tabs', () => {
      const panel = new MainPanel(mockOrchestrator);
      const tabs = ['live', 'chronicle', 'images', 'transcript', 'entities', 'analytics'];
      for (const tab of tabs) {
        panel.switchTab(tab);
        expect(panel.activeTab).toBe(tab);
      }
    });

    it('should ignore invalid tab', () => {
      const panel = new MainPanel(mockOrchestrator);
      panel.switchTab('chronicle');
      panel.switchTab('invalid-tab');
      expect(panel.activeTab).toBe('chronicle');
    });
  });

  describe('_prepareContext', () => {
    it('should return default data when no session', async () => {
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.activeTab).toBe('live');
      expect(data.isRecording).toBe(false);
      expect(data.isPaused).toBe(false);
      expect(data.isProcessing).toBe(false);
      expect(data.duration).toBe('00:00');
      expect(data.segments).toEqual([]);
      expect(data.hasTranscript).toBe(false);
      expect(data.entities).toBeNull();
      expect(data.entityCount).toBe(0);
      expect(data.images).toEqual([]);
    });

    it('should return recording state', async () => {
      mockOrchestrator.state = 'recording';
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.isRecording).toBe(true);
    });

    it('should return recording state for live mode', async () => {
      mockOrchestrator.state = 'live_listening';
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.isRecording).toBe(true);
    });

    it('should return paused state', async () => {
      mockOrchestrator.state = 'paused';
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.isPaused).toBe(true);
    });

    it('should return entities count', async () => {
      mockOrchestrator.currentSession = {
        entities: {
          characters: [{ name: 'A' }, { name: 'B' }],
          locations: [{ name: 'L1' }],
          items: []
        }
      };
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.entityCount).toBe(3);
      expect(data.hasEntities).toBe(true);
    });

    it('should return transcript segments', async () => {
      mockOrchestrator.currentSession = {
        transcript: {
          segments: [
            { speaker: 'A', text: 'Hello' },
            { speaker: 'B', text: 'World' }
          ]
        }
      };
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.segments).toHaveLength(2);
      expect(data.hasTranscript).toBe(true);
    });

    it('should return current chapter with title property (not name)', async () => {
      mockOrchestrator.getCurrentChapter.mockReturnValue({
        id: 'c1',
        title: 'The Tavern',
        path: 'Act I > The Tavern',
        pageId: 'p1',
        pageName: 'Chapter 1'
      });
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.currentChapter.title).toBe('The Tavern');
      expect(data.currentChapter.path).toBe('Act I > The Tavern');
    });

    it('should return null chapter when tracker has none', async () => {
      mockOrchestrator.getCurrentChapter.mockReturnValue(null);
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.currentChapter).toBeNull();
    });

    it('should return AI suggestions with content property', async () => {
      mockOrchestrator.getAISuggestions.mockReturnValue([
        { type: 'narration', content: 'The shadows deepen', confidence: 0.8 },
        { type: 'dialogue', content: 'Welcome, travelers!', confidence: 0.7 }
      ]);
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.suggestions).toHaveLength(2);
      expect(data.suggestions[0].content).toBe('The shadows deepen');
      expect(data.suggestions[1].content).toBe('Welcome, travelers!');
    });

    it('should return empty suggestions when none available', async () => {
      mockOrchestrator.getAISuggestions.mockReturnValue([]);
      const panel = new MainPanel(mockOrchestrator);
      const data = await panel._prepareContext();
      expect(data.suggestions).toEqual([]);
    });
  });

  describe('render', () => {
    it('should mark as rendered', () => {
      const panel = new MainPanel(mockOrchestrator);
      panel.render();
      expect(panel.isRendered).toBe(true);
    });
  });

  describe('close', () => {
    it('should mark as not rendered', async () => {
      const panel = new MainPanel(mockOrchestrator);
      panel.render();
      await panel.close();
      expect(panel.isRendered).toBe(false);
    });
  });

  describe('_formatDuration', () => {
    it('should return 00:00 when no session', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._formatDuration()).toBe('00:00');
    });

    it('should format duration correctly', () => {
      const now = Date.now();
      mockOrchestrator.currentSession = {
        startTime: now - 125000,
        endTime: now
      };
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._formatDuration()).toBe('02:05');
    });
  });

  describe('_countEntities', () => {
    it('should return 0 for null entities', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._countEntities(null)).toBe(0);
    });

    it('should count all entity types', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._countEntities({
        characters: [1, 2],
        locations: [3],
        items: [4, 5, 6]
      })).toBe(6);
    });

    it('should handle missing arrays', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._countEntities({ characters: [1] })).toBe(1);
    });
  });

  describe('requestRender', () => {
    it('should call debounced render', () => {
      const panel = new MainPanel(mockOrchestrator);
      panel.requestRender();
      expect(panel.isRendered).toBe(true);
    });
  });

  // =========================================================================
  // _isRecordingActive - all states
  // =========================================================================

  describe('_isRecordingActive', () => {
    it('should return false when no orchestrator', () => {
      const panel = new MainPanel(null);
      expect(panel._isRecordingActive()).toBe(false);
    });

    it('should return true for recording state', () => {
      mockOrchestrator.state = 'recording';
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._isRecordingActive()).toBe(true);
    });

    it('should return true for paused state', () => {
      mockOrchestrator.state = 'paused';
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._isRecordingActive()).toBe(true);
    });

    it('should return true for live_listening state', () => {
      mockOrchestrator.state = 'live_listening';
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._isRecordingActive()).toBe(true);
    });

    it('should return true for live_transcribing state', () => {
      mockOrchestrator.state = 'live_transcribing';
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._isRecordingActive()).toBe(true);
    });

    it('should return true for live_analyzing state', () => {
      mockOrchestrator.state = 'live_analyzing';
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._isRecordingActive()).toBe(true);
    });

    it('should return false for idle state', () => {
      mockOrchestrator.state = 'idle';
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._isRecordingActive()).toBe(false);
    });

    it('should return false for processing state', () => {
      mockOrchestrator.state = 'processing';
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._isRecordingActive()).toBe(false);
    });

    it('should return false for error state', () => {
      mockOrchestrator.state = 'error';
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._isRecordingActive()).toBe(false);
    });
  });

  // =========================================================================
  // _getAudioLevel
  // =========================================================================

  describe('_getAudioLevel', () => {
    it('should return 0 when no audio recorder', () => {
      mockVoxChronicleInstance.audioRecorder = null;
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(0);
    });

    it('should return 0 when recorder is not recording', () => {
      mockVoxChronicleInstance.audioRecorder = {
        isRecording: false,
        getAudioLevel: vi.fn().mockReturnValue(0.5)
      };
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(0);
    });

    it('should convert 0.0-1.0 level to 0-100 percentage', () => {
      mockVoxChronicleInstance.audioRecorder = {
        isRecording: true,
        getAudioLevel: vi.fn().mockReturnValue(0.75)
      };
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(75);
    });

    it('should return 0 for silent audio', () => {
      mockVoxChronicleInstance.audioRecorder = {
        isRecording: true,
        getAudioLevel: vi.fn().mockReturnValue(0)
      };
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(0);
    });

    it('should return 100 for maximum level', () => {
      mockVoxChronicleInstance.audioRecorder = {
        isRecording: true,
        getAudioLevel: vi.fn().mockReturnValue(1.0)
      };
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(100);
    });

    it('should handle missing getAudioLevel method', () => {
      mockVoxChronicleInstance.audioRecorder = {
        isRecording: true
        // getAudioLevel not present
      };
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._getAudioLevel()).toBe(0);
    });
  });

  // =========================================================================
  // _getRAGData
  // =========================================================================

  describe('_getRAGData', () => {
    it('should return defaults when RAG services are null', () => {
      const panel = new MainPanel(mockOrchestrator);
      const ragData = panel._getRAGData();
      expect(ragData.enabled).toBe(false);
      expect(ragData.status).toBe('idle');
      expect(ragData.vectorCount).toBe(0);
      expect(ragData.storageUsage).toBe('0 KB');
      expect(ragData.lastIndexed).toBeNull();
    });

    it('should return indexed status when vectors exist', () => {
      mockVoxChronicleInstance.ragRetriever = {
        getIndexStatus: vi.fn().mockReturnValue({
          isIndexing: false,
          vectorCount: 150,
          progress: 0,
          progressText: ''
        })
      };
      mockVoxChronicleInstance.ragVectorStore = {
        getStats: vi.fn().mockReturnValue({
          vectorCount: 150,
          estimatedSizeBytes: 1024 * 100 // 100 KB
        })
      };

      const panel = new MainPanel(mockOrchestrator);
      const ragData = panel._getRAGData();
      expect(ragData.status).toBe('indexed');
      expect(ragData.vectorCount).toBe(150);
      expect(ragData.storageUsage).toContain('KB');
    });

    it('should return indexing status when building index', () => {
      mockVoxChronicleInstance.ragRetriever = {
        getIndexStatus: vi.fn().mockReturnValue({
          isIndexing: true,
          vectorCount: 50,
          progress: 45,
          progressText: 'Indexing journals...'
        })
      };

      const panel = new MainPanel(mockOrchestrator);
      const ragData = panel._getRAGData();
      expect(ragData.status).toBe('indexing');
      expect(ragData.progress).toBe(45);
      expect(ragData.progressText).toBe('Indexing journals...');
    });

    it('should read ragEnabled from settings', () => {
      game.settings.get.mockImplementation((module, key) => {
        if (key === 'ragEnabled') return true;
        return null;
      });

      const panel = new MainPanel(mockOrchestrator);
      const ragData = panel._getRAGData();
      expect(ragData.enabled).toBe(true);
    });
  });

  // =========================================================================
  // _formatStorageSize
  // =========================================================================

  describe('_formatStorageSize', () => {
    it('should return 0 KB for zero bytes', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._formatStorageSize(0)).toBe('0 KB');
    });

    it('should format bytes', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._formatStorageSize(500)).toBe('500.0 B');
    });

    it('should format kilobytes', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._formatStorageSize(1024 * 50)).toContain('KB');
    });

    it('should format megabytes', () => {
      const panel = new MainPanel(mockOrchestrator);
      expect(panel._formatStorageSize(1024 * 1024 * 2.5)).toContain('MB');
    });
  });

  // =========================================================================
  // Static action handler dispatch
  // =========================================================================

  describe('static action handlers', () => {
    it('should dispatch toggle-recording to instance method', async () => {
      const panel = new MainPanel(mockOrchestrator);
      panel._handleToggleRecording = vi.fn();
      await MainPanel._onToggleRecording.call(panel, {}, null);
      expect(panel._handleToggleRecording).toHaveBeenCalled();
    });

    it('should dispatch toggle-pause to instance method', async () => {
      const panel = new MainPanel(mockOrchestrator);
      panel._handleTogglePause = vi.fn();
      await MainPanel._onTogglePause.call(panel, {}, null);
      expect(panel._handleTogglePause).toHaveBeenCalled();
    });

    it('should dispatch process-session to instance method', async () => {
      const panel = new MainPanel(mockOrchestrator);
      panel._handleProcessSession = vi.fn();
      await MainPanel._onProcessSession.call(panel, {}, null);
      expect(panel._handleProcessSession).toHaveBeenCalled();
    });

    it('should dispatch publish-kanka to instance method', async () => {
      const panel = new MainPanel(mockOrchestrator);
      panel._handlePublishKanka = vi.fn();
      await MainPanel._onPublishKanka.call(panel, {}, null);
      expect(panel._handlePublishKanka).toHaveBeenCalled();
    });

    it('should dispatch generate-image to instance method', async () => {
      const panel = new MainPanel(mockOrchestrator);
      panel._handleGenerateImage = vi.fn();
      await MainPanel._onGenerateImage.call(panel, {}, null);
      expect(panel._handleGenerateImage).toHaveBeenCalled();
    });

    it('should dispatch rag-build-index to instance method', async () => {
      const panel = new MainPanel(mockOrchestrator);
      panel._handleRAGBuildIndex = vi.fn();
      await MainPanel._onRAGBuildIndex.call(panel, {}, null);
      expect(panel._handleRAGBuildIndex).toHaveBeenCalled();
    });

    it('should dispatch rag-clear-index to instance method', async () => {
      const panel = new MainPanel(mockOrchestrator);
      panel._handleRAGClearIndex = vi.fn();
      await MainPanel._onRAGClearIndex.call(panel, {}, null);
      expect(panel._handleRAGClearIndex).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // _handleToggleRecording
  // =========================================================================

  describe('_handleToggleRecording', () => {
    it('should return early when no orchestrator', async () => {
      const panel = new MainPanel(null);
      // Should not throw
      await panel._handleToggleRecording();
    });

    it('should stop live mode when in live mode and recording', async () => {
      mockOrchestrator.state = 'live_listening';
      mockOrchestrator.isLiveMode = true;
      mockOrchestrator.stopLiveMode = vi.fn().mockResolvedValue({});
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleToggleRecording();
      expect(mockOrchestrator.stopLiveMode).toHaveBeenCalled();
    });

    it('should stop session when recording but not live mode', async () => {
      mockOrchestrator.state = 'recording';
      mockOrchestrator.isLiveMode = false;
      mockOrchestrator.stopSession = vi.fn().mockResolvedValue({});
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleToggleRecording();
      expect(mockOrchestrator.stopSession).toHaveBeenCalledWith({ processImmediately: false });
    });

    it('should start live mode when transcription service exists', async () => {
      mockOrchestrator.state = 'idle';
      mockOrchestrator.hasTranscriptionService = true;
      mockOrchestrator.startLiveMode = vi.fn().mockResolvedValue(undefined);
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleToggleRecording();
      expect(mockOrchestrator.startLiveMode).toHaveBeenCalled();
    });

    it('should start regular session when no transcription service', async () => {
      mockOrchestrator.state = 'idle';
      mockOrchestrator.hasTranscriptionService = false;
      mockOrchestrator.startSession = vi.fn().mockResolvedValue(undefined);
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleToggleRecording();
      expect(mockOrchestrator.startSession).toHaveBeenCalled();
    });

    it('should show error notification on failure', async () => {
      mockOrchestrator.state = 'idle';
      mockOrchestrator.hasTranscriptionService = true;
      mockOrchestrator.startLiveMode = vi.fn().mockRejectedValue(new Error('Mic denied'));
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleToggleRecording();
      expect(ui.notifications.error).toHaveBeenCalledWith('Mic denied');
    });
  });

  // =========================================================================
  // _handleTogglePause
  // =========================================================================

  describe('_handleTogglePause', () => {
    it('should resume when paused', () => {
      mockOrchestrator.state = 'paused';
      mockOrchestrator.resumeRecording = vi.fn();
      const panel = new MainPanel(mockOrchestrator);

      panel._handleTogglePause();
      expect(mockOrchestrator.resumeRecording).toHaveBeenCalled();
    });

    it('should pause when recording', () => {
      mockOrchestrator.state = 'recording';
      mockOrchestrator.pauseRecording = vi.fn();
      const panel = new MainPanel(mockOrchestrator);

      panel._handleTogglePause();
      expect(mockOrchestrator.pauseRecording).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // _handleProcessSession
  // =========================================================================

  describe('_handleProcessSession', () => {
    it('should warn when no audio blob', async () => {
      mockOrchestrator.currentSession = { audioBlob: null };
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleProcessSession();
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should call processTranscription when audio exists', async () => {
      mockOrchestrator.currentSession = { audioBlob: new Blob(['audio']) };
      mockOrchestrator.processTranscription = vi.fn().mockResolvedValue(undefined);
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleProcessSession();
      expect(mockOrchestrator.processTranscription).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // _handlePublishKanka
  // =========================================================================

  describe('_handlePublishKanka', () => {
    it('should warn when no entities', async () => {
      mockOrchestrator.currentSession = { entities: null };
      const panel = new MainPanel(mockOrchestrator);

      await panel._handlePublishKanka();
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should call publishToKanka when entities exist', async () => {
      mockOrchestrator.currentSession = { entities: { characters: [] } };
      mockOrchestrator.publishToKanka = vi.fn().mockResolvedValue(undefined);
      const panel = new MainPanel(mockOrchestrator);

      await panel._handlePublishKanka();
      expect(mockOrchestrator.publishToKanka).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // _handleRAGBuildIndex
  // =========================================================================

  describe('_handleRAGBuildIndex', () => {
    it('should warn when RAG retriever not available', async () => {
      mockVoxChronicleInstance.ragRetriever = null;
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleRAGBuildIndex();
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should call buildIndex with journal and pack IDs', async () => {
      const mockBuildIndex = vi.fn().mockResolvedValue(undefined);
      mockVoxChronicleInstance.ragRetriever = {
        buildIndex: mockBuildIndex
      };
      game.journal = [{ id: 'j1' }, { id: 'j2' }];
      game.packs = [{ collection: 'dnd5e.rules' }];

      const panel = new MainPanel(mockOrchestrator);
      await panel._handleRAGBuildIndex();

      expect(mockBuildIndex).toHaveBeenCalledWith(
        ['j1', 'j2'],
        ['dnd5e.rules'],
        expect.objectContaining({ onProgress: expect.any(Function) })
      );
    });

    it('should update settings metadata on success', async () => {
      mockVoxChronicleInstance.ragRetriever = {
        buildIndex: vi.fn().mockResolvedValue(undefined)
      };
      game.journal = [];
      game.packs = [];

      const panel = new MainPanel(mockOrchestrator);
      await panel._handleRAGBuildIndex();

      expect(game.settings.set).toHaveBeenCalledWith(
        'vox-chronicle',
        'ragIndexMetadata',
        expect.objectContaining({ lastIndexed: expect.any(String) })
      );
    });
  });

  // =========================================================================
  // _handleRAGClearIndex
  // =========================================================================

  describe('_handleRAGClearIndex', () => {
    it('should return when vector store not available', async () => {
      mockVoxChronicleInstance.ragVectorStore = null;
      const panel = new MainPanel(mockOrchestrator);

      await panel._handleRAGClearIndex();
      // No error thrown, just returns
    });
  });
});
