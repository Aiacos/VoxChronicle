# Phase 8: Advanced Suggestion Intelligence - Research

**Researched:** 2026-03-20
**Domain:** AI prompt engineering, on-demand query routing, off-track detection, speaker analytics
**Confidence:** HIGH

## Summary

Phase 8 is a pure software extension phase — no new external dependencies, no new UI framework concepts. Every feature slots into already-established patterns from Phases 5, 6, and 7. The codebase already has all the scaffolding: `_lastOffTrackStatus` is stored in SessionOrchestrator but never populated by the prompt; `_sceneType` flows to `PromptBuilder.setSceneType()` but only generates a one-liner guidance note; `SessionAnalytics.getSpeakerStats()` exists but is never injected into PromptBuilder; `handleManualRulesQuery` exists and can be mirrored for general queries.

All four requirements amount to: (1) add a `handleGeneralQuery` method on SessionOrchestrator mirroring `handleManualRulesQuery`; (2) extend `PromptBuilder.buildSystemPrompt()` with richer scene-type guidance; (3) add off-track structured data to the AI prompt schema and surface recovery cards when severity crosses threshold for 2+ cycles; (4) inject participation stats from `SessionAnalytics` into PromptBuilder's system prompt when a speaker is quiet.

**Primary recommendation:** Implement all four features as targeted extensions to existing files — no new services, no new abstractions, no new API calls.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**On-Demand General Query (SUG-04)**
- Repurpose existing rules input field as dual-purpose: rules questions AND general DM queries
- Intent detection: if input matches rules patterns (keywords like "rule", "DC", "how does X work", "what's the modifier for") route to existing `handleManualRulesQuery`; otherwise route to new `handleGeneralQuery` on SessionOrchestrator
- General queries use AIAssistant with full journal context (chapter, NPC profiles, rolling summary) — same as auto-suggestions but with the user's question as the primary prompt
- Response appears as a streaming card in the existing suggestion feed — same card format, same streaming behavior
- Type badge inferred from response content (narration/dialogue/action/reference) — same `_detectSuggestionType` logic
- Input placeholder changes to "Ask anything..." (broader than current "Ask a rules question...")
- Input remains always visible (idle, live, chronicle modes) — already implemented

**Scene-Type Prompt Adaptation (SUG-05)**
- PromptBuilder gets a `getSceneTypeGuidance(sceneType)` method returning scene-specific system prompt sections
- Combat: lead with tactical options, initiative-aware actions, enemy ability reminders, environment hazards
- Social: lead with NPC dialogue hooks, relationship dynamics, persuasion/deception opportunities, faction motives
- Exploration: lead with environmental descriptions, perception/investigation triggers, hidden elements, lore drops
- Rest: lead with downtime activities, character development moments, foreshadowing, camp events
- Unknown/fallback: generic balanced guidance (current behavior)
- Scene type injected into system prompt by PromptBuilder._buildSystemPrompt() — not a separate API call
- Scene type already flows from SceneDetector → SessionOrchestrator._currentSceneType → analyzeContext options

**Off-Track Detection & Recovery (SUG-06)**
- Off-track analysis embedded in the existing `analyzeContext()` AI prompt — NOT a separate API call
- AI structured response includes `offTrack` field: `{ detected: boolean, severity: 'minor'|'moderate'|'severe', reason: string, recoveryHook: string }`
- `recoveryHook` is a specific reference to the adventure journal content the party diverged from
- Trigger threshold: off-track detected at moderate+ severity for 2+ consecutive cycles before surfacing a recovery card
- Recovery card: amber-tinted background, "Off Track" badge, recovery hook text, dismiss button
- Minor off-track is logged but not surfaced
- `offTrackSensitivity` setting already registered — use it to adjust detection threshold
- Off-track state resets when SceneDetector detects a new scene transition

**Speaker-Aware Weighting (SUG-07)**
- SessionAnalytics.getParticipationStats() data injected into PromptBuilder context
- If any speaker has <15% of total speaking time over the last 30 minutes, PromptBuilder adds engagement guidance: "Player [name] has been quiet — consider creating an opportunity for their character"
- The 15% threshold is hardcoded (not a setting)
- Weighting is invisible to the DM — no separate UI indicator, just influences suggestion content
- Speaker names come from the speakerMap (already mapped from SPEAKER_00 → player names)
- Only applies when 3+ speakers are active (with 2 speakers, 50/50 is expected DM/player split)

### Claude's Discretion
- Exact wording of scene-type-specific prompt sections
- How to structure the off-track detection within the existing AI prompt format
- Whether to use a single combined prompt or separate prompt sections for each feature
- Loading/transition animations for on-demand query cards

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUG-04 | DM can type a question in the panel and receive a direct AI answer (on-demand query) | `handleManualRulesQuery` is the exact pattern to mirror. Intent detection splits rules vs. general queries at the input handler in `MainPanel._onRender`. |
| SUG-05 | Suggestion prompts adapt to current scene type (narration, combat, social, exploration) | `PromptBuilder._sceneType` is already set via `setSceneType()`. `buildSystemPrompt()` already has a `sceneSection` stub. Expand the stub into per-scene guidance blocks. |
| SUG-06 | AI detects when players go off-track from the adventure and offers recovery suggestions | `offTrackStatus` exists in `buildAnalysisMessages` response schema. `_lastOffTrackStatus` stored in SessionOrchestrator. Add consecutive cycle counter + recovery card callback. |
| SUG-07 | AI uses speaker participation data to weight suggestions (surface opportunities for quiet players) | `SessionAnalytics.getSpeakerStats()` returns `percentage` per speaker. Inject into PromptBuilder as a new system message when threshold is breached. |
</phase_requirements>

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | existing | Unit tests | Project standard, 5035 tests across 67 files |
| jsdom | existing | DOM environment for tests | Required for ApplicationV2 UI tests |

No new packages. This phase extends existing code only.

**Installation:** None required.

## Architecture Patterns

### Recommended File Structure (changes only)

```
scripts/
  narrator/
    PromptBuilder.mjs          # +getSceneTypeGuidance(), +buildQuietSpeakerGuidance()
                               # expanded buildSystemPrompt() with per-scene blocks
  orchestration/
    SessionOrchestrator.mjs    # +handleGeneralQuery(), +_consecutiveOffTrackCount
                               # +_offTrackCycleThreshold, extended _runAIAnalysis
  ui/
    MainPanel.mjs              # _onRender: intent detection before routing query
                               # +_handleRecoveryCard(), amber-tinted card DOM
templates/
  main-panel.hbs               # placeholder text change: "Ask anything..."
styles/
  vox-chronicle.css            # .vox-chronicle-recovery-card amber color token
tests/
  narrator/
    PromptBuilder.test.js      # new: getSceneTypeGuidance, buildQuietSpeakerGuidance
  orchestration/
    SessionOrchestrator.test.js # new: handleGeneralQuery, off-track cycle threshold
  ui/
    MainPanel.test.js          # new: intent detection routing, recovery card render
```

### Pattern 1: Dual-Purpose Input Routing (SUG-04)

**What:** The existing `keydown` handler on `.vox-chronicle-rules-input__field` detects intent and routes to either `handleManualRulesQuery` or `handleGeneralQuery`.

**When to use:** Any time the DM presses Enter in the panel input.

**Key insight from code reading:** The handler is at `MainPanel.mjs:686-695`. Currently it calls `this._orchestrator.handleManualRulesQuery(query)` unconditionally. The locked decision is to add keyword detection before this call.

```javascript
// Source: scripts/ui/MainPanel.mjs (current pattern, to be extended)
rulesInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    const query = e.target.value.trim();
    e.target.value = '';
    this._rulesInputValue = '';

    // Intent detection (new in Phase 8)
    if (this._isRulesQuery(query)) {
      this._orchestrator.handleManualRulesQuery(query);
    } else {
      this._orchestrator.handleGeneralQuery(query);
    }
  }
}, { signal });

// Intent detection helper (new method)
_isRulesQuery(query) {
  const lower = query.toLowerCase();
  return /\b(rule|rules|dc|saving throw|how does|modifier for|spell slot|mechanic)\b/.test(lower);
}
```

### Pattern 2: handleGeneralQuery (mirrors handleManualRulesQuery)

**What:** SessionOrchestrator method that calls AIAssistant with the user's question as primary prompt, streams the response as a suggestion card.

**When to use:** When intent detection determines the input is a general DM query.

```javascript
// Source: modeled on SessionOrchestrator.handleManualRulesQuery (lines 2137-2174)
async handleGeneralQuery(question) {
  if (!this._aiAssistant?.isConfigured()) {
    this._logger.warn('General query ignored — AIAssistant not configured');
    if (this._callbacks.onStreamComplete) {
      this._callbacks.onStreamComplete({ type: 'reference', content: '(AI not available)', streamId: Date.now() });
    }
    return;
  }

  const streamId = Date.now();
  // Notify UI to create a streaming card (same as auto-suggestion)
  this._callbacks.onStreamToken?.({ token: '', accumulated: '', streamId });

  try {
    const contextText = this._buildContextText(); // existing helper
    const messages = this._aiAssistant._promptBuilder.buildGeneralQueryMessages(question, contextText);
    const streamResult = await this._aiAssistant._makeChatRequestStreaming(messages, {
      onToken: (accumulated) => {
        this._callbacks.onStreamToken?.({ token: '', accumulated, streamId });
      },
      signal: this._shutdownController?.signal
    });
    const type = this._detectSuggestionType(streamResult.text);
    this._callbacks.onStreamComplete?.({ type, content: streamResult.text, streamId });
  } catch (err) {
    this._logger.warn('General query failed:', err.message);
    this._callbacks.onStreamComplete?.({ type: 'reference', content: '(Query failed)', streamId, error: true });
  }
}
```

### Pattern 3: Scene-Type Guidance (SUG-05)

**What:** Replace the single-line `sceneSection` in `buildSystemPrompt()` with a method that returns structured, scene-specific guidance paragraphs.

**Current code (PromptBuilder.mjs:288-291):**
```javascript
const sceneSection =
  this._sceneType && this._sceneType !== 'unknown'
    ? `\n\nCURRENT SCENE TYPE: ${this._sceneType}. Adapt your suggestions to this context...`
    : '';
```

**Extended pattern:**
```javascript
// New method on PromptBuilder
getSceneTypeGuidance(sceneType) {
  const guidance = {
    combat: `SCENE TYPE — COMBAT:
Lead your first suggestion with tactical options for the current encounter.
Structure: (1) Initiative-aware action for the most threatened character, (2) Enemy ability or weakness from journal if present, (3) Environmental hazard or terrain feature the DM can invoke.
Badge: "action" type preferred.`,

    social: `SCENE TYPE — SOCIAL:
Lead your first suggestion with an NPC dialogue hook grounded in the journal.
Structure: (1) Specific line the NPC might say consistent with their motivation, (2) Persuasion/deception opportunity with stakes, (3) Faction or relationship dynamic the DM can surface.
Badge: "dialogue" type preferred.`,

    exploration: `SCENE TYPE — EXPLORATION:
Lead your first suggestion with an environmental detail or discovery opportunity.
Structure: (1) Specific sensory description from the journal location, (2) Perception/Investigation trigger with hidden element, (3) Lore drop or foreshadowing seed from the next chapter.
Badge: "narration" type preferred.`,

    rest: `SCENE TYPE — REST:
Lead your first suggestion with a downtime or character moment opportunity.
Structure: (1) Character development moment (backstory hook or inter-party bond), (2) Camp event from journal if present, (3) Foreshadowing seed about upcoming danger.
Badge: "narration" type preferred.`
  };
  return guidance[sceneType] || '';
}
```

### Pattern 4: Off-Track Structured Response (SUG-06)

**What:** Extend the AI JSON schema in `buildAnalysisMessages()` to require a richer `offTrack` field, then use a consecutive-cycle counter in SessionOrchestrator to decide when to surface a recovery card.

**Current schema (PromptBuilder.mjs:350-357):**
```javascript
// offTrackStatus: {"isOffTrack": boolean, "severity": 0.0-1.0, "reason": "..."}
```

**Extended schema (new field name to avoid confusion):**
```json
{
  "offTrack": {
    "detected": false,
    "severity": "none|minor|moderate|severe",
    "reason": "brief explanation",
    "recoveryHook": "specific journal reference to bring them back"
  }
}
```

**Consecutive counter pattern in SessionOrchestrator:**
```javascript
// New fields (class-level)
_consecutiveOffTrackCount = 0;
_offTrackCycleThreshold = 2;  // from CONTEXT.md: 2+ cycles

// In _runAIAnalysis, after storing _lastOffTrackStatus:
const offTrack = analysis?.offTrack;
if (offTrack?.severity === 'moderate' || offTrack?.severity === 'severe') {
  this._consecutiveOffTrackCount++;
  if (this._consecutiveOffTrackCount >= this._offTrackCycleThreshold) {
    this._callbacks.onRecoveryCard?.({
      reason: offTrack.reason,
      recoveryHook: offTrack.recoveryHook,
      severity: offTrack.severity
    });
  }
} else {
  this._consecutiveOffTrackCount = 0;  // reset on scene transition or on-track cycle
}
```

**NOTE:** The existing `offTrackStatus` field (with `isOffTrack` + float `severity`) must remain in the JSON schema unchanged for backward compatibility. The new `offTrack` field with string severity is additive.

### Pattern 5: Speaker Weighting Injection (SUG-07)

**What:** After each live cycle, query `SessionAnalytics.getSpeakerStats()`, find quiet speakers (<15% over active session), and inject a guidance note into PromptBuilder.

**SessionAnalytics API confirmed:**
- `getSpeakerStats()` → `SpeakerMetrics[]` sorted by speaking time descending
- Each entry has `speakerId: string`, `percentage: number` (0-100), `speakingTime: number`
- `percentage` is already calculated as fraction of total session speaking time

**PromptBuilder addition (new setter + message in buildAnalysisMessages):**
```javascript
// New setter
setQuietSpeakers(quietSpeakers) {
  // quietSpeakers: [{name: string, percentage: number}]
  this._quietSpeakers = quietSpeakers || [];
}

// In buildAnalysisMessages variable components (priority: after NPC profiles, before next-chapter)
if (this._quietSpeakers.length > 0) {
  const names = this._quietSpeakers.map(s => s.name).join(', ');
  variableComponents.push({
    key: 'quiet-speakers',
    message: {
      role: 'system',
      content: `PLAYER ENGAGEMENT NOTE:\n${names} ${this._quietSpeakers.length === 1 ? 'has' : 'have'} spoken less than 15% of session time. In your next suggestion, create a natural opportunity for ${this._quietSpeakers.length === 1 ? 'their character' : 'their characters'} to act, react, or speak — grounded in the current scene.`
    }
  });
}
```

**Orchestrator injection point (in `_runAIAnalysis`, before calling analyzeContext):**
```javascript
if (this._sessionAnalytics && this._aiAssistant) {
  const stats = this._sessionAnalytics.getSpeakerStats();
  const activeSpeakers = stats.filter(s => s.speakingTime > 0);
  if (activeSpeakers.length >= 3) {
    const quiet = activeSpeakers
      .filter(s => s.percentage < 15)
      .map(s => ({ name: s.speakerId, percentage: s.percentage }));
    this._aiAssistant._promptBuilder.setQuietSpeakers(quiet);
  } else {
    this._aiAssistant._promptBuilder.setQuietSpeakers([]);
  }
}
```

**NOTE:** `speakerId` in SessionAnalytics is the resolved speaker name (from speakerMap), not `SPEAKER_00`, because `addSegment()` is called with the labeled name after diarization mapping.

### Pattern 6: Recovery Card Rendering (SUG-06 UI)

**What:** New `onRecoveryCard` callback in SessionOrchestrator → `_handleRecoveryCard()` in MainPanel renders an amber-tinted card.

**Card structure mirrors rules card but with distinct visual treatment:**
```javascript
// In MainPanel._handleRecoveryCard(data)
_handleRecoveryCard(data) {
  if (!data) return;
  const container = this.element?.querySelector('.vox-chronicle-suggestions-list');
  if (!container) return;

  const card = document.createElement('div');
  card.classList.add('vox-chronicle-suggestion-card', 'vox-chronicle-recovery-card');
  card.innerHTML = `
    <div class="vox-chronicle-suggestion-badge vox-chronicle-badge--offtrack">Off Track</div>
    <div class="vox-chronicle-suggestion-content">${data.recoveryHook}</div>
    <button class="vox-chronicle-recovery-dismiss" data-action="dismiss-recovery">Dismiss</button>
  `;
  card.querySelector('[data-action="dismiss-recovery"]')?.addEventListener('click', () => {
    card.remove();
    this._consecutiveOffTrackCount = 0; // inform orchestrator to reset
  });
  container.prepend(card);
}
```

**CSS addition:**
```css
.vox-chronicle-recovery-card {
  border-left: 3px solid #f59e0b;   /* amber-500 */
  background: rgba(245, 158, 11, 0.08);
}
.vox-chronicle-badge--offtrack {
  background: #f59e0b;
  color: #1a1a1a;
}
```

### Pattern 7: buildGeneralQueryMessages (new PromptBuilder method)

**What:** Builds a message array for an on-demand general query — identical to `buildAnalysisMessages` flow but with the user's question as the user message, not a transcription analysis request.

```javascript
// New method on PromptBuilder
buildGeneralQueryMessages(question, ragContext) {
  const messages = [{ role: 'system', content: this.buildSystemPrompt() }];

  const context = ragContext || (this._adventureContext ? this.truncateContext(this._adventureContext) : '');
  if (context) {
    messages.push({ role: 'system', content: `ADVENTURE CONTEXT:\n${context}` });
  }

  // Inject NPC profiles and rolling summary for rich context
  if (this._npcProfiles.length > 0) {
    const npcLines = this._npcProfiles.map(p => `- **${p.name}**: ${p.personality}`).join('\n');
    messages.push({ role: 'system', content: `ACTIVE NPCs:\n${npcLines}` });
  }
  if (this._rollingSummary) {
    messages.push({ role: 'system', content: `SESSION HISTORY:\n${this._rollingSummary}` });
  }

  messages.push({ role: 'user', content: question });
  return messages;
}
```

### Anti-Patterns to Avoid

- **Separate API call for off-track detection:** The locked decision embeds detection in the existing `analyzeContext()` prompt. Do NOT add a `detectOffTrack()` call in `_runAIAnalysis`.
- **New setting for 15% threshold:** Hardcode it. The CONTEXT.md explicitly says "not a setting — would clutter the settings panel."
- **Checking `_liveMode` for general query:** `handleGeneralQuery` must work in idle/chronicle modes too — the input is always visible. Check `this._aiAssistant?.isConfigured()` instead.
- **Replacing `offTrackStatus` schema:** The existing `offTrackStatus` key must remain for backward compat. Add `offTrack` as a NEW top-level field in the JSON schema.
- **Accumulating quiet speaker data in PromptBuilder:** PromptBuilder must not own analytics state. Orchestrator queries analytics and calls `setQuietSpeakers()` before each analysis cycle.
- **AbortController missing on general query stream:** Thread `this._shutdownController?.signal` through to `_makeChatRequestStreaming` — same pattern as streaming suggestions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Intent detection routing | NLP classifier | Simple keyword regex | Rules queries have clear vocabulary; regex is sufficient and fast |
| Scene guidance text | Dynamic AI prompt generation | Static strings per scene type | Static strings are predictable, testable, and cost-free |
| Speaker participation tracking | Custom time tracker | `SessionAnalytics.getSpeakerStats()` | Already tracks `percentage`, `speakingTime` per speaker |
| Off-track card dismissal | Complex state machine | Simple DOM remove + counter reset | The counter is the only state that needs resetting |
| Streaming general query | New streaming protocol | `_makeChatRequestStreaming` + existing callbacks | All streaming infrastructure is Phase 6 |

**Key insight:** Every piece of infrastructure this phase needs already exists. The work is wiring, not building.

## Common Pitfalls

### Pitfall 1: offTrack vs offTrackStatus Schema Collision

**What goes wrong:** Changing the AI response schema key from `offTrackStatus` to `offTrack` breaks `_parseAnalysisResponse()` and any downstream code reading `analysis.offTrackStatus`.

**Why it happens:** The CONTEXT.md calls the new field `offTrack` with string severity, but the existing code uses `offTrackStatus` with float severity.

**How to avoid:** Keep `offTrackStatus` in the schema (existing code path). Add `offTrack` as an additional field with the new shape. `_parseAnalysisResponse()` reads both; off-track recovery logic uses `offTrack`, existing severity check uses `offTrackStatus`.

**Warning signs:** Test `_parseAnalysisResponse` fails on existing offTrackStatus fixture data.

### Pitfall 2: Speaker Percentage Not Calculated Without calculateMetrics

**What goes wrong:** `getSpeakerStats()` calls `_calculateMetrics()` internally, but `percentage` is only up-to-date after this call. If you read `_speakerMetrics` directly, percentages may be stale.

**Why it happens:** SessionAnalytics uses a lazy `_metricsDirty` flag — metrics are recalculated only when a summary or stats are explicitly requested.

**How to avoid:** Always call `getSpeakerStats()` (public, recalculates) never `getCurrentMetrics()` (shallow copy, may be stale) for the participation check.

**Warning signs:** Percentages always 0% in quiet-speaker detection.

### Pitfall 3: Streaming Race on handleGeneralQuery

**What goes wrong:** If the DM submits a query while a live cycle is already streaming, two streams compete for the same `onStreamToken` callback, producing garbled card content.

**Why it happens:** `onStreamToken` and `onStreamComplete` are global callbacks with no stream ID multiplexing guard on the card creation side.

**How to avoid:** Use the existing `streamId = Date.now()` pattern that `_runAIAnalysis` already uses (confirmed at `SessionOrchestrator.mjs:1997`). MainPanel's `_handleStreamToken` already keys on `streamId`. Verify the general query path passes a distinct `streamId`.

**Warning signs:** Two cards appear or one card shows tokens from both streams interleaved.

### Pitfall 4: Scene Guidance Inflates Token Budget

**What goes wrong:** Each scene guidance block is ~80-120 tokens in the system prompt. Adding all four blocks regardless of scene doubles the system prompt size and eats into the variable context budget.

**Why it happens:** PromptBuilder's budget calculation at line 372 counts `systemPromptContent` tokens as fixed overhead. If the system prompt grows significantly, remaining budget for adventure context shrinks.

**How to avoid:** `getSceneTypeGuidance()` returns guidance for ONE scene type only (the active one), not all four. The system prompt gets at most one guidance block. Verify the budget math still holds with a 120-token addition.

**Warning signs:** Adventure context gets dropped from messages more often than before.

### Pitfall 5: Quiet Speaker Reset After Session End

**What goes wrong:** `setQuietSpeakers([])` is not called when live mode stops. Stale quiet-speaker guidance from the previous session leaks into post-session queries.

**Why it happens:** PromptBuilder state is reset by `AIAssistant.resetSession()` which clears conversation history and rolling summary, but does NOT clear `_quietSpeakers` (a new field).

**How to avoid:** Add `this._promptBuilder.setQuietSpeakers([])` to `AIAssistant.resetSession()` alongside the other resets.

**Warning signs:** General queries after session end still include the engagement note.

### Pitfall 6: Recovery Card Duplicate on Re-Render

**What goes wrong:** When MainPanel re-renders (tab switch, state change), recovery cards created in the DOM are lost. Simultaneously, `_consecutiveOffTrackCount` is still ≥ 2, so the next cycle immediately fires another recovery card, causing a flash.

**Why it happens:** Recovery cards are not stored in instance state the way suggestion cards and rules cards are.

**How to avoid:** Store recovery cards in `this._recoveryCards = []` on the MainPanel instance, parallel to `this._rulesCards`. Reconstruct them in `_onRender` from stored data, same pattern as rules cards (confirmed at `MainPanel.mjs:666-676`).

**Warning signs:** Recovery card disappears on tab switch then immediately reappears.

## Code Examples

### Verified: SessionAnalytics.getSpeakerStats() return shape

```javascript
// Source: scripts/narrator/SessionAnalytics.mjs:356-359
getSpeakerStats() {
  this._calculateMetrics();
  return Object.values(this._speakerMetrics).sort((a, b) => b.speakingTime - a.speakingTime);
}
// Returns: SpeakerMetrics[] where each entry has:
// { speakerId, speakingTime, segmentCount, avgSegmentDuration, percentage, firstSpeakTime, lastSpeakTime }
// percentage is 0-100 (percent of total session speaking time)
```

### Verified: handleManualRulesQuery pattern to mirror

```javascript
// Source: scripts/orchestration/SessionOrchestrator.mjs:2137-2174
async handleManualRulesQuery(question) {
  if (!this._rulesLookupService) {
    // graceful degradation: emit unavailable card
    if (this._callbacks.onRulesCard) {
      this._callbacks.onRulesCard({ topic: question, unavailable: true, source: 'manual' });
    }
    return;
  }
  try {
    const result = await this._rulesLookupService.lookup(question, { skipCooldown: true });
    if (result && this._callbacks.onRulesCard) {
      this._callbacks.onRulesCard({ topic: result.question || question, ...result, source: 'manual' });
    }
  } catch (err) {
    this._logger.warn('Manual rules query failed:', err.message);
    if (this._callbacks.onRulesCard) {
      this._callbacks.onRulesCard({ topic: question, unavailable: true, source: 'manual' });
    }
  }
}
```

### Verified: PromptBuilder variable component budget pattern (for quiet speakers injection)

```javascript
// Source: scripts/narrator/PromptBuilder.mjs:380-463
// Variable components processed in priority order, dropped if over budget.
// Quiet speakers goes AFTER npc-profiles (lower priority) and BEFORE next-chapter:
variableComponents.push({
  key: 'quiet-speakers',   // new key
  message: { role: 'system', content: `PLAYER ENGAGEMENT NOTE:\n...` }
});
// Already-proven budget check loop at line 444 handles it automatically.
```

### Verified: Streaming card pattern in _runAIAnalysis

```javascript
// Source: scripts/orchestration/SessionOrchestrator.mjs:1988-2010
// streamId is Date.now() — used to key the specific card in MainPanel
const streamResult = await this._aiAssistant.generateSuggestionsStreaming(contextText, {
  onToken: (accumulated) => {
    if (this._liveMode && this._callbacks.onStreamToken) {
      this._callbacks.onStreamToken({ token: '', accumulated, streamId });
    }
  },
  signal: this._shutdownController?.signal,
  maxSuggestions: 3
});
const type = this._detectSuggestionType(streamResult.text);
// ... onStreamComplete fires to finalize card
```

### Verified: Rules input wiring to extend

```javascript
// Source: scripts/ui/MainPanel.mjs:680-705
const rulesInput = this.element?.querySelector('.vox-chronicle-rules-input__field');
if (rulesInput) {
  rulesInput.value = this._rulesInputValue || '';
  rulesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const query = e.target.value.trim();
      // CURRENTLY: unconditionally calls handleManualRulesQuery
      // PHASE 8: add _isRulesQuery(query) check here
      this._orchestrator.handleManualRulesQuery(query);
    }
  }, { signal });
}
```

### Verified: PromptBuilder.buildSystemPrompt() scene stub to expand

```javascript
// Source: scripts/narrator/PromptBuilder.mjs:288-291
const sceneSection =
  this._sceneType && this._sceneType !== 'unknown'
    ? `\n\nCURRENT SCENE TYPE: ${this._sceneType}. Adapt your suggestions to this context...`
    : '';
// PHASE 8: Replace with: `\n\n${this.getSceneTypeGuidance(this._sceneType)}`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Off-track: separate API call | Embedded in analyzeContext JSON schema | Phase 8 decision | No extra API cost |
| Scene type: one-liner hint | Per-scene structured guidance blocks | Phase 8 | Measurably different suggestion structure per scene |
| Input: rules-only | Dual-purpose: rules + general query | Phase 8 | DM can query freely at any time |
| Speaker data: tracked but unused | Injected into prompt as engagement nudge | Phase 8 | Quiet player detection without UI clutter |

**Deprecated/outdated:**
- The single-line sceneSection stub in buildSystemPrompt is replaced (not removed — refactored in place).
- `offTrackSensitivity` setting is now actually read in Phase 8 (it was registered but not applied to off-track detection thresholds).

## Open Questions

1. **Does `speakerId` in SessionAnalytics reflect resolved speaker names or raw SPEAKER_00 IDs?**
   - What we know: `addSegment()` is called from `_runAIAnalysis` with segments from the live transcript. The live transcript's speaker labels are mapped before storage.
   - What's unclear: The exact call site where speaker labels are applied before `addSegment()`.
   - Recommendation: Verify in SessionOrchestrator._runAIAnalysis that it calls `this._sessionAnalytics.addSegment(segment)` with segments already resolved via speakerMap. If not, resolve before injecting into PromptBuilder.

2. **Off-track consecutive counter reset on scene transition**
   - What we know: CONTEXT.md says "Off-track state resets when SceneDetector detects a new scene transition."
   - What's unclear: SceneDetector fires transitions via `analyzeContext().sceneInfo.isTransition`. This is only set in the non-streaming path.
   - Recommendation: In `_runAIAnalysis`, check `analysis?.sceneInfo?.isTransition === true` and reset `_consecutiveOffTrackCount = 0` when it fires.

3. **Token budget impact of scene guidance**
   - What we know: System prompt overhead is calculated at line 372 before variable component budget allocation. Adding 120 tokens to the system prompt reduces adventure context budget by 120 tokens.
   - What's unclear: Whether this is meaningful at the 12000 token budget with typical adventure content.
   - Recommendation: Measure the token impact of the largest scene guidance block using the `_estimateTokens()` heuristic and log a warning if system prompt overhead > 20% of total budget.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing, version in package.json) |
| Config file | vitest.config.js (existing) |
| Quick run command | `npm test -- --reporter=verbose tests/narrator/PromptBuilder.test.js tests/orchestration/SessionOrchestrator.test.js tests/ui/MainPanel.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUG-04 | `_isRulesQuery()` correctly classifies rules vs. general | unit | `npm test -- tests/ui/MainPanel.test.js` | ✅ (extend) |
| SUG-04 | `handleGeneralQuery()` streams card and fires onStreamComplete | unit | `npm test -- tests/orchestration/SessionOrchestrator.test.js` | ✅ (extend) |
| SUG-04 | `buildGeneralQueryMessages()` includes chapter and NPC context | unit | `npm test -- tests/narrator/PromptBuilder.test.js` | ✅ (extend) |
| SUG-05 | `getSceneTypeGuidance('combat')` contains tactical content | unit | `npm test -- tests/narrator/PromptBuilder.test.js` | ✅ (extend) |
| SUG-05 | `buildSystemPrompt()` includes scene guidance when sceneType set | unit | `npm test -- tests/narrator/PromptBuilder.test.js` | ✅ (extend) |
| SUG-06 | Off-track counter increments on moderate/severe, resets on none/minor | unit | `npm test -- tests/orchestration/SessionOrchestrator.test.js` | ✅ (extend) |
| SUG-06 | Recovery card fires only after 2+ consecutive moderate/severe cycles | unit | `npm test -- tests/orchestration/SessionOrchestrator.test.js` | ✅ (extend) |
| SUG-07 | `setQuietSpeakers()` adds engagement note to messages when <15% speaker | unit | `npm test -- tests/narrator/PromptBuilder.test.js` | ✅ (extend) |
| SUG-07 | Quiet speaker check skips when fewer than 3 active speakers | unit | `npm test -- tests/orchestration/SessionOrchestrator.test.js` | ✅ (extend) |

### Sampling Rate

- **Per task commit:** `npm test -- tests/narrator/PromptBuilder.test.js tests/orchestration/SessionOrchestrator.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (5035+ tests) before `/gsd:verify-work`

### Wave 0 Gaps

None — all test files exist. New tests are additions to existing describe blocks.

## Sources

### Primary (HIGH confidence)

- Direct code reading of `scripts/narrator/PromptBuilder.mjs` — confirmed setSceneType(), buildSystemPrompt() scene stub, variable component budget loop
- Direct code reading of `scripts/orchestration/SessionOrchestrator.mjs` — confirmed handleManualRulesQuery pattern, _detectSuggestionType, _lastOffTrackStatus storage, _runAIAnalysis flow
- Direct code reading of `scripts/narrator/AIAssistant.mjs` — confirmed _makeChatRequestStreaming, _syncPromptBuilderState, _promptBuilder.setSceneType delegation
- Direct code reading of `scripts/narrator/SessionAnalytics.mjs` — confirmed getSpeakerStats() API, percentage field, _calculateMetrics lazy pattern
- Direct code reading of `scripts/ui/MainPanel.mjs` — confirmed rules input wiring at line 680, _handleRulesCard pattern, re-render recovery for rules cards

### Secondary (MEDIUM confidence)

- `08-CONTEXT.md` — all locked decisions treated as authoritative product specifications
- `STATE.md` accumulated decisions — confirmed sceneType flow from SceneDetector → orchestrator._currentSceneType

### Tertiary (LOW confidence)

None — all claims verified against source code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing
- Architecture: HIGH — all patterns verified against actual source code line numbers
- Pitfalls: HIGH — discovered by tracing code paths, not speculation

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable codebase, no external API changes)
