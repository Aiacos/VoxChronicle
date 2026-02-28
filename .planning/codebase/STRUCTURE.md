# Codebase Structure

**Analysis Date:** 2026-02-28

## Directory Layout

```
VoxChronicle/
├── scripts/                   # All ES6 module code (.mjs files)
│   ├── main.mjs               # Entry point: hook registration, scene controls
│   ├── constants.mjs           # MODULE_ID constant (dependency-free leaf)
│   ├── core/                  # Core singleton and settings
│   │   ├── VoxChronicle.mjs   # Main singleton orchestrator
│   │   ├── Settings.mjs       # Foundry settings registration + validation
│   │   └── VocabularyDictionary.mjs  # Custom vocabulary for transcription
│   ├── audio/                 # Audio capture and manipulation
│   │   ├── AudioRecorder.mjs  # MediaRecorder wrapper, gapless capture
│   │   └── AudioChunker.mjs   # Split audio files > 25MB for API
│   ├── ai/                    # OpenAI service clients
│   │   ├── OpenAIClient.mjs   # Base API client (retry, queue, circuit breaker)
│   │   ├── TranscriptionService.mjs  # GPT-4o transcription with diarization
│   │   ├── TranscriptionFactory.mjs  # Factory for cloud/local/auto modes
│   │   ├── LocalWhisperService.mjs   # Local Whisper backend client
│   │   ├── WhisperBackend.mjs        # HTTP wrapper for whisper.cpp
│   │   ├── ImageGenerationService.mjs # gpt-image-1 image generation (base64)
│   │   └── EntityExtractor.mjs       # Extract NPCs/locations/items from text
│   ├── rag/                   # Retrieval-Augmented Generation (v3.0)
│   │   ├── RAGProvider.mjs    # Abstract interface for RAG backends
│   │   ├── RAGProviderFactory.mjs   # Factory for creating providers
│   │   ├── OpenAIFileSearchProvider.mjs  # OpenAI File Search implementation
│   │   └── RAGFlowProvider.mjs      # Self-hosted RAGFlow implementation
│   ├── narrator/              # Real-time DM assistant (Narrator Master port)
│   │   ├── AIAssistant.mjs    # Contextual suggestions with RAG context
│   │   ├── ChapterTracker.mjs # Chapter/scene tracking from journals
│   │   ├── CompendiumParser.mjs    # Parse compendiums for rules + chunking
│   │   ├── JournalParser.mjs       # Parse journals for story context + chunking
│   │   ├── RulesReference.mjs      # D&D rules Q&A with citations
│   │   ├── SceneDetector.mjs       # Scene type detection (combat, social, etc)
│   │   ├── SessionAnalytics.mjs    # Speaker participation, timeline, stats
│   │   ├── SilenceDetector.mjs     # Timer-based silence detection
│   │   ├── SilenceMonitor.mjs      # Companion to SilenceDetector
│   │   └── PromptBuilder.mjs       # Prompt construction utilities
│   ├── kanka/                 # Kanka.io integration
│   │   ├── KankaClient.mjs    # Base API client with rate limiting
│   │   ├── KankaService.mjs   # CRUD for journals, characters, locations, items
│   │   ├── KankaEntityManager.mjs  # Entity lifecycle (dedup, relationship tracking)
│   │   └── NarrativeExporter.mjs   # Format transcripts for Kanka journals
│   ├── orchestration/         # Workflow orchestration and processing
│   │   ├── SessionOrchestrator.mjs     # Dual-mode (live+chronicle) coordinator
│   │   ├── TranscriptionProcessor.mjs  # Transcription workflow
│   │   ├── EntityProcessor.mjs         # Entity extraction workflow
│   │   ├── ImageProcessor.mjs          # Image generation workflow
│   │   └── KankaPublisher.mjs          # Kanka publishing workflow
│   ├── ui/                    # UI Components (ApplicationV2)
│   │   ├── MainPanel.mjs      # 6-tab unified interface (singleton)
│   │   ├── SpeakerLabeling.mjs # Map speaker IDs to player names
│   │   ├── EntityPreview.mjs   # Review entities before Kanka publish
│   │   ├── RelationshipGraph.mjs # Visualize entity relationships
│   │   └── VocabularyManager.mjs # Manage custom vocabulary
│   ├── api/                   # Shared API client base classes
│   │   └── BaseAPIClient.mjs  # Auth, URL building, timeouts, rate limiting
│   ├── data/                  # Static data
│   │   └── dnd-vocabulary.mjs # D&D terminology dictionary
│   ├── utils/                 # Utilities and helpers
│   │   ├── Logger.mjs         # Module-prefixed logging with levels
│   │   ├── RateLimiter.mjs    # Request throttling with queue
│   │   ├── AudioUtils.mjs     # MIME detection, blob conversion
│   │   ├── SensitiveDataFilter.mjs  # Prevent API keys in logs
│   │   ├── HtmlUtils.mjs      # Sanitization and HTML formatting
│   │   ├── DomUtils.mjs       # DOM manipulation helpers
│   │   ├── CacheManager.mjs   # Generic TTL cache with invalidation
│   │   └── ErrorNotificationHelper.mjs # User-facing error notifications
│   └── vendor/                # Third-party code (if any)
├── templates/                 # Handlebars UI templates (.hbs)
│   ├── main-panel.hbs         # Unified 6-tab panel template
│   ├── recorder.hbs           # Recording controls
│   ├── speaker-labeling.hbs   # Speaker name mapping form
│   ├── entity-preview.hbs     # Entity review dialog
│   ├── relationship-graph.hbs # Relationship visualization
│   ├── vocabulary-manager.hbs # Vocabulary management
│   ├── analytics-tab.hbs      # Session analytics display
│   └── journal-picker.hbs     # Journal/chapter selection
├── styles/                    # CSS stylesheets
│   └── vox-chronicle.css      # All module styles (namespaced .vox-chronicle)
├── lang/                      # Localization files (JSON)
│   ├── en.json                # English (775+ keys)
│   ├── it.json                # Italian
│   ├── de.json                # German
│   ├── es.json                # Spanish
│   ├── fr.json                # French
│   ├── ja.json                # Japanese
│   ├── pt.json                # Portuguese
│   └── template.json          # Translation template for new languages
├── tests/                     # Test files (Vitest)
│   └── ...                    # 46+ test files, 3888+ tests
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md        # System design
│   ├── API_REFERENCE.md       # Service class documentation
│   ├── USER_GUIDE.md          # End-user instructions
│   ├── TESTING.md             # Testing guide
│   ├── CONTRIBUTING.md        # Contributor guidelines
│   ├── WHISPER_SETUP.md       # Local Whisper setup
│   ├── GPT4O_TRANSCRIBE_API.md # Diarization API specifics
│   └── plans/                 # Implementation plans
├── module.json                # Foundry VTT manifest
├── CLAUDE.md                  # AI development context
├── README.md                  # Project overview
├── CHANGELOG.md               # Version history
└── .gitleaksignore            # Secret scanning patterns
```

## Directory Purposes

**scripts/**
- Purpose: All ES6 module source code
- Contains: Service classes, UI, utilities, API clients
- Key files: `main.mjs` (entry point), `constants.mjs` (MODULE_ID)

**scripts/core/**
- Purpose: Core module initialization and configuration
- Contains: VoxChronicle singleton, Foundry settings, vocabulary
- Key files: `VoxChronicle.mjs` (service registry), `Settings.mjs` (setting definitions + validation)

**scripts/audio/**
- Purpose: Audio capture and file manipulation
- Contains: MediaRecorder wrapper, audio chunking for API limits
- Key files: `AudioRecorder.mjs` (gapless capture), `AudioChunker.mjs` (splits > 25MB)

**scripts/ai/**
- Purpose: OpenAI and alternative AI service clients
- Contains: Transcription, image generation, entity extraction
- Key files: `OpenAIClient.mjs` (base client with retry/queue), `TranscriptionService.mjs` (GPT-4o diarization)

**scripts/rag/**
- Purpose: Retrieval-augmented generation for campaign context
- Contains: Abstract interface and two implementations
- Key files: `RAGProvider.mjs` (interface), `OpenAIFileSearchProvider.mjs`, `RAGFlowProvider.mjs`

**scripts/narrator/**
- Purpose: Real-time DM assistance services
- Contains: Suggestions, rules lookup, analytics, scene detection
- Key files: `AIAssistant.mjs` (suggestion engine), `ChapterTracker.mjs` (narrative position)

**scripts/kanka/**
- Purpose: Kanka.io chronicle platform integration
- Contains: API client, entity CRUD, entity deduplication
- Key files: `KankaService.mjs` (high-level CRUD), `KankaClient.mjs` (API client)

**scripts/orchestration/**
- Purpose: High-level workflow coordination
- Contains: Session state machine, processor pipeline
- Key files: `SessionOrchestrator.mjs` (main coordinator), individual processors

**scripts/ui/**
- Purpose: Foundry VTT ApplicationV2 UI components
- Contains: MainPanel + auxiliary dialogs
- Key files: `MainPanel.mjs` (singleton, 6-tab interface)

**scripts/api/**
- Purpose: Shared HTTP client base functionality
- Contains: Authorization, URL building, timeout handling
- Key files: `BaseAPIClient.mjs` (extended by OpenAIClient, KankaClient)

**scripts/data/**
- Purpose: Static lookup data
- Contains: D&D terminology dictionary
- Key files: `dnd-vocabulary.mjs` (300+ D&D terms for transcription accuracy)

**scripts/utils/**
- Purpose: Cross-cutting utilities
- Contains: Logging, caching, validation, DOM helpers
- Key files: `Logger.mjs` (module-prefixed output), `RateLimiter.mjs` (throttling)

**templates/**
- Purpose: Handlebars UI templates
- Contains: Panel tabs, dialogs, forms
- Key files: `main-panel.hbs` (unified interface)

**styles/**
- Purpose: CSS styling (all namespaced)
- Contains: Panel, dialog, button, table styles
- Key files: `vox-chronicle.css` (single file, .vox-chronicle namespace)

**lang/**
- Purpose: Localization strings (7 languages + template)
- Contains: JSON translation keys
- Format: Nested by module section (VOXCHRONICLE.Settings, VOXCHRONICLE.Errors, etc)

**tests/**
- Purpose: Automated tests (Vitest)
- Contains: 46+ test files covering all services
- Key patterns: Mock `game` object, test happy path + error cases

## Key File Locations

**Entry Points:**
- `scripts/main.mjs`: Module initialization, hook registration, scene controls
- `scripts/core/VoxChronicle.mjs`: Service registry and lifecycle

**Configuration:**
- `module.json`: Foundry manifest (version, compatibility, entry point)
- `scripts/core/Settings.mjs`: Foundry setting registration
- `scripts/constants.mjs`: MODULE_ID constant (shared across all files)

**Core Logic:**
- `scripts/orchestration/SessionOrchestrator.mjs`: Session workflow coordinator
- `scripts/narrator/AIAssistant.mjs`: Suggestion engine (300+ lines, needs refactor)
- `scripts/ai/OpenAIClient.mjs`: Retry/queue/circuit-breaker base client
- `scripts/rag/RAGProvider.mjs`: Abstract interface for pluggable backends

**Testing:**
- `tests/core/VoxChronicle.test.mjs`: Singleton lifecycle tests
- `tests/orchestration/SessionOrchestrator.test.mjs`: Workflow state tests
- `tests/ai/OpenAIClient.test.mjs`: Retry/queue behavior tests

## Naming Conventions

**Files:**
- `.mjs` extension: All module files (ES6 modules)
- `.hbs` extension: Handlebars templates
- `.json` extension: Configuration and localization
- `.css` extension: Stylesheets
- `.test.mjs` suffix: Test files (Vitest pattern)
- PascalCase: All class files (e.g., `AudioRecorder.mjs`)
- kebab-case: Non-class utilities (e.g., `dnd-vocabulary.mjs`)

**Directories:**
- lowercase: All directory names (e.g., `scripts/ui/`, `scripts/kanka/`)
- Single-word focus: Directory names indicate subsystem (e.g., `audio`, `kanka`, `narrator`)

**Classes:**
- PascalCase: All class names (VoxChronicle, MainPanel, AudioRecorder)
- Descriptive: Names reflect responsibility (TranscriptionService, EntityExtractor, SilenceDetector)

**Methods:**
- camelCase: All method names
- Prefix `_` for private: `_getSetting()`, `_initializeRAGServices()`
- Static methods on singletons: `getInstance()`, `resetInstance()`
- Async methods: Always return Promise (use async/await)

**Constants:**
- UPPER_SNAKE_CASE: Global constants (e.g., `MODULE_ID`, `DEFAULT_TIMEOUT_MS`)
- camelCase: Local constants (e.g., `SESSION_STATE = {...}`)
- Enums: Object with string values (e.g., `RecordingState = { INACTIVE, RECORDING, PAUSED }`)

**Variables:**
- camelCase: All variable names
- Prefix `#` for private fields in classes: `#listenerController`, `#ragCachedStatus`
- Prefix `_` for private properties in older classes: `_logger`, `_audioChunks`

## Where to Add New Code

**New Feature (Major System):**
- Primary code: `scripts/[new-subsystem]/ServiceName.mjs`
- Integration: Register in `VoxChronicle.initialize()` (scripts/core/VoxChronicle.mjs)
- UI: Add component in `scripts/ui/` if needed, register in MainPanel actions
- Tests: `tests/[new-subsystem]/ServiceName.test.mjs`
- Localization: Add keys to all 8 lang files

**New Component/Module (Minor Feature):**
- Implementation: `scripts/[subsystem]/ComponentName.mjs`
- Example: EntityPreview, VocabularyManager in scripts/ui/
- No update to VoxChronicle needed if self-contained

**Utilities (Shared Helpers):**
- Shared utilities: `scripts/utils/UtilityName.mjs`
- API utilities: `scripts/api/ClientName.mjs` (extends BaseAPIClient)
- Export as named export, no default

**New Workflow Processor:**
- Location: `scripts/orchestration/NewProcessor.mjs`
- Pattern: Constructor takes config, async process() method
- Integration: SessionOrchestrator instantiates in constructor, calls in workflow
- Example: TranscriptionProcessor, EntityProcessor

**UI Dialog/Application:**
- Class: `scripts/ui/DialogName.mjs` (extends HandlebarsApplicationMixin(ApplicationV2))
- Template: `templates/dialog-name.hbs`
- Style: Add to `styles/vox-chronicle.css` with `.vox-chronicle-dialog-name` namespace
- Registration: Lazy-loaded in main.mjs tool handler or action callback

**Settings:**
- Registration: Add to `Settings.registerSettings()` in `scripts/core/Settings.mjs`
- Localization: Add name + hint keys to all 8 lang files
- Validation: Add validator if needed (e.g., Settings.validateOpenAIKey)
- Usage: `game.settings.get(MODULE_ID, 'settingKey')`

**Localization Keys:**
- Path: `lang/[lang].json` (en.json, it.json, de.json, es.json, fr.json, ja.json, pt.json)
- Hierarchy: VOXCHRONICLE > Section > Key (e.g., VOXCHRONICLE.Settings.OpenAIKey)
- Template: Use `lang/template.json` to document all keys
- Usage: `game.i18n.localize('VOXCHRONICLE.Key')` or `game.i18n.format('VOXCHRONICLE.Key', { var })`

## Special Directories

**tests/**
- Purpose: Automated test suite
- Generated: No
- Committed: Yes
- Framework: Vitest with jsdom environment
- Run: `npm test`
- Coverage: 46+ test files, 3888+ tests

**node_modules/**
- Purpose: Dependencies (not in git)
- Generated: Yes (via npm install)
- Committed: No
- Ignored by: .gitignore

**releases/**
- Purpose: Built distribution ZIPs
- Generated: Yes (by bash build.sh)
- Committed: No
- Contents: module.json + full codebase

**docs/**
- Purpose: Technical documentation
- Generated: No (manual)
- Committed: Yes
- Key files: ARCHITECTURE.md, API_REFERENCE.md, USER_GUIDE.md

**.planning/codebase/**
- Purpose: GSD analysis documents (this directory)
- Generated: Yes (by orchestrator)
- Committed: No
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md

**lang/**
- Purpose: Localization (JSON)
- Generated: No (manual)
- Committed: Yes
- Structure: VOXCHRONICLE > Section > Key

---

*Structure analysis: 2026-02-28*
