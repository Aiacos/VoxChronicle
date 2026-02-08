/**
 * ImageProcessor Unit Tests
 *
 * Tests for the ImageProcessor class with service mocking.
 * Covers image generation, batch processing, request building, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing ImageProcessor
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

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import { ImageProcessor } from '../../scripts/orchestration/ImageProcessor.mjs';

/**
 * Create mock image generation service
 */
function createMockImageGenerationService() {
  return {
    generateBatch: vi.fn().mockResolvedValue([
      {
        success: true,
        url: 'https://example.com/image1.png',
        revisedPrompt: 'A revised prompt for image 1',
        error: null
      },
      {
        success: true,
        url: 'https://example.com/image2.png',
        revisedPrompt: 'A revised prompt for image 2',
        error: null
      }
    ])
  };
}

/**
 * Create mock session moments with image prompts
 */
function createMockMoments(count = 3) {
  const moments = [];
  for (let i = 1; i <= count; i++) {
    moments.push({
      id: `moment-${i}`,
      title: `Moment ${i}`,
      description: `Description for moment ${i}`,
      imagePrompt: `Epic scene for moment ${i}`
    });
  }
  return moments;
}

/**
 * Create mock extracted entities
 */
function createMockEntities(options = {}) {
  const numCharacters = options.numCharacters || 2;
  const characters = [];

  for (let i = 1; i <= numCharacters; i++) {
    characters.push({
      name: `Character ${i}`,
      description: `A brave warrior character ${i}`,
      isNPC: options.isNPC !== undefined ? options.isNPC : true
    });
  }

  return {
    characters,
    locations: [
      { name: 'Tavern', description: 'A cozy tavern', type: 'Building' }
    ],
    items: [
      { name: 'Magic Sword', description: 'A legendary blade', type: 'Weapon' }
    ]
  };
}

describe('ImageProcessor', () => {
  let processor;
  let mockImageService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockImageService = createMockImageGenerationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with image generation service', () => {
      processor = new ImageProcessor({
        imageGenerationService: mockImageService
      });

      expect(processor).toBeInstanceOf(ImageProcessor);
      expect(processor.getOptions()).toEqual({
        maxImagesPerSession: 5,
        imageQuality: 'standard'
      });
    });

    it('should throw error if imageGenerationService is missing', () => {
      expect(() => {
        new ImageProcessor({});
      }).toThrow('ImageProcessor requires an imageGenerationService');
    });

    it('should accept custom options', () => {
      processor = new ImageProcessor({
        imageGenerationService: mockImageService,
        options: {
          maxImagesPerSession: 10,
          imageQuality: 'hd'
        }
      });

      const options = processor.getOptions();
      expect(options.maxImagesPerSession).toBe(10);
      expect(options.imageQuality).toBe('hd');
    });

    it('should merge custom options with defaults', () => {
      processor = new ImageProcessor({
        imageGenerationService: mockImageService,
        options: {
          maxImagesPerSession: 3
          // imageQuality not specified, should use default
        }
      });

      const options = processor.getOptions();
      expect(options.maxImagesPerSession).toBe(3);
      expect(options.imageQuality).toBe('standard');
    });
  });

  describe('generateImages', () => {
    beforeEach(() => {
      processor = new ImageProcessor({
        imageGenerationService: mockImageService,
        options: {
          maxImagesPerSession: 5,
          imageQuality: 'standard'
        }
      });
    });

    it('should generate images from moments', async () => {
      const moments = createMockMoments(2);
      const entities = createMockEntities({ numCharacters: 0 });

      const results = await processor.generateImages(moments, entities);

      expect(mockImageService.generateBatch).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        success: true,
        url: 'https://example.com/image1.png',
        meta: {
          momentId: 'moment-1',
          title: 'Moment 1'
        }
      });
      expect(results[1]).toMatchObject({
        success: true,
        url: 'https://example.com/image2.png',
        meta: {
          momentId: 'moment-2',
          title: 'Moment 2'
        }
      });
    });

    it('should generate images from characters when slots available', async () => {
      const moments = createMockMoments(1);
      const entities = createMockEntities({ numCharacters: 2 });

      mockImageService.generateBatch.mockResolvedValue([
        { success: true, url: 'https://example.com/moment.png', revisedPrompt: 'Moment' },
        { success: true, url: 'https://example.com/char1.png', revisedPrompt: 'Character 1' },
        { success: true, url: 'https://example.com/char2.png', revisedPrompt: 'Character 2' }
      ]);

      const results = await processor.generateImages(moments, entities);

      expect(results).toHaveLength(3);
      expect(results[0].meta.momentId).toBe('moment-1');
      expect(results[1].meta.characterName).toBe('Character 1');
      expect(results[2].meta.characterName).toBe('Character 2');
    });

    it('should respect maxImagesPerSession limit', async () => {
      const moments = createMockMoments(10);
      const entities = createMockEntities({ numCharacters: 5 });

      mockImageService.generateBatch.mockResolvedValue(
        Array(5).fill({ success: true, url: 'https://example.com/image.png', revisedPrompt: 'Test' })
      );

      await processor.generateImages(moments, entities);

      const calls = mockImageService.generateBatch.mock.calls[0];
      const requests = calls[0];

      // Should only generate 5 images total (maxImagesPerSession)
      expect(requests).toHaveLength(5);
    });

    it('should prioritize moments over characters', async () => {
      const moments = createMockMoments(5);
      const entities = createMockEntities({ numCharacters: 3 });

      mockImageService.generateBatch.mockResolvedValue(
        Array(5).fill({ success: true, url: 'https://example.com/image.png', revisedPrompt: 'Test' })
      );

      await processor.generateImages(moments, entities);

      const calls = mockImageService.generateBatch.mock.calls[0];
      const requests = calls[0];

      // All 5 slots taken by moments
      expect(requests).toHaveLength(5);
      expect(requests.every(r => r.entityType === 'scene')).toBe(true);
    });

    it('should only generate images for NPCs', async () => {
      const moments = [];
      const entities = {
        characters: [
          { name: 'Player Character', description: 'A player', isNPC: false },
          { name: 'NPC 1', description: 'An NPC', isNPC: true },
          { name: 'NPC 2', description: 'Another NPC', isNPC: true }
        ]
      };

      mockImageService.generateBatch.mockResolvedValue([
        { success: true, url: 'https://example.com/npc1.png', revisedPrompt: 'NPC 1' },
        { success: true, url: 'https://example.com/npc2.png', revisedPrompt: 'NPC 2' }
      ]);

      const results = await processor.generateImages(moments, entities);

      expect(results).toHaveLength(2);
      expect(results[0].meta.characterName).toBe('NPC 1');
      expect(results[1].meta.characterName).toBe('NPC 2');
    });

    it('should use custom imageQuality option', async () => {
      const moments = createMockMoments(1);

      await processor.generateImages(moments, {}, {
        imageQuality: 'hd'
      });

      const calls = mockImageService.generateBatch.mock.calls[0];
      const requests = calls[0];

      expect(requests[0].options.quality).toBe('hd');
    });

    it('should use custom maxImagesPerSession option', async () => {
      const moments = createMockMoments(10);

      mockImageService.generateBatch.mockResolvedValue(
        Array(2).fill({ success: true, url: 'https://example.com/image.png', revisedPrompt: 'Test' })
      );

      await processor.generateImages(moments, {}, {
        maxImagesPerSession: 2
      });

      const calls = mockImageService.generateBatch.mock.calls[0];
      const requests = calls[0];

      expect(requests).toHaveLength(2);
    });

    it('should call progress callback during generation', async () => {
      const moments = createMockMoments(2);
      const onProgress = vi.fn();

      mockImageService.generateBatch.mockImplementation(async (requests, progressCallback) => {
        progressCallback({ progress: 0, current: 1, total: 2 });
        progressCallback({ progress: 50, current: 2, total: 2 });
        progressCallback({ progress: 100, current: 2, total: 2 });
        return [
          { success: true, url: 'https://example.com/image1.png', revisedPrompt: 'Test 1' },
          { success: true, url: 'https://example.com/image2.png', revisedPrompt: 'Test 2' }
        ];
      });

      await processor.generateImages(moments, {}, { onProgress });

      expect(onProgress).toHaveBeenCalledWith(0, 'Generating 2 images...');
      expect(onProgress).toHaveBeenCalledWith(0, 'Generating image 1/2');
      expect(onProgress).toHaveBeenCalledWith(50, 'Generating image 2/2');
      expect(onProgress).toHaveBeenCalledWith(100, 'Generating image 2/2');
      expect(onProgress).toHaveBeenCalledWith(100, 'Image generation complete');
    });

    it('should skip moments without imagePrompt', async () => {
      const moments = [
        { id: 'moment-1', title: 'Moment 1', imagePrompt: 'A scene' },
        { id: 'moment-2', title: 'Moment 2' }, // No imagePrompt
        { id: 'moment-3', title: 'Moment 3', imagePrompt: 'Another scene' }
      ];

      mockImageService.generateBatch.mockResolvedValue([
        { success: true, url: 'https://example.com/image1.png', revisedPrompt: 'Test 1' },
        { success: true, url: 'https://example.com/image2.png', revisedPrompt: 'Test 2' }
      ]);

      await processor.generateImages(moments, {});

      const calls = mockImageService.generateBatch.mock.calls[0];
      const requests = calls[0];

      expect(requests).toHaveLength(2);
      expect(requests[0].meta.momentId).toBe('moment-1');
      expect(requests[1].meta.momentId).toBe('moment-3');
    });

    it('should return empty array if no image requests', async () => {
      const results = await processor.generateImages([], {});

      expect(mockImageService.generateBatch).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it('should handle generation errors gracefully', async () => {
      const moments = createMockMoments(1);
      const onProgress = vi.fn();

      mockImageService.generateBatch.mockRejectedValue(new Error('API rate limit exceeded'));

      const results = await processor.generateImages(moments, {}, { onProgress });

      expect(results).toEqual([]);
      expect(onProgress).toHaveBeenCalledWith(0, 'Image generation failed: API rate limit exceeded');
    });

    it('should handle partial generation failures', async () => {
      const moments = createMockMoments(3);

      mockImageService.generateBatch.mockResolvedValue([
        { success: true, url: 'https://example.com/image1.png', revisedPrompt: 'Success 1' },
        { success: false, url: null, error: 'Generation failed', revisedPrompt: null },
        { success: true, url: 'https://example.com/image3.png', revisedPrompt: 'Success 3' }
      ]);

      const results = await processor.generateImages(moments, {});

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('should attach metadata to all results', async () => {
      const moments = createMockMoments(1);
      const entities = createMockEntities({ numCharacters: 1 });

      mockImageService.generateBatch.mockResolvedValue([
        { success: true, url: 'https://example.com/moment.png', revisedPrompt: 'Moment' },
        { success: true, url: 'https://example.com/char.png', revisedPrompt: 'Character' }
      ]);

      const results = await processor.generateImages(moments, entities);

      expect(results[0]).toHaveProperty('meta');
      expect(results[0].meta).toHaveProperty('momentId');
      expect(results[1]).toHaveProperty('meta');
      expect(results[1].meta).toHaveProperty('characterName');
    });
  });

  describe('updateOptions', () => {
    beforeEach(() => {
      processor = new ImageProcessor({
        imageGenerationService: mockImageService
      });
    });

    it('should update maxImagesPerSession', () => {
      processor.updateOptions({ maxImagesPerSession: 10 });

      const options = processor.getOptions();
      expect(options.maxImagesPerSession).toBe(10);
    });

    it('should update imageQuality', () => {
      processor.updateOptions({ imageQuality: 'hd' });

      const options = processor.getOptions();
      expect(options.imageQuality).toBe('hd');
    });

    it('should merge with existing options', () => {
      processor.updateOptions({ maxImagesPerSession: 10 });
      processor.updateOptions({ imageQuality: 'hd' });

      const options = processor.getOptions();
      expect(options.maxImagesPerSession).toBe(10);
      expect(options.imageQuality).toBe('hd');
    });
  });

  describe('getOptions', () => {
    beforeEach(() => {
      processor = new ImageProcessor({
        imageGenerationService: mockImageService,
        options: {
          maxImagesPerSession: 8,
          imageQuality: 'hd'
        }
      });
    });

    it('should return current options', () => {
      const options = processor.getOptions();

      expect(options).toEqual({
        maxImagesPerSession: 8,
        imageQuality: 'hd'
      });
    });

    it('should return a copy of options', () => {
      const options1 = processor.getOptions();
      options1.maxImagesPerSession = 999;

      const options2 = processor.getOptions();
      expect(options2.maxImagesPerSession).toBe(8);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      processor = new ImageProcessor({
        imageGenerationService: mockImageService
      });
    });

    it('should handle empty moments and entities', async () => {
      const results = await processor.generateImages([], {});

      expect(results).toEqual([]);
      expect(mockImageService.generateBatch).not.toHaveBeenCalled();
    });

    it('should handle undefined moments and entities', async () => {
      const results = await processor.generateImages(undefined, undefined);

      expect(results).toEqual([]);
      expect(mockImageService.generateBatch).not.toHaveBeenCalled();
    });

    it('should handle entities without characters', async () => {
      const moments = createMockMoments(1);
      const entities = {
        locations: [{ name: 'Castle', description: 'A castle' }],
        items: [{ name: 'Sword', description: 'A sword' }]
      };

      mockImageService.generateBatch.mockResolvedValue([
        { success: true, url: 'https://example.com/image.png', revisedPrompt: 'Test' }
      ]);

      const results = await processor.generateImages(moments, entities);

      expect(results).toHaveLength(1);
      expect(results[0].meta.momentId).toBe('moment-1');
    });

    it('should handle empty characters array', async () => {
      const moments = createMockMoments(1);
      const entities = {
        characters: [],
        locations: [],
        items: []
      };

      mockImageService.generateBatch.mockResolvedValue([
        { success: true, url: 'https://example.com/image.png', revisedPrompt: 'Test' }
      ]);

      const results = await processor.generateImages(moments, entities);

      expect(results).toHaveLength(1);
    });

    it('should use default maxImagesPerSession when 0 is passed', async () => {
      const moments = createMockMoments(10);

      mockImageService.generateBatch.mockResolvedValue(
        Array(5).fill({ success: true, url: 'https://example.com/image.png', revisedPrompt: 'Test' })
      );

      // When 0 is passed, it's falsy and falls back to default (5)
      const results = await processor.generateImages(moments, {}, {
        maxImagesPerSession: 0
      });

      const calls = mockImageService.generateBatch.mock.calls[0];
      const requests = calls[0];

      // Should generate default 5 images (0 is falsy, so default is used)
      expect(requests).toHaveLength(5);
      expect(results).toHaveLength(5);
    });

    it('should build correct request structure', async () => {
      const moments = [{ id: 'test-moment', title: 'Test', imagePrompt: 'Test prompt' }];
      const entities = {
        characters: [{ name: 'Test Character', description: 'A test character', isNPC: true }]
      };

      mockImageService.generateBatch.mockResolvedValue([
        { success: true, url: 'https://example.com/image1.png', revisedPrompt: 'Test 1' },
        { success: true, url: 'https://example.com/image2.png', revisedPrompt: 'Test 2' }
      ]);

      await processor.generateImages(moments, entities);

      const calls = mockImageService.generateBatch.mock.calls[0];
      const requests = calls[0];

      expect(requests[0]).toEqual({
        entityType: 'scene',
        description: 'Test prompt',
        options: { quality: 'standard' },
        meta: { momentId: 'test-moment', title: 'Test' }
      });

      expect(requests[1]).toEqual({
        entityType: 'character',
        description: 'Test Character: A test character',
        options: { quality: 'standard' },
        meta: { characterName: 'Test Character' }
      });
    });
  });
});
