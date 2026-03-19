/**
 * Foundry VTT Mock Layer for Test Harness
 *
 * Provides minimal mocks of Foundry VTT globals so VoxChronicle module
 * scripts can be imported and exercised in a standalone browser page.
 */

// ─── Hooks System ────────────────────────────────────────────────
const hookRegistry = { once: {}, on: {} };

globalThis.Hooks = {
  once(name, fn) {
    (hookRegistry.once[name] ??= []).push(fn);
  },
  on(name, fn) {
    (hookRegistry.on[name] ??= []).push(fn);
    return hookRegistry.on[name].length;
  },
  off(name, id) { /* no-op for tests */ },
  call(name, ...args) {
    for (const fn of hookRegistry.on[name] || []) fn(...args);
  },
  callAll(name, ...args) {
    for (const fn of hookRegistry.on[name] || []) fn(...args);
  }
};

/** Fire a hook (once or on) — used by test harness to simulate Foundry lifecycle */
export function fireHook(name, ...args) {
  const onceFns = hookRegistry.once[name] || [];
  delete hookRegistry.once[name];
  for (const fn of onceFns) fn(...args);
  for (const fn of hookRegistry.on[name] || []) fn(...args);
}

export function resetHooks() {
  hookRegistry.once = {};
  hookRegistry.on = {};
}

// ─── Settings Store ──────────────────────────────────────────────
const settingsStore = new Map();
const settingsRegistry = new Map();

globalThis.game = {
  user: { isGM: true, id: 'test-user-1' },
  userId: 'test-user-1',
  settings: {
    register(moduleId, key, config) {
      settingsRegistry.set(`${moduleId}.${key}`, config);
      if (config.default !== undefined && !settingsStore.has(`${moduleId}.${key}`)) {
        settingsStore.set(`${moduleId}.${key}`, config.default);
      }
    },
    get(moduleId, key) {
      const fullKey = `${moduleId}.${key}`;
      if (settingsStore.has(fullKey)) return settingsStore.get(fullKey);
      const reg = settingsRegistry.get(fullKey);
      return reg?.default;
    },
    set(moduleId, key, value) {
      settingsStore.set(`${moduleId}.${key}`, value);
      return Promise.resolve();
    }
  },
  i18n: {
    localize(key) { return key; },
    format(key, data) { return key; },
    lang: 'en'
  },
  modules: {
    get(id) {
      return id === 'vox-chronicle' ? { id: 'vox-chronicle', version: '4.0.4', active: true } : undefined;
    }
  },
  packs: new Map(),
  journal: { contents: [], get(id) { return null; } },
  scenes: { contents: [] },
  actors: { contents: [] },
  items: { contents: [] },
  folders: { contents: [] },
  'vox-chronicle': { version: '4.0.4', ready: false }
};

export function setSetting(key, value) {
  settingsStore.set(`vox-chronicle.${key}`, value);
}

export function getSetting(key) {
  return game.settings.get('vox-chronicle', key);
}

export function resetSettings() {
  settingsStore.clear();
}

// ─── UI Notifications ────────────────────────────────────────────
const notifications = [];
globalThis.ui = {
  notifications: {
    info(msg) { notifications.push({ type: 'info', msg }); },
    warn(msg) { notifications.push({ type: 'warn', msg }); },
    error(msg) { notifications.push({ type: 'error', msg }); }
  }
};

export function getNotifications() { return [...notifications]; }
export function clearNotifications() { notifications.length = 0; }

// ─── Canvas ──────────────────────────────────────────────────────
globalThis.canvas = { scene: null };

// ─── Handlebars ──────────────────────────────────────────────────
if (typeof Handlebars === 'undefined') {
  // Minimal Handlebars stub — templates won't render but code won't crash
  globalThis.Handlebars = {
    helpers: {},
    registerHelper(name, fn) { this.helpers[name] = fn; },
    compile(template) { return () => '<div>mock-template</div>'; },
    SafeString(str) { return str; }
  };
}

// ─── ApplicationV2 Stub ──────────────────────────────────────────
class ApplicationV2Stub {
  static DEFAULT_OPTIONS = {};
  static PARTS = {};
  constructor(options = {}) { this.options = options; }
  render() { return this; }
  close() { return Promise.resolve(); }
  get rendered() { return false; }
  get element() { return null; }
}

function HandlebarsApplicationMixinStub(Base) {
  return class extends Base {};
}

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: ApplicationV2Stub,
      HandlebarsApplicationMixin: HandlebarsApplicationMixinStub
    },
    instances: new Map()
  },
  utils: {
    debounce(fn, ms) {
      let timer;
      const debounced = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
      debounced.cancel = () => clearTimeout(timer);
      return debounced;
    }
  }
};

// ─── Fetch Interceptor ──────────────────────────────────────────
const originalFetch = globalThis.fetch;
let mockFetchEnabled = false;
const mockResponses = new Map();

export function enableMockFetch() {
  mockFetchEnabled = true;
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Check for registered mock
    for (const [pattern, handler] of mockResponses) {
      if (urlStr.includes(pattern)) {
        const result = typeof handler === 'function' ? await handler(urlStr, options) : handler;
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Default mock response
    return new Response(JSON.stringify({ error: 'unmocked endpoint', url: urlStr }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}

export function disableMockFetch() {
  mockFetchEnabled = false;
  globalThis.fetch = originalFetch;
}

export function registerMockResponse(urlPattern, response) {
  mockResponses.set(urlPattern, response);
}

export function clearMockResponses() {
  mockResponses.clear();
}

// ─── MediaRecorder Mock ──────────────────────────────────────────
class MockMediaRecorder {
  static isTypeSupported(type) { return type.includes('webm') || type.includes('mp4'); }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm;codecs=opus';
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
    this.onpause = null;
    this.onresume = null;
  }

  start(timeslice) {
    this.state = 'recording';
    // Emit fake audio data periodically
    this._interval = setInterval(() => {
      if (this.ondataavailable && this.state === 'recording') {
        const fakeAudio = new Blob([new Uint8Array(1024)], { type: this.mimeType });
        this.ondataavailable({ data: fakeAudio });
      }
    }, timeslice || 1000);
  }

  stop() {
    clearInterval(this._interval);
    this.state = 'inactive';
    // Fire final data + stop
    if (this.ondataavailable) {
      const fakeAudio = new Blob([new Uint8Array(512)], { type: this.mimeType });
      this.ondataavailable({ data: fakeAudio });
    }
    setTimeout(() => this.onstop?.(), 10);
  }

  pause() {
    this.state = 'paused';
    this.onpause?.();
  }

  resume() {
    this.state = 'recording';
    this.onresume?.();
  }
}

if (typeof MediaRecorder === 'undefined') {
  globalThis.MediaRecorder = MockMediaRecorder;
}

// ─── Mock Audio Stream ───────────────────────────────────────────
export function createMockAudioStream() {
  // Create a silent AudioContext-based stream for MediaRecorder
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dest = ctx.createMediaStreamDestination();
    oscillator.connect(dest);
    oscillator.start();
    return dest.stream;
  } catch {
    // Fallback: return a minimal mock stream
    return {
      getTracks() {
        return [{ stop() {}, kind: 'audio', enabled: true }];
      },
      getAudioTracks() {
        return [{ stop() {}, kind: 'audio', enabled: true }];
      }
    };
  }
}

// ─── Mock navigator.mediaDevices ─────────────────────────────────
if (!navigator.mediaDevices) {
  navigator.mediaDevices = {};
}
const originalGetUserMedia = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);

export function enableMockMediaDevices() {
  navigator.mediaDevices.getUserMedia = async () => createMockAudioStream();
}

export function disableMockMediaDevices() {
  if (originalGetUserMedia) {
    navigator.mediaDevices.getUserMedia = originalGetUserMedia;
  }
}

// ─── Export all for test harness ──────────────────────────────────
export {
  hookRegistry,
  settingsStore,
  settingsRegistry,
  notifications,
  mockResponses,
  ApplicationV2Stub,
  MockMediaRecorder
};
