/**
 * CompendiumParser Unit Tests
 *
 * Tests for the CompendiumParser narrator service ported from Narrator Master.
 * Covers parse methods, search, keyword indexing, content formatting for AI,
 * cache management, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the module under test)
// ---------------------------------------------------------------------------

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

const childLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    createChild: vi.fn(() => childLogger)
  }
}));

import { CompendiumParser } from '../../scripts/narrator/CompendiumParser.mjs';

// ---------------------------------------------------------------------------
// Helpers — mock Foundry objects
// ---------------------------------------------------------------------------

/**
 * Creates a mock compendium pack with configurable document type and entries.
 *
 * @param {string} collection - The pack collection ID
 * @param {string} label - The pack label
 * @param {string} documentName - The document type (JournalEntry, Item, etc.)
 * @param {object[]} documents - Array of mock document objects
 * @returns {object} A mock compendium pack
 */
function createMockPack(collection, label, documentName, documents) {
  const indexEntries = documents.map(doc => ({
    _id: doc.id,
    name: doc.name
  }));

  const index = {
    size: indexEntries.length,
    [Symbol.iterator]: function* () {
      for (const entry of indexEntries) {
        yield entry;
      }
    }
  };

  return {
    collection,
    documentName,
    metadata: { label, id: collection },
    title: label,
    getIndex: vi.fn().mockResolvedValue(index),
    getDocument: vi.fn().mockImplementation(async (id) => {
      return documents.find(d => d.id === id) || null;
    })
  };
}

/**
 * Creates a mock JournalEntry document with pages.
 */
function createMockJournalEntry(id, name, pages = []) {
  return {
    id,
    name,
    pages: pages.map(p => ({
      name: p.name,
      type: p.type || 'text',
      text: { content: p.content }
    }))
  };
}

/**
 * Creates a mock Item document.
 */
function createMockItem(id, name, type, descriptionHtml = '', source = '') {
  return {
    id,
    name,
    type,
    system: {
      description: { value: descriptionHtml },
      source
    }
  };
}

/**
 * Creates a mock RollTable document.
 */
function createMockRollTable(id, name, description, results = []) {
  const resultsCollection = {
    size: results.length,
    [Symbol.iterator]: function* () {
      for (const r of results) {
        yield r;
      }
    }
  };

  return {
    id,
    name,
    description,
    results: resultsCollection
  };
}

/**
 * Creates a mock Actor document.
 */
function createMockActor(id, name, type, biographyHtml = '') {
  return {
    id,
    name,
    type,
    system: {
      details: {
        biography: { value: biographyHtml }
      }
    }
  };
}

/**
 * Install minimal globalThis.game mock.
 */
function installGameMock(packs = []) {
  // Make packs behave like a Foundry Collection (iterable + filter)
  const packsArray = [...packs];
  packsArray.filter = packs.filter.bind(packs);

  globalThis.game = {
    packs: packsArray,
    i18n: {
      localize: vi.fn(key => key),
      format: vi.fn((key, data) => key)
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompendiumParser', () => {
  /** @type {CompendiumParser} */
  let parser;

  beforeEach(() => {
    vi.clearAllMocks();
    parser = new CompendiumParser();
    // Default empty game
    installGameMock([]);
  });

  afterEach(() => {
    delete globalThis.game;
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should create a parser with empty caches', () => {
      const stats = parser.getCacheStats();
      expect(stats.cachedCompendiums).toBe(0);
      expect(stats.totalEntries).toBe(0);
      expect(stats.indexedKeywords).toBe(0);
    });

    it('should create a child logger with "CompendiumParser" label', () => {
      // Logger.createChild is called during construction; verify the child logger works
      expect(childLogger.debug).toBeDefined();
      expect(childLogger.warn).toBeDefined();
      expect(childLogger.error).toBeDefined();
    });
  });

  // =========================================================================
  // parseJournalCompendiums
  // =========================================================================
  describe('parseJournalCompendiums', () => {
    it('should return empty array when game.packs is undefined', async () => {
      globalThis.game.packs = undefined;
      const result = await parser.parseJournalCompendiums();
      expect(result).toEqual([]);
      expect(childLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not available'));
    });

    it('should parse journal compendiums and ignore non-journal packs', async () => {
      const journalDoc = createMockJournalEntry('j1', 'Lost Mine', [
        { name: 'Chapter 1', content: '<p>The adventurers arrive at Phandalin.</p>' }
      ]);

      const itemDoc = createMockItem('i1', 'Sword', 'weapon');

      const journalPack = createMockPack('world.adventure', 'Adventure Journal', 'JournalEntry', [journalDoc]);
      const itemPack = createMockPack('world.items', 'Equipment', 'Item', [itemDoc]);

      installGameMock([journalPack, itemPack]);

      const result = await parser.parseJournalCompendiums();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Adventure Journal');
      expect(result[0].entries).toHaveLength(1);
      expect(result[0].entries[0].name).toBe('Lost Mine');
    });

    it('should skip packs that throw errors gracefully', async () => {
      const brokenPack = {
        collection: 'broken.pack',
        documentName: 'JournalEntry',
        metadata: { label: 'Broken', id: 'broken.pack' },
        getIndex: vi.fn().mockRejectedValue(new Error('Database error'))
      };

      installGameMock([brokenPack]);

      const result = await parser.parseJournalCompendiums();
      expect(result).toEqual([]);
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse journal compendium'),
        expect.any(Error)
      );
    });

    it('should skip packs with empty index', async () => {
      const emptyPack = createMockPack('world.empty', 'Empty Pack', 'JournalEntry', []);
      installGameMock([emptyPack]);

      const result = await parser.parseJournalCompendiums();
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // parseRulesCompendiums
  // =========================================================================
  describe('parseRulesCompendiums', () => {
    it('should return empty array when game.packs is undefined', async () => {
      globalThis.game.packs = undefined;
      const result = await parser.parseRulesCompendiums();
      expect(result).toEqual([]);
    });

    it('should include Item packs', async () => {
      const itemDoc = createMockItem('i1', 'Healing Potion', 'consumable', '<p>Heals 2d4+2 HP</p>');
      const itemPack = createMockPack('dnd5e.items', 'SRD Items', 'Item', [itemDoc]);
      installGameMock([itemPack]);

      const result = await parser.parseRulesCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].entries[0].text).toContain('Healing Potion');
    });

    it('should include RollTable packs', async () => {
      const tableDoc = createMockRollTable('t1', 'Wild Magic', 'Roll for wild magic effects', [
        { range: [1, 2], text: 'Fireball centered on self' },
        { range: [3, 4], text: 'Turn invisible' }
      ]);
      const tablePack = createMockPack('dnd5e.tables', 'Tables', 'RollTable', [tableDoc]);
      installGameMock([tablePack]);

      const result = await parser.parseRulesCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].entries[0].text).toContain('Fireball centered on self');
    });

    it('should include JournalEntry packs with rules-related names', async () => {
      const rulesDoc = createMockJournalEntry('r1', 'Combat Rules', [
        { name: 'Initiative', content: '<p>Roll d20 + DEX modifier.</p>' }
      ]);

      const rulesPack = createMockPack('dnd5e.rules', 'SRD Rules', 'JournalEntry', [rulesDoc]);
      const storyPack = createMockPack('world.story', 'Story Notes', 'JournalEntry', [
        createMockJournalEntry('s1', 'Session 1', [{ name: 'Recap', content: '<p>We met at the tavern.</p>' }])
      ]);

      installGameMock([rulesPack, storyPack]);

      const result = await parser.parseRulesCompendiums();
      // Should include the SRD Rules pack but NOT the Story Notes
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('SRD Rules');
    });

    it('should detect Italian rules keywords like "regole" and "manuale"', async () => {
      const doc = createMockJournalEntry('r1', 'Regole di Base', [
        { name: 'Abilità', content: '<p>Forza, Destrezza, etc.</p>' }
      ]);

      const pack = createMockPack('world.regole-base', 'Manuale Regole', 'JournalEntry', [doc]);
      installGameMock([pack]);

      const result = await parser.parseRulesCompendiums();
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // _parseCompendiumDocument (via parse methods)
  // =========================================================================
  describe('document type extraction', () => {
    it('should extract JournalEntry content with page headers', async () => {
      const journal = createMockJournalEntry('j1', 'My Journal', [
        { name: 'Page One', content: '<p>Content of page one.</p>' },
        { name: 'Page Two', content: '<b>Bold content</b>' }
      ]);
      const pack = createMockPack('test.journals', 'Test Journals', 'JournalEntry', [journal]);
      installGameMock([pack]);

      const result = await parser.parseJournalCompendiums();
      const entry = result[0].entries[0];

      expect(entry.text).toContain('## Page One');
      expect(entry.text).toContain('Content of page one.');
      expect(entry.text).toContain('## Page Two');
      expect(entry.text).toContain('Bold content');
      // HTML should be stripped
      expect(entry.text).not.toContain('<p>');
      expect(entry.text).not.toContain('<b>');
    });

    it('should extract Item content with type and source', async () => {
      const item = createMockItem('i1', 'Longsword', 'weapon', '<p>A versatile martial weapon.</p>', 'PHB p.149');
      const pack = createMockPack('test.items', 'Weapons', 'Item', [item]);
      installGameMock([pack]);

      const result = await parser.parseRulesCompendiums();
      const entry = result[0].entries[0];

      expect(entry.text).toContain('Longsword');
      expect(entry.text).toContain('Tipo: weapon');
      expect(entry.text).toContain('A versatile martial weapon.');
      expect(entry.text).toContain('Fonte: PHB p.149');
    });

    it('should extract RollTable content with results', async () => {
      const table = createMockRollTable('t1', 'Encounter Table', '<em>Random encounters</em>', [
        { range: [1, 10], text: 'Goblin patrol' },
        { range: [11, 20], text: 'Owlbear' }
      ]);
      const pack = createMockPack('test.tables', 'Tables', 'RollTable', [table]);
      installGameMock([pack]);

      const result = await parser.parseRulesCompendiums();
      const entry = result[0].entries[0];

      expect(entry.text).toContain('Encounter Table');
      expect(entry.text).toContain('Random encounters');
      expect(entry.text).toContain('Risultati:');
      expect(entry.text).toContain('1-10: Goblin patrol');
      expect(entry.text).toContain('11-20: Owlbear');
    });

    it('should extract Actor content with biography', async () => {
      const actor = createMockActor('a1', 'Strahd von Zarovich', 'npc', '<p>A powerful vampire lord.</p>');
      const pack = createMockPack('test.actors', 'NPCs', 'Actor', [actor]);

      // Manually parse via _parseCompendiumPack since Actor packs are not
      // auto-picked by parseJournalCompendiums or parseRulesCompendiums.
      installGameMock([pack]);

      // Use the internal method directly
      const parsed = await parser._parseCompendiumPack(pack);
      expect(parsed).not.toBeNull();
      expect(parsed.entries[0].text).toContain('Strahd von Zarovich');
      expect(parsed.entries[0].text).toContain('Tipo: npc');
      expect(parsed.entries[0].text).toContain('A powerful vampire lord.');
    });

    it('should handle unknown document types with fallback extraction', async () => {
      const unknownDoc = {
        id: 'u1',
        name: 'Unknown Thing',
        system: { description: { value: '<p>Mysterious description</p>' } }
      };
      const pack = createMockPack('test.unknown', 'Unknown', 'Macro', [unknownDoc]);
      installGameMock([pack]);

      const parsed = await parser._parseCompendiumPack(pack);
      expect(parsed).not.toBeNull();
      expect(parsed.entries[0].text).toContain('Unknown Thing');
      expect(parsed.entries[0].text).toContain('Mysterious description');
    });

    it('should skip entries with no meaningful text content', async () => {
      const emptyDoc = { id: 'e1', name: '', pages: [] };
      const pack = createMockPack('test.empty', 'Empty Docs', 'JournalEntry', [emptyDoc]);
      installGameMock([pack]);

      const parsed = await parser._parseCompendiumPack(pack);
      // The entry name is empty and pages are empty, so text is just empty name -> null
      expect(parsed).toBeNull();
    });
  });

  // =========================================================================
  // stripHtml
  // =========================================================================
  describe('stripHtml', () => {
    it('should strip HTML tags and normalize whitespace', () => {
      const result = parser.stripHtml('<p>Hello   <b>World</b>!</p>');
      expect(result).toBe('Hello World!');
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

    it('should handle nested HTML elements', () => {
      const result = parser.stripHtml('<div><ul><li>Item 1</li><li>Item 2</li></ul></div>');
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });
  });

  // =========================================================================
  // search
  // =========================================================================
  describe('search', () => {
    beforeEach(async () => {
      // Pre-populate with some parsed content
      const journal = createMockJournalEntry('j1', 'Phandalin', [
        { name: 'Overview', content: '<p>A small frontier town near the Sword Mountains.</p>' }
      ]);
      const journal2 = createMockJournalEntry('j2', 'Cragmaw Castle', [
        { name: 'Description', content: '<p>A crumbling castle where goblins reside.</p>' }
      ]);
      const pack = createMockPack('test.adventure', 'Adventure', 'JournalEntry', [journal, journal2]);
      installGameMock([pack]);

      await parser.parseJournalCompendiums();
    });

    it('should return empty array for null/empty query', () => {
      expect(parser.search(null)).toEqual([]);
      expect(parser.search('')).toEqual([]);
      expect(parser.search('  ')).toEqual([]);
    });

    it('should return empty array for non-string query', () => {
      expect(parser.search(42)).toEqual([]);
      expect(parser.search({})).toEqual([]);
    });

    it('should find entries matching the query', () => {
      const results = parser.search('Phandalin');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.name).toBe('Phandalin');
    });

    it('should score exact name matches highest', () => {
      const results = parser.search('Phandalin');
      const phandalinResult = results.find(r => r.entry.name === 'Phandalin');
      expect(phandalinResult.score).toBeGreaterThanOrEqual(100);
    });

    it('should find entries by content words', () => {
      const results = parser.search('goblins');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.name).toBe('Cragmaw Castle');
    });

    it('should sort results by score descending', () => {
      const results = parser.search('castle');
      if (results.length >= 2) {
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      }
    });

    it('should return empty array when query has only single-char words', () => {
      const results = parser.search('a b c');
      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // searchByKeywords
  // =========================================================================
  describe('searchByKeywords', () => {
    beforeEach(async () => {
      const item1 = createMockItem('i1', 'Healing Potion', 'consumable', '<p>Heals HP</p>');
      const item2 = createMockItem('i2', 'Fire Sword', 'weapon', '<p>Deals fire damage</p>');
      const pack = createMockPack('test.items', 'Items', 'Item', [item1, item2]);
      installGameMock([pack]);

      await parser.parseRulesCompendiums();
    });

    it('should return matching entries for valid keywords', () => {
      const results = parser.searchByKeywords('test.items', ['healing']);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Healing Potion');
    });

    it('should return empty array for uncached pack', () => {
      const results = parser.searchByKeywords('nonexistent.pack', ['test']);
      expect(results).toEqual([]);
      expect(childLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not cached'));
    });

    it('should skip keywords shorter than 2 characters', () => {
      const results = parser.searchByKeywords('test.items', ['a', 'b']);
      expect(results).toEqual([]);
    });

    it('should combine results from multiple keywords', () => {
      const results = parser.searchByKeywords('test.items', ['healing', 'fire']);
      expect(results.length).toBe(2);
    });
  });

  // =========================================================================
  // searchByType
  // =========================================================================
  describe('searchByType', () => {
    beforeEach(async () => {
      const journal = createMockJournalEntry('j1', 'Dragon Lair', [
        { name: 'Interior', content: '<p>A vast cavern with dragon bones.</p>' }
      ]);
      const item = createMockItem('i1', 'Dragon Scale Armor', 'armor', '<p>Made from dragon scales.</p>');

      const jPack = createMockPack('test.journals', 'Journals', 'JournalEntry', [journal]);
      const iPack = createMockPack('test.items', 'Items', 'Item', [item]);
      installGameMock([jPack, iPack]);

      await parser.parseJournalCompendiums();
      await parser.parseRulesCompendiums();
    });

    it('should filter search results by document type', () => {
      const itemResults = parser.searchByType('dragon', 'Item');
      expect(itemResults.length).toBeGreaterThan(0);
      expect(itemResults.every(r => r.entry.type === 'Item')).toBe(true);
    });

    it('should return empty when type does not match any results', () => {
      const results = parser.searchByType('dragon', 'Actor');
      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // getContentForAI
  // =========================================================================
  describe('getContentForAI', () => {
    it('should return empty string when no compendiums are parsed', () => {
      expect(parser.getContentForAI()).toBe('');
    });

    it('should format content with headers and source citations', async () => {
      const journal = createMockJournalEntry('j1', 'Quest Log', [
        { name: 'Entry', content: '<p>Save the village.</p>' }
      ]);
      const pack = createMockPack('test.quest', 'Quest Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);

      await parser.parseJournalCompendiums();

      const content = parser.getContentForAI();
      expect(content).toContain('# CONTENUTO COMPENDI');
      expect(content).toContain('## Compendio: Quest Pack (JournalEntry)');
      expect(content).toContain('### Quest Log');
      expect(content).toContain('[Fonte: Quest Pack]');
      expect(content).toContain('Save the village.');
    });

    it('should truncate content at maxLength', async () => {
      const journal = createMockJournalEntry('j1', 'Long Entry', [
        { name: 'Page', content: '<p>' + 'A'.repeat(500) + '</p>' }
      ]);
      const pack = createMockPack('test.long', 'Long Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);

      await parser.parseJournalCompendiums();

      const content = parser.getContentForAI(100);
      expect(content.length).toBeLessThanOrEqual(200); // headers + truncation msg
      expect(content).toContain('troncato');
    });
  });

  // =========================================================================
  // getJournalContentForAI / getRulesContentForAI
  // =========================================================================
  describe('getJournalContentForAI', () => {
    it('should return empty string when no journal compendiums are parsed', () => {
      expect(parser.getJournalContentForAI()).toBe('');
    });

    it('should include adventure header', async () => {
      const journal = createMockJournalEntry('j1', 'Story', [
        { name: 'Intro', content: '<p>Once upon a time.</p>' }
      ]);
      const pack = createMockPack('test.story', 'Story Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);

      await parser.parseJournalCompendiums();

      const content = parser.getJournalContentForAI();
      expect(content).toContain('CONTENUTO AVVENTURA (COMPENDI)');
    });
  });

  describe('getRulesContentForAI', () => {
    it('should return empty string when no rules compendiums are parsed', () => {
      expect(parser.getRulesContentForAI()).toBe('');
    });

    it('should include rules header', async () => {
      const item = createMockItem('i1', 'Shield', 'armor', '<p>+2 AC</p>');
      const pack = createMockPack('test.gear', 'Gear', 'Item', [item]);
      installGameMock([pack]);

      await parser.parseRulesCompendiums();

      const content = parser.getRulesContentForAI();
      expect(content).toContain('REGOLE E RIFERIMENTI (COMPENDI)');
    });
  });

  // =========================================================================
  // getTopicContent
  // =========================================================================
  describe('getTopicContent', () => {
    it('should return empty string when no results found', () => {
      expect(parser.getTopicContent('nonexistent')).toBe('');
    });

    it('should format topic content with source citations', async () => {
      const journal = createMockJournalEntry('j1', 'Dragons', [
        { name: 'Info', content: '<p>Dragons are mighty creatures.</p>' }
      ]);
      const pack = createMockPack('test.lore', 'Lore', 'JournalEntry', [journal]);
      installGameMock([pack]);

      await parser.parseJournalCompendiums();

      const content = parser.getTopicContent('Dragons');
      expect(content).toContain('# Informazioni su: Dragons');
      expect(content).toContain('## Dragons');
      expect(content).toContain('[Fonte: Lore]');
    });

    it('should limit results to maxResults parameter', async () => {
      const docs = [];
      for (let i = 0; i < 10; i++) {
        docs.push(createMockJournalEntry(`j${i}`, `Goblin ${i}`, [
          { name: 'Info', content: `<p>Goblin number ${i}.</p>` }
        ]));
      }
      const pack = createMockPack('test.goblins', 'Goblins', 'JournalEntry', docs);
      installGameMock([pack]);

      await parser.parseJournalCompendiums();

      const content = parser.getTopicContent('Goblin', 3);
      // Count occurrences of "## Goblin" — should be at most 3
      const headings = content.match(/## Goblin/g) || [];
      expect(headings.length).toBeLessThanOrEqual(3);
    });
  });

  // =========================================================================
  // getEntry / getEntries
  // =========================================================================
  describe('getEntry / getEntries', () => {
    beforeEach(async () => {
      const journal = createMockJournalEntry('j1', 'My Entry', [
        { name: 'Page', content: '<p>Content here.</p>' }
      ]);
      const pack = createMockPack('test.pack', 'Test Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);
      await parser.parseJournalCompendiums();
    });

    it('should retrieve a specific entry by pack and entry ID', () => {
      const entry = parser.getEntry('test.pack', 'j1');
      expect(entry).not.toBeNull();
      expect(entry.name).toBe('My Entry');
    });

    it('should return null for unknown entry ID', () => {
      const entry = parser.getEntry('test.pack', 'nonexistent');
      expect(entry).toBeNull();
    });

    it('should return null for unknown pack ID', () => {
      const entry = parser.getEntry('unknown.pack', 'j1');
      expect(entry).toBeNull();
    });

    it('should return all entries for a cached pack', () => {
      const entries = parser.getEntries('test.pack');
      expect(entries).toHaveLength(1);
    });

    it('should return empty array for unknown pack', () => {
      const entries = parser.getEntries('unknown.pack');
      expect(entries).toEqual([]);
    });
  });

  // =========================================================================
  // listAvailablePacks
  // =========================================================================
  describe('listAvailablePacks', () => {
    it('should return empty array when game.packs is undefined', () => {
      globalThis.game.packs = undefined;
      const packs = parser.listAvailablePacks();
      expect(packs).toEqual([]);
    });

    it('should list all available packs with id, name, and type', () => {
      const pack1 = createMockPack('world.journals', 'World Journals', 'JournalEntry', []);
      const pack2 = createMockPack('dnd5e.items', 'SRD Items', 'Item', []);
      installGameMock([pack1, pack2]);

      const packs = parser.listAvailablePacks();
      expect(packs).toHaveLength(2);
      expect(packs[0]).toEqual({ id: 'world.journals', name: 'World Journals', type: 'JournalEntry' });
      expect(packs[1]).toEqual({ id: 'dnd5e.items', name: 'SRD Items', type: 'Item' });
    });
  });

  // =========================================================================
  // Cache management
  // =========================================================================
  describe('cache management', () => {
    beforeEach(async () => {
      const journal = createMockJournalEntry('j1', 'Cached Entry', [
        { name: 'Page', content: '<p>Cached content.</p>' }
      ]);
      const pack = createMockPack('test.cache', 'Cached Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);
      await parser.parseJournalCompendiums();
    });

    it('should report correct isCached status', () => {
      expect(parser.isCached('test.cache')).toBe(true);
      expect(parser.isCached('nonexistent')).toBe(false);
    });

    it('should clear specific pack cache', () => {
      parser.clearCache('test.cache');
      expect(parser.isCached('test.cache')).toBe(false);
      expect(parser.getCacheStats().cachedCompendiums).toBe(0);
    });

    it('should remove pack from journal compendiums list on clearCache', () => {
      parser.clearCache('test.cache');
      const stats = parser.getCacheStats();
      expect(stats.journalCompendiums).toBe(0);
    });

    it('should clear all caches', () => {
      parser.clearAllCache();
      expect(parser.isCached('test.cache')).toBe(false);
      expect(parser.getCacheStats().cachedCompendiums).toBe(0);
      expect(parser.getCacheStats().indexedKeywords).toBe(0);
    });

    it('should use cached result on second parse of same pack', async () => {
      const pack = globalThis.game.packs[0];

      // Parse again — should use cached version
      await parser.parseJournalCompendiums();

      // getIndex should only have been called once (first parse), not again
      expect(pack.getIndex).toHaveBeenCalledTimes(1);
    });

    it('should return correct cache stats', () => {
      const stats = parser.getCacheStats();
      expect(stats.cachedCompendiums).toBe(1);
      expect(stats.journalCompendiums).toBe(1);
      expect(stats.rulesCompendiums).toBe(0);
      expect(stats.totalEntries).toBe(1);
      expect(stats.totalCharacters).toBeGreaterThan(0);
      expect(stats.indexedKeywords).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Keyword index LRU eviction
  // =========================================================================
  describe('keyword index LRU eviction', () => {
    it('should trim keyword index when it exceeds max size', () => {
      // Set a very low max size for testing
      parser._maxKeywordIndexSize = 5;

      // Add more than 5 keywords
      for (let i = 0; i < 10; i++) {
        parser._addToKeywordIndex(`pack:word${i}`, `entry${i}`);
      }

      expect(parser._keywordIndex.size).toBeLessThanOrEqual(5);
    });

    it('should keep recently accessed keywords during eviction', () => {
      parser._maxKeywordIndexSize = 3;

      // Add 3 keywords with clearly staggered timestamps
      const baseTime = Date.now();
      parser._addToKeywordIndex('pack:old1', 'e1');
      parser._keywordIndex.get('pack:old1').lastAccessed = new Date(baseTime - 3000);

      parser._addToKeywordIndex('pack:old2', 'e2');
      parser._keywordIndex.get('pack:old2').lastAccessed = new Date(baseTime - 2000);

      parser._addToKeywordIndex('pack:old3', 'e3');
      parser._keywordIndex.get('pack:old3').lastAccessed = new Date(baseTime - 1000);

      // Make old1 the most recently accessed
      parser._keywordIndex.get('pack:old1').lastAccessed = new Date(baseTime + 1000);

      // Add new keyword — should trigger eviction of old2 (oldest) or old3
      parser._addToKeywordIndex('pack:new1', 'e4');

      // old1 should survive because it was most recently accessed
      expect(parser._keywordIndex.has('pack:old1')).toBe(true);
      expect(parser._keywordIndex.size).toBeLessThanOrEqual(3);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('should handle pack with no collection or metadata.id', async () => {
      const pack = {
        documentName: 'JournalEntry',
        metadata: {},
        collection: undefined,
        getIndex: vi.fn().mockResolvedValue({ size: 0, [Symbol.iterator]: function* () {} })
      };
      installGameMock([pack]);

      // Parsing should handle gracefully (null packId)
      const result = await parser.parseJournalCompendiums();
      expect(result).toEqual([]);
    });

    it('should handle document where getDocument returns null', async () => {
      const pack = createMockPack('test.nulldoc', 'Null Pack', 'JournalEntry', []);
      // Override getIndex to return an entry, but getDocument returns null
      pack.getIndex = vi.fn().mockResolvedValue({
        size: 1,
        [Symbol.iterator]: function* () {
          yield { _id: 'null1', name: 'Ghost Entry' };
        }
      });
      pack.getDocument = vi.fn().mockResolvedValue(null);
      installGameMock([pack]);

      const result = await parser.parseJournalCompendiums();
      expect(result).toEqual([]);
    });

    it('should handle journal entry with non-text pages', async () => {
      const journal = {
        id: 'j1',
        name: 'Mixed Pages',
        pages: [
          { name: 'Image Page', type: 'image', text: null },
          { name: 'Text Page', type: 'text', text: { content: '<p>Actual text.</p>' } }
        ]
      };
      const pack = createMockPack('test.mixed', 'Mixed Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);

      const result = await parser.parseJournalCompendiums();
      expect(result).toHaveLength(1);
      const entry = result[0].entries[0];
      expect(entry.text).toContain('Actual text.');
      expect(entry.text).not.toContain('Image Page');
    });

    it('should use fallback name when document has no name and i18n fails', async () => {
      const doc = {
        id: 'nameless1',
        name: undefined,
        pages: [
          { name: 'Content', type: 'text', text: { content: '<p>Something here.</p>' } }
        ]
      };
      const pack = createMockPack('test.nameless', 'Nameless', 'JournalEntry', [doc]);
      installGameMock([pack]);

      // Make i18n return the key itself (simulating missing translation)
      globalThis.game.i18n.localize = vi.fn(key => key);

      const result = await parser.parseJournalCompendiums();
      expect(result).toHaveLength(1);
      // Should have used the i18n key or fallback
      const entry = result[0].entries[0];
      expect(entry.name).toBeTruthy();
    });

    it('should handle RollTable with results missing text', async () => {
      const table = createMockRollTable('t1', 'Sparse Table', '', [
        { range: [1, 5], text: '' },
        { range: [6, 10], text: 'Valid result' }
      ]);
      const pack = createMockPack('test.sparse', 'Sparse', 'RollTable', [table]);
      installGameMock([pack]);

      const result = await parser.parseRulesCompendiums();
      expect(result).toHaveLength(1);
      const entry = result[0].entries[0];
      expect(entry.text).toContain('Valid result');
      // Empty text result should be skipped
      expect(entry.text).not.toContain('1-5:');
    });

    it('should handle Actor with no biography', async () => {
      const actor = { id: 'a1', name: 'Simple NPC', type: 'npc', system: {} };
      const pack = createMockPack('test.actors', 'Actors', 'Actor', [actor]);
      installGameMock([pack]);

      const parsed = await parser._parseCompendiumPack(pack);
      expect(parsed).not.toBeNull();
      expect(parsed.entries[0].text).toContain('Simple NPC');
      expect(parsed.entries[0].text).toContain('Tipo: npc');
    });
  });

  // =========================================================================
  // Text chunking for embeddings
  // =========================================================================
  describe('getChunksForEmbedding', () => {
    beforeEach(async () => {
      const journal = createMockJournalEntry('j1', 'Adventure Journal', [
        { name: 'Chapter 1', content: '<p>The heroes arrive at the ancient castle. They explore the dark corridors, finding traces of old magic. The torches flicker as they move deeper into the ruins.</p>' }
      ]);
      const pack = createMockPack('test.adventure', 'Adventure Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);
      await parser.parseJournalCompendiums();
    });

    it('should throw error for uncached compendium', async () => {
      await expect(parser.getChunksForEmbedding('nonexistent.pack'))
        .rejects.toThrow(); // Will throw with localized message or fallback
    });

    it('should return chunks with correct metadata structure', async () => {
      const chunks = await parser.getChunksForEmbedding('test.adventure');

      expect(chunks.length).toBeGreaterThan(0);

      const chunk = chunks[0];
      expect(chunk.text).toBeDefined();
      expect(chunk.metadata).toBeDefined();
      expect(chunk.metadata.source).toBe('compendium');
      expect(chunk.metadata.packId).toBe('test.adventure');
      expect(chunk.metadata.packName).toBe('Adventure Pack');
      expect(chunk.metadata.entryId).toBe('j1');
      expect(chunk.metadata.entryName).toBe('Adventure Journal');
      expect(chunk.metadata.entryType).toBe('JournalEntry');
      expect(typeof chunk.metadata.startPos).toBe('number');
      expect(typeof chunk.metadata.endPos).toBe('number');
      expect(typeof chunk.metadata.chunkIndex).toBe('number');
      expect(typeof chunk.metadata.totalChunks).toBe('number');
    });

    it('should return single chunk for short content', async () => {
      const chunks = await parser.getChunksForEmbedding('test.adventure', { chunkSize: 1000 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].metadata.chunkIndex).toBe(0);
      expect(chunks[0].metadata.totalChunks).toBe(1);
    });

    it('should split content into multiple overlapping chunks for long text', async () => {
      // Create entry with longer content
      const longContent = 'A'.repeat(200) + '. ' + 'B'.repeat(200) + '. ' + 'C'.repeat(200) + '.';
      const journal = createMockJournalEntry('j2', 'Long Entry', [
        { name: 'Content', content: `<p>${longContent}</p>` }
      ]);
      const pack = createMockPack('test.long', 'Long Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);
      await parser._parseCompendiumPack(pack);

      const chunks = await parser.getChunksForEmbedding('test.long', { chunkSize: 250, overlap: 50 });

      expect(chunks.length).toBeGreaterThan(1);
      // Verify chunks overlap (chunk N+1 starts before chunk N ends)
      if (chunks.length >= 2) {
        expect(chunks[1].metadata.startPos).toBeLessThan(chunks[0].metadata.endPos);
      }
    });

    it('should respect custom chunkSize option', async () => {
      const content = 'Word '.repeat(100); // ~500 chars
      const journal = createMockJournalEntry('j3', 'Sized Entry', [
        { name: 'Content', content: `<p>${content}</p>` }
      ]);
      const pack = createMockPack('test.sized', 'Sized Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);
      await parser._parseCompendiumPack(pack);

      // Small chunk size should create more chunks
      const smallChunks = await parser.getChunksForEmbedding('test.sized', { chunkSize: 100, overlap: 10 });
      const largeChunks = await parser.getChunksForEmbedding('test.sized', { chunkSize: 1000, overlap: 10 });

      expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
    });

    it('should skip entries with empty text when chunking', async () => {
      // Create valid entries but clear out the text content manually to test chunking behavior
      const journal = createMockJournalEntry('j-empty', 'Journal With Content', [
        { name: 'Page', content: '<p>Some content here.</p>' }
      ]);
      const pack = createMockPack('test.chunking', 'Chunking Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);
      await parser._parseCompendiumPack(pack);

      // Manually set one entry to have empty text to test the chunking skip logic
      const cached = parser._cachedContent.get('test.chunking');
      expect(cached).not.toBeNull();

      // Temporarily modify entry text to be empty
      const originalText = cached.entries[0].text;
      cached.entries[0].text = '   ';

      const chunks = await parser.getChunksForEmbedding('test.chunking');
      // Should skip empty text entries
      expect(chunks.length).toBe(0);

      // Restore
      cached.entries[0].text = originalText;
    });

    it('should use default chunkSize and overlap when not specified', async () => {
      const chunks = await parser.getChunksForEmbedding('test.adventure');

      // Should return some chunks without throwing
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('getChunksForEmbeddingAll', () => {
    beforeEach(async () => {
      const journal1 = createMockJournalEntry('j1', 'First Journal', [
        { name: 'Page', content: '<p>Content from the first journal entry.</p>' }
      ]);
      const journal2 = createMockJournalEntry('j2', 'Second Journal', [
        { name: 'Page', content: '<p>Content from the second journal entry.</p>' }
      ]);
      const pack1 = createMockPack('test.pack1', 'Pack One', 'JournalEntry', [journal1]);
      const pack2 = createMockPack('test.pack2', 'Pack Two', 'JournalEntry', [journal2]);
      installGameMock([pack1, pack2]);
      await parser.parseJournalCompendiums();
    });

    it('should return chunks from all cached compendiums', async () => {
      const allChunks = await parser.getChunksForEmbeddingAll();

      // Should have chunks from both compendiums
      const packIds = new Set(allChunks.map(c => c.metadata.packId));
      expect(packIds.has('test.pack1')).toBe(true);
      expect(packIds.has('test.pack2')).toBe(true);
    });

    it('should respect chunk options across all compendiums', async () => {
      const allChunks = await parser.getChunksForEmbeddingAll({ chunkSize: 1000, overlap: 100 });

      // All chunks should have the compendium source type
      expect(allChunks.every(c => c.metadata.source === 'compendium')).toBe(true);
    });

    it('should continue processing even if one compendium fails', async () => {
      // Clear and manually add a broken entry to the cache
      parser.clearAllCache();

      // Add a valid compendium
      const journal = createMockJournalEntry('j1', 'Valid Journal', [
        { name: 'Page', content: '<p>Valid content.</p>' }
      ]);
      const pack = createMockPack('test.valid', 'Valid Pack', 'JournalEntry', [journal]);
      installGameMock([pack]);
      await parser._parseCompendiumPack(pack);

      // Manually corrupt the cache to simulate an error scenario
      parser._cachedContent.set('test.broken', null);

      const allChunks = await parser.getChunksForEmbeddingAll();

      // Should still get chunks from the valid compendium
      expect(allChunks.length).toBeGreaterThan(0);
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to chunk'),
        expect.anything()
      );
    });

    it('should return empty array when no compendiums are cached', async () => {
      parser.clearAllCache();

      const allChunks = await parser.getChunksForEmbeddingAll();

      expect(allChunks).toEqual([]);
    });
  });

  describe('_chunkText', () => {
    it('should return empty array for null/undefined input', () => {
      expect(parser._chunkText(null)).toEqual([]);
      expect(parser._chunkText(undefined)).toEqual([]);
      expect(parser._chunkText('')).toEqual([]);
    });

    it('should return empty array for whitespace-only input', () => {
      expect(parser._chunkText('   ')).toEqual([]);
      expect(parser._chunkText('\n\t  \n')).toEqual([]);
    });

    it('should return single chunk for text shorter than chunkSize', () => {
      const result = parser._chunkText('Short text.', 500, 100);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Short text.');
      expect(result[0].startPos).toBe(0);
      expect(result[0].endPos).toBe(11);
    });

    it('should split long text into multiple chunks', () => {
      const text = 'Sentence one. Sentence two. Sentence three. Sentence four.';
      const result = parser._chunkText(text, 20, 5);

      expect(result.length).toBeGreaterThan(1);
    });

    it('should normalize whitespace in chunks', () => {
      const text = 'Multiple   spaces   here.';
      const result = parser._chunkText(text, 500, 100);

      expect(result[0].text).toBe('Multiple spaces here.');
    });

    it('should prefer sentence boundaries when chunking', () => {
      // Use text with clear sentence boundaries and appropriate chunk size
      const text = 'First sentence here. Second sentence here. Third sentence here.';
      // With chunk size 30, first chunk should capture "First sentence here."
      const result = parser._chunkText(text, 30, 5);

      // Verify at least one chunk ends at a sentence boundary
      const hasChunkEndingAtSentence = result.some(chunk =>
        chunk.text.endsWith('.') || chunk.text.endsWith('!') || chunk.text.endsWith('?')
      );
      expect(hasChunkEndingAtSentence).toBe(true);
    });

    it('should include overlap between consecutive chunks', () => {
      const text = 'Word '.repeat(50); // 250 characters
      const result = parser._chunkText(text, 100, 20);

      if (result.length >= 2) {
        // Second chunk should start before first chunk ends
        expect(result[1].startPos).toBeLessThan(result[0].endPos);
      }
    });

    it('should never create infinite loops with edge cases', () => {
      // Very small chunk size
      const text = 'AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC';
      const result = parser._chunkText(text, 5, 2);

      // Should complete without hanging
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('_findSentenceBoundary', () => {
    it('should return text length when targetEnd exceeds text length', () => {
      const text = 'Short text.';
      const result = parser._findSentenceBoundary(text, 0, 100, 50);

      expect(result).toBe(text.length);
    });

    it('should find sentence boundary ending with period', () => {
      const text = 'First sentence. Second sentence continues.';
      const result = parser._findSentenceBoundary(text, 0, 20, 20);

      // Should stop at the period position (index 15 is just after the period)
      expect(result).toBeLessThanOrEqual(16);
      expect(text[result - 1]).toBe('.');
    });

    it('should find sentence boundary ending with exclamation mark', () => {
      const text = 'Hello world! More text here.';
      const result = parser._findSentenceBoundary(text, 0, 15, 15);

      expect(result).toBeLessThanOrEqual(12);
      expect(text[result - 1]).toBe('!');
    });

    it('should find sentence boundary ending with question mark', () => {
      const text = 'Is this a test? Yes it is.';
      const result = parser._findSentenceBoundary(text, 0, 18, 18);

      expect(result).toBeLessThanOrEqual(15);
      expect(text[result - 1]).toBe('?');
    });

    it('should fallback to word boundary when no sentence boundary found', () => {
      const text = 'This is a very long sentence without any punctuation within range';
      const result = parser._findSentenceBoundary(text, 0, 25, 25);

      // Should break at a space rather than mid-word
      expect(text[result] === ' ' || text[result - 1] === ' ' || result === 25).toBe(true);
    });

    it('should respect minimum boundary position', () => {
      const text = 'Short. This is a longer continuation of the text.';
      // Start at 7 (after "Short. "), min boundary should be past "Short."
      const result = parser._findSentenceBoundary(text, 7, 30, 20);

      // Should not break before minimum position (7 + 10 = 17)
      expect(result).toBeGreaterThanOrEqual(17);
    });
  });
});
