/**
 * Foundry VTT Mock Helpers
 *
 * Provides utilities for mocking Foundry VTT API objects in tests.
 * These mocks enable testing of VoxChronicle module code that depends
 * on the Foundry VTT game object and utilities.
 *
 * @module tests/helpers/foundry-mock
 */

import { vi } from 'vitest';

/**
 * Creates a mock game.settings object with register, get, and set methods
 *
 * @param {Object} initialSettings - Initial settings to populate (key-value pairs)
 * @returns {Object} Mock settings object with vi.fn() methods
 *
 * @example
 * const settings = createMockSettings({
 *   'vox-chronicle.openaiApiKey': 'test-key-123',
 *   'vox-chronicle.kankaCampaignId': '123'
 * });
 */
export function createMockSettings(initialSettings = {}) {
  const settingsStore = new Map(Object.entries(initialSettings));

  return {
    register: vi.fn((module, key, config) => {
      // Store the full key for retrieval
      const fullKey = `${module}.${key}`;
      if (config.default !== undefined && !settingsStore.has(fullKey)) {
        settingsStore.set(fullKey, config.default);
      }
    }),

    get: vi.fn((module, key) => {
      const fullKey = `${module}.${key}`;
      return settingsStore.get(fullKey);
    }),

    set: vi.fn((module, key, value) => {
      const fullKey = `${module}.${key}`;
      settingsStore.set(fullKey, value);
      return Promise.resolve();
    })
  };
}

/**
 * Creates a mock game.i18n object for localization
 *
 * @param {Object} translations - Optional translation map (key -> value)
 * @returns {Object} Mock i18n object with localize and format methods
 *
 * @example
 * const i18n = createMockI18n({
 *   'VOXCHRONICLE.Error.Message': 'Error: {error}'
 * });
 */
export function createMockI18n(translations = {}) {
  return {
    localize: vi.fn((key) => {
      return translations[key] || key;
    }),

    format: vi.fn((key, data) => {
      let translation = translations[key] || key;
      // Simple template replacement: {var} -> value
      if (data) {
        Object.entries(data).forEach(([varName, value]) => {
          translation = translation.replace(`{${varName}}`, value);
        });
      }
      return translation;
    }),

    has: vi.fn((key) => {
      return key in translations;
    })
  };
}

/**
 * Creates a mock game.user object
 *
 * @param {Object} options - User options
 * @param {string} options.id - User ID
 * @param {string} options.name - User name
 * @param {boolean} options.isGM - Whether user is a GM
 * @param {number} options.role - User role (0-4)
 * @returns {Object} Mock user object
 */
export function createMockUser(options = {}) {
  return {
    id: options.id || 'user-123',
    name: options.name || 'Test User',
    isGM: options.isGM || false,
    role: options.role || 1, // 1 = PLAYER, 4 = GAMEMASTER
    _id: options.id || 'user-123'
  };
}

/**
 * Creates a mock game.users collection
 *
 * @param {Array<Object>} users - Array of user objects
 * @returns {Object} Mock users collection
 */
export function createMockUsers(users = []) {
  const usersMap = new Map(users.map(u => [u.id, u]));

  return {
    get: vi.fn((id) => usersMap.get(id)),
    find: vi.fn((predicate) => Array.from(usersMap.values()).find(predicate)),
    filter: vi.fn((predicate) => Array.from(usersMap.values()).filter(predicate)),
    map: vi.fn((callback) => Array.from(usersMap.values()).map(callback)),
    forEach: vi.fn((callback) => Array.from(usersMap.values()).forEach(callback)),
    size: usersMap.size,
    contents: Array.from(usersMap.values())
  };
}

/**
 * Creates a mock foundry.utils object
 *
 * @returns {Object} Mock foundry.utils with common utility methods
 */
export function createMockFoundryUtils() {
  return {
    mergeObject: vi.fn((original, other, options = {}) => {
      // Simple deep merge implementation for testing
      const result = { ...original };
      for (const [key, value] of Object.entries(other)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = createMockFoundryUtils().mergeObject(result[key] || {}, value, options);
        } else {
          result[key] = value;
        }
      }
      return result;
    }),

    deepClone: vi.fn((obj) => {
      return JSON.parse(JSON.stringify(obj));
    }),

    duplicate: vi.fn((obj) => {
      return JSON.parse(JSON.stringify(obj));
    }),

    isObjectEmpty: vi.fn((obj) => {
      return Object.keys(obj).length === 0;
    }),

    randomID: vi.fn(() => {
      return Math.random().toString(36).substring(2, 18);
    })
  };
}

/**
 * Creates a mock Application class for Foundry VTT
 *
 * @returns {Class} Mock Application class
 */
export function createMockApplication() {
  class MockApplication {
    constructor(options = {}) {
      this.options = { ...this.constructor.defaultOptions, ...options };
      this.rendered = false;
      this.element = null;
    }

    static get defaultOptions() {
      return {
        id: 'mock-app',
        classes: [],
        template: 'mock-template.hbs',
        width: 400,
        height: 'auto',
        minimizable: true,
        resizable: false,
        popOut: true
      };
    }

    getData() {
      return {};
    }

    render(force = false) {
      this.rendered = true;
      return this;
    }

    close() {
      this.rendered = false;
      return Promise.resolve();
    }

    activateListeners(html) {
      // Override in subclasses
    }

    async _render(force = false, options = {}) {
      const data = this.getData();
      this.rendered = true;
      return this;
    }
  }

  return MockApplication;
}

/**
 * Creates a mock game.socket object for WebSocket communication
 *
 * @returns {Object} Mock socket object
 */
export function createMockSocket() {
  return {
    emit: vi.fn((event, data) => {
      return Promise.resolve();
    }),

    on: vi.fn((event, callback) => {
      // Store callback for potential testing
    }),

    off: vi.fn((event, callback) => {
      // Remove callback
    })
  };
}

/**
 * Creates a complete mock game object with all common properties
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.settings - Initial settings
 * @param {Object} options.translations - Translation map
 * @param {Object} options.user - Current user
 * @param {Array<Object>} options.users - All users
 * @returns {Object} Complete mock game object
 *
 * @example
 * const game = createMockGame({
 *   settings: { 'vox-chronicle.openaiApiKey': 'test-key' },
 *   translations: { 'VOXCHRONICLE.Error.Message': 'Error occurred' },
 *   user: { id: 'gm-1', name: 'Game Master', isGM: true }
 * });
 */
export function createMockGame(options = {}) {
  const user = options.user ? createMockUser(options.user) : createMockUser({ isGM: true });
  const users = options.users || [user];

  return {
    settings: createMockSettings(options.settings || {}),
    i18n: createMockI18n(options.translations || {}),
    user: user,
    users: createMockUsers(users),
    socket: createMockSocket(),
    ready: true,
    data: {
      version: '11.0.0',
      system: 'test-system'
    }
  };
}

/**
 * Sets up global Foundry VTT mocks for testing
 * Call this in beforeEach() to ensure clean test isolation
 *
 * @param {Object} options - Configuration options (same as createMockGame)
 * @returns {Object} The created mock objects { game, foundry }
 *
 * @example
 * beforeEach(() => {
 *   setupFoundryMocks({
 *     settings: { 'vox-chronicle.openaiApiKey': 'test-key' }
 *   });
 * });
 */
export function setupFoundryMocks(options = {}) {
  const game = createMockGame(options);
  const foundry = {
    utils: createMockFoundryUtils()
  };

  // Set globals
  globalThis.game = game;
  globalThis.foundry = foundry;
  globalThis.Application = createMockApplication();

  return { game, foundry };
}

/**
 * Clears all Foundry VTT global mocks
 * Call this in afterEach() to clean up
 *
 * @example
 * afterEach(() => {
 *   clearFoundryMocks();
 * });
 */
export function clearFoundryMocks() {
  delete globalThis.game;
  delete globalThis.foundry;
  delete globalThis.Application;
}

/**
 * Creates a mock Foundry document (Actor, Item, Scene, etc.)
 *
 * @param {string} type - Document type (e.g., 'Actor', 'Item')
 * @param {Object} data - Document data
 * @returns {Object} Mock document object
 */
export function createMockDocument(type, data = {}) {
  return {
    id: data.id || Math.random().toString(36).substring(2, 18),
    _id: data._id || data.id || Math.random().toString(36).substring(2, 18),
    name: data.name || 'Test Document',
    type: data.type || 'base',
    data: data.data || {},
    documentName: type,

    update: vi.fn((updates) => {
      Object.assign(this.data, updates);
      return Promise.resolve(this);
    }),

    delete: vi.fn(() => {
      return Promise.resolve(this);
    }),

    getFlag: vi.fn((scope, key) => {
      return data.flags?.[scope]?.[key];
    }),

    setFlag: vi.fn((scope, key, value) => {
      if (!data.flags) data.flags = {};
      if (!data.flags[scope]) data.flags[scope] = {};
      data.flags[scope][key] = value;
      return Promise.resolve(this);
    }),

    unsetFlag: vi.fn((scope, key) => {
      if (data.flags?.[scope]) {
        delete data.flags[scope][key];
      }
      return Promise.resolve(this);
    })
  };
}

/**
 * Creates a mock Compendium pack
 *
 * @param {string} name - Pack name
 * @param {Array<Object>} documents - Documents in the pack
 * @returns {Object} Mock compendium pack
 */
export function createMockCompendium(name, documents = []) {
  return {
    metadata: {
      id: `world.${name}`,
      name: name,
      label: name,
      type: 'JournalEntry'
    },

    index: new Map(documents.map(doc => [doc.id, doc])),
    locked: false,

    getDocuments: vi.fn(() => Promise.resolve(documents)),
    getDocument: vi.fn((id) => Promise.resolve(documents.find(d => d.id === id))),
    search: vi.fn((query) => {
      const results = documents.filter(doc =>
        doc.name.toLowerCase().includes(query.toLowerCase())
      );
      return Promise.resolve(results);
    }),

    importDocument: vi.fn((doc) => {
      documents.push(doc);
      return Promise.resolve(doc);
    })
  };
}

/**
 * Creates a mock Hooks object for Foundry event system
 *
 * @returns {Object} Mock Hooks object
 */
export function createMockHooks() {
  const hooks = new Map();

  return {
    on: vi.fn((event, callback) => {
      if (!hooks.has(event)) {
        hooks.set(event, []);
      }
      hooks.get(event).push(callback);
    }),

    once: vi.fn((event, callback) => {
      const wrappedCallback = (...args) => {
        callback(...args);
        this.off(event, wrappedCallback);
      };
      this.on(event, wrappedCallback);
    }),

    off: vi.fn((event, callback) => {
      if (hooks.has(event)) {
        const callbacks = hooks.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    }),

    call: vi.fn((event, ...args) => {
      if (hooks.has(event)) {
        hooks.get(event).forEach(callback => callback(...args));
      }
    }),

    callAll: vi.fn((event, ...args) => {
      return this.call(event, ...args);
    }),

    // Helper for tests to trigger hooks
    _trigger: function(event, ...args) {
      if (hooks.has(event)) {
        hooks.get(event).forEach(callback => callback(...args));
      }
    }
  };
}
