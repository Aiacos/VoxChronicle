---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-08'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/prd-validation-report.md
  - docs/ARCHITECTURE.md
  - docs/API_REFERENCE.md
  - docs/USER_GUIDE.md
  - docs/TESTING.md
  - docs/GPT4O_TRANSCRIBE_API.md
  - CLAUDE.md
workflowType: 'architecture'
project_name: 'VoxChronicle'
user_name: 'Aiacos'
date: '2026-03-08'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Requisiti funzionali — 43 FR in 8 categorie:**

| Categoria FR | Count | Implicazione architetturale chiave |
|-------------|-------|-----------------------------------|
| Audio Capture (FR1-6) | 6 | MediaRecorder API, codec fallback Safari, chunking 25MB |
| Transcription (FR7-10) | 4 | API multi-modello, diarizzazione, multi-lingua |
| Live AI Assistance (FR11-17) | 7 | Ciclo real-time ~30s, streaming SSE, ciclo adattivo VAD |
| Chronicle Generation (FR18-22) | 5 | Pipeline sequenziale: estrai → genera immagini → formatta |
| AI Provider Management (FR23-26) | 4 | Interfaccia provider astratta, selezione per-task |
| RAG & Knowledge (FR27-30) | 4 | RAG multi-backend, indicizzazione journal/compendi |
| Session Analytics (FR31-33) | 3 | Raccolta dati in-session, visualizzazione post-session |
| UI & Config (FR34-39) | 6 | Pannello collassabile, evento-driven, ARIA live regions |
| Error Handling (FR40-43) | 4 | Circuit breaker, graceful degradation, stato consistente |

**NFR critici per l'architettura — 37 NFR in 6 categorie:**

| NFR | Impatto architetturale |
|-----|----------------------|
| NFR1: Suggerimenti <3s (p95) | Parallelizzazione code AI, cache aggressiva, streaming |
| NFR3: Zero re-render completi | Aggiornamento DOM chirurgico, event-driven UI update |
| NFR7: Costo <$2/sessione 3h | Cache obbligatoria, ciclo adattivo per ridurre API calls |
| NFR19: Nuovi provider senza modifiche codice | Strategy pattern + interface astratta |
| NFR26: Interfaccia AI comune multi-provider | AIProvider interface trasversale |
| NFR29: Circuit breaker 5 fallimenti / 60s cooldown | Resilienza incorporata nel client layer |
| NFR31b: Event bus pub/sub | Modifica trasversale: disaccoppia servizi da UI |
| NFR32-37: Reliability suite | Registrazione locale indipendente, stato consistente, ripresa automatica |

**Dalla UX Spec — implicazioni tecniche:**

- Pannello collassabile 48px-320px: CSS container queries + state persistence localStorage
- LED system con 6 stati: Componente atomico riusato, animazione CSS, aria-live
- Streaming AI token-per-token: SSE parsing + progressive DOM update + LED viola
- Transizione automatica Live-Chronicle: Event-driven, pannello reagisce a cambio fase
- Empty states con icone: Asset SVG inline o font icon
- Pulsanti pastello con glow: CSS custom con design tokens, box-shadow animati
- Feedback duale LED+Toast: Due canali paralleli, logica di dispatch centralizzata

### Scale & Complexity

- **Dominio tecnico primario**: Modulo browser-side embedded (Foundry VTT v13)
- **Complessita'**: Media-Alta — multi-API real-time, dual-mode, provider modulare, UI complessa
- **Componenti architetturali**: ~15 moduli principali + ~10 utility
- **Contesto**: Brownfield v3.4.x — 49 file sorgente, 3888+ test esistenti
- **Vincolo critico**: Tutto esegue nel browser — nessun backend custom

### Technical Constraints & Dependencies

| Vincolo | Impatto |
|---------|---------|
| **Browser-only** | No backend, no server-side processing. Tutte le API chiamate dal client JS |
| **Foundry VTT v13** | ApplicationV2 + HandlebarsApplicationMixin obbligatorio per UI |
| **API keys client-side** | localStorage, SensitiveDataFilter, HTTPS-only |
| **OpenAI 25MB limit** | AudioChunker obbligatorio per sessioni lunghe |
| **Kanka rate limits** | 30/90 req/min — throttling e queueing necessari |
| **Brownfield v3.4.x** | 49 file, 3888+ test — ogni cambiamento deve essere retrocompatibile |
| **Solo developer** | Architettura deve essere manutenibile da una persona |

### Cross-Cutting Concerns

1. **AI Provider Abstraction** — Tocca: ai/, rag/, narrator/ — ogni servizio che chiama un modello AI deve passare per l'interfaccia provider
2. **Event Bus (pub/sub)** — Tocca: orchestration/, narrator/, ui/ — disaccoppia produttori di eventi dai consumatori UI
3. **Caching** — Tocca: rag/, narrator/, ai/ — CacheManager deve essere integrato in ogni percorso che fa chiamate API
4. **Error Handling + Resilienza** — Tocca: tutti i layer — circuit breaker, graceful degradation, stato consistente
5. **Streaming SSE** — Tocca: ai/, narrator/, ui/ — tutte le risposte AI devono supportare streaming progressivo
6. **Accessibility (ARIA)** — Tocca: ui/ — ogni componente custom deve avere supporto completo
7. **Design Tokens CSS** — Tocca: styles/ — sistema a 3 layer (Foundry base, VoxChronicle tokens, Component tokens)

## Starter Template Evaluation

### Primary Technology Domain

**Modulo browser-side embedded** per Foundry VTT v13 — nessun backend custom, nessun bundler, nessun framework esterno. Tutto esegue nel browser come modulo ES6.

### Starter: Brownfield Codebase v3.4.x

**Razionale:** VoxChronicle è un progetto brownfield con 49 file sorgente e 3888+ test. Non si tratta di selezionare un starter template, ma di formalizzare le decisioni tecnologiche già consolidate come baseline architetturale per le evoluzioni future.

**Vincoli non negoziabili (imposti da Foundry VTT v13):**

| Vincolo | Motivazione |
|---------|-------------|
| JavaScript ES6+ (.mjs) | Foundry VTT non supporta TypeScript nativo, nessun build step |
| ApplicationV2 + HandlebarsApplicationMixin | API UI obbligatoria per moduli v13 |
| Handlebars (.hbs) templates | Sistema di template nativo Foundry |
| Nessun bundler (Webpack, Vite, Rollup) | I moduli Foundry sono caricati direttamente dal browser |
| Nessun framework UI esterno (React, Vue) | Conflitterebbe con il rendering cycle di Foundry |
| `game` object come contesto globale | API Foundry per settings, i18n, users, scenes |
| Distribuzione come ZIP | Formato standard modulo Foundry VTT |

**Decisioni architetturali stabilite dalla codebase:**

**Language & Runtime:**
- JavaScript ES6+ con moduli .mjs (import/export nativi)
- Nessun TypeScript — compatibilità diretta con Foundry module loader
- Target: browser moderni (Chrome 90+, Firefox 88+, Safari 15+)

**Styling Solution:**
- CSS puro con namespace `.vox-chronicle`
- Convenzione BEM-style per componenti (`block__element--modifier`)
- Nessun preprocessore (SASS/LESS) — coerente con ecosistema Foundry

**Build Tooling:**
- Zero build step per il codice applicativo
- `build.sh` solo per packaging ZIP di release
- Nessun transpiling, nessun minification

**Testing Framework:**
- Vitest con jsdom environment (3888+ test, 46+ file)
- Mock globale di `game`, `ui`, `Hooks` per test unitari
- Nessun test E2E (Foundry VTT richiede ambiente completo)

**Code Organization:**
- 10 layer modulari: core/, audio/, ai/, rag/, narrator/, kanka/, orchestration/, data/, ui/, utils/
- Singleton pattern per orchestratori (VoxChronicle, MainPanel)
- Service pattern con dependency injection via costruttore
- Logger utility per tutto il logging (`VoxChronicle |` prefix)

**Development Experience:**
- Hot reload via Foundry VTT dev mode (refresh browser)
- `npm test` per suite completa
- `npm run test:ui` per Vitest UI interattiva
- Debug via browser DevTools con Logger.setLogLevel(DEBUG)

**Aspetti evolubili (non vincolati da Foundry):**

| Aspetto | Stato attuale | Potenziale evoluzione |
|---------|--------------|----------------------|
| Event system | Chiamate dirette tra servizi | Event bus pub/sub (NFR31b) |
| AI provider | OpenAI hardcoded in servizi | Strategy pattern astratto (NFR19, NFR26) |
| Caching | CacheManager in alcuni percorsi | Cache sistematica su tutte le API calls (NFR7) |
| Error handling | try/catch sparsi + ErrorNotificationHelper | Circuit breaker centralizzato (NFR29) |
| UI updates | Re-render manuali | DOM chirurgico event-driven (NFR3) |
| Design tokens | CSS diretto | Sistema a 3 layer (Foundry → VoxChronicle → Component) |
| Stato sessione | Oggetti plain in SessionOrchestrator | State machine formale |

**Nota:** L'evoluzione architetturale deve essere incrementale e retrocompatibile con i 3888+ test esistenti.

## Core Architectural Decisions

### Decision Priority Analysis

**Decisioni critiche (bloccano implementazione):**
1. Event Bus — Observer con canali tipizzati (fondamento comunicazione)
2. AI Provider Abstraction — Strategy per-capability (fondamento servizi AI)
3. State Machine — Formale con matrice stato×evento (fondamento orchestrazione)

**Decisioni importanti (formano l'architettura):**
4. Caching a due livelli — L1 semantica + L2 contenuto
5. ResilienceRegistry — Centralizzato con policy per-servizio
6. UI PARTS + DOM diretto — Aggiornamenti chirurgici
7. Streaming — Provider async iterator + StreamController 16ms

**Decisioni di supporto:**
8. Design Tokens — Primitivi → Semantici → Componente

### 1. Event Bus Architecture

| Aspetto | Decisione |
|---------|-----------|
| **Pattern** | Observer con canali tipizzati + middleware |
| **Canali** | `ai:`, `scene:`, `session:`, `ui:`, `error:`, `analytics:` |
| **Middleware** | Logging (dev mode), filtering, event replay per debug |
| **Rationale** | Modularità massima — ogni canale è un contratto esplicito tra produttori e consumatori |
| **Affects** | orchestration/, narrator/, ui/, core/ |

### 2. AI Provider Abstraction

| Aspetto | Decisione |
|---------|-----------|
| **Pattern** | Strategy per-capability con interfacce separate |
| **Interfacce** | `ChatProvider`, `TranscriptionProvider`, `ImageProvider`, `EmbeddingProvider` |
| **Registry** | `ProviderRegistry` — registrazione provider + selezione per-task |
| **Mix-and-match** | Possibile usare provider diversi per task diversi (es. OpenAI transcribe + Anthropic chat) |
| **Rationale** | Granularità senza "not supported", allineato a FR23-26 |
| **Affects** | ai/, rag/, narrator/ |

### 3. State Management

| Aspetto | Decisione |
|---------|-----------|
| **Pattern** | State Machine formale con matrice stato×evento |
| **Stati** | `idle → configuring → live → transitioning → chronicle → publishing → complete → error` |
| **Guard conditions** | Validazione pre-transizione (es. non può passare a `chronicle` senza transcript) |
| **Integrazione** | Ogni transizione emette evento su canale `session:` dell'Event Bus |
| **Ripresa** | Stato serializzabile in localStorage per NFR32-37 |
| **Rationale** | Impossibile entrare in stati invalidi, critico per dual-mode e recovery |
| **Affects** | orchestration/, core/ |

### 4. Caching Strategy

| Aspetto | Decisione |
|---------|-----------|
| **Pattern** | Cache a due livelli (L1 + L2) |
| **L1 — Semantica** | Nei servizi, TTL breve (30s-5min), cache key significative (`suggestion:combat:chapter3`), invalidazione su cambio contesto |
| **L2 — Contenuto** | Nel provider layer, TTL lungo (1h+), dati statici (regole, compendi, RAG chunks), invalidazione su cambio source |
| **Budget** | Target: ridurre API calls del 60%+ per rispettare NFR7 (<$2/sessione 3h) |
| **Rationale** | L1 taglia chiamate ridondanti real-time, L2 elimina query ripetute su contenuti statici |
| **Affects** | ai/, rag/, narrator/ |

### 5. Error Handling & Resilienza

| Aspetto | Decisione |
|---------|-----------|
| **Pattern** | ResilienceRegistry centralizzato + policy per-servizio |
| **Circuit Breaker** | 5 fallimenti consecutivi → 60s cooldown (NFR29) |
| **Registrazione** | `registry.register('serviceName', { maxFailures, cooldown, fallback })` |
| **Fallback chain** | Provider primario → provider secondario → cache L2 → messaggio offline |
| **Notifiche** | Errori emessi su canale `error:` dell'Event Bus → UI toast + LED rosso |
| **State Machine** | Errori critici triggerano transizione a stato `error` |
| **Rationale** | Configurazione centralizzata, comportamento distribuito, monitoraggio unificato |
| **Affects** | tutti i layer |

### 6. UI Update Strategy

| Aspetto | Decisione |
|---------|-----------|
| **Pattern** | ApplicationV2 PARTS nativo + DOM diretto per micro-update |
| **PARTS render** | `render({ parts: ['suggestionCard'] })` — re-render solo la sezione modificata |
| **DOM diretto** | LED toggle, contatori, progress bar — update senza re-render |
| **Trigger** | Event Bus → handler nel panel → `render({parts})` o DOM diretto |
| **Rationale** | Zero framework custom, API nativa Foundry, NFR3 zero re-render completi |
| **Affects** | ui/, styles/ |

### 7. Streaming Architecture

| Aspetto | Decisione |
|---------|-----------|
| **Pattern** | Provider async iterator + StreamController UI |
| **Provider** | `chatStream()` ritorna async iterator di token |
| **StreamController** | Buffer token, flush ogni 16ms (60fps), gestione scroll auto |
| **Eventi** | `ai:streamStart`, `ai:token`, `ai:streamEnd`, `ai:streamError` su Event Bus |
| **Cancellazione** | `AbortController` nel provider, StreamController pulisce DOM |
| **Rationale** | Separazione netta provider↔rendering, 60fps garantiti, testabile separatamente |
| **Affects** | ai/, narrator/, ui/ |

### 8. Design Token System

| Aspetto | Decisione |
|---------|-----------|
| **Pattern** | 3 livelli: Primitivi → Semantici → Componente |
| **Primitivi** | `--vox-green-400`, `--vox-purple-500` — palette colori |
| **Semantici** | `--vox-color-success`, `--vox-color-streaming` — mappano a primitivi |
| **Componente** | `--vox-led-active: var(--vox-color-success)` — mappano a semantici |
| **Foundry integration** | Semantici leggono da variabili Foundry quando possibile per adattamento temi |
| **Rationale** | Naming auto-documentante, temi scuro/chiaro, compatibilità temi community |
| **Affects** | styles/, ui/ |

### Decision Impact Analysis

**Sequenza implementazione consigliata:**
1. Event Bus (fondamento — tutto il resto dipende da questo)
2. Design Tokens (indipendente, può procedere in parallelo)
3. State Machine (dipende da Event Bus)
4. AI Provider Abstraction (dipende da Event Bus per notifiche)
5. Caching L2 (dipende da Provider Abstraction)
6. ResilienceRegistry (dipende da Provider + Event Bus)
7. UI PARTS + StreamController (dipende da Event Bus + Provider streaming)
8. Caching L1 (dipende da servizi refactored)

**Dipendenze tra decisioni:**
- Event Bus → è consumato da tutte le altre 7 decisioni
- Provider Abstraction → alimenta Cache L2, ResilienceRegistry, Streaming
- State Machine → consuma Event Bus, è consumata da ResilienceRegistry (errori critici)
- StreamController → consuma Provider streaming + Event Bus, produce DOM updates via PARTS

## Implementation Patterns & Consistency Rules

### Punti di conflitto identificati

**7 aree critiche** dove agenti AI potrebbero implementare in modi incompatibili — tutte risolte con convenzioni esplicite.

**Pattern già stabiliti (da CLAUDE.md — non ridefiniti qui):**
- File naming: `PascalCase.mjs` per classi, `kebab-case.mjs` per utility/dati
- CSS: `.vox-chronicle` namespace + BEM (`block__element--modifier`)
- Logging: `Logger.createChild('ServiceName')`
- Import: `MODULE_ID` sempre da `constants.mjs`
- Testing: `tests/` mirror di `scripts/`, mock globale `game`

### 1. Event Bus — Naming e Payload

**Nome evento:** `canale:azioneCamelCase`
- Canali: `ai:`, `scene:`, `session:`, `ui:`, `error:`, `analytics:`
- Azioni standard: `ready`, `changed`, `started`, `completed`, `failed`, `cancelled`

**Payload:** sempre oggetto, mai primitivi diretti

```javascript
// ✅ Corretto
eventBus.emit('ai:suggestionReady', { type: 'narration', content: '...', sceneType: 'combat' });

// ❌ Errato
eventBus.emit('ai:suggestionReady', 'some string');
```

### 2. Provider Interface — Contratto e Registrazione

**Metodi obbligatori per interfaccia:**

```javascript
// ChatProvider
async chat(messages, options = {})        // → { content, usage }
async *chatStream(messages, options = {}) // → async iterator di { token, done }

// TranscriptionProvider
async transcribe(audioBlob, options = {}) // → { text, segments }

// ImageProvider
async generateImage(prompt, options = {}) // → { data, format }

// EmbeddingProvider
async embed(text, options = {})           // → { embedding, dimensions }
```

**Capability check:** `static get capabilities()` → `['chat', 'chatStream', 'transcribe']`

**Registrazione:** `ProviderRegistry.register('openai', OpenAIProvider, { default: true })`

**Selezione:** `ProviderRegistry.getProvider('chat')` → provider default per capability

**Options standardizzate:** `{ model, temperature, maxTokens, abortSignal }`

### 3. State Machine — Transizioni e Guard

**Stati come costanti:**

```javascript
export const SessionState = {
  IDLE: 'idle', CONFIGURING: 'configuring', LIVE: 'live',
  TRANSITIONING: 'transitioning', CHRONICLE: 'chronicle',
  PUBLISHING: 'publishing', COMPLETE: 'complete', ERROR: 'error'
};
```

**Matrice transizioni dichiarativa (no if/else sparsi):**

```javascript
const transitions = {
  idle:          { START_CONFIG: 'configuring' },
  configuring:   { CONFIG_DONE: 'live', CONFIG_CANCEL: 'idle' },
  live:          { END_LIVE: 'transitioning', CRITICAL_ERROR: 'error' },
  transitioning: { TRANSITION_DONE: 'chronicle', TRANSITION_FAIL: 'error' },
  chronicle:     { START_PUBLISH: 'publishing', SKIP_PUBLISH: 'complete' },
  publishing:    { PUBLISH_DONE: 'complete', PUBLISH_FAIL: 'error' },
  complete:      { RESET: 'idle' },
  error:         { RECOVER: 'idle', RETRY: null }
};
```

**Guard:** funzione pura `(currentState, event, context) → boolean`

**Evento automatico:** ogni transizione emette `session:stateChanged` con `{ from, to, event, timestamp }`

### 4. Error Handling — Uso ResilienceRegistry

**Regola: mai try/catch isolato per API calls — sempre via ResilienceRegistry**

```javascript
// ✅ Corretto
const result = await this.resilience.execute('aiAssistant', () => this.provider.chat(messages));

// ❌ Errato
try { const result = await this.provider.chat(messages); } catch(e) { /* ... */ }
```

**try/catch consentito solo per:** logica locale non-API (parsing, DOM, validazione)

**Fallback chain dichiarativa:**

```javascript
resilience.register('aiAssistant', {
  maxFailures: 5,
  cooldown: 60000,
  fallback: [
    () => this.cache.getLastSuggestion(),
    () => ({ content: i18n('OfflineMsg') })
  ]
});
```

**Due canali errore:**
- `error:user` → toast UI visibile (linguaggio semplice)
- `error:technical` → log per debug (dettagli tecnici)

### 5. UI Update — PARTS vs DOM diretto

| Situazione | Metodo |
|-----------|--------|
| Cambia il "cosa" (nuovo contenuto semantico) | `render({ parts: ['partName'] })` |
| Cambia il "quanto" (micro-update alta frequenza) | DOM diretto |
| Primo render | `render(true)` — **unica volta consentita** |

**AbortController obbligatorio in `_onRender()`** per cleanup listener.

**Event Bus binding:**

```javascript
this.eventBus.on('ai:suggestionReady', () => this.render({ parts: ['suggestionCard'] }));
this.eventBus.on('ai:token', (data) => this._appendToken(data.token)); // DOM diretto
```

### 6. Localization — Chiavi i18n

**Regola assoluta:** ogni nuova chiave in **tutti e 8** i file lang.

**Gerarchia:** `VOXCHRONICLE.{Layer}.{Component}.{Action}`

```
VOXCHRONICLE.EventBus.Error.ChannelNotFound
VOXCHRONICLE.Provider.Error.NotSupported
VOXCHRONICLE.Session.State.Live
VOXCHRONICLE.Resilience.Error.CircuitOpen
```

**Categorie azione:** `.Title`, `.Label`, `.Hint`, `.Error.*`, `.Status.*`, `.Action.*`

### 7. Caching — Chiavi e Invalidazione

**Chiave L1 (semantica):** `layer:servizio:contesto` → `narrator:suggestion:combat:chapter3`

**Chiave L2 (contenuto):** `provider:tipo:hash` → `openai:chat:a1b2c3d4`

**TTL standard:**

| Tipo | TTL |
|------|-----|
| Suggerimenti live (L1) | 30s-2min |
| Rules lookup (L1) | 5min |
| RAG chunks (L2) | 1h |
| Embeddings (L2) | 24h |

**Invalidazione obbligatoria su eventi:**

```javascript
eventBus.on('scene:changed', () => cache.invalidatePrefix('narrator:suggestion:'));
eventBus.on('session:stateChanged', () => cache.invalidatePrefix('narrator:'));
```

**Mai cache senza invalidazione** — ogni `cache.set()` deve avere un evento di invalidazione corrispondente.

### Enforcement Guidelines

**Tutti gli agenti AI DEVONO:**
1. Consultare questa sezione prima di implementare qualsiasi componente che tocchi Event Bus, Provider, State Machine, Cache, o UI
2. Usare i formati esatti definiti qui per nomi eventi, chiavi cache, metodi provider
3. Mai introdurre pattern alternativi senza aggiornare questo documento
4. Aggiungere chiavi i18n in tutti e 8 i file lang simultaneamente

## Project Structure & Boundaries

### Complete Project Directory Structure

```
VoxChronicle/
├── module.json
├── scripts/
│   ├── main.mjs                           # Entry point — hooks registration
│   ├── constants.mjs                      # MODULE_ID (dependency-free leaf)
│   ├── core/
│   │   ├── VoxChronicle.mjs               # Main singleton — service orchestration  ← REFACTOR
│   │   ├── Settings.mjs                   # Foundry settings registration
│   │   ├── VocabularyDictionary.mjs       # Custom vocabulary
│   │   ├── EventBus.mjs                   # Observer con canali tipizzati + middleware  ← NEW
│   │   ├── SessionStateMachine.mjs        # State machine formale con matrice  ← NEW
│   │   └── ResilienceRegistry.mjs         # Circuit breaker + fallback chain  ← NEW
│   ├── ai/
│   │   ├── providers/                     # ← NEW directory
│   │   │   ├── ChatProvider.mjs           # Interfaccia base chat  ← NEW
│   │   │   ├── TranscriptionProvider.mjs  # Interfaccia base transcription  ← NEW
│   │   │   ├── ImageProvider.mjs          # Interfaccia base image  ← NEW
│   │   │   ├── EmbeddingProvider.mjs      # Interfaccia base embedding  ← NEW
│   │   │   ├── ProviderRegistry.mjs       # Registry + selezione per-capability  ← NEW
│   │   │   ├── OpenAIChatProvider.mjs     # Implementazione OpenAI chat  ← NEW
│   │   │   ├── OpenAITranscriptionProvider.mjs  ← NEW
│   │   │   ├── OpenAIImageProvider.mjs    ← NEW
│   │   │   └── OpenAIEmbeddingProvider.mjs  ← NEW
│   │   ├── OpenAIClient.mjs              # Base HTTP client (retry, queue)  ← REFACTOR
│   │   ├── TranscriptionService.mjs       ← REFACTOR (usa TranscriptionProvider)
│   │   ├── TranscriptionFactory.mjs
│   │   ├── LocalWhisperService.mjs
│   │   ├── WhisperBackend.mjs
│   │   ├── ImageGenerationService.mjs     ← REFACTOR (usa ImageProvider)
│   │   ├── EntityExtractor.mjs            ← REFACTOR (usa ChatProvider)
│   │   └── StreamController.mjs           # Buffer 16ms + progressive DOM  ← NEW
│   ├── rag/
│   │   ├── RAGProvider.mjs               # Abstract base class
│   │   ├── RAGProviderFactory.mjs
│   │   ├── OpenAIFileSearchProvider.mjs   ← REFACTOR (usa EmbeddingProvider)
│   │   └── RAGFlowProvider.mjs
│   ├── narrator/
│   │   ├── AIAssistant.mjs               ← REFACTOR (usa ChatProvider + EventBus)
│   │   ├── ChapterTracker.mjs            ← REFACTOR (emette su scene:)
│   │   ├── CompendiumParser.mjs
│   │   ├── JournalParser.mjs
│   │   ├── RulesReference.mjs            ← REFACTOR (usa ChatProvider + cache L1)
│   │   ├── RulesLookupService.mjs
│   │   ├── SceneDetector.mjs             ← REFACTOR (emette su scene:)
│   │   ├── SessionAnalytics.mjs          ← REFACTOR (emette su analytics:)
│   │   └── SilenceDetector.mjs
│   ├── kanka/
│   │   ├── KankaClient.mjs
│   │   ├── KankaService.mjs
│   │   ├── KankaEntityManager.mjs
│   │   └── NarrativeExporter.mjs
│   ├── orchestration/
│   │   ├── SessionOrchestrator.mjs        ← REFACTOR (usa SessionStateMachine)
│   │   ├── TranscriptionProcessor.mjs
│   │   ├── EntityProcessor.mjs
│   │   ├── ImageProcessor.mjs
│   │   └── KankaPublisher.mjs
│   ├── audio/
│   │   ├── AudioRecorder.mjs
│   │   └── AudioChunker.mjs
│   ├── data/
│   │   └── dnd-vocabulary.mjs
│   ├── ui/
│   │   ├── MainPanel.mjs                 ← REFACTOR (PARTS + EventBus binding)
│   │   ├── SpeakerLabeling.mjs
│   │   ├── EntityPreview.mjs
│   │   ├── RelationshipGraph.mjs
│   │   └── VocabularyManager.mjs
│   └── utils/
│       ├── Logger.mjs
│       ├── RateLimiter.mjs
│       ├── AudioUtils.mjs
│       ├── SensitiveDataFilter.mjs
│       ├── HtmlUtils.mjs
│       ├── CacheManager.mjs              ← REFACTOR (L1/L2 + prefix invalidation)
│       ├── DomUtils.mjs
│       └── ErrorNotificationHelper.mjs   ← REFACTOR (usa error: canale EventBus)
├── styles/
│   ├── vox-chronicle.css                 ← REFACTOR (design tokens)
│   ├── tokens/                           ← NEW directory
│   │   ├── primitives.css                # --vox-green-400, palette  ← NEW
│   │   ├── semantic.css                  # --vox-color-success, mappings  ← NEW
│   │   └── components.css               # --vox-led-active, per-component  ← NEW
├── templates/
│   ├── main-panel.hbs                    ← REFACTOR (split in PARTS)
│   ├── parts/                            ← NEW directory
│   │   ├── suggestion-card.hbs           ← NEW
│   │   ├── led-status.hbs               ← NEW
│   │   ├── recording-controls.hbs        ← NEW
│   │   ├── analytics-summary.hbs         ← NEW
│   │   └── stream-container.hbs          ← NEW
│   ├── recorder.hbs
│   ├── speaker-labeling.hbs
│   ├── entity-preview.hbs
│   ├── relationship-graph.hbs
│   ├── vocabulary-manager.hbs
│   ├── analytics-tab.hbs
│   └── journal-picker.hbs
├── lang/                                 # 8 file — tutti aggiornati simultaneamente
│   ├── en.json, it.json, de.json, es.json, fr.json, ja.json, pt.json, template.json
├── tests/
│   ├── core/
│   │   ├── VoxChronicle.test.js
│   │   ├── Settings.test.js
│   │   ├── EventBus.test.js              ← NEW
│   │   ├── SessionStateMachine.test.js   ← NEW
│   │   └── ResilienceRegistry.test.js    ← NEW
│   ├── ai/
│   │   ├── providers/                    ← NEW directory
│   │   │   ├── ProviderRegistry.test.js  ← NEW
│   │   │   ├── OpenAIChatProvider.test.js  ← NEW
│   │   │   └── ...                       ← NEW (uno per provider)
│   │   ├── StreamController.test.js      ← NEW
│   │   └── ... (test esistenti)
│   ├── narrator/ ... (test esistenti + refactor)
│   ├── ui/ ... (test esistenti + refactor)
│   └── utils/
│       └── CacheManager.test.js          ← REFACTOR (test L1/L2)
└── docs/
    ├── ARCHITECTURE.md                   ← REFACTOR (allineare a nuove decisioni)
    └── ... (altri docs esistenti)
```

### Architectural Boundaries

**Layer Boundaries — Chi può importare cosa:**

```
┌─────────────────────────────────────────────┐
│  ui/          → core/, utils/               │  UI consuma EventBus, mai servizi diretti
│  narrator/    → ai/providers/, core/, utils/ │  Servizi usano provider via Registry
│  orchestration/ → core/, narrator/, ai/, kanka/ │  Orchestratore gestisce StateMachine
│  ai/providers/ → utils/                      │  Provider sono leaf — nessuna dipendenza interna
│  ai/          → ai/providers/, core/, utils/ │  Servizi AI usano provider
│  rag/         → ai/providers/, utils/        │  RAG usa EmbeddingProvider
│  kanka/       → utils/                       │  Kanka è isolato — nessuna dipendenza AI
│  core/        → utils/                       │  Core è quasi-leaf — solo utility
│  utils/       → (nessuna dipendenza)         │  Utility sono leaf puri
└─────────────────────────────────────────────┘
```

**Regole di importazione:**
- `utils/` → **mai** importa da altri layer (leaf puro)
- `core/` → importa solo da `utils/`
- `ai/providers/` → importa solo da `utils/` (interfacce leaf)
- `ui/` → **mai** importa direttamente da `narrator/` o `ai/` — comunica solo via EventBus
- Direzione: `ui → EventBus ← narrator/ai/orchestration`

### Requirements to Structure Mapping

**FR Category → Directory:**

| FR Category | Primary Directory | New Components |
|------------|-------------------|----------------|
| Audio Capture (FR1-6) | `scripts/audio/` | — (nessun cambio) |
| Transcription (FR7-10) | `scripts/ai/` | `TranscriptionProvider` |
| Live AI Assistance (FR11-17) | `scripts/narrator/` | EventBus integration, cache L1 |
| Chronicle Generation (FR18-22) | `scripts/orchestration/` | SessionStateMachine |
| AI Provider Management (FR23-26) | `scripts/ai/providers/` | Intero layer nuovo |
| RAG & Knowledge (FR27-30) | `scripts/rag/` | EmbeddingProvider |
| Session Analytics (FR31-33) | `scripts/narrator/` | EventBus `analytics:` |
| UI & Config (FR34-39) | `scripts/ui/`, `templates/parts/` | PARTS, StreamController |
| Error Handling (FR40-43) | `scripts/core/` | ResilienceRegistry |

**Cross-Cutting Concerns → Location:**

| Concern | File principale | Consumato da |
|---------|----------------|-------------|
| Event Bus | `core/EventBus.mjs` | Tutti i layer |
| State Machine | `core/SessionStateMachine.mjs` | orchestration/, ui/ |
| Resilience | `core/ResilienceRegistry.mjs` | Tutti i servizi API |
| Cache L1 | Inline nei servizi | narrator/, ai/ |
| Cache L2 | `utils/CacheManager.mjs` | ai/providers/ |
| Design Tokens | `styles/tokens/*.css` | templates/, ui/ |
| Streaming | `ai/StreamController.mjs` | ui/ |

### Data Flow

```
Audio Input
    ↓
AudioRecorder → [audio:] EventBus
    ↓
TranscriptionProvider (via ProviderRegistry)
    ↓ ← ResilienceRegistry wraps
    ↓ ← Cache L2 per repeated chunks
TranscriptionService → [ai:transcriptionReady] EventBus
    ↓
SessionOrchestrator (via SessionStateMachine)
    ├─ LIVE mode: narrator services → [ai:suggestionReady] → MainPanel (PARTS render)
    │   ├─ AIAssistant → ChatProvider.chatStream() → StreamController → DOM diretto
    │   ├─ SceneDetector → [scene:changed] → cache L1 invalidation
    │   └─ SessionAnalytics → [analytics:updated]
    │
    └─ CHRONICLE mode: orchestration pipeline
        ├─ EntityProcessor → ChatProvider → [ai:entitiesReady]
        ├─ ImageProcessor → ImageProvider → [ai:imageReady]
        └─ KankaPublisher → [session:publishComplete]
```

## Architecture Validation Results

### Coherence Validation ✅

**Compatibilità decisioni:** Tutte le 8 decisioni si integrano senza conflitti. Event Bus (D1) è il collante universale consumato da tutte le altre 7 decisioni. Nessuna dipendenza circolare, nessun conflitto di pattern.

**Consistenza pattern:** Naming eventi (`canale:azioneCamelCase`), payload sempre oggetto, try/catch solo per logica locale, chiavi cache con formato uniforme — tutti coerenti attraverso i 7 pattern di consistenza.

**Allineamento struttura:** Nuovi file nel layer corretto, regole importazione rispettate, test mirror della struttura source.

### Requirements Coverage Validation ✅

**FR Coverage (43/43):**
- Audio Capture (FR1-6): Struttura esistente, nessun cambio
- Transcription (FR7-10): TranscriptionProvider (D2)
- Live AI Assistance (FR11-17): ChatProvider + EventBus + StreamController + Cache L1 (D1, D2, D4, D7)
- Chronicle Generation (FR18-22): SessionStateMachine + pipeline (D3)
- AI Provider Mgmt (FR23-26): ProviderRegistry + per-capability interfaces (D2)
- RAG & Knowledge (FR27-30): EmbeddingProvider + Cache L2 (D2, D4)
- Session Analytics (FR31-33): EventBus canale `analytics:` (D1)
- UI & Config (FR34-39): PARTS + DOM diretto + Design Tokens + ARIA (D6, D8)
- Error Handling (FR40-43): ResilienceRegistry + State Machine error state (D3, D5)

**NFR Coverage (37/37):** Tutti coperti. NFR critici:
- NFR1 (<3s): Cache L1 + Streaming (D4, D7)
- NFR3 (zero re-render): PARTS + DOM diretto (D6)
- NFR7 (<$2): Cache L1+L2, target 60%+ riduzione API calls (D4)
- NFR19 (nuovi provider): ProviderRegistry.register() (D2)
- NFR29 (circuit breaker): ResilienceRegistry con policy dichiarativa (D5)
- NFR31b (event bus): Observer con canali tipizzati (D1)

**Unico NFR differito:** NFR15 (Knowledge Graph Phase 3) — intenzionalmente posticipato.

### Implementation Readiness ✅

- 8/8 decisioni con rationale, pattern, e componenti affected
- 7 pattern di consistenza con esempi codice ✅/❌
- Directory tree con 15 NEW + 13 REFACTOR marcati
- Data flow diagram per Live e Chronicle mode

### Gap Analysis

**Gap critici:** Nessuno.

**Gap importanti (non bloccanti):**
1. **Ordine refactoring servizi** — da definire nell'epic planning, non qui
2. **NFR15 Knowledge Graph** — differito a Phase 3

### Architecture Completeness Checklist

- [x] Contesto progetto analizzato (brownfield v3.4.x)
- [x] 8 decisioni critiche documentate con rationale
- [x] 7 pattern di consistenza con esempi
- [x] Directory structure completa con NEW/REFACTOR markers
- [x] Layer boundaries e regole importazione definite
- [x] Requirements-to-structure mapping completo (43 FR + 37 NFR)
- [x] Data flow diagram per entrambi i modi

### Architecture Readiness Assessment

**Status:** READY FOR IMPLEMENTATION | **Confidenza:** Alta

**Punti di forza:**
- Architettura event-driven coerente con EventBus come collante universale
- Provider abstraction granulare per-capability — zero vendor lock-in
- State Machine formale — impossibile stati invalidi
- Cache a due livelli — risparmio costi quantificabile

**Enhancement futuri:** Knowledge Graph (Phase 3), monitoring runtime, E2E testing

### Implementation Handoff

**Priorità implementazione:**
1. EventBus + Design Tokens (parallelo)
2. SessionStateMachine
3. ProviderRegistry + interfacce provider
4. OpenAI provider implementations
5. ResilienceRegistry
6. CacheManager L1/L2 refactor
7. StreamController
8. Refactoring servizi esistenti (narrator/, ai/, orchestration/)
9. MainPanel PARTS refactor

**Strategia migrazione — Sostituzione diretta:**
- Ogni componente nuovo **sostituisce** immediatamente il vecchio — nessun adapter, nessuna coesistenza
- I test del servizio refactored vengono aggiornati **nella stessa PR** del refactoring
- Se un servizio viene migrato a EventBus + Provider, i suoi vecchi test vengono riscritti, non mantenuti in parallelo
- I 3888+ test sono una safety net per i servizi **non ancora toccati**, non un vincolo di compatibilità
- Obiettivo: a fine migrazione, zero codice legacy residuo
