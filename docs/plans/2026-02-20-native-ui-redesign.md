# VoxChronicle Native UI Redesign

**Date:** 2026-02-20
**Goal:** Remove custom CSS theme and integrate with Foundry VTT v13's native styling

## Problem

VoxChronicle uses a completely custom CSS theme (purple/dark blue, neutral grey text, custom buttons/tabs) that looks out of place next to Foundry v13's native UI (warm beige text, translucent dark backgrounds, subtle borders).

## Approach: Full Native Integration (Approach B)

### What to Remove

1. **All `--vox-*` CSS custom properties** — 40+ custom variables for colors, spacing, borders, shadows
2. **Custom background/text color overrides** — `#1a1a2e` bg, `#e0e0e0` text, `#f8f9fa` text
3. **Custom button styles** — `.vox-chronicle-btn` and all variants
4. **Custom tab styles** — `.vox-chronicle-tab`, `.vox-chronicle-tab--active`
5. **Custom scrollbar styles** — let Foundry handle this
6. **Custom form element overrides** — inputs, selects, textareas within `.vox-chronicle`

### What to Keep

1. **Structural layout** — flexbox/grid layouts, padding, gaps (using class namespace)
2. **Functional animations** — recording pulse (`vox-pulse`), progress bars
3. **Status colors** — recording red, success green, processing blue (but using Foundry-friendly values)
4. **BEM-namespaced structural classes** — `.vox-chronicle-panel__header`, `__controls`, `__content`, etc.
5. **Component-specific layout** — RAG status grid, image gallery grid, transcript scroll

### Template Changes

1. **Tabs:** Replace `<nav class="vox-chronicle-panel__tabs">` with `<nav class="sheet-tabs tabs">` and tab buttons use `data-tab` + `.active` class (Foundry native pattern)
2. **Buttons:** Remove `.vox-chronicle-btn` class, use plain `<button>` elements (Foundry styles them automatically within `.application`)
3. **Tab panes:** Use `data-tab` on pane divs (standard Foundry ApplicationV2 tab pattern)

### Foundry v13 Native Theme Values (Reference)

| Property | Value |
|----------|-------|
| App background | `rgba(11, 10, 19, 0.9)` (translucent dark) |
| Header background | `rgba(0, 0, 0, 0.5)` |
| Text primary | `rgb(239, 230, 216)` — warm beige |
| Text highlight | `rgb(247, 243, 232)` — lighter |
| Text body | `rgb(231, 209, 177)` — warm gold |
| Border | `0.75px solid rgb(48, 40, 49)` |
| Border radius | `6px` |
| Font | `Signika, sans-serif` |
| Tab active text | `rgb(247, 243, 232)` |
| Tab inactive text | `rgb(231, 209, 177)` |

### CSS Reduction Target

- Current: ~1877 lines of custom CSS
- Target: ~300-400 lines of structural/functional CSS only
- Remove: ~80% of CSS

### Files to Modify

1. `styles/vox-chronicle.css` — Major rewrite (strip theme, keep structure)
2. `templates/main-panel.hbs` — Update tab/button classes
3. `scripts/ui/MainPanel.mjs` — Update `switchTab()` selectors for new tab pattern
4. `tests/ui/MainPanel.test.js` — Update selectors in tests

### Testing Plan

1. Run all unit tests after changes
2. Deploy to Forge VTT and visually verify:
   - Panel opens with native styling
   - All 6 tabs switch correctly
   - Record button visible and styled
   - RAG status section readable
   - Panel blends with other Foundry windows
