# Phase 8: Advanced Suggestion Intelligence - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Suggestions adapt to scene type, detect when players go off-track, surface opportunities for quiet players, and the DM can query the AI directly at any time — grounded in the loaded adventure journal.

Requirements: SUG-04, SUG-05, SUG-06, SUG-07

</domain>

<decisions>
## Implementation Decisions

### On-Demand General Query (SUG-04)
- Repurpose existing rules input field as dual-purpose: rules questions AND general DM queries
- Intent detection: if input matches rules patterns (keywords like "rule", "DC", "how does X work", "what's the modifier for") → route to existing `handleManualRulesQuery`; otherwise → route to new `handleGeneralQuery` on SessionOrchestrator
- General queries use AIAssistant with full journal context (chapter, NPC profiles, rolling summary) — same as auto-suggestions but with the user's question as the primary prompt
- Response appears as a streaming card in the existing suggestion feed — same card format, same streaming behavior
- Type badge inferred from response content (narration/dialogue/action/reference) — same `_detectSuggestionType` logic
- Input placeholder changes to "Ask anything..." (broader than current "Ask a rules question...")
- Input remains always visible (idle, live, chronicle modes) — already implemented

### Scene-Type Prompt Adaptation (SUG-05)
- PromptBuilder gets a `getSceneTypeGuidance(sceneType)` method returning scene-specific system prompt sections
- Combat: lead with tactical options, initiative-aware actions, enemy ability reminders, environment hazards
- Social: lead with NPC dialogue hooks, relationship dynamics, persuasion/deception opportunities, faction motives
- Exploration: lead with environmental descriptions, perception/investigation triggers, hidden elements, lore drops
- Rest: lead with downtime activities, character development moments, foreshadowing, camp events
- Unknown/fallback: generic balanced guidance (current behavior)
- Scene type injected into system prompt by PromptBuilder._buildSystemPrompt() — not a separate API call
- Scene type already flows from SceneDetector → SessionOrchestrator._currentSceneType → analyzeContext options

### Off-Track Detection & Recovery (SUG-06)
- Off-track analysis embedded in the existing `analyzeContext()` AI prompt — NOT a separate API call
- AI structured response includes `offTrack` field: `{ detected: boolean, severity: 'minor'|'moderate'|'severe', reason: string, recoveryHook: string }`
- `recoveryHook` is a specific reference to the adventure journal content that the party diverged from (e.g., "The quest giver mentioned the northern ruins — players went east instead")
- Trigger threshold: off-track detected at moderate+ severity for 2+ consecutive cycles before surfacing a recovery card
- Recovery card: amber-tinted background (distinct from purple rules, default suggestion cards), with "Off Track" badge, recovery hook text, and a dismiss button
- Minor off-track is logged but not surfaced — DMs often let minor diversions play out
- `offTrackSensitivity` setting already registered in Settings.mjs — use it to adjust detection threshold
- Off-track state resets when SceneDetector detects a new scene transition

### Speaker-Aware Weighting (SUG-07)
- SessionAnalytics.getParticipationStats() data injected into PromptBuilder context
- If any speaker has <15% of total speaking time over the last 30 minutes, PromptBuilder adds engagement guidance to system prompt: "Player [name] has been quiet — consider creating an opportunity for their character"
- The 15% threshold is hardcoded (not a setting) — it's a sensible default and adding a setting would clutter the settings panel
- Weighting is invisible to the DM — no separate UI indicator, just influences suggestion content
- Speaker names come from the speakerMap (already mapped from SPEAKER_00 → player names)
- Only applies when 3+ speakers are active (with 2 speakers, 50/50 is expected DM/player split)

### Claude's Discretion
- Exact wording of scene-type-specific prompt sections
- How to structure the off-track detection within the existing AI prompt format
- Whether to use a single combined prompt or separate prompt sections for each feature
- Loading/transition animations for on-demand query cards

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 8 Requirements
- `.planning/REQUIREMENTS.md` §Suggestion Quality — SUG-04 through SUG-07 acceptance criteria

### Prior Phase Patterns (reuse these)
- `.planning/phases/06-state-machine-ui-accuracy/06-CONTEXT.md` — Card layout, streaming behavior, type badges, silence guard patterns
- `.planning/phases/07-rules-lookup-integration/07-CONTEXT.md` — On-demand input UX, fire-and-forget pattern, card presentation with type badges
- `.planning/phases/05-rolling-context-management/05-CONTEXT.md` — PromptBuilder token budget, context priority ordering

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — Service wiring, EventBus audit, workflow chains

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SceneDetector.mjs`: Already detects scene types (combat/social/exploration/rest) with keyword scoring — scene type flows to SessionOrchestrator._currentSceneType
- `SessionAnalytics.mjs`: Already tracks speaker participation with `addSegment()` and `getParticipationStats()` — wired into live cycle
- `PromptBuilder.mjs`: Builds AI prompts with budget enforcement — natural place for scene-type and speaker-weighting additions
- `AIAssistant.analyzeContext()`: Already has `offTrackStatus` field in response — currently not populated by prompt
- `SessionOrchestrator._runAIAnalysis()`: Already handles offTrackStatus from analyzeContext — stores in `_lastOffTrackStatus`, calls callback
- `MainPanel.mjs`: Rules input field already wired with Enter handler — can be extended for general queries
- `SessionOrchestrator.handleManualRulesQuery()`: Pattern for on-demand queries — general query follows same shape

### Established Patterns
- Fire-and-forget parallel execution (from Phase 7 rules lookup)
- Streaming card creation/finalization (from Phase 6)
- Structured card format with type badges (from Phase 6)
- AbortController signal threading (from Phase 4)
- Token budget enforcement in PromptBuilder (from Phase 5)

### Integration Points
- `PromptBuilder._buildSystemPrompt()` — add scene-type guidance and speaker-weighting here
- `AIAssistant.analyzeContext()` — add off-track detection to the AI prompt
- `SessionOrchestrator._runAIAnalysis()` — already handles offTrackStatus; add recovery card callback
- `MainPanel._onRender()` rules input handler — extend to detect general vs rules queries
- `SessionOrchestrator` needs new `handleGeneralQuery(question)` method (mirrors handleManualRulesQuery pattern)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow the patterns established in Phases 6 and 7 for card presentation and streaming behavior.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-advanced-suggestion-intelligence*
*Context gathered: 2026-03-20*
