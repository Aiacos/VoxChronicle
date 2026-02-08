/**
 * EntityProcessor Unit Tests
 *
 * Tests for the EntityProcessor class with service mocking.
 * Covers entity extraction, relationship extraction, duplicate checking, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing EntityProcessor
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
import { EntityProcessor } from '../../scripts/orchestration/EntityProcessor.mjs';

/**
 * Create mock entity extraction result
 */
function createMockEntityExtractionResult(options = {}) {
  return {
    characters: options.characters || [
      { name: 'Gandalf', description: 'A wise wizard', isNPC: true },
      { name: 'Aragorn', description: 'A ranger', isNPC: true }
    ],
    locations: options.locations || [
      { name: 'Rivendell', description: 'An elven sanctuary', type: 'City' }
    ],
    items: options.items || [
      { name: 'Staff of Power', description: 'A magical staff', type: 'Weapon' }
    ],
    moments: options.moments || [
      { id: 'moment-1', title: 'Epic Battle', description: 'Battle description', imagePrompt: 'epic battle scene' }
    ],
    totalCount: options.totalCount || 4
  };
}

/**
 * Create mock relationships result
 */
function createMockRelationshipsResult() {
  return [
    {
      source: 'Gandalf',
      target: 'Aragorn',
      type: 'friend',
      description: 'Old friends and allies',
      confidence: 8
    },
    {
      source: 'Gandalf',
      target: 'Staff of Power',
      type: 'owns',
      description: 'Gandalf wields the staff',
      confidence: 9
    }
  ];
}

/**
 * Create mock Kanka entity lists
 */
function createMockKankaLists() {
  return {
    characters: {
      data: [
        { id: 1, name: 'Existing Character' },
        { id: 2, name: 'Another Character' }
      ]
    },
    locations: {
      data: [
        { id: 3, name: 'Existing Location' }
      ]
    },
    items: {
      data: [
        { id: 4, name: 'Existing Item' }
      ]
    }
  };
}

/**
 * Create mock services
 */
function createMockServices() {
  return {
    entityExtractor: {
      extractAll: vi.fn().mockResolvedValue(createMockEntityExtractionResult()),
      extractRelationships: vi.fn().mockResolvedValue(createMockRelationshipsResult())
    },
    kankaService: {
      listCharacters: vi.fn().mockResolvedValue(createMockKankaLists().characters),
      listLocations: vi.fn().mockResolvedValue(createMockKankaLists().locations),
      listItems: vi.fn().mockResolvedValue(createMockKankaLists().items)
    }
  };
}

describe('EntityProcessor', () => {
  let processor;
  let mockServices;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with required entityExtractor', () => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor
      });

      expect(processor).toBeInstanceOf(EntityProcessor);
      expect(processor.hasKankaService()).toBe(false);
    });

    it('should create instance with optional kankaService', () => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor,
        kankaService: mockServices.kankaService
      });

      expect(processor).toBeInstanceOf(EntityProcessor);
      expect(processor.hasKankaService()).toBe(true);
    });

    it('should throw error if entityExtractor is missing', () => {
      expect(() => {
        new EntityProcessor({});
      }).toThrow('EntityProcessor requires an entityExtractor');
    });

    it('should throw error if no options provided', () => {
      expect(() => {
        new EntityProcessor();
      }).toThrow('EntityProcessor requires an entityExtractor');
    });
  });

  describe('extractEntities', () => {
    beforeEach(() => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor,
        kankaService: mockServices.kankaService
      });
    });

    it('should extract entities from transcript text', async () => {
      const transcriptText = 'Gandalf met Aragorn in Rivendell and showed him the Staff of Power.';
      const result = await processor.extractEntities(transcriptText);

      expect(result).toBeDefined();
      expect(result.characters).toHaveLength(2);
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);
      expect(result.moments).toHaveLength(1);
      expect(result.totalCount).toBe(4);

      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalledWith(
        transcriptText,
        expect.objectContaining({
          existingEntities: expect.any(Array),
          includePlayerCharacters: undefined,
          campaignContext: undefined
        })
      );
    });

    it('should call progress callback during extraction', async () => {
      const progressCallback = vi.fn();
      const transcriptText = 'Test transcript';

      await processor.extractEntities(transcriptText, {
        onProgress: progressCallback
      });

      expect(progressCallback).toHaveBeenCalledWith(0, 'Extracting entities from transcript...');
      expect(progressCallback).toHaveBeenCalledWith(100, 'Entity extraction complete');
    });

    it('should check for duplicates in Kanka by default', async () => {
      const transcriptText = 'Test transcript';
      await processor.extractEntities(transcriptText);

      expect(mockServices.kankaService.listCharacters).toHaveBeenCalledWith({ page: 1 });
      expect(mockServices.kankaService.listLocations).toHaveBeenCalledWith({ page: 1 });
      expect(mockServices.kankaService.listItems).toHaveBeenCalledWith({ page: 1 });

      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalledWith(
        transcriptText,
        expect.objectContaining({
          existingEntities: expect.arrayContaining([
            'Existing Character',
            'Another Character',
            'Existing Location',
            'Existing Item'
          ])
        })
      );
    });

    it('should skip duplicate check when checkDuplicates is false', async () => {
      const transcriptText = 'Test transcript';
      await processor.extractEntities(transcriptText, {
        checkDuplicates: false
      });

      expect(mockServices.kankaService.listCharacters).not.toHaveBeenCalled();
      expect(mockServices.kankaService.listLocations).not.toHaveBeenCalled();
      expect(mockServices.kankaService.listItems).not.toHaveBeenCalled();

      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalledWith(
        transcriptText,
        expect.objectContaining({
          existingEntities: []
        })
      );
    });

    it('should skip duplicate check when kankaService is not available', async () => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor
      });

      const transcriptText = 'Test transcript';
      await processor.extractEntities(transcriptText);

      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalledWith(
        transcriptText,
        expect.objectContaining({
          existingEntities: []
        })
      );
    });

    it('should handle includePlayerCharacters option', async () => {
      const transcriptText = 'Test transcript';
      await processor.extractEntities(transcriptText, {
        includePlayerCharacters: true
      });

      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalledWith(
        transcriptText,
        expect.objectContaining({
          includePlayerCharacters: true
        })
      );
    });

    it('should handle campaignContext option', async () => {
      const transcriptText = 'Test transcript';
      const context = 'A fantasy campaign in Middle-earth';

      await processor.extractEntities(transcriptText, {
        campaignContext: context
      });

      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalledWith(
        transcriptText,
        expect.objectContaining({
          campaignContext: context
        })
      );
    });

    it('should return null if transcript text is missing', async () => {
      const result = await processor.extractEntities(null);
      expect(result).toBeNull();
      expect(mockServices.entityExtractor.extractAll).not.toHaveBeenCalled();
    });

    it('should return null if transcript text is empty', async () => {
      const result = await processor.extractEntities('');
      expect(result).toBeNull();
      expect(mockServices.entityExtractor.extractAll).not.toHaveBeenCalled();
    });

    it('should return null if transcript text is not a string', async () => {
      const result = await processor.extractEntities(123);
      expect(result).toBeNull();
      expect(mockServices.entityExtractor.extractAll).not.toHaveBeenCalled();
    });

    it('should handle extraction errors gracefully', async () => {
      mockServices.entityExtractor.extractAll.mockRejectedValueOnce(
        new Error('Extraction failed')
      );

      const transcriptText = 'Test transcript';
      const result = await processor.extractEntities(transcriptText);

      expect(result).toBeNull();
    });

    it('should continue if fetching existing entities fails', async () => {
      mockServices.kankaService.listCharacters.mockRejectedValueOnce(
        new Error('Network error')
      );

      const transcriptText = 'Test transcript';
      const result = await processor.extractEntities(transcriptText);

      expect(result).toBeDefined();
      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalledWith(
        transcriptText,
        expect.objectContaining({
          existingEntities: []
        })
      );
    });

    it('should handle extraction result without moments', async () => {
      mockServices.entityExtractor.extractAll.mockResolvedValueOnce({
        characters: [{ name: 'Test', description: 'Desc', isNPC: true }],
        locations: [],
        items: [],
        totalCount: 1
      });

      const transcriptText = 'Test transcript';
      const result = await processor.extractEntities(transcriptText);

      expect(result).toBeDefined();
      expect(result.moments).toBeUndefined();
    });
  });

  describe('extractRelationships', () => {
    beforeEach(() => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor,
        kankaService: mockServices.kankaService
      });
    });

    it('should extract relationships from transcript and entities', async () => {
      const transcriptText = 'Gandalf and Aragorn are old friends.';
      const extractionResult = createMockEntityExtractionResult();

      const result = await processor.extractRelationships(transcriptText, extractionResult);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('source');
      expect(result[0]).toHaveProperty('target');
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('confidence');

      expect(mockServices.entityExtractor.extractRelationships).toHaveBeenCalledWith(
        transcriptText,
        expect.arrayContaining([
          expect.objectContaining({ name: 'Gandalf' }),
          expect.objectContaining({ name: 'Aragorn' }),
          expect.objectContaining({ name: 'Rivendell' }),
          expect.objectContaining({ name: 'Staff of Power' })
        ]),
        expect.objectContaining({
          campaignContext: undefined,
          minConfidence: 5
        })
      );
    });

    it('should call progress callback during extraction', async () => {
      const progressCallback = vi.fn();
      const transcriptText = 'Test transcript';
      const extractionResult = createMockEntityExtractionResult();

      await processor.extractRelationships(transcriptText, extractionResult, {
        onProgress: progressCallback
      });

      expect(progressCallback).toHaveBeenCalledWith(0, 'Extracting relationships from transcript...');
      expect(progressCallback).toHaveBeenCalledWith(100, 'Relationship extraction complete');
    });

    it('should handle campaignContext option', async () => {
      const transcriptText = 'Test transcript';
      const extractionResult = createMockEntityExtractionResult();
      const context = 'A fantasy campaign';

      await processor.extractRelationships(transcriptText, extractionResult, {
        campaignContext: context
      });

      expect(mockServices.entityExtractor.extractRelationships).toHaveBeenCalledWith(
        transcriptText,
        expect.any(Array),
        expect.objectContaining({
          campaignContext: context
        })
      );
    });

    it('should handle minConfidence option', async () => {
      const transcriptText = 'Test transcript';
      const extractionResult = createMockEntityExtractionResult();

      await processor.extractRelationships(transcriptText, extractionResult, {
        minConfidence: 8
      });

      expect(mockServices.entityExtractor.extractRelationships).toHaveBeenCalledWith(
        transcriptText,
        expect.any(Array),
        expect.objectContaining({
          minConfidence: 8
        })
      );
    });

    it('should use default minConfidence of 5 if not specified', async () => {
      const transcriptText = 'Test transcript';
      const extractionResult = createMockEntityExtractionResult();

      await processor.extractRelationships(transcriptText, extractionResult);

      expect(mockServices.entityExtractor.extractRelationships).toHaveBeenCalledWith(
        transcriptText,
        expect.any(Array),
        expect.objectContaining({
          minConfidence: 5
        })
      );
    });

    it('should return empty array if transcript text is missing', async () => {
      const extractionResult = createMockEntityExtractionResult();
      const result = await processor.extractRelationships(null, extractionResult);

      expect(result).toEqual([]);
      expect(mockServices.entityExtractor.extractRelationships).not.toHaveBeenCalled();
    });

    it('should return empty array if transcript text is empty', async () => {
      const extractionResult = createMockEntityExtractionResult();
      const result = await processor.extractRelationships('', extractionResult);

      expect(result).toEqual([]);
      expect(mockServices.entityExtractor.extractRelationships).not.toHaveBeenCalled();
    });

    it('should return empty array if transcript text is not a string', async () => {
      const extractionResult = createMockEntityExtractionResult();
      const result = await processor.extractRelationships(123, extractionResult);

      expect(result).toEqual([]);
      expect(mockServices.entityExtractor.extractRelationships).not.toHaveBeenCalled();
    });

    it('should return empty array if no entities found', async () => {
      const transcriptText = 'Test transcript';
      const extractionResult = createMockEntityExtractionResult({
        characters: [],
        locations: [],
        items: [],
        totalCount: 0
      });

      const result = await processor.extractRelationships(transcriptText, extractionResult);

      expect(result).toEqual([]);
      expect(mockServices.entityExtractor.extractRelationships).not.toHaveBeenCalled();
    });

    it('should return empty array if entity extractor does not support relationships', async () => {
      processor = new EntityProcessor({
        entityExtractor: {
          extractAll: vi.fn()
          // No extractRelationships method
        }
      });

      const transcriptText = 'Test transcript';
      const extractionResult = createMockEntityExtractionResult();

      const result = await processor.extractRelationships(transcriptText, extractionResult);

      expect(result).toEqual([]);
    });

    it('should handle extraction errors gracefully', async () => {
      mockServices.entityExtractor.extractRelationships.mockRejectedValueOnce(
        new Error('Extraction failed')
      );

      const transcriptText = 'Test transcript';
      const extractionResult = createMockEntityExtractionResult();

      const result = await processor.extractRelationships(transcriptText, extractionResult);

      expect(result).toEqual([]);
    });

    it('should handle null relationship result', async () => {
      mockServices.entityExtractor.extractRelationships.mockResolvedValueOnce(null);

      const transcriptText = 'Test transcript';
      const extractionResult = createMockEntityExtractionResult();

      const result = await processor.extractRelationships(transcriptText, extractionResult);

      expect(result).toEqual([]);
    });
  });

  describe('getExistingKankaEntities', () => {
    beforeEach(() => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor,
        kankaService: mockServices.kankaService
      });
    });

    it('should fetch existing entities from all entity types', async () => {
      const result = await processor.getExistingKankaEntities();

      expect(result).toEqual([
        'Existing Character',
        'Another Character',
        'Existing Location',
        'Existing Item'
      ]);

      expect(mockServices.kankaService.listCharacters).toHaveBeenCalledWith({ page: 1 });
      expect(mockServices.kankaService.listLocations).toHaveBeenCalledWith({ page: 1 });
      expect(mockServices.kankaService.listItems).toHaveBeenCalledWith({ page: 1 });
    });

    it('should return empty array if no Kanka service configured', async () => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor
      });

      const result = await processor.getExistingKankaEntities();

      expect(result).toEqual([]);
      expect(mockServices.kankaService.listCharacters).not.toHaveBeenCalled();
    });

    it('should handle partial failures gracefully', async () => {
      mockServices.kankaService.listCharacters.mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await processor.getExistingKankaEntities();

      expect(result).toEqual([]);
    });

    it('should handle empty response data', async () => {
      mockServices.kankaService.listCharacters.mockResolvedValueOnce({});
      mockServices.kankaService.listLocations.mockResolvedValueOnce({});
      mockServices.kankaService.listItems.mockResolvedValueOnce({});

      const result = await processor.getExistingKankaEntities();

      expect(result).toEqual([]);
    });

    it('should handle null response data', async () => {
      mockServices.kankaService.listCharacters.mockResolvedValueOnce(null);
      mockServices.kankaService.listLocations.mockResolvedValueOnce(null);
      mockServices.kankaService.listItems.mockResolvedValueOnce(null);

      const result = await processor.getExistingKankaEntities();

      expect(result).toEqual([]);
    });

    it('should handle mixed success and failure', async () => {
      mockServices.kankaService.listCharacters.mockResolvedValueOnce({
        data: [{ id: 1, name: 'Character' }]
      });
      mockServices.kankaService.listLocations.mockRejectedValueOnce(
        new Error('Network error')
      );
      mockServices.kankaService.listItems.mockResolvedValueOnce({
        data: [{ id: 2, name: 'Item' }]
      });

      const result = await processor.getExistingKankaEntities();

      expect(result).toEqual([]);
    });
  });

  describe('updateEntityExtractor', () => {
    beforeEach(() => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor
      });
    });

    it('should update entity extractor service', () => {
      const newExtractor = {
        extractAll: vi.fn(),
        extractRelationships: vi.fn()
      };

      processor.updateEntityExtractor(newExtractor);

      // Verify by calling extractEntities
      const transcriptText = 'Test transcript';
      processor.extractEntities(transcriptText);

      expect(newExtractor.extractAll).toHaveBeenCalled();
      expect(mockServices.entityExtractor.extractAll).not.toHaveBeenCalled();
    });

    it('should throw error if new extractor is null', () => {
      expect(() => {
        processor.updateEntityExtractor(null);
      }).toThrow('EntityExtractor cannot be null');
    });

    it('should throw error if new extractor is undefined', () => {
      expect(() => {
        processor.updateEntityExtractor(undefined);
      }).toThrow('EntityExtractor cannot be null');
    });
  });

  describe('updateKankaService', () => {
    beforeEach(() => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor
      });
    });

    it('should update Kanka service', () => {
      expect(processor.hasKankaService()).toBe(false);

      processor.updateKankaService(mockServices.kankaService);

      expect(processor.hasKankaService()).toBe(true);
    });

    it('should allow removing Kanka service', () => {
      processor.updateKankaService(mockServices.kankaService);
      expect(processor.hasKankaService()).toBe(true);

      processor.updateKankaService(null);
      expect(processor.hasKankaService()).toBe(false);
    });
  });

  describe('hasKankaService', () => {
    it('should return false when Kanka service is not configured', () => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor
      });

      expect(processor.hasKankaService()).toBe(false);
    });

    it('should return true when Kanka service is configured', () => {
      processor = new EntityProcessor({
        entityExtractor: mockServices.entityExtractor,
        kankaService: mockServices.kankaService
      });

      expect(processor.hasKankaService()).toBe(true);
    });
  });
});
