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
      offTrackStatus: { isOffTrack: false }
    }),
    setAdventureContext: vi.fn(),
    setChapterContext: vi.fn(),
    setOnAutonomousSuggestionCallback: vi.fn(),
    startSilenceMonitoring: vi.fn().mockReturnValue(true),
    stopSilenceMonitoring: vi.fn(),
    recordActivityForSilenceDetection: vi.fn().mockReturnValue(true),
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

    it('should return early when _isStopping is true (race condition guard)', async () => {
      await orchestrator.startSession();
      orchestrator._isStopping = true;
      orchestrator.cancelSession();
      // audioRecorder.cancel should NOT be called because the guard returns early
      expect(services.audioRecorder.cancel).not.toHaveBeenCalled();
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

    it('should skip relationship extraction when extraction result has warnings', async () => {
      orchestrator.setOptions({ autoExtractRelationships: true });
      // Mock extractAll to return a result with a non-empty warnings array
      orchestrator._entityProcessor.extractAll = vi.fn().mockResolvedValue({
        characters: [{ name: 'Gandalf', description: 'A wizard' }],
        locations: [],
        items: [],
        moments: [],
        totalCount: 1,
        warnings: ['Partial extraction failure: some entities could not be parsed']
      });
      orchestrator._entityProcessor.extractRelationships = vi.fn().mockResolvedValue([]);
      orchestrator._currentSession = {
        transcript: { text: 'Gandalf went to the Shire' },
        title: 'Test',
        errors: []
      };
      await orchestrator._extractEntities();
      // extractRelationships should NOT have been called due to warnings
      expect(orchestrator._entityProcessor.extractRelationships).not.toHaveBeenCalled();
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

    it('should handle stop failure gracefully (always reach IDLE)', async () => {
      await orchestrator.startLiveMode();
      services.audioRecorder.stopRecording.mockRejectedValue(new Error('Stop error'));

      // New behavior: stopLiveMode never throws -- it always reaches IDLE
      const result = await orchestrator.stopLiveMode();
      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator._isStopping).toBe(false);
      expect(result).toBeTruthy();
    });

    it('should prevent concurrent stopLiveMode calls (race condition guard)', async () => {
      await orchestrator.startLiveMode();

      // Make stopRecording slow to simulate async delay
      let resolveStop;
      services.audioRecorder.stopRecording.mockReturnValue(
        new Promise(resolve => { resolveStop = resolve; })
      );

      // Call stopLiveMode twice concurrently
      const stop1 = orchestrator.stopLiveMode();
      const stop2 = orchestrator.stopLiveMode();

      // The second call should return immediately (guarded by _isStopping)
      const result2 = await stop2;
      expect(result2).toBeTruthy(); // returns _currentSession

      // Resolve the first call
      resolveStop(new Blob(['audio'], { type: 'audio/webm' }));
      await stop1;

      // stopRecording should only be called once
      expect(services.audioRecorder.stopRecording).toHaveBeenCalledTimes(1);
      // endSession should only be called once
      expect(services.sessionAnalytics.endSession).toHaveBeenCalledTimes(1);
    });

    it('should clear _isStopping flag after successful stop', async () => {
      await orchestrator.startLiveMode();
      await orchestrator.stopLiveMode();
      expect(orchestrator._isStopping).toBe(false);
    });

    it('should clear _isStopping flag after failed stop', async () => {
      await orchestrator.startLiveMode();
      services.audioRecorder.stopRecording.mockRejectedValue(new Error('Stop error'));
      try {
        await orchestrator.stopLiveMode();
      } catch {
        // expected
      }
      expect(orchestrator._isStopping).toBe(false);
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

    it('should notify user after 3 consecutive live cycle errors (H-1)', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('API error'));

      // First two failures: no notification
      await orchestrator._liveCycle();
      await orchestrator._liveCycle();
      expect(ui.notifications.warn).not.toHaveBeenCalled();

      // Third failure: notification fires
      await orchestrator._liveCycle();
      expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining('VOXCHRONICLE.Errors.LiveCycleRepeatedFailures')
      );
    });

    it('should only notify once at exactly 3 consecutive errors', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('API error'));

      // Trigger 5 errors
      for (let i = 0; i < 5; i++) {
        await orchestrator._liveCycle();
      }

      // Notification fires only once (at error #3)
      expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
    });

    it('should reset consecutive error counter on success (H-1)', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // Trigger 2 errors
      services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('fail'));
      await orchestrator._liveCycle();
      await orchestrator._liveCycle();
      expect(orchestrator._consecutiveLiveCycleErrors).toBe(2);

      // Successful cycle resets counter
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );
      services.transcriptionService.transcribe.mockResolvedValue({
        text: 'Hello', segments: [{ text: 'Hello' }]
      });
      await orchestrator._liveCycle();
      expect(orchestrator._consecutiveLiveCycleErrors).toBe(0);

      // Now 2 more errors should not trigger notification (counter was reset)
      services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('fail'));
      await orchestrator._liveCycle();
      await orchestrator._liveCycle();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
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
        offTrackStatus: { isOffTrack: true, severity: 'high', reason: 'Went off topic' }
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

    it('should notify user once on AI analysis failure (H-2)', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test' }];
      services.aiAssistant.analyzeContext.mockRejectedValue(new Error('AI error'));

      // First failure: notification fires
      await orchestrator._runAIAnalysis({ text: 'test' });
      expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining('VOXCHRONICLE.Errors.AIAnalysisFailed')
      );

      // Second failure: no additional notification (once-only)
      await orchestrator._runAIAnalysis({ text: 'test' });
      expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
    });

    it('should reset AI analysis notification flag on startLiveMode (H-2)', async () => {
      orchestrator._aiAnalysisErrorNotified = true;
      await orchestrator.startLiveMode();
      expect(orchestrator._aiAnalysisErrorNotified).toBe(false);
    });

    it('should call costTracker.addUsage when analysis returns usage', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'The party enters' }];
      // Manually create costTracker so we can spy on it
      const { CostTracker } = await import('../../scripts/orchestration/CostTracker.mjs');
      orchestrator._costTracker = new CostTracker();
      const addUsageSpy = vi.spyOn(orchestrator._costTracker, 'addUsage');

      services.aiAssistant.analyzeContext.mockResolvedValue({
        suggestions: [{ type: 'narration', content: 'Describe the scene' }],
        offTrackStatus: { isOffTrack: false },
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
        model: 'gpt-4o-mini-2024-07-18'
      });

      await orchestrator._runAIAnalysis({ text: 'The party enters' });

      expect(addUsageSpy).toHaveBeenCalledWith(
        'gpt-4o-mini-2024-07-18',
        { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 }
      );
    });

    it('should not call costTracker.addUsage when analysis has no usage', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test' }];
      const { CostTracker } = await import('../../scripts/orchestration/CostTracker.mjs');
      orchestrator._costTracker = new CostTracker();
      const addUsageSpy = vi.spyOn(orchestrator._costTracker, 'addUsage');

      services.aiAssistant.analyzeContext.mockResolvedValue({
        suggestions: [],
        offTrackStatus: { isOffTrack: false },
        usage: null,
        model: 'gpt-4o-mini'
      });

      await orchestrator._runAIAnalysis({ text: 'test' });

      expect(addUsageSpy).not.toHaveBeenCalled();
    });

    it('should default to gpt-4o-mini when analysis.model is missing', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test' }];
      const { CostTracker } = await import('../../scripts/orchestration/CostTracker.mjs');
      orchestrator._costTracker = new CostTracker();
      const addUsageSpy = vi.spyOn(orchestrator._costTracker, 'addUsage');

      services.aiAssistant.analyzeContext.mockResolvedValue({
        suggestions: [],
        offTrackStatus: { isOffTrack: false },
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 }
        // no model field
      });

      await orchestrator._runAIAnalysis({ text: 'test' });

      expect(addUsageSpy).toHaveBeenCalledWith(
        'gpt-4o-mini',
        { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 }
      );
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

    it('should clear _isStopping flag', async () => {
      orchestrator._isStopping = true;
      orchestrator.reset();
      expect(orchestrator._isStopping).toBe(false);
    });

    it('should stop silence monitoring on reset', () => {
      orchestrator.reset();
      expect(services.aiAssistant.stopSilenceMonitoring).toHaveBeenCalled();
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

  // ── _createSessionObject ─────────────────────────────────────────────

  describe('_createSessionObject', () => {
    it('should create session object with defaults', () => {
      const session = orchestrator._createSessionObject({});
      expect(session.id).toBeTruthy();
      expect(session.startTime).toBeGreaterThan(0);
      expect(session.endTime).toBeNull();
      expect(session.audioBlob).toBeNull();
      expect(session.transcript).toBeNull();
      expect(session.entities).toBeNull();
      expect(session.relationships).toBeNull();
      expect(session.moments).toBeNull();
      expect(session.images).toEqual([]);
      expect(session.chronicle).toBeNull();
      expect(session.kankaResults).toBeNull();
      expect(session.errors).toEqual([]);
      expect(session.speakerMap).toEqual({});
      expect(session.language).toBeNull();
    });

    it('should generate a default title with date', () => {
      const session = orchestrator._createSessionObject({});
      expect(session.title).toMatch(/^Session /);
    });

    it('should generate a default date in YYYY-MM-DD format', () => {
      const session = orchestrator._createSessionObject({});
      expect(session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should apply title override', () => {
      const session = orchestrator._createSessionObject({ title: 'Custom Title' });
      expect(session.title).toBe('Custom Title');
    });

    it('should apply date override', () => {
      const session = orchestrator._createSessionObject({ date: '2025-12-25' });
      expect(session.date).toBe('2025-12-25');
    });

    it('should apply speakerMap override', () => {
      const map = { 'SPEAKER_00': 'GM' };
      const session = orchestrator._createSessionObject({ speakerMap: map });
      expect(session.speakerMap).toBe(map);
    });

    it('should apply language override', () => {
      const session = orchestrator._createSessionObject({ language: 'it' });
      expect(session.language).toBe('it');
    });

    it('should generate unique IDs', () => {
      const s1 = orchestrator._createSessionObject({});
      const s2 = orchestrator._createSessionObject({});
      expect(s1.id).not.toBe(s2.id);
    });

    it('should return independent arrays for images and errors', () => {
      const s1 = orchestrator._createSessionObject({});
      const s2 = orchestrator._createSessionObject({});
      s1.images.push('img.png');
      s1.errors.push('err');
      expect(s2.images).toEqual([]);
      expect(s2.errors).toEqual([]);
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

    it('should populate session with journal text and NPC profiles', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('Thorin the blacksmith guards the mountain pass.');
      jp.extractNPCProfiles.mockReturnValue([
        { name: 'Thorin', description: 'A gruff blacksmith', personality: 'stubborn', pages: ['p1'] }
      ]);

      orchestrator.setNarratorServices({ journalParser: jp });
      orchestrator._currentSession = {
        id: 'session-1',
        title: 'Test Session',
        errors: []
      };

      globalThis.canvas = { scene: { journal: 'journal-1' } };

      await orchestrator._enrichSessionWithJournalContext();

      expect(jp.parseJournal).toHaveBeenCalledWith('journal-1');
      expect(orchestrator._currentSession.journalText).toBe(
        'Thorin the blacksmith guards the mountain pass.'
      );
      expect(orchestrator._currentSession.npcProfiles).toHaveLength(1);
      expect(orchestrator._currentSession.npcProfiles[0].name).toBe('Thorin');

      delete globalThis.canvas;
    });

    it('should not set npcProfiles when none are found', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('Some journal text.');
      jp.extractNPCProfiles.mockReturnValue([]);

      orchestrator.setNarratorServices({ journalParser: jp });
      orchestrator._currentSession = {
        id: 'session-1',
        title: 'Test Session',
        errors: []
      };

      globalThis.canvas = { scene: { journal: 'journal-1' } };

      await orchestrator._enrichSessionWithJournalContext();

      expect(orchestrator._currentSession.journalText).toBe('Some journal text.');
      expect(orchestrator._currentSession.npcProfiles).toBeUndefined();

      delete globalThis.canvas;
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

    it('should load journal context from scene-linked journal', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('The heroes begin their quest in the ancient forest.');
      const ai = createMockAIAssistant();
      const ct = createMockChapterTracker();
      ct.getCurrentChapter.mockReturnValue({
        title: 'Chapter 1: The Forest',
        subchapters: [{ title: 'Encounter' }],
        pageId: 'page-1',
        pageName: 'Forest Page',
        journalName: 'Adventure',
        content: 'The ancient forest is dark and foreboding.'
      });

      orchestrator.setNarratorServices({
        journalParser: jp,
        aiAssistant: ai,
        chapterTracker: ct
      });

      // Mock canvas.scene.journal
      globalThis.canvas = { scene: { journal: 'journal-1', name: 'Forest Scene' } };

      await orchestrator._initializeJournalContext();

      expect(jp.parseJournal).toHaveBeenCalledWith('journal-1');
      expect(ai.setAdventureContext).toHaveBeenCalledWith(
        'The heroes begin their quest in the ancient forest.'
      );
      expect(ct.setSelectedJournal).toHaveBeenCalledWith('journal-1');
      expect(ct.updateFromScene).toHaveBeenCalled();
      expect(ai.setChapterContext).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterName: 'Chapter 1: The Forest',
          summary: 'The ancient forest is dark and foreboding.'
        })
      );

      delete globalThis.canvas;
    });

    it('should skip setAdventureContext when journal text is empty', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('');
      const ai = createMockAIAssistant();

      orchestrator.setNarratorServices({ journalParser: jp, aiAssistant: ai });
      globalThis.canvas = { scene: { journal: 'j1' } };

      await orchestrator._initializeJournalContext();

      expect(jp.parseJournal).toHaveBeenCalledWith('j1');
      expect(ai.setAdventureContext).not.toHaveBeenCalled();

      delete globalThis.canvas;
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

  // ── Silence monitoring wiring ─────────────────────────────────────────

  describe('silence monitoring wiring', () => {
    it('should call setOnAutonomousSuggestionCallback during startLiveMode', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      expect(services.aiAssistant.setOnAutonomousSuggestionCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('should call startSilenceMonitoring during startLiveMode', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      expect(services.aiAssistant.startSilenceMonitoring).toHaveBeenCalled();
    });

    it('should call stopSilenceMonitoring during stopLiveMode', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      await orchestrator.stopLiveMode();
      expect(services.aiAssistant.stopSilenceMonitoring).toHaveBeenCalled();
    });

    it('should call stopSilenceMonitoring during cancelSession', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      orchestrator.cancelSession();
      expect(services.aiAssistant.stopSilenceMonitoring).toHaveBeenCalled();
    });

    it('should call recordActivityForSilenceDetection when segments received in _liveCycle', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );

      await orchestrator._liveCycle();
      expect(services.aiAssistant.recordActivityForSilenceDetection).toHaveBeenCalled();
    });

    it('should NOT call recordActivityForSilenceDetection when no segments (silence)', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockResolvedValue(null);

      await orchestrator._liveCycle();
      expect(services.aiAssistant.recordActivityForSilenceDetection).not.toHaveBeenCalled();
    });

    it('should skip silence monitoring if aiAssistant is null', async () => {
      const o = new SessionOrchestrator({
        audioRecorder: createMockAudioRecorder(),
        transcriptionService: createMockTranscriptionService()
      });
      // Should not throw — gracefully skip
      await o.startLiveMode({ batchDuration: 999999 });
      expect(o.isLiveMode).toBe(true);
    });

    it('should route autonomous suggestion to onAISuggestion callback', async () => {
      const onAISuggestion = vi.fn();
      orchestrator.setCallbacks({ onAISuggestion });
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // Extract the callback that was registered
      const registeredCallback = services.aiAssistant.setOnAutonomousSuggestionCallback.mock.calls[0][0];
      expect(registeredCallback).toBeTypeOf('function');

      // Simulate an autonomous suggestion
      const suggestionData = {
        suggestion: { type: 'narration', content: 'The tavern falls silent...' },
        silenceEvent: { duration: 30000 }
      };
      registeredCallback(suggestionData);

      expect(onAISuggestion).toHaveBeenCalledWith(
        suggestionData.suggestion,
        suggestionData.silenceEvent
      );
      expect(orchestrator._lastAISuggestions).toEqual([suggestionData.suggestion]);
    });

    it('should handle autonomous suggestion when no onAISuggestion callback is set', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      const registeredCallback = services.aiAssistant.setOnAutonomousSuggestionCallback.mock.calls[0][0];

      // Should not throw when no callback is set
      const suggestionData = {
        suggestion: { type: 'narration', content: 'The air grows cold...' },
        silenceEvent: { duration: 30000 }
      };
      expect(() => registeredCallback(suggestionData)).not.toThrow();
      expect(orchestrator._lastAISuggestions).toEqual([suggestionData.suggestion]);
    });
  });

  // ── 02-02: User-selected journal + chapter-scoped AI context ──────────

  describe('_initializeJournalContext with user-selected journal', () => {
    it('should read activeAdventureJournalId from settings and use as primary journal', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('Adventure text');
      const ai = createMockAIAssistant();
      const ct = createMockChapterTracker();

      orchestrator.setNarratorServices({ journalParser: jp, aiAssistant: ai, chapterTracker: ct });

      // Set user-selected journal via settings
      game.settings.get.mockImplementation((mod, key) => {
        if (key === 'activeAdventureJournalId') return 'user-selected-journal-id';
        return '';
      });

      // No scene journal — should use setting
      globalThis.canvas = { scene: null };

      await orchestrator._initializeJournalContext();

      expect(jp.parseJournal).toHaveBeenCalledWith('user-selected-journal-id');
      expect(ct.setSelectedJournal).toHaveBeenCalledWith('user-selected-journal-id');

      delete globalThis.canvas;
    });

    it('should fall back to scene journal if activeAdventureJournalId is empty', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('Scene journal text');
      const ai = createMockAIAssistant();
      const ct = createMockChapterTracker();

      orchestrator.setNarratorServices({ journalParser: jp, aiAssistant: ai, chapterTracker: ct });

      game.settings.get.mockImplementation((mod, key) => {
        if (key === 'activeAdventureJournalId') return '';
        return '';
      });

      globalThis.canvas = { scene: { journal: 'scene-journal-id', name: 'Scene' } };

      await orchestrator._initializeJournalContext();

      expect(jp.parseJournal).toHaveBeenCalledWith('scene-journal-id');
      expect(ct.setSelectedJournal).toHaveBeenCalledWith('scene-journal-id');

      delete globalThis.canvas;
    });

    it('should call chapterTracker.updateFromScene when scene exists', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('text');
      const ai = createMockAIAssistant();
      const ct = createMockChapterTracker();

      orchestrator.setNarratorServices({ journalParser: jp, aiAssistant: ai, chapterTracker: ct });

      game.settings.get.mockImplementation((mod, key) => {
        if (key === 'activeAdventureJournalId') return 'j1';
        return '';
      });

      const scene = { journal: 'scene-j', name: 'Test Scene' };
      globalThis.canvas = { scene };

      await orchestrator._initializeJournalContext();

      expect(ct.updateFromScene).toHaveBeenCalledWith(scene);

      delete globalThis.canvas;
    });
  });

  // ── NPC extraction, detection, foreshadowing, live enrichment (03-02) ──

  describe('NPC wiring in _initializeJournalContext', () => {
    it('should create NPCProfileExtractor and call extractProfiles at session start', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('The wizard Garrick guards the tower.');
      const ai = createMockAIAssistant();
      ai._openaiClient = { post: vi.fn() }; // provide openai client

      orchestrator.setNarratorServices({ journalParser: jp, aiAssistant: ai });
      globalThis.canvas = { scene: { journal: 'journal-1' } };

      await orchestrator._initializeJournalContext();

      // NPC extractor should be created and used
      expect(orchestrator._npcExtractor).not.toBeNull();

      delete globalThis.canvas;
    });

    it('should continue if NPC extraction fails (non-blocking)', async () => {
      const jp = createMockJournalParser();
      jp.getFullText.mockReturnValue('Journal text');
      const ai = createMockAIAssistant();
      // Provide a client that will cause extraction to fail
      ai._openaiClient = {
        post: vi.fn().mockRejectedValue(new Error('NPC extraction failed'))
      };

      orchestrator.setNarratorServices({ journalParser: jp, aiAssistant: ai });
      globalThis.canvas = { scene: { journal: 'journal-1' } };

      // Should not throw
      await orchestrator._initializeJournalContext();

      // Extractor was created even if extraction failed
      expect(orchestrator._npcExtractor).not.toBeNull();

      delete globalThis.canvas;
    });
  });

  describe('NPC wiring in _runAIAnalysis', () => {
    it('should call detectMentionedNPCs and setNPCProfiles on AIAssistant', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'Garrick entered the room', speaker: 'DM' }];

      const mockNPCExtractor = {
        detectMentionedNPCs: vi.fn().mockReturnValue([
          { name: 'Garrick', personality: 'stern', role: 'guard' }
        ]),
        getProfiles: vi.fn().mockReturnValue(new Map()),
        addSessionNote: vi.fn()
      };
      orchestrator._npcExtractor = mockNPCExtractor;

      services.aiAssistant.setNPCProfiles = vi.fn();

      await orchestrator._runAIAnalysis({ text: 'Garrick entered the room' });

      expect(mockNPCExtractor.detectMentionedNPCs).toHaveBeenCalled();
      expect(services.aiAssistant.setNPCProfiles).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Garrick' })
      ]);
    });

    it('should call getNextChapterContentForAI and setNextChapterLookahead', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test', speaker: 'DM' }];

      const ct = createMockChapterTracker();
      ct.getNextChapterContentForAI = vi.fn().mockReturnValue('NEXT CHAPTER: The Cave\n\nDark cave content...');
      orchestrator._chapterTracker = ct;

      services.aiAssistant.setNextChapterLookahead = vi.fn();

      await orchestrator._runAIAnalysis({ text: 'test' });

      expect(ct.getNextChapterContentForAI).toHaveBeenCalledWith(1000);
      expect(services.aiAssistant.setNextChapterLookahead).toHaveBeenCalledWith(
        'NEXT CHAPTER: The Cave\n\nDark cave content...'
      );
    });

    it('should append session notes for NPC mentions in suggestions (live enrichment)', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test', speaker: 'DM' }];

      const garrickProfile = { name: 'Garrick', sessionNotes: [] };
      const mockNPCExtractor = {
        detectMentionedNPCs: vi.fn().mockReturnValue([]),
        getProfiles: vi.fn().mockReturnValue(new Map([
          ['garrick', garrickProfile]
        ])),
        addSessionNote: vi.fn()
      };
      orchestrator._npcExtractor = mockNPCExtractor;

      services.aiAssistant.setNPCProfiles = vi.fn();
      services.aiAssistant.analyzeContext.mockResolvedValue({
        suggestions: [
          { type: 'narration', content: 'Garrick looks suspicious as the party approaches.' }
        ],
        offTrackStatus: { isOffTrack: false }
      });

      await orchestrator._runAIAnalysis({ text: 'test' });

      expect(mockNPCExtractor.addSessionNote).toHaveBeenCalledWith(
        'Garrick',
        expect.stringContaining('narration')
      );
    });

    it('should work without NPC extractor (graceful fallback)', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test', speaker: 'DM' }];
      orchestrator._npcExtractor = null;

      // Should not throw
      await orchestrator._runAIAnalysis({ text: 'test' });
      expect(services.aiAssistant.analyzeContext).toHaveBeenCalled();
    });
  });

  describe('NPC cleanup in stopLiveMode', () => {
    it('should clear NPC extractor on stop', async () => {
      await orchestrator.startLiveMode();
      orchestrator._npcExtractor = { clear: vi.fn() };

      await orchestrator.stopLiveMode();

      expect(orchestrator._npcExtractor).toBeNull();
    });
  });

  describe('_runAIAnalysis with chapter-scoped content', () => {
    it('should use getCurrentChapterContentForAI(8000) for summary field', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test', speaker: 'DM' }];

      const ct = createMockChapterTracker();
      ct.getCurrentChapter.mockReturnValue({
        title: 'Chapter 1',
        subchapters: [{ title: 'Scene A' }],
        pageId: 'p1',
        pageName: 'Page 1',
        journalName: 'Journal 1',
        content: 'Long content that would be truncated at 3000 chars'
      });
      ct.getCurrentChapterContentForAI = vi.fn().mockReturnValue('AI-ready chapter content up to 8000 chars');

      orchestrator._chapterTracker = ct;

      await orchestrator._runAIAnalysis({ text: 'test' });

      expect(ct.getCurrentChapterContentForAI).toHaveBeenCalledWith(8000);
      expect(services.aiAssistant.setChapterContext).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'AI-ready chapter content up to 8000 chars'
        })
      );
    });

    it('should fall back to substring(0,3000) when getCurrentChapterContentForAI is unavailable', async () => {
      orchestrator._liveMode = true;
      orchestrator._liveTranscript = [{ text: 'test', speaker: 'DM' }];

      const ct = createMockChapterTracker();
      ct.getCurrentChapter.mockReturnValue({
        title: 'Chapter 1',
        subchapters: [],
        content: 'A'.repeat(5000)
      });
      // No getCurrentChapterContentForAI method
      delete ct.getCurrentChapterContentForAI;

      orchestrator._chapterTracker = ct;

      await orchestrator._runAIAnalysis({ text: 'test' });

      expect(services.aiAssistant.setChapterContext).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'A'.repeat(3000)
        })
      );
    });
  });

  describe('scene change hook during live mode', () => {
    it('should register canvasReady hook in startLiveMode and update chapter', async () => {
      const ct = createMockChapterTracker();
      orchestrator._chapterTracker = ct;

      // Track Hooks.on calls
      const hookCalls = [];
      globalThis.Hooks = {
        on: vi.fn((hook, fn) => { hookCalls.push({ hook, fn }); }),
        off: vi.fn()
      };

      await orchestrator.startLiveMode({ batchDuration: 999999 });

      const canvasReadyHook = hookCalls.find(h => h.hook === 'canvasReady');
      expect(canvasReadyHook).toBeDefined();

      // Simulate scene change
      globalThis.canvas = { scene: { id: 'new-scene', name: 'New Scene' } };
      canvasReadyHook.fn();

      expect(ct.updateFromScene).toHaveBeenCalledWith(canvas.scene);

      delete globalThis.canvas;
      delete globalThis.Hooks;
    });

    it('should unregister canvasReady hook in stopLiveMode', async () => {
      globalThis.Hooks = {
        on: vi.fn(),
        off: vi.fn()
      };

      await orchestrator.startLiveMode({ batchDuration: 999999 });
      await orchestrator.stopLiveMode();

      expect(Hooks.off).toHaveBeenCalledWith('canvasReady', expect.any(Function));

      delete globalThis.Hooks;
    });
  });

  // ── Phase 04 Plan 02: Lifecycle Hardening ────────────────────────────

  describe('lifecycle hardening (04-02)', () => {
    // ── stopLiveMode: 5-second deadline ────────────────────────────────
    describe('stopLiveMode with deadline', () => {
      it('should reach IDLE within 5 seconds even if current cycle hangs', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        // Simulate a hanging current cycle promise
        orchestrator._currentCyclePromise = new Promise(() => {
          // Never resolves
        });

        const stopPromise = orchestrator.stopLiveMode();
        // Advance past 5-second deadline
        vi.advanceTimersByTime(5100);
        await stopPromise;

        expect(orchestrator.state).toBe(SessionState.IDLE);
        expect(orchestrator._isStopping).toBe(false);
      });

      it('should complete gracefully if cycle finishes before deadline', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        // Simulate a cycle that resolves quickly
        orchestrator._currentCyclePromise = Promise.resolve();

        const result = await orchestrator.stopLiveMode();
        expect(orchestrator.state).toBe(SessionState.IDLE);
        expect(result).toBeTruthy();
      });

      it('should abort _shutdownController when deadline fires', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        orchestrator._currentCyclePromise = new Promise(() => {});

        const stopPromise = orchestrator.stopLiveMode();
        vi.advanceTimersByTime(5100);
        await stopPromise;

        expect(orchestrator._shutdownController?.signal?.aborted).toBe(true);
      });

      it('should show session end summary notification', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        orchestrator._currentCyclePromise = Promise.resolve();

        await orchestrator.stopLiveMode();
        expect(ui.notifications.info).toHaveBeenCalledWith(
          expect.stringContaining('VOXCHRONICLE.Live.SessionSummary')
        );
      });

      it('should use cancel() on force-abort path (not stopRecording)', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        // Make stopRecording hang
        services.audioRecorder.stopRecording.mockReturnValue(new Promise(() => {}));
        orchestrator._currentCyclePromise = new Promise(() => {});

        const stopPromise = orchestrator.stopLiveMode();
        vi.advanceTimersByTime(5100);
        await stopPromise;

        // cancel should have been called on the force-abort path
        expect(services.audioRecorder.cancel).toHaveBeenCalled();
      });
    });

    // ── _fullTeardown ───────────────────────────────────────────────────
    describe('_fullTeardown', () => {
      it('should clear all registered hooks', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        // Manually add a hook to the tracking set
        orchestrator._registeredHooks?.add({ name: 'testHook', id: 999 });

        await orchestrator._fullTeardown();
        expect(orchestrator._registeredHooks?.size || 0).toBe(0);
      });

      it('should reset all live mode state', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        orchestrator._liveTranscript = [{ text: 'test' }];
        orchestrator._fullTranscriptText = 'test text';
        orchestrator._discardedSegmentCount = 5;
        orchestrator._currentCyclePromise = Promise.resolve();

        await orchestrator._fullTeardown();

        expect(orchestrator._liveTranscript).toEqual([]);
        expect(orchestrator._fullTranscriptText).toBe('');
        expect(orchestrator._discardedSegmentCount).toBe(0);
        expect(orchestrator._currentCyclePromise).toBeNull();
      });
    });

    // ── startLiveMode: clean slate ──────────────────────────────────────
    describe('startLiveMode clean slate', () => {
      it('should initialize CostTracker', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        expect(orchestrator._costTracker).toBeTruthy();
        expect(orchestrator._costTracker.getTotalCost()).toBe(0);
      });

      it('should initialize _shutdownController', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        expect(orchestrator._shutdownController).toBeTruthy();
        expect(orchestrator._shutdownController.signal.aborted).toBe(false);
      });

      it('should initialize _registeredHooks set', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        expect(orchestrator._registeredHooks).toBeInstanceOf(Set);
      });

      it('should initialize health tracking', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        expect(orchestrator._transcriptionHealth).toBe('healthy');
        expect(orchestrator._aiSuggestionHealth).toBe('healthy');
      });

      it('should initialize self-monitoring state', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        expect(orchestrator._cycleDurations).toEqual([]);
        expect(orchestrator._sessionStartTime).toBeTruthy();
      });

      it('should initialize full transcript accumulator', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        expect(orchestrator._fullTranscriptText).toBe('');
        expect(orchestrator._discardedSegmentCount).toBe(0);
      });

      it('should start from zero after previous stop', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        orchestrator._costTracker?.addTranscriptionMinutes(5);
        orchestrator._currentCyclePromise = Promise.resolve();
        await orchestrator.stopLiveMode();

        // Second start should be clean
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        expect(orchestrator._costTracker.getTotalCost()).toBe(0);
        expect(orchestrator._transcriptionHealth).toBe('healthy');
        expect(orchestrator._cycleDurations).toEqual([]);
      });
    });

    // ── _liveCycle: rolling window ──────────────────────────────────────
    describe('_liveCycle rolling window', () => {
      it('should trim _liveTranscript to last 100 segments', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        // Fill with 99 segments
        for (let i = 0; i < 99; i++) {
          orchestrator._liveTranscript.push({ text: `seg${i}`, speaker: 'S', start: i, end: i + 1 });
        }

        // Next cycle adds 5 segments (total 104)
        services.audioRecorder.getLatestChunk.mockResolvedValue(
          new Blob(['audio'], { type: 'audio/webm' })
        );
        services.transcriptionService.transcribe.mockResolvedValue({
          text: 'a b c d e',
          segments: [
            { text: 'a', speaker: 'S', start: 0, end: 1 },
            { text: 'b', speaker: 'S', start: 1, end: 2 },
            { text: 'c', speaker: 'S', start: 2, end: 3 },
            { text: 'd', speaker: 'S', start: 3, end: 4 },
            { text: 'e', speaker: 'S', start: 4, end: 5 }
          ]
        });

        await orchestrator._liveCycle();

        expect(orchestrator._liveTranscript.length).toBeLessThanOrEqual(100);
        expect(orchestrator._discardedSegmentCount).toBeGreaterThan(0);
      });

      it('should accumulate full transcript text', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        services.audioRecorder.getLatestChunk.mockResolvedValue(
          new Blob(['audio'], { type: 'audio/webm' })
        );
        services.transcriptionService.transcribe.mockResolvedValue({
          text: 'Hello world',
          segments: [{ text: 'Hello world', speaker: 'S', start: 0, end: 1 }]
        });

        await orchestrator._liveCycle();

        expect(orchestrator._fullTranscriptText).toContain('Hello world');
      });
    });

    // ── _liveCycle: health tracking ─────────────────────────────────────
    describe('_liveCycle health tracking', () => {
      it('should set _transcriptionHealth to healthy on successful transcription', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        orchestrator._transcriptionHealth = 'degraded';

        services.audioRecorder.getLatestChunk.mockResolvedValue(
          new Blob(['audio'], { type: 'audio/webm' })
        );

        await orchestrator._liveCycle();

        expect(orchestrator._transcriptionHealth).toBe('healthy');
      });

      it('should set _transcriptionHealth to degraded after 2 consecutive errors', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('fail'));

        await orchestrator._liveCycle();
        await orchestrator._liveCycle();

        expect(orchestrator._transcriptionHealth).toBe('degraded');
      });

      it('should set _transcriptionHealth to down after 5 consecutive errors', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('fail'));

        for (let i = 0; i < 5; i++) {
          await orchestrator._liveCycle();
        }

        expect(orchestrator._transcriptionHealth).toBe('down');
      });

      it('should auto-recover transcription health on success', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        // Fail 3 times
        services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('fail'));
        for (let i = 0; i < 3; i++) {
          await orchestrator._liveCycle();
        }
        expect(orchestrator._transcriptionHealth).toBe('degraded');

        // Succeed once
        services.audioRecorder.getLatestChunk.mockResolvedValue(
          new Blob(['audio'], { type: 'audio/webm' })
        );
        services.transcriptionService.transcribe.mockResolvedValue({
          text: 'ok', segments: [{ text: 'ok', speaker: 'S', start: 0, end: 1 }]
        });
        await orchestrator._liveCycle();

        expect(orchestrator._transcriptionHealth).toBe('healthy');
      });
    });

    // ── _liveCycle: cost cap ────────────────────────────────────────────
    describe('_liveCycle cost cap', () => {
      it('should pause AI suggestions when cost cap exceeded', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        // Manually set the cost above cap
        orchestrator._costTracker.addTranscriptionMinutes(1000); // $6 (> $5 cap)

        services.audioRecorder.getLatestChunk.mockResolvedValue(
          new Blob(['audio'], { type: 'audio/webm' })
        );
        services.transcriptionService.transcribe.mockResolvedValue({
          text: 'test', segments: [{ text: 'test', speaker: 'S', start: 0, end: 1 }]
        });

        await orchestrator._liveCycle();

        expect(orchestrator._aiSuggestionsPaused).toBe(true);
      });
    });

    // ── getServiceHealth / getCostData ───────────────────────────────────
    describe('getServiceHealth', () => {
      it('should return health statuses', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        const health = orchestrator.getServiceHealth();
        expect(health.transcription).toBe('healthy');
        expect(health.aiSuggestions).toBe('healthy');
      });
    });

    describe('getCostData', () => {
      it('should return cost tracker summary', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        const data = orchestrator.getCostData();
        expect(data).toBeTruthy();
        expect(data.totalCost).toBe(0);
        expect(data.totalTokens).toBe(0);
      });

      it('should return null when no cost tracker', () => {
        const data = orchestrator.getCostData();
        expect(data).toBeNull();
      });
    });

    // ── Self-monitoring ────────────────────────────────────────────────
    describe('self-monitoring', () => {
      it('should track cycle durations in rolling array', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        services.audioRecorder.getLatestChunk.mockResolvedValue(null);
        await orchestrator._liveCycle();

        expect(orchestrator._cycleDurations.length).toBe(1);
      });

      it('should keep only last 20 cycle durations', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        services.audioRecorder.getLatestChunk.mockResolvedValue(null);

        for (let i = 0; i < 25; i++) {
          await orchestrator._liveCycle();
        }

        expect(orchestrator._cycleDurations.length).toBe(20);
      });
    });

    // ── _liveCycle: stores promise as _currentCyclePromise ──────────────
    describe('_liveCycle promise tracking', () => {
      it('should set _currentCyclePromise during execution', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });

        // After _liveCycle starts, _currentCyclePromise should be set
        // We verify by starting the cycle and checking before it completes
        const cyclePromise = orchestrator._liveCycle();

        // _currentCyclePromise should be set synchronously after _liveCycle is called
        // (before the first await inside the IIFE)
        expect(orchestrator._currentCyclePromise).not.toBeNull();

        await cyclePromise;
      });

      it('should clear _currentCyclePromise after cycle completes', async () => {
        await orchestrator.startLiveMode({ batchDuration: 999999 });
        services.audioRecorder.getLatestChunk.mockResolvedValue(null);

        await orchestrator._liveCycle();
        expect(orchestrator._currentCyclePromise).toBeNull();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// RAG Indexing Pipeline (02-03)
// ---------------------------------------------------------------------------

describe('RAG Indexing Pipeline', () => {
  let orchestrator;
  let mockJournalParser;
  let mockRAGProvider;

  function createRAGMockJournalParser() {
    return {
      parseJournal: vi.fn().mockResolvedValue(),
      getFullText: vi.fn().mockReturnValue('Adventure journal full text content'),
      getChunksForEmbedding: vi.fn().mockResolvedValue([
        {
          text: 'Chunk 1 text content',
          metadata: {
            source: 'journal',
            journalId: 'journal-1',
            journalName: 'Lost Mine of Phandelver',
            pageId: 'page-1',
            pageName: 'Chapter 1',
            chunkIndex: 0,
            totalChunks: 2
          }
        },
        {
          text: 'Chunk 2 text content',
          metadata: {
            source: 'journal',
            journalId: 'journal-1',
            journalName: 'Lost Mine of Phandelver',
            pageId: 'page-1',
            pageName: 'Chapter 1',
            chunkIndex: 1,
            totalChunks: 2
          }
        }
      ]),
      clearAllCache: vi.fn(),
      extractNPCProfiles: vi.fn().mockReturnValue([])
    };
  }

  function createRAGMockProvider() {
    return {
      indexDocuments: vi.fn().mockResolvedValue({ indexed: 2, failed: 0 }),
      removeDocument: vi.fn().mockResolvedValue(),
      clearIndex: vi.fn().mockResolvedValue(),
      getStatus: vi.fn().mockResolvedValue({ ready: true, documentCount: 0 })
    };
  }

  beforeEach(() => {
    // Mock crypto.subtle.digest for content hashing
    // crypto is read-only on globalThis in jsdom, so we spy on the existing subtle
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(
      new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]).buffer
    );

    // Mock game.settings for journal IDs
    globalThis.game = {
      ...globalThis.game,
      settings: {
        ...globalThis.game?.settings,
        get: vi.fn((moduleId, key) => {
          if (key === 'activeAdventureJournalId') return 'journal-1';
          if (key === 'supplementaryJournalIds') return ['journal-2'];
          return '';
        }),
        set: vi.fn(),
        register: vi.fn()
      }
    };

    mockJournalParser = createRAGMockJournalParser();
    mockRAGProvider = createRAGMockProvider();

    orchestrator = new SessionOrchestrator({
      audioRecorder: createMockAudioRecorder()
    });
    orchestrator.setNarratorServices({
      journalParser: mockJournalParser,
      aiAssistant: createMockAIAssistant()
    });
    orchestrator.setRAGProvider(mockRAGProvider);
  });

  describe('_computeContentHash', () => {
    it('should return a consistent hex string for the same input', async () => {
      const hash1 = await orchestrator._computeContentHash('test content');
      const hash2 = await orchestrator._computeContentHash('test content');
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('_indexJournalsForRAG', () => {
    it('should call getChunksForEmbedding with chunkSize 4800 and overlap 1200 for primary journal', async () => {
      await orchestrator._indexJournalsForRAG();
      expect(mockJournalParser.getChunksForEmbedding).toHaveBeenCalledWith(
        'journal-1',
        expect.objectContaining({ chunkSize: 4800, overlap: 1200 })
      );
    });

    it('should call getChunksForEmbedding for each supplementary journal', async () => {
      mockJournalParser.getChunksForEmbedding.mockResolvedValue([]);
      await orchestrator._indexJournalsForRAG();
      expect(mockJournalParser.getChunksForEmbedding).toHaveBeenCalledWith(
        'journal-2',
        expect.objectContaining({ chunkSize: 4800, overlap: 1200 })
      );
    });

    it('should convert chunks to RAGDocuments with correct id format', async () => {
      // Only primary journal returns chunks
      globalThis.game.settings.get = vi.fn((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return 'journal-1';
        if (key === 'supplementaryJournalIds') return [];
        return '';
      });

      await orchestrator._indexJournalsForRAG();

      const docs = mockRAGProvider.indexDocuments.mock.calls[0][0];
      expect(docs[0].id).toBe('journal-1-page-1-chunk0');
      expect(docs[1].id).toBe('journal-1-page-1-chunk1');
    });

    it('should include journalName, pageName, and chunk index in RAGDocument title', async () => {
      globalThis.game.settings.get = vi.fn((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return 'journal-1';
        if (key === 'supplementaryJournalIds') return [];
        return '';
      });

      await orchestrator._indexJournalsForRAG();

      const docs = mockRAGProvider.indexDocuments.mock.calls[0][0];
      expect(docs[0].title).toBe('Lost Mine of Phandelver > Chapter 1 [1/2]');
      expect(docs[1].title).toBe('Lost Mine of Phandelver > Chapter 1 [2/2]');
    });

    it('should include type adventure-journal in RAGDocument metadata', async () => {
      globalThis.game.settings.get = vi.fn((moduleId, key) => {
        if (key === 'activeAdventureJournalId') return 'journal-1';
        if (key === 'supplementaryJournalIds') return [];
        return '';
      });

      await orchestrator._indexJournalsForRAG();

      const docs = mockRAGProvider.indexDocuments.mock.calls[0][0];
      expect(docs[0].metadata.type).toBe('adventure-journal');
    });

    it('should skip indexing when content hash matches stored hash (not stale)', async () => {
      // First call indexes
      await orchestrator._indexJournalsForRAG();
      mockRAGProvider.indexDocuments.mockClear();

      // Second call should skip (same content)
      await orchestrator._indexJournalsForRAG();
      expect(mockRAGProvider.indexDocuments).not.toHaveBeenCalled();
    });

    it('should proceed with indexing when content hash differs (stale)', async () => {
      // First call
      await orchestrator._indexJournalsForRAG();
      mockRAGProvider.indexDocuments.mockClear();

      // Change content hash by changing fullText return value
      mockJournalParser.getFullText.mockReturnValue('Different content now');
      // Also need to change the hash mock to return different value
      let callCount = 0;
      crypto.subtle.digest.mockImplementation(() => {
        callCount++;
        // Return different hash for the new content
        const buffer = new Uint8Array([callCount, 0x02, 0x03, 0x04]).buffer;
        return Promise.resolve(buffer);
      });

      await orchestrator._indexJournalsForRAG();
      expect(mockRAGProvider.indexDocuments).toHaveBeenCalled();
    });

    it('should call onProgress callback during indexing', async () => {
      const onProgress = vi.fn();
      await orchestrator._indexJournalsForRAG({ onProgress });
      // onProgress should be passed through to indexDocuments
      expect(mockRAGProvider.indexDocuments).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ onProgress })
      );
    });
  });

  describe('reindexJournal', () => {
    it('should only re-index the specified journal, not all journals', async () => {
      // Initial index all
      await orchestrator._indexJournalsForRAG();
      mockRAGProvider.indexDocuments.mockClear();
      mockJournalParser.getChunksForEmbedding.mockClear();

      // Change hash mock so cleared hash causes re-index
      let callCount = 0;
      crypto.subtle.digest.mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Uint8Array([callCount, 0x02]).buffer);
      });

      await orchestrator.reindexJournal('journal-1');

      // Should have re-indexed (because hash was cleared for journal-1)
      expect(mockRAGProvider.indexDocuments).toHaveBeenCalled();
    });

    it('should skip if journalId is not in the selected journals list', async () => {
      mockRAGProvider.indexDocuments.mockClear();
      await orchestrator.reindexJournal('unselected-journal');
      expect(mockRAGProvider.indexDocuments).not.toHaveBeenCalled();
    });

    it('should guard against concurrent re-index operations', async () => {
      // Track how indexDocuments is invoked concurrently
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;
      mockRAGProvider.indexDocuments.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        // Simulate async work
        await new Promise(r => setTimeout(r, 10));
        concurrentCalls--;
        return { indexed: 2, failed: 0 };
      });

      // Clear content hashes so re-indexing proceeds
      orchestrator._contentHashes = {};

      // Start first re-index
      const firstReindex = orchestrator.reindexJournal('journal-1');

      // Wait a tick so the first reindexJournal sets _reindexInProgress
      await new Promise(r => setTimeout(r, 0));
      expect(orchestrator._reindexInProgress).toBe(true);

      // Second call should queue (returns immediately)
      orchestrator.reindexJournal('journal-1');

      // Wait for everything to complete
      await firstReindex;
      // Give queued re-index time to complete
      await new Promise(r => setTimeout(r, 50));

      // Concurrency should never exceed 1
      expect(maxConcurrentCalls).toBeLessThanOrEqual(1);
      expect(orchestrator._reindexInProgress).toBe(false);
    });
  });
});
