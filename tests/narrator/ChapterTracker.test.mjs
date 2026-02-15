/**
 * ChapterTracker Unit Tests
 *
 * Tests for the ChapterTracker class ported from Narrator Master.
 * Covers constructor, configuration, scene-based detection, manual chapter
 * selection, history/navigation, AI context output, cache/clear, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock constants before importing ChapterTracker
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock Logger before importing ChapterTracker
vi.mock('../../scripts/utils/Logger.mjs', () => {
  const childLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  return {
    Logger: {
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      createChild: vi.fn(() => childLogger),
      _childLogger: childLogger
    }
  };
});

import { ChapterTracker } from '../../scripts/narrator/ChapterTracker.mjs';

// ---------------------------------------------------------------------------
// Helpers -- Mock JournalParser
// ---------------------------------------------------------------------------

/**
 * Creates a mock JournalParser with configurable behavior
 */
function createMockJournalParser(overrides = {}) {
  return {
    getChapterBySceneName: vi.fn().mockReturnValue(null),
    getFlatChapterList: vi.fn().mockReturnValue([]),
    extractChapterStructure: vi.fn().mockReturnValue({ chapters: [] }),
    searchByKeywords: vi.fn().mockReturnValue([]),
    getChapterAtPosition: vi.fn().mockReturnValue(null),
    _cachedContent: new Map(),
    ...overrides
  };
}

/**
 * Creates a mock Foundry scene object
 */
function createMockScene(id, name, options = {}) {
  return {
    id,
    name,
    journal: options.journal || null,
    journalPage: options.journalPage || null
  };
}

/**
 * Creates a mock ChapterInfo object
 */
function createMockChapterInfo(id, title, options = {}) {
  return {
    id,
    title,
    level: options.level ?? 0,
    type: options.type || 'page',
    pageId: options.pageId || `page-${id}`,
    pageName: options.pageName || title,
    content: options.content || '',
    journalId: options.journalId || 'j1',
    journalName: options.journalName || 'Test Journal',
    path: options.path || title
  };
}

/**
 * Creates a mock flat chapter list entry
 */
function createFlatChapterEntry(id, title, options = {}) {
  return {
    id,
    title,
    level: options.level ?? 0,
    type: options.type || 'page',
    pageId: options.pageId || `page-${id}`,
    pageName: options.pageName || title,
    path: options.path || title
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChapterTracker', () => {
  let tracker;
  let mockParser;

  beforeEach(() => {
    mockParser = createMockJournalParser();
    tracker = new ChapterTracker({ journalParser: mockParser });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe('constructor', () => {
    it('should initialize with provided journalParser', () => {
      expect(tracker._journalParser).toBe(mockParser);
      expect(tracker._currentChapter).toBeNull();
      expect(tracker._subchapters).toEqual([]);
      expect(tracker._chapterHistory).toEqual([]);
      expect(tracker._selectedJournalId).toBeNull();
    });

    it('should initialize without journalParser', () => {
      const bare = new ChapterTracker();
      expect(bare._journalParser).toBeNull();
      expect(bare._currentChapter).toBeNull();
    });

    it('should initialize with default options when called with empty object', () => {
      const bare = new ChapterTracker({});
      expect(bare._journalParser).toBeNull();
      expect(bare._chapterSource.type).toBe('none');
    });

    it('should initialize scene chapter cache as empty Map', () => {
      expect(tracker._sceneChapterCache).toBeInstanceOf(Map);
      expect(tracker._sceneChapterCache.size).toBe(0);
    });
  });

  // =========================================================================
  // setJournalParser
  // =========================================================================

  describe('setJournalParser', () => {
    it('should set the journal parser reference', () => {
      const bare = new ChapterTracker();
      expect(bare._journalParser).toBeNull();

      const newParser = createMockJournalParser();
      bare.setJournalParser(newParser);
      expect(bare._journalParser).toBe(newParser);
    });

    it('should replace existing parser', () => {
      const newParser = createMockJournalParser();
      tracker.setJournalParser(newParser);
      expect(tracker._journalParser).toBe(newParser);
      expect(tracker._journalParser).not.toBe(mockParser);
    });
  });

  // =========================================================================
  // setSelectedJournal / getSelectedJournal
  // =========================================================================

  describe('setSelectedJournal / getSelectedJournal', () => {
    it('should set and get the selected journal ID', () => {
      expect(tracker.getSelectedJournal()).toBeNull();
      tracker.setSelectedJournal('j1');
      expect(tracker.getSelectedJournal()).toBe('j1');
    });

    it('should clear scene cache when journal changes', () => {
      tracker._sceneChapterCache.set('scene-1', createMockChapterInfo('c1', 'Chapter 1'));
      expect(tracker._sceneChapterCache.size).toBe(1);

      tracker.setSelectedJournal('j2');
      expect(tracker._sceneChapterCache.size).toBe(0);
    });

    it('should not clear cache when setting the same journal ID', () => {
      tracker.setSelectedJournal('j1');
      tracker._sceneChapterCache.set('scene-1', createMockChapterInfo('c1', 'Chapter 1'));

      tracker.setSelectedJournal('j1');
      expect(tracker._sceneChapterCache.size).toBe(1);
    });
  });

  // =========================================================================
  // isConfigured
  // =========================================================================

  describe('isConfigured', () => {
    it('should return false when no parser and no journal selected', () => {
      const bare = new ChapterTracker();
      expect(bare.isConfigured()).toBe(false);
    });

    it('should return false when only parser is set', () => {
      expect(tracker.isConfigured()).toBe(false);
    });

    it('should return false when only journal is selected', () => {
      const bare = new ChapterTracker();
      bare.setSelectedJournal('j1');
      expect(bare.isConfigured()).toBe(false);
    });

    it('should return true when both parser and journal are set', () => {
      tracker.setSelectedJournal('j1');
      expect(tracker.isConfigured()).toBe(true);
    });
  });

  // =========================================================================
  // updateFromScene
  // =========================================================================

  describe('updateFromScene', () => {
    beforeEach(() => {
      tracker.setSelectedJournal('j1');
    });

    it('should return null for null scene', () => {
      const result = tracker.updateFromScene(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined scene', () => {
      const result = tracker.updateFromScene(undefined);
      expect(result).toBeNull();
    });

    it('should use cached chapter for previously seen scene', () => {
      const chapter = createMockChapterInfo('c1', 'The Tavern');
      tracker._sceneChapterCache.set('s1', chapter);

      const scene = createMockScene('s1', 'Tavern Scene');
      const result = tracker.updateFromScene(scene);

      expect(result).toBe(chapter);
      expect(tracker.getCurrentChapter()).toBe(chapter);
    });

    it('should detect chapter via linked journal page', () => {
      const flatEntry = createFlatChapterEntry('c1', 'Chapter 1', { pageId: 'p1' });
      mockParser.getFlatChapterList.mockReturnValue([flatEntry]);
      mockParser._cachedContent.set('j1', { name: 'Adventure' });

      const scene = createMockScene('s1', 'First Scene', {
        journal: 'j1',
        journalPage: 'p1'
      });

      const result = tracker.updateFromScene(scene);

      expect(result).not.toBeNull();
      expect(result.title).toBe('Chapter 1');
      expect(result.pageId).toBe('p1');
    });

    it('should detect chapter via scene name matching', () => {
      const chapterNode = {
        id: 'c1',
        title: 'The Dark Forest',
        level: 0,
        type: 'page',
        pageId: 'p1',
        pageName: 'The Dark Forest',
        content: 'Spooky trees everywhere.'
      };
      mockParser.getChapterBySceneName.mockReturnValue(chapterNode);
      mockParser._cachedContent.set('j1', { name: 'Adventure' });

      const scene = createMockScene('s1', 'The Dark Forest');
      const result = tracker.updateFromScene(scene);

      expect(result).not.toBeNull();
      expect(result.title).toBe('The Dark Forest');
      expect(mockParser.getChapterBySceneName).toHaveBeenCalledWith('j1', 'The Dark Forest');
    });

    it('should detect chapter via keyword matching fallback', () => {
      // getChapterBySceneName returns null, so keyword matching is tried
      mockParser.getChapterBySceneName.mockReturnValue(null);
      mockParser.searchByKeywords.mockReturnValue([{ id: 'p1', name: 'Page 1' }]);
      mockParser.extractChapterStructure.mockReturnValue({
        chapters: [{
          id: 'c1',
          title: 'The Tavern',
          level: 0,
          type: 'page',
          pageId: 'p1',
          pageName: 'The Tavern',
          content: 'Beer and mead.',
          children: []
        }]
      });
      mockParser._cachedContent.set('j1', { name: 'Adventure' });

      const scene = createMockScene('s2', 'tavern encounter');
      const result = tracker.updateFromScene(scene);

      expect(result).not.toBeNull();
      expect(result.title).toBe('The Tavern');
    });

    it('should return null when no detection method succeeds', () => {
      mockParser.getChapterBySceneName.mockReturnValue(null);
      mockParser.searchByKeywords.mockReturnValue([]);

      const scene = createMockScene('s1', 'Unknown Place');
      const result = tracker.updateFromScene(scene);

      expect(result).toBeNull();
    });

    it('should return null when parser is not configured', () => {
      const bare = new ChapterTracker();
      const scene = createMockScene('s1', 'Some Scene');
      const result = bare.updateFromScene(scene);
      expect(result).toBeNull();
    });

    it('should cache detected chapter for future lookups', () => {
      const chapterNode = {
        id: 'c1',
        title: 'Cached Chapter',
        level: 0,
        type: 'page',
        pageId: 'p1',
        pageName: 'Cached Chapter',
        content: 'Content here.'
      };
      mockParser.getChapterBySceneName.mockReturnValue(chapterNode);
      mockParser._cachedContent.set('j1', { name: 'Adventure' });

      const scene = createMockScene('s1', 'Cached Chapter');
      tracker.updateFromScene(scene);

      expect(tracker._sceneChapterCache.has('s1')).toBe(true);
    });

    it('should not use linked journal if it does not match selected journal', () => {
      mockParser.getChapterBySceneName.mockReturnValue(null);
      mockParser.searchByKeywords.mockReturnValue([]);

      const scene = createMockScene('s1', 'Some Scene', {
        journal: 'different-journal',
        journalPage: 'p1'
      });

      const result = tracker.updateFromScene(scene);
      // Should not call getFlatChapterList because journal IDs don't match
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // setManualChapter
  // =========================================================================

  describe('setManualChapter', () => {
    beforeEach(() => {
      tracker.setSelectedJournal('j1');
      mockParser._cachedContent.set('j1', { name: 'Adventure' });
    });

    it('should set chapter when found in flat list', () => {
      const entry = createFlatChapterEntry('c1', 'Chapter 1', { pageId: 'p1', path: 'Chapter 1' });
      mockParser.getFlatChapterList.mockReturnValue([entry]);

      const result = tracker.setManualChapter('c1');

      expect(result).toBe(true);
      expect(tracker.getCurrentChapter()).not.toBeNull();
      expect(tracker.getCurrentChapter().title).toBe('Chapter 1');
    });

    it('should return false when chapter ID is not found', () => {
      mockParser.getFlatChapterList.mockReturnValue([]);

      const result = tracker.setManualChapter('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false when chapterId is null', () => {
      const result = tracker.setManualChapter(null);
      expect(result).toBe(false);
    });

    it('should return false when chapterId is empty string', () => {
      const result = tracker.setManualChapter('');
      expect(result).toBe(false);
    });

    it('should return false when parser is missing', () => {
      const bare = new ChapterTracker();
      bare.setSelectedJournal('j1');
      const result = bare.setManualChapter('c1');
      expect(result).toBe(false);
    });

    it('should return false when journal is not selected', () => {
      const bare = new ChapterTracker({ journalParser: mockParser });
      const result = bare.setManualChapter('c1');
      expect(result).toBe(false);
    });

    it('should push previous chapter to history when setting new chapter', () => {
      const entry1 = createFlatChapterEntry('c1', 'First', { path: 'First' });
      const entry2 = createFlatChapterEntry('c2', 'Second', { path: 'Second' });
      mockParser.getFlatChapterList.mockReturnValue([entry1, entry2]);

      tracker.setManualChapter('c1');
      tracker.setManualChapter('c2');

      const history = tracker.getChapterHistory();
      expect(history).toHaveLength(1);
      expect(history[0].title).toBe('First');
    });
  });

  // =========================================================================
  // getChapterSource
  // =========================================================================

  describe('getChapterSource', () => {
    it('should return source with type none initially', () => {
      const source = tracker.getChapterSource();
      expect(source.type).toBe('none');
      expect(source.updatedAt).toBeInstanceOf(Date);
    });

    it('should return copy of source (not original reference)', () => {
      const source1 = tracker.getChapterSource();
      const source2 = tracker.getChapterSource();
      expect(source1).not.toBe(source2);
      expect(source1).toEqual(source2);
    });

    it('should update source type on manual chapter set', () => {
      tracker.setSelectedJournal('j1');
      mockParser._cachedContent.set('j1', { name: 'Adventure' });
      const entry = createFlatChapterEntry('c1', 'Chapter', { path: 'Chapter' });
      mockParser.getFlatChapterList.mockReturnValue([entry]);

      tracker.setManualChapter('c1');

      const source = tracker.getChapterSource();
      expect(source.type).toBe('manual');
    });
  });

  // =========================================================================
  // History management
  // =========================================================================

  describe('history management', () => {
    beforeEach(() => {
      tracker.setSelectedJournal('j1');
      mockParser._cachedContent.set('j1', { name: 'Adventure' });
    });

    it('should start with empty history', () => {
      expect(tracker.getChapterHistory()).toEqual([]);
    });

    it('should add chapters to history as they change', () => {
      const entries = Array.from({ length: 3 }, (_, i) =>
        createFlatChapterEntry(`c${i}`, `Chapter ${i}`, { path: `Chapter ${i}` })
      );
      mockParser.getFlatChapterList.mockReturnValue(entries);

      tracker.setManualChapter('c0');
      tracker.setManualChapter('c1');
      tracker.setManualChapter('c2');

      const history = tracker.getChapterHistory();
      expect(history).toHaveLength(2);
      expect(history[0].title).toBe('Chapter 0');
      expect(history[1].title).toBe('Chapter 1');
    });

    it('should not add to history when setting the same chapter', () => {
      const entry = createFlatChapterEntry('c1', 'Same Chapter', { path: 'Same Chapter' });
      mockParser.getFlatChapterList.mockReturnValue([entry]);

      tracker.setManualChapter('c1');
      tracker.setManualChapter('c1'); // Same chapter again

      const history = tracker.getChapterHistory();
      expect(history).toHaveLength(0);
    });

    it('should respect max history size', () => {
      const entries = Array.from({ length: 25 }, (_, i) =>
        createFlatChapterEntry(`c${i}`, `Ch ${i}`, { path: `Ch ${i}` })
      );
      mockParser.getFlatChapterList.mockReturnValue(entries);

      for (let i = 0; i < 25; i++) {
        tracker.setManualChapter(`c${i}`);
      }

      const history = tracker.getChapterHistory();
      // maxHistorySize is 20, but the current chapter is not in history
      // so we should have at most 20 entries
      expect(history.length).toBeLessThanOrEqual(20);
    });

    it('should return copy of history (not original array)', () => {
      const history1 = tracker.getChapterHistory();
      const history2 = tracker.getChapterHistory();
      expect(history1).not.toBe(history2);
    });
  });

  // =========================================================================
  // navigateBack
  // =========================================================================

  describe('navigateBack', () => {
    beforeEach(() => {
      tracker.setSelectedJournal('j1');
      mockParser._cachedContent.set('j1', { name: 'Adventure' });
    });

    it('should return null when history is empty', () => {
      const result = tracker.navigateBack();
      expect(result).toBeNull();
    });

    it('should navigate to previous chapter', () => {
      const entries = [
        createFlatChapterEntry('c1', 'First', { path: 'First' }),
        createFlatChapterEntry('c2', 'Second', { path: 'Second' })
      ];
      mockParser.getFlatChapterList.mockReturnValue(entries);

      tracker.setManualChapter('c1');
      tracker.setManualChapter('c2');

      const result = tracker.navigateBack();
      expect(result).not.toBeNull();
      expect(result.title).toBe('First');
      expect(tracker.getCurrentChapter().title).toBe('First');
    });

    it('should update chapter source to manual on navigate back', () => {
      const entries = [
        createFlatChapterEntry('c1', 'First', { path: 'First' }),
        createFlatChapterEntry('c2', 'Second', { path: 'Second' })
      ];
      mockParser.getFlatChapterList.mockReturnValue(entries);

      tracker.setManualChapter('c1');
      tracker.setManualChapter('c2');
      tracker.navigateBack();

      expect(tracker.getChapterSource().type).toBe('manual');
    });

    it('should remove chapter from history after navigating back', () => {
      const entries = [
        createFlatChapterEntry('c1', 'First', { path: 'First' }),
        createFlatChapterEntry('c2', 'Second', { path: 'Second' })
      ];
      mockParser.getFlatChapterList.mockReturnValue(entries);

      tracker.setManualChapter('c1');
      tracker.setManualChapter('c2');

      expect(tracker.getChapterHistory()).toHaveLength(1);
      tracker.navigateBack();
      expect(tracker.getChapterHistory()).toHaveLength(0);
    });
  });

  // =========================================================================
  // getAllChapters
  // =========================================================================

  describe('getAllChapters', () => {
    it('should return empty array when parser is missing', () => {
      const bare = new ChapterTracker();
      expect(bare.getAllChapters()).toEqual([]);
    });

    it('should return empty array when journal is not selected', () => {
      expect(tracker.getAllChapters()).toEqual([]);
    });

    it('should delegate to parser.getFlatChapterList', () => {
      tracker.setSelectedJournal('j1');
      const entries = [
        createFlatChapterEntry('c1', 'Chapter 1'),
        createFlatChapterEntry('c2', 'Chapter 2')
      ];
      mockParser.getFlatChapterList.mockReturnValue(entries);

      const result = tracker.getAllChapters();
      expect(result).toEqual(entries);
      expect(mockParser.getFlatChapterList).toHaveBeenCalledWith('j1');
    });
  });

  // =========================================================================
  // getSiblingChapters
  // =========================================================================

  describe('getSiblingChapters', () => {
    beforeEach(() => {
      tracker.setSelectedJournal('j1');
      mockParser._cachedContent.set('j1', { name: 'Adventure' });
    });

    it('should return null siblings when no current chapter', () => {
      const result = tracker.getSiblingChapters();
      expect(result).toEqual({ previous: null, next: null });
    });

    it('should return null siblings when parser is missing', () => {
      const bare = new ChapterTracker();
      const result = bare.getSiblingChapters();
      expect(result).toEqual({ previous: null, next: null });
    });

    it('should find previous and next siblings at same level', () => {
      const entries = [
        createFlatChapterEntry('c1', 'Chapter 1', { level: 0, path: 'Chapter 1' }),
        createFlatChapterEntry('c2', 'Chapter 2', { level: 0, path: 'Chapter 2' }),
        createFlatChapterEntry('c3', 'Chapter 3', { level: 0, path: 'Chapter 3' })
      ];
      mockParser.getFlatChapterList.mockReturnValue(entries);

      // Set current chapter to c2
      tracker.setManualChapter('c2');

      const siblings = tracker.getSiblingChapters();
      expect(siblings.previous).not.toBeNull();
      expect(siblings.previous.title).toBe('Chapter 1');
      expect(siblings.next).not.toBeNull();
      expect(siblings.next.title).toBe('Chapter 3');
    });

    it('should return null previous for first chapter', () => {
      const entries = [
        createFlatChapterEntry('c1', 'Chapter 1', { level: 0, path: 'Chapter 1' }),
        createFlatChapterEntry('c2', 'Chapter 2', { level: 0, path: 'Chapter 2' })
      ];
      mockParser.getFlatChapterList.mockReturnValue(entries);

      tracker.setManualChapter('c1');

      const siblings = tracker.getSiblingChapters();
      expect(siblings.previous).toBeNull();
      expect(siblings.next).not.toBeNull();
      expect(siblings.next.title).toBe('Chapter 2');
    });

    it('should return null next for last chapter', () => {
      const entries = [
        createFlatChapterEntry('c1', 'Chapter 1', { level: 0, path: 'Chapter 1' }),
        createFlatChapterEntry('c2', 'Chapter 2', { level: 0, path: 'Chapter 2' })
      ];
      mockParser.getFlatChapterList.mockReturnValue(entries);

      tracker.setManualChapter('c2');

      const siblings = tracker.getSiblingChapters();
      expect(siblings.previous).not.toBeNull();
      expect(siblings.previous.title).toBe('Chapter 1');
      expect(siblings.next).toBeNull();
    });

    it('should stop at parent level boundary when searching siblings', () => {
      const entries = [
        createFlatChapterEntry('c1', 'Chapter 1', { level: 0, path: 'Chapter 1' }),
        createFlatChapterEntry('c1a', 'Section A', { level: 1, path: 'Chapter 1 > Section A' }),
        createFlatChapterEntry('c1b', 'Section B', { level: 1, path: 'Chapter 1 > Section B' }),
        createFlatChapterEntry('c2', 'Chapter 2', { level: 0, path: 'Chapter 2' })
      ];
      mockParser.getFlatChapterList.mockReturnValue(entries);

      tracker.setManualChapter('c1b');

      const siblings = tracker.getSiblingChapters();
      expect(siblings.previous).not.toBeNull();
      expect(siblings.previous.title).toBe('Section A');
      // Next should be null because Chapter 2 is level 0 (parent level)
      expect(siblings.next).toBeNull();
    });

    it('should return null siblings when current chapter is not in flat list', () => {
      mockParser.getFlatChapterList.mockReturnValue([]);

      // Manually set a chapter that won't be in the flat list
      tracker._currentChapter = createMockChapterInfo('ghost', 'Ghost Chapter');
      tracker._selectedJournalId = 'j1';

      const siblings = tracker.getSiblingChapters();
      expect(siblings).toEqual({ previous: null, next: null });
    });
  });

  // =========================================================================
  // getCurrentChapterContentForAI
  // =========================================================================

  describe('getCurrentChapterContentForAI', () => {
    it('should return empty string when no current chapter', () => {
      expect(tracker.getCurrentChapterContentForAI()).toBe('');
    });

    it('should include chapter title and path', () => {
      tracker._currentChapter = createMockChapterInfo('c1', 'The Dark Forest', {
        path: 'Book > The Dark Forest',
        content: 'Spooky trees everywhere.'
      });

      const result = tracker.getCurrentChapterContentForAI();
      expect(result).toContain('CAPITOLO CORRENTE: The Dark Forest');
      expect(result).toContain('PERCORSO: Book > The Dark Forest');
    });

    it('should include chapter content', () => {
      tracker._currentChapter = createMockChapterInfo('c1', 'Chapter', {
        content: 'The heroes enter the cave.'
      });

      const result = tracker.getCurrentChapterContentForAI();
      expect(result).toContain('CONTENUTO:');
      expect(result).toContain('The heroes enter the cave.');
    });

    it('should truncate content to maxLength', () => {
      const longContent = 'A'.repeat(10000);
      tracker._currentChapter = createMockChapterInfo('c1', 'Chapter', {
        content: longContent
      });

      const result = tracker.getCurrentChapterContentForAI(100);
      expect(result).toContain('...');
      // The entire output will be longer than 100, but the content portion should be truncated
      expect(result.length).toBeLessThan(longContent.length);
    });

    it('should not include CONTENUTO section when content is empty', () => {
      tracker._currentChapter = createMockChapterInfo('c1', 'Chapter', {
        content: ''
      });

      const result = tracker.getCurrentChapterContentForAI();
      expect(result).not.toContain('CONTENUTO:');
    });

    it('should include subchapters list when present', () => {
      tracker._currentChapter = createMockChapterInfo('c1', 'Chapter');
      tracker._subchapters = [
        { id: 's1', title: 'Section A', level: 1, type: 'heading', path: 'Chapter > Section A' },
        { id: 's2', title: 'Section B', level: 1, type: 'heading', path: 'Chapter > Section B' }
      ];

      const result = tracker.getCurrentChapterContentForAI();
      expect(result).toContain('SOTTOSEZIONI DISPONIBILI:');
      expect(result).toContain('- Section A');
      expect(result).toContain('- Section B');
    });

    it('should not include SOTTOSEZIONI section when no subchapters', () => {
      tracker._currentChapter = createMockChapterInfo('c1', 'Chapter');
      tracker._subchapters = [];

      const result = tracker.getCurrentChapterContentForAI();
      expect(result).not.toContain('SOTTOSEZIONI DISPONIBILI:');
    });

    it('should use default maxLength of 5000', () => {
      const content = 'B'.repeat(4000);
      tracker._currentChapter = createMockChapterInfo('c1', 'Chapter', { content });

      const result = tracker.getCurrentChapterContentForAI();
      // Content is under 5000, so should not be truncated
      expect(result).not.toContain('...');
      expect(result).toContain(content);
    });
  });

  // =========================================================================
  // clear
  // =========================================================================

  describe('clear', () => {
    it('should reset all tracking state', () => {
      tracker.setSelectedJournal('j1');
      mockParser._cachedContent.set('j1', { name: 'Adventure' });
      const entry = createFlatChapterEntry('c1', 'Chapter', { path: 'Chapter' });
      mockParser.getFlatChapterList.mockReturnValue([entry]);
      tracker.setManualChapter('c1');

      tracker.clear();

      expect(tracker.getCurrentChapter()).toBeNull();
      expect(tracker.getSubchapters()).toEqual([]);
      expect(tracker._activeSceneId).toBeNull();
      expect(tracker.getChapterSource().type).toBe('none');
      expect(tracker.getChapterHistory()).toEqual([]);
    });

    it('should not clear the scene chapter cache', () => {
      tracker._sceneChapterCache.set('s1', createMockChapterInfo('c1', 'C1'));
      tracker.clear();
      // clear() does NOT clear the scene cache -- that's clearCache()
      expect(tracker._sceneChapterCache.size).toBe(1);
    });

    it('should not clear selected journal or parser', () => {
      tracker.setSelectedJournal('j1');
      tracker.clear();
      expect(tracker.getSelectedJournal()).toBe('j1');
      expect(tracker._journalParser).toBe(mockParser);
    });
  });

  // =========================================================================
  // clearCache
  // =========================================================================

  describe('clearCache', () => {
    it('should clear the scene chapter cache', () => {
      tracker._sceneChapterCache.set('s1', createMockChapterInfo('c1', 'C1'));
      tracker._sceneChapterCache.set('s2', createMockChapterInfo('c2', 'C2'));

      tracker.clearCache();

      expect(tracker._sceneChapterCache.size).toBe(0);
    });

    it('should not affect current chapter or history', () => {
      tracker.setSelectedJournal('j1');
      mockParser._cachedContent.set('j1', { name: 'Adventure' });
      const entry = createFlatChapterEntry('c1', 'Chapter', { path: 'Chapter' });
      mockParser.getFlatChapterList.mockReturnValue([entry]);
      tracker.setManualChapter('c1');

      tracker.clearCache();

      expect(tracker.getCurrentChapter()).not.toBeNull();
    });
  });

  // =========================================================================
  // _buildChapterPath
  // =========================================================================

  describe('_buildChapterPath', () => {
    it('should use existing path if present', () => {
      const node = { path: 'Existing > Path', title: 'Title', type: 'heading', pageName: 'Page' };
      expect(tracker._buildChapterPath(node)).toBe('Existing > Path');
    });

    it('should return title for page-type nodes without path', () => {
      const node = { title: 'Page Title', type: 'page', pageName: 'Page Title' };
      expect(tracker._buildChapterPath(node)).toBe('Page Title');
    });

    it('should combine pageName and title for heading nodes', () => {
      const node = { title: 'Section', type: 'heading', pageName: 'Chapter 1' };
      expect(tracker._buildChapterPath(node)).toBe('Chapter 1 > Section');
    });

    it('should return just title when pageName equals title', () => {
      const node = { title: 'Same Name', type: 'heading', pageName: 'Same Name' };
      expect(tracker._buildChapterPath(node)).toBe('Same Name');
    });

    it('should return just title when pageName is falsy', () => {
      const node = { title: 'Solo', type: 'heading', pageName: '' };
      expect(tracker._buildChapterPath(node)).toBe('Solo');
    });
  });

  // =========================================================================
  // _findNodeById
  // =========================================================================

  describe('_findNodeById', () => {
    it('should find node at top level', () => {
      const nodes = [
        { id: 'a', children: [] },
        { id: 'b', children: [] }
      ];
      const result = tracker._findNodeById(nodes, 'b');
      expect(result).not.toBeNull();
      expect(result.id).toBe('b');
    });

    it('should find deeply nested node', () => {
      const nodes = [
        {
          id: 'a',
          children: [
            {
              id: 'a1',
              children: [
                { id: 'a1x', children: [] }
              ]
            }
          ]
        }
      ];
      const result = tracker._findNodeById(nodes, 'a1x');
      expect(result).not.toBeNull();
      expect(result.id).toBe('a1x');
    });

    it('should return null when node is not found', () => {
      const nodes = [{ id: 'a', children: [] }];
      const result = tracker._findNodeById(nodes, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should return null for empty nodes array', () => {
      const result = tracker._findNodeById([], 'anything');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // _updateSubchapters
  // =========================================================================

  describe('_updateSubchapters', () => {
    beforeEach(() => {
      tracker.setSelectedJournal('j1');
      mockParser._cachedContent.set('j1', { name: 'Adventure' });
    });

    it('should populate subchapters from chapter structure children', () => {
      const structure = {
        chapters: [{
          id: 'c1',
          title: 'Chapter 1',
          level: 0,
          type: 'page',
          children: [
            { id: 's1', title: 'Section A', level: 1, type: 'heading', children: [] },
            { id: 's2', title: 'Section B', level: 1, type: 'heading', children: [] }
          ]
        }]
      };
      mockParser.extractChapterStructure.mockReturnValue(structure);

      tracker._currentChapter = createMockChapterInfo('c1', 'Chapter 1', { path: 'Chapter 1' });
      tracker._updateSubchapters();

      expect(tracker._subchapters).toHaveLength(2);
      expect(tracker._subchapters[0].title).toBe('Section A');
      expect(tracker._subchapters[0].path).toBe('Chapter 1 > Section A');
      expect(tracker._subchapters[1].title).toBe('Section B');
    });

    it('should clear subchapters when no current chapter', () => {
      tracker._subchapters = [{ id: 'old', title: 'Old' }];
      tracker._currentChapter = null;
      tracker._updateSubchapters();
      expect(tracker._subchapters).toEqual([]);
    });

    it('should clear subchapters when structure is null', () => {
      tracker._currentChapter = createMockChapterInfo('c1', 'Chapter 1');
      mockParser.extractChapterStructure.mockReturnValue(null);

      tracker._updateSubchapters();
      expect(tracker._subchapters).toEqual([]);
    });

    it('should clear subchapters when current node has no children', () => {
      const structure = {
        chapters: [{
          id: 'c1',
          title: 'Leaf Chapter',
          level: 0,
          type: 'page',
          children: []
        }]
      };
      mockParser.extractChapterStructure.mockReturnValue(structure);

      tracker._currentChapter = createMockChapterInfo('c1', 'Leaf Chapter');
      tracker._updateSubchapters();
      expect(tracker._subchapters).toEqual([]);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle scene with no journal link and no name match gracefully', () => {
      tracker.setSelectedJournal('j1');
      mockParser.getChapterBySceneName.mockReturnValue(null);
      mockParser.searchByKeywords.mockReturnValue([]);

      const scene = createMockScene('s1', 'ab');
      const result = tracker.updateFromScene(scene);
      expect(result).toBeNull();
    });

    it('should handle _detectChapterByKeywords with short words only', () => {
      tracker.setSelectedJournal('j1');
      // Scene name with only 1-2 character words after cleanup
      const result = tracker._detectChapterByKeywords('a b');
      expect(result).toBeNull();
    });

    it('should handle _findChapterByPageId with null pageId', () => {
      const result = tracker._findChapterByPageId('j1', null);
      expect(result).toBeNull();
    });

    it('should handle _findChapterByPageId when parser is null', () => {
      tracker._journalParser = null;
      const result = tracker._findChapterByPageId('j1', 'p1');
      expect(result).toBeNull();
    });

    it('should handle getSubchapters returning a copy', () => {
      tracker._subchapters = [{ id: 's1', title: 'Sub' }];
      const subs1 = tracker.getSubchapters();
      const subs2 = tracker.getSubchapters();
      expect(subs1).not.toBe(subs2);
      expect(subs1).toEqual(subs2);
    });
  });
});
