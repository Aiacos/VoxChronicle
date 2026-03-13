# Story 3.1: Registrazione Audio Completa con Safari Fallback

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want to record game sessions on any browser including Safari,
So that audio capture works reliably regardless of my browser choice.

## Acceptance Criteria

1. **Given** il DM clicca "Start Recording" **When** il microfono e' disponibile **Then** la registrazione inizia e l'indicatore mostra durata e stato
2. **Given** una registrazione attiva **When** il DM clicca "Pause" **Then** la registrazione si sospende mantenendo i dati, e "Resume" la riprende
3. **Given** una registrazione attiva **When** il DM clicca "Stop" **Then** la registrazione si ferma e il blob audio e' disponibile
4. **Given** il browser e' Safari **When** WebM/Opus non e' supportato **Then** AudioRecorder usa fallback MP4/AAC automaticamente (FR4)
5. **Given** il DM sceglie cattura WebRTC **When** Foundry VTT ha peer audio attivi **Then** il sistema cattura l'audio dai peer (FR3)
6. **Given** una registrazione superiore a 25MB **When** il processing inizia **Then** AudioChunker divide automaticamente in chunk validi (FR5)
7. **Given** un crash del browser durante la registrazione **When** l'utente riapre Foundry **Then** i chunk salvati progressivamente sono recuperabili (NFR34)

## Tasks / Subtasks

- [x] Task 1: Refactoring AudioRecorder — integrazione con EventBus e ProviderRegistry (AC: 1, 2, 3)
  - [x] 1.1 Aggiungere emissione eventi EventBus (`audio:recordingStarted`, `audio:recordingStopped`, `audio:chunkReady`, `audio:error`, `audio:levelChange`)
  - [x] 1.2 Ricevere EventBus nel costruttore (opzionale, come StreamController pattern)
  - [x] 1.3 Aggiornare test esistenti per verificare emissione eventi
- [x] Task 2: Safari codec fallback con feature detection (AC: 4)
  - [x] 2.1 Implementare `_detectOptimalCodec()` — test `MediaRecorder.isTypeSupported()` per: `audio/webm;codecs=opus` → `audio/mp4;codecs=aac` → `audio/mp4` → `audio/wav`
  - [x] 2.2 Aggiungere setting `preferredCodec` (client-scope) con auto-detect default
  - [x] 2.3 Loggare codec selezionato all'avvio della registrazione
  - [x] 2.4 Test: mock `isTypeSupported()` per simulare Safari (solo MP4 supportato)
- [x] Task 3: Progressive chunk persistence — crash recovery (AC: 7)
  - [x] 3.1 Implementare `_persistChunk(blob, index)` — salva chunk in IndexedDB via wrapper
  - [x] 3.2 Implementare `recoverChunks()` — recupera chunk salvati dopo crash
  - [x] 3.3 Implementare `clearPersistedChunks()` — pulizia dopo stop/cancel riuscito
  - [x] 3.4 Aggiungere `has-recovery` flag in Settings per notificare utente al prossimo avvio
  - [x] 3.5 Test: simulare crash con chunk persistiti e verificare recovery
- [x] Task 4: WebRTC peer audio capture enhancement (AC: 5)
  - [x] 4.1 Implementare `_captureWebRTCStream()` — cattura audio dai peer Foundry VTT via `game.webrtc`
  - [x] 4.2 Mixing di stream mic + WebRTC via Web Audio API (`MediaStreamDestination`)
  - [x] 4.3 Aggiungere setting `audioCaptureMode` (client-scope): `microphone` | `webrtc` | `mixed`
  - [x] 4.4 Test: mock `game.webrtc` e verificare cattura stream peer
- [x] Task 5: AudioChunker integrazione con EventBus (AC: 6)
  - [x] 5.1 Aggiungere eventi `audio:chunkingStarted`, `audio:chunkCreated`, `audio:chunkingComplete`
  - [x] 5.2 Aggiornare test esistenti
- [x] Task 6: i18n — stringhe per tutti gli 8 file lingua (AC: tutti)
  - [x] 6.1 Aggiungere chiavi sotto `VOXCHRONICLE.Audio.*` e `VOXCHRONICLE.Settings.Audio*`
  - [x] 6.2 Coprire: stati registrazione, errori microfono, errori codec, recovery, cattura WebRTC
- [x] Task 7: Regressione completa (AC: tutti)
  - [x] 7.1 Eseguire `npm test` — tutti i 5089 test passano (70 file)
  - [x] 7.2 Verificare che i 58 test AudioChunker + 173 test AudioRecorder passano senza modifiche breaking

## Dev Notes

### Pattern Architetturali da Seguire

**EventBus integration (opzionale, pattern Story 2.4):**
```javascript
// StreamController pattern — EventBus opzionale
constructor(options = {}) {
  this.#eventBus = options.eventBus ?? null;
}
#emitSafe(channel, data) {
  try { this.#eventBus?.emit(channel, data); } catch (e) { this.logger.warn('EventBus emit failed:', e); }
}
```

**Error isolation (lezione Epic 2 retro — ENFORCEMENT, non cultura):**
- OGNI callback/handler wrappato in try-catch
- OGNI `.emit()` wrappato in `#emitSafe()`
- OGNI risorsa esterna (MediaRecorder, AudioContext, stream) ha cleanup garantito nel finally block

**Codec detection pattern:**
```javascript
_detectOptimalCodec() {
  const codecs = [
    'audio/webm;codecs=opus',    // Chrome, Firefox, Edge
    'audio/mp4;codecs=aac',      // Safari primary
    'audio/mp4',                  // Safari fallback
    'audio/wav'                   // Universal fallback
  ];
  for (const codec of codecs) {
    if (MediaRecorder.isTypeSupported(codec)) return codec;
  }
  throw new Error('No supported audio codec found');
}
```

**IndexedDB per crash recovery:**
- Usare API IndexedDB nativa (NO librerie esterne — zero build step)
- Store: `vox-chronicle-audio-recovery`
- Key: `chunk-{sessionId}-{index}`
- Cleanup: `clearPersistedChunks()` chiamato su `stopRecording()` e `cancel()` riusciti

### Stato Attuale del Codice

**AudioRecorder.mjs (513 righe)** — GIA' FUNZIONANTE con:
- State machine: INACTIVE ↔ RECORDING ↔ PAUSED
- Gapless rotation via `getLatestChunk()` (overlap ~100ms)
- Web Audio API per level monitoring (AnalyserNode)
- Callback pattern: `onStateChange`, `onError`, `onDataAvailable`, `onLevelChange`
- Cleanup robusto via `_cleanup()`
- **MANCANTE**: EventBus integration, Safari codec fallback, crash recovery, WebRTC capture migliorato

**AudioChunker.mjs (365 righe)** — GIA' FUNZIONANTE con:
- Split a 24MB (25MB limit - 1MB margine)
- 3 strategie: byte-based, chunk grouping, overlap
- 73 test completi
- **MANCANTE**: EventBus integration

### Vincoli Critici

1. **Zero build step** — Nessun transpiling, import ES6+ nativi (.mjs)
2. **No librerie esterne per IndexedDB** — API nativa browser
3. **Safari 15+** target — `MediaRecorder` disponibile da Safari 14.5, ma codec limitati
4. **Layer boundary** — `audio/` puo' importare da `utils/` e `core/` (EventBus via core)
5. **25MB OpenAI limit** — AudioChunker DEVE funzionare con qualsiasi codec (WebM, MP4, WAV)
6. **Callback backward compatibility** — Mantenere callback esistenti (`onStateChange`, etc.) in aggiunta a EventBus

### Testing Strategy

**TDD obbligatorio** (lezione Epic 2 retro: TDD riduce bug critici da 4 a 0):

1. **RED**: Scrivere test per nuova funzionalita' PRIMA dell'implementazione
2. **GREEN**: Implementare il minimo per far passare i test
3. **REFACTOR**: Pulire mantenendo test verdi

**Mock necessari:**
```javascript
// Safari codec simulation
globalThis.MediaRecorder = { isTypeSupported: vi.fn((type) => type === 'audio/mp4') };

// IndexedDB mock per crash recovery
const mockIDB = { open: vi.fn(), deleteDatabase: vi.fn() };
globalThis.indexedDB = mockIDB;

// WebRTC mock
globalThis.game = { webrtc: { client: { _peerConnections: new Map() } } };

// requestAnimationFrame (jsdom non lo ha)
globalThis.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 0));
```

**Test coverage target:**
- AudioRecorder: 90+ test esistenti + ~30 nuovi (EventBus, codec, recovery, WebRTC)
- AudioChunker: 73 test esistenti + ~5 nuovi (EventBus)

### Project Structure Notes

**File da modificare:**
- `scripts/audio/AudioRecorder.mjs` — Aggiungere EventBus, codec detection, crash recovery, WebRTC
- `scripts/audio/AudioChunker.mjs` — Aggiungere EventBus integration
- `scripts/core/Settings.mjs` — Nuove impostazioni audio (codec, capture mode)
- `scripts/utils/AudioUtils.mjs` — Eventuale helper per codec detection
- `tests/audio/AudioRecorder.test.js` — Nuovi test
- `tests/audio/AudioChunker.test.js` — Nuovi test EventBus
- `lang/*.json` (8 file) — Stringhe i18n

**File da creare (se necessario):**
- `scripts/audio/AudioPersistence.mjs` — Wrapper IndexedDB per crash recovery (se la complessita' lo giustifica)

**File da NON toccare:**
- `scripts/ai/*` — Layer AI non coinvolto
- `scripts/narrator/*` — Layer narrator non coinvolto
- `scripts/kanka/*` — Layer Kanka non coinvolto
- `scripts/ui/*` — UI sara' aggiornata in Epic 6

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Audio layer, layer boundaries, data flow]
- [Source: _bmad-output/planning-artifacts/prd.md — FR1-FR6, NFR34, browser support matrix]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — LED system, VU meter, recording UI]
- [Source: _bmad-output/implementation-artifacts/2-4-streamcontroller-ui.md — EventBus optional pattern, error isolation]
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-03-13.md — TDD enforcement, error isolation checklist]
- [Source: scripts/audio/AudioRecorder.mjs — Current implementation analysis]
- [Source: scripts/audio/AudioChunker.mjs — Current implementation analysis]

### Previous Story Intelligence (Epic 2)

**Pattern da replicare:**
- EventBus opzionale (`this.#eventBus?.emit(...)`) — Story 2.4 StreamController
- `#emitSafe()` wrapper per tutti gli emit — fix review M1 Story 2.4
- `#callbackSafe()` wrapper per callback utente — fix review H4 Story 2.4
- State machine con guardie (`if (this.#state === 'streaming') throw`) — Story 2.4
- Abort signal linking con cleanup listener — fix review M2 Story 2.4

**Errori da evitare:**
- Map/Set mutation durante iterazione (bug Story 2.3 in CacheManager)
- Callback non protette da try-catch (3/4 storie Epic 2 avevano questo problema)
- `.emit()` senza try-catch in path critici
- Self-review insufficiente — usare checklist pre-commit

### Git Intelligence

**Ultimo commit:** `84de8ba feat: complete Epic 1 (foundation) and Epic 2 (AI core) implementation`
**Branch:** `autoclaude`
**Stato:** Epic 1 + 2 completati, Epic 3 appena iniziato

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nessun debug necessario — implementazione TDD senza blocchi.

### Completion Notes List

- Task 1-3: Completati in sessione precedente (EventBus, Safari codec, crash recovery)
- Task 4: WebRTC peer audio capture — `_captureWebRTCStream()` cattura audio da `game.webrtc.client._peerConnections`, `_createMixedStream()` mixa mic+peer via Web Audio API `MediaStreamDestination`. 3 modalità: microphone/webrtc/mixed. 17 nuovi test.
- Task 5: AudioChunker EventBus — eventi `audio:chunkingStarted`, `audio:chunkCreated`, `audio:chunkingComplete` con pattern `_emitSafe()`. 7 nuovi test.
- Task 6: i18n — Aggiunta chiave `AudioSourceMixed` in tutti gli 8 file lingua.
- Task 7: Regressione completa — 5089 test passano su 70 file, 0 fallimenti.

### File List

- `scripts/audio/AudioRecorder.mjs` — WebRTC capture, stream mixing, cleanup
- `scripts/audio/AudioChunker.mjs` — EventBus integration
- `scripts/core/Settings.mjs` — Added `mixed` capture mode, `captureMode` in getAudioSettings
- `tests/audio/AudioRecorder.test.js` — 17 new WebRTC tests (173 total)
- `tests/audio/AudioChunker.test.js` — 7 new EventBus tests (58 total)
- `tests/core/Settings.test.js` — Updated getAudioSettings expectations
- `lang/en.json` — AudioSourceMixed
- `lang/it.json` — AudioSourceMixed
- `lang/de.json` — AudioSourceMixed
- `lang/es.json` — AudioSourceMixed
- `lang/fr.json` — AudioSourceMixed
- `lang/ja.json` — AudioSourceMixed
- `lang/pt.json` — AudioSourceMixed
- `lang/template.json` — AudioSourceMixed
