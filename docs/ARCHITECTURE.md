# VoxChronicle Architecture Documentation

This document describes the system architecture, components, and data flow of the VoxChronicle Foundry VTT module.

**Last updated:** 2026-03-14 (v3.2.0 — Epic 4)

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Map](#component-map)
4. [Service Layers](#service-layers)
5. [Dual-Mode Operation](#dual-mode-operation)
6. [RAG Architecture](#rag-architecture)
7. [Data Flow](#data-flow)
8. [Module Initialization](#module-initialization)
9. [EventBus Architecture](#eventbus-architecture)
10. [UI Architecture](#ui-architecture)
11. [Design Patterns](#design-patterns)
12. [External Integrations](#external-integrations)
13. [Security Considerations](#security-considerations)
14. [Error Handling Strategy](#error-handling-strategy)
15. [v3.0-3.2 Changes](#v30-32-changes-released-2026-02-19-to-2026-03-14)

---

## System Overview

VoxChronicle is a Foundry VTT module that provides AI-powered session transcription, real-time DM assistance, and Kanka chronicle publishing. The module operates in two modes:

- **Live Mode**: Real-time AI assistance during gameplay — narration suggestions, off-track detection, NPC dialogue, rules Q&A, scene detection, and session analytics
- **Chronicle Mode**: Post-session workflow — audio transcription, entity extraction, image generation, and Kanka publishing

### Key Technologies

| Component | Technology |
|-----------|------------|
| Platform | Foundry VTT v13 |
| Language | JavaScript ES6+ (`.mjs` modules) |
| UI Framework | ApplicationV2 + HandlebarsApplicationMixin |
| Templates | Handlebars (.hbs) |
| Transcription | OpenAI GPT-4o-transcribe-diarize |
| Image Generation | gpt-image-1 (base64 responses) |
| RAG | Modular RAGProvider: OpenAI File Search + RAGFlow (v3.0) |
| Campaign Management | Kanka.io API v1.0 |
| Styling | CSS with BEM-style `.vox-chronicle` namespace |
| Testing | Vitest with jsdom (5151 tests across 69 files) |

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           FOUNDRY VTT CLIENT (v13)                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        VoxChronicle Module                             │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐   │  │
│  │  │   UI Layer   │  │ Orchestration │  │    Core Services         │   │  │
│  │  │              │  │               │  │                          │   │  │
│  │  │ MainPanel    │  │  Session      │  │ VoxChronicle (Singleton) │   │  │
│  │  │ EntityPreview│◄─┤  Orchestrator ├─►│ Settings                 │   │  │
│  │  │ SpeakerLabel │  │  (dual-mode)  │  │ VocabularyDictionary     │   │  │
│  │  │ RelGraph     │  │               │  │                          │   │  │
│  │  │ VocabMgr     │  │ Processors:   │  └──────────────────────────┘   │  │
│  │  └──────┬───────┘  │ Transcription │                                  │  │
│  │         │          │ Entity        │                                  │  │
│  │         ▼          │ Image         │                                  │  │
│  │  ┌─────────────────┤ KankaPublish  │                                  │  │
│  │  │  Service Layer  └───────┬───────┘                                  │  │
│  │  │                         │                                          │  │
│  │  │  ┌──────────┐ ┌────────┴─────┐ ┌──────────────┐ ┌─────────────┐  │  │
│  │  │  │  Audio   │ │AI Providers  │ │   Narrator   │ │    Kanka    │  │  │
│  │  │  │          │ │              │ │              │ │             │  │  │
│  │  │  │ Recorder │ │ChatProvider  │ │ AIAssistant  │ │ KankaClient │  │  │
│  │  │  │ Chunker  │ │Transcription │ │ SceneDetect  │ │ KankaService│  │  │
│  │  │  │          │ │ImageProvider │ │ ChapterTrack │ │ EntityMgr   │  │  │
│  │  │  │          │ │EmbedProvider │ │ RulesRef     │ │ Narrative   │  │  │
│  │  │  │          │ │CachingDec.   │ │ Analytics    │ │  Exporter   │  │  │
│  │  │  │          │ │ProviderReg.  │ │ SilenceDetect│ │             │  │  │
│  │  │  └──────────┘ └──────────────┘ └──────────────┘ └─────────────┘  │  │
│  │  │                                                                    │  │
│  │  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │  │  RAG: RAGProvider (abstract) → OpenAIFileSearchProvider,    │  │  │
│  │  │  │       RAGFlowProvider, RAGProviderFactory                   │  │  │
│  │  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │  │                                                                    │  │
│  │  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │  │  Utils: Logger, RateLimiter, AudioUtils, CacheManager,      │  │  │
│  │  │  │         HtmlUtils, DomUtils, SensitiveDataFilter, EventBus  │  │  │
│  │  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │  └────────────────────────────────────────────────────────────────────┘  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                │                                    │
                ▼                                    ▼
┌──────────────────────────────┐  ┌──────────────────────────────────────────┐
│        OpenAI API            │  │             Kanka API                    │
│                              │  │                                          │
│  • Audio Transcription       │  │  • Campaign Management                   │
│  • Speaker Diarization       │  │  • Journal CRUD (chronicles)             │
│  • Entity Extraction (GPT-4o)│  │  • Character/Location/Item CRUD         │
│  • Image Gen (gpt-image-1)   │  │  • Image Upload                         │
│  • File Search (RAG)         │  │  • Rate Limited: 30/90 req/min          │
│  • Chat (GPT-4o-mini)        │  │                                          │
│                              │  │  Endpoint: api.kanka.io/1.0              │
│  Endpoint: api.openai.com/v1 │  │                                          │
└──────────────────────────────┘  └──────────────────────────────────────────┘
```

---

## Component Map

49 source files across 9 directories:

```
scripts/
├── main.mjs                          # Entry point: Hooks, scene controls
├── constants.mjs                     # MODULE_ID (dependency-free leaf)
│
├── core/                             # Singletons and configuration
│   ├── VoxChronicle.mjs              # Main singleton, service orchestration
│   ├── Settings.mjs                  # 40+ Foundry settings registration
│   └── VocabularyDictionary.mjs      # Custom vocabulary for transcription
│
├── audio/                            # Audio capture and processing
│   ├── AudioRecorder.mjs             # MediaRecorder wrapper, WebRTC/mic, level metering
│   └── AudioChunker.mjs             # Split >25MB files for API limit
│
├── ai/                               # AI providers and services
│   ├── OpenAIClient.mjs              # Base client: auth, retry, queue, circuit breaker
│   ├── providers/                    # AI provider interfaces (v3.1)
│   │   ├── ChatProvider.mjs          # Abstract chat interface
│   │   ├── TranscriptionProvider.mjs # Abstract transcription interface
│   │   ├── ImageProvider.mjs         # Abstract image generation interface
│   │   ├── EmbeddingProvider.mjs     # Abstract embedding interface
│   │   ├── OpenAIChatProvider.mjs    # OpenAI chat implementation
│   │   ├── OpenAITranscriptionProvider.mjs # OpenAI transcription implementation
│   │   ├── OpenAIImageProvider.mjs   # OpenAI image generation implementation
│   │   ├── OpenAIEmbeddingProvider.mjs # OpenAI embedding implementation
│   │   ├── CachingChatDecorator.mjs  # L2 caching for chat responses
│   │   ├── CachingEmbeddingDecorator.mjs # L2 caching for embeddings
│   │   ├── ProviderRegistry.mjs      # Service locator for providers
│   │   └── ProviderFactory.mjs       # Factory for creating providers
│   ├── TranscriptionService.mjs      # GPT-4o-transcribe-diarize, speaker mapping
│   ├── TranscriptionFactory.mjs      # Cloud/local/auto mode factory
│   ├── LocalWhisperService.mjs       # Local Whisper backend client
│   ├── WhisperBackend.mjs            # HTTP client for whisper.cpp server
│   ├── ImageGenerationService.mjs    # gpt-image-1, base64 responses
│   └── EntityExtractor.mjs           # GPT-4o entity extraction + salient moments
│
├── rag/                              # Modular RAG provider system (v3.0)
│   ├── RAGProvider.mjs               # Abstract base class (interface)
│   ├── RAGProviderFactory.mjs        # Factory for creating providers
│   ├── OpenAIFileSearchProvider.mjs  # OpenAI Responses API + file_search
│   └── RAGFlowProvider.mjs           # Self-hosted RAGFlow API integration
│
├── narrator/                         # Real-time DM assistant services
│   ├── AIAssistant.mjs               # Contextual suggestions with RAG injection
│   ├── ChapterTracker.mjs            # Chapter/scene tracking from journals
│   ├── CompendiumParser.mjs          # Parse compendiums for rules + text chunking
│   ├── JournalParser.mjs             # Parse journals for story + text chunking
│   ├── RulesReference.mjs            # D&D rules Q&A with citations
│   ├── SceneDetector.mjs             # Scene type: combat/social/exploration/rest
│   ├── SessionAnalytics.mjs          # Speaker participation, timeline, stats
│   └── SilenceDetector.mjs           # Timer-based silence detection
│
├── kanka/                            # Kanka campaign management
│   ├── KankaClient.mjs               # Base client with rate limiting
│   ├── KankaService.mjs              # CRUD: journals, characters, locations, items
│   ├── KankaEntityManager.mjs        # Entity lifecycle management
│   └── NarrativeExporter.mjs         # Format transcripts as Kanka journals
│
├── orchestration/                    # Workflow coordination
│   ├── SessionOrchestrator.mjs       # Dual-mode: live + chronicle workflows
│   ├── TranscriptionProcessor.mjs    # Audio → transcript workflow
│   ├── EntityProcessor.mjs           # Transcript → entities workflow
│   ├── ImageProcessor.mjs            # Entities → images workflow
│   └── KankaPublisher.mjs            # Entities + images → Kanka workflow
│
├── ui/                               # ApplicationV2 UI components
│   ├── MainPanel.mjs                 # 6-tab floating panel (singleton) with PARTS pattern
│   ├── EntityPreview.mjs             # Entity review before Kanka publish
│   ├── SpeakerLabeling.mjs           # Speaker ID → player name mapping
│   ├── RelationshipGraph.mjs         # vis-network entity relationship graph
│   ├── VocabularyManager.mjs         # Custom vocabulary management
│   ├── TranscriptReview.mjs          # Inline transcript editing with speaker colors
│   └── StreamController.mjs          # Streaming UI component for AI responses
│
├── data/
│   └── dnd-vocabulary.mjs            # Built-in D&D vocabulary
│
└── utils/                            # Shared utilities
    ├── Logger.mjs                    # Module-prefixed logging
    ├── RateLimiter.mjs               # Request throttling with queue
    ├── AudioUtils.mjs                # MIME detection, blob conversion
    ├── CacheManager.mjs              # Generic cache with TTL
    ├── HtmlUtils.mjs                 # HTML sanitization
    ├── DomUtils.mjs                  # DOM manipulation helpers
    ├── SensitiveDataFilter.mjs       # Filter API keys from logs
    └── EventBus.mjs                  # Typed channels with middleware pipeline
```

---

## Service Layers

### Layer 1: Entry Point (`main.mjs`)

Registers Foundry hooks and scene control buttons:

```javascript
Hooks.once('init', () => Settings.registerSettings());
Hooks.once('ready', async () => await VoxChronicle.getInstance().initialize());
Hooks.on('getSceneControlButtons', (controls) => { /* v13 object format */ });
```

### Layer 2: Core (`core/`)

- **VoxChronicle** — Singleton that owns all service instances and manages lifecycle
- **Settings** — 40+ Foundry settings (API keys, campaign ID, RAG config, UI preferences)
- **VocabularyDictionary** — Custom vocabulary for transcription accuracy

### Layer 3: Audio (`audio/`)

**EventBus Integration (Epic 3):**
- **EventBus Channels** — `audio:recordingStarted`, `audio:recordingStopped`, `audio:chunkReady`, `audio:error`, `audio:levelChange`, `audio:chunkingStarted`, `audio:chunkCreated`, `audio:chunkingComplete`
- **AudioRecorder** — MediaRecorder wrapper with Safari codec fallback (MP4/AAC), crash recovery via IndexedDB, WebRTC peer capture. Uses **Header Injection** strategy for gapless capture. Emits events for recording lifecycle.
- **AudioChunker** — Splits audio >25MB for OpenAI API limit. Emits chunking progress events.

### Layer 4: AI Services (`ai/`)

**Provider Architecture (v3.1):**
- **Provider Interfaces** — `ChatProvider`, `TranscriptionProvider`, `ImageProvider`, `EmbeddingProvider` define abstract API
- **OpenAI Implementations** — `OpenAIChatProvider`, `OpenAITranscriptionProvider`, `OpenAIImageProvider`, `OpenAIEmbeddingProvider` handle API calls
- **Caching Decorators** — `CachingChatDecorator`, `CachingEmbeddingDecorator` provide L2 caching layer
- **ProviderRegistry** — Service locator for accessing providers by type
- **ProviderFactory** — Creates providers based on configuration

**Services (use composition with providers):**
- **OpenAIClient** — Base client with Bearer auth, exponential backoff + jitter retry, sequential request queue, circuit breaker
- **TranscriptionService** — Receives `TranscriptionProvider`, handles speaker mapping, chunking, diarization
- **ImageGenerationService** — Receives `ImageProvider`, handles prompt generation, gallery management, caching
- **EntityExtractor** — Receives `ChatProvider`, handles entity extraction, JSON parsing, salient moments
- **TranscriptionFactory** — Factory for cloud/local/auto transcription modes
- **LocalWhisperService** / **WhisperBackend** — Local Whisper backend for offline transcription

### Layer 5: RAG System (`rag/`)

Modular RAG provider architecture (v3.0):

- **RAGProvider** — Abstract base class defining the RAG interface (initialize, indexDocuments, query, destroy)
- **RAGProviderFactory** — Factory for creating providers by type (`openai-file-search`, `ragflow`)
- **OpenAIFileSearchProvider** — Default provider using OpenAI Responses API + `file_search` tool (auto-chunking, hosted vector store, reranking)
- **RAGFlowProvider** — Alternative provider for self-hosted RAGFlow instances (dataset management, document upload/parsing, OpenAI-compatible chat)

### Layer 6: Narrator Services (`narrator/`)

Real-time DM assistant services for Live Mode:

- **AIAssistant** — Contextual suggestions (narration, dialogue, action, reference) using `ChatProvider`, RAG context injection via `ragProvider.query()`. Accepts `sceneType` in `analyzeContext()` options, syncs scene state to PromptBuilder via `_syncPromptBuilderState()`
- **PromptBuilder** — Constructs system prompts for AIAssistant. `setSceneType()` adds `CURRENT SCENE TYPE` section when scene type is known
- **ChapterTracker** — Track current chapter/scene from Foundry journal entries
- **CompendiumParser** — Parse Foundry compendiums for rules content + text chunking for RAG
- **JournalParser** — Parse Foundry journals for story context + text chunking for RAG
- **RulesReference** — D&D rules Q&A with compendium citations. Supports `chatProvider` option (preferred over `openaiClient`) for synthesis phase, using `ChatProvider.chat()` with fallback to `OpenAIClient.post()`
- **SceneDetector** — Detect scene type (combat, social, exploration, rest) from transcript
- **SessionAnalytics** — Speaker participation, timeline, session statistics
- **SilenceDetector** — Timer-based silence detection for auto-triggering AI suggestions

### Layer 7: Kanka Services (`kanka/`)

- **KankaClient** — Base client with Bearer auth, rate limiting (30/90 req/min)
- **KankaService** — CRUD for journals, characters, locations, items; image upload; entity search
- **KankaEntityManager** — Entity lifecycle: create-if-not-exists, batch create, cache
- **NarrativeExporter** — Format transcripts as Kanka journal entries (transcript/narrative/summary/full)

### Layer 8: Orchestration (`orchestration/`)

- **SessionOrchestrator** — Dual-mode workflow coordinator (live + chronicle). Live mode includes `_updateSceneType(text)` for scene transition detection, `_getAdaptiveBatchDuration()` for speech-adaptive cycle timing (5s-60s), `_emitSafe()` for fire-and-forget EventBus emission, and `getCurrentSceneType()` public getter. Emits `session:liveStarted`, `session:liveStopped`, `ai:suggestionReceived`, `ai:ragIndexingStarted`, `ai:ragIndexingComplete`, `scene:changed` events
- **TranscriptionProcessor** — Audio → transcript with auto-fallback (cloud/local). Emits: `ai:transcriptionStarted`, `ai:transcriptionReady`, `ai:transcriptionError`, `ai:speakersDetected`. Auto-applies saved speaker labels and registers new speakers.
- **EntityProcessor** — Transcript → extracted entities
- **ImageProcessor** — Entities/moments → generated images
- **KankaPublisher** — Journal + entities + images → Kanka

### Layer 9: UI (`ui/`)

All components use ApplicationV2 + HandlebarsApplicationMixin (v13) with PARTS pattern:

- **MainPanel** — Singleton 6-tab floating panel with PARTS: `main`, `liveMode`, `chronicleMode`, `images`, `transcript`, `entities`, `analytics`. TranscriptReview part with inline editing and speaker color coding. EventBus integration listens to `ai:transcriptionReady` (transcript updates), `ai:ragIndexingStarted`/`ai:ragIndexingComplete` (RAG status), and displays scene badge in live mode (combat=red, social=blue, exploration=green, rest=amber).
- **TranscriptReview** — Inline transcript editor with speaker colors, segment playback, speaker remapping
- **EntityPreview** — Review and select entities before Kanka publish
- **SpeakerLabeling** — Map speaker IDs to player names with inline rename, opened from MainPanel with onClose callback
- **RelationshipGraph** — vis-network entity relationship visualization
- **VocabularyManager** — Manage custom vocabulary dictionaries
- **StreamController** — Streaming UI component for real-time AI responses

### Layer 10: Utilities (`utils/`)

- **Logger** — Module-prefixed logging with child loggers and log levels
- **RateLimiter** — Sliding window throttling with queue and presets
- **AudioUtils** — MIME detection, blob conversion, duration estimation
- **CacheManager** — Generic cache with TTL and invalidation
- **HtmlUtils** — HTML sanitization and escaping
- **DomUtils** — DOM manipulation helpers
- **SensitiveDataFilter** — Strip API keys from log output
- **EventBus** — Typed channels with middleware pipeline for pub/sub across services

---

## Dual-Mode Operation

### Live Mode

Real-time AI assistance during gameplay with adaptive cycle timing:

```
┌─────────────────────────────────────────────────────────────────┐
│              LIVE MODE CYCLE (adaptive: 5s–60s)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   _getAdaptiveBatchDuration()                                   │
│   • High speech activity → shorter cycles (~5s)                 │
│   • Low speech activity → longer cycles (~60s)                  │
│          │                                                       │
│          ▼                                                       │
│   AudioRecorder.getLatestChunk()                                │
│          │                                                       │
│          ▼                                                       │
│   TranscriptionService.transcribe(chunk)                        │
│          │                                                       │
│          ├──► _updateSceneType(text)                             │
│          │      └─► SceneDetector.detectSceneTransition(text)   │
│          │      └─► if transition: _emitSafe('scene:changed',   │
│          │           { sceneType, previousType, confidence })    │
│          │      └─► AIAssistant cache invalidation              │
│          │                                                       │
│          ├──► SessionAnalytics.addSegment(segments)             │
│          ├──► ChapterTracker.update(text)                       │
│          │                                                       │
│          ▼                                                       │
│   AIAssistant.analyzeContext({                                   │
│     transcript, sceneType, chapter, ragContext                  │
│   })                                                             │
│   • sceneType synced to PromptBuilder via _syncPromptBuilderState() │
│   • PromptBuilder adds CURRENT SCENE TYPE section to system prompt  │
│          │                                                       │
│          ▼                                                       │
│   _emitSafe('ai:suggestionReceived', { suggestion })            │
│          │                                                       │
│          ▼                                                       │
│   MainPanel.render() ◄── suggestions, scene badge, RAG status  │
│   • Scene badge: combat=red, social=blue,                       │
│     exploration=green, rest=amber                                │
│                                                                  │
│   [Cycle repeats with adaptive interval]                        │
└─────────────────────────────────────────────────────────────────┘
```

**EventBus events emitted during live mode:**
- `session:liveStarted` / `session:liveStopped` — Live mode lifecycle
- `ai:suggestionReceived` — New AI suggestion available
- `ai:ragIndexingStarted` / `ai:ragIndexingComplete` — RAG indexing status
- `scene:changed` — Scene type transition detected (includes `sceneType`, `previousType`, `confidence`, `timestamp`)

Services used: AudioRecorder, TranscriptionService, AIAssistant, SceneDetector, ChapterTracker, SessionAnalytics, SilenceDetector, RAGProvider, RulesReference, PromptBuilder

### Chronicle Mode

Post-session publishing workflow:

```
Record → Transcribe → Extract Entities → Generate Images → Publish to Kanka
```

Services used: AudioRecorder, TranscriptionProcessor, EntityProcessor, ImageProcessor, KankaPublisher

---

## RAG Architecture

### Current (v3.0): Modular RAG Provider

```
RAGProvider (abstract interface)
├── initialize(config)
├── indexDocuments(documents)
├── query(question, options) → {answer, sources}
├── clearIndex()
└── getStatus()

OpenAIFileSearchProvider (default)           RAGFlowProvider (self-hosted)
├── Creates vector store via OpenAI API      ├── Creates dataset + chat assistant
├── Uploads documents as files               ├── Uploads documents with parsing
├── Queries via Responses API + file_search  ├── Queries via OpenAI-compatible chat
└── Auto-chunking (800 tokens) + reranking   └── Polls for document processing status
```

**Data flow:**
```
JournalParser / CompendiumParser
    │ (produces RAGDocument[]: {id, title, content, metadata})
    ▼
RAGProviderFactory.create(providerType, config)
    │ (creates OpenAIFileSearchProvider or RAGFlowProvider)
    ▼
ragProvider.indexDocuments(documents)
    │ (provider handles chunking, embedding, storage)
    ▼
AIAssistant → ragProvider.query(question) → {answer, sources}
    │ (injects RAG context into GPT-4o-mini prompt)
```

### Previous (v2.x): Custom Vector Store (removed)

The v2.x RAG stack (EmbeddingService, RAGVectorStore, RAGRetriever) was removed in v3.0.
See `docs/plans/2026-02-19-v3-rewrite-plan.md` for migration details.

---

## Data Flow

### Complete Chronicle Session

```
┌─────────────────────────────────────────────────────────────────┐
│                      RECORDING PHASE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User clicks "Start Recording"                                 │
│          │                                                       │
│          ▼                                                       │
│   AudioRecorder.startRecording({source, echoCancellation})      │
│          │                                                       │
│   MediaRecorder API → audio chunks (10s intervals)              │
│          │                                                       │
│   User clicks "Stop Recording"                                  │
│          │                                                       │
│          ▼                                                       │
│   AudioRecorder.stopRecording() → Audio Blob (WebM/Opus)       │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSCRIPTION PHASE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   AudioChunker.splitIfNeeded(blob) → chunks (≤25MB each)       │
│          │                                                       │
│          ▼                                                       │
│   TranscriptionService.transcribe(chunk, {                      │
│     model: 'gpt-4o-transcribe-diarize',                        │
│     response_format: 'diarized_json',                           │
│     speakerMap                                                   │
│   })                                                             │
│          │                                                       │
│          ▼                                                       │
│   Mapped Transcript: {                                           │
│     text, segments: [{speaker, text, start, end}],              │
│     speakers: [{id, name, isMapped}]                            │
│   }                                                              │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTRACTION PHASE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   EntityExtractor.extractEntities(text, {existingEntities})     │
│          │  (GPT-4o, structured JSON output)                    │
│          ▼                                                       │
│   { characters: [{name, desc, isNPC}],                          │
│     locations: [{name, desc, type}],                            │
│     items: [{name, desc, type}] }                               │
│                                                                  │
│   EntityExtractor.identifySalientMoments(text, {maxMoments: 3})│
│          │                                                       │
│          ▼                                                       │
│   [{ title, imagePrompt, context, dramaScore }]                 │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  IMAGE GENERATION PHASE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ImageGenerationService.generatePortrait(type, desc, {         │
│     model: 'gpt-image-1',                                       │
│     size: '1024x1024',                                          │
│     quality: 'medium'                                            │
│   })                                                             │
│          │                                                       │
│          ▼                                                       │
│   { b64_json: '...' }  ← base64 PNG (NOT a URL)                │
│          │                                                       │
│          ▼                                                       │
│   base64ToBlob(b64_json, 'image/png') → Image Blob             │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PUBLISHING PHASE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   EntityPreview (UI) — user reviews and confirms                │
│          │                                                       │
│          ▼                                                       │
│   KankaPublisher:                                                │
│   1. Create chronicle journal (POST /campaigns/{id}/journals)   │
│   2. Create character sub-journals (children of chronicle)      │
│   3. Create locations/items (only if found in Foundry journals) │
│   4. Upload images (POST /campaigns/{id}/{type}/{id}/image)    │
│                                                                  │
│   ⚠️ Rate Limited: 30 req/min (free) / 90 req/min (premium)    │
└─────────────────────────────────────────────────────────────────┘
```

### State Machine

```
                         startLiveMode()          startChronicleMode()
                              │                         │
                              ▼                         ▼
┌──────────┐     ┌────────────────────┐     ┌────────────────┐
│          │     │    LIVE MODE       │     │   RECORDING    │
│   IDLE   │◄────┤                    │     │                │◄── resumeRecording()
│          │     │ LIVE_LISTENING     │     └───────┬────────┘
└──────────┘     │ LIVE_TRANSCRIBING  │             │ pauseRecording()
      ▲          │ LIVE_ANALYZING     │             ▼
      │          └────────────────────┘     ┌────────────────┐
      │                                     │    PAUSED      │
      │          stopSession()              └────────────────┘
      │               │
      │               ▼                     stopSession()
      │          ┌────────────────┐              │
      │          │  PROCESSING    │◄─────────────┘
      │          │ (Transcription)│
      │          └───────┬────────┘
      │                  │
      │                  ▼
      │          ┌────────────────┐
      │          │  EXTRACTING    │
      │          │ (Entities)     │
      │          └───────┬────────┘
      │                  │
      │                  ▼
      │          ┌────────────────┐
      │          │ GENERATING_    │
      │          │   IMAGES       │ (gpt-image-1)
      │          └───────┬────────┘
      │                  │
      │                  ▼
      │          ┌────────────────┐
      │          │  PUBLISHING    │ (Kanka)
      │          └───────┬────────┘
      │                  │
      │                  ▼
      │          ┌────────────────┐
      │ reset()  │   COMPLETE     │
      └──────────│                │
                 └────────────────┘
```

---

## Module Initialization

```
Foundry VTT Startup
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                    'init' Hook                             │
│                                                            │
│   Settings.registerSettings()                             │
│   • 40+ settings (API keys, campaign ID, RAG, UI prefs)  │
│   • Client-scope: openaiApiKey                            │
│   • World-scope: kankaCampaignId, kankaApiToken, speakerLabels │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│              'getSceneControlButtons' Hook                  │
│                                                            │
│   Adds VoxChronicle controls to scene toolbar (v13 format)│
│   • controls object (NOT array — v13 breaking change)     │
│   • SceneControl with name, title, icon, activeTool, tools│
│   • SceneControlTool with onChange (NOT onClick — v13)     │
│                                                            │
│   ⚠️ Fires ONCE, result cached. Register immediately.     │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                    'ready' Hook                            │
│                                                            │
│   VoxChronicle.getInstance().initialize()                 │
│   • Creates all service instances                          │
│   • Initializes RAG if configured                          │
│   • Marks module as ready                                  │
└───────────────────────────────────────────────────────────┘
```

---

## EventBus Architecture

EventBus provides typed, pub/sub communication across services to decouple components (Epic 1):

```javascript
// Emit event
eventBus.emit('audio:recordingStarted', { timestamp: Date.now() });

// Subscribe to channel
eventBus.on('audio:chunkReady', (chunk) => {
  console.log('New chunk ready:', chunk);
});

// Middleware pipeline for logging, filtering, etc.
eventBus.use((channel, data, next) => {
  console.log(`Event: ${channel}`);
  return next(data);
});
```

**Key Channels:**
- **Audio**: `audio:recordingStarted`, `audio:recordingStopped`, `audio:chunkReady`, `audio:chunkingStarted`, `audio:chunkCreated`, `audio:chunkingComplete`, `audio:error`, `audio:levelChange`
- **AI**: `ai:transcriptionStarted`, `ai:transcriptionReady`, `ai:transcriptionError`, `ai:speakersDetected`, `ai:imageGenerated`, `ai:entityExtracted`, `ai:suggestionReceived`, `ai:ragIndexingStarted`, `ai:ragIndexingComplete`
- **UI**: `ui:panelOpened`, `ui:panelClosed`, `ui:tabChanged`, `ui:speakerMapped`, `ui:entitySelected`
- **Session**: `session:started`, `session:paused`, `session:resumed`, `session:completed`, `session:error`, `session:liveStarted`, `session:liveStopped`
- **Scene**: `scene:changed` (includes `sceneType`, `previousType`, `confidence`, `timestamp`)

**Optional Integration:** Constructor injection with `#emitSafe()` wrapper for error-tolerant event emission:

```javascript
constructor(eventBus) {
  this.eventBus = eventBus;
}

#emitSafe(channel, data) {
  try {
    this.eventBus?.emit(channel, data);
  } catch (error) {
    this.logger.warn(`EventBus error on ${channel}:`, error);
  }
}
```

---

## UI Architecture

### ApplicationV2 + HandlebarsApplicationMixin (v13)

All 5 UI components use Foundry v13's ApplicationV2 framework:

```javascript
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class MyPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-my-panel',
    classes: ['vox-chronicle'],
    window: { title: 'VOXCHRONICLE.MyPanel.Title', resizable: true },
    position: { width: 400 },
    actions: { 'my-action': MyPanel._onMyAction }
  };

  static PARTS = {
    main: { template: `modules/vox-chronicle/templates/my-panel.hbs` }
  };

  async _prepareContext(options) { return { /* template data */ }; }
  _onRender(context, options) { /* non-click event listeners */ }
}
```

### Key Differences from Application v1

| v1 (Application) | v2 (ApplicationV2) |
|------|------|
| `static get defaultOptions()` | `static DEFAULT_OPTIONS` + `static PARTS` |
| `getData()` | `async _prepareContext(options)` |
| `activateListeners(html)` | `actions` map (click) + `_onRender()` (non-click) |
| `this.render(false)` | `this.render()` |
| `this.render(true)` | `this.render(true)` (first render needs force) |
| jQuery `html.find(...)` | `this.element.querySelector(...)` |

### Known Issue: Memory Leaks in `_onRender()`

`_onRender()` is called on EVERY render cycle. Event listeners added here accumulate without cleanup. The fix (implemented in v3.0) uses AbortController:

```javascript
#listenerController = null;

_onRender(context, options) {
  this.#listenerController?.abort();
  this.#listenerController = new AbortController();
  const { signal } = this.#listenerController;
  this.element.querySelector('select')
    .addEventListener('change', handler, { signal });
}
```

---

## Design Patterns

### 1. Singleton (VoxChronicle, MainPanel)

Both singletons use private `#instance` fields. Always access via `getInstance()` — never reference the instance field directly.

```javascript
class VoxChronicle {
  static #instance = null;

  static getInstance() {
    if (!VoxChronicle.#instance) {
      VoxChronicle.#instance = new VoxChronicle();
    }
    return VoxChronicle.#instance;
  }

  static resetInstance() {
    if (VoxChronicle.#instance) {
      VoxChronicle.#instance.audioRecorder?.cancel?.();
      VoxChronicle.#instance.silenceDetector?.stop?.();
      VoxChronicle.#instance.isInitialized = false;
    }
    VoxChronicle.#instance = null;
  }
}
```

### 2. Service Layer

Each service encapsulates a specific domain with Logger, try/catch, and consistent constructor pattern.

### 3. Facade (SessionOrchestrator)

Provides simplified interface for complex dual-mode workflow.

### 4. Factory (TranscriptionFactory, RAGProviderFactory planned)

Creates appropriate service based on settings.

### 5. State Machine (SessionOrchestrator)

Enum-based state management: IDLE → RECORDING → PROCESSING → EXTRACTING → GENERATING_IMAGES → PUBLISHING → COMPLETE.

### 6. Observer (Callbacks)

Services notify UI of state changes:
```javascript
orchestrator.setCallbacks({
  onStateChange: (newState, oldState) => { ... },
  onProgress: ({ stage, progress, message }) => { ... },
  onError: (error, stage) => { ... }
});
```

### 7. Retry + Circuit Breaker (OpenAIClient)

Exponential backoff + jitter with sequential queue and automatic circuit breaking after consecutive failures.

---

## External Integrations

### OpenAI API

| Endpoint | Purpose | Model | Method |
|----------|---------|-------|--------|
| `/v1/audio/transcriptions` | Transcribe + diarize | gpt-4o-transcribe-diarize | POST (FormData) |
| `/v1/chat/completions` | Entity extraction, suggestions | gpt-4o / gpt-4o-mini | POST (JSON) |
| `/v1/images/generations` | Image generation | gpt-image-1 | POST (JSON) |
| `/v1/vector_stores` | RAG vector store management | — | POST/DELETE (JSON) |
| `/v1/responses` | RAG query (file_search tool) | gpt-4o-mini | POST (JSON) |

**Critical notes:**
- Audio: FormData (NOT JSON), ≤25MB per chunk
- Images: gpt-image-1 returns base64 `b64_json` (NOT URLs)
- Valid gpt-image-1 sizes: `1024x1024`, `1024x1536`, `1536x1024`

### Kanka API

| Endpoint | Purpose | Method |
|----------|---------|--------|
| `/campaigns/{id}/journals` | Session chronicles | GET/POST/PUT/DELETE |
| `/campaigns/{id}/characters` | NPCs and PCs | GET/POST/PUT/DELETE |
| `/campaigns/{id}/locations` | Places | GET/POST/PUT/DELETE |
| `/campaigns/{id}/items` | Objects | GET/POST/PUT/DELETE |
| `/campaigns/{id}/{type}/{id}/image` | Image upload | POST (FormData) |

**Rate Limits:** 30/min (free) / 90/min (premium). Token expires after 364 days.

---

## Security Considerations

### API Key Storage

- **Client-scope** (per user, localStorage): `openaiApiKey`
- **World-scope** (shared, server DB): `kankaApiToken`, `kankaCampaignId`

### Data Handling

- Audio processed in browser, sent directly to OpenAI — no server-side storage
- Transcripts stored in session memory only (cleared on reset)
- Entity data persisted in Kanka only after user confirmation
- API keys filtered from log output by `SensitiveDataFilter`

### Permission Model

- Recording controls visible to all users
- Settings restricted to GM
- Kanka publishing requires configured API credentials

---

## Error Handling Strategy

```
┌─────────────────────────────────────────────────┐
│              UI Layer (MainPanel)                 │
│   ErrorNotificationHelper.notify(type, error)   │
│   → ui.notifications.error(user-friendly msg)   │
└─────────────────────────────────────────────────┘
        ▲
┌─────────────────────────────────────────────────┐
│           Orchestration Layer                     │
│   SessionOrchestrator catches service errors     │
│   → Updates state to ERROR                       │
│   → Calls onError callback                       │
└─────────────────────────────────────────────────┘
        ▲
┌─────────────────────────────────────────────────┐
│              Service Layer                        │
│   Throws typed errors (OpenAIError, KankaError) │
│   → Includes error type, status, context         │
│   → Logs with Logger.error()                     │
└─────────────────────────────────────────────────┘
```

### Retry Strategy

- OpenAI: Exponential backoff (1s, 2s, 4s) + random jitter, max 3 retries
- Kanka: Rate limit pause (60s) + retry
- Circuit breaker: Auto-stops after 5 consecutive failures

---

## v3.0-3.2 Changes (Released 2026-02-19 to 2026-03-14)

See `docs/plans/2026-02-19-v3-rewrite-plan.md` for the original plan.

**v3.0 (2026-02-19):**
1. **RAG:** Replaced custom stack (EmbeddingService + RAGVectorStore + RAGRetriever) with modular RAGProvider interface + OpenAI File Search + RAGFlow providers
2. **UI:** Fixed memory leaks in all 5 components using AbortController pattern; CSS-only tab switching in MainPanel
3. **Workflow:** Simplified to 2-3 session scene images (no entity portraits); focus on journal publishing
4. **Documentation:** This file, API_REFERENCE.md, CLAUDE.md — all updated
5. **Tests:** Complete rewrite — 3742 tests across 46 files with 95%+ coverage

**v3.1.0 (2026-03-13, Epics 1-3):**
1. **AI Provider Architecture:** Introduced `ChatProvider`, `TranscriptionProvider`, `ImageProvider`, `EmbeddingProvider` interfaces with OpenAI implementations. Services use composition instead of inheritance. Caching decorators for chat/embeddings. ProviderRegistry for service location.
2. **EventBus System:** Typed pub/sub channels with middleware pipeline for decoupled service communication. Audio, AI, UI, and Session event channels. Optional constructor injection with `#emitSafe()` wrapper.
3. **Audio Enhancements:** Safari codec fallback (MP4/AAC), crash recovery via IndexedDB, WebRTC peer capture, EventBus integration for recording lifecycle and chunking progress.
4. **Transcription Workflow:** TranscriptionProcessor emits EventBus events, auto-applies saved speaker labels, registers new speakers.
5. **UI Improvements:** MainPanel uses PARTS pattern, TranscriptReview component with inline editing and speaker color coding, SpeakerLabeling modal integration, StreamController for real-time responses.
6. **Test Expansion:** 5151 tests across 69 files (40% increase from v3.0)

**v3.2.0 (2026-03-14, Epic 4 — Assistenza AI Live Contestuale):**
1. **Adaptive Live Cycle:** SessionOrchestrator `_getAdaptiveBatchDuration()` adjusts cycle interval (5s-60s) based on speech activity. High speech = shorter intervals for responsiveness; silence = longer intervals to reduce API costs.
2. **Scene Detection Pipeline:** New `_updateSceneType(text)` in SessionOrchestrator detects scene transitions via `SceneDetector.detectSceneTransition()`, emits `scene:changed` EventBus event with `sceneType`, `previousType`, `confidence`, `timestamp`. Triggers AIAssistant cache invalidation on scene change. `getCurrentSceneType()` public getter.
3. **Scene-Aware Prompts:** AIAssistant accepts `sceneType` in `analyzeContext()` options, syncs to PromptBuilder via `_syncPromptBuilderState()`. PromptBuilder `setSceneType()` adds `CURRENT SCENE TYPE` section to system prompt for scene-contextual AI suggestions.
4. **RulesLookupService ChatProvider Support:** Supports `chatProvider` option (preferred over `openaiClient`) for synthesis phase. Uses `ChatProvider.chat()` with fallback to `OpenAIClient.post()`.
5. **MainPanel EventBus Integration:** Listens to `ai:transcriptionReady` (transcript updates), `ai:ragIndexingStarted`/`ai:ragIndexingComplete` (RAG status display). Scene badge in live mode with color coding: combat=red, social=blue, exploration=green, rest=amber.
6. **SessionOrchestrator EventBus Events:** `session:liveStarted`, `session:liveStopped`, `ai:suggestionReceived`, `ai:ragIndexingStarted`, `ai:ragIndexingComplete`, `scene:changed`. All emissions use `_emitSafe()` fire-and-forget wrapper.

---

## Related Documentation

- [API Reference](./API_REFERENCE.md) — Service class API documentation
- [User Guide](./USER_GUIDE.md) — End-user instructions
- [CLAUDE.md](../CLAUDE.md) — AI development context
- [Whisper Setup](./WHISPER_SETUP.md) — Local Whisper backend setup
- [GPT-4o Transcribe API](./GPT4O_TRANSCRIBE_API.md) — Diarization API specifics
- [v3.0 Rewrite Plan](./plans/2026-02-19-v3-rewrite-plan.md) — Planned architecture changes
