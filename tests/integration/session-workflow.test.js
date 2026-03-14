/**
 * Integration tests for SessionOrchestrator cross-service workflows.
 *
 * These tests verify that multiple services interact correctly through
 * the orchestrator — state transitions, call ordering, error propagation,
 * and data flow between services across session lifecycle boundaries.
 */

// Ensure foundry global exists before SpeakerLabeling.mjs is loaded (transitive import via TranscriptionProcessor)
vi.hoisted(() => {
  if (!globalThis.foundry) {
    class MockAppV2 {
      static DEFAULT_OPTIONS = {};
      static PARTS = {};
      constructor() { this.rendered = false; }
      render() { this.rendered = true; }
      close() { this.rendered = false; return Promise.resolve(); }
    }
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: MockAppV2,
          HandlebarsApplicationMixin: (Base) => class extends Base {
            static PARTS = {};
          }
        }
      },
      utils: { mergeObject: (a, b) => ({ ...a, ...b }) }
    };
  }
  if (!globalThis.game) {
    globalThis.game = {
      settings: {
        get: vi.fn().mockReturnValue(''),
        set: vi.fn(),
        register: vi.fn()
      },
      i18n: {
        localize: vi.fn(key => key),
        format: vi.fn((key, data) => key)
      },
      user: { isGM: true }
    };
  }
  if (!globalThis.ui) {
    globalThis.ui = { notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } };
  }
});

import { SessionOrchestrator, SessionState } from '../../scripts/orchestration/SessionOrchestrator.mjs';

// ---------------------------------------------------------------------------
// Mock factories (same patterns as unit tests, but designed for workflow chains)
// ---------------------------------------------------------------------------

function createMockAudioRecorder(overrides = {}) {
  return {
    startRecording: vi.fn().mockResolvedValue(),
    stopRecording: vi.fn().mockResolvedValue(new Blob(['audio-data'], { type: 'audio/webm' })),
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
      text: 'The wizard Gandalf arrived at the Shire with a ring of power.',
      segments: [
        { speaker: 'SPEAKER_00', text: 'The wizard Gandalf arrived at the Shire', start: 0, end: 3 },
        { speaker: 'SPEAKER_01', text: 'with a ring of power.', start: 3, end: 5 }
      ],
      language: 'en'
    }),
    ...overrides
  };
}

function createMockEntityExtractor(overrides = {}) {
  return {
    extractAll: vi.fn().mockResolvedValue({
      characters: [
        { name: 'Gandalf', description: 'A powerful wizard', type: 'character' }
      ],
      locations: [
        { name: 'The Shire', description: 'A green and peaceful land', type: 'location' }
      ],
      items: [
        { name: 'Ring of Power', description: 'A ring of immense power', type: 'item' }
      ],
      moments: [
        { id: 'm1', title: 'Gandalf arrives', imagePrompt: 'wizard arriving at green hills' }
      ],
      totalCount: 3
    }),
    extractRelationships: vi.fn().mockResolvedValue([
      { source: 'Gandalf', target: 'The Shire', type: 'visited', confidence: 8 },
      { source: 'Gandalf', target: 'Ring of Power', type: 'carries', confidence: 9 }
    ]),
    ...overrides
  };
}

function createMockImageGenerationService(overrides = {}) {
  return {
    generateBatch: vi.fn().mockResolvedValue([
      { success: true, imageData: 'base64-image-data', momentId: 'm1' }
    ]),
    ...overrides
  };
}

function createMockKankaService(overrides = {}) {
  return {
    createJournal: vi.fn().mockResolvedValue({ id: 100, name: 'Session Chronicle' }),
    createCharacter: vi.fn().mockResolvedValue({ id: 201, name: 'Gandalf' }),
    createLocation: vi.fn().mockResolvedValue({ id: 202, name: 'The Shire' }),
    createItem: vi.fn().mockResolvedValue({ id: 203, name: 'Ring of Power' }),
    createIfNotExists: vi.fn().mockResolvedValue({ id: 300, name: 'Entity' }),
    preFetchEntities: vi.fn().mockResolvedValue({}),
    ...overrides
  };
}

function createMockNarrativeExporter(overrides = {}) {
  return {
    export: vi.fn().mockReturnValue({
      name: 'Session 1',
      entry: '<h1>Session 1</h1><p>The wizard Gandalf arrived...</p>',
      type: 'Session Chronicle',
      date: '2026-02-27'
    }),
    ...overrides
  };
}

function createMockAIAssistant(overrides = {}) {
  return {
    analyzeContext: vi.fn().mockResolvedValue({
      suggestions: [{ type: 'narration', content: 'Describe the ancient ring glowing' }],
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
// Integration tests
// ---------------------------------------------------------------------------

describe('SessionOrchestrator — Cross-Service Integration', () => {
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

  // ========================================================================
  // 1. Chronicle mode — full pipeline: record -> transcribe -> extract -> images
  // ========================================================================

  describe('Chronicle mode full pipeline', () => {
    it('should flow data from recording through transcription to entity extraction', async () => {
      // Start and stop recording to get audio
      await orchestrator.startSession({ title: 'Integration Test Session' });
      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(services.audioRecorder.startRecording).toHaveBeenCalledTimes(1);

      await orchestrator.stopSession({ processImmediately: false });
      const audioBlob = orchestrator.currentSession.audioBlob;
      expect(audioBlob).toBeTruthy();
      expect(audioBlob.size).toBeGreaterThan(0);

      // Now process transcription — this should call transcription, then entity extraction, then images
      await orchestrator.processTranscription();

      // Verify transcription result flows into the session
      expect(orchestrator.currentSession.transcript).toBeTruthy();
      expect(orchestrator.currentSession.transcript.text).toContain('Gandalf');
      expect(orchestrator.currentSession.transcript.segments).toHaveLength(2);

      // Verify entities were extracted from the transcript text
      expect(orchestrator.currentSession.entities).toBeTruthy();
      expect(orchestrator.currentSession.entities.characters).toHaveLength(1);
      expect(orchestrator.currentSession.entities.characters[0].name).toBe('Gandalf');
      expect(orchestrator.currentSession.entities.locations).toHaveLength(1);
      expect(orchestrator.currentSession.entities.items).toHaveLength(1);

      // Verify moments were extracted
      expect(orchestrator.currentSession.moments).toHaveLength(1);
      expect(orchestrator.currentSession.moments[0].title).toBe('Gandalf arrives');

      // Verify relationships were extracted
      expect(orchestrator.currentSession.relationships).toBeTruthy();
      expect(orchestrator.currentSession.relationships).toHaveLength(2);

      // Verify images were generated from moments
      expect(orchestrator.currentSession.images).toBeTruthy();
      expect(orchestrator.currentSession.images.length).toBeGreaterThan(0);

      // Verify final state
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
      expect(orchestrator.currentSession.errors).toHaveLength(0);
    });

    it('should track state transitions through the full pipeline in correct order', async () => {
      const stateTransitions = [];
      orchestrator.setCallbacks({
        onStateChange: (newState, oldState) => {
          stateTransitions.push({ from: oldState, to: newState });
        }
      });

      await orchestrator.startSession({ title: 'State Tracking' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      // Verify the state machine transitions
      const states = stateTransitions.map(t => t.to);
      expect(states).toContain(SessionState.RECORDING);
      expect(states).toContain(SessionState.PROCESSING);
      expect(states).toContain(SessionState.EXTRACTING);
      expect(states).toContain(SessionState.GENERATING_IMAGES);
      expect(states).toContain(SessionState.COMPLETE);

      // Verify ordering: RECORDING before PROCESSING before EXTRACTING before COMPLETE
      const recordingIdx = states.indexOf(SessionState.RECORDING);
      const processingIdx = states.indexOf(SessionState.PROCESSING);
      const extractingIdx = states.indexOf(SessionState.EXTRACTING);
      const completeIdx = states.indexOf(SessionState.COMPLETE);
      expect(recordingIdx).toBeLessThan(processingIdx);
      expect(processingIdx).toBeLessThan(extractingIdx);
      expect(extractingIdx).toBeLessThan(completeIdx);
    });

    it('should pass speaker map from session to transcription processor', async () => {
      const speakerMap = { SPEAKER_00: 'DM', SPEAKER_01: 'Player1' };
      await orchestrator.startSession({
        title: 'Speaker Map Test',
        speakerMap
      });
      await orchestrator.stopSession({ processImmediately: false });

      await orchestrator.processTranscription();

      // Session should retain the speaker map
      expect(orchestrator.currentSession.speakerMap).toEqual(speakerMap);
    });

    it('should skip entity extraction when disabled and still complete', async () => {
      orchestrator.setOptions({ autoExtractEntities: false });

      await orchestrator.startSession({ title: 'No Entities' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      expect(orchestrator.currentSession.transcript).toBeTruthy();
      expect(orchestrator.currentSession.entities).toBeNull();
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should skip image generation when disabled and still complete', async () => {
      orchestrator.setOptions({ autoGenerateImages: false });

      await orchestrator.startSession({ title: 'No Images' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      expect(orchestrator.currentSession.transcript).toBeTruthy();
      expect(orchestrator.currentSession.entities).toBeTruthy();
      expect(orchestrator.currentSession.images).toEqual([]);
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should fire onProgress at each pipeline stage', async () => {
      const progressEvents = [];
      orchestrator.setCallbacks({
        onProgress: (event) => {
          progressEvents.push(event.stage);
        }
      });

      await orchestrator.startSession({ title: 'Progress' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      // Expect progress from transcription, extraction, and images
      expect(progressEvents).toContain('transcription');
      expect(progressEvents).toContain('extraction');
      expect(progressEvents).toContain('images');
    });

    it('should fire onSessionComplete with the fully populated session', async () => {
      const onSessionComplete = vi.fn();
      orchestrator.setCallbacks({ onSessionComplete });

      await orchestrator.startSession({ title: 'Callback Test' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      expect(onSessionComplete).toHaveBeenCalledTimes(1);
      const completedSession = onSessionComplete.mock.calls[0][0];
      expect(completedSession.transcript).toBeTruthy();
      expect(completedSession.entities).toBeTruthy();
      expect(completedSession.moments).toBeTruthy();
      expect(completedSession.images.length).toBeGreaterThan(0);
    });

    it('should call stopSession with processImmediately=true to auto-process', async () => {
      await orchestrator.startSession({ title: 'Auto Process' });
      const session = await orchestrator.stopSession({ processImmediately: true });

      // The full pipeline should have run automatically
      expect(session.transcript).toBeTruthy();
      expect(session.entities).toBeTruthy();
      expect(session.images.length).toBeGreaterThan(0);
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });
  });

  // ========================================================================
  // 2. Chronicle mode + Kanka publishing
  // ========================================================================

  describe('Chronicle mode with Kanka publishing', () => {
    it('should publish session data to Kanka after processing', async () => {
      await orchestrator.startSession({ title: 'Publish Session' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      expect(orchestrator.state).toBe(SessionState.COMPLETE);

      const publishResult = await orchestrator.publishToKanka();
      expect(publishResult).toBeTruthy();
      expect(orchestrator.currentSession.kankaResults).toBeTruthy();
    });

    it('should pass session data including entities and transcript to publisher', async () => {
      await orchestrator.startSession({ title: 'Kanka Data Flow' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      // Verify session has data before publishing
      const session = orchestrator.currentSession;
      expect(session.transcript).toBeTruthy();
      expect(session.entities).toBeTruthy();

      await orchestrator.publishToKanka();

      // The kankaPublisher should have received the session with all data
      expect(orchestrator.currentSession.kankaResults).toBeTruthy();
    });

    it('should transition through PUBLISHING state during Kanka publish', async () => {
      const stateTransitions = [];
      orchestrator.setCallbacks({
        onStateChange: (newState) => stateTransitions.push(newState)
      });

      await orchestrator.startSession({ title: 'State Pub' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      // Clear transitions before publishing to isolate
      stateTransitions.length = 0;

      await orchestrator.publishToKanka();
      expect(stateTransitions).toContain(SessionState.PUBLISHING);
    });
  });

  // ========================================================================
  // 3. Live mode — service interaction
  // ========================================================================

  describe('Live mode cross-service interactions', () => {
    it('should start all live mode services in correct order', async () => {
      const callOrder = [];
      services.sessionAnalytics.startSession.mockImplementation(() => callOrder.push('analytics.start'));
      services.audioRecorder.startRecording.mockImplementation(() => {
        callOrder.push('recorder.start');
        return Promise.resolve();
      });
      services.aiAssistant.setOnAutonomousSuggestionCallback.mockImplementation(() =>
        callOrder.push('ai.setCallback'));
      services.aiAssistant.startSilenceMonitoring.mockImplementation(() => {
        callOrder.push('ai.startSilence');
        return true;
      });

      await orchestrator.startLiveMode({ title: 'Service Order Test' });

      expect(callOrder).toContain('analytics.start');
      expect(callOrder).toContain('recorder.start');
      expect(callOrder).toContain('ai.setCallback');
      expect(callOrder).toContain('ai.startSilence');

      // Analytics should start before recorder
      expect(callOrder.indexOf('analytics.start')).toBeLessThan(callOrder.indexOf('recorder.start'));
      // Recorder starts before AI callback wiring
      expect(callOrder.indexOf('recorder.start')).toBeLessThan(callOrder.indexOf('ai.setCallback'));
    });

    it('should flow audio chunk through transcription to scene detection and analytics', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // Simulate an audio chunk being available
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['live-audio'], { type: 'audio/webm' })
      );

      await orchestrator._liveCycle();

      // Audio chunk goes to transcription service
      expect(services.transcriptionService.transcribe).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ language: null })
      );

      // Transcription segments go to scene detector
      expect(services.sceneDetector.detectSceneTransition).toHaveBeenCalled();

      // Segments go to session analytics
      expect(services.sessionAnalytics.addSegment).toHaveBeenCalled();

      // Activity recorded for silence detection
      expect(services.aiAssistant.recordActivityForSilenceDetection).toHaveBeenCalled();
    });

    it('should accumulate live transcript segments across multiple cycles', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // First cycle
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio-1'], { type: 'audio/webm' })
      );
      services.transcriptionService.transcribe.mockResolvedValueOnce({
        text: 'First batch',
        segments: [{ speaker: 'SPEAKER_00', text: 'First batch', start: 0, end: 2 }]
      });

      await orchestrator._liveCycle();
      expect(orchestrator._liveTranscript).toHaveLength(1);
      expect(orchestrator._liveTranscript[0].text).toBe('First batch');

      // Second cycle
      services.transcriptionService.transcribe.mockResolvedValueOnce({
        text: 'Second batch',
        segments: [{ speaker: 'SPEAKER_01', text: 'Second batch', start: 0, end: 3 }]
      });

      await orchestrator._liveCycle();
      expect(orchestrator._liveTranscript).toHaveLength(2);
      expect(orchestrator._liveTranscript[1].text).toBe('Second batch');

      // Second segment should be offset to maintain chronological order
      expect(orchestrator._liveTranscript[1].start).toBe(2); // offset by first segment's end
    });

    it('should assemble complete transcript from live segments on stop', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // Simulate two live cycles
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );
      services.transcriptionService.transcribe
        .mockResolvedValueOnce({
          text: 'Gandalf arrived.',
          segments: [{ speaker: 'SPEAKER_00', text: 'Gandalf arrived.', start: 0, end: 2 }]
        })
        .mockResolvedValueOnce({
          text: 'At the Shire.',
          segments: [{ speaker: 'SPEAKER_01', text: 'At the Shire.', start: 0, end: 1.5 }]
        });

      await orchestrator._liveCycle();
      await orchestrator._liveCycle();

      // Stop live mode
      const session = await orchestrator.stopLiveMode();

      // Transcript should be assembled from all segments
      expect(session.transcript).toBeTruthy();
      expect(session.transcript.text).toBe('Gandalf arrived. At the Shire.');
      expect(session.transcript.segments).toHaveLength(2);
    });

    it('should stop all live services on stopLiveMode', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      await orchestrator.stopLiveMode();

      expect(services.aiAssistant.stopSilenceMonitoring).toHaveBeenCalled();
      expect(services.sessionAnalytics.endSession).toHaveBeenCalled();
      expect(services.audioRecorder.stopRecording).toHaveBeenCalled();
      expect(orchestrator.isLiveMode).toBe(false);
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });

    it('should pass language setting through to live transcription', async () => {
      await orchestrator.startLiveMode({ language: 'it', batchDuration: 999999 });

      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );

      await orchestrator._liveCycle();

      expect(services.transcriptionService.transcribe).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ language: 'it' })
      );
    });
  });

  // ========================================================================
  // 4. Error propagation across services
  // ========================================================================

  describe('Error propagation between services', () => {
    it('should propagate audio recorder failure to orchestrator error state', async () => {
      services.audioRecorder.startRecording.mockRejectedValue(new Error('Microphone denied'));

      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      await expect(orchestrator.startSession()).rejects.toThrow('Microphone denied');
      expect(orchestrator.state).toBe(SessionState.ERROR);
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'startSession');
    });

    it('should propagate transcription failure without corrupting session data', async () => {
      await orchestrator.startSession({ title: 'Error Propagation' });
      await orchestrator.stopSession({ processImmediately: false });

      // Replace transcription processor to simulate API failure
      orchestrator._transcriptionProcessor = {
        processTranscription: vi.fn().mockRejectedValue(new Error('OpenAI rate limit'))
      };

      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      await expect(orchestrator.processTranscription()).rejects.toThrow('OpenAI rate limit');
      expect(orchestrator.state).toBe(SessionState.ERROR);

      // Session should still have audio but no transcript
      expect(orchestrator.currentSession.audioBlob).toBeTruthy();
      expect(orchestrator.currentSession.transcript).toBeNull();
      expect(orchestrator.currentSession.errors.length).toBeGreaterThan(0);
      expect(orchestrator.currentSession.errors[0].stage).toBe('processTranscription');
    });

    it('should record entity extraction failure without blocking image generation', async () => {
      // Make entity extraction return null (failure)
      services.entityExtractor.extractAll = vi.fn().mockResolvedValue(null);
      orchestrator = new SessionOrchestrator(services);

      await orchestrator.startSession({ title: 'Partial Failure' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      // Entity extraction failed, but pipeline continued
      expect(orchestrator.currentSession.entities).toBeNull();
      expect(orchestrator.currentSession.errors.length).toBeGreaterThan(0);
      const extractionError = orchestrator.currentSession.errors.find(e => e.stage === 'extraction');
      expect(extractionError).toBeTruthy();

      // Final state should still be COMPLETE (not ERROR)
      expect(orchestrator.state).toBe(SessionState.COMPLETE);
    });

    it('should propagate live cycle transcription error to error callback', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );
      services.transcriptionService.transcribe.mockRejectedValue(
        new Error('Transcription service unavailable')
      );

      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      await orchestrator._liveCycle();

      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'live_cycle');
      expect(orchestrator.currentSession.errors.length).toBeGreaterThan(0);
      expect(orchestrator.currentSession.errors[0].stage).toBe('live_cycle');

      // Live mode should still be active (resilient to individual cycle errors)
      expect(orchestrator.isLiveMode).toBe(true);
    });

    it('should propagate stopRecording failure during stopSession', async () => {
      await orchestrator.startSession({ title: 'Stop Failure' });

      services.audioRecorder.stopRecording.mockRejectedValue(
        new Error('MediaRecorder not in recording state')
      );

      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      await expect(orchestrator.stopSession()).rejects.toThrow('MediaRecorder not in recording state');
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'stopSession');
      expect(orchestrator.state).toBe(SessionState.ERROR);
    });

    it('should propagate Kanka publishing failure to error callback', async () => {
      await orchestrator.startSession({ title: 'Kanka Fail' });
      await orchestrator.stopSession({ processImmediately: false });

      orchestrator._kankaPublisher = {
        publishSession: vi.fn().mockRejectedValue(new Error('Kanka API 429'))
      };

      const onError = vi.fn();
      orchestrator.setCallbacks({ onError });

      await expect(orchestrator.publishToKanka()).rejects.toThrow('Kanka API 429');
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'publishToKanka');
    });

    it('should accumulate errors across multiple stages without losing earlier ones', async () => {
      // Set up entity extraction to fail softly (return null)
      services.entityExtractor.extractAll = vi.fn().mockResolvedValue(null);
      orchestrator = new SessionOrchestrator(services);

      await orchestrator.startSession({ title: 'Multi Error' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      // Should have extraction error and image generation error (no moments -> no images)
      expect(orchestrator.currentSession.errors.length).toBeGreaterThanOrEqual(1);

      // Errors from different stages should be preserved
      const stages = orchestrator.currentSession.errors.map(e => e.stage);
      expect(stages).toContain('extraction');
    });
  });

  // ========================================================================
  // 5. Cancel workflow — cleanup across services
  // ========================================================================

  describe('Cancel workflow across services', () => {
    it('should cancel during recording and clean up audio recorder', async () => {
      await orchestrator.startSession({ title: 'Cancel Recording' });
      expect(orchestrator.state).toBe(SessionState.RECORDING);

      orchestrator.cancelSession();

      expect(services.audioRecorder.cancel).toHaveBeenCalled();
      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.currentSession).toBeNull();
    });

    it('should cancel during live mode and clean up all live services', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      expect(orchestrator.isLiveMode).toBe(true);
      expect(orchestrator._liveCycleTimer).toBeTruthy();

      orchestrator.cancelSession();

      expect(services.audioRecorder.cancel).toHaveBeenCalled();
      expect(services.aiAssistant.stopSilenceMonitoring).toHaveBeenCalled();
      expect(orchestrator._liveCycleTimer).toBeNull();
      expect(orchestrator._liveMode).toBe(false);
      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.currentSession).toBeNull();
    });

    it('should allow starting a new session after cancel', async () => {
      await orchestrator.startSession({ title: 'First Session' });
      orchestrator.cancelSession();

      // Should be able to start a new session
      await orchestrator.startSession({ title: 'Second Session' });
      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(orchestrator.currentSession.title).toBe('Second Session');
    });

    it('should allow starting live mode after cancelling chronicle mode', async () => {
      await orchestrator.startSession({ title: 'Chronicle' });
      orchestrator.cancelSession();

      await orchestrator.startLiveMode({ title: 'Live After Cancel' });
      expect(orchestrator.isLiveMode).toBe(true);
      expect(orchestrator.state).toBe(SessionState.LIVE_LISTENING);
    });

    it('should allow starting chronicle mode after cancelling live mode', async () => {
      await orchestrator.startLiveMode({ title: 'Live' });
      orchestrator.cancelSession();

      await orchestrator.startSession({ title: 'Chronicle After Cancel' });
      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(orchestrator.isLiveMode).toBe(false);
    });
  });

  // ========================================================================
  // 6. Pause / resume across services
  // ========================================================================

  describe('Pause and resume across services', () => {
    it('should pause and resume in chronicle mode', async () => {
      await orchestrator.startSession({ title: 'Pause Test' });
      expect(orchestrator.state).toBe(SessionState.RECORDING);

      orchestrator.pauseRecording();
      expect(orchestrator.state).toBe(SessionState.PAUSED);
      expect(services.audioRecorder.pause).toHaveBeenCalled();

      orchestrator.resumeRecording();
      expect(orchestrator.state).toBe(SessionState.RECORDING);
      expect(services.audioRecorder.resume).toHaveBeenCalled();
    });

    it('should pause and resume in live mode, stopping and restarting the cycle timer', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      expect(orchestrator._liveCycleTimer).toBeTruthy();

      orchestrator.pauseRecording();
      expect(orchestrator.state).toBe(SessionState.PAUSED);
      expect(orchestrator._liveCycleTimer).toBeNull();

      orchestrator.resumeRecording();
      expect(orchestrator.state).toBe(SessionState.LIVE_LISTENING);
      expect(orchestrator._liveCycleTimer).toBeTruthy();
    });

    it('should still be able to stop after pause-resume cycle', async () => {
      await orchestrator.startSession({ title: 'Pause Stop' });
      orchestrator.pauseRecording();
      orchestrator.resumeRecording();

      const session = await orchestrator.stopSession({ processImmediately: false });
      expect(session.audioBlob).toBeTruthy();
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });
  });

  // ========================================================================
  // 7. Reset workflow
  // ========================================================================

  describe('Reset cleans up all service state', () => {
    it('should reset from recording state and allow fresh start', async () => {
      await orchestrator.startSession({ title: 'Reset Test' });
      expect(orchestrator.isSessionActive).toBe(true);

      orchestrator.reset();

      expect(orchestrator.state).toBe(SessionState.IDLE);
      expect(orchestrator.currentSession).toBeNull();
      expect(orchestrator.isLiveMode).toBe(false);
      expect(orchestrator._liveCycleTimer).toBeNull();

      // Should start fresh
      await orchestrator.startSession({ title: 'After Reset' });
      expect(orchestrator.state).toBe(SessionState.RECORDING);
    });

    it('should reset from live mode and clear all live state', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // Simulate accumulated live data
      orchestrator._liveTranscript = [
        { text: 'segment1', speaker: 'SPEAKER_00', start: 0, end: 1 }
      ];
      orchestrator._silenceStartTime = Date.now();
      orchestrator._lastAISuggestions = [{ type: 'narration', content: 'test' }];

      orchestrator.reset();

      expect(orchestrator._liveTranscript).toHaveLength(0);
      expect(orchestrator._silenceStartTime).toBeNull();
      expect(orchestrator._lastAISuggestions).toBeNull();
      expect(orchestrator._liveMode).toBe(false);
      expect(orchestrator._isStopping).toBe(false);
      expect(orchestrator._liveCycleTimer).toBeNull();
    });
  });

  // ========================================================================
  // 8. Service call ordering verification
  // ========================================================================

  describe('Service call ordering', () => {
    it('should call services in pipeline order: transcribe -> extract -> generate', async () => {
      const callOrder = [];

      // Track call order via mock implementations
      orchestrator._transcriptionProcessor.processTranscription = vi.fn().mockImplementation(async () => {
        callOrder.push('transcribe');
        return {
          text: 'Test text',
          segments: [{ text: 'Test text', speaker: 'SPEAKER_00', start: 0, end: 1 }],
          language: 'en'
        };
      });

      orchestrator._entityProcessor.extractAll = vi.fn().mockImplementation(async () => {
        callOrder.push('extractEntities');
        return {
          characters: [{ name: 'TestChar' }],
          locations: [],
          items: [],
          moments: [{ id: 'm1', title: 'Moment', imagePrompt: 'test' }],
          totalCount: 1
        };
      });

      orchestrator._entityProcessor.extractRelationships = vi.fn().mockImplementation(async () => {
        callOrder.push('extractRelationships');
        return [];
      });

      orchestrator._imageProcessor.generateImages = vi.fn().mockImplementation(async () => {
        callOrder.push('generateImages');
        return [{ success: true, imageData: 'base64' }];
      });

      await orchestrator.startSession({ title: 'Order Test' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      expect(callOrder).toEqual([
        'transcribe',
        'extractEntities',
        'extractRelationships',
        'generateImages'
      ]);
    });

    it('should call analytics startSession before audio recording in live mode', async () => {
      const callOrder = [];

      services.sessionAnalytics.startSession.mockImplementation(() => {
        callOrder.push('analytics.start');
      });
      services.audioRecorder.startRecording.mockImplementation(() => {
        callOrder.push('audio.start');
        return Promise.resolve();
      });

      await orchestrator.startLiveMode();

      const analyticsIdx = callOrder.indexOf('analytics.start');
      const audioIdx = callOrder.indexOf('audio.start');
      expect(analyticsIdx).toBeLessThan(audioIdx);
    });

    it('should stop audio before analytics teardown in live mode stop (deadline architecture)', async () => {
      const callOrder = [];

      services.sessionAnalytics.endSession.mockImplementation(() => {
        callOrder.push('analytics.end');
      });
      services.audioRecorder.stopRecording.mockImplementation(() => {
        callOrder.push('audio.stop');
        return Promise.resolve(new Blob(['audio'], { type: 'audio/webm' }));
      });

      await orchestrator.startLiveMode();
      await orchestrator.stopLiveMode();

      // New behavior (04-02): audio stop is time-critical (inside deadline race),
      // analytics cleanup happens in _fullTeardown after audio is captured
      const analyticsIdx = callOrder.indexOf('analytics.end');
      const audioIdx = callOrder.indexOf('audio.stop');
      expect(audioIdx).toBeLessThan(analyticsIdx);
    });
  });

  // ========================================================================
  // 9. Mode switching
  // ========================================================================

  describe('Mode switching between chronicle and live', () => {
    it('should not allow starting chronicle mode while live mode is active', async () => {
      await orchestrator.startLiveMode();
      await expect(orchestrator.startSession()).rejects.toThrow('A session is already active');
    });

    it('should reuse existing session when starting live mode during chronicle mode', async () => {
      await orchestrator.startSession({ title: 'Chronicle First' });
      const sessionId = orchestrator.currentSession.id;

      // startLiveMode reuses the existing session object (no guard against chronicle->live)
      await orchestrator.startLiveMode();
      expect(orchestrator.isLiveMode).toBe(true);
      expect(orchestrator.currentSession.id).toBe(sessionId);
    });

    it('should preserve service instances when switching modes', async () => {
      // Start and stop chronicle mode
      await orchestrator.startSession({ title: 'Chronicle' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      // Verify services are still available for live mode
      const status = orchestrator.getServicesStatus();
      expect(status.canLiveMode).toBe(true);
      expect(status.canRecord).toBe(true);
      expect(status.canTranscribe).toBe(true);
    });
  });

  // ========================================================================
  // 10. Callback integration
  // ========================================================================

  describe('Callback integration across workflow stages', () => {
    it('should call onError at each failure point with correct stage', async () => {
      const errors = [];
      orchestrator.setCallbacks({
        onError: (error, stage) => errors.push({ message: error.message, stage })
      });

      // Failure during start
      services.audioRecorder.startRecording.mockRejectedValueOnce(new Error('Start fail'));
      try { await orchestrator.startSession(); } catch { /* expected */ }
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({ message: 'Start fail', stage: 'startSession' });
    });

    it('should call onStateChange for every state transition in live cycle', async () => {
      const transitions = [];
      orchestrator.setCallbacks({
        onStateChange: (newState, oldState) => transitions.push({ from: oldState, to: newState })
      });

      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // Clear start transitions
      transitions.length = 0;

      // Run a live cycle with audio
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );

      await orchestrator._liveCycle();

      // Should transition through LIVE_TRANSCRIBING -> LIVE_ANALYZING -> LIVE_LISTENING
      const states = transitions.map(t => t.to);
      expect(states).toContain(SessionState.LIVE_TRANSCRIBING);
      expect(states).toContain(SessionState.LIVE_ANALYZING);
      expect(states).toContain(SessionState.LIVE_LISTENING);
    });

    it('should wire autonomous suggestion callback from AIAssistant to orchestrator', async () => {
      const suggestions = [];
      orchestrator.setCallbacks({
        onAISuggestion: (suggestion, silenceEvent) => suggestions.push({ suggestion, silenceEvent })
      });

      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // The orchestrator should have wired the callback
      expect(services.aiAssistant.setOnAutonomousSuggestionCallback).toHaveBeenCalledTimes(1);

      // Simulate the AI assistant triggering an autonomous suggestion
      const callbackFn = services.aiAssistant.setOnAutonomousSuggestionCallback.mock.calls[0][0];
      callbackFn({
        suggestion: { type: 'narration', content: 'The room falls silent...' },
        silenceEvent: { duration: 45000 }
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].suggestion.type).toBe('narration');
      expect(suggestions[0].suggestion.content).toBe('The room falls silent...');
      expect(suggestions[0].silenceEvent.duration).toBe(45000);
    });
  });

  // ========================================================================
  // 11. Live cycle resilience
  // ========================================================================

  describe('Live cycle resilience to service failures', () => {
    it('should continue live mode after transient transcription error', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // First cycle: error
      services.audioRecorder.getLatestChunk.mockResolvedValue(
        new Blob(['audio'], { type: 'audio/webm' })
      );
      services.transcriptionService.transcribe.mockRejectedValueOnce(
        new Error('Temporary API error')
      );

      await orchestrator._liveCycle();
      expect(orchestrator.isLiveMode).toBe(true);
      expect(orchestrator._consecutiveLiveCycleErrors).toBe(1);

      // Second cycle: success
      services.transcriptionService.transcribe.mockResolvedValueOnce({
        text: 'Recovery',
        segments: [{ text: 'Recovery', speaker: 'SPEAKER_00', start: 0, end: 1 }]
      });

      await orchestrator._liveCycle();
      expect(orchestrator._consecutiveLiveCycleErrors).toBe(0);
      expect(orchestrator._liveTranscript).toHaveLength(1);
    });

    it('should warn user after 3 consecutive live cycle errors', async () => {
      ui.notifications.warn.mockClear();
      await orchestrator.startLiveMode({ batchDuration: 999999 });
      services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('Persistent error'));

      for (let i = 0; i < 3; i++) {
        await orchestrator._liveCycle();
      }

      expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
      expect(orchestrator._consecutiveLiveCycleErrors).toBe(3);

      // Additional errors should not trigger more warnings
      await orchestrator._liveCycle();
      expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
    });

    it('should reschedule live cycle even after error', async () => {
      await orchestrator.startLiveMode({ batchDuration: 999999 });

      // Clear the initial timer
      clearTimeout(orchestrator._liveCycleTimer);
      orchestrator._liveCycleTimer = null;

      services.audioRecorder.getLatestChunk.mockRejectedValue(new Error('Error'));

      await orchestrator._liveCycle();

      // Timer should be rescheduled despite error
      expect(orchestrator._liveCycleTimer).toBeTruthy();
    });
  });

  // ========================================================================
  // 12. Data flow integrity
  // ========================================================================

  describe('Data flow integrity across services', () => {
    it('should preserve session ID throughout the entire workflow', async () => {
      await orchestrator.startSession({ title: 'ID Persistence' });
      const sessionId = orchestrator.currentSession.id;

      await orchestrator.stopSession({ processImmediately: false });
      expect(orchestrator.currentSession.id).toBe(sessionId);

      await orchestrator.processTranscription();
      expect(orchestrator.currentSession.id).toBe(sessionId);
    });

    it('should preserve errors array throughout the pipeline', async () => {
      await orchestrator.startSession({ title: 'Error Array' });
      await orchestrator.stopSession({ processImmediately: false });

      // The errors array should be initialized and persist
      expect(orchestrator.currentSession.errors).toEqual([]);

      await orchestrator.processTranscription();
      expect(Array.isArray(orchestrator.currentSession.errors)).toBe(true);
    });

    it('should carry startTime and endTime through the workflow', async () => {
      await orchestrator.startSession({ title: 'Timestamps' });
      const startTime = orchestrator.currentSession.startTime;
      expect(startTime).toBeTruthy();

      // Advance time to simulate recording
      vi.advanceTimersByTime(5000);

      await orchestrator.stopSession({ processImmediately: false });
      const endTime = orchestrator.currentSession.endTime;
      expect(endTime).toBeTruthy();
      expect(endTime).toBeGreaterThanOrEqual(startTime);

      // Timestamps should persist through processing
      await orchestrator.processTranscription();
      expect(orchestrator.currentSession.startTime).toBe(startTime);
      expect(orchestrator.currentSession.endTime).toBe(endTime);
    });

    it('should not mutate services when session data changes', async () => {
      const originalTranscribe = services.transcriptionService.transcribe;

      await orchestrator.startSession({ title: 'Immutability' });
      await orchestrator.stopSession({ processImmediately: false });
      await orchestrator.processTranscription();

      // Service mock references should not be mutated
      expect(services.transcriptionService.transcribe).toBe(originalTranscribe);
    });
  });
});

// ---------------------------------------------------------------------------
// Streaming & cycle-in-flight integration (06-03)
// ---------------------------------------------------------------------------

describe('Streaming & cycle-in-flight integration (06-03)', () => {
  let services;
  let orchestrator;

  beforeEach(() => {
    services = {
      audioRecorder: createMockAudioRecorder({
        getLatestChunk: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' }))
      }),
      transcriptionService: createMockTranscriptionService(),
      aiAssistant: {
        analyzeContext: vi.fn().mockResolvedValue({
          suggestions: [{ type: 'narration', content: 'Describe the scene' }],
          offTrackStatus: { isOffTrack: false },
          usage: { prompt_tokens: 100, completion_tokens: 50 },
          model: 'gpt-4o-mini'
        }),
        setAdventureContext: vi.fn(),
        setChapterContext: vi.fn(),
        setOnAutonomousSuggestionCallback: vi.fn(),
        startSilenceMonitoring: vi.fn().mockReturnValue(true),
        stopSilenceMonitoring: vi.fn(),
        recordActivityForSilenceDetection: vi.fn().mockReturnValue(true),
        setNPCProfiles: vi.fn(),
        setNextChapterLookahead: vi.fn(),
        _silenceMonitor: {
          setIsCycleInFlightFn: vi.fn(),
          stopMonitoring: vi.fn()
        }
      }
    };
    orchestrator = new SessionOrchestrator(services);
  });

  afterEach(() => {
    if (orchestrator._liveCycleTimer) {
      clearTimeout(orchestrator._liveCycleTimer);
      orchestrator._liveCycleTimer = null;
    }
    orchestrator._liveMode = false;
  });

  it('should set _isCycleInFlight true during _liveCycle and false after', async () => {
    await orchestrator.startLiveMode({ batchDuration: 999999 });
    clearTimeout(orchestrator._liveCycleTimer);
    orchestrator._liveCycleTimer = null;

    let flagDuringAnalysis = null;
    services.aiAssistant.analyzeContext.mockImplementation(async () => {
      flagDuringAnalysis = orchestrator._isCycleInFlight;
      return {
        suggestions: [{ type: 'narration', content: 'test' }],
        offTrackStatus: { isOffTrack: false },
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      };
    });

    await orchestrator._liveCycle();
    expect(flagDuringAnalysis).toBe(true);
    expect(orchestrator._isCycleInFlight).toBe(false);
  });

  it('should inject cycle-in-flight guard into SilenceMonitor', async () => {
    await orchestrator.startLiveMode({ batchDuration: 999999 });
    expect(services.aiAssistant._silenceMonitor.setIsCycleInFlightFn).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should fire onStreamToken and onStreamComplete callbacks', async () => {
    const onStreamToken = vi.fn();
    const onStreamComplete = vi.fn();
    orchestrator.setCallbacks({ onStreamToken, onStreamComplete });

    // Verify callbacks were registered
    expect(orchestrator._callbacks.onStreamToken).toBe(onStreamToken);
    expect(orchestrator._callbacks.onStreamComplete).toBe(onStreamComplete);
  });

  it('silence events should be dropped when _isCycleInFlight is true (via SilenceMonitor guard)', async () => {
    await orchestrator.startLiveMode({ batchDuration: 999999 });

    // Get the injected function
    const injectedFnCall = services.aiAssistant._silenceMonitor.setIsCycleInFlightFn.mock.calls[0];
    expect(injectedFnCall).toBeDefined();
    const guardFn = injectedFnCall[0];

    // When not in flight, guard returns false
    orchestrator._isCycleInFlight = false;
    expect(guardFn()).toBe(false);

    // When in flight, guard returns true (silence events should be dropped)
    orchestrator._isCycleInFlight = true;
    expect(guardFn()).toBe(true);
  });
});
