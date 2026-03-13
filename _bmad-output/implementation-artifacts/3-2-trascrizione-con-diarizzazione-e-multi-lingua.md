# Story 3.2: Trascrizione con Diarizzazione e Multi-Lingua

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want accurate transcriptions with speaker identification in my language,
So that I can review who said what during the session.

## Acceptance Criteria

1. **Given** un blob audio **When** viene inviato al TranscriptionProvider **Then** ritorna testo con segmenti speaker-labeled (SPEAKER_00, SPEAKER_01, etc.) (FR7)
2. **Given** un chunk audio di 30 secondi **When** viene trascritto **Then** la trascrizione completa entro 5 secondi (NFR4)
3. **Given** la lingua configurata (es. italiano) **When** la trascrizione viene eseguita **Then** il modello usa la lingua corretta (FR10, supporto 8+ lingue: en, it, de, es, fr, ja, pt + configurabili)
4. **Given** un vocabolario personalizzato configurato **When** la trascrizione viene eseguita **Then** i termini custom (nomi NPC, luoghi) vengono usati come context prompt per migliorare accuratezza (FR39)

## Tasks / Subtasks

- [x] Task 1: Collegare TranscriptionService al flusso SessionOrchestrator (AC: 1, 2)
  - [x] 1.1 Verificare che `TranscriptionProcessor.processAudio(blob)` invochi `TranscriptionService.transcribe()` con le opzioni corrette (model, language, speakerMap)
  - [x] 1.2 Aggiungere EventBus integration a `TranscriptionProcessor` — emissione eventi `ai:transcriptionStarted`, `ai:transcriptionReady`, `ai:transcriptionError`
  - [x] 1.3 Scrivere test TDD per il flusso blob → TranscriptionProcessor → TranscriptionService → provider
  - [x] 1.4 Verificare che il circuit breaker in TranscriptionService blocchi correttamente dopo N fallimenti consecutivi

- [x] Task 2: Multi-lingua con auto-detect e language tagging (AC: 3)
  - [x] 2.1 Verificare che il setting `transcriptionLanguage` venga letto e passato a `TranscriptionService.setLanguage()`
  - [x] 2.2 Verificare che il setting `multiLanguageMode` attivi `TranscriptionService.setMultiLanguageMode(true)`, omettendo il parametro language dalla chiamata API
  - [x] 2.3 Scrivere test TDD per: lingua esplicita passata al provider, multi-language omette language, language tagging sui segmenti
  - [x] 2.4 Verificare che `_tagSegmentsWithLanguage()` aggiunga correttamente il tag lingua a ciascun segmento

- [x] Task 3: Vocabolario personalizzato come context prompt (AC: 4)
  - [x] 3.1 Verificare che `VocabularyDictionary.generatePrompt()` produca un prompt con i nomi NPC, luoghi, oggetti dal setting `customVocabularyDictionary`
  - [x] 3.2 Verificare che il prompt venga passato a `TranscriptionService.transcribe()` SOLO per modelli non-diarize (gpt-4o-transcribe-diarize NON supporta prompt)
  - [x] 3.3 Scrivere test TDD per: prompt generato correttamente, prompt strippato per diarize model, prompt passato per whisper/gpt4o model
  - [x] 3.4 Verificare che il fallback funzioni quando `VocabularyDictionary` fallisce (log warning, continua senza prompt)

- [x] Task 4: Audio chunking e trascrizione multi-chunk (AC: 1, 2)
  - [x] 4.1 Verificare che `TranscriptionService._transcribeChunked()` gestisca correttamente audio >25MB
  - [x] 4.2 Verificare timestamp offsetting tra chunk (i timestamp di ogni chunk partono da 0, devono essere aggiustati)
  - [x] 4.3 Verificare speaker continuity tra chunk (stesso SPEAKER_XX = stessa persona)
  - [x] 4.4 Scrivere test TDD per: chunking trigger, timestamp merge, speaker dedup, onProgress callback

- [x] Task 5: Integration test end-to-end del flusso trascrizione (AC: 1, 2, 3, 4)
  - [x] 5.1 Test E2E: AudioRecorder.stop() → blob → TranscriptionProcessor → TranscriptionService → result con segmenti speaker
  - [x] 5.2 Test E2E: blob >25MB → chunking → merge → risultato unificato
  - [x] 5.3 Test E2E: configurazione lingua italiana → provider riceve language='it'
  - [x] 5.4 Test E2E: vocabolario custom → prompt incluso (non-diarize) o escluso (diarize)

- [x] Task 6: i18n — stringhe per tutti gli 8 file lingua (AC: tutti)
  - [x] 6.1 Aggiungere chiavi sotto `VOXCHRONICLE.Transcription.*` per: stati trascrizione, errori, progresso chunking
  - [x] 6.2 Aggiungere chiavi per messaggi EventBus (transcription started/ready/error)
  - [x] 6.3 Coprire tutti gli 8 file: en, it, de, es, fr, ja, pt, template

- [x] Task 7: Regressione completa (AC: tutti)
  - [x] 7.1 Eseguire `npm test` — tutti i test passano, 0 fallimenti (5114 test, 70 file)
  - [x] 7.2 Verificare che i 85 test TranscriptionService passano senza breaking changes
  - [x] 7.3 Verificare che i test AudioRecorder, AudioChunker (Story 3.1) non siano stati impattati

## Dev Notes

### Stato Attuale del Codice — GIA' FUNZIONANTE

**TranscriptionService.mjs (863 righe)** — COMPLETO e ben strutturato:
- Provider injection via `#provider` (composizione, non ereditarieta')
- `transcribe()` con circuit breaker, vocabulary prompt, multi-language mode
- `_transcribeSingle()` delega al provider con opzioni mappate
- `_transcribeChunked()` con timestamp offsetting e speaker continuity
- `_mapSpeakersToNames()` con edge case handling (no segments, unmapped speakers, Unknown fallback)
- `_tagSegmentsWithLanguage()` per tagging multi-lingua
- `setSpeakerMap()`, `setLanguage()`, `setMultiLanguageMode()` per configurazione runtime
- `resetCircuitBreaker()` e `getCircuitBreakerStatus()` per resilienza
- `transcribeBasic()` per trascrizione veloce senza diarizzazione
- `getSupportedLanguages()` con 10 lingue supportate
- `estimateCost()` per stima costi
- **97 test esistenti coprono gia' la maggior parte della logica**

**OpenAITranscriptionProvider.mjs (84 righe)** — COMPLETO:
- FormData per upload (NON JSON)
- Diarize model switching automatico
- Response format: `diarized_json` per diarize, `verbose_json` per standard
- Prompt stripping per diarize model
- Validazione audioBlob e options

**TranscriptionFactory.mjs (313 righe)** — COMPLETO:
- 3 modalita': API, LOCAL (Whisper), AUTO (local + API fallback)
- Health check per backend locale
- Raccomandazione modalita' basata su configurazione

**TranscriptionProcessor.mjs** — Da verificare/integrare:
- Orchestrazione del flusso audio → trascrizione
- Punto di integrazione con EventBus (target di questa story)

**Settings gia' registrate:**
- `transcriptionLanguage` — lingua trascrizione (world, default '')
- `transcriptionMode` — api/local/auto (world, default 'api')
- `whisperBackendUrl` — URL backend Whisper locale (world)
- `multiLanguageMode` — auto-detect lingua per segmento (world, default false)
- `transcriptionBatchDuration` — durata batch per live mode (world)
- `customVocabularyDictionary` — vocabolario custom per accuracy (world)

### ATTENZIONE: Cosa MANCA Realmente

La maggior parte della logica di trascrizione e' **gia' implementata** in `TranscriptionService.mjs`. Il focus di questa story e':

1. **Wiring**: Collegare TranscriptionProcessor → TranscriptionService → EventBus nel flusso reale
2. **Verifica**: Assicurarsi che tutti i path funzionino end-to-end (lingua, vocabolario, chunking, circuit breaker)
3. **EventBus integration**: Aggiungere emissione eventi `ai:transcription*` per il flusso live
4. **Test coverage**: Scrivere i test mancanti per i path non ancora coperti
5. **i18n**: Aggiungere le stringhe di localizzazione per i nuovi messaggi

NON reinventare la ruota. La logica in TranscriptionService.mjs e' matura e gia' testata.

### Pattern Architetturali da Seguire

**EventBus integration (pattern Story 2.4/3.1):**
```javascript
// Pattern opzionale — EventBus ricevuto nel costruttore
constructor(options = {}) {
  this.#eventBus = options.eventBus ?? null;
}
#emitSafe(channel, data) {
  try { this.#eventBus?.emit(channel, data); } catch (e) { this.logger.warn('EventBus emit failed:', e); }
}
```

**Canali EventBus per trascrizione (da architettura):**
- `ai:transcriptionStarted` — quando inizia la trascrizione
- `ai:transcriptionReady` — quando la trascrizione e' completa (con result)
- `ai:transcriptionError` — quando la trascrizione fallisce

**Provider injection pattern (gia' in uso):**
```javascript
// TranscriptionService riceve il provider nel costruttore
const provider = new OpenAITranscriptionProvider(apiKey);
const service = new TranscriptionService(provider, { defaultLanguage: 'it' });
const result = await service.transcribe(audioBlob);
```

**Diarization model constraint (CRITICO):**
```javascript
// gpt-4o-transcribe-diarize NON supporta il parametro 'prompt'
// TranscriptionService.transcribe() gia' gestisce questa logica:
if (isDiarizeModel && options.prompt) {
  delete options.prompt; // Stripped automaticamente
}
```

**Error isolation (lezione Epic 2 retro):**
- OGNI callback/handler wrappato in try-catch
- OGNI `.emit()` wrappato in `#emitSafe()`
- Circuit breaker gia' implementato in TranscriptionService

### Vincoli Critici

1. **Zero build step** — Import ES6+ nativi (.mjs), no transpiling
2. **25MB OpenAI limit** — AudioChunker DEVE dividere, TranscriptionService._transcribeChunked() gestisce il merge
3. **gpt-4o-transcribe-diarize** non supporta `prompt` — la logica e' gia' in TranscriptionService.transcribe()
4. **Speaker ID consistency** — SPEAKER_XX e' consistente all'interno di una singola chiamata API ma NON garantito tra chiamate diverse (chunk diversi)
5. **NFR4: 5s per 30s di audio** — performance constraint, non aggiungere overhead inutile
6. **Layer boundary** — orchestration/ puo' importare da ai/ e audio/, ma NOT viceversa
7. **FormData obbligatoria** — OpenAI transcription API richiede multipart/form-data, MAI JSON

### Testing Strategy

**TDD obbligatorio** (lezione Epic 2 retro):
1. **RED**: Scrivere test PRIMA dell'implementazione
2. **GREEN**: Implementare il minimo per far passare i test
3. **REFACTOR**: Pulire mantenendo test verdi

**Mock pattern per TranscriptionService:**
```javascript
// Mock provider (gia' usato nei 97 test esistenti)
const mockProvider = {
  transcribe: vi.fn().mockResolvedValue({
    text: 'Hello world',
    segments: [
      { speaker: 'SPEAKER_00', text: 'Hello', start: 0, end: 1 },
      { speaker: 'SPEAKER_01', text: 'World', start: 1, end: 2 }
    ]
  })
};
const service = new TranscriptionService(mockProvider, { defaultLanguage: 'en' });
```

**Mock pattern per TranscriptionProcessor EventBus:**
```javascript
const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
};
const processor = new TranscriptionProcessor({ eventBus: mockEventBus });
```

**Test coverage target:**
- TranscriptionService: 97 test esistenti + ~15 nuovi (EventBus, integration paths)
- TranscriptionProcessor: ~20 nuovi test (wiring, EventBus, error paths)

### Project Structure Notes

**File da MODIFICARE:**
- `scripts/orchestration/TranscriptionProcessor.mjs` — Aggiungere EventBus integration, verificare wiring con TranscriptionService
- `tests/ai/TranscriptionService.test.js` — Nuovi test per path non coperti
- `tests/orchestration/TranscriptionProcessor.test.js` — Nuovi test per EventBus e wiring
- `lang/*.json` (8 file) — Stringhe i18n per messaggi trascrizione

**File da NON toccare (gia' completi):**
- `scripts/ai/TranscriptionService.mjs` — Logica completa, solo verifica
- `scripts/ai/TranscriptionFactory.mjs` — Factory completa
- `scripts/ai/providers/TranscriptionProvider.mjs` — Interfaccia stabile
- `scripts/ai/providers/OpenAITranscriptionProvider.mjs` — Provider completo
- `scripts/audio/AudioRecorder.mjs` — Completato in Story 3.1
- `scripts/audio/AudioChunker.mjs` — Completato in Story 3.1
- `scripts/core/Settings.mjs` — Settings gia' registrate (transcriptionLanguage, multiLanguageMode, etc.)

**File da creare (se necessario):**
- Nessun file nuovo previsto — il codice esistente copre gia' la struttura

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data flow transcription, EventBus channels]
- [Source: _bmad-output/planning-artifacts/prd.md — FR7, FR10, FR39, NFR4]
- [Source: scripts/ai/TranscriptionService.mjs — Implementazione completa trascrizione]
- [Source: scripts/ai/providers/OpenAITranscriptionProvider.mjs — Provider OpenAI]
- [Source: scripts/ai/TranscriptionFactory.mjs — Factory API/Local/Auto]
- [Source: scripts/orchestration/TranscriptionProcessor.mjs — Orchestrazione trascrizione]
- [Source: scripts/core/Settings.mjs — Settings trascrizione e lingua]
- [Source: _bmad-output/implementation-artifacts/3-1-registrazione-audio-completa-con-safari-fallback.md — Story 3.1 completata]
- [Source: docs/GPT4O_TRANSCRIBE_API.md — Documentazione API diarizzazione]

### Previous Story Intelligence (Story 3.1)

**Pattern da replicare:**
- EventBus opzionale (`this.#eventBus?.emit(...)`) — Story 3.1 AudioRecorder
- `#emitSafe()` wrapper per tutti gli emit — pattern consolidato in Epic 2+3
- TDD rigoroso riduce bug critici a 0 (lezione Epic 2 retro)
- Regressione completa come task finale

**Errori da evitare:**
- Non reinventare la logica di TranscriptionService — e' gia' completa e testata
- Non toccare i 97 test esistenti se non necessario — solo aggiungere nuovi
- Non modificare l'interfaccia del provider (TranscriptionProvider) — e' stabile
- Callback non protette da try-catch (errore ricorrente in tutte le storie precedenti)

### Git Intelligence

**Ultimo commit:** `84de8ba feat: complete Epic 1 (foundation) and Epic 2 (AI core) implementation`
**Branch:** `autoclaude`
**Story 3.1:** Completata con 5089 test passati, 70 file
**Pattern recenti:** Provider injection, EventBus integration, TDD, error isolation

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Task 1: Added EventBus integration to TranscriptionProcessor with `#emitSafe()` pattern — emits `ai:transcriptionStarted`, `ai:transcriptionReady`, `ai:transcriptionError`. 10 new tests (80 total in file).
- Task 2: Verified multi-language passthrough — language config flows correctly from TranscriptionProcessor to TranscriptionService to provider. 4 new tests.
- Task 3: Verified vocabulary prompt logic — prompt stripped for diarize model, generated for non-diarize, fallback when VocabularyDictionary throws. 2 new tests (85 total in TranscriptionService).
- Task 4: Verified chunking — timestamp offsetting across chunks, speaker consistency (same SPEAKER_XX maps to same name). 2 new tests.
- Task 5: E2E integration tests — full flow blob→processor→service→result with EventBus events, error flow, auto-mode fallback. 4 new tests.
- Task 6: Added 7 i18n keys to `VOXCHRONICLE.Transcription.*` across all 8 lang files (en, it, de, es, fr, ja, pt, template).
- Task 7: Full regression — 5114 tests pass, 0 failures, 70 test files.

### Change Log

- 2026-03-13: Story 3.2 implementation complete — EventBus wiring, verification of existing transcription logic, i18n strings, 22 new tests added.
- 2026-03-13: Code review fix — added missing EventBus events in auto-mode fallback path (ai:transcriptionReady on fallback success, ai:transcriptionError on fallback failure). Added 2 tests. Added 3 missing PreferredCodec i18n keys across all 8 lang files.

### File List

- scripts/orchestration/TranscriptionProcessor.mjs (modified — EventBus integration, fallback events fix)
- tests/orchestration/TranscriptionProcessor.test.js (modified — 24 new tests)
- tests/ai/TranscriptionService.test.js (modified — 4 new tests)
- scripts/audio/AudioChunker.mjs (modified — EventBus integration, Story 3.1)
- scripts/audio/AudioRecorder.mjs (modified — EventBus, crash recovery, WebRTC peer capture, Story 3.1)
- scripts/core/Settings.mjs (modified — preferredCodec, hasAudioRecovery, audioSourceMixed, Story 3.1)
- tests/audio/AudioChunker.test.js (modified — EventBus tests, Story 3.1)
- tests/audio/AudioRecorder.test.js (modified — EventBus, crash recovery tests, Story 3.1)
- tests/core/Settings.test.js (modified — updated for new settings, Story 3.1)
- lang/en.json (modified — 10 new keys: 7 Transcription + 3 PreferredCodec)
- lang/it.json (modified — 10 new keys)
- lang/de.json (modified — 10 new keys)
- lang/es.json (modified — 10 new keys)
- lang/fr.json (modified — 10 new keys)
- lang/ja.json (modified — 10 new keys)
- lang/pt.json (modified — 10 new keys)
- lang/template.json (modified — 10 new keys)
