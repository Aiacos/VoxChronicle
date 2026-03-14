# Story 6.3: Input Bar e Notifiche Real-Time

Status: done

## Story

As a DM,
I want a persistent query input and real-time notifications,
so that I can ask questions anytime and stay informed without reloading.

## Acceptance Criteria

1. **AC1 — Input Bar Live Mode**: Given la sessione live attiva When il pannello e' espanso Then un input bar e' visibile in basso
2. **AC2 — Query Routing**: Given il DM digita una domanda When preme invio Then il sistema la gestisce via handleManualRulesQuery
3. **AC3 — Input Bar Hidden in Chronicle**: Given la sessione in Chronicle mode When il pannello aperto Then l'input bar non e' visibile
4. **AC4 — Notifiche Real-Time**: Given un evento della sessione When viene emesso su EventBus Then il DM riceve aggiornamento nel pannello senza ricaricarlo
5. **AC5 — Settings**: Given le impostazioni When il DM apre Settings Then puo' configurarle tramite Foundry

## Tasks / Subtasks

- [x] Task 1 — Input bar condizionale per live mode (AC: #1, #3)
  - [x] 1.1 VERIFIED: rules input already exists in template (line 334-337)
  - [x] 1.2 Updated template: wrapped in `{{#if isLiveMode}}` conditional — visible only in live mode
  - [x] 1.3 NEW: 1 test for isLiveMode in _prepareContext

- [x] Task 2 — Query routing (AC: #2)
  - [x] 2.1 VERIFIED: MainPanel._onRender() wires Enter key to orchestrator.handleManualRulesQuery()
  - [x] 2.2 VERIFIED: existing test "rules input Enter keydown calls handleManualRulesQuery"

- [x] Task 3 — Real-time notifications (AC: #4)
  - [x] 3.1 VERIFIED: EventBus listeners for ai:transcriptionReady, ai:ragIndexingStarted/Complete
  - [x] 3.2 VERIFIED: onStateChange callback triggers debouncedRender on any state change
  - [x] 3.3 VERIFIED: scene:changed triggers cache invalidation and re-render

- [x] Task 4 — Settings integration (AC: #5)
  - [x] 4.1 VERIFIED: Settings.mjs registers all module settings via Foundry's game.settings API
  - [x] 4.2 VERIFIED: Settings accessible via Module Settings UI (config: true)

- [x] Task 5 — Regressione (AC: tutti)
  - [x] 5.1 5210 tests pass, 69 files, 0 failures (+1 new)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Completion Notes List

- ✅ Task 1: Input bar wrapped in `{{#if isLiveMode}}` — hidden in chronicle mode. 1 new test.
- ✅ Task 2-4: All pre-existing and verified — query routing, EventBus notifications, Foundry settings.
- ✅ Task 5: 5210 tests pass.

### Change Log

- 2026-03-14: Story 6.3 — input bar live-mode conditional. 1 new test. Most features pre-implemented.

### File List

- `templates/main-panel.hbs` — Wrapped rules input in `{{#if isLiveMode}}` conditional
- `tests/ui/MainPanel.test.js` — 1 new test for isLiveMode in context
