# Codebase Concerns

**Analysis Date:** 2026-02-28

## Tech Debt

### AIAssistant God Object (Architectural)

**Issue:** The AIAssistant class has grown to 1614 lines despite refactoring to extract SilenceMonitor and PromptBuilder. It still handles:
- Contextual suggestion generation (narration, dialogue, action, reference types)
- Off-track detection and severity analysis
- Rules question detection and extraction
- Conversation history management (20 entry max)
- RAG context retrieval with consecutive failure tracking
- Session state tracking and context caching

**Files:** `scripts/narrator/AIAssistant.mjs` (1614 lines)

**Impact:** Difficult to test individual concerns; high cognitive load when modifying suggestion logic; mixing of RAG retrieval with prompt construction makes changes error-prone.

**Fix approach:** Decompose into:
1. `SuggestionGenerator.mjs` — Rules question detection + suggestion type selection
2. `OffTrackAnalyzer.mjs` — Off-track detection + severity scoring
3. Reduce AIAssistant to orchestrator role only

---

### SessionOrchestrator Complex State Machine (Architectural)

**Issue:** SessionOrchestrator manages 9 distinct states (IDLE, RECORDING, PAUSED, PROCESSING, EXTRACTING, GENERATING_IMAGES, PUBLISHING, COMPLETE, ERROR + 3 LIVE_* states). State transitions are scattered across 1359 lines with complex guard conditions:
- `_isStopping` flag to prevent concurrent stop calls
- `_liveCycleTimer` requiring manual cleanup
- `_liveMode` boolean flag separate from state enum
- Session data held as plain object (`_currentSession`)

**Files:** `scripts/orchestration/SessionOrchestrator.mjs` (1359 lines), `scripts/ui/MainPanel.mjs` (797 lines uses StateChange callbacks)

**Impact:** Risk of invalid state transitions; difficult to reason about concurrent live mode + chronicle mode; testing state machines requires extensive mocking.

**Fix approach:**
1. Explicit state transition methods: `_transitionTo(newState)` validates before changing
2. Move live cycle timer into dedicated `LiveModeManager` class
3. Extract `Session` class to encapsulate session data instead of plain object
4. Use TypeScript enum-based state machine (future v4.0 rewrite)

---

### Session State Not Persistent (Data Persistence)

**Issue:** All session data is held in memory (`_currentSession` plain object in SessionOrchestrator, `_conversationHistory` in AIAssistant). Reloading the Foundry page during an active session **loses all state**:
- Recording progress lost
- Transcription partial results discarded
- Extracted entities cleared
- Generated images removed from memory (not persisted to Kanka until publish)

**Files:** `scripts/orchestration/SessionOrchestrator.mjs` (line 59: `_currentSession = null`), `scripts/narrator/AIAssistant.mjs` (line 145: `_conversationHistory = []`)

**Impact:** Users cannot recover from browser crash during recording; mid-session refresh loses session context entirely; no audit trail of recorded sessions.

**Fix approach:**
1. Persist session metadata to Foundry world data: `game.settings.set('vox-chronicle', 'activeSession', sessionData)`
2. Store audio blobs in IndexedDB (with size limits, auto-cleanup)
3. Resume session on page reload: `await orchestrator.resumeSession(sessionId)`
4. Add session recovery UI: "Previous session found — resume or discard?"

---

## Known Bugs

### CSS Namespace Collision Risk (HIGH — 214 Un-prefixed Classes)

**Issue:** 6 Handlebars templates use 214 CSS classes WITHOUT the `.vox-chronicle-` namespace:
- `speaker-labeling.hbs` — 21 classes: `speaker-row`, `btn-clear`, `form-description`, etc.
- `entity-preview.hbs` — 57 classes: `entity-row`, `section-header`, `preview-description`, etc.
- `relationship-graph.hbs` — 24 classes: `graph-error`, `graph-toolbar`, `legend-item`, etc.
- `vocabulary-manager.hbs` — 33 classes: `vocabulary-description`, `terms-list`, `term-item`, etc.
- `analytics-tab.hbs` — 48 classes: `analytics-section`, `stat-item`, `speaker-list`, etc.
- `journal-picker.hbs` — 31 classes: `picker-header`, `folder-tree`, `journal-item`, etc.

**Files:** `templates/*.hbs`, `styles/vox-chronicle.css`

**Impact:** High risk of CSS collisions with other modules or Foundry core styles (e.g., `entity-row` used by other systems). Maintainability issue: class name changes require coordination between template and CSS.

**Fix approach:** Bulk rename all 214 classes with `vox-chronicle-` prefix using regex. Example: `.entity-row` → `.vox-chronicle-entity-row` across all files. Run automated tests to verify no visual regressions.

---

### Error Messages from Kanka API Not Sanitized (Security — Medium)

**Issue:** KankaClient error handling constructs exception messages directly from API responses without HTML/script escaping:

```javascript
// scripts/kanka/KankaClient.mjs (line ~370)
throw new KankaError(
  `Kanka API error: ${response.message}`,  // Unsanitized!
  KankaErrorType.API_ERROR,
  response.status,
  { headers: response.headers }
);
```

If a Kanka API error message contains `<script>` or HTML entities, and that message is displayed in a notification or log, it could potentially execute injected code.

**Files:** `scripts/kanka/KankaClient.mjs` (line ~370)

**Impact:** MITM attack (if attacker intercepts Kanka API response) could inject scripts into error notifications. Low likelihood but high severity if exploited.

**Fix approach:** Wrap error message in `escapeHtml()` before using in exception:
```javascript
throw new KankaError(
  `Kanka API error: ${escapeHtml(response.message)}`,
  ...
);
```

---

### VoxChronicle Reinitialization Failure Not Reported to User (UX — Medium)

**Issue:** VoxChronicle.reinitialize() on settings change only logs failures; users are not notified if reinitialization fails:

```javascript
// scripts/core/VoxChronicle.mjs (line ~175)
try {
  await this.initialize();
} catch (error) {
  this._logger.error('Re-initialization failed after settings change:', error);
  // No ui.notifications.error() call!
}
```

Users won't know if their API key change failed to take effect.

**Files:** `scripts/core/VoxChronicle.mjs` (line ~175)

**Impact:** Silent failure: users think settings are applied but API calls still fail with old credentials.

**Fix approach:** Add error notification:
```javascript
} catch (error) {
  this._logger.error('Re-initialization failed:', error);
  ErrorNotificationHelper.notify('settings', error, {
    context: 'settings reinitialize',
    showDetails: true
  });
}
```

---

## Security Considerations

### API Key Masking in Logs (Implemented ✓)

**Status:** FIXED in v3.1.9

Settings.mjs applies `-webkit-text-security: disc` to mask API key inputs (line 38, 53, 517). SensitiveDataFilter strips keys from log output. No further action needed.

---

### Rate Limit Double-Pause (Fixed ✓)

**Status:** FIXED in v3.0.3

KankaClient now only processes rate limit headers on successful responses (200-299 status), preventing double-pause on error responses.

---

## Performance Bottlenecks

### RelationshipGraph Per-Type Filter O(n*m) (Low Priority)

**Issue:** RelationshipGraph.mjs (line ~295) filters entities by type in a nested loop:

```javascript
// Inefficient: O(n*m) where n = total entities, m = types
for (const type of ['characters', 'locations', 'items']) {
  const filtered = allEntities.filter(e => e.type === type);
  // Process each type separately
}
```

For 500 entities across 3 types, this scans 1500 times instead of once.

**Files:** `scripts/ui/RelationshipGraph.mjs` (line ~295)

**Impact:** Graph rendering slows with large entity counts (100+ entities). Negligible for typical sessions (20-40 entities).

**Fix approach:** Replace with single-pass count:
```javascript
const byType = allEntities.reduce((acc, e) => {
  acc[e.type] ??= [];
  acc[e.type].push(e);
  return acc;
}, {});
// Now access byType['characters'], byType['locations'], etc.
```

---

## Fragile Areas

### MainPanel Singleton Reference Staleness (Moderate)

**Issue:** MainPanel caches orchestrator reference at initialization:

```javascript
// scripts/ui/MainPanel.mjs (line ~93)
static getInstance() {
  if (!MainPanel.#instance) {
    MainPanel.#instance = new MainPanel(VoxChronicle.getInstance().orchestrator);
  }
  return MainPanel.#instance;
}
```

If `VoxChronicle.resetInstance()` is called (during testing or reinitialization), the cached orchestrator becomes stale. This was identified and partially fixed in v3.0.3, but the singleton reference pattern is still fragile.

**Files:** `scripts/ui/MainPanel.mjs` (constructor line ~40-50), `scripts/core/VoxChronicle.mjs` (line ~175 reinitialize)

**Impact:** Callbacks from old orchestrator still fire → render loops with wrong data; state desynchronization between UI and orchestrator.

**Safe modification:**
1. Always fetch orchestrator dynamically: `VoxChronicle.getInstance().orchestrator` instead of caching
2. Or: Add lifecycle hook: `MainPanel.resetInstance()` called before VoxChronicle.resetInstance()`

**Test coverage:** Memory leak regression tests exist (see TESTING.md), but staleness scenarios not explicitly covered.

---

### EntityPreview Batch Render Debouncing (Moderate)

**Issue:** EntityPreview uses debounced render during entity creation (`_debouncedRender` with 150ms delay). If user rapidly creates 50 entities, only the final state renders, potentially hiding intermediate failures:

```javascript
// scripts/ui/EntityPreview.mjs (line ~471)
this._debouncedRender();  // Fires only once after last call + 150ms
```

If entity #25 fails, user might not see the error indicator because the next entity (#26) was created immediately and the debounce is still active.

**Files:** `scripts/ui/EntityPreview.mjs` (line ~439-480)

**Impact:** Missed error notifications during rapid entity creation; harder to debug which entity failed if multiple are being created.

**Safe modification:** For critical operations (entity creation), render immediately instead of debouncing. Use debouncing only for non-critical updates (styling, animations).

**Test coverage:** Manual verification guide exists (see `specs/012-reduce-excessive-ui-re-renders-during-entity-creat/MANUAL_VERIFICATION_GUIDE.md`), but unit tests don't cover race conditions between debounce + failures.

---

### Audio Chunker Synchronous Blob Combination (Low Risk)

**Issue:** AudioChunker.mjs uses synchronous blob array slicing and concatenation:

```javascript
// scripts/audio/AudioChunker.mjs (line ~284)
// Previously marked as async but was synchronous
static _combineBlobs(chunks) {  // Removed async in v3.1.9
  const buffer = new Uint8Array(totalSize);
  // Synchronous copy into buffer
  return new Blob([buffer]);
}
```

If audio chunks sum to >100MB, the synchronous buffer copy blocks the main thread for ~100-500ms.

**Files:** `scripts/audio/AudioChunker.mjs` (line ~284-300)

**Impact:** UI freeze during session completion for very long sessions (4+ hours = ~2GB audio); noticeable on slower machines.

**Fix approach:** For >50MB combined blobs, use Web Workers to move the concatenation off main thread. Current implementation is acceptable for typical sessions (3-4 hours = ~500MB max).

---

### CacheManager True LRU Eviction (Fixed ✓)

**Status:** FIXED in v3.0.3

CacheManager now evicts by `lastAccessedAt` instead of FIFO insertion order, ensuring true LRU behavior.

---

## Test Coverage Gaps

### Live Mode Silence Detection Edge Cases (Gap: High Risk)

**Issue:** SilenceDetector relies on `_lastActivity` timestamp. Test coverage includes:
- Timer fires while recording paused ✓
- Multiple simultaneous suggestions don't stack ✓

But missing:
- Activity during silence detection should reset timer (partially tested, not exhaustively)
- Silence detection with network latency (transcription hangs) — what happens if transcription takes 60s but silence timer fires after 30s?
- Concurrent session + silence detection in live mode

**Files:** `scripts/narrator/SilenceDetector.mjs`, `scripts/narrator/AIAssistant.mjs` (line ~1500 integration)

**Risk:** Autonomous suggestions might fire while transcription is in-flight, causing double-transcript render or corrupted state.

**Priority:** Medium — only affects Live Mode, not Chronicle Mode. Typical sessions don't trigger silence unless session truly stalls.

---

### RAG Provider Failure Recovery (Gap: High Risk)

**Issue:** AIAssistant tracks `_consecutiveRAGFailures` and stops asking RAG after 3 failures. But test coverage doesn't include:
- What happens when RAG succeeds after failures? Does counter reset?
- If RAG provider is temporarily unavailable, user gets suggestions WITHOUT context (degraded mode working as designed, but not tested)
- RAGFlowProvider document parsing timeout (30s AbortController) — does UI get notified?

**Files:** `scripts/narrator/AIAssistant.mjs` (line ~100, 600-700 RAG retrieval), `scripts/rag/RAGFlowProvider.mjs` (line ~633 timeout)

**Risk:** Silent degradation — suggestions still fire but lack context, user doesn't know why quality dropped.

**Priority:** Medium — RAG is optional (has fallback), but quality impact is noticeable.

---

### KankaClient Rate Limit Recovery (Gap: Medium Risk)

**Issue:** KankaClient retries after 429 (rate limit) with 60s pause. Tested scenarios:
- Single 429 triggers pause + retry ✓
- Multiple entities being created sequentially handles pause ✓

Missing coverage:
- What if rate limit is hit during batch creation (Promise.allSettled)? Does batch halt and wait, or do some succeed while others fail?
- Token expiration after 364 days — does client detect and notify? (Currently it does per TODO.md v3.1.7)

**Files:** `scripts/kanka/KankaClient.mjs` (line ~100-150 retry logic), `scripts/kanka/KankaService.mjs` (line ~300 batch search)

**Risk:** Batch operations might partially succeed, leaving orphaned entities in Kanka.

**Priority:** Low — rare scenario (token expiration only after 1 year), batch operation failures are logged and reported.

---

## Scaling Limits

### Session Audio Size (Documented ⚠️)

**Current capacity:** 25MB per OpenAI API call; AudioChunker splits >25MB files into chunks.

**Practical limit:** ~4 hours of audio at typical quality (256 kbps VP9) = ~450MB total. Chunking handles this, but:
- 450MB upload takes ~30-60s per chunk (5G + 10Mbps upload)
- Storage in memory during processing (`_currentSession.audioBlob`) requires sufficient RAM
- No automatic cleanup of temporary chunks

**Impact:** Sessions >4 hours require manual chunking awareness; no warnings if approaching limit.

**Priority:** Low — typical D&D session is 3-4 hours. Longer sessions automatically chunk.

---

### Entity Extraction Token Cost (Documented ⚠️)

**Current capacity:** GPT-4o processes entire transcript in single call. At ~1.5 tokens/word:
- 50,000-word transcript (4-hour session) = ~75,000 tokens
- Cost: ~$0.30 for input + $0.60 for output = ~$0.90 per session

**Impact:** No token usage warnings; users can run expensive operations unknowingly.

**Fix approach:** Add token estimate before extraction: "This transcript (~{tokens} tokens) will cost ~${cost}. Continue?"

**Priority:** Low — cost is reasonable; nice-to-have transparency feature.

---

### Kanka API Rate Limit (Documented ✓)

**Current capacity:** 30 req/min (free) / 90 req/min (premium)

Batch entity creation with KankaEntityManager respects limits via RateLimiter. Ceiling is ~3-4 entities/min on free tier. Tested and working per v3.0.3 audit.

---

## Dependencies at Risk

### vis-network Pinned to v9.1.9 (Documented ✓)

**Status:** Pinned in package.json per v3.1.8. Latest version is v9.x (releases monthly).

**Risk:** Security updates for vis-network released after pin won't be applied. Example: if XSS is found in v9.1.10+, codebase won't get patch.

**Mitigation:** RelationshipGraph loads via CDN `<script>` tag (not npm), so updates apply at runtime from jsDelivr CDN. Pinning is for documentation purposes only.

**Fix approach:** Remove pin, test against v10.0.0 when released (breaking change risk low).

**Priority:** Low — actively maintained library; security issues are rare.

---

### OpenAI API Model Deprecation Risk (Unmitigated ⚠️)

**Current models:**
- `gpt-4o-transcribe-diarize` — Released Dec 2024, no EOL announced
- `gpt-4o-mini` — Stable, high-volume model
- `gpt-image-1` — Stable, latest DALL-E successor
- `text-embedding-3-small` — (future RAG usage)

**Risk:** OpenAI retires models on 12-month notice. If `gpt-4o-transcribe-diarize` is retired before v3.2 released, users will need API key migration.

**Impact:** Transcription stops working; module requires code change to migrate to new model.

**Mitigation:** Monitor OpenAI API changelog; add version compatibility matrix to CLAUDE.md.

**Fix approach:** Implement model versioning: allow fallback to `gpt-4o-turbo` if diarize model unavailable.

**Priority:** Medium — affects core functionality (transcription), but unlikely event.

---

## Missing Critical Features

### Session Recovery on Page Reload (Architectural Gap)

**Problem:** Session state is entirely lost if user reloads page during active recording/processing. No way to resume.

**Blocks:**
- Long recordings (>2 hours) cannot withstand browser updates
- Crashes during entity extraction lose all work-in-progress
- No audit trail of sessions for DMs to review

**Solution:** Implement session persistence (see "Session State Not Persistent" in Tech Debt section).

**Priority:** High — impacts reliability; users won't trust module for multi-hour sessions.

---

### Token Expiration Monitoring for Kanka (Partial ✓)

**Status:** Implemented in v3.1.7. KankaService warns users when token was created >350 days ago.

**Gap:** Warning shows once but doesn't appear in settings UI; users might miss it. No automatic refresh token flow (Kanka API doesn't support refresh tokens).

**Fix approach:** Add visual indicator in settings panel (red dot) warning token expires in {days} days.

**Priority:** Medium — affects users on year-long campaigns.

---

## Summary Table

| Concern | Severity | Status | Impact | Fix Effort |
|---------|----------|--------|--------|-----------|
| AIAssistant God Object | High | Tech Debt | Hard to test/modify | 4 days |
| SessionOrchestrator State Machine | High | Tech Debt | Risk of invalid transitions | 3 days |
| Session State Not Persistent | High | Bug | Lose work on reload | 3 days |
| CSS Namespace Collision (214 classes) | High | Bug | Risk collision with other modules | 2 hours |
| Kanka Error Message Sanitization | Medium | Security | Potential XSS if API compromised | 30 mins |
| VoxChronicle Reinit Silent Failure | Medium | Bug | Users don't know settings failed | 30 mins |
| MainPanel Stale Orchestrator | Medium | Bug | State desync in edge cases | 2 hours |
| EntityPreview Debounce Race | Medium | Bug | Missed error notifications | 2 hours |
| RelationshipGraph O(n*m) Filter | Low | Performance | Slow with 100+ entities | 1 hour |
| Live Mode Silence Detection Gaps | Medium | Testing Gap | Concurrent ops undefined | 1 day |
| RAG Failure Recovery Gaps | Medium | Testing Gap | Silent degradation mode | 1 day |
| Kanka Batch Operation Gaps | Low | Testing Gap | Partial failures possible | 4 hours |
| OpenAI Model Deprecation | Medium | Risk | Transcription breaks on sunset | 1 day |
| Session Recovery Feature | High | Missing | No way to resume after reload | 2 days |

---

*Concerns audit: 2026-02-28*
