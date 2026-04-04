# Multi-Provider Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MistralChatProvider, automatic fallback between chat providers when one fails, and update all documentation.

**Architecture:** A new `FallbackChatProvider` decorator wraps `ProviderRegistry` and intercepts `chat()`/`chatStream()` calls — if the default provider fails with a retryable error (5xx, timeout, quota), it transparently tries the next registered provider for the same capability. `MistralChatProvider` follows the same pattern as Anthropic/Google. A new `getProvidersForCapability()` method on ProviderRegistry enables the fallback chain.

**Tech Stack:** JavaScript ES6+ modules (.mjs), Foundry VTT v13, Vitest, existing ChatProvider abstract class.

---

### Task 1: Add `getProvidersForCapability()` to ProviderRegistry

**Files:**
- Modify: `scripts/ai/providers/ProviderRegistry.mjs:126`
- Test: `tests/ai/providers/ProviderRegistry.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/ai/providers/ProviderRegistry.test.js`, add a new describe block:

```javascript
describe('getProvidersForCapability()', () => {
  it('should return all providers for a given capability in registration order', () => {
    const registry = ProviderRegistry.getInstance();
    const providerA = { constructor: { capabilities: ['chat'] }, chat: vi.fn() };
    const providerB = { constructor: { capabilities: ['chat'] }, chat: vi.fn() };
    const providerC = { constructor: { capabilities: ['embed'] }, embed: vi.fn() };

    registry.register('a-chat', providerA);
    registry.register('b-chat', providerB);
    registry.register('c-embed', providerC);

    const chatProviders = registry.getProvidersForCapability('chat');
    expect(chatProviders).toHaveLength(2);
    expect(chatProviders[0]).toEqual({ name: 'a-chat', provider: providerA });
    expect(chatProviders[1]).toEqual({ name: 'b-chat', provider: providerB });
  });

  it('should return empty array for unknown capability', () => {
    const registry = ProviderRegistry.getInstance();
    expect(registry.getProvidersForCapability('unknown')).toEqual([]);
  });

  it('should put the default provider first', () => {
    const registry = ProviderRegistry.getInstance();
    const providerA = { constructor: { capabilities: ['chat'] }, chat: vi.fn() };
    const providerB = { constructor: { capabilities: ['chat'] }, chat: vi.fn() };

    registry.register('a-chat', providerA);
    registry.register('b-chat', providerB, { default: true });

    const result = registry.getProvidersForCapability('chat');
    expect(result[0].name).toBe('b-chat');
    expect(result[1].name).toBe('a-chat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/providers/ProviderRegistry.test.js`
Expected: FAIL — `getProvidersForCapability is not a function`

- [ ] **Step 3: Implement the method**

In `scripts/ai/providers/ProviderRegistry.mjs`, add after `listProviders()` (line ~133):

```javascript
  /**
   * Get all providers that support a given capability, default first.
   * @param {string} capability
   * @returns {Array<{name: string, provider: object}>}
   */
  getProvidersForCapability(capability) {
    const defaultName = this.#defaults.get(capability);
    const result = [];
    let defaultEntry = null;

    for (const [name, { provider, capabilities }] of this.#providers) {
      if (capabilities.includes(capability)) {
        const entry = { name, provider };
        if (name === defaultName) {
          defaultEntry = entry;
        } else {
          result.push(entry);
        }
      }
    }

    // Default provider goes first
    if (defaultEntry) result.unshift(defaultEntry);
    return result;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai/providers/ProviderRegistry.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ai/providers/ProviderRegistry.mjs tests/ai/providers/ProviderRegistry.test.js
git commit -m "feat: add getProvidersForCapability() to ProviderRegistry"
```

---

### Task 2: Create MistralChatProvider

**Files:**
- Create: `scripts/ai/providers/MistralChatProvider.mjs`
- Create: `tests/ai/providers/MistralChatProvider.test.js`

- [ ] **Step 1: Write the test file**

Create `tests/ai/providers/MistralChatProvider.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MistralChatProvider } from '../../../scripts/ai/providers/MistralChatProvider.mjs';

vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
  }
}));

describe('MistralChatProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new MistralChatProvider('test-mistral-key');
    vi.restoreAllMocks();
  });

  describe('capabilities', () => {
    it('should expose chat and chatStream capabilities', () => {
      expect(MistralChatProvider.capabilities).toContain('chat');
      expect(MistralChatProvider.capabilities).toContain('chatStream');
    });
  });

  describe('chat()', () => {
    it('should send messages to Mistral API and return content', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Hello from Mistral!' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          })
      });

      const result = await provider.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' }
      ]);

      expect(result.content).toBe('Hello from Mistral!');
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(5);
    });

    it('should pass system messages in the messages array (OpenAI-compatible)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
          })
      });

      await provider.chat([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User msg' }
      ]);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });

    it('should use correct API endpoint', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' } }],
            usage: {}
          })
      });

      await provider.chat([{ role: 'user', content: 'test' }]);

      expect(fetch.mock.calls[0][0]).toBe('https://api.mistral.ai/v1/chat/completions');
      const headers = fetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-mistral-key');
    });

    it('should throw on API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ message: 'Invalid key' })
      });

      await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'Mistral API error 401'
      );
    });

    it('should pass model and temperature options', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' } }],
            usage: {}
          })
      });

      await provider.chat([{ role: 'user', content: 'test' }], {
        model: 'mistral-large-latest',
        temperature: 0.3,
        maxTokens: 500
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.model).toBe('mistral-large-latest');
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(500);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/providers/MistralChatProvider.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create the provider**

Create `scripts/ai/providers/MistralChatProvider.mjs`:

```javascript
/**
 * MistralChatProvider - Mistral AI implementation of ChatProvider
 *
 * Implements chat() and chatStream() using the Mistral API (OpenAI-compatible format).
 *
 * @class MistralChatProvider
 * @augments ChatProvider
 * @module vox-chronicle
 */

import { ChatProvider } from './ChatProvider.mjs';
import { Logger } from '../../utils/Logger.mjs';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

export class MistralChatProvider extends ChatProvider {
  #apiKey;
  #logger;

  /**
   * @param {string} apiKey - Mistral API key
   * @param {object} [options={}]
   * @param {number} [options.timeout=120000] - Request timeout in ms
   */
  constructor(apiKey, options = {}) {
    super();
    this.#apiKey = apiKey;
    this.#logger = Logger.createChild('MistralChatProvider');
    this._timeout = options.timeout ?? 120000;
  }

  /** @returns {string[]} */
  static get capabilities() {
    return ['chat', 'chatStream'];
  }

  /**
   * Send a chat completion request via Mistral API (OpenAI-compatible).
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {Promise<{content: string, usage: object}>}
   */
  async chat(messages, options = {}) {
    this._validateOptions(options);

    const body = {
      model: options.model ?? 'mistral-small-latest',
      messages,
      max_tokens: options.maxTokens ?? 1024
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Mistral API error ${response.status}: ${errorData.message || response.statusText}`
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';

      return {
        content,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens ?? 0,
          completion_tokens: data.usage?.completion_tokens ?? 0,
          total_tokens: data.usage?.total_tokens ?? 0
        }
      };
    } catch (error) {
      clearTimeout(timeoutId);
      this.#logger.error('Mistral chat failed:', error.message);
      throw error;
    }
  }

  /**
   * Send a streaming chat completion request via Mistral API.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    this._validateOptions(options);

    const body = {
      model: options.model ?? 'mistral-small-latest',
      messages,
      max_tokens: options.maxTokens ?? 1024,
      stream: true
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify(body),
      signal: options.abortSignal
    });

    if (!response.ok) {
      throw new Error(`Mistral streaming error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { token: '', done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) yield { token, done: false };
          } catch {
            /* skip non-JSON lines */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { token: '', done: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai/providers/MistralChatProvider.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ai/providers/MistralChatProvider.mjs tests/ai/providers/MistralChatProvider.test.js
git commit -m "feat: add MistralChatProvider for Mistral AI integration"
```

---

### Task 3: Create FallbackChatProvider

**Files:**
- Create: `scripts/ai/providers/FallbackChatProvider.mjs`
- Create: `tests/ai/providers/FallbackChatProvider.test.js`

- [ ] **Step 1: Write the test file**

Create `tests/ai/providers/FallbackChatProvider.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackChatProvider } from '../../../scripts/ai/providers/FallbackChatProvider.mjs';

vi.mock('../../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
  }
}));

function createMockProvider(name, chatResult) {
  return {
    name,
    constructor: { capabilities: ['chat', 'chatStream'] },
    chat: vi.fn().mockResolvedValue(chatResult || { content: `Response from ${name}`, usage: {} })
  };
}

function createFailingProvider(name, error) {
  return {
    name,
    constructor: { capabilities: ['chat', 'chatStream'] },
    chat: vi.fn().mockRejectedValue(error || new Error(`${name} failed`))
  };
}

function createMockRegistry(providers) {
  return {
    getProvidersForCapability: vi.fn().mockReturnValue(
      providers.map((p) => ({ name: p.name, provider: p }))
    )
  };
}

describe('FallbackChatProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('capabilities', () => {
    it('should expose chat and chatStream capabilities', () => {
      expect(FallbackChatProvider.capabilities).toContain('chat');
      expect(FallbackChatProvider.capabilities).toContain('chatStream');
    });
  });

  describe('chat() — happy path', () => {
    it('should use the first (default) provider when it succeeds', async () => {
      const primary = createMockProvider('openai', { content: 'OpenAI response', usage: {} });
      const secondary = createMockProvider('mistral');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'test' }]);

      expect(result.content).toBe('OpenAI response');
      expect(primary.chat).toHaveBeenCalledTimes(1);
      expect(secondary.chat).not.toHaveBeenCalled();
      expect(fallback.lastUsedProvider).toBe('openai');
    });
  });

  describe('chat() — fallback on retryable errors', () => {
    it('should fall back to second provider on 5xx error', async () => {
      const error = new Error('Mistral API error 500: Internal server error');
      error.status = 500;
      const primary = createFailingProvider('openai', error);
      const secondary = createMockProvider('mistral', { content: 'Mistral saved it', usage: {} });
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'test' }]);

      expect(result.content).toBe('Mistral saved it');
      expect(primary.chat).toHaveBeenCalledTimes(1);
      expect(secondary.chat).toHaveBeenCalledTimes(1);
      expect(fallback.lastUsedProvider).toBe('mistral');
    });

    it('should fall back on quota exceeded (429)', async () => {
      const error = new Error('OpenAI API error 429: insufficient_quota');
      error.status = 429;
      const primary = createFailingProvider('openai', error);
      const secondary = createMockProvider('mistral', { content: 'Fallback OK', usage: {} });
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'test' }]);

      expect(result.content).toBe('Fallback OK');
    });

    it('should fall back on timeout (AbortError)', async () => {
      const error = new DOMException('The operation was aborted', 'AbortError');
      const primary = createFailingProvider('openai', error);
      const secondary = createMockProvider('google', { content: 'Google response', usage: {} });
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'test' }]);

      expect(result.content).toBe('Google response');
    });

    it('should try all providers before throwing', async () => {
      const error1 = new Error('API error 500');
      error1.status = 500;
      const error2 = new Error('API error 503');
      error2.status = 503;
      const primary = createFailingProvider('openai', error1);
      const secondary = createFailingProvider('mistral', error2);
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'test' }])).rejects.toThrow();

      expect(primary.chat).toHaveBeenCalledTimes(1);
      expect(secondary.chat).toHaveBeenCalledTimes(1);
    });
  });

  describe('chat() — non-retryable errors', () => {
    it('should NOT fall back on 400 Bad Request', async () => {
      const error = new Error('API error 400: Bad request');
      error.status = 400;
      const primary = createFailingProvider('openai', error);
      const secondary = createMockProvider('mistral');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'API error 400'
      );
      expect(secondary.chat).not.toHaveBeenCalled();
    });

    it('should NOT fall back on 401 Unauthorized (user config error)', async () => {
      const error = new Error('API error 401: Unauthorized');
      error.status = 401;
      const primary = createFailingProvider('openai', error);
      const secondary = createMockProvider('mistral');
      const registry = createMockRegistry([primary, secondary]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'API error 401'
      );
      expect(secondary.chat).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should work with only one provider (no fallback needed)', async () => {
      const primary = createMockProvider('openai', { content: 'Only one', usage: {} });
      const registry = createMockRegistry([primary]);
      const fallback = new FallbackChatProvider(registry);

      const result = await fallback.chat([{ role: 'user', content: 'test' }]);

      expect(result.content).toBe('Only one');
    });

    it('should throw if no providers are registered', async () => {
      const registry = createMockRegistry([]);
      const fallback = new FallbackChatProvider(registry);

      await expect(fallback.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'No chat providers available'
      );
    });

    it('should pass options through to providers', async () => {
      const primary = createMockProvider('openai');
      const registry = createMockRegistry([primary]);
      const fallback = new FallbackChatProvider(registry);
      const opts = { model: 'gpt-4o', temperature: 0.5 };

      await fallback.chat([{ role: 'user', content: 'test' }], opts);

      expect(primary.chat).toHaveBeenCalledWith(
        [{ role: 'user', content: 'test' }],
        opts
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/providers/FallbackChatProvider.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create the FallbackChatProvider**

Create `scripts/ai/providers/FallbackChatProvider.mjs`:

```javascript
/**
 * FallbackChatProvider - Transparent fallback decorator for chat providers
 *
 * Wraps ProviderRegistry and attempts the default provider first.
 * If it fails with a retryable error (5xx, 429, timeout), tries the next
 * registered provider for the 'chat' capability.
 *
 * Non-retryable errors (400, 401, 403, 422) are thrown immediately
 * because they indicate user configuration errors, not transient failures.
 *
 * @class FallbackChatProvider
 * @augments ChatProvider
 * @module vox-chronicle
 */

import { ChatProvider } from './ChatProvider.mjs';
import { Logger } from '../../utils/Logger.mjs';

/** HTTP status codes that should NOT trigger a fallback */
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 422]);

export class FallbackChatProvider extends ChatProvider {
  #registry;
  #logger;
  #lastUsedProvider = null;
  #fallbackNotified = false;

  /**
   * @param {import('./ProviderRegistry.mjs').ProviderRegistry} registry
   */
  constructor(registry) {
    super();
    this.#registry = registry;
    this.#logger = Logger.createChild('FallbackChatProvider');
  }

  /** @returns {string[]} */
  static get capabilities() {
    return ['chat', 'chatStream'];
  }

  /** @returns {string|null} Name of the last provider that successfully responded */
  get lastUsedProvider() {
    return this.#lastUsedProvider;
  }

  /**
   * Send a chat request with automatic fallback.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {Promise<{content: string, usage: object}>}
   */
  async chat(messages, options = {}) {
    const providers = this.#registry.getProvidersForCapability('chat');
    if (providers.length === 0) {
      throw new Error('No chat providers available');
    }

    let lastError = null;

    for (const { name, provider } of providers) {
      try {
        const result = await provider.chat(messages, options);
        this.#lastUsedProvider = name;
        return result;
      } catch (error) {
        lastError = error;

        if (!this.#isRetryable(error)) {
          throw error;
        }

        this.#logger.warn(
          `Provider '${name}' failed (retryable): ${error.message}`
        );

        if (!this.#fallbackNotified) {
          this.#fallbackNotified = true;
          ui?.notifications?.info(
            game?.i18n?.localize('VOXCHRONICLE.Provider.FallbackActivated') ||
              'VoxChronicle: Primary AI provider unavailable, trying fallback...'
          );
        }
      }
    }

    this.#logger.error('All providers failed, throwing last error');
    throw lastError;
  }

  /**
   * Send a streaming chat request with automatic fallback.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options={}]
   * @returns {AsyncGenerator<{token: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    const providers = this.#registry.getProvidersForCapability('chat');
    if (providers.length === 0) {
      throw new Error('No chat providers available');
    }

    let lastError = null;

    for (const { name, provider } of providers) {
      try {
        yield* provider.chatStream(messages, options);
        this.#lastUsedProvider = name;
        return;
      } catch (error) {
        lastError = error;

        if (!this.#isRetryable(error)) {
          throw error;
        }

        this.#logger.warn(
          `Provider '${name}' streaming failed (retryable): ${error.message}`
        );
      }
    }

    throw lastError;
  }

  /**
   * Determine if an error is retryable (should trigger fallback).
   * @param {Error} error
   * @returns {boolean}
   * @private
   */
  #isRetryable(error) {
    // Timeout / abort — retryable
    if (error.name === 'AbortError') return true;

    // Network errors — retryable
    if (error.message?.includes('fetch failed') || error.message?.includes('network')) return true;

    // Extract HTTP status from error message (e.g., "API error 500: ...")
    const statusMatch = error.message?.match(/\b(\d{3})\b/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      if (error.status) {
        return !NON_RETRYABLE_STATUSES.has(error.status);
      }
      if (status >= 100 && status < 600) {
        return !NON_RETRYABLE_STATUSES.has(status);
      }
    }

    // Unknown errors — retryable (fail open to try next provider)
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai/providers/FallbackChatProvider.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ai/providers/FallbackChatProvider.mjs tests/ai/providers/FallbackChatProvider.test.js
git commit -m "feat: add FallbackChatProvider for automatic provider failover"
```

---

### Task 4: Add Mistral settings and wire into VoxChronicle

**Files:**
- Modify: `scripts/core/Settings.mjs` (3 locations)
- Modify: `scripts/core/VoxChronicle.mjs` (2 locations)

- [ ] **Step 1: Add Mistral API key setting**

In `scripts/core/Settings.mjs`, after the `googleApiKey` registration (line ~72), add:

```javascript
    // Mistral API Key (client-side, per user)
    game.settings.register(MODULE_ID, 'mistralApiKey', {
      name: 'VOXCHRONICLE.Settings.MistralKey',
      hint: 'VOXCHRONICLE.Settings.MistralKeyHint',
      scope: 'client',
      config: true,
      type: String,
      default: '',
      onChange: () => Settings._onApiKeyChange('mistral')
    });
```

- [ ] **Step 2: Add `'mistral-chat'` to provider choice settings**

In `scripts/core/Settings.mjs`, update the three `choices` objects for `aiProviderSuggestions`, `aiProviderRules`, and `aiProviderExtraction` to add:

```javascript
      choices: {
        default: 'Default',
        'openai-chat': 'OpenAI',
        'anthropic-chat': 'Anthropic Claude',
        'google-chat': 'Google Gemini',
        'mistral-chat': 'Mistral AI'
      }
```

- [ ] **Step 3: Register Mistral provider in VoxChronicle.initialize()**

In `scripts/core/VoxChronicle.mjs`, after the Google provider registration block (line ~327), add:

```javascript
      // Register Mistral provider
      const mistralApiKey = this._getSetting('mistralApiKey')?.trim();
      if (mistralApiKey) {
        const { MistralChatProvider } = await import('../ai/providers/MistralChatProvider.mjs');
        const mistralChat = new MistralChatProvider(mistralApiKey);
        registry.register('mistral-chat', mistralChat, {
          default: !openaiApiKey && !anthropicApiKey && !googleApiKey
        });
        logger.info('Mistral provider registered');
      }
```

Also add `mistralApiKey` to the API key reading block at the top (after line 277):

```javascript
      const mistralApiKey = this._getSetting('mistralApiKey')?.trim();
```

- [ ] **Step 4: Wire FallbackChatProvider into service creation**

In `scripts/core/VoxChronicle.mjs`, after ALL providers are registered (after the Mistral block), wrap the chat provider with fallback:

```javascript
      // Wrap chat capability with fallback decorator
      const { FallbackChatProvider } = await import('../ai/providers/FallbackChatProvider.mjs');
      const fallbackChat = new FallbackChatProvider(registry);
```

Then replace all `registry.getProvider('chat')` calls in the same method with `fallbackChat`:

- `new AIAssistant({ chatProvider: fallbackChat, ... })`
- `new EntityExtractor(fallbackChat)`
- `new NarrativeExporter({ chatProvider: fallbackChat })`

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (existing mocks still work because FallbackChatProvider delegates to whatever provider is registered)

- [ ] **Step 6: Commit**

```bash
git add scripts/core/Settings.mjs scripts/core/VoxChronicle.mjs
git commit -m "feat: wire MistralChatProvider and FallbackChatProvider into initialization"
```

---

### Task 5: Add localization strings for all 8 language files

**Files:**
- Modify: `lang/en.json`, `lang/it.json`, `lang/de.json`, `lang/es.json`, `lang/fr.json`, `lang/ja.json`, `lang/pt.json`, `lang/template.json`

- [ ] **Step 1: Add English strings**

In `lang/en.json`, in the `Settings` section near the other API keys, add:

```json
"MistralKey": "Mistral API Key",
"MistralKeyHint": "Your Mistral API key for Mistral AI models (optional)"
```

In the `Provider` section, add:

```json
"FallbackActivated": "VoxChronicle: Primary AI provider unavailable, trying fallback..."
```

- [ ] **Step 2: Add strings to all other 7 language files**

Apply equivalent translations for `it.json`, `de.json`, `es.json`, `fr.json`, `ja.json`, `pt.json`, `template.json`. The `template.json` should use the English strings as placeholders.

Italian (`it.json`):
```json
"MistralKey": "Chiave API Mistral",
"MistralKeyHint": "La tua chiave API Mistral per i modelli Mistral AI (opzionale)",
"FallbackActivated": "VoxChronicle: Provider AI primario non disponibile, tentativo con fallback..."
```

German (`de.json`):
```json
"MistralKey": "Mistral API-Schlüssel",
"MistralKeyHint": "Ihr Mistral API-Schlüssel für Mistral AI Modelle (optional)",
"FallbackActivated": "VoxChronicle: Primärer KI-Anbieter nicht verfügbar, versuche Fallback..."
```

Spanish (`es.json`):
```json
"MistralKey": "Clave API de Mistral",
"MistralKeyHint": "Tu clave API de Mistral para modelos Mistral AI (opcional)",
"FallbackActivated": "VoxChronicle: Proveedor de IA primario no disponible, intentando respaldo..."
```

French (`fr.json`):
```json
"MistralKey": "Clé API Mistral",
"MistralKeyHint": "Votre clé API Mistral pour les modèles Mistral AI (optionnel)",
"FallbackActivated": "VoxChronicle: Fournisseur IA principal indisponible, tentative de repli..."
```

Japanese (`ja.json`):
```json
"MistralKey": "Mistral APIキー",
"MistralKeyHint": "Mistral AIモデル用のMistral APIキー（オプション）",
"FallbackActivated": "VoxChronicle: プライマリAIプロバイダーが利用不可、フォールバックを試行中..."
```

Portuguese (`pt.json`):
```json
"MistralKey": "Chave API Mistral",
"MistralKeyHint": "Sua chave API Mistral para modelos Mistral AI (opcional)",
"FallbackActivated": "VoxChronicle: Provedor de IA primário indisponível, tentando fallback..."
```

- [ ] **Step 3: Commit**

```bash
git add lang/
git commit -m "feat: add Mistral and fallback localization strings for all 8 languages"
```

---

### Task 6: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/API_REFERENCE.md`

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, update the **Project Structure** to add:
- `MistralChatProvider.mjs` under `scripts/ai/providers/`
- `FallbackChatProvider.mjs` under `scripts/ai/providers/`

In the **Settings Registration** section, add the `mistralApiKey` setting example.

In the **Code Patterns** section, add a **Provider Fallback Pattern** subsection:

```markdown
### Provider Fallback Pattern

All chat consumers use FallbackChatProvider which transparently retries across providers:

```javascript
// FallbackChatProvider wraps the registry — consumers don't know about fallback
const fallbackChat = new FallbackChatProvider(registry);
const assistant = new AIAssistant({ chatProvider: fallbackChat });

// If OpenAI fails (quota, timeout, 5xx), automatically tries Anthropic, Google, Mistral
// Non-retryable errors (400, 401, 403) are thrown immediately
```
```

Update the **provider inventory table** to add:
```
| MistralChatProvider | Chat | Implemented | mistral-small-latest | OpenAI-compatible API |
| FallbackChatProvider | Chat (decorator) | Implemented | — | Transparent retry across providers |
```

- [ ] **Step 2: Update docs/ARCHITECTURE.md**

Add MistralChatProvider and FallbackChatProvider to the provider layer description. Add a diagram showing the fallback chain:

```
Consumer (AIAssistant) → FallbackChatProvider → Provider 1 (default) → success? return
                                               → Provider 2 → success? return
                                               → Provider 3 → success? return
                                               → throw last error
```

- [ ] **Step 3: Update docs/USER_GUIDE.md**

Add a **Mistral AI Configuration** section with instructions for getting a Mistral API key and configuring it in module settings.

Add a **Provider Fallback** section explaining that if the primary provider fails, VoxChronicle automatically tries other configured providers.

- [ ] **Step 4: Update docs/API_REFERENCE.md**

Add MistralChatProvider and FallbackChatProvider class documentation following the existing format.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/USER_GUIDE.md docs/API_REFERENCE.md
git commit -m "docs: add MistralChatProvider, FallbackChatProvider, and multi-provider documentation"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS including new MistralChatProvider and FallbackChatProvider tests.

- [ ] **Step 2: Run integration tests (if API key available)**

Run: `npx vitest run --config vitest.integration.config.js`
Expected: Live tests PASS or SKIP (depending on API key availability).

- [ ] **Step 3: Verify no regressions**

Compare test count before and after. Before: 5227. After: should be ~5250+ with new tests.
