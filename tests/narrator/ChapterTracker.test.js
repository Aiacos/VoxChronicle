import { ChapterTracker } from '../../scripts/narrator/ChapterTracker.mjs';

// Suppress Logger console output in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * Creates a mock JournalParser
 */
function createMockJournalParser(options = {}) {
  const flatChapterList = options.flatChapterList || [
    { id: 'node-1', title: 'Chapter 1', level: 0, type: 'page', pageId: 'page-1', pageName: 'Chapter 1', path: 'Chapter 1' },
    { id: 'node-2', title: 'The Tavern', level: 1, type: 'heading', pageId: 'page-1', pageName: 'Chapter 1', path: 'Chapter 1 > The Tavern' },
    { id: 'node-3', title: 'Chapter 2', level: 0, type: 'page', pageId: 'page-2', pageName: 'Chapter 2', path: 'Chapter 2' },
    { id: 'node-4', title: 'The Forest', level: 1, type: 'heading', pageId: 'page-2', pageName: 'Chapter 2', path: 'Chapter 2 > The Forest' }
  ];

  const chapterStructure = options.chapterStructure || {
    journalId: 'journal-1',
    journalName: 'Adventure',
    chapters: [
      {
        id: 'node-1', title: 'Chapter 1', level: 0, type: 'page',
        pageId: 'page-1', pageName: 'Chapter 1', content: 'Content of chapter 1.',
        children: [
          { id: 'node-2', title: 'The Tavern', level: 1, type: 'heading', pageId: 'page-1', pageName: 'Chapter 1', content: 'A tavern scene.', children: [] }
        ]
      },
      {
        id: 'node-3', title: 'Chapter 2', level: 0, type: 'page',
        pageId: 'page-2', pageName: 'Chapter 2', content: 'Content of chapter 2.',
        children: [
          { id: 'node-4', title: 'The Forest', level: 1, type: 'heading', pageId: 'page-2', pageName: 'Chapter 2', content: 'A dark forest.', children: [] }
        ]
      }
    ],
    totalHeadings: 2,
    extractedAt: new Date()
  };

  return {
    getFlatChapterList: vi.fn().mockReturnValue(flatChapterList),
    extractChapterStructure: vi.fn().mockReturnValue(chapterStructure),
    getChapterBySceneName: vi.fn().mockReturnValue(null),
    searchByKeywords: vi.fn().mockReturnValue([]),
    getChapterAtPosition: vi.fn().mockReturnValue(null),
    _cachedContent: new Map([['journal-1', { name: 'Adventure' }]])
  };
}

describe('ChapterTracker', () => {
  let tracker;
  let mockParser;

  beforeEach(() => {
    mockParser = createMockJournalParser();
    tracker = new ChapterTracker({ journalParser: mockParser });
    tracker.setSelectedJournal('journal-1');
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should create instance with default options', () => {
      const t = new ChapterTracker();
      expect(t.getCurrentChapter()).toBeNull();
      expect(t.getSubchapters()).toEqual([]);
      expect(t.getChapterHistory()).toEqual([]);
      expect(t.getSelectedJournal()).toBeNull();
      expect(t.isConfigured()).toBe(false);
    });

    it('should accept journalParser option', () => {
      const t = new ChapterTracker({ journalParser: mockParser });
      expect(t._journalParser).toBe(mockParser);
    });
  });

  // =========================================================================
  // Configuration
  // =========================================================================
  describe('configuration', () => {
    it('setJournalParser() sets the parser', () => {
      const t = new ChapterTracker();
      t.setJournalParser(mockParser);
      expect(t._journalParser).toBe(mockParser);
    });

    it('setSelectedJournal() sets journal and clears cache', () => {
      tracker._sceneChapterCache.set('scene-1', { id: 'old' });
      tracker.setSelectedJournal('journal-2');
      expect(tracker.getSelectedJournal()).toBe('journal-2');
      expect(tracker._sceneChapterCache.size).toBe(0);
    });

    it('setSelectedJournal() does not clear cache if same journal', () => {
      tracker._sceneChapterCache.set('scene-1', { id: 'old' });
      tracker.setSelectedJournal('journal-1'); // same
      expect(tracker._sceneChapterCache.size).toBe(1);
    });

    it('isConfigured() returns true when both parser and journal are set', () => {
      expect(tracker.isConfigured()).toBe(true);
    });

    it('isConfigured() returns false without parser', () => {
      const t = new ChapterTracker();
      t.setSelectedJournal('j1');
      expect(t.isConfigured()).toBe(false);
    });

    it('isConfigured() returns false without selected journal', () => {
      const t = new ChapterTracker({ journalParser: mockParser });
      expect(t.isConfigured()).toBe(false);
    });
  });

  // =========================================================================
  // Scene-based detection
  // =========================================================================
  describe('updateFromScene()', () => {
    it('returns null for null scene', () => {
      expect(tracker.updateFromScene(null)).toBeNull();
    });

    it('detects chapter via linked journal matching selected journal', () => {
      const scene = { id: 'scene-1', name: 'Scene One', journal: 'journal-1', journalPage: 'page-1' };
      const result = tracker.updateFromScene(scene);
      // Should find chapter via _findChapterByPageId
      expect(result).not.toBeNull();
      expect(result.title).toBe('Chapter 1');
    });

    it('caches scene-to-chapter mapping', () => {
      const scene = { id: 'scene-1', name: 'The Tavern', journal: 'journal-1', journalPage: 'page-1' };
      const result1 = tracker.updateFromScene(scene);
      const result2 = tracker.updateFromScene(scene);
      // Second call should use cache
      expect(result2).toEqual(result1);
    });

    it('uses getChapterBySceneName when no linked journal match', () => {
      const matchNode = {
        id: 'node-2', title: 'The Tavern', level: 1, type: 'heading',
        pageId: 'page-1', pageName: 'Chapter 1', content: 'tavern content'
      };
      mockParser.getChapterBySceneName.mockReturnValue(matchNode);

      const scene = { id: 'scene-2', name: 'The Tavern' };
      const result = tracker.updateFromScene(scene);
      expect(result).not.toBeNull();
      expect(mockParser.getChapterBySceneName).toHaveBeenCalledWith('journal-1', 'The Tavern');
    });

    it('falls back to keyword matching', () => {
      mockParser.searchByKeywords.mockReturnValue([{ id: 'page-1' }]);
      mockParser.getChapterAtPosition.mockReturnValue({
        id: 'node-1', title: 'Chapter 1', level: 0, type: 'page',
        pageId: 'page-1', pageName: 'Chapter 1', content: 'content'
      });

      const scene = { id: 'scene-3', name: 'Dark Tavern' };
      const result = tracker.updateFromScene(scene);
      expect(mockParser.searchByKeywords).toHaveBeenCalled();
    });

    it('returns null when no chapter detected', () => {
      const scene = { id: 'scene-4', name: 'Unknown Place' };
      const result = tracker.updateFromScene(scene);
      expect(result).toBeNull();
    });

    it('returns null when parser not configured', () => {
      const t = new ChapterTracker();
      const scene = { id: 's1', name: 'Test' };
      expect(t.updateFromScene(scene)).toBeNull();
    });
  });

  // =========================================================================
  // Chapter state
  // =========================================================================
  describe('chapter state', () => {
    it('getCurrentChapter() returns null initially', () => {
      expect(tracker.getCurrentChapter()).toBeNull();
    });

    it('setManualChapter() sets chapter by ID', () => {
      const result = tracker.setManualChapter('node-2');
      expect(result).toBe(true);
      expect(tracker.getCurrentChapter().title).toBe('The Tavern');
    });

    it('setManualChapter() returns false for missing requirements', () => {
      expect(tracker.setManualChapter(null)).toBe(false);
      expect(tracker.setManualChapter('')).toBe(false);
    });

    it('setManualChapter() returns false for non-existent chapter', () => {
      expect(tracker.setManualChapter('non-existent')).toBe(false);
    });

    it('setManualChapter() without parser returns false', () => {
      const t = new ChapterTracker();
      t.setSelectedJournal('j1');
      expect(t.setManualChapter('node-1')).toBe(false);
    });

    it('getChapterSource() returns current source info', () => {
      const source = tracker.getChapterSource();
      expect(source.type).toBe('none');
      expect(source.updatedAt).toBeInstanceOf(Date);
    });

    it('getChapterSource() updates after manual set', () => {
      tracker.setManualChapter('node-1');
      const source = tracker.getChapterSource();
      expect(source.type).toBe('manual');
    });
  });

  // =========================================================================
  // History and navigation
  // =========================================================================
  describe('history and navigation', () => {
    it('getChapterHistory() returns copy of history', () => {
      tracker.setManualChapter('node-1');
      tracker.setManualChapter('node-2');
      const history = tracker.getChapterHistory();
      expect(history).toHaveLength(1);
      expect(history[0].title).toBe('Chapter 1');
    });

    it('navigateBack() returns previous chapter', () => {
      tracker.setManualChapter('node-1');
      tracker.setManualChapter('node-2');

      const prev = tracker.navigateBack();
      expect(prev).not.toBeNull();
      expect(prev.title).toBe('Chapter 1');
      expect(tracker.getCurrentChapter().title).toBe('Chapter 1');
    });

    it('navigateBack() returns null when no history', () => {
      expect(tracker.navigateBack()).toBeNull();
    });

    it('getAllChapters() returns flat list', () => {
      const chapters = tracker.getAllChapters();
      expect(chapters).toHaveLength(4);
    });

    it('getAllChapters() returns empty without parser', () => {
      const t = new ChapterTracker();
      expect(t.getAllChapters()).toEqual([]);
    });

    it('getSiblingChapters() finds previous and next', () => {
      tracker.setManualChapter('node-2');
      const siblings = tracker.getSiblingChapters();
      // node-2 is at level 1, node-4 is also level 1 but under different parent
      // so next should be null (different parent)
      expect(siblings).toHaveProperty('previous');
      expect(siblings).toHaveProperty('next');
    });

    it('getSiblingChapters() returns nulls without current chapter', () => {
      const result = tracker.getSiblingChapters();
      expect(result.previous).toBeNull();
      expect(result.next).toBeNull();
    });

    it('getSiblingChapters() returns nulls when chapter not in list', () => {
      tracker._currentChapter = { id: 'non-existent', level: 0 };
      const result = tracker.getSiblingChapters();
      expect(result.previous).toBeNull();
      expect(result.next).toBeNull();
    });
  });

  // =========================================================================
  // AI context
  // =========================================================================
  describe('getCurrentChapterContentForAI()', () => {
    it('returns empty string when no current chapter', () => {
      expect(tracker.getCurrentChapterContentForAI()).toBe('');
    });

    it('formats chapter content', () => {
      tracker.setManualChapter('node-1');
      // Manually set content since flat node conversion sets empty content
      tracker._currentChapter.content = 'Some adventure content here.';

      const result = tracker.getCurrentChapterContentForAI();
      expect(result).toContain('CURRENT CHAPTER: Chapter 1');
      expect(result).toContain('PATH:');
      expect(result).toContain('CONTENT:');
      expect(result).toContain('Some adventure content here.');
    });

    it('truncates content at maxLength', () => {
      tracker.setManualChapter('node-1');
      tracker._currentChapter.content = 'a'.repeat(10000);

      const result = tracker.getCurrentChapterContentForAI(100);
      expect(result).toContain('...');
    });

    it('includes subchapters list', () => {
      tracker.setManualChapter('node-1');
      // node-1 has children from structure

      const result = tracker.getCurrentChapterContentForAI();
      expect(result).toContain('AVAILABLE SUBSECTIONS:');
      expect(result).toContain('The Tavern');
    });
  });

  // =========================================================================
  // State management
  // =========================================================================
  describe('state management', () => {
    it('clear() resets all state', () => {
      tracker.setManualChapter('node-1');
      tracker.clear();

      expect(tracker.getCurrentChapter()).toBeNull();
      expect(tracker.getSubchapters()).toEqual([]);
      expect(tracker.getChapterHistory()).toEqual([]);
      expect(tracker.getChapterSource().type).toBe('none');
    });

    it('clearCache() clears scene chapter cache', () => {
      tracker._sceneChapterCache.set('s1', { id: 'c1' });
      tracker.clearCache();
      expect(tracker._sceneChapterCache.size).toBe(0);
    });
  });

  // =========================================================================
  // Private methods
  // =========================================================================
  describe('_setCurrentChapter()', () => {
    it('does not update if same chapter ID', () => {
      tracker._currentChapter = { id: 'node-1', title: 'Ch1' };
      const historyBefore = tracker._chapterHistory.length;
      tracker._setCurrentChapter({ id: 'node-1', title: 'Ch1' }, 'manual');
      expect(tracker._chapterHistory.length).toBe(historyBefore);
    });

    it('trims history exceeding max size', () => {
      for (let i = 0; i < 25; i++) {
        tracker._setCurrentChapter({ id: `node-${i}`, title: `Ch ${i}` }, 'manual');
      }
      expect(tracker._chapterHistory.length).toBeLessThanOrEqual(20);
    });
  });

  describe('_buildChapterPath()', () => {
    it('uses existing path if present', () => {
      const path = tracker._buildChapterPath({ path: 'A > B', title: 'B' });
      expect(path).toBe('A > B');
    });

    it('uses title for page type', () => {
      const path = tracker._buildChapterPath({ type: 'page', title: 'Page Title' });
      expect(path).toBe('Page Title');
    });

    it('builds from pageName and title', () => {
      const path = tracker._buildChapterPath({ type: 'heading', title: 'Section', pageName: 'Chapter 1' });
      expect(path).toBe('Chapter 1 > Section');
    });

    it('uses just title when pageName matches title', () => {
      const path = tracker._buildChapterPath({ type: 'heading', title: 'Same', pageName: 'Same' });
      expect(path).toBe('Same');
    });
  });

  describe('_findNodeById()', () => {
    it('finds node at root level', () => {
      const nodes = [{ id: 'a', children: [] }, { id: 'b', children: [] }];
      expect(tracker._findNodeById(nodes, 'b')).toEqual({ id: 'b', children: [] });
    });

    it('finds nested node', () => {
      const nodes = [{ id: 'a', children: [{ id: 'b', children: [{ id: 'c', children: [] }] }] }];
      expect(tracker._findNodeById(nodes, 'c')).toEqual({ id: 'c', children: [] });
    });

    it('returns null when not found', () => {
      const nodes = [{ id: 'a', children: [] }];
      expect(tracker._findNodeById(nodes, 'z')).toBeNull();
    });
  });

  describe('_detectChapterByKeywords()', () => {
    it('returns null without parser', () => {
      const t = new ChapterTracker();
      expect(t._detectChapterByKeywords('test')).toBeNull();
    });

    it('returns null for very short scene name', () => {
      const result = tracker._detectChapterByKeywords('ab');
      expect(result).toBeNull();
    });

    it('falls back to extractChapterStructure when getChapterAtPosition is unavailable', () => {
      delete mockParser.getChapterAtPosition;
      mockParser.searchByKeywords.mockReturnValue([{ id: 'page-1' }]);

      const result = tracker._detectChapterByKeywords('Chapter Content');
      expect(mockParser.extractChapterStructure).toHaveBeenCalled();
    });
  });
});
