/**
 * EntityProcessor - Entity Extraction Workflow Management
 *
 * Handles entity extraction from session transcripts including NPCs, locations,
 * items, and relationships. Integrates with Kanka to avoid duplicate entity
 * creation and provides progress tracking.
 *
 * @class EntityProcessor
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * EntityProcessor class for managing entity extraction workflows
 *
 * @example
 * const processor = new EntityProcessor({
 *   entityExtractor: entityExtractorInstance,
 *   kankaService: kankaServiceInstance
 * });
 *
 * const result = await processor.extractEntities(transcriptText, {
 *   includePlayerCharacters: false,
 *   onProgress: (progress, message) => console.log(message)
 * });
 */
class EntityProcessor {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('EntityProcessor');

  /**
   * Entity extraction service
   * @type {object | null}
   * @private
   */
  _entityExtractor = null;

  /**
   * Kanka API service for duplicate checking
   * @type {object | null}
   * @private
   */
  _kankaService = null;

  /**
   * Create a new EntityProcessor instance
   *
   * @param {object} options - Configuration options
   * @param {object} options.entityExtractor - EntityExtractor service instance
   * @param {object} [options.kankaService] - KankaService instance (optional, for duplicate checking)
   */
  constructor(options = {}) {
    if (!options.entityExtractor) {
      throw new Error('EntityProcessor requires an entityExtractor');
    }

    this._entityExtractor = options.entityExtractor;
    this._kankaService = options.kankaService || null;

    this._logger.debug('EntityProcessor initialized');
  }

  /**
   * Extract entities from transcript text
   *
   * @param {string} transcriptText - The full transcription text
   * @param {object} [options] - Extraction options
   * @param {boolean} [options.includePlayerCharacters=false] - Whether to include PCs
   * @param {string} [options.campaignContext] - Additional context about the campaign
   * @param {Function} [options.onProgress] - Progress callback (progress: number, message: string)
   * @param {boolean} [options.checkDuplicates=true] - Whether to check Kanka for existing entities
   * @returns {Promise<ExtractionResult|null>} Extracted entities or null on error
   */
  async extractEntities(transcriptText, options = {}) {
    if (!transcriptText || typeof transcriptText !== 'string') {
      this._logger.warn('No transcript text available for entity extraction');
      return null;
    }

    this._logger.log('Extracting entities...');

    const onProgress = options.onProgress || (() => {});
    onProgress(0, 'Extracting entities from transcript...');

    try {
      // Get existing entities from Kanka to avoid duplicates
      let existingEntities = [];
      if (options.checkDuplicates !== false && this._kankaService) {
        try {
          existingEntities = await this.getExistingKankaEntities();
        } catch (error) {
          this._logger.warn('Could not fetch existing Kanka entities:', error.message);
        }
      }

      // Extract entities and salient moments
      const extractionResult = await this._entityExtractor.extractAll(transcriptText, {
        existingEntities,
        includePlayerCharacters: options.includePlayerCharacters,
        campaignContext: options.campaignContext
      });

      onProgress(100, 'Entity extraction complete');

      this._logger.log(
        `Extracted ${extractionResult.totalCount || 0} entities, ` +
          `${extractionResult.moments?.length || 0} salient moments`
      );

      return extractionResult;
    } catch (error) {
      this._logger.error('Entity extraction failed:', error);
      // Don't throw - extraction failure shouldn't stop the workflow
      return null;
    }
  }

  /**
   * Extract relationships between entities from transcript text
   *
   * @param {string} transcriptText - The full transcription text
   * @param {object} extractionResult - Entity extraction result containing characters, locations, and items
   * @param {object} [options] - Extraction options
   * @param {string} [options.campaignContext] - Additional context about the campaign
   * @param {number} [options.minConfidence=5] - Minimum confidence score (1-10) for relationships
   * @param {Function} [options.onProgress] - Progress callback (progress: number, message: string)
   * @returns {Promise<Array|null>} Extracted relationships or empty array on error
   */
  async extractRelationships(transcriptText, extractionResult, options = {}) {
    if (!transcriptText || typeof transcriptText !== 'string') {
      this._logger.warn('No transcript text available for relationship extraction');
      return [];
    }

    if (!this._entityExtractor?.extractRelationships) {
      this._logger.warn('Entity extractor does not support relationship extraction');
      return [];
    }

    this._logger.log('Extracting relationships...');

    const onProgress = options.onProgress || (() => {});
    onProgress(0, 'Extracting relationships from transcript...');

    try {
      // Build flat list of all entities
      const allEntities = [
        ...(extractionResult.characters || []),
        ...(extractionResult.locations || []),
        ...(extractionResult.items || [])
      ];

      if (allEntities.length === 0) {
        this._logger.debug('No entities to extract relationships for');
        return [];
      }

      // Extract relationships
      const relationships = await this._entityExtractor.extractRelationships(
        transcriptText,
        allEntities,
        {
          campaignContext: options.campaignContext,
          minConfidence: options.minConfidence || 5
        }
      );

      onProgress(100, 'Relationship extraction complete');

      this._logger.log(`Extracted ${relationships?.length || 0} relationships`);

      return relationships || [];
    } catch (error) {
      this._logger.error('Relationship extraction failed:', error);
      // Don't throw - relationship extraction failure shouldn't stop the workflow
      return [];
    }
  }

  /**
   * Get list of existing entity names from Kanka
   *
   * @returns {Promise<string[]>} Array of entity names
   */
  async getExistingKankaEntities() {
    if (!this._kankaService) {
      this._logger.debug('No Kanka service configured, skipping duplicate check');
      return [];
    }

    const names = [];

    try {
      // Pre-fetch entity types (uses cache if valid, otherwise fetches fresh)
      const entities = await this._kankaService.preFetchEntities({
        types: ['characters', 'locations', 'items']
      });

      // Extract names from each entity type
      if (entities.characters?.data) {
        names.push(...entities.characters.data.map((c) => c.name));
      }
      if (entities.locations?.data) {
        names.push(...entities.locations.data.map((l) => l.name));
      }
      if (entities.items?.data) {
        names.push(...entities.items.data.map((i) => i.name));
      }

      this._logger.debug(`Found ${names.length} existing entities in Kanka`);
    } catch (error) {
      this._logger.warn('Failed to fetch existing entities:', error.message);
    }

    return names;
  }

  /**
   * Update the entity extractor service
   *
   * @param {object} entityExtractor - New EntityExtractor instance
   */
  updateEntityExtractor(entityExtractor) {
    if (!entityExtractor) {
      throw new Error('EntityExtractor cannot be null');
    }
    this._entityExtractor = entityExtractor;
    this._logger.debug('Entity extractor updated');
  }

  /**
   * Update the Kanka service
   *
   * @param {object} kankaService - New KankaService instance
   */
  updateKankaService(kankaService) {
    this._kankaService = kankaService;
    this._logger.debug('Kanka service updated');
  }

  /**
   * Check if Kanka service is available for duplicate checking
   *
   * @returns {boolean} True if Kanka service is configured
   */
  hasKankaService() {
    return !!this._kankaService;
  }
}

export { EntityProcessor };
