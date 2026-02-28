# Phase 1: CSS Namespace - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Bulk-rename all 214 un-namespaced CSS classes across 6 Handlebars templates and 1 stylesheet to carry the `vox-chronicle-` prefix. Update any JavaScript that queries elements by these class names. No functional changes — purely a namespace refactoring to prevent collision with other Foundry modules.

</domain>

<decisions>
## Implementation Decisions

### Naming convention
- Use flat `vox-chronicle-` prefix (matching existing main-panel.hbs pattern)
- Example: `.speaker-row` → `.vox-chronicle-speaker-row`
- Do NOT introduce BEM nesting — keep consistent with existing codebase convention
- Preserve the original class name after the prefix for searchability

### Rename strategy
- Automated bulk rename per template file — find all un-prefixed classes in each .hbs file and its corresponding CSS
- Be careful with classes that may be Foundry core classes (e.g., `dialog`, `window-content`) — do NOT rename those
- Be careful with vis-network library classes in relationship-graph.hbs — do NOT rename third-party classes
- Update any JavaScript `querySelector`, `classList`, or `className` references in corresponding .mjs files
- Process templates in order: speaker-labeling, entity-preview, relationship-graph, vocabulary-manager, analytics-tab, journal-picker

### Testing approach
- Run existing test suite to catch any JS-level class name references that break
- Verify each template renders correctly after rename (visual check in Foundry not required — trust CSS/template consistency)
- Search codebase for any hardcoded class name strings that need updating

### Claude's Discretion
- Exact ordering of template processing
- Whether to batch all changes in one commit or one per template
- How to identify Foundry-core vs module-owned classes

</decisions>

<specifics>
## Specific Ideas

No specific requirements — straightforward mechanical refactoring. Follow the existing `vox-chronicle-` prefix pattern already used in `main-panel.hbs`.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `main-panel.hbs` already uses `vox-chronicle-` prefix correctly — use as reference pattern
- `styles/vox-chronicle.css` is the single stylesheet — all CSS changes are in one file

### Established Patterns
- Flat prefix: `vox-chronicle-recorder`, `vox-chronicle-panel`, `vox-chronicle-tab`
- No BEM nesting used in existing prefixed classes

### Integration Points
- 6 templates: `speaker-labeling.hbs`, `entity-preview.hbs`, `relationship-graph.hbs`, `vocabulary-manager.hbs`, `analytics-tab.hbs`, `journal-picker.hbs`
- 1 stylesheet: `styles/vox-chronicle.css`
- JS files that may reference classes: `SpeakerLabeling.mjs`, `EntityPreview.mjs`, `RelationshipGraph.mjs`, `VocabularyManager.mjs`, `MainPanel.mjs`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-css-namespace*
*Context gathered: 2026-02-28*
