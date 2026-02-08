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
      await expect(
        manager.create('journals', null)
      ).rejects.toThrow(KankaError);
    });

    it('should throw error if entityData is undefined', async () => {
      await expect(
        manager.create('journals', undefined)
      ).rejects.toThrow(KankaError);
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
      const apiError = new KankaError(
        'API error',
        KankaErrorType.API_ERROR
      );

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

      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/characters/456'
      );

      expect(result).toEqual(mockEntity);
    });

    it('should handle numeric entity ID', async () => {
      const mockEntity = createMockEntity('journal');

      mockGet.mockResolvedValue({ data: mockEntity });

      await manager.get('journals', 123);

      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/journals/123'
      );
    });

    it('should handle string entity ID', async () => {
      const mockEntity = createMockEntity('location');

      mockGet.mockResolvedValue({ data: mockEntity });

      await manager.get('locations', '789');

      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/locations/789'
      );
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      await expect(
        noCampaignManager.get('journals', 123)
      ).rejects.toThrow('Campaign ID not configured');
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError(
        'Entity not found',
        KankaErrorType.NOT_FOUND
      );

      mockGet.mockRejectedValue(apiError);

      await expect(
        manager.get('characters', 999)
      ).rejects.toThrow(apiError);
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

      expect(mockPut).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/characters/456',
        {
          name: 'Updated Name',
          age: '50'
        }
      );

      expect(result).toEqual(mockUpdated);
    });

    it('should support partial updates', async () => {
      const mockUpdated = createMockEntity('journal');

      mockPut.mockResolvedValue({ data: mockUpdated });

      await manager.update('journals', 123, {
        entry: 'Updated entry only'
      });

      expect(mockPut).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/journals/123',
        {
          entry: 'Updated entry only'
        }
      );
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

      await expect(
        noCampaignManager.update('journals', 123, { name: 'Test' })
      ).rejects.toThrow('Campaign ID not configured');
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError(
        'Update failed',
        KankaErrorType.API_ERROR
      );

      mockPut.mockRejectedValue(apiError);

      await expect(
        manager.update('characters', 456, { name: 'Test' })
      ).rejects.toThrow(apiError);
    });
  });

  // ============================================================================
  // Delete Entity Tests
  // ============================================================================

  describe('delete', () => {
    it('should delete an entity', async () => {
      mockDelete.mockResolvedValue({});

      await manager.delete('items', 456);

      expect(mockDelete).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/items/456'
      );
    });

    it('should handle numeric entity ID', async () => {
      mockDelete.mockResolvedValue({});

      await manager.delete('journals', 123);

      expect(mockDelete).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/journals/123'
      );
    });

    it('should handle string entity ID', async () => {
      mockDelete.mockResolvedValue({});

      await manager.delete('characters', '789');

      expect(mockDelete).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/characters/789'
      );
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      await expect(
        noCampaignManager.delete('journals', 123)
      ).rejects.toThrow('Campaign ID not configured');
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError(
        'Delete failed',
        KankaErrorType.API_ERROR
      );

      mockDelete.mockRejectedValue(apiError);

      await expect(
        manager.delete('items', 456)
      ).rejects.toThrow(apiError);
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

      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/journals'
      );

      expect(result.data).toEqual(mockEntities);
      expect(result.meta).toBeDefined();
      expect(result.links).toBeDefined();
    });

    it('should list entities with pagination', async () => {
      const mockResponse = createMockListResponse([], 2, 50);
      mockGet.mockResolvedValue(mockResponse);

      const result = await manager.list('characters', { page: 2 });

      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/characters?page=2'
      );

      expect(result.meta.current_page).toBe(2);
    });

    it('should list entities with type filter', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      await manager.list('characters', { type: 'NPC' });

      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/characters?type=NPC'
      );
    });

    it('should list entities with name filter', async () => {
      const mockResponse = createMockListResponse([]);
      mockGet.mockResolvedValue(mockResponse);

      await manager.list('locations', { name: 'Dragon' });

      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/locations?name=Dragon'
      );
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

      await expect(
        noCampaignManager.list('journals')
      ).rejects.toThrow('Campaign ID not configured');
    });

    it('should propagate API errors', async () => {
      const apiError = new KankaError(
        'List failed',
        KankaErrorType.API_ERROR
      );

      mockGet.mockRejectedValue(apiError);

      await expect(
        manager.list('characters')
      ).rejects.toThrow(apiError);
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

      const result = await manager.uploadImage(
        'locations',
        789,
        mockImageBlob
      );

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

      await manager.uploadImage(
        'characters',
        456,
        mockImageBlob,
        { filename: 'custom-name.jpg' }
      );

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

      await expect(
        manager.uploadImage('', 456, mockImageBlob)
      ).rejects.toThrow('Entity type and ID are required');
    });

    it('should throw error if entity ID is missing', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });

      await expect(
        manager.uploadImage('characters', null, mockImageBlob)
      ).rejects.toThrow('Entity type and ID are required');
    });

    it('should throw error if image source is invalid type', async () => {
      await expect(
        manager.uploadImage('characters', 456, 12345)
      ).rejects.toThrow('Image source must be a URL string or Blob');
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

      await expect(
        noCampaignManager.uploadImage('characters', 456, mockImageBlob)
      ).rejects.toThrow('Campaign ID not configured');
    });

    it('should propagate API errors from upload', async () => {
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      const apiError = new KankaError(
        'Upload failed',
        KankaErrorType.API_ERROR
      );

      mockPostFormData.mockRejectedValue(apiError);

      await expect(
        manager.uploadImage('characters', 456, mockImageBlob)
      ).rejects.toThrow(apiError);
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

      expect(mockGet).toHaveBeenCalledWith(
        '/campaigns/test-campaign-123/characters?name=Dragon'
      );

      expect(result).toEqual(mockResults);
    });

    it('should search all entity types when no type specified', async () => {
      const mockCharacters = [
        createMockEntity('character', { id: 1, name: 'Dragon Slayer' })
      ];
      const mockLocations = [
        createMockEntity('location', { id: 2, name: "Dragon's Lair" })
      ];

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

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('name=Test%20%26%20Special')
      );
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
      const mockCharacters = [
        createMockEntity('character', { id: 1, name: 'Dragon Slayer' })
      ];

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

      mockGet
        .mockResolvedValueOnce({ data: mockCharacters })
        .mockResolvedValue({ data: [] });

      const result = await manager.searchEntities('Test');

      result.forEach(entity => {
        expect(entity).toHaveProperty('entity_type');
      });
    });

    it('should throw error if campaign ID is not configured', async () => {
      const noCampaignManager = new KankaEntityManager(client, '');

      // For specific entity type
      await expect(
        noCampaignManager.searchEntities('Test', 'characters')
      ).rejects.toThrow('Campaign ID not configured');
    });

    it('should propagate API errors for specific entity type search', async () => {
      const apiError = new KankaError(
        'Search failed',
        KankaErrorType.API_ERROR
      );

      mockGet.mockRejectedValue(apiError);

      await expect(
        manager.searchEntities('Dragon', 'characters')
      ).rejects.toThrow(apiError);
    });
  });
});
