/**
 * KankaService - Entity CRUD Operations for Kanka.io
 *
 * High-level service for creating and managing Kanka entities including
 * journals (session chronicles), characters (NPCs/PCs), locations, and items.
 * Handles image uploads for entity portraits/images.
 *
 * @class KankaService
 * @extends KankaClient
 * @module vox-chronicle
 * @see https://api.kanka.io/docs/
 */

import { KankaClient, KankaError, KankaErrorType } from './KankaClient.mjs';
import { Logger } from '../utils/Logger.mjs';

/**
 * Kanka entity types enumeration
 * @enum {string}
 */
const KankaEntityType = {
  JOURNAL: 'journals',
  CHARACTER: 'characters',
  LOCATION: 'locations',
  ITEM: 'items',
  NOTE: 'notes',
  ORGANISATION: 'organisations',
  FAMILY: 'families',
  EVENT: 'events',
  QUEST: 'quests',
  MAP: 'maps'
};

/**
 * Character types for Kanka
 * @enum {string}
 */
const CharacterType = {
  NPC: 'NPC',
  PC: 'PC',
  MONSTER: 'Monster',
  DEITY: 'Deity',
  OTHER: ''
};

/**
 * Location types for Kanka
 * @enum {string}
 */
const LocationType = {
  CITY: 'City',
  TOWN: 'Town',
  VILLAGE: 'Village',
  TAVERN: 'Tavern',
  DUNGEON: 'Dungeon',
  CASTLE: 'Castle',
  TEMPLE: 'Temple',
  FOREST: 'Forest',
  MOUNTAIN: 'Mountain',
  REGION: 'Region',
  COUNTRY: 'Country',
  CONTINENT: 'Continent',
  WORLD: 'World',
  PLANE: 'Plane',
  OTHER: ''
};

/**
 * Item types for Kanka
 * @enum {string}
 */
const ItemType = {
  WEAPON: 'Weapon',
  ARMOR: 'Armor',
  ARTIFACT: 'Artifact',
  POTION: 'Potion',
  TOOL: 'Tool',
  TREASURE: 'Treasure',
  MAGIC_ITEM: 'Magic Item',
  EQUIPMENT: 'Equipment',
  OTHER: ''
};

/**
 * Organisation types for Kanka
 * @enum {string}
 */
const OrganisationType = {
  GUILD: 'Guild',
  COMPANY: 'Company',
  GOVERNMENT: 'Government',
  MILITARY: 'Military',
  RELIGIOUS: 'Religious',
  CRIMINAL: 'Criminal',
  FACTION: 'Faction',
  FAMILY: 'Family',
  OTHER: ''
};

/**
 * Quest types for Kanka
 * @enum {string}
 */
const QuestType = {
  MAIN: 'Main Quest',
  SIDE: 'Side Quest',
  PERSONAL: 'Personal Quest',
  BOUNTY: 'Bounty',
  MISSION: 'Mission',
  TASK: 'Task',
  OTHER: ''
};

/**
 * KankaService class for entity CRUD operations
 *
 * Provides high-level methods for creating, reading, updating, and deleting
 * Kanka entities. Also handles image uploads for entity portraits.
 *
 * @extends KankaClient
 * @example
 * const service = new KankaService('api-token', 'campaign-id');
 * const journal = await service.createJournal({
 *   name: 'Session 1 Chronicle',
 *   entry: 'Today the party...',
 *   date: '2024-01-15'
 * });
 */
class KankaService extends KankaClient {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('KankaService');

  /**
   * Campaign ID for all operations
   * @type {string}
   * @private
   */
  _campaignId = '';

  /**
   * Create a new KankaService instance
   *
   * @param {string} apiToken - Kanka API token
   * @param {string} campaignId - Kanka campaign ID
   * @param {Object} [options] - Configuration options (passed to KankaClient)
   */
  constructor(apiToken, campaignId, options = {}) {
    super(apiToken, options);
    this._campaignId = campaignId || '';
    this._logger = Logger.createChild('KankaService');
    this._logger.debug(`KankaService initialized for campaign: ${campaignId}`);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Check if the service is properly configured
   *
   * @returns {boolean} True if API token and campaign ID are set
   */
  get isFullyConfigured() {
    return this.isConfigured && Boolean(this._campaignId);
  }

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
   * @param {string} entityType - Entity type from KankaEntityType
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
  // Campaigns
  // ============================================================================

  /**
   * Get list of campaigns accessible to the user
   *
   * @returns {Promise<Array>} List of campaigns
   */
  async listCampaigns() {
    this._logger.debug('Fetching campaigns list');
    const response = await this.get('/campaigns');
    return response.data || [];
  }

  /**
   * Get campaign details
   *
   * @param {string|number} [campaignId] - Campaign ID (defaults to configured campaign)
   * @returns {Promise<Object>} Campaign data
   */
  async getCampaign(campaignId = null) {
    const id = campaignId || this._campaignId;
    if (!id) {
      throw new KankaError(
        'Campaign ID is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    this._logger.debug(`Fetching campaign: ${id}`);
    const response = await this.get(`/campaigns/${id}`);
    return response.data;
  }

  // ============================================================================
  // Journals (Session Chronicles)
  // ============================================================================

  /**
   * Create a new journal entry (session chronicle)
   *
   * @param {Object} journalData - Journal data
   * @param {string} journalData.name - Journal title
   * @param {string} [journalData.entry] - Journal content (HTML/Markdown)
   * @param {string} [journalData.type] - Journal type (e.g., 'Session Chronicle')
   * @param {string} [journalData.date] - Date of the session (YYYY-MM-DD format)
   * @param {boolean} [journalData.is_private=false] - Whether journal is private
   * @param {string|number} [journalData.location_id] - Associated location ID
   * @param {string|number} [journalData.character_id] - Associated character ID
   * @param {string|number} [journalData.journal_id] - Parent journal ID
   * @param {Array} [journalData.tags] - Tag IDs to associate
   * @returns {Promise<Object>} Created journal data
   */
  async createJournal(journalData) {
    if (!journalData?.name) {
      throw new KankaError(
        'Journal name is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildCampaignEndpoint(KankaEntityType.JOURNAL);

    const payload = {
      name: journalData.name,
      entry: journalData.entry || '',
      type: journalData.type || 'Session Chronicle',
      is_private: journalData.is_private ?? false
    };

    // Add optional fields if provided
    if (journalData.date) {
      payload.date = journalData.date;
    }
    if (journalData.location_id) {
      payload.location_id = journalData.location_id;
    }
    if (journalData.character_id) {
      payload.character_id = journalData.character_id;
    }
    if (journalData.journal_id) {
      payload.journal_id = journalData.journal_id;
    }
    if (journalData.tags?.length) {
      payload.tags = journalData.tags;
    }

    this._logger.log(`Creating journal: ${journalData.name}`);
    const response = await this.post(endpoint, payload);
    this._logger.log(`Journal created with ID: ${response.data?.id}`);

    return response.data;
  }

  /**
   * Get a journal entry by ID
   *
   * @param {string|number} journalId - Journal ID
   * @returns {Promise<Object>} Journal data
   */
  async getJournal(journalId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.JOURNAL, journalId);
    this._logger.debug(`Fetching journal: ${journalId}`);
    const response = await this.get(endpoint);
    return response.data;
  }

  /**
   * Update a journal entry
   *
   * @param {string|number} journalId - Journal ID
   * @param {Object} journalData - Updated journal data
   * @returns {Promise<Object>} Updated journal data
   */
  async updateJournal(journalId, journalData) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.JOURNAL, journalId);
    this._logger.debug(`Updating journal: ${journalId}`);
    const response = await this.put(endpoint, journalData);
    return response.data;
  }

  /**
   * Delete a journal entry
   *
   * @param {string|number} journalId - Journal ID
   * @returns {Promise<void>}
   */
  async deleteJournal(journalId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.JOURNAL, journalId);
    this._logger.debug(`Deleting journal: ${journalId}`);
    await this.delete(endpoint);
    this._logger.log(`Journal deleted: ${journalId}`);
  }

  /**
   * List all journals in the campaign
   *
   * @param {Object} [options] - List options
   * @param {number} [options.page=1] - Page number for pagination
   * @param {string} [options.type] - Filter by journal type
   * @returns {Promise<Object>} Paginated journal list with data and meta
   */
  async listJournals(options = {}) {
    let endpoint = this._buildCampaignEndpoint(KankaEntityType.JOURNAL);

    const params = [];
    if (options.page) {
      params.push(`page=${options.page}`);
    }
    if (options.type) {
      params.push(`type=${encodeURIComponent(options.type)}`);
    }
    if (params.length) {
      endpoint += `?${params.join('&')}`;
    }

    this._logger.debug('Fetching journals list');
    const response = await this.get(endpoint);
    return {
      data: response.data || [],
      meta: response.meta || {},
      links: response.links || {}
    };
  }

  // ============================================================================
  // Characters
  // ============================================================================

  /**
   * Create a new character
   *
   * @param {Object} characterData - Character data
   * @param {string} characterData.name - Character name
   * @param {string} [characterData.entry] - Character description (HTML/Markdown)
   * @param {string} [characterData.type] - Character type ('NPC', 'PC', etc.)
   * @param {string} [characterData.title] - Character title/role
   * @param {string} [characterData.age] - Character age
   * @param {string} [characterData.sex] - Character sex/gender
   * @param {string} [characterData.pronouns] - Character pronouns
   * @param {boolean} [characterData.is_dead=false] - Whether character is dead
   * @param {boolean} [characterData.is_private=false] - Whether character is private
   * @param {string|number} [characterData.location_id] - Current location ID
   * @param {string|number} [characterData.family_id] - Family ID
   * @param {Array} [characterData.tags] - Tag IDs to associate
   * @returns {Promise<Object>} Created character data
   */
  async createCharacter(characterData) {
    if (!characterData?.name) {
      throw new KankaError(
        'Character name is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildCampaignEndpoint(KankaEntityType.CHARACTER);

    const payload = {
      name: characterData.name,
      entry: characterData.entry || '',
      type: characterData.type || CharacterType.NPC,
      is_private: characterData.is_private ?? false
    };

    // Add optional fields if provided
    if (characterData.title) {
      payload.title = characterData.title;
    }
    if (characterData.age) {
      payload.age = characterData.age;
    }
    if (characterData.sex) {
      payload.sex = characterData.sex;
    }
    if (characterData.pronouns) {
      payload.pronouns = characterData.pronouns;
    }
    if (characterData.is_dead !== undefined) {
      payload.is_dead = characterData.is_dead;
    }
    if (characterData.location_id) {
      payload.location_id = characterData.location_id;
    }
    if (characterData.family_id) {
      payload.family_id = characterData.family_id;
    }
    if (characterData.tags?.length) {
      payload.tags = characterData.tags;
    }

    this._logger.log(`Creating character: ${characterData.name}`);
    const response = await this.post(endpoint, payload);
    this._logger.log(`Character created with ID: ${response.data?.id}`);

    return response.data;
  }

  /**
   * Get a character by ID
   *
   * @param {string|number} characterId - Character ID
   * @returns {Promise<Object>} Character data
   */
  async getCharacter(characterId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.CHARACTER, characterId);
    this._logger.debug(`Fetching character: ${characterId}`);
    const response = await this.get(endpoint);
    return response.data;
  }

  /**
   * Update a character
   *
   * @param {string|number} characterId - Character ID
   * @param {Object} characterData - Updated character data
   * @returns {Promise<Object>} Updated character data
   */
  async updateCharacter(characterId, characterData) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.CHARACTER, characterId);
    this._logger.debug(`Updating character: ${characterId}`);
    const response = await this.put(endpoint, characterData);
    return response.data;
  }

  /**
   * Delete a character
   *
   * @param {string|number} characterId - Character ID
   * @returns {Promise<void>}
   */
  async deleteCharacter(characterId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.CHARACTER, characterId);
    this._logger.debug(`Deleting character: ${characterId}`);
    await this.delete(endpoint);
    this._logger.log(`Character deleted: ${characterId}`);
  }

  /**
   * List all characters in the campaign
   *
   * @param {Object} [options] - List options
   * @param {number} [options.page=1] - Page number for pagination
   * @param {string} [options.type] - Filter by character type
   * @param {boolean} [options.is_dead] - Filter by dead status
   * @returns {Promise<Object>} Paginated character list with data and meta
   */
  async listCharacters(options = {}) {
    let endpoint = this._buildCampaignEndpoint(KankaEntityType.CHARACTER);

    const params = [];
    if (options.page) {
      params.push(`page=${options.page}`);
    }
    if (options.type) {
      params.push(`type=${encodeURIComponent(options.type)}`);
    }
    if (options.is_dead !== undefined) {
      params.push(`is_dead=${options.is_dead ? 1 : 0}`);
    }
    if (params.length) {
      endpoint += `?${params.join('&')}`;
    }

    this._logger.debug('Fetching characters list');
    const response = await this.get(endpoint);
    return {
      data: response.data || [],
      meta: response.meta || {},
      links: response.links || {}
    };
  }

  // ============================================================================
  // Locations
  // ============================================================================

  /**
   * Create a new location
   *
   * @param {Object} locationData - Location data
   * @param {string} locationData.name - Location name
   * @param {string} [locationData.entry] - Location description (HTML/Markdown)
   * @param {string} [locationData.type] - Location type ('City', 'Dungeon', etc.)
   * @param {boolean} [locationData.is_private=false] - Whether location is private
   * @param {string|number} [locationData.parent_location_id] - Parent location ID
   * @param {Array} [locationData.tags] - Tag IDs to associate
   * @returns {Promise<Object>} Created location data
   */
  async createLocation(locationData) {
    if (!locationData?.name) {
      throw new KankaError(
        'Location name is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildCampaignEndpoint(KankaEntityType.LOCATION);

    const payload = {
      name: locationData.name,
      entry: locationData.entry || '',
      type: locationData.type || '',
      is_private: locationData.is_private ?? false
    };

    // Add optional fields if provided
    if (locationData.parent_location_id) {
      payload.parent_location_id = locationData.parent_location_id;
    }
    if (locationData.tags?.length) {
      payload.tags = locationData.tags;
    }

    this._logger.log(`Creating location: ${locationData.name}`);
    const response = await this.post(endpoint, payload);
    this._logger.log(`Location created with ID: ${response.data?.id}`);

    return response.data;
  }

  /**
   * Get a location by ID
   *
   * @param {string|number} locationId - Location ID
   * @returns {Promise<Object>} Location data
   */
  async getLocation(locationId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.LOCATION, locationId);
    this._logger.debug(`Fetching location: ${locationId}`);
    const response = await this.get(endpoint);
    return response.data;
  }

  /**
   * Update a location
   *
   * @param {string|number} locationId - Location ID
   * @param {Object} locationData - Updated location data
   * @returns {Promise<Object>} Updated location data
   */
  async updateLocation(locationId, locationData) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.LOCATION, locationId);
    this._logger.debug(`Updating location: ${locationId}`);
    const response = await this.put(endpoint, locationData);
    return response.data;
  }

  /**
   * Delete a location
   *
   * @param {string|number} locationId - Location ID
   * @returns {Promise<void>}
   */
  async deleteLocation(locationId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.LOCATION, locationId);
    this._logger.debug(`Deleting location: ${locationId}`);
    await this.delete(endpoint);
    this._logger.log(`Location deleted: ${locationId}`);
  }

  /**
   * List all locations in the campaign
   *
   * @param {Object} [options] - List options
   * @param {number} [options.page=1] - Page number for pagination
   * @param {string} [options.type] - Filter by location type
   * @param {string|number} [options.parent_location_id] - Filter by parent location
   * @returns {Promise<Object>} Paginated location list with data and meta
   */
  async listLocations(options = {}) {
    let endpoint = this._buildCampaignEndpoint(KankaEntityType.LOCATION);

    const params = [];
    if (options.page) {
      params.push(`page=${options.page}`);
    }
    if (options.type) {
      params.push(`type=${encodeURIComponent(options.type)}`);
    }
    if (options.parent_location_id) {
      params.push(`parent_location_id=${options.parent_location_id}`);
    }
    if (params.length) {
      endpoint += `?${params.join('&')}`;
    }

    this._logger.debug('Fetching locations list');
    const response = await this.get(endpoint);
    return {
      data: response.data || [],
      meta: response.meta || {},
      links: response.links || {}
    };
  }

  // ============================================================================
  // Items
  // ============================================================================

  /**
   * Create a new item
   *
   * @param {Object} itemData - Item data
   * @param {string} itemData.name - Item name
   * @param {string} [itemData.entry] - Item description (HTML/Markdown)
   * @param {string} [itemData.type] - Item type ('Weapon', 'Armor', etc.)
   * @param {string} [itemData.price] - Item price
   * @param {string} [itemData.size] - Item size
   * @param {boolean} [itemData.is_private=false] - Whether item is private
   * @param {string|number} [itemData.location_id] - Current location ID (where item is)
   * @param {string|number} [itemData.character_id] - Owner character ID
   * @param {Array} [itemData.tags] - Tag IDs to associate
   * @returns {Promise<Object>} Created item data
   */
  async createItem(itemData) {
    if (!itemData?.name) {
      throw new KankaError(
        'Item name is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildCampaignEndpoint(KankaEntityType.ITEM);

    const payload = {
      name: itemData.name,
      entry: itemData.entry || '',
      type: itemData.type || '',
      is_private: itemData.is_private ?? false
    };

    // Add optional fields if provided
    if (itemData.price) {
      payload.price = itemData.price;
    }
    if (itemData.size) {
      payload.size = itemData.size;
    }
    if (itemData.location_id) {
      payload.location_id = itemData.location_id;
    }
    if (itemData.character_id) {
      payload.character_id = itemData.character_id;
    }
    if (itemData.tags?.length) {
      payload.tags = itemData.tags;
    }

    this._logger.log(`Creating item: ${itemData.name}`);
    const response = await this.post(endpoint, payload);
    this._logger.log(`Item created with ID: ${response.data?.id}`);

    return response.data;
  }

  /**
   * Get an item by ID
   *
   * @param {string|number} itemId - Item ID
   * @returns {Promise<Object>} Item data
   */
  async getItem(itemId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.ITEM, itemId);
    this._logger.debug(`Fetching item: ${itemId}`);
    const response = await this.get(endpoint);
    return response.data;
  }

  /**
   * Update an item
   *
   * @param {string|number} itemId - Item ID
   * @param {Object} itemData - Updated item data
   * @returns {Promise<Object>} Updated item data
   */
  async updateItem(itemId, itemData) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.ITEM, itemId);
    this._logger.debug(`Updating item: ${itemId}`);
    const response = await this.put(endpoint, itemData);
    return response.data;
  }

  /**
   * Delete an item
   *
   * @param {string|number} itemId - Item ID
   * @returns {Promise<void>}
   */
  async deleteItem(itemId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.ITEM, itemId);
    this._logger.debug(`Deleting item: ${itemId}`);
    await this.delete(endpoint);
    this._logger.log(`Item deleted: ${itemId}`);
  }

  /**
   * List all items in the campaign
   *
   * @param {Object} [options] - List options
   * @param {number} [options.page=1] - Page number for pagination
   * @param {string} [options.type] - Filter by item type
   * @param {string|number} [options.character_id] - Filter by owner character
   * @returns {Promise<Object>} Paginated item list with data and meta
   */
  async listItems(options = {}) {
    let endpoint = this._buildCampaignEndpoint(KankaEntityType.ITEM);

    const params = [];
    if (options.page) {
      params.push(`page=${options.page}`);
    }
    if (options.type) {
      params.push(`type=${encodeURIComponent(options.type)}`);
    }
    if (options.character_id) {
      params.push(`character_id=${options.character_id}`);
    }
    if (params.length) {
      endpoint += `?${params.join('&')}`;
    }

    this._logger.debug('Fetching items list');
    const response = await this.get(endpoint);
    return {
      data: response.data || [],
      meta: response.meta || {},
      links: response.links || {}
    };
  }

  // ============================================================================
  // Organisations
  // ============================================================================

  /**
   * Create a new organisation
   *
   * @param {Object} organisationData - Organisation data
   * @param {string} organisationData.name - Organisation name
   * @param {string} [organisationData.entry] - Organisation description (HTML/Markdown)
   * @param {string} [organisationData.type] - Organisation type ('Guild', 'Military', etc.)
   * @param {boolean} [organisationData.is_private=false] - Whether organisation is private
   * @param {string|number} [organisationData.location_id] - Headquarters location ID
   * @param {string|number} [organisationData.organisation_id] - Parent organisation ID
   * @param {Array} [organisationData.tags] - Tag IDs to associate
   * @returns {Promise<Object>} Created organisation data
   */
  async createOrganisation(organisationData) {
    if (!organisationData?.name) {
      throw new KankaError(
        'Organisation name is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildCampaignEndpoint(KankaEntityType.ORGANISATION);

    const payload = {
      name: organisationData.name,
      entry: organisationData.entry || '',
      type: organisationData.type || OrganisationType.OTHER,
      is_private: organisationData.is_private ?? false
    };

    // Add optional fields if provided
    if (organisationData.location_id) {
      payload.location_id = organisationData.location_id;
    }
    if (organisationData.organisation_id) {
      payload.organisation_id = organisationData.organisation_id;
    }
    if (organisationData.tags?.length) {
      payload.tags = organisationData.tags;
    }

    this._logger.log(`Creating organisation: ${organisationData.name}`);
    const response = await this.post(endpoint, payload);
    this._logger.log(`Organisation created with ID: ${response.data?.id}`);

    return response.data;
  }

  /**
   * Get an organisation by ID
   *
   * @param {string|number} organisationId - Organisation ID
   * @returns {Promise<Object>} Organisation data
   */
  async getOrganisation(organisationId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.ORGANISATION, organisationId);
    this._logger.debug(`Fetching organisation: ${organisationId}`);
    const response = await this.get(endpoint);
    return response.data;
  }

  /**
   * Update an organisation
   *
   * @param {string|number} organisationId - Organisation ID
   * @param {Object} organisationData - Updated organisation data
   * @returns {Promise<Object>} Updated organisation data
   */
  async updateOrganisation(organisationId, organisationData) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.ORGANISATION, organisationId);
    this._logger.debug(`Updating organisation: ${organisationId}`);
    const response = await this.put(endpoint, organisationData);
    return response.data;
  }

  /**
   * Delete an organisation
   *
   * @param {string|number} organisationId - Organisation ID
   * @returns {Promise<void>}
   */
  async deleteOrganisation(organisationId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.ORGANISATION, organisationId);
    this._logger.debug(`Deleting organisation: ${organisationId}`);
    await this.delete(endpoint);
    this._logger.log(`Organisation deleted: ${organisationId}`);
  }

  /**
   * List all organisations in the campaign
   *
   * @param {Object} [options] - List options
   * @param {number} [options.page=1] - Page number for pagination
   * @param {string} [options.type] - Filter by organisation type
   * @param {string|number} [options.organisation_id] - Filter by parent organisation
   * @returns {Promise<Object>} Paginated organisation list with data and meta
   */
  async listOrganisations(options = {}) {
    let endpoint = this._buildCampaignEndpoint(KankaEntityType.ORGANISATION);

    const params = [];
    if (options.page) {
      params.push(`page=${options.page}`);
    }
    if (options.type) {
      params.push(`type=${encodeURIComponent(options.type)}`);
    }
    if (options.organisation_id) {
      params.push(`organisation_id=${options.organisation_id}`);
    }
    if (params.length) {
      endpoint += `?${params.join('&')}`;
    }

    this._logger.debug('Fetching organisations list');
    const response = await this.get(endpoint);
    return {
      data: response.data || [],
      meta: response.meta || {},
      links: response.links || {}
    };
  }

  // ============================================================================
  // Quests
  // ============================================================================

  /**
   * Create a new quest
   *
   * @param {Object} questData - Quest data
   * @param {string} questData.name - Quest name
   * @param {string} [questData.entry] - Quest description (HTML/Markdown)
   * @param {string} [questData.type] - Quest type ('Main Quest', 'Side Quest', etc.)
   * @param {boolean} [questData.is_completed=false] - Whether quest is completed
   * @param {boolean} [questData.is_private=false] - Whether quest is private
   * @param {string|number} [questData.character_id] - Quest giver character ID
   * @param {string|number} [questData.location_id] - Quest location ID
   * @param {string|number} [questData.quest_id] - Parent quest ID
   * @param {Array} [questData.tags] - Tag IDs to associate
   * @returns {Promise<Object>} Created quest data
   */
  async createQuest(questData) {
    if (!questData?.name) {
      throw new KankaError(
        'Quest name is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    const endpoint = this._buildCampaignEndpoint(KankaEntityType.QUEST);

    const payload = {
      name: questData.name,
      entry: questData.entry || '',
      type: questData.type || QuestType.OTHER,
      is_private: questData.is_private ?? false
    };

    // Add optional fields if provided
    if (questData.is_completed !== undefined) {
      payload.is_completed = questData.is_completed;
    }
    if (questData.character_id) {
      payload.character_id = questData.character_id;
    }
    if (questData.location_id) {
      payload.location_id = questData.location_id;
    }
    if (questData.quest_id) {
      payload.quest_id = questData.quest_id;
    }
    if (questData.tags?.length) {
      payload.tags = questData.tags;
    }

    this._logger.log(`Creating quest: ${questData.name}`);
    const response = await this.post(endpoint, payload);
    this._logger.log(`Quest created with ID: ${response.data?.id}`);

    return response.data;
  }

  /**
   * Get a quest by ID
   *
   * @param {string|number} questId - Quest ID
   * @returns {Promise<Object>} Quest data
   */
  async getQuest(questId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.QUEST, questId);
    this._logger.debug(`Fetching quest: ${questId}`);
    const response = await this.get(endpoint);
    return response.data;
  }

  /**
   * Update a quest
   *
   * @param {string|number} questId - Quest ID
   * @param {Object} questData - Updated quest data
   * @returns {Promise<Object>} Updated quest data
   */
  async updateQuest(questId, questData) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.QUEST, questId);
    this._logger.debug(`Updating quest: ${questId}`);
    const response = await this.put(endpoint, questData);
    return response.data;
  }

  /**
   * Delete a quest
   *
   * @param {string|number} questId - Quest ID
   * @returns {Promise<void>}
   */
  async deleteQuest(questId) {
    const endpoint = this._buildCampaignEndpoint(KankaEntityType.QUEST, questId);
    this._logger.debug(`Deleting quest: ${questId}`);
    await this.delete(endpoint);
    this._logger.log(`Quest deleted: ${questId}`);
  }

  /**
   * List all quests in the campaign
   *
   * @param {Object} [options] - List options
   * @param {number} [options.page=1] - Page number for pagination
   * @param {string} [options.type] - Filter by quest type
   * @param {boolean} [options.is_completed] - Filter by completion status
   * @param {string|number} [options.quest_id] - Filter by parent quest
   * @returns {Promise<Object>} Paginated quest list with data and meta
   */
  async listQuests(options = {}) {
    let endpoint = this._buildCampaignEndpoint(KankaEntityType.QUEST);

    const params = [];
    if (options.page) {
      params.push(`page=${options.page}`);
    }
    if (options.type) {
      params.push(`type=${encodeURIComponent(options.type)}`);
    }
    if (options.is_completed !== undefined) {
      params.push(`is_completed=${options.is_completed ? 1 : 0}`);
    }
    if (options.quest_id) {
      params.push(`quest_id=${options.quest_id}`);
    }
    if (params.length) {
      endpoint += `?${params.join('&')}`;
    }

    this._logger.debug('Fetching quests list');
    const response = await this.get(endpoint);
    return {
      data: response.data || [],
      meta: response.meta || {},
      links: response.links || {}
    };
  }

  // ============================================================================
  // Image Upload
  // ============================================================================

  /**
   * Upload an image to an entity (portrait/header image)
   *
   * IMPORTANT: OpenAI DALL-E image URLs expire in 60 minutes.
   * Always download and upload images immediately after generation.
   *
   * @param {string} entityType - Entity type from KankaEntityType
   * @param {string|number} entityId - Entity ID
   * @param {string|Blob} imageSource - Image URL or Blob
   * @param {Object} [options] - Upload options
   * @param {string} [options.filename='portrait.png'] - Filename for the upload
   * @returns {Promise<Object>} Updated entity data with image
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

    // Build endpoint for entity image upload
    // Kanka uses POST to /{entityType}/{entityId} endpoint with 'image' field
    const endpoint = this._buildCampaignEndpoint(entityType, entityId);

    this._logger.log(`Uploading image to ${entityType}/${entityId}`);
    const response = await this.postFormData(endpoint, formData);
    this._logger.log(`Image uploaded successfully to ${entityType}/${entityId}`);

    return response.data;
  }

  /**
   * Upload image to a character (portrait)
   *
   * @param {string|number} characterId - Character ID
   * @param {string|Blob} imageSource - Image URL or Blob
   * @param {Object} [options] - Upload options
   * @returns {Promise<Object>} Updated character data
   */
  async uploadCharacterImage(characterId, imageSource, options = {}) {
    return this.uploadImage(KankaEntityType.CHARACTER, characterId, imageSource, options);
  }

  /**
   * Upload image to a location
   *
   * @param {string|number} locationId - Location ID
   * @param {string|Blob} imageSource - Image URL or Blob
   * @param {Object} [options] - Upload options
   * @returns {Promise<Object>} Updated location data
   */
  async uploadLocationImage(locationId, imageSource, options = {}) {
    return this.uploadImage(KankaEntityType.LOCATION, locationId, imageSource, options);
  }

  /**
   * Upload image to an item
   *
   * @param {string|number} itemId - Item ID
   * @param {string|Blob} imageSource - Image URL or Blob
   * @param {Object} [options] - Upload options
   * @returns {Promise<Object>} Updated item data
   */
  async uploadItemImage(itemId, imageSource, options = {}) {
    return this.uploadImage(KankaEntityType.ITEM, itemId, imageSource, options);
  }

  /**
   * Upload image to a journal
   *
   * @param {string|number} journalId - Journal ID
   * @param {string|Blob} imageSource - Image URL or Blob
   * @param {Object} [options] - Upload options
   * @returns {Promise<Object>} Updated journal data
   */
  async uploadJournalImage(journalId, imageSource, options = {}) {
    return this.uploadImage(KankaEntityType.JOURNAL, journalId, imageSource, options);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Search for entities by name in the campaign
   *
   * @param {string} query - Search query
   * @param {string} [entityType] - Limit search to specific entity type
   * @returns {Promise<Array>} Matching entities
   */
  async searchEntities(query, entityType = null) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const params = [`name=${encodeURIComponent(query)}`];

    if (entityType) {
      const endpoint = this._buildCampaignEndpoint(entityType);
      this._logger.debug(`Searching ${entityType} for: ${query}`);
      const response = await this.get(`${endpoint}?${params.join('&')}`);
      return response.data || [];
    }

    // Search across multiple entity types
    this._logger.debug(`Searching all entities for: ${query}`);
    const results = [];

    const types = [
      KankaEntityType.CHARACTER,
      KankaEntityType.LOCATION,
      KankaEntityType.ITEM,
      KankaEntityType.JOURNAL,
      KankaEntityType.ORGANISATION,
      KankaEntityType.QUEST
    ];

    for (const type of types) {
      try {
        const endpoint = this._buildCampaignEndpoint(type);
        const response = await this.get(`${endpoint}?${params.join('&')}`);
        const entities = response.data || [];
        results.push(...entities.map(e => ({ ...e, _entityType: type })));
      } catch (error) {
        this._logger.warn(`Search failed for ${type}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Check if an entity with the given name already exists
   *
   * @param {string} name - Entity name to check
   * @param {string} entityType - Entity type from KankaEntityType
   * @returns {Promise<Object|null>} Existing entity or null
   */
  async findExistingEntity(name, entityType) {
    if (!name || !entityType) {
      return null;
    }

    const results = await this.searchEntities(name, entityType);

    // Find exact match (case-insensitive)
    const normalizedName = name.toLowerCase().trim();
    const exactMatch = results.find(
      entity => entity.name.toLowerCase().trim() === normalizedName
    );

    return exactMatch || null;
  }

  /**
   * Create an entity only if it doesn't already exist
   *
   * @param {string} entityType - Entity type from KankaEntityType
   * @param {Object} entityData - Entity data with at least 'name' property
   * @returns {Promise<Object>} Created or existing entity data
   */
  async createIfNotExists(entityType, entityData) {
    if (!entityData?.name) {
      throw new KankaError(
        'Entity name is required',
        KankaErrorType.VALIDATION_ERROR
      );
    }

    // Check if already exists
    const existing = await this.findExistingEntity(entityData.name, entityType);
    if (existing) {
      this._logger.debug(`Entity already exists: ${entityData.name} (ID: ${existing.id})`);
      return { ...existing, _alreadyExisted: true };
    }

    // Create based on entity type
    switch (entityType) {
      case KankaEntityType.CHARACTER:
        return this.createCharacter(entityData);
      case KankaEntityType.LOCATION:
        return this.createLocation(entityData);
      case KankaEntityType.ITEM:
        return this.createItem(entityData);
      case KankaEntityType.JOURNAL:
        return this.createJournal(entityData);
      case KankaEntityType.ORGANISATION:
        return this.createOrganisation(entityData);
      case KankaEntityType.QUEST:
        return this.createQuest(entityData);
      default:
        throw new KankaError(
          `Unsupported entity type: ${entityType}`,
          KankaErrorType.VALIDATION_ERROR
        );
    }
  }

  /**
   * Batch create multiple entities of the same type
   *
   * Note: Entities are created sequentially to respect rate limits.
   * Use with caution for large batches.
   *
   * @param {string} entityType - Entity type from KankaEntityType
   * @param {Array<Object>} entitiesData - Array of entity data objects
   * @param {Object} [options] - Batch options
   * @param {boolean} [options.skipExisting=true] - Skip entities that already exist
   * @param {Function} [options.onProgress] - Progress callback (current, total, entity)
   * @returns {Promise<Array<Object>>} Created entities
   */
  async batchCreate(entityType, entitiesData, options = {}) {
    const skipExisting = options.skipExisting ?? true;
    const onProgress = options.onProgress || (() => {});
    const results = [];

    for (let i = 0; i < entitiesData.length; i++) {
      const entityData = entitiesData[i];

      try {
        let entity;
        if (skipExisting) {
          entity = await this.createIfNotExists(entityType, entityData);
        } else {
          switch (entityType) {
            case KankaEntityType.CHARACTER:
              entity = await this.createCharacter(entityData);
              break;
            case KankaEntityType.LOCATION:
              entity = await this.createLocation(entityData);
              break;
            case KankaEntityType.ITEM:
              entity = await this.createItem(entityData);
              break;
            case KankaEntityType.JOURNAL:
              entity = await this.createJournal(entityData);
              break;
            case KankaEntityType.ORGANISATION:
              entity = await this.createOrganisation(entityData);
              break;
            case KankaEntityType.QUEST:
              entity = await this.createQuest(entityData);
              break;
            default:
              throw new KankaError(
                `Unsupported entity type: ${entityType}`,
                KankaErrorType.VALIDATION_ERROR
              );
          }
        }

        results.push(entity);
        onProgress(i + 1, entitiesData.length, entity);
      } catch (error) {
        this._logger.error(`Failed to create entity ${entityData.name}: ${error.message}`);
        results.push({ _error: error.message, name: entityData.name });
        onProgress(i + 1, entitiesData.length, null);
      }
    }

    return results;
  }
}

// Export all classes and enums
export {
  KankaService,
  KankaEntityType,
  CharacterType,
  LocationType,
  ItemType,
  OrganisationType,
  QuestType
};
