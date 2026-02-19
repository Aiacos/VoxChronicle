/**
 * SpeakerLabeling Unit Tests
 *
 * Tests for the SpeakerLabeling UI component that maps speaker IDs
 * from transcription diarization to player/character names.
 *
 * @module tests/ui/SpeakerLabeling.test
 */

// Ensure foundry global exists before SpeakerLabeling.mjs is loaded
// (it reads foundry.applications.api at module scope)
vi.hoisted(() => {
  if (!globalThis.foundry) {
    class MockAppV2 {
      static DEFAULT_OPTIONS = {};
      static PARTS = {};
      constructor() {
        this.rendered = false;
        this._element = null;
      }
      render() { this.rendered = true; return this; }
      close() { this.rendered = false; return Promise.resolve(); }
    }
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: MockAppV2,
          HandlebarsApplicationMixin: (Base) => class extends Base {
            static PARTS = {};
          }
        }
      },
      utils: { mergeObject: (a, b) => ({ ...a, ...b }) }
    };
  }
});

const { mockSettings } = vi.hoisted(() => {
  const mockSettings = {
    getSpeakerLabels: vi.fn(() => ({})),
    setSpeakerLabels: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => []),
    set: vi.fn(() => Promise.resolve()),
    getConfigurationStatus: vi.fn(() => ({ openai: true, kanka: true }))
  };
  return { mockSettings };
});

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

vi.mock('../../scripts/core/Settings.mjs', () => ({
  Settings: mockSettings
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeakerLabeling, DEFAULT_SPEAKER_IDS } from '../../scripts/ui/SpeakerLabeling.mjs';

describe('SpeakerLabeling', () => {
  let labeling;

  beforeEach(() => {
    mockSettings.getSpeakerLabels.mockReturnValue({});
    mockSettings.get.mockReturnValue([]);
    mockSettings.setSpeakerLabels.mockReturnValue(Promise.resolve());
    mockSettings.set.mockReturnValue(Promise.resolve());

    labeling = new SpeakerLabeling();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Constructor ---

  describe('constructor', () => {
    it('should create instance with default state', () => {
      expect(labeling).toBeDefined();
      expect(labeling._labels).toEqual({});
      expect(labeling._knownSpeakers).toEqual([]);
    });

    it('should load current labels from settings', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'Game Master' });
      mockSettings.get.mockReturnValue(['SPEAKER_00', 'SPEAKER_01']);

      const instance = new SpeakerLabeling();
      expect(instance._labels).toEqual({ SPEAKER_00: 'Game Master' });
      expect(instance._knownSpeakers).toEqual(['SPEAKER_00', 'SPEAKER_01']);
    });

    it('should handle settings load failure gracefully', () => {
      mockSettings.getSpeakerLabels.mockImplementation(() => { throw new Error('fail'); });

      const instance = new SpeakerLabeling();
      expect(instance._labels).toEqual({});
      expect(instance._knownSpeakers).toEqual([]);
    });
  });

  // --- Static properties ---

  describe('static properties', () => {
    it('should have DEFAULT_OPTIONS with correct id', () => {
      expect(SpeakerLabeling.DEFAULT_OPTIONS.id).toBe('vox-chronicle-speaker-labeling');
    });

    it('should have DEFAULT_OPTIONS with correct classes', () => {
      expect(SpeakerLabeling.DEFAULT_OPTIONS.classes).toContain('vox-chronicle');
      expect(SpeakerLabeling.DEFAULT_OPTIONS.classes).toContain('speaker-labeling-form');
    });

    it('should define window options', () => {
      expect(SpeakerLabeling.DEFAULT_OPTIONS.window).toBeDefined();
      expect(SpeakerLabeling.DEFAULT_OPTIONS.window.resizable).toBe(true);
      expect(SpeakerLabeling.DEFAULT_OPTIONS.window.minimizable).toBe(true);
    });

    it('should define action handlers', () => {
      const actions = SpeakerLabeling.DEFAULT_OPTIONS.actions;
      expect(actions['reset-labels']).toBeDefined();
      expect(actions['auto-detect']).toBeDefined();
      expect(actions['clear-label']).toBeDefined();
    });

    it('should have PARTS with main template', () => {
      expect(SpeakerLabeling.PARTS.main).toBeDefined();
      expect(SpeakerLabeling.PARTS.main.template).toContain('speaker-labeling.hbs');
    });
  });

  // --- DEFAULT_SPEAKER_IDS export ---

  describe('DEFAULT_SPEAKER_IDS', () => {
    it('should export default speaker IDs', () => {
      expect(DEFAULT_SPEAKER_IDS).toBeDefined();
      expect(DEFAULT_SPEAKER_IDS).toBeInstanceOf(Array);
      expect(DEFAULT_SPEAKER_IDS.length).toBe(8);
    });

    it('should contain SPEAKER_00 through SPEAKER_07', () => {
      for (let i = 0; i < 8; i++) {
        expect(DEFAULT_SPEAKER_IDS).toContain(`SPEAKER_0${i}`);
      }
    });
  });

  // --- _loadCurrentLabels ---

  describe('_loadCurrentLabels', () => {
    it('should load labels and known speakers from settings', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'DM' });
      mockSettings.get.mockReturnValue(['SPEAKER_00']);

      labeling._loadCurrentLabels();

      expect(labeling._labels).toEqual({ SPEAKER_00: 'DM' });
      expect(labeling._knownSpeakers).toEqual(['SPEAKER_00']);
    });

    it('should default to empty when settings return null', () => {
      mockSettings.getSpeakerLabels.mockReturnValue(null);
      mockSettings.get.mockReturnValue(null);

      labeling._loadCurrentLabels();

      expect(labeling._labels).toEqual({});
      expect(labeling._knownSpeakers).toEqual([]);
    });

    it('should handle errors gracefully', () => {
      mockSettings.getSpeakerLabels.mockImplementation(() => { throw new Error('fail'); });

      labeling._loadCurrentLabels();

      expect(labeling._labels).toEqual({});
      expect(labeling._knownSpeakers).toEqual([]);
    });
  });

  // --- _getAllSpeakerIds ---

  describe('_getAllSpeakerIds', () => {
    it('should return default speaker IDs when no known speakers', () => {
      const ids = labeling._getAllSpeakerIds();
      expect(ids).toHaveLength(8);
      expect(ids).toContain('SPEAKER_00');
      expect(ids).toContain('SPEAKER_07');
    });

    it('should include known speakers', () => {
      labeling._knownSpeakers = ['SPEAKER_10'];
      const ids = labeling._getAllSpeakerIds();
      expect(ids).toContain('SPEAKER_10');
    });

    it('should include speakers with labels that are not in default or known list', () => {
      labeling._labels = { CUSTOM_SPEAKER: 'John' };
      const ids = labeling._getAllSpeakerIds();
      expect(ids).toContain('CUSTOM_SPEAKER');
    });

    it('should deduplicate speaker IDs', () => {
      labeling._knownSpeakers = ['SPEAKER_00', 'SPEAKER_01'];
      const ids = labeling._getAllSpeakerIds();
      const speakerZeroCount = ids.filter(id => id === 'SPEAKER_00').length;
      expect(speakerZeroCount).toBe(1);
    });

    it('should sort by speaker number', () => {
      labeling._knownSpeakers = ['SPEAKER_10', 'SPEAKER_02'];
      const ids = labeling._getAllSpeakerIds();
      const idx02 = ids.indexOf('SPEAKER_02');
      const idx10 = ids.indexOf('SPEAKER_10');
      expect(idx02).toBeLessThan(idx10);
    });

    it('should sort non-SPEAKER patterns alphabetically', () => {
      labeling._labels = { CUSTOM_A: 'Alice', CUSTOM_B: 'Bob' };
      const ids = labeling._getAllSpeakerIds();
      const idxA = ids.indexOf('CUSTOM_A');
      const idxB = ids.indexOf('CUSTOM_B');
      expect(idxA).toBeLessThan(idxB);
    });
  });

  // --- _extractSpeakerNumber ---

  describe('_extractSpeakerNumber', () => {
    it('should extract number from SPEAKER_00', () => {
      expect(labeling._extractSpeakerNumber('SPEAKER_00')).toBe(0);
    });

    it('should extract number from SPEAKER_10', () => {
      expect(labeling._extractSpeakerNumber('SPEAKER_10')).toBe(10);
    });

    it('should return null for non-matching pattern', () => {
      expect(labeling._extractSpeakerNumber('CUSTOM_SPEAKER')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(labeling._extractSpeakerNumber('')).toBeNull();
    });
  });

  // --- _prepareContext ---

  describe('_prepareContext', () => {
    it('should return context with speaker data', async () => {
      const ctx = await labeling._prepareContext();
      expect(ctx.speakers).toBeDefined();
      expect(ctx.speakers.length).toBeGreaterThanOrEqual(8); // At least default IDs
    });

    it('should include moduleId', async () => {
      const ctx = await labeling._prepareContext();
      expect(ctx.moduleId).toBe('vox-chronicle');
    });

    it('should mark known speakers', async () => {
      labeling._knownSpeakers = ['SPEAKER_00'];
      const ctx = await labeling._prepareContext();
      const speaker0 = ctx.speakers.find(s => s.id === 'SPEAKER_00');
      expect(speaker0.isKnown).toBe(true);
    });

    it('should include labels in speaker data', async () => {
      labeling._labels = { SPEAKER_00: 'Game Master' };
      const ctx = await labeling._prepareContext();
      const speaker0 = ctx.speakers.find(s => s.id === 'SPEAKER_00');
      expect(speaker0.label).toBe('Game Master');
    });

    it('should default label to empty string when not set', async () => {
      const ctx = await labeling._prepareContext();
      const speaker0 = ctx.speakers.find(s => s.id === 'SPEAKER_00');
      expect(speaker0.label).toBe('');
    });

    it('should include game users', async () => {
      game.users = {
        map: vi.fn((fn) => [
          { id: 'gm1', name: 'Game Master', isGM: true },
          { id: 'p1', name: 'Player One', isGM: false }
        ].map(fn))
      };

      const ctx = await labeling._prepareContext();
      expect(ctx.gameUsers).toBeDefined();
    });

    it('should include hasKnownSpeakers flag', async () => {
      labeling._knownSpeakers = [];
      const ctx = await labeling._prepareContext();
      expect(ctx.hasKnownSpeakers).toBe(false);

      labeling._knownSpeakers = ['SPEAKER_00'];
      const ctx2 = await labeling._prepareContext();
      expect(ctx2.hasKnownSpeakers).toBe(true);
    });

    it('should include i18n strings', async () => {
      const ctx = await labeling._prepareContext();
      expect(ctx.i18n).toBeDefined();
      expect(ctx.i18n.title).toBeDefined();
      expect(ctx.i18n.save).toBeDefined();
      expect(ctx.i18n.reset).toBeDefined();
      expect(ctx.i18n.autoDetect).toBeDefined();
    });
  });

  // --- _getGameUsers ---

  describe('_getGameUsers', () => {
    it('should return empty array when no game.users', () => {
      game.users = undefined;
      const users = labeling._getGameUsers();
      expect(users).toEqual([]);
    });

    it('should return mapped users sorted GMs first', () => {
      game.users = {
        map: vi.fn((fn) => [
          { id: 'p1', name: 'Player One', isGM: false },
          { id: 'gm1', name: 'Game Master', isGM: true }
        ].map(fn))
      };

      const users = labeling._getGameUsers();
      expect(users[0].isGM).toBe(true);
      expect(users[1].isGM).toBe(false);
    });

    it('should sort users alphabetically within same role', () => {
      game.users = {
        map: vi.fn((fn) => [
          { id: 'p2', name: 'Zack', isGM: false },
          { id: 'p1', name: 'Alice', isGM: false }
        ].map(fn))
      };

      const users = labeling._getGameUsers();
      expect(users[0].name).toBe('Alice');
      expect(users[1].name).toBe('Zack');
    });

    it('should return user id, name, and isGM', () => {
      game.users = {
        map: vi.fn((fn) => [
          { id: 'p1', name: 'Test', isGM: false }
        ].map(fn))
      };

      const users = labeling._getGameUsers();
      expect(users[0]).toHaveProperty('id');
      expect(users[0]).toHaveProperty('name');
      expect(users[0]).toHaveProperty('isGM');
    });
  });

  // --- _updateObject ---

  describe('_updateObject', () => {
    it('should save speaker labels from form data', async () => {
      const formData = {
        'speaker-SPEAKER_00': 'Game Master',
        'speaker-SPEAKER_01': 'Player One',
        'other-field': 'ignored'
      };

      await labeling._updateObject({}, formData);

      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Game Master',
        SPEAKER_01: 'Player One'
      });
    });

    it('should skip empty values', async () => {
      const formData = {
        'speaker-SPEAKER_00': 'Game Master',
        'speaker-SPEAKER_01': '',
        'speaker-SPEAKER_02': '   '
      };

      await labeling._updateObject({}, formData);

      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Game Master'
      });
    });

    it('should trim values', async () => {
      const formData = {
        'speaker-SPEAKER_00': '  Game Master  '
      };

      await labeling._updateObject({}, formData);

      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'Game Master'
      });
    });

    it('should show success notification', async () => {
      await labeling._updateObject({}, { 'speaker-SPEAKER_00': 'DM' });
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should update internal labels', async () => {
      await labeling._updateObject({}, { 'speaker-SPEAKER_00': 'DM' });
      expect(labeling._labels).toEqual({ SPEAKER_00: 'DM' });
    });

    it('should handle save error', async () => {
      mockSettings.setSpeakerLabels.mockRejectedValue(new Error('save failed'));

      await labeling._updateObject({}, { 'speaker-SPEAKER_00': 'DM' });

      expect(ui.notifications.error).toHaveBeenCalled();
    });
  });

  // --- _onResetLabels ---

  describe('_onResetLabels', () => {
    it('should confirm with user before resetting', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(false));

      await labeling._onResetLabels({ preventDefault: vi.fn() });

      expect(Dialog.confirm).toHaveBeenCalled();
      expect(mockSettings.setSpeakerLabels).not.toHaveBeenCalled();
    });

    it('should reset labels when confirmed', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(true));
      vi.spyOn(labeling, 'render').mockImplementation(() => {});

      await labeling._onResetLabels({ preventDefault: vi.fn() });

      expect(labeling._labels).toEqual({});
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({});
      expect(labeling.render).toHaveBeenCalled();
    });

    it('should not reset when dialog is cancelled', async () => {
      labeling._labels = { SPEAKER_00: 'DM' };
      Dialog.confirm = vi.fn(() => Promise.resolve(false));

      await labeling._onResetLabels({ preventDefault: vi.fn() });

      expect(labeling._labels).toEqual({ SPEAKER_00: 'DM' });
      expect(mockSettings.setSpeakerLabels).not.toHaveBeenCalled();
    });

    it('should show notification on reset', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(true));
      vi.spyOn(labeling, 'render').mockImplementation(() => {});

      await labeling._onResetLabels({ preventDefault: vi.fn() });

      expect(ui.notifications.info).toHaveBeenCalled();
    });
  });

  // --- _onAutoDetect ---

  describe('_onAutoDetect', () => {
    it('should warn if no game users', () => {
      game.users = undefined;

      labeling._onAutoDetect({ preventDefault: vi.fn() });

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should assign users to empty speaker inputs in order', () => {
      game.users = {
        map: vi.fn((fn) => [
          { id: 'gm1', name: 'DM', isGM: true },
          { id: 'p1', name: 'Alice', isGM: false }
        ].map(fn))
      };

      const input1 = { value: '', name: 'speaker-SPEAKER_00' };
      const input2 = { value: '', name: 'speaker-SPEAKER_01' };
      const mockForm = {
        querySelectorAll: vi.fn(() => [input1, input2])
      };
      const mockElement = {
        querySelector: vi.fn(() => mockForm)
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      labeling._onAutoDetect({ preventDefault: vi.fn() });

      expect(input1.value).toContain('DM');
      expect(input2.value).toBe('Alice');
    });

    it('should not overwrite existing input values', () => {
      game.users = {
        map: vi.fn((fn) => [
          { id: 'gm1', name: 'DM', isGM: true },
          { id: 'p1', name: 'Alice', isGM: false }
        ].map(fn))
      };

      const input1 = { value: 'Existing Name', name: 'speaker-SPEAKER_00' };
      const input2 = { value: '', name: 'speaker-SPEAKER_01' };
      const mockForm = {
        querySelectorAll: vi.fn(() => [input1, input2])
      };
      const mockElement = {
        querySelector: vi.fn(() => mockForm)
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      labeling._onAutoDetect({ preventDefault: vi.fn() });

      expect(input1.value).toBe('Existing Name');
      expect(input2.value).toContain('DM');
    });

    it('should format GM names with prefix', () => {
      game.users = {
        map: vi.fn((fn) => [
          { id: 'gm1', name: 'John', isGM: true }
        ].map(fn))
      };

      const input1 = { value: '', name: 'speaker-SPEAKER_00' };
      const mockForm = {
        querySelectorAll: vi.fn(() => [input1])
      };
      const mockElement = {
        querySelector: vi.fn(() => mockForm)
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      labeling._onAutoDetect({ preventDefault: vi.fn() });

      expect(input1.value).toBe('GM (John)');
    });

    it('should do nothing if form not found', () => {
      game.users = {
        map: vi.fn((fn) => [{ id: '1', name: 'Test', isGM: false }].map(fn))
      };

      const mockElement = {
        querySelector: vi.fn(() => null)
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      expect(() => labeling._onAutoDetect({ preventDefault: vi.fn() })).not.toThrow();
    });
  });

  // --- _onQuickAssign ---

  describe('_onQuickAssign', () => {
    it('should set input value from dropdown', () => {
      const mockInput = { value: '' };
      const mockSelect = {
        value: 'Player One',
        dataset: { speakerId: 'SPEAKER_00' }
      };
      const mockElement = {
        querySelector: vi.fn(() => mockInput)
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      labeling._onQuickAssign({ currentTarget: mockSelect });

      expect(mockInput.value).toBe('Player One');
      expect(mockSelect.value).toBe('');
    });

    it('should do nothing when no value selected', () => {
      const mockSelect = {
        value: '',
        dataset: { speakerId: 'SPEAKER_00' }
      };

      labeling._onQuickAssign({ currentTarget: mockSelect });
      // No error expected
    });

    it('should do nothing when no speakerId', () => {
      const mockSelect = {
        value: 'Test',
        dataset: {}
      };

      labeling._onQuickAssign({ currentTarget: mockSelect });
      // No error expected
    });
  });

  // --- _onClearLabel ---

  describe('_onClearLabel', () => {
    it('should clear input value for speaker', () => {
      const mockInput = { value: 'Game Master' };
      const mockElement = {
        querySelector: vi.fn(() => mockInput)
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      const target = { dataset: { speakerId: 'SPEAKER_00' } };

      labeling._onClearLabel({ preventDefault: vi.fn() }, target);

      expect(mockInput.value).toBe('');
    });

    it('should use event.currentTarget when no target provided', () => {
      const mockInput = { value: 'Test' };
      const mockElement = {
        querySelector: vi.fn(() => mockInput)
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      labeling._onClearLabel({
        preventDefault: vi.fn(),
        currentTarget: { dataset: { speakerId: 'SPEAKER_00' } }
      });

      expect(mockInput.value).toBe('');
    });

    it('should do nothing if no speakerId', () => {
      labeling._onClearLabel({
        preventDefault: vi.fn(),
        currentTarget: { dataset: {} }
      });
      // No error expected
    });
  });

  // --- _onFormSubmit ---

  describe('_onFormSubmit', () => {
    it('should prevent default, update object, and close', async () => {
      const mockFormData = new FormData();
      mockFormData.append('speaker-SPEAKER_00', 'DM');

      const mockForm = {
        // FormData constructor needs a real form element, so we mock it
      };

      // We need to mock FormData to return expected data
      const originalFormData = globalThis.FormData;

      vi.spyOn(labeling, '_updateObject').mockResolvedValue();
      vi.spyOn(labeling, 'close').mockResolvedValue();

      const mockEvent = {
        preventDefault: vi.fn(),
        currentTarget: mockForm
      };

      // Mock FormData constructor
      globalThis.FormData = vi.fn().mockImplementation(() => ({
        entries: vi.fn(() => [['speaker-SPEAKER_00', 'DM']][Symbol.iterator]())
      }));

      await labeling._onFormSubmit(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(labeling._updateObject).toHaveBeenCalled();
      expect(labeling.close).toHaveBeenCalled();

      globalThis.FormData = originalFormData;
    });
  });

  // --- _onRender ---

  describe('_onRender', () => {
    it('should attach form submit handler', () => {
      const mockForm = { addEventListener: vi.fn() };
      const mockElement = {
        querySelector: vi.fn(() => mockForm),
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      labeling._onRender({}, {});

      expect(mockElement.querySelector).toHaveBeenCalledWith('form');
      expect(mockForm.addEventListener).toHaveBeenCalledWith(
        'submit',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should attach quick-assign change handlers', () => {
      const mockSelect = { addEventListener: vi.fn() };
      const mockElement = {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn((selector) => {
          if (selector.includes('quick-assign')) return [mockSelect];
          return [];
        })
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      labeling._onRender({}, {});

      expect(mockSelect.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should abort previous controller', () => {
      const mockElement = {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(labeling, 'element', {
        get: () => mockElement,
        configurable: true
      });

      labeling._onRender({}, {});
      labeling._onRender({}, {});
      // No error = success
    });

    it('should handle null element', () => {
      Object.defineProperty(labeling, 'element', {
        get: () => null,
        configurable: true
      });
      expect(() => labeling._onRender({}, {})).not.toThrow();
    });
  });

  // --- close ---

  describe('close', () => {
    it('should close without error', async () => {
      await expect(labeling.close()).resolves.not.toThrow();
    });
  });

  // --- Static methods ---

  describe('static addKnownSpeaker', () => {
    it('should add new speaker to known list', async () => {
      mockSettings.get.mockReturnValue([]);

      await SpeakerLabeling.addKnownSpeaker('SPEAKER_10');

      expect(mockSettings.set).toHaveBeenCalledWith(
        'knownSpeakers',
        expect.arrayContaining(['SPEAKER_10'])
      );
    });

    it('should not add duplicate speaker', async () => {
      mockSettings.get.mockReturnValue(['SPEAKER_10']);

      await SpeakerLabeling.addKnownSpeaker('SPEAKER_10');

      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should do nothing for empty speakerId', async () => {
      await SpeakerLabeling.addKnownSpeaker('');
      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should do nothing for null speakerId', async () => {
      await SpeakerLabeling.addKnownSpeaker(null);
      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockSettings.get.mockImplementation(() => { throw new Error('fail'); });

      await expect(SpeakerLabeling.addKnownSpeaker('SPEAKER_00')).resolves.not.toThrow();
    });
  });

  describe('static addKnownSpeakers', () => {
    it('should add multiple new speakers', async () => {
      mockSettings.get.mockReturnValue([]);

      await SpeakerLabeling.addKnownSpeakers(['SPEAKER_10', 'SPEAKER_11']);

      expect(mockSettings.set).toHaveBeenCalledWith(
        'knownSpeakers',
        expect.arrayContaining(['SPEAKER_10', 'SPEAKER_11'])
      );
    });

    it('should skip existing speakers', async () => {
      mockSettings.get.mockReturnValue(['SPEAKER_10']);

      await SpeakerLabeling.addKnownSpeakers(['SPEAKER_10', 'SPEAKER_11']);

      // Only SPEAKER_11 should be new
      expect(mockSettings.set).toHaveBeenCalledWith(
        'knownSpeakers',
        ['SPEAKER_10', 'SPEAKER_11']
      );
    });

    it('should not call set if no new speakers', async () => {
      mockSettings.get.mockReturnValue(['SPEAKER_10', 'SPEAKER_11']);

      await SpeakerLabeling.addKnownSpeakers(['SPEAKER_10', 'SPEAKER_11']);

      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should handle null/undefined input', async () => {
      await SpeakerLabeling.addKnownSpeakers(null);
      await SpeakerLabeling.addKnownSpeakers(undefined);
      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should handle non-array input', async () => {
      await SpeakerLabeling.addKnownSpeakers('not-an-array');
      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('should filter out falsy speaker IDs', async () => {
      mockSettings.get.mockReturnValue([]);

      await SpeakerLabeling.addKnownSpeakers(['SPEAKER_10', '', null]);

      expect(mockSettings.set).toHaveBeenCalledWith(
        'knownSpeakers',
        ['SPEAKER_10']
      );
    });

    it('should handle errors gracefully', async () => {
      mockSettings.get.mockImplementation(() => { throw new Error('fail'); });

      await expect(SpeakerLabeling.addKnownSpeakers(['TEST'])).resolves.not.toThrow();
    });
  });

  describe('static getSpeakerLabel', () => {
    it('should return label for known speaker', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'Game Master' });

      const label = SpeakerLabeling.getSpeakerLabel('SPEAKER_00');
      expect(label).toBe('Game Master');
    });

    it('should return original ID when no label set', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const label = SpeakerLabeling.getSpeakerLabel('SPEAKER_99');
      expect(label).toBe('SPEAKER_99');
    });
  });

  describe('static mapSpeakerLabels', () => {
    it('should map speaker labels in segments', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'DM',
        SPEAKER_01: 'Player1'
      });

      const segments = [
        { speaker: 'SPEAKER_00', text: 'Hello' },
        { speaker: 'SPEAKER_01', text: 'Hi' }
      ];

      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);

      expect(mapped[0].speaker).toBe('DM');
      expect(mapped[1].speaker).toBe('Player1');
    });

    it('should keep original speaker ID when no label', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const segments = [{ speaker: 'SPEAKER_00', text: 'Hello' }];
      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);

      expect(mapped[0].speaker).toBe('SPEAKER_00');
    });

    it('should use "Unknown Speaker" when segment has no speaker', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({});

      const segments = [{ text: 'Hello' }];
      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);

      expect(mapped[0].speaker).toBe('Unknown Speaker');
    });

    it('should handle null/undefined input', () => {
      expect(SpeakerLabeling.mapSpeakerLabels(null)).toBeNull();
      expect(SpeakerLabeling.mapSpeakerLabels(undefined)).toBeUndefined();
    });

    it('should handle non-array input', () => {
      expect(SpeakerLabeling.mapSpeakerLabels('not-array')).toBe('not-array');
    });

    it('should preserve other segment properties', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'DM' });

      const segments = [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1.5 }];
      const mapped = SpeakerLabeling.mapSpeakerLabels(segments);

      expect(mapped[0].text).toBe('Hello');
      expect(mapped[0].start).toBe(0);
      expect(mapped[0].end).toBe(1.5);
    });
  });

  describe('static renameSpeaker', () => {
    it('should rename speaker label values', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'OldName',
        SPEAKER_01: 'Other'
      });

      const count = await SpeakerLabeling.renameSpeaker('OldName', 'NewName');

      expect(count).toBe(1);
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        SPEAKER_00: 'NewName',
        SPEAKER_01: 'Other'
      });
    });

    it('should rename speaker label keys', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        OldName: 'SomeLabel'
      });

      const count = await SpeakerLabeling.renameSpeaker('OldName', 'NewName');

      expect(count).toBe(1);
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        NewName: 'SomeLabel'
      });
    });

    it('should return 0 for null/undefined arguments', async () => {
      expect(await SpeakerLabeling.renameSpeaker(null, 'new')).toBe(0);
      expect(await SpeakerLabeling.renameSpeaker('old', null)).toBe(0);
      expect(await SpeakerLabeling.renameSpeaker(null, null)).toBe(0);
    });

    it('should return 0 for non-string arguments', async () => {
      expect(await SpeakerLabeling.renameSpeaker(123, 'new')).toBe(0);
      expect(await SpeakerLabeling.renameSpeaker('old', 123)).toBe(0);
    });

    it('should return 0 when old and new names are the same', async () => {
      expect(await SpeakerLabeling.renameSpeaker('Same', 'Same')).toBe(0);
    });

    it('should return 0 for empty/whitespace strings', async () => {
      expect(await SpeakerLabeling.renameSpeaker('', 'new')).toBe(0);
      expect(await SpeakerLabeling.renameSpeaker('old', '')).toBe(0);
      expect(await SpeakerLabeling.renameSpeaker('  ', 'new')).toBe(0);
    });

    it('should trim whitespace from names', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'OldName'
      });

      const count = await SpeakerLabeling.renameSpeaker('  OldName  ', '  NewName  ');
      expect(count).toBe(1);
    });

    it('should return 0 when no labels match', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'NoMatch'
      });

      const count = await SpeakerLabeling.renameSpeaker('OldName', 'NewName');
      expect(count).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockSettings.getSpeakerLabels.mockImplementation(() => { throw new Error('fail'); });

      const count = await SpeakerLabeling.renameSpeaker('old', 'new');
      expect(count).toBe(0);
    });

    it('should update key value when key matches oldName and value also matches', async () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        OldName: 'OldName'  // Key and value both match
      });

      const count = await SpeakerLabeling.renameSpeaker('OldName', 'NewName');

      expect(count).toBe(1);
      expect(mockSettings.setSpeakerLabels).toHaveBeenCalledWith({
        NewName: 'NewName'
      });
    });
  });

  describe('static applyLabelsToSegments', () => {
    it('should apply stored labels to segments', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({
        SPEAKER_00: 'DM',
        SPEAKER_01: 'Player1'
      });

      const segments = [
        { speaker: 'SPEAKER_00', text: 'Hello' },
        { speaker: 'SPEAKER_01', text: 'Hi' },
        { speaker: 'SPEAKER_02', text: 'Hey' }
      ];

      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].speaker).toBe('DM');
      expect(result[1].speaker).toBe('Player1');
      expect(result[2].speaker).toBe('SPEAKER_02'); // No label, keep original
    });

    it('should return empty array for non-array input', () => {
      expect(SpeakerLabeling.applyLabelsToSegments(null)).toEqual([]);
      expect(SpeakerLabeling.applyLabelsToSegments(undefined)).toEqual([]);
      expect(SpeakerLabeling.applyLabelsToSegments('string')).toEqual([]);
    });

    it('should not mutate original segments', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'DM' });

      const segments = [{ speaker: 'SPEAKER_00', text: 'Hello' }];
      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(segments[0].speaker).toBe('SPEAKER_00');
      expect(result[0].speaker).toBe('DM');
    });

    it('should handle segments without speaker property', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'DM' });

      const segments = [{ text: 'No speaker' }];
      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].speaker).toBeUndefined();
    });

    it('should preserve all other segment properties', () => {
      mockSettings.getSpeakerLabels.mockReturnValue({ SPEAKER_00: 'DM' });

      const segments = [{ speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1.5, extra: true }];
      const result = SpeakerLabeling.applyLabelsToSegments(segments);

      expect(result[0].text).toBe('Hello');
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(1.5);
      expect(result[0].extra).toBe(true);
    });
  });

  // --- Static action handlers ---

  describe('static action handlers', () => {
    it('_onResetLabelsAction should call _onResetLabels', async () => {
      const mockInstance = {
        _onResetLabels: vi.fn(() => Promise.resolve())
      };
      const event = {};
      await SpeakerLabeling._onResetLabelsAction.call(mockInstance, event, null);
      expect(mockInstance._onResetLabels).toHaveBeenCalledWith(event);
    });

    it('_onAutoDetectAction should call _onAutoDetect', () => {
      const mockInstance = {
        _onAutoDetect: vi.fn()
      };
      const event = {};
      SpeakerLabeling._onAutoDetectAction.call(mockInstance, event, null);
      expect(mockInstance._onAutoDetect).toHaveBeenCalledWith(event);
    });

    it('_onClearLabelAction should call _onClearLabel', () => {
      const mockInstance = {
        _onClearLabel: vi.fn()
      };
      const event = {};
      const target = {};
      SpeakerLabeling._onClearLabelAction.call(mockInstance, event, target);
      expect(mockInstance._onClearLabel).toHaveBeenCalledWith(event, target);
    });
  });
});
