# VoxChronicle v3.0 Rewrite Plan

**Date:** 2026-02-19
**Status:** Draft - Awaiting approval
**Author:** AI-assisted architecture review

## Executive Summary

VoxChronicle v3.0 replaces the custom RAG system with OpenAI's Responses API + File Search behind a modular provider interface, rewrites the UI layer to fix critical memory leaks in all 5 components, simplifies the session workflow to focus on what matters (RAG-powered DM assistance, session summaries, 2-3 images per session), and updates all documentation to reflect the current architecture.

## Motivation

1. **Custom RAG doesn't work reliably** — Brute-force cosine similarity in IndexedDB, 512-dim vectors with no scalability, complex hybrid scoring (70/20/10 semantic/keyword/recency) that's hard to tune
2. **All 5 UI components have memory leaks** — `_onRender()` adds event listeners on every render without cleanup, RelationshipGraph reloads vis-network CDN script on every render
3. **Documentation is severely outdated** — ARCHITECTURE.md still references DALL-E 3, v11/v12, RecorderControls (removed in v2.2.11), CompendiumSearcher (removed), no mention of narrator services or RAG
4. **Simplified user needs** — The actual workflow is: record session → RAG-powered live DM assistance → generate summary → generate 2-3 images → publish to Kanka

## Architecture Decision: Modular RAG

### Chosen: OpenAI Responses API + File Search

The OpenAI Responses API with the `file_search` tool replaces the entire custom RAG stack:

| Current (v2.x) | New (v3.0) |
|-----------------|------------|
| `EmbeddingService.mjs` (text-embedding-3-small, 512-dim) | Removed — File Search handles embeddings |
| `RAGVectorStore.mjs` (IndexedDB + in-memory Map, brute-force cosine) | Removed — File Search uses hosted vector store |
| `RAGRetriever.mjs` (hybrid semantic+keyword, 70/20/10 scoring) | Replaced by `RAGProvider` interface |
| Manual chunking in JournalParser/CompendiumParser | Removed — File Search auto-chunks with 800-token windows |
| ~1,200 lines of custom RAG code | ~300 lines of provider code |

**Why File Search:**
- Auto-chunking + embedding (800-token windows, 256-token overlap)
- Hosted vector store with persistence across sessions
- Built-in reranking for better relevance
- $0.10/GB/day storage, $2.50/1000 searches — negligible for RPG use
- No IndexedDB management, no brute-force search, no LRU eviction

### Modular Design for Future Providers

```
RAGProvider (interface)
├── OpenAIFileSearchProvider (default, v3.0)
├── GeminiContextCacheProvider (future)
├── PineconeProvider (future)
└── LocalRAGProvider (future, for offline)
```

```javascript
// scripts/rag/RAGProvider.mjs — Abstract interface
export class RAGProvider {
  async initialize(config) { throw new Error('Not implemented'); }
  async indexDocuments(documents) { throw new Error('Not implemented'); }
  async query(question, options) { throw new Error('Not implemented'); }
  async clearIndex() { throw new Error('Not implemented'); }
  async getStatus() { throw new Error('Not implemented'); }
  async destroy() { throw new Error('Not implemented'); }
}

// scripts/rag/OpenAIFileSearchProvider.mjs — Default implementation
export class OpenAIFileSearchProvider extends RAGProvider {
  // Uses OpenAI Responses API with file_search tool
  // Manages vector store lifecycle
  // Uploads journal/compendium content as files
}

// scripts/rag/RAGProviderFactory.mjs — Factory
export class RAGProviderFactory {
  static create(providerType, config) {
    switch (providerType) {
      case 'openai-file-search': return new OpenAIFileSearchProvider(config);
      // Future providers registered here
      default: return new OpenAIFileSearchProvider(config);
    }
  }
}
```

## Phase 1: RAG System Replacement

### 1.1 Create RAG Provider Interface

**New files:**
- `scripts/rag/RAGProvider.mjs` — Abstract base class
- `scripts/rag/RAGProviderFactory.mjs` — Factory for creating providers
- `scripts/rag/OpenAIFileSearchProvider.mjs` — OpenAI implementation

**RAGProvider interface methods:**

```javascript
class RAGProvider {
  // Lifecycle
  async initialize(config)    // Set up provider (create vector store, etc.)
  async destroy()             // Clean up resources

  // Indexing
  async indexDocuments(documents)  // documents: [{id, title, content, metadata}]
  async removeDocument(id)        // Remove a single document
  async clearIndex()              // Remove all documents

  // Querying
  async query(question, options)  // Returns: {answer, sources: [{title, excerpt, score}]}

  // Status
  async getStatus()           // Returns: {ready, documentCount, providerName, ...}
}
```

### 1.2 Implement OpenAI File Search Provider

**OpenAI Responses API integration:**

```javascript
class OpenAIFileSearchProvider extends RAGProvider {
  constructor(openAIClient) {
    this.client = openAIClient;
    this.vectorStoreId = null;
    this.fileIds = new Map(); // documentId -> openAIFileId
  }

  async initialize(config) {
    // Create or reuse vector store
    // Store ID in Foundry settings for persistence
    const response = await this.client.post('/vector_stores', {
      name: `vox-chronicle-${config.campaignId}`,
      expires_after: { anchor: 'last_active_at', days: 30 }
    });
    this.vectorStoreId = response.id;
  }

  async indexDocuments(documents) {
    // Upload each document as a file to OpenAI
    // Add files to vector store
    // Wait for processing to complete
    for (const doc of documents) {
      const file = await this._uploadFile(doc);
      await this._addToVectorStore(file.id);
      this.fileIds.set(doc.id, file.id);
    }
  }

  async query(question, options = {}) {
    // Use Responses API with file_search tool
    const response = await this.client.post('/responses', {
      model: options.model || 'gpt-4o-mini',
      input: question,
      tools: [{
        type: 'file_search',
        vector_store_ids: [this.vectorStoreId],
        max_num_results: options.maxResults || 5
      }]
    });
    return this._parseResponse(response);
  }
}
```

### 1.3 Update AIAssistant to Use RAGProvider

**Current:** `AIAssistant` calls `RAGRetriever.retrieveContext()` which calls `RAGVectorStore`
**New:** `AIAssistant` calls `ragProvider.query()` — one line change

```javascript
// Before
const ragContext = await this.ragRetriever.retrieveContext(query, { maxResults: 3 });

// After
const ragResult = await this.ragProvider.query(query, { maxResults: 3 });
const ragContext = ragResult.sources.map(s => s.excerpt).join('\n');
```

### 1.4 Update SessionOrchestrator

- Replace RAG initialization from `EmbeddingService` + `RAGVectorStore` + `RAGRetriever` to `RAGProviderFactory.create()`
- Update `_initializeRAG()` to call `ragProvider.initialize()`
- Update `_buildRAGIndex()` to call `ragProvider.indexDocuments()`
- Keep journal/compendium parsing (JournalParser, CompendiumParser) — they produce the documents that get indexed

### 1.5 Remove Old RAG Files

**Delete:**
- `scripts/ai/EmbeddingService.mjs` (~280 lines)
- `scripts/ai/RAGVectorStore.mjs` (~450 lines)
- `scripts/narrator/RAGRetriever.mjs` (~350 lines)
- `tests/ai/EmbeddingService.test.js`
- `tests/ai/RAGVectorStore.test.js`
- `tests/narrator/RAGRetriever.test.js`

**Keep:**
- `scripts/narrator/JournalParser.mjs` — still needed to extract text from Foundry journals
- `scripts/narrator/CompendiumParser.mjs` — still needed to extract text from compendiums
- `scripts/narrator/AIAssistant.mjs` — updated to use RAGProvider

### 1.6 Update Settings

**Remove settings:**
- `embeddingDimensions` (no longer relevant — File Search handles this)
- `ragChunkSize` (File Search auto-chunks at 800 tokens)
- `ragChunkOverlap` (File Search uses 256-token overlap)
- `ragSimilarityThreshold` (File Search handles relevance internally)
- `ragMaxStorageMB` (managed by OpenAI, billed per GB/day)

**Add settings:**
- `ragProvider` — Provider selection (default: 'openai-file-search')
- `ragVectorStoreId` — Persisted vector store ID (hidden, world-scope)
- `ragMaxResults` — Max results per query (default: 5)
- `ragAutoIndex` — Auto-index journals on session start (default: true)

### 1.7 New Tests

- `tests/rag/RAGProvider.test.js` — Interface contract tests
- `tests/rag/OpenAIFileSearchProvider.test.js` — Implementation tests (mock fetch)
- `tests/rag/RAGProviderFactory.test.js` — Factory tests
- `tests/narrator/AIAssistant.rag-integration.test.js` — Integration with new provider

## Phase 2: UI Memory Leak Fixes

### Critical Issues Found in Audit

All 5 ApplicationV2 components add event listeners in `_onRender()` without cleanup. Since ApplicationV2 calls `_onRender()` on every render cycle, listeners accumulate:

| Component | Leak Source | Impact |
|-----------|------------|--------|
| **MainPanel** | Tab click listeners in `_onRender()` | Duplicate tab switch handlers on every render |
| **EntityPreview** | Checkbox change listeners in `_onRender()` | Duplicate select/deselect handlers |
| **SpeakerLabeling** | Form submit listener in `_onRender()` | Duplicate form submissions |
| **RelationshipGraph** | vis-network CDN `<script>` injected on every render | Script reloading, network instance leak |
| **VocabularyManager** | Keypress + tab listeners in `_onRender()` | Duplicate input handlers, XSS risk in dialog HTML |

### Fix Strategy: AbortController Pattern

Use `AbortController` to clean up all non-action event listeners before re-adding them:

```javascript
class MyComponent extends HandlebarsApplicationMixin(ApplicationV2) {
  #listenerController = null;

  _onRender(context, options) {
    // Abort previous listeners
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    // Add listeners with signal — auto-cleaned on next render or close
    this.element.querySelector('select')
      .addEventListener('change', this._onFilterChange.bind(this), { signal });
  }

  async close(options) {
    this.#listenerController?.abort();
    return super.close(options);
  }
}
```

### 2.1 Fix MainPanel.mjs

- Add `#listenerController` with AbortController pattern
- Move tab click listeners to use `{ signal }` option
- Replace full `render()` call on tab switch with CSS-only tab visibility toggle
- Clean up on `close()`

### 2.2 Fix EntityPreview.mjs

- Add `#listenerController` with AbortController pattern
- Move checkbox change listeners to use `{ signal }` option
- Clean up on `close()`

### 2.3 Fix SpeakerLabeling.mjs

- Add `#listenerController` with AbortController pattern
- Move form submit listener to use `{ signal }` option
- Clean up on `close()`

### 2.4 Fix RelationshipGraph.mjs

- **Critical:** Load vis-network script ONCE (in `initialize()` or first render only), not on every render
- Store vis-network `Network` instance and destroy it properly in `close()`
- Add `#listenerController` with AbortController pattern for filter change listeners
- Guard CDN loading with `if (!window.vis)` check

### 2.5 Fix VocabularyManager.mjs

- Add `#listenerController` with AbortController pattern
- Move keypress and tab listeners to use `{ signal }` option
- Fix XSS risk: use `HtmlUtils.escapeHtml()` in dialog content generation
- Clean up on `close()`

### 2.6 MainPanel Tab Switching Optimization

Current: full `this.render()` call on tab switch (re-renders entire panel)
New: CSS-only tab switching with `display: none/block` or `hidden` attribute

```javascript
// In actions map:
static DEFAULT_OPTIONS = {
  actions: {
    'switch-tab': MainPanel.#onSwitchTab
  }
};

static #onSwitchTab(event, target) {
  const tabName = target.dataset.tab;
  // Hide all tab contents
  this.element.querySelectorAll('.tab-content').forEach(el => el.hidden = true);
  // Show selected tab
  this.element.querySelector(`[data-tab-content="${tabName}"]`).hidden = false;
  // Update active tab button
  this.element.querySelectorAll('[data-action="switch-tab"]').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === tabName)
  );
}
```

## Phase 3: Simplified Session Workflow

### Current Workflow (overly complex)
1. Record audio → 2. Transcribe with diarization → 3. Extract entities → 4. Identify salient moments → 5. Generate images for each entity + moment → 6. Review entities → 7. Publish all to Kanka

### New Workflow (simplified)
1. **Record audio** → 2. **Transcribe with diarization** → 3. **RAG-powered live assistance** (via File Search) → 4. **Generate session summary** (AI) → 5. **Generate 2-3 session images** (key moments only) → 6. **Publish summary + images to Kanka**

### 3.1 Reduce Image Generation

**Current:** Generates images for every extracted entity (characters, locations, items) + salient moments. A typical session could generate 10-20 images.

**New:** Generate only 2-3 images per session for the most dramatic moments. The `maxImagesPerSession` setting default changes from 5 to 3.

Changes to `ImageProcessor.mjs`:
- Default `maxImagesPerSession` to 3
- Skip entity portrait generation (characters, locations, items) — only generate scene images
- Keep `identifySalientMoments()` but limit to top 3 by drama score

### 3.2 Streamline Entity Extraction

**Current:** Extracts entities AND creates them in Kanka as separate characters/locations/items.

**New:** Extract entities for context and summary enrichment, but only create journal entries in Kanka (not separate entity records). Entities are mentioned in the chronicle text, not as standalone Kanka entities.

This aligns with v2.3.7's change to publish characters as sub-journals rather than Kanka character entities.

### 3.3 Session Summary Focus

The primary output is a well-written session summary (AI-generated narrative) with:
- Key events and decisions
- NPC interactions
- Location descriptions
- 2-3 dramatic moment images embedded

Published as a single Kanka journal entry with embedded images.

## Phase 4: Documentation Rewrite

### 4.1 ARCHITECTURE.md — Complete Rewrite

The current ARCHITECTURE.md is severely outdated:
- References DALL-E 3 (replaced by gpt-image-1 in v2.0.0)
- References v11/v12 (minimum is now v13)
- References RecorderControls (removed in v2.2.11)
- References CompendiumSearcher (removed in v2.2.11)
- No mention of narrator services (added in v2.0.0)
- No mention of RAG system (added in v2.1.0)
- No mention of ApplicationV2 migration (v2.3.0)
- No mention of dual-mode operation (live + chronicle)

New ARCHITECTURE.md must cover:
1. System overview (dual-mode: live + chronicle)
2. Component diagram (current 48 source files across 8 directories)
3. Service layers (entry point → core → audio → ai → rag → narrator → kanka → orchestration → ui → utils)
4. RAG architecture (modular provider with OpenAI File Search)
5. Data flow for both live and chronicle modes
6. State machine (expanded for live mode states)
7. External integrations (OpenAI Responses API, Kanka API)
8. UI architecture (ApplicationV2 + HandlebarsApplicationMixin)

### 4.2 API_REFERENCE.md — Add Missing Services

Missing from current API_REFERENCE.md:
- **Narrator services:** AIAssistant, ChapterTracker, CompendiumParser, JournalParser, RulesReference, SceneDetector, SessionAnalytics, SilenceDetector, RAGRetriever
- **RAG services:** EmbeddingService, RAGVectorStore (will be replaced by RAGProvider)
- **New utilities:** CacheManager, DomUtils, ErrorNotificationHelper, HtmlUtils, SensitiveDataFilter
- **Kanka additions:** KankaEntityManager
- **AI additions:** TranscriptionFactory, LocalWhisperService, WhisperBackend

Also needs corrections:
- ImageGenerationService still documents DALL-E 3 — must reference gpt-image-1
- ImageSize enum is wrong (DALL-E 3 sizes, not gpt-image-1 sizes)
- Missing dual-mode orchestration (live mode + chronicle mode)

### 4.3 CLAUDE.md — Update Patterns and File Map

Update:
- Project structure file tree (add rag/ directory, remove deleted files)
- Code patterns section (add RAGProvider pattern, update UI pattern to ApplicationV2)
- Image generation section (gpt-image-1 base64 responses, correct sizes)
- Add RAG provider pattern documentation
- Update "Adding a New Service" section for RAG providers
- Remove references to deleted files (CompendiumSearcher, RecorderControls, ApiKeyValidator)

### 4.4 TODO.md — New Audit Section

Add v3.0 rewrite plan items:
- RAG: Replace custom RAG with OpenAI File Search
- UI: Fix memory leaks in all 5 components
- Docs: Rewrite ARCHITECTURE.md and API_REFERENCE.md
- Workflow: Simplify to summary + 2-3 images

### 4.5 CHANGELOG.md — Unreleased Section

Add [Unreleased] section documenting planned v3.0 changes.

## Phase 5: Riscrittura completa dei test con coverage totale

### Strategia

I 3600+ test attuali sono strettamente accoppiati all'implementazione v2.x. Anziche' aggiornare puntualmente i test vecchi rischiando coverage parziale e test fragili, si riscrivono TUTTI i test da zero con target **100% code coverage**.

### 5.0 Eliminazione test esistenti

Eliminare l'intera directory `tests/` e ricrearla vuota. I test vecchi non hanno valore per v3.0:
- Test RAG vecchi testano EmbeddingService/RAGVectorStore/RAGRetriever (rimossi)
- Test UI non verificano AbortController/memory leak (il bug principale)
- Test orchestration sono accoppiati al workflow vecchio (5-20 immagini, entity-centric)
- Mock Foundry/ApplicationV2 obsoleti e fragili

### 5.1 Configurazione coverage

```javascript
// vitest.config.js
export default {
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['scripts/**/*.mjs'],
      exclude: ['scripts/data/**'],  // static dictionaries
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95
      }
    }
  }
};
```

### 5.2 Piano test per modulo

| Directory | File da testare | Coverage target |
|-----------|----------------|-----------------|
| `scripts/core/` | VoxChronicle, Settings, VocabularyDictionary | 100% |
| `scripts/audio/` | AudioRecorder, AudioChunker, SilenceDetector | 95%+ |
| `scripts/ai/` | OpenAIClient, TranscriptionService, TranscriptionFactory, LocalWhisperService, WhisperBackend, ImageGenerationService, EntityExtractor | 95%+ |
| `scripts/rag/` | RAGProvider, OpenAIFileSearchProvider, RAGProviderFactory | 100% |
| `scripts/narrator/` | AIAssistant, ChapterTracker, CompendiumParser, JournalParser, RulesReference, SceneDetector, SessionAnalytics, SilenceDetector | 95%+ |
| `scripts/kanka/` | KankaClient, KankaService, KankaEntityManager, NarrativeExporter | 95%+ |
| `scripts/orchestration/` | SessionOrchestrator (live+chronicle), TranscriptionProcessor, EntityProcessor, ImageProcessor, KankaPublisher | 95%+ |
| `scripts/ui/` | MainPanel, EntityPreview, SpeakerLabeling, RelationshipGraph, VocabularyManager | 95%+ (inclusi test memory leak) |
| `scripts/utils/` | Logger, RateLimiter, AudioUtils, SensitiveDataFilter, HtmlUtils, CacheManager, DomUtils, ErrorNotificationHelper | 100% |

### 5.3 Test struttura per ogni modulo

Ogni file di test deve coprire:
1. **Costruttore e inizializzazione** — parametri validi, default, errori
2. **Ogni metodo pubblico** — happy path, edge case, errori
3. **Interazioni con dipendenze** — mock verificati (chiamate corrette, ordine)
4. **Error handling** — ogni catch/throw testato
5. **Cleanup e lifecycle** — destroy, close, abort, dispose

### 5.4 Test specifici per bug fix v3.0

| Test | Verifica |
|------|----------|
| UI memory leak regression | Ogni componente: render 10x, verificare che i listener non si accumulino |
| AbortController cleanup | `close()` chiama `abort()`, nuovo render chiama `abort()` prima di re-add |
| RelationshipGraph CDN | `vis-network` caricato una sola volta, guard `if (!window.vis)` |
| VocabularyManager XSS | Input con `<script>` sanitizzato da `HtmlUtils.escapeHtml()` |
| RAG provider swap | Factory crea provider corretto, fallback se provider non disponibile |
| File Search error handling | Network error, quota exceeded, vector store expired |

### 5.5 Test di integrazione

| Test | Scenario |
|------|----------|
| Full chronicle flow | Record → Transcribe → Extract → Images(3) → Publish to Kanka |
| Full live flow | Start live → RAG query → Suggestion → Scene detect → Analytics → Stop |
| RAG end-to-end | Upload file → Index → Query → Results con citations |
| Dual-mode switch | Start live → Stop → Start chronicle → Complete |

### 5.6 CI integration

- Aggiungere `npm run test:coverage` a CI pipeline
- Fail se coverage sotto soglia (95% lines/functions, 90% branches)
- Report HTML coverage come artifact

## Implementation Order

### Batch 1: Documentation (no code changes)
1. Rewrite `docs/ARCHITECTURE.md` to reflect current v2.3.7 state
2. Update `docs/API_REFERENCE.md` with missing services
3. Update `CLAUDE.md` with current file map and patterns
4. Update `TODO.md` with v3.0 plan items
5. Add [Unreleased] section to `CHANGELOG.md`

### Batch 2: UI Memory Leak Fixes
6. Fix MainPanel.mjs (AbortController + CSS tab switching)
7. Fix EntityPreview.mjs (AbortController)
8. Fix SpeakerLabeling.mjs (AbortController)
9. Fix RelationshipGraph.mjs (AbortController + CDN guard + vis-network cleanup)
10. Fix VocabularyManager.mjs (AbortController + XSS fix)

### Batch 3: RAG System Replacement
11. Create `scripts/rag/RAGProvider.mjs` interface
12. Create `scripts/rag/RAGProviderFactory.mjs`
13. Create `scripts/rag/OpenAIFileSearchProvider.mjs`
14. Update `AIAssistant.mjs` to use RAGProvider
15. Update `SessionOrchestrator.mjs` to use RAGProviderFactory
16. Update `Settings.mjs` (remove old RAG settings, add new ones)
17. Delete old RAG files (EmbeddingService, RAGVectorStore, RAGRetriever)

### Batch 4: Workflow Simplification
18. Reduce default `maxImagesPerSession` to 3
19. Update ImageProcessor to only generate scene images
20. Update KankaPublisher to focus on journal entries

### Batch 5: Riscrittura completa test
21. Eliminare tutti i test esistenti (`tests/`)
22. Configurare Vitest con v8 coverage e soglie (95% lines/functions, 90% branches)
23. Riscrivere test per `scripts/core/` (VoxChronicle, Settings, VocabularyDictionary)
24. Riscrivere test per `scripts/utils/` (tutti gli 8 moduli)
25. Riscrivere test per `scripts/audio/` (AudioRecorder, AudioChunker, SilenceDetector)
26. Riscrivere test per `scripts/ai/` (tutti i 7 moduli)
27. Riscrivere test per `scripts/rag/` (RAGProvider, OpenAIFileSearchProvider, RAGProviderFactory)
28. Riscrivere test per `scripts/narrator/` (tutti gli 8 moduli)
29. Riscrivere test per `scripts/kanka/` (tutti i 4 moduli)
30. Riscrivere test per `scripts/orchestration/` (tutti i 5 moduli)
31. Riscrivere test per `scripts/ui/` (tutti i 5 componenti + memory leak regression)
32. Riscrivere test di integrazione (full chronicle flow, full live flow, RAG e2e, dual-mode)
33. Verificare coverage >= soglia su tutti i moduli

### Batch 6: Finalize
34. Version bump to 3.0.0
35. Update CHANGELOG.md with final v3.0.0 entry
36. Build and release

## Cost Analysis

### Current RAG Costs (v2.x)
- text-embedding-3-small: $0.02/1M tokens
- Local IndexedDB: free storage, CPU-bound search
- Scales poorly with large journals

### New RAG Costs (v3.0)
- File Search: $0.10/GB/day storage + $2.50/1000 searches
- Typical campaign: ~5MB of journal text = $0.0005/day = $0.015/month
- Typical session: ~50 queries = $0.125/session
- **Total RAG cost per session: ~$0.13** (vs ~$0.05 for custom embeddings, but much more reliable)

### Image Generation Savings
- Current: 5-20 images/session at $0.02-0.04 each = $0.10-0.80/session
- New: 2-3 images/session at $0.02 each = $0.04-0.06/session
- **Savings: ~$0.10-0.74/session**

### Net Impact
Roughly cost-neutral, with significantly better RAG quality and fewer images.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| OpenAI Responses API changes | Modular provider interface allows swapping |
| File Search latency (cold start) | Pre-warm vector store on session start |
| Vector store expiry (30 days) | Auto-recreate from Foundry journals |
| Breaking existing workflows | Major version bump (v3.0), clear migration guide |
| Riscrittura test completa | Batch 5 dedicato, coverage enforced >= 95% con CI gate |

## Migration Guide (v2.x → v3.0)

1. **RAG settings reset** — Old settings (embeddingDimensions, ragChunkSize, etc.) are removed. New settings auto-configure. First session after update will rebuild the RAG index using File Search.
2. **IndexedDB cleanup** — Old RAGVectorStore data in IndexedDB can be manually cleared via browser dev tools (optional, unused data).
3. **Image generation** — Default reduced to 3 images/session. Adjustable via `maxImagesPerSession` setting.
4. **No breaking API changes** — External integrations (OpenAI, Kanka) unchanged. Internal module API changes are transparent to users.
