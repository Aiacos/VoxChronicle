/**
 * Relationship Extraction Unit Tests
 *
 * Tests for the EntityExtractor.extractRelationships() method with API mocking.
 * Covers relationship extraction from transcripts, confidence filtering,
 * entity validation, and error handling.
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
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import { EntityExtractor, RelationshipType } from '../../scripts/ai/EntityExtractor.mjs';
import {
  OpenAIError,
  OpenAIErrorType as _OpenAIErrorType
} from '../../scripts/ai/OpenAIClient.mjs';

/**
 * Sample RPG transcript mentioning relationships
 */
const SAMPLE_TRANSCRIPT_RELATIONSHIPS = `
GM: Welcome to the session. Gandalf the wizard arrives at the Shire.
SPEAKER_00: "Frodo, my dear friend, I have come with grave news."
SPEAKER_01: Frodo greets Gandalf warmly. They have been friends for many years.
GM: Meanwhile, in Isengard, Saruman plots against Gandalf. They were once allies, but Saruman has turned to darkness.
SPEAKER_00: "Saruman is now my enemy," Gandalf says gravely.
GM: At the Prancing Pony inn, Aragorn watches over Frodo from the shadows. He has been hired by Gandalf to protect the young hobbit.
SPEAKER_01: "Who is that mysterious ranger?" Frodo asks nervously.
GM: Sam, Frodo's loyal servant and best friend, stays close by his side.
`;

const SAMPLE_TRANSCRIPT_FAMILY = `
GM: The party meets Lady Galadriel in Lothlórien.
SPEAKER_00: "Are you not related to Celeborn?" asks Legolas.
GM: "Indeed, Celeborn is my husband," Galadriel replies. "And Arwen is our granddaughter."
SPEAKER_01: "Arwen who is in love with Aragorn?"
GM: "Yes, they are romantically involved, though it is a complicated matter."
`;

/**
 * Create sample entities for relationship extraction
 */
function createSampleEntities() {
  return [
    { name: 'Gandalf', description: 'A wise wizard', isNPC: true, role: 'wizard' },
    { name: 'Frodo', description: 'A young hobbit', isNPC: false, role: 'protagonist' },
    { name: 'Saruman', description: 'A corrupted wizard', isNPC: true, role: 'villain' },
    { name: 'Aragorn', description: 'A ranger', isNPC: true, role: 'ranger' },
    { name: 'Sam', description: "Frodo's companion", isNPC: true, role: 'companion' }
  ];
}

function createFamilyEntities() {
  return [
    { name: 'Galadriel', description: 'An elven lady', isNPC: true },
    { name: 'Celeborn', description: 'An elven lord', isNPC: true },
    { name: 'Arwen', description: 'An elven princess', isNPC: true },
    { name: 'Aragorn', description: 'A ranger', isNPC: true }
  ];
}

/**
 * Create a mock API response for relationship extraction
 */
function createMockRelationshipResponse(options = {}) {
  return {
    relationships: options.relationships || [
      {
        sourceEntity: 'Gandalf',
        targetEntity: 'Frodo',
        relationType: 'friend',
        description: 'Gandalf and Frodo are old friends',
        confidence: 9
      },
      {
        sourceEntity: 'Saruman',
        targetEntity: 'Gandalf',
        relationType: 'enemy',
        description: 'Saruman has turned against Gandalf',
        confidence: 10
      },
      {
        sourceEntity: 'Aragorn',
        targetEntity: 'Frodo',
        relationType: 'ally',
        description: 'Aragorn protects Frodo',
        confidence: 7
      },
      {
        sourceEntity: 'Sam',
        targetEntity: 'Frodo',
        relationType: 'employee',
        description: 'Sam serves Frodo loyally',
        confidence: 8
      }
    ],
    summary: options.summary || 'Found 4 relationships between characters'
  };
}

describe('EntityExtractor - Relationship Extraction', () => {
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
  // extractRelationships Tests
  // ============================================================================

  describe('extractRelationships', () => {
    it('should extract relationships from transcript', async () => {
      const entities = createSampleEntities();
      const mockResponse = createMockRelationshipResponse();

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

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verify structure of first relationship
      const firstRelationship = result[0];
      expect(firstRelationship).toHaveProperty('id');
      expect(firstRelationship).toHaveProperty('sourceEntity');
      expect(firstRelationship).toHaveProperty('targetEntity');
      expect(firstRelationship).toHaveProperty('relationType');
      expect(firstRelationship).toHaveProperty('description');
      expect(firstRelationship).toHaveProperty('confidence');
    });

    it('should handle multiple relationships', async () => {
      const entities = createSampleEntities();
      const mockResponse = createMockRelationshipResponse();

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

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      expect(result.length).toBe(4);

      // Check each relationship has valid type
      result.forEach((rel) => {
        const validTypes = Object.values(RelationshipType);
        expect(validTypes).toContain(rel.relationType);
      });
    });

    it('should validate relationship types', async () => {
      const entities = createSampleEntities();

      // Mock response with invalid relationship type
      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'invalid_type',
            description: 'Test',
            confidence: 8
          },
          {
            sourceEntity: 'Sam',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Valid relationship',
            confidence: 9
          }
        ],
        summary: 'Test relationships'
      };

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

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      // Invalid type should be converted to UNKNOWN
      expect(result[0].relationType).toBe(RelationshipType.UNKNOWN);
      // Valid type should remain unchanged
      expect(result[1].relationType).toBe(RelationshipType.FRIEND);
    });

    it('should filter by confidence threshold', async () => {
      const entities = createSampleEntities();

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'High confidence',
            confidence: 9
          },
          {
            sourceEntity: 'Aragorn',
            targetEntity: 'Frodo',
            relationType: 'ally',
            description: 'Medium confidence',
            confidence: 5
          },
          {
            sourceEntity: 'Sam',
            targetEntity: 'Frodo',
            relationType: 'employee',
            description: 'Low confidence',
            confidence: 3
          }
        ],
        summary: 'Mixed confidence relationships'
      };

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

      // Extract with confidence threshold of 5
      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities,
        { minConfidence: 5 }
      );

      // Should only include relationships with confidence >= 5
      expect(result.length).toBe(2);
      expect(result.every((r) => r.confidence >= 5)).toBe(true);
    });

    it('should filter out entities not in the provided list', async () => {
      const entities = [
        { name: 'Gandalf', description: 'A wizard' },
        { name: 'Frodo', description: 'A hobbit' }
        // Note: Aragorn and Sam are not in this list
      ];

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Valid',
            confidence: 9
          },
          {
            sourceEntity: 'Aragorn',
            targetEntity: 'Frodo',
            relationType: 'ally',
            description: 'Invalid - Aragorn not in list',
            confidence: 8
          },
          {
            sourceEntity: 'Sam',
            targetEntity: 'Frodo',
            relationType: 'employee',
            description: 'Invalid - Sam not in list',
            confidence: 7
          }
        ],
        summary: 'Test relationships'
      };

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

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      // Should only include the Gandalf-Frodo relationship
      expect(result.length).toBe(1);
      expect(result[0].sourceEntity).toBe('Gandalf');
      expect(result[0].targetEntity).toBe('Frodo');
    });

    it('should filter out self-relationships', async () => {
      const entities = createSampleEntities();

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Valid',
            confidence: 9
          },
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Gandalf',
            relationType: 'unknown',
            description: 'Self-relationship',
            confidence: 5
          }
        ],
        summary: 'Test with self-relationship'
      };

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

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      // Should filter out the self-relationship
      expect(result.length).toBe(1);
      expect(result[0].sourceEntity).not.toBe(result[0].targetEntity);
    });

    it('should handle family and romantic relationships', async () => {
      const entities = createFamilyEntities();

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Galadriel',
            targetEntity: 'Celeborn',
            relationType: 'family',
            description: 'Married couple',
            confidence: 10
          },
          {
            sourceEntity: 'Galadriel',
            targetEntity: 'Arwen',
            relationType: 'family',
            description: 'Grandmother',
            confidence: 10
          },
          {
            sourceEntity: 'Arwen',
            targetEntity: 'Aragorn',
            relationType: 'romantic',
            description: 'In love',
            confidence: 9
          }
        ],
        summary: 'Family relationships'
      };

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

      const result = await extractor.extractRelationships(SAMPLE_TRANSCRIPT_FAMILY, entities);

      expect(result.length).toBe(3);

      // Verify family relationships
      const familyRels = result.filter((r) => r.relationType === RelationshipType.FAMILY);
      expect(familyRels.length).toBe(2);

      // Verify romantic relationship
      const romanticRels = result.filter((r) => r.relationType === RelationshipType.ROMANTIC);
      expect(romanticRels.length).toBe(1);
      expect(romanticRels[0].sourceEntity).toBe('Arwen');
      expect(romanticRels[0].targetEntity).toBe('Aragorn');
    });

    it('should handle all relationship types', async () => {
      const entities = [
        { name: 'Entity1' },
        { name: 'Entity2' },
        { name: 'Entity3' },
        { name: 'Entity4' },
        { name: 'Entity5' },
        { name: 'Entity6' },
        { name: 'Entity7' },
        { name: 'Entity8' },
        { name: 'Entity9' },
        { name: 'Entity10' }
      ];

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Entity1',
            targetEntity: 'Entity2',
            relationType: RelationshipType.ALLY,
            description: 'Allies',
            confidence: 8
          },
          {
            sourceEntity: 'Entity2',
            targetEntity: 'Entity3',
            relationType: RelationshipType.ENEMY,
            description: 'Enemies',
            confidence: 9
          },
          {
            sourceEntity: 'Entity3',
            targetEntity: 'Entity4',
            relationType: RelationshipType.FAMILY,
            description: 'Family',
            confidence: 10
          },
          {
            sourceEntity: 'Entity4',
            targetEntity: 'Entity5',
            relationType: RelationshipType.EMPLOYER,
            description: 'Employer',
            confidence: 7
          },
          {
            sourceEntity: 'Entity5',
            targetEntity: 'Entity6',
            relationType: RelationshipType.EMPLOYEE,
            description: 'Employee',
            confidence: 7
          },
          {
            sourceEntity: 'Entity6',
            targetEntity: 'Entity7',
            relationType: RelationshipType.ROMANTIC,
            description: 'Romantic',
            confidence: 8
          },
          {
            sourceEntity: 'Entity7',
            targetEntity: 'Entity8',
            relationType: RelationshipType.FRIEND,
            description: 'Friends',
            confidence: 9
          },
          {
            sourceEntity: 'Entity8',
            targetEntity: 'Entity9',
            relationType: RelationshipType.RIVAL,
            description: 'Rivals',
            confidence: 6
          },
          {
            sourceEntity: 'Entity9',
            targetEntity: 'Entity10',
            relationType: RelationshipType.NEUTRAL,
            description: 'Neutral',
            confidence: 5
          },
          {
            sourceEntity: 'Entity10',
            targetEntity: 'Entity1',
            relationType: RelationshipType.UNKNOWN,
            description: 'Unknown',
            confidence: 5
          }
        ],
        summary: 'All relationship types'
      };

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

      const result = await extractor.extractRelationships('Test transcript', entities);

      expect(result.length).toBe(10);

      // Verify all relationship types are present
      const types = result.map((r) => r.relationType);
      expect(types).toContain(RelationshipType.ALLY);
      expect(types).toContain(RelationshipType.ENEMY);
      expect(types).toContain(RelationshipType.FAMILY);
      expect(types).toContain(RelationshipType.EMPLOYER);
      expect(types).toContain(RelationshipType.EMPLOYEE);
      expect(types).toContain(RelationshipType.ROMANTIC);
      expect(types).toContain(RelationshipType.FRIEND);
      expect(types).toContain(RelationshipType.RIVAL);
      expect(types).toContain(RelationshipType.NEUTRAL);
      expect(types).toContain(RelationshipType.UNKNOWN);
    });

    it('should normalize confidence scores to 1-10 range', async () => {
      const entities = createSampleEntities();

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Test',
            confidence: 15
          }, // Too high
          {
            sourceEntity: 'Sam',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Test',
            confidence: -5
          }, // Too low
          {
            sourceEntity: 'Aragorn',
            targetEntity: 'Gandalf',
            relationType: 'ally',
            description: 'Test',
            confidence: 7
          } // Valid
        ],
        summary: 'Test normalization'
      };

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

      // Use minConfidence: 1 to see all normalized values
      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities,
        { minConfidence: 1 }
      );

      // All confidence scores should be in 1-10 range
      result.forEach((rel) => {
        expect(rel.confidence).toBeGreaterThanOrEqual(1);
        expect(rel.confidence).toBeLessThanOrEqual(10);
      });

      // Verify normalization
      expect(result[0].confidence).toBe(10); // Clamped from 15
      expect(result[1].confidence).toBe(1); // Clamped from -5
      expect(result[2].confidence).toBe(7); // Unchanged
    });

    it('should assign unique IDs to relationships', async () => {
      const entities = createSampleEntities();
      const mockResponse = createMockRelationshipResponse();

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

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      const ids = result.map((r) => r.id);

      // All IDs should be unique
      expect(new Set(ids).size).toBe(ids.length);

      // IDs should follow the pattern "relationship-N"
      ids.forEach((id) => {
        expect(id).toMatch(/^relationship-\d+$/);
      });
    });

    it('should handle case-insensitive entity matching', async () => {
      const entities = [
        { name: 'gandalf' }, // lowercase
        { name: 'FRODO' } // uppercase
      ];

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Mixed case',
            confidence: 9
          },
          {
            sourceEntity: 'GANDALF',
            targetEntity: 'frodo',
            relationType: 'ally',
            description: 'Different case',
            confidence: 8
          }
        ],
        summary: 'Case test'
      };

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

      const result = await extractor.extractRelationships('Test', entities);

      // Both relationships should be included (case-insensitive matching)
      expect(result.length).toBe(2);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases', () => {
    it('should return empty array when no entities provided', async () => {
      const result = await extractor.extractRelationships(SAMPLE_TRANSCRIPT_RELATIONSHIPS, []);

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty array when relationship array is missing', async () => {
      const entities = createSampleEntities();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({ summary: 'No relationships' })
                }
              }
            ]
          })
      });

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      expect(result).toEqual([]);
    });

    it('should handle empty relationships array', async () => {
      const entities = createSampleEntities();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({ relationships: [], summary: 'No relationships found' })
                }
              }
            ]
          })
      });

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      expect(result).toEqual([]);
    });

    it('should filter out relationships with missing required fields', async () => {
      const entities = createSampleEntities();

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Valid',
            confidence: 9
          },
          {
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Missing source',
            confidence: 8
          },
          {
            sourceEntity: 'Gandalf',
            relationType: 'friend',
            description: 'Missing target',
            confidence: 8
          },
          {
            sourceEntity: 'Sam',
            targetEntity: 'Frodo',
            relationType: 'employee',
            description: 'Valid',
            confidence: 7
          }
        ],
        summary: 'Test missing fields'
      };

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

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      // Should only include the valid relationships
      expect(result.length).toBe(2);
    });

    it('should use default confidence of 5 when missing', async () => {
      const entities = createSampleEntities();

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Missing confidence'
          }
        ],
        summary: 'Test default confidence'
      };

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

      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      expect(result[0].confidence).toBe(5);
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('error handling', () => {
    it('should throw error for invalid transcript', async () => {
      const entities = createSampleEntities();

      await expect(extractor.extractRelationships(null, entities)).rejects.toThrow(OpenAIError);

      await expect(extractor.extractRelationships(123, entities)).rejects.toThrow(OpenAIError);

      await expect(extractor.extractRelationships('', entities)).rejects.toThrow(OpenAIError);
    });

    it('should throw error for invalid entities parameter', async () => {
      await expect(
        extractor.extractRelationships(SAMPLE_TRANSCRIPT_RELATIONSHIPS, null)
      ).rejects.toThrow(OpenAIError);

      await expect(
        extractor.extractRelationships(SAMPLE_TRANSCRIPT_RELATIONSHIPS, 'not-an-array')
      ).rejects.toThrow(OpenAIError);

      await expect(
        extractor.extractRelationships(SAMPLE_TRANSCRIPT_RELATIONSHIPS, { notArray: true })
      ).rejects.toThrow(OpenAIError);
    });

    it('should handle JSON parse errors', async () => {
      const entities = createSampleEntities();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: 'This is not valid JSON'
                }
              }
            ]
          })
      });

      await expect(
        extractor.extractRelationships(SAMPLE_TRANSCRIPT_RELATIONSHIPS, entities)
      ).rejects.toThrow(OpenAIError);
    });

    it('should handle API errors', async () => {
      const entities = createSampleEntities();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        extractor.extractRelationships(SAMPLE_TRANSCRIPT_RELATIONSHIPS, entities)
      ).rejects.toThrow();
    });

    it('should handle HTTP error responses', async () => {
      const entities = createSampleEntities();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: { message: 'Internal server error' }
          })
      });

      await expect(
        extractor.extractRelationships(SAMPLE_TRANSCRIPT_RELATIONSHIPS, entities)
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Integration with Options
  // ============================================================================

  describe('options handling', () => {
    it('should respect campaign context option', async () => {
      const entities = createSampleEntities();
      const mockResponse = createMockRelationshipResponse();

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

      await extractor.extractRelationships(SAMPLE_TRANSCRIPT_RELATIONSHIPS, entities, {
        campaignContext: 'Lord of the Rings campaign'
      });

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      // System prompt should include campaign context
      expect(requestBody.messages[0].content).toContain('Lord of the Rings campaign');
    });

    it('should use default minConfidence of 5', async () => {
      const entities = createSampleEntities();

      const mockResponse = {
        relationships: [
          {
            sourceEntity: 'Gandalf',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'High',
            confidence: 9
          },
          {
            sourceEntity: 'Sam',
            targetEntity: 'Frodo',
            relationType: 'friend',
            description: 'Low',
            confidence: 4
          }
        ],
        summary: 'Test'
      };

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

      // Don't specify minConfidence, should use default of 5
      const result = await extractor.extractRelationships(
        SAMPLE_TRANSCRIPT_RELATIONSHIPS,
        entities
      );

      // Should only include relationship with confidence >= 5
      expect(result.length).toBe(1);
      expect(result[0].confidence).toBe(9);
    });
  });
});
