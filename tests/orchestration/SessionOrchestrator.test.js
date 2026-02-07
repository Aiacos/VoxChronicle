/**
 * SessionOrchestrator Unit Tests
 *
 * Tests for the SessionOrchestrator class with service mocking.
 * Covers session lifecycle, state management, processing workflow, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger before importing SessionOrchestrator
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
import { SessionOrchestrator, SessionState, DEFAULT_SESSION_OPTIONS } from '../../scripts/orchestration/SessionOrchestrator.mjs';

/**
 * Create mock audio blob for testing
 */
function createMockAudioBlob(size = 1024) {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type: 'audio/webm' });
}

/**
 * Create mock transcription result
 */
function createMockTranscriptionResult(options = {}) {
  return {
    text: options.text || 'Test transcription text.',
    segments: options.segments || [
      {
        speaker: 'SPEAKER_00',
        text: 'Hello world',
        start: 0,
        end: 2.5
      },
      {
        speaker: 'SPEAKER_01',
        text: 'Test message',
        start: 2.5,
        end: 5.0
      }
    ],
    speakers: options.speakers || [
      { id: 'SPEAKER_00', name: 'SPEAKER_00', segmentCount: 1, isMapped: false },
      { id: 'SPEAKER_01', name: 'SPEAKER_01', segmentCount: 1, isMapped: false }
    ],
    language: options.language || 'en',
    duration: options.duration || 5.0
  };
}

/**
 * Create mock entity extraction result
 */
function createMockEntityExtractionResult() {
  return {
    characters: [
      { name: 'Gandalf', description: 'A wise wizard', isNPC: true }
    ],
    locations: [
      { name: 'Rivendell', description: 'An elven sanctuary', type: 'City' }
    ],
    items: [
      { name: 'Staff of Power', description: 'A magical staff', type: 'Weapon' }
    ],
    moments: [
      { id: 'moment-1', title: 'Epic Battle', description: 'Battle description', imagePrompt: 'epic battle scene' }
    ],
    totalCount: 3
  };
}

/**
 * Create mock image generation result
 */
function createMockImageResult(success = true) {
  return {
    success,
    url: success ? 'https://example.com/image.png' : null,
    revisedPrompt: 'A revised prompt',
    error: success ? null : 'Generation failed'
  };
}

/**
 * Create mock service suite
 */
function createMockServices() {
  return {
    audioRecorder: {
      startRecording: vi.fn().mockResolvedValue(undefined),
      stopRecording: vi.fn().mockResolvedValue(createMockAudioBlob()),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn()
    },
    transcriptionService: {
      transcribe: vi.fn().mockResolvedValue(createMockTranscriptionResult())
    },
    entityExtractor: {
      extractAll: vi.fn().mockResolvedValue(createMockEntityExtractionResult()),
      extractRelationships: vi.fn().mockResolvedValue([])
    },
    imageGenerationService: {
      generateBatch: vi.fn().mockResolvedValue([createMockImageResult()])
    },
    kankaService: {
      createIfNotExists: vi.fn().mockResolvedValue({ id: 1, name: 'Test Entity' }),
      createJournal: vi.fn().mockResolvedValue({ id: 1, name: 'Test Journal' }),
      uploadCharacterImage: vi.fn().mockResolvedValue({ success: true }),
      listCharacters: vi.fn().mockResolvedValue({ data: [] }),
      listLocations: vi.fn().mockResolvedValue({ data: [] }),
      listItems: vi.fn().mockResolvedValue({ data: [] })
    },
    narrativeExporter: {
      export: vi.fn().mockReturnValue({
        name: 'Test Chronicle',
        entry: '<p>Chronicle content</p>',
        type: 'Session Chronicle'
      })
    }
  };
}

describe('SessionOrchestrator', () => {
  let orchestrator;
  let mockServices;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
    orchestrator = new SessionOrchestrator(mockServices);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with all services', () => {
      expect(orchestrator).toBeInstanceOf(SessionOrchestrator);
      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.isSessionActive).toBe(false);
    });

    it('should accept partial services', () => {
      const minimalOrchestrator = new SessionOrchestrator({
        audioRecorder: mockServices.audioRecorder,
        transcriptionService: mockServices.transcriptionService
      });

      expect(minimalOrchestrator).toBeInstanceOf(SessionOrchestrator);
      expect(minimalOrchestrator.getServicesStatus().audioRecorder).toBe(true);
      expect(minimalOrchestrator.getServicesStatus().entityExtractor).toBe(false);
    });

    it('should accept custom options', () => {
      const customOptions = {
        autoExtractEntities: false,
        maxImagesPerSession: 10,
        imageQuality: 'hd'
      };

      const customOrchestrator = new SessionOrchestrator(mockServices, customOptions);
      const options = customOrchestrator.getOptions();

      expect(options.autoExtractEntities).toBe(false);
      expect(options.maxImagesPerSession).toBe(10);
      expect(options.imageQuality).toBe('hd');
    });

    it('should use default options when not specified', () => {
      const options = orchestrator.getOptions();

      expect(options.autoExtractEntities).toBe(DEFAULT_SESSION_OPTIONS.autoExtractEntities);
      expect(options.maxImagesPerSession).toBe(DEFAULT_SESSION_OPTIONS.maxImagesPerSession);
    });
  });

  describe('state management', () => {
    it('should start in IDLE state', () => {
      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.isSessionActive).toBe(false);
      expect(orchestrator.isRecording).toBe(false);
    });

    it('should update state correctly', () => {
      orchestrator._updateState(SessionState.RECORDING);
      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(orchestrator.isSessionActive).toBe(true);
      expect(orchestrator.isRecording).toBe(true);
    });

    it('should call onStateChange callback', () => {
      const onStateChange = vi.fn();
      orchestrator.setCallbacks({ onStateChange });

      orchestrator._updateState(SessionState.RECORDING, { test: 'data' });

      expect(onStateChange).toHaveBeenCalledWith(
        SessionState.RECORDING,
        SessionState.IDLE,
        { test: 'data' }
      );
    });

    it('should detect active sessions', () => {
      orchestrator._updateState(SessionState.RECORDING);
      expect(orchestrator.isSessionActive).toBe(true);

      orchestrator._updateState(SessionState.PROCESSING);
      expect(orchestrator.isSessionActive).toBe(true);

      orchestrator._updateState(SessionState.COMPLETE);
      expect(orchestrator.isSessionActive).toBe(false);

      orchestrator._updateState(SessionState.ERROR);
      expect(orchestrator.isSessionActive).toBe(false);
    });

    it('should detect recording states', () => {
      orchestrator._updateState(SessionState.RECORDING);
      expect(orchestrator.isRecording).toBe(true);

      orchestrator._updateState(SessionState.PAUSED);
      expect(orchestrator.isRecording).toBe(true);

      orchestrator._updateState(SessionState.PROCESSING);
      expect(orchestrator.isRecording).toBe(false);
    });
  });

  describe('startSession', () => {
    it('should start a new session successfully', async () => {
      await orchestrator.startSession({ title: 'Test Session' });

      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(orchestrator.isSessionActive).toBe(true);
      expect(orchestrator.currentSession).toBeDefined();
      expect(orchestrator.currentSession.title).toBe('Test Session');
      expect(mockServices.audioRecorder.startRecording).toHaveBeenCalled();
    });

    it('should generate session ID and timestamp', async () => {
      await orchestrator.startSession();

      const session = orchestrator.currentSession;
      expect(session.id).toMatch(/^session-/);
      expect(session.startTime).toBeDefined();
      expect(session.startTime).toBeGreaterThan(0);
    });

    it('should use default title with date if not provided', async () => {
      await orchestrator.startSession();

      const session = orchestrator.currentSession;
      expect(session.title).toMatch(/Session/);
    });

    it('should initialize session data structure', async () => {
      await orchestrator.startSession({ title: 'Test', language: 'en' });

      const session = orchestrator.currentSession;
      expect(session).toMatchObject({
        title: 'Test',
        language: 'en',
        audioBlob: null,
        transcript: null,
        entities: null,
        relationships: null,
        moments: null,
        images: [],
        chronicle: null,
        kankaResults: null,
        errors: []
      });
    });

    it('should throw error if session already active', async () => {
      await orchestrator.startSession();

      await expect(orchestrator.startSession()).rejects.toThrow(
        'A session is already active'
      );
    });

    it('should throw error if audio recorder not configured', async () => {
      const noRecorderOrchestrator = new SessionOrchestrator({
        transcriptionService: mockServices.transcriptionService
      });

      await expect(noRecorderOrchestrator.startSession()).rejects.toThrow(
        'Audio recorder not configured'
      );
    });

    it('should handle audio recorder errors', async () => {
      mockServices.audioRecorder.startRecording.mockRejectedValueOnce(
        new Error('Microphone access denied')
      );

      await expect(orchestrator.startSession()).rejects.toThrow(
        'Microphone access denied'
      );
    });

    it('should pass recording options to audio recorder', async () => {
      const recordingOptions = { mimeType: 'audio/webm' };
      await orchestrator.startSession({ recordingOptions });

      expect(mockServices.audioRecorder.startRecording).toHaveBeenCalledWith(
        recordingOptions
      );
    });
  });

  describe('stopSession', () => {
    beforeEach(async () => {
      await orchestrator.startSession({ title: 'Test Session' });
    });

    it('should stop recording and get audio blob', async () => {
      const result = await orchestrator.stopSession();

      expect(mockServices.audioRecorder.stopRecording).toHaveBeenCalled();
      expect(result.audioBlob).toBeDefined();
      expect(result.endTime).toBeDefined();
    });

    it('should process transcription by default', async () => {
      await orchestrator.stopSession();

      expect(mockServices.transcriptionService.transcribe).toHaveBeenCalled();
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should skip processing if processImmediately is false', async () => {
      await orchestrator.stopSession({ processImmediately: false });

      expect(mockServices.transcriptionService.transcribe).not.toHaveBeenCalled();
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });

    it('should throw error if not recording', async () => {
      await orchestrator.stopSession();

      await expect(orchestrator.stopSession()).rejects.toThrow(
        'No recording in progress'
      );
    });

    it('should handle stop recording errors', async () => {
      mockServices.audioRecorder.stopRecording.mockRejectedValueOnce(
        new Error('Stop failed')
      );

      await expect(orchestrator.stopSession()).rejects.toThrow('Stop failed');
    });

    it('should return session data', async () => {
      const result = await orchestrator.stopSession({ processImmediately: false });

      expect(result).toMatchObject({
        id: expect.stringMatching(/^session-/),
        title: 'Test Session',
        audioBlob: expect.any(Blob)
      });
    });
  });

  describe('pauseRecording', () => {
    beforeEach(async () => {
      await orchestrator.startSession();
    });

    it('should pause active recording', () => {
      orchestrator.pauseRecording();

      expect(mockServices.audioRecorder.pause).toHaveBeenCalled();
      expect(orchestrator.state).toBe(SessionState.PAUSED);
    });

    it('should throw error if not recording', async () => {
      await orchestrator.stopSession({ processImmediately: false });

      expect(() => orchestrator.pauseRecording()).toThrow(
        'Cannot pause - not currently recording'
      );
    });
  });

  describe('resumeRecording', () => {
    beforeEach(async () => {
      await orchestrator.startSession();
      orchestrator.pauseRecording();
    });

    it('should resume paused recording', () => {
      orchestrator.resumeRecording();

      expect(mockServices.audioRecorder.resume).toHaveBeenCalled();
      expect(orchestrator.state).toBe(SessionState.RECORDING);
    });

    it('should throw error if not paused', async () => {
      orchestrator.resumeRecording();

      expect(() => orchestrator.resumeRecording()).toThrow(
        'Cannot resume - recording is not paused'
      );
    });
  });

  describe('cancelSession', () => {
    it('should cancel active session', async () => {
      await orchestrator.startSession();
      orchestrator.cancelSession();

      expect(mockServices.audioRecorder.cancel).toHaveBeenCalled();
      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.currentSession).toBeNull();
    });

    it('should handle cancel when no session active', () => {
      expect(() => orchestrator.cancelSession()).not.toThrow();
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });
  });

  describe('processTranscription', () => {
    beforeEach(async () => {
      await orchestrator.startSession();
      await orchestrator.stopSession({ processImmediately: false });
    });

    it('should transcribe audio successfully', async () => {
      const result = await orchestrator.processTranscription();

      expect(mockServices.transcriptionService.transcribe).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ speakerMap: {}, language: null })
      );
      expect(result).toMatchObject({
        text: expect.any(String),
        segments: expect.any(Array)
      });
    });

    it('should update session with transcript', async () => {
      await orchestrator.processTranscription();

      expect(orchestrator.currentSession.transcript).toBeDefined();
      expect(orchestrator.currentSession.transcript.text).toBeDefined();
    });

    it('should use provided speaker map', async () => {
      const speakerMap = { 'SPEAKER_00': 'GM', 'SPEAKER_01': 'Player 1' };
      await orchestrator.processTranscription({ speakerMap });

      expect(mockServices.transcriptionService.transcribe).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ speakerMap })
      );
    });

    it('should use session speaker map by default', async () => {
      orchestrator.currentSession.speakerMap = { 'SPEAKER_00': 'GM' };
      await orchestrator.processTranscription();

      expect(mockServices.transcriptionService.transcribe).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ speakerMap: { 'SPEAKER_00': 'GM' } })
      );
    });

    it('should throw error if no audio blob', async () => {
      orchestrator.currentSession.audioBlob = null;

      await expect(orchestrator.processTranscription()).rejects.toThrow(
        'No audio blob available'
      );
    });

    it('should throw error if transcription service not configured', async () => {
      const noTranscriptionOrchestrator = new SessionOrchestrator({
        audioRecorder: mockServices.audioRecorder
      });

      noTranscriptionOrchestrator._currentSession = {
        audioBlob: createMockAudioBlob()
      };

      await expect(
        noTranscriptionOrchestrator.processTranscription()
      ).rejects.toThrow('Transcription service not configured');
    });

    it('should extract entities if autoExtractEntities enabled', async () => {
      await orchestrator.processTranscription();

      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalled();
      expect(orchestrator.currentSession.entities).toBeDefined();
    });

    it('should skip entity extraction if autoExtractEntities disabled', async () => {
      orchestrator.setOptions({ autoExtractEntities: false });
      await orchestrator.processTranscription();

      expect(mockServices.entityExtractor.extractAll).not.toHaveBeenCalled();
    });

    it('should generate images if autoGenerateImages enabled', async () => {
      await orchestrator.processTranscription();

      expect(mockServices.imageGenerationService.generateBatch).toHaveBeenCalled();
      expect(orchestrator.currentSession.images).toBeDefined();
    });

    it('should skip image generation if autoGenerateImages disabled', async () => {
      orchestrator.setOptions({ autoGenerateImages: false });
      await orchestrator.processTranscription();

      expect(mockServices.imageGenerationService.generateBatch).not.toHaveBeenCalled();
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();
      orchestrator.setCallbacks({ onProgress });

      await orchestrator.processTranscription();

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'transcription',
          progress: expect.any(Number)
        })
      );
    });

    it('should call onSessionComplete callback', async () => {
      const onSessionComplete = vi.fn();
      orchestrator.setCallbacks({ onSessionComplete });

      await orchestrator.processTranscription();

      expect(onSessionComplete).toHaveBeenCalledWith(orchestrator.currentSession);
    });

    it('should transition to COMPLETE state', async () => {
      await orchestrator.processTranscription();

      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });
  });

  describe('_extractEntities', () => {
    beforeEach(async () => {
      await orchestrator.startSession();
      await orchestrator.stopSession({ processImmediately: false });
      orchestrator.currentSession.transcript = createMockTranscriptionResult();
    });

    it('should extract entities from transcript', async () => {
      const result = await orchestrator._extractEntities();

      expect(mockServices.entityExtractor.extractAll).toHaveBeenCalledWith(
        orchestrator.currentSession.transcript.text,
        expect.any(Object)
      );
      expect(result.characters).toBeDefined();
      expect(result.locations).toBeDefined();
      expect(result.items).toBeDefined();
    });

    it('should update session with extracted entities', async () => {
      await orchestrator._extractEntities();

      expect(orchestrator.currentSession.entities).toMatchObject({
        characters: expect.any(Array),
        locations: expect.any(Array),
        items: expect.any(Array)
      });
      expect(orchestrator.currentSession.moments).toBeDefined();
    });

    it('should fetch existing Kanka entities to avoid duplicates', async () => {
      await orchestrator._extractEntities();

      expect(mockServices.kankaService.listCharacters).toHaveBeenCalled();
      expect(mockServices.kankaService.listLocations).toHaveBeenCalled();
      expect(mockServices.kankaService.listItems).toHaveBeenCalled();
    });

    it('should extract relationships if autoExtractRelationships enabled', async () => {
      await orchestrator._extractEntities();

      expect(mockServices.entityExtractor.extractRelationships).toHaveBeenCalled();
      expect(orchestrator.currentSession.relationships).toBeDefined();
    });

    it('should skip relationships if autoExtractRelationships disabled', async () => {
      orchestrator.setOptions({ autoExtractRelationships: false });
      await orchestrator._extractEntities();

      expect(mockServices.entityExtractor.extractRelationships).not.toHaveBeenCalled();
    });

    it('should handle extraction errors gracefully', async () => {
      mockServices.entityExtractor.extractAll.mockRejectedValueOnce(
        new Error('Extraction failed')
      );

      const result = await orchestrator._extractEntities();

      expect(result).toBeNull();
      expect(orchestrator.currentSession.errors).toHaveLength(1);
      expect(orchestrator.currentSession.errors[0].stage).toBe('extraction');
    });

    it('should return null if no transcript', async () => {
      orchestrator.currentSession.transcript = null;

      const result = await orchestrator._extractEntities();

      expect(result).toBeNull();
      expect(mockServices.entityExtractor.extractAll).not.toHaveBeenCalled();
    });

    it('should return null if entity extractor not configured', async () => {
      const noExtractorOrchestrator = new SessionOrchestrator({
        audioRecorder: mockServices.audioRecorder,
        transcriptionService: mockServices.transcriptionService
      });

      noExtractorOrchestrator._currentSession = {
        transcript: createMockTranscriptionResult(),
        errors: []
      };

      const result = await noExtractorOrchestrator._extractEntities();

      expect(result).toBeNull();
    });
  });

  describe('_generateImages', () => {
    beforeEach(async () => {
      await orchestrator.startSession();
      await orchestrator.stopSession({ processImmediately: false });
      orchestrator.currentSession.moments = [
        { id: 'moment-1', title: 'Battle', imagePrompt: 'epic battle scene' },
        { id: 'moment-2', title: 'Discovery', imagePrompt: 'ancient ruins' }
      ];
      orchestrator.currentSession.entities = {
        characters: [
          { name: 'Gandalf', description: 'Wise wizard', isNPC: true },
          { name: 'Hero', description: 'Player character', isNPC: false }
        ]
      };
    });

    it('should generate images for moments', async () => {
      const results = await orchestrator._generateImages();

      expect(mockServices.imageGenerationService.generateBatch).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });

    it('should respect maxImagesPerSession limit', async () => {
      orchestrator.setOptions({ maxImagesPerSession: 1 });

      await orchestrator._generateImages();

      const calls = mockServices.imageGenerationService.generateBatch.mock.calls[0];
      expect(calls[0]).toHaveLength(1);
    });

    it('should generate character portraits if room available', async () => {
      orchestrator.setOptions({ maxImagesPerSession: 5 });

      await orchestrator._generateImages();

      const requests = mockServices.imageGenerationService.generateBatch.mock.calls[0][0];
      const characterRequests = requests.filter(r => r.entityType === 'character');
      expect(characterRequests.length).toBeGreaterThan(0);
    });

    it('should only generate images for NPCs', async () => {
      orchestrator.currentSession.moments = [];
      orchestrator.setOptions({ maxImagesPerSession: 5 });

      await orchestrator._generateImages();

      const requests = mockServices.imageGenerationService.generateBatch.mock.calls[0][0];
      const characterRequests = requests.filter(r => r.entityType === 'character');

      characterRequests.forEach(req => {
        expect(req.description).toContain('Gandalf');
        expect(req.description).not.toContain('Hero');
      });
    });

    it('should store image results in session', async () => {
      await orchestrator._generateImages();

      expect(orchestrator.currentSession.images).toBeDefined();
      expect(orchestrator.currentSession.images.length).toBeGreaterThan(0);
    });

    it('should return empty array if no image requests', async () => {
      orchestrator.currentSession.moments = [];
      orchestrator.currentSession.entities = null;

      const results = await orchestrator._generateImages();

      expect(results).toEqual([]);
      expect(mockServices.imageGenerationService.generateBatch).not.toHaveBeenCalled();
    });

    it('should handle generation errors gracefully', async () => {
      mockServices.imageGenerationService.generateBatch.mockRejectedValueOnce(
        new Error('Generation failed')
      );

      const results = await orchestrator._generateImages();

      expect(results).toEqual([]);
      expect(orchestrator.currentSession.errors).toHaveLength(1);
      expect(orchestrator.currentSession.errors[0].stage).toBe('image_generation');
    });

    it('should return empty array if service not configured', async () => {
      const noImageOrchestrator = new SessionOrchestrator({
        audioRecorder: mockServices.audioRecorder,
        transcriptionService: mockServices.transcriptionService
      });

      noImageOrchestrator._currentSession = {
        moments: [{ imagePrompt: 'test' }],
        errors: []
      };

      const results = await noImageOrchestrator._generateImages();

      expect(results).toEqual([]);
    });
  });

  describe('publishToKanka', () => {
    beforeEach(async () => {
      await orchestrator.startSession();
      await orchestrator.stopSession({ processImmediately: false });
      orchestrator.currentSession.transcript = createMockTranscriptionResult();
      orchestrator.currentSession.entities = createMockEntityExtractionResult();
    });

    it('should publish chronicle to Kanka', async () => {
      const results = await orchestrator.publishToKanka();

      expect(results.journal).toBeDefined();
      expect(mockServices.kankaService.createJournal).toHaveBeenCalled();
    });

    it('should create entities in Kanka', async () => {
      const results = await orchestrator.publishToKanka();

      expect(mockServices.kankaService.createIfNotExists).toHaveBeenCalled();
      expect(results.characters).toBeDefined();
      expect(results.locations).toBeDefined();
      expect(results.items).toBeDefined();
    });

    it('should skip entity creation if createEntities is false', async () => {
      await orchestrator.publishToKanka({ createEntities: false });

      expect(mockServices.kankaService.createIfNotExists).not.toHaveBeenCalled();
    });

    it('should skip chronicle creation if createChronicle is false', async () => {
      await orchestrator.publishToKanka({ createChronicle: false });

      expect(mockServices.kankaService.createJournal).not.toHaveBeenCalled();
    });

    it('should upload character images if uploadImages is true', async () => {
      orchestrator.currentSession.images = [
        {
          success: true,
          url: 'https://example.com/gandalf.png',
          entityType: 'character',
          meta: { characterName: 'Gandalf' }
        }
      ];

      await orchestrator.publishToKanka({ uploadImages: true });

      expect(mockServices.kankaService.uploadCharacterImage).toHaveBeenCalled();
    });

    it('should skip image upload if uploadImages is false', async () => {
      orchestrator.currentSession.images = [
        { success: true, url: 'https://example.com/image.png' }
      ];

      await orchestrator.publishToKanka({ uploadImages: false });

      expect(mockServices.kankaService.uploadCharacterImage).not.toHaveBeenCalled();
    });

    it('should use NarrativeExporter if available', async () => {
      await orchestrator.publishToKanka();

      expect(mockServices.narrativeExporter.export).toHaveBeenCalledWith(
        expect.objectContaining({
          title: orchestrator.currentSession.title,
          segments: orchestrator.currentSession.transcript.segments
        }),
        expect.any(Object)
      );
    });

    it('should format basic chronicle without NarrativeExporter', async () => {
      const noExporterOrchestrator = new SessionOrchestrator({
        audioRecorder: mockServices.audioRecorder,
        transcriptionService: mockServices.transcriptionService,
        kankaService: mockServices.kankaService
      });

      noExporterOrchestrator._currentSession = {
        title: 'Test Session',
        date: '2024-01-01',
        transcript: createMockTranscriptionResult(),
        entities: createMockEntityExtractionResult(),
        errors: []
      };
      noExporterOrchestrator._state = SessionState.COMPLETE;

      await noExporterOrchestrator.publishToKanka();

      expect(mockServices.kankaService.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Session',
          entry: expect.stringContaining('<h2>Test Session</h2>')
        })
      );
    });

    it('should store results in session', async () => {
      await orchestrator.publishToKanka();

      expect(orchestrator.currentSession.kankaResults).toBeDefined();
      expect(orchestrator.currentSession.chronicle).toBeDefined();
    });

    it('should throw error if no session data', async () => {
      orchestrator._currentSession = null;

      await expect(orchestrator.publishToKanka()).rejects.toThrow(
        'No session data available'
      );
    });

    it('should throw error if Kanka service not configured', async () => {
      const noKankaOrchestrator = new SessionOrchestrator({
        audioRecorder: mockServices.audioRecorder,
        transcriptionService: mockServices.transcriptionService
      });

      noKankaOrchestrator._currentSession = {
        transcript: createMockTranscriptionResult()
      };

      await expect(noKankaOrchestrator.publishToKanka()).rejects.toThrow(
        'Kanka service not configured'
      );
    });

    it('should handle entity creation errors gracefully', async () => {
      mockServices.kankaService.createIfNotExists.mockRejectedValueOnce(
        new Error('Creation failed')
      );

      const results = await orchestrator.publishToKanka();

      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].error).toContain('Creation failed');
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();
      orchestrator.setCallbacks({ onProgress });

      await orchestrator.publishToKanka();

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'publishing',
          progress: expect.any(Number)
        })
      );
    });
  });

  describe('callbacks', () => {
    it('should set and call onStateChange', async () => {
      const onStateChange = vi.fn();
      orchestrator.setCallbacks({ onStateChange });

      await orchestrator.startSession();

      expect(onStateChange).toHaveBeenCalledWith(
        SessionState.RECORDING,
        SessionState.IDLE,
        expect.any(Object)
      );
    });

    it('should set and call onProgress', async () => {
      const onProgress = vi.fn();
      orchestrator.setCallbacks({ onProgress });

      orchestrator._reportProgress('test', 50, 'Testing');

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'test',
          progress: 50,
          message: 'Testing',
          state: orchestrator.state
        })
      );
    });

    it('should set and call onError', async () => {
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      mockServices.audioRecorder.startRecording.mockRejectedValueOnce(
        new Error('Test error')
      );

      try {
        await orchestrator.startSession();
      } catch (error) {
        // Expected to throw
      }

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        'startSession'
      );
    });

    it('should set and call onSessionComplete', async () => {
      const onSessionComplete = vi.fn();
      orchestrator.setCallbacks({ onSessionComplete });

      await orchestrator.startSession();
      await orchestrator.stopSession();

      expect(onSessionComplete).toHaveBeenCalledWith(
        orchestrator.currentSession
      );
    });
  });

  describe('setServices', () => {
    it('should update individual services', () => {
      const newAudioRecorder = { startRecording: vi.fn() };
      orchestrator.setServices({ audioRecorder: newAudioRecorder });

      expect(orchestrator.getServicesStatus().audioRecorder).toBe(true);
    });

    it('should update multiple services', () => {
      const newServices = {
        audioRecorder: { startRecording: vi.fn() },
        transcriptionService: { transcribe: vi.fn() }
      };

      orchestrator.setServices(newServices);

      const status = orchestrator.getServicesStatus();
      expect(status.audioRecorder).toBe(true);
      expect(status.transcriptionService).toBe(true);
    });
  });

  describe('setOptions and getOptions', () => {
    it('should update options', () => {
      orchestrator.setOptions({ maxImagesPerSession: 10 });

      expect(orchestrator.getOptions().maxImagesPerSession).toBe(10);
    });

    it('should merge with existing options', () => {
      orchestrator.setOptions({ maxImagesPerSession: 10 });
      orchestrator.setOptions({ imageQuality: 'hd' });

      const options = orchestrator.getOptions();
      expect(options.maxImagesPerSession).toBe(10);
      expect(options.imageQuality).toBe('hd');
    });
  });

  describe('getServicesStatus', () => {
    it('should return status of all services', () => {
      const status = orchestrator.getServicesStatus();

      expect(status).toMatchObject({
        audioRecorder: true,
        transcriptionService: true,
        entityExtractor: true,
        imageGenerationService: true,
        kankaService: true,
        narrativeExporter: true,
        canRecord: true,
        canTranscribe: true,
        canPublish: true
      });
    });

    it('should detect missing services', () => {
      const minimalOrchestrator = new SessionOrchestrator({});
      const status = minimalOrchestrator.getServicesStatus();

      expect(status.audioRecorder).toBe(false);
      expect(status.canRecord).toBe(false);
      expect(status.canTranscribe).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset orchestrator to idle state', async () => {
      await orchestrator.startSession();
      orchestrator.reset();

      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.currentSession).toBeNull();
      expect(mockServices.audioRecorder.cancel).toHaveBeenCalled();
    });
  });

  describe('getSessionSummary', () => {
    it('should return null if no session', () => {
      expect(orchestrator.getSessionSummary()).toBeNull();
    });

    it('should return session summary', async () => {
      await orchestrator.startSession({ title: 'Test Session' });
      await orchestrator.stopSession();

      const summary = orchestrator.getSessionSummary();

      expect(summary).toMatchObject({
        id: expect.stringMatching(/^session-/),
        title: 'Test Session',
        state: SessionState.COMPLETE,
        hasAudio: true,
        hasTranscript: true,
        segmentCount: expect.any(Number)
      });
    });

    it('should calculate entity counts', async () => {
      await orchestrator.startSession();
      await orchestrator.stopSession();

      orchestrator.currentSession.entities = {
        characters: [{ name: 'Test1' }, { name: 'Test2' }],
        locations: [{ name: 'Location1' }],
        items: []
      };

      const summary = orchestrator.getSessionSummary();

      expect(summary.entityCount).toBe(3);
    });

    it('should include error count', async () => {
      await orchestrator.startSession();
      await orchestrator.stopSession({ processImmediately: false });

      orchestrator.currentSession.errors = [
        { stage: 'test', error: 'Test error', timestamp: Date.now() }
      ];

      const summary = orchestrator.getSessionSummary();

      expect(summary.errorCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should transition to ERROR state on error', async () => {
      mockServices.audioRecorder.startRecording.mockRejectedValueOnce(
        new Error('Start failed')
      );

      try {
        await orchestrator.startSession();
      } catch (error) {
        // Expected to throw
      }

      expect(orchestrator.state).toBe(SessionState.ERROR);
    });

    it('should store errors in session', async () => {
      await orchestrator.startSession();
      await orchestrator.stopSession({ processImmediately: false });

      orchestrator.currentSession.transcript = createMockTranscriptionResult();
      mockServices.entityExtractor.extractAll.mockRejectedValueOnce(
        new Error('Extraction failed')
      );

      await orchestrator._extractEntities();

      expect(orchestrator.currentSession.errors).toHaveLength(1);
      expect(orchestrator.currentSession.errors[0]).toMatchObject({
        stage: 'extraction',
        error: 'Extraction failed',
        timestamp: expect.any(Number)
      });
    });

    it('should call onError callback', async () => {
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      mockServices.audioRecorder.startRecording.mockRejectedValueOnce(
        new Error('Test error')
      );

      try {
        await orchestrator.startSession();
      } catch (error) {
        // Expected to throw
      }

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('exported constants', () => {
    it('should export SessionState enum', () => {
      expect(SessionState.IDLE).toBe('idle');
      expect(SessionState.RECORDING).toBe('recording');
      expect(SessionState.PAUSED).toBe('paused');
      expect(SessionState.PROCESSING).toBe('processing');
      expect(SessionState.EXTRACTING).toBe('extracting');
      expect(SessionState.GENERATING_IMAGES).toBe('generating_images');
      expect(SessionState.PUBLISHING).toBe('publishing');
      expect(SessionState.COMPLETE).toBe('complete');
      expect(SessionState.ERROR).toBe('error');
    });

    it('should export DEFAULT_SESSION_OPTIONS', () => {
      expect(DEFAULT_SESSION_OPTIONS).toMatchObject({
        autoExtractEntities: expect.any(Boolean),
        autoExtractRelationships: expect.any(Boolean),
        autoGenerateImages: expect.any(Boolean),
        autoPublishToKanka: expect.any(Boolean),
        confirmEntityCreation: expect.any(Boolean),
        maxImagesPerSession: expect.any(Number),
        imageQuality: expect.any(String),
        includeTranscriptInChronicle: expect.any(Boolean),
        chronicleFormat: expect.any(String)
      });
    });
  });
});
