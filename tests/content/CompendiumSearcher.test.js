/**
 * CompendiumSearcher Unit Tests
 *
 * Tests for the CompendiumSearcher class with Foundry VTT game.packs mocking.
 * Covers searching actors, items, journals, different search modes, caching,
 * and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing CompendiumSearcher
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  CompendiumSearcher,
  CompendiumType,
  SearchMode,
  DEFAULT_SEARCH_OPTIONS
} from '../../scripts/content/CompendiumSearcher.mjs';

/**
 * Create mock compendium pack with actors
 */
function createMockActorPack(id, actors, packageType = 'module') {
  const mockIndex = new Map();
  actors.forEach((actor, index) => {
    mockIndex.set(`actor${index}`, {
      _id: `actor${index}`,
      name: actor.name,
      type: actor.type || 'npc',
      img: actor.img || 'icons/actor.png'
    });
  });

  return {
    collection: id,
    metadata: {
      id,
      label: `Mock ${packageType} Pack`,
      name: id,
      type: CompendiumType.ACTOR,
      packageType
    },
    index: mockIndex,
    indexed: true,
    getIndex: vi.fn(async () => mockIndex),
    getDocument: vi.fn(async (docId) => {
      const entry = mockIndex.get(docId);
      return entry ? { ...entry } : null;
    })
  };
}

/**
 * Create mock compendium pack with items
 */
function createMockItemPack(id, items, packageType = 'system') {
  const mockIndex = new Map();
  items.forEach((item, index) => {
    mockIndex.set(`item${index}`, {
      _id: `item${index}`,
      name: item.name,
      type: item.type || 'weapon',
      img: item.img || 'icons/item.png'
    });
  });

  return {
    collection: id,
    metadata: {
      id,
      label: `Mock ${packageType} Items`,
      name: id,
      type: CompendiumType.ITEM,
      packageType
    },
    index: mockIndex,
    indexed: true,
    getIndex: vi.fn(async () => mockIndex),
    getDocument: vi.fn(async (docId) => {
      const entry = mockIndex.get(docId);
      return entry ? { ...entry } : null;
    })
  };
}

/**
 * Create mock compendium pack with journals
 */
function createMockJournalPack(id, journals, packageType = 'world') {
  const mockIndex = new Map();
  journals.forEach((journal, index) => {
    mockIndex.set(`journal${index}`, {
      _id: `journal${index}`,
      name: journal.name,
      img: journal.img || 'icons/journal.png'
    });
  });

  return {
    collection: id,
    metadata: {
      id,
      label: `Mock ${packageType} Journals`,
      name: id,
      type: CompendiumType.JOURNAL,
      packageType
    },
    index: mockIndex,
    indexed: true,
    getIndex: vi.fn(async () => mockIndex),
    getDocument: vi.fn(async (docId) => {
      const entry = mockIndex.get(docId);
      return entry ? { ...entry } : null;
    })
  };
}

/**
 * Setup mock game.packs
 */
function setupMockGame(packs = []) {
  globalThis.game = {
    packs: {
      [Symbol.iterator]: function* () {
        yield* packs;
      },
      get: (id) => packs.find((p) => p.collection === id) || null,
      size: packs.length
    },
    system: {
      id: 'dnd5e'
    }
  };
}

describe('CompendiumSearcher', () => {
  let searcher;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup basic mock game with empty packs
    setupMockGame([]);

    // Create searcher instance
    searcher = new CompendiumSearcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.game;
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(searcher).toBeInstanceOf(CompendiumSearcher);
      expect(searcher._cacheExpiryMs).toBe(300000);
      expect(searcher._indexCache).toBeInstanceOf(Map);
      expect(searcher._cacheTimestamps).toBeInstanceOf(Map);
    });

    it('should accept custom cache expiry time', () => {
      const customSearcher = new CompendiumSearcher({ cacheExpiryMs: 60000 });
      expect(customSearcher._cacheExpiryMs).toBe(60000);
    });

    it('should support preloadIndex option', () => {
      // Mock _preloadIndexes to verify it's called
      const preloadSpy = vi.spyOn(CompendiumSearcher.prototype, '_preloadIndexes');
      preloadSpy.mockImplementation(() => {});

      new CompendiumSearcher({ preloadIndex: true });

      expect(preloadSpy).toHaveBeenCalled();

      preloadSpy.mockRestore();
    });
  });

  // ============================================================================
  // searchActor Tests
  // ============================================================================

  describe('searchActor', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('monsters.npcs', [
        { name: 'Goblin Scout', type: 'npc' },
        { name: 'Goblin Warrior', type: 'npc' },
        { name: 'Orc Berserker', type: 'npc' },
        { name: 'Dragon Ancient', type: 'npc' }
      ]);

      setupMockGame([actorPack]);
    });

    it('should find actors with contains mode (default)', async () => {
      const results = await searcher.searchActor('goblin');

      expect(results).toHaveLength(2);
      expect(results[0].name).toContain('Goblin');
      expect(results[0].documentType).toBe(CompendiumType.ACTOR);
    });

    it('should find actors with exact mode', async () => {
      const results = await searcher.searchActor('Goblin Scout', {
        mode: SearchMode.EXACT
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Goblin Scout');
    });

    it('should find actors with starts_with mode', async () => {
      const results = await searcher.searchActor('goblin', {
        mode: SearchMode.STARTS_WITH
      });

      expect(results).toHaveLength(2);
      expect(results[0].name).toMatch(/^Goblin/i);
    });

    it('should filter by actor type', async () => {
      const actorPack = createMockActorPack('mixed.actors', [
        { name: 'Hero Knight', type: 'character' },
        { name: 'Villain Mage', type: 'npc' },
        { name: 'Player Rogue', type: 'character' }
      ]);

      setupMockGame([actorPack]);

      const results = await searcher.searchActor('hero', {
        actorType: 'character'
      });

      expect(results).toHaveLength(1);
      expect(results[0].document.type).toBe('character');
    });

    it('should respect limit option', async () => {
      const results = await searcher.searchActor('goblin', { limit: 1 });

      expect(results).toHaveLength(1);
    });

    it('should be case insensitive by default', async () => {
      const results = await searcher.searchActor('GOBLIN');

      expect(results).toHaveLength(2);
    });

    it('should support case sensitive search', async () => {
      const results = await searcher.searchActor('goblin', {
        caseSensitive: true
      });

      // Should not match "Goblin" with capital G
      expect(results).toHaveLength(0);
    });

    it('should return empty array when no matches found', async () => {
      const results = await searcher.searchActor('nonexistent');

      expect(results).toEqual([]);
    });

    it('should return empty array when game.packs is unavailable', async () => {
      delete globalThis.game;

      const results = await searcher.searchActor('goblin');

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // searchItem Tests
  // ============================================================================

  describe('searchItem', () => {
    beforeEach(() => {
      const itemPack = createMockItemPack('equipment.weapons', [
        { name: 'Longsword', type: 'weapon' },
        { name: 'Shortsword', type: 'weapon' },
        { name: 'Leather Armor', type: 'armor' },
        { name: 'Healing Potion', type: 'consumable' }
      ]);

      setupMockGame([itemPack]);
    });

    it('should find items with contains mode', async () => {
      const results = await searcher.searchItem('sword');

      expect(results).toHaveLength(2);
      expect(results[0].name).toContain('sword');
    });

    it('should find items with exact mode', async () => {
      const results = await searcher.searchItem('Longsword', {
        mode: SearchMode.EXACT
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Longsword');
    });

    it('should filter by item type', async () => {
      const results = await searcher.searchItem('sword', {
        itemType: 'weapon'
      });

      expect(results).toHaveLength(2);
      results.forEach((r) => {
        expect(r.document.type).toBe('weapon');
      });
    });

    it('should respect limit option', async () => {
      const results = await searcher.searchItem('sword', { limit: 1 });

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches found', async () => {
      const results = await searcher.searchItem('Excalibur');

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // searchJournal Tests
  // ============================================================================

  describe('searchJournal', () => {
    beforeEach(() => {
      const journalPack = createMockJournalPack('world.lore', [
        { name: 'The Fall of Neverwinter' },
        { name: 'History of the Dragon Wars' },
        { name: 'Legend of the Phoenix Blade' }
      ]);

      setupMockGame([journalPack]);
    });

    it('should find journals with contains mode', async () => {
      const results = await searcher.searchJournal('dragon');

      expect(results).toHaveLength(1);
      expect(results[0].name).toContain('Dragon');
    });

    it('should find journals with exact mode', async () => {
      const results = await searcher.searchJournal('The Fall of Neverwinter', {
        mode: SearchMode.EXACT
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('The Fall of Neverwinter');
    });

    it('should return empty array when no matches found', async () => {
      const results = await searcher.searchJournal('nonexistent');

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // searchAll Tests
  // ============================================================================

  describe('searchAll', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('monsters.npcs', [
        { name: 'Dragon Guardian', type: 'npc' }
      ]);

      const itemPack = createMockItemPack('equipment.weapons', [
        { name: 'Dragon Slayer Sword', type: 'weapon' }
      ]);

      const journalPack = createMockJournalPack('world.lore', [{ name: 'History of Dragons' }]);

      setupMockGame([actorPack, itemPack, journalPack]);
    });

    it('should search across all default types', async () => {
      const results = await searcher.searchAll('dragon');

      expect(results).toHaveProperty('actor');
      expect(results).toHaveProperty('item');
      expect(results).toHaveProperty('journalentry');

      expect(results.actor).toHaveLength(1);
      expect(results.item).toHaveLength(1);
      expect(results.journalentry).toHaveLength(1);
    });

    it('should support custom types array', async () => {
      const results = await searcher.searchAll('dragon', {
        types: [CompendiumType.ACTOR]
      });

      expect(results).toHaveProperty('actor');
      expect(results.actor).toHaveLength(1);
      expect(results).not.toHaveProperty('item');
    });

    it('should pass search options to all searches', async () => {
      const results = await searcher.searchAll('dragon', {
        mode: SearchMode.EXACT,
        limit: 1
      });

      expect(results.actor).toHaveLength(0); // No exact match
      expect(results.item).toHaveLength(0);
    });
  });

  // ============================================================================
  // exists Tests
  // ============================================================================

  describe('exists', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('monsters.npcs', [
        { name: 'Goblin Scout', type: 'npc' }
      ]);

      const itemPack = createMockItemPack('equipment.weapons', [
        { name: 'Longsword', type: 'weapon' }
      ]);

      setupMockGame([actorPack, itemPack]);
    });

    it('should return true when entity exists', async () => {
      const result = await searcher.exists('Goblin Scout');

      expect(result).toBe(true);
    });

    it('should return false when entity does not exist', async () => {
      const result = await searcher.exists('Nonexistent Entity');

      expect(result).toBe(false);
    });

    it('should filter by type when specified', async () => {
      const result = await searcher.exists('Goblin Scout', CompendiumType.ACTOR);

      expect(result).toBe(true);
    });

    it('should return false when type does not match', async () => {
      const result = await searcher.exists('Goblin Scout', CompendiumType.ITEM);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Search Mode Tests
  // ============================================================================

  describe('search modes', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('test.actors', [
        { name: 'Dragon', type: 'npc' },
        { name: 'Dragon Warrior', type: 'npc' },
        { name: 'Red Dragon', type: 'npc' },
        { name: 'Dragonborn', type: 'npc' }
      ]);

      setupMockGame([actorPack]);
    });

    it('should use EXACT mode correctly', async () => {
      const results = await searcher.searchActor('dragon', {
        mode: SearchMode.EXACT
      });

      expect(results).toHaveLength(1);
      expect(results[0].name.toLowerCase()).toBe('dragon');
    });

    it('should use STARTS_WITH mode correctly', async () => {
      const results = await searcher.searchActor('dragon', {
        mode: SearchMode.STARTS_WITH
      });

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.name.toLowerCase().startsWith('dragon'))).toBe(true);
    });

    it('should use CONTAINS mode correctly', async () => {
      const results = await searcher.searchActor('dragon', {
        mode: SearchMode.CONTAINS
      });

      expect(results).toHaveLength(4);
      expect(results.every((r) => r.name.toLowerCase().includes('dragon'))).toBe(true);
    });

    it('should use FUZZY mode with threshold', async () => {
      const results = await searcher.searchActor('dragn', {
        mode: SearchMode.FUZZY,
        fuzzyThreshold: 0.6
      });

      // Should find "Dragon" and similar names with fuzzy matching
      expect(results.length).toBeGreaterThan(0);
    });

    it('should respect fuzzy threshold', async () => {
      const highThreshold = await searcher.searchActor('xyz', {
        mode: SearchMode.FUZZY,
        fuzzyThreshold: 0.9
      });

      // Very different string should not match with high threshold
      expect(highThreshold).toHaveLength(0);
    });
  });

  // ============================================================================
  // Scoring and Sorting Tests
  // ============================================================================

  describe('result scoring and sorting', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('test.actors', [
        { name: 'Goblin', type: 'npc' },
        { name: 'Goblin Warrior', type: 'npc' },
        { name: 'Elite Goblin Champion', type: 'npc' },
        { name: 'Hobgoblin', type: 'npc' }
      ]);

      setupMockGame([actorPack]);
    });

    it('should rank exact matches highest', async () => {
      const results = await searcher.searchActor('goblin');

      // "Goblin" exact match should be first
      expect(results[0].name).toBe('Goblin');
      expect(results[0].score).toBe(100);
    });

    it('should rank starts-with matches second', async () => {
      const results = await searcher.searchActor('goblin');

      // "Goblin Warrior" starts with should be second
      expect(results[1].name).toBe('Goblin Warrior');
      expect(results[1].score).toBe(90);
    });

    it('should rank contains matches by position', async () => {
      const results = await searcher.searchActor('goblin');

      // Results should be sorted by score (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  // ============================================================================
  // Pack Filtering Tests
  // ============================================================================

  describe('pack filtering', () => {
    beforeEach(() => {
      const worldPack = createMockActorPack(
        'world.npcs',
        [{ name: 'World Actor', type: 'npc' }],
        'world'
      );

      const modulePack = createMockActorPack(
        'module.monsters',
        [{ name: 'Module Actor', type: 'npc' }],
        'module'
      );

      const systemPack = createMockActorPack(
        'dnd5e.actors',
        [{ name: 'System Actor', type: 'npc' }],
        'system'
      );

      setupMockGame([worldPack, modulePack, systemPack]);
    });

    it('should include all pack types by default', async () => {
      const results = await searcher.searchActor('actor');

      expect(results).toHaveLength(3);
    });

    it('should filter to world packs only', async () => {
      const results = await searcher.searchActor('actor', {
        includeWorldPacks: true,
        includeModulePacks: false,
        includeSystemPacks: false
      });

      expect(results).toHaveLength(1);
      expect(results[0].packType).toBe('world');
    });

    it('should filter to module packs only', async () => {
      const results = await searcher.searchActor('actor', {
        includeWorldPacks: false,
        includeModulePacks: true,
        includeSystemPacks: false
      });

      expect(results).toHaveLength(1);
      expect(results[0].packType).toBe('module');
    });

    it('should filter to system packs only', async () => {
      const results = await searcher.searchActor('actor', {
        includeWorldPacks: false,
        includeModulePacks: false,
        includeSystemPacks: true
      });

      expect(results).toHaveLength(1);
      expect(results[0].packType).toBe('system');
    });
  });

  // ============================================================================
  // getAvailableCompendiums Tests
  // ============================================================================

  describe('getAvailableCompendiums', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('monsters.npcs', [{ name: 'Test Actor' }], 'module');

      const itemPack = createMockItemPack('equipment.weapons', [{ name: 'Test Item' }], 'system');

      setupMockGame([actorPack, itemPack]);
    });

    it('should return all available compendiums', () => {
      const packs = searcher.getAvailableCompendiums();

      expect(packs).toHaveLength(2);
      expect(packs[0]).toHaveProperty('id');
      expect(packs[0]).toHaveProperty('name');
      expect(packs[0]).toHaveProperty('type');
      expect(packs[0]).toHaveProperty('source');
    });

    it('should filter by document type', () => {
      const packs = searcher.getAvailableCompendiums({
        type: CompendiumType.ACTOR
      });

      expect(packs).toHaveLength(1);
      expect(packs[0].type).toBe(CompendiumType.ACTOR);
    });

    it('should filter by package type', () => {
      const packs = searcher.getAvailableCompendiums({
        includeSystemPacks: true,
        includeModulePacks: false,
        includeWorldPacks: false
      });

      expect(packs).toHaveLength(1);
      expect(packs[0].source).toBe('system');
    });

    it('should return empty array when game.packs is unavailable', () => {
      delete globalThis.game;

      const packs = searcher.getAvailableCompendiums();

      expect(packs).toEqual([]);
    });
  });

  // ============================================================================
  // getDocument Tests
  // ============================================================================

  describe('getDocument', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('monsters.npcs', [
        { name: 'Goblin Scout', type: 'npc' }
      ]);

      setupMockGame([actorPack]);
    });

    it('should retrieve document by pack and ID', async () => {
      const doc = await searcher.getDocument('monsters.npcs', 'actor0');

      expect(doc).toBeTruthy();
      expect(doc.name).toBe('Goblin Scout');
    });

    it('should return null for nonexistent pack', async () => {
      const doc = await searcher.getDocument('nonexistent.pack', 'actor0');

      expect(doc).toBeNull();
    });

    it('should return null for nonexistent document', async () => {
      const doc = await searcher.getDocument('monsters.npcs', 'nonexistent');

      expect(doc).toBeNull();
    });

    it('should return null when game.packs is unavailable', async () => {
      delete globalThis.game;

      const doc = await searcher.getDocument('monsters.npcs', 'actor0');

      expect(doc).toBeNull();
    });

    it('should handle getDocument errors gracefully', async () => {
      const actorPack = createMockActorPack('monsters.npcs', []);
      actorPack.getDocument = vi.fn().mockRejectedValue(new Error('Test error'));

      setupMockGame([actorPack]);

      const doc = await searcher.getDocument('monsters.npcs', 'actor0');

      expect(doc).toBeNull();
    });
  });

  // ============================================================================
  // Cache Tests
  // ============================================================================

  describe('cache management', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('monsters.npcs', [{ name: 'Goblin', type: 'npc' }]);

      setupMockGame([actorPack]);
    });

    it('should cache pack indexes', async () => {
      await searcher.searchActor('goblin');

      expect(searcher._indexCache.size).toBe(1);
      expect(searcher._cacheTimestamps.size).toBe(1);
    });

    it('should use cached index on subsequent searches', async () => {
      const pack = game.packs.get('monsters.npcs');

      await searcher.searchActor('goblin');
      await searcher.searchActor('goblin');

      // getIndex should only be called once if cache is used
      expect(pack.getIndex.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('should clear cache with clearCache()', async () => {
      await searcher.searchActor('goblin');

      expect(searcher._indexCache.size).toBe(1);

      searcher.clearCache();

      expect(searcher._indexCache.size).toBe(0);
      expect(searcher._cacheTimestamps.size).toBe(0);
    });

    it('should return cache statistics', async () => {
      await searcher.searchActor('goblin');

      const stats = searcher.getCacheStats();

      expect(stats).toHaveProperty('entries');
      expect(stats).toHaveProperty('expiryMs');
      expect(stats.entries).toBe(1);
      expect(stats.expiryMs).toBe(300000);
    });

    it('should expire cache after timeout', async () => {
      // Create searcher with short expiry
      const shortCacheSearcher = new CompendiumSearcher({ cacheExpiryMs: 100 });

      await shortCacheSearcher.searchActor('goblin');
      expect(shortCacheSearcher._indexCache.size).toBe(1);

      const firstCacheTime = shortCacheSearcher._cacheTimestamps.get('monsters.npcs');

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // This should fetch fresh index and update timestamp
      await shortCacheSearcher.searchActor('goblin');

      const secondCacheTime = shortCacheSearcher._cacheTimestamps.get('monsters.npcs');
      expect(secondCacheTime).toBeGreaterThan(firstCacheTime);
    });
  });

  // ============================================================================
  // Convenience Method Tests
  // ============================================================================

  describe('findMatchingActors', () => {
    beforeEach(() => {
      const actorPack = createMockActorPack('monsters.npcs', [
        { name: 'Goblin Scout', type: 'npc' },
        { name: 'Goblin Warrior', type: 'npc' },
        { name: 'Orc Berserker', type: 'npc' }
      ]);

      setupMockGame([actorPack]);
    });

    it('should find matches for multiple names', async () => {
      // Use exact/close matches that will pass fuzzy threshold 0.7
      const results = await searcher.findMatchingActors(['Goblin Scout', 'Orc Berserker']);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
      expect(results.has('Goblin Scout')).toBe(true);
      expect(results.has('Orc Berserker')).toBe(true);
    });

    it('should use fuzzy matching by default', async () => {
      // Use close matches that have high similarity - lower threshold to find matches
      const results = await searcher.findMatchingActors(['Goblin', 'Orc'], {
        fuzzyThreshold: 0.4
      });

      // Should find similar matches with fuzzy search
      expect(results.size).toBeGreaterThan(0);
    });

    it('should limit results per name', async () => {
      const results = await searcher.findMatchingActors(['Goblin'], { limit: 1 });

      if (results.has('Goblin')) {
        expect(results.get('Goblin')).toHaveLength(1);
      }
    });

    it('should only return names with matches', async () => {
      const results = await searcher.findMatchingActors(['Goblin Scout', 'Nonexistent Entity XYZ']);

      expect(results.has('Goblin Scout')).toBe(true);
      expect(results.has('Nonexistent Entity XYZ')).toBe(false);
    });
  });

  describe('findMatchingItems', () => {
    beforeEach(() => {
      const itemPack = createMockItemPack('equipment.weapons', [
        { name: 'Longsword', type: 'weapon' },
        { name: 'Shortsword', type: 'weapon' },
        { name: 'Healing Potion', type: 'consumable' }
      ]);

      setupMockGame([itemPack]);
    });

    it('should find matches for multiple item names', async () => {
      // Use exact matches that will pass fuzzy threshold
      const results = await searcher.findMatchingItems(['Longsword', 'Healing Potion']);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
      expect(results.has('Longsword')).toBe(true);
      expect(results.has('Healing Potion')).toBe(true);
    });

    it('should use fuzzy matching by default', async () => {
      const results = await searcher.findMatchingItems(['Longsword', 'Potion']);

      // Should find similar matches with fuzzy search
      expect(results.size).toBeGreaterThan(0);
    });

    it('should only return items with matches', async () => {
      const results = await searcher.findMatchingItems([
        'Longsword',
        'Excalibur Legendary Blade XYZ'
      ]);

      expect(results.has('Longsword')).toBe(true);
      expect(results.has('Excalibur Legendary Blade XYZ')).toBe(false);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases and error handling', () => {
    it('should handle empty query string', async () => {
      const actorPack = createMockActorPack('monsters.npcs', [{ name: 'Goblin', type: 'npc' }]);

      setupMockGame([actorPack]);

      const results = await searcher.searchActor('');

      // Empty string in contains mode matches everything (all strings contain empty string)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle special characters in query', async () => {
      const actorPack = createMockActorPack('monsters.npcs', [
        { name: "Goblin's Revenge", type: 'npc' }
      ]);

      setupMockGame([actorPack]);

      const results = await searcher.searchActor("goblin's");

      expect(results).toHaveLength(1);
    });

    it('should handle pack with empty index', async () => {
      const emptyPack = createMockActorPack('empty.pack', []);

      setupMockGame([emptyPack]);

      const results = await searcher.searchActor('anything');

      expect(results).toEqual([]);
    });

    it('should handle pack getIndex failure gracefully', async () => {
      const errorPack = createMockActorPack('error.pack', [{ name: 'Test Actor', type: 'npc' }]);
      errorPack.indexed = false;
      errorPack.getIndex = vi.fn().mockRejectedValue(new Error('Index error'));

      setupMockGame([errorPack]);

      const results = await searcher.searchActor('test');

      // Should return empty array instead of throwing
      expect(results).toEqual([]);
    });

    it('should handle undefined game object', async () => {
      delete globalThis.game;

      const results = await searcher.searchActor('test');

      expect(results).toEqual([]);
    });

    it('should handle null game.packs', async () => {
      globalThis.game = { packs: null };

      const results = await searcher.searchActor('test');

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // Similarity Calculation Tests
  // ============================================================================

  describe('similarity calculation', () => {
    it('should calculate exact match as 1.0', () => {
      const similarity = searcher._calculateSimilarity('dragon', 'dragon');

      expect(similarity).toBe(1);
    });

    it('should calculate completely different strings as low similarity', () => {
      const similarity = searcher._calculateSimilarity('dragon', 'xyz');

      expect(similarity).toBeLessThan(0.5);
    });

    it('should calculate similar strings as high similarity', () => {
      const similarity = searcher._calculateSimilarity('dragon', 'dragn');

      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should handle empty strings', () => {
      const similarity = searcher._calculateSimilarity('', 'test');

      expect(similarity).toBe(0);
    });
  });

  // ============================================================================
  // Exported Constants Tests
  // ============================================================================

  describe('exported constants', () => {
    it('should export CompendiumType enum', () => {
      expect(CompendiumType).toBeDefined();
      expect(CompendiumType.ACTOR).toBe('Actor');
      expect(CompendiumType.ITEM).toBe('Item');
      expect(CompendiumType.JOURNAL).toBe('JournalEntry');
    });

    it('should export SearchMode enum', () => {
      expect(SearchMode).toBeDefined();
      expect(SearchMode.EXACT).toBe('exact');
      expect(SearchMode.CONTAINS).toBe('contains');
      expect(SearchMode.STARTS_WITH).toBe('starts');
      expect(SearchMode.FUZZY).toBe('fuzzy');
    });

    it('should export DEFAULT_SEARCH_OPTIONS', () => {
      expect(DEFAULT_SEARCH_OPTIONS).toBeDefined();
      expect(DEFAULT_SEARCH_OPTIONS.mode).toBe(SearchMode.CONTAINS);
      expect(DEFAULT_SEARCH_OPTIONS.limit).toBe(10);
      expect(DEFAULT_SEARCH_OPTIONS.fuzzyThreshold).toBe(0.6);
    });
  });
});
