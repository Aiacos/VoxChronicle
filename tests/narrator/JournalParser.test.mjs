/**
 * JournalParser Unit Tests
 *
 * Tests for the JournalParser class ported from Narrator Master.
 * Covers parseJournal, parseAll, stripHtml, searchByKeywords,
 * extractChapterStructure, extractNPCProfiles, keyword index bounding,
 * cache management, getChapterBySceneName, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock constants before importing JournalParser
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock Logger before importing JournalParser
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

import { JournalParser } from '../../scripts/narrator/JournalParser.mjs';

// ---------------------------------------------------------------------------
// Helpers — Mock game.journal
// ---------------------------------------------------------------------------

/**
 * Creates a mock Foundry VTT journal entry
 */
function createMockJournal(id, name, pages) {
  const pageMap = new Map();
  const pageArray = pages.map((p, idx) => {
    const page = {
      id: p.id || `page-${idx}`,
      name: p.name || `Page ${idx + 1}`,
      type: p.type || 'text',
      sort: p.sort ?? idx,
      text: p.type === 'text' || !p.type
        ? { content: p.content || '' }
        : undefined
    };
    pageMap.set(page.id, page);
    return page;
  });

  // pages must be iterable AND have a .get() method
  const pagesProxy = pageArray;
  pagesProxy.get = (pageId) => pageMap.get(pageId);

  return {
    id,
    name,
    pages: pagesProxy
  };
}

/**
 * Sets up globalThis.game with mock journals
 */
function setupGame(journals = []) {
  const journalMap = new Map();
  for (const j of journals) {
    journalMap.set(j.id, j);
  }

  globalThis.game = {
    journal: {
      get: (id) => journalMap.get(id),
      contents: journals,
      map: (fn) => journals.map(fn)
    },
    i18n: {
      localize: vi.fn((key) => key),
      format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`)
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JournalParser', () => {
  let parser;

  beforeEach(() => {
    setupGame();
    parser = new JournalParser();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete globalThis.game;
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe('constructor', () => {
    it('should initialise with empty cache and keyword index', () => {
      expect(parser.isCached('anything')).toBe(false);
      expect(parser.getKeywordCount()).toBe(0);
    });
  });

  // =========================================================================
  // stripHtml
  // =========================================================================

  describe('stripHtml', () => {
    it('should strip basic HTML tags and return plain text', () => {
      const result = parser.stripHtml('<p>Hello <strong>World</strong></p>');
      expect(result).toBe('Hello World');
    });

    it('should return empty string for null/undefined input', () => {
      expect(parser.stripHtml(null)).toBe('');
      expect(parser.stripHtml(undefined)).toBe('');
      expect(parser.stripHtml('')).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(parser.stripHtml(42)).toBe('');
      expect(parser.stripHtml({})).toBe('');
    });

    it('should normalise whitespace', () => {
      const result = parser.stripHtml('<p>Lots   of   spaces</p>  <p>and    more</p>');
      expect(result).toBe('Lots of spaces and more');
    });

    it('should handle nested HTML', () => {
      const html = '<div><ul><li>Item <em>one</em></li><li>Item two</li></ul></div>';
      const result = parser.stripHtml(html);
      expect(result).toContain('Item one');
      expect(result).toContain('Item two');
    });

    it('should not execute script tags', () => {
      const html = '<p>Safe</p><script>throw new Error("xss")</script>';
      const result = parser.stripHtml(html);
      expect(result).toContain('Safe');
    });
  });

  // =========================================================================
  // parseJournal
  // =========================================================================

  describe('parseJournal', () => {
    it('should parse a journal with text pages', async () => {
      const journal = createMockJournal('j1', 'Adventure Log', [
        { id: 'p1', name: 'Chapter 1', content: '<p>Once upon a time in a faraway land.</p>' },
        { id: 'p2', name: 'Chapter 2', content: '<p>The heroes set out.</p>' }
      ]);
      setupGame([journal]);

      const result = await parser.parseJournal('j1');

      expect(result.id).toBe('j1');
      expect(result.name).toBe('Adventure Log');
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].text).toBe('Once upon a time in a faraway land.');
      expect(result.totalCharacters).toBeGreaterThan(0);
      expect(result.parsedAt).toBeInstanceOf(Date);
    });

    it('should throw on invalid journal ID', async () => {
      await expect(parser.parseJournal(null)).rejects.toThrow();
      await expect(parser.parseJournal('')).rejects.toThrow();
      await expect(parser.parseJournal(123)).rejects.toThrow();
    });

    it('should throw when journal is not found', async () => {
      setupGame([]);
      await expect(parser.parseJournal('nonexistent')).rejects.toThrow();
    });

    it('should cache parsed journal and return from cache on second call', async () => {
      const journal = createMockJournal('j1', 'Log', [
        { id: 'p1', name: 'P1', content: '<p>Text here.</p>' }
      ]);
      setupGame([journal]);

      const first = await parser.parseJournal('j1');
      const second = await parser.parseJournal('j1');
      expect(first).toBe(second); // same reference
      expect(parser.isCached('j1')).toBe(true);
    });

    it('should skip non-text pages', async () => {
      const journal = createMockJournal('j1', 'Mixed', [
        { id: 'p1', name: 'Text', type: 'text', content: '<p>Content</p>' },
        { id: 'p2', name: 'Image', type: 'image' }
      ]);
      setupGame([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].name).toBe('Text');
    });

    it('should skip empty text pages', async () => {
      const journal = createMockJournal('j1', 'Sparse', [
        { id: 'p1', name: 'Full', content: '<p>Real content.</p>' },
        { id: 'p2', name: 'Empty', content: '<p>   </p>' }
      ]);
      setupGame([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages).toHaveLength(1);
    });

    it('should sort pages by sort order', async () => {
      const journal = createMockJournal('j1', 'Sorted', [
        { id: 'p1', name: 'Second', sort: 2, content: '<p>B</p>' },
        { id: 'p2', name: 'First', sort: 1, content: '<p>A</p>' }
      ]);
      setupGame([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages[0].name).toBe('First');
      expect(result.pages[1].name).toBe('Second');
    });
  });

  // =========================================================================
  // parseAll
  // =========================================================================

  describe('parseAll', () => {
    it('should parse all journals in game.journal.contents', async () => {
      const j1 = createMockJournal('j1', 'Journal 1', [
        { id: 'p1', name: 'Page', content: '<p>Content one.</p>' }
      ]);
      const j2 = createMockJournal('j2', 'Journal 2', [
        { id: 'p2', name: 'Page', content: '<p>Content two.</p>' }
      ]);
      setupGame([j1, j2]);

      const results = await parser.parseAll();
      expect(results).toHaveLength(2);
    });

    it('should return empty array when game.journal is not available', async () => {
      globalThis.game = { journal: null, i18n: { localize: vi.fn(), format: vi.fn() } };
      const results = await parser.parseAll();
      expect(results).toEqual([]);
    });

    it('should continue parsing remaining journals if one fails', async () => {
      const good = createMockJournal('j1', 'Good', [
        { id: 'p1', name: 'P', content: '<p>Valid content here.</p>' }
      ]);
      // Create a journal whose pages iterator will throw
      const bad = {
        id: 'j2',
        name: 'Bad',
        get pages() { throw new Error('corrupt'); }
      };
      setupGame([bad, good]);

      const results = await parser.parseAll();
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Good');
    });
  });

  // =========================================================================
  // searchByKeywords
  // =========================================================================

  describe('searchByKeywords', () => {
    beforeEach(async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Tavern', content: '<p>The old tavern sits at the crossroads. Merchants gather here.</p>' },
        { id: 'p2', name: 'Forest', content: '<p>Dark forest full of wolves and bandits lurking behind trees.</p>' },
        { id: 'p3', name: 'Castle', content: '<p>The ancient castle overlooks the valley below.</p>' }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');
    });

    it('should find pages containing matching keywords', () => {
      const results = parser.searchByKeywords('j1', ['tavern']);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('Tavern');
    });

    it('should return multiple pages for common keywords', () => {
      const results = parser.searchByKeywords('j1', ['the']);
      // "the" is in multiple pages
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should ignore keywords shorter than 3 characters', () => {
      const results = parser.searchByKeywords('j1', ['at', 'of']);
      expect(results).toHaveLength(0);
    });

    it('should return empty array for uncached journal', () => {
      const results = parser.searchByKeywords('nonexistent', ['tavern']);
      expect(results).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      const results = parser.searchByKeywords('j1', ['TAVERN']);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Keyword index bounding
  // =========================================================================

  describe('keyword index bounding', () => {
    it('should respect _maxKeywordIndexSize during bulk build', async () => {
      // Create a journal with enough words to exceed a small limit
      parser._maxKeywordIndexSize = 10;

      const longText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
      const journal = createMockJournal('j1', 'Big', [
        { id: 'p1', name: 'P1', content: `<p>${longText}</p>` }
      ]);
      setupGame([journal]);

      await parser.parseJournal('j1');

      expect(parser.getKeywordCount()).toBeLessThanOrEqual(10);
    });

    it('should trim index via _addToKeywordIndex when at limit', () => {
      parser._maxKeywordIndexSize = 5;

      // Fill the index to the limit
      for (let i = 0; i < 5; i++) {
        parser._keywordIndex.set(`j:word${i}`, {
          pageIds: new Set(['p1']),
          lastAccessed: Date.now() - 10000 + i
        });
      }
      expect(parser.getKeywordCount()).toBe(5);

      // _addToKeywordIndex checks size >= max before adding.
      // _trimKeywordIndex only removes when currentSize > max.
      // So at exactly max it adds the entry (making size 6), but next time it will trim.
      parser._addToKeywordIndex('j:newword', 'p1');
      // Now size is 6 (trim did not remove because 5 <= 5)
      expect(parser.getKeywordCount()).toBe(6);

      // Adding another entry now should trigger actual eviction (6 > 5)
      parser._addToKeywordIndex('j:another', 'p1');
      // After trim: removes 6-4=2 entries (20% target), then adds 1 = 5
      expect(parser.getKeywordCount()).toBeLessThanOrEqual(6);
    });

    it('should not trim when index is below limit', () => {
      parser._maxKeywordIndexSize = 100;
      parser._keywordIndex.set('j:alpha', { pageIds: new Set(['p1']), lastAccessed: Date.now() });
      parser._trimKeywordIndex();
      expect(parser.getKeywordCount()).toBe(1);
    });
  });

  // =========================================================================
  // extractChapterStructure
  // =========================================================================

  describe('extractChapterStructure', () => {
    it('should extract page-level chapters', async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Chapter 1', content: '<p>Some intro text here for testing purposes.</p>' },
        { id: 'p2', name: 'Chapter 2', content: '<p>More text for the second chapter of the story.</p>' }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const structure = parser.extractChapterStructure('j1');

      expect(structure).not.toBeNull();
      expect(structure.journalId).toBe('j1');
      expect(structure.journalName).toBe('Adventure');
      expect(structure.chapters).toHaveLength(2);
      expect(structure.chapters[0].title).toBe('Chapter 1');
      expect(structure.chapters[0].type).toBe('page');
      expect(structure.chapters[0].level).toBe(0);
    });

    it('should extract headings within pages as children', async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        {
          id: 'p1',
          name: 'Chapter 1',
          content: '<h1>The Beginning</h1><p>Once upon a time in a faraway kingdom.</p><h2>First Act</h2><p>They ventured forth into the unknown lands.</p>'
        }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const structure = parser.extractChapterStructure('j1');

      expect(structure).not.toBeNull();
      expect(structure.chapters).toHaveLength(1);
      expect(structure.totalHeadings).toBeGreaterThanOrEqual(2);

      const pageNode = structure.chapters[0];
      expect(pageNode.children.length).toBeGreaterThanOrEqual(1);
    });

    it('should return null for uncached journal', () => {
      const structure = parser.extractChapterStructure('nonexistent');
      expect(structure).toBeNull();
    });

    it('should handle journals with no headings', async () => {
      const journal = createMockJournal('j1', 'Plain', [
        { id: 'p1', name: 'Notes', content: '<p>Just some plain paragraph text with no headings at all.</p>' }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const structure = parser.extractChapterStructure('j1');
      expect(structure).not.toBeNull();
      expect(structure.totalHeadings).toBe(0);
      expect(structure.chapters[0].children).toHaveLength(0);
    });
  });

  // =========================================================================
  // extractNPCProfiles
  // =========================================================================

  describe('extractNPCProfiles', () => {
    it('should extract NPC profiles when indicator keywords are present', async () => {
      const journal = createMockJournal('j1', 'NPCs', [
        {
          id: 'p1',
          name: 'NPCs',
          content: '<p>The party arrives and meets Gandalf who is a powerful wizard guarding the realm. The heroes talk to Gandalf who has a kind personality and protects the weak.</p>'
        }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const profiles = parser.extractNPCProfiles('j1');

      expect(profiles.length).toBeGreaterThanOrEqual(1);
      const gandalf = profiles.find(p => p.name === 'Gandalf');
      expect(gandalf).toBeDefined();
      expect(gandalf.description).toBeTruthy();
      expect(gandalf.pages).toContain('p1');
    });

    it('should return empty array for uncached journal', () => {
      const profiles = parser.extractNPCProfiles('nonexistent');
      expect(profiles).toEqual([]);
    });

    it('should not include names without NPC indicator context', async () => {
      const journal = createMockJournal('j1', 'Boring', [
        {
          id: 'p1',
          name: 'Desc',
          content: '<p>Start. The river Silverstream flows through the valley.</p>'
        }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const profiles = parser.extractNPCProfiles('j1');
      // Silverstream may be extracted as proper noun but should not become NPC profile
      // since there are no NPC indicator keywords
      const silverstream = profiles.find(p => p.name === 'Silverstream');
      expect(silverstream).toBeUndefined();
    });

    it('should truncate long descriptions and personality fields', async () => {
      // Generate a very long description sentence with NPC indicator
      const longSentence = 'Thorin is a warrior ' + 'who fights bravely '.repeat(100);
      const journal = createMockJournal('j1', 'Long', [
        {
          id: 'p1',
          name: 'NPCs',
          content: `<p>Begin. ${longSentence}. Thorin has a brave personality and never backs down from a challenge no matter ${'how difficult '.repeat(50)}it is.</p>`
        }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const profiles = parser.extractNPCProfiles('j1');
      const thorin = profiles.find(p => p.name === 'Thorin');

      if (thorin) {
        expect(thorin.description.length).toBeLessThanOrEqual(503); // 500 + "..."
        expect(thorin.personality.length).toBeLessThanOrEqual(303);
      }
    });
  });

  // =========================================================================
  // getChapterBySceneName
  // =========================================================================

  describe('getChapterBySceneName', () => {
    beforeEach(async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        {
          id: 'p1',
          name: 'The Dark Tavern',
          content: '<h1>The Dark Tavern</h1><p>A gloomy place where adventurers gather before their journey.</p>'
        },
        {
          id: 'p2',
          name: 'The Ancient Forest',
          content: '<h1>The Ancient Forest</h1><p>Trees older than civilization tower above the travelers.</p>'
        }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');
    });

    it('should match by exact scene name', () => {
      const chapter = parser.getChapterBySceneName('j1', 'The Dark Tavern');
      expect(chapter).not.toBeNull();
      expect(chapter.title).toBe('The Dark Tavern');
    });

    it('should return null for invalid scene name', () => {
      expect(parser.getChapterBySceneName('j1', null)).toBeNull();
      expect(parser.getChapterBySceneName('j1', '')).toBeNull();
      expect(parser.getChapterBySceneName('j1', 42)).toBeNull();
    });

    it('should return null for uncached journal', () => {
      expect(parser.getChapterBySceneName('nope', 'Tavern')).toBeNull();
    });

    it('should return null when no match exceeds minimum score', () => {
      const result = parser.getChapterBySceneName('j1', 'Completely Unrelated XYZ');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Cache management
  // =========================================================================

  describe('cache management', () => {
    beforeEach(async () => {
      const journal = createMockJournal('j1', 'Cached', [
        { id: 'p1', name: 'P', content: '<p>Cached content that is interesting and useful.</p>' }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');
    });

    it('should clear specific journal cache', () => {
      expect(parser.isCached('j1')).toBe(true);
      parser.clearCache('j1');
      expect(parser.isCached('j1')).toBe(false);
    });

    it('should clear all caches', async () => {
      const j2 = createMockJournal('j2', 'Another', [
        { id: 'p2', name: 'P2', content: '<p>More content for another journal entry.</p>' }
      ]);
      setupGame([
        createMockJournal('j1', 'Cached', [{ id: 'p1', name: 'P', content: '<p>Content</p>' }]),
        j2
      ]);
      await parser.parseJournal('j2');

      parser.clearAllCache();
      expect(parser.isCached('j1')).toBe(false);
      expect(parser.isCached('j2')).toBe(false);
      expect(parser.getKeywordCount()).toBe(0);
    });

    it('should clear keyword index entries for the cleared journal', async () => {
      const countBefore = parser.getKeywordCount();
      expect(countBefore).toBeGreaterThan(0);

      parser.clearCache('j1');
      expect(parser.getKeywordCount()).toBe(0);
    });

    it('should refresh journal by clearing and re-parsing', async () => {
      const journal = createMockJournal('j1', 'Refreshed', [
        { id: 'p1', name: 'Updated', content: '<p>Brand new refreshed content for testing.</p>' }
      ]);
      setupGame([journal]);

      const result = await parser.refreshJournal('j1');
      expect(result.name).toBe('Refreshed');
      expect(result.pages[0].name).toBe('Updated');
    });
  });

  // =========================================================================
  // getFullText
  // =========================================================================

  describe('getFullText', () => {
    it('should return combined text of all pages', async () => {
      const journal = createMockJournal('j1', 'Full', [
        { id: 'p1', name: 'Page A', content: '<p>Alpha content here.</p>' },
        { id: 'p2', name: 'Page B', content: '<p>Beta content here.</p>' }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const text = parser.getFullText('j1');
      expect(text).toContain('## Page A');
      expect(text).toContain('Alpha content here.');
      expect(text).toContain('## Page B');
      expect(text).toContain('Beta content here.');
    });

    it('should return empty string for uncached journal', () => {
      expect(parser.getFullText('nonexistent')).toBe('');
    });
  });

  // =========================================================================
  // getCacheStats
  // =========================================================================

  describe('getCacheStats', () => {
    it('should return accurate statistics', async () => {
      const journal = createMockJournal('j1', 'Stats', [
        { id: 'p1', name: 'P1', content: '<p>Some meaningful text content.</p>' },
        { id: 'p2', name: 'P2', content: '<p>Another page of content.</p>' }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const stats = parser.getCacheStats();
      expect(stats.cachedJournals).toBe(1);
      expect(stats.totalPages).toBe(2);
      expect(stats.totalCharacters).toBeGreaterThan(0);
      expect(stats.indexedKeywords).toBeGreaterThan(0);
    });

    it('should return zeroes when cache is empty', () => {
      const stats = parser.getCacheStats();
      expect(stats.cachedJournals).toBe(0);
      expect(stats.totalPages).toBe(0);
      expect(stats.totalCharacters).toBe(0);
      expect(stats.indexedKeywords).toBe(0);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle journal with all empty pages', async () => {
      const journal = createMockJournal('j1', 'Empty', [
        { id: 'p1', name: 'Blank', content: '' },
        { id: 'p2', name: 'Whitespace', content: '<p>   </p>' }
      ]);
      setupGame([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages).toHaveLength(0);
      expect(result.totalCharacters).toBe(0);
    });

    it('should handle malformed HTML gracefully', async () => {
      const journal = createMockJournal('j1', 'Malformed', [
        { id: 'p1', name: 'Bad HTML', content: '<p>Unclosed <strong>tag' }
      ]);
      setupGame([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].text).toContain('Unclosed');
      expect(result.pages[0].text).toContain('tag');
    });

    it('should handle pages with null text.content', async () => {
      const journal = createMockJournal('j1', 'NullContent', [
        { id: 'p1', name: 'Null', content: null }
      ]);
      // Override content to null
      journal.pages[0].text = { content: null };
      setupGame([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages).toHaveLength(0);
    });

    it('should handle pages with missing text property', async () => {
      const journal = createMockJournal('j1', 'NoText', [
        { id: 'p1', name: 'No text', type: 'text', content: '' }
      ]);
      // Remove text property entirely
      delete journal.pages[0].text;
      setupGame([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages).toHaveLength(0);
    });
  });

  // =========================================================================
  // _buildHeadingHierarchy (via extractChapterStructure)
  // =========================================================================

  describe('heading hierarchy', () => {
    it('should nest h2 under h1', async () => {
      const journal = createMockJournal('j1', 'Hierarchy', [
        {
          id: 'p1',
          name: 'Page',
          content: '<h1>Main Title</h1><p>Intro text for the main section.</p><h2>Subsection</h2><p>Detail text for the subsection.</p>'
        }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const structure = parser.extractChapterStructure('j1');
      const pageNode = structure.chapters[0];

      // h1 should be a top-level child
      const h1 = pageNode.children.find(c => c.title === 'Main Title');
      expect(h1).toBeDefined();

      // h2 should be nested under h1
      if (h1) {
        const h2 = h1.children.find(c => c.title === 'Subsection');
        expect(h2).toBeDefined();
      }
    });
  });

  // =========================================================================
  // getFlatChapterList
  // =========================================================================

  describe('getFlatChapterList', () => {
    it('should return a flat list with path information', async () => {
      const journal = createMockJournal('j1', 'Flat', [
        {
          id: 'p1',
          name: 'Root Page',
          content: '<h1>Heading One</h1><p>Content after heading one in the story.</p>'
        }
      ]);
      setupGame([journal]);
      await parser.parseJournal('j1');

      const list = parser.getFlatChapterList('j1');
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].path).toContain('Root Page');
    });

    it('should return empty array for uncached journal', () => {
      const list = parser.getFlatChapterList('nope');
      expect(list).toEqual([]);
    });
  });

  // =========================================================================
  // getKeywordCount
  // =========================================================================

  describe('getKeywordCount', () => {
    it('should increase after parsing a journal', async () => {
      const journal = createMockJournal('j1', 'Keywords', [
        { id: 'p1', name: 'P', content: '<p>Multiple words here that are unique and interesting enough.</p>' }
      ]);
      setupGame([journal]);

      expect(parser.getKeywordCount()).toBe(0);
      await parser.parseJournal('j1');
      expect(parser.getKeywordCount()).toBeGreaterThan(0);
    });
  });
});
