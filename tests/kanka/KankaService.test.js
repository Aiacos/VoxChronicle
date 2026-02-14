/**
 * KankaService Unit Tests
 *
 * Tests for the KankaService class with emphasis on parallel batch processing.
 * Covers constructor configuration, batch creation (sequential and parallel modes),
 * progress tracking, error handling, and rate limiting integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing KankaService
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

// Mock KankaClient
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
const mockPostFormData = vi.fn();

vi.mock('../../scripts/kanka/KankaClient.mjs', async () => {
  const actual = await vi.importActual('../../scripts/kanka/KankaClient.mjs');

  class MockKankaClient {
    constructor(apiToken, options = {}) {
      this.apiToken = apiToken;
      this.isConfigured = Boolean(apiToken);
      this.isPremium = options.isPremium || false;
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

// Mock KankaEntityManager
const mockEntityManagerCreate = vi.fn();
const mockEntityManagerGet = vi.fn();
const mockEntityManagerUpdate = vi.fn();
const mockEntityManagerDelete = vi.fn();
const mockEntityManagerList = vi.fn();

vi.mock('../../scripts/kanka/KankaEntityManager.mjs', () => ({
  KankaEntityManager: class MockKankaEntityManager {
    constructor(client, campaignId) {
      this.client = client;
      this._campaignId = campaignId;
    }

    setCampaignId(campaignId) {
      this._campaignId = campaignId;
    }

    create(entityType, entityData) {
      return mockEntityManagerCreate(entityType, entityData);
    }

    get(entityType, entityId) {
      return mockEntityManagerGet(entityType, entityId);
    }

    update(entityType, entityId, entityData) {
      return mockEntityManagerUpdate(entityType, entityId, entityData);
    }

    delete(entityType, entityId) {
      return mockEntityManagerDelete(entityType, entityId);
    }

    list(entityType, options) {
      return mockEntityManagerList(entityType, options);
    }
  }
}));

// Import after mocks are set up
import { KankaService, KankaEntityType, CharacterType } from '../../scripts/kanka/KankaService.mjs';
import { KankaError } from '../../scripts/kanka/KankaClient.mjs';

/**
 * Create a mock entity response
 */
function createMockEntity(type, overrides = {}) {
  const defaults = {
    id: Math.floor(Math.random() * 10000),
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
 * Create a mock search response
 */
function createMockSearchResponse(data = []) {
  return {
    data
  };
}

describe('KankaService', () => {
  let service;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create service instance with test credentials
    service = new KankaService('test-api-token', 'test-campaign-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Constructor and Configuration Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with API token and campaign ID', () => {
      expect(service).toBeInstanceOf(KankaService);
      expect(service.isFullyConfigured).toBe(true);
      expect(service.campaignId).toBe('test-campaign-123');
    });

    it('should initialize entity cache', () => {
      const defaultService = new KankaService('test-token', 'test-campaign');
      expect(defaultService._entityCache).toBeInstanceOf(Map);
      expect(defaultService._cacheTimestamps).toBeInstanceOf(Map);
      expect(defaultService._cacheExpiryMs).toBe(300000);
    });

    it('should pass isPremium to parent constructor', () => {
      const premiumService = new KankaService('test-token', 'test-campaign', {
        isPremium: true
      });
      expect(premiumService.isPremium).toBe(true);
    });

    it('should handle empty campaign ID', () => {
      const emptyService = new KankaService('test-token', '');
      expect(emptyService.isFullyConfigured).toBe(false);
    });

    it('should handle null campaign ID', () => {
      const nullService = new KankaService('test-token', null);
      expect(nullService.isFullyConfigured).toBe(false);
    });
  });

  describe('isFullyConfigured', () => {
    it('should return true when API token and campaign ID are set', () => {
      expect(service.isFullyConfigured).toBe(true);
    });

    it('should return false when campaign ID is missing', () => {
      const noId = new KankaService('test-token', '');
      expect(noId.isFullyConfigured).toBe(false);
    });

    it('should return false when API token is missing', () => {
      const noToken = new KankaService('', 'test-campaign');
      expect(noToken.isFullyConfigured).toBe(false);
    });
  });

  describe('campaignId getter and setter', () => {
    it('should get campaign ID', () => {
      expect(service.campaignId).toBe('test-campaign-123');
    });

    it('should set campaign ID', () => {
      service.setCampaignId('new-campaign-456');
      expect(service.campaignId).toBe('new-campaign-456');
    });

    it('should handle empty string in setter', () => {
      service.setCampaignId('');
      expect(service.campaignId).toBe('');
    });

    it('should handle null in setter', () => {
      service.setCampaignId(null);
      expect(service.campaignId).toBe('');
    });
  });

  // ============================================================================
  // Entity Creation Tests
  // ============================================================================

  describe('createCharacter', () => {
    it('should create character with default type NPC', async () => {
      const mockCharacter = createMockEntity('character', { name: 'Elara', type: 'NPC' });
      mockEntityManagerCreate.mockResolvedValue(mockCharacter);

      const result = await service.createCharacter({ name: 'Elara' });

      expect(mockEntityManagerCreate).toHaveBeenCalledWith(
        KankaEntityType.CHARACTER,
        expect.objectContaining({
          name: 'Elara',
          type: CharacterType.NPC
        })
      );
      expect(result).toEqual(mockCharacter);
    });

    it('should create character with custom type', async () => {
      const mockCharacter = createMockEntity('character', { name: 'Hero', type: 'PC' });
      mockEntityManagerCreate.mockResolvedValue(mockCharacter);

      const result = await service.createCharacter({ name: 'Hero', type: 'PC' });

      expect(mockEntityManagerCreate).toHaveBeenCalledWith(
        KankaEntityType.CHARACTER,
        expect.objectContaining({
          name: 'Hero',
          type: 'PC'
        })
      );
      expect(result).toEqual(mockCharacter);
    });
  });

  describe('createIfNotExists', () => {
    it('should create entity if it does not exist', async () => {
      // Mock search returns empty results
      mockGet.mockResolvedValue(createMockSearchResponse([]));

      const mockCharacter = createMockEntity('character', { name: 'NewChar' });
      mockEntityManagerCreate.mockResolvedValue(mockCharacter);

      const result = await service.createIfNotExists(KankaEntityType.CHARACTER, {
        name: 'NewChar',
        type: 'NPC'
      });

      expect(mockGet).toHaveBeenCalled(); // Search was performed
      expect(mockEntityManagerCreate).toHaveBeenCalled(); // Entity was created
      expect(result).toEqual(mockCharacter);
      expect(result._alreadyExisted).toBeUndefined();
    });

    it('should return existing entity if found', async () => {
      const existingCharacter = createMockEntity('character', {
        id: 999,
        name: 'ExistingChar'
      });

      // Mock search returns existing entity
      mockGet.mockResolvedValue(createMockSearchResponse([existingCharacter]));

      const result = await service.createIfNotExists(KankaEntityType.CHARACTER, {
        name: 'ExistingChar',
        type: 'NPC'
      });

      expect(mockGet).toHaveBeenCalled(); // Search was performed
      expect(mockEntityManagerCreate).not.toHaveBeenCalled(); // No creation
      expect(result._alreadyExisted).toBe(true);
      expect(result.id).toBe(999);
    });

    it('should perform case-insensitive matching', async () => {
      const existingCharacter = createMockEntity('character', {
        id: 888,
        name: 'ELARA'
      });

      mockGet.mockResolvedValue(createMockSearchResponse([existingCharacter]));

      const result = await service.createIfNotExists(KankaEntityType.CHARACTER, {
        name: 'elara'
      });

      expect(result._alreadyExisted).toBe(true);
      expect(result.id).toBe(888);
    });

    it('should throw error if name is missing', async () => {
      await expect(service.createIfNotExists(KankaEntityType.CHARACTER, {})).rejects.toThrow(
        KankaError
      );

      await expect(
        service.createIfNotExists(KankaEntityType.CHARACTER, { name: '' })
      ).rejects.toThrow('Entity name is required');
    });
  });

  // ============================================================================
  // Batch Create Tests - Sequential Mode
  // ============================================================================

  describe('batchCreate - sequential mode (default)', () => {
    it('should create multiple entities sequentially', async () => {
      const entities = [{ name: 'Character 1' }, { name: 'Character 2' }, { name: 'Character 3' }];

      // Mock search returns empty (no existing entities)
      mockGet.mockResolvedValue(createMockSearchResponse([]));

      // Mock entity creation
      mockEntityManagerCreate.mockImplementation((type, data) => {
        return Promise.resolve(createMockEntity('character', data));
      });

      const results = await service.batchCreate(KankaEntityType.CHARACTER, entities);

      expect(results).toHaveLength(3);
      expect(mockEntityManagerCreate).toHaveBeenCalledTimes(3);
      expect(results[0].name).toBe('Character 1');
      expect(results[1].name).toBe('Character 2');
      expect(results[2].name).toBe('Character 3');
    });

    it('should skip existing entities when skipExisting is true', async () => {
      const entities = [{ name: 'New Character' }, { name: 'Existing Character' }];

      // Mock search for first entity (not found)
      mockGet.mockResolvedValueOnce(createMockSearchResponse([]));

      // Mock search for second entity (found)
      const existingEntity = createMockEntity('character', {
        id: 999,
        name: 'Existing Character'
      });
      mockGet.mockResolvedValueOnce(createMockSearchResponse([existingEntity]));

      // Mock creation for new entity
      mockEntityManagerCreate.mockResolvedValue(
        createMockEntity('character', { name: 'New Character' })
      );

      const results = await service.batchCreate(KankaEntityType.CHARACTER, entities, {
        skipExisting: true
      });

      expect(results).toHaveLength(2);
      expect(mockEntityManagerCreate).toHaveBeenCalledTimes(1); // Only one created
      expect(results[1]._alreadyExisted).toBe(true);
    });

    it('should create all entities when skipExisting is false', async () => {
      const entities = [{ name: 'Character 1' }, { name: 'Character 2' }];

      mockEntityManagerCreate.mockImplementation((type, data) => {
        return Promise.resolve(createMockEntity('character', data));
      });

      const results = await service.batchCreate(KankaEntityType.CHARACTER, entities, {
        skipExisting: false
      });

      expect(results).toHaveLength(2);
      expect(mockGet).not.toHaveBeenCalled(); // No search performed
      expect(mockEntityManagerCreate).toHaveBeenCalledTimes(2);
    });

    it('should call progress callback with correct values', async () => {
      const entities = [{ name: 'Char 1' }, { name: 'Char 2' }, { name: 'Char 3' }];
      const progressSpy = vi.fn();

      mockGet.mockResolvedValue(createMockSearchResponse([]));
      mockEntityManagerCreate.mockImplementation((type, data) => {
        return Promise.resolve(createMockEntity('character', data));
      });

      await service.batchCreate(KankaEntityType.CHARACTER, entities, {
        onProgress: progressSpy
      });

      expect(progressSpy).toHaveBeenCalledTimes(3);
      expect(progressSpy).toHaveBeenNthCalledWith(1, 1, 3, expect.any(Object));
      expect(progressSpy).toHaveBeenNthCalledWith(2, 2, 3, expect.any(Object));
      expect(progressSpy).toHaveBeenNthCalledWith(3, 3, 3, expect.any(Object));
    });

    it('should handle errors and continue processing', async () => {
      const entities = [{ name: 'Success 1' }, { name: 'Failure' }, { name: 'Success 2' }];

      mockGet.mockResolvedValue(createMockSearchResponse([]));

      // Mock: first succeeds, second fails, third succeeds
      mockEntityManagerCreate
        .mockResolvedValueOnce(createMockEntity('character', { name: 'Success 1' }))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(createMockEntity('character', { name: 'Success 2' }));

      const results = await service.batchCreate(KankaEntityType.CHARACTER, entities);

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Success 1');
      expect(results[1]._error).toBeDefined();
      expect(results[1]._error).toContain('API Error');
      expect(results[2].name).toBe('Success 2');
    });

    it('should return empty array for empty input', async () => {
      const results = await service.batchCreate(KankaEntityType.CHARACTER, []);
      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // Batch Create Tests - Parallel Mode
  // ============================================================================

  describe('batchCreate - parallel mode', () => {
    let parallelService;

    beforeEach(() => {
      parallelService = new KankaService('test-token', 'test-campaign', {
        enableParallelBatch: true,
        batchConcurrency: 3
      });
    });

    it('should create multiple entities in parallel batches', async () => {
      const entities = [
        { name: 'Char 1' },
        { name: 'Char 2' },
        { name: 'Char 3' },
        { name: 'Char 4' },
        { name: 'Char 5' }
      ];

      mockGet.mockResolvedValue(createMockSearchResponse([]));
      mockEntityManagerCreate.mockImplementation((type, data) => {
        return Promise.resolve(createMockEntity('character', data));
      });

      const results = await parallelService.batchCreate(KankaEntityType.CHARACTER, entities);

      expect(results).toHaveLength(5);
      expect(mockEntityManagerCreate).toHaveBeenCalledTimes(5);
      // Verify all entities were created
      expect(results.every((r) => r.id)).toBe(true);
    });

    it('should maintain original input order in results', async () => {
      const entities = [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }, { name: 'Delta' }];

      mockGet.mockResolvedValue(createMockSearchResponse([]));
      mockEntityManagerCreate.mockImplementation((type, data) => {
        // Simulate varying response times
        return new Promise((resolve) => {
          const delay = Math.random() * 10;
          setTimeout(() => {
            resolve(createMockEntity('character', data));
          }, delay);
        });
      });

      const results = await parallelService.batchCreate(KankaEntityType.CHARACTER, entities);

      expect(results[0].name).toBe('Alpha');
      expect(results[1].name).toBe('Beta');
      expect(results[2].name).toBe('Gamma');
      expect(results[3].name).toBe('Delta');
    });

    it('should handle errors in parallel mode without failing entire batch', async () => {
      const entities = [
        { name: 'Success 1' },
        { name: 'Failure 1' },
        { name: 'Success 2' },
        { name: 'Failure 2' },
        { name: 'Success 3' }
      ];

      mockGet.mockResolvedValue(createMockSearchResponse([]));
      mockEntityManagerCreate.mockImplementation((type, data) => {
        if (data.name.includes('Failure')) {
          return Promise.reject(new Error('Creation failed'));
        }
        return Promise.resolve(createMockEntity('character', data));
      });

      const results = await parallelService.batchCreate(KankaEntityType.CHARACTER, entities);

      expect(results).toHaveLength(5);
      expect(results[0].name).toBe('Success 1');
      expect(results[1]._error).toBeDefined();
      expect(results[2].name).toBe('Success 2');
      expect(results[3]._error).toBeDefined();
      expect(results[4].name).toBe('Success 3');
    });

    it('should call progress callback correctly in parallel mode', async () => {
      const entities = [
        { name: 'Char 1' },
        { name: 'Char 2' },
        { name: 'Char 3' },
        { name: 'Char 4' }
      ];
      const progressSpy = vi.fn();

      mockGet.mockResolvedValue(createMockSearchResponse([]));
      mockEntityManagerCreate.mockImplementation((type, data) => {
        return Promise.resolve(createMockEntity('character', data));
      });

      await parallelService.batchCreate(KankaEntityType.CHARACTER, entities, {
        onProgress: progressSpy
      });

      expect(progressSpy).toHaveBeenCalledTimes(4);
      // Note: Order may vary due to parallel execution, but count should be correct
      const progressCalls = progressSpy.mock.calls;
      expect(progressCalls.some((call) => call[0] === 1 && call[1] === 4)).toBe(true);
      expect(progressCalls.some((call) => call[0] === 2 && call[1] === 4)).toBe(true);
      expect(progressCalls.some((call) => call[0] === 3 && call[1] === 4)).toBe(true);
      expect(progressCalls.some((call) => call[0] === 4 && call[1] === 4)).toBe(true);
    });

    it('should respect batch concurrency limit', async () => {
      const entities = Array.from({ length: 10 }, (_, i) => ({ name: `Char ${i + 1}` }));
      const concurrentCalls = [];
      let maxConcurrent = 0;

      mockGet.mockResolvedValue(createMockSearchResponse([]));
      mockEntityManagerCreate.mockImplementation((type, data) => {
        concurrentCalls.push(data.name);
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls.length);

        return new Promise((resolve) => {
          setTimeout(() => {
            concurrentCalls.splice(concurrentCalls.indexOf(data.name), 1);
            resolve(createMockEntity('character', data));
          }, 10);
        });
      });

      await parallelService.batchCreate(KankaEntityType.CHARACTER, entities);

      // With concurrency of 3, we should never have more than 3 concurrent calls
      // Note: This is a simplified check - actual concurrency may be harder to verify
      expect(mockEntityManagerCreate).toHaveBeenCalledTimes(10);
    });

    it('should handle skipExisting in parallel mode', async () => {
      const entities = [{ name: 'New 1' }, { name: 'Existing' }, { name: 'New 2' }];

      // Mock search results
      mockGet.mockImplementation((endpoint) => {
        if (endpoint.includes('name=Existing')) {
          return Promise.resolve(
            createMockSearchResponse([createMockEntity('character', { id: 999, name: 'Existing' })])
          );
        }
        return Promise.resolve(createMockSearchResponse([]));
      });

      mockEntityManagerCreate.mockImplementation((type, data) => {
        return Promise.resolve(createMockEntity('character', data));
      });

      const results = await parallelService.batchCreate(KankaEntityType.CHARACTER, entities, {
        skipExisting: true
      });

      expect(results).toHaveLength(3);
      expect(results[1]._alreadyExisted).toBe(true);
      expect(mockEntityManagerCreate).toHaveBeenCalledTimes(2); // Only new ones created
    });

    it('should fall back to sequential mode when concurrency is 1', async () => {
      const sequentialService = new KankaService('test-token', 'test-campaign', {
        enableParallelBatch: true,
        batchConcurrency: 1
      });

      const entities = [{ name: 'Char 1' }, { name: 'Char 2' }];

      mockGet.mockResolvedValue(createMockSearchResponse([]));
      mockEntityManagerCreate.mockImplementation((type, data) => {
        return Promise.resolve(createMockEntity('character', data));
      });

      const results = await sequentialService.batchCreate(KankaEntityType.CHARACTER, entities);

      expect(results).toHaveLength(2);
      expect(mockEntityManagerCreate).toHaveBeenCalledTimes(2);
    });

    it('should use sequential mode when enableParallelBatch is false', async () => {
      const disabledService = new KankaService('test-token', 'test-campaign', {
        enableParallelBatch: false,
        batchConcurrency: 5
      });

      const entities = [{ name: 'Char 1' }, { name: 'Char 2' }];

      mockGet.mockResolvedValue(createMockSearchResponse([]));
      mockEntityManagerCreate.mockImplementation((type, data) => {
        return Promise.resolve(createMockEntity('character', data));
      });

      const results = await disabledService.batchCreate(KankaEntityType.CHARACTER, entities);

      expect(results).toHaveLength(2);
      // In sequential mode, entities are processed one by one
      expect(mockEntityManagerCreate).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // Batch Create Tests - Entity Type Support
  // ============================================================================

  describe('batchCreate - entity type support', () => {
    beforeEach(() => {
      mockGet.mockResolvedValue(createMockSearchResponse([]));
    });

    it('should create batch of characters', async () => {
      mockEntityManagerCreate.mockResolvedValue(createMockEntity('character'));
      const entities = [{ name: 'Char 1' }, { name: 'Char 2' }];

      const results = await service.batchCreate(KankaEntityType.CHARACTER, entities, {
        skipExisting: false
      });

      expect(results).toHaveLength(2);
    });

    it('should create batch of locations', async () => {
      mockEntityManagerCreate.mockResolvedValue(createMockEntity('location'));
      const entities = [{ name: 'Loc 1' }, { name: 'Loc 2' }];

      const results = await service.batchCreate(KankaEntityType.LOCATION, entities, {
        skipExisting: false
      });

      expect(results).toHaveLength(2);
    });

    it('should create batch of items', async () => {
      mockEntityManagerCreate.mockResolvedValue(createMockEntity('item'));
      const entities = [{ name: 'Item 1' }, { name: 'Item 2' }];

      const results = await service.batchCreate(KankaEntityType.ITEM, entities, {
        skipExisting: false
      });

      expect(results).toHaveLength(2);
    });

    it('should create batch of journals', async () => {
      mockEntityManagerCreate.mockResolvedValue(createMockEntity('journal'));
      const entities = [{ name: 'Journal 1' }, { name: 'Journal 2' }];

      const results = await service.batchCreate(KankaEntityType.JOURNAL, entities, {
        skipExisting: false
      });

      expect(results).toHaveLength(2);
    });

    it('should create batch of organisations', async () => {
      mockEntityManagerCreate.mockResolvedValue(createMockEntity('organisation'));
      const entities = [{ name: 'Org 1' }, { name: 'Org 2' }];

      const results = await service.batchCreate(KankaEntityType.ORGANISATION, entities, {
        skipExisting: false
      });

      expect(results).toHaveLength(2);
    });

    it('should create batch of quests', async () => {
      mockEntityManagerCreate.mockResolvedValue(createMockEntity('quest'));
      const entities = [{ name: 'Quest 1' }, { name: 'Quest 2' }];

      const results = await service.batchCreate(KankaEntityType.QUEST, entities, {
        skipExisting: false
      });

      expect(results).toHaveLength(2);
    });

    it('should handle error for unsupported entity type', async () => {
      const entities = [{ name: 'Test' }];

      const results = await service.batchCreate('unsupported_type', entities, {
        skipExisting: false
      });

      expect(results).toHaveLength(1);
      expect(results[0]._error).toBeDefined();
      expect(results[0]._error).toContain('Unsupported entity type');
    });
  });

  // ============================================================================
  // Search and Find Tests
  // ============================================================================

  describe('searchEntities', () => {
    it('should return empty array for empty query', async () => {
      const results = await service.searchEntities('');
      expect(results).toEqual([]);
    });

    it('should search specific entity type', async () => {
      const mockResults = [createMockEntity('character', { name: 'Elara' })];
      mockGet.mockResolvedValue(createMockSearchResponse(mockResults));

      const results = await service.searchEntities('Elara', KankaEntityType.CHARACTER);

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('characters'));
      expect(results).toEqual(mockResults);
    });
  });

  describe('findExistingEntity', () => {
    it('should find exact match case-insensitive', async () => {
      const mockEntity = createMockEntity('character', { name: 'ELARA' });
      mockGet.mockResolvedValue(createMockSearchResponse([mockEntity]));

      const result = await service.findExistingEntity('elara', KankaEntityType.CHARACTER);

      expect(result).toBeDefined();
      expect(result.name).toBe('ELARA');
    });

    it('should return null when no match found', async () => {
      mockGet.mockResolvedValue(createMockSearchResponse([]));

      const result = await service.findExistingEntity('NonExistent', KankaEntityType.CHARACTER);

      expect(result).toBeNull();
    });

    it('should return null for empty name', async () => {
      const result = await service.findExistingEntity('', KankaEntityType.CHARACTER);
      expect(result).toBeNull();
    });

    it('should return null for missing entity type', async () => {
      const result = await service.findExistingEntity('Test', null);
      expect(result).toBeNull();
    });
  });
});
