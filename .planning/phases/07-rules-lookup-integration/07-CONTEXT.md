# Phase 7: Rules Lookup Integration - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

D&D 5e rules questions detected in the transcript trigger automatic SRD lookups that appear in the panel alongside suggestions, without blocking or delaying the main suggestion cycle. DM can also type rules questions directly into the panel for on-demand answers.

Requirements: RULE-01, RULE-02, RULE-03

</domain>

<decisions>
## Implementation Decisions

### Answer Generation Strategy
- Hybrid approach: instant compendium match first, then AI-grounded refinement
- Compendium search returns top 3 matches immediately (via existing RulesReference.searchRules/searchCompendiums)
- AI refinement uses gpt-4o (not gpt-4o-mini) to synthesize a concise, cited answer from the top 3 compendium hits
- Fire-and-forget parallel execution: rules lookup runs independently via Promise, does not block or delay suggestion generation
- Each detected question triggers its own independent lookup — multiple questions fire in parallel

### Rules Card Presentation
- Rules answers appear in the same card feed as suggestions (not a separate section)
- Cards use the existing purple 'reference' type badge
- Rules cards have a subtle purple-tinted background to visually distinguish from suggestion cards at a glance
- Hybrid transition: card appears immediately with compendium excerpt + 'refining...' indicator, then in-place updates to the AI-synthesized answer when GPT finishes
- Citation displayed as inline badge at bottom of card: '[PHB: Grappling, p.195]' — consistent with Phase 3 source badge pattern

### On-Demand Query UX
- Persistent text input field at the bottom of the panel, placeholder 'Ask a rules question...'
- Input is always available (idle, live, and chronicle modes) — useful for session prep as well as live play
- Submit with Enter key — input clears immediately, rules card appears in feed with loading state
- Auto-detected rules cards get a small 'auto' source badge (consistent with Phase 6 silence-triggered suggestion pattern)
- On-demand rules cards have no extra source badge — just the purple 'reference' type badge

### Duplicate Prevention
- Same rules topic can only trigger auto-lookup once per 5-minute cooldown window
- On-demand queries always go through (DM explicitly asked) — no cooldown applied
- Cooldown tracked per normalized topic string

### Failure Handling
- Rules lookup failure does not affect suggestion generation — the suggestion cycle continues normally (RULE-03)
- Failed lookups show a rules card with 'unavailable' state (muted styling)
- Unavailable cards auto-dismiss after 10 seconds
- DM can manually dismiss any rules card (same X button as suggestion cards)

### Claude's Discretion
- Exact prompt design for the gpt-4o rules synthesis call
- How to normalize topic strings for cooldown dedup (exact match, stemming, etc.)
- CSS implementation for purple-tinted background on rules cards
- How RulesReference.detectRulesQuestion integrates with AIAssistant._detectRulesQuestions (dedup or replace)
- Auto-dismiss animation and timing implementation
- How to handle the input field state during panel re-renders

</decisions>

<specifics>
## Specific Ideas

- The in-place card update should feel smooth — compendium text fades to AI answer, not a jarring replacement
- Citation badges should look like the small source badges from Phase 3 — footnote-style, not competing with the answer content
- The 'auto' badge on auto-detected rules cards should be very subtle (same design language as Phase 6 silence-triggered suggestions)
- The 'refining...' indicator during AI synthesis should use a gentle spinner, similar to Phase 6's 'AI thinking...' streaming placeholder

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RulesReference` (scripts/narrator/RulesReference.mjs): Full service with compendium search, question detection, citation extraction, and source book abbreviation parsing — core asset for this phase
- `RulesReference.detectRulesQuestion()`: Regex-based detection with confidence scoring and topic extraction
- `RulesReference.searchRules()` / `searchCompendiums()`: Keyword search with relevance scoring
- `RulesReference._extractCitation()`: Extracts formatted citations with sourcebook abbreviation and page number
- `AIAssistant._detectRulesQuestions()`: Duplicate rules detection logic in AIAssistant (lines 1454-1539) — should be consolidated with RulesReference
- `AIAssistant.analyzeContext()`: Already returns `rulesQuestions[]` in its result — but nothing downstream consumes it
- Phase 6 suggestion card styling: `.vox-chronicle-suggestion` with type badges and dismiss button
- Phase 6 streaming card pattern: progressive reveal with 'AI thinking...' placeholder

### Established Patterns
- Fire-and-forget with `Promise.allSettled` for non-blocking parallel operations (Phase 3, 4)
- `_callbacks.onStateChange` for orchestrator-to-UI communication (Phase 4, 6)
- Phase 6 streaming-first `_runAIAnalysis` with fallback — rules lookup should run alongside, not inside
- Phase 6 cycle-in-flight guard — rules lookup should NOT be affected by this guard (independent path)
- AbortController for lifecycle management (Phase 4) — rules lookups need abort support on session stop

### Integration Points
- `SessionOrchestrator._runAIAnalysis()`: Where rules questions from `analyzeContext().rulesQuestions` need to trigger independent lookups
- `VoxChronicle.rulesReference`: Already instantiated in singleton initialization — wired but unused in live pipeline
- `MainPanel._prepareContext()`: Where rules cards need to be included in the card feed data
- `main-panel.hbs`: Template needs rules card rendering (extends suggestion card template with purple background variant)
- `OpenAIClient`: Rules synthesis call goes through existing client — separate from suggestion streaming path

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-rules-lookup-integration*
*Context gathered: 2026-03-06*
