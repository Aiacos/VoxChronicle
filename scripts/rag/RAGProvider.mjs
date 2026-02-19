/**
 * RAGProvider - Abstract interface for Retrieval-Augmented Generation backends
 *
 * All RAG providers must extend this class and implement every method.
 * The interface is designed to be backend-agnostic: OpenAI File Search,
 * Pinecone, local vector stores, or any future provider can be swapped
 * in via RAGProviderFactory without changing consumer code.
 *
 * @abstract
 * @class RAGProvider
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * @typedef {object} RAGDocument
 * @property {string} id - Unique document identifier
 * @property {string} title - Document title (e.g. journal name)
 * @property {string} content - Full text content to index
 * @property {object} [metadata] - Optional metadata (source, type, date)
 */

/**
 * @typedef {object} RAGSource
 * @property {string} title - Source document title
 * @property {string} excerpt - Relevant excerpt from the source
 * @property {number} [score] - Relevance score (0-1)
 * @property {string} [documentId] - Source document ID
 */

/**
 * @typedef {object} RAGQueryResult
 * @property {string} answer - Generated answer text
 * @property {RAGSource[]} sources - Source citations
 */

/**
 * @typedef {object} RAGStatus
 * @property {boolean} ready - Whether the provider is initialized and ready
 * @property {number} documentCount - Number of indexed documents
 * @property {string} providerName - Human-readable provider name
 * @property {object} [providerMeta] - Provider-specific metadata
 */

export class RAGProvider {
  constructor() {
    if (new.target === RAGProvider) {
      throw new Error('RAGProvider is abstract and cannot be instantiated directly');
    }
    this._logger = Logger.createChild(this.constructor.name);
    this._logger.debug(`RAGProvider subclass constructed: ${this.constructor.name}`);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Initialize the provider (create vector store, authenticate, etc.)
   * @param {object} config - Provider-specific configuration
   * @param {string} [config.apiKey] - API key for the provider
   * @returns {Promise<void>}
   * @abstract
   */
  async initialize(config) {
    throw new Error('RAGProvider.initialize() must be implemented by subclass');
  }

  /**
   * Clean up resources (delete temp files, close connections, etc.)
   * @returns {Promise<void>}
   * @abstract
   */
  async destroy() {
    throw new Error('RAGProvider.destroy() must be implemented by subclass');
  }

  // ─── Indexing ───────────────────────────────────────────────────────

  /**
   * Index one or more documents for retrieval
   * @param {RAGDocument[]} documents - Documents to index
   * @param {object} [options] - Indexing options
   * @param {function} [options.onProgress] - Progress callback (current, total, message)
   * @returns {Promise<{indexed: number, failed: number}>} Indexing results
   * @abstract
   */
  async indexDocuments(documents, options = {}) {
    throw new Error('RAGProvider.indexDocuments() must be implemented by subclass');
  }

  /**
   * Remove a single document from the index
   * @param {string} documentId - ID of the document to remove
   * @returns {Promise<boolean>} True if removed, false if not found
   * @abstract
   */
  async removeDocument(documentId) {
    throw new Error('RAGProvider.removeDocument() must be implemented by subclass');
  }

  /**
   * Remove all documents from the index
   * @returns {Promise<void>}
   * @abstract
   */
  async clearIndex() {
    throw new Error('RAGProvider.clearIndex() must be implemented by subclass');
  }

  // ─── Querying ───────────────────────────────────────────────────────

  /**
   * Query the RAG index with a natural language question
   * @param {string} question - The question to answer
   * @param {object} [options] - Query options
   * @param {number} [options.maxResults=5] - Maximum number of source results
   * @param {string} [options.systemPrompt] - Custom system prompt for answer generation
   * @returns {Promise<RAGQueryResult>} Generated answer with source citations
   * @abstract
   */
  async query(question, options = {}) {
    throw new Error('RAGProvider.query() must be implemented by subclass');
  }

  // ─── Status ─────────────────────────────────────────────────────────

  /**
   * Get the current status of the provider
   * @returns {Promise<RAGStatus>} Provider status
   * @abstract
   */
  async getStatus() {
    throw new Error('RAGProvider.getStatus() must be implemented by subclass');
  }
}
