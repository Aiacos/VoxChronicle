/**
 * JournalPicker Unit Tests
 *
 * Tests for the JournalPicker ApplicationV2 dialog that allows DMs to select
 * primary and supplementary journals for AI context.
 *
 * @module tests/ui/JournalPicker.test
 */

// Ensure foundry global exists before JournalPicker.mjs is loaded
vi.hoisted(() => {
  if (!globalThis.foundry) {
    class MockAppV2 {
      static DEFAULT_OPTIONS = {};
      static PARTS = {};
      constructor() {
        this.rendered = false;
        this._element = null;
      }
      render() {
        this.rendered = true;
      }
      close() {
        this.rendered = false;
        return Promise.resolve();
      }
    }
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: MockAppV2,
          HandlebarsApplicationMixin: (Base) =>
            class extends Base {
              static PARTS = {};
            }
        }
      },
      utils: { mergeObject: (a, b) => ({ ...a, ...b }) }
    };
  }
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

import { JournalPicker } from '../../scripts/ui/JournalPicker.mjs';

describe('JournalPicker', () => {
  let settingsStore;

  beforeEach(() => {
    settingsStore = {
      activeAdventureJournalId: '',
      supplementaryJournalIds: []
    };

    globalThis.game = {
      journal: {
        contents: [
          {
            id: 'j1',
            name: 'Lost Mine of Phandelver',
            folder: null,
            pages: { contents: [{ text: { content: 'Test content' } }] }
          },
          {
            id: 'j2',
            name: 'Dragon of Icespire Peak',
            folder: { id: 'f1' },
            pages: { contents: [] }
          },
          { id: 'j3', name: 'NPC Notes', folder: { id: 'f1' }, pages: { contents: [] } },
          { id: 'j4', name: 'World Lore', folder: null, pages: { contents: [] } }
        ]
      },
      folders: {
        filter: vi.fn(() => [
          { id: 'f1', name: 'Adventures', type: 'JournalEntry', folder: null, depth: 1 }
        ])
      },
      settings: {
        get: vi.fn((moduleId, key) => settingsStore[key] ?? ''),
        set: vi.fn((moduleId, key, value) => {
          settingsStore[key] = value;
          return Promise.resolve(value);
        }),
        register: vi.fn()
      },
      i18n: {
        localize: vi.fn((key) => key),
        format: vi.fn((key, data) => key)
      }
    };
  });

  afterEach(() => {
    delete globalThis.game;
  });

  describe('instantiation', () => {
    it('can be instantiated with no errors', () => {
      const picker = new JournalPicker();
      expect(picker).toBeDefined();
    });

    it('has correct DEFAULT_OPTIONS', () => {
      expect(JournalPicker.DEFAULT_OPTIONS.id).toBe('vox-chronicle-journal-picker');
      expect(JournalPicker.DEFAULT_OPTIONS.classes).toContain('vox-chronicle');
      expect(JournalPicker.DEFAULT_OPTIONS.classes).toContain('journal-picker');
    });
  });

  describe('_prepareContext', () => {
    it('returns folder tree with journals from game.journal', async () => {
      const picker = new JournalPicker();
      const context = await picker._prepareContext({});

      expect(context.hasJournals).toBe(true);
      expect(context.rootJournals.length).toBe(2); // j1 and j4 have no folder
      expect(context.rootJournals[0].name).toBe('Lost Mine of Phandelver');
      expect(context.rootJournals[1].name).toBe('World Lore');
    });

    it('groups journals by folder', async () => {
      const picker = new JournalPicker();
      const context = await picker._prepareContext({});

      expect(context.hasFolders).toBe(true);
      expect(context.folderTree.length).toBe(1);
      expect(context.folderTree[0].name).toBe('Adventures');
      expect(context.folderTree[0].journals.length).toBe(2); // j2 and j3
    });

    it('marks previously selected journals', async () => {
      settingsStore.activeAdventureJournalId = 'j1';
      settingsStore.supplementaryJournalIds = ['j4'];

      const picker = new JournalPicker();
      const context = await picker._prepareContext({});

      const j1 = context.rootJournals.find((j) => j.id === 'j1');
      const j4 = context.rootJournals.find((j) => j.id === 'j4');
      expect(j1.selected).toBe(true);
      expect(j1.isPrimary).toBe(true);
      expect(j4.selected).toBe(true);
      expect(j4.isPrimary).toBe(false);
    });

    it('returns selectedCount and totalCount', async () => {
      settingsStore.activeAdventureJournalId = 'j1';
      settingsStore.supplementaryJournalIds = ['j4'];

      const picker = new JournalPicker();
      const context = await picker._prepareContext({});

      expect(context.selectedCount).toBe(2);
      expect(context.totalCount).toBe(4);
    });
  });

  describe('save selection', () => {
    it('saves primaryId and supplementaryIds to game.settings', async () => {
      const picker = new JournalPicker();
      // Simulate save with primary=j1, supplementary=[j4]
      await picker._saveSelection('j1', ['j4']);

      expect(game.settings.set).toHaveBeenCalledWith(
        'vox-chronicle',
        'activeAdventureJournalId',
        'j1'
      );
      expect(game.settings.set).toHaveBeenCalledWith('vox-chronicle', 'supplementaryJournalIds', [
        'j4'
      ]);
    });

    it('primary radio designation marks exactly one journal as primary', async () => {
      const picker = new JournalPicker();
      await picker._saveSelection('j2', ['j1', 'j3']);

      // Primary is j2, supplementary should NOT include j2
      const supplementaryCall = game.settings.set.mock.calls.find(
        (c) => c[1] === 'supplementaryJournalIds'
      );
      expect(supplementaryCall[2]).not.toContain('j2');
      expect(supplementaryCall[2]).toEqual(['j1', 'j3']);
    });
  });

  describe('cancel', () => {
    it('closes dialog without changing settings', async () => {
      const picker = new JournalPicker();
      const closeSpy = vi.spyOn(picker, 'close').mockResolvedValue();

      await picker._handleCancel();

      expect(closeSpy).toHaveBeenCalled();
      expect(game.settings.set).not.toHaveBeenCalled();
    });
  });

  describe('Settings registration', () => {
    it('registers activeAdventureJournalId setting', () => {
      // Import Settings to check registration
      const { Settings } = require('../../scripts/core/Settings.mjs');
      Settings.registerSettings();

      const calls = game.settings.register.mock.calls;
      const activeJournalCall = calls.find((c) => c[1] === 'activeAdventureJournalId');
      expect(activeJournalCall).toBeDefined();
      expect(activeJournalCall[2].scope).toBe('world');
      expect(activeJournalCall[2].config).toBe(false);
      expect(activeJournalCall[2].type).toBe(String);
      expect(activeJournalCall[2].default).toBe('');
    });

    it('registers supplementaryJournalIds setting', () => {
      const { Settings } = require('../../scripts/core/Settings.mjs');
      Settings.registerSettings();

      const calls = game.settings.register.mock.calls;
      const suppJournalCall = calls.find((c) => c[1] === 'supplementaryJournalIds');
      expect(suppJournalCall).toBeDefined();
      expect(suppJournalCall[2].scope).toBe('world');
      expect(suppJournalCall[2].config).toBe(false);
      expect(suppJournalCall[2].type).toBe(Array);
      expect(suppJournalCall[2].default).toEqual([]);
    });
  });

  describe('callback on save', () => {
    it('calls onSave callback when provided', async () => {
      const onSave = vi.fn();
      const picker = new JournalPicker({ onSave });
      vi.spyOn(picker, 'close').mockResolvedValue();

      await picker._saveSelection('j1', []);

      expect(onSave).toHaveBeenCalled();
    });
  });
});
