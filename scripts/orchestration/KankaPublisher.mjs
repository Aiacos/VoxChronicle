/**
 * KankaPublisher - Kanka Publishing Workflow
 *
 * Handles publishing session data to Kanka.io:
 * 1. Create journal entry (chronicle) FIRST
 * 2. Create character sub-journals under the chronicle
 * 3. Create location/item entities only if validated against Foundry journal
 *
 * Characters are published as sub-journals (child journals) under the main
 * chronicle, not as separate character entities. Locations and items are only
 * created if they correspond to entities actually present in the adventure
 * journal, using descriptions from the journal directly.
 *
 * @class KankaPublisher
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { escapeHtml } from '../utils/HtmlUtils.mjs';

/**
 * Result object for Kanka publishing operations
 * @typedef {object} KankaPublishResult
 * @property {object | null} journal - Created journal entry (main chronicle)
 * @property {Array<object>} characters - Created character sub-journals
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
 * @property {string} [journalText] - Full text from Foundry adventure journal
 * @property {Array<object>} [npcProfiles] - NPC profiles extracted from Foundry journal
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
   *
   * Creates chronicle journal FIRST, then character sub-journals, then
   * validated location/item entities. Characters are always created as
   * sub-journals under the chronicle. Locations and items are only created
   * if they match entities found in the Foundry adventure journal.
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

      // Create chronicle journal FIRST (characters need the parent journal ID)
      if (createChronicle) {
        await this._createChronicle(sessionData, results);
      }

      // Create entities (characters as sub-journals, validated locations/items)
      if (createEntities && sessionData.entities) {
        await this._createEntities(sessionData, results, uploadImages);
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

  // ============================================================================
  // Private - Chronicle Creation
  // ============================================================================

  /**
   * Create chronicle journal in Kanka
   *
   * @param {SessionData} sessionData - Session data
   * @param {KankaPublishResult} results - Results object to populate
   * @returns {Promise<void>}
   * @private
   */
  async _createChronicle(sessionData, results) {
    this._reportProgress(10, 'Creating chronicle...');

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
  // Private - Entity Creation
  // ============================================================================

  /**
   * Create entities in Kanka
   *
   * Characters are created as sub-journals under the main chronicle.
   * Locations and items are only created if validated against the Foundry
   * adventure journal content.
   *
   * @param {SessionData} sessionData - Session data containing entities
   * @param {KankaPublishResult} results - Results object to populate
   * @param {boolean} uploadImages - Whether to upload images
   * @returns {Promise<void>}
   * @private
   */
  async _createEntities(sessionData, results, uploadImages = true) {
    const entities = sessionData.entities;

    if (!entities) {
      this._logger.warn('No entities to create');
      return;
    }

    // Pre-fetch existing Kanka entities for deduplication of locations/items
    this._logger.debug('Pre-fetching Kanka entities for cache...');
    await this._kankaService.preFetchEntities({ types: ['journals', 'locations', 'items'] });

    // Create character sub-journals under the main chronicle
    if (entities.characters?.length > 0) {
      await this._createCharacterSubJournals(sessionData, entities.characters, results, uploadImages);
    }

    // Create locations (only if validated against Foundry journal)
    if (entities.locations?.length > 0) {
      await this._createValidatedLocations(sessionData, entities.locations, results);
    }

    // Create items (only if validated against Foundry journal)
    if (entities.items?.length > 0) {
      await this._createValidatedItems(sessionData, entities.items, results);
    }
  }

  /**
   * Create character sub-journals under the main chronicle journal.
   * Each character gets its own child journal entry linked to the chronicle
   * via the journal_id field.
   *
   * @param {SessionData} sessionData - Session data
   * @param {Array<object>} characters - Character entities to create
   * @param {KankaPublishResult} results - Results object to populate
   * @param {boolean} uploadImages - Whether to upload images
   * @returns {Promise<void>}
   * @private
   */
  async _createCharacterSubJournals(sessionData, characters, results, uploadImages) {
    this._reportProgress(30, 'Creating character journals...');

    const parentJournalId = results.journal?.id;
    if (!parentJournalId) {
      this._logger.warn('No parent chronicle journal - skipping character sub-journals');
      return;
    }

    for (const character of characters) {
      try {
        // Build character description: prefer Foundry journal description if available
        const journalDescription = this._findJournalDescription(
          sessionData, character.name, 'character'
        );
        const description = journalDescription || character.description || '';

        const typeLabel = character.isNPC ? 'NPC' : 'PC';
        const journal = await this._kankaService.createJournal({
          name: character.name,
          entry: description,
          type: typeLabel,
          journal_id: parentJournalId,
          date: sessionData.date
        });

        results.characters.push(journal);

        // Upload portrait if available
        if (uploadImages) {
          const portrait = this._findImageForEntity(sessionData, 'character', character.name);
          if (portrait?.url) {
            try {
              await this._kankaService.uploadJournalImage(journal.id, portrait.url);
              results.images.push({ entityId: journal.id, entityType: 'journal' });
            } catch (imgError) {
              this._logger.warn(
                `Failed to upload portrait for ${character.name}:`,
                imgError.message
              );
            }
          }
        }
      } catch (error) {
        results.errors.push({ entity: character.name, type: 'character', error: error.message });
      }
    }
  }

  /**
   * Create location entities in Kanka, only if the location name is found
   * in the Foundry adventure journal. Uses journal description when available.
   *
   * @param {SessionData} sessionData - Session data
   * @param {Array<object>} locations - Location entities to create
   * @param {KankaPublishResult} results - Results object to populate
   * @returns {Promise<void>}
   * @private
   */
  async _createValidatedLocations(sessionData, locations, results) {
    this._reportProgress(50, 'Creating locations...');

    for (const location of locations) {
      // Only create if entity exists in the adventure journal
      if (!this._isEntityInJournal(sessionData, location.name)) {
        this._logger.debug(`Skipping location "${location.name}" - not found in adventure journal`);
        continue;
      }

      try {
        const journalDescription = this._findJournalDescription(
          sessionData, location.name, 'location'
        );

        const created = await this._kankaService.createIfNotExists('locations', {
          name: location.name,
          entry: journalDescription || location.description,
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

  /**
   * Create item entities in Kanka, only if the item name is found
   * in the Foundry adventure journal. Uses journal description when available.
   *
   * @param {SessionData} sessionData - Session data
   * @param {Array<object>} items - Item entities to create
   * @param {KankaPublishResult} results - Results object to populate
   * @returns {Promise<void>}
   * @private
   */
  async _createValidatedItems(sessionData, items, results) {
    this._reportProgress(70, 'Creating items...');

    for (const item of items) {
      // Only create if entity exists in the adventure journal
      if (!this._isEntityInJournal(sessionData, item.name)) {
        this._logger.debug(`Skipping item "${item.name}" - not found in adventure journal`);
        continue;
      }

      try {
        const journalDescription = this._findJournalDescription(
          sessionData, item.name, 'item'
        );

        const created = await this._kankaService.createIfNotExists('items', {
          name: item.name,
          entry: journalDescription || item.description,
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

  // ============================================================================
  // Private - Journal Validation & Description Extraction
  // ============================================================================

  /**
   * Check if an entity name appears in the Foundry adventure journal.
   * If no journal text is available in sessionData, allows creation (graceful fallback).
   *
   * @param {SessionData} sessionData - Session data with optional journalText
   * @param {string} entityName - Entity name to search for
   * @returns {boolean} True if entity is found in journal or no journal is available
   * @private
   */
  _isEntityInJournal(sessionData, entityName) {
    // If no journal text is available, allow creation (graceful fallback)
    if (!sessionData.journalText) {
      return true;
    }

    // Case-insensitive search for the entity name in the journal text
    return sessionData.journalText.toLowerCase().includes(entityName.toLowerCase());
  }

  /**
   * Find an entity's description from the Foundry adventure journal.
   * Searches NPC profiles first (for characters), then extracts context
   * sentences from the journal text.
   *
   * @param {SessionData} sessionData - Session data with optional npcProfiles/journalText
   * @param {string} entityName - Entity name to find description for
   * @param {string} entityType - Entity type ('character', 'location', 'item')
   * @returns {string|null} Description from journal, or null if not found
   * @private
   */
  _findJournalDescription(sessionData, entityName, entityType) {
    // For characters, check NPC profiles first (richest source)
    if (entityType === 'character' && sessionData.npcProfiles?.length > 0) {
      const profile = sessionData.npcProfiles.find(
        (p) => p.name.toLowerCase() === entityName.toLowerCase()
      );
      if (profile?.description) {
        return profile.description;
      }
    }

    // Extract context from journal text
    if (!sessionData.journalText) {
      return null;
    }

    return this._extractContextFromText(sessionData.journalText, entityName);
  }

  /**
   * Extract context sentences about an entity from the journal text.
   * Returns up to 3 sentences that mention the entity name.
   *
   * @param {string} text - Full journal text
   * @param {string} entityName - Entity name to find context for
   * @returns {string|null} Context sentences or null if not found
   * @private
   */
  _extractContextFromText(text, entityName) {
    if (!text || !entityName) {
      return null;
    }

    const nameLower = entityName.toLowerCase();
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    const matchingSentences = sentences
      .filter((s) => s.toLowerCase().includes(nameLower))
      .map((s) => s.trim())
      .slice(0, 3);

    if (matchingSentences.length === 0) {
      return null;
    }

    return matchingSentences.join('. ') + '.';
  }

  // ============================================================================
  // Private - Helpers
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
    parts.push(`<h2>${escapeHtml(sessionData.title)}</h2>`);
    parts.push(`<p><em>Date: ${escapeHtml(sessionData.date)}</em></p>`);

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
        const speaker = escapeHtml(segment.speaker || 'Unknown');
        const text = escapeHtml(segment.text || '');
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
