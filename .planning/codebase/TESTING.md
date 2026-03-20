# Testing Patterns

**Analysis Date:** 2026-03-19

## Test Framework

**Runner:**
- Vitest 2.x
- Unit config: `vitest.config.js`
- Integration config: `vitest.integration.config.js`

**Assertion Library:**
- Vitest built-in (`expect`)
- Matchers: `toBe`, `toEqual`, `toHaveBeenCalledWith`, `toThrow`, `resolves`, `rejects`

**Run Commands:**
```bash
npm test                   # Run all unit tests (excludes integration)
npm run test:watch         # Watch mode
npm run test:ui            # Vitest UI
npm run test:coverage      # Coverage report
npm run test:integration   # Run integration tests only
```

## Test File Organization

**Location:** Co-located mirror structure in `tests/` matching `scripts/`

**Naming:** `PascalCase.test.js` matching source filename (e.g., `AudioRecorder.test.js`)

**Structure:**
```
tests/
├── ai/
│   ├── providers/         # provider unit tests
│   ├── EntityExtractor.test.js
│   ├── OpenAIClient.test.js
│   └── ...
├── audio/
├── core/
├── helpers/
│   ├── setup.js           # Global beforeEach/afterEach Foundry mocks
│   └── foundry-mock.js    # Foundry VTT API stubs
├── fixtures/
│   └── audio-samples.js   # Shared test data
├── harness/
│   ├── foundry-mock.mjs   # Browser harness mock
│   └── index.html         # Browser test harness
├── integration/
│   └── session-workflow.test.js  # 54 cross-service integration tests
├── mocks/
│   ├── kanka-mock.js      # Kanka API mock factory
│   └── openai-mock.js     # OpenAI API mock factory
├── narrator/
├── orchestration/
├── rag/
├── ui/
└── utils/
```

## Test Structure

**Suite Organization:**
```javascript
import { MyClass, MY_CONSTANT } from '../../scripts/path/MyClass.mjs';

describe('MyClass', () => {
  let instance;

  beforeEach(() => {
    // set up per-test state
    instance = new MyClass(mockDependencies);
  });

  // ── 1. Constructor ─────────────────────────────────────────────────
  describe('constructor', () => {
    it('should create instance with defaults', () => { ... });
    it('should accept all constructor options', () => { ... });
  });

  // ── 2. Enum/Constant exports ───────────────────────────────────────
  describe('MY_CONSTANT', () => {
    it('should export MY_CONSTANT', () => {
      expect(MY_CONSTANT).toBe(expectedValue);
    });
  });

  // ── 3. Public methods ──────────────────────────────────────────────
  describe('methodName()', () => {
    it('should do the expected thing', async () => { ... });
    it('should throw on invalid input', async () => { ... });
  });
});
```

**Setup pattern:** Global Foundry mocks run in `tests/helpers/setup.js` via `setupFiles` vitest config. Individual tests do not repeat Foundry boilerplate.

## Mocking

**Framework:** Vitest `vi`

**Module-level mocks (for Foundry dependencies):**
```javascript
// In tests/helpers/setup.js — runs before every test file
globalThis.game = { settings: { get: vi.fn(), set: vi.fn(), register: vi.fn() }, ... };
globalThis.Hooks = createMockHooks();
globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
```

**Service mocks — inline factory pattern (preferred):**
```javascript
function createMockChatProvider(responseOverride = null) {
  return { chat: vi.fn().mockResolvedValue(responseOverride || defaultResponse) };
}

function createMockAudioRecorder(overrides = {}) {
  return {
    startRecording: vi.fn().mockResolvedValue(),
    stopRecording: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' })),
    cancel: vi.fn(),
    ...overrides
  };
}
```

**fetch mocking:**
```javascript
vi.spyOn(globalThis, 'fetch').mockResolvedValue({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({ data: [...] })
});
```

**Console suppression (common pattern):**
```javascript
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
```

**What to Mock:**
- External fetch calls (OpenAI, Kanka APIs)
- Foundry globals (`game`, `ui`, `Hooks`)
- Audio/MediaRecorder APIs
- File system / IndexedDB

**What NOT to Mock:**
- The class under test
- Pure utility functions (HtmlUtils, AudioUtils — test with real implementations)
- Internal business logic

## Fixtures and Factories

**Shared audio test data:** `tests/fixtures/audio-samples.js`

**Mock factories:** `tests/mocks/openai-mock.js`, `tests/mocks/kanka-mock.js`

**Test data pattern — inline per-test:**
```javascript
const mockBlob = new Blob(['audio-data'], { type: 'audio/webm' });
const mockTranscript = { text: 'Test text', segments: [{ speaker: 'SPEAKER_00', text: 'Hello' }] };
```

**Location:** Test helpers in `tests/helpers/`, shared mock factories in `tests/mocks/`

## Coverage

**Requirements (enforced):**
- Statements: 90%
- Branches: 85%
- Functions: 90%
- Lines: 90%

**Coverage excludes:**
- `scripts/data/**` (vocabulary data)
- `scripts/constants.mjs`
- `scripts/main.mjs`

**View Coverage:**
```bash
npm run test:coverage
# Output in coverage/ directory (HTML, JSON, text)
```

## Test Types

**Unit Tests (67 files, ~5035 tests):**
- One file per source module
- Tests exported API, constructor options, error paths, edge cases
- Run with: `npm test`

**Integration Tests (1 file, 54 tests):**
- `tests/integration/session-workflow.test.js`
- Tests cross-service wiring through `SessionOrchestrator`
- Verifies state transitions, call ordering, data flow
- Run with: `npm run test:integration`

**Browser Harness:**
- `tests/harness/index.html` — standalone browser test page for Foundry VTT live testing

## Common Patterns

**Async Testing:**
```javascript
it('should resolve on success', async () => {
  const result = await instance.doAsyncThing();
  expect(result).toEqual(expected);
});

it('should reject on failure', async () => {
  await expect(instance.doAsyncThing()).rejects.toThrow('expected message');
});
```

**Error Testing:**
```javascript
it('should throw OpenAIError on API failure', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 });
  await expect(client.request('/endpoint', {})).rejects.toThrow();
});
```

**State verification pattern:**
```javascript
it('should transition to RECORDING state', async () => {
  await orchestrator.startSession({ audioRecorder: mockRecorder });
  expect(orchestrator.state).toBe(SessionState.RECORDING);
});
```

**Integration test hoisted Foundry mock pattern:**
```javascript
vi.hoisted(() => {
  // Set up globalThis.foundry and globalThis.game BEFORE imports
  // Required because integration tests import modules that access game at module load time
  globalThis.foundry = { applications: { api: { ApplicationV2: class {...}, ... } } };
});
```

---

## Dead Code Audit

*Exports that exist in `scripts/` but are never imported outside their own file in production code (only in tests, or nowhere).*

### Truly Dead Exports (production code never imports)

**`scripts/utils/SpeakerUtils.mjs` — `getSpeakerLabel`**
- Exported at line 44: `export function getSpeakerLabel(speakerId)`
- `TranscriptionProcessor.mjs` imports `{ addKnownSpeakers, applyLabelsToSegments }` from this file — not `getSpeakerLabel`
- `getSpeakerLabel` is never imported anywhere in `scripts/`
- Note: `SpeakerLabeling.mjs` has its own static `getSpeakerLabel` method (separate, not from this file)
- Status: **dead export** — test coverage only (no test file exists for SpeakerUtils at all)

**`scripts/ai/ImageGenerationService.mjs` — `ImageModel`, `ImageSize`, `ImageQuality`, `EntityType`, `IMAGE_GENERATION_TIMEOUT_MS`, `IMAGE_URL_EXPIRY_MS`, `MAX_GALLERY_SIZE`**
- Exported at lines 901-910
- None of these constants/enums are imported in any other `scripts/` file
- `ImageGenerationService` class itself IS used (in `VoxChronicle.mjs`)
- All the accompanying enum exports are test-only
- Status: **test-only exports** — imported in `tests/ai/ImageGenerationService.test.js` only

**`scripts/ai/TranscriptionService.mjs` — `TranscriptionModel`, `TranscriptionResponseFormat`, `ChunkingStrategy`, `TRANSCRIPTION_TIMEOUT_MS`**
- Exported at lines 865-871
- `TranscriptionService` class is used (in `TranscriptionProcessor.mjs` and `TranscriptionFactory.mjs`)
- The enum exports are not imported in any other `scripts/` file
- Status: **test-only exports** — imported in `tests/ai/TranscriptionService.test.js` only

**`scripts/ai/WhisperBackend.mjs` — `WhisperError`, `WhisperErrorType`, `DEFAULT_WHISPER_URL`, `DEFAULT_TIMEOUT_MS`, `HEALTH_CHECK_TIMEOUT_MS`**
- `WhisperBackend` class is used (in `LocalWhisperService.mjs`)
- `WhisperError` and `WhisperErrorType` ARE imported in `LocalWhisperService.mjs` (line 12)
- `DEFAULT_WHISPER_URL`, `DEFAULT_TIMEOUT_MS`, `HEALTH_CHECK_TIMEOUT_MS` — NOT imported outside their file
- Status: `DEFAULT_WHISPER_URL`, `DEFAULT_TIMEOUT_MS`, `HEALTH_CHECK_TIMEOUT_MS` are **test-only exports**

**`scripts/ai/LocalWhisperService.mjs` — `LocalWhisperResponseFormat`, `LOCAL_TRANSCRIPTION_TIMEOUT_MS`**
- `LocalWhisperService` class is used (in `TranscriptionFactory.mjs`, `TranscriptionProcessor.mjs`)
- The enum and constant are not imported in any other `scripts/` file
- Status: **test-only exports**

**`scripts/narrator/SessionAnalytics.mjs` — `DEFAULT_BUCKET_SIZE`, `MAX_HISTORY_SIZE`**
- `SessionAnalytics` class is used (in `VoxChronicle.mjs`)
- Constants not imported outside the file in production code
- Status: **test-only exports**

**`scripts/narrator/SilenceDetector.mjs` — `DEFAULT_THRESHOLD_MS`, `MIN_THRESHOLD_MS`, `MAX_THRESHOLD_MS`**
- `SilenceDetector` class is used (in `VoxChronicle.mjs`)
- Constants not imported outside the file in production code
- Status: **test-only exports**

**`scripts/narrator/PromptBuilder.mjs` — `MAX_CONTEXT_TOKENS`**
- `PromptBuilder` class is used (in `AIAssistant.mjs`)
- `MAX_CONTEXT_TOKENS` imported in `tests/narrator/AIAssistant.test.js` and `tests/narrator/PromptBuilder.test.js`
- Not imported in any other production `scripts/` file
- Status: **test-only export**

**`scripts/narrator/AIAssistant.mjs` — `DEFAULT_MODEL`**
- `AIAssistant` class is used (in `VoxChronicle.mjs`)
- `DEFAULT_MODEL` not imported outside the file in production code
- Status: **test-only export**

**`scripts/orchestration/SessionOrchestrator.mjs` — `SessionState`, `DEFAULT_SESSION_OPTIONS`**
- `SessionOrchestrator` class is used (in `VoxChronicle.mjs`)
- `SessionState` is used in `tests/orchestration/SessionOrchestrator.test.js` and `tests/integration/session-workflow.test.js`
- `DEFAULT_SESSION_OPTIONS` used in test only
- Neither imported in any production `scripts/` file
- Status: **test-only exports**

**`scripts/orchestration/ImageProcessor.mjs` — `DEFAULT_IMAGE_OPTIONS`**
- `ImageProcessor` class is used (in `SessionOrchestrator.mjs`)
- `DEFAULT_IMAGE_OPTIONS` not imported in production code
- Status: **test-only export**

**`scripts/narrator/SceneDetector.mjs` — `SCENE_TYPES`**
- `SceneDetector` class is used (in `VoxChronicle.mjs`)
- `SCENE_TYPES` not imported in any other production `scripts/` file
- Status: **test-only export**

**`scripts/kanka/NarrativeExporter.mjs` — `ChronicleFormat`, `FormattingStyle`**
- `NarrativeExporter` class is used (in `VoxChronicle.mjs`)
- Enum exports not imported in any other production `scripts/` file
- Status: **test-only exports**

**`scripts/kanka/KankaService.mjs` — `CharacterType`, `LocationType`, `ItemType`, `OrganisationType`, `QuestType`**
- `KankaService` class is used (in `VoxChronicle.mjs`)
- `KankaEntityType` IS used in `VoxChronicle.mjs`? No — only `KankaService` is imported there.
- All KankaService enum exports are test-only (used in `tests/kanka/KankaService.test.js` only)
- Status: **test-only exports**

**`scripts/ui/EntityPreview.mjs` — `EntitySelectionState`, `PreviewMode`**
- `EntityPreview` class is used (in `MainPanel.mjs`)
- The enum exports are test-only
- Status: **test-only exports**

**`scripts/ui/RelationshipGraph.mjs` — `EntityType`, `GraphMode`**
- `RelationshipGraph` is used (in `EntityPreview.mjs`)
- Enum exports are test-only
- Status: **test-only exports**

**`scripts/ui/SpeakerLabeling.mjs` — `DEFAULT_SPEAKER_IDS`**
- `SpeakerLabeling` class is used (in `MainPanel.mjs`)
- `DEFAULT_SPEAKER_IDS` not imported in production code
- Status: **test-only export**

**`scripts/audio/AudioRecorder.mjs` — `RecordingState`**
- `AudioRecorder` is used (in `VoxChronicle.mjs`)
- `RecordingState` not imported in any production `scripts/` file
- Status: **test-only export**

**`scripts/audio/AudioChunker.mjs` — `MIN_CHUNK_SIZE`**
- `AudioChunker` and `MAX_CHUNK_SIZE` are used in production
- `MIN_CHUNK_SIZE` is test-only
- Status: **test-only export**

**`scripts/ai/OpenAIClient.mjs` — `OPENAI_BASE_URL`**
- `OpenAIClient`, `OpenAIError`, `OpenAIErrorType` are used in production
- `OPENAI_BASE_URL` is test-only
- Status: **test-only export**

**`scripts/kanka/KankaClient.mjs` — `KANKA_BASE_URL`**
- `KankaClient`, `KankaError`, `KankaErrorType` used in production
- `KANKA_BASE_URL` is test-only
- Status: **test-only export**

**`scripts/utils/RateLimiter.mjs` — `RateLimitPresets`**
- `RateLimiter` is used in production
- `RateLimitPresets` not imported in any production `scripts/` file
- Status: **test-only export**

**`scripts/utils/AudioUtils.mjs` — `SUPPORTED_MIME_TYPES`**
- `AudioUtils` class and `MAX_TRANSCRIPTION_SIZE` are used in production
- `SUPPORTED_MIME_TYPES` not imported outside `AudioUtils.mjs` in production
- Status: **test-only export**

**`scripts/ai/EntityExtractor.mjs` — `CharacterType`**
- `EntityExtractor`, `ExtractedEntityType`, `RelationshipType` are used in production
- `ENTITY_EXTRACTION_TIMEOUT_MS`, `DEFAULT_MAX_MOMENTS` are test-only
- `CharacterType` — not imported in any production file (only test file `EntityExtractor.test.js`)
- Status: `CharacterType`, `ENTITY_EXTRACTION_TIMEOUT_MS`, `DEFAULT_MAX_MOMENTS` are **test-only exports**

**`scripts/main.mjs` — `resolveHtmlElement`, `injectValidationButton`, `VALIDATION_RESET_DELAY_MS`**
- Explicitly exported "for testing" (comment at line 534)
- Never imported by any other production `scripts/` file
- Status: **intentionally test-only exports** (labeled as such in source)

---

## Unused Imports Audit

No significant unused imports detected via static analysis. All identified imports are consumed within each file. Notable observations:

- `scripts/ui/MainPanel.mjs` imports `{ stripHtml, sanitizeHtml, escapeHtml }` from `HtmlUtils` — all three are confirmed used in the file.
- `scripts/core/VoxChronicle.mjs` imports `{ AnthropicChatProvider }` and `{ GoogleChatProvider }` — check lines 37-41 (imports `OpenAIChatProvider`, `OpenAITranscriptionProvider`, `OpenAIImageProvider`, `OpenAIEmbeddingProvider`, `ProviderRegistry` but NOT Anthropic/Google providers directly). Those providers are registered via `ProviderRegistry` and resolved dynamically, so direct import may be absent — review if `AnthropicChatProvider` and `GoogleChatProvider` are wired from `VoxChronicle.mjs`.

**Potential unused import to verify:**
- `scripts/core/VoxChronicle.mjs` does NOT import `AnthropicChatProvider` or `GoogleChatProvider` directly (confirmed from grep). Those providers are standalone modules only instantiated when the user selects them, likely through `ProviderRegistry` dynamic resolution. The providers exist but may not be reachable in the default code path.

---

## Method Reachability Audit

### SessionOrchestrator (`scripts/orchestration/SessionOrchestrator.mjs`)

Public methods and their callers:

| Method | Called From (production) | Status |
|--------|--------------------------|--------|
| `startSession()` | `VoxChronicle.mjs` (via orchestrator) | LIVE |
| `stopSession()` | `MainPanel.mjs` | LIVE |
| `pauseRecording()` | `MainPanel.mjs` | LIVE |
| `resumeRecording()` | `MainPanel.mjs` | LIVE |
| `cancelSession()` | `MainPanel.mjs` | LIVE |
| `processTranscription()` | `MainPanel.mjs` | LIVE |
| `publishToKanka()` | `MainPanel.mjs` | LIVE |
| `setCallbacks()` | `VoxChronicle.mjs`, `MainPanel.mjs` | LIVE |
| `setServices()` | `VoxChronicle.mjs` | LIVE |
| `setTranscriptionConfig()` | `VoxChronicle.mjs` | LIVE |
| `setNarratorServices()` | `VoxChronicle.mjs` | LIVE |
| `setRAGProvider()` | `VoxChronicle.mjs` | LIVE |
| `startLiveMode()` | `MainPanel.mjs` | LIVE |
| `stopLiveMode()` | `MainPanel.mjs` | LIVE |
| `handleManualRulesQuery()` | `MainPanel.mjs` | LIVE |
| `appendSuggestion()` | `MainPanel.mjs` | LIVE |
| `generateImage()` | `MainPanel.mjs` | LIVE |
| `getOptions()` | Not found in production scripts | POTENTIALLY DEAD |
| `setOptions()` | Not found in production scripts | POTENTIALLY DEAD |
| `getServicesStatus()` | `MainPanel.mjs` (via `voxChronicle.getServicesStatus()`) | LIVE (on VoxChronicle) |
| `reset()` | `VoxChronicle.mjs` (via `sessionOrchestrator?.reset?.()`) | LIVE |

Note: `getServicesStatus()` is on `VoxChronicle`, not `SessionOrchestrator` — confirmed via grep.

### MainPanel (`scripts/ui/MainPanel.mjs`)

Key public methods:

| Method | Called From | Status |
|--------|-------------|--------|
| `getInstance()` | `VoxChronicle.mjs`, `main.mjs` | LIVE |
| `resetInstance()` | Tests only | TEST-ONLY |
| `setEventBus()` | `VoxChronicle.mjs` | LIVE |
| `setTranscriptData()` | `VoxChronicle.mjs` or orchestrator callbacks | LIVE |
| `getTranscriptData()` | Internal | LIVE |
| `editSegment()` | Action handler in panel | LIVE |
| `switchTab()` | `_onRender` action handlers | LIVE |
| `requestRender()` | Internal | LIVE |

### VoxChronicle (`scripts/core/VoxChronicle.mjs`)

Key public methods:

| Method | Called From | Status |
|--------|-------------|--------|
| `getInstance()` | `main.mjs`, UI files | LIVE |
| `resetInstance()` | Tests only | TEST-ONLY |
| `initialize()` | `main.mjs` (`Hooks.once('ready')`) | LIVE |
| `reinitialize()` | Internal settings hook | LIVE |
| `getServicesStatus()` | `MainPanel.mjs` | LIVE |

### AIAssistant (`scripts/narrator/AIAssistant.mjs`)

Key public methods (partial, large class):

| Method | Called From | Status |
|--------|-------------|--------|
| `getSuggestion()` | `SessionOrchestrator.mjs` (live mode cycle) | LIVE |
| `isConfigured()` | `SessionOrchestrator.mjs` | LIVE |
| `setRAGProvider()` | `VoxChronicle.mjs` | LIVE |
| `setModel()` | Settings update flow | LIVE |
| `destroy()` | `VoxChronicle.reinitialize()` | LIVE |
| `setSilenceDetector()` | `VoxChronicle.mjs` | LIVE |

---

## Test Coverage Gaps

### Scripts with NO corresponding test file

| Script | Notes |
|--------|-------|
| `scripts/constants.mjs` | Excluded from coverage config; trivial single export |
| `scripts/data/dnd-vocabulary.mjs` | Excluded from coverage config; static data |
| `scripts/utils/SpeakerUtils.mjs` | **Not excluded from coverage config** — missing test file is a coverage gap |

### Empty test directories

- `tests/services/` — directory with only `.gitkeep`, no tests
- `tests/static-analysis/` — directory with only `.gitkeep`, no tests

### Potentially orphaned test sections

No orphaned test files found — every test file in `tests/` maps to an existing source file in `scripts/`. The test structure mirrors the source structure exactly.

### Notable coverage considerations

- `AnthropicChatProvider` and `GoogleChatProvider` are provider implementations wired through `ProviderRegistry` but their activation path from production entry points is not obvious — confirm they are reachable via the provider registry at runtime.
- `scripts/narrator/RulesLookupService.mjs` — has a test file (`tests/narrator/RulesLookupService.test.js`) and is imported by `VoxChronicle.mjs`.
- Integration tests cover `SessionOrchestrator` cross-service wiring but not individual service interactions for narrator services (`AIAssistant`, `SceneDetector`, etc.).

---

*Testing analysis: 2026-03-19*
