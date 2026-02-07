/**
 * EntityPreview - UI Component for Reviewing Extracted Entities Before Kanka Publish
 *
 * A Foundry VTT Application that displays entities extracted from a transcription
 * (characters, locations, items) and allows the user to review, edit, select,
 * and confirm which entities to create in Kanka.
 *
 * @class EntityPreview
 * @extends Application
 * @module vox-chronicle
 */

import { MODULE_ID } from '../main.mjs';
import { Logger } from '../utils/Logger.mjs';
import { Settings } from '../core/Settings.mjs';
import { VoxChronicle } from '../core/VoxChronicle.mjs';
import { escapeHtml } from '../utils/HtmlUtils.mjs';

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
 * EntityPreview Application class
 * Provides UI for reviewing extracted entities before publishing to Kanka
 */
class EntityPreview extends Application {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('EntityPreview');

  /**
   * Entities to preview
   * @type {Object}
   * @private
   */
  _entities = {
    characters: [],
    locations: [],
    items: []
  };

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
   * @type {Object}
   * @private
   */
  _progress = {
    current: 0,
    total: 0,
    message: ''
  };

  /**
   * Results from entity creation
   * @type {Object}
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
   * Get default options for the Application
   * @returns {Object} Default application options
   * @static
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-entity-preview',
      title: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Title') || 'Review Extracted Entities',
      template: `modules/${MODULE_ID}/templates/entity-preview.hbs`,
      classes: ['vox-chronicle', 'entity-preview'],
      width: 600,
      height: 'auto',
      minimizable: false,
      resizable: true,
      popOut: true
    });
  }

  /**
   * Create a new EntityPreview instance
   * @param {Object} [options] - Application options
   * @param {Object} [options.entities] - Extracted entities to preview
   * @param {Function} [options.onConfirm] - Callback when entities are confirmed
   * @param {Function} [options.onCancel] - Callback when preview is cancelled
   */
  constructor(options = {}) {
    super(options);

    if (options.entities) {
      this.setEntities(options.entities);
    }

    if (options.onConfirm) {
      this._onConfirmCallback = options.onConfirm;
    }

    if (options.onCancel) {
      this._onCancelCallback = options.onCancel;
    }

    this._logger.debug('EntityPreview initialized');
  }

  /**
   * Set the entities to preview
   * @param {Object} entities - Extracted entities object
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
   * Initialize selection state for all entities
   * @private
   */
  _initializeSelections() {
    ['characters', 'locations', 'items'].forEach(type => {
      this._entities[type].forEach((entity, index) => {
        const key = `${type}-${index}`;
        this._selections.set(key, true);
      });
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
   * Get data for the template
   * @param {Object} options - Render options
   * @returns {Object} Template data
   */
  async getData(options = {}) {
    const configStatus = Settings.getConfigurationStatus();
    const selectionState = this._getSelectionState();

    // Build entity lists with selection state
    const characters = this._entities.characters.map((entity, index) => ({
      ...entity,
      index,
      key: `characters-${index}`,
      selected: this._selections.get(`characters-${index}`) ?? true,
      typeLabel: entity.isNPC
        ? (game.i18n?.localize('VOXCHRONICLE.EntityPreview.IsNPC') || 'NPC')
        : (game.i18n?.localize('VOXCHRONICLE.EntityPreview.IsPC') || 'PC')
    }));

    const locations = this._entities.locations.map((entity, index) => ({
      ...entity,
      index,
      key: `locations-${index}`,
      selected: this._selections.get(`locations-${index}`) ?? true,
      typeLabel: entity.type || 'Location'
    }));

    const items = this._entities.items.map((entity, index) => ({
      ...entity,
      index,
      key: `items-${index}`,
      selected: this._selections.get(`items-${index}`) ?? true,
      typeLabel: entity.type || 'Item'
    }));

    const totalCount = this._getTotalEntityCount();
    const selectedCount = this._getSelectedCount();

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

      // Selection state
      selectionState,
      isAllSelected: selectionState === EntitySelectionState.ALL,
      isNoneSelected: selectionState === EntitySelectionState.NONE,
      totalCount,
      selectedCount,

      // Progress and results
      progress: this._progress,
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
        title: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Title') || 'Review Extracted Entities',
        description: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Description') ||
          'Review the entities extracted from your session. Select which ones to create in Kanka.',
        characters: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Characters') || 'Characters',
        locations: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Locations') || 'Locations',
        items: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Items') || 'Items',
        selectAll: game.i18n?.localize('VOXCHRONICLE.EntityPreview.SelectAll') || 'Select All',
        deselectAll: game.i18n?.localize('VOXCHRONICLE.EntityPreview.DeselectAll') || 'Deselect All',
        create: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Create') || 'Create Selected',
        skip: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Skip') || 'Skip All',
        cancel: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Cancel') || 'Cancel',
        generatePortrait: game.i18n?.localize('VOXCHRONICLE.EntityPreview.GeneratePortrait') || 'Generate Portrait',
        editDescription: game.i18n?.localize('VOXCHRONICLE.EntityPreview.EditDescription') || 'Edit Description',
        name: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Name') || 'Name',
        type: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Type') || 'Type',
        description: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Description') || 'Description',
        noEntities: game.i18n?.localize('VOXCHRONICLE.EntityPreview.NoEntities') || 'No entities to display',
        creating: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Creating') || 'Creating entities in Kanka...',
        created: game.i18n?.format('VOXCHRONICLE.EntityPreview.Created', { count: this._results.created.length }) ||
          `${this._results.created.length} entities created in Kanka`,
        partialSuccess: game.i18n?.format('VOXCHRONICLE.EntityPreview.PartialSuccess', {
          created: this._results.created.length,
          total: this._results.created.length + this._results.failed.length
        }) || `${this._results.created.length} of ${this._results.created.length + this._results.failed.length} entities created`,
        failed: game.i18n?.localize('VOXCHRONICLE.EntityPreview.Failed') || 'Failed to create entities',
        close: game.i18n?.localize('VOXCHRONICLE.Buttons.Close') || 'Close',
        retry: game.i18n?.localize('VOXCHRONICLE.Buttons.Retry') || 'Retry',
        notConfigured: game.i18n?.localize('VOXCHRONICLE.Kanka.NotConfigured') ||
          'Kanka is not configured. Please set your API token and campaign ID in module settings.'
      }
    };
  }

  /**
   * Activate event listeners for the rendered HTML
   * @param {jQuery} html - The rendered HTML element
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Entity selection checkboxes
    html.find('input[type="checkbox"][data-entity-key]').on('change', this._onToggleEntity.bind(this));

    // Select all button
    html.find('[data-action="select-all"]').on('click', this._onSelectAll.bind(this));

    // Deselect all button
    html.find('[data-action="deselect-all"]').on('click', this._onDeselectAll.bind(this));

    // Create selected entities button
    html.find('[data-action="confirm-create"]').on('click', this._onConfirmCreate.bind(this));

    // Skip all / cancel button
    html.find('[data-action="skip-all"]').on('click', this._onSkipAll.bind(this));
    html.find('[data-action="cancel"]').on('click', this._onCancel.bind(this));

    // Close button (for complete/error states)
    html.find('[data-action="close"]').on('click', this._onClose.bind(this));

    // Retry button (for error state)
    html.find('[data-action="retry"]').on('click', this._onRetry.bind(this));

    // Edit description button
    html.find('[data-action="edit-description"]').on('click', this._onEditDescription.bind(this));

    // Generate portrait button
    html.find('[data-action="generate-portrait"]').on('click', this._onGeneratePortrait.bind(this));

    // Section toggle (collapse/expand)
    html.find('[data-action="toggle-section"]').on('click', this._onToggleSection.bind(this));

    this._logger.debug('Event listeners activated');
  }

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
      this.render(false);
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
    this.render(false);
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
    this.render(false);
  }

  /**
   * Handle confirm create button click
   * @param {Event} event - The click event
   * @private
   */
  async _onConfirmCreate(event) {
    event.preventDefault();

    const selectedEntities = this.getSelectedEntities();
    const totalSelected = (
      selectedEntities.characters.length +
      selectedEntities.locations.length +
      selectedEntities.items.length
    );

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
    this.render(false);

    this._logger.log(`Creating ${totalSelected} entities in Kanka`);

    try {
      await this._createEntitiesInKanka(selectedEntities);

      this._mode = this._results.failed.length > 0 && this._results.created.length > 0
        ? PreviewMode.COMPLETE // Partial success
        : this._results.failed.length > 0
          ? PreviewMode.ERROR
          : PreviewMode.COMPLETE;

      this.render(false);

      // Call the confirm callback with results
      if (this._onConfirmCallback) {
        await this._onConfirmCallback(this._results);
      }

    } catch (error) {
      this._logger.error('Failed to create entities:', error);
      this._mode = PreviewMode.ERROR;
      this.render(false);
    }
  }

  /**
   * Create entities in Kanka
   * @param {Object} selectedEntities - Selected entities to create
   * @private
   */
  async _createEntitiesInKanka(selectedEntities) {
    const vox = VoxChronicle.getInstance();
    const kankaService = vox.kankaService;

    if (!kankaService) {
      throw new Error('Kanka service not available');
    }

    // Create characters
    for (const character of selectedEntities.characters) {
      try {
        this._progress.message = `Creating character: ${character.name}`;
        this.render(false);

        const result = await kankaService.createCharacter({
          name: character.name,
          entry: character.description,
          type: character.isNPC ? 'NPC' : 'PC'
        });

        this._results.created.push({
          type: 'character',
          name: character.name,
          kankaId: result?.data?.id
        });

        this._progress.current++;
        this.render(false);

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
        this.render(false);

        const result = await kankaService.createLocation({
          name: location.name,
          entry: location.description,
          type: location.type
        });

        this._results.created.push({
          type: 'location',
          name: location.name,
          kankaId: result?.data?.id
        });

        this._progress.current++;
        this.render(false);

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
        this.render(false);

        const result = await kankaService.createItem({
          name: item.name,
          entry: item.description,
          type: item.type
        });

        this._results.created.push({
          type: 'item',
          name: item.name,
          kankaId: result?.data?.id
        });

        this._progress.current++;
        this.render(false);

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
        }) || `${this._results.created.length} of ${this._results.created.length + this._results.failed.length} entities created`
      );
    }
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
    this.render(false);
  }

  /**
   * Handle edit description button click
   * @param {Event} event - The click event
   * @private
   */
  async _onEditDescription(event) {
    event.preventDefault();

    const button = event.currentTarget;
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
      this.render(false);
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
        title: `Edit Description: ${escapeHtml(name)}`,
        content: `
          <form class="vox-chronicle-edit-description">
            <div class="form-group">
              <label>${game.i18n?.localize('VOXCHRONICLE.EntityPreview.Description') || 'Description'}</label>
              <textarea name="description" rows="6" style="width: 100%;">${escapeHtml(currentDescription || '')}</textarea>
            </div>
          </form>
        `,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Buttons.Save') || 'Save',
            callback: (html) => {
              const description = html.find('textarea[name="description"]').val();
              resolve(description);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
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
   * @private
   */
  async _onGeneratePortrait(event) {
    event.preventDefault();

    const button = event.currentTarget;
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

    try {
      const vox = VoxChronicle.getInstance();
      const imageService = vox.imageGenerationService;

      if (!imageService) {
        throw new Error('Image generation service not available');
      }

      ui.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.ImageGeneration.Generating') ||
        'Generating image...'
      );

      // Map entity type to image type
      const imageType = entityType === 'characters' ? 'character'
        : entityType === 'locations' ? 'location'
          : 'item';

      const imageUrl = await imageService.generatePortrait(imageType, entity.description);

      // Store the image URL on the entity
      this._entities[entityType][entityIndex].imageUrl = imageUrl;

      ui.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.ImageGeneration.GenerationComplete') ||
        'Image generated'
      );

      this.render(false);

    } catch (error) {
      this._logger.error('Failed to generate portrait:', error);
      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.ImageGeneration.GenerationFailed') ||
        'Image generation failed'
      );
    }
  }

  /**
   * Handle section toggle (collapse/expand)
   * @param {Event} event - The click event
   * @private
   */
  _onToggleSection(event) {
    event.preventDefault();

    const header = event.currentTarget;
    const section = header.closest('.entity-section');

    if (section) {
      section.classList.toggle('collapsed');
    }
  }

  /**
   * Get the currently selected entities
   * @returns {Object} Selected entities by type
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
   * Get all entities (including unselected)
   * @returns {Object} All entities by type
   */
  getAllEntities() {
    return { ...this._entities };
  }

  /**
   * Get the creation results
   * @returns {Object} Creation results with created and failed arrays
   */
  getResults() {
    return { ...this._results };
  }

  /**
   * Reset the preview state
   */
  reset() {
    this._entities = { characters: [], locations: [], items: [] };
    this._selections.clear();
    this._mode = PreviewMode.REVIEW;
    this._progress = { current: 0, total: 0, message: '' };
    this._results = { created: [], failed: [] };
    this.render(false);
  }

  /**
   * Render fallback content when template is not available
   * This generates inline HTML for the entity preview
   * @returns {string} Inline HTML content
   * @private
   */
  _renderFallbackContent() {
    const data = this.getData();

    // Build entity section HTML
    const buildEntitySection = (title, entities, type) => {
      if (entities.length === 0) return '';

      const entityRows = entities.map(entity => `
        <div class="entity-row ${entity.selected ? 'selected' : ''}">
          <div class="entity-select">
            <input type="checkbox" data-entity-key="${escapeHtml(entity.key)}"
              ${entity.selected ? 'checked' : ''} />
          </div>
          <div class="entity-info">
            <div class="entity-name">${escapeHtml(entity.name)}</div>
            <div class="entity-type">${escapeHtml(entity.typeLabel)}</div>
            <div class="entity-description">${escapeHtml(entity.description || '')}</div>
          </div>
          <div class="entity-actions">
            <button type="button" data-action="edit-description"
              data-entity-type="${escapeHtml(type)}" data-entity-index="${entity.index}"
              title="${escapeHtml(data.i18n.editDescription)}">
              <i class="fas fa-edit"></i>
            </button>
            <button type="button" data-action="generate-portrait"
              data-entity-type="${escapeHtml(type)}" data-entity-index="${entity.index}"
              title="${escapeHtml(data.i18n.generatePortrait)}">
              <i class="fas fa-image"></i>
            </button>
          </div>
          ${entity.imageUrl ? `
            <div class="entity-preview-image">
              <img src="${escapeHtml(entity.imageUrl)}" alt="${escapeHtml(entity.name)}" />
            </div>
          ` : ''}
        </div>
      `).join('');

      return `
        <div class="entity-section">
          <div class="section-header" data-action="toggle-section">
            <i class="fas fa-chevron-down"></i>
            <span class="section-title">${title}</span>
            <span class="section-count">(${entities.length})</span>
          </div>
          <div class="section-content">
            ${entityRows}
          </div>
        </div>
      `;
    };

    // Build progress section
    const progressSection = data.hasProgress ? `
      <div class="entity-preview-progress">
        <div class="progress-message">${escapeHtml(data.progress.message)}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(data.progress.current / data.progress.total) * 100}%"></div>
        </div>
        <div class="progress-count">${data.progress.current} / ${data.progress.total}</div>
      </div>
    ` : '';

    // Build results section
    const resultsSection = data.hasResults ? `
      <div class="entity-preview-results ${data.isError ? 'error' : 'success'}">
        <div class="results-summary">
          ${data.createdCount > 0 ? `<div class="created-count"><i class="fas fa-check"></i> ${escapeHtml(data.i18n.created)}</div>` : ''}
          ${data.failedCount > 0 ? `<div class="failed-count"><i class="fas fa-times"></i> ${data.failedCount} failed</div>` : ''}
        </div>
        ${data.failedCount > 0 ? `
          <div class="failed-entities">
            ${data.results.failed.map(f => `<div class="failed-entity">${escapeHtml(f.type)}: ${escapeHtml(f.name)} - ${escapeHtml(f.error)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    ` : '';

    // Build action buttons based on mode
    let actionButtons = '';
    if (data.isReview) {
      actionButtons = `
        <div class="selection-actions">
          <button type="button" data-action="select-all" ${data.isAllSelected ? 'disabled' : ''}>
            <i class="fas fa-check-square"></i> ${data.i18n.selectAll}
          </button>
          <button type="button" data-action="deselect-all" ${data.isNoneSelected ? 'disabled' : ''}>
            <i class="fas fa-square"></i> ${data.i18n.deselectAll}
          </button>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-skip" data-action="skip-all">
            <i class="fas fa-forward"></i> ${data.i18n.skip}
          </button>
          <button type="button" class="btn-confirm" data-action="confirm-create"
            ${data.isNoneSelected || !data.isKankaConfigured ? 'disabled' : ''}>
            <i class="fas fa-cloud-upload-alt"></i> ${data.i18n.create} (${data.selectedCount})
          </button>
        </div>
      `;
    } else if (data.isComplete || data.isError) {
      actionButtons = `
        <div class="form-actions">
          ${data.isError ? `
            <button type="button" class="btn-retry" data-action="retry">
              <i class="fas fa-redo"></i> ${data.i18n.retry}
            </button>
          ` : ''}
          <button type="button" class="btn-close" data-action="close">
            <i class="fas fa-times"></i> ${data.i18n.close}
          </button>
        </div>
      `;
    }

    return `
      <div class="vox-chronicle-entity-preview">
        <div class="preview-description">
          <p>${data.i18n.description}</p>
        </div>

        ${!data.isKankaConfigured ? `
          <div class="preview-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${data.i18n.notConfigured}</span>
          </div>
        ` : ''}

        ${progressSection}
        ${resultsSection}

        ${data.isReview && data.hasEntities ? `
          <div class="entity-sections">
            ${buildEntitySection(data.i18n.characters, data.characters, 'characters')}
            ${buildEntitySection(data.i18n.locations, data.locations, 'locations')}
            ${buildEntitySection(data.i18n.items, data.items, 'items')}
          </div>
        ` : ''}

        ${!data.hasEntities && data.isReview ? `
          <div class="no-entities">
            <i class="fas fa-info-circle"></i>
            <span>${data.i18n.noEntities}</span>
          </div>
        ` : ''}

        ${actionButtons}
      </div>
    `;
  }

  /**
   * Override _renderInner to provide fallback content if template is missing
   * @param {Object} data - Template data
   * @returns {Promise<jQuery>} Rendered inner content
   * @protected
   */
  async _renderInner(data) {
    try {
      return await super._renderInner(data);
    } catch (error) {
      // Template not found, use inline fallback
      this._logger.warn('Template not found, using fallback HTML');
      const html = this._renderFallbackContent();
      return $(html);
    }
  }

  /**
   * Static factory method to create and show an EntityPreview dialog
   * @param {Object} entities - Extracted entities to preview
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Result with selected entities or cancellation info
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

      preview.render(true);
    });
  }
}

// Export the class and enums
export {
  EntityPreview,
  EntitySelectionState,
  PreviewMode
};
