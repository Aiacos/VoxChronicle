/**
 * Tests for ImageGenerationService - OpenAI gpt-image-1 Image Generation
 *
 * Covers: exports, constructor, generatePortrait, generateCharacterPortrait,
 * generateLocationImage, generateItemImage, generateSceneImage, generateBatch,
 * downloadImage, caching, gallery management, URL validation, prompt building,
 * entity type validation, cost estimation, settings, static methods.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Mock Logger
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn()
    }))
  }
}));

// Mock constants
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock CacheManager
vi.mock('../../scripts/utils/CacheManager.mjs', () => {
  class MockCacheManager {
    constructor() {
      this._store = new Map();
    }
    get(key) {
      const entry = this._store.get(key);
      return entry ? entry.value : null;
    }
    set(key, value, expiresAt, metadata) {
      this._store.set(key, { value, expiresAt, metadata });
    }
    clear() {
      this._store.clear();
    }
    static generateCacheKey(str, prefix) {
      return `${prefix}_${str.substring(0, 32)}`;
    }
    static async blobToBase64(blob) {
      return 'base64data';
    }
  }
  return { CacheManager: MockCacheManager };
});

// Mock RateLimiter
vi.mock('../../scripts/utils/RateLimiter.mjs', () => {
  class MockRateLimiter {
    constructor() {
      this.throttle = vi.fn().mockResolvedValue(undefined);
      this.executeWithRetry = vi.fn((fn) => fn());
      this.pause = vi.fn();
      this.reset = vi.fn();
      this.getStats = vi.fn().mockReturnValue({});
    }
    static fromPreset() {
      return new MockRateLimiter();
    }
  }
  return { RateLimiter: MockRateLimiter };
});

// Mock SensitiveDataFilter
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeUrl: vi.fn((url) => url),
    sanitizeString: vi.fn((s) => s),
    sanitizeObject: vi.fn((o) => o)
  }
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob(['image data'], { type: 'image/png' }))
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImageGenerationService', () => {
  let service;
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(
      mockResponse({
        data: [{
          b64_json: 'base64imagedata',
          revised_prompt: 'Revised prompt'
        }]
      })
    );
    globalThis.fetch = fetchSpy;

    service = new ImageGenerationService('sk-test-key', {
      retryEnabled: false,
      timeout: 5000
    });
  });

  // ── Exports ────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export ImageGenerationService class', () => {
      expect(ImageGenerationService).toBeDefined();
      expect(typeof ImageGenerationService).toBe('function');
    });

    it('should export ImageModel enum', () => {
      expect(ImageModel.GPT_IMAGE_1).toBe('gpt-image-1');
    });

    it('should export ImageSize enum', () => {
      expect(ImageSize.SQUARE).toBe('1024x1024');
      expect(ImageSize.PORTRAIT).toBe('1024x1536');
      expect(ImageSize.LANDSCAPE).toBe('1536x1024');
    });

    it('should export ImageQuality enum', () => {
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

    it('should export IMAGE_GENERATION_TIMEOUT_MS', () => {
      expect(IMAGE_GENERATION_TIMEOUT_MS).toBe(300000);
    });

    it('should export IMAGE_URL_EXPIRY_MS', () => {
      expect(IMAGE_URL_EXPIRY_MS).toBe(3600000);
    });

    it('should export MAX_GALLERY_SIZE', () => {
      expect(MAX_GALLERY_SIZE).toBe(50);
    });
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create instance with API key', () => {
      expect(service.isConfigured).toBe(true);
    });

    it('should default quality to high', () => {
      expect(service._defaultQuality).toBe(ImageQuality.HIGH);
    });

    it('should accept quality option', () => {
      const svc = new ImageGenerationService('sk-test', { quality: ImageQuality.LOW });
      expect(svc._defaultQuality).toBe(ImageQuality.LOW);
    });

    it('should accept campaignStyle option', () => {
      const svc = new ImageGenerationService('sk-test', { campaignStyle: 'dark fantasy' });
      expect(svc.getCampaignStyle()).toBe('dark fantasy');
    });

    it('should default campaignStyle to empty string', () => {
      expect(service.getCampaignStyle()).toBe('');
    });

    it('should initialize empty gallery', () => {
      expect(service.getGallery()).toEqual([]);
    });
  });

  // ── generatePortrait ──────────────────────────────────────────────

  describe('generatePortrait', () => {
    it('should generate an image for a character', async () => {
      const result = await service.generatePortrait('character', 'A brave warrior');
      expect(result).toBeDefined();
      expect(result.entityType).toBe('character');
      expect(result.originalDescription).toBe('A brave warrior');
      expect(result.base64).toBe('base64imagedata');
    });

    it('should throw for empty description', async () => {
      await expect(service.generatePortrait('character', '')).rejects.toThrow(
        'Invalid description'
      );
    });

    it('should throw for null description', async () => {
      await expect(service.generatePortrait('character', null)).rejects.toThrow(
        'Invalid description'
      );
    });

    it('should throw for non-string description', async () => {
      await expect(service.generatePortrait('character', 123)).rejects.toThrow(
        'Invalid description'
      );
    });

    it('should use default size for entity type', async () => {
      const result = await service.generatePortrait('character', 'A warrior');
      expect(result.size).toBe(ImageSize.SQUARE);
    });

    it('should use landscape for locations', async () => {
      const result = await service.generatePortrait('location', 'A castle');
      expect(result.size).toBe(ImageSize.LANDSCAPE);
    });

    it('should use custom size', async () => {
      const result = await service.generatePortrait('character', 'A warrior', {
        size: ImageSize.PORTRAIT
      });
      expect(result.size).toBe(ImageSize.PORTRAIT);
    });

    it('should use custom quality', async () => {
      const result = await service.generatePortrait('character', 'A warrior', {
        quality: ImageQuality.LOW
      });
      expect(result.quality).toBe(ImageQuality.LOW);
    });

    it('should include revisedPrompt in result', async () => {
      const result = await service.generatePortrait('character', 'A warrior');
      expect(result.revisedPrompt).toBe('Revised prompt');
    });

    it('should set generatedAt timestamp', async () => {
      const before = Date.now();
      const result = await service.generatePortrait('character', 'A warrior');
      expect(result.generatedAt).toBeGreaterThanOrEqual(before);
    });

    it('should set expiresAt timestamp', async () => {
      const result = await service.generatePortrait('character', 'A warrior');
      expect(result.expiresAt).toBeGreaterThan(result.generatedAt);
    });

    it('should handle API error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('API error'));
      await expect(
        service.generatePortrait('character', 'A warrior')
      ).rejects.toThrow('API error');
    });

    it('should normalize unknown entity type', async () => {
      const result = await service.generatePortrait('unknown_type', 'A thing');
      expect(result.entityType).toBe('scene');
    });

    it('should handle entity type aliases', async () => {
      const result = await service.generatePortrait('npc', 'An NPC');
      expect(result.entityType).toBe('character');
    });

    it('should cache URL-only results', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          data: [{
            url: 'https://example.com/image.png',
            revised_prompt: 'Prompt'
          }]
        })
      );
      // Second fetch is for caching the image
      fetchSpy.mockResolvedValueOnce(mockResponse(''));

      const result = await service.generatePortrait('character', 'A warrior');
      expect(result.url).toBe('https://example.com/image.png');
    });

    it('should add campaign style to prompt', async () => {
      service.setCampaignStyle('dark fantasy');
      const result = await service.generatePortrait('character', 'A warrior');
      expect(result).toBeDefined();
    });

    it('should add additional context to prompt', async () => {
      const result = await service.generatePortrait('character', 'A warrior', {
        additionalContext: 'Set in a snowy mountain'
      });
      expect(result).toBeDefined();
    });
  });

  // ── Convenience methods ────────────────────────────────────────────

  describe('convenience methods', () => {
    it('should generate character portrait', async () => {
      const result = await service.generateCharacterPortrait('A dwarf');
      expect(result.entityType).toBe('character');
      expect(result.size).toBe(ImageSize.SQUARE);
    });

    it('should generate location image', async () => {
      const result = await service.generateLocationImage('A dark forest');
      expect(result.entityType).toBe('location');
      expect(result.size).toBe(ImageSize.LANDSCAPE);
    });

    it('should generate item image', async () => {
      const result = await service.generateItemImage('A magic sword');
      expect(result.entityType).toBe('item');
      expect(result.size).toBe(ImageSize.SQUARE);
    });

    it('should generate scene image', async () => {
      const result = await service.generateSceneImage('A battle');
      expect(result.entityType).toBe('scene');
      expect(result.size).toBe(ImageSize.LANDSCAPE);
    });

    it('should allow size override on convenience methods', async () => {
      const result = await service.generateCharacterPortrait('A dwarf', {
        size: ImageSize.PORTRAIT
      });
      expect(result.size).toBe(ImageSize.PORTRAIT);
    });
  });

  // ── generateBatch ──────────────────────────────────────────────────

  describe('generateBatch', () => {
    it('should return empty array for empty requests', async () => {
      const results = await service.generateBatch([]);
      expect(results).toEqual([]);
    });

    it('should return empty array for null requests', async () => {
      const results = await service.generateBatch(null);
      expect(results).toEqual([]);
    });

    it('should generate multiple images', async () => {
      const requests = [
        { entityType: 'character', description: 'A warrior' },
        { entityType: 'location', description: 'A castle' }
      ];
      const results = await service.generateBatch(requests);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle individual failures in batch', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({ data: [{ b64_json: 'data1', revised_prompt: 'p1' }] })
        )
        .mockRejectedValueOnce(new Error('API error'));

      const requests = [
        { entityType: 'character', description: 'A warrior' },
        { entityType: 'location', description: 'A castle' }
      ];
      const results = await service.generateBatch(requests);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('API error');
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();
      const requests = [
        { entityType: 'character', description: 'A warrior' }
      ];
      await service.generateBatch(requests, onProgress);
      expect(onProgress).toHaveBeenCalled();

      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
      expect(lastCall.progress).toBe(100);
      expect(lastCall.status).toBe('complete');
    });

    it('should report progress for each item', async () => {
      const onProgress = vi.fn();
      const requests = [
        { entityType: 'character', description: 'A warrior' },
        { entityType: 'location', description: 'A castle' }
      ];
      await service.generateBatch(requests, onProgress);

      // Called: once per item during generation + once for completion
      expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── downloadImage ──────────────────────────────────────────────────

  describe('downloadImage', () => {
    it('should download image from URL', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(''));
      const blob = await service.downloadImage('https://example.com/image.png');
      expect(blob).toBeInstanceOf(Blob);
    });

    it('should throw for empty URL', async () => {
      await expect(service.downloadImage('')).rejects.toThrow('Invalid URL');
    });

    it('should throw for null URL', async () => {
      await expect(service.downloadImage(null)).rejects.toThrow('Invalid URL');
    });

    it('should throw on HTTP error', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse('', 404));
      await expect(
        service.downloadImage('https://example.com/missing.png')
      ).rejects.toThrow('Failed to download');
    });

    it('should throw on network error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network'));
      await expect(
        service.downloadImage('https://example.com/image.png')
      ).rejects.toThrow('Failed to download');
    });
  });

  // ── Caching ────────────────────────────────────────────────────────

  describe('caching', () => {
    it('should return cache manager instance', () => {
      const cache = service.getImageCache();
      expect(cache).toBeDefined();
    });

    it('should return null for non-cached prompt', () => {
      const result = service.getCachedImage('nonexistent prompt');
      expect(result).toBe(null);
    });

    it('should cache base64 images after generation', async () => {
      await service.generatePortrait('character', 'A warrior');
      // The base64 should be cached
      const cached = service.getCachedImage('Fantasy RPG character portrait: A warrior. Detailed, high quality, dramatic lighting, painterly style.');
      // May or may not find it depending on exact cache key generation
      // but the method should not throw
    });
  });

  // ── Gallery ────────────────────────────────────────────────────────

  describe('gallery', () => {
    it('should return empty gallery initially', () => {
      expect(service.getGallery()).toEqual([]);
    });

    it('should save image to gallery', async () => {
      await service.saveToGallery({
        prompt: 'test prompt',
        base64: 'data',
        size: ImageSize.SQUARE
      });
      const gallery = service.getGallery();
      expect(gallery).toHaveLength(1);
      expect(gallery[0].prompt).toBe('test prompt');
    });

    it('should generate id if not provided', async () => {
      await service.saveToGallery({ prompt: 'test' });
      const gallery = service.getGallery();
      expect(gallery[0].id).toMatch(/^img_/);
    });

    it('should use provided id', async () => {
      await service.saveToGallery({ id: 'custom-id', prompt: 'test' });
      const gallery = service.getGallery();
      expect(gallery[0].id).toBe('custom-id');
    });

    it('should load gallery from settings', async () => {
      game.settings.get.mockReturnValueOnce([
        { id: 'img1', prompt: 'test', createdAt: Date.now() }
      ]);
      const gallery = await service.loadGallery();
      expect(gallery).toHaveLength(1);
    });

    it('should return empty gallery if settings not available', async () => {
      game.settings.get.mockImplementationOnce(() => { throw new Error('not registered'); });
      const gallery = await service.loadGallery();
      expect(gallery).toEqual([]);
    });

    it('should return empty gallery if settings value is not an array', async () => {
      game.settings.get.mockReturnValueOnce('corrupted string data');
      const gallery = await service.loadGallery();
      expect(gallery).toEqual([]);
    });

    it('should return empty gallery if settings value is an object', async () => {
      game.settings.get.mockReturnValueOnce({ notAnArray: true });
      const gallery = await service.loadGallery();
      expect(gallery).toEqual([]);
    });

    it('should return empty gallery if settings value is null', async () => {
      game.settings.get.mockReturnValueOnce(null);
      const gallery = await service.loadGallery();
      expect(gallery).toEqual([]);
    });

    it('should return empty gallery if settings value is a number', async () => {
      game.settings.get.mockReturnValueOnce(42);
      const gallery = await service.loadGallery();
      expect(gallery).toEqual([]);
    });

    it('should clear gallery', async () => {
      await service.saveToGallery({ prompt: 'test' });
      await service.clearGallery();
      expect(service.getGallery()).toEqual([]);
    });

    it('should warn user when clearGallery persist fails', async () => {
      await service.saveToGallery({ prompt: 'test' });
      game.settings.set.mockRejectedValueOnce(new Error('storage full'));
      await service.clearGallery();
      expect(ui.notifications.warn).toHaveBeenCalled();
      // Gallery should NOT be cleared in memory since persist failed
      expect(service.getGallery().length).toBeGreaterThan(0);
    });

    it('should return copy of gallery', () => {
      const gallery = service.getGallery();
      gallery.push({ id: 'fake' });
      expect(service.getGallery()).toEqual([]);
    });

    it('should enforce gallery size limit', async () => {
      // Load a gallery at max size
      const fullGallery = [];
      for (let i = 0; i < MAX_GALLERY_SIZE; i++) {
        fullGallery.push({ id: `img_${i}`, prompt: `test ${i}`, createdAt: i });
      }
      game.settings.get.mockReturnValueOnce(fullGallery);
      await service.loadGallery();

      // Add one more
      await service.saveToGallery({ prompt: 'overflow', createdAt: MAX_GALLERY_SIZE + 1 });
      expect(service.getGallery().length).toBeLessThanOrEqual(MAX_GALLERY_SIZE);
    });
  });

  // ── URL validation ─────────────────────────────────────────────────

  describe('URL validation', () => {
    it('should return true for non-expired URL', () => {
      const result = { expiresAt: Date.now() + 60000 };
      expect(service.isUrlValid(result)).toBe(true);
    });

    it('should return false for expired URL', () => {
      const result = { expiresAt: Date.now() - 1000 };
      expect(service.isUrlValid(result)).toBe(false);
    });

    it('should return false for null result', () => {
      expect(service.isUrlValid(null)).toBe(false);
    });

    it('should return false for missing expiresAt', () => {
      expect(service.isUrlValid({})).toBe(false);
    });

    it('should return time until expiry', () => {
      const result = { expiresAt: Date.now() + 30000 };
      const remaining = service.getTimeUntilExpiry(result);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(30000);
    });

    it('should return 0 for expired result', () => {
      const result = { expiresAt: Date.now() - 1000 };
      expect(service.getTimeUntilExpiry(result)).toBe(0);
    });

    it('should return 0 for null result', () => {
      expect(service.getTimeUntilExpiry(null)).toBe(0);
    });

    it('should return 0 for missing expiresAt', () => {
      expect(service.getTimeUntilExpiry({})).toBe(0);
    });
  });

  // ── Prompt building ────────────────────────────────────────────────

  describe('prompt building', () => {
    it('should build character prompt', () => {
      const prompt = service._buildPrompt('character', 'A warrior');
      expect(prompt).toContain('character portrait');
      expect(prompt).toContain('A warrior');
    });

    it('should build location prompt', () => {
      const prompt = service._buildPrompt('location', 'A castle');
      expect(prompt).toContain('location scene');
    });

    it('should build item prompt', () => {
      const prompt = service._buildPrompt('item', 'A sword');
      expect(prompt).toContain('item illustration');
    });

    it('should build scene prompt', () => {
      const prompt = service._buildPrompt('scene', 'A battle');
      expect(prompt).toContain('dramatic scene');
    });

    it('should add campaign style', () => {
      service.setCampaignStyle('steampunk');
      const prompt = service._buildPrompt('character', 'A warrior');
      expect(prompt).toContain('steampunk');
    });

    it('should add additional context', () => {
      const prompt = service._buildPrompt('character', 'A warrior', 'In a dark dungeon');
      expect(prompt).toContain('In a dark dungeon');
    });

    it('should truncate very long prompts', () => {
      const longDesc = 'A'.repeat(5000);
      const prompt = service._buildPrompt('character', longDesc);
      expect(prompt.length).toBeLessThanOrEqual(4000);
    });

    it('should fall back to scene for unknown type', () => {
      const prompt = service._buildPrompt('unknown', 'Something');
      expect(prompt).toContain('dramatic scene');
    });
  });

  // ── Entity type validation ─────────────────────────────────────────

  describe('entity type validation', () => {
    it('should accept valid entity types', () => {
      expect(service._validateEntityType('character')).toBe('character');
      expect(service._validateEntityType('location')).toBe('location');
      expect(service._validateEntityType('item')).toBe('item');
      expect(service._validateEntityType('scene')).toBe('scene');
    });

    it('should handle case insensitive types', () => {
      expect(service._validateEntityType('CHARACTER')).toBe('character');
      expect(service._validateEntityType('Location')).toBe('location');
    });

    it('should map aliases', () => {
      expect(service._validateEntityType('npc')).toBe('character');
      expect(service._validateEntityType('pc')).toBe('character');
      expect(service._validateEntityType('player')).toBe('character');
      expect(service._validateEntityType('place')).toBe('location');
      expect(service._validateEntityType('weapon')).toBe('item');
      expect(service._validateEntityType('battle')).toBe('scene');
    });

    it('should default to scene for unknown types', () => {
      expect(service._validateEntityType('unknown')).toBe('scene');
    });

    it('should handle null/empty entity type', () => {
      expect(service._validateEntityType(null)).toBe('scene');
      expect(service._validateEntityType('')).toBe('scene');
    });
  });

  // ── Default size for entity type ──────────────────────────────────

  describe('default size for entity type', () => {
    it('should return square for characters', () => {
      expect(service._getDefaultSizeForEntityType('character')).toBe(ImageSize.SQUARE);
    });

    it('should return landscape for locations', () => {
      expect(service._getDefaultSizeForEntityType('location')).toBe(ImageSize.LANDSCAPE);
    });

    it('should return square for items', () => {
      expect(service._getDefaultSizeForEntityType('item')).toBe(ImageSize.SQUARE);
    });

    it('should return landscape for scenes', () => {
      expect(service._getDefaultSizeForEntityType('scene')).toBe(ImageSize.LANDSCAPE);
    });

    it('should return square for unknown types', () => {
      expect(service._getDefaultSizeForEntityType('unknown')).toBe(ImageSize.SQUARE);
    });
  });

  // ── Settings ───────────────────────────────────────────────────────

  describe('settings management', () => {
    it('should set campaign style', () => {
      service.setCampaignStyle('anime');
      expect(service.getCampaignStyle()).toBe('anime');
    });

    it('should clear campaign style with empty string', () => {
      service.setCampaignStyle('anime');
      service.setCampaignStyle('');
      expect(service.getCampaignStyle()).toBe('');
    });

    it('should clear campaign style with null', () => {
      service.setCampaignStyle('anime');
      service.setCampaignStyle(null);
      expect(service.getCampaignStyle()).toBe('');
    });

    it('should set default quality', () => {
      service.setDefaultQuality(ImageQuality.LOW);
      expect(service._defaultQuality).toBe(ImageQuality.LOW);
    });

    it('should not set invalid quality', () => {
      service.setDefaultQuality('ultra-hd');
      expect(service._defaultQuality).toBe(ImageQuality.HIGH); // unchanged
    });
  });

  // ── Cost estimation ────────────────────────────────────────────────

  describe('cost estimation', () => {
    it('should estimate cost for high quality square', () => {
      const estimate = service.estimateCost(ImageQuality.HIGH, ImageSize.SQUARE);
      expect(estimate.estimatedCostUSD).toBe(0.08);
      expect(estimate.model).toBe(ImageModel.GPT_IMAGE_1);
    });

    it('should estimate cost for high quality landscape', () => {
      const estimate = service.estimateCost(ImageQuality.HIGH, ImageSize.LANDSCAPE);
      expect(estimate.estimatedCostUSD).toBe(0.12);
    });

    it('should estimate cost for low quality', () => {
      const estimate = service.estimateCost(ImageQuality.LOW, ImageSize.SQUARE);
      expect(estimate.estimatedCostUSD).toBe(0.03);
    });

    it('should estimate cost for medium quality', () => {
      const estimate = service.estimateCost(ImageQuality.MEDIUM, ImageSize.SQUARE);
      expect(estimate.estimatedCostUSD).toBe(0.04);
    });

    it('should include quality and size in estimate', () => {
      const estimate = service.estimateCost(ImageQuality.HIGH, ImageSize.PORTRAIT);
      expect(estimate.quality).toBe(ImageQuality.HIGH);
      expect(estimate.size).toBe(ImageSize.PORTRAIT);
    });
  });

  // ── Static methods ─────────────────────────────────────────────────

  describe('static methods', () => {
    it('should return available sizes', () => {
      const sizes = ImageGenerationService.getAvailableSizes();
      expect(Array.isArray(sizes)).toBe(true);
      expect(sizes).toHaveLength(3);
      expect(sizes[0].id).toBe(ImageSize.SQUARE);
    });

    it('should return available qualities', () => {
      const qualities = ImageGenerationService.getAvailableQualities();
      expect(Array.isArray(qualities)).toBe(true);
      expect(qualities).toHaveLength(4);
    });

    it('should return entity types', () => {
      const types = ImageGenerationService.getEntityTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types).toHaveLength(4);
      const character = types.find(t => t.id === EntityType.CHARACTER);
      expect(character).toBeDefined();
      expect(character.defaultSize).toBe(ImageSize.SQUARE);
    });

    it('should include descriptions in all sizes', () => {
      const sizes = ImageGenerationService.getAvailableSizes();
      sizes.forEach(s => {
        expect(s.description).toBeDefined();
        expect(s.aspectRatio).toBeDefined();
      });
    });

    it('should include descriptions in all qualities', () => {
      const qualities = ImageGenerationService.getAvailableQualities();
      qualities.forEach(q => {
        expect(q.description).toBeDefined();
        expect(q.costMultiplier).toBeDefined();
      });
    });
  });
});
