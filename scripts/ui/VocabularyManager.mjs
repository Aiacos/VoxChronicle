/**
 * VocabularyManager - UI Component for Managing Custom Vocabulary Dictionary
 *
 * A Foundry VTT ApplicationV2 that allows GMs to manage campaign-specific
 * vocabulary terms across multiple categories (characters, locations, items, terms, custom).
 * These terms are used in transcription prompts to improve accuracy for TTRPG-specific
 * terminology like spell names, creature names, and fantasy proper nouns.
 *
 * @class VocabularyManager
 * @augments ApplicationV2
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { escapeHtml } from '../utils/HtmlUtils.mjs';
import { VocabularyDictionary, VocabularyCategory } from '../core/VocabularyDictionary.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * VocabularyManager Application class
 * Provides UI for managing custom vocabulary terms across categories
 */
export class VocabularyManager extends HandlebarsApplicationMixin(ApplicationV2) {
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
   * AbortController for non-action event listeners
   * @type {AbortController|null}
   * @private
   */
  #listenerController = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-vocabulary-manager',
    classes: ['vox-chronicle', 'vocabulary-manager'],
    window: {
      title: 'VOXCHRONICLE.Vocabulary.Title',
      resizable: true,
      minimizable: true
    },
    position: { width: 600, height: 600 },
    actions: {
      'add-term': VocabularyManager._onAddTermAction,
      'remove-term': VocabularyManager._onRemoveTermAction,
      'clear-category': VocabularyManager._onClearCategoryAction,
      'clear-all': VocabularyManager._onClearAllAction,
      'suggest-foundry': VocabularyManager._onSuggestFromFoundryAction,
      'import-dict': VocabularyManager._onImportAction,
      'export-dict': VocabularyManager._onExportAction
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/vocabulary-manager.hbs` }
  };

  /**
   * Create a new VocabularyManager instance
   * @param {object} [options] - Application options
   */
  constructor(options = {}) {
    super(options);
    this._dictionary = new VocabularyDictionary();
    this._logger.debug('VocabularyManager initialized');
  }

  // --- Static Action Handlers ---

  /** @private */
  static async _onAddTermAction(event, target) {
    return this._onAddTerm(event, target);
  }

  /** @private */
  static async _onRemoveTermAction(event, target) {
    return this._onRemoveTerm(event, target);
  }

  /** @private */
  static async _onClearCategoryAction(event, target) {
    return this._onClearCategory(event, target);
  }

  /** @private */
  static async _onClearAllAction(event, target) {
    return this._onClearAll(event);
  }

  /** @private */
  static async _onSuggestFromFoundryAction(event, target) {
    return this._onSuggestFromFoundry(event);
  }

  /** @private */
  static async _onImportAction(event, target) {
    return this._onImport(event);
  }

  /** @private */
  static async _onExportAction(event, target) {
    return this._onExport(event);
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

    // Enter key on term input triggers add-term
    this.element?.querySelectorAll('.term-input').forEach((input) => {
      input.addEventListener('keypress', (event) => {
        if (event.which === 13 || event.key === 'Enter') {
          event.preventDefault();
          this._onAddTerm(event);
        }
      }, { signal });
    });

    // Track active tab from tab clicks
    this.element?.querySelectorAll('.tabs .item').forEach((tab) => {
      tab.addEventListener('click', (event) => {
        this._activeCategory = event.currentTarget.dataset.tab;
      }, { signal });
    });

    this._logger.debug('Event listeners activated');
  }

  /**
   * Clean up event listeners on close
   * @param {object} [options] - Close options
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    this.#listenerController?.abort();
    return super.close(options);
  }

  /**
   * Prepare template context data
   * @param {object} _options - Render options
   * @returns {Promise<object>} Template data
   * @override
   */
  async _prepareContext(_options = {}) {
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

    return {
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
    };
  }

  /**
   * Handle adding a new term
   * @param {Event} event - The click or keypress event
   * @param {HTMLElement} [target] - The action target element
   * @private
   */
  async _onAddTerm(event, target) {
    event.preventDefault();

    const button = target || event.currentTarget;
    const container = button.closest('.category-content');
    const input = container?.querySelector('.term-input');
    const term = input?.value?.trim() ?? '';
    const category = container?.dataset?.category;

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
        if (input) input.value = '';
        this.render();
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
   * @param {HTMLElement} [target] - The action target element
   * @private
   */
  async _onRemoveTerm(event, target) {
    event.preventDefault();

    const button = target || event.currentTarget;
    const term = button.dataset.term;
    const category = button.closest('.category-content')?.dataset?.category;

    try {
      const removed = await this._dictionary.removeTerm(category, term);

      if (removed) {
        ui.notifications.info(
          game.i18n?.localize('VOXCHRONICLE.Vocabulary.RemoveSuccess') || 'Term removed'
        );
        this.render();
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
   * @param {HTMLElement} [target] - The action target element
   * @private
   */
  async _onClearCategory(event, target) {
    event.preventDefault();

    const button = target || event.currentTarget;
    const category = button.closest('.category-content')?.dataset?.category;

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
      this.render();
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
      this.render();
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
          icon: '<i class="fa-solid fa-file-import"></i>',
          label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.Import') || 'Import',
          callback: async (html) => {
            const el = html[0] ?? html;
            const json = el.querySelector('[name="json"]')?.value?.trim() ?? '';
            const merge = el.querySelector('[name="merge"]')?.checked ?? true;

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
              this.render();
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
          icon: '<i class="fa-solid fa-times"></i>',
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
              <textarea readonly rows="10" style="width: 100%; font-family: monospace;">${escapeHtml(json)}</textarea>
            </div>
          </form>
        `,
        buttons: {
          copy: {
            icon: '<i class="fa-solid fa-copy"></i>',
            label:
              game.i18n?.localize('VOXCHRONICLE.Vocabulary.CopyToClipboard') || 'Copy to Clipboard',
            callback: async (html) => {
              const el = html[0] ?? html;
              const textarea = el.querySelector('textarea');
              textarea?.select();

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
            icon: '<i class="fa-solid fa-times"></i>',
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
              <i class="fa-solid fa-user"></i>
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
          const safeName = escapeHtml(name);

          suggestionsHtml += `
            <label style="display: block; margin-bottom: 0.25em; ${style}">
              <input type="checkbox"
                     name="character"
                     value="${safeName}"
                     ${disabled} />
              ${safeName}
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
              <i class="fa-solid fa-gem"></i>
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
          const safeName = escapeHtml(name);

          suggestionsHtml += `
            <label style="display: block; margin-bottom: 0.25em; ${style}">
              <input type="checkbox"
                     name="item"
                     value="${safeName}"
                     ${disabled} />
              ${safeName}
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
            icon: '<i class="fa-solid fa-plus"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Vocabulary.AddSelected') || 'Add Selected',
            callback: async (html) => {
              const el = html[0] ?? html;
              let addedCount = 0;

              // Add selected character names
              el.querySelectorAll('input[name="character"]:checked:not(:disabled)').forEach(
                (checkbox) => {
                  if (this._dictionary.addTerm(VocabularyCategory.CHARACTER_NAMES, checkbox.value)) {
                    addedCount++;
                  }
                }
              );

              // Add selected items
              el.querySelectorAll('input[name="item"]:checked:not(:disabled)').forEach(
                (checkbox) => {
                  if (this._dictionary.addTerm(VocabularyCategory.ITEMS, checkbox.value)) {
                    addedCount++;
                  }
                }
              );

              if (addedCount > 0) {
                ui.notifications.info(
                  game.i18n?.format('VOXCHRONICLE.Vocabulary.SuggestAddedCount', {
                    count: addedCount
                  }) || `Added ${addedCount} term${addedCount !== 1 ? 's' : ''}`
                );
                this.render();
              } else {
                ui.notifications.warn(
                  game.i18n?.localize('VOXCHRONICLE.Vocabulary.NoTermsSelected') ||
                    'No terms selected'
                );
              }
            }
          },
          cancel: {
            icon: '<i class="fa-solid fa-times"></i>',
            label: game.i18n?.localize('VOXCHRONICLE.Button.Cancel') || 'Cancel'
          }
        },
        default: 'add',
        render: (html) => {
          const el = html[0] ?? html;

          // Handle "select all" checkboxes
          el.querySelector('input[name="select-all-characters"]')?.addEventListener(
            'change',
            function () {
              el.querySelectorAll('input[name="character"]:not(:disabled)').forEach((cb) => {
                cb.checked = this.checked;
              });
            }
          );

          el.querySelector('input[name="select-all-items"]')?.addEventListener(
            'change',
            function () {
              el.querySelectorAll('input[name="item"]:not(:disabled)').forEach((cb) => {
                cb.checked = this.checked;
              });
            }
          );
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
