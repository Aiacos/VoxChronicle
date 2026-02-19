/**
 * OpenAIFileSearchProvider - RAG provider using OpenAI Responses API + File Search
 *
 * Replaces the custom RAG stack (EmbeddingService + RAGVectorStore + RAGRetriever)
 * with OpenAI's managed vector store and file_search tool. Documents are uploaded
 * as files, auto-chunked (800-token windows, 256-token overlap), embedded, and
 * stored in a persistent vector store. Queries use the Responses API with the
 * file_search tool for retrieval-augmented generation.
 *
 * @class OpenAIFileSearchProvider
 * @extends RAGProvider
 * @module vox-chronicle
 */

import { RAGProvider } from './RAGProvider.mjs';
import { MODULE_ID } from '../constants.mjs';

/**
 * Default model for RAG queries
 * @constant {string}
 */
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Vector store expiry: 30 days after last use
 * @constant {number}
 */
const VECTOR_STORE_EXPIRY_DAYS = 30;

/**
 * Max file size for OpenAI uploads (512 MB)
 * @constant {number}
 */
const MAX_FILE_SIZE = 512 * 1024 * 1024;

/**
 * Polling interval for vector store file processing (ms)
 * @constant {number}
 */
const POLL_INTERVAL_MS = 1000;

/**
 * Max polling duration before timeout (ms)
 * @constant {number}
 */
const POLL_TIMEOUT_MS = 120000;

export class OpenAIFileSearchProvider extends RAGProvider {
  /** @type {import('../ai/OpenAIClient.mjs').OpenAIClient|null} */
  #client = null;

  /** @type {string|null} */
  #vectorStoreId = null;

  /** @type {Map<string, string>} documentId -> openAI fileId */
  #fileIds = new Map();

  /** @type {boolean} */
  #initialized = false;

  /** @type {string} */
  #model = DEFAULT_MODEL;

  /**
   * @param {object} [config]
   * @param {string} [config.model] - Model for RAG queries (default: gpt-4o-mini)
   */
  constructor(config = {}) {
    super();
    this.#model = config.model || DEFAULT_MODEL;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Initialize the provider: set up OpenAI client and create/reuse vector store
   *
   * @param {object} config
   * @param {import('../ai/OpenAIClient.mjs').OpenAIClient} config.client - OpenAI client instance
   * @param {string} [config.vectorStoreId] - Existing vector store ID to reuse
   * @param {string} [config.storeName] - Name for new vector store
   * @returns {Promise<void>}
   */
  async initialize(config) {
    if (!config?.client) {
      throw new Error('OpenAIFileSearchProvider requires an OpenAIClient instance (config.client)');
    }

    this.#client = config.client;
    this._logger.debug('Initializing OpenAI File Search provider');

    // Try reusing existing vector store
    if (config.vectorStoreId) {
      const valid = await this.#validateVectorStore(config.vectorStoreId);
      if (valid) {
        this.#vectorStoreId = config.vectorStoreId;
        this._logger.info(`Reusing vector store: ${this.#vectorStoreId}`);
        this.#initialized = true;
        return;
      }
      this._logger.warn(`Vector store ${config.vectorStoreId} not found or expired, creating new one`);
    }

    // Create new vector store
    const storeName = config.storeName || `${MODULE_ID}-rag`;
    this.#vectorStoreId = await this.#createVectorStore(storeName);
    this._logger.info(`Created vector store: ${this.#vectorStoreId}`);
    this.#initialized = true;
  }

  /**
   * Clean up: delete vector store and all uploaded files
   * @returns {Promise<void>}
   */
  async destroy() {
    this.#ensureInitialized();
    this._logger.info('Destroying OpenAI File Search provider');

    // Delete all uploaded files
    const deletePromises = [];
    for (const [docId, fileId] of this.#fileIds) {
      deletePromises.push(
        this.#deleteFile(fileId).catch(err =>
          this._logger.warn(`Failed to delete file ${fileId} (doc: ${docId}): ${err.message}`)
        )
      );
    }
    await Promise.all(deletePromises);
    this.#fileIds.clear();

    // Delete vector store
    if (this.#vectorStoreId) {
      try {
        await this.#client.request(`/vector_stores/${this.#vectorStoreId}`, { method: 'DELETE' });
        this._logger.debug(`Deleted vector store: ${this.#vectorStoreId}`);
      } catch (err) {
        this._logger.warn(`Failed to delete vector store: ${err.message}`);
      }
    }

    this.#vectorStoreId = null;
    this.#initialized = false;
  }

  // ─── Indexing ───────────────────────────────────────────────────────

  /**
   * Index documents by uploading them as files to OpenAI and adding to vector store
   *
   * @param {import('./RAGProvider.mjs').RAGDocument[]} documents
   * @param {object} [options]
   * @param {function} [options.onProgress] - Progress callback (current, total, message)
   * @returns {Promise<{indexed: number, failed: number}>}
   */
  async indexDocuments(documents, options = {}) {
    this.#ensureInitialized();

    if (!documents?.length) {
      return { indexed: 0, failed: 0 };
    }

    const { onProgress } = options;
    let indexed = 0;
    let failed = 0;

    this._logger.info(`Indexing ${documents.length} documents`);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      try {
        onProgress?.(i, documents.length, `Uploading: ${doc.title}`);

        // Skip if already indexed
        if (this.#fileIds.has(doc.id)) {
          this._logger.debug(`Document "${doc.title}" already indexed, skipping`);
          indexed++;
          continue;
        }

        // Upload file
        const fileId = await this.#uploadDocument(doc);

        // Add to vector store
        await this.#addFileToVectorStore(fileId);

        this.#fileIds.set(doc.id, fileId);
        indexed++;
        this._logger.debug(`Indexed document: "${doc.title}" (${fileId})`);
      } catch (err) {
        failed++;
        this._logger.error(`Failed to index document "${doc.title}": ${err.message}`);
      }
    }

    onProgress?.(documents.length, documents.length, `Done: ${indexed} indexed, ${failed} failed`);
    this._logger.info(`Indexing complete: ${indexed} indexed, ${failed} failed`);
    return { indexed, failed };
  }

  /**
   * Remove a single document from the index
   * @param {string} documentId
   * @returns {Promise<boolean>}
   */
  async removeDocument(documentId) {
    this.#ensureInitialized();

    const fileId = this.#fileIds.get(documentId);
    if (!fileId) {
      this._logger.debug(`Document "${documentId}" not found in index`);
      return false;
    }

    try {
      // Remove from vector store first, then delete file
      await this.#removeFileFromVectorStore(fileId);
      await this.#deleteFile(fileId);
      this.#fileIds.delete(documentId);
      this._logger.debug(`Removed document: "${documentId}"`);
      return true;
    } catch (err) {
      this._logger.error(`Failed to remove document "${documentId}": ${err.message}`);
      throw err;
    }
  }

  /**
   * Remove all documents from the index
   * @returns {Promise<void>}
   */
  async clearIndex() {
    this.#ensureInitialized();
    this._logger.info(`Clearing index (${this.#fileIds.size} documents)`);

    const errors = [];
    for (const [docId, fileId] of this.#fileIds) {
      try {
        await this.#removeFileFromVectorStore(fileId);
        await this.#deleteFile(fileId);
      } catch (err) {
        errors.push(`${docId}: ${err.message}`);
      }
    }
    this.#fileIds.clear();

    if (errors.length > 0) {
      this._logger.warn(`Cleared index with ${errors.length} errors: ${errors.join('; ')}`);
    } else {
      this._logger.info('Index cleared successfully');
    }
  }

  // ─── Querying ───────────────────────────────────────────────────────

  /**
   * Query the RAG index using OpenAI Responses API with file_search tool
   *
   * @param {string} question
   * @param {object} [options]
   * @param {number} [options.maxResults=5] - Max source results
   * @param {string} [options.systemPrompt] - Custom system prompt
   * @param {string} [options.model] - Override model for this query
   * @returns {Promise<import('./RAGProvider.mjs').RAGQueryResult>}
   */
  async query(question, options = {}) {
    this.#ensureInitialized();

    if (!question?.trim()) {
      throw new Error('Question cannot be empty');
    }

    const maxResults = options.maxResults ?? 5;
    const model = options.model || this.#model;

    this._logger.debug(`Querying RAG: "${question.substring(0, 80)}..." (max ${maxResults} results)`);

    const requestBody = {
      model,
      input: question,
      tools: [{
        type: 'file_search',
        vector_store_ids: [this.#vectorStoreId],
        max_num_results: maxResults
      }]
    };

    // Add system instructions if provided
    if (options.systemPrompt) {
      requestBody.instructions = options.systemPrompt;
    }

    const response = await this.#client.post('/responses', requestBody);
    return this.#parseQueryResponse(response);
  }

  // ─── Status ─────────────────────────────────────────────────────────

  /**
   * Get provider status
   * @returns {Promise<import('./RAGProvider.mjs').RAGStatus>}
   */
  async getStatus() {
    const status = {
      ready: this.#initialized,
      documentCount: this.#fileIds.size,
      providerName: 'OpenAI File Search',
      providerMeta: {
        vectorStoreId: this.#vectorStoreId,
        model: this.#model
      }
    };

    // Fetch vector store details if initialized
    if (this.#initialized && this.#vectorStoreId) {
      try {
        const vs = await this.#client.request(`/vector_stores/${this.#vectorStoreId}`, { method: 'GET' });
        status.providerMeta.fileCounts = vs.file_counts;
        status.providerMeta.status = vs.status;
        status.providerMeta.expiresAt = vs.expires_at;
        status.documentCount = vs.file_counts?.completed ?? this.#fileIds.size;
      } catch (err) {
        this._logger.warn(`Failed to fetch vector store status: ${err.message}`);
      }
    }

    return status;
  }

  /**
   * Get the current vector store ID (for persistence in settings)
   * @returns {string|null}
   */
  getVectorStoreId() {
    return this.#vectorStoreId;
  }

  // ─── Private: Vector Store Management ───────────────────────────────

  /**
   * Create a new vector store
   * @param {string} name
   * @returns {Promise<string>} Vector store ID
   */
  async #createVectorStore(name) {
    const response = await this.#client.post('/vector_stores', {
      name,
      expires_after: {
        anchor: 'last_active_at',
        days: VECTOR_STORE_EXPIRY_DAYS
      }
    });
    return response.id;
  }

  /**
   * Validate that a vector store exists and is usable
   * @param {string} vectorStoreId
   * @returns {Promise<boolean>}
   */
  async #validateVectorStore(vectorStoreId) {
    try {
      const vs = await this.#client.request(`/vector_stores/${vectorStoreId}`, { method: 'GET' });
      return vs.status !== 'expired';
    } catch {
      return false;
    }
  }

  // ─── Private: File Operations ───────────────────────────────────────

  /**
   * Upload a RAGDocument as a file to OpenAI
   * @param {import('./RAGProvider.mjs').RAGDocument} doc
   * @returns {Promise<string>} File ID
   */
  async #uploadDocument(doc) {
    // Build file content with metadata header
    const header = `# ${doc.title}\n`;
    const metaLine = doc.metadata
      ? `<!-- metadata: ${JSON.stringify(doc.metadata)} -->\n\n`
      : '\n';
    const content = header + metaLine + doc.content;

    // Check size limit
    const blob = new Blob([content], { type: 'text/plain' });
    if (blob.size > MAX_FILE_SIZE) {
      throw new Error(`Document "${doc.title}" exceeds max file size (${Math.round(blob.size / 1024 / 1024)}MB > 512MB)`);
    }

    // Upload via FormData
    const formData = new FormData();
    const fileName = `${doc.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
    formData.append('file', blob, fileName);
    formData.append('purpose', 'assistants');

    const response = await this.#client.postFormData('/files', formData);
    return response.id;
  }

  /**
   * Add a file to the vector store and wait for processing
   * @param {string} fileId
   * @returns {Promise<void>}
   */
  async #addFileToVectorStore(fileId) {
    await this.#client.post(`/vector_stores/${this.#vectorStoreId}/files`, {
      file_id: fileId
    });

    // Poll until processing completes
    await this.#waitForFileProcessing(fileId);
  }

  /**
   * Remove a file from the vector store
   * @param {string} fileId
   * @returns {Promise<void>}
   */
  async #removeFileFromVectorStore(fileId) {
    await this.#client.request(`/vector_stores/${this.#vectorStoreId}/files/${fileId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Delete a file from OpenAI
   * @param {string} fileId
   * @returns {Promise<void>}
   */
  async #deleteFile(fileId) {
    await this.#client.request(`/files/${fileId}`, { method: 'DELETE' });
  }

  /**
   * Poll vector store file status until processing is complete
   * @param {string} fileId
   * @returns {Promise<void>}
   */
  async #waitForFileProcessing(fileId) {
    const startTime = Date.now();

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      const status = await this.#client.request(
        `/vector_stores/${this.#vectorStoreId}/files/${fileId}`,
        { method: 'GET', useRetry: false, useQueue: false }
      );

      if (status.status === 'completed') {
        return;
      }

      if (status.status === 'failed' || status.status === 'cancelled') {
        const reason = status.last_error?.message || status.status;
        throw new Error(`File processing ${status.status}: ${reason}`);
      }

      // Still in_progress — wait and retry
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`File processing timed out after ${POLL_TIMEOUT_MS / 1000}s`);
  }

  // ─── Private: Response Parsing ──────────────────────────────────────

  /**
   * Parse Responses API output into RAGQueryResult
   * @param {object} response - Raw API response
   * @returns {import('./RAGProvider.mjs').RAGQueryResult}
   */
  #parseQueryResponse(response) {
    let answer = '';
    const sources = [];

    // Extract text output and file search annotations
    if (response.output) {
      for (const item of response.output) {
        if (item.type === 'message') {
          for (const content of item.content || []) {
            if (content.type === 'output_text') {
              answer += content.text;

              // Extract source annotations
              for (const annotation of content.annotations || []) {
                if (annotation.type === 'file_citation') {
                  sources.push({
                    title: annotation.filename || 'Unknown',
                    excerpt: annotation.text || '',
                    score: annotation.score ?? null,
                    documentId: annotation.file_id || null
                  });
                }
              }
            }
          }
        }
      }
    }

    // Deduplicate sources by file_id
    const uniqueSources = this.#deduplicateSources(sources);

    return { answer, sources: uniqueSources };
  }

  /**
   * Deduplicate sources by documentId, keeping highest score
   * @param {import('./RAGProvider.mjs').RAGSource[]} sources
   * @returns {import('./RAGProvider.mjs').RAGSource[]}
   */
  #deduplicateSources(sources) {
    const seen = new Map();
    for (const source of sources) {
      const key = source.documentId || source.title;
      const existing = seen.get(key);
      if (!existing || (source.score ?? 0) > (existing.score ?? 0)) {
        seen.set(key, source);
      }
    }
    return Array.from(seen.values());
  }

  // ─── Private: Helpers ───────────────────────────────────────────────

  /**
   * Throw if provider is not initialized
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('OpenAIFileSearchProvider is not initialized. Call initialize() first.');
    }
  }
}
