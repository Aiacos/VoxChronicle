/**
 * Settings Unit Tests
 *
 * Tests for the Settings configuration class that manages all module settings
 * including API keys, campaign configuration, and user preferences.
 *
 * @module tests/core/Settings.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockSettings, createMockI18n } from '../helpers/foundry-mock.js';

// Mock the MODULE_ID before importing Settings
const MODULE_ID = 'vox-chronicle';

// Setup global mocks
let mockSettings;
let mockI18n;
let mockNotifications;
let consoleLogSpy;

// Mock main.mjs to provide MODULE_ID export and prevent Hooks initialization
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock Logger before importing Settings
// Logger mock routes all log methods to console.log for test compatibility
// Tests expect consoleLogSpy (console.log) to be called
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: (...args) => console.log(...args),
      info: (...args) => console.log(...args),
      log: (...args) => console.log(...args),
      warn: (...args) => {
        console.warn(...args);
        console.log(...args);
      },
      error: (...args) => {
        console.error(...args);
        console.log(...args);
      }
    }),
    setDebugMode: vi.fn(),
    debug: (...args) => console.log(...args),
    info: (...args) => console.log(...args),
    log: (...args) => console.log(...args),
    warn: (...args) => {
      console.warn(...args);
      console.log(...args);
    },
    error: (...args) => {
      console.error(...args);
      console.log(...args);
    }
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

beforeEach(() => {
  // Reset module cache to ensure fresh imports with mocks
  vi.resetModules();
  // Mock Foundry Hooks
  globalThis.Hooks = {
    once: vi.fn(),
    on: vi.fn(),
    call: vi.fn()
  };

  // Create mock settings
  mockSettings = createMockSettings();

  // Create mock i18n
  mockI18n = createMockI18n({
    'VOXCHRONICLE.Validation.OpenAIKeyNotConfigured': 'OpenAI API key not configured',
    'VOXCHRONICLE.Validation.KankaTokenNotConfigured': 'Kanka API token not configured',
    'VOXCHRONICLE.Validation.ValidatingOpenAI': 'Validating OpenAI API key...',
    'VOXCHRONICLE.Validation.ValidatingKanka': 'Validating Kanka API token...',
    'VOXCHRONICLE.Validation.OpenAIKeyValid': 'OpenAI API key is valid',
    'VOXCHRONICLE.Validation.OpenAIKeyInvalid': 'OpenAI API key is invalid',
    'VOXCHRONICLE.Validation.KankaTokenValid': 'Kanka API token is valid',
    'VOXCHRONICLE.Validation.KankaTokenInvalid': 'Kanka API token is invalid',
    'VOXCHRONICLE.Validation.OpenAIValidationError': 'OpenAI validation error: {error}',
    'VOXCHRONICLE.Validation.KankaValidationError': 'Kanka validation error: {error}'
  });

  // Create mock notifications
  mockNotifications = {
    info: vi.fn((_msg, _options) => {
      const notif = { remove: vi.fn() };
      return notif;
    }),
    error: vi.fn(),
    warn: vi.fn()
  };

  // Mock the global game object
  globalThis.game = {
    settings: mockSettings,
    i18n: mockI18n,
    ready: true
  };

  // Mock ui.notifications
  globalThis.ui = {
    notifications: mockNotifications
  };

  // Spy on console.log
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.game;
  delete globalThis.ui;
  delete globalThis.Hooks;
});

describe('Settings', () => {
  describe('registerSettings', () => {
    it('should register all module settings', async () => {
      // Import Settings dynamically after mocks are set up
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      Settings.registerSettings();

      // Verify settings.register was called for each setting
      expect(mockSettings.register).toHaveBeenCalled();

      // Verify specific settings were registered
      const registerCalls = mockSettings.register.mock.calls;

      // API Keys
      expect(registerCalls.some((call) => call[1] === 'openaiApiKey')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'kankaApiToken')).toBe(true);

      // Campaign Settings
      expect(registerCalls.some((call) => call[1] === 'kankaCampaignId')).toBe(true);

      // Transcription Settings
      expect(registerCalls.some((call) => call[1] === 'transcriptionLanguage')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'transcriptionMode')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'whisperBackendUrl')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'showTranscriptionModeIndicator')).toBe(true);

      // Vocabulary Dictionary
      expect(registerCalls.some((call) => call[1] === 'customVocabularyDictionary')).toBe(true);

      // Audio Settings
      expect(registerCalls.some((call) => call[1] === 'audioCaptureSource')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'echoCancellation')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'noiseSuppression')).toBe(true);

      // Image Generation Settings
      expect(registerCalls.some((call) => call[1] === 'imageQuality')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'maxImagesPerSession')).toBe(true);

      // Entity Extraction Settings
      expect(registerCalls.some((call) => call[1] === 'autoExtractEntities')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'confirmEntityCreation')).toBe(true);

      // Relationship Extraction Settings
      expect(registerCalls.some((call) => call[1] === 'autoExtractRelationships')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'relationshipConfidenceThreshold')).toBe(
        true
      );
      expect(registerCalls.some((call) => call[1] === 'maxRelationshipsPerSession')).toBe(true);

      // Speaker Labeling
      expect(registerCalls.some((call) => call[1] === 'speakerLabels')).toBe(true);

      // Session Storage
      expect(registerCalls.some((call) => call[1] === 'pendingSessions')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'knownSpeakers')).toBe(true);

      // Narrator Master Settings
      expect(registerCalls.some((call) => call[1] === 'multiLanguageMode')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'transcriptionBatchDuration')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'offTrackSensitivity')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'rulesDetection')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'rulesSource')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'debugMode')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'apiRetryEnabled')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'apiRetryMaxAttempts')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'apiRetryBaseDelay')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'apiRetryMaxDelay')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'apiQueueMaxSize')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'imageGallery')).toBe(true);
      expect(registerCalls.some((call) => call[1] === 'panelPosition')).toBe(true);

      // Verify console.log was called
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Settings registered successfully')
      );
    });

    it('should register client-scoped settings correctly', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      Settings.registerSettings();

      const registerCalls = mockSettings.register.mock.calls;

      // Find openaiApiKey registration
      const openaiKeyCall = registerCalls.find((call) => call[1] === 'openaiApiKey');
      expect(openaiKeyCall).toBeDefined();
      expect(openaiKeyCall[2].scope).toBe('client');
      expect(openaiKeyCall[2].type).toBe(String);
      expect(openaiKeyCall[2].default).toBe('');
    });

    it('should register world-scoped settings correctly', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      Settings.registerSettings();

      const registerCalls = mockSettings.register.mock.calls;

      // Find kankaApiToken registration
      const kankaTokenCall = registerCalls.find((call) => call[1] === 'kankaApiToken');
      expect(kankaTokenCall).toBeDefined();
      expect(kankaTokenCall[2].scope).toBe('world');
      expect(kankaTokenCall[2].type).toBe(String);
      expect(kankaTokenCall[2].default).toBe('');
    });

    it('should register settings with choices correctly', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      Settings.registerSettings();

      const registerCalls = mockSettings.register.mock.calls;

      // Find transcriptionLanguage registration
      const languageCall = registerCalls.find((call) => call[1] === 'transcriptionLanguage');
      expect(languageCall).toBeDefined();
      expect(languageCall[2].choices).toBeDefined();
      expect(languageCall[2].choices).toHaveProperty('en');
      expect(languageCall[2].choices).toHaveProperty('it');
    });

    it('should register settings with range correctly', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      Settings.registerSettings();

      const registerCalls = mockSettings.register.mock.calls;

      // Find maxImagesPerSession registration
      const maxImagesCall = registerCalls.find((call) => call[1] === 'maxImagesPerSession');
      expect(maxImagesCall).toBeDefined();
      expect(maxImagesCall[2].type).toBe(Number);
      expect(maxImagesCall[2].range).toBeDefined();
      expect(maxImagesCall[2].range.min).toBe(0);
      expect(maxImagesCall[2].range.max).toBe(10);
      expect(maxImagesCall[2].range.step).toBe(1);
    });

    it('should register settings with onChange handlers', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      Settings.registerSettings();

      const registerCalls = mockSettings.register.mock.calls;

      // Find openaiApiKey registration
      const openaiKeyCall = registerCalls.find((call) => call[1] === 'openaiApiKey');
      expect(openaiKeyCall).toBeDefined();
      expect(openaiKeyCall[2].onChange).toBeDefined();
      expect(typeof openaiKeyCall[2].onChange).toBe('function');
    });
  });

  describe('get', () => {
    it('should retrieve a setting value', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      // Set up a test value
      mockSettings.get.mockReturnValue('test-api-key');

      const value = Settings.get('openaiApiKey');

      expect(mockSettings.get).toHaveBeenCalledWith(MODULE_ID, 'openaiApiKey');
      expect(value).toBe('test-api-key');
    });
  });

  describe('set', () => {
    it('should set a setting value', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      await Settings.set('openaiApiKey', 'new-api-key');

      expect(mockSettings.set).toHaveBeenCalledWith(MODULE_ID, 'openaiApiKey', 'new-api-key');
    });
  });

  describe('isOpenAIConfigured', () => {
    it('should return true when API key is set', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        return '';
      });

      const result = Settings.isOpenAIConfigured();

      expect(result).toBe(true);
    });

    it('should return false when API key is empty', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return '';
        return '';
      });

      const result = Settings.isOpenAIConfigured();

      expect(result).toBeFalsy();
    });

    it('should return false when API key is only whitespace', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return '   ';
        return '';
      });

      const result = Settings.isOpenAIConfigured();

      expect(result).toBeFalsy();
    });

    it('should return false when API key is null', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return null;
        return '';
      });

      const result = Settings.isOpenAIConfigured();

      expect(result).toBeFalsy();
    });
  });

  describe('isKankaConfigured', () => {
    it('should return true when token and campaign ID are set', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '12345';
        return '';
      });

      const result = Settings.isKankaConfigured();

      expect(result).toBe(true);
    });

    it('should return false when token is missing', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'kankaApiToken') return '';
        if (key === 'kankaCampaignId') return '12345';
        return undefined;
      });

      const result = Settings.isKankaConfigured();

      expect(result).toBeFalsy();
    });

    it('should return false when campaign ID is missing', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '';
        return undefined;
      });

      const result = Settings.isKankaConfigured();

      expect(result).toBeFalsy();
    });

    it('should return false when both are missing', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((_module, _key) => {
        return '';
      });

      const result = Settings.isKankaConfigured();

      expect(result).toBeFalsy();
    });
  });

  describe('getConfigurationStatus', () => {
    it('should return all ready when both APIs are configured', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '12345';
        return '';
      });

      const status = Settings.getConfigurationStatus();

      expect(status).toEqual({
        openai: true,
        kanka: true,
        ready: true
      });
    });

    it('should return not ready when OpenAI is missing', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return '';
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '12345';
        return undefined;
      });

      const status = Settings.getConfigurationStatus();

      expect(status.openai).toBeFalsy();
      expect(status.kanka).toBeTruthy();
      expect(status.ready).toBeFalsy();
    });

    it('should return not ready when Kanka is missing', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        if (key === 'kankaApiToken') return '';
        if (key === 'kankaCampaignId') return '12345';
        return undefined;
      });

      const status = Settings.getConfigurationStatus();

      expect(status.openai).toBeTruthy();
      expect(status.kanka).toBeFalsy();
      expect(status.ready).toBeFalsy();
    });
  });

  describe('getSpeakerLabels', () => {
    it('should return speaker labels object', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      const labels = { SPEAKER_00: 'Alice', SPEAKER_01: 'Bob' };
      mockSettings.get.mockReturnValue(labels);

      const result = Settings.getSpeakerLabels();

      expect(result).toEqual(labels);
    });

    it('should return empty object when labels are null', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockReturnValue(null);

      const result = Settings.getSpeakerLabels();

      expect(result).toEqual({});
    });

    it('should return empty object on error', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation(() => {
        throw new Error('Settings error');
      });

      const result = Settings.getSpeakerLabels();

      expect(result).toEqual({});
    });
  });

  describe('setSpeakerLabels', () => {
    it('should update speaker labels', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      const labels = { SPEAKER_00: 'Alice', SPEAKER_01: 'Bob' };

      await Settings.setSpeakerLabels(labels);

      expect(mockSettings.set).toHaveBeenCalledWith(MODULE_ID, 'speakerLabels', labels);
    });
  });

  describe('getTranscriptionLanguage', () => {
    it('should return language code when set', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockReturnValue('en');

      const result = Settings.getTranscriptionLanguage();

      expect(result).toBe('en');
    });

    it('should return null when language is empty (auto-detect)', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockReturnValue('');

      const result = Settings.getTranscriptionLanguage();

      expect(result).toBeNull();
    });

    it('should return null when language is whitespace', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockReturnValue('   ');

      const result = Settings.getTranscriptionLanguage();

      expect(result).toBeNull();
    });
  });

  describe('getAudioSettings', () => {
    it('should return audio configuration object', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'audioCaptureSource') return 'microphone';
        if (key === 'echoCancellation') return true;
        if (key === 'noiseSuppression') return false;
        return '';
      });

      const result = Settings.getAudioSettings();

      expect(result).toEqual({
        source: 'microphone',
        echoCancellation: true,
        noiseSuppression: false
      });
    });
  });

  describe('getImageSettings', () => {
    it('should return image generation configuration object', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'imageQuality') return 'hd';
        if (key === 'maxImagesPerSession') return 5;
        return '';
      });

      const result = Settings.getImageSettings();

      expect(result).toEqual({
        quality: 'hd',
        maxPerSession: 5
      });
    });
  });

  describe('getEntitySettings', () => {
    it('should return entity extraction configuration object', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'autoExtractEntities') return true;
        if (key === 'confirmEntityCreation') return false;
        return '';
      });

      const result = Settings.getEntitySettings();

      expect(result).toEqual({
        autoExtract: true,
        confirmCreation: false
      });
    });
  });

  describe('getRelationshipSettings', () => {
    it('should return relationship extraction configuration object', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'autoExtractRelationships') return true;
        if (key === 'relationshipConfidenceThreshold') return 7;
        if (key === 'maxRelationshipsPerSession') return 15;
        return '';
      });

      const result = Settings.getRelationshipSettings();

      expect(result).toEqual({
        autoExtract: true,
        confidenceThreshold: 7,
        maxPerSession: 15
      });
    });
  });

  describe('_onApiKeyChange', () => {
    it('should show notification for OpenAI key change', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      Settings._onApiKeyChange('openai');

      expect(mockNotifications.info).toHaveBeenCalledWith(expect.stringContaining('OpenAI'));
    });

    it('should show notification for Kanka key change', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      Settings._onApiKeyChange('kanka');

      expect(mockNotifications.info).toHaveBeenCalledWith(expect.stringContaining('Kanka'));
    });

    it('should not show notification when game is not ready', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      globalThis.game.ready = false;

      Settings._onApiKeyChange('openai');

      expect(mockNotifications.info).not.toHaveBeenCalled();
    });
  });

  describe('validateOpenAIKey', () => {
    it('should return false when API key is not configured', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return '';
        return undefined;
      });

      const result = await Settings.validateOpenAIKey();

      expect(result).toBe(false);
      expect(mockNotifications.error).toHaveBeenCalledWith('OpenAI API key not configured');
    });

    it('should handle validation errors gracefully', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockReturnValue('sk-test-key');

      // Mock dynamic import to throw error
      vi.doMock('../../scripts/core/VoxChronicle.mjs', () => {
        throw new Error('Import failed');
      });

      const result = await Settings.validateOpenAIKey();

      expect(result).toBe(false);
      expect(mockNotifications.error).toHaveBeenCalled();
    });
  });

  describe('validateKankaToken', () => {
    it('should return false when API token is not configured', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((_module, _key) => {
        return '';
      });

      const result = await Settings.validateKankaToken();

      expect(result).toBe(false);
      expect(mockNotifications.error).toHaveBeenCalledWith('Kanka API token not configured');
    });

    it('should handle validation errors gracefully', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');

      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '12345';
        return '';
      });

      // Mock dynamic import to throw error
      vi.doMock('../../scripts/core/VoxChronicle.mjs', () => {
        throw new Error('Import failed');
      });

      const result = await Settings.validateKankaToken();

      expect(result).toBe(false);
      expect(mockNotifications.error).toHaveBeenCalled();
    });
  });

  describe('getNarratorSettings', () => {
    it('should return narrator configuration object', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      mockSettings.get.mockImplementation((module, key) => {
        const values = {
          multiLanguageMode: true,
          transcriptionBatchDuration: 15000,
          offTrackSensitivity: 'high',
          rulesDetection: false,
          rulesSource: 'dnd5e',
          debugMode: true
        };
        return values[key] ?? '';
      });
      const result = Settings.getNarratorSettings();
      expect(result).toEqual({
        multiLanguageMode: true,
        transcriptionBatchDuration: 15000,
        offTrackSensitivity: 'high',
        rulesDetection: false,
        rulesSource: 'dnd5e',
        debugMode: true
      });
    });
  });

  describe('getRetrySettings', () => {
    it('should return retry configuration object', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      mockSettings.get.mockImplementation((module, key) => {
        const values = {
          apiRetryEnabled: true,
          apiRetryMaxAttempts: 5,
          apiRetryBaseDelay: 2000,
          apiRetryMaxDelay: 30000,
          apiQueueMaxSize: 50
        };
        return values[key] ?? '';
      });
      const result = Settings.getRetrySettings();
      expect(result).toEqual({
        enabled: true,
        maxAttempts: 5,
        baseDelay: 2000,
        maxDelay: 30000,
        queueMaxSize: 50
      });
    });
  });

  describe('isNarratorConfigured', () => {
    it('should return true when OpenAI is configured', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      mockSettings.get.mockImplementation((module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        return '';
      });
      expect(Settings.isNarratorConfigured()).toBe(true);
    });

    it('should return false when OpenAI is not configured', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      mockSettings.get.mockReturnValue('');
      expect(Settings.isNarratorConfigured()).toBeFalsy();
    });
  });

  describe('Narrator Master settings registration', () => {
    it('should register offTrackSensitivity with choices', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      Settings.registerSettings();
      const registerCalls = mockSettings.register.mock.calls;
      const call = registerCalls.find((c) => c[1] === 'offTrackSensitivity');
      expect(call).toBeDefined();
      expect(call[2].choices).toBeDefined();
      expect(call[2].choices).toHaveProperty('low');
      expect(call[2].choices).toHaveProperty('medium');
      expect(call[2].choices).toHaveProperty('high');
      expect(call[2].default).toBe('medium');
    });

    it('should register transcriptionBatchDuration with range', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      Settings.registerSettings();
      const registerCalls = mockSettings.register.mock.calls;
      const call = registerCalls.find((c) => c[1] === 'transcriptionBatchDuration');
      expect(call).toBeDefined();
      expect(call[2].range).toBeDefined();
      expect(call[2].range.min).toBe(5000);
      expect(call[2].range.max).toBe(30000);
      expect(call[2].range.step).toBe(1000);
      expect(call[2].default).toBe(10000);
    });

    it('should register debugMode with onChange handler', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      Settings.registerSettings();
      const registerCalls = mockSettings.register.mock.calls;
      const call = registerCalls.find((c) => c[1] === 'debugMode');
      expect(call).toBeDefined();
      expect(typeof call[2].onChange).toBe('function');
    });

    it('should register imageGallery as hidden', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      Settings.registerSettings();
      const registerCalls = mockSettings.register.mock.calls;
      const call = registerCalls.find((c) => c[1] === 'imageGallery');
      expect(call).toBeDefined();
      expect(call[2].config).toBe(false);
      expect(call[2].type).toBe(Object);
    });

    it('should register panelPosition as client-scoped', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      Settings.registerSettings();
      const registerCalls = mockSettings.register.mock.calls;
      const call = registerCalls.find((c) => c[1] === 'panelPosition');
      expect(call).toBeDefined();
      expect(call[2].scope).toBe('client');
      expect(call[2].config).toBe(false);
    });

    it('should register apiRetry settings with correct ranges', async () => {
      const { Settings } = await import('../../scripts/core/Settings.mjs');
      Settings.registerSettings();
      const registerCalls = mockSettings.register.mock.calls;

      const maxAttempts = registerCalls.find((c) => c[1] === 'apiRetryMaxAttempts');
      expect(maxAttempts[2].range.min).toBe(0);
      expect(maxAttempts[2].range.max).toBe(10);
      expect(maxAttempts[2].default).toBe(3);

      const baseDelay = registerCalls.find((c) => c[1] === 'apiRetryBaseDelay');
      expect(baseDelay[2].range.min).toBe(500);
      expect(baseDelay[2].default).toBe(1000);

      const maxDelay = registerCalls.find((c) => c[1] === 'apiRetryMaxDelay');
      expect(maxDelay[2].range.max).toBe(120000);
      expect(maxDelay[2].default).toBe(60000);
    });
  });
});
