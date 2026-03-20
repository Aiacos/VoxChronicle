---
phase: 08-advanced-suggestion-intelligence
plan: "01"
subsystem: ai
tags: [prompt-builder, scene-guidance, engagement-injection, general-query, tdd]

# Dependency graph
requires:
  - phase: 06-streaming-suggestions
    provides: PromptBuilder with budget enforcement and NPC profiles
  - phase: 07-rules-card-ui
    provides: Completed streaming pipeline, AIAssistant resetSession()
provides:
  - getSceneTypeGuidance() — structured scene-type blocks for combat/social/exploration/rest
  - setQuietSpeakers() — engagement injection for under-participating players
  - buildGeneralQueryMessages() — standalone message array for on-demand DM queries
  - AIAssistant.resetSession() clears _quietSpeakers to prevent post-session leakage
affects:
  - 08-02 orchestrator wiring (uses setQuietSpeakers and buildGeneralQueryMessages)
  - 08-03 UI routing (buildGeneralQueryMessages provides prompt side of general query)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Scene-type guidance blocks as structured multi-line strings (not one-liners)
    - Quiet-speaker engagement injection after NPC profiles, before next-chapter in budget loop
    - Standalone message builder (buildGeneralQueryMessages) without conversation history

key-files:
  created: []
  modified:
    - scripts/narrator/PromptBuilder.mjs
    - tests/narrator/PromptBuilder.test.js
    - scripts/narrator/AIAssistant.mjs

key-decisions:
  - "getSceneTypeGuidance uses object lookup with || '' fallback (covers null/undefined/unknown uniformly)"
  - "buildGeneralQueryMessages uses NPC name+role+personality+motivation without chapterLocation or sessionNotes (simpler format for standalone queries vs analysis messages)"
  - "quiet-speakers engagement note uses singular/plural verb and pronoun logic based on count"
  - "AIAssistant.resetSession() uses optional chaining (_promptBuilder?.setQuietSpeakers) for safety"

patterns-established:
  - "Scene guidance replaces one-liner stub: getSceneTypeGuidance() delegates from buildSystemPrompt()"
  - "Engagement injection placed after NPC profiles, before next-chapter in budget priority order"

requirements-completed: [SUG-04, SUG-05, SUG-07]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 8 Plan 01: PromptBuilder Extensions Summary

**PromptBuilder extended with scene-type guidance blocks, quiet-speaker engagement injection, and standalone general-query message builder — pure logic, no UI dependency**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-20T10:49:00Z
- **Completed:** 2026-03-20T10:51:57Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `getSceneTypeGuidance(sceneType)` with structured blocks for combat, social, exploration, and rest — replaces the single-line scene stub in `buildSystemPrompt()`
- Added `setQuietSpeakers()` setter and `_quietSpeakers` field; `buildAnalysisMessages()` injects `PLAYER ENGAGEMENT NOTE` with singular/plural grammar when speakers are below 15% threshold
- Added `buildGeneralQueryMessages(question, ragContext)` for on-demand DM queries using full journal context without conversation history
- Fixed `AIAssistant.resetSession()` to call `setQuietSpeakers([])` preventing stale engagement state leaking post-session

## Task Commits

Each task was committed atomically:

1. **Task 1: getSceneTypeGuidance and sceneSection replacement** - `3848f4e` (feat)
2. **Task 2: setQuietSpeakers, buildGeneralQueryMessages, resetSession fix** - `c64fc39` (feat)

_Note: TDD tasks — tests written first (RED), then implementation (GREEN)_

## Files Created/Modified
- `scripts/narrator/PromptBuilder.mjs` - Added getSceneTypeGuidance(), setQuietSpeakers(), _quietSpeakers field, buildGeneralQueryMessages(); replaced sceneSection stub
- `tests/narrator/PromptBuilder.test.js` - Added 25 new tests (9 for Task 1, 16 for Task 2); all 131 pass
- `scripts/narrator/AIAssistant.mjs` - Fixed resetSession() to clear _quietSpeakers via optional chaining

## Decisions Made
- `getSceneTypeGuidance` uses plain object lookup with `|| ''` fallback — covers null, undefined, 'unknown', and any unrecognized string uniformly without special cases
- `buildGeneralQueryMessages` uses a shorter NPC format (name, role, personality, motivation only) vs the full format in `buildAnalysisMessages` (which also includes chapterLocation and sessionNotes) — appropriate for standalone queries
- Engagement note phrasing uses singular/plural verb (`has`/`have`) and pronoun (`their character`/`their characters`) based on quiet speaker count
- `AIAssistant.resetSession()` uses optional chaining (`this._promptBuilder?.setQuietSpeakers([])`) for safety in case promptBuilder is not initialized

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three PromptBuilder primitives exist and are tested: `getSceneTypeGuidance()`, `setQuietSpeakers()`, `buildGeneralQueryMessages()`
- Plan 08-02 (orchestrator wiring) can now wire `setQuietSpeakers()` from SessionAnalytics data
- Plan 08-03 (UI routing) can now call `buildGeneralQueryMessages()` for the general query tab

---
*Phase: 08-advanced-suggestion-intelligence*
*Completed: 2026-03-20*
