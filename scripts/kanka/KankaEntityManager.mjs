/**
 * KankaEntityManager - Generic CRUD Operations for Kanka Entities
 *
 * Provides generic entity management methods that work across all Kanka entity types.
 * This utility class eliminates code duplication by providing a common interface for
 * CRUD operations (Create, Read, Update, Delete) that can be reused by higher-level
 * services like KankaService.
 *
 * Uses composition over inheritance - accepts a KankaClient instance to perform
 * the actual API requests.
 *
 * @class KankaEntityManager
 * @module vox-chronicle
 * @see https://api.kanka.io/docs/
 */

import { KankaError, KankaErrorType } from './KankaClient.mjs';
import { Logger } from '../utils/Logger.mjs';

/**
 * KankaEntityManager class for generic entity CRUD operations
 *
 * Provides reusable methods for creating, reading, updating, deleting, and listing
 * any Kanka entity type. This class uses composition - it requires a KankaClient
 * instance to handle the actual HTTP requests.
 *
 * @example
 * const client = new KankaClient('api-token');
 * const manager = new KankaEntityManager(client, 'campaign-id');
 *
 * // Create a journal
 * const journal = await manager.create('journals', {
 *   name: 'Session 1',
 *   entry: 'The adventure begins...'
 * });
 *
 * // Get a character
 * const character = await manager.get('characters', 123);
 *
 * // List locations
 * const locations = await manager.list('locations', { page: 1 });
 */
class KankaEntityManager {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('KankaEntityManager');

  /**
   * KankaClient instance for API requests
   * @type {Object}
   * @private
   */
  _client = null;

  /**
   * Campaign ID for all operations
   * @type {string}
   * @private
   */
  _campaignId = '';

  /**
   * Create a new KankaEntityManager instance
   *
   * @param {Object} client - KankaClient instance for making API requests
   * @param {string} campaignId - Kanka campaign ID
   */
  constructor(client, campaignId) {
    if (!client) {
      throw new KankaError(
        'KankaClient instance is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    this._client = client;
    this._campaignId = campaignId || '';
    this._logger = Logger.createChild('KankaEntityManager');
    this._logger.debug(`KankaEntityManager initialized for campaign: ${campaignId}`);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get the current campaign ID
   *
   * @returns {string} Campaign ID
   */
  get campaignId() {
    return this._campaignId;
  }

  /**
   * Set the campaign ID
   *
   * @param {string} campaignId - New campaign ID
   */
  setCampaignId(campaignId) {
    this._campaignId = campaignId || '';
    this._logger.debug(`Campaign ID updated: ${campaignId}`);
  }

  /**
   * Build campaign-scoped endpoint
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations')
   * @param {string|number} [entityId] - Optional entity ID for specific entity operations
   * @returns {string} Full endpoint path
   * @private
   */
  _buildCampaignEndpoint(entityType, entityId = null) {
    if (!this._campaignId) {
      throw new KankaError(
        'Campaign ID not configured. Please set your Kanka campaign in module settings.',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const baseEndpoint = `/campaigns/${this._campaignId}/${entityType}`;
    return entityId ? `${baseEndpoint}/${entityId}` : baseEndpoint;
  }

  // ============================================================================
  // Generic CRUD Operations
  // ============================================================================

  /**
   * Create a new entity
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations', 'items')
   * @param {Object} entityData - Entity data
   * @param {string} entityData.name - Entity name (required for all entities)
   * @param {string} [entityData.entry] - Entity description/entry
   * @param {string} [entityData.type] - Entity type/subtype
   * @param {boolean} [entityData.is_private] - Whether entity is private
   * @param {...*} [entityData.*] - Additional entity-specific fields
   * @returns {Promise<Object>} Created entity data
   * @throws {KankaError} If validation fails or API request fails
   *
   * @example
   * const journal = await manager.create('journals', {
   *   name: 'Session 1 Chronicle',
   *   entry: 'The party met in a tavern...',
   *   type: 'Session Chronicle',
   *   date: '2024-01-15'
   * });
   */
  async create(entityType, entityData) {
    // Validate required fields
    if (!entityData?.name) {
      throw new KankaError(
        `Entity name is required for ${entityType}`,
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildCampaignEndpoint(entityType);

    // Build base payload with common fields
    const payload = {
      name: entityData.name,
      entry: entityData.entry || '',
      is_private: entityData.is_private ?? false
    };

    // Add type if provided (some entities use it, some don't)
    if (entityData.type !== undefined) {
      payload.type = entityData.type;
    }

    // Copy all other fields from entityData to payload
    // This handles entity-specific fields like character.age, location.parent_location_id, etc.
    for (const [key, value] of Object.entries(entityData)) {
      // Skip fields we've already handled or fields that shouldn't be sent
      if (key === 'name' || key === 'entry' || key === 'is_private' || key === 'type') {
        continue;
      }

      // Only include non-null, non-undefined values
      if (value !== null && value !== undefined) {
        // Special handling for arrays (like tags) - only include if not empty
        if (Array.isArray(value)) {
          if (value.length > 0) {
            payload[key] = value;
          }
        } else {
          payload[key] = value;
        }
      }
    }

    this._logger.log(`Creating ${entityType}: ${entityData.name}`);
    const response = await this._client.post(endpoint, payload);
    this._logger.log(`${entityType} created with ID: ${response.data?.id}`);

    return response.data;
  }

  /**
   * Get an entity by ID
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations', 'items')
   * @param {string|number} entityId - Entity ID
   * @returns {Promise<Object>} Entity data
   * @throws {KankaError} If entity not found or API request fails
   *
   * @example
   * const character = await manager.get('characters', 123);
   */
  async get(entityType, entityId) {
    const endpoint = this._buildCampaignEndpoint(entityType, entityId);
    this._logger.debug(`Fetching ${entityType}: ${entityId}`);
    const response = await this._client.get(endpoint);
    return response.data;
  }

  /**
   * Update an entity
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations', 'items')
   * @param {string|number} entityId - Entity ID
   * @param {Object} entityData - Updated entity data (partial updates supported)
   * @returns {Promise<Object>} Updated entity data
   * @throws {KankaError} If entity not found or API request fails
   *
   * @example
   * const updated = await manager.update('characters', 123, {
   *   name: 'Updated Name',
   *   age: 30
   * });
   */
  async update(entityType, entityId, entityData) {
    const endpoint = this._buildCampaignEndpoint(entityType, entityId);
    this._logger.debug(`Updating ${entityType}: ${entityId}`);
    const response = await this._client.put(endpoint, entityData);
    return response.data;
  }

  /**
   * Delete an entity
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations', 'items')
   * @param {string|number} entityId - Entity ID
   * @returns {Promise<void>}
   * @throws {KankaError} If entity not found or API request fails
   *
   * @example
   * await manager.delete('items', 456);
   */
  async delete(entityType, entityId) {
    const endpoint = this._buildCampaignEndpoint(entityType, entityId);
    this._logger.debug(`Deleting ${entityType}: ${entityId}`);
    await this._client.delete(endpoint);
    this._logger.log(`${entityType} deleted: ${entityId}`);
  }

  /**
   * List entities with optional filtering and pagination
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations', 'items')
   * @param {Object} [options] - List options
   * @param {number} [options.page] - Page number for pagination
   * @param {string} [options.type] - Filter by entity type/subtype
   * @param {string} [options.name] - Filter by name (partial match)
   * @param {string|number} [options.location_id] - Filter by location ID
   * @param {string|number} [options.character_id] - Filter by character ID
   * @param {boolean} [options.is_private] - Filter by privacy status
   * @param {...*} [options.*] - Additional entity-specific filters
   * @returns {Promise<Object>} Paginated entity list with data, meta, and links
   * @returns {Array} returns.data - Array of entities
   * @returns {Object} returns.meta - Pagination metadata
   * @returns {Object} returns.links - Pagination links
   * @throws {KankaError} If API request fails
   *
   * @example
   * const result = await manager.list('characters', {
   *   page: 1,
   *   type: 'NPC',
   *   location_id: 789
   * });
   * console.log(result.data); // Array of characters
   * console.log(result.meta); // { current_page: 1, total: 50, ... }
   */
  async list(entityType, options = {}) {
    let endpoint = this._buildCampaignEndpoint(entityType);

    // Build query parameters from options
    const params = [];
    for (const [key, value] of Object.entries(options)) {
      if (value !== null && value !== undefined) {
        // Encode the value properly for URL
        const encodedValue = encodeURIComponent(value);
        params.push(`${key}=${encodedValue}`);
      }
    }

    // Append query parameters to endpoint
    if (params.length) {
      endpoint += `?${params.join('&')}`;
    }

    this._logger.debug(`Fetching ${entityType} list`);
    const response = await this._client.get(endpoint);

    return {
      data: response.data || [],
      meta: response.meta || {},
      links: response.links || {}
    };
  }

  // ============================================================================
  // Image Upload Operations
  // ============================================================================

  /**
   * Upload an image to an entity
   *
   * Downloads the image if a URL is provided, then uploads it as a portrait/image
   * for the specified entity. Kanka accepts images via multipart form data.
   *
   * @param {string} entityType - Entity type (e.g., 'characters', 'locations', 'items')
   * @param {string|number} entityId - Entity ID
   * @param {string|Blob} imageSource - Image URL or Blob
   * @param {Object} [options] - Upload options
   * @param {string} [options.filename='portrait.png'] - Filename for the upload
   * @returns {Promise<Object>} Updated entity data with image
   * @throws {KankaError} If validation fails or upload fails
   *
   * @example
   * // Upload from URL
   * const updated = await manager.uploadImage('characters', 123,
   *   'https://example.com/portrait.jpg'
   * );
   *
   * // Upload from Blob
   * const blob = new Blob([imageData], { type: 'image/png' });
   * const updated = await manager.uploadImage('characters', 123, blob, {
   *   filename: 'custom-name.png'
   * });
   */
  async uploadImage(entityType, entityId, imageSource, options = {}) {
    if (!entityType || !entityId) {
      throw new KankaError(
        'Entity type and ID are required for image upload',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    let imageBlob;

    // If imageSource is a URL, download it first
    if (typeof imageSource === 'string') {
      this._logger.debug(`Downloading image from URL: ${imageSource.substring(0, 50)}...`);

      try {
        const response = await fetch(imageSource);
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`);
        }
        imageBlob = await response.blob();
      } catch (error) {
        throw new KankaError(
          `Failed to download image: ${error.message}`,
          KankaErrorType.API_ERROR,
          null,
          { originalError: error }
        );
      }
    } else if (imageSource instanceof Blob) {
      imageBlob = imageSource;
    } else {
      throw new KankaError(
        'Image source must be a URL string or Blob',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    // Determine filename
    const filename = options.filename || 'portrait.png';

    // Create FormData for upload
    const formData = new FormData();
    formData.append('image', imageBlob, filename);

    // Build endpoint for image upload
    const endpoint = this._buildCampaignEndpoint(entityType, entityId);

    this._logger.log(`Uploading image to ${entityType}: ${entityId}`);
    const response = await this._client.postFormData(endpoint, formData);
    this._logger.log(`Image uploaded successfully to ${entityType}: ${entityId}`);

    return response.data;
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  /**
   * Search for entities by name in the campaign
   *
   * @param {string} query - Search query (searches in entity names)
   * @param {string} [entityType] - Limit search to specific entity type
   * @returns {Promise<Array>} Matching entities
   * @throws {KankaError} If API request fails
   *
   * @example
   * // Search all entity types
   * const results = await manager.searchEntities('Dragon');
   *
   * // Search only characters
   * const characters = await manager.searchEntities('Dragon', 'characters');
   */
  async searchEntities(query, entityType = null) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const params = [`name=${encodeURIComponent(query)}`];

    if (entityType) {
      const endpoint = this._buildCampaignEndpoint(entityType);
      this._logger.debug(`Searching ${entityType} for: ${query}`);
      const response = await this._client.get(`${endpoint}?${params.join('&')}`);
      return response.data || [];
    }

    // If no specific entity type, search across common types
    // Note: This requires multiple API calls, so use with caution
    this._logger.debug(`Searching all entities for: ${query}`);
    const results = [];

    const types = [
      'characters',
      'locations',
      'items',
      'journals',
      'organisations',
      'quests'
    ];

    // Search each entity type
    for (const type of types) {
      try {
        const endpoint = this._buildCampaignEndpoint(type);
        const response = await this._client.get(`${endpoint}?${params.join('&')}`);
        if (response.data?.length) {
          // Add entity type to each result for identification
          const typedResults = response.data.map(entity => ({
            ...entity,
            entity_type: type
          }));
          results.push(...typedResults);
        }
      } catch (error) {
        // Log error but continue searching other types
        this._logger.warn(`Failed to search ${type}: ${error.message}`);
      }
    }

    return results;
  }
}

// Export the class
export { KankaEntityManager };
