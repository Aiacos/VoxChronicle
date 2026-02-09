/**
 * VocabularyManager - UI Component for Managing Custom Vocabulary Dictionary
 *
 * A Foundry VTT FormApplication that allows GMs to manage campaign-specific
 * vocabulary terms across multiple categories (characters, locations, items, terms, custom).
 * These terms are used in transcription prompts to improve accuracy for TTRPG-specific
 * terminology like spell names, creature names, and fantasy proper nouns.
 *
 * @class VocabularyManager
 * @augments Application
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
   * @type {object}
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
   * @returns {object} Default application options
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
   * @param {object} [options] - Application options
   */
  constructor(options = {}) {
    super(options);
    this._dictionary = new VocabularyDictionary();
    this._logger.debug('VocabularyManager initialized');
  }

  /**
   * Get data for the template
   * @param {object} options - Render options
   * @returns {object} Template data
   */
  async getData(options = {}) {
    const data = await super.getData(options);

    // Get all categories with their terms
    const allTerms = this._dictionary.getAllTerms();

    // Build category data
    const categories = [
      {
        id: VocabularyCategory.CHARACTER_NAMES,
        label:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCharacters') || 'Character Names',
        terms: allTerms[VocabularyCategory.CHARACTER_NAMES] || [],
        icon: 'fa-user',
        description:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCharactersDesc') ||
          'NPC and character names from your campaign'
      },
      {
        id: VocabularyCategory.LOCATION_NAMES,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryLocations') || 'Location Names',
        terms: allTerms[VocabularyCategory.LOCATION_NAMES] || [],
        icon: 'fa-map-marker-alt',
        description:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryLocationsDesc') ||
          'Cities, dungeons, and places in your world'
      },
      {
        id: VocabularyCategory.ITEMS,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryItems') || 'Items & Artifacts',
        terms: allTerms[VocabularyCategory.ITEMS] || [],
        icon: 'fa-gem',
        description:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryItemsDesc') ||
          'Magical items, artifacts, and equipment'
      },
      {
        id: VocabularyCategory.TERMS,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryTerms') || 'Game Terms',
        terms: allTerms[VocabularyCategory.TERMS] || [],
        icon: 'fa-book',
        description:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryTermsDesc') ||
          'Spells, abilities, creatures, and game-specific terminology'
      },
      {
        id: VocabularyCategory.CUSTOM,
        label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCustom') || 'Custom Terms',
        terms: allTerms[VocabularyCategory.CUSTOM] || [],
        icon: 'fa-star',
        description:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCustomDesc') ||
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
        description:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.Description') ||
          'Manage custom vocabulary terms to improve transcription accuracy for your campaign.',
        addTerm: game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddTerm') || 'Add Term',
        removeTerm: game.i18n?.localize('VOXCHRONICLE.Vocabulary.RemoveTerm') || 'Remove',
        clearCategory:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ClearCategory') || 'Clear Category',
        clearAll: game.i18n?.localize('VOXCHRONICLE.Vocabulary.ClearAll') || 'Clear All',
        suggestFoundry:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.SuggestFoundry') || 'Suggest from Foundry',
        importDict: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Import') || 'Import Dictionary',
        exportDict: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Export') || 'Export Dictionary',
        termPlaceholder:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.TermPlaceholder') || 'Enter term...',
        noTerms: game.i18n?.localize('VOXCHRONICLE.Vocabulary.NoTerms') || 'No terms added yet',
        totalTermsLabel: game.i18n?.localize('VOXCHRONICLE.Vocabulary.TotalTerms') || 'Total Terms',
        addSuccess:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddSuccess') || 'Term added successfully',
        addDuplicate:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddDuplicate') || 'Term already exists',
        removeSuccess:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.RemoveSuccess') || 'Term removed',
        clearSuccess:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ClearSuccess') || 'Category cleared',
        clearAllSuccess:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ClearAllSuccess') || 'All terms cleared',
        importSuccess:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportSuccess') || 'Dictionary imported',
        exportSuccess:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ExportSuccess') || 'Dictionary exported',
        confirmClearCategory:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearCategory') ||
          'Are you sure you want to clear all terms in this category?',
        confirmClearAll:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearAll') ||
          'Are you sure you want to clear all vocabulary terms?',
        importMerge:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportMerge') || 'Merge with existing terms',
        importReplace:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.ImportReplace') || 'Replace all terms'
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

    // Suggest from Foundry button
    html.find('.suggest-foundry-btn').on('click', this._onSuggestFromFoundry.bind(this));

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
      title:
        game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearCategoryTitle') ||
        'Clear Category',
      content:
        game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearCategory') ||
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
      title:
        game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearAllTitle') || 'Clear All Terms',
      content:
        game.i18n?.localize('VOXCHRONICLE.Vocabulary.ConfirmClearAll') ||
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
                game.i18n?.localize('VOXCHRONICLE.Vocabulary.EmptyImport') ||
                  'Please paste JSON data'
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
            label:
              game.i18n?.localize('VOXCHRONICLE.Vocabulary.CopyToClipboard') || 'Copy to Clipboard',
            callback: async (html) => {
              const textarea = html.find('textarea')[0];
              textarea.select();

              try {
                await navigator.clipboard.writeText(json);
                ui.notifications.info(
                  game.i18n?.localize('VOXCHRONICLE.Vocabulary.CopiedToClipboard') ||
                    'Dictionary copied to clipboard'
                );
              } catch {
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

  /**
   * Collect vocabulary suggestions from Foundry world data
   * @returns {object} Suggestions object with character_names and items arrays
   * @private
   */
  _collectFoundrySuggestions() {
    const suggestions = {
      [VocabularyCategory.CHARACTER_NAMES]: [],
      [VocabularyCategory.ITEMS]: []
    };

    try {
      // Collect actor names (characters and NPCs)
      if (game.actors) {
        game.actors.forEach((actor) => {
          if (actor.name && actor.name.trim()) {
            suggestions[VocabularyCategory.CHARACTER_NAMES].push(actor.name.trim());
          }
        });
      }

      // Collect item names
      if (game.items) {
        game.items.forEach((item) => {
          if (item.name && item.name.trim()) {
            suggestions[VocabularyCategory.ITEMS].push(item.name.trim());
          }
        });
      }

      // Remove duplicates and sort
      suggestions[VocabularyCategory.CHARACTER_NAMES] = [
        ...new Set(suggestions[VocabularyCategory.CHARACTER_NAMES])
      ].sort();

      suggestions[VocabularyCategory.ITEMS] = [
        ...new Set(suggestions[VocabularyCategory.ITEMS])
      ].sort();

      this._logger.debug('Collected Foundry suggestions:', {
        characterCount: suggestions[VocabularyCategory.CHARACTER_NAMES].length,
        itemCount: suggestions[VocabularyCategory.ITEMS].length
      });

      return suggestions;
    } catch (error) {
      this._logger.error('Failed to collect Foundry suggestions:', error);
      return suggestions;
    }
  }

  /**
   * Handle suggesting terms from Foundry world data
   * @param {Event} event - The click event
   * @private
   */
  async _onSuggestFromFoundry(event) {
    event.preventDefault();

    try {
      // Collect suggestions
      const suggestions = this._collectFoundrySuggestions();

      const characterCount = suggestions[VocabularyCategory.CHARACTER_NAMES].length;
      const itemCount = suggestions[VocabularyCategory.ITEMS].length;
      const totalCount = characterCount + itemCount;

      if (totalCount === 0) {
        ui.notifications.warn(
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.NoSuggestions') ||
            'No actors or items found in your world'
        );
        return;
      }

      // Build suggestions HTML
      let suggestionsHtml = '<form><div style="max-height: 400px; overflow-y: auto;">';

      // Character names section
      if (characterCount > 0) {
        suggestionsHtml += `
          <div class="form-group">
            <label style="font-weight: bold; margin-bottom: 0.5em; display: block;">
              <i class="fas fa-user"></i>
              ${game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryCharacters') || 'Character Names'}
              (${characterCount})
            </label>
            <div style="margin-left: 1em;">
              <label style="margin-bottom: 0.5em; display: block;">
                <input type="checkbox" name="select-all-characters" />
                ${game.i18n?.localize('VOXCHRONICLE.Vocabulary.SelectAll') || 'Select All'}
              </label>
        `;

        suggestions[VocabularyCategory.CHARACTER_NAMES].forEach((name) => {
          // Check if term already exists
          const exists = this._dictionary.hasTerm(VocabularyCategory.CHARACTER_NAMES, name);
          const disabled = exists ? 'disabled checked' : '';
          const style = exists ? 'opacity: 0.5;' : '';

          suggestionsHtml += `
            <label style="display: block; margin-bottom: 0.25em; ${style}">
              <input type="checkbox"
                     name="character"
                     value="${name}"
                     ${disabled} />
              ${name}
              ${exists ? '<em>(already added)</em>' : ''}
            </label>
          `;
        });

        suggestionsHtml += '</div></div>';
      }

      // Items section
      if (itemCount > 0) {
        suggestionsHtml += `
          <div class="form-group">
            <label style="font-weight: bold; margin-bottom: 0.5em; display: block;">
              <i class="fas fa-gem"></i>
              ${game.i18n?.localize('VOXCHRONICLE.Vocabulary.CategoryItems') || 'Items & Artifacts'}
              (${itemCount})
            </label>
            <div style="margin-left: 1em;">
              <label style="margin-bottom: 0.5em; display: block;">
                <input type="checkbox" name="select-all-items" />
                ${game.i18n?.localize('VOXCHRONICLE.Vocabulary.SelectAll') || 'Select All'}
              </label>
        `;

        suggestions[VocabularyCategory.ITEMS].forEach((name) => {
          // Check if term already exists
          const exists = this._dictionary.hasTerm(VocabularyCategory.ITEMS, name);
          const disabled = exists ? 'disabled checked' : '';
          const style = exists ? 'opacity: 0.5;' : '';

          suggestionsHtml += `
            <label style="display: block; margin-bottom: 0.25em; ${style}">
              <input type="checkbox"
                     name="item"
                     value="${name}"
                     ${disabled} />
              ${name}
              ${exists ? '<em>(already added)</em>' : ''}
            </label>
          `;
        });

        suggestionsHtml += '</div></div>';
      }

      suggestionsHtml += '</div></form>';

      // Show dialog
      new Dialog({
        title:
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.SuggestFoundryTitle') ||
          'Suggest from Foundry',
        content: suggestionsHtml,
        buttons: {
          add: {
            icon: '<i class="fas fa-plus"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddSelected') || 'Add Selected',
            callback: async (html) => {
              let addedCount = 0;

              // Add selected character names
              html.find('input[name="character"]:checked:not(:disabled)').each((i, el) => {
                const term = $(el).val();
                if (this._dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, term)) {
                  addedCount++;
                }
              });

              // Add selected items
              html.find('input[name="item"]:checked:not(:disabled)').each((i, el) => {
                const term = $(el).val();
                if (this._dictionary.addTerm(VocabularyCategory.ITEMS, term)) {
                  addedCount++;
                }
              });

              if (addedCount > 0) {
                ui.notifications.info(
                  game.i18n?.format('VOXCHRONICLE.Vocabulary.SuggestAddedCount', {
                    count: addedCount
                  }) || `Added ${addedCount} term${addedCount !== 1 ? 's' : ''}`
                );
                this.render(false);
              } else {
                ui.notifications.warn(
                  game.i18n?.localize('VOXCHRONICLE.Vocabulary.NoTermsSelected') ||
                    'No terms selected'
                );
              }
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Button.Cancel') || 'Cancel'
          }
        },
        default: 'add',
        render: (html) => {
          // Handle "select all" checkboxes
          html.find('input[name="select-all-characters"]').on('change', function () {
            const checked = $(this).is(':checked');
            html.find('input[name="character"]:not(:disabled)').prop('checked', checked);
          });

          html.find('input[name="select-all-items"]').on('change', function () {
            const checked = $(this).is(':checked');
            html.find('input[name="item"]:not(:disabled)').prop('checked', checked);
          });
        }
      }).render(true);
    } catch (error) {
      this._logger.error('Failed to suggest from Foundry:', error);
      ui.notifications.error(
        game.i18n?.format('VOXCHRONICLE.Error.Message', { error: error.message }) ||
          `Error: ${error.message}`
      );
    }
  }
}
