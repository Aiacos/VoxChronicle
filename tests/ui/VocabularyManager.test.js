/**
 * VocabularyManager Unit Tests
 *
 * Tests for the VocabularyManager UI component.
 * Covers vocabulary management, category tabs, import/export,
 * Foundry suggestions, and event handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMockApplication } from '../helpers/foundry-mock.js';

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

  // Set up Application class
  global.Application = createMockApplication();

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
 * Create mock jQuery element
 */
function createMockJQuery(selector, options = {}) {
  const element = {
    val: vi.fn(() => options.value || ''),
    data: vi.fn((key) => options.data?.[key] || ''),
    find: vi.fn(() => element),
    closest: vi.fn(() => element),
    on: vi.fn(),
    is: vi.fn(() => options.checked || false),
    each: vi.fn((callback) => {
      // Simulate iterating over collection
      if (options.collection) {
        options.collection.forEach((item, index) => callback(index, item));
      }
    })
  };
  return element;
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
    global.foundry = { utils: createMockFoundryUtils() };
    global.$ = (selector) => createMockJQuery(selector);

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

  describe('Default Options', () => {
    it('should have correct default options', () => {
      const options = VocabularyManager.defaultOptions;

      expect(options.id).toBe('vox-chronicle-vocabulary-manager');
      expect(options.template).toContain('vocabulary-manager.hbs');
      expect(options.classes).toContain('vox-chronicle');
      expect(options.classes).toContain('vocabulary-manager');
      expect(options.width).toBe(600);
      expect(options.height).toBe(600);
      expect(options.minimizable).toBe(true);
      expect(options.resizable).toBe(true);
    });

    it('should configure tabs correctly', () => {
      const options = VocabularyManager.defaultOptions;

      expect(options.tabs).toBeDefined();
      expect(options.tabs).toHaveLength(1);
      expect(options.tabs[0].navSelector).toBe('.tabs');
      expect(options.tabs[0].contentSelector).toBe('.tab-content');
      expect(options.tabs[0].initial).toBe(VocabularyCategory.CHARACTER_NAMES);
    });
  });

  describe('getData Template Data', () => {
    it('should return complete template data with categories', async () => {
      const data = await manager.getData();

      expect(data.moduleId).toBe('vox-chronicle');
      expect(data.categories).toBeDefined();
      expect(data.categories).toHaveLength(5);
      expect(data.activeCategory).toBe(VocabularyCategory.CHARACTER_NAMES);
      expect(data.totalTerms).toBe(7);
      expect(data.hasTerms).toBe(true);
    });

    it('should include all category data with terms', async () => {
      const data = await manager.getData();

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

      const data = await manager.getData();

      expect(data.totalTerms).toBe(0);
      expect(data.hasTerms).toBe(false);
    });

    it('should include localization strings', async () => {
      const data = await manager.getData();

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
      const data = await manager.getData();

      const categoryIds = data.categories.map((c) => c.id);
      expect(categoryIds).toContain(VocabularyCategory.CHARACTER_NAMES);
      expect(categoryIds).toContain(VocabularyCategory.LOCATION_NAMES);
      expect(categoryIds).toContain(VocabularyCategory.ITEMS);
      expect(categoryIds).toContain(VocabularyCategory.TERMS);
      expect(categoryIds).toContain(VocabularyCategory.CUSTOM);
    });
  });

  describe('Event Listener Activation', () => {
    it('should activate all event listeners on HTML', () => {
      const mockHtml = createMockJQuery('html');

      manager.activateListeners(mockHtml);

      expect(mockHtml.find).toHaveBeenCalledWith('.add-term-btn');
      expect(mockHtml.find).toHaveBeenCalledWith('.term-input');
      expect(mockHtml.find).toHaveBeenCalledWith('.remove-term-btn');
      expect(mockHtml.find).toHaveBeenCalledWith('.clear-category-btn');
      expect(mockHtml.find).toHaveBeenCalledWith('.clear-all-btn');
      expect(mockHtml.find).toHaveBeenCalledWith('.suggest-foundry-btn');
      expect(mockHtml.find).toHaveBeenCalledWith('.import-btn');
      expect(mockHtml.find).toHaveBeenCalledWith('.export-btn');
      expect(mockHtml.find).toHaveBeenCalledWith('.tabs .item');
    });
  });

  describe('Add Term Handler', () => {
    it('should add term successfully', async () => {
      const mockContainer = createMockJQuery('container', {
        value: 'New Character',
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockInput = createMockJQuery('input', { value: 'New Character' });
      mockContainer.find.mockReturnValue(mockInput);

      const mockButton = createMockJQuery('button');
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onAddTerm(event);

      expect(mockDictionary.addTerm).toHaveBeenCalledWith(
        VocabularyCategory.CHARACTER_NAMES,
        'New Character'
      );
      expect(mockUi.notifications.info).toHaveBeenCalled();
      expect(mockInput.val).toHaveBeenCalledWith('');
    });

    it('should warn if term is empty', async () => {
      const mockContainer = createMockJQuery('container', {
        value: '',
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockInput = createMockJQuery('input', { value: '' });
      mockContainer.find.mockReturnValue(mockInput);

      const mockButton = createMockJQuery('button');
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onAddTerm(event);

      expect(mockDictionary.addTerm).not.toHaveBeenCalled();
      expect(mockUi.notifications.warn).toHaveBeenCalled();
    });

    it('should warn if term already exists', async () => {
      mockDictionary.addTerm.mockResolvedValue(false);

      const mockContainer = createMockJQuery('container', {
        value: 'Existing Term',
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockInput = createMockJQuery('input', { value: 'Existing Term' });
      mockContainer.find.mockReturnValue(mockInput);

      const mockButton = createMockJQuery('button');
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onAddTerm(event);

      expect(mockUi.notifications.warn).toHaveBeenCalled();
    });

    it('should handle add term errors', async () => {
      mockDictionary.addTerm.mockRejectedValue(new Error('Add failed'));

      const mockContainer = createMockJQuery('container', {
        value: 'Test Term',
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockInput = createMockJQuery('input', { value: 'Test Term' });
      mockContainer.find.mockReturnValue(mockInput);

      const mockButton = createMockJQuery('button');
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onAddTerm(event);

      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('Remove Term Handler', () => {
    it('should remove term successfully', async () => {
      const mockContainer = createMockJQuery('container', {
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockButton = createMockJQuery('button', {
        data: { term: 'Gandalf' }
      });
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onRemoveTerm(event);

      expect(mockDictionary.removeTerm).toHaveBeenCalledWith(
        VocabularyCategory.CHARACTER_NAMES,
        'Gandalf'
      );
      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should handle remove term errors', async () => {
      mockDictionary.removeTerm.mockRejectedValue(new Error('Remove failed'));

      const mockContainer = createMockJQuery('container', {
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockButton = createMockJQuery('button', {
        data: { term: 'Gandalf' }
      });
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onRemoveTerm(event);

      expect(mockUi.notifications.error).toHaveBeenCalled();
    });
  });

  describe('Clear Category Handler', () => {
    it('should clear category after confirmation', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(true);

      const mockContainer = createMockJQuery('container', {
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockButton = createMockJQuery('button');
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onClearCategory(event);

      expect(global.Dialog.confirm).toHaveBeenCalled();
      expect(mockDictionary.clearCategory).toHaveBeenCalledWith(VocabularyCategory.CHARACTER_NAMES);
      expect(mockUi.notifications.info).toHaveBeenCalled();
    });

    it('should not clear category if user cancels', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(false);

      const mockContainer = createMockJQuery('container', {
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockButton = createMockJQuery('button');
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onClearCategory(event);

      expect(mockDictionary.clearCategory).not.toHaveBeenCalled();
    });

    it('should handle clear category errors', async () => {
      global.Dialog.confirm = vi.fn().mockResolvedValue(true);
      mockDictionary.clearCategory.mockRejectedValue(new Error('Clear failed'));

      const mockContainer = createMockJQuery('container', {
        data: { category: VocabularyCategory.CHARACTER_NAMES }
      });

      const mockButton = createMockJQuery('button');
      mockButton.closest.mockReturnValue(mockContainer);

      const event = {
        preventDefault: vi.fn(),
        currentTarget: {}
      };

      global.$ = vi.fn((selector) => {
        if (selector === event.currentTarget) return mockButton;
        return createMockJQuery(selector);
      });

      await manager._onClearCategory(event);

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

  describe('Active Category Tracking', () => {
    it('should track active category from tab clicks', () => {
      const mockHtml = createMockJQuery('html');
      const tabClickHandler = vi.fn();

      mockHtml.find.mockImplementation((selector) => {
        if (selector === '.tabs .item') {
          const element = createMockJQuery(selector);
          element.on.mockImplementation((event, handler) => {
            tabClickHandler.mockImplementation(handler);
          });
          return element;
        }
        return createMockJQuery(selector);
      });

      manager.activateListeners(mockHtml);

      // Simulate tab click
      const clickEvent = {
        currentTarget: {
          dataset: { tab: VocabularyCategory.ITEMS }
        }
      };

      tabClickHandler(clickEvent);

      expect(manager._activeCategory).toBe(VocabularyCategory.ITEMS);
    });
  });
});
