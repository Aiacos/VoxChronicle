import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Logger
vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

// Mock game and ui objects
globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => key)
  }
};

globalThis.ui = {
  notifications: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
};

import { FallbackChatProvider } from '../../../scripts/ai/providers/FallbackChatProvider.mjs';

// ─── Helpers ───────────────────────────────────────────

function createMockProvider(name, chatFn, chatStreamFn) {
  return {
    name,
    chat: chatFn || vi.fn().mockResolvedValue({ content: `response from ${name}`, usage: { total_tokens: 10 } }),
    chatStream: chatStreamFn || vi.fn(async function* () {
      yield { token: 'hello', done: false };
      yield { token: '', done: true };
    })
  };
}

function createMockRegistry(providers) {
  return {
    getProvidersForCapability: vi.fn().mockReturnValue(
      providers.map((p) => ({ name: p.name, provider: p }))
    )
  };
}

function createErrorWithStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ─── Tests ────────────────────────────────────────────

describe('FallbackChatProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Constructor ──────────────────────────────────

  describe('constructor', () => {
    it('throws if no registry provided', () => {
      expect(() => new FallbackChatProvider(null)).toThrow('requires a ProviderRegistry');
    });

    it('creates instance with valid registry', () => {
      const registry = createMockRegistry([]);
      const provider = new FallbackChatProvider(registry);
      expect(provider).toBeInstanceOf(FallbackChatProvider);
    });
  });

  // ─── chat() happy path ────────────────────────────

  describe('chat() - happy path', () => {
    it('returns result from first provider', async () => {
      const primary = createMockProvider('openai');
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from openai');
      expect(primary.chat).toHaveBeenCalledOnce();
      expect(secondary.chat).not.toHaveBeenCalled();
    });

    it('sets lastUsedProvider on success', async () => {
      const primary = createMockProvider('openai');
      const registry = createMockRegistry([primary]);
      const fallback = new FallbackChatProvider(registry);

      await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(fallback.lastUsedProvider).toBe('openai');
    });

    it('lastUsedProvider is null before any call', () => {
      const registry = createMockRegistry([createMockProvider('openai')]);
      const fallback = new FallbackChatProvider(registry);
      expect(fallback.lastUsedProvider).toBeNull();
    });
  });

  // ─── chat() fallback on retryable errors ──────────

  describe('chat() - fallback on retryable errors', () => {
    it('falls back on 500 error', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Internal server error 500', 500))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from anthropic');
      expect(fallback.lastUsedProvider).toBe('anthropic');
    });

    it('falls back on 502 error', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Bad gateway', 502))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from anthropic');
    });

    it('falls back on 429 quota error', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Rate limit exceeded 429', 429))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from anthropic');
      expect(fallback.lastUsedProvider).toBe('anthropic');
    });

    it('falls back on AbortError (timeout)', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(abortError)
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from anthropic');
    });

    it('falls back on network error', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from anthropic');
    });

    it('falls back on unknown error (no status code)', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(new Error('Something went wrong'))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from anthropic');
    });

    it('tries all providers and throws last error when all fail', async () => {
      const error1 = createErrorWithStatus('Server error 500', 500);
      const error2 = createErrorWithStatus('Server error 503', 503);
      const primary = createMockProvider('openai', vi.fn().mockRejectedValue(error1));
      const secondary = createMockProvider('anthropic', vi.fn().mockRejectedValue(error2));
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('Server error 503');
    });
  });

  // ─── chat() non-retryable errors ──────────────────

  describe('chat() - non-retryable errors', () => {
    it('throws immediately on 400 Bad Request', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Bad request 400', 400))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('Bad request 400');
      expect(secondary.chat).not.toHaveBeenCalled();
    });

    it('throws immediately on 401 Unauthorized', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Unauthorized 401', 401))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('Unauthorized 401');
      expect(secondary.chat).not.toHaveBeenCalled();
    });

    it('throws immediately on 403 Forbidden', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Forbidden 403', 403))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('Forbidden 403');
      expect(secondary.chat).not.toHaveBeenCalled();
    });

    it('throws immediately on 404 Not Found', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Not found 404', 404))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('Not found 404');
      expect(secondary.chat).not.toHaveBeenCalled();
    });

    it('throws immediately on 422 Unprocessable Entity', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Unprocessable 422', 422))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('Unprocessable 422');
      expect(secondary.chat).not.toHaveBeenCalled();
    });

    it('detects status code from error message when error.status is not set', async () => {
      const error = new Error('API returned 401 unauthorized');
      const primary = createMockProvider('openai', vi.fn().mockRejectedValue(error));
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('401 unauthorized');
      expect(secondary.chat).not.toHaveBeenCalled();
    });
  });

  // ─── chat() edge cases ────────────────────────────

  describe('chat() - edge cases', () => {
    it('works with a single provider (no fallback needed)', async () => {
      const primary = createMockProvider('openai');
      const registry = createMockRegistry([primary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from openai');
    });

    it('throws when no providers available', async () => {
      const registry = createMockRegistry([]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('No chat providers available');
    });

    it('passes options through to providers', async () => {
      const primary = createMockProvider('openai');
      const registry = createMockRegistry([primary]);
      const fallback = new FallbackChatProvider(registry);
      const options = { model: 'gpt-4o', temperature: 0.7, maxTokens: 1000 };

      await fallback.chat([{ role: 'user', content: 'hello' }], options);

      expect(primary.chat).toHaveBeenCalledWith(
        [{ role: 'user', content: 'hello' }],
        options
      );
    });

    it('passes options through to fallback provider', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Server error 500', 500))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);
      const options = { temperature: 0.5 };

      await fallback.chat([{ role: 'user', content: 'hello' }], options);

      expect(secondary.chat).toHaveBeenCalledWith(
        [{ role: 'user', content: 'hello' }],
        options
      );
    });
  });

  // ─── UI notification ──────────────────────────────

  describe('UI notification', () => {
    it('notifies UI on first fallback', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Server error 500', 500))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(globalThis.ui.notifications.info).toHaveBeenCalledOnce();
      expect(globalThis.game.i18n.localize).toHaveBeenCalledWith(
        'VOXCHRONICLE.Provider.FallbackActivated'
      );
    });

    it('only notifies once across multiple fallbacks', async () => {
      const primary = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Server error 500', 500))
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await fallback.chat([{ role: 'user', content: 'hello' }]);
      await fallback.chat([{ role: 'user', content: 'world' }]);

      expect(globalThis.ui.notifications.info).toHaveBeenCalledOnce();
    });

    it('does not notify when first provider succeeds', async () => {
      const primary = createMockProvider('openai');
      const registry = createMockRegistry([primary]);
      const fallback = new FallbackChatProvider(registry);

      await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(globalThis.ui.notifications.info).not.toHaveBeenCalled();
    });
  });

  // ─── chatStream() ─────────────────────────────────

  describe('chatStream()', () => {
    it('streams from first provider on success', async () => {
      const primary = createMockProvider('openai');
      const registry = createMockRegistry([primary]);
      const fallback = new FallbackChatProvider(registry);

      const tokens = [];
      for await (const chunk of fallback.chatStream([{ role: 'user', content: 'hello' }])) {
        tokens.push(chunk);
      }

      expect(tokens).toHaveLength(2);
      expect(tokens[0].token).toBe('hello');
      expect(fallback.lastUsedProvider).toBe('openai');
    });

    it('falls back to second provider on stream error', async () => {
      const primary = createMockProvider('openai', undefined,
        vi.fn(async function* () {
          throw createErrorWithStatus('Server error 500', 500);
        })
      );
      const secondary = createMockProvider('anthropic', undefined,
        vi.fn(async function* () {
          yield { token: 'fallback', done: false };
          yield { token: '', done: true };
        })
      );
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const tokens = [];
      for await (const chunk of fallback.chatStream([{ role: 'user', content: 'hello' }])) {
        tokens.push(chunk);
      }

      expect(tokens[0].token).toBe('fallback');
      expect(fallback.lastUsedProvider).toBe('anthropic');
    });

    it('throws immediately on non-retryable stream error', async () => {
      const primary = createMockProvider('openai', undefined,
        vi.fn(async function* () {
          throw createErrorWithStatus('Unauthorized 401', 401);
        })
      );
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const tokens = [];
      await expect(async () => {
        for await (const chunk of fallback.chatStream([{ role: 'user', content: 'hello' }])) {
          tokens.push(chunk);
        }
      }).rejects.toThrow('Unauthorized 401');

      expect(secondary.chatStream).not.toHaveBeenCalled();
    });

    it('throws when no providers available for stream', async () => {
      const registry = createMockRegistry([]);
      const fallback = new FallbackChatProvider(registry);

      await expect(async () => {
        for await (const chunk of fallback.chatStream([{ role: 'user', content: 'hello' }])) {
          // should not reach here
        }
      }).rejects.toThrow('No chat providers available');
    });

    it('passes options through to stream providers', async () => {
      const primary = createMockProvider('openai');
      const registry = createMockRegistry([primary]);
      const fallback = new FallbackChatProvider(registry);
      const options = { model: 'gpt-4o', temperature: 0.3 };

      for await (const chunk of fallback.chatStream([{ role: 'user', content: 'hi' }], options)) {
        // consume
      }

      expect(primary.chatStream).toHaveBeenCalledWith(
        [{ role: 'user', content: 'hi' }],
        options
      );
    });
  });

  // ─── Status code extraction ───────────────────────

  describe('status code extraction', () => {
    it('uses error.status property when available', async () => {
      const error = new Error('Something failed');
      error.status = 400;
      const primary = createMockProvider('openai', vi.fn().mockRejectedValue(error));
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'hello' }]))
        .rejects.toThrow('Something failed');
      expect(secondary.chat).not.toHaveBeenCalled();
    });

    it('parses status code from message when error.status is missing', async () => {
      const error = new Error('HTTP error 500: internal server error');
      const primary = createMockProvider('openai', vi.fn().mockRejectedValue(error));
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);
      expect(result.content).toBe('response from anthropic');
    });

    it('treats error.status as authoritative over message parsing', async () => {
      // error.status = 500 (retryable), but message mentions 401
      const error = new Error('Got 401 from proxy');
      error.status = 500;
      const primary = createMockProvider('openai', vi.fn().mockRejectedValue(error));
      const secondary = createMockProvider('anthropic');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);
      expect(result.content).toBe('response from anthropic');
    });
  });

  // ─── Multiple fallbacks ───────────────────────────

  describe('multiple provider chain', () => {
    it('tries third provider when first two fail', async () => {
      const p1 = createMockProvider('openai',
        vi.fn().mockRejectedValue(createErrorWithStatus('Error 500', 500))
      );
      const p2 = createMockProvider('anthropic',
        vi.fn().mockRejectedValue(createErrorWithStatus('Error 503', 503))
      );
      const p3 = createMockProvider('google');
      const registry = createMockRegistry([p1, p2, p3]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'hello' }]);

      expect(result.content).toBe('response from google');
      expect(fallback.lastUsedProvider).toBe('google');
      expect(p1.chat).toHaveBeenCalledOnce();
      expect(p2.chat).toHaveBeenCalledOnce();
      expect(p3.chat).toHaveBeenCalledOnce();
    });
  });
});
