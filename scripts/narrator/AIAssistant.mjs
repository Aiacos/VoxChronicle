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

    this._logger.debug(`Analyzing context, transcription length: ${transcription.length}`);

    // Detect rules questions if enabled
    let rulesDetection = null;
    if (detectRules) {
      rulesDetection = this._detectRulesQuestions(transcription);
      if (rulesDetection.hasRulesQuestions) {
        this._logger.debug(`Detected ${rulesDetection.questions.length} rules question(s)`);
      }
    }

    try {
      const messages = this._buildAnalysisMessages(transcription, includeSuggestions, checkOffTrack);
      const response = await this._makeChatRequest(messages);
      const analysis = this._parseAnalysisResponse(response);

      // Add rules questions to analysis if detected
      analysis.rulesQuestions = rulesDetection?.questions || [];

      // Update conversation history
      this._addToConversationHistory('user', transcription);
      this._addToConversationHistory('assistant', JSON.stringify(analysis));

      this._sessionState.suggestionsCount++;
      this._previousTranscription = transcription;

      this._logger.info(`Analysis complete, ${analysis.suggestions.length} suggestions`);

      return {
        ...analysis,
        sceneInfo: {
          type: 'unknown',
          isTransition: false,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      this._logger.error('Context analysis failed:', error.message);
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

    if (!this._adventureContext) {
      this._logger.warn('No adventure context set, skipping off-track detection');
      return {
        isOffTrack: false,
        severity: 0,
        reason: 'No adventure context available for comparison'
      };
    }

    this._logger.debug('Checking off-track status');

    try {
      const messages = this._buildOffTrackMessages(transcription);
      const response = await this._makeChatRequest(messages);
      const result = this._parseOffTrackResponse(response);

      this._sessionState.lastOffTrackCheck = new Date();

      return result;
    } catch (error) {
      this._logger.error('Off-track detection failed:', error.message);
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

    this._logger.debug('Generating suggestions');

    try {
      const messages = this._buildSuggestionMessages(transcription, maxSuggestions);
      const response = await this._makeChatRequest(messages);
      const suggestions = this._parseSuggestionsResponse(response, maxSuggestions);

      return suggestions;
    } catch (error) {
      this._logger.error('Suggestion generation failed:', error.message);
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

    this._logger.debug('Generating narrative bridge');

    try {
      const messages = this._buildNarrativeBridgeMessages(currentSituation, targetScene);
      const response = await this._makeChatRequest(messages);
      const content = response.choices?.[0]?.message?.content || '';
      return content.trim();
    } catch (error) {
      this._logger.error('Narrative bridge generation failed:', error.message);
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

    this._logger.debug(`Generating NPC dialogue for ${npcName}`);

    try {
      const messages = this._buildNPCDialogueMessages(npcName, npcContext, transcription, maxOptions);
      const response = await this._makeChatRequest(messages);
      const dialogueOptions = this._parseNPCDialogueResponse(response, maxOptions);

      return dialogueOptions;
    } catch (error) {
      this._logger.error(`NPC dialogue generation failed for ${npcName}:`, error.message);
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
    this._conversationHistory = [];
    this._sessionState = {
      currentScene: null,
      lastOffTrackCheck: null,
      suggestionsCount: 0
    };
    this._previousTranscription = '';
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
      isConfigured: this.isConfigured()
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
    const response = await this._openaiClient.post('/chat/completions', {
      model: this._model,
      messages,
      temperature: 0.7,
      max_tokens: 1000
    });

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

Help the GM by providing:
1. **Contextual suggestions** based on player conversation, with precise material references
2. **Direct references** to relevant parts of the adventure (cite page/section)
3. **Off-track detection** when players deviate from the adventure theme
4. **Narrative bridges** to gently guide players back to the story (based only on existing material)
${chapterSection}

## RESPONSE FORMAT

- Respond in the same language as the transcription (${responseLang})
- ALWAYS include the "pageReference" field with the source in the material
- If no relevant information is found, set confidence to 0 and indicate "Not found in material"

## OFF-TRACK SENSITIVITY

${sensitivityGuide[this._sensitivity]}

## IMPORTANT

- You are NOT a storyteller who invents stories
- You ARE an assistant that retrieves and organizes information from existing material
- When players are off-topic, suggest ways to bring them back using ONLY elements already in the material`;
  }

  /**
   * Builds messages for context analysis
   *
   * @param {string} transcription - The transcription to analyze
   * @param {boolean} includeSuggestions - Whether to include suggestions
   * @param {boolean} checkOffTrack - Whether to check off-track status
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildAnalysisMessages(transcription, includeSuggestions, checkOffTrack) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    if (this._adventureContext) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${this._truncateContext(this._adventureContext)}`
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
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildOffTrackMessages(transcription) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    if (this._adventureContext) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${this._truncateContext(this._adventureContext)}`
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
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildSuggestionMessages(transcription, maxSuggestions) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    if (this._adventureContext) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${this._truncateContext(this._adventureContext)}`
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
   * @returns {Array<{role: string, content: string}>} The messages array
   * @private
   */
  _buildNarrativeBridgeMessages(currentSituation, targetScene) {
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() }
    ];

    if (this._adventureContext) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${this._truncateContext(this._adventureContext)}`
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
    } catch {
      this._logger.warn('Failed to parse analysis response as JSON, using fallback');

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
    } catch {
      this._logger.warn('Failed to parse off-track response, returning default');
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
    } catch {
      this._logger.warn('Failed to parse suggestions response');

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
    } catch {
      this._logger.warn('Failed to parse NPC dialogue response');

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
