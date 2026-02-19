/**
 * Global Vitest setup — runs before every test file.
 *
 * Sets up Foundry VTT globals (game, foundry, ui, Hooks, etc.)
 * so individual test files don't need to repeat boilerplate.
 */
import { vi, beforeEach, afterEach } from 'vitest';
import { setupFoundryMocks, clearFoundryMocks, createMockHooks } from './foundry-mock.js';

// ── Foundry globals that every module file expects ─────────────────────

beforeEach(() => {
  setupFoundryMocks();

  // Hooks global
  globalThis.Hooks = createMockHooks();

  // UI notification stubs
  globalThis.ui = {
    notifications: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  };

  // Dialog stub (v1 — still used in some files)
  globalThis.Dialog = class Dialog {
    constructor(data) { this.data = data; }
    render(force) { return this; }
    close() { return Promise.resolve(); }
    static confirm(config) { return Promise.resolve(true); }
    static prompt(config) { return Promise.resolve(''); }
  };

  // ChatMessage stub
  globalThis.ChatMessage = { create: vi.fn(() => Promise.resolve()) };

  // Minimal FormData polyfill (jsdom may not have full version)
  if (typeof globalThis.FormData === 'undefined') {
    globalThis.FormData = class FormData {
      constructor() { this._data = new Map(); }
      append(key, value, filename) {
        this._data.set(key, { value, filename });
      }
      get(key) { return this._data.get(key)?.value; }
      has(key) { return this._data.has(key); }
    };
  }
});

afterEach(() => {
  clearFoundryMocks();
  delete globalThis.Hooks;
  delete globalThis.ui;
  delete globalThis.Dialog;
  delete globalThis.ChatMessage;
  vi.restoreAllMocks();
});
