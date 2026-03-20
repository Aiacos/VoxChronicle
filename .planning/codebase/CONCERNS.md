# Codebase Concerns

**Analysis Date:** 2026-03-19

---

## Orphaned References Audit

### Settings Registered but Never Read

Four settings are registered in `scripts/core/Settings.mjs` but have zero `game.settings.get()` or `Settings.get()` calls anywhere in the codebase — including scripts, templates, and tests.

**`showTranscriptionModeIndicator`** (`Settings.mjs:229`)
- Registered as a user-visible setting (`config: true`). The mode badge exists in `main-panel.hbs:115` as `vox-chronicle-panel__mode-badge--{{transcriptionMode}}` but the boolean switch for showing or hiding it is never read.
- Impact: Users can toggle it, but nothing responds.
- Fix: Either read the setting in `MainPanel._prepareContext()` and conditionally include the badge, or remove the setting.

**`hasAudioRecovery`** (`Settings.mjs:309`)
- Registered as `config: false`. Intended as a crash-recovery flag. `AudioRecorder.mjs` mentions IndexedDB crash recovery but never sets or reads this flag.
- Impact: Recovery UI path is dead. The setting is vestigial from a planned but unfinished feature.
- Fix: Implement the recovery check in `scripts/audio/AudioRecorder.mjs` or remove the setting.

**`pendingSessions`** (`Settings.mjs:451`)
- Registered as `config: false` (internal storage). Intended to queue sessions waiting for Kanka publishing. No code reads or writes this setting.
- Impact: Session persistence across reloads (tracked in TODO.md) cannot be implemented without this — but the setting is already registered. The array storage is ready but unused.
- Fix: Wire `KankaPublisher.mjs` to use this setting when queuing failed publishes, or remove if the feature is deferred.

**`panelPosition`** (`Settings.mjs:794`)
- Registered as `config: false`. `panelCollapsed` is read/written at `MainPanel.mjs:126,1856`, but `panelPosition` (the drag position) is never read or written.
- Impact: Panel position resets on reload. Companion setting `panelCollapsed` works correctly.
- Fix: Read on `MainPanel` init and write on drag-end, or remove the setting.

### Settings Read but Missing Provider Key Localization

Three AI provider settings registered in `Settings.mjs` (lines 75–118) reference localization keys that do not exist in `lang/en.json`:

- `VOXCHRONICLE.Settings.AIProviderSuggestions` / `AIProviderSuggestionsHint` — missing
- `VOXCHRONICLE.Settings.AIProviderRules` / `AIProviderRulesHint` — missing
- `VOXCHRONICLE.Settings.AIProviderExtraction` / `AIProviderExtractionHint` — missing

These settings are used at `scripts/core/VoxChronicle.mjs:527–529`. Foundry's settings UI will display the raw key string instead of a label.

### Localization Keys Used in Code but Missing from en.json

Five keys are referenced in production code/templates but absent from `lang/en.json`. Foundry falls back to displaying the raw key string.

| Key | Location | Fallback String |
|-----|----------|-----------------|
| `VOXCHRONICLE.Live.StartSession` | `templates/main-panel.hbs:154` | "VOXCHRONICLE.Live.StartSession" |
| `VOXCHRONICLE.SummaryAgeBadge` | `scripts/ui/MainPanel.mjs:492` | "AI thinking..." (hardcoded fallback) |
| `VOXCHRONICLE.Warnings.DeduplicationSkipped` | `scripts/orchestration/EntityProcessor.mjs:257` | hardcoded English |
| `VOXCHRONICLE.Warnings.SummarizationDegraded` | `scripts/narrator/RollingSummarizer.mjs:106` | hardcoded English |
| `VOXCHRONICLE.Warnings.WebRTCMixingFailed` | `scripts/audio/AudioRecorder.mjs:325` | hardcoded English |

Note: `VOXCHRONICLE.Live.Status.` and `VOXCHRONICLE.RelationshipType.` appear as partial strings in the scan because they are dynamic key roots (e.g., `Live.Status.${state}`). The full forms (`Live.Status.Idle`, `Live.Status.Live`, `Live.Status.Analyzing`, and all `RelationshipType.*` values) are present in `en.json`.

### Localization Keys in en.json Never Referenced

`lang/en.json` contains **1,102 keys**. Only **462** unique key strings are referenced anywhere in scripts or templates. The remaining **654** entries appear orphaned. The most significant orphan groups by category:

- **`Settings.*` (57 keys)**: Legacy alternative key names (e.g., `Settings.ApiQueueMaxSizeName`, `Settings.DebugModeName`) that were renamed when the settings were registered with different keys. The live settings use `Settings.ApiQueueMaxSize`, `Settings.DebugMode`, etc.
- **`Errors.*` (71 keys)**: Many error strings never localized — code uses hardcoded English fallbacks in `catch` blocks. The keys exist in `en.json` but are never passed to `game.i18n.localize()`.
- **`Panel.*` (48 keys)**, **`RelationshipGraph.*` (57 keys)**, **`RAG.*` (49 keys)**: Large groups of keys that were added ahead of feature implementation or are remnants of earlier UI iterations.
- **`Accessibility.*` (5 keys)**, **`Buttons.*` (12 keys)**, **`Cache.*` (4 keys)**: Utility groups with no usage.

This is a maintenance burden — translators translate dead strings. Consider a periodic key-sweep to remove unused keys from all 8 lang files.

### Template Files Not Referenced in Any PARTS Definition

Two template files exist in `templates/` but are not referenced in any `static PARTS` definition in any UI class:

**`templates/recorder.hbs`**
- No script imports it. `MainPanel.mjs` PARTS uses `main-panel.hbs` and `parts/transcript-review.hbs` only.
- The recording controls appear to be inlined inside `main-panel.hbs` rather than as a separate part.
- Impact: Dead file. Changes to it have no effect at runtime.

**`templates/analytics-tab.hbs`**
- No script imports it. Analytics content is rendered inline within `main-panel.hbs`.
- Impact: Dead file.

Both files appear to be stubs from an earlier architectural approach where each tab would be a separate PART. The current implementation consolidates everything into `main-panel.hbs`.

### CSS Classes in vox-chronicle.css Never Used in Templates or Scripts

All 36 "orphaned" CSS classes found by static analysis are actually applied dynamically via Handlebars interpolation (e.g., `vox-chronicle-badge--{{currentSceneType}}`) or JavaScript template literals (e.g., `` `vox-chronicle-status-badge--${statusState}` ``). Static grep cannot detect these patterns.

**Confirmed dynamic usage:**
- `.vox-chronicle-badge--{combat,exploration,rest,social,unknown}` — applied via `{{currentSceneType}}` in `main-panel.hbs:22`
- `.vox-chronicle-status-badge--{idle,live,analyzing}` — applied at `MainPanel.mjs:1418`
- `.vox-chronicle-panel__mode-badge--{api,auto,local}` — applied via `{{transcriptionMode}}` in `main-panel.hbs:115`
- `.vox-chronicle-rag-status__badge--{disabled,indexed,indexing,ready}` — applied via `{{ragStatus}}` in `main-panel.hbs:222`
- `.vox-chronicle-transcript-review__speaker--color-{0..7}` — applied via `{{colorIndex}}` in `transcript-review.hbs:20`
- `.vox-chronicle-suggestion__type--{action,dialogue,narration}` — applied via `${escapeHtml(type)}` in `MainPanel.mjs:1888`
- `.vox-chronicle-stream--{active,complete}` — applied via JS in `MainPanel.mjs`

**Truly orphaned** (not applied anywhere):
- `.vox-chronicle-panel__footer` — defined in CSS but no template has a `.vox-chronicle-panel__footer` element
- `.vox-chronicle-service-health--{healthy,degraded,down}` — defined in CSS but the service health badge class interpolation was removed

---

## TODO.md vs Reality

### Still-Valid Open Items

The following items from `TODO.md` are confirmed open with matching code:

**HIGH:**
- `SessionOrchestrator.mjs:1703` — `_fullTranscriptText` grows without bound. Confirmed: there is a simple string append (`+=`) at line 1703 with no length cap. A 3-hour session accumulates ~160KB. Entity extraction at session end passes this full text to the OpenAI API.
- `AudioRecorder.mjs:264` — WebRTC private API `_peerConnections`. Confirmed: the fallback at line 264 reads `client?._peerConnections ?? client?.peerConnections`. Still fragile on Foundry v14.
- `CostTracker.mjs:30` — Hardcoded pricing. Confirmed: `PRICING` map at line 31–34 has no Anthropic or Google pricing entries. Anthropic/Google usage is tracked but cost is silently skipped.
- `SessionOrchestrator.mjs:1727` — Cost cap covers AI suggestions only. Confirmed: transcription happens at line 1663 before the cost cap check at line 1727. Transcription cost accumulates past user-configured cap.
- `AIAssistant.mjs:2198` — Fire-and-forget summarization race. Confirmed: `.summarize()` call is not awaited at line 2212. Eviction proceeds immediately; if rapid speech triggers multiple evictions before the first summarization completes, earlier turns are discarded from `_rollingSummary`.
- `SessionOrchestrator.mjs` — 2,354 LOC as of current file. 24+ catch blocks. Candidate for decomposition.
- `AIAssistant.mjs` — 2,230 LOC. God object pattern acknowledged since v3.0.4 audit.

**MEDIUM:**
- `SessionAnalytics.mjs:384` — `getTimeline()` is O(n × buckets). Confirmed: nested loops at lines 384–415. At 10,000 segments with default 60s buckets it iterates ~600,000 times per call. No caching.
- `KankaEntityManager.mjs:70` — `_searchCache` is a bare `Map` with no eviction. Confirmed: `Map` at line 70, only `clear()` exists (wipes entire cache). No TTL, no max size.
- `SessionOrchestrator.mjs:1330` — `reindexJournal` recursive drain. Confirmed: `finally` block at line 1334 calls `await this.reindexJournal(queuedId)` in a loop. With large journal sets this creates deep async call stacks.
- Session state non-persistent: confirmed — no persistence mechanism exists.

### TODO Items That Reference Removed Code

- `ResilienceRegistry.mjs`, `SessionStateMachine.mjs`, `StreamController.mjs` — marked `[x]` as removed in v4.0.2. These files no longer exist, confirmed.
- `ErrorNotificationHelper.mjs` — marked `[x]` as removed in v3.1.9. Confirmed absent.

### Stale/Misleading TODO Entries

- The entry for `AudioRecorder.mjs:370` (`_audioChunks` capped at 500) was marked `[x]` as fixed, then re-opened in the same session with a new cap of 5000 (`[x]` at line 81, `[ ]` effectively re-opened at the HIGH open list at line 29 as 500→5000 fix). The current value is 5000. The TODO item is inconsistently tracked across both the fixed and open sections.

---

## Broken Import Chains

No broken import chains were found. All relative `.mjs` imports in `scripts/` resolve to existing files. The dependency graph has no circular dependencies detected by static analysis.

**Dynamic imports** (`await import(...)`) used in the following locations are also valid:
- `scripts/core/Settings.mjs:855,1113,1174` — dynamically imports `VoxChronicle.mjs`, `OpenAIClient.mjs`, `KankaClient.mjs` to avoid circular dependency during `onChange` callbacks
- `scripts/core/VoxChronicle.mjs:313,321` — lazily imports `AnthropicChatProvider.mjs`, `GoogleChatProvider.mjs` based on the active provider setting
- `scripts/main.mjs:31–32,68,85,102,454` — lazily imports UI classes on first use via scene controls

**Potential fragility:** `Settings.mjs` uses `import('./VoxChronicle.mjs')` inside `_onApiKeyChange()`. If `VoxChronicle.mjs` ever imports `Settings.mjs` (it currently does via `import { Settings } from '../core/Settings.mjs'`), this creates a runtime cycle: `Settings → VoxChronicle → Settings`. Currently safe because the dynamic import in `_onApiKeyChange` runs after module initialization is complete, but any static import of `Settings` from `VoxChronicle` would break this at load time.

---

## Security Concerns

### Unescaped HTML in Chronicle Draft

**`templates/main-panel.hbs:303`** uses triple-brace syntax `{{{chronicleDraft}}}`, which bypasses Handlebars auto-escaping:

```handlebars
{{{chronicleDraft}}}
```

`chronicleDraft` is populated via `sanitizeHtml()` at `scripts/ui/MainPanel.mjs:450`. The sanitizer (`scripts/utils/HtmlUtils.mjs:50–88`) removes `<script>`, `<iframe>`, `<form>`, event handler attributes, and `javascript:`/`data:`/`vbscript:` protocol URLs. This is intentional for rendering formatted HTML (bold, lists, etc.) from the Kanka narrative exporter.

- **Risk**: `sanitizeHtml` uses `DOMParser` + allowlist removal. It does NOT use a dedicated library like DOMPurify. Any bypass in the custom sanitizer would result in XSS. The chronicle draft content originates from AI-generated text (OpenAI API) so direct user injection is low risk, but prompt injection attacks could craft malicious HTML in AI output.
- **Mitigation**: Content is sanitized before use. Fallback is empty string on null/non-string.
- **Recommendation**: Replace the custom `sanitizeHtml` with DOMPurify if the module ever accepts user-typed content for `{{{ }}}` rendering.

### Google API Key in URL Query Parameter

**`scripts/ai/providers/GoogleChatProvider.mjs:64`** appends the API key as a URL query parameter (`?key=...`). This is Google's required authentication pattern for the Generative Language API. The key will appear in server access logs and browser network tab history.

- **Mitigation**: This is the only supported authentication method for the Google API. Noted in TODO.md as LOW/acceptable.

### Input Sanitization in Vocabulary Manager Dialog

`scripts/ui/VocabularyManager.mjs:870,879` add event listeners inside a `Dialog` render callback without using the AbortController `signal`. These listeners are scoped to the dialog's DOM elements and will be garbage-collected when the dialog closes, so there is no leak — but this is a deviation from the AbortController pattern used elsewhere.

### API Key Storage

API keys (`openaiApiKey`, `anthropicApiKey`, `googleApiKey`, `ragflowApiKey`, `kankaApiToken`) are stored in Foundry's `game.settings` system (client-scope for user keys, world-scope for Kanka token). They are not stored in source code or `.env` files. Keys are filtered from logs by `scripts/utils/SensitiveDataFilter.mjs` which is applied to `OpenAIClient` and `KankaClient`.

- **Gap**: `AnthropicChatProvider.mjs` and `GoogleChatProvider.mjs` do not wrap their HTTP clients with `SensitiveDataFilter`. If verbose logging is enabled, provider-level request construction may log the key before the client-level filter applies.

### URL Injection Prevention

`scripts/core/Settings.mjs:889–920` (`_validateServerUrl`) validates that server URLs for `whisperBackendUrl` and `ragflowBaseUrl` use only `http:` or `https:` protocols. Invalid schemes reset the setting to a safe default. This prevents `javascript:` or `file:` URLs from being stored as server endpoints.

---

## Performance Concerns

### Unbounded `_fullTranscriptText` Accumulation

- **File**: `scripts/orchestration/SessionOrchestrator.mjs:1703`
- **Problem**: `_fullTranscriptText += (text ? ' ' : '') + newText` grows indefinitely during live sessions. At approximately 100 words/minute, a 3-hour session accumulates ~160KB of text. This entire string is passed to entity extraction at session end, potentially exceeding OpenAI's context window limits for the extraction model.
- **Current cap**: None. `_liveTranscript` is capped at 500 segments (line 19), but `_fullTranscriptText` has no corresponding cap.
- **Fix approach**: Cap `_fullTranscriptText` to the last N characters or implement rolling summary truncation, similar to how `_liveTranscript` is capped.

### `SessionAnalytics.getTimeline()` O(n × buckets) Complexity

- **File**: `scripts/narrator/SessionAnalytics.mjs:380`
- **Problem**: Every call re-iterates all `_segments` (capped at 10,000) and creates bucket entries. At 10,000 segments with 60-second buckets over a 3-hour session, this is ~900 buckets × 10,000 segment iterations = ~9M operations per call. The analytics tab renders this on every tab switch.
- **Fix approach**: Cache the timeline result; invalidate on `addSegment()`.

### `KankaEntityManager._searchCache` Bare Map (No Eviction)

- **File**: `scripts/kanka/KankaEntityManager.mjs:70`
- **Problem**: `_searchCache = new Map()` grows without bound as new entity types and search queries accumulate across a session. Only `clearAll()` exists. Large campaigns with many entity types and queries will grow this map indefinitely.
- **Fix approach**: Replace with `CacheManager` (already available at `scripts/utils/CacheManager.mjs`) which has TTL and max-size eviction.

### `reindexJournal` Recursive Async Call Stack

- **File**: `scripts/orchestration/SessionOrchestrator.mjs:1330–1334`
- **Problem**: The `finally` block in `reindexJournal` processes queued journal IDs via recursive `await this.reindexJournal(queuedId)` calls inside a `for...of` loop. Each recursive call is awaited synchronously in the loop, creating nested call stacks proportional to queue depth. With a large journal set and frequent updates, this could hit stack depth limits or create long-held async chains.
- **Fix approach**: Convert to an iterative drain loop with a queue manager outside the function scope.

### requestAnimationFrame Loop Without Visibility Guard

- **File**: `scripts/ui/MainPanel.mjs:1358–1388`
- **Problem**: `_startRealtimeUpdates()` launches a `requestAnimationFrame` loop that runs continuously while recording is active. The loop unconditionally calls `requestAnimationFrame` on every frame (~60fps) even when the panel tab is in background or the Foundry window is not visible. `_stopRealtimeUpdates()` is called in `_onRender`, `close`, and `resetInstance`, but not when the panel is minimized/hidden.
- **Fix approach**: Add `document.addEventListener('visibilitychange', ...)` guard to pause/resume the RAF loop.

---

## Fragile Areas

### WebRTC Private API Access

- **File**: `scripts/audio/AudioRecorder.mjs:264`
- **Why fragile**: `game.webrtc.client._peerConnections` is a private Foundry property. The current fallback reads `client?._peerConnections ?? client?.peerConnections` (public API added in recent v13 patches), but the public `peerConnections` property is not guaranteed across all v13 builds. Foundry v14 has been noted in TODO.md as a potential breakage point.
- **Safe modification**: Test for `peerConnections` before `_peerConnections` (already done), and add a version check if Foundry exposes `game.version`.
- **Test coverage**: The WebRTC path is mocked in tests; actual v14 breakage would not be caught by the test suite.

### Fire-and-Forget Rolling Summarization Race

- **File**: `scripts/narrator/AIAssistant.mjs:2209–2224`
- **Why fragile**: Eviction from `_conversationHistory` happens synchronously before summarization completes. If multiple eviction cycles trigger before any `.summarize()` resolves, earlier turns are permanently lost without being captured in `_rollingSummary`. The error handler at line 2222 only logs; it does not restore the evicted turns.
- **Safe modification**: Queue summarization requests and process them sequentially, or avoid eviction until summarization of the previous batch completes.

### `SessionOrchestrator._currentCyclePromise` Race (Fixed)

- Previously a critical race condition. Fixed in v4.0.3 (commit noted in TODO.md). Marked here for awareness — the fix involved nulling the field in `finally` which required careful ordering with `Promise.race`.

### `MainPanel` Re-render Recovery of Streaming Cards

- **File**: `scripts/ui/MainPanel.mjs:649–680`
- **Why fragile**: On every re-render (triggered by state changes during live mode), `_onRender` reconstructs streaming cards from `_streamingAccumulatedText` and `_rulesCards` data. If a re-render is triggered mid-stream, the current streaming card is detached and recreated. The `isConnected` guard at line 1769 prevents writing to detached cards, but `_activeStreamingCard` is reset to the new card without verifying the old stream's completion status.
- **Test coverage**: Streaming card recovery is tested in isolation but not under concurrent re-render + SSE stream conditions.

---

## Scaling Limits

### Transcription Cost Past Cap

- **Current behavior**: The session cost cap (`sessionCostCap` setting) only gates AI analysis (suggestions, rules lookup). Transcription calls at `SessionOrchestrator.mjs:1663` happen before the cost check at line 1727. A session running past the configured cap continues transcribing audio indefinitely.
- **Impact**: Users who configure a $5 cap may see $10–$20 transcription bills on long sessions.
- **Fix approach**: Add a cost check before the transcription call, or document clearly that the cap applies to AI analysis only.

### Missing Provider Pricing in CostTracker

- **File**: `scripts/orchestration/CostTracker.mjs:30–34`
- **Current capacity**: Only OpenAI models are priced (`gpt-4o-mini`, `gpt-4o`, `gpt-4o-transcribe`). When Anthropic or Google providers are used via the provider settings, `addUsage()` logs a warning ("Unknown model") but records 0 cost.
- **Impact**: The cost display in the UI shows only OpenAI costs even when Anthropic/Google providers are active.
- **Fix approach**: Add pricing entries for `claude-3-5-sonnet-*`, `claude-3-haiku-*`, `gemini-2.0-flash-*` etc. and add a setting to let users update pricing.

### CostTracker Hardcoded Pricing Drift

- **File**: `scripts/orchestration/CostTracker.mjs:31–34`
- **Problem**: OpenAI pricing changes 2–3 times per year. Hardcoded rates will become inaccurate within 6–12 months.
- **Fix approach**: Pull pricing from a configurable JSON setting, or add a last-updated date to the PRICING map.

---

## Dependencies at Risk

### esbuild/vite/vitest Vulnerability Chain

- **Risk**: 7 moderate vulnerabilities in the dev toolchain (`esbuild`, `vite`, `vitest`). Requires vitest v4 upgrade which has breaking API changes.
- **Impact**: Dev-only — not shipped to end users. No production risk.
- **Migration plan**: Upgrade to vitest v4 and update test mocks. Tracked as LOW in TODO.md.

---

## Test Coverage Gaps

### WebRTC Mixed-Source Audio Path

- **Untested**: The code path in `scripts/audio/AudioRecorder.mjs` that mixes WebRTC peer streams with the microphone stream. The `_peerConnections` access and stream mixing are mocked in tests but the actual `MediaStreamTrack` merging is not exercised.
- **Risk**: Silent failure in production when Foundry's WebRTC API shape changes.
- **Priority**: Medium

### AI Provider Selection (Anthropic/Google)

- **Untested**: The full round-trip when `aiProviderSuggestions`, `aiProviderRules`, or `aiProviderExtraction` is set to `anthropic-chat` or `google-chat`. `ProviderRegistry` and per-task selection are tested in isolation but not through `SessionOrchestrator`.
- **Risk**: Provider switching silently uses default OpenAI if registry lookup fails.
- **Priority**: Medium

### Streaming Card Re-render Recovery

- **Untested**: Concurrent SSE stream + UI re-render. Only tested sequentially.
- **Files**: `scripts/ui/MainPanel.mjs:649–680`
- **Priority**: Low

### `reindexJournal` Recursive Drain Under Load

- **Untested**: Behavior when more than 2 journals are queued during a re-index operation.
- **Files**: `scripts/orchestration/SessionOrchestrator.mjs:1330`
- **Priority**: Low

---

*Concerns audit: 2026-03-19*
