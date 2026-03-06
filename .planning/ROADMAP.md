# Roadmap: VoxChronicle — Stabilization & Intelligent DM Assistant

## Overview

This milestone transforms VoxChronicle's live mode from untested infrastructure into a reliable, journal-grounded DM assistant that survives a full 4-hour session. The phases follow strict dependency order derived from the research: CSS cleanup first (independent, eliminates collision risk before any live mode UI work), then the journal context pipeline (without correct adventure context, every suggestion is worthless), then AI knowledge depth (NPC personalities, foreshadowing), then session reliability (AbortController threading, graceful degradation, cost bounding), then rolling context management, then UI accuracy and streaming display, then rules lookup integration, and finally the advanced suggestion intelligence features that require everything below them to be solid. Each phase delivers a verifiable capability before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: CSS Namespace** - Eliminate 214 un-namespaced CSS classes to prevent module conflicts
- [ ] **Phase 2: Journal Context Pipeline** - Wire the journal-to-AI context path so suggestions are adventure-grounded
- [ ] **Phase 3: AI Knowledge Depth** - Surface NPC personalities, anticipate upcoming scenes, ground all suggestions in journal text
- [ ] **Phase 4: Session Reliability** - Make live mode survivable for 4 hours with clean stop mechanics and graceful degradation
- [ ] **Phase 5: Rolling Context Management** - Prevent context window rot with rolling summarization and bounded conversation history
- [ ] **Phase 6: State Machine and UI Accuracy** - Ensure the panel reflects real session state with streaming display and calibrated silence detection
- [ ] **Phase 7: Rules Lookup Integration** - Wire RulesReference into the live cycle as a non-blocking fire-and-forget path
- [ ] **Phase 8: Advanced Suggestion Intelligence** - Add on-demand query, scene-type adaptation, off-track detection, and speaker-aware weighting

## Phase Details

### Phase 1: CSS Namespace
**Goal**: All module CSS classes carry the `vox-chronicle-` prefix so VoxChronicle cannot conflict with other Foundry modules
**Depends on**: Nothing (first phase, independent of all live mode work)
**Requirements**: UI-01
**Success Criteria** (what must be TRUE):
  1. Every CSS class in `styles/vox-chronicle.css` begins with `vox-chronicle-` and no un-namespaced class remains
  2. Every Handlebars template reference matches the renamed classes and the UI renders correctly
  3. Every test that references CSS class names passes without modification to the test assertions
  4. A second Foundry module with generic class names (e.g., `.panel`, `.button`) can be active simultaneously without any VoxChronicle UI element changing appearance
**Plans:** 3 plans
Plans:
- [ ] 01-01-PLAN.md — Namespace speaker-labeling (21 classes) and entity-preview (57 classes) with CSS + JS updates
- [ ] 01-02-PLAN.md — Namespace relationship-graph (24 classes) and vocabulary-manager (33 classes) with CSS + JS + test updates
- [ ] 01-03-PLAN.md — Namespace analytics-tab (48 classes) and journal-picker (31 classes) + comprehensive verification sweep

### Phase 2: Journal Context Pipeline
**Goal**: DMs can select the adventure journal before starting live mode, the system tracks chapter position, and the AI receives chapter-scoped context — not a full journal dump — on every cycle
**Depends on**: Phase 1
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-04, CTX-05
**Success Criteria** (what must be TRUE):
  1. DM can open the live mode panel, see a journal picker, select any Foundry journal, and confirm it before starting the session
  2. The panel displays the current chapter/scene name and updates it when a Foundry scene changes mid-session
  3. Each AI suggestion cycle receives only the current chapter's text as primary context (not the entire journal) plus up to 5 RAG results for cross-chapter references
  4. The RAG vector store is configured with 1200/300-token chunking and updates automatically (debounced) when a journal page is edited
  5. A warning appears if the loaded journal text is under 500 characters or over 200,000 characters, and the DM must confirm before proceeding
**Plans:** 3 plans
Plans:
- [ ] 02-01-PLAN.md — JournalPicker ApplicationV2 dialog + settings + inline confirmation banner + no-journal fallback
- [ ] 02-02-PLAN.md — Chapter tracking wiring + chapter nav bar + chapter-scoped AI context (getCurrentChapterContentForAI)
- [ ] 02-03-PLAN.md — RAG indexing pipeline (4800/1200 chunking) + content hash staleness + debounced live re-indexing

### Phase 3: AI Knowledge Depth
**Goal**: AI suggestions reference specific NPCs, locations, and scene hooks by name from the adventure journal, and can surface what is coming next in the story
**Depends on**: Phase 2
**Requirements**: CTX-06, CTX-07, SUG-01
**Success Criteria** (what must be TRUE):
  1. When a player interacts with an NPC whose name appears in the current chapter, the next AI suggestion includes that NPC's personality or motivation from the journal text
  2. AI suggestions reference at least one specific detail (NPC name, location name, or scene-specific hook) from the loaded adventure journal — not generic D&D lore
  3. DM can request a "what's coming next" suggestion and receive a foreshadowing seed drawn from the next chapter or upcoming encounter in the journal
  4. The structured AI response includes a mandatory `source` field citing the journal chapter and page that grounded the suggestion
**Plans**: TBD

### Phase 4: Session Reliability
**Goal**: Live mode can be started, run for 4 hours, and stopped cleanly at any moment without crashes, state corruption, stale hooks, or runaway API costs
**Depends on**: Phase 2
**Requirements**: SESS-01, SESS-02, SESS-04, SESS-05
**Success Criteria** (what must be TRUE):
  1. Clicking Stop during an active OpenAI API call causes live mode to reach IDLE state within 5 seconds — never requiring a page reload
  2. Live mode runs for 30 minutes of simulated session activity with no crashes, no stale Foundry hook registrations, and no UI state mismatches after reinitialize
  3. When the OpenAI API is unavailable or returns errors, the panel displays a clear status indicator (red/yellow) and suggestions degrade to "unavailable" rather than showing an error crash or silently showing stale content
  4. Token usage and estimated API cost are visible in the panel during a live session, and a configurable per-session cost cap prevents runaway spending
  5. `AudioRecorder.getLatestChunk()` is verified to exist and returns audio correctly, or is implemented if missing
**Plans**: TBD

### Phase 5: Rolling Context Management
**Goal**: Conversation history stays bounded so AI suggestion quality does not degrade over a 4-hour session as the context window fills
**Depends on**: Phase 4
**Requirements**: SESS-03
**Success Criteria** (what must be TRUE):
  1. After 8 turns of conversation history accumulate, the system automatically produces a rolling summary of the prior turns and replaces them with it in the prompt
  2. The last 5 verbatim turns are always preserved alongside the rolling summary
  3. Token count per AI cycle stays at or below 12,000 tokens throughout a simulated 4-hour session (180+ cycles)
  4. The rolling summary content is readable in a debug view and correctly reflects what happened earlier in the session
**Plans**: TBD

### Phase 6: State Machine and UI Accuracy
**Goal**: The MainPanel always reflects the true live session state, suggestions stream with visible first tokens, silence detection triggers at the right threshold, and suggestion cards are glanceable rather than wall-of-text
**Depends on**: Phase 4
**Requirements**: SUG-02, SUG-03, UI-02
**Success Criteria** (what must be TRUE):
  1. First AI suggestion tokens appear in the panel within 1 second of the cycle completing its OpenAI call — the panel never shows a blank loading state for more than 1 second after the call starts returning
  2. After 20-30 seconds of DM silence, the silence detector fires exactly once per silence event — it does not fire while a live cycle is already in flight
  3. The panel's status label (IDLE / ANALYZING / LIVE) matches the actual SessionOrchestrator state at all times, including after settings changes and reinitializations
  4. AI suggestions display as scannable, structured cards with a title, 2-3 bullet points, and a source badge — not as paragraph walls
  5. Navigating between Foundry scenes during live mode updates the chapter context label in the panel within the next cycle
**Plans**: TBD

### Phase 7: Rules Lookup Integration
**Goal**: D&D 5e rules questions detected in the transcript trigger automatic SRD lookups that appear in the panel alongside suggestions, without blocking or delaying the main suggestion cycle
**Depends on**: Phase 6
**Requirements**: RULE-01, RULE-02, RULE-03
**Success Criteria** (what must be TRUE):
  1. When the transcript contains a recognizable rules question (e.g., "how does grapple work", "what's the DC for concentration"), a rules answer appears in the panel within 10 seconds without any DM action
  2. Every rules answer includes a citation to the specific SRD section or compendium source (e.g., "[PHB: Grappling, p.195]") — no uncited rules answers
  3. A rules lookup failure (API error, no SRD match) does not affect suggestion generation — the suggestion cycle continues normally and the rules section shows "unavailable"
  4. DM can also type a rules question directly into the panel and receive a grounded, cited answer on demand
**Plans**: TBD

### Phase 8: Advanced Suggestion Intelligence
**Goal**: Suggestions adapt to scene type, detect when players go off-track, surface opportunities for quiet players, and the DM can query the AI directly at any time
**Depends on**: Phase 6
**Requirements**: SUG-04, SUG-05, SUG-06, SUG-07
**Success Criteria** (what must be TRUE):
  1. DM can type a question into the panel input and receive a direct AI answer within 5 seconds — grounded in the loaded adventure journal
  2. Suggestion prompts visibly differ in structure between scene types: combat suggestions lead with tactical options, social suggestions lead with NPC dialogue hooks, exploration suggestions lead with environmental details
  3. When party dialogue diverges from the adventure path for 2+ consecutive cycles, the panel surfaces a recovery suggestion that references the original adventure hook
  4. When one speaker has contributed less than 15% of the session's total speaking time, the AI includes an engagement opportunity for that player in the next suggestion
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. CSS Namespace | 0/3 | Planning complete | - |
| 2. Journal Context Pipeline | 0/3 | Planning complete | - |
| 3. AI Knowledge Depth | 0/TBD | Not started | - |
| 4. Session Reliability | 0/TBD | Not started | - |
| 5. Rolling Context Management | 0/TBD | Not started | - |
| 6. State Machine and UI Accuracy | 0/TBD | Not started | - |
| 7. Rules Lookup Integration | 0/TBD | Not started | - |
| 8. Advanced Suggestion Intelligence | 0/TBD | Not started | - |
