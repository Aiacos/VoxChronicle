---
phase: 08-advanced-suggestion-intelligence
plan: "02"
subsystem: orchestration
tags: [session-orchestrator, ai-assistant, streaming, off-track, quiet-speakers, prompt-builder]

# Dependency graph
requires:
  - phase: 08-01
    provides: "PromptBuilder.buildGeneralQueryMessages() and setQuietSpeakers() methods"
provides:
  - "SessionOrchestrator.handleGeneralQuery() for on-demand DM AI queries via streaming"
  - "Consecutive off-track counter with onRecoveryCard callback at 2-cycle threshold"
  - "Quiet speaker injection into PromptBuilder before each AI analysis cycle"
affects:
  - "08-03 (UI layer — MainPanel will wire handleGeneralQuery, onRecoveryCard callbacks)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "handleGeneralQuery mirrors handleManualRulesQuery: same early-return + graceful error card pattern"
    - "Consecutive counter pattern: _consecutiveOffTrackCount increments on moderate/severe, resets on transition/minor/none"
    - "Quiet speaker injection: filter activeSpeakers >= 3, percentage < 15 threshold"

key-files:
  created: []
  modified:
    - scripts/orchestration/SessionOrchestrator.mjs
    - tests/orchestration/SessionOrchestrator.test.js

key-decisions:
  - "handleGeneralQuery does NOT gate on _liveMode — works in idle, live, and chronicle modes (availability check only)"
  - "_consecutiveOffTrackCount resets on scene transition regardless of severity (sceneInfo.isTransition guard)"
  - "Quiet speaker injection skips setQuietSpeakers when fewer than 3 active speakers (calls setQuietSpeakers([]) to clear)"
  - "offTrack field is separate from offTrackStatus — new SUG-06 structured field alongside legacy backward-compat field"
  - "Analysis injection for quiet speakers uses _promptBuilder directly (same internal boundary as NPC extractor pattern)"

patterns-established:
  - "Fire-and-forget onRecoveryCard: only fires when _consecutiveOffTrackCount >= _offTrackCycleThreshold (2)"
  - "Streaming early-open pattern: onStreamToken fires empty token before streaming starts to open UI card"

requirements-completed: [SUG-04, SUG-06, SUG-07]

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 08 Plan 02: Advanced Suggestion Intelligence — Orchestrator Wiring Summary

**SessionOrchestrator extended with handleGeneralQuery() streaming, consecutive off-track recovery card at 2-cycle threshold, and quiet speaker injection via PromptBuilder before each AI cycle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T10:55:06Z
- **Completed:** 2026-03-20T10:58:39Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `handleGeneralQuery(question)` to SessionOrchestrator, routing on-demand DM questions through `AIAssistant._makeChatRequestStreaming` using `PromptBuilder.buildGeneralQueryMessages`
- Implemented consecutive off-track counter (`_consecutiveOffTrackCount`) that fires `onRecoveryCard` callback only after 2+ consecutive moderate/severe off-track cycles; resets on scene transitions and minor/none severity
- Injected quiet speaker data from `SessionAnalytics.getSpeakerStats()` into `PromptBuilder.setQuietSpeakers()` before each AI analysis cycle, skipping when fewer than 3 active speakers
- Added 21 new unit tests (7 for handleGeneralQuery, 10 for off-track counter, 4 for quiet speaker injection); full suite passes (5096 tests, 67 files)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add handleGeneralQuery() to SessionOrchestrator** - `1228b76` (feat)
2. **Task 2: Add off-track consecutive counter and quiet speaker injection** - `994d746` (feat)

## Files Created/Modified

- `scripts/orchestration/SessionOrchestrator.mjs` - Added handleGeneralQuery(), _consecutiveOffTrackCount field and logic, setQuietSpeakers injection in _runAIAnalysis, three reset points for _consecutiveOffTrackCount
- `tests/orchestration/SessionOrchestrator.test.js` - Added 21 tests: handleGeneralQuery() describe block, _consecutiveOffTrackCount off-track detection describe block, quiet speaker injection describe block

## Decisions Made

- `handleGeneralQuery` does not check `_liveMode` — checks AI configuration only, works in any mode (same pattern as rules card)
- `_consecutiveOffTrackCount` resets on `sceneInfo.isTransition === true` before checking severity, so a transition always clears the counter
- Quiet speaker threshold is `percentage < 15` with minimum 3 active speakers gate (below 3 = too few to have meaningful engagement imbalance)
- `offTrack` field handled separately from legacy `offTrackStatus` for backward compatibility — streaming path produces neither, non-streaming path may produce both

## Deviations from Plan

None — plan executed exactly as written. One test assertion adjusted (checking `error: undefined` using `objectContaining` doesn't match absent keys in Vitest; split into two assertions for clarity).

## Issues Encountered

Minor test assertion issue: `expect.objectContaining({ error: undefined })` fails when the property is absent (not undefined vs. absent distinction in Vitest). Fixed by splitting into `objectContaining({ content: ... })` + `expect(call.error).toBeUndefined()`.

## Next Phase Readiness

- SessionOrchestrator now exports all three orchestration behaviors needed for Plan 03 (UI wiring)
- `handleGeneralQuery` ready for MainPanel to call on user input submission
- `onRecoveryCard` callback slot available in `setCallbacks` for MainPanel to register
- Quiet speaker data flows automatically each AI cycle — no UI wiring needed for this behavior

---
*Phase: 08-advanced-suggestion-intelligence*
*Completed: 2026-03-20*
