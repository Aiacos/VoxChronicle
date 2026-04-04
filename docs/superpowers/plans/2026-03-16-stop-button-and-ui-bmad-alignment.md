# Stop Button Fix + UI BMAD Alignment

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Stop button during live mode and align the MainPanel UI with BMAD Stories 6.1-6.3 specifications.

**Architecture:** The MainPanel template (`main-panel.hbs`) has a disconnect between its JavaScript data (`visibleTabs`, `isLiveMode`) and the Handlebars rendering. The template hardcodes all 6 tabs instead of using the computed `visibleTabs` array. The Stop button handler code is correct but needs diagnostic logging to identify the runtime failure. Additionally, Story 6.2 AC3 (auto-transition Live→Chronicle on stop) was never wired.

**Tech Stack:** Handlebars templates, Foundry VTT ApplicationV2, CSS with `.vox-chronicle` namespace, Vitest tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `templates/main-panel.hbs` | Modify | Wire `visibleTabs` to filter tab buttons; hide transcript-review PART during live mode |
| `scripts/ui/MainPanel.mjs` | Modify | Add Stop diagnostic logging; auto-switch tab on stop (AC3); add Handlebars `includes` helper |
| `templates/parts/transcript-review.hbs` | Modify | Add live-mode conditional to hide during recording |
| `tests/ui/MainPanel.test.js` | Modify | Add tests for tab filtering, stop diagnostics, tab auto-transition |

---

## Chunk 1: Stop Button Diagnostics + Fix

### Task 1: Add diagnostic logging to Stop handler

The Stop button handler at `MainPanel.mjs:910` has correct logic but fails silently at runtime. We need to surface what's happening when the user clicks Stop.

**Files:**
- Modify: `scripts/ui/MainPanel.mjs:910-972` (`_handleToggleRecording`)

- [ ] **Step 1: Write failing test — Stop handler logs state before acting**

In `tests/ui/MainPanel.test.js`, in the `_handleToggleRecording` describe block:

```javascript
it('should log state info when stopping live mode', async () => {
  mockOrchestrator.state = 'live_listening';
  mockOrchestrator.isLiveMode = true;
  const panel = MainPanel.getInstance(mockOrchestrator);
  const logSpy = vi.spyOn(panel._logger, 'log');
  await panel._handleToggleRecording();
  expect(logSpy).toHaveBeenCalledWith(
    expect.stringContaining('Toggle recording'),
    expect.objectContaining({ state: 'live_listening', isLiveMode: true })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/MainPanel.test.js --reporter=verbose 2>&1 | grep -A2 "should log state"`
Expected: FAIL — no such log call exists yet.

- [ ] **Step 3: Add diagnostic logging to _handleToggleRecording**

In `scripts/ui/MainPanel.mjs`, at the top of `_handleToggleRecording()` (after the orchestrator null check), add:

```javascript
const state = this._orchestrator.state;
const isLiveMode = this._orchestrator.isLiveMode;
const isRecActive = this._isRecordingActive();
this._logger.log('Toggle recording', { state, isLiveMode, isRecordingActive: isRecActive });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/MainPanel.test.js --reporter=verbose 2>&1 | grep -A2 "should log state"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ui/MainPanel.mjs tests/ui/MainPanel.test.js
git commit -m "fix: add diagnostic logging to Stop button handler"
```

### Task 2: Auto-transition tabs Live→Chronicle on stop (Story 6.2 AC3)

When the user stops a live session, the active tab should auto-switch to `chronicle` so they can immediately process the transcript. Currently the tab stays on `live` after stopping.

**Files:**
- Modify: `scripts/ui/MainPanel.mjs:910-972` (`_handleToggleRecording`)
- Test: `tests/ui/MainPanel.test.js`

- [ ] **Step 1: Write failing test**

```javascript
it('should switch to chronicle tab after stopping live mode', async () => {
  mockOrchestrator.state = 'live_listening';
  mockOrchestrator.isLiveMode = true;
  const panel = MainPanel.getInstance(mockOrchestrator);
  panel._activeTab = 'live';
  // After stop, orchestrator transitions to idle
  mockOrchestrator.stopLiveMode.mockImplementation(async () => {
    mockOrchestrator.state = 'idle';
    mockOrchestrator.isLiveMode = false;
    mockOrchestrator.currentSession = { transcript: { text: 'test' } };
  });
  await panel._handleToggleRecording();
  expect(panel._activeTab).toBe('chronicle');
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `_activeTab` is still `'live'`

- [ ] **Step 3: Implement auto-transition in _handleToggleRecording**

In `scripts/ui/MainPanel.mjs`, after the `stopLiveMode()` / `stopSession()` call block (around line 928), add:

```javascript
// Auto-transition to chronicle tab after stopping (Story 6.2 AC3)
if (this._activeTab === 'live') {
  this._activeTab = 'chronicle';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/MainPanel.test.js --reporter=verbose 2>&1 | grep -A2 "should switch to chronicle"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ui/MainPanel.mjs tests/ui/MainPanel.test.js
git commit -m "feat: auto-switch to chronicle tab when stopping live mode (Story 6.2 AC3)"
```

---

## Chunk 2: Context-Aware Tab Filtering (Story 6.2 AC2)

### Task 3: Wire visibleTabs into the template

The `_getVisibleTabs()` method correctly returns mode-specific tabs, but the template ignores the `visibleTabs` array and hardcodes all 6 tabs. We need to register a Handlebars `includes` helper and use it in the template.

**Files:**
- Modify: `scripts/ui/MainPanel.mjs` — register `includes` Handlebars helper
- Modify: `templates/main-panel.hbs:164-172` — filter tabs using `visibleTabs`
- Test: `tests/ui/MainPanel.test.js`

- [ ] **Step 1: Write failing test — template context has correct visibleTabs in live mode**

This test already exists at line 2326 and passes. We need a test that verifies the tab filtering behavior at the switchTab level:

```javascript
it('should not switch to a tab not in visibleTabs', async () => {
  mockOrchestrator.isLiveMode = true;
  mockOrchestrator.state = 'live_listening';
  const panel = MainPanel.getInstance(mockOrchestrator);
  panel._activeTab = 'live';
  // 'chronicle' is not in live mode visibleTabs
  panel.switchTab('chronicle');
  // In live mode, chronicle should not be accessible — tab stays on live
  // (after we add the guard)
  expect(panel._activeTab).toBe('live');
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `switchTab` currently accepts any valid tab without mode filtering.

- [ ] **Step 3: Register Handlebars `includes` helper and update template**

In `scripts/ui/MainPanel.mjs`, add to `_onRender` or a static initializer:

```javascript
// In the module's init hook or MainPanel constructor (run once):
if (typeof Handlebars !== 'undefined' && !Handlebars.helpers.includes) {
  Handlebars.registerHelper('includes', function (array, value) {
    return Array.isArray(array) && array.includes(value);
  });
}
```

Update `templates/main-panel.hbs` lines 164-172 to filter tabs:

```handlebars
{{!-- Tab Navigation (context-aware per Story 6.2) --}}
<nav class="vox-chronicle-panel__tabs" {{#if isFirstLaunch}}hidden{{/if}}>
  {{#if (includes visibleTabs 'live')}}
  <button class="vox-chronicle-tab {{#if (eq activeTab 'live')}}vox-chronicle-tab--active{{/if}}" data-tab="live">{{localize "VOXCHRONICLE.Panel.TabLive"}}</button>
  {{/if}}
  {{#if (includes visibleTabs 'chronicle')}}
  <button class="vox-chronicle-tab {{#if (eq activeTab 'chronicle')}}vox-chronicle-tab--active{{/if}}" data-tab="chronicle">{{localize "VOXCHRONICLE.Panel.TabChronicle"}}</button>
  {{/if}}
  {{#if (includes visibleTabs 'images')}}
  <button class="vox-chronicle-tab {{#if (eq activeTab 'images')}}vox-chronicle-tab--active{{/if}}" data-tab="images">{{localize "VOXCHRONICLE.Panel.TabImages"}}</button>
  {{/if}}
  {{#if (includes visibleTabs 'transcript')}}
  <button class="vox-chronicle-tab {{#if (eq activeTab 'transcript')}}vox-chronicle-tab--active{{/if}}" data-tab="transcript">{{localize "VOXCHRONICLE.Panel.TabTranscript"}}</button>
  {{/if}}
  {{#if (includes visibleTabs 'entities')}}
  <button class="vox-chronicle-tab {{#if (eq activeTab 'entities')}}vox-chronicle-tab--active{{/if}}" data-tab="entities">{{localize "VOXCHRONICLE.Panel.TabEntities"}}</button>
  {{/if}}
  {{#if (includes visibleTabs 'analytics')}}
  <button class="vox-chronicle-tab {{#if (eq activeTab 'analytics')}}vox-chronicle-tab--active{{/if}}" data-tab="analytics">{{localize "VOXCHRONICLE.Panel.TabAnalytics"}}</button>
  {{/if}}
</nav>
```

Also add a guard to `switchTab()` to prevent switching to hidden tabs:

```javascript
switchTab(tabName) {
  if (!VALID_TABS.includes(tabName)) {
    this._logger.warn(`Invalid tab: ${tabName}`);
    return;
  }
  // Block switching to tabs not visible in current mode
  const visible = this._getVisibleTabs(!!this._orchestrator?.isLiveMode);
  if (!visible.includes(tabName)) {
    this._logger.debug(`Tab ${tabName} not visible in current mode, ignoring`);
    return;
  }
  // ... rest of existing switchTab code
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/MainPanel.test.js --reporter=verbose 2>&1 | grep -A2 "should not switch"`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass (no regressions from helper registration or tab filtering).

- [ ] **Step 6: Commit**

```bash
git add scripts/ui/MainPanel.mjs templates/main-panel.hbs tests/ui/MainPanel.test.js
git commit -m "feat: context-aware tab filtering per BMAD Story 6.2 AC2"
```

### Task 4: Hide transcript-review PART during live mode

The `transcriptReview` PART is always rendered below the main panel. During live mode it shows "No transcript available. Record a session first." which is confusing since recording IS active.

**Files:**
- Modify: `scripts/ui/MainPanel.mjs` — pass `isLiveMode` to transcriptReview PART context
- Modify: `templates/parts/transcript-review.hbs` — wrap in `{{#unless isLiveMode}}`
- Test: `tests/ui/MainPanel.test.js`

- [ ] **Step 1: Write failing test**

```javascript
it('should include isLiveMode in transcriptReview part context', async () => {
  mockOrchestrator.isLiveMode = true;
  mockOrchestrator.state = 'live_listening';
  const panel = MainPanel.getInstance(mockOrchestrator);
  const context = await panel._prepareContext({ parts: ['transcriptReview'] });
  expect(context.isLiveMode).toBe(true);
});
```

Note: `isLiveMode` is already in the context (line 484 of MainPanel.mjs). The test verifies it's available for the PART template. This test should pass already — the real change is in the template.

- [ ] **Step 2: Update transcript-review.hbs template**

Wrap the entire content in a live-mode guard:

```handlebars
{{#if isLiveMode}}
{{!-- Hidden during live mode — transcript builds in real-time --}}
{{else}}
<div class="vox-chronicle-transcript-review">
  {{#if hasTranscriptSegments}}
  ... (existing content unchanged)
  {{else}}
  <p class="vox-chronicle-transcript-review__empty">
    <i class="fa-solid fa-microphone-slash"></i>
    {{localize "VOXCHRONICLE.TranscriptReview.NoTranscript"}}
  </p>
  {{/if}}
</div>
{{/if}}
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add templates/parts/transcript-review.hbs tests/ui/MainPanel.test.js
git commit -m "fix: hide transcript-review PART during live mode"
```

---

## Chunk 3: Verification

### Task 5: Full regression + manual test plan

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: All 5035+ tests pass.

- [ ] **Step 2: Build module**

```bash
bash build.sh
```

Expected: Clean ZIP produced.

- [ ] **Step 3: Manual test checklist (on Foundry VTT)**

1. Open VoxChronicle panel — should show First Launch screen if no session
2. Click Live Session card — recording starts, tabs switch to [Live | Transcript | Analytics] only
3. Verify Stop button works — click Stop, verify:
   - Console shows "Toggle recording { state: 'live_listening', isLiveMode: true, isRecordingActive: true }"
   - Recording stops
   - Tab auto-transitions to Chronicle
   - Transcript review PART appears (was hidden during live)
4. Verify "No transcript available" message does NOT appear during live recording
5. Collapse panel — verify only LED badges visible at 48px width
6. Re-expand — verify tabs return

- [ ] **Step 4: Final commit (if manual test reveals fixes needed)**
