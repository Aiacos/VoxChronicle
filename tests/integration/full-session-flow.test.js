/**
 * Full Session Flow Integration Tests
 *
 * Complete end-to-end integration tests for the entire VoxChronicle workflow.
 * Tests the full orchestration from audio recording through transcription, entity extraction,
 * image generation, and Kanka publication in a single cohesive flow.
 *
 * This differs from other integration tests by testing the COMPLETE workflow as a user
 * would experience it, ensuring all services work together seamlessly.
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

// Mock AudioUtils
vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: {
    isValidAudioBlob: vi.fn(() => true),
    getBlobSizeMB: vi.fn((blob) => blob.size / (1024 * 1024)),
    blobToFile: vi.fn((blob, name) => new File([blob], `${name}.webm`, { type: blob.type })),
    estimateDuration: vi.fn((blob) => Math.round(blob.size / 16000)),
    getRecorderOptions: vi.fn(() => ({ mimeType: 'audio/webm' })),
    createAudioBlob: vi.fn((chunks, mimeType) => new Blob(chunks, { type: mimeType })),
    formatDuration: vi.fn((seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`)
  },
  MAX_TRANSCRIPTION_SIZE: 25 * 1024 * 1024
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
    sanitizeObject: vi.fn((obj) => obj),
    sanitizeUrl: vi.fn((url) => url),
    sanitizeMessage: vi.fn((msg) => msg),
    sanitizeString: vi.fn((str) => str)
  }
}));

// Mock HtmlUtils
vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  escapeHtml: vi.fn((str) => str),
  stripHtml: vi.fn((str) => str),
  markdownToHtml: vi.fn((str) => str)
}));

// Mock AudioChunker
vi.mock('../../scripts/audio/AudioChunker.mjs', () => {
  class MockAudioChunker {
    needsChunking() {
      return false;
    }

    async splitIfNeeded(blob) {
      return [blob];
    }

    getChunkingInfo(blob) {
      return {
        totalSize: blob.size,
        totalSizeMB: blob.size / (1024 * 1024),
        needsChunking: false,
        estimatedChunkCount: 1
      };
    }
  }

  return {
    AudioChunker: MockAudioChunker,
    default: MockAudioChunker
  };
});

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

// Import after mocks are set up
import { SessionOrchestrator, SessionState } from '../../scripts/orchestration/SessionOrchestrator.mjs';

/**
 * Create a mock audio blob for testing
 */
function createMockAudioBlob(size = 10240, type = 'audio/webm') {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type });
}

/**
 * Create a mock MediaStream
 */
function createMockMediaStream() {
  const audioTrack = {
    kind: 'audio',
    id: 'audio-track-1',
    label: 'Microphone',
    enabled: true,
    stop: vi.fn()
  };

  return {
    getTracks: vi.fn(() => [audioTrack]),
    getAudioTracks: vi.fn(() => [audioTrack]),
    getVideoTracks: vi.fn(() => [])
  };
}

/**
 * Create a mock MediaRecorder
 */
class MockMediaRecorder {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.mimeType = options?.mimeType || 'audio/webm';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
  }

  start(timeslice) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }

  stop() {
    this.state = 'inactive';
    // Simulate data available
    if (this.ondataavailable) {
      const mockData = createMockAudioBlob(10240);
      this.ondataavailable({ data: mockData });
    }
    // Trigger stop event
    if (this.onstop) {
      setTimeout(() => this.onstop(), 0);
    }
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  static isTypeSupported(mimeType) {
    return mimeType.includes('audio/webm');
  }
}

/**
 * Create a mock Headers object for fetch responses
 */
function createMockHeaders() {
  const headers = new Map();
  headers.set('content-type', 'application/json');
  return {
    get: (name) => headers.get(name.toLowerCase()) || null,
    has: (name) => headers.has(name.toLowerCase()),
    set: (name, value) => headers.set(name.toLowerCase(), value),
    forEach: (callback) => headers.forEach((value, key) => callback(value, key))
  };
}

/**
 * Create complete mock API responses for all services
 */
function createMockApiResponses() {
  return {
    transcription: {
      text: 'The heroes ventured into the ancient ruins of Rivendell. There they met Gandalf the Grey, a wise wizard who carried a magical staff. He warned them about the dragon Smaug who guards the legendary Sword of Fire in his lair.',
      segments: [
        {
          speaker: 'SPEAKER_00',
          text: 'The heroes ventured into the ancient ruins of Rivendell.',
          start: 0,
          end: 4.5
        },
        {
          speaker: 'SPEAKER_01',
          text: 'There they met Gandalf the Grey, a wise wizard who carried a magical staff.',
          start: 4.5,
          end: 10.0
        },
        {
          speaker: 'SPEAKER_00',
          text: 'He warned them about the dragon Smaug who guards the legendary Sword of Fire in his lair.',
          start: 10.0,
          end: 16.5
        }
      ],
      language: 'en',
      duration: 16.5
    },
    entityExtraction: {
      characters: [
        {
          name: 'Gandalf the Grey',
          type: 'character',
          description: 'A wise wizard with a grey cloak and staff',
          tags: ['wizard', 'npc'],
          isNPC: true
        },
        {
          name: 'Smaug',
          type: 'character',
          description: 'A fearsome dragon who guards treasure',
          tags: ['dragon', 'npc', 'boss'],
          isNPC: true
        }
      ],
      locations: [
        {
          name: 'Rivendell',
          type: 'location',
          description: 'Ancient elven ruins with mystical properties',
          tags: ['ruins', 'city']
        },
        {
          name: 'Dragon\'s Lair',
          type: 'location',
          description: 'Dark cavern where Smaug dwells',
          tags: ['dungeon', 'cave']
        }
      ],
      items: [
        {
          name: 'Magical Staff',
          type: 'item',
          description: 'Gandalf\'s enchanted staff of power',
          tags: ['weapon', 'magical']
        },
        {
          name: 'Sword of Fire',
          type: 'item',
          description: 'Legendary blade with flames',
          tags: ['weapon', 'legendary', 'fire']
        }
      ],
      moments: [
        {
          id: 'moment-1',
          title: 'Arrival at Rivendell',
          description: 'Heroes discover the ancient ruins',
          timestamp: 0,
          imagePrompt: 'fantasy heroes arriving at ancient elven ruins at sunset'
        },
        {
          id: 'moment-2',
          title: 'Meeting Gandalf',
          description: 'The wizard appears before the party',
          timestamp: 4.5,
          imagePrompt: 'wise grey wizard with staff appearing before adventurers'
        }
      ]
    },
    imageGeneration: {
      data: [
        {
          url: 'https://example.com/image-arrival-rivendell.png',
          revised_prompt: 'Fantasy heroes arriving at ancient elven ruins at golden sunset'
        },
        {
          url: 'https://example.com/image-gandalf-portrait.png',
          revised_prompt: 'Portrait of wise grey wizard with long staff'
        }
      ]
    },
    kankaJournal: {
      data: {
        id: 1001,
        name: 'Session 1 - Adventure Begins',
        entry: '<h2>Session 1 - Adventure Begins</h2><p>Chronicle content...</p>',
        type: 'Session Chronicle',
        entity_id: 5001
      }
    },
    kankaCharacter: {
      data: {
        id: 2001,
        name: 'Gandalf the Grey',
        entry: '<p>A wise wizard...</p>',
        type: 'NPC',
        entity_id: 5002
      }
    },
    kankaLocation: {
      data: {
        id: 3001,
        name: 'Rivendell',
        entry: '<p>Ancient elven ruins...</p>',
        type: 'Location',
        entity_id: 5003
      }
    },
    kankaItem: {
      data: {
        id: 4001,
        name: 'Magical Staff',
        entry: '<p>Enchanted staff...</p>',
        type: 'Item',
        entity_id: 5004
      }
    },
    kankaList: {
      data: []
    },
    imageDownload: createMockAudioBlob(1024) // Reuse blob creation for image data
  };
}

describe('Full Session Flow Integration', () => {
  let mockFetch;
  let mockGetUserMedia;
  let orchestrator;
  let mockServices;
  let mockResponses;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup mock responses
    mockResponses = createMockApiResponses();

    // Mock global fetch
    mockFetch = vi.fn((url, options) => {
      // OpenAI Transcription API
      if (url.includes('/audio/transcriptions')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.transcription)
        });
      }

      // OpenAI Chat Completion API (for entity extraction)
      if (url.includes('/chat/completions')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: createMockHeaders(),
          json: () => Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify(mockResponses.entityExtraction)
                }
              }
            ]
          })
        });
      }

      // OpenAI Image Generation API
      if (url.includes('/images/generations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.imageGeneration)
        });
      }

      // Kanka API - Journal creation
      if (url.includes('/campaigns/') && url.includes('/journals') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.kankaJournal)
        });
      }

      // Kanka API - Character operations
      if (url.includes('/campaigns/') && url.includes('/characters')) {
        if (options?.method === 'POST') {
          // Create operation
          return Promise.resolve({
            ok: true,
            status: 201,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.kankaCharacter),
            text: () => Promise.resolve(JSON.stringify(mockResponses.kankaCharacter))
          });
        }
        // Default to list operation for GET or undefined method
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.kankaList),
          text: () => Promise.resolve(JSON.stringify(mockResponses.kankaList))
        });
      }

      // Kanka API - Location operations
      if (url.includes('/campaigns/') && url.includes('/locations')) {
        if (options?.method === 'POST') {
          // Create operation
          return Promise.resolve({
            ok: true,
            status: 201,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.kankaLocation),
            text: () => Promise.resolve(JSON.stringify(mockResponses.kankaLocation))
          });
        }
        // Default to list operation for GET or undefined method
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.kankaList),
          text: () => Promise.resolve(JSON.stringify(mockResponses.kankaList))
        });
      }

      // Kanka API - Item operations
      if (url.includes('/campaigns/') && url.includes('/items')) {
        if (options?.method === 'POST') {
          // Create operation
          return Promise.resolve({
            ok: true,
            status: 201,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.kankaItem),
            text: () => Promise.resolve(JSON.stringify(mockResponses.kankaItem))
          });
        }
        // Default to list operation for GET or undefined method
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.kankaList),
          text: () => Promise.resolve(JSON.stringify(mockResponses.kankaList))
        });
      }

      // Image download (for uploading to Kanka)
      if (url.includes('example.com/image-')) {
        const imageBlob = new Blob([new Uint8Array(1024).fill(0)], { type: 'image/png' });
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: createMockHeaders(),
          blob: () => Promise.resolve(imageBlob)
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

    // Mock getUserMedia
    mockGetUserMedia = vi.fn(() => Promise.resolve(createMockMediaStream()));
    global.navigator = {
      ...global.navigator,
      mediaDevices: {
        getUserMedia: mockGetUserMedia
      }
    };

    // Mock MediaRecorder
    global.MediaRecorder = MockMediaRecorder;

    // Import real services dynamically
    const { AudioRecorder } = await import('../../scripts/audio/AudioRecorder.mjs');
    const { TranscriptionService } = await import('../../scripts/ai/TranscriptionService.mjs');
    const { EntityExtractor } = await import('../../scripts/ai/EntityExtractor.mjs');
    const { ImageGenerationService } = await import('../../scripts/ai/ImageGenerationService.mjs');
    const { KankaService } = await import('../../scripts/kanka/KankaService.mjs');
    const { NarrativeExporter } = await import('../../scripts/kanka/NarrativeExporter.mjs');

    const audioRecorder = new AudioRecorder();
    const transcriptionService = new TranscriptionService('test-openai-key');
    const entityExtractor = new EntityExtractor('test-openai-key');
    const imageGenerationService = new ImageGenerationService('test-openai-key');
    const kankaService = new KankaService('test-kanka-token', '12345');
    const narrativeExporter = new NarrativeExporter();

    // Store services
    mockServices = {
      audioRecorder,
      transcriptionService,
      entityExtractor,
      imageGenerationService,
      kankaService,
      narrativeExporter
    };

    // Create orchestrator with real services
    orchestrator = new SessionOrchestrator(mockServices, {
      autoExtractEntities: true,
      autoExtractRelationships: true,
      autoGenerateImages: true,
      maxImagesPerSession: 5
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('complete end-to-end workflow', () => {
    it('should execute full workflow from recording to Kanka publication', async () => {
      // Track all state transitions
      const stateChanges = [];
      const progressUpdates = [];
      let sessionCompleted = false;

      orchestrator.setCallbacks({
        onStateChange: (newState, oldState) => {
          stateChanges.push({ from: oldState, to: newState });
        },
        onProgress: (progress) => {
          progressUpdates.push(progress);
        },
        onSessionComplete: (session) => {
          sessionCompleted = true;
        }
      });

      // STEP 1: Start recording
      await orchestrator.startSession({
        title: 'Session 1 - Adventure Begins',
        language: 'en'
      });

      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(orchestrator.isSessionActive).toBe(true);
      expect(orchestrator.currentSession).toBeDefined();
      expect(orchestrator.currentSession.title).toBe('Session 1 - Adventure Begins');

      // STEP 2: Stop recording (triggers automatic processing)
      const sessionResult = await orchestrator.stopSession();

      // Verify session completed successfully
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
      expect(sessionCompleted).toBe(true);

      // Verify audio was captured
      expect(sessionResult.audioBlob).toBeDefined();
      expect(sessionResult.audioBlob.size).toBeGreaterThan(0);

      // Verify transcription was performed
      expect(sessionResult.transcript).toBeDefined();
      expect(sessionResult.transcript.text).toContain('Rivendell');
      expect(sessionResult.transcript.text).toContain('Gandalf');
      expect(sessionResult.transcript.segments).toHaveLength(3);

      // Verify entities were extracted
      expect(sessionResult.entities).toBeDefined();
      expect(sessionResult.entities.characters).toHaveLength(2);
      expect(sessionResult.entities.characters[0].name).toBe('Gandalf the Grey');
      expect(sessionResult.entities.characters[1].name).toBe('Smaug');
      expect(sessionResult.entities.locations).toHaveLength(2);
      expect(sessionResult.entities.items).toHaveLength(2);

      // Verify salient moments were identified
      expect(sessionResult.moments).toBeDefined();
      expect(sessionResult.moments).toHaveLength(2);
      expect(sessionResult.moments[0].title).toBe('Arrival at Rivendell');
      expect(sessionResult.moments[1].title).toBe('Meeting Gandalf');

      // Verify images were generated
      expect(sessionResult.images).toBeDefined();
      expect(sessionResult.images.length).toBeGreaterThan(0);
      expect(sessionResult.images[0].success).toBe(true);
      expect(sessionResult.images[0].url).toContain('example.com/image-');

      // Verify state transitions occurred in correct order
      expect(stateChanges).toEqual(
        expect.arrayContaining([
          { from: SessionState.IDLE, to: SessionState.RECORDING },
          { from: SessionState.RECORDING, to: SessionState.PROCESSING }
        ])
      );

      // Verify progress updates were sent
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some(p => p.stage === 'transcription')).toBe(true);
      expect(progressUpdates.some(p => p.stage === 'extraction')).toBe(true);

      // STEP 3: Publish to Kanka
      const publishResult = await orchestrator.publishToKanka({
        createChronicle: true,
        createEntities: true,
        uploadImages: true
      });

      // Verify chronicle was created
      expect(publishResult.journal).toBeDefined();
      expect(publishResult.journal.id).toBe(1001);
      expect(publishResult.journal.name).toContain('Session 1');

      // Verify entities were created in Kanka
      expect(publishResult.characters).toBeDefined();
      expect(publishResult.characters.length).toBeGreaterThan(0);
      expect(publishResult.locations).toBeDefined();
      expect(publishResult.locations.length).toBeGreaterThan(0);
      expect(publishResult.items).toBeDefined();
      expect(publishResult.items.length).toBeGreaterThan(0);

      // Verify Kanka results are stored in session
      expect(orchestrator.currentSession.kankaResults).toBeDefined();
      expect(orchestrator.currentSession.chronicle).toBeDefined();
    }, 15000); // Extended timeout for full workflow

    it('should handle complete workflow with speaker mapping', async () => {
      // Start and stop recording without immediate processing
      await orchestrator.startSession({ title: 'Mapped Session' });
      await orchestrator.stopSession({ processImmediately: false });

      // Apply speaker mapping
      const speakerMap = {
        'SPEAKER_00': 'Game Master',
        'SPEAKER_01': 'Player Alice'
      };

      // Process with speaker mapping
      await orchestrator.processTranscription({ speakerMap });

      // Verify speakers were mapped
      const transcript = orchestrator.currentSession.transcript;
      expect(transcript.segments[0].speaker).toBe('Game Master');
      expect(transcript.segments[1].speaker).toBe('Player Alice');

      // Entities should still be extracted
      expect(orchestrator.currentSession.entities).toBeDefined();
    });

    it('should handle workflow with pause and resume', async () => {
      await orchestrator.startSession();
      expect(orchestrator.state).toBe(SessionState.RECORDING);

      // Pause recording
      orchestrator.pauseRecording();
      expect(orchestrator.state).toBe(SessionState.PAUSED);

      // Resume recording
      orchestrator.resumeRecording();
      expect(orchestrator.state).toBe(SessionState.RECORDING);

      // Complete session
      const result = await orchestrator.stopSession();

      expect(result.audioBlob).toBeDefined();
      expect(result.transcript).toBeDefined();
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should generate session summary with all data', async () => {
      await orchestrator.startSession({ title: 'Summary Test' });
      await orchestrator.stopSession();

      const summary = orchestrator.getSessionSummary();

      expect(summary).toBeDefined();
      expect(summary.id).toMatch(/^session-/);
      expect(summary.title).toBe('Summary Test');
      expect(summary.state).toBe(SessionState.COMPLETE);
      expect(summary.hasAudio).toBe(true);
      expect(summary.hasTranscript).toBe(true);
      expect(summary.segmentCount).toBe(3);
      expect(summary.entityCount).toBe(6); // 2 characters + 2 locations + 2 items
    });
  });

  describe('API call sequencing', () => {
    it('should make API calls in correct order', async () => {
      const apiCallOrder = [];

      mockFetch.mockImplementation((url, options) => {
        // Track call order
        if (url.includes('/audio/transcriptions')) {
          apiCallOrder.push('transcription');
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.transcription)
          });
        }
        if (url.includes('/chat/completions')) {
          apiCallOrder.push('entity-extraction');
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve({
              choices: [{ message: { content: JSON.stringify(mockResponses.entityExtraction) } }]
            })
          });
        }
        if (url.includes('/images/generations')) {
          apiCallOrder.push('image-generation');
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.imageGeneration)
          });
        }
        if (url.includes('/journals') && options?.method === 'POST') {
          apiCallOrder.push('kanka-journal');
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.kankaJournal)
          });
        }
        if (url.includes('/characters') && options?.method === 'POST') {
          apiCallOrder.push('kanka-character');
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.kankaCharacter)
          });
        }
        // Default for list operations
        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.kankaList)
        });
      });

      await orchestrator.startSession();
      await orchestrator.stopSession();
      await orchestrator.publishToKanka();

      // Verify calls happened in correct order
      expect(apiCallOrder.indexOf('transcription')).toBeLessThan(apiCallOrder.indexOf('entity-extraction'));
      expect(apiCallOrder.indexOf('entity-extraction')).toBeLessThan(apiCallOrder.indexOf('image-generation'));
      expect(apiCallOrder.indexOf('image-generation')).toBeLessThan(apiCallOrder.indexOf('kanka-journal'));
    });

    it('should use correct authentication for each API', async () => {
      const authHeaders = [];

      mockFetch.mockImplementation((url, options) => {
        if (options?.headers?.Authorization) {
          authHeaders.push({
            url,
            auth: options.headers.Authorization
          });
        }

        // Return appropriate mock responses
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.transcription)
          });
        }
        if (url.includes('/chat/completions')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve({
              choices: [{ message: { content: JSON.stringify(mockResponses.entityExtraction) } }]
            })
          });
        }
        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.kankaList)
        });
      });

      await orchestrator.startSession();
      await orchestrator.stopSession();

      // Verify OpenAI calls use Bearer token
      const openaiCalls = authHeaders.filter(h => h.url.includes('api.openai.com'));
      openaiCalls.forEach(call => {
        expect(call.auth).toMatch(/^Bearer /);
      });

      // Verify Kanka calls use Bearer token
      const kankaCalls = authHeaders.filter(h => h.url.includes('kanka.io'));
      kankaCalls.forEach(call => {
        expect(call.auth).toMatch(/^Bearer /);
      });
    });
  });

  describe('error recovery and resilience', () => {
    it('should handle transcription failure gracefully', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: createMockHeaders(),
            json: () => Promise.resolve({ error: { message: 'Transcription failed' } })
          });
        }
        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve({})
        });
      });

      await orchestrator.startSession();

      await expect(orchestrator.stopSession()).rejects.toThrow();
      expect(orchestrator.state).toBe(SessionState.ERROR);
    });

    it('should continue workflow if entity extraction fails', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.transcription)
          });
        }
        if (url.includes('/chat/completions')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Service Unavailable',
            headers: createMockHeaders()
          });
        }
        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve({})
        });
      });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      // Workflow should complete despite entity extraction failure
      expect(result.transcript).toBeDefined();
      expect(result.entities).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should continue workflow if image generation fails', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.transcription)
          });
        }
        if (url.includes('/chat/completions')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve({
              choices: [{ message: { content: JSON.stringify(mockResponses.entityExtraction) } }]
            })
          });
        }
        if (url.includes('/images/generations')) {
          return Promise.reject(new Error('Image generation failed'));
        }
        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve({})
        });
      });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      // Workflow should complete despite image generation failure
      expect(result.transcript).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should handle partial Kanka publication failures', async () => {
      let characterCallCount = 0;

      mockFetch.mockImplementation((url, options) => {
        // Default responses for transcription and extraction
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.transcription)
          });
        }
        if (url.includes('/chat/completions')) {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve({
              choices: [{ message: { content: JSON.stringify(mockResponses.entityExtraction) } }]
            })
          });
        }

        // Fail on first character creation attempt
        if (url.includes('/characters') && options?.method === 'POST') {
          characterCallCount++;
          if (characterCallCount === 1) {
            return Promise.resolve({
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
              headers: createMockHeaders()
            });
          }
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.kankaCharacter)
          });
        }

        // Success for other operations
        if (url.includes('/journals') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: createMockHeaders(),
            json: () => Promise.resolve(mockResponses.kankaJournal)
          });
        }

        // Default list response
        return Promise.resolve({
          ok: true,
          headers: createMockHeaders(),
          json: () => Promise.resolve(mockResponses.kankaList)
        });
      });

      await orchestrator.startSession();
      await orchestrator.stopSession();

      const publishResult = await orchestrator.publishToKanka();

      // Chronicle should be created
      expect(publishResult.journal).toBeDefined();

      // Should have errors for failed operations
      expect(publishResult.errors).toBeDefined();
      expect(publishResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('workflow customization', () => {
    it('should respect autoExtractEntities option', async () => {
      orchestrator.setOptions({ autoExtractEntities: false });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.transcript).toBeDefined();
      expect(result.entities).toBeNull();
      expect(result.images).toHaveLength(0);
    });

    it('should respect autoGenerateImages option', async () => {
      orchestrator.setOptions({ autoGenerateImages: false });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.transcript).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.images).toHaveLength(0);
    });

    it('should respect maxImagesPerSession limit', async () => {
      orchestrator.setOptions({ maxImagesPerSession: 1 });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.images.length).toBeLessThanOrEqual(1);
    });

    it('should allow manual step-by-step processing', async () => {
      // Start and stop recording without processing
      await orchestrator.startSession();
      const stopResult = await orchestrator.stopSession({ processImmediately: false });

      expect(stopResult.audioBlob).toBeDefined();
      expect(stopResult.transcript).toBeNull();
      expect(orchestrator.state).toBe(SessionState.IDLE);

      // Process transcription manually
      await orchestrator.processTranscription();

      expect(orchestrator.currentSession.transcript).toBeDefined();
      expect(orchestrator.currentSession.entities).toBeDefined();
      expect(orchestrator.state).toBe(SessionState.COMPLETE);

      // Publish to Kanka manually
      const publishResult = await orchestrator.publishToKanka();

      expect(publishResult.journal).toBeDefined();
    });
  });

  describe('data integrity throughout workflow', () => {
    it('should maintain session ID across all steps', async () => {
      await orchestrator.startSession();
      const sessionId1 = orchestrator.currentSession.id;

      await orchestrator.stopSession({ processImmediately: false });
      const sessionId2 = orchestrator.currentSession.id;

      await orchestrator.processTranscription();
      const sessionId3 = orchestrator.currentSession.id;

      await orchestrator.publishToKanka();
      const sessionId4 = orchestrator.currentSession.id;

      expect(sessionId1).toBe(sessionId2);
      expect(sessionId2).toBe(sessionId3);
      expect(sessionId3).toBe(sessionId4);
    });

    it('should accumulate data without loss across workflow', async () => {
      await orchestrator.startSession({ title: 'Data Test' });

      // After start
      expect(orchestrator.currentSession.title).toBe('Data Test');
      expect(orchestrator.currentSession.audioBlob).toBeNull();

      await orchestrator.stopSession({ processImmediately: false });

      // After stop
      expect(orchestrator.currentSession.title).toBe('Data Test');
      expect(orchestrator.currentSession.audioBlob).toBeDefined();
      expect(orchestrator.currentSession.transcript).toBeNull();

      await orchestrator.processTranscription();

      // After transcription
      expect(orchestrator.currentSession.title).toBe('Data Test');
      expect(orchestrator.currentSession.audioBlob).toBeDefined();
      expect(orchestrator.currentSession.transcript).toBeDefined();
      expect(orchestrator.currentSession.entities).toBeDefined();

      await orchestrator.publishToKanka();

      // After publication
      expect(orchestrator.currentSession.title).toBe('Data Test');
      expect(orchestrator.currentSession.audioBlob).toBeDefined();
      expect(orchestrator.currentSession.transcript).toBeDefined();
      expect(orchestrator.currentSession.entities).toBeDefined();
      expect(orchestrator.currentSession.kankaResults).toBeDefined();
    });

    it('should track timing information throughout workflow', async () => {
      await orchestrator.startSession();
      const startTime = orchestrator.currentSession.startTime;

      expect(startTime).toBeDefined();
      expect(startTime).toBeGreaterThan(0);

      await orchestrator.stopSession();
      const endTime = orchestrator.currentSession.endTime;

      expect(endTime).toBeDefined();
      expect(endTime).toBeGreaterThan(startTime);
    });
  });
});
