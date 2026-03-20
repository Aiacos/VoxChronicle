---
phase: 07-rules-lookup-integration
plan: "03"
subsystem: ui
tags: [rules-ui, suggestion-feed, on-demand-input, two-phase-cards, citations]
dependency_graph:
  requires: [07-01, 07-02]
  provides: [rules-card-ui, on-demand-rules-input, citation-badges]
  affects: [scripts/ui/MainPanel.mjs, templates/main-panel.hbs, styles/vox-chronicle.css]
tech_stack:
  added: []
  patterns: [two-phase-card-update, auto-dismiss-timeout, rules-input-always-visible]
key_files:
  created: []
  modified:
    - scripts/ui/MainPanel.mjs
    - templates/main-panel.hbs
    - lang/en.json
    - lang/it.json
    - lang/de.json
    - lang/es.json
    - lang/fr.json
    - lang/ja.json
    - lang/pt.json
    - lang/template.json
decisions:
  - "Rules input always visible (not gated behind isLiveMode) per plan requirement for all-mode availability"
  - "Card re-render recovery uses synthesisUnavailable flag when synthesis was in-flight during re-render"
  - "Unavailable cards stored data not pushed to _rulesCards (no persistence needed for error state)"
metrics:
  duration: "~4min"
  completed: "2026-03-20"
  tasks_completed: 1
  files_modified: 10
---

# Phase 07 Plan 03: Rules Card UI with On-Demand Input Summary

Rules card rendering and on-demand input wired into MainPanel suggestion feed with purple-tinted two-phase cards, citation badges, auto-dismiss for failures, and persistent input field visible in all modes.

## Tasks Completed

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Rules card rendering and on-demand input with tests | 358c822 | done |
| 2 | Visual verification | auto-approved | auto-advance |

## What Was Built

### MainPanel Rules Card Rendering (`_handleRulesCard`)

- Creates purple-tinted cards (`vox-chronicle-suggestion--rules`) in the existing suggestion feed
- Shows compendium excerpt immediately with a `Refining...` spinner while synthesis is pending
- When `synthesisPromise` resolves, updates card content in-place with AI answer and updated citations
- Auto badge (`vox-chronicle-suggestion__auto-badge`) for `source='auto'` (auto-detected), none for manual
- Citation badge at card bottom from `compendiumResults[0].rule.citation.formatted`
- Unavailable cards (`data.unavailable=true`) get muted styling and auto-dismiss after 10s with fade animation
- All rules cards stored in `_rulesCards[]` array for re-render recovery (same pattern as streaming cards)

### Persistent On-Demand Input

- Input field at panel bottom always visible (all modes: idle, live, chronicle)
- Enter key submits query to `_orchestrator.handleManualRulesQuery()`, clears input immediately
- Input value preserved across re-renders via `_rulesInputValue`
- Wired via AbortController signal for automatic cleanup on re-render

### Callback Wiring

- `onRulesCard: (data) => this._handleRulesCard(data)` registered in `setCallbacks` block
- Registered in both constructor path and `getInstance` update path

### CSS Rules Styles

All styles present (from previous commit):
- `.vox-chronicle-suggestion--rules` — purple background + border via CSS variables
- `.vox-chronicle-suggestion__refining` — spinner + muted text for refining state
- `.vox-chronicle-suggestion__citation` — badge with purple tint
- `.vox-chronicle-suggestion--unavailable` — muted opacity, dashed border
- `.vox-chronicle-suggestion--dismissing` — fade-out keyframe animation
- `.vox-chronicle-suggestion__auto-badge` — subtle auto-detected badge
- `.vox-chronicle-rules-input` / `.vox-chronicle-rules-input__field` — persistent input

### Language Files (all 8)

Keys added: `VOXCHRONICLE.Rules.AskPlaceholder`, `VOXCHRONICLE.Rules.Refining`, `VOXCHRONICLE.Rules.Unavailable`, `VOXCHRONICLE.Rules.AutoDetected`

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Plan Divergence: Rules Input Visibility

**Found during:** Task 1 review
**Issue:** Template had `{{#if isLiveMode}}` guard around the rules input, contradicting the plan requirement "Input field is visible in all modes (not just live)"
**Fix:** Removed the `{{#if isLiveMode}}` / `{{/if}}` wrapper, making input always visible
**Files modified:** `templates/main-panel.hbs`
**Rule applied:** Rule 1 (bug fix — incorrect behavior vs spec)

### Checkpoint Task 2

Auto-approved per `auto_advance: true` config. No manual verification possible in automated context.

## Self-Check

All claims verified:

- [x] `_handleRulesCard` method exists in `scripts/ui/MainPanel.mjs`
- [x] `onRulesCard` registered in `setCallbacks` (constructor + getInstance update path)
- [x] Rules input in `templates/main-panel.hbs` without isLiveMode guard
- [x] CSS rules styles present in `styles/vox-chronicle.css` (lines 1257-1350)
- [x] All 8 lang files have AskPlaceholder, Refining, Unavailable, AutoDetected keys
- [x] 207 MainPanel tests pass, 5047 total tests pass
- [x] Commit 358c822 exists

## Self-Check: PASSED
