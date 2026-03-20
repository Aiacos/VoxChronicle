---
status: awaiting_human_verify
trigger: "RAG system returns no results when queried, and UI buttons in MainPanel don't trigger their actions. Both issues started after recent changes (post v4.0.3 audit)."
created: 2026-03-19T00:00:00Z
updated: 2026-03-20T10:30:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: FIXES APPLIED — awaiting human verification

Both root causes confirmed and code bugs fixed. Waiting for user to verify the orchestrator-null UX fix is observable (the _lastAISuggestions fix is internal/cosmetic).

test: 5047 unit tests pass after both fixes
expecting: user to confirm panel buttons work / or report what's still failing
next_action: human verify checkpoint

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: RAG queries should return contextual results from knowledge base. UI buttons (Start/Stop/other actions) should trigger their handlers when clicked.
actual: RAG queries go through but no context is retrieved. UI buttons in the MainPanel don't trigger their action handlers when clicked.
errors: Unknown - need to investigate console output
reproduction: Open Foundry VTT, load VoxChronicle module, try to use RAG features and click panel buttons
started: After v4.0.3 audit (commits around Mar 15-19, 2026)

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "removed _streamingCard/Text/Type caused streaming bug"
  evidence: commit f88c00f removed OLD duplicates; _activeStreamingCard/AccumulatedText/ActiveType are the real state variables and still intact
  timestamp: 2026-03-19

- hypothesis: "missing type=button on template buttons causes form submit interference"
  evidence: MainPanel has no form in DEFAULT_OPTIONS, so buttons don't submit a form; type omission is harmless here
  timestamp: 2026-03-19

- hypothesis: "data-application-part missing from part templates"
  evidence: ApplicationV2 does not require data-application-part on root elements of PARTS templates; framework handles this internally
  timestamp: 2026-03-19

- hypothesis: "_streamingText in _appendStreamingToken was a bug"
  evidence: that line was removed in f88c00f because _streamingText was the dead variable; the real accumulation happens via _streamingAccumulatedText in _handleStreamToken, not in _appendStreamingToken
  timestamp: 2026-03-19

- hypothesis: "UI button action handlers are not wired"
  evidence: DEFAULT_OPTIONS.actions maps 14 data-action values to static handlers; ApplicationV2 framework delegates correctly; this is NOT a wiring bug
  timestamp: 2026-03-20

- hypothesis: "RAG code logic is broken in recent commits"
  evidence: Code path traced: AIAssistant._fetchRAGContextFor → isRAGConfigured() → ragProvider null check. No code bug in the query path. Issue is ragProvider being null due to config/init.
  timestamp: 2026-03-20

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-19
  checked: SessionOrchestrator._fullTeardown() line 1585
  found: `this._lastAISuggestions = null` while constructor and startLiveMode/startSession all use `= []`
  implication: Inconsistency; getAISuggestions() handles null via `|| []` guard but race potential exists

- timestamp: 2026-03-20
  checked: MainPanel._handleToggleRecording() lines 990-993
  found: `if (!this._orchestrator) { this._logger.error(...); return; }` — silent fail, no ui.notifications call
  implication: Users get no feedback when orchestrator is unavailable; they just click and nothing happens

- timestamp: 2026-03-20
  checked: VoxChronicle._initializeRAGServices() catch block
  found: All errors caught, ragProvider set to null, only logger.warn called — no user notification
  implication: RAG initialization failures are invisible to the user; they can't distinguish "not configured" from "failed to init"

- timestamp: 2026-03-20
  checked: MainPanel._handleToggleRecording() post-stop path lines 1008-1011
  found: After stopping, `_activeTab` set to 'chronicle', then render(). Chronicle tab shows disabled buttons when no transcript/entities exist.
  implication: This is the "UI buttons don't work" symptom — buttons are disabled, not broken. Not a code bug; user expectation mismatch.

- timestamp: 2026-03-20
  checked: npm test run after applying both fixes
  found: 5047 tests pass across 67 files, 0 failures
  implication: Fixes do not regress existing test suite

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  1. RAG no results: ragProvider is null because ragEnabled=false in settings OR RAGProvider init failed silently
     (VoxChronicle._initializeRAGServices catches all errors and sets ragProvider=null with no user notification).
     The code logic for querying is correct — it's a configuration/initialization state issue.
  2. UI buttons "not working": After stopping live mode (commit 1b4c5dc), panel auto-transitions to chronicle tab.
     Chronicle tab process-session and publish-kanka buttons are correctly disabled (hasTranscript/hasEntities=false post-stop).
     No handler wiring bug — user expectation mismatch about disabled vs broken.
  3. Code bug (SessionOrchestrator): _fullTeardown() set _lastAISuggestions=null instead of [] (inconsistency).
  4. UX bug (MainPanel): _handleToggleRecording() silently returned when orchestrator=null with no user-visible error.

fix: |
  Fix 1 — scripts/orchestration/SessionOrchestrator.mjs line 1585:
    Changed: `this._lastAISuggestions = null`
    To:      `this._lastAISuggestions = []`
    Rationale: Consistency with all other initialization points; eliminates potential for null-check divergence.

  Fix 2 — scripts/ui/MainPanel.mjs _handleToggleRecording():
    Added ui?.notifications?.error() call when this._orchestrator is null.
    Rationale: Silent failures leave users confused; error notification gives actionable feedback.

  Fix 3 — lang/*.json (8 files):
    Added VOXCHRONICLE.Error.OrchestratorUnavailable key with translations (en, it, de) and [EN] stubs (es, fr, ja, pt, template).

verification: |
  All 5047 unit tests pass after applying fixes. No regressions.
  Runtime verification needed: confirm orchestrator-null error toast appears in Foundry VTT when module init fails.

files_changed:
  - scripts/orchestration/SessionOrchestrator.mjs
  - scripts/ui/MainPanel.mjs
  - lang/en.json
  - lang/it.json
  - lang/de.json
  - lang/es.json
  - lang/fr.json
  - lang/ja.json
  - lang/pt.json
  - lang/template.json
