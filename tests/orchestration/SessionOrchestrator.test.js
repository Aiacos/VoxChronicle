/**
 * Tests for SessionOrchestrator
 *
 * Covers constructor, startSession/stopSession, startLiveMode/stopLiveMode,
 * processTranscription, publishToKanka, pause/resume/cancel, setNarratorServices,
 * setTranscriptionConfig, dual-mode state management, callbacks, error handling,
 * and helper/getter methods.
 */
import { SessionOrchestrator, SessionState, DEFAULT_SESSION_OPTIONS } from '../../scripts/orchestration/SessionOrchestrator.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAudioRecorder(overrides = {}) {
  return {
    startRecording: vi.fn().mockResolvedValue(),
    stopRecording: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' })),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    getLatestChunk: vi.fn().mockResolvedValue(null),
    ...overrides
  };
}

function createMockTranscriptionService(overrides = {}) {
  return {
    transcribe: vi.fn().mockResolvedValue({
      text: 'Hello world',
      segments: [{ speaker: 'SPEAKER_00', text: 'Hello world', start: 0, end: 1 }],
      language: 'en'
    }),
    ...overrides
  };
}

function createMockEntityExtractor(overrides = {}) {
  return {
    extractAll: vi.fn().mockResolvedValue({
      characters: [{ name: 'Gandalf', description: 'A wizard' }],
      locations: [{ name: 'Shire', description: 'Green hills' }],
      items: [{ name: 'Ring', description: 'One ring' }],
      moments: [{ id: 'm1', title: 'Battle', imagePrompt: 'epic battle scene' }],
      totalCount: 3
    }),
    extractRelationships: vi.fn().mockResolvedValue([
      { source: 'Gandalf', target: 'Shire', type: 'visited', confidence: 8 }
    ]),
    ...overrides
  };
}

function createMockImageGenerationService(overrides = {}) {
  return {
    generateBatch: vi.fn().mockResolvedValue([
      { success: true, imageData: 'base64data' }
    ]),
    ...overrides
  };
}

function createMockKankaService(overrides = {}) {
  return {
    createJournal: vi.fn().mockResolvedValue({ id: 1, name: 'Session 1' }),
    createCharacter: vi.fn().mockResolvedValue({ id: 2, name: 'Gandalf' }),
    createLocation: vi.fn().mockResolvedValue({ id: 3, name: 'Shire' }),
    createItem: vi.fn().mockResolvedValue({ id: 4, name: 'Ring' }),
    createIfNotExists: vi.fn().mockResolvedValue({ id: 5, name: 'Entity' }),
    preFetchEntities: vi.fn().mockResolvedValue({}),
    ...overrides
  };
}

function createMockNarrativeExporter(overrides = {}) {
  return {
    export: vi.fn().mockReturnValue({
      name: 'Session 1',
      entry: '<h1>Session 1</h1>',
      type: 'Session Chronicle',
      date: '2024-01-01'
    }),
    ...overrides
  };
}

function createMockAIAssistant(overrides = {}) {
  return {
    analyzeContext: vi.fn().mockResolvedValue({
      suggestions: [{ type: 'narration', content: 'Describe the scene' }],
      offTrack: { isOffTrack: false }
    }),
    setAdventureContext: vi.fn(),
    setChapterContext: vi.fn(),
    ...overrides
  };
}

function createMockChapterTracker(overrides = {}) {
  return {
    getCurrentChapter: vi.fn().mockReturnValue(null),
    setSelectedJournal: vi.fn(),
    updateFromScene: vi.fn(),
    ...overrides
  };
}

function createMockSceneDetector(overrides = {}) {
  return {
    detectSceneTransition: vi.fn().mockReturnValue(null),
    ...overrides
  };
}

function createMockSessionAnalytics(overrides = {}) {
  return {
    startSession: vi.fn(),
    endSession: vi.fn(),
    addSegment: vi.fn(),
    ...overrides
  };
}

function createMockJournalParser(overrides = {}) {
  return {
    parseJournal: vi.fn().mockResolvedValue(),
    getFullText: vi.fn().mockReturnValue('Adventure journal text'),
    extractNPCProfiles: vi.fn().mockReturnValue([]),
    ...overrides
  };
}

function createAllServices(overrides = {}) {
  return {
    audioRecorder: createMockAudioRecorder(overrides.audioRecorder),
    transcriptionService: createMockTranscriptionService(overrides.transcriptionService),
    entityExtractor: createMockEntityExtractor(overrides.entityExtractor),
    imageGenerationService: createMockImageGenerationService(overrides.imageGenerationService),
    kankaService: createMockKankaService(overrides.kankaService),
    narrativeExporter: createMockNarrativeExporter(overrides.narrativeExporter),
    aiAssistant: createMockAIAssistant(overrides.aiAssistant),
    chapterTracker: createMockChapterTracker(overrides.chapterTracker),
    sceneDetector: createMockSceneDetector(overrides.sceneDetector),
    sessionAnalytics: createMockSessionAnalytics(overrides.sessionAnalytics)
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionOrchestrator', () => {
  let services;
  let orchestrator;

  beforeEach(() => {
    vi.useFakeTimers();
    services = createAllServices();
    orchestrator = new SessionOrchestrator(services);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Exports ───────────────────────────────────────────────────────────

  describe('exports', () => {
    it('should export SessionState enum', () => {
      expect(SessionState).toBeDefined();
      expect(SessionState.IDLE).toBe('idle');
      expect(SessionState.RECORDING).toBe('recording');
      expect(SessionState.PAUSED).toBe('paused');
      expect(SessionState.PROCESSING).toBe('processing');
      expect(SessionState.EXTRACTING).toBe('extracting');
      expect(SessionState.GENERATING_IMAGES).toBe('generating_images');
      expect(SessionState.PUBLISHING).toBe('publishing');
      expect(SessionState.COMPLETE).toBe('complete');
      expect(SessionState.ERROR).toBe('error');
      expect(SessionState.LIVE_LISTENING).toBe('live_listening');
      expect(SessionState.LIVE_TRANSCRIBING).toBe('live_transcribing');
      expect(SessionState.LIVE_ANALYZING).toBe('live_analyzing');
    });

    it('should export DEFAULT_SESSION_OPTIONS', () => {
      expect(DEFAULT_SESSION_OPTIONS).toBeDefined();
      expect(DEFAULT_SESSION_OPTIONS.autoExtractEntities).toBe(true);
      expect(DEFAULT_SESSION_OPTIONS.autoGenerateImages).toBe(true);
      expect(DEFAULT_SESSION_OPTIONS.autoPublishToKanka).toBe(false);
      expect(DEFAULT_SESSION_OPTIONS.maxImagesPerSession).toBe(3);
      expect(DEFAULT_SESSION_OPTIONS.imageQuality).toBe('high');
    });
  });

  // ── Constructor ───────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should initialize with default services and options', () => {
      const o = new SessionOrchestrator();
      expect(o.state).toBe(SessionState.IDLE);
      expect(o.currentSession).toBeNull();
      expect(o.isSessionActive).toBe(false);
      expect(o.isRecording).toBe(false);
    });

    it('should accept service instances', () => {
      const status = orchestrator.getServicesStatus();
      expect(status.audioRecorder).toBe(true);
      expect(status.transcriptionService).toBe(true);
      expect(status.entityExtractor).toBe(true);
      expect(status.imageGenerationService).toBe(true);
      expect(status.kankaService).toBe(true);
      expect(status.narrativeExporter).toBe(true);
    });

    it('should merge options with defaults', () => {
      const o = new SessionOrchestrator(services, { maxImagesPerSession: 10 });
      const opts = o.getOptions();
      expect(opts.maxImagesPerSession).toBe(10);
      expect(opts.autoExtractEntities).toBe(true); // default preserved
    });

    it('should initialize processors when services are provided', () => {
      // Internal processors created -> can process transcription
      expect(orchestrator._transcriptionProcessor).toBeTruthy();
      expect(orchestrator._entityProcessor).toBeTruthy();
      expect(orchestrator._imageProcessor).toBeTruthy();
      expect(orchestrator._kankaPublisher).toBeTruthy();
    });

    it('should handle missing services gracefully', () => {
      const o = new SessionOrchestrator({});
      expect(o._transcriptionProcessor).toBeNull();
      expect(o._entityProcessor).toBeNull();
      expect(o._imageProcessor).toBeNull();
      expect(o._kankaPublisher).toBeNull();
    });
  });

  // ── Getters ───────────────────────────────────────────────────────────

  describe('getters', () => {
    it('state should return current state', () => {
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });

    it('currentSession should return null when no session', () => {
      expect(orchestrator.currentSession).toBeNull();
    });

    it('isSessionActive should be false when idle', () => {
      expect(orchestrator.isSessionActive).toBe(false);
    });

    it('isRecording should be false when not recording', () => {
      expect(orchestrator.isRecording).toBe(false);
    });

    it('isLiveMode should be false initially', () => {
      expect(orchestrator.isLiveMode).toBe(false);
    });

    it('hasTranscriptionService should reflect service availability', () => {
      expect(orchestrator.hasTranscriptionService).toBe(true);
      const o = new SessionOrchestrator({});
      expect(o.hasTranscriptionService).toBe(false);
    });
  });

  // ── setCallbacks ──────────────────────────────────────────────────────

  describe('setCallbacks', () => {
    it('should set callback handlers', () => {
      const onStateChange = vi.fn();
      const onProgress = vi.fn();
      orchestrator.setCallbacks({ onStateChange, onProgress });
      expect(orchestrator._callbacks.onStateChange).toBe(onStateChange);
      expect(orchestrator._callbacks.onProgress).toBe(onProgress);
    });

    it('should merge with existing callbacks', () => {
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });
      orchestrator.setCallbacks({ onStateChange: vi.fn() });
      // setCallbacks merges via spread, so previously set callbacks are preserved
      expect(orchestrator._callbacks.onError).toBe(onError);
      expect(orchestrator._callbacks.onStateChange).toBeDefined();
    });
  });

  // ── startSession ──────────────────────────────────────────────────────

  describe('startSession', () => {
    it('should start a recording session', async () => {
      await orchestrator.startSession({ title: 'Test Session' });
      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(orchestrator.isSessionActive).toBe(true);
      expect(orchestrator.isRecording).toBe(true);
      expect(orchestrator.currentSession.title).toBe('Test Session');
      expect(services.audioRecorder.startRecording).toHaveBeenCalled();
    });

    it('should create session with default title if none provided', async () => {
      await orchestrator.startSession({});
      expect(orchestrator.currentSession.title).toContain('Session');
    });

    it('should set session properties', async () => {
      await orchestrator.startSession({
        title: 'My Session',
        date: '2024-06-15',
        speakerMap: { SPEAKER_00: 'DM' },
        language: 'en'
      });
      const session = orchestrator.currentSession;
      expect(session.date).toBe('2024-06-15');
      expect(session.speakerMap).toEqual({ SPEAKER_00: 'DM' });
      expect(session.language).toBe('en');
      expect(session.id).toMatch(/^session-/);
      expect(session.startTime).toBeTruthy();
      expect(session.errors).toEqual([]);
    });

    it('should pass recording options to audio recorder', async () => {
      await orchestrator.startSession({ recordingOptions: { source: 'mic' } });
      expect(services.audioRecorder.startRecording).toHaveBeenCalledWith({ source: 'mic' });
    });

    it('should throw if session already active', async () => {
      await orchestrator.startSession();
      await expect(orchestrator.startSession()).rejects.toThrow('A session is already active');
    });

    it('should throw if no audio recorder', async () => {
      const o = new SessionOrchestrator({});
      await expect(o.startSession()).rejects.toThrow('Audio recorder not configured');
    });

    it('should call onStateChange callback', async () => {
      const onStateChange = vi.fn();
      orchestrator.setCallbacks({ onStateChange });
      await orchestrator.startSession();
      expect(onStateChange).toHaveBeenCalledWith(
        SessionState.RECORDING,
        SessionState.IDLE,
        expect.objectContaining({ session: expect.any(Object) })
      );
    });

    it('should handle audio recorder failure', async () => {
      services.audioRecorder.startRecording.mockRejectedValue(new Error('Mic denied'));
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });
      await expect(orchestrator.startSession()).rejects.toThrow('Mic denied');
      expect(orchestrator.state).toBe(SessionState.ERROR);
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'startSession');
    });
  });

  // ── stopSession ───────────────────────────────────────────────────────

  describe('stopSession', () => {
    beforeEach(async () => {
      await orchestrator.startSession({ title: 'Session 1' });
    });

    it('should stop recording and process transcription by default', async () => {
      const result = await orchestrator.stopSession();
      expect(services.audioRecorder.stopRecording).toHaveBeenCalled();
      expect(result.audioBlob).toBeTruthy();
      expect(result.endTime).toBeTruthy();
    });

    it('should not process immediately when processImmediately is false', async () => {
      await orchestrator.stopSession({ processImmediately: false });
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });

    it('should throw if not recording', async () => {
      await orchestrator.stopSession({ processImmediately: false });
      await expect(orchestrator.stopSession()).rejects.toThrow('No recording in progress');
    });

    it('should handle stop failure', async () => {
      services.audioRecorder.stopRecording.mockRejectedValue(new Error('Stop failed'));
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });
      await expect(orchestrator.stopSession()).rejects.toThrow('Stop failed');
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'stopSession');
    });
  });

  // ── pauseRecording / resumeRecording ──────────────────────────────────

  describe('pauseRecording', () => {
    it('should pause recording in chronicle mode', async () => {
      await orchestrator.startSession();
      orchestrator.pauseRecording();
      expect(orchestrator.state).toBe(SessionState.PAUSED);
      expect(services.audioRecorder.pause).toHaveBeenCalled();
    });

    it('should throw if not recording', () => {
      expect(() => orchestrator.pauseRecording()).toThrow('Cannot pause');
    });

    it('should handle recorder without pause method', async () => {
      delete services.audioRecorder.pause;
      const o = new SessionOrchestrator(services);
      await o.startSession();
      expect(() => o.pauseRecording()).not.toThrow();
      expect(o.state).toBe(SessionState.PAUSED);
    });

    it('should clear live cycle timer when pausing in live mode', async () => {
      await orchestrator.startLiveMode();
      expect(orchestrator._liveCycleTimer).toBeTruthy();
      orchestrator.pauseRecording();
      expect(orchestrator.state).toBe(SessionState.PAUSED);
      expect(orchestrator._liveCycleTimer).toBeNull();
    });
  });

  describe('resumeRecording', () => {
    it('should resume recording in chronicle mode', async () => {
      await orchestrator.startSession();
      orchestrator.pauseRecording();
      orchestrator.resumeRecording();
      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(services.audioRecorder.resume).toHaveBeenCalled();
    });

    it('should resume in live mode state when live mode was active', async () => {
      await orchestrator.startLiveMode();
      orchestrator.pauseRecording();
      orchestrator.resumeRecording();
      expect(orchestrator.state).toBe(SessionState.LIVE_LISTENING);
    });

    it('should throw if not paused', () => {
      expect(() => orchestrator.resumeRecording()).toThrow('Cannot resume');
    });

    it('should handle recorder without resume method', async () => {
      delete services.audioRecorder.resume;
      const o = new SessionOrchestrator(services);
      await o.startSession();
      o.pauseRecording();
      expect(() => o.resumeRecording()).not.toThrow();
    });
  });

  // ── cancelSession ─────────────────────────────────────────────────────

  describe('cancelSession', () => {
    it('should cancel an active session', async () => {
      await orchestrator.startSession();
      orchestrator.cancelSession();
      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.currentSession).toBeNull();
      expect(services.audioRecorder.cancel).toHaveBeenCalled();
    });

    it('should do nothing if no session active', () => {
      orchestrator.cancelSession(); // no throw
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });

    it('should clear live cycle timer', async () => {
      await orchestrator.startLiveMode();
      orchestrator.cancelSession();
      expect(orchestrator._liveCycleTimer).toBeNull();
      expect(orchestrator._liveMode).toBe(false);
    });

    it('should handle recorder without cancel method', async () => {
      delete services.audioRecorder.cancel;
      const o = new SessionOrchestrator(services);
      await o.startSession();
      expect(() => o.cancelSession()).not.toThrow();
    });
  });

  // ── processTranscription ──────────────────────────────────────────────

  describe('processTranscription', () => {
    beforeEach(async () => {
      await orchestrator.startSession();
      await orchestrator.stopSession({ processImmediately: false });
    });

    it('should process audio blob and return transcript', async () => {
      const result = await orchestrator.processTranscription();
      expect(result).toBeTruthy();
      expect(orchestrator.currentSession.transcript).toBeTruthy();
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should auto-extract entities when enabled', async () => {
      await orchestrator.processTranscription();
      expect(orchestrator.currentSession.entities).toBeTruthy();
      expect(orchestrator.currentSession.entities.characters).toHaveLength(1);
    });

    it('should auto-generate images when enabled', async () => {
      await orchestrator.processTranscription();
      expect(orchestrator.currentSession.images).toBeTruthy();
    });

    it('should skip entity extraction when disabled', async () => {
      orchestrator.setOptions({ autoExtractEntities: false });
      await orchestrator.processTranscription();
      expect(orchestrator.currentSession.entities).toBeNull();
    });

    it('should skip image generation when disabled', async () => {
      orchestrator.setOptions({ autoGenerateImages: false });
      await orchestrator.processTranscription();
      expect(orchestrator.currentSession.images).toEqual([]);
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();
      orchestrator.setCallbacks({ onProgress });
      await orchestrator.processTranscription();
      expect(onProgress).toHaveBeenCalled();
    });

    it('should call onSessionComplete callback', async () => {
      const onSessionComplete = vi.fn();
      orchestrator.setCallbacks({ onSessionComplete });
      await orchestrator.processTranscription();
      expect(onSessionComplete).toHaveBeenCalledWith(orchestrator.currentSession);
    });

    it('should throw if no audio blob', async () => {
      const o = new SessionOrchestrator(services);
      o._currentSession = { audioBlob: null };
      await expect(o.processTranscription()).rejects.toThrow('No audio blob available');
    });

    it('should throw if no transcription processor', async () => {
      orchestrator._transcriptionProcessor = null;
      await expect(orchestrator.processTranscription()).rejects.toThrow(
        'Transcription service not configured'
      );
    });

    it('should pass speaker map and language options', async () => {
      await orchestrator.processTranscription({
        speakerMap: { SPEAKER_00: 'DM' },
        language: 'it'
      });
      // The transcription processor was called - verify via state change
      expect(orchestrator.currentSession.transcript).toBeTruthy();
    });

    it('should handle transcription failure', async () => {
      // Replace the processor to throw
      orchestrator._transcriptionProcessor = {
        processTranscription: vi.fn().mockRejectedValue(new Error('API Error'))
      };
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });
      await expect(orchestrator.processTranscription()).rejects.toThrow('API Error');
      expect(orchestrator.state).toBe(SessionState.ERROR);
    });
  });

  // ── _extractEntities ──────────────────────────────────────────────────

  describe('_extractEntities', () => {
    it('should return null if no transcript text', async () => {
      orchestrator._currentSession = { transcript: { text: '' }, errors: [] };
      const result = await orchestrator._extractEntities();
      expect(result).toBeNull();
    });

    it('should return null if no entity processor', async () => {
      orchestrator._entityProcessor = null;
      orchestrator._currentSession = { transcript: { text: 'some text' }, errors: [] };
      const result = await orchestrator._extractEntities();
      expect(result).toBeNull();
    });

    it('should store entities in session on success', async () => {
      orchestrator._currentSession = {
        transcript: { text: 'The wizard arrived' },
        title: 'Test',
        errors: []
      };
      const result = await orchestrator._extractEntities();
      expect(result).toBeTruthy();
      expect(orchestrator._currentSession.entities.characters).toHaveLength(1);
      expect(orchestrator._currentSession.moments).toHaveLength(1);
    });

    it('should record error when extraction returns null', async () => {
      orchestrator._entityProcessor.extractEntities = vi.fn().mockResolvedValue(null);
      orchestrator._currentSession = {
        transcript: { text: 'some text' },
        title: 'Test',
        errors: []
      };
      const result = await orchestrator._extractEntities();
      expect(result).toBeNull();
      expect(orchestrator._currentSession.errors).toHaveLength(1);
      expect(orchestrator._currentSession.errors[0].stage).toBe('extraction');
    });

    it('should auto-extract relationships when enabled', async () => {
      orchestrator.setOptions({ autoExtractRelationships: true });
      orchestrator._currentSession = {
        transcript: { text: 'Gandalf went to the Shire' },
        title: 'Test',
        errors: []
      };
      await orchestrator._extractEntities();
      expect(orchestrator._currentSession.relationships).toBeTruthy();
    });
  });

  // ── _extractRelationships ─────────────────────────────────────────────

  describe('_extractRelationships', () => {
    it('should return null when no transcript', async () => {
      orchestrator._currentSession = null;
      const result = await orchestrator._extractRelationships({});
      expect(result).toBeNull();
    });

    it('should return empty array when no entities', async () => {
      orchestrator._currentSession = {
        transcript: { text: 'test' },
        title: 'Test',
        errors: []
      };
      const result = await orchestrator._extractRelationships({
        characters: [],
        locations: [],
        items: []
      });
      expect(result).toEqual([]);
    });

    it('should store relationships in session', async () => {
      orchestrator._currentSession = {
        transcript: { text: 'Gandalf visited the Shire' },
        title: 'Test',
        errors: []
      };
      const result = await orchestrator._extractRelationships({
        characters: [{ name: 'Gandalf' }],
        locations: [{ name: 'Shire' }],
        items: []
      });
      expect(result).toHaveLength(1);
      expect(orchestrator._currentSession.relationships).toHaveLength(1);
    });

    it('should record error when extraction returns null', async () => {
      // Mock the EntityProcessor.extractRelationships directly to return null,
      // since the EntityProcessor wraps entityExtractor and converts null to []
      const o = new SessionOrchestrator(services);
      o._entityProcessor.extractRelationships = vi.fn().mockResolvedValue(null);
      o._currentSession = {
        transcript: { text: 'Gandalf arrived' },
        title: 'Test',
        errors: []
      };
      const result = await o._extractRelationships({
        characters: [{ name: 'Gandalf' }],
        locations: [],
        items: []
      });
      expect(result).toEqual([]);
      expect(o._currentSession.errors).toHaveLength(1);
      expect(o._currentSession.errors[0].stage).toBe('relationship_extraction');
    });
  });

  // ── _generateImages ───────────────────────────────────────────────────

  describe('_generateImages', () => {
    it('should return empty array when no image processor', async () => {
      orchestrator._imageProcessor = null;
      const result = await orchestrator._generateImages();
      expect(result).toEqual([]);
    });

    it('should generate images and store in session', async () => {
      orchestrator._currentSession = {
        moments: [{ id: 'm1', title: 'Battle', imagePrompt: 'scene' }],
        entities: {},
        images: [],
        errors: []
      };
      const result = await orchestrator._generateImages();
      expect(result).toHaveLength(1);
      expect(orchestrator._currentSession.images).toHaveLength(1);
    });

    it('should record error when generation returns empty', async () => {
      orchestrator._imageProcessor = {
        generateImages: vi.fn().mockResolvedValue([])
      };
      orchestrator._currentSession = {
        moments: [],
        entities: {},
        images: [],
        errors: []
      };
      const result = await orchestrator._generateImages();
      expect(orchestrator._currentSession.errors).toHaveLength(1);
      expect(orchestrator._currentSession.errors[0].stage).toBe('image_generation');
    });
  });

  // ── publishToKanka ────────────────────────────────────────────────────

  describe('publishToKanka', () => {
    beforeEach(async () => {
      await orchestrator.startSession({ title: 'Pub Session' });
      await orchestrator.stopSession({ processImmediately: false });
    });

    it('should publish session data to Kanka', async () => {
      const result = await orchestrator.publishToKanka();
      expect(result).toBeTruthy();
      expect(orchestrator.currentSession.kankaResults).toBeTruthy();
    });

    it('should throw if no session data', async () => {
      orchestrator._currentSession = null;
      await expect(orchestrator.publishToKanka()).rejects.toThrow('No session data');
    });

    it('should throw if no Kanka publisher', async () => {
      orchestrator._kankaPublisher = null;
      await expect(orchestrator.publishToKanka()).rejects.toThrow('Kanka service not configured');
    });

    it('should handle publishing failure', async () => {
      orchestrator._kankaPublisher = {
        publishSession: vi.fn().mockRejectedValue(new Error('Kanka error'))
      };
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });
      await expect(orchestrator.publishToKanka()).rejects.toThrow('Kanka error');
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'publishToKanka');
    });

    it('should store journal in chronicle when returned', async () => {
      orchestrator._kankaPublisher = {
        publishSession: vi.fn().mockResolvedValue({
          journal: { id: 1, name: 'Chronicle' },
          characters: [],
          locations: [],
          items: [],
          images: [],
          errors: []
        })
      };
      const result = await orchestrator.publishToKanka();
      expect(orchestrator.currentSession.chronicle).toEqual({ id: 1, name: 'Chronicle' });
    });
  });

  // ── setServices ───────────────────────────────────────────────────────

  describe('setServices', () => {
    it('should update services and reinitialize processors', () => {
      const o = new SessionOrchestrator({});
      expect(o._transcriptionProcessor).toBeNull();

      o.setServices({ transcriptionService: createMockTranscriptionService() });
      expect(o._transcriptionProcessor).toBeTruthy();
    });

    it('should update all service types', () => {
      const o = new SessionOrchestrator({});
      o.setServices({
        audioRecorder: createMockAudioRecorder(),
        transcriptionService: createMockTranscriptionService(),
        entityExtractor: createMockEntityExtractor(),
        imageGenerationService: createMockImageGenerationService(),
        kankaService: createMockKankaService(),
        narrativeExporter: createMockNarrativeExporter(),
        aiAssistant: createMockAIAssistant(),
        chapterTracker: createMockChapterTracker(),
        sceneDetector: createMockSceneDetector(),
        sessionAnalytics: createMockSessionAnalytics()
      });
      const status = o.getServicesStatus();
      expect(status.audioRecorder).toBe(true);
      expect(status.aiAssistant).toBe(true);
    });
  });

  // ── setOptions / getOptions ───────────────────────────────────────────

  describe('setOptions / getOptions', () => {
    it('should merge new options', () => {
      orchestrator.setOptions({ maxImagesPerSession: 5 });
      expect(orchestrator.getOptions().maxImagesPerSession).toBe(5);
      expect(orchestrator.getOptions().autoExtractEntities).toBe(true);
    });

    it('should return a copy of options', () => {
      const opts = orchestrator.getOptions();
      opts.maxImagesPerSession = 999;
      expect(orchestrator.getOptions().maxImagesPerSession).not.toBe(999);
    });
  });

  // ── setTranscriptionConfig ────────────────────────────────────────────

  describe('setTranscriptionConfig', () => {
    it('should create a new TranscriptionProcessor with config', () => {
      const config = { mode: 'auto', openaiApiKey: 'sk-test' };
      orchestrator.setTranscriptionConfig(config);
      expect(orchestrator._transcriptionConfig).toEqual(config);
      expect(orchestrator._transcriptionProcessor).toBeTruthy();
    });

    it('should not create processor if no transcription service', () => {
      const o = new SessionOrchestrator({});
      o.setTranscriptionConfig({ mode: 'api' });
      expect(o._transcriptionProcessor).toBeNull();
    });
  });

  // ── setNarratorServices ───────────────────────────────────────────────

  describe('setNarratorServices', () => {
    it('should set narrator service instances', () => {
      const o = new SessionOrchestrator({});
      const ai = createMockAIAssistant();
      const chapter = createMockChapterTracker();
      const scene = createMockSceneDetector();
      const analytics = createMockSessionAnalytics();
      const journalParser = createMockJournalParser();

      o.setNarratorServices({
        aiAssistant: ai,
        chapterTracker: chapter,
        sceneDetector: scene,
        sessionAnalytics: analytics,
        journalParser: journalParser
      });

      expect(o._aiAssistant).toBe(ai);
      expect(o._chapterTracker).toBe(chapter);
      expect(o._sceneDetector).toBe(scene);
      expect(o._sessionAnalytics).toBe(analytics);
      expect(o._journalParser).toBe(journalParser);
    });

    it('should accept empty object', () => {
      expect(() => orchestrator.setNarratorServices({})).not.toThrow();
    });
  });

  // ── getServicesStatus ─────────────────────────────────────────────────

  describe('getServicesStatus', () => {
    it('should report all service statuses', () => {
      const status = orchestrator.getServicesStatus();
      expect(status.canRecord).toBe(true);
      expect(status.canTranscribe).toBe(true);
      expect(status.canPublish).toBe(true);
      expect(status.canLiveMode).toBe(true);
    });

    it('should report canLiveMode false without all 3 required services', () => {
      const o = new SessionOrchestrator({
        audioRecorder: createMockAudioRecorder(),
        transcriptionService: createMockTranscriptionService()
        // no aiAssistant
      });
      expect(o.getServicesStatus().canLiveMode).toBe(false);
    });
  });

  // ── startLiveMode ─────────────────────────────────────────────────────

  describe('startLiveMode', () => {
    it('should start live mode', async () => {
      await orchestrator.startLiveMode();
      expect(orchestrator.isLiveMode).toBe(true);
      expect(orchestrator.state).toBe(SessionState.LIVE_LISTENING);
      expect(orchestrator.currentSession).toBeTruthy();
      expect(services.audioRecorder.startRecording).toHaveBeenCalled();
    });

    it('should start analytics session', async () => {
      await orchestrator.startLiveMode();
      expect(services.sessionAnalytics.startSession).toHaveBeenCalled();
    });

    it('should accept custom batch duration', async () => {
      await orchestrator.startLiveMode({ batchDuration: 5000 });
      expect(orchestrator._liveBatchDuration).toBe(5000);
    });

    it('should create session with live mode defaults', async () => {
      await orchestrator.startLiveMode({ title: 'Live Test', language: 'en' });
      expect(orchestrator.currentSession.title).toBe('Live Test');
      expect(orchestrator.currentSession.language).toBe('en');
    });

    it('should reuse existing session if present', async () => {
      await orchestrator.startSession();
      orchestrator.cancelSession();
      orchestrator._currentSession = { id: 'existing', errors: [] };
      // Reset liveMode since cancelSession sets it to false
      await orchestrator.startLiveMode();
      expect(orchestrator.currentSession.id).toBe('existing');
    });

    it('should throw if live mode already active', async () => {
      await orchestrator.startLiveMode();
      await expect(orchestrator.startLiveMode()).rejects.toThrow('already active');
    });

    it('should throw if no audio recorder', async () => {
      const o = new SessionOrchestrator({
        transcriptionService: createMockTranscriptionService(),
        aiAssistant: createMockAIAssistant()
      });
      await expect(o.startLiveMode()).rejects.toThrow('Audio recorder not configured');
    });

    it('should throw if no transcription service', async () => {
      const o = new SessionOrchestrator({
        audioRecorder: createMockAudioRecorder()
      });
      await expect(o.startLiveMode()).rejects.toThrow('Transcription service not configured');
    });

    it('should handle start failure and reset live mode', async () => {
      services.audioRecorder.startRecording.mockRejectedValue(new Error('Mic denied'));
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });
      await expect(orchestrator.startLiveMode()).rejects.toThrow('Mic denied');
      expect(orchestrator.isLiveMode).toBe(false);
    });

    it('should schedule live cycle timer', async () => {
      await orchestrator.startLiveMode();
      expect(orchestrator._liveCycleTimer).toBeTruthy();
    });
  });

  // ── stopLiveMode ──────────────────────────────────────────────────────

  describe('stopLiveMode', () => {
    it('should stop live mode and return session data', async () => {
      await orchestrator.startLiveMode();
      const result = await orchestrator.stopLiveMode();
      expect(result).toBeTruthy();
      expect(orchestrator.isLiveMode).toBe(false);
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });

    it('should end analytics session', async () => {
      await orchestrator.startLiveMode();
      await orchestrator.stopLiveMode();
      expect(services.sessionAnalytics.endSession).toHaveBeenCalled();
    });

    it('should assemble transcript from live segments', async () => {
      await orchestrator.startLiveMode();
      orchestrator._liveTranscript = [
        { text: 'Hello', speaker: 'SPEAKER_00' },
        { text: 'World', speaker: 'SPEAKER_01' }
      ];
      const result = await orchestrator.stopLiveMode();
      expect(result.transcript.text).toBe('Hello World');
      expect(result.transcript.segments).toHaveLength(2);
    });

    it('should clear live cycle timer', async () => {
      await orchestrator.startLiveMode();
      await orchestrator.stopLiveMode();
      expect(orchestrator._liveCycleTimer).toBeNull();
    });

    it('should return gracefully if not in live mode', async () => {
      const result = await orchestrator.stopLiveMode();
      expect(result).toBeNull();
    });

    it('should handle stop failure', async () => {
      await orchestrator.startLiveMode();
      services.audioRecorder.stopRecording.mockRejectedValue(new Error('Stop error'));
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });
      await expect(orchestrator.stopLiveMode()).rejects.toThrow('Stop error');
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'stopLiveMode');
    });
  });

  // ── _liveCycle ────────────────────────────────────────────────────────

  describe('_liveCycle', () => {
    it('should skip if live mode is not active', async () => {
      await orchestrator._liveCycle();
      // Should not throw or change state
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });

    it('should transcribe audio chunk and add segments', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );

      await orchestrator._liveCycle();

      expect(services.transcriptionService.transcribe).toHaveBeenCalled();
      expect(orchestrator._liveTranscript.length).toBeGreaterThan(0);
    });

    it('should call scene detector when segments received', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );

      await orchestrator._liveCycle();
      expect(services.sceneDetector.detectSceneTransition).toHaveBeenCalled();
    });

    it('should add segments to session analytics', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );

      await orchestrator._liveCycle();
      expect(services.sessionAnalytics.addSegment).toHaveBeenCalled();
    });

    it('should handle silence (null chunk)', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockResolvedValue(null);

      await orchestrator._liveCycle();
      expect(orchestrator._silenceStartTime).toBeTruthy();
    });

    it('should handle empty blob (size = 0)', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockResolvedValue(new Blob([], { type: 'audio/webm' }));

      await orchestrator._liveCycle();
      expect(orchestrator._silenceStartTime).toBeTruthy();
    });

    it('should handle cycle errors gracefully', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('Chunk error'));
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      await orchestrator._liveCycle();
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'live_cycle');
      expect(orchestrator.currentSession.errors.length).toBeGreaterThan(0);
    });

    it('should reschedule after successful cycle', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      // Clear timer set by startLiveMode
      clearTimeout(orchestrator._liveCycleTimer);
      orchestrator._liveCycleTimer = null;

      services.audioRecorder.getLatestChunk.mockResolvedValue(null);
      await orchestrator._liveCycle();

      expect(orchestrator._liveCycleTimer).toBeTruthy();
    });

    it('should reschedule after error cycle', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      clearTimeout(orchestrator._liveCycleTimer);
      orchestrator._liveCycleTimer = null;

      services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('fail'));
      await orchestrator._liveCycle();

      // Still reschedules because of finally block
      expect(orchestrator._liveCycleTimer).toBeTruthy();
    });

    it('should not reschedule if live mode stopped during cycle', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // Simulate stopping during chunk capture
      services.audioRecorder.getLatestChunk.mockImplementation(async () => {
        orchestrator._liveMode = false;
        return new Blob(['audio'], { type: 'audio/webm' });
      });

      clearTimeout(orchestrator._liveCycleTimer);
      orchestrator._liveCycleTimer = null;
      await orchestrator._liveCycle();

      // Should not reschedule because liveMode became false
      expect(orchestrator._liveCycleTimer).toBeNull();
    });

    it('should discard result if live mode stopped during transcription', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );
      services.transcriptionService.transcribe.mockImplementation(async () => {
        orchestrator._liveMode = false;
        return { text: 'discarded', segments: [{ text: 'discarded' }] };
      });

      await orchestrator._liveCycle();
      // Segments should not be added because live mode was stopped
      expect(orchestrator._liveTranscript).toHaveLength(0);
    });

    it('should handle transcription returning no segments', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );
      services.transcriptionService.transcribe.mockResolvedValue({
        text: '',
        segments: []
      });

      await orchestrator._liveCycle();
      expect(orchestrator._liveTranscript).toHaveLength(0);
    });
  });

  // ── _runAIAnalysis ────────────────────────────────────────────────────

  describe('_runAIAnalysis', () => {
    it('should skip if no AI assistant', async () => {
      orchestrator._aiAssistant = null;
      await orchestrator._runAIAnalysis({ text: 'test' });
      // No error thrown
    });

    it('should skip if live mode not active', async () => {
      orchestrator._liveMode = false;
      await orchestrator._runAIAnalysis({ text: 'test' });
      expect(services.aiAssistant.analyzeContext).not.toHaveBeenCalled();
    });

    it('should run analysis and store results', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'The dragon appeared' }];

      await orchestrator._runAIAnalysis({ text: 'The dragon appeared' });
      expect(services.aiAssistant.analyzeContext).toHaveBeenCalled();
      expect(orchestrator._lastAISuggestions).toBeTruthy();
      expect(orchestrator._lastOffTrackStatus).toBeDefined();
    });

    it('should update chapter context when available', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test' }];
      services.chapterTracker.getCurrentChapter.mockReturnValue({
        title: 'Chapter 1',
        subchapters: [{ title: 'Scene A' }],
        pageId: 'page1',
        pageName: 'Page 1',
        journalName: 'Journal 1',
        content: 'Content here'
      });

      await orchestrator._runAIAnalysis({ text: 'test' });
      expect(services.aiAssistant.setChapterContext).toHaveBeenCalled();
    });

    it('should trigger UI update via onStateChange callback', async () => {
      const onStateChange = vi.fn();
      orchestrator.setCallbacks({ onStateChange });
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test' }];

      await orchestrator._runAIAnalysis({ text: 'test' });
      expect(onStateChange).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { suggestionsReady: true }
      );
    });

    it('should handle off-track detection', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test' }];
      services.aiAssistant.analyzeContext.mockResolvedValue({
        suggestions: [],
        offTrack: { isOffTrack: true, severity: 'high', reason: 'Went off topic' }
      });

      await orchestrator._runAIAnalysis({ text: 'test' });
      expect(orchestrator._lastOffTrackStatus.isOffTrack).toBe(true);
    });

    it('should handle AI analysis error gracefully', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test' }];
      services.aiAssistant.analyzeContext.mockRejectedValue(new Error('AI error'));
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      await orchestrator._runAIAnalysis({ text: 'test' });
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'ai_analysis');
    });
  });

  // ── _handleSilence ────────────────────────────────────────────────────

  describe('_handleSilence', () => {
    it('should set silence start time on first call', () => {
      orchestrator._handleSilence();
      expect(orchestrator._silenceStartTime).toBeTruthy();
    });

    it('should not fire callback before threshold', () => {
      const onSilenceDetected = vi.fn();
      orchestrator.setCallbacks({ onSilenceDetected });
      orchestrator._silenceStartTime = Date.now() - 1000; // 1s ago
      orchestrator._handleSilence();
      expect(onSilenceDetected).not.toHaveBeenCalled();
    });

    it('should fire callback after threshold', () => {
      const onSilenceDetected = vi.fn();
      orchestrator.setCallbacks({ onSilenceDetected });
      orchestrator._silenceStartTime = Date.now() - 31000; // 31s ago
      orchestrator._handleSilence();
      expect(onSilenceDetected).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  // ── updateChapter ─────────────────────────────────────────────────────

  describe('updateChapter', () => {
    it('should call chapter tracker updateFromScene', () => {
      const scene = { id: 'scene1' };
      orchestrator.updateChapter(scene);
      expect(services.chapterTracker.updateFromScene).toHaveBeenCalledWith(scene);
    });

    it('should not throw without chapter tracker', () => {
      orchestrator._chapterTracker = null;
      expect(() => orchestrator.updateChapter({})).not.toThrow();
    });
  });

  // ── getAISuggestions / getOffTrackStatus / getCurrentChapter ──────────

  describe('accessor methods', () => {
    it('getAISuggestions should return stored suggestions', () => {
      orchestrator._lastAISuggestions = [{ type: 'narration', content: 'test' }];
      expect(orchestrator.getAISuggestions()).toHaveLength(1);
    });

    it('getOffTrackStatus should return stored status', () => {
      orchestrator._lastOffTrackStatus = { isOffTrack: true };
      expect(orchestrator.getOffTrackStatus().isOffTrack).toBe(true);
    });

    it('getCurrentChapter should delegate to tracker', () => {
      services.chapterTracker.getCurrentChapter.mockReturnValue({ title: 'Ch1' });
      expect(orchestrator.getCurrentChapter()).toEqual({ title: 'Ch1' });
    });

    it('getCurrentChapter should return null without tracker', () => {
      orchestrator._chapterTracker = null;
      expect(orchestrator.getCurrentChapter()).toBeNull();
    });
  });

  // ── getSessionSummary ─────────────────────────────────────────────────

  describe('getSessionSummary', () => {
    it('should return null when no session', () => {
      expect(orchestrator.getSessionSummary()).toBeNull();
    });

    it('should return summary of active session', async () => {
      await orchestrator.startSession({ title: 'Summary Test' });
      const summary = orchestrator.getSessionSummary();
      expect(summary.title).toBe('Summary Test');
      expect(summary.state).toBe(SessionState.RECORDING);
      expect(summary.hasAudio).toBe(false);
      expect(summary.hasTranscript).toBe(false);
      expect(summary.segmentCount).toBe(0);
      expect(summary.entityCount).toBe(0);
      expect(summary.relationshipCount).toBe(0);
      expect(summary.momentCount).toBe(0);
      expect(summary.imageCount).toBe(0);
      expect(summary.hasChronicle).toBe(false);
      expect(summary.errorCount).toBe(0);
    });

    it('should count entities and images correctly', async () => {
      await orchestrator.startSession();
      orchestrator._currentSession.entities = {
        characters: [{ name: 'A' }],
        locations: [{ name: 'B' }, { name: 'C' }],
        items: []
      };
      orchestrator._currentSession.relationships = [{ source: 'A', target: 'B' }];
      orchestrator._currentSession.moments = [{ id: 1 }];
      orchestrator._currentSession.images = [
        { success: true },
        { success: false },
        { success: true }
      ];
      orchestrator._currentSession.chronicle = { id: 1 };

      const summary = orchestrator.getSessionSummary();
      expect(summary.entityCount).toBe(3);
      expect(summary.relationshipCount).toBe(1);
      expect(summary.momentCount).toBe(1);
      expect(summary.imageCount).toBe(2);
      expect(summary.hasChronicle).toBe(true);
    });
  });

  // ── reset ─────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('should reset all state to initial values', async () => {
      await orchestrator.startLiveMode();
      orchestrator._liveTranscript = [{ text: 'data' }];
      orchestrator._lastAISuggestions = [{ type: 'test' }];
      orchestrator._lastOffTrackStatus = { isOffTrack: true };
      orchestrator._silenceStartTime = Date.now();

      orchestrator.reset();

      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.currentSession).toBeNull();
      expect(orchestrator.isLiveMode).toBe(false);
      expect(orchestrator._liveTranscript).toEqual([]);
      expect(orchestrator._lastAISuggestions).toBeNull();
      expect(orchestrator._lastOffTrackStatus).toBeNull();
      expect(orchestrator._silenceStartTime).toBeNull();
      expect(orchestrator._liveCycleTimer).toBeNull();
    });

    it('should call audioRecorder.cancel', async () => {
      await orchestrator.startSession();
      orchestrator.reset();
      expect(services.audioRecorder.cancel).toHaveBeenCalled();
    });
  });

  // ── _isLiveState ──────────────────────────────────────────────────────

  describe('_isLiveState', () => {
    it('should return true for live states', () => {
      expect(orchestrator._isLiveState(SessionState.LIVE_LISTENING)).toBe(true);
      expect(orchestrator._isLiveState(SessionState.LIVE_TRANSCRIBING)).toBe(true);
      expect(orchestrator._isLiveState(SessionState.LIVE_ANALYZING)).toBe(true);
    });

    it('should return false for non-live states', () => {
      expect(orchestrator._isLiveState(SessionState.IDLE)).toBe(false);
      expect(orchestrator._isLiveState(SessionState.RECORDING)).toBe(false);
      expect(orchestrator._isLiveState(SessionState.PROCESSING)).toBe(false);
    });
  });

  // ── _generateSessionId ────────────────────────────────────────────────

  describe('_generateSessionId', () => {
    it('should generate unique IDs', () => {
      const id1 = orchestrator._generateSessionId();
      const id2 = orchestrator._generateSessionId();
      expect(id1).toMatch(/^session-/);
      expect(id2).toMatch(/^session-/);
      expect(id1).not.toBe(id2);
    });
  });

  // ── _getSessionDuration ───────────────────────────────────────────────

  describe('_getSessionDuration', () => {
    it('should return 0 without session', () => {
      expect(orchestrator._getSessionDuration()).toBe(0);
    });

    it('should calculate duration from start to end', async () => {
      await orchestrator.startSession();
      orchestrator._currentSession.startTime = Date.now() - 5000;
      orchestrator._currentSession.endTime = Date.now();
      const duration = orchestrator._getSessionDuration();
      expect(duration).toBe(5);
    });

    it('should use current time if no endTime', async () => {
      await orchestrator.startSession();
      orchestrator._currentSession.startTime = Date.now() - 3000;
      const duration = orchestrator._getSessionDuration();
      expect(duration).toBe(3);
    });
  });

  // ── _enrichSessionWithJournalContext ───────────────────────────────────

  describe('_enrichSessionWithJournalContext', () => {
    it('should skip without journal parser', async () => {
      orchestrator._journalParser = null;
      await orchestrator._enrichSessionWithJournalContext();
      // No error
    });

    it('should handle missing canvas/game gracefully', async () => {
      orchestrator.setNarratorServices({ journalParser: createMockJournalParser() });
      // No canvas or game.journal defined -> should not throw
      await orchestrator._enrichSessionWithJournalContext();
    });
  });

  // ── _initializeJournalContext ─────────────────────────────────────────

  describe('_initializeJournalContext', () => {
    it('should skip without AI assistant or journal parser', async () => {
      orchestrator._aiAssistant = null;
      await orchestrator._initializeJournalContext();
      // No error
    });

    it('should handle errors gracefully', async () => {
      const jp = createMockJournalParser();
      jp.parseJournal.mockRejectedValue(new Error('Parse error'));
      orchestrator.setNarratorServices({ journalParser: jp });

      // Should not throw
      await orchestrator._initializeJournalContext();
    });
  });

  // ── _handleError ──────────────────────────────────────────────────────

  describe('_handleError', () => {
    it('should update state to ERROR', () => {
      orchestrator._handleError(new Error('test'), 'testStage');
      expect(orchestrator.state).toBe(SessionState.ERROR);
    });

    it('should push error to session errors array', async () => {
      await orchestrator.startSession();
      orchestrator._handleError(new Error('test error'), 'someStage');
      expect(orchestrator.currentSession.errors).toHaveLength(1);
      expect(orchestrator.currentSession.errors[0].stage).toBe('someStage');
      expect(orchestrator.currentSession.errors[0].error).toBe('test error');
    });

    it('should call onError callback', () => {
      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });
      const error = new Error('test');
      orchestrator._handleError(error, 'stage');
      expect(onError).toHaveBeenCalledWith(error, 'stage');
    });
  });
});
