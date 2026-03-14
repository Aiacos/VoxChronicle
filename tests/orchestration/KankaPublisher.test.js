/**
 * Tests for KankaPublisher
 *
 * Covers exports, constructor, publishSession (happy path, chronicle creation,
 * entity creation, journal description extraction, error handling, progress reporting),
 * private helpers (_findJournalDescription, _extractContextFromText,
 * _formatBasicChronicle) via public API, and edge cases across all code paths.
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

vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  escapeHtml: vi.fn((text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  })
}));

import { KankaPublisher } from '../../scripts/orchestration/KankaPublisher.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockKankaService(overrides = {}) {
  return {
    createJournal: vi.fn().mockResolvedValue({ id: 1, name: 'Session 1' }),
    createCharacter: vi.fn().mockResolvedValue({ id: 2, name: 'Gandalf' }),
    createLocation: vi.fn().mockResolvedValue({ id: 3, name: 'Shire' }),
    createItem: vi.fn().mockResolvedValue({ id: 4, name: 'Ring' }),
    createIfNotExists: vi.fn().mockImplementation((type, data) => {
      return Promise.resolve({ id: 10, name: data.name, _alreadyExisted: false });
    }),
    preFetchEntities: vi.fn().mockResolvedValue({}),
    ...overrides
  };
}

function createMockNarrativeExporter(overrides = {}) {
  return {
    export: vi.fn().mockReturnValue({
      name: 'Session Chronicle',
      entry: '<h1>Session Chronicle</h1><p>The party ventured forth...</p>',
      type: 'Session Chronicle',
      date: '2024-01-15'
    }),
    ...overrides
  };
}

function createSessionData(overrides = {}) {
  return {
    title: 'Session 1: The Beginning',
    date: '2024-01-15',
    transcript: {
      segments: [
        { speaker: 'DM', text: 'Welcome to the adventure!' },
        { speaker: 'Player 1', text: 'I look around the tavern.' }
      ]
    },
    entities: {
      characters: [
        { name: 'Gandalf', description: 'A powerful wizard', isNPC: true },
        { name: 'Frodo', description: 'A brave hobbit', isNPC: false }
      ],
      locations: [{ name: 'Shire', description: 'Green rolling hills', type: 'Region' }],
      items: [{ name: 'Ring of Power', description: 'One ring to rule them all', type: 'Artifact' }]
    },
    moments: [{ id: 'm1', title: 'The Journey Begins', imagePrompt: 'An epic journey' }],
    images: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KankaPublisher', () => {
  let mockKankaService;
  let mockExporter;
  let publisher;

  beforeEach(() => {
    mockKankaService = createMockKankaService();
    mockExporter = createMockNarrativeExporter();
    publisher = new KankaPublisher(mockKankaService, mockExporter);
  });

  // ── Exports ─────────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export KankaPublisher class', () => {
      expect(KankaPublisher).toBeDefined();
      expect(typeof KankaPublisher).toBe('function');
    });

    it('should be constructable', () => {
      const p = new KankaPublisher(mockKankaService);
      expect(p).toBeInstanceOf(KankaPublisher);
    });
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should accept kankaService as first argument', () => {
      const p = new KankaPublisher(mockKankaService);
      expect(p).toBeDefined();
    });

    it('should accept narrativeExporter as optional second argument', () => {
      const p = new KankaPublisher(mockKankaService, mockExporter);
      expect(p).toBeDefined();
    });

    it('should default narrativeExporter to null', () => {
      const p = new KankaPublisher(mockKankaService);
      // Will use basic chronicle format when no exporter
      expect(p).toBeDefined();
    });

    it('should accept options as third argument', () => {
      const onProgress = vi.fn();
      const p = new KankaPublisher(mockKankaService, mockExporter, {
        onProgress,
        chronicleFormat: 'summary'
      });
      expect(p).toBeDefined();
    });

    it('should store onProgress from options', () => {
      const onProgress = vi.fn();
      const p = new KankaPublisher(mockKankaService, null, { onProgress });
      // Trigger progress
      p._reportProgress(50, 'Test');
      expect(onProgress).toHaveBeenCalledWith(50, 'Test');
    });

    it('should default chronicleFormat to "full"', () => {
      const p = new KankaPublisher(mockKankaService);
      expect(p._chronicleFormat).toBe('full');
    });

    it('should accept custom chronicleFormat', () => {
      const p = new KankaPublisher(mockKankaService, null, { chronicleFormat: 'summary' });
      expect(p._chronicleFormat).toBe('summary');
    });

    it('should accept null kankaService', () => {
      const p = new KankaPublisher(null);
      expect(p).toBeDefined();
    });
  });

  // ── publishSession ──────────────────────────────────────────────────────

  describe('publishSession', () => {
    describe('input validation', () => {
      it('should throw if no session data provided', async () => {
        await expect(publisher.publishSession(null)).rejects.toThrow('No session data provided');
      });

      it('should throw if session data is undefined', async () => {
        await expect(publisher.publishSession(undefined)).rejects.toThrow(
          'No session data provided'
        );
      });

      it('should throw if kankaService is not configured', async () => {
        const p = new KankaPublisher(null, mockExporter);
        await expect(p.publishSession(createSessionData())).rejects.toThrow(
          'Kanka service not configured'
        );
      });
    });

    describe('result structure', () => {
      it('should return result with journal property', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(result).toHaveProperty('journal');
      });

      it('should return result with characters array', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(Array.isArray(result.characters)).toBe(true);
      });

      it('should return result with locations array', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(Array.isArray(result.locations)).toBe(true);
      });

      it('should return result with items array', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(Array.isArray(result.items)).toBe(true);
      });

      it('should return result with images array', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(Array.isArray(result.images)).toBe(true);
      });

      it('should return result with errors array', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(Array.isArray(result.errors)).toBe(true);
      });
    });

    describe('chronicle creation', () => {
      it('should create chronicle journal by default', async () => {
        await publisher.publishSession(createSessionData());
        expect(mockKankaService.createJournal).toHaveBeenCalled();
      });

      it('should use NarrativeExporter when available', async () => {
        await publisher.publishSession(createSessionData());
        expect(mockExporter.export).toHaveBeenCalled();
      });

      it('should pass correct data to NarrativeExporter', async () => {
        const sessionData = createSessionData();
        await publisher.publishSession(sessionData);

        expect(mockExporter.export).toHaveBeenCalledWith(
          expect.objectContaining({
            title: sessionData.title,
            date: sessionData.date,
            segments: sessionData.transcript.segments,
            entities: sessionData.entities,
            moments: sessionData.moments
          }),
          expect.objectContaining({
            format: 'full',
            includeEntities: true,
            includeMoments: true,
            includeTimestamps: false
          })
        );
      });

      it('should pass chronicleFormat to exporter options', async () => {
        const p = new KankaPublisher(mockKankaService, mockExporter, {
          chronicleFormat: 'summary'
        });
        await p.publishSession(createSessionData());
        expect(mockExporter.export).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({ format: 'summary' })
        );
      });

      it('should store journal result', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(result.journal).toEqual({ id: 1, name: 'Session 1' });
      });

      it('should skip chronicle when createChronicle is false', async () => {
        const result = await publisher.publishSession(createSessionData(), {
          createChronicle: false
        });
        // createJournal is called for character sub-journals, not for the chronicle
        // but without a parent journal, characters won't be created
        expect(result.journal).toBeNull();
      });

      it('should use basic chronicle format when no exporter', async () => {
        const p = new KankaPublisher(mockKankaService);
        await p.publishSession(createSessionData());

        expect(mockKankaService.createJournal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Session 1: The Beginning',
            type: 'Session Chronicle',
            date: '2024-01-15'
          })
        );
      });

      it('should format basic chronicle with title and date', async () => {
        const p = new KankaPublisher(mockKankaService);
        await p.publishSession(createSessionData());

        const calledWith = mockKankaService.createJournal.mock.calls[0][0];
        expect(calledWith.entry).toContain('Session 1: The Beginning');
        expect(calledWith.entry).toContain('2024-01-15');
      });

      it('should include entity count in basic chronicle', async () => {
        const p = new KankaPublisher(mockKankaService);
        await p.publishSession(createSessionData());

        const calledWith = mockKankaService.createJournal.mock.calls[0][0];
        expect(calledWith.entry).toContain('VOXCHRONICLE.KankaPublisher.ChronicleEntities');
      });

      it('should include transcript segments in basic chronicle', async () => {
        const p = new KankaPublisher(mockKankaService);
        await p.publishSession(createSessionData());

        const calledWith = mockKankaService.createJournal.mock.calls[0][0];
        expect(calledWith.entry).toContain('DM');
        expect(calledWith.entry).toContain('Welcome to the adventure!');
      });

      it('should add error to results and throw when chronicle creation fails', async () => {
        const failingService = createMockKankaService({
          createJournal: vi.fn().mockRejectedValue(new Error('Journal creation failed'))
        });

        const p = new KankaPublisher(failingService, mockExporter);
        await expect(p.publishSession(createSessionData())).rejects.toThrow(
          'Journal creation failed'
        );
      });

      it('should handle transcript with no segments in basic chronicle', async () => {
        const p = new KankaPublisher(mockKankaService);
        const sessionData = createSessionData({ transcript: { segments: [] } });
        await p.publishSession(sessionData);

        const calledWith = mockKankaService.createJournal.mock.calls[0][0];
        expect(calledWith.entry).not.toContain('Transcript');
      });

      it('should handle missing transcript in basic chronicle', async () => {
        const p = new KankaPublisher(mockKankaService);
        const sessionData = createSessionData({ transcript: null });
        await p.publishSession(sessionData);

        const calledWith = mockKankaService.createJournal.mock.calls[0][0];
        expect(calledWith.entry).not.toContain('Transcript');
      });

      it('should truncate basic chronicle transcript to 50 segments', async () => {
        const p = new KankaPublisher(mockKankaService);
        const segments = [];
        for (let i = 0; i < 60; i++) {
          segments.push({ speaker: `Speaker ${i}`, text: `Line ${i}` });
        }
        const sessionData = createSessionData({ transcript: { segments } });
        await p.publishSession(sessionData);

        const calledWith = mockKankaService.createJournal.mock.calls[0][0];
        expect(calledWith.entry).toContain('VOXCHRONICLE.KankaPublisher.ChronicleMoreSegments');
      });

      it('should include VoxChronicle footer in basic chronicle', async () => {
        const p = new KankaPublisher(mockKankaService);
        await p.publishSession(createSessionData());

        const calledWith = mockKankaService.createJournal.mock.calls[0][0];
        expect(calledWith.entry).toContain('VOXCHRONICLE.KankaPublisher.ChronicleGeneratedBy');
      });
    });

    describe('entity creation', () => {
      it('should pre-fetch Kanka entities for deduplication', async () => {
        await publisher.publishSession(createSessionData());
        expect(mockKankaService.preFetchEntities).toHaveBeenCalledWith({
          types: ['journals', 'locations', 'items']
        });
      });

      it('should create character sub-journals', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(result.characters).toHaveLength(2);
      });

      it('should create characters as sub-journals under chronicle', async () => {
        await publisher.publishSession(createSessionData());

        // Characters should be created with journal_id pointing to chronicle
        const charCalls = mockKankaService.createJournal.mock.calls.filter(
          (call) => call[0].journal_id === 1
        );
        expect(charCalls).toHaveLength(2);
      });

      it('should set correct type for NPC characters', async () => {
        await publisher.publishSession(createSessionData());

        const charCalls = mockKankaService.createJournal.mock.calls.filter(
          (call) => call[0].journal_id === 1
        );
        // Gandalf is NPC
        const gandalfCall = charCalls.find((c) => c[0].name === 'Gandalf');
        expect(gandalfCall[0].type).toBe('NPC');
      });

      it('should set correct type for PC characters', async () => {
        await publisher.publishSession(createSessionData());

        const charCalls = mockKankaService.createJournal.mock.calls.filter(
          (call) => call[0].journal_id === 1
        );
        const frodoCall = charCalls.find((c) => c[0].name === 'Frodo');
        expect(frodoCall[0].type).toBe('PC');
      });

      it('should skip character creation and report errors when no parent journal', async () => {
        const result = await publisher.publishSession(createSessionData(), {
          createChronicle: false
        });
        expect(result.characters).toHaveLength(0);
        // Should report an error for each character that couldn't be created
        const charErrors = result.errors.filter((e) => e.type === 'character');
        expect(charErrors).toHaveLength(2);
        expect(charErrors[0].error).toMatch(/parent chronicle journal/i);
      });

      it('should create locations using createIfNotExists', async () => {
        await publisher.publishSession(createSessionData());

        expect(mockKankaService.createIfNotExists).toHaveBeenCalledWith(
          'locations',
          expect.objectContaining({ name: 'Shire' })
        );
      });

      it('should create items using createIfNotExists', async () => {
        await publisher.publishSession(createSessionData());

        expect(mockKankaService.createIfNotExists).toHaveBeenCalledWith(
          'items',
          expect.objectContaining({ name: 'Ring of Power' })
        );
      });

      it('should skip entities when createEntities is false', async () => {
        const result = await publisher.publishSession(createSessionData(), {
          createEntities: false
        });
        expect(result.characters).toHaveLength(0);
        expect(result.locations).toHaveLength(0);
        expect(result.items).toHaveLength(0);
      });

      it('should skip entities when session data has no entities', async () => {
        const sessionData = createSessionData({ entities: null });
        const result = await publisher.publishSession(sessionData);
        expect(result.characters).toHaveLength(0);
        expect(result.locations).toHaveLength(0);
        expect(result.items).toHaveLength(0);
      });

      it('should not add already-existing entities to results', async () => {
        const service = createMockKankaService({
          createIfNotExists: vi.fn().mockResolvedValue({
            id: 10,
            name: 'Shire',
            _alreadyExisted: true
          })
        });

        const p = new KankaPublisher(service, mockExporter);
        const result = await p.publishSession(createSessionData());
        // Location already existed, so shouldn't be in locations result
        expect(result.locations).toHaveLength(0);
      });

      it('should add character creation errors to results.errors', async () => {
        const service = createMockKankaService({
          createJournal: vi
            .fn()
            .mockResolvedValueOnce({ id: 1, name: 'Chronicle' }) // chronicle
            .mockRejectedValueOnce(new Error('Character creation failed')) // first character
            .mockResolvedValueOnce({ id: 3, name: 'Frodo' }) // second character
        });

        const p = new KankaPublisher(service, mockExporter);
        const result = await p.publishSession(createSessionData());
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('character');
        expect(result.errors[0].entity).toBe('Gandalf');
      });

      it('should add location creation errors to results.errors', async () => {
        const service = createMockKankaService({
          createIfNotExists: vi.fn().mockRejectedValue(new Error('Location failed'))
        });

        const p = new KankaPublisher(service, mockExporter);
        const result = await p.publishSession(createSessionData());
        // Both location and item will fail
        expect(result.errors.some((e) => e.type === 'location')).toBe(true);
      });

      it('should add item creation errors to results.errors', async () => {
        const service = createMockKankaService({
          createIfNotExists: vi.fn().mockRejectedValue(new Error('Item failed'))
        });

        const p = new KankaPublisher(service, mockExporter);
        const result = await p.publishSession(createSessionData());
        expect(result.errors.some((e) => e.type === 'item')).toBe(true);
      });

      it('should handle empty character arrays', async () => {
        const sessionData = createSessionData({
          entities: { characters: [], locations: [], items: [] }
        });
        const result = await publisher.publishSession(sessionData);
        expect(result.characters).toHaveLength(0);
      });

      it('should handle missing character arrays', async () => {
        const sessionData = createSessionData({
          entities: { locations: [], items: [] }
        });
        const result = await publisher.publishSession(sessionData);
        expect(result.characters).toHaveLength(0);
      });

      it('should handle missing location arrays', async () => {
        const sessionData = createSessionData({
          entities: { characters: [], items: [] }
        });
        const result = await publisher.publishSession(sessionData);
        expect(result.locations).toHaveLength(0);
      });

      it('should handle missing item arrays', async () => {
        const sessionData = createSessionData({
          entities: { characters: [], locations: [] }
        });
        const result = await publisher.publishSession(sessionData);
        expect(result.items).toHaveLength(0);
      });
    });

    describe('journal validation for locations/items', () => {
      it('should create location when no journalText (graceful fallback)', async () => {
        const sessionData = createSessionData(); // no journalText
        const result = await publisher.publishSession(sessionData);
        expect(result.locations).toHaveLength(1);
      });

      it('should create item when no journalText (graceful fallback)', async () => {
        const sessionData = createSessionData(); // no journalText
        const result = await publisher.publishSession(sessionData);
        expect(result.items).toHaveLength(1);
      });

      it('should create location even when entity name is not in journal text', async () => {
        const sessionData = createSessionData({
          journalText: 'This adventure takes place in Mordor.'
        });

        const result = await publisher.publishSession(sessionData);
        // Since v3.1.9 journal-based entity filtering was removed; all locations are created
        expect(result.locations).toHaveLength(1);
        expect(mockKankaService.createIfNotExists).toHaveBeenCalledWith(
          'locations',
          expect.objectContaining({ name: 'Shire' })
        );
      });

      it('should create location found in journal text', async () => {
        const sessionData = createSessionData({
          journalText: 'The party travels through the Shire on their journey.'
        });

        const result = await publisher.publishSession(sessionData);
        expect(result.locations).toHaveLength(1);
      });

      it('should create item even when entity name is not in journal text', async () => {
        const sessionData = createSessionData({
          journalText: 'The party finds a magical sword.'
        });

        const result = await publisher.publishSession(sessionData);
        // Since v3.1.9 journal-based entity filtering was removed; all items are created
        expect(result.items).toHaveLength(1);
      });

      it('should create item found in journal text', async () => {
        const sessionData = createSessionData({
          journalText: 'The Ring of Power must be destroyed in the fires of Mount Doom.'
        });

        const result = await publisher.publishSession(sessionData);
        expect(result.items).toHaveLength(1);
      });

      it('should perform case-insensitive journal text matching', async () => {
        const sessionData = createSessionData({
          journalText: 'the shire is a peaceful place.'
        });

        const result = await publisher.publishSession(sessionData);
        expect(result.locations).toHaveLength(1);
      });
    });

    describe('journal description extraction', () => {
      it('should use NPC profile description for characters', async () => {
        const sessionData = createSessionData({
          npcProfiles: [{ name: 'Gandalf', description: 'Gandalf the Grey, a Maiar spirit' }]
        });

        await publisher.publishSession(sessionData);

        const charCalls = mockKankaService.createJournal.mock.calls.filter(
          (c) => c[0].journal_id === 1
        );
        const gandalfCall = charCalls.find((c) => c[0].name === 'Gandalf');
        expect(gandalfCall[0].entry).toBe('Gandalf the Grey, a Maiar spirit');
      });

      it('should fall back to character description when no NPC profile', async () => {
        const sessionData = createSessionData({
          npcProfiles: [] // no profiles
        });

        await publisher.publishSession(sessionData);

        const charCalls = mockKankaService.createJournal.mock.calls.filter(
          (c) => c[0].journal_id === 1
        );
        const gandalfCall = charCalls.find((c) => c[0].name === 'Gandalf');
        expect(gandalfCall[0].entry).toBe('A powerful wizard');
      });

      it('should use journal text context for location descriptions', async () => {
        const sessionData = createSessionData({
          journalText: 'The Shire is a beautiful region. The Shire has green hills.'
        });

        await publisher.publishSession(sessionData);

        const locCall = mockKankaService.createIfNotExists.mock.calls.find(
          (c) => c[0] === 'locations'
        );
        // Should extract sentences mentioning "Shire"
        expect(locCall[1].entry).toContain('Shire');
      });

      it('should use entity description when no journal context', async () => {
        const sessionData = createSessionData(); // no journalText

        await publisher.publishSession(sessionData);

        const locCall = mockKankaService.createIfNotExists.mock.calls.find(
          (c) => c[0] === 'locations'
        );
        expect(locCall[1].entry).toBe('Green rolling hills');
      });

      it('should extract up to 3 context sentences', async () => {
        const sessionData = createSessionData({
          journalText:
            'The Shire is peaceful. The Shire has green hills. ' +
            'The Shire is home to hobbits. The Shire is in the north. The Shire is beautiful.'
        });

        await publisher.publishSession(sessionData);

        const locCall = mockKankaService.createIfNotExists.mock.calls.find(
          (c) => c[0] === 'locations'
        );
        // Should have at most 3 sentences
        const sentences = locCall[1].entry.split('. ').filter((s) => s.trim());
        expect(sentences.length).toBeLessThanOrEqual(3);
      });

      it('should do case-insensitive NPC profile matching', async () => {
        const sessionData = createSessionData({
          npcProfiles: [{ name: 'gandalf', description: 'A wise wizard' }]
        });

        await publisher.publishSession(sessionData);

        const charCalls = mockKankaService.createJournal.mock.calls.filter(
          (c) => c[0].journal_id === 1
        );
        const gandalfCall = charCalls.find((c) => c[0].name === 'Gandalf');
        expect(gandalfCall[0].entry).toBe('A wise wizard');
      });
    });

    describe('progress reporting', () => {
      it('should report initial progress', async () => {
        const onProgress = vi.fn();
        const p = new KankaPublisher(mockKankaService, mockExporter, { onProgress });
        await p.publishSession(createSessionData());
        expect(onProgress).toHaveBeenCalledWith(0, 'VOXCHRONICLE.KankaPublisher.ProgressPreparing');
      });

      it('should report chronicle creation progress', async () => {
        const onProgress = vi.fn();
        const p = new KankaPublisher(mockKankaService, mockExporter, { onProgress });
        await p.publishSession(createSessionData());
        expect(onProgress).toHaveBeenCalledWith(
          10,
          'VOXCHRONICLE.KankaPublisher.ProgressChronicle'
        );
      });

      it('should report character creation progress', async () => {
        const onProgress = vi.fn();
        const p = new KankaPublisher(mockKankaService, mockExporter, { onProgress });
        await p.publishSession(createSessionData());
        expect(onProgress).toHaveBeenCalledWith(
          30,
          'VOXCHRONICLE.KankaPublisher.ProgressCharacters'
        );
      });

      it('should report location creation progress', async () => {
        const onProgress = vi.fn();
        const p = new KankaPublisher(mockKankaService, mockExporter, { onProgress });
        await p.publishSession(createSessionData());
        expect(onProgress).toHaveBeenCalledWith(
          50,
          'VOXCHRONICLE.KankaPublisher.ProgressLocations'
        );
      });

      it('should report item creation progress', async () => {
        const onProgress = vi.fn();
        const p = new KankaPublisher(mockKankaService, mockExporter, { onProgress });
        await p.publishSession(createSessionData());
        expect(onProgress).toHaveBeenCalledWith(70, 'VOXCHRONICLE.KankaPublisher.ProgressItems');
      });

      it('should report completion progress', async () => {
        const onProgress = vi.fn();
        const p = new KankaPublisher(mockKankaService, mockExporter, { onProgress });
        await p.publishSession(createSessionData());
        expect(onProgress).toHaveBeenCalledWith(
          100,
          'VOXCHRONICLE.KankaPublisher.ProgressComplete'
        );
      });

      it('should use per-call onProgress over constructor onProgress', async () => {
        const constructorProgress = vi.fn();
        const callProgress = vi.fn();
        const p = new KankaPublisher(mockKankaService, mockExporter, {
          onProgress: constructorProgress
        });

        await p.publishSession(createSessionData(), { onProgress: callProgress });

        expect(callProgress).toHaveBeenCalledWith(
          100,
          'VOXCHRONICLE.KankaPublisher.ProgressComplete'
        );
      });

      it('should restore original onProgress after call completes', async () => {
        const constructorProgress = vi.fn();
        const callProgress = vi.fn();
        const p = new KankaPublisher(mockKankaService, mockExporter, {
          onProgress: constructorProgress
        });

        await p.publishSession(createSessionData(), { onProgress: callProgress });

        // After publishSession, constructor progress should be restored
        p._reportProgress(42, 'After call');
        expect(constructorProgress).toHaveBeenCalledWith(42, 'After call');
      });

      it('should restore original onProgress even if publishSession throws', async () => {
        const constructorProgress = vi.fn();
        const callProgress = vi.fn();

        const failingService = createMockKankaService({
          createJournal: vi.fn().mockRejectedValue(new Error('Failed'))
        });

        const p = new KankaPublisher(failingService, mockExporter, {
          onProgress: constructorProgress
        });

        try {
          await p.publishSession(createSessionData(), { onProgress: callProgress });
        } catch {
          // expected
        }

        // Should be restored
        p._reportProgress(99, 'Restored');
        expect(constructorProgress).toHaveBeenCalledWith(99, 'Restored');
      });

      it('should not fail when no onProgress is set', async () => {
        const p = new KankaPublisher(mockKankaService, mockExporter);
        // Should not throw
        const result = await p.publishSession(createSessionData());
        expect(result).toBeDefined();
      });
    });

    describe('options', () => {
      it('should default createEntities to true', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(result.characters.length).toBeGreaterThan(0);
      });

      it('should default uploadImages to true', async () => {
        // uploadImages defaults to true (though image upload logic isn't in this test)
        const result = await publisher.publishSession(createSessionData());
        expect(result).toBeDefined();
      });

      it('should default createChronicle to true', async () => {
        const result = await publisher.publishSession(createSessionData());
        expect(result.journal).toBeDefined();
        expect(result.journal).not.toBeNull();
      });

      it('should respect createEntities: false', async () => {
        const result = await publisher.publishSession(createSessionData(), {
          createEntities: false
        });
        expect(mockKankaService.preFetchEntities).not.toHaveBeenCalled();
      });

      it('should respect createChronicle: false', async () => {
        const result = await publisher.publishSession(createSessionData(), {
          createChronicle: false
        });
        expect(result.journal).toBeNull();
      });
    });

    describe('error handling', () => {
      it('should throw when publishing fails', async () => {
        const failingService = createMockKankaService({
          createJournal: vi.fn().mockRejectedValue(new Error('Network error'))
        });

        const p = new KankaPublisher(failingService, mockExporter);
        await expect(p.publishSession(createSessionData())).rejects.toThrow('Network error');
      });

      it('should continue creating other entities when one character fails', async () => {
        const service = createMockKankaService({
          createJournal: vi
            .fn()
            .mockResolvedValueOnce({ id: 1, name: 'Chronicle' })
            .mockRejectedValueOnce(new Error('First char failed'))
            .mockResolvedValueOnce({ id: 3, name: 'Frodo' })
        });

        const p = new KankaPublisher(service, mockExporter);
        const result = await p.publishSession(createSessionData());

        expect(result.characters).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
      });

      it('should continue creating items when location fails', async () => {
        let callCount = 0;
        const service = createMockKankaService({
          createIfNotExists: vi.fn().mockImplementation((type, data) => {
            callCount++;
            if (type === 'locations') {
              return Promise.reject(new Error('Location failed'));
            }
            return Promise.resolve({ id: 10, name: data.name, _alreadyExisted: false });
          })
        });

        const p = new KankaPublisher(service, mockExporter);
        const result = await p.publishSession(createSessionData());

        expect(result.errors.some((e) => e.type === 'location')).toBe(true);
        expect(result.items).toHaveLength(1);
      });
    });
  });

  // ── _reportProgress ─────────────────────────────────────────────────────

  describe('_reportProgress', () => {
    it('should call onProgress when set', () => {
      const onProgress = vi.fn();
      const p = new KankaPublisher(mockKankaService, null, { onProgress });
      p._reportProgress(50, 'Half done');
      expect(onProgress).toHaveBeenCalledWith(50, 'Half done');
    });

    it('should not fail when onProgress is null', () => {
      const p = new KankaPublisher(mockKankaService);
      expect(() => p._reportProgress(50, 'Test')).not.toThrow();
    });

    it('should call with empty message by default', () => {
      const onProgress = vi.fn();
      const p = new KankaPublisher(mockKankaService, null, { onProgress });
      p._reportProgress(50);
      expect(onProgress).toHaveBeenCalledWith(50, '');
    });
  });

  // ── _formatBasicChronicle ───────────────────────────────────────────────

  describe('_formatBasicChronicle (via basic publishing)', () => {
    it('should generate HTML with title', async () => {
      const p = new KankaPublisher(mockKankaService);
      await p.publishSession(createSessionData());

      const entry = mockKankaService.createJournal.mock.calls[0][0].entry;
      expect(entry).toContain('<h2>');
      expect(entry).toContain('Session 1: The Beginning');
    });

    it('should generate HTML with date', async () => {
      const p = new KankaPublisher(mockKankaService);
      await p.publishSession(createSessionData());

      const entry = mockKankaService.createJournal.mock.calls[0][0].entry;
      expect(entry).toContain('2024-01-15');
    });

    it('should include horizontal rule', async () => {
      const p = new KankaPublisher(mockKankaService);
      await p.publishSession(createSessionData());

      const entry = mockKankaService.createJournal.mock.calls[0][0].entry;
      expect(entry).toContain('<hr>');
    });

    it('should handle session data with no entities', async () => {
      const p = new KankaPublisher(mockKankaService);
      const sessionData = createSessionData({ entities: null });
      await p.publishSession(sessionData);

      const entry = mockKankaService.createJournal.mock.calls[0][0].entry;
      expect(entry).not.toContain('new entities');
    });

    it('should handle session data with zero entities', async () => {
      const p = new KankaPublisher(mockKankaService);
      const sessionData = createSessionData({
        entities: { characters: [], locations: [], items: [] }
      });
      await p.publishSession(sessionData);

      const entry = mockKankaService.createJournal.mock.calls[0][0].entry;
      expect(entry).not.toContain('new entities');
    });

    it('should show segment speaker names in basic transcript', async () => {
      const p = new KankaPublisher(mockKankaService);
      const sessionData = createSessionData({
        transcript: {
          segments: [{ speaker: 'TestSpeaker', text: 'Hello world' }]
        }
      });
      await p.publishSession(sessionData);

      const entry = mockKankaService.createJournal.mock.calls[0][0].entry;
      expect(entry).toContain('TestSpeaker');
    });

    it('should default to "Unknown" speaker when segment has no speaker', async () => {
      const p = new KankaPublisher(mockKankaService);
      const sessionData = createSessionData({
        transcript: {
          segments: [{ text: 'Mystery speech' }]
        }
      });
      await p.publishSession(sessionData);

      const entry = mockKankaService.createJournal.mock.calls[0][0].entry;
      expect(entry).toContain('Unknown');
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle session data with minimal fields', async () => {
      const minimal = { title: 'Test', date: '2024-01-01' };
      const result = await publisher.publishSession(minimal);
      expect(result.journal).toBeDefined();
    });

    it('should handle entities object with no arrays', async () => {
      const sessionData = createSessionData({ entities: {} });
      const result = await publisher.publishSession(sessionData);
      expect(result.characters).toHaveLength(0);
      expect(result.locations).toHaveLength(0);
      expect(result.items).toHaveLength(0);
    });

    it('should handle character with empty description', async () => {
      const sessionData = createSessionData({
        entities: {
          characters: [{ name: 'Silent NPC', description: '', isNPC: true }],
          locations: [],
          items: []
        }
      });

      const result = await publisher.publishSession(sessionData);
      expect(result.characters).toHaveLength(1);
    });

    it('should use empty string for character description when both profile and entity are empty', async () => {
      const sessionData = createSessionData({
        entities: {
          characters: [{ name: 'NoDesc', isNPC: true }],
          locations: [],
          items: []
        }
      });

      await publisher.publishSession(sessionData);

      const charCalls = mockKankaService.createJournal.mock.calls.filter(
        (c) => c[0].journal_id === 1
      );
      expect(charCalls[0][0].entry).toBe('');
    });

    it('should handle concurrent publishSession calls', async () => {
      const results = await Promise.all([
        publisher.publishSession(createSessionData({ title: 'Session A' })),
        publisher.publishSession(createSessionData({ title: 'Session B' }))
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].journal).toBeDefined();
      expect(results[1].journal).toBeDefined();
    });
  });

  // ── _uploadSessionImages ──────────────────────────────────────────────

  describe('_uploadSessionImages', () => {
    let uploadService;

    beforeEach(() => {
      uploadService = createMockKankaService({
        uploadJournalImage: vi
          .fn()
          .mockResolvedValue({ id: 100, image_full: 'https://kanka.io/img/100.png' })
      });
    });

    it('should upload blob images to journal', async () => {
      const p = new KankaPublisher(uploadService, mockExporter);
      const sessionData = createSessionData({
        images: [{ blob: new Blob(['img'], { type: 'image/png' }), filename: 'scene.png' }]
      });
      const result = await p.publishSession(sessionData);
      expect(uploadService.uploadJournalImage).toHaveBeenCalledTimes(1);
      expect(result.images.length).toBe(1);
    });

    it('should upload base64 images to journal', async () => {
      const p = new KankaPublisher(uploadService, mockExporter);
      const sessionData = createSessionData({
        images: [{ b64_json: btoa('fake-png-data'), filename: 'portrait.png' }]
      });
      const result = await p.publishSession(sessionData);
      expect(uploadService.uploadJournalImage).toHaveBeenCalledTimes(1);
      expect(result.images.length).toBe(1);
    });

    it('should skip images with no usable data', async () => {
      const p = new KankaPublisher(uploadService, mockExporter);
      const sessionData = createSessionData({
        images: [{ metadata: 'only' }]
      });
      const result = await p.publishSession(sessionData);
      expect(uploadService.uploadJournalImage).not.toHaveBeenCalled();
      expect(result.images.length).toBe(0);
    });

    it('should continue on individual image upload failure', async () => {
      uploadService.uploadJournalImage
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockResolvedValueOnce({ id: 101 });
      const p = new KankaPublisher(uploadService, mockExporter);
      const sessionData = createSessionData({
        images: [
          { blob: new Blob(['a'], { type: 'image/png' }) },
          { blob: new Blob(['b'], { type: 'image/png' }) }
        ]
      });
      const result = await p.publishSession(sessionData);
      expect(result.images.length).toBe(1);
      expect(result.errors.some((e) => e.type === 'image')).toBe(true);
    });

    it('should not upload images when uploadImages is false', async () => {
      const p = new KankaPublisher(uploadService, mockExporter);
      const sessionData = createSessionData({
        images: [{ blob: new Blob(['x'], { type: 'image/png' }) }]
      });
      const result = await p.publishSession(sessionData, { uploadImages: false });
      expect(uploadService.uploadJournalImage).not.toHaveBeenCalled();
    });

    it('should not upload when no journal was created', async () => {
      const p = new KankaPublisher(uploadService, mockExporter);
      const sessionData = createSessionData({
        images: [{ blob: new Blob(['x'], { type: 'image/png' }) }]
      });
      const result = await p.publishSession(sessionData, { createChronicle: false });
      expect(uploadService.uploadJournalImage).not.toHaveBeenCalled();
    });

    it('should handle URL string image sources', async () => {
      const p = new KankaPublisher(uploadService, mockExporter);
      const sessionData = createSessionData({
        images: [{ url: 'https://example.com/image.png' }]
      });
      const result = await p.publishSession(sessionData);
      expect(uploadService.uploadJournalImage).toHaveBeenCalledWith(
        1,
        'https://example.com/image.png',
        { filename: 'session-image-1.png' }
      );
    });
  });
});
