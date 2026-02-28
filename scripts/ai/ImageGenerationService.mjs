/**
 * ImageGenerationService - OpenAI gpt-image-1 Image Generation
 *
 * Provides AI image generation using OpenAI's gpt-image-1 model for creating
 * portraits, scene illustrations, and item images for RPG sessions.
 * Generated images are used for Kanka entity portraits and chronicle illustrations.
 *
 * Features base64 caching (OpenAI URLs expire in 60 minutes) and persistent
 * gallery storage via Foundry VTT settings.
 *
 * @class ImageGenerationService
 * @module vox-chronicle
 */

import { OpenAIClient, OpenAIError, OpenAIErrorType } from './OpenAIClient.mjs';
import { Logger } from '../utils/Logger.mjs';
import { CacheManager } from '../utils/CacheManager.mjs';
import { MODULE_ID } from '../constants.mjs';

/**
 * Image generation model options
 * @enum {string}
 */
const ImageModel = {
  /** gpt-image-1 - Current recommended model (dall-e-3 deprecated May 2026) */
  GPT_IMAGE_1: 'gpt-image-1'
};

/**
 * Image size options
 * gpt-image-1 supports: 1024x1024, 1024x1536, 1536x1024
 * @enum {string}
 */
const ImageSize = {
  /** Square format - ideal for portraits and icons */
  SQUARE: '1024x1024',
  /** Portrait/vertical format - ideal for character portraits */
  PORTRAIT: '1024x1536',
  /** Landscape format - ideal for scene illustrations */
  LANDSCAPE: '1536x1024'
};

/**
 * Image quality options
 * @enum {string}
 */
const ImageQuality = {
  /** Low quality - fastest, lowest cost */
  LOW: 'low',
  /** Medium quality - balanced */
  MEDIUM: 'medium',
  /** High quality - highest detail */
  HIGH: 'high',
  /** Auto quality - let the API decide */
  AUTO: 'auto'
};

/**
 * Entity types for prompt building
 * @enum {string}
 */
const EntityType = {
  CHARACTER: 'character',
  LOCATION: 'location',
  ITEM: 'item',
  SCENE: 'scene'
};

/**
 * Default timeout for image generation requests (5 minutes)
 * Image generation typically takes 10-60 seconds
 * @constant {number}
 */
const IMAGE_GENERATION_TIMEOUT_MS = 300000;

/**
 * Image URL expiration time in milliseconds (60 minutes)
 * IMPORTANT: OpenAI image URLs expire after 60 minutes
 * @constant {number}
 */
const IMAGE_URL_EXPIRY_MS = 3600000;

/**
 * Maximum gallery size to prevent excessive storage usage
 * @constant {number}
 */
const MAX_GALLERY_SIZE = 50;

/**
 * ImageGenerationService class for gpt-image-1 image generation
 *
 * @augments OpenAIClient
 * @example
 * const service = new ImageGenerationService('your-api-key');
 * const imageUrl = await service.generatePortrait('character',
 *   'A grizzled dwarf warrior with a braided beard and battle-scarred armor'
 * );
 */
class ImageGenerationService extends OpenAIClient {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('ImageGenerationService');

  /**
   * Default image quality setting
   * @type {string}
   * @private
   */
  _defaultQuality = ImageQuality.HIGH;

  /**
   * Campaign/world style descriptor for consistent aesthetics
   * @type {string}
   * @private
   */
  _campaignStyle = '';

  /**
   * Image cache for base64 data (URLs expire in 60 minutes)
   * @type {CacheManager}
   * @private
   */
  _imageCache = null;

  /**
   * In-memory gallery of generated images
   * @type {Array<object>}
   * @private
   */
  _gallery = [];

  /**
   * Create a new ImageGenerationService instance
   *
   * @param {string} apiKey - OpenAI API key
   * @param {object} [options] - Configuration options
   * @param {string} [options.quality='high'] - Default image quality
   * @param {string} [options.campaignStyle=''] - Campaign/world style descriptor
   * @param {number} [options.timeout=300000] - Request timeout in milliseconds
   */
  constructor(apiKey, options = {}) {
    super(apiKey, {
      ...options,
      timeout: options.timeout || IMAGE_GENERATION_TIMEOUT_MS
    });

    this._defaultQuality = options.quality || ImageQuality.HIGH;
    this._campaignStyle = options.campaignStyle || '';

    // Initialize image cache with 24-hour default TTL
    this._imageCache = new CacheManager({
      name: 'ImageGenerationCache',
      maxSize: 100
    });

    this._gallery = [];

    this._logger.debug('ImageGenerationService initialized with gpt-image-1');
  }

  /**
   * Generate an image for an entity (character, location, item, scene)
   *
   * @param {string} entityType - Type of entity (character, location, item, scene)
   * @param {string} description - Description of what to generate
   * @param {object} [options] - Generation options
   * @param {string} [options.size] - Image size (use ImageSize enum)
   * @param {string} [options.quality] - Image quality (use ImageQuality enum)
   * @param {string} [options.additionalContext] - Additional context for the prompt
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generatePortrait(entityType, description, options = {}) {
    this._logger.debug('generatePortrait called', { entityType, descriptionLength: description?.length, size: options.size, quality: options.quality });
    const t0 = Date.now();

    if (!description || typeof description !== 'string') {
      throw new OpenAIError(
        'Invalid description: expected non-empty string',
        OpenAIErrorType.INVALID_REQUEST_ERROR
      );
    }

    // Validate entity type
    const validEntityType = this._validateEntityType(entityType);

    // Determine appropriate size based on entity type if not specified
    const size = options.size || this._getDefaultSizeForEntityType(validEntityType);
    const quality = options.quality || this._defaultQuality;

    // Build the optimized prompt
    const prompt = this._buildPrompt(validEntityType, description, options.additionalContext);

    this._logger.log(`Generating ${validEntityType} image: ${size}, ${quality} quality`);
    this._logger.debug(`Prompt length: ${prompt.length}, preview: ${prompt.substring(0, 100)}...`);

    // gpt-image-1: no style parameter, no response_format (returns b64_json by default)
    const requestBody = {
      model: ImageModel.GPT_IMAGE_1,
      prompt: prompt,
      n: 1,
      size: size,
      quality: quality
    };

    try {
      const response = await this.post('/images/generations', requestBody);

      // IMPORTANT: URL expires in 60 minutes - cache immediately
      if (!response?.data?.[0]) {
        throw new Error(`Image generation returned no data. Keys: ${Object.keys(response || {}).join(', ')}`);
      }
      const imageData = response.data[0];

      const result = {
        url: imageData.url || '',
        base64: imageData.b64_json || null,
        revisedPrompt: imageData.revised_prompt,
        entityType: validEntityType,
        originalDescription: description,
        size,
        quality,
        generatedAt: Date.now(),
        expiresAt: Date.now() + IMAGE_URL_EXPIRY_MS
      };

      // Cache image as base64 if we got a URL but no base64
      if (result.url && !result.base64) {
        await this._cacheImage(result.url, prompt);
      } else if (result.base64) {
        // Cache the base64 directly
        const cacheKey = CacheManager.generateCacheKey(prompt, 'img');
        const expiresAt = new Date(Date.now() + IMAGE_URL_EXPIRY_MS * 24); // 24 hours for base64
        this._imageCache.set(cacheKey, result.base64, expiresAt, {
          prompt,
          entityType: validEntityType,
          size
        });
      }

      this._logger.log(`Image generated successfully in ${Date.now() - t0}ms`);
      this._logger.debug('generatePortrait result', { durationMs: Date.now() - t0, entityType: validEntityType, size, quality, hasBase64: Boolean(result.base64), hasUrl: Boolean(result.url) });
      return result;
    } catch (error) {
      this._logger.error(`Image generation failed after ${Date.now() - t0}ms: ${error.message}`, { entityType: validEntityType, size, quality });
      throw error;
    }
  }

  /**
   * Generate a character portrait
   *
   * @param {string} description - Character description
   * @param {object} [options] - Generation options
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generateCharacterPortrait(description, options = {}) {
    this._logger.debug('generateCharacterPortrait called', { descriptionLength: description?.length });
    return this.generatePortrait(EntityType.CHARACTER, description, {
      size: options.size || ImageSize.SQUARE,
      ...options
    });
  }

  /**
   * Generate a location illustration
   *
   * @param {string} description - Location description
   * @param {object} [options] - Generation options
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generateLocationImage(description, options = {}) {
    this._logger.debug('generateLocationImage called', { descriptionLength: description?.length });
    return this.generatePortrait(EntityType.LOCATION, description, {
      size: options.size || ImageSize.LANDSCAPE,
      ...options
    });
  }

  /**
   * Generate an item illustration
   *
   * @param {string} description - Item description
   * @param {object} [options] - Generation options
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generateItemImage(description, options = {}) {
    this._logger.debug('generateItemImage called', { descriptionLength: description?.length });
    return this.generatePortrait(EntityType.ITEM, description, {
      size: options.size || ImageSize.SQUARE,
      ...options
    });
  }

  /**
   * Generate a scene illustration for dramatic moments
   *
   * @param {string} description - Scene description
   * @param {object} [options] - Generation options
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generateSceneImage(description, options = {}) {
    this._logger.debug('generateSceneImage called', { descriptionLength: description?.length });
    return this.generatePortrait(EntityType.SCENE, description, {
      size: options.size || ImageSize.LANDSCAPE,
      ...options
    });
  }

  /**
   * Generate multiple images in batch
   * Note: Respects rate limits and processes sequentially
   *
   * @param {Array<object>} requests - Array of generation requests
   * @param {string} requests[].entityType - Entity type
   * @param {string} requests[].description - Description
   * @param {object} [requests[].options] - Options per request
   * @param {Function} [onProgress] - Progress callback
   * @returns {Promise<Array<ImageGenerationResult>>} Array of results
   */
  async generateBatch(requests, onProgress = null) {
    this._logger.debug('generateBatch called', { requestCount: requests?.length });
    const t0 = Date.now();

    if (!Array.isArray(requests) || requests.length === 0) {
      return [];
    }

    const results = [];

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: requests.length,
          progress: ((i + 1) / requests.length) * 100,
          status: 'generating'
        });
      }

      try {
        const result = await this.generatePortrait(
          request.entityType,
          request.description,
          request.options || {}
        );
        results.push({ success: true, ...result });
      } catch (error) {
        this._logger.warn(`Batch item ${i + 1} failed:`, error.message);
        results.push({
          success: false,
          error: error.message,
          entityType: request.entityType,
          description: request.description
        });
      }
    }

    if (onProgress) {
      onProgress({
        current: requests.length,
        total: requests.length,
        progress: 100,
        status: 'complete'
      });
    }

    const successCount = results.filter(r => r.success).length;
    this._logger.debug(`generateBatch completed in ${Date.now() - t0}ms`, { total: requests.length, successCount, failedCount: requests.length - successCount });
    return results;
  }

  /**
   * Download an image from URL before it expires
   * OpenAI image URLs expire in 60 minutes
   *
   * @param {string} url - Image URL to download
   * @returns {Promise<Blob>} Image blob
   */
  async downloadImage(url) {
    this._logger.debug('downloadImage called');
    const t0 = Date.now();

    if (!url) {
      throw new OpenAIError(
        'Invalid URL: expected non-empty string',
        OpenAIErrorType.INVALID_REQUEST_ERROR
      );
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        this._logger.error(`downloadImage failed after ${Date.now() - t0}ms: HTTP ${response.status}`);
        throw new OpenAIError(
          `Failed to download image: ${response.status} ${response.statusText}`,
          OpenAIErrorType.API_ERROR,
          response.status
        );
      }

      const blob = await response.blob();
      this._logger.debug(`Downloaded image in ${Date.now() - t0}ms: ${(blob.size / 1024).toFixed(1)}KB`);
      return blob;
    } catch (error) {
      if (error instanceof OpenAIError) {
        throw error;
      }
      this._logger.error(`downloadImage failed after ${Date.now() - t0}ms: ${error.message}`);
      throw new OpenAIError(
        `Failed to download image: ${error.message}`,
        OpenAIErrorType.NETWORK_ERROR
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Base64 caching (from NM ImageGenerator, adapted to use CacheManager)
  // ---------------------------------------------------------------------------

  /**
   * Download a URL and cache the image as base64
   * OpenAI image URLs expire in 60 minutes, so caching is essential
   *
   * @param {string} url - Image URL to download and cache
   * @param {string} prompt - The prompt used to generate the image (used as cache key)
   * @returns {Promise<string|null>} Base64 encoded image data, or null on failure
   * @private
   */
  async _cacheImage(url, prompt) {
    if (!url) { return null; }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this._logger.warn(`Failed to cache image: HTTP ${response.status}`);
        return null;
      }

      const blob = await response.blob();
      const base64 = await CacheManager.blobToBase64(blob);

      // Store in cache with 24-hour expiry (base64 doesn't expire like URLs)
      const cacheKey = CacheManager.generateCacheKey(prompt, 'img');
      const expiresAt = new Date(Date.now() + IMAGE_URL_EXPIRY_MS * 24);
      this._imageCache.set(cacheKey, base64, expiresAt, { prompt });

      this._logger.debug('Image cached as base64 successfully');
      return base64;
    } catch (error) {
      this._logger.warn('Failed to cache image as base64:', error.message);
      ui?.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Errors.ImageCachingFailed')
          || 'VoxChronicle: Image caching failed — URL expires in 60 minutes.'
      );
      return null;
    }
  }

  /**
   * Get a cached base64 image by prompt
   *
   * @param {string} prompt - The prompt used to generate the image
   * @returns {string|null} Base64 encoded image data, or null if not cached
   */
  getCachedImage(prompt) {
    const cacheKey = CacheManager.generateCacheKey(prompt, 'img');
    return this._imageCache.get(cacheKey);
  }

  /**
   * Get the image cache instance
   *
   * @returns {CacheManager} The cache manager instance
   */
  getImageCache() {
    return this._imageCache;
  }

  // ---------------------------------------------------------------------------
  // Gallery persistence (from NM ImageGenerator)
  // ---------------------------------------------------------------------------

  /**
   * Save an image to the persistent gallery
   * Each gallery entry: { id, prompt, base64, createdAt, size, entityType }
   *
   * @param {object} imageData - Image data to save
   * @param {string} [imageData.id] - Unique identifier (generated if not provided)
   * @param {string} imageData.prompt - The prompt used to generate the image
   * @param {string} [imageData.base64] - Base64 encoded image data
   * @param {string} [imageData.size] - Image size
   * @param {string} [imageData.entityType] - Entity type
   * @returns {Promise<void>}
   */
  async saveToGallery(imageData) {
    this._logger.debug('saveToGallery called', { entityType: imageData?.entityType, hasBase64: Boolean(imageData?.base64) });
    try {
      let gallery = await this.loadGallery();

      const galleryEntry = {
        id: imageData.id || `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        prompt: imageData.prompt || '',
        base64: imageData.base64 || null,
        createdAt: imageData.createdAt || Date.now(),
        size: imageData.size || ImageSize.SQUARE,
        entityType: imageData.entityType || EntityType.SCENE
      };

      gallery.push(galleryEntry);

      // Enforce storage limit
      if (gallery.length > MAX_GALLERY_SIZE) {
        gallery.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const removedCount = gallery.length - MAX_GALLERY_SIZE;
        gallery = gallery.slice(-MAX_GALLERY_SIZE);
        this._logger.warn(`Gallery limit reached. Removed ${removedCount} oldest image(s).`);
      }

      // Update in-memory gallery
      this._gallery = gallery;

      // Persist to settings
      await game.settings.set(MODULE_ID, 'imageGallery', gallery);

      this._logger.debug('Image saved to gallery');
    } catch (error) {
      this._logger.error('Failed to save image to gallery:', error.message);
      globalThis.ui?.notifications?.warn(
        globalThis.game?.i18n?.localize('VOXCHRONICLE.Warnings.ImageGallerySaveFailed')
          || 'VoxChronicle: Failed to save image to gallery. The image may be lost after page reload.'
      );
    }
  }

  /**
   * Load the gallery from persistent storage
   *
   * @returns {Promise<Array<object>>} The gallery array
   */
  async loadGallery() {
    this._logger.debug('loadGallery called');
    try {
      const gallery = await game.settings.get(MODULE_ID, 'imageGallery');
      this._gallery = Array.isArray(gallery) ? gallery : [];
      this._logger.debug(`loadGallery completed, ${this._gallery.length} images loaded`);
      return this._gallery;
    } catch (error) {
      this._logger.warn('Failed to load image gallery:', error.message);
      ui?.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Errors.ImageGalleryLoadFailed')
          || 'VoxChronicle: Could not load image gallery from settings.'
      );
      this._gallery = [];
      return this._gallery;
    }
  }

  /**
   * Clear the entire gallery and persist
   *
   * @returns {Promise<void>}
   */
  async clearGallery() {
    try {
      await game.settings.set(MODULE_ID, 'imageGallery', []);
      this._gallery = [];
      this._logger.info('Gallery cleared');
    } catch (error) {
      this._logger.error('Failed to clear gallery:', error.message);
      ui?.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Errors.GalleryClearFailed') ||
        'VoxChronicle: Failed to clear image gallery.'
      );
    }
  }

  /**
   * Get the current in-memory gallery
   *
   * @returns {Array<object>} Current gallery entries
   */
  getGallery() {
    return [...this._gallery];
  }

  // ---------------------------------------------------------------------------
  // URL validation
  // ---------------------------------------------------------------------------

  /**
   * Check if an image URL is still valid (not expired)
   *
   * @param {ImageGenerationResult} result - Image generation result
   * @returns {boolean} True if URL is still valid
   */
  isUrlValid(result) {
    if (!result || !result.expiresAt) {
      return false;
    }
    return Date.now() < result.expiresAt;
  }

  /**
   * Get time until URL expiration
   *
   * @param {ImageGenerationResult} result - Image generation result
   * @returns {number} Milliseconds until expiration (0 if expired)
   */
  getTimeUntilExpiry(result) {
    if (!result || !result.expiresAt) {
      return 0;
    }
    const remaining = result.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  // ---------------------------------------------------------------------------
  // Prompt building
  // ---------------------------------------------------------------------------

  /**
   * Build an optimized prompt for the entity type
   *
   * @param {string} entityType - Type of entity
   * @param {string} description - Base description
   * @param {string} [additionalContext] - Additional context
   * @returns {string} Optimized prompt
   * @private
   */
  _buildPrompt(entityType, description, additionalContext = '') {
    // Base prompt templates for each entity type
    const promptTemplates = {
      [EntityType.CHARACTER]: `Fantasy RPG character portrait: ${description}. Detailed, high quality, dramatic lighting, painterly style.`,
      [EntityType.LOCATION]: `Fantasy RPG location scene: ${description}. Wide shot, atmospheric, detailed environment, cinematic composition.`,
      [EntityType.ITEM]: `Fantasy RPG item illustration: ${description}. Centered, detailed, on simple background, magical glow effects.`,
      [EntityType.SCENE]: `Fantasy RPG dramatic scene: ${description}. Cinematic composition, dynamic lighting, epic atmosphere.`
    };

    let prompt = promptTemplates[entityType] || promptTemplates[EntityType.SCENE];

    // Add campaign style if set
    if (this._campaignStyle) {
      prompt += ` Style: ${this._campaignStyle}.`;
    }

    // Add additional context if provided
    if (additionalContext) {
      prompt += ` ${additionalContext}`;
    }

    // Ensure prompt doesn't exceed limits (gpt-image-1 has a 32000 character limit,
    // but keeping 4000 as practical limit for quality)
    if (prompt.length > 4000) {
      prompt = `${prompt.substring(0, 3997)}...`;
      this._logger.warn('Prompt was truncated to 4000 characters');
    }

    return prompt;
  }

  /**
   * Validate and normalize entity type
   *
   * @param {string} entityType - Entity type to validate
   * @returns {string} Validated entity type
   * @private
   */
  _validateEntityType(entityType) {
    const normalized = (entityType || '').toLowerCase();

    // Map common aliases
    const aliases = {
      npc: EntityType.CHARACTER,
      pc: EntityType.CHARACTER,
      player: EntityType.CHARACTER,
      person: EntityType.CHARACTER,
      place: EntityType.LOCATION,
      area: EntityType.LOCATION,
      room: EntityType.LOCATION,
      weapon: EntityType.ITEM,
      armor: EntityType.ITEM,
      artifact: EntityType.ITEM,
      object: EntityType.ITEM,
      moment: EntityType.SCENE,
      event: EntityType.SCENE,
      battle: EntityType.SCENE
    };

    if (Object.values(EntityType).includes(normalized)) {
      return normalized;
    }

    if (aliases[normalized]) {
      return aliases[normalized];
    }

    // Default to scene for unknown types
    this._logger.warn(`Unknown entity type "${entityType}", defaulting to scene`);
    return EntityType.SCENE;
  }

  /**
   * Get default image size for entity type
   *
   * @param {string} entityType - Entity type
   * @returns {string} Default size
   * @private
   */
  _getDefaultSizeForEntityType(entityType) {
    switch (entityType) {
      case EntityType.CHARACTER:
        return ImageSize.SQUARE; // Portraits are typically square
      case EntityType.LOCATION:
        return ImageSize.LANDSCAPE; // Locations benefit from wide shots
      case EntityType.ITEM:
        return ImageSize.SQUARE; // Items are typically centered
      case EntityType.SCENE:
        return ImageSize.LANDSCAPE; // Scenes are cinematic
      default:
        return ImageSize.SQUARE;
    }
  }

  // ---------------------------------------------------------------------------
  // Settings management
  // ---------------------------------------------------------------------------

  /**
   * Set the campaign style descriptor
   *
   * @param {string} style - Style descriptor (e.g., "dark fantasy", "steampunk", "anime")
   */
  setCampaignStyle(style) {
    this._campaignStyle = style || '';
    this._logger.debug(`Set campaign style: ${this._campaignStyle || '(none)'}`);
  }

  /**
   * Get the current campaign style
   *
   * @returns {string} Current campaign style
   */
  getCampaignStyle() {
    return this._campaignStyle;
  }

  /**
   * Set default quality setting
   *
   * @param {string} quality - Quality setting (use ImageQuality enum)
   */
  setDefaultQuality(quality) {
    if (Object.values(ImageQuality).includes(quality)) {
      this._defaultQuality = quality;
      this._logger.debug(`Set default quality: ${quality}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Cost estimation
  // ---------------------------------------------------------------------------

  /**
   * Estimate generation cost for an image
   * gpt-image-1 pricing (approximate):
   *   - low quality: ~$0.02/image (small), ~$0.04/image (medium/square)
   *   - medium/standard quality: ~$0.04/image (square), ~$0.08/image (landscape/portrait)
   *   - high/hd quality: ~$0.08/image (square), ~$0.12/image (landscape/portrait)
   *
   * @param {string} [quality='high'] - Image quality
   * @param {string} [size='1024x1024'] - Image size
   * @returns {object} Cost estimate
   */
  estimateCost(quality = ImageQuality.HIGH, size = ImageSize.SQUARE) {
    const isLarge = size === ImageSize.PORTRAIT || size === ImageSize.LANDSCAPE;

    let price;
    if (quality === ImageQuality.LOW) {
      price = isLarge ? 0.04 : 0.03;
    } else if (quality === ImageQuality.HIGH) {
      price = isLarge ? 0.12 : 0.08;
    } else {
      price = isLarge ? 0.08 : 0.04;
    }

    return {
      quality,
      size,
      estimatedCostUSD: price,
      model: ImageModel.GPT_IMAGE_1
    };
  }

  // ---------------------------------------------------------------------------
  // Static metadata methods
  // ---------------------------------------------------------------------------

  /**
   * Get available image sizes
   *
   * @returns {Array<object>} List of available sizes
   */
  static getAvailableSizes() {
    return [
      {
        id: ImageSize.SQUARE,
        name: 'Square (1024x1024)',
        description: 'Best for portraits and icons',
        aspectRatio: '1:1'
      },
      {
        id: ImageSize.PORTRAIT,
        name: 'Portrait (1024x1536)',
        description: 'Vertical format for full-body characters',
        aspectRatio: '2:3'
      },
      {
        id: ImageSize.LANDSCAPE,
        name: 'Landscape (1536x1024)',
        description: 'Wide format for scenes and locations',
        aspectRatio: '3:2'
      }
    ];
  }

  /**
   * Get available quality options
   *
   * @returns {Array<object>} List of quality options
   */
  static getAvailableQualities() {
    return [
      {
        id: ImageQuality.LOW,
        name: 'Low',
        description: 'Fastest generation, lower detail',
        costMultiplier: 0.5
      },
      {
        id: ImageQuality.MEDIUM,
        name: 'Medium',
        description: 'Good quality, balanced generation',
        costMultiplier: 1
      },
      {
        id: ImageQuality.HIGH,
        name: 'High',
        description: 'Highest detail and consistency',
        costMultiplier: 2
      },
      {
        id: ImageQuality.AUTO,
        name: 'Auto',
        description: 'Let the API choose quality',
        costMultiplier: 1
      }
    ];
  }

  /**
   * Get entity type options
   *
   * @returns {Array<object>} List of entity types
   */
  static getEntityTypes() {
    return [
      {
        id: EntityType.CHARACTER,
        name: 'Character',
        description: 'NPCs, players, and other individuals',
        defaultSize: ImageSize.SQUARE
      },
      {
        id: EntityType.LOCATION,
        name: 'Location',
        description: 'Places, environments, and settings',
        defaultSize: ImageSize.LANDSCAPE
      },
      {
        id: EntityType.ITEM,
        name: 'Item',
        description: 'Weapons, armor, artifacts, and objects',
        defaultSize: ImageSize.SQUARE
      },
      {
        id: EntityType.SCENE,
        name: 'Scene',
        description: 'Dramatic moments and events',
        defaultSize: ImageSize.LANDSCAPE
      }
    ];
  }
}

/**
 * @typedef {object} ImageGenerationResult
 * @property {string} url - Generated image URL (expires in 60 minutes!)
 * @property {string} [base64] - Base64 encoded image data (if returned by API or cached)
 * @property {string} [revisedPrompt] - Prompt as revised by the model
 * @property {string} entityType - Type of entity generated
 * @property {string} originalDescription - Original description provided
 * @property {string} size - Image size
 * @property {string} quality - Image quality
 * @property {number} generatedAt - Timestamp when image was generated
 * @property {number} expiresAt - Timestamp when URL expires
 */

// Export all classes and enums
export {
  ImageGenerationService,
  ImageModel,
  ImageSize,
  ImageQuality,
  EntityType,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_URL_EXPIRY_MS,
  MAX_GALLERY_SIZE
};
