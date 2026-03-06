# Phase 6: State Machine and UI Accuracy - Research

**Researched:** 2026-03-06
**Domain:** OpenAI streaming, state machine synchronization, silence detection guards, UI card components
**Confidence:** HIGH

## Summary

Phase 6 addresses three interlocking problems: (1) AI suggestion responses are currently non-streaming, causing blank loading states while the full response completes; (2) the silence-to-suggestion pipeline has no guard against firing while a live cycle is already in flight; and (3) the MainPanel does not reflect orchestrator state changes in real-time with a visible status badge.

The codebase already has strong foundations: `SessionState` enum with `LIVE_LISTENING`/`LIVE_TRANSCRIBING`/`LIVE_ANALYZING` states, an `_updateState()` callback mechanism, `SilenceMonitor` wrapping `SilenceDetector` with an `_handleSilenceEvent` async handler, and existing suggestion card CSS (`.vox-chronicle-suggestion`). The main gaps are: OpenAIClient has no streaming support (all calls use `response.json()`), SilenceMonitor has no cycle-in-flight guard, and MainPanel renders suggestions as plain paragraphs without structured card layout.

**Primary recommendation:** Add a `postStream()` method to OpenAIClient that returns an async iterator over SSE chunks, wire it into `AIAssistant._makeChatRequest` with a streaming variant, add a `_isCycleInFlight` flag to SessionOrchestrator that SilenceMonitor checks before calling the suggestion function, and restructure suggestion rendering into typed card components with a status badge in the panel header.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Structured card format: colored type badge (pill), bolded title summarizing the suggestion, 2-3 bullet points with details
- Type badges as colored pill badges: narration (blue), dialogue (green), action (orange), reference (purple)
- All session suggestions kept in a scrollable list container -- DM can scroll back to see earlier suggestions
- Each card has a small dismiss (X) button -- no other interactive features
- Progressive reveal: card appears immediately with type badge + spinner "AI thinking..." placeholder
- Content fills in as tokens stream from OpenAI -- first tokens visible within 1 second of API response start
- During streaming: raw text displayed as it arrives. On stream complete: text is parsed and restructured into title + bullet points format
- Auto-scroll to newest suggestion when streaming starts, unless DM has manually scrolled up
- Subtle colored pill badge in panel header next to title: "VoxChronicle [LIVE]"
- Three states: IDLE (gray), LIVE (green), ANALYZING (amber with gentle pulse)
- Maps to SessionState: IDLE = IDLE, LIVE = LIVE_LISTENING, ANALYZING = LIVE_TRANSCRIBING or LIVE_ANALYZING
- Smooth 200ms color fade transitions between states; ANALYZING badge pulses gently
- Chapter context label updates on the next AI cycle after Foundry scene change -- no immediate update
- If a live cycle is in-flight when silence fires, the event is dropped entirely -- no queuing, no retry
- SilenceDetector timer keeps running during cycles; callback is suppressed (not called) while cycle is active
- Silence-triggered suggestions use the same structured card layout but include a small "auto" source badge
- Silence threshold configurable via existing ragSilenceThresholdMs Foundry setting (10s-120s range, default 30s)

### Claude's Discretion
- OpenAI streaming implementation details (SSE parsing, chunk assembly)
- Exact card CSS styling and spacing within the established design language
- How to parse AI response text into title + bullet structure on stream complete
- Auto-scroll detection mechanism (scroll position tracking)
- Pulse animation implementation for ANALYZING badge

### Deferred Ideas (OUT OF SCOPE)
None

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUG-02 | AI responses stream to the UI with first tokens visible in under 1 second | OpenAI SSE streaming via `stream: true`, new `postStream()` on OpenAIClient, progressive card reveal |
| SUG-03 | Silence detection triggers suggestions after 20-30s of DM silence (calibrated threshold) | Cycle-in-flight guard on SilenceMonitor, existing ragSilenceThresholdMs setting wiring verification |
| UI-02 | Suggestions display as glanceable, scannable content (not paragraph walls) in the floating panel | Structured card layout with type badge, title, bullet points; parse AI response on stream complete |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| OpenAI Chat Completions API | v1 | Streaming chat responses | Native `stream: true` parameter, SSE format, well-documented |
| Fetch API + ReadableStream | Browser native | SSE stream consumption | No external deps needed; TextDecoder + getReader() pattern |
| CSS Animations | Browser native | Status badge pulse | `@keyframes` for ANALYZING pulse, `transition` for color fades |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TextDecoder | Browser native | Decode SSE byte chunks to text | Always, for stream parsing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native SSE parsing | EventSource API | EventSource requires GET requests; OpenAI uses POST -- not compatible |
| Native SSE parsing | openai npm package | Adds 200KB+ dependency for one feature; overkill for module context |
| Manual DOM updates during streaming | Handlebars re-render | Re-rendering entire panel on each token would destroy scroll position and performance |

## Architecture Patterns

### Recommended Changes

```
scripts/
├── ai/
│   └── OpenAIClient.mjs           # Add postStream() method returning async iterator
├── narrator/
│   ├── AIAssistant.mjs            # Add _makeChatRequestStreaming() + onToken callback
│   └── SilenceMonitor.mjs         # Add isCycleInFlight setter/guard
├── orchestration/
│   └── SessionOrchestrator.mjs    # Set cycle-in-flight flag, wire streaming callbacks
├── ui/
│   └── MainPanel.mjs             # Status badge, streaming card DOM updates, auto-scroll
├── templates/
│   └── main-panel.hbs            # Status badge markup, restructured suggestion cards
└── styles/
    └── vox-chronicle.css          # Card type badges, pulse animation, status badge
```

### Pattern 1: OpenAI SSE Streaming via fetch + ReadableStream

**What:** OpenAI Chat Completions API with `stream: true` returns Server-Sent Events. Each event is `data: {json}\n\n` where the JSON contains `choices[0].delta.content` with partial tokens. The stream ends with `data: [DONE]`.

**When to use:** For suggestion generation where first-token latency matters.

**Example:**
```javascript
// Source: OpenAI API documentation
async *postStream(endpoint, data, options = {}) {
  const url = this._buildUrl(endpoint);
  const headers = this._buildJsonHeaders();

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...data, stream: true }),
    signal: options.signal
  });

  if (!response.ok) {
    throw new OpenAIError(`HTTP ${response.status}`, 'api_error', response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield { content, usage: json.usage || null };
        } catch (e) {
          // Skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

### Pattern 2: Cycle-in-Flight Guard

**What:** A simple boolean flag on SessionOrchestrator that SilenceMonitor checks before invoking suggestion generation.

**When to use:** To prevent duplicate/overlapping AI calls when silence fires during an active live cycle.

**Example:**
```javascript
// In SessionOrchestrator._liveCycle():
this._isCycleInFlight = true;
try {
  // ... existing cycle logic ...
} finally {
  this._isCycleInFlight = false;
}

// In SilenceMonitor._handleSilenceEvent():
async _handleSilenceEvent(silenceEvent) {
  if (this._isCycleInFlightFn?.()) {
    this._logger.debug('Silence event dropped: live cycle in flight');
    return; // Drop entirely, no queuing
  }
  // ... existing suggestion generation ...
}
```

### Pattern 3: Progressive Card Reveal with Direct DOM Manipulation

**What:** During streaming, bypass Handlebars and manipulate the DOM directly. Create card skeleton on stream start, append text on each token, then restructure into title + bullets on stream complete.

**When to use:** When re-rendering the full template per token is too expensive and would break scroll position.

**Example:**
```javascript
// Create card skeleton
_createStreamingCard(type) {
  const card = document.createElement('div');
  card.className = 'vox-chronicle-suggestion vox-chronicle-suggestion--streaming';
  card.innerHTML = `
    <span class="vox-chronicle-suggestion__type vox-chronicle-suggestion__type--${type}">${type}</span>
    <div class="vox-chronicle-suggestion__content">
      <span class="vox-chronicle-suggestion__spinner"><i class="fa-solid fa-spinner fa-spin"></i> AI thinking...</span>
    </div>
  `;
  return card;
}

// On each token
_appendToken(card, token) {
  const content = card.querySelector('.vox-chronicle-suggestion__content');
  const spinner = content.querySelector('.vox-chronicle-suggestion__spinner');
  if (spinner) spinner.remove();
  content.append(document.createTextNode(token));
}

// On stream complete — restructure into title + bullets
_finalizeCard(card, fullText) {
  const { title, bullets } = this._parseCardContent(fullText);
  const content = card.querySelector('.vox-chronicle-suggestion__content');
  content.innerHTML = `
    <strong class="vox-chronicle-suggestion__title">${escapeHtml(title)}</strong>
    <ul class="vox-chronicle-suggestion__bullets">
      ${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
    </ul>
  `;
  card.classList.remove('vox-chronicle-suggestion--streaming');
}
```

### Pattern 4: Auto-Scroll with Manual Override Detection

**What:** Track whether the user has manually scrolled away from the bottom. Only auto-scroll to new suggestions if the container is at (or near) the bottom.

**Example:**
```javascript
_isScrolledToBottom(container) {
  const threshold = 30; // px tolerance
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

// Before adding new card:
const shouldAutoScroll = this._isScrolledToBottom(suggestionsContainer);

// After adding card:
if (shouldAutoScroll) {
  card.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
```

### Anti-Patterns to Avoid
- **Full re-render on each token:** Calling `this.render()` per token destroys scroll position, flickers the UI, and is O(n) per token where n = full template size. Use direct DOM manipulation during streaming.
- **Queuing silence events:** The decision is to drop entirely, not queue. Queuing creates a backlog and double-fires when cycles are consistently slower than the silence threshold.
- **Separate streaming path in OpenAIClient._enqueueRequest:** Streaming should bypass the queue entirely since the request is long-lived. Use `useQueue: false`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Custom event emitter with reconnection | Simple line-by-line TextDecoder parser | OpenAI SSE is one-shot (no reconnection), simple `data:` prefix format |
| Debounced render during streaming | Timer-based batched DOM updates | Direct `textContent` append per chunk | Chunks arrive ~50-100ms apart; DOM append is fast enough without batching |
| Scroll position persistence | Complex scroll state manager | Simple `scrollHeight - scrollTop - clientHeight < threshold` check | Only one scrollable container, one direction; no need for ScrollObserver |

## Common Pitfalls

### Pitfall 1: SSE Buffer Splitting
**What goes wrong:** A single SSE event can be split across multiple `reader.read()` chunks, or multiple events can arrive in one chunk.
**Why it happens:** TCP framing is independent of SSE message boundaries.
**How to avoid:** Always buffer partial data and split on `\n`, keeping the last incomplete segment for the next iteration.
**Warning signs:** Occasional JSON parse errors on stream chunks.

### Pitfall 2: Streaming Bypasses Queue/Retry
**What goes wrong:** If streaming requests go through `_enqueueRequest`, the queue blocks behind the long-lived stream connection.
**Why it happens:** The sequential queue is designed for short-lived requests.
**How to avoid:** Use `useQueue: false, useRetry: false` for streaming requests. Streaming has its own implicit retry (the DM will see partial content and can wait for the next cycle).
**Warning signs:** Other API calls (transcription) stalling during suggestion streaming.

### Pitfall 3: Memory Leak from Orphaned Stream Readers
**What goes wrong:** If live mode is stopped while a stream is being read, the ReadableStream reader is never released.
**Why it happens:** AbortSignal isn't passed to the fetch, or reader.releaseLock() isn't called in finally.
**How to avoid:** Pass `this._shutdownController.signal` to the streaming fetch. Wrap reader loop in try/finally with `reader.releaseLock()`.
**Warning signs:** Browser DevTools showing open network connections after stopping live mode.

### Pitfall 4: Race Between Silence Timer and Cycle Start
**What goes wrong:** SilenceDetector fires at exactly the moment a new cycle starts. The guard check passes (cycle not yet in-flight), then both the silence suggestion and cycle suggestion run simultaneously.
**Why it happens:** The cycle-in-flight flag is set inside the async IIFE, not before `_scheduleLiveCycle` dispatches.
**How to avoid:** Set `_isCycleInFlight = true` synchronously at the very top of `_liveCycle()`, before any async work.
**Warning signs:** Two suggestions appearing simultaneously — one from silence, one from the regular cycle.

### Pitfall 5: _onRender Listener Accumulation During Streaming
**What goes wrong:** If `render()` is called while streaming is active (e.g., tab switch), the streaming DOM references become stale.
**Why it happens:** Handlebars re-renders replace the entire DOM subtree. Old card references point to detached nodes.
**How to avoid:** On `_onRender()`, check if streaming is active. If so, re-create the streaming card in the new DOM and continue appending to the new element. Store streaming state (accumulated text, type) separately from DOM references.
**Warning signs:** Tokens appearing in the console log but not in the UI after a tab switch.

### Pitfall 6: Title/Bullet Parsing on Freeform AI Output
**What goes wrong:** AI doesn't always output a clean "Title\n- bullet 1\n- bullet 2" format.
**Why it happens:** AI responses are nondeterministic; the prompt can request structure but the model may vary.
**How to avoid:** Use a forgiving parser: first line = title (or first sentence), remaining lines with `-`/`*`/`1.` prefixes = bullets. If no bullets found, split on sentence boundaries and take first 3.
**Warning signs:** Cards showing empty bullet lists or entire content as title.

## Code Examples

### OpenAI Chat Completions Streaming Response Format
```javascript
// Source: OpenAI API documentation
// Each SSE line looks like:
// data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
// ...
// data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}
// data: [DONE]

// IMPORTANT: usage is only included in the LAST chunk before [DONE]
// when stream_options: { include_usage: true } is set in the request
```

### Status Badge HTML Structure
```html
<!-- In panel header, next to title -->
<span class="vox-chronicle-status-badge vox-chronicle-status-badge--{{statusState}}">
  {{statusLabel}}
</span>
```

### Status Badge CSS
```css
.vox-chronicle-status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.65em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: background-color 200ms ease, color 200ms ease;
  vertical-align: middle;
  margin-left: 6px;
}

.vox-chronicle-status-badge--idle {
  background: rgba(128, 128, 128, 0.2);
  color: #888;
}

.vox-chronicle-status-badge--live {
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
}

.vox-chronicle-status-badge--analyzing {
  background: rgba(243, 156, 18, 0.2);
  color: #f39c12;
  animation: vox-chronicle-pulse 2s ease-in-out infinite;
}

@keyframes vox-chronicle-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Type Badge Colors
```css
.vox-chronicle-suggestion__type--narration { background: rgba(52, 152, 219, 0.15); color: #3498db; }
.vox-chronicle-suggestion__type--dialogue { background: rgba(46, 204, 113, 0.15); color: #2ecc71; }
.vox-chronicle-suggestion__type--action { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
.vox-chronicle-suggestion__type--reference { background: rgba(155, 89, 182, 0.15); color: #9b59b6; }
```

### AI Response to Card Parsing
```javascript
// Forgiving parser for AI freeform text -> title + bullets
_parseCardContent(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) return { title: 'Suggestion', bullets: [] };

  // First line (or first sentence of first line) is the title
  let title = lines[0].replace(/^[#*-]\s*/, ''); // Strip markdown prefixes
  const restLines = lines.slice(1);

  // Find bullet-like lines
  const bullets = restLines
    .filter(l => /^[-*\d.]\s/.test(l) || restLines.indexOf(l) < 3)
    .map(l => l.replace(/^[-*\d.]+\s*/, ''))
    .slice(0, 3);

  // If no bullets found, split the full text into sentences and take first 3 after title
  if (bullets.length === 0 && text.length > title.length + 10) {
    const sentences = text.replace(title, '').match(/[^.!?]+[.!?]+/g) || [];
    bullets.push(...sentences.slice(0, 3).map(s => s.trim()));
  }

  return { title, bullets };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `stream: false` (wait for full response) | `stream: true` with SSE chunking | Phase 6 (new) | First tokens in <1s vs 3-8s for full response |
| Plain paragraph suggestions | Structured type+title+bullets cards | Phase 6 (new) | Glanceable DM cards vs wall-of-text |
| No state badge in UI | Real-time IDLE/LIVE/ANALYZING badge | Phase 6 (new) | DM always knows system state |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom |
| Config file | vitest.config.js |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUG-02 | postStream yields tokens from SSE chunks | unit | `npx vitest run tests/ai/OpenAIClient.test.js -t "postStream" -x` | Partial (file exists, new tests needed) |
| SUG-02 | Streaming card shows first token within 1s of API start | unit | `npx vitest run tests/ui/MainPanel.test.js -t "streaming" -x` | Partial |
| SUG-03 | Silence event dropped when cycle in flight | unit | `npx vitest run tests/narrator/SilenceMonitor.test.js -t "cycle in flight" -x` | Partial |
| SUG-03 | Silence fires exactly once per silence event | unit | `npx vitest run tests/narrator/SilenceDetector.test.js -t "fires once" -x` | Partial |
| UI-02 | Suggestion card has type badge, title, bullets | unit | `npx vitest run tests/ui/MainPanel.test.js -t "suggestion card" -x` | Partial |
| UI-02 | Status badge reflects orchestrator state | unit | `npx vitest run tests/ui/MainPanel.test.js -t "status badge" -x` | Partial |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/ai/OpenAIClient.test.js` -- add `postStream` SSE parsing tests (mock ReadableStream)
- [ ] `tests/narrator/SilenceMonitor.test.js` -- add cycle-in-flight guard tests
- [ ] `tests/ui/MainPanel.test.js` -- add status badge, streaming card, card structure tests

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `scripts/ai/OpenAIClient.mjs` -- current request/response handling, no streaming support
- Codebase analysis: `scripts/narrator/SilenceMonitor.mjs` -- full source, no cycle guard exists
- Codebase analysis: `scripts/narrator/SilenceDetector.mjs` -- full source, timer + callback architecture
- Codebase analysis: `scripts/orchestration/SessionOrchestrator.mjs` -- `_liveCycle()`, `_updateState()`, `_currentCyclePromise`
- Codebase analysis: `scripts/ui/MainPanel.mjs` -- `_prepareContext()`, callback wiring, current suggestion rendering
- Codebase analysis: `templates/main-panel.hbs` -- current `{{#each suggestions}}` loop structure

### Secondary (MEDIUM confidence)
- OpenAI Chat Completions streaming documentation -- SSE format with `data:` prefix, `[DONE]` sentinel, `stream_options.include_usage`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- native browser APIs only, no external dependencies
- Architecture: HIGH -- clear integration points identified in existing code, all patterns follow established codebase conventions
- Pitfalls: HIGH -- based on direct code analysis of existing request handling, DOM lifecycle, and silence detection flow

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain -- OpenAI SSE format well-established)
