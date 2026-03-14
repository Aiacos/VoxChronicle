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

import { OpenAIError, OpenAIErrorType } from './OpenAIClient.mjs';
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
 * Relationship types between entities
 * @enum {string}
 */
const RelationshipType = {
  ALLY: 'ally',
  ENEMY: 'enemy',
  FAMILY: 'family',
  EMPLOYER: 'employer',
  EMPLOYEE: 'employee',
  ROMANTIC: 'romantic',
  FRIEND: 'friend',
  RIVAL: 'rival',
  NEUTRAL: 'neutral',
  UNKNOWN: 'unknown'
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
 * Uses a ChatProvider for all API communication, following the composition
 * over inheritance pattern established in Story 2.2.
 *
 * @example
 * const provider = new OpenAIChatProvider('your-api-key');
 * const extractor = new EntityExtractor(provider);
 * const entities = await extractor.extractEntities(transcriptText, {
 *   existingEntities: ['Gandalf', 'Mordor']
 * });
 */
class EntityExtractor {
  /**
   * Chat provider for API communication
   * @type {import('./providers/ChatProvider.mjs').ChatProvider}
   */
  #provider;

  /**
   * Logger instance for this class
   * @type {object}
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
   * @param {import('./providers/ChatProvider.mjs').ChatProvider} provider - Chat provider instance
   * @param {object} [options] - Configuration options
   * @param {string} [options.model='gpt-4o'] - Model to use for extraction
   * @param {number} [options.extractionTemperature=0.3] - Temperature for entity extraction
   * @param {number} [options.momentTemperature=0.7] - Temperature for moment identification
   * @param {string[]} [options.knownEntities] - Initial list of known entity names
   */
  constructor(provider, options = {}) {
    if (!provider) {
      throw new Error('EntityExtractor requires a ChatProvider instance');
    }
    this.#provider = provider;

    this._model = options.model || 'gpt-4o';
    this._extractionTemperature = options.extractionTemperature ?? 0.3;
    this._momentTemperature = options.momentTemperature ?? 0.7;

    if (options.knownEntities && Array.isArray(options.knownEntities)) {
      options.knownEntities.forEach((name) => this._knownEntities.add(name.toLowerCase()));
    }

    this._logger.debug('EntityExtractor initialized');
  }

  /**
   * Extract entities (NPCs, locations, items) from transcription text
   * Uses GPT-4o to analyze transcript and identify named entities
   *
   * @param {string} transcriptText - The full transcription text
   * @param {object} [options] - Extraction options
   * @param {string[]} [options.existingEntities] - Names of entities already in Kanka (to avoid duplicates)
   * @param {boolean} [options.includePlayerCharacters=false] - Whether to include PCs
   * @param {string} [options.campaignContext] - Additional context about the campaign
   * @returns {Promise<ExtractionResult>} Extracted entities categorized by type
   */
  async extractEntities(transcriptText, options = {}) {
    this._logger.debug('extractEntities called', {
      textLength: transcriptText?.length,
      existingEntities: options.existingEntities?.length,
      includePlayerCharacters: options.includePlayerCharacters
    });
    const t0 = Date.now();

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
      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Extract entities from this RPG session transcript:\n\n${processedText}`
        }
      ];

      const result = await this.#provider.chat(messages, {
        model: this._model,
        temperature: this._extractionTemperature,
        responseFormat: { type: 'json_object' }
      });

      const content = result.content;
      if (!content) {
        throw new Error('Entity extraction received empty response from provider');
      }
      const extracted = JSON.parse(content);

      // Validate and normalize the response
      const normalized = this._normalizeExtractionResult(extracted, options);

      this._logger.log(
        `Extracted ${normalized.characters.length} characters, ` +
          `${normalized.locations.length} locations, ${normalized.items.length} items`
      );

      this._logger.debug(`extractEntities completed in ${Date.now() - t0}ms`, {
        characters: normalized.characters.length,
        locations: normalized.locations.length,
        items: normalized.items.length,
        totalCount: normalized.totalCount
      });
      return normalized;
    } catch (error) {
      if (error instanceof SyntaxError) {
        this._logger.error(
          `extractEntities failed after ${Date.now() - t0}ms: Failed to parse extraction response as JSON`
        );
        throw new OpenAIError('Entity extraction returned invalid JSON', OpenAIErrorType.API_ERROR);
      }
      this._logger.error(`extractEntities failed after ${Date.now() - t0}ms: ${error.message}`, {
        textLength: transcriptText?.length
      });
      throw error;
    }
  }

  /**
   * Identify salient moments for image generation
   *
   * @param {string} transcriptText - The full transcription text
   * @param {object} [options] - Identification options
   * @param {number} [options.maxMoments=3] - Maximum number of moments to identify
   * @param {string} [options.campaignContext] - Additional context about the campaign
   * @param {string} [options.style] - Preferred visual style for prompts
   * @returns {Promise<Array<SalientMoment>>} Array of moment descriptions for image generation
   */
  async identifySalientMoments(transcriptText, options = {}) {
    this._logger.debug('identifySalientMoments called', {
      textLength: transcriptText?.length,
      maxMoments: options.maxMoments
    });
    const t0 = Date.now();

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
      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Identify the most dramatic moments from this session:\n\n${processedText}`
        }
      ];

      const result = await this.#provider.chat(messages, {
        model: this._model,
        temperature: this._momentTemperature,
        responseFormat: { type: 'json_object' }
      });

      const content = result.content;
      if (!content) {
        throw new Error('Moment extraction received empty response from provider');
      }
      const parsed = JSON.parse(content);

      // Extract moments array
      const moments = parsed.moments || [];

      // Normalize and validate moments
      const validatedMoments = moments
        .slice(0, maxMoments)
        .map((moment, index) => this._normalizeMoment(moment, index));

      this._logger.log(`Identified ${validatedMoments.length} salient moments`);

      this._logger.debug(`identifySalientMoments completed in ${Date.now() - t0}ms`, {
        momentCount: validatedMoments.length
      });
      return validatedMoments;
    } catch (error) {
      if (error instanceof SyntaxError) {
        this._logger.error(
          `identifySalientMoments failed after ${Date.now() - t0}ms: Failed to parse moments response as JSON`
        );
        throw new OpenAIError(
          'Moment identification returned invalid JSON',
          OpenAIErrorType.API_ERROR
        );
      }
      this._logger.error(
        `identifySalientMoments failed after ${Date.now() - t0}ms: ${error.message}`,
        { textLength: transcriptText?.length }
      );
      throw error;
    }
  }

  /**
   * Extract relationships between entities from transcript text
   * Uses GPT-4o to identify and categorize connections between characters, locations, and items
   *
   * @param {string} transcriptText - The full transcription text
   * @param {Array<object>} entities - Previously extracted entities to find relationships between
   * @param {object} [options] - Extraction options
   * @param {number} [options.minConfidence=5] - Minimum confidence score (1-10) for including relationships
   * @param {string} [options.campaignContext] - Additional context about the campaign
   * @returns {Promise<Array<ExtractedRelationship>>} Array of detected relationships
   */
  async extractRelationships(transcriptText, entities, options = {}) {
    this._logger.debug('extractRelationships called', {
      textLength: transcriptText?.length,
      entityCount: entities?.length,
      minConfidence: options.minConfidence
    });
    const t0 = Date.now();

    if (!transcriptText || typeof transcriptText !== 'string') {
      throw new OpenAIError(
        'Invalid transcript: expected non-empty string',
        OpenAIErrorType.INVALID_REQUEST_ERROR
      );
    }

    if (!entities || !Array.isArray(entities)) {
      throw new OpenAIError(
        'Invalid entities: expected array of entity objects',
        OpenAIErrorType.INVALID_REQUEST_ERROR
      );
    }

    if (entities.length === 0) {
      this._logger.debug('No entities provided, skipping relationship extraction');
      return [];
    }

    // Trim very long transcripts to avoid token limits
    const processedText = this._truncateTranscript(transcriptText);

    // Build entity list for context
    const entityNames = entities.map((e) => e.name).filter(Boolean);

    const systemPrompt = this._buildRelationshipSystemPrompt(entityNames, options);

    this._logger.log(`Extracting relationships between ${entityNames.length} entities`);

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Analyze relationships between entities in this RPG session transcript:\n\n${processedText}`
        }
      ];

      const result = await this.#provider.chat(messages, {
        model: this._model,
        temperature: this._extractionTemperature,
        responseFormat: { type: 'json_object' }
      });

      const content = result.content;
      if (!content) {
        throw new Error('Relationship extraction received empty response from provider');
      }
      const extracted = JSON.parse(content);

      // Validate and normalize the response
      const normalized = this._normalizeRelationshipResult(extracted, entityNames, options);

      this._logger.log(`Extracted ${normalized.length} relationships`);

      this._logger.debug(`extractRelationships completed in ${Date.now() - t0}ms`, {
        relationshipCount: normalized.length
      });
      return normalized;
    } catch (error) {
      if (error instanceof SyntaxError) {
        this._logger.error(
          `extractRelationships failed after ${Date.now() - t0}ms: Failed to parse relationship response as JSON`
        );
        throw new OpenAIError(
          'Relationship extraction returned invalid JSON',
          OpenAIErrorType.API_ERROR
        );
      }
      this._logger.error(
        `extractRelationships failed after ${Date.now() - t0}ms: ${error.message}`,
        { textLength: transcriptText?.length, entityCount: entities?.length }
      );
      throw error;
    }
  }

  /**
   * Extract both entities and salient moments in one call
   * More efficient than calling both methods separately
   *
   * @param {string} transcriptText - The full transcription text
   * @param {object} [options] - Options for both extraction and moment identification
   * @returns {Promise<CombinedExtractionResult>} Combined results
   */
  async extractAll(transcriptText, options = {}) {
    this._logger.debug('extractAll called', { textLength: transcriptText?.length });
    const t0 = Date.now();

    const results = await Promise.allSettled([
      this.extractEntities(transcriptText, options),
      this.identifySalientMoments(transcriptText, options)
    ]);

    let entities;
    let entitiesFailed = false;
    if (results[0].status === 'fulfilled') {
      entities = results[0].value;
    } else {
      this._logger.error('Entity extraction failed:', results[0].reason);
      entities = { characters: [], locations: [], items: [], summary: '', totalCount: 0 };
      entitiesFailed = true;
    }

    let moments;
    let momentsFailed = false;
    if (results[1].status === 'fulfilled') {
      moments = results[1].value;
    } else {
      this._logger.error('Moment extraction failed:', results[1].reason);
      moments = [];
      momentsFailed = true;
    }

    this._logger.debug(`extractAll completed in ${Date.now() - t0}ms`, {
      characters: entities.characters.length,
      locations: entities.locations.length,
      items: entities.items.length,
      moments: moments.length,
      partialFailure: entitiesFailed || momentsFailed
    });

    return {
      ...entities,
      moments,
      ...(entitiesFailed || momentsFailed
        ? {
            warnings: [
              ...(entitiesFailed ? ['Entity extraction failed; results may be incomplete'] : []),
              ...(momentsFailed ? ['Moment extraction failed; results may be incomplete'] : [])
            ]
          }
        : {})
    };
  }

  /**
   * Add known entity names to avoid duplicate extraction
   *
   * @param {string|string[]} names - Entity name(s) to add
   */
  addKnownEntities(names) {
    const nameList = Array.isArray(names) ? names : [names];
    nameList.forEach((name) => {
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
   * @param {object} options - Extraction options
   * @returns {string} System prompt
   * @private
   */
  _buildExtractionSystemPrompt(existingEntities, options = {}) {
    const ignoreList =
      existingEntities.length > 0
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
   * @param {object} options - Identification options
   * @returns {string} System prompt
   * @private
   */
  _buildMomentsSystemPrompt(maxMoments, options = {}) {
    const styleGuide = options.style ? `\nVisual style preference: ${options.style}` : '';

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
   * Build the system prompt for relationship extraction
   *
   * @param {string[]} entityNames - List of entity names to find relationships between
   * @param {object} options - Extraction options
   * @returns {string} System prompt
   * @private
   */
  _buildRelationshipSystemPrompt(entityNames, options = {}) {
    const entityList =
      entityNames.length > 0 ? `\n\nEntities to analyze: ${entityNames.join(', ')}` : '';

    const campaignContext = options.campaignContext
      ? `\nCampaign context: ${options.campaignContext}`
      : '';

    return `You are an expert at analyzing tabletop RPG session transcripts to identify relationships between entities.
Extract relationships mentioned in the transcript between the provided entities.

Relationship types:
- ally: Friendly cooperation, working together
- enemy: Hostile opposition, conflict
- family: Blood relatives or close familial bonds
- employer: One entity employs or commands the other
- employee: One entity works for or serves the other
- romantic: Romantic or intimate relationship
- friend: Personal friendship
- rival: Competitive but not hostile
- neutral: Acknowledged connection but no strong sentiment
- unknown: Relationship mentioned but type unclear

Rules:
1. Only extract relationships explicitly mentioned or clearly implied in the transcript
2. Focus on relationships between the provided entities
3. For each relationship, provide the source entity, target entity, relationship type, brief description, and confidence (1-10)
4. Confidence 10 = explicitly stated, 5 = clearly implied, 1 = vague mention
5. If a relationship is bidirectional (like "friends"), create one relationship with the most relevant source
6. Be conservative - only extract clear relationships${entityList}${campaignContext}

Return JSON in this exact format:
{
  "relationships": [
    {
      "sourceEntity": "Gandalf",
      "targetEntity": "Frodo",
      "relationType": "friend",
      "description": "Gandalf is a mentor and friend to Frodo",
      "confidence": 9
    }
  ],
  "summary": "Brief summary of relationships found"
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

    if (lastPeriod >= maxChars * 0.9) {
      return truncated.substring(0, lastPeriod + 1);
    }

    return truncated;
  }

  /**
   * Normalize and validate extraction result
   *
   * @param {object} extracted - Raw extraction result
   * @param {object} _options - Extraction options
   * @returns {ExtractionResult} Normalized result
   * @private
   */
  _normalizeExtractionResult(extracted, _options = {}) {
    // Ensure arrays exist
    const characters = Array.isArray(extracted.characters) ? extracted.characters : [];
    const locations = Array.isArray(extracted.locations) ? extracted.locations : [];
    const items = Array.isArray(extracted.items) ? extracted.items : [];

    // Normalize characters
    const normalizedCharacters = characters
      .filter((c) => c && c.name)
      .map((c) => ({
        name: String(c.name).trim(),
        description: String(c.description || '').trim(),
        isNPC: c.isNPC !== false, // Default to NPC
        role: String(c.role || 'unknown').trim(),
        entityType: ExtractedEntityType.CHARACTER
      }));

    // Normalize locations
    const normalizedLocations = locations
      .filter((l) => l && l.name)
      .map((l) => ({
        name: String(l.name).trim(),
        description: String(l.description || '').trim(),
        type: String(l.type || 'place').trim(),
        entityType: ExtractedEntityType.LOCATION
      }));

    // Normalize items
    const normalizedItems = items
      .filter((i) => i && i.name)
      .map((i) => ({
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
   * @param {object} moment - Raw moment data
   * @param {number} index - Moment index
   * @returns {SalientMoment} Normalized moment
   * @private
   */
  _normalizeMoment(moment, index) {
    // Parse drama score, default to 5 if invalid
    const parsedScore = parseInt(moment.dramaScore, 10);
    const dramaScore = isNaN(parsedScore) ? 5 : Math.min(10, Math.max(1, parsedScore));

    return {
      id: `moment-${index + 1}`,
      title: String(moment.title || `Moment ${index + 1}`).trim(),
      imagePrompt: String(moment.imagePrompt || '').trim(),
      context: String(moment.context || '').trim(),
      dramaScore
    };
  }

  /**
   * Normalize and validate relationship extraction result
   *
   * @param {object} extracted - Raw extraction result
   * @param {string[]} validEntityNames - List of valid entity names
   * @param {object} options - Extraction options
   * @returns {Array<ExtractedRelationship>} Normalized relationships
   * @private
   */
  _normalizeRelationshipResult(extracted, validEntityNames, options = {}) {
    const minConfidence = options.minConfidence || 5;

    // Ensure relationships array exists
    const relationships = Array.isArray(extracted.relationships) ? extracted.relationships : [];

    // Create a case-insensitive lookup for valid entity names
    const validNamesLower = new Set(validEntityNames.map((n) => n.toLowerCase()));

    // Normalize and filter relationships
    const normalizedRelationships = relationships
      .filter((r) => r && r.sourceEntity && r.targetEntity)
      .map((r, index) => {
        // Normalize entity names
        const source = String(r.sourceEntity).trim();
        const target = String(r.targetEntity).trim();

        // Validate confidence
        const rawConfidence = parseInt(r.confidence, 10);
        const confidence = Math.min(
          10,
          Math.max(1, Number.isNaN(rawConfidence) ? 5 : rawConfidence)
        );

        // Validate relationship type
        let relationType = String(r.relationType || '')
          .toLowerCase()
          .trim();
        const validTypes = Object.values(RelationshipType);
        if (!validTypes.includes(relationType)) {
          relationType = RelationshipType.UNKNOWN;
        }

        return {
          id: `relationship-${index + 1}`,
          sourceEntity: source,
          targetEntity: target,
          relationType,
          description: String(r.description || '').trim(),
          confidence
        };
      })
      // Filter by confidence threshold
      .filter((r) => r.confidence >= minConfidence)
      // Filter out relationships where entities aren't in the valid list (case-insensitive)
      .filter((r) => {
        const sourceValid = validNamesLower.has(r.sourceEntity.toLowerCase());
        const targetValid = validNamesLower.has(r.targetEntity.toLowerCase());
        if (!sourceValid || !targetValid) {
          this._logger.debug(
            `Filtered out relationship: ${r.sourceEntity} -> ${r.targetEntity} (entity not in list)`
          );
          return false;
        }
        return true;
      })
      // Filter out self-relationships
      .filter((r) => r.sourceEntity.toLowerCase() !== r.targetEntity.toLowerCase());

    return normalizedRelationships;
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
   * @returns {Array<object>} List of available models
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
   * @returns {object} Cost estimate
   */
  estimateCost(transcriptText) {
    if (!transcriptText) {
      return { estimatedTokens: 0, estimatedCostUSD: 0 };
    }

    // Rough estimate: ~4 characters per token
    const inputTokens = Math.ceil(transcriptText.length / 4);
    const outputTokens = 500; // Typical output size

    // GPT-4o pricing (as of spec)
    const inputCostPer1M = 2.5;
    const outputCostPer1M = 10.0;

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
 * @typedef {object} ExtractionResult
 * @property {Array<ExtractedCharacter>} characters - Extracted character entities
 * @property {Array<ExtractedLocation>} locations - Extracted location entities
 * @property {Array<ExtractedItem>} items - Extracted item entities
 * @property {string} summary - Brief summary of extracted entities
 * @property {number} totalCount - Total number of entities extracted
 */

/**
 * @typedef {object} ExtractedCharacter
 * @property {string} name - Character name
 * @property {string} description - Brief description
 * @property {boolean} isNPC - Whether this is an NPC (vs PC)
 * @property {string} role - Character role (merchant, guard, villain, etc.)
 * @property {string} entityType - Always 'character'
 */

/**
 * @typedef {object} ExtractedLocation
 * @property {string} name - Location name
 * @property {string} description - Brief description
 * @property {string} type - Location type (tavern, city, dungeon, etc.)
 * @property {string} entityType - Always 'location'
 */

/**
 * @typedef {object} ExtractedItem
 * @property {string} name - Item name
 * @property {string} description - Brief description
 * @property {string} type - Item type (weapon, armor, artifact, etc.)
 * @property {string} entityType - Always 'item'
 */

/**
 * @typedef {object} SalientMoment
 * @property {string} id - Unique moment identifier
 * @property {string} title - Brief, evocative title
 * @property {string} imagePrompt - Detailed prompt for DALL-E image generation
 * @property {string} context - Relevant context from the transcript
 * @property {number} dramaScore - Drama score from 1-10
 */

/**
 * @typedef {object} CombinedExtractionResult
 * @property {Array<ExtractedCharacter>} characters - Extracted character entities
 * @property {Array<ExtractedLocation>} locations - Extracted location entities
 * @property {Array<ExtractedItem>} items - Extracted item entities
 * @property {string} summary - Brief summary of extracted entities
 * @property {number} totalCount - Total number of entities extracted
 * @property {Array<SalientMoment>} moments - Identified salient moments
 */

/**
 * @typedef {object} ExtractedRelationship
 * @property {string} id - Unique relationship identifier
 * @property {string} sourceEntity - Name of the source entity
 * @property {string} targetEntity - Name of the target entity
 * @property {string} relationType - Type of relationship (from RelationshipType enum)
 * @property {string} description - Brief description of the relationship
 * @property {number} confidence - Confidence score from 1-10
 */

// Export all classes and enums
export {
  EntityExtractor,
  ExtractedEntityType,
  CharacterType,
  RelationshipType,
  ENTITY_EXTRACTION_TIMEOUT_MS,
  DEFAULT_MAX_MOMENTS
};
