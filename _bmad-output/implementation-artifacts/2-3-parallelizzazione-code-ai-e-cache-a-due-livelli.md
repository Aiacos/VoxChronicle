# Story 2.3: Parallelizzazione Code AI e Cache a Due Livelli

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want AI requests to be fast and not block each other, with intelligent caching to reduce costs,
So that suggestions arrive in <3 seconds and each session costs less than $2.

## Acceptance Criteria

1. **Code per-tipo** — Given la coda sequenziale globale in OpenAIClient, When viene sostituita con code per-tipo, Then richieste di tipo diverso (chat, transcription, image) procedono in parallelo
2. **Cache L1 semantica** — Given Cache L1 semantica nei servizi, When un suggerimento viene richiesto per lo stesso contesto (scena+capitolo) entro il TTL (30s-2min), Then il risultato cached viene restituito senza chiamata API
3. **Cache L2 contenuto** — Given Cache L2 contenuto nel provider layer, When una query RAG identica viene fatta entro il TTL (1h+), Then il risultato cached viene restituito
4. **Invalidazione su cambio scena** — Given un cambio scena, When l'evento `scene:changed` viene emesso, Then la cache L1 dei suggerimenti viene invalidata (`narrator:suggestion:*`)
5. **Performance cache** — Given le operazioni di cache, When eseguite (hit o miss), Then completano in meno di 10ms (NFR5)
6. **Riduzione API calls** — Given una sessione di 3 ore con cache attiva, When si contano le chiamate API, Then sono ridotte di almeno il 50% rispetto a senza cache (NFR7)

## Tasks / Subtasks

- [x] Task 1: Refactoring OpenAIClient — code per-tipo invece di coda sequenziale globale (AC: #1)
  - [x] 1.1: Aggiungere supporto `queueCategory` a `_enqueueRequest()` — istanze separate di coda per categoria (`chat`, `transcription`, `image`, `embedding`, `default`)
  - [x] 1.2: Ogni categoria ha il suo flag `_isProcessingQueue` — le code procedono in parallelo
  - [x] 1.3: I metodi `post()`, `postFormData()`, `postStream()` accettano `options.queueCategory`
  - [x] 1.4: Backward compatible: senza `queueCategory` usa la coda `default` (comportamento identico a prima)
  - [x] 1.5: `clearQueue(category?)` supporta pulizia selettiva per categoria o globale
  - [x] 1.6: `getQueueSize(category?)` ritorna size per categoria o totale
  - [x] 1.7: Test in `tests/ai/OpenAIClient.test.js` — test parallelismo tra categorie, backward compat, clearQueue selettivo (minimo 15 nuovi test)

- [x] Task 2: OpenAI provider usano `queueCategory` (AC: #1)
  - [x] 2.1: `OpenAIChatProvider` — passa `queueCategory: 'chat'` a tutte le chiamate `#client`
  - [x] 2.2: `OpenAITranscriptionProvider` — passa `queueCategory: 'transcription'`
  - [x] 2.3: `OpenAIImageProvider` — passa `queueCategory: 'image'`
  - [x] 2.4: `OpenAIEmbeddingProvider` — passa `queueCategory: 'embedding'`
  - [x] 2.5: Test: verificare che ciascun provider passa la categoria corretta

- [x] Task 3: Refactoring CacheManager — aggiungere `invalidatePrefix()` e costruttore L1/L2 (AC: #2, #3, #5)
  - [x] 3.1: Aggiungere metodo `invalidatePrefix(prefix)` — elimina tutte le chiavi che iniziano con il prefix dato
  - [x] 3.2: Aggiungere metodo `setWithTTL(key, value, ttlMs, metadata)` — shortcut che calcola `expiresAt` da TTL in millisecondi
  - [x] 3.3: Aggiungere getter `stats` — ritorna `{ hits, misses, hitRate, size }` per monitoraggio
  - [x] 3.4: Aggiornare `get()` per incrementare contatore hits/misses
  - [x] 3.5: Performance: `invalidatePrefix()` DEVE completare in <10ms per cache con 100 entries (test con performance.now)
  - [x] 3.6: Test in `tests/utils/CacheManager.test.js` — test invalidatePrefix, setWithTTL, stats, performance (minimo 15 nuovi test)

- [x] Task 4: Creare cache L2 nel provider layer — `CachingProviderDecorator` (AC: #3)
  - [x] 4.1: Creare `scripts/ai/providers/CachingProviderDecorator.mjs` — decorator generico che wrappa qualsiasi provider
  - [x] 4.2: Costruttore: `constructor(innerProvider, cache, options = {})` dove `cache` e' un'istanza CacheManager
  - [x] 4.3: Per ChatProvider: cache key = `openai:chat:${hash(JSON.stringify(messages)+model+temperature)}`, TTL configurabile (default 1h)
  - [x] 4.4: Per EmbeddingProvider: cache key = `openai:embedding:${hash(text+model)}`, TTL 24h
  - [x] 4.5: Per TranscriptionProvider: NON cacheable (audio blob diversi ogni volta) — decorator passa attraverso senza cache
  - [x] 4.6: Per ImageProvider: NON cacheable (prompt generativi unici) — decorator passa attraverso senza cache
  - [x] 4.7: `static get capabilities()` delega a `innerProvider.capabilities`
  - [x] 4.8: Supporto `options.skipCache = true` per forzare bypass cache
  - [x] 4.9: Test in `tests/ai/providers/CachingProviderDecorator.test.js` — test cache hit/miss, TTL, skip, non-cacheable passthrough (minimo 20 test)

- [x] Task 5: Integrare cache L1 nei servizi narrator (AC: #2, #4)
  - [x] 5.1: `AIAssistant.mjs` — aggiungere cache L1 per suggerimenti. Chiave: `narrator:suggestion:${sceneType}:${chapterKey}`. TTL: 30s-2min (configurabile). Invalidazione: ascoltare `scene:changed` su EventBus
  - [x] 5.2: `RulesReference.mjs` — aggiungere cache L1 per lookup regole. Chiave: `narrator:rules:${hash(query)}`. TTL: 5min. Invalidazione: su `session:stateChanged`
  - [x] 5.3: Pattern di integrazione: ogni servizio riceve `CacheManager` nel costruttore e `eventBus` per registrare invalidazione
  - [x] 5.4: Test: verificare cache hit, cache miss, invalidazione su evento (minimo 10 test per servizio)

- [x] Task 6: Integrare cache L2 in VoxChronicle singleton (AC: #3)
  - [x] 6.1: In `VoxChronicle.mjs` initialize(), creare istanza CacheManager per L2 (`name: 'l2-provider'`, `maxSize: 200`)
  - [x] 6.2: Wrappare `OpenAIChatProvider` e `OpenAIEmbeddingProvider` con `CachingProviderDecorator` prima di registrare nel ProviderRegistry
  - [x] 6.3: Passare CacheManager L1 ai servizi narrator nel costruttore
  - [x] 6.4: Registrare listener EventBus per invalidazione cache in VoxChronicle
  - [x] 6.5: `resetInstance()` deve pulire tutte le cache (L1 + L2)
  - [x] 6.6: Test: verificare wiring corretto provider → decorator → registry

- [x] Task 7: Aggiungere stringhe i18n per cache/parallelizzazione in tutti gli 8 file lang (AC: tutti)
  - [x] 7.1: Chiavi sotto `VOXCHRONICLE.Cache`:
    - `Hit`: "Cache hit: {key}"
    - `Miss`: "Cache miss: {key}"
    - `Invalidated`: "Cache invalidated: {prefix}"
    - `Stats`: "Cache stats — Hit rate: {rate}%, Size: {size}"
  - [x] 7.2: Chiavi sotto `VOXCHRONICLE.Queue`:
    - `CategoryFull`: "Request queue full for category {category}"
    - `Parallel`: "Processing {count} parallel request queues"
  - [x] 7.3: Aggiornare tutti gli 8 file lang

- [x] Task 8: Eseguire test completi e verificare zero regressioni (AC: tutti)
  - [x] 8.1: `npm test` — tutti i test passano (4996 test, baseline: 4895)
  - [x] 8.2: Nuovi test: 101 test aggiuntivi
  - [x] 8.3: Nessun test preesistente rotto

## Dev Notes

### Pattern Architetturali da Seguire

**Code per-tipo (Task 1)** — Il problema attuale e' che `OpenAIClient` ha UNA sola coda sequenziale globale (`_requestQueue` + `_isProcessingQueue`). Tutte le richieste (chat, transcription, image, embedding) aspettano in fila. La soluzione e' partizionare la coda per categoria, mantenendo la sequenzialita' DENTRO ogni categoria ma permettendo parallelismo TRA categorie.

```javascript
// PRIMA (Story 2.2): coda unica
class OpenAIClient {
  _requestQueue = [];
  _isProcessingQueue = false;

  _enqueueRequest(operation, context, priority) {
    this._requestQueue.push(request);
    this._processQueue();
  }
}

// DOPO (Story 2.3): code per-categoria
class OpenAIClient {
  /** @type {Map<string, { queue: Array, processing: boolean }>} */
  _categoryQueues = new Map();

  _enqueueRequest(operation, context, priority) {
    const category = context.queueCategory ?? 'default';
    if (!this._categoryQueues.has(category)) {
      this._categoryQueues.set(category, { queue: [], processing: false });
    }
    const cat = this._categoryQueues.get(category);
    cat.queue.push(request);
    this._processCategory(category);
  }

  async _processCategory(category) {
    const cat = this._categoryQueues.get(category);
    if (cat.processing) return;
    cat.processing = true;
    try {
      while (cat.queue.length > 0) {
        const request = cat.queue.shift();
        try { request.resolve(await request.operation()); }
        catch (error) { request.reject(error); }
      }
    } finally {
      cat.processing = false;
    }
  }
}
```

**ATTENZIONE backward compatibility:** `_requestQueue` e `_isProcessingQueue` sono usati nei test esistenti (`OpenAIClient.test.js`). La migrazione deve:
1. Rimuovere `_requestQueue` e `_isProcessingQueue`
2. Sostituire con `_categoryQueues` Map
3. `clearQueue()` senza argomenti pulisce TUTTE le categorie
4. `getQueueSize()` senza argomenti ritorna la somma di tutte le categorie
5. Aggiornare TUTTI i test che accedono a `_requestQueue` direttamente

**Cache L2 — Decorator pattern (Task 4):**

```javascript
// CachingProviderDecorator wrappa un provider qualsiasi
class CachingProviderDecorator extends ChatProvider {
  #inner;
  #cache;
  #options;

  constructor(innerProvider, cache, options = {}) {
    super();
    this.#inner = innerProvider;
    this.#cache = cache;
    this.#options = {
      ttl: options.ttl ?? 3600000,  // 1h default
      keyPrefix: options.keyPrefix ?? 'provider',
      cacheable: options.cacheable ?? ['chat', 'embed'],
      ...options
    };
  }

  async chat(messages, options = {}) {
    if (options.skipCache || !this.#options.cacheable.includes('chat')) {
      return this.#inner.chat(messages, options);
    }
    const key = `${this.#options.keyPrefix}:chat:${CacheManager.generateCacheKey(
      JSON.stringify(messages) + (options.model ?? '') + (options.temperature ?? '')
    )}`;
    const cached = this.#cache.get(key);
    if (cached) return cached;
    const result = await this.#inner.chat(messages, options);
    this.#cache.setWithTTL(key, result, this.#options.ttl);
    return result;
  }

  // chatStream NON e' cacheable — delega direttamente
  async *chatStream(messages, options = {}) {
    yield* this.#inner.chatStream(messages, options);
  }

  static get capabilities() { return this.#inner.constructor.capabilities; }
}
```

**NOTA sul Decorator:** `CachingProviderDecorator` estende `ChatProvider` per il type check del ProviderRegistry ma wrappa genericamente. Per EmbeddingProvider, serve un decorator separato o un approccio generico. **Decisione architetturale raccomandata:** creare `CachingChatDecorator` e `CachingEmbeddingDecorator` separati (piu' puliti del monolitico) — oppure un singolo decorator con interface detection (`if (typeof this.#inner.chat === 'function')`).

**Cache L1 — Inline nei servizi (Task 5):**

```javascript
// AIAssistant.mjs — aggiungere cache L1
class AIAssistant {
  #cache;      // CacheManager per L1
  #eventBus;   // per invalidazione

  constructor(openAIClient, options = {}) {
    this.#cache = options.cache ?? new CacheManager({ name: 'l1-suggestions', maxSize: 50 });
    this.#eventBus = options.eventBus;

    // Registrare invalidazione
    this.#eventBus?.on('scene:changed', () => {
      this.#cache.invalidatePrefix('narrator:suggestion:');
    });
    this.#eventBus?.on('session:stateChanged', () => {
      this.#cache.invalidatePrefix('narrator:');
    });
  }

  async getSuggestion(context) {
    const key = `narrator:suggestion:${context.sceneType}:${context.chapter}`;
    const cached = this.#cache.get(key);
    if (cached) return cached;

    const result = await this._generateSuggestion(context);
    this.#cache.setWithTTL(key, result, 60000); // 1 min TTL
    return result;
  }
}
```

### Boundary Architetturali

```
┌──────────────────────────────────────────────────────────┐
│  utils/CacheManager.mjs                                   │
│    → REFACTOR: aggiungere invalidatePrefix, setWithTTL,   │
│      stats (hits/misses/hitRate)                          │
│    NESSUNA nuova dipendenza                               │
├──────────────────────────────────────────────────────────┤
│  ai/OpenAIClient.mjs                                      │
│    → REFACTOR: _categoryQueues Map invece di _requestQueue │
│    → _processCategory(category) per parallelismo          │
│    NESSUNA nuova dipendenza                               │
├──────────────────────────────────────────────────────────┤
│  ai/providers/CachingProviderDecorator.mjs  ← NEW         │
│    → imports CacheManager (utils/)                         │
│    → imports ChatProvider / EmbeddingProvider (providers/) │
│    → wrappa provider concreti                              │
├──────────────────────────────────────────────────────────┤
│  narrator/AIAssistant.mjs                                 │
│    → REFACTOR: accetta CacheManager + eventBus            │
│    → usa cache L1 per suggerimenti                        │
│  narrator/RulesReference.mjs                              │
│    → REFACTOR: accetta CacheManager + eventBus            │
│    → usa cache L1 per lookup regole                       │
├──────────────────────────────────────────────────────────┤
│  core/VoxChronicle.mjs                                    │
│    → REFACTOR: crea cache L1/L2, wrappa provider,         │
│      passa cache ai servizi, registra invalidazione       │
└──────────────────────────────────────────────────────────┘
```

### Codice Esistente Rilevante

**`scripts/ai/OpenAIClient.mjs`** — HTTP client con coda sequenziale globale.
- `_requestQueue: []` — array singolo per tutte le richieste (linea 154)
- `_isProcessingQueue: false` — flag singolo (linea 155)
- `_enqueueRequest(operation, context, priority)` — inserisce nella coda unica (linea 372)
- `_processQueue()` — processa sequenzialmente la coda unica (linea 412)
- `clearQueue()` — svuota la coda unica (linea 448)
- `getQueueSize()` — ritorna size della coda unica (linea 440)
- `request()` — passa `useQueue`, `priority` a `_enqueueRequest` (linea 690)
- **NOTA:** `request()` estrae `queueCategory` gia' potenzialmente: basta aggiungere destrutturazione

**`scripts/utils/CacheManager.mjs`** — Cache LRU generica.
- Ha gia': `set(key, value, expiresAt, metadata)`, `get(key)`, `delete(key)`, `clear()`, `has(key)`, `_trim()` (LRU)
- Manca: `invalidatePrefix(prefix)`, `setWithTTL(key, value, ttlMs)`, `stats` (hits/misses)
- `CacheManager.generateCacheKey(input, prefix)` — hash semplice, riusabile per chiavi L2
- `CacheManager.blobToBase64(blob)` — utility esistente, non toccata

**`scripts/core/EventBus.mjs`** — Canali validi: `['ai', 'audio', 'scene', 'session', 'ui', 'error', 'analytics']`
- Eventi invalidazione cache: `scene:changed`, `session:stateChanged` (da architettura)
- Pattern: `eventBus.on('scene:changed', callback)` / `eventBus.emit('scene:changed', payload)`

**`scripts/narrator/AIAssistant.mjs`** — Attualmente NON ha cache. Costruttore accetta `openAIClient` e `options`. Da aggiungere `options.cache` e `options.eventBus`.

**`scripts/narrator/RulesReference.mjs`** — Attualmente NON ha cache. Da aggiungere analogamente.

**`scripts/core/ResilienceRegistry.mjs`** — Circuit breaker centralizzato. Gia' implementato in Story 1.4. Nella fallback chain, `cache L2` e' l'ultimo fallback prima del messaggio offline: `Provider primario → provider secondario → cache L2 → messaggio offline`. Questo pattern sara' integrato in epic future, NON in questa story.

### Gotchas Critici

1. **Backward compatibility OpenAIClient** — I test esistenti di OpenAIClient accedono direttamente a `._requestQueue` e `._isProcessingQueue`. DEVI aggiornare tutti questi test per usare il nuovo `_categoryQueues`. Cerca con grep: `_requestQueue`, `_isProcessingQueue` nei test.

2. **Provider condividono lo stesso OpenAIClient?** — NO. Ogni provider OpenAI crea la propria istanza di `OpenAIClient` nel costruttore (vedi Story 2.2 pattern). Quindi ogni provider ha gia' la sua coda. La parallelizzazione per-tipo funziona nativamente se i provider sono istanze separate. **VERIFICA PRIMA:** se `VoxChronicle.mjs` crea UN solo OpenAIClient e lo condivide, allora servono le code per-tipo. Se crea istanze separate per provider, la parallelizzazione e' gia' implicita e Task 1 puo' essere semplificato.

3. **`invalidatePrefix()` performance** — Il CacheManager usa `Map`. Iterare tutte le chiavi per prefix matching e' O(n). Per 100 entries (maxSize tipico) e' trascurabile. NON servono strutture dati avanzate (trie, prefix tree). Un semplice `for...of` con `key.startsWith(prefix)` e' sufficiente.

4. **Cache key collision** — `CacheManager.generateCacheKey()` usa un hash semplice (djb2). Per la cache L2, il rischio di collision e' basso per chiavi < 10K chars. Per sicurezza, la chiave include il prefix completo (`openai:chat:hash` vs `openai:embedding:hash`).

5. **chatStream NON e' cacheable** — Lo streaming produce risultati diversi ogni volta (temperatura > 0). Il `CachingProviderDecorator` DEVE passare `chatStream` direttamente al provider interno senza tentare cache.

6. **TTL in millisecondi** — Il metodo `setWithTTL(key, value, ttlMs)` deve accettare TTL in **millisecondi** (non secondi) per consistenza con `setTimeout` e le altre API JS. Il valore viene convertito a `expiresAt = new Date(Date.now() + ttlMs)`.

7. **EventBus listener cleanup** — I listener registrati per invalidazione cache (in AIAssistant, RulesReference) DEVONO essere rimossi al teardown. Usare `AbortController` pattern o `eventBus.off()`. VoxChronicle `resetInstance()` deve triggare la pulizia.

8. **I18n strings sono per debug logging** — Le stringhe cache (`Cache.Hit`, `Cache.Miss`) sono principalmente per debug log, non per UI utente. Aggiungerle comunque in tutti gli 8 file lang per consistenza.

9. **Non refactorare AIAssistant completamente** — Task 5 aggiunge SOLO la cache L1. Non refactorare il costruttore per usare ChatProvider (sara' fatto in Epic 4). Aggiungere `cache` e `eventBus` come opzioni aggiuntive.

10. **CachingProviderDecorator e ProviderRegistry** — Il decorator deve essere trasparente per il registry. `ProviderRegistry.getProvider('chat')` deve ritornare il decorator wrappato, che risponde a `capabilities` come il provider interno.

### Anti-Pattern: Cose da NON Fare

- **NON creare un `RequestScheduler` separato** — la logica di parallelizzazione sta in `OpenAIClient`, non in un nuovo file
- **NON usare `Promise.all` per parallelizzare** — le code per-tipo si parallellizzano naturalmente, ogni categoria ha il suo `_processCategory` loop
- **NON cachare risposte streaming** — `chatStream` e' sempre live
- **NON cachare transcription** — ogni audio blob e' unico
- **NON cachare image generation** — i prompt sono generativi e unici
- **NON aggiungere dipendenza EventBus a CacheManager** — CacheManager e' un utility puro, l'invalidazione e' responsabilita' del consumer
- **NON usare `WeakMap` per la cache** — serve iterazione sulle chiavi per `invalidatePrefix`
- **NON usare `localStorage`/`IndexedDB`** per cache — tutto in memoria, la cache e' volatile per sessione
- **NON creare nuovi canali EventBus** — usare solo quelli esistenti: `scene:changed`, `session:stateChanged`
- **NON modificare le interfacce astratte** (ChatProvider, EmbeddingProvider, etc.) — sono immutabili (Story 2.1)

### Stringhe i18n da Aggiungere

Aggiungere in TUTTI gli 8 file lang sotto le chiavi indicate:

```json
{
  "VOXCHRONICLE": {
    "Cache": {
      "Hit": "Cache hit: {key}",
      "Miss": "Cache miss: {key}",
      "Invalidated": "Cache invalidated: {prefix}",
      "Stats": "Cache stats — Hit rate: {rate}%, Size: {size}"
    },
    "Queue": {
      "CategoryFull": "Request queue full for category {category}",
      "Parallel": "Processing {count} parallel request queues"
    }
  }
}
```

### Testing Standards

- Framework: **Vitest** con `jsdom` environment
- Mock `game` object globale con `i18n.localize` e `i18n.format`
- Per OpenAIClient: mock `fetch` per test parallelismo (verificare che due richieste di categorie diverse procedono contemporaneamente)
- Per CacheManager: test deterministici con `vi.useFakeTimers()` per TTL expiry
- Per CachingProviderDecorator: mock provider interno e CacheManager
- Per AIAssistant/RulesReference cache: mock provider + mock eventBus con `emit()` per trigger invalidazione
- Performance test: `performance.now()` per verificare `invalidatePrefix` < 10ms su 100 entries
- **Baseline test count**: 4895 test — TUTTI devono passare senza regressioni

### Project Structure Notes

Nuovi file da creare (tutti con estensione `.mjs`):
```
scripts/ai/providers/
└── CachingProviderDecorator.mjs       ← NEW

tests/ai/providers/
└── CachingProviderDecorator.test.js   ← NEW
```

File da MODIFICARE:
```
scripts/ai/OpenAIClient.mjs            ← REFACTOR (code per-categoria)
scripts/utils/CacheManager.mjs         ← REFACTOR (invalidatePrefix, setWithTTL, stats)
scripts/ai/providers/OpenAIChatProvider.mjs       ← MODIFY (queueCategory)
scripts/ai/providers/OpenAITranscriptionProvider.mjs ← MODIFY (queueCategory)
scripts/ai/providers/OpenAIImageProvider.mjs      ← MODIFY (queueCategory)
scripts/ai/providers/OpenAIEmbeddingProvider.mjs  ← MODIFY (queueCategory)
scripts/narrator/AIAssistant.mjs       ← REFACTOR (cache L1 + eventBus)
scripts/narrator/RulesReference.mjs    ← REFACTOR (cache L1 + eventBus)
scripts/core/VoxChronicle.mjs          ← MODIFY (cache setup, decorator wiring)
tests/ai/OpenAIClient.test.js          ← UPDATE (code per-categoria)
tests/utils/CacheManager.test.js       ← UPDATE (nuovi metodi)
tests/ai/providers/OpenAIChatProvider.test.js     ← UPDATE (queueCategory)
tests/narrator/AIAssistant.test.js     ← UPDATE (cache L1)
tests/narrator/RulesReference.test.js  ← UPDATE (cache L1)
tests/core/VoxChronicle.test.js        ← UPDATE (cache wiring)
lang/en.json, it.json, de.json, es.json, fr.json, ja.json, pt.json, template.json ← UPDATE (i18n)
```

File da NON toccare:
```
scripts/ai/providers/ChatProvider.mjs              ← INVARIATO (interfaccia immutabile)
scripts/ai/providers/EmbeddingProvider.mjs         ← INVARIATO
scripts/ai/providers/TranscriptionProvider.mjs     ← INVARIATO
scripts/ai/providers/ImageProvider.mjs             ← INVARIATO
scripts/ai/providers/ProviderRegistry.mjs          ← INVARIATO
scripts/ai/TranscriptionService.mjs                ← INVARIATO (no cache per transcription)
scripts/ai/ImageGenerationService.mjs              ← INVARIATO (no cache per images)
scripts/core/EventBus.mjs                          ← INVARIATO
scripts/core/ResilienceRegistry.mjs                ← INVARIATO
scripts/core/SessionStateMachine.mjs               ← INVARIATO
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#4. Caching Strategy]
- [Source: _bmad-output/planning-artifacts/architecture.md#7. Caching — Chiavi e Invalidazione]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Priority]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]
- [Source: _bmad-output/implementation-artifacts/2-2-implementazione-openai-provider.md — previous story learnings]
- [Source: scripts/ai/OpenAIClient.mjs — HTTP transport layer with queue]
- [Source: scripts/utils/CacheManager.mjs — existing cache, needs L1/L2 refactor]
- [Source: scripts/core/EventBus.mjs — invalidation event channels]
- [Source: scripts/narrator/AIAssistant.mjs — L1 cache consumer]
- [Source: scripts/narrator/RulesReference.mjs — L1 cache consumer]
- [Source: CLAUDE.md — coding standards, testing patterns, localization requirements]

### Previous Story Intelligence (Story 2.2)

**Key learnings from Story 2.2:**
- Composizione, non ereditarieta' — pattern stabilito e funzionante
- Ogni provider OpenAI ha la propria istanza di `OpenAIClient` (creata nel costruttore del provider) — le code sono gia' per-provider! Verificare se Task 1 e' ridondante.
- Pattern test: `rejects.toThrow()` per errori async
- Mock factory con `lastMockClient` per catturare istanze private `#client`
- I18n strings: aggiungere in TUTTI gli 8 file lang simultaneamente
- Test baseline cresciuta a 4895 test (da 4813 pre-Story 2.2)
- Commit style: `feat: description (Story X.Y)`

**Code review findings applicabili:**
- Validazione input rigorosa in ogni nuovo metodo
- `_validateOptions()` ereditate dalle interfacce base
- Performance test con `performance.now()` per requisiti NFR5

**Git patterns recenti:**
- `92e5be8 feat: implement OpenAI provider abstraction with code review fixes (Story 2.2)`
- `62d632d feat: add EventBus with typed channels and middleware pipeline (Story 1.2)`
- File naming: `PascalCase.mjs` per classi, `PascalCase.test.js` per test

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Task 1: Replaced `_requestQueue`/`_isProcessingQueue` with `_categoryQueues` Map. Added `_getCategoryQueue()`, `_processCategory()`. `clearQueue(category?)` and `getQueueSize(category?)` support selective/global. 16 new tests, all 114 OpenAIClient tests pass.
- Task 2: All 4 OpenAI providers pass `queueCategory` to `#client` calls (chat, transcription, image, embedding). chatStream also passes category. 5 new tests, all 83 provider tests pass.
- Task 3: Added `setWithTTL(key, value, ttlMs, metadata)`, `invalidatePrefix(prefix)`, `stats` getter. `get()` now tracks hits/misses. Performance test confirms <10ms for 100 entries. 17 new tests, all 62 CacheManager tests pass.
- Task 4: Created `CachingChatDecorator` and `CachingEmbeddingDecorator` in CachingProviderDecorator.mjs. Chat uses 1h TTL, embed uses 24h TTL. chatStream passes through without caching. skipCache option supported. 33 new tests, all pass.
- Task 5: Added L1 cache to AIAssistant (analyzeContext, scene:changed invalidation) and RulesReference (searchRules, session:stateChanged invalidation). Both accept optional cache+eventBus in constructor. 11 new AIAssistant tests + 10 new RulesReference tests, all 361 narrator tests pass.
- Task 6: VoxChronicle singleton wiring — L2 CacheManager('l2-provider', maxSize:200) created in initialize(), CachingChatDecorator and CachingEmbeddingDecorator wrap providers before registry, L1 caches + eventBus passed to AIAssistant and RulesReference constructors, resetInstance() clears all caches. 10 new tests, all 110 VoxChronicle tests pass.
- Task 7: Added Cache.Hit/Miss/Invalidated/Stats and Queue.CategoryFull/Parallel i18n strings to all 8 lang files (en, it, de, es, fr, ja, pt, template) with proper translations.
- Task 8: Full regression run — 4996 tests pass across 69 test files, 0 failures. 101 new tests added in this story (baseline was 4895).

### Change Log

- 2026-03-12: Tasks 1-5 completed — per-category queues, provider queueCategory, CacheManager enhancements, CachingProviderDecorator, L1 cache in narrator services
- 2026-03-12: Tasks 6-8 completed — L2 cache wiring in VoxChronicle singleton, i18n strings, full regression pass (4996 tests)
- 2026-03-13: Code review (adversarial, 3 parallel agents) — 4 CRITICAL + 8 HIGH issues found and fixed:
  - C1: `scene:changed` never emitted — documented as TODO for Epic 4 (SceneDetector wiring)
  - C2: EventBus listener memory leak — added `destroy()` to AIAssistant + RulesReference, called in VoxChronicle resetInstance/reinitialize
  - C3: `invalidatePrefix` Map mutation during iteration — collect-then-delete pattern
  - C4: `capabilities` hard-coded in decorators — added instance-level delegation to inner provider
  - H1: `queueCategory` silently ignored in `postStream` — removed from chatStream call, added clarifying comment
  - H2: `_processCategory` fire-and-forget without `.catch()` — added error logging catch
  - H3: `skipCache` leaked to inner provider — destructured out before forwarding
  - H4: Cache key missing `maxTokens`/`responseFormat` — added to key generation
  - H5: Stats counters not reset on `clear()` — reset `_hits`/`_misses`
  - H6: `options._cacheKey` mutated caller object — replaced with `this._pendingCacheKey`
  - H7: Stale `_requestQueue` comment in tests — updated to `_categoryQueues`
  - Full regression: 4996 tests pass, 0 failures

### File List

- scripts/ai/OpenAIClient.mjs — MODIFIED (per-category queues)
- scripts/utils/CacheManager.mjs — MODIFIED (invalidatePrefix, setWithTTL, stats)
- scripts/ai/providers/OpenAIChatProvider.mjs — MODIFIED (queueCategory: 'chat')
- scripts/ai/providers/OpenAITranscriptionProvider.mjs — MODIFIED (queueCategory: 'transcription')
- scripts/ai/providers/OpenAIImageProvider.mjs — MODIFIED (queueCategory: 'image')
- scripts/ai/providers/OpenAIEmbeddingProvider.mjs — MODIFIED (queueCategory: 'embedding')
- tests/ai/OpenAIClient.test.js — MODIFIED (+16 tests per-category queues)
- tests/ai/providers/OpenAIChatProvider.test.js — MODIFIED (+2 tests queueCategory)
- tests/ai/providers/OpenAITranscriptionProvider.test.js — MODIFIED (+1 test queueCategory)
- tests/ai/providers/OpenAIImageProvider.test.js — MODIFIED (+1 test queueCategory)
- tests/ai/providers/OpenAIEmbeddingProvider.test.js — MODIFIED (+1 test queueCategory)
- tests/utils/CacheManager.test.js — MODIFIED (+17 tests new methods)
- scripts/ai/providers/CachingProviderDecorator.mjs — NEW (CachingChatDecorator, CachingEmbeddingDecorator)
- tests/ai/providers/CachingProviderDecorator.test.js — NEW (+33 tests)
- scripts/narrator/AIAssistant.mjs — MODIFIED (L1 cache + eventBus invalidation)
- scripts/narrator/RulesReference.mjs — MODIFIED (L1 cache + eventBus invalidation)
- tests/narrator/AIAssistant.test.js — MODIFIED (+11 tests L1 cache)
- tests/narrator/RulesReference.test.js — MODIFIED (+10 tests L1 cache)
- scripts/core/VoxChronicle.mjs — MODIFIED (L2 cache creation, decorator wiring, L1 cache pass to narrator, cache cleanup in resetInstance)
- tests/core/VoxChronicle.test.js — MODIFIED (+10 tests cache wiring, updated 3 existing tests)
- lang/en.json — MODIFIED (+6 i18n strings Cache/Queue)
- lang/it.json — MODIFIED (+6 i18n strings Cache/Queue)
- lang/de.json — MODIFIED (+6 i18n strings Cache/Queue)
- lang/es.json — MODIFIED (+6 i18n strings Cache/Queue)
- lang/fr.json — MODIFIED (+6 i18n strings Cache/Queue)
- lang/ja.json — MODIFIED (+6 i18n strings Cache/Queue)
- lang/pt.json — MODIFIED (+6 i18n strings Cache/Queue)
- lang/template.json — MODIFIED (+6 i18n strings Cache/Queue)
