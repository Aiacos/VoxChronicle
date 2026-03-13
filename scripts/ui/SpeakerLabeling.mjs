/**
 * SpeakerLabeling - UI Component for Mapping Speaker IDs to Player Names
 *
 * A Foundry VTT Application that allows the GM to assign meaningful names
 * to the speaker IDs detected during transcription diarization (e.g., SPEAKER_00, SPEAKER_01).
 * These labels are used in the session chronicle to attribute dialogue to the correct
 * player or character.
 *
 * @class SpeakerLabeling
 * @augments ApplicationV2
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { Settings } from '../core/Settings.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Default speaker ID patterns used by OpenAI diarization
 * @constant {string[]}
 */
const DEFAULT_SPEAKER_IDS = [
  'SPEAKER_00',
  'SPEAKER_01',
  'SPEAKER_02',
  'SPEAKER_03',
  'SPEAKER_04',
  'SPEAKER_05',
  'SPEAKER_06',
  'SPEAKER_07'
];

/**
 * SpeakerLabeling Application class
 * Provides a form UI for mapping speaker IDs to player/character names
 */
class SpeakerLabeling extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('SpeakerLabeling');

  /**
   * Current speaker labels being edited
   * @type {object}
   * @private
   */
  _labels = {};

  /**
   * Known speaker IDs from previous sessions
   * @type {string[]}
   * @private
   */
  _knownSpeakers = [];

  /**
   * AbortController for non-action event listeners
   * @type {AbortController|null}
   * @private
   */
  #listenerController = null;

  /**
   * Callback invoked when the dialog closes
   * @type {Function|null}
   * @private
   */
  #onClose = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-speaker-labeling',
    classes: ['vox-chronicle', 'speaker-labeling-form'],
    window: {
      title: 'VOXCHRONICLE.SpeakerLabeling.Title',
      resizable: true,
      minimizable: true
    },
    position: { width: 450 },
    actions: {
      'reset-labels': SpeakerLabeling._onResetLabelsAction,
      'auto-detect': SpeakerLabeling._onAutoDetectAction,
      'clear-label': SpeakerLabeling._onClearLabelAction
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/speaker-labeling.hbs` }
  };

  /**
   * Create a new SpeakerLabeling instance
   * @param {object} [options] - Application options
   */
  constructor(options = {}) {
    const { onClose, ...appOptions } = options;
    super(appOptions);
    this.#onClose = typeof onClose === 'function' ? onClose : null;
    this._loadCurrentLabels();
    this._logger.debug('SpeakerLabeling initialized');
  }

  // --- Static Action Handlers ---

  /** @private */
  static async _onResetLabelsAction(event, target) {
    return this._onResetLabels(event);
  }

  /** @private */
  static _onAutoDetectAction(event, target) {
    this._onAutoDetect(event);
  }

  /** @private */
  static _onClearLabelAction(event, target) {
    this._onClearLabel(event, target);
  }

  // --- Lifecycle ---

  /**
   * Bind non-click event listeners after render
   * @param {object} context - Template context
   * @param {object} options - Render options
   */
  _onRender(context, options) {
    this._logger.debug('_onRender called', { knownSpeakers: this._knownSpeakers.length, labelCount: Object.keys(this._labels).length });
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    // Form submission
    const form = this.element?.querySelector('form');
    if (form) {
      form.addEventListener('submit', this._onFormSubmit.bind(this), { signal });
    }

    // Quick-assign dropdown change events
    this.element?.querySelectorAll('select[data-action="quick-assign"]').forEach((el) => {
      el.addEventListener('change', this._onQuickAssign.bind(this), { signal });
    });
  }

  /**
   * Handle form submission
   * @param {Event} event - The submit event
   * @private
   */
  async _onFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const speakerCount = Object.keys(data).filter(k => k.startsWith('speaker-') && data[k]?.trim()).length;
    this._logger.debug(`Form submitted with ${speakerCount} speaker label(s)`);
    await this._updateObject(event, data);
    this.close();
  }

  /**
   * Clean up event listeners on close
   * @param {object} [options] - Close options
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    this._logger.debug('SpeakerLabeling closing');
    this.#listenerController?.abort();
    try {
      return await super.close(options);
    } finally {
      if (this.#onClose) {
        try {
          this.#onClose();
        } catch (e) {
          this._logger.warn('onClose callback failed:', e);
        }
      }
    }
  }

  /**
   * Load current speaker labels from settings
   * @private
   */
  _loadCurrentLabels() {
    try {
      this._labels = Settings.getSpeakerLabels() || {};
      this._knownSpeakers = Settings.get('knownSpeakers') || [];
    } catch (error) {
      this._logger.warn('Failed to load speaker labels:', error);
      this._labels = {};
      this._knownSpeakers = [];
    }
  }

  /**
   * Get the list of all speaker IDs to display
   * Combines known speakers with default IDs
   * @returns {string[]} Array of speaker IDs
   * @private
   */
  _getAllSpeakerIds() {
    const speakerSet = new Set([...this._knownSpeakers, ...DEFAULT_SPEAKER_IDS]);

    // Also include any speakers that have labels but aren't in the lists
    Object.keys(this._labels).forEach((id) => speakerSet.add(id));

    return Array.from(speakerSet).sort((a, b) => {
      // Sort by number if they follow SPEAKER_XX pattern
      const numA = this._extractSpeakerNumber(a);
      const numB = this._extractSpeakerNumber(b);
      if (numA !== null && numB !== null) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }

  /**
   * Extract the numeric part from a speaker ID
   * @param {string} speakerId - Speaker ID like 'SPEAKER_00'
   * @returns {number|null} The extracted number or null
   * @private
   */
  _extractSpeakerNumber(speakerId) {
    const match = speakerId.match(/SPEAKER_(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Prepare template context data
   * @param {object} _options - Render options
   * @returns {Promise<object>} Template data
   * @override
   */
  async _prepareContext(_options = {}) {
    const speakerIds = this._getAllSpeakerIds();

    // Build speaker entries for the form
    const speakers = speakerIds.map((id) => ({
      id,
      label: this._labels[id] || '',
      isKnown: this._knownSpeakers.includes(id),
      placeholder:
        game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Placeholder') || 'Enter name...'
    }));

    // Get list of game users for auto-detect suggestions
    const gameUsers = this._getGameUsers();

    return {
      moduleId: MODULE_ID,
      speakers,
      hasKnownSpeakers: this._knownSpeakers.length > 0,
      noSpeakersMessage:
        game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.NoSpeakersDetected') ||
        'No speakers detected yet. Record a session first.',
      gameUsers,
      hasGameUsers: gameUsers.length > 0,
      // Localization strings
      i18n: {
        title: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Title') || 'Speaker Labeling',
        description:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Description') ||
          'Assign names to the speakers detected in the transcription.',
        speakerId: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.SpeakerId') || 'Speaker ID',
        playerName:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.PlayerName') || 'Player/Character Name',
        quickAssign:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.QuickAssign') || 'Quick Assign',
        quickAssignPlaceholder:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.QuickAssignPlaceholder') ||
          'Quick assign...',
        gameMaster: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.GameMaster') || 'Game Master',
        player: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Player') || 'Player',
        clear: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Clear') || 'Clear',
        detectedInSession:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.DetectedInSession') ||
          'Detected in session',
        save: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Save') || 'Save Labels',
        reset: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Reset') || 'Reset Labels',
        autoDetect:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.AutoDetect') ||
          'Auto-Detect from Users',
        saved: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Saved') || 'Speaker labels saved',
        help: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Help') || 'Help',
        helpSpeakerIds:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.HelpSpeakerIds') ||
          '<strong>Speaker IDs:</strong> These are automatically assigned by the transcription service (SPEAKER_00, SPEAKER_01, etc.).',
        helpKnownSpeakers:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.HelpKnownSpeakers') ||
          '<strong>Known speakers:</strong> Speakers with a <i class="fa-solid fa-check-circle"></i> icon were detected in a previous transcription session.',
        helpQuickAssign:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.HelpQuickAssign') ||
          "<strong>Quick Assign:</strong> Use the dropdown to quickly assign a game user's name to a speaker slot.",
        helpAutoDetect:
          game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.HelpAutoDetect') ||
          '<strong>Auto-Detect:</strong> Automatically fills empty speaker slots with game user names in order.'
      }
    };
  }

  /**
   * Get list of game users for auto-detect functionality
   * @returns {Array} Array of user objects with id and name
   * @private
   */
  _getGameUsers() {
    if (!game.users) return [];

    return game.users
      .map((user) => ({
        id: user.id,
        name: user.name,
        isGM: user.isGM
      }))
      .sort((a, b) => {
        // GMs first, then alphabetically
        if (a.isGM !== b.isGM) return a.isGM ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Handle form data submission (save speaker labels)
   * @param {Event} event - The form submission event
   * @param {object} formData - The form data object
   * @returns {Promise<void>}
   */
  async _updateObject(event, formData) {
    this._logger.log('Saving speaker labels...');

    try {
      // Build the labels object from form data
      const newLabels = {};

      for (const [key, value] of Object.entries(formData)) {
        if (key.startsWith('speaker-') && value && value.trim()) {
          const speakerId = key.replace('speaker-', '');
          newLabels[speakerId] = value.trim();
        }
      }

      // Save to settings
      await Settings.setSpeakerLabels(newLabels);
      this._labels = newLabels;

      // Notify user
      ui.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Saved') || 'Speaker labels saved'
      );

      this._logger.log(`Saved ${Object.keys(newLabels).length} speaker labels`);
    } catch (error) {
      this._logger.error('Failed to save speaker labels:', error);
      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.SaveFailed') ||
          'Failed to save speaker labels'
      );
    }
  }

  /**
   * Handle reset labels button click
   * @param {Event} event - The click event
   * @private
   */
  async _onResetLabels(event) {
    event.preventDefault();

    // Confirm reset
    const confirmed = await Dialog.confirm({
      title: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Reset') || 'Reset Labels',
      content: `<p>${game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.ResetConfirm') || 'Are you sure you want to reset all speaker labels?'}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      this._labels = {};
      await Settings.setSpeakerLabels({});
      this.render();

      ui.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.LabelsReset') || 'Speaker labels reset'
      );
      this._logger.log('Speaker labels reset');
    }
  }

  /**
   * Handle auto-detect button click
   * Maps speakers to game users automatically
   * @param {Event} event - The click event
   * @private
   */
  _onAutoDetect(event) {
    event.preventDefault();

    const gameUsers = this._getGameUsers();
    if (gameUsers.length === 0) {
      ui.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.NoGameUsers') ||
          'No game users available for auto-detection'
      );
      return;
    }

    // Get the input fields using native DOM
    const form = this.element?.querySelector('form');
    if (!form) return;

    const speakerInputs = form.querySelectorAll('input[name^="speaker-"]');

    // Assign users to speakers in order
    let userIndex = 0;
    speakerInputs.forEach((input) => {
      if (!input.value && userIndex < gameUsers.length) {
        const user = gameUsers[userIndex];
        input.value = user.isGM ? `GM (${user.name})` : user.name;
        userIndex++;
      }
    });

    this._logger.log(`Auto-detected ${userIndex} speakers from game users`);
  }

  /**
   * Handle quick-assign dropdown change
   * @param {Event} event - The change event
   * @private
   */
  _onQuickAssign(event) {
    const select = event.currentTarget;
    const speakerId = select.dataset.speakerId;
    const selectedValue = select.value;

    if (!selectedValue || !speakerId) return;

    // Find the corresponding input and set its value using native DOM
    const input = this.element?.querySelector(`input[name="speaker-${speakerId}"]`);
    if (input) {
      input.value = selectedValue;
    }

    // Reset the dropdown
    select.value = '';

    this._logger.debug(`Quick-assigned "${selectedValue}" to ${speakerId}`);
  }

  /**
   * Handle clear label button click
   * @param {Event} event - The click event
   * @param {HTMLElement} [target] - The action target element
   * @private
   */
  _onClearLabel(event, target) {
    event.preventDefault();

    const button = target || event.currentTarget;
    const speakerId = button.dataset.speakerId;

    if (!speakerId) return;

    // Find and clear the corresponding input using native DOM
    const input = this.element?.querySelector(`input[name="speaker-${speakerId}"]`);
    if (input) {
      input.value = '';
    }

    this._logger.debug(`Cleared label for ${speakerId}`);
  }

  /**
   * Add a new known speaker ID
   * This is called when transcription detects new speakers
   * @param {string} speakerId - The speaker ID to add
   * @static
   */
  static async addKnownSpeaker(speakerId) {
    if (!speakerId) return;

    try {
      const knownSpeakers = Settings.get('knownSpeakers') || [];
      if (!knownSpeakers.includes(speakerId)) {
        knownSpeakers.push(speakerId);
        await Settings.set('knownSpeakers', knownSpeakers);
        Logger.createChild('SpeakerLabeling').debug(`Added known speaker: ${speakerId}`);
      }
    } catch (error) {
      Logger.createChild('SpeakerLabeling').warn('Failed to add known speaker:', error);
    }
  }

  /**
   * Add multiple known speaker IDs at once
   * @param {string[]} speakerIds - Array of speaker IDs to add
   * @static
   */
  static async addKnownSpeakers(speakerIds) {
    if (!speakerIds || !Array.isArray(speakerIds)) return;

    try {
      const knownSpeakers = Settings.get('knownSpeakers') || [];
      const newSpeakers = speakerIds.filter((id) => id && !knownSpeakers.includes(id));

      if (newSpeakers.length > 0) {
        knownSpeakers.push(...newSpeakers);
        await Settings.set('knownSpeakers', knownSpeakers);
        Logger.createChild('SpeakerLabeling').debug(`Added ${newSpeakers.length} known speakers`);
      }
    } catch (error) {
      Logger.createChild('SpeakerLabeling').warn('Failed to add known speakers:', error);
    }
  }

  /**
   * Get a speaker's label by ID
   * @param {string} speakerId - The speaker ID
   * @returns {string} The speaker's label or the original ID if no label is set
   * @static
   */
  static getSpeakerLabel(speakerId) {
    const labels = Settings.getSpeakerLabels();
    return labels[speakerId] || speakerId;
  }

  /**
   * Map all speaker IDs in an array of segments to their labels
   * @param {Array} segments - Array of transcript segments with speaker property
   * @returns {Array} Segments with speaker labels mapped
   * @static
   */
  static mapSpeakerLabels(segments) {
    if (!segments || !Array.isArray(segments)) return segments;

    const labels = Settings.getSpeakerLabels();

    return segments.map((segment) => ({
      ...segment,
      speaker: labels[segment.speaker] || segment.speaker || 'Unknown Speaker'
    }));
  }

  /**
   * Rename a speaker retroactively in stored labels.
   *
   * @param {string} oldName - The current speaker name to rename
   * @param {string} newName - The new name to assign
   * @returns {Promise<number>} The number of labels that were updated
   * @static
   */
  static async renameSpeaker(oldName, newName) {
    if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
      return 0;
    }

    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();

    if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) {
      return 0;
    }

    const logger = Logger.createChild('SpeakerLabeling');

    try {
      const labels = Settings.getSpeakerLabels() || {};
      const updatedLabels = {};
      let renameCount = 0;

      for (const [speakerId, label] of Object.entries(labels)) {
        if (speakerId === trimmedOld) {
          // Key matches oldName — rename the key to newName and keep the value
          updatedLabels[trimmedNew] = label === trimmedOld ? trimmedNew : label;
          renameCount++;
        } else if (label === trimmedOld) {
          // Value matches oldName — update the value to newName
          updatedLabels[speakerId] = trimmedNew;
          renameCount++;
        } else {
          // No match — keep as-is
          updatedLabels[speakerId] = label;
        }
      }

      if (renameCount > 0) {
        await Settings.setSpeakerLabels(updatedLabels);
        logger.log(`Renamed speaker "${trimmedOld}" to "${trimmedNew}" (${renameCount} label(s) updated)`);
      }

      return renameCount;
    } catch (error) {
      logger.error('Failed to rename speaker:', error);
      ui?.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.RenameFailed') ||
        'Failed to rename speaker. Please try again.'
      );
      return 0;
    }
  }

  /**
   * Apply stored speaker labels to an array of transcript segments.
   *
   * @param {Array<object>} segments - Array of transcript segments with speaker property
   * @returns {Array<object>} New array with labels applied (originals not mutated)
   * @static
   */
  static applyLabelsToSegments(segments) {
    if (!Array.isArray(segments)) {
      return [];
    }

    const labels = Settings.getSpeakerLabels() || {};

    return segments.map((segment) => {
      const updatedSegment = { ...segment };

      if (segment.speaker && labels[segment.speaker]) {
        updatedSegment.speaker = labels[segment.speaker];
      }

      return updatedSegment;
    });
  }

}

// Export the class
export { SpeakerLabeling, DEFAULT_SPEAKER_IDS };
