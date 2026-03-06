# Phase 5: Rolling Context Management - Research

**Researched:** 2026-03-06
**Domain:** Conversation history management, token budgeting, AI summarization
**Confidence:** HIGH

## Summary

Phase 5 implements rolling context management to keep AI suggestion quality stable over long (4+ hour) D&D sessions. The core problem is that `AIAssistant._conversationHistory` currently grows to 20 entries and PromptBuilder blindly includes the last 5 verbatim -- with no awareness of total token count. As sessions progress, the prompt can exceed useful context window limits and degrade suggestion quality.

The solution involves three interconnected pieces: (1) a `RollingSummarizer` service that compresses older conversation turns into a narrative summary using GPT-4o-mini, (2) a token budget system in `PromptBuilder` that enforces a configurable cap (default 12K tokens) with priority-based component inclusion, and (3) a UI badge in MainPanel showing summary age for DM confidence.

**Primary recommendation:** Implement as three focused plans: (1) RollingSummarizer + AIAssistant integration, (2) PromptBuilder token budget enforcement, (3) UI badge + debug logging + CostTracker wiring.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Summarization triggers after 8 conversation history entries accumulate in `_conversationHistory`
- Last 5 verbatim turns always preserved alongside the rolling summary (aligns with existing `PromptBuilder.slice(-5)`)
- Summary contains full narrative recap: plot events, party decisions, NPC/player actions, tone and detail preserved
- Regeneration approach: each trigger re-summarizes the full existing summary + newly evicted turns into a fresh compressed summary (not incremental append)
- Priority-based overflow budget: fill components in priority order until 12K budget hit
- Priority order: Adventure context > Verbatim turns > Rolling summary > NPC profiles > Next chapter lookahead
- System prompt and user request always included (fixed overhead ~1500 tokens)
- Token estimation via simple char/4 heuristic (~85% accurate, zero dependencies)
- Budget limit is a Foundry setting (world-scoped) with 12K default, so power users can adjust
- Rolling summary logged to console at debug level via existing `Logger.debug()`
- Full prompt dump logged each cycle when debug mode is on (no separate verbose flag)
- Small UI badge showing summary age (e.g. "Context: 45 turns summarized")
- AI-powered via GPT-4o-mini: send evicted turns + existing summary for re-summarization (~$0.001 per call)
- Summarization runs in background async -- parallel with the next live cycle, no latency impact on suggestions
- On API failure: keep old summary, retry at next trigger (graceful degradation, no user-visible impact)
- Summarization cost tracked via Phase 4's CostTracker

### Claude's Discretion
- Exact summarization prompt design (system message for GPT-4o-mini)
- How to handle the first summarization when no prior summary exists
- Concurrency guard if summarization overlaps with next trigger
- Summary maximum token cap (within the 2K-ish allocation)
- Badge placement and styling in MainPanel

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-03 | Session context uses rolling summarization (last 5 turns verbatim + summary of prior turns) | RollingSummarizer service handles summarization trigger at 8 entries; PromptBuilder token budget enforces 12K cap; verbatim slice(-5) already exists in PromptBuilder line 321 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GPT-4o-mini | current | Summarization LLM | Already used for suggestions; $0.15/1M input, $0.60/1M output -- cheapest option |
| OpenAIClient | existing | API calls with retry/queue/circuit breaker | Already handles all OpenAI calls in the project |
| CostTracker | existing | Track summarization token costs | Phase 4 deliverable, already integrated in SessionOrchestrator |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Logger | existing | Debug logging for summary content | Every summarization event and prompt dump |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GPT-4o-mini summarization | Local heuristic (sentence extraction) | Much cheaper but loses narrative coherence; user locked AI-powered approach |
| char/4 token estimation | tiktoken library | More accurate but adds dependency; user locked char/4 heuristic |

## Architecture Patterns

### Recommended Project Structure
```
scripts/
  narrator/
    RollingSummarizer.mjs    # NEW: Summarization service
    AIAssistant.mjs          # MODIFIED: Trigger summarization, hold rolling summary
    PromptBuilder.mjs        # MODIFIED: Token budget enforcement, rolling summary injection
  orchestration/
    SessionOrchestrator.mjs  # MODIFIED: Wire summarization cost tracking
  ui/
    MainPanel.mjs            # MODIFIED: Summary age badge
templates/
  main-panel.hbs             # MODIFIED: Badge markup
styles/
  vox-chronicle.css          # MODIFIED: Badge styling
tests/
  narrator/
    RollingSummarizer.test.js # NEW
    AIAssistant.test.js       # EXTENDED
    PromptBuilder.test.js     # EXTENDED
```

### Pattern 1: RollingSummarizer Service
**What:** Standalone service that accepts old summary + evicted turns and returns a compressed summary
**When to use:** Called by AIAssistant when conversation history reaches trigger threshold (8 entries)
**Example:**
```javascript
// Follows established service pattern from CLAUDE.md
import { Logger } from '../utils/Logger.mjs';

class RollingSummarizer {
  _logger = Logger.createChild('RollingSummarizer');
  _isSummarizing = false; // Concurrency guard
  _currentSummary = '';
  _summarizedTurnCount = 0;

  constructor(openaiClient, options = {}) {
    this._client = openaiClient;
    this._model = options.model || 'gpt-4o-mini';
    this._maxSummaryTokens = options.maxSummaryTokens || 500; // ~2000 chars
  }

  async summarize(existingSummary, evictedTurns) {
    if (this._isSummarizing) return existingSummary; // Concurrency guard
    this._isSummarizing = true;
    try {
      // Build summarization prompt, call API, return new summary
      // Track usage for CostTracker via return value
    } finally {
      this._isSummarizing = false;
    }
  }
}
```

### Pattern 2: Token Budget Enforcement in PromptBuilder
**What:** Before returning messages from `buildAnalysisMessages()`, estimate total tokens and trim components by priority
**When to use:** Every call to `buildAnalysisMessages()`
**Example:**
```javascript
// Token estimation heuristic (locked decision: char/4)
_estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Priority-based budget allocation
_applyTokenBudget(components, budget) {
  // 1. System prompt + user request: always included (fixed overhead)
  // 2. Adventure context: highest priority variable component
  // 3. Verbatim turns: last 5 conversation entries
  // 4. Rolling summary: compressed prior context
  // 5. NPC profiles: personality/motivation data
  // 6. Next chapter lookahead: foreshadowing content
  // Trim from lowest priority up until budget is met
}
```

### Pattern 3: Async Background Summarization
**What:** Summarization runs as a fire-and-forget background task, not blocking the live cycle
**When to use:** When `_addToConversationHistory` triggers summarization threshold
**Example:**
```javascript
// In AIAssistant._addToConversationHistory:
if (this._conversationHistory.length >= this._triggerThreshold) {
  const evicted = this._conversationHistory.slice(0, -5);
  this._conversationHistory = this._conversationHistory.slice(-5);
  // Fire-and-forget: do not await
  this._rollingSummarizer.summarize(this._rollingSummary, evicted)
    .then(result => {
      this._rollingSummary = result.summary;
      this._summarizedTurnCount += evicted.length;
      // Track cost via callback or return value
    })
    .catch(err => this._logger.warn('Summarization failed, keeping old summary:', err.message));
}
```

### Anti-Patterns to Avoid
- **Blocking summarization in the live cycle:** Summarization MUST be async/background. Never `await` it in the analysis path.
- **Incremental summary append:** User locked "regeneration" approach -- always re-summarize the full summary + new evictions, do not just append new text.
- **Mutating history during summarization:** The eviction should happen immediately (synchronous), and only the summary text is updated async. This prevents race conditions where new turns arrive during summarization.
- **Hardcoding budget:** Use Foundry setting with 12K default, not a constant.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Custom tokenizer | `Math.ceil(str.length / 4)` | User locked char/4 heuristic; good enough at ~85% accuracy |
| API retry/backoff | Custom retry loop | `OpenAIClient._enqueueRequest` + `_retryWithBackoff` | Already handles rate limits, circuit breaker, jitter |
| Cost tracking | Manual cost math | `CostTracker.addUsage(model, usage)` | Phase 4 deliverable, already has pricing for gpt-4o-mini |
| Debug logging | Custom debug system | `Logger.createChild('RollingSummarizer')` | Established pattern, respects debug mode setting |

**Key insight:** This phase primarily connects existing infrastructure (OpenAIClient, CostTracker, Logger, PromptBuilder) with new summarization logic. Most plumbing already exists.

## Common Pitfalls

### Pitfall 1: Race Condition Between Eviction and Summarization
**What goes wrong:** If summarization is slow and the next cycle also triggers eviction, turns can be lost or double-summarized.
**Why it happens:** Async summarization overlaps with synchronous history mutation.
**How to avoid:** Evict turns immediately (synchronous) into a local variable, pass to summarizer. Use `_isSummarizing` boolean guard -- if already running, skip this trigger and let the next trigger pick up the accumulated turns.
**Warning signs:** Summary content doesn't match what actually happened; turns appear duplicated or missing.

### Pitfall 2: Token Budget Estimation Drift
**What goes wrong:** char/4 heuristic underestimates tokens for JSON-heavy content (analysis responses stored in history contain `{`, `"`, brackets). Over 180 cycles the error compounds.
**Why it happens:** JSON has more tokens per character than prose (~1 token per 3.5 chars instead of 4).
**How to avoid:** Apply a 10% safety margin to the budget (e.g., target 10,800 when budget is 12,000). Test with realistic JSON-heavy conversation history in unit tests.
**Warning signs:** Actual API token counts consistently exceed estimated counts by >20%.

### Pitfall 3: Empty or Degenerate Summary on First Run
**What goes wrong:** First summarization has no existing summary -- prompt must handle the "cold start" case explicitly.
**Why it happens:** The summarization prompt includes "existing summary" but it's empty on first run.
**How to avoid:** Detect empty existing summary and use a simplified prompt: "Summarize these conversation turns into a narrative recap" instead of "Incorporate these new turns into the existing summary".
**Warning signs:** First summary is very short or says "no prior summary available".

### Pitfall 4: Conversation History Format Mismatch
**What goes wrong:** History entries are `{role: 'assistant', content: JSON.stringify(analysis)}` -- the summarizer receives raw JSON strings, not readable text.
**Why it happens:** `_addToConversationHistory` at line 699 stores `JSON.stringify(analysis)` as assistant content.
**How to avoid:** When building the eviction payload for summarization, extract meaningful text from assistant entries (e.g., `analysis.summary` field) rather than passing raw JSON to the summarizer.
**Warning signs:** Summary contains JSON syntax or says "the assistant responded with suggestions".

### Pitfall 5: Budget Overflow on System Prompt Alone
**What goes wrong:** The system prompt (`buildSystemPrompt()`) is ~1000 tokens. Combined with chapter context embedded in it, adventure context, and user request, fixed overhead can exceed 5K tokens, leaving little room for variable content.
**Why it happens:** `buildSystemPrompt()` already includes chapter context inline. Adventure context is a separate system message.
**How to avoid:** Measure actual system prompt + user request token count in tests. The ~1500 fixed overhead estimate from CONTEXT.md may be low -- verify empirically and adjust.
**Warning signs:** Token budget leaves <2K tokens for all variable content after fixed overhead.

## Code Examples

### Summarization Prompt Design (Claude's Discretion)

```javascript
// System message for GPT-4o-mini summarization
const systemPrompt = `You are a session historian for a tabletop RPG game.
Your task is to compress conversation context into a concise narrative summary.

Rules:
- Preserve ALL key plot events, party decisions, and NPC interactions
- Maintain character names and specific details (locations, items, numbers)
- Use present tense for ongoing situations, past tense for completed events
- Keep the tone factual and structured
- Target approximately ${this._maxSummaryTokens} tokens (${this._maxSummaryTokens * 4} characters)
- Do NOT include meta-commentary about the summary itself`;

// User message varies based on cold start vs. update
const userPrompt = existingSummary
  ? `Here is the existing session summary:\n\n${existingSummary}\n\nHere are the new conversation turns to incorporate:\n\n${formattedTurns}\n\nProduce an updated summary that incorporates the new information while staying concise.`
  : `Here are the conversation turns from a tabletop RPG session:\n\n${formattedTurns}\n\nProduce a concise narrative summary of what has happened so far.`;
```

### Token Budget Enforcement

```javascript
// In PromptBuilder.buildAnalysisMessages(), after constructing all components:
_enforceTokenBudget(messages, budget) {
  const estimate = (text) => Math.ceil((text || '').length / 4);

  // Fixed components (always included)
  const systemPrompt = messages[0].content;
  const userRequest = messages[messages.length - 1].content;
  let used = estimate(systemPrompt) + estimate(userRequest);

  // Variable components in priority order
  const components = [
    { key: 'adventureContext', tokens: estimate(this._adventureContextContent) },
    { key: 'verbatimTurns', tokens: this._verbatimTurnsTokens },
    { key: 'rollingSummary', tokens: estimate(this._rollingSummary) },
    { key: 'npcProfiles', tokens: this._npcProfilesTokens },
    { key: 'nextChapterLookahead', tokens: estimate(this._nextChapterLookahead) }
  ];

  const included = [];
  for (const comp of components) {
    if (used + comp.tokens <= budget) {
      included.push(comp.key);
      used += comp.tokens;
    } else {
      this._logger.debug(`Token budget: dropping ${comp.key} (${comp.tokens} tokens, ${used}/${budget} used)`);
    }
  }

  return included;
}
```

### Wiring Summarization Into AIAssistant

```javascript
// Modified _addToConversationHistory
_addToConversationHistory(role, content) {
  this._conversationHistory.push({ role, content });

  // Trigger summarization at threshold (replaces old slice behavior)
  if (this._conversationHistory.length >= this._summarizationTrigger) {
    const verbatimKeep = 5;
    const evicted = this._conversationHistory.slice(0, -verbatimKeep);
    this._conversationHistory = this._conversationHistory.slice(-verbatimKeep);

    // Format evicted turns for summarizer (handle JSON assistant content)
    const formattedTurns = evicted.map(entry => {
      if (entry.role === 'assistant') {
        try {
          const parsed = JSON.parse(entry.content);
          return `AI Summary: ${parsed.summary || 'No summary available'}`;
        } catch { return `AI: ${entry.content.substring(0, 200)}`; }
      }
      return `Player/DM: ${entry.content}`;
    }).join('\n');

    // Fire-and-forget background summarization
    this._rollingSummarizer?.summarize(this._rollingSummary, formattedTurns)
      .then(result => {
        this._rollingSummary = result.summary;
        this._summarizedTurnCount += evicted.length;
        if (result.usage && this._onSummarizationUsage) {
          this._onSummarizationUsage(result.usage);
        }
        this._logger.debug(`Rolling summary updated (${this._summarizedTurnCount} turns summarized)`);
      })
      .catch(err => {
        this._logger.warn('Rolling summarization failed, keeping old summary:', err.message);
      });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Slice last 20, send last 5 | Rolling summarization + token budget | Phase 5 (now) | Prevents context degradation over 4+ hour sessions |
| No token budget awareness | Priority-based budget enforcement | Phase 5 (now) | Guarantees 12K token cap per cycle |
| Hardcoded MAX_CONTEXT_TOKENS=8000 | Configurable Foundry setting | Phase 5 (now) | Power users can tune budget for their needs |

**Deprecated/outdated:**
- `_maxHistorySize = 20` constant: Replaced by `_summarizationTrigger = 8` with rolling summary
- `PromptBuilder.slice(-5)` as sole history management: Now part of budget-aware system

## Open Questions

1. **System prompt token measurement accuracy**
   - What we know: System prompt is estimated at ~1000 tokens via char/4, user request at ~500
   - What's unclear: Actual system prompt varies with chapter context, sensitivity, language -- could be 800-2000 tokens
   - Recommendation: Add a test that measures system prompt tokens across configurations; use worst-case for budget calculation

2. **Summary quality validation**
   - What we know: GPT-4o-mini can summarize effectively at $0.001/call
   - What's unclear: How well it preserves D&D-specific details (spell names, NPC relationships, plot threads) in compressed form
   - Recommendation: Include a debug-mode test in the plan where summary content is logged and manually inspectable; success criteria #4 covers this

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom environment) |
| Config file | `vitest.config.js` |
| Quick run command | `npx vitest run tests/narrator/RollingSummarizer.test.js` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-03a | Summarization triggers at 8 entries | unit | `npx vitest run tests/narrator/RollingSummarizer.test.js -x` | No - Wave 0 |
| SESS-03b | Last 5 verbatim turns preserved after eviction | unit | `npx vitest run tests/narrator/AIAssistant.test.js -t "rolling" -x` | No - extend existing |
| SESS-03c | Token count stays at/below 12K over 180 cycles | unit | `npx vitest run tests/narrator/PromptBuilder.test.js -t "budget" -x` | No - extend existing |
| SESS-03d | Rolling summary readable in debug view | unit | `npx vitest run tests/narrator/RollingSummarizer.test.js -t "debug" -x` | No - Wave 0 |
| SESS-03e | Summarization cost tracked in CostTracker | unit | `npx vitest run tests/orchestration/CostTracker.test.js -t "summarization" -x` | No - extend existing |
| SESS-03f | Async summarization does not block live cycle | unit | `npx vitest run tests/narrator/AIAssistant.test.js -t "async" -x` | No - extend existing |
| SESS-03g | Graceful degradation on API failure | unit | `npx vitest run tests/narrator/RollingSummarizer.test.js -t "failure" -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/narrator/RollingSummarizer.test.js tests/narrator/AIAssistant.test.js tests/narrator/PromptBuilder.test.js -x`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/narrator/RollingSummarizer.test.js` -- covers SESS-03a, SESS-03d, SESS-03g
- [ ] Extend `tests/narrator/AIAssistant.test.js` -- covers SESS-03b, SESS-03f
- [ ] Extend `tests/narrator/PromptBuilder.test.js` -- covers SESS-03c
- [ ] Extend `tests/orchestration/CostTracker.test.js` -- covers SESS-03e

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `scripts/narrator/AIAssistant.mjs` -- conversation history management (lines 166, 173, 698-699, 1720-1726)
- Codebase inspection: `scripts/narrator/PromptBuilder.mjs` -- full file (627 lines), message construction and slice(-5) at line 321
- Codebase inspection: `scripts/orchestration/CostTracker.mjs` -- full file (153 lines), pricing map and addUsage API
- Codebase inspection: `scripts/orchestration/SessionOrchestrator.mjs` -- _liveCycle (line 1425), _runAIAnalysis (line 1618), cost tracking (line 1684)
- CONTEXT.md: User decisions locked during discussion phase

### Secondary (MEDIUM confidence)
- OpenAI pricing: GPT-4o-mini at $0.15/1M input, $0.60/1M output (from CostTracker.PRICING and CLAUDE.md)

### Tertiary (LOW confidence)
- Token estimation accuracy: char/4 heuristic cited as ~85% accurate in CONTEXT.md; not independently verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use in the project
- Architecture: HIGH - clear integration points identified in existing code
- Pitfalls: HIGH - identified from direct code inspection of existing patterns

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, no external dependency changes expected)
