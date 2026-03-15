# TODO - VoxChronicle

Updated 2026-03-15 (v4.0.3 session 2: review + predictive analysis).

## V4.0.3 SESSION 2 — 2026-03-15

Code review (3 agents), security delta scan, predictive analysis.

### HIGH — Fixed This Session

- [x] `OpenAIClient.mjs:907` — SSE parse error counter never resets between streams; permanently silences logging after 3 errors across all streams
- [x] `SessionOrchestrator.mjs:2258` — `appendSuggestion` unbounded growth on streaming path; no cap applied (now capped at 50)
- [x] `SessionOrchestrator.mjs:2250` — `getAISuggestions()` returns null after reset, breaking "safe public API" contract (now returns `[]`)
- [x] `MainPanel.mjs:1768` — `source` param in `_createStreamingCard` not wrapped in `escapeHtml()` (security scan finding)
- [x] `AudioRecorder.mjs:379` — `_audioChunks` capped at 500 silently truncated chronicle audio past ~80 min; increased to 5000 (~13 hours)
- [x] `SessionOrchestrator.mjs:1780` — `_currentSession.errors` unbounded growth during API failures (now capped at 100)

### MEDIUM — Fixed This Session

- [x] `main.mjs:241` — Empty `catch {}` swallowed all errors in journal cache invalidation + RAG re-index (now logs)
- [x] `MainPanel.mjs:120,1733` — Empty `catch { /* */ }` blocks with zero logging on settings read/write (now logs)
- [x] `SpeakerUtils.mjs:25` — `knownSpeakers` setting grows without bound across sessions (now capped at 200)
- [x] `AudioRecorder.mjs:325` — Mixed stream fallback uses `warn` severity; should be `error` since user explicitly requested mixed mode
- [x] `MainPanel.mjs:1607` — `_rulesDismissTimeouts` stale ID accumulation; fired IDs now self-remove

### HIGH — Open (Predictive Analysis, Architectural)

- [ ] `SessionOrchestrator.mjs:1703` — `_fullTranscriptText` grows without bound; 3-hour session = ~160KB text → entity extraction may hit context window limits
- [ ] `AudioRecorder.mjs:264` — WebRTC private API `_peerConnections` will break on Foundry v14 (private property rename)
- [ ] `CostTracker.mjs:30` — Hardcoded pricing will go stale within 6-12 months; missing Anthropic/Google provider pricing
- [ ] `SessionOrchestrator.mjs:1727` — Cost cap only covers AI suggestions, not transcription; transcription continues past user-configured cap
- [ ] `AIAssistant.mjs:2198` — Fire-and-forget summarization can lose turns during rapid speech if eviction outpaces summarization
- [ ] `SessionOrchestrator.mjs` — 2218 LOC, 24 catch blocks; candidate for decomposition into RecordingOrchestrator/ProcessingOrchestrator/LiveModeOrchestrator
- [ ] `AIAssistant.mjs` — 2027 LOC; god object, known since v3.0.4 audit

### MEDIUM — Open (Predictive Analysis)

- [ ] `SessionAnalytics.mjs:384` — `getTimeline()` is O(n × buckets) at 10,000-segment scale; should be cached with dirty-flag
- [ ] `KankaEntityManager.mjs:70` — `_searchCache` is a bare Map with no eviction; should use CacheManager
- [ ] `SessionOrchestrator.mjs:1330` — `reindexJournal` recursive async drain; should be iterative for large journal sets
- [ ] Session state non-persistent: page reload loses current session state

### LOW — Acceptable Risk (Security)

- [ ] `esbuild/vite/vitest` chain — 7 moderate vulnerabilities, requires vitest v4 upgrade (breaking, dev-only)
- [ ] `templates/main-panel.hbs:286` — Triple-brace `{{{chronicleDraft}}}` for rendered HTML (sanitized upstream)
- [ ] `GoogleChatProvider.mjs:64` — Google API key in URL query param (Google's required pattern)

## V4.0.3 SESSION AUDIT — 2026-03-15

Security scan, code review, predictive analysis, silent failure hunt.

### CRITICAL — Fixed This Session

- [x] `SessionOrchestrator.mjs:1622` — `_currentCyclePromise` race: IIFE nulled the field in `finally` before `stopLiveMode`'s `Promise.race` could observe it, causing premature shutdown of in-flight API calls
- [x] `AIAssistant.mjs:1937` — RAG failure notification used `=== 3` instead of `>= 3`; only the 3rd failure ever notified the user, 4th+ were silent again
- [x] `AnthropicChatProvider.mjs:62` — AbortSignal listener leak: `addEventListener('abort')` without `{ once: true }` caused listener accumulation
- [x] `GoogleChatProvider.mjs:60` — Same AbortSignal listener leak as AnthropicChatProvider
- [x] `Logger.mjs:264-278` — `trace()`, `assert()`, `dir()` bypassed `SensitiveDataFilter`, potentially logging API keys unredacted

### HIGH — From Code Review

- [x] `SessionOrchestrator.mjs:521` — `extractAll()` not wrapped in try/catch; API error crashed entire session instead of continuing with transcription-only results
- [x] `SessionOrchestrator.mjs:732` — `setServices()` reinitializes processors while a session is active; swaps `_transcriptionProcessor` mid-use
- [x] `MainPanel.mjs:1542` — UI mutates orchestrator's `_lastAISuggestions` directly; push can fail silently if array nulled during teardown
- [x] `OpenAIClient.mjs:916` — Stream timeout cleared on header receipt; hung SSE stream has no deadline, blocks `_runAIAnalysis` forever
- [x] `MainPanel.mjs:593` — `synthesisPromise` nulled on re-render; now passes `synthesisUnavailable` flag to card handler
- [x] `main.mjs:229` — `game.settings.get()` in journal hook handler without try/catch; throws during module teardown

### HIGH — From Silent Failure Hunt

- [x] `NPCProfileExtractor.mjs:170` — `extractProfiles()` returns empty Map on failure; caller cannot distinguish "no NPCs" from "extraction crashed"
- [x] `EntityProcessor.mjs:253` — `getExistingKankaEntities()` swallows fetch errors and returns `[]`; now notifies user that deduplication was skipped
- [x] `ImageProcessor.mjs:148` — `generateImages()` now throws on catastrophic failure; caller wraps in try/catch
- [x] `SessionOrchestrator.mjs:1377` — `_enrichSessionWithJournalContext()` swallows errors; now records to session errors array for publishing awareness

### HIGH — From Predictive Analysis

- [x] `SessionOrchestrator.mjs:1995` — Non-streaming AI analysis not aborted on `stopLiveMode`; in-flight API calls continue after shutdown
- [x] `AudioRecorder.mjs:263` — `_peerConnections` now has fallback to public `peerConnections` property
- [x] `AudioRecorder.mjs:370` — `_audioChunks` capped at 500 entries; older chunks persisted to IndexedDB

### MEDIUM — From Predictive Analysis

- [x] `SessionOrchestrator.mjs:19` — `MAX_LIVE_SEGMENTS` increased from 100 to 500 (~15-20 min context)
- [x] `SessionAnalytics.mjs:288` — `_segments` capped at 10000 entries
- [x] `CacheManager.mjs:299` — `_trim()` cleaned up; sort only runs when eviction is actually needed (infrequent)
- [x] `SessionOrchestrator.mjs:1858` — Context building rewritten: forward iteration with array join instead of O(n) string prepend
- [x] `AudioRecorder.mjs:521` — Timeout path now calls `clearPersistedChunks()` before cleanup
- [x] `RollingSummarizer.mjs:95` — Added consecutive failure counter with user notification after 3 failures

### MEDIUM — From Security Scan

- [x] `speaker-labeling.hbs:111` — Triple-brace `{{{ }}}` replaced with `{{ }}` (auto-escaped); i18n strings are plain text
- [x] `MainPanel.mjs:1591` — All `game.i18n.localize()` values in `innerHTML` now wrapped in `escapeHtml()`

### LOW — Cost/Safety

- [x] `SessionOrchestrator.mjs:2271` — `_getCostCap()` silently defaulted to $5 on settings read failure; now logs warning

## V4.0.2 DEEP REVIEW — 2026-03-14

6-agent parallel review: code quality, silent failures, architecture, security, credentials, injection.

### CRITICAL — Fixed

- [x] `SessionOrchestrator.mjs:991,992,1134,1135` — `_openaiClient` does not exist on AIAssistant (should be `_chatProvider`). RollingSummarizer and NPCProfileExtractor never initialized in live mode.
- [x] `SessionOrchestrator.mjs:119` — `_lastAISuggestions` initialized to `null` instead of `[]`, streaming suggestions lost when pushed before first AI cycle
- [x] `MainPanel.mjs:1677` — i18n string not escaped in innerHTML (XSS via malicious language pack)

### HIGH — Silent Failures (from review agents)

- [x] `KankaService.mjs:1328-1331` — `searchEntities` per-type catch is by design (partial results from other types still returned)
- [x] `SessionOrchestrator.mjs:511-517` — Entity extraction already wrapped in try/catch (fixed in v4.0.3 commit 1)
- [x] `SessionOrchestrator.mjs:476-478` — Image generation already wrapped in try/catch (fixed in v4.0.3 commit 3)
- [x] `AudioRecorder.mjs:313-318` — WebRTC fallback now notifies user that only mic audio is being recorded
- [x] `SessionOrchestrator.mjs:325-353` — `onSessionEnd` moved out of `finally` block; only fires on successful stop
- [x] `AudioRecorder.mjs:520` — `_mediaRecorder` null guard added before `.onstop` assignment

### HIGH — Architecture (from review agents)

- [x] `TranscriptionProcessor.mjs:16` — Layer violation fixed: extracted addKnownSpeakers/applyLabelsToSegments to `utils/SpeakerUtils.mjs`
- [x] `ResilienceRegistry.mjs` — Removed: dead infrastructure never imported in production code
- [x] `SessionStateMachine.mjs` — Removed: dead infrastructure never imported in production code
- [x] `StreamController.mjs` — Removed: dead code never imported (recoverable from git history)

### MEDIUM — Error Handling

- [x] `VoxChronicle.mjs:476-483` — `_getSetting` now logs error (not warn) for critical settings (openaiApiKey, kankaApiToken, kankaCampaignId)
- [x] `OpenAIClient.mjs:919-921` — SSE parse errors now logged at warn level (first 3 occurrences)
- [x] `SessionOrchestrator.mjs:1253-1256` — `reindexJournal` now uses `clearCache(journalId)` instead of `clearAllCache()`

---

## V4.0.1 SESSION AUDIT — 2026-03-14

Security scan, code review, predictive analysis, and test suite validation.

### HIGH — Bugs

- [x] `module.json:62` — Download URL points to v4.0.0 but version is 4.0.1; Foundry installs stale ZIP — fixed
- [x] `package.json:33-36` — Repository URL still says `your-username` instead of `Aiacos` — fixed
- [x] `package.json:53` — Foundry minimum compatibility said "11" but module.json says "13" — fixed

### HIGH — Dependency Vulnerabilities (dev-only)

- [x] `flatted` — Unbounded recursion DoS (GHSA-25h7-pfq9-p65f) — fixed via npm audit fix
- [x] `minimatch` — ReDoS via wildcards (GHSA-3ppc-4f35-3m26) — fixed via npm audit fix
- [x] `rollup` — Arbitrary file write via path traversal (GHSA-mw96-cpmx-2vgc) — fixed via npm audit fix
- [ ] `esbuild/vite/vitest` chain — 7 moderate vulnerabilities, requires vitest v4 upgrade (breaking)

### MEDIUM — Complexity Hotspots (from predictive analysis)

- [ ] `SessionOrchestrator.mjs` — 2218 LOC, 24 catch blocks; candidate for decomposition
- [ ] `AIAssistant.mjs` — 2027 LOC; god object, known since v3.0.4 audit
- [x] `MainPanel.mjs` — `_rulesCards` capped at 50; `_lastAISuggestions` managed via `appendSuggestion()` on orchestrator; `_rulesDismissTimeouts` cleared on close/reset

### MEDIUM — Existing (carried forward)

- [x] `KankaClient.mjs:370` — Already uses `escapeHtml()` on error messages (verified in audit)
- [x] `VoxChronicle.mjs:175` — `reinitialize()` now shows `ui.notifications.error` on failure

### LOW — CSS Namespace (carried forward from v3.2.5)

- [x] `speaker-labeling.hbs` — CSS classes prefixed with `vox-chronicle-`
- [x] `entity-preview.hbs` — CSS classes prefixed with `vox-chronicle-`
- [x] `relationship-graph.hbs` — Already fully prefixed (verified)
- [x] `vocabulary-manager.hbs` — CSS classes prefixed with `vox-chronicle-`
- [x] `analytics-tab.hbs` — Already fully prefixed (verified)
- [x] `journal-picker.hbs` — CSS classes prefixed with `vox-chronicle-`

### LOW — Performance (carried forward)

- [x] `RelationshipGraph.mjs:295` — Already uses single-pass Map counting (verified in audit)

---

## V3.2.5 AUDIT — 2026-02-27

4-agent parallel scan: CSS namespace, security, error handling, performance.

### HIGH — CSS Namespace (214 un-prefixed classes across 6 templates)

- [x] CSS namespace: all templates now use `vox-chronicle-` prefix (12 classes renamed across 4 templates, 2 already clean)

### MEDIUM — Security & Error Handling

- [x] `KankaClient.mjs:370` — Already uses escapeHtml() (verified in v4.0.3 audit)
- [x] `VoxChronicle.mjs:175` — reinitialize() now shows ui.notifications.error (fixed in v4.0.3)

### LOW — Performance

- [x] `RelationshipGraph.mjs:295` — Already uses single-pass Map counting (verified in audit)

---

## V3.2.4 AUDIT — 2026-02-27

Audit con scan automatico: stub detection, CSS namespace, i18n, architectural debt.

### CRITICAL — Stub Methods (non-functional features)

- [x] `RulesReference.mjs` — `loadRules()` implementato con compendium integration (v3.2.5)
- [x] `RulesReference.mjs` — `searchRules()` implementato con full-text search index (v3.2.5)
- [x] `RulesReference.mjs` — `getRuleById()` implementato con cache lookup + recent tracking (v3.2.5)
- [x] `RulesReference.mjs` — `getRecentRules()` implementato con MRU pattern (v3.2.5)
- [x] `RulesReference.mjs` — `getCategories()` implementato con set-based deduplication (v3.2.5)
- [x] `RulesReference.mjs` — `getRulesByCategory()` implementato con case-insensitive filter (v3.2.5)

### HIGH — Missing Features & CSS Namespace

- [x] `KankaPublisher.mjs` — `_uploadSessionImages()` implementato: blob/base64/URL → Kanka API (v3.2.5)
- [x] `recorder.hbs` + `vox-chronicle.css` — 40+ classi CSS prefissate con `vox-chronicle-` (v3.2.5)

### MEDIUM — Architectural Debt & Minor Issues

- [x] `AIAssistant.mjs` — (duplicate of entry above, already tracked)
- [x] `main-panel.hbs` — Classe `danger` rinominata a `vox-chronicle-btn--danger` (v3.2.5)
- [x] `main.mjs` — Timer debounce cleanup via `closeSettingsConfig` hook (v3.2.5)
- [ ] Session state non persistente: ricaricare la pagina perde lo stato della sessione corrente

### LOW — Dead Code & Cleanup

- [x] `ErrorNotificationHelper.mjs` — Gia' rimosso in v3.1.9 (entry stale)

---

## V3.1.7 AUDIT — 2026-02-26

Audit completo con 4 agenti paralleli: security, performance, error handling, code quality.

### CRITICAL — Fix prima del prossimo rilascio

- [x] `KankaPublisher.mjs:179` — `_uploadSessionImages()` chiamato ma mai definito (disabilitato, v3.1.8)
- [x] `EntityExtractor.mjs:187,257,343` — Null-check su `response.choices[0].message.content` (v3.1.8)
- [x] `ImageGenerationService.mjs:212` — Null-check su `response.data[0]` (v3.1.8)
- [x] `LocalWhisperService.mjs:634` — Bare catch ora logga warning (v3.1.8)
- [x] `WhisperBackend.mjs:475` — Bare catch ora logga debug (v3.1.8)
- [x] `OpenAIClient.mjs:306` — Bare catch ora logga debug (v3.1.8)
- [x] `RAGFlowProvider.mjs:633` — AbortController 30s timeout (v3.1.8)
- [x] `main-panel.hbs:170` — XSS fixato con `sanitizeHtml()` (v3.1.8)

### HIGH — Performance e Error Handling

- [x] `AudioRecorder.mjs:454` — Pre-allocato `Uint8Array` (v3.1.8)
- [x] `AudioRecorder.mjs:800` — setTimeout 250ms durante pausa (v3.1.8)
- [x] `MainPanel.mjs:93` — onProgress usa `_debouncedRender()` (v3.1.8)
- [x] `MainPanel.mjs:113` — onProgress re-registrato su getInstance() (v3.1.8)
- [x] `MainPanel.mjs:125` — resetInstance() con cleanup completo (v3.1.8)
- [x] `MainPanel.mjs:341` — `_debouncedRender.cancel()` in close() (v3.1.8)
- [x] `VoxChronicle.mjs:127` — reinitialize() cleanup servizi (v3.1.8)
- [x] `VoxChronicle.mjs:502` — settings cache con invalidation hook (v3.1.8)
- [x] `SessionOrchestrator.mjs:1056` — Accettato: ~2MB/4h, AI windowing gestisce (v3.1.8)
- [x] `ErrorNotificationHelper.mjs` — Rimosso: dead code mai importato (v3.1.9)
- [x] `VoxChronicle.mjs:323` — Aggiunta chiamata in initialize() (v3.1.9)
- [x] `ImageGenerationService.mjs:432` — Cache failure ora notifica utente (v3.1.9)
- [x] `ImageGenerationService.mjs:536` — Gallery load ora notifica utente (v3.1.9)
- [x] `OpenAIFileSearchProvider.mjs:128` — RAG state failure ora notifica utente (v3.1.9)
- [x] `TranscriptionService.mjs:216` — Già fixato: logga warning (pre-v3.1.8)
- [x] `AudioRecorder.mjs:517` — Distingue NotAllowedError da altri errori (v3.1.9)

### MEDIUM — Security e Code Quality

- [x] `JournalParser.mjs:985` — DOMParser invece di innerHTML (v3.1.8)
- [x] `Settings.mjs:38,53,517` — CSS `-webkit-text-security: disc` maschera API keys (v3.1.9)
- [x] `RelationshipGraph.mjs:530` — vis-network pinnato a v9.1.9 (v3.1.8)
- [x] `Settings.mjs:126,507` — Validazione URL con allowlist http/https (v3.1.9)
- [x] `KankaPublisher.mjs:496` — `_isEntityInJournal` rimosso (dead code) (v3.1.9)
- [x] `main.mjs:254` — onClick per settings tool (v3.1.8)
- [x] `VoxChronicle.mjs:45` — `static #instance` privato + `resetInstance()` (v3.1.9)
- [x] `SessionAnalytics.mjs:29` — `this._logger` nell'istanza invece di `const log` (v3.1.9)
- [x] `EntityExtractor.mjs:374` — `Promise.allSettled` con fallback graceful (v3.1.9)
- [x] `KankaService.mjs:448` — `Promise.allSettled` con log errori parziali (v3.1.9)

### LOW — Cleanup

- [x] `DomUtils.mjs:88` — `throttle` rimosso: dead code mai importato (v3.1.9)
- [x] `AudioChunker.mjs:284` — Rimosso `async` da `_combineBlobs` sincrono (v3.1.9)
- [x] `OpenAIClient.mjs:573` — `shift()` in-place invece di `slice` con riassegnazione (v3.1.9)
- [x] `RelationshipGraph.mjs:385` — Anchor aggiunto al DOM prima di `click()` (v3.1.9)
- [x] `Logger.mjs:297` — Sanitizzazione abilitata su OpenAIClient e KankaClient (v3.1.9)

---

## V3.0 REWRITE — ✅ COMPLETED (2026-02-19)

Piano completo: `docs/plans/2026-02-19-v3-rewrite-plan.md`

### RAG: Sostituzione sistema RAG custom con OpenAI File Search + RAGFlow
- [x] Creare interfaccia `RAGProvider` (scripts/rag/RAGProvider.mjs)
- [x] Creare `OpenAIFileSearchProvider` (scripts/rag/OpenAIFileSearchProvider.mjs)
- [x] Creare `RAGProviderFactory` (scripts/rag/RAGProviderFactory.mjs)
- [x] Creare `RAGFlowProvider` (scripts/rag/RAGFlowProvider.mjs) — self-hosted RAGFlow support
- [x] Aggiornare `AIAssistant.mjs` per usare RAGProvider
- [x] Aggiornare `SessionOrchestrator.mjs` per usare RAGProviderFactory
- [x] Aggiornare `Settings.mjs` (rimuovere vecchi setting RAG, aggiungere nuovi + RAGFlow settings)
- [x] Scrivere test per nuovo RAG (RAGProvider, OpenAIFileSearchProvider, RAGFlowProvider, RAGProviderFactory)
- [x] Eliminare vecchi file: EmbeddingService.mjs, RAGVectorStore.mjs, RAGRetriever.mjs

### UI: Fix memory leak in tutti i 5 componenti
- [x] MainPanel.mjs — AbortController + CSS-only tab switching
- [x] EntityPreview.mjs — AbortController per checkbox listeners
- [x] SpeakerLabeling.mjs — AbortController per form submit listener
- [x] RelationshipGraph.mjs — AbortController + CDN loading guard + vis-network cleanup
- [x] VocabularyManager.mjs — AbortController + XSS fix in dialog HTML
- [x] Scrivere test di regressione per memory leak

### Workflow: Semplificazione
- [x] Ridurre `maxImagesPerSession` default a 3
- [x] ImageProcessor genera solo immagini di scena (non ritratti entita')
- [x] KankaPublisher focalizzato su journal entries

### Test: Riscrittura completa con coverage totale
- [x] Eliminare TUTTI i test esistenti (3600+ test attuali)
- [x] Riscrivere test per ogni modulo da zero — **46 file, 3742 test**
- [x] Configurare Vitest v8 coverage con soglie: 90% stmts, 85% branches, 90% funcs, 90% lines
- [x] Coverage raggiunta: **95.16% stmts, 89.64% branches, 97.5% funcs, 95.16% lines**

### Documentazione
- [x] Scrivere piano v3.0 (docs/plans/2026-02-19-v3-rewrite-plan.md)
- [x] Aggiornare CLAUDE.md con architettura attuale
- [x] Aggiornare CHANGELOG.md con entry v3.0.0
- [x] Aggiornare TODO.md con piano v3.0
- [x] Riscrivere ARCHITECTURE.md (aggiornato per v3.0 RAG, layer corretti, file eliminati rimossi)
- [x] Aggiornare API_REFERENCE.md (aggiunta documentazione RAGProvider, rimossi EmbeddingService/RAGVectorStore)

---

## ALL CRITICAL AND WARNING ITEMS RESOLVED

### C1. Setting `kankaApiTokenCreatedAt` non registrato - ✅ FIXED
Risolto in `Settings.mjs` - setting registrato con `scope: 'world'`, `config: false`.

### C2. Chiavi di localizzazione mancanti - ✅ FIXED
Tutte le chiavi aggiunte in tutti i file lingua.

### C3. `console.log` diretto invece di Logger - ✅ FIXED
Tutti i `console.log` diretti sostituiti con Logger in `main.mjs`, `VoxChronicle.mjs`, e `Settings.mjs`.
L'unico file con `console.*` diretto e' `Logger.mjs` (corretto - e' il wrapper).

### W1. Dipendenza circolare `MODULE_ID` - ✅ FIXED (v1.2.1)
Risolto con `scripts/constants.mjs`.

### W2. Icone Font Awesome inconsistenti - ✅ FIXED (v1.2.2)
Tutte le occorrenze `fas fa-*` sostituite con `fa-solid fa-*`.

### W3. `ApiKeyValidator.mjs` non integrato - ✅ RESOLVED (v2.2.11)
File rimosso in v2.2.11 (dead code cleanup). La validazione API e' gestita da `Settings.mjs`.

### I1. File non documentati in CLAUDE.md - ✅ FIXED
### I2. Setting di relazioni non documentati - ✅ FIXED

## Dead Code Cleanup - ✅ COMPLETED (v2.2.11)
- ~1,130 righe CSS morte rimosse (~40% del foglio di stile)
- 4 file sorgente inutilizzati rimossi (ApiKeyValidator, CompendiumSearcher, RecorderControls, KankaRelationshipManager)
- 4 file di test corrispondenti rimossi
- Export inutilizzati rimossi da SensitiveDataFilter e TranscriptionProcessor
- Totale: ~7,080 righe rimosse in 15 file

## INFO - NOTE DI COMPATIBILITA' v13

### I3. Uso di jQuery (deprecato in v13) - ✅ FIXED (v2.3.0)
Tutti i 5 componenti UI migrati da jQuery a vanilla JS (querySelector, querySelectorAll, .value, .dataset, .checked).
Zero `$(...)`, `html.find(...)`, `.val()`, `.each()`, `.is()`, `.prop()` nel codice sorgente.
Dialog v1 callbacks convertiti con pattern `(html[0] ?? html).querySelector(...)`.

### I4. Classi Application/FormApplication legacy - ✅ FIXED (v2.3.0)
Tutti i 5 componenti UI migrati da Application/FormApplication v1 a ApplicationV2 + HandlebarsApplicationMixin:
- MainPanel, RelationshipGraph, EntityPreview, SpeakerLabeling, VocabularyManager
- `static get defaultOptions()` → `static DEFAULT_OPTIONS` + `static PARTS`
- `getData()` → `async _prepareContext(options)`
- `activateListeners(html)` → `actions` map + `_onRender()`
- Compatibilita' minima aggiornata a v13 (v12 non piu' supportata)
