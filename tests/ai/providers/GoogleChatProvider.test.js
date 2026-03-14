import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleChatProvider } from '../../../scripts/ai/providers/GoogleChatProvider.mjs';

vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: { createChild: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }
}));

describe('GoogleChatProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new GoogleChatProvider('google-test-key');
    vi.restoreAllMocks();
  });

  describe('capabilities', () => {
    it('should expose chat and chatStream capabilities', () => {
      expect(GoogleChatProvider.capabilities).toContain('chat');
      expect(GoogleChatProvider.capabilities).toContain('chatStream');
    });
  });

  describe('chat()', () => {
    it('should send messages to Google API and return content', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Hello from Gemini!' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
        })
      });

      const result = await provider.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' }
      ]);

      expect(result.content).toBe('Hello from Gemini!');
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(5);
    });

    it('should convert system message to systemInstruction', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: {}
        })
      });

      await provider.chat([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User msg' }
      ]);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.systemInstruction.parts[0].text).toBe('System prompt');
      expect(body.contents).toHaveLength(1);
      expect(body.contents[0].role).toBe('user');
    });

    it('should convert assistant role to model role', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: {}
        })
      });

      await provider.chat([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'How are you?' }
      ]);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.contents[1].role).toBe('model');
    });

    it('should throw on API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ error: { message: 'Invalid key' } })
      });

      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('Google API error 403');
    });

    it('should include API key in URL', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: {}
        })
      });

      await provider.chat([{ role: 'user', content: 'test' }]);

      expect(fetch.mock.calls[0][0]).toContain('key=google-test-key');
    });
  });
});
