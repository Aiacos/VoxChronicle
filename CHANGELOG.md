# Changelog

All notable changes to VoxChronicle will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-02-19

### Changed
- **RAG: Modular provider architecture** — Custom RAG stack (EmbeddingService + RAGVectorStore + RAGRetriever) replaced with modular `RAGProvider` interface. Default implementation uses OpenAI Responses API + File Search for managed vector storage, auto-chunking, and built-in reranking.
- **UI: Memory leak fixes in all 5 components** — All ApplicationV2 components now use AbortController pattern to clean up event listeners between renders, preventing accumulation in `_onRender()`.
- **UI: CSS-only tab switching in MainPanel** — Tab switching no longer triggers full `render()` call; uses `hidden` attribute toggling instead.
- **Simplified workflow** — Default image generation reduced to 2-3 session scene images (no entity portraits). Focus on RAG-powered DM assistance + session summary + Kanka journal publishing.
- **RelationshipGraph: CDN script loading fixed** — vis-network script loaded once on first render with `if (!window.vis)` guard, not on every render.
- **Complete test rewrite** — All 3600+ legacy tests deleted and rewritten from scratch. 46 test files with 3742 tests achieving 95%+ statement/line coverage, 89%+ branch coverage, 97%+ function coverage.

### Added
- `scripts/rag/RAGProvider.mjs` — Abstract base class for RAG providers
- `scripts/rag/OpenAIFileSearchProvider.mjs` — OpenAI File Search implementation
- `scripts/rag/RAGProviderFactory.mjs` — Factory for creating RAG providers
- `scripts/rag/RAGFlowProvider.mjs` — Self-hosted RAGFlow provider for local RAG instances
- **RAGFlow support** — Full integration with self-hosted RAGFlow API including dataset management, document upload/parsing, and OpenAI-compatible chat completions
- New RAG settings: `ragProvider` (openai-file-search/ragflow), `ragVectorStoreId`, `ragMaxResults`, `ragAutoIndex`
- New RAGFlow settings: `ragflowBaseUrl`, `ragflowApiKey`, `ragflowModelName`, `ragflowDatasetId`, `ragflowChatId`
- RAGFlow i18n strings in all 8 language files
- Memory leak regression tests for all UI components
- Vitest v8 coverage with enforced thresholds (90/85/90/90)

### Removed
- `scripts/ai/EmbeddingService.mjs` — Replaced by File Search managed embeddings
- `scripts/ai/RAGVectorStore.mjs` — Replaced by File Search hosted vector store
- `scripts/narrator/RAGRetriever.mjs` — Replaced by RAGProvider interface
- Old RAG settings: `embeddingDimensions`, `ragChunkSize`, `ragChunkOverlap`, `ragSimilarityThreshold`, `ragMaxStorageMB`
- ~7,080 lines of dead code (unused CSS, files, and exports)

### Fixed
- **Memory leak in MainPanel** — Tab click listeners accumulated on every render
- **Memory leak in EntityPreview** — Checkbox change listeners accumulated on every render
- **Memory leak in SpeakerLabeling** — Form submit listener accumulated on every render
- **Memory leak in RelationshipGraph** — vis-network CDN script reloaded on every render, Network instance never destroyed
- **Memory leak in VocabularyManager** — Keypress and tab listeners accumulated on every render
- **XSS vulnerability in VocabularyManager** — Dialog HTML content now escaped with HtmlUtils.escapeHtml()
- **Recording duration timer** — Timer now correctly runs in live mode
- **EntityPreview progress bar** — Fixed progress bar rendering
- **MainPanel encapsulation** — Improved singleton encapsulation

## [2.3.7] - 2026-02-19

### Changed
- **Kanka publishing: characters as sub-journals** — Characters are now published as child journal entries under the main chronicle journal, not as separate Kanka character entities. This keeps all session content grouped together in one hierarchical journal structure.
- **Journal-validated entity publishing** — Locations and items are only created in Kanka if they appear in the Foundry adventure journal text, reducing noise from AI hallucinations.
- **Entity descriptions sourced from Foundry journals** — NPC descriptions are extracted from journal NPC profiles first, then from context sentences in the journal text, falling back to AI-extracted descriptions only as a last resort.

### Fixed
- **Image uploads targeting wrong entity type** — Character image uploads now correctly target the journal endpoint (`uploadJournalImage`) instead of the removed character endpoint.

## [2.3.6] - 2026-02-18

### Fixed
- **Critical: Live mode cycle dying silently on error** — If `getLatestChunk()` threw an exception, the next cycle was never scheduled and live mode stopped working while appearing active. Moved scheduling to a `finally` block so the cycle always reschedules regardless of errors.
- **XSS vulnerability in KankaPublisher** — `_formatBasicChronicle()` injected session title, date, speaker names, and transcript text directly into HTML without escaping. Now uses `escapeHtml()` for all user-supplied content.
- **Wrong ApplicationV2 render signature** — `EntityPreview.render(true, { focus: true })` used the v1 two-argument signature. Fixed to `render(true)` for ApplicationV2.
- **Dead code removal** — Removed unused `errors` array in `ImageGenerationService.generateBatch()` that was collected but never read.

## [2.3.5] - 2026-02-18

### Fixed
- **Image generation failing with 400 error** — `ImageSize.LANDSCAPE` (`1792x1024`) and `PORTRAIT` (`1024x1792`) were DALL-E 3 sizes, not valid for gpt-image-1. Reduced `ImageSize` enum to only the 3 valid gpt-image-1 sizes: `1024x1024`, `1024x1536`, `1536x1024`.
- **AI suggestions were generic summaries instead of adventure continuations** — `AIAssistant.setAdventureContext()` and `setChapterContext()` were never called in production code. Added `_initializeJournalContext()` in `startLiveMode()` that auto-detects the active scene's linked journal, parses it, and feeds the full adventure text + current chapter to the AI assistant.
- **Live mode latency reduced ~50%** — Replaced 2 sequential API calls (`generateSuggestions` + `detectOffTrack`) with a single `analyzeContext()` call. Recording now overlaps with transcription+analysis by scheduling the next cycle immediately after audio capture.
- **UI not updating when suggestions arrive** — Added `onStateChange` callback from `SessionOrchestrator` to `MainPanel` so the panel re-renders (debounced) when new suggestions are available.

## [2.3.4] - 2026-02-18

### Fixed
- **Critical: ApplicationV2 panels not opening — render(true) required for initial render** — `ApplicationV2.render()` without arguments is a no-op for apps not yet rendered. All scene control tool handlers now use `render(true)` following the official Foundry v13 pattern.
- **Scene control button handlers now follow official v13 toggle pattern** — Uses `foundry.applications.instances.get(id)` to check if a panel is already open, closing it if so or rendering with `force: true` if not. This matches the documented Foundry v13 `getSceneControlButtons` example.
- **Corrected onChange signature for button: true tools** — `button: true` tools pass no arguments to `onChange`. Removed incorrect `(_event, active)` parameters and `if (active === false) return` guard.
- Removed diagnostic ApplicationV2 logging from ready hook (root cause identified and fixed).

## [2.3.3] - 2026-02-18

### Fixed
- **Scene control tool handlers now properly handle v13 onChange(event, active) signature** — The v13 `onChange` callback receives `(event, active)` but handlers only accepted `(active)`. Fixed to use correct v13 signature.
- **All async tool handlers now catch and log errors** — Previously, any error in dynamic import or ApplicationV2 render() would be silently swallowed. Now errors are caught, logged to console, and shown as UI notifications.
- **ApplicationV2 render() calls are now awaited** — Ensures render errors propagate properly.
- Added diagnostic logging to verify `foundry.applications.api` availability at startup.

## [2.3.2] - 2026-02-18

### Fixed
- **Critical: Duplicate export in SensitiveDataFilter.mjs caused total module failure** — The file had both `export class SensitiveDataFilter` and a redundant `export { SensitiveDataFilter }`, which is a SyntaxError in ES modules. Since this file is in the static import chain (`main.mjs → Logger.mjs → SensitiveDataFilter.mjs`), the error silently killed the entire module — no settings, no scene controls, no console output.

### Added
- Static analysis test: "no duplicate export bindings" — scans all `.mjs` files for the pattern of both inline export (`export class/function/const X`) and brace export (`export { X }`) for the same name, which is a SyntaxError in ES modules.

## [2.3.1] - 2026-02-18

### Fixed
- **Critical: ApplicationV2 and HandlebarsApplicationMixin accessed as bare globals** — Foundry v13 exposes these under `foundry.applications.api`, not as global variables. All 5 UI files now properly destructure from `foundry.applications.api`. This caused the module to fail silently when any UI panel was opened.

### Added
- Static analysis tests for v13 API compatibility:
  - Verify UI files destructure `ApplicationV2` from `foundry.applications.api`
  - Verify test files set `foundry.applications.api` when mocking ApplicationV2
  - Prevent regression to bare global references

## [2.3.0] - 2026-02-18

### Changed
- **BREAKING: Minimum Foundry VTT version raised to v13** — dropped v12 compatibility
- **All 5 UI components migrated to ApplicationV2 + HandlebarsApplicationMixin**
  - MainPanel, RelationshipGraph, EntityPreview, SpeakerLabeling, VocabularyManager
  - `static get defaultOptions()` replaced with `static DEFAULT_OPTIONS` + `static PARTS`
  - `getData()` replaced with `async _prepareContext(options)`
  - `activateListeners(html)` replaced with `actions` map (click) + `_onRender()` (non-click events)
- **Zero jQuery in source code** — all `$(...)`, `html.find()`, `.val()`, `.each()`, `.is()`, `.prop()` replaced with native DOM APIs (`querySelector`, `querySelectorAll`, `.value`, `.dataset`, `.checked`)
- Dialog v1 callbacks use `(html[0] ?? html).querySelector(...)` pattern for jQuery/native DOM compatibility
- `vocabulary-manager.hbs` template updated with `data-action` attributes for all buttons

### Removed
- `_renderFallbackContent` and `_renderInner` overrides from EntityPreview and SpeakerLabeling (~260 lines removed)
- All jQuery dependency from module source code

### Fixed
- ApplicationV2 test infrastructure added to `tests/helpers/foundry-mock.js` with `createMockApplicationV2()` and `createMockHandlebarsApplicationMixin()`
- All 3531 tests pass with updated ApplicationV2 mocks

## [2.2.3] - 2026-02-17

### Fixed
- **SceneDetector method call** — `SessionOrchestrator._liveCycle()` called non-existent `analyzeText()` method; now correctly calls `detectSceneTransition()`
- **SessionAnalytics segment ingestion** — `addSegment()` was receiving an array of segments instead of individual segments; now loops through each segment
- **Suggestion display in template** — template used `{{this.text}}` but `AIAssistant.generateSuggestions()` returns `.content` property; template updated to `{{this.content}}`
- **Off-track detection argument** — `detectOffTrack()` was called with `{ transcript: text }` object but expects a plain string; now passes string directly
- **Chapter title in template** — template used `currentChapter.name` but `ChapterTracker.getCurrentChapter()` returns `.title` property; template updated

### Added
- Comprehensive live cycle integration tests (15 tests) verifying all 5 service integration points
- AudioRecorder unit tests (7 tests) for `getLatestChunk`, `getAudioLevel`, and dual-buffer behavior

## [2.2.2] - 2026-02-17

### Fixed
- **Live mode transcription now works** — implemented `AudioRecorder.getLatestChunk()` method that flushes accumulated audio chunks for live cycle processing; previously the method didn't exist so live mode never received any audio data
- **Audio level meter now shows real input** — `MainPanel.getData()` reads actual audio level from `AudioRecorder.getAudioLevel()` instead of returning hardcoded 0

### Added
- `AudioRecorder.getLatestChunk()` — returns accumulated audio since last call as a Blob, uses separate `_liveChunks` buffer so the full session recording in `_audioChunks` is preserved

## [2.2.1] - 2026-02-17

### Fixed
- **RAG Index always showing "Empty"** — `_getRAGData()` checked `indexStatus.documentCount` but `RAGRetriever.getIndexStatus()` returns `vectorCount`; status now correctly shows "Ready" after indexing
- **RAG Memory Usage always "0 KB"** — `_getRAGData()` read `stats.storageSizeBytes` but `RAGVectorStore.getStats()` returns `estimatedSizeBytes`
- **RAG Build Index did nothing** — `_handleRAGBuildIndex()` passed `{ onProgress }` as first arg to `buildIndex(journalIds, packIds, options)`, so no journals or compendiums were ever indexed; now collects all journal and compendium IDs from Foundry
- **Panel reopening when clicking other controls** — `onChange` handler now checks the `active` parameter to prevent firing on deactivation
- **Sub-menu icons restored** — re-added Speaker Labels, Vocabulary, Relationship Graph, and Settings tools to scene controls
- **Deprecated SettingsConfig global** — settings handler now uses `foundry.applications.settings.SettingsConfig` with v12 fallback

## [2.2.0] - 2026-02-17

### Fixed
- **Record button now works** — wired all MainPanel button actions (toggle-recording, toggle-pause, process-session, publish-kanka, generate-image, review-entities) that were silently falling through an empty `default` case
- **Live mode recording state** — `isRecording` template variable now correctly reflects live mode states (LIVE_LISTENING, LIVE_TRANSCRIBING, LIVE_ANALYZING), not just chronicle mode
- **Removed deprecated `SettingsConfig` global** — eliminated `new SettingsConfig()` that triggered v13 deprecation warning

### Improved
- **Simplified scene controls** — reduced from 5 cluttered toolbar buttons to a single panel toggle; all features (speaker labels, vocabulary, relationship graph, settings) are accessible from within the unified panel

## [2.1.3] - 2026-02-17

### Improved
- Kanka campaign dropdown now auto-fetches campaigns when pasting/typing the API token (debounced 800ms)

## [2.1.2] - 2026-02-17

### Fixed
- Fixed `html.find is not a function` error in Foundry v13 settings panel — converted `renderSettingsConfig` hook from jQuery to native DOM APIs for v12/v13 compatibility
- Added 18 missing i18n keys across all 8 language files (Panel.Record, Panel.Stop, RAG.NotConfigured, etc.) that were showing as raw key strings in the UI

## [2.1.1] - 2026-02-17

### Added
- **Static analysis tests** (114 tests): Prevent module-breaking import errors
  - Duplicate named import detection across all source files
  - Import target existence validation
  - Circular import chain detection from entry point
  - module.json integrity checks (entry points, styles, language files, version consistency)
  - i18n key consistency across all 8 language files

### Fixed
- Fixed duplicate `OpenAIClient` import in VoxChronicle.mjs that crashed module loading (no toolbar button, no settings)

## [2.1.0] - 2026-02-17

### Added
- **RAG (Retrieval Augmented Generation)**: Context-aware AI suggestions using journal and compendium content
  - EmbeddingService: Generate vector embeddings via OpenAI text-embedding-3 API
  - RAGVectorStore: In-memory vector storage with IndexedDB persistence and LRU eviction
  - RAGRetriever: Hybrid semantic + keyword retrieval with configurable weights
  - SilenceDetector: Timer-based silence detection for automatic AI suggestions
  - Text chunking in JournalParser and CompendiumParser for embedding generation
- **RAG Settings**: Configurable embedding dimensions, chunk size, similarity threshold, storage limits
- **RAG UI**: Index status indicators, build/clear controls in MainPanel
- **113 new i18n keys** across all 8 language files (888 total)
- **473 new tests** across 10 test files (3567 total)

### Fixed
- MainPanel RAG data access via VoxChronicle singleton instead of missing orchestrator property
- Settings dropdown rendering for embedding dimensions (string keys for Foundry compatibility)

## [2.0.0] - 2026-02-15

### Major: Narrator Master Integration
VoxChronicle now includes all features from the Narrator Master module, creating a unified real-time DM assistant + session chronicle publisher.

### Added
- **Live Mode**: Real-time AI assistance during game sessions
  - AI-powered contextual suggestions (narration, dialogue, action, reference)
  - Off-track detection with configurable sensitivity
  - Narrative bridge generation to guide players back to story
  - NPC dialogue generation
  - D&D rules Q&A with compendium citations
  - Chapter/scene tracking from Foundry journals
  - Scene type detection (combat, social, exploration, rest)
  - Session analytics (speaker participation, timeline)
  - Silence detection with chapter recovery UI
- **Unified Panel**: Single floating panel with 6 tabs (Live, Chronicle, Images, Transcript, Entities, Analytics)
- **Audio Level Metering**: Real-time audio level visualization
- **gpt-image-1**: Updated image generation model (replaces deprecated DALL-E 3)
- **Multi-language transcription**: Support for multiple languages in same session
- **5 new localizations**: German, Spanish, French, Japanese, Portuguese
- **API retry system**: Exponential backoff with jitter for all OpenAI requests
- **Request queue**: Sequential request processing to prevent rate limiting
- **Circuit breaker**: Auto-stops after consecutive failures
- **Debug mode**: Verbose logging toggle in settings

### Changed
- Minimum Foundry VTT version: v12 (dropped v11 support)
- Image generation model: gpt-image-1 (was dall-e-3)
- OpenAI client: Added retry/queue/backoff (from Narrator Master)
- AudioRecorder: Added level metering and silence detection
- TranscriptionService: Added multi-language mode
- SpeakerLabeling: Added inline rename and retroactive apply

### Deprecated
- Narrator Master module is now archived. All features are included in VoxChronicle v2.0.0.

## [1.4.0] - 2026-02-13

### Added
- **Entity caching in KankaService**: 5-minute cache for entity lookups reduces redundant API calls by ~57-70%
- **`preFetchEntities()` method**: Pre-fetch and cache all entity types in parallel for bulk operations
- **Public `clearCache()` method**: Manual cache invalidation for specific entity types or entire cache

### Changed
- **Parallelized `searchEntities()`**: Multi-type searches now use `Promise.all` for parallel execution (6x faster for 6-type searches)
- **Cache-aware entity lookups**: `searchEntities()` and `findExistingEntity()` check cache before API calls
- **Optimized `createIfNotExists()` workflow**: `KankaPublisher` and `EntityProcessor` pre-fetch entities into cache, eliminating N redundant API calls during entity creation

### Fixed
- **`preFetchEntities()` cache data format**: Fixed caching full paginated response objects (`{ data, meta, links }`) instead of flat entity arrays, which caused `searchEntities()` to fail with `TypeError: .filter is not a function`

### Performance
- **API call reduction**: Creating 10 entities reduced from 13 API calls to 4 calls (3 pre-fetch + 1 publish) - ~70% reduction
- **Search speed**: Multi-type entity searches 6x faster (6 sequential API calls → 1 parallel batch with Promise.all)
- **Cache TTL**: 5-minute expiry with automatic validation and force-refresh option

## [1.3.0] - 2026-02-13

### Removed
- **Redundant VoxChronicleConfig custom settings panel**: Eliminated duplicate settings UI that overlapped with native Foundry settings. Deleted `scripts/ui/VoxChronicleConfig.mjs` (705 lines) and `templates/config.hbs` (248 lines)
- **Dead code in VoxChronicle singleton**: Removed 4 placeholder methods (`startRecording`, `stopRecording`, `processSession`, `publishToKanka`) never called by any code — all workflow logic lives in `SessionOrchestrator`
- **Config.\* localization keys**: Removed unused keys from en.json and it.json

### Added
- **Dynamic Kanka campaign dropdown in native settings**: Injected via `renderSettingsConfig` hook — replaces text input with a `<select>` that loads campaigns from the Kanka API with refresh button and loading/error states
- Campaign dropdown localization keys (`CampaignPlaceholder`, `CampaignNone`, `CampaignNeedsToken`, `CampaignError`) in en.json and it.json

### Changed
- **Refactored validation button handlers**: Extracted ~100 lines of duplicated OpenAI/Kanka validation code into shared `injectValidationButton` function
- **Refactored scene control tool handlers**: Extracted handler functions into shared `toolHandlers` map used by both v13 (`onChange`) and v11/v12 (`onClick`) definitions

## [1.2.2] - 2026-02-09

### Fixed
- **Font Awesome v13 icons**: Replaced all `fas fa-*` shorthand with `fa-solid fa-*` (Font Awesome 6 standard) across 6 templates and 5 UI scripts
- **Broken icon class concatenation**: Fixed missing space in icon classes that caused icons not to render (e.g., `fa-solidfa-trash` → `fa-solid fa-trash`)
- **Handlebars conditional icon patterns**: Fixed `fa-solid{{#if ...}}` → `fa-solid {{#if ...}}` in config and entity-preview templates

### Changed
- Updated TODO.md with resolved items (W1, W2, I1, I2) and new v13 compatibility notes (jQuery deprecation, ApplicationV2 migration)

## [1.2.1] - 2026-02-09

### Fixed
- **Settings not appearing in Foundry VTT v13**: Broke circular ES module import dependency that prevented the `init` hook from firing
- **Circular import chain**: Extracted `MODULE_ID` constant to new `scripts/constants.mjs` leaf module (zero imports), eliminating circular dependency cycles between `main.mjs` and 10 source files

### Added
- `scripts/constants.mjs` - Dependency-free module exporting `MODULE_ID`
- Missing localization key `VOXCHRONICLE.Config.CampaignNeedsToken` in en.json and it.json

### Changed
- All 10 source files now import `MODULE_ID` from `constants.mjs` instead of `main.mjs`
- `main.mjs` re-exports `MODULE_ID` from `constants.mjs` for backward compatibility
- All 33 test files updated with `constants.mjs` mock

## [1.2.0] - 2026-02-09

### Added

#### Offline Transcription Mode
- **Local Whisper Backend**: Support for privacy-focused local transcription using Whisper running on user's machine
- **Transcription Mode Selection**: New setting to choose between API, Local, or Auto (with fallback) transcription modes
- **WhisperBackend Abstraction**: HTTP client for communicating with local Whisper server (whisper.cpp, faster-whisper, etc.)
- **LocalWhisperService**: Full-featured local transcription service matching OpenAI API interface
- **TranscriptionFactory**: Factory pattern for creating appropriate transcription service based on mode
- **Auto Mode with Fallback**: Automatically falls back to OpenAI API if local backend unavailable
- **Mode Indicator UI**: Visual badge in recorder controls showing current transcription mode (API/Local/Auto)
- **Health Status Monitoring**: Real-time health checks for local backend with visual status indicators
- **Whisper Backend URL Setting**: Configurable endpoint for local Whisper server (default: http://localhost:8080)
- **Mode Indicator Toggle**: Client-side setting to show/hide transcription mode indicator

#### Configuration Panel
- **VoxChronicleConfig**: Dedicated FormApplication settings panel accessible from Foundry module settings menu
- **Grouped Settings UI**: API keys, transcription mode, Kanka integration, and advanced settings organized in tabs
- **Kanka Campaign Selector**: `getCampaigns()` method on KankaClient for campaign dropdown

#### Orchestrator Refactoring
- **SessionOrchestrator** refactored from monolithic class into 4 focused processors:
  - `TranscriptionProcessor` - audio transcription workflow with auto-fallback
  - `EntityProcessor` - entity extraction workflow
  - `ImageProcessor` - image generation workflow
  - `KankaPublisher` - Kanka publishing workflow

#### Test Suite
- Comprehensive test coverage: **2029 tests** across **38 test files**
- Unit tests for all core, AI, audio, kanka, orchestration, and UI modules
- Integration tests for full session flow, recording, transcription, and publication
- Test mocks for Foundry VTT, OpenAI, and Kanka APIs

#### Documentation
- **WHISPER_SETUP.md**: Comprehensive setup guide for local Whisper backend
- **GPT4O_TRANSCRIBE_API.md**: Complete diarization API documentation
- **tests/README.md**: Test coverage quick-start and documentation
- **Migration guide** template section in CHANGELOG
- Inline comments for speaker mapping algorithm and multi-chunk transcription

#### Localization
- English and Italian translations for offline mode, configuration panel, and all UI strings
- Localized previously hardcoded UI strings (segments, speakers, cancel session, etc.)

### Changed
- UI section collapse/expand now uses smooth CSS animations
- Help details accordion uses animated transitions
- ESLint + Prettier enforced across entire codebase (0 errors, 0 warnings)

### Technical Details
- Local backend communication via HTTP with health checks and retry logic
- Response format normalization to match OpenAI diarized JSON structure
- Audio chunking support for large files (25MB+ limit handling)
- Graceful degradation when local backend unavailable in auto mode
- Progress callbacks report current mode and fallback status

## [1.0.0] - 2026-02-06

Initial release of VoxChronicle - the Foundry VTT session transcription and Kanka publishing module.

### Added

#### Core Features
- **Audio Recording**: Capture session audio from Foundry VTT WebRTC or browser microphone fallback
- **Speaker Diarization**: Automatic speaker identification using OpenAI's GPT-4o transcription with diarization
- **AI Transcription**: Convert recorded audio to timestamped text with speaker attribution
- **Entity Extraction**: AI-powered detection of NPCs, locations, and items from transcription text
- **Image Generation**: DALL-E 3 integration for generating character portraits, location images, and scene illustrations
- **Kanka Integration**: Seamless creation of journals, characters, locations, and items in Kanka campaigns

#### Audio Services
- `AudioRecorder` class with MediaRecorder API integration
- Foundry VTT WebRTC stream capture via `game.webrtc.client`
- Browser microphone capture fallback for Discord users
- Configurable echo cancellation and noise suppression
- `AudioChunker` class for splitting recordings into 25MB segments (OpenAI API limit)
- MIME type auto-detection for cross-browser compatibility (WebM, Ogg, MP4, WAV)

#### OpenAI Integration
- `OpenAIClient` base class with authentication and error handling
- `TranscriptionService` for GPT-4o-transcribe-diarize model with speaker mapping
- `ImageGenerationService` for DALL-E 3 with entity-specific prompt templates
- `EntityExtractor` for AI-powered entity detection and salient moment identification
- Automatic chunking strategy for long recordings
- Cost estimation for transcription and image generation

#### Kanka Integration
- `KankaClient` base class with Bearer token authentication
- `KankaService` with full CRUD operations for journals, characters, locations, and items
- Image upload support for entity portraits (URL and Blob)
- Rate limiting (30 req/min free, 90 req/min premium)
- Automatic retry with exponential backoff on 429 responses
- `NarrativeExporter` for formatting transcripts as Kanka journal entries
- AI-enhanced summary generation using GPT-4o

#### User Interface
- `RecorderControls` Application for start/stop/pause recording
- `SpeakerLabeling` FormApplication for mapping speaker IDs to player names
- `EntityPreview` Application for reviewing extracted entities before Kanka publish
- Scene control buttons for quick access to module features
- Real-time recording duration display
- Progress indicators for transcription and entity creation

#### Foundry VTT Integration
- Module manifest (module.json) compatible with Foundry VTT v11 and v12
- Singleton pattern `VoxChronicle` class with service orchestration
- `SessionOrchestrator` for managing complete session workflows
- `CompendiumSearcher` for finding existing entities in Foundry compendiums
- Settings registration with client and world scopes
- Scene control button integration

#### Localization
- English (en.json) language file with complete UI translations
- Italian (it.json) language file with complete UI translations

#### Utilities
- `Logger` utility with module-prefixed console output and log levels
- `RateLimiter` utility with sliding window algorithm and request queuing
- `AudioUtils` helper for MIME type detection and blob conversion

#### Styles & Templates
- `vox-chronicle.css` stylesheet with CSS variables for theming
- Handlebars templates for recorder, speaker labeling, and entity preview UIs
- Responsive design for various screen sizes
- Recording pulse animation and processing spinner

#### Documentation
- Comprehensive README.md with installation, setup, and usage instructions
- CHANGELOG.md (this file) following Keep a Changelog format

### Security
- API keys stored securely in Foundry VTT settings (not in source code)
- Client-side storage for OpenAI API key (per-user)
- World-side storage for Kanka credentials (shared across users)
- No sensitive data logged to console

### Technical Notes
- Pure ES6 modules (ESM) architecture
- OOP design with clear separation of concerns
- Comprehensive error handling with user-friendly notifications
- Full JSDoc documentation in source files

---

## Migration Guide

This section provides step-by-step instructions for upgrading between major versions of VoxChronicle. Follow the guide corresponding to your upgrade path.

### Migrating to 1.1.0 (Offline Transcription Mode)

Version 1.1.0 introduces optional offline transcription using local Whisper backends. **This is a non-breaking update** - existing users can continue using OpenAI API transcription without any changes.

#### What's New

- **Transcription Mode Setting**: Choose between API (OpenAI), Local (Whisper), or Auto (try local, fallback to API)
- **Optional API Key**: OpenAI API key is now optional if you use local transcription exclusively
- **Whisper Backend URL**: Configure the endpoint for your local Whisper server
- **Mode Indicator**: Visual badge showing current transcription mode in the recorder UI

#### Migration Steps

**Option 1: Continue Using OpenAI API (No Action Required)**

If you're happy with cloud-based transcription, you don't need to do anything. Your existing setup will continue working as before.

1. After updating to 1.1.0, your **Transcription Mode** will default to `API`
2. All recordings will use OpenAI transcription as usual
3. No configuration changes needed

**Option 2: Switch to Local Offline Transcription**

To enable privacy-focused, cost-free local transcription:

1. **Set up a local Whisper backend** following the [WHISPER_SETUP.md](docs/WHISPER_SETUP.md) guide
   - Install whisper.cpp, faster-whisper, or another compatible backend
   - Start the Whisper server (default: `http://localhost:8080`)
   - Verify the server is running and accessible

2. **Update VoxChronicle settings** in Foundry VTT:
   - Go to **Settings** → **Module Settings** → **VoxChronicle**
   - Set **Transcription Mode** to `Local`
   - Set **Whisper Backend URL** to your server address (e.g., `http://localhost:8080`)
   - *(Optional)* Enable **Show Mode Indicator** to see transcription status in the UI
   - Click **Save**

3. **Test your setup**:
   - Click the VoxChronicle icon in the scene controls
   - Start a short test recording (10-30 seconds)
   - Stop the recording and verify transcription works
   - Check the mode indicator badge shows "Local"

4. **Remove OpenAI API key** (optional):
   - If you're using local transcription exclusively, you can remove your OpenAI API key
   - **Note:** You'll still need an API key for AI image generation and entity extraction features
   - To disable these features, adjust the corresponding settings

**Option 3: Use Auto Mode (Best of Both Worlds)**

For flexibility with automatic fallback:

1. **Set up a local Whisper backend** (see Option 2, step 1)

2. **Keep your OpenAI API key configured** in VoxChronicle settings

3. **Update transcription mode**:
   - Go to **Settings** → **Module Settings** → **VoxChronicle**
   - Set **Transcription Mode** to `Auto`
   - Set **Whisper Backend URL** to your server address
   - Click **Save**

4. **How Auto Mode works**:
   - VoxChronicle will try local transcription first
   - If the local backend is unavailable or fails, it automatically falls back to OpenAI API
   - The mode indicator shows which service is being used
   - Perfect for laptops that may not always have the local server running

#### Settings Reference

| Setting | Description | Default | Required? |
|---------|-------------|---------|-----------|
| **Transcription Mode** | Choose API, Local, or Auto | `API` | Yes |
| **Whisper Backend URL** | URL of your local Whisper server | `http://localhost:8080` | Only for Local/Auto modes |
| **Show Mode Indicator** | Display transcription mode badge in UI | `true` | No |
| **OpenAI API Key** | Your OpenAI API key | *(none)* | Only for API/Auto modes and image generation |

#### Troubleshooting Common Issues

**Issue: "Local backend not available" error**

- **Solution**: Verify your Whisper server is running and accessible
- Test with: `curl http://localhost:8080/health` (should return status information)
- Check the Whisper Backend URL setting matches your server address
- See [WHISPER_SETUP.md](docs/WHISPER_SETUP.md) for detailed troubleshooting

**Issue: Transcription is slow with local mode**

- **Solution**: Consider using a faster model (tiny, base) or enabling GPU acceleration
- See the Model Selection section in [WHISPER_SETUP.md](docs/WHISPER_SETUP.md)
- Alternatively, switch to Auto mode to use API for long recordings

**Issue: Mode indicator not showing**

- **Solution**: Enable **Show Mode Indicator** in module settings
- Refresh the page after changing the setting

#### Breaking Changes

**None.** Version 1.1.0 is fully backward compatible with 1.0.0. All new features are opt-in.

#### Recommended Actions

1. **Review the documentation**: Read [WHISPER_SETUP.md](docs/WHISPER_SETUP.md) to understand local transcription setup
2. **Test before your session**: If switching to local mode, test with a short recording first
3. **Update your workflow**: Consider using Auto mode for maximum reliability

#### Need Help?

- Check the [Troubleshooting section](docs/WHISPER_SETUP.md#troubleshooting) in WHISPER_SETUP.md
- Review the [User Guide](docs/USER_GUIDE.md) for configuration details
- Report issues on [GitHub Issues](https://github.com/voxchronicle/vox-chronicle/issues)

---

[Unreleased]: https://github.com/Aiacos/VoxChronicle/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/Aiacos/VoxChronicle/compare/v2.3.7...v3.0.0
[2.3.7]: https://github.com/Aiacos/VoxChronicle/compare/v2.3.6...v2.3.7
[2.3.6]: https://github.com/Aiacos/VoxChronicle/compare/v2.3.5...v2.3.6
[2.3.5]: https://github.com/Aiacos/VoxChronicle/compare/v2.3.4...v2.3.5
[2.3.4]: https://github.com/Aiacos/VoxChronicle/compare/v2.3.3...v2.3.4
[2.3.3]: https://github.com/Aiacos/VoxChronicle/compare/v2.3.2...v2.3.3
[2.3.2]: https://github.com/Aiacos/VoxChronicle/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/Aiacos/VoxChronicle/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/Aiacos/VoxChronicle/compare/v2.2.3...v2.3.0
[2.2.3]: https://github.com/Aiacos/VoxChronicle/compare/v2.2.2...v2.2.3
[2.2.2]: https://github.com/Aiacos/VoxChronicle/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/Aiacos/VoxChronicle/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/Aiacos/VoxChronicle/compare/v2.1.3...v2.2.0
[2.1.3]: https://github.com/Aiacos/VoxChronicle/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/Aiacos/VoxChronicle/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/Aiacos/VoxChronicle/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/Aiacos/VoxChronicle/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Aiacos/VoxChronicle/compare/v1.4.0...v2.0.0
[1.4.0]: https://github.com/Aiacos/VoxChronicle/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Aiacos/VoxChronicle/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/Aiacos/VoxChronicle/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/Aiacos/VoxChronicle/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Aiacos/VoxChronicle/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/Aiacos/VoxChronicle/releases/tag/v1.0.0
