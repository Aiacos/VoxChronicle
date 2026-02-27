import { CompendiumParser } from '../../scripts/narrator/CompendiumParser.mjs';

// Suppress Logger console output in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * Creates a mock compendium pack
 */
function createMockPack(type = 'JournalEntry', docs = [], options = {}) {
  const packId = options.id || `world.${type.toLowerCase()}-pack`;
  const packLabel = options.label || `Test ${type} Pack`;

  const indexEntries = docs.map(d => ({
    _id: d.id,
    name: d.name,
    type: d.type || type
  }));

  // Create an iterable index with size property
  const indexMap = new Map(indexEntries.map(e => [e._id, e]));
  const index = {
    size: indexEntries.length,
    [Symbol.iterator]: function* () {
      for (const entry of indexEntries) {
        yield entry;
      }
    }
  };

  return {
    collection: packId,
    documentName: type,
    title: packLabel,
    metadata: {
      id: packId,
      label: packLabel,
      type
    },
    getIndex: vi.fn().mockResolvedValue(index),
    getDocument: vi.fn().mockImplementation(async (id) => docs.find(d => d.id === id) || null)
  };
}

/**
 * Creates a mock JournalEntry document
 */
function createMockJournalDoc(id, name, pages = []) {
  return {
    id,
    name,
    pages: pages.map(p => ({
      type: 'text',
      name: p.name,
      text: { content: p.content }
    }))
  };
}

/**
 * Creates a mock Item document
 */
function createMockItemDoc(id, name, type, description, source = '') {
  return {
    id,
    name,
    type,
    system: {
      description: { value: `<p>${description}</p>` },
      source
    }
  };
}

/**
 * Creates a mock RollTable document
 */
function createMockRollTableDoc(id, name, description = '', results = []) {
  return {
    id,
    name,
    description: `<p>${description}</p>`,
    results: {
      size: results.length,
      [Symbol.iterator]: function* () {
        for (const r of results) {
          yield r;
        }
      }
    }
  };
}

/**
 * Creates a mock Actor document
 */
function createMockActorDoc(id, name, type = 'npc', bio = '') {
  return {
    id,
    name,
    type,
    system: {
      details: {
        biography: { value: `<p>${bio}</p>` }
      }
    }
  };
}

describe('CompendiumParser', () => {
  let parser;

  beforeEach(() => {
    parser = new CompendiumParser();
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('initializes with empty caches', () => {
      expect(parser._cachedContent.size).toBe(0);
      expect(parser._keywordIndex.size).toBe(0);
      expect(parser._journalCompendiums).toEqual([]);
      expect(parser._rulesCompendiums).toEqual([]);
    });
  });

  // =========================================================================
  // parseJournalCompendiums()
  // =========================================================================
  describe('parseJournalCompendiums()', () => {
    it('returns empty array when game.packs not available', async () => {
      game.packs = undefined;
      const result = await parser.parseJournalCompendiums();
      expect(result).toEqual([]);
    });

    it('parses journal compendium packs', async () => {
      const doc = createMockJournalDoc('j1', 'Tavern Scene', [
        { name: 'Page 1', content: '<p>The tavern is dark and gloomy.</p>' }
      ]);

      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);

      const result = await parser.parseJournalCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].entries).toHaveLength(1);
      expect(result[0].entries[0].name).toBe('Tavern Scene');
    });

    it('skips empty packs', async () => {
      const pack = createMockPack('JournalEntry', []);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);

      const result = await parser.parseJournalCompendiums();
      expect(result).toEqual([]);
    });

    it('handles pack parsing errors gracefully', async () => {
      const pack = createMockPack('JournalEntry', []);
      pack.getIndex.mockRejectedValue(new Error('Access denied'));
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);

      const result = await parser.parseJournalCompendiums();
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // parseRulesCompendiums()
  // =========================================================================
  describe('parseRulesCompendiums()', () => {
    it('returns empty array when game.packs not available', async () => {
      game.packs = undefined;
      const result = await parser.parseRulesCompendiums();
      expect(result).toEqual([]);
    });

    it('parses Item compendiums', async () => {
      const doc = createMockItemDoc('i1', 'Fireball', 'spell', 'A ball of fire.', 'PHB');
      const pack = createMockPack('Item', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);

      const result = await parser.parseRulesCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].entries[0].name).toBe('Fireball');
    });

    it('includes RollTable compendiums', async () => {
      const doc = createMockRollTableDoc('rt1', 'Wild Magic', 'Random effects', [
        { range: [1, 10], text: 'Nothing happens' }
      ]);
      const pack = createMockPack('RollTable', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);

      const result = await parser.parseRulesCompendiums();
      expect(result).toHaveLength(1);
    });

    it('includes rules-related journal compendiums', async () => {
      const doc = createMockJournalDoc('j1', 'SRD Rules', [
        { name: 'Combat', content: '<p>Combat rules content</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc], {
        id: 'world.srd-rules',
        label: 'SRD Rules'
      });
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);

      const result = await parser.parseRulesCompendiums();
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // search()
  // =========================================================================
  describe('search()', () => {
    beforeEach(async () => {
      const doc1 = createMockJournalDoc('j1', 'Fireball Spell', [
        { name: 'Description', content: '<p>Fireball deals massive fire damage.</p>' }
      ]);
      const doc2 = createMockJournalDoc('j2', 'Ice Storm', [
        { name: 'Description', content: '<p>Ice storm creates a frigid area.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc1, doc2]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();
    });

    it('returns empty for null/empty query', () => {
      expect(parser.search(null)).toEqual([]);
      expect(parser.search('')).toEqual([]);
    });

    it('returns empty for query with only short words', () => {
      expect(parser.search('a b')).toEqual([]);
    });

    it('finds entries by name', () => {
      const results = parser.search('Fireball');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.name).toBe('Fireball Spell');
    });

    it('finds entries by content', () => {
      const results = parser.search('massive fire damage');
      expect(results.length).toBeGreaterThan(0);
    });

    it('sorts results by score (highest first)', () => {
      const results = parser.search('Fireball');
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });
  });

  // =========================================================================
  // searchByKeywords()
  // =========================================================================
  describe('searchByKeywords()', () => {
    it('returns empty for uncached pack', () => {
      expect(parser.searchByKeywords('nonexistent', ['test'])).toEqual([]);
    });

    it('returns matching entries', async () => {
      const doc = createMockJournalDoc('j1', 'Test Entry', [
        { name: 'Page', content: '<p>The tavern is very large.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

      const packId = pack.collection;
      const results = parser.searchByKeywords(packId, ['tavern']);
      expect(results.length).toBeGreaterThan(0);
    });

    it('skips keywords shorter than 2 chars', async () => {
      const doc = createMockJournalDoc('j1', 'Test', [
        { name: 'P', content: '<p>Some content.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

      const results = parser.searchByKeywords(pack.collection, ['a']);
      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // searchByType()
  // =========================================================================
  describe('searchByType()', () => {
    it('filters results by document type', async () => {
      const doc = createMockJournalDoc('j1', 'Rules Doc', [
        { name: 'Combat', content: '<p>Rules for combat.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

      const results = parser.searchByType('Rules', 'JournalEntry');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.entry.type === 'JournalEntry')).toBe(true);
    });

    it('returns empty when type does not match', async () => {
      const doc = createMockJournalDoc('j1', 'Rules', [{ name: 'P', content: '<p>Content</p>' }]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

      const results = parser.searchByType('Rules', 'Item');
      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // Content retrieval
  // =========================================================================
  describe('getContentForAI()', () => {
    it('returns empty string when no compendiums', () => {
      expect(parser.getContentForAI()).toBe('');
    });

    it('returns formatted content', async () => {
      const doc = createMockJournalDoc('j1', 'Adventure', [
        { name: 'Page', content: '<p>Some adventure content.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

      const content = parser.getContentForAI();
      expect(content).toContain('COMPENDIUM CONTENT');
      expect(content).toContain('Adventure');
    });

    it('truncates at maxLength', async () => {
      const doc = createMockJournalDoc('j1', 'Huge', [
        { name: 'Page', content: '<p>' + 'x'.repeat(50000) + '</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

      const content = parser.getContentForAI(100);
      expect(content.length).toBeLessThan(200);
    });
  });

  describe('getJournalContentForAI()', () => {
    it('returns empty when no journal compendiums', () => {
      expect(parser.getJournalContentForAI()).toBe('');
    });
  });

  describe('getRulesContentForAI()', () => {
    it('returns empty when no rules compendiums', () => {
      expect(parser.getRulesContentForAI()).toBe('');
    });
  });

  describe('getTopicContent()', () => {
    it('returns empty string for no results', () => {
      expect(parser.getTopicContent('nonexistent')).toBe('');
    });

    it('returns formatted topic content', async () => {
      const doc = createMockJournalDoc('j1', 'Fireball', [
        { name: 'Desc', content: '<p>A powerful fire spell.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

      const content = parser.getTopicContent('Fireball');
      expect(content).toContain('VOXCHRONICLE.Compendium.TopicInfo');
      expect(content).toContain('Fireball');
    });
  });

  // =========================================================================
  // Entry access
  // =========================================================================
  describe('entry access', () => {
    beforeEach(async () => {
      const doc = createMockJournalDoc('j1', 'Test Entry', [
        { name: 'Page', content: '<p>Content here.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();
    });

    it('getEntry() returns entry by ID', () => {
      const packId = game.packs[0].collection;
      const entry = parser.getEntry(packId, 'j1');
      expect(entry).not.toBeNull();
      expect(entry.name).toBe('Test Entry');
    });

    it('getEntry() returns null for uncached pack', () => {
      expect(parser.getEntry('nonexistent', 'j1')).toBeNull();
    });

    it('getEntry() returns null for non-existent entry', () => {
      const packId = game.packs[0].collection;
      expect(parser.getEntry(packId, 'nonexistent')).toBeNull();
    });

    it('getEntries() returns all entries', () => {
      const packId = game.packs[0].collection;
      const entries = parser.getEntries(packId);
      expect(entries).toHaveLength(1);
    });

    it('getEntries() returns empty for uncached pack', () => {
      expect(parser.getEntries('nonexistent')).toEqual([]);
    });
  });

  // =========================================================================
  // listAvailablePacks()
  // =========================================================================
  describe('listAvailablePacks()', () => {
    it('returns empty when game.packs not available', () => {
      game.packs = undefined;
      expect(parser.listAvailablePacks()).toEqual([]);
    });

    it('lists available packs', () => {
      const pack = createMockPack('JournalEntry', []);
      game.packs = [pack];
      // Make Array.from work
      game.packs[Symbol.iterator] = Array.prototype[Symbol.iterator];

      const list = parser.listAvailablePacks();
      expect(list).toHaveLength(1);
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).toHaveProperty('type');
    });
  });

  // =========================================================================
  // Cache management
  // =========================================================================
  describe('cache management', () => {
    beforeEach(async () => {
      const doc = createMockJournalDoc('j1', 'Entry', [
        { name: 'Page', content: '<p>Content.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();
    });

    it('isCached() returns true for cached pack', () => {
      const packId = game.packs[0].collection;
      expect(parser.isCached(packId)).toBe(true);
    });

    it('isCached() returns false for uncached pack', () => {
      expect(parser.isCached('nonexistent')).toBe(false);
    });

    it('clearCache() clears specific pack', () => {
      const packId = game.packs[0].collection;
      parser.clearCache(packId);
      expect(parser.isCached(packId)).toBe(false);
    });

    it('clearAllCache() clears everything', () => {
      parser.clearAllCache();
      expect(parser._cachedContent.size).toBe(0);
      expect(parser._keywordIndex.size).toBe(0);
      expect(parser._journalCompendiums).toEqual([]);
      expect(parser._rulesCompendiums).toEqual([]);
    });

    it('getCacheStats() returns correct stats', () => {
      const stats = parser.getCacheStats();
      expect(stats).toHaveProperty('cachedCompendiums');
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('totalCharacters');
      expect(stats).toHaveProperty('indexedKeywords');
      expect(stats.cachedCompendiums).toBeGreaterThan(0);
    });
  });
  // =========================================================================
  // Text chunking
  // =========================================================================
  describe('getChunksForEmbedding()', () => {
    it('throws for uncached pack', async () => {
      await expect(parser.getChunksForEmbedding('nonexistent')).rejects.toThrow();
    });

    it('returns chunks from cached pack', async () => {
      const doc = createMockJournalDoc('j1', 'Long Entry', [
        { name: 'Page', content: '<p>' + 'This is a sentence. '.repeat(100) + '</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

      const chunks = await parser.getChunksForEmbedding(pack.collection, { chunkSize: 100, overlap: 20 });
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toHaveProperty('text');
      expect(chunks[0]).toHaveProperty('metadata');
      expect(chunks[0].metadata.source).toBe('compendium');
    });

    it('skips entries with no content', async () => {
      // Create a doc with empty page
      const doc = { id: 'j1', name: 'Empty', pages: [{ type: 'text', name: 'P', text: { content: '' } }] };
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      // Parse manually since empty entry won't produce results
      await parser.parseJournalCompendiums();
      // This should succeed even with empty entries
    });
  });

  describe('getChunksForEmbeddingAll()', () => {
    it('returns chunks from all cached compendiums', async () => {
      const doc = createMockJournalDoc('j1', 'Entry', [
        { name: 'Page', content: '<p>Short content here.</p>' }
      ]);
      const pack = createMockPack('JournalEntry', [doc]);
      game.packs = [pack];
      game.packs.filter = Array.prototype.filter.bind(game.packs);
      await parser.parseJournalCompendiums();

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
      expect(parser._chunkText('   ')).toEqual([]);
    });

    it('returns single chunk for short text', () => {
      const chunks = parser._chunkText('Short text.', 500);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Short text.');
    });

    it('chunks long text with overlap', () => {
      const text = 'This is sentence one. This is sentence two. This is sentence three. This is sentence four. This is sentence five.';
      const chunks = parser._chunkText(text, 50, 10);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  // =========================================================================
  // Private: Document type extractors
  // =========================================================================
  describe('_extractRollTableText()', () => {
    it('extracts roll table with results', () => {
      const table = createMockRollTableDoc('rt1', 'Wild Magic', 'Random effects', [
        { range: [1, 10], text: 'Nothing happens' },
        { range: [11, 20], text: 'Fireball!' }
      ]);
      const text = parser._extractRollTableText(table);
      expect(text).toContain('Wild Magic');
      expect(text).toContain('VOXCHRONICLE.Compendium.Results');
      expect(text).toContain('Nothing happens');
      expect(text).toContain('Fireball!');
    });
  });

  describe('_extractActorText()', () => {
    it('extracts actor biography', () => {
      const actor = createMockActorDoc('a1', 'Goblin', 'npc', 'A sneaky goblin.');
      const text = parser._extractActorText(actor);
      expect(text).toContain('Goblin');
      expect(text).toContain('VOXCHRONICLE.Compendium.Type');
      expect(text).toContain('sneaky goblin');
    });
  });

  // =========================================================================
  // Private: keyword index trimming
  // =========================================================================
  describe('_trimKeywordIndex()', () => {
    it('removes oldest entries when over limit', () => {
      parser._maxKeywordIndexSize = 5;
      for (let i = 0; i < 10; i++) {
        parser._keywordIndex.set(`key-${i}`, {
          entryIds: new Set([`entry-${i}`]),
          lastAccessed: new Date(Date.now() - (10 - i) * 1000)
        });
      }
      parser._trimKeywordIndex();
      expect(parser._keywordIndex.size).toBeLessThanOrEqual(5);
    });

    it('does nothing when under limit', () => {
      parser._maxKeywordIndexSize = 100;
      parser._keywordIndex.set('key-1', { entryIds: new Set(['e1']), lastAccessed: new Date() });
      parser._trimKeywordIndex();
      expect(parser._keywordIndex.size).toBe(1);
    });
  });

  // =========================================================================
  // Private: _parseCompendiumDocument() default case
  // =========================================================================
  describe('_parseCompendiumDocument() default type', () => {
    it('handles unknown document type', () => {
      const doc = {
        id: 'x1',
        name: 'Custom Doc',
        system: { description: { value: '<p>Custom description</p>' } }
      };
      const result = parser._parseCompendiumDocument(doc, 'pack-1', 'Pack', 'CustomType');
      expect(result).not.toBeNull();
      expect(result.text).toContain('Custom Doc');
      expect(result.text).toContain('Custom description');
    });

    it('returns null for doc with no content', () => {
      const doc = { id: 'x1', name: '', system: {} };
      const result = parser._parseCompendiumDocument(doc, 'pack-1', 'Pack', 'CustomType');
      expect(result).toBeNull();
    });
  });
});
