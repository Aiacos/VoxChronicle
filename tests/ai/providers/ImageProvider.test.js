import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageProvider } from '../../../scripts/ai/providers/ImageProvider.mjs';

globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`)
  }
};

class TestImageProvider extends ImageProvider {
  async generateImage(prompt, options = {}) {
    this._validatePrompt(prompt);
    this._validateOptions(options);
    return { data: 'base64data', format: 'png' };
  }
}

describe('ImageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('abstract guard', () => {
    it('should throw when instantiated directly', () => {
      expect(() => new ImageProvider()).toThrow();
    });

    it('should allow instantiation of subclass', () => {
      expect(() => new TestImageProvider()).not.toThrow();
    });
  });

  describe('capabilities', () => {
    it('should return generateImage capability', () => {
      expect(ImageProvider.capabilities).toEqual(['generateImage']);
    });
  });

  describe('generateImage()', () => {
    it('should throw NotImplemented on base class method', async () => {
      class IncompleteProvider extends ImageProvider {}
      const provider = new IncompleteProvider();
      await expect(provider.generateImage('a cat')).rejects.toThrow();
    });

    it('should work on concrete subclass', async () => {
      const provider = new TestImageProvider();
      const result = await provider.generateImage('a fantasy castle');
      expect(result).toEqual({ data: 'base64data', format: 'png' });
    });
  });

  describe('_validatePrompt()', () => {
    it('should accept a non-empty string', () => {
      const provider = new TestImageProvider();
      expect(() => provider._validatePrompt('a landscape')).not.toThrow();
    });

    it('should throw for empty string', () => {
      const provider = new TestImageProvider();
      expect(() => provider._validatePrompt('')).toThrow();
    });

    it('should throw for non-string', () => {
      const provider = new TestImageProvider();
      expect(() => provider._validatePrompt(123)).toThrow();
    });

    it('should throw for null', () => {
      const provider = new TestImageProvider();
      expect(() => provider._validatePrompt(null)).toThrow();
    });

    it('should throw for whitespace-only string', () => {
      const provider = new TestImageProvider();
      expect(() => provider._validatePrompt('   ')).toThrow();
    });
  });

  describe('_validateOptions()', () => {
    it('should accept empty options', () => {
      const provider = new TestImageProvider();
      expect(() => provider._validateOptions({})).not.toThrow();
    });

    it('should throw if abortSignal is invalid', () => {
      const provider = new TestImageProvider();
      expect(() => provider._validateOptions({ abortSignal: {} })).toThrow();
    });
  });

  describe('i18n error messages', () => {
    it('should use i18n for NotImplemented error', async () => {
      class IncompleteProvider extends ImageProvider {}
      const provider = new IncompleteProvider();
      await expect(provider.generateImage('test')).rejects.toThrow();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Provider.Error.NotImplemented',
        expect.objectContaining({ method: 'generateImage' })
      );
    });
  });
});
