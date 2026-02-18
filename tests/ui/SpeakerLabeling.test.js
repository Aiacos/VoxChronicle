/**
 * SpeakerLabeling Unit Tests
 *
 * Tests for the SpeakerLabeling UI component (ApplicationV2 version).
 * Covers speaker ID mapping, form management, event handling,
 * auto-detection, quick assignment, and static utility methods.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMockApplicationV2, createMockHandlebarsApplicationMixin } from '../helpers/foundry-mock.js';

// Mock Logger before importing SpeakerLabeling
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

// Mock MODULE_ID
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Create shared mock Settings instance
const mockSettings = {
  getSpeakerLabels: vi.fn().mockReturnValue({}),
  setSpeakerLabels: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key) => {
    if (key === 'knownSpeakers') return [];
    return null;
  }),
  set: vi.fn().mockResolvedValue(undefined)
};

// Mock Settings module
vi.mock('../../scripts/core/Settings.mjs', () => ({
  Settings: mockSettings
}));

// Set up DOM and globals before any test runs
setupEnvironment();

function setupEnvironment() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  // Set up ApplicationV2 and HandlebarsApplicationMixin
  global.ApplicationV2 = createMockApplicationV2();
  global.HandlebarsApplicationMixin = createMockHandlebarsApplicationMixin();

  // Set up Dialog mock
  global.Dialog = {
    confirm: vi.fn().mockResolvedValue(true)
  };
}

// Import after environment is set up
const { SpeakerLabeling, DEFAULT_SPEAKER_IDS } =
  await import('../../scripts/ui/SpeakerLabeling.mjs');

/**
 * Create mock game object
 */
function createMockGame() {
  return {
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      register: vi.fn()
    },
    i18n: {
      localize: vi.fn((key) => {
        if (typeof key !== 'string') return key;
        return key;
      }),
      format: vi.fn((key, data) => {
        if (typeof key !== 'string') return key;
        let result = key;
        if (data) {
          Object.entries(data).forEach(([k, v]) => {
            result = result.replace(`{${k}}`, v);
          });
        }
        return result;
      })
    },
    users: {
      map: vi.fn((callback) =>
        [
          { id: 'user1', name: 'Alice', isGM: true },
          { id: 'user2', name: 'Bob', isGM: false },
          { id: 'user3', name: 'Charlie', isGM: false }
        ].map(callback)
      )
    }
  };
}

/**
 * Create mock ui.notifications
 */
function createMockNotifications() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    notify: vi.fn()
  };
}

/**
 * Create mock foundry.utils
 */
function createMockFoundryUtils() {
  return {
    mergeObject: vi.fn((original, other) => ({ ...original, ...other }))
  };
}

/**
 * Create a mock DOM element tree for SpeakerLabeling form
 * @param {Array} speakers - Array of {id, value} objects for speaker inputs
 * @returns {HTMLElement} Container element with form and inputs
 */
function createMockFormElement(speakers = []) {
  const container = document.createElement('div');
  const form = document.createElement('form');

  for (const speaker of speakers) {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = `speaker-${speaker.id}`;
    input.value = speaker.value || '';
    form.appendChild(input);
  }

  container.appendChild(form);
  return container;
}

describe('SpeakerLabeling', () => {
  let speakerLabeling;
  let mockGame;
  let mockUi;

  beforeEach(() => {
    // Reset mock call history
    mockSettings.getSpeakerLabels.mockClear();
    mockSettings.setSpeakerLabels.mockClear();
    mockSettings.get.mockClear();
    mockSettings.set.mockClear();

    // Reset mock return values to defaults
    mockSettings.getSpeakerLabels.mockReturnValue({});
    mockSettings.get.mockImplementation((key) => {
      if (key === 'knownSpeakers') return [];
      return null;
    });

    // Set up mock game and ui
    mockGame = createMockGame();
    mockUi = { notifications: createMockNotifications() };

    // Set up global objects
    global.game = mockGame;
    global.ui = mockUi;
    global.foundry = { utils: createMockFoundryUtils() };

    // Create instance
    speakerLabeling = new SpeakerLabeling();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty labels and known speakers', () => {
      expect(speakerLabeling._labels).toEqual({});
      expect(speakerLabeling._knownSpeakers).toEqual([]);
    });

    it('should load existing labels from settings', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });
      mockSettings.get.mockImplementation((key) => {
        if (key === 'knownSpeakers') return ['SPEAKER_00', 'SPEAKER_01'];
        return null;
      });

      const labeling = new SpeakerLabeling();

      expect(labeling._labels).toEqual({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });
      expect(labeling._knownSpeakers).toEqual(['SPEAKER_00', 'SPEAKER_01']);
    });

    it('should handle settings loading errors gracefully', () => {
      mockSettings.getSpeakerLabels.mockImplementation(() => {
        throw new Error('Settings error');
      });

      expect(() => new SpeakerLabeling()).not.toThrow();
      const labeling = new SpeakerLabeling();
      expect(labeling._labels).toEqual({});
      expect(labeling._knownSpeakers).toEqual([]);
    });
  });

  describe('_getAllSpeakerIds Method', () => {
    it('should return default speaker IDs when no known speakers', () => {
      const ids = speakerLabeling._getAllSpeakerIds();

      expect(ids).toEqual(DEFAULT_SPEAKER_IDS);
    });

    it('should combine known speakers with defaults', () => {
      speakerLabeling._knownSpeakers = ['SPEAKER_08', 'SPEAKER_09'];

      const ids = speakerLabeling._getAllSpeakerIds();

      expect(ids).toContain('SPEAKER_00');
      expect(ids).toContain('SPEAKER_08');
      expect(ids).toContain('SPEAKER_09');
    });

    it('should include speakers that have labels but are not in lists', () => {
      speakerLabeling._labels = {
        SPEAKER_10: 'Mystery Speaker'
      };

      const ids = speakerLabeling._getAllSpeakerIds();

      expect(ids).toContain('SPEAKER_10');
    });

    it('should sort speaker IDs numerically', () => {
      speakerLabeling._knownSpeakers = ['SPEAKER_10', 'SPEAKER_02', 'SPEAKER_01'];

      const ids = speakerLabeling._getAllSpeakerIds();

      const index01 = ids.indexOf('SPEAKER_01');
      const index02 = ids.indexOf('SPEAKER_02');
      const index10 = ids.indexOf('SPEAKER_10');

      expect(index01).toBeLessThan(index02);
      expect(index02).toBeLessThan(index10);
    });

    it('should not include duplicates', () => {
      speakerLabeling._knownSpeakers = ['SPEAKER_00', 'SPEAKER_01'];
      speakerLabeling._labels = { SPEAKER_00: 'Alice' };

      const ids = speakerLabeling._getAllSpeakerIds();

      expect(ids.filter((id) => id === 'SPEAKER_00').length).toBe(1);
    });
  });

  describe('_extractSpeakerNumber Method', () => {
    it('should extract number from SPEAKER_XX format', () => {
      expect(speakerLabeling._extractSpeakerNumber('SPEAKER_00')).toBe(0);
      expect(speakerLabeling._extractSpeakerNumber('SPEAKER_05')).toBe(5);
      expect(speakerLabeling._extractSpeakerNumber('SPEAKER_42')).toBe(42);
    });

    it('should return null for non-matching formats', () => {
      expect(speakerLabeling._extractSpeakerNumber('UNKNOWN')).toBeNull();
      expect(speakerLabeling._extractSpeakerNumber('Speaker_01')).toBeNull();
      expect(speakerLabeling._extractSpeakerNumber('SPEAKER01')).toBeNull();
    });
  });

  describe('_getGameUsers Method', () => {
    it('should return list of game users', () => {
      const users = speakerLabeling._getGameUsers();

      expect(users).toHaveLength(3);
      expect(users[0]).toEqual({ id: 'user1', name: 'Alice', isGM: true });
      expect(users[1]).toEqual({ id: 'user2', name: 'Bob', isGM: false });
      expect(users[2]).toEqual({ id: 'user3', name: 'Charlie', isGM: false });
    });

    it('should sort GMs first, then alphabetically', () => {
      const users = speakerLabeling._getGameUsers();

      expect(users[0].isGM).toBe(true);
      expect(users[1].name).toBe('Bob');
      expect(users[2].name).toBe('Charlie');
    });

    it('should handle missing game.users gracefully', () => {
      global.game.users = null;

      const users = speakerLabeling._getGameUsers();

      expect(users).toEqual([]);
    });
  });

  describe('_prepareContext Method', () => {
    it('should return complete template data', async () => {
      speakerLabeling._labels = { SPEAKER_00: 'Alice' };
      speakerLabeling._knownSpeakers = ['SPEAKER_00'];

      const data = await speakerLabeling._prepareContext();

      expect(data.moduleId).toBe('vox-chronicle');
      expect(data.speakers).toBeDefined();
      expect(data.speakers.length).toBeGreaterThan(0);
      expect(data.hasKnownSpeakers).toBe(true);
      expect(data.gameUsers).toBeDefined();
      expect(data.hasGameUsers).toBe(true);
      expect(data.i18n).toBeDefined();
    });

    it('should include speaker data with labels', async () => {
      speakerLabeling._labels = {
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      };

      const data = await speakerLabeling._prepareContext();
      const speaker00 = data.speakers.find((s) => s.id === 'SPEAKER_00');

      expect(speaker00).toBeDefined();
      expect(speaker00.label).toBe('Alice');
      expect(speaker00.placeholder).toBeDefined();
    });

    it('should mark known speakers correctly', async () => {
      speakerLabeling._knownSpeakers = ['SPEAKER_00'];

      const data = await speakerLabeling._prepareContext();
      const speaker00 = data.speakers.find((s) => s.id === 'SPEAKER_00');
      const speaker01 = data.speakers.find((s) => s.id === 'SPEAKER_01');

      expect(speaker00.isKnown).toBe(true);
      expect(speaker01.isKnown).toBe(false);
    });

    it('should include localization strings', async () => {
      const data = await speakerLabeling._prepareContext();

      expect(data.i18n.title).toBeDefined();
      expect(data.i18n.description).toBeDefined();
      expect(data.i18n.speakerId).toBeDefined();
      expect(data.i18n.playerName).toBeDefined();
      expect(data.i18n.save).toBeDefined();
      expect(data.i18n.reset).toBeDefined();
    });

    it('should include game users when available', async () => {
      const data = await speakerLabeling._prepareContext();

      expect(data.gameUsers).toHaveLength(3);
      expect(data.hasGameUsers).toBe(true);
    });

    it('should handle no game users', async () => {
      global.game.users = null;

      const data = await speakerLabeling._prepareContext();

      expect(data.gameUsers).toEqual([]);
      expect(data.hasGameUsers).toBe(false);
    });
  });

  describe('_updateObject Method (Form Submission)', () => {
    it('should save speaker labels from form data', async () => {
      const formData = {
        'speaker-SPEAKER_00': 'Alice',
        'speaker-SPEAKER_01': 'Bob',
        'speaker-SPEAKER_02': ''
      };

      await speakerLabeling._updateObject({}, formData);

      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });
      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should trim whitespace from labels', async () => {
      const formData = {
        'speaker-SPEAKER_00': '  Alice  ',
        'speaker-SPEAKER_01': 'Bob\t\n'
      };

      await speakerLabeling._updateObject({}, formData);

      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });
    });

    it('should ignore empty labels', async () => {
      const formData = {
        'speaker-SPEAKER_00': 'Alice',
        'speaker-SPEAKER_01': '',
        'speaker-SPEAKER_02': '   '
      };

      await speakerLabeling._updateObject({}, formData);

      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Alice'
      });
    });

    it('should ignore non-speaker form fields', async () => {
      const formData = {
        'speaker-SPEAKER_00': 'Alice',
        'other-field': 'value',
        submit: 'Save'
      };

      await speakerLabeling._updateObject({}, formData);

      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Alice'
      });
    });

    it('should handle save errors', async () => {
      mockSettings.setSpeakerLabels.mockRejectedValueOnce(new Error('Save failed'));

      const formData = {
        'speaker-SPEAKER_00': 'Alice'
      };

      await speakerLabeling._updateObject({}, formData);

      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('_onResetLabels Method', () => {
    it('should reset labels after confirmation', async () => {
      global.Dialog.confirm.mockResolvedValueOnce(true);
      speakerLabeling._labels = { SPEAKER_00: 'Alice' };
      speakerLabeling.render = vi.fn();

      const event = { preventDefault: vi.fn() };
      await speakerLabeling._onResetLabels(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({});
      expect(speakerLabeling._labels).toEqual({});
      expect(speakerLabeling.render).toHaveBeenCalled();
      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should not reset if user cancels', async () => {
      global.Dialog.confirm.mockResolvedValueOnce(false);
      speakerLabeling._labels = { SPEAKER_00: 'Alice' };
      speakerLabeling.render = vi.fn();

      const event = { preventDefault: vi.fn() };
      await speakerLabeling._onResetLabels(event);

      expect(mockSettings.setSpeakerLabels).not.toHaveBeenCalled();
      expect(speakerLabeling._labels).toEqual({ SPEAKER_00: 'Alice' });
      expect(speakerLabeling.render).not.toHaveBeenCalled();
    });
  });

  describe('_onAutoDetect Method', () => {
    it('should auto-fill empty speaker slots with game users', () => {
      // Create a real DOM element for the component
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: '' },
        { id: 'SPEAKER_01', value: '' },
        { id: 'SPEAKER_02', value: '' }
      ]);
      speakerLabeling._element = mockElement;

      const event = { preventDefault: vi.fn() };
      speakerLabeling._onAutoDetect(event);

      expect(event.preventDefault).toHaveBeenCalled();

      // Verify inputs were filled with game users
      const inputs = mockElement.querySelectorAll('input[name^="speaker-"]');
      expect(inputs[0].value).toBe('GM (Alice)');
      expect(inputs[1].value).toBe('Bob');
      expect(inputs[2].value).toBe('Charlie');
    });

    it('should warn if no game users available', () => {
      global.game.users = null;
      speakerLabeling._element = createMockFormElement([]);

      const event = { preventDefault: vi.fn() };
      speakerLabeling._onAutoDetect(event);

      expect(mockUi.notifications.warn).toHaveBeenCalled();
    });

    it('should skip fields that already have values', () => {
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: 'Existing' },
        { id: 'SPEAKER_01', value: '' },
        { id: 'SPEAKER_02', value: '' }
      ]);
      speakerLabeling._element = mockElement;

      const event = { preventDefault: vi.fn() };
      speakerLabeling._onAutoDetect(event);

      expect(event.preventDefault).toHaveBeenCalled();

      // First field should keep its existing value
      const inputs = mockElement.querySelectorAll('input[name^="speaker-"]');
      expect(inputs[0].value).toBe('Existing');
      // Second field should get first user
      expect(inputs[1].value).toBe('GM (Alice)');
      // Third field should get second user
      expect(inputs[2].value).toBe('Bob');
    });
  });

  describe('_onQuickAssign Method', () => {
    it('should assign selected user to speaker input', () => {
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: '' }
      ]);
      speakerLabeling._element = mockElement;

      const event = {
        currentTarget: {
          dataset: { speakerId: 'SPEAKER_00' },
          value: 'Alice'
        }
      };

      speakerLabeling._onQuickAssign(event);

      const input = mockElement.querySelector('input[name="speaker-SPEAKER_00"]');
      expect(input.value).toBe('Alice');
      expect(event.currentTarget.value).toBe('');
    });

    it('should reset dropdown after assignment', () => {
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: '' }
      ]);
      speakerLabeling._element = mockElement;

      const event = {
        currentTarget: {
          dataset: { speakerId: 'SPEAKER_00' },
          value: 'Bob'
        }
      };

      speakerLabeling._onQuickAssign(event);

      expect(event.currentTarget.value).toBe('');
    });

    it('should do nothing if no value selected', () => {
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: '' }
      ]);
      speakerLabeling._element = mockElement;

      const event = {
        currentTarget: {
          dataset: { speakerId: 'SPEAKER_00' },
          value: ''
        }
      };

      speakerLabeling._onQuickAssign(event);

      // Input should remain empty
      const input = mockElement.querySelector('input[name="speaker-SPEAKER_00"]');
      expect(input.value).toBe('');
    });

    it('should do nothing if no speaker ID', () => {
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: '' }
      ]);
      speakerLabeling._element = mockElement;

      const event = {
        currentTarget: {
          dataset: {},
          value: 'Alice'
        }
      };

      speakerLabeling._onQuickAssign(event);

      // Input should remain empty
      const input = mockElement.querySelector('input[name="speaker-SPEAKER_00"]');
      expect(input.value).toBe('');
    });
  });

  describe('_onClearLabel Method', () => {
    it('should clear the specified speaker label', () => {
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: 'Alice' }
      ]);
      speakerLabeling._element = mockElement;

      const event = { preventDefault: vi.fn() };
      const target = {
        dataset: { speakerId: 'SPEAKER_00' }
      };

      speakerLabeling._onClearLabel(event, target);

      expect(event.preventDefault).toHaveBeenCalled();
      const input = mockElement.querySelector('input[name="speaker-SPEAKER_00"]');
      expect(input.value).toBe('');
    });

    it('should fall back to event.currentTarget when no target parameter', () => {
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: 'Bob' }
      ]);
      speakerLabeling._element = mockElement;

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {
          dataset: { speakerId: 'SPEAKER_00' }
        }
      };

      speakerLabeling._onClearLabel(event);

      const input = mockElement.querySelector('input[name="speaker-SPEAKER_00"]');
      expect(input.value).toBe('');
    });

    it('should do nothing if no speaker ID', () => {
      const mockElement = createMockFormElement([
        { id: 'SPEAKER_00', value: 'Alice' }
      ]);
      speakerLabeling._element = mockElement;

      const event = { preventDefault: vi.fn() };
      const target = { dataset: {} };

      speakerLabeling._onClearLabel(event, target);

      // Input should keep its value
      const input = mockElement.querySelector('input[name="speaker-SPEAKER_00"]');
      expect(input.value).toBe('Alice');
    });
  });

  describe('Static Method: addKnownSpeaker', () => {
    it('should add a new known speaker', async () => {
      mockSettings.get.mockReturnValue([]);

      await SpeakerLabeling.addKnownSpeaker('SPEAKER_00');

      expect(mockSettings.set).toHaveBeenCalledWith('knownSpeakers', ['SPEAKER_00']);
    });

    it('should not add duplicate speakers', async () => {
      mockSettings.get.mockReturnValue(['SPEAKER_00']);

      await SpeakerLabeling.addKnownSpeaker('SPEAKER_00');

      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should handle null speaker ID', async () => {
      await SpeakerLabeling.addKnownSpeaker(null);

      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockSettings.get.mockImplementation(() => {
        throw new Error('Settings error');
      });

      await expect(SpeakerLabeling.addKnownSpeaker('SPEAKER_00')).resolves.not.toThrow();
    });
  });

  describe('Static Method: addKnownSpeakers', () => {
    it('should add multiple new known speakers', async () => {
      mockSettings.get.mockReturnValue([]);

      await SpeakerLabeling.addKnownSpeakers(['SPEAKER_00', 'SPEAKER_01']);

      expect(mockSettings.set).toHaveBeenCalledWith('knownSpeakers', ['SPEAKER_00', 'SPEAKER_01']);
    });

    it('should only add non-duplicate speakers', async () => {
      mockSettings.get.mockReturnValue(['SPEAKER_00']);

      await SpeakerLabeling.addKnownSpeakers(['SPEAKER_00', 'SPEAKER_01', 'SPEAKER_02']);

      expect(mockSettings.set).toHaveBeenCalledWith('knownSpeakers', [
        'SPEAKER_00',
        'SPEAKER_01',
        'SPEAKER_02'
      ]);
    });

    it('should filter out null/undefined values', async () => {
      mockSettings.get.mockReturnValue([]);

      await SpeakerLabeling.addKnownSpeakers([null, 'SPEAKER_00', undefined, 'SPEAKER_01']);

      expect(mockSettings.set).toHaveBeenCalledWith('knownSpeakers', ['SPEAKER_00', 'SPEAKER_01']);
    });

    it('should handle null array', async () => {
      await SpeakerLabeling.addKnownSpeakers(null);

      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should handle non-array input', async () => {
      await SpeakerLabeling.addKnownSpeakers('SPEAKER_00');

      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should not update if no new speakers', async () => {
      mockSettings.get.mockReturnValue(['SPEAKER_00', 'SPEAKER_01']);

      await SpeakerLabeling.addKnownSpeakers(['SPEAKER_00', 'SPEAKER_01']);

      expect(mockSettings.set).not.toHaveBeenCalled();
    });
  });

  describe('Static Method: getSpeakerLabel', () => {
    it('should return the label for a known speaker', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });

      const label = SpeakerLabeling.getSpeakerLabel('SPEAKER_00');

      expect(label).toBe('Alice');
    });

    it('should return the speaker ID if no label is set', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const label = SpeakerLabeling.getSpeakerLabel('SPEAKER_00');

      expect(label).toBe('SPEAKER_00');
    });
  });

  describe('Static Method: mapSpeakerLabels', () => {
    it('should map speaker IDs to labels in segments', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });

      const segments = [
        { text: 'Hello', speaker: 'SPEAKER_00' },
        { text: 'Hi there', speaker: 'SPEAKER_01' },
        { text: 'How are you?', speaker: 'SPEAKER_00' }
      ];

      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);

      expect(mapped[0].speaker).toBe('Alice');
      expect(mapped[1].speaker).toBe('Bob');
      expect(mapped[2].speaker).toBe('Alice');
    });

    it('should use original ID if no label exists', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const segments = [{ text: 'Hello', speaker: 'SPEAKER_00' }];

      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);

      expect(mapped[0].speaker).toBe('SPEAKER_00');
    });

    it('should use "Unknown Speaker" if no speaker property', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const segments = [{ text: 'Hello' }];

      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);

      expect(mapped[0].speaker).toBe('Unknown Speaker');
    });

    it('should preserve other segment properties', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice'
      });

      const segments = [{ text: 'Hello', speaker: 'SPEAKER_00', timestamp: 1000 }];

      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);

      expect(mapped[0].text).toBe('Hello');
      expect(mapped[0].timestamp).toBe(1000);
      expect(mapped[0].speaker).toBe('Alice');
    });

    it('should handle null segments', () => {
      const mapped = SpeakerLabeling.mapSpeakerLabels(null);

      expect(mapped).toBeNull();
    });

    it('should handle non-array segments', () => {
      const mapped = SpeakerLabeling.mapSpeakerLabels('not an array');

      expect(mapped).toBe('not an array');
    });

    it('should handle empty array', () => {
      const mapped = SpeakerLabeling.mapSpeakerLabels([]);

      expect(mapped).toEqual([]);
    });
  });

  describe('DEFAULT_OPTIONS', () => {
    it('should have correct options', () => {
      const options = SpeakerLabeling.DEFAULT_OPTIONS;

      expect(options.id).toBe('vox-chronicle-speaker-labeling');
      expect(options.classes).toContain('vox-chronicle');
      expect(options.classes).toContain('speaker-labeling-form');
      expect(options.position.width).toBe(450);
      expect(options.window.resizable).toBe(true);
    });

    it('should have localized window title key', () => {
      const options = SpeakerLabeling.DEFAULT_OPTIONS;

      expect(options.window.title).toBe('VOXCHRONICLE.SpeakerLabeling.Title');
    });

    it('should define actions for reset-labels, auto-detect, and clear-label', () => {
      const options = SpeakerLabeling.DEFAULT_OPTIONS;

      expect(options.actions['reset-labels']).toBeDefined();
      expect(options.actions['auto-detect']).toBeDefined();
      expect(options.actions['clear-label']).toBeDefined();
    });
  });

  describe('PARTS', () => {
    it('should define main template part', () => {
      expect(SpeakerLabeling.PARTS).toBeDefined();
      expect(SpeakerLabeling.PARTS.main).toBeDefined();
      expect(SpeakerLabeling.PARTS.main.template).toContain('speaker-labeling.hbs');
    });
  });

  describe('Static Action Handlers', () => {
    it('should dispatch reset-labels action to instance _onResetLabels', async () => {
      speakerLabeling._onResetLabels = vi.fn();
      const event = { preventDefault: vi.fn() };

      await SpeakerLabeling._onResetLabelsAction.call(speakerLabeling, event, null);

      expect(speakerLabeling._onResetLabels).toHaveBeenCalledWith(event);
    });

    it('should dispatch auto-detect action to instance _onAutoDetect', () => {
      speakerLabeling._onAutoDetect = vi.fn();
      const event = { preventDefault: vi.fn() };

      SpeakerLabeling._onAutoDetectAction.call(speakerLabeling, event, null);

      expect(speakerLabeling._onAutoDetect).toHaveBeenCalledWith(event);
    });

    it('should dispatch clear-label action to instance _onClearLabel', () => {
      speakerLabeling._onClearLabel = vi.fn();
      const event = { preventDefault: vi.fn() };
      const target = { dataset: { speakerId: 'SPEAKER_00' } };

      SpeakerLabeling._onClearLabelAction.call(speakerLabeling, event, target);

      expect(speakerLabeling._onClearLabel).toHaveBeenCalledWith(event, target);
    });
  });

  describe('_onRender Method', () => {
    it('should bind form submit and quick-assign change events', () => {
      const mockElement = document.createElement('div');
      const form = document.createElement('form');
      const select = document.createElement('select');
      select.dataset.action = 'quick-assign';
      mockElement.appendChild(form);
      mockElement.appendChild(select);
      speakerLabeling._element = mockElement;

      const addEventSpy = vi.spyOn(form, 'addEventListener');
      const selectSpy = vi.spyOn(select, 'addEventListener');

      speakerLabeling._onRender({}, {});

      expect(addEventSpy).toHaveBeenCalledWith('submit', expect.any(Function));
      expect(selectSpy).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('DEFAULT_SPEAKER_IDS Export', () => {
    it('should export default speaker IDs', () => {
      expect(DEFAULT_SPEAKER_IDS).toBeDefined();
      expect(Array.isArray(DEFAULT_SPEAKER_IDS)).toBe(true);
      expect(DEFAULT_SPEAKER_IDS.length).toBeGreaterThan(0);
      expect(DEFAULT_SPEAKER_IDS).toContain('SPEAKER_00');
      expect(DEFAULT_SPEAKER_IDS).toContain('SPEAKER_01');
    });

    it('should have 8 default speakers', () => {
      expect(DEFAULT_SPEAKER_IDS.length).toBe(8);
    });
  });

  describe('Static Method: renameSpeaker', () => {
    beforeEach(() => {
      mockSettings.getSpeakerLabels.mockClear();
      mockSettings.setSpeakerLabels.mockClear();
    });

    it('should rename speaker label values matching oldName', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });

      const count = await SpeakerLabeling.renameSpeaker('Alice', 'Alicia');

      expect(count).toBe(1);
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Alicia',
        SPEAKER_01: 'Bob'
      });
    });

    it('should rename multiple labels matching oldName', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob',
        SPEAKER_02: 'Alice'
      });

      const count = await SpeakerLabeling.renameSpeaker('Alice', 'Alicia');

      expect(count).toBe(2);
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Alicia',
        SPEAKER_01: 'Bob',
        SPEAKER_02: 'Alicia'
      });
    });

    it('should rename speaker keys matching oldName', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        'CustomSpeaker': 'Some Label',
        SPEAKER_01: 'Bob'
      });

      const count = await SpeakerLabeling.renameSpeaker('CustomSpeaker', 'NewSpeaker');

      expect(count).toBe(1);
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        'NewSpeaker': 'Some Label',
        SPEAKER_01: 'Bob'
      });
    });

    it('should rename key and update value when both match oldName', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        'Alice': 'Alice',
        SPEAKER_01: 'Bob'
      });

      const count = await SpeakerLabeling.renameSpeaker('Alice', 'Alicia');

      expect(count).toBe(1);
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        'Alicia': 'Alicia',
        SPEAKER_01: 'Bob'
      });
    });

    it('should return 0 and not save when no labels match', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });

      const count = await SpeakerLabeling.renameSpeaker('Charlie', 'Charles');

      expect(count).toBe(0);
      expect(mockSettings.setSpeakerLabels).not.toHaveBeenCalled();
    });

    it('should return 0 for null oldName', async () => {
      const count = await SpeakerLabeling.renameSpeaker(null, 'NewName');
      expect(count).toBe(0);
    });

    it('should return 0 for null newName', async () => {
      const count = await SpeakerLabeling.renameSpeaker('OldName', null);
      expect(count).toBe(0);
    });

    it('should return 0 for empty string oldName', async () => {
      const count = await SpeakerLabeling.renameSpeaker('', 'NewName');
      expect(count).toBe(0);
    });

    it('should return 0 for empty string newName', async () => {
      const count = await SpeakerLabeling.renameSpeaker('OldName', '');
      expect(count).toBe(0);
    });

    it('should return 0 for whitespace-only oldName', async () => {
      const count = await SpeakerLabeling.renameSpeaker('   ', 'NewName');
      expect(count).toBe(0);
    });

    it('should return 0 when oldName equals newName', async () => {
      const count = await SpeakerLabeling.renameSpeaker('Alice', 'Alice');
      expect(count).toBe(0);
    });

    it('should return 0 for non-string oldName', async () => {
      const count = await SpeakerLabeling.renameSpeaker(123, 'NewName');
      expect(count).toBe(0);
    });

    it('should return 0 for non-string newName', async () => {
      const count = await SpeakerLabeling.renameSpeaker('OldName', 123);
      expect(count).toBe(0);
    });

    it('should trim whitespace from oldName and newName', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice'
      });

      const count = await SpeakerLabeling.renameSpeaker('  Alice  ', '  Alicia  ');

      expect(count).toBe(1);
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Alicia'
      });
    });

    it('should handle settings error gracefully', async () => {
      mockSettings.getSpeakerLabels.mockImplementation(() => {
        throw new Error('Settings error');
      });

      const count = await SpeakerLabeling.renameSpeaker('Alice', 'Alicia');

      expect(count).toBe(0);
    });

    it('should handle empty labels object', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const count = await SpeakerLabeling.renameSpeaker('Alice', 'Alicia');

      expect(count).toBe(0);
      expect(mockSettings.setSpeakerLabels).not.toHaveBeenCalled();
    });
  });

  describe('Static Method: applyLabelsToSegments', () => {
    beforeEach(() => {
      mockSettings.getSpeakerLabels.mockClear();
    });

    it('should apply stored labels to matching segments', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob'
      });

      const segments = [
        { text: 'Hello', speaker: 'SPEAKER_00' },
        { text: 'Hi there', speaker: 'SPEAKER_01' }
      ];

      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].speaker).toBe('Alice');
      expect(result[1].speaker).toBe('Bob');
    });

    it('should preserve original speaker when no label exists', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice'
      });

      const segments = [
        { text: 'Hello', speaker: 'SPEAKER_00' },
        { text: 'Hi there', speaker: 'SPEAKER_02' }
      ];

      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].speaker).toBe('Alice');
      expect(result[1].speaker).toBe('SPEAKER_02');
    });

    it('should not mutate original segments', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice'
      });

      const segments = [
        { text: 'Hello', speaker: 'SPEAKER_00' }
      ];

      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].speaker).toBe('Alice');
      expect(segments[0].speaker).toBe('SPEAKER_00');
    });

    it('should preserve other segment properties', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'Alice'
      });

      const segments = [
        { text: 'Hello', speaker: 'SPEAKER_00', start: 0, end: 2.5, confidence: 0.95 }
      ];

      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].text).toBe('Hello');
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(2.5);
      expect(result[0].confidence).toBe(0.95);
      expect(result[0].speaker).toBe('Alice');
    });

    it('should return empty array for non-array input', () => {
      expect(SpeakerLabeling.applyLabelsToSegments(null)).toEqual([]);
      expect(SpeakerLabeling.applyLabelsToSegments(undefined)).toEqual([]);
      expect(SpeakerLabeling.applyLabelsToSegments('not an array')).toEqual([]);
      expect(SpeakerLabeling.applyLabelsToSegments(42)).toEqual([]);
    });

    it('should handle empty array', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'Alice' });

      const result = SpeakerLabeling.applyLabelsToSegments([]);

      expect(result).toEqual([]);
    });

    it('should handle segments without speaker property', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'Alice' });

      const segments = [
        { text: 'Hello' },
        { text: 'World', speaker: 'SPEAKER_00' }
      ];

      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].speaker).toBeUndefined();
      expect(result[1].speaker).toBe('Alice');
    });

    it('should handle empty labels object', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const segments = [
        { text: 'Hello', speaker: 'SPEAKER_00' }
      ];

      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].speaker).toBe('SPEAKER_00');
    });

    it('should handle null from getSpeakerLabels', () => {
      mockSettings.getSpeakerLabels.mockReturnValue(null);

      const segments = [
        { text: 'Hello', speaker: 'SPEAKER_00' }
      ];

      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].speaker).toBe('SPEAKER_00');
    });

    it('should differ from mapSpeakerLabels by not defaulting to Unknown Speaker', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const segments = [
        { text: 'Hello' }
      ];

      // applyLabelsToSegments preserves undefined speaker
      const applied = SpeakerLabeling.applyLabelsToSegments(segments);
      expect(applied[0].speaker).toBeUndefined();

      // mapSpeakerLabels defaults to 'Unknown Speaker'
      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);
      expect(mapped[0].speaker).toBe('Unknown Speaker');
    });
  });

});
