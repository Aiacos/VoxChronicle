/**
 * VoxChronicle - Narrative Exporter
 *
 * Creates session summary narratives in Kanka from transcription data.
 * Handles the transformation of raw transcription segments into formatted
 * session notes, entity linking, and image attachment.
 *
 * @module vox-chronicle/kanka/NarrativeExporter
 */

import { Logger } from '../utils/Logger.mjs';
import { KankaClient, KankaEntityTypes, KankaError, KankaErrorCodes } from './KankaClient.mjs';
import { EntityMapper } from './EntityMapper.mjs';
import { TranscriptionService, TranscriptionState } from '../ai/TranscriptionService.mjs';

/**
 * Export state constants.
 * @readonly
 * @enum {string}
 */
export const ExportState = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  EXPORTING: 'exporting',
  COMPLETED: 'completed',
  ERROR: 'error'
};

/**
 * Narrative format options.
 * @readonly
 * @enum {string}
 */
export const NarrativeFormat = {
  /** Full transcript with all speaker dialogue */
  FULL_TRANSCRIPT: 'full_transcript',
  /** Summarized key moments and events */
  SUMMARY: 'summary',
  /** Theatrical script-style format */
  SCRIPT: 'script',
  /** Prose narrative format */
  PROSE: 'prose'
};

/**
 * Default tag names for session notes.
 * @constant {Object}
 */
const DEFAULT_TAGS = {
  SESSION: 'VoxChronicle Session',
  GENERATED: 'Auto-Generated'
};

/**
 * Session note metadata structure.
 * @typedef {Object} SessionMetadata
 * @property {Date} sessionDate - Date of the session
 * @property {number} sessionNumber - Session number in campaign
 * @property {number} duration - Session duration in seconds
 * @property {string[]} participants - List of participants
 * @property {string[]} locations - Locations visited
 * @property {string[]} npcs - NPCs encountered
 * @property {string[]} keyEvents - Key events that occurred
 */

/**
 * Export result structure.
 * @typedef {Object} ExportResult
 * @property {boolean} success - Whether export succeeded
 * @property {Object} note - Created Kanka note data
 * @property {Object[]} entities - Created/linked entities
 * @property {string[]} errors - Any errors encountered
 * @property {Object} stats - Export statistics
 */

/**
 * NarrativeExporter class for creating session summaries in Kanka.
 *
 * This class provides:
 * - Session summary note creation in Kanka
 * - Multiple narrative format options
 * - Entity extraction and linking
 * - Image attachment support
 * - Batch entity creation
 * - Session metadata tracking
 * - Direct integration with TranscriptionService
 *
 * @example
 * // Create exporter with Kanka client
 * const client = new KankaClient('token', 'campaignId');
 * const mapper = new EntityMapper();
 * const exporter = new NarrativeExporter(client, mapper);
 *
 * // Export a session
 * const result = await exporter.exportSession({
 *   title: 'Session 1: The Beginning',
 *   transcription: transcriptionResult,
 *   entities: extractedEntities,
 *   images: generatedImages
 * });
 *
 * @example
 * // Export with custom format
 * const result = await exporter.exportSession({
 *   title: 'Session 2',
 *   transcription: transcriptionResult,
 *   format: NarrativeFormat.PROSE,
 *   metadata: {
 *     sessionDate: new Date(),
 *     sessionNumber: 2,
 *     participants: ['GM', 'Alice', 'Bob']
 *   }
 * });
 *
 * @example
 * // Export directly from TranscriptionService
 * const transcriptionService = new TranscriptionService(openaiClient);
 * exporter.setTranscriptionService(transcriptionService);
 *
 * // After recording session...
 * const result = await exporter.exportFromTranscriptionService('Session 3: The Quest');
 */
export class NarrativeExporter {
  /**
   * Logger instance for this class.
   * @type {Logger}
   * @private
   */
  #logger = new Logger('NarrativeExporter');

  /**
   * Kanka client for API calls.
   * @type {KankaClient}
   * @private
   */
  #client;

  /**
   * Entity mapper for type conversion.
   * @type {EntityMapper}
   * @private
   */
  #mapper;

  /**
   * Transcription service reference for direct integration.
   * @type {TranscriptionService|null}
   * @private
   */
  #transcriptionService = null;

  /**
   * Current export state.
   * @type {string}
   * @private
   */
  #state = ExportState.IDLE;

  /**
   * Default narrative format.
   * @type {string}
   * @private
   */
  #defaultFormat = NarrativeFormat.FULL_TRANSCRIPT;

  /**
   * Session tag ID cache.
   * @type {number|null}
   * @private
   */
  #sessionTagId = null;

  /**
   * Generated tag ID cache.
   * @type {number|null}
   * @private
   */
  #generatedTagId = null;

  /**
   * Export history for tracking.
   * @type {ExportResult[]}
   * @private
   */
  #exportHistory = [];

  /**
   * Maximum history entries to keep.
   * @type {number}
   * @private
   */
  #maxHistorySize = 50;

  /**
   * Callback for export progress updates.
   * @type {Function|null}
   * @private
   */
  #onProgress = null;

  /**
   * Creates a new NarrativeExporter instance.
   *
   * @param {KankaClient} client - Kanka client for API calls
   * @param {EntityMapper} [mapper] - Entity mapper for type conversion
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.defaultFormat] - Default narrative format
   * @param {Function} [options.onProgress] - Progress callback
   * @param {TranscriptionService} [options.transcriptionService] - TranscriptionService for direct integration
   */
  constructor(client, mapper = null, options = {}) {
    if (!client || !(client instanceof KankaClient)) {
      throw new Error('NarrativeExporter: Valid KankaClient instance required');
    }

    this.#client = client;
    this.#mapper = mapper ?? new EntityMapper();
    this.#defaultFormat = options.defaultFormat ?? NarrativeFormat.FULL_TRANSCRIPT;
    this.#onProgress = options.onProgress ?? null;
    this.#transcriptionService = options.transcriptionService ?? null;

    this.#logger.debug('NarrativeExporter created');
  }

  // ============================================================================
  // Public Properties
  // ============================================================================

  /**
   * Gets the current export state.
   * @returns {string} Current state from ExportState enum
   */
  get state() {
    return this.#state;
  }

  /**
   * Gets whether an export is in progress.
   * @returns {boolean} True if exporting
   */
  get isExporting() {
    return this.#state === ExportState.PREPARING ||
           this.#state === ExportState.EXPORTING;
  }

  /**
   * Gets whether the exporter is ready (client configured).
   * @returns {boolean} True if ready
   */
  get isReady() {
    return this.#client.isReady;
  }

  /**
   * Gets the default narrative format.
   * @returns {string} Format from NarrativeFormat enum
   */
  get defaultFormat() {
    return this.#defaultFormat;
  }

  /**
   * Gets export history.
   * @returns {ExportResult[]} Previous export results
   */
  get exportHistory() {
    return [...this.#exportHistory];
  }

  /**
   * Gets the EntityMapper instance.
   * @returns {EntityMapper} The entity mapper
   */
  get entityMapper() {
    return this.#mapper;
  }

  /**
   * Gets the TranscriptionService instance if set.
   * @returns {TranscriptionService|null} The transcription service or null
   */
  get transcriptionService() {
    return this.#transcriptionService;
  }

  /**
   * Gets whether a TranscriptionService is configured.
   * @returns {boolean} True if transcription service is set
   */
  get hasTranscriptionService() {
    return this.#transcriptionService !== null;
  }

  // ============================================================================
  // Public Methods - Service Integration
  // ============================================================================

  /**
   * Sets the TranscriptionService for direct integration.
   * Allows exporting directly from completed transcription sessions.
   *
   * @param {TranscriptionService} service - TranscriptionService instance
   */
  setTranscriptionService(service) {
    if (service && !(service instanceof TranscriptionService)) {
      this.#logger.warn('setTranscriptionService: Invalid TranscriptionService instance');
      return;
    }

    this.#transcriptionService = service;
    this.#logger.debug('TranscriptionService set');
  }

  /**
   * Sets the EntityMapper for entity type conversion.
   *
   * @param {EntityMapper} mapper - EntityMapper instance
   */
  setEntityMapper(mapper) {
    if (mapper && !(mapper instanceof EntityMapper)) {
      this.#logger.warn('setEntityMapper: Invalid EntityMapper instance');
      return;
    }

    this.#mapper = mapper ?? new EntityMapper();
    this.#logger.debug('EntityMapper set');
  }

  /**
   * Exports a session directly from the configured TranscriptionService.
   * Uses the current or last session's transcription data.
   *
   * @param {string} title - Note title for the export
   * @param {Object} [options={}] - Export options
   * @param {Object[]} [options.entities=[]] - Additional entities to include
   * @param {Object[]} [options.images=[]] - Images to include
   * @param {string} [options.format] - Narrative format to use
   * @param {SessionMetadata} [options.metadata={}] - Session metadata
   * @param {boolean} [options.createEntities=false] - Create entities in Kanka
   * @param {boolean} [options.includeImages=true] - Include images
   * @param {boolean} [options.is_private=false] - Make note private
   * @returns {Promise<ExportResult>} Export result
   * @throws {Error} If no TranscriptionService is configured or no transcription data available
   */
  async exportFromTranscriptionService(title, options = {}) {
    if (!this.#transcriptionService) {
      throw new Error('NarrativeExporter: No TranscriptionService configured. Call setTranscriptionService() first.');
    }

    // Get transcription data from the service
    const segments = this.#transcriptionService.segments;
    const speakers = this.#transcriptionService.getIdentifiedSpeakers();
    const summary = this.#transcriptionService.getSummary();

    if (!segments || segments.length === 0) {
      throw new Error('NarrativeExporter: No transcription data available from TranscriptionService');
    }

    // Build transcription result structure from service data
    const transcription = {
      text: this.#transcriptionService.fullText,
      segments: segments,
      language: summary.language || 'auto',
      duration: summary.totalDuration || 0,
      metadata: {
        sessionDuration: summary.sessionDuration,
        speakerNames: this.#transcriptionService.speakerNames,
        chunksProcessed: summary.chunker?.completedChunks || 0
      }
    };

    // Build metadata from transcription service if not provided
    const metadata = {
      sessionDate: new Date(),
      participants: speakers.length > 0 ? speakers : this.#transcriptionService.speakerNames,
      duration: summary.totalDuration || 0,
      ...options.metadata
    };

    this.#logger.info(`Exporting from TranscriptionService: ${title}`, {
      segments: segments.length,
      speakers: speakers.length,
      duration: summary.totalDuration
    });

    // Export using standard method
    return this.exportSession({
      title,
      transcription,
      entities: options.entities || [],
      images: options.images || [],
      format: options.format,
      metadata
    }, {
      createEntities: options.createEntities,
      includeImages: options.includeImages,
      is_private: options.is_private,
      additionalTags: options.additionalTags
    });
  }

  /**
   * Checks if the TranscriptionService has exportable data.
   *
   * @returns {boolean} True if transcription data is available
   */
  hasExportableTranscription() {
    if (!this.#transcriptionService) {
      return false;
    }

    const segments = this.#transcriptionService.segments;
    return segments && segments.length > 0;
  }

  /**
   * Gets a preview of what would be exported from the TranscriptionService.
   *
   * @param {string} [format] - Optional format override
   * @returns {Object|null} Preview data or null if no transcription available
   */
  previewTranscriptionServiceExport(format = null) {
    if (!this.hasExportableTranscription()) {
      return null;
    }

    const segments = this.#transcriptionService.segments;
    const summary = this.#transcriptionService.getSummary();

    const transcription = {
      text: this.#transcriptionService.fullText,
      segments: segments,
      language: 'auto',
      duration: summary.totalDuration || 0
    };

    return {
      segmentCount: segments.length,
      speakers: this.#transcriptionService.getIdentifiedSpeakers(),
      duration: summary.totalDuration,
      narrativePreview: this.previewNarrative(transcription, format || this.#defaultFormat)
    };
  }

  // ============================================================================
  // Public Methods - Export
  // ============================================================================

  /**
   * Exports a session to Kanka as a note with optional entity creation.
   *
   * @param {Object} sessionData - Session data to export
   * @param {string} sessionData.title - Note title
   * @param {Object} sessionData.transcription - Transcription result with segments
   * @param {Object[]} [sessionData.entities=[]] - Extracted entities to create/link
   * @param {Object[]} [sessionData.images=[]] - Generated images to include
   * @param {string} [sessionData.format] - Narrative format to use
   * @param {SessionMetadata} [sessionData.metadata={}] - Session metadata
   * @param {Object} [options={}] - Export options
   * @param {boolean} [options.createEntities=false] - Create new entities in Kanka
   * @param {boolean} [options.includeImages=true] - Include images in note
   * @param {boolean} [options.is_private=false] - Make note private
   * @param {number[]} [options.additionalTags=[]] - Additional tag IDs to apply
   * @returns {Promise<ExportResult>} Export result
   * @throws {KankaError} If export fails
   */
  async exportSession(sessionData, options = {}) {
    if (!this.isReady) {
      throw new Error('NarrativeExporter: Kanka client not configured');
    }

    if (this.isExporting) {
      throw new Error('NarrativeExporter: Export already in progress');
    }

    const {
      title,
      transcription,
      entities = [],
      images = [],
      format = this.#defaultFormat,
      metadata = {}
    } = sessionData;

    const {
      createEntities = false,
      includeImages = true,
      is_private = false,
      additionalTags = []
    } = options;

    if (!title || typeof title !== 'string') {
      throw new Error('NarrativeExporter: Session title is required');
    }

    this.#logger.info(`Starting export: ${title}`);
    this.#state = ExportState.PREPARING;
    this.#reportProgress('Starting export', 0);

    const result = {
      success: false,
      note: null,
      entities: [],
      errors: [],
      stats: {
        segmentsProcessed: 0,
        entitiesCreated: 0,
        entitiesLinked: 0,
        imagesIncluded: 0
      }
    };

    try {
      // Ensure tags exist
      this.#reportProgress('Preparing tags', 10);
      const tagIds = await this.#ensureSessionTags();
      tagIds.push(...additionalTags);

      // Create entities if requested
      this.#reportProgress('Processing entities', 20);
      if (createEntities && entities.length > 0) {
        const entityResults = await this.#createEntities(entities);
        result.entities = entityResults.created;
        result.stats.entitiesCreated = entityResults.created.length;
        result.stats.entitiesLinked = entityResults.linked.length;
        result.errors.push(...entityResults.errors);
      }

      // Format the narrative content
      this.#reportProgress('Formatting narrative', 50);
      const content = this.#formatNarrative({
        transcription,
        entities,
        images: includeImages ? images : [],
        format,
        metadata
      });

      result.stats.segmentsProcessed = transcription?.segments?.length || 0;
      result.stats.imagesIncluded = includeImages ? images.length : 0;

      // Create the note
      this.#reportProgress('Creating Kanka note', 70);
      this.#state = ExportState.EXPORTING;

      const noteResponse = await this.#client.createNote(title, content, {
        type: 'Session Summary',
        tags: tagIds,
        is_private
      });

      result.note = noteResponse.data;
      this.#reportProgress('Export completed', 100);

      result.success = true;
      this.#state = ExportState.COMPLETED;

      this.#logger.info(`Export completed: Note ID ${result.note?.id}`);
    } catch (error) {
      this.#state = ExportState.ERROR;
      result.errors.push(error.message);
      this.#logger.error('Export failed:', error.message);
      throw error;
    } finally {
      // Store in history
      this.#addToHistory(result);
    }

    return result;
  }

  /**
   * Exports transcription as a simple note without entity processing.
   *
   * @param {string} title - Note title
   * @param {Object} transcription - Transcription result
   * @param {Object} [options={}] - Export options
   * @returns {Promise<Object>} Created note data
   */
  async exportSimpleNote(title, transcription, options = {}) {
    const {
      format = this.#defaultFormat,
      is_private = false
    } = options;

    const content = this.#formatNarrative({
      transcription,
      entities: [],
      images: [],
      format,
      metadata: {}
    });

    const tagIds = await this.#ensureSessionTags();

    const response = await this.#client.createNote(title, content, {
      type: 'Session Summary',
      tags: tagIds,
      is_private
    });

    this.#logger.info(`Simple note created: ${title}`);
    return response.data;
  }

  /**
   * Adds a session update to an existing note.
   *
   * @param {number|string} noteId - ID of the note to update
   * @param {Object} transcription - New transcription data
   * @param {Object} [options={}] - Update options
   * @returns {Promise<Object>} Updated note data
   */
  async addSessionUpdate(noteId, transcription, options = {}) {
    const {
      title = 'Session Update',
      format = this.#defaultFormat
    } = options;

    // Get the note's entity ID first
    const note = await this.#client.getNote(noteId);
    const entityId = note.data?.entity_id;

    if (!entityId) {
      throw new Error(`NarrativeExporter: Could not find entity ID for note ${noteId}`);
    }

    // Format the update content
    const content = this.#formatNarrative({
      transcription,
      entities: [],
      images: [],
      format,
      metadata: {}
    });

    // Add as a post to the note's entity
    const response = await this.#client.addPostToEntity(entityId, title, content);

    this.#logger.info(`Session update added to note ${noteId}`);
    return response.data;
  }

  // ============================================================================
  // Public Methods - Configuration
  // ============================================================================

  /**
   * Sets the default narrative format.
   *
   * @param {string} format - Format from NarrativeFormat enum
   */
  setDefaultFormat(format) {
    if (!Object.values(NarrativeFormat).includes(format)) {
      this.#logger.warn(`Invalid format: ${format}, using default`);
      return;
    }

    this.#defaultFormat = format;
    this.#logger.debug(`Default format set: ${format}`);
  }

  /**
   * Sets the progress callback.
   *
   * @param {Function} callback - Progress callback (message, percent) => void
   */
  setProgressCallback(callback) {
    this.#onProgress = callback;
  }

  /**
   * Clears the cached tag IDs, forcing re-creation on next export.
   */
  clearTagCache() {
    this.#sessionTagId = null;
    this.#generatedTagId = null;
    this.#logger.debug('Tag cache cleared');
  }

  /**
   * Clears export history.
   */
  clearHistory() {
    this.#exportHistory = [];
    this.#logger.debug('Export history cleared');
  }

  // ============================================================================
  // Public Methods - Preview & Format
  // ============================================================================

  /**
   * Generates a preview of the formatted narrative without exporting.
   *
   * @param {Object} transcription - Transcription data
   * @param {string} [format] - Format to use
   * @param {Object} [metadata={}] - Session metadata
   * @returns {string} Formatted narrative HTML
   */
  previewNarrative(transcription, format = null, metadata = {}) {
    return this.#formatNarrative({
      transcription,
      entities: [],
      images: [],
      format: format ?? this.#defaultFormat,
      metadata
    });
  }

  /**
   * Gets available narrative formats.
   *
   * @returns {Object} Format options with descriptions
   */
  getAvailableFormats() {
    return {
      [NarrativeFormat.FULL_TRANSCRIPT]: {
        name: 'Full Transcript',
        description: 'Complete transcript with speaker attribution'
      },
      [NarrativeFormat.SUMMARY]: {
        name: 'Summary',
        description: 'Condensed key moments and events'
      },
      [NarrativeFormat.SCRIPT]: {
        name: 'Script',
        description: 'Theatrical script-style dialogue format'
      },
      [NarrativeFormat.PROSE]: {
        name: 'Prose',
        description: 'Narrative prose description of events'
      }
    };
  }

  // ============================================================================
  // Public Methods - Status
  // ============================================================================

  /**
   * Gets exporter status for debugging.
   *
   * @returns {Object} Status summary
   */
  getStatus() {
    return {
      state: this.#state,
      isReady: this.isReady,
      isExporting: this.isExporting,
      defaultFormat: this.#defaultFormat,
      sessionTagId: this.#sessionTagId,
      generatedTagId: this.#generatedTagId,
      historySize: this.#exportHistory.length,
      hasTranscriptionService: this.hasTranscriptionService,
      hasExportableTranscription: this.hasExportableTranscription(),
      clientStatus: this.#client.getStatus(),
      mapperStatus: this.#mapper.getStatus()
    };
  }

  /**
   * Gets the last export result.
   *
   * @returns {ExportResult|null} Last export result or null
   */
  getLastExport() {
    return this.#exportHistory.length > 0
      ? this.#exportHistory[this.#exportHistory.length - 1]
      : null;
  }

  // ============================================================================
  // Private Methods - Formatting
  // ============================================================================

  /**
   * Formats the narrative content based on the selected format.
   *
   * @param {Object} data - Data to format
   * @returns {string} HTML-formatted content
   * @private
   */
  #formatNarrative(data) {
    const { transcription, entities, images, format, metadata } = data;

    const parts = [];

    // Add metadata header
    const headerHtml = this.#formatMetadataHeader(metadata);
    if (headerHtml) {
      parts.push(headerHtml);
    }

    // Add images if present
    if (images && images.length > 0) {
      parts.push(this.#formatImages(images));
    }

    // Format main content based on format type
    switch (format) {
      case NarrativeFormat.FULL_TRANSCRIPT:
        parts.push(this.#formatFullTranscript(transcription));
        break;
      case NarrativeFormat.SUMMARY:
        parts.push(this.#formatSummary(transcription));
        break;
      case NarrativeFormat.SCRIPT:
        parts.push(this.#formatScript(transcription));
        break;
      case NarrativeFormat.PROSE:
        parts.push(this.#formatProse(transcription));
        break;
      default:
        parts.push(this.#formatFullTranscript(transcription));
    }

    // Add entity mentions if present
    if (entities && entities.length > 0) {
      parts.push(this.#formatEntityMentions(entities));
    }

    // Add footer with generation info
    parts.push(this.#formatFooter());

    return parts.join('\n\n');
  }

  /**
   * Formats the metadata header section.
   *
   * @param {SessionMetadata} metadata - Session metadata
   * @returns {string} HTML-formatted header
   * @private
   */
  #formatMetadataHeader(metadata) {
    if (!metadata || Object.keys(metadata).length === 0) {
      return '';
    }

    const lines = ['<div class="session-metadata">'];

    if (metadata.sessionDate) {
      const dateStr = metadata.sessionDate instanceof Date
        ? metadata.sessionDate.toLocaleDateString()
        : metadata.sessionDate;
      lines.push(`<p><strong>Date:</strong> ${this.#escapeHtml(dateStr)}</p>`);
    }

    if (metadata.sessionNumber !== undefined) {
      lines.push(`<p><strong>Session:</strong> #${metadata.sessionNumber}</p>`);
    }

    if (metadata.duration) {
      const durationStr = this.#formatDuration(metadata.duration);
      lines.push(`<p><strong>Duration:</strong> ${durationStr}</p>`);
    }

    if (metadata.participants && metadata.participants.length > 0) {
      const participantsList = metadata.participants
        .map(p => this.#escapeHtml(p))
        .join(', ');
      lines.push(`<p><strong>Participants:</strong> ${participantsList}</p>`);
    }

    if (metadata.locations && metadata.locations.length > 0) {
      const locationsList = metadata.locations
        .map(l => this.#escapeHtml(l))
        .join(', ');
      lines.push(`<p><strong>Locations:</strong> ${locationsList}</p>`);
    }

    if (metadata.npcs && metadata.npcs.length > 0) {
      const npcsList = metadata.npcs
        .map(n => this.#escapeHtml(n))
        .join(', ');
      lines.push(`<p><strong>NPCs:</strong> ${npcsList}</p>`);
    }

    if (metadata.keyEvents && metadata.keyEvents.length > 0) {
      lines.push('<p><strong>Key Events:</strong></p>');
      lines.push('<ul>');
      for (const event of metadata.keyEvents) {
        lines.push(`<li>${this.#escapeHtml(event)}</li>`);
      }
      lines.push('</ul>');
    }

    lines.push('</div>');
    lines.push('<hr/>');

    return lines.join('\n');
  }

  /**
   * Formats images for inclusion in the note.
   *
   * @param {Object[]} images - Array of image data
   * @returns {string} HTML-formatted images section
   * @private
   */
  #formatImages(images) {
    const lines = ['<h3>Session Highlights</h3>', '<div class="session-images">'];

    for (const image of images) {
      const src = image.dataUrl || image.url || '';
      const alt = image.prompt || image.description || 'Session image';
      const caption = image.caption || image.prompt || '';

      if (src) {
        lines.push('<figure>');
        lines.push(`<img src="${this.#escapeHtml(src)}" alt="${this.#escapeHtml(alt)}" style="max-width: 100%;" />`);
        if (caption) {
          lines.push(`<figcaption><em>${this.#escapeHtml(caption)}</em></figcaption>`);
        }
        lines.push('</figure>');
      }
    }

    lines.push('</div>');
    lines.push('<hr/>');

    return lines.join('\n');
  }

  /**
   * Formats transcription as full transcript with speaker attribution.
   *
   * @param {Object} transcription - Transcription data
   * @returns {string} HTML-formatted transcript
   * @private
   */
  #formatFullTranscript(transcription) {
    if (!transcription || !transcription.segments || transcription.segments.length === 0) {
      return '<p><em>No transcript available.</em></p>';
    }

    const lines = ['<h3>Session Transcript</h3>'];
    let currentSpeaker = null;
    let currentText = [];

    for (const segment of transcription.segments) {
      if (segment.speaker !== currentSpeaker) {
        // Output previous speaker's text
        if (currentSpeaker !== null && currentText.length > 0) {
          lines.push(`<p><strong>${this.#escapeHtml(currentSpeaker)}:</strong> ${currentText.join(' ')}</p>`);
        }
        currentSpeaker = segment.speaker;
        currentText = [this.#escapeHtml(segment.text)];
      } else {
        currentText.push(this.#escapeHtml(segment.text));
      }
    }

    // Output last speaker
    if (currentSpeaker !== null && currentText.length > 0) {
      lines.push(`<p><strong>${this.#escapeHtml(currentSpeaker)}:</strong> ${currentText.join(' ')}</p>`);
    }

    return lines.join('\n');
  }

  /**
   * Formats transcription as a summary of key moments.
   *
   * @param {Object} transcription - Transcription data
   * @returns {string} HTML-formatted summary
   * @private
   */
  #formatSummary(transcription) {
    if (!transcription || !transcription.segments || transcription.segments.length === 0) {
      return '<p><em>No content available for summary.</em></p>';
    }

    const lines = ['<h3>Session Summary</h3>'];

    // Extract unique speakers
    const speakers = new Set(transcription.segments.map(s => s.speaker));
    lines.push(`<p><strong>Participants:</strong> ${Array.from(speakers).join(', ')}</p>`);

    // Create summary by grouping into time blocks
    const blockSize = Math.ceil(transcription.segments.length / 5); // Aim for ~5 blocks
    const blocks = [];

    for (let i = 0; i < transcription.segments.length; i += blockSize) {
      const blockSegments = transcription.segments.slice(i, i + blockSize);
      const blockText = blockSegments.map(s => s.text).join(' ');
      blocks.push({
        startTime: blockSegments[0]?.start || 0,
        speakers: [...new Set(blockSegments.map(s => s.speaker))],
        preview: blockText.substring(0, 200) + (blockText.length > 200 ? '...' : '')
      });
    }

    lines.push('<h4>Key Moments</h4>');
    lines.push('<ul>');
    for (const block of blocks) {
      const timeStr = this.#formatTimestamp(block.startTime);
      lines.push(`<li><strong>[${timeStr}]</strong> ${this.#escapeHtml(block.preview)}</li>`);
    }
    lines.push('</ul>');

    return lines.join('\n');
  }

  /**
   * Formats transcription as theatrical script.
   *
   * @param {Object} transcription - Transcription data
   * @returns {string} HTML-formatted script
   * @private
   */
  #formatScript(transcription) {
    if (!transcription || !transcription.segments || transcription.segments.length === 0) {
      return '<p><em>No transcript available.</em></p>';
    }

    const lines = ['<h3>Session Script</h3>', '<div class="session-script">'];

    for (const segment of transcription.segments) {
      const speaker = this.#escapeHtml(segment.speaker).toUpperCase();
      const text = this.#escapeHtml(segment.text);

      lines.push(`<p class="script-line"><span class="speaker">${speaker}</span><br/>${text}</p>`);
    }

    lines.push('</div>');

    return lines.join('\n');
  }

  /**
   * Formats transcription as prose narrative.
   *
   * @param {Object} transcription - Transcription data
   * @returns {string} HTML-formatted prose
   * @private
   */
  #formatProse(transcription) {
    if (!transcription || !transcription.segments || transcription.segments.length === 0) {
      return '<p><em>No content available.</em></p>';
    }

    const lines = ['<h3>Session Narrative</h3>'];

    // Group by speaker and create prose paragraphs
    let prose = [];
    let currentSpeaker = null;

    for (const segment of transcription.segments) {
      if (segment.speaker !== currentSpeaker) {
        currentSpeaker = segment.speaker;
        const speakerName = this.#escapeHtml(segment.speaker);
        const text = this.#escapeHtml(segment.text);

        // Use said/spoke/replied variations
        const verbs = ['said', 'spoke', 'replied', 'continued', 'added'];
        const verb = verbs[prose.length % verbs.length];

        prose.push(`${speakerName} ${verb}, "${text}"`);
      } else {
        // Continue same speaker
        const text = this.#escapeHtml(segment.text);
        prose[prose.length - 1] += ` ${text}`;
      }
    }

    // Group into paragraphs (every 3-4 sentences)
    const paragraphSize = 3;
    for (let i = 0; i < prose.length; i += paragraphSize) {
      const paragraph = prose.slice(i, i + paragraphSize).join(' ');
      lines.push(`<p>${paragraph}</p>`);
    }

    return lines.join('\n');
  }

  /**
   * Formats entity mentions section.
   *
   * @param {Object[]} entities - Extracted entities
   * @returns {string} HTML-formatted entity list
   * @private
   */
  #formatEntityMentions(entities) {
    const lines = ['<hr/>', '<h3>Entities Mentioned</h3>'];

    // Group entities by type using EntityMapper
    const grouped = this.#mapper.groupByKankaType(entities);

    for (const [kankaType, typeEntities] of Object.entries(grouped)) {
      const typeName = this.#getKankaTypeName(kankaType);
      lines.push(`<h4>${typeName}</h4>`);
      lines.push('<ul>');

      for (const entity of typeEntities) {
        const name = this.#escapeHtml(entity.name);
        lines.push(`<li>${name}</li>`);
      }

      lines.push('</ul>');
    }

    return lines.join('\n');
  }

  /**
   * Formats the footer section.
   *
   * @returns {string} HTML-formatted footer
   * @private
   */
  #formatFooter() {
    const timestamp = new Date().toISOString();
    return `<hr/><p><em>Generated by VoxChronicle on ${timestamp}</em></p>`;
  }

  // ============================================================================
  // Private Methods - Entity Management
  // ============================================================================

  /**
   * Creates entities in Kanka from extracted entities.
   *
   * @param {Object[]} entities - Entities to create
   * @returns {Promise<Object>} Creation results
   * @private
   */
  async #createEntities(entities) {
    const results = {
      created: [],
      linked: [],
      errors: []
    };

    for (const entity of entities) {
      try {
        // Map entity to Kanka format using EntityMapper
        const mapped = this.#mapper.mapExtractedEntity(entity);
        if (!mapped) {
          continue;
        }

        // Check if entity already exists
        const existing = await this.#client.findByName(mapped.kankaType, mapped.name);

        if (existing) {
          results.linked.push({
            name: mapped.name,
            kankaType: mapped.kankaType,
            id: existing.id,
            existed: true
          });
          this.#logger.debug(`Entity exists: ${mapped.name}`);
        } else {
          // Create new entity
          const response = await this.#client.createEntity(mapped.kankaType, mapped.name, {
            entry: mapped.entry,
            type: mapped.type,
            tags: mapped.tags,
            is_private: mapped.is_private
          });

          results.created.push({
            name: mapped.name,
            kankaType: mapped.kankaType,
            id: response.data?.id,
            existed: false
          });
          this.#logger.debug(`Entity created: ${mapped.name}`);
        }
      } catch (error) {
        results.errors.push(`Failed to create ${entity.name}: ${error.message}`);
        this.#logger.warn(`Entity creation failed: ${entity.name}`, error.message);
      }
    }

    return results;
  }

  // ============================================================================
  // Private Methods - Tags
  // ============================================================================

  /**
   * Ensures the session tags exist, creating them if needed.
   *
   * @returns {Promise<number[]>} Array of tag IDs
   * @private
   */
  async #ensureSessionTags() {
    const tagIds = [];

    try {
      // Get or create session tag
      if (!this.#sessionTagId) {
        const sessionTag = await this.#getOrCreateTag(DEFAULT_TAGS.SESSION);
        this.#sessionTagId = sessionTag?.id;
      }
      if (this.#sessionTagId) {
        tagIds.push(this.#sessionTagId);
      }

      // Get or create generated tag
      if (!this.#generatedTagId) {
        const generatedTag = await this.#getOrCreateTag(DEFAULT_TAGS.GENERATED);
        this.#generatedTagId = generatedTag?.id;
      }
      if (this.#generatedTagId) {
        tagIds.push(this.#generatedTagId);
      }
    } catch (error) {
      this.#logger.warn('Failed to ensure session tags:', error.message);
      // Continue without tags
    }

    return tagIds;
  }

  /**
   * Gets or creates a tag by name.
   *
   * @param {string} tagName - Tag name
   * @returns {Promise<Object|null>} Tag data or null
   * @private
   */
  async #getOrCreateTag(tagName) {
    try {
      // Search for existing tag
      const response = await this.#client.listTags();
      const existing = response.data?.find(t => t.name === tagName);

      if (existing) {
        return existing;
      }

      // Create new tag
      const created = await this.#client.createTag(tagName);
      return created.data;
    } catch (error) {
      this.#logger.warn(`Failed to get/create tag "${tagName}":`, error.message);
      return null;
    }
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  /**
   * Reports progress to the callback if set.
   *
   * @param {string} message - Progress message
   * @param {number} percent - Progress percentage (0-100)
   * @private
   */
  #reportProgress(message, percent) {
    if (this.#onProgress) {
      try {
        this.#onProgress(message, percent);
      } catch (error) {
        this.#logger.warn('Error in progress callback:', error.message);
      }
    }
  }

  /**
   * Adds an export result to history.
   *
   * @param {ExportResult} result - Export result
   * @private
   */
  #addToHistory(result) {
    this.#exportHistory.push({
      ...result,
      timestamp: new Date().toISOString()
    });

    // Trim history if needed
    if (this.#exportHistory.length > this.#maxHistorySize) {
      this.#exportHistory = this.#exportHistory.slice(-this.#maxHistorySize);
    }
  }

  /**
   * Gets a human-readable name for a Kanka entity type.
   *
   * @param {string} kankaType - Kanka entity type
   * @returns {string} Human-readable name
   * @private
   */
  #getKankaTypeName(kankaType) {
    const names = {
      [KankaEntityTypes.NOTES]: 'Notes',
      [KankaEntityTypes.CHARACTERS]: 'Characters',
      [KankaEntityTypes.LOCATIONS]: 'Locations',
      [KankaEntityTypes.ITEMS]: 'Items',
      [KankaEntityTypes.ORGANISATIONS]: 'Organizations',
      [KankaEntityTypes.EVENTS]: 'Events',
      [KankaEntityTypes.FAMILIES]: 'Families',
      [KankaEntityTypes.JOURNALS]: 'Journals',
      [KankaEntityTypes.QUESTS]: 'Quests',
      [KankaEntityTypes.TAGS]: 'Tags'
    };

    return names[kankaType] || kankaType;
  }

  /**
   * Formats a duration in seconds to a readable string.
   *
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   * @private
   */
  #formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  /**
   * Formats a timestamp in seconds to MM:SS or HH:MM:SS format.
   *
   * @param {number} seconds - Timestamp in seconds
   * @returns {string} Formatted timestamp
   * @private
   */
  #formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Escapes HTML special characters in a string.
   *
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   * @private
   */
  #escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Export default for convenience
export default NarrativeExporter;
