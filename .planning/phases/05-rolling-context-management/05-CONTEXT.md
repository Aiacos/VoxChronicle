# Phase 5: Rolling Context Management - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Prevent context window rot with rolling summarization and bounded conversation history. After 8 turns of conversation history accumulate, the system produces a rolling summary and replaces older turns with it. Token count per AI cycle stays at or below a configurable budget (default 12K) throughout a 4-hour session.

Requirements: SESS-03

</domain>

<decisions>
## Implementation Decisions

### Summarization Trigger & Format
- Summarization triggers after 8 conversation history entries accumulate in `_conversationHistory`
- Last 5 verbatim turns always preserved alongside the rolling summary (aligns with existing `PromptBuilder.slice(-5)`)
- Summary contains full narrative recap: plot events, party decisions, NPC/player actions, tone and detail preserved
- Regeneration approach: each trigger re-summarizes the full existing summary + newly evicted turns into a fresh compressed summary (not incremental append)

### Token Budget Allocation
- Priority-based overflow budget: fill components in priority order until 12K budget hit
- Priority order: Adventure context > Verbatim turns > Rolling summary > NPC profiles > Next chapter lookahead
- System prompt and user request always included (fixed overhead ~1500 tokens)
- Token estimation via simple char/4 heuristic (~85% accurate, zero dependencies)
- Budget limit is a Foundry setting (world-scoped) with 12K default, so power users can adjust

### Summary Visibility & Debug
- Rolling summary logged to console at debug level via existing `Logger.debug()` — visible when debug mode is enabled
- Full prompt dump logged each cycle when debug mode is on (no separate verbose flag)
- Small UI badge showing summary age (e.g. "Context: 45 turns summarized") — gives DM confidence the AI remembers earlier conversation

### Summarization Method
- AI-powered via GPT-4o-mini: send evicted turns + existing summary for re-summarization (~$0.001 per call)
- Summarization runs in background async — parallel with the next live cycle, no latency impact on suggestions
- On API failure: keep old summary, retry at next trigger (graceful degradation, no user-visible impact)
- Summarization cost tracked via Phase 4's CostTracker — included in session cost total and cost cap enforcement

### Claude's Discretion
- Exact summarization prompt design (system message for GPT-4o-mini)
- How to handle the first summarization when no prior summary exists
- Concurrency guard if summarization overlaps with next trigger
- Summary maximum token cap (within the 2K-ish allocation)
- Badge placement and styling in MainPanel

</decisions>

<specifics>
## Specific Ideas

- Adventure journal is the #1 source of truth — it gets priority over conversation history in the budget
- The DM badge ("45 turns summarized") should feel informational like the Phase 4 cost footer — not alarming
- Full prompt dump in debug mode is important for verifying the AI actually receives correct context

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AIAssistant._conversationHistory`: Array of `{role, content}` entries, currently capped at 20 via simple slice — direct integration point for rolling summarization
- `AIAssistant._maxHistorySize = 20`: Hardcoded constant, will become the "trigger threshold" concept
- `PromptBuilder.buildAnalysisMessages()`: Assembles the full prompt — needs token budget enforcement added
- `PromptBuilder.slice(-5)` at line 321: Already slices last 5 history entries — aligns with verbatim turn decision
- `CostTracker` (Phase 4): Tracks token usage and cost per session — summarization calls feed into this
- `Logger.createChild('ServiceName')`: Established debug logging pattern

### Established Patterns
- `Promise.allSettled` for non-blocking parallel operations (used in Phase 3 NPC + RAG)
- AbortController pattern for lifecycle management (Phase 4)
- `OpenAIClient._enqueueRequest` for sequential API calls with retry
- Circuit breaker pattern in TranscriptionService (reusable for summarization failure tracking)

### Integration Points
- `AIAssistant._addToConversationHistory()` (line 1720): Where turns are added — summarization trigger check goes here
- `PromptBuilder.buildAnalysisMessages()` (line 282): Where the prompt is assembled — budget enforcement goes here
- `PromptBuilder.setConversationHistory()` (line 141): Where history is passed in — needs to also receive rolling summary
- `SessionOrchestrator._liveCycle()` (line 1425): Where async summarization would be kicked off
- `MainPanel` template: Where the summary age badge would appear
- `Settings.registerSettings()`: New setting for contextTokenBudget

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-rolling-context-management*
*Context gathered: 2026-03-06*
