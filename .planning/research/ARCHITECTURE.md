# Architecture Research

**Domain:** Real-time AI DM assistant for Foundry VTT (live session mode)
**Researched:** 2026-02-28
**Confidence:** HIGH — based on direct codebase inspection plus verified external patterns

---

## Standard Architecture

### System Overview

The live mode pipeline has four distinct stages that must be coordinated:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CONTEXT INITIALIZATION                        │
│  JournalParser → ChapterTracker → AIAssistant.setAdventureContext() │
│                         (once, on startLiveMode)                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        LIVE AUDIO CYCLE (every 10s)                  │
│                                                                      │
│  AudioRecorder.getLatestChunk()                                      │
│       ↓                                                              │
│  TranscriptionService.transcribe(chunk)      ← async, may be slow   │
│       ↓                                                              │
│  SceneDetector.detectSceneTransition(text)   ← sync, regex pattern  │
│  SessionAnalytics.addSegment(segment)        ← sync, accumulation   │
│  AIAssistant.recordActivityForSilenceDetection()  ← resets timer    │
│       ↓                                                              │
│  AIAssistant.analyzeContext(contextWindow)   ← async, 2-5s latency  │
│       ↓                                                              │
│  callbacks.onAISuggestion → MainPanel render                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SILENCE PATH (parallel)                       │
│  SilenceMonitor (inside AIAssistant)                                 │
│       ↓ (30s timeout fires)                                          │
│  AIAssistant._generateAutonomousSuggestion()                         │
│       ↓                                                              │
│  callbacks.onAISuggestion → MainPanel render                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SCENE CHANGE (event-driven)                   │
│  Foundry canvasReady / updateScene hook                              │
│       ↓                                                              │
│  ChapterTracker.updateFromScene(scene)                               │
│       ↓                                                              │
│  AIAssistant.setChapterContext(chapterInfo)                          │
│       (applied on NEXT analyzeContext call — not immediate)          │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Boundary |
|-----------|----------------|----------|
| `JournalParser` | Parse Foundry journal HTML into plain text + chapter structure. Cache results with LRU eviction. | Does NOT call AI. Does NOT hold session state. Input: journal ID. Output: text + chapter nodes. |
| `ChapterTracker` | Track current adventure position. Map Foundry scenes → journal chapters. Provide content for AI prompts. | Depends on JournalParser. Does NOT call AI directly. Source of `chapterContext` for PromptBuilder. |
| `SceneDetector` | Detect scene type (combat/social/exploration/rest) and transitions from raw transcript text. | Pure function / regex. No AI calls. No network. Output: `{type, confidence, transition}`. |
| `PromptBuilder` | Construct message arrays for every OpenAI call. Owns all prompt templates. | Does NOT call AI. Accepts adventure context + chapter context + conversation history as inputs. Output: message arrays. |
| `AIAssistant` | Orchestrate a single analysis cycle: retrieve RAG context, call PromptBuilder, call OpenAI, return structured suggestions. Track conversation history (sliding window, 20 entries). | 1614-line god object today. Single entry point for AI calls in live mode. |
| `SilenceMonitor` | Timer-based autonomous trigger. Fires after configurable silence threshold (30s default). Calls `AIAssistant._generateAutonomousSuggestion()` when timer expires. | Lives inside AIAssistant. Depends on SilenceDetector activity recording. |
| `RulesReference` | D&D SRD rules Q&A. Wraps compendium lookup + AI explanation. Called on-demand (not in the main live cycle). | Separate from main suggestion pipeline. Can operate independently. |
| `SessionAnalytics` | Accumulate speaker participation data, timelines, segment counts. Session-scoped state. | Write-only during session (addSegment). Read at session end for summary. |
| `SessionOrchestrator` | Own the 10s timer cycle. Wire all services together. Manage session state machine. Pass callbacks to MainPanel. | 1359-line state machine today. Central coordinator. Should be the ONLY place that fires live cycle timers. |
| `RAGProvider` | Semantic search over indexed adventure documents. Returns relevant passage excerpts for AI context enrichment. | Network-dependent. Has consecutive failure tracking + fallback (skip RAG if 3 failures). |

---

## Context Pipeline Design

The most important design question is: **how does adventure journal content flow into AI prompts?**

The pipeline has two paths that must be understood separately.

### Path 1: Full-Text Context (Current Implementation)

```
JournalParser.parseJournal(journalId)
    → getFullText(journalId)           # All journal pages concatenated
    → AIAssistant.setAdventureContext()  # Stored in _adventureContext string
    → PromptBuilder._adventureContext    # Injected into every system prompt
```

This is loaded ONCE at `startLiveMode`. The full journal text is baked into `PromptBuilder`'s system prompt. For a typical published adventure (Lost Mine of Phandelver, etc.), this is 50-200KB of text. gpt-4o-mini's context window is 128K tokens, so a 100KB adventure fits in a single prompt.

**Strength:** Simple. No latency per query. Works without RAG indexing setup.
**Weakness:** Cannot fit multiple large books. Large system prompt increases cost per call. No semantic relevance — all chapters present even if only one is active.

### Path 2: RAG-Enhanced Context (Parallel Path)

```
User selects journals → JournalParser chunks text → RAGProvider.indexDocuments()
    ↓ (at query time, inside AIAssistant.analyzeContext)
RAGProvider.query(transcriptContext)
    → returns top-5 relevant passages
    → AIAssistant._cachedRAGContext
    → PromptBuilder.buildAnalysisMessages(transcription, ragContext)
```

RAG context is queried EVERY cycle (not cached across cycles). The `_consecutiveRAGFailures` counter skips RAG after 3 failures, falling back to full-text context.

**Strength:** Relevant passages for the current moment. Smaller prompt = faster + cheaper.
**Weakness:** Requires upfront indexing. Adds latency per cycle (100-500ms for vector search). Can fail silently.

### Recommended Pipeline Design

The two paths work in layers, not as alternatives:

```
Layer 1 (always present): Chapter-scoped content
    ChapterTracker.getCurrentChapterContentForAI()
    → max 5000 chars of the current chapter's text
    → set on every cycle if chapter changed

Layer 2 (when RAG available): Semantically relevant passages
    RAGProvider.query(last 500 chars of transcript)
    → top-3 most relevant passages from adventure
    → timeout: 2s max, skip if exceeded

Layer 3 (full text fallback): Truncated full adventure
    AIAssistant._adventureContext (truncated to 8000 chars)
    → used only if RAG unavailable AND chapter context unavailable
```

The key insight: **chapter context is already scoped and is cheaper than RAG for the common case** (DM is in one chapter for most of a session). RAG adds value for cross-chapter references and NPC detail retrieval.

---

## Service Coordination Patterns

### Pattern 1: Single-Threaded Live Cycle (Current — Keep It)

```javascript
// SessionOrchestrator._liveCycle()
async _liveCycle() {
  // 1. get audio chunk (async)
  // 2. transcribe (async, ~2-4s)
  // 3. sync services: SceneDetector, SessionAnalytics, SilenceMonitor reset
  // 4. AI analysis (async, ~1-3s)
  // 5. schedule next cycle (in finally block — guarantees reschedule)
}
```

**What:** Each cycle is fully sequential. The next cycle does not start until the previous AI analysis completes. Total cycle time = batch duration (10s) + transcription time + AI analysis time.

**Why it is correct:** No concurrent cycles competing for the same state. No race conditions between transcription and AI analysis. The `finally` block guarantees the cycle continues even after errors — this is the most important correctness property in the codebase.

**Build implication:** Do NOT change this to concurrent cycles. The sequential cycle is a load-bearing design decision.

### Pattern 2: Silence Path is Fully Independent

```javascript
// SilenceMonitor fires ONLY when no audio chunks arrive
// It does not coordinate with the live cycle timer
// Both can produce suggestions concurrently (rare but possible)
```

**What:** Two suggestion sources exist: the cycle-based analyzeContext() and the silence-triggered _generateAutonomousSuggestion(). They do not lock against each other.

**The gap (from CONCERNS.md):** If transcription takes 60s but silence timer fires at 30s, both paths produce suggestions simultaneously. The orchestrator's `onAISuggestion` callback fires from both; MainPanel receives both and renders both without deduplication.

**Fix approach:** SilenceMonitor should be suppressed while a live cycle is in-flight (between LIVE_TRANSCRIBING and return from _runAIAnalysis). Add an `_analysisInFlight` boolean flag to SessionOrchestrator; SilenceMonitor checks it before firing.

### Pattern 3: Chapter Context is Push, Not Pull

```javascript
// Current: orchestrator pushes chapter context on every cycle
_runAIAnalysis() {
  const currentChapter = this._chapterTracker?.getCurrentChapter?.();
  if (currentChapter && this._aiAssistant.setChapterContext) {
    this._aiAssistant.setChapterContext({ ... });  // ← pushes every 10s
  }
}
```

**What:** Chapter context is refreshed every cycle. This is correct for detecting scene changes — when the Foundry scene changes, ChapterTracker.updateFromScene() caches the new chapter, and it is picked up in the next cycle.

**Problem:** ChapterTracker.updateFromScene() is called in `_initializeJournalContext` (at session start) but NOT wired to Foundry's `updateScene` hook during live mode. Scene changes mid-session are NOT automatically detected.

**Fix approach:** In `main.mjs` or `VoxChronicle.mjs`, wire a `Hooks.on('updateScene', ...)` handler that calls `orchestrator._chapterTracker?.updateFromScene(scene)` when live mode is active.

### Pattern 4: RAG Failure Degradation (Existing — Good)

```javascript
// AIAssistant tracks consecutive RAG failures
if (this._consecutiveRAGFailures >= 3) {
  // Skip RAG, use full-text adventure context
}
```

**What:** After 3 consecutive RAG failures, the assistant stops querying RAG and falls back to the full adventure text. The counter does reset on success (verify this in tests — CONCERNS.md flags it as untested).

**Why it is correct:** RAG is an enrichment, not a requirement. The assistant should always produce a suggestion, just with less specific context. This is the right degradation model.

**Build implication:** The same pattern should be applied to transcription failures (not just AI failures). If transcription fails for 3 consecutive cycles, continue with silence detection active and notify user — do not stop the session entirely.

---

## Recommended Architecture: Stabilization Order

Based on the analysis, services should be stabilized in this order because each dependency must be reliable before the next layer can be trusted:

### Stage 1: Fix Journal → AI Context Pipeline

**Why first:** Every AI suggestion depends on this. If adventure content does not reach the AI prompt correctly, all suggestions are generic and useless regardless of other service quality.

**What to fix:**
1. Verify `JournalParser.parseJournal()` correctly handles both structured chapter adventures AND loose note journals. Add defensive tests for both.
2. Verify `_initializeJournalContext()` actually populates AIAssistant's `_adventureContext` with non-empty content. Add integration test (mock Foundry game.journal).
3. Wire `ChapterTracker.updateFromScene()` to Foundry's `updateScene` hook so mid-session scene changes are detected.
4. Verify `PromptBuilder` includes adventure context in the system prompt (check the actual message array structure under test).

**Data flow to validate:**
```
game.journal → JournalParser.parseJournal() → getFullText() → AIAssistant.setAdventureContext()
     ↓
canvas.scene → ChapterTracker.updateFromScene() → getCurrentChapter() → setChapterContext()
     ↓
analyzeContext(transcript) → buildAnalysisMessages() → [messages with adventure context]
```

### Stage 2: Fix Live Cycle Timing and Error Recovery

**Why second:** Even with correct context, the cycle must run reliably for 3-4 hours. The current implementation has one known gap: the `finally` block reschedules correctly, but audio chunker's `getLatestChunk()` is not defined on AudioRecorder in the main codebase (only checked with `?.`). If the method does not exist, every cycle silently produces nothing.

**What to fix:**
1. Confirm `AudioRecorder.getLatestChunk()` is implemented. If not, implement the 10s rolling capture method.
2. Add `_analysisInFlight` guard to prevent silence-triggered suggestions from racing with cycle-triggered ones.
3. Add explicit `_consecutiveLiveCycleErrors` handling: after 3 errors, notify user once (currently at exactly 3), but also gracefully reduce batch frequency (20s instead of 10s) to reduce pressure on API.
4. Add hard timeout on transcription calls (30s max) to prevent a slow chunk from blocking the cycle indefinitely.

### Stage 3: Fix Session State Machine

**Why third:** Once the cycle is reliable, the state machine transitions (LIVE_LISTENING → LIVE_TRANSCRIBING → LIVE_ANALYZING → LIVE_LISTENING) must be correct so the MainPanel renders the right UI state and the DM sees accurate feedback.

**What to fix:**
1. Add `_transitionTo(newState)` validation: reject invalid transitions (e.g., LIVE_ANALYZING → LIVE_ANALYZING without returning to LIVE_LISTENING first).
2. Fix MainPanel stale orchestrator reference: always call `VoxChronicle.getInstance().orchestrator` in MainPanel rather than caching at construction.
3. Ensure `_isStopping` flag is always released in finally blocks (check all paths through `stopLiveMode`).

### Stage 4: Wire RulesReference into the Suggestion Pipeline

**Why fourth:** RulesReference currently exists as a standalone service but is NOT called from `_liveCycle`. It is meant to answer D&D rules questions detected in the transcript.

**What to fix:**
1. In `_runAIAnalysis`, check `analysis.rulesQuestions` (the AIAssistant already detects them).
2. If rules questions found, call `RulesReference.answerQuestion()` async (fire-and-forget, do not block cycle).
3. Display rules answers in the MainPanel LiveTab alongside suggestions.

---

## Data Flow Direction

The data flow direction must be strictly one-way within each cycle to avoid state corruption:

```
SOURCES (read-only per cycle)
  game.journal (Foundry API)
  canvas.scene (Foundry API)
  AudioRecorder (hardware)

    ↓ parse/capture

PIPELINE (transform-only, no side effects)
  JournalParser → plain text + structure
  AudioChunk → Blob

    ↓ analyze

AI LAYER (async, may fail)
  TranscriptionService → segments[]
  SceneDetector → scene type (sync, pure)
  AIAssistant.analyzeContext() → suggestions[]

    ↓ accumulate

SESSION STATE (write)
  SessionOrchestrator._liveTranscript (append-only)
  SessionOrchestrator._lastAISuggestions (replace)
  SessionAnalytics (append-only)

    ↓ render

UI (read session state)
  MainPanel.render() → DM sees suggestions
```

**Rule:** Nothing in the UI layer writes to SessionOrchestrator state. Nothing in the AI layer reads from SessionAnalytics. JournalParser never touches OpenAI. These boundaries must remain clean.

---

## Architectural Patterns to Follow

### Pattern: Timeout Cascade

Every async operation in the live cycle needs a hard timeout. Without timeouts, a slow OpenAI response blocks the cycle indefinitely:

```javascript
// Wrap every async AI call with a timeout
async function withTimeout(promise, ms, fallback) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  try {
    return await Promise.race([promise, timeout]);
  } catch (error) {
    if (error.message.startsWith('Timeout')) return fallback;
    throw error;
  }
}

// In _liveCycle:
const result = await withTimeout(
  this._transcriptionService.transcribe(chunk),
  30000,  // 30s hard limit
  null    // fallback: skip this chunk
);
```

**Apply to:**
- `TranscriptionService.transcribe()`: 30s max
- `AIAssistant.analyzeContext()`: 8s max (for DM-facing latency)
- `RAGProvider.query()`: 2s max (enrichment, not required)

### Pattern: Structural Context Caching

Journal text should be parsed once per session, not per cycle:

```javascript
// JournalParser already does this — has LRU cache keyed by journalId
// Do NOT call parseJournal() inside _liveCycle
// Call it ONCE in _initializeJournalContext() and cache the result
```

The `_initializeJournalContext` method does this correctly today. The risk is that someone adds a "refresh journal" call inside the cycle loop. This would add 100-500ms per cycle for journal HTML parsing.

### Pattern: Chapter Context as Delta Update

Chapter context should only be pushed to PromptBuilder when it CHANGES, not every cycle:

```javascript
// Current (pushes every cycle — wasteful but harmless)
if (currentChapter) {
  this._aiAssistant.setChapterContext({ ... });
}

// Better: only push when chapter ID changes
if (currentChapter?.id !== this._lastPushedChapterId) {
  this._aiAssistant.setChapterContext({ ... });
  this._lastPushedChapterId = currentChapter.id;
}
```

This matters for token accounting: the chapter summary (up to 3000 chars) is included in every prompt. If it rarely changes, this is fine. If the system re-serializes it every 10s, it becomes unnecessary work.

### Pattern: Graceful Suggestion Fallback Chain

```
1. Full analysis (transcript + chapter context + RAG) → preferred
2. Chapter-only analysis (transcript + chapter context, no RAG) → when RAG fails
3. Generic analysis (transcript + abbreviated adventure context) → when chapter unknown
4. Offline fallback (hardcoded DM tips by scene type) → when AI unavailable
```

The current code has patterns 1-3 partially implemented but never falls to pattern 4. Pattern 4 requires a set of static per-scene-type suggestions that can be served instantly without any API call. This is the minimum viable degradation for total AI outage.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Concurrent Live Cycles

**What people do:** Start a second cycle before the first completes to improve throughput.

**Why it is wrong:** In VoxChronicle, the live cycle accumulates transcript segments into `_liveTranscript` (an append-only array). Two cycles running simultaneously would produce out-of-order segment timestamps. The offset calculation (line 1102 in SessionOrchestrator) assumes sequential access to the last segment's end time.

**Do this instead:** Keep the single sequential cycle. Reduce cycle latency by applying timeouts to each async operation.

### Anti-Pattern 2: Loading Journal Content Inside the Cycle

**What people do:** Call `JournalParser.parseJournal()` every cycle to get fresh content.

**Why it is wrong:** Parsing a 100KB journal is 50-200ms of synchronous HTML stripping and tree building. At 10s intervals, this is 0.5-2% overhead per cycle and adds jank to the Foundry UI thread.

**Do this instead:** Parse once at session start. If the DM edits the journal mid-session, provide a manual "Refresh Context" button rather than automatic re-parsing.

### Anti-Pattern 3: Blocking the Cycle on Non-Essential Services

**What people do:** `await RulesReference.answerQuestion()` inside `_runAIAnalysis`.

**Why it is wrong:** RulesReference answers take 2-5s. Adding them to the critical path doubles cycle analysis time.

**Do this instead:** Fire rules questions as independent parallel async operations. Store results in a separate `_lastRulesAnswer` field. Display when ready, not when cycle completes.

### Anti-Pattern 4: Storing Full Audio in Memory for the Entire Session

**What people do:** Accumulate all audio chunks in `_currentSession.audioBlob` during live mode.

**Why it is wrong:** A 4-hour session at 256kbps WebM = 450MB in browser memory. Foundry VTT will crash on most DM machines mid-session.

**Do this instead:** In live mode, do NOT accumulate audio for the whole session. Each 10s chunk is transcribed and discarded. Only the transcript text (very small) is accumulated. If the DM wants full audio recording for chronicle mode, that is a separate explicit choice.

---

## Integration Points

### Foundry VTT Integration

| Hook / API | Used By | Notes |
|------------|---------|-------|
| `Hooks.once('ready')` | `VoxChronicle.initialize()` | Services created here |
| `Hooks.on('updateScene')` | `ChapterTracker.updateFromScene()` | **Currently missing** — needs to be wired |
| `Hooks.on('canvasReady')` | `ChapterTracker.updateFromScene()` | Fires on scene load |
| `game.journal.get(id)` | `JournalParser.parseJournal()` | Foundry Collection API |
| `canvas.scene` | `_initializeJournalContext()` | May be null before canvas loads |

### OpenAI Integration

| Service | Model | Call Frequency | Timeout Target |
|---------|-------|---------------|----------------|
| `TranscriptionService` | gpt-4o-transcribe-diarize | Every 10s (live cycle) | 30s |
| `AIAssistant.analyzeContext()` | gpt-4o-mini | Every cycle that has audio | 8s |
| `AIAssistant._generateAutonomousSuggestion()` | gpt-4o-mini | On silence (30s threshold) | 8s |
| `RulesReference` | gpt-4o-mini | On-demand only | 10s |
| `OpenAIFileSearchProvider.query()` | file_search | Every cycle (if RAG enabled) | 2s |

### Internal Boundaries

| Boundary | Communication | Direction | Notes |
|----------|---------------|-----------|-------|
| SessionOrchestrator ↔ AIAssistant | Direct method call | Orchestrator calls AIAssistant | AIAssistant never calls Orchestrator |
| AIAssistant ↔ PromptBuilder | Direct method call (composition) | AIAssistant calls PromptBuilder | PromptBuilder is stateless per call |
| AIAssistant ↔ SilenceMonitor | Callback injection | SilenceMonitor calls back into AIAssistant | SilenceMonitor._generateSuggestionFn is set in constructor |
| SessionOrchestrator ↔ MainPanel | Callback (onStateChange, onAISuggestion) | Orchestrator pushes to MainPanel | MainPanel never calls Orchestrator directly |
| ChapterTracker ↔ JournalParser | Direct method call (dependency injection) | ChapterTracker calls JournalParser | JournalParser has no reference back |

---

## Build Order Implications

The stabilization phases above follow a strict dependency order:

```
Phase 1 (Context Pipeline)
  Must complete before: Phase 2 (cycle timing doesn't matter if context is broken)
  Risk: JournalParser may have silent bugs for non-standard journal structures
  Testing signal: AI suggestions mention content from the actual adventure

Phase 2 (Cycle Timing)
  Depends on: Phase 1 (pipeline must carry content)
  Must complete before: Phase 3 (state machine correctness only matters if cycles run)
  Risk: AudioRecorder.getLatestChunk() may not be implemented
  Testing signal: 2-hour unattended test session without crashes

Phase 3 (State Machine)
  Depends on: Phase 2 (must have stable cycles to test state transitions)
  Must complete before: Phase 4 (rules integration needs correct state transitions)
  Risk: MainPanel stale reference causes subtle render bugs that are hard to reproduce
  Testing signal: MainPanel shows correct state label throughout session

Phase 4 (RulesReference Integration)
  Depends on: Phase 3 (suggestion pipeline must be correct to add a new source)
  Independent of: Chronicle mode (can be done in parallel with chronicle work)
  Risk: Low — RulesReference is already implemented, just not wired to live cycle
  Testing signal: Rules question in transcript → answer appears in MainPanel
```

---

## Scaling Considerations

This module runs entirely on a single DM's browser. "Scaling" means surviving a 4-hour session, not handling many concurrent users.

| Concern | Current State | Risk Level | Fix |
|---------|--------------|-----------|-----|
| Memory growth from _liveTranscript | Unbounded append during live mode | Medium — 4 hours of text = ~2MB, acceptable | None needed for typical sessions |
| Context window growth for AI | 20-entry conversation history + chapter + RAG | Low — gpt-4o-mini has 128K tokens | PromptBuilder's MAX_CONTEXT_TOKENS=8000 is the guard |
| Audio memory | Live mode should NOT accumulate audio | High — NOT verified if live mode accumulates | Verify AudioRecorder behavior in live mode vs chronicle mode |
| Timer drift | `setTimeout` is not precise | Low — 10s batch, 2-3s drift acceptable | None needed |
| Foundry hook memory leaks | ApplicationV2 _onRender accumulates listeners | Medium — known, fix with AbortController | Fixed in v3.0 patterns, verify all UI components comply |

---

## Sources

- Direct codebase inspection: `scripts/orchestration/SessionOrchestrator.mjs` (1359 lines)
- Direct codebase inspection: `scripts/narrator/AIAssistant.mjs` (1614 lines)
- Direct codebase inspection: `scripts/narrator/ChapterTracker.mjs`, `JournalParser.mjs`, `PromptBuilder.mjs`, `SceneDetector.mjs`, `SilenceDetector.mjs`
- `.planning/codebase/ARCHITECTURE.md` — codebase analysis (2026-02-28)
- `.planning/codebase/CONCERNS.md` — known bugs and gaps (2026-02-28)
- [AI System Design Patterns 2026: Architecture That Scales](https://zenvanriel.nl/ai-engineer-blog/ai-system-design-patterns-2026/) — timeout cascade and graceful degradation patterns (MEDIUM confidence)
- [Context Window Management Strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) — sliding window and tiered context strategy (MEDIUM confidence)
- [LangGraph State Management and Memory for Advanced AI Agents](https://aankitroy.com/blog/langgraph-state-management-memory-guide) — session state separation pattern (MEDIUM confidence)
- [LLM Chat History Summarization Guide 2025](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) — conversation history management (MEDIUM confidence)

---

*Architecture research for: VoxChronicle real-time AI DM assistant, live mode stabilization*
*Researched: 2026-02-28*
