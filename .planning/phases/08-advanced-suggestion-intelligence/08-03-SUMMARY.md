---
phase: 08-advanced-suggestion-intelligence
plan: "03"
subsystem: ui
tags: [intent-detection, recovery-card, mainpanel, routing, localization, css]
dependency_graph:
  requires: [08-01, 08-02]
  provides: [_isRulesQuery, _handleRecoveryCard, onRecoveryCard, intent-routing]
  affects: [MainPanel, SessionOrchestrator]
tech_stack:
  added: []
  patterns: [AbortController-signal, state-persistence-across-rerenders, TDD-red-green]
key_files:
  created: []
  modified:
    - scripts/ui/MainPanel.mjs
    - styles/vox-chronicle.css
    - lang/en.json
    - lang/it.json
    - lang/de.json
    - lang/es.json
    - lang/fr.json
    - lang/ja.json
    - lang/pt.json
    - lang/template.json
    - tests/ui/MainPanel.test.js
decisions:
  - "_isRulesQuery uses single regex with word-boundary anchors to classify rules vs general questions"
  - "AskPlaceholder updated in all 8 lang files (value change, not key change) to keep template DRY"
  - "Recovery card uses prepend() so it appears at top of suggestions list above other cards"
  - "Recovery card dismiss uses filter by data reference identity (same object equality)"
  - "_recoveryCards capped at 5 (vs _rulesCards at 50) — recovery cards are transient DM alerts"
metrics:
  duration: "6 min"
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_modified: 11
requirements_satisfied: [SUG-04, SUG-06]
---

# Phase 08 Plan 03: UI Integration — Intent Routing and Recovery Cards Summary

**One-liner:** Two-branch intent routing via `_isRulesQuery()` regex plus amber-tinted `_handleRecoveryCard()` with persistence across re-renders — DM can now type any question and recovery alerts appear when off-track.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Intent detection routing and _isRulesQuery() | bb63443 | MainPanel.mjs, lang/\*.json |
| 2 | Recovery card rendering, state, CSS/localization | bb63443 | MainPanel.mjs, vox-chronicle.css |

Both tasks implemented together in a single atomic commit (tests written for both, then both implemented).

## What Was Built

### Task 1: Intent Detection Routing

Added `_isRulesQuery(query)` method to `MainPanel` that classifies user input using a word-boundary regex covering: `rule`, `rules`, `dc`, `saving throw`, `how does`, `how do`, `modifier for`, `spell slot`, `mechanic`, `what is the`, `ability check`, `skill check`.

Updated the rules input keydown handler to branch on intent:
- Rules vocabulary query → `orchestrator.handleManualRulesQuery(query)`
- General DM query → `orchestrator.handleGeneralQuery(query)`
- Missing method on orchestrator → logs warn and returns early (graceful)

Updated `AskPlaceholder` localization key from "Ask a rules question..." to "Ask anything..." across all 8 lang files.

### Task 2: Recovery Card Rendering

Added `_handleRecoveryCard(data)` method that creates amber-tinted cards in the suggestions list with:
- `.vox-chronicle-recovery-card` + `.vox-chronicle-suggestion-card` classes
- `.vox-chronicle-badge--offtrack` badge containing "Off Track" (localized)
- Dismiss button that removes the card from DOM and from `_recoveryCards` array

State management:
- `_recoveryCards = []` initialized in constructor alongside `_rulesCards`
- Cleared on `onStateChange('idle')` in both `setCallbacks` blocks
- `onRecoveryCard: (data) => this._handleRecoveryCard(data)` registered in both `setCallbacks` blocks
- `_onRender()` reconstructs recovery cards from `_recoveryCards` after DOM replacement (prevents flash on tab switch)
- Capped at 5 cards (transient DM alerts, not historical records)

### CSS

Added to `styles/vox-chronicle.css`:
- `.vox-chronicle-recovery-card` — amber border-left (#f59e0b) + amber background (8% opacity)
- `.vox-chronicle-badge--offtrack` — solid amber badge with dark text
- `.vox-chronicle-recovery-dismiss` — styled dismiss button with amber border
- `.vox-chronicle-recovery-dismiss:hover` — increased opacity + amber background hover

### Localization

Added `SuggestionCard` section to all 8 lang files:
- `OffTrackBadge`: "Off Track" / "Fuori Percorso" / "Abgekommen" / "Fuera de Ruta" / "Hors Piste" / "ルート外" / "Fora do Caminho"
- `DismissRecovery`: "Dismiss" / "Ignora" / "Schließen" / "Ignorar" / "Ignorer" / "閉じる" / "Ignorar"
- `template.json` uses the full key paths as values

## Deviations from Plan

None — plan executed exactly as written.

The template file (`main-panel.hbs`) was not modified because it already uses `{{localize 'VOXCHRONICLE.Rules.AskPlaceholder'}}` — updating the lang file values was sufficient and kept the template DRY. This matches the plan's intent.

## Test Coverage

Added 221 lines of tests to `tests/ui/MainPanel.test.js` (from 2692 to 2913 lines total):

- `_isRulesQuery()` — 9 tests covering 6 true cases and 3 false cases
- `input routing (intent detection)` — 3 tests covering rules path, general path, graceful missing-method handling
- `_handleRecoveryCard()` — 8 tests covering card creation, classes, badge, dismiss button, state, dismiss behavior, null input
- `onRecoveryCard callback registration` — 3 tests covering constructor path, orchestrator-update path, idle state cleanup

**Test results:** 230 tests pass in MainPanel.test.js; 5119 total pass across 67 files.

## Self-Check: PASSED

- `scripts/ui/MainPanel.mjs` — FOUND: 22 matches for all 5 required symbols
- `styles/vox-chronicle.css` — FOUND: 4 matches for recovery card CSS classes
- `lang/en.json` — FOUND: 2 matches for OffTrackBadge and DismissRecovery
- Commit bb63443 — FOUND in git log
- All 5119 tests pass
