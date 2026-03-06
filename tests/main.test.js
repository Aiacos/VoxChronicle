/**
 * Tests for main.mjs utility functions
 *
 * Tests the extractable utility functions exported from the module entry point:
 * - resolveHtmlElement() — Foundry v12/v13 HTML element resolution
 * - injectValidationButton() — "Test Connection" button injection
 * - VALIDATION_RESET_DELAY_MS — reset delay constant
 *
 * main.mjs has top-level side effects (Hooks.once, Hooks.on) that execute at
 * import time, so we must set up Foundry globals via vi.hoisted() BEFORE the
 * static import is evaluated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── vi.hoisted: set up globals BEFORE any import is evaluated ──────────
// vi.hoisted() runs before vi.mock() factory functions and before any imports.
// main.mjs calls Hooks.once(), Hooks.on(), and reads game/ui/foundry/canvas/
// SettingsConfig at module scope, so all must exist here.
vi.hoisted(() => {
  globalThis.Hooks = {
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  };
  globalThis.game = {
    modules: { get: vi.fn(() => ({ version: '3.2.5' })) },
    user: { isGM: true },
    settings: { get: vi.fn(), set: vi.fn(), register: vi.fn() },
    i18n: { localize: vi.fn((key) => key), format: vi.fn((key) => key) },
    'vox-chronicle': { version: '3.2.5', ready: false }
  };
  globalThis.ui = {
    notifications: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
  };
  globalThis.canvas = { scene: null };
  globalThis.foundry = {
    applications: {
      instances: { get: vi.fn() },
      settings: {}
    }
  };
  globalThis.SettingsConfig = class {};
});

// ── Mock module dependencies (hoisted above imports by Vitest) ─────────

vi.mock('../scripts/core/Settings.mjs', () => ({
  Settings: {
    registerSettings: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    validateOpenAIKey: vi.fn(),
    validateKankaToken: vi.fn()
  }
}));

vi.mock('../scripts/core/VoxChronicle.mjs', () => ({
  VoxChronicle: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      sessionOrchestrator: {},
      chapterTracker: null,
      journalParser: null
    }))
  }
}));

vi.mock('../scripts/utils/Logger.mjs', () => {
  const childLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  return {
    Logger: {
      createChild: vi.fn(() => childLogger),
      setDebugMode: vi.fn()
    }
  };
});

// ── Import the functions under test ────────────────────────────────────
import {
  resolveHtmlElement,
  injectValidationButton,
  VALIDATION_RESET_DELAY_MS
} from '../scripts/main.mjs';

// Import VoxChronicle mock to control getInstance return values in tests
import { VoxChronicle } from '../scripts/core/VoxChronicle.mjs';

// ── Capture Hooks.on calls from module-level side effects ─────────────
// main.mjs registers Hooks.on() callbacks at import time, using the
// Hooks mock from vi.hoisted(). The global beforeEach in setup.js
// replaces globalThis.Hooks with a fresh mock, so we must capture
// the callbacks here — right after static import, before any test runs.
const _hooksOnCalls = [...Hooks.on.mock.calls];

// ── resolveHtmlElement ─────────────────────────────────────────────────

describe('resolveHtmlElement()', () => {

  it('should return an HTMLElement as-is', () => {
    const div = document.createElement('div');
    const result = resolveHtmlElement(div);
    expect(result).toBe(div);
  });

  it('should unwrap a jQuery-like array to get the first HTMLElement', () => {
    const div = document.createElement('div');
    const jqueryLike = [div];
    const result = resolveHtmlElement(jqueryLike);
    expect(result).toBe(div);
  });

  it('should return null as-is when passed null', () => {
    const result = resolveHtmlElement(null);
    expect(result).toBeNull();
  });

  it('should return undefined as-is when passed undefined', () => {
    const result = resolveHtmlElement(undefined);
    expect(result).toBeUndefined();
  });

  it('should return a string as-is (non-element input)', () => {
    const result = resolveHtmlElement('some-string');
    expect(result).toBe('some-string');
  });

  it('should return a number as-is (non-element input)', () => {
    const result = resolveHtmlElement(42);
    expect(result).toBe(42);
  });

  it('should unwrap a jQuery-like array even with multiple elements', () => {
    const div1 = document.createElement('div');
    const div2 = document.createElement('span');
    const jqueryLike = [div1, div2];
    const result = resolveHtmlElement(jqueryLike);
    // Should return the first element (index 0)
    expect(result).toBe(div1);
  });

  it('should return an array as-is if first element is not an HTMLElement', () => {
    const arr = ['not-an-element', 'another'];
    const result = resolveHtmlElement(arr);
    // arr[0] is a string, not HTMLElement, so it falls through to return html
    expect(result).toBe(arr);
  });

  it('should return an empty array as-is', () => {
    const arr = [];
    // arr[0] is undefined, not HTMLElement
    const result = resolveHtmlElement(arr);
    expect(result).toBe(arr);
  });

  it('should handle an object with numeric index 0 that is an HTMLElement', () => {
    const div = document.createElement('div');
    const obj = { 0: div, length: 1 };
    const result = resolveHtmlElement(obj);
    // obj[0] is an HTMLElement, so it should be returned
    expect(result).toBe(div);
  });
});

// ── VALIDATION_RESET_DELAY_MS ──────────────────────────────────────────

describe('VALIDATION_RESET_DELAY_MS', () => {

  it('should be 2000 milliseconds', () => {
    expect(VALIDATION_RESET_DELAY_MS).toBe(2000);
  });

  it('should be a number', () => {
    expect(typeof VALIDATION_RESET_DELAY_MS).toBe('number');
  });
});

// ── injectValidationButton ─────────────────────────────────────────────

describe('injectValidationButton()', () => {

  let container;

  beforeEach(() => {
    vi.useFakeTimers();
    // Build a minimal settings form container with an input
    container = document.createElement('div');
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    input.name = 'vox-chronicle.openaiApiKey';
    input.type = 'text';
    input.value = 'test-key-123';
    wrapper.appendChild(input);
    container.appendChild(wrapper);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should inject a button next to the matching input', () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');
  });

  it('should do nothing if the input is not found', () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'nonexistent.input', 'openai', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    expect(button).toBeNull();
  });

  it('should set button type to "button" (not submit)', () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    expect(button.type).toBe('button');
  });

  it('should set data-validation-target to the targetName', () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    expect(button.dataset.validationTarget).toBe('openai');
  });

  it('should include localized "Test Connection" text in the button', () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    expect(button.textContent).toContain('VOXCHRONICLE.Settings.TestConnection');
  });

  it('should include a plug icon in the button initially', () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

    const icon = container.querySelector('.vox-chronicle-validate-button i');
    expect(icon).not.toBeNull();
    expect(icon.className).toBe('fa-solid fa-plug');
  });

  it('should place the button inside the input parent element', () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

    const input = container.querySelector('input[name="vox-chronicle.openaiApiKey"]');
    const button = container.querySelector('.vox-chronicle-validate-button');
    expect(input.parentElement).toBe(button.parentElement);
  });

  // ── Click behavior ─────────────────────────────────────────────────

  describe('click behavior', () => {

    it('should call validateFn when clicked', async () => {
      const validateFn = vi.fn().mockResolvedValue(true);
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      button.click();

      // Wait for the async click handler to complete
      await vi.waitFor(() => expect(validateFn).toHaveBeenCalledTimes(1));
    });

    it('should disable the button while validating', async () => {
      let resolveValidation;
      const validateFn = vi.fn(() => new Promise((resolve) => {
        resolveValidation = resolve;
      }));
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      button.click();

      // Button should be disabled immediately after click
      await vi.waitFor(() => expect(button.disabled).toBe(true));

      // Resolve validation
      resolveValidation(true);
      await vi.waitFor(() => {
        const icon = button.querySelector('i');
        return expect(icon.className).toBe('fa-solid fa-check');
      });
    });

    it('should show spinner icon while validating', async () => {
      let resolveValidation;
      const validateFn = vi.fn(() => new Promise((resolve) => {
        resolveValidation = resolve;
      }));
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      const icon = button.querySelector('i');

      button.click();

      // Should show spinner while awaiting validation
      await vi.waitFor(() => expect(icon.className).toBe('fa-solid fa-spinner fa-spin'));

      resolveValidation(true);
    });

    it('should show check icon when validation succeeds', async () => {
      const validateFn = vi.fn().mockResolvedValue(true);
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      button.click();

      const icon = button.querySelector('i');
      await vi.waitFor(() => expect(icon.className).toBe('fa-solid fa-check'));
    });

    it('should show times icon when validation fails (returns false)', async () => {
      const validateFn = vi.fn().mockResolvedValue(false);
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      button.click();

      const icon = button.querySelector('i');
      await vi.waitFor(() => expect(icon.className).toBe('fa-solid fa-times'));
    });

    it('should show times icon when validation throws an error', async () => {
      const validateFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      button.click();

      const icon = button.querySelector('i');
      await vi.waitFor(() => expect(icon.className).toBe('fa-solid fa-times'));
    });

    it('should reset icon to plug after VALIDATION_RESET_DELAY_MS', async () => {
      const validateFn = vi.fn().mockResolvedValue(true);
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      button.click();

      const icon = button.querySelector('i');

      // Wait for validation to complete (shows check icon)
      await vi.waitFor(() => expect(icon.className).toBe('fa-solid fa-check'));

      // Advance timers past the reset delay
      vi.advanceTimersByTime(VALIDATION_RESET_DELAY_MS);

      expect(icon.className).toBe('fa-solid fa-plug');
    });

    it('should re-enable the button after VALIDATION_RESET_DELAY_MS', async () => {
      const validateFn = vi.fn().mockResolvedValue(true);
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      button.click();

      // Wait for validation to complete
      await vi.waitFor(() => expect(button.disabled).toBe(true));

      // Advance timers past the reset delay
      vi.advanceTimersByTime(VALIDATION_RESET_DELAY_MS);

      expect(button.disabled).toBe(false);
    });

    it('should not reset before VALIDATION_RESET_DELAY_MS elapses', async () => {
      const validateFn = vi.fn().mockResolvedValue(true);
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      const icon = button.querySelector('i');

      button.click();

      // Flush microtasks so the async click handler resolves (sets check icon
      // and schedules the setTimeout reset), without advancing fake timers
      await vi.advanceTimersByTimeAsync(0);

      // Validation resolved — icon should now be check
      expect(icon.className).toBe('fa-solid fa-check');

      // Advance just short of the reset delay
      vi.advanceTimersByTime(VALIDATION_RESET_DELAY_MS - 1);

      // Should still show check icon — not yet reset
      expect(icon.className).toBe('fa-solid fa-check');
      expect(button.disabled).toBe(true);
    });

    it('should prevent default on the click event', async () => {
      const validateFn = vi.fn().mockResolvedValue(true);
      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateFn);

      const button = container.querySelector('.vox-chronicle-validate-button');
      const event = new Event('click', { cancelable: true });
      button.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  // ── Multiple buttons ─────────────────────────────────────────────────

  describe('multiple validation buttons', () => {

    it('should support injecting buttons for different inputs', () => {
      // Add a second input
      const wrapper2 = document.createElement('div');
      const input2 = document.createElement('input');
      input2.name = 'vox-chronicle.kankaApiToken';
      input2.type = 'text';
      wrapper2.appendChild(input2);
      container.appendChild(wrapper2);

      const validateOpenAI = vi.fn().mockResolvedValue(true);
      const validateKanka = vi.fn().mockResolvedValue(true);

      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateOpenAI);
      injectValidationButton(container, 'vox-chronicle.kankaApiToken', 'kanka', validateKanka);

      const buttons = container.querySelectorAll('.vox-chronicle-validate-button');
      expect(buttons.length).toBe(2);
      expect(buttons[0].dataset.validationTarget).toBe('openai');
      expect(buttons[1].dataset.validationTarget).toBe('kanka');
    });

    it('should call the correct validateFn for each button', async () => {
      const wrapper2 = document.createElement('div');
      const input2 = document.createElement('input');
      input2.name = 'vox-chronicle.kankaApiToken';
      input2.type = 'text';
      wrapper2.appendChild(input2);
      container.appendChild(wrapper2);

      const validateOpenAI = vi.fn().mockResolvedValue(true);
      const validateKanka = vi.fn().mockResolvedValue(false);

      injectValidationButton(container, 'vox-chronicle.openaiApiKey', 'openai', validateOpenAI);
      injectValidationButton(container, 'vox-chronicle.kankaApiToken', 'kanka', validateKanka);

      const buttons = container.querySelectorAll('.vox-chronicle-validate-button');

      // Click the Kanka button only
      buttons[1].click();

      await vi.waitFor(() => expect(validateKanka).toHaveBeenCalledTimes(1));
      expect(validateOpenAI).not.toHaveBeenCalled();
    });
  });
});

// ── Hooks.on callback tests ───────────────────────────────────────────

/**
 * Helper: find a Hooks.on callback by hook name.
 * Uses the captured calls from module import time (before setup.js resets
 * the Hooks mock). Hooks.on is called as Hooks.on(hookName, callback).
 */
function findHookCallback(hookName) {
  const call = _hooksOnCalls.find((c) => c[0] === hookName);
  return call ? call[1] : null;
}

describe('canvasReady hook', () => {

  it('should call chapterTracker.updateFromScene when chapterTracker is available', () => {
    const mockScene = { id: 'scene-1', name: 'Test Scene' };
    const updateFromScene = vi.fn();

    VoxChronicle.getInstance.mockReturnValue({
      chapterTracker: { updateFromScene },
      journalParser: null
    });
    globalThis.canvas = { scene: mockScene };

    const callback = findHookCallback('canvasReady');
    expect(callback).toBeDefined();

    callback();

    expect(updateFromScene).toHaveBeenCalledWith(mockScene);
  });

  it('should not throw when chapterTracker is null', () => {
    VoxChronicle.getInstance.mockReturnValue({
      chapterTracker: null,
      journalParser: null
    });
    globalThis.canvas = { scene: { id: 'scene-1' } };

    const callback = findHookCallback('canvasReady');
    expect(() => callback()).not.toThrow();
  });

  it('should not call updateFromScene when canvas.scene is null', () => {
    const updateFromScene = vi.fn();

    VoxChronicle.getInstance.mockReturnValue({
      chapterTracker: { updateFromScene },
      journalParser: null
    });
    globalThis.canvas = { scene: null };

    const callback = findHookCallback('canvasReady');
    callback();

    expect(updateFromScene).not.toHaveBeenCalled();
  });
});

describe('journal entry hooks', () => {

  const journalHooks = ['updateJournalEntry', 'createJournalEntry', 'deleteJournalEntry'];

  for (const hookName of journalHooks) {
    describe(`${hookName} hook`, () => {

      it('should call journalParser.clearAllCache when journalParser is available', () => {
        const clearAllCache = vi.fn();

        VoxChronicle.getInstance.mockReturnValue({
          chapterTracker: null,
          journalParser: { clearAllCache }
        });

        const callback = findHookCallback(hookName);
        expect(callback).toBeDefined();

        callback();

        expect(clearAllCache).toHaveBeenCalledTimes(1);
      });

      it('should not throw when journalParser is null', () => {
        VoxChronicle.getInstance.mockReturnValue({
          chapterTracker: null,
          journalParser: null
        });

        const callback = findHookCallback(hookName);
        expect(() => callback()).not.toThrow();
      });
    });
  }
});

// ── Debounced re-index hooks (02-03) ────────────────────────────────────

describe('debounced re-index on journal edit', () => {

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should trigger reindexJournal after 5-second debounce for a selected journal during live mode', () => {
    const reindexJournal = vi.fn();

    VoxChronicle.getInstance.mockReturnValue({
      chapterTracker: null,
      journalParser: { clearAllCache: vi.fn() },
      orchestrator: { isLiveMode: true, reindexJournal }
    });

    globalThis.game.settings.get = vi.fn((moduleId, key) => {
      if (key === 'activeAdventureJournalId') return 'journal-1';
      if (key === 'supplementaryJournalIds') return [];
      return '';
    });

    const callback = findHookCallback('updateJournalEntry');
    callback({ id: 'journal-1' });

    // Should NOT have been called yet (within debounce window)
    expect(reindexJournal).not.toHaveBeenCalled();

    // Advance past 5-second debounce
    vi.advanceTimersByTime(5000);

    expect(reindexJournal).toHaveBeenCalledWith('journal-1');
  });

  it('should NOT trigger reindexJournal for an unselected journal', () => {
    const reindexJournal = vi.fn();

    VoxChronicle.getInstance.mockReturnValue({
      chapterTracker: null,
      journalParser: { clearAllCache: vi.fn() },
      orchestrator: { isLiveMode: true, reindexJournal }
    });

    globalThis.game.settings.get = vi.fn((moduleId, key) => {
      if (key === 'activeAdventureJournalId') return 'journal-1';
      if (key === 'supplementaryJournalIds') return [];
      return '';
    });

    const callback = findHookCallback('updateJournalEntry');
    callback({ id: 'unrelated-journal' });

    vi.advanceTimersByTime(5000);

    expect(reindexJournal).not.toHaveBeenCalled();
  });

  it('should debounce multiple rapid edits into a single reindexJournal call', () => {
    const reindexJournal = vi.fn();

    VoxChronicle.getInstance.mockReturnValue({
      chapterTracker: null,
      journalParser: { clearAllCache: vi.fn() },
      orchestrator: { isLiveMode: true, reindexJournal }
    });

    globalThis.game.settings.get = vi.fn((moduleId, key) => {
      if (key === 'activeAdventureJournalId') return 'journal-1';
      if (key === 'supplementaryJournalIds') return [];
      return '';
    });

    const callback = findHookCallback('updateJournalEntry');
    callback({ id: 'journal-1' });
    vi.advanceTimersByTime(2000);
    callback({ id: 'journal-1' });
    vi.advanceTimersByTime(2000);
    callback({ id: 'journal-1' });

    // Still within debounce window since last call
    expect(reindexJournal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);

    // Should have been called only once
    expect(reindexJournal).toHaveBeenCalledTimes(1);
  });

  it('should NOT trigger reindexJournal when not in live mode', () => {
    const reindexJournal = vi.fn();

    VoxChronicle.getInstance.mockReturnValue({
      chapterTracker: null,
      journalParser: { clearAllCache: vi.fn() },
      orchestrator: { isLiveMode: false, reindexJournal }
    });

    globalThis.game.settings.get = vi.fn((moduleId, key) => {
      if (key === 'activeAdventureJournalId') return 'journal-1';
      if (key === 'supplementaryJournalIds') return [];
      return '';
    });

    const callback = findHookCallback('updateJournalEntry');
    callback({ id: 'journal-1' });

    vi.advanceTimersByTime(5000);

    expect(reindexJournal).not.toHaveBeenCalled();
  });

  it('should still clear parser cache even when triggering re-index', () => {
    const clearAllCache = vi.fn();
    const reindexJournal = vi.fn();

    VoxChronicle.getInstance.mockReturnValue({
      chapterTracker: null,
      journalParser: { clearAllCache },
      orchestrator: { isLiveMode: true, reindexJournal }
    });

    globalThis.game.settings.get = vi.fn((moduleId, key) => {
      if (key === 'activeAdventureJournalId') return 'journal-1';
      if (key === 'supplementaryJournalIds') return [];
      return '';
    });

    const callback = findHookCallback('updateJournalEntry');
    callback({ id: 'journal-1' });

    // Cache clear should happen immediately (not debounced)
    expect(clearAllCache).toHaveBeenCalledTimes(1);
  });
});
