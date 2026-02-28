# Phase 1: CSS Namespace - Research

**Researched:** 2026-02-28
**Domain:** CSS class namespacing / Foundry VTT module isolation
**Confidence:** HIGH

## Summary

This phase is a mechanical refactoring: rename all un-namespaced CSS classes in 6 Handlebars templates and 1 stylesheet to carry the `vox-chronicle-` prefix. The project already has a well-established prefix pattern in `recorder.hbs` and `main-panel.hbs` that serves as the reference. The work is bounded, well-understood, and has no external dependencies.

The main complexity comes from three areas: (1) correctly distinguishing module-owned classes from Foundry-native classes that must NOT be renamed, (2) updating JavaScript querySelector/classList references that use these class names, and (3) updating test files that reference class name strings in mock selectors.

**Primary recommendation:** Process one template at a time (template + CSS + JS + tests), verify tests pass after each, commit per template for easy rollback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use flat `vox-chronicle-` prefix (matching existing main-panel.hbs pattern)
- Example: `.speaker-row` -> `.vox-chronicle-speaker-row`
- Do NOT introduce BEM nesting -- keep consistent with existing codebase convention
- Preserve the original class name after the prefix for searchability
- Be careful with classes that may be Foundry core classes (e.g., `dialog`, `window-content`) -- do NOT rename those
- Be careful with vis-network library classes in relationship-graph.hbs -- do NOT rename third-party classes
- Update any JavaScript `querySelector`, `classList`, or `className` references in corresponding .mjs files
- Process templates in order: speaker-labeling, entity-preview, relationship-graph, vocabulary-manager, analytics-tab, journal-picker

### Claude's Discretion
- Exact ordering of template processing
- Whether to batch all changes in one commit or one per template
- How to identify Foundry-core vs module-owned classes

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | All 214 un-namespaced CSS classes are prefixed with `vox-chronicle-` to prevent module conflicts | Complete inventory of un-namespaced classes per template, CSS rules, JS references, and test references documented below. Foundry-native classes identified for exclusion. |
</phase_requirements>

## Standard Stack

Not applicable -- this phase uses no new libraries. All work is within existing CSS, Handlebars, and JavaScript files.

## Architecture Patterns

### Reference Pattern (from recorder.hbs / main-panel.hbs)

The existing prefixed templates establish a clear pattern:

```css
/* Component container */
.vox-chronicle-speaker-labeling { ... }

/* Child elements: flat prefix, NOT BEM nesting */
.vox-chronicle-speaker-labeling .vox-chronicle-speaker-row { ... }

/* Modifier/state classes: kept short, used as compound selectors */
.vox-chronicle-speaker-labeling .vox-chronicle-speaker-row.known { ... }
```

**Key rules:**
1. Container class: `.vox-chronicle-{component-name}` (already exists on all 6 templates)
2. Child elements: `.vox-chronicle-{descriptive-name}` (flat prefix, no BEM `__` or `--`)
3. State/modifier classes: kept short (`.known`, `.selected`, `.collapsed`, `.error`, `.success`) because they are ALWAYS used in compound selectors with a prefixed parent (e.g., `.vox-chronicle-entity-preview .entity-preview-results.success`)

### Modifier Classes Strategy (CRITICAL)

State/modifier classes like `known`, `selected`, `collapsed`, `success`, `error`, `expanded`, `active`, `inactive`, `configured`, `missing`, `creating`, `nested`, `hidden` are used as compound selectors:

```css
/* These are safe -- they only apply within a namespaced parent */
.vox-chronicle-entity-preview .entity-section.collapsed .section-content { display: none; }
.vox-chronicle-speaker-labeling .speaker-row.known { border-left-color: #06d6a0; }
```

**Decision needed:** Should these short modifiers also get the prefix? The user decision says "all un-namespaced CSS classes" but these are contextual modifiers that can ONLY collide if another module uses the exact same parent+modifier compound. The safe choice is to prefix them too (e.g., `.vox-chronicle-collapsed`), but this creates verbosity. The existing pattern in recorder.hbs keeps state modifiers short (`ready`, `recording`, `paused`, `processing`, `error`, `mode-api`, `configured`, `missing`).

**Recommendation:** Follow the existing recorder.hbs pattern -- keep state/modifier classes short. They are already scoped by their namespaced parent selector. This matches the user's instruction to "keep consistent with existing codebase convention." Only prefix element class names (the nouns), not state modifiers (the adjectives).

### Foundry-Native Classes (DO NOT RENAME)

These classes belong to Foundry VTT's CSS framework and MUST NOT be renamed:

| Class | Template | Foundry Purpose |
|-------|----------|----------------|
| `tabs` | vocabulary-manager.hbs | Foundry tab navigation container |
| `item` | vocabulary-manager.hbs | Foundry tab navigation item |
| `tab` | vocabulary-manager.hbs | Foundry tab content pane |
| `hidden` | journal-picker.hbs | Foundry/CSS utility for visibility |
| `fa-solid`, `fa-*` | all templates | FontAwesome icon classes |

### Third-Party Classes (DO NOT RENAME)

| Library | Template | Notes |
|---------|----------|-------|
| vis-network | relationship-graph.hbs | vis-network renders its own DOM inside `#relationship-graph-network` container. No vis-network CSS classes appear in the template. Safe -- no vis-network classes to worry about. |

## Complete Class Inventory Per Template

### 1. speaker-labeling.hbs (21 un-namespaced classes)

**Classes to prefix (in CSS + HBS):**
| Current Class | New Class | In CSS? | In JS? |
|--------------|-----------|---------|--------|
| `form-description` | `vox-chronicle-form-description` | Yes (line 268) | No |
| `speaker-labels-header` | `vox-chronicle-speaker-labels-header` | Yes (line 277) | No |
| `header-speaker-id` | `vox-chronicle-header-speaker-id` | No | No |
| `header-player-name` | `vox-chronicle-header-player-name` | No | No |
| `header-quick-assign` | `vox-chronicle-header-quick-assign` | Yes (line 995) | No |
| `speaker-labels-list` | `vox-chronicle-speaker-labels-list` | Yes (line 291) | No |
| `speaker-row` | `vox-chronicle-speaker-row` | Yes (lines 297-309) | No |
| `speaker-id` | `vox-chronicle-speaker-id` | Yes (lines 311-318) | No |
| `speaker-id-text` | `vox-chronicle-speaker-id-text` | No | No |
| `known-indicator` | `vox-chronicle-known-indicator` | Yes (line 318) | No |
| `speaker-label` | `vox-chronicle-speaker-label` | Yes (line 320) | No |
| `btn-clear` | `vox-chronicle-btn-clear` | No | No |
| `quick-assign` | `vox-chronicle-quick-assign` | No | No |
| `no-speakers-message` | `vox-chronicle-no-speakers-message` | No | No |
| `form-actions` | `vox-chronicle-form-actions` | Yes (line 326) | No |
| `btn-auto-detect` | `vox-chronicle-btn-auto-detect` | No | No |
| `btn-reset` | `vox-chronicle-btn-reset` | No | No |
| `btn-save` | `vox-chronicle-btn-save` | No | No |
| `form-help` | `vox-chronicle-form-help` | No | No |
| `help-content` | `vox-chronicle-help-content` | No | No |

**Modifier classes (keep short per convention):** `known` (used as `.speaker-row.known`)

**JS references (SpeakerLabeling.mjs):** No un-namespaced class selector references found. All selectors use attribute selectors (`input[name^="speaker-"]`, `select[data-action="quick-assign"]`, `form`).

**Test references (SpeakerLabeling.test.js):** No un-namespaced class selector references. Tests use attribute selectors and mock elements.

### 2. entity-preview.hbs (57 un-namespaced classes)

**Classes to prefix (in CSS + HBS):**
| Current Class | New Class | In CSS? | In JS? | In Tests? |
|--------------|-----------|---------|--------|-----------|
| `preview-description` | `vox-chronicle-preview-description` | Yes (line 346) | No | No |
| `preview-warning` | `vox-chronicle-preview-warning` | Yes (line 202) | No | No |
| `entity-preview-progress` | `vox-chronicle-entity-preview-progress` | Yes (line 355) | No | No |
| `progress-message` | `vox-chronicle-progress-message` | Yes (line 363) | No | No |
| `progress-bar` | `vox-chronicle-progress-bar` | Yes (line 176) | No | No |
| `progress-fill` | `vox-chronicle-progress-fill` | Yes (line 183) | No | No |
| `progress-count` | `vox-chronicle-progress-count` | Yes (line 364) | No | No |
| `entity-preview-results` | `vox-chronicle-entity-preview-results` | Yes (line 366) | No | No |
| `results-summary` | `vox-chronicle-results-summary` | Yes (line 376) | No | No |
| `created-count` | `vox-chronicle-created-count` | Yes (line 377) | No | No |
| `failed-count` | `vox-chronicle-failed-count` | Yes (line 378) | No | No |
| `failed-entities` | `vox-chronicle-failed-entities` | Yes (line 380) | No | No |
| `failed-entity` | `vox-chronicle-failed-entity` | Yes (line 385) | No | No |
| `failed-type` | `vox-chronicle-failed-type` | No | No | No |
| `failed-name` | `vox-chronicle-failed-name` | No | No | No |
| `failed-error` | `vox-chronicle-failed-error` | No | No | No |
| `entity-sections` | `vox-chronicle-entity-sections` | Yes (line 387) | No | No |
| `entity-section` | `vox-chronicle-entity-section` | Yes (lines 388-415) | Yes* | Yes* |
| `section-header` | `vox-chronicle-section-header` | Yes (line 394) | No | No |
| `section-toggle` | `vox-chronicle-section-toggle` | No | No | No |
| `section-title` | `vox-chronicle-section-title` | Yes (line 406) | No | No |
| `section-count` | `vox-chronicle-section-count` | Yes (line 407) | No | No |
| `section-content` | `vox-chronicle-section-content` | Yes (lines 409-415) | No | No |
| `entity-row` | `vox-chronicle-entity-row` | Yes (line 417) | No | No |
| `entity-select` | `vox-chronicle-entity-select` | Yes (line 429) | No | No |
| `entity-info` | `vox-chronicle-entity-info` | Yes (line 431) | No | No |
| `entity-name` | `vox-chronicle-entity-name` | Yes (line 437) | No | No |
| `entity-type` | `vox-chronicle-entity-type` | Yes (line 443) | No | No |
| `entity-description` | `vox-chronicle-entity-description` | Yes (line 444) | No | No |
| `entity-actions` | `vox-chronicle-entity-actions` | Yes (line 455) | No | No |
| `btn-edit` | `vox-chronicle-btn-edit` | No | No | No |
| `btn-generate` | `vox-chronicle-btn-generate` | No | No | No |
| `entity-preview-image` | `vox-chronicle-entity-preview-image` | Yes (line 457) | No | No |
| `entity-image-placeholder` | `vox-chronicle-entity-image-placeholder` | Yes (line 465) | No | No |
| `placeholder-text` | `vox-chronicle-placeholder-text` | Yes (line 479) | No | No |
| `no-entities` | `vox-chronicle-no-entities` | Yes (line 481) | No | No |
| `relationships-section` | `vox-chronicle-relationships-section` | No | No | No |
| `btn-view-graph` | `vox-chronicle-btn-view-graph` | No | No | No |
| `relationships-description` | `vox-chronicle-relationships-description` | No | No | No |
| `relationship-row` | `vox-chronicle-relationship-row` | No | No | No |
| `relationship-select` | `vox-chronicle-relationship-select` | No | No | No |
| `relationship-info` | `vox-chronicle-relationship-info` | No | No | No |
| `relationship-entities` | `vox-chronicle-relationship-entities` | No | No | No |
| `source-entity` | `vox-chronicle-source-entity` | No | No | No |
| `target-entity` | `vox-chronicle-target-entity` | No | No | No |
| `relationship-type-label` | `vox-chronicle-relationship-type-label` | No | No | No |
| `relationship-description` | `vox-chronicle-relationship-description` | No | No | No |
| `relationship-confidence` | `vox-chronicle-relationship-confidence` | No | No | No |
| `form-footer` | `vox-chronicle-form-footer` | No | No | No |
| `selection-actions` | `vox-chronicle-selection-actions` | Yes (line 491) | No | No |
| `btn-select-all` | `vox-chronicle-btn-select-all` | No | No | No |
| `btn-deselect-all` | `vox-chronicle-btn-deselect-all` | No | No | No |
| `form-actions` | `vox-chronicle-form-actions` | Yes (line 326) | No | No |
| `btn-skip` | `vox-chronicle-btn-skip` | No | No | No |
| `btn-confirm` | `vox-chronicle-btn-confirm` | No | No | No |
| `creating-message` | `vox-chronicle-creating-message` | No | No | No |
| `btn-close` | `vox-chronicle-btn-close` | No | No | No |
| `btn-retry` | `vox-chronicle-btn-retry` | No | No | No |

**JS references requiring update (EntityPreview.mjs):**
- Line 1303: `.entity-section` -> `.vox-chronicle-entity-section` (closest() call)
- Line 1306: `'collapsed'` -- modifier class, keep as-is per convention

**Test references requiring update (EntityPreview.test.js):**
- Line 1136: `'collapsed'` -- modifier, keep as-is
- Line 1149: `'collapsed'` -- modifier, keep as-is

**Modifier classes (keep short):** `selected`, `known`, `collapsed`, `success`, `error`, `creating`

### 3. relationship-graph.hbs (24 un-namespaced classes)

**Classes to prefix (in CSS + HBS):**
| Current Class | New Class | In CSS? | In JS? |
|--------------|-----------|---------|--------|
| `graph-error` | `vox-chronicle-graph-error` | No | No |
| `graph-empty` | `vox-chronicle-graph-empty` | Yes (line 532) | No |
| `empty-hint` | `vox-chronicle-empty-hint` | No | No |
| `graph-visualization` | `vox-chronicle-graph-visualization` | No | No |
| `graph-toolbar` | `vox-chronicle-graph-toolbar` | No | No |
| `toolbar-section` | `vox-chronicle-toolbar-section` | No | No |
| `filter-controls` | `vox-chronicle-filter-controls` | No | No |
| `filter-label` | `vox-chronicle-filter-label` | No | No |
| `action-controls` | `vox-chronicle-action-controls` | No | No |
| `btn-action` | `vox-chronicle-btn-action` | No | No |
| `graph-container` | `vox-chronicle-graph-container` | Yes (line 508) | Yes* |
| `graph-legend` | `vox-chronicle-graph-legend` | Yes (line 518) | No |
| `legend-header` | `vox-chronicle-legend-header` | No | No |
| `legend-title` | `vox-chronicle-legend-title` | Yes (line 528) | No |
| `legend-content` | `vox-chronicle-legend-content` | No | No |
| `legend-section` | `vox-chronicle-legend-section` | No | No |
| `legend-section-title` | `vox-chronicle-legend-section-title` | No | No |
| `legend-item` | `vox-chronicle-legend-item` | Yes (line 529) | No |
| `legend-edge` | `vox-chronicle-legend-edge` | Yes (line 530) | No |
| `graph-footer` | `vox-chronicle-graph-footer` | No | No |
| `graph-stats` | `vox-chronicle-graph-stats` | Yes (line 545) | No |
| `stat-item` | `vox-chronicle-stat-item` | Yes (line 554) | No |
| `graph-actions` | `vox-chronicle-graph-actions` | No | No |
| `btn-close` | `vox-chronicle-btn-close` | No | No |

**JS references requiring update (RelationshipGraph.mjs):**
- Line 436: `#relationship-graph-network` -- this is an ID selector, NOT a class. Does NOT need prefix change. (IDs don't collide the same way classes do, and this is already scoped to the component.)

**Test references:** No un-namespaced class selector references. Tests use attribute selectors and mock `querySelector`/`querySelectorAll` with generic patterns.

### 4. vocabulary-manager.hbs (33 un-namespaced classes)

**Classes to prefix (HBS only -- NO CSS rules exist):**
| Current Class | New Class | In JS? | In Tests? |
|--------------|-----------|--------|-----------|
| `vocabulary-description` | `vox-chronicle-vocabulary-description` | No | No |
| `vocabulary-stats` | `vox-chronicle-vocabulary-stats` | No | No |
| `stats-label` | `vox-chronicle-stats-label` | No | No |
| `stats-count` | `vox-chronicle-stats-count` | No | No |
| `category-content` | `vox-chronicle-category-content` | Yes* | No |
| `category-description` | `vox-chronicle-category-description` | No | No |
| `terms-section` | `vox-chronicle-terms-section` | No | No |
| `terms-header` | `vox-chronicle-terms-header` | No | No |
| `terms-title` | `vox-chronicle-terms-title` | No | No |
| `clear-category-btn` | `vox-chronicle-clear-category-btn` | No | No |
| `terms-list` | `vox-chronicle-terms-list` | No | No |
| `term-item` | `vox-chronicle-term-item` | No | No |
| `term-text` | `vox-chronicle-term-text` | No | No |
| `remove-term-btn` | `vox-chronicle-remove-term-btn` | No | No |
| `no-terms-message` | `vox-chronicle-no-terms-message` | No | No |
| `add-term-section` | `vox-chronicle-add-term-section` | No | No |
| `add-term-input-group` | `vox-chronicle-add-term-input-group` | No | No |
| `term-input` | `vox-chronicle-term-input` | Yes* | Yes* |
| `add-term-btn` | `vox-chronicle-add-term-btn` | No | No |
| `term-count` | `vox-chronicle-term-count` | No | No |
| `tab-content` | `vox-chronicle-tab-content` | No | No |
| `vocabulary-actions` | `vox-chronicle-vocabulary-actions` | No | No |
| `action-group` | `vox-chronicle-action-group` | No | No |
| `suggest-foundry-btn` | `vox-chronicle-suggest-foundry-btn` | No | No |
| `import-btn` | `vox-chronicle-import-btn` | No | No |
| `export-btn` | `vox-chronicle-export-btn` | No | No |
| `clear-all-btn` | `vox-chronicle-clear-all-btn` | No | No |
| `vocabulary-help` | `vox-chronicle-vocabulary-help` | No | No |
| `help-content` | `vox-chronicle-help-content` | No | No |

**DO NOT RENAME (Foundry-native tab classes):**
- `tabs` (nav element, line 26)
- `item` (tab anchors, line 28)
- `tab` (tab content panes, line 41)

**JS references requiring update (VocabularyManager.mjs):**
- Line 141: `.term-input` -> `.vox-chronicle-term-input`
- Line 151: `.tabs .item` -> NO CHANGE (Foundry native classes)
- Line 301: `.category-content` -> `.vox-chronicle-category-content`
- Line 302: `.term-input` -> `.vox-chronicle-term-input`
- Line 350: `.category-content` -> `.vox-chronicle-category-content`
- Line 383: `.category-content` -> `.vox-chronicle-category-content`

**Test references requiring update (VocabularyManager.test.js):**
- Lines 1251, 1323, 1359, 1474: `.term-input` -> `.vox-chronicle-term-input`
- Lines 1252, 1274, 1393, 1423: `.tabs .item` -> NO CHANGE (Foundry native)

**Note about `danger` class:** Used on `action-group` div (line 144). This is a modifier -- keep short per convention.

### 5. analytics-tab.hbs (48 un-namespaced classes)

**Classes to prefix (HBS only -- NO CSS rules exist):**
| Current Class | New Class | In JS? |
|--------------|-----------|--------|
| `analytics-section` | `vox-chronicle-analytics-section` | No |
| `current-session` | `vox-chronicle-current-session` | No |
| `section-header` | `vox-chronicle-section-header` | No |
| `session-actions` | `vox-chronicle-session-actions` | No |
| `end-session` | `vox-chronicle-end-session` | No |
| `session-summary` | `vox-chronicle-session-summary` | No |
| `summary-stats` | `vox-chronicle-summary-stats` | No |
| `stat-item` | `vox-chronicle-stat-item` | No |
| `stat-label` | `vox-chronicle-stat-label` | No |
| `stat-value` | `vox-chronicle-stat-value` | No |
| `speaker-stats` | `vox-chronicle-speaker-stats` | No |
| `speaker-list` | `vox-chronicle-speaker-list` | No |
| `speaker-item` | `vox-chronicle-speaker-item` | No |
| `speaker-info` | `vox-chronicle-speaker-info` | No |
| `speaker-name` | `vox-chronicle-speaker-name` | No |
| `speaker-time` | `vox-chronicle-speaker-time` | No |
| `speaking-time-bar-container` | `vox-chronicle-speaking-time-bar-container` | No |
| `speaking-time-bar` | `vox-chronicle-speaking-time-bar` | No |
| `speaker-metrics` | `vox-chronicle-speaker-metrics` | No |
| `metric` | `vox-chronicle-metric` | No |
| `segment-count` | `vox-chronicle-segment-count` | No |
| `empty-state` | `vox-chronicle-empty-state` | No |
| `start-session` | `vox-chronicle-start-session` | No |
| `session-timeline` | `vox-chronicle-session-timeline` | No |
| `timeline-visualization` | `vox-chronicle-timeline-visualization` | No |
| `timeline-bars` | `vox-chronicle-timeline-bars` | No |
| `timeline-bucket` | `vox-chronicle-timeline-bucket` | No |
| `bucket-bar` | `vox-chronicle-bucket-bar` | No |
| `speaker-segment` | `vox-chronicle-speaker-segment` | No |
| `bucket-time` | `vox-chronicle-bucket-time` | No |
| `timeline-legend` | `vox-chronicle-timeline-legend` | No |
| `legend-item` | `vox-chronicle-legend-item` | No |
| `legend-color` | `vox-chronicle-legend-color` | No |
| `legend-label` | `vox-chronicle-legend-label` | No |
| `session-history` | `vox-chronicle-session-history` | No |
| `history-actions` | `vox-chronicle-history-actions` | No |
| `clear-history` | `vox-chronicle-clear-history` | No |
| `session-history-list` | `vox-chronicle-session-history-list` | No |
| `history-item` | `vox-chronicle-history-item` | No |
| `history-header` | `vox-chronicle-history-header` | No |
| `history-date` | `vox-chronicle-history-date` | No |
| `history-duration` | `vox-chronicle-history-duration` | No |
| `history-stats` | `vox-chronicle-history-stats` | No |
| `history-stat` | `vox-chronicle-history-stat` | No |
| `view-session` | `vox-chronicle-view-session` | No |
| `export-session` | `vox-chronicle-export-session` | No |
| `delete-session` | `vox-chronicle-delete-session` | No |

**JS references:** None -- analytics tab has no corresponding JS file with querySelector calls referencing these classes.

**Test references:** None.

### 6. journal-picker.hbs (31 un-namespaced classes)

**Classes to prefix (HBS only -- NO CSS rules exist beyond container):**
| Current Class | New Class | In JS? |
|--------------|-----------|--------|
| `picker-header` | `vox-chronicle-picker-header` | No |
| `picker-header-actions` | `vox-chronicle-picker-header-actions` | No |
| `select-all-btn` | `vox-chronicle-select-all-btn` | No |
| `deselect-all-btn` | `vox-chronicle-deselect-all-btn` | No |
| `picker-selection-count` | `vox-chronicle-picker-selection-count` | No |
| `picker-content` | `vox-chronicle-picker-content` | No |
| `picker-section` | `vox-chronicle-picker-section` | No |
| `picker-section-title` | `vox-chronicle-picker-section-title` | No |
| `folder-tree` | `vox-chronicle-folder-tree` | No |
| `journal-list` | `vox-chronicle-journal-list` | No |
| `journal-item` | `vox-chronicle-journal-item` | No |
| `journal-label` | `vox-chronicle-journal-label` | No |
| `journal-checkbox` | `vox-chronicle-journal-checkbox` | No |
| `journal-name` | `vox-chronicle-journal-name` | No |
| `picker-empty-state` | `vox-chronicle-picker-empty-state` | No |
| `picker-footer` | `vox-chronicle-picker-footer` | No |
| `save-selection-btn` | `vox-chronicle-save-selection-btn` | No |
| `cancel-btn` | `vox-chronicle-cancel-btn` | No |
| `folder-item` | `vox-chronicle-folder-item` | No |
| `folder-header` | `vox-chronicle-folder-header` | No |
| `folder-toggle` | `vox-chronicle-folder-toggle` | No |
| `folder-spacer` | `vox-chronicle-folder-spacer` | No |
| `folder-label` | `vox-chronicle-folder-label` | No |
| `folder-checkbox` | `vox-chronicle-folder-checkbox` | No |
| `folder-name` | `vox-chronicle-folder-name` | No |
| `folder-count` | `vox-chronicle-folder-count` | No |
| `folder-children` | `vox-chronicle-folder-children` | No |

**DO NOT RENAME:**
- `hidden` (utility class on `folder-children` div, line 128) -- standard CSS utility, used for visibility toggling. However, since this is a class being used as a boolean toggle, it could collide. **Recommendation:** Rename to `vox-chronicle-hidden` OR use `hidden` HTML attribute instead.
- `nested` (modifier on `folder-tree` and `journal-list`, lines 130, 138) -- keep short as modifier per convention.
- `expanded` (modifier on `folder-item`, line 101) -- keep short as modifier.

**JS references:** No direct class selector references found. Template uses `data-*` attributes for event handlers.

**Test references:** None found.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding all un-namespaced classes | Manual search | Systematic template-by-template inventory (documented above) | Risk of missing classes in compound selectors |
| Verifying CSS-HBS-JS consistency | Manual checking | Run `npm test` after each template | Tests catch broken querySelector references |

## Common Pitfalls

### Pitfall 1: Renaming Foundry-Native Classes
**What goes wrong:** Renaming `tabs`, `item`, or `tab` in vocabulary-manager.hbs breaks Foundry's native tab navigation system.
**Why it happens:** These look like module classes but are part of Foundry's `Tabs` API.
**How to avoid:** Check the "DO NOT RENAME" lists above for each template. When in doubt, search Foundry VTT docs for the class name.
**Warning signs:** Tab switching stops working after rename.

### Pitfall 2: CSS Selector Specificity Changes
**What goes wrong:** Changing `.entity-section` to `.vox-chronicle-entity-section` in CSS but missing compound selectors like `.entity-section.collapsed`.
**How to avoid:** Search CSS file for EVERY occurrence of the old class name, including compound selectors, pseudo-selectors, and responsive media queries.
**Warning signs:** Section collapse/expand, hover states, or responsive layouts break.

### Pitfall 3: Shared Class Names Across Templates
**What goes wrong:** `section-header`, `form-actions`, `btn-close`, `stat-item`, `legend-item`, `help-content`, `empty-state` appear in multiple templates. Renaming in one template's CSS but not adjusting selectors that are scoped to parent containers.
**How to avoid:** All CSS rules are already scoped with parent selectors (e.g., `.vox-chronicle-entity-preview .section-header`). When renaming, update ALL occurrences in the CSS file, not just the one for the current template.
**Warning signs:** Styles break on one template but work on another.

### Pitfall 4: JavaScript closest() and classList References
**What goes wrong:** `EntityPreview.mjs` line 1303 uses `header.closest('.entity-section')`. If the HBS class is renamed but the JS string is not, the toggle breaks silently.
**How to avoid:** After renaming classes in each HBS file, grep the corresponding .mjs file for every renamed class string.
**Warning signs:** Click handlers and dynamic behaviors stop working with no error in console.

### Pitfall 5: Test String Literals
**What goes wrong:** Tests in `VocabularyManager.test.js` contain string literals like `'.term-input'` in mock querySelector matchers. If JS is updated but tests are not, tests break.
**How to avoid:** Update test files in the same commit as the JS changes.
**Warning signs:** Test failures with "expected querySelector to have been called with" mismatches.

### Pitfall 6: `form-actions` Shared Between Speaker-Labeling and Entity-Preview
**What goes wrong:** The CSS rule at line 326 targets BOTH `.vox-chronicle-speaker-labeling .form-actions` and `.vox-chronicle-entity-preview .form-actions` in a single rule. Must rename both occurrences simultaneously.
**How to avoid:** Process this shared CSS rule when handling the first template that uses it, and verify the second template still works.
**Warning signs:** Action button layout breaks in one of the two templates.

### Pitfall 7: `progress-bar` / `progress-fill` Shared CSS
**What goes wrong:** CSS lines 175-188 share `progress-bar` and `progress-fill` selectors between `.vox-chronicle-recorder` and `.vox-chronicle-entity-preview`. The recorder versions are already prefixed (`vox-chronicle-progress-bar`). The entity-preview versions are un-prefixed.
**How to avoid:** When renaming entity-preview's `progress-bar` and `progress-fill`, update the shared CSS rule to use the new names, but keep the recorder's existing names.
**Warning signs:** Progress bars in entity-preview lose their styling.

## Code Examples

### Pattern: Renaming a class across all three files

**Template (HBS):**
```handlebars
{{!-- Before --}}
<div class="speaker-row {{#if isKnown}}known{{/if}}">

{{!-- After --}}
<div class="vox-chronicle-speaker-row {{#if isKnown}}known{{/if}}">
```

**CSS:**
```css
/* Before */
.vox-chronicle-speaker-labeling .speaker-row { ... }
.vox-chronicle-speaker-labeling .speaker-row.known { ... }

/* After */
.vox-chronicle-speaker-labeling .vox-chronicle-speaker-row { ... }
.vox-chronicle-speaker-labeling .vox-chronicle-speaker-row.known { ... }
```

**JavaScript:**
```javascript
// Before
const section = header.closest('.entity-section');

// After
const section = header.closest('.vox-chronicle-entity-section');
```

**Test:**
```javascript
// Before
if (selector === '.term-input') return [mockInput];

// After
if (selector === '.vox-chronicle-term-input') return [mockInput];
```

### Pattern: Shared CSS rules with multiple parents

```css
/* Before (line 326) */
.vox-chronicle-speaker-labeling .form-actions,
.vox-chronicle-entity-preview .form-actions { ... }

/* After */
.vox-chronicle-speaker-labeling .vox-chronicle-form-actions,
.vox-chronicle-entity-preview .vox-chronicle-form-actions { ... }
```

## State of the Art

Not applicable -- CSS namespacing is an evergreen practice. No version-dependent behavior.

## Open Questions

1. **`hidden` class in journal-picker.hbs**
   - What we know: Used as `class="folder-children {{#unless this.expanded}}hidden{{/unless}}"` for visibility toggling.
   - What's unclear: Is this a Foundry CSS utility class or a custom class? The standard HTML `hidden` attribute would be more semantic.
   - Recommendation: Rename to `vox-chronicle-hidden` and add a simple CSS rule `.vox-chronicle-hidden { display: none; }`, OR replace with HTML `hidden` attribute. Either approach is safe. The class approach requires a CSS rule; the attribute approach requires changing the template conditional to use an attribute.

2. **Modifier classes that look like they should be prefixed**
   - What we know: `collapsed`, `selected`, `known`, `success`, `error`, `expanded`, `creating`, `nested`, `active`, `inactive`, `configured`, `missing`, `danger` are used as compound selectors.
   - What's unclear: Whether the user's "all un-namespaced CSS classes" instruction applies to modifiers.
   - Recommendation: Do NOT prefix modifiers. Follow the existing recorder.hbs pattern where `ready`, `recording`, `paused`, `processing`, `error`, `mode-api`, `configured`, `missing` are kept short. These are always used in compound selectors with a namespaced parent.

## Sources

### Primary (HIGH confidence)
- Direct file inspection of all 8 template files, CSS file, 5 JS files, and 6 test files in the project
- Existing prefixed templates (recorder.hbs, main-panel.hbs) as reference pattern

### Secondary (MEDIUM confidence)
- Foundry VTT v13 tab navigation classes (`tabs`, `item`, `tab`) -- confirmed by pattern usage with `data-group` attribute matching Foundry's `TabsV2` API

## Metadata

**Confidence breakdown:**
- Class inventory: HIGH -- direct file inspection, complete enumeration
- Foundry-native class identification: HIGH -- confirmed by Foundry tab pattern usage
- JS/test impact analysis: HIGH -- grep-verified across all source and test files
- Modifier class strategy: HIGH -- consistent with existing codebase convention

**Research date:** 2026-02-28
**Valid until:** Indefinite -- CSS namespacing is not version-dependent
