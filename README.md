# VoxChronicle

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v12--v13-informational)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Tests](https://img.shields.io/github/workflow/status/Aiacos/VoxChronicle/Test%20Suite)

AI-powered session transcription, real-time DM assistant, and Kanka chronicle publisher for [Foundry VTT](https://foundryvtt.com/).

## Features

### Live Mode - Real-Time DM Assistant

- **AI Suggestions**: Contextual narration, dialogue, action, and reference suggestions powered by GPT-4o
- **Off-Track Detection**: Configurable sensitivity to detect when players deviate from the story, with narrative bridge generation to guide them back
- **NPC Dialogue Generation**: Generate in-character dialogue for NPCs on the fly
- **D&D Rules Q&A**: Ask rules questions and get answers with compendium citations
- **Chapter/Scene Tracking**: Track story progress through Foundry journal entries
- **Scene Type Detection**: Automatic detection of combat, social, exploration, and rest scenes
- **Session Analytics**: Speaker participation tracking, session timeline, and stats
- **Audio Level Metering**: Real-time audio level visualization during recording
- **Silence Detection**: Detect silence gaps with chapter recovery UI

### Chronicle Mode - Post-Session Publishing

- **Audio Recording**: Capture session audio from Foundry VTT's built-in voice chat or browser microphone (for Discord users)
- **Speaker Diarization**: Automatically identify and distinguish between different speakers (GM and players)
- **AI Transcription**: Convert recorded audio to text using OpenAI's GPT-4o transcription with timestamps
- **Multi-Language Transcription**: Support for multiple languages in the same session
- **Offline Transcription Mode**: Use local Whisper models for privacy-focused, zero-cost transcription (see [Whisper Setup Guide](docs/WHISPER_SETUP.md))
- **Entity Extraction**: Automatically detect NPCs, locations, and items mentioned during play
- **AI Image Generation**: Generate portraits for characters and images for locations using gpt-image-1
- **Kanka Integration**: Seamlessly create journal entries, characters, locations, and items in your Kanka campaign
- **Compendium Search**: Search existing Foundry VTT compendiums to avoid duplicate entity creation

### General

- **Unified Panel**: Single floating panel with 6 tabs (Live, Chronicle, Images, Transcript, Entities, Analytics)
- **Multi-Language Support**: Available in English, Italian, German, Spanish, French, Japanese, and Portuguese
- **API Resilience**: Retry with exponential backoff, request queue, and circuit breaker for all OpenAI calls
- **Speaker Labeling**: Inline rename and retroactive apply for speaker identification

## Requirements

- **Foundry VTT** v12 or v13
- **OpenAI API Key** - Required for cloud transcription, image generation, and live AI features (optional if using offline transcription - see [Whisper Setup](docs/WHISPER_SETUP.md))
- **Kanka Account** - Required for publishing chronicles (free tier supported)
- **Modern Browser** with microphone access support

## Installation

### Method 1: Module Browser (Recommended)

1. Open Foundry VTT
2. Go to **Add-on Modules** tab
3. Click **Install Module**
4. Search for "VoxChronicle" or paste the manifest URL:
   ```
   https://github.com/Aiacos/VoxChronicle/releases/latest/download/module.json
   ```
5. Click **Install**

### Method 2: Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/Aiacos/VoxChronicle/releases)
2. Extract the zip file to your Foundry VTT modules folder:
   - **Linux**: `~/.local/share/FoundryVTT/Data/modules/`
   - **macOS**: `~/Library/Application Support/FoundryVTT/Data/modules/`
   - **Windows**: `%LOCALAPPDATA%\FoundryVTT\Data\modules\`
3. Rename the extracted folder to `vox-chronicle`
4. Restart Foundry VTT

### Method 3: Development (Symbolic Link)

For developers who want to contribute:

```bash
# Clone the repository
git clone https://github.com/Aiacos/VoxChronicle.git

# Linux - Create symbolic link
ln -s /path/to/VoxChronicle ~/.local/share/FoundryVTT/Data/modules/vox-chronicle

# macOS - Create symbolic link
ln -s /path/to/VoxChronicle ~/Library/Application\ Support/FoundryVTT/Data/modules/vox-chronicle

# Windows (Run as Administrator) - Create junction
mklink /J "C:\Users\{User}\AppData\Local\FoundryVTT\Data\modules\vox-chronicle" "path\to\VoxChronicle"
```

## Setup

### 1. Enable the Module

1. Launch Foundry VTT and open your World
2. Go to **Settings** > **Manage Modules**
3. Find **VoxChronicle** and check the box to enable it
4. Click **Save Module Settings**

### 2. Configure API Keys

Navigate to **Settings** > **Module Settings** > **VoxChronicle**

#### OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Paste it in the **OpenAI API Key** field
4. The key is stored client-side (per user)

> **Note**: OpenAI charges for API usage. See [Cost Considerations](#cost-considerations) for details.

#### Kanka API Token

1. Go to [Kanka API Settings](https://app.kanka.io/settings/api)
2. Create a new Personal Access Token
3. Paste it in the **Kanka API Token** field
4. Enter your **Campaign ID** (found in your campaign's URL: `https://app.kanka.io/w/CAMPAIGN_ID/...`)

> **Note**: Tokens expire after 364 days. VoxChronicle will warn you when renewal is needed.

### 3. Configure Transcription Mode (Optional)

VoxChronicle supports both cloud-based (OpenAI) and offline transcription:

#### Cloud Transcription (Default)
- Uses OpenAI's GPT-4o API
- Requires API key and internet connection
- Supports speaker diarization
- Costs $0.006/minute

#### Offline Transcription
- Uses local Whisper models via whisper.cpp server
- Zero cost, fully private
- No API key required
- Requires separate setup - see [Whisper Setup Guide](docs/WHISPER_SETUP.md)

To enable offline mode:
1. Set up a whisper.cpp server (see [setup guide](docs/WHISPER_SETUP.md))
2. In module settings, set **Transcription Mode** to "Offline (Whisper)"
3. Enter your **Whisper Server URL** (e.g., `http://localhost:8080`)

### 4. Configure Audio Settings

- **Audio Source**: Choose between Foundry VTT WebRTC or browser microphone
- **Echo Cancellation**: Recommended for speaker audio setups
- **Noise Suppression**: Recommended for noisy environments

### 5. Configure Speaker Labels

1. Go to **Settings** > **Module Settings** > **VoxChronicle**
2. Click **Configure Speakers**
3. Map speaker IDs to player/GM names for accurate attribution in transcripts

## Usage

### Live Mode

1. Click the VoxChronicle icon in the left sidebar
2. Open the **Live** tab in the unified panel
3. Select a journal entry for chapter tracking (optional)
4. Click **Start Live Session**
5. During gameplay:
   - AI suggestions appear contextually (narration, dialogue, action, reference)
   - Scene type is detected automatically
   - Off-track alerts appear when players deviate
   - Session analytics track speaker participation in real time
6. Click **End Live Session** when finished

### Chronicle Mode

1. **Start Recording**
   - Click the VoxChronicle icon in the left sidebar
   - Open the **Chronicle** tab
   - Grant microphone permission if prompted
   - Click **Start Recording**
   - A recording indicator with audio level meter will appear

2. **During the Session**
   - Recording continues in the background
   - You can pause/resume as needed
   - Duration and status are displayed in the control panel

3. **Stop Recording**
   - Click **Stop Recording** when the session ends
   - The audio will be processed for transcription

### Processing the Transcription

After recording stops:

1. **Transcription**: Audio is processed using your selected mode:
   - **Cloud Mode**: Sent to OpenAI for transcription with speaker diarization
   - **Offline Mode**: Sent to your local Whisper server for private transcription
2. **Entity Extraction**: AI analyzes the transcript for NPCs, locations, and items
3. **Review**: You can review extracted entities before creating them
4. **Image Generation**: Optionally generate AI portraits for entities

### Publishing to Kanka

1. **Review Entities**: Check the extracted entities and make edits if needed
2. **Generate Portraits**: Click to generate AI portraits for selected entities
3. **Publish**: Click **Publish to Kanka** to create:
   - A journal entry with the session transcript
   - Character entries for new NPCs
   - Location entries for new places
   - Item entries for new objects

## Configuration Options

| Setting | Scope | Description |
|---------|-------|-------------|
| OpenAI API Key | Client | Your OpenAI API key for transcription, images, and live AI |
| Kanka API Token | World | Kanka personal access token |
| Campaign ID | World | Your Kanka campaign ID |
| Transcription Mode | World | Cloud (OpenAI) or Offline (Whisper) |
| Whisper Server URL | World | URL of your whisper.cpp server (for offline mode) |
| Transcription Language | World | Language hint for improved accuracy |
| Audio Source | World | Foundry VTT or microphone capture |
| Echo Cancellation | World | Enable audio echo cancellation |
| Noise Suppression | World | Enable background noise reduction |
| Image Quality | World | Standard or HD image quality |
| Max Images Per Session | World | Limit on generated images |
| Auto-Extract Entities | World | Automatically extract entities after transcription |
| Confirm Entity Creation | World | Require confirmation before creating entities |
| Off-Track Sensitivity | World | How sensitive off-track detection is (Live Mode) |
| Debug Mode | Client | Enable verbose logging |

## Cost Considerations

VoxChronicle can use the OpenAI API which has usage-based pricing:

| Service | Model | Cost |
|---------|-------|------|
| Transcription (Cloud) | GPT-4o Transcribe | $0.006/minute |
| Transcription (Offline) | Whisper (local) | **Free** |
| Image Generation | gpt-image-1 (Standard) | $0.02/image |
| Image Generation | gpt-image-1 (HD) | $0.04/image |

**Example** (Cloud Mode): A 3-hour session with 5 generated images:
- Transcription: 180 minutes x $0.006 = $1.08
- Images: 5 x $0.02 = $0.10
- **Total**: ~$1.18

**Example** (Offline Mode): A 3-hour session with 5 generated images:
- Transcription: **$0.00** (uses local Whisper)
- Images: 5 x $0.02 = $0.10
- **Total**: ~$0.10

**Tips for Cost Management**:
- **Use offline transcription mode** for zero-cost transcription (see [Whisper Setup](docs/WHISPER_SETUP.md))
- Pause recording during breaks
- Limit the number of generated images per session
- Use Standard quality images instead of HD
- Review extracted entities before generating portraits

## Architecture

```
VoxChronicle/
├── module.json              # Foundry VTT module manifest
├── scripts/
│   ├── main.mjs             # Entry point
│   ├── constants.mjs        # MODULE_ID constant
│   ├── core/
│   │   ├── VoxChronicle.mjs # Main module singleton
│   │   ├── Settings.mjs     # Settings registration
│   │   └── VocabularyDictionary.mjs
│   ├── audio/
│   │   ├── AudioRecorder.mjs   # With level metering + silence detection
│   │   └── AudioChunker.mjs
│   ├── ai/
│   │   ├── OpenAIClient.mjs    # With retry, queue, circuit breaker
│   │   ├── TranscriptionService.mjs  # Multi-language support
│   │   ├── TranscriptionFactory.mjs
│   │   ├── LocalWhisperService.mjs
│   │   ├── WhisperBackend.mjs
│   │   ├── ImageGenerationService.mjs  # gpt-image-1
│   │   └── EntityExtractor.mjs
│   ├── narrator/               # Real-time DM assistant (from Narrator Master)
│   │   ├── AIAssistant.mjs
│   │   ├── ChapterTracker.mjs
│   │   ├── CompendiumParser.mjs
│   │   ├── JournalParser.mjs
│   │   ├── RulesReference.mjs
│   │   ├── SceneDetector.mjs
│   │   └── SessionAnalytics.mjs
│   ├── kanka/
│   │   ├── KankaClient.mjs
│   │   ├── KankaService.mjs
│   │   ├── KankaEntityManager.mjs
│   │   ├── KankaRelationshipManager.mjs
│   │   └── NarrativeExporter.mjs
│   ├── orchestration/
│   │   ├── SessionOrchestrator.mjs  # Dual mode: live + chronicle
│   │   ├── TranscriptionProcessor.mjs
│   │   ├── EntityProcessor.mjs
│   │   ├── ImageProcessor.mjs
│   │   └── KankaPublisher.mjs
│   ├── content/
│   │   └── CompendiumSearcher.mjs
│   ├── data/
│   │   ├── dnd-terms.mjs
│   │   └── dnd-vocabulary.mjs
│   ├── ui/
│   │   ├── MainPanel.mjs          # Unified 6-tab floating panel
│   │   ├── RecorderControls.mjs
│   │   ├── SpeakerLabeling.mjs    # Inline rename + retroactive apply
│   │   ├── EntityPreview.mjs
│   │   ├── RelationshipGraph.mjs
│   │   └── VocabularyManager.mjs
│   └── utils/
│       ├── Logger.mjs
│       ├── RateLimiter.mjs
│       ├── AudioUtils.mjs
│       ├── SensitiveDataFilter.mjs
│       ├── HtmlUtils.mjs
│       ├── ApiKeyValidator.mjs
│       ├── CacheManager.mjs
│       ├── DomUtils.mjs
│       └── ErrorNotificationHelper.mjs
├── styles/
│   └── vox-chronicle.css
├── templates/
│   ├── main-panel.hbs
│   ├── recorder.hbs
│   ├── speaker-labeling.hbs
│   ├── entity-preview.hbs
│   ├── relationship-graph.hbs
│   ├── vocabulary-manager.hbs
│   ├── analytics-tab.hbs
│   └── journal-picker.hbs
└── lang/
    ├── en.json, it.json, de.json, es.json
    ├── fr.json, ja.json, pt.json
    └── template.json
```

## API Rate Limits

VoxChronicle respects API rate limits to ensure reliable operation:

| API | Free Tier | Premium Tier |
|-----|-----------|--------------|
| Kanka | 30 requests/minute | 90 requests/minute |
| OpenAI | 60 requests/minute | Varies by plan |

The module automatically handles rate limiting with queuing, exponential backoff with jitter, and circuit breaker protection.

## Migrating from Narrator Master

If you previously used the **Narrator Master** module alongside VoxChronicle, all Narrator Master features are now integrated directly into VoxChronicle v2.0.0.

**Migration steps:**

1. **Disable Narrator Master** in Foundry VTT (Settings > Manage Modules)
2. **Update VoxChronicle** to v2.0.0 or later
3. **Enable VoxChronicle** and access Live Mode features from the unified panel
4. Narrator Master is now archived and no longer maintained separately

All Live Mode features (AI suggestions, off-track detection, NPC dialogue, rules Q&A, chapter tracking, scene detection, analytics) are available in the **Live** tab of VoxChronicle's unified panel.

## Troubleshooting

### Microphone Not Working

1. Ensure your browser has microphone permissions
2. Check that no other application is using the microphone
3. Try switching between Foundry VTT and microphone audio sources
4. Refresh the page and try again

### Transcription Fails

**For Cloud Mode (OpenAI):**
1. Verify your OpenAI API key is valid
2. Check your OpenAI account has sufficient credits
3. For long recordings, ensure audio is under 25MB per chunk (handled automatically)
4. Check browser console for specific error messages

**For Offline Mode (Whisper):**
1. Verify your Whisper server is running (test with `curl http://localhost:8080`)
2. Check the Whisper Server URL setting is correct
3. Ensure the server has the model loaded
4. Review server logs for errors
5. See [Whisper Setup Guide](docs/WHISPER_SETUP.md) for troubleshooting

### Kanka Publishing Fails

1. Verify your Kanka API token is valid
2. Ensure the Campaign ID is correct
3. Check you have permission to create entities in the campaign
4. Watch for rate limit warnings in the console

### Audio Quality Issues

- Enable echo cancellation if you hear feedback
- Enable noise suppression for cleaner audio
- Use a dedicated microphone for better quality
- Ensure stable internet connection for WebRTC

## Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Aiacos/VoxChronicle.git
cd VoxChronicle

# Install dependencies
npm install

# Run tests
npm test

# Link to Foundry for development
npm run link
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Foundry VTT](https://foundryvtt.com/) - Virtual tabletop platform
- [OpenAI](https://openai.com/) - AI transcription, image generation, and chat
- [Kanka](https://kanka.io/) - Campaign management platform

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/Aiacos/VoxChronicle/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/Aiacos/VoxChronicle/discussions)
- **Documentation**: [Wiki](https://github.com/Aiacos/VoxChronicle/wiki)

---

Made with dedication for the TTRPG community.
