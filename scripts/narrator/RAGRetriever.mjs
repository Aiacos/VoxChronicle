/**
 * RAGRetriever - Hybrid Semantic and Keyword Retrieval for VoxChronicle
 *
 * Combines semantic vector search with keyword search for robust RAG retrieval.
 * Uses EmbeddingService for query embedding, RAGVectorStore for semantic search,
 * and JournalParser/CompendiumParser for keyword-based fallback and supplementary results.
 *
 * Features:
 * - Hybrid retrieval combining semantic (70%) + keyword (20%) + recency (10%) scoring
 * - Automatic index building from journals and compendiums
 * - Incremental index updates for changed content
 * - Fallback to keyword-only search when vector search unavailable
 * - Source citations for AI grounding
 * - Progress callbacks for UI updates during indexing
 *
 * @class RAGRetriever
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { MODULE_ID } from '../constants.mjs';

/**
 * Default similarity threshold for vector search
 * @constant {number}
 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

/**
 * Default maximum results to return
 * @constant {number}
 */
const DEFAULT_MAX_RESULTS = 5;

/**
 * Weight for semantic search score
 * @constant {number}
 */
const SEMANTIC_WEIGHT = 0.7;

/**
 * Weight for keyword search score
 * @constant {number}
 */
const KEYWORD_WEIGHT = 0.2;

/**
 * Weight for recency score
 * @constant {number}
 */
const RECENCY_WEIGHT = 0.1;

/**
 * Maximum age in days for recency scoring (older gets 0 recency score)
 * @constant {number}
 */
const MAX_AGE_DAYS = 30;

/**
 * Represents a retrieval result
 * @typedef {Object} RetrievalResult
 * @property {string} id - Unique identifier for the result
 * @property {string} text - The retrieved text content
 * @property {number} score - Combined relevance score (0-1)
 * @property {number} semanticScore - Semantic similarity score
 * @property {number} keywordScore - Keyword match score
 * @property {number} recencyScore - Recency score
 * @property {Object} metadata - Source metadata for citations
 * @property {string} metadata.source - Source type ('journal' or 'compendium')
 * @property {string} [metadata.journalId] - Journal ID for journal sources
 * @property {string} [metadata.journalName] - Journal name for journal sources
 * @property {string} [metadata.pageId] - Page ID for journal sources
 * @property {string} [metadata.pageName] - Page name for journal sources
 * @property {string} [metadata.packId] - Pack ID for compendium sources
 * @property {string} [metadata.packName] - Pack name for compendium sources
 * @property {string} [metadata.entryId] - Entry ID for compendium sources
 * @property {string} [metadata.entryName] - Entry name for compendium sources
 * @property {string} citation - Formatted citation string
 */

/**
 * Represents index status
 * @typedef {Object} IndexStatus
 * @property {boolean} isIndexed - Whether the index is built
 * @property {number} vectorCount - Number of vectors in the index
 * @property {number} journalCount - Number of indexed journals
 * @property {number} compendiumCount - Number of indexed compendiums
 * @property {Date|null} lastIndexed - Timestamp of last indexing
 * @property {boolean} isIndexing - Whether indexing is in progress
 * @property {number} progress - Current indexing progress (0-100)
 */

/**
 * Options for retrieval
 * @typedef {Object} RetrievalOptions
 * @property {number} [maxResults=5] - Maximum number of results to return
 * @property {number} [similarityThreshold=0.5] - Minimum similarity threshold
 * @property {boolean} [includeKeywordFallback=true] - Include keyword results as fallback
 * @property {Object} [filter] - Metadata filter for results
 * @property {string} [filter.source] - Filter by source type ('journal' or 'compendium')
 * @property {string} [filter.journalId] - Filter by journal ID
 * @property {string} [filter.packId] - Filter by compendium pack ID
 */

/**
 * Options for index building
 * @typedef {Object} IndexOptions
 * @property {number} [chunkSize=500] - Chunk size for text splitting
 * @property {number} [overlap=100] - Overlap between chunks
 * @property {Function} [onProgress] - Progress callback (current, total, message)
 */

/**
 * RAGRetriever - Hybrid retrieval system for RAG
 *
 * @example
 * const retriever = new RAGRetriever({
 *   embeddingService,
 *   vectorStore,
 *   journalParser,
 *   compendiumParser
 * });
 * await retriever.buildIndex(['journal-1'], ['compendium.rules']);
 * const results = await retriever.retrieve('What happens in the tavern?');
 */
class RAGRetriever {
  /**
   * Logger instance
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('RAGRetriever');

  /**
   * Creates a new RAGRetriever instance
   *
   * @param {Object} [options={}] - Configuration options
   * @param {import('../ai/EmbeddingService.mjs').EmbeddingService} [options.embeddingService] - EmbeddingService instance
   * @param {import('../ai/RAGVectorStore.mjs').RAGVectorStore} [options.vectorStore] - RAGVectorStore instance
   * @param {import('./JournalParser.mjs').JournalParser} [options.journalParser] - JournalParser instance
   * @param {import('./CompendiumParser.mjs').CompendiumParser} [options.compendiumParser] - CompendiumParser instance
   * @param {number} [options.similarityThreshold=0.5] - Default similarity threshold
   * @param {number} [options.maxResults=5] - Default max results
   */
  constructor(options = {}) {
    /**
     * EmbeddingService instance
     * @type {import('../ai/EmbeddingService.mjs').EmbeddingService}
     * @private
     */
    this._embeddingService = options.embeddingService || null;

    /**
     * RAGVectorStore instance
     * @type {import('../ai/RAGVectorStore.mjs').RAGVectorStore}
     * @private
     */
    this._vectorStore = options.vectorStore || null;

    /**
     * JournalParser instance
     * @type {import('./JournalParser.mjs').JournalParser}
     * @private
     */
    this._journalParser = options.journalParser || null;

    /**
     * CompendiumParser instance
     * @type {import('./CompendiumParser.mjs').CompendiumParser}
     * @private
     */
    this._compendiumParser = options.compendiumParser || null;

    /**
     * Default similarity threshold
     * @type {number}
     * @private
     */
    this._similarityThreshold = options.similarityThreshold || DEFAULT_SIMILARITY_THRESHOLD;

    /**
     * Default max results
     * @type {number}
     * @private
     */
    this._maxResults = options.maxResults || DEFAULT_MAX_RESULTS;

    /**
     * Indexed journal IDs
     * @type {Set<string>}
     * @private
     */
    this._indexedJournals = new Set();

    /**
     * Indexed compendium pack IDs
     * @type {Set<string>}
     * @private
     */
    this._indexedCompendiums = new Set();

    /**
     * Last indexed timestamp
     * @type {Date|null}
     * @private
     */
    this._lastIndexed = null;

    /**
     * Whether indexing is in progress
     * @type {boolean}
     * @private
     */
    this._isIndexing = false;

    /**
     * Current indexing progress (0-100)
     * @type {number}
     * @private
     */
    this._indexingProgress = 0;

    this._logger.debug('RAGRetriever instance created');
  }

  // ---------------------------------------------------------------------------
  // Configuration methods
  // ---------------------------------------------------------------------------

  /**
   * Check if the retriever is properly configured for semantic search
   *
   * @returns {boolean} True if all required services are configured
   */
  isConfigured() {
    return Boolean(
      this._embeddingService &&
      this._embeddingService.isConfigured() &&
      this._vectorStore &&
      this._vectorStore.isConfigured()
    );
  }

  /**
   * Check if the retriever can perform keyword-only fallback
   *
   * @returns {boolean} True if keyword search is available
   */
  hasKeywordFallback() {
    return Boolean(this._journalParser || this._compendiumParser);
  }

  /**
   * Check if the index is ready for retrieval
   *
   * @returns {boolean} True if index contains vectors
   */
  hasIndex() {
    if (!this._vectorStore) {
      return false;
    }
    return this._vectorStore.size() > 0;
  }

  /**
   * Sets the embedding service
   *
   * @param {import('../ai/EmbeddingService.mjs').EmbeddingService} embeddingService - EmbeddingService instance
   */
  setEmbeddingService(embeddingService) {
    this._embeddingService = embeddingService;
    this._logger.debug('EmbeddingService updated');
  }

  /**
   * Sets the vector store
   *
   * @param {import('../ai/RAGVectorStore.mjs').RAGVectorStore} vectorStore - RAGVectorStore instance
   */
  setVectorStore(vectorStore) {
    this._vectorStore = vectorStore;
    this._logger.debug('VectorStore updated');
  }

  /**
   * Sets the journal parser
   *
   * @param {import('./JournalParser.mjs').JournalParser} journalParser - JournalParser instance
   */
  setJournalParser(journalParser) {
    this._journalParser = journalParser;
    this._logger.debug('JournalParser updated');
  }

  /**
   * Sets the compendium parser
   *
   * @param {import('./CompendiumParser.mjs').CompendiumParser} compendiumParser - CompendiumParser instance
   */
  setCompendiumParser(compendiumParser) {
    this._compendiumParser = compendiumParser;
    this._logger.debug('CompendiumParser updated');
  }

  /**
   * Gets the current index status
   *
   * @returns {IndexStatus} Current index status
   */
  getIndexStatus() {
    return {
      isIndexed: this.hasIndex(),
      vectorCount: this._vectorStore ? this._vectorStore.size() : 0,
      journalCount: this._indexedJournals.size,
      compendiumCount: this._indexedCompendiums.size,
      lastIndexed: this._lastIndexed,
      isIndexing: this._isIndexing,
      progress: this._indexingProgress
    };
  }

  // ---------------------------------------------------------------------------
  // Retrieval methods
  // ---------------------------------------------------------------------------

  /**
   * Retrieve relevant content using hybrid semantic + keyword search
   *
   * @param {string} query - Search query
   * @param {RetrievalOptions} [options={}] - Retrieval options
   * @returns {Promise<RetrievalResult[]>} Array of retrieval results sorted by relevance
   * @throws {Error} If query is empty
   */
  async retrieve(query, options = {}) {
    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('RAGRetriever: Query cannot be empty');
    }

    const trimmedQuery = query.trim();
    const maxResults = options.maxResults || this._maxResults;
    const similarityThreshold = options.similarityThreshold || this._similarityThreshold;
    const includeKeywordFallback = options.includeKeywordFallback !== false;
    const filter = options.filter || null;

    this._logger.debug('Retrieving content', {
      queryLength: trimmedQuery.length,
      maxResults,
      similarityThreshold
    });

    // Try semantic search first if configured
    let semanticResults = [];
    let vectorSearchSucceeded = false;

    if (this.isConfigured() && this.hasIndex()) {
      try {
        semanticResults = await this._performSemanticSearch(trimmedQuery, {
          topK: maxResults * 2, // Get more for merging
          threshold: similarityThreshold,
          filter
        });
        vectorSearchSucceeded = true;
        this._logger.debug(`Semantic search returned ${semanticResults.length} results`);
      } catch (error) {
        this._logger.warn('Semantic search failed, falling back to keyword search:', error.message);
      }
    }

    // Get keyword results if enabled
    let keywordResults = [];
    if (includeKeywordFallback && this.hasKeywordFallback()) {
      keywordResults = await this._performKeywordSearch(trimmedQuery, {
        maxResults: maxResults * 2,
        filter
      });
      this._logger.debug(`Keyword search returned ${keywordResults.length} results`);
    }

    // Merge and rank results
    const mergedResults = this._mergeAndRankResults(
      semanticResults,
      keywordResults,
      vectorSearchSucceeded
    );

    // Take top K results
    const topResults = mergedResults.slice(0, maxResults);

    // Add citations
    const resultsWithCitations = topResults.map(result => ({
      ...result,
      citation: this._formatCitation(result.metadata)
    }));

    this._logger.info(`Retrieved ${resultsWithCitations.length} results for query`);

    return resultsWithCitations;
  }

  /**
   * Perform semantic vector search
   *
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array<{id: string, text: string, semanticScore: number, metadata: Object}>>}
   * @private
   */
  async _performSemanticSearch(query, options = {}) {
    const searchResults = await this._vectorStore.search(query, {
      topK: options.topK || 10,
      threshold: options.threshold || 0,
      filter: options.filter
    });

    return searchResults.map(result => ({
      id: result.id,
      text: result.text,
      semanticScore: result.score,
      keywordScore: 0,
      recencyScore: this._calculateRecencyScore(result.metadata),
      metadata: result.metadata
    }));
  }

  /**
   * Perform keyword search using parsers
   *
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array<{id: string, text: string, keywordScore: number, metadata: Object}>>}
   * @private
   */
  async _performKeywordSearch(query, options = {}) {
    const results = [];
    const keywords = this._extractKeywords(query);

    if (keywords.length === 0) {
      return results;
    }

    const filter = options.filter || {};

    // Search journals if not filtered to compendium only
    if (this._journalParser && filter.source !== 'compendium') {
      for (const journalId of this._indexedJournals) {
        // Skip if filtered to specific journal
        if (filter.journalId && filter.journalId !== journalId) {
          continue;
        }

        try {
          const matchingPages = this._journalParser.searchByKeywords(journalId, keywords);

          for (const page of matchingPages) {
            const keywordScore = this._calculateKeywordScore(page.text, keywords);

            results.push({
              id: `keyword_journal_${journalId}_${page.id}`,
              text: page.text.substring(0, 500), // Limit text size
              semanticScore: 0,
              keywordScore,
              recencyScore: 0.5, // Default recency for keyword results
              metadata: {
                source: 'journal',
                journalId,
                journalName: this._getJournalName(journalId),
                pageId: page.id,
                pageName: page.name
              }
            });
          }
        } catch (error) {
          this._logger.warn(`Keyword search failed for journal ${journalId}:`, error.message);
        }
      }
    }

    // Search compendiums if not filtered to journal only
    if (this._compendiumParser && filter.source !== 'journal') {
      for (const packId of this._indexedCompendiums) {
        // Skip if filtered to specific pack
        if (filter.packId && filter.packId !== packId) {
          continue;
        }

        try {
          const matchingEntries = this._compendiumParser.searchByKeywords(packId, keywords);

          for (const entry of matchingEntries) {
            const keywordScore = this._calculateKeywordScore(entry.text, keywords);

            results.push({
              id: `keyword_compendium_${packId}_${entry.id}`,
              text: entry.text.substring(0, 500),
              semanticScore: 0,
              keywordScore,
              recencyScore: 0.5,
              metadata: {
                source: 'compendium',
                packId,
                packName: entry.packName,
                entryId: entry.id,
                entryName: entry.name,
                entryType: entry.type
              }
            });
          }
        } catch (error) {
          this._logger.warn(`Keyword search failed for compendium ${packId}:`, error.message);
        }
      }
    }

    // Sort by keyword score
    results.sort((a, b) => b.keywordScore - a.keywordScore);

    return results.slice(0, options.maxResults || 20);
  }

  /**
   * Merge semantic and keyword results with combined scoring
   *
   * @param {Array} semanticResults - Results from semantic search
   * @param {Array} keywordResults - Results from keyword search
   * @param {boolean} vectorSearchSucceeded - Whether vector search was successful
   * @returns {Array<RetrievalResult>} Merged and ranked results
   * @private
   */
  _mergeAndRankResults(semanticResults, keywordResults, vectorSearchSucceeded) {
    const resultMap = new Map();

    // Add semantic results
    for (const result of semanticResults) {
      const key = this._getResultKey(result);
      resultMap.set(key, {
        ...result,
        score: 0 // Will be calculated below
      });
    }

    // Merge keyword results
    for (const kwResult of keywordResults) {
      const key = this._getResultKey(kwResult);

      if (resultMap.has(key)) {
        // Merge scores
        const existing = resultMap.get(key);
        existing.keywordScore = Math.max(existing.keywordScore, kwResult.keywordScore);
      } else {
        resultMap.set(key, {
          ...kwResult,
          score: 0
        });
      }
    }

    // Calculate combined scores
    const results = [];
    for (const result of resultMap.values()) {
      // Adjust weights if vector search failed (rely more on keyword)
      const semanticWeight = vectorSearchSucceeded ? SEMANTIC_WEIGHT : 0;
      const keywordWeight = vectorSearchSucceeded ? KEYWORD_WEIGHT : 0.9;
      const recencyWeight = RECENCY_WEIGHT;

      result.score =
        (result.semanticScore * semanticWeight) +
        (result.keywordScore * keywordWeight) +
        (result.recencyScore * recencyWeight);

      results.push(result);
    }

    // Sort by combined score (descending)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Generate a unique key for result deduplication
   *
   * @param {Object} result - Result object
   * @returns {string} Unique key
   * @private
   */
  _getResultKey(result) {
    const meta = result.metadata;
    if (meta.source === 'journal') {
      return `journal:${meta.journalId}:${meta.pageId}:${result.text.substring(0, 100)}`;
    } else if (meta.source === 'compendium') {
      return `compendium:${meta.packId}:${meta.entryId}:${result.text.substring(0, 100)}`;
    }
    return result.id || `unknown:${result.text.substring(0, 100)}`;
  }

  /**
   * Extract keywords from query for keyword search
   *
   * @param {string} query - Search query
   * @returns {string[]} Array of keywords (3+ characters)
   * @private
   */
  _extractKeywords(query) {
    // Common stop words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'da',
      'con', 'su', 'per', 'tra', 'fra', 'e', 'o', 'ma', 'che', 'non', 'si',
      'sul', 'sulla', 'sullo', 'sui', 'sugli', 'sulle', // Italian contractions
      'nel', 'nella', 'nello', 'nei', 'negli', 'nelle', // Italian contractions
      'del', 'della', 'dello', 'dei', 'degli', 'delle'  // Italian contractions
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 3 && !stopWords.has(word));
  }

  /**
   * Calculate keyword match score
   *
   * @param {string} text - Text to search in
   * @param {string[]} keywords - Keywords to find
   * @returns {number} Score between 0 and 1
   * @private
   */
  _calculateKeywordScore(text, keywords) {
    if (!text || !keywords || keywords.length === 0) {
      return 0;
    }

    const lowerText = text.toLowerCase();
    let matches = 0;
    let totalOccurrences = 0;

    for (const keyword of keywords) {
      // Count occurrences of each keyword
      const regex = new RegExp(keyword, 'gi');
      const occurrences = (text.match(regex) || []).length;

      if (occurrences > 0) {
        matches++;
        totalOccurrences += occurrences;
      }
    }

    // Score based on keyword coverage and frequency
    const coverage = matches / keywords.length;
    const frequency = Math.min(totalOccurrences / 10, 1); // Cap at 10 occurrences

    return (coverage * 0.7) + (frequency * 0.3);
  }

  /**
   * Calculate recency score based on metadata
   *
   * @param {Object} metadata - Result metadata
   * @returns {number} Score between 0 and 1 (1 = recent)
   * @private
   */
  _calculateRecencyScore(metadata) {
    // If no timestamp info, return default
    if (!metadata || !metadata.indexedAt) {
      return 0.5;
    }

    const now = Date.now();
    const indexedAt = new Date(metadata.indexedAt).getTime();
    const ageDays = (now - indexedAt) / (1000 * 60 * 60 * 24);

    // Linear decay over MAX_AGE_DAYS
    return Math.max(0, 1 - (ageDays / MAX_AGE_DAYS));
  }

  /**
   * Format a citation string from metadata
   *
   * @param {Object} metadata - Result metadata
   * @returns {string} Formatted citation
   * @private
   */
  _formatCitation(metadata) {
    if (!metadata) {
      return '[Unknown Source]';
    }

    if (metadata.source === 'journal') {
      const journalName = metadata.journalName || 'Unknown Journal';
      const pageName = metadata.pageName || 'Unknown Page';
      return `[${journalName} > ${pageName}]`;
    } else if (metadata.source === 'compendium') {
      const packName = metadata.packName || 'Unknown Compendium';
      const entryName = metadata.entryName || 'Unknown Entry';
      return `[${packName} > ${entryName}]`;
    }

    return '[Unknown Source]';
  }

  /**
   * Get journal name from cache
   *
   * @param {string} journalId - Journal ID
   * @returns {string} Journal name or 'Unknown'
   * @private
   */
  _getJournalName(journalId) {
    // Try to get from game object
    if (typeof game !== 'undefined' && game.journal) {
      const journal = game.journal.get(journalId);
      if (journal) {
        return journal.name;
      }
    }
    return 'Unknown Journal';
  }

  // ---------------------------------------------------------------------------
  // Index building methods
  // ---------------------------------------------------------------------------

  /**
   * Build the vector index from journals and compendiums
   *
   * @param {string[]} [journalIds=[]] - Journal IDs to index
   * @param {string[]} [packIds=[]] - Compendium pack IDs to index
   * @param {IndexOptions} [options={}] - Indexing options
   * @returns {Promise<{journalChunks: number, compendiumChunks: number, totalTime: number}>}
   * @throws {Error} If not configured or indexing already in progress
   */
  async buildIndex(journalIds = [], packIds = [], options = {}) {
    if (!this.isConfigured()) {
      throw new Error('RAGRetriever: Not configured for indexing (EmbeddingService and VectorStore required)');
    }

    if (this._isIndexing) {
      throw new Error('RAGRetriever: Indexing already in progress');
    }

    this._isIndexing = true;
    this._indexingProgress = 0;
    const startTime = Date.now();
    const onProgress = options.onProgress || (() => {});

    let journalChunks = 0;
    let compendiumChunks = 0;

    try {
      onProgress(0, 100, 'Starting index build...');

      // Clear existing index
      await this._vectorStore.clear();
      this._indexedJournals.clear();
      this._indexedCompendiums.clear();

      // Calculate total items for progress
      const totalItems = journalIds.length + packIds.length;
      let processedItems = 0;

      // Index journals
      if (this._journalParser && journalIds.length > 0) {
        for (const journalId of journalIds) {
          try {
            const chunks = await this._indexJournal(journalId, options);
            journalChunks += chunks;
            this._indexedJournals.add(journalId);

            processedItems++;
            this._indexingProgress = Math.floor((processedItems / totalItems) * 100);
            onProgress(this._indexingProgress, 100, `Indexed journal ${processedItems}/${journalIds.length}`);
          } catch (error) {
            this._logger.warn(`Failed to index journal ${journalId}:`, error.message);
          }

          // Yield to event loop
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Index compendiums
      if (this._compendiumParser && packIds.length > 0) {
        for (const packId of packIds) {
          try {
            const chunks = await this._indexCompendium(packId, options);
            compendiumChunks += chunks;
            this._indexedCompendiums.add(packId);

            processedItems++;
            this._indexingProgress = Math.floor((processedItems / totalItems) * 100);
            onProgress(this._indexingProgress, 100, `Indexed compendium ${processedItems - journalIds.length}/${packIds.length}`);
          } catch (error) {
            this._logger.warn(`Failed to index compendium ${packId}:`, error.message);
          }

          // Yield to event loop
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      this._lastIndexed = new Date();
      this._indexingProgress = 100;
      onProgress(100, 100, 'Index build complete');

      const totalTime = Date.now() - startTime;

      this._logger.info(`Index built: ${journalChunks} journal chunks, ${compendiumChunks} compendium chunks in ${totalTime}ms`);

      return {
        journalChunks,
        compendiumChunks,
        totalTime
      };
    } finally {
      this._isIndexing = false;
    }
  }

  /**
   * Index a single journal
   *
   * @param {string} journalId - Journal ID to index
   * @param {IndexOptions} [options={}] - Indexing options
   * @returns {Promise<number>} Number of chunks indexed
   * @private
   */
  async _indexJournal(journalId, options = {}) {
    const chunks = await this._journalParser.getChunksForEmbedding(journalId, {
      chunkSize: options.chunkSize || 500,
      overlap: options.overlap || 100
    });

    if (chunks.length === 0) {
      this._logger.debug(`No chunks to index for journal ${journalId}`);
      return 0;
    }

    // Add indexedAt timestamp to metadata
    const chunksWithTimestamp = chunks.map(chunk => ({
      text: chunk.text,
      metadata: {
        ...chunk.metadata,
        indexedAt: new Date().toISOString()
      }
    }));

    // Add to vector store
    await this._vectorStore.addBatch(chunksWithTimestamp);

    this._logger.debug(`Indexed ${chunks.length} chunks from journal ${journalId}`);

    return chunks.length;
  }

  /**
   * Index a single compendium pack
   *
   * @param {string} packId - Compendium pack ID to index
   * @param {IndexOptions} [options={}] - Indexing options
   * @returns {Promise<number>} Number of chunks indexed
   * @private
   */
  async _indexCompendium(packId, options = {}) {
    const chunks = await this._compendiumParser.getChunksForEmbedding(packId, {
      chunkSize: options.chunkSize || 500,
      overlap: options.overlap || 100
    });

    if (chunks.length === 0) {
      this._logger.debug(`No chunks to index for compendium ${packId}`);
      return 0;
    }

    // Add indexedAt timestamp to metadata
    const chunksWithTimestamp = chunks.map(chunk => ({
      text: chunk.text,
      metadata: {
        ...chunk.metadata,
        indexedAt: new Date().toISOString()
      }
    }));

    // Add to vector store
    await this._vectorStore.addBatch(chunksWithTimestamp);

    this._logger.debug(`Indexed ${chunks.length} chunks from compendium ${packId}`);

    return chunks.length;
  }

  /**
   * Update the index for a specific journal (incremental update)
   *
   * @param {string} journalId - Journal ID to update
   * @param {IndexOptions} [options={}] - Indexing options
   * @returns {Promise<{deleted: number, added: number}>} Update statistics
   * @throws {Error} If not configured
   */
  async updateIndex(journalId, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('RAGRetriever: Not configured for indexing');
    }

    // Delete existing entries for this journal
    const deleted = await this._vectorStore.deleteByFilter({
      source: 'journal',
      journalId
    });

    // Re-index the journal
    const added = await this._indexJournal(journalId, options);

    // Update tracking
    this._indexedJournals.add(journalId);
    this._lastIndexed = new Date();

    this._logger.info(`Updated index for journal ${journalId}: deleted ${deleted}, added ${added}`);

    return { deleted, added };
  }

  /**
   * Update the index for a specific compendium (incremental update)
   *
   * @param {string} packId - Compendium pack ID to update
   * @param {IndexOptions} [options={}] - Indexing options
   * @returns {Promise<{deleted: number, added: number}>} Update statistics
   * @throws {Error} If not configured
   */
  async updateCompendiumIndex(packId, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('RAGRetriever: Not configured for indexing');
    }

    // Delete existing entries for this compendium
    const deleted = await this._vectorStore.deleteByFilter({
      source: 'compendium',
      packId
    });

    // Re-index the compendium
    const added = await this._indexCompendium(packId, options);

    // Update tracking
    this._indexedCompendiums.add(packId);
    this._lastIndexed = new Date();

    this._logger.info(`Updated index for compendium ${packId}: deleted ${deleted}, added ${added}`);

    return { deleted, added };
  }

  /**
   * Clear the entire index
   *
   * @returns {Promise<void>}
   */
  async clearIndex() {
    if (this._vectorStore) {
      await this._vectorStore.clear();
    }

    this._indexedJournals.clear();
    this._indexedCompendiums.clear();
    this._lastIndexed = null;

    this._logger.info('Index cleared');
  }

  /**
   * Get list of indexed journal IDs
   *
   * @returns {string[]} Array of indexed journal IDs
   */
  getIndexedJournals() {
    return Array.from(this._indexedJournals);
  }

  /**
   * Get list of indexed compendium pack IDs
   *
   * @returns {string[]} Array of indexed pack IDs
   */
  getIndexedCompendiums() {
    return Array.from(this._indexedCompendiums);
  }

  // ---------------------------------------------------------------------------
  // Convenience methods for AI context
  // ---------------------------------------------------------------------------

  /**
   * Retrieve and format content for AI context
   *
   * @param {string} query - Search query
   * @param {Object} [options={}] - Retrieval options
   * @param {number} [options.maxResults=5] - Maximum results
   * @param {number} [options.maxChars=5000] - Maximum total characters
   * @returns {Promise<{context: string, sources: string[]}>} Formatted context and sources
   */
  async retrieveForAI(query, options = {}) {
    const maxResults = options.maxResults || 5;
    const maxChars = options.maxChars || 5000;

    const results = await this.retrieve(query, { maxResults });

    if (results.length === 0) {
      return {
        context: '',
        sources: []
      };
    }

    // Build formatted context
    let context = '';
    const sources = [];
    let charCount = 0;

    for (const result of results) {
      const entry = `${result.citation}\n${result.text}\n\n`;

      if (charCount + entry.length > maxChars) {
        // Add truncated version if we have some space
        const remaining = maxChars - charCount - 50;
        if (remaining > 100) {
          context += `${result.citation}\n${result.text.substring(0, remaining)}...\n\n`;
          sources.push(result.citation);
        }
        break;
      }

      context += entry;
      sources.push(result.citation);
      charCount += entry.length;
    }

    return {
      context: context.trim(),
      sources
    };
  }
}

// Export the RAGRetriever class and constants
export {
  RAGRetriever,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_MAX_RESULTS,
  SEMANTIC_WEIGHT,
  KEYWORD_WEIGHT,
  RECENCY_WEIGHT
};
