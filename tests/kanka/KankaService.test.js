/**
 * Tests for KankaService - Entity CRUD Operations for Kanka.io
 *
 * Covers: exports, constructor, configuration (isFullyConfigured, campaignId,
 * setCampaignId), campaign endpoint building, cache management (clearCache,
 * preFetchEntities, _isCacheValid, _getCachedEntities, _setCachedEntities),
 * campaign operations (listCampaigns, getCampaign), CRUD for all entity types
 * (journals, characters, locations, items, organisations, quests), image upload,
 * searchEntities, findExistingEntity, createIfNotExists, batchCreate,
 * default type assignments, error handling, edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  KankaService,
  KankaEntityType,
  CharacterType,
  LocationType,
  ItemType,
  OrganisationType,
  QuestType
} from '../../scripts/kanka/KankaService.mjs';
import { KankaError, KankaErrorType } from '../../scripts/kanka/KankaClient.mjs';

// ── Hoisted mock variables ─────────────────────────────────────────────
const mockEntityManager = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  setCampaignId: vi.fn()
}));

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn()
    }))
  }
}));

vi.mock('../../scripts/utils/RateLimiter.mjs', () => ({
  RateLimiter: {
    fromPreset: vi.fn(() => ({
      executeWithRetry: vi.fn((fn) => fn()),
      pause: vi.fn(),
      reset: vi.fn(),
      getStats: vi.fn(() => ({})),
      remainingRequests: 30,
      isPaused: false
    }))
  }
}));

vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeUrl: vi.fn((url) => url),
    sanitizeString: vi.fn((str) => str),
    sanitizeObject: vi.fn((obj) => obj)
  }
}));

vi.mock('../../scripts/kanka/KankaEntityManager.mjs', () => ({
  KankaEntityManager: vi.fn(() => mockEntityManager)
}));

// ── Helpers ────────────────────────────────────────────────────────────

const TEST_TOKEN = 'test-kanka-token';
const TEST_CAMPAIGN_ID = '42';

function createService(token = TEST_TOKEN, campaignId = TEST_CAMPAIGN_ID, opts = {}) {
  return new KankaService(token, campaignId, opts);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('KankaService', () => {
  let service;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    // Reset mock call counts but keep the implementations
    mockEntityManager.create.mockReset();
    mockEntityManager.get.mockReset();
    mockEntityManager.update.mockReset();
    mockEntityManager.delete.mockReset();
    mockEntityManager.list.mockReset();
    mockEntityManager.setCampaignId.mockReset();
    service = createService();
  });

  // ════════════════════════════════════════════════════════════════════════
  // Exports
  // ════════════════════════════════════════════════════════════════════════

  describe('exports', () => {
    it('should export KankaService class', () => {
      expect(KankaService).toBeDefined();
      expect(typeof KankaService).toBe('function');
    });

    it('should export KankaEntityType enum', () => {
      expect(KankaEntityType).toBeDefined();
      expect(KankaEntityType.JOURNAL).toBe('journals');
      expect(KankaEntityType.CHARACTER).toBe('characters');
      expect(KankaEntityType.LOCATION).toBe('locations');
      expect(KankaEntityType.ITEM).toBe('items');
      expect(KankaEntityType.NOTE).toBe('notes');
      expect(KankaEntityType.ORGANISATION).toBe('organisations');
      expect(KankaEntityType.FAMILY).toBe('families');
      expect(KankaEntityType.EVENT).toBe('events');
      expect(KankaEntityType.QUEST).toBe('quests');
      expect(KankaEntityType.MAP).toBe('maps');
    });

    it('should export CharacterType enum', () => {
      expect(CharacterType).toBeDefined();
      expect(CharacterType.NPC).toBe('NPC');
      expect(CharacterType.PC).toBe('PC');
      expect(CharacterType.MONSTER).toBe('Monster');
      expect(CharacterType.DEITY).toBe('Deity');
      expect(CharacterType.OTHER).toBe('');
    });

    it('should export LocationType enum', () => {
      expect(LocationType).toBeDefined();
      expect(LocationType.CITY).toBe('City');
      expect(LocationType.DUNGEON).toBe('Dungeon');
      expect(LocationType.WORLD).toBe('World');
      expect(LocationType.OTHER).toBe('');
    });

    it('should export ItemType enum', () => {
      expect(ItemType).toBeDefined();
      expect(ItemType.WEAPON).toBe('Weapon');
      expect(ItemType.ARMOR).toBe('Armor');
      expect(ItemType.ARTIFACT).toBe('Artifact');
      expect(ItemType.MAGIC_ITEM).toBe('Magic Item');
      expect(ItemType.OTHER).toBe('');
    });

    it('should export OrganisationType enum', () => {
      expect(OrganisationType).toBeDefined();
      expect(OrganisationType.GUILD).toBe('Guild');
      expect(OrganisationType.MILITARY).toBe('Military');
      expect(OrganisationType.FACTION).toBe('Faction');
      expect(OrganisationType.OTHER).toBe('');
    });

    it('should export QuestType enum', () => {
      expect(QuestType).toBeDefined();
      expect(QuestType.MAIN).toBe('Main Quest');
      expect(QuestType.SIDE).toBe('Side Quest');
      expect(QuestType.PERSONAL).toBe('Personal Quest');
      expect(QuestType.OTHER).toBe('');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Constructor
  // ════════════════════════════════════════════════════════════════════════

  describe('constructor', () => {
    it('should create instance with token and campaign ID', () => {
      const svc = createService('token', '99');
      expect(svc.campaignId).toBe('99');
    });

    it('should default campaign ID to empty string when not provided', () => {
      const svc = new KankaService('token', null);
      expect(svc.campaignId).toBe('');
    });

    it('should default campaign ID to empty string when undefined', () => {
      const svc = new KankaService('token', undefined);
      expect(svc.campaignId).toBe('');
    });

    it('should create an entity manager instance', () => {
      expect(service._entityManager).toBeDefined();
      expect(service._entityManager.create).toBeDefined();
    });

    it('should initialize empty entity cache', () => {
      expect(service._entityCache).toBeInstanceOf(Map);
      expect(service._entityCache.size).toBe(0);
    });

    it('should set default cache expiry to 5 minutes', () => {
      expect(service._cacheExpiryMs).toBe(300000);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Configuration
  // ════════════════════════════════════════════════════════════════════════

  describe('isFullyConfigured', () => {
    it('should return true when token and campaign ID are set', () => {
      expect(service.isFullyConfigured).toBe(true);
    });

    it('should return false when campaign ID is empty', () => {
      const svc = new KankaService('token', '');
      expect(svc.isFullyConfigured).toBe(false);
    });

    it('should return false when token is empty', () => {
      const svc = new KankaService('', '42');
      expect(svc.isFullyConfigured).toBe(false);
    });

    it('should return false when both are empty', () => {
      const svc = new KankaService('', '');
      expect(svc.isFullyConfigured).toBe(false);
    });
  });

  describe('campaignId', () => {
    it('should return current campaign ID', () => {
      expect(service.campaignId).toBe(TEST_CAMPAIGN_ID);
    });
  });

  describe('setCampaignId()', () => {
    it('should update campaign ID', () => {
      service.setCampaignId('100');
      expect(service.campaignId).toBe('100');
    });

    it('should update entity manager campaign ID', () => {
      service.setCampaignId('200');
      expect(mockEntityManager.setCampaignId).toHaveBeenCalledWith('200');
    });

    it('should handle null campaign ID', () => {
      service.setCampaignId(null);
      expect(service.campaignId).toBe('');
    });

    it('should handle undefined campaign ID', () => {
      service.setCampaignId(undefined);
      expect(service.campaignId).toBe('');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // _buildCampaignEndpoint
  // ════════════════════════════════════════════════════════════════════════

  describe('_buildCampaignEndpoint()', () => {
    it('should build endpoint for entity type', () => {
      const endpoint = service._buildCampaignEndpoint('characters');
      expect(endpoint).toBe(`/campaigns/${TEST_CAMPAIGN_ID}/characters`);
    });

    it('should build endpoint with entity ID', () => {
      const endpoint = service._buildCampaignEndpoint('journals', 123);
      expect(endpoint).toBe(`/campaigns/${TEST_CAMPAIGN_ID}/journals/123`);
    });

    it('should throw if campaign ID is not set', () => {
      service._campaignId = '';
      expect(() => service._buildCampaignEndpoint('characters')).toThrow(KankaError);
    });

    it('should throw with appropriate error message', () => {
      service._campaignId = '';
      expect(() => service._buildCampaignEndpoint('characters')).toThrow(
        'Campaign ID not configured'
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Cache Management
  // ════════════════════════════════════════════════════════════════════════

  describe('_isCacheValid()', () => {
    it('should return false for non-existent cache key', () => {
      expect(service._isCacheValid('missing')).toBe(false);
    });

    it('should return false when cache has no timestamp', () => {
      service._entityCache.set('key', []);
      expect(service._isCacheValid('key')).toBe(false);
    });

    it('should return true for fresh cache entry', () => {
      service._entityCache.set('key', []);
      service._cacheTimestamps.set('key', Date.now());
      expect(service._isCacheValid('key')).toBe(true);
    });

    it('should return false for expired cache entry', () => {
      service._entityCache.set('key', []);
      service._cacheTimestamps.set('key', Date.now() - 400000);
      expect(service._isCacheValid('key')).toBe(false);
    });
  });

  describe('_getCachedEntities()', () => {
    it('should return null for invalid cache', () => {
      expect(service._getCachedEntities('missing')).toBeNull();
    });

    it('should return cached data for valid cache', () => {
      const data = [{ id: 1, name: 'Test' }];
      service._entityCache.set('key', data);
      service._cacheTimestamps.set('key', Date.now());
      expect(service._getCachedEntities('key')).toEqual(data);
    });

    it('should return null for expired cache', () => {
      service._entityCache.set('key', [{ id: 1 }]);
      service._cacheTimestamps.set('key', Date.now() - 400000);
      expect(service._getCachedEntities('key')).toBeNull();
    });
  });

  describe('_setCachedEntities()', () => {
    it('should store entities in cache', () => {
      const data = [{ id: 1 }];
      service._setCachedEntities('key', data);
      expect(service._entityCache.get('key')).toEqual(data);
    });

    it('should set timestamp', () => {
      service._setCachedEntities('key', []);
      expect(service._cacheTimestamps.has('key')).toBe(true);
    });
  });

  describe('_clearCache()', () => {
    it('should clear specific cache key', () => {
      service._entityCache.set('a', []);
      service._entityCache.set('b', []);
      service._cacheTimestamps.set('a', Date.now());
      service._cacheTimestamps.set('b', Date.now());

      service._clearCache('a');
      expect(service._entityCache.has('a')).toBe(false);
      expect(service._entityCache.has('b')).toBe(true);
    });

    it('should clear all cache when no key provided', () => {
      service._entityCache.set('a', []);
      service._entityCache.set('b', []);
      service._cacheTimestamps.set('a', Date.now());
      service._cacheTimestamps.set('b', Date.now());

      service._clearCache();
      expect(service._entityCache.size).toBe(0);
      expect(service._cacheTimestamps.size).toBe(0);
    });
  });

  describe('clearCache()', () => {
    it('should delegate to _clearCache with no argument', () => {
      service._entityCache.set('x', []);
      service._cacheTimestamps.set('x', Date.now());
      service.clearCache();
      expect(service._entityCache.size).toBe(0);
    });

    it('should delegate to _clearCache with entity type', () => {
      service._entityCache.set('characters', []);
      service._entityCache.set('locations', []);
      service._cacheTimestamps.set('characters', Date.now());
      service._cacheTimestamps.set('locations', Date.now());

      service.clearCache('characters');
      expect(service._entityCache.has('characters')).toBe(false);
      expect(service._entityCache.has('locations')).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // preFetchEntities
  // ════════════════════════════════════════════════════════════════════════

  describe('preFetchEntities()', () => {
    beforeEach(() => {
      const listResponse = { data: [{ id: 1, name: 'Entity1' }] };
      mockEntityManager.list.mockResolvedValue(listResponse);
    });

    it('should fetch all default entity types', async () => {
      const result = await service.preFetchEntities();
      expect(result).toBeDefined();
      expect(mockEntityManager.list).toHaveBeenCalled();
    });

    it('should fetch only specified types', async () => {
      const result = await service.preFetchEntities({ types: ['characters', 'locations'] });
      expect(result.characters).toBeDefined();
      expect(result.locations).toBeDefined();
    });

    it('should use cached data when cache is valid and force is false', async () => {
      service._entityCache.set('characters', [{ id: 2, name: 'Cached' }]);
      service._cacheTimestamps.set('characters', Date.now());

      const result = await service.preFetchEntities({ types: ['characters'] });
      expect(result.characters).toEqual([{ id: 2, name: 'Cached' }]);
      expect(mockEntityManager.list).not.toHaveBeenCalled();
    });

    it('should force refresh when force is true', async () => {
      service._entityCache.set('characters', [{ id: 2, name: 'Cached' }]);
      service._cacheTimestamps.set('characters', Date.now());

      await service.preFetchEntities({ types: ['characters'], force: true });
      expect(mockEntityManager.list).toHaveBeenCalled();
    });

    it('should warn and skip unknown entity types', async () => {
      const result = await service.preFetchEntities({ types: ['unknown_type'] });
      expect(result).toEqual({});
    });

    it('should handle empty data in responses', async () => {
      mockEntityManager.list.mockResolvedValue({ data: [] });
      const result = await service.preFetchEntities({ types: ['characters'] });
      expect(result.characters).toEqual([]);
    });

    it('should return empty result on API errors (allSettled)', async () => {
      mockEntityManager.list.mockRejectedValue(new Error('API error'));
      const result = await service.preFetchEntities({ types: ['characters'] });
      expect(result.characters).toBeUndefined();
    });

    it('should populate cache for fetched types', async () => {
      await service.preFetchEntities({ types: ['characters'] });
      expect(service._entityCache.has('characters')).toBe(true);
    });

    it('should handle null data in response', async () => {
      mockEntityManager.list.mockResolvedValue({ data: null });
      const result = await service.preFetchEntities({ types: ['items'] });
      expect(result.items).toEqual([]);
    });

    it('should fetch all six default types', async () => {
      await service.preFetchEntities();
      // 6 default types: characters, locations, items, journals, organisations, quests
      expect(mockEntityManager.list).toHaveBeenCalledTimes(6);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Campaigns
  // ════════════════════════════════════════════════════════════════════════

  describe('listCampaigns()', () => {
    it('should return list of campaigns', async () => {
      service.get = vi.fn().mockResolvedValue({
        data: [{ id: 1, name: 'Campaign 1' }]
      });

      const result = await service.listCampaigns();
      expect(result).toEqual([{ id: 1, name: 'Campaign 1' }]);
      expect(service.get).toHaveBeenCalledWith('/campaigns');
    });

    it('should return empty array when no campaigns', async () => {
      service.get = vi.fn().mockResolvedValue({});

      const result = await service.listCampaigns();
      expect(result).toEqual([]);
    });
  });

  describe('getCampaign()', () => {
    it('should fetch campaign by provided ID', async () => {
      service.get = vi.fn().mockResolvedValue({
        data: { id: 10, name: 'My Campaign' }
      });

      const result = await service.getCampaign(10);
      expect(result).toEqual({ id: 10, name: 'My Campaign' });
      expect(service.get).toHaveBeenCalledWith('/campaigns/10');
    });

    it('should use configured campaign ID when none provided', async () => {
      service.get = vi.fn().mockResolvedValue({
        data: { id: 42, name: 'Default' }
      });

      await service.getCampaign();
      expect(service.get).toHaveBeenCalledWith(`/campaigns/${TEST_CAMPAIGN_ID}`);
    });

    it('should throw when no campaign ID is available', async () => {
      const svc = new KankaService('token', '');
      await expect(svc.getCampaign()).rejects.toThrow(KankaError);
      await expect(svc.getCampaign()).rejects.toThrow('Campaign ID is required');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Journals CRUD
  // ════════════════════════════════════════════════════════════════════════

  describe('Journals', () => {
    describe('createJournal()', () => {
      it('should create journal with default type', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 1, name: 'Session 1' });

        const result = await service.createJournal({ name: 'Session 1', entry: 'Content' });
        expect(result).toEqual({ id: 1, name: 'Session 1' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('journals', {
          name: 'Session 1',
          entry: 'Content',
          type: 'Session Chronicle'
        });
      });

      it('should preserve custom type when provided', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 2 });

        await service.createJournal({ name: 'Note', type: 'Research Notes' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('journals', {
          name: 'Note',
          type: 'Research Notes'
        });
      });

      it('should apply default type when type is empty string', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 3 });

        await service.createJournal({ name: 'Test', type: '' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('journals', {
          name: 'Test',
          type: 'Session Chronicle'
        });
      });

      it('should pass through all extra fields', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 4 });

        await service.createJournal({
          name: 'Session',
          date: '2024-01-15',
          location_id: 456,
          tags: [1, 2]
        });

        const callArg = mockEntityManager.create.mock.calls[0][1];
        expect(callArg.date).toBe('2024-01-15');
        expect(callArg.location_id).toBe(456);
        expect(callArg.tags).toEqual([1, 2]);
      });
    });

    describe('getJournal()', () => {
      it('should get journal by ID', async () => {
        mockEntityManager.get.mockResolvedValue({ id: 1, name: 'Journal' });
        const result = await service.getJournal(1);
        expect(result).toEqual({ id: 1, name: 'Journal' });
        expect(mockEntityManager.get).toHaveBeenCalledWith('journals', 1);
      });
    });

    describe('updateJournal()', () => {
      it('should update journal by ID', async () => {
        mockEntityManager.update.mockResolvedValue({ id: 1, name: 'Updated' });
        const result = await service.updateJournal(1, { name: 'Updated' });
        expect(result).toEqual({ id: 1, name: 'Updated' });
        expect(mockEntityManager.update).toHaveBeenCalledWith('journals', 1, {
          name: 'Updated'
        });
      });
    });

    describe('deleteJournal()', () => {
      it('should delete journal by ID', async () => {
        mockEntityManager.delete.mockResolvedValue(undefined);
        await service.deleteJournal(1);
        expect(mockEntityManager.delete).toHaveBeenCalledWith('journals', 1);
      });
    });

    describe('listJournals()', () => {
      it('should list journals with default options', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [], meta: {} });
        await service.listJournals();
        expect(mockEntityManager.list).toHaveBeenCalledWith('journals', {});
      });

      it('should pass options through', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [], meta: {} });
        await service.listJournals({ page: 2, type: 'Session Chronicle' });
        expect(mockEntityManager.list).toHaveBeenCalledWith('journals', {
          page: 2,
          type: 'Session Chronicle'
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Characters CRUD
  // ════════════════════════════════════════════════════════════════════════

  describe('Characters', () => {
    describe('createCharacter()', () => {
      it('should create character with default NPC type', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 1, name: 'Elara' });

        await service.createCharacter({ name: 'Elara', entry: 'A wizard' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('characters', {
          name: 'Elara',
          entry: 'A wizard',
          type: 'NPC'
        });
      });

      it('should preserve custom character type', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 2 });

        await service.createCharacter({ name: 'Hero', type: 'PC' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('characters', {
          name: 'Hero',
          type: 'PC'
        });
      });

      it('should apply NPC type when type is empty', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 3 });

        await service.createCharacter({ name: 'NPC', type: '' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('characters', {
          name: 'NPC',
          type: 'NPC'
        });
      });
    });

    describe('getCharacter()', () => {
      it('should get character by ID', async () => {
        mockEntityManager.get.mockResolvedValue({ id: 1 });
        await service.getCharacter(1);
        expect(mockEntityManager.get).toHaveBeenCalledWith('characters', 1);
      });
    });

    describe('updateCharacter()', () => {
      it('should update character by ID', async () => {
        mockEntityManager.update.mockResolvedValue({ id: 1 });
        await service.updateCharacter(1, { name: 'New Name' });
        expect(mockEntityManager.update).toHaveBeenCalledWith('characters', 1, {
          name: 'New Name'
        });
      });
    });

    describe('deleteCharacter()', () => {
      it('should delete character by ID', async () => {
        mockEntityManager.delete.mockResolvedValue(undefined);
        await service.deleteCharacter(5);
        expect(mockEntityManager.delete).toHaveBeenCalledWith('characters', 5);
      });
    });

    describe('listCharacters()', () => {
      it('should list characters with default options', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listCharacters();
        expect(mockEntityManager.list).toHaveBeenCalledWith('characters', {});
      });

      it('should convert boolean is_dead to 1', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listCharacters({ is_dead: true });
        expect(mockEntityManager.list).toHaveBeenCalledWith('characters', { is_dead: 1 });
      });

      it('should convert boolean is_dead false to 0', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listCharacters({ is_dead: false });
        expect(mockEntityManager.list).toHaveBeenCalledWith('characters', { is_dead: 0 });
      });

      it('should pass other options unchanged', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listCharacters({ page: 3, type: 'NPC' });
        expect(mockEntityManager.list).toHaveBeenCalledWith('characters', {
          page: 3,
          type: 'NPC'
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Locations CRUD
  // ════════════════════════════════════════════════════════════════════════

  describe('Locations', () => {
    describe('createLocation()', () => {
      it('should create location', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 1, name: 'Tavern' });
        const result = await service.createLocation({ name: 'Tavern', type: 'Tavern' });
        expect(result).toEqual({ id: 1, name: 'Tavern' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('locations', {
          name: 'Tavern',
          type: 'Tavern'
        });
      });
    });

    describe('getLocation()', () => {
      it('should get location by ID', async () => {
        mockEntityManager.get.mockResolvedValue({ id: 1 });
        await service.getLocation(1);
        expect(mockEntityManager.get).toHaveBeenCalledWith('locations', 1);
      });
    });

    describe('updateLocation()', () => {
      it('should update location', async () => {
        mockEntityManager.update.mockResolvedValue({ id: 1 });
        await service.updateLocation(1, { name: 'Updated' });
        expect(mockEntityManager.update).toHaveBeenCalledWith('locations', 1, {
          name: 'Updated'
        });
      });
    });

    describe('deleteLocation()', () => {
      it('should delete location', async () => {
        mockEntityManager.delete.mockResolvedValue(undefined);
        await service.deleteLocation(5);
        expect(mockEntityManager.delete).toHaveBeenCalledWith('locations', 5);
      });
    });

    describe('listLocations()', () => {
      it('should list locations', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listLocations({ page: 1 });
        expect(mockEntityManager.list).toHaveBeenCalledWith('locations', { page: 1 });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Items CRUD
  // ════════════════════════════════════════════════════════════════════════

  describe('Items', () => {
    describe('createItem()', () => {
      it('should create item', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 1, name: 'Sword' });
        const result = await service.createItem({ name: 'Sword', type: 'Weapon' });
        expect(result).toEqual({ id: 1, name: 'Sword' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('items', {
          name: 'Sword',
          type: 'Weapon'
        });
      });
    });

    describe('getItem()', () => {
      it('should get item by ID', async () => {
        mockEntityManager.get.mockResolvedValue({ id: 1 });
        await service.getItem(1);
        expect(mockEntityManager.get).toHaveBeenCalledWith('items', 1);
      });
    });

    describe('updateItem()', () => {
      it('should update item', async () => {
        mockEntityManager.update.mockResolvedValue({ id: 1 });
        await service.updateItem(1, { price: '100gp' });
        expect(mockEntityManager.update).toHaveBeenCalledWith('items', 1, {
          price: '100gp'
        });
      });
    });

    describe('deleteItem()', () => {
      it('should delete item', async () => {
        mockEntityManager.delete.mockResolvedValue(undefined);
        await service.deleteItem(3);
        expect(mockEntityManager.delete).toHaveBeenCalledWith('items', 3);
      });
    });

    describe('listItems()', () => {
      it('should list items', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listItems({ character_id: 5 });
        expect(mockEntityManager.list).toHaveBeenCalledWith('items', { character_id: 5 });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Organisations CRUD
  // ════════════════════════════════════════════════════════════════════════

  describe('Organisations', () => {
    describe('createOrganisation()', () => {
      it('should create organisation with default empty type', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 1, name: 'Guild' });

        await service.createOrganisation({ name: 'Guild' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('organisations', {
          name: 'Guild',
          type: ''
        });
      });

      it('should preserve custom organisation type', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 2 });

        await service.createOrganisation({ name: 'Army', type: 'Military' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('organisations', {
          name: 'Army',
          type: 'Military'
        });
      });
    });

    describe('getOrganisation()', () => {
      it('should get organisation by ID', async () => {
        mockEntityManager.get.mockResolvedValue({ id: 1 });
        await service.getOrganisation(1);
        expect(mockEntityManager.get).toHaveBeenCalledWith('organisations', 1);
      });
    });

    describe('updateOrganisation()', () => {
      it('should update organisation', async () => {
        mockEntityManager.update.mockResolvedValue({ id: 1 });
        await service.updateOrganisation(1, { name: 'New Guild' });
        expect(mockEntityManager.update).toHaveBeenCalledWith('organisations', 1, {
          name: 'New Guild'
        });
      });
    });

    describe('deleteOrganisation()', () => {
      it('should delete organisation', async () => {
        mockEntityManager.delete.mockResolvedValue(undefined);
        await service.deleteOrganisation(4);
        expect(mockEntityManager.delete).toHaveBeenCalledWith('organisations', 4);
      });
    });

    describe('listOrganisations()', () => {
      it('should list organisations', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listOrganisations({ type: 'Guild' });
        expect(mockEntityManager.list).toHaveBeenCalledWith('organisations', {
          type: 'Guild'
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Quests CRUD
  // ════════════════════════════════════════════════════════════════════════

  describe('Quests', () => {
    describe('createQuest()', () => {
      it('should create quest with default empty type', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 1, name: 'Quest' });

        await service.createQuest({ name: 'Quest' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('quests', {
          name: 'Quest',
          type: ''
        });
      });

      it('should preserve custom quest type', async () => {
        mockEntityManager.create.mockResolvedValue({ id: 2 });

        await service.createQuest({ name: 'Main', type: 'Main Quest' });
        expect(mockEntityManager.create).toHaveBeenCalledWith('quests', {
          name: 'Main',
          type: 'Main Quest'
        });
      });
    });

    describe('getQuest()', () => {
      it('should get quest by ID', async () => {
        mockEntityManager.get.mockResolvedValue({ id: 1 });
        await service.getQuest(1);
        expect(mockEntityManager.get).toHaveBeenCalledWith('quests', 1);
      });
    });

    describe('updateQuest()', () => {
      it('should update quest', async () => {
        mockEntityManager.update.mockResolvedValue({ id: 1 });
        await service.updateQuest(1, { is_completed: true });
        expect(mockEntityManager.update).toHaveBeenCalledWith('quests', 1, {
          is_completed: true
        });
      });
    });

    describe('deleteQuest()', () => {
      it('should delete quest', async () => {
        mockEntityManager.delete.mockResolvedValue(undefined);
        await service.deleteQuest(7);
        expect(mockEntityManager.delete).toHaveBeenCalledWith('quests', 7);
      });
    });

    describe('listQuests()', () => {
      it('should list quests with default options', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listQuests();
        expect(mockEntityManager.list).toHaveBeenCalledWith('quests', {});
      });

      it('should convert boolean is_completed true to 1', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listQuests({ is_completed: true });
        expect(mockEntityManager.list).toHaveBeenCalledWith('quests', {
          is_completed: 1
        });
      });

      it('should convert boolean is_completed false to 0', async () => {
        mockEntityManager.list.mockResolvedValue({ data: [] });
        await service.listQuests({ is_completed: false });
        expect(mockEntityManager.list).toHaveBeenCalledWith('quests', {
          is_completed: 0
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Image Upload
  // ════════════════════════════════════════════════════════════════════════

  describe('uploadImage()', () => {
    it('should throw when entityType is missing', async () => {
      await expect(service.uploadImage(null, 1, 'http://img.png')).rejects.toThrow(KankaError);
      await expect(service.uploadImage(null, 1, 'http://img.png')).rejects.toThrow(
        'Entity type and ID are required'
      );
    });

    it('should throw when entityId is missing', async () => {
      await expect(service.uploadImage('characters', null, 'http://img.png')).rejects.toThrow(
        KankaError
      );
    });

    it('should download image from URL and upload', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/png' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob)
      });

      service.postFormData = vi.fn().mockResolvedValue({
        data: { id: 1, image_full: 'https://kanka.io/img.png' }
      });

      const result = await service.uploadImage('characters', 1, 'https://example.com/img.png');
      expect(result).toEqual({ id: 1, image_full: 'https://kanka.io/img.png' });
      expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/img.png');
    });

    it('should throw when image download fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      await expect(
        service.uploadImage('characters', 1, 'https://example.com/missing.png')
      ).rejects.toThrow('Failed to download image');
    });

    it('should throw when fetch rejects', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        service.uploadImage('characters', 1, 'https://example.com/img.png')
      ).rejects.toThrow('Failed to download image');
    });

    it('should upload Blob directly', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/png' });

      service.postFormData = vi.fn().mockResolvedValue({
        data: { id: 1, image_full: 'https://kanka.io/img.png' }
      });

      const result = await service.uploadImage('characters', 1, mockBlob);
      expect(result).toEqual({ id: 1, image_full: 'https://kanka.io/img.png' });
    });

    it('should throw for invalid image source type', async () => {
      await expect(service.uploadImage('characters', 1, 12345)).rejects.toThrow(
        'Image source must be a URL string or Blob'
      );
    });

    it('should use custom filename when provided', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/png' });

      service.postFormData = vi.fn().mockResolvedValue({
        data: { id: 1 }
      });

      await service.uploadImage('characters', 1, mockBlob, { filename: 'custom.jpg' });
      expect(service.postFormData).toHaveBeenCalled();
    });

    it('should use default filename portrait.png', async () => {
      const mockBlob = new Blob(['data'], { type: 'image/png' });

      service.postFormData = vi.fn().mockResolvedValue({ data: { id: 1 } });

      await service.uploadImage('locations', 5, mockBlob);
      expect(service.postFormData).toHaveBeenCalled();
    });
  });

  describe('uploadCharacterImage()', () => {
    it('should delegate to uploadImage with CHARACTER type', async () => {
      const mockBlob = new Blob(['data']);
      service.uploadImage = vi.fn().mockResolvedValue({ id: 1 });

      await service.uploadCharacterImage(1, mockBlob);
      expect(service.uploadImage).toHaveBeenCalledWith('characters', 1, mockBlob, {});
    });
  });

  describe('uploadLocationImage()', () => {
    it('should delegate to uploadImage with LOCATION type', async () => {
      service.uploadImage = vi.fn().mockResolvedValue({ id: 1 });

      await service.uploadLocationImage(2, 'http://img.png', { filename: 'map.png' });
      expect(service.uploadImage).toHaveBeenCalledWith('locations', 2, 'http://img.png', {
        filename: 'map.png'
      });
    });
  });

  describe('uploadItemImage()', () => {
    it('should delegate to uploadImage with ITEM type', async () => {
      service.uploadImage = vi.fn().mockResolvedValue({ id: 1 });

      await service.uploadItemImage(3, 'http://img.png');
      expect(service.uploadImage).toHaveBeenCalledWith('items', 3, 'http://img.png', {});
    });
  });

  describe('uploadJournalImage()', () => {
    it('should delegate to uploadImage with JOURNAL type', async () => {
      service.uploadImage = vi.fn().mockResolvedValue({ id: 1 });

      await service.uploadJournalImage(4, 'http://img.png');
      expect(service.uploadImage).toHaveBeenCalledWith('journals', 4, 'http://img.png', {});
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // searchEntities
  // ════════════════════════════════════════════════════════════════════════

  describe('searchEntities()', () => {
    it('should return empty array for empty query', async () => {
      const result = await service.searchEntities('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace query', async () => {
      const result = await service.searchEntities('   ');
      expect(result).toEqual([]);
    });

    it('should return empty array for null query', async () => {
      const result = await service.searchEntities(null);
      expect(result).toEqual([]);
    });

    it('should search specific entity type from cache when available', async () => {
      service._entityCache.set('characters', [
        { id: 1, name: 'Dragon Knight' },
        { id: 2, name: 'Elf Ranger' }
      ]);
      service._cacheTimestamps.set('characters', Date.now());

      const result = await service.searchEntities('Dragon', 'characters');
      expect(result).toEqual([{ id: 1, name: 'Dragon Knight' }]);
    });

    it('should search case-insensitively in cache', async () => {
      service._entityCache.set('characters', [{ id: 1, name: 'Dragon Knight' }]);
      service._cacheTimestamps.set('characters', Date.now());

      const result = await service.searchEntities('dragon', 'characters');
      expect(result).toEqual([{ id: 1, name: 'Dragon Knight' }]);
    });

    it('should fall back to API when cache miss for specific type', async () => {
      service.get = vi.fn().mockResolvedValue({
        data: [{ id: 1, name: 'Dragon' }]
      });

      const result = await service.searchEntities('Dragon', 'characters');
      expect(result).toEqual([{ id: 1, name: 'Dragon' }]);
      expect(service.get).toHaveBeenCalled();
    });

    it('should search all entity types when no type specified', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });

      await service.searchEntities('Test');
      // Should search 6 entity types
      expect(service.get).toHaveBeenCalledTimes(6);
    });

    it('should add _entityType to multi-type search results', async () => {
      service.get = vi
        .fn()
        .mockResolvedValueOnce({ data: [{ id: 1, name: 'Dragon' }] }) // characters
        .mockResolvedValue({ data: [] }); // everything else

      const result = await service.searchEntities('Dragon');
      expect(result[0]._entityType).toBe('characters');
    });

    it('should handle API errors gracefully in multi-type search', async () => {
      service.get = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail')) // first type fails
        .mockResolvedValue({ data: [{ id: 1, name: 'Match' }] }); // rest succeed

      const result = await service.searchEntities('Match');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should encode query parameter for API calls', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });

      await service.searchEntities('Dragon & Knight', 'characters');
      expect(service.get).toHaveBeenCalledWith(
        expect.stringContaining('name=Dragon%20%26%20Knight')
      );
    });

    it('should use cached data in multi-type search when available', async () => {
      service._entityCache.set('characters', [{ id: 1, name: 'Dragon Knight' }]);
      service._cacheTimestamps.set('characters', Date.now());

      service.get = vi.fn().mockResolvedValue({ data: [] });

      const result = await service.searchEntities('Dragon');
      // characters should come from cache, others from API
      const characterResults = result.filter((r) => r._entityType === 'characters');
      expect(characterResults).toHaveLength(1);
      // Only 5 API calls (all except characters which was cached)
      expect(service.get).toHaveBeenCalledTimes(5);
    });

    it('should return empty data array from API when null', async () => {
      service.get = vi.fn().mockResolvedValue({ data: null });

      const result = await service.searchEntities('Nothing', 'characters');
      expect(result).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // findExistingEntity
  // ════════════════════════════════════════════════════════════════════════

  describe('findExistingEntity()', () => {
    it('should return null when name is empty', async () => {
      const result = await service.findExistingEntity('', 'characters');
      expect(result).toBeNull();
    });

    it('should return null when entityType is empty', async () => {
      const result = await service.findExistingEntity('Dragon', '');
      expect(result).toBeNull();
    });

    it('should return null when name is null', async () => {
      const result = await service.findExistingEntity(null, 'characters');
      expect(result).toBeNull();
    });

    it('should return null when entityType is null', async () => {
      const result = await service.findExistingEntity('Dragon', null);
      expect(result).toBeNull();
    });

    it('should find exact case-insensitive match', async () => {
      service.get = vi.fn().mockResolvedValue({
        data: [
          { id: 1, name: 'Dragon' },
          { id: 2, name: 'Dragonborn' }
        ]
      });

      const result = await service.findExistingEntity('dragon', 'characters');
      expect(result).toEqual({ id: 1, name: 'Dragon' });
    });

    it('should return null when no exact match exists', async () => {
      service.get = vi.fn().mockResolvedValue({
        data: [{ id: 1, name: 'Dragonborn' }]
      });

      const result = await service.findExistingEntity('Dragon', 'characters');
      expect(result).toBeNull();
    });

    it('should trim whitespace when matching', async () => {
      service.get = vi.fn().mockResolvedValue({
        data: [{ id: 1, name: '  Dragon  ' }]
      });

      const result = await service.findExistingEntity('  Dragon  ', 'characters');
      expect(result).toEqual({ id: 1, name: '  Dragon  ' });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // createIfNotExists
  // ════════════════════════════════════════════════════════════════════════

  describe('createIfNotExists()', () => {
    it('should throw when name is missing', async () => {
      await expect(service.createIfNotExists('characters', {})).rejects.toThrow(
        'Entity name is required'
      );
    });

    it('should throw when entityData is null', async () => {
      await expect(service.createIfNotExists('characters', null)).rejects.toThrow(
        'Entity name is required'
      );
    });

    it('should return existing entity with _alreadyExisted flag', async () => {
      service.get = vi.fn().mockResolvedValue({
        data: [{ id: 99, name: 'Dragon' }]
      });

      const result = await service.createIfNotExists('characters', { name: 'Dragon' });
      expect(result._alreadyExisted).toBe(true);
      expect(result.id).toBe(99);
    });

    it('should create character when not existing', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockResolvedValue({ id: 100, name: 'NewChar' });

      const result = await service.createIfNotExists('characters', {
        name: 'NewChar',
        type: 'NPC'
      });
      expect(result).toEqual({ id: 100, name: 'NewChar' });
      expect(mockEntityManager.create).toHaveBeenCalled();
    });

    it('should create location when not existing', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockResolvedValue({ id: 101, name: 'Tavern' });

      const result = await service.createIfNotExists('locations', { name: 'Tavern' });
      expect(result).toEqual({ id: 101, name: 'Tavern' });
    });

    it('should create item when not existing', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockResolvedValue({ id: 102, name: 'Sword' });

      const result = await service.createIfNotExists('items', { name: 'Sword' });
      expect(result).toEqual({ id: 102, name: 'Sword' });
    });

    it('should create journal when not existing', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockResolvedValue({ id: 103, name: 'Session 1' });

      const result = await service.createIfNotExists('journals', { name: 'Session 1' });
      expect(result).toEqual({ id: 103, name: 'Session 1' });
    });

    it('should create organisation when not existing', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockResolvedValue({ id: 104, name: 'Guild' });

      const result = await service.createIfNotExists('organisations', { name: 'Guild' });
      expect(result).toEqual({ id: 104, name: 'Guild' });
    });

    it('should create quest when not existing', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockResolvedValue({ id: 105, name: 'Quest' });

      const result = await service.createIfNotExists('quests', { name: 'Quest' });
      expect(result).toEqual({ id: 105, name: 'Quest' });
    });

    it('should throw for unsupported entity type', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });

      await expect(service.createIfNotExists('unknown_type', { name: 'Test' })).rejects.toThrow(
        'Unsupported entity type'
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // batchCreate
  // ════════════════════════════════════════════════════════════════════════

  describe('batchCreate()', () => {
    it('should create multiple entities sequentially', async () => {
      mockEntityManager.create.mockResolvedValue({ id: 1 });
      // For createIfNotExists - no existing found
      service.get = vi.fn().mockResolvedValue({ data: [] });

      const entities = [{ name: 'Entity1' }, { name: 'Entity2' }, { name: 'Entity3' }];

      const results = await service.batchCreate('characters', entities);
      expect(results).toHaveLength(3);
    });

    it('should skip existing entities when skipExisting is true', async () => {
      service.get = vi
        .fn()
        .mockResolvedValueOnce({ data: [{ id: 99, name: 'Existing' }] })
        .mockResolvedValueOnce({ data: [] });

      mockEntityManager.create.mockResolvedValue({ id: 100, name: 'New' });

      const entities = [{ name: 'Existing' }, { name: 'New' }];

      const results = await service.batchCreate('characters', entities, { skipExisting: true });
      expect(results).toHaveLength(2);
      expect(results[0]._alreadyExisted).toBe(true);
    });

    it('should not check existing when skipExisting is false', async () => {
      mockEntityManager.create.mockResolvedValue({ id: 1 });

      const entities = [{ name: 'Entity1' }];
      await service.batchCreate('characters', entities, { skipExisting: false });

      // Should not call searchEntities (no get calls for search)
      expect(mockEntityManager.create).toHaveBeenCalled();
    });

    it('should call onProgress callback', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockResolvedValue({ id: 1, name: 'Entity' });

      const onProgress = vi.fn();
      const entities = [{ name: 'Entity1' }, { name: 'Entity2' }];

      await service.batchCreate('characters', entities, { onProgress });
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(1, 2, expect.any(Object));
      expect(onProgress).toHaveBeenCalledWith(2, 2, expect.any(Object));
    });

    it('should handle individual entity failures gracefully', async () => {
      service.get = vi.fn().mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [] });

      mockEntityManager.create
        .mockRejectedValueOnce(new Error('API fail'))
        .mockResolvedValueOnce({ id: 2, name: 'Success' });

      const entities = [{ name: 'Fail' }, { name: 'Success' }];
      const results = await service.batchCreate('characters', entities);

      expect(results).toHaveLength(2);
      expect(results[0]._error).toBe('API fail');
      expect(results[0].name).toBe('Fail');
      expect(results[1]).toEqual({ id: 2, name: 'Success' });
    });

    it('should call onProgress with null for failed entities', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockRejectedValue(new Error('Fail'));

      const onProgress = vi.fn();
      await service.batchCreate('characters', [{ name: 'Fail' }], { onProgress });
      expect(onProgress).toHaveBeenCalledWith(1, 1, null);
    });

    it('should handle empty batch', async () => {
      const results = await service.batchCreate('characters', []);
      expect(results).toEqual([]);
    });

    it('should default skipExisting to true', async () => {
      service.get = vi.fn().mockResolvedValue({ data: [] });
      mockEntityManager.create.mockResolvedValue({ id: 1 });

      await service.batchCreate('characters', [{ name: 'Test' }]);
      // Should have searched for existing (via get)
      expect(service.get).toHaveBeenCalled();
    });

    it('should create locations without skipExisting', async () => {
      mockEntityManager.create.mockResolvedValue({ id: 1 });

      await service.batchCreate('locations', [{ name: 'Place' }], { skipExisting: false });
      expect(mockEntityManager.create).toHaveBeenCalledWith('locations', { name: 'Place' });
    });

    it('should create items without skipExisting', async () => {
      mockEntityManager.create.mockResolvedValue({ id: 1 });

      await service.batchCreate('items', [{ name: 'Sword' }], { skipExisting: false });
      expect(mockEntityManager.create).toHaveBeenCalledWith('items', { name: 'Sword' });
    });

    it('should create journals without skipExisting', async () => {
      mockEntityManager.create.mockResolvedValue({ id: 1 });

      await service.batchCreate('journals', [{ name: 'Session' }], { skipExisting: false });
      expect(mockEntityManager.create).toHaveBeenCalledWith('journals', {
        name: 'Session',
        type: 'Session Chronicle'
      });
    });

    it('should create organisations without skipExisting', async () => {
      mockEntityManager.create.mockResolvedValue({ id: 1 });

      await service.batchCreate('organisations', [{ name: 'Guild' }], { skipExisting: false });
      expect(mockEntityManager.create).toHaveBeenCalledWith('organisations', {
        name: 'Guild',
        type: ''
      });
    });

    it('should create quests without skipExisting', async () => {
      mockEntityManager.create.mockResolvedValue({ id: 1 });

      await service.batchCreate('quests', [{ name: 'Quest' }], { skipExisting: false });
      expect(mockEntityManager.create).toHaveBeenCalledWith('quests', {
        name: 'Quest',
        type: ''
      });
    });

    it('should return error object for unsupported type without skipExisting', async () => {
      const results = await service.batchCreate('unknown', [{ name: 'Test' }], {
        skipExisting: false
      });
      expect(results[0]._error).toBeDefined();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // batchCreateRelations
  // ════════════════════════════════════════════════════════════════════════

  describe('batchCreateRelations()', () => {
    it('should return empty array for empty relations', async () => {
      const results = await service.batchCreateRelations(100, []);
      expect(results).toEqual([]);
    });

    it('should return empty array for null relations', async () => {
      const results = await service.batchCreateRelations(100, null);
      expect(results).toEqual([]);
    });

    it('should create relations sequentially via POST', async () => {
      service.post = vi
        .fn()
        .mockResolvedValueOnce({ data: { id: 1, relation: 'ally' } })
        .mockResolvedValueOnce({ data: { id: 2, relation: 'enemy' } });

      const relations = [
        { target_id: 200, relation: 'ally', attitude: 1 },
        { target_id: 300, relation: 'enemy', attitude: -2 }
      ];

      const results = await service.batchCreateRelations(100, relations);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: 1, relation: 'ally' });
      expect(results[1]).toEqual({ id: 2, relation: 'enemy' });

      // Verify endpoint includes campaign ID and source entity ID
      expect(service.post).toHaveBeenCalledTimes(2);
      expect(service.post).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/entities/100/relations`,
        { target_id: 200, relation: 'ally', attitude: 1 }
      );
      expect(service.post).toHaveBeenCalledWith(
        `/campaigns/${TEST_CAMPAIGN_ID}/entities/100/relations`,
        { target_id: 300, relation: 'enemy', attitude: -2 }
      );
    });

    it('should call onProgress callback for each relation', async () => {
      service.post = vi.fn().mockResolvedValue({ data: { id: 1 } });

      const onProgress = vi.fn();
      const relations = [
        { target_id: 200, relation: 'ally', attitude: 0 },
        { target_id: 300, relation: 'enemy', attitude: 0 }
      ];

      await service.batchCreateRelations(100, relations, { onProgress });

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(1, 2);
      expect(onProgress).toHaveBeenCalledWith(2, 2);
    });

    it('should continue on error by default', async () => {
      service.post = vi
        .fn()
        .mockRejectedValueOnce(new Error('First fails'))
        .mockResolvedValueOnce({ data: { id: 2, relation: 'friend' } });

      const relations = [
        { target_id: 200, relation: 'ally', attitude: 0 },
        { target_id: 300, relation: 'friend', attitude: 1 }
      ];

      const results = await service.batchCreateRelations(100, relations);

      expect(results).toHaveLength(2);
      expect(results[0]._error).toBe('First fails');
      expect(results[0].relation).toBe('ally');
      expect(results[0].target_id).toBe(200);
      expect(results[1]).toEqual({ id: 2, relation: 'friend' });
    });

    it('should stop on error when continueOnError is false', async () => {
      service.post = vi
        .fn()
        .mockRejectedValueOnce(new Error('Stop here'))
        .mockResolvedValueOnce({ data: { id: 2 } });

      const relations = [
        { target_id: 200, relation: 'ally', attitude: 0 },
        { target_id: 300, relation: 'friend', attitude: 1 }
      ];

      const results = await service.batchCreateRelations(100, relations, {
        continueOnError: false
      });

      expect(results).toHaveLength(1);
      expect(results[0]._error).toBe('Stop here');
      // Second relation should NOT have been attempted
      expect(service.post).toHaveBeenCalledTimes(1);
    });

    it('should default relation to "unknown" when not provided', async () => {
      service.post = vi.fn().mockResolvedValue({ data: { id: 1 } });

      await service.batchCreateRelations(100, [{ target_id: 200, attitude: 0 }]);

      expect(service.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ relation: 'unknown' })
      );
    });

    it('should default attitude to 0 when not provided', async () => {
      service.post = vi.fn().mockResolvedValue({ data: { id: 1 } });

      await service.batchCreateRelations(100, [{ target_id: 200, relation: 'ally' }]);

      expect(service.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ attitude: 0 })
      );
    });

    it('should call onProgress even for failed relations', async () => {
      service.post = vi.fn().mockRejectedValue(new Error('fail'));

      const onProgress = vi.fn();
      await service.batchCreateRelations(100, [{ target_id: 200, relation: 'ally', attitude: 0 }], {
        onProgress
      });

      expect(onProgress).toHaveBeenCalledWith(1, 1);
    });

    it('should use response.data when available, fall back to response otherwise', async () => {
      // When response has .data property
      service.post = vi.fn().mockResolvedValue({ data: { id: 1, relation: 'ally' } });

      const results1 = await service.batchCreateRelations(100, [
        { target_id: 200, relation: 'ally', attitude: 0 }
      ]);
      expect(results1[0]).toEqual({ id: 1, relation: 'ally' });

      // When response has no .data property (falls back to full response)
      service.post = vi.fn().mockResolvedValue({ id: 2, relation: 'enemy' });

      const results2 = await service.batchCreateRelations(100, [
        { target_id: 300, relation: 'enemy', attitude: 0 }
      ]);
      expect(results2[0]).toEqual({ id: 2, relation: 'enemy' });
    });
  });
});
