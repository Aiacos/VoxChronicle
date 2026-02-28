# External Integrations

**Analysis Date:** 2026-02-28

## APIs & External Services

**OpenAI (Primary AI Provider):**
- **Transcription**: GPT-4o-transcribe-diarize model with speaker diarization
  - SDK/Client: Custom `OpenAIClient` (`scripts/ai/OpenAIClient.mjs`) with retry, queue, circuit breaker
  - Service: `TranscriptionService` (`scripts/ai/TranscriptionService.mjs`)
  - Auth: Bearer token via `openaiApiKey` setting
  - Endpoint: `https://api.openai.com/v1`
  - Timeout: 600000ms (10 minutes for transcription)
  - Models supported: `gpt-4o-transcribe-diarize`, `gpt-4o-transcribe`, `whisper-1`

- **Image Generation**: gpt-image-1 model
  - SDK/Client: `OpenAIClient` (same base client)
  - Service: `ImageGenerationService` (`scripts/ai/ImageGenerationService.mjs`)
  - Auth: Bearer token via `openaiApiKey` setting
  - Endpoint: `https://api.openai.com/v1/images/generations`
  - Timeout: 300000ms (5 minutes)
  - Sizes supported: 1024x1024 (square), 1024x1536 (portrait), 1536x1024 (landscape)
  - Output format: base64 (not URLs) — expires after 60 minutes if stored as URL
  - Quality: low ($0.02/image), medium ($0.04/image), high ($0.08/image)

- **RAG (Retrieval-Augmented Generation)**: OpenAI Responses API + File Search
  - SDK/Client: `OpenAIClient`
  - Provider: `OpenAIFileSearchProvider` (`scripts/rag/OpenAIFileSearchProvider.mjs`)
  - Features: Managed vector store, auto-chunking (800-token windows), file uploads
  - Model: `gpt-4o-mini` for RAG queries (configurable)
  - Vector store expiry: 30 days after last use
  - Max file size: 512 MB per upload

- **Entity Extraction**: GPT-4o for structured extraction
  - SDK/Client: `OpenAIClient`
  - Service: `EntityExtractor` (`scripts/ai/EntityExtractor.mjs`)
  - Extracts: NPCs, locations, items, relationships from transcription text

**Kanka API (Campaign Management & Publishing):**
- Base URL: `https://api.kanka.io/1.0`
- SDK/Client: Custom `KankaClient` (`scripts/kanka/KankaClient.mjs`) with rate limiting
- Auth: Bearer token via `kankaApiToken` setting (world scope)
- Campaign ID: Numeric ID stored in `kankaCampaignId` setting

**Rate Limits:**
- Free tier: 30 requests per minute
- Premium tier: 90 requests per minute
- Handled by: `RateLimiter` utility (`scripts/utils/RateLimiter.mjs`)

**Services Using Kanka:**
- `KankaService` (`scripts/kanka/KankaService.mjs`) - CRUD operations for entities
- `NarrativeExporter` (`scripts/kanka/NarrativeExporter.mjs`) - Format transcripts for publishing
- `KankaEntityManager` (`scripts/kanka/KankaEntityManager.mjs`) - Entity lifecycle (dedup, merge, sync)

**Supported Kanka Entity Types:**
- Journals (session chronicles, episode logs)
- Characters (NPCs, party members)
- Locations (places, regions, dungeons)
- Items (equipment, quest objects, artifacts)
- Families/Organizations (factions, groups)
- Relationships (character links, alliances, conflicts)

## Data Storage

**Databases:**
- **Not Used** - VoxChronicle uses no external databases
  - All state persists in Foundry VTT settings system (server-side storage)

**File Storage:**
- **Foundry VTT Settings** - Primary storage for module state
  - Scope: world or client, depending on setting
  - Stored via `game.settings.get()` / `game.settings.set()`
  - Examples: `speakerLabels`, `customVocabularyDictionary`, `pendingSessions`

- **Browser Memory (Temporary)** - Session-only storage
  - Audio chunks buffer (`AudioRecorder._audioChunks`)
  - Transcription results in memory during processing
  - Cleared on browser close/module unload

- **OpenAI File Storage** (for RAG)
  - Files uploaded to OpenAI for indexing in vector store
  - Managed by `OpenAIFileSearchProvider`
  - Expires after 30 days of no use

- **Local Filesystem** - Not used by module
  - Downloads are saved directly to user's device via browser save dialog (when applicable)

**Caching:**
- **Memory Cache**: `CacheManager` utility (`scripts/utils/CacheManager.mjs`)
  - Used for caching API responses
  - TTL-based expiration
  - Example: Cached gpt-image-1 results (60-minute expiry due to OpenAI URL expiry)

## Authentication & Identity

**Auth Provider:**
- **Custom Bearer Token Authentication** (no OAuth, no single sign-on)

**Implementation:**
- OpenAI: API key provided by user in settings (`openaiApiKey`)
  - Per-user scope (each user has their own key for cost tracking)
  - Validated on module initialization
  - Never logged or exposed in output (filtered by `SensitiveDataFilter`)

- Kanka: Personal Access Token provided by GM in settings (`kankaApiToken`)
  - World scope (shared by all users in campaign)
  - Token generated at https://app.kanka.io/settings/api
  - Expires after 364 days (warning should be implemented)

**Secret Handling:**
- Secrets stored in Foundry VTT's encrypted settings system
- Filtered from all logs via `SensitiveDataFilter` (`scripts/utils/SensitiveDataFilter.mjs`)
- API keys never appear in error messages, console logs, or exports

## Monitoring & Observability

**Error Tracking:**
- **None** - No external error tracking service (Sentry, Rollbar, etc.)
- Custom error handling via `ErrorNotificationHelper` (`scripts/utils/ErrorNotificationHelper.mjs`)
- User-facing error notifications via Foundry UI

**Logs:**
- **Custom Logger** - Module-specific logging with prefixes
  - Utility: `Logger` (`scripts/utils/Logger.mjs`)
  - Format: `[VoxChronicle | ClassName]` prefix for all logs
  - Sensitive data automatically filtered from output
  - Browser console only (no remote logging)

**Debugging:**
- Debug mode can be toggled in module settings
- Verbose logging shows request details (with secrets filtered)

## CI/CD & Deployment

**Hosting:**
- **GitHub** - Code repository and release distribution
  - URL: https://github.com/Aiacos/VoxChronicle
  - Releases: https://github.com/Aiacos/VoxChronicle/releases

**Release Process:**
- Manual CI/CD via bash script and gh CLI
- Build: `bash build.sh` creates ZIP in `releases/`
- Publish: `gh release create vX.Y.Z releases/vox-chronicle-vX.Y.Z.zip module.json`
- Both ZIP and standalone `module.json` are uploaded

**Module Manifest URL:**
- https://github.com/Aiacos/VoxChronicle/releases/latest/download/module.json
- Foundry VTT downloads this to discover module version and download URL

**CI Pipeline:**
- GitHub Actions: Not configured (manual process)
- Local test suite: `npm test` runs 3888+ tests
- Linting: `npm run lint`
- Formatting: `npm run format`

## Environment Configuration

**Required Environment Variables:**
- None - All configuration via Foundry VTT settings UI

**Secrets Location:**
- Foundry VTT Settings system (`game.settings.register()`)
  - Credentials encrypted by Foundry server
  - Not stored in `.env` files

**Required Settings for Functionality:**
1. `openaiApiKey` - OpenAI API key (get from https://platform.openai.com/api-keys)
2. `kankaApiToken` - Kanka API token (get from https://app.kanka.io/settings/api)
3. `kankaCampaignId` - Numeric ID of target Kanka campaign

**Optional Settings:**
- `whisperBackendUrl` - Local Whisper server (only if using 'local'/'auto' transcription mode)
- `transcriptionLanguage` - Language code for transcription accuracy
- `imageQuality` - Quality level for AI-generated images
- `customVocabularyDictionary` - Campaign-specific terminology

## Webhooks & Callbacks

**Incoming Webhooks:**
- **None** - Module is client-side only, does not expose HTTP endpoints

**Outgoing Webhooks/Callbacks:**
- **None** - Uses polling/request-response pattern only

**Event Streams:**
- Foundry VTT Hooks system (internal):
  - `init` - Register settings during initialization
  - `ready` - Initialize services when game is ready
  - `getSceneControlButtons` - Add VoxChronicle controls to scene toolbar
  - Custom hooks for module-specific events (audio state changes, etc.)

## Transcription Pipeline

**Audio Capture:**
- **MediaRecorder API** - Captures WebM audio from:
  - Browser microphone (getUserMedia)
  - Foundry VTT WebRTC stream (peer audio)
  - Auto-selection or user preference via settings

**Audio Chunking:**
- Large files (>25MB) are split by `AudioChunker` (`scripts/audio/AudioChunker.mjs`)
- OpenAI API limit: 25MB per request
- Chunks transcribed separately, results merged

**Transcription Flow:**
1. Record audio → WebM blob
2. Check file size, chunk if necessary
3. Create FormData with file + model + language + vocabulary
4. POST to `https://api.openai.com/v1/audio/transcriptions`
5. Receive diarized JSON with speaker segments
6. Map speaker IDs (SPEAKER_00, SPEAKER_01, ...) to player names
7. Store transcript in session state

**Local Whisper Option:**
- Alternative backend: `LocalWhisperService` and `WhisperBackend` clients
- HTTP POST to `whisperBackendUrl/transcribe`
- Same interface as OpenAI (returns same diarized_json format)
- Activated via `transcriptionMode: 'local'` or `'auto'`

## Image Generation Pipeline

**Supported Entity Types:**
- Characters (NPC portraits, companion images)
- Locations (scene illustrations, map images)
- Items (equipment details, artifact references)
- Scenes (narrative scene backgrounds)

**Generation Flow:**
1. Extract entity description from transcript/Kanka data
2. Build prompt via `ImagePromptBuilder` with entity context
3. POST to `https://api.openai.com/v1/images/generations` with gpt-image-1 model
4. Receive base64 image data (not URL)
5. Convert base64 to Blob for upload/storage
6. Cache base64 for 60 minutes (before URL expiry becomes issue)
7. Upload to Kanka as entity portrait

**Quality Tiers (Cost per Image):**
- low: $0.02 (fast, lower detail)
- medium: $0.04 (balanced)
- high: $0.08 (highest detail)

## Entity Extraction & Relationships

**Extraction Service:**
- `EntityExtractor` (`scripts/ai/EntityExtractor.mjs`)
- Uses GPT-4o to parse transcript and extract:
  - NPCs (name, description, role)
  - Locations (name, description, significance)
  - Items (name, description, properties)
  - Relationships (between entities with confidence scores)

**Relationship Detection:**
- Automatic: `autoExtractRelationships` setting (default: true)
- Confidence scoring (1-10 scale)
- Threshold filtering: `relationshipConfidenceThreshold` setting (default: 5)
- Max relationships per session: `maxRelationshipsPerSession` setting (default: 20)

**Entity Deduplication:**
- `KankaEntityManager` checks for duplicate names/descriptions
- Prevents duplicate creation in Kanka
- User confirms before creation if `confirmEntityCreation` enabled

---

*Integration audit: 2026-02-28*
