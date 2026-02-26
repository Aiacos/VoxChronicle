# TODO - VoxChronicle

Audit del codebase eseguito il 2026-02-07. Aggiornato il 2026-02-26 (v3.1.7 audit).

## V3.1.7 AUDIT — 2026-02-26

Audit completo con 4 agenti paralleli: security, performance, error handling, code quality.

### CRITICAL — Fix prima del prossimo rilascio

- [ ] `KankaPublisher.mjs:179` — `_uploadSessionImages()` chiamato ma mai definito (crash a runtime)
- [ ] `EntityExtractor.mjs:187,257,343` — Null-check su `response.choices[0].message.content` (aggiunto inline)
- [ ] `ImageGenerationService.mjs:212` — Null-check su `response.data[0]` (aggiunto inline)
- [ ] `LocalWhisperService.mjs:634` — Bare catch swallowed errors (fix inline: ora logga warning)
- [ ] `WhisperBackend.mjs:475` — Bare catch swallowed errors (fix inline: ora logga debug)
- [ ] `OpenAIClient.mjs:306` — Bare catch swallowed errors (fix inline: ora logga debug)
- [ ] `RAGFlowProvider.mjs:633` — Nessun timeout/AbortController — request pende indefinitamente
- [ ] `main-panel.hbs:170` — XSS via `{{{chronicleDraft}}}` triple-stache (sanitizzare HTML)

### HIGH — Performance e Error Handling

- [ ] `AudioRecorder.mjs:454` — Pre-allocare `Uint8Array` nel `getAudioLevel()` (120 alloc/sec)
- [ ] `AudioRecorder.mjs:800` — rAF loop continua a 60fps durante pausa (usare setTimeout)
- [ ] `MainPanel.mjs:93` — `onProgress` chiama `this.render()` senza debounce (200+ re-render durante RAG index)
- [ ] `MainPanel.mjs:113` — `onProgress` non re-registrato quando orchestrator cambia
- [ ] `MainPanel.mjs:125` — `resetInstance()` non chiama `close()` — rAF orfano continua
- [ ] `MainPanel.mjs:341` — `_debouncedRender.cancel()` mancante in `close()`
- [ ] `VoxChronicle.mjs:127` — `reinitialize()` non pulisce AudioContext/MediaStream/SilenceDetector
- [ ] `VoxChronicle.mjs:502` — `getServicesStatus()` chiama `game.settings.get` 3x per render (cache necessaria)
- [ ] `SessionOrchestrator.mjs:1056` — `_liveTranscript` cresce senza limiti (cap con sliding window)
- [ ] `ErrorNotificationHelper.mjs` — 218 righe mai importate in produzione (adottare o rimuovere)
- [ ] `VoxChronicle.mjs:323` — `_checkKankaTokenExpiration()` definito ma mai chiamato
- [ ] `ImageGenerationService.mjs:432` — Image cache failure silenziosa (URL scade in 60min)
- [ ] `ImageGenerationService.mjs:536` — Gallery load errore swallowed (utente perde immagini)
- [ ] `OpenAIFileSearchProvider.mjs:128` — RAG state persistence failure silenziosa (costi extra)
- [ ] `TranscriptionService.mjs:216` — Vocabulary dictionary failure silenziosa (transcription degradata)
- [ ] `AudioRecorder.mjs:517` — Microphone enumeration: distinguere "no mic" da "permission denied"

### MEDIUM — Security e Code Quality

- [ ] `JournalParser.mjs:985` — Usare `DOMParser` invece di `innerHTML`
- [ ] `Settings.mjs:38,53,517` — API keys come `<input type="text">` (usare password field)
- [ ] `RelationshipGraph.mjs:530` — Pinnare versione vis-network CDN + aggiungere SRI hash
- [ ] `Settings.mjs:126,507` — Validare URL server (Whisper/RAGFlow) con allowlist scheme
- [ ] `KankaPublisher.mjs:496` — `_isEntityInJournal` ritorna sempre `true` (dead validation)
- [ ] `main.mjs:254` — Settings tool usa `onChange` invece di `onClick` (bug v13 API)
- [ ] `VoxChronicle.mjs:45` — `static instance` publico (usare `#instance` privato)
- [ ] `SessionAnalytics.mjs:29` — Logger module-level `const log` invece di `this._logger`
- [ ] `EntityExtractor.mjs:374` — `Promise.all` in `extractAll()` perde errori (usare `allSettled`)
- [ ] `KankaService.mjs:448` — `preFetchEntities` con `Promise.all` (usare `allSettled`)

### LOW — Cleanup

- [ ] `DomUtils.mjs:88` — `throttle` esportato ma mai importato
- [ ] `AudioChunker.mjs:284` — `_combineBlobs` async ma fa solo `new Blob()` sincrono
- [ ] `OpenAIClient.mjs:573` — `_addToHistory` usa `slice` invece di `shift`
- [ ] `RelationshipGraph.mjs:385` — Export anchor non aggiunto al DOM prima di `.click()`
- [ ] `Logger.mjs:297` — Sanitizzazione disabilitata di default su tutti `createChild()`

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
