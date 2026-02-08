# VoxChronicle

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v11--v12-informational)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Tests](https://img.shields.io/github/workflow/status/Aiacos/VoxChronicle/Test%20Suite)

Auto-transcribe your tabletop RPG sessions and publish chronicles to [Kanka](https://kanka.io) with AI-generated content and portraits.

## Features

- **Audio Recording**: Capture session audio from Foundry VTT's built-in voice chat or browser microphone (for Discord users)
- **Speaker Diarization**: Automatically identify and distinguish between different speakers (GM and players)
- **AI Transcription**: Convert recorded audio to text using OpenAI's GPT-4o transcription with timestamps
- **Offline Transcription Mode**: Use local Whisper models for privacy-focused, zero-cost transcription (see [Whisper Setup Guide](docs/WHISPER_SETUP.md))
- **Entity Extraction**: Automatically detect NPCs, locations, and items mentioned during play
- **AI Image Generation**: Generate portraits for characters and images for locations using DALL-E 3
- **Kanka Integration**: Seamlessly create journal entries, characters, locations, and items in your Kanka campaign
- **Compendium Search**: Search existing Foundry VTT compendiums to avoid duplicate entity creation
- **Multi-language Support**: Available in English and Italian

## Requirements

- **Foundry VTT** v11 or v12
- **OpenAI API Key** - Required for cloud transcription and image generation (optional if using offline mode - see [Whisper Setup](docs/WHISPER_SETUP.md))
- **Kanka Account** - Required for publishing chronicles (free tier supported)
- **Modern Browser** with microphone access support

## Installation

### Method 1: Module Browser (Recommended)

1. Open Foundry VTT
2. Go to **Add-on Modules** tab
3. Click **Install Module**
4. Search for "VoxChronicle" or paste the manifest URL:
   ```
   https://github.com/voxchronicle/vox-chronicle/releases/latest/download/module.json
   ```
5. Click **Install**

### Method 2: Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/voxchronicle/vox-chronicle/releases)
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
git clone https://github.com/voxchronicle/vox-chronicle.git

# Linux - Create symbolic link
ln -s /path/to/vox-chronicle ~/.local/share/FoundryVTT/Data/modules/vox-chronicle

# macOS - Create symbolic link
ln -s /path/to/vox-chronicle ~/Library/Application\ Support/FoundryVTT/Data/modules/vox-chronicle

# Windows (Run as Administrator) - Create junction
mklink /J "C:\Users\{User}\AppData\Local\FoundryVTT\Data\modules\vox-chronicle" "path\to\vox-chronicle"
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

### Recording a Session

1. **Start Recording**
   - Click the VoxChronicle icon in the left sidebar
   - Grant microphone permission if prompted
   - Click **Start Recording**
   - A recording indicator will appear

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
| OpenAI API Key | Client | Your OpenAI API key for transcription and images |
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

## Cost Considerations

VoxChronicle can use the OpenAI API which has usage-based pricing:

| Service | Model | Cost |
|---------|-------|------|
| Transcription (Cloud) | GPT-4o Transcribe | $0.006/minute |
| Transcription (Offline) | Whisper (local) | **Free** |
| Image Generation | DALL-E 3 (Standard) | $0.04/image |
| Image Generation | DALL-E 3 (HD) | $0.08/image |

**Example** (Cloud Mode): A 3-hour session with 5 generated images:
- Transcription: 180 minutes × $0.006 = $1.08
- Images: 5 × $0.04 = $0.20
- **Total**: ~$1.28

**Example** (Offline Mode): A 3-hour session with 5 generated images:
- Transcription: **$0.00** (uses local Whisper)
- Images: 5 × $0.04 = $0.20
- **Total**: ~$0.20

**Tips for Cost Management**:
- **Use offline transcription mode** for zero-cost transcription (see [Whisper Setup](docs/WHISPER_SETUP.md))
- Pause recording during breaks
- Limit the number of generated images per session
- Use Standard quality images instead of HD
- Review extracted entities before generating portraits

## Architecture

```
vox-chronicle/
├── module.json              # Foundry VTT module manifest
├── scripts/
│   ├── main.mjs             # Entry point
│   ├── core/
│   │   ├── VoxChronicle.mjs # Main module singleton
│   │   └── Settings.mjs     # Settings registration
│   ├── audio/
│   │   ├── AudioRecorder.mjs
│   │   └── AudioChunker.mjs
│   ├── ai/
│   │   ├── OpenAIClient.mjs
│   │   ├── TranscriptionService.mjs
│   │   ├── ImageGenerationService.mjs
│   │   └── EntityExtractor.mjs
│   ├── kanka/
│   │   ├── KankaClient.mjs
│   │   ├── KankaService.mjs
│   │   └── NarrativeExporter.mjs
│   ├── orchestration/
│   │   └── SessionOrchestrator.mjs
│   ├── content/
│   │   └── CompendiumSearcher.mjs
│   ├── ui/
│   │   ├── RecorderControls.mjs
│   │   ├── SpeakerLabeling.mjs
│   │   └── EntityPreview.mjs
│   └── utils/
│       ├── Logger.mjs
│       ├── RateLimiter.mjs
│       └── AudioUtils.mjs
├── styles/
│   └── vox-chronicle.css
├── templates/
│   ├── recorder.hbs
│   ├── speaker-labeling.hbs
│   └── entity-preview.hbs
└── lang/
    ├── en.json
    └── it.json
```

## API Rate Limits

VoxChronicle respects API rate limits to ensure reliable operation:

| API | Free Tier | Premium Tier |
|-----|-----------|--------------|
| Kanka | 30 requests/minute | 90 requests/minute |
| OpenAI | 60 requests/minute | Varies by plan |

The module automatically handles rate limiting with queuing and exponential backoff.

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
git clone https://github.com/voxchronicle/vox-chronicle.git
cd vox-chronicle

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
- [OpenAI](https://openai.com/) - AI transcription and image generation
- [Kanka](https://kanka.io/) - Campaign management platform

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/voxchronicle/vox-chronicle/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/voxchronicle/vox-chronicle/discussions)
- **Documentation**: [Wiki](https://github.com/voxchronicle/vox-chronicle/wiki)

---

Made with dedication for the TTRPG community.
