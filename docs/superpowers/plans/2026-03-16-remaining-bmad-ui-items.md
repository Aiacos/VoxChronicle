# Remaining BMAD UI Items

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** Complete BMAD Stories 6.1-6.2 remaining items: live cycle progress bar, LED badge recording state, tab badge counts, partial rendering.

**Architecture:** All changes are in MainPanel.mjs (data + rendering), main-panel.hbs (template), and vox-chronicle.css (styling). LED and progress bar are mostly CSS. Badge counts need new context data. Partial rendering replaces full re-renders with DOM-direct updates.

---

## Task 1: Live cycle progress bar (Story 6.1 AC4)

Add a 2px progress bar under the header that fills left→right during the live cycle (~30s). `progressPercent` already exists in _prepareContext but isn't rendered.

**Files:** templates/main-panel.hbs, styles/vox-chronicle.css

## Task 2: LED badge recording/streaming state (Story 6.1 AC2)

Badges need `--recording` class during live recording and `--streaming` during AI analysis. CSS already exists but template doesn't apply these classes.

**Files:** templates/main-panel.hbs, scripts/ui/MainPanel.mjs (_prepareContext)

## Task 3: Tab badge counts (Story 6.2 AC4)

Numeric badges on tab buttons showing: suggestion count (live tab), entity count (entities tab). CSS ::after pseudo-element.

**Files:** templates/main-panel.hbs, scripts/ui/MainPanel.mjs, styles/vox-chronicle.css

## Task 4: Partial rendering for live mode (Story 6.2 AC5)

Replace full re-render during state changes with DOM-direct updates where possible. Use requestAnimationFrame loop for progress bar + level meter (already done), and minimize full renders.

**Files:** scripts/ui/MainPanel.mjs
