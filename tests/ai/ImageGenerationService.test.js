/**
 * ImageGenerationService Unit Tests
 *
 * Tests for the ImageGenerationService class with API mocking.
 * Covers image generation, batch operations, URL validation, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing ImageGenerationService
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

// Mock RateLimiter
vi.mock('../../scripts/utils/RateLimiter.mjs', () => ({
  RateLimiter: {
    fromPreset: () => ({
      executeWithRetry: vi.fn((fn) => fn()),
      pause: vi.fn(),
      reset: vi.fn(),
      getStats: vi.fn(() => ({}))
    })
  }
}));

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  ImageGenerationService,
  ImageModel,
  ImageSize,
  ImageQuality,
  ImageStyle,
  EntityType,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_URL_EXPIRY_MS
} from '../../scripts/ai/ImageGenerationService.mjs';
import { OpenAIError, OpenAIErrorType } from '../../scripts/ai/OpenAIClient.mjs';

/**
 * Create a mock API response for image generation
 */
function createMockImageResponse(options = {}) {
  return {
    created: options.created || Date.now(),
    data: [
      {
        url:
          options.url || 'https://oaidalleapiprodscus.blob.core.windows.net/private/test-image.png',
        revised_prompt: options.revisedPrompt || 'A detailed fantasy character portrait'
      }
    ]
  };
}

/**
 * Create a mock image blob for testing
 */
function createMockImageBlob(size = 10240) {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type: 'image/png' });
}

describe('ImageGenerationService', () => {
  let service;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create service instance
    service = new ImageGenerationService('test-api-key-12345');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with API key', () => {
      expect(service).toBeInstanceOf(ImageGenerationService);
      expect(service.isConfigured).toBe(true);
    });

    it('should accept configuration options', () => {
      const options = {
        quality: ImageQuality.HD,
        style: ImageStyle.NATURAL,
        campaignStyle: 'dark fantasy',
        timeout: 600000
      };

      const customService = new ImageGenerationService('test-key', options);
      expect(customService.getCampaignStyle()).toBe('dark fantasy');
      expect(customService._defaultQuality).toBe(ImageQuality.HD);
      expect(customService._defaultStyle).toBe(ImageStyle.NATURAL);
    });

    it('should use default values when no options provided', () => {
      expect(service._defaultQuality).toBe(ImageQuality.STANDARD);
      expect(service._defaultStyle).toBe(ImageStyle.VIVID);
      expect(service.getCampaignStyle()).toBe('');
    });

    it('should handle missing API key', () => {
      const noKeyService = new ImageGenerationService('');
      expect(noKeyService.isConfigured).toBe(false);
    });
  });

  describe('generatePortrait', () => {
    it('should send correct request body to API', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A dwarf warrior');

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/images/generations');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.model).toBe(ImageModel.DALLE_3);
      expect(body.n).toBe(1);
      expect(body.response_format).toBe('url');
    });

    it('should use correct size for character type', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A dwarf warrior');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(ImageSize.SQUARE);
    });

    it('should use correct size for location type', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.LOCATION, 'A dark forest');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(ImageSize.LANDSCAPE);
    });

    it('should include campaign style in prompt when set', async () => {
      const mockResponse = createMockImageResponse();
      service.setCampaignStyle('cyberpunk anime');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A hacker');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.prompt).toContain('cyberpunk anime');
    });

    it('should include additional context in prompt', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A warrior', {
        additionalContext: 'wearing ancient armor'
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.prompt).toContain('wearing ancient armor');
    });

    it('should override default size when provided', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A warrior', {
        size: ImageSize.PORTRAIT
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(ImageSize.PORTRAIT);
    });

    it('should override default quality when provided', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A warrior', {
        quality: ImageQuality.HD
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.quality).toBe(ImageQuality.HD);
    });

    it('should override default style when provided', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A warrior', {
        style: ImageStyle.NATURAL
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.style).toBe(ImageStyle.NATURAL);
    });

    it('should return complete result object', async () => {
      const mockResponse = createMockImageResponse({
        url: 'https://example.com/image.png',
        revisedPrompt: 'A detailed warrior portrait'
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.generatePortrait(EntityType.CHARACTER, 'A warrior');

      expect(result).toHaveProperty('url', 'https://example.com/image.png');
      expect(result).toHaveProperty('revisedPrompt', 'A detailed warrior portrait');
      expect(result).toHaveProperty('entityType', EntityType.CHARACTER);
      expect(result).toHaveProperty('originalDescription', 'A warrior');
      expect(result).toHaveProperty('size', ImageSize.SQUARE);
      expect(result).toHaveProperty('quality', ImageQuality.STANDARD);
      expect(result).toHaveProperty('style', ImageStyle.VIVID);
      expect(result).toHaveProperty('generatedAt');
      expect(result).toHaveProperty('expiresAt');
    });

    it('should set correct expiration time', async () => {
      const mockResponse = createMockImageResponse();
      const beforeTime = Date.now();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.generatePortrait(EntityType.CHARACTER, 'A warrior');

      expect(result.expiresAt).toBeGreaterThan(beforeTime);
      expect(result.expiresAt - result.generatedAt).toBe(IMAGE_URL_EXPIRY_MS);
    });

    it('should throw error for invalid description', async () => {
      await expect(service.generatePortrait(EntityType.CHARACTER, '')).rejects.toThrow(OpenAIError);
      await expect(service.generatePortrait(EntityType.CHARACTER, null)).rejects.toThrow(
        OpenAIError
      );
      await expect(service.generatePortrait(EntityType.CHARACTER, 123)).rejects.toThrow(
        OpenAIError
      );
    });

    it('should handle unknown entity types', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Should default to SCENE for unknown type
      const result = await service.generatePortrait('unknown', 'Something');
      expect(result.entityType).toBe(EntityType.SCENE);
    });

    it('should handle entity type aliases', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // 'npc' should map to CHARACTER
      const result = await service.generatePortrait('npc', 'A guard');
      expect(result.entityType).toBe(EntityType.CHARACTER);
    });

    it('should truncate long prompts to 4000 characters', async () => {
      const mockResponse = createMockImageResponse();
      const longDescription = 'A'.repeat(5000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, longDescription);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.prompt.length).toBeLessThanOrEqual(4000);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key' } })),
        headers: new Headers()
      });

      await expect(service.generatePortrait(EntityType.CHARACTER, 'A warrior')).rejects.toThrow();
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });
    });

    it('generateCharacterPortrait should use CHARACTER type and SQUARE size', async () => {
      await service.generateCharacterPortrait('A dwarf');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(ImageSize.SQUARE);
      expect(body.prompt).toContain('character');
    });

    it('generateLocationImage should use LOCATION type and LANDSCAPE size', async () => {
      await service.generateLocationImage('A forest');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(ImageSize.LANDSCAPE);
      expect(body.prompt).toContain('location');
    });

    it('generateItemImage should use ITEM type and SQUARE size', async () => {
      await service.generateItemImage('A sword');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(ImageSize.SQUARE);
      expect(body.prompt).toContain('item');
    });

    it('generateSceneImage should use SCENE type and LANDSCAPE size', async () => {
      await service.generateSceneImage('A battle');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(ImageSize.LANDSCAPE);
      expect(body.prompt).toContain('scene');
    });

    it('convenience methods should accept custom options', async () => {
      await service.generateCharacterPortrait('A hero', {
        quality: ImageQuality.HD,
        style: ImageStyle.NATURAL
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.quality).toBe(ImageQuality.HD);
      expect(body.style).toBe(ImageStyle.NATURAL);
    });
  });

  describe('generateBatch', () => {
    it('should process multiple requests sequentially', async () => {
      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const requests = [
        { entityType: EntityType.CHARACTER, description: 'Character 1' },
        { entityType: EntityType.LOCATION, description: 'Location 1' },
        { entityType: EntityType.ITEM, description: 'Item 1' }
      ];

      const results = await service.generateBatch(requests);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should report progress during batch generation', async () => {
      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const requests = [
        { entityType: EntityType.CHARACTER, description: 'Character 1' },
        { entityType: EntityType.CHARACTER, description: 'Character 2' }
      ];

      const progressCallback = vi.fn();
      await service.generateBatch(requests, progressCallback);

      // Progress should be called for each item plus completion
      expect(progressCallback).toHaveBeenCalledTimes(3);

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          current: 1,
          total: 2,
          progress: 50,
          status: 'generating'
        })
      );

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          current: 2,
          total: 2,
          progress: 100,
          status: 'complete'
        })
      );
    });

    it('should continue processing after individual failures', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockImageResponse())
        })
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockImageResponse())
        });

      const requests = [
        { entityType: EntityType.CHARACTER, description: 'Character 1' },
        { entityType: EntityType.CHARACTER, description: 'Character 2' },
        { entityType: EntityType.CHARACTER, description: 'Character 3' }
      ];

      const results = await service.generateBatch(requests);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(results[1]).toHaveProperty('error');
    });

    it('should return empty array for empty requests', async () => {
      const results = await service.generateBatch([]);
      expect(results).toEqual([]);
    });

    it('should return empty array for non-array input', async () => {
      const results = await service.generateBatch(null);
      expect(results).toEqual([]);
    });
  });

  describe('downloadImage', () => {
    it('should download image from URL', async () => {
      const mockBlob = createMockImageBlob(10240);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob)
      });

      const blob = await service.downloadImage('https://example.com/image.png');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(10240);
    });

    it('should throw error for empty URL', async () => {
      await expect(service.downloadImage('')).rejects.toThrow(OpenAIError);
      await expect(service.downloadImage(null)).rejects.toThrow(OpenAIError);
    });

    it('should handle download failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(service.downloadImage('https://example.com/missing.png')).rejects.toThrow(
        OpenAIError
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.downloadImage('https://example.com/image.png')).rejects.toThrow(
        OpenAIError
      );
    });
  });

  describe('URL validation', () => {
    it('isUrlValid should return true for non-expired URLs', () => {
      const result = {
        url: 'https://example.com/image.png',
        generatedAt: Date.now(),
        expiresAt: Date.now() + 3600000 // 1 hour from now
      };

      expect(service.isUrlValid(result)).toBe(true);
    });

    it('isUrlValid should return false for expired URLs', () => {
      const result = {
        url: 'https://example.com/image.png',
        generatedAt: Date.now() - 7200000, // 2 hours ago
        expiresAt: Date.now() - 3600000 // 1 hour ago
      };

      expect(service.isUrlValid(result)).toBe(false);
    });

    it('isUrlValid should return false for invalid input', () => {
      expect(service.isUrlValid(null)).toBe(false);
      expect(service.isUrlValid({})).toBe(false);
      expect(service.isUrlValid({ url: 'test' })).toBe(false);
    });

    it('getTimeUntilExpiry should return correct time remaining', () => {
      const result = {
        expiresAt: Date.now() + 1800000 // 30 minutes from now
      };

      const remaining = service.getTimeUntilExpiry(result);
      expect(remaining).toBeGreaterThan(1700000); // About 30 minutes
      expect(remaining).toBeLessThanOrEqual(1800000);
    });

    it('getTimeUntilExpiry should return 0 for expired URLs', () => {
      const result = {
        expiresAt: Date.now() - 1000 // 1 second ago
      };

      expect(service.getTimeUntilExpiry(result)).toBe(0);
    });

    it('getTimeUntilExpiry should return 0 for invalid input', () => {
      expect(service.getTimeUntilExpiry(null)).toBe(0);
      expect(service.getTimeUntilExpiry({})).toBe(0);
    });
  });

  describe('campaign style management', () => {
    it('should set and get campaign style', () => {
      service.setCampaignStyle('dark fantasy');
      expect(service.getCampaignStyle()).toBe('dark fantasy');
    });

    it('should clear campaign style with empty string', () => {
      service.setCampaignStyle('dark fantasy');
      service.setCampaignStyle('');
      expect(service.getCampaignStyle()).toBe('');
    });

    it('should clear campaign style with null', () => {
      service.setCampaignStyle('dark fantasy');
      service.setCampaignStyle(null);
      expect(service.getCampaignStyle()).toBe('');
    });
  });

  describe('default settings', () => {
    it('should set and use default quality', async () => {
      service.setDefaultQuality(ImageQuality.HD);

      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A warrior');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.quality).toBe(ImageQuality.HD);
    });

    it('should ignore invalid quality values', () => {
      service.setDefaultQuality('invalid');
      // Should remain unchanged
      expect(service._defaultQuality).toBe(ImageQuality.STANDARD);
    });

    it('should set and use default style', async () => {
      service.setDefaultStyle(ImageStyle.NATURAL);

      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A warrior');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.style).toBe(ImageStyle.NATURAL);
    });

    it('should ignore invalid style values', () => {
      service.setDefaultStyle('invalid');
      // Should remain unchanged
      expect(service._defaultStyle).toBe(ImageStyle.VIVID);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost for standard square image', () => {
      const estimate = service.estimateCost(ImageQuality.STANDARD, ImageSize.SQUARE);

      expect(estimate).toEqual({
        quality: ImageQuality.STANDARD,
        size: ImageSize.SQUARE,
        estimatedCostUSD: 0.04,
        model: ImageModel.DALLE_3
      });
    });

    it('should calculate cost for HD portrait image', () => {
      const estimate = service.estimateCost(ImageQuality.HD, ImageSize.PORTRAIT);

      expect(estimate).toEqual({
        quality: ImageQuality.HD,
        size: ImageSize.PORTRAIT,
        estimatedCostUSD: 0.12,
        model: ImageModel.DALLE_3
      });
    });

    it('should calculate cost for standard landscape image', () => {
      const estimate = service.estimateCost(ImageQuality.STANDARD, ImageSize.LANDSCAPE);

      expect(estimate.estimatedCostUSD).toBe(0.08);
    });

    it('should handle missing parameters with defaults', () => {
      const estimate = service.estimateCost();

      expect(estimate.quality).toBe(ImageQuality.STANDARD);
      expect(estimate.size).toBe(ImageSize.SQUARE);
      expect(estimate.estimatedCostUSD).toBe(0.04);
    });
  });

  describe('static methods', () => {
    it('getAvailableSizes should return size list', () => {
      const sizes = ImageGenerationService.getAvailableSizes();

      expect(Array.isArray(sizes)).toBe(true);
      expect(sizes).toHaveLength(3);

      const square = sizes.find((s) => s.id === ImageSize.SQUARE);
      expect(square).toBeDefined();
      expect(square.name).toContain('Square');
      expect(square.aspectRatio).toBe('1:1');
    });

    it('getAvailableQualities should return quality list', () => {
      const qualities = ImageGenerationService.getAvailableQualities();

      expect(Array.isArray(qualities)).toBe(true);
      expect(qualities).toHaveLength(2);

      const standard = qualities.find((q) => q.id === ImageQuality.STANDARD);
      expect(standard).toBeDefined();
      expect(standard.costMultiplier).toBe(1);

      const hd = qualities.find((q) => q.id === ImageQuality.HD);
      expect(hd).toBeDefined();
      expect(hd.costMultiplier).toBe(2);
    });

    it('getAvailableStyles should return style list', () => {
      const styles = ImageGenerationService.getAvailableStyles();

      expect(Array.isArray(styles)).toBe(true);
      expect(styles).toHaveLength(2);

      const vivid = styles.find((s) => s.id === ImageStyle.VIVID);
      expect(vivid).toBeDefined();

      const natural = styles.find((s) => s.id === ImageStyle.NATURAL);
      expect(natural).toBeDefined();
    });

    it('getEntityTypes should return entity type list', () => {
      const types = ImageGenerationService.getEntityTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types).toHaveLength(4);

      const character = types.find((t) => t.id === EntityType.CHARACTER);
      expect(character).toBeDefined();
      expect(character.defaultSize).toBe(ImageSize.SQUARE);

      const location = types.find((t) => t.id === EntityType.LOCATION);
      expect(location).toBeDefined();
      expect(location.defaultSize).toBe(ImageSize.LANDSCAPE);
    });
  });

  describe('exported constants', () => {
    it('should export ImageModel enum', () => {
      expect(ImageModel.DALLE_3).toBe('dall-e-3');
      expect(ImageModel.DALLE_2).toBe('dall-e-2');
    });

    it('should export ImageSize enum', () => {
      expect(ImageSize.SQUARE).toBe('1024x1024');
      expect(ImageSize.PORTRAIT).toBe('1024x1792');
      expect(ImageSize.LANDSCAPE).toBe('1792x1024');
    });

    it('should export ImageQuality enum', () => {
      expect(ImageQuality.STANDARD).toBe('standard');
      expect(ImageQuality.HD).toBe('hd');
    });

    it('should export ImageStyle enum', () => {
      expect(ImageStyle.VIVID).toBe('vivid');
      expect(ImageStyle.NATURAL).toBe('natural');
    });

    it('should export EntityType enum', () => {
      expect(EntityType.CHARACTER).toBe('character');
      expect(EntityType.LOCATION).toBe('location');
      expect(EntityType.ITEM).toBe('item');
      expect(EntityType.SCENE).toBe('scene');
    });

    it('should export timeout constant', () => {
      expect(IMAGE_GENERATION_TIMEOUT_MS).toBe(300000);
    });

    it('should export expiry constant', () => {
      expect(IMAGE_URL_EXPIRY_MS).toBe(3600000);
    });
  });

  describe('prompt building', () => {
    beforeEach(() => {
      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });
    });

    it('should build different prompts for different entity types', async () => {
      await service.generatePortrait(EntityType.CHARACTER, 'Test');
      const characterPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).prompt;

      mockFetch.mockClear();
      await service.generatePortrait(EntityType.LOCATION, 'Test');
      const locationPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).prompt;

      mockFetch.mockClear();
      await service.generatePortrait(EntityType.ITEM, 'Test');
      const itemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).prompt;

      mockFetch.mockClear();
      await service.generatePortrait(EntityType.SCENE, 'Test');
      const scenePrompt = JSON.parse(mockFetch.mock.calls[0][1].body).prompt;

      // Each type should have unique prompt keywords
      expect(characterPrompt).toContain('character');
      expect(locationPrompt).toContain('location');
      expect(itemPrompt).toContain('item');
      expect(scenePrompt).toContain('scene');
    });
  });
});
