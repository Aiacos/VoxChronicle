# TODO - VoxChronicle

Aggiornato il 2026-03-15 (v4.0.3 session audit).

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
- [ ] `MainPanel.mjs:593` — `synthesisPromise` nulled on re-render; rules card synthesis silently lost during tab switch
- [x] `main.mjs:229` — `game.settings.get()` in journal hook handler without try/catch; throws during module teardown

### HIGH — From Silent Failure Hunt

- [x] `NPCProfileExtractor.mjs:170` — `extractProfiles()` returns empty Map on failure; caller cannot distinguish "no NPCs" from "extraction crashed"
- [x] `EntityProcessor.mjs:253` — `getExistingKankaEntities()` swallows fetch errors and returns `[]`; now notifies user that deduplication was skipped
- [ ] `ImageProcessor.mjs:148` — `generateImages()` returns `[]` on catastrophic failure; caller cannot distinguish "no images needed" from "API crashed"
- [x] `SessionOrchestrator.mjs:1377` — `_enrichSessionWithJournalContext()` swallows errors; now records to session errors array for publishing awareness

### HIGH — From Predictive Analysis

- [x] `SessionOrchestrator.mjs:1995` — Non-streaming AI analysis not aborted on `stopLiveMode`; in-flight API calls continue after shutdown
- [ ] `AudioRecorder.mjs:263` — `_peerConnections` is a private Foundry internal API; will break silently on any v13.x patch that renames it
- [ ] `AudioRecorder.mjs:370` — `_audioChunks` array grows unbounded during long recordings; memory pressure on 4+ hour sessions

### MEDIUM — From Predictive Analysis

- [ ] `SessionOrchestrator.mjs:19` — `MAX_LIVE_SEGMENTS=100` loses context after ~3 minutes of active speech; AI suggestions miss earlier context
- [ ] `SessionAnalytics.mjs:288` — `_segments` array unbounded; no trimming for long sessions
- [ ] `CacheManager.mjs:299` — `_trim()` sorts full Map on every write; O(n log n) per cache insert
- [ ] `SessionOrchestrator.mjs:1858` — O(n) string prepend in hot AI analysis path; consider pre-building context string
- [ ] `AudioRecorder.mjs:521` — Timeout path skips `clearPersistedChunks()`; stale IndexedDB chunks served as recovery data on next load
- [ ] `RollingSummarizer.mjs:95` — Returns old summary on failure with no failure counter; unbounded context growth

### MEDIUM — From Security Scan

- [ ] `speaker-labeling.hbs:111` — Triple-brace `{{{ }}}` renders unescaped i18n strings; XSS if translation files compromised
- [ ] `MainPanel.mjs:1591` — `game.i18n.localize()` values in `innerHTML` not escaped; same i18n vector

### LOW — Cost/Safety

- [x] `SessionOrchestrator.mjs:2271` — `_getCostCap()` silently defaulted to $5 on settings read failure; now logs warning

## V4.0.2 DEEP REVIEW — 2026-03-14

6-agent parallel review: code quality, silent failures, architecture, security, credentials, injection.

### CRITICAL — Fixed

- [x] `SessionOrchestrator.mjs:991,992,1134,1135` — `_openaiClient` does not exist on AIAssistant (should be `_chatProvider`). RollingSummarizer and NPCProfileExtractor never initialized in live mode.
- [x] `SessionOrchestrator.mjs:119` — `_lastAISuggestions` initialized to `null` instead of `[]`, streaming suggestions lost when pushed before first AI cycle
- [x] `MainPanel.mjs:1677` — i18n string not escaped in innerHTML (XSS via malicious language pack)

### HIGH — Silent Failures (from review agents)

- [ ] `KankaService.mjs:1328-1331` — `searchEntities` catch returns `[]`, masking API errors as "no duplicates found"; creates duplicate entities
- [ ] `SessionOrchestrator.mjs:511-517` — Entity extraction failure transitions entire session to ERROR; transcription result lost
- [ ] `SessionOrchestrator.mjs:476-478` — Image generation failure transitions entire session to ERROR; same issue
- [ ] `AudioRecorder.mjs:313-318` — WebRTC mixed-stream fallback silently records mic-only; user unaware peers not captured
- [ ] `SessionOrchestrator.mjs:325-353` — `onSessionEnd` fires in `finally` even after incomplete/failed stop
- [ ] `AudioRecorder.mjs:520` — `_mediaRecorder` can be null when `stopRecording` assigns `.onstop` (race with `cancel()`)

### HIGH — Architecture (from review agents)

- [ ] `TranscriptionProcessor.mjs:16` — Layer violation: orchestration imports UI (`SpeakerLabeling`); extract static methods to a utility service
- [ ] `ResilienceRegistry.mjs` — Defined but never instantiated or used (dead infrastructure)
- [ ] `SessionStateMachine.mjs` — Defined but never instantiated or used (dead infrastructure)
- [ ] `StreamController.mjs` — Exported but never imported (dead code)

### MEDIUM — Error Handling

- [ ] `VoxChronicle.mjs:476-483` — `_getSetting` returns null for all errors, including critical settings like API keys
- [ ] `OpenAIClient.mjs:919-921` — SSE parse errors logged at debug only; stream yields nothing with no user feedback
- [ ] `SessionOrchestrator.mjs:1253-1256` — `clearAllCache()` on single journal re-index forces spurious full re-index of all journals

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
- [ ] `MainPanel.mjs` — 1758 LOC; `_rulesCards`, `_rulesDismissTimeouts`, `_lastAISuggestions` arrays grow unbounded during long sessions

### MEDIUM — Existing (carried forward)

- [ ] `KankaClient.mjs:370` — Error messages from Kanka API not sanitized before use in exceptions
- [ ] `VoxChronicle.mjs:175` — reinitialize() failure only logged, user not notified

### LOW — CSS Namespace (carried forward from v3.2.5)

- [ ] `speaker-labeling.hbs` — 21 CSS classes without `vox-chronicle-` prefix
- [ ] `entity-preview.hbs` — 57 CSS classes without `vox-chronicle-` prefix
- [ ] `relationship-graph.hbs` — 24 CSS classes without `vox-chronicle-` prefix
- [ ] `vocabulary-manager.hbs` — 33 CSS classes without `vox-chronicle-` prefix
- [ ] `analytics-tab.hbs` — 48 CSS classes without `vox-chronicle-` prefix
- [ ] `journal-picker.hbs` — 31 CSS classes without `vox-chronicle-` prefix

### LOW — Performance (carried forward)

- [ ] `RelationshipGraph.mjs:295` — O(n*m) per-type filter; replace with single-pass count

---

## V3.2.5 AUDIT — 2026-02-27

4-agent parallel scan: CSS namespace, security, error handling, performance.

### HIGH — CSS Namespace (214 un-prefixed classes across 6 templates)

- [ ] `speaker-labeling.hbs` — 21 classi CSS senza prefisso `vox-chronicle-` (form-description, speaker-row, btn-clear, etc.)
- [ ] `entity-preview.hbs` — 57 classi CSS senza prefisso `vox-chronicle-` (preview-description, entity-row, section-header, etc.)
- [ ] `relationship-graph.hbs` — 24 classi CSS senza prefisso `vox-chronicle-` (graph-error, graph-toolbar, legend-item, etc.)
- [ ] `vocabulary-manager.hbs` — 33 classi CSS senza prefisso `vox-chronicle-` (vocabulary-description, terms-list, term-item, etc.)
- [ ] `analytics-tab.hbs` — 48 classi CSS senza prefisso `vox-chronicle-` (analytics-section, stat-item, speaker-list, etc.)
- [ ] `journal-picker.hbs` — 31 classi CSS senza prefisso `vox-chronicle-` (picker-header, folder-tree, journal-item, etc.)

### MEDIUM — Security & Error Handling

- [ ] `KankaClient.mjs:370` — Error messages from Kanka API not sanitized before use in exceptions (MITM risk)
- [ ] `VoxChronicle.mjs:175` — reinitialize() failure only logged, user not notified via ui.notifications

### LOW — Performance

- [ ] `RelationshipGraph.mjs:295` — O(n*m) per-type filter; replace with single-pass count

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

- [ ] `AIAssistant.mjs` — God Object ridotto da 2076 a 1601 righe tramite estrazione SilenceMonitor e PromptBuilder, candidato per ulteriore decomposizione (suggestion, dialogue, scene analysis)
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
