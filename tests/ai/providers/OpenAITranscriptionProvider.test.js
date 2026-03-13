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
      this.postFormData = vi.fn();
      lastMockClient = this;
    }
  }
  return {
    OpenAIClient: MockOpenAIClient,
    OpenAIError: class OpenAIError extends Error {
      constructor(message, type) { super(message); this.type = type; }
    },
    OpenAIErrorType: { API_ERROR: 'api_error' },
  };
});

globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`),
  },
};

// FormData mock for jsdom
globalThis.FormData = class FormData {
  constructor() { this._data = new Map(); }
  append(key, value, filename) { this._data.set(key, { value, filename }); }
  get(key) { return this._data.get(key)?.value; }
  has(key) { return this._data.has(key); }
  entries() { return this._data.entries(); }
};

import { OpenAITranscriptionProvider } from '../../../scripts/ai/providers/OpenAITranscriptionProvider.mjs';

describe('OpenAITranscriptionProvider', () => {
  let provider;
  let mockClient;
  const audioBlob = { size: 1024, type: 'audio/webm', name: 'audio.webm' };

  beforeEach(() => {
    vi.clearAllMocks();
    lastMockClient = null;
    provider = new OpenAITranscriptionProvider('test-api-key');
    mockClient = lastMockClient;
  });

  describe('constructor', () => {
    it('should create an instance extending TranscriptionProvider', () => {
      expect(provider).toBeDefined();
      expect(typeof provider.transcribe).toBe('function');
    });

    it('should create OpenAIClient with 600000ms timeout', () => {
      expect(mockClient.options.timeout).toBe(600000);
    });

    it('should pass custom timeout to OpenAIClient', () => {
      const p = new OpenAITranscriptionProvider('key', { timeout: 300000 });
      expect(lastMockClient.options.timeout).toBe(300000);
    });
  });

  describe('static capabilities', () => {
    it('should return transcribe', () => {
      expect(OpenAITranscriptionProvider.capabilities).toEqual(['transcribe']);
    });
  });

  describe('transcribe()', () => {
    const openAIResponse = {
      text: 'Hello world',
      segments: [{ start: 0, end: 2.5, text: 'Hello world' }],
      language: 'en',
      duration: 2.5,
    };

    it('should call client.postFormData with /audio/transcriptions', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      await provider.transcribe(audioBlob);
      expect(mockClient.postFormData).toHaveBeenCalledWith(
        '/audio/transcriptions',
        expect.any(FormData),
        expect.any(Object)
      );
    });

    it('should map response to { text, segments }', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      const result = await provider.transcribe(audioBlob);
      expect(result).toEqual({
        text: 'Hello world',
        segments: [{ start: 0, end: 2.5, text: 'Hello world' }],
      });
    });

    it('should use default model gpt-4o-transcribe', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      await provider.transcribe(audioBlob);
      const formData = mockClient.postFormData.mock.calls[0][1];
      expect(formData.get('model')).toBe('gpt-4o-transcribe');
    });

    it('should use gpt-4o-transcribe-diarize model when diarize option is true', async () => {
      const diarizedResponse = {
        ...openAIResponse,
        segments: [{ speaker: 'SPEAKER_00', start: 0, end: 2.5, text: 'Hello world' }],
      };
      mockClient.postFormData.mockResolvedValue(diarizedResponse);
      await provider.transcribe(audioBlob, { diarize: true });
      const formData = mockClient.postFormData.mock.calls[0][1];
      expect(formData.get('model')).toBe('gpt-4o-transcribe-diarize');
    });

    it('should set response_format to diarized_json when diarize is true', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      await provider.transcribe(audioBlob, { diarize: true });
      const formData = mockClient.postFormData.mock.calls[0][1];
      expect(formData.get('response_format')).toBe('diarized_json');
    });

    it('should set response_format to verbose_json by default', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      await provider.transcribe(audioBlob);
      const formData = mockClient.postFormData.mock.calls[0][1];
      expect(formData.get('response_format')).toBe('verbose_json');
    });

    it('should include language option in FormData when provided', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      await provider.transcribe(audioBlob, { language: 'it' });
      const formData = mockClient.postFormData.mock.calls[0][1];
      expect(formData.get('language')).toBe('it');
    });

    it('should include prompt in FormData only for non-diarize models', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      await provider.transcribe(audioBlob, { prompt: 'D&D session', diarize: false });
      const formData = mockClient.postFormData.mock.calls[0][1];
      expect(formData.get('prompt')).toBe('D&D session');
    });

    it('should NOT include prompt when diarize is true', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      await provider.transcribe(audioBlob, { prompt: 'D&D session', diarize: true });
      const formData = mockClient.postFormData.mock.calls[0][1];
      expect(formData.has('prompt')).toBe(false);
    });

    it('should append file to FormData', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      await provider.transcribe(audioBlob);
      const formData = mockClient.postFormData.mock.calls[0][1];
      expect(formData.has('file')).toBe(true);
    });

    it('should pass abortSignal to client', async () => {
      mockClient.postFormData.mockResolvedValue(openAIResponse);
      const controller = new AbortController();
      await provider.transcribe(audioBlob, { abortSignal: controller.signal });
      expect(mockClient.postFormData).toHaveBeenCalledWith(
        '/audio/transcriptions',
        expect.any(FormData),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('should validate audioBlob', async () => {
      await expect(provider.transcribe(null)).rejects.toThrow();
    });

    it('should reject empty audioBlob', async () => {
      await expect(
        provider.transcribe({ size: 0, type: 'audio/webm' })
      ).rejects.toThrow('empty');
    });

    it('should validate options', async () => {
      await expect(
        provider.transcribe(audioBlob, { abortSignal: 'invalid' })
      ).rejects.toThrow('abortSignal must be an instance of AbortSignal');
    });

    it('should propagate client errors', async () => {
      mockClient.postFormData.mockRejectedValue(new Error('Transcription failed'));
      await expect(provider.transcribe(audioBlob)).rejects.toThrow('Transcription failed');
    });
  });

  describe('queueCategory (Story 2.3)', () => {
    it('should pass queueCategory "transcription" to postFormData()', async () => {
      mockClient.postFormData.mockResolvedValue({ text: 'hello', segments: [] });
      await provider.transcribe(audioBlob);
      expect(mockClient.postFormData).toHaveBeenCalledWith(
        '/audio/transcriptions',
        expect.any(FormData),
        expect.objectContaining({ queueCategory: 'transcription' })
      );
    });
  });
});
