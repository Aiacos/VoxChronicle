# VoxChronicle Quality Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all 12 quality improvements from the v3.2.5 quality report, organized bottom-up: P1 quick wins, P2 targeted improvements, P3 structural refactors.

**Architecture:** Bottom-up approach — fix low-risk issues first to stabilize the codebase, then layer structural refactors on top. Each task is a standalone commit with tests green. The AIAssistant decomposition extracts SilenceMonitor and PromptBuilder as the two most clearly bounded groups. The BaseAPIClient extraction unifies 7 identical methods from OpenAIClient and KankaClient.

**Tech Stack:** JavaScript ES6+ modules (.mjs), Vitest + jsdom, Foundry VTT v13 API, OpenAI API, Kanka API

---

## Task 1: Sanitize Kanka API Error Messages

**Files:**
- Modify: `scripts/kanka/KankaClient.mjs:369-377`
- Test: `tests/kanka/KankaClient.test.js`

**Step 1: Write the failing test**

Add to `tests/kanka/KankaClient.test.js` inside the existing `describe('KankaClient')` block:

```javascript
describe('_parseErrorResponse XSS sanitization', () => {
  it('should sanitize HTML in Kanka error messages', async () => {
    const client = new KankaClient(TEST_TOKEN);
    const xssMessage = '<img src=x onerror=alert(1)>Error occurred';
    fetchSpy.mockResolvedValueOnce(mockResponse(
      { message: xssMessage },
      { status: 403 }
    ));

    try {
      await client.get(`/campaigns/${TEST_CAMPAIGN_ID}/entities`);
    } catch (error) {
      // The error message should NOT contain raw HTML angle brackets
      expect(error.message).not.toContain('<img');
      expect(error.message).not.toContain('onerror');
    }
  });

  it('should sanitize HTML in Kanka error field', async () => {
    const client = new KankaClient(TEST_TOKEN);
    const xssError = '<script>steal()</script>Server fault';
    fetchSpy.mockResolvedValueOnce(mockResponse(
      { error: xssError },
      { status: 500 }
    ));

    try {
      await client.get(`/campaigns/${TEST_CAMPAIGN_ID}/entities`);
    } catch (error) {
      expect(error.message).not.toContain('<script>');
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kanka/KankaClient.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — raw HTML appears in error.message

**Step 3: Implement the fix**

In `scripts/kanka/KankaClient.mjs`, add import at the top (after the existing imports around line 19):

```javascript
import { escapeHtml } from '../utils/HtmlUtils.mjs';
```

Then replace lines 369-377 (inside `_parseErrorResponse`) with:

```javascript
        // Sanitize error messages from external API to prevent XSS
        if (errorData.message) {
          errorMessage = escapeHtml(String(errorData.message).substring(0, 500));
        }
        if (errorData.error) {
          errorMessage = escapeHtml(String(errorData.error).substring(0, 500));
        }
```

Remove the TODO comment on lines 369-371.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/kanka/KankaClient.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/kanka/KankaClient.mjs tests/kanka/KankaClient.test.js
git commit -m "fix(kanka): sanitize API error messages to prevent XSS"
```

---

## Task 2: Extract `_fetchRAGContextFor()` Helper in AIAssistant

**Files:**
- Modify: `scripts/narrator/AIAssistant.mjs`
- Test: `tests/narrator/AIAssistant.test.js`

**Context:** Lines 730-737, 796-804, 840-847, 879-886, and 1848-1855 all contain this identical 8-line pattern:

```javascript
let ragContext = null;
if (this.isRAGConfigured()) {
  const ragResult = await this._getRAGContext(query);
  if (ragResult.context) {
    ragContext = this._formatRAGContext(ragResult);
    this._logger.debug(`Using RAG context with ${ragResult.sources.length} sources`);
  }
}
```

**Step 1: Write the failing test**

Add to `tests/narrator/AIAssistant.test.js`:

```javascript
describe('_fetchRAGContextFor', () => {
  it('should return null when RAG is not configured', async () => {
    const assistant = new AIAssistant({ openaiClient: mockClient });
    const result = await assistant._fetchRAGContextFor('test query');
    expect(result).toBeNull();
  });

  it('should return formatted RAG context when available', async () => {
    const mockProvider = {
      query: vi.fn().mockResolvedValue({
        answer: 'Test answer',
        sources: [{ title: 'Source1', excerpt: 'Content1' }]
      })
    };
    const assistant = new AIAssistant({
      openaiClient: mockClient,
      ragProvider: mockProvider
    });
    const result = await assistant._fetchRAGContextFor('test query');
    expect(result).toContain('Source1');
    expect(mockProvider.query).toHaveBeenCalledWith('test query', expect.any(Object));
  });

  it('should return null when RAG context is empty', async () => {
    const mockProvider = {
      query: vi.fn().mockResolvedValue({
        answer: '',
        sources: []
      })
    };
    const assistant = new AIAssistant({
      openaiClient: mockClient,
      ragProvider: mockProvider
    });
    const result = await assistant._fetchRAGContextFor('test query');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/narrator/AIAssistant.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `_fetchRAGContextFor` is not a function

**Step 3: Implement the helper**

Add this method to `scripts/narrator/AIAssistant.mjs` right before the `_getRAGContext` method (around line 1675):

```javascript
  /**
   * Fetches and formats RAG context for a given query.
   * Consolidates the repeated RAG fetch + format pattern used across public methods.
   *
   * @param {string} query - The query to retrieve context for
   * @param {string} [logLabel] - Optional label for debug logging
   * @returns {Promise<string|null>} Formatted RAG context string or null if unavailable
   * @private
   */
  async _fetchRAGContextFor(query, logLabel) {
    if (!this.isRAGConfigured()) {
      return null;
    }

    const ragResult = await this._getRAGContext(query);
    if (!ragResult.context) {
      return null;
    }

    if (logLabel) {
      this._logger.debug(`Using RAG context for ${logLabel} with ${ragResult.sources.length} sources`);
    }
    return this._formatRAGContext(ragResult);
  }
```

Then replace all 5 occurrences of the duplicated pattern. For example, in `analyzeContext()` (around line 728-737), replace:

```javascript
      // Retrieve RAG context if available
      let ragContext = null;
      if (this.isRAGConfigured()) {
        const ragResult = await this._getRAGContext(transcription);
        if (ragResult.context) {
          ragContext = this._formatRAGContext(ragResult);
          this._logger.debug(`Using RAG context with ${ragResult.sources.length} sources`);
        }
      }
```

With:

```javascript
      const ragContext = await this._fetchRAGContextFor(transcription, 'analysis');
```

Apply the same replacement to:
- `detectOffTrack()` (~line 796) → `await this._fetchRAGContextFor(transcription, 'off-track')`
- `generateSuggestions()` (~line 840) → `await this._fetchRAGContextFor(transcription, 'suggestions')`
- `generateNarrativeBridge()` (~line 879) → `await this._fetchRAGContextFor(\`${currentSituation} ${targetScene}\`, 'narrative bridge')`
- `_generateAutonomousSuggestion()` (~line 1848) → `await this._fetchRAGContextFor(contextQuery.trim(), 'autonomous suggestion')`

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/narrator/AIAssistant.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/narrator/AIAssistant.mjs tests/narrator/AIAssistant.test.js
git commit -m "refactor(ai): extract _fetchRAGContextFor() to eliminate 5x duplicated pattern"
```

---

## Task 3: Use `AudioUtils.formatDuration()` in MainPanel

**Files:**
- Modify: `scripts/ui/MainPanel.mjs:725-733`
- Test: `tests/ui/MainPanel.test.js`

**Context:** `MainPanel._formatDuration()` duplicates `AudioUtils.formatDuration()` but lacks hours support and always zero-pads minutes. `AudioUtils.formatDuration()` takes seconds as input and returns `"H:MM:SS"` or `"M:SS"`.

**Step 1: Write the failing test**

Check existing MainPanel tests for `_formatDuration` — add/update test:

```javascript
describe('_formatDuration uses AudioUtils', () => {
  it('should format short sessions as MM:SS', () => {
    // Set up session with 90 seconds elapsed
    const panel = MainPanel.getInstance(mockOrchestrator);
    mockOrchestrator.currentSession = { startTime: Date.now() - 90000, endTime: null };
    const result = panel._formatDuration();
    expect(result).toBe('1:30');
  });

  it('should format long sessions with hours', () => {
    const panel = MainPanel.getInstance(mockOrchestrator);
    mockOrchestrator.currentSession = { startTime: Date.now() - 3661000, endTime: null };
    const result = panel._formatDuration();
    expect(result).toBe('1:01:01');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/MainPanel.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — current `_formatDuration` returns `"01:30"` not `"1:30"` and doesn't handle hours

**Step 3: Implement the fix**

In `scripts/ui/MainPanel.mjs`, add import at top:

```javascript
import { AudioUtils } from '../audio/AudioUtils.mjs';
```

Replace `_formatDuration()` method (lines 725-733) with:

```javascript
  _formatDuration() {
    const session = this._orchestrator?.currentSession;
    if (!session?.startTime) return '0:00';

    const elapsed = Math.floor(((session.endTime || Date.now()) - session.startTime) / 1000);
    return AudioUtils.formatDuration(elapsed);
  }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/MainPanel.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/ui/MainPanel.mjs tests/ui/MainPanel.test.js
git commit -m "refactor(ui): replace duplicate _formatDuration with AudioUtils.formatDuration"
```

---

## Task 4: Extract `_createSessionObject()` Factory in SessionOrchestrator

**Files:**
- Modify: `scripts/orchestration/SessionOrchestrator.mjs:218-235,772-789`
- Test: `tests/orchestration/SessionOrchestrator.test.js`

**Context:** Lines 218-235 and 772-789 both construct an identical 16-field object literal.

**Step 1: Write the failing test**

Add to `tests/orchestration/SessionOrchestrator.test.js`:

```javascript
describe('_createSessionObject', () => {
  it('should create session object with defaults', () => {
    const orch = createOrchestrator();
    const session = orch._createSessionObject({});
    expect(session.id).toBeTruthy();
    expect(session.startTime).toBeGreaterThan(0);
    expect(session.endTime).toBeNull();
    expect(session.audioBlob).toBeNull();
    expect(session.transcript).toBeNull();
    expect(session.entities).toBeNull();
    expect(session.relationships).toBeNull();
    expect(session.moments).toBeNull();
    expect(session.images).toEqual([]);
    expect(session.chronicle).toBeNull();
    expect(session.kankaResults).toBeNull();
    expect(session.errors).toEqual([]);
  });

  it('should apply overrides', () => {
    const orch = createOrchestrator();
    const speakerMap = { 'SPEAKER_00': 'GM' };
    const session = orch._createSessionObject({
      title: 'Custom Title',
      speakerMap,
      language: 'it'
    });
    expect(session.title).toBe('Custom Title');
    expect(session.speakerMap).toBe(speakerMap);
    expect(session.language).toBe('it');
  });

  it('should generate unique IDs', () => {
    const orch = createOrchestrator();
    const s1 = orch._createSessionObject({});
    const s2 = orch._createSessionObject({});
    expect(s1.id).not.toBe(s2.id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestration/SessionOrchestrator.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `_createSessionObject` is not a function

**Step 3: Implement the factory**

Add this method to `scripts/orchestration/SessionOrchestrator.mjs`, right before `startSession()`:

```javascript
  /**
   * Creates a new session data object with standard defaults.
   *
   * @param {Object} [overrides={}] - Values to override defaults
   * @param {string} [overrides.title] - Session title
   * @param {Object} [overrides.speakerMap] - Speaker ID to name mapping
   * @param {string} [overrides.language] - Session language code
   * @returns {Object} The session object
   * @private
   */
  _createSessionObject(overrides = {}) {
    return {
      id: this._generateSessionId(),
      title: overrides.title || `Session ${new Date().toLocaleDateString()}`,
      date: new Date().toISOString().split('T')[0],
      startTime: Date.now(),
      endTime: null,
      speakerMap: overrides.speakerMap || {},
      language: overrides.language || null,
      audioBlob: null,
      transcript: null,
      entities: null,
      relationships: null,
      moments: null,
      images: [],
      chronicle: null,
      kankaResults: null,
      errors: []
    };
  }
```

Then replace the object literal in `startSession()` (~line 218-235):

```javascript
      this._currentSession = this._createSessionObject({
        title: sessionOptions.title,
        speakerMap: sessionOptions.speakerMap,
        language: sessionOptions.language
      });
```

And in `startLiveMode()` (~line 772-789):

```javascript
      this._currentSession = this._createSessionObject({
        title: options.title || `Live Session ${new Date().toLocaleDateString()}`,
        speakerMap: options.speakerMap,
        language: options.language
      });
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/orchestration/SessionOrchestrator.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/orchestration/SessionOrchestrator.mjs tests/orchestration/SessionOrchestrator.test.js
git commit -m "refactor(orchestrator): extract _createSessionObject to eliminate 16-field duplication"
```

---

## Task 5: Decompose AIAssistant — Extract SilenceMonitor

**Files:**
- Create: `scripts/narrator/SilenceMonitor.mjs`
- Create: `tests/narrator/SilenceMonitor.test.js`
- Modify: `scripts/narrator/AIAssistant.mjs`
- Modify: `tests/narrator/AIAssistant.test.js`

**Context:** The silence monitoring group (lines 1757-1919) includes `_handleSilenceEvent`, `_generateAutonomousSuggestion`, and `_buildAutonomousSuggestionMessages`. Plus the public API: `setSilenceDetector`, `getSilenceDetector`, `setOnAutonomousSuggestionCallback`, `getOnAutonomousSuggestionCallback`, `startSilenceMonitoring`, `stopSilenceMonitoring`, `recordTranscriptionActivity`. ~255 lines total.

**Step 1: Write the test file for SilenceMonitor**

Create `tests/narrator/SilenceMonitor.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SilenceMonitor } from '../../scripts/narrator/SilenceMonitor.mjs';

// Mock SilenceDetector
function createMockDetector() {
  return {
    setOnSilenceCallback: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    recordActivity: vi.fn().mockReturnValue(true)
  };
}

// Mock OpenAI client
function createMockClient() {
  return {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        suggestions: [{ type: 'narration', content: 'Test suggestion', confidence: 0.8 }]
      })}}]
    })
  };
}

describe('SilenceMonitor', () => {
  let monitor;
  let mockDetector;

  beforeEach(() => {
    mockDetector = createMockDetector();
    monitor = new SilenceMonitor();
  });

  describe('setSilenceDetector', () => {
    it('should accept a SilenceDetector instance', () => {
      monitor.setSilenceDetector(mockDetector);
      expect(monitor.getSilenceDetector()).toBe(mockDetector);
    });

    it('should warn on null input', () => {
      monitor.setSilenceDetector(null);
      expect(monitor.getSilenceDetector()).toBeNull();
    });
  });

  describe('startSilenceMonitoring', () => {
    it('should return false without detector', () => {
      expect(monitor.startSilenceMonitoring()).toBe(false);
    });

    it('should start monitoring with detector configured', () => {
      monitor.setSilenceDetector(mockDetector);
      const result = monitor.startSilenceMonitoring();
      expect(result).toBe(true);
      expect(mockDetector.setOnSilenceCallback).toHaveBeenCalled();
      expect(mockDetector.start).toHaveBeenCalled();
    });
  });

  describe('stopSilenceMonitoring', () => {
    it('should stop the detector', () => {
      monitor.setSilenceDetector(mockDetector);
      monitor.startSilenceMonitoring();
      monitor.stopSilenceMonitoring();
      expect(mockDetector.stop).toHaveBeenCalled();
    });
  });

  describe('recordTranscriptionActivity', () => {
    it('should delegate to detector', () => {
      monitor.setSilenceDetector(mockDetector);
      monitor.startSilenceMonitoring();
      const result = monitor.recordTranscriptionActivity();
      expect(result).toBe(true);
      expect(mockDetector.recordActivity).toHaveBeenCalled();
    });

    it('should return false when not monitoring', () => {
      expect(monitor.recordTranscriptionActivity()).toBe(false);
    });
  });

  describe('setOnAutonomousSuggestionCallback', () => {
    it('should accept a function callback', () => {
      const cb = vi.fn();
      monitor.setOnAutonomousSuggestionCallback(cb);
      expect(monitor.getOnAutonomousSuggestionCallback()).toBe(cb);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/narrator/SilenceMonitor.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — module not found

**Step 3: Create SilenceMonitor class**

Create `scripts/narrator/SilenceMonitor.mjs`:

```javascript
/**
 * SilenceMonitor - Manages autonomous AI suggestions during silence periods
 *
 * Extracted from AIAssistant to handle silence detection, autonomous suggestion
 * generation, and callback management as a dedicated responsibility.
 *
 * @class SilenceMonitor
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

class SilenceMonitor {
  _logger = Logger.createChild('SilenceMonitor');

  constructor() {
    /** @private */
    this._silenceDetector = null;
    /** @private */
    this._onAutonomousSuggestionCallback = null;
    /** @private */
    this._silenceMonitoringActive = false;
    /** @private */
    this._boundSilenceHandler = null;
    /** @private */
    this._silenceSuggestionCount = 0;
    /** @private */
    this._generateSuggestionFn = null;
  }

  /**
   * Sets the function used to generate autonomous suggestions.
   * This is called by AIAssistant to wire in its suggestion generation logic.
   *
   * @param {Function} fn - Async function that returns a Suggestion or null
   */
  setGenerateSuggestionFn(fn) {
    this._generateSuggestionFn = fn;
  }

  /**
   * Sets the SilenceDetector instance
   * @param {import('./SilenceDetector.mjs').SilenceDetector|null} silenceDetector
   */
  setSilenceDetector(silenceDetector) {
    if (silenceDetector === null) {
      this._silenceDetector = null;
      this._logger.debug('SilenceDetector cleared');
      return;
    }
    this._silenceDetector = silenceDetector;
    this._logger.debug('SilenceDetector updated');
  }

  /**
   * Gets the SilenceDetector instance
   * @returns {import('./SilenceDetector.mjs').SilenceDetector|null}
   */
  getSilenceDetector() {
    return this._silenceDetector;
  }

  /**
   * Sets the autonomous suggestion callback
   * @param {Function|null} callback
   */
  setOnAutonomousSuggestionCallback(callback) {
    if (callback === null || typeof callback === 'function') {
      this._onAutonomousSuggestionCallback = callback;
    }
  }

  /**
   * Gets the autonomous suggestion callback
   * @returns {Function|null}
   */
  getOnAutonomousSuggestionCallback() {
    return this._onAutonomousSuggestionCallback;
  }

  /**
   * Starts silence monitoring
   * @returns {boolean} True if monitoring started successfully
   */
  startSilenceMonitoring() {
    if (!this._silenceDetector) {
      this._logger.warn('Cannot start silence monitoring: no SilenceDetector configured');
      return false;
    }

    this._silenceMonitoringActive = true;
    this._silenceSuggestionCount = 0;
    this._boundSilenceHandler = this._handleSilenceEvent.bind(this);
    this._silenceDetector.setOnSilenceCallback(this._boundSilenceHandler);
    this._silenceDetector.start();

    this._logger.info('Silence monitoring started');
    return true;
  }

  /**
   * Stops silence monitoring
   */
  stopSilenceMonitoring() {
    this._silenceMonitoringActive = false;
    if (this._silenceDetector) {
      this._silenceDetector.stop();
    }
    this._boundSilenceHandler = null;
    this._logger.debug('Silence monitoring stopped');
  }

  /**
   * Records transcription activity (resets silence timer)
   * @returns {boolean} True if activity was recorded
   */
  recordTranscriptionActivity() {
    if (!this._silenceMonitoringActive || !this._silenceDetector) {
      return false;
    }
    return this._silenceDetector.recordActivity();
  }

  /**
   * Whether silence monitoring is active
   * @returns {boolean}
   */
  get isMonitoring() {
    return this._silenceMonitoringActive;
  }

  /**
   * Number of silence suggestions generated this session
   * @returns {number}
   */
  get silenceSuggestionCount() {
    return this._silenceSuggestionCount;
  }

  /**
   * Handles silence events from the SilenceDetector
   * @param {Object} silenceEvent
   * @private
   */
  async _handleSilenceEvent(silenceEvent) {
    this._logger.info(`Processing silence event #${silenceEvent.silenceCount} (${silenceEvent.silenceDurationMs}ms)`);

    if (!this._generateSuggestionFn) {
      this._logger.warn('Cannot generate autonomous suggestion: no generation function configured');
      return;
    }

    try {
      const suggestion = await this._generateSuggestionFn();

      if (!suggestion) {
        this._logger.debug('No autonomous suggestion generated');
        return;
      }

      this._silenceSuggestionCount++;
      this._logger.info(`Generated autonomous suggestion: type=${suggestion.type}, confidence=${suggestion.confidence}`);

      if (this._onAutonomousSuggestionCallback) {
        try {
          this._onAutonomousSuggestionCallback({
            suggestion,
            silenceEvent: {
              silenceDurationMs: silenceEvent.silenceDurationMs,
              lastActivityTime: silenceEvent.lastActivityTime,
              silenceCount: silenceEvent.silenceCount
            }
          });
        } catch (callbackError) {
          this._logger.error('Error in autonomous suggestion callback:', callbackError.message);
        }
      }
    } catch (error) {
      this._logger.error('Failed to generate autonomous suggestion:', error.message);
    }
  }
}

export { SilenceMonitor };
```

**Step 4: Run SilenceMonitor tests**

Run: `npx vitest run tests/narrator/SilenceMonitor.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Wire SilenceMonitor into AIAssistant**

In `scripts/narrator/AIAssistant.mjs`:

1. Add import: `import { SilenceMonitor } from './SilenceMonitor.mjs';`

2. In the constructor, after existing initialization, add:
```javascript
    this._silenceMonitor = new SilenceMonitor();
    this._silenceMonitor.setGenerateSuggestionFn(() => this._generateAutonomousSuggestion());
```

3. Replace the public silence methods to delegate:
```javascript
  setSilenceDetector(silenceDetector) {
    this._silenceMonitor.setSilenceDetector(silenceDetector);
  }

  getSilenceDetector() {
    return this._silenceMonitor.getSilenceDetector();
  }

  setOnAutonomousSuggestionCallback(callback) {
    this._silenceMonitor.setOnAutonomousSuggestionCallback(callback);
  }

  getOnAutonomousSuggestionCallback() {
    return this._silenceMonitor.getOnAutonomousSuggestionCallback();
  }

  startSilenceMonitoring() {
    if (!this.isConfigured()) {
      this._logger.warn('Cannot start silence monitoring: OpenAI client not configured');
      return false;
    }
    return this._silenceMonitor.startSilenceMonitoring();
  }

  stopSilenceMonitoring() {
    this._silenceMonitor.stopSilenceMonitoring();
  }

  recordTranscriptionActivity() {
    return this._silenceMonitor.recordTranscriptionActivity();
  }
```

4. Remove the old `_handleSilenceEvent` method (lines ~1773-1814) — it's now in SilenceMonitor.

5. Keep `_generateAutonomousSuggestion()` and `_buildAutonomousSuggestionMessages()` in AIAssistant since they depend on `_chapterContext`, `_previousTranscription`, `_buildSystemPrompt()`, etc.

6. Update `getStatus()` to read from SilenceMonitor:
```javascript
    silenceSuggestionCount: this._silenceMonitor.silenceSuggestionCount,
    silenceDetectorConfigured: Boolean(this._silenceMonitor.getSilenceDetector()),
    hasAutonomousSuggestionCallback: Boolean(this._silenceMonitor.getOnAutonomousSuggestionCallback()),
```

7. Update `resetSession()` to reset silence state via:
```javascript
    this._silenceMonitor.stopSilenceMonitoring();
```

**Step 6: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 7: Commit**

```bash
git add scripts/narrator/SilenceMonitor.mjs tests/narrator/SilenceMonitor.test.js scripts/narrator/AIAssistant.mjs tests/narrator/AIAssistant.test.js
git commit -m "refactor(narrator): extract SilenceMonitor from AIAssistant (~200 lines)"
```

---

## Task 6: Decompose AIAssistant — Extract PromptBuilder

**Files:**
- Create: `scripts/narrator/PromptBuilder.mjs`
- Create: `tests/narrator/PromptBuilder.test.js`
- Modify: `scripts/narrator/AIAssistant.mjs`
- Modify: `tests/narrator/AIAssistant.test.js`

**Context:** The 6 `_build*Messages()` methods (lines 1148-1360, ~210 lines) plus `_buildSystemPrompt()` (~130 lines) and `_buildAutonomousSuggestionMessages()` (~40 lines) all follow the same pattern: build system prompt, add context, add user request. Extract as PromptBuilder.

**Step 1: Write tests for PromptBuilder**

Create `tests/narrator/PromptBuilder.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptBuilder } from '../../scripts/narrator/PromptBuilder.mjs';

describe('PromptBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new PromptBuilder({
      primaryLanguage: 'en',
      sensitivity: 'medium'
    });
  });

  describe('buildAnalysisMessages', () => {
    it('should include system prompt and transcription', () => {
      const messages = builder.buildAnalysisMessages('Players enter tavern', true, true, null);
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe('system');
      expect(messages.at(-1).role).toBe('user');
      expect(messages.at(-1).content).toContain('Players enter tavern');
    });

    it('should include RAG context when provided', () => {
      const messages = builder.buildAnalysisMessages('test', true, true, 'RAG context here');
      const contextMsg = messages.find(m => m.content.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeTruthy();
      expect(contextMsg.content).toContain('RAG context here');
    });
  });

  describe('buildOffTrackMessages', () => {
    it('should ask for off-track detection in JSON', () => {
      const messages = builder.buildOffTrackMessages('test', null);
      expect(messages.at(-1).content).toContain('isOffTrack');
    });
  });

  describe('buildSuggestionMessages', () => {
    it('should request specified number of suggestions', () => {
      const messages = builder.buildSuggestionMessages('test', 5, null);
      expect(messages.at(-1).content).toContain('5');
    });
  });

  describe('buildNarrativeBridgeMessages', () => {
    it('should include situation and target', () => {
      const messages = builder.buildNarrativeBridgeMessages('lost in forest', 'castle entrance', null);
      expect(messages.at(-1).content).toContain('lost in forest');
      expect(messages.at(-1).content).toContain('castle entrance');
    });
  });

  describe('buildNPCDialogueMessages', () => {
    it('should include NPC name and context', () => {
      const messages = builder.buildNPCDialogueMessages('Gandalf', 'wise wizard', 'players seek advice', 3);
      expect(messages.at(-1).content).toContain('Gandalf');
    });
  });

  describe('setAdventureContext', () => {
    it('should store adventure context for use in prompts', () => {
      builder.setAdventureContext('The adventure begins...');
      const messages = builder.buildAnalysisMessages('test', true, false, null);
      const contextMsg = messages.find(m => m.content?.includes('ADVENTURE CONTEXT'));
      expect(contextMsg).toBeTruthy();
    });
  });

  describe('setChapterContext', () => {
    it('should be usable in autonomous suggestion messages', () => {
      builder.setChapterContext({ chapterName: 'Chapter 1', summary: 'The beginning' });
      const messages = builder.buildAutonomousSuggestionMessages('game paused', null);
      expect(messages.at(-1).content).toContain('Chapter 1');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/narrator/PromptBuilder.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — module not found

**Step 3: Create PromptBuilder**

Create `scripts/narrator/PromptBuilder.mjs` — extract `_buildSystemPrompt()`, all 6 `_build*Messages()` methods, `_truncateContext()`, and `_formatChapterContext()` from AIAssistant. Make them public methods. Store `_adventureContext`, `_chapterContext`, `_primaryLanguage`, `_sensitivity`, `_conversationHistory`, and `_previousTranscription` as mutable state that AIAssistant updates.

The key pattern: each build method starts with system prompt, optionally adds adventure context, adds conversation history, then adds user content.

**Step 4: Wire PromptBuilder into AIAssistant**

AIAssistant constructor creates `this._promptBuilder = new PromptBuilder(...)` and delegates all `_build*Messages` calls. AIAssistant updates PromptBuilder state via setters when adventure context, chapter context, or language changes.

**Step 5: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/narrator/PromptBuilder.mjs tests/narrator/PromptBuilder.test.js scripts/narrator/AIAssistant.mjs tests/narrator/AIAssistant.test.js
git commit -m "refactor(narrator): extract PromptBuilder from AIAssistant (~350 lines)"
```

---

## Task 7: Improve HtmlUtils Test Coverage

**Files:**
- Modify: `tests/utils/HtmlUtils.test.js`

**Context:** Current tests cover `escapeHtml` and `stripHtml` but NOT `sanitizeHtml`. Missing: SVG XSS, encoded protocols, falsy numbers in `escapeHtml`, and comprehensive `sanitizeHtml` coverage.

**Step 1: Add sanitizeHtml test suite**

Add to `tests/utils/HtmlUtils.test.js`:

```javascript
import { escapeHtml, sanitizeHtml, stripHtml } from '../../scripts/utils/HtmlUtils.mjs';

// ... existing tests ...

describe('sanitizeHtml', () => {
  it('should return empty string for null', () => {
    expect(sanitizeHtml(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(sanitizeHtml(undefined)).toBe('');
  });

  it('should return empty string for non-string', () => {
    expect(sanitizeHtml(123)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('should preserve safe HTML tags', () => {
    const input = '<p>Hello <strong>World</strong></p>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
  });

  it('should remove script tags', () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('Safe');
  });

  it('should remove iframe tags', () => {
    const result = sanitizeHtml('<iframe src="evil.com"></iframe><p>OK</p>');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('OK');
  });

  it('should remove event handlers from elements', () => {
    const result = sanitizeHtml('<div onclick="alert(1)">Click</div>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('Click');
  });

  it('should remove onload event handlers', () => {
    const result = sanitizeHtml('<img src="x" onload="alert(1)">');
    expect(result).not.toContain('onload');
  });

  it('should remove onerror event handlers', () => {
    const result = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('should remove javascript: protocol from href', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">Click</a>');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('Click');
  });

  it('should remove data: protocol from src', () => {
    const result = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(result).not.toContain('data:');
  });

  it('should remove vbscript: protocol from href', () => {
    const result = sanitizeHtml('<a href="vbscript:alert(1)">Click</a>');
    expect(result).not.toContain('vbscript:');
  });

  it('should remove srcdoc attribute', () => {
    const result = sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
    expect(result).not.toContain('srcdoc');
  });

  it('should remove form elements', () => {
    const result = sanitizeHtml('<form action="evil.com"><input type="text"><button>Submit</button></form>');
    expect(result).not.toContain('<form');
    expect(result).not.toContain('<input');
    expect(result).not.toContain('<button');
  });

  it('should remove style tags', () => {
    const result = sanitizeHtml('<style>body { display: none }</style><p>Content</p>');
    expect(result).not.toContain('<style');
    expect(result).toContain('Content');
  });

  it('should remove object and embed tags', () => {
    const result = sanitizeHtml('<object data="evil.swf"></object><embed src="evil.swf"><p>OK</p>');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
    expect(result).toContain('OK');
  });

  it('should handle nested dangerous elements', () => {
    const result = sanitizeHtml('<div><script>alert(1)</script><p>Safe</p></div>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('Safe');
  });

  it('should preserve safe formatting in chronicle content', () => {
    const input = '<h1>Title</h1><p>Paragraph with <em>emphasis</em> and <strong>bold</strong>.</p><ul><li>Item</li></ul>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<h1>');
    expect(result).toContain('<em>');
    expect(result).toContain('<strong>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
  });
});
```

**Step 2: Update import line**

Change the existing import at line 2:
```javascript
import { escapeHtml, sanitizeHtml, stripHtml } from '../../scripts/utils/HtmlUtils.mjs';
```

**Step 3: Run tests**

Run: `npx vitest run tests/utils/HtmlUtils.test.js --reporter=verbose 2>&1 | tail -30`
Expected: All PASS

**Step 4: Commit**

```bash
git add tests/utils/HtmlUtils.test.js
git commit -m "test(utils): add comprehensive sanitizeHtml test coverage"
```

---

## Task 8: Add Tests for main.mjs Extractable Functions

**Files:**
- Modify: `scripts/main.mjs` (export `resolveHtmlElement`, `injectValidationButton`)
- Create: `tests/main.test.js`

**Step 1: Export the functions**

In `scripts/main.mjs`, change the function declarations to named exports. At the bottom of the file (before the closing), add:

```javascript
// Export for testing
export { resolveHtmlElement, injectValidationButton, VALIDATION_RESET_DELAY_MS };
```

**Step 2: Write tests**

Create `tests/main.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveHtmlElement, injectValidationButton, VALIDATION_RESET_DELAY_MS } from '../scripts/main.mjs';

describe('resolveHtmlElement', () => {
  it('should return HTMLElement as-is', () => {
    const el = document.createElement('div');
    expect(resolveHtmlElement(el)).toBe(el);
  });

  it('should unwrap jQuery-like array', () => {
    const el = document.createElement('div');
    const jq = [el];
    expect(resolveHtmlElement(jq)).toBe(el);
  });

  it('should return non-element input as-is', () => {
    expect(resolveHtmlElement('string')).toBe('string');
    expect(resolveHtmlElement(null)).toBe(null);
  });
});

describe('injectValidationButton', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    const inputWrapper = document.createElement('div');
    const input = document.createElement('input');
    input.name = 'vox-chronicle.testKey';
    inputWrapper.appendChild(input);
    container.appendChild(inputWrapper);
  });

  it('should inject a button next to the input', () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.testKey', 'test', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Test Connection');
  });

  it('should not inject when input is missing', () => {
    injectValidationButton(container, 'nonexistent', 'test', vi.fn());
    const buttons = container.querySelectorAll('.vox-chronicle-validate-button');
    expect(buttons.length).toBe(0);
  });

  it('should call validateFn on click', async () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.testKey', 'test', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    button.click();
    await vi.waitFor(() => expect(validateFn).toHaveBeenCalled());
  });

  it('should show check icon on success', async () => {
    const validateFn = vi.fn().mockResolvedValue(true);
    injectValidationButton(container, 'vox-chronicle.testKey', 'test', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    button.click();

    await vi.waitFor(() => {
      const icon = button.querySelector('i');
      expect(icon.className).toContain('fa-check');
    });
  });

  it('should show times icon on failure', async () => {
    const validateFn = vi.fn().mockResolvedValue(false);
    injectValidationButton(container, 'vox-chronicle.testKey', 'test', validateFn);

    const button = container.querySelector('.vox-chronicle-validate-button');
    button.click();

    await vi.waitFor(() => {
      const icon = button.querySelector('i');
      expect(icon.className).toContain('fa-times');
    });
  });
});

describe('VALIDATION_RESET_DELAY_MS', () => {
  it('should be a positive number', () => {
    expect(VALIDATION_RESET_DELAY_MS).toBeGreaterThan(0);
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run tests/main.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS (may need mock adjustments for imports — the Hooks and game globals need mocking)

**Step 4: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 5: Commit**

```bash
git add scripts/main.mjs tests/main.test.js
git commit -m "test(main): add unit tests for extractable utility functions"
```

---

## Task 9: Bundle vis-network Locally

**Files:**
- Create: `scripts/vendor/vis-network.min.js`
- Modify: `scripts/ui/RelationshipGraph.mjs:522-547`
- Modify: `build.sh` (include vendor/ in ZIP)

**Step 1: Download vis-network**

```bash
curl -o scripts/vendor/vis-network.min.js 'https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js'
```

**Step 2: Update RelationshipGraph to load locally**

Replace the CDN loading in `_loadVisLibrary()` (lines 522-547) with:

```javascript
  async _loadVisLibrary() {
    if (typeof vis !== 'undefined') {
      RelationshipGraph.#visLoaded = true;
      return;
    }

    if (!RelationshipGraph.#visLoadPromise) {
      this._logger.debug('Loading vis-network library from local bundle...');
      RelationshipGraph.#visLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `modules/vox-chronicle/scripts/vendor/vis-network.min.js`;
        script.onload = () => {
          RelationshipGraph.#visLoaded = true;
          resolve();
        };
        script.onerror = () => reject(new Error('vis-network library failed to load'));
        document.head.appendChild(script);
      });
    }

    await RelationshipGraph.#visLoadPromise;
    this._logger.debug('vis-network library loaded');
  }
```

**Step 3: Update build.sh**

Ensure `scripts/vendor/` is included. Check `build.sh` — if it uses `find scripts/`, vendor/ will be included automatically.

**Step 4: Run tests**

Run: `npx vitest run tests/ui/RelationshipGraph.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/vendor/vis-network.min.js scripts/ui/RelationshipGraph.mjs
git commit -m "feat(ui): bundle vis-network locally to eliminate CDN dependency"
```

---

## Task 10: Create ErrorNotificationHelper

**Files:**
- Create: `scripts/utils/ErrorNotificationHelper.mjs`
- Create: `tests/utils/ErrorNotificationHelper.test.js`

**Step 1: Write tests**

Create `tests/utils/ErrorNotificationHelper.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorNotificationHelper } from '../../scripts/utils/ErrorNotificationHelper.mjs';

describe('ErrorNotificationHelper', () => {
  beforeEach(() => {
    globalThis.ui = { notifications: { error: vi.fn(), warn: vi.fn() } };
    globalThis.game = {
      i18n: {
        format: vi.fn((key, data) => `${key}: ${data?.error || ''}`),
        localize: vi.fn((key) => key)
      }
    };
  });

  describe('notify', () => {
    it('should call ui.notifications.error with sanitized message', () => {
      const error = new Error('Something <b>broke</b>');
      ErrorNotificationHelper.notify('transcription', error);
      expect(ui.notifications.error).toHaveBeenCalledTimes(1);
      const msg = ui.notifications.error.mock.calls[0][0];
      expect(msg).not.toContain('<b>');
    });

    it('should use i18n format when available', () => {
      const error = new Error('API timeout');
      ErrorNotificationHelper.notify('transcription', error);
      expect(game.i18n.format).toHaveBeenCalled();
    });

    it('should handle missing ui object gracefully', () => {
      delete globalThis.ui;
      expect(() => {
        ErrorNotificationHelper.notify('test', new Error('fail'));
      }).not.toThrow();
    });

    it('should truncate very long error messages', () => {
      const longMsg = 'x'.repeat(1000);
      const error = new Error(longMsg);
      ErrorNotificationHelper.notify('test', error);
      const msg = ui.notifications.error.mock.calls[0][0];
      expect(msg.length).toBeLessThan(600);
    });
  });
});
```

**Step 2: Create the helper**

Create `scripts/utils/ErrorNotificationHelper.mjs`:

```javascript
/**
 * ErrorNotificationHelper - Consistent user-facing error notifications
 *
 * @module vox-chronicle
 */

import { escapeHtml } from './HtmlUtils.mjs';

const MAX_ERROR_LENGTH = 500;

class ErrorNotificationHelper {
  /**
   * Show a sanitized error notification to the user
   *
   * @param {string} category - Error category (e.g., 'transcription', 'kanka', 'image')
   * @param {Error} error - The error object
   * @param {Object} [options={}] - Options
   * @param {string} [options.context] - Additional context
   * @param {boolean} [options.warn=false] - Use warning instead of error
   */
  static notify(category, error, options = {}) {
    const safeMessage = escapeHtml(
      String(error?.message || 'Unknown error').substring(0, MAX_ERROR_LENGTH)
    );

    const i18nKey = `VOXCHRONICLE.Errors.${category.charAt(0).toUpperCase() + category.slice(1)}`;
    const message = globalThis.game?.i18n?.format(i18nKey, { error: safeMessage })
      || `VoxChronicle: ${safeMessage}`;

    const notifyFn = options.warn
      ? globalThis.ui?.notifications?.warn
      : globalThis.ui?.notifications?.error;

    notifyFn?.call(globalThis.ui?.notifications, message);
  }
}

export { ErrorNotificationHelper };
```

**Step 3: Run tests**

Run: `npx vitest run tests/utils/ErrorNotificationHelper.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 4: Commit**

```bash
git add scripts/utils/ErrorNotificationHelper.mjs tests/utils/ErrorNotificationHelper.test.js
git commit -m "feat(utils): create ErrorNotificationHelper for consistent error notifications"
```

---

## Task 11: Complete German Translations

**Files:**
- Modify: `lang/de.json`

**Step 1: Identify all untranslated keys**

```bash
grep -c '\[EN\]' lang/de.json
```

**Step 2: Translate all keys with `[EN]` prefix**

Replace each `[EN] English text` value with proper German translation. Use professional German UI terminology. Remove all `[EN]` prefixes.

**Step 3: Verify no `[EN]` prefixes remain**

```bash
grep '\[EN\]' lang/de.json | wc -l
```
Expected: 0

**Step 4: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 5: Commit**

```bash
git add lang/de.json
git commit -m "i18n(de): complete German translations (~320 keys)"
```

---

## Task 12: Add Cross-Service Integration Tests

**Files:**
- Create: `tests/integration/session-workflow.test.js`

**Step 1: Write integration test**

Create `tests/integration/session-workflow.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionOrchestrator, SessionState } from '../../scripts/orchestration/SessionOrchestrator.mjs';

// Test the full workflow: start -> record -> stop -> transcribe -> extract -> publish
describe('Session Workflow Integration', () => {
  let orchestrator;
  let mockRecorder;
  let mockTranscription;
  let mockEntityProcessor;
  let mockKankaPublisher;

  beforeEach(() => {
    // Set up mocks for all services
    mockRecorder = {
      startRecording: vi.fn().mockResolvedValue(undefined),
      stopRecording: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' })),
      cancel: vi.fn(),
      isRecording: false
    };
    mockTranscription = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'The party enters the dungeon.',
        segments: [{ speaker: 'SPEAKER_00', text: 'The party enters the dungeon.', start: 0, end: 2 }]
      })
    };
    mockEntityProcessor = {
      extractEntities: vi.fn().mockResolvedValue([
        { name: 'Dungeon', type: 'location', description: 'A dark dungeon' }
      ])
    };
    mockKankaPublisher = {
      publish: vi.fn().mockResolvedValue({ success: true, published: 1 })
    };

    orchestrator = new SessionOrchestrator({
      audioRecorder: mockRecorder,
      transcriptionProcessor: mockTranscription,
      entityProcessor: mockEntityProcessor,
      kankaPublisher: mockKankaPublisher
    });
  });

  it('should create session with valid state on start', async () => {
    await orchestrator.startSession({ title: 'Test Session' });
    expect(orchestrator.isSessionActive).toBe(true);
    expect(orchestrator.currentSession.title).toBe('Test Session');
    expect(mockRecorder.startRecording).toHaveBeenCalled();
  });

  it('should transition through states correctly', async () => {
    const states = [];
    orchestrator.onStateChange = (state) => states.push(state);

    await orchestrator.startSession({ title: 'Test Session' });
    expect(states).toContain(SessionState.RECORDING);
  });

  it('should propagate errors from recording start', async () => {
    mockRecorder.startRecording.mockRejectedValue(new Error('Microphone denied'));
    await expect(orchestrator.startSession({ title: 'Test' })).rejects.toThrow('Microphone denied');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run tests/integration/session-workflow.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/session-workflow.test.js
git commit -m "test(integration): add cross-service session workflow tests"
```

---

## Task 13: Extract Shared BaseAPIClient

**Files:**
- Create: `scripts/api/BaseAPIClient.mjs`
- Create: `tests/api/BaseAPIClient.test.js`
- Modify: `scripts/ai/OpenAIClient.mjs`
- Modify: `scripts/kanka/KankaClient.mjs`
- Modify: `tests/ai/OpenAIClient.test.js`
- Modify: `tests/kanka/KankaClient.test.js`

**Context:** 7 methods are 100% identical between OpenAIClient (lines 201, 240, 255, 268, 627, 858, 865) and KankaClient (lines 211, 280, 295, 308, 440, 741, 748): `baseUrl` getter, `_buildJsonHeaders()`, `_buildUrl()`, `_createTimeoutController()`, `post()`, `getRateLimiterStats()`, `resetRateLimiter()`. Plus `_buildAuthHeaders()` which differs only in error class/type.

**Step 1: Write BaseAPIClient tests**

Create `tests/api/BaseAPIClient.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAPIClient } from '../../scripts/api/BaseAPIClient.mjs';

class TestClient extends BaseAPIClient {
  constructor(apiKey) {
    super({
      apiKey,
      baseUrl: 'https://test.api.com/v1',
      timeout: 30000,
      loggerName: 'TestClient',
      authErrorMessage: 'Test API key not configured',
    });
  }
}

describe('BaseAPIClient', () => {
  let client;

  beforeEach(() => {
    client = new TestClient('test-key-123');
  });

  describe('baseUrl', () => {
    it('should return configured base URL', () => {
      expect(client.baseUrl).toBe('https://test.api.com/v1');
    });
  });

  describe('_buildUrl', () => {
    it('should concatenate base URL and endpoint', () => {
      expect(client._buildUrl('/test')).toBe('https://test.api.com/v1/test');
    });

    it('should add leading slash if missing', () => {
      expect(client._buildUrl('test')).toBe('https://test.api.com/v1/test');
    });
  });

  describe('_buildAuthHeaders', () => {
    it('should include Bearer token', () => {
      const headers = client._buildAuthHeaders();
      expect(headers.Authorization).toBe('Bearer test-key-123');
    });

    it('should throw when no API key', () => {
      const noKeyClient = new TestClient('');
      expect(() => noKeyClient._buildAuthHeaders()).toThrow('Test API key not configured');
    });
  });

  describe('_buildJsonHeaders', () => {
    it('should include content type and auth', () => {
      const headers = client._buildJsonHeaders();
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Authorization).toBe('Bearer test-key-123');
    });
  });

  describe('_createTimeoutController', () => {
    it('should create AbortController with timeout', () => {
      const controller = client._createTimeoutController(5000);
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.timeoutId).toBeDefined();
      clearTimeout(controller.timeoutId);
    });
  });
});
```

**Step 2: Create BaseAPIClient**

Create `scripts/api/BaseAPIClient.mjs`:

```javascript
/**
 * BaseAPIClient - Shared base class for API clients
 *
 * Provides common functionality: URL building, auth headers, timeout management,
 * rate limiter stats. Used by OpenAIClient and KankaClient.
 *
 * @class BaseAPIClient
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

class BaseAPIClient {
  constructor(options = {}) {
    this._apiKey = options.apiKey || '';
    this._baseUrl = options.baseUrl || '';
    this._timeout = options.timeout || 30000;
    this._logger = Logger.createChild(options.loggerName || 'BaseAPIClient');
    this._authErrorMessage = options.authErrorMessage || 'API key not configured';
    this._AuthErrorClass = options.AuthErrorClass || Error;
    this._authErrorType = options.authErrorType || 'authentication_error';
    this._rateLimiter = options.rateLimiter || null;
  }

  get baseUrl() {
    return this._baseUrl;
  }

  _buildAuthHeaders() {
    if (!this._apiKey) {
      throw new this._AuthErrorClass(
        this._authErrorMessage,
        this._authErrorType
      );
    }
    return { Authorization: `Bearer ${this._apiKey}` };
  }

  _buildJsonHeaders() {
    return {
      ...this._buildAuthHeaders(),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  _buildUrl(endpoint) {
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this._baseUrl}${normalizedEndpoint}`;
  }

  _createTimeoutController(timeout) {
    const controller = new AbortController();
    const timeoutMs = timeout || this._timeout;
    const timeoutId = setTimeout(() => { controller.abort(); }, timeoutMs);
    controller.timeoutId = timeoutId;
    return controller;
  }

  getRateLimiterStats() {
    return this._rateLimiter?.getStats() || null;
  }

  resetRateLimiter() {
    this._rateLimiter?.reset();
  }
}

export { BaseAPIClient };
```

**Step 3: Update OpenAIClient to extend BaseAPIClient**

In `scripts/ai/OpenAIClient.mjs`:
- Add import: `import { BaseAPIClient } from '../api/BaseAPIClient.mjs';`
- Change class declaration: `class OpenAIClient extends BaseAPIClient {`
- In constructor, call super with the shared options
- Remove the 7 duplicated methods (keep all OpenAI-specific methods)

**Step 4: Update KankaClient to extend BaseAPIClient**

Same pattern as OpenAIClient. Note: KankaClient uses `_apiToken` instead of `_apiKey` — pass it as `apiKey` to super.

**Step 5: Run full test suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/api/BaseAPIClient.mjs tests/api/BaseAPIClient.test.js scripts/ai/OpenAIClient.mjs scripts/kanka/KankaClient.mjs tests/ai/OpenAIClient.test.js tests/kanka/KankaClient.test.js
git commit -m "refactor(api): extract BaseAPIClient from OpenAIClient and KankaClient (~195 shared lines)"
```

---

## Final: Version Bump and Release

**Step 1: Update module.json**

Bump version from `3.2.5` to `3.3.0` (significant refactoring + new features).

**Step 2: Run full test suite one last time**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

**Step 3: Build and release**

```bash
bash build.sh
git add module.json
git commit -m "chore: bump version to 3.3.0"
git push
gh release create v3.3.0 releases/vox-chronicle-v3.3.0.zip module.json --title "v3.3.0 — Quality roadmap: 12 improvements" --latest
```
