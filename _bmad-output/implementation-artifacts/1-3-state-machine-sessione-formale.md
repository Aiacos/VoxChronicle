# Story 1.3: State Machine Sessione Formale

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want the session to always be in a valid state,
so that I never encounter corrupted states requiring a manual page refresh.

## Acceptance Criteria

1. **Transizioni Valide** — Given la matrice di transizione definita (idle, configuring, live, transitioning, chronicle, publishing, complete, error), When viene richiesta una transizione valida, Then lo stato cambia e un evento `session:stateChanged` viene emesso su EventBus con `{ from, to, event, timestamp }`
2. **Transizioni Invalide** — Given lo stato corrente, When viene richiesta una transizione non definita nella matrice, Then la transizione viene rifiutata e lo stato resta invariato
3. **Guard Conditions** — Given una guard condition (es. non puo' passare a `chronicle` senza transcript), When la guard fallisce, Then la transizione non avviene
4. **Errore Critico** — Given lo stato corrente, When si verifica un errore critico, Then la macchina transita a stato `error` e l'evento viene emesso
5. **Serializzazione Stato** — Given lo stato e' serializzato in localStorage, When il browser viene ricaricato, Then lo stato puo' essere ripristinato (NFR36)
6. **Test Coverage** — Given la State Machine, When si scrivono test, Then `tests/core/SessionStateMachine.test.js` copre tutte le transizioni, guard, serializzazione e casi invalidi

## Tasks / Subtasks

- [x] Task 1: Creare `scripts/core/SessionStateMachine.mjs` (AC: #1, #2, #4)
  - [x] 1.1: Definire costanti `SessionState` con tutti gli 8 stati: `idle`, `configuring`, `live`, `transitioning`, `chronicle`, `publishing`, `complete`, `error`
  - [x] 1.2: Definire matrice transizioni dichiarativa come oggetto (NO if/else sparsi):
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
  - [x] 1.3: Classe `SessionStateMachine` con constructor che accetta stato iniziale (default `idle`) e referenza `eventBus`
  - [x] 1.4: Metodo `transition(event, context = {})` — controlla matrice, esegue guard se presente, cambia stato, emette `session:stateChanged` su EventBus
  - [x] 1.5: Metodo `canTransition(event)` — ritorna boolean senza side effects, utile per UI (disabilitare bottoni)
  - [x] 1.6: Proprietà `state` getter — ritorna lo stato corrente (readonly)
  - [x] 1.7: Il metodo `transition()` DEVE lanciare `Error` per eventi non definiti nella matrice dello stato corrente
  - [x] 1.8: Gestione `RETRY` nel stato `error`: il valore `null` nella matrice significa che RETRY deve usare lo stato precedente (`from`) come destinazione — implementare tracking di `_previousState`
  - [x] 1.9: Export sia la classe `SessionStateMachine` che le costanti `SessionState` e `SessionEvent`

- [x] Task 2: Guard system (AC: #3)
  - [x] 2.1: Metodo `addGuard(event, guardFn)` — registra guard condition per un evento specifico
  - [x] 2.2: Guard signature: `(currentState, event, context) => boolean` — funzione pura, ritorna `true` per permettere la transizione
  - [x] 2.3: Se la guard ritorna `false`, il `transition()` deve ritornare `false` (transizione rifiutata) senza lanciare errore
  - [x] 2.4: Supporto multiple guard per lo stesso evento — tutte devono passare (AND logic)
  - [x] 2.5: Guard predefinite da aggiungere come esempio nel test (non hardcoded nella classe):
    - `TRANSITION_DONE` → context deve contenere `transcript` (non vuoto)
    - `START_PUBLISH` → context deve contenere `entities` (array con almeno 1 elemento)

- [x] Task 3: Integrazione EventBus (AC: #1, #4)
  - [x] 3.1: Importare `eventBus` singleton da `scripts/core/EventBus.mjs`
  - [x] 3.2: Ogni transizione riuscita emette `session:stateChanged` con payload `{ from, to, event, timestamp }`
  - [x] 3.3: L'emit avviene DOPO il cambio di stato (il getter `state` deve gia' ritornare il nuovo stato)
  - [x] 3.4: Transizioni fallite (guard o matrice) NON emettono eventi
  - [x] 3.5: Il parametro `eventBus` nel constructor e' opzionale — se non fornito, nessun emit (utile per test unitari senza mock EventBus)

- [x] Task 4: Serializzazione stato (AC: #5)
  - [x] 4.1: Metodo `serialize()` — ritorna oggetto `{ state, previousState, timestamp }` serializzabile in JSON
  - [x] 4.2: Metodo statico `SessionStateMachine.deserialize(data, eventBus)` — crea nuova istanza con stato ripristinato
  - [x] 4.3: La serializzazione NON include guard (sono funzioni, non serializzabili) — le guard devono essere ri-registrate dopo deserializzazione
  - [x] 4.4: Validazione nel deserialize: se lo stato salvato non e' valido, ritornare macchina in stato `idle` con warning via Logger

- [x] Task 5: Utility methods
  - [x] 5.1: Metodo `getAvailableTransitions()` — ritorna lista eventi possibili dallo stato corrente (utile per UI)
  - [x] 5.2: Metodo `isInState(...states)` — ritorna `true` se lo stato corrente e' uno di quelli forniti (varargs)
  - [x] 5.3: Metodo `reset()` — forza stato a `idle`, emette evento se EventBus presente

- [x] Task 6: Creare `tests/core/SessionStateMachine.test.js` (AC: #6)
  - [x] 6.1: Test transizione valida — stato cambia e evento emesso
  - [x] 6.2: Test transizione invalida — stato invariato, errore lanciato
  - [x] 6.3: Test guard che blocca transizione — ritorno `false`, nessun errore
  - [x] 6.4: Test guard multipla (AND logic) — una sola guard che fallisce blocca
  - [x] 6.5: Test `canTransition()` — verifica corretta senza side effects
  - [x] 6.6: Test CRITICAL_ERROR da qualsiasi stato live → error
  - [x] 6.7: Test RECOVER da error → idle
  - [x] 6.8: Test RETRY da error → previousState
  - [x] 6.9: Test serializzazione → deserializzazione round-trip
  - [x] 6.10: Test deserializzazione con stato invalido → fallback idle
  - [x] 6.11: Test getAvailableTransitions per ogni stato
  - [x] 6.12: Test isInState con singolo e multipli stati
  - [x] 6.13: Test reset() — stato torna idle, evento emesso
  - [x] 6.14: Test transizione senza EventBus — nessun errore, nessun emit
  - [x] 6.15: Test catena completa: idle → configuring → live → transitioning → chronicle → publishing → complete → idle

- [x] Task 7: Chiavi i18n per SessionStateMachine
  - [x] 7.1: Aggiungere in tutti 8 file lang: `VOXCHRONICLE.Session.State.{Idle,Configuring,Live,Transitioning,Chronicle,Publishing,Complete,Error}` — nomi leggibili per UI
  - [x] 7.2: Aggiungere `VOXCHRONICLE.Session.Error.InvalidTransition`, `VOXCHRONICLE.Session.Error.GuardFailed`
  - [x] 7.3: Usare `game?.i18n?.localize()` con fallback string (stessa safety dell'EventBus per pre-init)

## Dev Notes

### Architettura e Pattern

- **Posizione file**: `scripts/core/SessionStateMachine.mjs` — nella directory core, e' fondamento dell'orchestrazione
- **Posizione test**: `tests/core/SessionStateMachine.test.js`
- **Stack**: JavaScript ES6+ `.mjs`, dipendenza solo su `EventBus.mjs` e `Logger.mjs`
- **Export**: classe `SessionStateMachine`, costanti `SessionState`, costanti `SessionEvent`
- **Pattern**: NON e' un singleton — viene istanziata da `SessionOrchestrator` che la possiede

### Relazione con SessionOrchestrator Esistente

**CRITICO — Il dev agent deve capire questa relazione:**

L'attuale `SessionOrchestrator` (riga 28-41) definisce i propri `SessionState` e gestisce le transizioni con if/else sparsi nel codice. La Story 1.3 NON modifica SessionOrchestrator — crea solo il componente `SessionStateMachine` come modulo standalone.

**Stati attuali in SessionOrchestrator (da NON confondere):**
```javascript
// ATTUALE (SessionOrchestrator.mjs:28-41) — NON toccare
const SessionState = {
  IDLE: 'idle', RECORDING: 'recording', PAUSED: 'paused',
  PROCESSING: 'processing', EXTRACTING: 'extracting',
  GENERATING_IMAGES: 'generating_images', PUBLISHING: 'publishing',
  COMPLETE: 'complete', ERROR: 'error',
  LIVE_LISTENING: 'live_listening', LIVE_TRANSCRIBING: 'live_transcribing',
  LIVE_ANALYZING: 'live_analyzing'
};
```

**Nuovi stati in SessionStateMachine (da Architecture doc):**
```javascript
// NUOVO (SessionStateMachine.mjs) — creare questo
export const SessionState = {
  IDLE: 'idle', CONFIGURING: 'configuring', LIVE: 'live',
  TRANSITIONING: 'transitioning', CHRONICLE: 'chronicle',
  PUBLISHING: 'publishing', COMPLETE: 'complete', ERROR: 'error'
};
```

**Differenze chiave:**
- I 12 stati attuali dell'Orchestratore vengono collassati in 8 stati semantici
- `RECORDING`, `PAUSED` → diventano sotto-stati interni al modo `LIVE` (non gestiti dalla state machine)
- `EXTRACTING`, `GENERATING_IMAGES` → diventano sotto-fasi di `CHRONICLE`
- `LIVE_LISTENING`, `LIVE_TRANSCRIBING`, `LIVE_ANALYZING` → sotto-stati di `LIVE`
- L'integrazione completa con SessionOrchestrator avverra' in story future (refactoring orchestrazione)

**Il dev agent NON deve:**
- Modificare `SessionOrchestrator.mjs`
- Rinominare o rimuovere le costanti `SessionState` esistenti nell'Orchestratore
- Creare dipendenze da SessionOrchestrator verso SessionStateMachine (ancora)

### Decisioni Chiave di Implementazione

1. **Matrice dichiarativa**: Le transizioni sono definite come oggetto statico, non come logica if/else. Questo rende la state machine verificabile e documentabile automaticamente.

2. **EventBus opzionale**: Il constructor accetta `eventBus` come parametro opzionale. Questo permette test unitari puri senza mock dell'EventBus. Quando presente, ogni transizione riuscita emette `session:stateChanged`.

3. **Guard come funzioni pure**: Le guard sono `(state, event, context) => boolean`. Non hanno side effects. Questo le rende testabili indipendentemente dalla state machine.

4. **RETRY con previousState**: Lo stato `error` ha una transizione speciale `RETRY` con destinazione `null`. Questo significa che il RETRY torna allo stato precedente (before error). Implementare con `_previousState` field.

5. **Naming convention eventi**: I nomi eventi della matrice sono SCREAMING_SNAKE_CASE (`START_CONFIG`, `END_LIVE`). Esportare come costanti `SessionEvent`.

6. **Error per transizioni invalide**: `transition()` lancia `Error` se l'evento non e' definito nella matrice dello stato corrente. Questo e' diverso da una guard che fallisce (che ritorna `false` senza lanciare).

7. **i18n safety**: Stessa pattern dell'EventBus — `game?.i18n?.localize('...') ?? 'fallback'` per pre-init safety.

### Codice Esistente da Riusare

- `eventBus` singleton da `scripts/core/EventBus.mjs` — per emettere `session:stateChanged`
- `Logger.createChild('SessionStateMachine')` da `scripts/utils/Logger.mjs`
- Pattern test mock: copiare struttura da `tests/core/EventBus.test.js` per mock EventBus

### Anti-Pattern da Evitare

- **NON** usare librerie state machine esterne (xstate, machina) — zero dipendenze, il progetto e' browser-only senza bundler
- **NON** modificare `SessionOrchestrator.mjs` — l'integrazione e' in story future
- **NON** rendere le transizioni async — la state machine e' sincrona, i side effects sono gestiti dai subscriber EventBus
- **NON** hardcodare guard nella state machine — le guard sono registrate esternamente via `addGuard()`
- **NON** importare da `orchestration/` o `ui/` — SessionStateMachine e' un leaf module in `core/`
- **NON** confondere `SessionState` della state machine con il `SessionState` dell'Orchestratore — sono due enum distinti per ora

### Compatibilita' con Story Future

- **Story 1.4 (ResilienceRegistry)**: Errori critici dalla ResilienceRegistry potranno triggerare `CRITICAL_ERROR` sulla state machine
- **Epic 4 (Live AI)**: Il ciclo live usera' la state machine per gestire `LIVE` state e transizioni
- **Refactoring SessionOrchestrator**: Una story futura (non in Epic 1) sostituira' il `_state` interno dell'Orchestratore con la `SessionStateMachine`

### Testing Standards

- File test mirror: `tests/core/SessionStateMachine.test.js`
- Mock `game`, `ui` come globali
- Pattern: `describe('SessionStateMachine') > describe('transition') > it('should...')`
- Creare istanza fresh per ogni test (`new SessionStateMachine()` in `beforeEach`)
- Testare con e senza EventBus per verificare entrambi i path
- Test catena completa per verificare il percorso felice end-to-end

### Project Structure Notes

- `scripts/core/SessionStateMachine.mjs` — NUOVO file, posizione definita nell'architecture doc
- `tests/core/SessionStateMachine.test.js` — NUOVO file test
- `lang/*.json` (8 file) — aggiungere chiavi i18n per stati e errori
- Nessun file esistente modificato — questa e' una story puramente additiva
- Nessuna modifica a `module.json`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#3. State Management] — Pattern state machine formale con matrice stato x evento
- [Source: _bmad-output/planning-artifacts/architecture.md#3. State Machine — Transizioni e Guard] — Costanti stati, matrice, guard signature
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision Impact Analysis] — State Machine dipende da EventBus, consumata da ResilienceRegistry
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] — Posizione file `scripts/core/SessionStateMachine.mjs`
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] — Acceptance criteria BDD
- [Source: _bmad-output/planning-artifacts/epics.md#NFR36] — Stato serializzabile per ripresa
- [Source: scripts/orchestration/SessionOrchestrator.mjs:28-41] — SessionState attuale (12 stati) da NON confondere con i nuovi 8 stati
- [Source: CLAUDE.md#Code Patterns] — Logger, i18n, testing patterns

### Learnings dalla Story 1.2

- **Singleton vs istanza**: L'EventBus usa module-level singleton. La SessionStateMachine NON deve essere singleton — viene istanziata e posseduta dall'Orchestratore
- **Error isolation**: L'EventBus applica error isolation per subscriber e middleware. La state machine emette eventi sull'EventBus, quindi beneficia automaticamente di questa protezione
- **i18n safety pre-init**: Pattern `game?.i18n?.localize() ?? 'fallback'` funziona bene — riusarlo identico
- **Dead code**: La code review di 1.2 ha trovato codice morto. Tenere il codice pulito fin dall'inizio, non lasciare iterazioni precedenti
- **Test count**: 33 test per EventBus (modulo simile in complessita'). Puntare a ~15+ test per la state machine

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation, no debugging required.

### Completion Notes List

- ✅ Implemented `SessionStateMachine` class with declarative transition matrix (8 states, 14 events)
- ✅ `SessionState` and `SessionEvent` exported as frozen constants
- ✅ `transition(event, context)` validates matrix, executes guards (AND logic), changes state, emits `session:stateChanged` on EventBus
- ✅ `canTransition(event)` checks without side effects — no state change, no emit
- ✅ Guard system: `addGuard(event, guardFn)` with `(state, event, context) => boolean` signature, multiple guards per event (AND logic)
- ✅ `RETRY` from error state returns to `_previousState` (defaults to idle if no previous)
- ✅ `serialize()` / `deserialize()` for localStorage persistence (NFR36), with invalid state fallback to idle
- ✅ Utility methods: `getAvailableTransitions()`, `isInState(...states)`, `reset()`
- ✅ EventBus optional in constructor — no emit when absent, enabling pure unit tests
- ✅ i18n keys added to all 8 lang files: 8 state names + 2 error keys
- ✅ `game?.i18n?.localize() ?? 'fallback'` pattern for pre-init safety
- ✅ 46 tests covering all ACs: transitions, guards, serialization, lifecycle chain, edge cases
- ✅ Full regression: 4688 tests pass, 0 failures across 58 files
- ✅ Story is purely additive — no existing files modified (except lang files for i18n keys)

### Change Log

- 2026-03-09: Story 1.3 implemented — SessionStateMachine with typed states, guard system, EventBus integration, serialization, and 46 comprehensive tests
- 2026-03-09: Code review — fixed 8 issues (1 HIGH, 4 MEDIUM, 3 LOW): previousState validation in deserialize, guard error isolation, addGuard validation, i18n format params, GuardFailed key usage, SessionEvent.RESET constant, reset() previousState clearing. Tests increased from 46 to 53.

### File List

- `scripts/core/SessionStateMachine.mjs` — NEW: State machine class with transition matrix, guards, serialization
- `tests/core/SessionStateMachine.test.js` — NEW: 46 tests covering all acceptance criteria
- `lang/en.json` — MODIFIED: Added Session.State.* and Session.Error.* i18n keys
- `lang/it.json` — MODIFIED: Added Session.State.* and Session.Error.* i18n keys
- `lang/de.json` — MODIFIED: Added Session.State.* and Session.Error.* i18n keys
- `lang/es.json` — MODIFIED: Added Session.State.* and Session.Error.* i18n keys
- `lang/fr.json` — MODIFIED: Added Session.State.* and Session.Error.* i18n keys
- `lang/ja.json` — MODIFIED: Added Session.State.* and Session.Error.* i18n keys
- `lang/pt.json` — MODIFIED: Added Session.State.* and Session.Error.* i18n keys
- `lang/template.json` — MODIFIED: Added Session.State.* and Session.Error.* i18n keys
