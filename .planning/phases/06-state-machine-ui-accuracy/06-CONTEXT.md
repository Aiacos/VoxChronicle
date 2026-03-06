# Phase 6: State Machine and UI Accuracy - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

The MainPanel always reflects the true live session state, AI suggestions stream with visible first tokens, silence detection triggers at the right threshold without duplicates, and suggestion cards are glanceable structured content rather than paragraph walls.

Requirements: SUG-02, SUG-03, UI-02

</domain>

<decisions>
## Implementation Decisions

### Suggestion Card Layout
- Structured card format: colored type badge (pill), bolded title summarizing the suggestion, 2-3 bullet points with details
- Type badges as colored pill badges: narration (blue), dialogue (green), action (orange), reference (purple) — consistent with Phase 4 health dots color language
- All session suggestions kept in a scrollable list container — DM can scroll back to see earlier suggestions
- Each card has a small dismiss (X) button — no other interactive features (no copy, no expand)

### Streaming Behavior
- Progressive reveal: card appears immediately with type badge + spinner "AI thinking..." placeholder
- Content fills in as tokens stream from OpenAI — first tokens visible within 1 second of API response start
- During streaming: raw text displayed as it arrives. On stream complete: text is parsed and restructured into title + bullet points format
- Auto-scroll to newest suggestion when streaming starts, unless DM has manually scrolled up (respect scroll position)

### Status Label
- Subtle colored pill badge in panel header next to title: "VoxChronicle [LIVE]"
- Three states: IDLE (gray), LIVE (green), ANALYZING (amber with gentle pulse)
- Maps to SessionState: IDLE = IDLE, LIVE = LIVE_LISTENING, ANALYZING = LIVE_TRANSCRIBING or LIVE_ANALYZING
- Smooth 200ms color fade transitions between states; ANALYZING badge pulses gently
- Chapter context label updates on the next AI cycle after Foundry scene change — no immediate update, no extra API calls

### Silence-to-Suggestion Guard
- If a live cycle is in-flight when silence fires, the event is dropped entirely — no queuing, no retry
- SilenceDetector timer keeps running during cycles; callback is suppressed (not called) while cycle is active
- Silence-triggered suggestions use the same structured card layout but include a small "auto" source badge to distinguish from regular cycle suggestions
- Silence threshold configurable via existing ragSilenceThresholdMs Foundry setting (10s-120s range, default 30s) — validate end-to-end wiring

### Claude's Discretion
- OpenAI streaming implementation details (SSE parsing, chunk assembly)
- Exact card CSS styling and spacing within the established design language
- How to parse AI response text into title + bullet structure on stream complete
- Auto-scroll detection mechanism (scroll position tracking)
- Pulse animation implementation for ANALYZING badge

</decisions>

<specifics>
## Specific Ideas

- Suggestion cards should feel like notification cards in Slack or Linear — clean, scannable, not cluttered
- The "AI thinking..." spinner gives confidence something is happening, like Phase 4's "Stopping..." spinner
- Source badge ("auto" for silence-triggered) should be very subtle — small text, not a prominent visual element
- The ANALYZING pulse should be gentle like a heartbeat, not an aggressive flash

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SessionState` enum (SessionOrchestrator.mjs:28): IDLE, LIVE_LISTENING, LIVE_TRANSCRIBING, LIVE_ANALYZING — maps directly to the three UI states
- `_updateState()` (SessionOrchestrator.mjs:214): Fires `onStateChange` callback — existing hook for panel badge updates
- `SilenceDetector._isProcessingSilence` flag: Can be repurposed or extended for cycle-in-flight guard
- `SilenceMonitor` in AIAssistant: Wraps SilenceDetector with suggestion generation — integration point for guard logic
- `.vox-chronicle-suggestion` CSS class: Existing card styling to extend (currently minimal: background + border + border-radius)
- Phase 4 health dots: Color language (green/yellow/red) established for status indicators
- Phase 4 cost footer + Phase 5 summary badge: Established informational styling patterns

### Established Patterns
- AbortController for lifecycle management (Phase 4)
- `_callbacks.onStateChange` for orchestrator-to-UI communication
- `OpenAIClient._enqueueRequest` for sequential API calls — streaming will need a different path
- `Promise.allSettled` for non-blocking parallel operations
- Foundry `game.settings.register()` with range type for numeric settings (ragSilenceThresholdMs already exists)

### Integration Points
- `OpenAIClient`: Needs `stream: true` support for chat completions — currently all requests use `stream: false`
- `AIAssistant.generateSuggestions()` (line 807): Where streaming would be initiated — needs to yield partial results
- `AIAssistant._generateAutonomousSuggestion()`: Silence-triggered path — needs cycle-in-flight guard
- `SessionOrchestrator._liveCycle()` (line 1425): Where cycle start/end can set a flag for silence suppression
- `MainPanel._prepareContext()`: Where status badge data would be computed from orchestrator state
- `main-panel.hbs` suggestion rendering (line 142): Current `{{#each suggestions}}` loop needs card restructure

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-state-machine-ui-accuracy*
*Context gathered: 2026-03-06*
