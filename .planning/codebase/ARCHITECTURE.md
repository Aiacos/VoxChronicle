# Architecture

**Analysis Date:** 2026-02-28

## Pattern Overview

**Overall:** Modular singleton-based service architecture with Foundry VTT hook-driven initialization and dual-mode orchestration (live + chronicle).

**Key Characteristics:**
- Singleton pattern for core VoxChronicle coordinator and UI panels (prevents resource conflicts)
- Service composition in SessionOrchestrator (no inheritance chains)
- Factory pattern for pluggable providers (TranscriptionFactory, RAGProviderFactory)
- Processor/orchestrator pattern for workflow management (TranscriptionProcessor, EntityProcessor, ImageProcessor, KankaPublisher)
- Strict module dependencies via ES6 imports (no circular dependencies)
- Foundry VTT ApplicationV2 + HandlebarsApplicationMixin for UI

## Layers

**Presentation Layer (UI):**
- Purpose: User interface and interaction handling
- Location: `scripts/ui/`, `templates/`, `styles/vox-chronicle.css`
- Contains: ApplicationV2 subclasses, Handlebars templates, CSS styling
- Depends on: Core services, utils
- Used by: Foundry VTT scene controls, user actions

**Orchestration Layer (Workflow):**
- Purpose: High-level session management and process coordination
- Location: `scripts/orchestration/` (SessionOrchestrator, TranscriptionProcessor, EntityProcessor, ImageProcessor, KankaPublisher)
- Contains: Workflow state machines, processor pipelines
- Depends on: AI services, Kanka service, audio capture
- Used by: VoxChronicle singleton, UI event handlers

**Core Service Layer (Business Logic):**
- Purpose: Primary module functionality and coordination
- Location: `scripts/core/` (VoxChronicle singleton, Settings, VocabularyDictionary)
- Contains: Service instantiation, configuration, initialization
- Depends on: All other service layers
- Used by: Main entry point, UI, external hooks

**Narrator Service Layer (Real-Time AI):**
- Purpose: Live DM assistance (suggestions, rules, scene detection, analytics)
- Location: `scripts/narrator/`
- Contains: AIAssistant, ChapterTracker, SceneDetector, SessionAnalytics, RulesReference, CompendiumParser, JournalParser, PromptBuilder, SilenceDetector
- Depends on: OpenAI client, RAG provider, Foundry journals/compendiums
- Used by: SessionOrchestrator (live mode), MainPanel

**AI & Transcription Layer:**
- Purpose: Audio processing and OpenAI service integration
- Location: `scripts/ai/` (TranscriptionService, ImageGenerationService, EntityExtractor, OpenAIClient, TranscriptionFactory, LocalWhisperService)
- Contains: API clients, service implementations, chunking logic
- Depends on: HTTP clients, audio utilities
- Used by: Processors, orchestrators

**Audio Layer:**
- Purpose: Media stream capture and audio manipulation
- Location: `scripts/audio/` (AudioRecorder, AudioChunker)
- Contains: MediaRecorder wrapper, audio splitting logic
- Depends on: Utilities (Logger, AudioUtils)
- Used by: SessionOrchestrator, MainPanel

**RAG/Retrieval Layer (Retrieval-Augmented Generation):**
- Purpose: Document indexing and semantic search for campaign context
- Location: `scripts/rag/` (RAGProvider abstract, OpenAIFileSearchProvider, RAGFlowProvider, RAGProviderFactory)
- Contains: Pluggable provider interfaces
- Depends on: OpenAI client (OpenAIFileSearchProvider), external RAGFlow API (RAGFlowProvider)
- Used by: AIAssistant, VoxChronicle initialization

**Kanka Integration Layer:**
- Purpose: Chronicle publication and entity management
- Location: `scripts/kanka/` (KankaService, KankaClient, KankaEntityManager, NarrativeExporter)
- Contains: API client, entity CRUD, narrative formatting
- Depends on: HTTP client, entity extraction results
- Used by: KankaPublisher processor

**Utilities Layer:**
- Purpose: Cross-cutting concerns and shared helpers
- Location: `scripts/utils/` (Logger, RateLimiter, AudioUtils, HtmlUtils, DomUtils, CacheManager, SensitiveDataFilter, ErrorNotificationHelper)
- Contains: Logging, rate limiting, data validation, DOM manipulation
- Depends on: Foundry API (minimally)
- Used by: Every service

**API Base Layer:**
- Purpose: Shared HTTP client functionality
- Location: `scripts/api/` (BaseAPIClient)
- Contains: Authorization, URL building, timeout management
- Depends on: Utilities
- Used by: OpenAIClient, KankaClient

**Data & Constants:**
- Purpose: Static configuration and vocabulary
- Location: `scripts/constants.mjs`, `scripts/data/dnd-vocabulary.mjs`, `scripts/core/Settings.mjs`
- Contains: Module ID, D&D vocabulary dictionary, setting definitions
- Depends on: Minimal (constants.mjs is dependency-free)
- Used by: All modules

## Data Flow

**Chronicle Mode (Post-Session Publishing):**

1. User starts session recording in MainPanel
2. AudioRecorder captures microphone/WebRTC stream via MediaRecorder
3. When processing triggered:
   - TranscriptionProcessor calls OpenAI GPT-4o-transcribe-diarize API
   - Returns diarized transcript with speaker labels (SPEAKER_00, SPEAKER_01, etc.)
4. Transcript is chunked if > 25MB via AudioChunker
5. EntityExtractor analyzes text with gpt-4o-turbo to extract NPCs/locations/items
6. ImageGenerationService generates portraits using gpt-image-1 for entities (base64 → Blob)
7. Entities reviewed in EntityPreview dialog (speaker mapping, deduplication)
8. KankaPublisher creates entities in Kanka campaign:
   - NarrativeExporter formats transcript as journal entry
   - Characters created for extracted NPCs
   - Locations created for extracted places
   - Items created for extracted objects
9. Generated images uploaded to Kanka entity portraits

**Live Mode (Real-Time DM Assistance):**

1. SessionOrchestrator starts live listening
2. AudioRecorder captures live audio chunks (batches every 10s)
3. TranscriptionProcessor continuously transcribes chunk batch
4. AIAssistant analyzes transcript with RAG context:
   - Queries RAG index (OpenAI File Search or RAGFlow) for campaign knowledge
   - Detects scene type via SceneDetector
   - Checks for off-track players
   - Generates contextual suggestions (narration, dialogue, rules Q&A)
5. SilenceDetector triggers suggestions during GM pauses (30s silence)
6. ChapterTracker updates from active Foundry scene
7. SessionAnalytics records speaker participation, session timeline
8. RulesReference handles D&D mechanic lookups from compendium/journal content

**RAG Pipeline (Document Indexing):**

1. User selects journals/compendiums in MainPanel
2. JournalParser extracts text + metadata from journal entries
3. CompendiumParser extracts text + metadata from compendium documents
4. TextChunking splits long entries (RAGProvider-specific)
5. RAGProvider.indexDocuments() indexes chunks:
   - OpenAIFileSearchProvider: uploads to OpenAI with file_search enabled
   - RAGFlowProvider: sends to self-hosted RAGFlow server
6. Vector store ID persisted in settings for reuse
7. AIAssistant.setRAGProvider() connects provider for queries

**State Management:**

- SessionOrchestrator maintains session state (IDLE, RECORDING, PROCESSING, LIVE_LISTENING, etc.)
- VoxChronicle singleton holds service references (never recreated, updated on settings change)
- MainPanel maintains UI state (active tab, button states, progress)
- ChapterTracker caches current chapter
- RAG status cached in MainPanel with update timer

## Key Abstractions

**VoxChronicle (Singleton):**
- Purpose: Central service registry and lifecycle manager
- Examples: `scripts/core/VoxChronicle.mjs`
- Pattern: Singleton with static getInstance() and resetInstance()
- Initializes on 'ready' hook, reinitializes on settings change
- Maintains references to all subsystems

**SessionOrchestrator (Dual-Mode):**
- Purpose: Session workflow coordination
- Examples: `scripts/orchestration/SessionOrchestrator.mjs`
- Pattern: State machine with callbacks (onStateChange, onProgress, onError)
- Methods: startSession (chronicle), startLiveMode (real-time), stopSession
- Composition: wraps processors (TranscriptionProcessor, EntityProcessor, ImageProcessor, KankaPublisher)

**RAGProvider (Abstract Interface):**
- Purpose: Pluggable backend abstraction
- Examples: `scripts/rag/RAGProvider.mjs` (abstract), OpenAIFileSearchProvider, RAGFlowProvider
- Pattern: Abstract base class, factory-created
- Methods: initialize(), indexDocuments(), query(), getStatus()
- Implementations swappable via setting

**Processors:**
- Purpose: Encapsulate workflow steps
- Examples: TranscriptionProcessor, EntityProcessor, ImageProcessor, KankaPublisher
- Pattern: Each wraps specific service behavior, called sequentially by orchestrator
- Enables: Modularity, testability, reusability

**API Clients (Composition):**
- Purpose: Service-specific API interactions
- Examples: OpenAIClient, KankaClient (extends BaseAPIClient)
- Pattern: Inheritance from BaseAPIClient, composition with RateLimiter
- Features: Retry with exponential backoff, request queue, circuit breaker

**ApplicationV2 UI (Singleton):**
- Purpose: Unified tabbed interface
- Examples: MainPanel, SpeakerLabeling, VocabularyManager, RelationshipGraph
- Pattern: Singleton with getInstance(), static action handlers
- Lifecycle: Lazy-loaded, check foundry.applications.instances before rendering

## Entry Points

**Module Initialization (`scripts/main.mjs`):**
- Triggers: Foundry VTT lifecycle hooks (init, ready, canvasReady, getSceneControlButtons)
- Responsibilities:
  - init hook: Register settings
  - ready hook: Initialize VoxChronicle singleton
  - getSceneControlButtons: Register scene toolbar controls
  - renderSettingsConfig: Inject validation buttons + campaign dropdown

**Scene Controls:**
- Location: Foundry scene toolbar (microphone icon)
- Tools: panel, speakerLabels, vocabulary, relationshipGraph, settings
- Pattern: Each tool's onClick handler uses toggle pattern (close if open, open if closed)
- Uses foundry.applications.instances.get() to check render state

**UI Actions:**
- MainPanel actions (configured in DEFAULT_OPTIONS.actions):
  - toggle-recording: Start/stop audio recording
  - toggle-pause: Pause/resume session
  - process-session: Trigger transcription → entity extraction → image generation
  - publish-kanka: Upload entities to Kanka
  - generate-image: Generate single character portrait
  - review-entities: Open entity preview dialog
  - rag-build-index: Trigger RAG indexing
  - rag-clear-index: Clear RAG vector store

## Error Handling

**Strategy:** Try-catch with user-facing notifications + logging

**Patterns:**
- Custom error classes: OpenAIError, KankaError (extend Error, add type + status)
- OpenAIError.isRetryable property gates retry logic
- ErrorNotificationHelper provides consistent UI notifications
- Logger.error() always called before throwing
- SensitiveDataFilter prevents API keys in logs

**Common Error Scenarios:**
- Missing API key: Caught in VoxChronicle._getSetting(), logged as warn, service set to null
- 429 Rate Limit: OpenAIClient detects, retries with backoff
- Transcription timeout: Returns error, caught by TranscriptionProcessor, UI notified
- Image generation failure: EntityProcessor catches, marks entity, continues processing

## Cross-Cutting Concerns

**Logging:** Logger.createChild('ModuleName') provides module-prefixed output with sanitization
**Validation:** Settings.validateOpenAIKey(), Settings.validateKankaToken() (in main.mjs validation buttons)
**Authentication:** BaseAPIClient._buildAuthHeaders() centralizes Bearer token logic
**Rate Limiting:** RateLimiter with sliding window throttles requests (30/min for Kanka, 10/min for OpenAI)
**Localization:** All UI strings use game.i18n.localize('VOXCHRONICLE.Key') for 7-language support
**Data Sanitization:** SensitiveDataFilter strips API keys from logs, HtmlUtils sanitizes user input

---

*Architecture analysis: 2026-02-28*
