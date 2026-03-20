# Architecture

**Analysis Date:** 2026-03-19

## Pattern Overview

**Overall:** Layered service architecture with singleton orchestration and event-driven decoupling.

**Key Characteristics:**
- Central singleton (`VoxChronicle`) owns and injects all services
- `SessionOrchestrator` drives dual-mode workflows (live vs. chronicle) via callback patterns
- `EventBus` provides decoupled pub/sub between layers (typed channels, middleware pipeline)
- Provider abstraction layer separates AI capability interfaces from vendor implementations
- Foundry VTT hooks (`init`, `ready`, `getSceneControlButtons`, etc.) are the external entry points

---

## Layers

**Entry Layer (Foundry Hooks):**
- Purpose: Module lifecycle integration with Foundry VTT
- Location: `scripts/main.mjs`
- Contains: Hook registrations, scene control buttons, settings UI hooks
- Depends on: VoxChronicle singleton, Settings, Logger
- Used by: Foundry VTT runtime

**Core / Orchestration Layer:**
- Purpose: Service creation, dependency wiring, session lifecycle management
- Location: `scripts/core/VoxChronicle.mjs`, `scripts/orchestration/SessionOrchestrator.mjs`
- Contains: Service instantiation, provider registration, session state machine
- Depends on: All service layers
- Used by: main.mjs, UI layer

**AI Provider Layer:**
- Purpose: Vendor-neutral interfaces for chat, transcription, image, and embedding
- Location: `scripts/ai/providers/`
- Contains: Abstract base classes, OpenAI/Anthropic/Google implementations, registry, caching decorators
- Depends on: Logger, EventBus (for registry events)
- Used by: narrator services, orchestration, kanka

**Service Layer (AI):**
- Purpose: Domain-specific AI operations (transcription, entity extraction, image generation)
- Location: `scripts/ai/`, `scripts/narrator/`
- Contains: TranscriptionService, EntityExtractor, ImageGenerationService, AIAssistant, RulesReference, etc.
- Depends on: Provider layer, EventBus, CacheManager
- Used by: orchestration layer

**Service Layer (Kanka):**
- Purpose: Campaign management API integration
- Location: `scripts/kanka/`
- Contains: KankaClient, KankaService, KankaEntityManager, NarrativeExporter
- Depends on: RateLimiter, Logger
- Used by: orchestration layer

**RAG Layer:**
- Purpose: Retrieval-Augmented Generation for AI context enrichment
- Location: `scripts/rag/`
- Contains: RAGProvider (abstract), OpenAIFileSearchProvider, RAGFlowProvider, RAGProviderFactory
- Depends on: OpenAIClient, Logger, EventBus
- Used by: VoxChronicle (init), SessionOrchestrator (indexing), AIAssistant (retrieval)

**Audio Layer:**
- Purpose: Browser audio capture and chunking
- Location: `scripts/audio/`
- Contains: AudioRecorder (MediaRecorder wrapper, WebRTC mixing, IndexedDB crash recovery), AudioChunker
- Depends on: Logger, AudioUtils, EventBus (optional)
- Used by: SessionOrchestrator

**UI Layer:**
- Purpose: Foundry VTT ApplicationV2 panels and dialogs
- Location: `scripts/ui/`
- Contains: MainPanel, SpeakerLabeling, EntityPreview, RelationshipGraph, VocabularyManager, JournalPicker
- Depends on: VoxChronicle singleton, SessionOrchestrator, EventBus
- Used by: main.mjs (opens via tool handlers)

**Utility Layer:**
- Purpose: Shared, dependency-free helpers
- Location: `scripts/utils/`
- Contains: Logger, RateLimiter, CacheManager, AudioUtils, HtmlUtils, DomUtils, SpeakerUtils, SensitiveDataFilter
- Depends on: nothing (leaf modules)
- Used by: all other layers

---

## Singleton Pattern

### VoxChronicle (`scripts/core/VoxChronicle.mjs`)

Central module singleton. Uses private static field `#instance`. Created once per Foundry session.

```javascript
class VoxChronicle {
  static #instance = null;
  static _hooksRegistered = false;

  static getInstance() { ... }
  static resetInstance() { ... }  // Used in tests

  async initialize() { /* Creates all services */ }
  async reinitialize() { /* Safe restart on settings change */ }
}
```

On `reinitialize()`: defers if session active (`_reinitializePending`), calls `destroy()` on aiAssistant/rulesReference, clears L1/L2 caches, resets `ProviderRegistry`, and calls `initialize()` again.

### MainPanel (`scripts/ui/MainPanel.mjs`)

UI singleton. Private static field `#instance`. Constructed with an orchestrator reference.

```javascript
class MainPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;
  static getInstance(orchestrator) { ... }
  static resetInstance() { ... }
}
```

Obtained at panel open time via `getMainPanel()` in `main.mjs`, which also wires the EventBus via `panel.setEventBus(eventBus)`.

### ProviderRegistry (`scripts/ai/providers/ProviderRegistry.mjs`)

AI provider registry singleton. Stores capability→provider mappings. Reset by `VoxChronicle.resetInstance()`.

---

## Dual-Mode Operation

### Live Mode (real-time AI assistance)

Entry: `MainPanel._onToggleRecording()` → `orchestrator.startLiveMode(options)`

Flow:
1. `SessionOrchestrator.startLiveMode()` creates session object, starts `AudioRecorder`, initializes `SessionAnalytics`, calls `_initializeJournalContext()`, then `_scheduleLiveCycle()`
2. `_liveCycle()` runs on a timer (default 10s, adaptive 5–60s based on silence):
   - Gets audio chunk via `AudioRecorder.getLatestChunk()`
   - Calls `TranscriptionService.transcribe()` directly (NOT via TranscriptionProcessor)
   - Runs `_runAIAnalysis()` → `AIAssistant.generateSuggestionsStreaming()` or `analyzeContext()`
   - Emits `scene:changed` if SceneDetector detects transition
   - Runs fire-and-forget rules detection via `RulesLookupService`
3. AIAssistant silence monitoring runs in parallel via `SilenceMonitor`
4. Callbacks propagate results to `MainPanel`: `onAISuggestion`, `onStreamToken`, `onStreamComplete`, `onRulesCard`, `onStateChange`

Stop: `MainPanel._onToggleRecording()` → `orchestrator.stopLiveMode()` → races current cycle against 5s deadline → `_fullTeardown()`

### Chronicle Mode (post-session workflow)

Entry: `MainPanel._onToggleRecording()` → `orchestrator.startSession(options)` for recording, then `MainPanel._onProcessSession()` → `orchestrator.processTranscription()`

Flow:
1. `startSession()`: creates session object, starts `AudioRecorder`
2. `stopSession()`: stops `AudioRecorder`, auto-calls `processTranscription()` (if `processImmediately` = true)
3. `processTranscription()`: calls `TranscriptionProcessor.processTranscription()` → emits `ai:transcriptionReady` → `MainPanel` updates transcript tab
4. `_extractEntities()`: `EntityProcessor.extractAll()` then `extractRelationships()`
5. `_generateImages()`: `ImageProcessor.generateImages()`
6. `publishToKanka()`: `KankaPublisher.publishSession()` after journal enrichment

### Stop Flow (Live Mode)

```
MainPanel._onToggleRecording()
  → orchestrator.stopLiveMode()
    → clear _liveCycleTimer
    → race: _currentCyclePromise vs 5s AbortController deadline
    → stop/cancel AudioRecorder
    → _fullTeardown():
        - unregister Foundry hooks (canvasReady)
        - abort ShutdownController
        - stop SilenceMonitor
        - end SessionAnalytics
        - clear NPC extractor
        - destroy RulesLookupService
    → emit 'session:liveStopped'
    → callbacks.onSessionEnd()
```

---

## Provider Abstraction Layer

Abstract interfaces defined in `scripts/ai/providers/`:
- `ChatProvider.mjs` — `complete(messages, options)`, `stream(messages, options)`
- `TranscriptionProvider.mjs` — `transcribe(audioBlob, options)`
- `ImageProvider.mjs` — `generateImage(prompt, options)`
- `EmbeddingProvider.mjs` — `embed(texts, options)`

Implementations:
- OpenAI: `OpenAIChatProvider`, `OpenAITranscriptionProvider`, `OpenAIImageProvider`, `OpenAIEmbeddingProvider`
- Anthropic: `AnthropicChatProvider` (dynamically imported at init if key present)
- Google: `GoogleChatProvider` (dynamically imported at init if key present)

Caching Decorators (`CachingProviderDecorator.mjs`):
- `CachingChatDecorator` — wraps chat provider with L2 CacheManager
- `CachingEmbeddingDecorator` — wraps embedding provider with L2 CacheManager

Registration flow (in `VoxChronicle.initialize()`):
1. Raw providers created
2. Cacheable providers wrapped in L2 decorators
3. Registered in `ProviderRegistry` with capability string and `default: true` flag
4. Registry emits `ai:providerRegistered` event on each registration

Per-task provider selection via `VoxChronicle.getProviderForTask(task)` — reads settings `aiProviderSuggestions`, `aiProviderRules`, `aiProviderExtraction`, falls back to registry default.

---

## RAG Provider Architecture

Abstract base: `scripts/rag/RAGProvider.mjs`

Implementations:
- `OpenAIFileSearchProvider.mjs` — uses OpenAI Responses API + `file_search` tool, hosted vector store. Requires `vectorStoreId` (persisted to settings).
- `RAGFlowProvider.mjs` — self-hosted RAGFlow API. Requires `baseUrl`, `apiKey`, optionally `datasetId`, `chatId`.

Factory: `RAGProviderFactory.create(providerType)` — creates by type string (`'openai-file-search'` or `'ragflow'`).

Connection chain (when RAG enabled):
```
VoxChronicle._initializeRAGServices()
  → RAGProviderFactory.create()
  → ragProvider.initialize(config)
  → SilenceDetector created
  → aiAssistant.setRAGProvider(ragProvider)
  → aiAssistant.setSilenceDetector(silenceDetector)
  → sessionOrchestrator.setRAGProvider(ragProvider)
```

RAG is optional — init failure emits a warning notification but does not throw.

---

## Key Abstractions

**SessionOrchestrator (`scripts/orchestration/SessionOrchestrator.mjs`):**
- Central workflow driver. Holds references to all services.
- State machine: `IDLE → RECORDING → PROCESSING → EXTRACTING → GENERATING_IMAGES → PUBLISHING → COMPLETE`
- Live states: `LIVE_LISTENING → LIVE_TRANSCRIBING → LIVE_ANALYZING`
- Sub-processors (`TranscriptionProcessor`, `EntityProcessor`, `ImageProcessor`, `KankaPublisher`) created lazily from injected services.

**EventBus (`scripts/core/EventBus.mjs`):**
- Module-level singleton (`export const eventBus`). Not class-instantiated per caller.
- Channels: `ai`, `audio`, `scene`, `session`, `ui`, `error`, `analytics`
- Format: `channel:actionCamelCase` with plain object payload
- Built-in logging middleware, error isolation per subscriber

**CacheManager (`scripts/utils/CacheManager.mjs`):**
- Generic TTL cache with prefix-based invalidation
- L2: provider-level response cache (200 entries) — shared by chat + embedding providers
- L1-suggestions: narrator suggestion cache (50 entries) — per AIAssistant instance
- L1-rules: rules lookup cache (50 entries) — per RulesReference instance

---

## Entry Points

**Foundry `init` hook (`scripts/main.mjs:146`):**
- Trigger: Foundry VTT pre-game initialization
- Responsibilities: `Settings.registerSettings()`, store `game[MODULE_ID]` stub

**Foundry `ready` hook (`scripts/main.mjs:167`):**
- Trigger: Foundry VTT fully loaded
- Responsibilities: `VoxChronicle.getInstance().initialize()`, enable debug logging

**Foundry `getSceneControlButtons` hook (`scripts/main.mjs:256`):**
- Trigger: Scene control toolbar render (once, cached in v13)
- Responsibilities: Inject `vox-chronicle` control group with 5 button tools (panel, speakerLabels, vocabulary, relationshipGraph, settings)

**Panel Open (tool click) (`scripts/main.mjs:45`):**
- Trigger: User clicks microphone button in scene controls
- Responsibilities: `getMainPanel()` → `MainPanel.getInstance()` → `panel.setEventBus()` → `panel.render(true)`

---

## Error Handling

**Strategy:** Per-layer isolation. Services never let EventBus errors break their primary function. Orchestrator never lets AI analysis errors break the transcription cycle.

**Patterns:**
- `_emitSafe()` wrappers in AudioRecorder, AudioChunker, SessionOrchestrator, TranscriptionProcessor — swallow EventBus errors with warn log
- `try/catch` wrapping all async API calls, with `_handleError(error, stage)` pushing to `session.errors[]`
- `onError` callback propagates errors to UI without throwing
- Session errors array capped at 100 entries to prevent unbounded growth
- Circuit breaker in `OpenAIClient._checkCircuitBreaker()` — halts after `maxConsecutiveFailures`
- Live cycle: transcription errors tracked in `_transcriptionConsecutiveErrors`, 3rd error shows UI warning, health degrades to `'degraded'` at 2, `'down'` at 5

---

## Cross-Cutting Concerns

**Logging:** `Logger.createChild('ServiceName')` — all classes create a named child. Prefixes all output with `VoxChronicle | ServiceName |`. Debug mode toggleable via `Logger.setDebugMode(true)`.

**Validation:** `Settings.validateOpenAIKey()`, `Settings.validateKankaToken()` — called from settings UI buttons injected via `renderSettingsConfig` hook.

**Authentication:** API keys read from Foundry settings (`game.settings.get(MODULE_ID, key)`) at init time. Never stored in module state across reinitialization.

**i18n:** All user-facing strings via `game.i18n.localize()` / `game.i18n.format()`. 8 language files (`lang/en.json` through `lang/template.json`).

---

## EventBus Wiring Audit

### Valid Channels
`ai`, `audio`, `scene`, `session`, `ui`, `error`, `analytics`

### All `emit()` Calls

| Event Name | File | Line | Notes |
|---|---|---|---|
| `ai:providerRegistered` | `scripts/ai/providers/ProviderRegistry.mjs` | 77 | On each `register()` call |
| `ai:defaultChanged` | `scripts/ai/providers/ProviderRegistry.mjs` | 159 | On `setDefault()` call |
| `ai:providerUnregistered` | `scripts/ai/providers/ProviderRegistry.mjs` | 195 | On `unregister()` call |
| `ui:transcriptEdited` | `scripts/ui/MainPanel.mjs` | 383 | Inline transcript edit |
| `ui:speakerLabelsUpdated` | `scripts/ui/MainPanel.mjs` | 1837 | Speaker labeling close |
| `audio:recordingStarted` | `scripts/audio/AudioRecorder.mjs` | 245 | |
| `audio:error` | `scripts/audio/AudioRecorder.mjs` | 248 | On start failure |
| `audio:webrtcCaptured` | `scripts/audio/AudioRecorder.mjs` | 284 | |
| `audio:chunkReady` | `scripts/audio/AudioRecorder.mjs` | 386 | Per data chunk |
| `audio:error` | `scripts/audio/AudioRecorder.mjs` | 393 | MediaRecorder error |
| `audio:recordingStopped` | `scripts/audio/AudioRecorder.mjs` | 534, 556, 566 | Timeout / success / error paths |
| `audio:recordingPaused` | `scripts/audio/AudioRecorder.mjs` | 595 | |
| `audio:recordingResumed` | `scripts/audio/AudioRecorder.mjs` | 607 | |
| `audio:levelChange` | `scripts/audio/AudioRecorder.mjs` | 832 | Per RAF frame during recording |
| `audio:chunkingStarted` | `scripts/audio/AudioChunker.mjs` | 153, 221 | Both split methods |
| `audio:chunkCreated` | `scripts/audio/AudioChunker.mjs` | 184 | Per chunk |
| `audio:chunkingComplete` | `scripts/audio/AudioChunker.mjs` | 199, 264 | Both split methods |
| `ai:speakersDetected` | `scripts/orchestration/TranscriptionProcessor.mjs` | 134 | After diarization |
| `ai:transcriptionStarted` | `scripts/orchestration/TranscriptionProcessor.mjs` | 169 | |
| `ai:transcriptionReady` | `scripts/orchestration/TranscriptionProcessor.mjs` | 194, 243 | Success paths |
| `ai:transcriptionError` | `scripts/orchestration/TranscriptionProcessor.mjs` | 254, 269 | Error paths |
| `session:liveStarted` | `scripts/orchestration/SessionOrchestrator.mjs` | 981 | |
| `ai:ragIndexingStarted` | `scripts/orchestration/SessionOrchestrator.mjs` | 1222 | |
| `ai:ragIndexingComplete` | `scripts/orchestration/SessionOrchestrator.mjs` | 1273, 1276 | Success / error |
| `session:liveStopped` | `scripts/orchestration/SessionOrchestrator.mjs` | 1507 | |
| `ai:suggestionReceived` | `scripts/orchestration/SessionOrchestrator.mjs` | 2038 | After AI analysis |
| `scene:changed` | `scripts/orchestration/SessionOrchestrator.mjs` | 2204 | Scene type transition |

### All `on()` / `once()` Listener Registrations

| Event Name | File | Line | Notes |
|---|---|---|---|
| `ai:transcriptionReady` | `scripts/ui/MainPanel.mjs` | 269 | Updates transcript tab |
| `ai:ragIndexingStarted` | `scripts/ui/MainPanel.mjs` | 277 | Updates RAG status |
| `ai:ragIndexingComplete` | `scripts/ui/MainPanel.mjs` | 291 | Updates RAG status |
| `scene:changed` | `scripts/narrator/AIAssistant.mjs` | 331 | Invalidates L1 suggestions cache |
| `session:stateChanged` | `scripts/narrator/RulesReference.mjs` | 154 | Invalidates L1 rules cache |

### Cross-Reference: EMITTED but NEVER LISTENED

These events are emitted but have no registered listeners anywhere in the codebase:

| Event | Emitted By | Impact |
|---|---|---|
| `ai:providerRegistered` | `ProviderRegistry.mjs:77` | Low — informational, no consumers |
| `ai:defaultChanged` | `ProviderRegistry.mjs:159` | Low — informational, no consumers |
| `ai:providerUnregistered` | `ProviderRegistry.mjs:195` | Low — informational, no consumers |
| `ui:transcriptEdited` | `MainPanel.mjs:383` | **MEDIUM** — emitted on every inline edit, but nothing listens. Intended for future auto-save or sync |
| `ui:speakerLabelsUpdated` | `MainPanel.mjs:1837` | Low — emitted on speaker labeling close, nothing listens |
| `audio:recordingStarted` | `AudioRecorder.mjs:245` | **MEDIUM** — no listeners; AudioRecorder is NOT passed eventBus in production (see below) |
| `audio:error` | `AudioRecorder.mjs:248, 393` | **MEDIUM** — same issue |
| `audio:webrtcCaptured` | `AudioRecorder.mjs:284` | Same issue |
| `audio:chunkReady` | `AudioRecorder.mjs:386` | Same issue |
| `audio:recordingStopped` | `AudioRecorder.mjs:534-566` | Same issue |
| `audio:recordingPaused` | `AudioRecorder.mjs:595` | Same issue |
| `audio:recordingResumed` | `AudioRecorder.mjs:607` | Same issue |
| `audio:levelChange` | `AudioRecorder.mjs:832` | Same issue |
| `audio:chunkingStarted` | `AudioChunker.mjs:153, 221` | No listeners; AudioChunker is also not passed eventBus |
| `audio:chunkCreated` | `AudioChunker.mjs:184` | Same issue |
| `audio:chunkingComplete` | `AudioChunker.mjs:199, 264` | Same issue |
| `ai:speakersDetected` | `TranscriptionProcessor.mjs:134` | **MEDIUM** — no listeners; TranscriptionProcessor is also not passed eventBus in production |
| `ai:transcriptionStarted` | `TranscriptionProcessor.mjs:169` | Same issue |
| `ai:transcriptionError` | `TranscriptionProcessor.mjs:254, 269` | Same issue |
| `session:liveStarted` | `SessionOrchestrator.mjs:981` | Low — no listeners |
| `session:liveStopped` | `SessionOrchestrator.mjs:1507` | Low — no listeners |
| `ai:suggestionReceived` | `SessionOrchestrator.mjs:2038` | **MEDIUM** — no listeners; MainPanel uses direct callbacks instead |

### Cross-Reference: LISTENED but NEVER EMITTED

| Event | Listener File | Notes |
|---|---|---|
| `session:stateChanged` | `RulesReference.mjs:154` | **BUG** — this event is never emitted anywhere. `SessionOrchestrator._updateState()` does NOT emit to EventBus. The `RulesReference` L1 cache invalidation based on this event never fires. |

### Critical EventBus Wiring Bugs

**Bug 1: `session:stateChanged` is never emitted.**
`RulesReference` subscribes to `'session:stateChanged'` to invalidate its L1 cache. However, `SessionOrchestrator._updateState()` only calls `this._callbacks.onStateChange()` — it does NOT emit to EventBus. The `RulesReference` rules cache is never invalidated by session state changes. Comment in `AIAssistant.mjs:328` also notes `scene:changed` not yet wired.

**Bug 2: AudioRecorder is never passed an eventBus in production.**
`VoxChronicle.initialize()` creates `AudioRecorder` with: `new AudioRecorder(audioSettings)` where `audioSettings = { echoCancellation, noiseSuppression }`. No `eventBus` property is included. All `audio:*` events emitted by `AudioRecorder._emitSafe()` are silently swallowed (because `this._eventBus` is null). The `audio:*` event channel is effectively dead.

**Bug 3: TranscriptionProcessor is never passed an eventBus.**
`SessionOrchestrator._initializeProcessors()` creates: `new TranscriptionProcessor({ transcriptionService, config })` — no `eventBus`. The `ai:speakersDetected`, `ai:transcriptionStarted`, `ai:transcriptionError` events are also silently swallowed. Only `ai:transcriptionReady` (the most important one) is actually wired via `SessionOrchestrator._indexJournalsForRAG()` and `MainPanel.setEventBus()` — but it still comes from `TranscriptionProcessor`, which receives no bus.

**Bug 4: AudioChunker is never passed an eventBus.**
`TranscriptionService` and `LocalWhisperService` create `new AudioChunker()` without any eventBus option. All `audio:chunking*` events are dead.

---

## Workflow Wiring Audit

### Live Mode Startup Chain

```
User clicks microphone in scene controls toolbar
  → toolHandlers.panel() [main.mjs:45]
    → getMainPanel() [main.mjs:30]
      → MainPanel.getInstance(voxChronicle.sessionOrchestrator)
      → panel.setEventBus(eventBus)
      → returns panel
    → panel.render(true)

User clicks "Start Recording" in Live tab
  → MainPanel action 'toggle-recording'
    → MainPanel._onToggleRecording() [MainPanel.mjs, static]
      → orchestrator.startLiveMode(options) [SessionOrchestrator.mjs:919]
        → _initializeJournalContext() [async]
          → journalParser.parseJournal(journalId)
          → aiAssistant.setAdventureContext(fullText)
          → chapterTracker.setSelectedJournal(journalId)
          → aiAssistant.setChapterContext(...)
          → Promise.allSettled([npcExtractor.extractProfiles(), _indexJournalsForRAG()])
        → audioRecorder.startRecording(recordingOptions)  ← emits audio:recordingStarted (but bus is null)
        → _updateState(LIVE_LISTENING)  ← calls callbacks.onStateChange (does NOT emit session:stateChanged)
        → emitSafe('session:liveStarted', ...)  ← SessionOrchestrator HAS the bus
        → _scheduleLiveCycle()
        → register canvasReady Foundry hook
        → aiAssistant.initializeRollingSummarizer(chatProvider)
        → aiAssistant.setOnAutonomousSuggestionCallback(...)
        → aiAssistant.startSilenceMonitoring()
```

**Verified:** The chain is intact. `SessionOrchestrator` DOES receive `eventBus` (passed in `VoxChronicle.initialize()` services object at line 401). Only the sub-services (AudioRecorder, TranscriptionProcessor) do not receive it.

### Live Cycle Chain

```
_scheduleLiveCycle() → setTimeout → _liveCycle()
  → _updateState(LIVE_TRANSCRIBING)
  → audioRecorder.getLatestChunk()  ← rotation, returns Blob
  → transcriptionService.transcribe(audioChunk, options)
    NOTE: Called DIRECTLY on transcriptionService, NOT via transcriptionProcessor
    transcriptionProcessor.processTranscription() is only used in Chronicle mode
  → new segments appended to _liveTranscript, _fullTranscriptText
  → sessionAnalytics.addSegment(segment) per segment
  → _updateSceneType(text)  ← may emit scene:changed
  → _runAIAnalysis(result)
    → aiAssistant.generateSuggestionsStreaming(contextText, options)
      OR aiAssistant.analyzeContext(contextText, options)
    → emitSafe('ai:suggestionReceived', ...)  ← no listeners
    → callbacks.onAISuggestion / onStreamToken / onStreamComplete  ← wired to MainPanel
    → rulesReference.detectRulesQuestion(contextText)  ← fire-and-forget
    → rulesLookupService.lookup(topic)  ← fire-and-forget
    → callbacks.onRulesCard(result)  ← wired to MainPanel
  → _scheduleLiveCycle()  ← reschedule
```

**Issue found:** In `_liveCycle`, transcription is done via `this._transcriptionService.transcribe()` directly, not via `this._transcriptionProcessor.processTranscription()`. This means `ai:transcriptionReady`, `ai:speakersDetected`, `ai:transcriptionStarted` are never emitted during live mode. Speaker label auto-apply (`applyLabelsToSegments`) also does not run in the live path. Only Chronicle mode uses `TranscriptionProcessor`.

### Chronicle Mode Chain

```
User clicks "Start Recording" in Chronicle tab
  → MainPanel._onToggleRecording()
    → orchestrator.startSession(options)  [SessionOrchestrator.mjs:294]
      → audioRecorder.startRecording(recordingOptions)

User clicks "Stop"
  → MainPanel._onToggleRecording()
    → orchestrator.stopSession(options)  [SessionOrchestrator.mjs:331]
      → audioRecorder.stopRecording()  → returns audioBlob
      → session.audioBlob = audioBlob
      → processTranscription()  [if processImmediately = true]
        → transcriptionProcessor.processTranscription(audioBlob, options)
          → emits ai:transcriptionStarted  (but processor has no bus → dead)
          → transcriptionService.transcribe(audioBlob)
          → _wireSpeakers(result)
            → addKnownSpeakers(speakerIds)
            → applyLabelsToSegments(segments)
            → emits ai:speakersDetected  (but processor has no bus → dead)
          → emits ai:transcriptionReady  (but processor has no bus → dead)
          → returns TranscriptionResult
        → session.transcript = transcriptResult
        → _extractEntities()
          → entityProcessor.extractAll(transcript.text)
          → entityProcessor.extractRelationships(transcript.text, entities)
          → callbacks.onEntityPreview(...)  [if confirmEntityCreation]
        → _generateImages()
          → imageProcessor.generateImages(moments, entities)
        → _updateState(COMPLETE)
        → callbacks.onSessionComplete(session)

User clicks "Publish to Kanka"
  → MainPanel._onPublishKanka()
    → orchestrator.publishToKanka(options)
      → callbacks.onPublishConfirmation()  [if set]
      → _enrichSessionWithJournalContext()
      → kankaPublisher.publishSession(session, options)
```

**Issue confirmed:** `ai:transcriptionReady` (listened by `MainPanel`) is never actually received because `TranscriptionProcessor` is created without an `eventBus` reference in `_initializeProcessors()`. The MainPanel transcript tab would not auto-update.

### Stop Flow (Live Mode)

```
User clicks "Stop" button during live mode
  → MainPanel._onToggleRecording()
    → orchestrator.stopLiveMode()  [SessionOrchestrator.mjs:1406]
      → _isStopping = true
      → _liveMode = false
      → clearTimeout(_liveCycleTimer)
      → Promise.race([_currentCyclePromise, 5s deadline])
      → If no timeout:
          → audioRecorder.stopRecording()  → audioBlob stored in session
      → If timeout:
          → shutdownController.abort()
          → audioRecorder.cancel()
      → _fullTeardown()
          → Hooks.off('canvasReady', ...)
          → shutdownController.abort()
          → aiAssistant._silenceMonitor.setIsCycleInFlightFn(null)
          → aiAssistant.stopSilenceMonitoring()
          → sessionAnalytics.endSession()
          → npcExtractor.clear()
          → rulesLookupService.destroy()
      → emitSafe('session:liveStopped', ...)  ← no listeners
      → _updateState(IDLE)
      → callbacks.onSessionEnd()
```

**Stop flow is clean and complete.** The 5-second deadline prevents hanging if a cycle is mid-flight.

---

## Service Initialization Audit

Services created in `VoxChronicle.initialize()`:

| Service | Created When | Passed to SessionOrchestrator | Notes |
|---|---|---|---|
| `ProviderRegistry` | Always (singleton) | No — accessed directly | Global singleton |
| `OpenAIChatProvider` (cached) | `openaiApiKey` present | As `aiAssistant.chatProvider` | Via `registry.getProvider('chat')` |
| `OpenAITranscriptionProvider` | `openaiApiKey` present | As `transcriptionService` (via factory) | |
| `OpenAIImageProvider` | `openaiApiKey` present | As `imageGenerationService` | |
| `OpenAIEmbeddingProvider` (cached) | `openaiApiKey` present | No direct pass | Via registry |
| `AnthropicChatProvider` | `anthropicApiKey` present | Indirectly via registry | Dynamic import |
| `GoogleChatProvider` | `googleApiKey` present | Indirectly via registry | Dynamic import |
| `AudioRecorder` | Always (if not exists) | `services.audioRecorder` | Created once, reused across reinit |
| `TranscriptionService` | Always (via factory) | `services.transcriptionService` | May be null if no API key |
| `ImageGenerationService` | `openaiApiKey` present | `services.imageGenerationService` | |
| `EntityExtractor` | `openaiApiKey` present | `services.entityExtractor` | |
| `NarrativeExporter` | `kankaApiToken && kankaCampaignId` | `services.narrativeExporter` | |
| `KankaService` | `kankaApiToken && kankaCampaignId` | `services.kankaService` | |
| `AIAssistant` | `openaiApiKey` present | `services.aiAssistant` | Receives eventBus |
| `JournalParser` | Once (not reinitialized) | Via `setNarratorServices()` | Created if not exists |
| `CompendiumParser` | Once (not reinitialized) | Not passed to orchestrator | **CONCERN: Created but not in setNarratorServices()** |
| `ChapterTracker` | Once (not reinitialized) | Via `setNarratorServices()` | |
| `SceneDetector` | Once (not reinitialized) | Via `setNarratorServices()` | |
| `SessionAnalytics` | Once (not reinitialized) | Via `setNarratorServices()` | |
| `RulesReference` | `rulesDetection !== false` | Via `setNarratorServices()` | Receives eventBus |
| `RulesLookupService` | `rulesDetection !== false && openaiApiKey` | Via `setNarratorServices()` | |
| `RAGProvider` | `ragEnabled && appropriate keys` | Via `sessionOrchestrator.setRAGProvider()` | Optional |
| `SilenceDetector` | With RAG services | Via `aiAssistant.setSilenceDetector()` | Not in orchestrator services object |
| `CacheManager` (L2) | `openaiApiKey` present | No | Provider-level cache |
| `CacheManager` (L1-suggestions) | `openaiApiKey` present | No | AIAssistant's cache |
| `CacheManager` (L1-rules) | `rulesDetection !== false` | No | RulesReference's cache |

**Service Wiring Issues Found:**

1. **`CompendiumParser` is created but never passed to SessionOrchestrator.** `setNarratorServices()` at line 469 does not include `compendiumParser`. The orchestrator has no reference to it. `CompendiumParser` appears to only be useful for offline context — no live mode integration.

2. **`SilenceDetector` is wired to AIAssistant but not to SessionOrchestrator.** `SilenceDetector` is passed via `aiAssistant.setSilenceDetector()`. The orchestrator interacts with it only indirectly via `aiAssistant.startSilenceMonitoring()` / `stopSilenceMonitoring()`. This is intentional by design.

3. **`AudioRecorder` is NOT passed the `eventBus`.** As documented in the EventBus audit above, `new AudioRecorder(audioSettings)` does not include `eventBus`. All audio events are effectively dead.

4. **`TranscriptionProcessor` is NOT passed the `eventBus`.** Created in `_initializeProcessors()` without it. All transcription-phase events (`ai:transcriptionReady`, etc.) are dead in both live and chronicle modes.

5. **`KankaEntityManager` is imported in `scripts/kanka/KankaEntityManager.mjs` but never instantiated in `VoxChronicle.initialize()`.** It is presumably used internally by `KankaService` or `KankaPublisher`. Needs verification.

---

*Architecture analysis: 2026-03-19*
