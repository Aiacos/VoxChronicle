# Settings Simplification & Code Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the duplicate VoxChronicleConfig custom panel, inject campaign dropdown into native Foundry settings, and clean up code quality issues (dead code, duplicated handlers, scene control dedup).

**Architecture:** The native Foundry settings panel becomes the single source of truth for all VoxChronicle settings. The `renderSettingsConfig` hook is enhanced to inject both validation buttons (already present) and a dynamic Kanka campaign dropdown. Scene controls and validation handlers are deduplicated.

**Tech Stack:** Foundry VTT Module API (Hooks, Settings), JavaScript ES6+ modules, Vitest for tests.

---

### Task 1: Remove dead code from VoxChronicle.mjs

Lowest risk change. Remove 4 placeholder methods that are never called.

**Files:**
- Modify: `scripts/core/VoxChronicle.mjs:269-377`
- Modify: `tests/core/VoxChronicle.test.js:670-786`

**Step 1: Remove dead method tests**

In `tests/core/VoxChronicle.test.js`, delete the following test `describe` blocks that test the dead methods:
- `Recording Lifecycle` (lines 670-726) — tests `startRecording()` and `stopRecording()`
- `Session Processing` (lines 728-761) — tests `processSession()`
- `Kanka Publishing` (lines 763-787) — tests `publishToKanka()`

Also remove from `Integration` test the calls to `startRecording()` and `stopRecording()` — replace with a simpler test that just checks initialization and service status.

**Step 2: Run tests to verify they pass without dead method tests**

Run: `npx vitest run tests/core/VoxChronicle.test.js`
Expected: All remaining tests PASS

**Step 3: Remove dead methods from VoxChronicle.mjs**

In `scripts/core/VoxChronicle.mjs`, delete these methods:
- `startRecording()` (lines 269-292)
- `stopRecording()` (lines 300-320)
- `processSession()` (lines 329-351)
- `publishToKanka()` (lines 359-377)

Also remove state properties that were only used by dead methods:
- `this.isRecording` (line 67)
- `this.currentSession` (line 70)

And remove from `resetInstance()` the lines that reset these properties:
- `VoxChronicle.instance.isRecording = false;` (line 414)
- `VoxChronicle.instance.currentSession = null;` (line 415)

And remove from `getServicesStatus()` the line:
- `recording: this.isRecording,` (line 387)

**Step 4: Update remaining tests that reference removed properties**

In `tests/core/VoxChronicle.test.js`:
- In `Constructor` tests: remove assertions on `isRecording` and `currentSession`
- In `Singleton Pattern` reset test: remove assertion on `isRecording`
- In `Service Status` tests: remove assertions on `recording` property from status object
- In `Integration` test: rewrite to test init → getServicesStatus flow without recording

**Step 5: Run full test suite**

Run: `npx vitest run tests/core/VoxChronicle.test.js`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add scripts/core/VoxChronicle.mjs tests/core/VoxChronicle.test.js
git commit -m "Remove dead recording/publishing methods from VoxChronicle singleton

These methods (startRecording, stopRecording, processSession, publishToKanka)
were placeholder stubs never called by any code. All workflow logic lives in
SessionOrchestrator."
```

---

### Task 2: Remove VoxChronicleConfig custom panel

Remove the custom settings panel and its template. This eliminates the redundant UI.

**Files:**
- Delete: `scripts/ui/VoxChronicleConfig.mjs`
- Delete: `templates/config.hbs`
- Modify: `scripts/core/Settings.mjs:15,39-46`
- Modify: `tests/core/Settings.test.js:30-34`
- Modify: `lang/en.json:309-329`
- Modify: `lang/it.json:309-329`

**Step 1: Update Settings.mjs — remove registerMenu and import**

In `scripts/core/Settings.mjs`:
- Remove line 15: `import { VoxChronicleConfig } from '../ui/VoxChronicleConfig.mjs';`
- Remove lines 39-46 (the `game.settings.registerMenu()` call)

**Step 2: Update Settings test — remove VoxChronicleConfig mock**

In `tests/core/Settings.test.js`, remove lines 30-34:
```javascript
// Mock VoxChronicleConfig to avoid FormApplication dependency
vi.mock('../../scripts/ui/VoxChronicleConfig.mjs', () => ({
  VoxChronicleConfig: class MockVoxChronicleConfig {}
}));
```

**Step 3: Run Settings tests**

Run: `npx vitest run tests/core/Settings.test.js`
Expected: All tests PASS

**Step 4: Remove Config localization keys from en.json**

In `lang/en.json`, remove the entire `"Config"` block (lines 309-329):
```json
"Config": {
  "Title": "VoxChronicle Configuration",
  ...
  "Cancel": "Cancel"
},
```

Keep `"ConfigurationIncomplete"` key that's under a different section (it's used elsewhere).

**Step 5: Remove Config localization keys from it.json**

Same removal in `lang/it.json` — remove the `"Config"` block (lines 309-329).

**Step 6: Delete VoxChronicleConfig files**

```bash
git rm scripts/ui/VoxChronicleConfig.mjs templates/config.hbs
```

**Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add -A
git commit -m "Remove redundant VoxChronicleConfig custom settings panel

The custom panel duplicated settings already available in the native
Foundry settings UI. Campaign dropdown will be injected into the
native panel in a subsequent commit."
```

---

### Task 3: Refactor validation button handlers in main.mjs

Extract the ~100 lines of duplicated validation button code into a shared function.

**Files:**
- Modify: `scripts/main.mjs:256-364`

**Step 1: Extract createValidationButton function**

In `scripts/main.mjs`, replace lines 256-364 with:

```javascript
const VALIDATION_RESET_DELAY_MS = 2000;

/**
 * Create and inject a validation button next to an API key input field
 * @param {jQuery} inputElement - The input field to attach the button to
 * @param {string} targetName - Identifier for logging (e.g. 'openai', 'kanka')
 * @param {Function} validateFn - Async function that returns boolean
 */
function injectValidationButton(inputElement, targetName, validateFn) {
  if (inputElement.length === 0) return;

  const validateButton = $(`
    <button type="button" class="vox-chronicle-validate-button" data-validation-target="${targetName}">
      <i class="fa-solid fa-plug"></i> Test Connection
    </button>
  `);

  inputElement.parent().append(validateButton);

  validateButton.on('click', async (event) => {
    event.preventDefault();
    const button = $(event.currentTarget);
    const icon = button.find('i');

    button.prop('disabled', true);
    icon.removeClass('fa-plug').addClass('fa-spinner fa-spin');

    try {
      const isValid = await validateFn();
      icon.removeClass('fa-spinner fa-spin').addClass(isValid ? 'fa-check' : 'fa-times');
    } catch (error) {
      icon.removeClass('fa-spinner fa-spin').addClass('fa-times');
      logger.error(`${targetName} validation error:`, error);
    }

    setTimeout(() => {
      icon.removeClass('fa-check fa-times').addClass('fa-plug');
      button.prop('disabled', false);
    }, VALIDATION_RESET_DELAY_MS);
  });

  logger.info(`Validation button injected for ${targetName}`);
}

Hooks.on('renderSettingsConfig', (app, html) => {
  injectValidationButton(
    html.find(`input[name="${MODULE_ID}.openaiApiKey"]`),
    'openai',
    () => Settings.validateOpenAIKey()
  );

  injectValidationButton(
    html.find(`input[name="${MODULE_ID}.kankaApiToken"]`),
    'kanka',
    () => Settings.validateKankaToken()
  );
});
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (no tests directly test main.mjs hook handlers)

**Step 3: Commit**

```bash
git add scripts/main.mjs
git commit -m "Extract shared validation button handler to eliminate duplication

Replaces ~100 lines of nearly identical OpenAI/Kanka validation button
code with a single reusable injectValidationButton function."
```

---

### Task 4: Refactor scene control tool handlers

Extract tool handlers to eliminate duplication between v13 and v11/v12 blocks.

**Files:**
- Modify: `scripts/main.mjs:95-247`

**Step 1: Extract tool handler map**

Above the `getSceneControlButtons` hook, add a shared handler map:

```javascript
/**
 * Tool handler functions shared between Foundry v13 and v11/v12 scene controls.
 * Each handler opens the corresponding UI panel.
 */
const toolHandlers = {
  recorder: async () => {
    const recorder = await getRecorderControls();
    recorder.render(true, { focus: true });
  },
  speakerLabels: async () => {
    const { SpeakerLabeling } = await import('./ui/SpeakerLabeling.mjs');
    const speakerLabeling = new SpeakerLabeling();
    speakerLabeling.render(true, { focus: true });
  },
  vocabulary: async () => {
    const { VocabularyManager } = await import('./ui/VocabularyManager.mjs');
    const vocabularyManager = new VocabularyManager();
    vocabularyManager.render(true, { focus: true });
  },
  relationshipGraph: async () => {
    const { RelationshipGraph } = await import('./ui/RelationshipGraph.mjs');
    const graph = new RelationshipGraph();
    graph.render(true, { focus: true });
  },
  settings: () => {
    const app = new SettingsConfig();
    app.render(true, { focus: true });
    setTimeout(() => {
      const section = document.querySelector(`[data-tab="${MODULE_ID}"]`);
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }
};
```

**Step 2: Refactor v13 block to use handlers**

Replace the v13 tools block with:
```javascript
tools: {
  recorder: {
    name: 'recorder',
    icon: 'fa-solid fa-microphone',
    title: 'VOXCHRONICLE.Controls.Recorder',
    order: 0,
    button: true,
    onChange: toolHandlers.recorder
  },
  speakerLabels: {
    name: 'speakerLabels',
    icon: 'fa-solid fa-users',
    title: 'VOXCHRONICLE.Controls.SpeakerLabels',
    order: 1,
    button: true,
    onChange: toolHandlers.speakerLabels
  },
  vocabulary: {
    name: 'vocabulary',
    icon: 'fa-solid fa-book',
    title: 'VOXCHRONICLE.Controls.Vocabulary',
    order: 2,
    button: true,
    onChange: toolHandlers.vocabulary
  },
  relationshipGraph: {
    name: 'relationshipGraph',
    icon: 'fa-solid fa-project-diagram',
    title: 'VOXCHRONICLE.Controls.RelationshipGraph',
    order: 3,
    button: true,
    onChange: toolHandlers.relationshipGraph
  },
  settings: {
    name: 'settings',
    icon: 'fa-solid fa-cog',
    title: 'VOXCHRONICLE.Controls.Settings',
    order: 4,
    button: true,
    onChange: toolHandlers.settings
  }
}
```

**Step 3: Refactor v11/v12 block to use handlers**

Replace the v11/v12 tools array with:
```javascript
tools: [
  {
    name: 'recorder',
    title: 'VOXCHRONICLE.Controls.Recorder',
    icon: 'fa-solid fa-microphone',
    button: true,
    onClick: toolHandlers.recorder
  },
  {
    name: 'speaker-labels',
    title: 'VOXCHRONICLE.Controls.SpeakerLabels',
    icon: 'fa-solid fa-users',
    button: true,
    onClick: toolHandlers.speakerLabels
  },
  {
    name: 'vocabulary',
    title: 'VOXCHRONICLE.Controls.Vocabulary',
    icon: 'fa-solid fa-book',
    button: true,
    onClick: toolHandlers.vocabulary
  },
  {
    name: 'relationship-graph',
    title: 'VOXCHRONICLE.Controls.RelationshipGraph',
    icon: 'fa-solid fa-project-diagram',
    button: true,
    onClick: toolHandlers.relationshipGraph
  },
  {
    name: 'settings',
    title: 'VOXCHRONICLE.Controls.Settings',
    icon: 'fa-solid fa-cog',
    button: true,
    onClick: toolHandlers.settings
  }
]
```

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add scripts/main.mjs
git commit -m "Extract scene control tool handlers to eliminate v13/v11 duplication

Handler logic is now defined once in toolHandlers map and referenced
by both v13 (onChange) and v11/v12 (onClick) scene control definitions."
```

---

### Task 5: Inject Kanka campaign dropdown into native settings

The key feature migration: replace the text input for `kankaCampaignId` with a dynamic dropdown.

**Files:**
- Modify: `scripts/main.mjs` (add to `renderSettingsConfig` hook)

**Step 1: Add campaign dropdown injection**

In `scripts/main.mjs`, extend the `renderSettingsConfig` hook handler. After the validation button injections, add:

```javascript
// Inject dynamic campaign dropdown to replace text input
const campaignInput = html.find(`input[name="${MODULE_ID}.kankaCampaignId"]`);
if (campaignInput.length > 0) {
  const currentValue = campaignInput.val() || '';

  // Create select element with same name to replace the input
  const campaignSelect = $(`
    <select name="${MODULE_ID}.kankaCampaignId" class="vox-chronicle-campaign-select">
      <option value="${currentValue}" selected>${currentValue || game.i18n.localize('VOXCHRONICLE.Settings.CampaignPlaceholder')}</option>
    </select>
  `);

  const refreshButton = $(`
    <button type="button" class="vox-chronicle-validate-button" data-action="refresh-campaigns">
      <i class="fa-solid fa-sync-alt"></i>
    </button>
  `);

  // Replace input with select + refresh button
  campaignInput.replaceWith(campaignSelect);
  campaignSelect.after(refreshButton);

  // Load campaigns function
  async function loadCampaigns() {
    const token = html.find(`input[name="${MODULE_ID}.kankaApiToken"]`).val()
      || Settings.get('kankaApiToken');

    if (!token || token.trim().length === 0) {
      campaignSelect.html(`<option value="">${game.i18n.localize('VOXCHRONICLE.Settings.CampaignNeedsToken')}</option>`);
      return;
    }

    const refreshIcon = refreshButton.find('i');
    refreshIcon.addClass('fa-spin');
    campaignSelect.prop('disabled', true);

    try {
      const { KankaClient } = await import('./kanka/KankaClient.mjs');
      const client = new KankaClient(token);
      const campaigns = await client.getCampaigns();

      campaignSelect.empty();
      campaignSelect.append(`<option value="">${game.i18n.localize('VOXCHRONICLE.Settings.CampaignPlaceholder')}</option>`);

      for (const campaign of campaigns) {
        const selected = campaign.id.toString() === currentValue ? 'selected' : '';
        campaignSelect.append(`<option value="${campaign.id}" ${selected}>${campaign.name}</option>`);
      }

      if (campaigns.length === 0) {
        campaignSelect.html(`<option value="">${game.i18n.localize('VOXCHRONICLE.Settings.CampaignNone')}</option>`);
      }
    } catch (error) {
      logger.error('Failed to load campaigns:', error);
      campaignSelect.html(`<option value="${currentValue}">${currentValue || game.i18n.localize('VOXCHRONICLE.Settings.CampaignError')}</option>`);
    } finally {
      refreshIcon.removeClass('fa-spin');
      campaignSelect.prop('disabled', false);
    }
  }

  // Wire up refresh button
  refreshButton.on('click', (event) => {
    event.preventDefault();
    loadCampaigns();
  });

  // Auto-load campaigns if token exists
  const kankaToken = Settings.get('kankaApiToken');
  if (kankaToken && kankaToken.trim().length > 0) {
    loadCampaigns();
  }

  logger.info('Campaign dropdown injected');
}
```

**Step 2: Add localization keys for campaign dropdown**

In `lang/en.json`, add to the `Settings` section (these replace the old Config.* keys):
```json
"CampaignPlaceholder": "Select a campaign...",
"CampaignNone": "No campaigns available",
"CampaignNeedsToken": "Set Kanka API token first",
"CampaignError": "Failed to load campaigns"
```

In `lang/it.json`, add equivalent:
```json
"CampaignPlaceholder": "Seleziona una campagna...",
"CampaignNone": "Nessuna campagna disponibile",
"CampaignNeedsToken": "Inserisci prima il token API di Kanka",
"CampaignError": "Impossibile caricare le campagne"
```

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add scripts/main.mjs lang/en.json lang/it.json
git commit -m "Inject dynamic Kanka campaign dropdown into native settings panel

Replaces the text input for campaign ID with a select dropdown that
loads campaigns from the Kanka API. Includes refresh button and
loading/error states. This was the only unique feature of the removed
custom VoxChronicleConfig panel."
```

---

### Task 6: Final verification and cleanup

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Verify no broken imports**

Run: `grep -r "VoxChronicleConfig" scripts/ tests/ --include="*.mjs" --include="*.js"`
Expected: No results (all references removed)

Run: `grep -r "config\.hbs" scripts/ tests/ templates/ --include="*.mjs" --include="*.js" --include="*.hbs"`
Expected: No results

**Step 3: Verify no orphaned Config.* localization usage**

Run: `grep -r "Config\." scripts/ --include="*.mjs" | grep -i "VOXCHRONICLE"`
Expected: No references to `VOXCHRONICLE.Config.*` keys

**Step 4: Verify deleted files don't exist**

```bash
ls scripts/ui/VoxChronicleConfig.mjs templates/config.hbs 2>&1
```
Expected: "No such file or directory" for both

**Step 5: Commit any remaining cleanup**

If any cleanup is needed, commit it.

**Step 6: Update CHANGELOG.md**

Add entry for the settings simplification work.

**Step 7: Final commit**

```bash
git add CHANGELOG.md
git commit -m "Add changelog entry for settings simplification"
```
