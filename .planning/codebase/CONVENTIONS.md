# Coding Conventions

**Analysis Date:** 2026-02-28

## Naming Patterns

**Files:**
- Module files: PascalCase with `.mjs` extension (e.g., `Logger.mjs`, `OpenAIClient.mjs`)
- Test files: Match source file name + `.test.js` suffix (e.g., `Logger.test.js` for `Logger.mjs`)
- Templates: kebab-case with `.hbs` extension (e.g., `main-panel.hbs`)
- Stylesheets: kebab-case with `.css` extension (e.g., `vox-chronicle.css`)
- Language files: two-letter code (e.g., `en.json`, `fr.json`)

**Classes:**
- PascalCase for all class names (e.g., `Logger`, `OpenAIClient`, `MainPanel`, `TranscriptionService`)
- Singleton classes use static `getInstance()` method (see `VoxChronicle`, `MainPanel`)
- Exception classes extend `Error` (e.g., `OpenAIError` extends `Error`)

**Functions:**
- camelCase for all function and method names (e.g., `setApiKey()`, `extractEntities()`)
- Private/internal methods prefixed with underscore (e.g., `_retryWithBackoff()`, `_buildAuthHeaders()`)
- Static methods prefixed with underscore for action handlers: `_onToggleRecording()`, `_onProcessSession()`
- Async methods: use `async` keyword, no special naming convention

**Variables:**
- camelCase for all variable names, const by default: `const apiKey = '...'`
- Private static fields use hash prefix and camelCase: `static #instance = null`, `#listenerController = null`
- Constants in SCREAMING_SNAKE_CASE when exported module-level: `const OPENAI_BASE_URL = '...'`, `const DEFAULT_TIMEOUT_MS = 120000`
- Enums use PascalCase for type name, SCREAMING_SNAKE_CASE for keys: `const LogLevel = { DEBUG: 0, INFO: 1 }`
- Boolean variables use `is/has` prefix: `isRecording`, `hasConfig`, `_debugEnabled`, `_processingQueue`

**Types and Interfaces:**
- JSDoc `@typedef` for type definitions: `@typedef {Object} Suggestion`
- Optional properties in JSDoc: `@property {string} [pageReference]`
- Generic types: use JSDoc `{Array<string>}`, `{Map<string, number>}`

## Code Style

**Formatting:**
- Formatter: Prettier (configured in `.prettierrc.json`)
- Line width: 100 characters (printWidth: 100)
- Tab width: 2 spaces (no tabs)
- Semicolons: required (semi: true)
- Quotes: single quotes (singleQuote: true)
- Trailing commas: none (trailingComma: "none")
- Arrow parens: always (arrowParens: "always")
- End of line: LF (endOfLine: "lf")

**Linting:**
- Tool: ESLint 9 (flat config in `eslint.config.js`)
- Base: `@eslint/js` recommended rules
- JSDoc plugin: `eslint-plugin-jsdoc` for documentation validation
- Max line length: 120 characters (code), 150 characters (comments)
- Variable naming: allow underscore prefix (`argsIgnorePattern: '^_'`) for unused parameters

**Enforced Rules:**
- `prefer-const`: error — always use const, never let or var
- `no-var`: error — var is forbidden
- `no-undef`: error — all globals must be declared
- `eqeqeq`: error (always, null: ignore) — use === except for null checks
- `curly`: error (multi-line, consistent) — require braces for multi-line blocks
- `brace-style`: error (1tbs, allowSingleLine) — one true brace style
- `prefer-arrow-callback`: warn — arrow functions in callbacks
- `prefer-template`: warn — template literals over concatenation
- `jsdoc/require-param`, `jsdoc/require-returns`: warn — document parameters and returns

## Import Organization

**Order:**
1. Built-in modules (Node.js - rarely used in browser modules)
2. Third-party libraries (vitest, foundry API modules)
3. Relative imports from sibling directories (via `../`)
4. Relative imports from same directory (via `./`)

**Pattern:**
```javascript
// Standard pattern in VoxChronicle files
import { MODULE_ID } from '../constants.mjs';        // constants first
import { Logger } from '../utils/Logger.mjs';        // utilities
import { OpenAIClient } from '../ai/OpenAIClient.mjs'; // services
import { SilenceDetector } from './SilenceDetector.mjs'; // local imports
```

**Path Aliases:**
- No path aliases configured — all imports use relative paths
- Never import `MODULE_ID` from `main.mjs` (circular import risk) — always use `constants.mjs`

**Export Style:**
- Named exports preferred: `export { ClassName, FunctionName }`
- Module-level exports common: `export class Logger { ... }`
- Enums exported with class: `export { Logger, LogLevel }`

## Error Handling

**Pattern - Try/Catch:**
```javascript
try {
  const result = await this.apiCall();
  this._logger.log('Success:', result);
  return result;
} catch (error) {
  this._logger.error('API call failed:', error);
  throw error;  // Re-throw to allow caller to handle
}
```

**Custom Error Classes:**
- Extend `Error` with type and status fields
- Examples: `OpenAIError`, `KankaError`
- Include `isRetryable` getter for retry logic
- Extract retry-after headers and store as `retryAfter` property

**Error Propagation:**
- Errors are re-thrown after logging — not swallowed
- Service methods throw errors, callers decide response
- UI layer catches errors and shows notifications via `ErrorNotificationHelper`

**Validation:**
- Check for required config before operations (e.g., API keys, services initialized)
- Throw descriptive Error with clear message: `throw new Error('Audio recorder not configured')`
- Use guard clauses early in methods: `if (!this.isConfigured) throw ...`

## Logging

**Framework:** Custom `Logger` utility in `scripts/utils/Logger.mjs`

**Levels (ascending severity):**
- `Logger.DEBUG()` — only if debug mode enabled (LogLevel.DEBUG = 0)
- `Logger.INFO()` — informational messages (LogLevel.INFO = 1)
- `Logger.log()` — standard messages (LogLevel.LOG = 2, default)
- `Logger.warn()` — warnings (LogLevel.WARN = 3)
- `Logger.error()` — errors (LogLevel.ERROR = 4)
- Set minimum level: `Logger.setLogLevel(LogLevel.DEBUG)` or via `setDebugEnabled(true)`

**Child Loggers:**
```javascript
const logger = Logger.createChild('ClassName');
logger.log('Message here');  // Output: "vox-chronicle:ClassName | Message here"
```

**Prefix Format:**
- Static: `Logger.log()` → `"vox-chronicle |"`
- Child: `Logger.createChild('Service')` → `"vox-chronicle:Service |"`
- Levels added in brackets: `"vox-chronicle | [DEBUG]"`, `"[WARN]"`, `"[ERROR]"`

**When to Log:**
- Use child loggers in every service class: `this._logger = Logger.createChild('ClassName')`
- Log on entry to major async operations: `this._logger.log('Starting transcription...')`
- Log errors with full stack via `error()` method
- Debug logs for internal state, branching, or performance: `this._logger.debug('Queue size:', this._queue.length)`
- Never use `console.log()` directly — always use Logger

**Sensitive Data:**
- Logs are automatically filtered by `SensitiveDataFilter` — removes API keys, tokens from output
- Do NOT log request bodies containing secrets

## Comments

**When to Comment:**
- Algorithm explanation: comment complex logic (retry backoff, rate limiting calculations)
- Non-obvious state transitions: explain why a condition needs to hold
- TODO/FIXME for known issues (prefix with `// TODO:` or `// FIXME:`)
- Section headers: use `// ── Header Name ────────────────────` for grouping in files > 200 lines

**When NOT to Comment:**
- Self-explanatory code (good naming is better than comments)
- Obvious loops or conditionals
- Comments should not repeat what code already says

**JSDoc/TSDoc:**
- Required for: all public methods, class constructors, exported functions
- Optional for: private methods, local variables
- Format: `/** ... */` (multi-line), `@param {type} name - description`, `@returns {type} description`
- Example:
```javascript
/**
 * Extract entities from transcript text
 *
 * @param {string} transcriptText - The session transcript
 * @param {Object} options - Processing options
 * @param {boolean} [options.checkDuplicates=true] - Check for existing entities
 * @returns {Promise<Array>} Array of extracted entities
 * @throws {Error} If extraction fails
 */
async extractEntities(transcriptText, options = {}) {
```

## Function Design

**Size:**
- Aim for < 50 lines per function
- If a function exceeds 100 lines, consider breaking it into helper methods
- Long method example: `_onRender()` in `MainPanel` (~130 lines) with clear sections

**Parameters:**
- Positional: 0-2 required params (use object destructuring for more)
- Options object pattern:
```javascript
async methodName(requiredParam, options = {}) {
  const { optionA = false, optionB = 'default' } = options;
  // Implementation
}
```
- Callbacks passed in options: `{ onProgress: (current, total) => {} }`

**Return Values:**
- Async functions return Promises: `async methodName() { ... }`
- Void operations still return Promise: `async cancel() { return Promise.resolve(); }`
- Nullable returns documented: `@returns {Promise<Array|null>} or null if not found`
- On error: throw (don't return null for errors)

**Async/Await:**
- Preferred over `.then()` for readability
- Use sequential operations: `const a = await op1(); const b = await op2(a);`
- Parallel operations: `const [a, b] = await Promise.all([op1(), op2()]);`
- Circuit breaker: check state before retry: `if (this._circuitOpen) throw new Error('Circuit breaker open')`

## Module Design

**Exports:**
- Each module exports one main class (e.g., `OpenAIClient.mjs` exports `OpenAIClient`)
- Enums and constants exported with class if closely related
- Related error classes exported: `export { OpenAIClient, OpenAIError, OpenAIErrorType }`

**Barrel Files:**
- Not used in VoxChronicle (each import is explicit)
- Services import from specific modules: `import { OpenAIClient } from '../ai/OpenAIClient.mjs'`

**Dependencies:**
- Services receive dependencies via constructor (dependency injection)
- Example: `constructor(openAIClient, options = {}) { this._client = openAIClient; }`
- Avoid circular imports by importing from `constants.mjs` for shared MODULE_ID

**Singleton Pattern:**
- Main classes use static `#instance` field: `static #instance = null;`
- Access via `getInstance()`: `VoxChronicle.getInstance()`
- Include `resetInstance()` for testing: `static resetInstance() { VoxChronicle.#instance = null; }`

## API Client Pattern (OpenAIClient, KankaClient)

**Base Class:**
- Extend `BaseAPIClient` (if exists) or implement standard methods
- Constructor takes API key and options object
- Methods: `request()`, `post()`, `postFormData()`, `setApiKey()`, `isConfigured`

**Rate Limiting:**
- Use `RateLimiter` utility: `this._rateLimiter = new RateLimiter(options)`
- Queue requests: `await this._rateLimiter.executeWithRetry(fn)`

**Error Handling:**
- Custom error class (e.g., `OpenAIError`) with type, status, details, isRetryable
- Throw on errors, don't return error objects

**Retry with Exponential Backoff:**
- Implement `_retryWithBackoff()` method
- Formula: `delay = min(baseDelay * 2^attempt, maxDelay) + random(0, 1000)`
- Checks `isRetryable` before retrying

**Request History:**
- Optional: track operation history for debugging
- Methods: `getHistory()`, `clearHistory()`

## UI Component Pattern (ApplicationV2)

**Class Structure:**
```javascript
class MyApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = { /* Foundry options */ };
  static PARTS = { main: { template: `modules/vox-chronicle/templates/...` } };

  static getInstance() { /* singleton */ }
  static resetInstance() { /* for testing */ }

  async _prepareContext(options) { /* template data */ }
  _onRender(context, options) { /* event listeners */ }
  async close(options) { /* cleanup */ }
}
```

**Event Listeners:**
- Define in `DEFAULT_OPTIONS.actions`: `{ 'button-id': MyClass._onButtonClick }`
- Static action methods: `static _onButtonClick(event, target) { /* this bound by Foundry */ }`
- Use AbortController for cleanup in `_onRender()`:
```javascript
_onRender(context, options) {
  this.#listenerController?.abort();
  this.#listenerController = new AbortController();
  element.addEventListener('change', handler, { signal: this.#listenerController.signal });
}
```

**Cleanup:**
- Always abort listeners: `this.#listenerController?.abort()`
- Stop animation frames: `cancelAnimationFrame(this.#rafId)`
- Clear timers: `clearTimeout()`, `clearInterval()`

## Naming Conventions Summary

| Type | Convention | Example |
|------|-----------|---------|
| Classes | PascalCase | `Logger`, `OpenAIClient` |
| Public methods | camelCase | `extractEntities()`, `setApiKey()` |
| Private methods | _camelCase | `_retryWithBackoff()`, `_buildUrl()` |
| Event handlers | _onActionName | `_onToggleRecording()`, `_onProcessSession()` |
| Public properties | camelCase | `this.apiKey`, `this.isInitialized` |
| Private properties | #camelCase or _camelCase | `#instance`, `_logger`, `_requestQueue` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_CHUNK_SIZE`, `DEFAULT_TIMEOUT_MS` |
| Booleans | is/has prefix | `isRecording`, `hasConfig`, `_debugEnabled` |
| Enums | PascalCase type, SCREAMING_SNAKE_CASE keys | `LogLevel.DEBUG`, `SessionState.IDLE` |

---

*Convention analysis: 2026-02-28*
