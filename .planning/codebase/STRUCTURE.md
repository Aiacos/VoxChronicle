# Codebase Structure

**Analysis Date:** 2026-03-19

## Directory Layout

```
VoxChronicle/
├── module.json                    # Foundry VTT manifest (version, entry, compatibility)
├── CLAUDE.md                      # AI development context (read first)
├── TODO.md                        # Known issues and open tasks (read before any work)
├── CHANGELOG.md                   # Version history
├── package.json                   # npm deps (vitest, eslint)
├── vitest.config.js               # Unit test config
├── vitest.integration.config.js   # Integration test config
├── eslint.config.js               # ESLint flat config
├── build.sh / build.bat           # Release build scripts
│
├── scripts/                       # All source code (.mjs only)
│   ├── main.mjs                   # Entry point — Foundry hooks, scene controls, settings UI
│   ├── constants.mjs              # MODULE_ID constant (dependency-free leaf)
│   ├── core/                      # Module singleton, settings, EventBus
│   ├── audio/                     # MediaRecorder wrapper, audio chunking
│   ├── ai/                        # OpenAI clients, transcription, image, entity extraction
│   │   └── providers/             # Abstract provider interfaces + vendor implementations
│   ├── rag/                       # RAG provider abstraction (OpenAI File Search, RAGFlow)
│   ├── narrator/                  # Live mode AI services (suggestions, rules, scene, analytics)
│   ├── kanka/                     # Kanka.io API client and publishing
│   ├── orchestration/             # Session workflow orchestration + sub-processors
│   ├── api/                       # Shared base API client
│   ├── data/                      # Static data (D&D vocabulary)
│   ├── ui/                        # ApplicationV2 panels and dialogs
│   └── utils/                     # Shared utilities (Logger, Cache, Rate limiter, etc.)
│
├── templates/                     # Handlebars templates
│   └── parts/                     # PARTS sub-templates (transcript-review.hbs)
├── styles/                        # CSS (single file + tokens/)
├── lang/                          # i18n JSON files (8 languages)
├── tests/                         # Test files (mirrors scripts/ structure)
│   ├── integration/               # Integration tests (54 tests)
│   ├── mocks/                     # Shared Foundry API mocks
│   ├── fixtures/                  # Shared test data
│   └── harness/                   # Browser test harness
├── docs/                          # Documentation
│   └── plans/                     # Implementation plans
├── .planning/                     # GSD planning artifacts
│   ├── codebase/                  # Auto-generated codebase maps (this file)
│   └── phases/                    # Phase plans
└── releases/                      # Built ZIP files (gitignored)
```

---

## Directory Purposes

### `scripts/core/`
- Purpose: Module-level singletons and shared infrastructure
- Key files:
  - `VoxChronicle.mjs` — main singleton, service orchestration, initialize/reinitialize lifecycle
  - `EventBus.mjs` — pub/sub with typed channels; exports `eventBus` singleton instance
  - `Settings.mjs` — all 58+ Foundry settings registrations and validation helpers
  - `VocabularyDictionary.mjs` — custom vocabulary for transcription accuracy

### `scripts/audio/`
- Purpose: Browser audio capture and processing
- Key files:
  - `AudioRecorder.mjs` — MediaRecorder wrapper with rotation strategy, WebRTC mixing, IndexedDB crash recovery. Accepts optional `eventBus` option but NOT passed one in production.
  - `AudioChunker.mjs` — Splits blobs > 25MB for OpenAI file size limit

### `scripts/ai/`
- Purpose: AI service implementations and provider abstraction
- Key files:
  - `OpenAIClient.mjs` — base HTTP client with retry, queue, circuit breaker
  - `TranscriptionService.mjs` — GPT-4o transcription with diarization
  - `TranscriptionFactory.mjs` — creates cloud/local/auto transcription service from mode setting
  - `EntityExtractor.mjs` — extracts NPCs/locations/items from transcript text
  - `ImageGenerationService.mjs` — gpt-image-1 image generation (returns base64)
  - `providers/` — see below

### `scripts/ai/providers/`
- Purpose: Vendor-neutral AI provider interface and implementations
- Key files:
  - `ChatProvider.mjs`, `TranscriptionProvider.mjs`, `ImageProvider.mjs`, `EmbeddingProvider.mjs` — abstract interfaces
  - `OpenAIChatProvider.mjs`, `OpenAITranscriptionProvider.mjs`, `OpenAIImageProvider.mjs`, `OpenAIEmbeddingProvider.mjs` — OpenAI implementations
  - `AnthropicChatProvider.mjs`, `GoogleChatProvider.mjs` — additional chat providers (dynamically imported)
  - `ProviderRegistry.mjs` — service locator, capability-based lookup, singleton
  - `CachingProviderDecorator.mjs` — L2 cache decorators for chat and embedding

### `scripts/rag/`
- Purpose: Retrieval-Augmented Generation provider system
- Key files:
  - `RAGProvider.mjs` — abstract base class
  - `OpenAIFileSearchProvider.mjs` — default: OpenAI Responses API + `file_search` tool
  - `RAGFlowProvider.mjs` — alternative: self-hosted RAGFlow server
  - `RAGProviderFactory.mjs` — creates providers by type string

### `scripts/narrator/`
- Purpose: Real-time DM assistance services (live mode only)
- Key files:
  - `AIAssistant.mjs` — contextual suggestions, off-track detection, streaming support, silence monitoring wiring
  - `RulesReference.mjs` — keyword-based rules detection, compendium search
  - `RulesLookupService.mjs` — two-phase hybrid lookup (compendium + AI synthesis)
  - `SceneDetector.mjs` — scene type detection from transcript text
  - `ChapterTracker.mjs` — tracks active journal chapter from Foundry scene
  - `SessionAnalytics.mjs` — speaker stats, timeline, session metrics
  - `SilenceDetector.mjs` — timer-based silence detection
  - `SilenceMonitor.mjs` — wraps SilenceDetector, guards cycle-in-flight
  - `NPCProfileExtractor.mjs` — extracts NPC profiles from journal text
  - `PromptBuilder.mjs` — constructs AI prompts from context
  - `RollingSummarizer.mjs` — rolling session summarization for context window management
  - `JournalParser.mjs` — parses Foundry journal entries (with chunking for embeddings)
  - `CompendiumParser.mjs` — parses Foundry compendiums for rules content

### `scripts/kanka/`
- Purpose: Kanka.io campaign management integration
- Key files:
  - `KankaClient.mjs` — base API client with rate limiting (30/min free, 90/min premium)
  - `KankaService.mjs` — CRUD operations for journals, characters, locations, items
  - `KankaEntityManager.mjs` — entity lifecycle management, duplicate detection
  - `NarrativeExporter.mjs` — formats transcripts as Kanka journal entries

### `scripts/orchestration/`
- Purpose: Session workflow coordination
- Key files:
  - `SessionOrchestrator.mjs` — dual-mode session state machine, live cycle timer
  - `TranscriptionProcessor.mjs` — transcription workflow with speaker wiring (Chronicle mode only)
  - `EntityProcessor.mjs` — entity + relationship extraction workflow
  - `ImageProcessor.mjs` — image generation workflow
  - `KankaPublisher.mjs` — Kanka publishing workflow
  - `CostTracker.mjs` — API cost estimation and cap enforcement

### `scripts/api/`
- Key files:
  - `BaseAPIClient.mjs` — abstract base for API clients (extended by OpenAIClient, KankaClient)

### `scripts/ui/`
- Purpose: Foundry VTT ApplicationV2 panels and dialogs
- Key files:
  - `MainPanel.mjs` — unified 6-tab floating panel (live, chronicle, images, transcript, entities, analytics). Singleton.
  - `SpeakerLabeling.mjs` — map speaker IDs to player names
  - `EntityPreview.mjs` — entity review before Kanka publish
  - `RelationshipGraph.mjs` — vis-network relationship visualization
  - `VocabularyManager.mjs` — custom vocabulary UI
  - `JournalPicker.mjs` — journal/chapter selection for live mode context

### `scripts/utils/`
- Purpose: Shared, dependency-free helpers
- Key files:
  - `Logger.mjs` — module-prefixed logger with debug mode
  - `CacheManager.mjs` — TTL cache with prefix invalidation
  - `RateLimiter.mjs` — request throttling queue
  - `AudioUtils.mjs` — MIME type detection, blob conversion
  - `HtmlUtils.mjs` — HTML sanitization and escaping
  - `DomUtils.mjs` — DOM helpers, debounce
  - `SpeakerUtils.mjs` — speaker ID/label utilities
  - `SensitiveDataFilter.mjs` — filters API keys from logs

### `templates/`
- Purpose: Handlebars templates for all UI panels
- Key files:
  - `main-panel.hbs` — unified 6-tab panel template
  - `parts/transcript-review.hbs` — PARTS sub-template for transcript tab (rendered independently)
  - All other `.hbs` files mirror the `scripts/ui/` applications

### `styles/`
- Purpose: CSS with `.vox-chronicle` namespace
- Key file: `styles/vox-chronicle.css` — single stylesheet for all module styles
- `styles/tokens/` — CSS design tokens

### `lang/`
- Purpose: Localization strings (all user-facing text)
- Files: `en.json` (1102 keys), `it.json`, `de.json`, `es.json`, `fr.json`, `ja.json`, `pt.json`, `template.json`
- Format: Nested JSON, top-level key `VOXCHRONICLE`

### `tests/`
- Purpose: Vitest unit and integration tests
- Structure mirrors `scripts/` (e.g., `tests/narrator/`, `tests/orchestration/`)
- `tests/mocks/` — shared Foundry API mocks (game, canvas, Hooks, etc.)
- `tests/fixtures/` — shared test data
- `tests/integration/` — 54 integration tests
- `tests/harness/` — browser test harness for Foundry-live testing

---

## Key File Locations

**Entry Points:**
- `scripts/main.mjs` — Foundry hooks, scene controls, settings UI hooks
- `scripts/constants.mjs` — MODULE_ID (import from here, never from main.mjs)

**Configuration:**
- `module.json` — Foundry manifest, version, compatibility
- `scripts/core/Settings.mjs` — all settings registration
- `vitest.config.js` — test runner configuration

**Core Logic:**
- `scripts/core/VoxChronicle.mjs` — service initialization and lifecycle
- `scripts/orchestration/SessionOrchestrator.mjs` — session state machine (2355 lines)
- `scripts/ui/MainPanel.mjs` — primary UI (1900+ lines)
- `scripts/narrator/AIAssistant.mjs` — AI suggestion engine

**Testing:**
- `tests/` directory — mirrors source structure
- `tests/mocks/` — Foundry mock objects

---

## Naming Conventions

**Files:**
- All source files use `.mjs` extension (ES6 modules)
- PascalCase class names map to matching PascalCase file names: `VoxChronicle.mjs`, `MainPanel.mjs`
- Utility files use PascalCase: `Logger.mjs`, `CacheManager.mjs`
- Data files use kebab-case: `dnd-vocabulary.mjs`
- Test files mirror source names: `AIAssistant.mjs` → `tests/narrator/AIAssistant.test.mjs`

**Directories:**
- lowercase, descriptive: `core/`, `audio/`, `narrator/`, `orchestration/`, `rag/`
- `scripts/ai/providers/` — provider implementations nested under `ai/`

**Classes:**
- PascalCase: `SessionOrchestrator`, `AudioRecorder`, `OpenAIChatProvider`

**Private fields/methods:**
- `#privateField` — ES2022 private fields in ApplicationV2-derived classes
- `_privateMethod` — underscore prefix for private-by-convention in non-ApplicationV2 classes

**Event names:**
- `channel:actionCamelCase` format: `ai:transcriptionReady`, `session:liveStarted`
- Channels: `ai`, `audio`, `scene`, `session`, `ui`, `error`, `analytics`

---

## Where to Add New Code

**New AI Feature (chat-based):**
- Provider interface: `scripts/ai/providers/ChatProvider.mjs` (if new capability needed)
- Service implementation: `scripts/narrator/NewService.mjs`
- Wire in `VoxChronicle.initialize()`: pass to orchestrator via `setNarratorServices()`
- Tests: `tests/narrator/NewService.test.mjs`

**New Foundry VTT Panel:**
- Application class: `scripts/ui/NewPanel.mjs` (extend `HandlebarsApplicationMixin(ApplicationV2)`)
- Template: `templates/new-panel.hbs`
- CSS: add to `styles/vox-chronicle.css` with `.vox-chronicle-new-panel` namespace
- i18n: add keys to all 8 `lang/*.json` files
- Register in scene controls: `scripts/main.mjs` `getSceneControlButtons` hook

**New Foundry Setting:**
- Register in `scripts/core/Settings.mjs`
- Add keys to all 8 `lang/*.json` files
- Read in `VoxChronicle._getSetting(key)` or `Settings.get(key)`

**New EventBus Event:**
- Use format `channel:actionCamelCase` (only existing channels: `ai`, `audio`, `scene`, `session`, `ui`, `error`, `analytics`)
- Emit via `eventBus.emit(name, plainObject)` or `_emitSafe(name, plainObject)`
- Subscribe via `eventBus.on(name, callback)` and store the returned unsubscribe function
- Clean up in `destroy()` or `close()` using the unsubscribe function

**New API Provider:**
- Implement the appropriate abstract class from `scripts/ai/providers/`
- Register in `VoxChronicle.initialize()` via `registry.register(name, instance, { default: false })`
- Optionally wrap with `CachingChatDecorator` if cacheable

**New Orchestration Stage:**
- Add state to `SessionState` enum in `SessionOrchestrator.mjs`
- Add processor class in `scripts/orchestration/NewProcessor.mjs`
- Wire into `_initializeProcessors()` and relevant workflow method

**New Utility:**
- Add to `scripts/utils/NewUtil.mjs`
- No imports from other script layers (utilities are leaf modules)
- Add test: `tests/utils/NewUtil.test.mjs`

---

## Special Directories

**`.planning/`:**
- Purpose: GSD planning artifacts — codebase maps, phase plans, research
- Generated: Partially (codebase maps auto-generated by `/gsd:map-codebase`)
- Committed: Yes

**`releases/`:**
- Purpose: Built ZIP files for Foundry VTT distribution
- Generated: Yes (by `build.sh`)
- Committed: No (gitignored)

**`coverage/`:**
- Purpose: Vitest coverage reports
- Generated: Yes (by `npm run test:coverage`)
- Committed: No (gitignored)

**`_bmad/` and `_bmad-output/`:**
- Purpose: BMAD methodology artifacts (stories, epics, retrospectives)
- Generated: Partially (output files generated during sprints)
- Committed: Yes

**`tests/harness/`:**
- Purpose: Browser-based test harness for running module tests inside live Foundry VTT
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-03-19*
