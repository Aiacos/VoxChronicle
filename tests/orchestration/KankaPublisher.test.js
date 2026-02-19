/**
 * KankaPublisher Unit Tests
 *
 * Tests for the KankaPublisher class with service mocking.
 * Covers chronicle-first publishing, character sub-journals,
 * journal-validated entity creation, image uploading, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing KankaPublisher
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

// Import after mocks are set up
import { KankaPublisher } from '../../scripts/orchestration/KankaPublisher.mjs';

/**
 * Create mock session data for testing.
 * Includes journalText for entity validation.
 */
function createMockSessionData(options = {}) {
  return {
    title: options.title ?? 'Test Session',
    date: options.date ?? '2024-01-01',
    transcript:
      options.transcript === undefined
        ? {
            segments: [
              { speaker: 'SPEAKER_00', text: 'Hello world', start: 0, end: 2.5 },
              { speaker: 'SPEAKER_01', text: 'Test message', start: 2.5, end: 5.0 }
            ]
          }
        : options.transcript,
    entities:
      options.entities === undefined
        ? {
            characters: [{ name: 'Gandalf', description: 'A wise wizard', isNPC: true }],
            locations: [{ name: 'Rivendell', description: 'An elven sanctuary', type: 'City' }],
            items: [{ name: 'Staff of Power', description: 'A magical staff', type: 'Weapon' }]
          }
        : options.entities,
    moments: options.moments ?? [
      {
        id: 'moment-1',
        title: 'Epic Battle',
        description: 'Battle description',
        imagePrompt: 'epic battle scene'
      }
    ],
    images:
      options.images === undefined
        ? [
            {
              success: true,
              url: 'https://example.com/gandalf.png',
              entityType: 'character',
              meta: { characterName: 'Gandalf' }
            }
          ]
        : options.images,
    // Foundry journal text for entity validation (contains entity names)
    journalText:
      options.journalText === undefined
        ? 'The party arrives at Rivendell, the elven sanctuary. Gandalf wields the Staff of Power.'
        : options.journalText,
    npcProfiles: options.npcProfiles === undefined ? [] : options.npcProfiles
  };
}

/**
 * Create mock Kanka service
 */
function createMockKankaService() {
  return {
    createIfNotExists: vi
      .fn()
      .mockResolvedValue({ id: 10, name: 'Test Entity', _alreadyExisted: false }),
    createJournal: vi.fn().mockImplementation((data) => {
      // Return different IDs for chronicle vs sub-journals
      const id = data.journal_id ? 20 : 1;
      return Promise.resolve({ id, name: data.name });
    }),
    uploadJournalImage: vi.fn().mockResolvedValue({ success: true }),
    uploadCharacterImage: vi.fn().mockResolvedValue({ success: true }),
    preFetchEntities: vi.fn().mockResolvedValue({
      journals: { data: [] },
      locations: { data: [] },
      items: { data: [] }
    })
  };
}

/**
 * Create mock narrative exporter
 */
function createMockNarrativeExporter() {
  return {
    export: vi.fn().mockReturnValue({
      name: 'Test Chronicle',
      entry: '<p>Chronicle content</p>',
      type: 'Session Chronicle',
      date: '2024-01-01'
    })
  };
}

describe('KankaPublisher', () => {
  let publisher;
  let mockKankaService;
  let mockNarrativeExporter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKankaService = createMockKankaService();
    mockNarrativeExporter = createMockNarrativeExporter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with all services', () => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);

      expect(publisher).toBeInstanceOf(KankaPublisher);
      expect(publisher._kankaService).toBe(mockKankaService);
      expect(publisher._narrativeExporter).toBe(mockNarrativeExporter);
      expect(publisher._chronicleFormat).toBe('full');
    });

    it('should accept null narrativeExporter', () => {
      publisher = new KankaPublisher(mockKankaService, null);

      expect(publisher).toBeInstanceOf(KankaPublisher);
      expect(publisher._kankaService).toBe(mockKankaService);
      expect(publisher._narrativeExporter).toBeNull();
    });

    it('should accept custom options', () => {
      const onProgress = vi.fn();
      const options = {
        onProgress,
        chronicleFormat: 'summary'
      };

      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, options);

      expect(publisher._onProgress).toBe(onProgress);
      expect(publisher._chronicleFormat).toBe('summary');
    });

    it('should use default options when none provided', () => {
      publisher = new KankaPublisher(mockKankaService);

      expect(publisher._onProgress).toBeNull();
      expect(publisher._chronicleFormat).toBe('full');
    });
  });

  describe('publishSession', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
    });

    it('should publish session with all options enabled', async () => {
      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData, {
        createEntities: true,
        uploadImages: true,
        createChronicle: true
      });

      expect(result).toBeDefined();
      expect(result.journal).toBeDefined();
      expect(result.journal.id).toBe(1);
      expect(result.characters).toHaveLength(1);
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should create chronicle FIRST, then entities', async () => {
      const callOrder = [];
      mockKankaService.createJournal.mockImplementation((data) => {
        callOrder.push(data.journal_id ? 'sub-journal' : 'chronicle');
        const id = data.journal_id ? 20 : 1;
        return Promise.resolve({ id, name: data.name });
      });
      mockKankaService.createIfNotExists.mockImplementation((type, data) => {
        callOrder.push(`entity:${type}`);
        return Promise.resolve({ id: 10, name: data.name, _alreadyExisted: false });
      });

      const sessionData = createMockSessionData();
      await publisher.publishSession(sessionData);

      // Chronicle must be first
      expect(callOrder[0]).toBe('chronicle');
      // Sub-journals and entities follow
      expect(callOrder).toContain('sub-journal');
    });

    it('should throw error when no session data provided', async () => {
      await expect(publisher.publishSession(null)).rejects.toThrow(
        'No session data provided to publish.'
      );
    });

    it('should throw error when Kanka service not configured', async () => {
      publisher = new KankaPublisher(null);
      const sessionData = createMockSessionData();

      await expect(publisher.publishSession(sessionData)).rejects.toThrow(
        'Kanka service not configured.'
      );
    });

    it('should skip entity creation when createEntities is false', async () => {
      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData, {
        createEntities: false,
        uploadImages: true,
        createChronicle: true
      });

      expect(result.characters).toHaveLength(0);
      expect(result.locations).toHaveLength(0);
      expect(result.items).toHaveLength(0);
      expect(result.journal).toBeDefined();

      // Only chronicle journal call, no sub-journal calls
      expect(mockKankaService.createJournal).toHaveBeenCalledTimes(1);
      expect(mockKankaService.createIfNotExists).not.toHaveBeenCalled();
    });

    it('should skip chronicle creation when createChronicle is false', async () => {
      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData, {
        createEntities: true,
        uploadImages: true,
        createChronicle: false
      });

      // No chronicle, so no sub-journals (no parent ID)
      expect(result.journal).toBeNull();
      expect(result.characters).toHaveLength(0);
      // Locations/items still created (don't need parent journal)
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);
    });

    it('should skip image upload when uploadImages is false', async () => {
      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData, {
        createEntities: true,
        uploadImages: false,
        createChronicle: true
      });

      expect(result.characters).toHaveLength(1);
      expect(result.images).toHaveLength(0);
      expect(mockKankaService.uploadJournalImage).not.toHaveBeenCalled();
    });

    it('should use default options when none provided', async () => {
      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData);

      // Default is all true
      expect(result.characters).toHaveLength(1);
      expect(result.journal).toBeDefined();
      expect(mockKankaService.createJournal).toHaveBeenCalled();
    });

    it('should handle missing entities gracefully', async () => {
      const sessionData = createMockSessionData({ entities: null });

      const result = await publisher.publishSession(sessionData, {
        createEntities: true,
        createChronicle: true
      });

      expect(result.characters).toHaveLength(0);
      expect(result.locations).toHaveLength(0);
      expect(result.items).toHaveLength(0);
      expect(result.journal).toBeDefined();
    });

    it('should call progress callback during publishing', async () => {
      const onProgress = vi.fn();
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, { onProgress });

      const sessionData = createMockSessionData();
      await publisher.publishSession(sessionData);

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(expect.any(Number), expect.any(String));
    });

    it('should propagate errors from chronicle creation', async () => {
      const error = new Error('Journal creation failed');
      mockKankaService.createJournal.mockRejectedValue(error);

      const sessionData = createMockSessionData();

      await expect(publisher.publishSession(sessionData)).rejects.toThrow(
        'Journal creation failed'
      );
    });
  });

  describe('character sub-journals', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
    });

    it('should create characters as sub-journals with journal_id', async () => {
      const sessionData = createMockSessionData();

      await publisher.publishSession(sessionData);

      // Find the sub-journal call (has journal_id)
      const subJournalCalls = mockKankaService.createJournal.mock.calls.filter(
        (call) => call[0].journal_id
      );

      expect(subJournalCalls).toHaveLength(1);
      expect(subJournalCalls[0][0]).toEqual(
        expect.objectContaining({
          name: 'Gandalf',
          type: 'NPC',
          journal_id: 1, // Parent chronicle ID
          date: '2024-01-01'
        })
      );
    });

    it('should use journal NPC profile description for characters', async () => {
      const sessionData = createMockSessionData({
        npcProfiles: [
          { name: 'Gandalf', description: 'A powerful Maia in wizard form' }
        ]
      });

      await publisher.publishSession(sessionData);

      const subJournalCalls = mockKankaService.createJournal.mock.calls.filter(
        (call) => call[0].journal_id
      );

      expect(subJournalCalls[0][0].entry).toBe('A powerful Maia in wizard form');
    });

    it('should fall back to AI description when no journal profile found', async () => {
      const sessionData = createMockSessionData({
        npcProfiles: [], // No profiles
        journalText: null // No journal text either
      });

      await publisher.publishSession(sessionData);

      const subJournalCalls = mockKankaService.createJournal.mock.calls.filter(
        (call) => call[0].journal_id
      );

      // Falls back to AI description
      expect(subJournalCalls[0][0].entry).toBe('A wise wizard');
    });

    it('should set PC type for player characters', async () => {
      const sessionData = createMockSessionData({
        entities: {
          characters: [{ name: 'Aragorn', description: 'A ranger', isNPC: false }],
          locations: [],
          items: []
        }
      });

      await publisher.publishSession(sessionData);

      const subJournalCalls = mockKankaService.createJournal.mock.calls.filter(
        (call) => call[0].journal_id
      );

      expect(subJournalCalls[0][0].type).toBe('PC');
    });

    it('should upload portrait to journal (not character entity)', async () => {
      const sessionData = createMockSessionData();

      await publisher.publishSession(sessionData);

      expect(mockKankaService.uploadJournalImage).toHaveBeenCalledWith(
        20, // sub-journal ID
        'https://example.com/gandalf.png'
      );
      expect(mockKankaService.uploadCharacterImage).not.toHaveBeenCalled();
    });

    it('should not create sub-journals when chronicle is skipped', async () => {
      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData, {
        createChronicle: false
      });

      // No parent journal = no sub-journals
      expect(result.characters).toHaveLength(0);
      // But createJournal should not have been called at all
      expect(mockKankaService.createJournal).not.toHaveBeenCalled();
    });

    it('should handle character creation errors gracefully', async () => {
      // First call succeeds (chronicle), second fails (sub-journal)
      mockKankaService.createJournal
        .mockResolvedValueOnce({ id: 1, name: 'Chronicle' })
        .mockRejectedValueOnce(new Error('Sub-journal failed'));

      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        entity: 'Gandalf',
        type: 'character',
        error: 'Sub-journal failed'
      });
    });

    it('should handle image upload errors gracefully', async () => {
      mockKankaService.uploadJournalImage.mockRejectedValue(new Error('Upload failed'));

      const sessionData = createMockSessionData();
      const result = await publisher.publishSession(sessionData);

      // Character still created, just no image
      expect(result.characters).toHaveLength(1);
      expect(result.images).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('journal-validated locations', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
    });

    it('should create location when name is in journal text', async () => {
      const sessionData = createMockSessionData({
        journalText: 'The elven city of Rivendell lies in the valley.'
      });

      const result = await publisher.publishSession(sessionData);

      expect(result.locations).toHaveLength(1);
      expect(mockKankaService.createIfNotExists).toHaveBeenCalledWith('locations', {
        name: 'Rivendell',
        entry: expect.any(String),
        type: 'City'
      });
    });

    it('should skip location when name is NOT in journal text', async () => {
      const sessionData = createMockSessionData({
        journalText: 'The party travels through the Misty Mountains.'
      });

      const result = await publisher.publishSession(sessionData);

      expect(result.locations).toHaveLength(0);
    });

    it('should use journal description for location when available', async () => {
      const sessionData = createMockSessionData({
        journalText: 'Rivendell is the last homely house east of the Sea. It was founded by Elrond.',
        entities: {
          characters: [],
          locations: [{ name: 'Rivendell', description: 'AI description', type: 'City' }],
          items: []
        }
      });

      const result = await publisher.publishSession(sessionData);

      // Should use journal description, not AI description
      const locationCall = mockKankaService.createIfNotExists.mock.calls.find(
        (call) => call[0] === 'locations'
      );
      expect(locationCall[1].entry).toContain('Rivendell is the last homely house');
    });

    it('should allow locations when no journalText is available (graceful fallback)', async () => {
      const sessionData = createMockSessionData({
        journalText: null // No journal context
      });

      const result = await publisher.publishSession(sessionData);

      // Should still create location (graceful fallback)
      expect(result.locations).toHaveLength(1);
    });

    it('should perform case-insensitive name matching', async () => {
      const sessionData = createMockSessionData({
        journalText: 'The ancient city of RIVENDELL towers above the valley.',
        entities: {
          characters: [],
          locations: [{ name: 'Rivendell', description: 'A city', type: 'City' }],
          items: []
        }
      });

      const result = await publisher.publishSession(sessionData);

      expect(result.locations).toHaveLength(1);
    });
  });

  describe('journal-validated items', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
    });

    it('should create item when name is in journal text', async () => {
      const sessionData = createMockSessionData({
        journalText: 'Gandalf carries the Staff of Power into battle.'
      });

      const result = await publisher.publishSession(sessionData);

      expect(result.items).toHaveLength(1);
    });

    it('should skip item when name is NOT in journal text', async () => {
      const sessionData = createMockSessionData({
        journalText: 'The party finds a mysterious amulet.'
      });

      const result = await publisher.publishSession(sessionData);

      expect(result.items).toHaveLength(0);
    });

    it('should use journal description for item when available', async () => {
      const sessionData = createMockSessionData({
        journalText: 'The Staff of Power was forged by ancient elves. It channels raw magical energy.',
        entities: {
          characters: [],
          locations: [],
          items: [{ name: 'Staff of Power', description: 'AI generated', type: 'Weapon' }]
        }
      });

      const result = await publisher.publishSession(sessionData);

      const itemCall = mockKankaService.createIfNotExists.mock.calls.find(
        (call) => call[0] === 'items'
      );
      expect(itemCall[1].entry).toContain('Staff of Power was forged by ancient elves');
    });

    it('should allow items when no journalText is available', async () => {
      const sessionData = createMockSessionData({
        journalText: null
      });

      const result = await publisher.publishSession(sessionData);

      expect(result.items).toHaveLength(1);
    });
  });

  describe('chronicle creation', () => {
    it('should create chronicle using NarrativeExporter', async () => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
      const sessionData = createMockSessionData({ entities: null });

      const result = await publisher.publishSession(sessionData);

      expect(mockNarrativeExporter.export).toHaveBeenCalledWith(
        {
          title: 'Test Session',
          date: '2024-01-01',
          segments: sessionData.transcript.segments,
          entities: null,
          moments: sessionData.moments
        },
        {
          format: 'full',
          includeEntities: true,
          includeMoments: true,
          includeTimestamps: false
        }
      );

      expect(result.journal).toBeDefined();
    });

    it('should create basic chronicle without NarrativeExporter', async () => {
      publisher = new KankaPublisher(mockKankaService, null);
      const sessionData = createMockSessionData({ entities: null });

      const result = await publisher.publishSession(sessionData);

      expect(mockKankaService.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Session',
          type: 'Session Chronicle',
          date: '2024-01-01',
          entry: expect.stringContaining('Test Session')
        })
      );

      expect(result.journal).toBeDefined();
    });

    it('should use custom chronicle format', async () => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, {
        chronicleFormat: 'summary'
      });

      const sessionData = createMockSessionData({ entities: null });
      await publisher.publishSession(sessionData);

      expect(mockNarrativeExporter.export).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          format: 'summary'
        })
      );
    });

    it('should handle chronicle creation errors', async () => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
      const error = new Error('Journal creation failed');
      mockKankaService.createJournal.mockRejectedValue(error);

      const sessionData = createMockSessionData();

      await expect(publisher.publishSession(sessionData)).rejects.toThrow(
        'Journal creation failed'
      );
    });

    it('should handle missing transcript segments', async () => {
      publisher = new KankaPublisher(mockKankaService, null);
      const sessionData = createMockSessionData({ transcript: null, entities: null });

      const result = await publisher.publishSession(sessionData);

      expect(mockKankaService.createJournal).toHaveBeenCalled();
      expect(result.journal).toBeDefined();
    });

    it('should truncate long transcripts in basic format', async () => {
      publisher = new KankaPublisher(mockKankaService, null);

      const segments = Array(60)
        .fill(null)
        .map((_, i) => ({
          speaker: `SPEAKER_${i % 2}`,
          text: `Segment ${i}`,
          start: i * 2,
          end: (i + 1) * 2
        }));

      const sessionData = createMockSessionData({
        transcript: { segments },
        entities: null
      });

      const result = await publisher.publishSession(sessionData);

      const callArgs = mockKankaService.createJournal.mock.calls[0][0];
      expect(callArgs.entry).toContain('and 10 more segments');
    });
  });

  describe('progress reporting', () => {
    it('should report progress when callback is provided', async () => {
      const onProgress = vi.fn();
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, { onProgress });

      const sessionData = createMockSessionData();
      await publisher.publishSession(sessionData);

      expect(onProgress).toHaveBeenCalled();

      const progressCalls = onProgress.mock.calls.map((call) => ({
        progress: call[0],
        message: call[1]
      }));

      expect(progressCalls).toContainEqual({
        progress: 0,
        message: 'Preparing Kanka export...'
      });

      expect(progressCalls).toContainEqual({
        progress: 100,
        message: 'Publishing complete'
      });
    });

    it('should not throw when no progress callback provided', async () => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);

      const sessionData = createMockSessionData();

      await expect(publisher.publishSession(sessionData)).resolves.toBeDefined();
    });

    it('should report chronicle creation progress', async () => {
      const onProgress = vi.fn();
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, { onProgress });

      const sessionData = createMockSessionData();
      await publisher.publishSession(sessionData);

      const progressCalls = onProgress.mock.calls.map((call) => ({
        progress: call[0],
        message: call[1]
      }));

      expect(progressCalls).toContainEqual({
        progress: 10,
        message: 'Creating chronicle...'
      });
    });

    it('should report entity creation progress', async () => {
      const onProgress = vi.fn();
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, { onProgress });

      const sessionData = createMockSessionData();
      await publisher.publishSession(sessionData);

      const progressCalls = onProgress.mock.calls.map((call) => ({
        progress: call[0],
        message: call[1]
      }));

      expect(progressCalls).toContainEqual({
        progress: 30,
        message: 'Creating character journals...'
      });

      expect(progressCalls).toContainEqual({
        progress: 50,
        message: 'Creating locations...'
      });

      expect(progressCalls).toContainEqual({
        progress: 70,
        message: 'Creating items...'
      });
    });
  });

  describe('_findImageForEntity', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
    });

    it('should find matching image for entity', () => {
      const sessionData = createMockSessionData();

      const image = publisher._findImageForEntity(sessionData, 'character', 'Gandalf');

      expect(image).toEqual({
        success: true,
        url: 'https://example.com/gandalf.png',
        entityType: 'character',
        meta: { characterName: 'Gandalf' }
      });
    });

    it('should return null when no images available', () => {
      const sessionData = createMockSessionData({ images: [] });

      const image = publisher._findImageForEntity(sessionData, 'character', 'Gandalf');

      expect(image).toBeNull();
    });

    it('should return null when entity name does not match', () => {
      const sessionData = createMockSessionData();

      const image = publisher._findImageForEntity(sessionData, 'character', 'Frodo');

      expect(image).toBeNull();
    });

    it('should return null when entity type does not match', () => {
      const sessionData = createMockSessionData();

      const image = publisher._findImageForEntity(sessionData, 'location', 'Gandalf');

      expect(image).toBeNull();
    });

    it('should skip failed images', () => {
      const sessionData = createMockSessionData({
        images: [
          {
            success: false,
            url: null,
            entityType: 'character',
            meta: { characterName: 'Gandalf' }
          }
        ]
      });

      const image = publisher._findImageForEntity(sessionData, 'character', 'Gandalf');

      expect(image).toBeNull();
    });
  });

  describe('_formatBasicChronicle', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, null);
    });

    it('should format basic chronicle with all components', () => {
      const sessionData = createMockSessionData();

      const chronicle = publisher._formatBasicChronicle(sessionData);

      expect(chronicle).toContain('<h2>Test Session</h2>');
      expect(chronicle).toContain('<p><em>Date: 2024-01-01</em></p>');
      expect(chronicle).toContain('This session introduced 3 new entities');
      expect(chronicle).toContain('<h3>Transcript</h3>');
      expect(chronicle).toContain('<strong>SPEAKER_00:</strong> Hello world');
      expect(chronicle).toContain('<em>Generated by VoxChronicle</em>');
    });

    it('should handle missing entities', () => {
      const sessionData = createMockSessionData({ entities: null });

      const chronicle = publisher._formatBasicChronicle(sessionData);

      expect(chronicle).not.toContain('This session introduced');
      expect(chronicle).toContain('<h2>Test Session</h2>');
    });

    it('should handle missing transcript', () => {
      const sessionData = createMockSessionData({ transcript: null });

      const chronicle = publisher._formatBasicChronicle(sessionData);

      expect(chronicle).not.toContain('<h3>Transcript</h3>');
      expect(chronicle).toContain('<h2>Test Session</h2>');
    });

    it('should truncate long transcripts', () => {
      const segments = Array(60)
        .fill(null)
        .map((_, i) => ({
          speaker: `SPEAKER_${i % 2}`,
          text: `Segment ${i}`,
          start: i * 2,
          end: (i + 1) * 2
        }));

      const sessionData = createMockSessionData({
        transcript: { segments }
      });

      const chronicle = publisher._formatBasicChronicle(sessionData);

      expect(chronicle).toContain('and 10 more segments');
    });
  });

  describe('_isEntityInJournal', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, null);
    });

    it('should return true when entity name is in journal text', () => {
      const sessionData = { journalText: 'The city of Rivendell is beautiful.' };
      expect(publisher._isEntityInJournal(sessionData, 'Rivendell')).toBe(true);
    });

    it('should return false when entity name is NOT in journal text', () => {
      const sessionData = { journalText: 'The party explored the dungeon.' };
      expect(publisher._isEntityInJournal(sessionData, 'Rivendell')).toBe(false);
    });

    it('should be case-insensitive', () => {
      const sessionData = { journalText: 'RIVENDELL is an elven city.' };
      expect(publisher._isEntityInJournal(sessionData, 'Rivendell')).toBe(true);
    });

    it('should return true when no journal text available (graceful fallback)', () => {
      const sessionData = { journalText: null };
      expect(publisher._isEntityInJournal(sessionData, 'Rivendell')).toBe(true);
    });

    it('should return true when journalText is undefined', () => {
      const sessionData = {};
      expect(publisher._isEntityInJournal(sessionData, 'Rivendell')).toBe(true);
    });
  });

  describe('_findJournalDescription', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, null);
    });

    it('should use NPC profile description for characters', () => {
      const sessionData = {
        npcProfiles: [{ name: 'Gandalf', description: 'Profile description' }],
        journalText: 'Gandalf is a wizard.'
      };

      const desc = publisher._findJournalDescription(sessionData, 'Gandalf', 'character');
      expect(desc).toBe('Profile description');
    });

    it('should extract context from journal text when no profile exists', () => {
      const sessionData = {
        npcProfiles: [],
        journalText: 'Gandalf is a powerful wizard. He carries a staff. Gandalf wears grey robes.'
      };

      const desc = publisher._findJournalDescription(sessionData, 'Gandalf', 'character');
      expect(desc).toContain('Gandalf');
    });

    it('should return null when entity is not in journal text', () => {
      const sessionData = {
        npcProfiles: [],
        journalText: 'The party explores the dungeon.'
      };

      const desc = publisher._findJournalDescription(sessionData, 'Gandalf', 'character');
      expect(desc).toBeNull();
    });

    it('should return null when no journalText is available', () => {
      const sessionData = { npcProfiles: [] };

      const desc = publisher._findJournalDescription(sessionData, 'Gandalf', 'character');
      expect(desc).toBeNull();
    });

    it('should extract description for locations', () => {
      const sessionData = {
        journalText: 'Rivendell lies in a hidden valley. Rivendell was founded by Elrond.'
      };

      const desc = publisher._findJournalDescription(sessionData, 'Rivendell', 'location');
      expect(desc).toContain('Rivendell');
    });

    it('should limit extracted context to 3 sentences', () => {
      const sessionData = {
        journalText:
          'Gandalf arrives. Gandalf speaks. Gandalf casts. Gandalf fights. Gandalf rests.'
      };

      const desc = publisher._findJournalDescription(sessionData, 'Gandalf', 'character');
      // Should contain at most 3 mentions
      const sentences = desc.split('. ').filter((s) => s.includes('Gandalf'));
      expect(sentences.length).toBeLessThanOrEqual(3);
    });
  });

  describe('_extractContextFromText', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, null);
    });

    it('should extract sentences containing entity name', () => {
      const text = 'The sky is blue. Rivendell is beautiful. The end.';
      const result = publisher._extractContextFromText(text, 'Rivendell');
      expect(result).toContain('Rivendell is beautiful');
    });

    it('should return null for empty text', () => {
      expect(publisher._extractContextFromText('', 'Rivendell')).toBeNull();
      expect(publisher._extractContextFromText(null, 'Rivendell')).toBeNull();
    });

    it('should return null when entity not found', () => {
      const text = 'The party explores the dungeon.';
      expect(publisher._extractContextFromText(text, 'Rivendell')).toBeNull();
    });

    it('should handle empty entity name', () => {
      expect(publisher._extractContextFromText('Some text.', '')).toBeNull();
      expect(publisher._extractContextFromText('Some text.', null)).toBeNull();
    });
  });
});
