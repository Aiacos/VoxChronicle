/**
 * EntityExtractor - AI-Powered Entity Extraction from RPG Transcripts
 *
 * Provides intelligent entity extraction using OpenAI's GPT-4o model to
 * identify and categorize NPCs, locations, items, and dramatic moments
 * from session transcripts. Used for automatic Kanka entity creation.
 *
 * @class EntityExtractor
 * @module vox-chronicle
 */

import { OpenAIClient, OpenAIError, OpenAIErrorType } from './OpenAIClient.mjs';
import { Logger } from '../utils/Logger.mjs';

/**
 * Entity types that can be extracted
 * @enum {string}
 */
const ExtractedEntityType = {
  CHARACTER: 'character',
  LOCATION: 'location',
  ITEM: 'item'
};

/**
 * Character subtypes
 * @enum {string}
 */
const CharacterType = {
  NPC: 'npc',
  PC: 'pc'
};

/**
 * Default timeout for entity extraction requests (3 minutes)
 * GPT-4o chat completions are typically faster than transcription
 * @constant {number}
 */
const ENTITY_EXTRACTION_TIMEOUT_MS = 180000;

/**
 * Default maximum number of salient moments to identify
 * @constant {number}
 */
const DEFAULT_MAX_MOMENTS = 3;

/**
 * EntityExtractor class for AI-powered entity extraction from transcripts
 *
 * @extends OpenAIClient
 * @example
 * const extractor = new EntityExtractor('your-api-key');
 * const entities = await extractor.extractEntities(transcriptText, {
 *   existingEntities: ['Gandalf', 'Mordor']
 * });
 */
class EntityExtractor extends OpenAIClient {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('EntityExtractor');

  /**
   * Default temperature for entity extraction (lower = more consistent)
   * @type {number}
   * @private
   */
  _extractionTemperature = 0.3;

  /**
   * Default temperature for moment identification (higher = more creative)
   * @type {number}
   * @private
   */
  _momentTemperature = 0.7;

  /**
   * Default model for extraction
   * @type {string}
   * @private
   */
  _model = 'gpt-4o';

  /**
   * Known entity names to avoid duplicates
   * @type {Set<string>}
   * @private
   */
  _knownEntities = new Set();

  /**
   * Create a new EntityExtractor instance
   *
   * @param {string} apiKey - OpenAI API key
   * @param {Object} [options] - Configuration options
   * @param {string} [options.model='gpt-4o'] - Model to use for extraction
   * @param {number} [options.extractionTemperature=0.3] - Temperature for entity extraction
   * @param {number} [options.momentTemperature=0.7] - Temperature for moment identification
   * @param {string[]} [options.knownEntities] - Initial list of known entity names
   * @param {number} [options.timeout=180000] - Request timeout in milliseconds
   */
  constructor(apiKey, options = {}) {
    super(apiKey, {
      ...options,
      timeout: options.timeout || ENTITY_EXTRACTION_TIMEOUT_MS
    });

    this._model = options.model || 'gpt-4o';
    this._extractionTemperature = options.extractionTemperature ?? 0.3;
    this._momentTemperature = options.momentTemperature ?? 0.7;

    if (options.knownEntities && Array.isArray(options.knownEntities)) {
      options.knownEntities.forEach(name => this._knownEntities.add(name.toLowerCase()));
    }

    this._logger.debug('EntityExtractor initialized');
  }

  /**
   * Extract entities (NPCs, locations, items) from transcription text
   * Uses GPT-4o to analyze transcript and identify named entities
   *
   * @param {string} transcriptText - The full transcription text
   * @param {Object} [options] - Extraction options
   * @param {string[]} [options.existingEntities] - Names of entities already in Kanka (to avoid duplicates)
   * @param {boolean} [options.includePlayerCharacters=false] - Whether to include PCs
   * @param {string} [options.campaignContext] - Additional context about the campaign
   * @returns {Promise<ExtractionResult>} Extracted entities categorized by type
   */
  async extractEntities(transcriptText, options = {}) {
    if (!transcriptText || typeof transcriptText !== 'string') {
      throw new OpenAIError(
        'Invalid transcript: expected non-empty string',
        OpenAIErrorType.INVALID_REQUEST_ERROR
      );
    }

    // Trim very long transcripts to avoid token limits
    const processedText = this._truncateTranscript(transcriptText);

    // Build list of entities to ignore
    const existingEntities = [
      ...(options.existingEntities || []),
      ...Array.from(this._knownEntities)
    ];

    const systemPrompt = this._buildExtractionSystemPrompt(existingEntities, options);

    this._logger.log(`Extracting entities from transcript (${processedText.length} chars)`);

    try {
      const response = await this.post('/chat/completions', {
        model: this._model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract entities from this RPG session transcript:\n\n${processedText}` }
        ],
        response_format: { type: 'json_object' },
        temperature: this._extractionTemperature
      });

      const content = response.choices[0].message.content;
      const extracted = JSON.parse(content);

      // Validate and normalize the response
      const result = this._normalizeExtractionResult(extracted, options);

      this._logger.log(
        `Extracted ${result.characters.length} characters, ` +
        `${result.locations.length} locations, ${result.items.length} items`
      );

      return result;

    } catch (error) {
      if (error instanceof SyntaxError) {
        this._logger.error('Failed to parse extraction response as JSON');
        throw new OpenAIError(
          'Entity extraction returned invalid JSON',
          OpenAIErrorType.API_ERROR
        );
      }
      this._logger.error('Entity extraction failed:', error.message);
      throw error;
    }
  }

  /**
   * Identify salient moments for image generation
   *
   * @param {string} transcriptText - The full transcription text
   * @param {Object} [options] - Identification options
   * @param {number} [options.maxMoments=3] - Maximum number of moments to identify
   * @param {string} [options.campaignContext] - Additional context about the campaign
   * @param {string} [options.style] - Preferred visual style for prompts
   * @returns {Promise<Array<SalientMoment>>} Array of moment descriptions for image generation
   */
  async identifySalientMoments(transcriptText, options = {}) {
    if (!transcriptText || typeof transcriptText !== 'string') {
      throw new OpenAIError(
        'Invalid transcript: expected non-empty string',
        OpenAIErrorType.INVALID_REQUEST_ERROR
      );
    }

    const maxMoments = options.maxMoments || DEFAULT_MAX_MOMENTS;
    const processedText = this._truncateTranscript(transcriptText);

    const systemPrompt = this._buildMomentsSystemPrompt(maxMoments, options);

    this._logger.log(`Identifying up to ${maxMoments} salient moments`);

    try {
      const response = await this.post('/chat/completions', {
        model: this._model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Identify the most dramatic moments from this session:\n\n${processedText}` }
        ],
        response_format: { type: 'json_object' },
        temperature: this._momentTemperature
      });

      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content);

      // Extract moments array
      const moments = parsed.moments || [];

      // Normalize and validate moments
      const validatedMoments = moments
        .slice(0, maxMoments)
        .map((moment, index) => this._normalizeMoment(moment, index));

      this._logger.log(`Identified ${validatedMoments.length} salient moments`);

      return validatedMoments;

    } catch (error) {
      if (error instanceof SyntaxError) {
        this._logger.error('Failed to parse moments response as JSON');
        throw new OpenAIError(
          'Moment identification returned invalid JSON',
          OpenAIErrorType.API_ERROR
        );
      }
      this._logger.error('Moment identification failed:', error.message);
      throw error;
    }
  }

  /**
   * Extract both entities and salient moments in one call
   * More efficient than calling both methods separately
   *
   * @param {string} transcriptText - The full transcription text
   * @param {Object} [options] - Options for both extraction and moment identification
   * @returns {Promise<CombinedExtractionResult>} Combined results
   */
  async extractAll(transcriptText, options = {}) {
    const [entities, moments] = await Promise.all([
      this.extractEntities(transcriptText, options),
      this.identifySalientMoments(transcriptText, options)
    ]);

    return {
      ...entities,
      moments
    };
  }

  /**
   * Add known entity names to avoid duplicate extraction
   *
   * @param {string|string[]} names - Entity name(s) to add
   */
  addKnownEntities(names) {
    const nameList = Array.isArray(names) ? names : [names];
    nameList.forEach(name => {
      if (name && typeof name === 'string') {
        this._knownEntities.add(name.toLowerCase());
      }
    });
    this._logger.debug(`Added ${nameList.length} known entities`);
  }

  /**
   * Remove entity from known list
   *
   * @param {string} name - Entity name to remove
   */
  removeKnownEntity(name) {
    if (name && typeof name === 'string') {
      this._knownEntities.delete(name.toLowerCase());
    }
  }

  /**
   * Clear all known entities
   */
  clearKnownEntities() {
    this._knownEntities.clear();
    this._logger.debug('Cleared known entities');
  }

  /**
   * Get the current list of known entities
   *
   * @returns {string[]} Array of known entity names
   */
  getKnownEntities() {
    return Array.from(this._knownEntities);
  }

  /**
   * Build the system prompt for entity extraction
   *
   * @param {string[]} existingEntities - Names to ignore
   * @param {Object} options - Extraction options
   * @returns {string} System prompt
   * @private
   */
  _buildExtractionSystemPrompt(existingEntities, options = {}) {
    const ignoreList = existingEntities.length > 0
      ? `\nIgnore entities that already exist: ${existingEntities.join(', ')}`
      : '';

    const pcInstructions = options.includePlayerCharacters
      ? 'Include both player characters (PCs) and non-player characters (NPCs).'
      : 'Focus on non-player characters (NPCs). Mark clearly identified player characters but prioritize NPCs.';

    const campaignContext = options.campaignContext
      ? `\nCampaign context: ${options.campaignContext}`
      : '';

    return `You are an expert at analyzing tabletop RPG session transcripts.
Extract all named entities from the transcript and categorize them.

Rules:
1. Only extract entities that are clearly named (not generic references like "the inn" unless given a specific name)
2. ${pcInstructions}
3. For each entity, provide: name, type, and a brief description based on context
4. Locations should include type (tavern, city, dungeon, forest, castle, etc.)
5. Items should include type (weapon, armor, artifact, potion, scroll, etc.)
6. Be conservative - only extract entities mentioned explicitly${ignoreList}${campaignContext}

Return JSON in this exact format:
{
  "characters": [
    { "name": "...", "description": "Brief description based on context", "isNPC": true, "role": "merchant/guard/villain/etc" }
  ],
  "locations": [
    { "name": "...", "description": "Brief description based on context", "type": "tavern/city/dungeon/etc" }
  ],
  "items": [
    { "name": "...", "description": "Brief description based on context", "type": "weapon/armor/artifact/etc" }
  ],
  "summary": "Brief summary of entities found"
}`;
  }

  /**
   * Build the system prompt for salient moment identification
   *
   * @param {number} maxMoments - Maximum moments to identify
   * @param {Object} options - Identification options
   * @returns {string} System prompt
   * @private
   */
  _buildMomentsSystemPrompt(maxMoments, options = {}) {
    const styleGuide = options.style
      ? `\nVisual style preference: ${options.style}`
      : '';

    const campaignContext = options.campaignContext
      ? `\nCampaign context: ${options.campaignContext}`
      : '';

    return `You are an expert at identifying dramatic and visually interesting moments in RPG sessions.
Analyze the transcript and identify up to ${maxMoments} key moments that would make compelling illustrations.

For each moment, provide:
1. A brief, evocative title (5-10 words)
2. A detailed visual description suitable for DALL-E image generation (focus on composition, lighting, emotion)
3. The relevant quote or context from the transcript
4. A drama score from 1-10 indicating how dramatic/important the moment is${styleGuide}${campaignContext}

Return JSON in this exact format:
{
  "moments": [
    {
      "title": "The Dragon's Awakening",
      "imagePrompt": "A massive ancient dragon rising from a treasure hoard, wings spread wide, eyes glowing with fire, dramatic lighting from below, adventurers silhouetted in the foreground looking up in awe and terror",
      "context": "When the party disturbed the sleeping dragon...",
      "dramaScore": 9
    }
  ]
}`;
  }

  /**
   * Truncate transcript to avoid token limits
   *
   * @param {string} text - Transcript text
   * @returns {string} Truncated text
   * @private
   */
  _truncateTranscript(text) {
    // GPT-4o has ~128k context, but we want to leave room for response
    // Estimate ~4 chars per token, aim for ~100k tokens max input
    const maxChars = 400000;

    if (text.length <= maxChars) {
      return text;
    }

    this._logger.warn(`Truncating transcript from ${text.length} to ${maxChars} chars`);

    // Try to truncate at a sentence boundary
    const truncated = text.substring(0, maxChars);
    const lastPeriod = truncated.lastIndexOf('.');

    if (lastPeriod > maxChars * 0.9) {
      return truncated.substring(0, lastPeriod + 1);
    }

    return truncated;
  }

  /**
   * Normalize and validate extraction result
   *
   * @param {Object} extracted - Raw extraction result
   * @param {Object} options - Extraction options
   * @returns {ExtractionResult} Normalized result
   * @private
   */
  _normalizeExtractionResult(extracted, options = {}) {
    // Ensure arrays exist
    const characters = Array.isArray(extracted.characters) ? extracted.characters : [];
    const locations = Array.isArray(extracted.locations) ? extracted.locations : [];
    const items = Array.isArray(extracted.items) ? extracted.items : [];

    // Normalize characters
    const normalizedCharacters = characters
      .filter(c => c && c.name)
      .map(c => ({
        name: String(c.name).trim(),
        description: String(c.description || '').trim(),
        isNPC: c.isNPC !== false, // Default to NPC
        role: String(c.role || 'unknown').trim(),
        entityType: ExtractedEntityType.CHARACTER
      }));

    // Normalize locations
    const normalizedLocations = locations
      .filter(l => l && l.name)
      .map(l => ({
        name: String(l.name).trim(),
        description: String(l.description || '').trim(),
        type: String(l.type || 'place').trim(),
        entityType: ExtractedEntityType.LOCATION
      }));

    // Normalize items
    const normalizedItems = items
      .filter(i => i && i.name)
      .map(i => ({
        name: String(i.name).trim(),
        description: String(i.description || '').trim(),
        type: String(i.type || 'item').trim(),
        entityType: ExtractedEntityType.ITEM
      }));

    return {
      characters: normalizedCharacters,
      locations: normalizedLocations,
      items: normalizedItems,
      summary: extracted.summary || '',
      totalCount: normalizedCharacters.length + normalizedLocations.length + normalizedItems.length
    };
  }

  /**
   * Normalize a salient moment
   *
   * @param {Object} moment - Raw moment data
   * @param {number} index - Moment index
   * @returns {SalientMoment} Normalized moment
   * @private
   */
  _normalizeMoment(moment, index) {
    return {
      id: `moment-${index + 1}`,
      title: String(moment.title || `Moment ${index + 1}`).trim(),
      imagePrompt: String(moment.imagePrompt || '').trim(),
      context: String(moment.context || '').trim(),
      dramaScore: Math.min(10, Math.max(1, parseInt(moment.dramaScore, 10) || 5))
    };
  }

  /**
   * Set the extraction temperature
   *
   * @param {number} temperature - Temperature value (0-1)
   */
  setExtractionTemperature(temperature) {
    this._extractionTemperature = Math.min(1, Math.max(0, temperature));
    this._logger.debug(`Set extraction temperature: ${this._extractionTemperature}`);
  }

  /**
   * Set the moment identification temperature
   *
   * @param {number} temperature - Temperature value (0-1)
   */
  setMomentTemperature(temperature) {
    this._momentTemperature = Math.min(1, Math.max(0, temperature));
    this._logger.debug(`Set moment temperature: ${this._momentTemperature}`);
  }

  /**
   * Set the model to use for extraction
   *
   * @param {string} model - Model name (e.g., 'gpt-4o', 'gpt-4o-mini')
   */
  setModel(model) {
    this._model = model;
    this._logger.debug(`Set model: ${this._model}`);
  }

  /**
   * Get available extraction models
   *
   * @returns {Array<Object>} List of available models
   */
  static getAvailableModels() {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Best quality, recommended for entity extraction',
        recommended: true
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Faster and cheaper, good for simpler transcripts',
        recommended: false
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'High quality alternative',
        recommended: false
      }
    ];
  }

  /**
   * Estimate extraction cost for a transcript
   *
   * @param {string} transcriptText - Transcript text
   * @returns {Object} Cost estimate
   */
  estimateCost(transcriptText) {
    if (!transcriptText) {
      return { estimatedTokens: 0, estimatedCostUSD: 0 };
    }

    // Rough estimate: ~4 characters per token
    const inputTokens = Math.ceil(transcriptText.length / 4);
    const outputTokens = 500; // Typical output size

    // GPT-4o pricing (as of spec)
    const inputCostPer1M = 2.50;
    const outputCostPer1M = 10.00;

    const inputCost = (inputTokens / 1000000) * inputCostPer1M;
    const outputCost = (outputTokens / 1000000) * outputCostPer1M;

    return {
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedTotalTokens: inputTokens + outputTokens,
      estimatedCostUSD: inputCost + outputCost,
      model: this._model
    };
  }
}

/**
 * @typedef {Object} ExtractionResult
 * @property {Array<ExtractedCharacter>} characters - Extracted character entities
 * @property {Array<ExtractedLocation>} locations - Extracted location entities
 * @property {Array<ExtractedItem>} items - Extracted item entities
 * @property {string} summary - Brief summary of extracted entities
 * @property {number} totalCount - Total number of entities extracted
 */

/**
 * @typedef {Object} ExtractedCharacter
 * @property {string} name - Character name
 * @property {string} description - Brief description
 * @property {boolean} isNPC - Whether this is an NPC (vs PC)
 * @property {string} role - Character role (merchant, guard, villain, etc.)
 * @property {string} entityType - Always 'character'
 */

/**
 * @typedef {Object} ExtractedLocation
 * @property {string} name - Location name
 * @property {string} description - Brief description
 * @property {string} type - Location type (tavern, city, dungeon, etc.)
 * @property {string} entityType - Always 'location'
 */

/**
 * @typedef {Object} ExtractedItem
 * @property {string} name - Item name
 * @property {string} description - Brief description
 * @property {string} type - Item type (weapon, armor, artifact, etc.)
 * @property {string} entityType - Always 'item'
 */

/**
 * @typedef {Object} SalientMoment
 * @property {string} id - Unique moment identifier
 * @property {string} title - Brief, evocative title
 * @property {string} imagePrompt - Detailed prompt for DALL-E image generation
 * @property {string} context - Relevant context from the transcript
 * @property {number} dramaScore - Drama score from 1-10
 */

/**
 * @typedef {Object} CombinedExtractionResult
 * @property {Array<ExtractedCharacter>} characters - Extracted character entities
 * @property {Array<ExtractedLocation>} locations - Extracted location entities
 * @property {Array<ExtractedItem>} items - Extracted item entities
 * @property {string} summary - Brief summary of extracted entities
 * @property {number} totalCount - Total number of entities extracted
 * @property {Array<SalientMoment>} moments - Identified salient moments
 */

// Export all classes and enums
export {
  EntityExtractor,
  ExtractedEntityType,
  CharacterType,
  ENTITY_EXTRACTION_TIMEOUT_MS,
  DEFAULT_MAX_MOMENTS
};
