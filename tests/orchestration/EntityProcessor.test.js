/**
 * Tests for EntityProcessor
 *
 * Covers exports, constructor validation, extractEntities (happy path, duplicate
 * checking, error handling), extractRelationships, getExistingKankaEntities,
 * updateEntityExtractor, updateKankaService, hasKankaService, and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

import { EntityProcessor } from '../../scripts/orchestration/EntityProcessor.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEntityExtractor(overrides = {}) {
  return {
    extractAll: vi.fn().mockResolvedValue({
      characters: [{ name: 'Gandalf', description: 'A wizard' }],
      locations: [{ name: 'Shire', description: 'Green rolling hills' }],
      items: [{ name: 'Ring', description: 'One ring to rule them all' }],
      moments: [{ id: 'm1', title: 'Battle of Helm\'s Deep', imagePrompt: 'epic battle' }],
      totalCount: 3
    }),
    extractRelationships: vi.fn().mockResolvedValue([
      { source: 'Gandalf', target: 'Shire', type: 'visited', confidence: 8 }
    ]),
    ...overrides
  };
}

function createMockKankaService(overrides = {}) {
  return {
    preFetchEntities: vi.fn().mockResolvedValue({
      characters: { data: [{ name: 'ExistingChar' }] },
      locations: { data: [{ name: 'ExistingLoc' }] },
      items: { data: [{ name: 'ExistingItem' }] }
    }),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntityProcessor', () => {
  let mockExtractor;
  let mockKankaService;
  let processor;

  beforeEach(() => {
    mockExtractor = createMockEntityExtractor();
    mockKankaService = createMockKankaService();
    processor = new EntityProcessor({
      entityExtractor: mockExtractor,
      kankaService: mockKankaService
    });
  });

  // ── Exports ─────────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export EntityProcessor class', () => {
      expect(EntityProcessor).toBeDefined();
      expect(typeof EntityProcessor).toBe('function');
    });

    it('should be constructable', () => {
      const p = new EntityProcessor({ entityExtractor: mockExtractor });
      expect(p).toBeInstanceOf(EntityProcessor);
    });
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should throw if no entityExtractor is provided', () => {
      expect(() => new EntityProcessor()).toThrow('requires an entityExtractor');
    });

    it('should throw if entityExtractor is missing from options', () => {
      expect(() => new EntityProcessor({})).toThrow('requires an entityExtractor');
    });

    it('should throw if entityExtractor is null', () => {
      expect(() => new EntityProcessor({ entityExtractor: null })).toThrow(
        'requires an entityExtractor'
      );
    });

    it('should throw if entityExtractor is undefined', () => {
      expect(() => new EntityProcessor({ entityExtractor: undefined })).toThrow(
        'requires an entityExtractor'
      );
    });

    it('should accept a valid entityExtractor', () => {
      const p = new EntityProcessor({ entityExtractor: mockExtractor });
      expect(p).toBeDefined();
    });

    it('should set kankaService when provided', () => {
      const p = new EntityProcessor({
        entityExtractor: mockExtractor,
        kankaService: mockKankaService
      });
      expect(p.hasKankaService()).toBe(true);
    });

    it('should default kankaService to null when not provided', () => {
      const p = new EntityProcessor({ entityExtractor: mockExtractor });
      expect(p.hasKankaService()).toBe(false);
    });
  });

  // ── hasKankaService ─────────────────────────────────────────────────────

  describe('hasKankaService', () => {
    it('should return true when kankaService is set', () => {
      expect(processor.hasKankaService()).toBe(true);
    });

    it('should return false when kankaService is null', () => {
      const p = new EntityProcessor({ entityExtractor: mockExtractor });
      expect(p.hasKankaService()).toBe(false);
    });

    it('should return false after setting kankaService to null', () => {
      processor.updateKankaService(null);
      expect(processor.hasKankaService()).toBe(false);
    });

    it('should return true after setting a kankaService', () => {
      const p = new EntityProcessor({ entityExtractor: mockExtractor });
      p.updateKankaService(mockKankaService);
      expect(p.hasKankaService()).toBe(true);
    });
  });

  // ── updateEntityExtractor ───────────────────────────────────────────────

  describe('updateEntityExtractor', () => {
    it('should update the entity extractor', async () => {
      const newExtractor = createMockEntityExtractor();
      processor.updateEntityExtractor(newExtractor);
      // Verify by using the new extractor
      await processor.extractEntities('test text');
      expect(newExtractor.extractAll).toHaveBeenCalled();
    });

    it('should throw if null is provided', () => {
      expect(() => processor.updateEntityExtractor(null)).toThrow('cannot be null');
    });

    it('should throw if undefined is provided', () => {
      expect(() => processor.updateEntityExtractor(undefined)).toThrow('cannot be null');
    });

    it('should replace the previous extractor', async () => {
      const newExtractor = createMockEntityExtractor({
        extractAll: vi.fn().mockResolvedValue({
          characters: [{ name: 'Frodo', description: 'A hobbit' }],
          locations: [],
          items: [],
          moments: [],
          totalCount: 1
        })
      });

      processor.updateEntityExtractor(newExtractor);
      const result = await processor.extractEntities('some transcript');

      expect(result.characters[0].name).toBe('Frodo');
      expect(mockExtractor.extractAll).not.toHaveBeenCalled();
    });
  });

  // ── updateKankaService ──────────────────────────────────────────────────

  describe('updateKankaService', () => {
    it('should update the kanka service', () => {
      const newService = createMockKankaService();
      processor.updateKankaService(newService);
      expect(processor.hasKankaService()).toBe(true);
    });

    it('should allow setting to null', () => {
      processor.updateKankaService(null);
      expect(processor.hasKankaService()).toBe(false);
    });

    it('should allow setting to undefined', () => {
      processor.updateKankaService(undefined);
      expect(processor.hasKankaService()).toBe(false);
    });
  });

  // ── extractEntities ─────────────────────────────────────────────────────

  describe('extractEntities', () => {
    describe('input validation', () => {
      it('should return null if transcriptText is null', async () => {
        const result = await processor.extractEntities(null);
        expect(result).toBeNull();
      });

      it('should return null if transcriptText is undefined', async () => {
        const result = await processor.extractEntities(undefined);
        expect(result).toBeNull();
      });

      it('should return null if transcriptText is empty string', async () => {
        const result = await processor.extractEntities('');
        expect(result).toBeNull();
      });

      it('should return null if transcriptText is not a string', async () => {
        const result = await processor.extractEntities(42);
        expect(result).toBeNull();
      });

      it('should return null if transcriptText is an object', async () => {
        const result = await processor.extractEntities({});
        expect(result).toBeNull();
      });

      it('should return null if transcriptText is an array', async () => {
        const result = await processor.extractEntities([]);
        expect(result).toBeNull();
      });
    });

    describe('happy path', () => {
      it('should call extractAll on the entity extractor', async () => {
        await processor.extractEntities('The wizard Gandalf visited the Shire.');
        expect(mockExtractor.extractAll).toHaveBeenCalledTimes(1);
      });

      it('should pass transcript text to extractAll', async () => {
        const text = 'The wizard Gandalf visited the Shire.';
        await processor.extractEntities(text);
        expect(mockExtractor.extractAll).toHaveBeenCalledWith(text, expect.any(Object));
      });

      it('should return extraction result', async () => {
        const result = await processor.extractEntities('Some text');
        expect(result).toBeDefined();
        expect(result.characters).toBeDefined();
        expect(result.locations).toBeDefined();
        expect(result.items).toBeDefined();
        expect(result.moments).toBeDefined();
        expect(result.totalCount).toBe(3);
      });

      it('should pass includePlayerCharacters option', async () => {
        await processor.extractEntities('text', { includePlayerCharacters: true });
        expect(mockExtractor.extractAll).toHaveBeenCalledWith(
          'text',
          expect.objectContaining({ includePlayerCharacters: true })
        );
      });

      it('should pass campaignContext option', async () => {
        await processor.extractEntities('text', { campaignContext: 'D&D campaign in Faerun' });
        expect(mockExtractor.extractAll).toHaveBeenCalledWith(
          'text',
          expect.objectContaining({ campaignContext: 'D&D campaign in Faerun' })
        );
      });

      it('should pass default includePlayerCharacters as undefined', async () => {
        await processor.extractEntities('text');
        expect(mockExtractor.extractAll).toHaveBeenCalledWith(
          'text',
          expect.objectContaining({ includePlayerCharacters: undefined })
        );
      });
    });

    describe('progress reporting', () => {
      it('should call onProgress with starting message', async () => {
        const onProgress = vi.fn();
        await processor.extractEntities('text', { onProgress });
        expect(onProgress).toHaveBeenCalledWith(0, 'Extracting entities from transcript...');
      });

      it('should call onProgress with completion message', async () => {
        const onProgress = vi.fn();
        await processor.extractEntities('text', { onProgress });
        expect(onProgress).toHaveBeenCalledWith(100, 'Entity extraction complete');
      });

      it('should use noop onProgress when not provided', async () => {
        // Should not throw
        const result = await processor.extractEntities('text');
        expect(result).toBeDefined();
      });
    });

    describe('duplicate checking with Kanka', () => {
      it('should fetch existing Kanka entities by default', async () => {
        await processor.extractEntities('text');
        expect(mockKankaService.preFetchEntities).toHaveBeenCalled();
      });

      it('should pass existing entity names to extractAll', async () => {
        await processor.extractEntities('text');
        expect(mockExtractor.extractAll).toHaveBeenCalledWith(
          'text',
          expect.objectContaining({
            existingEntities: ['ExistingChar', 'ExistingLoc', 'ExistingItem']
          })
        );
      });

      it('should skip duplicate checking when checkDuplicates is false', async () => {
        await processor.extractEntities('text', { checkDuplicates: false });
        expect(mockKankaService.preFetchEntities).not.toHaveBeenCalled();
      });

      it('should skip duplicate checking when no kankaService', async () => {
        const p = new EntityProcessor({ entityExtractor: mockExtractor });
        await p.extractEntities('text');
        expect(mockKankaService.preFetchEntities).not.toHaveBeenCalled();
      });

      it('should continue if Kanka fetch fails', async () => {
        const failingKanka = createMockKankaService({
          preFetchEntities: vi.fn().mockRejectedValue(new Error('Kanka offline'))
        });

        const p = new EntityProcessor({
          entityExtractor: mockExtractor,
          kankaService: failingKanka
        });

        const result = await p.extractEntities('text');
        expect(result).toBeDefined();
        expect(mockExtractor.extractAll).toHaveBeenCalledWith(
          'text',
          expect.objectContaining({ existingEntities: [] })
        );
      });

      it('should pass empty array when Kanka has no entities', async () => {
        const emptyKanka = createMockKankaService({
          preFetchEntities: vi.fn().mockResolvedValue({})
        });

        const p = new EntityProcessor({
          entityExtractor: mockExtractor,
          kankaService: emptyKanka
        });

        await p.extractEntities('text');
        expect(mockExtractor.extractAll).toHaveBeenCalledWith(
          'text',
          expect.objectContaining({ existingEntities: [] })
        );
      });

      it('should handle partial Kanka response (only characters)', async () => {
        const partialKanka = createMockKankaService({
          preFetchEntities: vi.fn().mockResolvedValue({
            characters: { data: [{ name: 'OnlyChar' }] }
          })
        });

        const p = new EntityProcessor({
          entityExtractor: mockExtractor,
          kankaService: partialKanka
        });

        await p.extractEntities('text');
        expect(mockExtractor.extractAll).toHaveBeenCalledWith(
          'text',
          expect.objectContaining({ existingEntities: ['OnlyChar'] })
        );
      });
    });

    describe('error handling', () => {
      it('should return null when extractAll fails', async () => {
        const failingExtractor = createMockEntityExtractor({
          extractAll: vi.fn().mockRejectedValue(new Error('Extraction error'))
        });

        const p = new EntityProcessor({ entityExtractor: failingExtractor });
        const result = await p.extractEntities('text');
        expect(result).toBeNull();
      });

      it('should not throw when extractAll fails', async () => {
        const failingExtractor = createMockEntityExtractor({
          extractAll: vi.fn().mockRejectedValue(new Error('Extraction error'))
        });

        const p = new EntityProcessor({ entityExtractor: failingExtractor });
        await expect(p.extractEntities('text')).resolves.toBeNull();
      });

      it('should notify user when extractAll fails (H-3)', async () => {
        const failingExtractor = createMockEntityExtractor({
          extractAll: vi.fn().mockRejectedValue(new Error('Extraction error'))
        });

        const p = new EntityProcessor({ entityExtractor: failingExtractor });
        await p.extractEntities('text');
        expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
        expect(ui.notifications.warn).toHaveBeenCalledWith(
          expect.stringContaining('VOXCHRONICLE.Errors.EntityExtractionFailed')
        );
      });
    });

    describe('partial failure warnings', () => {
      it('should notify user when extractAll returns warnings array', async () => {
        const warningExtractor = createMockEntityExtractor({
          extractAll: vi.fn().mockResolvedValue({
            characters: [], locations: [], items: [], moments: [], totalCount: 0,
            warnings: ['Entity extraction failed; results may be incomplete']
          })
        });

        const p = new EntityProcessor({ entityExtractor: warningExtractor });
        const result = await p.extractEntities('text');
        expect(result).toBeDefined();
        expect(result.warnings).toHaveLength(1);
        expect(ui.notifications.warn).toHaveBeenCalledWith(
          expect.stringContaining('VOXCHRONICLE.Errors.PartialExtractionFailure')
        );
      });

      it('should not notify when no warnings are present', async () => {
        const result = await processor.extractEntities('text');
        expect(result).toBeDefined();
        expect(result.warnings).toBeUndefined();
        expect(ui.notifications.warn).not.toHaveBeenCalled();
      });

      it('should show warning notification when multiple warnings present', async () => {
        const warningExtractor = createMockEntityExtractor({
          extractAll: vi.fn().mockResolvedValue({
            characters: [], locations: [], items: [], moments: [], totalCount: 0,
            warnings: ['Entity extraction failed', 'Moment extraction failed']
          })
        });

        const p = new EntityProcessor({ entityExtractor: warningExtractor });
        await p.extractEntities('text');
        expect(ui.notifications.warn).toHaveBeenCalled();
      });
    });
  });

  // ── extractRelationships ────────────────────────────────────────────────

  describe('extractRelationships', () => {
    const sampleExtractionResult = {
      characters: [{ name: 'Gandalf', description: 'A wizard' }],
      locations: [{ name: 'Shire', description: 'Green hills' }],
      items: [{ name: 'Ring', description: 'One ring' }]
    };

    describe('input validation', () => {
      it('should return empty array if transcriptText is null', async () => {
        const result = await processor.extractRelationships(null, sampleExtractionResult);
        expect(result).toEqual([]);
      });

      it('should return empty array if transcriptText is undefined', async () => {
        const result = await processor.extractRelationships(undefined, sampleExtractionResult);
        expect(result).toEqual([]);
      });

      it('should return empty array if transcriptText is empty string', async () => {
        const result = await processor.extractRelationships('', sampleExtractionResult);
        expect(result).toEqual([]);
      });

      it('should return empty array if transcriptText is not a string', async () => {
        const result = await processor.extractRelationships(42, sampleExtractionResult);
        expect(result).toEqual([]);
      });

      it('should return empty array if extractRelationships method is missing', async () => {
        const noRelExtractor = { extractAll: vi.fn() };
        const p = new EntityProcessor({ entityExtractor: noRelExtractor });
        const result = await p.extractRelationships('text', sampleExtractionResult);
        expect(result).toEqual([]);
      });

      it('should return empty array if entity extractor has null extractRelationships', async () => {
        const extractor = { extractAll: vi.fn(), extractRelationships: null };
        const p = new EntityProcessor({ entityExtractor: extractor });
        const result = await p.extractRelationships('text', sampleExtractionResult);
        expect(result).toEqual([]);
      });
    });

    describe('happy path', () => {
      it('should call extractRelationships on the extractor', async () => {
        await processor.extractRelationships('text', sampleExtractionResult);
        expect(mockExtractor.extractRelationships).toHaveBeenCalledTimes(1);
      });

      it('should pass transcript text to extractRelationships', async () => {
        await processor.extractRelationships('The wizard travels', sampleExtractionResult);
        expect(mockExtractor.extractRelationships).toHaveBeenCalledWith(
          'The wizard travels',
          expect.any(Array),
          expect.any(Object)
        );
      });

      it('should pass flat list of all entities', async () => {
        await processor.extractRelationships('text', sampleExtractionResult);
        const passedEntities = mockExtractor.extractRelationships.mock.calls[0][1];
        expect(passedEntities).toHaveLength(3);
        expect(passedEntities).toContainEqual({ name: 'Gandalf', description: 'A wizard' });
        expect(passedEntities).toContainEqual({ name: 'Shire', description: 'Green hills' });
        expect(passedEntities).toContainEqual({ name: 'Ring', description: 'One ring' });
      });

      it('should return extracted relationships', async () => {
        const result = await processor.extractRelationships('text', sampleExtractionResult);
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('Gandalf');
        expect(result[0].target).toBe('Shire');
      });

      it('should pass campaignContext option', async () => {
        await processor.extractRelationships('text', sampleExtractionResult, {
          campaignContext: 'D&D Faerun'
        });
        expect(mockExtractor.extractRelationships).toHaveBeenCalledWith(
          'text',
          expect.any(Array),
          expect.objectContaining({ campaignContext: 'D&D Faerun' })
        );
      });

      it('should pass default minConfidence of 5', async () => {
        await processor.extractRelationships('text', sampleExtractionResult);
        expect(mockExtractor.extractRelationships).toHaveBeenCalledWith(
          'text',
          expect.any(Array),
          expect.objectContaining({ minConfidence: 5 })
        );
      });

      it('should pass custom minConfidence option', async () => {
        await processor.extractRelationships('text', sampleExtractionResult, {
          minConfidence: 8
        });
        expect(mockExtractor.extractRelationships).toHaveBeenCalledWith(
          'text',
          expect.any(Array),
          expect.objectContaining({ minConfidence: 8 })
        );
      });
    });

    describe('progress reporting', () => {
      it('should call onProgress with starting message', async () => {
        const onProgress = vi.fn();
        await processor.extractRelationships('text', sampleExtractionResult, { onProgress });
        expect(onProgress).toHaveBeenCalledWith(0, 'Extracting relationships from transcript...');
      });

      it('should call onProgress with completion message', async () => {
        const onProgress = vi.fn();
        await processor.extractRelationships('text', sampleExtractionResult, { onProgress });
        expect(onProgress).toHaveBeenCalledWith(100, 'Relationship extraction complete');
      });
    });

    describe('empty entities', () => {
      it('should return empty array if no entities in extraction result', async () => {
        const emptyResult = { characters: [], locations: [], items: [] };
        const result = await processor.extractRelationships('text', emptyResult);
        expect(result).toEqual([]);
        expect(mockExtractor.extractRelationships).not.toHaveBeenCalled();
      });

      it('should return empty array if extraction result has no entity arrays', async () => {
        const result = await processor.extractRelationships('text', {});
        expect(result).toEqual([]);
      });

      it('should handle extraction result with only characters', async () => {
        const charOnly = { characters: [{ name: 'Gandalf' }] };
        await processor.extractRelationships('text', charOnly);
        const passedEntities = mockExtractor.extractRelationships.mock.calls[0][1];
        expect(passedEntities).toHaveLength(1);
      });

      it('should handle extraction result with only locations', async () => {
        const locOnly = { locations: [{ name: 'Shire' }] };
        await processor.extractRelationships('text', locOnly);
        const passedEntities = mockExtractor.extractRelationships.mock.calls[0][1];
        expect(passedEntities).toHaveLength(1);
      });

      it('should handle extraction result with only items', async () => {
        const itemOnly = { items: [{ name: 'Ring' }] };
        await processor.extractRelationships('text', itemOnly);
        const passedEntities = mockExtractor.extractRelationships.mock.calls[0][1];
        expect(passedEntities).toHaveLength(1);
      });
    });

    describe('error handling', () => {
      it('should return empty array when extractRelationships fails', async () => {
        const failingExtractor = createMockEntityExtractor({
          extractRelationships: vi.fn().mockRejectedValue(new Error('Relationship extraction error'))
        });

        const p = new EntityProcessor({ entityExtractor: failingExtractor });
        const result = await p.extractRelationships('text', sampleExtractionResult);
        expect(result).toEqual([]);
      });

      it('should not throw when extractRelationships fails', async () => {
        const failingExtractor = createMockEntityExtractor({
          extractRelationships: vi.fn().mockRejectedValue(new Error('Relationship error'))
        });

        const p = new EntityProcessor({ entityExtractor: failingExtractor });
        await expect(
          p.extractRelationships('text', sampleExtractionResult)
        ).resolves.toEqual([]);
      });

      it('should return empty array when extractRelationships returns null', async () => {
        const nullExtractor = createMockEntityExtractor({
          extractRelationships: vi.fn().mockResolvedValue(null)
        });

        const p = new EntityProcessor({ entityExtractor: nullExtractor });
        const result = await p.extractRelationships('text', sampleExtractionResult);
        expect(result).toEqual([]);
      });

      it('should notify user when extractRelationships fails (H-3b)', async () => {
        const failingExtractor = createMockEntityExtractor({
          extractRelationships: vi.fn().mockRejectedValue(new Error('Relationship error'))
        });

        const p = new EntityProcessor({ entityExtractor: failingExtractor });
        await p.extractRelationships('text', sampleExtractionResult);
        expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
        expect(ui.notifications.warn).toHaveBeenCalledWith(
          expect.stringContaining('VOXCHRONICLE.Errors.RelationshipExtractionFailed')
        );
      });
    });
  });

  // ── getExistingKankaEntities ────────────────────────────────────────────

  describe('getExistingKankaEntities', () => {
    it('should return empty array when no kanka service', async () => {
      const p = new EntityProcessor({ entityExtractor: mockExtractor });
      const result = await p.getExistingKankaEntities();
      expect(result).toEqual([]);
    });

    it('should call preFetchEntities on kanka service', async () => {
      await processor.getExistingKankaEntities();
      expect(mockKankaService.preFetchEntities).toHaveBeenCalledWith({
        types: ['characters', 'locations', 'items']
      });
    });

    it('should return names from all entity types', async () => {
      const result = await processor.getExistingKankaEntities();
      expect(result).toContain('ExistingChar');
      expect(result).toContain('ExistingLoc');
      expect(result).toContain('ExistingItem');
      expect(result).toHaveLength(3);
    });

    it('should handle empty response from Kanka', async () => {
      const emptyKanka = createMockKankaService({
        preFetchEntities: vi.fn().mockResolvedValue({})
      });

      const p = new EntityProcessor({
        entityExtractor: mockExtractor,
        kankaService: emptyKanka
      });

      const result = await p.getExistingKankaEntities();
      expect(result).toEqual([]);
    });

    it('should handle partial response (characters only)', async () => {
      const partialKanka = createMockKankaService({
        preFetchEntities: vi.fn().mockResolvedValue({
          characters: { data: [{ name: 'Alice' }, { name: 'Bob' }] }
        })
      });

      const p = new EntityProcessor({
        entityExtractor: mockExtractor,
        kankaService: partialKanka
      });

      const result = await p.getExistingKankaEntities();
      expect(result).toEqual(['Alice', 'Bob']);
    });

    it('should handle error from preFetchEntities gracefully', async () => {
      const failKanka = createMockKankaService({
        preFetchEntities: vi.fn().mockRejectedValue(new Error('Network error'))
      });

      const p = new EntityProcessor({
        entityExtractor: mockExtractor,
        kankaService: failKanka
      });

      const result = await p.getExistingKankaEntities();
      expect(result).toEqual([]);
    });

    it('should handle multiple entities per type', async () => {
      const multiKanka = createMockKankaService({
        preFetchEntities: vi.fn().mockResolvedValue({
          characters: { data: [{ name: 'A' }, { name: 'B' }] },
          locations: { data: [{ name: 'C' }, { name: 'D' }, { name: 'E' }] },
          items: { data: [{ name: 'F' }] }
        })
      });

      const p = new EntityProcessor({
        entityExtractor: mockExtractor,
        kankaService: multiKanka
      });

      const result = await p.getExistingKankaEntities();
      expect(result).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
      expect(result).toHaveLength(6);
    });

    it('should handle response with empty data arrays', async () => {
      const emptyDataKanka = createMockKankaService({
        preFetchEntities: vi.fn().mockResolvedValue({
          characters: { data: [] },
          locations: { data: [] },
          items: { data: [] }
        })
      });

      const p = new EntityProcessor({
        entityExtractor: mockExtractor,
        kankaService: emptyDataKanka
      });

      const result = await p.getExistingKankaEntities();
      expect(result).toEqual([]);
    });
  });

  // ── Edge cases and integration ──────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle extractAll returning zero totalCount', async () => {
      const emptyExtractor = createMockEntityExtractor({
        extractAll: vi.fn().mockResolvedValue({
          characters: [],
          locations: [],
          items: [],
          moments: [],
          totalCount: 0
        })
      });

      const p = new EntityProcessor({ entityExtractor: emptyExtractor });
      const result = await p.extractEntities('text');
      expect(result.totalCount).toBe(0);
    });

    it('should handle extractAll returning undefined moments', async () => {
      const noMomentsExtractor = createMockEntityExtractor({
        extractAll: vi.fn().mockResolvedValue({
          characters: [{ name: 'Test' }],
          totalCount: 1
        })
      });

      const p = new EntityProcessor({ entityExtractor: noMomentsExtractor });
      const result = await p.extractEntities('text');
      expect(result).toBeDefined();
      expect(result.totalCount).toBe(1);
    });

    it('should handle whitespace-only text as valid input', async () => {
      const result = await processor.extractEntities('   ');
      expect(result).toBeDefined();
      expect(mockExtractor.extractAll).toHaveBeenCalled();
    });

    it('should handle very long transcript text', async () => {
      const longText = 'A'.repeat(100000);
      const result = await processor.extractEntities(longText);
      expect(result).toBeDefined();
      expect(mockExtractor.extractAll).toHaveBeenCalledWith(longText, expect.any(Object));
    });

    it('should handle extractAll returning extra properties', async () => {
      const extendedExtractor = createMockEntityExtractor({
        extractAll: vi.fn().mockResolvedValue({
          characters: [],
          locations: [],
          items: [],
          moments: [],
          totalCount: 0,
          customProperty: 'extra'
        })
      });

      const p = new EntityProcessor({ entityExtractor: extendedExtractor });
      const result = await p.extractEntities('text');
      expect(result.customProperty).toBe('extra');
    });
  });
});
