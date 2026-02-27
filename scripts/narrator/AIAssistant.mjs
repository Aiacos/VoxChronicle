/**
 * AIAssistant - AI-Powered Contextual Suggestions for VoxChronicle
 *
 * Ported from Narrator Master's ai-assistant.js.
 * Provides contextual analysis of game transcriptions, off-track detection,
 * NPC dialogue generation, and suggestion generation using OpenAI GPT-4o-mini.
 *
 * Uses composition with OpenAIClient (not inheritance from OpenAIServiceBase).
 *
 * @class AIAssistant
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { MODULE_ID } from '../constants.mjs';
import { SilenceMonitor } from './SilenceMonitor.mjs';

/**
 * Default model for cost-effective suggestions
 * @constant {string}
 */
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Maximum context tokens to avoid excessive API costs
 * @constant {number}
 */
const MAX_CONTEXT_TOKENS = 8000;

/**
 * Represents a contextual suggestion for the DM
 * @typedef {Object} Suggestion
 * @property {string} type - Type of suggestion ('narration', 'dialogue', 'action', 'reference')
 * @property {string} content - The suggestion text
 * @property {string} [pageReference] - Reference to journal page if applicable
 * @property {number} confidence - Confidence score 0-1
 */

/**
 * Represents the result of off-track detection
 * @typedef {Object} OffTrackResult
 * @property {boolean} isOffTrack - Whether players are off-track
 * @property {number} severity - Severity level 0-1 (0 = on track, 1 = completely off)
 * @property {string} reason - Explanation of why they're off-track
 * @property {string} [narrativeBridge] - Suggested content to bring them back
 */

/**
 * Represents a detected rules question
 * @typedef {Object} RulesQuestion
 * @property {string} text - The question text or matched phrase
 * @property {number} confidence - Confidence score 0-1
 * @property {string} type - Question type ('mechanic', 'action', 'spell', 'condition', 'general', etc.)
 * @property {string} [extractedTopic] - Extracted topic from the question
 * @property {string[]} detectedTerms - Array of detected D&D mechanic terms
 */

/**
 * Represents the context analysis result
 * @typedef {Object} ContextAnalysis
 * @property {Suggestion[]} suggestions - Array of contextual suggestions
 * @property {OffTrackResult} offTrackStatus - Off-track detection result
 * @property {string[]} relevantPages - IDs of relevant journal pages
 * @property {string} summary - Brief summary of current situation
 * @property {Object} sceneInfo - Scene detection information
 * @property {string} sceneInfo.type - The current scene type
 * @property {boolean} sceneInfo.isTransition - Whether a scene transition was detected
 * @property {number} sceneInfo.timestamp - Timestamp of the analysis
 * @property {RulesQuestion[]} rulesQuestions - Array of detected rules questions
 */

/**
 * Represents a chapter recovery option for silence scenarios
 * @typedef {Object} ChapterRecoveryOption
 * @property {string} id - Unique identifier for the option
 * @property {string} label - Display label for the option
 * @property {string} type - Type of option ('subsection', 'page', 'summary')
 * @property {string} [pageId] - Associated page ID if type is 'page'
 * @property {string} [journalName] - Parent journal name if type is 'page'
 * @property {string} description - Brief description or context for this option
 */

/**
 * AIAssistant class - Handles AI-powered suggestions and off-track detection
 *
 * Uses composition with OpenAIClient for API calls rather than inheritance.
 *
 * @example
 * const assistant = new AIAssistant({ openaiClient });
 * assistant.setAdventureContext(journalContent);
 * const analysis = await assistant.analyzeContext('The players enter the tavern...');
 */
class AIAssistant {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('AIAssistant');

  /**
   * Consecutive RAG context retrieval failures counter
   * @type {number}
   * @private
   */
  _consecutiveRAGFailures = 0;

  /**
   * Creates a new AIAssistant instance
   *
   * @param {Object} [options={}] - Configuration options
   * @param {import('../ai/OpenAIClient.mjs').OpenAIClient} options.openaiClient - OpenAI client instance
   * @param {string} [options.model='gpt-4o-mini'] - The model to use for suggestions
   * @param {string} [options.sensitivity='medium'] - Off-track detection sensitivity ('low', 'medium', 'high')
   * @param {string} [options.primaryLanguage='it'] - Primary language code for AI responses
   */
  constructor(options = {}) {
    /**
     * OpenAI client instance (composition)
     * @type {import('../ai/OpenAIClient.mjs').OpenAIClient}
     * @private
     */
    this._openaiClient = options.openaiClient || null;

    /**
     * Model to use for chat completions
     * @type {string}
     * @private
     */
    this._model = options.model || DEFAULT_MODEL;

    /**
     * Off-track detection sensitivity (low, medium, high)
     * @type {string}
     * @private
     */
    this._sensitivity = options.sensitivity || 'medium';

    /**
     * Cached adventure context from journal
     * @type {string}
     * @private
     */
    this._adventureContext = '';

    /**
     * Recent conversation history for context
     * @type {Array<{role: string, content: string}>}
     * @private
     */
    this._conversationHistory = [];

    /**
     * Maximum conversation history entries to keep
     * @type {number}
     * @private
     */
    this._maxHistorySize = 20;

    /**
     * Current session state tracking
     * @type {Object}
     * @private
     */
    this._sessionState = {
      currentScene: null,
      lastOffTrackCheck: null,
      suggestionsCount: 0
    };

    /**
     * Primary/detected language for AI responses
     * @type {string}
     * @private
     */
    this._primaryLanguage = options.primaryLanguage || 'en';

    /**
     * Previous transcription text for scene comparison
     * @type {string}
     * @private
     */
    this._previousTranscription = '';

    /**
     * Current chapter/scene context for focused analysis
     * @type {Object|null}
     * @private
     */
    this._chapterContext = null;

    /**
     * RAGProvider instance for context-aware retrieval
     * @type {import('../rag/RAGProvider.mjs').RAGProvider|null}
     * @private
     */
    this._ragProvider = options.ragProvider || null;

    /**
     * Whether to use RAG for context retrieval (vs. truncated full-text)
     * @type {boolean}
     * @private
     */
    this._useRAG = options.useRAG !== false;

    /**
     * Maximum results to retrieve from RAG
     * @type {number}
     * @private
     */
    this._ragMaxResults = options.ragMaxResults || 5;

    /**
     * Cached RAG context from last retrieval
     * @type {{context: string, sources: string[]}|null}
     * @private
     */
    this._cachedRAGContext = null;

    /**
     * SilenceMonitor — handles silence detection and autonomous suggestion triggers
     * @type {SilenceMonitor}
     * @private
     */
    this._silenceMonitor = new SilenceMonitor();
    this._silenceMonitor.setGenerateSuggestionFn(() => this._generateAutonomousSuggestion());

    // Apply constructor options for silence-related configuration
    if (options.silenceDetector) {
      this._silenceMonitor.setSilenceDetector(options.silenceDetector);
    }
    if (options.onAutonomousSuggestion) {
      this._silenceMonitor.setOnAutonomousSuggestionCallback(options.onAutonomousSuggestion);
    }
  }

  // ---------------------------------------------------------------------------
  // Configuration methods
  // ---------------------------------------------------------------------------

  /**
   * Check if the assistant is properly configured with an OpenAI client
   *
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return Boolean(this._openaiClient && this._openaiClient.isConfigured);
  }

  /**
   * Sets the OpenAI client instance
   *
   * @param {import('../ai/OpenAIClient.mjs').OpenAIClient} client - OpenAI client
   */
  setOpenAIClient(client) {
    this._openaiClient = client;
  }

  /**
   * Sets the RAGProvider instance for context-aware retrieval
   *
   * @param {import('../rag/RAGProvider.mjs').RAGProvider} ragProvider - RAGProvider instance
   */
  setRAGProvider(ragProvider) {
    this._ragProvider = ragProvider;
    this._cachedRAGContext = null;
    this._logger.debug('RAGProvider updated');
  }

  /**
   * Gets the RAGProvider instance
   *
   * @returns {import('../rag/RAGProvider.mjs').RAGProvider|null} The RAGProvider instance or null
   */
  getRAGProvider() {
    return this._ragProvider;
  }

  /**
   * Check if RAG retrieval is available and configured
   *
   * @returns {boolean} True if RAG can be used for context retrieval
   */
  isRAGConfigured() {
    return Boolean(this._useRAG && this._ragProvider);
  }

  /**
   * Enables or disables RAG usage
   *
   * @param {boolean} enabled - Whether to use RAG for context retrieval
   */
  setUseRAG(enabled) {
    this._useRAG = Boolean(enabled);
  }

  /**
   * Gets whether RAG usage is enabled
   *
   * @returns {boolean} True if RAG usage is enabled
   */
  getUseRAG() {
    return this._useRAG;
  }

  // ---------------------------------------------------------------------------
  // Silence detection integration (delegated to SilenceMonitor)
  // ---------------------------------------------------------------------------

  /**
   * Sets the SilenceDetector instance for autonomous suggestion triggers
   *
   * @param {import('./SilenceDetector.mjs').SilenceDetector} silenceDetector - SilenceDetector instance
   */
  setSilenceDetector(silenceDetector) {
    this._silenceMonitor.setSilenceDetector(silenceDetector);
  }

  /**
   * Gets the SilenceDetector instance
   *
   * @returns {import('./SilenceDetector.mjs').SilenceDetector|null} The SilenceDetector instance or null
   */
  getSilenceDetector() {
    return this._silenceMonitor.getSilenceDetector();
  }

  /**
   * Sets the callback function for autonomous suggestions triggered by silence
   *
   * @param {function} callback - Callback function receiving { suggestion: Suggestion, silenceEvent: SilenceEvent }
   */
  setOnAutonomousSuggestionCallback(callback) {
    this._silenceMonitor.setOnAutonomousSuggestionCallback(callback);
  }

  /**
   * Gets the autonomous suggestion callback
   *
   * @returns {function|null} The callback function or null
   */
  getOnAutonomousSuggestionCallback() {
    return this._silenceMonitor.getOnAutonomousSuggestionCallback();
  }

  /**
   * Starts silence monitoring for autonomous suggestion triggers
   *
   * Requires both a SilenceDetector and OpenAI client to be configured.
   * When silence is detected, generates a contextual suggestion using current
   * chapter context and RAG retrieval.
   *
   * @returns {boolean} True if monitoring started successfully, false otherwise
   */
  startSilenceMonitoring() {
    if (!this.isConfigured()) {
      this._logger.warn('Cannot start silence monitoring: OpenAI client not configured');
      return false;
    }

    return this._silenceMonitor.startMonitoring();
  }

  /**
   * Stops silence monitoring
   */
  stopSilenceMonitoring() {
    this._silenceMonitor.stopMonitoring();
  }

  /**
   * Records activity to reset the silence timer
   *
   * Call this when transcription is received to prevent silence-triggered suggestions.
   *
   * @returns {boolean} True if activity was recorded, false if monitoring not active
   */
  recordActivityForSilenceDetection() {
    return this._silenceMonitor.recordActivity();
  }

  /**
   * Checks if silence monitoring is currently active
   *
   * @returns {boolean} True if monitoring is active
   */
  isSilenceMonitoringActive() {
    return this._silenceMonitor.isMonitoring;
  }

  /**
   * Sets the model to use for suggestions
   *
   * @param {string} model - The model name
   */
  setModel(model) {
    this._model = model || DEFAULT_MODEL;
  }

  /**
   * Gets the current model
   *
   * @returns {string} The model name
   */
  getModel() {
    return this._model;
  }

  /**
   * Sets the off-track detection sensitivity
   *
   * @param {string} sensitivity - 'low', 'medium', or 'high'
   */
  setSensitivity(sensitivity) {
    if (['low', 'medium', 'high'].includes(sensitivity)) {
      this._sensitivity = sensitivity;
    }
  }

  /**
   * Gets the current sensitivity setting
   *
   * @returns {string} The sensitivity level
   */
  getSensitivity() {
    return this._sensitivity;
  }

  /**
   * Sets the adventure context from parsed journal content
   *
   * @param {string} context - The adventure content text
   */
  setAdventureContext(context) {
    this._adventureContext = context || '';
  }

  /**
   * Gets the current adventure context
   *
   * @returns {string} The adventure context
   */
  getAdventureContext() {
    return this._adventureContext;
  }

  /**
   * Sets the primary language for AI responses
   *
   * @param {string} language - The language code (e.g., 'it', 'en', 'de')
   */
  setPrimaryLanguage(language) {
    this._primaryLanguage = language || 'it';
  }

  /**
   * Gets the current primary language
   *
   * @returns {string} The language code
   */
  getPrimaryLanguage() {
    return this._primaryLanguage;
  }

  // ---------------------------------------------------------------------------
  // Chapter context management
  // ---------------------------------------------------------------------------

  /**
   * Sets the current chapter/scene context for focused analysis
   *
   * @param {Object|null} chapterInfo - The chapter context information
   * @param {string} [chapterInfo.chapterName] - Name of the current chapter
   * @param {string[]} [chapterInfo.subsections] - Array of subsection names
   * @param {Object[]} [chapterInfo.pageReferences] - Array of page reference objects
   * @param {string} [chapterInfo.pageReferences[].pageId] - The page ID
   * @param {string} [chapterInfo.pageReferences[].pageName] - The page name
   * @param {string} [chapterInfo.pageReferences[].journalName] - The parent journal name
   * @param {string} [chapterInfo.summary] - Brief summary of the chapter content
   */
  setChapterContext(chapterInfo) {
    if (chapterInfo === null || chapterInfo === undefined) {
      this._chapterContext = null;
      return;
    }

    this._chapterContext = {
      chapterName: this._validateString(chapterInfo.chapterName || '', 200, 'chapterContext.chapterName'),
      subsections: this._validateArray(chapterInfo.subsections || [], 50, 'chapterContext.subsections')
        .map(s => this._validateString(s, 200, 'chapterContext.subsection')),
      pageReferences: this._validateArray(chapterInfo.pageReferences || [], 50, 'chapterContext.pageReferences')
        .map(ref => ({
          pageId: this._validateString(ref.pageId || '', 100, 'pageReference.pageId'),
          pageName: this._validateString(ref.pageName || '', 200, 'pageReference.pageName'),
          journalName: this._validateString(ref.journalName || '', 200, 'pageReference.journalName')
        })),
      summary: this._validateString(chapterInfo.summary || '', 2000, 'chapterContext.summary')
    };
  }

  /**
   * Gets the current chapter context
   *
   * @returns {Object|null} The chapter context or null if not set
   */
  getChapterContext() {
    return this._chapterContext;
  }

  /**
   * Formats the chapter context for inclusion in AI prompts
   *
   * @returns {string} Formatted chapter context string or empty string if not set
   * @private
   */
  _formatChapterContext() {
    if (!this._chapterContext) {
      return '';
    }

    const parts = [];

    if (this._chapterContext.chapterName) {
      parts.push(`CURRENT CHAPTER: ${this._chapterContext.chapterName}`);
    }

    if (this._chapterContext.subsections && this._chapterContext.subsections.length > 0) {
      parts.push(`SECTIONS: ${this._chapterContext.subsections.join(', ')}`);
    }

    if (this._chapterContext.pageReferences && this._chapterContext.pageReferences.length > 0) {
      const refs = this._chapterContext.pageReferences
        .filter(ref => ref.pageName)
        .map(ref => {
          if (ref.journalName) {
            return `"${ref.pageName}" (${ref.journalName})`;
          }
          return `"${ref.pageName}"`;
        });
      if (refs.length > 0) {
        parts.push(`REFERENCE PAGES: ${refs.join(', ')}`);
      }
    }

    if (this._chapterContext.summary) {
      parts.push(`SUMMARY: ${this._chapterContext.summary}`);
    }

    return parts.join('\n');
  }

  /**
   * Generates clickable sub-chapter recovery options for silence scenarios
   *
   * When players are silent or stuck, this method provides quick navigation
   * options based on the current chapter's structure.
   *
   * @param {Object} currentChapter - The current chapter context
   * @param {string} [currentChapter.chapterName] - Name of the current chapter
   * @param {string[]} [currentChapter.subsections] - Array of subsection names
   * @param {Object[]} [currentChapter.pageReferences] - Array of page references
   * @param {string} [currentChapter.summary] - Brief summary of the chapter
   * @returns {ChapterRecoveryOption[]} Array of recovery options for UI display
   */
  generateChapterRecoveryOptions(currentChapter) {
    const options = [];

    if (!currentChapter || typeof currentChapter !== 'object') {
      this._logger.warn('No chapter context provided for recovery options');
      return options;
    }

    const chapterName = this._validateString(currentChapter.chapterName || '', 200, 'recovery.chapterName');

    // Add subsection options
    const subsections = this._validateArray(currentChapter.subsections || [], 50, 'recovery.subsections');
    for (let i = 0; i < subsections.length; i++) {
      const subsectionName = this._validateString(subsections[i] || '', 200, 'recovery.subsection');
      if (subsectionName) {
        options.push({
          id: `subsection-${i}`,
          label: subsectionName,
          type: 'subsection',
          description: chapterName
            ? `Subsection of ${chapterName}`
            : 'Subsection'
        });
      }
    }

    // Add page reference options
    const pageReferences = this._validateArray(currentChapter.pageReferences || [], 50, 'recovery.pageReferences');
    for (let i = 0; i < pageReferences.length; i++) {
      const ref = pageReferences[i];
      if (!ref || typeof ref !== 'object') {
        continue;
      }

      const pageName = this._validateString(ref.pageName || '', 200, 'recovery.pageName');
      const pageId = this._validateString(ref.pageId || '', 100, 'recovery.pageId');
      const journalName = this._validateString(ref.journalName || '', 200, 'recovery.journalName');

      if (pageName) {
        options.push({
          id: `page-${pageId || i}`,
          label: pageName,
          type: 'page',
          pageId: pageId || undefined,
          journalName: journalName || undefined,
          description: journalName
            ? `Page in ${journalName}`
            : 'Page'
        });
      }
    }

    // Add summary option if available and there are other options
    const summary = this._validateString(currentChapter.summary || '', 2000, 'recovery.summary');
    if (summary && options.length > 0) {
      options.unshift({
        id: 'summary',
        label: chapterName || 'Chapter Summary',
        type: 'summary',
        description: summary.length > 100 ? summary.substring(0, 100) + '...' : summary
      });
    }

    this._logger.debug(`Generated ${options.length} chapter recovery options`);

    return options;
  }

  // ---------------------------------------------------------------------------
  // Core analysis methods
  // ---------------------------------------------------------------------------

  /**
   * Analyzes the current game context and generates suggestions
   *
   * @param {string} transcription - Recent transcribed conversation
   * @param {Object} [options={}] - Analysis options
   * @param {boolean} [options.includeSuggestions=true] - Generate suggestions
   * @param {boolean} [options.checkOffTrack=true] - Check if off-track
   * @param {boolean} [options.detectRules=true] - Detect rules questions
   * @returns {Promise<ContextAnalysis>} The analysis result
   * @throws {Error} If not configured or no transcription provided
   */
  async analyzeContext(transcription, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('AIAssistant: OpenAI client not configured');
    }

    if (!transcription || typeof transcription !== 'string') {
      throw new Error('AIAssistant: No transcription provided');
    }

    const includeSuggestions = options.includeSuggestions !== false;
    const checkOffTrack = options.checkOffTrack !== false;
    const detectRules = options.detectRules !== false;

    this._logger.debug(`analyzeContext() entry — transcription length: ${transcription.length}, suggestions=${includeSuggestions}, offTrack=${checkOffTrack}, rules=${detectRules}`);
    const _analyzeStart = performance.now();

    // Detect rules questions if enabled
    let rulesDetection = null;
    if (detectRules) {
      rulesDetection = this._detectRulesQuestions(transcription);
      if (rulesDetection.hasRulesQuestions) {
        this._logger.debug(`Detected ${rulesDetection.questions.length} rules question(s)`);
      }
    }

    try {
      // Retrieve RAG context if available
      const ragContext = await this._fetchRAGContextFor(transcription, 'analysis');

      const messages = this._buildAnalysisMessages(transcription, includeSuggestions, checkOffTrack, ragContext);
      const response = await this._makeChatRequest(messages);
      const analysis = this._parseAnalysisResponse(response);

      // Add rules questions to analysis if detected
      analysis.rulesQuestions = rulesDetection?.questions || [];

      // Update conversation history
      this._addToConversationHistory('user', transcription);
      this._addToConversationHistory('assistant', JSON.stringify(analysis));

      this._sessionState.suggestionsCount++;
      this._previousTranscription = transcription;

      this._logger.debug(`analyzeContext() exit — ${analysis.suggestions.length} suggestions, ${analysis.rulesQuestions.length} rules questions, ${(performance.now() - _analyzeStart).toFixed(1)}ms`);

      return {
        ...analysis,
        sceneInfo: {
          type: 'unknown',
          isTransition: false,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      this._logger.error(`analyzeContext() failed after ${(performance.now() - _analyzeStart).toFixed(1)}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Detects if the players are off-track from the adventure
   *
   * @param {string} transcription - Recent transcribed conversation
   * @returns {Promise<OffTrackResult>} The off-track detection result
   * @throws {Error} If not configured
   */
  async detectOffTrack(transcription) {
    if (!this.isConfigured()) {
      throw new Error('AIAssistant: OpenAI client not configured');
    }

    // Check if we have context (either adventure context or RAG)
    if (!this._adventureContext && !this.isRAGConfigured()) {
      this._logger.warn('No adventure context set and RAG not available, skipping off-track detection');
      return {
        isOffTrack: false,
        severity: 0,
        reason: 'No adventure context available for comparison'
      };
    }

    this._logger.debug(`detectOffTrack() entry — transcription length: ${transcription.length}`);
    const _offTrackStart = performance.now();

    try {
      // Retrieve RAG context if available
      const ragContext = await this._fetchRAGContextFor(transcription, 'off-track');

      const messages = this._buildOffTrackMessages(transcription, ragContext);
      const response = await this._makeChatRequest(messages);
      const result = this._parseOffTrackResponse(response);

      this._sessionState.lastOffTrackCheck = new Date();

      this._logger.debug(`detectOffTrack() exit — isOffTrack=${result.isOffTrack}, severity=${result.severity}, ${(performance.now() - _offTrackStart).toFixed(1)}ms`);
      return result;
    } catch (error) {
      this._logger.error(`detectOffTrack() failed after ${(performance.now() - _offTrackStart).toFixed(1)}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Generates contextual suggestions for the DM
   *
   * @param {string} transcription - Recent transcribed conversation
   * @param {Object} [options={}] - Generation options
   * @param {number} [options.maxSuggestions=3] - Maximum suggestions to generate
   * @returns {Promise<Suggestion[]>} Array of suggestions
   * @throws {Error} If not configured
   */
  async generateSuggestions(transcription, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('AIAssistant: OpenAI client not configured');
    }

    const maxSuggestions = options.maxSuggestions || 3;

    this._logger.debug(`generateSuggestions() entry — transcription length: ${transcription.length}, maxSuggestions=${maxSuggestions}`);
    const _suggestStart = performance.now();

    try {
      // Retrieve RAG context if available
      const ragContext = await this._fetchRAGContextFor(transcription, 'suggestions');

      const messages = this._buildSuggestionMessages(transcription, maxSuggestions, ragContext);
      const response = await this._makeChatRequest(messages);
      const suggestions = this._parseSuggestionsResponse(response, maxSuggestions);

      this._logger.debug(`generateSuggestions() exit — ${suggestions.length} suggestions, types=[${suggestions.map(s => s.type).join(',')}], ${(performance.now() - _suggestStart).toFixed(1)}ms`);
      return suggestions;
    } catch (error) {
      this._logger.error(`generateSuggestions() failed after ${(performance.now() - _suggestStart).toFixed(1)}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Generates a narrative bridge to guide players back on track
   *
   * @param {string} currentSituation - Description of current off-track situation
   * @param {string} targetScene - The intended scene/situation to return to
   * @returns {Promise<string>} The narrative bridge text
   * @throws {Error} If not configured
   */
  async generateNarrativeBridge(currentSituation, targetScene) {
    if (!this.isConfigured()) {
      throw new Error('AIAssistant: OpenAI client not configured');
    }

    this._logger.debug(`generateNarrativeBridge() entry — situation length: ${currentSituation.length}, target length: ${targetScene.length}`);
    const _bridgeStart = performance.now();

    try {
      // Retrieve RAG context if available, using both situation and target as query
      const ragContext = await this._fetchRAGContextFor(`${currentSituation} ${targetScene}`, 'narrative bridge');

      const messages = this._buildNarrativeBridgeMessages(currentSituation, targetScene, ragContext);
      const response = await this._makeChatRequest(messages);
      const content = response.choices?.[0]?.message?.content || '';
      const result = content.trim();

      this._logger.debug(`generateNarrativeBridge() exit — result length: ${result.length}, ${(performance.now() - _bridgeStart).toFixed(1)}ms`);
      return result;
    } catch (error) {
      this._logger.error(`generateNarrativeBridge() failed after ${(performance.now() - _bridgeStart).toFixed(1)}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Generates dialogue options for a specific NPC
   *
   * @param {string} npcName - The name of the NPC
   * @param {string} npcContext - NPC personality and backstory from journal
   * @param {string} transcription - Current conversation context
   * @param {Object} [options={}] - Generation options
   * @param {number} [options.maxOptions=3] - Maximum dialogue options to generate
   * @returns {Promise<string[]>} Array of dialogue strings
   * @throws {Error} If not configured or no NPC name provided
   */
  async generateNPCDialogue(npcName, npcContext, transcription, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('AIAssistant: OpenAI client not configured');
    }

    if (!npcName || typeof npcName !== 'string') {
      throw new Error('AIAssistant: NPC name is required');
    }

    const maxOptions = options.maxOptions || 3;

    this._logger.debug(`generateNPCDialogue() entry — npc="${npcName}", context length: ${(npcContext || '').length}, maxOptions=${maxOptions}`);
    const _npcStart = performance.now();

    try {
      const messages = this._buildNPCDialogueMessages(npcName, npcContext, transcription, maxOptions);
      const response = await this._makeChatRequest(messages);
      const dialogueOptions = this._parseNPCDialogueResponse(response, maxOptions);

      this._logger.debug(`generateNPCDialogue() exit — ${dialogueOptions.length} dialogue options for "${npcName}", ${(performance.now() - _npcStart).toFixed(1)}ms`);
      return dialogueOptions;
    } catch (error) {
      this._logger.error(`generateNPCDialogue() failed for "${npcName}" after ${(performance.now() - _npcStart).toFixed(1)}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Detects which NPCs from a known list are mentioned in the transcription
   *
   * @param {string} transcription - The transcription text to analyze
   * @param {Array<{name: string}>} npcList - Array of NPC objects with at least a name property
   * @returns {string[]} Array of NPC names mentioned in the transcription
   */
  detectNPCMentions(transcription, npcList) {
    if (!transcription || typeof transcription !== 'string') {
      this._logger.warn('Invalid transcription provided to detectNPCMentions');
      return [];
    }

    if (!Array.isArray(npcList) || npcList.length === 0) {
      this._logger.warn('No NPCs provided to detectNPCMentions');
      return [];
    }

    this._logger.debug(`Detecting NPC mentions in transcription (${npcList.length} NPCs to check)`);

    const mentionedNPCs = [];

    for (const npc of npcList) {
      if (!npc || !npc.name) {
        continue;
      }

      const npcName = npc.name.trim();
      if (!npcName) {
        continue;
      }

      const pattern = new RegExp(`\\b${this._escapeRegex(npcName)}\\b`, 'i');
      if (pattern.test(transcription)) {
        mentionedNPCs.push(npcName);
      }
    }

    this._logger.debug(`Found ${mentionedNPCs.length} NPC mentions: ${mentionedNPCs.join(', ')}`);

    return mentionedNPCs;
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  /**
   * Resets the session state
   */
  resetSession() {
    this._logger.debug('resetSession() — clearing conversation history, session state, and RAG cache');

    // Stop silence monitoring if active
    this._silenceMonitor.stopMonitoring();

    this._conversationHistory = [];
    this._sessionState = {
      currentScene: null,
      lastOffTrackCheck: null,
      suggestionsCount: 0
    };
    this._previousTranscription = '';
    this._cachedRAGContext = null;
  }

  /**
   * Gets service statistics
   *
   * @returns {Object} Statistics about the service usage
   */
  getStats() {
    return {
      model: this._model,
      sensitivity: this._sensitivity,
      primaryLanguage: this._primaryLanguage,
      hasContext: Boolean(this._adventureContext),
      contextLength: this._adventureContext.length,
      conversationHistorySize: this._conversationHistory.length,
      suggestionsGenerated: this._sessionState.suggestionsCount,
      lastOffTrackCheck: this._sessionState.lastOffTrackCheck,
      isConfigured: this.isConfigured(),
      // RAG-related stats
      ragConfigured: this.isRAGConfigured(),
      ragEnabled: this._useRAG,
      ragMaxResults: this._ragMaxResults,
      ragHasCachedContext: Boolean(this._cachedRAGContext && this._cachedRAGContext.context),
      ragCachedSourceCount: this._cachedRAGContext?.sources?.length || 0,
      // Silence detection stats (delegated to SilenceMonitor)
      silenceDetectorConfigured: Boolean(this._silenceMonitor.getSilenceDetector()),
      silenceMonitoringActive: this._silenceMonitor.isMonitoring,
      silenceSuggestionCount: this._silenceMonitor.silenceSuggestionCount,
      hasAutonomousSuggestionCallback: Boolean(this._silenceMonitor.getOnAutonomousSuggestionCallback())
    };
  }

  // ---------------------------------------------------------------------------
  // Private: API communication
  // ---------------------------------------------------------------------------

  /**
   * Makes a chat completion request via the OpenAI client
   *
   * @param {Array<{role: string, content: string}>} messages - Chat messages
   * @returns {Promise<Object>} The API response
   * @private
   */
  async _makeChatRequest(messages) {
    this._logger.debug(`_makeChatRequest() — model=${this._model}, ${messages.length} messages`);
    const _chatStart = performance.now();

    const response = await this._openaiClient.post('/chat/completions', {
      model: this._model,
      messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    this._logger.debug(`_makeChatRequest() — completed in ${(performance.now() - _chatStart).toFixed(1)}ms`);
    return response;
  }

  // ---------------------------------------------------------------------------
  // Private: Message builders
  // ---------------------------------------------------------------------------

  /**
   * Builds the system prompt for the AI assistant
   *
   * @returns {string} The system prompt
   * @private
   */
  _buildSystemPrompt() {
    const chapterContext = this._formatChapterContext();

    const sensitivityGuide = {
      low: 'Be tolerant of minor deviations, only flag when players completely leave the story.',
      medium: 'Balance tolerance for improvisation with adherence to the main plot.',
      high: 'Closely monitor every deviation from the plot and flag even minor variations.'
    };

    const languageNames = {
      it: 'Italian',
      en: 'English',
      de: 'German',
      fr: 'French',
      es: 'Spanish',
      pt: 'Portuguese',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese'
    };

    const responseLang = languageNames[this._primaryLanguage] || languageNames['en'];

    const chapterSection = chapterContext
      ? `\n\nCURRENT CHAPTER/SCENE CONTEXT:\n${chapterContext}`
      : '';

    return `You are an expert assistant for Dungeon Masters (GMs) in fantasy tabletop RPGs.
Your SOLE purpose is to help the GM during game sessions.

## FUNDAMENTAL RULES (ANTI-HALLUCINATION)

1. **USE ONLY PROVIDED MATERIAL**: Base ALL your answers exclusively on the Journal/Compendium content provided in the context. Do NOT invent details, NPCs, locations, events, or information not present in the material.

2. **ALWAYS CITE SOURCES**: Every suggestion MUST include a reference to the journal page/section the information comes from (e.g., "[Source: Chapter 2 - The Tavern]").

3. **ADMIT WHEN YOU DON'T KNOW**: If information is not present in the provided material, respond explicitly: "Information not found in adventure material".

4. **DO NOT FILL IN WITH ASSUMPTIONS**: If the material is incomplete or vague, do NOT fill gaps with invented content. Flag what is missing instead.

## YOUR TASK

You are a **Navigator and Oracle** for the Dungeon Master. You will receive a transcription where each line starts with the speaker's name (e.g., "DM: ...", "Marco: ...").

1.  **Contextual Deduction**: 
    *   **DM Input**: Treat the words of the DM as absolute truth. When the DM describes a location or NPC, immediately retrieve those specific details from the Journal.
    *   **Player Input**: Treat player words as intent or questions. Identify what they are looking for or interacting with.
2.  **Guidance from Material**: Suggest only what is explicitly written in the material. If the players are talking to NPC "X", show the DM "X's" motivations, secrets, or the next dialogue prompt provided in the Journal.
3.  **Pathfinding**: If the players are lost or off-track, identify the closest logical "hook" present in the adventure material to bring them back to the intended path.
4.  **No Invention**: DO NOT create new lore, NPCs, or plot twists. Your goal is to make the DM's life easier by retrieving the right information at the right time.

## RESPONSE FORMAT

- Respond in the same language as the transcription (${responseLang}).
- **Direct Citation**: Always start suggestions with "[Journal: Page Name]".
- **Deduction Rule**: "Since [Speaker] mentioned [Element], the current scene matches [Journal Section]. The material suggests [Action/Event]."

## IMPORTANT

- You are a retrieval and mapping engine.
- If the players do something not covered by the material, provide the DM with the most relevant "General Themes" or "NPC Goals" from the manual to help them improvise *consistently* with the world, but do not write the scene yourself.
- Stay silent if no relevant information can be deduced from the context.`;
  }

  /**
   * Builds messages for context analysis
   *
   * @param {string} transcription - The transcription to analyze
   * @param {boolean} includeSuggestions - Whether to include suggestions
   * @param {boolean} checkOffTrack - Whether to check off-track status
   * @param {string} [ragContext] - Optional RAG-retrieved context to use instead of truncated full-text
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildAnalysisMessages(transcription, includeSuggestions, checkOffTrack, ragContext) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to truncated adventure context
    const context = ragContext || (this._adventureContext ? this._truncateContext(this._adventureContext) : '');

    if (context) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${context}`
      });
    }

    // Add recent conversation history
    for (const entry of this._conversationHistory.slice(-5)) {
      messages.push(entry);
    }

    let requestContent = `Analyze this session transcription:\n\n"${transcription}"\n\n`;

    if (includeSuggestions && checkOffTrack) {
      requestContent += `Respond in JSON format with this structure:
{
  "suggestions": [{"type": "narration|dialogue|action|reference", "content": "...", "confidence": 0.0-1.0}],
  "offTrackStatus": {"isOffTrack": boolean, "severity": 0.0-1.0, "reason": "..."},
  "relevantPages": ["..."],
  "summary": "..."
}`;
    } else if (includeSuggestions) {
      requestContent += `Provide suggestions for the DM in JSON format:
{
  "suggestions": [{"type": "narration|dialogue|action|reference", "content": "...", "confidence": 0.0-1.0}],
  "summary": "..."
}`;
    } else if (checkOffTrack) {
      requestContent += `Assess whether players are off-track in JSON format:
{
  "offTrackStatus": {"isOffTrack": boolean, "severity": 0.0-1.0, "reason": "..."},
  "summary": "..."
}`;
    }

    messages.push({ role: 'user', content: requestContent });

    return messages;
  }

  /**
   * Builds messages for off-track detection
   *
   * @param {string} transcription - The transcription to analyze
   * @param {string} [ragContext] - Optional RAG-retrieved context to use instead of truncated full-text
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildOffTrackMessages(transcription, ragContext) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to truncated adventure context
    const context = ragContext || (this._adventureContext ? this._truncateContext(this._adventureContext) : '');

    if (context) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${context}`
      });
    }

    const requestContent = `Analyze whether the players are following the adventure plot based on this transcription:

"${transcription}"

Respond in JSON format:
{
  "isOffTrack": boolean,
  "severity": 0.0-1.0,
  "reason": "brief explanation",
  "narrativeBridge": "optional suggestion to bring them back on track"
}`;

    messages.push({ role: 'user', content: requestContent });

    return messages;
  }

  /**
   * Builds messages for suggestion generation
   *
   * @param {string} transcription - The transcription to analyze
   * @param {number} maxSuggestions - Maximum suggestions to generate
   * @param {string} [ragContext] - Optional RAG-retrieved context to use instead of truncated full-text
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildSuggestionMessages(transcription, maxSuggestions, ragContext) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to truncated adventure context
    const context = ragContext || (this._adventureContext ? this._truncateContext(this._adventureContext) : '');

    if (context) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${context}`
      });
    }

    const requestContent = `Based on this transcription, generate up to ${maxSuggestions} suggestions for the DM:

"${transcription}"

Respond in JSON format:
{
  "suggestions": [
    {
      "type": "narration|dialogue|action|reference",
      "content": "the suggestion",
      "pageReference": "page name if applicable",
      "confidence": 0.0-1.0
    }
  ]
}`;

    messages.push({ role: 'user', content: requestContent });

    return messages;
  }

  /**
   * Builds messages for narrative bridge generation
   *
   * @param {string} currentSituation - Current off-track situation
   * @param {string} targetScene - Target scene to return to
   * @param {string} [ragContext] - Optional RAG-retrieved context to use instead of truncated full-text
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildNarrativeBridgeMessages(currentSituation, targetScene, ragContext) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to truncated adventure context
    const context = ragContext || (this._adventureContext ? this._truncateContext(this._adventureContext) : '');

    if (context) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${context}`
      });
    }

    messages.push({
      role: 'user',
      content: `The players have deviated from the main plot.

Current situation: ${currentSituation}
Target scene: ${targetScene}

Write a brief narration (2-3 sentences) that the DM can use to gently guide the players back towards the target scene, maintaining narrative continuity. Don't force the transition, but create a natural connection.`
    });

    return messages;
  }

  /**
   * Builds messages for NPC dialogue generation
   *
   * @param {string} npcName - The name of the NPC
   * @param {string} npcContext - NPC personality and backstory
   * @param {string} transcription - Current conversation context
   * @param {number} maxOptions - Maximum dialogue options to generate
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildNPCDialogueMessages(npcName, npcContext, transcription, maxOptions) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    if (npcContext) {
      messages.push({
        role: 'system',
        content: `NPC PROFILE - ${npcName}:\n${this._truncateContext(npcContext)}`
      });
    }

    const requestContent = `Generate ${maxOptions} dialogue options for the character "${npcName}" based on the conversation context:

"${transcription}"

The character must respond consistently with their personality and context.
Respond in JSON format:
{
  "dialogueOptions": [
    "dialogue option 1",
    "dialogue option 2",
    "dialogue option 3"
  ]
}`;

    messages.push({ role: 'user', content: requestContent });

    return messages;
  }

  // ---------------------------------------------------------------------------
  // Private: Response parsers
  // ---------------------------------------------------------------------------

  /**
   * Parses the analysis response from the API
   *
   * @param {Object} response - The API response
   * @returns {ContextAnalysis} The parsed analysis
   * @private
   */
  _parseAnalysisResponse(response) {
    const content = response.choices?.[0]?.message?.content || '{}';

    try {
      const parsed = JSON.parse(this._extractJson(content));

      const validatedSuggestions = this._validateArray(
        parsed.suggestions,
        10,
        'suggestions'
      ).map(s => ({
        type: s.type || 'narration',
        content: this._validateString(s.content || '', 5000, 'suggestion.content'),
        pageReference: s.pageReference
          ? this._validateString(s.pageReference, 200, 'suggestion.pageReference')
          : undefined,
        confidence: this._validateNumber(s.confidence, 0, 1, 'suggestion.confidence')
      }));

      const offTrackStatus = parsed.offTrackStatus
        ? {
          isOffTrack: Boolean(parsed.offTrackStatus.isOffTrack),
          severity: this._validateNumber(parsed.offTrackStatus.severity, 0, 1, 'offTrackStatus.severity'),
          reason: this._validateString(parsed.offTrackStatus.reason || '', 1000, 'offTrackStatus.reason'),
          narrativeBridge: parsed.offTrackStatus.narrativeBridge
            ? this._validateString(parsed.offTrackStatus.narrativeBridge, 2000, 'offTrackStatus.narrativeBridge')
            : undefined
        }
        : {
          isOffTrack: false,
          severity: 0,
          reason: ''
        };

      return {
        suggestions: validatedSuggestions,
        offTrackStatus,
        relevantPages: this._validateArray(parsed.relevantPages, 20, 'relevantPages'),
        summary: this._validateString(parsed.summary || '', 2000, 'summary'),
        rulesQuestions: []
      };
    } catch (error) {
      this._logger.warn('Failed to parse analysis response as JSON, using fallback:', error.message);

      const sanitizedContent = this._validateString(content, 5000, 'fallback.content');

      return {
        suggestions: [{
          type: 'narration',
          content: sanitizedContent,
          confidence: 0.5
        }],
        offTrackStatus: {
          isOffTrack: false,
          severity: 0,
          reason: ''
        },
        relevantPages: [],
        summary: this._validateString(content, 200, 'fallback.summary'),
        rulesQuestions: []
      };
    }
  }

  /**
   * Parses the off-track response from the API
   *
   * @param {Object} response - The API response
   * @returns {OffTrackResult} The parsed result
   * @private
   */
  _parseOffTrackResponse(response) {
    const content = response.choices?.[0]?.message?.content || '{}';

    try {
      const parsed = JSON.parse(this._extractJson(content));

      return {
        isOffTrack: Boolean(parsed.isOffTrack),
        severity: this._validateNumber(parsed.severity, 0, 1, 'severity'),
        reason: this._validateString(parsed.reason || '', 1000, 'reason'),
        narrativeBridge: parsed.narrativeBridge
          ? this._validateString(parsed.narrativeBridge, 2000, 'narrativeBridge')
          : undefined
      };
    } catch (error) {
      this._logger.warn('Failed to parse off-track response, returning default:', error.message);
      return {
        isOffTrack: false,
        severity: 0,
        reason: 'Unable to parse off-track detection response'
      };
    }
  }

  /**
   * Parses the suggestions response from the API
   *
   * @param {Object} response - The API response
   * @param {number} maxSuggestions - Maximum suggestions to return
   * @returns {Suggestion[]} Array of parsed suggestions
   * @private
   */
  _parseSuggestionsResponse(response, maxSuggestions) {
    const content = response.choices?.[0]?.message?.content || '{}';

    try {
      const parsed = JSON.parse(this._extractJson(content));

      const validatedSuggestions = this._validateArray(
        parsed.suggestions,
        10,
        'suggestions'
      ).slice(0, maxSuggestions)
        .map(s => ({
          type: s.type || 'narration',
          content: this._validateString(s.content || '', 5000, 'suggestion.content'),
          pageReference: s.pageReference
            ? this._validateString(s.pageReference, 200, 'suggestion.pageReference')
            : undefined,
          confidence: this._validateNumber(s.confidence, 0, 1, 'suggestion.confidence')
        }));

      return validatedSuggestions;
    } catch (error) {
      this._logger.warn('Failed to parse suggestions response:', error.message);

      const sanitizedContent = this._validateString(content, 5000, 'fallback.content');

      return [{
        type: 'narration',
        content: sanitizedContent,
        confidence: 0.3
      }];
    }
  }

  /**
   * Parses the NPC dialogue response from the API
   *
   * @param {Object} response - The API response
   * @param {number} maxOptions - Maximum dialogue options to return
   * @returns {string[]} Array of dialogue strings
   * @private
   */
  _parseNPCDialogueResponse(response, maxOptions) {
    const content = response.choices?.[0]?.message?.content || '{}';

    try {
      const parsed = JSON.parse(this._extractJson(content));

      const validatedOptions = this._validateArray(
        parsed.dialogueOptions,
        5,
        'dialogueOptions'
      ).slice(0, maxOptions)
        .map(option => this._validateString(option || '', 2000, 'dialogueOption'))
        .filter(option => option.length > 0);

      return validatedOptions;
    } catch (error) {
      this._logger.warn('Failed to parse NPC dialogue response:', error.message);

      const sanitizedContent = this._validateString(content, 2000, 'fallback.dialogueOption');

      if (sanitizedContent.length > 0) {
        return [sanitizedContent];
      }

      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Rules question detection
  // ---------------------------------------------------------------------------

  /**
   * Detects rules questions in a transcription
   *
   * @param {string} transcription - The transcription text to analyze
   * @returns {Object} Detection result
   * @private
   */
  _detectRulesQuestions(transcription) {
    if (!transcription || typeof transcription !== 'string') {
      return { hasRulesQuestions: false, questions: [] };
    }

    const normalizedText = transcription.toLowerCase();
    const questions = [];

    // Question patterns (both English and Italian)
    const questionPatterns = [
      { regex: /(?:how does|how do|what is the rule for|what are the rules for)\s+([a-z\s]+?)(?:\s+work|\?|$)/gi, confidence: 0.9, type: 'mechanic' },
      { regex: /(?:can i|can you|am i able to|is it possible to)\s+([a-z\s]+?)(?:\?|$)/gi, confidence: 0.7, type: 'action' },
      { regex: /(?:what happens when|what happens if)\s+([a-z\s]+?)(?:\?|$)/gi, confidence: 0.8, type: 'mechanic' },
      { regex: /(?:come funziona|come funzionano|qual è la regola per|quali sono le regole per)\s+([a-z\s]+?)(?:\?|$)/gi, confidence: 0.9, type: 'mechanic' },
      { regex: /(?:posso|possiamo|è possibile|si può)\s+([a-z\s]+?)(?:\?|$)/gi, confidence: 0.7, type: 'action' },
      { regex: /(?:cosa succede quando|cosa succede se|che succede se)\s+([a-z\s]+?)(?:\?|$)/gi, confidence: 0.8, type: 'mechanic' },
      { regex: /(?:quanto costa|quanti slot|quante azioni)\s+([a-z\s]+?)(?:\?|$)/gi, confidence: 0.8, type: 'spell' },
      { regex: /\b(?:regola|regole|meccanica|meccaniche|rule|rules|mechanic|mechanics)\b/gi, confidence: 0.6, type: 'general' }
    ];

    // Known D&D mechanic terms
    const mechanicTerms = {
      grappling: 'combat',
      lotta: 'combat',
      'opportunity attack': 'combat',
      'attacco di opportunità': 'combat',
      advantage: 'combat',
      vantaggio: 'combat',
      disadvantage: 'combat',
      svantaggio: 'combat',
      concentration: 'spell',
      concentrazione: 'spell',
      'spell slot': 'spell',
      'slot incantesimo': 'spell',
      prone: 'condition',
      prono: 'condition',
      stunned: 'condition',
      stordito: 'condition',
      'saving throw': 'ability',
      'tiro salvezza': 'ability',
      'short rest': 'rest',
      'riposo breve': 'rest',
      'long rest': 'rest',
      'riposo lungo': 'rest'
    };

    for (const pattern of questionPatterns) {
      const matches = normalizedText.matchAll(pattern.regex);
      for (const match of matches) {
        const extractedTopic = match[1] ? match[1].trim() : null;
        const detectedTerms = [];

        let category = pattern.type;
        if (extractedTopic) {
          for (const [term, termCategory] of Object.entries(mechanicTerms)) {
            if (extractedTopic.includes(term) || normalizedText.includes(term)) {
              detectedTerms.push(term);
              category = termCategory;
            }
          }
        }

        if (pattern.confidence > 0.5 || detectedTerms.length > 0) {
          questions.push({
            text: match[0],
            confidence: Math.min(pattern.confidence + (detectedTerms.length * 0.1), 1.0),
            type: category,
            extractedTopic,
            detectedTerms
          });
        }
      }
    }

    // Check for mechanic terms even without explicit question patterns
    for (const [term, category] of Object.entries(mechanicTerms)) {
      if (normalizedText.includes(term) && this._hasQuestionWord(normalizedText)) {
        const alreadyDetected = questions.some(q =>
          q.extractedTopic && q.extractedTopic.includes(term)
        );

        if (!alreadyDetected) {
          questions.push({
            text: term,
            confidence: 0.6,
            type: category,
            extractedTopic: term,
            detectedTerms: [term]
          });
        }
      }
    }

    return {
      hasRulesQuestions: questions.length > 0,
      questions
    };
  }

  /**
   * Checks if text contains a question word
   *
   * @param {string} text - The normalized text
   * @returns {boolean}
   * @private
   */
  _hasQuestionWord(text) {
    const questionWords = [
      'how', 'what', 'when', 'where', 'why', 'who', 'can', 'does', 'do', 'is', 'are',
      'come', 'cosa', 'quando', 'dove', 'perché', 'chi', 'posso', 'può', 'puoi',
      'è', 'sono', 'qual', 'quale', 'quanti', 'quante', 'quanto'
    ];

    const words = text.split(/\s+/);
    return words.some(word => questionWords.includes(word));
  }

  // ---------------------------------------------------------------------------
  // Private: RAG context retrieval
  // ---------------------------------------------------------------------------

  /**
   * Fetches and formats RAG context for a given query.
   * Consolidates the repeated RAG fetch + format pattern used across public methods.
   *
   * @param {string} query - The query to retrieve context for
   * @param {string} [logLabel] - Optional label for debug logging
   * @returns {Promise<string|null>} Formatted RAG context string or null if unavailable
   * @private
   */
  async _fetchRAGContextFor(query, logLabel) {
    if (!this.isRAGConfigured()) {
      return null;
    }

    const ragResult = await this._getRAGContext(query);
    if (!ragResult.context) {
      return null;
    }

    if (logLabel) {
      this._logger.debug(`Using RAG context for ${logLabel} with ${ragResult.sources.length} sources`);
    }
    return this._formatRAGContext(ragResult);
  }

  /**
   * Retrieves relevant context using RAG provider
   *
   * @param {string} query - The query to retrieve context for (usually the transcription)
   * @param {Object} [options={}] - Retrieval options
   * @param {number} [options.maxResults] - Maximum results to retrieve
   * @returns {Promise<{context: string, sources: string[]}>} Retrieved context and sources
   * @private
   */
  async _getRAGContext(query, options = {}) {
    if (!this.isRAGConfigured()) {
      return { context: '', sources: [] };
    }

    const maxResults = options.maxResults || this._ragMaxResults;
    const _ragStart = performance.now();

    try {
      const ragResult = await this._ragProvider.query(query, { maxResults });

      // Convert RAGQueryResult to internal format
      // Use the synthesized answer as primary context (OpenAI Responses API returns
      // RAG-augmented answer text, while individual source excerpts may be empty)
      const excerpts = ragResult.sources.map(s => s.excerpt).filter(Boolean).join('\n\n');
      const context = excerpts || ragResult.answer || '';
      const sources = ragResult.sources.map(s => s.title);
      const result = { context, sources };

      this._cachedRAGContext = result;
      this._consecutiveRAGFailures = 0;
      this._logger.debug(`_getRAGContext() — ${sources.length} sources, ${context.length} chars, ${(performance.now() - _ragStart).toFixed(1)}ms`);

      return result;
    } catch (error) {
      this._logger.warn(`_getRAGContext() failed after ${(performance.now() - _ragStart).toFixed(1)}ms:`, error.message);
      this._consecutiveRAGFailures++;
      if (this._consecutiveRAGFailures === 3) {
        ui?.notifications?.warn(
          game.i18n?.localize('VOXCHRONICLE.Errors.RAGContextUnavailable') ||
          'VoxChronicle: RAG context unavailable. Suggestions may be less accurate.'
        );
      }
      return { context: '', sources: [] };
    }
  }

  /**
   * Formats RAG retrieval results for inclusion in AI prompts
   *
   * @param {{context: string, sources: string[]}} ragResult - The RAG retrieval result
   * @returns {string} Formatted context with source citations header
   * @private
   */
  _formatRAGContext(ragResult) {
    if (!ragResult || !ragResult.context) {
      return '';
    }

    const parts = [];

    // Add header indicating this is RAG-retrieved content
    if (ragResult.sources && ragResult.sources.length > 0) {
      parts.push(`RELEVANT SOURCES: ${ragResult.sources.join(', ')}`);
      parts.push('---');
    }

    // Add the retrieved content
    parts.push(ragResult.context);

    return parts.join('\n');
  }

  /**
   * Gets the last cached RAG context
   *
   * @returns {{context: string, sources: string[]}|null} Cached RAG context or null
   */
  getCachedRAGContext() {
    return this._cachedRAGContext;
  }

  /**
   * Generates an autonomous suggestion based on current context
   *
   * Uses chapter context, RAG retrieval, and previous transcription to generate
   * a contextual suggestion for when the session is silent.
   *
   * @returns {Promise<Suggestion|null>} The generated suggestion or null
   * @private
   */
  async _generateAutonomousSuggestion() {
    // Build context query from chapter context and previous transcription
    let contextQuery = '';

    if (this._chapterContext) {
      contextQuery += this._chapterContext.chapterName || '';
      if (this._chapterContext.summary) {
        contextQuery += ' ' + this._chapterContext.summary;
      }
    }

    if (this._previousTranscription) {
      // Use last portion of previous transcription
      const lastPortion = this._previousTranscription.slice(-500);
      contextQuery += ' ' + lastPortion;
    }

    // If no context at all, use a generic prompt
    if (!contextQuery.trim()) {
      contextQuery = 'The game session is currently paused';
    }

    // Retrieve RAG context if available
    const ragContext = await this._fetchRAGContextFor(contextQuery.trim(), 'autonomous suggestion');

    // Build the messages for suggestion generation
    const messages = this._buildAutonomousSuggestionMessages(contextQuery.trim(), ragContext);

    // Make the API request
    const response = await this._makeChatRequest(messages);

    // Parse the response
    const suggestions = this._parseSuggestionsResponse(response, 1);

    if (suggestions.length > 0) {
      return suggestions[0];
    }

    return null;
  }

  /**
   * Builds messages for autonomous suggestion generation during silence
   *
   * @param {string} contextQuery - The context query built from chapter and transcription
   * @param {string} [ragContext] - Optional RAG-retrieved context
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildAutonomousSuggestionMessages(contextQuery, ragContext) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to adventure context
    const context = ragContext || (this._adventureContext ? this._truncateContext(this._adventureContext) : '');

    if (context) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${context}`
      });
    }

    const chapterInfo = this._formatChapterContext();
    const silencePrompt = `The game session has been silent for a while. Based on the current chapter and context, suggest what the DM should do next to re-engage the players.

${chapterInfo ? `Current Chapter Information:\n${chapterInfo}\n\n` : ''}${this._previousTranscription ? `Recent conversation context:\n"${this._previousTranscription.slice(-300)}"\n\n` : ''}Generate a single, helpful suggestion for the DM to move the story forward. Focus on:
1. What happens next in the adventure according to the source material
2. An NPC who could speak or act to prompt player engagement
3. An environmental detail or event to describe

Respond in JSON format:
{
  "suggestions": [
    {
      "type": "narration|dialogue|action|reference",
      "content": "the suggestion",
      "pageReference": "source page if applicable",
      "confidence": 0.0-1.0
    }
  ]
}`;

    messages.push({ role: 'user', content: silencePrompt });

    return messages;
  }

  // ---------------------------------------------------------------------------
  // Private: Utility methods
  // ---------------------------------------------------------------------------

  /**
   * Extracts JSON from a string that might contain markdown code blocks
   *
   * @param {string} content - The content to extract JSON from
   * @returns {string} The extracted JSON string
   * @private
   */
  _extractJson(content) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }

    return content;
  }

  /**
   * Escapes special regex characters in a string
   *
   * @param {string} str - The string to escape
   * @returns {string} The escaped string
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Truncates context to avoid exceeding token limits
   *
   * @param {string} context - The context to truncate
   * @returns {string} Truncated context
   * @private
   */
  _truncateContext(context) {
    const maxChars = MAX_CONTEXT_TOKENS * 4;

    if (context.length <= maxChars) {
      return context;
    }

    return context.substring(0, maxChars) + '\n\n[... content truncated ...]';
  }

  /**
   * Validates and sanitizes a string value, enforcing maximum length
   *
   * @param {any} str - The value to validate
   * @param {number} maxLength - Maximum allowed length
   * @param {string} fieldName - Name of the field (for logging)
   * @returns {string} The validated and sanitized string
   * @private
   */
  _validateString(str, maxLength, fieldName) {
    if (str === null || str === undefined) {
      return '';
    }

    const stringValue = String(str);

    if (stringValue.length > maxLength) {
      this._logger.warn(`${fieldName} exceeds max length (${stringValue.length} > ${maxLength}), truncating`);
      return stringValue.substring(0, maxLength);
    }

    return stringValue;
  }

  /**
   * Validates and clamps a numeric value to a range
   *
   * @param {any} num - The value to validate
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @param {string} fieldName - Name of the field (for logging)
   * @returns {number} The validated and clamped number
   * @private
   */
  _validateNumber(num, min, max, fieldName) {
    if (num === null || num === undefined) {
      return min;
    }

    const numValue = parseFloat(num);

    if (isNaN(numValue)) {
      this._logger.warn(`${fieldName} is not a valid number, using min value`);
      return min;
    }

    if (numValue < min) {
      this._logger.warn(`${fieldName} below min (${numValue} < ${min}), clamping`);
      return min;
    }

    if (numValue > max) {
      this._logger.warn(`${fieldName} above max (${numValue} > ${max}), clamping`);
      return max;
    }

    return numValue;
  }

  /**
   * Validates and limits an array to maximum size
   *
   * @param {any} arr - The value to validate
   * @param {number} maxItems - Maximum allowed items
   * @param {string} fieldName - Name of the field (for logging)
   * @returns {Array} The validated and limited array
   * @private
   */
  _validateArray(arr, maxItems, fieldName) {
    if (arr === null || arr === undefined) {
      return [];
    }

    if (!Array.isArray(arr)) {
      this._logger.warn(`${fieldName} is not an array, converting to empty array`);
      return [];
    }

    if (arr.length > maxItems) {
      this._logger.warn(`${fieldName} exceeds max items (${arr.length} > ${maxItems}), truncating`);
      return arr.slice(0, maxItems);
    }

    return arr;
  }

  /**
   * Adds a message to conversation history
   *
   * @param {string} role - The message role
   * @param {string} content - The message content
   * @private
   */
  _addToConversationHistory(role, content) {
    this._conversationHistory.push({ role, content });

    if (this._conversationHistory.length > this._maxHistorySize) {
      this._conversationHistory = this._conversationHistory.slice(-this._maxHistorySize);
    }
  }
}

export { AIAssistant, DEFAULT_MODEL, MAX_CONTEXT_TOKENS };
