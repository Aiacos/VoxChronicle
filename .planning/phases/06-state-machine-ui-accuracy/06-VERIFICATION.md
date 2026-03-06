---
phase: 06-state-machine-ui-accuracy
verified: 2026-03-06T15:45:00Z
status: gaps_found
score: 3/5 must-haves verified
gaps:
  - truth: "First AI suggestion tokens appear in the panel within 1 second of the cycle completing its OpenAI call"
    status: failed
    reason: "Streaming pipeline is fully built (postStream, _makeChatRequestStreaming, generateSuggestionsStreaming, _handleStreamToken, _createStreamingCard) but _runAIAnalysis in SessionOrchestrator still calls the NON-streaming analyzeContext(). The callbacks onStreamToken and onStreamComplete are defined in _callbacks but never invoked from production code. Streaming is dead code."
    artifacts:
      - path: "scripts/orchestration/SessionOrchestrator.mjs"
        issue: "_runAIAnalysis (line ~1714) calls this._aiAssistant.analyzeContext() instead of generateSuggestionsStreaming(). _callbacks.onStreamToken and _callbacks.onStreamComplete are never invoked anywhere in SessionOrchestrator."
    missing:
      - "Switch _runAIAnalysis to call generateSuggestionsStreaming (or a streaming variant of analyzeContext) with onToken callback that fires _callbacks.onStreamToken"
      - "Invoke _callbacks.onStreamComplete with { text, type, usage } after streaming completes"
      - "Keep non-streaming analyzeContext as fallback if streaming fails"
  - truth: "AI suggestions display as scannable, structured cards with a title, 2-3 bullet points, and a source badge -- not as paragraph walls"
    status: partial
    reason: "Card CSS, template, and _parseCardContent parser are all implemented and wired correctly for the non-streaming path (suggestions from _prepareContext). However, the streaming path (which creates cards via _createStreamingCard + _finalizeStreamingCard) is never triggered because the orchestrator never fires onStreamToken. The non-streaming path does render structured cards via the template, so cards ARE scannable for non-streaming suggestions."
    artifacts:
      - path: "scripts/ui/MainPanel.mjs"
        issue: "Streaming card creation path (_handleStreamToken -> _createStreamingCard) is never triggered in production"
    missing:
      - "Wire the streaming path so cards are created progressively (depends on gap 1 fix)"
---

# Phase 06: State Machine & UI Accuracy Verification Report

**Phase Goal:** The MainPanel always reflects the true live session state, suggestions stream with visible first tokens, silence detection triggers at the right threshold, and suggestion cards are glanceable rather than wall-of-text
**Verified:** 2026-03-06T15:45:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | First AI suggestion tokens appear in the panel within 1 second of the cycle completing its OpenAI call | FAILED | Streaming pipeline fully built but never invoked. _runAIAnalysis calls non-streaming analyzeContext(). _callbacks.onStreamToken is never fired from SessionOrchestrator. |
| 2 | After 20-30 seconds of DM silence, the silence detector fires exactly once per silence event -- no duplicate when cycle is in flight | VERIFIED | SilenceMonitor._handleSilenceEvent checks _isCycleInFlightFn?.() at line 297 before _generateSuggestionFn. Guard injected in SessionOrchestrator.startLiveMode (line 946), cleared in stopLiveMode (line 1407). Flag set synchronously before IIFE at line 1463. |
| 3 | The panel's status label (IDLE / ANALYZING / LIVE) matches the actual SessionOrchestrator state at all times | VERIFIED | _prepareContext maps orchestrator state to 3 UI states (lines 266-272). StatusState flows to template via statusState/statusLabel. canvasReady hook updates chapter context. onStateChange callback triggers re-render. |
| 4 | AI suggestions display as scannable, structured cards with a title, 2-3 bullet points, and a source badge | PARTIAL | Non-streaming path works: _parseCardContent (line 1064) parses text into title+bullets, template renders cards with type badge, title, bullets, dismiss button, source badge. Streaming card path is dead code (never triggered). |
| 5 | Navigating between Foundry scenes during live mode updates the chapter context label in the panel within the next cycle | VERIFIED | canvasReady hook registered in startLiveMode (line 903) calls _chapterTracker.updateFromScene(). Panel reads chapter data in _prepareContext via _getChapterNavData(). |

**Score:** 3/5 truths verified (1 FAILED, 1 PARTIAL)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/ai/OpenAIClient.mjs` | postStream() async generator for SSE | VERIFIED | Line 764: `async *postStream()` with SSE line buffering, [DONE] sentinel, abort support |
| `scripts/narrator/AIAssistant.mjs` | _makeChatRequestStreaming + generateSuggestionsStreaming | VERIFIED | Line 1178: _makeChatRequestStreaming with onToken callback. Line 854: generateSuggestionsStreaming wrapper. |
| `scripts/narrator/SilenceMonitor.mjs` | Cycle-in-flight guard | VERIFIED | Line 102: _isCycleInFlightFn property. Line 129: setIsCycleInFlightFn setter. Line 297: guard check in _handleSilenceEvent. |
| `scripts/ui/MainPanel.mjs` | Status mapping, card parsing, streaming DOM | VERIFIED | _prepareContext returns statusState/statusLabel. _parseCardContent at line 1064. _createStreamingCard at 1187. _handleStreamToken at 1108. Dismiss action at line 65. |
| `templates/main-panel.hbs` | Status badge, suggestion card template | VERIFIED | Status badge at line 64. Suggestion cards with type/title/bullets/dismiss at lines 147-163. Scrollable container. |
| `styles/vox-chronicle.css` | Status badge + card + pulse CSS | VERIFIED | Status badge styles at line 905 (3 states). Pulse animation at line 935. Card styles with type colors at 961+. |
| `scripts/orchestration/SessionOrchestrator.mjs` | _isCycleInFlight, streaming callbacks, guard injection | ORPHANED | Flag exists (line 72), guard injection works (line 946), but onStreamToken/onStreamComplete are never invoked. _runAIAnalysis still uses non-streaming analyzeContext (line 1717). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| AIAssistant | OpenAIClient | postStream() in _makeChatRequestStreaming | WIRED | Line 1187: `this._openaiClient.postStream(...)` |
| SilenceMonitor | SessionOrchestrator | isCycleInFlightFn injection | WIRED | Line 946: `setIsCycleInFlightFn(() => this._isCycleInFlight)` |
| SessionOrchestrator -> SilenceMonitor | Guard cleared on stop | setIsCycleInFlightFn(null) | WIRED | Line 1407 |
| SessionOrchestrator -> AIAssistant | _makeChatRequestStreaming in _liveCycle | NOT_WIRED | _runAIAnalysis (line 1717) calls analyzeContext(), not generateSuggestionsStreaming() |
| SessionOrchestrator -> MainPanel | onStreamToken callback | NOT_WIRED | Callback defined at line 80 but never invoked in SessionOrchestrator |
| MainPanel -> Template | statusState flows to template | WIRED | _prepareContext returns statusState/statusLabel, template uses {{statusState}} |
| MainPanel -> CSS | BEM class names for cards | WIRED | Card DOM uses vox-chronicle-suggestion__* classes matching CSS selectors |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SUG-02 | 06-01, 06-03 | AI responses stream to the UI with first tokens visible in under 1 second | NOT SATISFIED | Streaming infrastructure built but not wired into production path. _runAIAnalysis uses non-streaming analyzeContext(). |
| SUG-03 | 06-01, 06-03 | Silence detection triggers suggestions after 20-30s DM silence (calibrated threshold) | SATISFIED | Cycle-in-flight guard prevents duplicate suggestions. Guard injected in startLiveMode, synchronous flag set before IIFE. |
| UI-02 | 06-02 | Suggestions display as glanceable, scannable content (not paragraph walls) | PARTIALLY SATISFIED | Non-streaming cards render with type badge, title, bullets, dismiss. Streaming card path untriggered. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| SessionOrchestrator.mjs | 80-81 | onStreamToken/onStreamComplete callbacks defined but never invoked | BLOCKER | Streaming is dead code -- the entire streaming pipeline from Plan 01 and 02 is orphaned |
| SessionOrchestrator.mjs | 1717 | analyzeContext used instead of generateSuggestionsStreaming | BLOCKER | Prevents SUG-02 streaming requirement from being met |

No TODO/FIXME/PLACEHOLDER comments found in modified files.

### Human Verification Required

### 1. Status Badge Visual Correctness

**Test:** Start a live mode session, observe the status badge in the panel header
**Expected:** Badge shows IDLE (gray) -> LIVE (green) when listening -> ANALYZING (amber pulse) during AI analysis
**Why human:** Visual styling (colors, pulse animation) cannot be verified programmatically

### 2. Suggestion Card Layout

**Test:** Trigger AI suggestions during live mode, check card rendering
**Expected:** Cards show colored type badge, bold title, 2-3 bullet points, optional source badge, dismiss X button
**Why human:** Layout, spacing, and visual glanceability are subjective

### 3. Chapter Context Label Update

**Test:** Navigate to a different Foundry scene during live mode
**Expected:** Chapter label in panel updates on next cycle
**Why human:** Requires Foundry VTT runtime with scene navigation

### Gaps Summary

There is one root cause for both gaps: **the streaming pipeline is fully built but never activated in the production code path.**

Plan 01 built the streaming backend (postStream, _makeChatRequestStreaming, generateSuggestionsStreaming). Plan 02 built the streaming UI (status badge, card templates, streaming DOM helpers, _handleStreamToken). Plan 03 built the wiring layer (cycle-in-flight flag, callback definitions, MainPanel callback registration). But the critical final connection -- switching `_runAIAnalysis` from `analyzeContext()` to `generateSuggestionsStreaming()` and invoking `_callbacks.onStreamToken`/`_callbacks.onStreamComplete` -- was never made.

The silence guard (SUG-03), status badge (part of UI-02), and non-streaming card rendering (part of UI-02) all work correctly. The scene-to-chapter wiring is also functional.

The fix is focused: modify `_runAIAnalysis` to call `generateSuggestionsStreaming` with an `onToken` callback that fires `this._callbacks.onStreamToken`, and fire `this._callbacks.onStreamComplete` on completion. Keep `analyzeContext` as a fallback.

---

_Verified: 2026-03-06T15:45:00Z_
_Verifier: Claude (gsd-verifier)_
