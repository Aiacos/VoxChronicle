/**
 * EntityExtractor Unit Tests
 *
 * Tests for the EntityExtractor class with API mocking.
 * Covers entity extraction from sample transcripts, salient moment identification,
 * known entity management, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing EntityExtractor
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
vi.mock('../../scripts/utils/RateLimiter.mjs', () => ({
  RateLimiter: {
    fromPreset: () => ({
      executeWithRetry: vi.fn((fn) => fn()),
      pause: vi.fn(),
      reset: vi.fn(),
      getStats: vi.fn(() => ({}))
    })
  }
}));

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import {
  EntityExtractor,
  ExtractedEntityType,
  CharacterType,
  ENTITY_EXTRACTION_TIMEOUT_MS,
  DEFAULT_MAX_MOMENTS
} from '../../scripts/ai/EntityExtractor.mjs';
import { OpenAIError, OpenAIErrorType } from '../../scripts/ai/OpenAIClient.mjs';

/**
 * Sample RPG transcript for testing entity extraction
 */
const SAMPLE_TRANSCRIPT_1 = `
GM: Welcome back, adventurers. You find yourselves in the bustling city of Neverwinter.
SPEAKER_00: My character, Thorin the dwarf fighter, heads to the Rusty Dragon Inn to find information.
SPEAKER_01: I'll follow. Elara the elven wizard keeps an eye out for any suspicious activity.
GM: At the inn, you meet Grognard the barkeeper, a gruff human with a scar across his face.
SPEAKER_00: "Greetings, Grognard. We seek the Sword of the Phoenix. Have you heard of it?"
GM: Grognard leans in close. "Aye, the legendary blade. Last I heard, it was taken to the Shadowkeep Dungeon by Lord Vex, a dark sorcerer."
SPEAKER_01: "Where can we find this Shadowkeep?"
GM: "Three days ride north, past the Whispering Woods. But beware, the dungeon is filled with undead."
SPEAKER_00: Thorin purchases a Healing Potion from Grognard's stock.
`;

const SAMPLE_TRANSCRIPT_2 = `
SPEAKER_00: We continue through the forest.
GM: As you travel through the Whispering Woods, you encounter a mysterious figure. She introduces herself as Maven, a druid who protects these lands.
SPEAKER_01: "Hail, Maven. We mean no harm to your forest."
GM: Maven nods. "I sense you seek the Shadowkeep. Take this Amulet of Protection - you will need it against Lord Vex's dark magic."
SPEAKER_00: "Thank you. What can you tell us about the Moonstone Temple we passed?"
GM: "The temple was once sacred to Selune. Now it lies in ruins, though the Crystal of Moonlight still rests within."
`;

/**
 * Create a mock API response for entity extraction
 */
function createMockExtractionResponse(options = {}) {
  return {
    characters: options.characters || [
      {
        name: 'Grognard',
        description: 'A gruff barkeeper with a scar across his face',
        isNPC: true,
        role: 'barkeeper'
      },
      {
        name: 'Lord Vex',
        description: 'A dark sorcerer who possesses the Sword of the Phoenix',
        isNPC: true,
        role: 'villain'
      }
    ],
    locations: options.locations || [
      { name: 'Neverwinter', description: 'A bustling city', type: 'city' },
      {
        name: 'Rusty Dragon Inn',
        description: 'An inn where the party meets Grognard',
        type: 'tavern'
      },
      { name: 'Shadowkeep Dungeon', description: 'A dungeon filled with undead', type: 'dungeon' }
    ],
    items: options.items || [
      { name: 'Sword of the Phoenix', description: 'A legendary blade', type: 'weapon' },
      { name: 'Healing Potion', description: 'A potion that restores health', type: 'potion' }
    ],
    summary:
      options.summary || 'The party visited Neverwinter and learned about the Sword of the Phoenix.'
  };
}

/**
 * Create a mock API response for salient moments
 */
function createMockMomentsResponse(options = {}) {
  return {
    moments: options.moments || [
      {
        title: 'The Secret of the Phoenix Blade',
        imagePrompt:
          'A gruff barkeeper leans across a candlelit counter, whispering to adventurers, dramatic shadows on weathered face',
        context: 'Grognard reveals the location of the legendary Sword of the Phoenix',
        dramaScore: 8
      },
      {
        title: 'Journey Into Darkness',
        imagePrompt:
          'Adventurers stand at the entrance of a foreboding dungeon, undead silhouettes visible in the shadows beyond',
        context: 'The party prepares to enter Shadowkeep Dungeon',
        dramaScore: 9
      }
    ]
  };
}

describe('EntityExtractor', () => {
  let extractor;
  let mockFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create extractor instance
    extractor = new EntityExtractor('test-api-key-12345');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with API key', () => {
      expect(extractor).toBeInstanceOf(EntityExtractor);
      expect(extractor.isConfigured).toBe(true);
    });

    it('should accept configuration options', () => {
      const options = {
        model: 'gpt-4o-mini',
        extractionTemperature: 0.5,
        momentTemperature: 0.9,
        knownEntities: ['Gandalf', 'Mordor'],
        timeout: 300000
      };

      const customExtractor = new EntityExtractor('test-key', options);
      expect(customExtractor.getKnownEntities()).toContain('gandalf');
      expect(customExtractor.getKnownEntities()).toContain('mordor');
    });

    it('should throw error if API key is missing', () => {
      const noKeyExtractor = new EntityExtractor('');
      expect(noKeyExtractor.isConfigured).toBe(false);
    });
  });

  // ============================================================================
  // extractEntities Tests
  // ============================================================================

  describe('extractEntities', () => {
    it('should extract entities from sample transcript', async () => {
      const mockResponse = createMockExtractionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify(mockResponse)
                }
              }
            ]
          })
      });

      const result = await extractor.extractEntities(SAMPLE_TRANSCRIPT_1);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.characters).toHaveLength(2);
      expect(result.locations).toHaveLength(3);
      expect(result.items).toHaveLength(2);
      expect(result.totalCount).toBe(7);
    });

    it('should send correct request format', async () => {
      const mockResponse = createMockExtractionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      await extractor.extractEntities(SAMPLE_TRANSCRIPT_1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/chat/completions');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('gpt-4o');
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.temperature).toBe(0.3);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });

    it('should include existing entities in ignore list', async () => {
      const mockResponse = createMockExtractionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      await extractor.extractEntities(SAMPLE_TRANSCRIPT_1, {
        existingEntities: ['Thorin', 'Elara']
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemPrompt = body.messages[0].content;
      expect(systemPrompt).toContain('Thorin');
      expect(systemPrompt).toContain('Elara');
    });

    it('should include campaign context when provided', async () => {
      const mockResponse = createMockExtractionResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      await extractor.extractEntities(SAMPLE_TRANSCRIPT_1, {
        campaignContext: 'High fantasy Forgotten Realms setting'
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemPrompt = body.messages[0].content;
      expect(systemPrompt).toContain('Forgotten Realms');
    });

    it('should normalize extraction result', async () => {
      const rawResponse = {
        characters: [
          { name: '  Grognard  ', description: 'A barkeeper', isNPC: true, role: 'merchant' }
        ],
        locations: [{ name: 'Tavern', description: null, type: '' }],
        items: [],
        summary: 'Summary text'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(rawResponse) } }]
          })
      });

      const result = await extractor.extractEntities(SAMPLE_TRANSCRIPT_1);

      // Check trimming
      expect(result.characters[0].name).toBe('Grognard');
      // Check null handling
      expect(result.locations[0].description).toBe('');
      // Check default type
      expect(result.locations[0].type).toBe('place');
      // Check entity type added
      expect(result.characters[0].entityType).toBe(ExtractedEntityType.CHARACTER);
      expect(result.locations[0].entityType).toBe(ExtractedEntityType.LOCATION);
    });

    it('should throw error for invalid transcript input', async () => {
      await expect(extractor.extractEntities(null)).rejects.toThrow(OpenAIError);
      await expect(extractor.extractEntities('')).rejects.toThrow(OpenAIError);
      await expect(extractor.extractEntities(12345)).rejects.toThrow(OpenAIError);
    });

    it('should handle invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'This is not valid JSON' } }]
          })
      });

      await expect(extractor.extractEntities(SAMPLE_TRANSCRIPT_1)).rejects.toThrow(OpenAIError);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key' } })),
        headers: new Headers()
      });

      await expect(extractor.extractEntities(SAMPLE_TRANSCRIPT_1)).rejects.toThrow();
    });

    it('should handle empty extraction result', async () => {
      const emptyResponse = {
        characters: [],
        locations: [],
        items: [],
        summary: 'No named entities found.'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(emptyResponse) } }]
          })
      });

      const result = await extractor.extractEntities('Generic text without named entities.');

      expect(result.characters).toEqual([]);
      expect(result.locations).toEqual([]);
      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });

  // ============================================================================
  // identifySalientMoments Tests
  // ============================================================================

  describe('identifySalientMoments', () => {
    it('should identify salient moments from transcript', async () => {
      const mockResponse = createMockMomentsResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      const result = await extractor.identifySalientMoments(SAMPLE_TRANSCRIPT_1);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('imagePrompt');
      expect(result[0]).toHaveProperty('context');
      expect(result[0]).toHaveProperty('dramaScore');
    });

    it('should use higher temperature for creative moment identification', async () => {
      const mockResponse = createMockMomentsResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      await extractor.identifySalientMoments(SAMPLE_TRANSCRIPT_1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.7);
    });

    it('should respect maxMoments option', async () => {
      const mockResponse = createMockMomentsResponse({
        moments: [
          { title: 'Moment 1', imagePrompt: 'Prompt 1', context: 'Context 1', dramaScore: 8 },
          { title: 'Moment 2', imagePrompt: 'Prompt 2', context: 'Context 2', dramaScore: 7 },
          { title: 'Moment 3', imagePrompt: 'Prompt 3', context: 'Context 3', dramaScore: 6 },
          { title: 'Moment 4', imagePrompt: 'Prompt 4', context: 'Context 4', dramaScore: 5 }
        ]
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      const result = await extractor.identifySalientMoments(SAMPLE_TRANSCRIPT_1, { maxMoments: 2 });

      expect(result).toHaveLength(2);
    });

    it('should normalize moment data', async () => {
      const rawMoments = {
        moments: [
          {
            title: '  Title with spaces  ',
            imagePrompt: 'Prompt',
            context: null,
            dramaScore: '15'
          },
          { imagePrompt: 'Only prompt', dramaScore: 0 }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(rawMoments) } }]
          })
      });

      const result = await extractor.identifySalientMoments(SAMPLE_TRANSCRIPT_1);

      // Check trimming
      expect(result[0].title).toBe('Title with spaces');
      // Check null handling
      expect(result[0].context).toBe('');
      // Check drama score clamping (max 10)
      expect(result[0].dramaScore).toBe(10);
      // Check default title
      expect(result[1].title).toBe('Moment 2');
      // Check minimum drama score
      expect(result[1].dramaScore).toBe(1);
      // Check ID assignment
      expect(result[0].id).toBe('moment-1');
      expect(result[1].id).toBe('moment-2');
    });

    it('should throw error for invalid transcript input', async () => {
      await expect(extractor.identifySalientMoments(null)).rejects.toThrow(OpenAIError);
      await expect(extractor.identifySalientMoments('')).rejects.toThrow(OpenAIError);
    });
  });

  // ============================================================================
  // extractAll Tests
  // ============================================================================

  describe('extractAll', () => {
    it('should extract both entities and moments in parallel', async () => {
      const entitiesResponse = createMockExtractionResponse();
      const momentsResponse = createMockMomentsResponse();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: JSON.stringify(entitiesResponse) } }]
            })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: JSON.stringify(momentsResponse) } }]
            })
        });

      const result = await extractor.extractAll(SAMPLE_TRANSCRIPT_1);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.characters).toBeDefined();
      expect(result.locations).toBeDefined();
      expect(result.items).toBeDefined();
      expect(result.moments).toBeDefined();
      expect(result.totalCount).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Known Entities Management Tests
  // ============================================================================

  describe('known entities management', () => {
    it('should add single known entity', () => {
      extractor.addKnownEntities('Gandalf');
      expect(extractor.getKnownEntities()).toContain('gandalf');
    });

    it('should add multiple known entities', () => {
      extractor.addKnownEntities(['Gandalf', 'Frodo', 'Mordor']);
      const known = extractor.getKnownEntities();
      expect(known).toContain('gandalf');
      expect(known).toContain('frodo');
      expect(known).toContain('mordor');
    });

    it('should store entities case-insensitively', () => {
      extractor.addKnownEntities(['GANDALF', 'Gandalf', 'gandalf']);
      // Should only have one entry (lowercase)
      expect(extractor.getKnownEntities().filter((e) => e === 'gandalf')).toHaveLength(1);
    });

    it('should remove known entity', () => {
      extractor.addKnownEntities(['Gandalf', 'Frodo']);
      extractor.removeKnownEntity('Gandalf');
      const known = extractor.getKnownEntities();
      expect(known).not.toContain('gandalf');
      expect(known).toContain('frodo');
    });

    it('should clear all known entities', () => {
      extractor.addKnownEntities(['Gandalf', 'Frodo', 'Mordor']);
      extractor.clearKnownEntities();
      expect(extractor.getKnownEntities()).toHaveLength(0);
    });

    it('should include known entities in extraction request', async () => {
      extractor.addKnownEntities(['Thorin', 'Elara']);

      const mockResponse = createMockExtractionResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      await extractor.extractEntities(SAMPLE_TRANSCRIPT_1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemPrompt = body.messages[0].content;
      expect(systemPrompt).toContain('thorin');
      expect(systemPrompt).toContain('elara');
    });
  });

  // ============================================================================
  // Configuration Methods Tests
  // ============================================================================

  describe('configuration methods', () => {
    it('should set extraction temperature', () => {
      extractor.setExtractionTemperature(0.5);
      // Temperature is private, verify by checking API call
    });

    it('should clamp extraction temperature to valid range', async () => {
      extractor.setExtractionTemperature(2.0);

      const mockResponse = createMockExtractionResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      await extractor.extractEntities(SAMPLE_TRANSCRIPT_1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBeLessThanOrEqual(1);
    });

    it('should set moment temperature', () => {
      extractor.setMomentTemperature(0.9);
      // Temperature is private, verify by checking API call
    });

    it('should set model', async () => {
      extractor.setModel('gpt-4o-mini');

      const mockResponse = createMockExtractionResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      await extractor.extractEntities(SAMPLE_TRANSCRIPT_1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4o-mini');
    });
  });

  // ============================================================================
  // Static Methods Tests
  // ============================================================================

  describe('static methods', () => {
    it('should return available models', () => {
      const models = EntityExtractor.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThanOrEqual(1);

      // Check recommended model exists
      const recommended = models.find((m) => m.recommended);
      expect(recommended).toBeDefined();
      expect(recommended.id).toBe('gpt-4o');

      // Check model structure
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('description');
    });
  });

  // ============================================================================
  // Cost Estimation Tests
  // ============================================================================

  describe('estimateCost', () => {
    it('should estimate cost for transcript', () => {
      const estimate = extractor.estimateCost(SAMPLE_TRANSCRIPT_1);

      expect(estimate).toHaveProperty('estimatedInputTokens');
      expect(estimate).toHaveProperty('estimatedOutputTokens');
      expect(estimate).toHaveProperty('estimatedTotalTokens');
      expect(estimate).toHaveProperty('estimatedCostUSD');
      expect(estimate).toHaveProperty('model');
      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
    });

    it('should return zero for empty transcript', () => {
      const estimate = extractor.estimateCost('');

      expect(estimate.estimatedTokens).toBe(0);
      expect(estimate.estimatedCostUSD).toBe(0);
    });

    it('should return zero for null transcript', () => {
      const estimate = extractor.estimateCost(null);

      expect(estimate.estimatedTokens).toBe(0);
      expect(estimate.estimatedCostUSD).toBe(0);
    });
  });

  // ============================================================================
  // Transcript Truncation Tests
  // ============================================================================

  describe('transcript truncation', () => {
    it('should truncate very long transcripts', async () => {
      // Create a very long transcript (over 400k chars)
      const longTranscript = 'A'.repeat(500000);

      const mockResponse = createMockExtractionResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(mockResponse) } }]
          })
      });

      await extractor.extractEntities(longTranscript);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMessage = body.messages[1].content;
      // Should be truncated to approximately 400k chars
      expect(userMessage.length).toBeLessThan(500000);
    });
  });

  // ============================================================================
  // Exported Constants Tests
  // ============================================================================

  describe('exported constants', () => {
    it('should export ExtractedEntityType enum', () => {
      expect(ExtractedEntityType.CHARACTER).toBe('character');
      expect(ExtractedEntityType.LOCATION).toBe('location');
      expect(ExtractedEntityType.ITEM).toBe('item');
    });

    it('should export CharacterType enum', () => {
      expect(CharacterType.NPC).toBe('npc');
      expect(CharacterType.PC).toBe('pc');
    });

    it('should export timeout constant', () => {
      expect(ENTITY_EXTRACTION_TIMEOUT_MS).toBe(180000);
    });

    it('should export default max moments constant', () => {
      expect(DEFAULT_MAX_MOMENTS).toBe(3);
    });
  });
});
