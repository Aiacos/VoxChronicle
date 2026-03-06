# Requirements: VoxChronicle — Stabilization & Intelligent DM Assistant

**Defined:** 2026-02-28
**Core Value:** The AI must follow the adventure journal as the source of truth — knowing where the party is, what happened before, and what's coming next.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### AI Context Pipeline

- [x] **CTX-01**: DM can select which Foundry journal is the active adventure before starting live mode
- [x] **CTX-02**: System tracks current chapter/scene position within the selected adventure journal
- [x] **CTX-03**: AI prompts receive chapter-scoped context (current chapter text), not the entire journal dump
- [x] **CTX-04**: RAG indexing uses 1200/300 token chunking for adventure content (not default 800/400)
- [x] **CTX-05**: RAG index updates automatically when journal pages are edited (hook-driven, debounced)
- [x] **CTX-06**: AI surfaces NPC names, personalities, and motivations from adventure journal text when relevant
- [x] **CTX-07**: AI anticipates upcoming scenes from the adventure and can suggest foreshadowing seeds

### Suggestion Quality

- [x] **SUG-01**: AI suggestions reference specific adventure content from the journal, not generic D&D lore
- [ ] **SUG-02**: AI responses stream to the UI with first tokens visible in under 1 second
- [ ] **SUG-03**: Silence detection triggers suggestions after 20-30 seconds of DM silence (calibrated threshold)
- [ ] **SUG-04**: DM can type a question in the panel and receive a direct AI answer (on-demand query)
- [ ] **SUG-05**: Suggestion prompts adapt to current scene type (narration, combat, social, exploration)
- [ ] **SUG-06**: AI detects when players go off-track from the adventure and offers recovery suggestions
- [ ] **SUG-07**: AI uses speaker participation data to weight suggestions (e.g., surface opportunities for quiet players)

### Rules Lookup

- [ ] **RULE-01**: DM can ask D&D 5e rules questions and receive answers grounded in SRD compendium content
- [ ] **RULE-02**: Rules answers include citations to specific SRD sections/sources
- [ ] **RULE-03**: Rules lookup integrates into the live cycle as fire-and-forget (non-blocking)

### Session Reliability

- [ ] **SESS-01**: Live mode survives a full 3-4 hour D&D session without crashes or state corruption
- [x] **SESS-02**: Stop/restart live mode works cleanly using AbortController at all async boundaries
- [ ] **SESS-03**: Session context uses rolling summarization (last 5 turns verbatim + summary of prior turns)
- [x] **SESS-04**: When OpenAI API is unavailable or slow, live mode degrades gracefully with clear DM-facing status
- [x] **SESS-05**: Token usage and API costs are monitored and bounded per session

### UI & Polish

- [x] **UI-01**: All 214 un-namespaced CSS classes are prefixed with `vox-chronicle-` to prevent module conflicts
- [ ] **UI-02**: Suggestions display as glanceable, scannable content (not paragraph walls) in the floating panel

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Cross-Session Memory

- **MEM-01**: AI remembers what happened in previous sessions and can reference past events
- **MEM-02**: Previous session summaries are stored and loaded at session start

### Multi-Campaign Support

- **CAMP-01**: RAG indexes are separated per campaign to prevent cross-contamination
- **CAMP-02**: DM can switch between campaigns without re-indexing

### Chronicle Mode Validation

- **CHRON-01**: Full chronicle workflow (transcribe → extract → generate images → publish to Kanka) works end-to-end
- **CHRON-02**: Entity deduplication prevents duplicate Kanka entries across sessions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replace the DM (autonomous narration) | Destroys DM agency; AI as co-pilot, not pilot |
| Continuous auto-suggestion (every few seconds) | Causes suggestion fatigue; silence-triggered + on-demand only |
| Player-facing AI during live session | Breaks immersion; spoiler risk; DM-only during play |
| Automatic dice rolling / mechanical arbitration | AI hallucinates outcomes; DM makes the call |
| Real-time NPC voice synthesis (TTS) | High latency kills table momentum; DM reads text in own voice |
| Image generation during live session | 10-30 second generation kills momentum; defer to post-session |
| Session state persistence across browser refresh | Complex architecture for marginal gain; design for single-session scope |
| Multi-system support (PF2e, etc.) | Different mechanics, compendiums, and SRD; D&D 5e only this milestone |
| Full transcript display in live UI | Clutters UI; show last 2-3 exchanges only; full transcript post-session |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CTX-01 | Phase 2 | Complete |
| CTX-02 | Phase 2 | Complete |
| CTX-03 | Phase 2 | Complete |
| CTX-04 | Phase 2 | Complete |
| CTX-05 | Phase 2 | Complete |
| CTX-06 | Phase 3 | Complete |
| CTX-07 | Phase 3 | Complete |
| SUG-01 | Phase 3 | Complete |
| SUG-02 | Phase 6 | Pending |
| SUG-03 | Phase 6 | Pending |
| SUG-04 | Phase 8 | Pending |
| SUG-05 | Phase 8 | Pending |
| SUG-06 | Phase 8 | Pending |
| SUG-07 | Phase 8 | Pending |
| RULE-01 | Phase 7 | Pending |
| RULE-02 | Phase 7 | Pending |
| RULE-03 | Phase 7 | Pending |
| SESS-01 | Phase 4 | Pending |
| SESS-02 | Phase 4 | Complete |
| SESS-03 | Phase 5 | Pending |
| SESS-04 | Phase 4 | Complete |
| SESS-05 | Phase 4 | Complete |
| UI-01 | Phase 1 | Complete |
| UI-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 — traceability completed during roadmap creation*
