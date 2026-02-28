# Testing Patterns

**Analysis Date:** 2026-02-28

## Test Framework

**Runner:**
- Vitest 2.0 (configured in `vitest.config.js` and `vitest.integration.config.js`)
- Environment: jsdom (browser-like DOM for Foundry compatibility)
- Globals: enabled (`globals: true` — no need for import { describe, it, expect, ... })

**Config Locations:**
- Unit tests: `vitest.config.js` (default, runs tests/**/*.test.{js,mjs})
- Integration tests: `vitest.integration.config.js` (slower tests with 30s timeout)

**Assertion Library:**
- Vitest native expect() (compatible with Jest)
- Examples: `expect(value).toBe(expected)`, `expect(fn).toThrow()`, `expect(spy).toHaveBeenCalled()`

**Run Commands:**
```bash
npm test                # Run all unit tests, exit on completion
npm run test:watch      # Watch mode - re-run on file change
npm run test:ui         # Interactive UI for test exploration
npm run test:coverage   # Generate coverage reports (HTML in ./coverage)
npm run test:integration # Run integration tests only
```

## Test File Organization

**Location:**
- Co-located with source files in parallel directory structure
- Source: `scripts/utils/Logger.mjs` → Test: `tests/utils/Logger.test.js`
- Source: `scripts/ai/OpenAIClient.mjs` → Test: `tests/ai/OpenAIClient.test.js`

**Naming:**
- Test files: `{ModuleName}.test.js` (always .js, not .mjs)
- Tests run via Vitest, not as ES modules

**Directory Structure:**
```
tests/
├── helpers/              # Shared test utilities
│   ├── setup.js         # Global beforeEach/afterEach hooks
│   ├── foundry-mock.js  # Foundry VTT API mocks
│   └── ...
├── fixtures/            # Test data (audio samples, mock responses)
│   └── audio-samples.js # Audio blob fixtures
├── utils/               # Tests for scripts/utils/
│   ├── Logger.test.js
│   ├── RateLimiter.test.js
│   └── ...
├── ai/                  # Tests for scripts/ai/
│   ├── OpenAIClient.test.js
│   ├── TranscriptionService.test.js
│   └── ...
├── core/                # Tests for scripts/core/
├── ui/                  # Tests for scripts/ui/
├── narrator/            # Tests for scripts/narrator/
├── orchestration/       # Tests for scripts/orchestration/
├── kanka/               # Tests for scripts/kanka/
├── audio/               # Tests for scripts/audio/
├── rag/                 # Tests for scripts/rag/
├── integration/         # Slower integration tests
└── static-analysis/     # Cross-module validation tests
```

## Test Structure

**Global Setup:**
- File: `tests/helpers/setup.js`
- Runs via `setupFiles: ['tests/helpers/setup.js']` in vitest.config.js
- Executes `beforeEach()` and `afterEach()` before every test file

**Setup Pattern (from setup.js):**
```javascript
beforeEach(() => {
  setupFoundryMocks();         // game.settings, game.i18n, game.user
  globalThis.Hooks = createMockHooks();
  globalThis.ui = { notifications: { info: vi.fn(), ... } };
  globalThis.Dialog = class Dialog { ... };
  // FormData, Blob, File already available in jsdom
});

afterEach(() => {
  clearFoundryMocks();
  delete globalThis.Hooks;
  delete globalThis.ui;
  vi.restoreAllMocks();  // Clear all spies/mocks
});
```

**Standard Test Suite Pattern:**
```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MyClass } from '../../scripts/path/MyClass.mjs';

describe('MyClass', () => {
  let instance;
  let mockDependency;

  beforeEach(() => {
    mockDependency = { method: vi.fn() };
    instance = new MyClass(mockDependency);
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('methodName()', () => {
    it('should do something on happy path', () => {
      expect(instance.methodName()).toBe(expected);
    });

    it('should handle error case', () => {
      expect(() => instance.badMethod()).toThrow('Expected error');
    });
  });
});
```

**Nesting:**
- Use nested `describe()` blocks to organize tests by method/feature
- Section headers: `describe('methodName()', () => { ... })`
- Multiple test suites in one file: one top-level describe per class, nested describes per method

## Test Coverage Requirements

**Thresholds (from vitest.config.js):**
```
statements: 90%
branches: 85%
functions: 90%
lines: 90%
```

**Excluded from Coverage:**
- `scripts/data/**` — vocabulary dictionaries (data files)
- `scripts/constants.mjs` — single export, trivial
- `scripts/main.mjs` — Foundry hooks registration, hard to test

**View Coverage:**
```bash
npm run test:coverage    # Generate HTML report in ./coverage
# Open coverage/index.html in browser
```

## Mocking

**Framework:** Vitest `vi` object (compatible with Jest mocks)

**Mock Patterns:**

### 1. Module Mocking with vi.mock()
```javascript
// Mock Logger module
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

// In tests, Logger is now the mock:
import { Logger } from '../../scripts/utils/Logger.mjs';
Logger.createChild('Test');  // Calls vi.fn()
```

### 2. Hoisted Mock Values (for mocks that persist across afterEach)
```javascript
const mockFunctions = vi.hoisted(() => ({
  isValidBlob: vi.fn().mockReturnValue(true),
  getSize: vi.fn().mockReturnValue(1024)
}));

vi.mock('../../scripts/utils/AudioUtils.mjs', () => ({
  AudioUtils: mockFunctions
}));
```

### 3. Fetch Mocking (API calls)
```javascript
let fetchSpy;

beforeEach(() => {
  // Helper function for mock responses
  function mockResponse(body, status = 200, headers = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(JSON.stringify(body))
    };
  }

  fetchSpy = vi.fn().mockResolvedValue(mockResponse({ data: 'ok' }));
  globalThis.fetch = fetchSpy;
});

// In test:
await client.request('/endpoint');
expect(fetchSpy).toHaveBeenCalledWith('https://api.openai.com/v1/endpoint', expect.any(Object));
```

### 4. Console Spying
```javascript
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
```

### 5. Spy on Instance Methods
```javascript
const instance = new MyClass();
const spy = vi.spyOn(instance, 'methodName').mockReturnValue('mocked');
instance.methodName();
expect(spy).toHaveBeenCalled();
```

### 6. Foundry VTT API Mocks
```javascript
// Use helper in tests/helpers/foundry-mock.js
import { createMockSettings, createMockI18n, createMockUser } from '../helpers/foundry-mock.js';

const mockSettings = createMockSettings({
  'vox-chronicle.openaiApiKey': 'sk-test-123',
  'vox-chronicle.enabled': true
});

// Access: mockSettings.get('vox-chronicle', 'openaiApiKey') → 'sk-test-123'
```

**What to Mock:**
- External APIs (fetch, OpenAI, Kanka)
- Third-party libraries (AudioChunker, VocabularyDictionary)
- Expensive operations (real database calls, long timers)
- Foundry VTT globals (game.settings, ui.notifications)
- Logger (to verify logging without console noise)

**What NOT to Mock:**
- Core utilities (CacheManager, RateLimiter, HtmlUtils — test them directly)
- Error classes (test real throw/catch behavior)
- The class being tested (test the real implementation)

## Fixtures and Factories

**Audio Fixtures (tests/fixtures/audio-samples.js):**
```javascript
import { createMockAudioBlob, createMockAudioFile, AUDIO_SIZES } from '../fixtures/audio-samples.js';

// Create test audio blobs
const smallBlob = createMockAudioBlob(AUDIO_SIZES.SMALL);  // 1 KB
const largeBlob = createMockAudioBlob(AUDIO_SIZES.OVERSIZED);  // 26 MB (exceeds limit)
const webmBlob = createRealisticWebMBlob(1024);  // WebM with EBML header

// Create File objects
const file = createMockAudioFile(1024, 'session.webm', 'audio/webm');
```

**Audio Size Constants:**
- TINY: 512 bytes
- SMALL: 1 KB
- MEDIUM: 50 KB
- LARGE: 1 MB
- VERY_LARGE: 10 MB
- NEAR_LIMIT: 24 MB (just under 25MB API limit)
- OVERSIZED: 26 MB (requires chunking)
- HUGE: 50 MB (multiple chunks)

**Settings Fixture:**
```javascript
import { createMockSettings } from '../helpers/foundry-mock.js';

const settings = createMockSettings({
  'vox-chronicle.openaiApiKey': 'sk-test-key',
  'vox-chronicle.kankaCampaignId': '123'
});

// Access: settings.get('vox-chronicle', 'openaiApiKey') → 'sk-test-key'
// Set: settings.set('vox-chronicle', 'key', 'value')
```

## Common Test Patterns

### Testing Async Methods
```javascript
it('should transcribe audio', async () => {
  const blob = createMockAudioBlob(1024);
  const result = await service.transcribe(blob);
  expect(result).toBeDefined();
  expect(result.text).toContain('...');
});

it('should handle transcription timeout', async () => {
  const blob = createMockAudioBlob(AUDIO_SIZES.OVERSIZED);
  await expect(service.transcribe(blob)).rejects.toThrow('Timeout');
});
```

### Testing Error Handling
```javascript
it('should throw on invalid API key', () => {
  const client = new OpenAIClient('');  // Empty key
  expect(() => client._buildAuthHeaders()).toThrow('No API key configured');
});

it('should retry on rate limit error', async () => {
  fetchSpy
    .mockResolvedValueOnce(mockResponse({}, 429))  // First call: rate limit
    .mockResolvedValueOnce(mockResponse({ data: 'ok' }));  // Retry: success

  const result = await client.request('/endpoint');
  expect(result).toBeDefined();
  expect(fetchSpy).toHaveBeenCalledTimes(2);  // Called twice (initial + retry)
});
```

### Testing Event Handlers
```javascript
it('should handle button click', async () => {
  const panel = MainPanel.getInstance();
  const event = new MouseEvent('click');
  const target = document.createElement('button');

  await panel._onToggleRecording(event, target);
  // Verify state changed, UI updated, etc.
});
```

### Testing Singletons
```javascript
it('should return same instance', () => {
  const instance1 = VoxChronicle.getInstance();
  const instance2 = VoxChronicle.getInstance();
  expect(instance1).toBe(instance2);
});

it('should reset singleton in tests', () => {
  VoxChronicle.resetInstance();
  const newInstance = VoxChronicle.getInstance();
  expect(newInstance).not.toBe(oldInstance);
});
```

### Testing Circuit Breaker
```javascript
it('should open circuit breaker after failures', async () => {
  fetchSpy.mockRejectedValue(new Error('Network error'));

  // First 3 calls fail
  for (let i = 0; i < 3; i++) {
    await expect(client.request('/endpoint')).rejects.toThrow();
  }

  // 4th call throws immediately (circuit open)
  await expect(client.request('/endpoint')).rejects.toThrow('Circuit breaker open');
});
```

### Testing Retry Logic
```javascript
it('should retry with exponential backoff', async () => {
  fetchSpy
    .mockRejectedValueOnce(new Error('Timeout'))  // Fail
    .mockResolvedValueOnce(mockResponse({ data: 'ok' }));  // Succeed

  const result = await client.request('/endpoint');
  expect(result.data).toBe('ok');
  expect(fetchSpy).toHaveBeenCalledTimes(2);  // Initial + retry
});
```

### Testing Rate Limiting
```javascript
it('should throttle requests to rate limit', async () => {
  const limiter = new RateLimiter({ requestsPerMinute: 2 });
  const start = Date.now();

  // Queue 3 requests
  await Promise.all([
    limiter.throttle(() => Promise.resolve('1')),
    limiter.throttle(() => Promise.resolve('2')),
    limiter.throttle(() => Promise.resolve('3'))
  ]);

  const elapsed = Date.now() - start;
  // Expect ~30 seconds for 3 requests at 2 per minute
  expect(elapsed).toBeGreaterThan(29000);
});
```

## Vitest-Specific Features

**Test Isolation:**
- Each test runs in a clean state (beforeEach/afterEach ensure isolation)
- `afterEach(() => vi.restoreAllMocks())` clears all mocks between tests

**Spy + Mock Combination:**
```javascript
const spy = vi.spyOn(obj, 'method').mockImplementation(() => 'mocked');
// spy is both a spy (can check calls) AND a mock (returns mocked value)
```

**Matching Arguments:**
```javascript
expect(fetchSpy).toHaveBeenCalledWith(url, expect.any(Object));
expect(fetchSpy).toHaveBeenCalledWith(
  expect.stringContaining('/v1/'),
  expect.objectContaining({ method: 'POST' })
);
```

**Timeout Control:**
```javascript
// In vitest.config.js
testTimeout: 5000,      // 5 seconds per test
hookTimeout: 10000,     // 10 seconds for beforeEach/afterEach

// Override per test:
it('slow operation', async () => { ... }, 30000);  // 30 second timeout
```

## Integration Testing

**File:** `vitest.integration.config.js`

**When to Use:**
- Testing complete workflows (recording → transcription → publishing)
- Multi-service interactions
- Real timers and delays (use `vi.useFakeTimers()` for control)

**Example Structure:**
```javascript
// tests/integration/vox-chronicle-full-workflow.test.js
describe('VoxChronicle Full Workflow', () => {
  it('should record, transcribe, extract, and publish', async () => {
    // Setup complete module with services
    const vc = VoxChronicle.getInstance();

    // Simulate user workflow
    await vc.startSession();
    await vc.recordAudio(blob);
    const transcript = await vc.processTranscription();
    const entities = await vc.extractEntities(transcript.text);
    await vc.publishToKanka(entities);

    // Verify end state
    expect(transcript).toBeDefined();
    expect(entities.length).toBeGreaterThan(0);
  });
});
```

## Test Naming Conventions

**Suite Names:**
- Match class name: `describe('OpenAIClient', () => { ... })`
- For features: `describe('retry logic', () => { ... })`

**Test Names (it() descriptions):**
- Start with "should": `it('should throw on invalid key')`
- Describe expected behavior: `it('should retry up to 3 times')`
- Include edge case context: `it('should handle 429 rate limit error')`
- Avoid "test works" or "it runs" — be specific

**Bad Examples:**
- `it('works')` — too vague
- `it('throws')` — missing context
- `it('OpenAIClient retries')` — redundant (already in describe block)

**Good Examples:**
- `it('should retry with exponential backoff on network error')`
- `it('should throw OpenAIError with RATE_LIMIT_ERROR type')`
- `it('should ignore values outside valid log level range')`

## Static Analysis Tests

**File:** `tests/static-analysis/`

**Purpose:** Verify cross-module patterns and conventions

**Examples:**
- All service classes use Logger child loggers
- MODULE_ID only imported from constants.mjs
- No console.log calls (only Logger)
- CSS classes use vox-chronicle prefix

## Debugging Tests

**Enable Debug Output:**
```bash
npm run test:watch    # Re-run tests as you edit
# Tests output: failures and passes in terminal
```

**Debug in Browser:**
```bash
npm run test:ui       # Open interactive UI
# Shows test tree, can click to run individual tests
```

**Log in Tests:**
```javascript
it('debug example', () => {
  console.log('This will appear in test output');
  // Or use Logger:
  Logger.setLogLevel(LogLevel.DEBUG);
  Logger.debug('Debug message');
});
```

**Inspect Mock Calls:**
```javascript
const spy = vi.spyOn(obj, 'method');
obj.method('arg1', 'arg2');
console.log(spy.mock.calls);  // [['arg1', 'arg2']]
console.log(spy.mock.results);  // [{ type: 'return', value: ... }]
```

---

*Testing analysis: 2026-02-28*
