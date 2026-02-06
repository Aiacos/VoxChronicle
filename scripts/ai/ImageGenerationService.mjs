/**
 * ImageGenerationService - OpenAI DALL-E 3 Image Generation
 *
 * Provides AI image generation using OpenAI's DALL-E 3 model for creating
 * portraits, scene illustrations, and item images for RPG sessions.
 * Generated images are used for Kanka entity portraits and chronicle illustrations.
 *
 * @class ImageGenerationService
 * @module vox-chronicle
 */

import { OpenAIClient, OpenAIError, OpenAIErrorType } from './OpenAIClient.mjs';
import { Logger } from '../utils/Logger.mjs';

/**
 * Image generation model options
 * @enum {string}
 */
const ImageModel = {
  /** DALL-E 3 - Latest, highest quality model */
  DALLE_3: 'dall-e-3',
  /** DALL-E 2 - Faster, lower cost option */
  DALLE_2: 'dall-e-2'
};

/**
 * Image size options
 * Note: DALL-E 3 only supports 1024x1024, 1024x1792, 1792x1024
 * @enum {string}
 */
const ImageSize = {
  /** Square format - ideal for portraits and icons */
  SQUARE: '1024x1024',
  /** Portrait/vertical format - ideal for character portraits */
  PORTRAIT: '1024x1792',
  /** Landscape format - ideal for scene illustrations */
  LANDSCAPE: '1792x1024'
};

/**
 * Image quality options (DALL-E 3 only)
 * @enum {string}
 */
const ImageQuality = {
  /** Standard quality - faster, lower cost */
  STANDARD: 'standard',
  /** HD quality - more detail and consistency */
  HD: 'hd'
};

/**
 * Image style options (DALL-E 3 only)
 * @enum {string}
 */
const ImageStyle = {
  /** Vivid - hyper-real and dramatic */
  VIVID: 'vivid',
  /** Natural - more realistic, less stylized */
  NATURAL: 'natural'
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
 * ImageGenerationService class for DALL-E 3 image generation
 *
 * @extends OpenAIClient
 * @example
 * const service = new ImageGenerationService('your-api-key');
 * const imageUrl = await service.generatePortrait('character',
 *   'A grizzled dwarf warrior with a braided beard and battle-scarred armor'
 * );
 */
class ImageGenerationService extends OpenAIClient {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('ImageGenerationService');

  /**
   * Default image quality setting
   * @type {string}
   * @private
   */
  _defaultQuality = ImageQuality.STANDARD;

  /**
   * Default image style setting
   * @type {string}
   * @private
   */
  _defaultStyle = ImageStyle.VIVID;

  /**
   * Campaign/world style descriptor for consistent aesthetics
   * @type {string}
   * @private
   */
  _campaignStyle = '';

  /**
   * Create a new ImageGenerationService instance
   *
   * @param {string} apiKey - OpenAI API key
   * @param {Object} [options] - Configuration options
   * @param {string} [options.quality='standard'] - Default image quality
   * @param {string} [options.style='vivid'] - Default image style
   * @param {string} [options.campaignStyle=''] - Campaign/world style descriptor
   * @param {number} [options.timeout=300000] - Request timeout in milliseconds
   */
  constructor(apiKey, options = {}) {
    super(apiKey, {
      ...options,
      timeout: options.timeout || IMAGE_GENERATION_TIMEOUT_MS
    });

    this._defaultQuality = options.quality || ImageQuality.STANDARD;
    this._defaultStyle = options.style || ImageStyle.VIVID;
    this._campaignStyle = options.campaignStyle || '';

    this._logger.debug('ImageGenerationService initialized');
  }

  /**
   * Generate an image for an entity (character, location, item, scene)
   *
   * @param {string} entityType - Type of entity (character, location, item, scene)
   * @param {string} description - Description of what to generate
   * @param {Object} [options] - Generation options
   * @param {string} [options.size] - Image size (use ImageSize enum)
   * @param {string} [options.quality] - Image quality (use ImageQuality enum)
   * @param {string} [options.style] - Image style (use ImageStyle enum)
   * @param {string} [options.additionalContext] - Additional context for the prompt
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generatePortrait(entityType, description, options = {}) {
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
    const style = options.style || this._defaultStyle;

    // Build the optimized prompt
    const prompt = this._buildPrompt(validEntityType, description, options.additionalContext);

    this._logger.log(`Generating ${validEntityType} image: ${size}, ${quality} quality`);
    this._logger.debug(`Prompt: ${prompt.substring(0, 100)}...`);

    const requestBody = {
      model: ImageModel.DALLE_3, // MUST specify dall-e-3, defaults to dall-e-2
      prompt: prompt,
      n: 1, // DALL-E 3 only supports n=1
      size: size,
      quality: quality,
      style: style,
      response_format: 'url' // Returns URL instead of base64
    };

    try {
      const response = await this.post('/images/generations', requestBody);

      // IMPORTANT: URL expires in 60 minutes - save immediately
      const imageData = response.data[0];

      const result = {
        url: imageData.url,
        revisedPrompt: imageData.revised_prompt, // DALL-E 3 may revise the prompt
        entityType: validEntityType,
        originalDescription: description,
        size,
        quality,
        style,
        generatedAt: Date.now(),
        expiresAt: Date.now() + IMAGE_URL_EXPIRY_MS
      };

      this._logger.log('Image generated successfully');
      return result;

    } catch (error) {
      this._logger.error('Image generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate a character portrait
   *
   * @param {string} description - Character description
   * @param {Object} [options] - Generation options
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generateCharacterPortrait(description, options = {}) {
    return this.generatePortrait(EntityType.CHARACTER, description, {
      size: options.size || ImageSize.SQUARE,
      ...options
    });
  }

  /**
   * Generate a location illustration
   *
   * @param {string} description - Location description
   * @param {Object} [options] - Generation options
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generateLocationImage(description, options = {}) {
    return this.generatePortrait(EntityType.LOCATION, description, {
      size: options.size || ImageSize.LANDSCAPE,
      ...options
    });
  }

  /**
   * Generate an item illustration
   *
   * @param {string} description - Item description
   * @param {Object} [options] - Generation options
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generateItemImage(description, options = {}) {
    return this.generatePortrait(EntityType.ITEM, description, {
      size: options.size || ImageSize.SQUARE,
      ...options
    });
  }

  /**
   * Generate a scene illustration for dramatic moments
   *
   * @param {string} description - Scene description
   * @param {Object} [options] - Generation options
   * @returns {Promise<ImageGenerationResult>} Generated image result
   */
  async generateSceneImage(description, options = {}) {
    return this.generatePortrait(EntityType.SCENE, description, {
      size: options.size || ImageSize.LANDSCAPE,
      ...options
    });
  }

  /**
   * Generate multiple images in batch
   * Note: Respects rate limits and processes sequentially
   *
   * @param {Array<Object>} requests - Array of generation requests
   * @param {string} requests[].entityType - Entity type
   * @param {string} requests[].description - Description
   * @param {Object} [requests[].options] - Options per request
   * @param {Function} [onProgress] - Progress callback
   * @returns {Promise<Array<ImageGenerationResult>>} Array of results
   */
  async generateBatch(requests, onProgress = null) {
    if (!Array.isArray(requests) || requests.length === 0) {
      return [];
    }

    const results = [];
    const errors = [];

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
        errors.push(error);
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
    if (!url) {
      throw new OpenAIError(
        'Invalid URL: expected non-empty string',
        OpenAIErrorType.INVALID_REQUEST_ERROR
      );
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new OpenAIError(
          `Failed to download image: ${response.status} ${response.statusText}`,
          OpenAIErrorType.API_ERROR,
          response.status
        );
      }

      const blob = await response.blob();
      this._logger.debug(`Downloaded image: ${(blob.size / 1024).toFixed(1)}KB`);
      return blob;

    } catch (error) {
      if (error instanceof OpenAIError) {
        throw error;
      }
      throw new OpenAIError(
        `Failed to download image: ${error.message}`,
        OpenAIErrorType.NETWORK_ERROR
      );
    }
  }

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

    // Ensure prompt doesn't exceed limits (DALL-E 3 has a 4000 character limit)
    if (prompt.length > 4000) {
      prompt = prompt.substring(0, 3997) + '...';
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
      'npc': EntityType.CHARACTER,
      'pc': EntityType.CHARACTER,
      'player': EntityType.CHARACTER,
      'person': EntityType.CHARACTER,
      'place': EntityType.LOCATION,
      'area': EntityType.LOCATION,
      'room': EntityType.LOCATION,
      'weapon': EntityType.ITEM,
      'armor': EntityType.ITEM,
      'artifact': EntityType.ITEM,
      'object': EntityType.ITEM,
      'moment': EntityType.SCENE,
      'event': EntityType.SCENE,
      'battle': EntityType.SCENE
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

  /**
   * Set default style setting
   *
   * @param {string} style - Style setting (use ImageStyle enum)
   */
  setDefaultStyle(style) {
    if (Object.values(ImageStyle).includes(style)) {
      this._defaultStyle = style;
      this._logger.debug(`Set default style: ${style}`);
    }
  }

  /**
   * Estimate generation cost for an image
   *
   * @param {string} [quality='standard'] - Image quality
   * @param {string} [size='1024x1024'] - Image size
   * @returns {Object} Cost estimate
   */
  estimateCost(quality = ImageQuality.STANDARD, size = ImageSize.SQUARE) {
    // Pricing as of spec (subject to change)
    const pricing = {
      [ImageQuality.STANDARD]: {
        [ImageSize.SQUARE]: 0.04,
        [ImageSize.PORTRAIT]: 0.08,
        [ImageSize.LANDSCAPE]: 0.08
      },
      [ImageQuality.HD]: {
        [ImageSize.SQUARE]: 0.08,
        [ImageSize.PORTRAIT]: 0.12,
        [ImageSize.LANDSCAPE]: 0.12
      }
    };

    const qualityPricing = pricing[quality] || pricing[ImageQuality.STANDARD];
    const price = qualityPricing[size] || qualityPricing[ImageSize.SQUARE];

    return {
      quality,
      size,
      estimatedCostUSD: price,
      model: ImageModel.DALLE_3
    };
  }

  /**
   * Get available image sizes
   *
   * @returns {Array<Object>} List of available sizes
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
        name: 'Portrait (1024x1792)',
        description: 'Vertical format for full-body characters',
        aspectRatio: '9:16'
      },
      {
        id: ImageSize.LANDSCAPE,
        name: 'Landscape (1792x1024)',
        description: 'Wide format for scenes and locations',
        aspectRatio: '16:9'
      }
    ];
  }

  /**
   * Get available quality options
   *
   * @returns {Array<Object>} List of quality options
   */
  static getAvailableQualities() {
    return [
      {
        id: ImageQuality.STANDARD,
        name: 'Standard',
        description: 'Good quality, faster generation',
        costMultiplier: 1
      },
      {
        id: ImageQuality.HD,
        name: 'HD',
        description: 'Higher detail and consistency',
        costMultiplier: 2
      }
    ];
  }

  /**
   * Get available style options
   *
   * @returns {Array<Object>} List of style options
   */
  static getAvailableStyles() {
    return [
      {
        id: ImageStyle.VIVID,
        name: 'Vivid',
        description: 'Hyper-real, dramatic, and stylized'
      },
      {
        id: ImageStyle.NATURAL,
        name: 'Natural',
        description: 'More realistic and subtle'
      }
    ];
  }

  /**
   * Get entity type options
   *
   * @returns {Array<Object>} List of entity types
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
 * @typedef {Object} ImageGenerationResult
 * @property {string} url - Generated image URL (expires in 60 minutes!)
 * @property {string} [revisedPrompt] - Prompt as revised by DALL-E 3
 * @property {string} entityType - Type of entity generated
 * @property {string} originalDescription - Original description provided
 * @property {string} size - Image size
 * @property {string} quality - Image quality
 * @property {string} style - Image style
 * @property {number} generatedAt - Timestamp when image was generated
 * @property {number} expiresAt - Timestamp when URL expires
 */

// Export all classes and enums
export {
  ImageGenerationService,
  ImageModel,
  ImageSize,
  ImageQuality,
  ImageStyle,
  EntityType,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_URL_EXPIRY_MS
};
