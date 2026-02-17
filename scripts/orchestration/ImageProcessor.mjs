/**
 * ImageProcessor - Image Generation Workflow Management
 *
 * Handles image generation for session entities and moments using AI image
 * generation services. Manages image request building, batch processing,
 * and progress tracking with configurable limits and quality settings.
 *
 * @class ImageProcessor
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Default options for image processing
 * @constant {object}
 */
const DEFAULT_IMAGE_OPTIONS = {
  maxImagesPerSession: 5,
  imageQuality: 'high'
};

/**
 * ImageProcessor class for managing image generation workflows
 *
 * @example
 * const processor = new ImageProcessor({
 *   imageGenerationService: imageServiceInstance,
 *   options: {
 *     maxImagesPerSession: 5,
 *     imageQuality: 'high'
 *   }
 * });
 *
 * const results = await processor.generateImages(moments, entities, {
 *   onProgress: (progress, message) => console.log(message)
 * });
 */
class ImageProcessor {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('ImageProcessor');

  /**
   * Image generation service
   * @type {object | null}
   * @private
   */
  _imageGenerationService = null;

  /**
   * Image processing options
   * @type {object}
   * @private
   */
  _options = {};

  /**
   * Create a new ImageProcessor instance
   *
   * @param {object} config - Configuration options
   * @param {object} config.imageGenerationService - ImageGenerationService instance
   * @param {object} [config.options] - Image processing options
   * @param {number} [config.options.maxImagesPerSession=5] - Maximum images to generate per session
   * @param {string} [config.options.imageQuality='high'] - Image quality ('low', 'medium', 'high', or 'auto')
   */
  constructor(config = {}) {
    if (!config.imageGenerationService) {
      throw new Error('ImageProcessor requires an imageGenerationService');
    }

    this._imageGenerationService = config.imageGenerationService;
    this._options = { ...DEFAULT_IMAGE_OPTIONS, ...(config.options || {}) };

    this._logger.debug('ImageProcessor initialized');
  }

  /**
   * Generate images for session moments and entities
   *
   * @param {Array<object>} moments - Session moments with image prompts
   * @param {object} entities - Extracted entities (characters, locations, items)
   * @param {object} [options] - Generation options
   * @param {Function} [options.onProgress] - Progress callback (progress: number, message: string)
   * @param {number} [options.maxImagesPerSession] - Override max images for this generation
   * @param {string} [options.imageQuality] - Override quality for this generation
   * @returns {Promise<Array<object>>} Generated image results with metadata
   */
  async generateImages(moments = [], entities = {}, options = {}) {
    if (!this._imageGenerationService) {
      this._logger.warn('Image generation service not configured');
      return [];
    }

    const onProgress = options.onProgress || (() => {});
    const maxImages = options.maxImagesPerSession || this._options.maxImagesPerSession;
    const imageQuality = options.imageQuality || this._options.imageQuality;

    // Build image generation requests
    const requests = this._buildImageRequests(moments, entities, maxImages, imageQuality);

    if (requests.length === 0) {
      this._logger.debug('No image generation requests');
      return [];
    }

    this._logger.log(`Generating ${requests.length} images...`);
    onProgress(0, `Generating ${requests.length} images...`);

    try {
      // Generate images in batch with progress tracking
      const results = await this._imageGenerationService.generateBatch(requests, (progress) => {
        const progressPercent = progress.progress || 0;
        const current = progress.current || 1;
        const total = progress.total || requests.length;

        onProgress(progressPercent, `Generating image ${current}/${total}`);
      });

      // Attach metadata to results
      const resultsWithMetadata = results.map((result, index) => ({
        ...result,
        meta: requests[index]?.meta || {}
      }));

      onProgress(100, 'Image generation complete');

      const successCount = resultsWithMetadata.filter((r) => r.success !== false).length;
      this._logger.log(`Generated ${successCount} images`);

      return resultsWithMetadata;
    } catch (error) {
      this._logger.error('Image generation failed:', error);
      onProgress(0, `Image generation failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Build image generation requests from moments and characters
   *
   * @param {Array<object>} moments - Session moments with image prompts
   * @param {object} entities - Extracted entities
   * @param {number} maxImages - Maximum number of images to generate
   * @param {string} imageQuality - Image quality setting
   * @returns {Array<object>} Array of image generation requests
   * @private
   */
  _buildImageRequests(moments, entities, maxImages, imageQuality) {
    const requests = [];

    // Build image generation requests from moments
    if (moments?.length > 0) {
      for (const moment of moments.slice(0, maxImages)) {
        if (moment.imagePrompt) {
          requests.push({
            entityType: 'scene',
            description: moment.imagePrompt,
            options: { quality: imageQuality },
            meta: { momentId: moment.id, title: moment.title }
          });
        }
      }
    }

    // Add character portraits if we have room
    const remainingSlots = maxImages - requests.length;
    if (remainingSlots > 0 && entities?.characters?.length > 0) {
      const npcs = entities.characters.filter((c) => c.isNPC).slice(0, remainingSlots);

      for (const character of npcs) {
        requests.push({
          entityType: 'character',
          description: `${character.name}: ${character.description}`,
          options: { quality: imageQuality },
          meta: { characterName: character.name }
        });
      }
    }

    return requests;
  }

  /**
   * Update image processing options
   *
   * @param {object} options - New options to merge
   * @param {number} [options.maxImagesPerSession] - Maximum images per session
   * @param {string} [options.imageQuality] - Image quality setting
   */
  updateOptions(options) {
    this._options = { ...this._options, ...options };
    this._logger.debug('Image processing options updated');
  }

  /**
   * Get current image processing options
   *
   * @returns {object} Current options
   */
  getOptions() {
    return { ...this._options };
  }
}

export { ImageProcessor, DEFAULT_IMAGE_OPTIONS };
