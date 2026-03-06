# Phase 4: Session Reliability - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Live mode can be started, run for 4 hours, and stopped cleanly at any moment without crashes, state corruption, stale hooks, or runaway API costs. Covers graceful shutdown, API failure degradation, token/cost monitoring, and long-session memory management.

Requirements: SESS-01, SESS-02, SESS-04, SESS-05

</domain>

<decisions>
## Implementation Decisions

### Graceful Stop Behavior
- Stop waits for the current live cycle to finish (not immediate abort) — captures the last transcription
- If the current cycle exceeds 5 seconds, force-abort via AbortController — this is the hard deadline
- During shutdown window, show a spinner + "Stopping..." in place of the Stop button
- If force-abort triggers at 5s, button reverts to Start (IDLE state)
- After stop completes: brief summary notification ("Session ended: 47min, 23 suggestions, $0.12") that auto-dismisses
- No detailed summary view — DM checks analytics tab if they want full stats

### API Failure Degradation
- Suggestions show "AI suggestions temporarily unavailable" placeholder when API is down — no stale content
- Status indicator: small colored dot in panel header (green = healthy, yellow = degraded/slow, red = down)
- Matches the index health indicator pattern established in Phase 2
- Transcription and AI suggestions degrade independently — separate status tracking for each
- Auto-recovery: on each live cycle, retry the API normally. If it works, go green. No manual "Retry" button needed
- Leverages existing circuit breaker in TranscriptionService (5 consecutive errors opens circuit)
- AIAssistant needs its own error tracking to surface suggestion-specific degradation

### Token/Cost Monitoring
- Persistent footer bar at bottom of floating panel: "Tokens: 12.4K | Cost: $0.08"
- Updated each cycle, always visible during live mode
- Cost estimated from exact OpenAI API usage data (response headers with token counts) + model-specific pricing map
- Configurable per-session cost cap, default $5.00
- When cap is hit: soft warning — "Cost cap reached ($5.00). AI suggestions paused. Transcription continues."
- DM can dismiss warning and re-enable suggestions, or keep transcribing without AI
- Cost cap is a Foundry setting (world-scoped, configurable in module settings)

### Long Session Stability
- Rolling window for _liveTranscript: keep only the last 100 segments (or last 15K chars). Older segments are discarded
- NPC mention detection scans only the rolling window
- Errors in a cycle never stop the cycle timer — the heartbeat always continues
- Failed services show degraded status (yellow/red) but cycles keep running
- Full teardown on stop: remove ALL Foundry hooks registered by the session, abort all controllers, clear all timers, reset all state
- startLiveMode() always starts from zero — clean slate guarantee after stop
- Self-monitoring: track both cycle timing AND JS heap size (performance.memory, Chrome-only)
- Warn if average cycle duration exceeds 2x expected baseline
- Warn if memory exceeds a configurable threshold
- Non-Chrome browsers: timing monitoring only, skip memory (graceful feature detection)

### Claude's Discretion
- Exact AbortController wiring through the API call chain
- How the cycle timer interacts with the 5-second shutdown deadline
- Rolling window implementation details (segment count vs char count cap)
- Footer bar layout and styling within existing panel structure
- Self-monitoring warning thresholds and logging approach
- How hook registration is tracked for guaranteed cleanup

</decisions>

<specifics>
## Specific Ideas

- The "Stopping..." spinner should give confidence that something is happening — DMs will panic-reload if they think it froze
- Status dots should be small and unobtrusive, like GitHub CI status badges
- Cost footer should feel like a utility meter, not a billing alert — informational, not alarming
- The 5-second hard deadline is non-negotiable — the success criteria explicitly states this

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SessionOrchestrator._isStopping` flag: Already exists for shutdown coordination
- `SessionOrchestrator._liveCycleTimer`: setTimeout-based cycle timer, cleared on stop
- `TranscriptionService` circuit breaker: 5 consecutive errors, `isCircuitOpen()`, `resetCircuitBreaker()`
- `AudioRecorder.getLatestChunk()`: Exists and works — confirmed in codebase (line 193)
- AbortController pattern: All 11 UI components use it for listener cleanup
- `ErrorNotificationHelper`: Utility for user-facing error messages (defined but underused)

### Established Patterns
- AbortController + signal pattern for cleanup (UI components via `_onRender`)
- `_handleError(error, stage)` centralized error handler in SessionOrchestrator
- `Promise.allSettled` for non-blocking parallel operations (Phase 3 NPC + RAG)
- Foundry `game.settings.register()` with range type for numeric settings
- `Logger.createChild('ServiceName')` for prefixed logging

### Integration Points
- `SessionOrchestrator.stopLiveMode()` (line 1208): Main shutdown path — needs AbortController + 5s deadline
- `SessionOrchestrator._liveCycle()` (line 1288): Where auto-retry and error tracking happen per cycle
- `SessionOrchestrator._handleError()` (line 751): Centralized error handler — needs to update status indicators
- `MainPanel` template: Footer bar for cost display, header area for status dots
- `Settings.registerSettings()`: New settings for costCap, self-monitoring thresholds
- `OpenAIClient` or `BaseAPIClient`: Where API response usage data is extracted

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-session-reliability*
*Context gathered: 2026-03-06*
