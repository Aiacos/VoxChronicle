import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MistralChatProvider } from '../../../scripts/ai/providers/MistralChatProvider.mjs';

vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
  }
}));

describe('MistralChatProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new MistralChatProvider('mistral-test-key');
    vi.restoreAllMocks();
  });

  describe('capabilities', () => {
    it('should expose chat and chatStream capabilities', () => {
      expect(MistralChatProvider.capabilities).toContain('chat');
      expect(MistralChatProvider.capabilities).toContain('chatStream');
    });
  });

  describe('chat()', () => {
    it('should send messages to Mistral API and return content', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Hello from Mistral!' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 }
          })
      });

      const result = await provider.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' }
      ]);

      expect(result.content).toBe('Hello from Mistral!');
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(5);
      expect(result.usage.total_tokens).toBe(15);
    });

    it('should keep system messages in the messages array (OpenAI-compatible format)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' } }],
            usage: {}
          })
      });

      await provider.chat([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User msg' }
      ]);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toBe('System prompt');
      expect(body.messages[1].role).toBe('user');
    });

    it('should use correct API endpoint and auth header', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' } }],
            usage: {}
          })
      });

      await provider.chat([{ role: 'user', content: 'test' }]);

      expect(fetch.mock.calls[0][0]).toBe('https://api.mistral.ai/v1/chat/completions');
      expect(fetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer mistral-test-key');
      expect(fetch.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
    });

    it('should throw on API error with Mistral error format', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ message: 'Invalid API key' })
      });

      await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'Mistral API error 401: Invalid API key'
      );
    });

    it('should throw on API error with fallback to statusText', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({})
      });

      await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'Mistral API error 500: Internal Server Error'
      );
    });

    it('should pass model, temperature, and maxTokens options', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' } }],
            usage: {}
          })
      });

      await provider.chat([{ role: 'user', content: 'test' }], {
        model: 'mistral-large-latest',
        temperature: 0.3,
        maxTokens: 500
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.model).toBe('mistral-large-latest');
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(500);
    });

    it('should use default model when none specified', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' } }],
            usage: {}
          })
      });

      await provider.chat([{ role: 'user', content: 'test' }]);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.model).toBe('mistral-small-latest');
    });

    it('should return empty content when response has no choices', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [], usage: {} })
      });

      const result = await provider.chat([{ role: 'user', content: 'test' }]);
      expect(result.content).toBe('');
    });
  });
});
