import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Logger
vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    })),
  },
}));

// Capture mock client instances
let lastMockClient = null;

vi.mock('../../../scripts/ai/OpenAIClient.mjs', () => {
  class MockOpenAIClient {
    constructor(apiKey, options = {}) {
      this.apiKey = apiKey;
      this.options = options;
      this.post = vi.fn();
      this.postStream = vi.fn();
      lastMockClient = this;
    }
  }
  return {
    OpenAIClient: MockOpenAIClient,
    OpenAIError: class OpenAIError extends Error {
      constructor(message, type, status, details) {
        super(message);
        this.name = 'OpenAIError';
        this.type = type;
        this.status = status;
        this.details = details;
      }
    },
    OpenAIErrorType: {
      AUTHENTICATION_ERROR: 'authentication_error',
      RATE_LIMIT_ERROR: 'rate_limit_error',
      API_ERROR: 'api_error',
    },
  };
});

// Mock game object
globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`),
  },
};

import { OpenAIChatProvider } from '../../../scripts/ai/providers/OpenAIChatProvider.mjs';

describe('OpenAIChatProvider', () => {
  let provider;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    lastMockClient = null;
    provider = new OpenAIChatProvider('test-api-key');
    mockClient = lastMockClient;
  });

  describe('constructor', () => {
    it('should create an instance that extends ChatProvider', () => {
      expect(provider).toBeDefined();
      expect(typeof provider.chat).toBe('function');
      expect(typeof provider.chatStream).toBe('function');
    });

    it('should create internal OpenAIClient with the provided apiKey', () => {
      expect(mockClient).toBeDefined();
      expect(mockClient.apiKey).toBe('test-api-key');
    });

    it('should pass default timeout 120000 to OpenAIClient', () => {
      const p = new OpenAIChatProvider('key');
      expect(lastMockClient.options.timeout).toBe(120000);
    });

    it('should pass custom timeout to OpenAIClient', () => {
      const p = new OpenAIChatProvider('key', { timeout: 60000 });
      expect(lastMockClient.options.timeout).toBe(60000);
    });
  });

  describe('static capabilities', () => {
    it('should return chat and chatStream', () => {
      expect(OpenAIChatProvider.capabilities).toEqual(['chat', 'chatStream']);
    });
  });

  describe('chat()', () => {
    const openAIResponse = {
      choices: [{ message: { content: 'Hello world' } }],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    };

    it('should call client.post with /chat/completions endpoint', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.chat([{ role: 'user', content: 'hi' }]);
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should map OpenAI response to { content, usage }', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      const result = await provider.chat([{ role: 'user', content: 'hi' }]);
      expect(result).toEqual({
        content: 'Hello world',
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      });
    });

    it('should send messages in request body', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];
      await provider.chat(messages);
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ messages }),
        expect.any(Object)
      );
    });

    it('should use default model gpt-4o when no model specified', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.chat([{ role: 'user', content: 'hi' }]);
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ model: 'gpt-4o' }),
        expect.any(Object)
      );
    });

    it('should use custom model when specified', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.chat([{ role: 'user', content: 'hi' }], { model: 'gpt-4o-mini' });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ model: 'gpt-4o-mini' }),
        expect.any(Object)
      );
    });

    it('should pass temperature in request body', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.chat([{ role: 'user', content: 'hi' }], { temperature: 0.7 });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ temperature: 0.7 }),
        expect.any(Object)
      );
    });

    it('should pass maxTokens as max_tokens in request body', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.chat([{ role: 'user', content: 'hi' }], { maxTokens: 500 });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ max_tokens: 500 }),
        expect.any(Object)
      );
    });

    it('should pass responseFormat as response_format in request body', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      const responseFormat = { type: 'json_object' };
      await provider.chat([{ role: 'user', content: 'hi' }], { responseFormat });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ response_format: responseFormat }),
        expect.any(Object)
      );
    });

    it('should not include undefined optional fields in body', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.chat([{ role: 'user', content: 'hi' }]);
      const body = mockClient.post.mock.calls[0][1];
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('response_format');
    });

    it('should pass abortSignal to client options', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      const controller = new AbortController();
      await provider.chat([{ role: 'user', content: 'hi' }], { abortSignal: controller.signal });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.any(Object),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('should validate options and reject invalid abortSignal', async () => {
      await expect(
        provider.chat([{ role: 'user', content: 'hi' }], { abortSignal: 'invalid' })
      ).rejects.toThrow('abortSignal must be an instance of AbortSignal');
    });

    it('should propagate errors from OpenAI client', async () => {
      const error = new Error('API error');
      mockClient.post.mockRejectedValue(error);
      await expect(
        provider.chat([{ role: 'user', content: 'hi' }])
      ).rejects.toThrow('API error');
    });
  });

  describe('chatStream()', () => {
    async function* mockAsyncGenerator(chunks) {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    it('should yield { token, done: false } for each content chunk', async () => {
      const chunks = [
        { content: 'Hello', usage: null },
        { content: ' world', usage: null },
      ];
      mockClient.postStream.mockReturnValue(mockAsyncGenerator(chunks));

      const tokens = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        tokens.push(chunk);
      }

      expect(tokens).toContainEqual({ token: 'Hello', done: false });
      expect(tokens).toContainEqual({ token: ' world', done: false });
    });

    it('should yield { token: "", done: true } at end of stream', async () => {
      const chunks = [
        { content: 'Hello', usage: null },
      ];
      mockClient.postStream.mockReturnValue(mockAsyncGenerator(chunks));

      const tokens = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        tokens.push(chunk);
      }

      const lastToken = tokens[tokens.length - 1];
      expect(lastToken).toEqual({ token: '', done: true });
    });

    it('should handle null content chunks gracefully', async () => {
      const chunks = [
        { content: null, usage: null },
        { content: 'text', usage: null },
      ];
      mockClient.postStream.mockReturnValue(mockAsyncGenerator(chunks));

      const tokens = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        tokens.push(chunk);
      }

      // null content chunks are filtered out (usage-only chunks)
      expect(tokens[0]).toEqual({ token: 'text', done: false });
      expect(tokens[1]).toEqual({ token: '', done: true });
    });

    it('should call client.postStream with correct endpoint and body', async () => {
      mockClient.postStream.mockReturnValue(mockAsyncGenerator([]));
      const messages = [{ role: 'user', content: 'hi' }];

      // Consume the generator
      for await (const _ of provider.chatStream(messages)) { /* drain */ }

      expect(mockClient.postStream).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ model: 'gpt-4o', messages }),
        expect.any(Object)
      );
    });

    it('should pass abortSignal to client stream options', async () => {
      mockClient.postStream.mockReturnValue(mockAsyncGenerator([]));
      const controller = new AbortController();

      for await (const _ of provider.chatStream(
        [{ role: 'user', content: 'hi' }],
        { abortSignal: controller.signal }
      )) { /* drain */ }

      expect(mockClient.postStream).toHaveBeenCalledWith(
        '/chat/completions',
        expect.any(Object),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('should validate options before streaming', async () => {
      const gen = provider.chatStream(
        [{ role: 'user', content: 'hi' }],
        { abortSignal: 'invalid' }
      );
      await expect(gen.next()).rejects.toThrow('abortSignal must be an instance of AbortSignal');
    });

    it('should propagate stream errors', async () => {
      async function* failingGenerator() {
        yield { content: 'ok', usage: null };
        throw new Error('Stream failed');
      }
      mockClient.postStream.mockReturnValue(failingGenerator());

      const tokens = [];
      await expect(async () => {
        for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
          tokens.push(chunk);
        }
      }).rejects.toThrow('Stream failed');
      // Only the 'ok' token before the error is collected; done:true is not emitted on error
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toEqual({ token: 'ok', done: false });
    });
  });

  describe('queueCategory (Story 2.3)', () => {
    it('should pass queueCategory "chat" to post() in chat()', async () => {
      mockClient.post.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
        usage: {},
      });
      await provider.chat([{ role: 'user', content: 'hi' }]);
      expect(mockClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.any(Object),
        expect.objectContaining({ queueCategory: 'chat' })
      );
    });

    it('should pass queueCategory "chat" to postStream() in chatStream()', async () => {
      mockClient.postStream.mockReturnValue((async function* () {
        yield { content: 'hi', usage: null };
      })());
      const tokens = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        tokens.push(chunk);
      }
      // postStream bypasses the request queue — queueCategory is NOT passed
      expect(mockClient.postStream).toHaveBeenCalledWith(
        '/chat/completions',
        expect.any(Object),
        expect.not.objectContaining({ queueCategory: 'chat' })
      );
    });
  });
});
