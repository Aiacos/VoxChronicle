/**
 * RAGVectorStore - Vector Storage for RAG System
 *
 * Provides vector storage functionality for the RAG (Retrieval-Augmented Generation)
 * system. Wraps vector storage with a custom embedder adapter that uses
 * EmbeddingService with text-embedding-3-small model.
 *
 * Features:
 * - Custom embedder adapter using EmbeddingService (text-embedding-3-small)
 * - IndexedDB persistence for browser storage
 * - LRU eviction when storage exceeds configured limit
 * - Storage statistics tracking for UI display
 * - Cosine similarity search for semantic retrieval
 *
 * @class RAGVectorStore
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { MODULE_ID } from '../constants.mjs';

/**
 * Default storage limit in MB
 * @constant {number}
 */
const DEFAULT_STORAGE_LIMIT_MB = 100;

/**
 * Default maximum number of vectors to store
 * @constant {number}
 */
const DEFAULT_MAX_VECTORS = 10000;

/**
 * IndexedDB database name for vector storage
 * @constant {string}
 */
const INDEXEDDB_NAME = 'vox-chronicle-vectors';

/**
 * IndexedDB object store name
 * @constant {string}
 */
const INDEXEDDB_STORE = 'vectors';

/**
 * IndexedDB database version
 * @constant {number}
 */
const INDEXEDDB_VERSION = 1;

/**
 * Represents a stored vector entry
 * @typedef {Object} VectorEntry
 * @property {string} id - Unique identifier for the vector
 * @property {string} text - Original text that was embedded
 * @property {number[]} embedding - The embedding vector
 * @property {Object} metadata - Additional metadata (source, position, etc.)
 * @property {Date} createdAt - Timestamp when the entry was created
 * @property {Date} lastAccessedAt - Timestamp of last access (for LRU)
 */

/**
 * Represents a search result
 * @typedef {Object} SearchResult
 * @property {string} id - Vector entry ID
 * @property {string} text - Original text
 * @property {number} score - Similarity score (0-1)
 * @property {Object} metadata - Entry metadata
 */

/**
 * CustomOpenAIEmbedder - Adapter for EmbeddingService
 *
 * This adapter wraps the EmbeddingService to provide the `embed(text)` interface
 * required by vector storage systems. It uses text-embedding-3-small model
 * instead of the older text-embedding-ada-002.
 *
 * @class CustomOpenAIEmbedder
 */
class CustomOpenAIEmbedder {
  /**
   * Logger instance
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('CustomOpenAIEmbedder');

  /**
   * Creates a new CustomOpenAIEmbedder instance
   *
   * @param {import('./EmbeddingService.mjs').EmbeddingService} embeddingService - EmbeddingService instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.model='text-embedding-3-small'] - Embedding model to use
   * @param {number} [options.dimensions=512] - Embedding dimensions
   */
  constructor(embeddingService, options = {}) {
    /**
     * EmbeddingService instance
     * @type {import('./EmbeddingService.mjs').EmbeddingService}
     * @private
     */
    this._embeddingService = embeddingService;

    /**
     * Embedding model
     * @type {string}
     * @private
     */
    this._model = options.model || 'text-embedding-3-small';

    /**
     * Embedding dimensions
     * @type {number}
     * @private
     */
    this._dimensions = options.dimensions || 512;

    this._logger.debug('CustomOpenAIEmbedder created', {
      model: this._model,
      dimensions: this._dimensions
    });
  }

  /**
   * Check if the embedder is properly configured
   *
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return Boolean(this._embeddingService && this._embeddingService.isConfigured());
  }

  /**
   * Generate embedding for text (required interface for vector storage)
   *
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector
   * @throws {Error} If text is empty or embedding fails
   */
  async embed(text) {
    // CRITICAL: Validate non-empty input (OpenAI API requirement)
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('CustomOpenAIEmbedder: Cannot embed empty string');
    }

    if (!this.isConfigured()) {
      throw new Error('CustomOpenAIEmbedder: EmbeddingService not configured');
    }

    try {
      const embedding = await this._embeddingService.embed(text.trim(), {
        model: this._model,
        dimensions: this._dimensions
      });

      return embedding;
    } catch (error) {
      this._logger.error('Failed to generate embedding:', error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts
   *
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embedBatch(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('CustomOpenAIEmbedder: Input must be a non-empty array');
    }

    if (!this.isConfigured()) {
      throw new Error('CustomOpenAIEmbedder: EmbeddingService not configured');
    }

    try {
      const results = await this._embeddingService.embedBatch(texts, {
        model: this._model,
        dimensions: this._dimensions
      });

      return results.map(r => r.embedding);
    } catch (error) {
      this._logger.error('Failed to generate batch embeddings:', error.message);
      throw error;
    }
  }

  /**
   * Gets the embedding dimensions
   *
   * @returns {number} Embedding dimensions
   */
  getDimensions() {
    return this._dimensions;
  }

  /**
   * Gets the model name
   *
   * @returns {string} Model name
   */
  getModel() {
    return this._model;
  }
}

/**
 * RAGVectorStore - Vector storage for RAG system
 *
 * Provides persistent vector storage using IndexedDB with semantic search
 * capabilities. Uses CustomOpenAIEmbedder for embedding generation.
 *
 * @example
 * const store = new RAGVectorStore({
 *   embeddingService: embeddingService,
 *   maxSizeInMB: 100
 * });
 * await store.initialize();
 * await store.add('Hello world', { source: 'journal', journalId: '123' });
 * const results = await store.search('greeting', { topK: 5 });
 */
class RAGVectorStore {
  /**
   * Logger instance
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('RAGVectorStore');

  /**
   * Creates a new RAGVectorStore instance
   *
   * @param {Object} [options={}] - Configuration options
   * @param {import('./EmbeddingService.mjs').EmbeddingService} options.embeddingService - EmbeddingService instance
   * @param {number} [options.maxSizeInMB=100] - Maximum storage size in MB
   * @param {number} [options.maxVectors=10000] - Maximum number of vectors to store
   * @param {number} [options.dimensions=512] - Embedding dimensions
   * @param {string} [options.model='text-embedding-3-small'] - Embedding model
   * @param {boolean} [options.persistToIndexedDB=true] - Whether to persist to IndexedDB
   */
  constructor(options = {}) {
    /**
     * Custom embedder adapter
     * @type {CustomOpenAIEmbedder}
     * @private
     */
    this._embedder = null;

    /**
     * EmbeddingService instance
     * @type {import('./EmbeddingService.mjs').EmbeddingService}
     * @private
     */
    this._embeddingService = options.embeddingService || null;

    /**
     * Maximum storage size in bytes
     * @type {number}
     * @private
     */
    this._maxSizeBytes = (options.maxSizeInMB || DEFAULT_STORAGE_LIMIT_MB) * 1024 * 1024;

    /**
     * Maximum number of vectors
     * @type {number}
     * @private
     */
    this._maxVectors = options.maxVectors || DEFAULT_MAX_VECTORS;

    /**
     * Embedding dimensions
     * @type {number}
     * @private
     */
    this._dimensions = options.dimensions || 512;

    /**
     * Embedding model
     * @type {string}
     * @private
     */
    this._model = options.model || 'text-embedding-3-small';

    /**
     * Whether to persist to IndexedDB
     * @type {boolean}
     * @private
     */
    this._persistToIndexedDB = options.persistToIndexedDB !== false;

    /**
     * In-memory vector storage
     * @type {Map<string, VectorEntry>}
     * @private
     */
    this._vectors = new Map();

    /**
     * IndexedDB database instance
     * @type {IDBDatabase|null}
     * @private
     */
    this._db = null;

    /**
     * Whether the store has been initialized
     * @type {boolean}
     * @private
     */
    this._initialized = false;

    /**
     * Statistics tracking
     * @type {Object}
     * @private
     */
    this._stats = {
      vectorCount: 0,
      totalSearches: 0,
      totalAdds: 0,
      totalDeletes: 0,
      estimatedSizeBytes: 0,
      lastUpdated: null
    };

    // Initialize embedder if embeddingService is provided
    if (this._embeddingService) {
      this._embedder = new CustomOpenAIEmbedder(this._embeddingService, {
        model: this._model,
        dimensions: this._dimensions
      });
    }

    this._logger.debug('RAGVectorStore instance created', {
      maxSizeInMB: options.maxSizeInMB || DEFAULT_STORAGE_LIMIT_MB,
      maxVectors: this._maxVectors,
      dimensions: this._dimensions,
      persistToIndexedDB: this._persistToIndexedDB
    });
  }

  // ---------------------------------------------------------------------------
  // Configuration methods
  // ---------------------------------------------------------------------------

  /**
   * Check if the store is properly configured
   *
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return Boolean(this._embedder && this._embedder.isConfigured());
  }

  /**
   * Check if the store is initialized
   *
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Sets the embedding service
   *
   * @param {import('./EmbeddingService.mjs').EmbeddingService} embeddingService - EmbeddingService instance
   */
  setEmbeddingService(embeddingService) {
    this._embeddingService = embeddingService;
    this._embedder = new CustomOpenAIEmbedder(embeddingService, {
      model: this._model,
      dimensions: this._dimensions
    });
    this._logger.debug('EmbeddingService updated');
  }

  /**
   * Gets the embedder instance
   *
   * @returns {CustomOpenAIEmbedder} The embedder
   */
  getEmbedder() {
    return this._embedder;
  }

  // ---------------------------------------------------------------------------
  // Initialization methods
  // ---------------------------------------------------------------------------

  /**
   * Initialize the vector store
   *
   * Opens IndexedDB connection and loads existing vectors into memory.
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) {
      this._logger.debug('Already initialized');
      return;
    }

    this._logger.info('Initializing RAGVectorStore...');

    // Initialize IndexedDB if persistence is enabled
    if (this._persistToIndexedDB && typeof indexedDB !== 'undefined') {
      try {
        await this._openDatabase();
        await this._loadFromDatabase();
        this._logger.info(`Loaded ${this._vectors.size} vectors from IndexedDB`);
      } catch (error) {
        this._logger.warn('Failed to open IndexedDB, falling back to memory-only mode:', error.message);
        this._persistToIndexedDB = false;
      }
    }

    this._updateStats();
    this._initialized = true;
    this._logger.info('RAGVectorStore initialized');
  }

  /**
   * Open IndexedDB database
   *
   * @returns {Promise<IDBDatabase>}
   * @private
   */
  _openDatabase() {
    return new Promise((resolve, reject) => {
      if (!indexedDB) {
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this._db = request.result;
        resolve(this._db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create vectors object store if it doesn't exist
        if (!db.objectStoreNames.contains(INDEXEDDB_STORE)) {
          const store = db.createObjectStore(INDEXEDDB_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
          store.createIndex('source', 'metadata.source', { unique: false });
        }
      };
    });
  }

  /**
   * Load all vectors from IndexedDB into memory
   *
   * @returns {Promise<void>}
   * @private
   */
  _loadFromDatabase() {
    return new Promise((resolve, reject) => {
      if (!this._db) {
        resolve();
        return;
      }

      const transaction = this._db.transaction([INDEXEDDB_STORE], 'readonly');
      const store = transaction.objectStore(INDEXEDDB_STORE);
      const request = store.getAll();

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        const entries = request.result;
        for (const entry of entries) {
          // Convert stored date strings back to Date objects
          entry.createdAt = new Date(entry.createdAt);
          entry.lastAccessedAt = new Date(entry.lastAccessedAt);
          this._vectors.set(entry.id, entry);
        }
        resolve();
      };
    });
  }

  /**
   * Close the database connection
   */
  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
    this._initialized = false;
    this._logger.debug('Database connection closed');
  }

  // ---------------------------------------------------------------------------
  // Vector operations
  // ---------------------------------------------------------------------------

  /**
   * Add a text to the vector store
   *
   * @param {string} text - Text to add
   * @param {Object} [metadata={}] - Additional metadata
   * @param {string} [id] - Optional custom ID (generated if not provided)
   * @returns {Promise<string>} The vector entry ID
   * @throws {Error} If text is empty or embedding fails
   */
  async add(text, metadata = {}, id = null) {
    if (!this.isConfigured()) {
      throw new Error('RAGVectorStore: Not configured (EmbeddingService required)');
    }

    // Validate text
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('RAGVectorStore: Cannot add empty text');
    }

    // Generate ID if not provided
    const entryId = id || this._generateId(text);

    // Check if already exists
    if (this._vectors.has(entryId)) {
      this._logger.debug(`Entry ${entryId} already exists, updating...`);
    }

    // Generate embedding
    const embedding = await this._embedder.embed(text.trim());

    // Create entry
    const entry = {
      id: entryId,
      text: text.trim(),
      embedding,
      metadata,
      createdAt: new Date(),
      lastAccessedAt: new Date()
    };

    // Check storage limits and evict if needed
    await this._ensureCapacity();

    // Store in memory
    this._vectors.set(entryId, entry);

    // Persist to IndexedDB
    if (this._persistToIndexedDB && this._db) {
      await this._saveToDatabase(entry);
    }

    // Update stats
    this._stats.totalAdds++;
    this._updateStats();

    this._logger.debug(`Added vector: ${entryId}`, { textLength: text.length });

    return entryId;
  }

  /**
   * Add multiple texts to the vector store
   *
   * @param {Array<{text: string, metadata?: Object, id?: string}>} items - Items to add
   * @param {Object} [options={}] - Options
   * @param {Function} [options.onProgress] - Progress callback (index, total)
   * @returns {Promise<string[]>} Array of vector entry IDs
   */
  async addBatch(items, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('RAGVectorStore: Not configured (EmbeddingService required)');
    }

    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const ids = [];
    const batchSize = 50; // Process in batches for memory efficiency

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      // Generate embeddings for batch
      const texts = batch.map(item => item.text?.trim() || '').filter(t => t.length > 0);

      if (texts.length === 0) {
        continue;
      }

      const embeddings = await this._embedder.embedBatch(texts);

      // Store entries
      let embeddingIndex = 0;
      for (const item of batch) {
        const text = item.text?.trim();
        if (!text) {
          continue;
        }

        const entryId = item.id || this._generateId(text);
        const entry = {
          id: entryId,
          text,
          embedding: embeddings[embeddingIndex++],
          metadata: item.metadata || {},
          createdAt: new Date(),
          lastAccessedAt: new Date()
        };

        this._vectors.set(entryId, entry);
        ids.push(entryId);

        // Persist to IndexedDB
        if (this._persistToIndexedDB && this._db) {
          await this._saveToDatabase(entry);
        }
      }

      // Report progress
      if (options.onProgress) {
        options.onProgress(Math.min(i + batchSize, items.length), items.length);
      }

      // Yield to event loop to prevent UI freeze
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Check storage limits
    await this._ensureCapacity();

    // Update stats
    this._stats.totalAdds += ids.length;
    this._updateStats();

    this._logger.info(`Added ${ids.length} vectors in batch`);

    return ids;
  }

  /**
   * Search for similar texts
   *
   * @param {string} query - Search query text
   * @param {Object} [options={}] - Search options
   * @param {number} [options.topK=5] - Number of results to return
   * @param {number} [options.threshold=0] - Minimum similarity threshold (0-1)
   * @param {Object} [options.filter] - Metadata filter (e.g., { source: 'journal' })
   * @returns {Promise<SearchResult[]>} Array of search results sorted by similarity
   */
  async search(query, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('RAGVectorStore: Not configured (EmbeddingService required)');
    }

    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('RAGVectorStore: Cannot search with empty query');
    }

    const topK = options.topK || 5;
    const threshold = options.threshold || 0;
    const filter = options.filter || null;

    // Generate query embedding
    const queryEmbedding = await this._embedder.embed(query.trim());

    // Calculate similarities for all vectors
    const results = [];

    for (const [id, entry] of this._vectors) {
      // Apply metadata filter if provided
      if (filter && !this._matchesFilter(entry.metadata, filter)) {
        continue;
      }

      // Calculate cosine similarity
      const similarity = this._cosineSimilarity(queryEmbedding, entry.embedding);

      // Apply threshold
      if (similarity >= threshold) {
        results.push({
          id,
          text: entry.text,
          score: similarity,
          metadata: entry.metadata
        });

        // Update last accessed time
        entry.lastAccessedAt = new Date();
      }
    }

    // Sort by similarity (descending) and take top K
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);

    // Update stats
    this._stats.totalSearches++;

    this._logger.debug(`Search completed: ${topResults.length} results`, {
      query: query.substring(0, 50),
      totalCandidates: this._vectors.size
    });

    return topResults;
  }

  /**
   * Delete a vector entry by ID
   *
   * @param {string} id - Vector entry ID
   * @returns {Promise<boolean>} True if entry was deleted
   */
  async delete(id) {
    const existed = this._vectors.has(id);

    if (existed) {
      this._vectors.delete(id);

      // Delete from IndexedDB
      if (this._persistToIndexedDB && this._db) {
        await this._deleteFromDatabase(id);
      }

      this._stats.totalDeletes++;
      this._updateStats();

      this._logger.debug(`Deleted vector: ${id}`);
    }

    return existed;
  }

  /**
   * Delete multiple vector entries by IDs
   *
   * @param {string[]} ids - Vector entry IDs to delete
   * @returns {Promise<number>} Number of entries deleted
   */
  async deleteBatch(ids) {
    let deleted = 0;

    for (const id of ids) {
      if (this._vectors.has(id)) {
        this._vectors.delete(id);
        deleted++;

        // Delete from IndexedDB
        if (this._persistToIndexedDB && this._db) {
          await this._deleteFromDatabase(id);
        }
      }
    }

    this._stats.totalDeletes += deleted;
    this._updateStats();

    this._logger.debug(`Deleted ${deleted} vectors in batch`);

    return deleted;
  }

  /**
   * Delete vectors matching a metadata filter
   *
   * @param {Object} filter - Metadata filter (e.g., { source: 'journal', journalId: '123' })
   * @returns {Promise<number>} Number of entries deleted
   */
  async deleteByFilter(filter) {
    if (!filter || Object.keys(filter).length === 0) {
      throw new Error('RAGVectorStore: Filter cannot be empty');
    }

    const idsToDelete = [];

    for (const [id, entry] of this._vectors) {
      if (this._matchesFilter(entry.metadata, filter)) {
        idsToDelete.push(id);
      }
    }

    return this.deleteBatch(idsToDelete);
  }

  /**
   * Clear all vectors from the store
   *
   * @returns {Promise<void>}
   */
  async clear() {
    const count = this._vectors.size;
    this._vectors.clear();

    // Clear IndexedDB
    if (this._persistToIndexedDB && this._db) {
      await this._clearDatabase();
    }

    this._stats.totalDeletes += count;
    this._updateStats();

    this._logger.info(`Cleared ${count} vectors from store`);
  }

  /**
   * Check if a vector entry exists
   *
   * @param {string} id - Vector entry ID
   * @returns {boolean} True if entry exists
   */
  has(id) {
    return this._vectors.has(id);
  }

  /**
   * Get a vector entry by ID
   *
   * @param {string} id - Vector entry ID
   * @returns {VectorEntry|null} The entry or null if not found
   */
  get(id) {
    const entry = this._vectors.get(id);
    if (entry) {
      // Update last accessed time
      entry.lastAccessedAt = new Date();
      return { ...entry };
    }
    return null;
  }

  /**
   * Get all vector IDs
   *
   * @returns {string[]} Array of all vector IDs
   */
  getAllIds() {
    return Array.from(this._vectors.keys());
  }

  /**
   * Get the current number of vectors
   *
   * @returns {number} Number of vectors
   */
  size() {
    return this._vectors.size;
  }

  // ---------------------------------------------------------------------------
  // Statistics methods
  // ---------------------------------------------------------------------------

  /**
   * Get storage statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    this._updateStats();
    return { ...this._stats };
  }

  /**
   * Update statistics
   *
   * @private
   */
  _updateStats() {
    this._stats.vectorCount = this._vectors.size;
    this._stats.estimatedSizeBytes = this._estimateStorageSize();
    this._stats.lastUpdated = new Date();
  }

  /**
   * Estimate the current storage size in bytes
   *
   * @returns {number} Estimated size in bytes
   * @private
   */
  _estimateStorageSize() {
    let totalSize = 0;

    for (const entry of this._vectors.values()) {
      // Estimate: text + embedding array + metadata JSON + overhead
      totalSize += entry.text.length * 2; // UTF-16 chars
      totalSize += entry.embedding.length * 8; // Float64 array
      totalSize += JSON.stringify(entry.metadata).length * 2;
      totalSize += 200; // Overhead for dates, id, etc.
    }

    return totalSize;
  }

  // ---------------------------------------------------------------------------
  // Helper methods
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique ID for a text
   *
   * @param {string} text - Text to generate ID for
   * @returns {string} Unique ID
   * @private
   */
  _generateId(text) {
    // Simple hash-based ID
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Add timestamp for uniqueness
    const timestamp = Date.now().toString(36);
    const hashStr = Math.abs(hash).toString(36);

    return `vec_${hashStr}_${timestamp}`;
  }

  /**
   * Calculate cosine similarity between two vectors
   *
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Cosine similarity (0-1 for normalized vectors)
   * @private
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Check if metadata matches a filter
   *
   * @param {Object} metadata - Entry metadata
   * @param {Object} filter - Filter to match
   * @returns {boolean} True if metadata matches filter
   * @private
   */
  _matchesFilter(metadata, filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Ensure storage capacity by evicting old entries if needed
   *
   * Uses LRU (Least Recently Used) eviction strategy.
   *
   * @returns {Promise<number>} Number of entries evicted
   * @private
   */
  async _ensureCapacity() {
    let evicted = 0;

    // Check vector count limit
    while (this._vectors.size >= this._maxVectors) {
      const oldestId = this._findOldestEntry();
      if (oldestId) {
        await this.delete(oldestId);
        evicted++;
      } else {
        break;
      }
    }

    // Check storage size limit
    while (this._estimateStorageSize() > this._maxSizeBytes && this._vectors.size > 0) {
      const oldestId = this._findOldestEntry();
      if (oldestId) {
        await this.delete(oldestId);
        evicted++;
      } else {
        break;
      }
    }

    if (evicted > 0) {
      this._logger.info(`LRU eviction: removed ${evicted} entries`);
    }

    return evicted;
  }

  /**
   * Find the least recently used entry
   *
   * @returns {string|null} ID of the oldest entry, or null if empty
   * @private
   */
  _findOldestEntry() {
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this._vectors) {
      const accessTime = entry.lastAccessedAt.getTime();
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestId = id;
      }
    }

    return oldestId;
  }

  // ---------------------------------------------------------------------------
  // IndexedDB persistence methods
  // ---------------------------------------------------------------------------

  /**
   * Save an entry to IndexedDB
   *
   * @param {VectorEntry} entry - Entry to save
   * @returns {Promise<void>}
   * @private
   */
  _saveToDatabase(entry) {
    return new Promise((resolve, reject) => {
      if (!this._db) {
        resolve();
        return;
      }

      const transaction = this._db.transaction([INDEXEDDB_STORE], 'readwrite');
      const store = transaction.objectStore(INDEXEDDB_STORE);

      // Convert dates to ISO strings for storage
      const storable = {
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        lastAccessedAt: entry.lastAccessedAt.toISOString()
      };

      const request = store.put(storable);

      request.onerror = () => {
        this._logger.warn('Failed to save to IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Delete an entry from IndexedDB
   *
   * @param {string} id - Entry ID to delete
   * @returns {Promise<void>}
   * @private
   */
  _deleteFromDatabase(id) {
    return new Promise((resolve, reject) => {
      if (!this._db) {
        resolve();
        return;
      }

      const transaction = this._db.transaction([INDEXEDDB_STORE], 'readwrite');
      const store = transaction.objectStore(INDEXEDDB_STORE);
      const request = store.delete(id);

      request.onerror = () => {
        this._logger.warn('Failed to delete from IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Clear all entries from IndexedDB
   *
   * @returns {Promise<void>}
   * @private
   */
  _clearDatabase() {
    return new Promise((resolve, reject) => {
      if (!this._db) {
        resolve();
        return;
      }

      const transaction = this._db.transaction([INDEXEDDB_STORE], 'readwrite');
      const store = transaction.objectStore(INDEXEDDB_STORE);
      const request = store.clear();

      request.onerror = () => {
        this._logger.warn('Failed to clear IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }
}

// Export classes and constants
export {
  RAGVectorStore,
  CustomOpenAIEmbedder,
  DEFAULT_STORAGE_LIMIT_MB,
  DEFAULT_MAX_VECTORS,
  INDEXEDDB_NAME,
  INDEXEDDB_STORE
};
