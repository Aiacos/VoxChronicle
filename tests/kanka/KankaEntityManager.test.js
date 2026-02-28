/**
 * Tests for KankaEntityManager - Generic CRUD Operations for Kanka Entities
 *
 * Covers: constructor validation, CRUD operations (create/get/update/delete),
 * list with filters/pagination, image upload (URL + Blob), search with cache,
 * cache management, campaign endpoint building
 */
import { KankaEntityManager } from '../../scripts/kanka/KankaEntityManager.mjs';
import { KankaError, KankaErrorType } from '../../scripts/kanka/KankaClient.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────

function createMockClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    postFormData: vi.fn()
  };
}

const TEST_CAMPAIGN_ID = '42';

// ── Tests ────────────────────────────────────────────────────────────────

describe('KankaEntityManager', () => {
  let client;
  let manager;

  beforeEach(() => {
    client = createMockClient();
    manager = new KankaEntityManager(client, TEST_CAMPAIGN_ID);
  });

  // ════════════════════════════════════════════════════════════════════════
  // Constructor
  // ════════════════════════════════════════════════════════════════════════

  describe('constructor', () => {
    it('should create instance with client and campaign ID', () => {
      const mgr = new KankaEntityManager(client, '99');
      expect(mgr.campaignId).toBe('99');
    });

    it('should throw if client is null', () => {
      expect(() => new KankaEntityManager(null, TEST_CAMPAIGN_ID)).toThrow(KankaError);
      expect(() => new KankaEntityManager(null, TEST_CAMPAIGN_ID)).toThrow(
        'KankaClient instance is required'
      );
    });

    it('should throw if client is undefined', () => {
      expect(() => new KankaEntityManager(undefined, TEST_CAMPAIGN_ID)).toThrow(KankaError);
    });

    it('should default campaign ID to empty string when null', () => {
      const mgr = new KankaEntityManager(client, null);
      expect(mgr.campaignId).toBe('');
    });

    it('should accept custom cache expiry', () => {
      const mgr = new KankaEntityManager(client, TEST_CAMPAIGN_ID, {
        cacheExpiryMs: 10000
      });
      expect(mgr._cacheExpiryMs).toBe(10000);
    });

    it('should use default cache expiry of 300000ms', () => {
      expect(manager._cacheExpiryMs).toBe(300000);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Configuration
  // ════════════════════════════════════════════════════════════════════════

  describe('campaignId', () => {
    it('should return current campaign ID', () => {
      expect(manager.campaignId).toBe(TEST_CAMPAIGN_ID);
    });
  });

  describe('setCampaignId()', () => {
    it('should update campaign ID', () => {
      manager.setCampaignId('100');
      expect(manager.campaignId).toBe('100');
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

  // ════════════════════════════════════════════════════════════════════════
  // _buildCampaignEndpoint
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildCampaignEndpoint()', () => {
    it('should build endpoint for entity type', () => {
      const endpoint = manager._buildCampaignEndpoint('characters');
      expect(endpoint).toBe(`/campaigns/${TEST_CAMPAIGN_ID}/characters`);
    });

    it('should build endpoint for entity type with ID', () => {
      const endpoint = manager._buildCampaignEndpoint('characters', 123);
      expect(endpoint).toBe(`/campaigns/${TEST_CAMPAIGN_ID}/characters/123`);
    });

    it('should throw if campaign ID is not set', () => {
      manager.setCampaignId('');
      expect(() => manager._buildCampaignEndpoint('characters')).toThrow(KankaError);
      expect(() => manager._buildCampaignEndpoint('characters')).toThrow(
        'Campaign ID not configured'
      );
    });

    it('should handle string entity ID', () => {
      const endpoint = manager._buildCampaignEndpoint('journals', '456');
      expect(endpoint).toBe(`/campaigns/${TEST_CAMPAIGN_ID}/journals/456`);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // create()
  // ════════════════════════════════════════════════════════════════════════

  describe('create()', () => {
    it('should create entity with name and entry', async () => {
      const created = { id: 1, name: 'Test Character', entry: 'A brave warrior' };
      client.post.mockResolvedValue({ data: created });

      const result = await manager.create('characters', {
        name: 'Test Character',
        entry: 'A brave warrior'
      });

      expect(result).toEqual(created);
      expect(client.post).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/characters`,
        expect.objectContaining({
          name: 'Test Character',
          entry: 'A brave warrior',
          is_private: false
        })
      );
    });

    it('should throw if name is missing', async () => {
      await expect(manager.create('characters', {})).rejects.toThrow(KankaError);
      await expect(manager.create('characters', { entry: 'No name' })).rejects.toThrow(
        'Entity name is required'
      );
    });

    it('should throw if entityData is null', async () => {
      await expect(manager.create('characters', null)).rejects.toThrow(KankaError);
    });

    it('should throw if entityData is undefined', async () => {
      await expect(manager.create('characters', undefined)).rejects.toThrow(KankaError);
    });

    it('should default entry to empty string', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', { name: 'Test' });

      expect(client.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ entry: '' })
      );
    });

    it('should default is_private to false', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', { name: 'Test' });

      expect(client.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ is_private: false })
      );
    });

    it('should pass is_private when set to true', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', { name: 'Test', is_private: true });

      expect(client.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ is_private: true })
      );
    });

    it('should include type field when provided', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', { name: 'Test', type: 'NPC' });

      expect(client.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'NPC' })
      );
    });

    it('should pass through entity-specific fields', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', {
        name: 'Elara',
        age: '142',
        title: 'Archmage',
        location_id: 456,
        sex: 'Female'
      });

      expect(client.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          name: 'Elara',
          age: '142',
          title: 'Archmage',
          location_id: 456,
          sex: 'Female'
        })
      );
    });

    it('should include non-empty arrays (tags)', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', {
        name: 'Test',
        tags: [1, 2, 3]
      });

      expect(client.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tags: [1, 2, 3] })
      );
    });

    it('should skip empty arrays', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', {
        name: 'Test',
        tags: []
      });

      const payload = client.post.mock.calls[0][1];
      expect(payload).not.toHaveProperty('tags');
    });

    it('should skip null and undefined values', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', {
        name: 'Test',
        age: null,
        title: undefined
      });

      const payload = client.post.mock.calls[0][1];
      expect(payload).not.toHaveProperty('age');
      expect(payload).not.toHaveProperty('title');
    });

    it('should include boolean false values', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('characters', {
        name: 'Test',
        is_dead: false
      });

      const payload = client.post.mock.calls[0][1];
      expect(payload.is_dead).toBe(false);
    });

    it('should include zero values', async () => {
      client.post.mockResolvedValue({ data: { id: 1 } });

      await manager.create('items', {
        name: 'Test',
        price: 0
      });

      const payload = client.post.mock.calls[0][1];
      expect(payload.price).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // get()
  // ════════════════════════════════════════════════════════════════════════

  describe('get()', () => {
    it('should fetch entity by ID', async () => {
      const entity = { id: 123, name: 'Test Character' };
      client.get.mockResolvedValue({ data: entity });

      const result = await manager.get('characters', 123);

      expect(result).toEqual(entity);
      expect(client.get).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/characters/123`
      );
    });

    it('should handle string entity ID', async () => {
      client.get.mockResolvedValue({ data: { id: 456 } });

      await manager.get('locations', '456');

      expect(client.get).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/locations/456`
      );
    });

    it('should propagate errors from client', async () => {
      client.get.mockRejectedValue(
        new KankaError('Not found', KankaErrorType.NOT_FOUND_ERROR, 404)
      );

      await expect(manager.get('characters', 999)).rejects.toThrow(KankaError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // update()
  // ════════════════════════════════════════════════════════════════════════

  describe('update()', () => {
    it('should update entity with new data', async () => {
      const updated = { id: 123, name: 'Updated Name', age: '30' };
      client.put.mockResolvedValue({ data: updated });

      const result = await manager.update('characters', 123, {
        name: 'Updated Name',
        age: '30'
      });

      expect(result).toEqual(updated);
      expect(client.put).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/characters/123`,
        { name: 'Updated Name', age: '30' }
      );
    });

    it('should support partial updates', async () => {
      client.put.mockResolvedValue({ data: { id: 123 } });

      await manager.update('characters', 123, { age: '30' });

      expect(client.put).toHaveBeenCalledWith(
        expect.any(String),
        { age: '30' }
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // delete()
  // ════════════════════════════════════════════════════════════════════════

  describe('delete()', () => {
    it('should delete entity by ID', async () => {
      client.delete.mockResolvedValue(undefined);

      await manager.delete('characters', 123);

      expect(client.delete).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/characters/123`
      );
    });

    it('should propagate errors', async () => {
      client.delete.mockRejectedValue(
        new KankaError('Not found', KankaErrorType.NOT_FOUND_ERROR, 404)
      );

      await expect(manager.delete('characters', 999)).rejects.toThrow(KankaError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // list()
  // ════════════════════════════════════════════════════════════════════════

  describe('list()', () => {
    it('should list entities without filters', async () => {
      const entities = [{ id: 1 }, { id: 2 }];
      client.get.mockResolvedValue({ data: entities, meta: { total: 2 }, links: {} });

      const result = await manager.list('characters');

      expect(result.data).toEqual(entities);
      expect(result.meta).toEqual({ total: 2 });
      expect(result.links).toEqual({});
      expect(client.get).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/characters`
      );
    });

    it('should append query parameters from options', async () => {
      client.get.mockResolvedValue({ data: [], meta: {}, links: {} });

      await manager.list('characters', { page: 2, type: 'NPC' });

      expect(client.get).toHaveBeenCalledWith(
        expect.stringContaining('page=2')
      );
      expect(client.get).toHaveBeenCalledWith(
        expect.stringContaining('type=NPC')
      );
    });

    it('should URL-encode query parameter values', async () => {
      client.get.mockResolvedValue({ data: [], meta: {}, links: {} });

      await manager.list('characters', { name: 'Test Character' });

      expect(client.get).toHaveBeenCalledWith(
        expect.stringContaining('name=Test%20Character')
      );
    });

    it('should skip null/undefined option values', async () => {
      client.get.mockResolvedValue({ data: [], meta: {}, links: {} });

      await manager.list('characters', { page: 1, type: null, name: undefined });

      const callUrl = client.get.mock.calls[0][0];
      expect(callUrl).toContain('page=1');
      expect(callUrl).not.toContain('type');
      expect(callUrl).not.toContain('name');
    });

    it('should return empty arrays and objects when response has no data', async () => {
      client.get.mockResolvedValue({});

      const result = await manager.list('items');

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({});
      expect(result.links).toEqual({});
    });

    it('should handle multiple filter options', async () => {
      client.get.mockResolvedValue({ data: [], meta: {}, links: {} });

      await manager.list('characters', {
        page: 1,
        type: 'NPC',
        location_id: 123,
        is_private: false
      });

      const callUrl = client.get.mock.calls[0][0];
      expect(callUrl).toContain('page=1');
      expect(callUrl).toContain('type=NPC');
      expect(callUrl).toContain('location_id=123');
      expect(callUrl).toContain('is_private=false');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // uploadImage()
  // ════════════════════════════════════════════════════════════════════════

  describe('uploadImage()', () => {
    it('should upload image from Blob', async () => {
      const imageBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      client.postFormData.mockResolvedValue({
        data: { id: 1, image_full: 'https://kanka.io/img/1.png' }
      });

      const result = await manager.uploadImage('characters', 123, imageBlob);

      expect(result).toEqual({ id: 1, image_full: 'https://kanka.io/img/1.png' });
      expect(client.postFormData).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/characters/123`,
        expect.any(FormData)
      );
    });

    it('should use custom filename', async () => {
      const imageBlob = new Blob(['data'], { type: 'image/jpeg' });
      client.postFormData.mockResolvedValue({ data: { id: 1 } });

      await manager.uploadImage('characters', 123, imageBlob, {
        filename: 'custom-portrait.jpg'
      });

      expect(client.postFormData).toHaveBeenCalled();
    });

    it('should default filename to portrait.png', async () => {
      const imageBlob = new Blob(['data'], { type: 'image/png' });
      client.postFormData.mockResolvedValue({ data: { id: 1 } });

      await manager.uploadImage('characters', 123, imageBlob);

      expect(client.postFormData).toHaveBeenCalled();
    });

    it('should download image from URL then upload', async () => {
      const imageBlob = new Blob(['downloaded-data'], { type: 'image/png' });
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(imageBlob)
      });
      globalThis.fetch = fetchSpy;

      client.postFormData.mockResolvedValue({ data: { id: 1 } });

      await manager.uploadImage(
        'characters',
        123,
        'https://example.com/image.png'
      );

      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/image.png');
      expect(client.postFormData).toHaveBeenCalled();
    });

    it('should throw if image download fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      await expect(
        manager.uploadImage('characters', 123, 'https://example.com/bad.png')
      ).rejects.toThrow(KankaError);
    });

    it('should throw if image download throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        manager.uploadImage('characters', 123, 'https://example.com/bad.png')
      ).rejects.toThrow(KankaError);
    });

    it('should throw if entityType is missing', async () => {
      await expect(
        manager.uploadImage('', 123, new Blob(['data']))
      ).rejects.toThrow('Entity type and ID are required');
    });

    it('should throw if entityId is missing', async () => {
      await expect(
        manager.uploadImage('characters', null, new Blob(['data']))
      ).rejects.toThrow('Entity type and ID are required');
    });

    it('should throw if image source is neither string nor Blob', async () => {
      await expect(
        manager.uploadImage('characters', 123, 12345)
      ).rejects.toThrow('Image source must be a URL string or Blob');
    });

    it('should throw if image source is an object', async () => {
      await expect(
        manager.uploadImage('characters', 123, { url: 'test' })
      ).rejects.toThrow('Image source must be a URL string or Blob');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Cache Management
  // ════════════════════════════════════════════════════════════════════════

  describe('cache management', () => {
    describe('_isCacheValid()', () => {
      it('should return false for non-existent cache key', () => {
        expect(manager._isCacheValid('nonexistent')).toBe(false);
      });

      it('should return false when no timestamp exists', () => {
        manager._searchCache.set('key', []);
        // No timestamp set
        expect(manager._isCacheValid('key')).toBe(false);
      });

      it('should return true for fresh cache entry', () => {
        manager._searchCache.set('key', [{ id: 1 }]);
        manager._cacheTimestamps.set('key', Date.now());
        expect(manager._isCacheValid('key')).toBe(true);
      });

      it('should return false for expired cache entry', () => {
        manager._searchCache.set('key', [{ id: 1 }]);
        manager._cacheTimestamps.set('key', Date.now() - 400000); // > 5 min
        expect(manager._isCacheValid('key')).toBe(false);
      });
    });

    describe('clearCache()', () => {
      it('should clear all cache entries', () => {
        manager._searchCache.set('a', []);
        manager._searchCache.set('b', []);
        manager._cacheTimestamps.set('a', Date.now());
        manager._cacheTimestamps.set('b', Date.now());

        manager.clearCache();

        expect(manager._searchCache.size).toBe(0);
        expect(manager._cacheTimestamps.size).toBe(0);
      });
    });

    describe('clearCacheFor()', () => {
      it('should clear specific cache key', () => {
        manager._searchCache.set('key1', []);
        manager._searchCache.set('key2', []);
        manager._cacheTimestamps.set('key1', Date.now());
        manager._cacheTimestamps.set('key2', Date.now());

        manager.clearCacheFor('key1');

        expect(manager._searchCache.has('key1')).toBe(false);
        expect(manager._searchCache.has('key2')).toBe(true);
      });

      it('should do nothing for non-existent key', () => {
        expect(() => manager.clearCacheFor('nonexistent')).not.toThrow();
      });
    });

    describe('getCacheStats()', () => {
      it('should return correct stats', () => {
        manager._searchCache.set('a', []);
        manager._searchCache.set('b', []);

        const stats = manager.getCacheStats();

        expect(stats.entries).toBe(2);
        expect(stats.expiryMs).toBe(300000);
      });

      it('should return zero entries when cache is empty', () => {
        const stats = manager.getCacheStats();

        expect(stats.entries).toBe(0);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // searchEntities()
  // ════════════════════════════════════════════════════════════════════════

  describe('searchEntities()', () => {
    it('should return empty array for empty query', async () => {
      const result = await manager.searchEntities('');
      expect(result).toEqual([]);
      expect(client.get).not.toHaveBeenCalled();
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await manager.searchEntities('   ');
      expect(result).toEqual([]);
    });

    it('should return empty array for null query', async () => {
      const result = await manager.searchEntities(null);
      expect(result).toEqual([]);
    });

    it('should search specific entity type', async () => {
      const entities = [{ id: 1, name: 'Dragon Slayer' }];
      client.get.mockResolvedValue({ data: entities });

      const result = await manager.searchEntities('Dragon', 'characters');

      expect(result).toEqual(entities);
      expect(client.get).toHaveBeenCalledWith(
        expect.stringContaining('/characters?name=Dragon')
      );
    });

    it('should search all common entity types when no type specified', async () => {
      client.get.mockResolvedValue({ data: [] });

      await manager.searchEntities('Dragon');

      // Should search 6 entity types
      expect(client.get).toHaveBeenCalledTimes(6);
    });

    it('should add entity_type to multi-type search results', async () => {
      client.get
        .mockResolvedValueOnce({ data: [{ id: 1, name: 'Dragon Hunter' }] }) // characters
        .mockResolvedValueOnce({ data: [] }) // locations
        .mockResolvedValueOnce({ data: [{ id: 2, name: 'Dragon Scale' }] }) // items
        .mockResolvedValueOnce({ data: [] }) // journals
        .mockResolvedValueOnce({ data: [] }) // organisations
        .mockResolvedValueOnce({ data: [] }); // quests

      const results = await manager.searchEntities('Dragon');

      expect(results).toHaveLength(2);
      expect(results[0].entity_type).toBe('characters');
      expect(results[1].entity_type).toBe('items');
    });

    it('should use cached results when available', async () => {
      const cachedResults = [{ id: 1, name: 'Dragon' }];
      manager._searchCache.set('Dragon|characters', cachedResults);
      manager._cacheTimestamps.set('Dragon|characters', Date.now());

      const result = await manager.searchEntities('Dragon', 'characters');

      expect(result).toEqual(cachedResults);
      expect(client.get).not.toHaveBeenCalled();
    });

    it('should fetch from API when cache is expired', async () => {
      manager._searchCache.set('Dragon|characters', []);
      manager._cacheTimestamps.set('Dragon|characters', Date.now() - 400000);

      client.get.mockResolvedValue({ data: [{ id: 1, name: 'Dragon' }] });

      const result = await manager.searchEntities('Dragon', 'characters');

      expect(result).toHaveLength(1);
      expect(client.get).toHaveBeenCalled();
    });

    it('should cache new search results', async () => {
      client.get.mockResolvedValue({ data: [{ id: 1, name: 'Dragon' }] });

      await manager.searchEntities('Dragon', 'characters');

      expect(manager._searchCache.has('Dragon|characters')).toBe(true);
      expect(manager._cacheTimestamps.has('Dragon|characters')).toBe(true);
    });

    it('should cache multi-type search results', async () => {
      client.get.mockResolvedValue({ data: [] });

      await manager.searchEntities('Dragon');

      expect(manager._searchCache.has('Dragon|all')).toBe(true);
    });

    it('should continue searching other types if one fails', async () => {
      client.get
        .mockRejectedValueOnce(new Error('API Error')) // characters fails
        .mockResolvedValueOnce({ data: [{ id: 1, name: 'Dragon Cave' }] }) // locations
        .mockResolvedValue({ data: [] }); // rest

      const results = await manager.searchEntities('Dragon');

      // Should still have results from locations despite characters failing
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('Dragon Cave');
    });

    it('should URL-encode query', async () => {
      client.get.mockResolvedValue({ data: [] });

      await manager.searchEntities('The Dragon', 'characters');

      expect(client.get).toHaveBeenCalledWith(
        expect.stringContaining('name=The%20Dragon')
      );
    });

    it('should throw last error when all entity types fail in multi-type search', async () => {
      const finalError = new Error('Final API Error');
      // Make all 6 entity type searches fail
      client.get
        .mockRejectedValueOnce(new Error('characters failed'))
        .mockRejectedValueOnce(new Error('locations failed'))
        .mockRejectedValueOnce(new Error('items failed'))
        .mockRejectedValueOnce(new Error('journals failed'))
        .mockRejectedValueOnce(new Error('organisations failed'))
        .mockRejectedValueOnce(finalError); // quests - last error

      await expect(manager.searchEntities('Dragon')).rejects.toThrow('Final API Error');

      // Should have attempted all 6 entity types
      expect(client.get).toHaveBeenCalledTimes(6);
    });
  });
});
