# CLAUDE.md - AI Development Context

This file provides context and instructions for AI assistants working on the VoxChronicle codebase.

## Project Overview

**VoxChronicle** is a Foundry VTT module that automatically transcribes tabletop RPG sessions and publishes them as adventure chronicles to Kanka. The plugin:

- Captures audio from game sessions (Foundry VTT WebRTC or browser microphone)
- Transcribes audio using OpenAI's GPT-4o with speaker diarization
- Extracts entities (NPCs, locations, items) from transcripts using AI
- Generates AI images using DALL-E 3 for characters, locations, and scenes
- Publishes chronicles and entities to Kanka campaign management platform

## Tech Stack

- **Language**: JavaScript (ES6+ modules with `.mjs` extension)
- **Framework**: Foundry VTT Module API v11/v12
- **UI Framework**: Foundry VTT Application classes
- **Templates**: Handlebars (.hbs)
- **Styling**: CSS with `.vox-chronicle` namespace
- **Testing**: Vitest with jsdom environment
- **External APIs**: OpenAI (transcription, images), Kanka (campaign management)

## Project Structure

```
vox-chronicle/
├── module.json                    # Foundry VTT manifest (compatibility, entry points)
├── scripts/
│   ├── main.mjs                   # Entry point - hooks registration, scene controls
│   ├── core/
│   │   ├── VoxChronicle.mjs       # Main singleton - service orchestration
│   │   └── Settings.mjs           # Foundry settings registration
│   ├── audio/
│   │   ├── AudioRecorder.mjs      # MediaRecorder wrapper, WebRTC/mic capture
│   │   └── AudioChunker.mjs       # Split large audio for 25MB API limit
│   ├── ai/
│   │   ├── OpenAIClient.mjs       # Base API client with auth, rate limiting
│   │   ├── TranscriptionService.mjs  # GPT-4o transcribe with diarization
│   │   ├── ImageGenerationService.mjs # DALL-E 3 image generation
│   │   └── EntityExtractor.mjs    # Extract NPCs/locations/items from text
│   ├── kanka/
│   │   ├── KankaClient.mjs        # Base API client with rate limiting
│   │   ├── KankaService.mjs       # CRUD for journals, characters, locations, items
│   │   └── NarrativeExporter.mjs  # Format transcripts for Kanka journals
│   ├── orchestration/
│   │   └── SessionOrchestrator.mjs # Main workflow: record → transcribe → publish
│   ├── content/
│   │   └── CompendiumSearcher.mjs # Search Foundry compendiums for duplicates
│   ├── ui/
│   │   ├── RecorderControls.mjs   # Recording start/stop/pause UI
│   │   ├── SpeakerLabeling.mjs    # Map speaker IDs to player names
│   │   └── EntityPreview.mjs      # Review entities before Kanka publish
│   └── utils/
│       ├── Logger.mjs             # Module-prefixed logging utility
│       ├── RateLimiter.mjs        # Request throttling with queue
│       └── AudioUtils.mjs         # MIME detection, blob conversion
├── styles/
│   └── vox-chronicle.css          # All module styles with .vox-chronicle prefix
├── templates/
│   ├── recorder.hbs               # Recording controls template
│   ├── speaker-labeling.hbs       # Speaker mapping form
│   └── entity-preview.hbs         # Entity review dialog
├── lang/
│   ├── en.json                    # English localization
│   └── it.json                    # Italian localization
├── tests/
│   └── services/                  # Unit tests for services
├── docs/
│   ├── ARCHITECTURE.md            # System design documentation
│   ├── API_REFERENCE.md           # Service class documentation
│   └── USER_GUIDE.md              # End-user instructions
├── README.md                      # Project overview and setup
├── CHANGELOG.md                   # Version history
└── CLAUDE.md                      # This file - AI development context
```

## Code Patterns

### Module Constants

All module code uses a shared MODULE_ID constant:

```javascript
const MODULE_ID = 'vox-chronicle';
```

### Singleton Pattern (VoxChronicle)

The main module class follows singleton pattern:

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
// OpenAI client
export class OpenAIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async request(endpoint, options) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers
      }
    });
    // Handle errors, rate limits
  }
}
```

### UI Components

UI classes extend Foundry's Application or FormApplication:

```javascript
export class MyApplication extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-my-app',
      classes: ['vox-chronicle', 'my-app'],
      template: 'modules/vox-chronicle/templates/my-app.hbs',
      width: 400,
      height: 'auto'
    });
  }

  getData() {
    return { /* template data */ };
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Event handlers
  }
}
```

### Localization

All user-facing strings use i18n:

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

### DALL-E 3 Model Specification

DALL-E 3 must be explicitly specified:

```javascript
// DALL-E 2 is default - ALWAYS specify dall-e-3
body: JSON.stringify({
  model: 'dall-e-3',  // Required!
  prompt: '...',
  n: 1,  // DALL-E 3 only supports n=1
  size: '1024x1024'
})
```

### Image URL Expiration

OpenAI image URLs expire in 60 minutes:

```javascript
const imageUrl = result.data[0].url;
// Download immediately before uploading to Kanka
const imageResponse = await fetch(imageUrl);
const imageBlob = await imageResponse.blob();
```

### Kanka Rate Limiting

Respect Kanka API limits (30/min free, 90/min premium):

```javascript
// Use RateLimiter utility
const limiter = new RateLimiter(30, 60000);
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

### Build the package

```bash
bash build.sh      # Linux/macOS
build.bat           # Windows
```

The build script auto-detects module ID, version, and GitHub URL from `module.json`. It creates a clean ZIP in `releases/{id}-v{version}.zip` with the download URL already set in the packaged module.json.

### Publish a new release

1. **Update `module.json`** - change these two fields:
   - `"version"`: bump to the new version (e.g. `"X.Y.Z"`)
   - `"download"`: update to match: `https://github.com/Aiacos/VoxChronicle/releases/download/vX.Y.Z/vox-chronicle-vX.Y.Z.zip`

2. **Build the package**:
   ```bash
   bash build.sh
   ```

3. **Commit and push**:
   ```bash
   git add module.json
   git commit -m "Bump version to X.Y.Z"
   git push
   ```

4. **Create GitHub release** (uploads both module.json manifest AND ZIP):
   ```bash
   gh release create vX.Y.Z releases/vox-chronicle-vX.Y.Z.zip module.json --title "vX.Y.Z - Description" --latest
   ```

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

2. Add localization strings in `lang/en.json` and `lang/it.json`:

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

1. Create file in appropriate directory (e.g., `scripts/services/NewService.mjs`)
2. Import Logger and any dependencies
3. Export the class
4. Register in VoxChronicle singleton if needed
5. Add to SessionOrchestrator if part of workflow

### Adding UI Controls

1. Create Application class in `scripts/ui/`
2. Create Handlebars template in `templates/`
3. Add CSS in `styles/vox-chronicle.css`
4. Add localization strings
5. Register in scene controls if needed (in `main.mjs`)

### Adding Tests

1. Create test file in `tests/services/`
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
- Use localization for ALL user-facing strings
- Namespace all CSS classes with `vox-chronicle`
- Document public methods with JSDoc comments
- Test API response parsing thoroughly
- Validate API keys before making requests

### DON'T

- Don't access `game` object before 'init' hook
- Don't send audio as JSON (use FormData)
- Don't forget `model: 'dall-e-3'` (defaults to dall-e-2)
- Don't exceed rate limits (implement throttling)
- Don't store API keys in source code
- Don't use `console.log` directly (use Logger)
- Don't create entities without checking for duplicates
- Don't skip error handling for API calls
- Don't hardcode English strings (use i18n)

## Gotchas

1. **Foundry VTT API**: The `game` object is not available until 'init' hook fires
2. **MediaRecorder**: Not all browsers support all audio formats - use `_getSupportedMimeType()`
3. **Speaker Diarization**: Speaker IDs (SPEAKER_00, SPEAKER_01) need mapping to player names
4. **Kanka API Token**: Expires after 364 days - consider warning users
5. **WebRTC Capture**: May not capture all peer audio depending on Foundry version
6. **Permission Errors**: Microphone access requires HTTPS or localhost
7. **Large Recordings**: Must chunk audio > 25MB for OpenAI API

## Testing

Run tests with:

```bash
npm install      # Install dependencies
npm test         # Run all tests
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
Logger.setLevel(LogLevel.DEBUG);
```

Check browser console for `VoxChronicle |` prefixed messages.

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
| Images (DALL-E 3 Standard) | $0.04/image |
| Images (DALL-E 3 HD) | $0.08/image |

Use mocks for development and save real API calls for integration testing.

## Questions?

If you're unsure about:
- **Architecture decisions**: Check `docs/ARCHITECTURE.md`
- **API details**: Check `docs/API_REFERENCE.md`
- **User workflows**: Check `docs/USER_GUIDE.md`
- **Recent changes**: Check `CHANGELOG.md`
