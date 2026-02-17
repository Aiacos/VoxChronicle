/**
 * CompendiumParser - Parses and indexes adventure content from Foundry VTT compendiums
 *
 * Ported from Narrator Master's compendium-parser.js to VoxChronicle ES6 module.
 * Provides content extraction, HTML stripping, keyword-indexed search, and caching
 * for AI grounding context.
 *
 * Supported document types: JournalEntry, Item, RollTable, Actor
 *
 * @module vox-chronicle/narrator
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';

/**
 * @typedef {Object} ParsedCompendiumEntry
 * @property {string} id - The unique entry identifier
 * @property {string} name - The entry name/title
 * @property {string} text - The extracted plain text content (HTML stripped)
 * @property {string} packId - The ID of the compendium pack containing this entry
 * @property {string} packName - The name of the compendium pack
 * @property {string} type - The document type (JournalEntry, Item, Actor, RollTable)
 */

/**
 * @typedef {Object} ParsedCompendium
 * @property {string} id - The compendium pack identifier
 * @property {string} name - The compendium pack name/title
 * @property {string} documentName - The document type this pack contains
 * @property {ParsedCompendiumEntry[]} entries - Array of parsed entries
 * @property {number} totalCharacters - Total character count across all entries
 * @property {Date} parsedAt - Timestamp when the compendium was parsed
 */

/**
 * @typedef {Object} SearchResult
 * @property {ParsedCompendiumEntry} entry - The matching entry
 * @property {string} compendium - The compendium name
 * @property {number} score - Relevance score (higher is better)
 */

/**
 * Represents a text chunk suitable for embedding
 * @typedef {Object} CompendiumTextChunk
 * @property {string} text - The chunk text content
 * @property {Object} metadata - Metadata about the chunk source
 * @property {string} metadata.source - Source type ('compendium')
 * @property {string} metadata.packId - The compendium pack ID
 * @property {string} metadata.packName - The compendium pack name
 * @property {string} metadata.entryId - The entry ID
 * @property {string} metadata.entryName - The entry name
 * @property {string} metadata.entryType - The entry document type
 * @property {number} metadata.startPos - Start position in the entry text
 * @property {number} metadata.endPos - End position in the entry text
 * @property {number} metadata.chunkIndex - Index of this chunk within the entry
 * @property {number} metadata.totalChunks - Total chunks for this entry
 */

/**
 * Options for chunk extraction
 * @typedef {Object} ChunkOptions
 * @property {number} [chunkSize=500] - Target characters per chunk
 * @property {number} [overlap=100] - Overlap characters between chunks
 */

/**
 * CompendiumParser handles reading and indexing adventure content from
 * Foundry VTT compendiums. It provides content extraction, HTML stripping,
 * keyword-indexed search, and caching functionality for AI grounding.
 *
 * @class CompendiumParser
 */
export class CompendiumParser {
  /**
   * Creates a new CompendiumParser instance.
   */
  constructor() {
    /** @private @type {ReturnType<typeof Logger.createChild>} */
    this._log = Logger.createChild('CompendiumParser');

    /**
     * Cache for parsed compendium content to reduce re-parsing
     * @private @type {Map<string, ParsedCompendium>}
     */
    this._cachedContent = new Map();

    /**
     * Keyword index with LRU eviction (bounded to prevent unbounded growth).
     * Maps keywords (>= 3 chars) to entry IDs and last access timestamp.
     * Automatically evicts oldest accessed entries when size exceeds _maxKeywordIndexSize.
     * @private @type {Map<string, {entryIds: Set<string>, lastAccessed: Date}>}
     */
    this._keywordIndex = new Map();

    /**
     * Maximum number of keyword index entries before LRU eviction
     * @private @type {number}
     */
    this._maxKeywordIndexSize = 5000;

    /**
     * Cached journal compendiums (adventure content)
     * @private @type {ParsedCompendium[]}
     */
    this._journalCompendiums = [];

    /**
     * Cached rules compendiums (rules/items/spells)
     * @private @type {ParsedCompendium[]}
     */
    this._rulesCompendiums = [];
  }

  // ---------------------------------------------------------------------------
  // Public parse methods
  // ---------------------------------------------------------------------------

  /**
   * Parses all journal compendiums (adventure content).
   * Journal compendiums typically contain narrative content, locations, NPCs, etc.
   *
   * @returns {Promise<ParsedCompendium[]>} Array of parsed journal compendiums
   */
  async parseJournalCompendiums() {
    if (!game.packs) {
      this._log.warn('Compendium packs not available');
      return [];
    }

    const journalPacks = game.packs.filter(p => p.documentName === 'JournalEntry');
    this._log.debug(`Found ${journalPacks.length} journal compendium packs`);

    const results = [];

    for (const pack of journalPacks) {
      try {
        const parsed = await this._parseCompendiumPack(pack);
        if (parsed && parsed.entries.length > 0) {
          results.push(parsed);
        }
      } catch (error) {
        this._log.warn(`Failed to parse journal compendium "${pack.metadata?.label}"`, error);
      }
    }

    this._journalCompendiums = results;
    this._log.info(`Parsed ${results.length} journal compendiums with content`);

    return results;
  }

  /**
   * Parses rules compendiums (Items, Spells, Rules JournalEntries, etc.).
   * Rules compendiums contain game mechanics, spells, items, etc.
   *
   * @returns {Promise<ParsedCompendium[]>} Array of parsed rules compendiums
   */
  async parseRulesCompendiums() {
    if (!game.packs) {
      this._log.warn('Compendium packs not available');
      return [];
    }

    // Include Items, RollTables, and any packs with "rules" or "regole" in the name
    const rulesPacks = game.packs.filter(p => {
      const docType = p.documentName;
      const packName = (p.metadata?.label || '').toLowerCase();
      const packId = (p.metadata?.id || p.collection || '').toLowerCase();

      // Include Item compendiums (spells, equipment, etc.)
      if (docType === 'Item') return true;

      // Include RollTables (random tables often used for rules)
      if (docType === 'RollTable') return true;

      // Include journal packs that seem rules-related
      if (docType === 'JournalEntry') {
        const rulesKeywords = [
          'rules', 'regole', 'manual', 'manuale',
          'reference', 'riferimento', 'srd', 'basic'
        ];
        return rulesKeywords.some(keyword =>
          packName.includes(keyword) || packId.includes(keyword)
        );
      }

      return false;
    });

    this._log.debug(`Found ${rulesPacks.length} rules compendium packs`);

    const results = [];

    for (const pack of rulesPacks) {
      try {
        const parsed = await this._parseCompendiumPack(pack);
        if (parsed && parsed.entries.length > 0) {
          results.push(parsed);
        }
      } catch (error) {
        this._log.warn(`Failed to parse rules compendium "${pack.metadata?.label}"`, error);
      }
    }

    this._rulesCompendiums = results;
    this._log.info(`Parsed ${results.length} rules compendiums with content`);

    return results;
  }

  // ---------------------------------------------------------------------------
  // Search methods
  // ---------------------------------------------------------------------------

  /**
   * Searches for entries containing specific keywords using the bounded index.
   *
   * @param {string} packId - The compendium pack ID to search in
   * @param {string[]} keywords - Keywords to search for
   * @returns {ParsedCompendiumEntry[]} Entries containing the keywords
   */
  searchByKeywords(packId, keywords) {
    const cached = this._cachedContent.get(packId);
    if (!cached) {
      this._log.warn(`Compendium not cached: ${packId}`);
      return [];
    }

    const matchingEntryIds = new Set();

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      if (normalizedKeyword.length < 2) continue;

      const key = `${packId}:${normalizedKeyword}`;
      const entry = this._keywordIndex.get(key);
      if (entry) {
        // Update last accessed time for LRU tracking
        entry.lastAccessed = new Date();
        for (const entryId of entry.entryIds) {
          matchingEntryIds.add(entryId);
        }
      }
    }

    return cached.entries.filter(entry => matchingEntryIds.has(entry.id));
  }

  /**
   * Searches for entries containing the query string across all cached compendiums.
   *
   * @param {string} query - The search query
   * @returns {SearchResult[]} Search results with relevance scores, sorted by score descending
   */
  search(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length >= 2);

    if (queryWords.length === 0) {
      return [];
    }

    const results = [];

    // Search through all cached compendiums
    for (const compendium of this._cachedContent.values()) {
      for (const entry of compendium.entries) {
        const score = this._calculateSearchScore(entry, queryWords, normalizedQuery);

        if (score > 0) {
          results.push({
            entry,
            compendium: compendium.name,
            score
          });
        }
      }
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    this._log.debug(`Search for "${query}" found ${results.length} results`);

    return results;
  }

  /**
   * Searches within a specific document type.
   *
   * @param {string} query - Search query
   * @param {string} documentType - Document type to search (JournalEntry, Item, etc.)
   * @returns {SearchResult[]} Filtered search results
   */
  searchByType(query, documentType) {
    const allResults = this.search(query);
    return allResults.filter(result => result.entry.type === documentType);
  }

  // ---------------------------------------------------------------------------
  // Content retrieval methods
  // ---------------------------------------------------------------------------

  /**
   * Gets the combined content formatted for AI context.
   * Includes both journal and rules compendiums with source references.
   *
   * @param {number} [maxLength=30000] - Maximum length of output
   * @returns {string} Formatted content for AI with source citations
   */
  getContentForAI(maxLength = 30000) {
    let content = '';
    const allCompendiums = [...this._journalCompendiums, ...this._rulesCompendiums];

    if (allCompendiums.length === 0) {
      return '';
    }

    content += '# CONTENUTO COMPENDI\n\n';

    for (const compendium of allCompendiums) {
      const compendiumHeader = `## Compendio: ${compendium.name} (${compendium.documentName})\n\n`;

      if (content.length + compendiumHeader.length > maxLength) {
        content += '\n[... contenuto compendi troncato per lunghezza ...]\n';
        break;
      }

      content += compendiumHeader;

      for (const entry of compendium.entries) {
        // Format with source citation
        const entryContent = `### ${entry.name}\n[Fonte: ${compendium.name}]\n${entry.text}\n\n`;

        if (content.length + entryContent.length > maxLength) {
          content += '\n[... contenuto troncato per lunghezza ...]\n';
          break;
        }

        content += entryContent;
      }
    }

    return content;
  }

  /**
   * Gets the journal compendiums content formatted for AI.
   *
   * @param {number} [maxLength=20000] - Maximum length
   * @returns {string} Formatted journal compendium content
   */
  getJournalContentForAI(maxLength = 20000) {
    return this._getContentForAIFromList(
      this._journalCompendiums,
      maxLength,
      'CONTENUTO AVVENTURA (COMPENDI)'
    );
  }

  /**
   * Gets the rules compendiums content formatted for AI.
   *
   * @param {number} [maxLength=10000] - Maximum length
   * @returns {string} Formatted rules compendium content
   */
  getRulesContentForAI(maxLength = 10000) {
    return this._getContentForAIFromList(
      this._rulesCompendiums,
      maxLength,
      'REGOLE E RIFERIMENTI (COMPENDI)'
    );
  }

  /**
   * Gets content related to a specific topic by searching and formatting.
   *
   * @param {string} topic - The topic to get content for
   * @param {number} [maxResults=5] - Maximum number of results to include
   * @returns {string} Formatted content for the topic with source citations
   */
  getTopicContent(topic, maxResults = 5) {
    const results = this.search(topic);

    if (results.length === 0) {
      return '';
    }

    const topResults = results.slice(0, maxResults);
    let content = `# Informazioni su: ${topic}\n\n`;

    for (const result of topResults) {
      content += `## ${result.entry.name}\n`;
      content += `[Fonte: ${result.compendium}]\n`;
      content += `${result.entry.text}\n\n`;
    }

    return content;
  }

  // ---------------------------------------------------------------------------
  // Entry access methods
  // ---------------------------------------------------------------------------

  /**
   * Gets a specific entry by ID from a cached compendium.
   *
   * @param {string} packId - The compendium pack ID
   * @param {string} entryId - The entry ID
   * @returns {ParsedCompendiumEntry|null} The entry or null if not found
   */
  getEntry(packId, entryId) {
    const cached = this._cachedContent.get(packId);
    if (!cached) {
      return null;
    }
    return cached.entries.find(entry => entry.id === entryId) || null;
  }

  /**
   * Gets all entries from a cached compendium.
   *
   * @param {string} packId - The compendium pack ID
   * @returns {ParsedCompendiumEntry[]} Array of entries or empty array
   */
  getEntries(packId) {
    const cached = this._cachedContent.get(packId);
    return cached ? cached.entries : [];
  }

  /**
   * Lists all available compendium packs in the game.
   *
   * @returns {Array<{id: string, name: string, type: string}>} Array of pack info objects
   */
  listAvailablePacks() {
    if (!game.packs) {
      this._log.warn('Compendium packs not available');
      return [];
    }

    return Array.from(game.packs).map(pack => ({
      id: pack.collection || pack.metadata?.id,
      name: pack.metadata?.label || pack.title,
      type: pack.documentName
    }));
  }

  // ---------------------------------------------------------------------------
  // Cache management
  // ---------------------------------------------------------------------------

  /**
   * Clears the cache for a specific compendium.
   *
   * @param {string} packId - The compendium pack ID to clear
   */
  clearCache(packId) {
    this._cachedContent.delete(packId);

    // Clear bounded keyword index entries for this pack
    for (const key of this._keywordIndex.keys()) {
      if (key.startsWith(`${packId}:`)) {
        this._keywordIndex.delete(key);
      }
    }

    // Remove from categorized lists
    this._journalCompendiums = this._journalCompendiums.filter(c => c.id !== packId);
    this._rulesCompendiums = this._rulesCompendiums.filter(c => c.id !== packId);

    this._log.debug(`Cleared cache for compendium: ${packId}`);
  }

  /**
   * Clears all cached content.
   */
  clearAllCache() {
    this._cachedContent.clear();
    this._keywordIndex.clear();
    this._journalCompendiums = [];
    this._rulesCompendiums = [];
    this._log.debug('Cleared all compendium cache');
  }

  /**
   * Checks if a compendium is cached.
   *
   * @param {string} packId - The compendium pack ID
   * @returns {boolean} True if cached
   */
  isCached(packId) {
    return this._cachedContent.has(packId);
  }

  /**
   * Gets statistics about the parser cache.
   *
   * @returns {{cachedCompendiums: number, journalCompendiums: number, rulesCompendiums: number, totalEntries: number, totalCharacters: number, indexedKeywords: number}}
   */
  getCacheStats() {
    let totalEntries = 0;
    let totalCharacters = 0;

    for (const compendium of this._cachedContent.values()) {
      totalEntries += compendium.entries.length;
      totalCharacters += compendium.totalCharacters;
    }

    return {
      cachedCompendiums: this._cachedContent.size,
      journalCompendiums: this._journalCompendiums.length,
      rulesCompendiums: this._rulesCompendiums.length,
      totalEntries,
      totalCharacters,
      indexedKeywords: this._keywordIndex.size
    };
  }

  // ---------------------------------------------------------------------------
  // Text chunking for embeddings
  // ---------------------------------------------------------------------------

  /**
   * Gets text chunks from a compendium pack suitable for embedding.
   * Chunks are created with overlap for better semantic coherence and break at sentence
   * boundaries when possible.
   *
   * @param {string} packId - The compendium pack ID to extract chunks from
   * @param {ChunkOptions} [options={}] - Chunking options
   * @returns {Promise<CompendiumTextChunk[]>} Array of text chunks with metadata
   * @throws {Error} If the pack is not cached
   */
  async getChunksForEmbedding(packId, options = {}) {
    const cached = this._cachedContent.get(packId);
    if (!cached) {
      throw new Error(
        game.i18n?.format('VOXCHRONICLE.Errors.CompendiumNotCached', { id: packId })
          ?? `Compendium not cached: ${packId}`
      );
    }

    const chunkSize = options.chunkSize || 500;
    const overlap = options.overlap || 100;

    /** @type {CompendiumTextChunk[]} */
    const allChunks = [];

    for (const entry of cached.entries) {
      // Skip entries with no meaningful content
      if (!entry.text || entry.text.trim().length === 0) {
        continue;
      }

      // Chunk the entry text
      const entryChunks = this._chunkText(entry.text, chunkSize, overlap);

      // Add metadata to each chunk
      for (let i = 0; i < entryChunks.length; i++) {
        const chunk = entryChunks[i];

        // Skip empty chunks
        if (!chunk.text || chunk.text.trim().length === 0) {
          continue;
        }

        allChunks.push({
          text: chunk.text,
          metadata: {
            source: 'compendium',
            packId: cached.id,
            packName: cached.name,
            entryId: entry.id,
            entryName: entry.name,
            entryType: entry.type,
            startPos: chunk.startPos,
            endPos: chunk.endPos,
            chunkIndex: i,
            totalChunks: entryChunks.length
          }
        });
      }
    }

    this._log.debug(
      `Extracted ${allChunks.length} chunks from compendium "${cached.name}" ` +
      `(${cached.entries.length} entries, chunkSize=${chunkSize}, overlap=${overlap})`
    );

    return allChunks;
  }

  /**
   * Gets text chunks from all cached compendiums suitable for embedding.
   * Yields to the event loop between compendiums to prevent UI freeze.
   *
   * @param {ChunkOptions} [options={}] - Chunking options
   * @returns {Promise<CompendiumTextChunk[]>} Array of text chunks with metadata from all compendiums
   */
  async getChunksForEmbeddingAll(options = {}) {
    const allChunks = [];

    for (const [packId] of this._cachedContent) {
      try {
        const chunks = await this.getChunksForEmbedding(packId, options);
        allChunks.push(...chunks);
        // Yield to the event loop between compendiums
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (error) {
        this._log.warn(`Failed to chunk compendium "${packId}":`, error);
      }
    }

    this._log.debug(`Extracted ${allChunks.length} chunks from ${this._cachedContent.size} compendiums`);

    return allChunks;
  }

  // ---------------------------------------------------------------------------
  // HTML stripping (public utility)
  // ---------------------------------------------------------------------------

  /**
   * Strips HTML tags from content while preserving text.
   * Uses the DOM to parse HTML and extract plain text.
   *
   * @param {string} html - The HTML content to strip
   * @returns {string} Plain text content with normalized whitespace
   */
  stripHtml(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // Use DOM to parse HTML and extract text
    const div = document.createElement('div');
    div.innerHTML = html;

    let text = div.textContent || div.innerText || '';

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  // ---------------------------------------------------------------------------
  // Private: pack parsing
  // ---------------------------------------------------------------------------

  /**
   * Parses a single compendium pack and extracts all content.
   *
   * @param {object} pack - The Foundry VTT compendium pack
   * @returns {Promise<ParsedCompendium|null>} The parsed compendium or null if empty
   * @private
   */
  async _parseCompendiumPack(pack) {
    const packId = pack.collection || pack.metadata?.id;

    if (!packId) {
      this._log.warn('Pack has no valid identifier');
      return null;
    }

    // Check cache first
    if (this._cachedContent.has(packId)) {
      this._log.debug(`Using cached compendium content for: ${packId}`);
      return this._cachedContent.get(packId);
    }

    const packName = pack.metadata?.label || pack.title || packId;
    const documentName = pack.documentName;

    this._log.debug(`Parsing compendium: ${packName} (${documentName})`);

    // Get the index first (lightweight operation)
    const index = await pack.getIndex();

    if (!index || index.size === 0) {
      this._log.debug(`Compendium "${packName}" is empty`);
      return null;
    }

    const entries = [];
    let totalCharacters = 0;

    // Process each document in the pack
    for (const indexEntry of index) {
      try {
        const doc = await pack.getDocument(indexEntry._id);
        if (!doc) continue;

        const parsedEntry = this._parseCompendiumDocument(doc, packId, packName, documentName);
        if (parsedEntry) {
          entries.push(parsedEntry);
          totalCharacters += parsedEntry.text.length;
        }
      } catch (error) {
        this._log.debug(`Failed to parse entry "${indexEntry.name}" in pack "${packName}"`, error);
      }
    }

    if (entries.length === 0) {
      this._log.debug(`No parseable content in compendium "${packName}"`);
      return null;
    }

    // Sort entries by name
    entries.sort((a, b) => a.name.localeCompare(b.name));

    /** @type {ParsedCompendium} */
    const parsedCompendium = {
      id: packId,
      name: packName,
      documentName,
      entries,
      totalCharacters,
      parsedAt: new Date()
    };

    // Cache the result
    this._cachedContent.set(packId, parsedCompendium);

    // Build keyword index for the compendium
    this._buildKeywordIndex(packId, entries);

    this._log.debug(
      `Parsed ${entries.length} entries, ${totalCharacters} characters from "${packName}"`
    );

    return parsedCompendium;
  }

  /**
   * Parses a single compendium document based on its type.
   *
   * @param {object} doc - The Foundry VTT document
   * @param {string} packId - The pack ID
   * @param {string} packName - The pack name
   * @param {string} documentName - The document type
   * @returns {ParsedCompendiumEntry|null} The parsed entry or null if not parseable
   * @private
   */
  _parseCompendiumDocument(doc, packId, packName, documentName) {
    let text = '';

    switch (documentName) {
      case 'JournalEntry':
        text = this._extractJournalEntryText(doc);
        break;
      case 'Item':
        text = this._extractItemText(doc);
        break;
      case 'RollTable':
        text = this._extractRollTableText(doc);
        break;
      case 'Actor':
        text = this._extractActorText(doc);
        break;
      default:
        // Try to extract name and any description field
        text = doc.name || '';
        if (doc.system?.description?.value) {
          text += '\n' + this.stripHtml(doc.system.description.value);
        }
    }

    // Skip entries with no meaningful content
    if (!text || !text.trim()) {
      return null;
    }

    return {
      id: doc.id,
      name: doc.name || game.i18n?.localize('VOXCHRONICLE.Compendium.UnnamedEntry') || 'Unnamed Entry',
      text: text.trim(),
      packId,
      packName,
      type: documentName
    };
  }

  // ---------------------------------------------------------------------------
  // Private: document type extractors
  // ---------------------------------------------------------------------------

  /**
   * Extracts text content from a JournalEntry document.
   *
   * @param {object} journal - The journal entry document
   * @returns {string} Extracted text content
   * @private
   */
  _extractJournalEntryText(journal) {
    const parts = [journal.name];

    // Iterate through journal pages (v10+ API)
    if (journal.pages) {
      for (const page of journal.pages) {
        if (page.type === 'text' && page.text?.content) {
          parts.push(`## ${page.name}`);
          parts.push(this.stripHtml(page.text.content));
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Extracts text content from an Item document.
   *
   * @param {object} item - The item document
   * @returns {string} Extracted text content
   * @private
   */
  _extractItemText(item) {
    const parts = [item.name];

    if (item.type) {
      parts.push(`Tipo: ${item.type}`);
    }

    // Description (most systems use system.description.value)
    if (item.system?.description?.value) {
      parts.push(this.stripHtml(item.system.description.value));
    }

    // Additional system-specific fields
    if (item.system?.source) {
      parts.push(`Fonte: ${item.system.source}`);
    }

    return parts.join('\n');
  }

  /**
   * Extracts text content from a RollTable document.
   *
   * @param {object} table - The roll table document
   * @returns {string} Extracted text content
   * @private
   */
  _extractRollTableText(table) {
    const parts = [table.name];

    if (table.description) {
      parts.push(this.stripHtml(table.description));
    }

    // Include table results
    if (table.results && table.results.size > 0) {
      parts.push('Risultati:');
      for (const result of table.results) {
        const range = result.range ? `${result.range[0]}-${result.range[1]}` : '';
        const text = result.text || result.data?.text || '';
        if (text) {
          parts.push(`  ${range}: ${text}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Extracts text content from an Actor document.
   *
   * @param {object} actor - The actor document
   * @returns {string} Extracted text content
   * @private
   */
  _extractActorText(actor) {
    const parts = [actor.name];

    if (actor.type) {
      parts.push(`Tipo: ${actor.type}`);
    }

    // Biography/description
    if (actor.system?.details?.biography?.value) {
      parts.push(this.stripHtml(actor.system.details.biography.value));
    }

    return parts.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Private: keyword index
  // ---------------------------------------------------------------------------

  /**
   * Builds a keyword index for quick content lookup.
   *
   * @param {string} packId - The compendium pack ID
   * @param {ParsedCompendiumEntry[]} entries - The parsed entries
   * @private
   */
  _buildKeywordIndex(packId, entries) {
    for (const entry of entries) {
      // Extract significant words (3+ characters) from text
      const words = entry.text
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length >= 3);

      // Also add words from the entry name (2+ characters)
      const nameWords = entry.name
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length >= 2);

      const allWords = [...new Set([...words, ...nameWords])];

      for (const word of allWords) {
        const key = `${packId}:${word}`;
        this._addToKeywordIndex(key, entry.id);
      }
    }
  }

  /**
   * Adds a keyword to the bounded keyword index with LRU tracking.
   *
   * @param {string} key - The keyword index key (format: "packId:word")
   * @param {string} entryId - The entry ID containing this keyword
   * @private
   */
  _addToKeywordIndex(key, entryId) {
    let entry = this._keywordIndex.get(key);

    if (entry) {
      entry.entryIds.add(entryId);
      entry.lastAccessed = new Date();
    } else {
      entry = {
        entryIds: new Set([entryId]),
        lastAccessed: new Date()
      };
      this._keywordIndex.set(key, entry);
    }

    // Trim index if size exceeded
    if (this._keywordIndex.size > this._maxKeywordIndexSize) {
      this._trimKeywordIndex();
    }
  }

  /**
   * Trims the bounded keyword index using LRU eviction.
   * Removes oldest accessed entries until size is within limit.
   *
   * @private
   */
  _trimKeywordIndex() {
    const currentSize = this._keywordIndex.size;
    const targetSize = this._maxKeywordIndexSize;

    if (currentSize <= targetSize) {
      return;
    }

    // Sort by lastAccessed (oldest first) and remove excess
    const entries = Array.from(this._keywordIndex.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const entriesToRemove = currentSize - targetSize;

    for (let i = 0; i < entriesToRemove; i++) {
      const [key] = entries[i];
      this._keywordIndex.delete(key);
    }

    this._log.debug(
      `Trimmed keyword index: removed ${entriesToRemove} entries (${currentSize} -> ${targetSize})`
    );
  }

  // ---------------------------------------------------------------------------
  // Private: search scoring
  // ---------------------------------------------------------------------------

  /**
   * Calculates a relevance score for a search result.
   *
   * @param {ParsedCompendiumEntry} entry - The entry to score
   * @param {string[]} queryWords - The query words
   * @param {string} normalizedQuery - The full normalized query
   * @returns {number} Relevance score (0 = no match)
   * @private
   */
  _calculateSearchScore(entry, queryWords, normalizedQuery) {
    const normalizedName = entry.name.toLowerCase();
    const normalizedText = entry.text.toLowerCase();

    let score = 0;

    // Exact name match (highest priority)
    if (normalizedName === normalizedQuery) {
      score += 100;
    }
    // Name contains full query
    else if (normalizedName.includes(normalizedQuery)) {
      score += 50;
    }

    // Word-by-word matching
    for (const word of queryWords) {
      // Word in name
      if (normalizedName.includes(word)) {
        score += 10;
      }

      // Word in text
      if (normalizedText.includes(word)) {
        score += 2;
      }
    }

    return score;
  }

  // ---------------------------------------------------------------------------
  // Private: AI content formatting helper
  // ---------------------------------------------------------------------------

  /**
   * Formats content from a list of compendiums for AI.
   *
   * @param {ParsedCompendium[]} compendiums - The compendiums to format
   * @param {number} maxLength - Maximum content length
   * @param {string} header - Section header
   * @returns {string} Formatted content
   * @private
   */
  _getContentForAIFromList(compendiums, maxLength, header) {
    if (!compendiums || compendiums.length === 0) {
      return '';
    }

    let content = `# ${header}\n\n`;

    for (const compendium of compendiums) {
      const compendiumHeader = `## ${compendium.name}\n\n`;

      if (content.length + compendiumHeader.length > maxLength) {
        content += '\n[... contenuto troncato per lunghezza ...]\n';
        break;
      }

      content += compendiumHeader;

      for (const entry of compendium.entries) {
        const entryContent = `### ${entry.name}\n${entry.text}\n\n`;

        if (content.length + entryContent.length > maxLength) {
          content += '\n[... contenuto troncato per lunghezza ...]\n';
          break;
        }

        content += entryContent;
      }
    }

    return content;
  }

  // ---------------------------------------------------------------------------
  // Private: text chunking helpers
  // ---------------------------------------------------------------------------

  /**
   * Splits text into overlapping chunks suitable for embedding.
   * Attempts to break at sentence boundaries when possible for better semantic coherence.
   *
   * @param {string} text - The text to chunk
   * @param {number} [chunkSize=500] - Target characters per chunk
   * @param {number} [overlap=100] - Overlap characters between chunks
   * @returns {Array<{text: string, startPos: number, endPos: number}>} Array of chunks with positions
   * @private
   */
  _chunkText(text, chunkSize = 500, overlap = 100) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }

    // Normalize whitespace
    const normalizedText = text.replace(/\s+/g, ' ').trim();

    // If text is shorter than chunk size, return as single chunk
    if (normalizedText.length <= chunkSize) {
      return [{
        text: normalizedText,
        startPos: 0,
        endPos: normalizedText.length
      }];
    }

    const chunks = [];
    let startPos = 0;

    while (startPos < normalizedText.length) {
      // Calculate the target end position
      const targetEnd = Math.min(startPos + chunkSize, normalizedText.length);

      // Try to find a sentence boundary near the target end
      let actualEnd = this._findSentenceBoundary(normalizedText, startPos, targetEnd, chunkSize);

      // Extract the chunk text
      const chunkText = normalizedText.substring(startPos, actualEnd).trim();

      // Only add non-empty chunks
      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          startPos,
          endPos: actualEnd
        });
      }

      // Move to next position with overlap
      // Make sure we always make progress to avoid infinite loop
      const nextStart = actualEnd - overlap;
      if (nextStart <= startPos) {
        startPos = actualEnd;
      } else {
        startPos = nextStart;
      }

      // If we've reached the end, break
      if (actualEnd >= normalizedText.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Finds the best sentence boundary near the target end position.
   * Looks for sentence-ending punctuation (.!?) and prefers breaking there.
   *
   * @param {string} text - The text to search in
   * @param {number} startPos - Start position of the current chunk
   * @param {number} targetEnd - Target end position
   * @param {number} chunkSize - The chunk size for calculating minimum boundary position
   * @returns {number} The actual end position (at sentence boundary if found)
   * @private
   */
  _findSentenceBoundary(text, startPos, targetEnd, chunkSize) {
    // If we're at the end of text, return the text length
    if (targetEnd >= text.length) {
      return text.length;
    }

    // Define minimum position for sentence boundary (at least 50% of chunk size from start)
    const minBoundaryPos = startPos + Math.floor(chunkSize * 0.5);

    // Look for sentence-ending punctuation followed by space or end
    // Search backwards from targetEnd to find the last sentence boundary
    let bestBoundary = -1;

    // Check for sentence endings: . ! ? followed by space or end
    for (let i = targetEnd; i >= minBoundaryPos; i--) {
      const char = text[i - 1]; // Check the character before position i
      const nextChar = text[i] || ' '; // Character at position i (or space if at end)

      // Check for sentence ending punctuation followed by space/end
      if ((char === '.' || char === '!' || char === '?') && /\s/.test(nextChar)) {
        bestBoundary = i;
        break;
      }
    }

    // If we found a good sentence boundary, use it
    if (bestBoundary > 0) {
      return bestBoundary;
    }

    // Fallback: try to break at word boundary (space)
    const lastSpace = text.lastIndexOf(' ', targetEnd);
    if (lastSpace > minBoundaryPos) {
      return lastSpace;
    }

    // Last resort: use the target end position
    return targetEnd;
  }
}
