/**
 * ImageGenerationService Unit Tests
 *
 * Tests for the ImageGenerationService class with API mocking.
 * Covers image generation with gpt-image-1, batch operations, URL validation,
 * base64 caching, gallery persistence, and error handling.
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
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  ImageGenerationService,
  ImageModel,
  ImageSize,
  ImageQuality,
  EntityType,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_URL_EXPIRY_MS,
  MAX_GALLERY_SIZE
} from '../../scripts/ai/ImageGenerationService.mjs';
import {
  OpenAIError,
  OpenAIErrorType as _OpenAIErrorType
} from '../../scripts/ai/OpenAIClient.mjs';

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
        b64_json: options.b64_json || null,
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

    // Mock global game object for gallery persistence
    global.game = {
      settings: {
        get: vi.fn().mockRejectedValue(new Error('Setting not registered')),
        set: vi.fn().mockResolvedValue(undefined)
      }
    };

    // Create service instance
    service = new ImageGenerationService('test-api-key-12345');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.game;
  });

  describe('constructor', () => {
    it('should create instance with API key', () => {
      expect(service).toBeInstanceOf(ImageGenerationService);
      expect(service.isConfigured).toBe(true);
    });

    it('should accept configuration options', () => {
      const options = {
        quality: ImageQuality.LOW,
        campaignStyle: 'dark fantasy',
        timeout: 600000
      };

      const customService = new ImageGenerationService('test-key', options);
      expect(customService.getCampaignStyle()).toBe('dark fantasy');
      expect(customService._defaultQuality).toBe(ImageQuality.LOW);
    });

    it('should use default values when no options provided', () => {
      expect(service._defaultQuality).toBe(ImageQuality.HIGH);
      expect(service.getCampaignStyle()).toBe('');
    });

    it('should handle missing API key', () => {
      const noKeyService = new ImageGenerationService('');
      expect(noKeyService.isConfigured).toBe(false);
    });

    it('should initialize image cache', () => {
      expect(service._imageCache).not.toBeNull();
      expect(service._imageCache.size()).toBe(0);
    });

    it('should initialize empty gallery', () => {
      expect(service._gallery).toEqual([]);
      expect(service.getGallery()).toEqual([]);
    });
  });

  describe('generatePortrait', () => {
    it('should send correct request body with gpt-image-1 model', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Mock the caching fetch call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(createMockImageBlob())
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A dwarf warrior');

      // First call is API request, second is caching
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/images/generations');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('gpt-image-1');
      expect(body.n).toBe(1);
    });

    it('should NOT include style or response_format parameters', async () => {
      const mockResponse = createMockImageResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A dwarf warrior');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.style).toBeUndefined();
      expect(body.response_format).toBeUndefined();
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
        quality: ImageQuality.LOW
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.quality).toBe(ImageQuality.LOW);
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

      // Mock the caching fetch call (for _cacheImage)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(createMockImageBlob())
      });

      const result = await service.generatePortrait(EntityType.CHARACTER, 'A warrior');

      expect(result).toHaveProperty('url', 'https://example.com/image.png');
      expect(result).toHaveProperty('revisedPrompt', 'A detailed warrior portrait');
      expect(result).toHaveProperty('entityType', EntityType.CHARACTER);
      expect(result).toHaveProperty('originalDescription', 'A warrior');
      expect(result).toHaveProperty('size', ImageSize.SQUARE);
      expect(result).toHaveProperty('quality', ImageQuality.HIGH);
      expect(result).toHaveProperty('generatedAt');
      expect(result).toHaveProperty('expiresAt');
    });

    it('should include base64 field in result', async () => {
      const mockResponse = createMockImageResponse({
        url: '',
        b64_json: 'iVBORw0KGgoAAAANSUhEUg=='
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.generatePortrait(EntityType.CHARACTER, 'A warrior');

      expect(result).toHaveProperty('base64', 'iVBORw0KGgoAAAANSUhEUg==');
    });

    it('should set correct expiration time', async () => {
      const mockResponse = createMockImageResponse();
      const beforeTime = Date.now();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Mock the caching fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(createMockImageBlob())
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

      // Mock the caching fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(createMockImageBlob())
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

      // Mock the caching fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(createMockImageBlob())
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

      // Mock the caching fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(createMockImageBlob())
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

    it('should attempt to cache image when URL is returned', async () => {
      const mockResponse = createMockImageResponse({
        url: 'https://example.com/image.png'
      });

      // First call: API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Second call: caching the image
      const mockBlob = createMockImageBlob();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob)
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A warrior');

      // fetch should be called twice: once for API, once for caching
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe('https://example.com/image.png');
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        blob: () => Promise.resolve(createMockImageBlob())
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
        quality: ImageQuality.LOW
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.quality).toBe(ImageQuality.LOW);
    });
  });

  describe('generateBatch', () => {
    it('should process multiple requests sequentially', async () => {
      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        blob: () => Promise.resolve(createMockImageBlob())
      });

      const requests = [
        { entityType: EntityType.CHARACTER, description: 'Character 1' },
        { entityType: EntityType.LOCATION, description: 'Location 1' },
        { entityType: EntityType.ITEM, description: 'Item 1' }
      ];

      const results = await service.generateBatch(requests);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should report progress during batch generation', async () => {
      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        blob: () => Promise.resolve(createMockImageBlob())
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
          json: () => Promise.resolve(createMockImageResponse()),
          blob: () => Promise.resolve(createMockImageBlob())
        })
        // Second call for caching first image
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(createMockImageBlob())
        })
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockImageResponse()),
          blob: () => Promise.resolve(createMockImageBlob())
        })
        // Fourth call for caching third image
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(createMockImageBlob())
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

  describe('base64 caching', () => {
    it('should cache image as base64 when _cacheImage is called', async () => {
      const mockBlob = createMockImageBlob();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob)
      });

      const result = await service._cacheImage('https://example.com/image.png', 'test prompt');

      // Should have fetched the URL
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.png');

      // Result should be a string (base64)
      expect(typeof result).toBe('string');
    });

    it('should return null when _cacheImage receives empty URL', async () => {
      const result = await service._cacheImage('', 'test prompt');
      expect(result).toBeNull();
    });

    it('should return null when download fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await service._cacheImage('https://example.com/missing.png', 'test prompt');
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service._cacheImage('https://example.com/image.png', 'test prompt');
      expect(result).toBeNull();
    });

    it('getCachedImage should return null for uncached prompts', () => {
      const result = service.getCachedImage('nonexistent prompt');
      expect(result).toBeNull();
    });

    it('getImageCache should return CacheManager instance', () => {
      const cache = service.getImageCache();
      expect(cache).not.toBeNull();
      expect(typeof cache.get).toBe('function');
      expect(typeof cache.set).toBe('function');
    });
  });

  describe('gallery persistence', () => {
    it('saveToGallery should add entry to gallery', async () => {
      // Mock settings.get to return empty gallery
      global.game.settings.get.mockResolvedValueOnce([]);

      await service.saveToGallery({
        prompt: 'A test image',
        base64: 'iVBORw0KGgoAAAANSUhEUg==',
        size: ImageSize.SQUARE,
        entityType: EntityType.CHARACTER
      });

      // Should have called settings.set with the gallery
      expect(global.game.settings.set).toHaveBeenCalledWith(
        'vox-chronicle',
        'imageGallery',
        expect.arrayContaining([
          expect.objectContaining({
            prompt: 'A test image',
            base64: 'iVBORw0KGgoAAAANSUhEUg==',
            size: ImageSize.SQUARE,
            entityType: EntityType.CHARACTER
          })
        ])
      );
    });

    it('saveToGallery should generate ID if not provided', async () => {
      global.game.settings.get.mockResolvedValueOnce([]);

      await service.saveToGallery({ prompt: 'A test' });

      const savedGallery = global.game.settings.set.mock.calls[0][2];
      expect(savedGallery[0].id).toBeTruthy();
      expect(savedGallery[0].id).toMatch(/^img_/);
    });

    it('saveToGallery should handle settings error gracefully', async () => {
      global.game.settings.get.mockRejectedValueOnce(new Error('Not registered'));

      // Should not throw
      await service.saveToGallery({ prompt: 'A test' });
    });

    it('loadGallery should return gallery from settings', async () => {
      const mockGallery = [
        { id: 'img_1', prompt: 'Image 1' },
        { id: 'img_2', prompt: 'Image 2' }
      ];
      global.game.settings.get.mockResolvedValueOnce(mockGallery);

      const gallery = await service.loadGallery();

      expect(gallery).toHaveLength(2);
      expect(gallery[0].prompt).toBe('Image 1');
    });

    it('loadGallery should return empty array when setting not available', async () => {
      global.game.settings.get.mockRejectedValueOnce(new Error('Setting not registered'));

      const gallery = await service.loadGallery();

      expect(gallery).toEqual([]);
    });

    it('clearGallery should empty the gallery and persist', async () => {
      service._gallery = [{ id: 'img_1' }];

      await service.clearGallery();

      expect(service._gallery).toEqual([]);
      expect(global.game.settings.set).toHaveBeenCalledWith(
        'vox-chronicle',
        'imageGallery',
        []
      );
    });

    it('getGallery should return a copy of the gallery', () => {
      service._gallery = [{ id: 'img_1' }, { id: 'img_2' }];

      const gallery = service.getGallery();

      expect(gallery).toHaveLength(2);
      // Should be a copy, not the same reference
      expect(gallery).not.toBe(service._gallery);
    });

    it('saveToGallery should enforce MAX_GALLERY_SIZE limit', async () => {
      // Create a gallery that's at the limit
      const existingGallery = Array.from({ length: MAX_GALLERY_SIZE }, (_, i) => ({
        id: `img_${i}`,
        prompt: `Image ${i}`,
        createdAt: i * 1000
      }));
      global.game.settings.get.mockResolvedValueOnce(existingGallery);

      await service.saveToGallery({
        prompt: 'New image',
        createdAt: Date.now()
      });

      const savedGallery = global.game.settings.set.mock.calls[0][2];
      expect(savedGallery.length).toBeLessThanOrEqual(MAX_GALLERY_SIZE);
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
      service.setDefaultQuality(ImageQuality.LOW);

      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });
      // Mock the caching fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(createMockImageBlob())
      });

      await service.generatePortrait(EntityType.CHARACTER, 'A warrior');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.quality).toBe(ImageQuality.LOW);
    });

    it('should ignore invalid quality values', () => {
      service.setDefaultQuality('invalid');
      // Should remain unchanged
      expect(service._defaultQuality).toBe(ImageQuality.HIGH);
    });

    it('should accept new quality values like low and medium', () => {
      service.setDefaultQuality(ImageQuality.LOW);
      expect(service._defaultQuality).toBe('low');

      service.setDefaultQuality(ImageQuality.MEDIUM);
      expect(service._defaultQuality).toBe('medium');

      service.setDefaultQuality(ImageQuality.HIGH);
      expect(service._defaultQuality).toBe('high');
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost for medium square image', () => {
      const estimate = service.estimateCost(ImageQuality.MEDIUM, ImageSize.SQUARE);

      expect(estimate).toEqual({
        quality: ImageQuality.MEDIUM,
        size: ImageSize.SQUARE,
        estimatedCostUSD: 0.04,
        model: ImageModel.GPT_IMAGE_1
      });
    });

    it('should calculate cost for high portrait image', () => {
      const estimate = service.estimateCost(ImageQuality.HIGH, ImageSize.PORTRAIT);

      expect(estimate).toEqual({
        quality: ImageQuality.HIGH,
        size: ImageSize.PORTRAIT,
        estimatedCostUSD: 0.12,
        model: ImageModel.GPT_IMAGE_1
      });
    });

    it('should calculate cost for medium landscape image', () => {
      const estimate = service.estimateCost(ImageQuality.MEDIUM, ImageSize.LANDSCAPE);
      expect(estimate.estimatedCostUSD).toBe(0.08);
    });

    it('should calculate lower cost for square sizes', () => {
      const estimate = service.estimateCost(ImageQuality.MEDIUM, ImageSize.SQUARE);
      expect(estimate.estimatedCostUSD).toBe(0.04);
    });

    it('should calculate cost for low quality', () => {
      const estimate = service.estimateCost(ImageQuality.LOW, ImageSize.SQUARE);
      expect(estimate.estimatedCostUSD).toBe(0.03);
    });

    it('should handle missing parameters with defaults', () => {
      const estimate = service.estimateCost();

      expect(estimate.quality).toBe(ImageQuality.HIGH);
      expect(estimate.size).toBe(ImageSize.SQUARE);
      expect(estimate.estimatedCostUSD).toBe(0.08);
    });

    it('should report gpt-image-1 as the model', () => {
      const estimate = service.estimateCost();
      expect(estimate.model).toBe('gpt-image-1');
    });
  });

  describe('static methods', () => {
    it('getAvailableSizes should return all size options', () => {
      const sizes = ImageGenerationService.getAvailableSizes();

      expect(Array.isArray(sizes)).toBe(true);
      expect(sizes).toHaveLength(3);

      const square = sizes.find((s) => s.id === ImageSize.SQUARE);
      expect(square).toBeDefined();
      expect(square.name).toContain('Square');
      expect(square.aspectRatio).toBe('1:1');

      const portrait = sizes.find((s) => s.id === ImageSize.PORTRAIT);
      expect(portrait).toBeDefined();

      const landscape = sizes.find((s) => s.id === ImageSize.LANDSCAPE);
      expect(landscape).toBeDefined();
    });

    it('getAvailableQualities should return quality list', () => {
      const qualities = ImageGenerationService.getAvailableQualities();

      expect(Array.isArray(qualities)).toBe(true);
      expect(qualities).toHaveLength(4);

      const low = qualities.find((q) => q.id === ImageQuality.LOW);
      expect(low).toBeDefined();
      expect(low.costMultiplier).toBe(0.5);

      const medium = qualities.find((q) => q.id === ImageQuality.MEDIUM);
      expect(medium).toBeDefined();
      expect(medium.costMultiplier).toBe(1);

      const high = qualities.find((q) => q.id === ImageQuality.HIGH);
      expect(high).toBeDefined();
      expect(high.costMultiplier).toBe(2);

      const auto = qualities.find((q) => q.id === ImageQuality.AUTO);
      expect(auto).toBeDefined();
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
    it('should export ImageModel enum with gpt-image-1', () => {
      expect(ImageModel.GPT_IMAGE_1).toBe('gpt-image-1');
    });

    it('should not export deprecated dall-e models', () => {
      expect(ImageModel.DALLE_3).toBeUndefined();
      expect(ImageModel.DALLE_2).toBeUndefined();
    });

    it('should export ImageSize enum with valid gpt-image-1 sizes only', () => {
      expect(ImageSize.SQUARE).toBe('1024x1024');
      expect(ImageSize.PORTRAIT).toBe('1024x1536');
      expect(ImageSize.LANDSCAPE).toBe('1536x1024');
      expect(ImageSize.SMALL).toBeUndefined();
      expect(ImageSize.MEDIUM).toBeUndefined();
      expect(ImageSize.TALL).toBeUndefined();
      expect(ImageSize.WIDE).toBeUndefined();
    });

    it('should export ImageQuality enum with all quality options', () => {
      expect(ImageQuality.LOW).toBe('low');
      expect(ImageQuality.MEDIUM).toBe('medium');
      expect(ImageQuality.HIGH).toBe('high');
      expect(ImageQuality.AUTO).toBe('auto');
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

    it('should export MAX_GALLERY_SIZE constant', () => {
      expect(MAX_GALLERY_SIZE).toBe(50);
    });
  });

  describe('prompt building', () => {
    beforeEach(() => {
      const mockResponse = createMockImageResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        blob: () => Promise.resolve(createMockImageBlob())
      });
    });

    it('should build different prompts for different entity types', async () => {
      await service.generatePortrait(EntityType.CHARACTER, 'Test');
      const characterPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).prompt;

      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockImageResponse()),
        blob: () => Promise.resolve(createMockImageBlob())
      });

      await service.generatePortrait(EntityType.LOCATION, 'Test');
      const locationPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).prompt;

      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockImageResponse()),
        blob: () => Promise.resolve(createMockImageBlob())
      });

      await service.generatePortrait(EntityType.ITEM, 'Test');
      const itemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).prompt;

      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockImageResponse()),
        blob: () => Promise.resolve(createMockImageBlob())
      });

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
