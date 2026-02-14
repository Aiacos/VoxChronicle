/**
 * KankaRelationshipManager - Manages Entity Relations in Kanka
 *
 * Provides CRUD operations for Kanka entity relations (connections between entities).
 * Relations are different from entities - they use separate API endpoints under
 * /campaigns/{id}/entities/{entity_id}/relations and /campaigns/{id}/relations.
 *
 * This service enables syncing extracted relationships (from EntityExtractor)
 * to Kanka as formal entity relations with metadata like attitude, visibility, etc.
 *
 * Uses composition pattern - accepts a KankaClient instance for API requests.
 *
 * @class KankaRelationshipManager
 * @module vox-chronicle
 * @see https://api.kanka.io/docs/1.0/relations
 */

import { KankaError, KankaErrorType } from './KankaClient.mjs';
import { Logger } from '../utils/Logger.mjs';

/**
 * KankaRelationshipManager class for entity relation CRUD operations
 *
 * Manages relationships between Kanka entities. Relations describe connections
 * like "is parent of", "works for", "ally of", etc.
 *
 * @example
 * const client = new KankaClient('api-token');
 * const manager = new KankaRelationshipManager(client, 'campaign-id');
 *
 * // Create a relation between two entities
 * const relation = await manager.create(entityId, {
 *   relation: 'is friends with',
 *   owner_id: entityId,
 *   target_id: targetEntityId,
 *   attitude: 75,
 *   visibility_id: 1
 * });
 *
 * // List all relations for an entity
 * const relations = await manager.list(entityId);
 *
 * // List all campaign relations
 * const allRelations = await manager.listAllCampaignRelations();
 */
class KankaRelationshipManager {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('KankaRelationshipManager');

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
   * Create a new KankaRelationshipManager instance
   *
   * @param {object} client - KankaClient instance for making API requests
   * @param {string} campaignId - Kanka campaign ID
   */
  constructor(client, campaignId) {
    if (!client) {
      throw new KankaError('KankaClient instance is required', KankaErrorType.VALIDATION_ERROR);
    }

    this._client = client;
    this._campaignId = campaignId || '';
    this._logger = Logger.createChild('KankaRelationshipManager');
    this._logger.debug(`KankaRelationshipManager initialized for campaign: ${campaignId}`);
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
   * Build relations endpoint for entity-specific or campaign-wide operations
   *
   * @param {string|number} [entityId] - Entity ID for entity-specific relations (optional)
   * @param {string|number} [relationId] - Relation ID for specific relation operations (optional)
   * @returns {string} Full endpoint path
   * @private
   */
  _buildRelationsEndpoint(entityId = null, relationId = null) {
    if (!this._campaignId) {
      throw new KankaError(
        'Campaign ID not configured. Please set your Kanka campaign in module settings.',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    // Campaign-wide relations endpoint
    if (!entityId) {
      return `/campaigns/${this._campaignId}/relations`;
    }

    // Entity-specific relations endpoint
    const baseEndpoint = `/campaigns/${this._campaignId}/entities/${entityId}/relations`;
    return relationId ? `${baseEndpoint}/${relationId}` : baseEndpoint;
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Create a new relation between entities
   *
   * Creates a relationship between two Kanka entities. Relations describe connections
   * like "is parent of", "ally of", "works for", etc.
   *
   * @param {string|number} entityId - The owner entity ID (source of the relation)
   * @param {object} relationData - Relation data
   * @param {string} relationData.relation - Relation description (e.g., "is friends with") - max 255 chars
   * @param {number} relationData.owner_id - Owner entity ID (must match entityId parameter)
   * @param {number} [relationData.target_id] - Target entity ID (required if targets not provided)
   * @param {Array<number>} [relationData.targets] - Array of target entity IDs (required if target_id not provided)
   * @param {number} [relationData.attitude] - Attitude score from -100 (hostile) to 100 (friendly)
   * @param {number} [relationData.visibility_id] - Visibility level (1=All, 2=Admin, 3=Admin & Self, 4=Self, 5=Members)
   * @param {string} [relationData.colour] - Color for the relation (hex color code)
   * @param {boolean} [relationData.is_star] - Whether relation is starred/pinned
   * @returns {Promise<object>} Created relation data from Kanka API
   * @throws {KankaError} If validation fails or API request fails
   *
   * @example
   * // Create a simple relation
   * const relation = await manager.create(123, {
   *   relation: 'is friends with',
   *   owner_id: 123,
   *   target_id: 456,
   *   attitude: 75
   * });
   *
   * @example
   * // Create a relation with multiple targets
   * const relation = await manager.create(123, {
   *   relation: 'is allied with',
   *   owner_id: 123,
   *   targets: [456, 789],
   *   attitude: 90,
   *   visibility_id: 1
   * });
   */
  async create(entityId, relationData) {
    // Validate required fields
    if (!entityId) {
      throw new KankaError(
        'Entity ID is required for creating relations',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    if (!relationData?.relation) {
      throw new KankaError(
        'Relation description is required (relationData.relation)',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    if (relationData.relation.length > 255) {
      throw new KankaError(
        'Relation description must be 255 characters or less',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    if (!relationData.owner_id) {
      throw new KankaError(
        'Owner entity ID is required (relationData.owner_id)',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    // Either target_id or targets must be provided
    if (!relationData.target_id && !relationData.targets?.length) {
      throw new KankaError(
        'Either target_id or targets array is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    // Validate attitude range if provided
    if (relationData.attitude !== undefined) {
      const attitude = Number(relationData.attitude);
      if (isNaN(attitude) || attitude < -100 || attitude > 100) {
        throw new KankaError(
          'Attitude must be a number between -100 and 100',
          KankaErrorType.VALIDATION_ERROR
        );
      }
    }

    // Validate visibility_id range if provided
    if (relationData.visibility_id !== undefined) {
      const visibility = Number(relationData.visibility_id);
      if (isNaN(visibility) || visibility < 1 || visibility > 5) {
        throw new KankaError(
          'Visibility ID must be a number between 1 and 5',
          KankaErrorType.VALIDATION_ERROR
        );
      }
    }

    const endpoint = this._buildRelationsEndpoint(entityId);

    // Build payload - copy all fields from relationData
    const payload = { ...relationData };

    this._logger.debug(`Creating relation for entity ${entityId}:`, payload.relation);

    try {
      const response = await this._client.post(endpoint, payload);
      this._logger.info(`Successfully created relation: ${payload.relation} (ID: ${response.data?.id})`);
      return response.data;
    } catch (error) {
      this._logger.error(`Failed to create relation for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific relation by ID
   *
   * Retrieves detailed information about a specific entity relation.
   *
   * @param {string|number} entityId - The entity ID that owns the relation
   * @param {string|number} relationId - The relation ID to retrieve
   * @returns {Promise<object>} Relation data from Kanka API
   * @throws {KankaError} If relation not found or API request fails
   *
   * @example
   * const relation = await manager.get(123, 789);
   * console.log(relation.relation); // "is friends with"
   * console.log(relation.attitude); // 75
   */
  async get(entityId, relationId) {
    if (!entityId) {
      throw new KankaError(
        'Entity ID is required for getting relations',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    if (!relationId) {
      throw new KankaError(
        'Relation ID is required for getting a specific relation',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildRelationsEndpoint(entityId, relationId);
    this._logger.debug(`Fetching relation ${relationId} for entity ${entityId}`);

    try {
      const response = await this._client.get(endpoint);
      this._logger.debug(`Successfully fetched relation ${relationId}`);
      return response.data;
    } catch (error) {
      this._logger.error(`Failed to fetch relation ${relationId} for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing relation
   *
   * Updates an entity relation with new data. All fields are optional - only
   * provided fields will be updated.
   *
   * @param {string|number} entityId - The entity ID that owns the relation
   * @param {string|number} relationId - The relation ID to update
   * @param {object} relationData - Updated relation data (partial update supported)
   * @param {string} [relationData.relation] - New relation description
   * @param {number} [relationData.target_id] - New target entity ID
   * @param {number} [relationData.attitude] - New attitude score (-100 to 100)
   * @param {number} [relationData.visibility_id] - New visibility level (1-5)
   * @param {string} [relationData.colour] - New color (hex code)
   * @param {boolean} [relationData.is_star] - Whether relation is starred
   * @returns {Promise<object>} Updated relation data from Kanka API
   * @throws {KankaError} If validation fails or API request fails
   *
   * @example
   * // Update just the attitude
   * const updated = await manager.update(123, 789, {
   *   attitude: 90
   * });
   *
   * @example
   * // Update multiple fields
   * const updated = await manager.update(123, 789, {
   *   relation: 'is best friends with',
   *   attitude: 100,
   *   colour: '#FFD700'
   * });
   */
  async update(entityId, relationId, relationData) {
    if (!entityId) {
      throw new KankaError(
        'Entity ID is required for updating relations',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    if (!relationId) {
      throw new KankaError(
        'Relation ID is required for updating a specific relation',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    if (!relationData || Object.keys(relationData).length === 0) {
      throw new KankaError(
        'Relation data is required for updates',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    // Validate relation length if provided
    if (relationData.relation && relationData.relation.length > 255) {
      throw new KankaError(
        'Relation description must be 255 characters or less',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    // Validate attitude range if provided
    if (relationData.attitude !== undefined) {
      const attitude = Number(relationData.attitude);
      if (isNaN(attitude) || attitude < -100 || attitude > 100) {
        throw new KankaError(
          'Attitude must be a number between -100 and 100',
          KankaErrorType.VALIDATION_ERROR
        );
      }
    }

    // Validate visibility_id range if provided
    if (relationData.visibility_id !== undefined) {
      const visibility = Number(relationData.visibility_id);
      if (isNaN(visibility) || visibility < 1 || visibility > 5) {
        throw new KankaError(
          'Visibility ID must be a number between 1 and 5',
          KankaErrorType.VALIDATION_ERROR
        );
      }
    }

    const endpoint = this._buildRelationsEndpoint(entityId, relationId);
    const payload = { ...relationData };

    this._logger.debug(`Updating relation ${relationId} for entity ${entityId}`);

    try {
      const response = await this._client.put(endpoint, payload);
      this._logger.info(`Successfully updated relation ${relationId}`);
      return response.data;
    } catch (error) {
      this._logger.error(`Failed to update relation ${relationId} for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a relation
   *
   * Permanently deletes an entity relation from Kanka.
   *
   * @param {string|number} entityId - The entity ID that owns the relation
   * @param {string|number} relationId - The relation ID to delete
   * @returns {Promise<boolean>} True if deletion was successful
   * @throws {KankaError} If relation not found or API request fails
   *
   * @example
   * await manager.delete(123, 789);
   * console.log('Relation deleted');
   */
  async delete(entityId, relationId) {
    if (!entityId) {
      throw new KankaError(
        'Entity ID is required for deleting relations',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    if (!relationId) {
      throw new KankaError(
        'Relation ID is required for deleting a specific relation',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildRelationsEndpoint(entityId, relationId);
    this._logger.debug(`Deleting relation ${relationId} for entity ${entityId}`);

    try {
      await this._client.delete(endpoint);
      this._logger.info(`Successfully deleted relation ${relationId}`);
      return true;
    } catch (error) {
      this._logger.error(`Failed to delete relation ${relationId} for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * List all relations for a specific entity
   *
   * Retrieves all relations where the specified entity is the owner.
   * Supports pagination and filtering.
   *
   * @param {string|number} entityId - The entity ID to list relations for
   * @param {object} [options] - Query options
   * @param {number} [options.page=1] - Page number for pagination
   * @param {number} [options.pageSize=15] - Items per page (max 100)
   * @param {string} [options.related_id] - Filter by related entity ID
   * @param {boolean} [options.is_star] - Filter by starred status
   * @returns {Promise<object>} Paginated list of relations with metadata
   * @returns {Array<object>} return.data - Array of relation objects
   * @returns {object} return.meta - Pagination metadata (current_page, last_page, total, etc.)
   * @throws {KankaError} If API request fails
   *
   * @example
   * // Get first page of relations
   * const result = await manager.list(123);
   * console.log(result.data); // Array of relations
   * console.log(result.meta.total); // Total count
   *
   * @example
   * // Get second page with custom page size
   * const result = await manager.list(123, { page: 2, pageSize: 25 });
   *
   * @example
   * // Filter by related entity
   * const result = await manager.list(123, { related_id: 456 });
   */
  async list(entityId, options = {}) {
    if (!entityId) {
      throw new KankaError(
        'Entity ID is required for listing relations',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildRelationsEndpoint(entityId);

    // Build query parameters from options
    const queryParams = {};

    if (options.page) {
      queryParams.page = options.page;
    }

    if (options.pageSize) {
      queryParams.limit = options.pageSize;
    }

    if (options.related_id !== undefined) {
      queryParams.related_id = options.related_id;
    }

    if (options.is_star !== undefined) {
      queryParams.is_star = options.is_star ? 1 : 0;
    }

    this._logger.debug(`Listing relations for entity ${entityId}`, queryParams);

    try {
      const response = await this._client.get(endpoint, queryParams);
      this._logger.debug(`Successfully listed relations for entity ${entityId}. Found ${response.data?.length || 0} relations.`);
      return response;
    } catch (error) {
      this._logger.error(`Failed to list relations for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * List all relations in the campaign
   *
   * Retrieves all relations across the entire campaign, not limited to a specific entity.
   * This is useful for getting an overview of all relationships in your campaign.
   *
   * @param {object} [options] - Query options
   * @param {number} [options.page=1] - Page number for pagination
   * @param {number} [options.pageSize=15] - Items per page (max 100)
   * @param {string} [options.entity_id] - Filter by entity ID (owner)
   * @param {string} [options.related_id] - Filter by related entity ID (target)
   * @param {boolean} [options.is_star] - Filter by starred status
   * @returns {Promise<object>} Paginated list of relations with metadata
   * @returns {Array<object>} return.data - Array of relation objects
   * @returns {object} return.meta - Pagination metadata (current_page, last_page, total, etc.)
   * @throws {KankaError} If API request fails
   *
   * @example
   * // Get all campaign relations
   * const result = await manager.listAllCampaignRelations();
   * console.log(result.data); // Array of all relations
   *
   * @example
   * // Get starred relations only
   * const result = await manager.listAllCampaignRelations({ is_star: true });
   *
   * @example
   * // Get relations involving a specific entity (as owner or target)
   * const result = await manager.listAllCampaignRelations({ entity_id: 123 });
   */
  async listAllCampaignRelations(options = {}) {
    const endpoint = this._buildRelationsEndpoint();

    // Build query parameters from options
    const queryParams = {};

    if (options.page) {
      queryParams.page = options.page;
    }

    if (options.pageSize) {
      queryParams.limit = options.pageSize;
    }

    if (options.entity_id !== undefined) {
      queryParams.entity_id = options.entity_id;
    }

    if (options.related_id !== undefined) {
      queryParams.related_id = options.related_id;
    }

    if (options.is_star !== undefined) {
      queryParams.is_star = options.is_star ? 1 : 0;
    }

    this._logger.debug('Listing all campaign relations', queryParams);

    try {
      const response = await this._client.get(endpoint, queryParams);
      this._logger.debug(`Successfully listed campaign relations. Found ${response.data?.length || 0} relations.`);
      return response;
    } catch (error) {
      this._logger.error('Failed to list campaign relations:', error);
      throw error;
    }
  }
}

export { KankaRelationshipManager };
