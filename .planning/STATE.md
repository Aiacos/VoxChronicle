---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Phase 8 context gathered
last_updated: "2026-03-20T10:30:06.951Z"
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 21
  completed_plans: 21
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** The AI must follow the adventure journal as the source of truth — knowing where the party is, what happened before, and what's coming next.
**Current focus:** Phase 07 — rules-lookup-integration

## Current Position

Phase: 07 (rules-lookup-integration) — EXECUTING
Plan: 1 of 3

## Performance Metrics

**Velocity:**

- Total plans completed: 9
- Average duration: 7min
- Total execution time: 0.8 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-css-namespace | 3 | 16min | 5.3min |
| 02-journal-context-pipeline | 3 | 22min | 7.3min |
| 03-ai-knowledge-depth | 2 | 10min | 5min |

**Recent Trend:**

- Last 5 plans: 02-01 (8min), 02-02 (5min), 02-03 (9min), 03-01 (5min), 03-02 (5min)
- Trend: stable

*Updated after each plan completion*
| Phase 04 P01 | 6min | 2 tasks | 14 files |
| Phase 04 P02 | 14 | 2 tasks | 14 files |
| Phase 04 P03 | 3min | 1 tasks | 4 files |
| Phase 05 P01 | 5min | 2 tasks | 5 files |
| Phase 05 P02 | 4min | 2 tasks | 11 files |
| Phase 05 P01 | 4min | 2 tasks | 4 files |
| Phase 05 P03 | 2min | 2 tasks | 6 files |
| Phase 06 P01 | 5min | 2 tasks | 6 files |
| Phase 06 P02 | 5min | 2 tasks | 6 files |
| Phase 06 P03 | 5min | 2 tasks | 6 files |
| Phase 06 P04 | 4min | 1 tasks | 2 files |
| Phase 07 P01 | 2min | 1 tasks | 2 files |
| Phase 07 P02 | 4min | 2 tasks | 4 files |
| Phase 07 P03 | 4min | 1 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: CSS namespace fix placed first (Phase 1) — independent of all live mode work, eliminates collision risk before any UI layer changes during live mode stabilization
- [Roadmap]: Journal context pipeline (Phase 2) placed before session reliability (Phase 4) — measuring cycle reliability requires correct context; otherwise context bugs and cycle bugs are indistinguishable
- [Roadmap]: Phase 3 (AI Knowledge Depth) and Phase 4 (Session Reliability) both depend on Phase 2 — Phase 5 (Rolling Context) depends on Phase 4; Phase 6 depends on Phase 4; Phases 7-8 depend on Phase 6
- [01-01]: Modifier classes (known, selected, collapsed, success, error, creating) kept un-prefixed -- used only in compound selectors with namespaced parents
- [01-01]: Flat prefix pattern (vox-chronicle-speaker-row, not BEM __element) established as convention for CSS namespace
- [01-02]: Foundry-native TabsV2 classes (tabs, item, tab) kept un-prefixed -- required by Foundry's tab system
- [01-02]: Modifier class 'danger' kept un-prefixed -- used only with namespaced parent vox-chronicle-action-group
- [01-03]: Replaced hidden class with vox-chronicle-hidden to avoid collision with Foundry/other modules
- [01-03]: Modifier classes nested and expanded kept un-prefixed per established convention
- [02-01]: Pre-computed boolean flags (isJournalTooShort/isJournalTooLong) instead of Handlebars eq helper for content warnings
- [02-01]: Auto-select scene-linked journal as fallback before opening picker -- reduces DM friction
- [02-03]: crypto.subtle.digest for SHA-256 hashing (browser-native, no external deps needed)
- [02-03]: RAG indexing failure non-blocking -- wrapped in try/catch so live mode start is not blocked
- [02-03]: Simple boolean flag + queue for reindexJournal concurrency guard (sufficient for single-user DM)
- [02-02]: User-selected journal takes priority over scene-linked journal in _initializeJournalContext
- [02-02]: getCurrentChapterContentForAI(8000) with fallback to substring(0,3000) for backward compatibility
- [02-02]: Manual chapter navigation updates on next AI cycle, not immediately (avoids extra API calls)
- [03-01]: gpt-4o-mini as default model for NPC extraction (cost-effective, sufficient quality for structured extraction)
- [03-01]: Map keyed by lowercase name AND aliases for O(1) NPC lookup with deduplication by canonical name
- [03-01]: Source field defaults to null when missing from AI response (graceful degradation, not error)
- [03-01]: Session notes capped at 10 per NPC, detectMentionedNPCs capped at 5 results
- [03-02]: NPC extraction + RAG indexing run in parallel via Promise.allSettled (both non-blocking)
- [03-02]: Access AIAssistant._openaiClient to create NPCProfileExtractor (internal module boundary, avoids API change)
- [03-02]: getNextChapterContentForAI fetches from extractChapterStructure (getFlatChapterList strips content)
- [Phase 04]: AbortSignal.any() with manual fallback for combining external + timeout signals
- [Phase 04]: Circuit breaker thresholds: 2 errors = degraded, 5 = down (matches TranscriptionService pattern)
- [Phase 04]: CostTracker.isCapExceeded(0) returns false -- 0 = disabled
- [Phase 04]: Audio stop prioritized over analytics in shutdown sequence (time-critical resource)
- [Phase 04]: Health tracking independent per-service for granular UI feedback
- [Phase 04]: Cost cap pauses AI suggestions only, transcription continues as core function
- [Phase 04]: usage defaults to null when OpenAI response lacks usage field (graceful degradation)
- [Phase 04]: model falls back to this._model in AIAssistant and gpt-4o-mini in orchestrator (defense in depth)
- [05-02]: Priority order for budget enforcement: adventure context > verbatim turns > rolling summary > NPC profiles > next chapter lookahead
- [05-02]: 10% safety margin applied (effective budget = budget * 0.9) to prevent borderline overflows
- [05-02]: Character/4 heuristic for token estimation (simple, sufficient for budget enforcement)
- [05-01]: Concurrency guard via simple boolean _isSummarizing (sufficient for single-user DM context)
- [05-01]: Empty turns early-return skips API call entirely (no wasted cost)
- [05-01]: Optional chaining on setRollingSummary to avoid breaking PromptBuilder before Plan 02
- [05-03]: Access AIAssistant._openaiClient for RollingSummarizer init (same internal boundary pattern as NPCProfileExtractor)
- [05-03]: Debug prompt dump in AIAssistant.analyzeContext() where messages are built (not orchestrator)
- [05-03]: Summary badge placed above cost footer with subtle informational styling
- [05-03]: Fallback chain for summarizedTurnCount: VoxChronicle.aiAssistant then orchestrator._aiAssistant
- [06-02]: 3-state status badge mapping: idle (gray), live (green), analyzing (amber+pulse) covers all DM-visible states
- [06-02]: Type badge colors: narration=blue, dialogue=green, action=orange, reference=purple
- [06-02]: Bullet limit of 3 max per card for glanceability
- [06-02]: Streaming card state stored on instance properties for re-render recovery
- [06-01]: postStream bypasses queue and retry -- streaming is long-lived with implicit retry via next cycle
- [06-01]: Cycle-in-flight guard is synchronous check, drops event entirely (no queuing)
- [06-03]: Synchronous _isCycleInFlight set before IIFE prevents microtask race with silence timer
- [06-03]: Incremental token diffing via slice from accumulated length avoids duplicate text in streaming cards
- [06-03]: Completed suggestions pushed to _lastAISuggestions for persistence across re-renders
- [06-03]: Streaming card recovery in _onRender reconstructs from instance state on DOM replacement
- [06-04]: Streaming-first path calls generateSuggestionsStreaming before analyzeContext fallback
- [06-04]: _detectSuggestionType uses regex on first line for type inference with narration default
- [06-04]: offTrackStatus is undefined in streaming path -- downstream code tolerates via !== undefined check
- [07-01]: Stop words for topic normalization: how, does, do, what, is, the, rule, rules, for, a, an, can, i, you, work, works, when, if
- [07-01]: Synthesis system prompt: D&D 5e rules expert, cite sources in brackets, 2-3 sentences max
- [07-01]: Excerpt content capped at 1500 chars per compendium result in synthesis prompt
- [07-01]: Citation extraction falls back to rule.source when citation.formatted is missing
- [07-02]: Fire-and-forget rules lookup runs via .then()/.catch() -- never blocks suggestion streaming
- [07-02]: onRulesCard callback emits unavailable=true on failure (graceful degradation, not crash)
- [07-02]: handleManualRulesQuery uses skipCooldown=true for on-demand UI queries
- [07-02]: AIAssistant delegates _detectRulesQuestions to RulesReference with inline fallback
- [07-02]: Rules services passed via setNarratorServices after creation (second call pattern)
- [Phase 07]: Rules input always visible (not gated behind isLiveMode) — available in idle, live, and chronicle modes per plan requirement

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 4]: `AudioRecorder.getLatestChunk()` existence unconfirmed — verify before Phase 4 begins; may need implementation
- [Pre-Phase 2]: RAG vector store may never have been tested end-to-end — include explicit indexing verification in Phase 2 plan
- [Pre-Phase 4]: `_liveTranscript` accumulation risk — verify AudioRecorder doesn't accumulate full audio blobs in live mode (potential session-ending memory issue on 4-hour sessions)

## Session Continuity

Last session: 2026-03-20T10:30:06.948Z
Stopped at: Phase 8 context gathered
Resume file: .planning/phases/08-advanced-suggestion-intelligence/08-CONTEXT.md
