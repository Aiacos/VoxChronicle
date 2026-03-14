import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatProvider } from '../../../scripts/ai/providers/ChatProvider.mjs';

// Mock game object for i18n
globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`)
  }
};

// Concrete subclass for testing
class TestChatProvider extends ChatProvider {
  async chat(messages, options = {}) {
    this._validateOptions(options);
    return { content: 'test', usage: { tokens: 10 } };
  }

  async *chatStream(messages, options = {}) {
    this._validateOptions(options);
    yield { token: 'hello', done: false };
    yield { token: '', done: true };
  }
}

describe('ChatProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('abstract guard', () => {
    it('should throw when instantiated directly', () => {
      expect(() => new ChatProvider()).toThrow();
    });

    it('should allow instantiation of subclass', () => {
      expect(() => new TestChatProvider()).not.toThrow();
    });
  });

  describe('capabilities', () => {
    it('should return chat and chatStream capabilities', () => {
      expect(ChatProvider.capabilities).toEqual(['chat', 'chatStream']);
    });

    it('should be accessible from subclass', () => {
      expect(TestChatProvider.capabilities).toEqual(['chat', 'chatStream']);
    });
  });

  describe('chat()', () => {
    it('should throw NotImplemented on base class method via subclass that does not override', async () => {
      class IncompleteChatProvider extends ChatProvider {}
      const provider = new IncompleteChatProvider();
      await expect(provider.chat([])).rejects.toThrow();
    });

    it('should work on concrete subclass', async () => {
      const provider = new TestChatProvider();
      const result = await provider.chat([{ role: 'user', content: 'hi' }]);
      expect(result).toEqual({ content: 'test', usage: { tokens: 10 } });
    });
  });

  describe('chatStream()', () => {
    it('should throw NotImplemented on base class method via subclass that does not override', async () => {
      class IncompleteChatProvider extends ChatProvider {}
      const provider = new IncompleteChatProvider();
      const gen = provider.chatStream([]);
      await expect(gen.next()).rejects.toThrow();
    });

    it('should yield tokens on concrete subclass', async () => {
      const provider = new TestChatProvider();
      const tokens = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        tokens.push(chunk);
      }
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toEqual({ token: 'hello', done: false });
      expect(tokens[1]).toEqual({ token: '', done: true });
    });
  });

  describe('_validateOptions()', () => {
    it('should accept empty options', () => {
      const provider = new TestChatProvider();
      expect(() => provider._validateOptions({})).not.toThrow();
    });

    it('should accept valid options', () => {
      const provider = new TestChatProvider();
      const controller = new AbortController();
      expect(() =>
        provider._validateOptions({
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 100,
          abortSignal: controller.signal
        })
      ).not.toThrow();
    });

    it('should throw if abortSignal is not an AbortSignal', () => {
      const provider = new TestChatProvider();
      expect(() => provider._validateOptions({ abortSignal: 'not-a-signal' })).toThrow();
    });
  });

  describe('i18n error messages', () => {
    it('should use i18n for NotImplemented error on chat()', async () => {
      class IncompleteChatProvider extends ChatProvider {}
      const provider = new IncompleteChatProvider();
      await expect(provider.chat([])).rejects.toThrow();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Provider.Error.NotImplemented',
        expect.objectContaining({ method: 'chat' })
      );
    });

    it('should use i18n for NotImplemented error on chatStream()', async () => {
      class IncompleteChatProvider extends ChatProvider {}
      const provider = new IncompleteChatProvider();
      const gen = provider.chatStream([]);
      await expect(gen.next()).rejects.toThrow();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Provider.Error.NotImplemented',
        expect.objectContaining({ method: 'chatStream' })
      );
    });
  });
});
