# Phase 4: Session Reliability - Research

**Researched:** 2026-03-06
**Domain:** Live mode lifecycle, graceful shutdown, API failure degradation, cost monitoring, long-session stability
**Confidence:** HIGH

## Summary

Phase 4 hardens the live mode lifecycle so it can run reliably for 4+ hours and stop cleanly within 5 seconds. The work spans four interconnected areas: (1) graceful shutdown via AbortController threading through API calls, (2) independent health tracking for transcription and AI suggestion services with UI status indicators, (3) token/cost accumulation from OpenAI response `usage` objects displayed in a persistent footer, and (4) rolling-window memory management plus self-monitoring for cycle timing and heap size.

The existing codebase has solid foundations: `_isStopping` flag, `_liveCycleTimer` clearance, circuit breaker in TranscriptionService, and `_liveMode` guard checks at every async boundary in `_liveCycle()`. The primary gap is that `OpenAIClient._makeRequest()` creates its own internal `AbortController` for timeout but does NOT accept an external signal -- so there is no way for `stopLiveMode()` to cancel an in-flight API call. This is the single most critical change.

**Primary recommendation:** Thread an external `AbortSignal` through the API call chain so that `stopLiveMode()` can force-cancel in-flight requests, then layer cost tracking, status indicators, and rolling windows on top of the now-reliable lifecycle.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Stop waits for the current live cycle to finish (not immediate abort) -- captures the last transcription
- If the current cycle exceeds 5 seconds, force-abort via AbortController -- this is the hard deadline
- During shutdown window, show a spinner + "Stopping..." in place of the Stop button
- If force-abort triggers at 5s, button reverts to Start (IDLE state)
- After stop completes: brief summary notification ("Session ended: 47min, 23 suggestions, $0.12") that auto-dismisses
- No detailed summary view -- DM checks analytics tab if they want full stats
- Suggestions show "AI suggestions temporarily unavailable" placeholder when API is down -- no stale content
- Status indicator: small colored dot in panel header (green = healthy, yellow = degraded/slow, red = down)
- Matches the index health indicator pattern established in Phase 2
- Transcription and AI suggestions degrade independently -- separate status tracking for each
- Auto-recovery: on each live cycle, retry the API normally. If it works, go green. No manual "Retry" button needed
- Leverages existing circuit breaker in TranscriptionService (5 consecutive errors opens circuit)
- AIAssistant needs its own error tracking to surface suggestion-specific degradation
- Persistent footer bar at bottom of floating panel: "Tokens: 12.4K | Cost: $0.08"
- Updated each cycle, always visible during live mode
- Cost estimated from exact OpenAI API usage data (response headers with token counts) + model-specific pricing map
- Configurable per-session cost cap, default $5.00
- When cap is hit: soft warning -- "Cost cap reached ($5.00). AI suggestions paused. Transcription continues."
- DM can dismiss warning and re-enable suggestions, or keep transcribing without AI
- Cost cap is a Foundry setting (world-scoped, configurable in module settings)
- Rolling window for _liveTranscript: keep only the last 100 segments (or last 15K chars). Older segments are discarded
- NPC mention detection scans only the rolling window
- Errors in a cycle never stop the cycle timer -- the heartbeat always continues
- Failed services show degraded status (yellow/red) but cycles keep running
- Full teardown on stop: remove ALL Foundry hooks registered by the session, abort all controllers, clear all timers, reset all state
- startLiveMode() always starts from zero -- clean slate guarantee after stop
- Self-monitoring: track both cycle timing AND JS heap size (performance.memory, Chrome-only)
- Warn if average cycle duration exceeds 2x expected baseline
- Warn if memory exceeds a configurable threshold
- Non-Chrome browsers: timing monitoring only, skip memory (graceful feature detection)

### Claude's Discretion
- Exact AbortController wiring through the API call chain
- How the cycle timer interacts with the 5-second shutdown deadline
- Rolling window implementation details (segment count vs char count cap)
- Footer bar layout and styling within existing panel structure
- Self-monitoring warning thresholds and logging approach
- How hook registration is tracked for guaranteed cleanup

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-01 | Live mode survives a full 3-4 hour D&D session without crashes or state corruption | Rolling window for _liveTranscript, self-monitoring (cycle timing + heap), heartbeat-always-continues pattern, full teardown on stop |
| SESS-02 | Stop/restart live mode works cleanly using AbortController at all async boundaries | External AbortSignal threading through OpenAIClient._makeRequest, 5-second hard deadline with Promise.race, _isStopping + spinner UI |
| SESS-04 | When OpenAI API is unavailable or slow, live mode degrades gracefully with clear DM-facing status | Independent health status per service (transcription + AI), colored dot indicators, "unavailable" placeholder, auto-recovery on next cycle |
| SESS-05 | Token usage and API costs are monitored and bounded per session | Usage object extraction from API responses, pricing map, persistent footer, cost cap setting with soft-pause |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| AbortController | Browser native | Cancel in-flight fetch requests | W3C standard, supported in all modern browsers |
| performance.memory | Chrome-only API | JS heap size monitoring | Only reliable heap measurement in browsers; feature-detect and skip on Firefox/Safari |
| Promise.race | ES6 native | 5-second deadline enforcement | Race API call against timeout promise |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Foundry game.settings | v13 API | Cost cap setting, monitoring thresholds | World-scoped numeric settings with range |
| Foundry ui.notifications | v13 API | Summary notification on stop, cost cap warning | info/warn level, auto-dismiss |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom AbortController per-request | AbortController.any() | Not widely supported yet; stick with manual wiring |
| Separate health service class | Inline tracking in SessionOrchestrator | Service class is cleaner but overkill for two counters; inline is sufficient |

**Installation:**
No additional dependencies needed -- all implementations use browser-native APIs and existing project infrastructure.

## Architecture Patterns

### Recommended Changes Structure
```
scripts/
├── ai/
│   ├── OpenAIClient.mjs           # Add external signal support to _makeRequest
│   └── TranscriptionService.mjs   # Pass signal through to OpenAIClient
├── narrator/
│   └── AIAssistant.mjs            # Add error tracking + health status getter
├── orchestration/
│   ├── SessionOrchestrator.mjs    # Graceful shutdown, cost tracking, rolling window, self-monitoring
│   └── CostTracker.mjs            # NEW: Token accumulation + pricing map + cost cap logic
├── core/
│   └── Settings.mjs               # New settings: costCap, monitoringThresholds
├── ui/
│   └── MainPanel.mjs              # Footer bar, status dots, stopping spinner
├── templates/
│   └── main-panel.hbs             # Footer bar HTML, status dot elements
└── styles/
    └── vox-chronicle.css          # Footer bar, status dot, stopping overlay styles
```

### Pattern 1: External AbortSignal Threading
**What:** Pass an external AbortSignal through the API call chain so callers can cancel in-flight requests.
**When to use:** Any time a caller (SessionOrchestrator) needs to cancel an in-flight API call.
**Example:**
```javascript
// OpenAIClient._makeRequest gains optional signal parameter
async _makeRequest(endpoint, options = {}) {
  const controller = this._createTimeoutController(options.timeout);

  // Combine external signal (if provided) with timeout signal
  const signals = [controller.signal];
  if (options.signal) signals.push(options.signal);

  // Use AbortSignal.any() if available, otherwise manual listener
  let combinedSignal;
  if (typeof AbortSignal.any === 'function') {
    combinedSignal = AbortSignal.any(signals);
  } else {
    // Fallback: create a new controller that aborts if either signal fires
    const combined = new AbortController();
    for (const sig of signals) {
      if (sig.aborted) { combined.abort(sig.reason); break; }
      sig.addEventListener('abort', () => combined.abort(sig.reason), { once: true });
    }
    combinedSignal = combined.signal;
  }

  const fetchOptions = { method, headers, signal: combinedSignal };
  // ... rest of fetch logic
}
```

### Pattern 2: 5-Second Shutdown Deadline
**What:** `stopLiveMode()` waits for the current cycle to finish, but force-aborts after 5 seconds.
**When to use:** Every stop invocation.
**Example:**
```javascript
async stopLiveMode() {
  this._isStopping = true;
  this._liveMode = false; // Prevents new cycles from scheduling

  // Create abort controller for force-cancel
  this._shutdownController = new AbortController();

  // Clear cycle timer immediately
  clearTimeout(this._liveCycleTimer);
  this._liveCycleTimer = null;

  // Race: wait for current cycle OR 5-second deadline
  const deadline = new Promise(resolve => setTimeout(() => {
    this._shutdownController.abort();
    resolve('timeout');
  }, 5000));

  const currentCycle = this._currentCyclePromise || Promise.resolve();
  await Promise.race([currentCycle, deadline]);

  // Proceed with teardown regardless
  await this._fullTeardown();
  this._updateState(SessionState.IDLE);
  this._isStopping = false;
}
```

### Pattern 3: Independent Service Health Tracking
**What:** Each service (transcription, AI suggestions) tracks its own health state independently.
**When to use:** Every live cycle, to update UI status indicators.
**Example:**
```javascript
// Health states
const HealthStatus = { HEALTHY: 'healthy', DEGRADED: 'degraded', DOWN: 'down' };

// In SessionOrchestrator
_transcriptionHealth = HealthStatus.HEALTHY;
_aiSuggestionHealth = HealthStatus.HEALTHY;

// After successful transcription
this._transcriptionHealth = HealthStatus.HEALTHY;

// After transcription error
this._transcriptionConsecutiveErrors++;
if (this._transcriptionConsecutiveErrors >= 5) {
  this._transcriptionHealth = HealthStatus.DOWN;
} else if (this._transcriptionConsecutiveErrors >= 2) {
  this._transcriptionHealth = HealthStatus.DEGRADED;
}
```

### Pattern 4: Cost Tracking from Usage Objects
**What:** Extract token counts from OpenAI API response `usage` objects and accumulate cost.
**When to use:** After every API call in the live cycle.
**Example:**
```javascript
// OpenAI Chat Completions response includes:
// { usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 } }

// OpenAI Transcription response includes:
// { usage: { input_tokens: X, output_tokens: Y, total_tokens: Z } }

class CostTracker {
  static PRICING = {
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-transcribe': { perMinute: 0.006 },
    'gpt-4o-transcribe-diarize': { perMinute: 0.006 }
  };

  addUsage(model, usage) {
    // For chat models
    if (usage.prompt_tokens !== undefined) {
      const pricing = CostTracker.PRICING[model];
      this._totalInputTokens += usage.prompt_tokens;
      this._totalOutputTokens += usage.completion_tokens;
      this._totalCost += (usage.prompt_tokens * pricing.input) + (usage.completion_tokens * pricing.output);
    }
    // For transcription models (billed per minute, not tokens)
    // Track audio duration from chunk metadata instead
  }
}
```

### Pattern 5: Rolling Window for Transcript Segments
**What:** Cap `_liveTranscript` to prevent unbounded memory growth on long sessions.
**When to use:** After adding new segments in each live cycle.
**Example:**
```javascript
// After pushing new segments:
this._liveTranscript.push(...offsetSegments);

// Apply rolling window (keep last N segments)
const MAX_SEGMENTS = 100;
if (this._liveTranscript.length > MAX_SEGMENTS) {
  // Archive discarded segments count for final stats
  this._discardedSegmentCount += (this._liveTranscript.length - MAX_SEGMENTS);
  this._liveTranscript = this._liveTranscript.slice(-MAX_SEGMENTS);
}
```

### Anti-Patterns to Avoid
- **Aborting immediately without grace period:** The DM expects the last transcription to be captured; immediate abort loses data
- **Sharing a single AbortController for timeout AND cancellation:** Timeout abort fires on every slow request, not just during shutdown; use separate controllers
- **Storing full transcript text as concatenated string:** Duplicates data already in segments array; reconstruct on demand at stop
- **Polling for shutdown state in tight loop:** Use Promise.race with the deadline, not polling

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Combining AbortSignals | Manual event listener chaining | `AbortSignal.any()` with fallback | Edge cases with cleanup; use native when available |
| Token-to-cost conversion | Inline math in orchestrator | Dedicated CostTracker class | Pricing changes, multiple models, testability |
| Health status aggregation | Ad-hoc flag checks | Structured health enum + getter | Consistent UI rendering, testable state transitions |

**Key insight:** The TranscriptionService already has a circuit breaker with `_isCircuitOpen()`, `_consecutiveErrors`, and `resetCircuitBreaker()`. AIAssistant needs the same pattern -- don't invent a different error tracking mechanism.

## Common Pitfalls

### Pitfall 1: AbortController Memory Leak on Signal Listeners
**What goes wrong:** When using the fallback pattern (manual `addEventListener('abort')`), listeners are added to the external signal but never cleaned up if the request completes normally.
**Why it happens:** The `{ once: true }` option prevents double-fire but the listener still holds a reference until the signal is GC'd (which may be the lifetime of the shutdown controller).
**How to avoid:** Use `{ once: true }` AND explicitly `removeEventListener` in the `finally` block of `_makeRequest`.
**Warning signs:** Growing listener count on shutdown controller across many API calls.

### Pitfall 2: _liveCyclePromise Reference Staleness
**What goes wrong:** If `_currentCyclePromise` is set before the cycle starts but the cycle throws synchronously, the promise reference may point to an already-resolved promise, making the shutdown race ineffective.
**Why it happens:** The promise must be created AT the start of `_liveCycle()` and stored, not pre-created.
**How to avoid:** Wrap the entire `_liveCycle()` body in a promise that is stored on `this._currentCyclePromise` before any async work begins.
**Warning signs:** `stopLiveMode()` resolves instantly without waiting for the in-flight cycle.

### Pitfall 3: Transcription Cost Tracking Mismatch
**What goes wrong:** Transcription is billed per audio minute, not per token. But the transcription response MAY include a `usage` object with input/output tokens that does NOT correspond to the per-minute billing.
**Why it happens:** OpenAI's transcription API returns token counts for internal processing, but pricing is $0.006/minute of audio.
**How to avoid:** Track transcription cost from audio chunk duration (available from `AudioRecorder.duration` or chunk blob duration), not from response tokens. Use response tokens only for chat completion models.
**Warning signs:** Cost estimate wildly different from OpenAI dashboard.

### Pitfall 4: Rolling Window Breaks Final Transcript Assembly
**What goes wrong:** `stopLiveMode()` currently builds the final transcript from `this._liveTranscript`. If segments were discarded by the rolling window, the final transcript is incomplete.
**Why it happens:** The CONTEXT.md decision says "keep only the last 100 segments... older segments are discarded."
**How to avoid:** Two options: (1) keep a separate running text accumulator for the full session, or (2) accept that the live transcript during session is a window, and the full audio blob from `stopRecording()` can be transcribed post-session if a complete transcript is needed.
**Warning signs:** Final session transcript shorter than expected on long sessions.

### Pitfall 5: `stopRecording()` Hangs if Recorder is Already Stopped
**What goes wrong:** If the shutdown deadline fires and aborts in-flight operations, `AudioRecorder.stopRecording()` is called, but if `getLatestChunk()` rotation was mid-flight and left the recorder in a bad state, `stopRecording()` might hang waiting for `onstop`.
**Why it happens:** AudioRecorder has complex rotation state with `_pendingOldRecorder`.
**How to avoid:** Call `cancel()` instead of `stopRecording()` on force-abort paths. `cancel()` already handles all edge cases with `_abortPendingRotation()`. Only call `stopRecording()` when graceful completion succeeds.
**Warning signs:** Stop button stays in "Stopping..." state forever.

### Pitfall 6: Hook Cleanup Gaps
**What goes wrong:** If `startLiveMode()` registers a hook but `stopLiveMode()` throws before reaching the hook cleanup code, the hook persists across sessions.
**Why it happens:** The hook cleanup is in the `try` block of `stopLiveMode()`, not in `finally`.
**How to avoid:** Move ALL cleanup to a dedicated `_fullTeardown()` method called from `finally`. Track all registered hooks in a Set for guaranteed cleanup.
**Warning signs:** Duplicate hooks firing after stop/restart.

## Code Examples

### Current stopLiveMode() -- Needs Enhancement
```javascript
// Source: scripts/orchestration/SessionOrchestrator.mjs line 1208
// Current implementation: no AbortController, no deadline, no cost summary
async stopLiveMode() {
  this._isStopping = true;
  this._liveMode = false;
  clearTimeout(this._liveCycleTimer);
  // ... cleanup services ...
  const audioBlob = await this._audioRecorder.stopRecording(); // Can hang!
  this._updateState(SessionState.IDLE);
  this._isStopping = false;
}
```

### Current _liveCycle() Error Handling -- Needs Health Status
```javascript
// Source: scripts/orchestration/SessionOrchestrator.mjs line 1380
} catch (error) {
  this._consecutiveLiveCycleErrors++;
  // Currently only warns at 3 errors -- needs health status update
  if (this._consecutiveLiveCycleErrors === 3) {
    ui?.notifications?.warn(...);
  }
} finally {
  // Always reschedules -- this is correct and must be preserved
  if (this._liveMode) {
    this._scheduleLiveCycle();
  }
}
```

### OpenAI Chat Response Usage Object
```javascript
// Source: OpenAI API documentation
// Response from POST /chat/completions:
{
  "choices": [{ "message": { "content": "..." } }],
  "usage": {
    "prompt_tokens": 123,
    "completion_tokens": 45,
    "total_tokens": 168
  },
  "model": "gpt-4o-mini-2024-07-18"
}

// Response from POST /audio/transcriptions (gpt-4o-transcribe):
{
  "text": "...",
  "usage": {
    "input_tokens": 500,
    "output_tokens": 200,
    "total_tokens": 700
  }
}
```

### AudioRecorder.getLatestChunk() -- Confirmed Working
```javascript
// Source: scripts/audio/AudioRecorder.mjs line 193
// Exists and works correctly. Handles rotation with gapless capture.
// Returns Promise<Blob|null>. Returns null if not recording or rotation in progress.
async getLatestChunk() {
  if (this._state !== RecordingState.RECORDING) return null;
  if (this._isRotating) return null;
  this._isRotating = true;
  // ... rotation logic with old recorder stop + new recorder start
}
```

### Existing Circuit Breaker Pattern (TranscriptionService)
```javascript
// Source: scripts/ai/TranscriptionService.mjs lines 116-134, 709-737
// This pattern should be replicated in AIAssistant
_consecutiveErrors = 0;
_maxConsecutiveErrors = 5;
_circuitOpen = false;

_isCircuitOpen() { return this._circuitOpen; }
resetCircuitBreaker() { this._consecutiveErrors = 0; this._circuitOpen = false; }
getCircuitBreakerStatus() {
  return { isOpen: this._circuitOpen, consecutiveErrors: this._consecutiveErrors, maxErrors: this._maxConsecutiveErrors };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AbortController` per-request only | `AbortSignal.any()` for combining signals | Chrome 116+, Firefox 124+, Safari 17.4+ | Cleaner signal composition; use with fallback |
| `performance.memory` only | `performance.measureUserAgentSpecificMemory()` | Chrome 89+ | More accurate but async; `performance.memory` is sufficient for monitoring |

**Deprecated/outdated:**
- `performance.memory` is non-standard (Chrome-only) but still the simplest synchronous heap check. The newer `measureUserAgentSpecificMemory()` is async and requires COOP/COEP headers which Foundry VTT does not typically set. Use `performance.memory` with feature detection.

## Open Questions

1. **Full transcript on stop for long sessions**
   - What we know: Rolling window discards old segments. `stopLiveMode()` currently builds transcript from `_liveTranscript`.
   - What's unclear: Should we keep a separate running full-text accumulator (costs memory, ~100KB for 4h), or accept the window as the final transcript?
   - Recommendation: Keep a lightweight full-text accumulator (just text strings, not full segment objects). At ~25 words/minute for 4 hours = ~6000 words = ~36KB. This is negligible and preserves the full transcript.

2. **Transcription cost tracking precision**
   - What we know: Transcription is billed per audio minute ($0.006/min). The `usage` object in transcription responses contains token counts, not audio minutes.
   - What's unclear: Whether the audio chunk duration can be reliably determined from `AudioRecorder.duration` delta or from the blob metadata.
   - Recommendation: Track the time delta between `getLatestChunk()` calls (approximately `_liveBatchDuration`) and use that as the audio duration for cost estimation. This is close enough for a "utility meter" display.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest with jsdom |
| Config file | vitest.config.js or package.json |
| Quick run command | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | Live mode runs 30min simulated without crash/state corruption | integration | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | Partial (existing tests, needs long-session scenario) |
| SESS-02 | Stop during active API call reaches IDLE within 5s | unit | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | Needs new test |
| SESS-02 | AbortController cancels in-flight fetch | unit | `npm test -- --run tests/ai/OpenAIClient.test.js` | Needs new test |
| SESS-04 | API unavailable shows degraded status, no crash | unit | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | Needs new test |
| SESS-04 | Auto-recovery on next successful cycle | unit | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | Needs new test |
| SESS-05 | Token/cost accumulation from API responses | unit | `npm test -- --run tests/orchestration/CostTracker.test.js` | New file needed |
| SESS-05 | Cost cap pauses suggestions | unit | `npm test -- --run tests/orchestration/SessionOrchestrator.test.js` | Needs new test |

### Sampling Rate
- **Per task commit:** `npm test -- --run tests/orchestration/SessionOrchestrator.test.js tests/ai/OpenAIClient.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/orchestration/CostTracker.test.js` -- covers SESS-05 cost tracking
- [ ] New test cases in `tests/orchestration/SessionOrchestrator.test.js` for shutdown deadline, health status, rolling window
- [ ] New test cases in `tests/ai/OpenAIClient.test.js` for external signal cancellation

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `scripts/orchestration/SessionOrchestrator.mjs` -- full lifecycle code reviewed (stopLiveMode, _liveCycle, startLiveMode, _handleError, reset)
- Codebase analysis: `scripts/audio/AudioRecorder.mjs` -- getLatestChunk() confirmed at line 193, rotation mechanism verified
- Codebase analysis: `scripts/ai/OpenAIClient.mjs` -- _makeRequest signal handling, queue/retry, clearQueue()
- Codebase analysis: `scripts/ai/TranscriptionService.mjs` -- circuit breaker pattern (lines 116-134, 709-737)
- Codebase analysis: `scripts/narrator/AIAssistant.mjs` -- _makeChatRequest, getStats, no error tracking currently
- [OpenAI Chat API reference](https://platform.openai.com/docs/api-reference/chat/object) -- usage object structure
- [OpenAI Audio API reference](https://platform.openai.com/docs/api-reference/audio) -- transcription response format

### Secondary (MEDIUM confidence)
- [OpenAI Pricing](https://platform.openai.com/docs/pricing) -- gpt-4o-mini: $0.15/$0.60 per 1M tokens; gpt-4o-transcribe: $0.006/min
- [OpenAI Transcription API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create/) -- usage object with input_tokens/output_tokens/total_tokens

### Tertiary (LOW confidence)
- `AbortSignal.any()` browser support -- verified available in modern browsers but may need fallback for older Foundry VTT deployments

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all browser-native APIs, no new dependencies
- Architecture: HIGH -- patterns derived from existing codebase analysis with clear gaps identified
- Pitfalls: HIGH -- derived from actual code analysis of AudioRecorder rotation, hook registration, and API call chain
- Cost tracking: MEDIUM -- transcription billing model (per-minute vs per-token) needs validation against actual API responses

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (30 days -- stable domain, no fast-moving external dependencies)
