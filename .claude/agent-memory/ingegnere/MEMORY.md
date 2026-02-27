# Ingegnere Agent Memory

## VoxChronicle Architecture Notes

### AIAssistant Decomposition (v3.2.x)
- **SilenceMonitor** extracted (Task 5): handles silence detection + autonomous suggestion triggers
- **PromptBuilder** extracted (Task 6): all prompt/message building (system prompt, analysis, off-track, suggestions, NPC dialogue, autonomous)
- AIAssistant now ~1601 lines (down from ~2076). Still a candidate for further decomposition.
- Pattern: thin delegation wrappers (`_buildSystemPrompt()`, `_truncateContext()`, `_formatChapterContext()`) preserve backward compat for existing tests

### Dead Code in _buildSystemPrompt
- `chapterSection` and `sensitivityGuide` are computed but never appended to the template literal
- This is preserved as-is in PromptBuilder (matching original behavior exactly)
- Not a bug: chapter context is injected via separate system messages in build*Messages() methods

### Test Suite Stats (as of Task 13)
- 51 test files, 4184 tests, all passing
- BaseAPIClient: 34 tests
- OpenAIClient: 80 tests
- KankaClient: 99 tests
- PromptBuilder: 72 tests
- AIAssistant: 149 tests

### Refactoring Pattern (God Object Extraction)
1. Create new class with extracted logic
2. Add import to original class
3. Instantiate in constructor, propagate state via setters
4. Replace direct method calls with `this._newClass.method()` calls
5. Keep thin delegation wrappers for private methods tested directly by existing tests
6. Run full suite to verify zero regressions
7. Commit only the relevant files

### BaseAPIClient Extraction (Task 13)
- `scripts/api/BaseAPIClient.mjs` - shared base class for API clients
- Extracted 6 methods: `baseUrl` getter, `_buildAuthHeaders`, `_buildJsonHeaders`, `_buildUrl`, `_createTimeoutController`, `getRateLimiterStats`, `resetRateLimiter`
- `_buildAuthHeaders` parameterized via `AuthErrorClass`, `authErrorMessage`, `authErrorType` options
- KankaClient's `_apiToken` field renamed to `_apiKey` (inherited from base); public API (`setApiToken`, `validateApiToken`) unchanged
- Pattern: create rate limiter before `super()` call, pass as option

### File Paths
- `scripts/api/BaseAPIClient.mjs` - shared base for API clients
- `scripts/narrator/PromptBuilder.mjs` - prompt/message building
- `scripts/narrator/SilenceMonitor.mjs` - silence detection coordination
- `scripts/narrator/AIAssistant.mjs` - main AI assistant (orchestrator)
- `tests/api/BaseAPIClient.test.js` - 34 tests
- `tests/narrator/PromptBuilder.test.js` - 72 tests
- `tests/narrator/SilenceMonitor.test.js` - silence monitor tests
