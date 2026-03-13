# Story 2.1: AI Provider Interface e ProviderRegistry

Status: done

## Story

As a developer,
I want abstract provider interfaces (ChatProvider, TranscriptionProvider, ImageProvider, EmbeddingProvider) with a central registry,
So that any AI provider can be added by implementing a single interface without modifying calling code.

## Acceptance Criteria

1. **Provider Interfaces** — Given le interfacce `ChatProvider`, `TranscriptionProvider`, `ImageProvider`, `EmbeddingProvider`, When un provider le implementa, Then espone i metodi obbligatori (`chat()`, `chatStream()`, `transcribe()`, `generateImage()`, `embed()`) con options standardizzate `{ model, temperature, maxTokens, abortSignal }`
2. **Capability Declaration** — Given un provider, When si interroga `static get capabilities()`, Then ritorna l'array delle capability supportate (es. `['chat', 'chatStream', 'transcribe']`)
3. **Registry Registration** — Given `ProviderRegistry.register('openai', OpenAIProvider, { default: true })`, When si chiama `ProviderRegistry.getProvider('chat')`, Then ritorna il provider default per la capability `chat`
4. **Missing Provider Error** — Given nessun provider registrato per una capability, When si richiede, Then viene lanciato un errore chiaro con messaggio i18n (NFR19)

## Tasks / Subtasks

- [x] Task 1: Creare la directory `scripts/ai/providers/` e la directory test `tests/ai/providers/` (AC: tutti)
  - [x] 1.1: `mkdir -p scripts/ai/providers/ tests/ai/providers/`

- [x] Task 2: Implementare `ChatProvider.mjs` — interfaccia base chat (AC: #1, #2)
  - [x] 2.1: Classe astratta con metodi `async chat(messages, options = {})` → `{ content, usage }` e `async *chatStream(messages, options = {})` → async iterator di `{ token, done }`
  - [x] 2.2: `static get capabilities()` di default ritorna `['chat', 'chatStream']`
  - [x] 2.3: Ogni metodo non implementato lancia `Error` con messaggio i18n via `game.i18n.format('VOXCHRONICLE.Provider.Error.NotImplemented', { method: 'chat' })`
  - [x] 2.4: Guard `new.target` nel costruttore: se `new.target === ChatProvider` lancia errore (pattern da `RAGProvider.mjs`)
  - [x] 2.5: Validazione options in metodo protetto `_validateOptions(options)` — controlla `abortSignal` se presente e' un `AbortSignal`
  - [x] 2.6: Test completi in `tests/ai/providers/ChatProvider.test.js`

- [x] Task 3: Implementare `TranscriptionProvider.mjs` — interfaccia base transcription (AC: #1, #2)
  - [x] 3.1: Classe astratta con metodo `async transcribe(audioBlob, options = {})` → `{ text, segments }`
  - [x] 3.2: `static get capabilities()` ritorna `['transcribe']`
  - [x] 3.3: Guard `new.target` nel costruttore (pattern RAGProvider.mjs)
  - [x] 3.4: Validazione: `audioBlob` deve essere `Blob` o avere `.size` e `.type`; `_validateOptions(options)` per options comuni
  - [x] 3.5: Test completi in `tests/ai/providers/TranscriptionProvider.test.js`

- [x] Task 4: Implementare `ImageProvider.mjs` — interfaccia base image (AC: #1, #2)
  - [x] 4.1: Classe astratta con metodo `async generateImage(prompt, options = {})` → `{ data, format }`
  - [x] 4.2: `static get capabilities()` ritorna `['generateImage']`
  - [x] 4.3: Guard `new.target` nel costruttore (pattern RAGProvider.mjs)
  - [x] 4.4: Validazione: `prompt` deve essere stringa non vuota; `_validateOptions(options)` per options comuni
  - [x] 4.5: Test completi in `tests/ai/providers/ImageProvider.test.js`

- [x] Task 5: Implementare `EmbeddingProvider.mjs` — interfaccia base embedding (AC: #1, #2)
  - [x] 5.1: Classe astratta con metodo `async embed(text, options = {})` → `{ embedding, dimensions }`
  - [x] 5.2: `static get capabilities()` ritorna `['embed']`
  - [x] 5.3: Guard `new.target` nel costruttore (pattern RAGProvider.mjs)
  - [x] 5.4: Validazione: `text` deve essere stringa non vuota; `_validateOptions(options)` per options comuni
  - [x] 5.5: Test completi in `tests/ai/providers/EmbeddingProvider.test.js`

- [x] Task 6: Implementare `ProviderRegistry.mjs` — registry centrale (AC: #3, #4)
  - [x] 6.1: Classe con `register(name, providerInstance, options = {})` — riceve un'istanza gia' costruita del provider (NON una classe). L'AC usa `OpenAIProvider` come shorthand ma il registry opera su istanze. Opzione `{ default: true }` marca il provider come default per tutte le sue capability.
  - [x] 6.2: `getProvider(capability)` — ritorna provider default per capability, lancia errore i18n se nessun provider registrato
  - [x] 6.3: `getProviderByName(name)` — ritorna provider per nome
  - [x] 6.4: `listProviders()` — ritorna mappa nome→capabilities
  - [x] 6.5: `setDefault(name, capability)` — cambia provider default per capability specifica
  - [x] 6.6: `unregister(name)` — rimuove provider, aggiorna defaults
  - [x] 6.7: Emette eventi su EventBus canale `ai:`: `ai:providerRegistered`, `ai:providerUnregistered`, `ai:defaultChanged`
  - [x] 6.8: Singleton pattern con `static getInstance()` e `static resetInstance()`
  - [x] 6.9: Test completi in `tests/ai/providers/ProviderRegistry.test.js` — copertura registrazione, selezione, errori, eventi

- [x] Task 7: Aggiungere stringhe i18n per errori provider in tutti gli 8 file lang (AC: #4)
  - [x] 7.1: Chiavi da aggiungere sotto `VOXCHRONICLE.Provider.Error`:
    - `NotImplemented`: metodo astratto non implementato
    - `NoProvider`: nessun provider per capability
    - `AlreadyRegistered`: provider con stesso nome gia' registrato (warning)
    - `NotFound`: provider non trovato per nome
    - `InvalidCapability`: capability non riconosciuta

- [x] Task 8: Eseguire test completi e verificare zero regressioni (AC: tutti)
  - [x] 8.1: `npm test` — tutti i test esistenti devono passare (eseguire `npm test` PRIMA di iniziare per registrare il baseline count)
  - [x] 8.2: Tutti i nuovi test provider devono passare

## Dev Notes

### Pattern Architetturali da Seguire

**Interfacce astratte** — Usare classi JS con metodi che lanciano `Error('Not implemented')`. NON usare TypeScript o `@interface`. Pattern identico a `RAGProvider.mjs` che esiste gia' in `scripts/rag/RAGProvider.mjs` come riferimento. CRITICO: ogni interfaccia base DEVE avere guard `new.target` nel costruttore per impedire istanziazione diretta (es. `if (new.target === ChatProvider) throw new Error(...)`).

**Provider sono leaf** — Boundary architetturale: `ai/providers/ → utils/` SOLO. Nessuna dipendenza su core/, narrator/, rag/. Le interfacce base NON importano EventBus — solo ProviderRegistry lo fa.

**Options standardizzate** — Ogni metodo provider accetta `options = {}` con proprieta' opzionali: `{ model, temperature, maxTokens, abortSignal }`. Non aggiungere altre options nell'interfaccia base — le implementazioni concrete possono estendere.

**Capability-based selection** — `ProviderRegistry.getProvider('chat')` NON `getProvider('openai')`. La selezione e' per capability, non per nome. `getProviderByName('openai')` esiste per casi specifici.

**Contratto metodi** (dall'architettura — NON cambiare):
```javascript
// ChatProvider
async chat(messages, options = {})        // → { content, usage }
async *chatStream(messages, options = {}) // → async iterator di { token, done }

// TranscriptionProvider
async transcribe(audioBlob, options = {}) // → { text, segments }

// ImageProvider
async generateImage(prompt, options = {}) // → { data, format }

// EmbeddingProvider
async embed(text, options = {})           // → { embedding, dimensions }
```

**ProviderRegistry singleton** — Segue il pattern `VoxChronicle.getInstance()` / `resetInstance()` gia' stabilito. NON usare `export const providerRegistry = new ProviderRegistry()` come fanno EventBus e ResilienceRegistry — ProviderRegistry usa SOLO `static getInstance()` / `static resetInstance()` perche' ha bisogno di reset pulito per i test e per riconfigurazioni runtime (diversamente da EventBus/ResilienceRegistry che usano named export singletons).

**EventBus integration** — ProviderRegistry emette eventi sul canale `ai:` quando provider vengono registrati/deregistrati. Importa `eventBus` da `../core/EventBus.mjs`. Payload sempre oggetto: `{ providerName, capabilities }`.

### Codice Esistente Rilevante

- **`scripts/rag/RAGProvider.mjs`** — Esempio di interfaccia astratta nel progetto. Pattern da seguire per le 4 nuove interfacce.
- **`scripts/core/EventBus.mjs`** — Singleton `eventBus` esportato. Canali validi: `['ai', 'audio', 'scene', 'session', 'ui', 'error', 'analytics']`. Formato eventi: `channel:actionCamelCase`.
- **`scripts/core/ResilienceRegistry.mjs`** — Pattern singleton e EventBus integration da riferimento.
- **`scripts/ai/OpenAIClient.mjs`** — Client HTTP base attuale. Story 2.2 lo refactorizzerà. Per ora NON modificare.
- **`scripts/utils/Logger.mjs`** — Usare `Logger.createChild('ProviderRegistry')` per logging.

### Project Structure Notes

Nuovi file da creare (tutti con estensione `.mjs`):
```
scripts/ai/providers/
├── ChatProvider.mjs
├── TranscriptionProvider.mjs
├── ImageProvider.mjs
├── EmbeddingProvider.mjs
└── ProviderRegistry.mjs

tests/ai/providers/
├── ChatProvider.test.js
├── TranscriptionProvider.test.js
├── ImageProvider.test.js
├── EmbeddingProvider.test.js
└── ProviderRegistry.test.js
```

NON creare `OpenAI*Provider.mjs` in questa story — quelli sono Story 2.2.

### Anti-Pattern: Cose da NON Fare

- **NON modificare `OpenAIClient.mjs`** — rimane intatto per Story 2.2
- **NON refactorare servizi esistenti** (TranscriptionService, ImageGenerationService, etc.) — quello e' Story 2.2
- **NON creare implementazioni concrete** (OpenAIChatProvider, etc.) — solo interfacce astratte + registry
- **NON aggiungere settings Foundry** — nessuna nuova impostazione richiesta per questa story
- **NON importare da core/ nelle interfacce base** — solo ProviderRegistry importa EventBus
- **NON usare `console.log`** — sempre `Logger.createChild()`
- **NON usare stringhe hardcoded per errori** — usare `game.i18n.localize()` per stringhe statiche, `game.i18n.format()` per stringhe con parametri (es. `{method}`, `{capability}`)

### Stringhe i18n da Aggiungere

Aggiungere in TUTTI gli 8 file lang (`en.json`, `it.json`, `de.json`, `es.json`, `fr.json`, `ja.json`, `pt.json`, `template.json`) sotto la chiave `VOXCHRONICLE.Provider.Error`:

```json
{
  "VOXCHRONICLE": {
    "Provider": {
      "Error": {
        "NotImplemented": "Method {method} must be implemented by provider subclass",
        "NoProvider": "No provider registered for capability: {capability}",
        "AlreadyRegistered": "Provider '{name}' is already registered, overwriting",
        "NotFound": "Provider '{name}' not found in registry",
        "InvalidCapability": "Unknown capability: {capability}"
      }
    }
  }
}
```

### Testing Standards

- Framework: **Vitest** con `jsdom` environment
- Mock `game` object globale con `i18n.localize` e `i18n.format`
- Mock `EventBus` con `vi.fn()` per verificare emissioni eventi
- Test sia happy path che error cases
- Test che i metodi astratti lanciano errori appropriati
- Test ProviderRegistry: registrazione, selezione, default management, errori i18n, eventi EventBus
- Segui il pattern dei test esistenti in `tests/core/EventBus.test.js` e `tests/core/ResilienceRegistry.test.js`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#2. AI Provider Abstraction]
- [Source: _bmad-output/planning-artifacts/architecture.md#2. Provider Interface — Contratto e Registrazione]
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- [Source: scripts/rag/RAGProvider.mjs — pattern interfaccia astratta]
- [Source: scripts/core/EventBus.mjs — singleton e canali tipizzati]
- [Source: scripts/core/ResilienceRegistry.mjs — pattern circuit breaker con EventBus]
- [Source: CLAUDE.md — coding standards, testing patterns, localization requirements]

### Previous Story Intelligence (Epic 1)

**Key learnings from Epic 1:**
- EventBus singleton esportato come `export const eventBus = new EventBus()` — importare cosi', non creare nuove istanze
- Tutti i componenti Epic 1 usano `Object.freeze()` per enum/costanti — seguire lo stesso pattern per capability names se serve
- ResilienceRegistry accetta EventBus opzionale nel costruttore — ProviderRegistry deve importare il singleton direttamente
- Test Epic 1: pattern mock `game` object con `vi.fn()` per `i18n.localize` e `i18n.format`
- Tutti i test passano (4733+) — assicurarsi zero regressioni

**Git patterns recenti:**
- Commit style: `feat: add X (Story Y.Z)` per feature, `fix: description` per bugfix
- File naming: `PascalCase.mjs` per classi
- Test naming: `PascalCase.test.js`

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- ChatProvider.test.js had missing `async` keyword on one test — fixed during Task 8 regression run

### Completion Notes List
- ✅ Task 1: Created `scripts/ai/providers/` and `tests/ai/providers/` directories
- ✅ Task 2: ChatProvider with abstract guard, capabilities, chat(), chatStream(), _validateOptions() — 12 tests
- ✅ Task 3: TranscriptionProvider with _validateAudioBlob() for Blob/blob-like validation — 13 tests
- ✅ Task 4: ImageProvider with _validatePrompt() for non-empty string validation — 12 tests
- ✅ Task 5: EmbeddingProvider with _validateText() for non-empty string validation — 12 tests
- ✅ Task 6: ProviderRegistry singleton with register/unregister, capability-based getProvider, auto-default promotion, EventBus events — 25 tests
- ✅ Task 7: i18n strings added to all 8 lang files (en, it, de, es, fr, ja, pt, template)
- ✅ Task 8: Full regression: 4807 tests passed (baseline 4733 + 74 new), 64 files, zero regressions

### Change Log
- 2026-03-10: Story 2.1 implementation complete — 4 abstract provider interfaces + ProviderRegistry + i18n
- 2026-03-10: Code review (Claude Opus 4.6) — 5 issues fixed (2 HIGH, 3 MEDIUM), 6 tests added, 4813 total tests pass

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (adversarial review)
**Date:** 2026-03-10
**Outcome:** APPROVED after fixes

**Issues Found & Fixed (5/5):**

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| H1 | HIGH | Test i18n usano try/catch fragile — assertions mai eseguite se metodo non lancia | Rimosso try/catch, usato `rejects.toThrow()` + assertion i18n separata (4 file) |
| H2 | HIGH | `register()` non valida `providerInstance` — null/primitivi causano errori criptici | Aggiunto guard `TypeError` per null, non-object, non-function constructor |
| M1 | MEDIUM | `_validatePrompt()/_validateText()` accettano stringhe solo-whitespace | Cambiato `.length` → `.trim().length` |
| M2 | MEDIUM | `_validateAudioBlob()` accetta blob con size 0 | Aggiunto check `audioBlob.size === 0` |
| M3 | MEDIUM | `setDefault()` errore i18n fuorviante — `InvalidCapability` per mismatch provider | Nuova chiave `ProviderCapabilityMismatch` in 8 lang files |

**Issues Noted (2 LOW, non fixati — by design):**
- L1: `_validateOptions()` duplicato in 4 interfacce (coerente con boundary architetturali)
- L2: ProviderRegistry senza guard `new.target` (segue pattern VoxChronicle esistente)

**Test Results:** 4813 passed, 0 failed, 64 files (baseline 4807 + 6 nuovi)

### File List
- scripts/ai/providers/ChatProvider.mjs (new)
- scripts/ai/providers/TranscriptionProvider.mjs (new)
- scripts/ai/providers/ImageProvider.mjs (new)
- scripts/ai/providers/EmbeddingProvider.mjs (new)
- scripts/ai/providers/ProviderRegistry.mjs (new)
- tests/ai/providers/ChatProvider.test.js (new)
- tests/ai/providers/TranscriptionProvider.test.js (new)
- tests/ai/providers/ImageProvider.test.js (new)
- tests/ai/providers/EmbeddingProvider.test.js (new)
- tests/ai/providers/ProviderRegistry.test.js (new)
- lang/en.json (modified — Provider.Error keys)
- lang/it.json (modified — Provider.Error keys)
- lang/de.json (modified — Provider.Error keys)
- lang/es.json (modified — Provider.Error keys)
- lang/fr.json (modified — Provider.Error keys)
- lang/ja.json (modified — Provider.Error keys)
- lang/pt.json (modified — Provider.Error keys)
- lang/template.json (modified — Provider.Error keys)
