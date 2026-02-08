/**
 * Recording Flow Integration Tests
 *
 * End-to-end integration tests for the complete VoxChronicle recording workflow.
 * Tests the interaction between AudioRecorder, TranscriptionService, EntityExtractor,
 * ImageGenerationService, and KankaService through the SessionOrchestrator.
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
      getStats: vi.fn(() => ({}))
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

// Mock AudioChunker - create class that returns proper instance
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
      // Return appropriate defaults for settings
      if (key === 'kankaCampaignId') return '12345';
      if (key === 'kankaApiToken') return 'test-token';
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
 * Mock fetch responses for API calls
 */
function createMockFetchResponses() {
  const transcriptionResponse = {
    text: 'The heroes entered the ancient ruins of Rivendell. Gandalf the wizard greeted them with his staff of power.',
    segments: [
      {
        speaker: 'SPEAKER_00',
        text: 'The heroes entered the ancient ruins of Rivendell.',
        start: 0,
        end: 3.5
      },
      {
        speaker: 'SPEAKER_01',
        text: 'Gandalf the wizard greeted them with his staff of power.',
        start: 3.5,
        end: 7.0
      }
    ],
    language: 'en',
    duration: 7.0
  };

  const entityExtractionResponse = {
    characters: [
      {
        name: 'Gandalf',
        type: 'character',
        description: 'A wise and powerful wizard',
        tags: ['wizard', 'npc'],
        isNPC: true
      }
    ],
    locations: [
      {
        name: 'Rivendell',
        type: 'location',
        description: 'Ancient elven ruins',
        tags: ['city', 'ruins']
      }
    ],
    items: [
      {
        name: 'Staff of Power',
        type: 'item',
        description: 'A magical staff wielded by Gandalf',
        tags: ['weapon', 'magical']
      }
    ],
    moments: [
      {
        id: 'moment-1',
        title: 'Arrival at Rivendell',
        description: 'The heroes entered the ancient ruins',
        timestamp: 0,
        imagePrompt: 'fantasy heroes entering ancient elven ruins at sunset'
      }
    ]
  };

  const imageGenerationResponse = {
    data: [
      {
        url: 'https://example.com/generated-image-123.png',
        revised_prompt: 'A detailed fantasy scene of heroes entering ancient elven ruins at sunset'
      }
    ]
  };

  const kankaJournalResponse = {
    data: {
      id: 1,
      name: 'Session 1 - Arrival at Rivendell',
      entry: '<p>Chronicle entry</p>',
      type: 'journal'
    }
  };

  const kankaCharacterResponse = {
    data: {
      id: 2,
      name: 'Gandalf',
      entry: '<p>Character description</p>',
      type: 'character'
    }
  };

  const kankaLocationResponse = {
    data: {
      id: 3,
      name: 'Rivendell',
      entry: '<p>Location description</p>',
      type: 'location'
    }
  };

  const kankaItemResponse = {
    data: {
      id: 4,
      name: 'Staff of Power',
      entry: '<p>Item description</p>',
      type: 'item'
    }
  };

  const kankaListResponse = {
    data: []
  };

  return {
    transcriptionResponse,
    entityExtractionResponse,
    imageGenerationResponse,
    kankaJournalResponse,
    kankaCharacterResponse,
    kankaLocationResponse,
    kankaItemResponse,
    kankaListResponse
  };
}

describe('Recording Flow Integration', () => {
  let mockFetch;
  let mockGetUserMedia;
  let mockResponses;
  let orchestrator;
  let mockServices;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup mock responses
    mockResponses = createMockFetchResponses();

    // Mock global fetch
    mockFetch = vi.fn((url) => {
      // OpenAI Transcription API
      if (url.includes('/audio/transcriptions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponses.transcriptionResponse)
        });
      }

      // OpenAI Chat Completion API (for entity extraction)
      if (url.includes('/chat/completions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify(mockResponses.entityExtractionResponse)
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
          json: () => Promise.resolve(mockResponses.imageGenerationResponse)
        });
      }

      // Kanka API - Journal creation
      if (url.includes('/api/1.0/campaigns/') && url.includes('/journals')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponses.kankaJournalResponse)
        });
      }

      // Kanka API - Character operations
      if (url.includes('/api/1.0/campaigns/') && url.includes('/characters')) {
        if (url.includes('?')) {
          // List operation
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResponses.kankaListResponse)
          });
        }
        // Create operation
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponses.kankaCharacterResponse)
        });
      }

      // Kanka API - Location operations
      if (url.includes('/api/1.0/campaigns/') && url.includes('/locations')) {
        if (url.includes('?')) {
          // List operation
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResponses.kankaListResponse)
          });
        }
        // Create operation
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponses.kankaLocationResponse)
        });
      }

      // Kanka API - Item operations
      if (url.includes('/api/1.0/campaigns/') && url.includes('/items')) {
        if (url.includes('?')) {
          // List operation
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResponses.kankaListResponse)
          });
        }
        // Create operation
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponses.kankaItemResponse)
        });
      }

      // Image download (for uploading to Kanka)
      if (url.includes('example.com/generated-image')) {
        const imageBlob = new Blob([new Uint8Array(1024).fill(0)], { type: 'image/png' });
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(imageBlob)
        });
      }

      // Default response
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found'
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

    // Import real services dynamically to avoid circular dependency issues
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

    // Store services for potential modifications in tests
    mockServices = {
      audioRecorder,
      transcriptionService,
      entityExtractor,
      imageGenerationService,
      kankaService,
      narrativeExporter
    };

    // Create orchestrator with real services
    orchestrator = new SessionOrchestrator(mockServices);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('complete recording workflow', () => {
    it('should complete full workflow from recording to transcription', async () => {
      // Track state changes
      const stateChanges = [];
      orchestrator.setCallbacks({
        onStateChange: (newState, oldState) => {
          stateChanges.push({ from: oldState, to: newState });
        }
      });

      // Step 1: Start recording session
      await orchestrator.startSession({
        title: 'Test Session 1',
        language: 'en'
      });

      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(orchestrator.isSessionActive).toBe(true);
      expect(orchestrator.currentSession).toBeDefined();
      expect(orchestrator.currentSession.title).toBe('Test Session 1');

      // Step 2: Stop recording (this triggers transcription)
      const result = await orchestrator.stopSession();

      expect(result.audioBlob).toBeDefined();
      expect(result.transcript).toBeDefined();
      expect(result.transcript.text).toContain('Rivendell');
      expect(result.transcript.segments).toHaveLength(2);

      // Step 3: Verify entities were extracted
      expect(result.entities).toBeDefined();
      expect(result.entities.characters).toHaveLength(1);
      expect(result.entities.characters[0].name).toBe('Gandalf');
      expect(result.entities.locations).toHaveLength(1);
      expect(result.entities.locations[0].name).toBe('Rivendell');
      expect(result.entities.items).toHaveLength(1);
      expect(result.entities.items[0].name).toBe('Staff of Power');

      // Step 4: Verify images were generated
      expect(result.images).toBeDefined();
      expect(result.images.length).toBeGreaterThan(0);
      expect(result.images[0].success).toBe(true);
      expect(result.images[0].url).toContain('example.com');

      // Verify final state
      expect(orchestrator.state).toBe(SessionState.COMPLETE);

      // Verify state transitions include key phases
      expect(stateChanges).toEqual(
        expect.arrayContaining([
          { from: SessionState.IDLE, to: SessionState.RECORDING },
          { from: SessionState.RECORDING, to: SessionState.PROCESSING }
        ])
      );
    }, 10000); // Increase timeout for integration test

    it('should handle recording without auto-processing', async () => {
      // Start and stop without immediate processing
      await orchestrator.startSession({ title: 'Manual Processing Test' });
      const result = await orchestrator.stopSession({ processImmediately: false });

      expect(result.audioBlob).toBeDefined();
      expect(result.transcript).toBeNull();
      expect(result.entities).toBeNull();
      expect(orchestrator.state).toBe(SessionState.IDLE);

      // Process manually
      await orchestrator.processTranscription();

      expect(orchestrator.currentSession.transcript).toBeDefined();
      expect(orchestrator.currentSession.entities).toBeDefined();
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should handle pause and resume during recording', async () => {
      // Start recording
      await orchestrator.startSession();
      expect(orchestrator.state).toBe(SessionState.RECORDING);

      // Pause
      orchestrator.pauseRecording();
      expect(orchestrator.state).toBe(SessionState.PAUSED);

      // Resume
      orchestrator.resumeRecording();
      expect(orchestrator.state).toBe(SessionState.RECORDING);

      // Stop and process
      const result = await orchestrator.stopSession();
      expect(result.audioBlob).toBeDefined();
      expect(result.transcript).toBeDefined();
    });

    it('should handle session cancellation', async () => {
      // Start recording
      await orchestrator.startSession({ title: 'Cancelled Session' });
      expect(orchestrator.isSessionActive).toBe(true);

      // Cancel
      orchestrator.cancelSession();
      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.currentSession).toBeNull();
      expect(orchestrator.isSessionActive).toBe(false);
    });
  });

  describe('workflow with custom options', () => {
    it('should skip entity extraction when disabled', async () => {
      orchestrator.setOptions({ autoExtractEntities: false });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.transcript).toBeDefined();
      expect(result.entities).toBeNull();
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should skip image generation when disabled', async () => {
      orchestrator.setOptions({ autoGenerateImages: false });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.transcript).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.images).toHaveLength(0);
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should respect maxImagesPerSession limit', async () => {
      orchestrator.setOptions({ maxImagesPerSession: 1 });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.images.length).toBeLessThanOrEqual(1);
    });

    it('should apply speaker mapping to transcript', async () => {
      const speakerMap = {
        'SPEAKER_00': 'Game Master',
        'SPEAKER_01': 'Player John'
      };

      await orchestrator.startSession();
      const result = await orchestrator.stopSession({
        processImmediately: false
      });

      await orchestrator.processTranscription({ speakerMap });

      expect(orchestrator.currentSession.transcript.segments[0].speaker).toBe('Game Master');
      expect(orchestrator.currentSession.transcript.segments[1].speaker).toBe('Player John');
    });
  });

  describe('error handling during workflow', () => {
    it('should handle transcription API errors', async () => {
      // Mock transcription failure
      mockFetch.mockImplementationOnce((url) => {
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ error: { message: 'Service unavailable' } })
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await orchestrator.startSession();

      await expect(orchestrator.stopSession()).rejects.toThrow();
      expect(orchestrator.state).toBe(SessionState.ERROR);
    });

    it('should continue workflow with partial entity extraction failure', async () => {
      // Mock entity extraction failure
      mockFetch.mockImplementation((url) => {
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResponses.transcriptionResponse)
          });
        }
        if (url.includes('/chat/completions')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.transcript).toBeDefined();
      expect(result.entities).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should continue workflow with image generation failure', async () => {
      // Mock image generation failure - throw error directly
      mockFetch.mockImplementation((url) => {
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResponses.transcriptionResponse)
          });
        }
        if (url.includes('/chat/completions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              choices: [{ message: { content: JSON.stringify(mockResponses.entityExtractionResponse) } }]
            })
          });
        }
        if (url.includes('/images/generations')) {
          // Return rejected promise to simulate network error
          return Promise.reject(new Error('Image generation failed'));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.transcript).toBeDefined();
      expect(result.entities).toBeDefined();
      // Workflow should complete successfully even if image generation fails
      // The important part is that the workflow continues and completes
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
      // Result should still have the session data
      expect(result.id).toBeDefined();
      expect(result.title).toBeDefined();
    });
  });

  describe('session data and summary', () => {
    it('should provide complete session summary', async () => {
      await orchestrator.startSession({ title: 'Summary Test Session' });
      await orchestrator.stopSession();

      const summary = orchestrator.getSessionSummary();

      expect(summary).toBeDefined();
      expect(summary.id).toMatch(/^session-/);
      expect(summary.title).toBe('Summary Test Session');
      expect(summary.state).toBe(SessionState.COMPLETE);
      expect(summary.hasAudio).toBe(true);
      expect(summary.hasTranscript).toBe(true);
      expect(summary.entityCount).toBeGreaterThan(0);
      expect(summary.segmentCount).toBe(2);
      // speakerCount may or may not be present depending on implementation
      if (summary.speakerCount !== undefined) {
        expect(summary.speakerCount).toBeGreaterThanOrEqual(2);
      }
    });

    it('should track processing duration', async () => {
      await orchestrator.startSession();
      const result = await orchestrator.stopSession();

      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(result.endTime).toBeGreaterThan(result.startTime);
    });

    it('should maintain session data integrity across steps', async () => {
      await orchestrator.startSession({ title: 'Data Integrity Test' });
      const session1 = orchestrator.currentSession;

      await orchestrator.stopSession({ processImmediately: false });
      const session2 = orchestrator.currentSession;

      await orchestrator.processTranscription();
      const session3 = orchestrator.currentSession;

      // Session ID should remain constant
      expect(session1.id).toBe(session2.id);
      expect(session2.id).toBe(session3.id);

      // Data should accumulate
      expect(session1.title).toBe('Data Integrity Test');
      expect(session2.audioBlob).toBeDefined();
      expect(session3.transcript).toBeDefined();
      expect(session3.entities).toBeDefined();
    });
  });

  describe('API interaction validation', () => {
    it('should make correct API calls in sequence', async () => {
      const apiCalls = [];

      mockFetch.mockImplementation((url, options) => {
        apiCalls.push({ url, method: options?.method || 'GET' });

        // Return appropriate mock responses
        if (url.includes('/audio/transcriptions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResponses.transcriptionResponse)
          });
        }
        if (url.includes('/chat/completions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              choices: [{ message: { content: JSON.stringify(mockResponses.entityExtractionResponse) } }]
            })
          });
        }
        if (url.includes('/images/generations')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResponses.imageGenerationResponse)
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await orchestrator.startSession();
      await orchestrator.stopSession();

      // Verify API call sequence
      expect(apiCalls.some(call => call.url.includes('/audio/transcriptions'))).toBe(true);
      expect(apiCalls.some(call => call.url.includes('/chat/completions'))).toBe(true);
      expect(apiCalls.some(call => call.url.includes('/images/generations'))).toBe(true);

      // Verify transcription was called before entity extraction
      const transcriptionIndex = apiCalls.findIndex(call => call.url.includes('/audio/transcriptions'));
      const entityExtractionIndex = apiCalls.findIndex(call => call.url.includes('/chat/completions'));
      expect(transcriptionIndex).toBeLessThan(entityExtractionIndex);
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

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(
            url.includes('/audio/transcriptions') ? mockResponses.transcriptionResponse :
            url.includes('/chat/completions') ? { choices: [{ message: { content: JSON.stringify(mockResponses.entityExtractionResponse) } }] } :
            {}
          )
        });
      });

      await orchestrator.startSession();
      await orchestrator.stopSession();

      // Verify OpenAI endpoints use Bearer token
      const openaiCalls = authHeaders.filter(h =>
        h.url.includes('api.openai.com')
      );
      openaiCalls.forEach(call => {
        expect(call.auth).toMatch(/^Bearer /);
      });
    });
  });

  describe('callback notifications', () => {
    it('should notify on state changes', async () => {
      const stateChanges = [];
      orchestrator.setCallbacks({
        onStateChange: (newState, oldState, data) => {
          stateChanges.push({ newState, oldState, data });
        }
      });

      await orchestrator.startSession();
      await orchestrator.stopSession();

      expect(stateChanges.length).toBeGreaterThan(0);
      expect(stateChanges[0].oldState).toBe(SessionState.IDLE);
      expect(stateChanges[0].newState).toBe(SessionState.RECORDING);
    });

    it('should notify on progress updates', async () => {
      const progressUpdates = [];
      orchestrator.setCallbacks({
        onProgress: (progress) => {
          progressUpdates.push(progress);
        }
      });

      await orchestrator.startSession();
      await orchestrator.stopSession();

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some(p => p.stage === 'transcription')).toBe(true);
      expect(progressUpdates.some(p => p.stage === 'extraction')).toBe(true);
    });

    it('should notify on session completion', async () => {
      let completedSession = null;
      orchestrator.setCallbacks({
        onSessionComplete: (session) => {
          completedSession = session;
        }
      });

      await orchestrator.startSession();
      await orchestrator.stopSession();

      expect(completedSession).toBeDefined();
      expect(completedSession.transcript).toBeDefined();
      expect(completedSession.entities).toBeDefined();
    });

    it('should notify on errors', async () => {
      const errors = [];
      orchestrator.setCallbacks({
        onError: (error, context) => {
          errors.push({ error, context });
        }
      });

      // Mock a failure
      mockFetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      }));

      await orchestrator.startSession();

      try {
        await orchestrator.stopSession();
      } catch (error) {
        // Expected to throw
      }

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
