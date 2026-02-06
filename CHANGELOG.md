# Changelog

All notable changes to VoxChronicle will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

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

[Unreleased]: https://github.com/voxchronicle/vox-chronicle/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/voxchronicle/vox-chronicle/releases/tag/v1.0.0
