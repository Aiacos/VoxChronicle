/**
 * CompendiumSearcher - Foundry VTT Compendium Search Utility
 *
 * Provides searching capabilities across Foundry VTT compendiums (game.packs)
 * to find existing actors, items, journals, and other documents. Used to
 * prevent duplicate entity creation when extracting from session transcripts.
 *
 * @class CompendiumSearcher
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Document types that can be searched in compendiums
 * @enum {string}
 */
const CompendiumType = {
  ACTOR: 'Actor',
  ITEM: 'Item',
  JOURNAL: 'JournalEntry',
  SCENE: 'Scene',
  MACRO: 'Macro',
  PLAYLIST: 'Playlist',
  ROLLTABLE: 'RollTable',
  CARDS: 'Cards',
  ADVENTURE: 'Adventure'
};

/**
 * Search modes for matching
 * @enum {string}
 */
const SearchMode = {
  EXACT: 'exact', // Case-insensitive exact match
  CONTAINS: 'contains', // Name contains search term
  STARTS_WITH: 'starts', // Name starts with search term
  FUZZY: 'fuzzy' // Fuzzy matching with tolerance
};

/**
 * Default search options
 * @constant {object}
 */
const DEFAULT_SEARCH_OPTIONS = {
  mode: SearchMode.CONTAINS,
  caseSensitive: false,
  limit: 10,
  includeWorldPacks: true,
  includeModulePacks: true,
  includeSystemPacks: true,
  fuzzyThreshold: 0.6 // Minimum similarity score for fuzzy matching (0-1)
};

/**
 * CompendiumSearcher class for searching Foundry VTT compendiums
 *
 * @example
 * const searcher = new CompendiumSearcher();
 * const actors = await searcher.searchActor('Goblin');
 * const items = await searcher.searchItem('Sword', { mode: SearchMode.STARTS_WITH });
 */
class CompendiumSearcher {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('CompendiumSearcher');

  /**
   * Cache of indexed compendium contents
   * @type {Map<string, Array<object>>}
   * @private
   */
  _indexCache = new Map();

  /**
   * Cache expiry time in milliseconds (5 minutes)
   * @type {number}
   * @private
   */
  _cacheExpiryMs = 300000;

  /**
   * Timestamps for cache entries
   * @type {Map<string, number>}
   * @private
   */
  _cacheTimestamps = new Map();

  /**
   * Create a new CompendiumSearcher instance
   *
   * @param {object} [options] - Configuration options
   * @param {number} [options.cacheExpiryMs=300000] - Cache expiry time in milliseconds
   * @param {boolean} [options.preloadIndex=false] - Whether to preload compendium indexes
   */
  constructor(options = {}) {
    this._cacheExpiryMs = options.cacheExpiryMs ?? 300000;

    if (options.preloadIndex) {
      this._preloadIndexes();
    }

    this._logger.debug('CompendiumSearcher initialized');
  }

  /**
   * Search for actors across all actor compendiums
   *
   * @param {string} query - Search query
   * @param {object} [options] - Search options
   * @param {string} [options.mode='contains'] - Search mode
   * @param {boolean} [options.caseSensitive=false] - Case sensitive search
   * @param {number} [options.limit=10] - Maximum results to return
   * @param {string} [options.actorType] - Filter by actor type (npc, character, etc.)
   * @returns {Promise<Array<SearchResult>>} Array of matching actors
   */
  async searchActor(query, options = {}) {
    const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    this._logger.log(`Searching actors for: "${query}"`);

    const results = await this._searchCompendiums(query, CompendiumType.ACTOR, mergedOptions);

    // Filter by actor type if specified
    if (options.actorType) {
      return results.filter(
        (r) => r.document?.type?.toLowerCase() === options.actorType.toLowerCase()
      );
    }

    return results;
  }

  /**
   * Search for items across all item compendiums
   *
   * @param {string} query - Search query
   * @param {object} [options] - Search options
   * @param {string} [options.mode='contains'] - Search mode
   * @param {boolean} [options.caseSensitive=false] - Case sensitive search
   * @param {number} [options.limit=10] - Maximum results to return
   * @param {string} [options.itemType] - Filter by item type (weapon, armor, etc.)
   * @returns {Promise<Array<SearchResult>>} Array of matching items
   */
  async searchItem(query, options = {}) {
    const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    this._logger.log(`Searching items for: "${query}"`);

    const results = await this._searchCompendiums(query, CompendiumType.ITEM, mergedOptions);

    // Filter by item type if specified
    if (options.itemType) {
      return results.filter(
        (r) => r.document?.type?.toLowerCase() === options.itemType.toLowerCase()
      );
    }

    return results;
  }

  /**
   * Search for journal entries across all journal compendiums
   *
   * @param {string} query - Search query
   * @param {object} [options] - Search options
   * @param {string} [options.mode='contains'] - Search mode
   * @param {boolean} [options.caseSensitive=false] - Case sensitive search
   * @param {number} [options.limit=10] - Maximum results to return
   * @param {boolean} [options.searchContent=false] - Also search in journal content
   * @returns {Promise<Array<SearchResult>>} Array of matching journal entries
   */
  async searchJournal(query, options = {}) {
    const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    this._logger.log(`Searching journals for: "${query}"`);

    const results = await this._searchCompendiums(query, CompendiumType.JOURNAL, mergedOptions);

    return results;
  }

  /**
   * Search across multiple compendium types
   *
   * @param {string} query - Search query
   * @param {object} [options] - Search options
   * @param {Array<string>} [options.types] - Document types to search
   * @returns {Promise<object>} Results grouped by type
   */
  async searchAll(query, options = {}) {
    const types = options.types || [
      CompendiumType.ACTOR,
      CompendiumType.ITEM,
      CompendiumType.JOURNAL
    ];

    this._logger.log(`Searching all compendiums for: "${query}"`);

    const results = {};

    await Promise.all(
      types.map(async (type) => {
        results[type.toLowerCase()] = await this._searchCompendiums(query, type, {
          ...DEFAULT_SEARCH_OPTIONS,
          ...options
        });
      })
    );

    return results;
  }

  /**
   * Check if an entity with the given name exists in any compendium
   *
   * @param {string} name - Entity name to check
   * @param {string} [type] - Optional document type to filter
   * @returns {Promise<boolean>} True if entity exists
   */
  async exists(name, type = null) {
    const results = type
      ? await this._searchCompendiums(name, type, {
          ...DEFAULT_SEARCH_OPTIONS,
          mode: SearchMode.EXACT,
          limit: 1
        })
      : await this.searchAll(name, {
          mode: SearchMode.EXACT,
          limit: 1
        });

    if (Array.isArray(results)) {
      return results.length > 0;
    }

    // For searchAll results (object)
    return Object.values(results).some((arr) => arr.length > 0);
  }

  /**
   * Get all available compendiums
   *
   * @param {object} [options] - Filter options
   * @param {string} [options.type] - Filter by document type
   * @param {boolean} [options.includeWorldPacks=true] - Include world packs
   * @param {boolean} [options.includeModulePacks=true] - Include module packs
   * @param {boolean} [options.includeSystemPacks=true] - Include system packs
   * @returns {Array<object>} Array of compendium info objects
   */
  getAvailableCompendiums(options = {}) {
    const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    // Check if game.packs is available (Foundry VTT context)
    if (typeof game === 'undefined' || !game.packs) {
      this._logger.warn('Foundry VTT game.packs not available');
      return [];
    }

    const packs = [];

    for (const pack of game.packs) {
      // Filter by source type
      const metadata = pack.metadata;
      const source = metadata.packageType || this._getPackageType(pack);

      if (source === 'world' && !mergedOptions.includeWorldPacks) continue;
      if (source === 'module' && !mergedOptions.includeModulePacks) continue;
      if (source === 'system' && !mergedOptions.includeSystemPacks) continue;

      // Filter by document type
      if (options.type && metadata.type !== options.type) continue;

      packs.push({
        id: pack.collection,
        name: metadata.label || metadata.name,
        type: metadata.type,
        source: source,
        documentCount: pack.index?.size || 0,
        path: `Compendium.${pack.collection}`
      });
    }

    return packs;
  }

  /**
   * Get a specific document from a compendium by ID
   *
   * @param {string} packId - The compendium pack ID
   * @param {string} documentId - The document ID
   * @returns {Promise<object | null>} The document or null if not found
   */
  async getDocument(packId, documentId) {
    if (typeof game === 'undefined' || !game.packs) {
      this._logger.warn('Foundry VTT game.packs not available');
      return null;
    }

    const pack = game.packs.get(packId);
    if (!pack) {
      this._logger.warn(`Pack "${packId}" not found`);
      return null;
    }

    try {
      const doc = await pack.getDocument(documentId);
      return doc;
    } catch (error) {
      this._logger.error(`Failed to get document ${documentId} from ${packId}:`, error.message);
      return null;
    }
  }

  /**
   * Search within compendiums of a specific type
   *
   * @param {string} query - Search query
   * @param {string} documentType - Document type to search
   * @param {object} options - Search options
   * @returns {Promise<Array<SearchResult>>} Array of search results
   * @private
   */
  async _searchCompendiums(query, documentType, options) {
    // Check if game.packs is available (Foundry VTT context)
    if (typeof game === 'undefined' || !game.packs) {
      this._logger.warn('Foundry VTT game.packs not available - returning empty results');
      return [];
    }

    const results = [];
    const normalizedQuery = options.caseSensitive ? query : query.toLowerCase();

    // Iterate through all packs of the specified type
    for (const pack of game.packs) {
      const metadata = pack.metadata;

      // Filter by document type
      if (metadata.type !== documentType) continue;

      // Filter by package type
      const source = metadata.packageType || this._getPackageType(pack);
      if (source === 'world' && !options.includeWorldPacks) continue;
      if (source === 'module' && !options.includeModulePacks) continue;
      if (source === 'system' && !options.includeSystemPacks) continue;

      // Get the index (cached if possible)
      const index = await this._getPackIndex(pack);

      // Search the index
      for (const entry of index) {
        const name = entry.name || '';
        const normalizedName = options.caseSensitive ? name : name.toLowerCase();

        const isMatch = this._matchesQuery(normalizedName, normalizedQuery, options);

        if (isMatch) {
          results.push({
            id: entry._id,
            name: name,
            packId: pack.collection,
            packName: metadata.label || metadata.name,
            packType: source,
            documentType: documentType,
            img: entry.img || null,
            document: entry,
            score: this._calculateScore(normalizedName, normalizedQuery, options)
          });

          // Check limit
          if (results.length >= options.limit) {
            break;
          }
        }
      }

      // Check global limit
      if (results.length >= options.limit) {
        break;
      }
    }

    // Sort by relevance score (higher is better)
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    const limitedResults = results.slice(0, options.limit);

    this._logger.debug(
      `Found ${limitedResults.length} matches for "${query}" in ${documentType} compendiums`
    );

    return limitedResults;
  }

  /**
   * Get the index for a compendium pack (with caching)
   *
   * @param {object} pack - The compendium pack
   * @returns {Promise<Array>} The pack index
   * @private
   */
  async _getPackIndex(pack) {
    const cacheKey = pack.collection;
    const now = Date.now();

    // Check if cached and not expired
    if (this._indexCache.has(cacheKey)) {
      const timestamp = this._cacheTimestamps.get(cacheKey);
      if (now - timestamp < this._cacheExpiryMs) {
        return this._indexCache.get(cacheKey);
      }
    }

    // Fetch fresh index
    try {
      // Ensure the index is loaded
      if (!pack.indexed) {
        await pack.getIndex();
      }

      const index = Array.from(pack.index.values());

      // Cache the result
      this._indexCache.set(cacheKey, index);
      this._cacheTimestamps.set(cacheKey, now);

      return index;
    } catch (error) {
      this._logger.error(`Failed to get index for pack ${pack.collection}:`, error.message);
      return [];
    }
  }

  /**
   * Check if a name matches the query based on search mode
   *
   * @param {string} name - The normalized name to check
   * @param {string} query - The normalized query
   * @param {object} options - Search options
   * @returns {boolean} True if the name matches
   * @private
   */
  _matchesQuery(name, query, options) {
    switch (options.mode) {
      case SearchMode.EXACT:
        return name === query;

      case SearchMode.STARTS_WITH:
        return name.startsWith(query);

      case SearchMode.CONTAINS:
        return name.includes(query);

      case SearchMode.FUZZY: {
        const similarity = this._calculateSimilarity(name, query);
        return similarity >= options.fuzzyThreshold;
      }

      default:
        return name.includes(query);
    }
  }

  /**
   * Calculate a relevance score for a match
   *
   * @param {string} name - The normalized name
   * @param {string} query - The normalized query
   * @param {object} options - Search options
   * @returns {number} Relevance score (higher is better)
   * @private
   */
  _calculateScore(name, query, options) {
    // Exact match gets highest score
    if (name === query) return 100;

    // Starts with gets high score
    if (name.startsWith(query)) return 90;

    // Contains gets medium score (earlier position = higher score)
    const position = name.indexOf(query);
    if (position !== -1) {
      // Score decreases based on position (earlier = better)
      return 80 - Math.min(position, 30);
    }

    // Fuzzy match score
    if (options.mode === SearchMode.FUZZY) {
      const similarity = this._calculateSimilarity(name, query);
      return Math.round(similarity * 70);
    }

    return 0;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   *
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score between 0 and 1
   * @private
   */
  _calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    // Levenshtein distance
    const matrix = [];

    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[str1.length][str2.length];
    const maxLength = Math.max(str1.length, str2.length);

    return 1 - distance / maxLength;
  }

  /**
   * Determine the package type for a compendium
   *
   * @param {object} pack - The compendium pack
   * @returns {string} Package type: 'world', 'module', or 'system'
   * @private
   */
  _getPackageType(pack) {
    const collection = pack.collection;

    if (collection.startsWith('world.')) {
      return 'world';
    }

    // Check if it's a system pack
    if (typeof game !== 'undefined' && game.system?.id) {
      if (collection.startsWith(`${game.system.id}.`)) {
        return 'system';
      }
    }

    return 'module';
  }

  /**
   * Preload indexes for all compendiums
   *
   * @returns {Promise<void>}
   * @private
   */
  async _preloadIndexes() {
    if (typeof game === 'undefined' || !game.packs) {
      return;
    }

    this._logger.log('Preloading compendium indexes...');
    const startTime = performance.now();

    const promises = [];
    for (const pack of game.packs) {
      promises.push(this._getPackIndex(pack));
    }

    await Promise.all(promises);

    const elapsed = performance.now() - startTime;
    this._logger.log(`Preloaded ${promises.length} compendium indexes in ${elapsed.toFixed(0)}ms`);
  }

  /**
   * Clear the index cache
   */
  clearCache() {
    this._indexCache.clear();
    this._cacheTimestamps.clear();
    this._logger.debug('Index cache cleared');
  }

  /**
   * Get cache statistics
   *
   * @returns {object} Cache statistics
   */
  getCacheStats() {
    return {
      entries: this._indexCache.size,
      expiryMs: this._cacheExpiryMs
    };
  }

  /**
   * Find actors by name that might match extracted entities
   * Convenience method for entity extraction integration
   *
   * @param {Array<string>} names - Array of entity names to search
   * @param {object} [options] - Search options
   * @returns {Promise<Map<string, Array<SearchResult>>>} Map of name to matching results
   */
  async findMatchingActors(names, options = {}) {
    const results = new Map();

    await Promise.all(
      names.map(async (name) => {
        const matches = await this.searchActor(name, {
          mode: SearchMode.FUZZY,
          fuzzyThreshold: 0.7,
          limit: 3,
          ...options
        });

        if (matches.length > 0) {
          results.set(name, matches);
        }
      })
    );

    return results;
  }

  /**
   * Find items by name that might match extracted entities
   * Convenience method for entity extraction integration
   *
   * @param {Array<string>} names - Array of item names to search
   * @param {object} [options] - Search options
   * @returns {Promise<Map<string, Array<SearchResult>>>} Map of name to matching results
   */
  async findMatchingItems(names, options = {}) {
    const results = new Map();

    for (const name of names) {
      const matches = await this.searchItem(name, {
        mode: SearchMode.FUZZY,
        fuzzyThreshold: 0.7,
        limit: 3,
        ...options
      });

      if (matches.length > 0) {
        results.set(name, matches);
      }
    }

    return results;
  }
}

/**
 * @typedef {object} SearchResult
 * @property {string} id - Document ID
 * @property {string} name - Document name
 * @property {string} packId - Compendium pack ID
 * @property {string} packName - Compendium pack name
 * @property {string} packType - Package type (world, module, system)
 * @property {string} documentType - Document type (Actor, Item, etc.)
 * @property {string|null} img - Image path if available
 * @property {object} document - The raw index entry
 * @property {number} score - Relevance score (higher is better)
 */

// Export all classes and enums
export { CompendiumSearcher, CompendiumType, SearchMode, DEFAULT_SEARCH_OPTIONS };
