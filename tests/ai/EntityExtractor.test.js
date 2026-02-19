/**
 * Tests for EntityExtractor - AI-Powered Entity Extraction from RPG Transcripts
 *
 * Covers: exports, constructor, extractEntities, identifySalientMoments,
 * extractRelationships, extractAll, known entity management,
 * _buildExtractionSystemPrompt, _buildMomentsSystemPrompt,
 * _buildRelationshipSystemPrompt, _truncateTranscript,
 * _normalizeExtractionResult, _normalizeMoment,
 * _normalizeRelationshipResult, temperature/model settings,
 * estimateCost, static methods, error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  EntityExtractor,
  ExtractedEntityType,
  CharacterType,
  RelationshipType,
  ENTITY_EXTRACTION_TIMEOUT_MS,
  DEFAULT_MAX_MOMENTS
} from '../../scripts/ai/EntityExtractor.mjs';

// Mock Logger
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

// Mock RateLimiter
vi.mock('../../scripts/utils/RateLimiter.mjs', () => {
  class MockRateLimiter {
    constructor() {
      this.throttle = vi.fn().mockResolvedValue(undefined);
      this.executeWithRetry = vi.fn((fn) => fn());
      this.pause = vi.fn();
      this.reset = vi.fn();
      this.getStats = vi.fn().mockReturnValue({});
    }
    static fromPreset() {
      return new MockRateLimiter();
    }
  }
  return { RateLimiter: MockRateLimiter };
});

// Mock SensitiveDataFilter
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeUrl: vi.fn((url) => url),
    sanitizeString: vi.fn((s) => s),
    sanitizeObject: vi.fn((o) => o)
  }
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob())
  };
}

function mockChatResponse(content) {
  return mockResponse({
    choices: [{
      message: { content: JSON.stringify(content) }
    }]
  });
}

const SAMPLE_ENTITIES_RESPONSE = {
  characters: [
    { name: 'Gandalf', description: 'A wise wizard', isNPC: true, role: 'mentor' },
    { name: 'Frodo', description: 'A brave hobbit', isNPC: false, role: 'hero' }
  ],
  locations: [
    { name: 'Rivendell', description: 'Elven city', type: 'city' }
  ],
  items: [
    { name: 'The One Ring', description: 'A powerful artifact', type: 'artifact' }
  ],
  summary: 'Found entities from LOTR'
};

const SAMPLE_MOMENTS_RESPONSE = {
  moments: [
    {
      title: 'The Council of Elrond',
      imagePrompt: 'A grand council in an elven hall',
      context: 'When the fellowship was formed',
      dramaScore: 8
    },
    {
      title: "Gandalf's Fall",
      imagePrompt: 'A wizard falling into darkness',
      context: 'In the mines of Moria',
      dramaScore: 10
    }
  ]
};

const SAMPLE_RELATIONSHIPS_RESPONSE = {
  relationships: [
    {
      sourceEntity: 'Gandalf',
      targetEntity: 'Frodo',
      relationType: 'friend',
      description: 'Gandalf mentors Frodo',
      confidence: 9
    },
    {
      sourceEntity: 'Frodo',
      targetEntity: 'Gandalf',
      relationType: 'ally',
      description: 'Frodo trusts Gandalf',
      confidence: 8
    }
  ],
  summary: 'Key relationships found'
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntityExtractor', () => {
  let extractor;
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(mockChatResponse(SAMPLE_ENTITIES_RESPONSE));
    globalThis.fetch = fetchSpy;

    extractor = new EntityExtractor('sk-test-key', {
      retryEnabled: false,
      timeout: 5000
    });
  });

  // ── Exports ────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export EntityExtractor class', () => {
      expect(EntityExtractor).toBeDefined();
      expect(typeof EntityExtractor).toBe('function');
    });

    it('should export ExtractedEntityType enum', () => {
      expect(ExtractedEntityType.CHARACTER).toBe('character');
      expect(ExtractedEntityType.LOCATION).toBe('location');
      expect(ExtractedEntityType.ITEM).toBe('item');
    });

    it('should export CharacterType enum', () => {
      expect(CharacterType.NPC).toBe('npc');
      expect(CharacterType.PC).toBe('pc');
    });

    it('should export RelationshipType enum', () => {
      expect(RelationshipType.ALLY).toBe('ally');
      expect(RelationshipType.ENEMY).toBe('enemy');
      expect(RelationshipType.FAMILY).toBe('family');
      expect(RelationshipType.EMPLOYER).toBe('employer');
      expect(RelationshipType.EMPLOYEE).toBe('employee');
      expect(RelationshipType.ROMANTIC).toBe('romantic');
      expect(RelationshipType.FRIEND).toBe('friend');
      expect(RelationshipType.RIVAL).toBe('rival');
      expect(RelationshipType.NEUTRAL).toBe('neutral');
      expect(RelationshipType.UNKNOWN).toBe('unknown');
    });

    it('should export ENTITY_EXTRACTION_TIMEOUT_MS', () => {
      expect(ENTITY_EXTRACTION_TIMEOUT_MS).toBe(180000);
    });

    it('should export DEFAULT_MAX_MOMENTS', () => {
      expect(DEFAULT_MAX_MOMENTS).toBe(3);
    });
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create instance with API key', () => {
      expect(extractor.isConfigured).toBe(true);
    });

    it('should default model to gpt-4o', () => {
      expect(extractor._model).toBe('gpt-4o');
    });

    it('should accept custom model', () => {
      const ext = new EntityExtractor('sk-test', { model: 'gpt-4o-mini' });
      expect(ext._model).toBe('gpt-4o-mini');
    });

    it('should default extraction temperature to 0.3', () => {
      expect(extractor._extractionTemperature).toBe(0.3);
    });

    it('should accept custom extraction temperature', () => {
      const ext = new EntityExtractor('sk-test', { extractionTemperature: 0.5 });
      expect(ext._extractionTemperature).toBe(0.5);
    });

    it('should default moment temperature to 0.7', () => {
      expect(extractor._momentTemperature).toBe(0.7);
    });

    it('should accept custom moment temperature', () => {
      const ext = new EntityExtractor('sk-test', { momentTemperature: 0.9 });
      expect(ext._momentTemperature).toBe(0.9);
    });

    it('should accept initial known entities', () => {
      const ext = new EntityExtractor('sk-test', {
        knownEntities: ['Gandalf', 'Frodo']
      });
      expect(ext.getKnownEntities()).toContain('gandalf');
      expect(ext.getKnownEntities()).toContain('frodo');
    });

    it('should initialize with empty known entities', () => {
      expect(extractor.getKnownEntities()).toEqual([]);
    });
  });

  // ── extractEntities ────────────────────────────────────────────────

  describe('extractEntities', () => {
    it('should extract entities from transcript', async () => {
      const result = await extractor.extractEntities('The party met Gandalf at Rivendell.');
      expect(result.characters).toHaveLength(2);
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);
      expect(result.summary).toBe('Found entities from LOTR');
      expect(result.totalCount).toBe(4);
    });

    it('should throw on null transcript', async () => {
      await expect(extractor.extractEntities(null)).rejects.toThrow('Invalid transcript');
    });

    it('should throw on empty transcript', async () => {
      await expect(extractor.extractEntities('')).rejects.toThrow('Invalid transcript');
    });

    it('should throw on non-string transcript', async () => {
      await expect(extractor.extractEntities(123)).rejects.toThrow('Invalid transcript');
    });

    it('should include existing entities in ignore list', async () => {
      await extractor.extractEntities('test transcript', {
        existingEntities: ['Gandalf']
      });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should include known entities in ignore list', async () => {
      extractor.addKnownEntities(['Gandalf']);
      await extractor.extractEntities('test transcript');
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should handle API returning invalid JSON', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          choices: [{ message: { content: 'not valid json' } }]
        })
      );
      await expect(extractor.extractEntities('test')).rejects.toThrow('invalid JSON');
    });

    it('should handle API error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('API error'));
      await expect(extractor.extractEntities('test')).rejects.toThrow('API error');
    });

    it('should accept campaignContext option', async () => {
      await extractor.extractEntities('test', {
        campaignContext: 'A Lord of the Rings campaign'
      });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should accept includePlayerCharacters option', async () => {
      await extractor.extractEntities('test', {
        includePlayerCharacters: true
      });
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  // ── identifySalientMoments ────────────────────────────────────────

  describe('identifySalientMoments', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue(mockChatResponse(SAMPLE_MOMENTS_RESPONSE));
    });

    it('should identify salient moments', async () => {
      const moments = await extractor.identifySalientMoments('The party fought the dragon.');
      expect(moments).toHaveLength(2);
      expect(moments[0].title).toBe('The Council of Elrond');
      expect(moments[0].dramaScore).toBe(8);
    });

    it('should throw on null transcript', async () => {
      await expect(extractor.identifySalientMoments(null)).rejects.toThrow('Invalid transcript');
    });

    it('should throw on empty transcript', async () => {
      await expect(extractor.identifySalientMoments('')).rejects.toThrow('Invalid transcript');
    });

    it('should accept maxMoments option', async () => {
      const moments = await extractor.identifySalientMoments('test', { maxMoments: 1 });
      // Moments array is sliced to maxMoments
      expect(moments.length).toBeLessThanOrEqual(1);
    });

    it('should default maxMoments to DEFAULT_MAX_MOMENTS', async () => {
      await extractor.identifySalientMoments('test');
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should include moment id', async () => {
      const moments = await extractor.identifySalientMoments('test');
      expect(moments[0].id).toBe('moment-1');
      expect(moments[1].id).toBe('moment-2');
    });

    it('should handle invalid JSON response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          choices: [{ message: { content: 'not json' } }]
        })
      );
      await expect(extractor.identifySalientMoments('test')).rejects.toThrow('invalid JSON');
    });

    it('should accept style option', async () => {
      await extractor.identifySalientMoments('test', { style: 'watercolor' });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should handle API error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('API down'));
      await expect(extractor.identifySalientMoments('test')).rejects.toThrow('API down');
    });
  });

  // ── extractRelationships ──────────────────────────────────────────

  describe('extractRelationships', () => {
    const entities = [
      { name: 'Gandalf' },
      { name: 'Frodo' }
    ];

    beforeEach(() => {
      fetchSpy.mockResolvedValue(mockChatResponse(SAMPLE_RELATIONSHIPS_RESPONSE));
    });

    it('should extract relationships', async () => {
      const result = await extractor.extractRelationships('test transcript', entities);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].sourceEntity).toBe('Gandalf');
      expect(result[0].targetEntity).toBe('Frodo');
    });

    it('should throw on null transcript', async () => {
      await expect(
        extractor.extractRelationships(null, entities)
      ).rejects.toThrow('Invalid transcript');
    });

    it('should throw on null entities', async () => {
      await expect(
        extractor.extractRelationships('test', null)
      ).rejects.toThrow('Invalid entities');
    });

    it('should throw on non-array entities', async () => {
      await expect(
        extractor.extractRelationships('test', 'not array')
      ).rejects.toThrow('Invalid entities');
    });

    it('should return empty for empty entities array', async () => {
      const result = await extractor.extractRelationships('test', []);
      expect(result).toEqual([]);
    });

    it('should filter by minimum confidence', async () => {
      fetchSpy.mockResolvedValueOnce(mockChatResponse({
        relationships: [
          { sourceEntity: 'Gandalf', targetEntity: 'Frodo', relationType: 'friend', confidence: 3, description: 'low' },
          { sourceEntity: 'Gandalf', targetEntity: 'Frodo', relationType: 'ally', confidence: 8, description: 'high' }
        ]
      }));
      const result = await extractor.extractRelationships('test', entities, { minConfidence: 5 });
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(8);
    });

    it('should filter out self-relationships', async () => {
      fetchSpy.mockResolvedValueOnce(mockChatResponse({
        relationships: [
          { sourceEntity: 'Gandalf', targetEntity: 'Gandalf', relationType: 'neutral', confidence: 9, description: 'self' }
        ]
      }));
      const result = await extractor.extractRelationships('test', entities);
      expect(result).toHaveLength(0);
    });

    it('should filter out entities not in valid list', async () => {
      fetchSpy.mockResolvedValueOnce(mockChatResponse({
        relationships: [
          { sourceEntity: 'Sauron', targetEntity: 'Frodo', relationType: 'enemy', confidence: 9, description: 'evil' }
        ]
      }));
      const result = await extractor.extractRelationships('test', entities);
      expect(result).toHaveLength(0);
    });

    it('should include relationship id', async () => {
      const result = await extractor.extractRelationships('test', entities);
      expect(result[0].id).toMatch(/^relationship-/);
    });

    it('should normalize unknown relationship types to unknown', async () => {
      fetchSpy.mockResolvedValueOnce(mockChatResponse({
        relationships: [
          { sourceEntity: 'Gandalf', targetEntity: 'Frodo', relationType: 'bestie', confidence: 9, description: 'close' }
        ]
      }));
      const result = await extractor.extractRelationships('test', entities);
      expect(result[0].relationType).toBe('unknown');
    });

    it('should handle invalid JSON response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          choices: [{ message: { content: 'not json' } }]
        })
      );
      await expect(
        extractor.extractRelationships('test', entities)
      ).rejects.toThrow('invalid JSON');
    });

    it('should handle case-insensitive entity matching', async () => {
      fetchSpy.mockResolvedValueOnce(mockChatResponse({
        relationships: [
          { sourceEntity: 'gandalf', targetEntity: 'frodo', relationType: 'friend', confidence: 9, description: 'friends' }
        ]
      }));
      const result = await extractor.extractRelationships('test', entities);
      expect(result).toHaveLength(1);
    });
  });

  // ── extractAll ────────────────────────────────────────────────────

  describe('extractAll', () => {
    it('should extract both entities and moments', async () => {
      // First call returns entities, second returns moments
      fetchSpy
        .mockResolvedValueOnce(mockChatResponse(SAMPLE_ENTITIES_RESPONSE))
        .mockResolvedValueOnce(mockChatResponse(SAMPLE_MOMENTS_RESPONSE));

      const result = await extractor.extractAll('test transcript');
      expect(result.characters).toBeDefined();
      expect(result.locations).toBeDefined();
      expect(result.items).toBeDefined();
      expect(result.moments).toBeDefined();
    });

    it('should propagate errors', async () => {
      fetchSpy.mockRejectedValue(new Error('API error'));
      await expect(extractor.extractAll('test')).rejects.toThrow();
    });
  });

  // ── Known entity management ────────────────────────────────────────

  describe('known entity management', () => {
    it('should add single known entity', () => {
      extractor.addKnownEntities('Gandalf');
      expect(extractor.getKnownEntities()).toContain('gandalf');
    });

    it('should add multiple known entities', () => {
      extractor.addKnownEntities(['Gandalf', 'Frodo']);
      expect(extractor.getKnownEntities()).toHaveLength(2);
    });

    it('should store entities lowercase', () => {
      extractor.addKnownEntities('GANDALF');
      expect(extractor.getKnownEntities()).toContain('gandalf');
    });

    it('should ignore null/empty entries', () => {
      extractor.addKnownEntities([null, '', 'Gandalf']);
      expect(extractor.getKnownEntities()).toHaveLength(1);
    });

    it('should ignore non-string entries', () => {
      extractor.addKnownEntities([123, 'Gandalf']);
      expect(extractor.getKnownEntities()).toHaveLength(1);
    });

    it('should remove known entity', () => {
      extractor.addKnownEntities('Gandalf');
      extractor.removeKnownEntity('Gandalf');
      expect(extractor.getKnownEntities()).not.toContain('gandalf');
    });

    it('should handle removing non-existent entity', () => {
      extractor.removeKnownEntity('NonExistent');
      expect(extractor.getKnownEntities()).toEqual([]);
    });

    it('should handle removing null', () => {
      extractor.removeKnownEntity(null);
      expect(extractor.getKnownEntities()).toEqual([]);
    });

    it('should clear all known entities', () => {
      extractor.addKnownEntities(['Gandalf', 'Frodo']);
      extractor.clearKnownEntities();
      expect(extractor.getKnownEntities()).toEqual([]);
    });

    it('should deduplicate known entities', () => {
      extractor.addKnownEntities(['Gandalf', 'gandalf', 'GANDALF']);
      expect(extractor.getKnownEntities()).toHaveLength(1);
    });
  });

  // ── System prompts ─────────────────────────────────────────────────

  describe('system prompts', () => {
    it('should build extraction prompt with ignore list', () => {
      const prompt = extractor._buildExtractionSystemPrompt(['Gandalf']);
      expect(prompt).toContain('Gandalf');
      expect(prompt).toContain('Ignore entities');
    });

    it('should build extraction prompt without ignore list', () => {
      const prompt = extractor._buildExtractionSystemPrompt([]);
      expect(prompt).not.toContain('Ignore entities');
    });

    it('should include PC instructions when includePlayerCharacters is true', () => {
      const prompt = extractor._buildExtractionSystemPrompt([], {
        includePlayerCharacters: true
      });
      expect(prompt).toContain('Include both');
    });

    it('should focus on NPCs by default', () => {
      const prompt = extractor._buildExtractionSystemPrompt([], {});
      expect(prompt).toContain('non-player characters');
    });

    it('should include campaign context', () => {
      const prompt = extractor._buildExtractionSystemPrompt([], {
        campaignContext: 'Dark fantasy world'
      });
      expect(prompt).toContain('Dark fantasy world');
    });

    it('should build moments prompt with max moments', () => {
      const prompt = extractor._buildMomentsSystemPrompt(5);
      expect(prompt).toContain('5');
    });

    it('should include style in moments prompt', () => {
      const prompt = extractor._buildMomentsSystemPrompt(3, { style: 'watercolor' });
      expect(prompt).toContain('watercolor');
    });

    it('should build relationship prompt with entity names', () => {
      const prompt = extractor._buildRelationshipSystemPrompt(['Gandalf', 'Frodo']);
      expect(prompt).toContain('Gandalf');
      expect(prompt).toContain('Frodo');
    });

    it('should include campaign context in relationship prompt', () => {
      const prompt = extractor._buildRelationshipSystemPrompt([], {
        campaignContext: 'Middle-earth'
      });
      expect(prompt).toContain('Middle-earth');
    });
  });

  // ── _truncateTranscript ────────────────────────────────────────────

  describe('_truncateTranscript', () => {
    it('should not truncate short text', () => {
      const text = 'Short text';
      expect(extractor._truncateTranscript(text)).toBe(text);
    });

    it('should truncate very long text', () => {
      const text = 'A'.repeat(500000);
      const result = extractor._truncateTranscript(text);
      expect(result.length).toBeLessThanOrEqual(400000);
    });

    it('should try to truncate at sentence boundary', () => {
      const text = 'A'.repeat(399000) + '. More text here' + 'B'.repeat(2000);
      const result = extractor._truncateTranscript(text);
      expect(result.endsWith('.')).toBe(true);
    });
  });

  // ── _normalizeExtractionResult ────────────────────────────────────

  describe('_normalizeExtractionResult', () => {
    it('should normalize valid extraction result', () => {
      const result = extractor._normalizeExtractionResult(SAMPLE_ENTITIES_RESPONSE);
      expect(result.characters).toHaveLength(2);
      expect(result.characters[0].entityType).toBe('character');
      expect(result.locations[0].entityType).toBe('location');
      expect(result.items[0].entityType).toBe('item');
    });

    it('should handle missing arrays', () => {
      const result = extractor._normalizeExtractionResult({});
      expect(result.characters).toEqual([]);
      expect(result.locations).toEqual([]);
      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should filter out entities without names', () => {
      const result = extractor._normalizeExtractionResult({
        characters: [{ name: 'Valid' }, { description: 'no name' }],
        locations: [],
        items: []
      });
      expect(result.characters).toHaveLength(1);
    });

    it('should default isNPC to true', () => {
      const result = extractor._normalizeExtractionResult({
        characters: [{ name: 'Test' }],
        locations: [],
        items: []
      });
      expect(result.characters[0].isNPC).toBe(true);
    });

    it('should preserve isNPC=false', () => {
      const result = extractor._normalizeExtractionResult({
        characters: [{ name: 'Test', isNPC: false }],
        locations: [],
        items: []
      });
      expect(result.characters[0].isNPC).toBe(false);
    });

    it('should trim whitespace from names', () => {
      const result = extractor._normalizeExtractionResult({
        characters: [{ name: '  Gandalf  ' }],
        locations: [],
        items: []
      });
      expect(result.characters[0].name).toBe('Gandalf');
    });

    it('should calculate total count', () => {
      const result = extractor._normalizeExtractionResult(SAMPLE_ENTITIES_RESPONSE);
      expect(result.totalCount).toBe(4);
    });

    it('should preserve summary', () => {
      const result = extractor._normalizeExtractionResult({
        characters: [],
        locations: [],
        items: [],
        summary: 'Test summary'
      });
      expect(result.summary).toBe('Test summary');
    });

    it('should default summary to empty string', () => {
      const result = extractor._normalizeExtractionResult({});
      expect(result.summary).toBe('');
    });
  });

  // ── _normalizeMoment ───────────────────────────────────────────────

  describe('_normalizeMoment', () => {
    it('should normalize a valid moment', () => {
      const moment = extractor._normalizeMoment({
        title: 'Battle',
        imagePrompt: 'A fierce battle',
        context: 'During combat',
        dramaScore: 8
      }, 0);
      expect(moment.id).toBe('moment-1');
      expect(moment.title).toBe('Battle');
      expect(moment.dramaScore).toBe(8);
    });

    it('should default title to Moment N', () => {
      const moment = extractor._normalizeMoment({}, 2);
      expect(moment.title).toBe('Moment 3');
    });

    it('should clamp drama score to 1-10', () => {
      expect(extractor._normalizeMoment({ dramaScore: 0 }, 0).dramaScore).toBe(1);
      expect(extractor._normalizeMoment({ dramaScore: 15 }, 0).dramaScore).toBe(10);
      expect(extractor._normalizeMoment({ dramaScore: -5 }, 0).dramaScore).toBe(1);
    });

    it('should default drama score to 5 for invalid values', () => {
      expect(extractor._normalizeMoment({ dramaScore: 'high' }, 0).dramaScore).toBe(5);
      expect(extractor._normalizeMoment({}, 0).dramaScore).toBe(5);
    });

    it('should trim strings', () => {
      const moment = extractor._normalizeMoment({
        title: '  Battle  ',
        imagePrompt: '  prompt  ',
        context: '  context  '
      }, 0);
      expect(moment.title).toBe('Battle');
      expect(moment.imagePrompt).toBe('prompt');
      expect(moment.context).toBe('context');
    });
  });

  // ── _normalizeRelationshipResult ──────────────────────────────────

  describe('_normalizeRelationshipResult', () => {
    const validNames = ['Gandalf', 'Frodo'];

    it('should normalize valid relationships', () => {
      const result = extractor._normalizeRelationshipResult(
        SAMPLE_RELATIONSHIPS_RESPONSE,
        validNames
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toMatch(/^relationship-/);
    });

    it('should filter by minimum confidence', () => {
      const result = extractor._normalizeRelationshipResult(
        {
          relationships: [
            { sourceEntity: 'Gandalf', targetEntity: 'Frodo', relationType: 'friend', confidence: 3, description: 'test' }
          ]
        },
        validNames,
        { minConfidence: 5 }
      );
      expect(result).toHaveLength(0);
    });

    it('should filter out entities not in valid list', () => {
      const result = extractor._normalizeRelationshipResult(
        {
          relationships: [
            { sourceEntity: 'Sauron', targetEntity: 'Frodo', relationType: 'enemy', confidence: 9, description: 'test' }
          ]
        },
        validNames
      );
      expect(result).toHaveLength(0);
    });

    it('should filter self-relationships', () => {
      const result = extractor._normalizeRelationshipResult(
        {
          relationships: [
            { sourceEntity: 'Gandalf', targetEntity: 'Gandalf', relationType: 'neutral', confidence: 9, description: 'self' }
          ]
        },
        validNames
      );
      expect(result).toHaveLength(0);
    });

    it('should normalize unknown relationship types', () => {
      const result = extractor._normalizeRelationshipResult(
        {
          relationships: [
            { sourceEntity: 'Gandalf', targetEntity: 'Frodo', relationType: 'bestfriend', confidence: 9, description: 'test' }
          ]
        },
        validNames
      );
      expect(result[0].relationType).toBe('unknown');
    });

    it('should handle missing relationships array', () => {
      const result = extractor._normalizeRelationshipResult({}, validNames);
      expect(result).toEqual([]);
    });

    it('should handle missing required fields', () => {
      const result = extractor._normalizeRelationshipResult(
        {
          relationships: [
            { relationType: 'friend', confidence: 9 } // missing source/target
          ]
        },
        validNames
      );
      expect(result).toHaveLength(0);
    });

    it('should clamp confidence to 1-10', () => {
      const result = extractor._normalizeRelationshipResult(
        {
          relationships: [
            { sourceEntity: 'Gandalf', targetEntity: 'Frodo', relationType: 'friend', confidence: 15, description: 'test' }
          ]
        },
        validNames
      );
      expect(result[0].confidence).toBe(10);
    });

    it('should default confidence to 5 when invalid', () => {
      const result = extractor._normalizeRelationshipResult(
        {
          relationships: [
            { sourceEntity: 'Gandalf', targetEntity: 'Frodo', relationType: 'friend', confidence: 'high', description: 'test' }
          ]
        },
        validNames
      );
      expect(result[0].confidence).toBe(5);
    });
  });

  // ── Temperature settings ───────────────────────────────────────────

  describe('temperature settings', () => {
    it('should set extraction temperature', () => {
      extractor.setExtractionTemperature(0.5);
      expect(extractor._extractionTemperature).toBe(0.5);
    });

    it('should clamp extraction temperature to 0-1', () => {
      extractor.setExtractionTemperature(-0.5);
      expect(extractor._extractionTemperature).toBe(0);
      extractor.setExtractionTemperature(1.5);
      expect(extractor._extractionTemperature).toBe(1);
    });

    it('should set moment temperature', () => {
      extractor.setMomentTemperature(0.8);
      expect(extractor._momentTemperature).toBe(0.8);
    });

    it('should clamp moment temperature to 0-1', () => {
      extractor.setMomentTemperature(-1);
      expect(extractor._momentTemperature).toBe(0);
      extractor.setMomentTemperature(2);
      expect(extractor._momentTemperature).toBe(1);
    });
  });

  // ── Model settings ─────────────────────────────────────────────────

  describe('model settings', () => {
    it('should set model', () => {
      extractor.setModel('gpt-4o-mini');
      expect(extractor._model).toBe('gpt-4o-mini');
    });
  });

  // ── estimateCost ──────────────────────────────────────────────────

  describe('estimateCost', () => {
    it('should estimate cost for transcript', () => {
      const estimate = extractor.estimateCost('Hello world');
      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBe(500);
      expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
      expect(estimate.model).toBe('gpt-4o');
    });

    it('should return zero for null transcript', () => {
      const estimate = extractor.estimateCost(null);
      expect(estimate.estimatedTokens).toBe(0);
      expect(estimate.estimatedCostUSD).toBe(0);
    });

    it('should return zero for empty transcript', () => {
      const estimate = extractor.estimateCost('');
      expect(estimate.estimatedTokens).toBe(0);
      expect(estimate.estimatedCostUSD).toBe(0);
    });

    it('should scale with transcript length', () => {
      const short = extractor.estimateCost('Hello');
      const long = extractor.estimateCost('A'.repeat(10000));
      expect(long.estimatedCostUSD).toBeGreaterThan(short.estimatedCostUSD);
    });
  });

  // ── Static methods ─────────────────────────────────────────────────

  describe('static methods', () => {
    it('should return available models', () => {
      const models = EntityExtractor.getAvailableModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models).toHaveLength(3);
      const recommended = models.find(m => m.recommended);
      expect(recommended).toBeDefined();
      expect(recommended.id).toBe('gpt-4o');
    });

    it('should include descriptions for all models', () => {
      const models = EntityExtractor.getAvailableModels();
      models.forEach(m => {
        expect(m.name).toBeDefined();
        expect(m.description).toBeDefined();
      });
    });
  });
});
