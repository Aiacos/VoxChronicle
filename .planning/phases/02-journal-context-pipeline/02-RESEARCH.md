# Phase 2: Journal Context Pipeline - Research

**Researched:** 2026-03-06
**Domain:** Foundry VTT Journal API, RAG indexing, AI context injection, ApplicationV2 UI
**Confidence:** HIGH

## Summary

Phase 2 wires the journal-to-AI context path: DM selects a journal, the system tracks chapter position, and the AI receives chapter-scoped context on every cycle. The existing codebase already has mature `ChapterTracker`, `JournalParser`, and `PromptBuilder` classes that handle most of the heavy lifting. The primary work is: (1) creating a `JournalPicker` ApplicationV2 dialog backed by the existing `journal-picker.hbs` template, (2) adding primary/supplementary journal designation, (3) replacing the auto-detect logic in `SessionOrchestrator._initializeJournalContext()` with user-selected journal IDs, (4) switching from `content.substring(0, 3000)` to `getCurrentChapterContentForAI(8000)` in the AI cycle, and (5) adding debounced re-indexing via Foundry journal hooks.

The existing `JournalParser.getChunksForEmbedding()` defaults to 500/100 char chunks and needs to be called with `{ chunkSize: 4800, overlap: 1200 }` per CTX-04 requirements (~1200/300 tokens at ~4 chars/token). The `OpenAIFileSearchProvider.indexDocuments()` accepts `RAGDocument[]` with progress callbacks, making the indexing pipeline straightforward. Content hash comparison for staleness detection is a new capability to implement.

**Primary recommendation:** Build on existing `ChapterTracker`, `JournalParser`, and `PromptBuilder` classes. The template exists; the main gap is the ApplicationV2 backing class for the journal picker, settings for journal selection persistence, and the orchestrator refactoring to accept user-selected journals.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Persistent setting stores last-used journal selection (primary + supplementary IDs)
- At session start, compact inline confirmation shows current selection in MainPanel: "Adventure: [Name] (+ N supplementary)" with [Change] and [Start] buttons
- [Change] opens the full journal picker dialog (existing template, needs ApplicationV2 backing class)
- One primary journal drives chapter tracking; supplementary journals are RAG-indexed only
- Journal picker supports multi-select with a "primary" designation (radio for primary, checkboxes for supplementary)
- No-journal fallback: auto-select scene-linked journal, else block and open picker
- Current chapter text injected directly into AI system prompt via `ChapterTracker.getCurrentChapterContentForAI(maxLength=8000)`
- RAG queries retrieve up to 5 additional cross-chapter results as supplementary context
- Supplementary journals contribute ONLY through RAG (not direct prompt injection)
- Journals with no heading structure: treat each journal page as a "chapter"
- Chapter navigation bar in panel: current chapter name with prev/next arrows (using `getSiblingChapters()`)
- Scene-chapter sync via `ChapterTracker.updateFromScene()` with notification
- Manual chapter navigation updates context on next natural AI cycle (not immediately)
- RAG indexing: all journals pre-chunked at 4800 chars / 1200 chars overlap (~1200/300 tokens)
- Each chunk uploaded as separate RAG document with page/chapter metadata
- Indexing at session start if stale (content hash comparison); shows progress bar
- Live re-indexing: journal edit hooks with 5-second debounce, only changed journal
- Content warnings: yellow banner for <500 chars or >200,000 chars (non-blocking)
- Index health indicator: green/yellow/gray dot near chapter nav bar

### Claude's Discretion
- Exact implementation of content hash comparison for staleness detection
- RAG document ID naming scheme for chunked content
- PromptBuilder integration details for chapter context injection
- Progress bar implementation for indexing
- Notification display timing and dismissal
- How `_initializeJournalContext()` is refactored to accept user-selected journal IDs

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTX-01 | DM can select which Foundry journal is the active adventure before starting live mode | JournalPicker ApplicationV2 dialog + persistent settings + inline confirmation in MainPanel |
| CTX-02 | System tracks current chapter/scene position within the selected adventure journal | ChapterTracker already implements this; needs wiring to user-selected journal + scene-change hooks |
| CTX-03 | AI prompts receive chapter-scoped context (current chapter text), not the entire journal dump | Replace `content.substring(0, 3000)` with `getCurrentChapterContentForAI(8000)` in `_runAIAnalysis()` |
| CTX-04 | RAG indexing uses 1200/300 token chunking for adventure content | Call `JournalParser.getChunksForEmbedding()` with `{ chunkSize: 4800, overlap: 1200 }` |
| CTX-05 | RAG index updates automatically when journal pages are edited (hook-driven, debounced) | Extend existing `invalidateJournalCache()` hook handler with debounced re-index trigger |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Foundry VTT v13 ApplicationV2 | v13 | JournalPicker dialog class | Project standard for all UI components |
| HandlebarsApplicationMixin | v13 | Template rendering for picker | All existing UI uses this pattern |
| JournalParser | existing | Journal content extraction + chunking | Already has `getChunksForEmbedding()`, chapter structure parsing |
| ChapterTracker | existing | Chapter position tracking | Already has `updateFromScene()`, `getSiblingChapters()`, `getCurrentChapterContentForAI()` |
| OpenAIFileSearchProvider | existing | RAG document indexing + querying | Already has `indexDocuments()` with progress callback |
| PromptBuilder | existing | AI prompt construction with chapter context | Already has `setChapterContext()` and `setAdventureContext()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortController | native | Listener cleanup in ApplicationV2 | Every `_onRender()` call to prevent memory leaks |
| Foundry Hooks API | v13 | Journal change detection | `updateJournalEntry`, `createJournalEntry`, `deleteJournalEntry` hooks (already registered) |

### Alternatives Considered
None -- all decisions locked in CONTEXT.md. The existing codebase provides all needed infrastructure.

## Architecture Patterns

### Recommended Changes to Existing Structure
```
scripts/
├── core/
│   └── Settings.mjs              # ADD: activeAdventureJournalId, supplementaryJournalIds settings
├── ui/
│   ├── MainPanel.mjs             # MODIFY: add inline confirmation banner + chapter nav bar
│   └── JournalPicker.mjs         # NEW: ApplicationV2 backing class for journal-picker.hbs
├── narrator/
│   ├── ChapterTracker.mjs        # MINOR: already supports setSelectedJournal(), getSiblingChapters()
│   └── JournalParser.mjs         # MINOR: already has getChunksForEmbedding() with configurable sizes
├── orchestration/
│   └── SessionOrchestrator.mjs   # MODIFY: _initializeJournalContext() accepts user-selected IDs
├── main.mjs                      # MODIFY: extend invalidateJournalCache with debounced re-index
└── templates/
    ├── journal-picker.hbs        # MODIFY: add radio for primary designation
    └── main-panel.hbs            # MODIFY: add confirmation banner + chapter nav + index indicator
```

### Pattern 1: JournalPicker ApplicationV2 Dialog
**What:** ApplicationV2 + HandlebarsApplicationMixin backing the existing `journal-picker.hbs` template
**When to use:** When DM clicks [Change] on the inline confirmation banner
**Example:**
```javascript
// Follows established UI component pattern from MainPanel, EntityPreview, etc.
class JournalPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-journal-picker',
    classes: ['vox-chronicle', 'journal-picker'],
    window: { title: 'VOXCHRONICLE.JournalPicker.Title', resizable: true },
    position: { width: 500, height: 600 },
    actions: {
      'select-all': JournalPicker._onSelectAll,
      'deselect-all': JournalPicker._onDeselectAll,
      'toggle-folder': JournalPicker._onToggleFolder,
      'save-selection': JournalPicker._onSaveSelection,
      'cancel': JournalPicker._onCancel
    }
  };

  static PARTS = {
    main: { template: 'modules/vox-chronicle/templates/journal-picker.hbs' }
  };

  // Primary designation: radio button next to each journal checkbox
  // When a journal is checked AND marked as primary, its radio is selected
}
```

### Pattern 2: Content Hash for Staleness Detection
**What:** MD5/SHA-256 hash of journal content stored alongside RAG index metadata
**When to use:** At session start to decide whether re-indexing is needed
**Example:**
```javascript
// Simple hash using Web Crypto API (available in browsers)
async function computeContentHash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Store in ragIndexMetadata alongside vectorStoreId and fileMap
// Compare on session start: if hash matches, skip indexing
```

### Pattern 3: Debounced Re-Index on Journal Edit
**What:** 5-second debounce on journal hooks, re-indexes only changed journal
**When to use:** When DM edits a journal page during live mode
**Example:**
```javascript
// In main.mjs, extend invalidateJournalCache:
let reindexTimer = null;
function invalidateJournalCache(journalEntry) {
  const vc = VoxChronicle.getInstance();
  if (vc.journalParser) {
    vc.journalParser.clearAllCache?.();
  }

  // Debounced re-index (only during live mode)
  if (vc.orchestrator?.isLiveMode) {
    clearTimeout(reindexTimer);
    reindexTimer = setTimeout(() => {
      vc.orchestrator.reindexJournal?.(journalEntry.id);
    }, 5000);
  }
}
```

### Pattern 4: Inline Confirmation Banner in MainPanel
**What:** Compact banner in the recorder tab showing current journal selection before starting live mode
**When to use:** Before every live mode start
**Example:**
```html
<!-- In main-panel.hbs, recorder tab, before the record button -->
<div class="vox-chronicle-journal-confirmation">
  <span class="vox-chronicle-journal-confirmation__label">
    Adventure: <strong>{{adventureName}}</strong>
    {{#if supplementaryCount}}(+ {{supplementaryCount}} supplementary){{/if}}
  </span>
  <div class="vox-chronicle-journal-confirmation__actions">
    <button data-action="change-journal" class="vox-chronicle-btn--small">Change</button>
    <button data-action="start-live" class="vox-chronicle-btn--primary">Start</button>
  </div>
</div>
```

### Pattern 5: Chapter Navigation Bar
**What:** Shows current chapter name with prev/next arrows, uses `getSiblingChapters()`
**When to use:** Visible during live mode in the MainPanel
**Example:**
```html
<div class="vox-chronicle-chapter-nav">
  <button data-action="prev-chapter" {{#unless prevChapter}}disabled{{/unless}}>
    <i class="fa-solid fa-chevron-left"></i>
  </button>
  <span class="vox-chronicle-chapter-nav__title">{{currentChapter.title}}</span>
  <span class="vox-chronicle-index-health vox-chronicle-index-health--{{indexStatus}}"></span>
  <button data-action="next-chapter" {{#unless nextChapter}}disabled{{/unless}}>
    <i class="fa-solid fa-chevron-right"></i>
  </button>
</div>
```

### Anti-Patterns to Avoid
- **Dumping entire journal into AI prompt:** This is the exact problem CTX-03 solves. Use `getCurrentChapterContentForAI(8000)` for current chapter only; supplementary content comes via RAG.
- **Immediate context refresh on manual chapter navigation:** Per user decision, manual nav updates context on the next natural AI cycle to avoid wasted API calls.
- **Re-indexing all journals on any edit:** Only re-index the changed journal. The hook receives the specific `journalEntry` object.
- **Blocking UI during indexing:** Indexing must be non-blocking with progress indicator. Use async with progress callback.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content hashing | Custom hash function | `crypto.subtle.digest('SHA-256', ...)` | Web Crypto API is native, fast, and cryptographically sound |
| Text chunking | Custom chunking logic | `JournalParser.getChunksForEmbedding(id, {chunkSize: 4800, overlap: 1200})` | Already handles page boundaries, metadata, empty chunk filtering |
| Chapter detection from scenes | New scene matching logic | `ChapterTracker.updateFromScene(scene)` | Already has 3 detection methods (page ID, fuzzy name, keywords) |
| Sibling chapter navigation | Flat list iteration | `ChapterTracker.getSiblingChapters()` | Already handles level-aware sibling search |
| RAG document upload | Custom file upload | `OpenAIFileSearchProvider.indexDocuments(docs, {onProgress})` | Already handles upload, polling, file mapping, error recovery |
| Prompt chapter injection | String concatenation | `PromptBuilder.setChapterContext()` + `formatChapterContext()` | Already formats chapter name, subsections, page references, summary |

**Key insight:** Nearly all the low-level infrastructure already exists. The phase is primarily an integration/wiring task, not a green-field implementation.

## Common Pitfalls

### Pitfall 1: Chunking Units Mismatch (chars vs tokens)
**What goes wrong:** CTX-04 specifies "1200/300 token" chunking, but `JournalParser.getChunksForEmbedding()` operates in character units.
**Why it happens:** Tokens and characters are different units (~4 chars/token for English).
**How to avoid:** Pass `{ chunkSize: 4800, overlap: 1200 }` (in chars) to get approximately 1200/300 tokens. The CONTEXT.md already specifies "4800 chars / 1200 chars overlap (~1200/300 tokens)" so this is locked.
**Warning signs:** Chunks that are too small or too large in the RAG vector store.

### Pitfall 2: OpenAI File Search Has Its Own Chunking
**What goes wrong:** OpenAI File Search auto-chunks uploaded files at 800-token windows with 256-token overlap. Pre-chunking the content AND then having OpenAI chunk it again creates double-chunking.
**Why it happens:** The CONTEXT.md decision says "each chunk uploaded as a separate RAG document" -- this means each pre-chunked piece is a small document uploaded individually, so OpenAI's auto-chunking won't further split it (since each chunk is already small enough).
**How to avoid:** Upload each chunk from `getChunksForEmbedding()` as a separate `RAGDocument`. Since each chunk is ~4800 chars (~1200 tokens), OpenAI will auto-chunk it into 1-2 pieces at most, which is acceptable. Include page/chapter metadata in the document title/content for retrieval context.
**Warning signs:** RAG results that seem disconnected or lose page-level context.

### Pitfall 3: Race Condition on Debounced Re-Index
**What goes wrong:** Multiple rapid journal edits trigger overlapping re-index operations.
**Why it happens:** 5-second debounce means the previous re-index may still be running when a new one fires.
**How to avoid:** Track an in-progress flag; if re-index is already running, queue one more (not accumulate). Use the index health indicator (yellow dot) to show progress.
**Warning signs:** Multiple concurrent API upload operations; "already indexed" skip messages in logs.

### Pitfall 4: _onRender Memory Leak in MainPanel
**What goes wrong:** Adding chapter nav listeners and confirmation banner listeners without cleanup.
**Why it happens:** `_onRender()` is called on every render cycle; listeners accumulate.
**How to avoid:** Follow existing AbortController pattern. The MainPanel already uses `this.#listenerController?.abort()` at the top of `_onRender()`. New listeners must use the same `{ signal }` option.
**Warning signs:** Duplicate event handler invocations; memory growth during long sessions.

### Pitfall 5: Foundry Journal Hooks Fire for ALL Journals
**What goes wrong:** Re-indexing triggers for journals that aren't part of the session.
**Why it happens:** `updateJournalEntry` fires for every journal edit in the world.
**How to avoid:** Check if the edited journal's ID matches one of the selected journals (primary or supplementary) before triggering re-index. The hook handler receives the full `JournalEntry` document.
**Warning signs:** Unnecessary API calls and indexing operations for unrelated journal edits.

### Pitfall 6: Empty Journal Pages
**What goes wrong:** Journal pages with no text content cause empty chunks or errors.
**Why it happens:** Foundry journal pages can be images, PDFs, or blank text pages.
**How to avoid:** `JournalParser.getChunksForEmbedding()` already filters empty pages (`page.text.trim().length === 0`). The content warning check (<500 chars) also catches near-empty journals.
**Warning signs:** Zero chunks from a journal that appears to have content.

## Code Examples

### Existing: ChapterTracker.getCurrentChapterContentForAI()
```javascript
// Source: scripts/narrator/ChapterTracker.mjs line 381
// Already returns formatted text: CURRENT CHAPTER, PATH, CONTENT, AVAILABLE SUBSECTIONS
// Default maxLength=5000, CTX-03 requires calling with maxLength=8000
const chapterContext = chapterTracker.getCurrentChapterContentForAI(8000);
```

### Existing: JournalParser.getChunksForEmbedding()
```javascript
// Source: scripts/narrator/JournalParser.mjs line 690
// Default: chunkSize=500, overlap=100 (chars)
// CTX-04 requires: chunkSize=4800, overlap=1200 (chars) => ~1200/300 tokens
const chunks = await journalParser.getChunksForEmbedding(journalId, {
  chunkSize: 4800,
  overlap: 1200
});
// Returns TextChunk[] with metadata: {text, metadata: {source, journalId, journalName, pageId, pageName, ...}}
```

### Existing: OpenAIFileSearchProvider.indexDocuments()
```javascript
// Source: scripts/rag/OpenAIFileSearchProvider.mjs line 219
// Accepts RAGDocument[] = {id, title, content, metadata}
// Has onProgress callback
const result = await ragProvider.indexDocuments(documents, {
  onProgress: (current, total, message) => {
    updateProgressBar(current / total);
  }
});
// Returns: {indexed: number, failed: number}
```

### Existing: SessionOrchestrator._runAIAnalysis() Chapter Context
```javascript
// Source: scripts/orchestration/SessionOrchestrator.mjs line 1209-1223
// CURRENT: Uses content.substring(0, 3000) -- MUST be replaced
// REPLACEMENT: Use getCurrentChapterContentForAI(8000) for CTX-03
const chapterContent = this._chapterTracker?.getCurrentChapterContentForAI?.(8000) || '';
this._aiAssistant.setChapterContext({
  chapterName: currentChapter.title || '',
  subsections: this._chapterTracker.getSubchapters().map(s => s.title),
  pageReferences: [...],
  summary: chapterContent  // Was: content.substring(0, 3000)
});
```

### New: RAG Document from JournalParser Chunk
```javascript
// Converting JournalParser chunks to RAGDocuments for indexing
const chunks = await journalParser.getChunksForEmbedding(journalId, { chunkSize: 4800, overlap: 1200 });
const ragDocuments = chunks.map((chunk, i) => ({
  id: `${journalId}-${chunk.metadata.pageId}-chunk${chunk.metadata.chunkIndex}`,
  title: `${chunk.metadata.journalName} > ${chunk.metadata.pageName} [${chunk.metadata.chunkIndex + 1}/${chunk.metadata.totalChunks}]`,
  content: chunk.text,
  metadata: {
    ...chunk.metadata,
    type: 'adventure-journal'
  }
}));
await ragProvider.indexDocuments(ragDocuments, { onProgress });
```

### New: Content Hash for Staleness
```javascript
// Web Crypto API for content hashing (available in all modern browsers)
async function computeJournalHash(journalParser, journalId) {
  const fullText = journalParser.getFullText(journalId);
  if (!fullText) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(fullText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Compare with stored hash in ragIndexMetadata
const storedHash = metadata.contentHashes?.[journalId];
const currentHash = await computeJournalHash(journalParser, journalId);
const isStale = storedHash !== currentHash;
```

### New: Settings Registration
```javascript
// World-scoped: last-selected primary journal
game.settings.register(MODULE_ID, 'activeAdventureJournalId', {
  scope: 'world',
  config: false,  // Managed via JournalPicker UI
  type: String,
  default: ''
});

// World-scoped: supplementary journal IDs (JSON array string)
game.settings.register(MODULE_ID, 'supplementaryJournalIds', {
  scope: 'world',
  config: false,
  type: Array,
  default: []
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auto-detect journal from scene | User selects primary + supplementary journals | This phase | DM has explicit control over AI context source |
| `content.substring(0, 3000)` in AI cycle | `getCurrentChapterContentForAI(8000)` | This phase | Chapter-scoped context instead of truncated full text |
| Default 500/100 char chunking | 4800/1200 char chunking (~1200/300 tokens) | This phase | Better semantic coherence per chunk |
| No staleness detection | Content hash comparison at session start | This phase | Avoids redundant re-indexing |
| Cache clear only on journal edit | Cache clear + debounced re-index | This phase | RAG stays current during live sessions |

## Open Questions

1. **RAG Document ID Scheme**
   - What we know: Each chunk needs a unique ID for the `RAGDocument.id` field. The `OpenAIFileSearchProvider` uses this ID to track which documents are already indexed (`this.#fileIds.has(doc.id)`).
   - What's unclear: When a journal is re-indexed (content changed), old chunk IDs must be removed and new ones added. The number of chunks may change.
   - Recommendation: Use a scheme like `{journalId}-{pageId}-chunk{N}` and on re-index, remove all documents matching the journal prefix before re-adding. The `removeDocument(documentId)` API exists for this.

2. **PromptBuilder Chapter Context Integration**
   - What we know: `PromptBuilder.setChapterContext()` currently accepts `{chapterName, subsections, pageReferences, summary}`. The `summary` field currently receives `content.substring(0, 3000)`.
   - What's unclear: Should we pass the full `getCurrentChapterContentForAI(8000)` output as the `summary` field, or should we restructure the context format?
   - Recommendation: Pass the `getCurrentChapterContentForAI(8000)` output as the `summary` field. The method already formats content with header, path, sections -- it maps directly to what the prompt builder needs.

3. **Progress Bar Implementation**
   - What we know: `OpenAIFileSearchProvider.indexDocuments()` has an `onProgress(current, total, message)` callback.
   - What's unclear: Where in the MainPanel UI does the progress bar render?
   - Recommendation: Use the index health indicator area. During indexing, replace the dot with a compact progress bar or percentage text. After completion, revert to green dot.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest with jsdom |
| Config file | `vitest.config.js` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTX-01 | JournalPicker dialog opens, saves selection, persists to settings | unit | `npx vitest run tests/ui/JournalPicker.test.js -x` | No -- Wave 0 |
| CTX-01 | Inline confirmation banner shows in MainPanel with correct journal name | unit | `npx vitest run tests/ui/MainPanel.test.js -x` | Yes (needs new tests) |
| CTX-02 | ChapterTracker updates chapter on scene change | unit | `npx vitest run tests/narrator/ChapterTracker.test.js -x` | Yes (existing) |
| CTX-02 | Chapter nav bar prev/next uses getSiblingChapters() | unit | `npx vitest run tests/narrator/ChapterTracker.test.js -x` | Yes (existing) |
| CTX-03 | _runAIAnalysis uses getCurrentChapterContentForAI(8000) not substring(0,3000) | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -x` | Yes (needs new tests) |
| CTX-04 | RAG indexing uses 4800/1200 chunking params | unit | `npx vitest run tests/narrator/JournalParser.test.js -x` | Yes (needs new tests) |
| CTX-04 | Chunks converted to RAGDocuments with metadata | unit | `npx vitest run tests/orchestration/SessionOrchestrator.test.js -x` | Yes (needs new tests) |
| CTX-05 | Journal edit hook triggers debounced re-index for selected journals only | unit | `npx vitest run tests/main.test.js -x` | Yes (needs new tests) |
| CTX-05 | Non-selected journal edits do NOT trigger re-index | unit | `npx vitest run tests/main.test.js -x` | Yes (needs new tests) |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/ui/JournalPicker.test.js` -- covers CTX-01 (journal selection dialog)
- [ ] New test cases in `tests/ui/MainPanel.test.js` -- covers CTX-01 (inline confirmation banner)
- [ ] New test cases in `tests/orchestration/SessionOrchestrator.test.js` -- covers CTX-03, CTX-04 (chapter context + chunking params)
- [ ] New test cases in `tests/main.test.js` -- covers CTX-05 (debounced re-index hook)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `scripts/narrator/ChapterTracker.mjs` -- full API reviewed
- Codebase analysis: `scripts/narrator/JournalParser.mjs` -- `getChunksForEmbedding()` defaults confirmed (500/100 chars)
- Codebase analysis: `scripts/rag/OpenAIFileSearchProvider.mjs` -- `indexDocuments()` API confirmed with progress callback
- Codebase analysis: `scripts/narrator/PromptBuilder.mjs` -- `setChapterContext()` and `formatChapterContext()` confirmed
- Codebase analysis: `scripts/orchestration/SessionOrchestrator.mjs` -- `_initializeJournalContext()` at line 861, `_runAIAnalysis()` at line 1183 confirmed
- Codebase analysis: `scripts/main.mjs` -- `invalidateJournalCache()` at line 190, hooks at lines 197-199 confirmed
- Codebase analysis: `templates/journal-picker.hbs` -- full template with multi-select, folder tree, actions confirmed
- Codebase analysis: `scripts/rag/RAGProvider.mjs` -- `RAGDocument` typedef confirmed: `{id, title, content, metadata}`

### Secondary (MEDIUM confidence)
- OpenAI File Search auto-chunking: 800-token / 256-token overlap (from provider source comment line 6)
- Web Crypto API `crypto.subtle.digest()` availability in jsdom test environment (may need polyfill)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components exist in codebase, APIs verified by direct code reading
- Architecture: HIGH - patterns follow established project conventions (ApplicationV2, AbortController, singleton)
- Pitfalls: HIGH - identified from direct code analysis of existing hook handlers, chunking units, and OpenAI auto-chunking behavior

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- all infrastructure is internal to the project)
