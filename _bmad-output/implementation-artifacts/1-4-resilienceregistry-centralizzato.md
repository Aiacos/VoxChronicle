# Story 1.4: ResilienceRegistry Centralizzato

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want the system to handle API failures gracefully with automatic recovery,
so that temporary connection issues don't ruin my game session.

## Acceptance Criteria

1. **Circuit Breaker Base** — Given un servizio registrato nel ResilienceRegistry, When una chiamata API fallisce, Then il circuit breaker conta il fallimento
2. **Circuit Breaker Open** — Given 5 fallimenti consecutivi per un servizio, When il 6° tentativo viene fatto, Then il circuit breaker si apre e usa la fallback chain (NFR29)
3. **Circuit Breaker Auto-Close** — Given il circuit breaker e' aperto, When passano 60 secondi, Then il circuit breaker si chiude automaticamente e permette nuovi tentativi
4. **Fallback Chain** — Given una fallback chain configurata (provider secondario → cache L2 → messaggio offline), When il provider primario fallisce, Then la chain viene eseguita in ordine fino al primo successo
5. **Dual Error Channel** — Given un errore si verifica, When viene emesso, Then due eventi partono: `error:user` (toast UI) e `error:technical` (log debug) su EventBus
6. **Recording Independence** — Given la registrazione audio e' attiva, When le API AI falliscono, Then la registrazione continua senza interruzioni (FR40, NFR32)
7. **Auto-Recovery** — Given la connessione viene ripristinata, When le API tornano disponibili, Then le operazioni AI riprendono entro 30 secondi (FR41, NFR33)
8. **Test Coverage** — Given la ResilienceRegistry, When si scrivono test, Then `tests/core/ResilienceRegistry.test.js` copre circuit breaker, fallback chain, dual error channel, auto-recovery e stati

## Tasks / Subtasks

- [x] Task 1: Creare `scripts/core/ResilienceRegistry.mjs` (AC: #1, #2, #3)
  - [x] 1.1: Definire costanti `CircuitState` con 3 stati: `CLOSED` (normale), `OPEN` (bloccato), `HALF_OPEN` (test)
  - [x] 1.2: Classe `ResilienceRegistry` come singleton module-level (stesso pattern di EventBus)
  - [x] 1.3: Metodo `register(serviceName, options)` — registra servizio con policy:
    ```javascript
    registry.register('aiAssistant', {
      maxFailures: 5,        // default: 5 (NFR29)
      cooldown: 60000,       // default: 60000ms (NFR29)
      fallback: [            // array di funzioni fallback, eseguite in ordine
        () => cache.getLastSuggestion(),
        () => ({ content: i18n('OfflineMsg') })
      ]
    });
    ```
  - [x] 1.4: Metodo `execute(serviceName, fn)` — wrappa la chiamata API:
    - Se circuit breaker CLOSED: esegui `fn()`, conta successi/fallimenti
    - Se circuit breaker OPEN: esegui fallback chain senza tentare `fn()`
    - Se circuit breaker HALF_OPEN: tenta `fn()`, se successo → CLOSED, se fallimento → OPEN
  - [x] 1.5: Logica circuit breaker: dopo `maxFailures` consecutivi → stato OPEN
  - [x] 1.6: Auto-recovery: dopo `cooldown` ms in OPEN → transizione a HALF_OPEN (un solo tentativo di test)
  - [x] 1.7: Reset contatori su successo: `consecutiveFailures = 0`
  - [x] 1.8: Metodo `getStatus(serviceName)` — ritorna `{ state, consecutiveFailures, lastFailure, lastSuccess }`
  - [x] 1.9: Metodo `getStatus()` senza argomenti — ritorna stato di tutti i servizi registrati (utile per UI diagnostica)
  - [x] 1.10: Export singleton `resilience` e classe `ResilienceRegistry` e costanti `CircuitState`

- [x] Task 2: Fallback chain system (AC: #4)
  - [x] 2.1: In `execute()`, quando circuit breaker OPEN o `fn()` fallisce: eseguire fallback in ordine
  - [x] 2.2: Ogni fallback nel chain e' `async function` — try/catch ciascuna, se fallisce passa alla prossima
  - [x] 2.3: Se tutti i fallback falliscono: lanciare errore originale wrappato con contesto
  - [x] 2.4: Il risultato del primo fallback che riesce viene ritornato come risultato di `execute()`
  - [x] 2.5: Logging: logga quale fallback ha risposto (per debug/analytics)

- [x] Task 3: Integrazione EventBus — Dual Error Channel (AC: #5)
  - [x] 3.1: Importare `eventBus` singleton da `scripts/core/EventBus.mjs`
  - [x] 3.2: Su ogni fallimento emettere `error:technical` con payload `{ service, error, state, consecutiveFailures, timestamp }`
  - [x] 3.3: Su apertura circuit breaker emettere `error:user` con payload `{ service, message: i18n('...'), timestamp }`
  - [x] 3.4: Su chiusura circuit breaker (recovery) emettere `error:user` con messaggio di recovery
  - [x] 3.5: Su transizione stato emettere `session:resilienceChanged` con `{ service, from, to, timestamp }`
  - [x] 3.6: EventBus e' opzionale nel constructor (come SessionStateMachine) per test unitari puri

- [x] Task 4: Auto-recovery con timer (AC: #7)
  - [x] 4.1: Quando circuit breaker passa a OPEN, impostare `setTimeout` per `cooldown` ms
  - [x] 4.2: Dopo il timeout, transire a HALF_OPEN
  - [x] 4.3: In HALF_OPEN, il prossimo `execute()` tenta `fn()` una sola volta:
    - Successo → CLOSED, emetti recovery event
    - Fallimento → OPEN, riavvia timer cooldown
  - [x] 4.4: Metodo `resetService(serviceName)` — forza chiusura manuale del circuit breaker
  - [x] 4.5: Metodo `resetAll()` — reset tutti i servizi (utile per nuova sessione)
  - [x] 4.6: Pulizia timer in `resetService()` e `resetAll()` — clearTimeout per evitare leak

- [x] Task 5: Creare `tests/core/ResilienceRegistry.test.js` (AC: #8)
  - [x] 5.1: Test registrazione servizio — parametri default e custom
  - [x] 5.2: Test execute con successo — contatori azzerati
  - [x] 5.3: Test execute con fallimento — contatore incrementato
  - [x] 5.4: Test circuit breaker OPEN dopo maxFailures (5 fallimenti)
  - [x] 5.5: Test fallback chain — esegue in ordine, ritorna primo successo
  - [x] 5.6: Test fallback chain — tutti falliscono, rilancia errore originale
  - [x] 5.7: Test auto-recovery — OPEN → HALF_OPEN dopo cooldown (usare vi.useFakeTimers)
  - [x] 5.8: Test HALF_OPEN → CLOSED su successo
  - [x] 5.9: Test HALF_OPEN → OPEN su fallimento (riavvia cooldown)
  - [x] 5.10: Test dual error channel — `error:technical` su ogni fallimento
  - [x] 5.11: Test dual error channel — `error:user` su apertura/chiusura circuit breaker
  - [x] 5.12: Test `getStatus()` — singolo servizio e tutti i servizi
  - [x] 5.13: Test `resetService()` — forza CLOSED, pulisce timer
  - [x] 5.14: Test `resetAll()` — tutti i servizi reset
  - [x] 5.15: Test senza EventBus — nessun errore, nessun emit
  - [x] 5.16: Test servizio non registrato — errore chiaro
  - [x] 5.17: Test indipendenza registrazione audio (AC #6) — un servizio in errore non blocca altri servizi

- [x] Task 6: Chiavi i18n per ResilienceRegistry
  - [x] 6.1: Aggiungere in tutti 8 file lang:
    - `VOXCHRONICLE.Resilience.Error.CircuitOpen` — "Service {service} temporarily unavailable"
    - `VOXCHRONICLE.Resilience.Error.AllFallbacksFailed` — "All recovery options exhausted for {service}"
    - `VOXCHRONICLE.Resilience.Status.Recovered` — "Service {service} recovered"
    - `VOXCHRONICLE.Resilience.Error.ServiceNotRegistered` — "Service {service} is not registered"
  - [x] 6.2: Usare `game?.i18n?.format?.()` con parametri `{service}` e fallback string (pattern pre-init safety)

## Dev Notes

### Architettura e Pattern

- **Posizione file**: `scripts/core/ResilienceRegistry.mjs` — nella directory core, e' infrastruttura trasversale
- **Posizione test**: `tests/core/ResilienceRegistry.test.js`
- **Stack**: JavaScript ES6+ `.mjs`, dipendenza su `EventBus.mjs` e `Logger.mjs`
- **Export**: singleton `resilience`, classe `ResilienceRegistry`, costanti `CircuitState`
- **Pattern**: Singleton module-level (stesso pattern di EventBus, NON di SessionStateMachine)

### Relazione con Codebase Esistente

**CRITICO — Il dev agent deve capire queste relazioni:**

1. **EventBus (Story 1.2 — DONE)**: La ResilienceRegistry emette eventi su canali `error:` e `session:`. EventBus supporta canali `error` e `session` (validati in EventBus.mjs:VALID_CHANNELS). Importare il singleton `eventBus` da `scripts/core/EventBus.mjs`.

2. **SessionStateMachine (Story 1.3 — DONE)**: Errori critici dalla ResilienceRegistry potranno in futuro triggerare `CRITICAL_ERROR` sulla state machine. Per ORA questa integrazione NON va implementata — la Story 1.4 crea solo la ResilienceRegistry come componente standalone. L'integrazione sara' in story future.

3. **OpenAIClient (esistente)**: L'OpenAIClient ha gia' retry con backoff (`_retryWithBackoff`) e circuit breaker rudimentale (`_checkCircuitBreaker`, `consecutiveFailures`, `maxConsecutiveFailures`). La ResilienceRegistry NON sostituisce OpenAIClient in questa story — wrappera' le chiamate a livello servizio (AIAssistant, RulesReference, etc.) in story future. Per ora, e' un componente standalone.

4. **ErrorNotificationHelper (esistente)**: Attualmente definito ma mai usato in produzione (dead utility da audit v3.0.4). La ResilienceRegistry fornisce un pattern superiore (dual channel via EventBus). ErrorNotificationHelper potra' essere rimosso in story future.

### Decisioni Chiave di Implementazione

1. **Singleton module-level**: Come EventBus — `const resilience = new ResilienceRegistry(); export { resilience }`. NON come SessionStateMachine (che e' istanziata dall'orchestratore).

2. **`execute()` wrappa, non sostituisce**: Il pattern d'uso e':
   ```javascript
   // Il servizio chiama execute() wrappando la sua logica
   const result = await resilience.execute('aiAssistant', () => this.provider.chat(messages));
   ```
   L'attuale try/catch nei servizi rimane — `execute()` aggiunge circuit breaker + fallback sopra.

3. **Fallback chain come array di funzioni async**: Ogni fallback e' provata in ordine. La prima che ritorna senza lanciare vince. Questo permette cascata: provider alternativo → cache → messaggio offline.

4. **Timer-based auto-recovery**: `setTimeout` per la transizione OPEN → HALF_OPEN. Usare `vi.useFakeTimers()` nei test per controllare il tempo. Ricordare di fare `clearTimeout` nel reset per evitare memory leak.

5. **Servizi indipendenti**: Ogni servizio ha il suo circuit breaker. Se `aiAssistant` va in OPEN, `rulesReference` continua a funzionare normalmente. Questo e' critico per AC #6 (registrazione audio indipendente).

6. **i18n con format**: Usare `game?.i18n?.format?.('VOXCHRONICLE.Resilience.Error.CircuitOpen', { service })` con fallback string. Il `?.format?.()` e' necessario perche' `format` potrebbe non esistere pre-init (pattern sicuro).

### Anti-Pattern da Evitare

- **NON** usare librerie circuit breaker esterne (cockatiel, opossum) — zero dipendenze, browser-only
- **NON** modificare `OpenAIClient.mjs` — l'integrazione e' in story future
- **NON** modificare `SessionOrchestrator.mjs` — idem
- **NON** rendere `execute()` sincrono — le chiamate API wrappate sono tutte async
- **NON** hardcodare fallback nella registry — i fallback sono registrati esternamente via `register()`
- **NON** importare da `orchestration/`, `ui/`, `narrator/`, `ai/` — ResilienceRegistry e' un leaf module in `core/`
- **NON** confondere con il circuit breaker rudimentale di OpenAIClient — sono due meccanismi separati per ora

### Codice Esistente da Riusare

- `eventBus` singleton da `scripts/core/EventBus.mjs` — per emettere su canali `error:` e `session:`
- `Logger.createChild('ResilienceRegistry')` da `scripts/utils/Logger.mjs`
- Pattern test mock: copiare struttura da `tests/core/EventBus.test.js` e `tests/core/SessionStateMachine.test.js`
- Pattern i18n: `game?.i18n?.format?.('KEY', { param }) ?? 'fallback'` (come usato in SessionStateMachine dopo code review)

### Compatibilita' con Story Future

- **Epic 2 (AI Provider)**: I provider implementeranno `execute()` per wrappare le loro chiamate API
- **Epic 4 (Live AI)**: AIAssistant, RulesReference, SceneDetector useranno `resilience.execute()` per le loro chiamate
- **Refactoring OpenAIClient**: Una story futura sostituira' il circuit breaker rudimentale di OpenAIClient con la ResilienceRegistry
- **SessionStateMachine integration**: Errori critici (tutti i fallback esauriti) potranno triggerare `CRITICAL_ERROR` sulla state machine

### Testing Standards

- File test mirror: `tests/core/ResilienceRegistry.test.js`
- Mock `game`, `ui` come globali
- Mock `eventBus` con `{ emit: vi.fn(), on: vi.fn() }`
- Usare `vi.useFakeTimers()` per controllare il cooldown timer — `vi.advanceTimersByTime(60000)`
- Pattern: `describe('ResilienceRegistry') > describe('execute') > it('should...')`
- Creare istanza fresh per ogni test (reset singleton in `beforeEach`)
- Testare con e senza EventBus per verificare entrambi i path
- Puntare a 17+ test (in linea con SessionStateMachine 53 test)

### Learnings dalle Story Precedenti

**Da Story 1.2 (EventBus):**
- Singleton module-level funziona bene — riusare identico
- Error isolation nei subscriber: la ResilienceRegistry ha bisogno di error isolation simile nei fallback
- i18n safety pre-init: pattern `game?.i18n?.format?.() ?? 'fallback'` funziona — riusarlo

**Da Story 1.3 (SessionStateMachine):**
- Guard error isolation (aggiunta nella code review): wrappare guard in try/catch. Applicare lo stesso pattern ai fallback — ogni fallback wrappato in try/catch
- `addGuard()` validation: validare parametri in `register()` — `serviceName` deve essere stringa, `options.fallback` deve essere array di funzioni
- Dead code: non creare chiavi i18n che non vengono mai usate — verificare che ogni chiave sia referenziata nel codice
- previousState validation: validare dati in input (non fidarsi dei parametri)

**Da Code Review Story 1.3:**
- `game?.i18n?.format?.()` (non solo `localize`) per messaggi con parametri — piu' utile per debug
- Reset methods dovrebbero pulire lo stato completamente (previousState = null pattern)

### Project Structure Notes

- `scripts/core/ResilienceRegistry.mjs` — NUOVO file, posizione definita nell'architecture doc
- `tests/core/ResilienceRegistry.test.js` — NUOVO file test
- `lang/*.json` (8 file) — aggiungere 4 chiavi i18n per resilienza
- Nessun file esistente modificato oltre lang — questa e' una story puramente additiva
- Nessuna modifica a `module.json`

### References

- [Source: architecture.md#5. Error Handling & Resilienza] — Pattern ResilienceRegistry con circuit breaker + fallback chain
- [Source: architecture.md#4. Error Handling — Uso ResilienceRegistry] — Pattern d'uso `execute()` e regole try/catch
- [Source: architecture.md#Decision Impact Analysis] — ResilienceRegistry dipende da Provider + EventBus
- [Source: architecture.md#Project Structure & Boundaries] — Posizione file `scripts/core/ResilienceRegistry.mjs`
- [Source: epics.md#Story 1.4] — Acceptance criteria BDD (7 AC)
- [Source: epics.md#NFR29] — Circuit breaker 5 fallimenti / 60s cooldown
- [Source: epics.md#NFR32] — Registrazione locale indipendente da API
- [Source: epics.md#NFR33] — Ripresa automatica entro 30s
- [Source: CLAUDE.md#Code Patterns] — Logger, i18n, testing patterns
- [Source: scripts/core/EventBus.mjs] — EventBus singleton con canali tipizzati (dependency)
- [Source: scripts/ai/OpenAIClient.mjs] — Circuit breaker rudimentale esistente (NON toccare)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nessun problema di debug significativo — implementazione pulita al primo tentativo.

### Completion Notes List

- ✅ Implementata ResilienceRegistry con pattern circuit breaker a 3 stati (CLOSED/OPEN/HALF_OPEN)
- ✅ Singleton module-level seguendo il pattern EventBus (`const resilience = new ResilienceRegistry()`)
- ✅ `register()` con validazione parametri (serviceName stringa, fallback array di funzioni)
- ✅ `execute()` con circuit breaker completo: CLOSED (passa), OPEN (fallback), HALF_OPEN (test singolo)
- ✅ Fallback chain con error isolation — ogni fallback in try/catch, primo successo vince
- ✅ Dual error channel via EventBus: `error:technical` (ogni fallimento), `error:user` (apertura/recovery)
- ✅ `session:resilienceChanged` emesso su ogni transizione di stato
- ✅ Auto-recovery con setTimeout: OPEN → HALF_OPEN dopo cooldown
- ✅ `resetService()` e `resetAll()` con clearTimeout per prevenire memory leak
- ✅ EventBus opzionale nel constructor (error isolation con try/catch su emit)
- ✅ i18n con `game?.i18n?.format?.()` e fallback string (pattern pre-init safety)
- ✅ 32 test coprono tutti gli scenari: circuit breaker, fallback, auto-recovery, dual channel, indipendenza servizi
- ✅ 4 chiavi i18n in 8 file lang (en, it, de, es, fr, ja, pt, template)
- ✅ Zero regressioni: 4727 test passano su 59 file

### Change Log

- 2026-03-09: Implementazione completa Story 1.4 — ResilienceRegistry con circuit breaker, fallback chain, dual error channel, auto-recovery, 32 test, 4 chiavi i18n in 8 lingue
- 2026-03-09: Code review — 5 MEDIUM + 1 LOW fix: singleton con EventBus, warn su registrazione duplicata, eventi su reset, counter reset HALF_OPEN→OPEN, error:user su recovery fallita, test timestamp e duplicati. 38 test totali, 4733 regressione OK.

### File List

- `scripts/core/ResilienceRegistry.mjs` — NUOVO: classe ResilienceRegistry, costanti CircuitState, singleton resilience
- `tests/core/ResilienceRegistry.test.js` — NUOVO: 32 test per circuit breaker, fallback, recovery, EventBus, reset
- `lang/en.json` — MODIFICATO: aggiunte 4 chiavi Resilience
- `lang/it.json` — MODIFICATO: aggiunte 4 chiavi Resilience (italiano)
- `lang/de.json` — MODIFICATO: aggiunte 4 chiavi Resilience (tedesco)
- `lang/es.json` — MODIFICATO: aggiunte 4 chiavi Resilience (spagnolo)
- `lang/fr.json` — MODIFICATO: aggiunte 4 chiavi Resilience (francese)
- `lang/ja.json` — MODIFICATO: aggiunte 4 chiavi Resilience (giapponese)
- `lang/pt.json` — MODIFICATO: aggiunte 4 chiavi Resilience (portoghese)
- `lang/template.json` — MODIFICATO: aggiunte 4 chiavi Resilience (template)
