/**
 * MainPanel Unit Tests
 *
 * Tests for the MainPanel unified UI component.
 * Covers singleton management, tab switching, template data,
 * duration formatting, entity counting, and render lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { MainPanel } from '../../scripts/ui/MainPanel.mjs';

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

  describe('defaultOptions', () => {
    it('should return correct default options', () => {
      const opts = MainPanel.defaultOptions;
      expect(opts.id).toBe('vox-chronicle-main-panel');
      expect(opts.width).toBe(420);
      expect(opts.height).toBe(600);
      expect(opts.title).toBe('VoxChronicle');
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

  describe('getData', () => {
    it('should return default data when no session', () => {
      const panel = new MainPanel(mockOrchestrator);
      const data = panel.getData();
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

    it('should return recording state', () => {
      mockOrchestrator.isRecording = true;
      const panel = new MainPanel(mockOrchestrator);
      const data = panel.getData();
      expect(data.isRecording).toBe(true);
    });

    it('should return paused state', () => {
      mockOrchestrator.state = 'paused';
      const panel = new MainPanel(mockOrchestrator);
      const data = panel.getData();
      expect(data.isPaused).toBe(true);
    });

    it('should return entities count', () => {
      mockOrchestrator.currentSession = {
        entities: {
          characters: [{ name: 'A' }, { name: 'B' }],
          locations: [{ name: 'L1' }],
          items: []
        }
      };
      const panel = new MainPanel(mockOrchestrator);
      const data = panel.getData();
      expect(data.entityCount).toBe(3);
      expect(data.hasEntities).toBe(true);
    });

    it('should return transcript segments', () => {
      mockOrchestrator.currentSession = {
        transcript: {
          segments: [
            { speaker: 'A', text: 'Hello' },
            { speaker: 'B', text: 'World' }
          ]
        }
      };
      const panel = new MainPanel(mockOrchestrator);
      const data = panel.getData();
      expect(data.segments).toHaveLength(2);
      expect(data.hasTranscript).toBe(true);
    });

    it('should return current chapter', () => {
      mockOrchestrator.getCurrentChapter.mockReturnValue({ id: 'c1', name: 'Chapter 1', path: 'Ch1' });
      const panel = new MainPanel(mockOrchestrator);
      const data = panel.getData();
      expect(data.currentChapter).toEqual({ id: 'c1', name: 'Chapter 1', path: 'Ch1' });
    });

    it('should return AI suggestions', () => {
      mockOrchestrator.getAISuggestions.mockReturnValue([{ type: 'plot', text: 'Try this' }]);
      const panel = new MainPanel(mockOrchestrator);
      const data = panel.getData();
      expect(data.suggestions).toHaveLength(1);
    });
  });

  describe('render', () => {
    it('should mark as rendered', async () => {
      const panel = new MainPanel(mockOrchestrator);
      await panel.render();
      expect(panel.isRendered).toBe(true);
    });

    it('should return self for chaining', async () => {
      const panel = new MainPanel(mockOrchestrator);
      const result = await panel.render();
      expect(result).toBe(panel);
    });
  });

  describe('close', () => {
    it('should mark as not rendered', async () => {
      const panel = new MainPanel(mockOrchestrator);
      await panel.render();
      panel.close();
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
});
