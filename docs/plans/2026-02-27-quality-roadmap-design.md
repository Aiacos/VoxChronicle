# VoxChronicle Quality Roadmap Design

**Date**: 2026-02-27
**Goal**: Implement all 12 quality improvements identified in the v3.2.5 quality report, organized into 3 priority tiers.
**Approach**: Bottom-up — quick wins first (P1), targeted improvements (P2), structural refactors (P3).

## Priority 1 — Quick Wins

### 1. Sanitize Kanka API error messages
- **File**: `scripts/kanka/KankaClient.mjs` (~line 372)
- **Change**: Import `escapeHtml`, wrap `errorData.message` and `errorData.error` in `_parseErrorResponse()`
- **Test**: XSS error response test in `tests/kanka/KankaClient.test.js`

### 2. Extract `_fetchRAGContextFor()` helper
- **File**: `scripts/narrator/AIAssistant.mjs`
- **Change**: Extract repeated RAG context fetch into `_fetchRAGContextFor(query)` method
- **Test**: Unit test for helper; existing tests unchanged

### 3. Use `AudioUtils.formatDuration()` in MainPanel
- **File**: `scripts/ui/MainPanel.mjs` (lines 725-733)
- **Change**: Replace duplicate `_formatDuration()` with `AudioUtils.formatDuration()` import
- **Test**: Verify existing tests pass

### 4. Extract `_createSessionObject()` factory
- **File**: `scripts/orchestration/SessionOrchestrator.mjs` (lines 218-235, 772-789)
- **Change**: Create `_createSessionObject(overrides)`, call from `startSession()` and `startLiveMode()`
- **Test**: Unit test for factory; existing tests unchanged

## Priority 2 — Targeted Improvements

### 5. Decompose AIAssistant (conservative)
- **Extract**: `SilenceMonitor` (~255 lines) and `PromptBuilder` (~296 lines)
- **New files**: `scripts/narrator/SilenceMonitor.mjs`, `scripts/narrator/PromptBuilder.mjs`
- **AIAssistant**: Keeps facade role, delegates to extracted classes
- **Tests**: New test files + updated AIAssistant tests

### 6. Add tests for main.mjs
- **File**: `scripts/main.mjs` — extract `resolveHtmlElement()`, `injectValidationButton()`, `loadCampaigns()`
- **New test**: `tests/main.test.js`
- **Target**: 70%+ coverage of extracted functions

### 7. Improve HtmlUtils test coverage
- **File**: `tests/utils/HtmlUtils.test.js`
- **Add**: SVG XSS, encoded protocols, falsy numbers, non-string inputs
- **Target**: 95%+ branch coverage

### 8. Bundle vis-network locally
- **New file**: `scripts/vendor/vis-network.min.js`
- **Change**: Download vis-network 9.1.9, update RelationshipGraph.mjs, update build.sh
- **Test**: Verify rendering without CDN

## Priority 3 — Structural Refactors

### 9. Create ErrorNotificationHelper
- **New file**: `scripts/utils/ErrorNotificationHelper.mjs`
- **API**: `ErrorNotificationHelper.notify(category, error, options)`
- **Test**: Full unit tests; replace 2-3 existing patterns as proof of concept

### 10. Complete German translations
- **File**: `lang/de.json`
- **Change**: Translate ~320-350 keys with `[EN]` prefix
- **Test**: Verify no `[EN]` prefixes remain

### 11. Add cross-service integration tests
- **New file**: `tests/integration/session-workflow.test.js`
- **Test**: SessionOrchestrator -> TranscriptionProcessor -> EntityProcessor pipeline

### 12. Extract shared BaseAPIClient
- **New file**: `scripts/api/BaseAPIClient.mjs`
- **Change**: Extract 7 identical methods (~195 lines) from OpenAIClient and KankaClient
- **Tests**: New BaseAPIClient tests; update client tests for inheritance

## Architecture Decisions

- **No breaking changes**: All public APIs maintained
- **Test-first**: Tests before implementation for each item
- **Conservative AIAssistant decomposition**: Only SilenceMonitor + PromptBuilder (not full 6-class split)
- **One commit per item**: 12 incremental commits, tests green at every step
