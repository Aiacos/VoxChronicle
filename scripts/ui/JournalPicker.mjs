/**
 * JournalPicker - Journal Selection Dialog for VoxChronicle
 *
 * ApplicationV2 dialog that allows the DM to select a primary adventure journal
 * and optional supplementary journals for AI context during live mode.
 *
 * @class JournalPicker
 * @augments HandlebarsApplicationMixin(ApplicationV2)
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * JournalPicker dialog for selecting primary and supplementary journals
 */
class JournalPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {AbortController|null} */
  #listenerController = null;

  /** @type {Function|null} */
  #onSave = null;

  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-journal-picker',
    classes: ['vox-chronicle', 'journal-picker'],
    window: { title: 'VOXCHRONICLE.JournalPicker.Title', resizable: true },
    position: { width: 500, height: 600 },
    actions: {
      'select-all': JournalPicker._onSelectAll,
      'deselect-all': JournalPicker._onDeselectAll,
      'toggle-folder': JournalPicker._onToggleFolder,
      'save-selection': JournalPicker._onSaveSelection,
      cancel: JournalPicker._onCancel
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/journal-picker.hbs` }
  };

  /**
   * Create a new JournalPicker instance
   * @param {object} [options] - Application options
   * @param {Function} [options.onSave] - Callback when selection is saved
   */
  constructor(options = {}) {
    const { onSave, ...appOptions } = options;
    super(appOptions);
    this.#onSave = onSave || null;
    this._logger = Logger.createChild('JournalPicker');
  }

  /**
   * Prepare context data for the template
   * @param {object} options - Render options
   * @returns {Promise<object>} Template data
   */
  async _prepareContext(options) {
    const journals = game?.journal?.contents || [];
    const primaryId = game.settings.get(MODULE_ID, 'activeAdventureJournalId') || '';
    const supplementaryIds = game.settings.get(MODULE_ID, 'supplementaryJournalIds') || [];
    const allSelectedIds = new Set(supplementaryIds);
    if (primaryId) allSelectedIds.add(primaryId);

    // Build folder map
    const folderMap = new Map();
    const journalFolders = game?.folders?.filter((f) => f.type === 'JournalEntry') || [];
    for (const folder of journalFolders) {
      folderMap.set(folder.id, {
        id: folder.id,
        name: folder.name,
        parentId: folder.folder?.id || null,
        expanded: true,
        hasChildren: false,
        journals: [],
        folders: [],
        journalCount: 0,
        type: 'folder',
        selected: false
      });
    }

    // Populate journals into folders or root
    const rootJournals = [];
    for (const journal of journals) {
      const journalData = {
        id: journal.id,
        name: journal.name,
        selected: allSelectedIds.has(journal.id),
        isPrimary: journal.id === primaryId,
        type: 'journal'
      };

      const folderId = journal.folder?.id;
      if (folderId && folderMap.has(folderId)) {
        folderMap.get(folderId).journals.push(journalData);
        folderMap.get(folderId).journalCount++;
        folderMap.get(folderId).hasChildren = true;
      } else {
        rootJournals.push(journalData);
      }
    }

    // Build folder tree (top-level folders only for now)
    const folderTree = [];
    for (const [, folder] of folderMap) {
      if (!folder.parentId) {
        folderTree.push(folder);
      } else if (folderMap.has(folder.parentId)) {
        const parent = folderMap.get(folder.parentId);
        parent.folders.push(folder);
        parent.hasChildren = true;
        parent.journalCount += folder.journalCount;
      }
    }

    const selectedCount = allSelectedIds.size;
    const totalCount = journals.length;

    return {
      moduleId: MODULE_ID,
      hasJournals: journals.length > 0,
      hasFolders: folderTree.length > 0,
      folderTree,
      rootJournals,
      selectedCount,
      totalCount,
      i18n: {
        selectAll: game.i18n.localize('VOXCHRONICLE.JournalPicker.SelectAll'),
        deselectAll: game.i18n.localize('VOXCHRONICLE.JournalPicker.DeselectAll'),
        selectedCount: game.i18n.localize('VOXCHRONICLE.JournalPicker.SelectedCount'),
        folders: game.i18n.localize('VOXCHRONICLE.JournalPicker.Folders'),
        journals: game.i18n.localize('VOXCHRONICLE.JournalPicker.Journals'),
        noJournalsAvailable: game.i18n.localize('VOXCHRONICLE.JournalPicker.NoJournalsAvailable'),
        collapseFolder: game.i18n.localize('VOXCHRONICLE.JournalPicker.CollapseFolder'),
        expandFolder: game.i18n.localize('VOXCHRONICLE.JournalPicker.ExpandFolder'),
        save: game.i18n.localize('VOXCHRONICLE.JournalPicker.Save'),
        cancel: game.i18n.localize('VOXCHRONICLE.JournalPicker.Cancel'),
        primary: game.i18n.localize('VOXCHRONICLE.JournalPicker.Primary')
      }
    };
  }

  /**
   * Bind non-click event listeners after render
   * @param {object} context - The prepared context
   * @param {object} options - Render options
   */
  _onRender(context, options) {
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    // When a journal checkbox is toggled, show/hide radio and auto-set primary if needed
    this.element?.querySelectorAll('.vox-chronicle-journal-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', () => this._onCheckboxChange(), { signal });
    });

    // When a folder checkbox is toggled, cascade to all child journals
    this.element?.querySelectorAll('.vox-chronicle-folder-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => this._onFolderCheckboxChange(e), { signal });
    });

    // Radio changes
    this.element?.querySelectorAll('.vox-chronicle-primary-radio').forEach((radio) => {
      radio.addEventListener('change', () => this._onRadioChange(), { signal });
    });
  }

  /**
   * Handle folder checkbox change - cascade to all child journal checkboxes
   * @param event
   * @private
   */
  _onFolderCheckboxChange(event) {
    const folderCheckbox = event.target;
    const folderItem = folderCheckbox.closest('.vox-chronicle-folder-item');
    if (!folderItem) return;

    const checked = folderCheckbox.checked;
    // Select/deselect all journal checkboxes within this folder (including nested subfolders)
    folderItem.querySelectorAll('.vox-chronicle-journal-checkbox').forEach((cb) => {
      cb.checked = checked;
    });
    // Also cascade to any nested folder checkboxes
    folderItem.querySelectorAll('.vox-chronicle-folder-checkbox').forEach((cb) => {
      if (cb !== folderCheckbox) cb.checked = checked;
    });

    this._onCheckboxChange();
  }

  /**
   * Handle checkbox change - manage radio visibility and auto-primary
   * @private
   */
  _onCheckboxChange() {
    if (!this.element) return;
    const checkboxes = this.element.querySelectorAll('.vox-chronicle-journal-checkbox:checked');
    const radios = this.element.querySelectorAll('.vox-chronicle-primary-radio');

    // Show/hide radios based on checkbox state
    radios.forEach((radio) => {
      const journalId = radio.dataset.id;
      const checkbox = this.element.querySelector(
        `.vox-chronicle-journal-checkbox[data-id="${journalId}"]`
      );
      const label = radio
        .closest('.vox-chronicle-journal-label')
        ?.querySelector('.vox-chronicle-primary-label');
      if (checkbox?.checked) {
        radio.disabled = false;
        if (label) label.style.display = '';
      } else {
        radio.checked = false;
        radio.disabled = true;
        if (label) label.style.display = 'none';
      }
    });

    // Auto-set primary if exactly one journal is selected and no primary is set
    if (checkboxes.length === 1) {
      const id = checkboxes[0].dataset.id;
      const radio = this.element.querySelector(`.vox-chronicle-primary-radio[data-id="${id}"]`);
      if (radio) radio.checked = true;
    }
  }

  /**
   * Handle radio change
   * @private
   */
  _onRadioChange() {
    // Radio buttons handle mutual exclusion natively via name attribute
  }

  /**
   * Save the journal selection to settings
   * @param {string} primaryId - The primary journal ID
   * @param {string[]} supplementaryIds - Array of supplementary journal IDs
   */
  async _saveSelection(primaryId, supplementaryIds) {
    await game.settings.set(MODULE_ID, 'activeAdventureJournalId', primaryId || '');
    await game.settings.set(MODULE_ID, 'supplementaryJournalIds', supplementaryIds);

    this._logger.info(
      `Saved journal selection: primary=${primaryId}, supplementary=[${supplementaryIds.join(', ')}]`
    );

    if (this.#onSave) {
      this.#onSave();
    }

    await this.close();
  }

  /**
   * Handle cancel action
   */
  async _handleCancel() {
    await this.close();
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

  // ─── Static action handlers ─────────────────────────────────────────

  static _onSelectAll(event, target) {
    this.element?.querySelectorAll('.vox-chronicle-journal-checkbox').forEach((cb) => {
      cb.checked = true;
    });
    this._onCheckboxChange();
  }

  static _onDeselectAll(event, target) {
    this.element?.querySelectorAll('.vox-chronicle-journal-checkbox').forEach((cb) => {
      cb.checked = false;
    });
    this.element?.querySelectorAll('.vox-chronicle-primary-radio').forEach((radio) => {
      radio.checked = false;
    });
    this._onCheckboxChange();
  }

  static _onToggleFolder(event, target) {
    const folderId = target.dataset.folderId;
    const folderItem = target.closest('.vox-chronicle-folder-item');
    if (!folderItem) return;

    folderItem.classList.toggle('vox-chronicle-expanded');
    const children = folderItem.querySelector('.vox-chronicle-folder-children');
    if (children) children.classList.toggle('vox-chronicle-hidden');

    const icon = target.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-chevron-down');
      icon.classList.toggle('fa-chevron-right');
    }
  }

  static async _onSaveSelection(event, target) {
    const checkedBoxes =
      this.element?.querySelectorAll('.vox-chronicle-journal-checkbox:checked') || [];
    const primaryRadio = this.element?.querySelector('.vox-chronicle-primary-radio:checked');
    const primaryId = primaryRadio?.dataset?.id || '';

    const supplementaryIds = [];
    checkedBoxes.forEach((cb) => {
      const id = cb.dataset.id;
      if (id && id !== primaryId) {
        supplementaryIds.push(id);
      }
    });

    await this._saveSelection(primaryId, supplementaryIds);
  }

  static async _onCancel(event, target) {
    await this._handleCancel();
  }
}

export { JournalPicker };
