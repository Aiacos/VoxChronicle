import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicChatProvider } from '../../../scripts/ai/providers/AnthropicChatProvider.mjs';

vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
  }
}));

describe('AnthropicChatProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new AnthropicChatProvider('sk-ant-test-key');
    vi.restoreAllMocks();
  });

  describe('capabilities', () => {
    it('should expose chat and chatStream capabilities', () => {
      expect(AnthropicChatProvider.capabilities).toContain('chat');
      expect(AnthropicChatProvider.capabilities).toContain('chatStream');
    });
  });

  describe('chat()', () => {
    it('should send messages to Anthropic API and return content', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ text: 'Hello from Claude!' }],
            usage: { input_tokens: 10, output_tokens: 5 }
          })
      });

      const result = await provider.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' }
      ]);

      expect(result.content).toBe('Hello from Claude!');
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(5);
    });

    it('should separate system message from user messages', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: 'ok' }], usage: {} })
      });

      await provider.chat([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User msg' }
      ]);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.system).toBe('System prompt');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });

    it('should throw on API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: { message: 'Invalid key' } })
      });

      await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'Anthropic API error 401'
      );
    });

    it('should pass model and temperature options', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: 'ok' }], usage: {} })
      });

      await provider.chat([{ role: 'user', content: 'test' }], {
        model: 'claude-opus-4-20250514',
        temperature: 0.3,
        maxTokens: 500
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.model).toBe('claude-opus-4-20250514');
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(500);
    });
  });
});
