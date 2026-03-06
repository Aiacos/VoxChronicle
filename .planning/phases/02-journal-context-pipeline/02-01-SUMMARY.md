---
phase: 02-journal-context-pipeline
plan: 01
subsystem: ui
tags: [applicationv2, journal-picker, foundry-settings, handlebars, tdd]

# Dependency graph
requires:
  - phase: 01-css-namespace
    provides: namespaced CSS classes used in all UI components
provides:
  - JournalPicker ApplicationV2 dialog for selecting primary/supplementary journals
  - activeAdventureJournalId and supplementaryJournalIds Foundry settings
  - MainPanel inline journal confirmation banner with content warnings
  - No-journal fallback logic (auto-select scene journal or open picker)
affects: [02-02, 02-03, ai-context-pipeline, live-mode-startup]

# Tech tracking
tech-stack:
  added: []
  patterns: [journal-picker-dialog, journal-confirmation-banner, no-journal-fallback]

key-files:
  created:
    - scripts/ui/JournalPicker.mjs
    - tests/ui/JournalPicker.test.js
  modified:
    - scripts/core/Settings.mjs
    - scripts/ui/MainPanel.mjs
    - templates/journal-picker.hbs
    - templates/main-panel.hbs
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

key-decisions:
  - "Used pre-computed boolean flags (isJournalTooShort/isJournalTooLong) instead of Handlebars eq helper for content warnings -- avoids reliance on custom Handlebars helpers"
  - "Auto-select scene-linked journal as fallback before opening picker -- reduces friction for DMs who only use one adventure"

patterns-established:
  - "Journal selection persistence pattern: activeAdventureJournalId (String) + supplementaryJournalIds (Array) as world-scoped non-config settings"
  - "Pre-recording gate pattern: check required state before starting live mode, auto-fix if possible, prompt user if not"

requirements-completed: [CTX-01]

# Metrics
duration: 8min
completed: 2026-03-06
---

# Phase 02 Plan 01: Journal Picker + Confirmation Banner Summary

**JournalPicker ApplicationV2 dialog with primary/supplementary selection, MainPanel confirmation banner, and no-journal startup gate**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-06T06:34:08Z
- **Completed:** 2026-03-06T06:42:52Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- JournalPicker dialog shows folder tree with checkboxes and primary radio designation
- MainPanel displays inline confirmation banner with selected adventure name, supplementary count, and content warnings
- No-journal fallback auto-selects scene journal or opens picker before live mode can start
- Full i18n support across all 8 language files
- 125 tests passing for JournalPicker + MainPanel, 4260 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Settings + JournalPicker ApplicationV2 dialog with primary designation** - `6719143` (feat)
2. **Task 2: MainPanel inline confirmation banner + no-journal fallback** - `61f6bf7` (feat)

## Files Created/Modified
- `scripts/ui/JournalPicker.mjs` - ApplicationV2 dialog for journal selection with folder tree, checkboxes, primary radio
- `scripts/core/Settings.mjs` - Added activeAdventureJournalId and supplementaryJournalIds settings
- `scripts/ui/MainPanel.mjs` - Added journal confirmation banner data, change-journal action, no-journal fallback
- `templates/journal-picker.hbs` - Updated template with primary radio buttons next to each journal
- `templates/main-panel.hbs` - Added inline confirmation banner before recording controls
- `styles/vox-chronicle.css` - CSS for primary radio, confirmation banner, warning styles
- `lang/*.json` - Added JournalPicker, Settings, and Panel keys to all 8 language files
- `tests/ui/JournalPicker.test.js` - 12 unit tests for JournalPicker dialog
- `tests/ui/MainPanel.test.js` - 8 new tests for journal banner and fallback logic

## Decisions Made
- Used pre-computed boolean flags (isJournalTooShort/isJournalTooLong) instead of Handlebars eq helper for content warnings -- avoids reliance on custom Handlebars helpers that may not exist in Foundry
- Auto-select scene-linked journal as fallback before opening picker -- reduces friction for DMs who only use one adventure

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Journal selection UI and persistence complete, ready for Plan 02 (JournalParser pipeline) to consume the selected journal IDs
- MainPanel confirmation banner provides visual feedback confirming which journal drives AI context

---
*Phase: 02-journal-context-pipeline*
*Completed: 2026-03-06*
