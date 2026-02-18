/**
 * VocabularyManager Unit Tests
 *
 * Tests for the VocabularyManager UI component (ApplicationV2 version).
 * Covers vocabulary management, category tabs, import/export,
 * Foundry suggestions, and event handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMockApplicationV2, createMockHandlebarsApplicationMixin } from '../helpers/foundry-mock.js';

// Mock Logger before importing VocabularyManager
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

// Mock VocabularyDictionary
const mockDictionary = {
  getAllTerms: vi.fn(),
  getTotalTermCount: vi.fn(),
  addTerm: vi.fn(),
  removeTerm: vi.fn(),
  clearCategory: vi.fn(),
  clearAll: vi.fn(),
  importDictionary: vi.fn(),
  exportDictionary: vi.fn(),
  hasTerm: vi.fn()
};

vi.mock('../../scripts/core/VocabularyDictionary.mjs', () => ({
  VocabularyDictionary: vi.fn(() => mockDictionary),
  VocabularyCategory: {
    CHARACTER_NAMES: 'character_names',
    LOCATION_NAMES: 'location_names',
    ITEMS: 'items',
    TERMS: 'terms',
    CUSTOM: 'custom'
  }
}));

// Set up DOM and globals before any test runs
setupEnvironment();

function setupEnvironment() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  // Set up ApplicationV2 and HandlebarsApplicationMixin (must be on foundry.applications.api)
  const MockAppV2 = createMockApplicationV2();
  const MockHAM = createMockHandlebarsApplicationMixin();
  global.ApplicationV2 = MockAppV2;
  global.HandlebarsApplicationMixin = MockHAM;
  global.foundry = {
    utils: {
      mergeObject: (original, other) => ({ ...original, ...other }),
      deepClone: (obj) => JSON.parse(JSON.stringify(obj))
    },
    applications: { api: { ApplicationV2: MockAppV2, HandlebarsApplicationMixin: MockHAM } }
  };

  // Set up Dialog class
  global.Dialog = class Dialog {
    constructor(options) {
      this.options = options;
    }

    render() {
      return this;
    }

    static confirm(options) {
      // Return true by default for confirmations
      if (options.yes) {
        return Promise.resolve(options.yes());
      }
      return Promise.resolve(true);
    }
  };

  // Set up navigator.clipboard
  global.navigator = {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined)
    }
  };

  // Set up document.execCommand
  global.document.execCommand = vi.fn();
}

// Import after environment is set up
const { VocabularyManager } = await import('../../scripts/ui/VocabularyManager.mjs');
const { VocabularyCategory } = await import('../../scripts/core/VocabularyDictionary.mjs');

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
    actors: {
      forEach: vi.fn()
    },
    items: {
      forEach: vi.fn()
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
 * Create a mock DOM element tree for VocabularyManager category content
 * @param {object} options - Options for the mock element
 * @param {string} options.category - The category ID
 * @param {string} [options.inputValue] - Value of the term input
 * @param {string} [options.term] - Term value for the button dataset
 * @returns {HTMLElement} Container element
 */
function createMockCategoryElement(options = {}) {
  const container = document.createElement('div');
  container.className = 'category-content';
  container.dataset.category = options.category || 'character_names';

  if (options.inputValue !== undefined) {
    const input = document.createElement('input');
    input.className = 'term-input';
    input.value = options.inputValue;
    container.appendChild(input);
  }

  return container;
}

describe('VocabularyManager', () => {
  let manager;
  let mockGame;
  let mockUi;

  beforeEach(() => {
    // Reset mock call history
    mockDictionary.getAllTerms.mockClear();
    mockDictionary.getTotalTermCount.mockClear();
    mockDictionary.addTerm.mockClear();
    mockDictionary.removeTerm.mockClear();
    mockDictionary.clearCategory.mockClear();
    mockDictionary.clearAll.mockClear();
    mockDictionary.importDictionary.mockClear();
    mockDictionary.exportDictionary.mockClear();
    mockDictionary.hasTerm.mockClear();

    // Set up default mock return values
    mockDictionary.getAllTerms.mockReturnValue({
      character_names: ['Gandalf', 'Frodo'],
      location_names: ['Rivendell', 'Mordor'],
      items: ['One Ring', 'Sting'],
      terms: ['Fireball', 'Magic Missile'],
      custom: ['Custom Term']
    });
    mockDictionary.getTotalTermCount.mockReturnValue(7);
    mockDictionary.addTerm.mockResolvedValue(true);
    mockDictionary.removeTerm.mockResolvedValue(true);
    mockDictionary.clearCategory.mockResolvedValue(5);
    mockDictionary.clearAll.mockResolvedValue(20);
    mockDictionary.importDictionary.mockResolvedValue({ added: 10, skipped: 2, total: 12 });
    mockDictionary.exportDictionary.mockReturnValue('{"character_names":[],"location_names":[]}');
    mockDictionary.hasTerm.mockReturnValue(false);

    // Set up mock game and ui
    mockGame = createMockGame();
    mockUi = { notifications: createMockNotifications() };

    // Set up global objects
    global.game = mockGame;
    global.ui = mockUi;
    global.foundry = {
      utils: createMockFoundryUtils(),
      applications: { api: { ApplicationV2: global.ApplicationV2, HandlebarsApplicationMixin: global.HandlebarsApplicationMixin } }
    };

    // Create instance
    manager = new VocabularyManager();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with VocabularyDictionary instance', () => {
      expect(manager._dictionary).toBeDefined();
      expect(manager._dictionary).toBe(mockDictionary);
    });

    it('should initialize with default active category', () => {
      expect(manager._activeCategory).toBe(VocabularyCategory.CHARACTER_NAMES);
    });

    it('should create logger instance', () => {
      expect(manager._logger).toBeDefined();
      expect(manager._logger.debug).toBeDefined();
    });
  });

  describe('DEFAULT_OPTIONS', () => {
    it('should have correct options', () => {
      const options = VocabularyManager.DEFAULT_OPTIONS;

      expect(options.id).toBe('vox-chronicle-vocabulary-manager');
      expect(options.classes).toContain('vox-chronicle');
      expect(options.classes).toContain('vocabulary-manager');
      expect(options.position.width).toBe(600);
      expect(options.position.height).toBe(600);
      expect(options.window.minimizable).toBe(true);
      expect(options.window.resizable).toBe(true);
    });

    it('should have localized window title key', () => {
      const options = VocabularyManager.DEFAULT_OPTIONS;

      expect(options.window.title).toBe('VOXCHRONICLE.Vocabulary.Title');
    });

    it('should define all action handlers', () => {
      const options = VocabularyManager.DEFAULT_OPTIONS;

      expect(options.actions['add-term']).toBeDefined();
      expect(options.actions['remove-term']).toBeDefined();
      expect(options.actions['clear-category']).toBeDefined();
      expect(options.actions['clear-all']).toBeDefined();
      expect(options.actions['suggest-foundry']).toBeDefined();
      expect(options.actions['import-dict']).toBeDefined();
      expect(options.actions['export-dict']).toBeDefined();
    });
  });

  describe('PARTS', () => {
    it('should define main template part', () => {
      expect(VocabularyManager.PARTS).toBeDefined();
      expect(VocabularyManager.PARTS.main).toBeDefined();
      expect(VocabularyManager.PARTS.main.template).toContain('vocabulary-manager.hbs');
    });
  });

  describe('_prepareContext Template Data', () => {
    it('should return complete template data with categories', async () => {
      const data = await manager._prepareContext();

      expect(data.moduleId).toBe('vox-chronicle');
      expect(data.categories).toBeDefined();
      expect(data.categories).toHaveLength(5);
      expect(data.activeCategory).toBe(VocabularyCategory.CHARACTER_NAMES);
      expect(data.totalTerms).toBe(7);
      expect(data.hasTerms).toBe(true);
    });

    it('should include all category data with terms', async () => {
      const data = await manager._prepareContext();

      const characterCategory = data.categories.find(
        (c) => c.id === VocabularyCategory.CHARACTER_NAMES
      );
      expect(characterCategory).toBeDefined();
      expect(characterCategory.label).toBeDefined();
      expect(characterCategory.terms).toEqual(['Gandalf', 'Frodo']);
      expect(characterCategory.icon).toBe('fa-user');
      expect(characterCategory.description).toBeDefined();
    });

    it('should handle empty vocabulary', async () => {
      mockDictionary.getAllTerms.mockReturnValue({
        character_names: [],
        location_names: [],
        items: [],
        terms: [],
        custom: []
      });
      mockDictionary.getTotalTermCount.mockReturnValue(0);

      const data = await manager._prepareContext();

      expect(data.totalTerms).toBe(0);
      expect(data.hasTerms).toBe(false);
    });

    it('should include localization strings', async () => {
      const data = await manager._prepareContext();

      expect(data.i18n).toBeDefined();
      expect(data.i18n.title).toBeDefined();
      expect(data.i18n.addTerm).toBeDefined();
      expect(data.i18n.removeTerm).toBeDefined();
      expect(data.i18n.clearCategory).toBeDefined();
      expect(data.i18n.clearAll).toBeDefined();
      expect(data.i18n.suggestFoundry).toBeDefined();
      expect(data.i18n.importDict).toBeDefined();
      expect(data.i18n.exportDict).toBeDefined();
    });

    it('should include all five vocabulary categories', async () => {
      const data = await manager._prepareContext();

      const categoryIds = data.categories.map((c) => c.id);
      expect(categoryIds).toContain(VocabularyCategory.CHARACTER_NAMES);
      expect(categoryIds).toContain(VocabularyCategory.LOCATION_NAMES);
      expect(categoryIds).toContain(VocabularyCategory.ITEMS);
      expect(categoryIds).toContain(VocabularyCategory.TERMS);
      expect(categoryIds).toContain(VocabularyCategory.CUSTOM);
    });
  });

  describe('_onRender Event Binding', () => {
    it('should bind keypress on term inputs and click on tab items', () => {
      const mockElement = document.createElement('div');

      // Create a term input
      const input = document.createElement('input');
      input.className = 'term-input';
      mockElement.appendChild(input);

      // Create a tab nav with item
      const nav = document.createElement('nav');
      nav.className = 'tabs';
      const tabItem = document.createElement('a');
      tabItem.className = 'item';
      tabItem.dataset.tab = 'items';
      nav.appendChild(tabItem);
      mockElement.appendChild(nav);

      manager._element = mockElement;

      const inputSpy = vi.spyOn(input, 'addEventListener');
      const tabSpy = vi.spyOn(tabItem, 'addEventListener');

      manager._onRender({}, {});

      expect(inputSpy).toHaveBeenCalledWith('keypress', expect.any(Function));
      expect(tabSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should track active category on tab click', () => {
      const mockElement = document.createElement('div');
      const nav = document.createElement('nav');
      nav.className = 'tabs';
      const tabItem = document.createElement('a');
      tabItem.className = 'item';
      tabItem.dataset.tab = 'items';
      nav.appendChild(tabItem);
      mockElement.appendChild(nav);

      manager._element = mockElement;
      manager._onRender({}, {});

      // Simulate tab click
      tabItem.click();

      expect(manager._activeCategory).toBe('items');
    });
  });

  describe('Add Term Handler', () => {
    it('should add term successfully via action target', async () => {
      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES,
        inputValue: 'New Character'
      });

      // Create button inside container
      const button = document.createElement('button');
      button.dataset.action = 'add-term';
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onAddTerm(event, button);

      expect(mockDictionary.addTerm).toHaveBeenCalledWith(
        VocabularyCategory.CHARACTER_NAMES,
        'New Character'
      );
      expect(mockUi.notifications.info).toHaveBeenCalled();
      // Input should be cleared
      expect(container.querySelector('.term-input').value).toBe('');
    });

    it('should warn if term is empty', async () => {
      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES,
        inputValue: ''
      });

      const button = document.createElement('button');
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onAddTerm(event, button);

      expect(mockDictionary.addTerm).not.toHaveBeenCalled();
      expect(mockUi.notifications.warn).toHaveBeenCalled();
    });

    it('should warn if term already exists', async () => {
      mockDictionary.addTerm.mockResolvedValue(false);

      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES,
        inputValue: 'Existing Term'
      });

      const button = document.createElement('button');
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onAddTerm(event, button);

      expect(mockUi.notifications.warn).toHaveBeenCalled();
    });

    it('should handle add term errors', async () => {
      mockDictionary.addTerm.mockRejectedValue(new Error('Add failed'));

      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES,
        inputValue: 'Test Term'
      });

      const button = document.createElement('button');
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onAddTerm(event, button);

      expect(mockUi.notifications.error).toHaveBeenCalled();
    });

    it('should add term via Enter keypress (event.currentTarget fallback)', async () => {
      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES,
        inputValue: 'Keypress Term'
      });

      const input = container.querySelector('.term-input');

      const event = {
        preventDefault: vi.fn(),
        currentTarget: input
      };

      await manager._onAddTerm(event);

      expect(mockDictionary.addTerm).toHaveBeenCalledWith(
        VocabularyCategory.CHARACTER_NAMES,
        'Keypress Term'
      );
    });
  });

  describe('Remove Term Handler', () => {
    it('should remove term successfully', async () => {
      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES
      });

      const button = document.createElement('button');
      button.dataset.term = 'Gandalf';
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onRemoveTerm(event, button);

      expect(mockDictionary.removeTerm).toHaveBeenCalledWith(
        VocabularyCategory.CHARACTER_NAMES,
        'Gandalf'
      );
      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should handle remove term errors', async () => {
      mockDictionary.removeTerm.mockRejectedValue(new Error('Remove failed'));

      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES
      });

      const button = document.createElement('button');
      button.dataset.term = 'Gandalf';
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onRemoveTerm(event, button);

      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('Clear Category Handler', () => {
    it('should clear category after confirmation', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(true);

      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES
      });

      const button = document.createElement('button');
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onClearCategory(event, button);

      expect(global.Dialog.confirm).toHaveBeenCalled();
      expect(mockDictionary.clearCategory).toHaveBeenCalledWith(VocabularyCategory.CHARACTER_NAMES);
      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should not clear category if user cancels', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(false);

      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES
      });

      const button = document.createElement('button');
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onClearCategory(event, button);

      expect(mockDictionary.clearCategory).not.toHaveBeenCalled();
    });

    it('should handle clear category errors', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(true);
      mockDictionary.clearCategory.mockRejectedValue(new Error('Clear failed'));

      const container = createMockCategoryElement({
        category: VocabularyCategory.CHARACTER_NAMES
      });

      const button = document.createElement('button');
      container.appendChild(button);

      const event = { preventDefault: vi.fn() };

      await manager._onClearCategory(event, button);

      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('Clear All Handler', () => {
    it('should clear all terms after confirmation', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(true);

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onClearAll(event);

      expect(global.Dialog.confirm).toHaveBeenCalled();
      expect(mockDictionary.clearAll).toHaveBeenCalled();
      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should not clear all if user cancels', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(false);

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onClearAll(event);

      expect(mockDictionary.clearAll).not.toHaveBeenCalled();
    });

    it('should handle clear all errors', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(true);
      mockDictionary.clearAll.mockRejectedValue(new Error('Clear all failed'));

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onClearAll(event);

      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('Import Dictionary Handler', () => {
    it('should create import dialog', async () => {
      const renderSpy = vi.spyOn(Dialog.prototype, 'render');

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onImport(event);

      expect(renderSpy).toHaveBeenCalled();
    });
  });

  describe('Export Dictionary Handler', () => {
    it('should export dictionary and create dialog', async () => {
      const renderSpy = vi.spyOn(Dialog.prototype, 'render');

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onExport(event);

      expect(mockDictionary.exportDictionary).toHaveBeenCalled();
      expect(renderSpy).toHaveBeenCalled();
      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should handle export errors', async () => {
      mockDictionary.exportDictionary.mockImplementation(() => {
        throw new Error('Export failed');
      });

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onExport(event);

      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('Collect Foundry Suggestions', () => {
    it('should collect actor names and items from Foundry', () => {
      const mockActors = [{ name: 'Goblin' }, { name: 'Orc' }, { name: 'Troll' }];

      const mockItems = [{ name: 'Longsword' }, { name: 'Healing Potion' }, { name: 'Shield' }];

      mockGame.actors.forEach.mockImplementation((callback) => {
        mockActors.forEach(callback);
      });

      mockGame.items.forEach.mockImplementation((callback) => {
        mockItems.forEach(callback);
      });

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toHaveLength(3);
      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toContain('Goblin');
      expect(suggestions[VocabularyCategory.ITEMS]).toHaveLength(3);
      expect(suggestions[VocabularyCategory.ITEMS]).toContain('Longsword');
    });

    it('should remove duplicate suggestions', () => {
      const mockActors = [{ name: 'Goblin' }, { name: 'Goblin' }, { name: 'Orc' }];

      mockGame.actors.forEach.mockImplementation((callback) => {
        mockActors.forEach(callback);
      });

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toHaveLength(2);
      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toContain('Goblin');
      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toContain('Orc');
    });

    it('should filter out empty names', () => {
      const mockActors = [{ name: 'Goblin' }, { name: '' }, { name: '   ' }, { name: 'Orc' }];

      mockGame.actors.forEach.mockImplementation((callback) => {
        mockActors.forEach(callback);
      });

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toHaveLength(2);
      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).not.toContain('');
    });

    it('should sort suggestions alphabetically', () => {
      const mockActors = [{ name: 'Zebra' }, { name: 'Apple' }, { name: 'Monkey' }];

      mockGame.actors.forEach.mockImplementation((callback) => {
        mockActors.forEach(callback);
      });

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toEqual(['Apple', 'Monkey', 'Zebra']);
    });

    it('should handle missing game.actors gracefully', () => {
      mockGame.actors = undefined;

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toEqual([]);
      expect(suggestions[VocabularyCategory.ITEMS]).toEqual([]);
    });

    it('should handle errors gracefully', () => {
      mockGame.actors.forEach.mockImplementation(() => {
        throw new Error('Foundry error');
      });

      const suggestions = manager._collectFoundrySuggestions();

      expect(suggestions[VocabularyCategory.CHARACTER_NAMES]).toEqual([]);
    });
  });

  describe('Suggest From Foundry Handler', () => {
    it('should show suggestions dialog when terms are found', async () => {
      const mockActors = [{ name: 'Goblin' }, { name: 'Orc' }];

      mockGame.actors.forEach.mockImplementation((callback) => {
        mockActors.forEach(callback);
      });

      mockGame.items.forEach.mockImplementation(() => {});

      const renderSpy = vi.spyOn(Dialog.prototype, 'render');

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onSuggestFromFoundry(event);

      expect(renderSpy).toHaveBeenCalled();
    });

    it('should warn if no suggestions are found', async () => {
      mockGame.actors.forEach.mockImplementation(() => {});
      mockGame.items.forEach.mockImplementation(() => {});

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onSuggestFromFoundry(event);

      expect(mockUi.notifications.warn).toHaveBeenCalled();
    });

    it('should handle errors during suggestion collection', async () => {
      mockGame.actors.forEach.mockImplementation(() => {
        throw new Error('Collection failed');
      });

      const event = {
        preventDefault: vi.fn()
      };

      await manager._onSuggestFromFoundry(event);

      // When collection fails, it returns empty results which triggers the "no suggestions" warning
      expect(mockUi.notifications.warn).toHaveBeenCalled();
    });
  });

  describe('Static Action Handlers', () => {
    it('should dispatch add-term action to instance', async () => {
      manager._onAddTerm = vi.fn();
      const event = { preventDefault: vi.fn() };
      const target = { dataset: { action: 'add-term' } };

      await VocabularyManager._onAddTermAction.call(manager, event, target);

      expect(manager._onAddTerm).toHaveBeenCalledWith(event, target);
    });

    it('should dispatch remove-term action to instance', async () => {
      manager._onRemoveTerm = vi.fn();
      const event = { preventDefault: vi.fn() };
      const target = { dataset: { action: 'remove-term', term: 'Gandalf' } };

      await VocabularyManager._onRemoveTermAction.call(manager, event, target);

      expect(manager._onRemoveTerm).toHaveBeenCalledWith(event, target);
    });

    it('should dispatch clear-category action to instance', async () => {
      manager._onClearCategory = vi.fn();
      const event = { preventDefault: vi.fn() };
      const target = { dataset: { action: 'clear-category' } };

      await VocabularyManager._onClearCategoryAction.call(manager, event, target);

      expect(manager._onClearCategory).toHaveBeenCalledWith(event, target);
    });

    it('should dispatch clear-all action to instance', async () => {
      manager._onClearAll = vi.fn();
      const event = { preventDefault: vi.fn() };

      await VocabularyManager._onClearAllAction.call(manager, event, null);

      expect(manager._onClearAll).toHaveBeenCalledWith(event);
    });

    it('should dispatch suggest-foundry action to instance', async () => {
      manager._onSuggestFromFoundry = vi.fn();
      const event = { preventDefault: vi.fn() };

      await VocabularyManager._onSuggestFromFoundryAction.call(manager, event, null);

      expect(manager._onSuggestFromFoundry).toHaveBeenCalledWith(event);
    });

    it('should dispatch import-dict action to instance', async () => {
      manager._onImport = vi.fn();
      const event = { preventDefault: vi.fn() };

      await VocabularyManager._onImportAction.call(manager, event, null);

      expect(manager._onImport).toHaveBeenCalledWith(event);
    });

    it('should dispatch export-dict action to instance', async () => {
      manager._onExport = vi.fn();
      const event = { preventDefault: vi.fn() };

      await VocabularyManager._onExportAction.call(manager, event, null);

      expect(manager._onExport).toHaveBeenCalledWith(event);
    });
  });

  describe('Active Category Tracking', () => {
    it('should update active category when tab is clicked', () => {
      const mockElement = document.createElement('div');
      const nav = document.createElement('nav');
      nav.className = 'tabs';
      const tabItem = document.createElement('a');
      tabItem.className = 'item';
      tabItem.dataset.tab = VocabularyCategory.ITEMS;
      nav.appendChild(tabItem);
      mockElement.appendChild(nav);

      manager._element = mockElement;
      manager._onRender({}, {});

      // Simulate tab click
      tabItem.click();

      expect(manager._activeCategory).toBe(VocabularyCategory.ITEMS);
    });
  });
});
