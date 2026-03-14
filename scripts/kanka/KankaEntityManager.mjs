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
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('KankaEntityManager');

  /**
   * KankaClient instance for API requests
   * @type {object}
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
   * Cache of search results
   * @type {Map<string, Array<object>>}
   * @private
   */
  _searchCache = new Map();

  /**
   * Cache expiry time in milliseconds (5 minutes)
   * @type {number}
   * @private
   */
  _cacheExpiryMs = 300000;

  /**
   * Timestamps for cache entries
   * @type {Map<string, number>}
   * @private
   */
  _cacheTimestamps = new Map();

  /**
   * Create a new KankaEntityManager instance
   *
   * @param {object} client - KankaClient instance for making API requests
   * @param {string} campaignId - Kanka campaign ID
   * @param {object} [options] - Configuration options
   * @param {number} [options.cacheExpiryMs=300000] - Cache expiry time in milliseconds
   */
  constructor(client, campaignId, options = {}) {
    if (!client) {
      throw new KankaError('KankaClient instance is required', KankaErrorType.VALIDATION_ERROR);
    }

    this._client = client;
    this._campaignId = campaignId || '';
    this._cacheExpiryMs = options.cacheExpiryMs ?? 300000;
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
   * Creates any type of Kanka entity with a generic interface. This method handles
   * the common fields (name, entry, is_private, type) and automatically passes through
   * all entity-specific fields to the API.
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations', 'items')
   * @param {object} entityData - Entity data
   * @param {string} entityData.name - Entity name (required for all entities)
   * @param {string} [entityData.entry] - Entity description/entry (HTML/Markdown supported)
   * @param {string} [entityData.type] - Entity type/subtype (e.g., 'NPC' for characters, 'City' for locations)
   * @param {boolean} [entityData.is_private] - Whether entity is private (default: false)
   * @param {...*} [entityData.*] - Additional entity-specific fields (e.g., age, location_id, parent_location_id)
   * @returns {Promise<object>} Created entity data from Kanka API
   * @throws {KankaError} If validation fails or API request fails
   *
   * @example
   * // Create a journal entry
   * const journal = await manager.create('journals', {
   *   name: 'Session 1 Chronicle',
   *   entry: 'The party met in a tavern...',
   *   type: 'Session Chronicle',
   *   date: '2024-01-15'
   * });
   *
   * @example
   * // Create a character with entity-specific fields
   * const character = await manager.create('characters', {
   *   name: 'Elara the Wise',
   *   entry: 'A powerful wizard...',
   *   type: 'NPC',
   *   age: '142',
   *   title: 'Archmage of the Silver Tower',
   *   location_id: 456
   * });
   */
  async create(entityType, entityData) {
    // Validate required fields - all Kanka entities require a name
    if (!entityData?.name) {
      throw new KankaError(
        `Entity name is required for ${entityType}`,
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildCampaignEndpoint(entityType);

    // Build base payload with common fields that exist on all entity types
    // Note: is_private defaults to false per Kanka API specification
    const payload = {
      name: entityData.name,
      entry: entityData.entry || '',
      is_private: entityData.is_private ?? false
    };

    // Add type field if provided
    // Note: Not all entity types support this field (e.g., maps don't use 'type')
    if (entityData.type !== undefined) {
      payload.type = entityData.type;
    }

    // Copy all other entity-specific fields from entityData to payload
    // This handles fields like:
    // - Characters: age, sex, title, pronouns, is_dead, family_id, location_id
    // - Locations: parent_location_id, map_id
    // - Items: price, size, character_id, location_id
    // - Journals: date, location_id, character_id, journal_id (parent)
    // - Tags: arrays of tag IDs for categorization
    for (const [key, value] of Object.entries(entityData)) {
      // Skip fields we've already processed to avoid duplication
      if (key === 'name' || key === 'entry' || key === 'is_private' || key === 'type') {
        continue;
      }

      // Only include fields with actual values (skip null/undefined)
      if (value !== null && value !== undefined) {
        // Special handling for arrays (like tags array) - only include if not empty
        // Empty arrays would be rejected by the API or cause unnecessary data
        if (Array.isArray(value)) {
          if (value.length > 0) {
            payload[key] = value;
          }
        } else {
          // Include all other non-null values (strings, numbers, booleans, objects)
          payload[key] = value;
        }
      }
    }

    this._logger.log(`Creating ${entityType}: ${entityData.name}`);
    const createStartTime = Date.now();
    const response = await this._client.post(endpoint, payload);
    const createElapsed = Date.now() - createStartTime;
    this._logger.log(`${entityType} created with ID: ${response.data?.id} in ${createElapsed}ms`);

    return response.data;
  }

  /**
   * Get an entity by ID
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations', 'items')
   * @param {string|number} entityId - Entity ID
   * @returns {Promise<object>} Entity data
   * @throws {KankaError} If entity not found or API request fails
   *
   * @example
   * const character = await manager.get('characters', 123);
   */
  async get(entityType, entityId) {
    const endpoint = this._buildCampaignEndpoint(entityType, entityId);
    this._logger.debug(`Fetching ${entityType}: ${entityId}`);
    const response = await this._client.get(endpoint);
    this._logger.debug(`Fetched ${entityType}/${entityId}: "${response.data?.name}"`);
    return response.data;
  }

  /**
   * Update an entity
   *
   * @param {string} entityType - Entity type (e.g., 'journals', 'characters', 'locations', 'items')
   * @param {string|number} entityId - Entity ID
   * @param {object} entityData - Updated entity data (partial updates supported)
   * @returns {Promise<object>} Updated entity data
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
    this._logger.debug(
      `Updating ${entityType}: ${entityId}, fields=[${Object.keys(entityData || {}).join(', ')}]`
    );
    const response = await this._client.put(endpoint, entityData);
    this._logger.debug(`Updated ${entityType}/${entityId}: "${response.data?.name}"`);
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
   * @param {object} [options] - List options
   * @param {number} [options.page] - Page number for pagination
   * @param {string} [options.type] - Filter by entity type/subtype
   * @param {string} [options.name] - Filter by name (partial match)
   * @param {string|number} [options.location_id] - Filter by location ID
   * @param {string|number} [options.character_id] - Filter by character ID
   * @param {boolean} [options.is_private] - Filter by privacy status
   * @param {...*} [options.*] - Additional entity-specific filters
   * @returns {Promise<object>} Paginated entity list with data (Array of entities),
   * meta (pagination metadata), and links (pagination links)
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

    const result = {
      data: response.data || [],
      meta: response.meta || {},
      links: response.links || {}
    };
    this._logger.debug(
      `Listed ${entityType}: ${result.data.length} entities (page ${result.meta.current_page || '?'}/${result.meta.last_page || '?'})`
    );
    return result;
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
   * IMPORTANT: OpenAI DALL-E image URLs expire in 60 minutes. Always download
   * and upload AI-generated images immediately after generation.
   *
   * @param {string} entityType - Entity type (e.g., 'characters', 'locations', 'items')
   * @param {string|number} entityId - Entity ID
   * @param {string|Blob} imageSource - Image URL or Blob object
   * @param {object} [options] - Upload options
   * @param {string} [options.filename='portrait.png'] - Filename for the upload (used for MIME type detection)
   * @returns {Promise<object>} Updated entity data with image URL from Kanka
   * @throws {KankaError} If validation fails, download fails, or upload fails
   *
   * @example
   * // Upload from URL (typical for DALL-E generated images)
   * const updated = await manager.uploadImage('characters', 123,
   *   'https://oaidalleapiprodscus.blob.core.windows.net/...'
   * );
   *
   * @example
   * // Upload from Blob (for custom images)
   * const blob = new Blob([imageData], { type: 'image/png' });
   * const updated = await manager.uploadImage('characters', 123, blob, {
   *   filename: 'custom-name.png'
   * });
   */
  async uploadImage(entityType, entityId, imageSource, options = {}) {
    // Validate required parameters
    if (!entityType || !entityId) {
      throw new KankaError(
        'Entity type and ID are required for image upload',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    let imageBlob;

    // Handle different image source types: URL string or Blob object
    if (typeof imageSource === 'string') {
      // Image source is a URL - download it first
      // This is common for DALL-E generated images which must be downloaded
      // before their URL expires (60 minute expiration)
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
      // Image source is already a Blob - use directly
      imageBlob = imageSource;
    } else {
      throw new KankaError(
        'Image source must be a URL string or Blob',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    // Determine filename for the upload
    // Kanka uses this for MIME type detection and display
    const filename = options.filename || 'portrait.png';

    // Create FormData for multipart/form-data upload
    // Kanka API requires multipart form data for image uploads
    const formData = new FormData();
    formData.append('image', imageBlob, filename);

    // Build endpoint - uses the standard entity endpoint with PUT/POST
    const endpoint = this._buildCampaignEndpoint(entityType, entityId);

    this._logger.log(`Uploading image to ${entityType}: ${entityId}`);
    const imgUploadStartTime = Date.now();
    const response = await this._client.postFormData(endpoint, formData);
    const imgUploadElapsed = Date.now() - imgUploadStartTime;
    this._logger.log(`Image uploaded to ${entityType}/${entityId} in ${imgUploadElapsed}ms`);

    return response.data;
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Check if a cache entry is still valid
   *
   * Validates cache entries based on their timestamp and the configured expiry time.
   * Used internally by search operations to determine if cached results can be returned
   * or if a fresh API call is needed.
   *
   * @param {string} cacheKey - Cache key to validate
   * @returns {boolean} True if cache entry exists and is still valid, false otherwise
   * @private
   *
   * @example
   * if (this._isCacheValid('characters:Dragon')) {
   *   return this._searchCache.get('characters:Dragon');
   * }
   */
  _isCacheValid(cacheKey) {
    const timestamp = this._cacheTimestamps.get(cacheKey);
    if (!timestamp) {
      return false;
    }

    const age = Date.now() - timestamp;
    return age < this._cacheExpiryMs;
  }

  /**
   * Clear all search cache entries
   *
   * Removes all cached search results and their timestamps. Use this when you need
   * to force fresh API calls for all searches, such as after bulk entity updates or
   * campaign changes.
   *
   * @example
   * // After bulk entity updates
   * manager.clearCache();
   */
  clearCache() {
    this._searchCache.clear();
    this._cacheTimestamps.clear();
    this._logger.debug('Search cache cleared');
  }

  /**
   * Clear cache for a specific search query
   *
   * Removes the cache entry for a specific search query. Use this when you know
   * a particular entity has been updated and cached search results may be stale.
   *
   * @param {string} cacheKey - Cache key to clear (format: "query|entityType")
   *
   * @example
   * // After updating a character named "Dragon"
   * manager.clearCacheFor('Dragon|characters');
   *
   * @example
   * // After general update - clear all searches for query
   * manager.clearCacheFor('Dragon|all');
   */
  clearCacheFor(cacheKey) {
    if (this._searchCache.has(cacheKey)) {
      this._searchCache.delete(cacheKey);
      this._cacheTimestamps.delete(cacheKey);
      this._logger.debug(`Cache cleared for: ${cacheKey}`);
    }
  }

  /**
   * Get cache statistics
   *
   * Returns information about the current state of the search cache, including
   * the number of cached entries and the configured expiry time.
   *
   * @returns {{entries: number, expiryMs: number}} Cache statistics
   * @property {number} entries - Number of cached search results
   * @property {number} expiryMs - Cache expiry time in milliseconds
   *
   * @example
   * const stats = manager.getCacheStats();
   * console.log(`Cache has ${stats.entries} entries`);
   * console.log(`Cache expires after ${stats.expiryMs}ms`);
   */
  getCacheStats() {
    const stats = {
      entries: this._searchCache.size,
      expiryMs: this._cacheExpiryMs
    };
    this._logger.debug(`getCacheStats: ${stats.entries} entries, expiry=${stats.expiryMs}ms`);
    return stats;
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  /**
   * Search for entities by name in the campaign
   *
   * Performs a name-based search across entity types. If entityType is specified,
   * searches only that type (1 API call). If entityType is omitted, searches across
   * all common entity types (multiple API calls - use sparingly due to rate limits).
   *
   * IMPORTANT: Searching all entity types makes 6 API calls. Use specific entity
   * type when possible to conserve rate limits (30/min free, 90/min premium).
   *
   * Results are cached for 5 minutes (configurable) to reduce API calls for repeated
   * searches. Each query+entityType combination has its own cache entry.
   *
   * @param {string} query - Search query (searches in entity names, partial matches supported)
   * @param {string} [entityType] - Limit search to specific entity type (e.g., 'characters', 'locations')
   * @returns {Promise<Array>} Matching entities (with entity_type added for multi-type searches)
   * @throws {KankaError} If API request fails
   *
   * @example
   * // Search only characters (1 API call - recommended)
   * const characters = await manager.searchEntities('Dragon', 'characters');
   *
   * @example
   * // Search all entity types (6 API calls - use sparingly!)
   * const results = await manager.searchEntities('Dragon');
   * // Results include entity_type field: { ...entity, entity_type: 'characters' }
   */
  async searchEntities(query, entityType = null) {
    // Return early if query is empty to avoid unnecessary API calls
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Build cache key for this search
    const cacheKey = `${query}|${entityType || 'all'}`;

    // Check cache first
    if (this._isCacheValid(cacheKey)) {
      this._logger.debug(`Cache hit for search: ${cacheKey}`);
      return this._searchCache.get(cacheKey);
    }

    this._logger.debug(`Cache miss for search: ${cacheKey}`);

    // Build query parameters for Kanka API name filter
    const params = [`name=${encodeURIComponent(query)}`];

    let results;

    // If entity type is specified, search only that type (single API call)
    if (entityType) {
      const endpoint = this._buildCampaignEndpoint(entityType);
      this._logger.debug(`Searching ${entityType} for: ${query}`);
      const response = await this._client.get(`${endpoint}?${params.join('&')}`);
      results = response.data || [];
    } else {
      // No specific entity type - search across common types
      // WARNING: This requires multiple API calls and counts against rate limits
      // Free tier: 30 req/min, Premium: 90 req/min
      this._logger.debug(`Searching all entities for: ${query}`);
      results = [];

      // Common entity types to search (excludes less common types like families, events, maps)
      // This is a balance between coverage and API usage
      const types = [
        'characters', // NPCs, PCs, monsters
        'locations', // Places, cities, dungeons
        'items', // Weapons, armor, artifacts
        'journals', // Session chronicles, notes
        'organisations', // Guilds, factions, governments
        'quests' // Missions, tasks, bounties
      ];

      // Search each entity type sequentially
      // Note: We continue even if one type fails to maximize results
      let searchFailures = 0;
      let lastSearchError = null;
      for (const type of types) {
        try {
          const endpoint = this._buildCampaignEndpoint(type);
          const response = await this._client.get(`${endpoint}?${params.join('&')}`);
          if (response.data?.length) {
            // Add entity_type field to each result so caller can distinguish types
            // This is important because different types may have same names
            const typedResults = response.data.map((entity) => ({
              ...entity,
              entity_type: type
            }));
            results.push(...typedResults);
          }
        } catch (error) {
          // Log error but continue searching other types
          // This prevents one failure from blocking all results
          searchFailures++;
          lastSearchError = error;
          this._logger.warn(`Failed to search ${type}: ${error.message}`);
        }
      }

      // If ALL types failed, propagate the error instead of caching empty results
      if (searchFailures === types.length && lastSearchError) {
        throw lastSearchError;
      }
    }

    // Cache the results
    this._searchCache.set(cacheKey, results);
    this._cacheTimestamps.set(cacheKey, Date.now());

    this._logger.debug(
      `searchEntities: found ${results.length} results for "${query}" (type=${entityType || 'all'})`
    );
    return results;
  }
}

// Export the class
export { KankaEntityManager };
