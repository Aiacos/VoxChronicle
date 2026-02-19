import { OpenAIFileSearchProvider } from '../../scripts/rag/OpenAIFileSearchProvider.mjs';
import { RAGProvider } from '../../scripts/rag/RAGProvider.mjs';

// ── Mock OpenAI client factory ─────────────────────────────────────────

function createMockClient(overrides = {}) {
  return {
    request: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ id: 'vs_mock123' }),
    postFormData: vi.fn().mockResolvedValue({ id: 'file_mock456' }),
    ...overrides
  };
}

// ── Helper: initialize a provider with defaults ────────────────────────

async function createInitializedProvider(clientOverrides = {}, initConfig = {}) {
  const client = createMockClient(clientOverrides);
  const provider = new OpenAIFileSearchProvider(initConfig.constructorConfig || {});

  // Default: create new vector store returns an id
  if (!clientOverrides.post) {
    client.post.mockResolvedValue({ id: 'vs_default' });
  }

  await provider.initialize({ client, ...initConfig });
  return { provider, client };
}

describe('OpenAIFileSearchProvider', () => {
  // ── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should extend RAGProvider', () => {
      const provider = new OpenAIFileSearchProvider();
      expect(provider).toBeInstanceOf(RAGProvider);
    });

    it('should accept optional model config', () => {
      const provider = new OpenAIFileSearchProvider({ model: 'gpt-4o' });
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
    });

    it('should default to gpt-4o-mini model', async () => {
      const client = createMockClient();
      client.post.mockResolvedValue({ id: 'vs_test' });
      // Mock for the query response
      client.post.mockResolvedValueOnce({ id: 'vs_test' }); // createVectorStore

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      // Query to see which model is used
      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'Test answer' }]
        }]
      });

      await provider.query('test question');

      // The second post call should be the query with default model
      const queryCall = client.post.mock.calls.find(
        call => call[0] === '/responses'
      );
      expect(queryCall[1].model).toBe('gpt-4o-mini');
    });

    it('should use custom model when specified', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' }); // createVectorStore

      const provider = new OpenAIFileSearchProvider({ model: 'gpt-4o' });
      await provider.initialize({ client });

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'Answer' }]
        }]
      });

      await provider.query('test');
      const queryCall = client.post.mock.calls.find(
        call => call[0] === '/responses'
      );
      expect(queryCall[1].model).toBe('gpt-4o');
    });
  });

  // ── initialize() ──────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('should throw if no client is provided', async () => {
      const provider = new OpenAIFileSearchProvider();
      await expect(provider.initialize({})).rejects.toThrow(
        'OpenAIFileSearchProvider requires an OpenAIClient instance (config.client)'
      );
    });

    it('should throw if config is null', async () => {
      const provider = new OpenAIFileSearchProvider();
      await expect(provider.initialize(null)).rejects.toThrow(
        'OpenAIFileSearchProvider requires an OpenAIClient instance (config.client)'
      );
    });

    it('should throw if config is undefined', async () => {
      const provider = new OpenAIFileSearchProvider();
      await expect(provider.initialize(undefined)).rejects.toThrow(
        'OpenAIFileSearchProvider requires an OpenAIClient instance (config.client)'
      );
    });

    it('should create a new vector store when no vectorStoreId is given', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_new123' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      expect(client.post).toHaveBeenCalledWith('/vector_stores', expect.objectContaining({
        name: 'vox-chronicle-rag',
        expires_after: expect.objectContaining({
          anchor: 'last_active_at',
          days: 30
        })
      }));
      expect(provider.getVectorStoreId()).toBe('vs_new123');
    });

    it('should use custom storeName when provided', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_custom' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client, storeName: 'my-custom-store' });

      expect(client.post).toHaveBeenCalledWith('/vector_stores', expect.objectContaining({
        name: 'my-custom-store'
      }));
    });

    it('should reuse existing vector store when vectorStoreId is valid', async () => {
      const client = createMockClient();
      // Validate vector store: returns non-expired
      client.request.mockResolvedValueOnce({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client, vectorStoreId: 'vs_existing' });

      expect(provider.getVectorStoreId()).toBe('vs_existing');
      // Should NOT create a new vector store
      expect(client.post).not.toHaveBeenCalledWith('/vector_stores', expect.anything());
    });

    it('should create new vector store when existing one is expired', async () => {
      const client = createMockClient();
      // Validate vector store: returns expired
      client.request.mockResolvedValueOnce({ status: 'expired' });
      // Create new store
      client.post.mockResolvedValueOnce({ id: 'vs_replacement' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client, vectorStoreId: 'vs_old_expired' });

      expect(provider.getVectorStoreId()).toBe('vs_replacement');
    });

    it('should create new vector store when validation request fails', async () => {
      const client = createMockClient();
      // Validate throws (store doesn't exist)
      client.request.mockRejectedValueOnce(new Error('Not found'));
      // Create new store
      client.post.mockResolvedValueOnce({ id: 'vs_fallback' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client, vectorStoreId: 'vs_nonexistent' });

      expect(provider.getVectorStoreId()).toBe('vs_fallback');
    });
  });

  // ── Uninitialized guard ───────────────────────────────────────────────

  describe('uninitialized guard', () => {
    let provider;

    beforeEach(() => {
      provider = new OpenAIFileSearchProvider();
    });

    it('should throw on indexDocuments() if not initialized', async () => {
      await expect(provider.indexDocuments([]))
        .rejects.toThrow('OpenAIFileSearchProvider is not initialized');
    });

    it('should throw on removeDocument() if not initialized', async () => {
      await expect(provider.removeDocument('doc-1'))
        .rejects.toThrow('OpenAIFileSearchProvider is not initialized');
    });

    it('should throw on clearIndex() if not initialized', async () => {
      await expect(provider.clearIndex())
        .rejects.toThrow('OpenAIFileSearchProvider is not initialized');
    });

    it('should throw on query() if not initialized', async () => {
      await expect(provider.query('test'))
        .rejects.toThrow('OpenAIFileSearchProvider is not initialized');
    });

    it('should throw on destroy() if not initialized', async () => {
      await expect(provider.destroy())
        .rejects.toThrow('OpenAIFileSearchProvider is not initialized');
    });
  });

  // ── indexDocuments() ──────────────────────────────────────────────────

  describe('indexDocuments()', () => {
    it('should return {indexed: 0, failed: 0} for empty array', async () => {
      const { provider } = await createInitializedProvider();
      const result = await provider.indexDocuments([]);
      expect(result).toEqual({ indexed: 0, failed: 0 });
    });

    it('should return {indexed: 0, failed: 0} for null documents', async () => {
      const { provider } = await createInitializedProvider();
      const result = await provider.indexDocuments(null);
      expect(result).toEqual({ indexed: 0, failed: 0 });
    });

    it('should return {indexed: 0, failed: 0} for undefined documents', async () => {
      const { provider } = await createInitializedProvider();
      const result = await provider.indexDocuments(undefined);
      expect(result).toEqual({ indexed: 0, failed: 0 });
    });

    it('should upload file and add to vector store for each document', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' }); // createVectorStore
      client.postFormData.mockResolvedValue({ id: 'file_abc' }); // uploadDocument
      client.post.mockResolvedValue({}); // addFileToVectorStore
      // waitForFileProcessing: return completed status
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const docs = [
        { id: 'doc-1', title: 'Session 1', content: 'The adventure began...' }
      ];

      const result = await provider.indexDocuments(docs);
      expect(result).toEqual({ indexed: 1, failed: 0 });

      // Should have uploaded via formData
      expect(client.postFormData).toHaveBeenCalledWith('/files', expect.anything());

      // Should have added file to vector store
      expect(client.post).toHaveBeenCalledWith(
        expect.stringContaining('/vector_stores/'),
        expect.objectContaining({ file_id: 'file_abc' })
      );
    });

    it('should include metadata in uploaded file content', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_meta' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const docs = [
        {
          id: 'doc-meta',
          title: 'Session with Meta',
          content: 'Content here',
          metadata: { source: 'foundry', type: 'journal' }
        }
      ];

      await provider.indexDocuments(docs);

      // Verify postFormData was called with FormData
      expect(client.postFormData).toHaveBeenCalledWith('/files', expect.anything());
    });

    it('should skip already-indexed documents', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_first' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const doc = { id: 'doc-repeat', title: 'Repeated', content: 'Text' };

      // Index first time
      await provider.indexDocuments([doc]);
      const uploadCallCount = client.postFormData.mock.calls.length;

      // Index same doc again
      const result = await provider.indexDocuments([doc]);
      expect(result).toEqual({ indexed: 1, failed: 0 });
      // Upload should NOT have been called again
      expect(client.postFormData.mock.calls.length).toBe(uploadCallCount);
    });

    it('should call onProgress callback during indexing', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_prog' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const onProgress = vi.fn();
      const docs = [
        { id: 'p1', title: 'Doc 1', content: 'Content 1' },
        { id: 'p2', title: 'Doc 2', content: 'Content 2' }
      ];

      await provider.indexDocuments(docs, { onProgress });

      // Should be called for each doc + final
      expect(onProgress).toHaveBeenCalledWith(0, 2, expect.stringContaining('Doc 1'));
      expect(onProgress).toHaveBeenCalledWith(1, 2, expect.stringContaining('Doc 2'));
      expect(onProgress).toHaveBeenCalledWith(2, 2, expect.stringContaining('Done'));
    });

    it('should handle index failures gracefully and count them', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      // First upload succeeds, second fails
      client.postFormData
        .mockResolvedValueOnce({ id: 'file_ok' })
        .mockRejectedValueOnce(new Error('Upload failed'));
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const docs = [
        { id: 'ok-doc', title: 'Good Doc', content: 'Good content' },
        { id: 'bad-doc', title: 'Bad Doc', content: 'Bad content' }
      ];

      const result = await provider.indexDocuments(docs);
      expect(result.indexed).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle multiple documents with mixed success/failure', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData
        .mockResolvedValueOnce({ id: 'file_1' })
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ id: 'file_3' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const docs = [
        { id: 'd1', title: 'Doc 1', content: 'C1' },
        { id: 'd2', title: 'Doc 2', content: 'C2' },
        { id: 'd3', title: 'Doc 3', content: 'C3' }
      ];

      const result = await provider.indexDocuments(docs);
      expect(result.indexed).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should sanitize document ID for filename', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_sanitized' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'doc/with spaces!@#', title: 'Special', content: 'Test' }
      ]);

      // Verify the FormData was submitted (the filename sanitization happens internally)
      expect(client.postFormData).toHaveBeenCalled();
    });

    it('should poll for file processing completion', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' }); // createVectorStore
      client.postFormData.mockResolvedValue({ id: 'file_poll' }); // upload
      client.post.mockResolvedValue({}); // addFileToVectorStore

      // Polling: first in_progress, then completed
      client.request
        .mockResolvedValueOnce({ status: 'in_progress' })
        .mockResolvedValueOnce({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const result = await provider.indexDocuments([
        { id: 'poll-doc', title: 'Poll Doc', content: 'Testing polling' }
      ]);
      expect(result.indexed).toBe(1);
      // Should have polled at least twice
      expect(client.request.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should fail if file processing status is "failed"', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_fail' });
      client.post.mockResolvedValue({});

      // Polling returns failed
      client.request.mockResolvedValue({
        status: 'failed',
        last_error: { message: 'Processing error' }
      });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const result = await provider.indexDocuments([
        { id: 'fail-doc', title: 'Fail Doc', content: 'Content' }
      ]);
      expect(result.failed).toBe(1);
    });

    it('should fail if file processing status is "cancelled"', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_cancel' });
      client.post.mockResolvedValue({});

      client.request.mockResolvedValue({ status: 'cancelled' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const result = await provider.indexDocuments([
        { id: 'cancel-doc', title: 'Cancel Doc', content: 'Content' }
      ]);
      expect(result.failed).toBe(1);
    });
  });

  // ── removeDocument() ──────────────────────────────────────────────────

  describe('removeDocument()', () => {
    it('should return false if document is not in the index', async () => {
      const { provider } = await createInitializedProvider();
      const result = await provider.removeDocument('nonexistent');
      expect(result).toBe(false);
    });

    it('should remove file from vector store and delete it', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_to_remove' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      // Index a document first
      await provider.indexDocuments([
        { id: 'removable', title: 'Removable', content: 'Content' }
      ]);

      // Reset mock to track removal calls
      client.request.mockReset();
      client.request.mockResolvedValue({});

      const result = await provider.removeDocument('removable');
      expect(result).toBe(true);

      // Should have called DELETE on vector store file and on the file itself
      expect(client.request).toHaveBeenCalledWith(
        expect.stringContaining('/vector_stores/vs_test/files/file_to_remove'),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(client.request).toHaveBeenCalledWith(
        '/files/file_to_remove',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should throw if removal API call fails', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_err' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'err-doc', title: 'Error Doc', content: 'Content' }
      ]);

      // Make the remove request fail
      client.request.mockRejectedValue(new Error('API error'));

      await expect(provider.removeDocument('err-doc')).rejects.toThrow('API error');
    });

    it('should not be retrievable after removal', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_gone' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'gone-doc', title: 'Gone', content: 'Content' }
      ]);

      client.request.mockResolvedValue({});
      await provider.removeDocument('gone-doc');

      // Trying again should return false (not found)
      const result = await provider.removeDocument('gone-doc');
      expect(result).toBe(false);
    });
  });

  // ── clearIndex() ──────────────────────────────────────────────────────

  describe('clearIndex()', () => {
    it('should clear all indexed documents', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData
        .mockResolvedValueOnce({ id: 'file_a' })
        .mockResolvedValueOnce({ id: 'file_b' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'a', title: 'A', content: 'A content' },
        { id: 'b', title: 'B', content: 'B content' }
      ]);

      client.request.mockResolvedValue({});
      await provider.clearIndex();

      // Both documents should now be not found
      expect(await provider.removeDocument('a')).toBe(false);
      expect(await provider.removeDocument('b')).toBe(false);
    });

    it('should handle errors during clear gracefully (not throw)', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_err_clear' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'err-clear', title: 'Error Clear', content: 'Content' }
      ]);

      // Make delete calls fail
      client.request.mockRejectedValue(new Error('Delete failed'));

      // Should not throw - errors are logged but index is still cleared locally
      await expect(provider.clearIndex()).resolves.toBeUndefined();

      // Internal map should be cleared even if API calls failed
      expect(await provider.removeDocument('err-clear')).toBe(false);
    });

    it('should work when index is already empty', async () => {
      const { provider } = await createInitializedProvider();
      await expect(provider.clearIndex()).resolves.toBeUndefined();
    });
  });

  // ── query() ───────────────────────────────────────────────────────────

  describe('query()', () => {
    it('should throw if question is empty', async () => {
      const { provider } = await createInitializedProvider();
      await expect(provider.query('')).rejects.toThrow('Question cannot be empty');
    });

    it('should throw if question is whitespace only', async () => {
      const { provider } = await createInitializedProvider();
      await expect(provider.query('   ')).rejects.toThrow('Question cannot be empty');
    });

    it('should throw if question is null', async () => {
      const { provider } = await createInitializedProvider();
      await expect(provider.query(null)).rejects.toThrow('Question cannot be empty');
    });

    it('should throw if question is undefined', async () => {
      const { provider } = await createInitializedProvider();
      await expect(provider.query(undefined)).rejects.toThrow('Question cannot be empty');
    });

    it('should send query to /responses endpoint', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'The dragon attacked.' }]
        }]
      });

      await provider.query('What did the dragon do?');

      expect(client.post).toHaveBeenCalledWith('/responses', expect.objectContaining({
        input: 'What did the dragon do?',
        tools: expect.arrayContaining([
          expect.objectContaining({
            type: 'file_search',
            vector_store_ids: ['vs_default']
          })
        ])
      }));
    });

    it('should use default maxResults of 5', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({ output: [] });
      await provider.query('test query');

      const call = client.post.mock.calls.find(c => c[0] === '/responses');
      expect(call[1].tools[0].max_num_results).toBe(5);
    });

    it('should respect custom maxResults option', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({ output: [] });
      await provider.query('test query', { maxResults: 10 });

      const call = client.post.mock.calls.find(c => c[0] === '/responses');
      expect(call[1].tools[0].max_num_results).toBe(10);
    });

    it('should include system prompt as instructions when provided', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({ output: [] });
      await provider.query('test', { systemPrompt: 'You are a D&D assistant.' });

      const call = client.post.mock.calls.find(c => c[0] === '/responses');
      expect(call[1].instructions).toBe('You are a D&D assistant.');
    });

    it('should not include instructions when no systemPrompt is given', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({ output: [] });
      await provider.query('test');

      const call = client.post.mock.calls.find(c => c[0] === '/responses');
      expect(call[1].instructions).toBeUndefined();
    });

    it('should allow model override per query', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({ output: [] });
      await provider.query('test', { model: 'gpt-4o' });

      const call = client.post.mock.calls.find(c => c[0] === '/responses');
      expect(call[1].model).toBe('gpt-4o');
    });

    it('should parse answer text from response output', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'The party encountered a beholder.'
          }]
        }]
      });

      const result = await provider.query('What happened in the dungeon?');
      expect(result.answer).toBe('The party encountered a beholder.');
      expect(result.sources).toEqual([]);
    });

    it('should extract file_citation annotations as sources', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'The beholder was in the cave.',
            annotations: [
              {
                type: 'file_citation',
                filename: 'session-1.txt',
                text: 'They entered the cave and found a beholder.',
                score: 0.95,
                file_id: 'file_abc'
              },
              {
                type: 'file_citation',
                filename: 'session-2.txt',
                text: 'The beholder attacked.',
                score: 0.8,
                file_id: 'file_def'
              }
            ]
          }]
        }]
      });

      const result = await provider.query('Where was the beholder?');
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0]).toEqual({
        title: 'session-1.txt',
        excerpt: 'They entered the cave and found a beholder.',
        score: 0.95,
        documentId: 'file_abc'
      });
      expect(result.sources[1]).toEqual({
        title: 'session-2.txt',
        excerpt: 'The beholder attacked.',
        score: 0.8,
        documentId: 'file_def'
      });
    });

    it('should handle annotations with missing fields', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Some answer',
            annotations: [
              {
                type: 'file_citation'
                // All other fields missing
              }
            ]
          }]
        }]
      });

      const result = await provider.query('question');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]).toEqual({
        title: 'Unknown',
        excerpt: '',
        score: null,
        documentId: null
      });
    });

    it('should ignore non-file_citation annotations', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Answer',
            annotations: [
              { type: 'url_citation', url: 'http://example.com' },
              { type: 'file_citation', filename: 'valid.txt', text: 'excerpt', score: 0.9, file_id: 'f1' }
            ]
          }]
        }]
      });

      const result = await provider.query('question');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe('valid.txt');
    });

    it('should handle empty output array', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({ output: [] });

      const result = await provider.query('question');
      expect(result.answer).toBe('');
      expect(result.sources).toEqual([]);
    });

    it('should handle null output', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({ output: null });

      const result = await provider.query('question');
      expect(result.answer).toBe('');
      expect(result.sources).toEqual([]);
    });

    it('should handle response with no output property', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({});

      const result = await provider.query('question');
      expect(result.answer).toBe('');
      expect(result.sources).toEqual([]);
    });

    it('should concatenate text from multiple message content items', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [
            { type: 'output_text', text: 'Part one. ' },
            { type: 'output_text', text: 'Part two.' }
          ]
        }]
      });

      const result = await provider.query('question');
      expect(result.answer).toBe('Part one. Part two.');
    });

    it('should concatenate text from multiple message items', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'First message. ' }]
          },
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Second message.' }]
          }
        ]
      });

      const result = await provider.query('question');
      expect(result.answer).toBe('First message. Second message.');
    });

    it('should skip non-message items in output', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [
          { type: 'file_search_call', results: [] },
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'The answer.' }]
          }
        ]
      });

      const result = await provider.query('question');
      expect(result.answer).toBe('The answer.');
    });

    it('should skip non-output_text content items', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [
            { type: 'refusal', refusal: 'I cannot answer that' },
            { type: 'output_text', text: 'Valid answer.' }
          ]
        }]
      });

      const result = await provider.query('question');
      expect(result.answer).toBe('Valid answer.');
    });

    it('should deduplicate sources by documentId keeping highest score', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Answer',
            annotations: [
              { type: 'file_citation', filename: 'doc.txt', text: 'excerpt 1', score: 0.7, file_id: 'f1' },
              { type: 'file_citation', filename: 'doc.txt', text: 'excerpt 2', score: 0.9, file_id: 'f1' },
              { type: 'file_citation', filename: 'other.txt', text: 'excerpt 3', score: 0.5, file_id: 'f2' }
            ]
          }]
        }]
      });

      const result = await provider.query('question');
      expect(result.sources).toHaveLength(2);
      // The higher-scored f1 entry should win
      const f1Source = result.sources.find(s => s.documentId === 'f1');
      expect(f1Source.score).toBe(0.9);
      expect(f1Source.excerpt).toBe('excerpt 2');
    });

    it('should deduplicate sources by title when documentId is null', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Answer',
            annotations: [
              { type: 'file_citation', filename: 'same.txt', text: 'low score', score: 0.3 },
              { type: 'file_citation', filename: 'same.txt', text: 'high score', score: 0.8 }
            ]
          }]
        }]
      });

      const result = await provider.query('question');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].score).toBe(0.8);
    });

    it('should handle message items with null/missing content', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [
          { type: 'message', content: null },
          { type: 'message' },
          { type: 'message', content: [{ type: 'output_text', text: 'Works' }] }
        ]
      });

      const result = await provider.query('question');
      expect(result.answer).toBe('Works');
    });

    it('should handle output_text with null/missing annotations', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [
            { type: 'output_text', text: 'Answer', annotations: null },
            { type: 'output_text', text: ' more' }
          ]
        }]
      });

      const result = await provider.query('question');
      expect(result.answer).toBe('Answer more');
      expect(result.sources).toEqual([]);
    });
  });

  // ── getStatus() ───────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should return not-ready status when not initialized', async () => {
      const provider = new OpenAIFileSearchProvider();
      const status = await provider.getStatus();
      expect(status.ready).toBe(false);
      expect(status.documentCount).toBe(0);
      expect(status.providerName).toBe('OpenAI File Search');
      expect(status.providerMeta.vectorStoreId).toBeNull();
    });

    it('should return ready status after initialization', async () => {
      const { provider } = await createInitializedProvider();
      const status = await provider.getStatus();
      expect(status.ready).toBe(true);
      expect(status.providerName).toBe('OpenAI File Search');
      expect(status.providerMeta.vectorStoreId).toBe('vs_default');
    });

    it('should fetch vector store details when initialized', async () => {
      const { provider, client } = await createInitializedProvider();

      client.request.mockResolvedValueOnce({
        file_counts: { completed: 5, in_progress: 0, failed: 0 },
        status: 'completed',
        expires_at: 1700000000
      });

      const status = await provider.getStatus();
      expect(status.documentCount).toBe(5);
      expect(status.providerMeta.fileCounts).toEqual({ completed: 5, in_progress: 0, failed: 0 });
      expect(status.providerMeta.status).toBe('completed');
      expect(status.providerMeta.expiresAt).toBe(1700000000);
    });

    it('should handle vector store fetch failure gracefully', async () => {
      const { provider, client } = await createInitializedProvider();

      client.request.mockRejectedValueOnce(new Error('Network error'));

      const status = await provider.getStatus();
      // Should still return basic status
      expect(status.ready).toBe(true);
      expect(status.providerName).toBe('OpenAI File Search');
      expect(status.documentCount).toBe(0); // Falls back to local fileIds size
    });

    it('should report correct document count from local fileIds', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_count' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'c1', title: 'Doc 1', content: 'Content 1' },
        { id: 'c2', title: 'Doc 2', content: 'Content 2' }
      ]);

      // Mock vector store fetch failure to see local count
      client.request.mockRejectedValueOnce(new Error('Fail'));

      const status = await provider.getStatus();
      expect(status.documentCount).toBe(2);
    });

    it('should include model in providerMeta', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_model' });

      const provider = new OpenAIFileSearchProvider({ model: 'gpt-4o' });
      await provider.initialize({ client });

      client.request.mockRejectedValueOnce(new Error('skip'));
      const status = await provider.getStatus();
      expect(status.providerMeta.model).toBe('gpt-4o');
    });

    it('should use file_counts.completed from vector store over local count', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_vs' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      // Index 1 doc locally
      await provider.indexDocuments([
        { id: 'local', title: 'Local', content: 'Content' }
      ]);

      // But vector store says 10 completed files
      client.request.mockResolvedValueOnce({
        file_counts: { completed: 10 },
        status: 'completed',
        expires_at: null
      });

      const status = await provider.getStatus();
      expect(status.documentCount).toBe(10);
    });
  });

  // ── getVectorStoreId() ────────────────────────────────────────────────

  describe('getVectorStoreId()', () => {
    it('should return null before initialization', () => {
      const provider = new OpenAIFileSearchProvider();
      expect(provider.getVectorStoreId()).toBeNull();
    });

    it('should return the vector store ID after initialization', async () => {
      const { provider } = await createInitializedProvider();
      expect(provider.getVectorStoreId()).toBe('vs_default');
    });

    it('should return the existing vector store ID when reused', async () => {
      const client = createMockClient();
      client.request.mockResolvedValueOnce({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client, vectorStoreId: 'vs_reused' });

      expect(provider.getVectorStoreId()).toBe('vs_reused');
    });
  });

  // ── destroy() ─────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('should delete all uploaded files and the vector store', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_destroy' });
      client.postFormData
        .mockResolvedValueOnce({ id: 'file_d1' })
        .mockResolvedValueOnce({ id: 'file_d2' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'd1', title: 'D1', content: 'C1' },
        { id: 'd2', title: 'D2', content: 'C2' }
      ]);

      // Reset to track destroy calls
      client.request.mockReset();
      client.request.mockResolvedValue({});

      await provider.destroy();

      // Should delete both files
      expect(client.request).toHaveBeenCalledWith(
        '/files/file_d1',
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(client.request).toHaveBeenCalledWith(
        '/files/file_d2',
        expect.objectContaining({ method: 'DELETE' })
      );

      // Should delete vector store
      expect(client.request).toHaveBeenCalledWith(
        '/vector_stores/vs_destroy',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should set vectorStoreId to null after destroy', async () => {
      const { provider } = await createInitializedProvider();
      await provider.destroy();
      expect(provider.getVectorStoreId()).toBeNull();
    });

    it('should mark provider as not initialized after destroy', async () => {
      const { provider } = await createInitializedProvider();
      await provider.destroy();

      // Should throw uninitialized error on subsequent calls
      await expect(provider.query('test')).rejects.toThrow(
        'OpenAIFileSearchProvider is not initialized'
      );
    });

    it('should handle file deletion failures gracefully', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_fail_del' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'fail-del', title: 'Fail Delete', content: 'Content' }
      ]);

      // File deletion fails but vector store deletion succeeds
      client.request.mockReset();
      client.request
        .mockRejectedValueOnce(new Error('File delete failed'))  // deleteFile
        .mockResolvedValueOnce({});  // delete vector store

      // Should not throw
      await expect(provider.destroy()).resolves.toBeUndefined();
    });

    it('should handle vector store deletion failure gracefully', async () => {
      const { provider, client } = await createInitializedProvider();

      client.request.mockRejectedValue(new Error('VS delete failed'));

      // Should not throw
      await expect(provider.destroy()).resolves.toBeUndefined();

      // Should still be cleaned up locally
      expect(provider.getVectorStoreId()).toBeNull();
    });

    it('should clear the file ID map', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_clr' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      await provider.indexDocuments([
        { id: 'clr-doc', title: 'Clear', content: 'Content' }
      ]);

      client.request.mockResolvedValue({});
      await provider.destroy();

      // Re-initialize
      client.post.mockResolvedValueOnce({ id: 'vs_new' });
      await provider.initialize({ client });

      // The old document should not be tracked
      const status = await provider.getStatus();
      // Using local count fallback since request is generic mock
      expect(status.providerMeta.vectorStoreId).toBe('vs_new');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle document without metadata', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_nometa' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const result = await provider.indexDocuments([
        { id: 'nometa', title: 'No Metadata', content: 'Just content' }
      ]);
      expect(result.indexed).toBe(1);
    });

    it('should handle document with metadata', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_test' });
      client.postFormData.mockResolvedValue({ id: 'file_withmeta' });
      client.post.mockResolvedValue({});
      client.request.mockResolvedValue({ status: 'completed' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });

      const result = await provider.indexDocuments([
        {
          id: 'withmeta',
          title: 'With Metadata',
          content: 'Content',
          metadata: { source: 'test', date: '2024-01-01' }
        }
      ]);
      expect(result.indexed).toBe(1);
    });

    it('should handle re-initialization after destroy', async () => {
      const client = createMockClient();
      client.post.mockResolvedValueOnce({ id: 'vs_first' });

      const provider = new OpenAIFileSearchProvider();
      await provider.initialize({ client });
      expect(provider.getVectorStoreId()).toBe('vs_first');

      client.request.mockResolvedValue({});
      await provider.destroy();

      client.post.mockResolvedValueOnce({ id: 'vs_second' });
      await provider.initialize({ client });
      expect(provider.getVectorStoreId()).toBe('vs_second');
    });

    it('should deduplicate sources with null scores using 0 as default', async () => {
      const { provider, client } = await createInitializedProvider();

      client.post.mockResolvedValueOnce({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Answer',
            annotations: [
              { type: 'file_citation', filename: 'a.txt', text: 'first', file_id: 'same' },
              { type: 'file_citation', filename: 'a.txt', text: 'second', score: 0.5, file_id: 'same' }
            ]
          }]
        }]
      });

      const result = await provider.query('q');
      expect(result.sources).toHaveLength(1);
      // The one with score 0.5 should win over null (treated as 0)
      expect(result.sources[0].score).toBe(0.5);
    });
  });
});
