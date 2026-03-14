import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingProvider } from '../../../scripts/ai/providers/EmbeddingProvider.mjs';

globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`)
  }
};

class TestEmbeddingProvider extends EmbeddingProvider {
  async embed(text, options = {}) {
    this._validateText(text);
    this._validateOptions(options);
    return { embedding: [0.1, 0.2, 0.3], dimensions: 3 };
  }
}

describe('EmbeddingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('abstract guard', () => {
    it('should throw when instantiated directly', () => {
      expect(() => new EmbeddingProvider()).toThrow();
    });

    it('should allow instantiation of subclass', () => {
      expect(() => new TestEmbeddingProvider()).not.toThrow();
    });
  });

  describe('capabilities', () => {
    it('should return embed capability', () => {
      expect(EmbeddingProvider.capabilities).toEqual(['embed']);
    });
  });

  describe('embed()', () => {
    it('should throw NotImplemented on base class method', async () => {
      class IncompleteProvider extends EmbeddingProvider {}
      const provider = new IncompleteProvider();
      await expect(provider.embed('some text')).rejects.toThrow();
    });

    it('should work on concrete subclass', async () => {
      const provider = new TestEmbeddingProvider();
      const result = await provider.embed('hello world');
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], dimensions: 3 });
    });
  });

  describe('_validateText()', () => {
    it('should accept a non-empty string', () => {
      const provider = new TestEmbeddingProvider();
      expect(() => provider._validateText('some text')).not.toThrow();
    });

    it('should throw for empty string', () => {
      const provider = new TestEmbeddingProvider();
      expect(() => provider._validateText('')).toThrow();
    });

    it('should throw for non-string', () => {
      const provider = new TestEmbeddingProvider();
      expect(() => provider._validateText(42)).toThrow();
    });

    it('should throw for null', () => {
      const provider = new TestEmbeddingProvider();
      expect(() => provider._validateText(null)).toThrow();
    });

    it('should throw for whitespace-only string', () => {
      const provider = new TestEmbeddingProvider();
      expect(() => provider._validateText('   ')).toThrow();
    });
  });

  describe('_validateOptions()', () => {
    it('should accept empty options', () => {
      const provider = new TestEmbeddingProvider();
      expect(() => provider._validateOptions({})).not.toThrow();
    });

    it('should throw if abortSignal is invalid', () => {
      const provider = new TestEmbeddingProvider();
      expect(() => provider._validateOptions({ abortSignal: 'nope' })).toThrow();
    });
  });

  describe('i18n error messages', () => {
    it('should use i18n for NotImplemented error', async () => {
      class IncompleteProvider extends EmbeddingProvider {}
      const provider = new IncompleteProvider();
      await expect(provider.embed('text')).rejects.toThrow();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Provider.Error.NotImplemented',
        expect.objectContaining({ method: 'embed' })
      );
    });
  });
});
