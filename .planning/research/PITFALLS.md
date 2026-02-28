# Pitfalls Research

**Domain:** Real-time AI DM assistant — Foundry VTT module, prototype-to-production stabilization
**Researched:** 2026-02-28
**Confidence:** HIGH (grounded in actual codebase analysis + verified patterns)

---

## Critical Pitfalls

### Pitfall 1: Generic AI Suggestions That Ignore the Adventure Journal

**What goes wrong:**
The AI produces usable but generic D&D suggestions ("Perhaps the players want to investigate further" or "The innkeeper could offer a quest") that feel like ChatGPT, not like a DM who has read the adventure. During an actual session, a DM glancing at VoxChronicle mid-conversation needs a suggestion that fits *this scene in this adventure*, not what any DM might say. Generic suggestions train the DM to ignore the panel. Ignored panels get disabled.

**Why it happens:**
`AIAssistant._initializeJournalContext()` loads adventure text at session start — but if it loads the *entire journal* as a flat string into `setAdventureContext()`, the LLM context is dominated by content far from the current scene. The model sees 50,000 characters of adventure content and produces suggestions averaged across all of it rather than focused on the active chapter. Additionally, `_adventureContext` is cached once at startup; if the DM moves to a different chapter mid-session, the context stays stale.

**How to avoid:**
- Feed the *current chapter/scene text* to the LLM, not the entire journal. `ChapterTracker` exists to do this — wire it so every `analyzeContext()` call includes the current chapter content as the primary grounding context.
- `RAGProvider` retrieves relevant passages — but only if it has been populated with adventure content. Verify the RAG vector store is actually indexed with the loaded journal before the session starts; a silent empty RAG returns no context and falls back to generic prompts.
- In the system prompt, explicitly name the NPCs, locations, and hooks from the *current chapter*. The LLM must know "You are in Chapter 3: The Haunted Mill. Key NPCs: Aldric the Miller (nervous, hiding something), Mara the Baker (helpful, knows the legend)" — not just receive raw text.

**Warning signs:**
- AI suggestions don't mention any NPC names from the loaded journal
- Suggestions are equally useful regardless of which scene the party is in
- `AIAssistant.getStatus().contextLength` is 0 or very large (entire journal dumped raw)
- RAG failure counter `_consecutiveRAGFailures` reaches 3 early in session (RAG returns no results)

**Phase to address:** Phase 1 — AI Context Quality (must be solved before any other live mode work)

---

### Pitfall 2: Latency Kills Mid-Session Usability

**What goes wrong:**
The DM asks an off-the-cuff NPC question and VoxChronicle takes 8-15 seconds to return a suggestion. By then, the moment has passed, the DM has improvised, and the suggestion is outdated. In playtest, DMs learn to not check the panel because it's always behind. The session has to be short (3-4 hours) and the AI must be fast enough to be useful during live conversation — not after it.

**Why it happens:**
Each live cycle calls: (1) transcribe audio via OpenAI API, (2) retrieve RAG context, (3) call GPT-4o-mini for analysis. Three sequential network round trips per 10-second batch. If transcription takes 3s + RAG takes 1s + LLM takes 3s = 7s of latency on top of the 10s batch window = suggestions that refer to what was said 17 seconds ago. Additionally, `_conversationHistory` with 20 entries (the max) adds substantial tokens to every request, increasing LLM processing time.

**How to avoid:**
- Parallelize where possible: RAG retrieval can start while transcription is still in flight if the query is based on recent transcript rather than the current transcription result.
- Reduce `_maxHistorySize` from 20 to 8-10 entries for live mode. 20 history entries = ~3,000-5,000 extra tokens per request. For a suggestion assistant (not a chatbot), recency matters more than depth.
- Use streaming (`stream: true`) on the GPT-4o-mini call so the DM sees the suggestion building rather than waiting for the full completion. Even 2s to first token feels fast; 7s to full response feels slow.
- Target: transcription-to-suggestion under 5 seconds. If a live cycle consistently exceeds this in testing, reduce batch duration or cut context size.

**Warning signs:**
- `analyzeContext()` timing logs (already instrumented with `performance.now()`) exceed 4 seconds
- `_liveBatchDuration` is 10,000ms but suggestions appear 12+ seconds after words are spoken
- DM stops looking at the panel after the first 30 minutes

**Phase to address:** Phase 1 — Live Mode Reliability (latency baseline must be measured before tuning)

---

### Pitfall 3: Context Window Rot Over a 4-Hour Session

**What goes wrong:**
GPT-4o-mini has a 128K context window, which sounds enormous, but the full adventure text (50,000+ chars), 20 conversation history entries (5,000+ tokens), the current transcript chunk, system prompt, and RAG context can accumulate to 40,000-60,000 tokens. At this scale, GPT-4 exhibits "lost in the middle" degradation — content at the start and end of context gets attention, but items in the middle get ignored. A 4-hour session with 10-second cycles = ~1,440 live cycles. History entries accumulate. Session transcript grows. By hour 3, suggestion quality degrades noticeably even if no errors appear.

**Why it happens:**
`_conversationHistory` is trimmed to 20 entries (last 20 messages). Each message can be hundreds of tokens. The adventure context is loaded once and not summarized. As the session progresses, the context grows in size rather than staying focused on the current moment.

**How to avoid:**
- Implement a rolling transcript window: only pass the last 3-5 minutes of transcript to the LLM, not the accumulating full session transcript. `_liveTranscript` already grows without bound.
- Summarize conversation history periodically: every 10 exchanges, collapse old history entries into a "session summary" string. This keeps the history token cost bounded.
- After hour 2, the current chapter context matters more than what happened in hour 1. Weight recent content heavier.
- Use GPT-4o-mini's max_tokens cap per request: set `max_tokens: 500` for suggestions (suggestions don't need to be long). This also controls response latency.

**Warning signs:**
- Token count logged per cycle grows from 8,000 at session start to 25,000+ after 90 minutes
- Suggestions start referring to things from the beginning of the session that are no longer relevant
- `_conversationHistory.length` stays pinned at 20 (max) — history is accumulating

**Phase to address:** Phase 1 — AI Context Quality (design the rolling window before the first full session test)

---

### Pitfall 4: State Machine Gets Stuck in Live Mode — Session Cannot Be Stopped

**What goes wrong:**
The DM tries to stop the session (or Foundry crashes) and `SessionOrchestrator` is in `LIVE_TRANSCRIBING` or `LIVE_ANALYZING` state. The stop call checks `_isStopping` flag, but if the current live cycle is mid-await (waiting on OpenAI API), the flag gets set but the running cycle continues. On completion, the cycle calls `_scheduleLiveCycle()` again, restarting the timer. The session cannot be stopped without page reload. After a page reload, all session state is lost.

**Why it happens:**
`_liveCycleTimer` is a `setTimeout`, not an `AbortController`. The live cycle (`_liveCycle`) contains multiple `await` calls (transcription, AI analysis). When `stopLiveMode()` is called, it sets `_isStopping = true` and clears the timer — but the currently-running async cycle is not interrupted. The cycle checks `if (!this._liveMode) return` only at the top of its loop, not at each await boundary.

**How to avoid:**
- Pass an `AbortController.signal` into each awaitable operation within the live cycle. Check `signal.aborted` at every await boundary. When `stopLiveMode()` is called, call `abortController.abort()`.
- Add a cycle-completion gate: `_scheduleLiveCycle()` should only schedule if `this._liveMode && !this._isStopping`.
- Comprehensive test: call `stopLiveMode()` while the cycle is mid-await. Verify no further cycles fire.

**Warning signs:**
- `_liveCycleTimer` is non-null after `stopLiveMode()` returns
- State machine is in `LIVE_ANALYZING` more than 30 seconds after stop was requested
- Console shows live cycle debug logs after user clicked "Stop"

**Phase to address:** Phase 2 — Session Reliability (this is a session-ending bug; must be fixed for 4-hour sessions)

---

### Pitfall 5: Silent RAG Degradation — Suggestions Lose Context, Nobody Notices

**What goes wrong:**
RAG fails (network error, OpenAI vector store quota, timeout) after 3 consecutive failures. `_consecutiveRAGFailures` reaches 3, a notification fires once, and then RAG is silently disabled for the rest of the session. The LLM continues generating suggestions, but they are no longer grounded in the adventure content — they are pure model output based only on the conversation history. The quality degrades, but no error is shown after the first notification. The DM assumes the AI is working normally.

**Why it happens:**
The failure counter correctly silences the warning to avoid spam, but there is no mechanism to re-enable RAG after a transient failure, no visual indicator of RAG status, and no way for the DM to know why suggestions became generic. The test coverage gap for "RAG succeeds after failures" (documented in CONCERNS.md) means this recovery path is unverified.

**How to avoid:**
- Show persistent RAG status in the UI panel: green dot (RAG active), yellow dot (RAG degraded), red dot (RAG disabled). Update this on every cycle.
- Implement exponential backoff re-enable: after 3 failures, wait 60 seconds then try one RAG request. If it succeeds, reset the counter. If it fails, wait 120 seconds, etc.
- Test specifically: RAG fails for 3 cycles, then succeeds — verify counter resets and green status returns.
- Verify that `_cachedRAGContext` is cleared when the counter resets, so stale context from before the failure is not used indefinitely.

**Warning signs:**
- The single RAG failure notification appeared early in session, then never again
- `_consecutiveRAGFailures >= 3` in the AIAssistant state dump
- Suggestions stop mentioning anything from the adventure journal

**Phase to address:** Phase 1 — AI Context Quality

---

### Pitfall 6: Cost Overrun from Chatty AI Cycles

**What goes wrong:**
A 4-hour session with a 10-second live cycle = 1,440 cycles. If each cycle calls GPT-4o-mini with 8,000 tokens of context and generates 500 tokens, that is 1,440 x 8,500 = 12.2M tokens. At $0.15/M input + $0.60/M output, that is $1.83 input + $0.43 output = $2.26 per session — already at the upper limit of the $1-3 target. If context grows (see Pitfall 3), or if off-track detection and rules Q&A fire additional calls, cost can easily reach $5-10 per session.

**Why it happens:**
The system makes at least one LLM call per live cycle regardless of whether anything interesting happened. If a cycle's audio chunk contains silence, background noise, or identical repeated content, the system still spends tokens analyzing it. Multiple features (off-track detection, rules Q&A, narration suggestion) may each trigger separate API calls within a single cycle.

**How to avoid:**
- Skip LLM analysis for cycles where the transcription returns less than 20 words or is identical to the previous cycle. Audio silence should not trigger AI calls.
- Consolidate: `analyzeContext()` already handles suggestions + off-track detection + rules Q&A in one call. Ensure this consolidation actually happens and no feature triggers a separate call.
- Make cycle interval configurable (10s default is aggressive; 20-30s for quieter sessions would cut calls by 50-66%).
- Add a cost meter to the UI: track estimated tokens used and display "~$0.45 spent this session" so the DM has visibility.
- Implement conversation history deduplication: if the last 3 history entries contain the same content (player re-reading the same NPC dialogue), deduplicate before sending.

**Warning signs:**
- Cycle log shows LLM calls even when no speech was detected
- Token count per cycle is growing (not staying bounded around a baseline)
- `_conversationHistory` contains duplicate or near-duplicate entries

**Phase to address:** Phase 2 — Session Reliability

---

### Pitfall 7: Journal Context Not Loaded When Live Mode Starts

**What goes wrong:**
`startLiveMode()` calls `_initializeJournalContext()` which tries to load the journal from the active Foundry scene. If the scene has no linked journal (extremely common — many DMs don't link journals to scenes), it falls back to "first world journal." The first world journal may be a player handout, a random notes journal, or anything other than the adventure. The AI gets grounded in the wrong content and produces suggestions for a completely different adventure. This will not throw an error — it will silently load the wrong journal.

**Why it happens:**
The fallback logic is `game.journal.size > 0` → use first journal. In a typical Foundry world, journals are: player notes, house rules, session summaries, campaign setting, adventure module. The adventure module journal is unlikely to be first alphabetically. The DM would need to correctly link their scene OR have the adventure be the first journal — neither can be assumed.

**How to avoid:**
- Before starting live mode, show the DM a "Which journal is this adventure?" picker. This is what `journal-picker.hbs` was designed for. Wire it so the DM explicitly confirms the journal before the session starts.
- If the auto-detected journal is NOT what was last used (track `lastUsedJournalId` in settings), warn: "Auto-detected journal: [name]. Is this correct?"
- Log which journal was loaded and surface it in the UI so the DM can see immediately: "Loaded: Lost Mine of Phandelver (347 pages)."
- If `fullText.length < 500`, the loaded journal is probably wrong. Warn and require DM confirmation before proceeding.

**Warning signs:**
- Log shows "Adventure context loaded: X chars" but X is very small (< 500) or very large (> 200,000, entire world dump)
- Suggestions reference content that doesn't match the current adventure
- `_adventureContext` starts with house rules, player notes, or unrelated content

**Phase to address:** Phase 1 — AI Context Quality (first thing to fix — without correct context, nothing else matters)

---

### Pitfall 8: MainPanel Singleton Staleness Causes Silent State Desync

**What goes wrong:**
The DM changes their OpenAI API key in settings. `VoxChronicle.reinitialize()` runs, creating a new orchestrator instance. `MainPanel` was constructed with a reference to the *old* orchestrator. State change callbacks from the new orchestrator are never wired to the panel. The UI shows IDLE state even though a new session was started. Buttons stop responding correctly. The DM thinks the module is broken.

**Why it happens:**
`MainPanel.getInstance()` caches `VoxChronicle.getInstance().orchestrator` at construction time. When `VoxChronicle.resetInstance()` is called, a new orchestrator is created, but MainPanel still holds the stale reference. This is documented in CONCERNS.md as a known bug — "partially fixed in v3.0.3" but the singleton reference pattern is still fragile.

**How to avoid:**
- In `MainPanel`, never cache the orchestrator. Always access it as `VoxChronicle.getInstance().orchestrator` dynamically.
- Add a `reinitialize(orchestrator)` method to `MainPanel` that re-wires all callbacks when the orchestrator changes.
- In `VoxChronicle.reinitialize()`, call `MainPanel.getInstance().reinitialize(this.orchestrator)` after creating the new orchestrator.
- Add a test: call `VoxChronicle.resetInstance()` then `VoxChronicle.getInstance().initialize()` — verify MainPanel button clicks reach the new orchestrator.

**Warning signs:**
- UI state doesn't update after settings change + module reinitialization
- `MainPanel._orchestrator` is the same object reference before and after reinitialize
- State callbacks (onStateChange, onProgress) no longer fire to the UI

**Phase to address:** Phase 2 — Session Reliability

---

### Pitfall 9: Silence Detection Fires While Transcription Is In-Flight

**What goes wrong:**
The 10-second live cycle is running. Transcription for the previous chunk is still awaited (slow network, long audio). Meanwhile, `SilenceDetector`'s 30-second timer fires, triggering `_generateAutonomousSuggestion()`. Two parallel AI calls are now in flight. Whichever finishes first updates `_lastAISuggestions` and renders to the UI. If the silence suggestion finishes first, the transcription cycle suggestion overwrites it 2 seconds later. If they both complete simultaneously, the result is undefined behavior in the state machine. This is documented in CONCERNS.md as an untested gap.

**Why it happens:**
`SilenceDetector` operates on a wall-clock timer independent of the live cycle's async state. There is no mutex or guard preventing autonomous suggestions from firing while a cycle is in progress.

**How to avoid:**
- Add a `_isAnalyzing` flag: set to `true` at the start of each LLM call, `false` on completion. `SilenceMonitor` checks this flag before triggering an autonomous suggestion.
- Or: Use a promise queue (`_enqueueRequest` pattern already exists in `OpenAIClient`). Run all AI analysis calls through the same queue so they are inherently sequential.
- Test: trigger silence detection while transcription is in mid-await. Verify one or the other fires (not both), and the state machine ends in `LIVE_LISTENING` (not stuck).

**Warning signs:**
- Two "analyzeContext() entry" log lines in quick succession (within 1-2 seconds of each other)
- State machine shows `LIVE_ANALYZING` then immediately `LIVE_ANALYZING` again without going through `LIVE_LISTENING`
- UI flickers between two different suggestions

**Phase to address:** Phase 2 — Session Reliability

---

### Pitfall 10: Foundry Hook Accumulation on Module Reload/Reinitialize

**What goes wrong:**
During development or after settings changes, VoxChronicle's `Hooks.on()` listeners accumulate. If `VoxChronicle.reinitialize()` is called (e.g., after API key change), and hooks are re-registered without clearing the old ones, Foundry fires the same callback twice (or more) per event. Scene change triggers two `ChapterTracker.updateFromScene()` calls. Both try to update `_currentChapter`, causing race conditions. In a 4-hour session where the DM changes settings twice, this can lead to quadruple callbacks.

**Why it happens:**
Foundry's `Hooks.on()` does not check for duplicate registrations. Every call to `initialize()` that registers `Hooks.on('canvasReady', ...)` adds a new listener. The module does not call `Hooks.off()` on reinitialize. The `CLAUDE.md` documents `Hooks.once()` for init/ready (safe), but service-level hooks registered with `Hooks.on()` accumulate.

**How to avoid:**
- Store hook IDs returned by `Hooks.on()` and call `Hooks.off(hookId)` on reinitialize/teardown.
- Prefer `Hooks.once()` for events that should only fire one time (like initial journal loading).
- Add a teardown method to all narrator services (ChapterTracker, SceneDetector) that calls `Hooks.off()` for all registered hooks.
- Test: call `initialize()` twice without calling `resetInstance()`. Verify each hook fires exactly once, not twice.

**Warning signs:**
- Scene change causes two `ChapterTracker` log entries instead of one
- `updateFromScene()` is called twice in the same millisecond
- Log shows "Chapter updated" with two different values almost simultaneously

**Phase to address:** Phase 2 — Session Reliability

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Load entire journal as adventure context | Simple — one `fullText` call | Generic suggestions; context rot; expensive | Never for live mode; OK for chronicle extraction |
| 20-entry conversation history max | Covers full-session context | Token bloat; quality degradation after hour 2 | Reduce to 8-10 for live mode |
| 10-second live cycle always fires | Simple timer | Calls LLM on silence/noise; costs $$ | Add content threshold check before LLM call |
| Cache orchestrator in MainPanel | Avoids repeated `getInstance()` | Stale reference after reinitialize | Never — always resolve dynamically |
| Single notification for RAG failure | Avoids spam | DM has no visibility into degraded mode | Add persistent status indicator instead |
| God object AIAssistant (1614 lines) | Everything in one place | Hard to test; changes are error-prone | Acceptable for this milestone; refactor in v4 |
| Plain object for `_currentSession` | Fast to implement | No type safety; easy to have missing fields | Acceptable now; needs Session class eventually |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenAI chat (GPT-4o-mini) | Not setting `max_tokens` — response length is unbounded | Set `max_tokens: 400-600` for suggestions; shorter responses = lower latency + cost |
| OpenAI transcription | Sending empty or near-empty audio chunks | Check blob size > 1KB before sending; empty audio returns empty transcript, wasting API call |
| OpenAI File Search (RAG) | Assuming vector store is populated — it may be empty if journal indexing never ran | Always verify store has documents before relying on RAG; show indexing status in UI |
| Kanka API | Batch creating entities during live mode | Never call Kanka during live mode — save for chronicle mode only; live mode has enough latency risk |
| Foundry `game.journal` | Accessing before `ready` hook | Always check `game.journals` is populated; `_initializeJournalContext` runs after ready, but check guard |
| Foundry `canvas.scene` | `canvas` is null between scenes | `canvas?.scene` pattern is correct; must be used everywhere, including `ChapterTracker` hooks |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Growing `_liveTranscript` array | Memory use grows 1KB/minute; at 4 hours = ~240KB in memory, manageable but retrieval slows | Trim `_liveTranscript` to last 30 minutes only | At 8+ hour sessions (marathon campaigns) |
| Full journal passed to LLM as context | Token count per cycle exceeds 30K; slow LLM response | Send current chapter only; use RAG for history | Journal > 20,000 words (most published adventures) |
| Synchronous `AudioChunker._combineBlobs()` | UI freeze for 100-500ms at session end for 4+ hour recordings | Use Web Worker for >50MB blob operations | 4+ hour sessions at 256kbps = ~450MB |
| `RelationshipGraph` O(n*m) entity filter | Graph renders slowly with >100 entities | Single-pass reduce (documented in CONCERNS.md) | >100 entities (large campaigns) |
| `EntityPreview` 150ms debounce on errors | Missed error indicators during rapid entity creation | Render immediately on error, debounce only visual updates | Batch creation of 50+ entities |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Kanka API error message used in exceptions unsanitized | MITM attack injects `<script>` into Foundry notification | `escapeHtml(response.message)` before use in KankaError (documented in CONCERNS.md) |
| API key logged during debug mode | Key appears in browser console; screenshot sharing during session exposes key | `SensitiveDataFilter` is implemented — verify it covers all log paths including new ones added |
| Journal content in LLM prompts contains player-facing spoilers | LLM has full future chapter content; if prompt is logged, spoilers visible | This is unavoidable for the use case — document clearly in CLAUDE.md; don't log full system prompts |
| Reinitialization silent failure | Users think new API key is applied; module continues using old key failing silently | ErrorNotificationHelper.notify() on reinitialize failure (documented in CONCERNS.md) |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| AI suggestion appears after the moment has passed | DM has already improvised; suggestion is irrelevant | Optimize for time-to-first-token using streaming; target < 5s from speech to visible suggestion |
| No indicator that AI is thinking | DM clicks "Get Suggestion" and sees nothing for 8 seconds — assumes it's broken | Show "Analyzing..." spinner immediately on request; update to result when ready |
| Suggestion overwrites itself with a worse suggestion | DM sees a good suggestion, reads it, then 2 seconds later a new (worse) suggestion replaces it | Don't auto-replace suggestions; show "New suggestion available" and let DM choose to advance |
| Module starts with wrong journal loaded | AI suggestions reference completely different adventure | Require explicit journal confirmation before live mode; never silently fallback to wrong journal |
| RAG degraded but no indication | DM assumes AI is working; doesn't understand why suggestions got worse | Persistent RAG health indicator in UI header (green/yellow/red dot) |
| "Stop" doesn't stop immediately | DM clicks Stop during a scene transition; AI keeps firing for 15 more seconds | Abort in-flight requests when stop is requested; UI should show "Stopping..." until complete |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Live mode starts**: Does AI get the *current chapter* text, or the entire journal? Verify `_adventureContext` is chapter-scoped, not full-journal-dump.
- [ ] **RAG configured**: Does the vector store actually have documents indexed? Check `ragProvider.listDocuments()` before first session starts.
- [ ] **Session stops cleanly**: Start live mode, wait 15 seconds (mid-cycle), click Stop. Verify no further live cycles fire. Verify state returns to IDLE.
- [ ] **Reinitialize is safe**: Change API key in settings. Verify MainPanel still responds to new session start. Verify old orchestrator callbacks are not firing.
- [ ] **Cost is bounded**: Run a 30-minute test session and measure actual OpenAI API token usage. Extrapolate to 4 hours. Verify it stays under $3.
- [ ] **Hook cleanup**: Call `VoxChronicle.resetInstance()` then re-initialize. Trigger a scene change. Verify each hook fires exactly once per event.
- [ ] **Journal picker works**: Start live mode with no active scene / no linked journal. Verify DM is prompted to select a journal, not silently loaded with the wrong one.
- [ ] **Silence detection doesn't double-fire**: Trigger silence detection while transcription is in-flight. Verify one result, not two, reaches the UI.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Generic suggestions (wrong journal) | LOW | Stop live mode → use journal picker to select correct adventure → restart live mode |
| Latency exceeds 10 seconds | MEDIUM | Increase `_liveBatchDuration` to 20s (fewer cycles); reduce `_maxHistorySize` to 5; disable RAG temporarily |
| State machine stuck / can't stop | HIGH | Page reload loses all session state; consider IndexedDB session checkpoint for partial recovery |
| Cost overrun (>$5 session) | LOW | Pause silence detection; increase cycle interval; re-enable after adjusting settings |
| RAG permanently degraded | LOW | RAG auto-re-enables after timeout; DM can also disable RAG in settings and rely on direct context |
| Hook accumulation (double callbacks) | HIGH | Module disable → re-enable (forces clean reinitialize); page reload as last resort |
| MainPanel stale reference | MEDIUM | Page reload; or `VoxChronicle.resetInstance()` + `MainPanel.resetInstance()` in dev console |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Generic suggestions (Pitfall 1) | Phase 1 — AI Context Quality | Run session with actual adventure; every suggestion must name a journal NPC or location |
| High latency (Pitfall 2) | Phase 1 — AI Context Quality | Measure time-to-suggestion in live test; must be <5s P90 |
| Context window rot (Pitfall 3) | Phase 1 — AI Context Quality | Token count per cycle must stay bounded (< 12K tokens) over 2-hour simulated session |
| State machine stuck on stop (Pitfall 4) | Phase 2 — Session Reliability | Stop-while-in-flight test must pass; state must reach IDLE within 5 seconds of stop request |
| Silent RAG degradation (Pitfall 5) | Phase 1 — AI Context Quality | Simulate 3 RAG failures; verify re-enable behavior and UI indicator |
| Cost overrun (Pitfall 6) | Phase 2 — Session Reliability | Token usage meter; 30-minute test session measured and extrapolated |
| Wrong journal loaded (Pitfall 7) | Phase 1 — AI Context Quality | First fix before all other AI quality work; journal picker required before live mode |
| MainPanel stale reference (Pitfall 8) | Phase 2 — Session Reliability | Reinitialize test: verify UI callbacks work after settings change |
| Silence detection concurrent (Pitfall 9) | Phase 2 — Session Reliability | Concurrent fire test: silence timer + in-flight transcription = exactly one result |
| Hook accumulation (Pitfall 10) | Phase 2 — Session Reliability | Double-initialize test: each hook fires exactly once per event |

---

## Sources

- Codebase analysis: `/home/aiacos/workspace/FoundryVTT/VoxChronicle/scripts/narrator/AIAssistant.mjs` (lines 100-200, 1600-1612)
- Codebase analysis: `/home/aiacos/workspace/FoundryVTT/VoxChronicle/scripts/orchestration/SessionOrchestrator.mjs` (lines 50-90, 780-1175)
- Documented tech debt: `.planning/codebase/CONCERNS.md` (RAG failure recovery, silence detection gaps, MainPanel staleness, hook patterns)
- OpenAI latency optimization: [platform.openai.com/docs/guides/latency-optimization](https://platform.openai.com/docs/guides/latency-optimization)
- Context rot research: [producttalk.org/context-rot](https://www.producttalk.org/context-rot/) — "the more input given to a large language model, the worse it tends to perform"
- LLM cost optimization (output tokens 3-10x input): [analyticsvidhya.com/blog/2025/12/llm-cost-optimization](https://www.analyticsvidhya.com/blog/2025/12/llm-cost-optimization/)
- RAG production pitfalls: [alwyns2508.medium.com — RAG in Production: What Actually Breaks](https://alwyns2508.medium.com/retrieval-augmented-generation-rag-in-production-what-actually-breaks-and-how-to-fix-it-5f76c94c0591) — "ingestion pipeline determines 80% of RAG quality"
- AI agent production failures: [getmaxim.ai — Top 6 Reasons AI Agents Fail in Production](https://www.getmaxim.ai/articles/top-6-reasons-why-ai-agents-fail-in-production-and-how-to-fix-them/)
- TTRPG AI hallucinations: [dev.to — I Built an AI-Powered TTRPG Adventure Generator](https://dev.to/michaelsolati/i-built-an-ai-powered-ttrpg-adventure-generator-because-generic-hallucinations-are-boring-362m) — "you may only realize something has gone horribly wrong when you suddenly deploy this thing at the table"
- AI agent state management: [nanonets.com — AI Agents State Management](https://nanonets.com/blog/ai-agents-state-management-guide-2026/)
- WebSocket session recovery: [developers.ringcentral.com — Recovering a WebSocket session](https://developers.ringcentral.com/guide/notifications/websockets/session-recovery)
- Foundry VTT hook documentation: [foundryvtt.wiki/en/development/guides/Hooks_Listening_Calling](https://foundryvtt.wiki/en/development/guides/Hooks_Listening_Calling)

---
*Pitfalls research for: VoxChronicle — real-time AI DM assistant prototype-to-production stabilization*
*Researched: 2026-02-28*
*Confidence: HIGH (codebase-grounded analysis)*
