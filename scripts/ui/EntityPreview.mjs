/**
 * EntityPreview - UI Component for Reviewing Extracted Entities Before Kanka Publish
 *
 * A Foundry VTT Application that displays entities extracted from a transcription
 * (characters, locations, items) and allows the user to review, edit, select,
 * and confirm which entities to create in Kanka.
 *
 * @class EntityPreview
 * @augments ApplicationV2
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { Settings } from '../core/Settings.mjs';
import { VoxChronicle } from '../core/VoxChronicle.mjs';
import { RelationshipGraph } from './RelationshipGraph.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Entity selection state enum
 * @enum {string}
 */
const EntitySelectionState = {
  NONE: 'none',
  SOME: 'some',
  ALL: 'all'
};

/**
 * Preview mode enum
 * @enum {string}
 */
const PreviewMode = {
  REVIEW: 'review',
  CREATING: 'creating',
  COMPLETE: 'complete',
  ERROR: 'error'
};

/**
 * Number of entities to process before forcing a render during batched operations
 *
 * This count-based threshold prevents render starvation when processing many entities
 * rapidly. When this many entities have been processed since the last render, a new
 * render is triggered regardless of time elapsed.
 *
 * @constant {number}
 * @default 3
 */
const RENDER_BATCH_SIZE = 3;

/**
 * Minimum time interval (in milliseconds) between renders during batched operations
 *
 * This time-based threshold prevents excessive render spam when entities are processed
 * slowly. Renders will occur at most once per interval, reducing CPU usage and improving
 * UI responsiveness during entity creation.
 *
 * @constant {number}
 * @default 500
 */
const RENDER_BATCH_INTERVAL_MS = 500;

/**
 * EntityPreview Application class
 * Provides UI for reviewing extracted entities before publishing to Kanka
 */
class EntityPreview extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('EntityPreview');

  /**
   * Entities to preview
   * @type {object}
   * @private
   */
  _entities = {
    characters: [],
    locations: [],
    items: []
  };

  /**
   * Relationships to preview
   * @type {Array}
   * @private
   */
  _relationships = [];

  /**
   * Selection state for each entity (keyed by entity type and index)
   * @type {Map}
   * @private
   */
  _selections = new Map();

  /**
   * Current preview mode
   * @type {string}
   * @private
   */
  _mode = PreviewMode.REVIEW;

  /**
   * Progress information for entity creation
   * @type {object}
   * @private
   */
  _progress = {
    current: 0,
    total: 0,
    message: ''
  };

  /**
   * Results from entity creation
   * @type {object}
   * @private
   */
  _results = {
    created: [],
    failed: []
  };

  /**
   * Callback to execute when entities are confirmed for creation
   * @type {Function|null}
   * @private
   */
  _onConfirmCallback = null;

  /**
   * Callback to execute when the preview is cancelled
   * @type {Function|null}
   * @private
   */
  _onCancelCallback = null;

  /**
   * Loading state for image generation (keyed by entity type and index)
   * @type {Map}
   * @private
   */
  _imageLoadingStates = new Map();

  /**
   * Timestamp of the last render call (for batching)
   * @type {number}
   * @private
   */
  _lastRenderTime = 0;

  /**
   * Counter for entities processed since last render (for batching)
   * @type {number}
   * @private
   */
  _renderBatchCounter = 0;

  /**
   * Whether a deferred render is pending
   * @type {boolean}
   * @private
   */
  _pendingRender = false;

  /**
   * Timeout ID for deferred render
   * @type {number|null}
   * @private
   */
  _renderTimeout = null;

  /**
   * AbortController for non-action event listeners
   * @type {AbortController|null}
   * @private
   */
  #listenerController = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-entity-preview',
    classes: ['vox-chronicle', 'entity-preview'],
    window: {
      title: 'VOXCHRONICLE.EntityPreview.Title',
      resizable: true,
      minimizable: false
    },
    position: { width: 600 },
    actions: {
      'select-all': EntityPreview._onSelectAllAction,
      'deselect-all': EntityPreview._onDeselectAllAction,
      'confirm-create': EntityPreview._onConfirmCreateAction,
      'skip-all': EntityPreview._onSkipAllAction,
      'cancel': EntityPreview._onCancelAction,
      'close': EntityPreview._onCloseAction,
      'retry': EntityPreview._onRetryAction,
      'edit-description': EntityPreview._onEditDescriptionAction,
      'generate-portrait': EntityPreview._onGeneratePortraitAction,
      'toggle-section': EntityPreview._onToggleSectionAction,
      'view-graph': EntityPreview._onViewGraphAction
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/entity-preview.hbs` }
  };

  /**
   * Create a new EntityPreview instance
   * @param {object} [options] - Application options
   * @param {object} [options.entities] - Extracted entities to preview
   * @param {Array} [options.relationships] - Extracted relationships to preview
   * @param {Function} [options.onConfirm] - Callback when entities are confirmed
   * @param {Function} [options.onCancel] - Callback when preview is cancelled
   */
  constructor(options = {}) {
    super(options);

    if (options.entities) {
      this.setEntities(options.entities);
    }

    if (options.relationships) {
      this.setRelationships(options.relationships);
    }

    if (options.onConfirm) {
      this._onConfirmCallback = options.onConfirm;
    }

    if (options.onCancel) {
      this._onCancelCallback = options.onCancel;
    }

    this._logger.debug('EntityPreview initialized');
  }

  // --- Static Action Handlers (dispatch to instance methods) ---

  /** @private */
  static _onSelectAllAction(event, target) {
    this._onSelectAll(event);
  }

  /** @private */
  static _onDeselectAllAction(event, target) {
    this._onDeselectAll(event);
  }

  /** @private */
  static async _onConfirmCreateAction(event, target) {
    return this._onConfirmCreate(event);
  }

  /** @private */
  static _onSkipAllAction(event, target) {
    this._onSkipAll(event);
  }

  /** @private */
  static _onCancelAction(event, target) {
    this._onCancel(event);
  }

  /** @private */
  static _onCloseAction(event, target) {
    this._onClose(event);
  }

  /** @private */
  static _onRetryAction(event, target) {
    this._onRetry(event);
  }

  /** @private */
  static async _onEditDescriptionAction(event, target) {
    return this._onEditDescription(event, target);
  }

  /** @private */
  static async _onGeneratePortraitAction(event, target) {
    return this._onGeneratePortrait(event, target);
  }

  /** @private */
  static _onToggleSectionAction(event, target) {
    this._onToggleSection(event, target);
  }

  /** @private */
  static _onViewGraphAction(event, target) {
    this._onViewGraph(event);
  }

  // --- Lifecycle ---

  /**
   * Bind non-click event listeners after render
   * @param {object} context - Template context
   * @param {object} options - Render options
   */
  _onRender(context, options) {
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    this.element?.querySelectorAll('input[type="checkbox"][data-entity-key]').forEach((el) => {
      el.addEventListener('change', this._onToggleEntity.bind(this), { signal });
    });
  }

  /**
   * Set the entities to preview
   * @param {object} entities - Extracted entities object
   * @param {Array} [entities.characters] - Character entities
   * @param {Array} [entities.locations] - Location entities
   * @param {Array} [entities.items] - Item entities
   */
  setEntities(entities) {
    this._entities = {
      characters: Array.isArray(entities.characters) ? entities.characters : [],
      locations: Array.isArray(entities.locations) ? entities.locations : [],
      items: Array.isArray(entities.items) ? entities.items : []
    };

    // Initialize selections - all selected by default
    this._selections.clear();
    this._initializeSelections();

    this._logger.debug('Entities set:', {
      characters: this._entities.characters.length,
      locations: this._entities.locations.length,
      items: this._entities.items.length
    });
  }

  /**
   * Set the relationships to preview
   * @param {Array} relationships - Extracted relationships array
   */
  setRelationships(relationships) {
    this._relationships = Array.isArray(relationships) ? relationships : [];

    // Initialize selections for relationships - all selected by default
    this._relationships.forEach((relationship, index) => {
      const key = `relationship-${index}`;
      this._selections.set(key, true);
    });

    this._logger.debug('Relationships set:', {
      count: this._relationships.length
    });
  }

  /**
   * Initialize selection state for all entities
   * @private
   */
  _initializeSelections() {
    ['characters', 'locations', 'items'].forEach((type) => {
      this._entities[type].forEach((entity, index) => {
        const key = `${type}-${index}`;
        this._selections.set(key, true);
      });
    });

    // Initialize relationship selections
    this._relationships.forEach((relationship, index) => {
      const key = `relationship-${index}`;
      this._selections.set(key, true);
    });
  }

  /**
   * Get the total count of entities
   * @returns {number} Total entity count
   * @private
   */
  _getTotalEntityCount() {
    return (
      this._entities.characters.length +
      this._entities.locations.length +
      this._entities.items.length
    );
  }

  /**
   * Get the count of selected entities
   * @returns {number} Selected entity count
   * @private
   */
  _getSelectedCount() {
    let count = 0;
    for (const selected of this._selections.values()) {
      if (selected) count++;
    }
    return count;
  }

  /**
   * Get the current selection state
   * @returns {string} Selection state (none, some, or all)
   * @private
   */
  _getSelectionState() {
    const total = this._getTotalEntityCount();
    const selected = this._getSelectedCount();

    if (selected === 0) return EntitySelectionState.NONE;
    if (selected === total) return EntitySelectionState.ALL;
    return EntitySelectionState.SOME;
  }

  /**
   * Get localized label for relationship type
   * @param {string} relationType - The relationship type
   * @returns {string} Localized label
   * @private
   */
  _getRelationshipTypeLabel(relationType) {
    const typeKey = relationType
      ? relationType.charAt(0).toUpperCase() + relationType.slice(1)
      : 'Unknown';
    return game.i18n?.localize(`VOXCHRONICLE.RelationshipGraph.${typeKey}`) || typeKey;
  }

  /**
   * Batched render helper - throttles render() calls during entity creation
   *
   * Uses hybrid time and count-based batching to reduce excessive re-renders.
   * Renders will occur immediately if either:
   * - RENDER_BATCH_INTERVAL_MS milliseconds have passed since last render, OR
   * - RENDER_BATCH_SIZE entities have been processed since last render
   *
   * Otherwise, schedules a deferred render to occur after the remaining time interval.
   *
   * @private
   */
  _batchedRender() {
    const now = Date.now();
    const timeSinceLastRender = now - this._lastRenderTime;

    // Increment batch counter
    this._renderBatchCounter++;

    // Check if we should render immediately (time threshold OR count threshold exceeded)
    const shouldRenderNow =
      timeSinceLastRender >= RENDER_BATCH_INTERVAL_MS ||
      this._renderBatchCounter >= RENDER_BATCH_SIZE;

    if (shouldRenderNow) {
      // Clear any pending deferred render
      if (this._renderTimeout !== null) {
        clearTimeout(this._renderTimeout);
        this._renderTimeout = null;
        this._pendingRender = false;
      }

      // Render immediately
      this.render();
      this._lastRenderTime = now;
      this._renderBatchCounter = 0;
    } else if (!this._pendingRender) {
      // Schedule a deferred render
      this._pendingRender = true;
      this._renderTimeout = setTimeout(() => {
        this._pendingRender = false;
        this._renderTimeout = null;
        this.render();
        this._lastRenderTime = Date.now();
        this._renderBatchCounter = 0;
      }, RENDER_BATCH_INTERVAL_MS - timeSinceLastRender);
    }
  }

  /**
   * Flush any pending renders and force an immediate render
   *
   * Cancels any deferred render scheduled by _batchedRender() and forces
   * an immediate render() call.
   *
   * @private
   */
  _flushRender() {
    // Clear any pending deferred render
    if (this._renderTimeout !== null) {
      clearTimeout(this._renderTimeout);
      this._renderTimeout = null;
      this._pendingRender = false;
    }

    // Force immediate render
    this.render();
    this._lastRenderTime = Date.now();
    this._renderBatchCounter = 0;
  }

  /**
   * Prepare template context data
   * @param {object} _options - Render options
   * @returns {Promise<object>} Template data
   * @override
   */
  async _prepareContext(_options = {}) {
    const configStatus = Settings.getConfigurationStatus();
    const selectionState = this._getSelectionState();

    // Build entity lists with selection state and loading state
    const characters = this._entities.characters.map((entity, index) => ({
      ...entity,
      index,
      key: `characters-${index}`,
      selected: this._selections.get(`characters-${index}`) ?? true,
      isGeneratingImage: this._imageLoadingStates.get(`characters-${index}`) ?? false,
      typeLabel: entity.isNPC
        ? game.i18n?.localize('VOXCHRONICLE.EntityPreview.IsNPC') || 'NPC'
        : game.i18n?.localize('VOXCHRONICLE.EntityPreview.IsPC') || 'PC'
    }));

    const locations = this._entities.locations.map((entity, index) => ({
      ...entity,
      index,
      key: `locations-${index}`,
      selected: this._selections.get(`locations-${index}`) ?? true,
      isGeneratingImage: this._imageLoadingStates.get(`locations-${index}`) ?? false,
      typeLabel: entity.type || 'Location'
    }));

    const items = this._entities.items.map((entity, index) => ({
      ...entity,
      index,
      key: `items-${index}`,
      selected: this._selections.get(`items-${index}`) ?? true,
      isGeneratingImage: this._imageLoadingStates.get(`items-${index}`) ?? false,
      typeLabel: entity.type || 'Item'
    }));

    const totalCount = this._getTotalEntityCount();
    const selectedCount = this._getSelectedCount();

    // Build relationship list with selection state
    const relationships = this._relationships.map((relationship, index) => ({
      ...relationship,
      index,
      key: `relationship-${index}`,
      selected: this._selections.get(`relationship-${index}`) ?? true,
      typeLabel: this._getRelationshipTypeLabel(relationship.relationType)
    }));

    return {
      moduleId: MODULE_ID,
      mode: this._mode,
      isReview: this._mode === PreviewMode.REVIEW,
      isCreating: this._mode === PreviewMode.CREATING,
      isComplete: this._mode === PreviewMode.COMPLETE,
      isError: this._mode === PreviewMode.ERROR,

      // Entity lists
      characters,
      locations,
      items,
      hasCharacters: characters.length > 0,
      hasLocations: locations.length > 0,
      hasItems: items.length > 0,
      hasEntities: totalCount > 0,

      // Relationships
      relationships,
      hasRelationships: relationships.length > 0,

      // Selection state
      selectionState,
      isAllSelected: selectionState === EntitySelectionState.ALL,
      isNoneSelected: selectionState === EntitySelectionState.NONE,
      totalCount,
      selectedCount,

      // Progress and results
      progress: {
        ...this._progress,
        percent: this._progress.total > 0
          ? Math.round((this._progress.current / this._progress.total) * 100)
          : 0
      },
      hasProgress: this._mode === PreviewMode.CREATING,
      results: this._results,
      hasResults: this._mode === PreviewMode.COMPLETE || this._mode === PreviewMode.ERROR,
      createdCount: this._results.created.length,
      failedCount: this._results.failed.length,

      // Configuration status
      configStatus,
      isKankaConfigured: configStatus.kanka,

      // Localization strings
      i18n: {
        title:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.Title') || 'Review Extracted Entities',
        description:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.Description') ||
          'Review the entities extracted from your session. Select which ones to create in Kanka.',
        characters: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Characters') || 'Characters',
        locations: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Locations') || 'Locations',
        items: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Items') || 'Items',
        relationships:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.Relationships') || 'Relationships',
        relationshipsDescription:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.RelationshipsDescription') ||
          'Select which relationships to create in Kanka. Relationships will only be created if both entities are selected.',
        viewGraph: game.i18n?.localize('VOXCHRONICLE.EntityPreview.ViewGraph') || 'View Graph',
        sourceEntity: game.i18n?.localize('VOXCHRONICLE.EntityPreview.SourceEntity') || 'Source',
        targetEntity: game.i18n?.localize('VOXCHRONICLE.EntityPreview.TargetEntity') || 'Target',
        relationshipType:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.RelationshipType') || 'Type',
        selectAll: game.i18n?.localize('VOXCHRONICLE.EntityPreview.SelectAll') || 'Select All',
        deselectAll:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.DeselectAll') || 'Deselect All',
        create: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Create') || 'Create Selected',
        skip: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Skip') || 'Skip All',
        cancel: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Cancel') || 'Cancel',
        generatePortrait:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.GeneratePortrait') || 'Generate Portrait',
        editDescription:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.EditDescription') || 'Edit Description',
        generating:
          game.i18n?.localize('VOXCHRONICLE.ImageGeneration.Generating') || 'Generating image...',
        name: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Name') || 'Name',
        type: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Type') || 'Type',
        noEntities:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.NoEntities') || 'No entities to display',
        creating:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.Creating') ||
          'Creating entities in Kanka...',
        created:
          game.i18n?.format('VOXCHRONICLE.EntityPreview.Created', {
            count: this._results.created.length
          }) || `${this._results.created.length} entities created in Kanka`,
        partialSuccess:
          game.i18n?.format('VOXCHRONICLE.EntityPreview.PartialSuccess', {
            created: this._results.created.length,
            total: this._results.created.length + this._results.failed.length
          }) ||
          `${this._results.created.length} of ${this._results.created.length + this._results.failed.length} entities created`,
        failed:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.Failed') || 'Failed to create entities',
        failedCountLabel:
          game.i18n?.format('VOXCHRONICLE.EntityPreview.FailedCount', {
            count: this._results.failed.length
          }) || `${this._results.failed.length} failed`,
        confidenceLabel:
          game.i18n?.localize('VOXCHRONICLE.EntityPreview.ConfidenceLabel') || 'Confidence:',
        close: game.i18n?.localize('VOXCHRONICLE.Buttons.Close') || 'Close',
        retry: game.i18n?.localize('VOXCHRONICLE.Buttons.Retry') || 'Retry',
        notConfigured:
          game.i18n?.localize('VOXCHRONICLE.Kanka.NotConfigured') ||
          'Kanka is not configured. Please set your API token and campaign ID in module settings.'
      }
    };
  }

  // --- Event Handlers ---

  /**
   * Handle entity selection toggle
   * @param {Event} event - The change event
   * @private
   */
  _onToggleEntity(event) {
    const checkbox = event.currentTarget;
    const key = checkbox.dataset.entityKey;

    if (key) {
      this._selections.set(key, checkbox.checked);
      this._logger.debug(`Entity ${key} selection: ${checkbox.checked}`);

      // Update UI elements that depend on selection state
      this.render();
    }
  }

  /**
   * Handle select all button click
   * @param {Event} event - The click event
   * @private
   */
  _onSelectAll(event) {
    event.preventDefault();

    for (const key of this._selections.keys()) {
      this._selections.set(key, true);
    }

    this._logger.debug('Selected all entities');
    this.render();
  }

  /**
   * Handle deselect all button click
   * @param {Event} event - The click event
   * @private
   */
  _onDeselectAll(event) {
    event.preventDefault();

    for (const key of this._selections.keys()) {
      this._selections.set(key, false);
    }

    this._logger.debug('Deselected all entities');
    this.render();
  }

  /**
   * Handle confirm create button click
   * @param {Event} event - The click event
   * @private
   */
  async _onConfirmCreate(event) {
    event.preventDefault();

    const selectedEntities = this.getSelectedEntities();
    const totalSelected =
      selectedEntities.characters.length +
      selectedEntities.locations.length +
      selectedEntities.items.length;

    if (totalSelected === 0) {
      ui.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.EntityPreview.NoEntities') || 'No entities selected'
      );
      return;
    }

    // Check Kanka configuration
    const configStatus = Settings.getConfigurationStatus();
    if (!configStatus.kanka) {
      ui.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Kanka.NotConfigured') ||
          'Kanka is not configured. Please set your API token and campaign ID.'
      );
      return;
    }

    this._mode = PreviewMode.CREATING;
    this._progress = {
      current: 0,
      total: totalSelected,
      message: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Creating') || 'Creating entities...'
    };
    this._results = { created: [], failed: [] };
    this.render();

    this._logger.log(`Creating ${totalSelected} entities in Kanka`);

    try {
      await this._createEntitiesInKanka(selectedEntities);

      this._mode =
        this._results.failed.length > 0 && this._results.created.length > 0
          ? PreviewMode.COMPLETE // Partial success
          : this._results.failed.length > 0
            ? PreviewMode.ERROR
            : PreviewMode.COMPLETE;

      this.render();

      // Call the confirm callback with results
      if (this._onConfirmCallback) {
        await this._onConfirmCallback(this._results);
      }
    } catch (error) {
      this._logger.error('Failed to create entities:', error);
      this._mode = PreviewMode.ERROR;
      this.render();
    }
  }

  /**
   * Create entities in Kanka
   * @param {object} selectedEntities - Selected entities to create
   * @private
   */
  async _createEntitiesInKanka(selectedEntities) {
    const vox = VoxChronicle.getInstance();
    const kankaService = vox.kankaService;

    if (!kankaService) {
      throw new Error('Kanka service not available');
    }

    // Map to store entity names -> Kanka entity IDs for relationship creation
    const entityNameToId = new Map();

    // Create characters
    for (const character of selectedEntities.characters) {
      try {
        this._progress.message = `Creating character: ${character.name}`;
        this._batchedRender();

        const result = await kankaService.createCharacter({
          name: character.name,
          entry: character.description,
          type: character.isNPC ? 'NPC' : 'PC'
        });

        const entityId = result?.data?.entity_id;
        if (entityId) {
          entityNameToId.set(character.name.toLowerCase(), entityId);
        }

        this._results.created.push({
          type: 'character',
          name: character.name,
          kankaId: result?.data?.id,
          entityId
        });

        this._progress.current++;
        this._batchedRender();
      } catch (error) {
        this._logger.error(`Failed to create character ${character.name}:`, error);
        this._results.failed.push({
          type: 'character',
          name: character.name,
          error: error.message
        });
        this._progress.current++;
      }
    }

    // Create locations
    for (const location of selectedEntities.locations) {
      try {
        this._progress.message = `Creating location: ${location.name}`;
        this._batchedRender();

        const result = await kankaService.createLocation({
          name: location.name,
          entry: location.description,
          type: location.type
        });

        const entityId = result?.data?.entity_id;
        if (entityId) {
          entityNameToId.set(location.name.toLowerCase(), entityId);
        }

        this._results.created.push({
          type: 'location',
          name: location.name,
          kankaId: result?.data?.id,
          entityId
        });

        this._progress.current++;
        this._batchedRender();
      } catch (error) {
        this._logger.error(`Failed to create location ${location.name}:`, error);
        this._results.failed.push({
          type: 'location',
          name: location.name,
          error: error.message
        });
        this._progress.current++;
      }
    }

    // Create items
    for (const item of selectedEntities.items) {
      try {
        this._progress.message = `Creating item: ${item.name}`;
        this._batchedRender();

        const result = await kankaService.createItem({
          name: item.name,
          entry: item.description,
          type: item.type
        });

        const entityId = result?.data?.entity_id;
        if (entityId) {
          entityNameToId.set(item.name.toLowerCase(), entityId);
        }

        this._results.created.push({
          type: 'item',
          name: item.name,
          kankaId: result?.data?.id,
          entityId
        });

        this._progress.current++;
        this._batchedRender();
      } catch (error) {
        this._logger.error(`Failed to create item ${item.name}:`, error);
        this._results.failed.push({
          type: 'item',
          name: item.name,
          error: error.message
        });
        this._progress.current++;
      }
    }

    // Create relationships after all entities are created
    await this._createRelationshipsInKanka(entityNameToId, kankaService);

    // Flush any pending renders to ensure final state is displayed
    this._flushRender();

    // Show notification
    if (this._results.created.length > 0) {
      ui.notifications?.info(
        game.i18n?.format('VOXCHRONICLE.EntityPreview.Created', {
          count: this._results.created.length
        }) || `${this._results.created.length} entities created in Kanka`
      );
    }

    if (this._results.failed.length > 0) {
      ui.notifications?.warn(
        game.i18n?.format('VOXCHRONICLE.EntityPreview.PartialSuccess', {
          created: this._results.created.length,
          total: this._results.created.length + this._results.failed.length
        }) ||
          `${this._results.created.length} of ${this._results.created.length + this._results.failed.length} entities created`
      );
    }
  }

  /**
   * Create relationships in Kanka
   * @param {Map<string, number>} entityNameToId - Map of entity names to Kanka entity IDs
   * @param {KankaService} kankaService - Kanka service instance
   * @private
   */
  async _createRelationshipsInKanka(entityNameToId, kankaService) {
    const selectedRelationships = this.getSelectedRelationships();

    if (selectedRelationships.length === 0) {
      this._logger.debug('No relationships selected for creation');
      return;
    }

    this._logger.log(`Creating ${selectedRelationships.length} relationships in Kanka`);

    // Map relationships to Kanka entity IDs and group by source entity
    const relationshipsBySource = new Map();
    const skippedRelationships = [];

    for (const relationship of selectedRelationships) {
      const sourceEntityId = entityNameToId.get(relationship.sourceEntity?.toLowerCase());
      const targetEntityId = entityNameToId.get(relationship.targetEntity?.toLowerCase());

      // Skip relationships where either entity wasn't created
      if (!sourceEntityId || !targetEntityId) {
        this._logger.warn(
          `Skipping relationship: ${relationship.sourceEntity} -> ${relationship.targetEntity} ` +
            `(source: ${sourceEntityId}, target: ${targetEntityId})`
        );
        skippedRelationships.push(relationship);
        continue;
      }

      // Group relationships by source entity
      if (!relationshipsBySource.has(sourceEntityId)) {
        relationshipsBySource.set(sourceEntityId, []);
      }

      relationshipsBySource.get(sourceEntityId).push({
        target_id: targetEntityId,
        relation: relationship.relationType || 'unknown',
        attitude: this._mapConfidenceToAttitude(relationship.confidence),
        sourceEntity: relationship.sourceEntity,
        targetEntity: relationship.targetEntity
      });
    }

    if (skippedRelationships.length > 0) {
      this._logger.warn(
        `Skipped ${skippedRelationships.length} relationships due to missing entities`
      );
    }

    // Create relationships for each source entity
    let relationshipsCreated = 0;
    let relationshipsFailed = 0;

    for (const [sourceEntityId, relations] of relationshipsBySource.entries()) {
      try {
        this._progress.message = `Creating ${relations.length} relationship(s) from entity ${sourceEntityId}`;
        this._batchedRender();

        const results = await kankaService.batchCreateRelations(sourceEntityId, relations, {
          continueOnError: true,
          onProgress: (current, total) => {
            this._progress.message = `Creating relationships (${current}/${total})`;
            this._batchedRender();
          }
        });

        // Count successes and failures
        for (const result of results) {
          if (result._error) {
            relationshipsFailed++;
            this._logger.warn(
              `Failed to create relationship: ${result.relation} - ${result._error}`
            );
          } else {
            relationshipsCreated++;
          }
        }
      } catch (error) {
        this._logger.error(`Failed to create relationships for entity ${sourceEntityId}:`, error);
        relationshipsFailed += relations.length;
      }
    }

    // Log summary
    if (relationshipsCreated > 0) {
      this._logger.log(`Successfully created ${relationshipsCreated} relationship(s) in Kanka`);
      ui.notifications?.info(
        game.i18n?.format('VOXCHRONICLE.EntityPreview.RelationshipsCreated', {
          count: relationshipsCreated
        }) || `${relationshipsCreated} relationship(s) created in Kanka`
      );
    }

    if (relationshipsFailed > 0) {
      this._logger.warn(`Failed to create ${relationshipsFailed} relationship(s)`);
      ui.notifications?.warn(
        game.i18n?.format('VOXCHRONICLE.EntityPreview.RelationshipsFailed', {
          count: relationshipsFailed
        }) || `${relationshipsFailed} relationship(s) failed to create`
      );
    }
  }

  /**
   * Map relationship confidence (1-10) to Kanka attitude (-3 to 3)
   * @param {number} confidence - Confidence score (1-10)
   * @returns {number} Kanka attitude (-3 to 3)
   * @private
   */
  _mapConfidenceToAttitude(confidence) {
    if (!confidence || confidence < 1 || confidence > 10) {
      return 0; // Neutral
    }

    // Map 1-10 scale to -3 to 3 scale
    // 1-3: negative attitudes (-3 to -1)
    // 4-7: neutral attitudes (0)
    // 8-10: positive attitudes (1 to 3)
    if (confidence <= 3) {
      return Math.floor((confidence - 4) / 1); // -3 to -1
    } else if (confidence >= 8) {
      return Math.floor((confidence - 7) / 1); // 1 to 3
    }
    return 0; // Neutral for 4-7
  }

  /**
   * Handle skip all button click
   * @param {Event} event - The click event
   * @private
   */
  _onSkipAll(event) {
    event.preventDefault();
    this._logger.log('Skipping all entities');

    if (this._onCancelCallback) {
      this._onCancelCallback({ skipped: true });
    }

    this.close();
  }

  /**
   * Handle cancel button click
   * @param {Event} event - The click event
   * @private
   */
  _onCancel(event) {
    event.preventDefault();
    this._logger.log('Cancelling entity preview');

    if (this._onCancelCallback) {
      this._onCancelCallback({ cancelled: true });
    }

    this.close();
  }

  /**
   * Handle close button click
   * @param {Event} event - The click event
   * @private
   */
  _onClose(event) {
    event.preventDefault();
    this.close();
  }

  /**
   * Handle retry button click
   * @param {Event} event - The click event
   * @private
   */
  _onRetry(event) {
    event.preventDefault();
    this._logger.log('Retrying failed entities');

    // Reset to review mode, keeping only failed entities
    this._mode = PreviewMode.REVIEW;
    this._results = { created: [], failed: [] };
    this.render();
  }

  /**
   * Handle edit description button click
   * @param {Event} event - The click event
   * @param {HTMLElement} [target] - The action target element
   * @private
   */
  async _onEditDescription(event, target) {
    event.preventDefault();

    const button = target || event.currentTarget;
    const entityType = button.dataset.entityType;
    const entityIndex = parseInt(button.dataset.entityIndex, 10);

    if (!entityType || isNaN(entityIndex)) return;

    const entity = this._entities[entityType]?.[entityIndex];
    if (!entity) return;

    // Show edit dialog
    const newDescription = await this._showEditDialog(entity.name, entity.description);

    if (newDescription !== null && newDescription !== entity.description) {
      this._entities[entityType][entityIndex].description = newDescription;
      this._logger.debug(`Updated description for ${entityType}[${entityIndex}]`);
      this.render();
    }
  }

  /**
   * Show an edit dialog for entity description
   * @param {string} name - Entity name
   * @param {string} currentDescription - Current description
   * @returns {Promise<string|null>} New description or null if cancelled
   * @private
   */
  async _showEditDialog(name, currentDescription) {
    return new Promise((resolve) => {
      new Dialog({
        title:
          game.i18n?.format('VOXCHRONICLE.EntityPreview.EditDialogTitle', { name }) ||
          `Edit Description: ${name}`,
        content: `
          <form class="vox-chronicle-edit-description">
            <div class="form-group">
              <label>${game.i18n?.localize('VOXCHRONICLE.EntityPreview.Description') || 'Description'}</label>
              <textarea name="description" rows="6" style="width: 100%;">${currentDescription || ''}</textarea>
            </div>
          </form>
        `,
        buttons: {
          save: {
            icon: '<i class="fa-solid fa-save"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Buttons.Save') || 'Save',
            callback: (html) => {
              const el = html[0] ?? html;
              const description = el.querySelector('textarea[name="description"]')?.value ?? '';
              resolve(description);
            }
          },
          cancel: {
            icon: '<i class="fa-solid fa-times"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Buttons.Cancel') || 'Cancel',
            callback: () => resolve(null)
          }
        },
        default: 'save'
      }).render(true);
    });
  }

  /**
   * Handle generate portrait button click
   * @param {Event} event - The click event
   * @param {HTMLElement} [target] - The action target element
   * @private
   */
  async _onGeneratePortrait(event, target) {
    event.preventDefault();

    const button = target || event.currentTarget;
    const entityType = button.dataset.entityType;
    const entityIndex = parseInt(button.dataset.entityIndex, 10);

    if (!entityType || isNaN(entityIndex)) return;

    const entity = this._entities[entityType]?.[entityIndex];
    if (!entity) return;

    // Check OpenAI configuration
    const configStatus = Settings.getConfigurationStatus();
    if (!configStatus.openai) {
      ui.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Errors.ApiKeyMissing') ||
          'OpenAI API key is not configured'
      );
      return;
    }

    // Set loading state
    const entityKey = `${entityType}-${entityIndex}`;
    this._imageLoadingStates.set(entityKey, true);
    this._logger.debug(`Image generation started for ${entityKey}`);
    this.render();

    try {
      const vox = VoxChronicle.getInstance();
      const imageService = vox.imageGenerationService;

      if (!imageService) {
        throw new Error('Image generation service not available');
      }

      ui.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.ImageGeneration.Generating') || 'Generating image...'
      );

      // Map entity type to image type
      const imageType =
        entityType === 'characters'
          ? 'character'
          : entityType === 'locations'
            ? 'location'
            : 'item';

      const imageUrl = await imageService.generatePortrait(imageType, entity.description);

      // Store the image URL on the entity
      this._entities[entityType][entityIndex].imageUrl = imageUrl;

      ui.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.ImageGeneration.GenerationComplete') || 'Image generated'
      );

      this._logger.debug(`Image generation completed for ${entityKey}`);
    } catch (error) {
      this._logger.error('Failed to generate portrait:', error);
      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.ImageGeneration.GenerationFailed') ||
          'Image generation failed'
      );
    } finally {
      // Clear loading state
      this._imageLoadingStates.set(entityKey, false);
      this._logger.debug(`Image generation state cleared for ${entityKey}`);
      this.render();
    }
  }

  /**
   * Handle section toggle (collapse/expand)
   * @param {Event} event - The click event
   * @param {HTMLElement} [target] - The action target element
   * @private
   */
  _onToggleSection(event, target) {
    event.preventDefault();

    const header = target || event.currentTarget;
    const section = header.closest('.entity-section');

    if (section) {
      section.classList.toggle('collapsed');
    }
  }

  /**
   * Handle view graph button click
   * @param {Event} event - The click event
   * @private
   */
  _onViewGraph(event) {
    event.preventDefault();

    this._logger.debug('Opening relationship graph');

    // Create and show the relationship graph
    const graph = new RelationshipGraph({
      entities: this._entities,
      relationships: this._relationships
    });

    graph.render();
  }

  /**
   * Get the currently selected entities
   * @returns {object} Selected entities by type
   */
  getSelectedEntities() {
    const selected = {
      characters: [],
      locations: [],
      items: []
    };

    this._entities.characters.forEach((entity, index) => {
      if (this._selections.get(`characters-${index}`)) {
        selected.characters.push(entity);
      }
    });

    this._entities.locations.forEach((entity, index) => {
      if (this._selections.get(`locations-${index}`)) {
        selected.locations.push(entity);
      }
    });

    this._entities.items.forEach((entity, index) => {
      if (this._selections.get(`items-${index}`)) {
        selected.items.push(entity);
      }
    });

    return selected;
  }

  /**
   * Get the currently selected relationships
   * @returns {Array} Selected relationships
   */
  getSelectedRelationships() {
    const selected = [];

    this._relationships.forEach((relationship, index) => {
      if (this._selections.get(`relationship-${index}`)) {
        selected.push(relationship);
      }
    });

    return selected;
  }

  /**
   * Get all entities (including unselected)
   * @returns {object} All entities by type
   */
  getAllEntities() {
    return { ...this._entities };
  }

  /**
   * Get all relationships (including unselected)
   * @returns {Array} All relationships
   */
  getAllRelationships() {
    return [...this._relationships];
  }

  /**
   * Get the creation results
   * @returns {object} Creation results with created and failed arrays
   */
  getResults() {
    return { ...this._results };
  }

  /**
   * Close the preview and clean up pending timeouts
   * @param {object} [options] - Close options
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    this.#listenerController?.abort();
    if (this._renderTimeout !== null) {
      clearTimeout(this._renderTimeout);
      this._renderTimeout = null;
      this._pendingRender = false;
    }
    return super.close(options);
  }

  /**
   * Reset the preview state
   */
  reset() {
    this._entities = { characters: [], locations: [], items: [] };
    this._relationships = [];
    this._selections.clear();
    this._imageLoadingStates.clear();
    this._mode = PreviewMode.REVIEW;
    this._progress = { current: 0, total: 0, message: '' };
    this._results = { created: [], failed: [] };
    this.render();
  }

  /**
   * Static factory method to create and show an EntityPreview dialog
   * @param {object} entities - Extracted entities to preview
   * @param {object} [options] - Additional options
   * @returns {Promise<object>} Result with selected entities or cancellation info
   * @static
   */
  static async show(entities, options = {}) {
    return new Promise((resolve) => {
      const preview = new EntityPreview({
        entities,
        onConfirm: (results) => {
          resolve({
            confirmed: true,
            results
          });
        },
        onCancel: (info) => {
          resolve({
            confirmed: false,
            ...info
          });
        },
        ...options
      });

      preview.render();
    });
  }
}

// Export the class and enums
export { EntityPreview, EntitySelectionState, PreviewMode };
