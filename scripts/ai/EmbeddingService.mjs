/**
 * EmbeddingService - Vector Embedding Generation for VoxChronicle RAG
 *
 * Generates vector embeddings using OpenAI's text-embedding-3-small API
 * for semantic search and retrieval-augmented generation (RAG).
 *
 * Uses composition with OpenAIClient (not inheritance).
 *
 * @class EmbeddingService
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Default embedding model
 * @constant {string}
 */
const DEFAULT_MODEL = 'text-embedding-3-small';

/**
 * Default embedding dimensions (optimized for cost/quality)
 * @constant {number}
 */
const DEFAULT_DIMENSIONS = 512;

/**
 * Maximum tokens per embedding request (OpenAI limit)
 * @constant {number}
 */
const MAX_TOKENS_PER_REQUEST = 8192;

/**
 * Approximate characters per token (conservative estimate)
 * @constant {number}
 */
const CHARS_PER_TOKEN = 4;

/**
 * Maximum characters per embedding request (derived from token limit)
 * @constant {number}
 */
const MAX_CHARS_PER_REQUEST = MAX_TOKENS_PER_REQUEST * CHARS_PER_TOKEN;

/**
 * Default chunk size for text splitting
 * @constant {number}
 */
const DEFAULT_CHUNK_SIZE = 500;

/**
 * Default overlap between chunks
 * @constant {number}
 */
const DEFAULT_CHUNK_OVERLAP = 100;

/**
 * Maximum batch size for embedding requests
 * @constant {number}
 */
const MAX_BATCH_SIZE = 100;

/**
 * Represents an embedding result
 * @typedef {Object} EmbeddingResult
 * @property {number[]} embedding - The embedding vector
 * @property {number} index - Index in the batch
 * @property {string} text - Original text that was embedded
 */

/**
 * Represents a text chunk with metadata
 * @typedef {Object} TextChunk
 * @property {string} text - The chunk text content
 * @property {number} startPos - Start position in original text
 * @property {number} endPos - End position in original text
 * @property {number} chunkIndex - Index of this chunk
 * @property {number} totalChunks - Total number of chunks
 */

/**
 * EmbeddingService class - Generates vector embeddings using OpenAI API
 *
 * Uses composition with OpenAIClient for API calls.
 *
 * @example
 * const service = new EmbeddingService({ openaiClient });
 * const embedding = await service.embed('Hello world');
 * const chunks = service.chunkText('Long document text...');
 * const embeddings = await service.embedBatch(['text1', 'text2']);
 */
class EmbeddingService {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('EmbeddingService');

  /**
   * Creates a new EmbeddingService instance
   *
   * @param {Object} [options={}] - Configuration options
   * @param {import('./OpenAIClient.mjs').OpenAIClient} options.openaiClient - OpenAI client instance
   * @param {string} [options.model='text-embedding-3-small'] - Embedding model to use
   * @param {number} [options.dimensions=512] - Embedding dimensions (512, 1024, or 1536)
   * @param {number} [options.chunkSize=500] - Default chunk size for text splitting
   * @param {number} [options.chunkOverlap=100] - Default overlap between chunks
   */
  constructor(options = {}) {
    /**
     * OpenAI client instance (composition)
     * @type {import('./OpenAIClient.mjs').OpenAIClient}
     * @private
     */
    this._openaiClient = options.openaiClient || null;

    /**
     * Embedding model to use
     * @type {string}
     * @private
     */
    this._model = options.model || DEFAULT_MODEL;

    /**
     * Embedding dimensions
     * @type {number}
     * @private
     */
    this._dimensions = options.dimensions || DEFAULT_DIMENSIONS;

    /**
     * Default chunk size for text splitting
     * @type {number}
     * @private
     */
    this._chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;

    /**
     * Default overlap between chunks
     * @type {number}
     * @private
     */
    this._chunkOverlap = options.chunkOverlap || DEFAULT_CHUNK_OVERLAP;

    /**
     * Statistics tracking
     * @type {Object}
     * @private
     */
    this._stats = {
      totalEmbeddings: 0,
      totalTokens: 0,
      totalRequests: 0,
      errors: 0
    };

    this._logger.debug('EmbeddingService instance created', {
      model: this._model,
      dimensions: this._dimensions
    });
  }

  // ---------------------------------------------------------------------------
  // Configuration methods
  // ---------------------------------------------------------------------------

  /**
   * Check if the service is properly configured with an OpenAI client
   *
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return Boolean(this._openaiClient && this._openaiClient.isConfigured);
  }

  /**
   * Sets the OpenAI client instance
   *
   * @param {import('./OpenAIClient.mjs').OpenAIClient} client - OpenAI client instance
   */
  setOpenAIClient(client) {
    this._openaiClient = client;
    this._logger.debug('OpenAI client updated');
  }

  /**
   * Sets the embedding model
   *
   * @param {string} model - Model name ('text-embedding-3-small' or 'text-embedding-3-large')
   */
  setModel(model) {
    this._model = model;
    this._logger.debug(`Embedding model changed to: ${model}`);
  }

  /**
   * Sets the embedding dimensions
   *
   * @param {number} dimensions - Dimensions (512, 1024, or 1536)
   */
  setDimensions(dimensions) {
    this._dimensions = dimensions;
    this._logger.debug(`Embedding dimensions changed to: ${dimensions}`);
  }

  /**
   * Gets the current model name
   *
   * @returns {string} Current model name
   */
  getModel() {
    return this._model;
  }

  /**
   * Gets the current dimensions setting
   *
   * @returns {number} Current dimensions
   */
  getDimensions() {
    return this._dimensions;
  }

  /**
   * Gets the service statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Resets the service statistics
   */
  resetStats() {
    this._stats = {
      totalEmbeddings: 0,
      totalTokens: 0,
      totalRequests: 0,
      errors: 0
    };
    this._logger.debug('Statistics reset');
  }

  // ---------------------------------------------------------------------------
  // Text chunking methods
  // ---------------------------------------------------------------------------

  /**
   * Validates that text is non-empty and suitable for embedding
   *
   * @param {string} text - Text to validate
   * @throws {Error} If text is empty or invalid
   * @private
   */
  _validateText(text) {
    if (text === null || text === undefined || typeof text !== 'string') {
      throw new Error('EmbeddingService: Input must be a non-empty string');
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new Error('EmbeddingService: Cannot embed empty string');
    }

    return trimmed;
  }

  /**
   * Estimates the number of tokens in a text string
   *
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }
    // Conservative estimate: ~4 characters per token
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Splits text into overlapping chunks suitable for embedding
   *
   * @param {string} text - The text to chunk
   * @param {Object} [options={}] - Chunking options
   * @param {number} [options.chunkSize] - Target characters per chunk (default: service chunkSize)
   * @param {number} [options.overlap] - Overlap characters between chunks (default: service chunkOverlap)
   * @returns {TextChunk[]} Array of text chunks with metadata
   */
  chunkText(text, options = {}) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }

    const chunkSize = options.chunkSize || this._chunkSize;
    const overlap = options.overlap || this._chunkOverlap;

    // Ensure overlap is less than chunk size
    const effectiveOverlap = Math.min(overlap, Math.floor(chunkSize * 0.5));

    const chunks = [];
    let startPos = 0;
    const textLength = text.length;

    while (startPos < textLength) {
      const endPos = Math.min(startPos + chunkSize, textLength);

      // Try to break at sentence boundary
      let actualEnd = endPos;
      if (endPos < textLength) {
        // Look for sentence endings (.!?) followed by space or end
        const searchEnd = Math.min(endPos + 50, textLength);
        const searchStart = Math.max(startPos + Math.floor(chunkSize * 0.5), startPos);

        // Search for the last sentence boundary in the target range
        let lastSentenceEnd = -1;
        for (let i = searchStart; i < searchEnd; i++) {
          const char = text[i];
          if ((char === '.' || char === '!' || char === '?') && (i + 1 >= textLength || text[i + 1] === ' ' || text[i + 1] === '\n')) {
            lastSentenceEnd = i + 1;
          }
        }

        if (lastSentenceEnd > startPos) {
          actualEnd = lastSentenceEnd;
        }
      }

      const chunkText = text.substring(startPos, actualEnd).trim();

      // Only add non-empty chunks
      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          startPos,
          endPos: actualEnd,
          chunkIndex: chunks.length,
          totalChunks: -1 // Will be updated below
        });
      }

      // Move to next chunk, considering overlap
      startPos = actualEnd - effectiveOverlap;

      // Avoid infinite loop if overlap is too large
      if (startPos <= chunks[chunks.length - 1]?.startPos) {
        startPos = actualEnd;
      }
    }

    // Update totalChunks for all chunks
    const totalChunks = chunks.length;
    for (const chunk of chunks) {
      chunk.totalChunks = totalChunks;
    }

    this._logger.debug(`Text chunked into ${totalChunks} chunks`, {
      originalLength: textLength,
      chunkSize,
      overlap: effectiveOverlap
    });

    return chunks;
  }

  /**
   * Checks if text exceeds the maximum embedding size and needs chunking
   *
   * @param {string} text - Text to check
   * @returns {boolean} True if text needs to be chunked
   */
  needsChunking(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }
    return text.length > MAX_CHARS_PER_REQUEST;
  }

  // ---------------------------------------------------------------------------
  // Embedding methods
  // ---------------------------------------------------------------------------

  /**
   * Generate an embedding for a single text string
   *
   * @param {string} text - Text to embed (must be non-empty)
   * @param {Object} [options={}] - Embedding options
   * @param {string} [options.model] - Override model for this request
   * @param {number} [options.dimensions] - Override dimensions for this request
   * @returns {Promise<number[]>} The embedding vector
   * @throws {Error} If text is empty or API call fails
   */
  async embed(text, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('EmbeddingService: OpenAI client not configured');
    }

    // Validate and clean text
    const cleanText = this._validateText(text);

    // Check if text is too long
    if (cleanText.length > MAX_CHARS_PER_REQUEST) {
      throw new Error(
        `EmbeddingService: Text exceeds maximum length (${cleanText.length} > ${MAX_CHARS_PER_REQUEST} chars). Use chunkText() first.`
      );
    }

    const model = options.model || this._model;
    const dimensions = options.dimensions || this._dimensions;

    this._logger.debug('Generating embedding', {
      textLength: cleanText.length,
      model,
      dimensions
    });

    try {
      const response = await this._openaiClient.post('/embeddings', {
        model,
        input: cleanText,
        dimensions
      });

      // Validate response structure
      if (!response || !response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('EmbeddingService: Invalid API response structure');
      }

      const embedding = response.data[0].embedding;
      if (!Array.isArray(embedding)) {
        throw new Error('EmbeddingService: Invalid embedding format in response');
      }

      // Update statistics
      this._stats.totalEmbeddings++;
      this._stats.totalRequests++;
      if (response.usage && response.usage.total_tokens) {
        this._stats.totalTokens += response.usage.total_tokens;
      }

      this._logger.debug('Embedding generated successfully', {
        dimensions: embedding.length,
        tokensUsed: response.usage?.total_tokens
      });

      return embedding;
    } catch (error) {
      this._stats.errors++;
      this._logger.error('Failed to generate embedding:', error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in a single API call
   *
   * @param {string[]} texts - Array of texts to embed (each must be non-empty)
   * @param {Object} [options={}] - Embedding options
   * @param {string} [options.model] - Override model for this request
   * @param {number} [options.dimensions] - Override dimensions for this request
   * @returns {Promise<EmbeddingResult[]>} Array of embedding results with original text
   * @throws {Error} If any text is empty or API call fails
   */
  async embedBatch(texts, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('EmbeddingService: OpenAI client not configured');
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('EmbeddingService: Input must be a non-empty array of strings');
    }

    // Validate and clean all texts
    const cleanTexts = texts.map((text, index) => {
      try {
        return this._validateText(text);
      } catch (error) {
        throw new Error(`EmbeddingService: Invalid text at index ${index}: ${error.message}`);
      }
    });

    // Check batch size
    if (cleanTexts.length > MAX_BATCH_SIZE) {
      this._logger.warn(`Batch size ${cleanTexts.length} exceeds limit, splitting into multiple requests`);
      return this._embedLargeBatch(cleanTexts, options);
    }

    // Check individual text sizes
    for (let i = 0; i < cleanTexts.length; i++) {
      if (cleanTexts[i].length > MAX_CHARS_PER_REQUEST) {
        throw new Error(
          `EmbeddingService: Text at index ${i} exceeds maximum length. Use chunkText() first.`
        );
      }
    }

    const model = options.model || this._model;
    const dimensions = options.dimensions || this._dimensions;

    this._logger.debug('Generating batch embeddings', {
      batchSize: cleanTexts.length,
      model,
      dimensions
    });

    try {
      const response = await this._openaiClient.post('/embeddings', {
        model,
        input: cleanTexts,
        dimensions
      });

      // Validate response structure
      if (!response || !response.data || !Array.isArray(response.data)) {
        throw new Error('EmbeddingService: Invalid API response structure');
      }

      // Sort by index to ensure correct order
      const sortedData = [...response.data].sort((a, b) => a.index - b.index);

      const results = sortedData.map((item, i) => ({
        embedding: item.embedding,
        index: item.index,
        text: cleanTexts[i]
      }));

      // Update statistics
      this._stats.totalEmbeddings += results.length;
      this._stats.totalRequests++;
      if (response.usage && response.usage.total_tokens) {
        this._stats.totalTokens += response.usage.total_tokens;
      }

      this._logger.debug('Batch embeddings generated successfully', {
        count: results.length,
        tokensUsed: response.usage?.total_tokens
      });

      return results;
    } catch (error) {
      this._stats.errors++;
      this._logger.error('Failed to generate batch embeddings:', error.message);
      throw error;
    }
  }

  /**
   * Handle large batches by splitting into multiple API calls
   *
   * @param {string[]} texts - Array of cleaned texts
   * @param {Object} options - Embedding options
   * @returns {Promise<EmbeddingResult[]>} Combined results from all batches
   * @private
   */
  async _embedLargeBatch(texts, options = {}) {
    const results = [];
    let globalIndex = 0;

    // Split into chunks of MAX_BATCH_SIZE
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + MAX_BATCH_SIZE);

      this._logger.debug(`Processing batch ${Math.floor(i / MAX_BATCH_SIZE) + 1} of ${Math.ceil(texts.length / MAX_BATCH_SIZE)}`);

      const batchResults = await this.embedBatch(batchTexts, options);

      // Update indices to be global
      for (const result of batchResults) {
        results.push({
          ...result,
          index: globalIndex++
        });
      }
    }

    return results;
  }

  /**
   * Embed a document by chunking it and embedding all chunks
   *
   * @param {string} document - Document text to embed
   * @param {Object} [options={}] - Options for chunking and embedding
   * @param {number} [options.chunkSize] - Override chunk size
   * @param {number} [options.overlap] - Override chunk overlap
   * @param {string} [options.model] - Override embedding model
   * @param {number} [options.dimensions] - Override embedding dimensions
   * @param {Object} [options.metadata] - Additional metadata to include in results
   * @returns {Promise<Array<{chunk: TextChunk, embedding: number[]}>>} Array of chunks with embeddings
   */
  async embedDocument(document, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('EmbeddingService: OpenAI client not configured');
    }

    // Validate document
    if (!document || typeof document !== 'string' || document.trim().length === 0) {
      throw new Error('EmbeddingService: Document must be a non-empty string');
    }

    // Chunk the document
    const chunks = this.chunkText(document, {
      chunkSize: options.chunkSize,
      overlap: options.overlap
    });

    if (chunks.length === 0) {
      return [];
    }

    this._logger.info(`Embedding document: ${chunks.length} chunks`);

    // Extract just the text for embedding
    const texts = chunks.map((chunk) => chunk.text);

    // Embed all chunks
    const embeddingResults = await this.embedBatch(texts, {
      model: options.model,
      dimensions: options.dimensions
    });

    // Combine chunks with embeddings
    const results = chunks.map((chunk, index) => ({
      chunk: {
        ...chunk,
        ...(options.metadata || {})
      },
      embedding: embeddingResults[index].embedding
    }));

    this._logger.info(`Document embedded successfully: ${results.length} chunks`);

    return results;
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   *
   * @param {number[]} embedding1 - First embedding vector
   * @param {number[]} embedding2 - Second embedding vector
   * @returns {number} Cosine similarity score between -1 and 1
   * @throws {Error} If embeddings have different dimensions
   */
  cosineSimilarity(embedding1, embedding2) {
    if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
      throw new Error('EmbeddingService: Both inputs must be arrays');
    }

    if (embedding1.length !== embedding2.length) {
      throw new Error(
        `EmbeddingService: Embeddings must have same dimensions (${embedding1.length} vs ${embedding2.length})`
      );
    }

    if (embedding1.length === 0) {
      throw new Error('EmbeddingService: Embeddings cannot be empty');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }
}

// Export the EmbeddingService class and constants
export {
  EmbeddingService,
  DEFAULT_MODEL,
  DEFAULT_DIMENSIONS,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  MAX_TOKENS_PER_REQUEST,
  MAX_CHARS_PER_REQUEST,
  MAX_BATCH_SIZE
};
