# Settings Simplification & Code Cleanup Design

## Problem

VoxChronicle has two overlapping settings interfaces:
1. **Foundry native settings panel** - shows all 17 config-visible settings
2. **Custom VoxChronicleConfig FormApplication** - shows a subset with enhanced campaign dropdown

This causes user confusion (which panel is "complete"?) and code redundancy (~950 lines for the custom panel). Additionally, several code quality issues exist across the codebase.

## Solution

### 1. Remove Custom VoxChronicleConfig Panel

**Delete:**
- `scripts/ui/VoxChronicleConfig.mjs` (705 lines)
- `templates/config.hbs` (248 lines)

**Modify:**
- `scripts/core/Settings.mjs`: Remove `game.settings.registerMenu()` call and VoxChronicleConfig import
- `lang/en.json`, `lang/it.json`: Remove unused `VOXCHRONICLE.Config.*` localization keys

### 2. Inject Dynamic Campaign Dropdown into Native Settings

In the `renderSettingsConfig` hook in `main.mjs`, replace the text input for `kankaCampaignId` with a dynamic `<select>` dropdown + refresh button. This uses the same hook-injection pattern already used for "Test Connection" buttons.

Flow:
1. Hook fires on `renderSettingsConfig`
2. Find the `kankaCampaignId` input field
3. Replace it with a `<select>` element + refresh button
4. If Kanka token is set, auto-load campaigns via KankaClient
5. On token change, reload campaigns
6. On campaign select, update the hidden input value

### 3. Refactor Validation Button Handlers

Extract a shared `createValidationButton(targetName, validateFn)` function to replace the ~100 lines of duplicated code in `main.mjs` (lines 263-363).

### 4. Refactor Scene Control Tool Handlers

Extract tool handler functions into a shared object used by both the v13 block (`onChange`) and v11/v12 block (`onClick`). This eliminates duplicating the same async import + render logic.

### 5. Remove Dead Code in VoxChronicle.mjs

Delete placeholder methods never called by any code:
- `startRecording()` (lines 269-292)
- `stopRecording()` (lines 300-320)
- `processSession()` (lines 329-351)
- `publishToKanka()` (lines 359-377)

All workflow logic lives in `SessionOrchestrator`.

## Files Affected

| File | Action |
|------|--------|
| `scripts/ui/VoxChronicleConfig.mjs` | DELETE |
| `templates/config.hbs` | DELETE |
| `scripts/core/Settings.mjs` | Remove registerMenu, remove import |
| `scripts/main.mjs` | Refactor: campaign dropdown injection, validation button extraction, scene control dedup |
| `scripts/core/VoxChronicle.mjs` | Remove 4 dead methods |
| `lang/en.json` | Remove unused Config.* keys |
| `lang/it.json` | Remove unused Config.* keys |

## Risk Assessment

- **Low risk**: Removing dead code and unused files
- **Medium risk**: Campaign dropdown injection - must handle async loading, error states, token changes
- **Mitigation**: The injection pattern is proven (already used for validation buttons)
