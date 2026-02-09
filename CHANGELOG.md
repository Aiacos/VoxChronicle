# Changelog

All notable changes to VoxChronicle will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-02-09

### Added

#### Offline Transcription Mode
- **Local Whisper Backend**: Support for privacy-focused local transcription using Whisper running on user's machine
- **Transcription Mode Selection**: New setting to choose between API, Local, or Auto (with fallback) transcription modes
- **WhisperBackend Abstraction**: HTTP client for communicating with local Whisper server (whisper.cpp, faster-whisper, etc.)
- **LocalWhisperService**: Full-featured local transcription service matching OpenAI API interface
- **TranscriptionFactory**: Factory pattern for creating appropriate transcription service based on mode
- **Auto Mode with Fallback**: Automatically falls back to OpenAI API if local backend unavailable
- **Mode Indicator UI**: Visual badge in recorder controls showing current transcription mode (API/Local/Auto)
- **Health Status Monitoring**: Real-time health checks for local backend with visual status indicators
- **Whisper Backend URL Setting**: Configurable endpoint for local Whisper server (default: http://localhost:8080)
- **Mode Indicator Toggle**: Client-side setting to show/hide transcription mode indicator

#### Configuration Panel
- **VoxChronicleConfig**: Dedicated FormApplication settings panel accessible from Foundry module settings menu
- **Grouped Settings UI**: API keys, transcription mode, Kanka integration, and advanced settings organized in tabs
- **Kanka Campaign Selector**: `getCampaigns()` method on KankaClient for campaign dropdown

#### Orchestrator Refactoring
- **SessionOrchestrator** refactored from monolithic class into 4 focused processors:
  - `TranscriptionProcessor` - audio transcription workflow with auto-fallback
  - `EntityProcessor` - entity extraction workflow
  - `ImageProcessor` - image generation workflow
  - `KankaPublisher` - Kanka publishing workflow

#### Test Suite
- Comprehensive test coverage: **2029 tests** across **38 test files**
- Unit tests for all core, AI, audio, kanka, orchestration, and UI modules
- Integration tests for full session flow, recording, transcription, and publication
- Test mocks for Foundry VTT, OpenAI, and Kanka APIs

#### Documentation
- **WHISPER_SETUP.md**: Comprehensive setup guide for local Whisper backend
- **GPT4O_TRANSCRIBE_API.md**: Complete diarization API documentation
- **tests/README.md**: Test coverage quick-start and documentation
- **Migration guide** template section in CHANGELOG
- Inline comments for speaker mapping algorithm and multi-chunk transcription

#### Localization
- English and Italian translations for offline mode, configuration panel, and all UI strings
- Localized previously hardcoded UI strings (segments, speakers, cancel session, etc.)

### Changed
- UI section collapse/expand now uses smooth CSS animations
- Help details accordion uses animated transitions
- ESLint + Prettier enforced across entire codebase (0 errors, 0 warnings)

### Technical Details
- Local backend communication via HTTP with health checks and retry logic
- Response format normalization to match OpenAI diarized JSON structure
- Audio chunking support for large files (25MB+ limit handling)
- Graceful degradation when local backend unavailable in auto mode
- Progress callbacks report current mode and fallback status

## [1.0.0] - 2026-02-06

Initial release of VoxChronicle - the Foundry VTT session transcription and Kanka publishing module.

### Added

#### Core Features
- **Audio Recording**: Capture session audio from Foundry VTT WebRTC or browser microphone fallback
- **Speaker Diarization**: Automatic speaker identification using OpenAI's GPT-4o transcription with diarization
- **AI Transcription**: Convert recorded audio to timestamped text with speaker attribution
- **Entity Extraction**: AI-powered detection of NPCs, locations, and items from transcription text
- **Image Generation**: DALL-E 3 integration for generating character portraits, location images, and scene illustrations
- **Kanka Integration**: Seamless creation of journals, characters, locations, and items in Kanka campaigns

#### Audio Services
- `AudioRecorder` class with MediaRecorder API integration
- Foundry VTT WebRTC stream capture via `game.webrtc.client`
- Browser microphone capture fallback for Discord users
- Configurable echo cancellation and noise suppression
- `AudioChunker` class for splitting recordings into 25MB segments (OpenAI API limit)
- MIME type auto-detection for cross-browser compatibility (WebM, Ogg, MP4, WAV)

#### OpenAI Integration
- `OpenAIClient` base class with authentication and error handling
- `TranscriptionService` for GPT-4o-transcribe-diarize model with speaker mapping
- `ImageGenerationService` for DALL-E 3 with entity-specific prompt templates
- `EntityExtractor` for AI-powered entity detection and salient moment identification
- Automatic chunking strategy for long recordings
- Cost estimation for transcription and image generation

#### Kanka Integration
- `KankaClient` base class with Bearer token authentication
- `KankaService` with full CRUD operations for journals, characters, locations, and items
- Image upload support for entity portraits (URL and Blob)
- Rate limiting (30 req/min free, 90 req/min premium)
- Automatic retry with exponential backoff on 429 responses
- `NarrativeExporter` for formatting transcripts as Kanka journal entries
- AI-enhanced summary generation using GPT-4o

#### User Interface
- `RecorderControls` Application for start/stop/pause recording
- `SpeakerLabeling` FormApplication for mapping speaker IDs to player names
- `EntityPreview` Application for reviewing extracted entities before Kanka publish
- Scene control buttons for quick access to module features
- Real-time recording duration display
- Progress indicators for transcription and entity creation

#### Foundry VTT Integration
- Module manifest (module.json) compatible with Foundry VTT v11 and v12
- Singleton pattern `VoxChronicle` class with service orchestration
- `SessionOrchestrator` for managing complete session workflows
- `CompendiumSearcher` for finding existing entities in Foundry compendiums
- Settings registration with client and world scopes
- Scene control button integration

#### Localization
- English (en.json) language file with complete UI translations
- Italian (it.json) language file with complete UI translations

#### Utilities
- `Logger` utility with module-prefixed console output and log levels
- `RateLimiter` utility with sliding window algorithm and request queuing
- `AudioUtils` helper for MIME type detection and blob conversion

#### Styles & Templates
- `vox-chronicle.css` stylesheet with CSS variables for theming
- Handlebars templates for recorder, speaker labeling, and entity preview UIs
- Responsive design for various screen sizes
- Recording pulse animation and processing spinner

#### Documentation
- Comprehensive README.md with installation, setup, and usage instructions
- CHANGELOG.md (this file) following Keep a Changelog format

### Security
- API keys stored securely in Foundry VTT settings (not in source code)
- Client-side storage for OpenAI API key (per-user)
- World-side storage for Kanka credentials (shared across users)
- No sensitive data logged to console

### Technical Notes
- Pure ES6 modules (ESM) architecture
- OOP design with clear separation of concerns
- Comprehensive error handling with user-friendly notifications
- Full JSDoc documentation in source files

---

## Migration Guide

This section provides step-by-step instructions for upgrading between major versions of VoxChronicle. Follow the guide corresponding to your upgrade path.

### Migrating to 1.1.0 (Offline Transcription Mode)

Version 1.1.0 introduces optional offline transcription using local Whisper backends. **This is a non-breaking update** - existing users can continue using OpenAI API transcription without any changes.

#### What's New

- **Transcription Mode Setting**: Choose between API (OpenAI), Local (Whisper), or Auto (try local, fallback to API)
- **Optional API Key**: OpenAI API key is now optional if you use local transcription exclusively
- **Whisper Backend URL**: Configure the endpoint for your local Whisper server
- **Mode Indicator**: Visual badge showing current transcription mode in the recorder UI

#### Migration Steps

**Option 1: Continue Using OpenAI API (No Action Required)**

If you're happy with cloud-based transcription, you don't need to do anything. Your existing setup will continue working as before.

1. After updating to 1.1.0, your **Transcription Mode** will default to `API`
2. All recordings will use OpenAI transcription as usual
3. No configuration changes needed

**Option 2: Switch to Local Offline Transcription**

To enable privacy-focused, cost-free local transcription:

1. **Set up a local Whisper backend** following the [WHISPER_SETUP.md](docs/WHISPER_SETUP.md) guide
   - Install whisper.cpp, faster-whisper, or another compatible backend
   - Start the Whisper server (default: `http://localhost:8080`)
   - Verify the server is running and accessible

2. **Update VoxChronicle settings** in Foundry VTT:
   - Go to **Settings** → **Module Settings** → **VoxChronicle**
   - Set **Transcription Mode** to `Local`
   - Set **Whisper Backend URL** to your server address (e.g., `http://localhost:8080`)
   - *(Optional)* Enable **Show Mode Indicator** to see transcription status in the UI
   - Click **Save**

3. **Test your setup**:
   - Click the VoxChronicle icon in the scene controls
   - Start a short test recording (10-30 seconds)
   - Stop the recording and verify transcription works
   - Check the mode indicator badge shows "Local"

4. **Remove OpenAI API key** (optional):
   - If you're using local transcription exclusively, you can remove your OpenAI API key
   - **Note:** You'll still need an API key for AI image generation and entity extraction features
   - To disable these features, adjust the corresponding settings

**Option 3: Use Auto Mode (Best of Both Worlds)**

For flexibility with automatic fallback:

1. **Set up a local Whisper backend** (see Option 2, step 1)

2. **Keep your OpenAI API key configured** in VoxChronicle settings

3. **Update transcription mode**:
   - Go to **Settings** → **Module Settings** → **VoxChronicle**
   - Set **Transcription Mode** to `Auto`
   - Set **Whisper Backend URL** to your server address
   - Click **Save**

4. **How Auto Mode works**:
   - VoxChronicle will try local transcription first
   - If the local backend is unavailable or fails, it automatically falls back to OpenAI API
   - The mode indicator shows which service is being used
   - Perfect for laptops that may not always have the local server running

#### Settings Reference

| Setting | Description | Default | Required? |
|---------|-------------|---------|-----------|
| **Transcription Mode** | Choose API, Local, or Auto | `API` | Yes |
| **Whisper Backend URL** | URL of your local Whisper server | `http://localhost:8080` | Only for Local/Auto modes |
| **Show Mode Indicator** | Display transcription mode badge in UI | `true` | No |
| **OpenAI API Key** | Your OpenAI API key | *(none)* | Only for API/Auto modes and image generation |

#### Troubleshooting Common Issues

**Issue: "Local backend not available" error**

- **Solution**: Verify your Whisper server is running and accessible
- Test with: `curl http://localhost:8080/health` (should return status information)
- Check the Whisper Backend URL setting matches your server address
- See [WHISPER_SETUP.md](docs/WHISPER_SETUP.md) for detailed troubleshooting

**Issue: Transcription is slow with local mode**

- **Solution**: Consider using a faster model (tiny, base) or enabling GPU acceleration
- See the Model Selection section in [WHISPER_SETUP.md](docs/WHISPER_SETUP.md)
- Alternatively, switch to Auto mode to use API for long recordings

**Issue: Mode indicator not showing**

- **Solution**: Enable **Show Mode Indicator** in module settings
- Refresh the page after changing the setting

#### Breaking Changes

**None.** Version 1.1.0 is fully backward compatible with 1.0.0. All new features are opt-in.

#### Recommended Actions

1. **Review the documentation**: Read [WHISPER_SETUP.md](docs/WHISPER_SETUP.md) to understand local transcription setup
2. **Test before your session**: If switching to local mode, test with a short recording first
3. **Update your workflow**: Consider using Auto mode for maximum reliability

#### Need Help?

- Check the [Troubleshooting section](docs/WHISPER_SETUP.md#troubleshooting) in WHISPER_SETUP.md
- Review the [User Guide](docs/USER_GUIDE.md) for configuration details
- Report issues on [GitHub Issues](https://github.com/voxchronicle/vox-chronicle/issues)

---

[Unreleased]: https://github.com/Aiacos/VoxChronicle/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Aiacos/VoxChronicle/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/Aiacos/VoxChronicle/releases/tag/v1.0.0
