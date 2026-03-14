/**
 * Tests for ImageProcessor
 *
 * Covers exports (class + DEFAULT_IMAGE_OPTIONS), constructor validation,
 * generateImages (happy path, progress, error handling, empty inputs),
 * _buildImageRequests (indirectly), updateOptions, getOptions, and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

import {
  ImageProcessor,
  DEFAULT_IMAGE_OPTIONS
} from '../../scripts/orchestration/ImageProcessor.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockImageGenerationService(overrides = {}) {
  return {
    generateBatch: vi.fn().mockResolvedValue([
      { success: true, imageData: 'base64data1' },
      { success: true, imageData: 'base64data2' }
    ]),
    ...overrides
  };
}

function createSampleMoments(count = 3) {
  const moments = [];
  for (let i = 0; i < count; i++) {
    moments.push({
      id: `m${i}`,
      title: `Moment ${i}`,
      imagePrompt: `A dramatic scene number ${i}`
    });
  }
  return moments;
}

function createSampleEntities() {
  return {
    characters: [{ name: 'Gandalf', description: 'A wizard' }],
    locations: [{ name: 'Shire', description: 'Green hills' }],
    items: [{ name: 'Ring', description: 'One ring' }]
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImageProcessor', () => {
  let mockService;
  let processor;

  beforeEach(() => {
    mockService = createMockImageGenerationService();
    processor = new ImageProcessor({
      imageGenerationService: mockService,
      options: { maxImagesPerSession: 3, imageQuality: 'high' }
    });
  });

  // ── Exports ─────────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export ImageProcessor class', () => {
      expect(ImageProcessor).toBeDefined();
      expect(typeof ImageProcessor).toBe('function');
    });

    it('should export DEFAULT_IMAGE_OPTIONS', () => {
      expect(DEFAULT_IMAGE_OPTIONS).toBeDefined();
    });

    it('should have maxImagesPerSession in DEFAULT_IMAGE_OPTIONS', () => {
      expect(DEFAULT_IMAGE_OPTIONS.maxImagesPerSession).toBe(3);
    });

    it('should have imageQuality in DEFAULT_IMAGE_OPTIONS', () => {
      expect(DEFAULT_IMAGE_OPTIONS.imageQuality).toBe('high');
    });

    it('should be constructable', () => {
      const p = new ImageProcessor({ imageGenerationService: mockService });
      expect(p).toBeInstanceOf(ImageProcessor);
    });
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should throw if no imageGenerationService is provided', () => {
      expect(() => new ImageProcessor()).toThrow('requires an imageGenerationService');
    });

    it('should throw if imageGenerationService is missing from config', () => {
      expect(() => new ImageProcessor({})).toThrow('requires an imageGenerationService');
    });

    it('should throw if imageGenerationService is null', () => {
      expect(() => new ImageProcessor({ imageGenerationService: null })).toThrow(
        'requires an imageGenerationService'
      );
    });

    it('should throw if imageGenerationService is undefined', () => {
      expect(() => new ImageProcessor({ imageGenerationService: undefined })).toThrow(
        'requires an imageGenerationService'
      );
    });

    it('should accept a valid imageGenerationService', () => {
      const p = new ImageProcessor({ imageGenerationService: mockService });
      expect(p).toBeDefined();
    });

    it('should use DEFAULT_IMAGE_OPTIONS when no options provided', () => {
      const p = new ImageProcessor({ imageGenerationService: mockService });
      const opts = p.getOptions();
      expect(opts.maxImagesPerSession).toBe(DEFAULT_IMAGE_OPTIONS.maxImagesPerSession);
      expect(opts.imageQuality).toBe(DEFAULT_IMAGE_OPTIONS.imageQuality);
    });

    it('should merge provided options with defaults', () => {
      const p = new ImageProcessor({
        imageGenerationService: mockService,
        options: { maxImagesPerSession: 10 }
      });
      const opts = p.getOptions();
      expect(opts.maxImagesPerSession).toBe(10);
      expect(opts.imageQuality).toBe('high'); // from defaults
    });

    it('should override defaults with provided options', () => {
      const p = new ImageProcessor({
        imageGenerationService: mockService,
        options: { imageQuality: 'low' }
      });
      expect(p.getOptions().imageQuality).toBe('low');
    });
  });

  // ── getOptions ──────────────────────────────────────────────────────────

  describe('getOptions', () => {
    it('should return a copy of current options', () => {
      const opts = processor.getOptions();
      expect(opts).toEqual({ maxImagesPerSession: 3, imageQuality: 'high' });
    });

    it('should return a copy (not reference)', () => {
      const opts = processor.getOptions();
      opts.maxImagesPerSession = 999;
      expect(processor.getOptions().maxImagesPerSession).toBe(3);
    });
  });

  // ── updateOptions ───────────────────────────────────────────────────────

  describe('updateOptions', () => {
    it('should merge new options', () => {
      processor.updateOptions({ maxImagesPerSession: 10 });
      expect(processor.getOptions().maxImagesPerSession).toBe(10);
    });

    it('should preserve existing options', () => {
      processor.updateOptions({ maxImagesPerSession: 10 });
      expect(processor.getOptions().imageQuality).toBe('high');
    });

    it('should override existing options', () => {
      processor.updateOptions({ imageQuality: 'low' });
      expect(processor.getOptions().imageQuality).toBe('low');
    });

    it('should add new options', () => {
      processor.updateOptions({ customOption: 'value' });
      expect(processor.getOptions().customOption).toBe('value');
    });
  });

  // ── generateImages ──────────────────────────────────────────────────────

  describe('generateImages', () => {
    describe('when service is not configured', () => {
      it('should return empty array if service becomes null', async () => {
        // Trick: create with valid service, then null it out
        const p = new ImageProcessor({ imageGenerationService: mockService });
        p._imageGenerationService = null;
        const result = await p.generateImages(createSampleMoments(), createSampleEntities());
        expect(result).toEqual([]);
      });
    });

    describe('empty inputs', () => {
      it('should return empty array when no moments and no entities', async () => {
        const result = await processor.generateImages([], {});
        expect(result).toEqual([]);
      });

      it('should return empty array when moments is null', async () => {
        const result = await processor.generateImages(null, {});
        expect(result).toEqual([]);
      });

      it('should return empty array when moments is undefined', async () => {
        const result = await processor.generateImages(undefined, {});
        expect(result).toEqual([]);
      });

      it('should return empty array when moments have no imagePrompt', async () => {
        const moments = [
          { id: 'm1', title: 'No prompt' },
          { id: 'm2', title: 'Also no prompt' }
        ];
        const result = await processor.generateImages(moments, {});
        expect(result).toEqual([]);
      });

      it('should default moments to empty array', async () => {
        const result = await processor.generateImages();
        expect(result).toEqual([]);
      });

      it('should default entities to empty object', async () => {
        const result = await processor.generateImages([]);
        expect(result).toEqual([]);
      });
    });

    describe('happy path', () => {
      it('should call generateBatch on the service', async () => {
        await processor.generateImages(createSampleMoments(), createSampleEntities());
        expect(mockService.generateBatch).toHaveBeenCalledTimes(1);
      });

      it('should pass requests to generateBatch', async () => {
        await processor.generateImages(createSampleMoments(), createSampleEntities());
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests).toHaveLength(3);
      });

      it('should build scene requests from moments with imagePrompt', async () => {
        const moments = [
          { id: 'm1', title: 'Battle', imagePrompt: 'Epic battle scene' },
          { id: 'm2', title: 'No Image' }, // no imagePrompt
          { id: 'm3', title: 'Rest', imagePrompt: 'Campfire rest scene' }
        ];

        await processor.generateImages(moments, {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests).toHaveLength(2);
        expect(requests[0].description).toBe('Epic battle scene');
        expect(requests[1].description).toBe('Campfire rest scene');
      });

      it('should set entityType to "scene" for moment requests', async () => {
        await processor.generateImages(createSampleMoments(1), {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests[0].entityType).toBe('scene');
      });

      it('should set quality from options', async () => {
        await processor.generateImages(createSampleMoments(1), {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests[0].options.quality).toBe('high');
      });

      it('should include meta data from moments', async () => {
        const moments = [{ id: 'm1', title: 'Epic Battle', imagePrompt: 'scene' }];
        await processor.generateImages(moments, {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests[0].meta).toEqual({ momentId: 'm1', title: 'Epic Battle' });
      });

      it('should return results with metadata attached', async () => {
        const moments = [{ id: 'm1', title: 'Battle', imagePrompt: 'scene' }];
        mockService.generateBatch.mockResolvedValue([{ success: true, imageData: 'data' }]);

        const results = await processor.generateImages(moments, {});
        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);
        expect(results[0].meta).toEqual({ momentId: 'm1', title: 'Battle' });
      });

      it('should respect maxImagesPerSession option', async () => {
        const p = new ImageProcessor({
          imageGenerationService: mockService,
          options: { maxImagesPerSession: 2 }
        });

        await p.generateImages(createSampleMoments(5), {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests).toHaveLength(2);
      });

      it('should allow overriding maxImagesPerSession per call', async () => {
        await processor.generateImages(
          createSampleMoments(5),
          {},
          {
            maxImagesPerSession: 1
          }
        );
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests).toHaveLength(1);
      });

      it('should allow overriding imageQuality per call', async () => {
        await processor.generateImages(
          createSampleMoments(1),
          {},
          {
            imageQuality: 'low'
          }
        );
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests[0].options.quality).toBe('low');
      });
    });

    describe('progress reporting', () => {
      it('should call onProgress with starting message', async () => {
        const onProgress = vi.fn();
        await processor.generateImages(createSampleMoments(2), {}, { onProgress });
        expect(onProgress).toHaveBeenCalledWith(0, expect.stringContaining('Generating'));
      });

      it('should include count in starting message', async () => {
        const onProgress = vi.fn();
        await processor.generateImages(createSampleMoments(2), {}, { onProgress });
        expect(onProgress).toHaveBeenCalledWith(0, 'Generating 2 images...');
      });

      it('should call onProgress with completion message', async () => {
        const onProgress = vi.fn();
        await processor.generateImages(createSampleMoments(1), {}, { onProgress });
        expect(onProgress).toHaveBeenCalledWith(100, 'Image generation complete');
      });

      it('should relay progress from generateBatch', async () => {
        const service = createMockImageGenerationService({
          generateBatch: vi.fn().mockImplementation((requests, progressCb) => {
            progressCb({ progress: 50, current: 1, total: 2 });
            progressCb({ progress: 100, current: 2, total: 2 });
            return Promise.resolve([{ success: true }, { success: true }]);
          })
        });

        const p = new ImageProcessor({ imageGenerationService: service });
        const onProgress = vi.fn();
        await p.generateImages(createSampleMoments(2), {}, { onProgress });

        expect(onProgress).toHaveBeenCalledWith(50, 'Generating image 1/2');
        expect(onProgress).toHaveBeenCalledWith(100, 'Generating image 2/2');
      });

      it('should handle missing progress callback fields with defaults', async () => {
        const service = createMockImageGenerationService({
          generateBatch: vi.fn().mockImplementation((requests, progressCb) => {
            progressCb({});
            return Promise.resolve([{ success: true }]);
          })
        });

        const p = new ImageProcessor({ imageGenerationService: service });
        const onProgress = vi.fn();
        await p.generateImages(createSampleMoments(1), {}, { onProgress });

        // defaults: progress=0, current=1, total=requests.length
        expect(onProgress).toHaveBeenCalledWith(0, 'Generating image 1/1');
      });

      it('should use noop progress when not provided', async () => {
        // Should not throw
        const result = await processor.generateImages(createSampleMoments(1), {});
        expect(result).toBeDefined();
      });
    });

    describe('error handling', () => {
      it('should throw when generateBatch fails', async () => {
        const failingService = createMockImageGenerationService({
          generateBatch: vi.fn().mockRejectedValue(new Error('Generation failed'))
        });

        const p = new ImageProcessor({ imageGenerationService: failingService });
        await expect(p.generateImages(createSampleMoments(1), {})).rejects.toThrow('Generation failed');
      });

      it('should propagate error to caller when generateBatch fails', async () => {
        const failingService = createMockImageGenerationService({
          generateBatch: vi.fn().mockRejectedValue(new Error('Generation failed'))
        });

        const p = new ImageProcessor({ imageGenerationService: failingService });
        await expect(p.generateImages(createSampleMoments(1), {})).rejects.toThrow();
      });

      it('should report error progress when generateBatch fails', async () => {
        const failingService = createMockImageGenerationService({
          generateBatch: vi.fn().mockRejectedValue(new Error('API quota exceeded'))
        });

        const p = new ImageProcessor({ imageGenerationService: failingService });
        const onProgress = vi.fn();
        await p.generateImages(createSampleMoments(1), {}, { onProgress }).catch(() => {});

        expect(onProgress).toHaveBeenCalledWith(0, expect.stringContaining('API quota exceeded'));
      });

      it('should notify user when generateBatch fails (H-4)', async () => {
        const failingService = createMockImageGenerationService({
          generateBatch: vi.fn().mockRejectedValue(new Error('Generation failed'))
        });

        const p = new ImageProcessor({ imageGenerationService: failingService });
        await p.generateImages(createSampleMoments(1), {}).catch(() => {});
        expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
        expect(ui.notifications.warn).toHaveBeenCalledWith(
          expect.stringContaining('VOXCHRONICLE.Errors.ImageGenerationBatchFailed')
        );
      });

      it('should handle partial success in batch', async () => {
        mockService.generateBatch.mockResolvedValue([
          { success: true, imageData: 'data1' },
          { success: false, error: 'Failed to generate' }
        ]);

        const results = await processor.generateImages(createSampleMoments(2), {});
        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
      });
    });

    describe('request building', () => {
      it('should skip moments without imagePrompt', async () => {
        const moments = [
          { id: 'm1', title: 'With Prompt', imagePrompt: 'A scene' },
          { id: 'm2', title: 'Without Prompt' },
          { id: 'm3', title: 'Empty Prompt', imagePrompt: '' }
        ];

        await processor.generateImages(moments, {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        // Only the first moment has a truthy imagePrompt
        expect(requests).toHaveLength(1);
        expect(requests[0].meta.title).toBe('With Prompt');
      });

      it('should not generate entity portraits (entities param is unused)', async () => {
        // Even with many entities, no portrait requests should be generated
        const entities = {
          characters: [
            { name: 'A', description: 'desc' },
            { name: 'B', description: 'desc' }
          ],
          locations: [{ name: 'C', description: 'desc' }]
        };

        await processor.generateImages([], entities);
        // No requests since no moments with imagePrompt
        expect(mockService.generateBatch).not.toHaveBeenCalled();
      });

      it('should limit moments to maxImages', async () => {
        const manyMoments = createSampleMoments(10);

        const p = new ImageProcessor({
          imageGenerationService: mockService,
          options: { maxImagesPerSession: 5 }
        });

        await p.generateImages(manyMoments, {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests).toHaveLength(5);
        // Verify the first 5 moments were used
        expect(requests[0].meta.momentId).toBe('m0');
        expect(requests[4].meta.momentId).toBe('m4');
      });

      it('should handle exactly maxImages moments', async () => {
        const moments = createSampleMoments(3); // maxImagesPerSession is 3

        await processor.generateImages(moments, {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests).toHaveLength(3);
      });

      it('should handle fewer moments than maxImages', async () => {
        const moments = createSampleMoments(1); // maxImagesPerSession is 3

        await processor.generateImages(moments, {});
        const requests = mockService.generateBatch.mock.calls[0][0];
        expect(requests).toHaveLength(1);
      });
    });

    describe('metadata attachment', () => {
      it('should attach meta from requests to results', async () => {
        const moments = [
          { id: 'unique1', title: 'First Scene', imagePrompt: 'prompt1' },
          { id: 'unique2', title: 'Second Scene', imagePrompt: 'prompt2' }
        ];

        mockService.generateBatch.mockResolvedValue([
          { success: true, imageData: 'data1' },
          { success: true, imageData: 'data2' }
        ]);

        const results = await processor.generateImages(moments, {});
        expect(results[0].meta).toEqual({ momentId: 'unique1', title: 'First Scene' });
        expect(results[1].meta).toEqual({ momentId: 'unique2', title: 'Second Scene' });
      });

      it('should use empty meta when request has no meta', async () => {
        // This covers the case where requests[index]?.meta is undefined
        const moments = [{ id: 'x', title: 'T', imagePrompt: 'p' }];

        mockService.generateBatch.mockResolvedValue([
          { success: true },
          { success: true } // extra result with no matching request
        ]);

        const results = await processor.generateImages(moments, {});
        // First result has meta, second might have empty meta
        expect(results[0].meta).toEqual({ momentId: 'x', title: 'T' });
        expect(results[1].meta).toEqual({});
      });

      it('should preserve original result properties', async () => {
        const moments = [{ id: 'm1', title: 'T', imagePrompt: 'p' }];
        mockService.generateBatch.mockResolvedValue([
          { success: true, imageData: 'base64', width: 1024, height: 1024 }
        ]);

        const results = await processor.generateImages(moments, {});
        expect(results[0].success).toBe(true);
        expect(results[0].imageData).toBe('base64');
        expect(results[0].width).toBe(1024);
      });
    });

    describe('count reporting', () => {
      it('should count successful results', async () => {
        mockService.generateBatch.mockResolvedValue([
          { success: true },
          { success: false },
          { success: true }
        ]);

        const results = await processor.generateImages(createSampleMoments(3), {});
        const successCount = results.filter((r) => r.success !== false).length;
        expect(successCount).toBe(2);
      });

      it('should count results without success field as successful', async () => {
        mockService.generateBatch.mockResolvedValue([
          { imageData: 'data' }, // no success field
          { success: false }
        ]);

        const results = await processor.generateImages(createSampleMoments(2), {});
        const successCount = results.filter((r) => r.success !== false).length;
        expect(successCount).toBe(1);
      });
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle zero maxImagesPerSession', async () => {
      const p = new ImageProcessor({
        imageGenerationService: mockService,
        options: { maxImagesPerSession: 0 }
      });

      const result = await p.generateImages(createSampleMoments(3), {});
      expect(result).toEqual([]);
    });

    it('should handle very large maxImagesPerSession', async () => {
      const p = new ImageProcessor({
        imageGenerationService: mockService,
        options: { maxImagesPerSession: 1000 }
      });

      await p.generateImages(createSampleMoments(5), {});
      const requests = mockService.generateBatch.mock.calls[0][0];
      expect(requests).toHaveLength(5);
    });

    it('should handle moments with empty strings as imagePrompt', async () => {
      const moments = [{ id: 'm1', title: 'T', imagePrompt: '' }];
      const result = await processor.generateImages(moments, {});
      expect(result).toEqual([]);
    });

    it('should handle moments with null imagePrompt', async () => {
      const moments = [{ id: 'm1', title: 'T', imagePrompt: null }];
      const result = await processor.generateImages(moments, {});
      expect(result).toEqual([]);
    });
  });
});
