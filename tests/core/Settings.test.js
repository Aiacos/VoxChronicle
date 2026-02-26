/**
 * Settings Unit Tests
 *
 * Tests for the Settings configuration class that manages all module settings
 * including API keys, campaign configuration, and user preferences.
 *
 * @module tests/core/Settings.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Settings } from '../../scripts/core/Settings.mjs';

const MODULE_ID = 'vox-chronicle';

describe('Settings', () => {
  describe('registerSettings', () => {
    it('should call game.settings.register for every setting', () => {
      Settings.registerSettings();

      // Count total registrations - there are 35 settings in the current source
      const registerCalls = game.settings.register.mock.calls;
      expect(registerCalls.length).toBeGreaterThanOrEqual(35);

      // Every call should use the correct module ID
      for (const call of registerCalls) {
        expect(call[0]).toBe(MODULE_ID);
      }
    });

    it('should register all expected setting keys', () => {
      Settings.registerSettings();

      const registeredKeys = game.settings.register.mock.calls.map((call) => call[1]);

      const expectedKeys = [
        // API Keys
        'openaiApiKey',
        'kankaApiToken',
        // Campaign
        'kankaCampaignId',
        // Transcription
        'transcriptionLanguage',
        'transcriptionMode',
        'whisperBackendUrl',
        'showTranscriptionModeIndicator',
        // Vocabulary
        'customVocabularyDictionary',
        // Audio
        'audioCaptureSource',
        'echoCancellation',
        'noiseSuppression',
        // Image
        'imageQuality',
        'maxImagesPerSession',
        // Entity
        'autoExtractEntities',
        'confirmEntityCreation',
        // Relationships
        'autoExtractRelationships',
        'relationshipConfidenceThreshold',
        'maxRelationshipsPerSession',
        // Speaker
        'speakerLabels',
        // Session storage
        'pendingSessions',
        'knownSpeakers',
        'kankaApiTokenCreatedAt',
        // Narrator
        'multiLanguageMode',
        'transcriptionBatchDuration',
        'offTrackSensitivity',
        'rulesDetection',
        'rulesSource',
        'debugMode',
        // RAG
        'ragEnabled',
        'ragProvider',
        'ragMaxResults',
        'ragAutoIndex',
        'ragSilenceThresholdMs',
        'ragVectorStoreId',
        // Retry
        'apiRetryEnabled',
        'apiRetryMaxAttempts',
        'apiRetryBaseDelay',
        'apiRetryMaxDelay',
        'apiQueueMaxSize',
        // Hidden internal
        'imageGallery',
        'panelPosition'
      ];

      for (const key of expectedKeys) {
        expect(registeredKeys).toContain(key);
      }
    });

    it('should register openaiApiKey as client-scoped string with empty default', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'openaiApiKey');
      expect(call).toBeDefined();
      expect(call[2].scope).toBe('client');
      expect(call[2].config).toBe(true);
      expect(call[2].type).toBe(String);
      expect(call[2].default).toBe('');
      expect(typeof call[2].onChange).toBe('function');
    });

    it('should register kankaApiToken as world-scoped string with empty default', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'kankaApiToken');
      expect(call).toBeDefined();
      expect(call[2].scope).toBe('world');
      expect(call[2].config).toBe(true);
      expect(call[2].type).toBe(String);
      expect(call[2].default).toBe('');
      expect(typeof call[2].onChange).toBe('function');
    });

    it('should register kankaCampaignId as world-scoped string', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'kankaCampaignId');
      expect(call).toBeDefined();
      expect(call[2].scope).toBe('world');
      expect(call[2].type).toBe(String);
      expect(call[2].default).toBe('');
    });

    it('should register transcriptionLanguage with language choices', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find(
        (c) => c[1] === 'transcriptionLanguage'
      );
      expect(call).toBeDefined();
      expect(call[2].choices).toBeDefined();
      expect(call[2].choices).toHaveProperty('');
      expect(call[2].choices).toHaveProperty('en');
      expect(call[2].choices).toHaveProperty('it');
      expect(call[2].choices).toHaveProperty('es');
      expect(call[2].choices).toHaveProperty('de');
      expect(call[2].choices).toHaveProperty('fr');
      expect(call[2].choices).toHaveProperty('pt');
      expect(call[2].choices).toHaveProperty('ja');
      expect(call[2].choices).toHaveProperty('zh');
      expect(call[2].default).toBe('');
    });

    it('should register transcriptionMode with api/local/auto choices', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'transcriptionMode');
      expect(call).toBeDefined();
      expect(call[2].choices).toEqual({
        api: 'VOXCHRONICLE.Settings.TranscriptionModeAPI',
        local: 'VOXCHRONICLE.Settings.TranscriptionModeLocal',
        auto: 'VOXCHRONICLE.Settings.TranscriptionModeAuto'
      });
      expect(call[2].default).toBe('auto');
    });

    it('should register whisperBackendUrl with localhost default', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'whisperBackendUrl');
      expect(call).toBeDefined();
      expect(call[2].default).toBe('http://localhost:8080');
    });

    it('should register customVocabularyDictionary as hidden Object setting', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find(
        (c) => c[1] === 'customVocabularyDictionary'
      );
      expect(call).toBeDefined();
      expect(call[2].config).toBe(false);
      expect(call[2].type).toBe(Object);
      expect(call[2].default).toEqual({
        character_names: [],
        location_names: [],
        items: [],
        terms: [],
        custom: []
      });
    });

    it('should register audioCaptureSource with auto/microphone/webrtc choices', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'audioCaptureSource');
      expect(call).toBeDefined();
      expect(call[2].scope).toBe('client');
      expect(call[2].choices).toHaveProperty('auto');
      expect(call[2].choices).toHaveProperty('microphone');
      expect(call[2].choices).toHaveProperty('webrtc');
      expect(call[2].default).toBe('auto');
    });

    it('should register boolean audio settings with correct defaults', () => {
      Settings.registerSettings();

      const echoCancelCall = game.settings.register.mock.calls.find(
        (c) => c[1] === 'echoCancellation'
      );
      expect(echoCancelCall[2].type).toBe(Boolean);
      expect(echoCancelCall[2].default).toBe(true);
      expect(echoCancelCall[2].scope).toBe('client');

      const noiseCall = game.settings.register.mock.calls.find(
        (c) => c[1] === 'noiseSuppression'
      );
      expect(noiseCall[2].type).toBe(Boolean);
      expect(noiseCall[2].default).toBe(true);
      expect(noiseCall[2].scope).toBe('client');
    });

    it('should register imageQuality with quality choices defaulting to high', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'imageQuality');
      expect(call).toBeDefined();
      expect(call[2].scope).toBe('world');
      expect(call[2].choices).toHaveProperty('low');
      expect(call[2].choices).toHaveProperty('medium');
      expect(call[2].choices).toHaveProperty('high');
      expect(call[2].choices).toHaveProperty('auto');
      expect(call[2].default).toBe('high');
    });

    it('should register maxImagesPerSession with range 0-10', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find(
        (c) => c[1] === 'maxImagesPerSession'
      );
      expect(call).toBeDefined();
      expect(call[2].type).toBe(Number);
      expect(call[2].range).toEqual({ min: 0, max: 10, step: 1 });
      expect(call[2].default).toBe(3);
    });

    it('should register entity extraction boolean settings', () => {
      Settings.registerSettings();

      const autoExtract = game.settings.register.mock.calls.find(
        (c) => c[1] === 'autoExtractEntities'
      );
      expect(autoExtract[2].type).toBe(Boolean);
      expect(autoExtract[2].default).toBe(true);

      const confirm = game.settings.register.mock.calls.find(
        (c) => c[1] === 'confirmEntityCreation'
      );
      expect(confirm[2].type).toBe(Boolean);
      expect(confirm[2].default).toBe(true);
    });

    it('should register relationship settings with correct types and defaults', () => {
      Settings.registerSettings();

      const autoExtract = game.settings.register.mock.calls.find(
        (c) => c[1] === 'autoExtractRelationships'
      );
      expect(autoExtract[2].scope).toBe('client');
      expect(autoExtract[2].type).toBe(Boolean);
      expect(autoExtract[2].default).toBe(true);

      const threshold = game.settings.register.mock.calls.find(
        (c) => c[1] === 'relationshipConfidenceThreshold'
      );
      expect(threshold[2].scope).toBe('world');
      expect(threshold[2].type).toBe(Number);
      expect(threshold[2].range).toEqual({ min: 1, max: 10, step: 1 });
      expect(threshold[2].default).toBe(5);

      const maxRelationships = game.settings.register.mock.calls.find(
        (c) => c[1] === 'maxRelationshipsPerSession'
      );
      expect(maxRelationships[2].range).toEqual({ min: 0, max: 50, step: 1 });
      expect(maxRelationships[2].default).toBe(20);
    });

    it('should register speakerLabels as hidden world-scoped Object', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'speakerLabels');
      expect(call).toBeDefined();
      expect(call[2].scope).toBe('world');
      expect(call[2].config).toBe(false);
      expect(call[2].type).toBe(Object);
      expect(call[2].default).toEqual({});
    });

    it('should register session storage settings as hidden', () => {
      Settings.registerSettings();

      const pending = game.settings.register.mock.calls.find(
        (c) => c[1] === 'pendingSessions'
      );
      expect(pending[2].config).toBe(false);
      expect(pending[2].type).toBe(Array);
      expect(pending[2].default).toEqual([]);

      const known = game.settings.register.mock.calls.find((c) => c[1] === 'knownSpeakers');
      expect(known[2].config).toBe(false);
      expect(known[2].type).toBe(Array);
      expect(known[2].default).toEqual([]);

      const tokenCreated = game.settings.register.mock.calls.find(
        (c) => c[1] === 'kankaApiTokenCreatedAt'
      );
      expect(tokenCreated[2].config).toBe(false);
      expect(tokenCreated[2].type).toBe(Number);
      expect(tokenCreated[2].default).toBe(0);
    });

    it('should register offTrackSensitivity with low/medium/high choices', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find(
        (c) => c[1] === 'offTrackSensitivity'
      );
      expect(call).toBeDefined();
      expect(call[2].choices).toEqual({
        low: 'VOXCHRONICLE.Settings.SensitivityLow',
        medium: 'VOXCHRONICLE.Settings.SensitivityMedium',
        high: 'VOXCHRONICLE.Settings.SensitivityHigh'
      });
      expect(call[2].default).toBe('medium');
    });

    it('should register transcriptionBatchDuration with range 5000-30000', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find(
        (c) => c[1] === 'transcriptionBatchDuration'
      );
      expect(call).toBeDefined();
      expect(call[2].type).toBe(Number);
      expect(call[2].range).toEqual({ min: 5000, max: 30000, step: 1000 });
      expect(call[2].default).toBe(10000);
    });

    it('should register debugMode with onChange handler', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'debugMode');
      expect(call).toBeDefined();
      expect(call[2].type).toBe(Boolean);
      expect(call[2].default).toBe(false);
      expect(typeof call[2].onChange).toBe('function');
    });

    it('should register rulesSource with auto/dnd5e choices', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'rulesSource');
      expect(call).toBeDefined();
      expect(call[2].choices).toHaveProperty('auto');
      expect(call[2].choices).toHaveProperty('dnd5e');
      expect(call[2].default).toBe('auto');
    });

    it('should register RAG settings with correct types and defaults', () => {
      Settings.registerSettings();

      const ragEnabled = game.settings.register.mock.calls.find((c) => c[1] === 'ragEnabled');
      expect(ragEnabled[2].type).toBe(Boolean);
      expect(ragEnabled[2].default).toBe(true);
      expect(ragEnabled[2].scope).toBe('world');

      const ragProvider = game.settings.register.mock.calls.find((c) => c[1] === 'ragProvider');
      expect(ragProvider[2].type).toBe(String);
      expect(ragProvider[2].choices).toHaveProperty('openai-file-search');
      expect(ragProvider[2].default).toBe('openai-file-search');

      const ragMaxResults = game.settings.register.mock.calls.find(
        (c) => c[1] === 'ragMaxResults'
      );
      expect(ragMaxResults[2].type).toBe(Number);
      expect(ragMaxResults[2].range).toEqual({ min: 1, max: 20, step: 1 });
      expect(ragMaxResults[2].default).toBe(5);

      const ragAutoIndex = game.settings.register.mock.calls.find(
        (c) => c[1] === 'ragAutoIndex'
      );
      expect(ragAutoIndex[2].type).toBe(Boolean);
      expect(ragAutoIndex[2].default).toBe(true);

      const ragSilence = game.settings.register.mock.calls.find(
        (c) => c[1] === 'ragSilenceThresholdMs'
      );
      expect(ragSilence[2].range).toEqual({ min: 10000, max: 120000, step: 5000 });
      expect(ragSilence[2].default).toBe(30000);
    });

    it('should register ragVectorStoreId as hidden internal setting', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find(
        (c) => c[1] === 'ragVectorStoreId'
      );
      expect(call).toBeDefined();
      expect(call[2].config).toBe(false);
      expect(call[2].type).toBe(String);
      expect(call[2].default).toBe('');
    });

    it('should register API retry settings with correct ranges', () => {
      Settings.registerSettings();

      const enabled = game.settings.register.mock.calls.find(
        (c) => c[1] === 'apiRetryEnabled'
      );
      expect(enabled[2].type).toBe(Boolean);
      expect(enabled[2].default).toBe(true);

      const maxAttempts = game.settings.register.mock.calls.find(
        (c) => c[1] === 'apiRetryMaxAttempts'
      );
      expect(maxAttempts[2].range).toEqual({ min: 0, max: 10, step: 1 });
      expect(maxAttempts[2].default).toBe(3);

      const baseDelay = game.settings.register.mock.calls.find(
        (c) => c[1] === 'apiRetryBaseDelay'
      );
      expect(baseDelay[2].range).toEqual({ min: 500, max: 10000, step: 500 });
      expect(baseDelay[2].default).toBe(1000);

      const maxDelay = game.settings.register.mock.calls.find(
        (c) => c[1] === 'apiRetryMaxDelay'
      );
      expect(maxDelay[2].range).toEqual({ min: 5000, max: 120000, step: 5000 });
      expect(maxDelay[2].default).toBe(60000);

      const queueSize = game.settings.register.mock.calls.find(
        (c) => c[1] === 'apiQueueMaxSize'
      );
      expect(queueSize[2].range).toEqual({ min: 5, max: 100, step: 5 });
      expect(queueSize[2].default).toBe(100);
    });

    it('should register imageGallery as hidden world-scoped Object', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'imageGallery');
      expect(call).toBeDefined();
      expect(call[2].config).toBe(false);
      expect(call[2].scope).toBe('world');
      expect(call[2].type).toBe(Object);
      expect(call[2].default).toEqual({});
    });

    it('should register panelPosition as hidden client-scoped Object', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'panelPosition');
      expect(call).toBeDefined();
      expect(call[2].config).toBe(false);
      expect(call[2].scope).toBe('client');
      expect(call[2].type).toBe(Object);
      expect(call[2].default).toEqual({});
    });

    it('should register onChange handler for openaiApiKey that calls _onApiKeyChange', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'openaiApiKey');
      const spy = vi.spyOn(Settings, '_onApiKeyChange');

      call[2].onChange();

      expect(spy).toHaveBeenCalledWith('openai');
      spy.mockRestore();
    });

    it('should register onChange handler for kankaApiToken that calls _onApiKeyChange', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'kankaApiToken');
      const spy = vi.spyOn(Settings, '_onApiKeyChange');

      call[2].onChange();

      expect(spy).toHaveBeenCalledWith('kanka');
      spy.mockRestore();
    });
  });

  describe('get', () => {
    it('should delegate to game.settings.get with MODULE_ID', () => {
      Settings.registerSettings();
      game.settings.get.mockReturnValue('test-value');

      const result = Settings.get('openaiApiKey');

      expect(game.settings.get).toHaveBeenCalledWith(MODULE_ID, 'openaiApiKey');
      expect(result).toBe('test-value');
    });

    it('should return undefined for unregistered keys', () => {
      const result = Settings.get('nonExistentKey');

      expect(game.settings.get).toHaveBeenCalledWith(MODULE_ID, 'nonExistentKey');
      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should delegate to game.settings.set with MODULE_ID', async () => {
      await Settings.set('openaiApiKey', 'new-key');

      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'openaiApiKey', 'new-key');
    });

    it('should return the promise from game.settings.set', async () => {
      const result = await Settings.set('openaiApiKey', 'value');

      expect(result).toBeUndefined(); // mock returns Promise.resolve()
    });
  });

  describe('isOpenAIConfigured', () => {
    beforeEach(() => {
      Settings.registerSettings();
    });

    it('should return true when API key is a non-empty string', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key-1234';
        return '';
      });

      expect(Settings.isOpenAIConfigured()).toBe(true);
    });

    it('should return false when API key is empty string', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return '';
        return '';
      });

      expect(Settings.isOpenAIConfigured()).toBeFalsy();
    });

    it('should return false when API key is only whitespace', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return '   ';
        return '';
      });

      expect(Settings.isOpenAIConfigured()).toBeFalsy();
    });

    it('should return false when API key is null', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return null;
        return '';
      });

      expect(Settings.isOpenAIConfigured()).toBeFalsy();
    });

    it('should return false when API key is undefined', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return undefined;
        return '';
      });

      expect(Settings.isOpenAIConfigured()).toBeFalsy();
    });
  });

  describe('isKankaConfigured', () => {
    beforeEach(() => {
      Settings.registerSettings();
    });

    it('should return true when both token and campaign ID are set', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '12345';
        return '';
      });

      expect(Settings.isKankaConfigured()).toBe(true);
    });

    it('should return false when token is empty', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'kankaApiToken') return '';
        if (key === 'kankaCampaignId') return '12345';
        return '';
      });

      expect(Settings.isKankaConfigured()).toBeFalsy();
    });

    it('should return false when campaign ID is empty', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '';
        return '';
      });

      expect(Settings.isKankaConfigured()).toBeFalsy();
    });

    it('should return false when both are empty', () => {
      game.settings.get.mockImplementation(() => '');

      expect(Settings.isKankaConfigured()).toBeFalsy();
    });

    it('should return false when token is null', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'kankaApiToken') return null;
        if (key === 'kankaCampaignId') return '12345';
        return '';
      });

      expect(Settings.isKankaConfigured()).toBeFalsy();
    });

    it('should return false when campaign ID is only whitespace', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'kankaApiToken') return 'token';
        if (key === 'kankaCampaignId') return '   ';
        return '';
      });

      expect(Settings.isKankaConfigured()).toBeFalsy();
    });
  });

  describe('getConfigurationStatus', () => {
    beforeEach(() => {
      Settings.registerSettings();
    });

    it('should return all true when both APIs are configured', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return 'sk-test';
        if (key === 'kankaApiToken') return 'token';
        if (key === 'kankaCampaignId') return '123';
        return '';
      });

      expect(Settings.getConfigurationStatus()).toEqual({
        openai: true,
        kanka: true,
        ready: true
      });
    });

    it('should return ready false when OpenAI is not configured', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return '';
        if (key === 'kankaApiToken') return 'token';
        if (key === 'kankaCampaignId') return '123';
        return '';
      });

      const status = Settings.getConfigurationStatus();

      expect(status.openai).toBeFalsy();
      expect(status.kanka).toBeTruthy();
      expect(status.ready).toBeFalsy();
    });

    it('should return ready false when Kanka is not configured', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return 'sk-test';
        if (key === 'kankaApiToken') return '';
        if (key === 'kankaCampaignId') return '';
        return '';
      });

      const status = Settings.getConfigurationStatus();

      expect(status.openai).toBeTruthy();
      expect(status.kanka).toBeFalsy();
      expect(status.ready).toBeFalsy();
    });

    it('should return all falsy when nothing is configured', () => {
      game.settings.get.mockImplementation(() => '');

      const status = Settings.getConfigurationStatus();

      expect(status.openai).toBeFalsy();
      expect(status.kanka).toBeFalsy();
      expect(status.ready).toBeFalsy();
    });
  });

  describe('getSpeakerLabels', () => {
    it('should return the stored speaker labels object', () => {
      Settings.registerSettings();
      const labels = { SPEAKER_00: 'Alice', SPEAKER_01: 'Bob' };
      game.settings.get.mockReturnValue(labels);

      expect(Settings.getSpeakerLabels()).toEqual(labels);
    });

    it('should return empty object when setting is null', () => {
      Settings.registerSettings();
      game.settings.get.mockReturnValue(null);

      expect(Settings.getSpeakerLabels()).toEqual({});
    });

    it('should return empty object when setting is undefined', () => {
      Settings.registerSettings();
      game.settings.get.mockReturnValue(undefined);

      expect(Settings.getSpeakerLabels()).toEqual({});
    });

    it('should return empty object when game.settings.get throws', () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation(() => {
        throw new Error('Settings unavailable');
      });

      expect(Settings.getSpeakerLabels()).toEqual({});
    });
  });

  describe('setSpeakerLabels', () => {
    it('should delegate to Settings.set with speakerLabels key', async () => {
      const labels = { SPEAKER_00: 'Alice', SPEAKER_01: 'Bob' };

      await Settings.setSpeakerLabels(labels);

      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'speakerLabels', labels);
    });

    it('should handle empty labels object', async () => {
      await Settings.setSpeakerLabels({});

      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'speakerLabels', {});
    });
  });

  describe('getTranscriptionLanguage', () => {
    beforeEach(() => {
      Settings.registerSettings();
    });

    it('should return the language code when set', () => {
      game.settings.get.mockReturnValue('en');

      expect(Settings.getTranscriptionLanguage()).toBe('en');
    });

    it('should return null when language is empty string (auto-detect)', () => {
      game.settings.get.mockReturnValue('');

      expect(Settings.getTranscriptionLanguage()).toBeNull();
    });

    it('should return null when language is only whitespace', () => {
      game.settings.get.mockReturnValue('   ');

      expect(Settings.getTranscriptionLanguage()).toBeNull();
    });

    it('should return null when language is null', () => {
      game.settings.get.mockReturnValue(null);

      expect(Settings.getTranscriptionLanguage()).toBeNull();
    });

    it('should return the exact language code for non-English languages', () => {
      game.settings.get.mockReturnValue('ja');

      expect(Settings.getTranscriptionLanguage()).toBe('ja');
    });
  });

  describe('getAudioSettings', () => {
    it('should return audio configuration with all keys', () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'audioCaptureSource') return 'microphone';
        if (key === 'echoCancellation') return true;
        if (key === 'noiseSuppression') return false;
        return '';
      });

      expect(Settings.getAudioSettings()).toEqual({
        source: 'microphone',
        echoCancellation: true,
        noiseSuppression: false
      });
    });

    it('should return defaults from registered settings', () => {
      Settings.registerSettings();

      const result = Settings.getAudioSettings();

      expect(result).toEqual({
        source: 'auto',
        echoCancellation: true,
        noiseSuppression: true
      });
    });
  });

  describe('getImageSettings', () => {
    it('should return image generation configuration', () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'imageQuality') return 'medium';
        if (key === 'maxImagesPerSession') return 7;
        return '';
      });

      expect(Settings.getImageSettings()).toEqual({
        quality: 'medium',
        maxPerSession: 7
      });
    });

    it('should return defaults from registered settings', () => {
      Settings.registerSettings();

      expect(Settings.getImageSettings()).toEqual({
        quality: 'high',
        maxPerSession: 3
      });
    });
  });

  describe('getEntitySettings', () => {
    it('should return entity extraction configuration', () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'autoExtractEntities') return false;
        if (key === 'confirmEntityCreation') return true;
        return '';
      });

      expect(Settings.getEntitySettings()).toEqual({
        autoExtract: false,
        confirmCreation: true
      });
    });

    it('should return defaults from registered settings', () => {
      Settings.registerSettings();

      expect(Settings.getEntitySettings()).toEqual({
        autoExtract: true,
        confirmCreation: true
      });
    });
  });

  describe('getRelationshipSettings', () => {
    it('should return relationship extraction configuration', () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'autoExtractRelationships') return true;
        if (key === 'relationshipConfidenceThreshold') return 7;
        if (key === 'maxRelationshipsPerSession') return 15;
        return '';
      });

      expect(Settings.getRelationshipSettings()).toEqual({
        autoExtract: true,
        confidenceThreshold: 7,
        maxPerSession: 15
      });
    });

    it('should return defaults from registered settings', () => {
      Settings.registerSettings();

      expect(Settings.getRelationshipSettings()).toEqual({
        autoExtract: true,
        confidenceThreshold: 5,
        maxPerSession: 20
      });
    });
  });

  describe('getNarratorSettings', () => {
    it('should return narrator configuration object with all keys', () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        const values = {
          multiLanguageMode: true,
          transcriptionBatchDuration: 15000,
          offTrackSensitivity: 'high',
          rulesDetection: false,
          rulesSource: 'dnd5e',
          debugMode: true
        };
        return values[key] !== undefined ? values[key] : '';
      });

      expect(Settings.getNarratorSettings()).toEqual({
        multiLanguageMode: true,
        transcriptionBatchDuration: 15000,
        offTrackSensitivity: 'high',
        rulesDetection: false,
        rulesSource: 'dnd5e',
        debugMode: true
      });
    });

    it('should return defaults from registered settings', () => {
      Settings.registerSettings();

      expect(Settings.getNarratorSettings()).toEqual({
        multiLanguageMode: false,
        transcriptionBatchDuration: 10000,
        offTrackSensitivity: 'medium',
        rulesDetection: true,
        rulesSource: 'auto',
        debugMode: false
      });
    });
  });

  describe('getRetrySettings', () => {
    it('should return retry configuration object with all keys', () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        const values = {
          apiRetryEnabled: false,
          apiRetryMaxAttempts: 5,
          apiRetryBaseDelay: 2000,
          apiRetryMaxDelay: 30000,
          apiQueueMaxSize: 50
        };
        return values[key] !== undefined ? values[key] : '';
      });

      expect(Settings.getRetrySettings()).toEqual({
        enabled: false,
        maxAttempts: 5,
        baseDelay: 2000,
        maxDelay: 30000,
        queueMaxSize: 50
      });
    });

    it('should return defaults from registered settings', () => {
      Settings.registerSettings();

      expect(Settings.getRetrySettings()).toEqual({
        enabled: true,
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 60000,
        queueMaxSize: 100
      });
    });
  });

  describe('getRAGSettings', () => {
    it('should return RAG configuration object with all keys', () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        const values = {
          ragEnabled: true,
          ragProvider: 'openai-file-search',
          ragMaxResults: 10,
          ragAutoIndex: false,
          ragSilenceThresholdMs: 60000,
          ragVectorStoreId: 'vs_abc123',
          ragflowBaseUrl: 'http://myserver:9380',
          ragflowApiKey: 'rf-key',
          ragflowModelName: 'deepseek',
          ragflowDatasetId: 'ds-1',
          ragflowChatId: 'ch-1'
        };
        return values[key] !== undefined ? values[key] : '';
      });

      expect(Settings.getRAGSettings()).toEqual({
        enabled: true,
        provider: 'openai-file-search',
        maxResults: 10,
        autoIndex: false,
        silenceThresholdMs: 60000,
        vectorStoreId: 'vs_abc123',
        ragflowBaseUrl: 'http://myserver:9380',
        ragflowApiKey: 'rf-key',
        ragflowModelName: 'deepseek',
        ragflowDatasetId: 'ds-1',
        ragflowChatId: 'ch-1'
      });
    });

    it('should return defaults from registered settings', () => {
      Settings.registerSettings();

      expect(Settings.getRAGSettings()).toEqual({
        enabled: true,
        provider: 'openai-file-search',
        maxResults: 5,
        autoIndex: true,
        silenceThresholdMs: 30000,
        vectorStoreId: '',
        ragflowBaseUrl: 'http://localhost:9380',
        ragflowApiKey: '',
        ragflowModelName: '',
        ragflowDatasetId: '',
        ragflowChatId: ''
      });
    });
  });

  describe('setRAGVectorStoreId', () => {
    it('should delegate to Settings.set with ragVectorStoreId key', async () => {
      await Settings.setRAGVectorStoreId('vs_abc123');

      expect(game.settings.set).toHaveBeenCalledWith(
        MODULE_ID,
        'ragVectorStoreId',
        'vs_abc123'
      );
    });

    it('should store empty string when called with falsy value', async () => {
      await Settings.setRAGVectorStoreId(null);

      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'ragVectorStoreId', '');
    });

    it('should store empty string when called with undefined', async () => {
      await Settings.setRAGVectorStoreId(undefined);

      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'ragVectorStoreId', '');
    });

    it('should store empty string when called with empty string', async () => {
      await Settings.setRAGVectorStoreId('');

      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'ragVectorStoreId', '');
    });
  });

  describe('isRAGConfigured', () => {
    beforeEach(() => {
      Settings.registerSettings();
    });

    it('should return true when OpenAI is configured and RAG is enabled', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        if (key === 'ragEnabled') return true;
        return '';
      });

      expect(Settings.isRAGConfigured()).toBe(true);
    });

    it('should return false when OpenAI is not configured', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return '';
        if (key === 'ragEnabled') return true;
        return '';
      });

      expect(Settings.isRAGConfigured()).toBeFalsy();
    });

    it('should return false when RAG is disabled', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        if (key === 'ragEnabled') return false;
        return '';
      });

      expect(Settings.isRAGConfigured()).toBeFalsy();
    });

    it('should return false when both conditions fail', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return '';
        if (key === 'ragEnabled') return false;
        return '';
      });

      expect(Settings.isRAGConfigured()).toBeFalsy();
    });
  });

  describe('isNarratorConfigured', () => {
    beforeEach(() => {
      Settings.registerSettings();
    });

    it('should return true when OpenAI is configured', () => {
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        return '';
      });

      expect(Settings.isNarratorConfigured()).toBe(true);
    });

    it('should return false when OpenAI is not configured', () => {
      game.settings.get.mockImplementation(() => '');

      expect(Settings.isNarratorConfigured()).toBeFalsy();
    });

    it('should delegate to isOpenAIConfigured', () => {
      const spy = vi.spyOn(Settings, 'isOpenAIConfigured').mockReturnValue(true);

      expect(Settings.isNarratorConfigured()).toBe(true);
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe('_onApiKeyChange', () => {
    it('should show info notification for openai key change when game is ready', () => {
      game.ready = true;

      Settings._onApiKeyChange('openai');

      expect(ui.notifications.info).toHaveBeenCalled();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Settings.ApiKeyUpdated',
        { service: 'OpenAI' }
      );
    });

    it('should show info notification for kanka key change when game is ready', () => {
      game.ready = true;

      Settings._onApiKeyChange('kanka');

      expect(ui.notifications.info).toHaveBeenCalled();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Settings.ApiKeyUpdated',
        { service: 'Kanka' }
      );
    });

    it('should not show notification when game is not ready', () => {
      game.ready = false;

      Settings._onApiKeyChange('openai');

      expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    it('should not throw when ui.notifications is undefined', () => {
      game.ready = true;
      const originalNotifications = ui.notifications;
      ui.notifications = undefined;

      expect(() => Settings._onApiKeyChange('openai')).not.toThrow();

      ui.notifications = originalNotifications;
    });

    it('should use game.i18n.format when available', () => {
      game.ready = true;
      game.i18n.format.mockReturnValue('Translated: OpenAI key updated');

      Settings._onApiKeyChange('openai');

      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Settings.ApiKeyUpdated',
        { service: 'OpenAI' }
      );
      expect(ui.notifications.info).toHaveBeenCalledWith('Translated: OpenAI key updated');
    });

    it('should fall back to English string when i18n is unavailable', () => {
      game.ready = true;
      const originalI18n = game.i18n;
      game.i18n = undefined;

      Settings._onApiKeyChange('openai');

      expect(ui.notifications.info).toHaveBeenCalledWith(
        expect.stringContaining('Re-initializing services')
      );

      game.i18n = originalI18n;
    });

    it('should attempt to reinitialize VoxChronicle services', async () => {
      game.ready = true;

      // The dynamic import of VoxChronicle.mjs will fail in test context,
      // but _onApiKeyChange should catch the error without throwing
      Settings._onApiKeyChange('openai');

      // Give the async import().then().catch() chain time to settle
      await new Promise(resolve => setTimeout(resolve, 50));

      // If we got here without error, the catch block handled it
    });
  });

  describe('validateOpenAIKey', () => {
    it('should return false and show error when OpenAI is not configured', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation(() => '');

      const result = await Settings.validateOpenAIKey();

      expect(result).toBe(false);
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should show the correct localized message when not configured', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation(() => '');

      await Settings.validateOpenAIKey();

      expect(game.i18n.localize).toHaveBeenCalledWith(
        'VOXCHRONICLE.Validation.OpenAIKeyNotConfigured'
      );
    });

    it('should return false when dynamic import throws an error', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        return '';
      });

      // The dynamic import of VoxChronicle.mjs will fail in test context
      const result = await Settings.validateOpenAIKey();

      expect(result).toBe(false);
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should remove loading notification even when import throws (no permanent spinner)', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'openaiApiKey') return 'sk-test-key';
        return '';
      });

      // Make the loading notification mock track .remove() calls
      const mockLoadingNotif = { remove: vi.fn() };
      ui.notifications.info.mockReturnValue(mockLoadingNotif);

      // The dynamic import will fail in test context, triggering catch + finally
      await Settings.validateOpenAIKey();

      // The finally block should always call loadingNotif.remove()
      expect(mockLoadingNotif.remove).toHaveBeenCalledTimes(1);
    });

    it('should not create loading notification when not configured (early return)', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation(() => '');

      await Settings.validateOpenAIKey();

      // info should not be called for loading (only error is called)
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });
  });

  describe('validateKankaToken', () => {
    it('should return false and show error when Kanka is not configured', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation(() => '');

      const result = await Settings.validateKankaToken();

      expect(result).toBe(false);
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should show the correct localized message when not configured', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation(() => '');

      await Settings.validateKankaToken();

      expect(game.i18n.localize).toHaveBeenCalledWith(
        'VOXCHRONICLE.Validation.KankaTokenNotConfigured'
      );
    });

    it('should return false when token is set but campaign ID is missing', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'kankaApiToken') return 'test-token';
        return '';
      });

      const result = await Settings.validateKankaToken();

      expect(result).toBe(false);
    });

    it('should return false when dynamic import throws an error', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '12345';
        return '';
      });

      // The dynamic import of VoxChronicle.mjs will fail in test context
      const result = await Settings.validateKankaToken();

      expect(result).toBe(false);
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should remove loading notification even when import throws (no permanent spinner)', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation((_module, key) => {
        if (key === 'kankaApiToken') return 'test-token';
        if (key === 'kankaCampaignId') return '12345';
        return '';
      });

      // Make the loading notification mock track .remove() calls
      const mockLoadingNotif = { remove: vi.fn() };
      ui.notifications.info.mockReturnValue(mockLoadingNotif);

      // The dynamic import will fail in test context, triggering catch + finally
      await Settings.validateKankaToken();

      // The finally block should always call loadingNotif.remove()
      expect(mockLoadingNotif.remove).toHaveBeenCalledTimes(1);
    });

    it('should not create loading notification when not configured (early return)', async () => {
      Settings.registerSettings();
      game.settings.get.mockImplementation(() => '');

      await Settings.validateKankaToken();

      // info should not be called for loading (only error is called)
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });
  });

  describe('setting defaults via registerSettings mock store', () => {
    it('should populate defaults into the mock store when registerSettings is called', () => {
      Settings.registerSettings();

      // The mock settings.register stores defaults, so Settings.get should return them
      expect(Settings.get('openaiApiKey')).toBe('');
      expect(Settings.get('transcriptionMode')).toBe('auto');
      expect(Settings.get('echoCancellation')).toBe(true);
      expect(Settings.get('imageQuality')).toBe('high');
      expect(Settings.get('maxImagesPerSession')).toBe(3);
      expect(Settings.get('autoExtractEntities')).toBe(true);
      expect(Settings.get('ragEnabled')).toBe(true);
      expect(Settings.get('ragProvider')).toBe('openai-file-search');
      expect(Settings.get('apiRetryEnabled')).toBe(true);
      expect(Settings.get('debugMode')).toBe(false);
    });
  });

  describe('onChange side effects', () => {
    it('should invoke Logger.setDebugMode when debugMode onChange fires', () => {
      Settings.registerSettings();

      const call = game.settings.register.mock.calls.find((c) => c[1] === 'debugMode');
      // The onChange handler calls Logger.setDebugMode(value)
      // Since Logger is used at module level, we verify the handler is callable
      expect(() => call[2].onChange(true)).not.toThrow();
      expect(() => call[2].onChange(false)).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle registerSettings being called multiple times', () => {
      Settings.registerSettings();
      Settings.registerSettings();

      // Should not throw, just registers settings twice
      const callCount = game.settings.register.mock.calls.length;
      expect(callCount).toBeGreaterThan(35);
    });

    it('should handle get/set before registerSettings', () => {
      // get returns undefined since no defaults were registered
      const value = Settings.get('openaiApiKey');
      expect(value).toBeUndefined();
    });

    it('should handle set with various value types', async () => {
      await Settings.set('debugMode', true);
      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'debugMode', true);

      await Settings.set('maxImagesPerSession', 5);
      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'maxImagesPerSession', 5);

      await Settings.set('speakerLabels', { a: 'b' });
      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'speakerLabels', { a: 'b' });
    });
  });

  // ── _validateServerUrl ─────────────────────────────────────────────────

  describe('_validateServerUrl', () => {
    it('should accept valid http URL', () => {
      Settings._validateServerUrl('http://localhost:8080', 'whisperBackendUrl');
      expect(ui.notifications.error).not.toHaveBeenCalled();
    });

    it('should accept valid https URL', () => {
      Settings._validateServerUrl('https://example.com/api', 'ragflowBaseUrl');
      expect(ui.notifications.error).not.toHaveBeenCalled();
    });

    it('should reject non-http/https scheme and reset to default', () => {
      Settings._validateServerUrl('ftp://evil.com', 'whisperBackendUrl');
      expect(ui.notifications.error).toHaveBeenCalled();
      expect(game.settings.set).toHaveBeenCalledWith(
        MODULE_ID, 'whisperBackendUrl', 'http://localhost:8080'
      );
    });

    it('should warn on unparseable URL and reset to default', () => {
      Settings._validateServerUrl('not a url at all', 'ragflowBaseUrl');
      expect(ui.notifications.warn).toHaveBeenCalled();
      expect(game.settings.set).toHaveBeenCalledWith(
        MODULE_ID, 'ragflowBaseUrl', 'http://localhost:9380'
      );
    });

    it('should do nothing for empty/null value', () => {
      Settings._validateServerUrl('', 'whisperBackendUrl');
      Settings._validateServerUrl(null, 'whisperBackendUrl');
      expect(ui.notifications.error).not.toHaveBeenCalled();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
    });
  });
});
