/**
 * KankaPublisher - Kanka Publishing Workflow
 *
 * Handles publishing session data to Kanka.io:
 * 1. Create character/location/item entities
 * 2. Upload generated images to entities
 * 3. Create journal entry (chronicle)
 *
 * @class KankaPublisher
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Result object for Kanka publishing operations
 * @typedef {object} KankaPublishResult
 * @property {object | null} journal - Created journal entry
 * @property {Array<object>} characters - Created character entities
 * @property {Array<object>} locations - Created location entities
 * @property {Array<object>} items - Created item entities
 * @property {Array<object>} images - Uploaded images
 * @property {Array<object>} errors - Errors encountered during publishing
 */

/**
 * Session data object
 * @typedef {object} SessionData
 * @property {string} title - Session title
 * @property {string} date - Session date
 * @property {object} transcript - Transcript data with segments
 * @property {object} entities - Extracted entities (characters, locations, items)
 * @property {Array<object>} moments - Salient moments from session
 * @property {Array<object>} images - Generated images
 */

/**
 * KankaPublisher class for managing Kanka publishing workflows
 *
 * @example
 * const publisher = new KankaPublisher(kankaService, narrativeExporter, {
 *   onProgress: (progress) => console.log(progress)
 * });
 *
 * const result = await publisher.publishSession(sessionData, {
 *   createEntities: true,
 *   uploadImages: true,
 *   createChronicle: true
 * });
 */
class KankaPublisher {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('KankaPublisher');

  /**
   * Kanka API service
   * @type {object | null}
   * @private
   */
  _kankaService = null;

  /**
   * Narrative exporter for chronicle formatting
   * @type {object | null}
   * @private
   */
  _narrativeExporter = null;

  /**
   * Progress callback
   * @type {Function|null}
   * @private
   */
  _onProgress = null;

  /**
   * Chronicle format option
   * @type {string}
   * @private
   */
  _chronicleFormat = 'full';

  /**
   * Create a new KankaPublisher instance
   *
   * @param {object} kankaService - KankaService instance
   * @param {object} [narrativeExporter] - NarrativeExporter instance (optional)
   * @param {object} [options] - Configuration options
   * @param {Function} [options.onProgress] - Progress callback function
   * @param {string} [options.chronicleFormat='full'] - Chronicle format ('full', 'summary', 'basic')
   */
  constructor(kankaService, narrativeExporter = null, options = {}) {
    this._kankaService = kankaService;
    this._narrativeExporter = narrativeExporter;
    this._onProgress = options.onProgress || null;
    this._chronicleFormat = options.chronicleFormat || 'full';

    this._logger.debug('KankaPublisher initialized');
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Publish session data to Kanka
   * Creates journal entry (chronicle) and optionally entities with images
   *
   * @param {SessionData} sessionData - Session data to publish
   * @param {object} [options] - Publishing options
   * @param {boolean} [options.createEntities=true] - Create character/location/item entities
   * @param {boolean} [options.uploadImages=true] - Upload generated images to entities
   * @param {boolean} [options.createChronicle=true] - Create journal entry
   * @param {Function} [options.onProgress] - Progress callback (progress: number, message: string)
   * @returns {Promise<KankaPublishResult>} Publishing results
   * @throws {Error} If publishing fails
   */
  async publishSession(sessionData, options = {}) {
    if (!sessionData) {
      throw new Error('No session data provided to publish.');
    }

    if (!this._kankaService) {
      throw new Error('Kanka service not configured.');
    }

    const createEntities = options.createEntities ?? true;
    const uploadImages = options.uploadImages ?? true;
    const createChronicle = options.createChronicle ?? true;

    // Use provided onProgress or fall back to constructor's onProgress
    const originalOnProgress = this._onProgress;
    if (options.onProgress) {
      this._onProgress = options.onProgress;
    }

    try {
      this._logger.log('Publishing to Kanka...');
      this._reportProgress(0, 'Preparing Kanka export...');

      const results = {
        journal: null,
        characters: [],
        locations: [],
        items: [],
        images: [],
        errors: []
      };

      // Create entities first (so we can link them to the journal)
      if (createEntities && sessionData.entities) {
        await this.createEntities(sessionData, results, uploadImages);
      }

      // Create chronicle journal
      if (createChronicle) {
        await this.createChronicle(sessionData, results);
      }

      this._reportProgress(100, 'Publishing complete');
      this._logger.log('Published to Kanka successfully');

      return results;
    } catch (error) {
      this._logger.error('Publishing failed:', error);
      throw error;
    } finally {
      // Restore original onProgress
      this._onProgress = originalOnProgress;
    }
  }

  /**
   * Create entities in Kanka
   *
   * @param {SessionData} sessionData - Session data containing entities
   * @param {KankaPublishResult} results - Results object to populate
   * @param {boolean} uploadImages - Whether to upload images
   * @returns {Promise<void>}
   */
  async createEntities(sessionData, results, uploadImages = true) {
    const entities = sessionData.entities;

    if (!entities) {
      this._logger.warn('No entities to create');
      return;
    }

    // Create characters
    if (entities.characters?.length > 0) {
      this._reportProgress(20, 'Creating characters...');

      for (const character of entities.characters) {
        try {
          const created = await this._kankaService.createIfNotExists('characters', {
            name: character.name,
            entry: character.description,
            type: character.isNPC ? 'NPC' : 'PC'
          });

          if (!created._alreadyExisted) {
            results.characters.push(created);

            // Upload portrait if available
            if (uploadImages) {
              const portrait = this._findImageForEntity(sessionData, 'character', character.name);
              if (portrait?.url) {
                try {
                  await this._kankaService.uploadCharacterImage(created.id, portrait.url);
                  results.images.push({ entityId: created.id, entityType: 'character' });
                } catch (imgError) {
                  this._logger.warn(
                    `Failed to upload portrait for ${character.name}:`,
                    imgError.message
                  );
                }
              }
            }
          }
        } catch (error) {
          results.errors.push({ entity: character.name, type: 'character', error: error.message });
        }
      }
    }

    // Create locations
    if (entities.locations?.length > 0) {
      this._reportProgress(40, 'Creating locations...');

      for (const location of entities.locations) {
        try {
          const created = await this._kankaService.createIfNotExists('locations', {
            name: location.name,
            entry: location.description,
            type: location.type
          });

          if (!created._alreadyExisted) {
            results.locations.push(created);
          }
        } catch (error) {
          results.errors.push({ entity: location.name, type: 'location', error: error.message });
        }
      }
    }

    // Create items
    if (entities.items?.length > 0) {
      this._reportProgress(60, 'Creating items...');

      for (const item of entities.items) {
        try {
          const created = await this._kankaService.createIfNotExists('items', {
            name: item.name,
            entry: item.description,
            type: item.type
          });

          if (!created._alreadyExisted) {
            results.items.push(created);
          }
        } catch (error) {
          results.errors.push({ entity: item.name, type: 'item', error: error.message });
        }
      }
    }
  }

  /**
   * Create chronicle journal in Kanka
   *
   * @param {SessionData} sessionData - Session data
   * @param {KankaPublishResult} results - Results object to populate
   * @returns {Promise<void>}
   */
  async createChronicle(sessionData, results) {
    this._reportProgress(80, 'Creating chronicle...');

    // Format chronicle using NarrativeExporter if available
    let chronicleData;

    if (this._narrativeExporter) {
      chronicleData = this._narrativeExporter.export(
        {
          title: sessionData.title,
          date: sessionData.date,
          segments: sessionData.transcript?.segments || [],
          entities: sessionData.entities,
          moments: sessionData.moments
        },
        {
          format: this._chronicleFormat,
          includeEntities: true,
          includeMoments: true,
          includeTimestamps: false
        }
      );
    } else {
      // Basic chronicle without NarrativeExporter
      chronicleData = {
        name: sessionData.title,
        entry: this._formatBasicChronicle(sessionData),
        type: 'Session Chronicle',
        date: sessionData.date
      };
    }

    try {
      const journal = await this._kankaService.createJournal(chronicleData);
      results.journal = journal;

      this._logger.log(`Chronicle created: ${journal.name} (ID: ${journal.id})`);
    } catch (error) {
      results.errors.push({ entity: chronicleData.name, type: 'journal', error: error.message });
      throw error;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Report progress to callback
   *
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} [message] - Optional status message
   * @private
   */
  _reportProgress(progress, message = '') {
    if (this._onProgress) {
      this._onProgress(progress, message);
    }
  }

  /**
   * Format a basic chronicle without NarrativeExporter
   *
   * @param {SessionData} sessionData - Session data
   * @returns {string} Basic HTML chronicle content
   * @private
   */
  _formatBasicChronicle(sessionData) {
    const parts = [];

    // Header
    parts.push(`<h2>${sessionData.title}</h2>`);
    parts.push(`<p><em>Date: ${sessionData.date}</em></p>`);

    // Summary of entities
    if (sessionData.entities) {
      const entityCount =
        (sessionData.entities.characters?.length || 0) +
        (sessionData.entities.locations?.length || 0) +
        (sessionData.entities.items?.length || 0);

      if (entityCount > 0) {
        parts.push(`<p>This session introduced ${entityCount} new entities.</p>`);
      }
    }

    // Basic transcript
    if (sessionData.transcript?.segments?.length > 0) {
      parts.push('<h3>Transcript</h3>');
      parts.push('<div class="transcript">');

      for (const segment of sessionData.transcript.segments.slice(0, 50)) {
        const speaker = segment.speaker || 'Unknown';
        const text = segment.text || '';
        parts.push(`<p><strong>${speaker}:</strong> ${text}</p>`);
      }

      if (sessionData.transcript.segments.length > 50) {
        parts.push(
          `<p><em>... and ${sessionData.transcript.segments.length - 50} more segments</em></p>`
        );
      }

      parts.push('</div>');
    }

    parts.push('<hr>');
    parts.push('<p><em>Generated by VoxChronicle</em></p>');

    return parts.join('\n');
  }

  /**
   * Find a generated image for an entity
   *
   * @param {SessionData} sessionData - Session data containing images
   * @param {string} entityType - Entity type
   * @param {string} entityName - Entity name
   * @returns {object | null} Image result or null
   * @private
   */
  _findImageForEntity(sessionData, entityType, entityName) {
    if (!sessionData.images?.length) {
      return null;
    }

    return (
      sessionData.images.find((img) => {
        if (img.success === false) return false;
        if (img.entityType !== entityType) return false;
        if (img.meta?.characterName === entityName) return true;
        return false;
      }) || null
    );
  }
}

// Export class and types
export { KankaPublisher };
