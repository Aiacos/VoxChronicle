# Coding Conventions

**Analysis Date:** 2026-03-19

## Naming Patterns

**Files:**
- Source files: `PascalCase.mjs` for classes (e.g., `AudioRecorder.mjs`, `SessionOrchestrator.mjs`)
- Utility functions files: `PascalCase.mjs` even for non-class modules (e.g., `HtmlUtils.mjs`, `AudioUtils.mjs`)
- Data files: `kebab-case.mjs` (e.g., `dnd-vocabulary.mjs`)
- Entry point: `main.mjs`
- Constants: `constants.mjs`
- Test files: `PascalCase.test.js` mirroring source names

**Classes:**
- `PascalCase` for all classes: `OpenAIClient`, `SessionOrchestrator`, `MainPanel`
- Abstract base classes: `PascalCase` with no special prefix (e.g., `ChatProvider`, `RAGProvider`)

**Functions:**
- Public methods: `camelCase` (e.g., `startSession`, `getServicesStatus`)
- Private methods: `_camelCase` prefix (e.g., `_initializeProcessors`, `_updateState`)
- Private fields: `#camelCase` (ES2022 private class fields, e.g., `#instance`, `#eventBus`)

**Variables:**
- `camelCase` for local variables and instance properties
- `UPPER_SNAKE_CASE` for module-level constants (e.g., `MODULE_ID`, `MAX_CHUNK_SIZE`, `DEFAULT_THRESHOLD_MS`)

**Enums:**
- Object literals with `UPPER_SNAKE_CASE` keys: `const RecordingState = { INACTIVE: 'inactive', RECORDING: 'recording' }`
- Values are lowercase strings matching the key name (e.g., `'inactive'`, `'recording'`)
- Enum objects are `const` at module level, exported by name

**Types:**
- JSDoc `@typedef` for complex objects (inline, not in separate type files)
- Type annotations in JSDoc comments, not TypeScript

## Code Style

**Formatting:**
- Prettier handles all formatting (no manual style enforcement)
- No enforced quote style, semicolons, or indent width at lint level (all `'off'`)
- Max line length: 120 chars for code, 150 for comments (warn level, not error)

**Linting:**
- ESLint 9 flat config at `eslint.config.js`
- `no-var`: error (always use `const`/`let`)
- `prefer-const`: error
- `eqeqeq`: error (use `===`; `null` comparison exempted)
- `curly`: multi-line + consistent
- `no-unused-vars`: warn (args/vars starting with `_` ignored)
- JSDoc rules: warn level (not errors) — `check-param-names`, `require-param`, `require-returns-type`

## Import Organization

**Order (by convention, not enforced):**
1. External/framework imports (none in this codebase — everything is native)
2. Internal imports with relative paths

**Path style:**
- All relative paths: `'../utils/Logger.mjs'`, `'./Constants.mjs'`
- No path aliases or barrel index files
- Import from `constants.mjs` directly — never re-export from `main.mjs`

**Import style:**
- Named imports only: `import { Foo, Bar } from './Foo.mjs'`
- No default imports in production code
- Imports appear at top of file, before any code

## Error Handling

**Patterns:**
- All public async methods wrap in `try/catch`
- Errors are logged via `this.logger.error(...)` before re-throwing or handling
- User-facing errors shown via `ui?.notifications?.error(escapeHtml(message))`
- Custom error classes: `OpenAIError` (with `OpenAIErrorType` enum), `KankaError` (with `KankaErrorType` enum), `WhisperError`
- Errors propagate up unless they're recoverable (e.g., silence detection failure logs and continues)

**Pattern example:**
```javascript
async methodName() {
  try {
    // implementation
  } catch (error) {
    this.logger.error('Method failed:', error);
    throw error;  // or handle gracefully
  }
}
```

## Logging

**Framework:** Custom `Logger` utility at `scripts/utils/Logger.mjs`

**Patterns:**
- All classes create a child logger: `this.logger = Logger.createChild('ClassName')`
- Some files use module-level logger: `const logger = Logger.createChild('ModuleName')`
- Private loggers: `this._logger = Logger.createChild('ClassName')` (underscore prefix when private)
- Log levels: `debug`, `info`, `warn`, `error` — matching console methods
- Never use `console.log` directly — always use Logger
- Sensitive data (API keys) automatically filtered by `SensitiveDataFilter`

## Comments

**When to Comment:**
- File-level JSDoc block at top of every file: `@class`, `@module vox-chronicle`
- Public method JSDoc: `@param`, `@returns`, `@throws` as appropriate
- `@typedef` for complex parameter/return types
- Inline comments for non-obvious logic

**JSDoc style:**
```javascript
/**
 * Brief description.
 * @param {string} param - Description
 * @returns {Promise<object>} Description
 * @throws {OpenAIError} When API fails
 */
```

## Function Design

**Size:** Methods kept focused; large classes (>500 lines) exist but individual methods stay under ~50 lines typically

**Parameters:**
- Single `options = {}` object for multiple optional parameters: `async startSession(sessionOptions = {})`
- Required dependencies passed via constructor, not method parameters
- Services injected as constructor dependencies or via `setServices()`

**Return Values:**
- Async operations return Promises
- State-returning methods return plain objects with consistent shape
- Boolean check methods: `isConfigured()`, `isSessionActive`, `hasTranscriptionService()`

## Module Design

**Exports:**
- Each file has one primary class export, optionally with related constants/enums
- Exports at bottom of file: `export { ClassName, ENUM_NAME, CONSTANT_NAME };`
- Exception: abstract base classes use inline `export class`
- No barrel/index files — each consumer imports directly from source

**Singleton Pattern:**
- Used for `VoxChronicle` (main singleton) and `MainPanel` (UI singleton)
- Pattern: `static #instance = null` + `static getInstance()` + `static resetInstance()`
- `resetInstance()` is provided for test isolation

**Dependency Injection:**
- Services receive dependencies via constructor (not global access)
- `VoxChronicle` singleton wires all services together at init time
- Orchestrator accepts service objects at construction and via `setServices()`

## CSS Conventions

**Namespace:** All classes prefixed with `vox-chronicle` in `styles/vox-chronicle.css`

**BEM-style naming:**
- Block: `.vox-chronicle-recorder`
- Element: `.vox-chronicle-recorder__button`
- Modifier: `.vox-chronicle-recorder--recording`

## Localization

**All user-facing strings use i18n:**
```javascript
game.i18n.localize('VOXCHRONICLE.Settings.OpenAIKey')
game.i18n.format('VOXCHRONICLE.Error.Message', { error: error.message })
```

**Key namespace:** `VOXCHRONICLE.*` — 8 language files in `lang/`

**In Handlebars:** `{{localize "VOXCHRONICLE.Button.StartRecording"}}`

---

*Convention analysis: 2026-03-19*
