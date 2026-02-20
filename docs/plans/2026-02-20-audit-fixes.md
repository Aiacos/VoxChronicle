# Audit Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 7 CRITICAL bugs and 13 IMPORTANT issues found in the 2026-02-20 audit

**Architecture:** Surgical fixes to existing files — no new files, no refactoring beyond the specific bugs

**Tech Stack:** JavaScript ES6 (.mjs), Vitest, Foundry VTT v13 API

---

## Task 1: Fix XSS in EntityPreview textarea (C-1)

**Files:**
- Modify: `scripts/ui/EntityPreview.mjs:13-14` (add import)
- Modify: `scripts/ui/EntityPreview.mjs:1174` (escape output)
- Test: `tests/ui/EntityPreview.test.js`

**Step 1: Write the failing test**

In `tests/ui/EntityPreview.test.js`, add inside the existing `_showEditDialog` describe block:

```javascript
it('should escape HTML in entity description to prevent XSS', async () => {
  const panel = createTestInstance();
  panel._entities = [{ name: 'Test', type: 'character', description: '</textarea><script>alert("XSS")</script>' }];

  // Call the method that builds the dialog HTML
  const dialogSpy = vi.fn();
  globalThis.Dialog = vi.fn().mockImplementation((config) => {
    dialogSpy(config.content);
    return { render: vi.fn() };
  });

  await panel._showEditDialog('Test', '</textarea><script>alert("XSS")</script>');

  const htmlContent = dialogSpy.mock.calls[0][0];
  expect(htmlContent).not.toContain('</textarea><script>');
  expect(htmlContent).toContain('&lt;/textarea&gt;');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/EntityPreview.test.js -t "should escape HTML"`
Expected: FAIL — textarea contains raw `</textarea><script>`

**Step 3: Implement the fix**

In `scripts/ui/EntityPreview.mjs`, add import at line 14:
```javascript
import { escapeHtml } from '../utils/HtmlUtils.mjs';
```

At line 1174, change:
```javascript
// OLD:
<textarea name="description" rows="6" style="width: 100%;">${currentDescription || ''}</textarea>
// NEW:
<textarea name="description" rows="6" style="width: 100%;">${escapeHtml(currentDescription || '')}</textarea>
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/EntityPreview.test.js -t "should escape HTML"`
Expected: PASS

**Step 5: Run full EntityPreview tests**

Run: `npx vitest run tests/ui/EntityPreview.test.js`
Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/ui/EntityPreview.mjs tests/ui/EntityPreview.test.js
git commit -m "fix(security): escape HTML in EntityPreview textarea to prevent XSS"
```

---

## Task 2: Implement missing batchCreateRelations in KankaService (C-2)

**Files:**
- Modify: `scripts/kanka/KankaService.mjs` (add method before closing `}`)
- Test: `tests/kanka/KankaService.test.js`

**Step 1: Write the failing test**

In `tests/kanka/KankaService.test.js`, add:

```javascript
describe('batchCreateRelations', () => {
  it('should create relations for a source entity sequentially', async () => {
    const relations = [
      { target_id: 10, relation: 'ally', attitude: 3 },
      { target_id: 20, relation: 'enemy', attitude: -2 }
    ];

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 1, owner_id: 5, target_id: 10, relation: 'ally' } }), headers: new Headers() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 2, owner_id: 5, target_id: 20, relation: 'enemy' } }), headers: new Headers() });

    const results = await service.batchCreateRelations(5, relations);
    expect(results).toHaveLength(2);
    expect(results[0].target_id).toBe(10);
    expect(results[1].target_id).toBe(20);
    expect(results.every(r => !r._error)).toBe(true);
  });

  it('should continue on error when continueOnError is true', async () => {
    const relations = [
      { target_id: 10, relation: 'ally' },
      { target_id: 20, relation: 'enemy' }
    ];

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ message: 'Validation failed' }), headers: new Headers() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 2, owner_id: 5, target_id: 20, relation: 'enemy' } }), headers: new Headers() });

    const results = await service.batchCreateRelations(5, relations, { continueOnError: true });
    expect(results).toHaveLength(2);
    expect(results[0]._error).toBeDefined();
    expect(results[1].target_id).toBe(20);
  });

  it('should call onProgress callback', async () => {
    const onProgress = vi.fn();
    const relations = [{ target_id: 10, relation: 'ally' }];

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 1 } }), headers: new Headers() });

    await service.batchCreateRelations(5, relations, { onProgress });
    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kanka/KankaService.test.js -t "batchCreateRelations"`
Expected: FAIL — `batchCreateRelations is not a function`

**Step 3: Implement the method**

Add to `scripts/kanka/KankaService.mjs` before the closing `}` of the class (before line 1565):

```javascript
  /**
   * Batch create entity relations for a source entity
   *
   * Kanka API: POST /campaigns/{id}/entities/{entity_id}/relations
   * Each relation requires: target_id, relation (label string), and optional attitude.
   *
   * @param {number} sourceEntityId - The Kanka entity ID that owns the relations
   * @param {Array<object>} relations - Array of relation objects ({target_id, relation, attitude})
   * @param {object} [options] - Options
   * @param {boolean} [options.continueOnError=true] - Continue creating if one fails
   * @param {Function} [options.onProgress] - Progress callback (current, total)
   * @returns {Promise<Array<object>>} Array of created relations (or {_error} for failures)
   */
  async batchCreateRelations(sourceEntityId, relations, options = {}) {
    const continueOnError = options.continueOnError ?? true;
    const onProgress = options.onProgress || (() => {});
    const results = [];

    for (let i = 0; i < relations.length; i++) {
      const rel = relations[i];
      try {
        const endpoint = `/campaigns/${this._campaignId}/entities/${sourceEntityId}/relations`;
        const payload = {
          target_id: rel.target_id,
          relation: rel.relation || 'related',
          attitude: rel.attitude ?? 0
        };

        const response = await this.post(endpoint, payload);
        results.push(response.data || response);
        onProgress(i + 1, relations.length);
      } catch (error) {
        this._logger.error(`Failed to create relation ${rel.relation} -> ${rel.target_id}: ${error.message}`);
        if (continueOnError) {
          results.push({ _error: error.message, relation: rel.relation, target_id: rel.target_id });
          onProgress(i + 1, relations.length);
        } else {
          throw error;
        }
      }
    }

    return results;
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/kanka/KankaService.test.js -t "batchCreateRelations"`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/kanka/KankaService.mjs tests/kanka/KankaService.test.js
git commit -m "feat(kanka): implement batchCreateRelations for entity relationship creation"
```

---

## Task 3: Fix race condition in stopLiveMode (C-3)

**Files:**
- Modify: `scripts/orchestration/SessionOrchestrator.mjs:928-974`
- Test: `tests/orchestration/SessionOrchestrator.test.js`

**Step 1: Write the failing test**

```javascript
it('should handle concurrent stopLiveMode calls safely', async () => {
  await orchestrator.startLiveMode(liveOptions);

  // Call stop twice concurrently
  const [result1, result2] = await Promise.all([
    orchestrator.stopLiveMode(),
    orchestrator.stopLiveMode()
  ]);

  // Both should return session data, endSession should only be called once
  expect(result1).toBeDefined();
  expect(result2).toBeDefined();
  // Verify analytics endSession was called only once
  expect(mockAnalytics.endSession).toHaveBeenCalledTimes(1);
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — `endSession` called twice

**Step 3: Implement the fix**

In `scripts/orchestration/SessionOrchestrator.mjs`, add field to class:
```javascript
_isStopping = false;
```

Modify `stopLiveMode()`:
```javascript
async stopLiveMode() {
  if (!this._liveMode && !this._isStopping) {
    this._logger.warn('stopLiveMode called but live mode is not active, ignoring');
    return this._currentSession;
  }
  if (this._isStopping) {
    this._logger.debug('stopLiveMode already in progress, returning current session');
    return this._currentSession;
  }

  this._isStopping = true;
  this._logger.log('Stopping live mode...');
  this._liveMode = false;
  const stopStart = Date.now();

  if (this._liveCycleTimer) {
    clearTimeout(this._liveCycleTimer);
    this._liveCycleTimer = null;
  }

  try {
    if (this._sessionAnalytics) {
      this._sessionAnalytics.endSession();
      this._logger.debug('Analytics session ended');
    }

    const audioBlob = await this._audioRecorder.stopRecording();
    if (this._currentSession) {
      this._currentSession.endTime = Date.now();
      this._currentSession.audioBlob = audioBlob;
      if (this._liveTranscript.length > 0) {
        this._currentSession.transcript = {
          text: this._liveTranscript.map(s => s.text).join(' '),
          segments: this._liveTranscript,
          language: this._currentSession.language
        };
      }
    }

    this._updateState(SessionState.IDLE);
    const segmentCount = this._liveTranscript.length;
    const duration = this._currentSession ? this._getSessionDuration() : 0;
    const stopMs = Date.now() - stopStart;
    this._logger.log(`Live mode stopped (${segmentCount} segments, ${duration}s duration, shutdown: ${stopMs}ms)`);
    return this._currentSession;
  } catch (error) {
    this._logger.error('Failed to stop live mode:', error);
    this._handleError(error, 'stopLiveMode');
    throw error;
  } finally {
    this._isStopping = false;
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/orchestration/SessionOrchestrator.test.js`
Expected: All tests pass

**Step 5: Commit**

```bash
git add scripts/orchestration/SessionOrchestrator.mjs tests/orchestration/SessionOrchestrator.test.js
git commit -m "fix(orchestrator): prevent race condition in concurrent stopLiveMode calls"
```

---

## Task 4: Fix permanent notification leak in Settings validation (C-4)

**Files:**
- Modify: `scripts/core/Settings.mjs:792-922`
- Test: `tests/core/Settings.test.js`

**Step 1: Write the failing test**

```javascript
it('should remove loading notification even when import throws', async () => {
  const mockNotif = { remove: vi.fn() };
  globalThis.ui.notifications = {
    info: vi.fn().mockReturnValue(mockNotif),
    error: vi.fn()
  };
  Settings._isOpenAIConfigured = vi.fn().mockReturnValue(true);
  // Force dynamic import to throw
  vi.spyOn(Settings, 'isOpenAIConfigured').mockReturnValue(true);

  // Mock import to throw
  const originalImport = globalThis.import;

  let caught = false;
  try {
    await Settings.validateOpenAIKey();
  } catch (e) {
    caught = true;
  }

  // The loading notification must be removed regardless of error
  expect(mockNotif.remove).toHaveBeenCalled();
});
```

**Step 2: Implement the fix**

Refactor `validateOpenAIKey()` to use try/finally for notification cleanup:

```javascript
static async validateOpenAIKey() {
  if (!Settings.isOpenAIConfigured()) {
    ui.notifications?.error(game.i18n.localize('VOXCHRONICLE.Validation.OpenAIKeyNotConfigured'));
    return false;
  }

  const loadingNotif = ui.notifications?.info(
    game.i18n.localize('VOXCHRONICLE.Validation.ValidatingOpenAI'),
    { permanent: true }
  );

  try {
    const { VoxChronicle } = await import('./VoxChronicle.mjs');
    const voxChronicle = VoxChronicle.getInstance();

    let isValid;
    if (!voxChronicle.transcriptionService) {
      const { OpenAIClient } = await import('../ai/OpenAIClient.mjs');
      const apiKey = Settings.get('openaiApiKey');
      const tempClient = new OpenAIClient(apiKey);
      isValid = await tempClient.validateApiKey();
    } else {
      isValid = await voxChronicle.transcriptionService.validateApiKey();
    }

    if (isValid) {
      ui.notifications?.info(game.i18n.localize('VOXCHRONICLE.Validation.OpenAIKeyValid'));
    } else {
      ui.notifications?.error(game.i18n.localize('VOXCHRONICLE.Validation.OpenAIKeyInvalid'));
    }
    return isValid;
  } catch (error) {
    ui.notifications?.error(
      game.i18n.format('VOXCHRONICLE.Validation.OpenAIValidationError', { error: error.message })
    );
    logger.error('OpenAI API key validation error:', error);
    return false;
  } finally {
    loadingNotif?.remove();
  }
}
```

Apply the same `try/finally` pattern to `validateKankaToken()`.

**Step 3: Run tests**

Run: `npx vitest run tests/core/Settings.test.js`
Expected: All pass

**Step 4: Commit**

```bash
git add scripts/core/Settings.mjs tests/core/Settings.test.js
git commit -m "fix(settings): ensure loading notification is always removed in validation methods"
```

---

## Task 5: Fix timeout leak in OpenAIClient._makeRequest (C-5)

**Files:**
- Modify: `scripts/ai/OpenAIClient.mjs:645-700`
- Test: `tests/ai/OpenAIClient.test.js`

**Step 1: Write the failing test**

```javascript
it('should clear timeout if rate limiter throws before fetch', async () => {
  const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

  // Make rate limiter throw
  client._rateLimiter.executeWithRetry = vi.fn().mockRejectedValue(new Error('limiter error'));

  await expect(client._makeRequest('/test', { method: 'GET' })).rejects.toThrow('limiter error');

  // Timeout should have been cleared
  expect(clearTimeoutSpy).toHaveBeenCalled();
  clearTimeoutSpy.mockRestore();
});
```

**Step 2: Implement the fix**

Wrap the `_rateLimiter.executeWithRetry` call with an outer try/finally to guarantee timeout cleanup:

```javascript
// Create timeout controller
const controller = this._createTimeoutController(options.timeout);

try {
  // Execute request with rate limiting
  return await this._rateLimiter.executeWithRetry(async () => {
    // ... existing inner try/catch logic (keep clearTimeout calls inside for fast cleanup)
  });
} finally {
  // Guarantee timeout cleanup even if rate limiter itself throws
  clearTimeout(controller.timeoutId);
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/ai/OpenAIClient.test.js`
Expected: All pass

**Step 4: Commit**

```bash
git add scripts/ai/OpenAIClient.mjs tests/ai/OpenAIClient.test.js
git commit -m "fix(openai): guarantee timeout cleanup with outer try/finally in _makeRequest"
```

---

## Task 6: Fix MainPanel singleton ignoring updated orchestrator (C-6)

**Files:**
- Modify: `scripts/ui/MainPanel.mjs:84-89`
- Test: `tests/ui/MainPanel.test.js`

**Step 1: Write the failing test**

```javascript
it('should update orchestrator reference on subsequent getInstance calls', () => {
  const orch1 = { name: 'orch1' };
  const orch2 = { name: 'orch2' };

  const panel1 = MainPanel.getInstance(orch1);
  expect(panel1._orchestrator).toBe(orch1);

  const panel2 = MainPanel.getInstance(orch2);
  expect(panel2).toBe(panel1); // Same instance
  expect(panel2._orchestrator).toBe(orch2); // Updated reference
});
```

**Step 2: Implement the fix**

```javascript
static getInstance(orchestrator) {
  if (!MainPanel.#instance) {
    MainPanel.#instance = new MainPanel(orchestrator);
  } else if (orchestrator && MainPanel.#instance._orchestrator !== orchestrator) {
    MainPanel.#instance._orchestrator = orchestrator;
  }
  return MainPanel.#instance;
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/ui/MainPanel.test.js`
Expected: All pass

**Step 4: Commit**

```bash
git add scripts/ui/MainPanel.mjs tests/ui/MainPanel.test.js
git commit -m "fix(ui): update orchestrator reference on subsequent MainPanel.getInstance calls"
```

---

## Task 7: Fix AbortController reuse across retries in KankaClient (C-7)

**Files:**
- Modify: `scripts/kanka/KankaClient.mjs:455-550`
- Test: `tests/kanka/KankaClient.test.js`

**Step 1: Write the failing test**

```javascript
it('should create fresh AbortController for each retry attempt', async () => {
  let fetchCallCount = 0;
  globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      throw new Error('TypeError: fetch failed');
    }
    return { ok: true, json: async () => ({ data: { id: 1 } }), headers: new Headers() };
  });

  // The second attempt should NOT be using an already-timed-out controller
  // If AbortController is shared, the signal may already be aborted
  const result = await client.request('/test-endpoint');
  expect(result.data.id).toBe(1);
});
```

**Step 2: Implement the fix**

Move AbortController creation inside the closure passed to `executeWithRetry`:

```javascript
return this._rateLimiter.executeWithRetry(async () => {
  const controller = this._createTimeoutController(options.timeout);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    clearTimeout(controller.timeoutId);
    // ... rest of success path
  } catch (error) {
    clearTimeout(controller.timeoutId);
    // ... rest of error path
  }
});
```

Remove the outer `controller` creation at line 456. Update `fetchOptions` to not include `signal` (it's set per-retry now).

**Step 3: Run tests**

Run: `npx vitest run tests/kanka/KankaClient.test.js`
Expected: All pass

**Step 4: Commit**

```bash
git add scripts/kanka/KankaClient.mjs tests/kanka/KankaClient.test.js
git commit -m "fix(kanka): create fresh AbortController per retry attempt"
```

---

## Task 8: Fix _onApiKeyChange to actually reinitialize services (I-1)

**Files:**
- Modify: `scripts/core/Settings.mjs:640-647`
- Test: `tests/core/Settings.test.js`

**Step 1: Implement the fix**

```javascript
static _onApiKeyChange(service) {
  if (game.ready) {
    const serviceName = service === 'openai' ? 'OpenAI' : 'Kanka';
    ui.notifications?.info(
      game.i18n?.format('VOXCHRONICLE.Settings.ApiKeyUpdated', { service: serviceName }) ||
      `VoxChronicle: ${serviceName} API key updated. Re-initializing services...`
    );

    // Actually reinitialize services with new credentials
    import('./VoxChronicle.mjs').then(({ VoxChronicle }) => {
      VoxChronicle.resetInstance();
      VoxChronicle.getInstance().initialize().catch(err => {
        logger.error(`Failed to reinitialize after ${serviceName} key change:`, err);
      });
    }).catch(err => {
      logger.error('Failed to import VoxChronicle for reinitialization:', err);
    });
  }
}
```

**Step 2: Run tests**

Run: `npx vitest run tests/core/Settings.test.js`

**Step 3: Commit**

```bash
git add scripts/core/Settings.mjs tests/core/Settings.test.js
git commit -m "fix(settings): actually reinitialize services when API keys change"
```

---

## Task 9: Fix TranscriptionService options mutation (I-2)

**Files:**
- Modify: `scripts/ai/TranscriptionService.mjs:180` (start of `transcribe` method)
- Test: `tests/ai/TranscriptionService.test.js`

**Step 1: Write the failing test**

```javascript
it('should not mutate the caller options object', async () => {
  const options = { prompt: 'My custom prompt', language: 'en' };
  const optionsCopy = { ...options };

  // Setup mock for diarize model that strips prompt
  service._model = 'gpt-4o-transcribe-diarize';

  try { await service.transcribe(new Blob(['audio']), options); } catch {}

  // Original options should be unchanged
  expect(options).toEqual(optionsCopy);
});
```

**Step 2: Implement the fix**

At the start of `transcribe()`, add shallow copy:
```javascript
async transcribe(audioBlob, options = {}) {
  options = { ...options }; // Prevent mutation of caller's object
  // ... rest of method
```

**Step 3: Run tests**

Run: `npx vitest run tests/ai/TranscriptionService.test.js`

**Step 4: Commit**

```bash
git add scripts/ai/TranscriptionService.mjs tests/ai/TranscriptionService.test.js
git commit -m "fix(transcription): shallow copy options to prevent caller mutation"
```

---

## Task 10: Fix CacheManager LRU claim (uses FIFO) (I-3)

**Files:**
- Modify: `scripts/utils/CacheManager.mjs`
- Test: `tests/utils/CacheManager.test.js`

**Step 1: Implement the fix**

Add `lastAccessedAt` tracking in `get()` and use it in `_trim()`:

In `set()`: add `lastAccessedAt: Date.now()` to the entry.

In `get()`: update `entry.lastAccessedAt = Date.now()`.

In `_trim()`: sort by `lastAccessedAt` instead of `createdAt`.

**Step 2: Run tests**

Run: `npx vitest run tests/utils/CacheManager.test.js`

**Step 3: Commit**

```bash
git add scripts/utils/CacheManager.mjs tests/utils/CacheManager.test.js
git commit -m "fix(cache): implement true LRU eviction using lastAccessedAt timestamps"
```

---

## Task 11: Fix EntityPreview retry not filtering created entities (I-4)

**Files:**
- Modify: `scripts/ui/EntityPreview.mjs:1119-1127`
- Test: `tests/ui/EntityPreview.test.js`

**Step 1: Implement the fix**

```javascript
_onRetry(event) {
  event.preventDefault();
  this._logger.log('Retrying failed entities');

  // Filter to only entities that failed (exclude already-created ones)
  if (this._results.created?.length > 0) {
    const createdNames = new Set(this._results.created.map(e => e.name?.toLowerCase()));
    this._entities = this._entities.filter(e => !createdNames.has(e.name?.toLowerCase()));
    // Reset selections to match filtered entities
    this._selections = {};
    for (const entity of this._entities) {
      this._selections[entity.name] = true;
    }
  }

  this._mode = PreviewMode.REVIEW;
  this._results = { created: [], failed: [] };
  this.render();
}
```

**Step 2: Run tests**

Run: `npx vitest run tests/ui/EntityPreview.test.js`

**Step 3: Commit**

```bash
git add scripts/ui/EntityPreview.mjs tests/ui/EntityPreview.test.js
git commit -m "fix(entity-preview): filter already-created entities on retry to prevent duplicates"
```

---

## Task 12: Fix OpenAIClient isRetryable null coercion (I-12)

**Files:**
- Modify: `scripts/ai/OpenAIClient.mjs:82`
- Test: `tests/ai/OpenAIClient.test.js`

**Step 1: Implement the fix**

```javascript
get isRetryable() {
  return (
    this.type === OpenAIErrorType.RATE_LIMIT_ERROR ||
    this.type === OpenAIErrorType.NETWORK_ERROR ||
    this.type === OpenAIErrorType.TIMEOUT_ERROR ||
    (this.status !== null && this.status >= 500 && this.status < 600)
  );
}
```

**Step 2: Run tests**

Run: `npx vitest run tests/ai/OpenAIClient.test.js`

**Step 3: Commit**

```bash
git add scripts/ai/OpenAIClient.mjs tests/ai/OpenAIClient.test.js
git commit -m "fix(openai): add explicit null guard in isRetryable status check"
```

---

## Task 13: Fix ImageGenerationService loadGallery array validation (I-11)

**Files:**
- Modify: `scripts/ai/ImageGenerationService.mjs:539`
- Test: `tests/ai/ImageGenerationService.test.js`

**Step 1: Implement the fix**

```javascript
async loadGallery() {
  try {
    const gallery = game.settings.get(MODULE_ID, 'imageGallery');
    this._gallery = Array.isArray(gallery) ? gallery : [];
    return this._gallery;
  } catch (error) {
    // ...existing catch
  }
}
```

**Step 2: Run tests**

Run: `npx vitest run tests/ai/ImageGenerationService.test.js`

**Step 3: Commit**

```bash
git add scripts/ai/ImageGenerationService.mjs tests/ai/ImageGenerationService.test.js
git commit -m "fix(images): validate gallery setting is an Array in loadGallery"
```

---

## Task 14: Fix RelationshipGraph _initializeGraph not awaited (I-7)

**Files:**
- Modify: `scripts/ui/RelationshipGraph.mjs:346`
- Test: `tests/ui/RelationshipGraph.test.js`

**Step 1: Implement the fix**

```javascript
// In _onRender, where _initializeGraph is called:
if (this._mode === GraphMode.READY) {
  this._initializeGraph().catch(err => {
    this._logger.error('Graph initialization failed:', err);
    this._mode = GraphMode.ERROR;
    this.render();
  });
}
```

**Step 2: Run tests**

Run: `npx vitest run tests/ui/RelationshipGraph.test.js`

**Step 3: Commit**

```bash
git add scripts/ui/RelationshipGraph.mjs tests/ui/RelationshipGraph.test.js
git commit -m "fix(graph): catch unhandled promise rejection from async _initializeGraph"
```

---

## Task 15: Fix RateLimiter test unhandled rejections (T-1)

**Files:**
- Modify: `tests/utils/RateLimiter.test.js:254-299`

**Step 1: Fix the test**

Add `.catch(() => {})` to fire-and-forget promises before `reset()`:

```javascript
// Before calling reset(), ensure all promises have rejection handlers
p1.catch(() => {});
p2.catch(() => {});
p3.catch(() => {});
smallQueue.reset();
```

**Step 2: Run tests**

Run: `npx vitest run tests/utils/RateLimiter.test.js`
Expected: 0 unhandled rejection errors

**Step 3: Run full suite to confirm zero errors**

Run: `npm test`
Expected: All pass, 0 unhandled errors

**Step 4: Commit**

```bash
git add tests/utils/RateLimiter.test.js
git commit -m "fix(test): handle promise rejections in RateLimiter test to eliminate unhandled errors"
```

---

## Task 16: Fix KankaClient rate limit double-pause on 429 (I-6)

**Files:**
- Modify: `scripts/kanka/KankaClient.mjs:484-497`

**Step 1: Implement the fix**

Move `_handleRateLimitHeaders` to only run on successful responses:

```javascript
// After response.ok check — move this line:
// this._handleRateLimitHeaders(response);  // REMOVE from line 485

// Add AFTER the ok check succeeds:
if (!response.ok) {
  // ... error handling (existing)
}

// Parse and return JSON response
this._handleRateLimitHeaders(response); // Only for successful responses
const data = await response.json();
```

**Step 2: Run tests**

Run: `npx vitest run tests/kanka/KankaClient.test.js`

**Step 3: Commit**

```bash
git add scripts/kanka/KankaClient.mjs tests/kanka/KankaClient.test.js
git commit -m "fix(kanka): only process rate limit headers on successful responses"
```

---

## Task 17: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All 3800+ tests pass, 0 unhandled errors

**Step 2: Verify no regressions**

Run: `git diff --stat`
Review changed files match only the fixes above.

**Step 3: Commit summary (if not already committed per-task)**

All commits should already be done per-task.

---

## Summary

| Task | Fix | Severity | Files |
|------|-----|----------|-------|
| 1 | XSS in EntityPreview textarea | CRITICAL | EntityPreview.mjs |
| 2 | Missing batchCreateRelations | CRITICAL | KankaService.mjs |
| 3 | Race condition in stopLiveMode | CRITICAL | SessionOrchestrator.mjs |
| 4 | Notification leak in validation | CRITICAL | Settings.mjs |
| 5 | Timeout leak in _makeRequest | CRITICAL | OpenAIClient.mjs |
| 6 | Stale orchestrator in MainPanel | CRITICAL | MainPanel.mjs |
| 7 | AbortController reuse in KankaClient | CRITICAL | KankaClient.mjs |
| 8 | _onApiKeyChange no reinit | IMPORTANT | Settings.mjs |
| 9 | Options mutation in transcribe | IMPORTANT | TranscriptionService.mjs |
| 10 | CacheManager FIFO not LRU | IMPORTANT | CacheManager.mjs |
| 11 | Retry shows already-created entities | IMPORTANT | EntityPreview.mjs |
| 12 | isRetryable null coercion | IMPORTANT | OpenAIClient.mjs |
| 13 | loadGallery array validation | IMPORTANT | ImageGenerationService.mjs |
| 14 | _initializeGraph not awaited | IMPORTANT | RelationshipGraph.mjs |
| 15 | RateLimiter test unhandled rejections | TEST | RateLimiter.test.js |
| 16 | Rate limit double-pause on 429 | IMPORTANT | KankaClient.mjs |
| 17 | Final verification | — | — |
