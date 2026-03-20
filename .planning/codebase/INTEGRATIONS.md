# External Integrations

**Analysis Date:** 2026-03-19

## APIs & External Services

### OpenAI

**Transcription:**
- Service: OpenAI Audio API (GPT-4o transcribe with speaker diarization)
- Model: `gpt-4o-transcribe` / `gpt-4o-transcribe-diarize`
- Implementation: `scripts/ai/TranscriptionService.mjs`, `scripts/ai/providers/OpenAITranscriptionProvider.mjs`
- Transport: `scripts/ai/OpenAIClient.mjs` → `https://api.openai.com/v1`
- Auth env var: `game.settings.get(MODULE_ID, 'openaiApiKey')` (client-scoped Foundry setting)
- Queue category: `'transcription'` (parallel queue)
- Format: FormData (NOT JSON) — required by OpenAI audio API
- **Status: FULLY WIRED** — called in `TranscriptionProcessor.mjs` → `SessionOrchestrator._liveCycle()`

**Chat / AI Suggestions:**
- Service: OpenAI Chat Completions API
- Models: GPT-4o, GPT-4o-mini (configurable)
- Implementation: `scripts/ai/providers/OpenAIChatProvider.mjs`
- Transport: `scripts/ai/OpenAIClient.mjs`
- Used by: `scripts/narrator/AIAssistant.mjs`, `scripts/narrator/RulesReference.mjs`, `scripts/ai/EntityExtractor.mjs`
- Queue category: `'chat'` (parallel queue, separate from transcription/image)
- Streaming: `chatStream()` via SSE in `OpenAIClient.postStream()`
- **Status: FULLY WIRED** — `ProviderRegistry.getProvider('chat')` returns `OpenAIChatProvider`

**Image Generation:**
- Service: OpenAI Images API
- Model: `gpt-image-1` (NOT dall-e-3)
- Implementation: `scripts/ai/providers/OpenAIImageProvider.mjs`, `scripts/ai/ImageGenerationService.mjs`
- Transport: `scripts/ai/OpenAIClient.mjs`
- Queue category: `'image'`
- Response format: base64 (`b64_json`), NOT URL
- **Status: FULLY WIRED** — called in `ImageProcessor.mjs` → `SessionOrchestrator`

**Embeddings:**
- Service: OpenAI Embeddings API
- Model: `text-embedding-3-small`
- Implementation: `scripts/ai/providers/OpenAIEmbeddingProvider.mjs`
- Transport: `scripts/ai/OpenAIClient.mjs`
- Queue category: `'embedding'`
- **Status: FULLY WIRED** — used via `CachingEmbeddingDecorator` in `VoxChronicle.mjs`

**OpenAI File Search (RAG v3.0):**
- Service: OpenAI Responses API + `file_search` tool
- Implementation: `scripts/rag/OpenAIFileSearchProvider.mjs`
- Vector store TTL: 30 days after last use
- Max file size: 512MB
- **Status: FULLY WIRED** — instantiated by `RAGProviderFactory` when `ragProvider` setting = `'openai-file-search'`

**OpenAI Client Architecture:**
- Base transport: `scripts/ai/OpenAIClient.mjs` (extends `BaseAPIClient`)
- Features: retry with exponential backoff + jitter (3 retries), per-category parallel queues (`chat`, `transcription`, `image`, `embedding`, `default`), circuit breaker (5 consecutive failures → open, 60s cooldown), AbortController with `{ signal }` cleanup pattern, SSE streaming, rate limiting via `scripts/utils/RateLimiter.mjs`
- SSE stream timeout: server-side deadline on header receipt (fixed in v4.0.3)

### Anthropic (Claude)

- Service: Anthropic Messages API
- Endpoint: `https://api.anthropic.com/v1/messages`
- Implementation: `scripts/ai/providers/AnthropicChatProvider.mjs`
- Auth: `game.settings.get(MODULE_ID, 'anthropicApiKey')` (client-scoped)
- Capability: `chat` only (no transcription/image/embedding)
- Wired in `VoxChronicle.mjs` — lazy-imported and registered in `ProviderRegistry` when API key is present
- **Status: FULLY WIRED** — registered conditionally in `VoxChronicle.initialize()` when `anthropicApiKey` setting is set

### Google (Gemini)

- Service: Google Generative Language API
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models`
- Implementation: `scripts/ai/providers/GoogleChatProvider.mjs`
- Auth: API key passed as URL query parameter (Google's required pattern) — `game.settings.get(MODULE_ID, 'googleApiKey')` (client-scoped)
- Known risk: API key in URL query param (logged in TODO.md as LOW security item — Google's required pattern)
- Capability: `chat` only
- **Status: FULLY WIRED** — same pattern as Anthropic in `VoxChronicle.initialize()`

### Kanka

- Service: Kanka Campaign Management API
- Endpoint: `https://api.kanka.io/1.0`
- Implementation: `scripts/kanka/KankaClient.mjs`, `scripts/kanka/KankaService.mjs`, `scripts/kanka/KankaEntityManager.mjs`
- Auth: `game.settings.get(MODULE_ID, 'kankaApiToken')` (client-scoped), `game.settings.get(MODULE_ID, 'kankaCampaignId')` (world-scoped)
- Rate limiting: 30 req/min (free tier), 90 req/min (premium) — handled via `scripts/utils/RateLimiter.mjs`
- 429 handling: 60s backoff + retry
- Entities managed: Characters (NPCs), Locations, Items, Journals (chronicles)
- Token expiry: 364 days (no auto-refresh warning implemented)
- **Status: FULLY WIRED** — called through `KankaPublisher.mjs` → `SessionOrchestrator`

### RAGFlow (Self-Hosted)

- Service: Self-hosted RAGFlow instance (open-source)
- Endpoint: Configurable via `game.settings.get(MODULE_ID, 'ragFlowApiUrl')` (client-scoped)
- Auth: `game.settings.get(MODULE_ID, 'ragFlowApiKey')` (client-scoped)
- Implementation: `scripts/rag/RAGFlowProvider.mjs`
- Rate limiting: via `scripts/utils/RateLimiter.mjs`
- Document parsing: async polling with 2s interval, 5min timeout
- **Status: FULLY WIRED** — instantiated by `RAGProviderFactory` when `ragProvider` setting = `'ragflow'`

### Local Whisper (Self-Hosted)

- Service: whisper.cpp HTTP server
- Implementation: `scripts/ai/LocalWhisperService.mjs`, `scripts/ai/WhisperBackend.mjs`
- Endpoint: Configurable URL (client-scoped setting)
- Used by: `TranscriptionFactory.mjs` when `transcriptionMode` = `'local'`
- **Status: FULLY WIRED** — optional mode selectable via `transcriptionMode` setting

## Data Storage

**Databases:**
- None (no SQL/NoSQL database)
- Foundry VTT settings API — world-scoped and client-scoped settings storage
  - Client: `game.settings.register(MODULE_ID, key, { scope: 'client' })` — per-user (API keys, preferences)
  - World: `game.settings.register(MODULE_ID, key, { scope: 'world' })` — shared campaign data (Kanka IDs, campaign settings)
- IndexedDB (browser) — crash recovery for audio chunks
  - Used in `scripts/audio/AudioRecorder.mjs` via `_persistChunk()` / `recoverChunks()`

**File Storage:**
- None permanently — images generated as base64, uploaded to Kanka immediately
- Temporary: audio blobs in memory (capped at 5000 chunks per session, ~13 hours)

**Caching:**
- L1 (in-memory, service layer): `CacheManager` instances in `AIAssistant.mjs` and `RulesReference.mjs`
  - `AIAssistant`: key `narrator:suggestion:{sceneType}:{chapterKey}`, TTL 30s-2min, invalidated on `scene:changed`
  - `RulesReference`: key `narrator:rules:{hash(query)}`, TTL 5min, invalidated on `session:stateChanged`
- L2 (in-memory, provider layer): `CachingProviderDecorator` wrapping `OpenAIChatProvider` and `OpenAIEmbeddingProvider`
  - Chat: key `openai:chat:{hash(messages+model+temp)}`, TTL 1h
  - Embeddings: key `openai:embedding:{hash(text+model)}`, TTL 24h
- `CacheManager` utility: `scripts/utils/CacheManager.mjs` (maxSize, TTL, invalidatePrefix, stats)

## Authentication & Identity

**Auth Provider:**
- Foundry VTT native (no external auth)
- All API keys stored in Foundry settings (not source code, not .env files)
- Keys registered at `init` hook before `game` is fully loaded

**API Key Settings:**
- `openaiApiKey` (client-scope) — OpenAI API key
- `anthropicApiKey` (client-scope) — Anthropic Claude API key
- `googleApiKey` (client-scope) — Google Gemini API key
- `kankaApiToken` (client-scope) — Kanka API token (expires 364 days)
- `kankaCampaignId` (world-scope) — Kanka campaign ID
- `ragFlowApiKey` (client-scope) — RAGFlow API key
- `ragFlowApiUrl` (client-scope) — RAGFlow base URL

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service like Sentry)
- Internal: `EventBus` dual-channel error pattern — `error:user` (toast UI), `error:technical` (debug log)
- Circuit breaker state tracked per service via `ResilienceRegistry`... NOTE: `ResilienceRegistry.mjs` was **removed** in v4.0.3 (dead infrastructure never imported in production). The dual-error-channel pattern from `EventBus.mjs` remains.

**Logs:**
- `scripts/utils/Logger.mjs` — module-prefixed logging with `VoxChronicle |` prefix
- Log levels: DEBUG, INFO, WARN, ERROR
- `SensitiveDataFilter` (`scripts/utils/SensitiveDataFilter.mjs`) applied to filter API keys from logs
- Debug mode: toggleable via Foundry module settings

## CI/CD & Deployment

**Hosting:**
- GitHub Releases — ZIP and standalone `module.json` uploaded as release assets
- Manifest URL: `https://github.com/Aiacos/VoxChronicle/releases/latest/download/module.json`
- No server-side hosting required — Foundry VTT installs directly from GitHub releases

**CI Pipeline:**
- GitHub Actions: `.github/workflows/release.yml`
- Test gate blocks release on failure

## Webhooks & Callbacks

**Incoming:**
- None (no webhooks received)

**Outgoing:**
- None (no webhooks sent)
- All integration is synchronous REST (fetch) or SSE (streaming)

## Provider Abstraction System

All AI integrations go through the provider abstraction layer in `scripts/ai/providers/`:

| Interface | Location | Implementations |
|-----------|----------|-----------------|
| `ChatProvider` | `scripts/ai/providers/ChatProvider.mjs` | OpenAI, Anthropic, Google |
| `TranscriptionProvider` | `scripts/ai/providers/TranscriptionProvider.mjs` | OpenAI, LocalWhisper (via factory) |
| `ImageProvider` | `scripts/ai/providers/ImageProvider.mjs` | OpenAI (gpt-image-1) |
| `EmbeddingProvider` | `scripts/ai/providers/EmbeddingProvider.mjs` | OpenAI |

Registry: `scripts/ai/providers/ProviderRegistry.mjs` — singleton, capability-based selection. Callers use `ProviderRegistry.getProvider('chat')` not provider names directly.

Cache decorator: `scripts/ai/providers/CachingProviderDecorator.mjs` — transparent wrapper applied to Chat and Embedding providers in `VoxChronicle.initialize()`.

RAG abstraction: `scripts/rag/RAGProvider.mjs` (abstract base), factory: `scripts/rag/RAGProviderFactory.mjs`.

---

## BMAD Spec Implementation Audit

This section cross-references every file in `_bmad-output/implementation-artifacts/` against actual code in `scripts/` to verify implementation status.

### Sprint Status Overview

All 8 epics and 22 stories are marked `done` in `sprint-status.yaml` (generated 2026-03-13).

---

### Story 1.1: Fix Bug Critici e Importanti

**Spec file:** `_bmad-output/implementation-artifacts/1-1-fix-bug-critici-e-importanti.md`

**Specified:** Fix 10 bugs (3 CRITICAL, 7 IMPORTANT) in `main.mjs`, `VoxChronicle.mjs`, `SessionOrchestrator.mjs`, `OpenAIClient.mjs`, `MainPanel.mjs`, `Settings.mjs`

**Verified IMPLEMENTED:**
- `main.mjs` — `vc.orchestrator` → `vc.sessionOrchestrator` rename confirmed in current code
- `VoxChronicle.mjs` — `static _hooksRegistered = false` declaration present (line ~62)
- `SessionOrchestrator.mjs` — `_aiSuggestionHealth` transitions (healthy/degraded/down) present
- `SessionOrchestrator.mjs` — `_reindexQueue` as `Set` (not string|null) confirmed
- `SessionOrchestrator.mjs` — `_shutdownController = null` after abort confirmed
- `Settings.mjs` — duplicate `onChange` for `kankaApiToken` removed
- `MainPanel.mjs` — shallow copy in `_prepareContext` image mapping confirmed

**Status: FULLY IMPLEMENTED**

---

### Story 1.2: Event Bus con Canali Tipizzati

**Spec file:** `_bmad-output/implementation-artifacts/1-2-event-bus-con-canali-tipizzati.md`

**Specified:** `EventBus` class with 7 typed channels (ai, audio, scene, session, ui, error, analytics), pub/sub, middleware, singleton export

**Verified IMPLEMENTED:**
- `scripts/core/EventBus.mjs` — exists, exports `eventBus` singleton and `EventBus` class
- `tests/core/EventBus.test.js` — exists with 33+ tests
- Imported by: `VoxChronicle.mjs`, `ProviderRegistry.mjs`, `AudioRecorder.mjs`, `TranscriptionProcessor.mjs`, `MainPanel.mjs`, `SessionOrchestrator.mjs`, `AIAssistant.mjs`

**Status: FULLY IMPLEMENTED AND INTEGRATED**

---

### Story 1.3: State Machine Sessione Formale

**Spec file:** `_bmad-output/implementation-artifacts/1-3-state-machine-sessione-formale.md`

**Specified:** `SessionStateMachine` class with 8 states, transition matrix, guard system, EventBus integration, serialization

**Verified REMOVED:**
- `scripts/core/SessionStateMachine.mjs` — **does NOT exist** in current codebase
- `tests/core/SessionStateMachine.test.js` — does NOT exist
- Reason: Removed in v4.0.3 audit as "dead infrastructure never imported in production code" (`TODO.md` line 124)
- The spec was implemented and then removed during architecture cleanup — SessionOrchestrator continues to manage its own state internally via the original `SessionState` enum (12 states)

**Status: IMPLEMENTED THEN REMOVED — NOT PRESENT IN PRODUCTION**
**Impact:** Session state management reverts to imperative if/else in `SessionOrchestrator.mjs` (2218 LOC, cited as architectural concern in TODO.md)

---

### Story 1.4: ResilienceRegistry Centralizzato

**Spec file:** `_bmad-output/implementation-artifacts/1-4-resilienceregistry-centralizzato.md`

**Specified:** `ResilienceRegistry` singleton with circuit breaker (CLOSED/OPEN/HALF_OPEN), fallback chain, dual error channel via EventBus, auto-recovery timer

**Verified REMOVED:**
- `scripts/core/ResilienceRegistry.mjs` — **does NOT exist** in current codebase
- `tests/core/ResilienceRegistry.test.js` — does NOT exist
- Reason: Removed in v4.0.3 audit as "dead infrastructure never imported in production code" (`TODO.md` line 123)
- Circuit breaker functionality remains in `OpenAIClient.mjs` (legacy mechanism with `consecutiveFailures` counter) — not replaced by ResilienceRegistry

**Status: IMPLEMENTED THEN REMOVED — NOT PRESENT IN PRODUCTION**
**Impact:** No centralized resilience management. Services rely on `OpenAIClient`'s built-in retry/circuit breaker. Fallback chains are not implemented.

---

### Story 1.5: Design Token System CSS

**Spec file:** `_bmad-output/implementation-artifacts/1-5-design-token-system-css.md`

**Specified:** 3-layer CSS token system (primitives → semantic → component), migration of all hex values in `vox-chronicle.css`, namespace audit, `module.json` styles array update

**Verified IMPLEMENTED:**
- `styles/tokens/primitives.css` — exists
- `styles/tokens/semantic.css` — exists
- `styles/tokens/components.css` — exists
- `styles/vox-chronicle.css` — migrated to `var(--vox-*)` references
- `module.json` styles array — 4 files in correct order (primitives, semantic, components, main)

**Status: FULLY IMPLEMENTED**

---

### Story 2.1: AI Provider Interface e ProviderRegistry

**Spec file:** `_bmad-output/implementation-artifacts/2-1-ai-provider-interface-e-providerregistry.md`

**Specified:** 4 abstract provider interfaces (ChatProvider, TranscriptionProvider, ImageProvider, EmbeddingProvider) + ProviderRegistry singleton

**Verified IMPLEMENTED:**
- `scripts/ai/providers/ChatProvider.mjs` — exists
- `scripts/ai/providers/TranscriptionProvider.mjs` — exists
- `scripts/ai/providers/ImageProvider.mjs` — exists
- `scripts/ai/providers/EmbeddingProvider.mjs` — exists
- `scripts/ai/providers/ProviderRegistry.mjs` — exists, used in `VoxChronicle.mjs`
- All 5 test files in `tests/ai/providers/` exist

**Status: FULLY IMPLEMENTED**

---

### Story 2.2: Implementazione OpenAI Provider

**Spec file:** Not present in `_bmad-output/implementation-artifacts/` (no `2-2-*.md` file)

**Specified (inferred from sprint-status.yaml):** OpenAI concrete implementations for all 4 provider interfaces

**Verified IMPLEMENTED:**
- `scripts/ai/providers/OpenAIChatProvider.mjs` — exists
- `scripts/ai/providers/OpenAITranscriptionProvider.mjs` — exists
- `scripts/ai/providers/OpenAIImageProvider.mjs` — exists
- `scripts/ai/providers/OpenAIEmbeddingProvider.mjs` — exists
- All 4 test files in `tests/ai/providers/` exist

**Status: FULLY IMPLEMENTED (no spec file present)**

---

### Story 2.3: Parallelizzazione Code AI e Cache a Due Livelli

**Spec file:** `_bmad-output/implementation-artifacts/2-3-parallelizzazione-code-ai-e-cache-a-due-livelli.md`

**Specified:** Per-category queues in `OpenAIClient`, L1 semantic cache in narrator services, L2 content cache via `CachingProviderDecorator`, EventBus-driven cache invalidation

**Verified IMPLEMENTED:**
- `OpenAIClient.mjs` — `queueCategory` parameter on `post()`, `postFormData()`, `postStream()`; separate queues for `chat`, `transcription`, `image`, `embedding`, `default`
- `scripts/ai/providers/CachingProviderDecorator.mjs` — exists, exports `CachingChatDecorator` and `CachingEmbeddingDecorator`
- `CacheManager.mjs` — `invalidatePrefix()`, `setWithTTL()`, `stats` getter added
- `AIAssistant.mjs` — L1 cache with scene:changed invalidation
- `RulesReference.mjs` — L1 cache with session:stateChanged invalidation
- `VoxChronicle.mjs` — wires L2 decorator before registry registration

**Status: FULLY IMPLEMENTED**

---

### Story 2.4: StreamController UI

**Spec file:** `_bmad-output/implementation-artifacts/2-4-streamcontroller-ui.md`

**Specified:** `StreamController` class for 60fps token buffering, cursor animation, EventBus streaming events (`ai:streamStart`, `ai:token`, `ai:streamEnd`, `ai:streamError`), cancellation, CSS streaming classes

**Verified REMOVED:**
- `scripts/ai/StreamController.mjs` — **does NOT exist** in current codebase
- `tests/ai/StreamController.test.js` — does NOT exist
- Reason: Removed in v4.0.3 audit as "dead code never imported" (`TODO.md` line 125)
- Streaming token display in `MainPanel.mjs` handled via direct DOM manipulation (`_handleStreamToken()`, `_handleStreamComplete()`) without a dedicated StreamController class

**Status: IMPLEMENTED THEN REMOVED — NOT PRESENT IN PRODUCTION**
**Impact:** Streaming UI works but without the 60fps buffer abstraction. EventBus events `ai:streamStart`, `ai:token`, `ai:streamEnd` may still be emitted by the orchestrator directly.

---

### Story 3.1: Registrazione Audio Completa con Safari Fallback

**Spec file:** `_bmad-output/implementation-artifacts/3-1-registrazione-audio-completa-con-safari-fallback.md`

**Specified:** EventBus integration in AudioRecorder, Safari codec fallback (MP4/AAC), IndexedDB crash recovery, WebRTC peer capture, AudioChunker EventBus events

**Verified IMPLEMENTED:**
- `scripts/audio/AudioRecorder.mjs` — EventBus events (`audio:recordingStarted`, `audio:recordingStopped`, `audio:chunkReady`, `audio:error`, `audio:levelChange`) present
- `_detectOptimalCodec()` — Safari fallback chain implemented
- `_persistChunk()`, `recoverChunks()`, `clearPersistedChunks()` — IndexedDB crash recovery
- `_captureWebRTCStream()` — WebRTC capture with `game.webrtc` integration
- `audioCaptureMode` setting — microphone | webrtc | mixed
- `scripts/audio/AudioChunker.mjs` — EventBus events for chunking added
- 173 AudioRecorder tests pass, 58 AudioChunker tests pass (per spec retro)

**Status: FULLY IMPLEMENTED**

---

### Story 3.2: Trascrizione con Diarizzazione e Multi-Lingua

**Spec file:** `_bmad-output/implementation-artifacts/3-2-trascrizione-con-diarizzazione-e-multi-lingua.md`

**Specified (inferred from retro):** GPT-4o transcription with speaker diarization, multi-language support, EventBus `ai:transcriptionReady` event

**Verified IMPLEMENTED:**
- `scripts/ai/TranscriptionService.mjs` — diarization with `gpt-4o-transcribe-diarize` model
- `scripts/ai/TranscriptionFactory.mjs` — cloud/local/auto mode factory
- `ai:transcriptionReady` event emitted and consumed by `MainPanel.mjs`

**Status: FULLY IMPLEMENTED**

---

### Story 3.3: Mappatura Speaker e Revisione Trascrizione

**Spec file:** `_bmad-output/implementation-artifacts/3-3-mappatura-speaker-e-revisione-trascrizione.md`

**Specified:** SpeakerLabeling wiring in transcription flow, cross-session mapping persistence, transcript review PART in MainPanel (`transcriptReview`), inline editing, EventBus integration

**Verified IMPLEMENTED:**
- `templates/parts/transcript-review.hbs` — exists
- `MainPanel.mjs` — `transcriptReview` registered in `PARTS`
- `scripts/ui/SpeakerLabeling.mjs` — inline rename, `applyLabelsToSegments()`, `addKnownSpeakers()`
- `scripts/utils/SpeakerUtils.mjs` — extracted from UI layer (layer violation fix)
- `EventBus` events: `ai:speakersDetected`, `ui:transcriptEdited`, `ui:speakerLabelsUpdated`
- Cross-session persistence via world-scoped settings

**Status: FULLY IMPLEMENTED**

---

### Story 4.1: Avvio Sessione Live e Ciclo AI

**Spec file:** `_bmad-output/implementation-artifacts/4-1-avvio-sessione-live-e-ciclo-ai.md`

**Specified:** Live session start/stop, AI cycle (chunk → transcribe → analyze), adaptive chunking via SilenceDetector, live tab PART in MainPanel, EventBus events `session:liveStarted`/`session:liveStopped`/`ai:suggestionReceived`

**Verified IMPLEMENTED:**
- `SessionOrchestrator.startLiveMode()` — initializes AudioRecorder, TranscriptionService, AIAssistant, SilenceDetector, SessionAnalytics
- `_liveCycle()` — continuous loop confirmed
- `adaptiveChunkingEnabled` and `liveBatchDuration` settings registered
- `_handleStreamToken()`, `_handleStreamComplete()` in `MainPanel.mjs`
- `session:liveStarted`, `session:liveStopped` emitted
- Live PART in main-panel.hbs confirmed

**Status: FULLY IMPLEMENTED**

---

### Story 4.2: Suggerimenti Contestuali da Journal e RAG

**Spec file:** `_bmad-output/implementation-artifacts/4-2-suggerimenti-contestuali-da-journal-e-rag.md`

**Specified:** RAG pipeline in live cycle, journal selection, multi-journal indexing, EventBus `ai:ragIndexingStarted`/`ai:ragIndexingComplete`, performance, configurable RAG backend

**Verified IMPLEMENTED:**
- `AIAssistant._getRAGContext()` — retrieves context from configured RAG provider
- `_indexJournalsForRAG()` — indexes selected + supplementary journals
- `ai:ragIndexingStarted`, `ai:ragIndexingComplete` emitted from `SessionOrchestrator`
- RAG status UI in `main-panel.hbs` (indexing/indexed/empty/disabled badges)
- `liveJournalId`, `supplementaryJournalIds` settings
- `RAGProviderFactory` — selects provider based on `ragProvider` setting

**Status: FULLY IMPLEMENTED**

---

### Story 4.3: Rules Q&A con Compendi Foundry

**Spec file:** `_bmad-output/implementation-artifacts/4-3-rules-qa-con-compendi-foundry.md`

**Specified (inferred from retro):** Rules lookup from Foundry compendiums, ChatProvider integration in RulesReference, two-phase hybrid lookup

**Verified IMPLEMENTED:**
- `scripts/narrator/RulesReference.mjs` — compendium-backed rules lookup with ChatProvider
- `scripts/narrator/RulesLookupService.mjs` — two-phase hybrid lookup
- `scripts/narrator/CompendiumParser.mjs` — text chunking for compendium content
- Manual rules query via input bar → `orchestrator.handleManualRulesQuery()`

**Status: FULLY IMPLEMENTED**

---

### Story 4.4: Rilevamento Tipo Scena

**Spec file:** `_bmad-output/implementation-artifacts/4-4-rilevamento-tipo-scena.md`

**Specified (inferred from retro):** Scene type detection (combat, social, exploration, rest), EventBus `scene:typeDetected`, SceneDetector using ChatProvider

**Verified IMPLEMENTED:**
- `scripts/narrator/SceneDetector.mjs` — 4 scene types, ChatProvider-based detection
- `scene:typeDetected` event emitted
- `scene:changed` event triggers cache invalidation
- `SceneDetector.getSceneType()` public getter confirmed

**Status: FULLY IMPLEMENTED**

---

### Story 5.1: Estrazione Entita' e Revisione

**Spec file:** `_bmad-output/implementation-artifacts/5-1-estrazione-entita-e-revisione.md`

**Specified:** Entity extraction pipeline (NPCs, locations, items), EntityPreview wiring in chronicle workflow, Kanka deduplication

**Verified IMPLEMENTED:**
- `scripts/ai/EntityExtractor.mjs` — 960 lines, ChatProvider-based extraction with relationships
- `scripts/orchestration/EntityProcessor.mjs` — orchestration, Kanka dedup via `getExistingKankaEntities()`
- `scripts/ui/EntityPreview.mjs` — review dialog, selection, batch creation
- `onEntityPreview` callback wired in `SessionOrchestrator` after `_extractEntities()`
- 70 EntityExtractor tests, 45 EntityProcessor tests, 100+ EntityPreview tests

**Status: FULLY IMPLEMENTED**

---

### Story 5.2: Generazione Immagini e Cronaca Narrativa

**Spec file:** `_bmad-output/implementation-artifacts/5-2-generazione-immagini-e-cronaca-narrativa.md`

**Specified (inferred from sprint-status):** Image generation for extracted entities, narrative chronicle formatting

**Verified IMPLEMENTED:**
- `scripts/orchestration/ImageProcessor.mjs` — image generation workflow
- `scripts/ai/ImageGenerationService.mjs` — gpt-image-1 integration (base64 response)
- `scripts/kanka/NarrativeExporter.mjs` — transcript → Kanka journal format
- `ImageProcessor.generateImages()` now throws on catastrophic failure (v4.0.3 fix)

**Status: FULLY IMPLEMENTED**

---

### Story 5.3: Pubblicazione su Kanka

**Spec file:** `_bmad-output/implementation-artifacts/5-3-pubblicazione-su-kanka.md`

**Specified (inferred from sprint-status):** Publish entities and chronicles to Kanka API

**Verified IMPLEMENTED:**
- `scripts/orchestration/KankaPublisher.mjs` — full publish workflow
- `scripts/kanka/KankaEntityManager.mjs` — entity lifecycle, `searchEntities()` deduplication
- `scripts/kanka/KankaService.mjs` — CRUD for all Kanka entity types
- `scripts/kanka/KankaClient.mjs` — rate-limited HTTP client

**Status: FULLY IMPLEMENTED**

---

### Story 6.1: Pannello Collassabile con LED System

**Spec file:** `_bmad-output/implementation-artifacts/6-1-pannello-collassabile-con-led-system.md`

**Specified:** Collapsible panel (48px ↔ 320px), LED status indicators (6 colors), VU meter, progress bar, localStorage persistence

**Verified IMPLEMENTED:**
- `scripts/ui/MainPanel.mjs` — `_onToggleCollapse()`, `#collapsed` field, `panelCollapsed` setting
- CSS: `.vox-chronicle-panel--collapsed`, `vox-led-pulse` keyframe, streaming violet
- VU meter with `audioLevel` dynamic width
- State persisted to Foundry settings (not localStorage directly)
- Collapse toggle has `aria-label`

**Status: FULLY IMPLEMENTED**

---

### Story 6.2: First Launch Screen e Tab Contestuali

**Spec file:** `_bmad-output/implementation-artifacts/6-2-first-launch-screen-e-tab-contestuali.md`

**Specified (inferred from sprint-status):** First launch welcome screen, context-aware tab visibility

**Verified IMPLEMENTED:**
- `MainPanel.mjs` — `VALID_TABS` array, context-aware tabs: live mode shows `['live', 'transcript', 'analytics']`; chronicle mode shows all 6 tabs
- `isLiveMode` flag passed to template context

**Status: FULLY IMPLEMENTED**

---

### Story 6.3: Input Bar e Notifiche Real-Time

**Spec file:** `_bmad-output/implementation-artifacts/6-3-input-bar-e-notifiche-real-time.md`

**Specified:** Persistent query input bar (live mode only), query routing to `handleManualRulesQuery()`, real-time EventBus notifications, Settings integration

**Verified IMPLEMENTED:**
- `templates/main-panel.hbs` — rules input wrapped in `{{#if isLiveMode}}` conditional
- `MainPanel._onRender()` — Enter key wired to `orchestrator.handleManualRulesQuery()`
- EventBus listeners: `ai:transcriptionReady`, `ai:ragIndexingStarted`, `ai:ragIndexingComplete` active in `MainPanel`
- All Foundry settings accessible via Module Settings UI

**Status: FULLY IMPLEMENTED**

---

### Stories 7.1-7.2: Multi-Provider AI (Epics 7-8)

**Spec files:** No spec files exist in `_bmad-output/implementation-artifacts/` for Epic 7 or 8 stories

**Sprint status:** Marked `done` for: 7-1-provider-anthropic-e-google, 7-2-selezione-modello-per-task-e-status-provider, 8-1-dashboard-analytics-sessione, 8-2-navigazione-tastiera-e-accessibilita-wcag-aaa

**Verified IMPLEMENTED (no spec file to compare against):**
- Story 7.1 — `AnthropicChatProvider.mjs` and `GoogleChatProvider.mjs` present and wired
- Story 7.2 — `anthropicApiKey`, `googleApiKey` settings registered; per-task model selection via `ProviderRegistry.setDefault()`
- Story 8.1 — `SessionAnalytics.mjs` with dashboard data; `templates/analytics-tab.hbs` exists; analytics tab in `VALID_TABS`
- Story 8.2 — `aria-label` on collapse toggle, `aria-live="polite"` on suggestions container, keyboard navigation via Foundry ApplicationV2 (partial — only 2 aria attributes visible in templates)

**Status: IMPLEMENTED per sprint-status.yaml, NO SPEC FILES available for detailed cross-check**

---

### Retrospective Files

**Epic 1 retro:** `epic-1-retro-2026-03-10.md` — 5/5 stories done, 4733 tests, identifies dead code removed in v4.0.3
**Epic 2 retro:** `epic-2-retro-2026-03-13.md` — 4/4 stories done, 5039 tests, StreamController created here (later removed)
**Epic 3 retro:** `epic-3-retro-2026-03-13.md` — 3/3 stories done, 5160 tests, TDD 100%
**Epic 4 retro:** `epic-4-retro-2026-03-14.md` — 4/4 stories done, 5188 tests, 80-90% pre-implemented
**Epic 5 retro:** `epic-5-retro-*` — Referenced in sprint-status but file not present
**Epic 6 retro:** Referenced in sprint-status but file not present

### Tech-Spec Prep Sprint

**File:** `_bmad-output/implementation-artifacts/tech-spec-prep-sprint-epic-5.md`
**Purpose:** Pre-Epic 5 preparation sprint documenting ChatProvider migration, dead code removal, and doc updates
**Status:** Completed (referenced in Epic 4 retro as the prep sprint that reduced story work by 80%+)

---

### Summary of Implementation Gaps vs Spec

| Component | Specified | Status | Notes |
|-----------|-----------|--------|-------|
| SessionStateMachine | Story 1.3 | REMOVED | Dead code, v4.0.3 cleanup |
| ResilienceRegistry | Story 1.4 | REMOVED | Dead code, v4.0.3 cleanup |
| StreamController | Story 2.4 | REMOVED | Dead code, v4.0.3 cleanup |
| All 19 other stories | Stories 1.1-1.2, 1.5, 2.1-2.3, 3.1-3.3, 4.1-4.4, 5.1-5.3, 6.1-6.3 | FULLY IMPLEMENTED | Verified against code |
| Epic 7-8 (4 stories) | No spec files | IMPLEMENTED | No spec files for cross-check |

The three removed components (SessionStateMachine, ResilienceRegistry, StreamController) were built per spec, tested, and then removed in v4.0.3 as "dead infrastructure never imported in production code." Their removal is the primary discrepancy between BMAD spec status (`done`) and actual production presence.

---

*Integration audit: 2026-03-19*
