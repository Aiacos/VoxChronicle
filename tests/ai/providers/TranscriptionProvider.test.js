import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscriptionProvider } from '../../../scripts/ai/providers/TranscriptionProvider.mjs';

globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`)
  }
};

class TestTranscriptionProvider extends TranscriptionProvider {
  async transcribe(audioBlob, options = {}) {
    this._validateAudioBlob(audioBlob);
    this._validateOptions(options);
    return { text: 'hello world', segments: [] };
  }
}

describe('TranscriptionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('abstract guard', () => {
    it('should throw when instantiated directly', () => {
      expect(() => new TranscriptionProvider()).toThrow();
    });

    it('should allow instantiation of subclass', () => {
      expect(() => new TestTranscriptionProvider()).not.toThrow();
    });
  });

  describe('capabilities', () => {
    it('should return transcribe capability', () => {
      expect(TranscriptionProvider.capabilities).toEqual(['transcribe']);
    });
  });

  describe('transcribe()', () => {
    it('should throw NotImplemented on base class method', async () => {
      class IncompleteProvider extends TranscriptionProvider {}
      const provider = new IncompleteProvider();
      await expect(provider.transcribe(new Blob(['audio']))).rejects.toThrow();
    });

    it('should work on concrete subclass with valid blob', async () => {
      const provider = new TestTranscriptionProvider();
      const blob = new Blob(['audio'], { type: 'audio/webm' });
      const result = await provider.transcribe(blob);
      expect(result).toEqual({ text: 'hello world', segments: [] });
    });
  });

  describe('_validateAudioBlob()', () => {
    it('should accept a Blob', () => {
      const provider = new TestTranscriptionProvider();
      expect(() => provider._validateAudioBlob(new Blob(['data']))).not.toThrow();
    });

    it('should accept a blob-like object with size and type', () => {
      const provider = new TestTranscriptionProvider();
      expect(() => provider._validateAudioBlob({ size: 100, type: 'audio/webm' })).not.toThrow();
    });

    it('should throw for null', () => {
      const provider = new TestTranscriptionProvider();
      expect(() => provider._validateAudioBlob(null)).toThrow();
    });

    it('should throw for string', () => {
      const provider = new TestTranscriptionProvider();
      expect(() => provider._validateAudioBlob('not-a-blob')).toThrow();
    });

    it('should throw for object without size', () => {
      const provider = new TestTranscriptionProvider();
      expect(() => provider._validateAudioBlob({ type: 'audio/webm' })).toThrow();
    });

    it('should throw for zero-size blob', () => {
      const provider = new TestTranscriptionProvider();
      expect(() => provider._validateAudioBlob({ size: 0, type: 'audio/webm' })).toThrow();
    });
  });

  describe('_validateOptions()', () => {
    it('should accept empty options', () => {
      const provider = new TestTranscriptionProvider();
      expect(() => provider._validateOptions({})).not.toThrow();
    });

    it('should throw if abortSignal is not an AbortSignal', () => {
      const provider = new TestTranscriptionProvider();
      expect(() => provider._validateOptions({ abortSignal: 'invalid' })).toThrow();
    });
  });

  describe('i18n error messages', () => {
    it('should use i18n for NotImplemented error', async () => {
      class IncompleteProvider extends TranscriptionProvider {}
      const provider = new IncompleteProvider();
      await expect(provider.transcribe(new Blob(['audio']))).rejects.toThrow();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Provider.Error.NotImplemented',
        expect.objectContaining({ method: 'transcribe' })
      );
    });
  });
});
