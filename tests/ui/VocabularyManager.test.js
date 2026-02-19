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
    it('should open import dialog', async () => {
      vi.spyOn(manager, 'render').mockImplementation(() => {});

      await manager._onImport({ preventDefault: vi.fn() });

      // Dialog constructor should have been called (global mock)
      // The Dialog mock creates a dialog and calls render(true)
      // We just verify no error was thrown
    });
  });

  // --- _onExport ---

  describe('_onExport', () => {
    it('should export dictionary and show dialog', async () => {
      vi.spyOn(manager, 'render').mockImplementation(() => {});

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
    it('should warn if no suggestions found', async () => {
      game.actors = undefined;
      game.items = undefined;

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should show dialog with suggestions', async () => {
      game.actors = {
        forEach: vi.fn((fn) => {
          [{ name: 'Gandalf' }].forEach(fn);
        })
      };
      game.items = { forEach: vi.fn() };

      await manager._onSuggestFromFoundry({ preventDefault: vi.fn() });

      // Dialog was created (the global mock handles this)
      // No error means success
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
  });

  // --- close ---

  describe('close', () => {
    it('should close without error', async () => {
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
