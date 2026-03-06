---
phase: 06-state-machine-ui-accuracy
plan: 02
subsystem: ui
tags: [handlebars, css, dom-manipulation, streaming, localization]

# Dependency graph
requires:
  - phase: 01-css-namespace
    provides: BEM naming conventions and vox-chronicle prefix pattern
provides:
  - Status badge component with 3-state mapping (idle/live/analyzing)
  - Structured suggestion cards with type badge, title, bullets layout
  - _parseCardContent parser for freeform AI text
  - Streaming DOM helpers (_createStreamingCard, _appendStreamingToken, _finalizeStreamingCard)
  - Scrollable suggestions container with auto-scroll detection
affects: [06-03-PLAN, live-mode-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [status-state-mapping, card-content-parser, streaming-dom-helpers]

key-files:
  modified:
    - scripts/ui/MainPanel.mjs
    - templates/main-panel.hbs
    - styles/vox-chronicle.css
    - tests/ui/MainPanel.test.js
    - lang/en.json
    - lang/it.json
    - lang/de.json
    - lang/es.json
    - lang/fr.json
    - lang/ja.json
    - lang/pt.json
    - lang/template.json

key-decisions:
  - "3-state status badge mapping: idle (gray), live (green), analyzing (amber+pulse) covers all DM-visible states"
  - "Type badge colors: narration=blue, dialogue=green, action=orange, reference=purple for quick visual scanning"
  - "Bullet limit of 3 max per card for glanceability"
  - "Streaming card state stored on instance properties for re-render recovery"

patterns-established:
  - "Card content parser: first line = title, bullet lines = bullets, fallback to sentence splitting"
  - "Streaming DOM pattern: create skeleton -> append tokens -> finalize with parsed structure"

requirements-completed: [UI-02]

# Metrics
duration: 4min
completed: 2026-03-06
---

# Phase 06 Plan 02: Status Badge & Suggestion Cards Summary

**Status badge with 3-state orchestrator mapping, structured suggestion cards with type badges/title/bullets, and streaming DOM helpers for Plan 03 wiring**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T14:21:39Z
- **Completed:** 2026-03-06T14:26:00Z
- **Tasks:** 1 (TDD)
- **Files modified:** 12

## Accomplishments
- Status badge in panel header maps orchestrator state to 3 visual states (IDLE gray, LIVE green, ANALYZING amber pulse)
- Suggestions restructured from plain paragraphs into typed cards with dismiss button, scrollable container
- _parseCardContent handles markdown headings, bullet lists (-, *, numbered), sentence fallback
- Streaming DOM helpers ready for Plan 03 wiring (create/append/finalize pattern)
- All 8 language files updated with 5 new localization keys each

## Task Commits

Each task was committed atomically:

1. **Task 1: Status badge, suggestion cards, CSS, streaming helpers, localization** - `a645b20` (feat, TDD)

## Files Created/Modified
- `scripts/ui/MainPanel.mjs` - Status mapping in _prepareContext, _parseCardContent, dismiss handler, streaming DOM helpers
- `templates/main-panel.hbs` - Status badge bar, restructured suggestion cards with type/title/bullets/dismiss
- `styles/vox-chronicle.css` - Status badge styles (3 states + pulse), suggestion card styles (type colors, dismiss, bullets, streaming)
- `tests/ui/MainPanel.test.js` - 24 new tests (status mapping, parseCardContent, dismiss, streaming helpers)
- `lang/*.json` - Status.Idle/Live/Analyzing, DismissSuggestion, AIThinking in all 8 files

## Decisions Made
- 3-state status badge mapping covers all DM-visible states without overwhelming with internal transitions
- Type badge colors (narration=blue, dialogue=green, action=orange, reference=purple) for quick visual scanning
- Bullet limit of 3 max per card ensures glanceability during gameplay
- Streaming card state stored on instance properties (_streamingCard, _streamingText, _streamingType) for re-render recovery

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Status badge and suggestion cards render correctly
- Streaming DOM helpers are callable and ready for Plan 03 to wire up real-time token streaming
- All tests pass (137/137 in MainPanel.test.js)

---
*Phase: 06-state-machine-ui-accuracy*
*Completed: 2026-03-06*
