/**
 * KankaRelationshipManager Unit Tests
 *
 * Tests for the KankaRelationshipManager utility class with proper mocking.
 * Covers CRUD operations for entity relations, campaign-wide relation listing,
 * validation, error handling, and campaign configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing KankaRelationshipManager
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
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock KankaClient methods
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../scripts/kanka/KankaClient.mjs', async () => {
  const actual = await vi.importActual('../../scripts/kanka/KankaClient.mjs');

  class MockKankaClient {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }

    get(endpoint, params) {
      return mockGet(endpoint, params);
    }

    post(endpoint, data) {
      return mockPost(endpoint, data);
    }

    put(endpoint, data) {
      return mockPut(endpoint, data);
    }

    delete(endpoint) {
      return mockDelete(endpoint);
    }
  }

  return {
    ...actual,
    KankaClient: MockKankaClient
  };
});

// Import after mocks are set up
import { KankaRelationshipManager } from '../../scripts/kanka/KankaRelationshipManager.mjs';
import { KankaClient, KankaError, KankaErrorType } from '../../scripts/kanka/KankaClient.mjs';

/**
 * Create a mock relation response
 */
function createMockRelation(overrides = {}) {
  const defaults = {
    id: 789,
    relation: 'is friends with',
    owner_id: 123,
    target_id: 456,
    attitude: 75,
    visibility_id: 1,
    colour: null,
    is_star: false,
    created_at: '2024-01-15 10:00:00',
    updated_at: '2024-01-15 10:00:00'
  };

  return {
    ...defaults,
    ...overrides
  };
}

/**
 * Create a mock list response with pagination
 */
function createMockListResponse(data = [], page = 1, total = 0) {
  return {
    data,
    meta: {
      current_page: page,
      total: total || data.length,
      per_page: 15,
      last_page: Math.ceil((total || data.length) / 15)
    },
    links: {
      first: 'https://api.kanka.io/campaigns/1/relations?page=1',
      last: `https://api.kanka.io/campaigns/1/relations?page=${Math.ceil((total || data.length) / 15)}`,
      prev: page > 1 ? `https://api.kanka.io/campaigns/1/relations?page=${page - 1}` : null,
      next: `https://api.kanka.io/campaigns/1/relations?page=${page + 1}`
    }
  };
}

describe('KankaRelationshipManager', () => {
  let client;
  let manager;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock client
    client = new KankaClient('test-api-token');

    // Create manager instance with test campaign
    manager = new KankaRelationshipManager(client, 'test-campaign-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Constructor and Configuration Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with client and campaign ID', () => {
      expect(manager).toBeInstanceOf(KankaRelationshipManager);
      expect(manager.campaignId).toBe('test-campaign-123');
    });

    it('should throw error if client is not provided', () => {
      expect(() => {
        new KankaRelationshipManager(null, 'test-campaign');
      }).toThrow(KankaError);

      expect(() => {
        new KankaRelationshipManager(null, 'test-campaign');
      }).toThrow('KankaClient instance is required');
    });

    it('should throw error if client is undefined', () => {
      expect(() => {
        new KankaRelationshipManager(undefined, 'test-campaign');
      }).toThrow(KankaError);
    });

    it('should handle empty campaign ID', () => {
      const emptyManager = new KankaRelationshipManager(client, '');
      expect(emptyManager.campaignId).toBe('');
    });

    it('should handle null campaign ID', () => {
      const nullManager = new KankaRelationshipManager(client, null);
      expect(nullManager.campaignId).toBe('');
    });

    it('should handle undefined campaign ID', () => {
      const undefinedManager = new KankaRelationshipManager(client);
      expect(undefinedManager.campaignId).toBe('');
    });
  });

  describe('campaignId getter', () => {
    it('should return the current campaign ID', () => {
      expect(manager.campaignId).toBe('test-campaign-123');
    });

    it('should return empty string if campaign ID not set', () => {
      const emptyManager = new KankaRelationshipManager(client, '');
      expect(emptyManager.campaignId).toBe('');
    });
  });

  describe('setCampaignId', () => {
    it('should update campaign ID', () => {
      manager.setCampaignId('new-campaign-456');
      expect(manager.campaignId).toBe('new-campaign-456');
    });

    it('should handle empty string', () => {
      manager.setCampaignId('');
      expect(manager.campaignId).toBe('');
    });

    it('should handle null by converting to empty string', () => {
      manager.setCampaignId(null);
      expect(manager.campaignId).toBe('');
    });

    it('should handle undefined by converting to empty string', () => {
      manager.setCampaignId(undefined);
      expect(manager.campaignId).toBe('');
    });
  });

  describe('_buildRelationsEndpoint', () => {
    it('should throw error if campaign ID not set', () => {
      const emptyManager = new KankaRelationshipManager(client, '');

      expect(() => {
        emptyManager._buildRelationsEndpoint();
      }).toThrow(KankaError);

      expect(() => {
        emptyManager._buildRelationsEndpoint();
      }).toThrow('Campaign ID not configured');
    });

    it('should build campaign-wide relations endpoint without entity ID', () => {
      const endpoint = manager._buildRelationsEndpoint();
      expect(endpoint).toBe('/campaigns/test-campaign-123/relations');
    });

    it('should build entity-specific relations endpoint with entity ID', () => {
      const endpoint = manager._buildRelationsEndpoint(123);
      expect(endpoint).toBe('/campaigns/test-campaign-123/entities/123/relations');
    });

    it('should build specific relation endpoint with both IDs', () => {
      const endpoint = manager._buildRelationsEndpoint(123, 789);
      expect(endpoint).toBe('/campaigns/test-campaign-123/entities/123/relations/789');
    });

    it('should handle numeric entity and relation IDs', () => {
      const endpoint = manager._buildRelationsEndpoint(123, 789);
      expect(endpoint).toBe('/campaigns/test-campaign-123/entities/123/relations/789');
    });

    it('should handle string entity and relation IDs', () => {
      const endpoint = manager._buildRelationsEndpoint('123', '789');
      expect(endpoint).toBe('/campaigns/test-campaign-123/entities/123/relations/789');
    });
  });

  // ============================================================================
  // Create Operation Tests
  // ============================================================================

  describe('create', () => {
    it('should create relation with required fields', async () => {
      const mockRelation = createMockRelation();
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        attitude: 75
      };

      const result = await manager.create(123, relationData);

      expect(result).toEqual(mockRelation);
      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        relationData
      );
    });

    it('should create relation with targets array', async () => {
      const mockRelation = createMockRelation({ targets: [456, 789] });
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'is allied with',
        owner_id: 123,
        targets: [456, 789],
        attitude: 90
      };

      const result = await manager.create(123, relationData);

      expect(result).toEqual(mockRelation);
      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        relationData
      );
    });

    it('should create relation with all optional fields', async () => {
      const mockRelation = createMockRelation({
        visibility_id: 2,
        colour: '#FFD700',
        is_star: true
      });
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        attitude: 75,
        visibility_id: 2,
        colour: '#FFD700',
        is_star: true
      };

      const result = await manager.create(123, relationData);

      expect(result).toEqual(mockRelation);
      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        relationData
      );
    });

    it('should throw error if entity ID is missing', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456
      };

      await expect(manager.create(null, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(null, relationData)).rejects.toThrow('Entity ID is required');
    });

    it('should throw error if relation description is missing', async () => {
      const relationData = {
        owner_id: 123,
        target_id: 456
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Relation description is required');
    });

    it('should throw error if relation description is too long', async () => {
      const relationData = {
        relation: 'a'.repeat(256), // 256 characters - exceeds 255 limit
        owner_id: 123,
        target_id: 456
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('must be 255 characters or less');
    });

    it('should throw error if owner_id is missing', async () => {
      const relationData = {
        relation: 'is friends with',
        target_id: 456
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Owner entity ID is required');
    });

    it('should throw error if both target_id and targets are missing', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Either target_id or targets array is required');
    });

    it('should throw error if targets array is empty', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        targets: []
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Either target_id or targets array is required');
    });

    it('should throw error if attitude is below -100', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        attitude: -101
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Attitude must be a number between -100 and 100');
    });

    it('should throw error if attitude is above 100', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        attitude: 101
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Attitude must be a number between -100 and 100');
    });

    it('should throw error if attitude is not a number', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        attitude: 'invalid'
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Attitude must be a number between -100 and 100');
    });

    it('should accept attitude of -100', async () => {
      const mockRelation = createMockRelation({ attitude: -100 });
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'is enemies with',
        owner_id: 123,
        target_id: 456,
        attitude: -100
      };

      const result = await manager.create(123, relationData);
      expect(result).toEqual(mockRelation);
    });

    it('should accept attitude of 100', async () => {
      const mockRelation = createMockRelation({ attitude: 100 });
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'is best friends with',
        owner_id: 123,
        target_id: 456,
        attitude: 100
      };

      const result = await manager.create(123, relationData);
      expect(result).toEqual(mockRelation);
    });

    it('should throw error if visibility_id is below 1', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        visibility_id: 0
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Visibility ID must be a number between 1 and 5');
    });

    it('should throw error if visibility_id is above 5', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        visibility_id: 6
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Visibility ID must be a number between 1 and 5');
    });

    it('should throw error if visibility_id is not a number', async () => {
      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        visibility_id: 'invalid'
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(KankaError);
      await expect(manager.create(123, relationData)).rejects.toThrow('Visibility ID must be a number between 1 and 5');
    });

    it('should accept all valid visibility_id values (1-5)', async () => {
      for (let visibility = 1; visibility <= 5; visibility++) {
        const mockRelation = createMockRelation({ visibility_id: visibility });
        mockPost.mockResolvedValue({ data: mockRelation });

        const relationData = {
          relation: 'is friends with',
          owner_id: 123,
          target_id: 456,
          visibility_id: visibility
        };

        const result = await manager.create(123, relationData);
        expect(result.visibility_id).toBe(visibility);
      }
    });

    it('should handle API errors', async () => {
      const apiError = new KankaError('API request failed', KankaErrorType.API_ERROR);
      mockPost.mockRejectedValue(apiError);

      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(apiError);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockPost.mockRejectedValue(networkError);

      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456
      };

      await expect(manager.create(123, relationData)).rejects.toThrow(networkError);
    });
  });

  // ============================================================================
  // Get Operation Tests
  // ============================================================================

  describe('get', () => {
    it('should fetch a specific relation', async () => {
      const mockRelation = createMockRelation();
      mockGet.mockResolvedValue({ data: mockRelation });

      const result = await manager.get(123, 789);

      expect(result).toEqual(mockRelation);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations/789',
        undefined
      );
    });

    it('should throw error if entity ID is missing', async () => {
      await expect(manager.get(null, 789)).rejects.toThrow(KankaError);
      await expect(manager.get(null, 789)).rejects.toThrow('Entity ID is required');
    });

    it('should throw error if relation ID is missing', async () => {
      await expect(manager.get(123, null)).rejects.toThrow(KankaError);
      await expect(manager.get(123, null)).rejects.toThrow('Relation ID is required');
    });

    it('should handle API errors', async () => {
      const apiError = new KankaError('Relation not found', KankaErrorType.NOT_FOUND);
      mockGet.mockRejectedValue(apiError);

      await expect(manager.get(123, 789)).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // Update Operation Tests
  // ============================================================================

  describe('update', () => {
    it('should update relation with single field', async () => {
      const mockRelation = createMockRelation({ attitude: 90 });
      mockPut.mockResolvedValue({ data: mockRelation });

      const updateData = { attitude: 90 };
      const result = await manager.update(123, 789, updateData);

      expect(result).toEqual(mockRelation);
      expect(mockPut).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations/789',
        updateData
      );
    });

    it('should update relation with multiple fields', async () => {
      const mockRelation = createMockRelation({
        relation: 'is best friends with',
        attitude: 100,
        colour: '#FFD700'
      });
      mockPut.mockResolvedValue({ data: mockRelation });

      const updateData = {
        relation: 'is best friends with',
        attitude: 100,
        colour: '#FFD700'
      };
      const result = await manager.update(123, 789, updateData);

      expect(result).toEqual(mockRelation);
      expect(mockPut).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations/789',
        updateData
      );
    });

    it('should throw error if entity ID is missing', async () => {
      await expect(manager.update(null, 789, { attitude: 90 })).rejects.toThrow(KankaError);
      await expect(manager.update(null, 789, { attitude: 90 })).rejects.toThrow('Entity ID is required');
    });

    it('should throw error if relation ID is missing', async () => {
      await expect(manager.update(123, null, { attitude: 90 })).rejects.toThrow(KankaError);
      await expect(manager.update(123, null, { attitude: 90 })).rejects.toThrow('Relation ID is required');
    });

    it('should throw error if relation data is missing', async () => {
      await expect(manager.update(123, 789, null)).rejects.toThrow(KankaError);
      await expect(manager.update(123, 789, null)).rejects.toThrow('Relation data is required');
    });

    it('should throw error if relation data is empty object', async () => {
      await expect(manager.update(123, 789, {})).rejects.toThrow(KankaError);
      await expect(manager.update(123, 789, {})).rejects.toThrow('Relation data is required');
    });

    it('should throw error if updated relation description is too long', async () => {
      const updateData = { relation: 'a'.repeat(256) };

      await expect(manager.update(123, 789, updateData)).rejects.toThrow(KankaError);
      await expect(manager.update(123, 789, updateData)).rejects.toThrow('must be 255 characters or less');
    });

    it('should throw error if updated attitude is invalid', async () => {
      await expect(manager.update(123, 789, { attitude: -101 })).rejects.toThrow(KankaError);
      await expect(manager.update(123, 789, { attitude: 101 })).rejects.toThrow(KankaError);
      await expect(manager.update(123, 789, { attitude: 'invalid' })).rejects.toThrow(KankaError);
    });

    it('should throw error if updated visibility_id is invalid', async () => {
      await expect(manager.update(123, 789, { visibility_id: 0 })).rejects.toThrow(KankaError);
      await expect(manager.update(123, 789, { visibility_id: 6 })).rejects.toThrow(KankaError);
      await expect(manager.update(123, 789, { visibility_id: 'invalid' })).rejects.toThrow(KankaError);
    });

    it('should handle API errors', async () => {
      const apiError = new KankaError('Relation not found', KankaErrorType.NOT_FOUND);
      mockPut.mockRejectedValue(apiError);

      await expect(manager.update(123, 789, { attitude: 90 })).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // Delete Operation Tests
  // ============================================================================

  describe('delete', () => {
    it('should delete a relation', async () => {
      mockDelete.mockResolvedValue({});

      const result = await manager.delete(123, 789);

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('/campaigns/test-campaign-123/entities/123/relations/789');
    });

    it('should throw error if entity ID is missing', async () => {
      await expect(manager.delete(null, 789)).rejects.toThrow(KankaError);
      await expect(manager.delete(null, 789)).rejects.toThrow('Entity ID is required');
    });

    it('should throw error if relation ID is missing', async () => {
      await expect(manager.delete(123, null)).rejects.toThrow(KankaError);
      await expect(manager.delete(123, null)).rejects.toThrow('Relation ID is required');
    });

    it('should handle API errors', async () => {
      const apiError = new KankaError('Relation not found', KankaErrorType.NOT_FOUND);
      mockDelete.mockRejectedValue(apiError);

      await expect(manager.delete(123, 789)).rejects.toThrow(apiError);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockDelete.mockRejectedValue(networkError);

      await expect(manager.delete(123, 789)).rejects.toThrow(networkError);
    });
  });

  // ============================================================================
  // List Operation Tests (Entity-Specific)
  // ============================================================================

  describe('list', () => {
    it('should list relations for an entity', async () => {
      const mockRelations = [
        createMockRelation({ id: 1 }),
        createMockRelation({ id: 2 })
      ];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list(123);

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        {}
      );
    });

    it('should throw error if entity ID is missing', async () => {
      await expect(manager.list(null)).rejects.toThrow(KankaError);
      await expect(manager.list(null)).rejects.toThrow('Entity ID is required');
    });

    it('should support pagination', async () => {
      const mockRelations = [createMockRelation()];
      const mockResponse = createMockListResponse(mockRelations, 2);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list(123, { page: 2, pageSize: 25 });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        { page: 2, limit: 25 }
      );
    });

    it('should filter by related_id', async () => {
      const mockRelations = [createMockRelation({ target_id: 456 })];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list(123, { related_id: 456 });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        { related_id: 456 }
      );
    });

    it('should filter by is_star', async () => {
      const mockRelations = [createMockRelation({ is_star: true })];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list(123, { is_star: true });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        { is_star: 1 }
      );
    });

    it('should convert is_star false to 0', async () => {
      const mockRelations = [createMockRelation({ is_star: false })];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list(123, { is_star: false });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        { is_star: 0 }
      );
    });

    it('should combine multiple filters', async () => {
      const mockRelations = [createMockRelation()];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list(123, {
        page: 2,
        pageSize: 25,
        related_id: 456,
        is_star: true
      });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        {
          page: 2,
          limit: 25,
          related_id: 456,
          is_star: 1
        }
      );
    });

    it('should handle empty result', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list(123);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should handle API errors', async () => {
      const apiError = new KankaError('Entity not found', KankaErrorType.NOT_FOUND);
      mockGet.mockRejectedValue(apiError);

      await expect(manager.list(123)).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // List All Campaign Relations Tests
  // ============================================================================

  describe('listAllCampaignRelations', () => {
    it('should list all campaign relations', async () => {
      const mockRelations = [
        createMockRelation({ id: 1, owner_id: 123 }),
        createMockRelation({ id: 2, owner_id: 456 })
      ];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.listAllCampaignRelations();

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/relations',
        {}
      );
    });

    it('should support pagination', async () => {
      const mockRelations = [createMockRelation()];
      const mockResponse = createMockListResponse(mockRelations, 3);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.listAllCampaignRelations({ page: 3, pageSize: 50 });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/relations',
        { page: 3, limit: 50 }
      );
    });

    it('should filter by entity_id (owner)', async () => {
      const mockRelations = [createMockRelation({ owner_id: 123 })];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.listAllCampaignRelations({ entity_id: 123 });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/relations',
        { entity_id: 123 }
      );
    });

    it('should filter by related_id (target)', async () => {
      const mockRelations = [createMockRelation({ target_id: 456 })];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.listAllCampaignRelations({ related_id: 456 });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/relations',
        { related_id: 456 }
      );
    });

    it('should filter by is_star', async () => {
      const mockRelations = [createMockRelation({ is_star: true })];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.listAllCampaignRelations({ is_star: true });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/relations',
        { is_star: 1 }
      );
    });

    it('should convert is_star false to 0', async () => {
      const mockRelations = [createMockRelation({ is_star: false })];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.listAllCampaignRelations({ is_star: false });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/relations',
        { is_star: 0 }
      );
    });

    it('should combine multiple filters', async () => {
      const mockRelations = [createMockRelation()];
      const mockResponse = createMockListResponse(mockRelations);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.listAllCampaignRelations({
        page: 2,
        pageSize: 30,
        entity_id: 123,
        related_id: 456,
        is_star: true
      });

      expect(result).toEqual(mockResponse);
      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/relations',
        {
          page: 2,
          limit: 30,
          entity_id: 123,
          related_id: 456,
          is_star: 1
        }
      );
    });

    it('should handle empty result', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.listAllCampaignRelations();

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should handle API errors', async () => {
      const apiError = new KankaError('Unauthorized', KankaErrorType.UNAUTHORIZED);
      mockGet.mockRejectedValue(apiError);

      await expect(manager.listAllCampaignRelations()).rejects.toThrow(apiError);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockGet.mockRejectedValue(networkError);

      await expect(manager.listAllCampaignRelations()).rejects.toThrow(networkError);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases', () => {
    it('should handle relation with attitude of 0', async () => {
      const mockRelation = createMockRelation({ attitude: 0 });
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'is neutral towards',
        owner_id: 123,
        target_id: 456,
        attitude: 0
      };

      const result = await manager.create(123, relationData);
      expect(result.attitude).toBe(0);
    });

    it('should handle relation without attitude field', async () => {
      const mockRelation = createMockRelation();
      delete mockRelation.attitude;
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'knows',
        owner_id: 123,
        target_id: 456
      };

      const result = await manager.create(123, relationData);
      expect(result.attitude).toBeUndefined();
    });

    it('should handle relation with maximum allowed description length', async () => {
      const maxLengthRelation = 'a'.repeat(255);
      const mockRelation = createMockRelation({ relation: maxLengthRelation });
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: maxLengthRelation,
        owner_id: 123,
        target_id: 456
      };

      const result = await manager.create(123, relationData);
      expect(result.relation).toBe(maxLengthRelation);
    });

    it('should handle string entity IDs', async () => {
      const mockRelation = createMockRelation();
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456
      };

      await manager.create('123', relationData);

      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        relationData
      );
    });

    it('should preserve all extra fields in relation data', async () => {
      const mockRelation = createMockRelation({ custom_field: 'custom_value' });
      mockPost.mockResolvedValue({ data: mockRelation });

      const relationData = {
        relation: 'is friends with',
        owner_id: 123,
        target_id: 456,
        custom_field: 'custom_value'
      };

      await manager.create(123, relationData);

      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/entities/123/relations',
        expect.objectContaining({ custom_field: 'custom_value' })
      );
    });
  });
});
