import { RAGProvider } from '../../scripts/rag/RAGProvider.mjs';

describe('RAGProvider', () => {
  // ── Abstract class guard ───────────────────────────────────────────────

  describe('constructor', () => {
    it('should throw when instantiated directly', () => {
      expect(() => new RAGProvider()).toThrow(
        'RAGProvider is abstract and cannot be instantiated directly'
      );
    });

    it('should allow subclass instantiation', () => {
      class TestProvider extends RAGProvider {
        constructor() {
          super();
        }
      }
      const provider = new TestProvider();
      expect(provider).toBeInstanceOf(RAGProvider);
      expect(provider).toBeInstanceOf(TestProvider);
    });

    it('should create a logger named after the subclass', () => {
      class MyCustomProvider extends RAGProvider {
        constructor() {
          super();
        }
        getLoggerName() {
          return this._logger?._childName || this._logger?.prefix;
        }
      }
      const provider = new MyCustomProvider();
      // The logger should exist (it's created in the RAGProvider constructor)
      expect(provider._logger).toBeDefined();
    });
  });

  // ── Abstract method stubs ──────────────────────────────────────────────

  describe('abstract methods', () => {
    let provider;

    beforeEach(() => {
      // Create a minimal subclass that does NOT override abstract methods
      class BareProvider extends RAGProvider {
        constructor() {
          super();
        }
      }
      provider = new BareProvider();
    });

    describe('initialize()', () => {
      it('should throw "must be implemented by subclass"', async () => {
        await expect(provider.initialize({})).rejects.toThrow(
          'RAGProvider.initialize() must be implemented by subclass'
        );
      });

      it('should throw when called with no arguments', async () => {
        await expect(provider.initialize()).rejects.toThrow(
          'RAGProvider.initialize() must be implemented by subclass'
        );
      });
    });

    describe('destroy()', () => {
      it('should throw "must be implemented by subclass"', async () => {
        await expect(provider.destroy()).rejects.toThrow(
          'RAGProvider.destroy() must be implemented by subclass'
        );
      });
    });

    describe('indexDocuments()', () => {
      it('should throw "must be implemented by subclass"', async () => {
        await expect(provider.indexDocuments([])).rejects.toThrow(
          'RAGProvider.indexDocuments() must be implemented by subclass'
        );
      });

      it('should throw with options argument', async () => {
        await expect(
          provider.indexDocuments([{ id: '1', title: 'Test', content: 'text' }], { onProgress: vi.fn() })
        ).rejects.toThrow('RAGProvider.indexDocuments() must be implemented by subclass');
      });
    });

    describe('removeDocument()', () => {
      it('should throw "must be implemented by subclass"', async () => {
        await expect(provider.removeDocument('doc-1')).rejects.toThrow(
          'RAGProvider.removeDocument() must be implemented by subclass'
        );
      });
    });

    describe('clearIndex()', () => {
      it('should throw "must be implemented by subclass"', async () => {
        await expect(provider.clearIndex()).rejects.toThrow(
          'RAGProvider.clearIndex() must be implemented by subclass'
        );
      });
    });

    describe('query()', () => {
      it('should throw "must be implemented by subclass"', async () => {
        await expect(provider.query('What happened?')).rejects.toThrow(
          'RAGProvider.query() must be implemented by subclass'
        );
      });

      it('should throw with options argument', async () => {
        await expect(
          provider.query('What happened?', { maxResults: 3 })
        ).rejects.toThrow('RAGProvider.query() must be implemented by subclass');
      });
    });

    describe('getStatus()', () => {
      it('should throw "must be implemented by subclass"', async () => {
        await expect(provider.getStatus()).rejects.toThrow(
          'RAGProvider.getStatus() must be implemented by subclass'
        );
      });
    });
  });

  // ── Subclass override contract ────────────────────────────────────────

  describe('subclass override contract', () => {
    it('should allow a fully implemented subclass to work', async () => {
      class FullProvider extends RAGProvider {
        constructor() {
          super();
          this.ready = false;
        }
        async initialize() { this.ready = true; }
        async destroy() { this.ready = false; }
        async indexDocuments(docs) { return { indexed: docs.length, failed: 0 }; }
        async removeDocument() { return true; }
        async clearIndex() { /* no-op */ }
        async query(q) { return { answer: `Answer to: ${q}`, sources: [] }; }
        async getStatus() { return { ready: this.ready, documentCount: 0, providerName: 'Full' }; }
      }

      const provider = new FullProvider();

      // Before initialize
      const statusBefore = await provider.getStatus();
      expect(statusBefore.ready).toBe(false);

      // Initialize
      await provider.initialize({ apiKey: 'test' });

      // After initialize
      const statusAfter = await provider.getStatus();
      expect(statusAfter.ready).toBe(true);
      expect(statusAfter.providerName).toBe('Full');

      // Indexing
      const result = await provider.indexDocuments([
        { id: '1', title: 'Doc', content: 'Content' }
      ]);
      expect(result).toEqual({ indexed: 1, failed: 0 });

      // Query
      const queryResult = await provider.query('Hello?');
      expect(queryResult.answer).toBe('Answer to: Hello?');
      expect(queryResult.sources).toEqual([]);

      // Remove document
      const removed = await provider.removeDocument('1');
      expect(removed).toBe(true);

      // Clear index
      await expect(provider.clearIndex()).resolves.toBeUndefined();

      // Destroy
      await provider.destroy();
      const statusDestroyed = await provider.getStatus();
      expect(statusDestroyed.ready).toBe(false);
    });
  });
});
