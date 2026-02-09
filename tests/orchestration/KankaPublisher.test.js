/**
 * KankaPublisher Unit Tests
 *
 * Tests for the KankaPublisher class with service mocking.
 * Covers entity creation, image uploading, chronicle creation, and error handling.
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

// Import after mocks are set up
import { KankaPublisher } from '../../scripts/orchestration/KankaPublisher.mjs';

/**
 * Create mock session data for testing
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
        : options.images
  };
}

/**
 * Create mock Kanka service
 */
function createMockKankaService() {
  return {
    createIfNotExists: vi
      .fn()
      .mockResolvedValue({ id: 1, name: 'Test Entity', _alreadyExisted: false }),
    createJournal: vi.fn().mockResolvedValue({ id: 1, name: 'Test Journal' }),
    uploadCharacterImage: vi.fn().mockResolvedValue({ success: true })
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
      expect(result.characters).toHaveLength(1);
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);
      expect(result.journal).toBeDefined();
      expect(result.errors).toHaveLength(0);

      // Verify service calls
      expect(mockKankaService.createIfNotExists).toHaveBeenCalledTimes(3); // 1 char + 1 loc + 1 item
      expect(mockKankaService.uploadCharacterImage).toHaveBeenCalledTimes(1);
      expect(mockKankaService.createJournal).toHaveBeenCalledTimes(1);
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

      expect(mockKankaService.createIfNotExists).not.toHaveBeenCalled();
      expect(mockKankaService.createJournal).toHaveBeenCalledTimes(1);
    });

    it('should skip chronicle creation when createChronicle is false', async () => {
      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData, {
        createEntities: true,
        uploadImages: true,
        createChronicle: false
      });

      expect(result.characters).toHaveLength(1);
      expect(result.journal).toBeNull();

      expect(mockKankaService.createIfNotExists).toHaveBeenCalled();
      expect(mockKankaService.createJournal).not.toHaveBeenCalled();
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

      expect(mockKankaService.uploadCharacterImage).not.toHaveBeenCalled();
    });

    it('should use default options when none provided', async () => {
      const sessionData = createMockSessionData();

      const result = await publisher.publishSession(sessionData);

      // Default is all true
      expect(result.characters).toHaveLength(1);
      expect(result.journal).toBeDefined();
      expect(mockKankaService.createIfNotExists).toHaveBeenCalled();
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
      // Progress callback signature is (progress, message)
      expect(onProgress).toHaveBeenCalledWith(expect.any(Number), expect.any(String));
    });

    it('should propagate errors from createChronicle', async () => {
      const error = new Error('Journal creation failed');
      mockKankaService.createJournal.mockRejectedValue(error);

      const sessionData = createMockSessionData();

      await expect(publisher.publishSession(sessionData)).rejects.toThrow(
        'Journal creation failed'
      );
    });
  });

  describe('createEntities', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
    });

    it('should create characters with correct data', async () => {
      const sessionData = createMockSessionData();
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.characters).toHaveLength(1);
      expect(mockKankaService.createIfNotExists).toHaveBeenCalledWith('characters', {
        name: 'Gandalf',
        entry: 'A wise wizard',
        type: 'NPC'
      });
    });

    it('should create locations with correct data', async () => {
      const sessionData = createMockSessionData();
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.locations).toHaveLength(1);
      expect(mockKankaService.createIfNotExists).toHaveBeenCalledWith('locations', {
        name: 'Rivendell',
        entry: 'An elven sanctuary',
        type: 'City'
      });
    });

    it('should create items with correct data', async () => {
      const sessionData = createMockSessionData();
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.items).toHaveLength(1);
      expect(mockKankaService.createIfNotExists).toHaveBeenCalledWith('items', {
        name: 'Staff of Power',
        entry: 'A magical staff',
        type: 'Weapon'
      });
    });

    it('should upload character images when available', async () => {
      const sessionData = createMockSessionData();
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(mockKankaService.uploadCharacterImage).toHaveBeenCalledWith(
        1,
        'https://example.com/gandalf.png'
      );
      expect(results.images).toHaveLength(1);
      expect(results.images[0]).toEqual({
        entityId: 1,
        entityType: 'character'
      });
    });

    it('should skip image upload when uploadImages is false', async () => {
      const sessionData = createMockSessionData();
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, false);

      expect(mockKankaService.uploadCharacterImage).not.toHaveBeenCalled();
      expect(results.images).toHaveLength(0);
    });

    it('should skip already existing entities', async () => {
      mockKankaService.createIfNotExists.mockResolvedValue({
        id: 1,
        name: 'Gandalf',
        _alreadyExisted: true
      });

      const sessionData = createMockSessionData();
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.characters).toHaveLength(0); // Should not add already existing
      expect(mockKankaService.uploadCharacterImage).not.toHaveBeenCalled();
    });

    it('should handle entity creation errors gracefully', async () => {
      mockKankaService.createIfNotExists
        .mockRejectedValueOnce(new Error('Character creation failed'))
        .mockResolvedValue({ id: 2, name: 'Location', _alreadyExisted: false });

      const sessionData = createMockSessionData();
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.errors).toHaveLength(1);
      expect(results.errors[0]).toEqual({
        entity: 'Gandalf',
        type: 'character',
        error: 'Character creation failed'
      });

      // Should continue with other entities
      expect(results.locations).toHaveLength(1);
      expect(results.items).toHaveLength(1);
    });

    it('should handle image upload errors gracefully', async () => {
      mockKankaService.uploadCharacterImage.mockRejectedValue(new Error('Image upload failed'));

      const sessionData = createMockSessionData();
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      // Should not throw, just log warning
      expect(results.characters).toHaveLength(1);
      expect(results.images).toHaveLength(0);
      expect(results.errors).toHaveLength(0); // Image errors don't add to results.errors
    });

    it('should skip entities when none provided', async () => {
      const sessionData = createMockSessionData({ entities: null });
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.characters).toHaveLength(0);
      expect(results.locations).toHaveLength(0);
      expect(results.items).toHaveLength(0);
      expect(mockKankaService.createIfNotExists).not.toHaveBeenCalled();
    });

    it('should handle empty entity arrays', async () => {
      const sessionData = createMockSessionData({
        entities: {
          characters: [],
          locations: [],
          items: []
        }
      });
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.characters).toHaveLength(0);
      expect(mockKankaService.createIfNotExists).not.toHaveBeenCalled();
    });

    it('should handle missing image for character', async () => {
      const sessionData = createMockSessionData({ images: [] });
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.characters).toHaveLength(1);
      expect(mockKankaService.uploadCharacterImage).not.toHaveBeenCalled();
    });

    it('should handle failed image results', async () => {
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
      const results = {
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createEntities(sessionData, results, true);

      expect(results.characters).toHaveLength(1);
      expect(mockKankaService.uploadCharacterImage).not.toHaveBeenCalled();
    });
  });

  describe('createChronicle', () => {
    beforeEach(() => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter);
    });

    it('should create chronicle using NarrativeExporter', async () => {
      const sessionData = createMockSessionData();
      const results = {
        journal: null,
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createChronicle(sessionData, results);

      expect(mockNarrativeExporter.export).toHaveBeenCalledWith(
        {
          title: 'Test Session',
          date: '2024-01-01',
          segments: sessionData.transcript.segments,
          entities: sessionData.entities,
          moments: sessionData.moments
        },
        {
          format: 'full',
          includeEntities: true,
          includeMoments: true,
          includeTimestamps: false
        }
      );

      expect(mockKankaService.createJournal).toHaveBeenCalledWith({
        name: 'Test Chronicle',
        entry: '<p>Chronicle content</p>',
        type: 'Session Chronicle',
        date: '2024-01-01'
      });

      expect(results.journal).toEqual({ id: 1, name: 'Test Journal' });
    });

    it('should create basic chronicle without NarrativeExporter', async () => {
      publisher = new KankaPublisher(mockKankaService, null);

      const sessionData = createMockSessionData();
      const results = {
        journal: null,
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createChronicle(sessionData, results);

      expect(mockNarrativeExporter.export).not.toHaveBeenCalled();
      expect(mockKankaService.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Session',
          type: 'Session Chronicle',
          date: '2024-01-01',
          entry: expect.stringContaining('Test Session')
        })
      );

      expect(results.journal).toEqual({ id: 1, name: 'Test Journal' });
    });

    it('should use custom chronicle format', async () => {
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, {
        chronicleFormat: 'summary'
      });

      const sessionData = createMockSessionData();
      const results = {
        journal: null,
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createChronicle(sessionData, results);

      expect(mockNarrativeExporter.export).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          format: 'summary'
        })
      );
    });

    it('should handle chronicle creation errors', async () => {
      const error = new Error('Journal creation failed');
      mockKankaService.createJournal.mockRejectedValue(error);

      const sessionData = createMockSessionData();
      const results = {
        journal: null,
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await expect(publisher.createChronicle(sessionData, results)).rejects.toThrow(
        'Journal creation failed'
      );

      expect(results.errors).toHaveLength(1);
      expect(results.errors[0]).toEqual({
        entity: 'Test Chronicle',
        type: 'journal',
        error: 'Journal creation failed'
      });
    });

    it('should handle missing transcript segments', async () => {
      publisher = new KankaPublisher(mockKankaService, null);

      const sessionData = createMockSessionData({ transcript: null });
      const results = {
        journal: null,
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createChronicle(sessionData, results);

      expect(mockKankaService.createJournal).toHaveBeenCalled();
      expect(results.journal).toBeDefined();
    });

    it('should handle empty transcript segments', async () => {
      publisher = new KankaPublisher(mockKankaService, null);

      const sessionData = createMockSessionData({
        transcript: { segments: [] }
      });
      const results = {
        journal: null,
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createChronicle(sessionData, results);

      expect(mockKankaService.createJournal).toHaveBeenCalled();
      expect(results.journal).toBeDefined();
    });

    it('should truncate long transcripts in basic format', async () => {
      publisher = new KankaPublisher(mockKankaService, null);

      // Create 60 segments (more than 50 limit)
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
      const results = {
        journal: null,
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      await publisher.createChronicle(sessionData, results);

      expect(mockKankaService.createJournal).toHaveBeenCalled();

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

      // Check for specific progress stages
      // Progress callback signature is (progress, message)
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

    it('should report entity creation progress', async () => {
      const onProgress = vi.fn();
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, { onProgress });

      const sessionData = createMockSessionData();
      await publisher.publishSession(sessionData);

      // Progress callback signature is (progress, message)
      const progressCalls = onProgress.mock.calls.map((call) => ({
        progress: call[0],
        message: call[1]
      }));

      expect(progressCalls).toContainEqual({
        progress: 20,
        message: 'Creating characters...'
      });

      expect(progressCalls).toContainEqual({
        progress: 40,
        message: 'Creating locations...'
      });

      expect(progressCalls).toContainEqual({
        progress: 60,
        message: 'Creating items...'
      });
    });

    it('should report chronicle creation progress', async () => {
      const onProgress = vi.fn();
      publisher = new KankaPublisher(mockKankaService, mockNarrativeExporter, { onProgress });

      const sessionData = createMockSessionData();
      await publisher.publishSession(sessionData);

      // Progress callback signature is (progress, message)
      const progressCalls = onProgress.mock.calls.map((call) => ({
        progress: call[0],
        message: call[1]
      }));

      expect(progressCalls).toContainEqual({
        progress: 80,
        message: 'Creating chronicle...'
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

    it('should handle empty entities', () => {
      const sessionData = createMockSessionData({
        entities: {
          characters: [],
          locations: [],
          items: []
        }
      });

      const chronicle = publisher._formatBasicChronicle(sessionData);

      expect(chronicle).not.toContain('This session introduced');
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
});
