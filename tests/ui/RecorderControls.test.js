/**
 * RecorderControls Unit Tests
 *
 * Tests for the RecorderControls UI component.
 * Covers UI state management, orchestrator integration, recording controls,
 * event handling, and template rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMockApplication } from '../helpers/foundry-mock.js';

// Mock Logger before importing RecorderControls
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

// Mock MODULE_ID
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock HtmlUtils
vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  escapeHtml: (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, (char) => {
      const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return escapeMap[char];
    });
  }
}));

// Create shared mock instances
const mockOrchestrator = {
  startSession: vi.fn().mockResolvedValue(undefined),
  stopSession: vi.fn().mockResolvedValue({ success: true }),
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  cancelSession: vi.fn(),
  getSessionSummary: vi.fn().mockReturnValue({
    transcript: { segments: [], speakers: [] },
    entities: { totalCount: 0 }
  }),
  setCallbacks: vi.fn()
};

const mockTranscriptionService = {
  checkHealth: vi.fn().mockResolvedValue(true)
};

const mockVoxChronicleInstance = {
  sessionOrchestrator: mockOrchestrator,
  transcriptionService: mockTranscriptionService
};

// Mock VoxChronicle
vi.mock('../../scripts/core/VoxChronicle.mjs', () => ({
  VoxChronicle: {
    getInstance: () => mockVoxChronicleInstance
  }
}));

// Mock Settings
const mockSettings = {
  getConfigurationStatus: vi.fn().mockReturnValue({
    ready: true,
    openai: true,
    kanka: true
  }),
  getSpeakerLabels: vi.fn().mockReturnValue({}),
  getTranscriptionLanguage: vi.fn().mockReturnValue('en'),
  getAudioSettings: vi.fn().mockReturnValue({})
};

vi.mock('../../scripts/core/Settings.mjs', () => ({
  Settings: mockSettings
}));

// Set up DOM and globals before any test runs
setupEnvironment();

function setupEnvironment() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.$ = () => ({
    on: vi.fn(),
    find: vi.fn(() => ({
      on: vi.fn()
    }))
  });

  // Set up Application class
  global.Application = createMockApplication();

  // Set up SettingsConfig with render method
  global.SettingsConfig = class SettingsConfig {
    render() {
      return this;
    }
  };
}

// Import after environment is set up
const { RecorderControls, RecorderUIState } = await import('../../scripts/ui/RecorderControls.mjs');
const { SessionState } = await import('../../scripts/orchestration/SessionOrchestrator.mjs');

/**
 * Create mock game object
 */
function createMockGame() {
  return {
    settings: {
      get: vi.fn((module, key) => {
        if (key === 'transcriptionMode') return 'auto';
        if (key === 'showTranscriptionModeIndicator') return true;
        return '';
      }),
      set: vi.fn(),
      register: vi.fn()
    },
    i18n: {
      localize: vi.fn((key) => {
        if (typeof key !== 'string') return key;
        return key;
      }),
      format: vi.fn((key, data) => {
        if (typeof key !== 'string') return key;
        let result = key;
        if (data) {
          Object.entries(data).forEach(([k, v]) => {
            result = result.replace(`{${k}}`, v);
          });
        }
        return result;
      })
    }
  };
}

/**
 * Create mock ui.notifications
 */
function createMockNotifications() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    notify: vi.fn()
  };
}

/**
 * Create mock foundry.utils
 */
function createMockFoundryUtils() {
  return {
    mergeObject: vi.fn((original, other) => ({ ...original, ...other }))
  };
}

describe('RecorderControls', () => {
  let recorder;
  let orchestratorCallbacks = {};
  let mockGame;
  let mockUi;

  beforeEach(() => {
    // Reset mock call history only (preserve implementations)
    mockOrchestrator.startSession.mockClear();
    mockOrchestrator.stopSession.mockClear();
    mockOrchestrator.pauseRecording.mockClear();
    mockOrchestrator.resumeRecording.mockClear();
    mockOrchestrator.cancelSession.mockClear();
    mockOrchestrator.setCallbacks.mockClear();
    mockTranscriptionService.checkHealth.mockClear();
    mockSettings.getConfigurationStatus.mockClear();

    orchestratorCallbacks = {};

    // Set up orchestrator to capture callbacks
    mockOrchestrator.setCallbacks.mockImplementation((callbacks) => {
      Object.assign(orchestratorCallbacks, callbacks);
    });

    // Reset mock return values to defaults
    mockOrchestrator.startSession.mockResolvedValue(undefined);
    mockOrchestrator.stopSession.mockResolvedValue({ success: true });
    mockTranscriptionService.checkHealth.mockResolvedValue(true);
    mockSettings.getConfigurationStatus.mockReturnValue({
      ready: true,
      openai: true,
      kanka: true
    });

    // Set up mock game and ui
    mockGame = createMockGame();
    mockUi = { notifications: createMockNotifications() };

    // Set up global objects
    global.game = mockGame;
    global.ui = mockUi;
    global.foundry = { utils: createMockFoundryUtils() };

    // Create instance
    recorder = new RecorderControls();
  });

  afterEach(() => {
    if (recorder._durationInterval) {
      clearInterval(recorder._durationInterval);
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default state', () => {
      expect(recorder._uiState).toBe(RecorderUIState.IDLE);
      expect(recorder._recordingStartTime).toBeNull();
      expect(recorder._durationInterval).toBeNull();
      expect(recorder._lastError).toBeNull();
    });

    it('should initialize progress object', () => {
      expect(recorder._progress).toEqual({
        stage: '',
        progress: 0,
        message: ''
      });
    });

    it('should set up orchestrator callbacks', () => {
      expect(mockOrchestrator.setCallbacks).toHaveBeenCalled();
      expect(orchestratorCallbacks.onStateChange).toBeDefined();
      expect(orchestratorCallbacks.onProgress).toBeDefined();
      expect(orchestratorCallbacks.onError).toBeDefined();
      expect(orchestratorCallbacks.onSessionComplete).toBeDefined();
    });

    it('should handle missing orchestrator gracefully', () => {
      const originalOrchestrator = mockVoxChronicleInstance.sessionOrchestrator;
      mockVoxChronicleInstance.sessionOrchestrator = null;

      expect(() => new RecorderControls()).not.toThrow();

      mockVoxChronicleInstance.sessionOrchestrator = originalOrchestrator;
    });
  });

  describe('Orchestrator State Change Callbacks', () => {
    it('should map IDLE orchestrator state to IDLE UI state', () => {
      recorder._uiState = RecorderUIState.RECORDING;
      recorder._recordingStartTime = Date.now();
      recorder._durationInterval = setInterval(() => {}, 1000);

      orchestratorCallbacks.onStateChange(SessionState.IDLE, SessionState.RECORDING, {});

      expect(recorder._uiState).toBe(RecorderUIState.IDLE);
      expect(recorder._durationInterval).toBeNull();
    });

    it('should map RECORDING orchestrator state to RECORDING UI state', () => {
      orchestratorCallbacks.onStateChange(SessionState.RECORDING, SessionState.IDLE, {});

      expect(recorder._uiState).toBe(RecorderUIState.RECORDING);
      expect(recorder._recordingStartTime).not.toBeNull();
      expect(recorder._durationInterval).not.toBeNull();
    });

    it('should map PAUSED orchestrator state to PAUSED UI state', () => {
      orchestratorCallbacks.onStateChange(SessionState.PAUSED, SessionState.RECORDING, {});

      expect(recorder._uiState).toBe(RecorderUIState.PAUSED);
    });

    it('should map PROCESSING orchestrator state to PROCESSING UI state', () => {
      orchestratorCallbacks.onStateChange(SessionState.PROCESSING, SessionState.RECORDING, {});

      expect(recorder._uiState).toBe(RecorderUIState.PROCESSING);
    });

    it('should map EXTRACTING orchestrator state to PROCESSING UI state', () => {
      orchestratorCallbacks.onStateChange(SessionState.EXTRACTING, SessionState.PROCESSING, {});

      expect(recorder._uiState).toBe(RecorderUIState.PROCESSING);
    });

    it('should map GENERATING_IMAGES orchestrator state to PROCESSING UI state', () => {
      orchestratorCallbacks.onStateChange(
        SessionState.GENERATING_IMAGES,
        SessionState.EXTRACTING,
        {}
      );

      expect(recorder._uiState).toBe(RecorderUIState.PROCESSING);
    });

    it('should map PUBLISHING orchestrator state to PROCESSING UI state', () => {
      orchestratorCallbacks.onStateChange(
        SessionState.PUBLISHING,
        SessionState.GENERATING_IMAGES,
        {}
      );

      expect(recorder._uiState).toBe(RecorderUIState.PROCESSING);
    });

    it('should map COMPLETE orchestrator state to IDLE UI state', () => {
      recorder._uiState = RecorderUIState.PROCESSING;
      recorder._recordingStartTime = Date.now();
      recorder._durationInterval = setInterval(() => {}, 1000);

      orchestratorCallbacks.onStateChange(SessionState.COMPLETE, SessionState.PUBLISHING, {});

      expect(recorder._uiState).toBe(RecorderUIState.IDLE);
      expect(recorder._durationInterval).toBeNull();
    });

    it('should map ERROR orchestrator state to ERROR UI state', () => {
      recorder._recordingStartTime = Date.now();
      recorder._durationInterval = setInterval(() => {}, 1000);

      orchestratorCallbacks.onStateChange(SessionState.ERROR, SessionState.RECORDING, {});

      expect(recorder._uiState).toBe(RecorderUIState.ERROR);
      expect(recorder._durationInterval).toBeNull();
    });
  });

  describe('Progress Callbacks', () => {
    it('should update progress information', () => {
      const progressData = {
        stage: 'transcription',
        progress: 50,
        message: 'Transcribing audio...'
      };

      orchestratorCallbacks.onProgress(progressData);

      expect(recorder._progress).toEqual(progressData);
    });

    it('should handle progress updates with partial data', () => {
      orchestratorCallbacks.onProgress({
        stage: 'extracting',
        progress: 25
      });

      expect(recorder._progress.stage).toBe('extracting');
      expect(recorder._progress.progress).toBe(25);
    });
  });

  describe('Error Callbacks', () => {
    it('should set last error and show notification', () => {
      const error = new Error('Test error message');
      const stage = 'transcription';

      orchestratorCallbacks.onError(error, stage);

      expect(recorder._lastError).toBe('Test error message');
      expect(mockUi.notifications.error).toHaveBeenCalled();
    });

    it('should handle errors with missing message', () => {
      const error = { toString: () => 'Generic error' };

      // Should not throw when error doesn't have a message property
      expect(() => orchestratorCallbacks.onError(error, 'test-stage')).not.toThrow();

      // error.message is undefined for objects without message property
      expect(recorder._lastError).toBeUndefined();
      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('Session Complete Callbacks', () => {
    it('should show completion notification with segment count', () => {
      const session = {
        transcript: {
          segments: [{ text: 'segment 1' }, { text: 'segment 2' }, { text: 'segment 3' }]
        }
      };

      orchestratorCallbacks.onSessionComplete(session);

      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should handle session without transcript', () => {
      const session = {};
      orchestratorCallbacks.onSessionComplete(session);

      expect(mockUi.notifications.info).toHaveBeenCalled();
    });
  });

  describe('Duration Timer Management', () => {
    it('should start duration timer and set start time', () => {
      const beforeTime = Date.now();
      recorder._startDurationTimer();
      const afterTime = Date.now();

      expect(recorder._recordingStartTime).toBeGreaterThanOrEqual(beforeTime);
      expect(recorder._recordingStartTime).toBeLessThanOrEqual(afterTime);
      expect(recorder._durationInterval).not.toBeNull();
    });

    it('should clear existing interval when starting new timer', () => {
      const oldInterval = setInterval(() => {}, 1000);
      recorder._durationInterval = oldInterval;

      recorder._startDurationTimer();

      // Verify old interval was cleared (we can't directly test this, but verify new interval exists)
      expect(recorder._durationInterval).not.toBe(oldInterval);
    });

    it('should stop duration timer and clear interval', () => {
      recorder._startDurationTimer();
      recorder._stopDurationTimer();

      expect(recorder._durationInterval).toBeNull();
      expect(recorder._recordingStartTime).toBeNull();
    });

    it('should handle stopping when no timer is active', () => {
      recorder._durationInterval = null;
      expect(() => recorder._stopDurationTimer()).not.toThrow();
    });
  });

  describe('Duration Calculation', () => {
    it('should return 0 when not recording', () => {
      recorder._recordingStartTime = null;
      expect(recorder._getRecordingDuration()).toBe(0);
    });

    it('should calculate duration in seconds', () => {
      recorder._recordingStartTime = Date.now() - 5000;
      const duration = recorder._getRecordingDuration();

      expect(duration).toBeGreaterThanOrEqual(4);
      expect(duration).toBeLessThanOrEqual(6);
    });

    // Note: Duration formatting is now handled by AudioUtils.formatDuration
    // and is fully tested in tests/utils/AudioUtils.test.js
  });

  describe('Local Backend Health Check', () => {
    it('should return connected when health check passes', async () => {
      mockTranscriptionService.checkHealth.mockResolvedValue(true);

      const status = await recorder._checkLocalBackendHealth();

      expect(status).toBe('connected');
    });

    it('should return unavailable when health check fails', async () => {
      mockTranscriptionService.checkHealth.mockResolvedValue(false);

      const status = await recorder._checkLocalBackendHealth();

      expect(status).toBe('unavailable');
    });

    it('should return unavailable when health check throws error', async () => {
      mockTranscriptionService.checkHealth.mockRejectedValue(new Error('Connection failed'));

      const status = await recorder._checkLocalBackendHealth();

      expect(status).toBe('unavailable');
    });

    it('should return unavailable when service has no checkHealth method', async () => {
      const originalService = mockVoxChronicleInstance.transcriptionService;
      mockVoxChronicleInstance.transcriptionService = {};

      const status = await recorder._checkLocalBackendHealth();

      expect(status).toBe('unavailable');
      mockVoxChronicleInstance.transcriptionService = originalService;
    });

    it('should return unavailable when transcription service is missing', async () => {
      const originalService = mockVoxChronicleInstance.transcriptionService;
      mockVoxChronicleInstance.transcriptionService = null;

      const status = await recorder._checkLocalBackendHealth();

      expect(status).toBe('unavailable');
      mockVoxChronicleInstance.transcriptionService = originalService;
    });
  });

  describe('getData Template Data', () => {
    it('should return complete template data in idle state', async () => {
      recorder._uiState = RecorderUIState.IDLE;
      const data = await recorder.getData();

      expect(data.moduleId).toBe('vox-chronicle');
      expect(data.uiState).toBe(RecorderUIState.IDLE);
      expect(data.isIdle).toBe(true);
      expect(data.isRecording).toBe(false);
      expect(data.canRecord).toBe(true);
      expect(data.canStop).toBe(false);
    });

    it('should return recording state data correctly', async () => {
      recorder._uiState = RecorderUIState.RECORDING;
      recorder._recordingStartTime = Date.now() - 30000;
      const data = await recorder.getData();

      expect(data.isRecording).toBe(true);
      expect(data.canStop).toBe(true);
      expect(data.canPause).toBe(true);
      expect(data.canRecord).toBe(false);
      expect(data.statusClass).toBe('recording');
    });

    it('should return paused state data correctly', async () => {
      recorder._uiState = RecorderUIState.PAUSED;
      const data = await recorder.getData();

      expect(data.isPaused).toBe(true);
      expect(data.canResume).toBe(true);
      expect(data.canStop).toBe(true);
      expect(data.statusClass).toBe('paused');
    });

    it('should return processing state data correctly', async () => {
      recorder._uiState = RecorderUIState.PROCESSING;
      recorder._progress = {
        stage: 'transcription',
        progress: 75,
        message: 'Processing audio...'
      };
      const data = await recorder.getData();

      expect(data.isProcessing).toBe(true);
      expect(data.hasProgress).toBe(true);
      expect(data.progress.progress).toBe(75);
      expect(data.statusClass).toBe('processing');
    });

    it('should return error state data correctly', async () => {
      recorder._uiState = RecorderUIState.ERROR;
      recorder._lastError = 'Test error';
      const data = await recorder.getData();

      expect(data.isError).toBe(true);
      expect(data.lastError).toBe('Test error');
      expect(data.statusClass).toBe('error');
    });

    it('should include configuration status', async () => {
      const data = await recorder.getData();

      expect(data.configStatus).toBeDefined();
      expect(data.isConfigured).toBe(true);
      expect(data.isOpenAIConfigured).toBe(true);
      expect(data.isKankaConfigured).toBe(true);
    });

    it('should include transcription mode for API mode', async () => {
      mockGame.settings.get.mockImplementation((module, key) => {
        if (key === 'transcriptionMode') return 'api';
        return true;
      });

      const data = await recorder.getData();

      expect(data.transcriptionMode).toBe('api');
      expect(data.modeClass).toBe('mode-api');
      expect(data.healthStatus).toBeNull();
    });

    it('should include health status for local mode', async () => {
      mockGame.settings.get.mockImplementation((module, key) => {
        if (key === 'transcriptionMode') return 'local';
        return true;
      });

      const data = await recorder.getData();

      expect(data.transcriptionMode).toBe('local');
      expect(data.modeClass).toBe('mode-local');
      expect(data.healthStatus).toBe('connected');
      expect(data.healthClass).toBe('health-connected');
    });

    it('should include health status for auto mode', async () => {
      mockGame.settings.get.mockImplementation((module, key) => {
        if (key === 'transcriptionMode') return 'auto';
        return true;
      });

      const data = await recorder.getData();

      expect(data.transcriptionMode).toBe('auto');
      expect(data.modeClass).toBe('mode-auto');
      expect(data.healthStatus).toBeDefined();
    });

    it('should include localization strings', async () => {
      const data = await recorder.getData();

      expect(data.i18n).toBeDefined();
      expect(data.i18n.startRecording).toBeDefined();
      expect(data.i18n.stopRecording).toBeDefined();
    });
  });

  describe('startRecording Method', () => {
    it('should start recording with default options', async () => {
      await recorder.startRecording();

      expect(mockOrchestrator.startSession).toHaveBeenCalled();
      expect(mockUi.notifications.info).toHaveBeenCalled();
      expect(recorder._lastError).toBeNull();
    });

    it('should start recording with custom title', async () => {
      await recorder.startRecording({ title: 'Custom Session' });

      expect(mockOrchestrator.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Custom Session'
        })
      );
    });

    it('should warn if OpenAI is not configured', async () => {
      mockSettings.getConfigurationStatus.mockReturnValue({
        ready: false,
        openai: false,
        kanka: true
      });

      await recorder.startRecording();

      expect(mockOrchestrator.startSession).not.toHaveBeenCalled();
      expect(mockUi.notifications.warn).toHaveBeenCalled();
    });

    it('should handle orchestrator errors', async () => {
      mockOrchestrator.startSession.mockRejectedValueOnce(new Error('Start failed'));

      await recorder.startRecording();

      expect(recorder._lastError).toBe('Start failed');
      expect(recorder._uiState).toBe(RecorderUIState.ERROR);
      expect(mockUi.notifications.error).toHaveBeenCalled();
    });

    it('should throw error if orchestrator is not available', async () => {
      const originalOrchestrator = mockVoxChronicleInstance.sessionOrchestrator;
      mockVoxChronicleInstance.sessionOrchestrator = null;

      await recorder.startRecording();

      expect(recorder._lastError).toBeDefined();
      expect(recorder._uiState).toBe(RecorderUIState.ERROR);

      mockVoxChronicleInstance.sessionOrchestrator = originalOrchestrator;
    });
  });

  describe('stopRecording Method', () => {
    beforeEach(() => {
      recorder._uiState = RecorderUIState.RECORDING;
      recorder._recordingStartTime = Date.now() - 60000;
    });

    it('should stop recording successfully', async () => {
      const result = await recorder.stopRecording();

      expect(mockOrchestrator.stopSession).toHaveBeenCalled();
      expect(mockUi.notifications.info).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should pass options to orchestrator', async () => {
      await recorder.stopRecording({ processImmediately: false });

      expect(mockOrchestrator.stopSession).toHaveBeenCalledWith({ processImmediately: false });
    });

    it('should warn if not recording', async () => {
      recorder._uiState = RecorderUIState.IDLE;

      const result = await recorder.stopRecording();

      expect(result).toBeNull();
      expect(mockOrchestrator.stopSession).not.toHaveBeenCalled();
    });

    it('should allow stop when paused', async () => {
      recorder._uiState = RecorderUIState.PAUSED;

      await recorder.stopRecording();

      expect(mockOrchestrator.stopSession).toHaveBeenCalled();
    });

    it('should handle stop errors', async () => {
      mockOrchestrator.stopSession.mockRejectedValueOnce(new Error('Stop failed'));

      const result = await recorder.stopRecording();

      expect(result).toBeNull();
      expect(recorder._lastError).toBe('Stop failed');
      expect(mockUi.notifications.error).toHaveBeenCalled();
    });

    it('should throw error if orchestrator is not available', async () => {
      const originalOrchestrator = mockVoxChronicleInstance.sessionOrchestrator;
      mockVoxChronicleInstance.sessionOrchestrator = null;

      const result = await recorder.stopRecording();

      expect(result).toBeNull();
      expect(recorder._lastError).toBeDefined();

      mockVoxChronicleInstance.sessionOrchestrator = originalOrchestrator;
    });
  });

  describe('pauseRecording Method', () => {
    it('should pause recording', () => {
      recorder._uiState = RecorderUIState.RECORDING;

      recorder.pauseRecording();

      expect(mockOrchestrator.pauseRecording).toHaveBeenCalled();
    });

    it('should not pause if not recording', () => {
      recorder._uiState = RecorderUIState.IDLE;

      recorder.pauseRecording();

      expect(mockOrchestrator.pauseRecording).not.toHaveBeenCalled();
    });

    it('should handle pause errors', () => {
      recorder._uiState = RecorderUIState.RECORDING;
      mockOrchestrator.pauseRecording.mockImplementationOnce(() => {
        throw new Error('Pause failed');
      });

      expect(() => recorder.pauseRecording()).not.toThrow();
      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('resumeRecording Method', () => {
    it('should resume recording', () => {
      recorder._uiState = RecorderUIState.PAUSED;

      recorder.resumeRecording();

      expect(mockOrchestrator.resumeRecording).toHaveBeenCalled();
    });

    it('should not resume if not paused', () => {
      recorder._uiState = RecorderUIState.IDLE;

      recorder.resumeRecording();

      expect(mockOrchestrator.resumeRecording).not.toHaveBeenCalled();
    });

    it('should handle resume errors', () => {
      recorder._uiState = RecorderUIState.PAUSED;
      mockOrchestrator.resumeRecording.mockImplementationOnce(() => {
        throw new Error('Resume failed');
      });

      expect(() => recorder.resumeRecording()).not.toThrow();
      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('cancelSession Method', () => {
    it('should cancel session and reset state', () => {
      recorder._uiState = RecorderUIState.RECORDING;
      recorder._lastError = 'Some error';
      recorder._progress = { stage: 'test', progress: 50, message: 'test' };
      recorder._recordingStartTime = Date.now();
      recorder._durationInterval = setInterval(() => {}, 1000);

      recorder.cancelSession();

      expect(mockOrchestrator.cancelSession).toHaveBeenCalled();
      expect(recorder._uiState).toBe(RecorderUIState.IDLE);
      expect(recorder._lastError).toBeNull();
      expect(recorder._progress).toEqual({ stage: '', progress: 0, message: '' });
      expect(recorder._durationInterval).toBeNull();
    });

    it('should handle cancel errors gracefully', () => {
      mockOrchestrator.cancelSession.mockImplementationOnce(() => {
        throw new Error('Cancel failed');
      });

      expect(() => recorder.cancelSession()).not.toThrow();
    });
  });

  describe('getState Method', () => {
    it('should return current state information', () => {
      recorder._uiState = RecorderUIState.RECORDING;
      recorder._recordingStartTime = Date.now() - 5000;
      recorder._progress = { stage: 'test', progress: 50, message: 'test' };
      recorder._lastError = 'test error';

      const state = recorder.getState();

      expect(state.uiState).toBe(RecorderUIState.RECORDING);
      expect(state.isRecording).toBe(true);
      expect(state.isPaused).toBe(false);
      expect(state.isProcessing).toBe(false);
      expect(state.duration).toBeGreaterThan(0);
      expect(state.progress).toEqual(recorder._progress);
      expect(state.lastError).toBe('test error');
    });

    it('should return immutable progress copy', () => {
      recorder._progress = { stage: 'test', progress: 50, message: 'test' };

      const state = recorder.getState();
      state.progress.stage = 'modified';

      expect(recorder._progress.stage).toBe('test');
    });
  });

  describe('Event Listener Activation', () => {
    it('should activate event listeners on HTML', () => {
      const mockHtml = {
        find: vi.fn(() => ({
          on: vi.fn()
        }))
      };

      recorder.activateListeners(mockHtml);

      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="start-recording"]');
      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="stop-recording"]');
      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="pause-recording"]');
      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="resume-recording"]');
      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="cancel-session"]');
      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="open-settings"]');
    });
  });

  describe('Button Event Handlers', () => {
    it('should handle start recording button click', async () => {
      const event = { preventDefault: vi.fn() };
      recorder.startRecording = vi.fn();

      await recorder._onStartRecording(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(recorder.startRecording).toHaveBeenCalled();
    });

    it('should handle stop recording button click', async () => {
      const event = { preventDefault: vi.fn() };
      recorder.stopRecording = vi.fn();

      await recorder._onStopRecording(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(recorder.stopRecording).toHaveBeenCalled();
    });

    it('should handle pause recording button click', () => {
      const event = { preventDefault: vi.fn() };
      recorder.pauseRecording = vi.fn();

      recorder._onPauseRecording(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(recorder.pauseRecording).toHaveBeenCalled();
    });

    it('should handle resume recording button click', () => {
      const event = { preventDefault: vi.fn() };
      recorder.resumeRecording = vi.fn();

      recorder._onResumeRecording(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(recorder.resumeRecording).toHaveBeenCalled();
    });

    it('should handle cancel session button click', () => {
      const event = { preventDefault: vi.fn() };
      recorder.cancelSession = vi.fn();

      recorder._onCancelSession(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(recorder.cancelSession).toHaveBeenCalled();
    });

    it('should handle open settings button click', () => {
      const event = { preventDefault: vi.fn() };

      recorder._onOpenSettings(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  describe('Application Close', () => {
    it('should clean up timer on close', async () => {
      recorder._startDurationTimer();

      await recorder.close();

      expect(recorder._durationInterval).toBeNull();
    });

    it('should handle close when no timer is active', async () => {
      await expect(recorder.close()).resolves.not.toThrow();
    });
  });

  describe('Default Options', () => {
    it('should have correct default options', () => {
      const options = RecorderControls.defaultOptions;

      expect(options.id).toBe('vox-chronicle-recorder');
      expect(options.template).toContain('recorder.hbs');
      expect(options.classes).toContain('vox-chronicle');
      expect(options.width).toBe(320);
      expect(options.minimizable).toBe(true);
      expect(options.resizable).toBe(false);
    });
  });

  describe('RecorderUIState Enum', () => {
    it('should export all UI states', () => {
      expect(RecorderUIState.IDLE).toBe('idle');
      expect(RecorderUIState.RECORDING).toBe('recording');
      expect(RecorderUIState.PAUSED).toBe('paused');
      expect(RecorderUIState.PROCESSING).toBe('processing');
      expect(RecorderUIState.ERROR).toBe('error');
    });
  });
});
