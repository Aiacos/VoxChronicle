# Story 1.1: Fix Bug Critici e Importanti

Status: done

## Story

As a DM,
I want the module to work without crashes or broken features,
so that I can trust VoxChronicle during game sessions.

## Acceptance Criteria

1. **Hook Registration** — Tutti gli hook Foundry in `main.mjs` sono attivi e funzionanti: `vc.orchestrator` corretto in `vc.sessionOrchestrator`, `_hooksRegistered` dichiarato come static property
2. **AI Suggestion Health** — `_aiSuggestionHealth` in `SessionOrchestrator` viene aggiornato a `degraded`/`down` quando i suggerimenti falliscono
3. **Bug Critici Risolti** — I 3 bug CRITICAL (hook morti, _hooksRegistered non dichiarato, health mai degradato) sono corretti
4. **Bug Importanti Risolti** — I 7 bug IMPORTANT (AbortController leak, reinitialize concorrente, reindexQueue overwrite, prepareContext mutation, shutdownController non nullato, enrichSession ignora journal utente, reinitializePending mai agito) sono corretti
5. **Zero Regressioni** — Tutti i 4589+ test passano dopo ogni fix
6. **Test Copertura** — Ogni bug fix ha almeno un test che verifica il comportamento corretto

## Tasks / Subtasks

### Bug CRITICAL

- [x] Task 1: Fix hook morti in main.mjs (AC: #1)
  - [x] 1.1: `main.mjs:205,213` — Rinominare `vc.orchestrator` → `vc.sessionOrchestrator`
  - [x] 1.2: Verificare che `invalidateJournalCache` funzioni dopo il fix

- [x] Task 2: Dichiarare `_hooksRegistered` come static property (AC: #1)
  - [x] 2.1: `VoxChronicle.mjs` — Aggiungere `static _hooksRegistered = false;` nella dichiarazione della classe
  - [x] 2.2: Verificare che i riferimenti a linee 141 e 207 continuino a funzionare

- [x] Task 3: Implementare health transitions per AI suggestions (AC: #2)
  - [x] 3.1: `SessionOrchestrator.mjs` — Nel catch del ciclo AI suggestion, settare `_aiSuggestionHealth = 'degraded'` dopo 1 fallimento
  - [x] 3.2: Settare `_aiSuggestionHealth = 'down'` dopo N fallimenti consecutivi (usare threshold coerente con circuit breaker)
  - [x] 3.3: Resettare a `'healthy'` su successo

### Bug IMPORTANT

- [x] Task 4: Fix AbortController listener leak (AC: #4)
  - [x] 4.1: `OpenAIClient.mjs:780-798` — Rimuovere listener abort esplicitamente al termine dello streaming
  - [x] 4.2: `OpenAIClient.mjs:569-571` — Stesso fix nel metodo `request()`
  - [x] 4.3: Usare pattern `{ signal }` da AbortController per auto-cleanup dove possibile

- [x] Task 5: Fix reinitialize concorrente (AC: #4)
  - [x] 5.1: `Settings.mjs` — Rimuovere `onChange` handler per `kankaApiToken` (il `updateSetting` hook lo gestisce già)
  - [x] 5.2: OPPURE aggiungere guard `_isReinitializing` mutex in `VoxChronicle.reinitialize()` — NON necessario, rimosso il doppio handler
  - [x] 5.3: Valutare quale approccio è più pulito — preferire la rimozione del doppio handler

- [x] Task 6: Fix _reinitializePending mai agito (AC: #4)
  - [x] 6.1: `SessionOrchestrator.mjs` — Aggiunto callback `onSessionEnd` in `_callbacks`, chiamato al termine di `stopLiveMode()` e `stopSession()`
  - [x] 6.2: `VoxChronicle.mjs` — Registrato `onSessionEnd` callback che controlla `_reinitializePending` e chiama `reinitialize()` se pending
  - [x] 6.3: Il flag viene resettato automaticamente da `reinitialize()` stesso (linea 167)

- [x] Task 7: Fix _reindexQueue overwrite (AC: #4)
  - [x] 7.1: `SessionOrchestrator.mjs` — Cambiato `_reindexQueue` da `string|null` a `Set`
  - [x] 7.2: Usato `_reindexQueue.add(journalId)` invece di assegnamento diretto
  - [x] 7.3: Processati tutti gli ID nel Set con `for...of` loop quando la coda viene svuotata

- [x] Task 8: Fix _prepareContext mutazione (AC: #4)
  - [x] 8.1: `MainPanel.mjs` — Creato shallow copy con spread operator `{ ...img, src: ... }` quando serve aggiungere `src`
  - [x] 8.2: Restituito la copia invece dell'originale, preservando gli oggetti immagine della sessione

- [x] Task 9: Fix _shutdownController non nullato (AC: #4)
  - [x] 9.1: `SessionOrchestrator.mjs` — Aggiunto `this._shutdownController = null` dopo abort in `_fullTeardown()`
  - [x] 9.2: Verificato che `startLiveMode()` crea un nuovo controller fresco (linea 867)

- [x] Task 10: Fix _enrichSessionWithJournalContext ignora selezione utente (AC: #4)
  - [x] 10.1: `SessionOrchestrator.mjs` — Aggiunto check `activeAdventureJournalId` setting come prima scelta prima del fallback a canvas/first journal
  - [x] 10.2: Stessa logica di `reindexJournal()` per coerenza

## Dev Notes

### Architettura e Pattern

- **Stack:** JavaScript ES6+ con `.mjs`, Foundry VTT v13 API, Vitest + jsdom
- **Singleton:** `VoxChronicle.getInstance()` — mai costruire direttamente
- **Logger:** Usare `Logger.createChild('ClassName')` per ogni servizio
- **Settings:** Import `MODULE_ID` da `constants.mjs`, mai da `main.mjs`
- **i18n:** Ogni nuova stringa in tutti 8 file lang (en, it, de, es, fr, ja, pt, template)

### Strategia di Fix

**Ordine consigliato:** Procedere per file, non per severity, per minimizzare context switching:

1. `main.mjs` → Task 1 (hook morti)
2. `VoxChronicle.mjs` → Task 2 (static prop) + Task 5 (reinitialize guard) + Task 6 (pending)
3. `SessionOrchestrator.mjs` → Task 3 (health) + Task 7 (reindexQueue) + Task 9 (shutdownController) + Task 10 (enrichSession)
4. `OpenAIClient.mjs` → Task 4 (AbortController)
5. `MainPanel.mjs` → Task 8 (prepareContext)
6. `Settings.mjs` → Task 5 (onChange duplicato)

**Eseguire test dopo ogni file** per catturare regressioni immediatamente.

### Project Structure Notes

- `scripts/main.mjs` — Entry point, hook registration (NON modificare l'ordine degli hook)
- `scripts/core/VoxChronicle.mjs` — Singleton principale, orchestration
- `scripts/core/Settings.mjs` — Registration settings con onChange handlers
- `scripts/orchestration/SessionOrchestrator.mjs` — Dual-mode workflow (live + chronicle)
- `scripts/ai/OpenAIClient.mjs` — Base API client con retry, queue, circuit breaker
- `scripts/ui/MainPanel.mjs` — Unified floating panel (singleton)

### Anti-Pattern da Evitare

- **NON** aggiungere try/catch generici — i bug richiedono fix precisi, non wrapper
- **NON** modificare la signature pubblica dei metodi — solo fix interni
- **NON** aggiungere nuove dipendenze — tutti i fix usano codice esistente
- **NON** refactorare codice adiacente — scope stretto, solo i bug elencati
- **NON** cambiare il comportamento dei test esistenti — aggiungere nuovi test

### Codice Esistente da Riusare

- `VoxChronicle._reinitializePending` — Già esiste, va solo connesso al ciclo di vita sessione
- `game.settings.get(MODULE_ID, 'activeAdventureJournalId')` — Già usato in `reindexJournal()`, copiare pattern
- Pattern Set per queue — Già usato altrove nel codebase (verificare esempi)

### Testing Standards

- File test in `tests/` mirror di `scripts/` (es. `tests/core/VoxChronicle.test.js`)
- Mock `game`, `ui`, `Hooks` come globali
- Pattern: `describe('ClassName') > describe('methodName') > it('should...')`
- Ogni bug fix richiede almeno 1 test che verifica:
  - Il comportamento corretto dopo il fix
  - (Opzionale) Che il bug originale non si ripresenti

### References

- [Source: memory/audit-2026-03-07.md] — Report audit completo con tutti i 10 bug
- [Source: scripts/main.mjs:205,213] — Hook journal morti (`vc.orchestrator`)
- [Source: scripts/core/VoxChronicle.mjs:111,141,155,164,180,207] — _hooksRegistered + _reinitializePending
- [Source: scripts/orchestration/SessionOrchestrator.mjs:130,874,1192-1221,1231-1279,1306-1386,1449] — Health, queue, shutdown, enrich
- [Source: scripts/ai/OpenAIClient.mjs:569-571,780-798] — AbortController listeners
- [Source: scripts/ui/MainPanel.mjs:204-208] — prepareContext mutation
- [Source: scripts/core/Settings.mjs:46-49,61-63] — onChange dual handler
- [Source: CLAUDE.md] — Pattern, convenzioni, do's and don'ts

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- ✅ Task 1: Fixed dead hooks in `main.mjs` — `vc.orchestrator` renamed to `vc.sessionOrchestrator` at lines 205 and 213. Updated 5 test mocks in `tests/main.test.js` to use `sessionOrchestrator` instead of `orchestrator`. All 4589 tests pass.
- ✅ Task 2: Added `static _hooksRegistered = false;` declaration in VoxChronicle class (line 49). All 4 references (lines 49, 144, 208, 210) consistent. 3 new tests added. 96 tests pass.
- ✅ Task 3: Wrapped `_runAIAnalysis` in dedicated try/catch within `_liveCycle`. Added `_aiSuggestionConsecutiveErrors` counter. Health transitions: degraded after 1 failure, down after 5, reset to healthy on success. Counter reset in startLiveMode and reset(). 5 new tests. 262 orchestrator tests pass.
- ✅ Task 4: Fixed AbortController listener leak in `_rawRequest()` and `postStream()`. Added `listenerCleanup` AbortController with `{ signal }` pattern for automatic listener removal in finally blocks. 2 new tests. 99 OpenAIClient tests pass.
- ✅ Task 5: Removed duplicate `onChange` handler for `kankaApiToken` in Settings.mjs. World-scope settings are already handled by `updateSetting` hook. Kept `onChange` for client-scope `openaiApiKey` (needed). 2 tests updated. 116 Settings tests pass.
- ✅ Task 6: Added `onSessionEnd` callback to SessionOrchestrator, called at end of `stopLiveMode()` and `stopSession()`. VoxChronicle registers callback during init that calls `reinitialize()` when `_reinitializePending` is true. Avoids circular dependency. 2 new tests in SessionOrchestrator, 2 new tests in VoxChronicle. 268 orchestrator + 98 VoxChronicle tests pass.
- ✅ Task 7: Changed `_reindexQueue` from `string|null` to `Set`. Uses `.add()` for queuing and iterates all queued IDs in `finally` block. 1 new test verifies multiple distinct journal IDs are preserved. 268 orchestrator tests pass.
- ✅ Task 8: Fixed `_prepareContext` mutation in MainPanel — images now use shallow copy `{ ...img, src }` instead of mutating the original session image object. 1 new test. 152 MainPanel tests pass.
- ✅ Task 9: Added `this._shutdownController = null` after abort in `_fullTeardown()`. `startLiveMode()` already creates a fresh controller. Updated 1 existing test, 2 new tests. 268 orchestrator tests pass.
- ✅ Task 10: `_enrichSessionWithJournalContext()` now checks `activeAdventureJournalId` setting first before falling back to canvas scene or first journal. Consistent with `reindexJournal()` logic. 1 new test. 268 orchestrator tests pass.

### Full Regression: 4608 tests pass across 56 test files (0 failures)

### File List

- scripts/main.mjs (modified — lines 205, 213: orchestrator → sessionOrchestrator)
- tests/main.test.js (modified — 5 test mocks updated: orchestrator → sessionOrchestrator)
- scripts/core/VoxChronicle.mjs (modified — static _hooksRegistered, onSessionEnd callback registration)
- tests/core/VoxChronicle.test.js (modified — 3+2 new tests for _hooksRegistered and onSessionEnd)
- scripts/orchestration/SessionOrchestrator.mjs (modified — AI health, onSessionEnd callback, _reindexQueue Set, _shutdownController null, enrichSession user preference)
- tests/orchestration/SessionOrchestrator.test.js (modified — 5+6 new tests for health, onSessionEnd, reindexQueue Set, shutdownController null, enrichSession preference)
- scripts/ai/OpenAIClient.mjs (modified — listenerCleanup AbortController for fallback signal combining)
- tests/ai/OpenAIClient.test.js (modified — 2 new tests for fallback abort listener cleanup)
- scripts/core/Settings.mjs (modified — removed onChange handler for kankaApiToken)
- tests/core/Settings.test.js (modified — 2 tests updated for kankaApiToken onChange removal)
- scripts/ui/MainPanel.mjs (modified — shallow copy in _prepareContext image mapping)
- tests/ui/MainPanel.test.js (modified — 1 new test for image object non-mutation)

## Change Log

- 2026-03-08: Tasks 1-5 completed (3 CRITICAL + 2 IMPORTANT bugs fixed). 4589 tests pass.
- 2026-03-09: Tasks 6-10 completed (5 IMPORTANT bugs fixed). All 10 bugs resolved. 4608 tests pass, 0 regressions. Story moved to review.
- 2026-03-09: Code review (adversarial). 1 MEDIUM fix: stopSession onSessionEnd moved to finally block. 2 LOW fixes: _reindexQueue cleared in _fullTeardown, docstring corrected. 4641 tests pass.
