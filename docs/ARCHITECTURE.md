# VoxChronicle Architecture Documentation

This document describes the system architecture, components, and data flow of the VoxChronicle Foundry VTT module.

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Diagram](#component-diagram)
4. [Service Layers](#service-layers)
5. [Data Flow](#data-flow)
6. [Module Initialization](#module-initialization)
7. [Design Patterns](#design-patterns)
8. [External Integrations](#external-integrations)
9. [Security Considerations](#security-considerations)
10. [Error Handling Strategy](#error-handling-strategy)

---

## System Overview

VoxChronicle is a Foundry VTT module that automates the transcription and documentation of tabletop RPG sessions. The system:

- **Captures** audio from game sessions (Foundry VTT WebRTC or browser microphone)
- **Transcribes** audio using OpenAI's GPT-4o with speaker diarization
- **Extracts** entities (NPCs, locations, items) from transcripts using AI
- **Generates** AI images using DALL-E 3 for characters, locations, and scenes
- **Publishes** chronicles and entities to Kanka campaign management platform

### Key Technologies

| Component | Technology |
|-----------|------------|
| Platform | Foundry VTT v11/v12 |
| Language | JavaScript ES6+ (`.mjs` modules) |
| UI Framework | Foundry Application classes + Handlebars |
| Transcription | OpenAI GPT-4o-transcribe-diarize |
| Image Generation | DALL-E 3 |
| Campaign Management | Kanka.io API v1.0 |
| Styling | CSS with BEM-style naming |
| Testing | Vitest with jsdom |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FOUNDRY VTT CLIENT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        VoxChronicle Module                              │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │ │
│  │  │   UI Layer      │  │  Orchestration  │  │   Core Services          │ │ │
│  │  │                 │  │                 │  │                          │ │ │
│  │  │ RecorderControls│  │   Session       │  │ VoxChronicle (Singleton) │ │ │
│  │  │ SpeakerLabeling │◄─┤  Orchestrator   ├─►│ Settings                 │ │ │
│  │  │ EntityPreview   │  │                 │  │ Logger                   │ │ │
│  │  └────────┬────────┘  └────────┬────────┘  └────────────────────────┘ │ │
│  │           │                    │                                       │ │
│  │           ▼                    ▼                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │                      Service Layer                               │  │ │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │  │ │
│  │  │  │AudioRecorder │ │ Transcription│ │ ImageGenerationService   │ │  │ │
│  │  │  │AudioChunker  │ │   Service    │ │ EntityExtractor          │ │  │ │
│  │  │  └──────┬───────┘ └──────┬───────┘ └────────────┬─────────────┘ │  │ │
│  │  │         │                │                      │                │  │ │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐ │  │ │
│  │  │  │ KankaService │ │ Narrative    │ │ CompendiumSearcher        │ │  │ │
│  │  │  │ KankaClient  │ │  Exporter    │ │ (Foundry integration)     │ │  │ │
│  │  │  └──────┬───────┘ └──────────────┘ └───────────────────────────┘ │  │ │
│  │  └─────────┼──────────────────────────────────────────────────────┘  │ │
│  └────────────┼─────────────────────────────────────────────────────────┘ │
└───────────────┼─────────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                     │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                     │
│  │      OpenAI API         │  │       Kanka API         │                     │
│  │                         │  │                         │                     │
│  │  • Audio Transcription  │  │  • Campaign Management  │                     │
│  │  • Speaker Diarization  │  │  • Entity CRUD          │                     │
│  │  • Entity Extraction    │  │  • Image Upload         │                     │
│  │  • Image Generation     │  │  • Rate Limited Access  │                     │
│  │                         │  │                         │                     │
│  │  Endpoint:              │  │  Endpoint:              │                     │
│  │  api.openai.com/v1      │  │  api.kanka.io/1.0       │                     │
│  └─────────────────────────┘  └─────────────────────────┘                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              scripts/                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────┐                                                             │
│  │   main.mjs  │ ─────► Entry point, Hooks registration, MODULE_ID export   │
│  └──────┬──────┘                                                             │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                           core/                                          │ │
│  │  ┌───────────────────────┐  ┌───────────────────────┐                   │ │
│  │  │   VoxChronicle.mjs    │  │    Settings.mjs       │                   │ │
│  │  │                       │  │                       │                   │ │
│  │  │  • Singleton pattern  │  │  • registerSettings() │                   │ │
│  │  │  • Service references │  │  • Foundry settings   │                   │ │
│  │  │  • Session management │  │  • API key storage    │                   │ │
│  │  │  • Status tracking    │  │  • Configuration      │                   │ │
│  │  └───────────────────────┘  └───────────────────────┘                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                          audio/                                          │ │
│  │  ┌───────────────────────┐  ┌───────────────────────┐                   │ │
│  │  │  AudioRecorder.mjs    │  │   AudioChunker.mjs    │                   │ │
│  │  │                       │  │                       │                   │ │
│  │  │  • MediaRecorder API  │  │  • Split large files  │                   │ │
│  │  │  • Microphone capture │  │  • 25MB chunk limit   │                   │ │
│  │  │  • WebRTC capture     │  │  • Duration tracking  │                   │ │
│  │  │  • State management   │  │                       │                   │ │
│  │  └───────────────────────┘  └───────────────────────┘                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                            ai/                                           │ │
│  │  ┌───────────────────┐  ┌────────────────────┐  ┌────────────────────┐  │ │
│  │  │ OpenAIClient.mjs  │  │TranscriptionService│  │ImageGenerationSvc │  │ │
│  │  │                   │  │        .mjs        │  │       .mjs        │  │ │
│  │  │ • Base API client │  │                    │  │                   │  │ │
│  │  │ • Auth handling   │  │ • GPT-4o-transcribe│  │ • DALL-E 3        │  │ │
│  │  │ • Request queue   │  │ • Speaker diarize  │  │ • Prompt building │  │ │
│  │  │ • Rate limiting   │  │ • Speaker mapping  │  │ • URL management  │  │ │
│  │  └───────────────────┘  └────────────────────┘  └────────────────────┘  │ │
│  │                                                                          │ │
│  │  ┌───────────────────┐                                                   │ │
│  │  │EntityExtractor.mjs│                                                   │ │
│  │  │                   │                                                   │ │
│  │  │ • GPT-4o analysis │                                                   │ │
│  │  │ • NPC extraction  │                                                   │ │
│  │  │ • Location detect │                                                   │ │
│  │  │ • Salient moments │                                                   │ │
│  │  └───────────────────┘                                                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                           kanka/                                         │ │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────────┐  │ │
│  │  │  KankaClient.mjs  │  │  KankaService.mjs │  │NarrativeExporter.mjs│  │ │
│  │  │                   │  │                   │  │                     │  │ │
│  │  │ • Base API client │  │ • Entity CRUD     │  │ • Chronicle format  │  │ │
│  │  │ • Rate limiting   │  │ • Image upload    │  │ • HTML generation   │  │ │
│  │  │ • Error handling  │  │ • Batch creation  │  │ • Entity links      │  │ │
│  │  │ • 30/90 req/min   │  │ • Duplicate check │  │                     │  │ │
│  │  └───────────────────┘  └───────────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                       orchestration/                                     │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │                   SessionOrchestrator.mjs                          │  │ │
│  │  │                                                                    │  │ │
│  │  │  Manages complete workflow: Record → Transcribe → Extract →       │  │ │
│  │  │  Generate Images → Publish to Kanka                                │  │ │
│  │  │                                                                    │  │ │
│  │  │  States: IDLE → RECORDING → PROCESSING → EXTRACTING →             │  │ │
│  │  │          GENERATING_IMAGES → PUBLISHING → COMPLETE                 │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                            ui/                                           │ │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────────┐  │ │
│  │  │RecorderControls   │  │ SpeakerLabeling   │  │ EntityPreview       │  │ │
│  │  │       .mjs        │  │      .mjs         │  │      .mjs           │  │ │
│  │  │                   │  │                   │  │                     │  │ │
│  │  │ • Start/Stop/Pause│  │ • Speaker mapping │  │ • Entity review     │  │ │
│  │  │ • Timer display   │  │ • Player names    │  │ • Before publish    │  │ │
│  │  │ • Status indicator│  │ • GM assignment   │  │ • Selection UI      │  │ │
│  │  └───────────────────┘  └───────────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                          utils/                                          │ │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────────┐  │ │
│  │  │    Logger.mjs     │  │  RateLimiter.mjs  │  │   AudioUtils.mjs    │  │ │
│  │  │                   │  │                   │  │                     │  │ │
│  │  │ • Prefixed logs   │  │ • Request queue   │  │ • MIME detection    │  │ │
│  │  │ • Log levels      │  │ • Throttling      │  │ • Blob handling     │  │ │
│  │  │ • Child loggers   │  │ • Backoff logic   │  │ • Format conversion │  │ │
│  │  └───────────────────┘  └───────────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         content/                                         │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │                   CompendiumSearcher.mjs                           │  │ │
│  │  │                                                                    │  │ │
│  │  │  Search Foundry compendiums for existing entities to prevent      │  │ │
│  │  │  duplicate creation in Kanka                                       │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Layers

VoxChronicle follows a layered architecture with clear separation of concerns:

### Layer 1: Entry Point & Hooks (`main.mjs`)

The entry point registers Foundry VTT hooks and exports the module ID:

```javascript
const MODULE_ID = 'vox-chronicle';

Hooks.once('init', () => {
  // Register settings before game loads
  Settings.registerSettings();
});

Hooks.once('ready', async () => {
  // Initialize services after game data is ready
  await VoxChronicle.getInstance().initialize();
});

Hooks.on('getSceneControlButtons', (controls) => {
  // Add VoxChronicle controls to scene toolbar
});
```

### Layer 2: Core Controllers (`core/`)

**VoxChronicle.mjs** - Main singleton that orchestrates all services:

- Manages service lifecycle
- Tracks recording state
- Provides unified API for session management

**Settings.mjs** - Configuration management:

- API key storage (client-side for OpenAI)
- Campaign settings (world-side for Kanka)
- Speaker label mappings
- Module preferences

### Layer 3: Business Services

**Audio Services (`audio/`):**
- `AudioRecorder` - MediaRecorder wrapper with multiple capture modes
- `AudioChunker` - Splits large files for API limits

**AI Services (`ai/`):**
- `OpenAIClient` - Base client with auth and rate limiting
- `TranscriptionService` - GPT-4o transcription with diarization
- `ImageGenerationService` - DALL-E 3 image generation
- `EntityExtractor` - NLP entity extraction

**Kanka Services (`kanka/`):**
- `KankaClient` - Base client with rate limiting
- `KankaService` - Entity CRUD operations
- `NarrativeExporter` - Chronicle formatting

### Layer 4: Orchestration (`orchestration/`)

**SessionOrchestrator** - Coordinates the complete workflow:

1. Session start/stop/pause
2. Transcription processing
3. Entity extraction
4. Image generation
5. Kanka publishing

### Layer 5: UI Components (`ui/`)

Foundry Application classes:
- `RecorderControls` - Recording interface
- `SpeakerLabeling` - Speaker-to-player mapping
- `EntityPreview` - Entity confirmation before publish

### Layer 6: Utilities (`utils/`)

Shared helpers:
- `Logger` - Module-prefixed logging
- `RateLimiter` - API request throttling
- `AudioUtils` - Audio blob handling

---

## Data Flow

### Complete Session Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RECORDING PHASE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User clicks "Start Recording"                                             │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐     │
│   │ RecorderControls│─────►│ AudioRecorder   │─────►│ MediaRecorder   │     │
│   │    (UI)         │      │ startRecording()│      │     API         │     │
│   └─────────────────┘      └─────────────────┘      └────────┬────────┘     │
│                                                               │              │
│                            Audio Chunks (10s intervals) ◄─────┘              │
│                                     │                                        │
│   User clicks "Stop Recording"      ▼                                        │
│            │               ┌─────────────────┐                              │
│            └──────────────►│ stopRecording() │                              │
│                            │                 │                              │
│                            └────────┬────────┘                              │
│                                     │                                        │
│                                     ▼                                        │
│                            ┌─────────────────┐                              │
│                            │   Audio Blob    │                              │
│                            │  (WebM/Opus)    │                              │
│                            └────────┬────────┘                              │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TRANSCRIPTION PHASE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐      ┌─────────────────┐                              │
│   │   Audio Blob    │─────►│  AudioChunker   │                              │
│   │   (> 25MB?)     │      │  splitIfNeeded()│                              │
│   └─────────────────┘      └────────┬────────┘                              │
│                                     │                                        │
│                     Chunks (≤ 25MB each)                                     │
│                                     │                                        │
│                                     ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    TranscriptionService                              │   │
│   │                                                                      │   │
│   │   FormData {                                                         │   │
│   │     file: audioBlob,                                                 │   │
│   │     model: 'gpt-4o-transcribe-diarize',                             │   │
│   │     response_format: 'diarized_json',                               │   │
│   │     chunking_strategy: 'auto'                                        │   │
│   │   }                                                                  │   │
│   └─────────────────────────────────┬───────────────────────────────────┘   │
│                                     │                                        │
│                              POST /v1/audio/transcriptions                   │
│                                     │                                        │
│                                     ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      OpenAI API Response                             │   │
│   │                                                                      │   │
│   │   {                                                                  │   │
│   │     text: "Full transcription...",                                   │   │
│   │     segments: [                                                      │   │
│   │       { speaker: "SPEAKER_00", text: "...", start: 0, end: 5.2 },   │   │
│   │       { speaker: "SPEAKER_01", text: "...", start: 5.3, end: 10.1 } │   │
│   │     ]                                                                │   │
│   │   }                                                                  │   │
│   └─────────────────────────────────┬───────────────────────────────────┘   │
│                                     │                                        │
│                        Speaker Mapping Applied                               │
│                   (SPEAKER_00 → "Game Master")                              │
│                   (SPEAKER_01 → "Player 1")                                 │
│                                     │                                        │
│                                     ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Mapped Transcript                               │   │
│   │   {                                                                  │   │
│   │     text: "Full transcription...",                                   │   │
│   │     segments: [                                                      │   │
│   │       { speaker: "Game Master", text: "...", start: 0, end: 5.2 },  │   │
│   │       { speaker: "Player 1", text: "...", start: 5.3, end: 10.1 }   │   │
│   │     ],                                                               │   │
│   │     speakers: [                                                      │   │
│   │       { id: "SPEAKER_00", name: "Game Master", isMapped: true },    │   │
│   │       { id: "SPEAKER_01", name: "Player 1", isMapped: true }        │   │
│   │     ]                                                                │   │
│   │   }                                                                  │   │
│   └─────────────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EXTRACTION PHASE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      EntityExtractor                                 │   │
│   │                                                                      │   │
│   │   GPT-4o Chat Completion:                                           │   │
│   │   "Analyze this RPG transcript and extract named entities..."       │   │
│   │                                                                      │   │
│   │   Response:                                                          │   │
│   │   {                                                                  │   │
│   │     characters: [{ name: "Thorn", isNPC: true, desc: "..." }],      │   │
│   │     locations: [{ name: "Silver Dragon Inn", type: "tavern" }],     │   │
│   │     items: [{ name: "Blade of Dawn", type: "weapon" }]              │   │
│   │   }                                                                  │   │
│   └─────────────────────────────────┬───────────────────────────────────┘   │
│                                     │                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                   Salient Moment Identification                      │   │
│   │                                                                      │   │
│   │   GPT-4o: "Identify dramatic moments suitable for illustration"     │   │
│   │                                                                      │   │
│   │   Response:                                                          │   │
│   │   {                                                                  │   │
│   │     moments: [                                                       │   │
│   │       { title: "Dragon's Ambush", imagePrompt: "...", context: "..."}│   │
│   │     ]                                                                │   │
│   │   }                                                                  │   │
│   └─────────────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     IMAGE GENERATION PHASE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                   ImageGenerationService                             │   │
│   │                                                                      │   │
│   │   For each moment/character:                                         │   │
│   │                                                                      │   │
│   │   POST /v1/images/generations                                        │   │
│   │   {                                                                  │   │
│   │     model: "dall-e-3",           // MUST specify!                   │   │
│   │     prompt: "Fantasy RPG character portrait: Thorn...",             │   │
│   │     n: 1,                        // DALL-E 3 only supports n=1      │   │
│   │     size: "1024x1024",                                               │   │
│   │     quality: "standard"                                              │   │
│   │   }                                                                  │   │
│   │                                                                      │   │
│   │   Response: { url: "https://..." }  ⚠️ Expires in 60 minutes!       │   │
│   │                                                                      │   │
│   │   ─── IMMEDIATELY DOWNLOAD IMAGE ───                                │   │
│   │                                                                      │   │
│   └─────────────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PUBLISHING PHASE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                       EntityPreview (UI)                             │   │
│   │                                                                      │   │
│   │   User reviews and confirms entities before creation                 │   │
│   └─────────────────────────────────┬───────────────────────────────────┘   │
│                                     │                                        │
│                                     ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        KankaService                                  │   │
│   │                                                                      │   │
│   │   1. Check for existing entities (avoid duplicates)                 │   │
│   │      GET /campaigns/{id}/characters?name=Thorn                      │   │
│   │                                                                      │   │
│   │   2. Create new entities                                             │   │
│   │      POST /campaigns/{id}/characters                                │   │
│   │      POST /campaigns/{id}/locations                                 │   │
│   │      POST /campaigns/{id}/items                                     │   │
│   │                                                                      │   │
│   │   3. Upload portraits                                                │   │
│   │      POST /campaigns/{id}/characters/{id}/image                     │   │
│   │                                                                      │   │
│   │   4. Create session chronicle                                        │   │
│   │      POST /campaigns/{id}/journals                                  │   │
│   │                                                                      │   │
│   │   ⚠️ Rate Limited: 30 req/min (free) / 90 req/min (premium)        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### State Machine

The SessionOrchestrator manages session state transitions:

```
                              startSession()
                                    │
                                    ▼
┌────────────┐            ┌────────────────┐
│            │            │                │
│   IDLE     │◄───────────│   RECORDING    │◄──── resumeRecording()
│            │  cancel()  │                │
└────────────┘            └───────┬────────┘
      ▲                           │
      │                     pauseRecording()
      │                           │
      │                           ▼
      │                   ┌────────────────┐
      │                   │                │
      │                   │    PAUSED      │
      │                   │                │
      │                   └────────────────┘
      │
      │                   stopSession()
      │                         │
      │                         ▼
      │                   ┌────────────────┐
      │                   │                │
      │                   │  PROCESSING    │──── Transcription
      │                   │                │
      │                   └───────┬────────┘
      │                           │
      │                           ▼
      │                   ┌────────────────┐
      │                   │                │
      │                   │  EXTRACTING    │──── Entity Extraction
      │                   │                │
      │                   └───────┬────────┘
      │                           │
      │                           ▼
      │                   ┌────────────────┐
      │                   │ GENERATING_    │
      │                   │   IMAGES       │──── DALL-E 3
      │                   │                │
      │                   └───────┬────────┘
      │                           │
      │                           ▼
      │                   ┌────────────────┐
      │                   │                │
      │                   │  PUBLISHING    │──── Kanka Upload
      │                   │                │
      │                   └───────┬────────┘
      │                           │
      │                           ▼
      │                   ┌────────────────┐
      │   reset()         │                │
      └───────────────────│   COMPLETE     │
                          │                │
                          └────────────────┘
```

---

## Module Initialization

```
Foundry VTT Startup
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                    'init' Hook                                 │
│                                                               │
│   • Register module settings (API keys, campaign ID)         │
│   • Store module reference on game object                    │
│   • Settings accessible before game data loads                │
│                                                               │
│   game.settings.register(MODULE_ID, 'openaiApiKey', {...});  │
│   game.settings.register(MODULE_ID, 'kankaApiToken', {...}); │
│                                                               │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                    'ready' Hook                                │
│                                                               │
│   • All game data is loaded                                   │
│   • Initialize VoxChronicle singleton                         │
│   • Create service instances with API keys from settings     │
│   • Mark module as ready                                      │
│                                                               │
│   const vox = VoxChronicle.getInstance();                    │
│   await vox.initialize();                                     │
│   game[MODULE_ID].ready = true;                              │
│                                                               │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│              'getSceneControlButtons' Hook                     │
│                                                               │
│   • Add VoxChronicle controls to scene toolbar               │
│   • Only visible if module is ready                           │
│   • Controls: Recorder, Speaker Labels, Settings             │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Design Patterns

### 1. Singleton Pattern (VoxChronicle)

The main module class ensures single instance across the application:

```javascript
class VoxChronicle {
  static instance = null;

  static getInstance() {
    if (!VoxChronicle.instance) {
      VoxChronicle.instance = new VoxChronicle();
    }
    return VoxChronicle.instance;
  }
}
```

### 2. Service Layer Pattern

Each service encapsulates a specific domain:
- `TranscriptionService` - Audio → Text
- `ImageGenerationService` - Text → Image
- `KankaService` - Data → Kanka API

### 3. Facade Pattern (SessionOrchestrator)

Provides a simplified interface for complex workflow:

```javascript
// Instead of managing each service individually:
await orchestrator.startSession();
// ... recording ...
await orchestrator.stopSession();
await orchestrator.publishToKanka();
```

### 4. State Pattern

SessionOrchestrator uses state enum for workflow management:

```javascript
const SessionState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  PROCESSING: 'processing',
  EXTRACTING: 'extracting',
  GENERATING_IMAGES: 'generating_images',
  PUBLISHING: 'publishing',
  COMPLETE: 'complete',
  ERROR: 'error'
};
```

### 5. Observer Pattern (Callbacks)

Services notify clients of state changes:

```javascript
orchestrator.setCallbacks({
  onStateChange: (newState, oldState) => { ... },
  onProgress: ({ stage, progress, message }) => { ... },
  onError: (error, stage) => { ... },
  onSessionComplete: (sessionData) => { ... }
});
```

### 6. Inheritance Pattern (API Clients)

API clients extend base classes:

```javascript
class TranscriptionService extends OpenAIClient {
  // Inherits auth, rate limiting from OpenAIClient
}

class KankaService extends KankaClient {
  // Inherits rate limiting from KankaClient
}
```

---

## External Integrations

### OpenAI API

| Endpoint | Purpose | Method |
|----------|---------|--------|
| `/v1/audio/transcriptions` | Transcribe audio with diarization | POST (FormData) |
| `/v1/chat/completions` | Entity extraction, moment identification | POST (JSON) |
| `/v1/images/generations` | DALL-E 3 image generation | POST (JSON) |

**Critical Requirements:**
- Audio sent as FormData (NOT JSON)
- Must specify `model: 'dall-e-3'` (defaults to dall-e-2)
- Image URLs expire in 60 minutes - download immediately
- Audio files must be ≤ 25MB (chunk larger files)

### Kanka API

| Endpoint | Purpose | Method |
|----------|---------|--------|
| `/campaigns/{id}/journals` | Session chronicles | GET/POST/PUT/DELETE |
| `/campaigns/{id}/characters` | NPCs and PCs | GET/POST/PUT/DELETE |
| `/campaigns/{id}/locations` | Places | GET/POST/PUT/DELETE |
| `/campaigns/{id}/items` | Objects | GET/POST/PUT/DELETE |
| `/campaigns/{id}/{type}/{id}` | Image upload | POST (FormData) |

**Rate Limits:**
- Free tier: 30 requests/minute
- Premium: 90 requests/minute
- Token expires after 364 days

---

## Security Considerations

### API Key Storage

```javascript
// Client-side storage (per user) - for personal keys
game.settings.register(MODULE_ID, 'openaiApiKey', {
  scope: 'client',  // Stored in browser localStorage
  config: true,
  type: String
});

// World-side storage (shared) - for campaign settings
game.settings.register(MODULE_ID, 'kankaApiToken', {
  scope: 'world',   // Stored in world database
  config: true,
  type: String
});
```

### Data Handling

- Audio files processed in browser, sent directly to OpenAI
- Transcripts stored temporarily in session memory
- No persistent storage of raw audio after transcription
- Entity data only persisted in Kanka after user confirmation

### Permission Model

- Recording controls visible to all users
- Settings restricted to GM (`restricted: true`)
- Kanka publishing requires configured API credentials

---

## Error Handling Strategy

### Layered Error Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                    UI Layer (RecorderControls)                   │
│   • Display user-friendly notifications                         │
│   • ui.notifications.error('VoxChronicle: ...')                │
└─────────────────────────────────────────────────────────────────┘
        ▲
        │ Caught & displayed
        │
┌─────────────────────────────────────────────────────────────────┐
│                 Orchestration Layer                              │
│   • Catch service errors                                         │
│   • Update state to ERROR                                        │
│   • Call onError callback                                        │
│   • Log with context                                             │
└─────────────────────────────────────────────────────────────────┘
        ▲
        │ Thrown with context
        │
┌─────────────────────────────────────────────────────────────────┐
│                    Service Layer                                 │
│   • Throw typed errors (OpenAIError, KankaError)               │
│   • Include error type, status code, context                   │
│   • Log to console with Logger                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Error Types

```javascript
// OpenAI errors
const OpenAIErrorType = {
  AUTHENTICATION_ERROR: 'authentication_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  INVALID_REQUEST_ERROR: 'invalid_request_error',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error'
};

// Kanka errors
const KankaErrorType = {
  AUTHENTICATION_ERROR: 'authentication_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  VALIDATION_ERROR: 'validation_error',
  NOT_FOUND: 'not_found',
  API_ERROR: 'api_error'
};
```

### Retry Strategy

```javascript
// Rate limit handling with exponential backoff
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || 60;
  await this.delay(retryAfter * 1000);
  return this.request(endpoint, method, data); // Retry
}
```

---

## Performance Considerations

### Audio Processing

- Use Web Workers for large file handling (future enhancement)
- Stream audio in 10-second chunks during recording
- Chunk files > 25MB before transcription

### API Optimization

- Rate limiter queue prevents 429 errors
- Batch entity checking before creation
- Image URLs downloaded immediately (60-min expiry)

### Memory Management

- Audio chunks cleared after blob creation
- Session data cleared on reset
- Stream tracks stopped after recording

---

## Future Considerations

1. **Offline Support** - Cache transcripts locally
2. **Multi-language UI** - Extend beyond EN/IT
3. **Custom Entity Types** - Support additional Kanka entity types
4. **Real-time Preview** - Live transcription during recording
5. **Session Resume** - Recovery after connection loss
6. **Export Formats** - PDF, Markdown export options

---

## Related Documentation

- [API Reference](./API_REFERENCE.md) - Detailed service API documentation
- [User Guide](./USER_GUIDE.md) - End-user instructions
- [CLAUDE.md](../CLAUDE.md) - AI development context
- [README.md](../README.md) - Project overview
