---
phase: 03-ai-knowledge-depth
plan: 01
subsystem: narrator
tags: [npc-extraction, prompt-engineering, source-citation, gpt-4o-mini, tdd]

# Dependency graph
requires:
  - phase: 02-journal-context-pipeline
    provides: "Journal parsing, chapter tracking, RAG context injection"
provides:
  - "NPCProfileExtractor service for structured NPC extraction from journal text"
  - "PromptBuilder NPC profile and lookahead injection into analysis messages"
  - "Source citation schema (chapter, page, journalName) in AI suggestion responses"
  - "AIAssistant passthrough setters for NPC profiles and chapter lookahead"
affects: [03-02, 04-session-reliability, live-mode-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NPCProfileExtractor: single LLM call for batch NPC extraction with Map keyed by lowercase name + aliases"
    - "Source citation schema embedded in JSON response format for AI suggestions"
    - "Foreshadowing injection via next-chapter lookahead system message"

key-files:
  created:
    - scripts/narrator/NPCProfileExtractor.mjs
    - tests/narrator/NPCProfileExtractor.test.js
  modified:
    - scripts/narrator/PromptBuilder.mjs
    - scripts/narrator/AIAssistant.mjs
    - tests/narrator/PromptBuilder.test.js
    - tests/narrator/AIAssistant.test.js

key-decisions:
  - "gpt-4o-mini as default model for NPC extraction (cost-effective, sufficient quality)"
  - "Map keyed by lowercase name AND aliases for O(1) NPC lookup with deduplication"
  - "Session notes capped at 10 per NPC to prevent unbounded growth"
  - "detectMentionedNPCs capped at 5 results per research recommendation"
  - "Source field defaults to null (not error) when AI omits it"

patterns-established:
  - "NPCProfile typedef: { name, personality, motivation, role, chapterLocation, aliases, sessionNotes }"
  - "Passthrough setter pattern: AIAssistant stores + delegates to PromptBuilder"

requirements-completed: [CTX-06, SUG-01]

# Metrics
duration: 5min
completed: 2026-03-06
---

# Phase 03 Plan 01: NPC Extraction, Foreshadowing, and Source Citations Summary

**NPCProfileExtractor for structured NPC extraction, PromptBuilder NPC/lookahead/source injection, AIAssistant source field parsing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T07:47:44Z
- **Completed:** 2026-03-06T07:53:26Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Created NPCProfileExtractor service that extracts structured NPC profiles from journal text via single LLM call with O(1) Map lookup by name/alias
- Extended PromptBuilder with NPC profile injection, next-chapter foreshadowing, and mandatory source citation schema in JSON response format
- Extended AIAssistant to parse source field from AI responses and passthrough NPC/lookahead setters to PromptBuilder
- All 4327 project tests pass (42 new tests added across 3 files)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NPCProfileExtractor service** - `6ba1586` (feat)
2. **Task 2: Extend PromptBuilder with NPC profiles, lookahead, source schema** - `80dee1f` (feat)
3. **Task 3: Extend AIAssistant with source field parsing and NPC passthrough** - `1987873` (feat)

_All tasks followed TDD (RED-GREEN): tests written first, then implementation._

## Files Created/Modified
- `scripts/narrator/NPCProfileExtractor.mjs` - New service: extracts NPC profiles from journal text via LLM, manages session notes, detects NPC mentions
- `tests/narrator/NPCProfileExtractor.test.js` - 20 tests covering extraction, aliases, edge cases, mention detection, session notes
- `scripts/narrator/PromptBuilder.mjs` - Added setNPCProfiles(), setNextChapterLookahead(), NPC/lookahead system message injection, source schema in JSON format
- `tests/narrator/PromptBuilder.test.js` - 14 new tests for NPC injection, lookahead, source schema, backward compatibility
- `scripts/narrator/AIAssistant.mjs` - Added source field parsing in _parseAnalysisResponse, setNPCProfiles/setNextChapterLookahead passthrough setters
- `tests/narrator/AIAssistant.test.js` - 8 new tests for source extraction, passthrough setters

## Decisions Made
- Used gpt-4o-mini as default model for NPC extraction (cost-effective for structured extraction)
- Map keyed by lowercase name AND aliases for O(1) lookup with deduplication by canonical name
- Session notes capped at 10 entries per NPC (splice oldest when exceeded)
- detectMentionedNPCs capped at 5 results and skips names < 3 chars to avoid false positives
- Source field defaults to null when missing from AI response (graceful degradation, not error)
- Word-boundary regex for NPC mention detection (prevents "garrickson" matching "garrick")

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NPCProfileExtractor, PromptBuilder extensions, and AIAssistant source parsing are ready for Plan 02 integration
- Plan 02 will wire these services into the live mode cycle (SessionOrchestrator, chapter change hooks)
- All contracts and interfaces established; Plan 02 can import and use directly

---
*Phase: 03-ai-knowledge-depth*
*Completed: 2026-03-06*
