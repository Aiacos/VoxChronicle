# HIGH/WARNING Audit Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 8 HIGH silent failures, 10 WARNING issues (i18n, bare catches, weak test assertions)

**Architecture:** Two categories: (A) Add user notifications to catch-log-continue patterns using `ui.notifications.warn()` for workflow degradation, (B) Fix i18n hardcoded strings, bare catches, and weak test assertions. No new files, no refactoring.

**Tech Stack:** JavaScript ES6 (.mjs), Vitest, Foundry VTT v13 API

---

## Task 1: Add user notifications to orchestration silent failures (H-1 through H-4)

**Files:**
- Modify: `scripts/orchestration/SessionOrchestrator.mjs` (lines 1065, 1161)
- Modify: `scripts/orchestration/EntityProcessor.mjs` (lines 124, 189)
- Modify: `scripts/orchestration/ImageProcessor.mjs` (line 142)
- Test: `tests/orchestration/SessionOrchestrator.test.js`
- Test: `tests/orchestration/EntityProcessor.test.js`
- Test: `tests/orchestration/ImageProcessor.test.js`

### H-1: SessionOrchestrator._liveCycle catch block (line 1065)

Add consecutive error tracking and user notification after 3 failures:

```javascript
// Add class field near other state fields:
_consecutiveLiveCycleErrors = 0;

// In _liveCycle catch block (line 1065), replace existing catch body:
} catch (error) {
  this._logger.error('Live cycle error:', error.message);
  this._consecutiveLiveCycleErrors++;
  if (this._currentSession) {
    this._currentSession.errors.push({
      stage: 'live_cycle',
      error: error.message,
      timestamp: Date.now()
    });
  }
  if (this._callbacks.onError) {
    this._callbacks.onError(error, 'live_cycle');
  }
  // Notify user after repeated failures
  if (this._consecutiveLiveCycleErrors === 3) {
    ui?.notifications?.warn(
      game.i18n?.localize('VOXCHRONICLE.Errors.LiveCycleRepeatedFailures') ||
      'VoxChronicle: Live transcription is experiencing repeated errors. Check your API key and connection.'
    );
  }
}
```

Reset the counter on success (add `this._consecutiveLiveCycleErrors = 0;` after a successful transcription result, around line 1040 after the result check).

### H-2: SessionOrchestrator._runAIAnalysis catch block (line 1161)

Add user notification for AI analysis failures:

```javascript
} catch (error) {
  this._logger.error(`AI analysis error: ${error.message}`);
  if (this._callbacks.onError) {
    this._callbacks.onError(error, 'ai_analysis');
  }
  // Notify user once about AI analysis failure
  if (!this._aiAnalysisErrorNotified) {
    this._aiAnalysisErrorNotified = true;
    ui?.notifications?.warn(
      game.i18n?.localize('VOXCHRONICLE.Errors.AIAnalysisFailed') ||
      'VoxChronicle: AI suggestions unavailable. Check your OpenAI API key.'
    );
  }
}
```

Add class field: `_aiAnalysisErrorNotified = false;`
Reset in `startLiveMode()`: `this._aiAnalysisErrorNotified = false;`

### H-3: EntityProcessor.extractEntities catch block (line 124)

Add `ui.notifications.warn` to the catch:

```javascript
} catch (error) {
  const extractionMs = Date.now() - extractionStart;
  this._logger.error(`Entity extraction failed after ${extractionMs}ms:`, error);
  this._reportProgress(0, game.i18n?.localize('VOXCHRONICLE.Errors.EntityExtractionFailed') || 'Entity extraction failed');
  ui?.notifications?.warn(
    game.i18n?.localize('VOXCHRONICLE.Errors.EntityExtractionFailed') ||
    'VoxChronicle: Entity extraction failed. Entities will not be available for this session.'
  );
  return null;
}
```

### H-3b: EntityProcessor.extractRelationships catch block (line 189)

```javascript
} catch (error) {
  const relMs = Date.now() - relStart;
  this._logger.error(`Relationship extraction failed after ${relMs}ms:`, error);
  ui?.notifications?.warn(
    game.i18n?.localize('VOXCHRONICLE.Errors.RelationshipExtractionFailed') ||
    'VoxChronicle: Relationship extraction failed.'
  );
  return [];
}
```

### H-4: ImageProcessor.generateImages catch block (line 142)

```javascript
} catch (error) {
  const totalMs = Date.now() - totalStart;
  this._logger.error(`Image generation failed after ${totalMs}ms:`, error);
  onProgress(0, `Image generation failed: ${error.message}`);
  ui?.notifications?.warn(
    game.i18n?.localize('VOXCHRONICLE.Errors.ImageGenerationFailed') ||
    'VoxChronicle: Image generation failed. Chronicle will be published without images.'
  );
  return [];
}
```

**Tests:** Add tests verifying `ui.notifications.warn` is called in error paths for each processor.

**Commit:**
```bash
git commit -m "fix: add user notifications to orchestration silent failures (H-1 to H-4)"
```

---

## Task 2: Add user notifications to RAG/AI silent failures (H-5 through H-8)

**Files:**
- Modify: `scripts/core/VoxChronicle.mjs` (line 434)
- Modify: `scripts/narrator/AIAssistant.mjs` (lines 1407, 1451, 1490, 1526, 1700)
- Modify: `scripts/rag/OpenAIFileSearchProvider.mjs` (line 387)
- Modify: `scripts/rag/RAGFlowProvider.mjs` (lines 429, 471)
- Test: corresponding test files

### H-5: VoxChronicle._initializeRAG catch block (line 434)

```javascript
} catch (error) {
  logger.error('Failed to initialize RAG services:', error);
  ui?.notifications?.warn(
    game.i18n?.localize('VOXCHRONICLE.Errors.RAGInitFailed') ||
    'VoxChronicle: RAG initialization failed. AI suggestions will work without campaign context.'
  );
}
```

### H-6: AIAssistant._getRAGContext catch block (line 1700)

Add consecutive failure tracking:

```javascript
// Add class field:
_consecutiveRAGFailures = 0;

// In _getRAGContext catch:
} catch (error) {
  this._logger.warn(`_getRAGContext() failed after ${(performance.now() - _ragStart).toFixed(1)}ms:`, error.message);
  this._consecutiveRAGFailures++;
  if (this._consecutiveRAGFailures === 3) {
    ui?.notifications?.warn(
      game.i18n?.localize('VOXCHRONICLE.Errors.RAGContextUnavailable') ||
      'VoxChronicle: RAG context unavailable. Suggestions may be less accurate.'
    );
  }
  return { context: '', sources: [] };
}
```

Reset `_consecutiveRAGFailures = 0` on success (before the `return result` on line 1698).

### H-7/H-8: RAG provider bare catches — add error variable and logging

**OpenAIFileSearchProvider.mjs line 387:**
```javascript
} catch (error) {
  this.#logger.warn('Vector store validation failed:', error.message);
  return false;
}
```

**RAGFlowProvider.mjs line 429:**
```javascript
} catch (error) {
  this.#logger.warn('Dataset validation failed:', error.message);
  return false;
}
```

**RAGFlowProvider.mjs line 471:**
```javascript
} catch (error) {
  this.#logger.warn('Chat validation failed:', error.message);
  return false;
}
```

### H-7b: AIAssistant parse methods — capture error variable (lines 1407, 1451, 1490, 1526)

Replace all four bare `catch {` blocks with `catch (error) {` and log the error:

```javascript
// _parseAnalysisResponse line 1407:
} catch (error) {
  this._logger.warn('Failed to parse analysis response as JSON, using fallback:', error.message);
  // ... rest stays the same

// _parseOffTrackResponse line 1451:
} catch (error) {
  this._logger.warn('Failed to parse off-track response, returning default:', error.message);
  // ... rest stays the same

// _parseSuggestionsResponse line 1490:
} catch (error) {
  this._logger.warn('Failed to parse suggestions response:', error.message);
  // ... rest stays the same

// _parseNPCDialogueResponse line 1526:
} catch (error) {
  this._logger.warn('Failed to parse NPC dialogue response:', error.message);
  // ... rest stays the same
```

**Commit:**
```bash
git commit -m "fix: add user notifications to RAG/AI silent failures, capture bare catch errors (H-5 to H-8)"
```

---

## Task 3: Fix hardcoded English strings in main.mjs and UI files (W-1 through W-4)

**Files:**
- Modify: `scripts/main.mjs` (lines 61, 75, 89, 103, 165)
- Modify: `scripts/ui/MainPanel.mjs` (line 40)
- Modify: `scripts/ui/EntityPreview.mjs` (lines 807, 844, 881)

Replace hardcoded strings with `game.i18n?.localize()` with `||` fallback:

### main.mjs lines 61, 75, 89, 103:
```javascript
// Line 61:
ui.notifications?.error(game.i18n?.localize('VOXCHRONICLE.Errors.FailedToOpenPanel') || 'VoxChronicle: Failed to open panel. Check console.');
// Line 75:
ui.notifications?.error(game.i18n?.localize('VOXCHRONICLE.Errors.FailedToOpenSpeakerLabeling') || 'VoxChronicle: Failed to open speaker labeling. Check console.');
// Line 89:
ui.notifications?.error(game.i18n?.localize('VOXCHRONICLE.Errors.FailedToOpenVocabularyManager') || 'VoxChronicle: Failed to open vocabulary manager. Check console.');
// Line 103:
ui.notifications?.error(game.i18n?.localize('VOXCHRONICLE.Errors.FailedToOpenRelationshipGraph') || 'VoxChronicle: Failed to open relationship graph. Check console.');
```

### main.mjs line 165:
```javascript
ui.notifications?.error(game.i18n?.localize('VOXCHRONICLE.Errors.FailedToInitialize') || 'VoxChronicle: Failed to initialize module. Check console for details.');
```

### MainPanel.mjs line 40 (window title):
Change `title: 'VoxChronicle'` to `title: 'VOXCHRONICLE.Panel.Title'` (Foundry auto-localizes ApplicationV2 titles).

### EntityPreview.mjs lines 807, 844, 881:
```javascript
// Line 807:
this._progress.message = game.i18n?.format('VOXCHRONICLE.EntityPreview.CreatingEntity', { type: 'character', name }) || `Creating character: ${name}`;
// Line 844:
this._progress.message = game.i18n?.format('VOXCHRONICLE.EntityPreview.CreatingEntity', { type: 'location', name }) || `Creating location: ${name}`;
// Line 881:
this._progress.message = game.i18n?.format('VOXCHRONICLE.EntityPreview.CreatingEntity', { type: 'item', name }) || `Creating item: ${name}`;
```

**Do NOT add keys to lang files yet** — that's a separate task to avoid merge conflicts across 8 files.

**Commit:**
```bash
git commit -m "fix(i18n): replace hardcoded English strings with game.i18n.localize + fallbacks"
```

---

## Task 4: Add i18n keys to all 8 lang files (W-1 through W-4 completion)

**Files:**
- Modify: `lang/en.json`, `lang/it.json`, `lang/de.json`, `lang/es.json`, `lang/fr.json`, `lang/ja.json`, `lang/pt.json`, `lang/template.json`

Add the following keys to the `VOXCHRONICLE.Errors` and `VOXCHRONICLE.Panel` sections of **all 8 files**:

For `en.json` (English — provide real translations):
```json
"Errors": {
  "FailedToOpenPanel": "VoxChronicle: Failed to open panel. Check console.",
  "FailedToOpenSpeakerLabeling": "VoxChronicle: Failed to open speaker labeling. Check console.",
  "FailedToOpenVocabularyManager": "VoxChronicle: Failed to open vocabulary manager. Check console.",
  "FailedToOpenRelationshipGraph": "VoxChronicle: Failed to open relationship graph. Check console.",
  "FailedToInitialize": "VoxChronicle: Failed to initialize module. Check console for details.",
  "LiveCycleRepeatedFailures": "VoxChronicle: Live transcription is experiencing repeated errors. Check your API key and connection.",
  "AIAnalysisFailed": "VoxChronicle: AI suggestions unavailable. Check your OpenAI API key.",
  "EntityExtractionFailed": "VoxChronicle: Entity extraction failed. Entities will not be available for this session.",
  "RelationshipExtractionFailed": "VoxChronicle: Relationship extraction failed.",
  "ImageGenerationFailed": "VoxChronicle: Image generation failed. Chronicle will be published without images.",
  "RAGInitFailed": "VoxChronicle: RAG initialization failed. AI suggestions will work without campaign context.",
  "RAGContextUnavailable": "VoxChronicle: RAG context unavailable. Suggestions may be less accurate."
},
"Panel": {
  "Title": "VoxChronicle"
},
"EntityPreview": {
  "CreatingEntity": "Creating {type}: {name}"
}
```

For other languages, use the English text as value (same approach as existing keys).
For `template.json`, use empty strings `""` as values.

**Commit:**
```bash
git commit -m "feat(i18n): add error notification and UI label keys to all 8 lang files"
```

---

## Task 5: Fix bare catches and add debug logging (W-5 through W-8)

**Files:**
- Modify: `scripts/core/VoxChronicle.mjs` (line 281) — add logging to `_getSetting`
- Modify: `scripts/audio/AudioRecorder.mjs` (lines 1102, 1115) — add debug logging to empty catches
- Modify: `scripts/ui/VocabularyManager.mjs` (line ~559) — wrap clipboard fallback
- Modify: `scripts/ui/MainPanel.mjs` (lines 268, 312, 519, 566) — add debug logging to bare catches

### VoxChronicle._getSetting (line 281):
```javascript
} catch (error) {
  this._logger.debug(`Failed to get setting '${key}':`, error.message);
  return null;
}
```

### AudioRecorder._cleanupAudioAnalysis (lines 1102, 1115):
```javascript
// line 1102:
} catch (error) {
  this._logger.debug('sourceNode.disconnect cleanup:', error.message);
}
// line 1115:
} catch (error) {
  this._logger.debug('audioContext.close cleanup:', error.message);
}
```

### VocabularyManager._onExport clipboard fallback (line ~559):
```javascript
try {
  await navigator.clipboard.writeText(json);
  ui.notifications.info(/* existing */);
} catch {
  try {
    document.execCommand('copy');
    ui.notifications.info(/* existing */);
  } catch (fallbackError) {
    this._logger.error('Clipboard write failed:', fallbackError.message);
    ui.notifications.error(
      game.i18n?.localize('VOXCHRONICLE.Errors.ClipboardFailed') || 'Failed to copy to clipboard.'
    );
  }
}
```

### MainPanel bare catches (lines 268, 312, 519, 566):
Add `this._logger.debug(...)` to each bare catch. Example:
```javascript
// line 268:
} catch (error) {
  this._logger.debug('Could not read ragEnabled setting:', error.message);
}
```

**Commit:**
```bash
git commit -m "fix: add debug logging to bare catches, wrap clipboard fallback (W-5 to W-8)"
```

---

## Task 6: Fix weak test assertions in OpenAIClient and KankaClient (T-2, T-3)

**Files:**
- Modify: `tests/ai/OpenAIClient.test.js` (lines 315-411)
- Modify: `tests/kanka/KankaClient.test.js` (lines 338-575)

For each test that uses `try/catch` without `expect.assertions()`, add `expect.assertions(N)` at the top of the test, where N is the number of `expect()` calls inside the catch block. This ensures the test fails if the promise resolves instead of rejecting.

Example pattern:
```javascript
// BEFORE:
it('should handle 429 rate limit error', async () => {
  try {
    await client.request('/models', { useQueue: false, useRetry: false });
  } catch (err) {
    expect(err).toBeInstanceOf(OpenAIError);
    expect(err.type).toBe(OpenAIErrorType.RATE_LIMIT_ERROR);
  }
});

// AFTER:
it('should handle 429 rate limit error', async () => {
  expect.assertions(2);
  try {
    await client.request('/models', { useQueue: false, useRetry: false });
  } catch (err) {
    expect(err).toBeInstanceOf(OpenAIError);
    expect(err.type).toBe(OpenAIErrorType.RATE_LIMIT_ERROR);
  }
});
```

Count the `expect()` calls in each catch block and add the corresponding `expect.assertions(N)`.

**Commit:**
```bash
git commit -m "fix(test): add expect.assertions to try/catch error tests for stronger guarantees"
```

---

## Task 7: Final verification

**Step 1:** Run full test suite: `npm test`
Expected: All tests pass, 0 unhandled errors

**Step 2:** Verify no regressions: `git diff --stat`

---

## Summary

| Task | Category | Fix Count | Files |
|------|----------|-----------|-------|
| 1 | HIGH: Orchestration notifications | 5 | SessionOrchestrator, EntityProcessor, ImageProcessor |
| 2 | HIGH: RAG/AI notifications + bare catches | 8 | VoxChronicle, AIAssistant, OpenAIFileSearchProvider, RAGFlowProvider |
| 3 | WARNING: i18n hardcoded strings | 10 | main.mjs, MainPanel, EntityPreview |
| 4 | WARNING: i18n lang file keys | 8 files | lang/*.json |
| 5 | WARNING: Bare catches + clipboard | 8 | VoxChronicle, AudioRecorder, VocabularyManager, MainPanel |
| 6 | TEST: Weak assertions | ~15 tests | OpenAIClient.test.js, KankaClient.test.js |
| 7 | Verification | — | — |
