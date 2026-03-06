# Phase 2: Journal Context Pipeline - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the journal-to-AI context path so the DM selects an adventure journal before starting live mode, the system tracks chapter position within that journal, and the AI receives chapter-scoped context (not a full journal dump) on every suggestion cycle. Includes RAG indexing with proper chunking and automatic re-indexing when journal content changes.

Requirements: CTX-01, CTX-02, CTX-03, CTX-04, CTX-05

</domain>

<decisions>
## Implementation Decisions

### Journal Selection Flow
- Persistent setting stores last-used journal selection (primary + supplementary IDs)
- At session start, compact inline confirmation shows current selection in MainPanel: "Adventure: [Name] (+ N supplementary)" with [Change] and [Start] buttons
- [Change] opens the full journal picker dialog (existing template, needs ApplicationV2 backing class)
- One primary journal drives chapter tracking; supplementary journals are RAG-indexed only
- Journal picker supports multi-select with a "primary" designation (radio for primary, checkboxes for supplementary)

### No-Journal Fallback
- If no journal is manually selected, auto-select the current scene's linked journal as primary
- If no scene journal either, block live mode start and open the journal picker
- This preserves backward compatibility with existing auto-detection behavior

### Chapter Context Strategy
- Current chapter text injected directly into the AI system prompt via `ChapterTracker.getCurrentChapterContentForAI(maxLength=8000)`
- RAG queries retrieve up to 5 additional cross-chapter results as supplementary context
- Supplementary journals contribute ONLY through RAG (not direct prompt injection)
- Journals with no heading structure: treat each journal page as a "chapter"
- Chapter navigation bar in panel: current chapter name with prev/next arrows (using `getSiblingChapters()`)

### Scene-Chapter Sync
- When DM changes Foundry scenes, `ChapterTracker.updateFromScene()` auto-detects new chapter
- Panel shows brief notification: "Chapter updated: [Name]"
- DM can override with manual chapter selection (prev/next arrows)
- Manual chapter navigation updates context on the next natural AI cycle (not immediately) to avoid wasted API calls

### RAG Indexing
- All selected journals (primary + supplementary) pre-chunked using `JournalParser.getChunksForEmbedding()` at 4800 chars / 1200 chars overlap (~1200/300 tokens)
- Each chunk uploaded as a separate RAG document with page/chapter metadata
- All journals indexed identically (no distinction between primary and supplementary in RAG)
- Indexing happens at session start if stale (content hash comparison)
- Shows progress bar during indexing

### Live Re-Indexing (CTX-05)
- Journal edit hooks (`updateJournalEntry`, `createJournalEntry`, `deleteJournalEntry`) trigger debounced re-index with 5-second delay
- Only the changed journal is re-indexed, not all journals
- Live session continues during re-index (non-blocking)
- Existing cache-clear behavior preserved alongside new re-index trigger

### Content Warnings
- Warn (yellow banner, non-blocking) when total journal content is under 500 chars: "Journal has very little content. AI suggestions may be generic."
- Warn (yellow banner, non-blocking) when total journal content exceeds 200,000 chars: "Journal is very large. Indexing may take longer."
- Size checks only — no deeper content quality analysis
- DM can always proceed despite warnings

### Index Health Indicator
- Subtle status badge near chapter nav bar: green dot = indexed and fresh, yellow dot = indexing in progress, gray dot = no index
- Non-intrusive but transparent

### Claude's Discretion
- Exact implementation of content hash comparison for staleness detection
- RAG document ID naming scheme for chunked content
- PromptBuilder integration details for chapter context injection
- Progress bar implementation for indexing
- Notification display timing and dismissal
- How `_initializeJournalContext()` is refactored to accept user-selected journal IDs

</decisions>

<specifics>
## Specific Ideas

- Compact inline confirmation at session start: banner showing adventure name + supplementary count, [Change] to open full picker, [Start] to begin
- Chapter nav bar with prev/next arrows styled similarly to existing panel components
- The existing `journal-picker.hbs` template already has folder tree, multi-select, and count display — needs ApplicationV2 class + primary designation UI
- `getCurrentChapterContentForAI(8000)` is the correct method for chapter context — the existing `content.substring(0, 3000)` in the orchestrator must be replaced

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `templates/journal-picker.hbs`: Complete multi-select picker template with folder tree, needs backing ApplicationV2 class
- `ChapterTracker.getCurrentChapterContentForAI(maxLength)`: Returns formatted AI-ready text with header, path, content, subsections — the right method for CTX-03
- `ChapterTracker.getSiblingChapters()`: Returns prev/next chapters for navigation arrows
- `ChapterTracker.updateFromScene(scene)`: Auto-detects chapter from Foundry scene via three methods (page ID, fuzzy name match, keyword match)
- `JournalParser.getChunksForEmbedding(journalId, { chunkSize, overlap })`: Existing chunking method, currently defaults to 500/100 chars — needs 4800/1200 params
- `AIAssistant.setChapterContext()` and `setAdventureContext()`: Existing context injection points in the AI pipeline
- `OpenAIFileSearchProvider.indexDocuments(documents)`: Accepts `RAGDocument[]` — pre-chunked content can be passed as individual documents

### Established Patterns
- ApplicationV2 + HandlebarsApplicationMixin with AbortController for listener cleanup (all existing UI components follow this)
- Singleton pattern for UI panels (MainPanel.getInstance())
- `game.settings.register()` for persistent storage with world/client scope
- Foundry hooks for journal change detection (already registered in main.mjs lines 197-199)
- Debounced operations pattern used in MainPanel (`_debouncedRender`)

### Integration Points
- `MainPanel._handleToggleRecording()` (line 454): Entry point where journal confirmation appears before `startLiveMode()`
- `SessionOrchestrator._initializeJournalContext()` (line 861): Must accept user-selected journal IDs instead of auto-detecting
- `SessionOrchestrator._runAIAnalysis()` (line 1183): Per-cycle chapter context refresh — must use `getCurrentChapterContentForAI(8000)` instead of `content.substring(0, 3000)`
- `main.mjs invalidateJournalCache` (line 190): Hook handler where debounced re-index logic is added
- `Settings.registerSettings()`: New settings for `activeAdventureJournalId`, `supplementaryJournalIds`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-journal-context-pipeline*
*Context gathered: 2026-03-06*
