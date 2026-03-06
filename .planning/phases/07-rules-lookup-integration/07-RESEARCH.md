# Phase 7: Rules Lookup Integration - Research

**Researched:** 2026-03-06
**Domain:** D&D 5e rules detection, compendium search, AI synthesis, live mode UI integration
**Confidence:** HIGH

## Summary

Phase 7 wires existing but unused rules infrastructure into the live mode pipeline. The codebase already contains `RulesReference` (with `detectRulesQuestion`, `searchRules`, `searchCompendiums`, `_extractCitation`) and `AIAssistant._detectRulesQuestions` -- both fully implemented, tested, but never consumed downstream. The `analyzeContext()` method already returns `rulesQuestions[]` in its result but nothing acts on it. `VoxChronicle.rulesReference` is instantiated at init time but never passed to the orchestrator.

The work decomposes into: (1) wiring `RulesReference` into `SessionOrchestrator` and triggering lookups from detected questions, (2) building a rules synthesis call through `OpenAIClient.post` to gpt-4o, (3) rendering rules cards in the existing suggestion card feed with hybrid two-phase display, (4) adding the on-demand query input, and (5) cooldown/dedup and failure handling.

**Primary recommendation:** Consolidate rules detection into `RulesReference.detectRulesQuestion` (the canonical implementation), delegate from `AIAssistant._detectRulesQuestions` to it, and keep all rules lookup logic in a new `RulesLookupService` that wraps RulesReference + OpenAIClient for the synthesis step.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hybrid approach: instant compendium match first, then AI-grounded refinement
- Compendium search returns top 3 matches immediately (via existing RulesReference.searchRules/searchCompendiums)
- AI refinement uses gpt-4o (not gpt-4o-mini) to synthesize a concise, cited answer from the top 3 compendium hits
- Fire-and-forget parallel execution: rules lookup runs independently via Promise, does not block or delay suggestion generation
- Each detected question triggers its own independent lookup -- multiple questions fire in parallel
- Rules answers appear in the same card feed as suggestions (not a separate section)
- Cards use the existing purple 'reference' type badge
- Rules cards have a subtle purple-tinted background to visually distinguish from suggestion cards
- Hybrid transition: card appears immediately with compendium excerpt + 'refining...' indicator, then in-place updates to the AI-synthesized answer when GPT finishes
- Citation displayed as inline badge at bottom of card: '[PHB: Grappling, p.195]'
- Persistent text input field at the bottom of the panel, placeholder 'Ask a rules question...'
- Input is always available (idle, live, and chronicle modes)
- Submit with Enter key -- input clears immediately, rules card appears in feed with loading state
- Auto-detected rules cards get a small 'auto' source badge
- On-demand rules cards have no extra source badge -- just the purple 'reference' type badge
- Same rules topic can only trigger auto-lookup once per 5-minute cooldown window
- On-demand queries always go through (DM explicitly asked) -- no cooldown applied
- Cooldown tracked per normalized topic string
- Rules lookup failure does not affect suggestion generation (RULE-03)
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RULE-01 | DM can ask D&D 5e rules questions and receive answers grounded in SRD compendium content | RulesReference.searchRules/searchCompendiums already return compendium content with citations; new RulesLookupService wraps these + gpt-4o synthesis; on-demand query input provides direct ask path |
| RULE-02 | Rules answers include citations to specific SRD sections/sources | RulesReference._extractCitation already returns formatted citations with sourcebook abbreviation and page; citation badge renders in card footer |
| RULE-03 | Rules lookup integrates into the live cycle as fire-and-forget (non-blocking) | Independent Promise execution in _runAIAnalysis, alongside but not blocking streaming suggestion path; Promise.allSettled pattern from Phase 3/4 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| OpenAI Chat Completions API | gpt-4o | Rules synthesis from compendium excerpts | Locked decision -- gpt-4o for quality synthesis |
| RulesReference | existing | Compendium search, question detection, citation extraction | Already implemented, tested, loaded at init |
| OpenAIClient | existing | API calls with retry, queue, circuit breaker | Standard client for all OpenAI calls |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortController | Web API | Cancel in-flight rules lookups on session stop | Session lifecycle management |
| Map | ES6 | Cooldown tracking per topic | Auto-detection dedup |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New RulesLookupService class | Inline in SessionOrchestrator | Service class is cleaner, testable, reusable |
| gpt-4o for synthesis | gpt-4o-mini | Locked decision: gpt-4o chosen for quality |
| Separate rules section in UI | Same card feed | Locked decision: same feed with purple tint |

## Architecture Patterns

### Recommended Project Structure
```
scripts/
  narrator/
    RulesReference.mjs        # EXISTING - compendium search, detection, citations
    RulesLookupService.mjs    # NEW - orchestrates detection + search + synthesis + cooldown
    AIAssistant.mjs            # MODIFIED - delegate _detectRulesQuestions to RulesReference
  orchestration/
    SessionOrchestrator.mjs    # MODIFIED - wire rules lookup as fire-and-forget
  ui/
    MainPanel.mjs              # MODIFIED - rules card rendering + on-demand input
templates/
  main-panel.hbs               # MODIFIED - input field, rules card variant
styles/
  vox-chronicle.css            # MODIFIED - purple tint, citation badge, input field
```

### Pattern 1: RulesLookupService (New Service)
**What:** Service class that orchestrates the full rules lookup lifecycle: detection, compendium search, gpt-4o synthesis, cooldown management
**When to use:** Both auto-detected rules questions and on-demand queries flow through this service
**Example:**
```javascript
// New service wrapping existing RulesReference + OpenAIClient
export class RulesLookupService {
  constructor(rulesReference, openaiClient, options = {}) {
    this._rulesReference = rulesReference;
    this._openaiClient = openaiClient;
    this._cooldownMap = new Map(); // topic -> timestamp
    this._cooldownMs = options.cooldownMs || 5 * 60 * 1000; // 5 minutes
    this._logger = Logger.createChild('RulesLookupService');
  }

  // Returns { phase1: compendium results, phase2Promise: AI synthesis }
  async lookup(question, { skipCooldown = false, signal } = {}) {
    const topic = this._normalizeTopic(question);
    if (!skipCooldown && this._isOnCooldown(topic)) return null;

    // Phase 1: immediate compendium search
    const searchResults = await this._rulesReference.searchRules(topic, { limit: 3 });
    const compendiumResults = searchResults.length > 0
      ? searchResults
      : await this._rulesReference.searchCompendiums(topic, { limit: 3 });

    // Phase 2: AI synthesis (returns Promise, caller decides when to await)
    const synthesisPromise = this._synthesize(question, compendiumResults, { signal });

    if (!skipCooldown) this._setCooldown(topic);
    return { compendiumResults, synthesisPromise, topic };
  }
}
```

### Pattern 2: Fire-and-Forget Integration in _runAIAnalysis
**What:** Rules lookup runs as independent Promise alongside (not inside) the streaming suggestion path
**When to use:** Every AI analysis cycle when rules questions are detected
**Example:**
```javascript
// In SessionOrchestrator._runAIAnalysis, BEFORE the streaming/analyzeContext call:
const rulesDetection = this._rulesReference?.detectRulesQuestion?.(contextText);
if (rulesDetection?.isRulesQuestion && this._rulesLookupService) {
  // Fire-and-forget: do not await, do not block suggestions
  this._rulesLookupService.lookup(rulesDetection.extractedTopic)
    .then(result => {
      if (result) this._emitRulesCard(result);
    })
    .catch(err => {
      this._logger.warn('Rules lookup failed:', err.message);
      this._emitRulesCardUnavailable(rulesDetection.extractedTopic);
    });
}
// Then proceed with streaming suggestion generation as normal
```

### Pattern 3: Two-Phase Card Rendering
**What:** Rules card appears immediately with compendium excerpt, then updates in-place when AI synthesis completes
**When to use:** Every rules lookup (both auto and on-demand)
**Example:**
```javascript
// Phase 1: Create card with compendium excerpt immediately
_createRulesCard(topic, compendiumResults) {
  const card = document.createElement('div');
  card.className = 'vox-chronicle-suggestion vox-chronicle-suggestion--rules';
  // Show top result content + 'refining...' spinner
  // Citation badge at bottom from compendiumResults[0].rule.citation.formatted
}

// Phase 2: Update card in-place when synthesis completes
_updateRulesCard(card, synthesizedAnswer, citations) {
  // Replace content with AI-synthesized answer
  // Remove spinner, keep citation badges
  card.classList.remove('vox-chronicle-suggestion--refining');
}
```

### Pattern 4: On-Demand Query Input (Always Available)
**What:** Persistent text input at bottom of panel, submits on Enter
**When to use:** Always visible, works in idle/live/chronicle modes
**Example:**
```javascript
// In main-panel.hbs - at bottom of panel, outside tab panes
<div class="vox-chronicle-rules-input">
  <input type="text" class="vox-chronicle-rules-input__field"
    placeholder="{{localize 'VOXCHRONICLE.Rules.AskPlaceholder'}}" />
</div>

// In _onRender - wire Enter key handler with signal for cleanup
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    this._handleRulesQuery(e.target.value.trim());
    e.target.value = '';
  }
}, { signal });
```

### Anti-Patterns to Avoid
- **Blocking suggestion cycle:** Rules lookup MUST NOT be awaited inside the streaming suggestion path. Use fire-and-forget Promise, not `await`.
- **Duplicating detection logic:** Do NOT create a third rules detection implementation. Consolidate into RulesReference.detectRulesQuestion and delegate from AIAssistant.
- **Full panel re-render for card updates:** Use direct DOM manipulation for phase-2 card updates (same pattern as streaming cards), not `this.render()`.
- **Rules lookup inside cycle guard:** The `_isCycleInFlight` guard protects the suggestion cycle. Rules lookups must be outside this guard (independent path).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Compendium search | Custom search engine | RulesReference.searchRules + searchCompendiums | Already implemented with relevance scoring, citation extraction |
| Question detection | New regex patterns | RulesReference.detectRulesQuestion | Has English + Italian patterns, confidence scoring, topic extraction |
| Citation formatting | Custom citation parser | RulesReference._extractCitation + _formatCitation | Handles PHB/DMG/MM/XGtE/etc. abbreviations, page numbers |
| API retry/queue | Custom retry logic | OpenAIClient.post (includes retry + queue + circuit breaker) | Standard client pattern |
| DOM cleanup on close | Manual removeEventListener | AbortController signal pattern (established in Phase 4, 6) | Prevents memory leaks |

**Key insight:** ~80% of the rules lookup infrastructure already exists in `RulesReference`. The new work is the synthesis step, the UI rendering, and the orchestration wiring.

## Common Pitfalls

### Pitfall 1: Blocking the Suggestion Cycle
**What goes wrong:** Awaiting rules lookup inside `_runAIAnalysis` delays suggestion delivery by 2-5 seconds
**Why it happens:** Natural impulse to `await` the lookup result before continuing
**How to avoid:** Fire-and-forget pattern: `.then()` callback emits the card, `.catch()` emits unavailable card. Never `await` rules lookup in the suggestion path.
**Warning signs:** Suggestion delivery time increases from ~1s to ~5s during live sessions

### Pitfall 2: Cooldown Key Normalization
**What goes wrong:** Slight variations in detected topic ("grappling" vs "grapple" vs "how does grapple work") bypass cooldown
**Why it happens:** Exact string matching on raw extracted topic
**How to avoid:** Normalize to lowercase, strip question words and articles, use the first noun/mechanic term. Simple approach: split on whitespace, filter stop words, sort remaining, join. No need for stemming -- D&D terms are mostly exact keywords.
**Warning signs:** Same rule appearing multiple times in quick succession

### Pitfall 3: Panel Re-Render Destroying Rules Cards
**What goes wrong:** `_prepareContext` is called on every render cycle; DOM-injected rules cards disappear
**Why it happens:** Handlebars re-renders the entire template, destroying DOM-injected cards
**How to avoid:** Store rules cards in an instance array (like `_lastAISuggestions` pattern). Include them in `_prepareContext` return data so they survive re-renders. For in-flight phase-2 updates, use direct DOM manipulation (same pattern as streaming cards).
**Warning signs:** Rules cards vanish after any panel interaction

### Pitfall 4: Rules Lookups After Session Stop
**What goes wrong:** A rules lookup Promise resolves after live mode stops, tries to render cards in destroyed UI
**Why it happens:** Fire-and-forget Promises outlive the session
**How to avoid:** Pass `signal` from `_shutdownController` to rules lookup. Check `this._liveMode` before emitting cards. Use `AbortSignal` on the gpt-4o synthesis fetch call.
**Warning signs:** Console errors about null elements after stopping live mode

### Pitfall 5: Input Field Losing State on Re-Render
**What goes wrong:** DM types a question, panel re-renders (e.g., from suggestion update), input field resets
**Why it happens:** Handlebars template re-creates the input element
**How to avoid:** Save input value before render, restore after render in `_onRender`. Or place input outside the re-renderable template part (preferred if ApplicationV2 PARTS supports it).
**Warning signs:** Typed text disappearing mid-sentence

### Pitfall 6: Cost Tracking for Rules Synthesis
**What goes wrong:** Rules synthesis calls to gpt-4o are not tracked by CostTracker, cost display is inaccurate
**Why it happens:** Rules lookup is fire-and-forget, outside the main analysis cost tracking path
**How to avoid:** In the synthesis `.then()` callback, call `this._costTracker?.addUsage('gpt-4o', usage)` with the returned usage data
**Warning signs:** Cost display diverges from actual API costs during rules-heavy sessions

## Code Examples

### Rules Synthesis Prompt Design
```javascript
// Prompt for gpt-4o rules synthesis from compendium excerpts
_buildSynthesisPrompt(question, compendiumResults) {
  const excerpts = compendiumResults.map((r, i) => {
    const citation = r.rule.citation?.formatted || r.rule.source || 'Unknown';
    return `[Source ${i + 1}: ${citation}]\n${r.rule.content.substring(0, 1500)}`;
  }).join('\n\n');

  return {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a D&D 5e rules expert. Answer the question using ONLY the provided source material. Be concise (2-3 sentences max). Always cite the source in brackets like [PHB: Grappling, p.195]. If the sources don't contain enough information to answer, say so honestly.`
      },
      {
        role: 'user',
        content: `Question: ${question}\n\nSource Material:\n${excerpts}`
      }
    ],
    max_tokens: 300,
    temperature: 0.2  // Low temperature for factual accuracy
  };
}
```

### Topic Normalization for Cooldown
```javascript
// Simple normalization: lowercase, strip question scaffolding, keep mechanic terms
_normalizeTopic(text) {
  if (!text) return '';
  const stopWords = new Set([
    'how', 'does', 'do', 'what', 'is', 'the', 'rule', 'rules', 'for',
    'a', 'an', 'can', 'i', 'you', 'work', 'works', 'when', 'if',
    'come', 'funziona', 'qual', 'regola', 'regole', 'per'
  ]);
  return text.toLowerCase().trim()
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w))
    .sort()
    .join(' ');
}
```

### Rules Card CSS (Purple Tint)
```css
/* Rules card variant - subtle purple-tinted background */
.vox-chronicle-suggestion--rules {
  background: rgba(155, 89, 182, 0.08);
  border-color: rgba(155, 89, 182, 0.2);
}

/* Refining state spinner */
.vox-chronicle-suggestion--refining .vox-chronicle-suggestion__refining {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75em;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
}

/* Citation badge at bottom of card */
.vox-chronicle-suggestion__citation {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.65em;
  background: rgba(155, 89, 182, 0.12);
  color: rgba(155, 89, 182, 0.8);
  margin-top: 6px;
}

/* Unavailable state - muted styling */
.vox-chronicle-suggestion--unavailable {
  opacity: 0.5;
  border-style: dashed;
}

/* Auto-dismiss fade-out animation */
.vox-chronicle-suggestion--dismissing {
  animation: vox-chronicle-fade-out 0.5s ease-out forwards;
}
@keyframes vox-chronicle-fade-out {
  to { opacity: 0; height: 0; padding: 0; margin: 0; overflow: hidden; }
}
```

### Callback Wiring Pattern
```javascript
// In SessionOrchestrator or VoxChronicle init - add new callback
this._callbacks.onRulesCard = null;  // { topic, compendiumResults, synthesisPromise, source }

// In MainPanel setup - wire the callback
orchestrator.setCallbacks({
  // ... existing callbacks ...
  onRulesCard: (data) => this._handleRulesCard(data),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rules detection in AIAssistant only | RulesReference as canonical service | Already exists | Consolidate, don't duplicate |
| analyzeContext returns rulesQuestions unused | Wire into fire-and-forget lookups | This phase | Enables RULE-01/03 |
| No rules UI | Purple-tinted cards in suggestion feed | This phase | Visual distinction |

**Key infrastructure already in place:**
- `RulesReference.detectRulesQuestion()` -- confidence scoring, topic extraction, EN+IT patterns
- `RulesReference.searchRules()` + `searchCompendiums()` -- relevance scoring, citation extraction
- `RulesReference._extractCitation()` + `_formatCitation()` -- sourcebook abbreviations, page numbers
- `VoxChronicle.rulesReference` -- instantiated at init, ready to wire
- Streaming card DOM pattern from Phase 6 -- reusable for two-phase card rendering
- Dismiss button pattern from Phase 6 -- reusable for rules cards

## Open Questions

1. **AIAssistant._detectRulesQuestions consolidation**
   - What we know: Both AIAssistant and RulesReference have nearly identical regex patterns and mechanic term lists
   - What's unclear: Whether to fully replace AIAssistant's implementation or delegate
   - Recommendation: Make AIAssistant._detectRulesQuestions delegate to RulesReference.detectRulesQuestion (adapter pattern). This minimizes diff size and preserves backward compatibility for analyzeContext consumers.

2. **Auto-dismiss timing for unavailable cards**
   - What we know: User wants 10-second auto-dismiss
   - What's unclear: Whether setTimeout is sufficient or needs cleanup integration
   - Recommendation: Use `setTimeout` with AbortController signal check. On signal abort, clear the timeout. Card removal uses the fade-out CSS animation (0.5s) then DOM removal.

3. **Input field persistence across re-renders**
   - What we know: ApplicationV2 _onRender re-creates DOM on every render
   - What's unclear: Best approach for input state preservation
   - Recommendation: Store input value in instance property before render, restore in _onRender. This is the simplest approach and matches existing streaming card recovery pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest with jsdom |
| Config file | vitest.config.js |
| Quick run command | `npx vitest run tests/narrator/RulesReference.test.js --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RULE-01 | Rules question detection + compendium search + synthesis | unit | `npx vitest run tests/narrator/RulesLookupService.test.js -x` | Wave 0 |
| RULE-01 | On-demand query via input field triggers lookup | unit | `npx vitest run tests/ui/MainPanel.test.js -t "rules query" -x` | Extend |
| RULE-02 | Citation badge rendered from compendium citation | unit | `npx vitest run tests/narrator/RulesLookupService.test.js -t "citation" -x` | Wave 0 |
| RULE-03 | Rules lookup failure does not affect suggestions | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -t "rules.*fail" -x` | Extend |
| RULE-03 | Fire-and-forget execution (non-blocking) | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -t "rules.*parallel" -x` | Extend |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/narrator/RulesLookupService.test.js tests/narrator/RulesReference.test.js -x`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/narrator/RulesLookupService.test.js` -- covers RULE-01, RULE-02 (new service)
- [ ] Extend `tests/orchestration/SessionOrchestrator.test.js` -- covers RULE-03 (fire-and-forget wiring)
- [ ] Extend `tests/ui/MainPanel.test.js` -- covers on-demand input, rules card rendering

## Sources

### Primary (HIGH confidence)
- RulesReference.mjs source code -- full review of detection, search, citation methods
- SessionOrchestrator.mjs source code -- _runAIAnalysis flow, callback pattern, streaming integration
- MainPanel.mjs source code -- _prepareContext, streaming card pattern, _parseCardContent, dismiss handler
- AIAssistant.mjs source code -- _detectRulesQuestions duplication, analyzeContext rulesQuestions return
- VoxChronicle.mjs source code -- rulesReference instantiation, narrator service wiring
- main-panel.hbs template -- suggestion card rendering, tab structure, live mode sections
- vox-chronicle.css -- suggestion card styling, type badge colors, streaming card patterns

### Secondary (MEDIUM confidence)
- CONTEXT.md -- locked decisions and discretion areas from discussion phase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components already exist in codebase, just need wiring
- Architecture: HIGH -- patterns established in Phase 4-6 (fire-and-forget, streaming cards, callbacks)
- Pitfalls: HIGH -- directly observed from codebase analysis (re-render, lifecycle, cost tracking)

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- internal codebase, no external dependency changes)
