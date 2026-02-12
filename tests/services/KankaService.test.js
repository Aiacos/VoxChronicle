/**
 * KankaService Unit Tests
 *
 * Tests for the KankaService class with API mocking.
 * Covers entity CRUD operations, image uploads, rate limiting,
 * and error handling.
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

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  KankaService,
  KankaEntityType,
  CharacterType,
  LocationType,
  ItemType,
  OrganisationType as _OrganisationType,
  QuestType as _QuestType
} from '../../scripts/kanka/KankaService.mjs';
import { KankaError, KankaErrorType } from '../../scripts/kanka/KankaClient.mjs';

/**
 * Create a mock API response for Kanka entities
 */
function createMockKankaResponse(data, meta = {}) {
  return {
    data,
    meta: {
      current_page: 1,
      last_page: 1,
      total: Array.isArray(data) ? data.length : 1,
      ...meta
    },
    links: {}
  };
}

/**
 * Create a mock journal entity
 */
function createMockJournal(overrides = {}) {
  return {
    id: 123,
    name: 'Session 1 Chronicle',
    entry: '<p>The party gathered at the tavern...</p>',
    type: 'Session Chronicle',
    date: '2024-01-15',
    is_private: false,
    entity_id: 456,
    ...overrides
  };
}

/**
 * Create a mock character entity
 */
function createMockCharacter(overrides = {}) {
  return {
    id: 789,
    name: 'Grognard the Brave',
    entry: '<p>A fierce warrior from the north...</p>',
    type: 'NPC',
    title: 'Warrior',
    is_dead: false,
    is_private: false,
    entity_id: 101,
    ...overrides
  };
}

/**
 * Create a mock location entity
 */
function createMockLocation(overrides = {}) {
  return {
    id: 111,
    name: 'The Rusty Dragon Inn',
    entry: '<p>A popular tavern in Sandpoint...</p>',
    type: 'Tavern',
    is_private: false,
    entity_id: 222,
    ...overrides
  };
}

/**
 * Create a mock item entity
 */
function createMockItem(overrides = {}) {
  return {
    id: 333,
    name: 'Sword of Flames',
    entry: '<p>A legendary weapon...</p>',
    type: 'Weapon',
    is_private: false,
    entity_id: 444,
    ...overrides
  };
}

/**
 * Create a mock organisation entity
 */
function createMockOrganisation(overrides = {}) {
  return {
    id: 555,
    name: 'The Shadow Guild',
    entry: '<p>A secretive thieves guild...</p>',
    type: 'Guild',
    is_private: false,
    entity_id: 666,
    ...overrides
  };
}

/**
 * Create a mock quest entity
 */
function createMockQuest(overrides = {}) {
  return {
    id: 777,
    name: 'The Lost Artifact',
    entry: '<p>Find the ancient artifact...</p>',
    type: 'Main Quest',
    is_completed: false,
    is_private: false,
    entity_id: 888,
    ...overrides
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
    service = new KankaService('test-api-token-12345', 'campaign-123');
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
      expect(service.isConfigured).toBe(true);
      expect(service.isFullyConfigured).toBe(true);
      expect(service.campaignId).toBe('campaign-123');
    });

    it('should report not fully configured without campaign ID', () => {
      const noConfigService = new KankaService('test-token', '');
      expect(noConfigService.isConfigured).toBe(true);
      expect(noConfigService.isFullyConfigured).toBe(false);
    });

    it('should report not configured without API token', () => {
      const noTokenService = new KankaService('', 'campaign-123');
      expect(noTokenService.isConfigured).toBe(false);
    });

    it('should accept configuration options', () => {
      const customService = new KankaService('test-token', 'campaign-456', {
        isPremium: true,
        timeout: 60000
      });
      expect(customService.isPremium).toBe(true);
    });
  });

  describe('setCampaignId', () => {
    it('should update campaign ID', () => {
      service.setCampaignId('new-campaign-789');
      expect(service.campaignId).toBe('new-campaign-789');
    });

    it('should handle empty campaign ID', () => {
      service.setCampaignId('');
      expect(service.campaignId).toBe('');
      expect(service.isFullyConfigured).toBe(false);
    });
  });

  // ============================================================================
  // Campaign Operations Tests
  // ============================================================================

  describe('listCampaigns', () => {
    it('should fetch campaigns list', async () => {
      const mockCampaigns = [
        { id: 1, name: 'Campaign One' },
        { id: 2, name: 'Campaign Two' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCampaigns)),
        headers: new Headers()
      });

      const result = await service.listCampaigns();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockCampaigns);
    });
  });

  describe('getCampaign', () => {
    it('should fetch campaign details', async () => {
      const mockCampaign = { id: 123, name: 'Test Campaign' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCampaign)),
        headers: new Headers()
      });

      const result = await service.getCampaign('123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockCampaign);
    });

    it('should throw error without campaign ID', async () => {
      const serviceWithoutCampaign = new KankaService('test-token', '');

      await expect(serviceWithoutCampaign.getCampaign()).rejects.toThrow(KankaError);
    });
  });

  // ============================================================================
  // Journal CRUD Tests
  // ============================================================================

  describe('createJournal', () => {
    it('should create a journal with required fields', async () => {
      const mockJournal = createMockJournal();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockJournal)),
        headers: new Headers()
      });

      const result = await service.createJournal({
        name: 'Session 1 Chronicle',
        entry: '<p>The party gathered at the tavern...</p>'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/campaigns/campaign-123/journals');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.name).toBe('Session 1 Chronicle');
      expect(body.type).toBe('Session Chronicle'); // Default type

      expect(result.id).toBe(123);
      expect(result.name).toBe('Session 1 Chronicle');
    });

    it('should include optional fields when provided', async () => {
      const mockJournal = createMockJournal({ date: '2024-01-15' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockJournal)),
        headers: new Headers()
      });

      await service.createJournal({
        name: 'Session 1',
        entry: 'Content',
        date: '2024-01-15',
        location_id: 456,
        is_private: true,
        tags: [1, 2, 3]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.date).toBe('2024-01-15');
      expect(body.location_id).toBe(456);
      expect(body.is_private).toBe(true);
      expect(body.tags).toEqual([1, 2, 3]);
    });

    it('should throw error without journal name', async () => {
      await expect(service.createJournal({ entry: 'Content' })).rejects.toThrow(KankaError);
      await expect(service.createJournal({})).rejects.toThrow(KankaError);
      await expect(service.createJournal(null)).rejects.toThrow(KankaError);
    });
  });

  describe('getJournal', () => {
    it('should fetch journal by ID', async () => {
      const mockJournal = createMockJournal();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockJournal)),
        headers: new Headers()
      });

      const result = await service.getJournal(123);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/campaigns/campaign-123/journals/123');
      expect(result.id).toBe(123);
    });
  });

  describe('updateJournal', () => {
    it('should update journal', async () => {
      const mockJournal = createMockJournal({ name: 'Updated Title' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockJournal)),
        headers: new Headers()
      });

      const result = await service.updateJournal(123, { name: 'Updated Title' });

      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
      expect(result.name).toBe('Updated Title');
    });
  });

  describe('deleteJournal', () => {
    it('should delete journal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers()
      });

      await service.deleteJournal(123);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('listJournals', () => {
    it('should list journals with pagination', async () => {
      const mockJournals = [createMockJournal(), createMockJournal({ id: 456, name: 'Session 2' })];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockJournals)),
        headers: new Headers()
      });

      const result = await service.listJournals({ page: 2, type: 'Session Chronicle' });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('page=2');
      expect(url).toContain('type=Session%20Chronicle');
      expect(result.data).toHaveLength(2);
    });
  });

  // ============================================================================
  // Character CRUD Tests
  // ============================================================================

  describe('createCharacter', () => {
    it('should create a character with required fields', async () => {
      const mockCharacter = createMockCharacter();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCharacter)),
        headers: new Headers()
      });

      const result = await service.createCharacter({
        name: 'Grognard the Brave',
        entry: 'A fierce warrior'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.name).toBe('Grognard the Brave');
      expect(body.type).toBe('NPC'); // Default type

      expect(result.id).toBe(789);
    });

    it('should include character-specific optional fields', async () => {
      const mockCharacter = createMockCharacter({ title: 'Lord' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCharacter)),
        headers: new Headers()
      });

      await service.createCharacter({
        name: 'Lord Grognard',
        type: CharacterType.PC,
        title: 'Lord',
        age: '45',
        sex: 'Male',
        pronouns: 'he/him',
        is_dead: true,
        location_id: 111
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe('PC');
      expect(body.title).toBe('Lord');
      expect(body.age).toBe('45');
      expect(body.is_dead).toBe(true);
    });

    it('should throw error without character name', async () => {
      await expect(service.createCharacter({ entry: 'Description' })).rejects.toThrow(KankaError);
    });
  });

  describe('listCharacters', () => {
    it('should list characters with filters', async () => {
      const mockCharacters = [createMockCharacter()];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCharacters)),
        headers: new Headers()
      });

      const result = await service.listCharacters({ type: 'NPC', is_dead: false });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('type=NPC');
      expect(url).toContain('is_dead=0');
      expect(result.data).toHaveLength(1);
    });
  });

  // ============================================================================
  // Location CRUD Tests
  // ============================================================================

  describe('createLocation', () => {
    it('should create a location with required fields', async () => {
      const mockLocation = createMockLocation();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockLocation)),
        headers: new Headers()
      });

      const result = await service.createLocation({
        name: 'The Rusty Dragon Inn',
        type: LocationType.TAVERN
      });

      expect(result.id).toBe(111);
      expect(result.type).toBe('Tavern');
    });

    it('should include parent location when provided', async () => {
      const mockLocation = createMockLocation();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockLocation)),
        headers: new Headers()
      });

      await service.createLocation({
        name: 'Market District',
        parent_location_id: 999
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.parent_location_id).toBe(999);
    });
  });

  // ============================================================================
  // Organisation CRUD Tests
  // ============================================================================

  describe('createOrganisation', () => {
    it('should create an organisation with required fields', async () => {
      const mockOrganisation = createMockOrganisation();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockOrganisation)),
        headers: new Headers()
      });

      const result = await service.createOrganisation({
        name: 'The Shadow Guild',
        entry: 'A secretive thieves guild'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.name).toBe('The Shadow Guild');
      expect(body.type).toBe(''); // Default type (OTHER)

      expect(result.id).toBe(555);
    });

    it('should include organisation-specific optional fields', async () => {
      const mockOrganisation = createMockOrganisation({ type: 'Military' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockOrganisation)),
        headers: new Headers()
      });

      await service.createOrganisation({
        name: 'The Iron Legion',
        type: 'Military',
        location_id: 111,
        organisation_id: 222,
        is_private: true
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe('Military');
      expect(body.location_id).toBe(111);
      expect(body.organisation_id).toBe(222);
      expect(body.is_private).toBe(true);
    });

    it('should throw error without organisation name', async () => {
      await expect(service.createOrganisation({ entry: 'Description' })).rejects.toThrow(
        KankaError
      );
    });
  });

  describe('listOrganisations', () => {
    it('should list organisations with filters', async () => {
      const mockOrganisations = [createMockOrganisation()];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockOrganisations)),
        headers: new Headers()
      });

      const result = await service.listOrganisations({ type: 'Guild', organisation_id: 999 });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('type=Guild');
      expect(url).toContain('organisation_id=999');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getOrganisation', () => {
    it('should fetch a single organisation by ID', async () => {
      const mockOrganisation = createMockOrganisation();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockOrganisation)),
        headers: new Headers()
      });

      const result = await service.getOrganisation(555);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(555);
      expect(result.name).toBe('The Shadow Guild');
    });
  });

  describe('updateOrganisation', () => {
    it('should update an organisation', async () => {
      const updatedOrganisation = createMockOrganisation({ name: 'The Shadow Guild - Updated' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(updatedOrganisation)),
        headers: new Headers()
      });

      const result = await service.updateOrganisation(555, {
        name: 'The Shadow Guild - Updated'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/organisations/555');
      expect(options.method).toBe('PUT');
      expect(result.name).toBe('The Shadow Guild - Updated');
    });
  });

  describe('deleteOrganisation', () => {
    it('should delete an organisation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers()
      });

      await service.deleteOrganisation(555);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/organisations/555');
      expect(options.method).toBe('DELETE');
    });
  });

  // ============================================================================
  // Quest CRUD Tests
  // ============================================================================

  describe('createQuest', () => {
    it('should create a quest with required fields', async () => {
      const mockQuest = createMockQuest();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockQuest)),
        headers: new Headers()
      });

      const result = await service.createQuest({
        name: 'The Lost Artifact',
        entry: 'Find the ancient artifact'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.name).toBe('The Lost Artifact');
      expect(body.type).toBe(''); // Default type (OTHER)

      expect(result.id).toBe(777);
    });

    it('should include quest-specific optional fields', async () => {
      const mockQuest = createMockQuest({ type: 'Side Quest', is_completed: true });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockQuest)),
        headers: new Headers()
      });

      await service.createQuest({
        name: 'Bounty Hunt',
        type: 'Side Quest',
        character_id: 789,
        location_id: 111,
        quest_id: 999,
        is_completed: true,
        is_private: true
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe('Side Quest');
      expect(body.character_id).toBe(789);
      expect(body.location_id).toBe(111);
      expect(body.quest_id).toBe(999);
      expect(body.is_completed).toBe(true);
      expect(body.is_private).toBe(true);
    });

    it('should throw error without quest name', async () => {
      await expect(service.createQuest({ entry: 'Description' })).rejects.toThrow(KankaError);
    });
  });

  describe('listQuests', () => {
    it('should list quests with filters', async () => {
      const mockQuests = [createMockQuest()];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockQuests)),
        headers: new Headers()
      });

      const result = await service.listQuests({
        type: 'Main Quest',
        is_completed: false,
        quest_id: 999
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('type=Main%20Quest');
      expect(url).toContain('is_completed=0');
      expect(url).toContain('quest_id=999');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getQuest', () => {
    it('should fetch a single quest by ID', async () => {
      const mockQuest = createMockQuest();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockQuest)),
        headers: new Headers()
      });

      const result = await service.getQuest(777);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(777);
      expect(result.name).toBe('The Lost Artifact');
    });
  });

  describe('updateQuest', () => {
    it('should update a quest', async () => {
      const updatedQuest = createMockQuest({
        name: 'The Lost Artifact - Updated',
        is_completed: true
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(updatedQuest)),
        headers: new Headers()
      });

      const result = await service.updateQuest(777, {
        name: 'The Lost Artifact - Updated',
        is_completed: true
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/quests/777');
      expect(options.method).toBe('PUT');
      expect(result.name).toBe('The Lost Artifact - Updated');
      expect(result.is_completed).toBe(true);
    });
  });

  describe('deleteQuest', () => {
    it('should delete a quest', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers()
      });

      await service.deleteQuest(777);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/quests/777');
      expect(options.method).toBe('DELETE');
    });
  });

  // ============================================================================
  // Item CRUD Tests
  // ============================================================================

  describe('createItem', () => {
    it('should create an item with required fields', async () => {
      const mockItem = createMockItem();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockItem)),
        headers: new Headers()
      });

      const result = await service.createItem({
        name: 'Sword of Flames',
        type: ItemType.WEAPON
      });

      expect(result.id).toBe(333);
    });

    it('should include item-specific optional fields', async () => {
      const mockItem = createMockItem();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockItem)),
        headers: new Headers()
      });

      await service.createItem({
        name: 'Magic Ring',
        type: ItemType.MAGIC_ITEM,
        price: '5000 gp',
        size: 'Small',
        character_id: 789
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.price).toBe('5000 gp');
      expect(body.size).toBe('Small');
      expect(body.character_id).toBe(789);
    });
  });

  // ============================================================================
  // Image Upload Tests
  // ============================================================================

  describe('uploadImage', () => {
    it('should upload image from URL', async () => {
      const mockCharacter = createMockCharacter();
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });

      // First fetch is for downloading the image from URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockImageBlob)
      });

      // Second fetch is for uploading to Kanka
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCharacter)),
        headers: new Headers()
      });

      await service.uploadImage(KankaEntityType.CHARACTER, 789, 'https://example.com/portrait.png');

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Check the upload request uses FormData
      const uploadCall = mockFetch.mock.calls[1];
      expect(uploadCall[1].body).toBeInstanceOf(FormData);
    });

    it('should upload image from Blob directly', async () => {
      const mockCharacter = createMockCharacter();
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCharacter)),
        headers: new Headers()
      });

      await service.uploadImage(KankaEntityType.CHARACTER, 789, mockImageBlob, {
        filename: 'custom-portrait.png'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid image source', async () => {
      await expect(service.uploadImage(KankaEntityType.CHARACTER, 789, 12345)).rejects.toThrow(
        KankaError
      );
    });

    it('should throw error without entity type or ID', async () => {
      await expect(service.uploadImage(null, 789, 'https://example.com/image.png')).rejects.toThrow(
        KankaError
      );

      await expect(
        service.uploadImage(KankaEntityType.CHARACTER, null, 'https://example.com/image.png')
      ).rejects.toThrow(KankaError);
    });
  });

  describe('uploadCharacterImage', () => {
    it('should upload character portrait', async () => {
      const mockCharacter = createMockCharacter();
      const mockImageBlob = new Blob(['fake-image-data'], { type: 'image/png' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCharacter)),
        headers: new Headers()
      });

      await service.uploadCharacterImage(789, mockImageBlob);

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/characters/789');
    });
  });

  // ============================================================================
  // Search and Utility Tests
  // ============================================================================

  describe('searchEntities', () => {
    it('should search within specific entity type', async () => {
      const mockResults = [createMockCharacter({ name: 'Grognard' })];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockResults)),
        headers: new Headers()
      });

      const result = await service.searchEntities('Grognard', KankaEntityType.CHARACTER);

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('name=Grognard');
      expect(url).toContain('/characters');
      expect(result).toHaveLength(1);
    });

    it('should return empty array for empty query', async () => {
      const result = await service.searchEntities('', KankaEntityType.CHARACTER);
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should search across multiple entity types when type not specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse([])),
        headers: new Headers()
      });

      await service.searchEntities('test');

      // Should search characters, locations, items, journals, organisations, quests
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });
  });

  describe('findExistingEntity', () => {
    it('should find exact match case-insensitively', async () => {
      const mockCharacters = [
        createMockCharacter({ name: 'GROGNARD' }),
        createMockCharacter({ id: 999, name: 'Grognard Junior' })
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCharacters)),
        headers: new Headers()
      });

      const result = await service.findExistingEntity('grognard', KankaEntityType.CHARACTER);

      expect(result.name).toBe('GROGNARD');
    });

    it('should return null when no exact match', async () => {
      const mockCharacters = [createMockCharacter({ name: 'Grognard Junior' })];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(mockCharacters)),
        headers: new Headers()
      });

      const result = await service.findExistingEntity('Grognard', KankaEntityType.CHARACTER);

      expect(result).toBeNull();
    });
  });

  describe('createIfNotExists', () => {
    it('should return existing entity if found', async () => {
      const existingCharacter = createMockCharacter({ name: 'Grognard' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse([existingCharacter])),
        headers: new Headers()
      });

      const result = await service.createIfNotExists(KankaEntityType.CHARACTER, {
        name: 'Grognard',
        entry: 'New description'
      });

      // Should only make one call (search), not create
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result._alreadyExisted).toBe(true);
    });

    it('should create entity if not found', async () => {
      // First call: search returns empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse([])),
        headers: new Headers()
      });

      // Second call: create returns new entity
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse(createMockCharacter())),
        headers: new Headers()
      });

      const result = await service.createIfNotExists(KankaEntityType.CHARACTER, {
        name: 'New Character',
        entry: 'Description'
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result._alreadyExisted).toBeUndefined();
    });
  });

  describe('batchCreate', () => {
    it('should create multiple entities', async () => {
      const characters = [
        { name: 'Character 1' },
        { name: 'Character 2' },
        { name: 'Character 3' }
      ];

      // Mock search calls (empty results) and create calls
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse([])),
        headers: new Headers()
      });

      const progressCallback = vi.fn();

      await service.batchCreate(KankaEntityType.CHARACTER, characters, {
        skipExisting: true,
        onProgress: progressCallback
      });

      // Each character: 1 search + 1 create = 2 calls per character
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(progressCallback).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================================================
  // Rate Limiting Tests
  // ============================================================================

  describe('rate limiting', () => {
    it('should use rate limiter for all requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse([])),
        headers: new Headers()
      });

      await service.listJournals();
      await service.listCharacters();

      // executeWithRetry should be called for each request
      expect(mockExecuteWithRetry).toHaveBeenCalled();
    });

    it('should pause rate limiter on 429 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve(JSON.stringify({ message: 'Rate limit exceeded' })),
        headers: new Headers({
          'retry-after': '60',
          'x-ratelimit-remaining': '0'
        })
      });

      // The request should throw, rate limiter pause is called internally
      await expect(service.listJournals()).rejects.toThrow(KankaError);

      expect(mockPause).toHaveBeenCalled();
    });

    it('should log warning when rate limit is low', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockKankaResponse([])),
        headers: new Headers({
          'x-ratelimit-remaining': '3',
          'x-ratelimit-limit': '30'
        })
      });

      await service.listJournals();

      // Request should complete successfully
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should get rate limiter statistics', () => {
      const stats = service.getRateLimiterStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('rateLimitHits');
    });

    it('should reset rate limiter', () => {
      service.resetRateLimiter();
      expect(mockReset).toHaveBeenCalled();
    });

    it('should configure premium rate limits', () => {
      const premiumService = new KankaService('test-token', 'campaign-123', {
        isPremium: true
      });
      expect(premiumService.isPremium).toBe(true);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw authentication error for 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify({ message: 'Invalid token' })),
        headers: new Headers()
      });

      try {
        await service.listJournals();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(KankaError);
        expect(error.type).toBe(KankaErrorType.AUTHENTICATION_ERROR);
      }
    });

    it('should throw not found error for 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(JSON.stringify({ message: 'Resource not found' })),
        headers: new Headers()
      });

      await expect(service.getJournal(99999)).rejects.toThrow(KankaError);
    });

    it('should throw validation error for 422 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () =>
          Promise.resolve(
            JSON.stringify({
              message: 'Validation failed',
              errors: { name: ['Name is required'] }
            })
          ),
        headers: new Headers()
      });

      await expect(service.createJournal({ name: 'Test' })).rejects.toThrow(KankaError);
    });

    it('should throw error when campaign ID not set', async () => {
      const noCampaignService = new KankaService('test-token', '');

      await expect(noCampaignService.createJournal({ name: 'Test' })).rejects.toThrow(KankaError);
    });
  });

  // ============================================================================
  // Exported Constants Tests
  // ============================================================================

  describe('exported constants', () => {
    it('should export KankaEntityType enum', () => {
      expect(KankaEntityType.JOURNAL).toBe('journals');
      expect(KankaEntityType.CHARACTER).toBe('characters');
      expect(KankaEntityType.LOCATION).toBe('locations');
      expect(KankaEntityType.ITEM).toBe('items');
    });

    it('should export CharacterType enum', () => {
      expect(CharacterType.NPC).toBe('NPC');
      expect(CharacterType.PC).toBe('PC');
    });

    it('should export LocationType enum', () => {
      expect(LocationType.CITY).toBe('City');
      expect(LocationType.TAVERN).toBe('Tavern');
      expect(LocationType.DUNGEON).toBe('Dungeon');
    });

    it('should export ItemType enum', () => {
      expect(ItemType.WEAPON).toBe('Weapon');
      expect(ItemType.ARMOR).toBe('Armor');
      expect(ItemType.MAGIC_ITEM).toBe('Magic Item');
    });
  });
});
