---
phase: 05-rolling-context-management
plan: 02
subsystem: ai
tags: [token-budget, prompt-engineering, rolling-summary, localization]

requires:
  - phase: 04-session-reliability
    provides: AI suggestion cycle infrastructure
provides:
  - Token budget enforcement in PromptBuilder with priority-based component inclusion
  - Rolling summary injection into AI prompts
  - contextTokenBudget Foundry setting (4K-32K range, 12K default)
  - SummaryAgeBadge localization strings for Plan 03
affects: [05-rolling-context-management]

tech-stack:
  added: []
  patterns: [priority-based token budgeting, safety margin enforcement]

key-files:
  created: []
  modified:
    - scripts/narrator/PromptBuilder.mjs
    - scripts/core/Settings.mjs
    - lang/en.json
    - lang/it.json
    - lang/de.json
    - lang/es.json
    - lang/fr.json
    - lang/ja.json
    - lang/pt.json
    - lang/template.json
    - tests/narrator/PromptBuilder.test.js

key-decisions:
  - "Priority order for budget enforcement: adventure context > verbatim turns > rolling summary > NPC profiles > next chapter lookahead"
  - "10% safety margin applied (effective budget = budget * 0.9) to prevent borderline overflows"
  - "Character/4 heuristic for token estimation (simple, sufficient for budget enforcement)"

patterns-established:
  - "Priority-based component inclusion: variable prompt components have explicit priority and are dropped lowest-first when budget exceeded"
  - "Safety margin pattern: multiply budget by 0.9 before enforcing limits"

requirements-completed: [SESS-03]

duration: 4min
completed: 2026-03-06
---

# Phase 05 Plan 02: Token Budget Enforcement Summary

**Token budget enforcement in PromptBuilder with priority-based component dropping, rolling summary injection, and configurable 4K-32K budget setting**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T12:19:55Z
- **Completed:** 2026-03-06T12:24:14Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- PromptBuilder enforces configurable token budget with priority-based component inclusion
- Rolling summary injected as system message between verbatim turns and NPC profiles
- 10% safety margin prevents borderline context window overflows
- contextTokenBudget Foundry setting registered (world scope, 4K-32K range, 12K default)
- All 8 lang files updated with 4 new localization keys each
- 13 new tests including 180-cycle session simulation proving budget never exceeded

## Task Commits

Each task was committed atomically:

1. **Task 1: Add token budget enforcement to PromptBuilder (RED)** - `84e93e1` (test)
2. **Task 1: Add token budget enforcement to PromptBuilder (GREEN)** - `4e4d713` (feat)
3. **Task 2: Register contextTokenBudget setting with localization** - `ce2cf0f` (feat)

_Note: TDD Task 1 had separate RED and GREEN commits_

## Files Created/Modified
- `scripts/narrator/PromptBuilder.mjs` - Added _estimateTokens, setRollingSummary, setTokenBudget, budget-aware buildAnalysisMessages
- `scripts/core/Settings.mjs` - Registered contextTokenBudget setting
- `tests/narrator/PromptBuilder.test.js` - 13 new tests for token budget enforcement
- `lang/*.json` (8 files) - ContextTokenBudget, ContextTokenBudgetHint, SummaryAgeBadge, SummaryAgeBadgeNone

## Decisions Made
- Priority order: adventure context > verbatim turns > rolling summary > NPC profiles > next chapter (adventure context is highest because it's the source of truth)
- 10% safety margin (effective budget = budget * 0.9) to prevent borderline overflows
- Character/4 heuristic for token estimation (simple, sufficient accuracy for budget enforcement without external tokenizer dependency)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Token budget enforcement ready for Plan 03 integration
- SummaryAgeBadge localization strings pre-created for Plan 03 UI
- PromptBuilder API surface complete: setRollingSummary, setTokenBudget, _estimateTokens

---
*Phase: 05-rolling-context-management*
*Completed: 2026-03-06*
