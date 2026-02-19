# TODO - VoxChronicle

Audit del codebase eseguito il 2026-02-07. Aggiornato il 2026-02-19.

## V3.0 REWRITE PLAN

Piano completo: `docs/plans/2026-02-19-v3-rewrite-plan.md`

### RAG: Sostituzione sistema RAG custom con OpenAI File Search
- [ ] Creare interfaccia `RAGProvider` (scripts/rag/RAGProvider.mjs)
- [ ] Creare `OpenAIFileSearchProvider` (scripts/rag/OpenAIFileSearchProvider.mjs)
- [ ] Creare `RAGProviderFactory` (scripts/rag/RAGProviderFactory.mjs)
- [ ] Aggiornare `AIAssistant.mjs` per usare RAGProvider
- [ ] Aggiornare `SessionOrchestrator.mjs` per usare RAGProviderFactory
- [ ] Aggiornare `Settings.mjs` (rimuovere vecchi setting RAG, aggiungere nuovi)
- [ ] Scrivere test per nuovo RAG
- [ ] Eliminare vecchi file: EmbeddingService.mjs, RAGVectorStore.mjs, RAGRetriever.mjs

### UI: Fix memory leak in tutti i 5 componenti
- [ ] MainPanel.mjs — AbortController + CSS-only tab switching
- [ ] EntityPreview.mjs — AbortController per checkbox listeners
- [ ] SpeakerLabeling.mjs — AbortController per form submit listener
- [ ] RelationshipGraph.mjs — AbortController + CDN loading guard + vis-network cleanup
- [ ] VocabularyManager.mjs — AbortController + XSS fix in dialog HTML
- [ ] Scrivere test di regressione per memory leak

### Workflow: Semplificazione
- [ ] Ridurre `maxImagesPerSession` default a 3
- [ ] ImageProcessor genera solo immagini di scena (non ritratti entita')
- [ ] KankaPublisher focalizzato su journal entries

### Test: Riscrittura completa con coverage totale
- [ ] Eliminare TUTTI i test esistenti (3600+ test attuali sono accoppiati all'implementazione vecchia)
- [ ] Riscrivere test per ogni modulo da zero con target 100% coverage
- [ ] Test RAG: RAGProvider, OpenAIFileSearchProvider, RAGProviderFactory
- [ ] Test UI: AbortController cleanup, memory leak regression per tutti i 5 componenti
- [ ] Test Audio: AudioRecorder, AudioChunker, SilenceDetector
- [ ] Test AI: OpenAIClient, TranscriptionService, TranscriptionFactory, ImageGenerationService, EntityExtractor
- [ ] Test Narrator: AIAssistant, ChapterTracker, CompendiumParser, JournalParser, RulesReference, SceneDetector, SessionAnalytics
- [ ] Test Kanka: KankaClient, KankaService, KankaEntityManager, NarrativeExporter
- [ ] Test Orchestration: SessionOrchestrator (dual-mode), TranscriptionProcessor, EntityProcessor, ImageProcessor, KankaPublisher
- [ ] Test Utils: Logger, RateLimiter, AudioUtils, SensitiveDataFilter, HtmlUtils, CacheManager, DomUtils, ErrorNotificationHelper
- [ ] Test Core: VoxChronicle singleton, Settings, VocabularyDictionary
- [ ] Test Integration: full session flow (live + chronicle)
- [ ] Configurare Vitest coverage reporter (istanbul/v8) con soglia minima
- [ ] Aggiungere coverage check in CI (fail se < 95%)

### Documentazione
- [x] Scrivere piano v3.0 (docs/plans/2026-02-19-v3-rewrite-plan.md)
- [x] Aggiornare CLAUDE.md con architettura attuale
- [x] Aggiornare CHANGELOG.md con sezione [Unreleased]
- [x] Aggiornare TODO.md con piano v3.0
- [ ] Riscrivere ARCHITECTURE.md (completamente obsoleto)
- [ ] Aggiornare API_REFERENCE.md (mancano servizi narrator, RAG, utilities)

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
