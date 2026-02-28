/**
 * JournalParser - Reads and indexes adventure content from Foundry VTT journals
 *
 * Ported from Narrator Master's journal-parser.js to VoxChronicle as an ES6 module.
 * Provides content extraction, HTML stripping, keyword indexing with LRU eviction,
 * hierarchical chapter structure extraction, and NPC profile extraction.
 *
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { stripHtml } from '../utils/HtmlUtils.mjs';

/**
 * Represents a parsed journal page with extracted content
 * @typedef {Object} ParsedPage
 * @property {string} id - The unique page identifier
 * @property {string} name - The page name/title
 * @property {string} text - The extracted plain text content (HTML stripped)
 * @property {number} order - The sort order of the page
 * @property {string} type - The original page type
 */

/**
 * Represents a parsed journal with all its content
 * @typedef {Object} ParsedJournal
 * @property {string} id - The journal identifier
 * @property {string} name - The journal name/title
 * @property {ParsedPage[]} pages - Array of parsed pages
 * @property {number} totalCharacters - Total character count across all pages
 * @property {Date} parsedAt - Timestamp when the journal was parsed
 */

/**
 * Represents a chapter/section in the hierarchical structure
 * @typedef {Object} ChapterNode
 * @property {string} id - Unique identifier for this node
 * @property {string} title - The heading/section title
 * @property {number} level - Heading level (1-6 for h1-h6, 0 for page-level)
 * @property {string} type - Node type: 'page', 'heading', or 'section'
 * @property {string} pageId - The ID of the page containing this node
 * @property {string} pageName - The name of the page containing this node
 * @property {number} position - Character position in the page content
 * @property {string} content - Text content following this heading (until next heading)
 * @property {ChapterNode[]} children - Child nodes (subsections)
 */

/**
 * Represents the complete chapter structure of a journal
 * @typedef {Object} ChapterStructure
 * @property {string} journalId - The journal ID
 * @property {string} journalName - The journal name
 * @property {ChapterNode[]} chapters - Top-level chapters (pages or h1 headings)
 * @property {number} totalHeadings - Total number of headings found
 * @property {Date} extractedAt - Timestamp when structure was extracted
 */

/**
 * Represents a text chunk suitable for embedding
 * @typedef {Object} TextChunk
 * @property {string} text - The chunk text content
 * @property {Object} metadata - Metadata about the chunk source
 * @property {string} metadata.source - Source type ('journal')
 * @property {string} metadata.journalId - The journal ID
 * @property {string} metadata.journalName - The journal name
 * @property {string} metadata.pageId - The page ID
 * @property {string} metadata.pageName - The page name
 * @property {number} metadata.startPos - Start position in the page text
 * @property {number} metadata.endPos - End position in the page text
 * @property {number} metadata.chunkIndex - Index of this chunk within the page
 * @property {number} metadata.totalChunks - Total chunks for this page
 */

/**
 * Options for chunk extraction
 * @typedef {Object} ChunkOptions
 * @property {number} [chunkSize=500] - Target characters per chunk
 * @property {number} [overlap=100] - Overlap characters between chunks
 */

/**
 * JournalParser - Handles reading and indexing adventure content from Foundry VTT journals.
 * Provides content extraction, HTML stripping, keyword indexing, chapter structure
 * extraction, and NPC profile extraction.
 *
 * @class JournalParser
 */
export class JournalParser {
  /**
   * Creates a new JournalParser instance
   */
  constructor() {
    /**
     * Child logger for JournalParser
     * @type {object}
     * @private
     */
    this._logger = Logger.createChild('JournalParser');

    /**
     * Cache for parsed journal content to reduce re-parsing
     * @type {Map<string, ParsedJournal>}
     * @private
     */
    this._cachedContent = new Map();

    /**
     * Keyword index with bounded size and LRU (Least Recently Used) eviction.
     * Maps keyword keys to page IDs and last access time for quick lookup.
     * When the index exceeds _maxKeywordIndexSize, the oldest accessed entries
     * are automatically evicted to prevent unbounded memory growth.
     *
     * @type {Map<string, {pageIds: Set<string>, lastAccessed: number}>}
     * @private
     */
    this._keywordIndex = new Map();

    /**
     * Maximum number of keyword index entries before LRU eviction.
     * Default: 5000 entries (protects against unbounded memory growth in large journals)
     * @type {number}
     * @private
     */
    this._maxKeywordIndexSize = 5000;
  }

  // ---------------------------------------------------------------------------
  // Public API — Parsing
  // ---------------------------------------------------------------------------

  /**
   * Parses a journal by its ID and extracts all text content
   *
   * @param {string} journalId - The ID of the journal to parse
   * @returns {Promise<ParsedJournal>} The parsed journal content
   * @throws {Error} If the journal ID is invalid or the journal is not found
   */
  async parseJournal(journalId) {
    if (!journalId || typeof journalId !== 'string') {
      throw new Error(
        game.i18n?.localize('VOXCHRONICLE.Errors.InvalidJournalId') ?? 'Invalid journal ID'
      );
    }

    // Check cache first
    if (this._cachedContent.has(journalId)) {
      this._logger.debug(`Using cached journal content for: ${journalId}`);
      return this._cachedContent.get(journalId);
    }

    // Access journal via Foundry VTT API
    const journal = game.journal.get(journalId);
    if (!journal) {
      throw new Error(
        game.i18n?.format('VOXCHRONICLE.Errors.JournalNotFound', { id: journalId })
          ?? `Journal not found: ${journalId}`
      );
    }

    this._logger.debug(`parseJournal() entry — "${journal.name}" (${journalId})`);
    const _parseStart = performance.now();

    const pages = [];
    let totalCharacters = 0;

    // Iterate through journal pages (v10+ API)
    for (const page of journal.pages) {
      const parsedPage = this._parsePage(page);
      if (parsedPage) {
        pages.push(parsedPage);
        totalCharacters += parsedPage.text.length;
      }
    }

    // Sort pages by their sort order
    pages.sort((a, b) => a.order - b.order);

    /** @type {ParsedJournal} */
    const parsedJournal = {
      id: journalId,
      name: journal.name,
      pages,
      totalCharacters,
      parsedAt: new Date()
    };

    // Cache the result
    this._cachedContent.set(journalId, parsedJournal);

    // Build keyword index for the journal
    this._buildKeywordIndex(journalId, pages);

    this._logger.debug(`parseJournal() exit — ${pages.length} pages, ${totalCharacters} chars from "${journal.name}", ${(performance.now() - _parseStart).toFixed(1)}ms`);

    return parsedJournal;
  }

  /**
   * Parses all journals available in the game.
   * Yields to the event loop between journals to prevent UI freeze.
   *
   * @returns {Promise<ParsedJournal[]>} Array of all parsed journals
   */
  async parseAll() {
    this._logger.debug('parseAll() entry');
    const _startTime = performance.now();

    if (!game.journal) {
      this._logger.warn('Journal collection not available');
      return [];
    }

    const results = [];
    for (const journal of game.journal.contents) {
      try {
        const parsed = await this.parseJournal(journal.id);
        results.push(parsed);
        // Yield to the event loop between journals to prevent main thread freeze
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (error) {
        this._logger.warn(`Failed to parse journal "${journal.name}":`, error);
      }
    }

    const totalPages = results.reduce((sum, j) => sum + j.pages.length, 0);
    this._logger.debug(`parseAll() exit — ${results.length} journals, ${totalPages} pages total, ${(performance.now() - _startTime).toFixed(1)}ms`);
    return results;
  }

  // ---------------------------------------------------------------------------
  // Public API — Keyword search
  // ---------------------------------------------------------------------------

  /**
   * Searches for pages containing specific keywords.
   * Updates LRU tracking on matched keyword entries.
   *
   * @param {string} journalId - The journal ID to search in
   * @param {string[]} keywords - Keywords to search for (minimum 3 characters each)
   * @returns {ParsedPage[]} Pages containing one or more of the keywords
   */
  searchByKeywords(journalId, keywords) {
    const cached = this._cachedContent.get(journalId);
    if (!cached) {
      this._logger.warn(`Journal not cached: ${journalId}`);
      return [];
    }

    const matchingPageIds = new Set();

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      if (normalizedKeyword.length < 3) continue;

      const key = `${journalId}:${normalizedKeyword}`;
      const entry = this._keywordIndex.get(key);
      if (entry) {
        // Update last accessed time for LRU tracking
        entry.lastAccessed = Date.now();
        for (const pageId of entry.pageIds) {
          matchingPageIds.add(pageId);
        }
      }
    }

    return cached.pages.filter(page => matchingPageIds.has(page.id));
  }

  /**
   * Returns the current number of keyword index entries
   *
   * @returns {number} The keyword index size
   */
  getKeywordCount() {
    return this._keywordIndex.size;
  }

  // ---------------------------------------------------------------------------
  // Public API — Chapter structure
  // ---------------------------------------------------------------------------

  /**
   * Extracts the hierarchical chapter structure from a journal.
   * Detects headings (h1-h6), page boundaries, and section markers (hr, dividers).
   *
   * @param {string} journalId - The journal ID to extract structure from
   * @returns {ChapterStructure|null} The chapter structure or null if journal is not cached
   */
  extractChapterStructure(journalId) {
    this._logger.debug(`extractChapterStructure() entry — journalId="${journalId}"`);

    const cached = this._cachedContent.get(journalId);
    if (!cached) {
      this._logger.warn(`Journal not cached: ${journalId}`);
      return null;
    }

    const chapters = [];
    let totalHeadings = 0;
    let nodeIdCounter = 0;

    for (const page of cached.pages) {
      // Get the raw HTML content for this page
      const journal = game.journal.get(journalId);
      if (!journal) {
        this._logger.warn(`Journal not found: ${journalId}`);
        continue;
      }

      const foundryPage = journal.pages.get(page.id);
      if (!foundryPage || foundryPage.type !== 'text') {
        continue;
      }

      const rawHtml = foundryPage.text?.content || '';

      // Extract headings and sections from HTML
      const headings = this._extractHeadingsFromHtml(rawHtml, page.id, page.name);
      totalHeadings += headings.length;

      // Create page-level node
      /** @type {ChapterNode} */
      const pageNode = {
        id: `node-${++nodeIdCounter}`,
        title: page.name,
        level: 0,
        type: 'page',
        pageId: page.id,
        pageName: page.name,
        position: 0,
        content: page.text,
        children: []
      };

      // Build hierarchical structure from flat headings list
      if (headings.length > 0) {
        pageNode.children = this._buildHeadingHierarchy(headings, nodeIdCounter);
        nodeIdCounter += headings.length;
      }

      chapters.push(pageNode);
    }

    /** @type {ChapterStructure} */
    const structure = {
      journalId: cached.id,
      journalName: cached.name,
      chapters,
      totalHeadings,
      extractedAt: new Date()
    };

    this._logger.debug(
      `Extracted chapter structure: ${chapters.length} pages, ${totalHeadings} headings`
    );

    return structure;
  }

  /**
   * Gets a flattened list of all chapters and sections for navigation
   *
   * @param {string} journalId - The journal ID
   * @returns {Array<{id: string, title: string, level: number, type: string, pageId: string, pageName: string, path: string}>} Flat navigation list
   */
  getFlatChapterList(journalId) {
    const structure = this.extractChapterStructure(journalId);
    if (!structure) {
      return [];
    }

    const flatList = [];

    const flatten = (nodes, path = []) => {
      for (const node of nodes) {
        const currentPath = [...path, node.title];
        flatList.push({
          id: node.id,
          title: node.title,
          level: node.level,
          type: node.type,
          pageId: node.pageId,
          pageName: node.pageName,
          path: currentPath.join(' > ')
        });

        if (node.children && node.children.length > 0) {
          flatten(node.children, currentPath);
        }
      }
    };

    flatten(structure.chapters);
    return flatList;
  }

  /**
   * Finds a chapter/section by matching against a scene name.
   * Uses pattern matching to handle various naming conventions such as
   * "Chapter 1: The Tavern", "Scene - The Dark Forest", "Act 2 - The Betrayal".
   *
   * @param {string} journalId - The journal ID to search in
   * @param {string} sceneName - The scene name to match
   * @returns {ChapterNode|null} The best matching chapter node or null if no match found
   */
  getChapterBySceneName(journalId, sceneName) {
    if (!sceneName || typeof sceneName !== 'string') {
      this._logger.warn('Invalid scene name provided');
      return null;
    }

    const structure = this.extractChapterStructure(journalId);
    if (!structure) {
      this._logger.warn(`Could not extract chapter structure for journal: ${journalId}`);
      return null;
    }

    // Extract searchable terms from scene name
    const searchTerms = this._extractSearchTermsFromSceneName(sceneName);

    if (searchTerms.length === 0) {
      this._logger.warn(`No valid search terms extracted from scene name: ${sceneName}`);
      return null;
    }

    // Find best matching chapter
    const flatList = this.getFlatChapterList(journalId);
    let bestMatch = null;
    let bestScore = 0;

    for (const chapter of flatList) {
      const score = this._calculateChapterMatchScore(chapter.title, searchTerms, sceneName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = chapter;
      }
    }

    // Require a minimum match score to avoid false positives
    const MIN_MATCH_SCORE = 0.3;
    if (bestScore < MIN_MATCH_SCORE) {
      this._logger.debug(
        `No chapter found matching scene "${sceneName}" (best score: ${bestScore.toFixed(2)})`
      );
      return null;
    }

    // Get the full ChapterNode from the structure
    const fullNode = this._findChapterNodeById(structure.chapters, bestMatch.id);

    this._logger.debug(
      `Matched scene "${sceneName}" to chapter "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`
    );

    return fullNode;
  }

  // ---------------------------------------------------------------------------
  // Public API — NPC profiles
  // ---------------------------------------------------------------------------

  /**
   * Extracts NPC profiles (names, descriptions, personalities) from a journal.
   * Identifies proper nouns and looks for NPC indicator keywords to build profiles.
   *
   * @param {string} journalId - The journal ID to extract NPC profiles from
   * @returns {Array<{name: string, description: string, personality: string, pages: string[]}>} Array of NPC profile objects
   */
  extractNPCProfiles(journalId) {
    this._logger.debug(`extractNPCProfiles() entry — journalId="${journalId}"`);

    const cached = this._cachedContent.get(journalId);
    if (!cached) {
      this._logger.warn(`Journal not cached: ${journalId}`);
      return [];
    }

    // Get potential NPC names using existing extractProperNouns method
    const properNouns = this._extractProperNouns(cached);

    // Keywords that indicate NPC descriptions (Italian and English)
    const npcIndicators = [
      // Italian
      'personaggio', 'png', 'npc', 'alleato', 'nemico', 'mercante',
      'locandiere', 'fabbro', 'mago', 'guerriero', 'chierico',
      'personalità', 'carattere', 'temperamento', 'atteggiamento',
      // English
      'character', 'ally', 'enemy', 'merchant', 'innkeeper',
      'blacksmith', 'wizard', 'warrior', 'cleric',
      'personality', 'temperament', 'attitude'
    ];

    const npcProfiles = [];

    for (const npcName of properNouns) {
      const profile = {
        name: npcName,
        description: '',
        personality: '',
        pages: []
      };

      let contextFound = false;

      for (const page of cached.pages) {
        const text = page.text;
        const lowerText = text.toLowerCase();
        const nameLower = npcName.toLowerCase();

        if (!lowerText.includes(nameLower)) {
          continue;
        }

        profile.pages.push(page.id);

        const sentences = text.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(nameLower)) {
            const trimmedSentence = sentence.trim();

            const hasIndicator = npcIndicators.some(indicator =>
              sentence.toLowerCase().includes(indicator)
            );

            if (hasIndicator) {
              contextFound = true;

              if (!profile.description) {
                profile.description = trimmedSentence;
              } else {
                profile.description += ' ' + trimmedSentence;
              }
            }

            // Extract personality traits
            const personalityKeywords = [
              'personalità', 'carattere', 'temperamento', 'atteggiamento',
              'personality', 'character', 'temperament', 'attitude',
              'gentile', 'brusco', 'amichevole', 'ostile', 'timido', 'coraggioso',
              'kind', 'gruff', 'friendly', 'hostile', 'shy', 'brave'
            ];

            const hasPersonalityKeyword = personalityKeywords.some(keyword =>
              sentence.toLowerCase().includes(keyword)
            );

            if (hasPersonalityKeyword) {
              if (!profile.personality) {
                profile.personality = trimmedSentence;
              } else {
                profile.personality += ' ' + trimmedSentence;
              }
            }
          }
        }
      }

      // Only include NPCs that have some context found
      if (contextFound && profile.pages.length > 0) {
        if (profile.description.length > 500) {
          profile.description = profile.description.substring(0, 500) + '...';
        }
        if (profile.personality.length > 300) {
          profile.personality = profile.personality.substring(0, 300) + '...';
        }
        npcProfiles.push(profile);
      }
    }

    this._logger.debug(`Extracted ${npcProfiles.length} NPC profiles`);

    return npcProfiles;
  }

  // ---------------------------------------------------------------------------
  // Public API — Cache management
  // ---------------------------------------------------------------------------

  /**
   * Clears the cache for a specific journal
   *
   * @param {string} journalId - The journal ID to clear
   */
  clearCache(journalId) {
    this._cachedContent.delete(journalId);

    // Clear keyword index entries for this journal
    for (const key of this._keywordIndex.keys()) {
      if (key.startsWith(`${journalId}:`)) {
        this._keywordIndex.delete(key);
      }
    }

    this._logger.debug(`Cleared cache for journal: ${journalId}`);
  }

  /**
   * Clears all cached content and keyword index
   */
  clearAllCache() {
    this._cachedContent.clear();
    this._keywordIndex.clear();
    this._logger.debug('Cleared all journal cache');
  }

  /**
   * Checks if a journal is cached
   *
   * @param {string} journalId - The journal ID
   * @returns {boolean} True if cached
   */
  isCached(journalId) {
    return this._cachedContent.has(journalId);
  }

  /**
   * Gets the name of a cached journal
   * @param {string} journalId - The journal ID
   * @returns {string} The journal name or empty string if not cached
   */
  getJournalName(journalId) {
    return this._cachedContent.get(journalId)?.name || '';
  }

  /**
   * Refreshes the cache for a journal by re-parsing it
   *
   * @param {string} journalId - The journal ID to refresh
   * @returns {Promise<ParsedJournal>} The freshly parsed journal
   */
  async refreshJournal(journalId) {
    this.clearCache(journalId);
    return this.parseJournal(journalId);
  }

  /**
   * Gets the full text content of a journal as a single string
   *
   * @param {string} journalId - The journal ID
   * @returns {string} Combined text content or empty string
   */
  getFullText(journalId) {
    const cached = this._cachedContent.get(journalId);
    if (!cached) {
      this._logger.warn(`Journal not cached: ${journalId}`);
      return '';
    }

    return cached.pages
      .map(page => `## ${page.name}\n${page.text}`)
      .join('\n\n');
  }

  /**
   * Gets statistics about the parser cache
   *
   * @returns {{cachedJournals: number, totalPages: number, totalCharacters: number, indexedKeywords: number}} Cache statistics
   */
  getCacheStats() {
    let totalPages = 0;
    let totalCharacters = 0;

    for (const journal of this._cachedContent.values()) {
      totalPages += journal.pages.length;
      totalCharacters += journal.totalCharacters;
    }

    return {
      cachedJournals: this._cachedContent.size,
      totalPages,
      totalCharacters,
      indexedKeywords: this._keywordIndex.size
    };
  }

  // ---------------------------------------------------------------------------
  // Public API — Text chunking for embeddings
  // ---------------------------------------------------------------------------

  /**
   * Gets text chunks from a journal suitable for embedding.
   * Chunks are created with overlap for better semantic coherence and break at sentence
   * boundaries when possible.
   *
   * @param {string} journalId - The journal ID to extract chunks from
   * @param {ChunkOptions} [options={}] - Chunking options
   * @returns {Promise<TextChunk[]>} Array of text chunks with metadata
   * @throws {Error} If the journal ID is invalid or the journal is not found
   */
  async getChunksForEmbedding(journalId, options = {}) {
    this._logger.debug(`getChunksForEmbedding() entry — journalId="${journalId}"`);
    const _chunkStart = performance.now();

    // Ensure journal is parsed and cached
    const parsedJournal = await this.parseJournal(journalId);

    const chunkSize = options.chunkSize || 500;
    const overlap = options.overlap || 100;

    /** @type {TextChunk[]} */
    const allChunks = [];

    for (const page of parsedJournal.pages) {
      // Skip pages with no meaningful content
      if (!page.text || page.text.trim().length === 0) {
        continue;
      }

      // Chunk the page text
      const pageChunks = this._chunkText(page.text, chunkSize, overlap);

      // Add metadata to each chunk
      for (let i = 0; i < pageChunks.length; i++) {
        const chunk = pageChunks[i];

        // Skip empty chunks
        if (!chunk.text || chunk.text.trim().length === 0) {
          continue;
        }

        allChunks.push({
          text: chunk.text,
          metadata: {
            source: 'journal',
            journalId: parsedJournal.id,
            journalName: parsedJournal.name,
            pageId: page.id,
            pageName: page.name,
            startPos: chunk.startPos,
            endPos: chunk.endPos,
            chunkIndex: i,
            totalChunks: pageChunks.length
          }
        });
      }
    }

    this._logger.debug(
      `getChunksForEmbedding() exit — ${allChunks.length} chunks from "${parsedJournal.name}" ` +
      `(${parsedJournal.pages.length} pages, chunkSize=${chunkSize}, overlap=${overlap}), ${(performance.now() - _chunkStart).toFixed(1)}ms`
    );

    return allChunks;
  }

  /**
   * Gets text chunks from all cached journals suitable for embedding.
   * Yields to the event loop between journals to prevent UI freeze.
   *
   * @param {ChunkOptions} [options={}] - Chunking options
   * @returns {Promise<TextChunk[]>} Array of text chunks with metadata from all journals
   */
  async getChunksForEmbeddingAll(options = {}) {
    const allChunks = [];

    for (const [journalId] of this._cachedContent) {
      try {
        const chunks = await this.getChunksForEmbedding(journalId, options);
        allChunks.push(...chunks);
        // Yield to the event loop between journals
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (error) {
        this._logger.warn(`Failed to chunk journal "${journalId}":`, error);
      }
    }

    this._logger.debug(`Extracted ${allChunks.length} chunks from ${this._cachedContent.size} journals`);

    return allChunks;
  }

  // ---------------------------------------------------------------------------
  // Private — Page parsing
  // ---------------------------------------------------------------------------

  /**
   * Parses a single journal page and extracts its content
   *
   * @param {object} page - The Foundry VTT page object
   * @returns {ParsedPage|null} The parsed page or null if not a text page / empty
   * @private
   */
  _parsePage(page) {
    // Only process text pages
    if (page.type !== 'text') {
      return null;
    }

    const rawContent = page.text?.content || '';
    const plainText = stripHtml(rawContent);

    // Skip empty pages
    if (!plainText.trim()) {
      return null;
    }

    return {
      id: page.id,
      name: page.name || game.i18n?.localize('VOXCHRONICLE.Journal.UnnamedPage') || 'Unnamed Page',
      text: plainText,
      order: page.sort || 0,
      type: page.type
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Keyword index
  // ---------------------------------------------------------------------------

  /**
   * Builds a keyword index for quick content lookup.
   * Deduplicates words per page and respects the bounded size limit.
   *
   * @param {string} journalId - The journal ID
   * @param {ParsedPage[]} pages - The parsed pages
   * @private
   */
  _buildKeywordIndex(journalId, pages) {
    for (const page of pages) {
      // Extract significant words (3+ characters) and deduplicate per page
      const words = page.text
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length >= 3);
      const uniqueWords = new Set(words);

      for (const word of uniqueWords) {
        const key = `${journalId}:${word}`;
        const existing = this._keywordIndex.get(key);

        if (existing) {
          existing.pageIds.add(page.id);
        } else if (this._keywordIndex.size < this._maxKeywordIndexSize) {
          this._keywordIndex.set(key, {
            pageIds: new Set([page.id]),
            lastAccessed: Date.now()
          });
        }
        // If at limit and key doesn't exist, skip silently
      }
    }
  }

  /**
   * Adds a keyword to the bounded keyword index with LRU tracking.
   * Used for runtime additions (not during bulk build).
   *
   * @param {string} key - The keyword index key (format: "journalId:word")
   * @param {string} pageId - The page ID containing this keyword
   * @private
   */
  _addToKeywordIndex(key, pageId) {
    let entry = this._keywordIndex.get(key);

    if (entry) {
      entry.pageIds.add(pageId);
      entry.lastAccessed = Date.now();
    } else {
      // Trim before adding if at limit (batch eviction)
      if (this._keywordIndex.size >= this._maxKeywordIndexSize) {
        this._trimKeywordIndex();
      }

      entry = {
        pageIds: new Set([pageId]),
        lastAccessed: Date.now()
      };
      this._keywordIndex.set(key, entry);
    }
  }

  /**
   * Trims the keyword index using batch eviction.
   * Removes 20% of entries (oldest by Map insertion order) to amortize cost.
   *
   * @private
   */
  _trimKeywordIndex() {
    const currentSize = this._keywordIndex.size;

    if (currentSize <= this._maxKeywordIndexSize) {
      return;
    }

    // Remove 20% of entries to avoid frequent trims
    const targetSize = Math.floor(this._maxKeywordIndexSize * 0.8);
    const entriesToRemove = currentSize - targetSize;

    // Delete oldest entries by Map iteration order (insertion order)
    let removed = 0;
    for (const key of this._keywordIndex.keys()) {
      if (removed >= entriesToRemove) break;
      this._keywordIndex.delete(key);
      removed++;
    }

    this._logger.debug(
      `Trimmed keyword index: removed ${removed} entries (${currentSize} -> ${this._keywordIndex.size})`
    );
  }

  // ---------------------------------------------------------------------------
  // Private — Proper nouns extraction
  // ---------------------------------------------------------------------------

  /**
   * Extracts proper nouns (character names, locations) from a cached journal.
   * Used internally by extractNPCProfiles.
   *
   * @param {ParsedJournal} cached - The cached journal content
   * @returns {string[]} Array of unique proper nouns sorted by frequency (most common first)
   * @private
   */
  _extractProperNouns(cached) {
    // Common words to exclude (Italian and English)
    const commonWords = new Set([
      // Italian articles, prepositions, conjunctions
      'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
      'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
      'e', 'o', 'ma', 'però', 'quindi', 'allora', 'quando', 'se',
      'che', 'chi', 'cui', 'quale', 'quanto',
      // Italian common words
      'non', 'si', 'anche', 'come', 'dove', 'dopo', 'prima',
      'molto', 'tutto', 'ogni', 'altro', 'stesso', 'sempre',
      // English articles, prepositions, conjunctions
      'the', 'a', 'an', 'of', 'to', 'in', 'for', 'on', 'with',
      'at', 'by', 'from', 'up', 'about', 'into', 'through',
      'and', 'or', 'but', 'if', 'then', 'when', 'where',
      'that', 'this', 'these', 'those', 'which', 'who', 'what',
      // English common words
      'not', 'all', 'can', 'will', 'just', 'should', 'now',
      'there', 'their', 'they', 'have', 'has', 'had', 'been'
    ]);

    const properNouns = new Map(); // Use Map to track frequency

    for (const page of cached.pages) {
      const text = page.text;

      // Split into sentences to identify sentence-starting words
      const sentences = text.split(/[.!?]+/);

      for (const sentence of sentences) {
        const words = sentence.trim().split(/\s+/);

        // Skip first word of each sentence (likely capitalized but not proper noun)
        for (let idx = 1; idx < words.length; idx++) {
          const word = words[idx];

          // Check if word starts with capital letter (including accented)
          if (/^[A-Z\u00C0-\u00D6\u00D8-\u00DE]/.test(word)) {
            // Clean word (remove punctuation)
            const cleanWord = word.replace(/[^a-zA-Z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF'-]/g, '');

            // Filter out short words and common words
            if (cleanWord.length >= 3 && !commonWords.has(cleanWord.toLowerCase())) {
              const count = properNouns.get(cleanWord) || 0;
              properNouns.set(cleanWord, count + 1);
            }
          }
        }
      }
    }

    // Convert to array and sort by frequency (most common first)
    return Array.from(properNouns.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
  }

  // ---------------------------------------------------------------------------
  // Private — Chapter structure helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts heading elements from HTML content
   *
   * @param {string} html - The HTML content to parse
   * @param {string} pageId - The page ID
   * @param {string} pageName - The page name
   * @returns {Array<{level: number, title: string, position: number, content: string, pageId: string, pageName: string, type?: string}>} Array of heading objects
   * @private
   */
  _extractHeadingsFromHtml(html, pageId, pageName) {
    if (!html || typeof html !== 'string') {
      return [];
    }

    const headings = [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Find all heading elements (h1-h6)
    const headingElements = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6');

    for (let i = 0; i < headingElements.length; i++) {
      const heading = headingElements[i];
      const tagName = heading.tagName.toLowerCase();
      const level = parseInt(tagName.charAt(1), 10);
      const title = (heading.textContent || heading.innerText || '').trim();

      // Skip empty headings
      if (!title) {
        continue;
      }

      // Calculate position in original HTML
      const position = html.indexOf(heading.outerHTML);

      // Extract content between this heading and the next
      const content = this._extractContentUntilNextHeading(heading, headingElements[i + 1]);

      headings.push({
        level,
        title,
        position: position >= 0 ? position : 0,
        content,
        pageId,
        pageName
      });
    }

    // Also detect section markers (hr, dividers, etc.)
    const sectionMarkers = this._extractSectionMarkers(doc.body, pageId, pageName);

    // Merge section markers with headings, maintaining position order
    const allSections = [...headings, ...sectionMarkers];
    allSections.sort((a, b) => a.position - b.position);

    return allSections;
  }

  /**
   * Extracts content between a heading and the next heading element
   *
   * @param {HTMLElement} currentHeading - The current heading element
   * @param {HTMLElement|undefined} nextHeading - The next heading element (if any)
   * @returns {string} The text content between headings
   * @private
   */
  _extractContentUntilNextHeading(currentHeading, nextHeading) {
    const contentParts = [];
    let sibling = currentHeading.nextElementSibling;

    while (sibling) {
      // Stop if we hit the next heading
      if (nextHeading && sibling === nextHeading) {
        break;
      }

      // Stop if this is a heading element
      if (/^H[1-6]$/i.test(sibling.tagName)) {
        break;
      }

      // Extract text content
      const text = (sibling.textContent || sibling.innerText || '').trim();
      if (text) {
        contentParts.push(text);
      }

      sibling = sibling.nextElementSibling;
    }

    return contentParts.join(' ');
  }

  /**
   * Extracts section markers (hr, dividers, special formatting) from HTML
   *
   * @param {HTMLElement} container - The container element to search
   * @param {string} pageId - The page ID
   * @param {string} pageName - The page name
   * @returns {Array<{level: number, title: string, position: number, content: string, pageId: string, pageName: string, type: string}>} Array of section markers
   * @private
   */
  _extractSectionMarkers(container, pageId, pageName) {
    const markers = [];

    // Find horizontal rules (commonly used as section dividers)
    const hrElements = container.querySelectorAll('hr');
    for (const hr of hrElements) {
      let nextContent = '';
      let sibling = hr.nextElementSibling;
      while (sibling && !nextContent) {
        nextContent = (sibling.textContent || sibling.innerText || '').trim();
        sibling = sibling.nextElementSibling;
      }

      // Only include if there's content after the divider
      if (nextContent) {
        const parentHtml = container.innerHTML;
        const position = parentHtml.indexOf(hr.outerHTML);

        markers.push({
          level: 7, // Level 7 for section markers (below h6)
          title: game.i18n?.localize('VOXCHRONICLE.Journal.SectionBreak') || '---',
          position: position >= 0 ? position : 0,
          content: nextContent.substring(0, 200),
          pageId,
          pageName,
          type: 'section'
        });
      }
    }

    // Find elements with common section-marking classes
    const sectionClasses = ['section', 'chapter', 'scene', 'act', 'encounter', 'location'];
    for (const className of sectionClasses) {
      const elements = container.querySelectorAll(`.${className}, [data-${className}]`);
      for (const element of elements) {
        // Skip if this is already a heading
        if (/^H[1-6]$/i.test(element.tagName)) {
          continue;
        }

        const title = (element.textContent || element.innerText || '').trim();
        if (title && title.length < 100) {
          const parentHtml = container.innerHTML;
          const position = parentHtml.indexOf(element.outerHTML);

          markers.push({
            level: 7,
            title: title.substring(0, 50),
            position: position >= 0 ? position : 0,
            content: title,
            pageId,
            pageName,
            type: 'section'
          });
        }
      }
    }

    return markers;
  }

  /**
   * Builds a hierarchical structure from a flat list of headings
   *
   * @param {Array<{level: number, title: string, position: number, content: string, pageId: string, pageName: string}>} headings - Flat list of headings
   * @param {number} startId - Starting ID counter for node IDs
   * @returns {ChapterNode[]} Hierarchical chapter nodes
   * @private
   */
  _buildHeadingHierarchy(headings, startId) {
    if (!headings || headings.length === 0) {
      return [];
    }

    const root = [];
    const stack = [{ node: { children: root }, level: 0 }];
    let nodeId = startId;

    for (const heading of headings) {
      /** @type {ChapterNode} */
      const node = {
        id: `node-${++nodeId}`,
        title: heading.title,
        level: heading.level,
        type: heading.type || 'heading',
        pageId: heading.pageId,
        pageName: heading.pageName,
        position: heading.position,
        content: heading.content || '',
        children: []
      };

      // Pop stack until we find a parent with lower level
      while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
        stack.pop();
      }

      // Add node as child of current parent
      const parent = stack[stack.length - 1];
      parent.node.children.push(node);

      // Push this node as potential parent for subsequent headings
      stack.push({ node, level: heading.level });
    }

    return root;
  }

  // ---------------------------------------------------------------------------
  // Private — Scene name matching helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts searchable terms from a scene name.
   * Handles common patterns like "Chapter X:", "Scene -", "Act N:", numbered prefixes.
   *
   * @param {string} sceneName - The scene name to parse
   * @returns {string[]} Array of normalized search terms
   * @private
   */
  _extractSearchTermsFromSceneName(sceneName) {
    const terms = [];

    let normalized = sceneName.trim();

    // Common separators in scene names
    const separators = [':', '-', '\u2013', '\u2014', '|', '/'];

    // Common prefixes to handle (Italian and English)
    const prefixPatterns = [
      /^(chapter|capitolo|cap\.?)\s*(\d+|[ivxlcdm]+)/i,
      /^(scene|scena)\s*(\d+|[ivxlcdm]+)?/i,
      /^(act|atto)\s*(\d+|[ivxlcdm]+)/i,
      /^(part|parte)\s*(\d+|[ivxlcdm]+)/i,
      /^(episode|episodio)\s*(\d+|[ivxlcdm]+)/i,
      /^(section|sezione)\s*(\d+|[ivxlcdm]+)?/i,
      /^(\d+)\s*[-.:)]/,
      /^([ivxlcdm]+)\s*[-.:)]/i
    ];

    // Check for prefix patterns and extract both prefix and remainder
    for (const pattern of prefixPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        const prefixTerm = match[0].replace(/[-.:)\s]+$/, '').trim();
        if (prefixTerm.length >= 2) {
          terms.push(prefixTerm.toLowerCase());
        }
        break;
      }
    }

    // Split by separators and extract meaningful parts
    let parts = [normalized];
    for (const sep of separators) {
      const newParts = [];
      for (const part of parts) {
        newParts.push(...part.split(sep).map(p => p.trim()).filter(p => p.length > 0));
      }
      parts = newParts;
    }

    // Process each part
    for (const part of parts) {
      const isJustPrefix = prefixPatterns.some(pattern => {
        const match = part.match(pattern);
        return match && match[0].length === part.length;
      });

      if (!isJustPrefix && part.length >= 2) {
        const cleanPart = part.replace(/^[^\w\s]+|[^\w\s]+$/g, '').trim().toLowerCase();
        if (cleanPart.length >= 2 && !terms.includes(cleanPart)) {
          terms.push(cleanPart);
        }
      }
    }

    // Also add the full scene name (normalized) for exact matching
    const fullNormalized = normalized.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (fullNormalized.length >= 2 && !terms.includes(fullNormalized)) {
      terms.push(fullNormalized);
    }

    return terms;
  }

  /**
   * Calculates a match score between a chapter title and search terms
   *
   * @param {string} chapterTitle - The chapter title to match against
   * @param {string[]} searchTerms - The search terms to look for
   * @param {string} originalSceneName - The original scene name for exact matching
   * @returns {number} Match score between 0 and 1
   * @private
   */
  _calculateChapterMatchScore(chapterTitle, searchTerms, originalSceneName) {
    if (!chapterTitle || !searchTerms || searchTerms.length === 0) {
      return 0;
    }

    const normalizedTitle = chapterTitle.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const titleWords = normalizedTitle.split(/\s+/).filter(w => w.length >= 2);

    let totalScore = 0;
    let matchedTerms = 0;

    // Check for exact match (highest priority)
    const normalizedSceneName = originalSceneName.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalizedTitle === normalizedSceneName) {
      return 1.0;
    }

    // Check each search term
    for (const term of searchTerms) {
      const termWords = term.split(/\s+/).filter(w => w.length >= 2);

      // Check for exact term match in title
      if (normalizedTitle.includes(term)) {
        const matchWeight = Math.min(1.0, term.length / normalizedTitle.length * 2);
        totalScore += 0.8 * matchWeight;
        matchedTerms++;
        continue;
      }

      // Check for word-by-word matching
      let wordMatches = 0;
      for (const termWord of termWords) {
        if (titleWords.includes(termWord)) {
          wordMatches++;
        } else {
          for (const titleWord of titleWords) {
            if (titleWord.startsWith(termWord) || termWord.startsWith(titleWord)) {
              wordMatches += 0.5;
              break;
            }
          }
        }
      }

      if (termWords.length > 0 && wordMatches > 0) {
        const wordMatchScore = wordMatches / termWords.length;
        totalScore += 0.5 * wordMatchScore;
        if (wordMatchScore > 0.5) {
          matchedTerms++;
        }
      }
    }

    // Calculate final score
    const termCoverage = matchedTerms / searchTerms.length;
    const finalScore = (totalScore / searchTerms.length) * 0.7 + termCoverage * 0.3;

    return Math.min(1.0, finalScore);
  }

  /**
   * Finds a ChapterNode by its ID in the hierarchical structure
   *
   * @param {ChapterNode[]} chapters - Array of chapter nodes to search
   * @param {string} nodeId - The node ID to find
   * @returns {ChapterNode|null} The found node or null
   * @private
   */
  _findChapterNodeById(chapters, nodeId) {
    for (const chapter of chapters) {
      if (chapter.id === nodeId) {
        return chapter;
      }

      if (chapter.children && chapter.children.length > 0) {
        const found = this._findChapterNodeById(chapter.children, nodeId);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Private — Text chunking helpers
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
