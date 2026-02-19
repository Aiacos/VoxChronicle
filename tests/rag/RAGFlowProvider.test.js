import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

import { RAGFlowProvider } from '../../scripts/rag/RAGFlowProvider.mjs';

describe('RAGFlowProvider', () => {
  let provider;
  let mockFetch;

  const BASE_URL = 'http://localhost:9380';
  const API_KEY = 'ragflow-test-key';
  const DATASET_ID = 'ds-123';
  const CHAT_ID = 'chat-456';

  /**
   * Helper to set up fetch mock with a sequence of responses
   */
  function mockFetchResponses(...responses) {
    let callIndex = 0;
    mockFetch.mockImplementation(() => {
      const resp = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
      return Promise.resolve({
        ok: resp.ok !== undefined ? resp.ok : true,
        status: resp.status || 200,
        json: () => Promise.resolve(resp.body || { code: 0 }),
        text: () => Promise.resolve(JSON.stringify(resp.body || { code: 0 }))
      });
    });
  }

  /**
   * Helper to initialize provider with default mocks
   */
  async function initProvider(config = {}) {
    // Mock: create dataset → create chat assistant
    mockFetchResponses(
      { body: { code: 0, data: { id: DATASET_ID } } },  // create dataset
      { body: { code: 0, data: { id: CHAT_ID } } }       // create chat
    );

    await provider.initialize({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      ...config
    });
  }

  beforeEach(() => {
    provider = new RAGFlowProvider();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.fetch;
  });

  // ─── Exports ──────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export RAGFlowProvider class', () => {
      expect(RAGFlowProvider).toBeDefined();
      expect(typeof RAGFlowProvider).toBe('function');
    });

    it('should be a subclass of RAGProvider', () => {
      // It extends RAGProvider which has abstract methods
      expect(provider.initialize).toBeDefined();
      expect(provider.destroy).toBeDefined();
      expect(provider.indexDocuments).toBeDefined();
      expect(provider.removeDocument).toBeDefined();
      expect(provider.clearIndex).toBeDefined();
      expect(provider.query).toBeDefined();
      expect(provider.getStatus).toBeDefined();
    });
  });

  // ─── initialize() ─────────────────────────────────────────────────

  describe('initialize()', () => {
    it('should throw if baseUrl is missing', async () => {
      await expect(provider.initialize({ apiKey: API_KEY }))
        .rejects.toThrow(/baseUrl/);
    });

    it('should throw if apiKey is missing', async () => {
      await expect(provider.initialize({ baseUrl: BASE_URL }))
        .rejects.toThrow(/API key/);
    });

    it('should throw if config is null', async () => {
      await expect(provider.initialize(null))
        .rejects.toThrow(/baseUrl/);
    });

    it('should create dataset and chat assistant on fresh init', async () => {
      await initProvider();

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: create dataset
      const datasetCall = mockFetch.mock.calls[0];
      expect(datasetCall[0]).toBe(`${BASE_URL}/api/v1/datasets`);
      expect(datasetCall[1].method).toBe('POST');
      const datasetBody = JSON.parse(datasetCall[1].body);
      expect(datasetBody.name).toBe('vox-chronicle-rag');

      // Second call: create chat assistant
      const chatCall = mockFetch.mock.calls[1];
      expect(chatCall[0]).toBe(`${BASE_URL}/api/v1/chats`);
      expect(chatCall[1].method).toBe('POST');
      const chatBody = JSON.parse(chatCall[1].body);
      expect(chatBody.dataset_ids).toEqual([DATASET_ID]);
    });

    it('should strip trailing slash from baseUrl', async () => {
      mockFetchResponses(
        { body: { code: 0, data: { id: DATASET_ID } } },
        { body: { code: 0, data: { id: CHAT_ID } } }
      );

      await provider.initialize({
        baseUrl: 'http://localhost:9380///',
        apiKey: API_KEY
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe('http://localhost:9380/api/v1/datasets');
    });

    it('should reuse existing dataset if valid', async () => {
      mockFetchResponses(
        { body: { code: 0, data: [{ id: DATASET_ID }] } },  // validate dataset
        { body: { code: 0, data: { id: CHAT_ID } } }         // create chat
      );

      await provider.initialize({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        datasetId: DATASET_ID
      });

      // First call should be GET to validate dataset, not POST to create
      expect(mockFetch.mock.calls[0][0]).toContain(`datasets?id=${DATASET_ID}`);
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('should create new dataset if existing one is invalid', async () => {
      mockFetchResponses(
        { body: { code: 0, data: [] } },                     // validate dataset: not found
        { body: { code: 0, data: { id: 'new-ds' } } },       // create dataset
        { body: { code: 0, data: { id: CHAT_ID } } }         // create chat
      );

      await provider.initialize({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        datasetId: 'invalid-id'
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should reuse existing chat if valid', async () => {
      mockFetchResponses(
        { body: { code: 0, data: { id: DATASET_ID } } },       // create dataset
        { body: { code: 0, data: [{ id: CHAT_ID }] } }         // validate chat
      );

      await provider.initialize({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        chatId: CHAT_ID
      });

      // Second call should be GET to validate chat
      expect(mockFetch.mock.calls[1][0]).toContain(`chats?id=${CHAT_ID}`);
    });

    it('should include model name in chat creation when specified', async () => {
      mockFetchResponses(
        { body: { code: 0, data: { id: DATASET_ID } } },
        { body: { code: 0, data: { id: CHAT_ID } } }
      );

      await provider.initialize({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        modelName: 'deepseek-chat'
      });

      const chatBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(chatBody.llm).toEqual({ model_name: 'deepseek-chat' });
    });

    it('should use custom dataset name', async () => {
      mockFetchResponses(
        { body: { code: 0, data: { id: DATASET_ID } } },
        { body: { code: 0, data: { id: CHAT_ID } } }
      );

      await provider.initialize({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        datasetName: 'my-custom-dataset'
      });

      const datasetBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(datasetBody.name).toBe('my-custom-dataset');
    });

    it('should throw if dataset creation returns no ID', async () => {
      mockFetchResponses(
        { body: { code: 0, data: {} } }
      );

      await expect(provider.initialize({ baseUrl: BASE_URL, apiKey: API_KEY }))
        .rejects.toThrow(/no ID returned/);
    });

    it('should throw if chat creation returns no ID', async () => {
      mockFetchResponses(
        { body: { code: 0, data: { id: DATASET_ID } } },
        { body: { code: 0, data: {} } }
      );

      await expect(provider.initialize({ baseUrl: BASE_URL, apiKey: API_KEY }))
        .rejects.toThrow(/no ID returned/);
    });

    it('should send Authorization header', async () => {
      await initProvider();

      for (const call of mockFetch.mock.calls) {
        expect(call[1].headers['Authorization']).toBe(`Bearer ${API_KEY}`);
      }
    });
  });

  // ─── destroy() ────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('should return gracefully if not initialized', async () => {
      await expect(provider.destroy()).resolves.toBeUndefined();
    });

    it('should delete chat assistant and dataset', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses(
        { body: { code: 0 } },  // delete chat
        { body: { code: 0 } }   // delete dataset
      );

      await provider.destroy();

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Delete chat
      const chatCall = mockFetch.mock.calls[0];
      expect(chatCall[0]).toBe(`${BASE_URL}/api/v1/chats`);
      expect(chatCall[1].method).toBe('DELETE');
      expect(JSON.parse(chatCall[1].body).ids).toEqual([CHAT_ID]);

      // Delete dataset
      const dsCall = mockFetch.mock.calls[1];
      expect(dsCall[0]).toBe(`${BASE_URL}/api/v1/datasets`);
      expect(dsCall[1].method).toBe('DELETE');
      expect(JSON.parse(dsCall[1].body).ids).toEqual([DATASET_ID]);
    });

    it('should handle chat deletion failure gracefully', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses(
        { ok: false, status: 500, body: { code: 1, message: 'Internal error' } },
        { body: { code: 0 } }
      );

      // Should not throw
      await provider.destroy();
    });

    it('should handle dataset deletion failure gracefully', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses(
        { body: { code: 0 } },
        { ok: false, status: 500, body: { code: 1, message: 'Internal error' } }
      );

      await provider.destroy();
    });

    it('should clear document IDs map', async () => {
      await initProvider();

      const status = await provider.getStatus();
      expect(status.ready).toBe(true);

      mockFetch.mockClear();
      mockFetchResponses(
        { body: { code: 0 } },
        { body: { code: 0 } }
      );

      await provider.destroy();

      // After destroy, should not be initialized
      await expect(provider.query('test')).rejects.toThrow(/not initialized/);
    });
  });

  // ─── indexDocuments() ─────────────────────────────────────────────

  describe('indexDocuments()', () => {
    it('should throw if not initialized', async () => {
      await expect(provider.indexDocuments([])).rejects.toThrow(/not initialized/);
    });

    it('should return zeros for empty array', async () => {
      await initProvider();
      mockFetch.mockClear();

      const result = await provider.indexDocuments([]);
      expect(result).toEqual({ indexed: 0, failed: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return zeros for null input', async () => {
      await initProvider();
      mockFetch.mockClear();

      const result = await provider.indexDocuments(null);
      expect(result).toEqual({ indexed: 0, failed: 0 });
    });

    it('should upload document and trigger parsing', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses(
        { body: { code: 0, data: [{ id: 'doc-1' }] } },   // upload document
        { body: { code: 0 } },                               // trigger parsing
        { body: { code: 0, data: { docs: [{ id: 'doc-1', run: 'DONE' }] } } }  // poll parsing
      );

      const docs = [{
        id: 'test-doc',
        title: 'Test Document',
        content: 'This is test content'
      }];

      const result = await provider.indexDocuments(docs);
      expect(result).toEqual({ indexed: 1, failed: 0 });
    });

    it('should upload document with metadata', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses(
        { body: { code: 0, data: [{ id: 'doc-1' }] } },
        { body: { code: 0 } },
        { body: { code: 0, data: { docs: [{ id: 'doc-1', run: 'DONE' }] } } }
      );

      const docs = [{
        id: 'test-doc',
        title: 'Quest Log',
        content: 'The party defeated the dragon.',
        metadata: { source: 'journal', type: 'quest' }
      }];

      const result = await provider.indexDocuments(docs);
      expect(result).toEqual({ indexed: 1, failed: 0 });

      // Check the upload used FormData
      const uploadCall = mockFetch.mock.calls[0];
      expect(uploadCall[0]).toContain('/documents');
      expect(uploadCall[1].method).toBe('POST');
    });

    it('should skip already indexed documents', async () => {
      await initProvider();
      mockFetch.mockClear();

      // First indexing
      mockFetchResponses(
        { body: { code: 0, data: [{ id: 'doc-1' }] } },
        { body: { code: 0 } },
        { body: { code: 0, data: { docs: [{ id: 'doc-1', run: 'DONE' }] } } }
      );

      const docs = [{ id: 'test-doc', title: 'Test', content: 'Content' }];
      await provider.indexDocuments(docs);

      mockFetch.mockClear();

      // Second indexing of same doc
      const result = await provider.indexDocuments(docs);
      expect(result).toEqual({ indexed: 1, failed: 0 });
      expect(mockFetch).not.toHaveBeenCalled(); // No API calls needed
    });

    it('should handle upload failure for individual documents', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses(
        { ok: false, status: 500, body: { code: 1, message: 'Upload failed' } }
      );

      const docs = [{ id: 'doc-1', title: 'Failing Doc', content: 'Content' }];
      const result = await provider.indexDocuments(docs);
      expect(result).toEqual({ indexed: 0, failed: 1 });
    });

    it('should call onProgress callback', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses(
        { body: { code: 0, data: [{ id: 'doc-1' }] } },
        { body: { code: 0 } },
        { body: { code: 0, data: { docs: [{ id: 'doc-1', run: 'DONE' }] } } }
      );

      const onProgress = vi.fn();
      const docs = [{ id: 'doc-1', title: 'Test', content: 'Content' }];

      await provider.indexDocuments(docs, { onProgress });
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls[0][0]).toBe(0); // current = 0
      expect(onProgress.mock.calls[0][1]).toBe(1); // total = 1
    });

    it('should handle multiple documents', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses(
        { body: { code: 0, data: [{ id: 'rf-1' }] } },   // upload doc 1
        { body: { code: 0, data: [{ id: 'rf-2' }] } },   // upload doc 2
        { body: { code: 0 } },                             // trigger parsing
        { body: { code: 0, data: { docs: [
          { id: 'rf-1', run: 'DONE' },
          { id: 'rf-2', run: 'DONE' }
        ] } } }
      );

      const docs = [
        { id: 'doc-1', title: 'Doc 1', content: 'Content 1' },
        { id: 'doc-2', title: 'Doc 2', content: 'Content 2' }
      ];

      const result = await provider.indexDocuments(docs);
      expect(result).toEqual({ indexed: 2, failed: 0 });
    });
  });

  // ─── removeDocument() ─────────────────────────────────────────────

  describe('removeDocument()', () => {
    it('should throw if not initialized', async () => {
      await expect(provider.removeDocument('id')).rejects.toThrow(/not initialized/);
    });

    it('should return false for non-existent document', async () => {
      await initProvider();
      mockFetch.mockClear();

      const result = await provider.removeDocument('nonexistent');
      expect(result).toBe(false);
    });

    it('should delete document from dataset', async () => {
      await initProvider();
      mockFetch.mockClear();

      // Index a document first
      mockFetchResponses(
        { body: { code: 0, data: [{ id: 'rf-1' }] } },
        { body: { code: 0 } },
        { body: { code: 0, data: { docs: [{ id: 'rf-1', run: 'DONE' }] } } }
      );
      await provider.indexDocuments([{ id: 'doc-1', title: 'Test', content: 'Content' }]);

      mockFetch.mockClear();
      mockFetchResponses({ body: { code: 0 } });

      const result = await provider.removeDocument('doc-1');
      expect(result).toBe(true);

      const deleteCall = mockFetch.mock.calls[0];
      expect(deleteCall[0]).toContain(`/datasets/${DATASET_ID}/documents`);
      expect(deleteCall[1].method).toBe('DELETE');
      expect(JSON.parse(deleteCall[1].body).ids).toEqual(['rf-1']);
    });

    it('should throw on API error', async () => {
      await initProvider();
      mockFetch.mockClear();

      // Index a document first
      mockFetchResponses(
        { body: { code: 0, data: [{ id: 'rf-1' }] } },
        { body: { code: 0 } },
        { body: { code: 0, data: { docs: [{ id: 'rf-1', run: 'DONE' }] } } }
      );
      await provider.indexDocuments([{ id: 'doc-1', title: 'Test', content: 'Content' }]);

      mockFetch.mockClear();
      mockFetchResponses({ ok: false, status: 500, body: { code: 1 } });

      await expect(provider.removeDocument('doc-1')).rejects.toThrow(/RAGFlow API error/);
    });
  });

  // ─── clearIndex() ─────────────────────────────────────────────────

  describe('clearIndex()', () => {
    it('should throw if not initialized', async () => {
      await expect(provider.clearIndex()).rejects.toThrow(/not initialized/);
    });

    it('should handle empty index', async () => {
      await initProvider();
      mockFetch.mockClear();

      await provider.clearIndex();
      // No delete call since no documents
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should delete all indexed documents', async () => {
      await initProvider();
      mockFetch.mockClear();

      // Index two documents
      mockFetchResponses(
        { body: { code: 0, data: [{ id: 'rf-1' }] } },
        { body: { code: 0, data: [{ id: 'rf-2' }] } },
        { body: { code: 0 } },
        { body: { code: 0, data: { docs: [
          { id: 'rf-1', run: 'DONE' },
          { id: 'rf-2', run: 'DONE' }
        ] } } }
      );
      await provider.indexDocuments([
        { id: 'doc-1', title: 'Doc 1', content: 'C1' },
        { id: 'doc-2', title: 'Doc 2', content: 'C2' }
      ]);

      mockFetch.mockClear();
      mockFetchResponses({ body: { code: 0 } });

      await provider.clearIndex();

      const deleteCall = mockFetch.mock.calls[0];
      expect(deleteCall[1].method).toBe('DELETE');
      const body = JSON.parse(deleteCall[1].body);
      expect(body.ids).toHaveLength(2);
      expect(body.ids).toContain('rf-1');
      expect(body.ids).toContain('rf-2');
    });
  });

  // ─── query() ──────────────────────────────────────────────────────

  describe('query()', () => {
    it('should throw if not initialized', async () => {
      await expect(provider.query('test')).rejects.toThrow(/not initialized/);
    });

    it('should throw for empty question', async () => {
      await initProvider();
      await expect(provider.query('')).rejects.toThrow(/empty/);
    });

    it('should throw for whitespace-only question', async () => {
      await initProvider();
      await expect(provider.query('   ')).rejects.toThrow(/empty/);
    });

    it('should throw for null question', async () => {
      await initProvider();
      await expect(provider.query(null)).rejects.toThrow(/empty/);
    });

    it('should call chat completions endpoint', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses({
        body: {
          choices: [{
            message: {
              content: 'The dragon was defeated in session 5.'
            }
          }]
        }
      });

      const result = await provider.query('When was the dragon defeated?');

      expect(result.answer).toBe('The dragon was defeated in session 5.');
      expect(result.sources).toEqual([]);

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe(`${BASE_URL}/api/v1/chats_openai/${CHAT_ID}/chat/completions`);
      expect(call[1].method).toBe('POST');

      const body = JSON.parse(call[1].body);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toBe('When was the dragon defeated?');
      expect(body.stream).toBe(false);
      expect(body.extra_body.reference).toBe(true);
    });

    it('should parse references from response', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses({
        body: {
          choices: [{
            message: { content: 'The dragon lair is in the mountains.' }
          }],
          references: [{
            document_name: 'session-3.txt',
            content: 'The party found the dragon lair in the Frostpeak Mountains.',
            similarity: 0.92,
            document_id: 'doc-abc'
          }]
        }
      });

      const result = await provider.query('Where is the dragon lair?');
      expect(result.answer).toBe('The dragon lair is in the mountains.');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe('session-3.txt');
      expect(result.sources[0].excerpt).toContain('Frostpeak Mountains');
      expect(result.sources[0].score).toBe(0.92);
      expect(result.sources[0].documentId).toBe('doc-abc');
    });

    it('should handle response with multiple references', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses({
        body: {
          choices: [{ message: { content: 'Answer' } }],
          references: [
            { document_name: 'doc1.txt', content: 'Ref 1', similarity: 0.9 },
            { document_name: 'doc2.txt', content: 'Ref 2', similarity: 0.8 }
          ]
        }
      });

      const result = await provider.query('Question?');
      expect(result.sources).toHaveLength(2);
    });

    it('should handle native RAGFlow response format', async () => {
      await initProvider();
      mockFetch.mockClear();

      // Non-OpenAI format: data.answer + data.reference
      mockFetchResponses({
        body: {
          data: {
            answer: 'Native answer',
            reference: [{
              doc_name: 'journal.txt',
              text: 'Some reference text',
              score: 0.85,
              doc_id: 'rf-doc-1'
            }]
          }
        }
      });

      const result = await provider.query('Question?');
      expect(result.answer).toBe('Native answer');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe('journal.txt');
      expect(result.sources[0].excerpt).toBe('Some reference text');
    });

    it('should handle empty response gracefully', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses({ body: {} });

      const result = await provider.query('Question?');
      expect(result.answer).toBe('');
      expect(result.sources).toEqual([]);
    });
  });

  // ─── getStatus() ──────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should return not-ready status when not initialized', async () => {
      const status = await provider.getStatus();
      expect(status.ready).toBe(false);
      expect(status.documentCount).toBe(0);
      expect(status.providerName).toBe('RAGFlow');
    });

    it('should return ready status after initialization', async () => {
      await initProvider();
      mockFetch.mockClear();

      // Mock document list response
      mockFetchResponses({
        body: { code: 0, data: { total: 5 } }
      });

      const status = await provider.getStatus();
      expect(status.ready).toBe(true);
      expect(status.documentCount).toBe(5);
      expect(status.providerName).toBe('RAGFlow');
      expect(status.providerMeta.baseUrl).toBe(BASE_URL);
      expect(status.providerMeta.datasetId).toBe(DATASET_ID);
      expect(status.providerMeta.chatId).toBe(CHAT_ID);
    });

    it('should handle status fetch failure gracefully', async () => {
      await initProvider();
      mockFetch.mockClear();

      mockFetchResponses({
        ok: false, status: 500, body: { code: 1, message: 'Error' }
      });

      const status = await provider.getStatus();
      expect(status.ready).toBe(true);
      expect(status.documentCount).toBe(0); // Falls back to local count
    });
  });

  // ─── getDatasetId() / getChatId() ─────────────────────────────────

  describe('getDatasetId()', () => {
    it('should return null before initialization', () => {
      expect(provider.getDatasetId()).toBeNull();
    });

    it('should return dataset ID after initialization', async () => {
      await initProvider();
      expect(provider.getDatasetId()).toBe(DATASET_ID);
    });
  });

  describe('getChatId()', () => {
    it('should return null before initialization', () => {
      expect(provider.getChatId()).toBeNull();
    });

    it('should return chat ID after initialization', async () => {
      await initProvider();
      expect(provider.getChatId()).toBe(CHAT_ID);
    });
  });

  // ─── HTTP error handling ──────────────────────────────────────────

  describe('HTTP error handling', () => {
    it('should throw on non-ok HTTP response', async () => {
      mockFetchResponses({
        ok: false,
        status: 401,
        body: 'Unauthorized'
      });

      await expect(provider.initialize({ baseUrl: BASE_URL, apiKey: 'bad-key' }))
        .rejects.toThrow(/RAGFlow API error 401/);
    });

    it('should throw on RAGFlow error code', async () => {
      mockFetchResponses({
        body: { code: 102, message: 'Dataset not found' }
      });

      await expect(provider.initialize({ baseUrl: BASE_URL, apiKey: API_KEY }))
        .rejects.toThrow(/RAGFlow error.*102/);
    });
  });
});
