# Project Research Summary

**Project:** VoxChronicle — AI DM Assistant Live Mode Stabilization
**Domain:** Real-time AI assistant for tabletop RPG sessions (Foundry VTT module)
**Researched:** 2026-02-28
**Confidence:** HIGH

## Executive Summary

VoxChronicle is a Foundry VTT module that provides real-time AI DM assistance during D&D 5e sessions. The live mode pipeline captures audio every 10 seconds, transcribes it via GPT-4o, retrieves relevant adventure content via RAG, and generates structured suggestions via GPT-4o-mini — all within a 5-second latency budget. Research confirms this architecture is sound and the technology stack is already optimal; the challenge is not design but stabilization. The core infrastructure exists and is partially working. What remains is connecting the parts correctly, fixing known reliability gaps, and ensuring the system degrades gracefully rather than failing silently during a 4-hour session.

The recommended approach is sequential stabilization in four phases ordered by dependency. Phase 1 must fix the journal-to-AI context pipeline (without correct adventure context, every suggestion is worthless generic D&D). Phase 2 must fix session reliability and stop mechanics (a system that cannot be cleanly stopped or survives 4 hours is unusable). Phase 3 must wire the state machine and UI correctly so DMs see accurate feedback. Phase 4 integrates RulesReference into the live pipeline to complete the table-stakes feature set. Only after all four phases are stable should advanced differentiators (off-track detection, NPC personality surfacing, adventure anticipation) be pursued.

The most critical risk is generic AI suggestions caused by incorrect journal context loading — research confirms this is the single reason DMs stop using AI assistant tools. A close second is latency: suggestions that arrive 10+ seconds after the relevant conversation moment are useless. Both risks are mitigatable through specific, well-documented changes to the existing codebase. The stack is correct, the architecture patterns are sound, and the pitfalls are known. This is an execution problem, not a design problem.

---

## Key Findings

### Recommended Stack

This is not a greenfield project. The stack is fixed and correct for the domain. The research focus was on how to configure and use these technologies optimally, not which technologies to adopt.

**Core technologies:**
- **gpt-4o-mini** (chat/suggestions) — optimal cost/performance for structured DM suggestions; 53 tokens/sec output, 0.44s TTFT; $0.15/1M input tokens yields ~$1.50-$2.50 per 3-4 hour session at 10s polling with bounded context
- **gpt-4o-transcribe** (audio) — already in use; no changes needed; continue at 10s batch intervals
- **OpenAI File Search / vector store** (RAG) — zero-ops managed RAG; configure at 1200/300 token chunks (larger than default 800/400 to preserve narrative scene context); max_num_results=5; persist vector store ID in game.settings to avoid re-indexing costs
- **Foundry VTT v13 API** — fixed runtime; JournalEntryPage.text.content is the correct v13 text extraction target; updateScene hook must be wired for mid-session scene tracking
- **Vitest 2.0.0** — existing test suite must stay green throughout all work

**Critical configuration details:**
- Use `response_format: {type: "json_object"}` — NOT `json_schema` strict mode (breaks on newer model snapshots)
- Cap `max_tokens: 400-600` for all suggestion calls — uncapped responses add 3-4s latency
- Sliding window conversation history: 8-10 turns (NOT 20) for live mode; rolling summary after every 8 turns
- RAG chunks: 1200 tokens / 300 overlap static chunking (semantic chunking costs an extra LLM call — not worth it for adventure content)
- Structured response must include mandatory `source` field citing journal chapter/page; enables citation badges in UI

### Expected Features

The competitive landscape (RPGX AI Librarian, Archivist, Foundry Familiar) confirms VoxChronicle's unique position: it is the only tool combining real-time transcription + journal RAG + session analytics + chronicle publishing. The execution quality gap is the opportunity.

**Must have (table stakes) — for live mode to be genuinely useful:**
- Journal-grounded suggestions that cite specific adventure content — without this, the tool is ChatGPT with extra steps
- D&D 5e rules lookup with SRD-grounded answers and citations — hallucinated rules are worse than no AI
- Session-persistent context for a full 3-4 hour session — requires bounded context management (rolling summaries)
- Silence-triggered suggestions at 20-30 second threshold — core UX pattern; must not fire during natural pauses
- On-demand text query — manual "ask the AI" fallback; every comparable tool has this
- Sub-5-second streaming response time — time-to-first-token matters more than total response time
- Graceful degradation when AI unavailable — clear status, not a broken UI

**Should have (competitive differentiators) — add after P1 is stable:**
- Scene type detection with per-scene-type prompt calibration (combat vs. social vs. exploration)
- NPC personality surfacing from journal text when party interacts with named NPCs
- Off-track detection with recovery suggestions when party diverges from adventure progression
- SRD citation display as "[Chapter 2: p.4]" badges in suggestion cards
- RAG health indicator (green/yellow/red) so DM knows when suggestions are context-grounded

**Defer (v2+) — requires P1 + P2 fully stable first:**
- Adventure anticipation / foreshadowing (requires reliable chapter tracking + spoiler controls)
- Cross-session memory (significant architecture work, defer until single-session is solid)
- Speaker-aware suggestion weighting (speaker labeling works; connecting to suggestion logic is additive)
- Multi-campaign RAG separation

**Anti-features (do not build):**
- Continuous auto-suggestion every few seconds — causes suggestion fatigue; DMs ignore the panel entirely
- Full session transcript display in UI — DMs have no time to read it; use as AI input not DM display
- Real-time NPC voice synthesis — 1-3s TTS latency kills table momentum
- Image generation during live sessions — 10-30s generation time; wrong workflow

### Architecture Approach

The live mode pipeline has four coordinated stages: context initialization (once at session start), live audio cycle (every 10s, fully sequential), silence path (parallel, timer-based), and scene change handling (event-driven via Foundry hooks). The sequential cycle design is load-bearing — do not parallelize cycles. The most important architectural gaps are: (1) ChapterTracker is not wired to the `updateScene` Foundry hook so mid-session scene changes are silently missed, (2) SilenceMonitor has no guard against firing while a live cycle is in-flight, and (3) MainPanel caches the orchestrator reference at construction time making it stale after reinitialize.

**Major components and responsibilities:**
1. **SessionOrchestrator** — owns the 10s timer cycle, wires all services, manages session state machine; single entry point for live mode; must add AbortController signal threading for clean stop
2. **AIAssistant** — orchestrates per-cycle analysis: RAG retrieval + PromptBuilder + OpenAI call; 1614-line god object; acceptable for this milestone, refactor in v4
3. **PromptBuilder** — constructs all message arrays; owns prompt templates; stateless per call; context injection order matters: system prompt → chapter context → session summary → RAG results → conversation history → current request
4. **JournalParser + ChapterTracker** — parse Foundry journal HTML into plain text and track adventure position; parse once at session start (not per cycle); must be wired to updateScene hook
5. **RAGProvider (OpenAI File Search)** — semantic retrieval over indexed adventure documents; 2s timeout (enrichment, not required); exponential backoff re-enable after 3 failures
6. **MainPanel** — floating panel with suggestion display; must always resolve orchestrator dynamically (never cache); AbortController pattern for event listeners to prevent memory leaks

**Data flow rule:** Sources (game.journal, canvas.scene, AudioRecorder) → Pipeline (JournalParser, AudioChunk) → AI Layer (TranscriptionService, SceneDetector, AIAssistant) → Session State (SessionOrchestrator state, SessionAnalytics) → UI (MainPanel). Nothing in the UI layer writes to SessionOrchestrator state. These boundaries must remain clean.

### Critical Pitfalls

The following pitfalls are ordered by their impact on the actual session experience, not alphabetically. All are grounded in direct codebase inspection.

1. **Wrong or full-journal adventure context loaded silently** — `_initializeJournalContext()` falls back to "first world journal" if no scene-linked journal is found; typical Foundry worlds have player notes, house rules, and handouts as the first journals; the AI will ground in the wrong adventure with no error; fix: require explicit journal picker confirmation before live mode starts; warn if loaded text is < 500 chars or > 200,000 chars

2. **Generic AI suggestions that ignore the adventure** — even with the correct journal loaded, passing the full journal text as a flat string causes suggestions averaged across all chapters; the model needs current-chapter-scoped context, not the entire adventure; fix: feed `ChapterTracker.getCurrentChapterContentForAI()` as primary context; use RAG for cross-chapter references; never dump full journal into every prompt

3. **State machine stuck — session cannot be stopped** — `stopLiveMode()` sets `_isStopping = true` but the currently-running async cycle continues awaiting OpenAI API; when it completes it calls `_scheduleLiveCycle()` again; session cannot be stopped without page reload; fix: thread AbortController signal through every await boundary in `_liveCycle()`; check `signal.aborted` at each await

4. **Silence detection fires while transcription is in-flight** — SilenceMonitor wall-clock timer fires independently of live cycle async state; both paths call `onAISuggestion` callback simultaneously; UI flickers with two competing suggestions; state machine enters LIVE_ANALYZING twice; fix: add `_isAnalyzing` flag that SilenceMonitor checks before triggering

5. **Silent RAG degradation** — after 3 consecutive RAG failures the system silently disables RAG for the rest of the session; suggestions become generic without any visible change; DM assumes AI is working; fix: persistent RAG status indicator in UI (green/yellow/red); exponential backoff re-enable (60s after 3 failures, 120s after 4, etc.)

6. **Context window rot over a 4-hour session** — 20-entry conversation history at full adventure context can reach 40,000-60,000 tokens per cycle; GPT-4 "lost in the middle" degradation causes quality decay after hour 2; fix: cap conversation history at 8-10 entries for live mode; implement rolling summary every 8 turns; only pass last 3-5 minutes of transcript, not full session

7. **Foundry hook accumulation on reinitialize** — `VoxChronicle.reinitialize()` registers `Hooks.on()` listeners without clearing old ones; after settings change, every hook fires twice; scene changes trigger two ChapterTracker.updateFromScene() calls; fix: store hook IDs from `Hooks.on()` and call `Hooks.off(id)` on teardown; add teardown methods to all narrator services

8. **MainPanel stale orchestrator reference** — MainPanel caches orchestrator at construction; after `VoxChronicle.resetInstance()`, new orchestrator callbacks never reach MainPanel; UI shows IDLE even when session is running; fix: always resolve orchestrator as `VoxChronicle.getInstance().orchestrator` dynamically, never cache

---

## Implications for Roadmap

Based on combined research, the codebase has four distinct problem classes that must be addressed in strict dependency order. Solving problems out of order wastes effort: cycle reliability doesn't matter if context is wrong; state machine correctness doesn't matter if cycles don't run; RulesReference integration doesn't matter if the state machine is broken.

### Phase 1: AI Context Quality Foundation

**Rationale:** Every AI suggestion depends on the journal-to-AI context pipeline being correct. If adventure content does not reach the AI prompt scoped to the current chapter, all suggestions are generic and DMs stop using the panel. This is the zero-to-one problem — nothing else has value without this working.

**Delivers:** Live mode suggestions that reference actual adventure content (NPCs by name, location details, scene-specific hooks); DM can confirm which journal is loaded before session starts; RAG health is visible; context stays bounded over a 4-hour session

**Features addressed:** Journal-grounded suggestions (P1), session-persistent context (P1), SRD rules lookup (P1), RAG health indicator (P2)

**Stack elements:** OpenAI File Search at 1200/300 chunk config; `response_format: json_object`; `max_tokens: 400-600`; sliding window 8-10 history entries; rolling summary every 8 turns

**Pitfalls avoided:** Pitfall 1 (generic suggestions), Pitfall 2 (wrong journal), Pitfall 3 (context rot), Pitfall 5 (silent RAG degradation)

**Testing signal:** Run a 30-minute simulated session with an actual adventure journal loaded; every AI suggestion must reference at least one NPC name or location from the journal; token count per cycle must stay bounded at < 12K tokens throughout

### Phase 2: Session Reliability and Stop Mechanics

**Rationale:** Even with correct context, a system that cannot be cleanly stopped or that accumulates state bugs over a 4-hour session is unusable in a live game. Reliability issues are invisible until they fail catastrophically mid-session. These fixes must be complete before any further feature work.

**Delivers:** Live mode that can be started, run for 4 hours, and stopped cleanly; no race conditions between silence detection and live cycle; no stale references after settings change; hooks clean up on reinitialize; cost stays under $3 per session

**Features addressed:** Graceful degradation when AI unavailable (P1), on-demand text query (needs stable cycle to rely on), cost visibility

**Stack elements:** AbortController pattern (already established in ApplicationV2 UI components, extend to async cycles); OpenAI cost estimation via token tracking

**Pitfalls avoided:** Pitfall 4 (state machine stuck), Pitfall 6 (cost overrun), Pitfall 8 (MainPanel stale reference), Pitfall 9 (silence detection concurrent), Pitfall 10 (hook accumulation)

**Testing signal:** Start live mode, wait 15 seconds (mid-cycle), click Stop — state must reach IDLE within 5 seconds; run 30-minute test session and verify actual API spend extrapolates under $3 for 4 hours; reinitialize test passes (UI responds after settings change)

### Phase 3: State Machine and UI Accuracy

**Rationale:** Once the cycle is reliable and context is correct, the state machine transitions and UI feedback must accurately reflect what is happening so DMs can trust the tool. Subtle render bugs (stale state labels, suggestions replacing themselves, no "thinking" indicator) erode trust even when the AI is working correctly.

**Delivers:** MainPanel shows accurate live session state throughout a 4-hour session; suggestions do not silently replace themselves; DM sees "Analyzing..." feedback immediately; scene changes mid-session are detected and update chapter context; state machine rejects invalid transitions

**Features addressed:** Non-intrusive UI (P1 table stakes), scene/chapter awareness (P1), streaming response display (P1)

**Architecture:** Wire `Hooks.on('updateScene', ...)` to ChapterTracker; add `_transitionTo(newState)` validation; MainPanel dynamic orchestrator resolution; AbortController for all _onRender event listeners (pattern already documented, verify all components comply)

**Pitfalls avoided:** Pitfall 8 (MainPanel stale reference, comprehensive fix), Pitfall 7 (journal context not updated on scene change)

**Testing signal:** Navigate between Foundry scenes during live mode — chapter context updates in next cycle; UI state label matches actual SessionOrchestrator state throughout a 30-minute simulated session

### Phase 4: RulesReference Live Mode Integration

**Rationale:** RulesReference already exists and is implemented but is not connected to the live cycle. It is an independent service that can be wired without touching the core cycle logic. This is the final P1 table-stakes feature needed for live mode to be genuinely complete.

**Delivers:** D&D 5e rules questions detected in transcript trigger automatic (fire-and-forget) rules lookups; answers appear in MainPanel alongside suggestions; citations from SRD compendium are visible; on-demand text query input in MainPanel for manual questions

**Features addressed:** D&D 5e rules lookup with citations (P1), on-demand text query (P1)

**Architecture:** In `_runAIAnalysis`, check `analysis.rulesQuestions`; fire `RulesReference.answerQuestion()` as parallel async (do NOT block cycle); display in separate panel section; SRD citation format: "[Compendium: PHB p.XXX]"

**Anti-pattern to avoid:** Do NOT await rules reference inside the critical cycle path — it adds 2-5s latency; fire and forget, display when ready

**Testing signal:** Transcript segment containing "how does grapple work" produces a rules answer with SRD citation in the MainPanel LiveTab within 10 seconds; rules lookup failure does not affect suggestion generation

### Phase Ordering Rationale

- Phases 1-4 follow strict dependency order: context quality → cycle reliability → state accuracy → feature integration
- Phase 1 must come before Phase 2 because measuring cycle reliability requires correct context (otherwise you cannot tell if a bad suggestion is a context problem or a cycle problem)
- Phase 2 must come before Phase 3 because state machine correctness is only testable with stable cycles
- Phase 4 is independent of chronicle mode and can be developed in parallel with chronicle work after Phase 3
- Advanced differentiators (off-track detection, NPC personality surfacing, adventure anticipation) are Phase 5+ and should not be started until a real DM has validated Phase 1-4 in actual play

### Research Flags

Phases needing deeper research during planning:
- **Phase 1** (AI context quality): The exact `_initializeJournalContext` and `setAdventureContext` flow needs careful tracing — research identified the gap but implementation details require codebase-level investigation before writing the fix. Recommend a focused code exploration session before writing Phase 1 tasks.
- **Phase 2** (session reliability): AbortController threading through the live cycle requires careful mapping of every await boundary in `_liveCycle()` and `_runAIAnalysis()`. The exact signal propagation path should be mapped in a pre-implementation exploration.

Phases with standard patterns (skip research-phase):
- **Phase 3** (state machine and UI): The ApplicationV2 AbortController pattern is already documented in CLAUDE.md and ARCHITECTURE.md. The updateScene hook wiring is a straightforward Foundry hook registration. Standard patterns throughout.
- **Phase 4** (RulesReference integration): RulesReference is already implemented. The integration is a fire-and-forget call addition. No new patterns needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are pre-existing and verified. Configuration recommendations (chunk sizes, max_tokens, history limits) sourced from official OpenAI docs + production Foundry module RPGX AI Librarian. json_object vs json_schema distinction verified against official structured outputs documentation. |
| Features | MEDIUM | Table stakes and anti-features have strong consensus across CALYPSO academic research, competitor feature sets, and practitioner experience. Feature priority ordering is an inference from research — specific DM feedback from actual VoxChronicle users would increase confidence. Competitor feature claims from product pages (not direct testing). |
| Architecture | HIGH | Based on direct codebase inspection of the actual source files (SessionOrchestrator.mjs 1359 lines, AIAssistant.mjs 1614 lines). All architectural gaps and fix approaches are grounded in the real code. External patterns (timeout cascade, graceful degradation) verified against multiple independent sources. |
| Pitfalls | HIGH | Pitfalls 1-5 and 7-10 are directly grounded in codebase analysis and `.planning/codebase/CONCERNS.md`. Pitfall 6 (cost overrun) is calculated from actual OpenAI pricing and the current cycle configuration. Not speculative — these are known issues in the existing code. |

**Overall confidence:** HIGH

### Gaps to Address

- **AudioRecorder.getLatestChunk() existence**: Architecture research flagged this method is called with `?.` in SessionOrchestrator but it is not confirmed to be implemented. Before Phase 2 work begins, verify whether this method exists in `scripts/audio/AudioRecorder.mjs`. If missing, implementing it is a Phase 2 prerequisite.
- **RAG vector store population state**: It is unknown whether the current development environment has an indexed vector store with adventure content. The silence around this in the codebase suggests it may never have been tested end-to-end. Phase 1 should include an explicit RAG indexing verification step before context quality tuning begins.
- **Real DM validation**: All feature priority decisions are based on external research, not actual user feedback from DMs using VoxChronicle. After Phase 1-2, a single real session test would provide much higher confidence in the P2 feature prioritization (scene type calibration, NPC personality surfacing, off-track detection ordering).
- **_liveTranscript accumulation in live mode vs chronicle mode**: Architecture research identified a risk that live mode might accumulate full audio (not just text) similar to chronicle mode. This needs verification in `AudioRecorder.mjs` before Phase 2, as it is a potential session-ending memory issue on 4-hour sessions.

---

## Sources

### Primary (HIGH confidence)
- `/home/aiacos/workspace/FoundryVTT/VoxChronicle/scripts/orchestration/SessionOrchestrator.mjs` — direct codebase inspection (1359 lines)
- `/home/aiacos/workspace/FoundryVTT/VoxChronicle/scripts/narrator/AIAssistant.mjs` — direct codebase inspection (1614 lines)
- `/home/aiacos/workspace/FoundryVTT/VoxChronicle/.planning/codebase/CONCERNS.md` — known bugs and gaps from prior audit
- OpenAI Latency Optimization Guide — `https://developers.openai.com/api/docs/guides/latency-optimization` — streaming, max_tokens, output reduction
- OpenAI File Search Cookbook — `https://developers.openai.com/cookbook/examples/file_search_responses` — max_num_results=5, chunk configuration
- OpenAI Vector Store API Reference — `https://developers.openai.com/api/reference/resources/vector_stores/` — default and configurable chunking
- OpenAI Structured Outputs Guide — `https://platform.openai.com/docs/guides/structured-outputs` — json_schema compatibility limitations
- Context Engineering (OpenAI Cookbook) — `https://cookbook.openai.com/examples/agents_sdk/session_memory` — sliding window + summarization
- Foundry VTT v13 JournalEntryPage API — `https://foundryvtt.com/api/v13/classes/foundry.documents.JournalEntryPage.html`
- CALYPSO: LLMs as Dungeon Masters' Assistants (AAAI AIIDE 2023) — `https://arxiv.org/abs/2308.07540` — academic research on DM assistant design
- GPT-4o Response Latency — OpenAI Official — `https://openai.com/index/hello-gpt-4o/`

### Secondary (MEDIUM confidence)
- RPGX AI Librarian (Foundry VTT production module) — 1200 char chunks for Foundry journal RAG
- Archivist AI DM Assistant — `https://www.myarchivist.ai/ai-dungeon-master` — competitor combining transcription + campaign memory
- LLM Chat History Summarization Guide 2025 — `https://mem0.ai/blog/llm-chat-history-summarization-guide-2025` — 8-10 turn summary update, last 5 verbatim
- GPT-4o-mini Performance — `https://artificialanalysis.ai/models/gpt-4o-mini` — 53 tok/s, 0.44s TTFT benchmarks
- Prompt Architecture for AI DM — `https://dev.to/austin_amento_860aebb9f55/prompt-architecture-for-a-reliable-ai-dungeon-master-d99` — state-as-source-of-truth, structured response sections
- AI System Design Patterns 2026 — `https://zenvanriel.nl/ai-engineer-blog/ai-system-design-patterns-2026/` — timeout cascade, graceful degradation
- RAG in Production: What Actually Breaks — `https://alwyns2508.medium.com/retrieval-augmented-generation-rag-in-production-what-actually-breaks-and-how-to-fix-it-5f76c94c0591`

### Tertiary (LOW confidence)
- Foundry Familiar (alpha competitor) — feature claims are self-described as "not ready for games"
- AI Dungeon Masters vs Human DMs — Alibaba Product Insights — immersion analysis from single commercial source

---
*Research completed: 2026-02-28*
*Ready for roadmap: yes*
