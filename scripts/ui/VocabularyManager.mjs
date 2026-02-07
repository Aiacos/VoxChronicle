/**
 * VocabularyManager - UI Component for Managing Custom Vocabulary Dictionary
 *
 * A Foundry VTT FormApplication that allows GMs to manage campaign-specific
 * vocabulary terms across multiple categories (characters, locations, items, terms, custom).
 * These terms are used in transcription prompts to improve accuracy for TTRPG-specific
 * terminology like spell names, creature names, and fantasy proper nouns.
 *
 * @class VocabularyManager
 * @extends Application
 * @module vox-chronicle
 */

import { MODULE_ID } from '../main.mjs';
import { Logger } from '../utils/Logger.mjs';
import { VocabularyDictionary, VocabularyCategory } from '../core/VocabularyDictionary.mjs';

/**
 * VocabularyManager Application class
 * Provides UI for managing custom vocabulary terms across categories
 */
export class VocabularyManager extends Application {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('VocabularyManager');

  /**
   * VocabularyDictionary service instance
   * @type {VocabularyDictionary}
   * @private
   */
  _dictionary = null;

  /**
   * Currently active category tab
   * @type {string}
   * @private
   */
  _activeCategory = VocabularyCategory.CHARACTER_NAMES;

  /**
   * Get default options for the Application
   * @returns {Object} Default application options
   * @static
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-vocabulary-manager',
      title: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Title') || 'Vocabulary Manager',
      template: `modules/${MODULE_ID}/templates/vocabulary-manager.hbs`,
      classes: ['vox-chronicle', 'vocabulary-manager'],
      width: 600,
      height: 600,
      minimizable: true,
      resizable: true,
      tabs: [
        {
          navSelector: '.tabs',
          contentSelector: '.tab-content',
          initial: VocabularyCategory.CHARACTER_NAMES
        }
      ]
    });
  }

  /**
   * Create a new VocabularyManager instance
   * @param {Object} [options] - Application options
   */
  constructor(options = {}) {
    super(options);
    this._dictionary = new VocabularyDictionary();
    this._logger.debug('VocabularyManager initialized');
  }

  /**
   * Get data for the template
   * @param {Object} options - Render options
   * @returns {Object} Template data
   */
  async getData(options = {}) {
    const data = await super.getData(options);

    // Get all categories with their terms
    const allTerms = this._dictionary.getAllTerms();

    // Build category data
    const categories = [
      {
        id: VocabularyCategory.CHARACTER_NAMES,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCharacters') || 'Character Names',
        terms: allTerms[VocabularyCategory.CHARACTER_NAMES] || [],
        icon: 'fa-user',
        description: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCharactersDesc') ||
          'NPC and character names from your campaign'
      },
      {
        id: VocabularyCategory.LOCATION_NAMES,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryLocations') || 'Location Names',
        terms: allTerms[VocabularyCategory.LOCATION_NAMES] || [],
        icon: 'fa-map-marker-alt',
        description: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryLocationsDesc') ||
          'Cities, dungeons, and places in your world'
      },
      {
        id: VocabularyCategory.ITEMS,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryItems') || 'Items & Artifacts',
        terms: allTerms[VocabularyCategory.ITEMS] || [],
        icon: 'fa-gem',
        description: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryItemsDesc') ||
          'Magical items, artifacts, and equipment'
      },
      {
        id: VocabularyCategory.TERMS,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryTerms') || 'Game Terms',
        terms: allTerms[VocabularyCategory.TERMS] || [],
        icon: 'fa-book',
        description: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryTermsDesc') ||
          'Spells, abilities, creatures, and game-specific terminology'
      },
      {
        id: VocabularyCategory.CUSTOM,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCustom') || 'Custom Terms',
        terms: allTerms[VocabularyCategory.CUSTOM] || [],
        icon: 'fa-star',
        description: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCustomDesc') ||
          'Any other terms specific to your campaign'
      }
    ];

    // Get total term count
    const totalTerms = this._dictionary.getTotalTermCount();

    return foundry.utils.mergeObject(data, {
      moduleId: MODULE_ID,
      categories,
      activeCategory: this._activeCategory,
      totalTerms,
      hasTerms: totalTerms > 0,
      // Localization strings
      i18n: {
        title: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Title') || 'Vocabulary Manager',
        description: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Description') ||
          'Manage custom vocabulary terms to improve transcription accuracy for your campaign.',
        addTerm: game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddTerm') || 'Add Term',
        removeTerm: game.i18n?.localize('VOXCHRONICLE.Vocabulary.RemoveTerm') || 'Remove',
        clearCategory: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ClearCategory') || 'Clear Category',
        clearAll: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ClearAll') || 'Clear All',
        importDict: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Import') || 'Import Dictionary',
        exportDict: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Export') || 'Export Dictionary',
        termPlaceholder: game.i18n?.localize('VOXCHRONICLE.Vocabulary.TermPlaceholder') || 'Enter term...',
        noTerms: game.i18n?.localize('VOXCHRONICLE.Vocabulary.NoTerms') || 'No terms added yet',
        totalTermsLabel: game.i18n?.localize('VOXCHRONICLE.Vocabulary.TotalTerms') || 'Total Terms',
        addSuccess: game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddSuccess') || 'Term added successfully',
        addDuplicate: game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddDuplicate') || 'Term already exists',
        removeSuccess: game.i18n?.localize('VOXCHRONICLE.Vocabulary.RemoveSuccess') || 'Term removed',
        clearSuccess: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ClearSuccess') || 'Category cleared',
        clearAllSuccess: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ClearAllSuccess') || 'All terms cleared',
        importSuccess: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportSuccess') || 'Dictionary imported',
        exportSuccess: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ExportSuccess') || 'Dictionary exported',
        confirmClearCategory: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearCategory') ||
          'Are you sure you want to clear all terms in this category?',
        confirmClearAll: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearAll') ||
          'Are you sure you want to clear all vocabulary terms?',
        importMerge: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportMerge') || 'Merge with existing terms',
        importReplace: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportReplace') || 'Replace all terms'
      }
    });
  }

  /**
   * Activate event listeners for the application
   * @param {jQuery} html - The rendered HTML
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Add term button
    html.find('.add-term-btn').on('click', this._onAddTerm.bind(this));

    // Add term on Enter key
    html.find('.term-input').on('keypress', (event) => {
      if (event.which === 13) {
        event.preventDefault();
        this._onAddTerm(event);
      }
    });

    // Remove term buttons
    html.find('.remove-term-btn').on('click', this._onRemoveTerm.bind(this));

    // Clear category button
    html.find('.clear-category-btn').on('click', this._onClearCategory.bind(this));

    // Clear all button
    html.find('.clear-all-btn').on('click', this._onClearAll.bind(this));

    // Import button
    html.find('.import-btn').on('click', this._onImport.bind(this));

    // Export button
    html.find('.export-btn').on('click', this._onExport.bind(this));

    // Track active tab
    html.find('.tabs .item').on('click', (event) => {
      this._activeCategory = event.currentTarget.dataset.tab;
    });

    this._logger.debug('Event listeners activated');
  }

  /**
   * Handle adding a new term
   * @param {Event} event - The click event
   * @private
   */
  async _onAddTerm(event) {
    event.preventDefault();

    const button = $(event.currentTarget);
    const container = button.closest('.category-content');
    const input = container.find('.term-input');
    const term = input.val().trim();
    const category = container.data('category');

    if (!term) {
      ui.notifications.warn(
        game.i18n?.localize('VOXCHRONICLE.Vocabulary.EmptyTerm') || 'Please enter a term'
      );
      return;
    }

    try {
      const added = await this._dictionary.addTerm(category, term);

      if (added) {
        ui.notifications.info(
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddSuccess') || 'Term added successfully'
        );
        input.val('');
        this.render(false);
      } else {
        ui.notifications.warn(
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddDuplicate') || 'Term already exists'
        );
      }
    } catch (error) {
      this._logger.error('Failed to add term:', error);
      ui.notifications.error(
        game.i18n?.format('VOXCHRONICLE.Error.Message', { error: error.message }) ||
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Handle removing a term
   * @param {Event} event - The click event
   * @private
   */
  async _onRemoveTerm(event) {
    event.preventDefault();

    const button = $(event.currentTarget);
    const term = button.data('term');
    const category = button.closest('.category-content').data('category');

    try {
      const removed = await this._dictionary.removeTerm(category, term);

      if (removed) {
        ui.notifications.info(
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.RemoveSuccess') || 'Term removed'
        );
        this.render(false);
      }
    } catch (error) {
      this._logger.error('Failed to remove term:', error);
      ui.notifications.error(
        game.i18n?.format('VOXCHRONICLE.Error.Message', { error: error.message }) ||
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Handle clearing all terms in a category
   * @param {Event} event - The click event
   * @private
   */
  async _onClearCategory(event) {
    event.preventDefault();

    const button = $(event.currentTarget);
    const category = button.closest('.category-content').data('category');

    // Confirm with user
    const confirm = await Dialog.confirm({
      title: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearCategoryTitle') || 'Clear Category',
      content: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearCategory') ||
        'Are you sure you want to clear all terms in this category?',
      yes: () => true,
      no: () => false
    });

    if (!confirm) return;

    try {
      const removed = await this._dictionary.clearCategory(category);

      ui.notifications.info(
        game.i18n?.format('VOXCHRONICLE.Vocabulary.ClearCategorySuccess', { count: removed }) ||
        `Cleared ${removed} terms`
      );
      this.render(false);
    } catch (error) {
      this._logger.error('Failed to clear category:', error);
      ui.notifications.error(
        game.i18n?.format('VOXCHRONICLE.Error.Message', { error: error.message }) ||
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Handle clearing all vocabulary terms
   * @param {Event} event - The click event
   * @private
   */
  async _onClearAll(event) {
    event.preventDefault();

    // Confirm with user
    const confirm = await Dialog.confirm({
      title: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearAllTitle') || 'Clear All Terms',
      content: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearAll') ||
        'Are you sure you want to clear all vocabulary terms?',
      yes: () => true,
      no: () => false
    });

    if (!confirm) return;

    try {
      const removed = await this._dictionary.clearAll();

      ui.notifications.info(
        game.i18n?.format('VOXCHRONICLE.Vocabulary.ClearAllSuccess', { count: removed }) ||
        `Cleared ${removed} terms`
      );
      this.render(false);
    } catch (error) {
      this._logger.error('Failed to clear all terms:', error);
      ui.notifications.error(
        game.i18n?.format('VOXCHRONICLE.Error.Message', { error: error.message }) ||
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Handle importing a dictionary from JSON
   * @param {Event} event - The click event
   * @private
   */
  async _onImport(event) {
    event.preventDefault();

    // Create import dialog with merge option
    new Dialog({
      title: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportTitle') || 'Import Dictionary',
      content: `
        <form>
          <div class="form-group">
            <label>${game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportLabel') || 'Paste JSON dictionary:'}</label>
            <textarea name="json" rows="10" style="width: 100%; font-family: monospace;"></textarea>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="merge" checked />
              ${game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportMerge') || 'Merge with existing terms'}
            </label>
          </div>
        </form>
      `,
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Import') || 'Import',
          callback: async (html) => {
            const json = html.find('[name="json"]').val().trim();
            const merge = html.find('[name="merge"]').is(':checked');

            if (!json) {
              ui.notifications.warn(
                game.i18n?.localize('VOXCHRONICLE.Vocabulary.EmptyImport') || 'Please paste JSON data'
              );
              return;
            }

            try {
              const stats = await this._dictionary.importDictionary(json, merge);

              ui.notifications.info(
                game.i18n?.format('VOXCHRONICLE.Vocabulary.ImportStats', stats) ||
                `Imported: ${stats.added} added, ${stats.skipped} skipped`
              );
              this.render(false);
            } catch (error) {
              this._logger.error('Failed to import dictionary:', error);
              ui.notifications.error(
                game.i18n?.format('VOXCHRONICLE.Error.Message', { error: error.message }) ||
                `Error: ${error.message}`
              );
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n?.localize('VOXCHRONICLE.Button.Cancel') || 'Cancel'
        }
      },
      default: 'import'
    }).render(true);
  }

  /**
   * Handle exporting the dictionary as JSON
   * @param {Event} event - The click event
   * @private
   */
  async _onExport(event) {
    event.preventDefault();

    try {
      const json = this._dictionary.exportDictionary();

      // Display in a dialog with copy button
      new Dialog({
        title: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ExportTitle') || 'Export Dictionary',
        content: `
          <form>
            <div class="form-group">
              <label>${game.i18n?.localize('VOXCHRONICLE.Vocabulary.ExportLabel') || 'Copy this JSON:'}</label>
              <textarea readonly rows="10" style="width: 100%; font-family: monospace;">${json}</textarea>
            </div>
          </form>
        `,
        buttons: {
          copy: {
            icon: '<i class="fas fa-copy"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CopyToClipboard') || 'Copy to Clipboard',
            callback: async (html) => {
              const textarea = html.find('textarea')[0];
              textarea.select();

              try {
                await navigator.clipboard.writeText(json);
                ui.notifications.info(
                  game.i18n?.localize('VOXCHRONICLE.Vocabulary.CopiedToClipboard') ||
                  'Dictionary copied to clipboard'
                );
              } catch (err) {
                // Fallback for older browsers
                document.execCommand('copy');
                ui.notifications.info(
                  game.i18n?.localize('VOXCHRONICLE.Vocabulary.CopiedToClipboard') ||
                  'Dictionary copied to clipboard'
                );
              }
            }
          },
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Button.Close') || 'Close'
          }
        },
        default: 'copy'
      }).render(true);

      ui.notifications.info(
        game.i18n?.localize('VOXCHRONICLE.Vocabulary.ExportSuccess') || 'Dictionary exported'
      );
    } catch (error) {
      this._logger.error('Failed to export dictionary:', error);
      ui.notifications.error(
        game.i18n?.format('VOXCHRONICLE.Error.Message', { error: error.message }) ||
        `Error: ${error.message}`
      );
    }
  }
}
