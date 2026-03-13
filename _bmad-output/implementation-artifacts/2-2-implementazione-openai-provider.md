# Story 2.2: Implementazione OpenAI Provider

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want OpenAI to work as the first AI provider through the new interface,
So that all existing functionality continues to work with the new architecture.

## Acceptance Criteria

1. **OpenAIChatProvider** — Given `OpenAIChatProvider`, When viene chiamato `chat(messages, options)`, Then ritorna `{ content, usage }` usando l'API OpenAI `/chat/completions`
2. **OpenAIChatProvider Streaming** — Given `OpenAIChatProvider`, When viene chiamato `chatStream(messages, options)`, Then ritorna un async iterator di `{ token, done }` via SSE (`stream: true`)
3. **OpenAITranscriptionProvider** — Given `OpenAITranscriptionProvider`, When viene chiamato `transcribe(audioBlob, options)`, Then ritorna `{ text, segments }` usando FormData (NON JSON) all'endpoint `/audio/transcriptions`
4. **OpenAIImageProvider** — Given `OpenAIImageProvider`, When viene chiamato `generateImage(prompt, options)`, Then ritorna `{ data, format }` con base64 da `gpt-image-1`
5. **OpenAIEmbeddingProvider** — Given `OpenAIEmbeddingProvider`, When viene chiamato `embed(text, options)`, Then ritorna `{ embedding, dimensions }` usando `/embeddings`
6. **Provider Registration** — Given i provider OpenAI registrati nel `ProviderRegistry`, When i servizi esistenti vengono refactored, Then usano `ProviderRegistry.getProvider(capability)` invece di `OpenAIClient` diretto

## Tasks / Subtasks

- [x] Task 1: Creare `OpenAIChatProvider.mjs` — implementazione chat OpenAI (AC: #1, #2)
  - [x] 1.1: Estende `ChatProvider`, costruttore accetta `apiKey` e `options = {}`
  - [x] 1.2: Istanza interna di `OpenAIClient` per HTTP transport (retry, queue, timeout)
  - [x] 1.3: `async chat(messages, options)` — chiama `_client.post('/chat/completions', body)`, mappa risposta OpenAI `{ choices[0].message.content, usage }` → `{ content, usage }`
  - [x] 1.4: `async *chatStream(messages, options)` — chiama `_client.postStream('/chat/completions', body)`, mappa chunks SSE → `{ token, done }`
  - [x] 1.5: Supporto `options`: `{ model, temperature, maxTokens, abortSignal, responseFormat }`
  - [x] 1.6: `static get capabilities()` ritorna `['chat', 'chatStream']`
  - [x] 1.7: Test in `tests/ai/providers/OpenAIChatProvider.test.js` — mock `OpenAIClient`, test chat + stream + errori + options mapping (24 test)

- [x] Task 2: Creare `OpenAITranscriptionProvider.mjs` — implementazione transcription OpenAI (AC: #3)
  - [x] 2.1: Estende `TranscriptionProvider`, costruttore accetta `apiKey` e `options = {}`
  - [x] 2.2: Istanza interna di `OpenAIClient` con timeout 600000ms (10 minuti)
  - [x] 2.3: `async transcribe(audioBlob, options)` — costruisce FormData, chiama `_client.postFormData('/audio/transcriptions', formData)`
  - [x] 2.4: FormData fields: `file`, `model` (default `gpt-4o-transcribe`), `response_format`, `language` (opzionale), `prompt` (solo per modelli non-diarize), `chunking_strategy`
  - [x] 2.5: Mappa risposta OpenAI → `{ text, segments }` normalizzato
  - [x] 2.6: Supporto opzione `diarize: true` → usa modello `gpt-4o-transcribe-diarize` e `response_format: 'diarized_json'`
  - [x] 2.7: Test in `tests/ai/providers/OpenAITranscriptionProvider.test.js` — mock OpenAIClient, test FormData construction, diarize toggle, response mapping (19 test)

- [x] Task 3: Creare `OpenAIImageProvider.mjs` — implementazione image OpenAI (AC: #4)
  - [x] 3.1: Estende `ImageProvider`, costruttore accetta `apiKey` e `options = {}`
  - [x] 3.2: Istanza interna di `OpenAIClient` con timeout 300000ms (5 minuti)
  - [x] 3.3: `async generateImage(prompt, options)` — chiama `_client.post('/images/generations', body)`
  - [x] 3.4: Body: `{ model: 'gpt-image-1', prompt, n: 1, size, quality }` con defaults da options
  - [x] 3.5: Mappa risposta OpenAI `{ data[0].b64_json }` → `{ data: base64String, format: 'png' }`
  - [x] 3.6: Supporto `options`: `{ model, size, quality, abortSignal }`
  - [x] 3.7: Test in `tests/ai/providers/OpenAIImageProvider.test.js` — mock OpenAIClient, test response mapping, size/quality defaults (18 test)

- [x] Task 4: Creare `OpenAIEmbeddingProvider.mjs` — implementazione embedding OpenAI (AC: #5)
  - [x] 4.1: Estende `EmbeddingProvider`, costruttore accetta `apiKey` e `options = {}`
  - [x] 4.2: Istanza interna di `OpenAIClient`
  - [x] 4.3: `async embed(text, options)` — chiama `_client.post('/embeddings', body)`
  - [x] 4.4: Body: `{ model: 'text-embedding-3-small', input: text }` con override da options
  - [x] 4.5: Mappa risposta OpenAI `{ data[0].embedding }` → `{ embedding: number[], dimensions: number }`
  - [x] 4.6: Test in `tests/ai/providers/OpenAIEmbeddingProvider.test.js` — mock OpenAIClient, test response mapping

- [x] Task 5: Refactoring servizi esistenti per usare Provider (AC: #6)
  - [x] 5.1: `TranscriptionService.mjs` — rimuovere `extends OpenAIClient`, accettare `TranscriptionProvider` nel costruttore, delegare `transcribe()` al provider. Mantenere logica di chunking, speaker mapping, circuit breaker NEL servizio.
  - [x] 5.2: `ImageGenerationService.mjs` — rimuovere `extends OpenAIClient`, accettare `ImageProvider` nel costruttore, delegare `generateImage()` al provider. Mantenere logica prompt building, gallery, cost estimation NEL servizio.
  - [x] 5.3: `EntityExtractor.mjs` — rimuovere `extends OpenAIClient`, accettare `ChatProvider` nel costruttore, delegare chat calls al provider. Mantenere logica system prompts, JSON parsing, entity normalization, known entities NEL servizio.
  - [x] 5.4: Aggiornare test di tutti e 3 i servizi — mock provider invece di OpenAIClient
  - [x] 5.5: Verificare che nessun altro file importi direttamente OpenAIClient per operazioni AI (cercare `import.*OpenAIClient`)

- [x] Task 6: Registrazione provider in VoxChronicle singleton (AC: #6)
  - [x] 6.1: In `VoxChronicle.mjs` initialize(), creare istanze dei 4 provider OpenAI con la apiKey
  - [x] 6.2: Registrare tutti nel `ProviderRegistry` con `{ default: true }`
  - [x] 6.3: Passare i provider ai servizi tramite `ProviderRegistry.getProvider(capability)`
  - [x] 6.4: Test in `tests/` — verificare che i servizi ricevono i provider corretti

- [x] Task 7: Aggiungere stringhe i18n per nuovi errori provider in tutti gli 8 file lang (AC: #1-#5)
  - [x] 7.1: Chiavi sotto `VOXCHRONICLE.Provider.OpenAI`:
    - `ConnectionFailed`: connessione all'API OpenAI fallita
    - `InvalidResponse`: risposta API non valida
    - `StreamError`: errore durante streaming
  - [x] 7.2: Aggiornare tutti gli 8 file lang

- [x] Task 8: Eseguire test completi e verificare zero regressioni (AC: tutti)
  - [x] 8.1: `npm test` — tutti i 4895 test passano (82 test in più rispetto alla baseline di 4813)
  - [x] 8.2: Tutti i nuovi test provider passano (78 test: 24+19+18+17)
  - [x] 8.3: Tutti i test dei servizi refactored passano

## Dev Notes

### Pattern Architetturali da Seguire

**Composizione, non ereditarieta'** — I provider concreti `OpenAI*Provider` estendono le interfacce astratte (`ChatProvider`, etc.) ma usano composizione per l'HTTP layer: contengono un'istanza di `OpenAIClient` come membro privato. I servizi (`TranscriptionService`, `ImageGenerationService`, `EntityExtractor`) NON estendono piu' `OpenAIClient` — ricevono un provider nel costruttore.

```javascript
// Pattern provider concreto
class OpenAIChatProvider extends ChatProvider {
  #client;

  constructor(apiKey, options = {}) {
    super();
    this.#client = new OpenAIClient(apiKey, {
      timeout: options.timeout ?? 120000,
      ...options
    });
  }

  async chat(messages, options = {}) {
    this._validateOptions(options);
    const body = {
      model: options.model ?? 'gpt-4o',
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens
    };
    if (options.responseFormat) body.response_format = options.responseFormat;
    const response = await this.#client.post('/chat/completions', body, {
      signal: options.abortSignal
    });
    return {
      content: response.choices[0].message.content,
      usage: response.usage
    };
  }
}
```

**Pattern servizio refactored:**
```javascript
// PRIMA (Story 2.1):
class TranscriptionService extends OpenAIClient {
  constructor(apiKey, options) {
    super(apiKey, { timeout: 600000, ...options });
  }
  async transcribe(audioBlob, options) {
    const result = await this.postFormData('/audio/transcriptions', formData);
  }
}

// DOPO (Story 2.2):
class TranscriptionService {
  #provider;
  constructor(provider, options = {}) {
    this.#provider = provider; // TranscriptionProvider instance
    this.logger = Logger.createChild('TranscriptionService');
  }
  async transcribe(audioBlob, options) {
    // Chunking logic stays here
    if (audioBlob.size > MAX_CHUNK_SIZE) {
      return this._transcribeChunked(audioBlob, options);
    }
    const result = await this.#provider.transcribe(audioBlob, {
      model: options.diarize ? 'gpt-4o-transcribe-diarize' : 'gpt-4o-transcribe',
      language: options.language,
      abortSignal: options.signal
    });
    return this._mapSpeakersToNames(result, options.speakerMap);
  }
}
```

**OpenAIClient rimane** — `OpenAIClient.mjs` NON viene eliminato ne' modificato in modo sostanziale. Rimane come HTTP transport layer generico (retry, queue, rate limiting, timeout). I provider OpenAI lo usano internamente. Possibile che in futuro venga rinominato in `HttpTransport` o simile, ma per Story 2.2 resta `OpenAIClient`.

### Boundary Architetturali

```
┌──────────────────────────────────────────────────────────┐
│  ai/providers/OpenAI*Provider.mjs                         │
│    → extends ai/providers/*Provider.mjs (interfacce)      │
│    → uses ai/OpenAIClient.mjs (composizione, HTTP layer)  │
│    → imports utils/ (Logger)                              │
│    NESSUNA dipendenza su core/, narrator/, rag/           │
├──────────────────────────────────────────────────────────┤
│  ai/*Service.mjs (TranscriptionService, etc.)             │
│    → riceve *Provider nel costruttore (dependency inject)  │
│    → imports utils/, core/ (per EventBus se necessario)   │
│    → NON importa piu' OpenAIClient direttamente          │
├──────────────────────────────────────────────────────────┤
│  core/VoxChronicle.mjs                                    │
│    → crea OpenAI*Provider con apiKey                      │
│    → li registra in ProviderRegistry                      │
│    → passa i provider ai servizi via constructor inject   │
└──────────────────────────────────────────────────────────┘
```

### Codice Esistente Rilevante e Analisi Migrazione

**`scripts/ai/OpenAIClient.mjs`** — HTTP client con retry, queue, timeout.
Metodi chiave usati dai servizi:
- `post(endpoint, data, options)` — POST JSON
- `postFormData(endpoint, formData, options)` — POST multipart/form-data (transcription)
- `postStream(endpoint, data, options)` — Streaming SSE (async generator)
- `request(endpoint, options)` — Generic request (GET/POST)

**`scripts/ai/TranscriptionService.mjs`** — Attualmente `extends OpenAIClient`:
- Chiama `this.postFormData('/audio/transcriptions', formData)` (linea ~316)
- Logica interna da preservare: chunking (`_transcribeChunked`), speaker mapping (`_mapSpeakersToNames`), circuit breaker custom (`_consecutiveErrors`), multi-language mode, vocabulary prompt
- Timeout: 600000ms (10 min)
- FormData fields: `file`, `model`, `response_format`, `language`, `prompt`, `chunking_strategy`

**`scripts/ai/ImageGenerationService.mjs`** — Attualmente `extends OpenAIClient`:
- Chiama `this.post('/images/generations', body)` (linea ~209)
- Logica interna da preservare: prompt building per entity type (`_buildPrompt`), gallery management, cost estimation, campaign style
- Timeout: 300000ms (5 min)
- Usa `gpt-image-1`, risposta base64 (`b64_json`)

**`scripts/ai/EntityExtractor.mjs`** — Attualmente `extends OpenAIClient`:
- Chiama `this.post('/chat/completions', body)` per 3 metodi: `extractEntities`, `identifySalientMoments`, `extractRelationships`
- Logica interna da preservare: system prompts, JSON response parsing, entity normalization, known entities Set, transcript truncation (400k chars), temperature per operation type
- Timeout: 180000ms (3 min)

### Gotchas Critici

1. **FormData per transcription** — `OpenAITranscriptionProvider.transcribe()` DEVE usare FormData internamente. L'interfaccia astratta accetta `audioBlob` ma l'implementazione OpenAI costruisce FormData con tutti i campi richiesti.

2. **Streaming e queue** — `postStream()` e' long-lived. Il provider deve gestire correttamente l'abort signal per interrompere lo stream quando richiesto.

3. **Model-specific quirks** — Il modello `gpt-4o-transcribe-diarize` NON supporta il parametro `prompt`. `OpenAITranscriptionProvider` deve gestire questa differenza internamente basandosi sull'opzione `diarize`.

4. **Circuit breaker in TranscriptionService** — Il circuit breaker custom (`_consecutiveErrors`, `_maxConsecutiveErrors`, `_isCircuitOpen`) DEVE restare nel servizio, NON nel provider. Il provider e' stateless rispetto a failure count.

5. **Response format mapping** — Ogni provider deve mappare la risposta OpenAI al formato standard dell'interfaccia:
   - Chat: `{ choices[0].message.content, usage }` → `{ content, usage }`
   - Transcription: `{ text, segments, language, duration }` → `{ text, segments }`
   - Image: `{ data[0].b64_json }` → `{ data: base64, format: 'png' }`
   - Embedding: `{ data[0].embedding }` → `{ embedding, dimensions }`

6. **Audio chunking** — Resta in `TranscriptionService`, NON nel provider. Il provider gestisce un singolo chunk alla volta. Il servizio chiama `provider.transcribe()` N volte per N chunks.

7. **`gpt-image-1` ritorna base64** — A differenza di `dall-e-3`, `gpt-image-1` NON ritorna URL. Il provider DEVE estrarre `b64_json` e NON `url`.

8. **AbortSignal propagation** — I provider devono passare `options.abortSignal` alla request OpenAIClient come `{ signal: options.abortSignal }`.

9. **EntityExtractor usa `response_format: { type: 'json_object' }`** — Questo parametro DEVE essere supportato come `options.responseFormat` nel `OpenAIChatProvider` e passato a OpenAI nel body della request.

10. **Test existing services** — Quando si refactora un servizio per usare il provider, TUTTI i test esistenti del servizio devono essere aggiornati per mockare il provider invece di OpenAIClient. Non mantenere test vecchi in parallelo.

### Anti-Pattern: Cose da NON Fare

- **NON eliminare `OpenAIClient.mjs`** — resta come HTTP transport layer usato internamente dai provider
- **NON spostare logica di business nei provider** — chunking, speaker mapping, entity normalization, prompt building restano nei servizi
- **NON aggiungere circuit breaker nei provider** — i provider sono stateless, il circuit breaker e' responsabilita' del servizio o del `ResilienceRegistry`
- **NON creare un unico `OpenAIProvider` monolitico** — creare 4 provider separati (Chat, Transcription, Image, Embedding) come da interfacce Story 2.1
- **NON usare `console.log`** — sempre `Logger.createChild()`
- **NON hardcodare stringhe errore** — usare `game.i18n.localize()`/`format()`
- **NON creare settings Foundry nuovi** — la apiKey esistente viene riusata
- **NON modificare le interfacce astratte** della Story 2.1 — sono immutabili
- **NON refactorare `AIAssistant.mjs`** — non e' scope di questa story (usa ChatProvider indirettamente via EntityExtractor/TranscriptionService pattern, sara' refactored in Epic 4)
- **NON modificare `RulesReference.mjs`** o `CompendiumParser.mjs` — non usano OpenAIClient direttamente
- **NON creare adapter o compatibility layers** — sostituzione diretta come da strategia brownfield

### Stringhe i18n da Aggiungere

Aggiungere in TUTTI gli 8 file lang (`en.json`, `it.json`, `de.json`, `es.json`, `fr.json`, `ja.json`, `pt.json`, `template.json`) sotto la chiave `VOXCHRONICLE.Provider.OpenAI`:

```json
{
  "VOXCHRONICLE": {
    "Provider": {
      "OpenAI": {
        "ConnectionFailed": "Failed to connect to OpenAI API: {error}",
        "InvalidResponse": "Invalid response from OpenAI API: {details}",
        "StreamError": "Error during OpenAI streaming: {error}"
      }
    }
  }
}
```

### Testing Standards

- Framework: **Vitest** con `jsdom` environment
- Mock `OpenAIClient` completamente — NON fare chiamate HTTP reali
- Mock `game` object globale con `i18n.localize` e `i18n.format`
- Test copertura: happy path, error cases, options mapping, response format mapping
- Per i servizi refactored: mock il provider (non OpenAIClient), verificare che la logica di business interna e' preservata
- Pattern mock provider:
```javascript
const mockProvider = {
  chat: vi.fn().mockResolvedValue({ content: 'test', usage: {} }),
  chatStream: vi.fn().mockReturnValue(mockAsyncIterator([
    { token: 'hello', done: false },
    { token: '', done: true }
  ]))
};
```
- Segui pattern test da `tests/ai/providers/ChatProvider.test.js` e `tests/ai/providers/ProviderRegistry.test.js`
- Per streaming test: usare async generator helper
- **Baseline test count**: 4813 test — TUTTI devono passare senza regressioni

### Project Structure Notes

Nuovi file da creare (tutti con estensione `.mjs`):
```
scripts/ai/providers/
├── ChatProvider.mjs              ← GIA' ESISTE (Story 2.1)
├── TranscriptionProvider.mjs     ← GIA' ESISTE (Story 2.1)
├── ImageProvider.mjs             ← GIA' ESISTE (Story 2.1)
├── EmbeddingProvider.mjs         ← GIA' ESISTE (Story 2.1)
├── ProviderRegistry.mjs          ← GIA' ESISTE (Story 2.1)
├── OpenAIChatProvider.mjs        ← NEW
├── OpenAITranscriptionProvider.mjs ← NEW
├── OpenAIImageProvider.mjs       ← NEW
└── OpenAIEmbeddingProvider.mjs   ← NEW

tests/ai/providers/
├── OpenAIChatProvider.test.js    ← NEW
├── OpenAITranscriptionProvider.test.js ← NEW
├── OpenAIImageProvider.test.js   ← NEW
└── OpenAIEmbeddingProvider.test.js ← NEW
```

File da MODIFICARE (refactoring):
```
scripts/ai/TranscriptionService.mjs     ← REFACTOR (rimuovere extends OpenAIClient)
scripts/ai/ImageGenerationService.mjs   ← REFACTOR (rimuovere extends OpenAIClient)
scripts/ai/EntityExtractor.mjs          ← REFACTOR (rimuovere extends OpenAIClient)
scripts/core/VoxChronicle.mjs           ← MODIFY (creare e registrare provider)
tests/ai/TranscriptionService.test.js   ← UPDATE (mock provider)
tests/ai/ImageGenerationService.test.js ← UPDATE (mock provider)
tests/ai/EntityExtractor.test.js        ← UPDATE (mock provider)
```

File da NON toccare:
```
scripts/ai/OpenAIClient.mjs             ← INVARIATO (usato internamente dai provider)
scripts/ai/TranscriptionFactory.mjs     ← INVARIATO (sara' aggiornato quando il refactoring e' completo)
scripts/narrator/AIAssistant.mjs        ← INVARIATO (Epic 4 scope)
scripts/narrator/RulesReference.mjs     ← INVARIATO
scripts/rag/*.mjs                       ← INVARIATO
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#2. AI Provider Abstraction]
- [Source: _bmad-output/planning-artifacts/architecture.md#2. Provider Interface — Contratto e Registrazione]
- [Source: _bmad-output/planning-artifacts/architecture.md#4. Caching Strategy]
- [Source: _bmad-output/planning-artifacts/architecture.md#7. Streaming Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Handoff]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]
- [Source: _bmad-output/implementation-artifacts/2-1-ai-provider-interface-e-providerregistry.md — previous story learnings]
- [Source: scripts/ai/OpenAIClient.mjs — HTTP transport layer]
- [Source: scripts/ai/TranscriptionService.mjs — service to refactor]
- [Source: scripts/ai/ImageGenerationService.mjs — service to refactor]
- [Source: scripts/ai/EntityExtractor.mjs — service to refactor]
- [Source: scripts/ai/providers/ChatProvider.mjs — abstract interface]
- [Source: scripts/ai/providers/ProviderRegistry.mjs — central registry]
- [Source: CLAUDE.md — coding standards, testing patterns, localization requirements]

### Previous Story Intelligence (Story 2.1)

**Key learnings from Story 2.1:**
- Interfacce astratte usano guard `new.target` nel costruttore — i provider concreti NON hanno bisogno di questo guard
- `_validateOptions(options)` in ogni interfaccia controlla `AbortSignal` — i provider concreti chiamano `super._validateOptions()` prima di procedere? NO — le interfacce non hanno `super` chain. I provider concreti ereditano `_validateOptions` dall'interfaccia.
- ProviderRegistry singleton con `getInstance()` / `resetInstance()` — usare questo pattern per ottenere il registry
- EventBus singleton importato come `import { eventBus } from '../core/EventBus.mjs'`
- Pattern test: `rejects.toThrow()` per errori async, NON try/catch con assertions separate
- `_validatePrompt()` e `_validateText()` usano `.trim().length` per rifiutare stringhe solo-whitespace
- `_validateAudioBlob()` rifiuta blob con `size === 0`
- Test baseline: 4813 test passanti, 64 file

**Code review findings applicabili:**
- H1: Test try/catch fragile → usare `rejects.toThrow()` + assertion separate per i18n
- H2: Validazione input rigorosa — ogni provider deve validare i parametri
- M1/M2: Whitespace e zero-size validation gia' nelle interfacce base — ereditata automaticamente

**Git patterns recenti:**
- Commit style: `feat: add X (Story Y.Z)` per feature, `fix: description` per bugfix
- File naming: `PascalCase.mjs` per classi
- Test naming: `PascalCase.test.js`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Implementation Plan — Task 5 Refactoring

**Subtask 5.1: TranscriptionService.mjs**
- Rimuovere `extends OpenAIClient`, importare `OpenAIError`/`OpenAIErrorType` solo come types
- Costruttore: `constructor(provider, options = {})` con `this.#provider = provider`
- `_transcribeSingle()`: sostituire `this.postFormData(...)` → `this.#provider.transcribe(audioBlob, { diarize, language, prompt, abortSignal })`
- Provider ritorna `{ text, segments }` — servizio continua con `_mapSpeakersToNames()`
- Mantenere: chunking, circuit breaker, vocabulary prompt, multi-language mode
- Test: mock provider `{ transcribe: vi.fn() }`, rimuovere mock RateLimiter/SensitiveDataFilter/fetch

**Subtask 5.2: ImageGenerationService.mjs**
- Rimuovere `extends OpenAIClient`
- Costruttore: `constructor(provider, options = {})`
- `generatePortrait()`: sostituire `this.post(...)` → `this.#provider.generateImage(prompt, { size, quality, abortSignal })`
- Provider ritorna `{ data: base64, format: 'png' }` — mappare a result
- Mantenere: prompt building, gallery, cache, cost estimation, entity type validation
- Test: mock provider `{ generateImage: vi.fn() }`, rimuovere mock RateLimiter/SensitiveDataFilter/fetch

**Subtask 5.3: EntityExtractor.mjs**
- Rimuovere `extends OpenAIClient`
- Costruttore: `constructor(provider, options = {})`
- 3 metodi: sostituire `this.post('/chat/completions', body)` → `this.#provider.chat(messages, { model, temperature, responseFormat })`
- Provider ritorna `{ content, usage }` — usare `content` direttamente (non `response.choices[0].message.content`)
- Mantenere: system prompts, JSON parsing, entity normalization, known entities
- Test: mock provider `{ chat: vi.fn() }`, rimuovere mock RateLimiter/SensitiveDataFilter/fetch

**Subtask 5.4**: Verificare nessun altro file importa OpenAIClient per operazioni AI
**Subtask 5.5**: Run `npm test` per confermare zero regressioni

### Completion Notes List

- Task 1: OpenAIChatProvider implementato con 24 test (chat, chatStream, options mapping, error propagation)
- Task 2: OpenAITranscriptionProvider implementato con 19 test (FormData, diarize toggle, model switching, validation)
- Task 3: OpenAIImageProvider implementato con 18 test (gpt-image-1, base64 response, size/quality defaults)
- Task 4: OpenAIEmbeddingProvider implementato con 17 test (text-embedding-3-small, dimensions from array length, model override)
- Task 5: Refactoring 3 servizi (TranscriptionService, ImageGenerationService, EntityExtractor) da extends OpenAIClient a composizione con #provider. Test aggiornati con mock provider. 4895 test pass.
- Task 6: Provider OpenAI registrati in VoxChronicle singleton via ProviderRegistry. TranscriptionFactory aggiornata per ricevere provider. ProviderRegistry.resetInstance() aggiunto a VoxChronicle.resetInstance(). Test VoxChronicle e TranscriptionFactory aggiornati.
- Task 7: Stringhe i18n (ConnectionFailed, InvalidResponse, StreamError) aggiunte in 8 file lang sotto VOXCHRONICLE.Provider.OpenAI.
- Task 8: Full regression 4895 test su 68 file, zero fallimenti. +82 test rispetto alla baseline di 4813.

### Change Log

- 2026-03-10: Tasks 1-3 completed (61 new tests, 3 new provider files). Session 1.
- 2026-03-10: Task 4 completed (17 new tests, 1 new provider file). Session 2.
- 2026-03-10: Tasks 5-8 completed (3 services refactored, providers registered in singleton, i18n strings added, 4895 tests pass). Session 3.

### File List

#### Nuovi file (Tasks 1-4)
- scripts/ai/providers/OpenAIChatProvider.mjs
- scripts/ai/providers/OpenAITranscriptionProvider.mjs
- scripts/ai/providers/OpenAIImageProvider.mjs
- scripts/ai/providers/OpenAIEmbeddingProvider.mjs
- tests/ai/providers/OpenAIChatProvider.test.js
- tests/ai/providers/OpenAITranscriptionProvider.test.js
- tests/ai/providers/OpenAIImageProvider.test.js
- tests/ai/providers/OpenAIEmbeddingProvider.test.js

#### Modificati (Task 5 — refactoring servizi)
- scripts/ai/TranscriptionService.mjs
- scripts/ai/ImageGenerationService.mjs
- scripts/ai/EntityExtractor.mjs
- tests/ai/TranscriptionService.test.js
- tests/ai/ImageGenerationService.test.js
- tests/ai/EntityExtractor.test.js

#### Modificati (Task 6 — provider registration)
- scripts/core/VoxChronicle.mjs
- scripts/ai/TranscriptionFactory.mjs
- tests/core/VoxChronicle.test.js
- tests/ai/TranscriptionFactory.test.js

#### Modificati (Task 7 — i18n)
- lang/en.json
- lang/it.json
- lang/de.json
- lang/es.json
- lang/fr.json
- lang/ja.json
- lang/pt.json
- lang/template.json
