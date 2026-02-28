/**
 * RAGFlowProvider - RAG provider using a self-hosted RAGFlow instance
 *
 * RAGFlow is an open-source RAG engine with deep document understanding.
 * This provider communicates with a local/remote RAGFlow instance via its
 * HTTP API to index game documents and answer context-aware queries.
 *
 * Workflow:
 *   initialize() → create/reuse dataset + chat assistant
 *   indexDocuments() → upload files → trigger parsing → wait for completion
 *   query() → chat completions (OpenAI-compatible) with automatic retrieval
 *   destroy() → clean up dataset + assistant
 *
 * @class RAGFlowProvider
 * @extends RAGProvider
 * @see https://ragflow.io/docs/http_api_reference
 * @module vox-chronicle
 */

import { RAGProvider } from './RAGProvider.mjs';
import { MODULE_ID } from '../constants.mjs';

/**
 * Polling interval for document parsing status (ms)
 * @constant {number}
 */
const PARSE_POLL_INTERVAL_MS = 2000;

/**
 * Max polling duration before timeout (ms)
 * @constant {number}
 */
const PARSE_POLL_TIMEOUT_MS = 300000; // 5 minutes

export class RAGFlowProvider extends RAGProvider {
  /** @type {string|null} RAGFlow base URL */
  #baseUrl = null;

  /** @type {string|null} RAGFlow API key */
  #apiKey = null;

  /** @type {string|null} Dataset (knowledge base) ID */
  #datasetId = null;

  /** @type {string|null} Chat assistant ID */
  #chatId = null;

  /** @type {Map<string, string>} documentId -> RAGFlow document ID */
  #documentIds = new Map();

  /** @type {boolean} */
  #initialized = false;

  /** @type {string} */
  #modelName = '';

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Initialize the provider: connect to RAGFlow, create/reuse dataset and chat assistant
   *
   * @param {object} config
   * @param {string} config.baseUrl - RAGFlow server URL (e.g. 'http://localhost:9380')
   * @param {string} config.apiKey - RAGFlow API key
   * @param {string} [config.datasetId] - Existing dataset ID to reuse
   * @param {string} [config.chatId] - Existing chat assistant ID to reuse
   * @param {string} [config.datasetName] - Name for new dataset
   * @param {string} [config.modelName] - LLM model name configured in RAGFlow
   * @returns {Promise<void>}
   */
  async initialize(config) {
    const startTime = Date.now();
    this._logger.debug(`initialize() called — baseUrl="${config?.baseUrl || '(none)'}", datasetId="${config?.datasetId || '(none)'}", chatId="${config?.chatId || '(none)'}", modelName="${config?.modelName || '(default)'}"`);

    if (!config?.baseUrl) {
      throw new Error('RAGFlowProvider requires a baseUrl (config.baseUrl)');
    }
    if (!config?.apiKey) {
      throw new Error('RAGFlowProvider requires an API key (config.apiKey)');
    }

    this.#baseUrl = config.baseUrl.replace(/\/+$/, ''); // Strip trailing slash
    this.#apiKey = config.apiKey;
    this.#modelName = config.modelName || '';

    this._logger.debug(`Initializing RAGFlow provider at ${this.#baseUrl}`);

    // Try reusing existing dataset
    if (config.datasetId) {
      const valid = await this.#validateDataset(config.datasetId);
      if (valid) {
        this.#datasetId = config.datasetId;
        this._logger.info(`Reusing dataset: ${this.#datasetId}`);
      } else {
        this._logger.warn(`Dataset ${config.datasetId} not found, creating new one`);
      }
    }

    // Create new dataset if needed
    if (!this.#datasetId) {
      const datasetName = config.datasetName || `${MODULE_ID}-rag`;
      this.#datasetId = await this.#createDataset(datasetName);
      this._logger.info(`Created dataset: ${this.#datasetId}`);
    }

    // Try reusing existing chat assistant
    if (config.chatId) {
      const valid = await this.#validateChat(config.chatId);
      if (valid) {
        this.#chatId = config.chatId;
        this._logger.info(`Reusing chat assistant: ${this.#chatId}`);
      } else {
        this._logger.warn(`Chat assistant ${config.chatId} not found, creating new one`);
      }
    }

    // Create new chat assistant if needed
    if (!this.#chatId) {
      this.#chatId = await this.#createChatAssistant();
      this._logger.info(`Created chat assistant: ${this.#chatId}`);
    }

    this.#initialized = true;
    this._logger.debug(`initialize() complete in ${Date.now() - startTime}ms — datasetId=${this.#datasetId}, chatId=${this.#chatId}`);
  }

  /**
   * Clean up: delete chat assistant and dataset
   * @returns {Promise<void>}
   */
  async destroy() {
    const startTime = Date.now();
    if (!this.#initialized) {
      this._logger.debug('Already destroyed or not initialized, skipping');
      return;
    }
    this.#initialized = false; // Set FIRST to prevent re-entrant calls
    this._logger.info(`Destroying RAGFlow provider — ${this.#documentIds.size} docs, dataset=${this.#datasetId}, chat=${this.#chatId}`);

    // Delete chat assistant
    if (this.#chatId) {
      try {
        await this.#request('/api/v1/chats', {
          method: 'DELETE',
          body: JSON.stringify({ ids: [this.#chatId] })
        });
        this._logger.debug(`Deleted chat assistant: ${this.#chatId}`);
      } catch (err) {
        this._logger.warn(`Failed to delete chat assistant: ${err.message}`);
      }
    }

    // Delete dataset (also deletes all documents)
    if (this.#datasetId) {
      try {
        await this.#request('/api/v1/datasets', {
          method: 'DELETE',
          body: JSON.stringify({ ids: [this.#datasetId] })
        });
        this._logger.debug(`Deleted dataset: ${this.#datasetId}`);
      } catch (err) {
        this._logger.warn(`Failed to delete dataset: ${err.message}`);
      }
    }

    this.#documentIds.clear();
    this.#datasetId = null;
    this.#chatId = null;
    this._logger.debug(`destroy() complete in ${Date.now() - startTime}ms`);
  }

  // ─── Indexing ───────────────────────────────────────────────────────

  /**
   * Index documents by uploading them to RAGFlow and triggering parsing
   *
   * @param {import('./RAGProvider.mjs').RAGDocument[]} documents
   * @param {object} [options]
   * @param {function} [options.onProgress] - Progress callback (current, total, message)
   * @returns {Promise<{indexed: number, failed: number}>}
   */
  async indexDocuments(documents, options = {}) {
    const startTime = Date.now();
    this.#ensureInitialized();

    if (!documents?.length) {
      this._logger.debug('indexDocuments() called with empty documents array');
      return { indexed: 0, failed: 0 };
    }

    const { onProgress } = options;
    let indexed = 0;
    let failed = 0;

    const totalContentSize = documents.reduce((sum, d) => sum + (d.content?.length || 0), 0);
    this._logger.info(`Indexing ${documents.length} documents (total content: ${totalContentSize} chars)`);

    // Upload each document
    const uploadedDocIds = [];
    const uploadStart = Date.now();
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      try {
        onProgress?.(i, documents.length, `Uploading: ${doc.title}`);

        // Skip if already indexed
        if (this.#documentIds.has(doc.id)) {
          this._logger.debug(`Document "${doc.title}" already indexed, skipping`);
          indexed++;
          continue;
        }

        // Upload document as text file
        const docUploadStart = Date.now();
        const ragflowDocId = await this.#uploadDocument(doc);
        this.#documentIds.set(doc.id, ragflowDocId);
        uploadedDocIds.push(ragflowDocId);
        indexed++;
        this._logger.debug(`Uploaded document: "${doc.title}" (${ragflowDocId}) in ${Date.now() - docUploadStart}ms (${doc.content?.length || 0} chars)`);
      } catch (err) {
        failed++;
        this._logger.error(`Failed to upload document "${doc.title}": ${err.message}`);
      }
    }
    this._logger.debug(`Upload phase complete in ${Date.now() - uploadStart}ms — ${uploadedDocIds.length} uploaded, ${failed} failed`);

    // Trigger parsing for all uploaded documents at once
    if (uploadedDocIds.length > 0) {
      try {
        onProgress?.(documents.length, documents.length, 'Parsing documents...');
        const parseStart = Date.now();
        await this.#triggerParsing(uploadedDocIds);
        const parseResult = await this.#waitForParsing(uploadedDocIds);
        if (parseResult?.parseFailed > 0) {
          failed += parseResult.parseFailed;
          indexed = Math.max(0, indexed - parseResult.parseFailed);
          this._logger.warn(`${parseResult.parseFailed} documents failed parsing after upload`);
        }
        this._logger.info(`Parsing complete for ${uploadedDocIds.length} documents in ${Date.now() - parseStart}ms`);
      } catch (err) {
        this._logger.error(`Document parsing failed: ${err.message}`);
      }
    }

    onProgress?.(documents.length, documents.length, `Done: ${indexed} indexed, ${failed} failed`);
    this._logger.info(`Indexing complete: ${indexed} indexed, ${failed} failed in ${Date.now() - startTime}ms`);
    return { indexed, failed };
  }

  /**
   * Remove a single document from the index
   * @param {string} documentId
   * @returns {Promise<boolean>}
   */
  async removeDocument(documentId) {
    const startTime = Date.now();
    this._logger.debug(`removeDocument() called — id="${documentId}"`);
    this.#ensureInitialized();

    const ragflowDocId = this.#documentIds.get(documentId);
    if (!ragflowDocId) {
      this._logger.debug(`Document "${documentId}" not found in index`);
      return false;
    }

    try {
      await this.#request(`/api/v1/datasets/${this.#datasetId}/documents`, {
        method: 'DELETE',
        body: JSON.stringify({ ids: [ragflowDocId] })
      });
      this.#documentIds.delete(documentId);
      this._logger.debug(`Removed document: "${documentId}" in ${Date.now() - startTime}ms`);
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
    const startTime = Date.now();
    this.#ensureInitialized();
    this._logger.info(`Clearing index (${this.#documentIds.size} documents)`);

    const allDocIds = Array.from(this.#documentIds.values());

    if (allDocIds.length > 0) {
      try {
        await this.#request(`/api/v1/datasets/${this.#datasetId}/documents`, {
          method: 'DELETE',
          body: JSON.stringify({ ids: allDocIds })
        });
      } catch (err) {
        this._logger.error(`Failed to delete documents from remote: ${err.message}`);
        throw err;
      }
    }

    this.#documentIds.clear();
    this._logger.info(`Index cleared in ${Date.now() - startTime}ms`);
  }

  // ─── Querying ───────────────────────────────────────────────────────

  /**
   * Query the RAG index using RAGFlow's chat completions endpoint
   *
   * @param {string} question
   * @param {object} [options]
   * @param {number} [options.maxResults=5] - Max source results
   * @param {string} [options.systemPrompt] - Custom system prompt (not used — configured in assistant)
   * @returns {Promise<import('./RAGProvider.mjs').RAGQueryResult>}
   */
  async query(question, options = {}) {
    const startTime = Date.now();
    this.#ensureInitialized();

    if (!question?.trim()) {
      throw new Error('Question cannot be empty');
    }

    this._logger.debug(`Querying RAGFlow: "${question.substring(0, 80)}..." (chatId=${this.#chatId})`);

    // Use the OpenAI-compatible chat completions endpoint
    const response = await this.#request(`/api/v1/chats_openai/${this.#chatId}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({
        model: this.#chatId,
        messages: [{ role: 'user', content: question }],
        stream: false,
        extra_body: { reference: true }
      })
    });

    const result = this.#parseQueryResponse(response);
    this._logger.debug(`query() complete in ${Date.now() - startTime}ms — answer=${result.answer.length} chars, ${result.sources.length} sources`);
    return result;
  }

  // ─── Status ─────────────────────────────────────────────────────────

  /**
   * Get provider status
   * @returns {Promise<import('./RAGProvider.mjs').RAGStatus>}
   */
  async getStatus() {
    this._logger.debug('getStatus() called');
    const status = {
      ready: this.#initialized,
      documentCount: this.#documentIds.size,
      providerName: 'RAGFlow',
      providerMeta: {
        baseUrl: this.#baseUrl,
        datasetId: this.#datasetId,
        chatId: this.#chatId,
        modelName: this.#modelName
      }
    };

    // Fetch dataset document count if initialized
    if (this.#initialized && this.#datasetId) {
      try {
        const response = await this.#request(
          `/api/v1/datasets/${this.#datasetId}/documents?page=1&page_size=1`,
          { method: 'GET' }
        );
        if (response.data?.total !== undefined) {
          status.documentCount = response.data.total;
        }
      } catch (err) {
        this._logger.warn(`Failed to fetch dataset status: ${err.message}`);
      }
    }

    this._logger.debug(`getStatus() → ready=${status.ready}, docs=${status.documentCount}`);
    return status;
  }

  /**
   * Get the current dataset ID (for persistence in settings)
   * @returns {string|null}
   */
  getDatasetId() {
    this._logger.debug(`getDatasetId() → ${this.#datasetId || '(null)'}`);
    return this.#datasetId;
  }

  /**
   * Get the current chat assistant ID (for persistence in settings)
   * @returns {string|null}
   */
  getChatId() {
    this._logger.debug(`getChatId() → ${this.#chatId || '(null)'}`);
    return this.#chatId;
  }

  // ─── Private: Dataset Management ────────────────────────────────────

  /**
   * Create a new dataset
   * @param {string} name
   * @returns {Promise<string>} Dataset ID
   */
  async #createDataset(name) {
    const response = await this.#request('/api/v1/datasets', {
      method: 'POST',
      body: JSON.stringify({
        name,
        chunk_method: 'naive',
        parser_config: { chunk_token_num: 512, delimiter: '\\n' }
      })
    });

    if (!response.data?.id) {
      throw new Error('Failed to create dataset: no ID returned');
    }
    return response.data.id;
  }

  /**
   * Validate that a dataset exists
   * @param {string} datasetId
   * @returns {Promise<boolean>}
   */
  async #validateDataset(datasetId) {
    try {
      const response = await this.#request(`/api/v1/datasets?id=${datasetId}`, { method: 'GET' });
      return response.data?.length > 0;
    } catch (error) {
      this._logger.warn('Dataset validation failed:', error.message);
      return false;
    }
  }

  // ─── Private: Chat Assistant Management ─────────────────────────────

  /**
   * Create a chat assistant linked to the current dataset
   * @returns {Promise<string>} Chat ID
   */
  async #createChatAssistant() {
    const body = {
      name: `${MODULE_ID}-assistant`,
      dataset_ids: [this.#datasetId]
    };

    // Include LLM model name if specified
    if (this.#modelName) {
      body.llm = { model_name: this.#modelName };
    }

    const response = await this.#request('/api/v1/chats', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!response.data?.id) {
      throw new Error('Failed to create chat assistant: no ID returned');
    }
    return response.data.id;
  }

  /**
   * Validate that a chat assistant exists
   * @param {string} chatId
   * @returns {Promise<boolean>}
   */
  async #validateChat(chatId) {
    try {
      const response = await this.#request(`/api/v1/chats?id=${chatId}`, { method: 'GET' });
      return response.data?.length > 0;
    } catch (error) {
      this._logger.warn('Chat validation failed:', error.message);
      return false;
    }
  }

  // ─── Private: Document Operations ──────────────────────────────────

  /**
   * Upload a RAGDocument as a text file to RAGFlow
   * @param {import('./RAGProvider.mjs').RAGDocument} doc
   * @returns {Promise<string>} RAGFlow document ID
   */
  async #uploadDocument(doc) {
    // Build file content with metadata header
    const header = `# ${doc.title}\n`;
    const metaLine = doc.metadata
      ? `<!-- metadata: ${JSON.stringify(doc.metadata)} -->\n\n`
      : '\n';
    const content = header + metaLine + doc.content;

    const blob = new Blob([content], { type: 'text/plain' });
    const fileName = `${doc.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;

    const formData = new FormData();
    formData.append('file', blob, fileName);

    const response = await this.#request(
      `/api/v1/datasets/${this.#datasetId}/documents`,
      { method: 'POST', body: formData, isFormData: true }
    );

    // Response data is an array of uploaded documents
    const docs = response.data;
    if (!docs?.length || !docs[0]?.id) {
      throw new Error(`Failed to upload document "${doc.title}": no ID returned`);
    }
    return docs[0].id;
  }

  /**
   * Trigger parsing for a batch of documents
   * @param {string[]} documentIds - RAGFlow document IDs
   * @returns {Promise<void>}
   */
  async #triggerParsing(documentIds) {
    await this.#request(`/api/v1/datasets/${this.#datasetId}/chunks`, {
      method: 'POST',
      body: JSON.stringify({ document_ids: documentIds })
    });
  }

  /**
   * Wait for all documents to finish parsing
   * @param {string[]} documentIds - RAGFlow document IDs
   * @returns {Promise<void>}
   */
  async #waitForParsing(documentIds) {
    const startTime = Date.now();

    while (Date.now() - startTime < PARSE_POLL_TIMEOUT_MS) {
      const response = await this.#request(
        `/api/v1/datasets/${this.#datasetId}/documents?page=1&page_size=100`,
        { method: 'GET' }
      );

      const docs = response.data?.docs || response.data || [];
      const targetDocs = docs.filter(d => documentIds.includes(d.id));

      const allDone = targetDocs.every(
        d => d.run === 'DONE' || d.run === '1' || d.status === 'DONE'
      );
      const anyFailed = targetDocs.some(
        d => d.run === 'CANCEL' || d.run === 'FAIL' || d.status === 'FAIL'
      );

      if (anyFailed) {
        const failedDocs = targetDocs.filter(d => d.run === 'FAIL' || d.status === 'FAIL');
        this._logger.warn(`${failedDocs.length} documents failed parsing`);
        return { parseFailed: failedDocs.length };
      }

      if (allDone) {
        return { parseFailed: 0 };
      }

      await new Promise(resolve => setTimeout(resolve, PARSE_POLL_INTERVAL_MS));
    }

    this._logger.warn(`Parsing poll timed out after ${PARSE_POLL_TIMEOUT_MS / 1000}s`);
  }

  // ─── Private: Response Parsing ─────────────────────────────────────

  /**
   * Parse chat completions response into RAGQueryResult
   * @param {object} response - Raw API response
   * @returns {import('./RAGProvider.mjs').RAGQueryResult}
   */
  #parseQueryResponse(response) {
    let answer = '';
    const sources = [];

    // OpenAI-compatible response format
    const choices = response.choices || [];
    if (choices.length > 0 && choices[0]) {
      const message = choices[0].message || choices[0];
      answer = (message && message.content) || '';

      // RAGFlow includes references in the response when reference: true
      const references = response.references || message.references || [];
      for (const ref of references) {
        sources.push({
          title: ref.document_name || ref.doc_name || 'Unknown',
          excerpt: ref.content || ref.text || '',
          score: ref.similarity ?? ref.score ?? null,
          documentId: ref.document_id || ref.doc_id || null
        });
      }
    }

    // Fallback: RAGFlow native response format (non-OpenAI-compatible)
    if (!answer && response.data) {
      const data = response.data;
      answer = data.answer || data.content || '';

      const refs = data.reference || data.references || [];
      for (const ref of refs) {
        sources.push({
          title: ref.document_name || ref.doc_name || 'Unknown',
          excerpt: ref.content || ref.text || '',
          score: ref.similarity ?? ref.score ?? null,
          documentId: ref.document_id || ref.doc_id || null
        });
      }
    }

    return { answer, sources };
  }

  // ─── Private: HTTP Client ──────────────────────────────────────────

  /**
   * Make an authenticated request to the RAGFlow API
   * @param {string} path - API path (e.g. '/api/v1/datasets')
   * @param {object} [options] - Fetch options
   * @param {boolean} [options.isFormData] - If true, don't set Content-Type (let browser set multipart boundary)
   * @returns {Promise<object>} Parsed JSON response
   */
  async #request(path, options = {}) {
    const url = `${this.#baseUrl}${path}`;
    const { isFormData, ...fetchOptions } = options;

    const headers = {
      'Authorization': `Bearer ${this.#apiKey}`
    };

    if (!isFormData && fetchOptions.body) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutMs = 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: { ...headers, ...fetchOptions.headers },
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`RAGFlow API error ${response.status}: ${errorText}`);
      }

      const json = await response.json();

      // RAGFlow uses code: 0 for success
      if (json.code !== undefined && json.code !== 0) {
        throw new Error(`RAGFlow error (code ${json.code}): ${json.message || 'Unknown error'}`);
      }

      return json;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`RAGFlow request timed out after ${timeoutMs / 1000}s: ${path}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── Private: Helpers ──────────────────────────────────────────────

  /**
   * Throw if provider is not initialized
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('RAGFlowProvider is not initialized. Call initialize() first.');
    }
  }
}
