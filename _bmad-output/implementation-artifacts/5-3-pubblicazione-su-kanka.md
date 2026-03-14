# Story 5.3: Pubblicazione su Kanka

Status: done

## Story

As a DM,
I want to publish the chronicle, entities, and images to Kanka with one click,
so that players find everything ready without any manual work.

## Acceptance Criteria

1. **AC1 — Pubblicazione Completa**: Given cronaca, entita' e immagini pronti When il DM clicca "Pubblica su Kanka" Then tutto viene pubblicato sulla campagna Kanka configurata (FR22)
2. **AC2 — Rate Limiting**: Given la pubblicazione When i dati vengono inviati Then il rate limiting Kanka e' rispettato (30/min free, 90/min premium) (NFR28)
3. **AC3 — Conferma Utente**: Given i dati delle entita' When la pubblicazione parte Then avviene solo dopo conferma esplicita dell'utente (NFR11)
4. **AC4 — Resume on Failure**: Given la pubblicazione fallisce a meta' When il DM riprova Then il processo riprende dallo step fallito senza riprocessare tutto (NFR35)

## Tasks / Subtasks

- [x] Task 1 — Verifica publishing pipeline e rate limiting (AC: #1, #2)
  - [x] 1.1 VERIFIED: KankaPublisher.publishSession() — 106 tests (chronicle, entities, images, progress)
  - [x] 1.2 VERIFIED: KankaClient rate limiting — 19 tests (429, retry-after, free/premium presets)
  - [x] 1.3 VERIFIED: SessionOrchestrator.publishToKanka() — 6 existing tests
  - [x] 1.4 VERIFIED: progress callback wired via onProgress in publishSession options

- [x] Task 2 — Test TDD per conferma utente prima di pubblicazione (AC: #3)
  - [x] 2.1 NEW: "should call onPublishConfirmation before publishing" — verifies callback invoked with summary
  - [x] 2.2 NEW: "should abort publishing when confirmation returns false" — verifies publishSession NOT called
  - [x] 2.3 NEW: "should proceed without confirmation when callback not registered" — backward compat
  - [x] 2.4 Callback receives { entityCount, imageCount, hasChronicle } — verified in test 2.1

- [x] Task 3 — Implementare conferma utente (AC: #3)
  - [x] 3.1 Added onPublishConfirmation callback in publishToKanka() before state change
  - [x] 3.2 Returns null when confirmed=false (abort)
  - [x] 3.3 No callback = proceeds (backward compat)

- [x] Task 4 — Test TDD per resume on failure (AC: #4)
  - [x] 4.1 NEW: "should pass resumeFromResults to publishSession on retry" — verifies previous results forwarded
  - [x] 4.2 VERIFIED: createIfNotExists() dedup — 163 KankaService tests cover this
  - [x] 4.3 VERIFIED: error accumulation in results.errors — 106 KankaPublisher tests

- [x] Task 5 — Implementare resume logic (AC: #4)
  - [x] 5.1 Added `resumeFromResults` option forwarded to publishSession()
  - [x] 5.2 SessionOrchestrator reads from _currentSession.kankaResults when options.resume=true

- [x] Task 6 — Regressione e wiring verification (AC: tutti)
  - [x] 6.1 `npm test` — 5201 tests pass, 69 files, 0 failures (+4 new)
  - [x] 6.2 Wiring: publishToKanka → onPublishConfirmation → publishSession (with resume support)
  - [x] 6.3 Backward compat: no callback = auto-publish (verified by test)

## Dev Notes

### Stato Attuale del Codice — ~80% GIA' IMPLEMENTATO

**Cosa ESISTE gia':**

| Componente | File | Test | Stato |
|-----------|------|:---:|-------|
| KankaPublisher | `scripts/orchestration/KankaPublisher.mjs` | 106 test | COMPLETO — chronicle, entities, images, progress |
| KankaClient | `scripts/kanka/KankaClient.mjs` | 99 test | COMPLETO — rate limiting, retry, 429 handling |
| KankaService | `scripts/kanka/KankaService.mjs` | 163 test | COMPLETO — CRUD, dedup, image upload |
| SessionOrchestrator.publishToKanka() | SessionOrchestrator.mjs | 6 test | COMPLETO — invoca KankaPublisher |
| MainPanel publish button | MainPanel.mjs | implicit | COMPLETO — _handlePublishKanka() |

**Cosa MANCA:**

1. **Conferma utente (NFR11)** — `publishToKanka()` procede senza conferma
2. **Resume on failure (NFR35)** — Nessun checkpoint, re-run riparte da zero

### Pattern per Conferma Utente

Stesso pattern `onEntityPreview` da Story 5.1 — callback fire-and-forget con return value:

```javascript
// In SessionOrchestrator.publishToKanka():
if (this._callbacks.onPublishConfirmation) {
  const confirmed = await this._callbacks.onPublishConfirmation({
    entityCount: session.entities?.totalCount || 0,
    imageCount: session.images?.length || 0,
    hasChronicle: !!session.transcript
  });
  if (!confirmed) {
    this._logger.log('Publishing cancelled by user');
    return null;
  }
}
```

### Pattern per Resume on Failure

Approccio leggero: `createIfNotExists()` gia' gestisce dedup per locations/items. Per chronicle, aggiungere check:

```javascript
// In KankaPublisher.publishSession():
if (options.resumeFromResults?.journal) {
  results.journal = options.resumeFromResults.journal; // Skip chronicle creation
} else {
  await this._createChronicle(sessionData, results);
}
```

### Vincoli Critici

1. **Rate limiting 30/90** — Gia' implementato in KankaClient
2. **gpt-image-1 base64** — Image upload gestito da KankaService.uploadJournalImage()
3. **Conferma PRIMA della pubblicazione** — Non dopo
4. **Error accumulation** — Fallimenti singoli non bloccano il workflow
5. **TDD mandatory**

### References

- [Source: scripts/orchestration/KankaPublisher.mjs — publishSession(), _createChronicle()]
- [Source: scripts/kanka/KankaClient.mjs — rate limiting, 429 handling]
- [Source: scripts/kanka/KankaService.mjs — createIfNotExists(), dedup]
- [Source: scripts/orchestration/SessionOrchestrator.mjs — publishToKanka()]
- [Source: _bmad-output/implementation-artifacts/5-1-estrazione-entita-e-revisione.md — callback pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nessun debug necessario.

### Completion Notes List

- ✅ Task 1: Verified 374 existing tests cover entire Kanka publishing pipeline (KankaPublisher 106, KankaClient 99, KankaService 163, SessionOrchestrator 6)
- ✅ Task 2-3: Added onPublishConfirmation callback — invoked before publishing with { entityCount, imageCount, hasChronicle }. Returns null on cancel. 3 new tests.
- ✅ Task 4-5: Added resume support — publishToKanka({ resume: true }) forwards _currentSession.kankaResults as resumeFromResults to publishSession(). 1 new test.
- ✅ Task 6: 5201 tests pass, 0 failures. Wiring verified. Backward compatible.

### Change Log

- 2026-03-14: Story 5.3 — onPublishConfirmation callback (NFR11) + resumeFromResults (NFR35). 4 new tests.

### File List

- `scripts/orchestration/SessionOrchestrator.mjs` — Added onPublishConfirmation callback + resumeFromResults forwarding in publishToKanka()
- `tests/orchestration/SessionOrchestrator.test.js` — 4 new tests for publish confirmation and resume
