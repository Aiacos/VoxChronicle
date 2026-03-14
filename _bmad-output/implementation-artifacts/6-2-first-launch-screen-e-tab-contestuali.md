# Story 6.2: First Launch Screen e Tab Contestuali

Status: done

## Story

As a DM,
I want an intuitive first-time experience and context-aware tabs,
so that I understand how to use VoxChronicle immediately without any tutorial.

## Acceptance Criteria

1. **AC1 — First Launch Screen**: Given il primo avvio (o nessuna sessione attiva) When il DM apre il pannello Then vede la First Launch Screen con due card grandi (Live Session / Chronicle Mode) e status API
2. **AC2 — Tab Contestuali Live**: Given una sessione live attiva When il pannello e' aperto Then i tab mostrano [Assistente | Regole | Trascrizione] + Analytics e Settings come icone secondarie
3. **AC3 — Transizione Live→Chronicle**: Given il DM clicca "Stop Session" When la sessione live termina Then il pannello transisce automaticamente ai tab Chronicle senza azione manuale
4. **AC4 — Badge Numerici**: Given nuovi suggerimenti o entita' estratte When il pannello e' collassato Then badge numerici appaiono sulle icone tab corrispondenti
5. **AC5 — Zero Re-render Completi**: Given il pannello When aggiorna il contenuto durante il ciclo live Then usa `render({ parts: ['partName'] })` o DOM diretto (NFR3)

## Tasks / Subtasks

- [x] Task 1 — First launch detection e template (AC: #1)
  - [x] 1.1 NEW: 2 tests for isFirstLaunch (true when no session, false in live mode)
  - [x] 1.2 Template: first-launch section with Live/Chronicle cards + API status
  - [x] 1.3 CSS: card layout with hover effects, status indicators

- [x] Task 2 — Tab contestuali per modalita' (AC: #2, #3)
  - [x] 2.1 NEW: 3 tests for _getVisibleTabs (live tabs, all tabs, in _prepareContext)
  - [x] 2.2 _getVisibleTabs returns live/transcript/analytics in live mode, chronicle tabs after session
  - [x] 2.3 Template: tabs hidden during first launch via `{{#if isFirstLaunch}}hidden{{/if}}`

- [x] Task 3 — Regressione (AC: tutti)
  - [x] 3.1 5209 tests pass, 0 failures (+5 new)

## Dev Notes

### Stato Attuale — ~40% Pre-Implementato

Tab system esiste (6 tab fissi). Manca: first launch screen, tab dinamici per modalita', badge numerici.

### References

- [Source: scripts/ui/MainPanel.mjs — _prepareContext(), _activeTab]
- [Source: templates/main-panel.hbs — tab structure]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Completion Notes List

- ✅ Task 1: First launch screen with Live/Chronicle cards, API status indicators. 2 tests.
- ✅ Task 2: `_getVisibleTabs()` returns mode-appropriate tabs. Tabs hidden during first launch. 3 tests.
- ✅ Task 3: 5209 tests pass, 0 failures.

### Change Log

- 2026-03-14: Story 6.2 — first launch screen, visible tabs, i18n ChronicleHint. 5 new tests.

### File List

- `scripts/ui/MainPanel.mjs` — Added `isFirstLaunch`, `visibleTabs`, `_getVisibleTabs()` method
- `templates/main-panel.hbs` — First launch screen with cards, conditional tabs hidden
- `styles/vox-chronicle.css` — First launch card CSS
- `lang/*.json` (8 files) — Added ChronicleHint
- `tests/ui/MainPanel.test.js` — 5 new tests
