# Technology Stack

**Analysis Date:** 2026-02-28

## Languages

**Primary:**
- **JavaScript (ES6+)** - All module code uses ES6 modules with `.mjs` extension
  - Entry point: `scripts/main.mjs`
  - Module uses modern features: async/await, arrow functions, destructuring, template literals

**Configuration:**
- **JSON** - `module.json` (Foundry VTT manifest), `package.json` (Node.js), language files

## Runtime

**Environment:**
- **Foundry VTT v13** - Primary runtime environment (compatibility range: 13.x)
  - Uses Foundry VTT API for settings, hooks, UI, and game state access
  - No Node.js runtime required for production use (browser-only module)

**Package Manager:**
- **npm** - Node.js package manager
  - Lockfile: `package-lock.json` (present)
  - Node.js requirement: ≥18.0.0 (from `package.json` engines)

## Frameworks

**Core Framework:**
- **Foundry VTT v13 Module API** - Core framework for VTT integration
  - ApplicationV2 + HandlebarsApplicationMixin for UI components (`scripts/ui/`)
  - Hooks system for module lifecycle (`Hooks.once('init')`, `Hooks.once('ready')`)
  - Settings system (`game.settings.register()`) with client/world scopes

**UI Framework:**
- **Handlebars** - Template engine for rendering UI components
  - Templates location: `templates/` directory
  - Main panel template: `templates/main-panel.hbs`
  - Recorded component templates: `templates/recorder.hbs`, `templates/speaker-labeling.hbs`, etc.

**Styling:**
- **CSS3** - All styles namespaced with `.vox-chronicle` prefix
  - Main stylesheet: `styles/vox-chronicle.css`
  - BEM-style naming convention for component classes

**Transcription Framework:**
- **MediaRecorder API** - Browser standard for audio capture
  - Audio chunk rotation strategy for gapless recording (`scripts/audio/AudioRecorder.mjs`)
  - WebM format for transcription-ready output

**Testing:**
- **Vitest** v2.0.0 - Unit and integration test runner
  - Configuration: `vitest.config.js` and `vitest.integration.config.js`
  - Environment: jsdom (browser simulation)
  - Coverage provider: v8
  - Test count: 3888+ tests across 46+ files
  - Coverage thresholds: 90% statements/functions, 85% branches, 90% lines

**Build/Dev Tools:**
- **ESLint** 9.39.2 - Code linting with flat config format
  - Config: `eslint.config.js`
  - Plugins: `@eslint/js`, `eslint-plugin-jsdoc`
  - Rules enforce: const/no-var, semicolons, JSDoc standards

- **Prettier** 3.8.1 - Code formatting
  - Config: `.prettierrc.json`
  - Settings: 100 character line width, single quotes, 2-space indent, trailing commas disabled

- **Bash build script** - `build.sh` for packaging module as ZIP
  - Auto-detects version and module ID from `module.json`
  - Creates release ZIP with download URL baked in

## Key Dependencies

**No Direct npm Dependencies in Production Code**

The module uses fetch-based HTTP clients (no axios, no libraries). All external service communication is implemented natively:

**Development Dependencies (DevDependencies):**

| Package | Version | Purpose |
|---------|---------|---------|
| @eslint/js | 9.39.2 | ESLint JavaScript rules base |
| eslint | 9.39.2 | Code linting and validation |
| eslint-plugin-jsdoc | 62.5.4 | JSDoc documentation validation |
| prettier | 3.8.1 | Code formatting and consistency |
| vitest | 2.0.0 | Test runner and assertion framework |
| @vitest/coverage-v8 | 2.0.0 | Code coverage reporting (v8 provider) |
| @vitest/ui | 2.0.0 | Visual test runner UI |
| jsdom | 24.0.0 | Browser DOM simulation for tests |

**No Runtime Production Dependencies** - Uses browser native APIs:
- `fetch()` for HTTP requests (with custom retry/queue logic in `OpenAIClient` and `KankaClient`)
- `FormData`, `Blob`, `File` for multipart uploads
- `AbortController` for request cancellation and timeout
- `MediaRecorder` for audio capture
- `AudioContext` for audio analysis and level metering

**Browser APIs Required:**
- Microphone access (getUserMedia API)
- WebRTC for Foundry VTT audio capture (optional, auto-fallback)
- Local file storage via Foundry VTT settings system (not localStorage/IndexedDB)

## Configuration

**Environment:**
- Configuration is fully Foundry VTT settings-based (no .env files)
- Two scope types used:
  - **client**: Per-user settings (API keys, preferences)
  - **world**: Shared campaign settings (Kanka campaign ID, shared preferences)

**Critical Settings (Keys in `scripts/core/Settings.mjs`):**
- `openaiApiKey` - User's OpenAI API key (client scope, encrypted in Foundry)
- `kankaApiToken` - World's Kanka API token (world scope)
- `kankaCampaignId` - Target Kanka campaign numeric ID (world scope)
- `transcriptionLanguage` - Language code for transcription (world scope)
- `transcriptionMode` - Mode: 'api' | 'local' | 'auto' (world scope)
- `whisperBackendUrl` - Local Whisper backend URL for offline transcription (world scope, default: http://localhost:8080)
- `imageQuality` - Image generation quality: 'low' | 'medium' | 'high' | 'auto' (world scope)
- `customVocabularyDictionary` - Campaign-specific terms for transcription accuracy (world scope, Object type)
- `speakerLabels` - Mapping of speaker IDs to player names (world scope, not shown in UI)

**Build Configuration:**
- `module.json` - Foundry VTT manifest with version, compatibility, entry points
- `package.json` - npm manifest with dev dependencies and test scripts
- `.prettierrc.json` - Prettier formatting rules
- `eslint.config.js` - ESLint configuration (ES2024 standards)
- `vitest.config.js` - Unit test configuration with jsdom environment
- `vitest.integration.config.js` - Integration test configuration

**Module Manifest (`module.json`):**
- Entry point: `scripts/main.mjs` (single ESM file, dynamic imports from there)
- Styles: `styles/vox-chronicle.css`
- Languages: 7 language files (en.json, it.json, de.json, es.json, fr.json, ja.json, pt.json)
- Compatibility: Foundry v13 (minimum and verified)

## Platform Requirements

**Development:**
- **Node.js** ≥18.0.0 (for running tests, linting, formatting)
- **npm** (or compatible package manager)
- **Bash** shell (for build.sh script, Windows uses build.bat)

**Production (Runtime):**
- **Web browser** with:
  - ES2024 JavaScript support (modern browsers: Chrome 90+, Firefox 88+, Safari 15+, Edge 90+)
  - MediaRecorder API (audio recording)
  - Fetch API with AbortController
  - FormData multipart upload support
  - WebRTC (optional, for Foundry audio capture)
- **Foundry VTT** v13 instance (self-hosted or Foundry Forge)
- **Internet connection** - Required for OpenAI and Kanka APIs

**API Access Required:**
- **OpenAI API** - For GPT-4o transcription, gpt-image-1 generation, embeddings
  - API Key from: https://platform.openai.com/api-keys
  - Rate limits: Variable based on plan
- **Kanka API** - For chronicle and entity publishing
  - API Token from: https://app.kanka.io/settings/api
  - Rate limits: 30 req/min (free), 90 req/min (premium)

**Optional:**
- **Local Whisper Backend** - whisper.cpp server at `whisperBackendUrl` for privacy-focused offline transcription
  - Default URL: http://localhost:8080
  - Only needed if using 'local' or 'auto' transcription mode

---

*Stack analysis: 2026-02-28*
