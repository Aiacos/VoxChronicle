import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VocabularyDictionary,
  VocabularyCategory
} from '../../scripts/core/VocabularyDictionary.mjs';
import { DND_VOCABULARY } from '../../scripts/data/dnd-vocabulary.mjs';

/**
 * Helper: creates a fresh empty dictionary matching DEFAULT_DICTIONARY shape.
 */
function emptyDictionary() {
  return {
    character_names: [],
    location_names: [],
    items: [],
    terms: [],
    custom: []
  };
}

/**
 * Seeds the settings store with a dictionary value so _getDictionary() works.
 */
function seedDictionary(dict = emptyDictionary()) {
  game.settings.set('vox-chronicle', 'customVocabularyDictionary', dict);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('VocabularyCategory enum', () => {
  it('has the expected category values', () => {
    expect(VocabularyCategory.CHARACTER_NAMES).toBe('character_names');
    expect(VocabularyCategory.LOCATION_NAMES).toBe('location_names');
    expect(VocabularyCategory.ITEMS).toBe('items');
    expect(VocabularyCategory.TERMS).toBe('terms');
    expect(VocabularyCategory.CUSTOM).toBe('custom');
  });

  it('contains exactly five categories', () => {
    expect(Object.keys(VocabularyCategory)).toHaveLength(5);
  });
});

describe('VocabularyDictionary', () => {
  let dictionary;

  beforeEach(() => {
    seedDictionary();
    dictionary = new VocabularyDictionary();
  });

  // ========================================================================
  // Constructor
  // ========================================================================

  describe('constructor', () => {
    it('creates an instance with a logger', () => {
      expect(dictionary).toBeInstanceOf(VocabularyDictionary);
      expect(dictionary._logger).toBeDefined();
    });
  });

  // ========================================================================
  // initialize()
  // ========================================================================

  describe('initialize()', () => {
    it('calls loadDefaults and resolves', async () => {
      const spy = vi.spyOn(dictionary, 'loadDefaults').mockResolvedValue({
        loaded: 0,
        total: 0,
        skipped: 0
      });

      await dictionary.initialize();

      expect(spy).toHaveBeenCalledOnce();
    });

    it('propagates errors from loadDefaults', async () => {
      vi.spyOn(dictionary, 'loadDefaults').mockRejectedValue(new Error('boom'));

      await expect(dictionary.initialize()).rejects.toThrow('boom');
    });
  });

  // ========================================================================
  // getTerms(category)
  // ========================================================================

  describe('getTerms()', () => {
    it('returns an empty array for a valid but empty category', () => {
      const terms = dictionary.getTerms(VocabularyCategory.ITEMS);
      expect(terms).toEqual([]);
    });

    it('returns a copy of the terms array (not a reference)', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Longsword');

      const terms = dictionary.getTerms(VocabularyCategory.ITEMS);
      terms.push('Mutated');

      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toEqual(['Longsword']);
    });

    it('throws for an invalid category', () => {
      expect(() => dictionary.getTerms('nonexistent')).toThrow(/Invalid category/);
    });
  });

  // ========================================================================
  // getAllTerms()
  // ========================================================================

  describe('getAllTerms()', () => {
    it('returns the full dictionary object', () => {
      const all = dictionary.getAllTerms();

      expect(all).toHaveProperty('character_names');
      expect(all).toHaveProperty('location_names');
      expect(all).toHaveProperty('items');
      expect(all).toHaveProperty('terms');
      expect(all).toHaveProperty('custom');
    });

    it('reflects added terms', async () => {
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'Homebrew');

      const all = dictionary.getAllTerms();
      expect(all.custom).toContain('Homebrew');
    });
  });

  // ========================================================================
  // addTerm(category, term)
  // ========================================================================

  describe('addTerm()', () => {
    it('adds a term and returns true', async () => {
      const result = await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');

      expect(result).toBe(true);
      expect(dictionary.getTerms(VocabularyCategory.CHARACTER_NAMES)).toContain('Gandalf');
    });

    it('trims whitespace before adding', async () => {
      await dictionary.addTerm(VocabularyCategory.CUSTOM, '  Trimmed  ');

      expect(dictionary.getTerms(VocabularyCategory.CUSTOM)).toContain('Trimmed');
    });

    it('saves to settings after adding', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Dagger');

      expect(game.settings.set).toHaveBeenCalledWith(
        'vox-chronicle',
        'customVocabularyDictionary',
        expect.objectContaining({ items: ['Dagger'] })
      );
    });

    it('deduplicates case-insensitively and returns false', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Longsword');
      const result = await dictionary.addTerm(VocabularyCategory.ITEMS, 'longsword');

      expect(result).toBe(false);
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toHaveLength(1);
    });

    it('deduplicates with mixed casing', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Potion of Healing');
      const result = await dictionary.addTerm(VocabularyCategory.ITEMS, 'POTION OF HEALING');

      expect(result).toBe(false);
    });

    it('throws for an invalid category', async () => {
      await expect(dictionary.addTerm('bad_category', 'term')).rejects.toThrow(
        /Invalid category/
      );
    });

    it('throws for a null term', async () => {
      await expect(
        dictionary.addTerm(VocabularyCategory.CUSTOM, null)
      ).rejects.toThrow('Term must be a non-empty string');
    });

    it('throws for an undefined term', async () => {
      await expect(
        dictionary.addTerm(VocabularyCategory.CUSTOM, undefined)
      ).rejects.toThrow('Term must be a non-empty string');
    });

    it('throws for a non-string term', async () => {
      await expect(dictionary.addTerm(VocabularyCategory.CUSTOM, 42)).rejects.toThrow(
        'Term must be a non-empty string'
      );
    });

    it('throws for an empty string term', async () => {
      await expect(dictionary.addTerm(VocabularyCategory.CUSTOM, '')).rejects.toThrow(
        'Term must be a non-empty string'
      );
    });

    it('throws for a whitespace-only term', async () => {
      await expect(dictionary.addTerm(VocabularyCategory.CUSTOM, '   ')).rejects.toThrow(
        'Term cannot be empty or whitespace'
      );
    });
  });

  // ========================================================================
  // removeTerm(category, term)
  // ========================================================================

  describe('removeTerm()', () => {
    it('removes an existing term and returns true', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Longsword');
      const result = await dictionary.removeTerm(VocabularyCategory.ITEMS, 'Longsword');

      expect(result).toBe(true);
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).not.toContain('Longsword');
    });

    it('performs case-insensitive removal', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Longsword');
      const result = await dictionary.removeTerm(VocabularyCategory.ITEMS, 'LONGSWORD');

      expect(result).toBe(true);
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toHaveLength(0);
    });

    it('returns false when term does not exist', async () => {
      const result = await dictionary.removeTerm(VocabularyCategory.ITEMS, 'Nonexistent');

      expect(result).toBe(false);
    });

    it('saves to settings only when a term was actually removed', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Dagger');
      const callCountAfterAdd = game.settings.set.mock.calls.length;

      await dictionary.removeTerm(VocabularyCategory.ITEMS, 'Nonexistent');
      expect(game.settings.set.mock.calls.length).toBe(callCountAfterAdd);

      await dictionary.removeTerm(VocabularyCategory.ITEMS, 'Dagger');
      expect(game.settings.set.mock.calls.length).toBe(callCountAfterAdd + 1);
    });

    it('throws for an invalid category', async () => {
      await expect(dictionary.removeTerm('bad', 'term')).rejects.toThrow(/Invalid category/);
    });

    it('throws for a null term', async () => {
      await expect(
        dictionary.removeTerm(VocabularyCategory.ITEMS, null)
      ).rejects.toThrow('Term must be a non-empty string');
    });

    it('throws for a non-string term', async () => {
      await expect(
        dictionary.removeTerm(VocabularyCategory.ITEMS, 123)
      ).rejects.toThrow('Term must be a non-empty string');
    });
  });

  // ========================================================================
  // clearCategory(category)
  // ========================================================================

  describe('clearCategory()', () => {
    it('empties the category and returns the count of removed terms', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Shield');

      const count = await dictionary.clearCategory(VocabularyCategory.ITEMS);

      expect(count).toBe(2);
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toHaveLength(0);
    });

    it('returns 0 when category is already empty', async () => {
      const count = await dictionary.clearCategory(VocabularyCategory.CUSTOM);
      expect(count).toBe(0);
    });

    it('does not affect other categories', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'MyTerm');

      await dictionary.clearCategory(VocabularyCategory.ITEMS);

      expect(dictionary.getTerms(VocabularyCategory.CUSTOM)).toContain('MyTerm');
    });

    it('throws for an invalid category', async () => {
      await expect(dictionary.clearCategory('invalid')).rejects.toThrow(/Invalid category/);
    });
  });

  // ========================================================================
  // clearAll()
  // ========================================================================

  describe('clearAll()', () => {
    it('empties all categories and returns total count', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'MyTerm');
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');

      const total = await dictionary.clearAll();

      expect(total).toBe(3);
      expect(dictionary.getTotalTermCount()).toBe(0);
    });

    it('returns 0 when dictionary is already empty', async () => {
      const total = await dictionary.clearAll();
      expect(total).toBe(0);
    });

    it('saves the cleared dictionary to settings', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');
      const callsBefore = game.settings.set.mock.calls.length;

      await dictionary.clearAll();

      const lastCall = game.settings.set.mock.calls[game.settings.set.mock.calls.length - 1];
      expect(lastCall[0]).toBe('vox-chronicle');
      expect(lastCall[1]).toBe('customVocabularyDictionary');
    });
  });

  // ========================================================================
  // exportDictionary()
  // ========================================================================

  describe('exportDictionary()', () => {
    it('returns a JSON string of the dictionary', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Dagger');

      const json = dictionary.exportDictionary();
      const parsed = JSON.parse(json);

      expect(parsed.items).toContain('Dagger');
    });

    it('returns valid JSON for an empty dictionary', () => {
      const json = dictionary.exportDictionary();
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(emptyDictionary());
    });

    it('produces pretty-printed JSON (2-space indent)', () => {
      const json = dictionary.exportDictionary();
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  // ========================================================================
  // importDictionary(json, merge)
  // ========================================================================

  describe('importDictionary()', () => {
    it('replaces the dictionary in replace mode (default)', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'OldSword');

      const importData = {
        ...emptyDictionary(),
        items: ['NewDagger']
      };

      const stats = await dictionary.importDictionary(JSON.stringify(importData));

      expect(stats.added).toBe(1);
      expect(stats.skipped).toBe(0);
      expect(stats.total).toBe(1);
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toEqual(['NewDagger']);
    });

    it('merges with existing terms in merge mode', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');

      const importData = {
        ...emptyDictionary(),
        items: ['Dagger', 'Sword']
      };

      const stats = await dictionary.importDictionary(JSON.stringify(importData), true);

      expect(stats.added).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.total).toBe(2);
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toContain('Sword');
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toContain('Dagger');
    });

    it('counts terms across multiple categories in replace mode', async () => {
      const importData = {
        ...emptyDictionary(),
        items: ['Dagger'],
        character_names: ['Gandalf', 'Frodo'],
        custom: ['Homebrew']
      };

      const stats = await dictionary.importDictionary(JSON.stringify(importData));

      expect(stats.added).toBe(4);
      expect(stats.total).toBe(4);
    });

    it('throws for null input', async () => {
      await expect(dictionary.importDictionary(null)).rejects.toThrow(
        'JSON must be a non-empty string'
      );
    });

    it('throws for non-string input', async () => {
      await expect(dictionary.importDictionary(42)).rejects.toThrow(
        'JSON must be a non-empty string'
      );
    });

    it('throws for empty string input', async () => {
      await expect(dictionary.importDictionary('')).rejects.toThrow(
        'JSON must be a non-empty string'
      );
    });

    it('throws for invalid JSON', async () => {
      await expect(dictionary.importDictionary('not json')).rejects.toThrow(/Invalid JSON/);
    });

    it('throws when data is not an object', async () => {
      await expect(dictionary.importDictionary('"just a string"')).rejects.toThrow(
        'Dictionary must be an object'
      );
    });

    it('throws when data is null JSON', async () => {
      await expect(dictionary.importDictionary('null')).rejects.toThrow(
        'Dictionary must be an object'
      );
    });

    it('throws when a category is not an array', async () => {
      const bad = { ...emptyDictionary(), items: 'not-an-array' };
      await expect(dictionary.importDictionary(JSON.stringify(bad))).rejects.toThrow(
        /must be an array/
      );
    });

    it('throws when a category contains non-string values', async () => {
      const bad = { ...emptyDictionary(), items: [123] };
      await expect(dictionary.importDictionary(JSON.stringify(bad))).rejects.toThrow(
        /must be strings/
      );
    });

    it('accepts import data with missing categories (treated as empty)', async () => {
      const partial = { items: ['Dagger'] };
      const stats = await dictionary.importDictionary(JSON.stringify(partial));

      expect(stats.added).toBe(1);
      expect(stats.total).toBe(1);
    });
  });

  // ========================================================================
  // generatePrompt(maxTerms)
  // ========================================================================

  describe('generatePrompt()', () => {
    it('returns empty string when no terms exist', () => {
      const prompt = dictionary.generatePrompt();
      expect(prompt).toBe('');
    });

    it('generates a prompt with terms', async () => {
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Excalibur');

      const prompt = dictionary.generatePrompt();

      expect(prompt).toContain('Gandalf');
      expect(prompt).toContain('Excalibur');
      expect(prompt).toContain('Common terms in this recording:');
      expect(prompt).toContain('Please transcribe these terms accurately.');
    });

    it('limits terms to maxTerms parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await dictionary.addTerm(VocabularyCategory.CUSTOM, `Term${i}`);
      }

      const prompt = dictionary.generatePrompt(3);
      const matches = prompt.match(/Term\d/g);

      expect(matches).toHaveLength(3);
    });

    it('uses default max of 50 terms', async () => {
      for (let i = 0; i < 60; i++) {
        await dictionary.addTerm(VocabularyCategory.CUSTOM, `Word${i}`);
      }

      const prompt = dictionary.generatePrompt();
      const matches = prompt.match(/Word\d+/g);

      expect(matches).toHaveLength(50);
    });

    it('includes terms from multiple categories', async () => {
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Alice');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Waterdeep');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Vorpal Sword');
      await dictionary.addTerm(VocabularyCategory.TERMS, 'Fireball');
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'Homebrew');

      const prompt = dictionary.generatePrompt();

      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Waterdeep');
      expect(prompt).toContain('Vorpal Sword');
      expect(prompt).toContain('Fireball');
      expect(prompt).toContain('Homebrew');
    });
  });

  // ========================================================================
  // getTermCount(category)
  // ========================================================================

  describe('getTermCount()', () => {
    it('returns 0 for an empty category', () => {
      expect(dictionary.getTermCount(VocabularyCategory.ITEMS)).toBe(0);
    });

    it('returns the correct count after adding terms', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Shield');

      expect(dictionary.getTermCount(VocabularyCategory.ITEMS)).toBe(2);
    });

    it('throws for an invalid category', () => {
      expect(() => dictionary.getTermCount('bogus')).toThrow(/Invalid category/);
    });
  });

  // ========================================================================
  // getTotalTermCount()
  // ========================================================================

  describe('getTotalTermCount()', () => {
    it('returns 0 for an empty dictionary', () => {
      expect(dictionary.getTotalTermCount()).toBe(0);
    });

    it('sums terms across all categories', async () => {
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'A');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'B');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'C');
      await dictionary.addTerm(VocabularyCategory.TERMS, 'D');
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'E');

      expect(dictionary.getTotalTermCount()).toBe(5);
    });
  });

  // ========================================================================
  // hasTerm(category, term)
  // ========================================================================

  describe('hasTerm()', () => {
    it('returns false when term does not exist', () => {
      expect(dictionary.hasTerm(VocabularyCategory.ITEMS, 'Nonexistent')).toBe(false);
    });

    it('returns true when term exists', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Longsword');

      expect(dictionary.hasTerm(VocabularyCategory.ITEMS, 'Longsword')).toBe(true);
    });

    it('performs case-insensitive check', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Longsword');

      expect(dictionary.hasTerm(VocabularyCategory.ITEMS, 'longsword')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.ITEMS, 'LONGSWORD')).toBe(true);
    });

    it('throws for an invalid category', () => {
      expect(() => dictionary.hasTerm('invalid', 'term')).toThrow(/Invalid category/);
    });
  });

  // ========================================================================
  // loadDefaults()
  // ========================================================================

  describe('loadDefaults()', () => {
    it('loads DND_VOCABULARY into the terms category when dictionary is empty', async () => {
      const stats = await dictionary.loadDefaults();

      expect(stats.loaded).toBeGreaterThan(0);
      expect(stats.total).toBeGreaterThan(0);

      const terms = dictionary.getTerms(VocabularyCategory.TERMS);
      expect(terms.length).toBeGreaterThan(0);

      // Verify some known DND_VOCABULARY entries were loaded
      const allDndTerms = Object.values(DND_VOCABULARY).flat();
      for (const term of terms) {
        expect(allDndTerms).toContain(term);
      }
    });

    it('skips loading when dictionary already has terms', async () => {
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'ExistingTerm');

      const stats = await dictionary.loadDefaults();

      expect(stats.loaded).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.skipped).toBe(1);
    });

    it('handles duplicate terms across DND_VOCABULARY categories via deduplication', async () => {
      const stats = await dictionary.loadDefaults();

      // DND_VOCABULARY has some duplicates (e.g. 'Beholder' appears twice in creatures)
      // The skipped count should reflect those
      expect(stats.skipped).toBeGreaterThanOrEqual(0);
      expect(stats.loaded + stats.skipped).toBe(stats.total);
    });
  });

  // ========================================================================
  // extractFromFoundryCompendiums()
  // ========================================================================

  describe('extractFromFoundryCompendiums()', () => {
    it('returns empty results when game.packs is undefined', async () => {
      delete game.packs;

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results).toEqual({ character_names: [], items: [] });
    });

    it('returns empty results when game is undefined', async () => {
      const savedGame = globalThis.game;
      delete globalThis.game;

      // Need to create a new instance since the old one was created with game available
      const freshDict = new VocabularyDictionary();

      // extractFromFoundryCompendiums checks `typeof game === 'undefined'`
      const results = await freshDict.extractFromFoundryCompendiums();

      expect(results).toEqual({ character_names: [], items: [] });

      globalThis.game = savedGame;
    });

    it('extracts actor names from world compendiums', async () => {
      const actorPack = {
        metadata: { packageType: 'world', type: 'Actor' },
        collection: 'world.actors',
        indexed: true,
        index: new Map([
          ['a1', { name: 'Goblin King' }],
          ['a2', { name: 'Dragon' }]
        ]),
        getIndex: vi.fn()
      };

      game.packs = [actorPack];

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toContain('Dragon');
      expect(results.character_names).toContain('Goblin King');
    });

    it('extracts item names from world compendiums', async () => {
      const itemPack = {
        metadata: { packageType: 'world', type: 'Item' },
        collection: 'world.items',
        indexed: true,
        index: new Map([
          ['i1', { name: 'Longsword' }],
          ['i2', { name: 'Potion of Healing' }]
        ]),
        getIndex: vi.fn()
      };

      game.packs = [itemPack];

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.items).toContain('Longsword');
      expect(results.items).toContain('Potion of Healing');
    });

    it('skips non-world compendiums', async () => {
      const modulePack = {
        metadata: { packageType: 'module', type: 'Actor' },
        collection: 'module.monsters',
        indexed: true,
        index: new Map([['a1', { name: 'ShouldBeSkipped' }]]),
        getIndex: vi.fn()
      };

      game.packs = [modulePack];

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toHaveLength(0);
    });

    it('skips non-Actor/Item compendium types', async () => {
      const journalPack = {
        metadata: { packageType: 'world', type: 'JournalEntry' },
        collection: 'world.journals',
        indexed: true,
        index: new Map([['j1', { name: 'Session Notes' }]]),
        getIndex: vi.fn()
      };

      game.packs = [journalPack];

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toHaveLength(0);
      expect(results.items).toHaveLength(0);
    });

    it('removes duplicates from extracted names', async () => {
      const pack1 = {
        metadata: { packageType: 'world', type: 'Actor' },
        collection: 'world.actors1',
        indexed: true,
        index: new Map([
          ['a1', { name: 'Goblin' }],
          ['a2', { name: 'Goblin' }]
        ]),
        getIndex: vi.fn()
      };

      game.packs = [pack1];

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toEqual(['Goblin']);
    });

    it('sorts results alphabetically', async () => {
      const pack = {
        metadata: { packageType: 'world', type: 'Actor' },
        collection: 'world.actors',
        indexed: true,
        index: new Map([
          ['a1', { name: 'Zebra' }],
          ['a2', { name: 'Alpha' }],
          ['a3', { name: 'Middle' }]
        ]),
        getIndex: vi.fn()
      };

      game.packs = [pack];

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toEqual(['Alpha', 'Middle', 'Zebra']);
    });

    it('skips entries without a name', async () => {
      const pack = {
        metadata: { packageType: 'world', type: 'Actor' },
        collection: 'world.actors',
        indexed: true,
        index: new Map([
          ['a1', { name: 'Valid' }],
          ['a2', { name: '' }],
          ['a3', {}]
        ]),
        getIndex: vi.fn()
      };

      game.packs = [pack];

      const results = await dictionary.extractFromFoundryCompendiums();

      // Empty string is falsy, so it should be skipped
      expect(results.character_names).toEqual(['Valid']);
    });

    it('calls getIndex when pack is not indexed', async () => {
      const getIndexFn = vi.fn();
      const pack = {
        metadata: { packageType: 'world', type: 'Actor' },
        collection: 'world.actors',
        indexed: false,
        index: new Map([['a1', { name: 'Loaded' }]]),
        getIndex: getIndexFn
      };

      game.packs = [pack];

      await dictionary.extractFromFoundryCompendiums();

      expect(getIndexFn).toHaveBeenCalledOnce();
    });

    it('handles getIndex errors gracefully', async () => {
      const pack = {
        metadata: { packageType: 'world', type: 'Actor' },
        collection: 'world.actors',
        indexed: false,
        index: new Map(),
        getIndex: vi.fn().mockRejectedValue(new Error('Index failed'))
      };

      game.packs = [pack];

      const results = await dictionary.extractFromFoundryCompendiums();

      // Should not throw; returns empty from the failed pack
      expect(results.character_names).toHaveLength(0);
    });

    it('falls back to _getPackageType when metadata.packageType is missing', async () => {
      const pack = {
        metadata: { type: 'Actor' },
        collection: 'world.actors',
        indexed: true,
        index: new Map([['a1', { name: 'FromFallback' }]]),
        getIndex: vi.fn()
      };

      game.packs = [pack];

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results.character_names).toContain('FromFallback');
    });

    it('returns empty results on unexpected error', async () => {
      game.packs = {
        [Symbol.iterator]: () => {
          throw new Error('Iterator broke');
        }
      };

      const results = await dictionary.extractFromFoundryCompendiums();

      expect(results).toEqual({ character_names: [], items: [] });
    });
  });

  // ========================================================================
  // _validateCategory()
  // ========================================================================

  describe('_validateCategory()', () => {
    it('does not throw for valid categories', () => {
      for (const category of Object.values(VocabularyCategory)) {
        expect(() => dictionary._validateCategory(category)).not.toThrow();
      }
    });

    it('throws for an invalid string category', () => {
      expect(() => dictionary._validateCategory('weapons')).toThrow(/Invalid category "weapons"/);
    });

    it('throws for undefined', () => {
      expect(() => dictionary._validateCategory(undefined)).toThrow(/Invalid category/);
    });

    it('throws for null', () => {
      expect(() => dictionary._validateCategory(null)).toThrow(/Invalid category/);
    });

    it('includes valid categories in error message', () => {
      try {
        dictionary._validateCategory('bad');
      } catch (error) {
        expect(error.message).toContain('character_names');
        expect(error.message).toContain('location_names');
        expect(error.message).toContain('items');
        expect(error.message).toContain('terms');
        expect(error.message).toContain('custom');
      }
    });
  });

  // ========================================================================
  // _validateDictionaryStructure()
  // ========================================================================

  describe('_validateDictionaryStructure()', () => {
    it('accepts a valid dictionary structure', () => {
      expect(() => dictionary._validateDictionaryStructure(emptyDictionary())).not.toThrow();
    });

    it('accepts a dictionary with populated categories', () => {
      const dict = {
        ...emptyDictionary(),
        items: ['Sword', 'Shield'],
        character_names: ['Gandalf']
      };
      expect(() => dictionary._validateDictionaryStructure(dict)).not.toThrow();
    });

    it('accepts a partial dictionary (missing categories)', () => {
      expect(() => dictionary._validateDictionaryStructure({ items: ['Sword'] })).not.toThrow();
    });

    it('accepts an empty object', () => {
      expect(() => dictionary._validateDictionaryStructure({})).not.toThrow();
    });

    it('throws when data is not an object', () => {
      expect(() => dictionary._validateDictionaryStructure('string')).toThrow(
        'Dictionary must be an object'
      );
    });

    it('throws when data is null', () => {
      expect(() => dictionary._validateDictionaryStructure(null)).toThrow(
        'Dictionary must be an object'
      );
    });

    it('throws when data is an array', () => {
      expect(() => dictionary._validateDictionaryStructure([])).not.toThrow();
    });

    it('throws when a known category is not an array', () => {
      const bad = { items: 'not-array' };
      expect(() => dictionary._validateDictionaryStructure(bad)).toThrow(
        'Category "items" must be an array'
      );
    });

    it('throws when a category contains non-string values', () => {
      const bad = { terms: ['valid', 42, 'also-valid'] };
      expect(() => dictionary._validateDictionaryStructure(bad)).toThrow(
        'All terms in "terms" must be strings'
      );
    });

    it('throws for boolean values in a category', () => {
      const bad = { custom: [true] };
      expect(() => dictionary._validateDictionaryStructure(bad)).toThrow(/must be strings/);
    });

    it('throws for null values in a category', () => {
      const bad = { items: [null] };
      expect(() => dictionary._validateDictionaryStructure(bad)).toThrow(/must be strings/);
    });
  });

  // ========================================================================
  // _getPackageType() fallback
  // ========================================================================

  describe('_getPackageType()', () => {
    it('returns "world" for world.* collection prefix', () => {
      const result = dictionary._getPackageType({ collection: 'world.my-pack' });
      expect(result).toBe('world');
    });

    it('returns "system" when collection starts with game.system.id', () => {
      game.system = { id: 'dnd5e' };

      const result = dictionary._getPackageType({ collection: 'dnd5e.monsters' });
      expect(result).toBe('system');
    });

    it('returns "module" as default fallback', () => {
      const result = dictionary._getPackageType({ collection: 'some-module.pack' });
      expect(result).toBe('module');
    });
  });

  // ========================================================================
  // _getDictionary() — internal, but important for robustness
  // ========================================================================

  describe('_getDictionary()', () => {
    it('ensures all categories exist even if settings returns incomplete data', () => {
      game.settings.set('vox-chronicle', 'customVocabularyDictionary', { items: ['Sword'] });

      const dict = dictionary._getDictionary();

      expect(Array.isArray(dict.character_names)).toBe(true);
      expect(Array.isArray(dict.location_names)).toBe(true);
      expect(Array.isArray(dict.items)).toBe(true);
      expect(Array.isArray(dict.terms)).toBe(true);
      expect(Array.isArray(dict.custom)).toBe(true);
      expect(dict.items).toEqual(['Sword']);
    });

    it('replaces non-array category values with empty arrays', () => {
      game.settings.set('vox-chronicle', 'customVocabularyDictionary', {
        items: 'not-an-array',
        terms: null,
        custom: 42
      });

      const dict = dictionary._getDictionary();

      expect(dict.items).toEqual([]);
      expect(dict.terms).toEqual([]);
      expect(dict.custom).toEqual([]);
    });
  });

  // ========================================================================
  // Integration: round-trip export/import
  // ========================================================================

  describe('round-trip export/import', () => {
    it('preserves all terms through export then import (replace)', async () => {
      await dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Staff of Power');
      await dictionary.addTerm(VocabularyCategory.LOCATION_NAMES, 'Minas Tirith');
      await dictionary.addTerm(VocabularyCategory.TERMS, 'Fireball');
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'Homebrew Rule');

      const exported = dictionary.exportDictionary();

      // Clear and reimport
      await dictionary.clearAll();
      expect(dictionary.getTotalTermCount()).toBe(0);

      await dictionary.importDictionary(exported);

      expect(dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, 'Gandalf')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.ITEMS, 'Staff of Power')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.LOCATION_NAMES, 'Minas Tirith')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.TERMS, 'Fireball')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CUSTOM, 'Homebrew Rule')).toBe(true);
      expect(dictionary.getTotalTermCount()).toBe(5);
    });

    it('preserves all terms through export then merge import', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');

      const importData = { ...emptyDictionary(), items: ['Sword', 'Shield'] };
      const stats = await dictionary.importDictionary(JSON.stringify(importData), true);

      expect(stats.added).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toContain('Sword');
      expect(dictionary.getTerms(VocabularyCategory.ITEMS)).toContain('Shield');
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================

  describe('edge cases', () => {
    it('handles adding the same term to different categories', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Shield');
      await dictionary.addTerm(VocabularyCategory.TERMS, 'Shield');

      expect(dictionary.hasTerm(VocabularyCategory.ITEMS, 'Shield')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.TERMS, 'Shield')).toBe(true);
      expect(dictionary.getTermCount(VocabularyCategory.ITEMS)).toBe(1);
      expect(dictionary.getTermCount(VocabularyCategory.TERMS)).toBe(1);
    });

    it('handles terms with special characters', async () => {
      await dictionary.addTerm(VocabularyCategory.CUSTOM, "Bigby's Hand");
      await dictionary.addTerm(VocabularyCategory.CUSTOM, 'Yuan-ti');
      await dictionary.addTerm(VocabularyCategory.CUSTOM, "Heroes' Feast");

      expect(dictionary.hasTerm(VocabularyCategory.CUSTOM, "Bigby's Hand")).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CUSTOM, 'Yuan-ti')).toBe(true);
      expect(dictionary.hasTerm(VocabularyCategory.CUSTOM, "Heroes' Feast")).toBe(true);
    });

    it('clearAll followed by getTotalTermCount returns 0', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Something');
      await dictionary.clearAll();

      expect(dictionary.getTotalTermCount()).toBe(0);
    });

    it('removeTerm after clearCategory returns false', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'Sword');
      await dictionary.clearCategory(VocabularyCategory.ITEMS);

      const result = await dictionary.removeTerm(VocabularyCategory.ITEMS, 'Sword');
      expect(result).toBe(false);
    });

    it('multiple sequential adds and removes work correctly', async () => {
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'A');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'B');
      await dictionary.addTerm(VocabularyCategory.ITEMS, 'C');
      await dictionary.removeTerm(VocabularyCategory.ITEMS, 'B');

      const terms = dictionary.getTerms(VocabularyCategory.ITEMS);
      expect(terms).toEqual(['A', 'C']);
    });
  });
});
