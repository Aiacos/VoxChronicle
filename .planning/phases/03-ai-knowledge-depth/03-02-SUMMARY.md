---
phase: 03-ai-knowledge-depth
plan: 02
subsystem: orchestration
tags: [npc-wiring, foreshadowing, live-enrichment, chapter-lookahead, session-orchestrator]

# Dependency graph
requires:
  - phase: 03-ai-knowledge-depth
    plan: 01
    provides: "NPCProfileExtractor, AIAssistant setNPCProfiles/setNextChapterLookahead, source citations"
  - phase: 02-journal-context-pipeline
    provides: "Journal parsing, chapter tracking, RAG context injection"
provides:
  - "End-to-end NPC awareness in live mode (extraction at start, per-cycle detection, live enrichment)"
  - "Next-chapter foreshadowing lookahead injected per AI cycle"
  - "ChapterTracker.getNextChapterContentForAI for sibling chapter content retrieval"
affects: [04-session-reliability, live-mode-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parallel non-blocking initialization: NPC extraction + RAG indexing via Promise.allSettled"
    - "Per-cycle NPC mention detection + profile injection into AI prompt"
    - "Live enrichment: session notes appended to NPC profiles from AI suggestion content"

key-files:
  created: []
  modified:
    - scripts/narrator/ChapterTracker.mjs
    - scripts/orchestration/SessionOrchestrator.mjs
    - tests/narrator/ChapterTracker.test.js
    - tests/orchestration/SessionOrchestrator.test.js

key-decisions:
  - "Access AIAssistant._openaiClient internally to create NPCProfileExtractor (avoids API change, same module boundary)"
  - "NPC extraction runs in parallel with RAG indexing via Promise.allSettled (both non-blocking)"
  - "getNextChapterContentForAI fetches actual content from extractChapterStructure (since getFlatChapterList strips content)"
  - "Live enrichment limited to one session note per suggestion to avoid spam"

patterns-established:
  - "Parallel non-blocking init tasks: collect promises, run with Promise.allSettled, each with own error handling"
  - "Hoisted variable pattern for cross-try-block sharing (fullText declared before try, assigned inside)"

requirements-completed: [CTX-06, CTX-07, SUG-01]

# Metrics
duration: 5min
completed: 2026-03-06
---

# Phase 03 Plan 02: NPC Wiring, Foreshadowing Lookahead, and Live Enrichment Summary

**End-to-end NPC extraction at session start, per-cycle mention detection with profile injection, next-chapter foreshadowing lookahead, and live session note enrichment**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T07:57:13Z
- **Completed:** 2026-03-06T08:02:19Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added getNextChapterContentForAI to ChapterTracker for foreshadowing lookahead with content fetched from full chapter structure
- Wired NPCProfileExtractor into SessionOrchestrator: extraction at session start (parallel with RAG indexing), per-cycle NPC mention detection, foreshadowing injection, and live enrichment
- All 4341 project tests pass (14 new tests added across 2 files)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getNextChapterContentForAI to ChapterTracker** - `2f4008e` (feat)
2. **Task 2: Wire NPC extraction + detection + foreshadowing + live enrichment into SessionOrchestrator** - `02aee9c` (feat)

_All tasks followed TDD (RED-GREEN): tests written first, then implementation._

## Files Created/Modified
- `scripts/narrator/ChapterTracker.mjs` - Added getNextChapterContentForAI() and _getChapterContent() helper for foreshadowing lookahead
- `scripts/orchestration/SessionOrchestrator.mjs` - NPC extraction at init, per-cycle detection/injection, lookahead, live enrichment, cleanup on stop
- `tests/narrator/ChapterTracker.test.js` - 7 new tests for getNextChapterContentForAI edge cases
- `tests/orchestration/SessionOrchestrator.test.js` - 7 new tests for NPC wiring, fallback, and cleanup

## Decisions Made
- Accessed AIAssistant._openaiClient internally to create NPCProfileExtractor (avoids adding openAIClient as a new service parameter)
- NPC extraction and RAG indexing run in parallel via Promise.allSettled (both non-blocking, both with own error handling)
- getNextChapterContentForAI uses extractChapterStructure to fetch actual content (getFlatChapterList strips content for performance)
- Live enrichment appends one session note per suggestion max (break after first NPC match per suggestion)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hoisted fullText variable to share across try/catch scope**
- **Found during:** Task 2 (SessionOrchestrator wiring)
- **Issue:** Plan placed NPC extraction code after the try/catch block, but fullText was declared as const inside the try block (ReferenceError)
- **Fix:** Changed fullText to let declaration before try block, assigned inside try
- **Files modified:** scripts/orchestration/SessionOrchestrator.mjs
- **Verification:** All 199 SessionOrchestrator tests pass
- **Committed in:** 02aee9c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary scoping fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 03 (AI Knowledge Depth) is now complete: NPC extraction, foreshadowing, source citations, and live mode wiring all functional
- Ready for Phase 04 (Session Reliability) which depends on the context pipeline being stable
- All contracts and interfaces working end-to-end

---
*Phase: 03-ai-knowledge-depth*
*Completed: 2026-03-06*
