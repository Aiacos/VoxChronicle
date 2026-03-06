---
phase: 04-session-reliability
verified: 2026-03-06T11:05:00Z
status: gaps_found
score: 12/13 must-haves verified
gaps:
  - truth: "Token usage and cost are visible in a persistent footer bar during live mode"
    status: partial
    reason: "CostTracker.addUsage() is never called for AI suggestion chat completions -- only addTranscriptionMinutes() is wired. Token count in the footer will always show 0 and cost will only reflect transcription minutes, not chat model token costs."
    artifacts:
      - path: "scripts/orchestration/SessionOrchestrator.mjs"
        issue: "No addUsage() call after _runAIAnalysis -- AI suggestion token costs not tracked"
    missing:
      - "Extract usage data from AIAssistant.analyzeContext() response and call this._costTracker.addUsage(model, usage) in _liveCycle"
---

# Phase 04: Session Reliability Verification Report

**Phase Goal:** Make live sessions survivable for 4+ hours with clean stop mechanics, graceful API degradation, visible cost tracking, and memory-bounded transcript accumulation.
**Verified:** 2026-03-06T11:05:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | OpenAIClient accepts external AbortSignal and cancels in-flight fetch | VERIFIED | `options.signal` handled at line 555 of OpenAIClient.mjs; `AbortSignal.any()` with manual fallback |
| 2 | CostTracker accumulates token counts and computes cost from pricing map | VERIFIED | CostTracker.mjs: PRICING map with gpt-4o-mini, gpt-4o, gpt-4o-transcribe; addUsage/addTranscriptionMinutes methods |
| 3 | CostTracker enforces cost cap and reports when exceeded | VERIFIED | `isCapExceeded(capAmount)` returns true when totalCost >= cap; 0 = disabled |
| 4 | AIAssistant tracks consecutive errors with circuit breaker (healthy/degraded/down) | VERIFIED | Lines 107-121, 978-1051; getHealthStatus() returns healthy/degraded/down; resets on success |
| 5 | sessionCostCap Foundry setting exists with sensible defaults | VERIFIED | Settings.mjs line 626; world scope, Number, range 0-100, step 0.5, default 5 |
| 6 | Clicking Stop causes live mode to reach IDLE within 5 seconds | VERIFIED | Promise.race with 5000ms deadline (SHUTDOWN_DEADLINE_MS), force abort on timeout, _fullTeardown always called |
| 7 | After stop, startLiveMode starts from zero (clean slate) | VERIFIED | startLiveMode initializes all state fresh; _fullTeardown clears hooks, controllers, timers, transcript, cost |
| 8 | Panel shows colored status dots (green/yellow/red) for API health | VERIFIED | main-panel.hbs lines 117-118; CSS lines 720-730; MainPanel._prepareContext passes transcriptionHealth/aiSuggestionHealth |
| 9 | Token usage and cost visible in persistent footer during live mode | PARTIAL | Footer HTML exists (main-panel.hbs line 286), CSS styled, MainPanel formats tokenDisplay/costDisplay. BUT addUsage() never called for chat completions -- tokens always 0, cost only reflects transcription minutes |
| 10 | Cost cap pauses AI suggestions when exceeded, transcription continues | VERIFIED | _liveCycle lines 1516-1524: checks isCapExceeded, sets _aiSuggestionsPaused, skips _runAIAnalysis but continues cycle |
| 11 | Rolling window keeps only last 100 segments | VERIFIED | MAX_LIVE_SEGMENTS=100 (line 19); trim at line 1493-1496 with _discardedSegmentCount tracking |
| 12 | Self-monitoring warns if cycle duration exceeds 2x baseline | VERIFIED | Lines 1574-1595: rolling 20 cycle durations, warns at 2x baseline; Chrome memory check at 500MB |
| 13 | Session end summary shows duration, suggestion count, and cost | VERIFIED | Lines 1326-1337: builds summary with i18n format, shows via ui.notifications.info |

**Score:** 12/13 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/ai/OpenAIClient.mjs` | External signal support in _makeRequest | VERIFIED | AbortSignal.any() with manual fallback, cleanup in finally |
| `scripts/orchestration/CostTracker.mjs` | Token accumulation, pricing map, cost cap | VERIFIED | 152 lines, complete implementation with PRICING map and all methods |
| `scripts/narrator/AIAssistant.mjs` | Circuit breaker for health tracking | VERIFIED | Full circuit breaker pattern matching TranscriptionService |
| `scripts/core/Settings.mjs` | sessionCostCap setting | VERIFIED | Line 626, correct scope/type/range/default |
| `scripts/orchestration/SessionOrchestrator.mjs` | Graceful shutdown, health, rolling window, cost, self-monitoring | VERIFIED | _shutdownController, _fullTeardown, rolling window, cost integration, self-monitoring all present |
| `scripts/ui/MainPanel.mjs` | Status dots, cost footer, stopping spinner | VERIFIED | _prepareContext returns health/cost/stopping data for template |
| `templates/main-panel.hbs` | Footer bar, status dots, stopping overlay | VERIFIED | All three UI elements present with correct class names |
| `styles/vox-chronicle.css` | Status dot colors, footer layout, spinner | VERIFIED | Lines 720-760: health dots, cost footer, stopping overlay styles |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| SessionOrchestrator | CostTracker | addTranscriptionMinutes | WIRED | Line 1458: called after transcription |
| SessionOrchestrator | CostTracker | addUsage for chat tokens | NOT WIRED | addUsage() never called after AI analysis -- chat completion token costs not tracked |
| SessionOrchestrator | OpenAIClient | _shutdownController.signal | WIRED | Line 1454: signal passed to transcription API call |
| SessionOrchestrator | AIAssistant | health tracking | WIRED (indirect) | Orchestrator tracks its own _aiSuggestionHealth based on _runAIAnalysis success/failure (not via AIAssistant.getHealthStatus()) |
| MainPanel | SessionOrchestrator | getServiceHealth() + getCostData() | WIRED | Lines 216-217: reads health and cost data for rendering |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SESS-01 | 04-02 | Live mode survives 3-4 hour session | SATISFIED | Rolling window (100 segments), full-text accumulator, self-monitoring, memory warnings |
| SESS-02 | 04-01, 04-02 | Stop/restart works cleanly with AbortController | SATISFIED | External AbortSignal in OpenAIClient, _shutdownController in orchestrator, 5s deadline, _fullTeardown |
| SESS-04 | 04-01, 04-02 | Graceful API degradation with DM-facing status | SATISFIED | Circuit breaker in AIAssistant, independent health tracking in orchestrator, status dots in UI |
| SESS-05 | 04-01, 04-02 | Token usage and costs monitored and bounded | PARTIALLY SATISFIED | CostTracker exists with pricing map and cost cap enforcement, but chat completion token costs not tracked -- only transcription minutes counted |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | - |

No TODOs, FIXMEs, placeholders, or stub implementations found in phase-modified files.

### Human Verification Required

### 1. Status Dot Visual Rendering

**Test:** Start a live session in Foundry VTT, observe the panel header for green health dots
**Expected:** Two small colored dots visible next to existing index health dot
**Why human:** Visual appearance and positioning cannot be verified programmatically

### 2. Cost Footer Updates During Live Session

**Test:** Run a live session for 2-3 cycles, observe the cost footer
**Expected:** Token count stays at 0 (due to gap), cost increments based on transcription minutes
**Why human:** Real-time UI update behavior requires running application

### 3. Stopping Spinner During Shutdown

**Test:** Click Stop during an active API call, observe the spinner overlay
**Expected:** Spinner appears, then panel returns to idle state within 5 seconds
**Why human:** Async shutdown timing and visual feedback require live testing

### 4. Session End Summary Notification

**Test:** Complete a live session and observe the Foundry notification
**Expected:** Auto-dismiss notification with duration, suggestion count, and cost
**Why human:** Foundry VTT notification rendering

### Gaps Summary

One gap found: **CostTracker.addUsage() is never called for AI suggestion chat completions** in SessionOrchestrator._liveCycle(). The `_runAIAnalysis` method calls `this._aiAssistant.analyzeContext()` but does not extract or forward the `usage` object from the OpenAI chat completion response to `this._costTracker.addUsage(model, usage)`. As a result:

- The token count in the cost footer will always display "0" (only transcription minutes are tracked, which do not contribute to token counts)
- The cost display will only reflect transcription minutes ($0.006/min), not chat model token costs
- The cost cap enforcement works but is based on incomplete cost data (transcription only, not chat)

This is a **partial** gap -- the infrastructure exists end-to-end (CostTracker has addUsage, UI displays tokens, cost cap works), but the wiring between AI analysis and CostTracker is missing. The fix requires either modifying `analyzeContext()` to return usage data, or wrapping the call to extract usage from the underlying OpenAI response.

### Test Results

All 504 tests pass across 4 test suites:
- tests/orchestration/CostTracker.test.js (21 tests)
- tests/ai/OpenAIClient.test.js (246 tests)
- tests/narrator/AIAssistant.test.js (110 tests)
- tests/orchestration/SessionOrchestrator.test.js (227 tests, including 26 new lifecycle hardening tests)

---

_Verified: 2026-03-06T11:05:00Z_
_Verifier: Claude (gsd-verifier)_
