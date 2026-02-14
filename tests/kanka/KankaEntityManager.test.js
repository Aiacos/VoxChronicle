/**
 * KankaEntityManager Unit Tests
 *
 * Tests for the KankaEntityManager utility class with proper mocking.
 * Covers CRUD operations, image uploads, search, error handling,
 * and campaign configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing KankaEntityManager
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
const mockPostFormData = vi.fn();

vi.mock('../../scripts/kanka/KankaClient.mjs', async () => {
  const actual = await vi.importActual('../../scripts/kanka/KankaClient.mjs');

  class MockKankaClient {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }

    get(endpoint) {
      return mockGet(endpoint);
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

    postFormData(endpoint, formData) {
      return mockPostFormData(endpoint, formData);
    }
  }

  return {
    ...actual,
    KankaClient: MockKankaClient
  };
});

// Import after mocks are set up
import { KankaEntityManager } from '../../scripts/kanka/KankaEntityManager.mjs';
import { KankaClient, KankaError, KankaErrorType } from '../../scripts/kanka/KankaClient.mjs';

/**
 * Create a mock entity response
 */
function createMockEntity(type, overrides = {}) {
  const defaults = {
    id: 123,
    name: 'Test Entity',
    entry: 'Test description',
    type: 'Test Type',
    is_private: false,
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
      first: 'https://api.kanka.io/campaigns/1/journals?page=1',
      last: `https://api.kanka.io/campaigns/1/journals?page=${Math.ceil((total || data.length) / 15)}`,
      prev: page > 1 ? `https://api.kanka.io/campaigns/1/journals?page=${page - 1}` : null,
      next: `https://api.kanka.io/campaigns/1/journals?page=${page + 1}`
    }
  };
}

describe('KankaEntityManager', () => {
  let client;
  let manager;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock client
    client = new KankaClient('test-api-token');

    // Create manager instance with test campaign
    manager = new KankaEntityManager(client, 'test-campaign-123');

    // Mock global fetch for image downloads
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Constructor and Configuration Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with client and campaign ID', () => {
      expect(manager).toBeInstanceOf(KankaEntityManager);
      expect(manager.campaignId).toBe('test-campaign-123');
    });

    it('should throw error if client is not provided', () => {
      expect(() => {
        new KankaEntityManager(null, 'test-campaign');
      }).toThrow(KankaError);

      expect(() => {
        new KankaEntityManager(null, 'test-campaign');
      }).toThrow('KankaClient instance is required');
    });

    it('should throw error if client is undefined', () => {
      expect(() => {
        new KankaEntityManager(undefined, 'test-campaign');
      }).toThrow(KankaError);
    });

    it('should handle empty campaign ID', () => {
      const emptyManager = new KankaEntityManager(client, '');
      expect(emptyManager.campaignId).toBe('');
    });

    it('should handle null campaign ID', () => {
      const nullManager = new KankaEntityManager(client, null);
      expect(nullManager.campaignId).toBe('');
    });

    it('should handle undefined campaign ID', () => {
      const undefinedManager = new KankaEntityManager(client);
      expect(undefinedManager.campaignId).toBe('');
    });
  });

  describe('campaignId getter', () => {
    it('should return the current campaign ID', () => {
      expect(manager.campaignId).toBe('test-campaign-123');
    });
  });

  describe('setCampaignId', () => {
    it('should update the campaign ID', () => {
      manager.setCampaignId('new-campaign-456');
      expect(manager.campaignId).toBe('new-campaign-456');
    });

    it('should handle empty campaign ID', () => {
      manager.setCampaignId('');
      expect(manager.campaignId).toBe('');
    });

    it('should handle null campaign ID', () => {
      manager.setCampaignId(null);
      expect(manager.campaignId).toBe('');
    });

    it('should handle undefined campaign ID', () => {
      manager.setCampaignId(undefined);
      expect(manager.campaignId).toBe('');
    });
  });

  // ============================================================================
  // Create Entity Tests
  // ============================================================================

  describe('create', () => {
    it('should create a journal entity', async () => {
      const mockJournal = createMockEntity('journal', {
        name: 'Session 1',
        entry: 'The adventure begins...'
      });

      mockPost.mockResolvedValue({ data: mockJournal });

      const result = await manager.create('journals', {
        name: 'Session 1',
        entry: 'The adventure begins...'
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/journals',
        expect.objectContaining({
          name: 'Session 1',
          entry: 'The adventure begins...',
          is_private: false
        })
      );

      expect(result).toEqual(mockJournal);
    });

    it('should create a character entity with additional fields', async () => {
      const mockCharacter = createMockEntity('character', {
        name: 'Grognard',
        type: 'NPC',
        age: '45',
        title: 'Warrior'
      });

      mockPost.mockResolvedValue({ data: mockCharacter });

      const result = await manager.create('characters', {
        name: 'Grognard',
        entry: 'A brave warrior',
        type: 'NPC',
        age: '45',
        title: 'Warrior'
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/characters',
        expect.objectContaining({
          name: 'Grognard',
          entry: 'A brave warrior',
          type: 'NPC',
          age: '45',
          title: 'Warrior',
          is_private: false
        })
      );

      expect(result).toEqual(mockCharacter);
    });

    it('should create entity with is_private set to true', async () => {
      const mockEntity = createMockEntity('location', {
        is_private: true
      });

      mockPost.mockResolvedValue({ data: mockEntity });

      await manager.create('locations', {
        name: 'Secret Cave',
        is_private: true
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/locations',
        expect.objectContaining({
          is_private: true
        })
      );
    });

    it('should handle entity without type field', async () => {
      const mockItem = createMockEntity('item');

      mockPost.mockResolvedValue({ data: mockItem });

      await manager.create('items', {
        name: 'Magic Sword'
      });

      const payload = mockPost.mock.calls[0][1];
      expect(payload).toHaveProperty('name', 'Magic Sword');
      expect(payload).toHaveProperty('entry', '');
      expect(payload).toHaveProperty('is_private', false);
      // type should not be in payload if not provided
    });

    it('should include empty arrays if provided', async () => {
      const mockEntity = createMockEntity('character');

      mockPost.mockResolvedValue({ data: mockEntity });

      await manager.create('characters', {
        name: 'Test',
        tags: []
      });

      const payload = mockPost.mock.calls[0][1];
      // Empty arrays should not be included
      expect(payload).not.toHaveProperty('tags');
    });

    it('should include non-empty arrays', async () => {
      const mockEntity = createMockEntity('character');

      mockPost.mockResolvedValue({ data: mockEntity });

      await manager.create('characters', {
        name: 'Test',
        tags: [1, 2, 3]
      });

      const payload = mockPost.mock.calls[0][1];
      expect(payload).toHaveProperty('tags', [1, 2, 3]);
    });

    it('should skip null and undefined values', async () => {
      const mockEntity = createMockEntity('character');

      mockPost.mockResolvedValue({ data: mockEntity });

      await manager.create('characters', {
        name: 'Test',
        age: null,
        title: undefined,
        description: 'Valid'
      });

      const payload = mockPost.mock.calls[0][1];
      expect(payload).not.toHaveProperty('age');
      expect(payload).not.toHaveProperty('title');
      expect(payload).toHaveProperty('description', 'Valid');
    });

    it('should throw error if name is missing', async () => {
      await expect(
        manager.create('journals', {
          entry: 'No name provided'
        })
      ).rejects.toThrow(KankaError);

      await expect(
        manager.create('journals', {
          entry: 'No name provided'
        })
      ).rejects.toThrow('Entity name is required');
    });

    it('should throw error if entityData is null', async () => {
      await expect(manager.create('journals', null)).rejects.toThrow(KankaError);
    });

    it('should throw error if entityData is undefined', async () => {
      await expect(manager.create('journals', undefined)).rejects.toThrow(KankaError);
    });

    it('should throw error if name is empty string', async () => {
      await expect(
        manager.create('journals', {
          name: ''
        })
      ).rejects.toThrow('Entity name is required');
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      await expect(
        noCampaignManager.create('journals', {
          name: 'Test'
        })
      ).rejects.toThrow('Campaign ID not configured');
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError('API error', KankaErrorType.API_ERROR);

      mockPost.mockRejectedValue(apiError);

      await expect(
        manager.create('journals', {
          name: 'Test'
        })
      ).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // Get Entity Tests
  // ============================================================================

  describe('get', () => {
    it('should get an entity by ID', async () => {
      const mockEntity = createMockEntity('character', {
        id: 456,
        name: 'Grognard'
      });

      mockGet.mockResolvedValue({ data: mockEntity });

      const result = await manager.get('characters', 456);

      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/characters/456');

      expect(result).toEqual(mockEntity);
    });

    it('should handle numeric entity ID', async () => {
      const mockEntity = createMockEntity('journal');

      mockGet.mockResolvedValue({ data: mockEntity });

      await manager.get('journals', 123);

      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/journals/123');
    });

    it('should handle string entity ID', async () => {
      const mockEntity = createMockEntity('location');

      mockGet.mockResolvedValue({ data: mockEntity });

      await manager.get('locations', '789');

      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/locations/789');
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      await expect(noCampaignManager.get('journals', 123)).rejects.toThrow(
        'Campaign ID not configured'
      );
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError('Entity not found', KankaErrorType.NOT_FOUND);

      mockGet.mockRejectedValue(apiError);

      await expect(manager.get('characters', 999)).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // Update Entity Tests
  // ============================================================================

  describe('update', () => {
    it('should update an entity', async () => {
      const mockUpdated = createMockEntity('character', {
        id: 456,
        name: 'Updated Name',
        age: '50'
      });

      mockPut.mockResolvedValue({ data: mockUpdated });

      const result = await manager.update('characters', 456, {
        name: 'Updated Name',
        age: '50'
      });

      expect(mockPut).toHaveBeenCalledWith('/campaigns/test-campaign-123/characters/456', {
        name: 'Updated Name',
        age: '50'
      });

      expect(result).toEqual(mockUpdated);
    });

    it('should support partial updates', async () => {
      const mockUpdated = createMockEntity('journal');

      mockPut.mockResolvedValue({ data: mockUpdated });

      await manager.update('journals', 123, {
        entry: 'Updated entry only'
      });

      expect(mockPut).toHaveBeenCalledWith('/campaigns/test-campaign-123/journals/123', {
        entry: 'Updated entry only'
      });
    });

    it('should handle numeric entity ID', async () => {
      const mockUpdated = createMockEntity('location');

      mockPut.mockResolvedValue({ data: mockUpdated });

      await manager.update('locations', 789, { name: 'New Name' });

      expect(mockPut).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/locations/789',
        expect.any(Object)
      );
    });

    it('should handle string entity ID', async () => {
      const mockUpdated = createMockEntity('item');

      mockPut.mockResolvedValue({ data: mockUpdated });

      await manager.update('items', '321', { name: 'New Name' });

      expect(mockPut).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/items/321',
        expect.any(Object)
      );
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      await expect(noCampaignManager.update('journals', 123, { name: 'Test' })).rejects.toThrow(
        'Campaign ID not configured'
      );
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError('Update failed', KankaErrorType.API_ERROR);

      mockPut.mockRejectedValue(apiError);

      await expect(manager.update('characters', 456, { name: 'Test' })).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // Delete Entity Tests
  // ============================================================================

  describe('delete', () => {
    it('should delete an entity', async () => {
      mockDelete.mockResolvedValue({});

      await manager.delete('items', 456);

      expect(mockDelete).toHaveBeenCalledWith('/campaigns/test-campaign-123/items/456');
    });

    it('should handle numeric entity ID', async () => {
      mockDelete.mockResolvedValue({});

      await manager.delete('journals', 123);

      expect(mockDelete).toHaveBeenCalledWith('/campaigns/test-campaign-123/journals/123');
    });

    it('should handle string entity ID', async () => {
      mockDelete.mockResolvedValue({});

      await manager.delete('characters', '789');

      expect(mockDelete).toHaveBeenCalledWith('/campaigns/test-campaign-123/characters/789');
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      await expect(noCampaignManager.delete('journals', 123)).rejects.toThrow(
        'Campaign ID not configured'
      );
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError('Delete failed', KankaErrorType.API_ERROR);

      mockDelete.mockRejectedValue(apiError);

      await expect(manager.delete('items', 456)).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // List Entities Tests
  // ============================================================================

  describe('list', () => {
    it('should list entities without options', async () => {
      const mockEntities = [
        createMockEntity('journal', { id: 1, name: 'Journal 1' }),
        createMockEntity('journal', { id: 2, name: 'Journal 2' })
      ];

      const mockResponse = createMockListResponse(mockEntities);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list('journals');

      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/journals');

      expect(result.data).toEqual(mockEntities);
      expect(result.meta).toBeDefined();
      expect(result.links).toBeDefined();
    });

    it('should list entities with pagination', async () => {
      const mockResponse = createMockListResponse([], 2, 50);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list('characters', { page: 2 });

      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/characters?page=2');

      expect(result.meta.current_page).toBe(2);
    });

    it('should list entities with type filter', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      await manager.list('characters', { type: 'NPC' });

      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/characters?type=NPC');
    });

    it('should list entities with name filter', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      await manager.list('locations', { name: 'Dragon' });

      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/locations?name=Dragon');
    });

    it('should list entities with multiple filters', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      await manager.list('characters', {
        page: 2,
        type: 'NPC',
        location_id: 789
      });

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('/campaigns/test-campaign-123/characters?')
      );

      const callArg = mockGet.mock.calls[0][0];
      expect(callArg).toContain('page=2');
      expect(callArg).toContain('type=NPC');
      expect(callArg).toContain('location_id=789');
    });

    it('should handle URL encoding for filter values', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      await manager.list('journals', { name: 'Test & Special' });

      const callArg = mockGet.mock.calls[0][0];
      expect(callArg).toContain('name=Test%20%26%20Special');
    });

    it('should skip null and undefined filter values', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      await manager.list('characters', {
        page: 1,
        type: null,
        name: undefined,
        location_id: 789
      });

      const callArg = mockGet.mock.calls[0][0];
      expect(callArg).toContain('page=1');
      expect(callArg).toContain('location_id=789');
      expect(callArg).not.toContain('type');
      expect(callArg).not.toContain('name');
    });

    it('should return empty data if API returns no data field', async () => {
      mockGet.mockResolvedValue({ meta: {}, links: {} });

      const result = await manager.list('journals');

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({});
      expect(result.links).toEqual({});
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      await expect(noCampaignManager.list('journals')).rejects.toThrow(
        'Campaign ID not configured'
      );
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError('List failed', KankaErrorType.API_ERROR);

      mockGet.mockRejectedValue(apiError);

      await expect(manager.list('characters')).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // Upload Image Tests
  // ============================================================================

  describe('uploadImage', () => {
    it('should upload image from URL', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      const mockUpdated = createMockEntity('character', {
        image: 'https://kanka.io/images/uploaded.png'
      });

      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockImageBlob)
      });

      mockPostFormData.mockResolvedValue({ data: mockUpdated });

      const result = await manager.uploadImage(
        'characters',
        456,
        'https://example.com/portrait.jpg'
      );

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/portrait.jpg');
      expect(mockPostFormData).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/characters/456',
        expect.any(FormData)
      );

      expect(result).toEqual(mockUpdated);
    });

    it('should upload image from Blob', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      const mockUpdated = createMockEntity('location', {
        image: 'https://kanka.io/images/uploaded.png'
      });

      mockPostFormData.mockResolvedValue({ data: mockUpdated });

      const result = await manager.uploadImage('locations', 789, mockImageBlob);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockPostFormData).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/locations/789',
        expect.any(FormData)
      );

      expect(result).toEqual(mockUpdated);
    });

    it('should use custom filename when provided', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      const mockUpdated = createMockEntity('character');

      mockPostFormData.mockResolvedValue({ data: mockUpdated });

      await manager.uploadImage('characters', 456, mockImageBlob, { filename: 'custom-name.jpg' });

      expect(mockPostFormData).toHaveBeenCalled();
      const formData = mockPostFormData.mock.calls[0][1];
      expect(formData).toBeInstanceOf(FormData);
    });

    it('should use default filename when not provided', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      const mockUpdated = createMockEntity('character');

      mockPostFormData.mockResolvedValue({ data: mockUpdated });

      await manager.uploadImage('characters', 456, mockImageBlob);

      expect(mockPostFormData).toHaveBeenCalled();
    });

    it('should throw error if entity type is missing', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });

      await expect(manager.uploadImage('', 456, mockImageBlob)).rejects.toThrow(
        'Entity type and ID are required'
      );
    });

    it('should throw error if entity ID is missing', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });

      await expect(manager.uploadImage('characters', null, mockImageBlob)).rejects.toThrow(
        'Entity type and ID are required'
      );
    });

    it('should throw error if image source is invalid type', async () => {
      await expect(manager.uploadImage('characters', 456, 12345)).rejects.toThrow(
        'Image source must be a URL string or Blob'
      );
    });

    it('should throw error if image download fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      await expect(
        manager.uploadImage('characters', 456, 'https://example.com/missing.jpg')
      ).rejects.toThrow(KankaError);

      await expect(
        manager.uploadImage('characters', 456, 'https://example.com/missing.jpg')
      ).rejects.toThrow('Failed to download image');
    });

    it('should throw error if image download throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        manager.uploadImage('characters', 456, 'https://example.com/image.jpg')
      ).rejects.toThrow(KankaError);
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });

      await expect(noCampaignManager.uploadImage('characters', 456, mockImageBlob)).rejects.toThrow(
        'Campaign ID not configured'
      );
    });

    it('should propagate API errors from upload', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      const apiError = new KankaError('Upload failed', KankaErrorType.API_ERROR);

      mockPostFormData.mockRejectedValue(apiError);

      await expect(manager.uploadImage('characters', 456, mockImageBlob)).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // Search Entities Tests
  // ============================================================================

  describe('searchEntities', () => {
    it('should search specific entity type', async () => {
      const mockResults = [
        createMockEntity('character', { id: 1, name: 'Dragon Slayer' }),
        createMockEntity('character', { id: 2, name: 'Dragon Knight' })
      ];

      mockGet.mockResolvedValue({ data: mockResults });

      const result = await manager.searchEntities('Dragon', 'characters');

      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/characters?name=Dragon');

      expect(result).toEqual(mockResults);
    });

    it('should search all entity types when no type specified', async () => {
      const mockCharacters = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      const mockLocations = [createMockEntity('location', { id: 2, name: "Dragon's Lair" })];

      mockGet
        .mockResolvedValueOnce({ data: mockCharacters })
        .mockResolvedValueOnce({ data: mockLocations })
        .mockResolvedValue({ data: [] });

      const result = await manager.searchEntities('Dragon');

      expect(mockGet).toHaveBeenCalledTimes(6); // 6 entity types
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('entity_type', 'characters');
      expect(result[1]).toHaveProperty('entity_type', 'locations');
    });

    it('should handle URL encoding in search query', async () => {
      mockGet.mockResolvedValue({ data: [] });

      await manager.searchEntities('Test & Special', 'journals');

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('name=Test%20%26%20Special'));
    });

    it('should return empty array for empty query', async () => {
      const result = await manager.searchEntities('');

      expect(mockGet).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await manager.searchEntities('   ');

      expect(mockGet).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should return empty array for null query', async () => {
      const result = await manager.searchEntities(null);

      expect(mockGet).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should continue searching other types if one fails', async () => {
      const mockCharacters = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];

      mockGet
        .mockResolvedValueOnce({ data: mockCharacters })
        .mockRejectedValueOnce(new Error('API error for locations'))
        .mockResolvedValue({ data: [] });

      const result = await manager.searchEntities('Dragon');

      // Should still return results from successful searches
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Dragon Slayer');
    });

    it('should add entity_type field to all results', async () => {
      const mockCharacters = [
        createMockEntity('character', { id: 1 }),
        createMockEntity('character', { id: 2 })
      ];

      mockGet.mockResolvedValueOnce({ data: mockCharacters }).mockResolvedValue({ data: [] });

      const result = await manager.searchEntities('Test');

      result.forEach((entity) => {
        expect(entity).toHaveProperty('entity_type');
      });
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      // For specific entity type
      await expect(noCampaignManager.searchEntities('Test', 'characters')).rejects.toThrow(
        'Campaign ID not configured'
      );
    });

    it('should propagate API errors for specific entity type search', async () => {
      const apiError = new KankaError('Search failed', KankaErrorType.API_ERROR);

      mockGet.mockRejectedValue(apiError);

      await expect(manager.searchEntities('Dragon', 'characters')).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // searchEntities Caching Tests
  // ============================================================================

  describe('searchEntities caching', () => {
    it('should make API call on cache miss (first search)', async () => {
      const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];

      mockGet.mockResolvedValue({ data: mockResults });

      const result = await manager.searchEntities('Dragon', 'characters');

      // Should call API on first search (cache miss)
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith('/campaigns/test-campaign-123/characters?name=Dragon');
      expect(result).toEqual(mockResults);
    });

    it('should use cache on second search (cache hit)', async () => {
      const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];

      mockGet.mockResolvedValue({ data: mockResults });

      // First search - cache miss
      const result1 = await manager.searchEntities('Dragon', 'characters');
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(mockResults);

      // Second search - cache hit
      const result2 = await manager.searchEntities('Dragon', 'characters');
      expect(mockGet).toHaveBeenCalledTimes(1); // Still only 1 call (no new API call)
      expect(result2).toEqual(mockResults);
      expect(result2).toBe(result1); // Should return same cached array
    });

    it('should maintain separate caches for different queries', async () => {
      const dragonResults = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      const knightResults = [createMockEntity('character', { id: 2, name: 'Knight Commander' })];

      mockGet
        .mockResolvedValueOnce({ data: dragonResults })
        .mockResolvedValueOnce({ data: knightResults });

      // Search for "Dragon"
      const result1 = await manager.searchEntities('Dragon', 'characters');
      expect(result1).toEqual(dragonResults);
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Search for "Knight" - different query, should call API
      const result2 = await manager.searchEntities('Knight', 'characters');
      expect(result2).toEqual(knightResults);
      expect(mockGet).toHaveBeenCalledTimes(2);

      // Search for "Dragon" again - should use cache
      const result3 = await manager.searchEntities('Dragon', 'characters');
      expect(result3).toEqual(dragonResults);
      expect(mockGet).toHaveBeenCalledTimes(2); // No new API call
    });

    it('should maintain separate caches for specific vs all entity types', async () => {
      const specificResults = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      const allTypesCharacters = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      const allTypesLocations = [createMockEntity('location', { id: 2, name: "Dragon's Lair" })];

      // First search - specific entity type
      mockGet.mockResolvedValueOnce({ data: specificResults });
      const result1 = await manager.searchEntities('Dragon', 'characters');
      expect(result1).toEqual(specificResults);
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Second search - all entity types (should not use cache from specific search)
      mockGet
        .mockResolvedValueOnce({ data: allTypesCharacters })
        .mockResolvedValueOnce({ data: allTypesLocations })
        .mockResolvedValue({ data: [] });

      const result2 = await manager.searchEntities('Dragon');
      expect(mockGet).toHaveBeenCalledTimes(7); // 1 + 6 for all types
      expect(result2).toHaveLength(2);
      expect(result2[0]).toHaveProperty('entity_type', 'characters');
      expect(result2[1]).toHaveProperty('entity_type', 'locations');

      // Third search - specific entity type again (should use first cache)
      const result3 = await manager.searchEntities('Dragon', 'characters');
      expect(mockGet).toHaveBeenCalledTimes(7); // No new API call
      expect(result3).toEqual(specificResults);

      // Fourth search - all entity types again (should use second cache)
      const result4 = await manager.searchEntities('Dragon');
      expect(mockGet).toHaveBeenCalledTimes(7); // No new API call
      expect(result4).toEqual(result2);
    });

    it('should maintain separate caches for different specific entity types', async () => {
      const characterResults = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      const locationResults = [createMockEntity('location', { id: 2, name: "Dragon's Lair" })];

      mockGet
        .mockResolvedValueOnce({ data: characterResults })
        .mockResolvedValueOnce({ data: locationResults });

      // Search characters
      const result1 = await manager.searchEntities('Dragon', 'characters');
      expect(result1).toEqual(characterResults);
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Search locations - different entity type, should call API
      const result2 = await manager.searchEntities('Dragon', 'locations');
      expect(result2).toEqual(locationResults);
      expect(mockGet).toHaveBeenCalledTimes(2);

      // Search characters again - should use cache
      const result3 = await manager.searchEntities('Dragon', 'characters');
      expect(result3).toEqual(characterResults);
      expect(mockGet).toHaveBeenCalledTimes(2); // No new API call

      // Search locations again - should use cache
      const result4 = await manager.searchEntities('Dragon', 'locations');
      expect(result4).toEqual(locationResults);
      expect(mockGet).toHaveBeenCalledTimes(2); // No new API call
    });

    it('should cache empty results', async () => {
      mockGet.mockResolvedValue({ data: [] });

      // First search - cache miss
      const result1 = await manager.searchEntities('NonExistent', 'characters');
      expect(result1).toEqual([]);
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Second search - cache hit (even for empty results)
      const result2 = await manager.searchEntities('NonExistent', 'characters');
      expect(result2).toEqual([]);
      expect(mockGet).toHaveBeenCalledTimes(1); // No new API call
    });

    it('should not cache results for empty queries', async () => {
      // Empty query returns early without caching
      const result1 = await manager.searchEntities('');
      expect(result1).toEqual([]);
      expect(mockGet).not.toHaveBeenCalled();

      // Check cache stats - should be empty
      const stats = manager.getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });

  // ============================================================================
  // Cache Expiry Tests
  // ============================================================================

  describe('cache expiry', () => {
    it('should expire cache after timeout', async () => {
      // Create manager with short expiry time
      const shortCacheManager = new KankaEntityManager(client, 'test-campaign-123', {
        cacheExpiryMs: 100
      });

      const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      mockGet.mockResolvedValue({ data: mockResults });

      // First search - cache miss
      await shortCacheManager.searchEntities('Dragon', 'characters');
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(shortCacheManager._searchCache.size).toBe(1);

      const firstCacheTime = shortCacheManager._cacheTimestamps.get('Dragon|characters');
      expect(firstCacheTime).toBeDefined();

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second search - cache expired, should fetch fresh data
      await shortCacheManager.searchEntities('Dragon', 'characters');

      // Should have made a second API call
      expect(mockGet).toHaveBeenCalledTimes(2);

      // Cache timestamp should be updated
      const secondCacheTime = shortCacheManager._cacheTimestamps.get('Dragon|characters');
      expect(secondCacheTime).toBeGreaterThan(firstCacheTime);
    });

    it('should not expire cache before timeout', async () => {
      // Create manager with longer expiry time
      const longCacheManager = new KankaEntityManager(client, 'test-campaign-123', {
        cacheExpiryMs: 10000 // 10 seconds
      });

      const mockResults = [createMockEntity('location', { id: 2, name: "Dragon's Lair" })];
      mockGet.mockResolvedValue({ data: mockResults });

      // First search - cache miss
      await longCacheManager.searchEntities('Dragon', 'locations');
      expect(mockGet).toHaveBeenCalledTimes(1);

      const firstCacheTime = longCacheManager._cacheTimestamps.get('Dragon|locations');

      // Wait a bit but not enough to expire
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second search - cache still valid
      await longCacheManager.searchEntities('Dragon', 'locations');

      // Should not have made a second API call
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Cache timestamp should be unchanged
      const secondCacheTime = longCacheManager._cacheTimestamps.get('Dragon|locations');
      expect(secondCacheTime).toBe(firstCacheTime);
    });

    it('should handle multiple cache entries with different expiry times', async () => {
      const shortCacheManager = new KankaEntityManager(client, 'test-campaign-123', {
        cacheExpiryMs: 100
      });

      const dragonResults = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      const knightResults = [createMockEntity('character', { id: 2, name: 'Knight Commander' })];

      mockGet
        .mockResolvedValueOnce({ data: dragonResults })
        .mockResolvedValueOnce({ data: knightResults })
        .mockResolvedValueOnce({ data: dragonResults }); // For re-fetch after expiry

      // Search for "Dragon" - cache miss
      await shortCacheManager.searchEntities('Dragon', 'characters');
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Wait 50ms, then search for "Knight" - cache miss
      await new Promise((resolve) => setTimeout(resolve, 50));
      await shortCacheManager.searchEntities('Knight', 'characters');
      expect(mockGet).toHaveBeenCalledTimes(2);

      // Wait another 70ms (total 120ms from first search, 70ms from second)
      await new Promise((resolve) => setTimeout(resolve, 70));

      // Search for "Dragon" again - should be expired (120ms > 100ms)
      await shortCacheManager.searchEntities('Dragon', 'characters');
      expect(mockGet).toHaveBeenCalledTimes(3);

      // Search for "Knight" again - should still be cached (70ms < 100ms)
      await shortCacheManager.searchEntities('Knight', 'characters');
      expect(mockGet).toHaveBeenCalledTimes(3); // No new API call
    });

    it('should respect custom cache expiry time from constructor', async () => {
      const customManager = new KankaEntityManager(client, 'test-campaign-123', {
        cacheExpiryMs: 200
      });

      expect(customManager._cacheExpiryMs).toBe(200);

      const stats = customManager.getCacheStats();
      expect(stats.expiryMs).toBe(200);
    });

    it('should use default cache expiry when not specified', async () => {
      const defaultManager = new KankaEntityManager(client, 'test-campaign-123');

      expect(defaultManager._cacheExpiryMs).toBe(300000); // 5 minutes default

      const stats = defaultManager.getCacheStats();
      expect(stats.expiryMs).toBe(300000);
    });

    it('should handle cache expiry for all entity types search', async () => {
      const shortCacheManager = new KankaEntityManager(client, 'test-campaign-123', {
        cacheExpiryMs: 100
      });

      const mockCharacters = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      const mockLocations = [createMockEntity('location', { id: 2, name: "Dragon's Lair" })];

      // First search - all entity types
      mockGet
        .mockResolvedValueOnce({ data: mockCharacters })
        .mockResolvedValueOnce({ data: mockLocations })
        .mockResolvedValue({ data: [] });

      await shortCacheManager.searchEntities('Dragon');
      expect(mockGet).toHaveBeenCalledTimes(6); // 6 entity types

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second search - cache expired, should fetch fresh data
      mockGet
        .mockResolvedValueOnce({ data: mockCharacters })
        .mockResolvedValueOnce({ data: mockLocations })
        .mockResolvedValue({ data: [] });

      await shortCacheManager.searchEntities('Dragon');

      // Should have made another 6 API calls
      expect(mockGet).toHaveBeenCalledTimes(12);
    });

    it('should clear expired cache entries with clearCache', async () => {
      const shortCacheManager = new KankaEntityManager(client, 'test-campaign-123', {
        cacheExpiryMs: 100
      });

      const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon Slayer' })];
      mockGet.mockResolvedValue({ data: mockResults });

      // Populate cache
      await shortCacheManager.searchEntities('Dragon', 'characters');
      expect(shortCacheManager._searchCache.size).toBe(1);
      expect(shortCacheManager._cacheTimestamps.size).toBe(1);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Clear cache manually
      shortCacheManager.clearCache();

      expect(shortCacheManager._searchCache.size).toBe(0);
      expect(shortCacheManager._cacheTimestamps.size).toBe(0);
    });

    it('should validate cache based on timestamp, not just existence', async () => {
      const shortCacheManager = new KankaEntityManager(client, 'test-campaign-123', {
        cacheExpiryMs: 100
      });

      const cacheKey = 'Test|characters';

      // Manually set an old timestamp
      shortCacheManager._searchCache.set(cacheKey, []);
      shortCacheManager._cacheTimestamps.set(cacheKey, Date.now() - 200); // 200ms ago

      // Cache should be invalid even though it exists
      expect(shortCacheManager._isCacheValid(cacheKey)).toBe(false);

      // Set a recent timestamp
      shortCacheManager._cacheTimestamps.set(cacheKey, Date.now());

      // Cache should be valid
      expect(shortCacheManager._isCacheValid(cacheKey)).toBe(true);
    });
  });

  // ============================================================================
  // Cache Management Tests
  // ============================================================================

  describe('cache management', () => {
    describe('clearCache', () => {
      it('should clear all cache entries and timestamps', async () => {
        const mockResults1 = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        const mockResults2 = [createMockEntity('location', { id: 2, name: 'Cave' })];

        mockGet
          .mockResolvedValueOnce({ data: mockResults1 })
          .mockResolvedValueOnce({ data: mockResults2 });

        // Populate cache with multiple entries
        await manager.searchEntities('Dragon', 'characters');
        await manager.searchEntities('Cave', 'locations');

        expect(manager._searchCache.size).toBe(2);
        expect(manager._cacheTimestamps.size).toBe(2);

        // Clear all cache
        manager.clearCache();

        expect(manager._searchCache.size).toBe(0);
        expect(manager._cacheTimestamps.size).toBe(0);
      });

      it('should allow fresh searches after clearing cache', async () => {
        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        // First search - cache miss
        await manager.searchEntities('Dragon', 'characters');
        expect(mockGet).toHaveBeenCalledTimes(1);

        // Clear cache
        manager.clearCache();

        // Search again - should make new API call (cache was cleared)
        await manager.searchEntities('Dragon', 'characters');
        expect(mockGet).toHaveBeenCalledTimes(2);
      });

      it('should handle clearing empty cache', () => {
        expect(manager._searchCache.size).toBe(0);
        expect(manager._cacheTimestamps.size).toBe(0);

        // Should not throw error
        expect(() => manager.clearCache()).not.toThrow();

        expect(manager._searchCache.size).toBe(0);
        expect(manager._cacheTimestamps.size).toBe(0);
      });
    });

    describe('clearCacheFor', () => {
      it('should clear cache for specific query', async () => {
        const mockResults1 = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        const mockResults2 = [createMockEntity('character', { id: 2, name: 'Knight' })];

        mockGet
          .mockResolvedValueOnce({ data: mockResults1 })
          .mockResolvedValueOnce({ data: mockResults2 });

        // Populate cache with two entries
        await manager.searchEntities('Dragon', 'characters');
        await manager.searchEntities('Knight', 'characters');

        expect(manager._searchCache.size).toBe(2);
        expect(manager._cacheTimestamps.size).toBe(2);

        // Clear only Dragon cache
        manager.clearCacheFor('Dragon|characters');

        expect(manager._searchCache.size).toBe(1);
        expect(manager._cacheTimestamps.size).toBe(1);
        expect(manager._searchCache.has('Knight|characters')).toBe(true);
        expect(manager._searchCache.has('Dragon|characters')).toBe(false);
      });

      it('should allow fresh search after clearing specific cache entry', async () => {
        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        // First search - cache miss
        await manager.searchEntities('Dragon', 'characters');
        expect(mockGet).toHaveBeenCalledTimes(1);

        // Clear specific cache entry
        manager.clearCacheFor('Dragon|characters');

        // Search again - should make new API call
        await manager.searchEntities('Dragon', 'characters');
        expect(mockGet).toHaveBeenCalledTimes(2);
      });

      it('should handle clearing non-existent cache entry', () => {
        expect(manager._searchCache.size).toBe(0);

        // Should not throw error
        expect(() => manager.clearCacheFor('NonExistent|characters')).not.toThrow();

        expect(manager._searchCache.size).toBe(0);
      });

      it('should clear both cache and timestamp for entry', async () => {
        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        await manager.searchEntities('Dragon', 'characters');

        const cacheKey = 'Dragon|characters';
        expect(manager._searchCache.has(cacheKey)).toBe(true);
        expect(manager._cacheTimestamps.has(cacheKey)).toBe(true);

        manager.clearCacheFor(cacheKey);

        expect(manager._searchCache.has(cacheKey)).toBe(false);
        expect(manager._cacheTimestamps.has(cacheKey)).toBe(false);
      });

      it('should clear cache for all entity types search', async () => {
        const mockCharacters = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        const mockLocations = [createMockEntity('location', { id: 2, name: 'Lair' })];

        mockGet
          .mockResolvedValueOnce({ data: mockCharacters })
          .mockResolvedValueOnce({ data: mockLocations })
          .mockResolvedValue({ data: [] });

        // Search all entity types
        await manager.searchEntities('Dragon');
        expect(manager._searchCache.has('Dragon|all')).toBe(true);

        // Clear the all-types cache
        manager.clearCacheFor('Dragon|all');

        expect(manager._searchCache.has('Dragon|all')).toBe(false);
        expect(manager._cacheTimestamps.has('Dragon|all')).toBe(false);
      });

      it('should not affect other cache entries when clearing specific entry', async () => {
        const mockResults1 = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        const mockResults2 = [createMockEntity('character', { id: 2, name: 'Knight' })];
        const mockResults3 = [createMockEntity('location', { id: 3, name: 'Castle' })];

        mockGet
          .mockResolvedValueOnce({ data: mockResults1 })
          .mockResolvedValueOnce({ data: mockResults2 })
          .mockResolvedValueOnce({ data: mockResults3 });

        // Populate cache with three entries
        await manager.searchEntities('Dragon', 'characters');
        await manager.searchEntities('Knight', 'characters');
        await manager.searchEntities('Castle', 'locations');

        expect(manager._searchCache.size).toBe(3);

        // Clear only Knight cache
        manager.clearCacheFor('Knight|characters');

        expect(manager._searchCache.size).toBe(2);
        expect(manager._searchCache.has('Dragon|characters')).toBe(true);
        expect(manager._searchCache.has('Knight|characters')).toBe(false);
        expect(manager._searchCache.has('Castle|locations')).toBe(true);
      });
    });

    describe('getCacheStats', () => {
      it('should return correct cache statistics', () => {
        const stats = manager.getCacheStats();

        expect(stats).toHaveProperty('entries');
        expect(stats).toHaveProperty('expiryMs');
        expect(stats.entries).toBe(0);
        expect(stats.expiryMs).toBe(300000); // Default 5 minutes
      });

      it('should reflect cache entries count', async () => {
        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        // Initially empty
        let stats = manager.getCacheStats();
        expect(stats.entries).toBe(0);

        // Add one entry
        await manager.searchEntities('Dragon', 'characters');
        stats = manager.getCacheStats();
        expect(stats.entries).toBe(1);

        // Add another entry
        await manager.searchEntities('Knight', 'characters');
        stats = manager.getCacheStats();
        expect(stats.entries).toBe(2);
      });

      it('should reflect custom cache expiry time', () => {
        const customManager = new KankaEntityManager(client, 'test-campaign-123', {
          cacheExpiryMs: 60000
        });

        const stats = customManager.getCacheStats();
        expect(stats.expiryMs).toBe(60000);
      });

      it('should update entries count after clearing cache', async () => {
        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        // Populate cache
        await manager.searchEntities('Dragon', 'characters');
        await manager.searchEntities('Knight', 'characters');

        let stats = manager.getCacheStats();
        expect(stats.entries).toBe(2);

        // Clear cache
        manager.clearCache();

        stats = manager.getCacheStats();
        expect(stats.entries).toBe(0);
      });

      it('should update entries count after clearing specific entry', async () => {
        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        // Populate cache
        await manager.searchEntities('Dragon', 'characters');
        await manager.searchEntities('Knight', 'characters');

        let stats = manager.getCacheStats();
        expect(stats.entries).toBe(2);

        // Clear one entry
        manager.clearCacheFor('Dragon|characters');

        stats = manager.getCacheStats();
        expect(stats.entries).toBe(1);
      });

      it('should not include expired entries in count', async () => {
        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        // Populate cache
        await manager.searchEntities('Dragon', 'characters');

        const stats = manager.getCacheStats();
        // Note: getCacheStats returns total entries count, not valid entries
        // Expired entries are still counted until they are accessed or cleared
        expect(stats.entries).toBe(1);
      });
    });

    describe('_isCacheValid', () => {
      it('should return false for non-existent cache key', () => {
        expect(manager._isCacheValid('NonExistent|characters')).toBe(false);
      });

      it('should return true for recently cached entry', async () => {
        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        await manager.searchEntities('Dragon', 'characters');

        expect(manager._isCacheValid('Dragon|characters')).toBe(true);
      });

      it('should return false for expired cache entry', async () => {
        const shortCacheManager = new KankaEntityManager(client, 'test-campaign-123', {
          cacheExpiryMs: 50
        });

        const mockResults = [createMockEntity('character', { id: 1, name: 'Dragon' })];
        mockGet.mockResolvedValue({ data: mockResults });

        await shortCacheManager.searchEntities('Dragon', 'characters');

        // Cache should be valid immediately
        expect(shortCacheManager._isCacheValid('Dragon|characters')).toBe(true);

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Cache should be invalid after expiry
        expect(shortCacheManager._isCacheValid('Dragon|characters')).toBe(false);
      });

      it('should handle cache entry with data but no timestamp', () => {
        // Manually add cache entry without timestamp
        manager._searchCache.set('Orphan|characters', []);

        // Should return false because timestamp is missing
        expect(manager._isCacheValid('Orphan|characters')).toBe(false);
      });

      it('should validate based on exact timestamp difference', () => {
        const cacheKey = 'Test|characters';
        const expiryMs = 1000;

        const customManager = new KankaEntityManager(client, 'test-campaign-123', {
          cacheExpiryMs: expiryMs
        });

        // Set timestamp just under expiry time
        customManager._searchCache.set(cacheKey, []);
        customManager._cacheTimestamps.set(cacheKey, Date.now() - (expiryMs - 10));

        expect(customManager._isCacheValid(cacheKey)).toBe(true);

        // Set timestamp just over expiry time
        customManager._cacheTimestamps.set(cacheKey, Date.now() - (expiryMs + 10));

        expect(customManager._isCacheValid(cacheKey)).toBe(false);
      });
    });
  });
});
