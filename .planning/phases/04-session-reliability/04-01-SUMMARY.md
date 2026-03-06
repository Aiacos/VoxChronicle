---
phase: 04-session-reliability
plan: 01
subsystem: ai, orchestration, narrator
tags: [abort-signal, cost-tracking, circuit-breaker, openai, foundry-settings]

# Dependency graph
requires:
  - phase: 03-ai-knowledge-depth
    provides: AIAssistant with _makeChatRequest, OpenAIClient base
provides:
  - External AbortSignal support in OpenAIClient._makeRequest
  - CostTracker class for token/cost monitoring
  - AIAssistant circuit breaker with health status
  - sessionCostCap Foundry setting
affects: [04-02-session-lifecycle, session-orchestrator, main-panel-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [circuit-breaker-pattern, abort-signal-composition, pricing-map]

key-files:
  created:
    - scripts/orchestration/CostTracker.mjs
    - tests/orchestration/CostTracker.test.js
  modified:
    - scripts/ai/OpenAIClient.mjs
    - scripts/narrator/AIAssistant.mjs
    - scripts/core/Settings.mjs
    - tests/ai/OpenAIClient.test.js
    - tests/narrator/AIAssistant.test.js
    - lang/en.json
    - lang/it.json
    - lang/de.json
    - lang/es.json
    - lang/fr.json
    - lang/ja.json
    - lang/pt.json
    - lang/template.json

key-decisions:
  - "AbortSignal.any() with manual fallback for older browsers"
  - "Circuit breaker thresholds: 2 errors = degraded, 5 = down (matches TranscriptionService pattern)"
  - "Cost cap 0 = disabled (isCapExceeded returns false)"
  - "Unknown models: tokens tracked but cost not computed (warning logged)"

patterns-established:
  - "Circuit breaker: _consecutiveErrors / _maxConsecutiveErrors / _circuitOpen / getHealthStatus() / resetCircuitBreaker() / getCircuitBreakerStatus()"
  - "External signal composition: AbortSignal.any() with manual listener fallback in _makeRequest"
  - "Pricing map: static PRICING object on CostTracker class for model-specific costs"

requirements-completed: [SESS-02, SESS-04, SESS-05]

# Metrics
duration: 6min
completed: 2026-03-06
---

# Phase 04 Plan 01: Foundation Services Summary

**External AbortSignal threading in OpenAIClient, CostTracker for token/cost monitoring with pricing map, and AIAssistant circuit breaker with healthy/degraded/down health states**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T09:34:04Z
- **Completed:** 2026-03-06T09:40:26Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- OpenAIClient._makeRequest now accepts an external AbortSignal and combines it with the internal timeout signal using AbortSignal.any() (with manual listener fallback)
- CostTracker class tracks token usage from chat models and transcription minutes, computes cost from a model-specific pricing map, and enforces session cost caps
- AIAssistant has a circuit breaker matching TranscriptionService's pattern (5 consecutive errors opens circuit, auto-recovery on success)
- sessionCostCap setting registered (world scope, Number, default $5, range 0-100) with localization in all 8 language files

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: External AbortSignal + CostTracker**
   - `96cd52d` (test) - Failing tests for signal cancellation and CostTracker
   - `ed6ee4d` (feat) - Implementation passing all tests

2. **Task 2: AIAssistant circuit breaker + sessionCostCap setting**
   - `4f37d0e` (test) - Failing tests for circuit breaker behavior
   - `f3a53fd` (feat) - Implementation with settings and localization

## Files Created/Modified
- `scripts/orchestration/CostTracker.mjs` - New class: token accumulation, pricing map, cost cap
- `scripts/ai/OpenAIClient.mjs` - External AbortSignal support in _makeRequest
- `scripts/narrator/AIAssistant.mjs` - Circuit breaker with health status tracking
- `scripts/core/Settings.mjs` - sessionCostCap setting registration
- `tests/orchestration/CostTracker.test.js` - 21 tests for CostTracker
- `tests/ai/OpenAIClient.test.js` - 5 new tests for external signal support
- `tests/narrator/AIAssistant.test.js` - 12 new tests for circuit breaker
- `lang/*.json` - SessionCostCap localization in all 8 files

## Decisions Made
- Used AbortSignal.any() with manual fallback for browsers that don't support it (Chrome 116+, Firefox 124+, Safari 17.4+). Fallback uses addEventListener with { once: true }
- Circuit breaker thresholds: 2 consecutive errors = degraded, 5 = down. Matches TranscriptionService pattern exactly for consistency
- isCapExceeded(0) returns false (0 = disabled) to allow DMs to disable the cost cap
- Unknown models in addUsage(): tokens still tracked but cost not computed, warning logged

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation services ready for Plan 02 to wire into SessionOrchestrator and MainPanel UI
- CostTracker ready for integration with live cycle cost tracking
- AIAssistant health status ready for status dot indicators
- External AbortSignal ready for graceful shutdown with 5-second deadline

---
*Phase: 04-session-reliability*
*Completed: 2026-03-06*
