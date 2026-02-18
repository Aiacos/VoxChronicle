/**
 * Live Cycle Integration Tests
 *
 * Tests the integration between SessionOrchestrator._liveCycle() and its
 * dependent services: SceneDetector, SessionAnalytics, AIAssistant.
 *
 * Verifies that:
 * - SceneDetector.detectSceneTransition() is called (not analyzeText)
 * - SessionAnalytics.addSegment() receives individual segments (not arrays)
 * - AIAssistant.analyzeContext() receives a string and returns suggestions + offTrack
 * - ChapterTracker.getCurrentChapter() returns .title property
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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
    DEBUG: 0, INFO: 1, LOG: 2, WARN: 3, ERROR: 4, NONE: 5
  }
}));

vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: {
    isValidAudioBlob: vi.fn(() => true),
    getBlobSizeMB: vi.fn((blob) => blob.size / (1024 * 1024)),
    blobToFile: vi.fn((blob, name) => new File([blob], `${name}.webm`, { type: blob.type })),
    estimateDuration: vi.fn((blob) => Math.round(blob.size / 16000)),
    getRecorderOptions: vi.fn(() => ({ mimeType: 'audio/webm' })),
    createAudioBlob: vi.fn((chunks, mimeType) => new Blob(chunks, { type: mimeType })),
    formatDuration: vi.fn(
      (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`
    )
  },
  MAX_TRANSCRIPTION_SIZE: 25 * 1024 * 1024
}));

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

vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeObject: vi.fn((obj) => obj),
    sanitizeUrl: vi.fn((url) => url),
    sanitizeMessage: vi.fn((msg) => msg),
    sanitizeString: vi.fn((str) => str)
  }
}));

vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  escapeHtml: vi.fn((str) => str),
  stripHtml: vi.fn((str) => str),
  markdownToHtml: vi.fn((str) => str)
}));

vi.mock('../../scripts/audio/AudioChunker.mjs', () => {
  class MockAudioChunker {
    needsChunking() { return false; }
    async splitIfNeeded(blob) { return [blob]; }
    getChunkingInfo(blob) {
      return {
        totalSize: blob.size,
        totalSizeMB: blob.size / (1024 * 1024),
        needsChunking: false,
        estimatedChunkCount: 1
      };
    }
  }
  return { AudioChunker: MockAudioChunker, default: MockAudioChunker };
});

// ---------------------------------------------------------------------------
// Foundry VTT globals
// ---------------------------------------------------------------------------

globalThis.game = {
  settings: {
    get: vi.fn((module, key) => {
      if (key === 'openaiApiKey') return 'test-openai-key';
      return null;
    }),
    set: vi.fn()
  },
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key) => key)
  }
};

globalThis.ui = {
  notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
};

globalThis.Hooks = {
  on: vi.fn(), once: vi.fn(), call: vi.fn(), callAll: vi.fn()
};

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  SessionOrchestrator,
  SessionState
} from '../../scripts/orchestration/SessionOrchestrator.mjs';
import { SceneDetector } from '../../scripts/narrator/SceneDetector.mjs';
import { SessionAnalytics } from '../../scripts/narrator/SessionAnalytics.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAudioBlob(size = 10240) {
  return new Blob([new Uint8Array(size).fill(0)], { type: 'audio/webm' });
}

function createMockTranscriptionResult() {
  return {
    text: 'The party enters the tavern. The barkeep greets them warmly.',
    segments: [
      { speaker: 'SPEAKER_00', text: 'The party enters the tavern.', start: 0, end: 3.5 },
      { speaker: 'SPEAKER_01', text: 'The barkeep greets them warmly.', start: 3.5, end: 7.0 }
    ],
    language: 'en',
    duration: 7.0
  };
}

function createOrchestrator(overrides = {}) {
  const audioRecorder = {
    getLatestChunk: vi.fn().mockResolvedValue(createMockAudioBlob()),
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn().mockResolvedValue(createMockAudioBlob(20480)),
    getAudioLevel: vi.fn().mockReturnValue(0.5),
    isRecording: true,
    getFullRecording: vi.fn().mockResolvedValue(createMockAudioBlob(20480))
  };

  const transcriptionService = {
    transcribe: vi.fn().mockResolvedValue(createMockTranscriptionResult())
  };

  const aiAssistant = {
    generateSuggestions: vi.fn().mockResolvedValue([
      { type: 'narration', content: 'The tavern smells of ale and smoke', confidence: 0.8 },
      { type: 'dialogue', content: 'Welcome, travelers! What brings you here?', confidence: 0.7 }
    ]),
    detectOffTrack: vi.fn().mockResolvedValue({
      isOffTrack: false,
      severity: 0.1,
      reason: 'Players are on track'
    }),
    analyzeContext: vi.fn().mockResolvedValue({
      suggestions: [
        { type: 'narration', content: 'The tavern smells of ale and smoke', confidence: 0.8 },
        { type: 'dialogue', content: 'Welcome, travelers! What brings you here?', confidence: 0.7 }
      ],
      offTrack: { isOffTrack: false, severity: 0.1, reason: 'Players are on track' }
    }),
    setChapterContext: vi.fn(),
    setAdventureContext: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true)
  };

  const sceneDetector = new SceneDetector();
  vi.spyOn(sceneDetector, 'detectSceneTransition');

  const sessionAnalytics = new SessionAnalytics();
  vi.spyOn(sessionAnalytics, 'addSegment');

  const chapterTracker = {
    getCurrentChapter: vi.fn().mockReturnValue({
      id: 'ch1',
      title: 'The Tavern',
      path: 'Act I > The Tavern',
      pageId: 'page-1',
      pageName: 'Chapter 1'
    }),
    updateFromScene: vi.fn()
  };

  const orchestrator = new SessionOrchestrator(
    {
      audioRecorder,
      transcriptionService,
      aiAssistant,
      sceneDetector,
      sessionAnalytics,
      chapterTracker,
      ...overrides
    },
    { autoExtractEntities: false, autoGenerateImages: false }
  );

  return {
    orchestrator,
    audioRecorder,
    transcriptionService,
    aiAssistant,
    sceneDetector,
    sessionAnalytics,
    chapterTracker
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Live Cycle Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Fix #1: SceneDetector method name
  // =========================================================================

  describe('SceneDetector integration', () => {
    it('should call detectSceneTransition (not analyzeText) during live cycle', async () => {
      const { orchestrator, sceneDetector } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      expect(sceneDetector.detectSceneTransition).toHaveBeenCalledWith(
        expect.any(String)
      );
      // Verify analyzeText was NOT called (method doesn't exist)
      expect(sceneDetector.analyzeText).toBeUndefined();

      await orchestrator.stopLiveMode();
    });

    it('should pass transcription text to detectSceneTransition', async () => {
      const { orchestrator, sceneDetector } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      const callArg = sceneDetector.detectSceneTransition.mock.calls[0][0];
      expect(typeof callArg).toBe('string');
      expect(callArg).toContain('party enters the tavern');

      await orchestrator.stopLiveMode();
    });
  });

  // =========================================================================
  // Fix #2: SessionAnalytics.addSegment() individual segments
  // =========================================================================

  describe('SessionAnalytics integration', () => {
    it('should call addSegment for each individual segment, not once with array', async () => {
      const { orchestrator, sessionAnalytics } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      // Should have been called 2 times (one per segment), not once with array
      expect(sessionAnalytics.addSegment).toHaveBeenCalledTimes(2);

      // Each call should receive a single segment object, not an array
      for (const call of sessionAnalytics.addSegment.mock.calls) {
        const arg = call[0];
        expect(Array.isArray(arg)).toBe(false);
        expect(arg).toHaveProperty('speaker');
        expect(arg).toHaveProperty('start');
        expect(arg).toHaveProperty('end');
      }

      await orchestrator.stopLiveMode();
    });

    it('should pass segments with correct structure to addSegment', async () => {
      const { orchestrator, sessionAnalytics } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      const firstSegment = sessionAnalytics.addSegment.mock.calls[0][0];
      expect(firstSegment.speaker).toBe('SPEAKER_00');
      expect(firstSegment.start).toBe(0);
      expect(firstSegment.end).toBe(3.5);
      expect(firstSegment.text).toBe('The party enters the tavern.');

      const secondSegment = sessionAnalytics.addSegment.mock.calls[1][0];
      expect(secondSegment.speaker).toBe('SPEAKER_01');
      expect(secondSegment.start).toBe(3.5);
      expect(secondSegment.end).toBe(7.0);

      await orchestrator.stopLiveMode();
    });
  });

  // =========================================================================
  // Fix #3: analyzeContext receives string transcription
  // =========================================================================

  describe('AIAssistant.analyzeContext integration', () => {
    it('should pass a plain string to analyzeContext, not an object', async () => {
      const { orchestrator, aiAssistant } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      expect(aiAssistant.analyzeContext).toHaveBeenCalled();

      const arg = aiAssistant.analyzeContext.mock.calls[0][0];
      expect(typeof arg).toBe('string');

      await orchestrator.stopLiveMode();
    });

    it('should pass accumulated transcript text to analyzeContext', async () => {
      const { orchestrator, aiAssistant } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      const fullText = aiAssistant.analyzeContext.mock.calls[0][0];
      expect(fullText).toContain('party enters the tavern');
      expect(fullText).toContain('barkeep greets them');

      await orchestrator.stopLiveMode();
    });
  });

  // =========================================================================
  // Fix #4: analyzeContext returns suggestions with .content property
  // =========================================================================

  describe('AIAssistant suggestions from analyzeContext', () => {
    it('should store suggestions with .content property from analyzeContext', async () => {
      const { orchestrator } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      const suggestions = orchestrator.getAISuggestions();
      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions[0].content).toBe('The tavern smells of ale and smoke');
      // Verify .text is NOT present (old incorrect property)
      expect(suggestions[0].text).toBeUndefined();

      await orchestrator.stopLiveMode();
    });

    it('should pass transcription text as string to analyzeContext', async () => {
      const { orchestrator, aiAssistant } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      const textArg = aiAssistant.analyzeContext.mock.calls[0][0];
      expect(typeof textArg).toBe('string');

      await orchestrator.stopLiveMode();
    });
  });

  // =========================================================================
  // Fix #5: ChapterTracker.getCurrentChapter() returns .title
  // =========================================================================

  describe('ChapterTracker integration', () => {
    it('should feed chapter context to AIAssistant via setChapterContext', async () => {
      const { orchestrator, aiAssistant, chapterTracker } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      // analyzeContext should have been called (not generateSuggestions)
      expect(aiAssistant.analyzeContext).toHaveBeenCalled();
      // setChapterContext should be called during _runAIAnalysis
      expect(aiAssistant.setChapterContext).toHaveBeenCalled();

      await orchestrator.stopLiveMode();
    });

    it('should expose chapter via getCurrentChapter() with .title property', async () => {
      const { orchestrator } = createOrchestrator();

      const chapter = orchestrator.getCurrentChapter();
      expect(chapter).toBeDefined();
      expect(chapter.title).toBe('The Tavern');
      expect(chapter.path).toBe('Act I > The Tavern');
    });
  });

  // =========================================================================
  // Full live cycle end-to-end
  // =========================================================================

  describe('full live cycle end-to-end', () => {
    it('should complete full live cycle without errors', async () => {
      const {
        orchestrator, sceneDetector, sessionAnalytics, aiAssistant
      } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'E2E Test', batchDuration: 100000 });
      expect(orchestrator.state).toBe(SessionState.LIVE_LISTENING);

      // Run live cycle
      await orchestrator._liveCycle();

      // Verify all integrations were called correctly
      expect(sceneDetector.detectSceneTransition).toHaveBeenCalled();
      expect(sessionAnalytics.addSegment).toHaveBeenCalledTimes(2);
      expect(aiAssistant.analyzeContext).toHaveBeenCalled();

      // Verify transcript accumulated
      expect(orchestrator._liveTranscript).toHaveLength(2);

      // Stop and verify session
      const session = await orchestrator.stopLiveMode();
      expect(session).toBeDefined();
      expect(orchestrator.state).toBe(SessionState.IDLE);
    });

    it('should handle multiple live cycles and accumulate segments', async () => {
      const { orchestrator, sessionAnalytics } = createOrchestrator();

      await orchestrator.startLiveMode({ title: 'Multi-Cycle', batchDuration: 100000 });

      await orchestrator._liveCycle();
      expect(orchestrator._liveTranscript).toHaveLength(2);
      expect(sessionAnalytics.addSegment).toHaveBeenCalledTimes(2);

      await orchestrator._liveCycle();
      expect(orchestrator._liveTranscript).toHaveLength(4);
      expect(sessionAnalytics.addSegment).toHaveBeenCalledTimes(4);

      await orchestrator.stopLiveMode();
    });

    it('should handle silence when getLatestChunk returns empty blob', async () => {
      const { orchestrator, aiAssistant } = createOrchestrator({
        audioRecorder: {
          getLatestChunk: vi.fn().mockResolvedValue(new Blob([], { type: 'audio/webm' })),
          startRecording: vi.fn().mockResolvedValue(undefined),
          stopRecording: vi.fn().mockResolvedValue(createMockAudioBlob()),
          getAudioLevel: vi.fn().mockReturnValue(0),
          isRecording: true,
          getFullRecording: vi.fn().mockResolvedValue(createMockAudioBlob())
        }
      });

      await orchestrator.startLiveMode({ title: 'Silence Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      // Should not call AI analysis when there's no audio
      expect(aiAssistant.analyzeContext).not.toHaveBeenCalled();

      await orchestrator.stopLiveMode();
    });

    it('should handle null getLatestChunk gracefully', async () => {
      const { orchestrator, aiAssistant } = createOrchestrator({
        audioRecorder: {
          getLatestChunk: vi.fn().mockResolvedValue(null),
          startRecording: vi.fn().mockResolvedValue(undefined),
          stopRecording: vi.fn().mockResolvedValue(createMockAudioBlob()),
          getAudioLevel: vi.fn().mockReturnValue(0),
          isRecording: true,
          getFullRecording: vi.fn().mockResolvedValue(createMockAudioBlob())
        }
      });

      await orchestrator.startLiveMode({ title: 'Null Chunk', batchDuration: 100000 });
      await orchestrator._liveCycle();

      expect(aiAssistant.analyzeContext).not.toHaveBeenCalled();

      await orchestrator.stopLiveMode();
    });

    it('should handle transcription errors gracefully', async () => {
      const errors = [];
      const { orchestrator } = createOrchestrator({
        transcriptionService: {
          transcribe: vi.fn().mockRejectedValue(new Error('API error'))
        }
      });

      orchestrator.setCallbacks({
        onError: (err, stage) => errors.push({ error: err.message, stage })
      });

      await orchestrator.startLiveMode({ title: 'Error Test', batchDuration: 100000 });
      await orchestrator._liveCycle();

      expect(errors).toHaveLength(1);
      expect(errors[0].stage).toBe('live_cycle');
      expect(errors[0].error).toContain('API error');

      // Should still be in live listening state
      expect(orchestrator.state).toBe(SessionState.LIVE_LISTENING);

      await orchestrator.stopLiveMode();
    });
  });
});
