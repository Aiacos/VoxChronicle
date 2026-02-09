/**
 * SpeakerLabeling - UI Component for Mapping Speaker IDs to Player Names
 *
 * A Foundry VTT FormApplication that allows the GM to assign meaningful names
 * to the speaker IDs detected during transcription diarization (e.g., SPEAKER_00, SPEAKER_01).
 * These labels are used in the session chronicle to attribute dialogue to the correct
 * player or character.
 *
 * @class SpeakerLabeling
 * @augments FormApplication
 * @module vox-chronicle
 */

import { MODULE_ID } from '../main.mjs';
import { Logger } from '../utils/Logger.mjs';
import { Settings } from '../core/Settings.mjs';
import { escapeHtml } from '../utils/HtmlUtils.mjs';

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
 * SpeakerLabeling FormApplication class
 * Provides a form UI for mapping speaker IDs to player/character names
 */
class SpeakerLabeling extends FormApplication {
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
   * Get default options for the FormApplication
   * @returns {object} Default application options
   * @static
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-speaker-labeling',
      title: game.i18n?.localize('VOXCHRONICLE.SpeakerLabeling.Title') || 'Speaker Labeling',
      template: `modules/${MODULE_ID}/templates/speaker-labeling.hbs`,
      classes: ['vox-chronicle', 'speaker-labeling-form'],
      width: 450,
      height: 'auto',
      closeOnSubmit: true,
      submitOnClose: false,
      submitOnChange: false,
      resizable: true
    });
  }

  /**
   * Create a new SpeakerLabeling instance
   * @param {object} [object] - Form data object
   * @param {object} [options] - Application options
   */
  constructor(object = {}, options = {}) {
    super(object, options);
    this._loadCurrentLabels();
    this._logger.debug('SpeakerLabeling initialized');
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
   * Get data for the template
   * @param {object} _options - Render options
   * @returns {object} Template data
   */
  async getData(_options = {}) {
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
          '<strong>Known speakers:</strong> Speakers with a <i class="fas fa-check-circle"></i> icon were detected in a previous transcription session.',
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
   * Activate event listeners for the rendered HTML
   * @param {jQuery} html - The rendered HTML element
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Reset button
    html.find('[data-action="reset-labels"]').on('click', this._onResetLabels.bind(this));

    // Auto-detect button
    html.find('[data-action="auto-detect"]').on('click', this._onAutoDetect.bind(this));

    // Quick-assign user dropdown changes
    html.find('select[data-action="quick-assign"]').on('change', this._onQuickAssign.bind(this));

    // Clear individual label button
    html.find('[data-action="clear-label"]').on('click', this._onClearLabel.bind(this));

    this._logger.debug('Event listeners activated');
  }

  /**
   * Handle form submission
   * @param {Event} event - The form submission event
   * @param {object} formData - The form data object
   * @returns {Promise<void>}
   * @protected
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
      this.render(false);

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

    // Get the input fields
    const form = this.element.find('form');
    const speakerInputs = form.find('input[name^="speaker-"]');

    // Assign users to speakers in order
    let userIndex = 0;
    speakerInputs.each((index, input) => {
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

    // Find the corresponding input and set its value
    const input = this.element.find(`input[name="speaker-${speakerId}"]`);
    if (input.length) {
      input.val(selectedValue);
    }

    // Reset the dropdown
    select.value = '';

    this._logger.debug(`Quick-assigned "${selectedValue}" to ${speakerId}`);
  }

  /**
   * Handle clear label button click
   * @param {Event} event - The click event
   * @private
   */
  _onClearLabel(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const speakerId = button.dataset.speakerId;

    if (!speakerId) return;

    // Find and clear the corresponding input
    const input = this.element.find(`input[name="speaker-${speakerId}"]`);
    if (input.length) {
      input.val('');
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
   * Render fallback content when template is not available
   * This generates inline HTML for the speaker labeling form
   * @returns {string} Inline HTML content
   * @private
   */
  async _renderFallbackContent() {
    const data = await this.getData();
    const speakerRows = data.speakers
      .map(
        (speaker) => `
      <div class="speaker-row ${speaker.isKnown ? 'known' : ''}">
        <div class="speaker-id">
          <span class="speaker-id-text">${escapeHtml(speaker.id)}</span>
          ${speaker.isKnown ? `<i class="fas fa-check-circle known-indicator" title="${escapeHtml(data.i18n.detectedInSession)}"></i>` : ''}
        </div>
        <div class="speaker-label">
          <input type="text" name="speaker-${escapeHtml(speaker.id)}" value="${escapeHtml(speaker.label)}" placeholder="${escapeHtml(speaker.placeholder)}" />
          <button type="button" class="btn-clear" data-action="clear-label" data-speaker-id="${escapeHtml(speaker.id)}" title="${escapeHtml(data.i18n.clear)}">
            <i class="fas fa-times"></i>
          </button>
        </div>
        ${
          data.hasGameUsers
            ? `
          <div class="quick-assign">
            <select data-action="quick-assign" data-speaker-id="${escapeHtml(speaker.id)}">
              <option value="">${escapeHtml(data.i18n.quickAssignPlaceholder)}</option>
              ${data.gameUsers.map((u) => `<option value="${escapeHtml(u.isGM ? `GM (${u.name})` : u.name)}">${u.isGM ? '👑 ' : ''}${escapeHtml(u.name)}</option>`).join('')}
            </select>
          </div>
        `
            : ''
        }
      </div>
    `
      )
      .join('');

    return `
      <form class="vox-chronicle-speaker-labeling">
        <div class="form-description">
          <p>${data.i18n.description}</p>
        </div>

        <div class="speaker-labels-header">
          <div class="header-speaker-id">${data.i18n.speakerId}</div>
          <div class="header-player-name">${data.i18n.playerName}</div>
          ${data.hasGameUsers ? `<div class="header-quick-assign">${escapeHtml(data.i18n.quickAssign)}</div>` : ''}
        </div>

        <div class="speaker-labels-list">
          ${speakerRows}
        </div>

        <div class="form-actions">
          <button type="button" class="btn-auto-detect" data-action="auto-detect">
            <i class="fas fa-magic"></i> ${data.i18n.autoDetect}
          </button>
          <button type="button" class="btn-reset" data-action="reset-labels">
            <i class="fas fa-undo"></i> ${data.i18n.reset}
          </button>
          <button type="submit" class="btn-save">
            <i class="fas fa-save"></i> ${data.i18n.save}
          </button>
        </div>
      </form>
    `;
  }

  /**
   * Override _renderInner to provide fallback content if template is missing
   * @param {object} data - Template data
   * @returns {Promise<jQuery>} Rendered inner content
   * @protected
   */
  async _renderInner(data) {
    try {
      return await super._renderInner(data);
    } catch {
      // Template not found, use inline fallback
      this._logger.warn('Template not found, using fallback HTML');
      const html = this._renderFallbackContent();
      return $(html);
    }
  }
}

// Export the class
export { SpeakerLabeling, DEFAULT_SPEAKER_IDS };
