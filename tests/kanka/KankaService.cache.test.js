/**
 * KankaService Cache Unit Tests
 *
 * Tests for the KankaService caching functionality including cache validation,
 * cache management methods, and pre-fetch operations.
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

// Mock RateLimiter
const mockExecuteWithRetry = vi.fn((fn) => fn());
const mockPause = vi.fn();
const mockReset = vi.fn();
const mockGetStats = vi.fn(() => ({
  totalRequests: 0,
  rateLimitHits: 0,
  retries: 0
}));

vi.mock('../../scripts/utils/RateLimiter.mjs', () => ({
  RateLimiter: {
    fromPreset: () => ({
      executeWithRetry: mockExecuteWithRetry,
      pause: mockPause,
      reset: mockReset,
      getStats: mockGetStats,
      remainingRequests: 30,
      isPaused: false
    })
  }
}));

// Mock SensitiveDataFilter
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeUrl: vi.fn((url) => url),
    sanitizeString: vi.fn((str) => str),
    sanitizeObject: vi.fn((obj) => obj)
  }
}));

// Mock MODULE_ID
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import { KankaService } from '../../scripts/kanka/KankaService.mjs';

/**
 * Create a mock successful API response
 */
function createMockResponse(data, status = 200, headers = {}) {
  const responseHeaders = new Headers({
    'content-type': 'application/json',
    ...headers
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: responseHeaders,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data))
  };
}

describe('KankaService - Cache Methods', () => {
  let service;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create service instance
    service = new KankaService('test-api-token', 'test-campaign-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Cache Validation Tests
  // ============================================================================

  describe('_isCacheValid', () => {
    it('should return false when cache key does not exist', () => {
      const isValid = service._isCacheValid('nonexistent-key');
      expect(isValid).toBe(false);
    });

    it('should return false when cache exists but has no timestamp', () => {
      // Set cache without timestamp (simulating corrupted state)
      service._entityCache.set('characters', [{ id: 1, name: 'Test' }]);

      const isValid = service._isCacheValid('characters');
      expect(isValid).toBe(false);
    });

    it('should return true when cache exists and is not expired', () => {
      const now = Date.now();
      const entities = [{ id: 1, name: 'Test Character' }];

      // Set cache with recent timestamp
      service._entityCache.set('characters', entities);
      service._cacheTimestamps.set('characters', now);

      const isValid = service._isCacheValid('characters');
      expect(isValid).toBe(true);
    });

    it('should return false when cache is expired', () => {
      const expiredTime = Date.now() - (service._cacheExpiryMs + 1000); // Expired by 1 second
      const entities = [{ id: 1, name: 'Test Character' }];

      // Set cache with expired timestamp
      service._entityCache.set('characters', entities);
      service._cacheTimestamps.set('characters', expiredTime);

      const isValid = service._isCacheValid('characters');
      expect(isValid).toBe(false);
    });

    it('should return false when cache age equals expiry threshold', () => {
      const exactExpiryTime = Date.now() - service._cacheExpiryMs;
      const entities = [{ id: 1, name: 'Test Character' }];

      // Set cache at exact expiry boundary
      service._entityCache.set('characters', entities);
      service._cacheTimestamps.set('characters', exactExpiryTime);

      const isValid = service._isCacheValid('characters');
      expect(isValid).toBe(false); // Age >= expiryMs means expired (implementation uses <)
    });
  });

  // ============================================================================
  // Cache Storage Tests
  // ============================================================================

  describe('_setCachedEntities', () => {
    it('should store entities in cache', () => {
      const entities = [
        { id: 1, name: 'Character 1' },
        { id: 2, name: 'Character 2' }
      ];

      service._setCachedEntities('characters', entities);

      expect(service._entityCache.get('characters')).toEqual(entities);
      expect(service._cacheTimestamps.has('characters')).toBe(true);
    });

    it('should set timestamp when storing entities', () => {
      const entities = [{ id: 1, name: 'Test' }];
      const beforeTime = Date.now();

      service._setCachedEntities('characters', entities);

      const timestamp = service._cacheTimestamps.get('characters');
      const afterTime = Date.now();

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle empty arrays', () => {
      service._setCachedEntities('characters', []);

      expect(service._entityCache.get('characters')).toEqual([]);
      expect(service._cacheTimestamps.has('characters')).toBe(true);
    });

    it('should overwrite existing cache', () => {
      const oldEntities = [{ id: 1, name: 'Old' }];
      const newEntities = [{ id: 2, name: 'New' }];
      const oldTimestamp = Date.now() - 1000;

      // Set old cache
      service._entityCache.set('characters', oldEntities);
      service._cacheTimestamps.set('characters', oldTimestamp);

      // Overwrite with new cache
      service._setCachedEntities('characters', newEntities);

      expect(service._entityCache.get('characters')).toEqual(newEntities);
      expect(service._cacheTimestamps.get('characters')).toBeGreaterThan(oldTimestamp);
    });
  });

  // ============================================================================
  // Cache Retrieval Tests
  // ============================================================================

  describe('_getCachedEntities', () => {
    it('should return null when cache key does not exist', () => {
      const cached = service._getCachedEntities('nonexistent-key');
      expect(cached).toBeNull();
    });

    it('should return null when cache is expired', () => {
      const expiredTime = Date.now() - (service._cacheExpiryMs + 1000);
      const entities = [{ id: 1, name: 'Test' }];

      service._entityCache.set('characters', entities);
      service._cacheTimestamps.set('characters', expiredTime);

      const cached = service._getCachedEntities('characters');
      expect(cached).toBeNull();
    });

    it('should return entities when cache is valid', () => {
      const entities = [
        { id: 1, name: 'Character 1' },
        { id: 2, name: 'Character 2' }
      ];

      service._setCachedEntities('characters', entities);

      const cached = service._getCachedEntities('characters');
      expect(cached).toEqual(entities);
    });

    it('should return same reference as stored entities', () => {
      const entities = [{ id: 1, name: 'Test' }];

      service._setCachedEntities('characters', entities);
      const cached = service._getCachedEntities('characters');

      expect(cached).toBe(entities); // Same reference
    });
  });

  // ============================================================================
  // Cache Clearing Tests
  // ============================================================================

  describe('_clearCache', () => {
    beforeEach(() => {
      // Populate cache with multiple types
      service._setCachedEntities('characters', [{ id: 1, name: 'Char' }]);
      service._setCachedEntities('locations', [{ id: 2, name: 'Loc' }]);
      service._setCachedEntities('items', [{ id: 3, name: 'Item' }]);
    });

    it('should clear specific cache key', () => {
      service._clearCache('characters');

      expect(service._entityCache.has('characters')).toBe(false);
      expect(service._cacheTimestamps.has('characters')).toBe(false);

      // Other caches should remain
      expect(service._entityCache.has('locations')).toBe(true);
      expect(service._entityCache.has('items')).toBe(true);
    });

    it('should clear all cache when no key specified', () => {
      service._clearCache();

      expect(service._entityCache.size).toBe(0);
      expect(service._cacheTimestamps.size).toBe(0);
    });

    it('should clear all cache when null key specified', () => {
      service._clearCache(null);

      expect(service._entityCache.size).toBe(0);
      expect(service._cacheTimestamps.size).toBe(0);
    });

    it('should handle clearing nonexistent key', () => {
      expect(() => service._clearCache('nonexistent-key')).not.toThrow();
    });
  });

  // ============================================================================
  // Public Cache Management Tests
  // ============================================================================

  describe('clearCache (public)', () => {
    beforeEach(() => {
      // Populate cache
      service._setCachedEntities('characters', [{ id: 1, name: 'Char' }]);
      service._setCachedEntities('locations', [{ id: 2, name: 'Loc' }]);
    });

    it('should clear specific entity type cache', () => {
      service.clearCache('characters');

      expect(service._entityCache.has('characters')).toBe(false);
      expect(service._entityCache.has('locations')).toBe(true);
    });

    it('should clear all cache when no argument', () => {
      service.clearCache();

      expect(service._entityCache.size).toBe(0);
      expect(service._cacheTimestamps.size).toBe(0);
    });

    it('should clear all cache when null argument', () => {
      service.clearCache(null);

      expect(service._entityCache.size).toBe(0);
      expect(service._cacheTimestamps.size).toBe(0);
    });
  });

  // ============================================================================
  // Pre-Fetch Entities Tests
  // ============================================================================

  describe('preFetchEntities', () => {
    it('should fetch all default entity types', async () => {
      const mockCharacters = { data: [{ id: 1, name: 'Char1' }], meta: {}, links: {} };
      const mockLocations = { data: [{ id: 2, name: 'Loc1' }], meta: {}, links: {} };
      const mockItems = { data: [{ id: 3, name: 'Item1' }], meta: {}, links: {} };
      const mockJournals = { data: [{ id: 4, name: 'Journal1' }], meta: {}, links: {} };
      const mockOrganisations = { data: [{ id: 5, name: 'Org1' }], meta: {}, links: {} };
      const mockQuests = { data: [{ id: 6, name: 'Quest1' }], meta: {}, links: {} };

      // Mock API responses - KankaClient wraps them, EntityManager extracts data field
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockCharacters))
        .mockResolvedValueOnce(createMockResponse(mockLocations))
        .mockResolvedValueOnce(createMockResponse(mockItems))
        .mockResolvedValueOnce(createMockResponse(mockJournals))
        .mockResolvedValueOnce(createMockResponse(mockOrganisations))
        .mockResolvedValueOnce(createMockResponse(mockQuests));

      const result = await service.preFetchEntities();

      // Verify all types were fetched
      expect(mockFetch).toHaveBeenCalledTimes(6);
      // preFetchEntities unwraps response.data into flat arrays
      expect(result.characters).toEqual(mockCharacters.data);
      expect(result.locations).toEqual(mockLocations.data);
      expect(result.items).toEqual(mockItems.data);
      expect(result.journals).toEqual(mockJournals.data);
      expect(result.organisations).toEqual(mockOrganisations.data);
      expect(result.quests).toEqual(mockQuests.data);

      // Verify cache was populated with flat entity arrays
      expect(service._entityCache.has('characters')).toBe(true);
      expect(service._entityCache.has('locations')).toBe(true);
      expect(service._entityCache.has('items')).toBe(true);
      expect(service._entityCache.has('journals')).toBe(true);
      expect(service._entityCache.has('organisations')).toBe(true);
      expect(service._entityCache.has('quests')).toBe(true);
    });

    it('should fetch only specified entity types', async () => {
      const mockCharacters = { data: [{ id: 1, name: 'Char1' }], meta: {}, links: {} };
      const mockLocations = { data: [{ id: 2, name: 'Loc1' }], meta: {}, links: {} };

      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockCharacters))
        .mockResolvedValueOnce(createMockResponse(mockLocations));

      const result = await service.preFetchEntities({
        types: ['characters', 'locations']
      });

      // Only 2 types should be fetched
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.characters).toEqual(mockCharacters.data);
      expect(result.locations).toEqual(mockLocations.data);
      expect(result.items).toBeUndefined();

      // Only specified types should be cached
      expect(service._entityCache.has('characters')).toBe(true);
      expect(service._entityCache.has('locations')).toBe(true);
      expect(service._entityCache.has('items')).toBe(false);
    });

    it('should use cached data when cache is valid', async () => {
      const cachedCharacters = [{ id: 1, name: 'Cached Char' }];
      const cachedLocations = [{ id: 2, name: 'Cached Loc' }];

      // Pre-populate cache (cache stores flat entity arrays)
      service._setCachedEntities('characters', cachedCharacters);
      service._setCachedEntities('locations', cachedLocations);

      const result = await service.preFetchEntities({
        types: ['characters', 'locations']
      });

      // No API calls should be made
      expect(mockFetch).not.toHaveBeenCalled();

      // Should return cached data
      expect(result.characters).toEqual(cachedCharacters);
      expect(result.locations).toEqual(cachedLocations);
    });

    it('should refresh cache when force=true', async () => {
      const cachedCharacters = [{ id: 1, name: 'Cached Char' }];
      const newCharacters = { data: [{ id: 2, name: 'New Char' }], meta: {}, links: {} };

      // Pre-populate cache
      service._setCachedEntities('characters', cachedCharacters);

      mockFetch.mockResolvedValueOnce(createMockResponse(newCharacters));

      const result = await service.preFetchEntities({
        types: ['characters'],
        force: true
      });

      // API call should be made despite valid cache
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should return unwrapped data array
      expect(result.characters).toEqual(newCharacters.data);

      // Cache should be updated with flat array
      expect(service._getCachedEntities('characters')).toEqual(newCharacters.data);
    });

    it('should handle mixed cached and non-cached types', async () => {
      const cachedCharacters = [{ id: 1, name: 'Cached' }];
      const mockLocations = { data: [{ id: 2, name: 'Loc1' }], meta: {}, links: {} };

      // Pre-populate only characters
      service._setCachedEntities('characters', cachedCharacters);

      mockFetch.mockResolvedValueOnce(createMockResponse(mockLocations));

      const result = await service.preFetchEntities({
        types: ['characters', 'locations']
      });

      // Only locations should be fetched
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should return both cached and fetched
      expect(result.characters).toEqual(cachedCharacters);
      expect(result.locations).toEqual(mockLocations.data);
    });

    it('should handle expired cache', async () => {
      const expiredTime = Date.now() - (service._cacheExpiryMs + 1000);
      const oldCharacters = [{ id: 1, name: 'Old' }];
      const newCharacters = { data: [{ id: 2, name: 'New' }], meta: {}, links: {} };

      // Set expired cache
      service._entityCache.set('characters', oldCharacters);
      service._cacheTimestamps.set('characters', expiredTime);

      mockFetch.mockResolvedValueOnce(createMockResponse(newCharacters));

      const result = await service.preFetchEntities({
        types: ['characters']
      });

      // Should fetch new data
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.characters).toEqual(newCharacters.data);
    });

    it('should handle unknown entity types gracefully', async () => {
      const mockCharacters = { data: [{ id: 1, name: 'Char1' }], meta: {}, links: {} };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockCharacters));

      const result = await service.preFetchEntities({
        types: ['characters', 'unknown-type']
      });

      // Only characters should be fetched
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.characters).toEqual(mockCharacters.data);
      expect(result['unknown-type']).toBeUndefined();
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.preFetchEntities({ types: ['characters'] })).rejects.toThrow(
        'Network error'
      );
    });

    it('should return empty result when all types are cached', async () => {
      // Pre-populate all requested types
      service._setCachedEntities('characters', [{ id: 1, name: 'Char' }]);
      service._setCachedEntities('locations', [{ id: 2, name: 'Loc' }]);

      const result = await service.preFetchEntities({
        types: ['characters', 'locations']
      });

      // No API calls should be made
      expect(mockFetch).not.toHaveBeenCalled();

      // Should return cached data
      expect(result.characters).toBeDefined();
      expect(result.locations).toBeDefined();
    });
  });

  // ============================================================================
  // searchEntities Cache Integration Tests
  // ============================================================================

  describe('searchEntities with cache', () => {
    it('should use cache for single entity type search', async () => {
      const cachedCharacters = [
        { id: 1, name: 'Aragorn' },
        { id: 2, name: 'Aragon' },
        { id: 3, name: 'Gandalf' }
      ];

      // Pre-populate cache with array (not the full response object)
      service._setCachedEntities('characters', cachedCharacters);

      const results = await service.searchEntities('ara', 'characters');

      // No API calls should be made
      expect(mockFetch).not.toHaveBeenCalled();

      // Should filter cached results (case-insensitive substring match)
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Aragorn');
      expect(results[1].name).toBe('Aragon');
    });

    it('should fetch from API when cache is not available', async () => {
      const mockResponse = {
        data: [
          { id: 1, name: 'Aragorn' },
          { id: 2, name: 'Arwen' }
        ]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const results = await service.searchEntities('ara', 'characters');

      // API should be called
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results).toEqual(mockResponse.data);
    });

    it('should use cache for multi-type search', async () => {
      const cachedCharacters = [{ id: 1, name: 'Aragorn' }];
      const cachedLocations = [{ id: 2, name: 'Moria' }];
      const cachedItems = [{ id: 3, name: 'Sword' }];

      // Pre-populate cache
      service._setCachedEntities('characters', cachedCharacters);
      service._setCachedEntities('locations', cachedLocations);
      service._setCachedEntities('items', cachedItems);
      service._setCachedEntities('journals', []);
      service._setCachedEntities('organisations', []);
      service._setCachedEntities('quests', []);

      const results = await service.searchEntities('a');

      // No API calls should be made
      expect(mockFetch).not.toHaveBeenCalled();

      // Should return results from all cached types
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // findExistingEntity Cache Integration Tests
  // ============================================================================

  describe('findExistingEntity with cache', () => {
    it('should use cache when available', async () => {
      const cachedCharacters = [
        { id: 1, name: 'Aragorn' },
        { id: 2, name: 'Gandalf' }
      ];

      // Pre-populate cache
      service._setCachedEntities('characters', cachedCharacters);

      const result = await service.findExistingEntity('Aragorn', 'characters');

      // No API calls should be made
      expect(mockFetch).not.toHaveBeenCalled();

      // Should find exact match
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.name).toBe('Aragorn');
    });

    it('should handle case-insensitive matching', async () => {
      const cachedCharacters = [{ id: 1, name: 'Aragorn' }];

      service._setCachedEntities('characters', cachedCharacters);

      const result = await service.findExistingEntity('aragorn', 'characters');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.name).toBe('Aragorn');
    });
  });
});
