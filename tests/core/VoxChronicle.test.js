/**
 * VoxChronicle Unit Tests
 *
 * Comprehensive tests for the main VoxChronicle singleton class that
 * orchestrates all module services: audio recording, transcription,
 * image generation, entity extraction, Kanka publishing, narrator
 * services, and RAG (Retrieval-Augmented Generation).
 *
 * @module tests/core/VoxChronicle.test
 */

// ── Hoisted mock variables (must be declared before vi.mock factories) ──

const {
  mockAudioRecorder,
  mockTranscriptionFactoryCreate,
  mockImageGenerationService,
  mockKankaService,
  mockEntityExtractor,
  mockNarrativeExporter,
  mockSessionOrchestratorInstance,
  mockSessionOrchestrator,
  mockVocabularyDictionary,
  mockJournalParser,
  mockCompendiumParser,
  mockChapterTracker,
  mockSceneDetector,
  mockAIAssistantInstance,
  mockAIAssistant,
  mockRulesReference,
  mockSessionAnalytics,
  mockOpenAIClient,
  mockLoggerChild,
  mockSetDebugMode,
  mockRAGProviderInstance,
  mockRAGProviderFactoryCreate,
  mockSilenceDetector,
  mockSettingsModule
} = vi.hoisted(() => {
  const mockAudioRecorder = vi.fn().mockImplementation(() => ({}));
  const mockTranscriptionFactoryCreate = vi.fn().mockResolvedValue({ type: 'cloud' });
  const mockImageGenerationService = vi.fn().mockImplementation(() => ({}));
  const mockKankaService = vi.fn().mockImplementation(() => ({}));
  const mockEntityExtractor = vi.fn().mockImplementation(() => ({}));
  const mockNarrativeExporter = vi.fn().mockImplementation(() => ({
    setOpenAIClient: vi.fn()
  }));
  const mockSessionOrchestratorInstance = {
    setTranscriptionConfig: vi.fn(),
    setNarratorServices: vi.fn(),
    setRAGProvider: vi.fn(),
    setCallbacks: vi.fn()
  };
  const mockSessionOrchestrator = vi.fn().mockImplementation(() => mockSessionOrchestratorInstance);
  const mockVocabularyDictionary = vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined)
  }));
  const mockJournalParser = vi.fn().mockImplementation(() => ({}));
  const mockCompendiumParser = vi.fn().mockImplementation(() => ({}));
  const mockChapterTracker = vi.fn().mockImplementation(() => ({}));
  const mockSceneDetector = vi.fn().mockImplementation(() => ({}));
  const mockAIAssistantInstance = {
    setRAGProvider: vi.fn(),
    setSilenceDetector: vi.fn(),
    setRulesReference: vi.fn()
  };
  const mockAIAssistant = vi.fn().mockImplementation(() => mockAIAssistantInstance);
  const mockRulesReference = vi.fn().mockImplementation(() => ({}));
  const mockSessionAnalytics = vi.fn().mockImplementation(() => ({}));
  const mockOpenAIClient = vi.fn().mockImplementation(() => ({}));
  const mockLoggerChild = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };
  const mockSetDebugMode = vi.fn();
  const mockRAGProviderInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getVectorStoreId: vi.fn().mockReturnValue('vs-test-123')
  };
  const mockRAGProviderFactoryCreate = vi.fn().mockReturnValue(mockRAGProviderInstance);
  const mockSilenceDetector = vi.fn().mockImplementation(() => ({}));
  const mockSettingsModule = {
    getRAGSettings: vi.fn().mockReturnValue({
      enabled: false,
      provider: 'openai-file-search',
      maxResults: 5,
      autoIndex: true,
      silenceThresholdMs: 3000,
      vectorStoreId: null,
      campaignId: 'test-campaign'
    }),
    setRAGVectorStoreId: vi.fn().mockResolvedValue(undefined),
    validateServerUrls: vi.fn()
  };
  return {
    mockAudioRecorder, mockTranscriptionFactoryCreate, mockImageGenerationService,
    mockKankaService, mockEntityExtractor, mockNarrativeExporter,
    mockSessionOrchestratorInstance, mockSessionOrchestrator, mockVocabularyDictionary,
    mockJournalParser, mockCompendiumParser, mockChapterTracker, mockSceneDetector,
    mockAIAssistantInstance, mockAIAssistant, mockRulesReference, mockSessionAnalytics,
    mockOpenAIClient, mockLoggerChild, mockSetDebugMode,
    mockRAGProviderInstance, mockRAGProviderFactoryCreate, mockSilenceDetector,
    mockSettingsModule
  };
});

// ── Mock all imported dependencies ──────────────────────────────────────

vi.mock('../../scripts/audio/AudioRecorder.mjs', () => ({
  AudioRecorder: mockAudioRecorder
}));
vi.mock('../../scripts/ai/TranscriptionFactory.mjs', () => ({
  TranscriptionFactory: { create: mockTranscriptionFactoryCreate }
}));
vi.mock('../../scripts/ai/ImageGenerationService.mjs', () => ({
  ImageGenerationService: mockImageGenerationService
}));
vi.mock('../../scripts/kanka/KankaService.mjs', () => ({
  KankaService: mockKankaService
}));
vi.mock('../../scripts/ai/EntityExtractor.mjs', () => ({
  EntityExtractor: mockEntityExtractor
}));
vi.mock('../../scripts/kanka/NarrativeExporter.mjs', () => ({
  NarrativeExporter: mockNarrativeExporter
}));
vi.mock('../../scripts/orchestration/SessionOrchestrator.mjs', () => ({
  SessionOrchestrator: mockSessionOrchestrator
}));
vi.mock('../../scripts/core/VocabularyDictionary.mjs', () => ({
  VocabularyDictionary: mockVocabularyDictionary
}));
vi.mock('../../scripts/narrator/JournalParser.mjs', () => ({
  JournalParser: mockJournalParser
}));
vi.mock('../../scripts/narrator/CompendiumParser.mjs', () => ({
  CompendiumParser: mockCompendiumParser
}));
vi.mock('../../scripts/narrator/ChapterTracker.mjs', () => ({
  ChapterTracker: mockChapterTracker
}));
vi.mock('../../scripts/narrator/SceneDetector.mjs', () => ({
  SceneDetector: mockSceneDetector
}));
vi.mock('../../scripts/narrator/AIAssistant.mjs', () => ({
  AIAssistant: mockAIAssistant
}));
vi.mock('../../scripts/narrator/RulesReference.mjs', () => ({
  RulesReference: mockRulesReference
}));
vi.mock('../../scripts/narrator/SessionAnalytics.mjs', () => ({
  SessionAnalytics: mockSessionAnalytics
}));
vi.mock('../../scripts/ai/OpenAIClient.mjs', () => ({
  OpenAIClient: mockOpenAIClient
}));
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => mockLoggerChild),
    setDebugMode: mockSetDebugMode
  }
}));
vi.mock('../../scripts/rag/RAGProviderFactory.mjs', () => ({
  RAGProviderFactory: { create: mockRAGProviderFactoryCreate }
}));
vi.mock('../../scripts/narrator/SilenceDetector.mjs', () => ({
  SilenceDetector: mockSilenceDetector
}));
vi.mock('../../scripts/core/Settings.mjs', () => ({
  Settings: mockSettingsModule
}));

// ── Import the class under test (after all vi.mock calls) ───────────────
import { VoxChronicle } from '../../scripts/core/VoxChronicle.mjs';

const MODULE_ID = 'vox-chronicle';

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Configure game.settings.get to return specific values for known keys.
 * Keys not in the map return undefined (the foundry-mock default).
 */
function configureSettings(settingsMap) {
  game.settings.get.mockImplementation((module, key) => {
    const fullKey = `${module}.${key}`;
    if (settingsMap.hasOwnProperty(key)) {
      return settingsMap[key];
    }
    if (settingsMap.hasOwnProperty(fullKey)) {
      return settingsMap[fullKey];
    }
    return undefined;
  });
}

/**
 * Returns a full settings map with reasonable defaults for a complete initialization.
 */
function fullSettings(overrides = {}) {
  return {
    openaiApiKey: 'sk-test-key-123',
    kankaApiToken: 'kanka-token-abc',
    kankaCampaignId: 'camp-456',
    echoCancellation: true,
    noiseSuppression: true,
    transcriptionMode: 'cloud',
    whisperBackendUrl: '',
    transcriptionLanguage: 'en',
    kankaApiTokenCreatedAt: null,
    rulesDetection: true,
    debugMode: false,
    ragEnabled: false,
    ...overrides
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────

describe('VoxChronicle', () => {
  beforeEach(() => {
    // Reset singleton state between tests
    VoxChronicle.resetInstance();

    // Clear all mock call records
    vi.clearAllMocks();

    // Re-establish mock implementations (vi.restoreAllMocks in afterEach clears them)
    mockAudioRecorder.mockImplementation(() => ({}));
    mockTranscriptionFactoryCreate.mockResolvedValue({ type: 'cloud' });
    mockImageGenerationService.mockImplementation(() => ({}));
    mockKankaService.mockImplementation(() => ({}));
    mockEntityExtractor.mockImplementation(() => ({}));
    mockNarrativeExporter.mockImplementation(() => ({ setOpenAIClient: vi.fn() }));
    mockSessionOrchestratorInstance.setTranscriptionConfig = vi.fn();
    mockSessionOrchestratorInstance.setNarratorServices = vi.fn();
    mockSessionOrchestrator.mockImplementation(() => mockSessionOrchestratorInstance);
    mockVocabularyDictionary.mockImplementation(() => ({
      initialize: vi.fn().mockResolvedValue(undefined)
    }));
    mockJournalParser.mockImplementation(() => ({}));
    mockCompendiumParser.mockImplementation(() => ({}));
    mockChapterTracker.mockImplementation(() => ({}));
    mockSceneDetector.mockImplementation(() => ({}));
    mockAIAssistantInstance.setRAGProvider = vi.fn();
    mockAIAssistantInstance.setSilenceDetector = vi.fn();
    mockAIAssistantInstance.setRulesReference = vi.fn();
    mockAIAssistant.mockImplementation(() => mockAIAssistantInstance);
    mockRulesReference.mockImplementation(() => ({}));
    mockSessionAnalytics.mockImplementation(() => ({}));
    mockOpenAIClient.mockImplementation(() => ({}));
    mockLoggerChild.info = vi.fn();
    mockLoggerChild.warn = vi.fn();
    mockLoggerChild.error = vi.fn();
    mockLoggerChild.debug = vi.fn();
    mockSetDebugMode.mockReset();
    mockRAGProviderInstance.initialize = vi.fn().mockResolvedValue(undefined);
    mockRAGProviderInstance.getVectorStoreId = vi.fn().mockReturnValue('vs-test-123');
    mockRAGProviderFactoryCreate.mockReturnValue(mockRAGProviderInstance);
    mockSilenceDetector.mockImplementation(() => ({}));
    mockSettingsModule.getRAGSettings.mockReturnValue({
      enabled: false, provider: 'openai-file-search', maxResults: 5,
      autoIndex: true, silenceThresholdMs: 3000, vectorStoreId: null,
      campaignId: 'test-campaign'
    });
    mockSettingsModule.setRAGVectorStoreId = vi.fn().mockResolvedValue(undefined);
    mockSettingsModule.validateServerUrls = vi.fn();

    // Configure default settings that return null for everything (simulates unconfigured)
    configureSettings({});
  });

  // ====================================================================
  // Singleton Pattern
  // ====================================================================

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple getInstance() calls', () => {
      const instance1 = VoxChronicle.getInstance();
      const instance2 = VoxChronicle.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create a new instance if none exists', () => {
      const instance = VoxChronicle.getInstance();
      expect(instance).toBeInstanceOf(VoxChronicle);
    });

    it('should have all service properties set to null initially', () => {
      const instance = VoxChronicle.getInstance();
      expect(instance.audioRecorder).toBeNull();
      expect(instance.transcriptionService).toBeNull();
      expect(instance.imageGenerationService).toBeNull();
      expect(instance.kankaService).toBeNull();
      expect(instance.entityExtractor).toBeNull();
      expect(instance.narrativeExporter).toBeNull();
      expect(instance.sessionOrchestrator).toBeNull();
      expect(instance.journalParser).toBeNull();
      expect(instance.compendiumParser).toBeNull();
      expect(instance.chapterTracker).toBeNull();
      expect(instance.sceneDetector).toBeNull();
      expect(instance.aiAssistant).toBeNull();
      expect(instance.rulesReference).toBeNull();
      expect(instance.sessionAnalytics).toBeNull();
      expect(instance.ragProvider).toBeNull();
      expect(instance.silenceDetector).toBeNull();
    });

    it('should not be initialized initially', () => {
      const instance = VoxChronicle.getInstance();
      expect(instance.isInitialized).toBe(false);
    });
  });

  // ====================================================================
  // _hooksRegistered static property
  // ====================================================================

  describe('_hooksRegistered static property', () => {
    it('should be declared as false (not undefined) before any initialization', () => {
      // After resetInstance, _hooksRegistered must be exactly false, not undefined
      VoxChronicle.resetInstance();
      expect(VoxChronicle._hooksRegistered).toBe(false);
    });

    it('should be set to true after initialize registers hooks', async () => {
      configureSettings(fullSettings());
      VoxChronicle.resetInstance();
      const instance = VoxChronicle.getInstance();
      await instance.initialize();
      expect(VoxChronicle._hooksRegistered).toBe(true);
    });

    it('should be reset to false by resetInstance', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();
      await instance.initialize();
      expect(VoxChronicle._hooksRegistered).toBe(true);

      VoxChronicle.resetInstance();
      expect(VoxChronicle._hooksRegistered).toBe(false);
    });
  });

  // ====================================================================
  // resetInstance
  // ====================================================================

  describe('resetInstance', () => {
    it('should set the static instance to null', () => {
      const instance1 = VoxChronicle.getInstance();
      expect(instance1).not.toBeNull();

      VoxChronicle.resetInstance();
      const instance2 = VoxChronicle.getInstance();
      expect(instance2).not.toBe(instance1);
    });

    it('should set isInitialized to false on the existing instance before nullifying', () => {
      const instance = VoxChronicle.getInstance();
      instance.isInitialized = true;

      VoxChronicle.resetInstance();
      // The old instance should have been set to not initialized
      expect(instance.isInitialized).toBe(false);
    });

    it('should allow creating a fresh instance after reset', () => {
      const instance1 = VoxChronicle.getInstance();
      VoxChronicle.resetInstance();
      const instance2 = VoxChronicle.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('should handle reset when no instance exists', () => {
      // Should not throw
      expect(() => VoxChronicle.resetInstance()).not.toThrow();
    });
  });

  // ====================================================================
  // _getSetting
  // ====================================================================

  describe('_getSetting', () => {
    it('should return a setting value from game.settings', () => {
      configureSettings({ openaiApiKey: 'my-key' });
      const instance = VoxChronicle.getInstance();

      const result = instance._getSetting('openaiApiKey');
      expect(result).toBe('my-key');
      expect(game.settings.get).toHaveBeenCalledWith(MODULE_ID, 'openaiApiKey');
    });

    it('should return null when the setting does not exist', () => {
      game.settings.get.mockImplementation(() => {
        throw new Error('Setting not registered');
      });

      const instance = VoxChronicle.getInstance();
      const result = instance._getSetting('nonexistentKey');
      expect(result).toBeNull();
    });

    it('should return null when game.settings.get throws', () => {
      game.settings.get.mockImplementation(() => {
        throw new TypeError('Cannot read properties');
      });

      const instance = VoxChronicle.getInstance();
      expect(instance._getSetting('anything')).toBeNull();
    });

    it('should return falsy values correctly (not treat them as errors)', () => {
      configureSettings({ debugMode: false });
      const instance = VoxChronicle.getInstance();

      expect(instance._getSetting('debugMode')).toBe(false);
    });

    it('should return 0 correctly', () => {
      configureSettings({ maxImagesPerSession: 0 });
      const instance = VoxChronicle.getInstance();

      expect(instance._getSetting('maxImagesPerSession')).toBe(0);
    });

    it('should return empty string correctly', () => {
      configureSettings({ openaiApiKey: '' });
      const instance = VoxChronicle.getInstance();

      expect(instance._getSetting('openaiApiKey')).toBe('');
    });
  });

  // ====================================================================
  // initialize()
  // ====================================================================

  describe('initialize', () => {
    it('should re-initialize when called again (idempotent reinit)', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();
      instance.isInitialized = true;

      await instance.initialize();

      // initialize() does NOT skip — it re-initializes services (idempotent reinit)
      expect(instance.isInitialized).toBe(true);
      // Settings.validateServerUrls is called at the top
      expect(mockSettingsModule.validateServerUrls).toHaveBeenCalled();
    });

    it('should initialize all services with full configuration', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // Audio recorder always created
      expect(mockAudioRecorder).toHaveBeenCalledWith({
        echoCancellation: true,
        noiseSuppression: true
      });

      // Transcription factory called
      expect(mockTranscriptionFactoryCreate).toHaveBeenCalledWith({
        mode: 'cloud',
        openaiApiKey: 'sk-test-key-123',
        whisperBackendUrl: ''
      });

      // OpenAI-dependent services created
      expect(mockImageGenerationService).toHaveBeenCalledWith('sk-test-key-123');
      expect(mockEntityExtractor).toHaveBeenCalledWith('sk-test-key-123');

      // Kanka services created
      expect(mockKankaService).toHaveBeenCalledWith('kanka-token-abc', 'camp-456');
      expect(mockNarrativeExporter).toHaveBeenCalled();

      // Orchestrator created and configured
      expect(mockSessionOrchestrator).toHaveBeenCalledWith({
        audioRecorder: expect.any(Object),
        transcriptionService: expect.any(Object),
        entityExtractor: expect.any(Object),
        imageGenerationService: expect.any(Object),
        kankaService: expect.any(Object),
        narrativeExporter: expect.any(Object),
        aiAssistant: expect.any(Object)
      });
      expect(mockSessionOrchestratorInstance.setTranscriptionConfig).toHaveBeenCalledWith({
        mode: 'cloud',
        openaiApiKey: 'sk-test-key-123',
        whisperBackendUrl: ''
      });

      // Narrator services created
      expect(mockJournalParser).toHaveBeenCalled();
      expect(mockCompendiumParser).toHaveBeenCalled();
      expect(mockChapterTracker).toHaveBeenCalled();
      expect(mockSceneDetector).toHaveBeenCalled();
      expect(mockSessionAnalytics).toHaveBeenCalled();

      // AI Assistant created with OpenAI key
      expect(mockAIAssistant).toHaveBeenCalledWith({
        openaiClient: expect.any(Object),
        primaryLanguage: 'it'
      });

      // Rules reference created
      expect(mockRulesReference).toHaveBeenCalledWith({ language: 'it' });

      // Narrator services connected to orchestrator
      expect(mockSessionOrchestratorInstance.setNarratorServices).toHaveBeenCalledWith({
        aiAssistant: expect.any(Object),
        chapterTracker: expect.any(Object),
        sceneDetector: expect.any(Object),
        sessionAnalytics: expect.any(Object),
        journalParser: expect.any(Object)
      });

      // Module marked as initialized
      expect(instance.isInitialized).toBe(true);
    });

    it('should initialize without OpenAI API key', async () => {
      configureSettings(fullSettings({
        openaiApiKey: null
      }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // Warn about missing key
      expect(mockLoggerChild.warn).toHaveBeenCalledWith('OpenAI API key is empty or not configured');

      // OpenAI-dependent services not created
      expect(mockImageGenerationService).not.toHaveBeenCalled();
      expect(mockEntityExtractor).not.toHaveBeenCalled();
      expect(mockAIAssistant).not.toHaveBeenCalled();

      expect(instance.imageGenerationService).toBeNull();
      expect(instance.entityExtractor).toBeNull();
      expect(instance.aiAssistant).toBeNull();

      // Audio recorder still created
      expect(mockAudioRecorder).toHaveBeenCalled();

      // Narrator services that don't need API key still created
      expect(mockJournalParser).toHaveBeenCalled();
      expect(mockSceneDetector).toHaveBeenCalled();

      // Still marked as initialized
      expect(instance.isInitialized).toBe(true);
    });

    it('should still warn about missing OpenAI key when transcriptionMode is local', async () => {
      configureSettings(fullSettings({
        openaiApiKey: null,
        transcriptionMode: 'local'
      }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // The current code always warns when OpenAI key is missing, regardless of transcription mode
      expect(mockLoggerChild.warn).toHaveBeenCalledWith('OpenAI API key is empty or not configured');
    });

    it('should warn about missing OpenAI key when transcriptionMode is cloud', async () => {
      configureSettings(fullSettings({
        openaiApiKey: null,
        transcriptionMode: 'cloud'
      }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockLoggerChild.warn).toHaveBeenCalledWith('OpenAI API key is empty or not configured');
    });

    it('should initialize without Kanka settings', async () => {
      configureSettings(fullSettings({
        kankaApiToken: null,
        kankaCampaignId: null
      }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // Kanka services are silently set to null when not configured
      expect(mockKankaService).not.toHaveBeenCalled();
      expect(mockNarrativeExporter).not.toHaveBeenCalled();
      expect(instance.kankaService).toBeNull();
      expect(instance.narrativeExporter).toBeNull();
    });

    it('should not create Kanka service when only token is present but no campaign ID', async () => {
      configureSettings(fullSettings({
        kankaApiToken: 'token',
        kankaCampaignId: null
      }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockKankaService).not.toHaveBeenCalled();
    });

    it('should not create Kanka service when only campaign ID is present but no token', async () => {
      configureSettings(fullSettings({
        kankaApiToken: null,
        kankaCampaignId: 'camp-123'
      }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockKankaService).not.toHaveBeenCalled();
    });

    it('should set OpenAI client on narrative exporter when transcription service exists', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // NarrativeExporter.setOpenAIClient should have been called
      const exporterInstance = mockNarrativeExporter.mock.results[0].value;
      expect(exporterInstance.setOpenAIClient).toHaveBeenCalledWith('sk-test-key-123');
    });

    it('should still set OpenAI client on narrative exporter even when transcription service fails', async () => {
      mockTranscriptionFactoryCreate.mockRejectedValueOnce(new Error('No backend'));
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // Narrative exporter is created and setOpenAIClient is called based on openaiApiKey
      // (not based on transcription service success)
      const exporterInstance = mockNarrativeExporter.mock.results[0].value;
      expect(exporterInstance.setOpenAIClient).toHaveBeenCalledWith('sk-test-key-123');
    });

    it('should handle TranscriptionFactory.create failure gracefully', async () => {
      mockTranscriptionFactoryCreate.mockRejectedValueOnce(new Error('Backend unreachable'));
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // Should log the warning and continue
      expect(mockLoggerChild.warn).toHaveBeenCalledWith(
        expect.stringContaining('Transcription service unavailable')
      );
      expect(instance.transcriptionService).toBeNull();
      // Other services should still initialize
      expect(instance.isInitialized).toBe(true);
    });

    it('should use default transcriptionMode "auto" when not configured', async () => {
      configureSettings(fullSettings({ transcriptionMode: null }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockTranscriptionFactoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'auto' })
      );
    });

    it('should use default echoCancellation and noiseSuppression when not configured', async () => {
      configureSettings(fullSettings({
        echoCancellation: null,
        noiseSuppression: null
      }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockAudioRecorder).toHaveBeenCalledWith({
        echoCancellation: true,
        noiseSuppression: true
      });
    });

    it('should not create rules reference when rulesDetection is false', async () => {
      configureSettings(fullSettings({ rulesDetection: false }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockRulesReference).not.toHaveBeenCalled();
      expect(instance.rulesReference).toBeNull();
    });

    it('should create rules reference when rulesDetection is true', async () => {
      configureSettings(fullSettings({ rulesDetection: true }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockRulesReference).toHaveBeenCalledWith({ language: 'it' });
    });

    it('should create rules reference when rulesDetection is undefined (not explicitly false)', async () => {
      configureSettings(fullSettings({ rulesDetection: undefined }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockRulesReference).toHaveBeenCalled();
    });

    it('should not call Logger.setDebugMode (debug mode is handled elsewhere)', async () => {
      configureSettings(fullSettings({ debugMode: true }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // initialize() no longer calls Logger.setDebugMode directly
      expect(mockSetDebugMode).not.toHaveBeenCalled();
    });

    it('should pass aiResponseLanguage to AIAssistant', async () => {
      configureSettings(fullSettings({ aiResponseLanguage: 'de' }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockAIAssistant).toHaveBeenCalledWith(
        expect.objectContaining({ primaryLanguage: 'de' })
      );
    });

    it('should default AIAssistant language to "it" when aiResponseLanguage not set', async () => {
      configureSettings(fullSettings({ aiResponseLanguage: null }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockAIAssistant).toHaveBeenCalledWith(
        expect.objectContaining({ primaryLanguage: 'it' })
      );
    });

    it('should pass aiAssistant as null to narrator services when no OpenAI key', async () => {
      configureSettings(fullSettings({ openaiApiKey: null }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockSessionOrchestratorInstance.setNarratorServices).toHaveBeenCalledWith(
        expect.objectContaining({ aiAssistant: null })
      );
    });

    it('should throw and log error when initialization fails catastrophically', async () => {
      // Simulate an error that can't be caught internally (e.g. in orchestrator constructor)
      mockSessionOrchestrator.mockImplementationOnce(() => {
        throw new Error('Catastrophic failure');
      });
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      await expect(instance.initialize()).rejects.toThrow('Catastrophic failure');
      expect(mockLoggerChild.error).toHaveBeenCalledWith(
        'Failed to initialize services:',
        expect.any(Error)
      );
      expect(instance.isInitialized).toBe(false);
    });

    it('should not initialize VocabularyDictionary during initialize() (it is imported but not instantiated)', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // VocabularyDictionary is imported but no longer instantiated in initialize()
      expect(mockVocabularyDictionary).not.toHaveBeenCalled();
    });

    it('should pass ChapterTracker the journalParser dependency', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockChapterTracker).toHaveBeenCalledWith({
        journalParser: expect.any(Object)
      });
    });
  });

  // ====================================================================
  // _checkKankaTokenExpiration
  // ====================================================================

  describe('_checkKankaTokenExpiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return early when no Kanka API token is configured', async () => {
      configureSettings({ kankaApiToken: null });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      // Should not call set or show any notifications
      expect(game.settings.set).not.toHaveBeenCalled();
      expect(ui.notifications.error).not.toHaveBeenCalled();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    it('should migrate token timestamp when token exists but no created-at date', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: null
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      // Should set the timestamp to now
      expect(game.settings.set).toHaveBeenCalledWith(
        MODULE_ID,
        'kankaApiTokenCreatedAt',
        now
      );
      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'Kanka API token timestamp initialized (migration)'
      );

      // Should NOT show any expiration warning on first migration
      expect(ui.notifications.error).not.toHaveBeenCalled();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    it('should show CRITICAL error when token expires in 30 days or less', async () => {
      // Token created 340 days ago -> 24 days remaining
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (340 * 24 * 60 * 60 * 1000);

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.error).toHaveBeenCalledWith(
        expect.any(String),
        { permanent: true }
      );
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Kanka.TokenExpiringCritical',
        { days: 24 }
      );
    });

    it('should show CRITICAL error when token expires in exactly 30 days', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (334 * 24 * 60 * 60 * 1000); // 364 - 334 = 30 days remaining

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.error).toHaveBeenCalledWith(
        expect.any(String),
        { permanent: true }
      );
    });

    it('should show CRITICAL error when token has already expired (negative days)', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (400 * 24 * 60 * 60 * 1000); // 364 - 400 = -36 days

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.error).toHaveBeenCalledWith(
        expect.any(String),
        { permanent: true }
      );
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Kanka.TokenExpiringCritical',
        { days: expect.any(Number) }
      );
    });

    it('should show URGENT warning when token expires in 31-60 days', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (320 * 24 * 60 * 60 * 1000); // 364 - 320 = 44 days remaining

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.any(String),
        { permanent: true }
      );
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Kanka.TokenExpiringUrgent',
        { days: 44 }
      );
      // Should NOT show error
      expect(ui.notifications.error).not.toHaveBeenCalled();
    });

    it('should show URGENT warning when token expires in exactly 60 days', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (304 * 24 * 60 * 60 * 1000); // 364 - 304 = 60

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.any(String),
        { permanent: true }
      );
    });

    it('should show INFO notification when token expires in 61-90 days', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (290 * 24 * 60 * 60 * 1000); // 364 - 290 = 74 days remaining

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.info).toHaveBeenCalledWith(expect.any(String));
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Kanka.TokenExpiring',
        { days: 74 }
      );
      // Should NOT show error or warn
      expect(ui.notifications.error).not.toHaveBeenCalled();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it('should show INFO notification when token expires in exactly 90 days', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (274 * 24 * 60 * 60 * 1000); // 364 - 274 = 90

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.info).toHaveBeenCalledWith(expect.any(String));
    });

    it('should show no notification when token has more than 90 days remaining', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (100 * 24 * 60 * 60 * 1000); // 364 - 100 = 264 days remaining

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.error).not.toHaveBeenCalled();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    it('should show no notification when token was just created', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (1 * 24 * 60 * 60 * 1000); // 1 day ago -> 363 remaining

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      expect(ui.notifications.error).not.toHaveBeenCalled();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      // _getSetting catches its own errors, so to trigger the outer catch block
      // we need an error in the logic after _getSetting succeeds.
      // Make settings return valid token but have i18n.format throw.
      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: Date.now() - (340 * 24 * 60 * 60 * 1000) // 24 days remaining
      });
      game.i18n.format.mockImplementation(() => {
        throw new Error('i18n system broken');
      });
      const instance = VoxChronicle.getInstance();

      // Should not throw
      await expect(instance._checkKankaTokenExpiration()).resolves.toBeUndefined();
      expect(mockLoggerChild.error).toHaveBeenCalledWith(
        'Failed to check Kanka token expiration:',
        expect.any(Error)
      );
    });

    it('should correctly compute boundary: 31 days remaining should be URGENT not CRITICAL', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (333 * 24 * 60 * 60 * 1000); // 364 - 333 = 31

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      // 31 > 30, so it should be URGENT, not CRITICAL
      expect(ui.notifications.error).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should correctly compute boundary: 61 days remaining should be INFO not URGENT', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (303 * 24 * 60 * 60 * 1000); // 364 - 303 = 61

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      // 61 > 60, so it should be INFO, not URGENT
      expect(ui.notifications.warn).not.toHaveBeenCalled();
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should correctly compute boundary: 91 days remaining should show nothing', async () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const tokenCreatedAt = now - (273 * 24 * 60 * 60 * 1000); // 364 - 273 = 91

      configureSettings({
        kankaApiToken: 'valid-token',
        kankaApiTokenCreatedAt: tokenCreatedAt
      });
      const instance = VoxChronicle.getInstance();

      await instance._checkKankaTokenExpiration();

      // 91 > 90, so no notification at all
      expect(ui.notifications.error).not.toHaveBeenCalled();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // _initializeRAGServices
  // ====================================================================

  describe('_initializeRAGServices', () => {
    it('should skip when RAG is disabled in settings', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: false,
        provider: 'openai-file-search'
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('sk-test-key');

      expect(mockLoggerChild.info).toHaveBeenCalledWith('RAG services disabled in settings');
      expect(mockRAGProviderFactoryCreate).not.toHaveBeenCalled();
      expect(instance.ragProvider).toBeNull();
      expect(instance.silenceDetector).toBeNull();
    });

    it('should skip when no OpenAI API key is provided', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search'
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices(null);

      expect(mockLoggerChild.warn).toHaveBeenCalledWith(
        'RAG services require OpenAI API key - skipping initialization'
      );
      expect(instance.ragProvider).toBeNull();
    });

    it('should skip when OpenAI API key is empty string', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search'
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('');

      expect(mockLoggerChild.warn).toHaveBeenCalledWith(
        'RAG services require OpenAI API key - skipping initialization'
      );
    });

    it('should initialize RAG provider successfully', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: 'vs-existing-123',
        campaignId: 'my-campaign',
        silenceThresholdMs: 5000
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('sk-test-key');

      // RAG provider factory called
      expect(mockRAGProviderFactoryCreate).toHaveBeenCalledWith('openai-file-search');

      // Provider initialized with client and vector store
      expect(mockRAGProviderInstance.initialize).toHaveBeenCalledWith({
        client: expect.any(Object),
        vectorStoreId: 'vs-existing-123',
        storeName: 'vox-chronicle-my-campaign'
      });

      // OpenAI client created for RAG
      expect(mockOpenAIClient).toHaveBeenCalledWith('sk-test-key');

      // Vector store ID persisted
      expect(mockSettingsModule.setRAGVectorStoreId).toHaveBeenCalledWith('vs-test-123');

      // Silence detector created
      expect(mockSilenceDetector).toHaveBeenCalledWith({
        thresholdMs: 5000,
        autoRestart: true
      });

      // RAG provider assigned to instance
      expect(instance.ragProvider).toBe(mockRAGProviderInstance);
    });

    it('should use default provider when none specified in settings', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: null,
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('sk-test-key');

      expect(mockRAGProviderFactoryCreate).toHaveBeenCalledWith('openai-file-search');
    });

    it('should use default campaign name when campaignId is null', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('sk-test-key');

      expect(mockRAGProviderInstance.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          storeName: 'vox-chronicle-default'
        })
      );
    });

    it('should connect RAG provider to AIAssistant when available', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      // Simulate aiAssistant already being set
      instance.aiAssistant = mockAIAssistantInstance;

      await instance._initializeRAGServices('sk-test-key');

      expect(mockAIAssistantInstance.setRAGProvider).toHaveBeenCalledWith(mockRAGProviderInstance);
      expect(mockAIAssistantInstance.setSilenceDetector).toHaveBeenCalled();
    });

    it('should not connect RAG provider to AIAssistant when not available', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      instance.aiAssistant = null;

      await instance._initializeRAGServices('sk-test-key');

      expect(mockAIAssistantInstance.setRAGProvider).not.toHaveBeenCalled();
    });

    it('should not persist vector store ID when provider has no getVectorStoreId method', async () => {
      const providerWithoutVSID = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getVectorStoreId: undefined
      };
      mockRAGProviderFactoryCreate.mockReturnValueOnce(providerWithoutVSID);

      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('sk-test-key');

      expect(mockSettingsModule.setRAGVectorStoreId).not.toHaveBeenCalled();
    });

    it('should not persist vector store ID when it returns null', async () => {
      const providerWithNullVSID = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getVectorStoreId: vi.fn().mockReturnValue(null)
      };
      mockRAGProviderFactoryCreate.mockReturnValueOnce(providerWithNullVSID);

      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('sk-test-key');

      expect(mockSettingsModule.setRAGVectorStoreId).not.toHaveBeenCalled();
    });

    it('should handle RAG initialization errors gracefully', async () => {
      mockRAGProviderFactoryCreate.mockImplementationOnce(() => {
        throw new Error('RAG factory broken');
      });

      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search'
      });

      const instance = VoxChronicle.getInstance();
      // Should not throw
      await expect(instance._initializeRAGServices('sk-test-key')).resolves.toBeUndefined();

      expect(mockLoggerChild.error).toHaveBeenCalledWith(
        'Failed to initialize RAG services:',
        expect.any(Error)
      );
    });

    it('should notify user via ui.notifications.warn when RAG init fails (H-5)', async () => {
      mockRAGProviderFactoryCreate.mockImplementationOnce(() => {
        throw new Error('RAG factory broken');
      });

      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search'
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('sk-test-key');

      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining('RAGInitFailed')
      );
    });

    it('should handle RAG provider.initialize() rejection gracefully', async () => {
      const failingProvider = {
        initialize: vi.fn().mockRejectedValue(new Error('Vector store creation failed')),
        getVectorStoreId: vi.fn()
      };
      mockRAGProviderFactoryCreate.mockReturnValueOnce(failingProvider);

      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      await expect(instance._initializeRAGServices('sk-test-key')).resolves.toBeUndefined();

      expect(mockLoggerChild.error).toHaveBeenCalledWith(
        'Failed to initialize RAG services:',
        expect.any(Error)
      );
    });

    it('should log success with vector store ID information', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      await instance._initializeRAGServices('sk-test-key');

      expect(mockLoggerChild.info).toHaveBeenCalledWith(
        'RAG services initialized successfully',
        expect.objectContaining({
          provider: 'openai-file-search',
          vectorStoreId: 'vs-test-123'
        })
      );
    });
  });

  // ====================================================================
  // reinitialize
  // ====================================================================

  describe('reinitialize', () => {
    it('should call teardown steps then initialize', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      // First, initialize to set up services
      await instance.initialize();
      expect(instance.isInitialized).toBe(true);

      // Add mock methods for cleanup verification
      instance.audioRecorder = { cancel: vi.fn() };
      instance.silenceDetector = { stop: vi.fn() };
      instance.sessionOrchestrator = {
        ...mockSessionOrchestratorInstance,
        reset: vi.fn(),
        isSessionActive: false,
        setServices: vi.fn(),
        setTranscriptionConfig: vi.fn(),
        setNarratorServices: vi.fn()
      };

      // Clear mocks to track calls during reinitialize
      vi.clearAllMocks();
      // Re-establish required mock implementations after clearAllMocks
      mockTranscriptionFactoryCreate.mockResolvedValue({ type: 'cloud' });
      mockNarrativeExporter.mockImplementation(() => ({ setOpenAIClient: vi.fn() }));
      mockSettingsModule.getRAGSettings.mockReturnValue({ enabled: false });
      mockSettingsModule.validateServerUrls = vi.fn();

      await instance.reinitialize();

      // Should have cleaned up existing services
      expect(instance.audioRecorder.cancel).toHaveBeenCalled();
      expect(instance.silenceDetector.stop).toHaveBeenCalled();

      // Should have called initialize (re-establishing services)
      expect(instance.isInitialized).toBe(true);
    });

    it('should handle initialization failure gracefully', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      // Set up services with required cleanup methods so reinitialize teardown works
      instance.audioRecorder = { cancel: vi.fn() };
      instance.silenceDetector = { stop: vi.fn() };
      instance.sessionOrchestrator = {
        ...mockSessionOrchestratorInstance,
        isSessionActive: false,
        reset: vi.fn(),
        setServices: vi.fn(),
        setTranscriptionConfig: vi.fn(),
        setNarratorServices: vi.fn()
      };

      // Make Settings.validateServerUrls throw to simulate init failure early
      // (this happens at the very top of initialize(), before any service creation)
      mockSettingsModule.validateServerUrls = vi.fn(() => {
        throw new Error('API unavailable');
      });
      mockSettingsModule.getRAGSettings.mockReturnValue({ enabled: false });

      // reinitialize calls initialize which will throw (we propagate the error)
      await expect(instance.reinitialize()).rejects.toThrow('API unavailable');

      // isInitialized should be false because it was cleared before init attempt
      expect(instance.isInitialized).toBe(false);
    });

    it('should defer reinitialize when a session is active', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      // Simulate an active recording session
      instance.sessionOrchestrator = {
        ...mockSessionOrchestratorInstance,
        isSessionActive: true,
        reset: vi.fn()
      };

      const initSpy = vi.spyOn(instance, 'initialize');

      await instance.reinitialize();

      // Should NOT have called initialize
      expect(initSpy).not.toHaveBeenCalled();
      // Should have flagged pending reinitialize
      expect(instance._reinitializePending).toBe(true);
      // Should still be initialized (old state preserved)
      expect(instance.isInitialized).toBe(true);

      initSpy.mockRestore();
    });

    it('should reset _reinitializePending flag after successful reinitialize', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      // Set pending flag as if a previous reinitialize was deferred
      instance._reinitializePending = true;

      // Set up services with required cleanup methods
      instance.audioRecorder = { cancel: vi.fn() };
      instance.silenceDetector = { stop: vi.fn() };
      instance.sessionOrchestrator = {
        ...mockSessionOrchestratorInstance,
        isSessionActive: false,
        reset: vi.fn(),
        setServices: vi.fn(),
        setTranscriptionConfig: vi.fn(),
        setNarratorServices: vi.fn()
      };

      mockTranscriptionFactoryCreate.mockResolvedValue({ type: 'cloud' });
      mockNarrativeExporter.mockImplementation(() => ({ setOpenAIClient: vi.fn() }));
      mockSettingsModule.getRAGSettings.mockReturnValue({ enabled: false });
      mockSettingsModule.validateServerUrls = vi.fn();

      await instance.reinitialize();

      expect(instance._reinitializePending).toBe(false);
      expect(instance.isInitialized).toBe(true);
    });

    it('should register onSessionEnd callback that triggers reinitialize when pending', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      mockTranscriptionFactoryCreate.mockResolvedValue({ type: 'cloud' });
      mockNarrativeExporter.mockImplementation(() => ({ setOpenAIClient: vi.fn() }));
      mockSettingsModule.getRAGSettings.mockReturnValue({ enabled: false });
      mockSettingsModule.validateServerUrls = vi.fn();

      await instance.initialize();

      // Verify setCallbacks was called with onSessionEnd
      const setCallbacksCalls = instance.sessionOrchestrator.setCallbacks.mock.calls;
      const callWithOnSessionEnd = setCallbacksCalls.find(call => call[0]?.onSessionEnd);
      expect(callWithOnSessionEnd).toBeTruthy();

      // Extract the onSessionEnd callback
      const onSessionEnd = callWithOnSessionEnd[0].onSessionEnd;

      // Set pending flag
      instance._reinitializePending = true;
      const reinitSpy = vi.spyOn(instance, 'reinitialize').mockResolvedValue(undefined);

      // Call the callback — should trigger reinitialize
      onSessionEnd();

      expect(reinitSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      reinitSpy.mockRestore();
    });

    it('should NOT trigger reinitialize on session end when not pending', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();

      mockTranscriptionFactoryCreate.mockResolvedValue({ type: 'cloud' });
      mockNarrativeExporter.mockImplementation(() => ({ setOpenAIClient: vi.fn() }));
      mockSettingsModule.getRAGSettings.mockReturnValue({ enabled: false });
      mockSettingsModule.validateServerUrls = vi.fn();

      await instance.initialize();

      const setCallbacksCalls = instance.sessionOrchestrator.setCallbacks.mock.calls;
      const callWithOnSessionEnd = setCallbacksCalls.find(call => call[0]?.onSessionEnd);
      const onSessionEnd = callWithOnSessionEnd[0].onSessionEnd;

      // _reinitializePending is false (default)
      const reinitSpy = vi.spyOn(instance, 'reinitialize').mockResolvedValue(undefined);

      onSessionEnd();

      expect(reinitSpy).not.toHaveBeenCalled();
      reinitSpy.mockRestore();
    });
  });

  // ====================================================================
  // getServicesStatus
  // ====================================================================

  describe('getServicesStatus', () => {
    it('should return all-false status when not initialized', () => {
      configureSettings({});
      const instance = VoxChronicle.getInstance();

      const status = instance.getServicesStatus();

      expect(status.initialized).toBe(false);
      expect(status.services.audioRecorder).toBe(false);
      expect(status.services.transcription).toBe(false);
      expect(status.services.imageGeneration).toBe(false);
      expect(status.services.kanka).toBe(false);
      expect(status.services.entityExtractor).toBe(false);
      expect(status.services.narrativeExporter).toBe(false);
      expect(status.services.sessionOrchestrator).toBe(false);
      expect(status.services.journalParser).toBe(false);
      expect(status.services.compendiumParser).toBe(false);
      expect(status.services.chapterTracker).toBe(false);
      expect(status.services.sceneDetector).toBe(false);
      expect(status.services.aiAssistant).toBe(false);
      expect(status.services.rulesReference).toBe(false);
      expect(status.services.sessionAnalytics).toBe(false);
      expect(status.services.ragProvider).toBe(false);
      expect(status.services.silenceDetector).toBe(false);
    });

    it('should return correct status after full initialization', async () => {
      configureSettings(fullSettings({
        ragEnabled: true
      }));
      // Ensure RAG gets initialized too
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });

      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      const status = instance.getServicesStatus();

      expect(status.initialized).toBe(true);
      expect(status.services.audioRecorder).toBe(true);
      expect(status.services.transcription).toBe(true);
      expect(status.services.imageGeneration).toBe(true);
      expect(status.services.kanka).toBe(true);
      expect(status.services.entityExtractor).toBe(true);
      expect(status.services.narrativeExporter).toBe(true);
      expect(status.services.sessionOrchestrator).toBe(true);
      expect(status.services.journalParser).toBe(true);
      expect(status.services.compendiumParser).toBe(true);
      expect(status.services.chapterTracker).toBe(true);
      expect(status.services.sceneDetector).toBe(true);
      expect(status.services.aiAssistant).toBe(true);
      expect(status.services.rulesReference).toBe(true);
      expect(status.services.sessionAnalytics).toBe(true);
      expect(status.services.ragProvider).toBe(true);
      expect(status.services.silenceDetector).toBe(true);
    });

    it('should report correct settings status', () => {
      configureSettings({
        openaiApiKey: 'sk-key',
        kankaApiToken: 'kanka-token',
        kankaCampaignId: 'camp-123',
        ragEnabled: true
      });
      const instance = VoxChronicle.getInstance();

      const status = instance.getServicesStatus();

      expect(status.settings.openaiConfigured).toBe(true);
      expect(status.settings.kankaConfigured).toBe(true);
      expect(status.settings.ragEnabled).toBe(true);
    });

    it('should report openaiConfigured as false when no key', () => {
      configureSettings({ openaiApiKey: null });
      const instance = VoxChronicle.getInstance();

      const status = instance.getServicesStatus();
      expect(status.settings.openaiConfigured).toBe(false);
    });

    it('should report kankaConfigured as false when token missing', () => {
      configureSettings({
        kankaApiToken: null,
        kankaCampaignId: 'camp-123'
      });
      const instance = VoxChronicle.getInstance();

      const status = instance.getServicesStatus();
      expect(status.settings.kankaConfigured).toBe(false);
    });

    it('should report kankaConfigured as false when campaign ID missing', () => {
      configureSettings({
        kankaApiToken: 'token',
        kankaCampaignId: null
      });
      const instance = VoxChronicle.getInstance();

      const status = instance.getServicesStatus();
      expect(status.settings.kankaConfigured).toBe(false);
    });

    it('should report ragEnabled as false when setting is falsy', () => {
      configureSettings({ ragEnabled: false });
      const instance = VoxChronicle.getInstance();

      const status = instance.getServicesStatus();
      expect(status.settings.ragEnabled).toBe(false);
    });

    it('should handle _getSetting errors in status check gracefully', () => {
      game.settings.get.mockImplementation(() => {
        throw new Error('boom');
      });
      const instance = VoxChronicle.getInstance();

      const status = instance.getServicesStatus();

      // All settings should show as false/unconfigured
      expect(status.settings.openaiConfigured).toBe(false);
      expect(status.settings.kankaConfigured).toBe(false);
      expect(status.settings.ragEnabled).toBe(false);
    });

    it('should show partial service status after partial initialization', async () => {
      configureSettings(fullSettings({
        openaiApiKey: null,
        kankaApiToken: null,
        kankaCampaignId: null,
        rulesDetection: false
      }));
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      const status = instance.getServicesStatus();

      expect(status.initialized).toBe(true);
      expect(status.services.audioRecorder).toBe(true);
      expect(status.services.sessionOrchestrator).toBe(true);
      expect(status.services.journalParser).toBe(true);
      expect(status.services.compendiumParser).toBe(true);
      expect(status.services.chapterTracker).toBe(true);
      expect(status.services.sceneDetector).toBe(true);
      expect(status.services.sessionAnalytics).toBe(true);

      // These should be false without OpenAI/Kanka config
      expect(status.services.imageGeneration).toBe(false);
      expect(status.services.kanka).toBe(false);
      expect(status.services.entityExtractor).toBe(false);
      expect(status.services.narrativeExporter).toBe(false);
      expect(status.services.aiAssistant).toBe(false);
      expect(status.services.rulesReference).toBe(false);
    });
  });

  // ====================================================================
  // Integration-style tests: full initialization flow
  // ====================================================================

  describe('Full initialization flow', () => {
    it('should handle re-initialization after reset', async () => {
      configureSettings(fullSettings());
      const instance1 = VoxChronicle.getInstance();
      await instance1.initialize();
      expect(instance1.isInitialized).toBe(true);

      VoxChronicle.resetInstance();

      const instance2 = VoxChronicle.getInstance();
      expect(instance2.isInitialized).toBe(false);

      await instance2.initialize();
      expect(instance2.isInitialized).toBe(true);
    });

    it('should call _checkKankaTokenExpiration during initialization', async () => {
      vi.useFakeTimers();
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      const tokenCreatedAt = now - (350 * 24 * 60 * 60 * 1000); // 14 days remaining

      configureSettings(fullSettings({
        kankaApiTokenCreatedAt: tokenCreatedAt
      }));
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      // Should have triggered the CRITICAL notification
      expect(ui.notifications.error).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should call _initializeRAGServices during initialization', async () => {
      mockSettingsModule.getRAGSettings.mockReturnValue({
        enabled: true,
        provider: 'openai-file-search',
        vectorStoreId: null,
        campaignId: null,
        silenceThresholdMs: 3000
      });
      configureSettings(fullSettings({ ragEnabled: true }));
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      expect(mockRAGProviderFactoryCreate).toHaveBeenCalled();
      expect(instance.ragProvider).not.toBeNull();
    });

    it('should work with minimal configuration (all settings null)', async () => {
      configureSettings({});
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      // Should still initialize without throwing
      expect(instance.isInitialized).toBe(true);
      expect(instance.audioRecorder).not.toBeNull();
      expect(instance.sessionOrchestrator).not.toBeNull();
    });

    it('should set echoCancellation false and noiseSuppression false when explicitly set', async () => {
      configureSettings(fullSettings({
        echoCancellation: false,
        noiseSuppression: false
      }));
      const instance = VoxChronicle.getInstance();

      await instance.initialize();

      expect(mockAudioRecorder).toHaveBeenCalledWith({
        echoCancellation: false,
        noiseSuppression: false
      });
    });
  });

  // ====================================================================
  // _registerHooks — updateSetting handler
  // ====================================================================

  describe('_registerHooks (updateSetting handler)', () => {
    /**
     * Helper: initialize an instance then extract the updateSetting callback
     * that was registered via Hooks.on('updateSetting', cb).
     */
    async function initAndGetHookCallback(settingsOverrides = {}) {
      configureSettings(fullSettings(settingsOverrides));
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      // Find the updateSetting callback registered via Hooks.on
      const hookOnCall = Hooks.on.mock.calls.find(
        ([event]) => event === 'updateSetting'
      );
      expect(hookOnCall).toBeDefined();
      const callback = hookOnCall[1];
      return { instance, callback };
    }

    it('should invalidate _cachedSettingsStatus on any module setting change', async () => {
      const { instance, callback } = await initAndGetHookCallback();

      // Pre-populate the cache
      instance._cachedSettingsStatus = { openaiConfigured: true };

      // Fire a non-critical module setting change
      callback({ key: 'vox-chronicle.debugMode' });

      expect(instance._cachedSettingsStatus).toBeNull();
    });

    it('should trigger reinitialize for critical setting openaiApiKey', async () => {
      const { instance, callback } = await initAndGetHookCallback();

      // Spy on reinitialize
      const reinitSpy = vi.spyOn(instance, 'reinitialize').mockResolvedValue(undefined);

      callback({ key: 'vox-chronicle.openaiApiKey' });

      expect(reinitSpy).toHaveBeenCalledTimes(1);
    });

    it('should trigger reinitialize for each critical setting (kankaApiToken, ragEnabled, transcriptionMode)', async () => {
      const criticalSettings = ['kankaApiToken', 'ragEnabled', 'transcriptionMode'];

      for (const settingName of criticalSettings) {
        // Reset for each iteration
        VoxChronicle.resetInstance();
        vi.clearAllMocks();
        // Re-establish mocks cleared by resetInstance
        mockAudioRecorder.mockImplementation(() => ({}));
        mockTranscriptionFactoryCreate.mockResolvedValue({ type: 'cloud' });
        mockImageGenerationService.mockImplementation(() => ({}));
        mockKankaService.mockImplementation(() => ({}));
        mockEntityExtractor.mockImplementation(() => ({}));
        mockNarrativeExporter.mockImplementation(() => ({ setOpenAIClient: vi.fn() }));
        mockSessionOrchestratorInstance.setTranscriptionConfig = vi.fn();
        mockSessionOrchestratorInstance.setNarratorServices = vi.fn();
        mockSessionOrchestrator.mockImplementation(() => mockSessionOrchestratorInstance);
        mockVocabularyDictionary.mockImplementation(() => ({
          initialize: vi.fn().mockResolvedValue(undefined)
        }));
        mockOpenAIClient.mockImplementation(() => ({}));
        mockSilenceDetector.mockImplementation(() => ({}));
        mockSettingsModule.getRAGSettings.mockReturnValue({
          enabled: false, provider: 'openai-file-search', maxResults: 5,
          autoIndex: true, silenceThresholdMs: 3000, vectorStoreId: null,
          campaignId: 'test-campaign'
        });
        mockSettingsModule.setRAGVectorStoreId = vi.fn().mockResolvedValue(undefined);
        mockSettingsModule.validateServerUrls = vi.fn();

        const { instance, callback } = await initAndGetHookCallback();
        const reinitSpy = vi.spyOn(instance, 'reinitialize').mockResolvedValue(undefined);

        callback({ key: `vox-chronicle.${settingName}` });

        expect(reinitSpy).toHaveBeenCalledTimes(1);
      }
    });

    it('should NOT trigger reinitialize for non-critical module settings', async () => {
      const { instance, callback } = await initAndGetHookCallback();
      const reinitSpy = vi.spyOn(instance, 'reinitialize').mockResolvedValue(undefined);

      // Fire a non-critical setting change
      callback({ key: 'vox-chronicle.debugMode' });

      expect(reinitSpy).not.toHaveBeenCalled();
    });

    it('should ignore settings from other modules entirely', async () => {
      const { instance, callback } = await initAndGetHookCallback();

      // Pre-populate cache to verify it is NOT invalidated
      instance._cachedSettingsStatus = { openaiConfigured: true };
      const reinitSpy = vi.spyOn(instance, 'reinitialize').mockResolvedValue(undefined);

      // Fire a setting change from a different module
      callback({ key: 'some-other-module.openaiApiKey' });

      // Cache should remain intact
      expect(instance._cachedSettingsStatus).toEqual({ openaiConfigured: true });
      expect(reinitSpy).not.toHaveBeenCalled();
    });

    it('should catch and log reinitialize errors', async () => {
      const { instance, callback } = await initAndGetHookCallback();

      const testError = new Error('Reinit boom');
      vi.spyOn(instance, 'reinitialize').mockRejectedValue(testError);

      // Fire a critical setting change — the .catch() handler should swallow the error
      callback({ key: 'vox-chronicle.openaiApiKey' });

      // Wait for the microtask (promise rejection handler) to execute
      await vi.waitFor(() => {
        expect(mockLoggerChild.error).toHaveBeenCalledWith(
          expect.stringContaining('openaiApiKey'),
          testError
        );
      });
    });

    it('should trigger reinitialize for a non-critical setting when _reinitializePending is true', async () => {
      const { instance, callback } = await initAndGetHookCallback();

      // Simulate deferred reinitialize (e.g. setting changed during active session)
      instance._reinitializePending = true;
      const reinitSpy = vi.spyOn(instance, 'reinitialize').mockResolvedValue(undefined);

      // Fire a non-critical setting change — should still reinit due to pending flag
      callback({ key: 'vox-chronicle.debugMode' });

      expect(reinitSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ====================================================================
  // _getCachedSettingsStatus — caching behavior
  // ====================================================================

  describe('_getCachedSettingsStatus (caching)', () => {
    it('should reuse cached value on consecutive calls', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      // First call populates cache
      const result1 = instance._getCachedSettingsStatus();
      // Record how many times game.settings.get was called
      const callCountAfterFirst = game.settings.get.mock.calls.length;

      // Second call should reuse cache — no additional game.settings.get calls
      const result2 = instance._getCachedSettingsStatus();
      const callCountAfterSecond = game.settings.get.mock.calls.length;

      expect(result1).toBe(result2); // Same object reference (cached)
      expect(callCountAfterSecond).toBe(callCountAfterFirst);
    });

    it('should rebuild cache after _cachedSettingsStatus is set to null', async () => {
      configureSettings(fullSettings());
      const instance = VoxChronicle.getInstance();
      await instance.initialize();

      // Populate cache
      const result1 = instance._getCachedSettingsStatus();
      expect(result1).toBeDefined();

      // Invalidate cache
      instance._cachedSettingsStatus = null;

      // Next call rebuilds the cache — returns a new object
      const result2 = instance._getCachedSettingsStatus();
      expect(result2).not.toBe(result1); // New object, not same reference
      expect(result2).toEqual(result1);  // But with same content
    });
  });
});
