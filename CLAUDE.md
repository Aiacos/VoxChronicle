# CLAUDE.md - AI Development Context

This file provides context and instructions for AI assistants working on the VoxChronicle codebase.

## Project Overview

**VoxChronicle** is an AI-powered session transcription, real-time DM assistant, and Kanka chronicle publisher for Foundry VTT. The module operates in two modes:

- **Live Mode**: Real-time AI assistance during game sessions (narration suggestions, off-track detection, NPC dialogue, rules Q&A, scene tracking, analytics)
- **Chronicle Mode**: Post-session workflow for transcription, entity extraction, image generation, and Kanka publishing

Core capabilities:

- Captures audio from game sessions (Foundry VTT WebRTC or browser microphone)
- Transcribes audio using OpenAI's GPT-4o with speaker diarization
- Extracts entities (NPCs, locations, items) from transcripts using AI
- Generates AI images using gpt-image-1 for characters, locations, and scenes
- Provides real-time DM assistance (suggestions, rules lookup, scene detection)
- Publishes chronicles and entities to Kanka campaign management platform

## Tech Stack

- **Language**: JavaScript (ES6+ modules with `.mjs` extension)
- **Framework**: Foundry VTT Module API v13
- **UI Framework**: Foundry VTT ApplicationV2 + HandlebarsApplicationMixin
- **Templates**: Handlebars (.hbs)
- **Styling**: CSS with `.vox-chronicle` namespace
- **Testing**: Vitest with jsdom environment (5035 unit tests across 67 files, 54 integration tests)
- **External APIs**: OpenAI (transcription, images, chat, embeddings), Kanka (campaign management)
- **RAG**: Modular provider system — OpenAI File Search (default) or self-hosted RAGFlow

## Project Structure

```
VoxChronicle/
├── module.json                    # Foundry VTT manifest (compatibility, entry points)
├── scripts/
│   ├── main.mjs                   # Entry point - hooks registration, scene controls
│   ├── constants.mjs              # MODULE_ID constant (dependency-free leaf module)
│   ├── core/
│   │   ├── VoxChronicle.mjs       # Main singleton - service orchestration
│   │   ├── Settings.mjs           # Foundry settings registration (58 settings)
│   │   ├── EventBus.mjs           # Pub/sub system with typed channels
│   │   └── VocabularyDictionary.mjs # Custom vocabulary for transcription accuracy
│   ├── audio/
│   │   ├── AudioRecorder.mjs      # MediaRecorder wrapper, WebRTC/mic capture, level metering, Safari codec fallback, crash recovery (IndexedDB), EventBus integration
│   │   └── AudioChunker.mjs       # Split large audio for 25MB API limit, EventBus integration
│   ├── ai/
│   │   ├── OpenAIClient.mjs       # Base API client with auth, retry, queue, circuit breaker
│   │   ├── TranscriptionService.mjs  # GPT-4o transcribe with diarization, multi-language
│   │   ├── TranscriptionFactory.mjs  # Factory for cloud/local/auto transcription modes
│   │   ├── LocalWhisperService.mjs   # Local Whisper backend client
│   │   ├── WhisperBackend.mjs        # HTTP client for whisper.cpp server
│   │   ├── ImageGenerationService.mjs # gpt-image-1 image generation
│   │   ├── EntityExtractor.mjs    # Extract NPCs/locations/items from text
│   │   └── providers/             # AI Provider abstraction layer (Epic 2)
│   │       ├── ChatProvider.mjs          # Abstract chat interface
│   │       ├── TranscriptionProvider.mjs # Abstract transcription interface
│   │       ├── ImageProvider.mjs         # Abstract image generation interface
│   │       ├── EmbeddingProvider.mjs     # Abstract embedding interface
│   │       ├── OpenAIChatProvider.mjs    # OpenAI chat implementation
│   │       ├── OpenAITranscriptionProvider.mjs # OpenAI transcription
│   │       ├── OpenAIImageProvider.mjs   # OpenAI gpt-image-1
│   │       ├── OpenAIEmbeddingProvider.mjs # OpenAI embeddings
│   │       ├── AnthropicChatProvider.mjs  # Anthropic Claude chat implementation
│   │       ├── GoogleChatProvider.mjs    # Google Gemini chat implementation
│   │       ├── ProviderRegistry.mjs      # Service locator for providers
│   │       └── CachingProviderDecorator.mjs # L2 cache decorator
│   ├── rag/                        # Modular RAG provider system (v3.0)
│   │   ├── RAGProvider.mjs         # Abstract base class (interface)
│   │   ├── RAGProviderFactory.mjs  # Factory for creating providers
│   │   ├── OpenAIFileSearchProvider.mjs # OpenAI Responses API + file_search
│   │   └── RAGFlowProvider.mjs     # Self-hosted RAGFlow API integration
│   ├── narrator/                   # Real-time DM assistant services (from Narrator Master)
│   │   ├── AIAssistant.mjs         # Contextual AI suggestions with RAG context injection (uses ChatProvider)
│   │   ├── ChapterTracker.mjs      # Chapter/scene tracking from Foundry journals
│   │   ├── CompendiumParser.mjs    # Parse Foundry compendiums for rules content + text chunking
│   │   ├── JournalParser.mjs       # Parse Foundry journal entries for story context + text chunking
│   │   ├── RulesReference.mjs      # D&D rules Q&A with compendium citations
│   │   ├── SceneDetector.mjs       # Scene type detection (combat, social, exploration, rest)
│   │   ├── SessionAnalytics.mjs    # Speaker participation, timeline, session stats
│   │   ├── SilenceDetector.mjs     # Timer-based silence detection for auto-suggestions
│   │   ├── SilenceMonitor.mjs     # Monitoring companion for silence detection
│   │   ├── NPCProfileExtractor.mjs # Character profile extraction from journals
│   │   ├── PromptBuilder.mjs      # Dynamic prompt construction for AI
│   │   ├── RulesLookupService.mjs # Two-phase hybrid rules lookup
│   │   └── RollingSummarizer.mjs  # Session summarization for context window
│   ├── kanka/
│   │   ├── KankaClient.mjs        # Base API client with rate limiting
│   │   ├── KankaService.mjs       # CRUD for journals, characters, locations, items
│   │   ├── KankaEntityManager.mjs # Entity lifecycle management
│   │   └── NarrativeExporter.mjs  # Format transcripts for Kanka journals
│   ├── orchestration/
│   │   ├── SessionOrchestrator.mjs # Dual-mode workflow: live + chronicle
│   │   ├── TranscriptionProcessor.mjs # Audio transcription workflow
│   │   ├── EntityProcessor.mjs     # Entity extraction workflow
│   │   ├── ImageProcessor.mjs      # Image generation workflow
│   │   ├── KankaPublisher.mjs      # Kanka publishing workflow
│   │   └── CostTracker.mjs        # API cost estimation and tracking
│   ├── api/
│   │   └── BaseAPIClient.mjs      # Abstract base for all API clients
│   ├── data/
│   │   └── dnd-vocabulary.mjs     # D&D vocabulary dictionary
│   ├── ui/
│   │   ├── MainPanel.mjs          # Unified floating panel (6 tabs) - singleton, PARTS pattern (transcriptReview)
│   │   ├── SpeakerLabeling.mjs    # Map speaker IDs to player names (inline rename, onClose callback)
│   │   ├── EntityPreview.mjs      # Review entities before Kanka publish
│   │   ├── RelationshipGraph.mjs  # Visualize entity relationships
│   │   ├── VocabularyManager.mjs  # Custom vocabulary management UI
│   │   └── JournalPicker.mjs     # Journal selection for live mode RAG
│   └── utils/
│       ├── Logger.mjs             # Module-prefixed logging utility
│       ├── RateLimiter.mjs        # Request throttling with queue
│       ├── AudioUtils.mjs         # MIME detection, blob conversion
│       ├── SensitiveDataFilter.mjs # Filter API keys from logs
│       ├── HtmlUtils.mjs          # HTML sanitization and formatting
│       ├── CacheManager.mjs       # Generic cache with TTL and invalidation
│       ├── DomUtils.mjs           # DOM manipulation helpers
│       └── SpeakerUtils.mjs      # Speaker ID/label utilities (extracted from UI layer)
├── styles/
│   └── vox-chronicle.css          # All module styles with .vox-chronicle prefix
├── templates/
│   ├── main-panel.hbs             # Unified 6-tab floating panel
│   ├── recorder.hbs               # Recording controls template
│   ├── speaker-labeling.hbs       # Speaker mapping form
│   ├── entity-preview.hbs         # Entity review dialog
│   ├── relationship-graph.hbs     # Relationship visualization template
│   ├── vocabulary-manager.hbs     # Vocabulary management template
│   ├── analytics-tab.hbs          # Session analytics tab
│   ├── journal-picker.hbs         # Journal/chapter picker for live mode
│   └── parts/
│       └── transcript-review.hbs  # PART: Transcript review with inline editing
├── lang/
│   ├── en.json                    # English (1102 keys)
│   ├── it.json                    # Italian
│   ├── de.json                    # German
│   ├── es.json                    # Spanish
│   ├── fr.json                    # French
│   ├── ja.json                    # Japanese
│   ├── pt.json                    # Portuguese
│   └── template.json             # Translation template
├── tests/
│   └── ...                        # 67 test files, 5035 tests
├── docs/
│   ├── ARCHITECTURE.md            # System design documentation
│   ├── API_REFERENCE.md           # Service class documentation
│   ├── USER_GUIDE.md              # End-user instructions
│   ├── WHISPER_SETUP.md           # Local Whisper backend setup
│   ├── CONTRIBUTING.md            # Contributor guidelines
│   ├── TESTING.md                 # Testing guide and conventions
│   ├── GPT4O_TRANSCRIBE_API.md   # Diarization API documentation
│   └── plans/                     # Design and implementation plans
│       └── 2026-02-19-v3-rewrite-plan.md  # v3.0 RAG + UI rewrite plan
├── README.md                      # Project overview and setup
├── CHANGELOG.md                   # Version history
├── CLAUDE.md                      # This file - AI development context
└── .gitleaksignore                # Patterns to ignore in secret scanning
```

## Code Patterns

### Module Constants

All module code uses a shared MODULE_ID constant from a dependency-free leaf module:

```javascript
// scripts/constants.mjs
export const MODULE_ID = 'vox-chronicle';

// All other files import from constants.mjs (NOT main.mjs)
import { MODULE_ID } from '../constants.mjs';
```

### Singleton Pattern (VoxChronicle)

The main module class follows singleton pattern:

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

### MainPanel Singleton

The unified UI panel uses the same singleton pattern with explicit reset for testing:

```javascript
class MainPanel extends Application {
  static #instance = null;

  static getInstance() {
    if (!MainPanel.#instance) {
      MainPanel.#instance = new MainPanel();
    }
    return MainPanel.#instance;
  }

  static resetInstance() {
    MainPanel.#instance = null;
  }
}
```

### SessionOrchestrator Dual Mode

The orchestrator supports two operation modes:

```javascript
class SessionOrchestrator {
  // Live Mode: real-time AI assistance during gameplay
  async startLiveMode(options) {
    // Starts audio recording + narrator services
    // AIAssistant, SceneDetector, ChapterTracker, SessionAnalytics
  }

  // Chronicle Mode: post-session publishing workflow
  async startSession(options) {
    // Starts recording session for chronicle mode
  }
}
```

### Narrator Service Pattern

Services in `scripts/narrator/` follow a consistent pattern with context-aware methods:

```javascript
export class AIAssistant {
  constructor(openAIClient, options = {}) {
    this.client = openAIClient;
    this.logger = Logger.createChild('AIAssistant');
  }

  // Generate contextual suggestion based on current scene/transcript
  async getSuggestion(context) {
    // context: { transcript, sceneType, chapter, characters }
    // Returns: { type: 'narration'|'dialogue'|'action'|'reference', content: '...' }
  }
}
```

### Retry/Queue Pattern (OpenAIClient)

All OpenAI API calls use retry with exponential backoff + jitter and sequential request queuing:

```javascript
class OpenAIClient {
  // Retry with exponential backoff + jitter
  async _retryWithBackoff(fn, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        const delay = Math.min(1000 * 2 ** attempt, 30000) + Math.random() * 1000;
        await this._sleep(delay);
      }
    }
  }

  // Sequential request queue to prevent rate limiting
  async _enqueueRequest(fn) {
    // Queues requests and processes them sequentially
  }

  // Circuit breaker: auto-stops after consecutive failures
  _checkCircuitBreaker() {
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      throw new Error('Circuit breaker open: too many consecutive failures');
    }
  }
}
```

### Foundry VTT Hooks

Module initialization uses standard Foundry hooks:

```javascript
// Register settings BEFORE game is fully loaded
Hooks.once('init', () => {
  Settings.registerSettings();
});

// Initialize services AFTER game data is available
Hooks.once('ready', async () => {
  await VoxChronicle.getInstance().initialize();
});

// Add UI controls
Hooks.on('getSceneControlButtons', (controls) => {
  // Add VoxChronicle controls to scene toolbar
});
```

### Settings Registration

Settings are registered with proper scopes:

```javascript
// Client-side (per user) - for personal API keys
game.settings.register(MODULE_ID, 'openaiApiKey', {
  scope: 'client',
  config: true,
  type: String
});

// World-wide (shared) - for campaign settings
game.settings.register(MODULE_ID, 'kankaCampaignId', {
  scope: 'world',
  config: true,
  type: String
});

// Relationship extraction settings
game.settings.register(MODULE_ID, 'autoExtractRelationships', {
  scope: 'client',      // Per-user preference
  config: true,
  type: Boolean,
  default: true         // Enable relationship extraction by default
});

game.settings.register(MODULE_ID, 'relationshipConfidenceThreshold', {
  scope: 'world',
  config: true,
  type: Number,
  range: { min: 1, max: 10, step: 1 },
  default: 5            // Medium confidence threshold (1-10 scale)
});

game.settings.register(MODULE_ID, 'maxRelationshipsPerSession', {
  scope: 'world',
  config: true,
  type: Number,
  range: { min: 0, max: 50, step: 1 },
  default: 20           // Reasonable limit to avoid API overuse
});
```

### Service Classes

All services follow a consistent pattern:

```javascript
import { Logger } from '../utils/Logger.mjs';

export class ServiceName {
  constructor(dependencies) {
    this.logger = Logger.createChild('ServiceName');
  }

  async methodName() {
    try {
      // Implementation
    } catch (error) {
      this.logger.error('Method failed:', error);
      throw error;
    }
  }
}
```

### API Clients

API clients extend base classes with authentication:

```javascript
// OpenAI client with retry, queue, and circuit breaker
export class OpenAIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async request(endpoint, options) {
    return this._enqueueRequest(() =>
      this._retryWithBackoff(async () => {
        this._checkCircuitBreaker();
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...options.headers
          }
        });
        // Handle errors, rate limits
      })
    );
  }
}
```

### UI Components

UI classes use Foundry v13's ApplicationV2 + HandlebarsApplicationMixin:

```javascript
export class MyApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-my-app',
    classes: ['vox-chronicle', 'my-app'],
    window: { title: 'VOXCHRONICLE.MyApp.Title', resizable: true },
    position: { width: 400 },
    actions: {
      'my-action': MyApplication._onMyAction  // Static handler, called with .call(this)
    }
  };

  static PARTS = {
    main: { template: `modules/vox-chronicle/templates/my-app.hbs` }
  };

  async _prepareContext(options) {
    return { /* template data */ };
  }

  _onRender(context, options) {
    // IMPORTANT: Clean up previous listeners to prevent memory leaks
    // _onRender is called on EVERY render, so listeners accumulate without cleanup
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    // Non-click event listeners (change, keypress, submit) — use { signal } for auto-cleanup
    this.element?.querySelector('select')?.addEventListener('change', this._handler.bind(this), { signal });
  }

  async close(options) {
    this.#listenerController?.abort();
    return super.close(options);
  }

  static _onMyAction(event, target) {
    // Static action handler - `this` is the instance via .call()
    this._doSomething(event, target);
  }
}
```

### Localization

All user-facing strings use i18n (7 languages + template):

```javascript
// In JavaScript
game.i18n.localize('VOXCHRONICLE.Settings.OpenAIKey');
game.i18n.format('VOXCHRONICLE.Error.Message', { error: error.message });

// In Handlebars
{{localize "VOXCHRONICLE.Button.StartRecording"}}
```

### CSS Naming

All CSS classes are namespaced:

```css
.vox-chronicle { /* Container */ }
.vox-chronicle-recorder { /* Component */ }
.vox-chronicle-recorder__button { /* BEM-style element */ }
.vox-chronicle-recorder--recording { /* BEM-style modifier */ }
```

### RAG Architecture (v3.0)

Modular RAG provider system with two implementations:
- `RAGProvider` — Abstract interface for any RAG backend (`scripts/rag/RAGProvider.mjs`)
- `OpenAIFileSearchProvider` — Default: OpenAI Responses API + `file_search` tool, hosted vector store
- `RAGFlowProvider` — Alternative: self-hosted RAGFlow with dataset management + document parsing
- `RAGProviderFactory` — Factory for creating providers based on `ragProvider` setting

The v2.x custom stack (EmbeddingService, RAGVectorStore, RAGRetriever) was removed in v3.0.

## Important Patterns

### Audio Transcription (FormData Required)

OpenAI transcription API requires FormData, NOT JSON:

```javascript
const formData = new FormData();
formData.append('file', audioBlob, 'session.webm');
formData.append('model', 'gpt-4o-transcribe');
formData.append('response_format', 'diarized_json');

// Do NOT set Content-Type header - browser sets multipart boundary
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: formData
});
```

### gpt-image-1 Model

gpt-image-1 is the current image generation model:

```javascript
// gpt-image-1 returns base64 images (NOT URLs like dall-e-3)
body: JSON.stringify({
  model: 'gpt-image-1',
  prompt: '...',
  size: '1024x1024',  // Also supports 1024x1536, 1536x1024, auto
  quality: 'medium'   // low, medium, high
})

// Response contains base64 data (NOT a URL)
const imageBase64 = result.data[0].b64_json;
const imageBlob = base64ToBlob(imageBase64, 'image/png');
```

### Kanka Rate Limiting

Respect Kanka API limits (30/min free, 90/min premium):

```javascript
// Use RateLimiter utility
const limiter = new RateLimiter({ requestsPerMinute: 30 });
await limiter.throttle();
const response = await fetch(url);

// Handle 429 with retry
if (response.status === 429) {
  await this.delay(60000);
  return this.request(endpoint);  // Retry
}
```

### Audio Chunking

OpenAI has 25MB file size limit:

```javascript
import { AudioChunker, MAX_CHUNK_SIZE } from '../audio/AudioChunker.mjs';

if (audioBlob.size > MAX_CHUNK_SIZE) {
  const chunks = AudioChunker.split(audioBlob);
  // Transcribe each chunk separately
}
```

### GPT-4o Transcribe with Speaker Diarization

**CRITICAL for AI developers modifying TranscriptionService:**

When using GPT-4o's speaker diarization feature:

```javascript
// REQUIRED: Use gpt-4o-transcribe-diarize model for speaker identification
formData.append('model', 'gpt-4o-transcribe-diarize');
formData.append('response_format', 'diarized_json');

// Response includes speaker-labeled segments
{
  text: "Full transcript...",
  segments: [
    {
      speaker: "SPEAKER_00",  // Auto-assigned IDs
      text: "Welcome to our adventure!",
      start: 0.0,
      end: 2.5
    }
  ]
}

// IMPORTANT: Speaker IDs (SPEAKER_00, SPEAKER_01, etc.) must be mapped to player names
const speakerMap = {
  'SPEAKER_00': 'Game Master',
  'SPEAKER_01': 'Player 1'
};
const mapped = transcriptionService._mapSpeakersToNames(result, speakerMap);
```

**Key diarization specifics:**
- Speaker IDs are assigned in order of first appearance (SPEAKER_00, SPEAKER_01, ...)
- Same physical speaker gets consistent ID throughout single transcription
- Accuracy decreases with >4 speakers or overlapping speech
- Use context prompts for better accuracy with character names and terminology
- See [GPT4O_TRANSCRIBE_API.md](docs/GPT4O_TRANSCRIBE_API.md) for complete diarization documentation

## Build & Release

### CI/CD (Automated)

Releases are automated via GitHub Actions (`.github/workflows/release.yml`):

| Branch | Trigger | Release Tag | Type |
|--------|---------|-------------|------|
| `master` | push | `vX.Y.Z` | Stable (latest) |
| `develop` | push | `vX.Y.Z-rc.N` | Pre-release (RC) |

**Workflow:**
1. Tests run first (gate — failure blocks release)
2. Version read from `module.json`
3. For `develop`: RC number auto-incremented from existing releases
4. ZIP built with correct download URL
5. GitHub Release created with ZIP + standalone `module.json`

**To release a new version:**
1. Update `module.json` version field
2. Push to `master` (stable) or `develop` (RC)
3. CI/CD handles build, ZIP, and GitHub Release automatically

### Manual Build (local)

```bash
bash build.sh      # Linux/macOS
build.bat           # Windows
```

The build script auto-detects module ID, version, and GitHub URL from `module.json`. It creates a clean ZIP in `releases/{id}-v{version}.zip`.

> **Why `module.json` is uploaded separately**: Foundry VTT downloads the standalone `module.json` first (via the manifest URL) to discover the module version and its download URL. The ZIP also contains a `module.json` but that's only used after installation.

### Foundry VTT Manifest URL

```
https://github.com/Aiacos/VoxChronicle/releases/latest/download/module.json
```

## Common Tasks

### Adding a New Setting

1. Add registration in `scripts/core/Settings.mjs`:

```javascript
game.settings.register(MODULE_ID, 'newSetting', {
  name: 'VOXCHRONICLE.Settings.NewSetting',
  hint: 'VOXCHRONICLE.Settings.NewSettingHint',
  scope: 'world',  // or 'client'
  config: true,
  type: String,  // or Number, Boolean, Object
  default: ''
});
```

2. Add localization strings in all 8 lang files (`lang/en.json`, `lang/it.json`, `lang/de.json`, `lang/es.json`, `lang/fr.json`, `lang/ja.json`, `lang/pt.json`, `lang/template.json`):

```json
{
  "VOXCHRONICLE": {
    "Settings": {
      "NewSetting": "New Setting",
      "NewSettingHint": "Description of the new setting"
    }
  }
}
```

### Adding a New Service

1. Create file in appropriate directory (e.g., `scripts/narrator/NewService.mjs`)
2. Import Logger and any dependencies
3. Export the class
4. Register in VoxChronicle singleton if needed
5. Add to SessionOrchestrator if part of workflow (live or chronicle mode)

### Adding UI Controls

1. Create Application class in `scripts/ui/`
2. Create Handlebars template in `templates/`
3. Add CSS in `styles/vox-chronicle.css`
4. Add localization strings to all 8 lang files
5. Register in scene controls if needed (in `main.mjs`)

### Adding Tests

1. Create test file in `tests/`
2. Mock external dependencies (fetch, game object)
3. Test happy path and error cases
4. Run with `npm test`

## TODO / Known Issues

Before starting any work, check `TODO.md` for known issues and open tasks. After completing work, update `TODO.md` to reflect resolved items or add newly discovered issues. Keep the file organized by priority (CRITICAL > WARNING > INFO).

## Do's and Don'ts

### DO

- Use `const MODULE_ID = 'vox-chronicle'` for all settings/storage keys
- Use Logger utility for all console output
- Handle errors with try/catch and user-friendly notifications
- Use localization for ALL user-facing strings (7 languages + template)
- Namespace all CSS classes with `vox-chronicle`
- Document public methods with JSDoc comments
- Test API response parsing thoroughly
- Validate API keys before making requests
- Use retry logic with exponential backoff for all API calls
- Use `_enqueueRequest` for sequential API request processing

### DON'T

- Don't access `game` object before 'init' hook
- Don't send audio as JSON (use FormData)
- Don't use dall-e-3 (use gpt-image-1)
- Don't exceed rate limits (implement throttling)
- Don't store API keys in source code
- Don't use `console.log` directly (use Logger)
- Don't create entities without checking for duplicates
- Don't skip error handling for API calls
- Don't hardcode English strings (use i18n)
- Don't forget retry logic for API calls (use OpenAIClient._retryWithBackoff)
- Don't import MODULE_ID from main.mjs (import from constants.mjs)

## Gotchas

1. **Foundry VTT API**: The `game` object is not available until 'init' hook fires
2. **MediaRecorder**: Not all browsers support all audio formats - use `AudioUtils.getSupportedMimeType()`
3. **Speaker Diarization**: Speaker IDs (SPEAKER_00, SPEAKER_01) need mapping to player names
4. **Kanka API Token**: Expires after 364 days - consider warning users
5. **WebRTC Capture**: May not capture all peer audio depending on Foundry version
6. **Permission Errors**: Microphone access requires HTTPS or localhost
7. **Large Recordings**: Must chunk audio > 25MB for OpenAI API
8. **gpt-image-1 returns base64**: Unlike dall-e-3, gpt-image-1 returns base64 data, not URLs. No need to download before uploading to Kanka.
9. **Circular imports**: Always import MODULE_ID from `constants.mjs`, never from `main.mjs`
10. **MainPanel singleton**: Use `MainPanel.getInstance()` - never construct directly
11. **ApplicationV2 _onRender memory leaks**: `_onRender()` is called on every render cycle. Event listeners added here accumulate without cleanup. Always use AbortController pattern (see UI Components pattern above)
12. **RelationshipGraph CDN loading**: vis-network script must be loaded once, not on every render. Guard with `if (!window.vis)` check

## Testing

Run tests with:

```bash
npm install      # Install dependencies
npm test         # Run all 5035 tests across 67 files
npm run test:ui  # Run with Vitest UI
```

Mock the `game` object for Foundry-dependent code:

```javascript
globalThis.game = {
  settings: {
    get: vi.fn(),
    set: vi.fn(),
    register: vi.fn()
  },
  i18n: {
    localize: vi.fn(key => key),
    format: vi.fn((key, data) => key)
  }
};
```

## Debugging

Enable verbose logging:

```javascript
import { Logger, LogLevel } from './utils/Logger.mjs';
Logger.setLogLevel(LogLevel.DEBUG);
```

Check browser console for `VoxChronicle |` prefixed messages.

Debug mode can also be toggled in module settings (Settings > Module Settings > VoxChronicle > Debug Mode).

## API Reference Quick Links

- **GPT-4o Transcribe (Diarization)**: [GPT4O_TRANSCRIBE_API.md](docs/GPT4O_TRANSCRIBE_API.md) - Comprehensive guide for speaker diarization, chunking, and API specifics
- **OpenAI Transcription**: [Audio API](https://platform.openai.com/docs/api-reference/audio)
- **OpenAI Images**: [Images API](https://platform.openai.com/docs/api-reference/images)
- **Kanka API**: [API Documentation](https://app.kanka.io/docs/1.0)
- **Foundry VTT**: [API Documentation](https://foundryvtt.com/api/)

## Cost Awareness

When testing with real APIs:

| Service | Cost |
|---------|------|
| Transcription (GPT-4o) | $0.006/minute |
| Images (gpt-image-1 medium) | $0.02/image |
| Images (gpt-image-1 high) | $0.04/image |
| Embeddings (text-embedding-3-small) | $0.02/1M tokens |
| File Search (v3.0 planned) | $0.10/GB/day + $2.50/1000 queries |
| Chat (GPT-4o-mini for suggestions) | $0.15/1M input, $0.60/1M output |

Use mocks for development and save real API calls for integration testing.

## AI Development Workflow — Skills, Agents, and Subagents

This project uses **Claude Code skills and subagents** for structured development. Follow these rules strictly.

### Required Skills

Always invoke the relevant skill BEFORE starting work. If there is even 1% chance a skill applies, use it.

| Situation | Skill to invoke |
|-----------|----------------|
| Starting any new feature or creative work | `superpowers:brainstorming` |
| Have a plan/spec to implement | `superpowers:executing-plans` |
| Bug, test failure, unexpected behavior | `superpowers:systematic-debugging` |
| Writing new code for a feature/bugfix | `superpowers:test-driven-development` |
| Multiple independent tasks to parallelize | `superpowers:dispatching-parallel-agents` |
| Need isolation for feature work | `superpowers:using-git-worktrees` |
| Implementation complete, need to finish branch | `superpowers:finishing-a-development-branch` |
| About to claim work is done | `superpowers:verification-before-completion` |
| Received code review feedback | `superpowers:receiving-code-review` |
| Want to request a code review | `superpowers:requesting-code-review` |
| Creating or editing skills | `superpowers:writing-skills` |
| Need to write an implementation plan | `superpowers:writing-plans` |

### Subagent Usage

Use the `Task` tool to launch specialized subagents for parallelizable work:

- **`feature-dev:code-explorer`** — Analyze codebase features, trace execution paths, map architecture
- **`feature-dev:code-architect`** — Design feature architectures with implementation blueprints
- **`feature-dev:code-reviewer`** — Review code for bugs, security, quality issues
- **`pr-review-toolkit:code-reviewer`** — Review code against project guidelines (CLAUDE.md)
- **`pr-review-toolkit:silent-failure-hunter`** — Find silent failures and bad error handling
- **`pr-review-toolkit:type-design-analyzer`** — Analyze type design quality
- **`pr-review-toolkit:pr-test-analyzer`** — Review test coverage quality
- **`pr-review-toolkit:comment-analyzer`** — Verify comment accuracy
- **`code-simplifier:code-simplifier`** — Simplify code for clarity and maintainability

### When to Use Subagents

- **Audits**: Launch multiple explorers in parallel to audit different parts of the codebase
- **Code review**: After completing a feature, launch code-reviewer + silent-failure-hunter
- **Before PR**: Launch pr-test-analyzer + code-reviewer + comment-analyzer in parallel
- **Research**: Use code-explorer to understand unfamiliar code before modifying it
- **After writing code**: Launch code-simplifier to refine the implementation

### Workflow Pattern

```
1. Invoke brainstorming skill (for new features) or systematic-debugging (for bugs)
2. Write plan with writing-plans skill
3. Execute plan with executing-plans skill
   - Use dispatching-parallel-agents for independent tasks
   - Use test-driven-development for each implementation step
4. Verify with verification-before-completion skill
5. Request review with requesting-code-review skill
6. Finish branch with finishing-a-development-branch skill
```

### Task Tracking

Use `TaskCreate`, `TaskUpdate`, `TaskList` for all multi-step work:
- Create tasks with clear descriptions and `activeForm` (present continuous for spinner)
- Set `addBlockedBy` dependencies between sequential tasks
- Mark `in_progress` before starting, `completed` when done
- Check `TaskList` after completing a task to find the next available one

## Questions?

If you're unsure about:
- **Architecture decisions**: Check `docs/ARCHITECTURE.md`
- **API details**: Check `docs/API_REFERENCE.md`
- **User workflows**: Check `docs/USER_GUIDE.md`
- **Recent changes**: Check `CHANGELOG.md`
- **v3.0 rewrite plan**: Check `docs/plans/2026-02-19-v3-rewrite-plan.md`
