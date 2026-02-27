/**
 * PromptBuilder - Builds AI Prompt Messages for VoxChronicle
 *
 * Extracted from AIAssistant to separate prompt/message construction responsibility.
 * Contains all system prompt templates, message array builders, and context formatting
 * logic used by the AI assistant for various analysis modes.
 *
 * @class PromptBuilder
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Maximum context tokens to avoid excessive API costs
 * @constant {number}
 */
const MAX_CONTEXT_TOKENS = 8000;

/**
 * PromptBuilder class - Constructs message arrays for OpenAI chat completions
 *
 * Owns:
 * - System prompt generation with language, sensitivity, and chapter context
 * - Message array construction for all analysis modes (analysis, off-track, suggestions, etc.)
 * - Context truncation to stay within token limits
 * - Chapter context formatting for prompt inclusion
 *
 * Does NOT own:
 * - API calls (caller responsibility)
 * - Response parsing (caller responsibility)
 * - RAG retrieval (caller passes RAG context as parameter)
 * - Conversation history management (caller passes history via setter)
 *
 * @example
 * const builder = new PromptBuilder({ primaryLanguage: 'en', sensitivity: 'medium' });
 * builder.setAdventureContext(journalContent);
 * builder.setChapterContext(chapterInfo);
 * const messages = builder.buildAnalysisMessages(transcription, true, true, ragContext);
 */
class PromptBuilder {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('PromptBuilder');

  /**
   * Creates a new PromptBuilder instance
   *
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.primaryLanguage='en'] - Primary language code for AI responses
   * @param {string} [options.sensitivity='medium'] - Off-track detection sensitivity ('low', 'medium', 'high')
   */
  constructor(options = {}) {
    /**
     * Primary/detected language for AI responses
     * @type {string}
     * @private
     */
    this._primaryLanguage = options.primaryLanguage || 'en';

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
     * Current chapter/scene context for focused analysis
     * @type {Object|null}
     * @private
     */
    this._chapterContext = null;

    /**
     * Recent conversation history for context
     * @type {Array<{role: string, content: string}>}
     * @private
     */
    this._conversationHistory = [];

    /**
     * Previous transcription text for autonomous suggestions
     * @type {string}
     * @private
     */
    this._previousTranscription = '';
  }

  // ---------------------------------------------------------------------------
  // State setters
  // ---------------------------------------------------------------------------

  /**
   * Sets the adventure context from parsed journal content
   *
   * @param {string} context - The adventure content text
   */
  setAdventureContext(context) {
    this._adventureContext = context || '';
  }

  /**
   * Sets the current chapter/scene context
   *
   * @param {Object|null} context - The chapter context information
   */
  setChapterContext(context) {
    this._chapterContext = context;
  }

  /**
   * Sets the conversation history reference
   *
   * @param {Array<{role: string, content: string}>} history - Conversation history entries
   */
  setConversationHistory(history) {
    this._conversationHistory = history || [];
  }

  /**
   * Sets the previous transcription text
   *
   * @param {string} text - Previous transcription text
   */
  setPreviousTranscription(text) {
    this._previousTranscription = text || '';
  }

  /**
   * Sets the primary language for AI responses
   *
   * @param {string} lang - The language code (e.g., 'it', 'en', 'de')
   */
  setPrimaryLanguage(lang) {
    this._primaryLanguage = lang || 'en';
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

  // ---------------------------------------------------------------------------
  // Public build methods
  // ---------------------------------------------------------------------------

  /**
   * Builds the system prompt for the AI assistant
   *
   * @returns {string} The system prompt
   */
  buildSystemPrompt() {
    const chapterContext = this.formatChapterContext();

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
   */
  buildAnalysisMessages(transcription, includeSuggestions, checkOffTrack, ragContext) {
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to truncated adventure context
    const context = ragContext || (this._adventureContext ? this.truncateContext(this._adventureContext) : '');

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
   */
  buildOffTrackMessages(transcription, ragContext) {
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to truncated adventure context
    const context = ragContext || (this._adventureContext ? this.truncateContext(this._adventureContext) : '');

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
   */
  buildSuggestionMessages(transcription, maxSuggestions, ragContext) {
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to truncated adventure context
    const context = ragContext || (this._adventureContext ? this.truncateContext(this._adventureContext) : '');

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
   */
  buildNarrativeBridgeMessages(currentSituation, targetScene, ragContext) {
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to truncated adventure context
    const context = ragContext || (this._adventureContext ? this.truncateContext(this._adventureContext) : '');

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
   */
  buildNPCDialogueMessages(npcName, npcContext, transcription, maxOptions) {
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() }
    ];

    if (npcContext) {
      messages.push({
        role: 'system',
        content: `NPC PROFILE - ${npcName}:\n${this.truncateContext(npcContext)}`
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

  /**
   * Builds messages for autonomous suggestion generation during silence
   *
   * @param {string} contextQuery - The context query built from chapter and transcription
   * @param {string} [ragContext] - Optional RAG-retrieved context
   * @returns {Array<{role: string, content: string}>} The messages array
   */
  buildAutonomousSuggestionMessages(contextQuery, ragContext) {
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() }
    ];

    // Use RAG context if provided, otherwise fall back to adventure context
    const context = ragContext || (this._adventureContext ? this.truncateContext(this._adventureContext) : '');

    if (context) {
      messages.push({
        role: 'system',
        content: `ADVENTURE CONTEXT:\n${context}`
      });
    }

    const chapterInfo = this.formatChapterContext();
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
  // Utility methods
  // ---------------------------------------------------------------------------

  /**
   * Truncates context to avoid exceeding token limits
   *
   * @param {string} context - The context to truncate
   * @returns {string} Truncated context
   */
  truncateContext(context) {
    const maxChars = MAX_CONTEXT_TOKENS * 4;

    if (context.length <= maxChars) {
      return context;
    }

    return context.substring(0, maxChars) + '\n\n[... content truncated ...]';
  }

  /**
   * Formats the chapter context for inclusion in AI prompts
   *
   * @returns {string} Formatted chapter context string or empty string if not set
   */
  formatChapterContext() {
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
}

export { PromptBuilder, MAX_CONTEXT_TOKENS };
