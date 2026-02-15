# Narrator Master → VoxChronicle Merger Design

**Date**: 2026-02-15
**Status**: Approved
**Version Target**: VoxChronicle v2.0.0

## Context

VoxChronicle (v1.5.0) handles post-session workflow: Record → Transcribe → Extract entities → Generate images → Publish to Kanka.io.
Narrator Master (v1.3.3) provides real-time DM assistance: Live transcription → AI suggestions → Off-track detection → Chapter tracking → Rules Q&A.

These are complementary modules. This design merges Narrator Master into VoxChronicle as a complete absorption — single module ID (`vox-chronicle`), single install.

## Decisions

| Decision | Choice |
|----------|--------|
| Merge strategy | Full absorption into VoxChronicle |
| Code conflicts | Best of both implementations |
| Localizations | Keep all 7 languages (en, it, de, es, fr, ja, pt) |
| Foundry compatibility | v12-v13 |
| UI approach | Unified floating panel + Scene Controls |
| Image model | gpt-image-1 (replaces deprecated dall-e-3) |
| Post-merge narrator_master | Archive and deprecate |
| Integration approach | Big-Bang restructure |

## Architecture: Service Mapping (Best of Both)

| Service | Base Source | From Other |
|---------|-----------|------------|
| OpenAI Base Client | **NM** (retry/queue/circuit breaker) | VC: RateLimiter sliding window (for Kanka) |
| Audio Capture | **NM** (level metering, silence detection) | VC: WebRTC/System Audio capture, echo/noise settings |
| Transcription | **VC** (Factory, Local Whisper, Chunker) | NM: Multi-language mode, circuit breaker |
| Speaker Labels | **VC** (auto-detect, known speakers) | NM: Inline rename, retroactive apply |
| Image Generation | **NM** (gpt-image-1, base64 cache, gallery) | VC: Entity-specific prompt templates |
| Vocabulary | **VC** (5 categories, import/export, Foundry suggest) | NM: D&D mechanics dictionary, rules integration |
| Logger | **VC** (child pattern, module-prefixed) | NM: Debug mode toggle |

### New services from Narrator Master (no equivalent in VC)

- **AIAssistant**: GPT-4o-mini contextual suggestions, off-track detection, narrative bridges, NPC dialogue
- **ChapterTracker**: Current chapter/scene tracking from Foundry journals
- **JournalParser**: Journal entry parsing + keyword index (5000 entry LRU)
- **CompendiumParser**: SRD/rules compendium parsing
- **SceneDetector**: Scene type detection (combat/social/exploration/rest)
- **SessionAnalytics**: Session statistics tracking
- **RulesReference**: D&D rules question detection and SRD answers

## Directory Structure

```
VoxChronicle/
├── module.json
├── scripts/
│   ├── main.mjs
│   ├── constants.mjs
│   ├── core/
│   │   ├── VoxChronicle.mjs         # Expanded singleton
│   │   ├── Settings.mjs             # Unified settings
│   │   └── VocabularyDictionary.mjs
│   ├── audio/
│   │   ├── AudioRecorder.mjs        # MERGED
│   │   └── AudioChunker.mjs
│   ├── ai/
│   │   ├── OpenAIClient.mjs         # MERGED (NM retry/queue + VC rate limiter)
│   │   ├── TranscriptionService.mjs  # MERGED (VC factory + NM multi-lang)
│   │   ├── TranscriptionFactory.mjs
│   │   ├── LocalWhisperService.mjs
│   │   ├── WhisperBackend.mjs
│   │   ├── ImageGenerationService.mjs # UPDATED to gpt-image-1
│   │   ├── EntityExtractor.mjs
│   │   ├── AIAssistant.mjs           # NEW from NM
│   │   └── RulesReference.mjs        # NEW from NM
│   ├── kanka/                        # Unchanged from VC
│   ├── orchestration/
│   │   ├── SessionOrchestrator.mjs   # EXPANDED (live + post-session)
│   │   ├── TranscriptionProcessor.mjs
│   │   ├── EntityProcessor.mjs
│   │   ├── ImageProcessor.mjs
│   │   └── KankaPublisher.mjs
│   ├── narrator/                     # NEW directory
│   │   ├── ChapterTracker.mjs
│   │   ├── JournalParser.mjs
│   │   ├── CompendiumParser.mjs
│   │   ├── SceneDetector.mjs
│   │   └── SessionAnalytics.mjs
│   ├── content/
│   │   └── CompendiumSearcher.mjs
│   ├── ui/
│   │   ├── MainPanel.mjs            # NEW unified panel
│   │   ├── RecorderControls.mjs     # Reduced, embedded
│   │   ├── SpeakerLabeling.mjs      # MERGED
│   │   ├── EntityPreview.mjs
│   │   ├── RelationshipGraph.mjs
│   │   └── VocabularyManager.mjs
│   ├── utils/
│   │   ├── Logger.mjs               # MERGED
│   │   ├── RateLimiter.mjs
│   │   ├── AudioUtils.mjs
│   │   ├── SensitiveDataFilter.mjs
│   │   ├── HtmlUtils.mjs
│   │   ├── ApiKeyValidator.mjs
│   │   ├── CacheManager.mjs         # From NM
│   │   ├── DomUtils.mjs             # From NM
│   │   └── ErrorNotificationHelper.mjs # From NM
│   └── data/
│       ├── dnd-vocabulary.mjs
│       └── dnd-terms.mjs            # From NM
├── styles/
│   └── vox-chronicle.css            # MERGED styles
├── templates/
│   ├── main-panel.hbs               # NEW unified panel
│   ├── recorder.hbs
│   ├── speaker-labeling.hbs
│   ├── entity-preview.hbs
│   ├── relationship-graph.hbs
│   ├── vocabulary-manager.hbs
│   ├── journal-picker.hbs           # From NM
│   └── analytics-tab.hbs            # From NM
├── lang/                             # 7 languages
│   ├── en.json, it.json             # MERGED
│   ├── de.json, es.json, fr.json, ja.json, pt.json
│   └── template.json
└── tests/
```

## UI Design: Unified Panel

### Layout

```
┌─────────────────────────────────────────────┐
│  VoxChronicle                    [_] [□] [×] │
├─────────────────────────────────────────────┤
│  [● REC] [⏸] [⏹]    00:12:34    🔊 ████░░  │
│  Mode: API ✓   |   Chapter: "The Dark Cave"  │
├─────────────────────────────────────────────┤
│  [Live] [Chronicle] [Images] [Transcript]    │
│         [Entities] [Analytics]               │
├─────────────────────────────────────────────┤
│           (Tab content area)                 │
└─────────────────────────────────────────────┘
```

### Tabs

| Tab | Content |
|-----|---------|
| Live | AI suggestions, off-track warning, narrative bridge, NPC dialogue, rules Q&A, chapter nav |
| Chronicle | Post-session Kanka workflow |
| Images | Gallery (gpt-image-1), generate from context/entity, lightbox |
| Transcript | Live transcript with speaker labels, scene breaks, export |
| Entities | Entity preview (characters, locations, items, relationships) |
| Analytics | Session stats, speaker participation, scene breakdown |

### Fixed elements (above tabs)

- Recording controls (start/stop/pause/resume)
- Audio level meter
- Transcription mode indicator (API/Local/Auto)
- Chapter indicator
- Off-track badge on Live tab

### Scene Controls

- Panel toggle
- Vocabulary manager
- Relationship graph
- Speaker labels
- Settings

## Settings

### Kept from VoxChronicle (unchanged)

openaiApiKey, kankaApiToken, kankaCampaignId, transcriptionLanguage, transcriptionMode, whisperBackendUrl, showTranscriptionModeIndicator, audioCaptureSource, echoCancellation, noiseSuppression, imageQuality, maxImagesPerSession, autoExtractEntities, confirmEntityCreation, autoExtractRelationships, relationshipConfidenceThreshold, maxRelationshipsPerSession, speakerLabels, pendingSessions, knownSpeakers, customVocabularyDictionary, kankaApiTokenCreatedAt

### New from Narrator Master

- multiLanguageMode (Boolean, default: false)
- transcriptionBatchDuration (Number, 5000-30000ms, default: 10000)
- offTrackSensitivity (String: low/medium/high, default: medium)
- rulesDetection (Boolean, default: true)
- rulesSource (String: auto/dnd5e, default: auto)
- debugMode (Boolean, default: false)
- apiRetryEnabled, apiRetryMaxAttempts, apiRetryBaseDelay, apiRetryMaxDelay
- apiQueueMaxSize
- imageGallery (Object, hidden)
- panelPosition (Object, client)

## Versioning

- **Version**: 2.0.0
- **Module ID**: vox-chronicle (unchanged)
- **Compatibility**: minimum 12, verified 13
- No automatic migration from narrator-master settings

## Testing

- Framework: Vitest
- Update existing 2029 VC tests for changed services
- Port NM tests for new services
- Add integration tests for unified workflow
- All tests green before release

## Documentation

- Updated README with Live Mode + Chronicle Mode
- CHANGELOG entry for v2.0.0
- Migration guide for Narrator Master users
- Architecture guide updated
- narrator_master repository archived with deprecation notice
