/**
 * VocabularyDictionary - Custom Vocabulary Management Service
 *
 * Manages campaign-specific vocabulary terms for improved transcription accuracy.
 * Stores terms in categories (character names, locations, items, general terms, custom)
 * and provides methods for CRUD operations, import/export, and prompt generation.
 *
 * @class VocabularyDictionary
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { MODULE_ID } from '../constants.mjs';
import { DND_VOCABULARY } from '../data/dnd-vocabulary.mjs';

/**
 * Vocabulary category types
 * @enum {string}
 */
export const VocabularyCategory = {
  CHARACTER_NAMES: 'character_names',
  LOCATION_NAMES: 'location_names',
  ITEMS: 'items',
  TERMS: 'terms',
  CUSTOM: 'custom'
};

/**
 * Default dictionary structure
 * @constant {object}
 */
const DEFAULT_DICTIONARY = {
  [VocabularyCategory.CHARACTER_NAMES]: [],
  [VocabularyCategory.LOCATION_NAMES]: [],
  [VocabularyCategory.ITEMS]: [],
  [VocabularyCategory.TERMS]: [],
  [VocabularyCategory.CUSTOM]: []
};

/**
 * Maximum number of terms to include in transcription prompt
 * OpenAI has token limits, so we cap the vocabulary size
 * @constant {number}
 */
const MAX_PROMPT_TERMS = 50;

/**
 * VocabularyDictionary class for managing custom vocabulary
 *
 * @example
 * const dictionary = new VocabularyDictionary();
 * dictionary.addTerm('character_names', 'Aarakocra');
 * const prompt = dictionary.generatePrompt();
 */
export class VocabularyDictionary {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('VocabularyDictionary');

  /**
   * Create a new VocabularyDictionary instance
   */
  constructor() {
    this._logger.debug('VocabularyDictionary initialized');
  }

  /**
   * Initialize the vocabulary dictionary
   * Automatically loads default D&D terms if dictionary is empty
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    this._logger.debug('Initializing VocabularyDictionary...');

    try {
      // Load defaults if dictionary is empty
      await this.loadDefaults();
      this._logger.debug('VocabularyDictionary initialization complete');
    } catch (error) {
      this._logger.error('Failed to initialize VocabularyDictionary:', error);
      throw error;
    }
  }

  /**
   * Get all terms from a specific category
   *
   * @param {string} category - The vocabulary category
   * @returns {Array<string>} Array of terms in the category
   */
  getTerms(category) {
    this._validateCategory(category);

    const dictionary = this._getDictionary();
    return [...(dictionary[category] || [])];
  }

  /**
   * Get all terms from all categories
   *
   * @returns {object} Dictionary object with all categories and terms
   */
  getAllTerms() {
    return this._getDictionary();
  }

  /**
   * Add a term to a specific category
   *
   * @param {string} category - The vocabulary category
   * @param {string} term - The term to add
   * @returns {Promise<boolean>} True if term was added, false if it already existed
   */
  async addTerm(category, term) {
    this._validateCategory(category);

    if (!term || typeof term !== 'string') {
      throw new Error('Term must be a non-empty string');
    }

    const trimmedTerm = term.trim();
    if (!trimmedTerm) {
      throw new Error('Term cannot be empty or whitespace');
    }

    const dictionary = this._getDictionary();

    // Check if term already exists (case-insensitive)
    const exists = dictionary[category].some(
      (existing) => existing.toLowerCase() === trimmedTerm.toLowerCase()
    );

    if (exists) {
      this._logger.debug(`Term "${trimmedTerm}" already exists in ${category}`);
      return false;
    }

    // Add term to category
    dictionary[category].push(trimmedTerm);

    // Save to settings
    await this._saveDictionary(dictionary);

    this._logger.log(`Added term "${trimmedTerm}" to ${category}`);
    return true;
  }

  /**
   * Remove a term from a specific category
   *
   * @param {string} category - The vocabulary category
   * @param {string} term - The term to remove
   * @returns {Promise<boolean>} True if term was removed, false if it didn't exist
   */
  async removeTerm(category, term) {
    this._validateCategory(category);

    if (!term || typeof term !== 'string') {
      throw new Error('Term must be a non-empty string');
    }

    const dictionary = this._getDictionary();

    // Find and remove term (case-insensitive)
    const originalLength = dictionary[category].length;
    dictionary[category] = dictionary[category].filter(
      (existing) => existing.toLowerCase() !== term.toLowerCase()
    );

    const wasRemoved = dictionary[category].length < originalLength;

    if (wasRemoved) {
      await this._saveDictionary(dictionary);
      this._logger.log(`Removed term "${term}" from ${category}`);
    } else {
      this._logger.debug(`Term "${term}" not found in ${category}`);
    }

    return wasRemoved;
  }

  /**
   * Clear all terms from a specific category
   *
   * @param {string} category - The vocabulary category to clear
   * @returns {Promise<number>} Number of terms removed
   */
  async clearCategory(category) {
    this._validateCategory(category);

    const dictionary = this._getDictionary();
    const removedCount = dictionary[category].length;

    dictionary[category] = [];
    await this._saveDictionary(dictionary);

    this._logger.log(`Cleared ${removedCount} terms from ${category}`);
    return removedCount;
  }

  /**
   * Clear all terms from all categories
   *
   * @returns {Promise<number>} Total number of terms removed
   */
  async clearAll() {
    const dictionary = this._getDictionary();

    let totalRemoved = 0;
    for (const category of Object.keys(DEFAULT_DICTIONARY)) {
      totalRemoved += dictionary[category]?.length || 0;
    }

    await this._saveDictionary(DEFAULT_DICTIONARY);

    this._logger.log(`Cleared all vocabulary (${totalRemoved} terms)`);
    return totalRemoved;
  }

  /**
   * Export the entire dictionary as JSON
   *
   * @returns {string} JSON string of the dictionary
   */
  exportDictionary() {
    const dictionary = this._getDictionary();
    const totalTerms = this.getTotalTermCount();

    this._logger.log('Exporting vocabulary dictionary');
    this._logger.debug(`Export contains ${totalTerms} terms`);

    return JSON.stringify(dictionary, null, 2);
  }

  /**
   * Import a dictionary from JSON
   *
   * @param {string} json - JSON string containing dictionary data
   * @param {boolean} [merge=false] - If true, merge with existing terms; if false, replace
   * @returns {Promise<object>} Import statistics (added, skipped, total)
   */
  async importDictionary(json, merge = false) {
    this._logger.debug(
      `importDictionary called, merge: ${merge}, json length: ${json?.length || 0}`
    );

    if (!json || typeof json !== 'string') {
      throw new Error('JSON must be a non-empty string');
    }

    let importedData;
    try {
      importedData = JSON.parse(json);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }

    // Validate structure
    this._validateDictionaryStructure(importedData);

    const stats = {
      added: 0,
      skipped: 0,
      total: 0
    };

    if (merge) {
      // Merge with existing terms
      for (const category of Object.keys(DEFAULT_DICTIONARY)) {
        if (importedData[category]) {
          for (const term of importedData[category]) {
            const added = await this.addTerm(category, term);
            if (added) {
              stats.added++;
            } else {
              stats.skipped++;
            }
            stats.total++;
          }
        }
      }
    } else {
      // Replace entire dictionary
      await this._saveDictionary(importedData);

      // Count all terms
      for (const category of Object.keys(DEFAULT_DICTIONARY)) {
        const count = importedData[category]?.length || 0;
        stats.added += count;
        stats.total += count;
      }
    }

    this._logger.log(
      `Imported vocabulary: ${stats.added} added, ${stats.skipped} skipped (merge=${merge})`
    );

    return stats;
  }

  /**
   * Generate a prompt string for transcription that includes vocabulary terms
   * Limits to top N most relevant terms to stay within API limits
   *
   * @param {number} [maxTerms=50] - Maximum number of terms to include
   * @returns {string} Formatted prompt string for transcription API
   */
  generatePrompt(maxTerms = MAX_PROMPT_TERMS) {
    const dictionary = this._getDictionary();

    // Collect all terms from all categories
    const allTerms = [];

    for (const [_category, terms] of Object.entries(dictionary)) {
      if (Array.isArray(terms) && terms.length > 0) {
        allTerms.push(...terms);
      }
    }

    if (allTerms.length === 0) {
      return '';
    }

    // Limit to max terms (take first N for now; could be improved with frequency/priority)
    const selectedTerms = allTerms.slice(0, maxTerms);

    // Format as natural language prompt
    const prompt = `Common terms in this recording: ${selectedTerms.join(', ')}. Please transcribe these terms accurately.`;

    this._logger.debug(`Generated prompt with ${selectedTerms.length} terms`);

    return prompt;
  }

  /**
   * Get count of terms in a category
   *
   * @param {string} category - The vocabulary category
   * @returns {number} Number of terms in the category
   */
  getTermCount(category) {
    this._validateCategory(category);

    const dictionary = this._getDictionary();
    return dictionary[category]?.length || 0;
  }

  /**
   * Get total count of all terms across all categories
   *
   * @returns {number} Total number of terms
   */
  getTotalTermCount() {
    const dictionary = this._getDictionary();

    let total = 0;
    for (const category of Object.keys(DEFAULT_DICTIONARY)) {
      total += dictionary[category]?.length || 0;
    }

    return total;
  }

  /**
   * Check if a term exists in a category
   *
   * @param {string} category - The vocabulary category
   * @param {string} term - The term to check
   * @returns {boolean} True if term exists (case-insensitive)
   */
  hasTerm(category, term) {
    this._validateCategory(category);

    const dictionary = this._getDictionary();
    return dictionary[category].some((existing) => existing.toLowerCase() === term.toLowerCase());
  }

  /**
   * Load default D&D vocabulary terms if dictionary is empty
   * Only runs on first use to populate the dictionary with common D&D terms
   *
   * @returns {Promise<object>} Statistics about loaded terms (loaded, total, skipped)
   */
  async loadDefaults() {
    // Check if dictionary is already populated
    const totalTerms = this.getTotalTermCount();
    if (totalTerms > 0) {
      this._logger.debug('Dictionary already has terms, skipping default load');
      return {
        loaded: 0,
        total: 0,
        skipped: totalTerms
      };
    }

    this._logger.log('Loading default D&D vocabulary...');

    const stats = {
      loaded: 0,
      total: 0,
      skipped: 0
    };

    // Load all D&D vocabulary categories into the 'terms' category
    for (const [categoryKey, terms] of Object.entries(DND_VOCABULARY)) {
      this._logger.debug(`Loading ${terms.length} ${categoryKey} into terms category`);

      for (const term of terms) {
        const added = await this.addTerm(VocabularyCategory.TERMS, term);
        if (added) {
          stats.loaded++;
        } else {
          stats.skipped++;
        }
        stats.total++;
      }
    }

    this._logger.log(
      `Loaded ${stats.loaded} default D&D terms (${stats.skipped} skipped, ${stats.total} total)`
    );

    return stats;
  }

  /**
   * Extract terms from Foundry compendiums
   * Scans world compendiums for actor names and item names
   *
   * @returns {Promise<object>} Object with character_names and items arrays
   * @example
   * const suggestions = await dictionary.extractFromFoundryCompendiums();
   * // Returns: { character_names: ['Goblin', 'Troll'], items: ['Longsword', 'Potion of Healing'] }
   */
  async extractFromFoundryCompendiums() {
    this._logger.debug('extractFromFoundryCompendiums called');
    this._logger.debug('Extracting terms from Foundry compendiums...');

    // Check if game.packs is available (Foundry VTT context)
    if (typeof game === 'undefined' || !game.packs) {
      this._logger.warn('Foundry VTT game.packs not available - returning empty results');
      return {
        character_names: [],
        items: []
      };
    }

    const results = {
      character_names: [],
      items: []
    };

    try {
      // Iterate through all packs
      for (const pack of game.packs) {
        const metadata = pack.metadata;

        // Only process world compendiums (not module or system packs)
        const packageType = metadata.packageType || this._getPackageType(pack);
        if (packageType !== 'world') continue;

        // Get the pack index
        const index = await this._getPackIndex(pack);

        // Extract names based on compendium type
        if (metadata.type === 'Actor') {
          // Add actor names to character_names
          for (const entry of index) {
            if (entry.name) {
              results.character_names.push(entry.name);
            }
          }
        } else if (metadata.type === 'Item') {
          // Add item names to items
          for (const entry of index) {
            if (entry.name) {
              results.items.push(entry.name);
            }
          }
        }
      }

      // Remove duplicates
      results.character_names = [...new Set(results.character_names)];
      results.items = [...new Set(results.items)];

      // Sort alphabetically
      results.character_names.sort();
      results.items.sort();

      this._logger.log(
        `Extracted ${results.character_names.length} character names and ${results.items.length} items from compendiums`
      );

      return results;
    } catch (error) {
      this._logger.error('Failed to extract terms from compendiums:', error);
      return {
        character_names: [],
        items: []
      };
    }
  }

  // ==========================================
  // Private Helper Methods
  // ==========================================

  /**
   * Get the dictionary from Foundry settings
   *
   * @returns {object} The current dictionary
   * @private
   */
  _getDictionary() {
    const dictionary = game.settings.get(MODULE_ID, 'customVocabularyDictionary');

    // Ensure all categories exist
    for (const category of Object.keys(DEFAULT_DICTIONARY)) {
      if (!Array.isArray(dictionary[category])) {
        dictionary[category] = [];
      }
    }

    return dictionary;
  }

  /**
   * Save the dictionary to Foundry settings
   *
   * @param {object} dictionary - The dictionary to save
   * @returns {Promise<void>}
   * @private
   */
  async _saveDictionary(dictionary) {
    await game.settings.set(MODULE_ID, 'customVocabularyDictionary', dictionary);
  }

  /**
   * Validate that a category is valid
   *
   * @param {string} category - The category to validate
   * @throws {Error} If category is invalid
   * @private
   */
  _validateCategory(category) {
    const validCategories = Object.values(VocabularyCategory);

    if (!validCategories.includes(category)) {
      throw new Error(
        `Invalid category "${category}". Must be one of: ${validCategories.join(', ')}`
      );
    }
  }

  /**
   * Validate dictionary structure for import
   *
   * @param {object} data - The data to validate
   * @throws {Error} If structure is invalid
   * @private
   */
  _validateDictionaryStructure(data) {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Dictionary must be an object');
    }

    for (const category of Object.keys(DEFAULT_DICTIONARY)) {
      if (data[category] && !Array.isArray(data[category])) {
        throw new Error(`Category "${category}" must be an array`);
      }

      if (data[category]) {
        for (const term of data[category]) {
          if (typeof term !== 'string') {
            throw new Error(`All terms in "${category}" must be strings`);
          }
        }
      }
    }
  }

  /**
   * Get the index for a compendium pack
   * Similar to CompendiumSearcher but without caching
   *
   * @param {object} pack - The compendium pack
   * @returns {Promise<Array>} The pack index
   * @private
   */
  async _getPackIndex(pack) {
    try {
      // Ensure the index is loaded
      if (!pack.indexed) {
        await pack.getIndex();
      }

      const index = Array.from(pack.index.values());
      return index;
    } catch (error) {
      this._logger.error(`Failed to get index for pack ${pack.collection}:`, error.message);
      return [];
    }
  }

  /**
   * Determine the package type (world/module/system) of a compendium pack
   * Fallback for when metadata.packageType is not available
   *
   * @param {object} pack - The compendium pack
   * @returns {string} The package type ('world', 'module', or 'system')
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
}
