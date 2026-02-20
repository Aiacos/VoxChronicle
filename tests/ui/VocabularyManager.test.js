/**
 * VocabularyManager Unit Tests
 *
 * Tests for the VocabularyManager UI component that manages custom vocabulary
 * terms for improved transcription accuracy.
 *
 * @module tests/ui/VocabularyManager.test
 */

// Ensure foundry global exists before VocabularyManager.mjs is loaded
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

const { mockDictionary } = vi.hoisted(() => {
  const mockDictionary = {
    getAllTerms: vi.fn(() => ({
      character_names: [],
      location_names: [],
      items: [],
      terms: [],
      custom: []
    })),
    getTotalTermCount: vi.fn(() => 0),
    addTerm: vi.fn(() => Promise.resolve(true)),
    removeTerm: vi.fn(() => Promise.resolve(true)),
    clearCategory: vi.fn(() => Promise.resolve(0)),
    clearAll: vi.fn(() => Promise.resolve(0)),
    hasTerm: vi.fn(() => false),
    importDictionary: vi.fn(() => Promise.resolve({ added: 0, skipped: 0 })),
    exportDictionary: vi.fn(() => '{}')
  };
  return { mockDictionary };
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

vi.mock('../../scripts/utils/HtmlUtils.mjs', () => ({
  escapeHtml: vi.fn((text) => text || '')
}));

vi.mock('../../scripts/core/VocabularyDictionary.mjs', () => ({
  VocabularyDictionary: vi.fn().mockImplementation(() => mockDictionary),
  VocabularyCategory: {
    CHARACTER_NAMES: 'character_names',
    LOCATION_NAMES: 'location_names',
    ITEMS: 'items',
    TERMS: 'terms',
    CUSTOM: 'custom'
  }
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VocabularyManager } from '../../scripts/ui/VocabularyManager.mjs';
import { VocabularyDictionary, VocabularyCategory } from '../../scripts/core/VocabularyDictionary.mjs';

describe('VocabularyManager', () => {
  let manager;

  beforeEach(() => {
    // Reset mock return values (must do this before creating VocabularyManager
    // since vi.clearAllMocks in afterEach clears mockImplementation)
    mockDictionary.getAllTerms.mockReturnValue({
      character_names: [],
      location_names: [],
      items: [],
      terms: [],
      custom: []
    });
    mockDictionary.getTotalTermCount.mockReturnValue(0);
    mockDictionary.addTerm.mockReturnValue(Promise.resolve(true));
    mockDictionary.removeTerm.mockReturnValue(Promise.resolve(true));
    mockDictionary.clearCategory.mockReturnValue(Promise.resolve(5));
    mockDictionary.clearAll.mockReturnValue(Promise.resolve(10));
    mockDictionary.hasTerm.mockReturnValue(false);
    mockDictionary.importDictionary.mockReturnValue(Promise.resolve({ added: 3, skipped: 1 }));
    mockDictionary.exportDictionary.mockReturnValue('{"character_names":["Test"]}');

    // Restore the constructor mock implementation
    VocabularyDictionary.mockImplementation(() => mockDictionary);

    manager = new VocabularyManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Constructor ---

  describe('constructor', () => {
    it('should create instance with dictionary', () => {
      expect(manager).toBeDefined();
      expect(manager._dictionary).toBeDefined();
    });

    it('should initialize with CHARACTER_NAMES as active category', () => {
      expect(manager._activeCategory).toBe(VocabularyCategory.CHARACTER_NAMES);
    });
  });

  // --- Static properties ---

  describe('static properties', () => {
    it('should have DEFAULT_OPTIONS with correct id', () => {
      expect(VocabularyManager.DEFAULT_OPTIONS.id).toBe('vox-chronicle-vocabulary-manager');
    });

    it('should have DEFAULT_OPTIONS with correct classes', () => {
      expect(VocabularyManager.DEFAULT_OPTIONS.classes).toContain('vox-chronicle');
      expect(VocabularyManager.DEFAULT_OPTIONS.classes).toContain('vocabulary-manager');
    });

    it('should define window options', () => {
      expect(VocabularyManager.DEFAULT_OPTIONS.window).toBeDefined();
      expect(VocabularyManager.DEFAULT_OPTIONS.window.resizable).toBe(true);
      expect(VocabularyManager.DEFAULT_OPTIONS.window.minimizable).toBe(true);
    });

    it('should define position options', () => {
      expect(VocabularyManager.DEFAULT_OPTIONS.position.width).toBe(600);
      expect(VocabularyManager.DEFAULT_OPTIONS.position.height).toBe(600);
    });

    it('should define action handlers', () => {
      const actions = VocabularyManager.DEFAULT_OPTIONS.actions;
      expect(actions['add-term']).toBeDefined();
      expect(actions['remove-term']).toBeDefined();
      expect(actions['clear-category']).toBeDefined();
      expect(actions['clear-all']).toBeDefined();
      expect(actions['suggest-foundry']).toBeDefined();
      expect(actions['import-dict']).toBeDefined();
      expect(actions['export-dict']).toBeDefined();
    });

    it('should have PARTS with main template', () => {
      expect(VocabularyManager.PARTS.main).toBeDefined();
      expect(VocabularyManager.PARTS.main.template).toContain('vocabulary-manager.hbs');
    });
  });

  // --- _prepareContext ---

  describe('_prepareContext', () => {
    it('should return context with categories', async () => {
      const ctx = await manager._prepareContext();
      expect(ctx.categories).toBeDefined();
      expect(ctx.categories).toHaveLength(5);
    });

    it('should include all category types', async () => {
      const ctx = await manager._prepareContext();
      const ids = ctx.categories.map(c => c.id);
      expect(ids).toContain('character_names');
      expect(ids).toContain('location_names');
      expect(ids).toContain('items');
      expect(ids).toContain('terms');
      expect(ids).toContain('custom');
    });

    it('should include category icons', async () => {
      const ctx = await manager._prepareContext();
      ctx.categories.forEach(cat => {
        expect(cat.icon).toBeDefined();
        expect(typeof cat.icon).toBe('string');
      });
    });

    it('should include moduleId', async () => {
      const ctx = await manager._prepareContext();
      expect(ctx.moduleId).toBe('vox-chronicle');
    });

    it('should include active category', async () => {
      manager._activeCategory = 'items';
      const ctx = await manager._prepareContext();
      expect(ctx.activeCategory).toBe('items');
    });

    it('should include total term count', async () => {
      mockDictionary.getTotalTermCount.mockReturnValue(42);
      const ctx = await manager._prepareContext();
      expect(ctx.totalTerms).toBe(42);
    });

    it('should include hasTerms flag', async () => {
      mockDictionary.getTotalTermCount.mockReturnValue(0);
      const ctx = await manager._prepareContext();
      expect(ctx.hasTerms).toBe(false);

      mockDictionary.getTotalTermCount.mockReturnValue(5);
      const ctx2 = await manager._prepareContext();
      expect(ctx2.hasTerms).toBe(true);
    });

    it('should include i18n strings', async () => {
      const ctx = await manager._prepareContext();
      expect(ctx.i18n).toBeDefined();
      expect(ctx.i18n.title).toBeDefined();
      expect(ctx.i18n.addTerm).toBeDefined();
      expect(ctx.i18n.removeTerm).toBeDefined();
      expect(ctx.i18n.clearAll).toBeDefined();
      expect(ctx.i18n.importDict).toBeDefined();
      expect(ctx.i18n.exportDict).toBeDefined();
    });

    it('should include terms from dictionary', async () => {
      mockDictionary.getAllTerms.mockReturnValue({
        character_names: ['Gandalf', 'Frodo'],
        location_names: ['Rivendell'],
        items: [],
        terms: [],
        custom: []
      });

      const ctx = await manager._prepareContext();
      const charCategory = ctx.categories.find(c => c.id === 'character_names');
      expect(charCategory.terms).toEqual(['Gandalf', 'Frodo']);
    });
  });

  // --- _onAddTerm ---

  describe('_onAddTerm', () => {
    it('should add term from input', async () => {
      const mockInput = { value: 'Gandalf' };
      const mockContainer = {
        querySelector: vi.fn(() => mockInput),
        dataset: { category: 'character_names' }
      };
      const target = {
        closest: vi.fn(() => mockContainer)
      };

      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onAddTerm({ preventDefault: vi.fn() }, target);

      expect(mockDictionary.addTerm).toHaveBeenCalledWith('character_names', 'Gandalf');
      expect(ui.notifications.info).toHaveBeenCalled();
      expect(mockInput.value).toBe('');
    });

    it('should warn when input is empty', async () => {
      const mockInput = { value: '  ' };
      const mockContainer = {
        querySelector: vi.fn(() => mockInput),
        dataset: { category: 'character_names' }
      };
      const target = {
        closest: vi.fn(() => mockContainer)
      };

      await manager._onAddTerm({ preventDefault: vi.fn() }, target);

      expect(mockDictionary.addTerm).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should warn when term already exists', async () => {
      mockDictionary.addTerm.mockReturnValue(Promise.resolve(false));

      const mockInput = { value: 'Existing' };
      const mockContainer = {
        querySelector: vi.fn(() => mockInput),
        dataset: { category: 'character_names' }
      };
      const target = { closest: vi.fn(() => mockContainer) };

      await manager._onAddTerm({ preventDefault: vi.fn() }, target);

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should handle add error', async () => {
      mockDictionary.addTerm.mockRejectedValue(new Error('add failed'));

      const mockInput = { value: 'Test' };
      const mockContainer = {
        querySelector: vi.fn(() => mockInput),
        dataset: { category: 'character_names' }
      };
      const target = { closest: vi.fn(() => mockContainer) };

      await manager._onAddTerm({ preventDefault: vi.fn() }, target);

      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should use event.currentTarget when no target provided', async () => {
      const mockInput = { value: 'Test' };
      const mockContainer = {
        querySelector: vi.fn(() => mockInput),
        dataset: { category: 'character_names' }
      };

      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onAddTerm({
        preventDefault: vi.fn(),
        currentTarget: { closest: vi.fn(() => mockContainer) }
      });

      expect(mockDictionary.addTerm).toHaveBeenCalledWith('character_names', 'Test');
    });

    it('should trim the term', async () => {
      const mockInput = { value: '  Gandalf  ' };
      const mockContainer = {
        querySelector: vi.fn(() => mockInput),
        dataset: { category: 'character_names' }
      };
      const target = { closest: vi.fn(() => mockContainer) };

      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onAddTerm({ preventDefault: vi.fn() }, target);

      expect(mockDictionary.addTerm).toHaveBeenCalledWith('character_names', 'Gandalf');
    });

    it('should warn when input value is empty string', async () => {
      const mockInput = { value: '' };
      const mockContainer = {
        querySelector: vi.fn(() => mockInput),
        dataset: { category: 'character_names' }
      };
      const target = { closest: vi.fn(() => mockContainer) };

      await manager._onAddTerm({ preventDefault: vi.fn() }, target);

      expect(ui.notifications.warn).toHaveBeenCalled();
    });
  });

  // --- _onRemoveTerm ---

  describe('_onRemoveTerm', () => {
    it('should remove term', async () => {
      const mockContainer = {
        dataset: { category: 'character_names' }
      };
      const target = {
        dataset: { term: 'Gandalf' },
        closest: vi.fn(() => mockContainer)
      };

      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onRemoveTerm({ preventDefault: vi.fn() }, target);

      expect(mockDictionary.removeTerm).toHaveBeenCalledWith('character_names', 'Gandalf');
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should not show notification if nothing removed', async () => {
      mockDictionary.removeTerm.mockReturnValue(Promise.resolve(false));

      const mockContainer = {
        dataset: { category: 'character_names' }
      };
      const target = {
        dataset: { term: 'NotExist' },
        closest: vi.fn(() => mockContainer)
      };

      await manager._onRemoveTerm({ preventDefault: vi.fn() }, target);

      expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    it('should handle removal error', async () => {
      mockDictionary.removeTerm.mockRejectedValue(new Error('remove failed'));

      const mockContainer = {
        dataset: { category: 'character_names' }
      };
      const target = {
        dataset: { term: 'Test' },
        closest: vi.fn(() => mockContainer)
      };

      await manager._onRemoveTerm({ preventDefault: vi.fn() }, target);

      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should use event.currentTarget when no target', async () => {
      const mockContainer = {
        dataset: { category: 'items' }
      };
      const mockButton = {
        dataset: { term: 'Sword' },
        closest: vi.fn(() => mockContainer)
      };

      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onRemoveTerm({
        preventDefault: vi.fn(),
        currentTarget: mockButton
      });

      expect(mockDictionary.removeTerm).toHaveBeenCalledWith('items', 'Sword');
    });
  });

  // --- _onClearCategory ---

  describe('_onClearCategory', () => {
    it('should confirm before clearing', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(false));

      const mockContainer = {
        dataset: { category: 'character_names' }
      };
      const target = { closest: vi.fn(() => mockContainer) };

      await manager._onClearCategory({ preventDefault: vi.fn() }, target);

      expect(Dialog.confirm).toHaveBeenCalled();
      expect(mockDictionary.clearCategory).not.toHaveBeenCalled();
    });

    it('should clear category when confirmed', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(true));
      vi.spyOn(manager, 'render').mockImplementation(() => {});

      const mockContainer = {
        dataset: { category: 'character_names' }
      };
      const target = { closest: vi.fn(() => mockContainer) };

      await manager._onClearCategory({ preventDefault: vi.fn() }, target);

      expect(mockDictionary.clearCategory).toHaveBeenCalledWith('character_names');
      expect(ui.notifications.info).toHaveBeenCalled();
      expect(manager.render).toHaveBeenCalled();
    });

    it('should not clear when cancelled', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(false));

      const mockContainer = {
        dataset: { category: 'items' }
      };
      const target = { closest: vi.fn(() => mockContainer) };

      await manager._onClearCategory({ preventDefault: vi.fn() }, target);

      expect(mockDictionary.clearCategory).not.toHaveBeenCalled();
    });

    it('should handle clear error', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(true));
      mockDictionary.clearCategory.mockRejectedValue(new Error('clear failed'));

      const mockContainer = {
        dataset: { category: 'character_names' }
      };
      const target = { closest: vi.fn(() => mockContainer) };

      await manager._onClearCategory({ preventDefault: vi.fn() }, target);

      expect(ui.notifications.error).toHaveBeenCalled();
    });
  });

  // --- _onClearAll ---

  describe('_onClearAll', () => {
    it('should confirm before clearing all', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(false));

      await manager._onClearAll({ preventDefault: vi.fn() });

      expect(Dialog.confirm).toHaveBeenCalled();
      expect(mockDictionary.clearAll).not.toHaveBeenCalled();
    });

    it('should clear all when confirmed', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(true));
      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onClearAll({ preventDefault: vi.fn() });

      expect(mockDictionary.clearAll).toHaveBeenCalled();
      expect(ui.notifications.info).toHaveBeenCalled();
      expect(manager.render).toHaveBeenCalled();
    });

    it('should not clear when cancelled', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(false));

      await manager._onClearAll({ preventDefault: vi.fn() });

      expect(mockDictionary.clearAll).not.toHaveBeenCalled();
    });

    it('should handle clear all error', async () => {
      Dialog.confirm = vi.fn(() => Promise.resolve(true));
      mockDictionary.clearAll.mockRejectedValue(new Error('clear all failed'));

      await manager._onClearAll({ preventDefault: vi.fn() });

      expect(ui.notifications.error).toHaveBeenCalled();
    });
  });

  // --- _onImport ---

  describe('_onImport', () => {
    /** Helper: capture the Dialog constructor data and extract the import callback */
    function captureImportDialog() {
      let capturedData = null;
      globalThis.Dialog = class Dialog {
        constructor(data) {
          capturedData = data;
        }
        render() { return this; }
        close() { return Promise.resolve(); }
        static confirm(config) { return Promise.resolve(true); }
      };
      return { getCapturedData: () => capturedData };
    }

    it('should open import dialog', async () => {
      const { getCapturedData } = captureImportDialog();
      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onImport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      expect(data).not.toBeNull();
      expect(data.buttons.import).toBeDefined();
      expect(data.buttons.cancel).toBeDefined();
    });

    it('should call importDictionary with parsed JSON and merge=true when checkbox is checked', async () => {
      const { getCapturedData } = captureImportDialog();
      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onImport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const importCallback = data.buttons.import.callback;

      // Create mock HTML element with textarea containing valid JSON and checked merge box
      const mockHtml = {
        querySelector: vi.fn((selector) => {
          if (selector === '[name="json"]') return { value: '{"character_names":["Gandalf"]}' };
          if (selector === '[name="merge"]') return { checked: true };
          return null;
        })
      };

      await importCallback(mockHtml);

      expect(mockDictionary.importDictionary).toHaveBeenCalledWith(
        '{"character_names":["Gandalf"]}',
        true
      );
      expect(ui.notifications.info).toHaveBeenCalled();
      expect(manager.render).toHaveBeenCalled();
    });

    it('should call importDictionary with merge=false when checkbox is unchecked', async () => {
      const { getCapturedData } = captureImportDialog();
      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onImport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const importCallback = data.buttons.import.callback;

      const mockHtml = {
        querySelector: vi.fn((selector) => {
          if (selector === '[name="json"]') return { value: '{"items":["Sword"]}' };
          if (selector === '[name="merge"]') return { checked: false };
          return null;
        })
      };

      await importCallback(mockHtml);

      expect(mockDictionary.importDictionary).toHaveBeenCalledWith(
        '{"items":["Sword"]}',
        false
      );
    });

    it('should show warning when textarea is empty', async () => {
      const { getCapturedData } = captureImportDialog();

      await manager._onImport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const importCallback = data.buttons.import.callback;

      const mockHtml = {
        querySelector: vi.fn((selector) => {
          if (selector === '[name="json"]') return { value: '   ' };
          if (selector === '[name="merge"]') return { checked: true };
          return null;
        })
      };

      await importCallback(mockHtml);

      expect(mockDictionary.importDictionary).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should show error notification when JSON is malformed', async () => {
      const { getCapturedData } = captureImportDialog();
      mockDictionary.importDictionary.mockRejectedValue(new Error('Invalid JSON'));

      await manager._onImport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const importCallback = data.buttons.import.callback;

      const mockHtml = {
        querySelector: vi.fn((selector) => {
          if (selector === '[name="json"]') return { value: '{not valid json' };
          if (selector === '[name="merge"]') return { checked: true };
          return null;
        })
      };

      await importCallback(mockHtml);

      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should unwrap jQuery-style html array with [0]', async () => {
      const { getCapturedData } = captureImportDialog();
      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onImport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const importCallback = data.buttons.import.callback;

      // Pass html as an array (jQuery-style)
      const innerEl = {
        querySelector: vi.fn((selector) => {
          if (selector === '[name="json"]') return { value: '{"terms":["Fireball"]}' };
          if (selector === '[name="merge"]') return { checked: true };
          return null;
        })
      };
      const jqueryHtml = [innerEl];

      await importCallback(jqueryHtml);

      expect(mockDictionary.importDictionary).toHaveBeenCalledWith(
        '{"terms":["Fireball"]}',
        true
      );
    });
  });

  // --- _onExport ---

  describe('_onExport', () => {
    /** Helper: capture the Dialog constructor data and extract the copy callback */
    function captureExportDialog() {
      let capturedData = null;
      globalThis.Dialog = class Dialog {
        constructor(data) {
          capturedData = data;
        }
        render() { return this; }
        close() { return Promise.resolve(); }
        static confirm(config) { return Promise.resolve(true); }
      };
      return { getCapturedData: () => capturedData };
    }

    it('should export dictionary and show dialog', async () => {
      captureExportDialog();

      await manager._onExport({ preventDefault: vi.fn() });

      expect(mockDictionary.exportDictionary).toHaveBeenCalled();
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should handle export error', async () => {
      mockDictionary.exportDictionary.mockImplementation(() => {
        throw new Error('export failed');
      });

      await manager._onExport({ preventDefault: vi.fn() });

      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should copy JSON to clipboard via navigator.clipboard.writeText', async () => {
      const { getCapturedData } = captureExportDialog();
      const mockWriteText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true
      });

      await manager._onExport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const copyCallback = data.buttons.copy.callback;

      const mockTextarea = { select: vi.fn() };
      const mockHtml = {
        querySelector: vi.fn(() => mockTextarea)
      };

      await copyCallback(mockHtml);

      expect(mockTextarea.select).toHaveBeenCalled();
      expect(mockWriteText).toHaveBeenCalledWith('{"character_names":["Test"]}');
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should fall back to document.execCommand when clipboard API fails', async () => {
      const { getCapturedData } = captureExportDialog();
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.reject(new Error('clipboard denied'))) },
        writable: true,
        configurable: true
      });
      const mockExecCommand = vi.fn();
      document.execCommand = mockExecCommand;

      await manager._onExport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const copyCallback = data.buttons.copy.callback;

      const mockTextarea = { select: vi.fn() };
      const mockHtml = {
        querySelector: vi.fn(() => mockTextarea)
      };

      await copyCallback(mockHtml);

      expect(mockExecCommand).toHaveBeenCalledWith('copy');
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should unwrap jQuery-style html array in copy callback', async () => {
      const { getCapturedData } = captureExportDialog();
      const mockWriteText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true
      });

      await manager._onExport({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const copyCallback = data.buttons.copy.callback;

      const innerEl = {
        querySelector: vi.fn(() => ({ select: vi.fn() }))
      };
      const jqueryHtml = [innerEl];

      await copyCallback(jqueryHtml);

      expect(innerEl.querySelector).toHaveBeenCalledWith('textarea');
      expect(mockWriteText).toHaveBeenCalled();
    });
  });

  // --- _collectFoundrySuggestions ---

  describe('_collectFoundrySuggestions', () => {
    it('should collect actor names from game.actors', () => {
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }, { name: 'Frodo' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions.character_names).toContain('Gandalf');
      expect(suggestions.character_names).toContain('Frodo');
    });

    it('should collect item names from game.items', () => {
      game.actors = { forEach: vi.fn() };
      game.items = {
        forEach: vi.fn((fn) => {
          [{ name: 'Sword' }, { name: 'Shield' }].forEach(fn);
        })
      };

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions.items).toContain('Sword');
      expect(suggestions.items).toContain('Shield');
    });

    it('should deduplicate names', () => {
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }, { name: 'Gandalf' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions.character_names.filter(n => n === 'Gandalf')).toHaveLength(1);
    });

    it('should sort names alphabetically', () => {
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Zephyr' }, { name: 'Aragorn' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions.character_names[0]).toBe('Aragorn');
      expect(suggestions.character_names[1]).toBe('Zephyr');
    });

    it('should handle missing game.actors', () => {
      game.actors = undefined;
      game.items = { forEach: vi.fn() };

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions.character_names).toEqual([]);
    });

    it('should handle missing game.items', () => {
      game.actors = { forEach: vi.fn() };
      game.items = undefined;

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions.items).toEqual([]);
    });

    it('should skip actors with empty/falsy names', () => {
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: '' }, { name: null }, { name: 'Valid' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions.character_names).toEqual(['Valid']);
    });

    it('should trim names', () => {
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: '  Gandalf  ' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions.character_names).toEqual(['Gandalf']);
    });

    it('should handle errors gracefully', () => {
      game.actors = {
        forEach: vi.fn(() => { throw new Error('actor error'); })
      };

      const suggestions = manager._collectFoundrySuggestions();

      // Should return empty suggestions, not throw
      expect(suggestions.character_names).toEqual([]);
      expect(suggestions.items).toEqual([]);
    });
  });

  // --- _onSuggestFromFoundry ---

  describe('_onSuggestFromFoundry', () => {
    /** Helper: capture the Dialog constructor data for suggest-from-foundry */
    function captureSuggestDialog() {
      let capturedData = null;
      globalThis.Dialog = class Dialog {
        constructor(data) {
          capturedData = data;
        }
        render() { return this; }
        close() { return Promise.resolve(); }
        static confirm(config) { return Promise.resolve(true); }
      };
      return { getCapturedData: () => capturedData };
    }

    it('should warn if no suggestions found', async () => {
      game.actors = undefined;
      game.items = undefined;

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should show dialog with suggestions', async () => {
      const { getCapturedData } = captureSuggestDialog();
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      const data = getCapturedData();
      expect(data).not.toBeNull();
      expect(data.buttons.add).toBeDefined();
      expect(data.buttons.cancel).toBeDefined();
    });

    it('should call addTerm for each checked non-disabled character checkbox', async () => {
      const { getCapturedData } = captureSuggestDialog();
      vi.spyOn(manager, 'render').mockImplementation(() => {});
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }, { name: 'Frodo' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const addCallback = data.buttons.add.callback;

      // Create mock HTML with two checked character checkboxes, one checked item
      const mockHtml = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === 'input[name="character"]:checked:not(:disabled)') {
            return [
              { value: 'Gandalf' },
              { value: 'Frodo' }
            ];
          }
          if (selector === 'input[name="item"]:checked:not(:disabled)') {
            return [];
          }
          return [];
        })
      };

      await addCallback(mockHtml);

      expect(mockDictionary.addTerm).toHaveBeenCalledWith('character_names', 'Gandalf');
      expect(mockDictionary.addTerm).toHaveBeenCalledWith('character_names', 'Frodo');
      expect(ui.notifications.info).toHaveBeenCalled();
      expect(manager.render).toHaveBeenCalled();
    });

    it('should call addTerm for checked item checkboxes', async () => {
      const { getCapturedData } = captureSuggestDialog();
      vi.spyOn(manager, 'render').mockImplementation(() => {});
      game.actors = { forEach: vi.fn() };
      game.items = {
        forEach: vi.fn((fn) => {
          [{ name: 'Sword' }, { name: 'Shield' }].forEach(fn);
        })
      };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const addCallback = data.buttons.add.callback;

      const mockHtml = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === 'input[name="character"]:checked:not(:disabled)') return [];
          if (selector === 'input[name="item"]:checked:not(:disabled)') {
            return [
              { value: 'Sword' },
              { value: 'Shield' }
            ];
          }
          return [];
        })
      };

      await addCallback(mockHtml);

      expect(mockDictionary.addTerm).toHaveBeenCalledWith('items', 'Sword');
      expect(mockDictionary.addTerm).toHaveBeenCalledWith('items', 'Shield');
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should show warning when no terms are selected', async () => {
      const { getCapturedData } = captureSuggestDialog();
      mockDictionary.addTerm.mockReturnValue(false);
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const addCallback = data.buttons.add.callback;

      // No checked checkboxes
      const mockHtml = {
        querySelectorAll: vi.fn(() => [])
      };

      await addCallback(mockHtml);

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should show warning when all selected terms already exist (addTerm returns false)', async () => {
      const { getCapturedData } = captureSuggestDialog();
      mockDictionary.addTerm.mockReturnValue(false);
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const addCallback = data.buttons.add.callback;

      const mockHtml = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === 'input[name="character"]:checked:not(:disabled)') {
            return [{ value: 'Gandalf' }];
          }
          return [];
        })
      };

      await addCallback(mockHtml);

      // addTerm returns false so addedCount stays 0 => warn notification
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should unwrap jQuery-style html array in add callback', async () => {
      const { getCapturedData } = captureSuggestDialog();
      vi.spyOn(manager, 'render').mockImplementation(() => {});
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      const data = getCapturedData();
      const addCallback = data.buttons.add.callback;

      const innerEl = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === 'input[name="character"]:checked:not(:disabled)') {
            return [{ value: 'Gandalf' }];
          }
          return [];
        })
      };
      const jqueryHtml = [innerEl];

      await addCallback(jqueryHtml);

      expect(innerEl.querySelectorAll).toHaveBeenCalled();
      expect(mockDictionary.addTerm).toHaveBeenCalledWith('character_names', 'Gandalf');
    });

    it('should invoke render callback to wire up select-all checkboxes', async () => {
      const { getCapturedData } = captureSuggestDialog();
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }, { name: 'Frodo' }].forEach(fn);
        })
      };
      game.items = {
        forEach: vi.fn((fn) => {
          [{ name: 'Sword' }].forEach(fn);
        })
      };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      const data = getCapturedData();
      expect(data.render).toBeDefined();

      // Build mock HTML with select-all checkboxes and individual checkboxes
      const characterCheckboxes = [
        { checked: false, disabled: false },
        { checked: false, disabled: false }
      ];
      const itemCheckboxes = [
        { checked: false, disabled: false }
      ];
      let selectAllCharsHandler = null;
      let selectAllItemsHandler = null;

      const mockEl = {
        querySelector: vi.fn((selector) => {
          if (selector === 'input[name="select-all-characters"]') {
            return {
              addEventListener: vi.fn((event, handler) => {
                selectAllCharsHandler = handler;
              })
            };
          }
          if (selector === 'input[name="select-all-items"]') {
            return {
              addEventListener: vi.fn((event, handler) => {
                selectAllItemsHandler = handler;
              })
            };
          }
          return null;
        }),
        querySelectorAll: vi.fn((selector) => {
          if (selector === 'input[name="character"]:not(:disabled)') return characterCheckboxes;
          if (selector === 'input[name="item"]:not(:disabled)') return itemCheckboxes;
          return [];
        })
      };

      // Invoke the render callback
      data.render(mockEl);

      expect(selectAllCharsHandler).not.toBeNull();
      expect(selectAllItemsHandler).not.toBeNull();

      // Simulate "select all characters" checked
      selectAllCharsHandler.call({ checked: true });
      expect(characterCheckboxes[0].checked).toBe(true);
      expect(characterCheckboxes[1].checked).toBe(true);

      // Simulate "select all characters" unchecked
      selectAllCharsHandler.call({ checked: false });
      expect(characterCheckboxes[0].checked).toBe(false);
      expect(characterCheckboxes[1].checked).toBe(false);

      // Simulate "select all items" checked
      selectAllItemsHandler.call({ checked: true });
      expect(itemCheckboxes[0].checked).toBe(true);

      // Simulate "select all items" unchecked
      selectAllItemsHandler.call({ checked: false });
      expect(itemCheckboxes[0].checked).toBe(false);
    });

    it('should handle render callback with jQuery-style html array', async () => {
      const { getCapturedData } = captureSuggestDialog();
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      const data = getCapturedData();

      const innerEl = {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      const jqueryHtml = [innerEl];

      // Should not throw when passed jQuery-style array
      expect(() => data.render(jqueryHtml)).not.toThrow();
      expect(innerEl.querySelector).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.spyOn(manager, '_collectFoundrySuggestions').mockImplementation(() => {
        throw new Error('suggest failed');
      });

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      expect(ui.notifications.error).toHaveBeenCalled();
    });
  });

  // --- _onRender ---

  describe('_onRender', () => {
    it('should attach keypress handler on term inputs', () => {
      const mockInput = { addEventListener: vi.fn() };
      const mockTab = { addEventListener: vi.fn(), dataset: { tab: 'items' } };
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.term-input') return [mockInput];
          if (selector === '.tabs .item') return [mockTab];
          return [];
        })
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement,
        configurable: true
      });

      manager._onRender({}, {});

      expect(mockInput.addEventListener).toHaveBeenCalledWith(
        'keypress',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should attach click handler on tab items', () => {
      const mockTab = { addEventListener: vi.fn(), dataset: { tab: 'items' } };
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.tabs .item') return [mockTab];
          return [];
        })
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement,
        configurable: true
      });

      manager._onRender({}, {});

      expect(mockTab.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should abort previous controller', () => {
      const mockElement = {
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement,
        configurable: true
      });

      manager._onRender({}, {});
      manager._onRender({}, {});
      // No error = success
    });

    it('should handle null element', () => {
      Object.defineProperty(manager, 'element', {
        get: () => null,
        configurable: true
      });
      expect(() => manager._onRender({}, {})).not.toThrow();
    });

    it('should invoke _onAddTerm when Enter key is pressed on term input', () => {
      let capturedKeypressHandler = null;
      const mockInput = {
        addEventListener: vi.fn((eventName, handler) => {
          if (eventName === 'keypress') capturedKeypressHandler = handler;
        })
      };
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.term-input') return [mockInput];
          return [];
        })
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement,
        configurable: true
      });

      vi.spyOn(manager, '_onAddTerm').mockImplementation(() => {});

      manager._onRender({}, {});

      expect(capturedKeypressHandler).not.toBeNull();

      // Simulate Enter keypress
      const mockEvent = {
        key: 'Enter',
        which: 13,
        preventDefault: vi.fn()
      };
      capturedKeypressHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(manager._onAddTerm).toHaveBeenCalledWith(mockEvent);
    });

    it('should not invoke _onAddTerm for non-Enter keypress', () => {
      let capturedKeypressHandler = null;
      const mockInput = {
        addEventListener: vi.fn((eventName, handler) => {
          if (eventName === 'keypress') capturedKeypressHandler = handler;
        })
      };
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.term-input') return [mockInput];
          return [];
        })
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement,
        configurable: true
      });

      vi.spyOn(manager, '_onAddTerm').mockImplementation(() => {});

      manager._onRender({}, {});

      // Simulate a non-Enter keypress (e.g., 'a')
      const mockEvent = {
        key: 'a',
        which: 65,
        preventDefault: vi.fn()
      };
      capturedKeypressHandler(mockEvent);

      expect(manager._onAddTerm).not.toHaveBeenCalled();
    });

    it('should update _activeCategory when tab is clicked', () => {
      let capturedClickHandler = null;
      const mockTab = {
        addEventListener: vi.fn((eventName, handler) => {
          if (eventName === 'click') capturedClickHandler = handler;
        }),
        dataset: { tab: 'items' }
      };
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.tabs .item') return [mockTab];
          return [];
        })
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement,
        configurable: true
      });

      manager._onRender({}, {});

      expect(capturedClickHandler).not.toBeNull();
      expect(manager._activeCategory).toBe('character_names');

      // Simulate click on the 'items' tab
      capturedClickHandler({ currentTarget: { dataset: { tab: 'items' } } });

      expect(manager._activeCategory).toBe('items');
    });

    it('should change _activeCategory to different tabs', () => {
      let capturedClickHandler = null;
      const mockTab = {
        addEventListener: vi.fn((eventName, handler) => {
          if (eventName === 'click') capturedClickHandler = handler;
        }),
        dataset: { tab: 'custom' }
      };
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.tabs .item') return [mockTab];
          return [];
        })
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement,
        configurable: true
      });

      manager._onRender({}, {});

      capturedClickHandler({ currentTarget: { dataset: { tab: 'custom' } } });
      expect(manager._activeCategory).toBe('custom');

      capturedClickHandler({ currentTarget: { dataset: { tab: 'terms' } } });
      expect(manager._activeCategory).toBe('terms');
    });
  });

  // --- close ---

  describe('close', () => {
    it('should close without error', async () => {
      await expect(manager.close()).resolves.not.toThrow();
    });

    it('should abort the listener controller when closing after render', async () => {
      // First, trigger _onRender to create the AbortController
      const mockElement = {
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement,
        configurable: true
      });

      manager._onRender({}, {});

      // Access the private #listenerController's signal indirectly:
      // After _onRender, a new AbortController is created. We can verify
      // it gets aborted by checking that a second _onRender doesn't throw
      // (the previous controller was aborted) and by tracking signal state
      // through the addEventListener calls.
      let capturedSignal = null;
      const mockInput = {
        addEventListener: vi.fn((_, __, opts) => {
          capturedSignal = opts?.signal;
        })
      };
      const mockElement2 = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.term-input') return [mockInput];
          return [];
        })
      };
      Object.defineProperty(manager, 'element', {
        get: () => mockElement2,
        configurable: true
      });

      manager._onRender({}, {});
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal.aborted).toBe(false);

      await manager.close();

      // After close, the signal from the last render should be aborted
      expect(capturedSignal.aborted).toBe(true);
    });

    it('should handle close gracefully when no render was called', async () => {
      // No _onRender called, so #listenerController is null
      await expect(manager.close()).resolves.not.toThrow();
    });
  });

  // --- Static action handlers ---

  describe('static action handlers', () => {
    it('_onAddTermAction should call _onAddTerm', async () => {
      const mockInstance = {
        _onAddTerm: vi.fn(() => Promise.resolve())
      };
      const event = {};
      const target = {};
      await VocabularyManager._onAddTermAction.call(mockInstance, event, target);
      expect(mockInstance._onAddTerm).toHaveBeenCalledWith(event, target);
    });

    it('_onRemoveTermAction should call _onRemoveTerm', async () => {
      const mockInstance = {
        _onRemoveTerm: vi.fn(() => Promise.resolve())
      };
      const event = {};
      const target = {};
      await VocabularyManager._onRemoveTermAction.call(mockInstance, event, target);
      expect(mockInstance._onRemoveTerm).toHaveBeenCalledWith(event, target);
    });

    it('_onClearCategoryAction should call _onClearCategory', async () => {
      const mockInstance = {
        _onClearCategory: vi.fn(() => Promise.resolve())
      };
      const event = {};
      const target = {};
      await VocabularyManager._onClearCategoryAction.call(mockInstance, event, target);
      expect(mockInstance._onClearCategory).toHaveBeenCalledWith(event, target);
    });

    it('_onClearAllAction should call _onClearAll', async () => {
      const mockInstance = {
        _onClearAll: vi.fn(() => Promise.resolve())
      };
      const event = {};
      await VocabularyManager._onClearAllAction.call(mockInstance, event, null);
      expect(mockInstance._onClearAll).toHaveBeenCalledWith(event);
    });

    it('_onSuggestFromFoundryAction should call _onSuggestFromFoundry', async () => {
      const mockInstance = {
        _onSuggestFromFoundry: vi.fn(() => Promise.resolve())
      };
      const event = {};
      await VocabularyManager._onSuggestFromFoundryAction.call(mockInstance, event, null);
      expect(mockInstance._onSuggestFromFoundry).toHaveBeenCalledWith(event);
    });

    it('_onImportAction should call _onImport', async () => {
      const mockInstance = {
        _onImport: vi.fn(() => Promise.resolve())
      };
      const event = {};
      await VocabularyManager._onImportAction.call(mockInstance, event, null);
      expect(mockInstance._onImport).toHaveBeenCalledWith(event);
    });

    it('_onExportAction should call _onExport', async () => {
      const mockInstance = {
        _onExport: vi.fn(() => Promise.resolve())
      };
      const event = {};
      await VocabularyManager._onExportAction.call(mockInstance, event, null);
      expect(mockInstance._onExport).toHaveBeenCalledWith(event);
    });
  });

  // --- VocabularyCategory export ---

  describe('VocabularyCategory', () => {
    it('should have all expected category constants', () => {
      expect(VocabularyCategory.CHARACTER_NAMES).toBe('character_names');
      expect(VocabularyCategory.LOCATION_NAMES).toBe('location_names');
      expect(VocabularyCategory.ITEMS).toBe('items');
      expect(VocabularyCategory.TERMS).toBe('terms');
      expect(VocabularyCategory.CUSTOM).toBe('custom');
    });
  });
});
