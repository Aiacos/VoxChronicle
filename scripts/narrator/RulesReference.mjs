/**
 * RulesReference - Rules Reference Service for VoxChronicle
 *
 * Provides quick access to D&D 5e SRD rules and game mechanics.
 * Detects rules questions in transcriptions using regex patterns,
 * searches compendiums for rules content with citation extraction,
 * and supports Italian and English question patterns.
 *
 * Ported from Narrator Master's rules-reference.js
 *
 * @class RulesReference
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { MODULE_ID } from '../constants.mjs';

/**
 * Default search result limit
 * @constant {number}
 */
const DEFAULT_RESULT_LIMIT = 5;

/**
 * Maximum cache size for rules entries
 * @constant {number}
 */
const _MAX_CACHE_SIZE = 1000;

/**
 * Represents a rule or game mechanic entry
 * @typedef {Object} RuleEntry
 * @property {string} id - Unique identifier for the rule
 * @property {string} title - The rule title
 * @property {string} content - The rule content/description
 * @property {string} category - Category (e.g., 'combat', 'spells', 'conditions')
 * @property {string[]} tags - Searchable tags
 * @property {string} [source] - Source book reference
 * @property {Citation} [citation] - Full citation information including page numbers
 */

/**
 * Represents citation information for a rule
 * @typedef {Object} Citation
 * @property {string} compendiumName - Name of the compendium pack
 * @property {string} compendiumLabel - Display label of the compendium
 * @property {string} [sourcebook] - Source book abbreviation (e.g., 'PHB', 'DMG', 'MM')
 * @property {number|string} [page] - Page number in the source book
 * @property {string} formatted - Formatted citation string for display
 */

/**
 * Represents a search result with relevance score
 * @typedef {Object} SearchResult
 * @property {RuleEntry} rule - The matching rule entry
 * @property {number} relevance - Relevance score 0-1
 * @property {string[]} matchedTerms - Terms that matched the query
 */

/**
 * RulesReference - Provides quick access to game rules and mechanics
 * Integrates with D&D 5e SRD content for contextual rule lookup
 */
export class RulesReference {
  /**
   * Creates a new RulesReference instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.language='it'] - Language for rule descriptions
   * @param {number} [options.resultLimit=5] - Maximum search results to return
   */
  constructor(options = {}) {
    /** @private */
    this._log = Logger.createChild('RulesReference');

    /**
     * Language for rule descriptions
     * @type {string}
     * @private
     */
    this._language = options.language || 'it';

    /**
     * Maximum search results to return
     * @type {number}
     * @private
     */
    this._resultLimit = options.resultLimit || DEFAULT_RESULT_LIMIT;

    /**
     * Cached rules database
     * @type {Map<string, RuleEntry>}
     * @private
     */
    this._rulesCache = new Map();

    /**
     * Search index for quick lookups
     * @type {Map<string, Set<string>>}
     * @private
     */
    this._searchIndex = new Map();

    /**
     * Recently accessed rules for quick access
     * @type {string[]}
     * @private
     */
    this._recentRules = [];

    /**
     * Maximum recent rules to track
     * @type {number}
     * @private
     */
    this._maxRecentSize = 10;

    /**
     * Whether the rules database has been loaded
     * @type {boolean}
     * @private
     */
    this._isLoaded = false;
  }

  /**
   * Checks if the service is configured and ready
   * @returns {boolean} True if rules database is loaded
   */
  isConfigured() {
    return this._isLoaded;
  }

  /**
   * Sets the language for rule descriptions
   * @param {string} language - Language code (e.g., 'it', 'en')
   */
  setLanguage(language) {
    this._language = language || 'it';
  }

  /**
   * Gets the current language setting
   * @returns {string} The language code
   */
  getLanguage() {
    return this._language;
  }

  /**
   * Sets the maximum number of search results
   * @param {number} limit - The result limit
   */
  setResultLimit(limit) {
    this._resultLimit = Math.max(1, limit || DEFAULT_RESULT_LIMIT);
  }

  /**
   * Gets the current result limit
   * @returns {number} The result limit
   */
  getResultLimit() {
    return this._resultLimit;
  }

  /**
   * Loads the rules database
   * @returns {Promise<void>}
   */
  async loadRules() {
    // TODO: Implementation
    this._isLoaded = true;
  }

  /**
   * Searches for rules matching the query
   * @param {string} query - The search query
   * @param {Object} [options={}] - Search options
   * @param {string[]} [options.categories] - Filter by categories
   * @param {number} [options.limit] - Override result limit
   * @returns {Promise<SearchResult[]>} Array of search results
   */
  async searchRules(_query, _options = {}) {
    // TODO: Implementation
    return [];
  }

  /**
   * Gets a specific rule by ID
   * @param {string} _ruleId - The rule ID
   * @returns {Promise<RuleEntry|null>} The rule entry or null if not found
   */
  async getRuleById(_ruleId) {
    // TODO: Implementation
    return null;
  }

  /**
   * Gets recently accessed rules
   * @returns {RuleEntry[]} Array of recent rule entries
   */
  getRecentRules() {
    // TODO: Implementation
    return [];
  }

  /**
   * Clears the rules cache and reloads
   * @returns {Promise<void>}
   */
  async reloadRules() {
    this._rulesCache.clear();
    this._searchIndex.clear();
    this._recentRules = [];
    this._isLoaded = false;
    await this.loadRules();
  }

  /**
   * Gets all available rule categories
   * @returns {string[]} Array of category names
   */
  getCategories() {
    // TODO: Implementation
    return [];
  }

  /**
   * Gets rules in a specific category
   * @param {string} _category - The category name
   * @returns {RuleEntry[]} Array of rule entries in the category
   */
  getRulesByCategory(_category) {
    // TODO: Implementation
    return [];
  }

  /**
   * Detects if text contains a rules question
   * @param {string} text - The text to analyze (transcription or query)
   * @returns {Object} Detection result with isRulesQuestion flag and details
   * @property {boolean} isRulesQuestion - Whether text contains a rules question
   * @property {number} confidence - Confidence score 0-1
   * @property {string[]} detectedTerms - Rules-related terms found
   * @property {string} questionType - Type of question ('mechanic', 'spell', 'condition', 'action', 'general')
   * @property {string} [extractedTopic] - The specific topic/mechanic being asked about
   */
  detectRulesQuestion(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        isRulesQuestion: false,
        confidence: 0,
        detectedTerms: [],
        questionType: 'general'
      };
    }

    const normalizedText = text.toLowerCase().trim();
    const detectedTerms = [];
    let confidence = 0;
    let questionType = 'general';
    let extractedTopic = null;

    // Check for explicit rules question patterns
    const questionPatterns = this._getQuestionPatterns();
    let patternMatchType = null;
    for (const pattern of questionPatterns) {
      if (pattern.regex.test(normalizedText)) {
        confidence = Math.max(confidence, pattern.confidence);
        patternMatchType = pattern.type;

        // Try to extract the topic being asked about
        const match = normalizedText.match(pattern.regex);
        if (match && match[1]) {
          extractedTopic = match[1].trim();
        }

        detectedTerms.push(pattern.name);
      }
    }

    // Check for common D&D mechanics terms (more specific, takes priority)
    const mechanicTerms = this._getMechanicTerms();
    let hasSpecificMechanic = false;
    for (const [term, category] of Object.entries(mechanicTerms)) {
      if (normalizedText.includes(term)) {
        detectedTerms.push(term);
        confidence = Math.max(confidence, 0.6);
        questionType = category; // More specific category from mechanic term
        hasSpecificMechanic = true;

        if (!extractedTopic) {
          extractedTopic = term;
        }
      }
    }

    // Use pattern type if no specific mechanic was found
    if (!hasSpecificMechanic && patternMatchType) {
      questionType = patternMatchType;
    }

    // Check for question words combined with rules context
    if (this._hasQuestionWord(normalizedText) && detectedTerms.length > 0) {
      confidence = Math.min(confidence + 0.2, 1.0);
    }

    return {
      isRulesQuestion: confidence > 0.3,
      confidence: Math.min(confidence, 1.0),
      detectedTerms,
      questionType,
      extractedTopic
    };
  }

  /**
   * Returns question patterns for rules detection
   * @returns {Array<{regex: RegExp, confidence: number, type: string, name: string}>}
   * @private
   */
  _getQuestionPatterns() {
    return [
      // English patterns
      {
        regex: /(?:how does|how do|what is the rule for|what are the rules for)\s+([a-z\s]+?)(?:\s+work|\?|$)/i,
        confidence: 0.9,
        type: 'mechanic',
        name: 'how_does_work'
      },
      {
        regex: /(?:can i|can you|am i able to|is it possible to)\s+([a-z\s]+?)(?:\?|$)/i,
        confidence: 0.7,
        type: 'action',
        name: 'can_i'
      },
      {
        regex: /(?:what happens when|what happens if)\s+([a-z\s]+?)(?:\?|$)/i,
        confidence: 0.8,
        type: 'mechanic',
        name: 'what_happens'
      },

      // Italian patterns
      {
        regex: /(?:come funziona|come funzionano|qual è la regola per|quali sono le regole per)\s+([a-z\s]+?)(?:\?|$)/i,
        confidence: 0.9,
        type: 'mechanic',
        name: 'come_funziona'
      },
      {
        regex: /(?:posso|possiamo|è possibile|si può)\s+([a-z\s]+?)(?:\?|$)/i,
        confidence: 0.7,
        type: 'action',
        name: 'posso'
      },
      {
        regex: /(?:cosa succede quando|cosa succede se|che succede se)\s+([a-z\s]+?)(?:\?|$)/i,
        confidence: 0.8,
        type: 'mechanic',
        name: 'cosa_succede'
      },
      {
        regex: /(?:quanto costa|quanti slot|quante azioni)\s+([a-z\s]+?)(?:\?|$)/i,
        confidence: 0.8,
        type: 'spell',
        name: 'quanto_costa'
      },

      // General rules keywords
      {
        regex: /\b(?:regola|regole|meccanica|meccaniche|rule|rules|mechanic|mechanics)\b/i,
        confidence: 0.6,
        type: 'general',
        name: 'rules_keyword'
      }
    ];
  }

  /**
   * Returns common D&D mechanic terms and their categories
   * @returns {Object<string, string>}
   * @private
   */
  _getMechanicTerms() {
    return {
      // Combat mechanics
      'grappling': 'combat',
      'lotta': 'combat',
      'opportunity attack': 'combat',
      'attacco di opportunità': 'combat',
      'advantage': 'combat',
      'vantaggio': 'combat',
      'disadvantage': 'combat',
      'svantaggio': 'combat',
      'critical hit': 'combat',
      'colpo critico': 'combat',
      'initiative': 'combat',
      'iniziativa': 'combat',
      'dodge': 'combat',
      'schivare': 'combat',
      'dash': 'combat',
      'scattare': 'combat',
      'disengage': 'combat',
      'disimpegno': 'combat',

      // Spell mechanics
      'concentration': 'spell',
      'concentrazione': 'spell',
      'spell slot': 'spell',
      'slot incantesimo': 'spell',
      'ritual': 'spell',
      'rituale': 'spell',
      'cantrip': 'spell',
      'trucchetto': 'spell',
      'casting time': 'spell',
      'tempo di lancio': 'spell',

      // Conditions
      'prone': 'condition',
      'prono': 'condition',
      'stunned': 'condition',
      'stordito': 'condition',
      'paralyzed': 'condition',
      'paralizzato': 'condition',
      'blinded': 'condition',
      'accecato': 'condition',
      'charmed': 'condition',
      'affascinato': 'condition',
      'frightened': 'condition',
      'spaventato': 'condition',
      'poisoned': 'condition',
      'avvelenato': 'condition',
      'restrained': 'condition',
      'trattenuto': 'condition',

      // Abilities and checks
      'saving throw': 'ability',
      'tiro salvezza': 'ability',
      'ability check': 'ability',
      'prova di caratteristica': 'ability',
      'skill check': 'ability',
      'prova di abilità': 'ability',

      // Movement
      'difficult terrain': 'movement',
      'terreno difficile': 'movement',
      'jump': 'movement',
      'saltare': 'movement',
      'climb': 'movement',
      'scalare': 'movement',
      'swimming': 'movement',
      'nuotare': 'movement',

      // Rest
      'short rest': 'rest',
      'riposo breve': 'rest',
      'long rest': 'rest',
      'riposo lungo': 'rest'
    };
  }

  /**
   * Checks if text contains a question word
   * @param {string} text - The normalized text
   * @returns {boolean}
   * @private
   */
  _hasQuestionWord(text) {
    const questionWords = [
      // English
      'how', 'what', 'when', 'where', 'why', 'who', 'can', 'does', 'do', 'is', 'are',
      // Italian
      'come', 'cosa', 'quando', 'dove', 'perché', 'chi', 'posso', 'può', 'puoi',
      'è', 'sono', 'qual', 'quale', 'quanti', 'quante', 'quanto'
    ];

    const words = text.split(/\s+/);
    return words.some(word => questionWords.includes(word));
  }

  /**
   * Extracts the primary topic from a rules question
   * @param {string} text - The text containing the question
   * @returns {string|null} The extracted topic or null
   */
  extractRulesTopic(text) {
    const detection = this.detectRulesQuestion(text);
    return detection.extractedTopic || null;
  }

  /**
   * Checks if a specific term is a known rules mechanic
   * @param {string} term - The term to check
   * @returns {boolean}
   */
  isKnownMechanic(term) {
    if (!term || typeof term !== 'string') {
      return false;
    }

    const normalizedTerm = term.toLowerCase().trim();
    const mechanicTerms = this._getMechanicTerms();

    return normalizedTerm in mechanicTerms;
  }

  // ========================================
  // Compendium Integration
  // ========================================

  /**
   * Searches for rules content in compendium packs
   * @param {string} query - The search query
   * @param {Object} [options={}] - Search options
   * @param {string[]} [options.packNames] - Specific pack names to search (optional, searches all if not specified)
   * @param {string[]} [options.documentTypes] - Filter by document types (e.g., 'JournalEntry', 'Item')
   * @param {number} [options.limit] - Maximum results to return
   * @returns {Promise<SearchResult[]>} Array of search results from compendiums
   */
  async searchCompendiums(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      this._log.warn('Invalid compendium search query');
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const limit = options.limit || this._resultLimit;
    const results = [];

    this._log.debug(`Searching compendiums for: "${query}"`);

    // Iterate through all compendium packs
    for (const pack of game.packs) {
      // Filter by pack names if specified
      if (options.packNames && !options.packNames.includes(pack.collection)) {
        continue;
      }

      // Filter by document types if specified
      if (options.documentTypes && !options.documentTypes.includes(pack.documentName)) {
        continue;
      }

      try {
        const packResults = await this._searchCompendiumPack(pack, normalizedQuery);
        results.push(...packResults);
      } catch (error) {
        this._log.warn(`Error searching pack ${pack.collection}`, error);
      }
    }

    // Sort by relevance score (highest first)
    results.sort((a, b) => b.relevance - a.relevance);

    // Limit results
    const limitedResults = results.slice(0, limit);

    this._log.debug(`Found ${results.length} total results, returning ${limitedResults.length}`);

    return limitedResults;
  }

  /**
   * Searches a single compendium pack for matching entries
   * @param {CompendiumCollection} pack - The compendium pack to search
   * @param {string} normalizedQuery - The normalized search query
   * @returns {Promise<SearchResult[]>} Array of search results from this pack
   * @private
   */
  async _searchCompendiumPack(pack, normalizedQuery) {
    const results = [];

    // Get index for efficient searching
    const index = await pack.getIndex();

    // Search through index entries
    for (const entry of index) {
      const nameMatch = entry.name.toLowerCase().includes(normalizedQuery);
      let relevance = 0;
      const matchedTerms = [];

      // Calculate relevance based on name match
      if (nameMatch) {
        // Exact match gets highest score
        if (entry.name.toLowerCase() === normalizedQuery) {
          relevance = 1.0;
          matchedTerms.push(entry.name);
        }
        // Starts with query gets high score
        else if (entry.name.toLowerCase().startsWith(normalizedQuery)) {
          relevance = 0.8;
          matchedTerms.push(entry.name);
        }
        // Contains query gets medium score
        else {
          relevance = 0.6;
          matchedTerms.push(entry.name);
        }

        // Create a rule entry from the compendium entry
        const ruleEntry = await this._extractCompendiumEntry(pack, entry);

        if (ruleEntry) {
          results.push({
            rule: ruleEntry,
            relevance,
            matchedTerms
          });
        }
      }
    }

    return results;
  }

  /**
   * Extracts a rule entry from a compendium document
   * @param {CompendiumCollection} pack - The compendium pack
   * @param {Object} indexEntry - The index entry from the pack
   * @returns {Promise<RuleEntry|null>} The extracted rule entry or null
   * @private
   */
  async _extractCompendiumEntry(pack, indexEntry) {
    try {
      // Get the full document from the pack
      const doc = await pack.getDocument(indexEntry._id);
      if (!doc) {
        return null;
      }

      // Extract content based on document type
      let content = '';
      let category = 'general';

      // Handle JournalEntry documents
      if (pack.documentName === 'JournalEntry') {
        // Extract text from journal pages
        if (doc.pages) {
          const textPages = doc.pages.filter(page => page.type === 'text');
          content = textPages
            .map(page => {
              const rawContent = page.text?.content || '';
              return this._stripHtml(rawContent);
            })
            .join(' ');
        }
        category = 'rules';
      }
      // Handle Item documents (spells, equipment, etc.)
      else if (pack.documentName === 'Item') {
        content = doc.system?.description?.value || '';
        content = this._stripHtml(content);
        category = doc.type || 'item';
      }
      // Handle Actor documents
      else if (pack.documentName === 'Actor') {
        content = doc.system?.details?.biography?.value || '';
        content = this._stripHtml(content);
        category = 'creature';
      }
      // Generic fallback
      else {
        content = doc.system?.description?.value || doc.data?.description || '';
        if (typeof content === 'string') {
          content = this._stripHtml(content);
        }
      }

      // Extract citation information
      const citation = this._extractCitation(pack, doc);

      // Create rule entry
      return {
        id: `${pack.collection}.${indexEntry._id}`,
        title: doc.name || indexEntry.name,
        content: content.trim(),
        category,
        tags: this._extractTags(doc),
        source: pack.metadata?.label || pack.collection,
        citation
      };
    } catch (error) {
      this._log.warn(`Error extracting compendium entry ${indexEntry._id}`, error);
      return null;
    }
  }

  /**
   * Strips HTML tags from content while preserving text
   * @param {string} html - The HTML content to strip
   * @returns {string} Plain text content
   * @private
   */
  _stripHtml(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // Create a temporary DOM element to parse HTML
    const div = document.createElement('div');
    div.innerHTML = html;

    // Get text content, handling nested elements
    let text = div.textContent || div.innerText || '';

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Extracts searchable tags from a document
   * @param {Document} doc - The Foundry document
   * @returns {string[]} Array of tags
   * @private
   */
  _extractTags(doc) {
    const tags = [];

    // Add document type as a tag
    if (doc.type) {
      tags.push(doc.type);
    }

    // Add system-specific tags
    if (doc.system?.tags) {
      tags.push(...doc.system.tags);
    }

    // Add action type for items
    if (doc.system?.actionType) {
      tags.push(doc.system.actionType);
    }

    // Add spell school for spells
    if (doc.system?.school) {
      tags.push(doc.system.school);
    }

    return tags.filter(tag => tag && typeof tag === 'string');
  }

  /**
   * Extracts citation information from a compendium document
   * @param {CompendiumCollection} pack - The compendium pack
   * @param {Document} doc - The document to extract citation from
   * @returns {Citation} Citation information
   * @private
   */
  _extractCitation(pack, doc) {
    const citation = {
      compendiumName: pack.collection,
      compendiumLabel: pack.metadata?.label || pack.collection,
      sourcebook: null,
      page: null,
      formatted: ''
    };

    // Try to extract source book and page from various locations
    // Check flags (common place for source information)
    if (doc.flags?.core?.sourceId) {
      const sourceMatch = doc.flags.core.sourceId.match(/Compendium\.([^.]+)\.([^.]+)/);
      if (sourceMatch) {
        citation.sourcebook = this._parseSourcebookAbbreviation(sourceMatch[1]);
      }
    }

    // Check system data for source information (dnd5e system)
    if (doc.system?.source) {
      const source = doc.system.source;

      // Extract source book abbreviation
      if (typeof source === 'string') {
        citation.sourcebook = this._parseSourcebookAbbreviation(source);

        // Try to extract page number from source string (e.g., "PHB pg. 123" or "PHB 123")
        const pageMatch = source.match(/(?:pg?\.?\s*|p\.?\s*)?(\d+)/i);
        if (pageMatch) {
          citation.page = parseInt(pageMatch[1], 10);
        }
      } else if (typeof source === 'object') {
        // Some systems use object format
        if (source.book) {
          citation.sourcebook = this._parseSourcebookAbbreviation(source.book);
        }
        if (source.page) {
          citation.page = parseInt(source.page, 10);
        }
      }
    }

    // Check for page in document metadata
    if (!citation.page && doc.system?.details?.page) {
      citation.page = parseInt(doc.system.details.page, 10);
    }

    // Fallback: try to extract source from pack name
    if (!citation.sourcebook) {
      citation.sourcebook = this._parseSourcebookAbbreviation(pack.collection);
    }

    // Format the citation string
    citation.formatted = this._formatCitation(citation);

    return citation;
  }

  /**
   * Parses a source book abbreviation from a string
   * @param {string} str - String that may contain a source abbreviation
   * @returns {string|null} The parsed abbreviation or null
   * @private
   */
  _parseSourcebookAbbreviation(str) {
    if (!str || typeof str !== 'string') {
      return null;
    }

    const normalized = str.toUpperCase().trim();

    // Known D&D 5e source abbreviations
    const knownSources = {
      'PHB': 'PHB',
      'PLAYER': 'PHB',
      'PLAYERS': 'PHB',
      'PLAYERSHANDBOOK': 'PHB',
      'DMG': 'DMG',
      'DUNGEON': 'DMG',
      'DUNGEONMASTER': 'DMG',
      'MM': 'MM',
      'MONSTER': 'MM',
      'MONSTERS': 'MM',
      'XGTE': 'XGtE',
      'XANATHAR': 'XGtE',
      'TCE': 'TCE',
      'TASHA': 'TCE',
      'VGTM': 'VGtM',
      'VOLO': 'VGtM',
      'MTOF': 'MToF',
      'MORDENKAINEN': 'MToF',
      'SCAG': 'SCAG',
      'SWORD': 'SCAG',
      'EE': 'EE',
      'ELEMENTAL': 'EE',
      'EEPC': 'EEPC',
      'SRD': 'SRD',
      'BASIC': 'SRD'
    };

    // Try exact match first
    if (knownSources[normalized]) {
      return knownSources[normalized];
    }

    // Try to find known source in the string
    for (const [key, value] of Object.entries(knownSources)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    // If no known source found, try to extract any uppercase abbreviation
    const abbrevMatch = str.match(/\b([A-Z]{2,5})\b/);
    if (abbrevMatch) {
      return abbrevMatch[1];
    }

    return null;
  }

  /**
   * Formats a citation object into a display string
   * @param {Citation} citation - The citation information
   * @returns {string} Formatted citation string
   * @private
   */
  _formatCitation(citation) {
    const parts = [];

    // Add compendium label
    if (citation.compendiumLabel) {
      parts.push(citation.compendiumLabel);
    }

    // Add source book and page
    if (citation.sourcebook) {
      if (citation.page) {
        parts.push(`${citation.sourcebook} p. ${citation.page}`);
      } else {
        parts.push(citation.sourcebook);
      }
    } else if (citation.page) {
      // Page without source book
      parts.push(`p. ${citation.page}`);
    }

    // Join parts with separator
    return parts.join(' - ');
  }
}
