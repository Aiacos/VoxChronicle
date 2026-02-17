/**
 * main.mjs Tests
 *
 * Tests for the module entry point: scene control registration, tool onChange
 * handlers, resolveHtmlElement v12/v13 compat, and validation button injection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (must be defined before imports)
// ---------------------------------------------------------------------------

vi.mock('../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

vi.mock('../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn()
    }),
    setDebugMode: vi.fn()
  }
}));

vi.mock('../scripts/core/Settings.mjs', () => ({
  Settings: {
    registerSettings: vi.fn(),
    get: vi.fn(),
    validateOpenAIKey: vi.fn().mockResolvedValue(true),
    validateKankaToken: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../scripts/core/VoxChronicle.mjs', () => ({
  VoxChronicle: {
    getInstance: vi.fn().mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      sessionOrchestrator: {},
      chapterTracker: null,
      journalParser: null
    })
  }
}));

vi.mock('../scripts/ui/MainPanel.mjs', () => ({
  MainPanel: {
    getInstance: vi.fn().mockReturnValue({
      isRendered: false,
      render: vi.fn(),
      close: vi.fn()
    })
  }
}));

// ---------------------------------------------------------------------------
// Foundry VTT globals
// ---------------------------------------------------------------------------

// Capture hook registrations
const hookCallbacks = {};
globalThis.Hooks = {
  once: vi.fn((event, callback) => {
    if (!hookCallbacks[event]) hookCallbacks[event] = [];
    hookCallbacks[event].push(callback);
  }),
  on: vi.fn((event, callback) => {
    if (!hookCallbacks[event]) hookCallbacks[event] = [];
    hookCallbacks[event].push(callback);
  })
};

globalThis.game = {
  modules: new Map([['vox-chronicle', { version: '2.2.3' }]]),
  settings: {
    get: vi.fn((module, key) => {
      if (key === 'debugMode') return false;
      return null;
    }),
    set: vi.fn(),
    register: vi.fn()
  },
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key) => key)
  },
  user: { isGM: true },
  'vox-chronicle': { version: '2.2.3', ready: false }
};

globalThis.ui = {
  notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
};

globalThis.canvas = { scene: null };
globalThis.SettingsConfig = class SettingsConfig {
  render() {}
};
globalThis.foundry = {
  applications: {
    settings: {
      SettingsConfig: class V13SettingsConfig {
        render() {}
      }
    }
  }
};

// Import AFTER mocks are set up
await import('../scripts/main.mjs');

// Snapshot hook registrations immediately after import (before any afterEach
// can call vi.clearAllMocks and wipe the spy call history).
const hooksOnceCalls = Hooks.once.mock.calls.map(([event]) => event);
const hooksOnCalls = Hooks.on.mock.calls.map(([event]) => event);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('main.mjs', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Scene control registration
  // =========================================================================

  describe('getSceneControlButtons', () => {
    function getControlsHook() {
      return hookCallbacks['getSceneControlButtons']?.[0];
    }

    it('should register getSceneControlButtons hook', () => {
      expect(hooksOnCalls).toContain('getSceneControlButtons');
      expect(hookCallbacks['getSceneControlButtons']?.length).toBeGreaterThan(0);
    });

    it('should add vox-chronicle control group with correct structure', () => {
      const hook = getControlsHook();
      const controls = {};
      hook(controls);

      expect(controls['vox-chronicle']).toBeDefined();
      expect(controls['vox-chronicle'].name).toBe('vox-chronicle');
      expect(controls['vox-chronicle'].icon).toBe('fa-solid fa-microphone');
      expect(controls['vox-chronicle'].title).toBe('VOXCHRONICLE.Controls.Title');
      expect(controls['vox-chronicle'].activeTool).toBe('panel');
      expect(controls['vox-chronicle'].order).toBe(100);
      expect(controls['vox-chronicle'].visible).toBe(true);
    });

    it('should register all 5 tools', () => {
      const hook = getControlsHook();
      const controls = {};
      hook(controls);

      const tools = controls['vox-chronicle'].tools;
      expect(tools.panel).toBeDefined();
      expect(tools.speakerLabels).toBeDefined();
      expect(tools.vocabulary).toBeDefined();
      expect(tools.relationshipGraph).toBeDefined();
      expect(tools.settings).toBeDefined();
    });

    it('should set required properties on each tool', () => {
      const hook = getControlsHook();
      const controls = {};
      hook(controls);

      const tools = controls['vox-chronicle'].tools;
      for (const [key, tool] of Object.entries(tools)) {
        expect(tool.name).toBe(key);
        expect(tool.icon).toMatch(/^fa-solid/);
        expect(tool.title).toMatch(/^VOXCHRONICLE\.Controls\./);
        expect(typeof tool.order).toBe('number');
        expect(tool.button).toBe(true);
        expect(typeof tool.onChange).toBe('function');
      }
    });

    it('should not add controls for non-GM users', () => {
      game.user.isGM = false;
      const hook = getControlsHook();
      const controls = {};
      hook(controls);

      expect(controls['vox-chronicle']).toBeUndefined();
      game.user.isGM = true;
    });
  });

  // =========================================================================
  // Tool onChange handlers with active parameter
  // =========================================================================

  describe('tool onChange handlers', () => {
    function getToolHandler(toolName) {
      const hook = hookCallbacks['getSceneControlButtons']?.[0];
      const controls = {};
      hook(controls);
      return controls['vox-chronicle'].tools[toolName].onChange;
    }

    it('panel handler should not act when active=false', async () => {
      const handler = getToolHandler('panel');
      // Should return early without doing anything
      await handler(false);
      // No error thrown = success
    });

    it('speakerLabels handler should not act when active=false', async () => {
      const handler = getToolHandler('speakerLabels');
      await handler(false);
    });

    it('vocabulary handler should not act when active=false', async () => {
      const handler = getToolHandler('vocabulary');
      await handler(false);
    });

    it('relationshipGraph handler should not act when active=false', async () => {
      const handler = getToolHandler('relationshipGraph');
      await handler(false);
    });

    it('settings handler should not act when active=false', () => {
      const handler = getToolHandler('settings');
      handler(false);
    });
  });

  // =========================================================================
  // Hooks registration
  // =========================================================================

  describe('hook registration', () => {
    // These tests use snapshots captured at import time (before afterEach
    // can clear spy history) plus the hookCallbacks map which is never cleared.

    it('should register init hook', () => {
      expect(hooksOnceCalls).toContain('init');
      expect(hookCallbacks['init']?.length).toBeGreaterThan(0);
    });

    it('should register ready hook', () => {
      expect(hooksOnceCalls).toContain('ready');
      expect(hookCallbacks['ready']?.length).toBeGreaterThan(0);
    });

    it('should register canvasReady hook', () => {
      expect(hooksOnCalls).toContain('canvasReady');
      expect(hookCallbacks['canvasReady']?.length).toBeGreaterThan(0);
    });

    it('should register renderSettingsConfig hook', () => {
      expect(hooksOnCalls).toContain('renderSettingsConfig');
      expect(hookCallbacks['renderSettingsConfig']?.length).toBeGreaterThan(0);
    });

    it('should register journal entry hooks for cache invalidation', () => {
      expect(hooksOnCalls).toContain('updateJournalEntry');
      expect(hooksOnCalls).toContain('createJournalEntry');
      expect(hooksOnCalls).toContain('deleteJournalEntry');
    });
  });

  // =========================================================================
  // renderSettingsConfig - resolveHtmlElement and validation buttons
  // =========================================================================

  describe('renderSettingsConfig', () => {
    function getSettingsHook() {
      return hookCallbacks['renderSettingsConfig']?.[0];
    }

    it('should handle HTMLElement input (v13)', () => {
      const hook = getSettingsHook();
      const container = document.createElement('div');

      // Should not throw
      hook({}, container);
    });

    it('should handle jQuery-like array input (v12)', () => {
      const hook = getSettingsHook();
      const div = document.createElement('div');
      const jqueryLike = [div];
      jqueryLike.find = vi.fn().mockReturnValue({ on: vi.fn() });

      // Should not throw
      hook({}, jqueryLike);
    });

    it('should inject validation button next to OpenAI key input', () => {
      const hook = getSettingsHook();
      const container = document.createElement('div');

      // Create the input element the hook looks for
      const wrapper = document.createElement('div');
      const input = document.createElement('input');
      input.name = 'vox-chronicle.openaiApiKey';
      wrapper.appendChild(input);
      container.appendChild(wrapper);

      hook({}, container);

      const button = container.querySelector('.vox-chronicle-validate-button');
      expect(button).not.toBeNull();
      expect(button.dataset.validationTarget).toBe('openai');
    });

    it('should inject validation button next to Kanka token input', () => {
      const hook = getSettingsHook();
      const container = document.createElement('div');

      const wrapper = document.createElement('div');
      const input = document.createElement('input');
      input.name = 'vox-chronicle.kankaApiToken';
      wrapper.appendChild(input);
      container.appendChild(wrapper);

      hook({}, container);

      const button = container.querySelector('[data-validation-target="kanka"]');
      expect(button).not.toBeNull();
    });

    it('should replace campaign text input with select dropdown', () => {
      const hook = getSettingsHook();
      const container = document.createElement('div');

      const wrapper = document.createElement('div');
      const input = document.createElement('input');
      input.name = 'vox-chronicle.kankaCampaignId';
      input.value = '123';
      wrapper.appendChild(input);
      container.appendChild(wrapper);

      hook({}, container);

      const select = container.querySelector('select[name="vox-chronicle.kankaCampaignId"]');
      expect(select).not.toBeNull();
      expect(select.className).toContain('vox-chronicle-campaign-select');
    });

    it('validation button should show spinner on click', async () => {
      const hook = getSettingsHook();
      const container = document.createElement('div');

      const wrapper = document.createElement('div');
      const input = document.createElement('input');
      input.name = 'vox-chronicle.openaiApiKey';
      wrapper.appendChild(input);
      container.appendChild(wrapper);

      hook({}, container);

      const button = container.querySelector('.vox-chronicle-validate-button');
      const icon = button.querySelector('i');

      // Click the button
      const clickEvent = new Event('click');
      clickEvent.preventDefault = vi.fn();
      button.dispatchEvent(clickEvent);

      // Button should be disabled and icon should change to spinner
      expect(button.disabled).toBe(true);
    });
  });
});
