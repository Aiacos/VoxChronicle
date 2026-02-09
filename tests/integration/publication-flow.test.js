/**
 * Publication Flow Integration Tests
 *
 * End-to-end integration tests for the complete Kanka publication workflow.
 * Tests the interaction between SessionOrchestrator, KankaService, NarrativeExporter,
 * and EntityExtractor through real-world publishing scenarios including entity creation,
 * image uploads, and chronicle publishing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing services
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

// Mock RateLimiter
vi.mock('../../scripts/utils/RateLimiter.mjs', () => ({
  RateLimiter: {
    fromPreset: () => ({
      executeWithRetry: vi.fn((fn) => fn()),
      pause: vi.fn(),
      reset: vi.fn(),
      getStats: vi.fn(() => ({
        totalRequests: 0,
        rateLimitHits: 0,
        retries: 0
      }))
    })
  }
}));

// Mock SensitiveDataFilter
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeObject: vi.fn((obj) => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj !== 'object') return obj;
      // Return a safe copy to avoid issues with special object types
      try {
        return JSON.parse(JSON.stringify(obj));
      } catch {
        return obj;
      }
    }),
    sanitizeUrl: vi.fn((url) => url),
    sanitizeMessage: vi.fn((msg) => msg),
    sanitizeString: vi.fn((str) => (typeof str === 'string' ? str : String(str)))
  }
}));

// Mock HtmlUtils
vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  escapeHtml: vi.fn((str) => str),
  stripHtml: vi.fn((str) => str),
  markdownToHtml: vi.fn((str) => str)
}));

// Mock global game object for Foundry VTT
globalThis.game = {
  settings: {
    get: vi.fn((module, key) => {
      if (key === 'kankaCampaignId') return '12345';
      if (key === 'kankaApiToken') return 'test-kanka-token';
      if (key === 'openaiApiKey') return 'test-openai-key';
      return null;
    }),
    set: vi.fn()
  },
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => key)
  }
};

/**
 * Create mock session data for publication testing
 */
function createMockSessionData() {
  return {
    id: 'session-test-123',
    title: "Session 1 - The Dragon's Lair",
    date: '2024-01-15',
    startTime: Date.now() - 3600000,
    endTime: Date.now(),
    transcript: {
      text: "The brave adventurers entered the dragon's lair. Gandalf the wizard cast a spell of protection. They found the legendary Sword of Flames.",
      segments: [
        {
          speaker: 'Game Master',
          text: "The brave adventurers entered the dragon's lair.",
          start: 0,
          end: 3.5
        },
        {
          speaker: 'Player John',
          text: 'Gandalf the wizard cast a spell of protection.',
          start: 3.5,
          end: 7.0
        },
        {
          speaker: 'Game Master',
          text: 'They found the legendary Sword of Flames.',
          start: 7.0,
          end: 10.0
        }
      ],
      language: 'en',
      duration: 10.0
    },
    entities: {
      characters: [
        {
          name: 'Gandalf',
          type: 'character',
          description: 'A wise and powerful wizard with a long grey beard',
          tags: ['wizard', 'npc'],
          isNPC: true
        }
      ],
      locations: [
        {
          name: "Dragon's Lair",
          type: 'location',
          description: 'A dark and dangerous cavern deep in the mountains',
          tags: ['dungeon', 'cave']
        }
      ],
      items: [
        {
          name: 'Sword of Flames',
          type: 'item',
          description: 'A legendary blade that burns with eternal fire',
          tags: ['weapon', 'magical']
        }
      ]
    },
    images: [
      {
        success: true,
        url: 'https://example.com/generated-gandalf-portrait.png',
        entityType: 'character',
        meta: {
          characterName: 'Gandalf'
        }
      }
    ],
    errors: []
  };
}

/**
 * Create mock Kanka API responses
 */
function createMockKankaResponses() {
  return {
    journalCreate: {
      data: {
        id: 1001,
        name: "Session 1 - The Dragon's Lair",
        entry: '<p>Chronicle content...</p>',
        type: 'Session Chronicle',
        entity_id: 5001
      }
    },
    characterCreate: {
      data: {
        id: 2001,
        name: 'Gandalf',
        entry: '<p>A wise and powerful wizard...</p>',
        type: 'NPC',
        entity_id: 5002
      }
    },
    locationCreate: {
      data: {
        id: 3001,
        name: "Dragon's Lair",
        entry: '<p>A dark and dangerous cavern...</p>',
        type: 'Dungeon',
        entity_id: 5003
      }
    },
    itemCreate: {
      data: {
        id: 4001,
        name: 'Sword of Flames',
        entry: '<p>A legendary blade...</p>',
        type: 'Weapon',
        entity_id: 5004
      }
    },
    listEmpty: {
      data: []
    },
    imageUpload: {
      data: {
        id: 2001,
        image: 'https://kanka.io/storage/generated-image.png',
        image_full: 'https://kanka.io/storage/generated-image-full.png'
      }
    }
  };
}

/**
 * Create a mock image blob
 */
function createMockImageBlob() {
  const data = new Uint8Array(1024).fill(0);
  return new Blob([data], { type: 'image/png' });
}

/**
 * Create a mock Headers object for fetch responses
 */
function createMockHeaders() {
  const headers = new Map();
  return {
    get: (name) => headers.get(name.toLowerCase()) || null,
    has: (name) => headers.has(name.toLowerCase()),
    set: (name, value) => headers.set(name.toLowerCase(), value)
  };
}

/**
 * Create a complete mock response with all required properties
 */
function createMockResponse(options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status || 200,
    statusText: options.statusText || 'OK',
    headers: options.headers || createMockHeaders(),
    json: options.json || (() => Promise.resolve(options.data || {})),
    text: options.text || (() => Promise.resolve(JSON.stringify(options.data || {}))),
    blob: options.blob || (() => Promise.resolve(new Blob()))
  };
}

describe('Publication Flow Integration', () => {
  let mockFetch;
  let orchestrator;
  let mockResponses;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Ensure global game object is set BEFORE anything else
    if (!globalThis.game) {
      globalThis.game = {
        settings: {
          get: vi.fn((module, key) => {
            if (key === 'kankaCampaignId') return '12345';
            if (key === 'kankaApiToken') return 'test-kanka-token';
            if (key === 'openaiApiKey') return 'test-openai-key';
            return null;
          }),
          set: vi.fn()
        },
        i18n: {
          localize: vi.fn((key) => key),
          format: vi.fn((key, data) => key)
        }
      };
    }

    // Setup mock responses
    mockResponses = createMockKankaResponses();

    // Mock global fetch
    mockFetch = vi.fn((url, options) => {
      // Kanka API - Journal creation
      if (
        url.includes('/1.0/campaigns/') &&
        url.includes('/journals') &&
        options?.method === 'POST'
      ) {
        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.journalCreate)
        });
      }

      // Kanka API - Character operations
      if (url.includes('/1.0/campaigns/') && url.includes('/characters')) {
        if (url.includes('?') || options?.method === 'GET') {
          // List operation (check for duplicates)
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }
        if (options?.method === 'POST') {
          // Check if this is an image upload (has FormData body) or entity creation (has JSON body)
          if (options?.body instanceof FormData) {
            // Image upload
            return Promise.resolve({
              ok: true,
              headers: createMockHeaders(),
              json: () => Promise.resolve(mockResponses.imageUpload)
            });
          }
          // Entity creation
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.characterCreate)
          });
        }
      }

      // Kanka API - Location operations
      if (url.includes('/1.0/campaigns/') && url.includes('/locations')) {
        if (url.includes('?') || options?.method === 'GET') {
          // List operation (check for duplicates)
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }
        if (options?.method === 'POST') {
          // Create operation
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.locationCreate)
          });
        }
      }

      // Kanka API - Item operations
      if (url.includes('/1.0/campaigns/') && url.includes('/items')) {
        if (url.includes('?') || options?.method === 'GET') {
          // List operation (check for duplicates)
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }
        if (options?.method === 'POST') {
          // Create operation
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.itemCreate)
          });
        }
      }

      // Image download (from OpenAI)
      if (url.includes('example.com/generated')) {
        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          blob: () => Promise.resolve(createMockImageBlob())
        });
      }

      // Default response
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createMockHeaders(),
        json: () => Promise.resolve({ error: 'Not found' }),
        text: () => Promise.resolve(JSON.stringify({ error: 'Not found' }))
      });
    });

    global.fetch = mockFetch;

    // Import real services
    const { SessionOrchestrator } =
      await import('../../scripts/orchestration/SessionOrchestrator.mjs');
    const { KankaService } = await import('../../scripts/kanka/KankaService.mjs');
    const { NarrativeExporter } = await import('../../scripts/kanka/NarrativeExporter.mjs');

    // Create service instances
    const kankaService = new KankaService('test-kanka-token', '12345');
    const narrativeExporter = new NarrativeExporter();

    // Create orchestrator with Kanka services
    orchestrator = new SessionOrchestrator({
      kankaService,
      narrativeExporter
    });

    // Set mock session data
    orchestrator._currentSession = createMockSessionData();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('complete publication workflow', () => {
    it('should publish session with all entities to Kanka', async () => {
      const result = await orchestrator.publishToKanka();

      expect(result).toBeDefined();
      expect(result.journal).toBeDefined();
      expect(result.journal.id).toBe(1001);
      expect(result.journal.name).toContain('Session 1');

      // Verify characters were created
      expect(result.characters).toHaveLength(1);
      expect(result.characters[0].name).toBe('Gandalf');
      expect(result.characters[0].id).toBe(2001);

      // Verify locations were created
      expect(result.locations).toHaveLength(1);
      expect(result.locations[0].name).toBe("Dragon's Lair");
      expect(result.locations[0].id).toBe(3001);

      // Verify items were created
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Sword of Flames');
      expect(result.items[0].id).toBe(4001);

      // Verify no errors occurred
      expect(result.errors).toHaveLength(0);
    });

    it('should upload images for characters', async () => {
      const result = await orchestrator.publishToKanka({
        uploadImages: true
      });

      expect(result.images).toBeDefined();
      expect(result.images.length).toBeGreaterThan(0);
      expect(result.images[0].entityType).toBe('character');

      // Verify image download and upload API calls were made
      const imageFetchCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('example.com/generated')
      );
      expect(imageFetchCalls.length).toBeGreaterThan(0);

      const imageUploadCalls = mockFetch.mock.calls.filter(
        (call) =>
          call[0].includes('/1.0/campaigns/') &&
          call[0].includes('/characters/') &&
          call[1]?.body instanceof FormData
      );
      expect(imageUploadCalls.length).toBeGreaterThan(0);
    });

    it('should create chronicle journal entry', async () => {
      const result = await orchestrator.publishToKanka({
        createChronicle: true
      });

      expect(result.journal).toBeDefined();
      expect(result.journal.name).toContain('Session 1');
      expect(result.journal.type).toBe('Session Chronicle');

      // Verify journal was created with correct API call
      const journalCalls = mockFetch.mock.calls.filter(
        (call) => call[0].includes('/journals') && call[1]?.method === 'POST'
      );
      expect(journalCalls).toHaveLength(1);
    });

    it('should skip entity creation when disabled', async () => {
      const result = await orchestrator.publishToKanka({
        createEntities: false,
        createChronicle: true
      });

      expect(result.journal).toBeDefined();
      expect(result.characters).toHaveLength(0);
      expect(result.locations).toHaveLength(0);
      expect(result.items).toHaveLength(0);

      // Verify no entity creation API calls were made
      const entityCalls = mockFetch.mock.calls.filter(
        (call) =>
          (call[0].includes('/characters') ||
            call[0].includes('/locations') ||
            call[0].includes('/items')) &&
          call[1]?.method === 'POST'
      );
      expect(entityCalls).toHaveLength(0);
    });

    it('should skip chronicle creation when disabled', async () => {
      const result = await orchestrator.publishToKanka({
        createEntities: true,
        createChronicle: false
      });

      expect(result.journal).toBeNull();
      expect(result.characters).toHaveLength(1);
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);

      // Verify no journal creation API call was made
      const journalCalls = mockFetch.mock.calls.filter(
        (call) => call[0].includes('/journals') && call[1]?.method === 'POST'
      );
      expect(journalCalls).toHaveLength(0);
    });

    it('should skip image uploads when disabled', async () => {
      const result = await orchestrator.publishToKanka({
        uploadImages: false
      });

      expect(result.characters).toHaveLength(1);
      expect(result.images).toHaveLength(0);

      // Verify no image upload API calls were made
      const imageUploadCalls = mockFetch.mock.calls.filter(
        (call) => call[0].includes('/1.0/campaigns/') && call[1]?.body instanceof FormData
      );
      expect(imageUploadCalls).toHaveLength(0);
    });
  });

  describe('duplicate entity detection', () => {
    it('should detect and skip existing entities', async () => {
      // Mock duplicate detection - character already exists
      mockFetch.mockImplementation((url, options) => {
        if (url.includes('/characters') && url.includes('?')) {
          // Return existing character
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () =>
              Promise.resolve({
                data: [
                  {
                    id: 9999,
                    name: 'Gandalf',
                    entry: 'Existing character'
                  }
                ]
              })
          });
        }

        // Other entities don't exist
        if (url.includes('/locations') && url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/items') && url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        // Location creation
        if (url.includes('/locations') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.locationCreate)
          });
        }

        // Item creation
        if (url.includes('/items') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.itemCreate)
          });
        }

        // Journal creation
        if (url.includes('/journals') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.journalCreate)
          });
        }

        return Promise.resolve({
          ok: false,
          status: 404,
          headers: createMockHeaders(),
          json: () => Promise.resolve({ error: 'Not found' })
        });
      });

      const result = await orchestrator.publishToKanka();

      // Gandalf should be detected as duplicate - not created again
      expect(result.characters).toHaveLength(0);

      // Other entities should be created
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);

      // Verify no POST call was made for characters (only GET for duplicate check)
      const characterCreateCalls = mockFetch.mock.calls.filter(
        (call) => call[0].includes('/characters') && call[1]?.method === 'POST'
      );
      expect(characterCreateCalls).toHaveLength(0);
    });
  });

  describe('error handling during publication', () => {
    it('should handle Kanka API authentication errors', async () => {
      mockFetch.mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: createMockHeaders(),
          json: () =>
            Promise.resolve({
              error: 'Invalid API token'
            })
        });
      });

      await expect(orchestrator.publishToKanka()).rejects.toThrow();
    });

    it('should handle Kanka API rate limiting', async () => {
      mockFetch.mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: createMockHeaders(),
          json: () =>
            Promise.resolve({
              error: 'Rate limit exceeded'
            })
        });
      });

      await expect(orchestrator.publishToKanka()).rejects.toThrow();
    });

    it('should continue publishing despite individual entity errors', async () => {
      let callCount = 0;

      mockFetch.mockImplementation((url, options) => {
        callCount++;

        // First character creation fails
        if (url.includes('/characters') && options?.method === 'POST' && callCount === 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: createMockHeaders(),
            json: () => Promise.resolve({ error: 'Server error' })
          });
        }

        // Duplicate checks succeed
        if (url.includes('?') && (!options?.method || options?.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        // Location creation succeeds
        if (url.includes('/locations') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.locationCreate)
          });
        }

        // Item creation succeeds
        if (url.includes('/items') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.itemCreate)
          });
        }

        // Journal creation succeeds
        if (url.includes('/journals') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.journalCreate)
          });
        }

        return Promise.resolve({
          ok: false,
          status: 404,
          headers: createMockHeaders(),
          json: () => Promise.resolve({ error: 'Not found' })
        });
      });

      const result = await orchestrator.publishToKanka();

      // Character creation should have failed
      expect(result.characters).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('character');

      // But other entities should succeed
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);
      expect(result.journal).toBeDefined();
    });

    it('should handle image upload errors gracefully', async () => {
      mockFetch.mockImplementation((url, options) => {
        // Entity creation succeeds
        if (url.includes('/characters') && url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/characters') && options?.method === 'POST') {
          // Check if this is an image upload (FormData) - should fail
          if (options?.body instanceof FormData) {
            return Promise.resolve({
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
              headers: createMockHeaders(),
              json: () => Promise.resolve({ error: 'Upload failed' })
            });
          }
          // Entity creation - should succeed
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.characterCreate)
          });
        }

        if (url.includes('/locations') && url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/locations') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.locationCreate)
          });
        }

        if (url.includes('/items') && url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/items') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.itemCreate)
          });
        }

        if (url.includes('/journals') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.journalCreate)
          });
        }

        // Image download succeeds
        if (url.includes('example.com/generated')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            blob: () => Promise.resolve(createMockImageBlob())
          });
        }

        return Promise.resolve({
          ok: false,
          status: 404,
          headers: createMockHeaders(),
          json: () => Promise.resolve({ error: 'Not found' })
        });
      });

      const result = await orchestrator.publishToKanka({
        uploadImages: true
      });

      // Entity creation should succeed
      expect(result.characters).toHaveLength(1);

      // Image upload should have failed but not block publication
      expect(result.images).toHaveLength(0);

      // Overall publication should succeed
      expect(result.journal).toBeDefined();
    });

    it('should handle network errors during publication', async () => {
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(orchestrator.publishToKanka()).rejects.toThrow('Network request failed');
    });
  });

  describe('API interaction validation', () => {
    it('should make correct API calls in sequence', async () => {
      const apiCalls = [];

      mockFetch.mockImplementation((url, options) => {
        apiCalls.push({ url, method: options?.method || 'GET' });

        // Return appropriate mock responses
        if (url.includes('/characters') && url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/characters') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.characterCreate)
          });
        }

        if (url.includes('/locations') && url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/locations') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.locationCreate)
          });
        }

        if (url.includes('/items') && url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/items') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.itemCreate)
          });
        }

        if (url.includes('/journals') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.journalCreate)
          });
        }

        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve({})
        });
      });

      await orchestrator.publishToKanka();

      // Verify entities are created before journal
      const characterCalls = apiCalls.filter((c) => c.url.includes('/characters'));
      const locationCalls = apiCalls.filter((c) => c.url.includes('/locations'));
      const itemCalls = apiCalls.filter((c) => c.url.includes('/items'));
      const journalCalls = apiCalls.filter((c) => c.url.includes('/journals'));

      expect(characterCalls.length).toBeGreaterThan(0);
      expect(locationCalls.length).toBeGreaterThan(0);
      expect(itemCalls.length).toBeGreaterThan(0);
      expect(journalCalls.length).toBeGreaterThan(0);

      // Journal should be created last
      const journalIndex = apiCalls.findIndex(
        (c) => c.url.includes('/journals') && c.method === 'POST'
      );
      const lastEntityIndex = Math.max(
        apiCalls.findLastIndex((c) => c.url.includes('/characters') && c.method === 'POST'),
        apiCalls.findLastIndex((c) => c.url.includes('/locations') && c.method === 'POST'),
        apiCalls.findLastIndex((c) => c.url.includes('/items') && c.method === 'POST')
      );

      if (lastEntityIndex >= 0 && journalIndex >= 0) {
        expect(journalIndex).toBeGreaterThan(lastEntityIndex);
      }
    });

    it('should use correct authentication headers', async () => {
      const authHeaders = [];

      mockFetch.mockImplementation((url, options) => {
        if (options?.headers?.Authorization) {
          authHeaders.push({
            url,
            auth: options.headers.Authorization
          });
        }

        // Return success responses
        if (url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/journals')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.journalCreate)
          });
        }

        if (url.includes('/characters')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.characterCreate)
          });
        }

        if (url.includes('/locations')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.locationCreate)
          });
        }

        if (url.includes('/items')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.itemCreate)
          });
        }

        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve({})
        });
      });

      await orchestrator.publishToKanka();

      // Verify Kanka endpoints use Bearer token
      const kankaCalls = authHeaders.filter((h) => h.url.includes('/1.0/campaigns/'));

      expect(kankaCalls.length).toBeGreaterThan(0);
      kankaCalls.forEach((call) => {
        expect(call.auth).toMatch(/^Bearer /);
      });
    });

    it('should check for duplicates before creating entities', async () => {
      const apiCalls = [];

      mockFetch.mockImplementation((url, options) => {
        apiCalls.push({ url, method: options?.method || 'GET' });

        // Return appropriate responses
        if (url.includes('?')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.listEmpty)
          });
        }

        if (url.includes('/characters') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.characterCreate)
          });
        }

        if (url.includes('/locations') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.locationCreate)
          });
        }

        if (url.includes('/items') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.itemCreate)
          });
        }

        if (url.includes('/journals') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.journalCreate)
          });
        }

        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve({})
        });
      });

      await orchestrator.publishToKanka();

      // For each entity type, verify GET request (duplicate check) before POST (create)
      const characterGet = apiCalls.findIndex(
        (c) => c.url.includes('/characters') && c.url.includes('?')
      );
      const characterPost = apiCalls.findIndex(
        (c) => c.url.includes('/characters') && c.method === 'POST'
      );

      if (characterGet >= 0 && characterPost >= 0) {
        expect(characterGet).toBeLessThan(characterPost);
      }
    });
  });

  describe('publication with no session data', () => {
    it('should throw error when no session is active', async () => {
      orchestrator._currentSession = null;

      await expect(orchestrator.publishToKanka()).rejects.toThrow('No session data available');
    });

    it('should handle session with no entities', async () => {
      orchestrator._currentSession = {
        ...createMockSessionData(),
        entities: null
      };

      const result = await orchestrator.publishToKanka();

      expect(result.characters).toHaveLength(0);
      expect(result.locations).toHaveLength(0);
      expect(result.items).toHaveLength(0);
      expect(result.journal).toBeDefined();
    });

    it('should handle session with no transcript', async () => {
      orchestrator._currentSession = {
        ...createMockSessionData(),
        transcript: null
      };

      const result = await orchestrator.publishToKanka();

      // Should still create entities
      expect(result.characters).toHaveLength(1);
      expect(result.locations).toHaveLength(1);
      expect(result.items).toHaveLength(1);

      // Journal might have limited content
      expect(result.journal).toBeDefined();
    });

    it('should handle session with no images', async () => {
      orchestrator._currentSession = {
        ...createMockSessionData(),
        images: []
      };

      const result = await orchestrator.publishToKanka({
        uploadImages: true
      });

      expect(result.characters).toHaveLength(1);
      expect(result.images).toHaveLength(0);
    });
  });

  describe('state and progress tracking', () => {
    it('should update state during publication', async () => {
      const stateChanges = [];

      orchestrator.setCallbacks({
        onStateChange: (newState, oldState) => {
          stateChanges.push({ from: oldState, to: newState });
        }
      });

      await orchestrator.publishToKanka();

      // Verify state changed to PUBLISHING
      expect(stateChanges.some((s) => s.to === 'publishing')).toBe(true);
    });

    it('should report progress during publication', async () => {
      const progressUpdates = [];

      orchestrator.setCallbacks({
        onProgress: (progress) => {
          progressUpdates.push(progress);
        }
      });

      await orchestrator.publishToKanka();

      // Verify progress updates were sent
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some((p) => p.stage === 'publishing')).toBe(true);
    });

    it('should store publication results in session', async () => {
      const result = await orchestrator.publishToKanka();

      expect(orchestrator._currentSession.kankaResults).toBeDefined();
      expect(orchestrator._currentSession.kankaResults).toEqual(result);
    });
  });
});
