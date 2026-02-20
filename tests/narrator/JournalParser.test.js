import { JournalParser } from '../../scripts/narrator/JournalParser.mjs';

// Suppress Logger console output in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * Creates a mock Foundry journal with pages
 */
function createMockJournal(id, name, pages = []) {
  const pageMap = new Map();
  const pageArray = pages.map((p, idx) => {
    const page = {
      id: p.id || `page-${idx}`,
      name: p.name || `Page ${idx}`,
      type: p.type || 'text',
      sort: p.sort ?? idx,
      text: { content: p.content || '' }
    };
    pageMap.set(page.id, page);
    return page;
  });

  // Make pages iterable and have .get()
  pageArray.get = (pageId) => pageMap.get(pageId);
  pageArray[Symbol.iterator] = function* () {
    for (const page of pages.map((p, idx) => ({
      id: p.id || `page-${idx}`,
      name: p.name || `Page ${idx}`,
      type: p.type || 'text',
      sort: p.sort ?? idx,
      text: { content: p.content || '' }
    }))) {
      yield page;
    }
  };

  return {
    id,
    name,
    pages: pageArray
  };
}

/**
 * Sets up game.journal with the provided journals
 */
function setupGameJournal(journals = []) {
  const journalMap = new Map(journals.map(j => [j.id, j]));

  game.journal = {
    get: vi.fn((id) => journalMap.get(id)),
    contents: journals
  };
}

describe('JournalParser', () => {
  let parser;

  beforeEach(() => {
    parser = new JournalParser();
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('initializes with empty state', () => {
      expect(parser._cachedContent.size).toBe(0);
      expect(parser._keywordIndex.size).toBe(0);
    });
  });

  // =========================================================================
  // parseJournal()
  // =========================================================================
  describe('parseJournal()', () => {
    it('throws for null/invalid journal ID', async () => {
      await expect(parser.parseJournal(null)).rejects.toThrow();
      await expect(parser.parseJournal('')).rejects.toThrow();
      await expect(parser.parseJournal(123)).rejects.toThrow();
    });

    it('throws when journal not found', async () => {
      setupGameJournal([]);
      await expect(parser.parseJournal('nonexistent')).rejects.toThrow();
    });

    it('parses journal with text pages', async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Chapter 1', content: '<p>The heroes arrive at the tavern.</p>' },
        { id: 'p2', name: 'Chapter 2', content: '<p>A dark forest awaits.</p>' }
      ]);
      setupGameJournal([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.id).toBe('j1');
      expect(result.name).toBe('Adventure');
      expect(result.pages).toHaveLength(2);
      expect(result.totalCharacters).toBeGreaterThan(0);
      expect(result.parsedAt).toBeInstanceOf(Date);
    });

    it('returns cached result on second call', async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Ch1', content: '<p>Content</p>' }
      ]);
      setupGameJournal([journal]);

      const result1 = await parser.parseJournal('j1');
      const result2 = await parser.parseJournal('j1');
      expect(result1).toBe(result2);
    });

    it('skips non-text pages', async () => {
      const journal = createMockJournal('j1', 'Mixed', [
        { id: 'p1', name: 'Text Page', type: 'text', content: '<p>Content</p>' },
        { id: 'p2', name: 'Image Page', type: 'image', content: '' }
      ]);
      setupGameJournal([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages).toHaveLength(1);
    });

    it('skips pages with empty content', async () => {
      const journal = createMockJournal('j1', 'Sparse', [
        { id: 'p1', name: 'Content Page', content: '<p>Has content.</p>' },
        { id: 'p2', name: 'Empty Page', content: '<p>   </p>' }
      ]);
      setupGameJournal([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages).toHaveLength(1);
    });

    it('sorts pages by sort order', async () => {
      const journal = createMockJournal('j1', 'Sorted', [
        { id: 'p1', name: 'Second', sort: 2, content: '<p>Second</p>' },
        { id: 'p2', name: 'First', sort: 1, content: '<p>First</p>' }
      ]);
      setupGameJournal([journal]);

      const result = await parser.parseJournal('j1');
      expect(result.pages[0].name).toBe('First');
      expect(result.pages[1].name).toBe('Second');
    });
  });

  // =========================================================================
  // parseAll()
  // =========================================================================
  describe('parseAll()', () => {
    it('returns empty array when game.journal not available', async () => {
      game.journal = undefined;
      const result = await parser.parseAll();
      expect(result).toEqual([]);
    });

    it('parses all journals', async () => {
      const j1 = createMockJournal('j1', 'Journal 1', [
        { id: 'p1', name: 'Page 1', content: '<p>Content 1</p>' }
      ]);
      const j2 = createMockJournal('j2', 'Journal 2', [
        { id: 'p2', name: 'Page 2', content: '<p>Content 2</p>' }
      ]);
      setupGameJournal([j1, j2]);

      const result = await parser.parseAll();
      expect(result).toHaveLength(2);
    });

    it('handles individual journal parse errors gracefully', async () => {
      const j1 = createMockJournal('j1', 'Good Journal', [
        { id: 'p1', name: 'Page', content: '<p>Content</p>' }
      ]);
      // Set up a journal that will fail when parsed
      setupGameJournal([j1, { id: 'j2', name: 'Bad Journal' }]);
      // Override get to return null for j2
      game.journal.get = vi.fn((id) => {
        if (id === 'j1') return j1;
        return null; // j2 will throw
      });

      const result = await parser.parseAll();
      expect(result).toHaveLength(1); // Only j1 succeeds
    });
  });

  // =========================================================================
  // stripHtml()
  // =========================================================================
  describe('stripHtml()', () => {
    it('returns empty for null/undefined', () => {
      expect(parser.stripHtml(null)).toBe('');
      expect(parser.stripHtml(undefined)).toBe('');
    });

    it('returns empty for non-string', () => {
      expect(parser.stripHtml(123)).toBe('');
    });

    it('strips HTML tags and normalizes whitespace', () => {
      expect(parser.stripHtml('<p>Hello   <strong>World</strong></p>')).toBe('Hello World');
    });
  });

  // =========================================================================
  // searchByKeywords()
  // =========================================================================
  describe('searchByKeywords()', () => {
    beforeEach(async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Tavern', content: '<p>The heroes enter the tavern and find a merchant.</p>' },
        { id: 'p2', name: 'Forest', content: '<p>A dark forest with ancient trees.</p>' }
      ]);
      setupGameJournal([journal]);
      await parser.parseJournal('j1');
    });

    it('returns empty for uncached journal', () => {
      expect(parser.searchByKeywords('nonexistent', ['tavern'])).toEqual([]);
    });

    it('returns matching pages', () => {
      const results = parser.searchByKeywords('j1', ['tavern']);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Tavern');
    });

    it('skips keywords shorter than 3 chars', () => {
      const results = parser.searchByKeywords('j1', ['ab', 'tavern']);
      expect(results.length).toBeGreaterThan(0);
    });

    it('getKeywordCount() returns current index size', () => {
      expect(parser.getKeywordCount()).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Chapter structure
  // =========================================================================
  describe('extractChapterStructure()', () => {
    it('returns null for uncached journal', () => {
      expect(parser.extractChapterStructure('nonexistent')).toBeNull();
    });

    it('extracts chapter structure from HTML headings', async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Chapter 1', content: '<h1>Introduction</h1><p>Story begins.</p><h2>Scene 1</h2><p>Details.</p>' }
      ]);
      setupGameJournal([journal]);
      await parser.parseJournal('j1');

      const structure = parser.extractChapterStructure('j1');
      expect(structure).not.toBeNull();
      expect(structure.journalId).toBe('j1');
      expect(structure.chapters).toHaveLength(1);
      expect(structure.chapters[0].type).toBe('page');
    });
  });

  describe('getFlatChapterList()', () => {
    it('returns empty for uncached journal', () => {
      expect(parser.getFlatChapterList('nonexistent')).toEqual([]);
    });

    it('returns flat list of chapters', async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Page 1', content: '<h1>Heading</h1><p>Content.</p>' }
      ]);
      setupGameJournal([journal]);
      await parser.parseJournal('j1');

      const list = parser.getFlatChapterList('j1');
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('title');
      expect(list[0]).toHaveProperty('path');
    });
  });

  describe('getChapterBySceneName()', () => {
    beforeEach(async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'The Dark Tavern', content: '<h1>The Dark Tavern</h1><p>A gloomy tavern.</p>' },
        { id: 'p2', name: 'Forest of Shadows', content: '<h2>Forest of Shadows</h2><p>A dark forest.</p>' }
      ]);
      setupGameJournal([journal]);
      await parser.parseJournal('j1');
    });

    it('returns null for invalid scene name', () => {
      expect(parser.getChapterBySceneName('j1', null)).toBeNull();
      expect(parser.getChapterBySceneName('j1', '')).toBeNull();
    });

    it('returns null for uncached journal', () => {
      expect(parser.getChapterBySceneName('nonexistent', 'test')).toBeNull();
    });

    it('matches scene name to chapter title', () => {
      const result = parser.getChapterBySceneName('j1', 'The Dark Tavern');
      expect(result).not.toBeNull();
    });

    it('matches scene name with prefix to chapter title', () => {
      const result = parser.getChapterBySceneName('j1', 'Scene 1: The Dark Tavern');
      expect(result).not.toBeNull();
      expect(result.title).toBe('The Dark Tavern');
    });
  });

  // =========================================================================
  // NPC Profiles
  // =========================================================================
  describe('extractNPCProfiles()', () => {
    it('returns empty for uncached journal', () => {
      expect(parser.extractNPCProfiles('nonexistent')).toEqual([]);
    });

    it('extracts NPC profiles from journal content', async () => {
      // NPC name must appear mid-sentence (not first word) for proper noun detection,
      // since _extractProperNouns skips the first word of each sentence.
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'NPCs', content: '<p>The party met a gruff blacksmith named Thorin at the forge. The villagers say Thorin has a personality of being stubborn and brave.</p>' }
      ]);
      setupGameJournal([journal]);
      await parser.parseJournal('j1');

      const profiles = parser.extractNPCProfiles('j1');
      expect(profiles.length).toBeGreaterThanOrEqual(1);
      const thorin = profiles.find(p => p.name === 'Thorin');
      expect(thorin).toBeDefined();
      expect(thorin.description).toBeTruthy();
      expect(thorin.description.length).toBeGreaterThan(0);
      expect(thorin.pages).toContain('p1');
    });
  });

  // =========================================================================
  // Cache management
  // =========================================================================
  describe('cache management', () => {
    beforeEach(async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Page', content: '<p>Content here.</p>' }
      ]);
      setupGameJournal([journal]);
      await parser.parseJournal('j1');
    });

    it('isCached() returns true for cached journal', () => {
      expect(parser.isCached('j1')).toBe(true);
    });

    it('isCached() returns false for uncached journal', () => {
      expect(parser.isCached('nonexistent')).toBe(false);
    });

    it('clearCache() clears specific journal', () => {
      parser.clearCache('j1');
      expect(parser.isCached('j1')).toBe(false);
    });

    it('clearAllCache() clears everything', () => {
      parser.clearAllCache();
      expect(parser._cachedContent.size).toBe(0);
      expect(parser._keywordIndex.size).toBe(0);
    });

    it('refreshJournal() re-parses journal', async () => {
      const result = await parser.refreshJournal('j1');
      expect(result.id).toBe('j1');
    });

    it('getFullText() returns combined text', () => {
      const text = parser.getFullText('j1');
      expect(text).toContain('Content here');
    });

    it('getFullText() returns empty for uncached', () => {
      expect(parser.getFullText('nonexistent')).toBe('');
    });

    it('getCacheStats() returns correct stats', () => {
      const stats = parser.getCacheStats();
      expect(stats.cachedJournals).toBe(1);
      expect(stats.totalPages).toBeGreaterThan(0);
      expect(stats.totalCharacters).toBeGreaterThan(0);
      expect(stats.indexedKeywords).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Text chunking
  // =========================================================================
  describe('getChunksForEmbedding()', () => {
    it('returns chunks from journal', async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Long Page', content: '<p>' + 'This is a long sentence. '.repeat(50) + '</p>' }
      ]);
      setupGameJournal([journal]);

      const chunks = await parser.getChunksForEmbedding('j1', { chunkSize: 100, overlap: 20 });
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].metadata.source).toBe('journal');
      expect(chunks[0].metadata.journalId).toBe('j1');
    });
  });

  describe('getChunksForEmbeddingAll()', () => {
    it('returns chunks from all cached journals', async () => {
      const journal = createMockJournal('j1', 'Adventure', [
        { id: 'p1', name: 'Page', content: '<p>Short content.</p>' }
      ]);
      setupGameJournal([journal]);
      await parser.parseJournal('j1');

      const chunks = await parser.getChunksForEmbeddingAll();
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Private: _chunkText()
  // =========================================================================
  describe('_chunkText()', () => {
    it('returns empty for null/empty text', () => {
      expect(parser._chunkText(null)).toEqual([]);
      expect(parser._chunkText('')).toEqual([]);
    });

    it('returns single chunk for short text', () => {
      const chunks = parser._chunkText('Short text.', 500);
      expect(chunks).toHaveLength(1);
    });

    it('creates overlapping chunks', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
      const chunks = parser._chunkText(text, 30, 10);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  // =========================================================================
  // Private: _extractSearchTermsFromSceneName()
  // =========================================================================
  describe('_extractSearchTermsFromSceneName()', () => {
    it('handles simple scene name', () => {
      const terms = parser._extractSearchTermsFromSceneName('The Dark Forest');
      expect(terms.length).toBeGreaterThan(0);
      expect(terms.some(t => t.includes('dark') || t.includes('forest'))).toBe(true);
    });

    it('handles scene name with chapter prefix', () => {
      const terms = parser._extractSearchTermsFromSceneName('Chapter 1: The Tavern');
      expect(terms.length).toBeGreaterThan(0);
    });

    it('handles scene name with number prefix', () => {
      const terms = parser._extractSearchTermsFromSceneName('1. The Beginning');
      expect(terms.length).toBeGreaterThan(0);
    });

    it('handles Italian prefixes', () => {
      const terms = parser._extractSearchTermsFromSceneName('Capitolo 3: La Foresta');
      expect(terms.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Private: _calculateChapterMatchScore()
  // =========================================================================
  describe('_calculateChapterMatchScore()', () => {
    it('returns 0 for empty inputs', () => {
      expect(parser._calculateChapterMatchScore('', [], 'scene')).toBe(0);
      expect(parser._calculateChapterMatchScore('title', [], 'scene')).toBe(0);
    });

    it('returns 1.0 for exact match', () => {
      const score = parser._calculateChapterMatchScore('The Dark Forest', ['the dark forest'], 'The Dark Forest');
      expect(score).toBe(1.0);
    });

    it('returns high score for partial match', () => {
      const score = parser._calculateChapterMatchScore('The Dark Forest', ['dark', 'forest'], 'Dark Forest');
      expect(score).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Private: _trimKeywordIndex()
  // =========================================================================
  describe('_trimKeywordIndex()', () => {
    it('trims when over limit', () => {
      parser._maxKeywordIndexSize = 5;
      for (let i = 0; i < 10; i++) {
        parser._keywordIndex.set(`key-${i}`, {
          pageIds: new Set([`page-${i}`]),
          lastAccessed: Date.now()
        });
      }
      parser._trimKeywordIndex();
      expect(parser._keywordIndex.size).toBeLessThanOrEqual(5);
    });

    it('does nothing when under limit', () => {
      parser._maxKeywordIndexSize = 100;
      parser._keywordIndex.set('k1', { pageIds: new Set(['p1']), lastAccessed: Date.now() });
      parser._trimKeywordIndex();
      expect(parser._keywordIndex.size).toBe(1);
    });
  });

  // =========================================================================
  // Private: _addToKeywordIndex()
  // =========================================================================
  describe('_addToKeywordIndex()', () => {
    it('adds new keyword entry', () => {
      parser._addToKeywordIndex('j1:tavern', 'p1');
      expect(parser._keywordIndex.has('j1:tavern')).toBe(true);
    });

    it('adds to existing keyword entry', () => {
      parser._addToKeywordIndex('j1:tavern', 'p1');
      parser._addToKeywordIndex('j1:tavern', 'p2');
      const entry = parser._keywordIndex.get('j1:tavern');
      expect(entry.pageIds.size).toBe(2);
    });

    it('triggers trim when at limit', () => {
      parser._maxKeywordIndexSize = 3;
      parser._addToKeywordIndex('k1', 'p1');
      parser._addToKeywordIndex('k2', 'p2');
      parser._addToKeywordIndex('k3', 'p3');
      parser._addToKeywordIndex('k4', 'p4'); // Should trigger trim
      expect(parser._keywordIndex.size).toBeLessThanOrEqual(4); // After trim + add
    });
  });

  // =========================================================================
  // Private: _buildHeadingHierarchy()
  // =========================================================================
  describe('_buildHeadingHierarchy()', () => {
    it('returns empty array for empty input', () => {
      expect(parser._buildHeadingHierarchy([], 0)).toEqual([]);
      expect(parser._buildHeadingHierarchy(null, 0)).toEqual([]);
    });

    it('nests h2 under h1', () => {
      const headings = [
        { level: 1, title: 'Chapter 1', position: 0, content: 'Intro', pageId: 'p1', pageName: 'Page' },
        { level: 2, title: 'Scene A', position: 100, content: 'Details', pageId: 'p1', pageName: 'Page' }
      ];
      const result = parser._buildHeadingHierarchy(headings, 0);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Chapter 1');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].title).toBe('Scene A');
    });

    it('places sibling h2s at the same level', () => {
      const headings = [
        { level: 1, title: 'Chapter 1', position: 0, content: '', pageId: 'p1', pageName: 'Page' },
        { level: 2, title: 'Scene A', position: 50, content: '', pageId: 'p1', pageName: 'Page' },
        { level: 2, title: 'Scene B', position: 100, content: '', pageId: 'p1', pageName: 'Page' }
      ];
      const result = parser._buildHeadingHierarchy(headings, 0);
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children[0].title).toBe('Scene A');
      expect(result[0].children[1].title).toBe('Scene B');
    });

    it('builds three-level hierarchy (h1 > h2 > h3)', () => {
      const headings = [
        { level: 1, title: 'Act I', position: 0, content: '', pageId: 'p1', pageName: 'Page' },
        { level: 2, title: 'Chapter 1', position: 50, content: '', pageId: 'p1', pageName: 'Page' },
        { level: 3, title: 'Scene 1', position: 100, content: '', pageId: 'p1', pageName: 'Page' }
      ];
      const result = parser._buildHeadingHierarchy(headings, 0);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Act I');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].title).toBe('Chapter 1');
      expect(result[0].children[0].children).toHaveLength(1);
      expect(result[0].children[0].children[0].title).toBe('Scene 1');
    });

    it('handles multiple h1 siblings at root level', () => {
      const headings = [
        { level: 1, title: 'Part 1', position: 0, content: '', pageId: 'p1', pageName: 'Page' },
        { level: 1, title: 'Part 2', position: 100, content: '', pageId: 'p1', pageName: 'Page' }
      ];
      const result = parser._buildHeadingHierarchy(headings, 0);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Part 1');
      expect(result[1].title).toBe('Part 2');
    });

    it('assigns unique node IDs', () => {
      const headings = [
        { level: 1, title: 'A', position: 0, content: '', pageId: 'p1', pageName: 'Page' },
        { level: 2, title: 'B', position: 50, content: '', pageId: 'p1', pageName: 'Page' }
      ];
      const result = parser._buildHeadingHierarchy(headings, 10);
      expect(result[0].id).toBe('node-11');
      expect(result[0].children[0].id).toBe('node-12');
    });
  });

  // =========================================================================
  // Private: _extractSectionMarkers()
  // =========================================================================
  describe('_extractSectionMarkers()', () => {
    it('detects HR elements as section markers', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>Before</p><hr><p>After the break</p>';
      const markers = parser._extractSectionMarkers(div, 'p1', 'Page 1');
      expect(markers.length).toBeGreaterThanOrEqual(1);
      expect(markers[0].type).toBe('section');
      expect(markers[0].level).toBe(7);
      expect(markers[0].pageId).toBe('p1');
      expect(markers[0].pageName).toBe('Page 1');
    });

    it('skips HR without content after it', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>Before</p><hr>';
      const markers = parser._extractSectionMarkers(div, 'p1', 'Page 1');
      const hrMarkers = markers.filter(m => m.title === '---' || m.title === 'VOXCHRONICLE.Journal.SectionBreak');
      expect(hrMarkers).toHaveLength(0);
    });

    it('detects elements with section-marking CSS classes', () => {
      const div = document.createElement('div');
      div.innerHTML = '<div class="scene">The Dark Forest</div>';
      const markers = parser._extractSectionMarkers(div, 'p1', 'Page 1');
      expect(markers.length).toBeGreaterThanOrEqual(1);
      expect(markers[0].type).toBe('section');
      expect(markers[0].title).toBe('The Dark Forest');
    });

    it('detects elements with chapter CSS class', () => {
      const div = document.createElement('div');
      div.innerHTML = '<div class="chapter">Chapter One</div>';
      const markers = parser._extractSectionMarkers(div, 'p1', 'Page 1');
      expect(markers.length).toBeGreaterThanOrEqual(1);
      expect(markers[0].title).toBe('Chapter One');
    });

    it('skips heading elements even with section class', () => {
      const div = document.createElement('div');
      div.innerHTML = '<h2 class="scene">Scene Title</h2>';
      const markers = parser._extractSectionMarkers(div, 'p1', 'Page 1');
      // h2 with .scene class should be skipped (headings handled elsewhere)
      expect(markers).toHaveLength(0);
    });

    it('returns empty array for content without markers', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>Just a paragraph.</p>';
      const markers = parser._extractSectionMarkers(div, 'p1', 'Page 1');
      expect(markers).toEqual([]);
    });
  });

  // =========================================================================
  // Private: _findChapterNodeById()
  // =========================================================================
  describe('_findChapterNodeById()', () => {
    it('finds node at root level', () => {
      const chapters = [{ id: 'a', children: [] }, { id: 'b', children: [] }];
      expect(parser._findChapterNodeById(chapters, 'b').id).toBe('b');
    });

    it('finds nested node', () => {
      const chapters = [{ id: 'a', children: [{ id: 'b', children: [] }] }];
      expect(parser._findChapterNodeById(chapters, 'b').id).toBe('b');
    });

    it('returns null when not found', () => {
      expect(parser._findChapterNodeById([{ id: 'a', children: [] }], 'z')).toBeNull();
    });
  });
});
