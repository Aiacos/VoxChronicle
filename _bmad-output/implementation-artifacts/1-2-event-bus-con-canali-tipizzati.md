# Story 1.2: Event Bus con Canali Tipizzati

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an internal event bus with typed channels,
so that services communicate without direct coupling and the UI reacts to events without importing service code.

## Acceptance Criteria

1. **Emit & Subscribe** — Un servizio emette un evento su un canale (es. `ai:suggestionReady`) e tutti i subscriber di quel canale ricevono l'evento con payload oggetto
2. **Channel Isolation** — I canali `ai:`, `audio:`, `scene:`, `session:`, `ui:`, `error:`, `analytics:` sono isolati: solo i subscriber del canale specifico vengono notificati
3. **Unsubscribe** — Un subscriber de-registrato non riceve piu' eventi
4. **Performance** — Con 50 subscriber concorrenti, il dispatch completa in meno di 1ms (NFR18)
5. **Logging Middleware** — In dev mode, un middleware di logging registra canale, evento e payload
6. **Test Coverage** — Il file `tests/core/EventBus.test.js` copre emit, subscribe, unsubscribe, canali, middleware, e performance

## Tasks / Subtasks

- [x] Task 1: Creare `scripts/core/EventBus.mjs` (AC: #1, #2, #3)
  - [x] 1.1: Classe EventBus con constructor che inizializza mappa canali e array middleware
  - [x] 1.2: Metodo `on(channel:event, callback)` — registra subscriber, ritorna funzione unsubscribe
  - [x] 1.3: Metodo `off(channel:event, callback)` — rimuove subscriber specifico
  - [x] 1.4: Metodo `emit(channel:event, payload)` — dispatcha a tutti i subscriber del canale:evento, valida payload oggetto
  - [x] 1.5: Metodo `once(channel:event, callback)` — subscriber che si auto-rimuove dopo prima invocazione
  - [x] 1.6: Parsing nome evento: split su primo `:` per separare canale da azione (es. `ai:suggestionReady` -> canale `ai`, azione `suggestionReady`)
  - [x] 1.7: Validazione canale: solo canali registrati (`ai`, `audio`, `scene`, `session`, `ui`, `error`, `analytics`), throw Error per canali sconosciuti
  - [x] 1.8: Validazione payload: deve essere oggetto (non null, non array, non primitivo), throw TypeError se violato
  - [x] 1.9: Export singleton `eventBus` e classe `EventBus`

- [x] Task 2: Middleware system (AC: #5)
  - [x] 2.1: Metodo `use(middlewareFn)` — aggiunge middleware alla pipeline
  - [x] 2.2: Middleware signature: `(channel, event, payload, next) => void` — chain of responsibility
  - [x] 2.3: Creare `loggingMiddleware` builtin che logga con `Logger.createChild('EventBus')` quando debug mode attivo
  - [x] 2.4: Registrare logging middleware automaticamente in constructor, attivato solo se `Logger.isDebugMode()` (NON `game.settings.get()`)

- [x] Task 3: Performance optimization (AC: #4)
  - [x] 3.1: Usare `Map<string, Set<Function>>` per subscriber — O(1) lookup, O(n) dispatch
  - [x] 3.2: Dispatch sincrono (niente Promise/async nel path critico emit)
  - [x] 3.3: Snapshot subscriber array per dispatch sicuro con once() self-removal
  - [x] 3.4: Test performance: 50 subscriber dispatch < 5ms (con warmup JIT)

- [x] Task 4: Utility methods
  - [x] 4.1: Metodo `removeAllListeners(channel?)` — cleanup per testing e teardown
  - [x] 4.2: Metodo `listenerCount(channel:event)` — utile per debugging
  - [x] 4.3: Metodo `channels()` — ritorna lista canali registrati (frozen array)

- [x] Task 5: Creare `tests/core/EventBus.test.js` (AC: #6)
  - [x] 5.1: Test emit/subscribe base con payload oggetto
  - [x] 5.2: Test channel isolation — evento su `ai:` non notifica subscriber di `scene:`
  - [x] 5.3: Test unsubscribe via `off()` e via funzione ritornata da `on()`
  - [x] 5.4: Test `once()` — callback invocato solo una volta
  - [x] 5.5: Test middleware pipeline — logging middleware registra correttamente
  - [x] 5.6: Test validazione canale sconosciuto → Error
  - [x] 5.7: Test validazione payload non-oggetto → TypeError
  - [x] 5.8: Test `removeAllListeners` — con e senza filtro canale
  - [x] 5.9: Test `listenerCount` — conta corretta
  - [x] 5.10: Test performance — 50 subscriber, dispatch < 5ms (con warmup)
  - [x] 5.11: Test subscriber che lancia eccezione non blocca altri subscriber
  - [x] 5.12: Test emit senza subscriber — nessun errore
  - [x] 5.13: Test middleware che lancia eccezione non blocca dispatch ai subscriber
  - [x] 5.14: Test `once()` callback invocato esattamente una volta anche se evento emesso da dentro un subscriber

- [x] Task 6: Chiavi i18n per EventBus
  - [x] 6.1: Aggiungere in tutti 8 file lang: `VOXCHRONICLE.EventBus.Error.ChannelNotFound`, `VOXCHRONICLE.EventBus.Error.InvalidPayload`
  - [x] 6.2: Usare `game?.i18n?.localize()` nei messaggi di errore con fallback string

## Dev Notes

### Architettura e Pattern

- **Posizione file**: `scripts/core/EventBus.mjs` — nella directory core perche' e' fondamento di tutto il sistema
- **Posizione test**: `tests/core/EventBus.test.js`
- **Stack**: JavaScript ES6+ `.mjs`, nessuna dipendenza esterna
- **Export**: sia la classe `EventBus` (per testing/reset) che il singleton `eventBus` (per uso applicativo)
- **Singleton**: usare pattern module-level `const eventBus = new EventBus()` — NON il pattern `getInstance()` perche' non serve reset runtime, solo test reset

### Convenzioni Naming Eventi (da Architecture doc)

**Formato**: `canale:azioneCamelCase`

| Canale | Scopo | Esempi eventi |
|--------|-------|---------------|
| `ai:` | Operazioni AI | `ai:suggestionReady`, `ai:streamStart`, `ai:token`, `ai:streamEnd`, `ai:streamError` |
| `audio:` | Pipeline audio | `audio:chunkReady`, `audio:recordingStarted`, `audio:recordingStopped` |
| `scene:` | Cambi scena/contesto | `scene:changed`, `scene:typeDetected` |
| `session:` | Ciclo di vita sessione | `session:stateChanged`, `session:started`, `session:completed` |
| `ui:` | Azioni UI | `ui:panelOpened`, `ui:tabChanged` |
| `error:` | Errori sistema | `error:apiFailure`, `error:circuitOpen` |
| `analytics:` | Metriche sessione | `analytics:speakerChanged`, `analytics:silenceDetected` |

**Azioni standard**: `ready`, `changed`, `started`, `completed`, `failed`, `cancelled`

**Payload**: SEMPRE oggetto, MAI primitivi diretti:
```javascript
// Corretto
eventBus.emit('ai:suggestionReady', { type: 'narration', content: '...', sceneType: 'combat' });

// Errato — lancia TypeError
eventBus.emit('ai:suggestionReady', 'some string');
```

### Decisioni Chiave di Implementazione

1. **Dispatch sincrono**: L'emit NON deve essere async. I subscriber che necessitano operazioni async gestiscono internamente la Promise. Questo garantisce performance < 1ms (NFR18).

2. **Validazione strict canali**: Solo i 7 canali predefiniti sono permessi (`ai`, `audio`, `scene`, `session`, `ui`, `error`, `analytics`). Canali custom lanciano Error con messaggio i18n `VOXCHRONICLE.EventBus.Error.ChannelNotFound`. Questo previene typo silenti.

3. **Error isolation subscriber**: Se un subscriber lancia un'eccezione, gli altri subscriber devono comunque essere notificati. Usare try/catch interno nel loop di dispatch e loggare l'errore con Logger.

4. **Unsubscribe return value**: `on()` ritorna una funzione di cleanup. Questo pattern e' preferibile perche' non richiede di mantenere un riferimento alla callback (utile per arrow functions e bound methods).

5. **Middleware chain**: I middleware eseguono prima del dispatch ai subscriber. Possono modificare il payload o interrompere la chain non chiamando `next()`. Il logging middleware NON modifica il payload. Se un middleware lancia eccezione, il dispatch ai subscriber deve comunque avvenire (stessa error isolation dei subscriber).

6. **Middleware `filtering` e `event replay` differiti**: L'architecture doc menziona anche middleware di filtering e event replay per debug. Questi sono fuori scope per questa story ma la signature `(channel, event, payload, next)` li supportera' senza modifiche. Il dev agent NON deve implementarli ora.

7. **i18n safety**: I messaggi di errore usano `game?.i18n?.localize('...') ?? 'fallback string'` perche' l'EventBus si istanzia prima che `game` sia disponibile (prima dell'hook `init`).

### Codice Esistente da Riusare

- `Logger.createChild('EventBus')` — per logging middleware e errori (`scripts/utils/Logger.mjs`)
- `MODULE_ID` da `scripts/constants.mjs` — per chiavi i18n
- `Logger.isDebugEnabled()` — check debug mode sicuro (incapsula `game.settings.get()` con guard), usare questo nel logging middleware anziche' accedere `game.settings` direttamente
- Pattern test mock: copiare struttura da `tests/core/VoxChronicle.test.js` per mock `game` globale

### Anti-Pattern da Evitare

- **NON** usare `EventEmitter` di Node.js — siamo in browser, zero dipendenze
- **NON** rendere emit async — distrugge la performance e complica il flusso
- **NON** usare wildcard matching (`ai:*`) — complessita' non necessaria per v1, puo' essere aggiunto dopo
- **NON** aggiungere event replay, event sourcing, o filtering middleware — fuori scope per questa story (la signature middleware li supportera' nativamente)
- **NON** importare niente da `orchestration/` o `ui/` — EventBus e' un leaf module in `core/`
- **NON** creare interfacce/tipi TypeScript — il progetto e' JavaScript puro con JSDoc

### Compatibilita' con Story Future

- **Story 1.3 (State Machine)**: La state machine emettera' `session:stateChanged` con payload `{ from, to, event, timestamp }` su questo EventBus
- **Story 1.4 (ResilienceRegistry)**: Gli errori circuiteranno su `error:circuitOpen`
- **Epic 2 (AI Provider)**: Lo streaming emettera' `ai:streamStart`, `ai:token`, `ai:streamEnd`
- **Epic 3 (Audio)**: L'AudioRecorder emettera' su canale `audio:` (per questo il canale e' gia' incluso)
- **Epic 6 (UI Panel)**: La UI si subscribera' a eventi per aggiornare PARTS senza importare servizi. Le subscription fatte in `_onRender()` dovranno usare il pattern AbortController per cleanup (da CLAUDE.md)

### Testing Standards

- File test mirror: `tests/core/EventBus.test.js`
- Mock `game`, `ui` come globali
- Pattern: `describe('EventBus') > describe('methodName') > it('should...')`
- Performance test: usare `performance.now()` — eseguire un warmup loop prima della misurazione per evitare JIT cold start, usare soglia 5ms nel test (NFR18 target 1ms, margine per CI/jsdom)
- Ogni AC ha almeno un test diretto
- Usare `beforeEach(() => eventBus.removeAllListeners())` oppure creare `new EventBus()` per ogni test per evitare subscriber leakage tra test

### Project Structure Notes

- `scripts/core/EventBus.mjs` — NUOVO file, posizione definita nell'architecture doc
- `tests/core/EventBus.test.js` — NUOVO file test
- `lang/*.json` (8 file) — aggiungere 2 chiavi i18n per errori EventBus
- Nessun file esistente modificato — questa e' una story puramente additiva
- Nessuna modifica a `module.json` — i file `.mjs` non richiedono registrazione esplicita

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#1. Event Bus Architecture] — Pattern Observer + canali + middleware
- [Source: _bmad-output/planning-artifacts/architecture.md#1. Event Bus — Naming e Payload] — Convenzioni naming eventi e payload
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision Impact Analysis] — EventBus e' fondamento, dipendenza di tutte le altre decisioni
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] — Posizione file `scripts/core/EventBus.mjs`
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — Acceptance criteria BDD
- [Source: _bmad-output/planning-artifacts/epics.md#NFR18] — Performance < 1ms per 50 subscriber
- [Source: _bmad-output/implementation-artifacts/1-1-fix-bug-critici-e-importanti.md] — Pattern e learnings dalla Story 1.1
- [Source: CLAUDE.md#Code Patterns] — Singleton pattern, Logger, Settings, test mock patterns

### Learnings dalla Story 1.1

- **Ordine per file**: Raggruppare i task per file minimizza il context switching (applicato qui: un solo file produzione + un solo file test)
- **Test dopo ogni task**: Eseguire `npm test` dopo ogni task per catturare regressioni immediamente
- **onSessionEnd callback pattern**: Story 1.1 ha introdotto callback per evitare dipendenze circolari — stesso principio si applica all'EventBus (i servizi si subscribono, non importano altri servizi)
- **Set per collezioni**: Story 1.1 ha migrato `_reindexQueue` da `string|null` a `Set` — stesso approccio per subscriber nell'EventBus
- **Shallow copy pattern**: Story 1.1 ha corretto mutazioni accidentali — l'EventBus NON deve mutare i payload (i middleware possono, ma il default logging no)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- All 6 tasks completed in single session. 32 new tests, all passing.
- EventBus class: 7 channels (ai, audio, scene, session, ui, error, analytics), Map<string, Set<Function>> subscriber storage, middleware chain of responsibility with error isolation, synchronous dispatch, `once()` with snapshot-safe self-removal.
- Logging middleware uses `Logger.isDebugMode()` (not `game.settings.get()`) for safe pre-init usage.
- i18n errors use `game?.i18n?.localize()` with fallback strings for pre-init safety.
- Full regression: 4641 tests pass across 57 files (0 failures). +32 new tests, +1 new test file.

### File List

- scripts/core/EventBus.mjs (new — EventBus class + singleton export)
- tests/core/EventBus.test.js (new — 33 tests covering all 6 ACs)
- lang/en.json (modified — added EventBus.Error.InvalidFormat, ChannelNotFound, InvalidPayload)
- lang/it.json (modified — added EventBus i18n keys)
- lang/de.json (modified — added EventBus i18n keys)
- lang/es.json (modified — added EventBus i18n keys)
- lang/fr.json (modified — added EventBus i18n keys)
- lang/ja.json (modified — added EventBus i18n keys)
- lang/pt.json (modified — added EventBus i18n keys)
- lang/template.json (modified — added EventBus i18n keys)

### Senior Developer Review (AI)

**Reviewer:** Aiacos (Claude Opus 4.6) — 2026-03-09

**Issues found:** 1 HIGH, 3 MEDIUM, 3 LOW

**Fixed (4):**
- **H1** Dead code in `emit()` — removed unused `middlewareAllowed`, `chain` copy, and `runChain` function
- **M1** Same i18n key for two different errors — added `VOXCHRONICLE.EventBus.Error.InvalidFormat` key (8 lang files)
- **M3** Middleware error isolation asymmetric — throwing middleware now continues to next middleware (matching subscriber behavior). Added test.
- Test added: "should continue to next middleware when one throws" (test #33)

**Noted (not fixed):**
- **M2** `SessionOrchestrator.mjs` has 3 uncommitted changes from post-Story 1.1 work (not part of Story 1.2 scope — should be committed separately)

**LOW (not fixed — accepted):**
- **L1** No callback type validation in `on()`/`once()` — acceptable, fails at emit time
- **L2** `off()` doesn't validate event name format — acceptable, lenient teardown
- **L3** `listenerCount()` doesn't validate event name — acceptable, query-only method

**All 6 ACs verified as IMPLEMENTED. 4642 tests pass (0 regressions).**

## Change Log

- 2026-03-09: All 6 tasks completed. EventBus with 7 typed channels, middleware pipeline, error isolation, and 32 tests. 4641 tests pass, 0 regressions.
- 2026-03-09: Code review completed. Fixed H1 (dead code), M1 (i18n key separation), M3 (middleware error isolation). 4642 tests pass (+1 new test).
