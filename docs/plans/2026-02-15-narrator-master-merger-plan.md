# Narrator Master → VoxChronicle Merger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge Narrator Master (real-time DM assistant) into VoxChronicle (session chronicle publisher) as a unified Foundry VTT module v2.0.0.

**Architecture:** Big-bang restructure. VoxChronicle is the base. Narrator Master services are ported in, duplicated services are merged using "best of both" strategy. A unified MainPanel replaces separate UIs. All 7 localizations maintained.

**Tech Stack:** JavaScript ES6+ modules (.mjs), Foundry VTT v12-v13, Handlebars, CSS, Vitest, OpenAI API (gpt-4o-transcribe-diarize, gpt-4o-mini, gpt-image-1), Kanka API.

**Design doc:** `docs/plans/2026-02-15-narrator-master-merger-design.md`

**Source files:**
- VoxChronicle: `/home/aiacos/workspace/FoundryVTT/VoxChronicle/`
- Narrator Master: `/home/aiacos/workspace/FoundryVTT/narrator_master/`

---

## Phase 1: Infrastructure & Utilities

### Task 1: Port CacheManager from Narrator Master

**Files:**
- Source: `narrator_master/scripts/cache-manager.js`
- Create: `VoxChronicle/scripts/utils/CacheManager.mjs`
- Test: `VoxChronicle/tests/utils/CacheManager.test.mjs`

**Step 1: Write the test**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheManager } from '../../scripts/utils/CacheManager.mjs';

describe('CacheManager', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager({ maxSize: 5, defaultTTL: 1000 });
  });

  it('stores and retrieves values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns null for expired entries', async () => {
    cache = new CacheManager({ maxSize: 5, defaultTTL: 50 });
    cache.set('key1', 'value1');
    await new Promise(r => setTimeout(r, 60));
    expect(cache.get('key1')).toBeNull();
  });

  it('evicts LRU entries when maxSize exceeded', () => {
    for (let i = 0; i < 6; i++) cache.set(`key${i}`, `val${i}`);
    expect(cache.get('key0')).toBeNull();
    expect(cache.get('key5')).toBe('val5');
  });

  it('generates consistent cache keys', () => {
    const key1 = CacheManager.generateKey('prefix', { a: 1, b: 2 });
    const key2 = CacheManager.generateKey('prefix', { b: 2, a: 1 });
    expect(key1).toBe(key2);
  });

  it('clears all entries', () => {
    cache.set('key1', 'value1');
    cache.clear();
    expect(cache.get('key1')).toBeNull();
    expect(cache.size).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/aiacos/workspace/FoundryVTT/VoxChronicle && npx vitest run tests/utils/CacheManager.test.mjs`
Expected: FAIL - module not found

**Step 3: Port and adapt the implementation**

Port `narrator_master/scripts/cache-manager.js` → `VoxChronicle/scripts/utils/CacheManager.mjs`:
- Convert to ES module syntax (import/export)
- Replace `MODULE_ID` import with `import { MODULE_ID } from '../constants.mjs'`
- Replace `Logger` import with `import { Logger } from './Logger.mjs'`
- Keep all existing functionality: TTL, LRU eviction, blob-to-base64, generateKey

**Step 4: Run test to verify it passes**

Run: `cd /home/aiacos/workspace/FoundryVTT/VoxChronicle && npx vitest run tests/utils/CacheManager.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/utils/CacheManager.mjs tests/utils/CacheManager.test.mjs
git commit -m "feat: port CacheManager from Narrator Master"
```

---

### Task 2: Port DomUtils from Narrator Master

**Files:**
- Source: `narrator_master/scripts/dom-utils.js`
- Create: `VoxChronicle/scripts/utils/DomUtils.mjs`
- Test: `VoxChronicle/tests/utils/DomUtils.test.mjs`

**Step 1: Write the test**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { debounce, throttle } from '../../scripts/utils/DomUtils.mjs';

describe('DomUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('debounce', () => {
    it('delays execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced();
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('cancels pending execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced();
      debounced.cancel();
      vi.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('throttle', () => {
    it('executes immediately then throttles', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      throttled();
      throttled();
      expect(fn).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/aiacos/workspace/FoundryVTT/VoxChronicle && npx vitest run tests/utils/DomUtils.test.mjs`

**Step 3: Port the implementation**

Port `narrator_master/scripts/dom-utils.js` → `VoxChronicle/scripts/utils/DomUtils.mjs`:
- Convert to ES module exports
- Keep debounce (with `.cancel()`) and throttle functions

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git add scripts/utils/DomUtils.mjs tests/utils/DomUtils.test.mjs
git commit -m "feat: port DomUtils (debounce/throttle) from Narrator Master"
```

---

### Task 3: Port ErrorNotificationHelper from Narrator Master

**Files:**
- Source: `narrator_master/scripts/error-notification-helper.js`
- Create: `VoxChronicle/scripts/utils/ErrorNotificationHelper.mjs`
- Test: `VoxChronicle/tests/utils/ErrorNotificationHelper.test.mjs`

**Step 1: Write the test**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Foundry
globalThis.ui = { notifications: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } };
globalThis.game = { i18n: { localize: vi.fn(k => k), format: vi.fn((k, d) => k) } };

import { ErrorNotificationHelper } from '../../scripts/utils/ErrorNotificationHelper.mjs';

describe('ErrorNotificationHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ErrorNotificationHelper._resetCooldowns();
  });

  it('shows error notification', () => {
    ErrorNotificationHelper.error('Test error');
    expect(ui.notifications.error).toHaveBeenCalledWith('Test error');
  });

  it('deduplicates within cooldown', () => {
    ErrorNotificationHelper.error('Same error');
    ErrorNotificationHelper.error('Same error');
    expect(ui.notifications.error).toHaveBeenCalledOnce();
  });

  it('handles API errors with localized messages', () => {
    ErrorNotificationHelper.apiError({ status: 429 });
    expect(ui.notifications.error).toHaveBeenCalled();
  });
});
```

**Step 2-5:** Same TDD cycle. Port from NM, adapt imports to VC conventions.

```bash
git commit -m "feat: port ErrorNotificationHelper from Narrator Master"
```

---

### Task 4: Merge Logger with debug mode toggle

**Files:**
- Modify: `VoxChronicle/scripts/utils/Logger.mjs`
- Modify: `VoxChronicle/tests/utils/Logger.test.mjs`

**What to merge:**
The VC Logger already has child loggers and module prefixing. From NM, add:
- `debugMode` static flag that can be toggled via Foundry settings
- When `debugMode` is false, `debug()` calls are no-ops
- A static `setDebugMode(enabled)` method

**Step 1: Write test for new behavior**

```javascript
// Add to existing Logger tests
describe('debug mode', () => {
  it('suppresses debug when debugMode is off', () => {
    Logger.setDebugMode(false);
    const spy = vi.spyOn(console, 'debug');
    Logger.debug('test');
    expect(spy).not.toHaveBeenCalled();
  });

  it('allows debug when debugMode is on', () => {
    Logger.setDebugMode(true);
    const spy = vi.spyOn(console, 'debug');
    Logger.debug('test');
    expect(spy).toHaveBeenCalled();
  });
});
```

**Step 2-5:** TDD cycle. Add `_debugMode` static field and `setDebugMode()` method.

```bash
git commit -m "feat: add debug mode toggle to Logger (from Narrator Master)"
```

---

### Task 5: Port dnd-terms.mjs data file

**Files:**
- Source: `narrator_master/scripts/dnd-terms.js`
- Create: `VoxChronicle/scripts/data/dnd-terms.mjs`

**Step 1:** No test needed - this is pure data (285 D&D terms in categories).

**Step 2:** Copy and convert to ES module:
- `narrator_master/scripts/dnd-terms.js` → `VoxChronicle/scripts/data/dnd-terms.mjs`
- Change export syntax to ES module

**Step 3: Commit**

```bash
git add scripts/data/dnd-terms.mjs
git commit -m "feat: port D&D 5e terms dictionary from Narrator Master"
```

---

## Phase 2: Core Service Merges

### Task 6: Merge OpenAIClient (NM retry/queue + VC rate limiter)

**Files:**
- Modify: `VoxChronicle/scripts/ai/OpenAIClient.mjs`
- Modify: `VoxChronicle/tests/ai/OpenAIClient.test.mjs`

**What to merge:**

The current VC `OpenAIClient` has:
- Bearer auth, error handling, rate limiting via `RateLimiter`
- `OpenAIError` class with `isRetryable`
- `_makeRequest()` method

From NM `OpenAIServiceBase`, add:
- `_retryWithBackoff(operation, context)` — exponential backoff with jitter
- `_shouldRetry(error)` — retry logic (429, 5xx = yes; 4xx = no)
- `_parseRetryAfter(response)` — parse Retry-After header
- `_enqueueRequest(operation, context, priority)` — sequential request queue
- `_processQueue()` — queue processor
- `_fetchWithTimeout(url, options, timeoutMs)` — AbortController timeout
- `_requestQueue`, `_isProcessingQueue`, `_maxQueueSize` fields
- `_retryConfig` configuration object
- `getQueueSize()`, `clearQueue()` methods
- `_history`, `_addToHistory()`, `getHistory()`, `clearHistory()` — operation tracking

Keep from VC:
- `OpenAIError` custom class
- `RateLimiter` integration (for other clients like Kanka)
- FormData support
- `SensitiveDataFilter` integration

**Step 1: Write tests for new retry/queue behavior**

```javascript
describe('retry with backoff', () => {
  it('retries on 429 with exponential delay', async () => {
    let attempts = 0;
    const client = new OpenAIClient('test-key', { retryMaxAttempts: 3, retryBaseDelay: 10 });
    // Mock fetch to fail twice with 429 then succeed
    global.fetch = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    // Test that it succeeds after retries
  });

  it('does not retry on 401', async () => {
    // ...
  });
});

describe('request queue', () => {
  it('processes requests sequentially', async () => {
    // ...
  });

  it('rejects when queue is full', async () => {
    // ...
  });
});
```

**Step 2-5:** TDD cycle. Merge the retry/queue methods into `OpenAIClient`.

The merged class should:
1. Keep VC's constructor signature + `RateLimiter` integration
2. Add NM's `_retryConfig` from constructor options
3. Add NM's `_requestQueue`, `_isProcessingQueue`, `_maxQueueSize`
4. Add all NM methods: `_retryWithBackoff`, `_shouldRetry`, `_parseRetryAfter`, `_enqueueRequest`, `_processQueue`, `_fetchWithTimeout`
5. Modify `_makeRequest()` to use `_enqueueRequest` + `_retryWithBackoff` internally
6. Keep `OpenAIError` and existing error handling
7. Add `_history` tracking

**IMPORTANT:** All existing services that extend/use `OpenAIClient` (TranscriptionService, ImageGenerationService, EntityExtractor) must still work. Run ALL existing tests after this change.

```bash
git commit -m "feat: merge NM retry/queue/backoff into OpenAIClient"
```

---

### Task 7: Merge AudioRecorder (NM level metering + VC sources)

**Files:**
- Modify: `VoxChronicle/scripts/audio/AudioRecorder.mjs`
- Modify: `VoxChronicle/tests/audio/AudioRecorder.test.mjs`

**What to merge:**

VC `AudioRecorder` has:
- MICROPHONE, FOUNDRY_WEBRTC, SYSTEM_AUDIO sources
- Echo cancellation, noise suppression settings
- Duration tracking, pause/resume
- `checkMicrophonePermission()`, `getAudioInputDevices()`

From NM `AudioCapture`, add:
- **Audio level metering** via `AnalyserNode` and FFT
  - `_audioContext`, `_analyserNode`, `_sourceNode` fields
  - `_setupAudioAnalysis(stream)` method
  - `_startLevelMonitoring()` / `_stopLevelMonitoring()` methods
  - `getAudioLevel()` returns 0.0-1.0
  - `onLevelChange` callback
- **Silence detection** (configurable threshold, default 0.01)
  - `_silenceThreshold`, `_isSilent` fields
  - Detection integrated into level monitoring
  - `onSilenceDetected` / `onSoundDetected` callbacks
- **Auto-stop at max duration** (5 minutes default, configurable)
  - `_maxDuration` field
  - Auto-stop timer in `startRecording()`
- **Event-based architecture** (STATE_CHANGE, DATA_AVAILABLE, ERROR events)

Keep from VC:
- All 3 capture sources (MICROPHONE, FOUNDRY_WEBRTC, SYSTEM_AUDIO)
- `_getSupportedMimeType()` MIME type detection
- Echo cancellation / noise suppression per-source constraints
- Foundry WebRTC auto-fallback
- `cancel()` method

**Step 1: Write tests for new features**

```javascript
describe('audio level metering', () => {
  it('reports audio level between 0 and 1', () => { /* ... */ });
  it('detects silence below threshold', () => { /* ... */ });
});

describe('auto-stop', () => {
  it('stops recording after maxDuration', () => { /* ... */ });
});
```

**Step 2-5:** TDD cycle.

```bash
git commit -m "feat: merge NM audio level metering and silence detection into AudioRecorder"
```

---

### Task 8: Add multi-language mode to TranscriptionService

**Files:**
- Modify: `VoxChronicle/scripts/ai/TranscriptionService.mjs`
- Modify: `VoxChronicle/tests/ai/TranscriptionService.test.mjs`

**What to merge from NM `TranscriptionService`:**
- `_multiLanguageMode` flag
- When enabled, segments include language tags: `"Speaker (en): text"`
- Per-segment language detection from API response
- Circuit breaker: stop after 5 consecutive errors (`_consecutiveErrors`, `_maxConsecutiveErrors`)
- `_isCircuitOpen()` check before transcription

Keep from VC:
- `TranscriptionFactory` (API/Local/Auto modes)
- `AudioChunker` integration for >25MB
- `VocabularyDictionary` integration
- Speaker diarization mapping
- Cost estimation

**Step 1: Write tests**

```javascript
describe('multi-language mode', () => {
  it('adds language tags to segments when enabled', async () => { /* ... */ });
  it('works normally when disabled', async () => { /* ... */ });
});

describe('circuit breaker', () => {
  it('opens after 5 consecutive errors', async () => { /* ... */ });
  it('resets on success', async () => { /* ... */ });
});
```

**Step 2-5:** TDD cycle.

```bash
git commit -m "feat: add multi-language mode and circuit breaker to TranscriptionService"
```

---

### Task 9: Update ImageGenerationService to gpt-image-1

**Files:**
- Modify: `VoxChronicle/scripts/ai/ImageGenerationService.mjs`
- Modify: `VoxChronicle/tests/ai/ImageGenerationService.test.mjs`

**Changes:**
1. Replace `dall-e-3` model with `gpt-image-1`
2. Update supported sizes: add 256x256, 512x512, 1536x1024, 1024x1536
3. Add base64 auto-caching from NM (using `CacheManager`)
4. Add persistent gallery support (`imageGallery` setting)
5. Update prompt templates for character portraits, location scenes, item illustrations (keep VC's entity-specific templates but enhance with NM's RPG infographic style)
6. Update cost estimates for gpt-image-1 pricing
7. Remove `style` parameter (not supported by gpt-image-1)

**Step 1: Update tests**

```javascript
describe('ImageGenerationService', () => {
  it('uses gpt-image-1 model', async () => {
    // Verify fetch call uses gpt-image-1
  });

  it('caches generated images as base64', async () => {
    // Verify CacheManager usage
  });

  it('persists gallery to settings', async () => {
    // Verify imageGallery setting
  });
});
```

**Step 2-5:** TDD cycle.

```bash
git commit -m "feat: update ImageGenerationService to gpt-image-1 with caching"
```

---

### Task 10: Merge SpeakerLabeling (add inline rename from NM)

**Files:**
- Modify: `VoxChronicle/scripts/ui/SpeakerLabeling.mjs`
- Modify: `VoxChronicle/tests/ui/SpeakerLabeling.test.mjs`

**What to merge from NM `SpeakerLabelService`:**
- `renameSpeaker(oldName, newName)` — retroactive rename in transcript
- `applyLabelsToSegments(segments)` — apply stored labels to transcript segments
- Inline rename support: click on speaker name in transcript to rename

Keep from VC:
- Auto-detect from Foundry users
- Known speakers tracking
- FormApplication UI with dropdown
- Settings persistence

**Step 1-5:** TDD cycle.

```bash
git commit -m "feat: add inline rename and retroactive label apply to SpeakerLabeling"
```

---

## Phase 3: New Narrator Services

### Task 11: Port JournalParser

**Files:**
- Source: `narrator_master/scripts/journal-parser.js`
- Create: `VoxChronicle/scripts/narrator/JournalParser.mjs`
- Test: `VoxChronicle/tests/narrator/JournalParser.test.mjs`

**Step 1: Write comprehensive tests**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Foundry game.journal
globalThis.game = {
  journal: {
    contents: [
      {
        id: 'j1', name: 'Adventure',
        pages: { contents: [
          { id: 'p1', name: 'Chapter 1', type: 'text',
            text: { content: '<h1>The Beginning</h1><p>Our heroes gather...</p>' } }
        ]}
      }
    ]
  },
  i18n: { localize: vi.fn(k => k), format: vi.fn((k,d) => k) }
};

import { JournalParser } from '../../scripts/narrator/JournalParser.mjs';

describe('JournalParser', () => {
  let parser;
  beforeEach(() => { parser = new JournalParser(); });

  it('parses journal entries and extracts text', () => {
    const result = parser.parseAll();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Adventure');
  });

  it('strips HTML from content', () => {
    const result = parser.parseAll();
    expect(result[0].pages[0].text).not.toContain('<h1>');
    expect(result[0].pages[0].text).toContain('The Beginning');
  });

  it('builds keyword index with bounded size', () => {
    parser.parseAll();
    expect(parser.getKeywordCount()).toBeGreaterThan(0);
    expect(parser.getKeywordCount()).toBeLessThanOrEqual(5000);
  });

  it('searches by keyword', () => {
    parser.parseAll();
    const results = parser.search('heroes');
    expect(results.length).toBeGreaterThan(0);
  });

  it('extracts chapter hierarchy', () => {
    const chapters = parser.extractChapters('j1');
    expect(chapters).toBeDefined();
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Port implementation**

Port `narrator_master/scripts/journal-parser.js` → `VoxChronicle/scripts/narrator/JournalParser.mjs`:
- Convert to ES module
- Replace `import { MODULE_ID } from './settings.js'` → `import { MODULE_ID } from '../constants.mjs'`
- Replace `import { Logger } from './logger.js'` → `import { Logger } from '../utils/Logger.mjs'`
- Keep all functionality: HTML stripping, chapter extraction, keyword index (5000 LRU), NPC profile extraction, proper noun extraction, content formatting

**Step 4-5:** Run tests, commit.

```bash
git commit -m "feat: port JournalParser from Narrator Master"
```

---

### Task 12: Port CompendiumParser

**Files:**
- Source: `narrator_master/scripts/compendium-parser.js`
- Create: `VoxChronicle/scripts/narrator/CompendiumParser.mjs`
- Test: `VoxChronicle/tests/narrator/CompendiumParser.test.mjs`

**Step 1-5:** Same TDD cycle as Task 11. Port, convert imports, test.

Key functionality to preserve:
- Parse journal/rules compendia
- Keyword index with bounded size
- Search with relevance scoring
- Content extraction from JournalEntry, Item, RollTable, Actor
- Content formatting with source citations

```bash
git commit -m "feat: port CompendiumParser from Narrator Master"
```

---

### Task 13: Port ChapterTracker

**Files:**
- Source: `narrator_master/scripts/chapter-tracker.js`
- Create: `VoxChronicle/scripts/narrator/ChapterTracker.mjs`
- Test: `VoxChronicle/tests/narrator/ChapterTracker.test.mjs`

**Step 1: Write tests**

```javascript
describe('ChapterTracker', () => {
  it('detects current chapter from active scene', () => { /* ... */ });
  it('maintains chapter history with navigation', () => { /* ... */ });
  it('provides chapter content for AI context', () => { /* ... */ });
  it('builds chapter hierarchy path', () => { /* ... */ });
});
```

**Step 2-5:** TDD cycle. Port from NM, adapt imports.

Dependencies: JournalParser (from Task 11). Import as `import { JournalParser } from './JournalParser.mjs'`.

```bash
git commit -m "feat: port ChapterTracker from Narrator Master"
```

---

### Task 14: Port SceneDetector

**Files:**
- Source: `narrator_master/scripts/scene-detector.js`
- Create: `VoxChronicle/scripts/narrator/SceneDetector.mjs`
- Test: `VoxChronicle/tests/narrator/SceneDetector.test.mjs`

**Step 1: Write tests**

```javascript
describe('SceneDetector', () => {
  it('detects combat scenes from keywords', () => { /* ... */ });
  it('detects social scenes', () => { /* ... */ });
  it('classifies scene types correctly', () => { /* ... */ });
  it('tracks scene history', () => { /* ... */ });
  it('supports Italian language patterns', () => { /* ... */ });
});
```

**Step 2-5:** TDD cycle. Pure logic, no external dependencies except Logger.

```bash
git commit -m "feat: port SceneDetector from Narrator Master"
```

---

### Task 15: Port AIAssistant

**Files:**
- Source: `narrator_master/scripts/ai-assistant.js`
- Create: `VoxChronicle/scripts/ai/AIAssistant.mjs`
- Test: `VoxChronicle/tests/ai/AIAssistant.test.mjs`

**Step 1: Write tests**

```javascript
describe('AIAssistant', () => {
  it('generates contextual suggestions', async () => { /* ... */ });
  it('detects off-track players', async () => { /* ... */ });
  it('generates narrative bridges', async () => { /* ... */ });
  it('generates NPC dialogue', async () => { /* ... */ });
  it('validates API responses', () => { /* ... */ });
  it('respects off-track sensitivity levels', () => { /* ... */ });
  it('detects rules questions', () => { /* ... */ });
});
```

**Step 2-5:** TDD cycle.

Port from NM, key adaptations:
- Extend from merged `OpenAIClient` instead of `OpenAIServiceBase`
- Use `this._enqueueRequest()` for API calls (from merged OpenAIClient)
- Import Logger from VC utils
- Keep all functionality: suggestions, off-track, narrative bridge, NPC dialogue, rules detection, multi-language, response validation

```bash
git commit -m "feat: port AIAssistant from Narrator Master"
```

---

### Task 16: Port RulesReference

**Files:**
- Source: `narrator_master/scripts/rules-reference.js`
- Create: `VoxChronicle/scripts/ai/RulesReference.mjs`
- Test: `VoxChronicle/tests/ai/RulesReference.test.mjs`

**Step 1: Write tests**

```javascript
describe('RulesReference', () => {
  it('detects rules questions from transcript', () => { /* ... */ });
  it('identifies question types (mechanic, spell, condition)', () => { /* ... */ });
  it('extracts topics from questions', () => { /* ... */ });
  it('searches compendiums for answers', async () => { /* ... */ });
  it('formats citations with source references', () => { /* ... */ });
  it('supports English and Italian patterns', () => { /* ... */ });
});
```

**Step 2-5:** TDD cycle.

Dependencies: CompendiumParser (from Task 12).

```bash
git commit -m "feat: port RulesReference from Narrator Master"
```

---

### Task 17: Port SessionAnalytics

**Files:**
- Source: `narrator_master/scripts/session-analytics.js`
- Create: `VoxChronicle/scripts/narrator/SessionAnalytics.mjs`
- Test: `VoxChronicle/tests/narrator/SessionAnalytics.test.mjs`

**Step 1: Write tests**

```javascript
describe('SessionAnalytics', () => {
  it('tracks speaker engagement metrics', () => { /* ... */ });
  it('calculates speaker participation percentages', () => { /* ... */ });
  it('builds session timeline with buckets', () => { /* ... */ });
  it('maintains session history', () => { /* ... */ });
  it('records session metadata', () => { /* ... */ });
});
```

**Step 2-5:** TDD cycle. Replace NM SettingsManager usage with VC Settings pattern.

```bash
git commit -m "feat: port SessionAnalytics from Narrator Master"
```

---

## Phase 4: Settings & Core Integration

### Task 18: Unify Settings.mjs

**Files:**
- Modify: `VoxChronicle/scripts/core/Settings.mjs`
- Modify: `VoxChronicle/tests/core/Settings.test.mjs`

**Step 1: Write tests for new settings**

```javascript
describe('Narrator Master settings', () => {
  it('registers multiLanguageMode', () => { /* ... */ });
  it('registers transcriptionBatchDuration with range', () => { /* ... */ });
  it('registers offTrackSensitivity with choices', () => { /* ... */ });
  it('registers rulesDetection', () => { /* ... */ });
  it('registers debugMode', () => { /* ... */ });
  it('registers apiRetry settings', () => { /* ... */ });
  it('registers imageGallery as hidden', () => { /* ... */ });
  it('registers panelPosition as client', () => { /* ... */ });
});
```

**Step 2-5:** Add all new NM settings to `registerSettings()`:

```javascript
// --- Narrator Master Settings ---

game.settings.register(MODULE_ID, 'multiLanguageMode', {
  name: 'VOXCHRONICLE.Settings.MultiLanguageMode',
  hint: 'VOXCHRONICLE.Settings.MultiLanguageModeHint',
  scope: 'world', config: true, type: Boolean, default: false
});

game.settings.register(MODULE_ID, 'transcriptionBatchDuration', {
  name: 'VOXCHRONICLE.Settings.TranscriptionBatchDuration',
  hint: 'VOXCHRONICLE.Settings.TranscriptionBatchDurationHint',
  scope: 'world', config: true, type: Number,
  range: { min: 5000, max: 30000, step: 1000 }, default: 10000
});

game.settings.register(MODULE_ID, 'offTrackSensitivity', {
  name: 'VOXCHRONICLE.Settings.OffTrackSensitivity',
  hint: 'VOXCHRONICLE.Settings.OffTrackSensitivityHint',
  scope: 'world', config: true, type: String, default: 'medium',
  choices: {
    low: 'VOXCHRONICLE.Settings.SensitivityLow',
    medium: 'VOXCHRONICLE.Settings.SensitivityMedium',
    high: 'VOXCHRONICLE.Settings.SensitivityHigh'
  }
});

game.settings.register(MODULE_ID, 'rulesDetection', {
  name: 'VOXCHRONICLE.Settings.RulesDetection',
  hint: 'VOXCHRONICLE.Settings.RulesDetectionHint',
  scope: 'world', config: true, type: Boolean, default: true
});

game.settings.register(MODULE_ID, 'rulesSource', {
  name: 'VOXCHRONICLE.Settings.RulesSource',
  hint: 'VOXCHRONICLE.Settings.RulesSourceHint',
  scope: 'world', config: true, type: String, default: 'auto',
  choices: { auto: 'VOXCHRONICLE.Settings.RulesSourceAuto', dnd5e: 'VOXCHRONICLE.Settings.RulesSourceDnD5e' }
});

game.settings.register(MODULE_ID, 'debugMode', {
  name: 'VOXCHRONICLE.Settings.DebugMode',
  hint: 'VOXCHRONICLE.Settings.DebugModeHint',
  scope: 'world', config: true, type: Boolean, default: false,
  onChange: (value) => Logger.setDebugMode(value)
});

game.settings.register(MODULE_ID, 'apiRetryEnabled', {
  name: 'VOXCHRONICLE.Settings.ApiRetryEnabled',
  hint: 'VOXCHRONICLE.Settings.ApiRetryEnabledHint',
  scope: 'world', config: true, type: Boolean, default: true
});

game.settings.register(MODULE_ID, 'apiRetryMaxAttempts', {
  name: 'VOXCHRONICLE.Settings.ApiRetryMaxAttempts',
  hint: 'VOXCHRONICLE.Settings.ApiRetryMaxAttemptsHint',
  scope: 'world', config: true, type: Number,
  range: { min: 0, max: 10, step: 1 }, default: 3
});

game.settings.register(MODULE_ID, 'apiRetryBaseDelay', {
  name: 'VOXCHRONICLE.Settings.ApiRetryBaseDelay',
  hint: 'VOXCHRONICLE.Settings.ApiRetryBaseDelayHint',
  scope: 'world', config: true, type: Number,
  range: { min: 500, max: 10000, step: 500 }, default: 1000
});

game.settings.register(MODULE_ID, 'apiRetryMaxDelay', {
  name: 'VOXCHRONICLE.Settings.ApiRetryMaxDelay',
  hint: 'VOXCHRONICLE.Settings.ApiRetryMaxDelayHint',
  scope: 'world', config: true, type: Number,
  range: { min: 5000, max: 120000, step: 5000 }, default: 60000
});

game.settings.register(MODULE_ID, 'apiQueueMaxSize', {
  name: 'VOXCHRONICLE.Settings.ApiQueueMaxSize',
  hint: 'VOXCHRONICLE.Settings.ApiQueueMaxSizeHint',
  scope: 'world', config: true, type: Number,
  range: { min: 5, max: 100, step: 5 }, default: 100
});

game.settings.register(MODULE_ID, 'imageGallery', {
  scope: 'world', config: false, type: Object, default: {}
});

game.settings.register(MODULE_ID, 'panelPosition', {
  scope: 'client', config: false, type: Object, default: {}
});
```

Also add static helper methods:
- `getNarratorSettings()` — returns all NM-related settings as object
- `getRetrySettings()` — returns retry config
- `isNarratorConfigured()` — checks if live features have required settings

```bash
git commit -m "feat: unify Settings with Narrator Master settings"
```

---

### Task 19: Expand VoxChronicle.mjs singleton

**Files:**
- Modify: `VoxChronicle/scripts/core/VoxChronicle.mjs`
- Modify: `VoxChronicle/tests/core/VoxChronicle.test.mjs`

**What to add:**

The singleton needs to initialize new NM services:
- `JournalParser`
- `CompendiumParser`
- `ChapterTracker`
- `SceneDetector`
- `AIAssistant` (requires OpenAI key)
- `RulesReference` (requires compendium access)
- `SessionAnalytics`

In `initialize()`:
1. Create `JournalParser` and `CompendiumParser` (always)
2. Create `ChapterTracker` with JournalParser (always)
3. Create `SceneDetector` (always)
4. Create `SessionAnalytics` (always)
5. Create `AIAssistant` if OpenAI configured (requires OpenAIClient + JournalParser context)
6. Create `RulesReference` if rulesDetection enabled (requires CompendiumParser)
7. Pass all to `SessionOrchestrator`

Add `getServicesStatus()` entries for new services.

Connect `debugMode` setting to `Logger.setDebugMode()`.

**Step 1-5:** TDD cycle.

```bash
git commit -m "feat: expand VoxChronicle singleton with Narrator Master services"
```

---

### Task 20: Expand SessionOrchestrator for live mode

**Files:**
- Modify: `VoxChronicle/scripts/orchestration/SessionOrchestrator.mjs`
- Modify: `VoxChronicle/tests/orchestration/SessionOrchestrator.test.mjs`

**What to add:**

The orchestrator currently manages: record → transcribe → extract → publish (post-session).

Add live mode (from NM's NarratorMaster controller):
- **Live transcription cycle**: periodic audio capture (every `transcriptionBatchDuration` ms), transcribe, feed to AIAssistant
- **States**: Add `LIVE_LISTENING`, `LIVE_TRANSCRIBING`, `LIVE_ANALYZING` states
- **Silence detection**: Track silence, trigger chapter recovery UI after 30s
- **AI analysis cycle**: After each transcription batch → AIAssistant for suggestions + off-track detection + rules Q&A
- **Chapter tracking**: Update ChapterTracker on scene changes
- **Scene detection**: Feed transcript to SceneDetector
- **Analytics**: Update SessionAnalytics with each transcription segment

New methods:
- `startLiveMode()` — begin periodic transcription cycle
- `stopLiveMode()` — stop periodic cycle, keep transcript
- `_liveCycle()` — single live transcription + analysis iteration
- `_handleSilence()` — silence detection handler
- `getAISuggestions()` — get current AI suggestions
- `getOffTrackStatus()` — get current off-track status
- `getCurrentChapter()` — get current chapter info

The existing post-session workflow (`startSession()` → `stopSession()` → `processTranscription()` → `publishToKanka()`) remains unchanged.

**Step 1: Write tests for live mode**

```javascript
describe('live mode', () => {
  it('starts periodic transcription cycle', () => { /* ... */ });
  it('feeds transcription to AI assistant', () => { /* ... */ });
  it('detects silence and triggers recovery', () => { /* ... */ });
  it('updates chapter on scene change', () => { /* ... */ });
  it('updates analytics with each segment', () => { /* ... */ });
  it('can switch from live to post-session mode', () => { /* ... */ });
});
```

**Step 2-5:** TDD cycle.

```bash
git commit -m "feat: expand SessionOrchestrator with live mode (NM integration)"
```

---

## Phase 5: UI

### Task 21: Create MainPanel unified UI

**Files:**
- Create: `VoxChronicle/scripts/ui/MainPanel.mjs`
- Create: `VoxChronicle/templates/main-panel.hbs`
- Test: `VoxChronicle/tests/ui/MainPanel.test.mjs`

**Step 1: Write the template `main-panel.hbs`**

Based on NM's `panel.hbs` structure, expanded with VC tabs:

```handlebars
<div class="vox-chronicle-panel" id="vox-chronicle-main-panel">
  {{!-- Configuration Warning --}}
  {{#unless isConfigured}}
  <div class="vox-chronicle-panel__warning">
    <i class="fas fa-exclamation-triangle"></i>
    {{localize "VOXCHRONICLE.Panel.ConfigWarning"}}
  </div>
  {{/unless}}

  {{!-- Fixed Header: Recording Controls --}}
  <div class="vox-chronicle-panel__header">
    <div class="vox-chronicle-panel__controls">
      <button class="vox-chronicle-btn vox-chronicle-btn--record"
              data-action="toggle-recording"
              {{#if isProcessing}}disabled{{/if}}>
        <i class="fas {{#if isRecording}}fa-stop{{else}}fa-circle{{/if}}"></i>
        {{#if isRecording}}
          {{localize "VOXCHRONICLE.Panel.Stop"}}
        {{else}}
          {{localize "VOXCHRONICLE.Panel.Record"}}
        {{/if}}
      </button>
      {{#if isRecording}}
      <button class="vox-chronicle-btn" data-action="toggle-pause">
        <i class="fas {{#if isPaused}}fa-play{{else}}fa-pause{{/if}}"></i>
      </button>
      {{/if}}
      <span class="vox-chronicle-panel__duration">{{duration}}</span>
    </div>

    {{!-- Audio Level Meter --}}
    {{#if isRecording}}
    <div class="vox-chronicle-panel__level-meter">
      <div class="vox-chronicle-panel__level-bar" style="width: {{audioLevel}}%"></div>
    </div>
    {{/if}}

    {{!-- Status Row --}}
    <div class="vox-chronicle-panel__status">
      <span class="vox-chronicle-panel__mode-badge vox-chronicle-panel__mode-badge--{{transcriptionMode}}">
        {{transcriptionMode}}
        {{#if backendHealthy}}<i class="fas fa-check"></i>{{/if}}
      </span>
      {{#if currentChapter}}
      <span class="vox-chronicle-panel__chapter" title="{{currentChapter.path}}">
        <i class="fas fa-book"></i> {{currentChapter.name}}
      </span>
      {{/if}}
    </div>
  </div>

  {{!-- Tab Navigation --}}
  <nav class="vox-chronicle-panel__tabs">
    <button class="vox-chronicle-tab {{#if (eq activeTab 'live')}}vox-chronicle-tab--active{{/if}}"
            data-tab="live">
      {{localize "VOXCHRONICLE.Panel.TabLive"}}
      {{#if isOffTrack}}<span class="vox-chronicle-tab__badge vox-chronicle-tab__badge--warning">!</span>{{/if}}
    </button>
    <button class="vox-chronicle-tab {{#if (eq activeTab 'chronicle')}}vox-chronicle-tab--active{{/if}}"
            data-tab="chronicle">
      {{localize "VOXCHRONICLE.Panel.TabChronicle"}}
    </button>
    <button class="vox-chronicle-tab {{#if (eq activeTab 'images')}}vox-chronicle-tab--active{{/if}}"
            data-tab="images">
      {{localize "VOXCHRONICLE.Panel.TabImages"}}
      {{#if imageCount}}<span class="vox-chronicle-tab__badge">{{imageCount}}</span>{{/if}}
    </button>
    <button class="vox-chronicle-tab {{#if (eq activeTab 'transcript')}}vox-chronicle-tab--active{{/if}}"
            data-tab="transcript">
      {{localize "VOXCHRONICLE.Panel.TabTranscript"}}
    </button>
    <button class="vox-chronicle-tab {{#if (eq activeTab 'entities')}}vox-chronicle-tab--active{{/if}}"
            data-tab="entities">
      {{localize "VOXCHRONICLE.Panel.TabEntities"}}
      {{#if entityCount}}<span class="vox-chronicle-tab__badge">{{entityCount}}</span>{{/if}}
    </button>
    <button class="vox-chronicle-tab {{#if (eq activeTab 'analytics')}}vox-chronicle-tab--active{{/if}}"
            data-tab="analytics">
      {{localize "VOXCHRONICLE.Panel.TabAnalytics"}}
    </button>
  </nav>

  {{!-- Tab Content --}}
  <div class="vox-chronicle-panel__content">

    {{!-- LIVE TAB --}}
    <div class="vox-chronicle-tab-pane {{#unless (eq activeTab 'live')}}hidden{{/unless}}" data-tab-pane="live">
      {{!-- Off-track Warning --}}
      {{#if offTrackWarning}}
      <div class="vox-chronicle-panel__off-track">
        <i class="fas fa-exclamation-circle"></i>
        <span>{{offTrackWarning.message}}</span>
      </div>
      {{/if}}
      {{!-- Narrative Bridge --}}
      {{#if narrativeBridge}}
      <div class="vox-chronicle-panel__bridge">
        <h4>{{localize "VOXCHRONICLE.Panel.NarrativeBridge"}}</h4>
        <p>{{narrativeBridge}}</p>
        <button class="vox-chronicle-btn--small" data-action="copy-bridge">
          <i class="fas fa-copy"></i>
        </button>
      </div>
      {{/if}}
      {{!-- AI Suggestions --}}
      <div class="vox-chronicle-panel__suggestions">
        <h4>{{localize "VOXCHRONICLE.Panel.Suggestions"}}</h4>
        {{#each suggestions}}
        <div class="vox-chronicle-suggestion vox-chronicle-suggestion--{{this.type}}">
          <span class="vox-chronicle-suggestion__type">{{this.type}}</span>
          <p>{{this.text}}</p>
        </div>
        {{else}}
        <p class="vox-chronicle-panel__empty">{{localize "VOXCHRONICLE.Panel.NoSuggestions"}}</p>
        {{/each}}
      </div>
      {{!-- NPC Dialogue --}}
      {{#if npcDialogue}}
      <div class="vox-chronicle-panel__npc-dialogue">
        <h4>{{localize "VOXCHRONICLE.Panel.NPCDialogue"}}</h4>
        <p>{{npcDialogue}}</p>
        <button class="vox-chronicle-btn--small" data-action="copy-npc">
          <i class="fas fa-copy"></i>
        </button>
      </div>
      {{/if}}
      {{!-- Rules Q&A --}}
      {{#if rulesAnswer}}
      <div class="vox-chronicle-panel__rules">
        <h4>{{localize "VOXCHRONICLE.Panel.RulesQA"}}</h4>
        <p>{{rulesAnswer.answer}}</p>
        {{#if rulesAnswer.citation}}
        <cite>{{rulesAnswer.citation}}</cite>
        {{/if}}
      </div>
      {{/if}}
      {{!-- Chapter Navigation --}}
      {{#if currentChapter}}
      <div class="vox-chronicle-panel__chapter-nav">
        <h4>{{localize "VOXCHRONICLE.Panel.ChapterNav"}}</h4>
        <div class="vox-chronicle-panel__chapter-path">{{currentChapter.path}}</div>
        {{#if currentChapter.subchapters}}
        <ul>
          {{#each currentChapter.subchapters}}
          <li><a data-action="goto-chapter" data-chapter-id="{{this.id}}">{{this.name}}</a></li>
          {{/each}}
        </ul>
        {{/if}}
      </div>
      {{/if}}
    </div>

    {{!-- CHRONICLE TAB --}}
    <div class="vox-chronicle-tab-pane {{#unless (eq activeTab 'chronicle')}}hidden{{/unless}}" data-tab-pane="chronicle">
      {{!-- Post-session Kanka workflow --}}
      <div class="vox-chronicle-panel__chronicle-workflow">
        <button class="vox-chronicle-btn" data-action="process-session" {{#unless hasTranscript}}disabled{{/unless}}>
          <i class="fas fa-cogs"></i> {{localize "VOXCHRONICLE.Panel.ProcessSession"}}
        </button>
        <button class="vox-chronicle-btn" data-action="publish-kanka" {{#unless hasEntities}}disabled{{/unless}}>
          <i class="fas fa-upload"></i> {{localize "VOXCHRONICLE.Panel.PublishToKanka"}}
        </button>
        {{#if publishProgress}}
        <div class="vox-chronicle-panel__progress">
          <div class="vox-chronicle-panel__progress-bar" style="width: {{publishProgress}}%"></div>
          <span>{{publishMessage}}</span>
        </div>
        {{/if}}
      </div>
    </div>

    {{!-- IMAGES TAB --}}
    <div class="vox-chronicle-tab-pane {{#unless (eq activeTab 'images')}}hidden{{/unless}}" data-tab-pane="images">
      <div class="vox-chronicle-panel__image-controls">
        <button class="vox-chronicle-btn" data-action="generate-image">
          <i class="fas fa-image"></i> {{localize "VOXCHRONICLE.Panel.GenerateImage"}}
        </button>
        {{#if images.length}}
        <button class="vox-chronicle-btn--small" data-action="clear-images">
          <i class="fas fa-trash"></i>
        </button>
        {{/if}}
      </div>
      <div class="vox-chronicle-panel__gallery">
        {{#each images}}
        <div class="vox-chronicle-panel__image-card" data-image-id="{{this.id}}">
          <img src="{{this.src}}" alt="{{this.prompt}}" data-action="lightbox">
          <button class="vox-chronicle-btn--small" data-action="delete-image">
            <i class="fas fa-times"></i>
          </button>
        </div>
        {{/each}}
      </div>
    </div>

    {{!-- TRANSCRIPT TAB --}}
    <div class="vox-chronicle-tab-pane {{#unless (eq activeTab 'transcript')}}hidden{{/unless}}" data-tab-pane="transcript">
      <div class="vox-chronicle-panel__transcript-controls">
        <button class="vox-chronicle-btn--small" data-action="export-transcript">
          <i class="fas fa-download"></i> {{localize "VOXCHRONICLE.Panel.Export"}}
        </button>
        <button class="vox-chronicle-btn--small" data-action="copy-transcript">
          <i class="fas fa-copy"></i>
        </button>
        <button class="vox-chronicle-btn--small" data-action="clear-transcript">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div class="vox-chronicle-panel__transcript">
        {{#each segments}}
        <div class="vox-chronicle-segment {{#if this.isSceneBreak}}vox-chronicle-segment--scene-break{{/if}}">
          {{#if this.isSceneBreak}}
          <div class="vox-chronicle-segment__break">--- {{this.sceneType}} ---</div>
          {{else}}
          <span class="vox-chronicle-segment__speaker" data-action="rename-speaker" data-speaker="{{this.speaker}}">
            {{this.speaker}}:
          </span>
          <span class="vox-chronicle-segment__text">{{this.text}}</span>
          {{/if}}
        </div>
        {{else}}
        <p class="vox-chronicle-panel__empty">{{localize "VOXCHRONICLE.Panel.NoTranscript"}}</p>
        {{/each}}
      </div>
    </div>

    {{!-- ENTITIES TAB --}}
    <div class="vox-chronicle-tab-pane {{#unless (eq activeTab 'entities')}}hidden{{/unless}}" data-tab-pane="entities">
      {{!-- Reuse EntityPreview component content --}}
      <div class="vox-chronicle-panel__entities">
        {{#if entities}}
        <p>{{localize "VOXCHRONICLE.Panel.EntitiesFound" count=entityCount}}</p>
        <button class="vox-chronicle-btn" data-action="review-entities">
          <i class="fas fa-eye"></i> {{localize "VOXCHRONICLE.Panel.ReviewEntities"}}
        </button>
        {{else}}
        <p class="vox-chronicle-panel__empty">{{localize "VOXCHRONICLE.Panel.NoEntities"}}</p>
        {{/if}}
      </div>
    </div>

    {{!-- ANALYTICS TAB --}}
    <div class="vox-chronicle-tab-pane {{#unless (eq activeTab 'analytics')}}hidden{{/unless}}" data-tab-pane="analytics">
      {{> "modules/vox-chronicle/templates/analytics-tab.hbs"}}
    </div>

  </div>
</div>
```

**Step 2: Write the MainPanel Application class**

```javascript
// VoxChronicle/scripts/ui/MainPanel.mjs
import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { debounce } from '../utils/DomUtils.mjs';

export class MainPanel extends Application {
  static _instance = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-main-panel',
      classes: ['vox-chronicle', 'vox-chronicle-panel'],
      template: `modules/${MODULE_ID}/templates/main-panel.hbs`,
      width: 420,
      height: 600,
      minimizable: true,
      resizable: true,
      title: 'VoxChronicle'
    });
  }

  constructor(orchestrator, options = {}) {
    super(options);
    this._orchestrator = orchestrator;
    this._activeTab = 'live';
    this._logger = Logger.createChild('MainPanel');
    this._debouncedRender = debounce(() => this.render(false), 150);
    // Restore position from settings
    const savedPos = game.settings.get(MODULE_ID, 'panelPosition');
    if (savedPos?.top) this.position.top = savedPos.top;
    if (savedPos?.left) this.position.left = savedPos.left;
  }

  static getInstance(orchestrator) {
    if (!MainPanel._instance) {
      MainPanel._instance = new MainPanel(orchestrator);
    }
    return MainPanel._instance;
  }

  getData() {
    const session = this._orchestrator.getCurrentSession();
    const liveStatus = this._orchestrator.getLiveStatus?.() || {};
    return {
      isConfigured: Settings.isOpenAIConfigured(),
      isRecording: this._orchestrator.isRecording(),
      isPaused: this._orchestrator.isPaused(),
      isProcessing: this._orchestrator.isProcessing(),
      duration: this._orchestrator.getDuration(),
      audioLevel: Math.round((liveStatus.audioLevel || 0) * 100),
      transcriptionMode: Settings.getTranscriptionMode(),
      backendHealthy: liveStatus.backendHealthy,
      currentChapter: liveStatus.currentChapter,
      activeTab: this._activeTab,
      isOffTrack: liveStatus.isOffTrack,
      offTrackWarning: liveStatus.offTrackWarning,
      narrativeBridge: liveStatus.narrativeBridge,
      suggestions: liveStatus.suggestions || [],
      npcDialogue: liveStatus.npcDialogue,
      rulesAnswer: liveStatus.rulesAnswer,
      images: session?.images || [],
      imageCount: session?.images?.length || 0,
      segments: session?.transcript?.segments || [],
      hasTranscript: !!session?.transcript,
      entities: session?.entities,
      entityCount: this._countEntities(session?.entities),
      hasEntities: !!session?.entities,
      publishProgress: session?.publishProgress,
      publishMessage: session?.publishMessage,
      analytics: liveStatus.analytics
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Tab switching
    html.find('.vox-chronicle-tab').on('click', (e) => {
      this._activeTab = e.currentTarget.dataset.tab;
      this.render(false);
    });
    // Recording controls
    html.find('[data-action="toggle-recording"]').on('click', () => this._toggleRecording());
    html.find('[data-action="toggle-pause"]').on('click', () => this._togglePause());
    // Live tab actions
    html.find('[data-action="copy-bridge"]').on('click', () => this._copyToClipboard(this._orchestrator.getLiveStatus()?.narrativeBridge));
    html.find('[data-action="copy-npc"]').on('click', () => this._copyToClipboard(this._orchestrator.getLiveStatus()?.npcDialogue));
    html.find('[data-action="goto-chapter"]').on('click', (e) => this._gotoChapter(e.currentTarget.dataset.chapterId));
    // Chronicle tab
    html.find('[data-action="process-session"]').on('click', () => this._processSession());
    html.find('[data-action="publish-kanka"]').on('click', () => this._publishToKanka());
    // Images tab
    html.find('[data-action="generate-image"]').on('click', () => this._generateImage());
    html.find('[data-action="delete-image"]').on('click', (e) => this._deleteImage(e));
    html.find('[data-action="clear-images"]').on('click', () => this._clearImages());
    // Transcript tab
    html.find('[data-action="export-transcript"]').on('click', () => this._exportTranscript());
    html.find('[data-action="copy-transcript"]').on('click', () => this._copyTranscript());
    html.find('[data-action="clear-transcript"]').on('click', () => this._clearTranscript());
    html.find('[data-action="rename-speaker"]').on('click', (e) => this._renameSpeaker(e));
    // Entities tab
    html.find('[data-action="review-entities"]').on('click', () => this._reviewEntities());
  }

  // ... handler methods delegating to orchestrator
}
```

**Step 3: Write tests**

```javascript
describe('MainPanel', () => {
  it('renders with correct default tab', () => { /* ... */ });
  it('switches tabs on click', () => { /* ... */ });
  it('shows off-track warning on live tab', () => { /* ... */ });
  it('shows recording controls in header', () => { /* ... */ });
  it('saves position to settings', () => { /* ... */ });
});
```

**Step 4-5:** Implement, test, commit.

```bash
git commit -m "feat: create unified MainPanel UI with 6 tabs"
```

---

### Task 22: Port analytics-tab.hbs and journal-picker.hbs templates

**Files:**
- Source: `narrator_master/templates/analytics-tab.hbs`
- Create: `VoxChronicle/templates/analytics-tab.hbs`
- Source: `narrator_master/templates/journal-picker.hbs`
- Create: `VoxChronicle/templates/journal-picker.hbs`

**Step 1:** Copy templates, update localization keys from `NARRATOR.*` to `VOXCHRONICLE.*`, update CSS class prefixes from `narrator-master` to `vox-chronicle`.

**Step 2: Commit**

```bash
git commit -m "feat: port analytics and journal-picker templates from Narrator Master"
```

---

### Task 23: Merge CSS styles

**Files:**
- Modify: `VoxChronicle/styles/vox-chronicle.css`
- Source: `narrator_master/styles/narrator-master.css`

**What to merge:**

From NM CSS, port and rename:
- `.narrator-master-panel` → `.vox-chronicle-panel` (panel layout)
- Off-track warning styles (red `#e74c3c` backgrounds/text)
- Recording states (red recording, orange paused, blue processing)
- Audio level meter bar
- Tab navigation with badges
- Scene break markers
- Suggestion cards
- NPC dialogue section
- Rules Q&A styling
- Chapter navigation
- Image gallery grid
- Analytics display
- Animations (pulse, spinner)

Keep from VC:
- All existing `.vox-chronicle-*` styles
- BEM naming convention
- CSS custom properties

New styles needed for MainPanel layout.

**Step 1:** Merge styles, ensuring no conflicts. Use `vox-chronicle-panel` prefix for all panel-related styles.

**Step 2: Commit**

```bash
git commit -m "feat: merge Narrator Master styles into vox-chronicle.css"
```

---

### Task 24: Update main.mjs entry point

**Files:**
- Modify: `VoxChronicle/scripts/main.mjs`

**Changes:**
1. Add `MainPanel` to scene controls (replace opening separate windows)
2. Add `canvasReady` hook for chapter tracking
3. Add `updateJournalEntry`, `createJournalEntry`, `deleteJournalEntry` hooks for journal reload
4. Update scene control buttons:
   - **Panel** — toggle MainPanel
   - **Vocabulary** — open VocabularyManager
   - **Relationships** — open RelationshipGraph
   - **Speaker Labels** — open SpeakerLabeling
   - **Settings** — open settings
5. Remove v11 compatibility code (now v12+ only)
6. Initialize `Logger.setDebugMode()` from settings on `ready`

**Step 1-5:** TDD cycle.

```bash
git commit -m "feat: update main.mjs with unified panel and NM hooks"
```

---

## Phase 6: Localization

### Task 25: Merge language files

**Files:**
- Modify: `VoxChronicle/lang/en.json` — merge NM en.json strings
- Modify: `VoxChronicle/lang/it.json` — merge NM it.json strings
- Create: `VoxChronicle/lang/de.json` — from NM, add VC keys with EN fallback
- Create: `VoxChronicle/lang/es.json` — from NM, add VC keys with EN fallback
- Create: `VoxChronicle/lang/fr.json` — from NM, add VC keys with EN fallback
- Create: `VoxChronicle/lang/ja.json` — from NM, add VC keys with EN fallback
- Create: `VoxChronicle/lang/pt.json` — from NM, add VC keys with EN fallback
- Create: `VoxChronicle/lang/template.json` — from NM

**Process for en.json and it.json:**
1. Take existing VC file as base
2. Rename NM keys: `NARRATOR.*` → `VOXCHRONICLE.*`
3. Merge NM strings under appropriate categories
4. Add new keys for unified panel (TabLive, TabChronicle, TabAnalytics, etc.)
5. Add new keys for all new settings from Task 18

**Process for de/es/fr/ja/pt:**
1. Take NM file as base
2. Rename `NARRATOR.*` → `VOXCHRONICLE.*`
3. For VC-specific keys that don't have translations in these languages, use English strings as values (marked with `[EN]` prefix for future translators)

**Step 1: Merge en.json**

New keys to add (categories):
```json
{
  "VOXCHRONICLE": {
    "Panel": {
      "TabLive": "Live",
      "TabChronicle": "Chronicle",
      "TabImages": "Images",
      "TabTranscript": "Transcript",
      "TabEntities": "Entities",
      "TabAnalytics": "Analytics",
      "NarrativeBridge": "Narrative Bridge",
      "Suggestions": "Suggestions",
      "NoSuggestions": "Start recording to get AI suggestions",
      "NPCDialogue": "NPC Dialogue",
      "RulesQA": "Rules Q&A",
      "ChapterNav": "Chapter Navigation",
      "ProcessSession": "Process Session",
      "PublishToKanka": "Publish to Kanka",
      "GenerateImage": "Generate Image",
      "ReviewEntities": "Review Entities",
      "Export": "Export",
      "NoTranscript": "No transcript yet",
      "NoEntities": "No entities extracted yet",
      "ConfigWarning": "Configure your OpenAI API key in module settings to use VoxChronicle"
    },
    "Settings": {
      "MultiLanguageMode": "Multi-Language Mode",
      "MultiLanguageModeHint": "Enable transcription of multiple languages in the same session",
      "TranscriptionBatchDuration": "Live Transcription Interval",
      "TranscriptionBatchDurationHint": "How often to transcribe during live mode (5-30 seconds)",
      "OffTrackSensitivity": "Off-Track Sensitivity",
      "OffTrackSensitivityHint": "How sensitive the AI is to detecting off-track players",
      "SensitivityLow": "Low",
      "SensitivityMedium": "Medium",
      "SensitivityHigh": "High",
      "RulesDetection": "Rules Detection",
      "RulesDetectionHint": "Detect D&D rules questions in conversation",
      "RulesSource": "Rules Source",
      "RulesSourceHint": "Which rules compendium to search",
      "RulesSourceAuto": "Auto-detect",
      "RulesSourceDnD5e": "D&D 5e SRD",
      "DebugMode": "Debug Mode",
      "DebugModeHint": "Enable verbose logging for troubleshooting",
      "ApiRetryEnabled": "API Retry",
      "ApiRetryEnabledHint": "Automatically retry failed API requests",
      "ApiRetryMaxAttempts": "Max Retry Attempts",
      "ApiRetryMaxAttemptsHint": "Maximum number of retry attempts for failed API requests",
      "ApiRetryBaseDelay": "Retry Base Delay (ms)",
      "ApiRetryBaseDelayHint": "Base delay between retry attempts",
      "ApiRetryMaxDelay": "Retry Max Delay (ms)",
      "ApiRetryMaxDelayHint": "Maximum delay between retry attempts",
      "ApiQueueMaxSize": "API Queue Size",
      "ApiQueueMaxSizeHint": "Maximum number of API requests that can be queued"
    },
    "OffTrack": {
      "Warning": "Players seem to be off-track!",
      "Severity": "Severity: {{severity}}"
    },
    "Silence": {
      "Detected": "No speech detected for {{seconds}} seconds",
      "Recovery": "Navigate to a chapter to continue"
    },
    "Rules": {
      "QuestionDetected": "Rules question detected",
      "Searching": "Searching rules...",
      "NoAnswer": "No relevant rules found"
    },
    "Scene": {
      "Combat": "Combat",
      "Social": "Social",
      "Exploration": "Exploration",
      "Rest": "Rest"
    }
  }
}
```

**Step 2: Merge it.json** — same structure with Italian translations.

**Step 3: Create de/es/fr/ja/pt** — rename NM keys + add EN fallbacks for VC-only keys.

**Step 4: Update module.json languages array** to include all 7 + template.

**Step 5: Commit**

```bash
git commit -m "feat: merge all 7 language files (en, it, de, es, fr, ja, pt)"
```

---

## Phase 7: Module Manifest & Compatibility

### Task 26: Update module.json to v2.0.0

**Files:**
- Modify: `VoxChronicle/module.json`

**Changes:**
```json
{
  "id": "vox-chronicle",
  "title": "VoxChronicle",
  "description": "AI-powered session transcription, real-time DM assistant, and Kanka chronicle publisher for Foundry VTT",
  "version": "2.0.0",
  "compatibility": {
    "minimum": "12",
    "verified": "13"
  },
  "esmodules": ["scripts/main.mjs"],
  "styles": ["styles/vox-chronicle.css"],
  "languages": [
    { "lang": "en", "name": "English", "path": "lang/en.json" },
    { "lang": "it", "name": "Italiano", "path": "lang/it.json" },
    { "lang": "de", "name": "Deutsch", "path": "lang/de.json" },
    { "lang": "es", "name": "Espa\u00f1ol", "path": "lang/es.json" },
    { "lang": "fr", "name": "Fran\u00e7ais", "path": "lang/fr.json" },
    { "lang": "ja", "name": "\u65e5\u672c\u8a9e", "path": "lang/ja.json" },
    { "lang": "pt", "name": "Portugu\u00eas", "path": "lang/pt.json" }
  ],
  "url": "https://github.com/Aiacos/VoxChronicle",
  "manifest": "https://github.com/Aiacos/VoxChronicle/releases/latest/download/module.json",
  "download": "https://github.com/Aiacos/VoxChronicle/releases/download/v2.0.0/vox-chronicle-v2.0.0.zip"
}
```

**Step 1: Commit**

```bash
git commit -m "feat: bump to v2.0.0, add 7 languages, update compatibility to v12-v13"
```

---

### Task 27: Remove Foundry v11 compatibility code

**Files:**
- Modify: `VoxChronicle/scripts/main.mjs` — remove v11 scene control fallback
- Modify: any other files with v11 conditional code

**Step 1:** Search for v11 conditionals:
```bash
grep -rn "v11\|isNewerThan.*11\|game.version" VoxChronicle/scripts/
```

**Step 2:** Remove all v11-specific code paths, keep only v12+ logic.

**Step 3: Commit**

```bash
git commit -m "chore: remove Foundry v11 compatibility code (now v12+ only)"
```

---

## Phase 8: Testing

### Task 28: Run and fix existing VoxChronicle tests

**Files:**
- All files in `VoxChronicle/tests/`

**Step 1:** Run full test suite:
```bash
cd /home/aiacos/workspace/FoundryVTT/VoxChronicle && npx vitest run
```

**Step 2:** Fix any broken tests due to:
- OpenAIClient changes (retry/queue additions)
- AudioRecorder changes (level metering additions)
- TranscriptionService changes (multi-language, circuit breaker)
- ImageGenerationService changes (gpt-image-1)
- Settings changes (new settings)
- main.mjs changes

**Step 3:** Ensure all 2029+ tests pass.

**Step 4: Commit fixes**

```bash
git commit -m "fix: update existing tests for v2.0.0 merged services"
```

---

### Task 29: Write integration tests for live+chronicle workflow

**Files:**
- Create: `VoxChronicle/tests/integration/unified-workflow.test.mjs`

**Tests to write:**
1. Full live mode cycle: start → transcribe batch → get suggestions → detect off-track → stop
2. Full chronicle mode cycle: process transcript → extract entities → publish to Kanka
3. Live → chronicle transition: live mode recording → stop → switch to chronicle → process → publish
4. Chapter tracking integration: scene change → chapter update → AI context update
5. Rules detection integration: transcript with rules question → detect → search compendium → display answer

**Step 1-5:** Write and run tests.

```bash
git commit -m "test: add integration tests for unified live+chronicle workflow"
```

---

## Phase 9: Documentation & Cleanup

### Task 30: Update CLAUDE.md

**Files:**
- Modify: `VoxChronicle/CLAUDE.md`

**Changes:**
- Update project description to include live DM assistant features
- Update project structure with new directories (narrator/, new files)
- Add code patterns for new services (AIAssistant, ChapterTracker, etc.)
- Update image generation docs (gpt-image-1 instead of dall-e-3)
- Add retry/queue patterns
- Update compatibility to v12-v13
- Add new settings documentation
- Update cost table with gpt-image-1 pricing
- Add live mode workflow documentation

```bash
git commit -m "docs: update CLAUDE.md for v2.0.0 merged architecture"
```

---

### Task 31: Update README.md

**Files:**
- Modify: `VoxChronicle/README.md`

**Changes:**
- New description: "AI-powered session transcription, real-time DM assistant, and Kanka chronicle publisher"
- Two-mode feature list: Live Mode + Chronicle Mode
- Updated feature list with NM features (off-track detection, rules Q&A, chapter tracking, etc.)
- Updated screenshots/UI description
- Updated setup instructions
- Migration note for Narrator Master users
- Updated compatibility

```bash
git commit -m "docs: update README for v2.0.0 with live mode features"
```

---

### Task 32: Update CHANGELOG.md

**Files:**
- Modify: `VoxChronicle/CHANGELOG.md`

**Add v2.0.0 entry:**
```markdown
## [2.0.0] - 2026-02-15

### Major: Narrator Master Integration
VoxChronicle now includes all features from the Narrator Master module, creating a unified real-time DM assistant + session chronicle publisher.

### Added
- **Live Mode**: Real-time AI assistance during game sessions
  - AI-powered contextual suggestions (narration, dialogue, action, reference)
  - Off-track detection with configurable sensitivity
  - Narrative bridge generation to guide players back to story
  - NPC dialogue generation
  - D&D rules Q&A with compendium citations
  - Chapter/scene tracking from Foundry journals
  - Scene type detection (combat, social, exploration, rest)
  - Session analytics (speaker participation, timeline)
  - Silence detection with chapter recovery UI
- **Unified Panel**: Single floating panel with 6 tabs (Live, Chronicle, Images, Transcript, Entities, Analytics)
- **Audio Level Metering**: Real-time audio level visualization
- **gpt-image-1**: Updated image generation model (replaces deprecated DALL-E 3)
- **Multi-language transcription**: Support for multiple languages in same session
- **5 new localizations**: German, Spanish, French, Japanese, Portuguese
- **API retry system**: Exponential backoff with jitter for all OpenAI requests
- **Request queue**: Sequential request processing to prevent rate limiting
- **Circuit breaker**: Auto-stops after consecutive failures
- **Debug mode**: Verbose logging toggle in settings

### Changed
- Minimum Foundry VTT version: v12 (dropped v11 support)
- Image generation model: gpt-image-1 (was dall-e-3)
- OpenAI client: Added retry/queue/backoff (from Narrator Master)
- AudioRecorder: Added level metering and silence detection
- TranscriptionService: Added multi-language mode
- SpeakerLabeling: Added inline rename and retroactive apply

### Deprecated
- Narrator Master module is now archived. All features are included in VoxChronicle v2.0.0.
```

```bash
git commit -m "docs: add v2.0.0 changelog entry for Narrator Master merger"
```

---

### Task 33: Deprecate narrator_master

**Files:**
- Modify: `narrator_master/README.md`

**Add deprecation notice at top:**
```markdown
> **DEPRECATED**: Narrator Master has been merged into [VoxChronicle v2.0.0](https://github.com/Aiacos/VoxChronicle). Please install VoxChronicle for all features including real-time DM assistance, session transcription, and Kanka publishing.

> This repository is archived and will not receive further updates.
```

```bash
cd /home/aiacos/workspace/FoundryVTT/narrator_master
git add README.md
git commit -m "docs: deprecate Narrator Master, redirect to VoxChronicle v2.0.0"
```

---

### Task 34: Update memory files

**Files:**
- Modify: `/home/aiacos/.claude/projects/-home-aiacos-workspace-FoundryVTT/memory/MEMORY.md`

Update to reflect the merged state:
- narrator_master is now deprecated/archived
- VoxChronicle v2.0.0 includes live DM assistant features
- Update project structure notes

---

### Task 35: Final verification

**Step 1:** Run full test suite:
```bash
cd /home/aiacos/workspace/FoundryVTT/VoxChronicle && npx vitest run
```

**Step 2:** Verify all files exist:
```bash
ls -la scripts/narrator/ scripts/ai/AIAssistant.mjs scripts/ai/RulesReference.mjs scripts/utils/CacheManager.mjs scripts/utils/DomUtils.mjs scripts/utils/ErrorNotificationHelper.mjs scripts/data/dnd-terms.mjs templates/main-panel.hbs templates/analytics-tab.hbs templates/journal-picker.hbs lang/de.json lang/es.json lang/fr.json lang/ja.json lang/pt.json
```

**Step 3:** Verify module.json is valid:
```bash
python3 -c "import json; json.load(open('module.json'))"
```

**Step 4:** Build release:
```bash
bash build.sh
```

**Step 5:** Final commit if needed.

```bash
git commit -m "chore: v2.0.0 release preparation"
```
