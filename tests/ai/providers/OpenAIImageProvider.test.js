import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn(),
    })),
  },
}));

let lastMockClient = null;

vi.mock('../../../scripts/ai/OpenAIClient.mjs', () => {
  class MockOpenAIClient {
    constructor(apiKey, options = {}) {
      this.apiKey = apiKey;
      this.options = options;
      this.post = vi.fn();
      lastMockClient = this;
    }
  }
  return {
    OpenAIClient: MockOpenAIClient,
    OpenAIError: class extends Error { constructor(m, t) { super(m); this.type = t; } },
    OpenAIErrorType: { API_ERROR: 'api_error' },
  };
});

globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`),
  },
};

import { OpenAIImageProvider } from '../../../scripts/ai/providers/OpenAIImageProvider.mjs';

describe('OpenAIImageProvider', () => {
  let provider;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    lastMockClient = null;
    provider = new OpenAIImageProvider('test-api-key');
    mockClient = lastMockClient;
  });

  describe('constructor', () => {
    it('should create an instance extending ImageProvider', () => {
      expect(provider).toBeDefined();
      expect(typeof provider.generateImage).toBe('function');
    });

    it('should create OpenAIClient with 300000ms timeout', () => {
      expect(mockClient.options.timeout).toBe(300000);
    });

    it('should pass custom timeout to OpenAIClient', () => {
      new OpenAIImageProvider('key', { timeout: 120000 });
      expect(lastMockClient.options.timeout).toBe(120000);
    });
  });

  describe('static capabilities', () => {
    it('should return generateImage', () => {
      expect(OpenAIImageProvider.capabilities).toEqual(['generateImage']);
    });
  });

  describe('generateImage()', () => {
    const openAIResponse = {
      data: [{ b64_json: 'base64encodedimagedata' }],
    };

    it('should call client.post with /images/generations', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.generateImage('A fantasy castle');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/images/generations',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should map response to { data, format }', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      const result = await provider.generateImage('A fantasy castle');
      expect(result).toEqual({
        data: 'base64encodedimagedata',
        format: 'png',
      });
    });

    it('should use gpt-image-1 model by default', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.generateImage('test');
      const body = mockClient.post.mock.calls[0][1];
      expect(body.model).toBe('gpt-image-1');
    });

    it('should use custom model when specified', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.generateImage('test', { model: 'dall-e-3' });
      const body = mockClient.post.mock.calls[0][1];
      expect(body.model).toBe('dall-e-3');
    });

    it('should use default size 1024x1024', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.generateImage('test');
      const body = mockClient.post.mock.calls[0][1];
      expect(body.size).toBe('1024x1024');
    });

    it('should use custom size when specified', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.generateImage('test', { size: '1536x1024' });
      const body = mockClient.post.mock.calls[0][1];
      expect(body.size).toBe('1536x1024');
    });

    it('should use default quality medium', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.generateImage('test');
      const body = mockClient.post.mock.calls[0][1];
      expect(body.quality).toBe('medium');
    });

    it('should use custom quality when specified', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.generateImage('test', { quality: 'high' });
      const body = mockClient.post.mock.calls[0][1];
      expect(body.quality).toBe('high');
    });

    it('should pass abortSignal to client', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      const controller = new AbortController();
      await provider.generateImage('test', { abortSignal: controller.signal });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/images/generations',
        expect.any(Object),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('should validate prompt is non-empty', async () => {
      await expect(provider.generateImage('')).rejects.toThrow('non-empty');
    });

    it('should reject whitespace-only prompt', async () => {
      await expect(provider.generateImage('   ')).rejects.toThrow('non-empty');
    });

    it('should validate options', async () => {
      await expect(
        provider.generateImage('test', { abortSignal: 'invalid' })
      ).rejects.toThrow('abortSignal must be an instance of AbortSignal');
    });

    it('should always send n: 1', async () => {
      mockClient.post.mockResolvedValue(openAIResponse);
      await provider.generateImage('test');
      const body = mockClient.post.mock.calls[0][1];
      expect(body.n).toBe(1);
    });

    it('should propagate client errors', async () => {
      mockClient.post.mockRejectedValue(new Error('Image generation failed'));
      await expect(provider.generateImage('test')).rejects.toThrow('Image generation failed');
    });
  });
});
