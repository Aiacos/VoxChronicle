# Story 2.4: StreamController UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want to see AI responses appearing token by token in real time,
So that I can start reading immediately without waiting for the complete response.

## Acceptance Criteria

1. **Buffer 60fps** — Given un `ChatProvider.chatStream()` attivo, When i token arrivano, Then StreamController li bufferizza e li fluscia al DOM ogni 16ms (60fps)
2. **Cursore lampeggiante** — Given lo streaming e' in corso, When l'utente vede il pannello, Then il testo appare progressivamente con cursore lampeggiante (CSS animation, NOT real flash — NFR25: no flash >3Hz)
3. **Transizione completamento** — Given lo streaming completa, When l'ultimo token arriva, Then il cursore scompare e il font passa da monospace (`--vox-font-streaming`) a body (`--vox-font-body`)
4. **Eventi EventBus** — Given eventi streaming, When partono/finiscono, Then vengono emessi `ai:streamStart`, `ai:token`, `ai:streamEnd`, `ai:streamError` su EventBus (canale `ai` gia' valido)
5. **Cancellazione** — Given l'utente vuole interrompere, When invoca cancel, Then `AbortController` interrompe il provider e StreamController pulisce il DOM
6. **Latenza primo token** — Given le risposte Rules Q&A, When streaming inizia, Then il primo token appare entro 1 secondo dalla richiesta (NFR2)

## Tasks / Subtasks

- [x] Task 1: Creare `scripts/ai/StreamController.mjs` — core streaming engine (AC: #1, #2, #3, #5)
  - [x] 1.1: Classe `StreamController` con costruttore `(targetElement, options = {})` dove `options` include `{ flushInterval, onToken, onComplete, onError, eventBus }`
  - [x] 1.2: Metodo `async stream(asyncIterator, abortSignal?)` — consuma un async iterator da `chatStream()`, bufferizza token, fluscia ogni `flushInterval` ms (default 16ms) al DOM via `requestAnimationFrame`
  - [x] 1.3: Buffer interno: accumula token tra un flush e il successivo, poi scrive tutto il buffer in un unico DOM update (batch write)
  - [x] 1.4: Gestione stato: `idle` → `streaming` → `complete` / `cancelled` / `error`. Proprietà `state` pubblica readonly
  - [x] 1.5: Metodo `cancel()` — invoca `AbortController.abort()`, pulisce buffer, rimuove cursore, imposta stato `cancelled`
  - [x] 1.6: Metodo `reset()` — riporta a `idle`, svuota il `targetElement`, rimuove classi CSS streaming
  - [x] 1.7: Proprietà `fullText` — accumula tutto il testo streamato per uso programmatico
  - [x] 1.8: Auto-scroll: se `targetElement` e' scrollabile e l'utente non ha scrollato manualmente verso l'alto, scroll automatico a fondo durante streaming

- [x] Task 2: CSS per streaming text e cursore (AC: #2, #3)
  - [x] 2.1: Aggiungere in `styles/vox-chronicle.css` le classi:
    - `.vox-chronicle-stream` — container streaming con `--vox-font-streaming` (monospace leggero)
    - `.vox-chronicle-stream--active` — stato streaming attivo con `--vox-streaming-text-color`
    - `.vox-chronicle-stream--complete` — transizione a `--vox-font-body`
    - `.vox-chronicle-stream__cursor` — pseudo-element `::after` con `content: '▌'` e `animation: vox-blink 1s step-end infinite`
  - [x] 2.2: Animazione `@keyframes vox-blink` — blink a step (NOT smooth — rispetta NFR25: max 3 flash/sec, 1Hz e' sicuro)
  - [x] 2.3: `@media (prefers-reduced-motion: reduce)` — disabilita animazione cursore, mostra cursore statico
  - [x] 2.4: Transizione font: `transition: font-family 0.2s ease` su `.vox-chronicle-stream` per smooth switch monospace→body

- [x] Task 3: Integrazione EventBus (AC: #4)
  - [x] 3.1: In `stream()`, emettere `ai:streamStart` con payload `{ targetElement, timestamp }` all'inizio
  - [x] 3.2: Ad ogni flush, emettere `ai:token` con payload `{ tokens: bufferedText, charCount: totalChars }` (NOT per ogni singolo token — per batch flusciato)
  - [x] 3.3: Al completamento, emettere `ai:streamEnd` con payload `{ fullText, charCount, duration }`
  - [x] 3.4: Su errore, emettere `ai:streamError` con payload `{ error, partialText }` prima di propagare
  - [x] 3.5: Su cancellazione, emettere `ai:streamEnd` con payload `{ fullText: partialText, charCount, duration, cancelled: true }`

- [x] Task 4: Test in `tests/ai/StreamController.test.js` (AC: tutti)
  - [x] 4.1: Test buffering: verificare che token multipli vengono batchati in un singolo DOM update (mock `requestAnimationFrame`)
  - [x] 4.2: Test flush interval: con `vi.useFakeTimers()`, verificare flush ogni 16ms
  - [x] 4.3: Test stati: `idle` → `streaming` → `complete`, `idle` → `streaming` → `cancelled`, `idle` → `streaming` → `error`
  - [x] 4.4: Test cancellation: `cancel()` invoca abort, rimuove cursore, pulisce stato
  - [x] 4.5: Test EventBus: verificare emissione `ai:streamStart`, `ai:token`, `ai:streamEnd`, `ai:streamError` con payload corretto
  - [x] 4.6: Test `fullText`: accumula tutti i token streamati
  - [x] 4.7: Test CSS classes: verifica aggiunta/rimozione `.vox-chronicle-stream--active`, `.vox-chronicle-stream--complete`, `__cursor`
  - [x] 4.8: Test `reset()`: riporta a idle, svuota element, rimuove classi
  - [x] 4.9: Test senza EventBus: funziona correttamente se `eventBus` non fornito (opzionale)
  - [x] 4.10: Test auto-scroll: verifica `scrollTop` aggiornato durante streaming
  - [x] 4.11: Test `prefers-reduced-motion`: cursore statico (CSS-only, no JS test needed — document as CSS-only)
  - [x] 4.12: Test errore da iterator: async iterator che lancia errore → stato `error`, evento `ai:streamError`
  - [x] 4.13: Test stream multipli sequenziali: secondo `stream()` dopo il primo completo funziona correttamente
  - [x] 4.14: Test `aria-live="polite"` attribute presente su targetElement durante streaming
  - [x] Minimo 25 test (32 test scritti)

- [x] Task 5: Aggiungere stringhe i18n per streaming in tutti gli 8 file lang (AC: #4, #5)
  - [x] 5.1: Chiavi sotto `VOXCHRONICLE.Stream`:
    - `Started`: "Streaming started"
    - `Completed`: "Streaming completed ({charCount} characters, {duration}ms)"
    - `Cancelled`: "Streaming cancelled by user"
    - `Error`: "Streaming error: {error}"
    - `FirstToken`: "First token received in {latency}ms"
  - [x] 5.2: Aggiornare tutti gli 8 file lang (en, it, de, es, fr, ja, pt, template)

- [x] Task 6: Eseguire test completi e verificare zero regressioni (AC: tutti)
  - [x] 6.1: `npm test` — tutti i test passano (5028, baseline era 4996)
  - [x] 6.2: Nuovi test: 32 test aggiuntivi (sopra minimo 25)
  - [x] 6.3: Nessun test preesistente rotto

## Dev Notes

### Pattern Architetturali da Seguire

**StreamController — Buffer + rAF pattern:**

```javascript
import { Logger } from '../utils/Logger.mjs';

export class StreamController {
  #target;
  #options;
  #buffer = '';
  #fullText = '';
  #state = 'idle'; // idle | streaming | complete | cancelled | error
  #abortController = null;
  #rafId = null;
  #logger;
  #eventBus;
  #startTime = 0;

  constructor(targetElement, options = {}) {
    if (!targetElement) throw new Error('targetElement is required');
    this.#target = targetElement;
    this.#options = {
      flushInterval: options.flushInterval ?? 16,
      onToken: options.onToken ?? null,
      onComplete: options.onComplete ?? null,
      onError: options.onError ?? null,
      ...options,
    };
    this.#eventBus = options.eventBus ?? null;
    this.#logger = Logger.createChild('StreamController');
  }

  get state() { return this.#state; }
  get fullText() { return this.#fullText; }

  async stream(asyncIterator, abortSignal) {
    if (this.#state === 'streaming') {
      throw new Error('Already streaming — call cancel() or reset() first');
    }

    this.#state = 'streaming';
    this.#buffer = '';
    this.#fullText = '';
    this.#startTime = performance.now();
    this.#abortController = new AbortController();

    // Link external abort signal if provided
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => this.cancel(), { once: true });
    }

    // Add CSS classes and accessibility
    this.#target.classList.add('vox-chronicle-stream', 'vox-chronicle-stream--active');
    this.#target.setAttribute('aria-live', 'polite');

    this.#eventBus?.emit('ai:streamStart', {
      targetElement: this.#target,
      timestamp: Date.now(),
    });

    // Start flush loop
    this.#startFlushLoop();

    try {
      for await (const chunk of asyncIterator) {
        if (this.#abortController.signal.aborted) break;
        if (chunk.done) break;

        this.#buffer += chunk.token;
        this.#fullText += chunk.token;
        this.#options.onToken?.(chunk.token);
      }

      if (this.#state === 'streaming') {
        // Final flush
        this.#flush();
        this.#complete();
      }
    } catch (error) {
      if (this.#state !== 'cancelled') {
        this.#handleError(error);
      }
    }
  }

  cancel() {
    if (this.#state !== 'streaming') return;
    this.#abortController?.abort();
    this.#state = 'cancelled';
    this.#stopFlushLoop();
    this.#flush(); // flush remaining buffer
    this.#removeCursor();

    this.#eventBus?.emit('ai:streamEnd', {
      fullText: this.#fullText,
      charCount: this.#fullText.length,
      duration: performance.now() - this.#startTime,
      cancelled: true,
    });
  }

  reset() {
    this.#stopFlushLoop();
    this.#state = 'idle';
    this.#buffer = '';
    this.#fullText = '';
    this.#target.textContent = '';
    this.#target.classList.remove(
      'vox-chronicle-stream', 'vox-chronicle-stream--active', 'vox-chronicle-stream--complete'
    );
    this.#target.removeAttribute('aria-live');
  }
}
```

**ATTENZIONE — `requestAnimationFrame` in jsdom:**
jsdom non ha `requestAnimationFrame`. Nei test, mock con:
```javascript
globalThis.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = vi.fn(id => clearTimeout(id));
```
Oppure usa `vi.useFakeTimers()` con `shouldAdvanceTime: true` per simulare il timing.

**Flush loop pattern:**
```javascript
#startFlushLoop() {
  const flushTick = () => {
    if (this.#state !== 'streaming') return;
    this.#flush();
    this.#rafId = requestAnimationFrame(flushTick);
  };
  this.#rafId = requestAnimationFrame(flushTick);
}

#stopFlushLoop() {
  if (this.#rafId !== null) {
    cancelAnimationFrame(this.#rafId);
    this.#rafId = null;
  }
}

#flush() {
  if (this.#buffer.length === 0) return;
  const text = this.#buffer;
  this.#buffer = '';

  // Append to existing text content (no innerHTML — XSS safe)
  this.#target.textContent += text;

  // Auto-scroll if at bottom
  if (this.#isScrolledToBottom()) {
    this.#target.scrollTop = this.#target.scrollHeight;
  }

  this.#eventBus?.emit('ai:token', {
    tokens: text,
    charCount: this.#fullText.length,
  });
}
```

**NOTA SICUREZZA:** Usare `textContent` (NOT `innerHTML`) per appendere token al DOM. I token dall'AI potrebbero contenere HTML — `textContent` e' XSS-safe per default.

### Boundary Architetturali

```
┌──────────────────────────────────────────────────────┐
│  ai/StreamController.mjs                    ← NEW    │
│    → imports Logger (utils/)                          │
│    → accepts eventBus (optional, from core/EventBus)  │
│    → accepts targetElement (DOM element)               │
│    → consumes async iterator from ChatProvider         │
│    NESSUNA dipendenza circolare                       │
├──────────────────────────────────────────────────────┤
│  styles/vox-chronicle.css                   ← MODIFY │
│    → aggiungi classi .vox-chronicle-stream*           │
│    → aggiungi @keyframes vox-blink                    │
│    → aggiungi @media prefers-reduced-motion           │
├──────────────────────────────────────────────────────┤
│  lang/*.json (8 file)                       ← MODIFY │
│    → aggiungi chiavi VOXCHRONICLE.Stream.*            │
└──────────────────────────────────────────────────────┘
```

File da NON toccare:
```
scripts/ai/providers/ChatProvider.mjs         ← INVARIATO (interfaccia immutabile)
scripts/ai/providers/OpenAIChatProvider.mjs   ← INVARIATO (chatStream() gia' funzionante)
scripts/ai/providers/CachingProviderDecorator.mjs ← INVARIATO (chatStream passthrough)
scripts/core/EventBus.mjs                    ← INVARIATO (canale 'ai' gia' esistente)
scripts/core/VoxChronicle.mjs                ← NON integrare StreamController qui (sara' Epic 6)
scripts/ui/MainPanel.mjs                     ← NON integrare qui (sara' Epic 6)
```

### Codice Esistente Rilevante

**`scripts/ai/providers/ChatProvider.mjs`** — Interfaccia astratta con `chatStream(messages, options)` che ritorna `AsyncGenerator<{token: string, done: boolean}>`. StreamController consuma esattamente questo formato.

**`scripts/ai/providers/OpenAIChatProvider.mjs`** — Implementazione concreta. `chatStream()` itera su `postStream()` e yielda `{ token: content, done: false }` per ogni chunk, poi `{ token: '', done: true }` alla fine. Il `postStream` bypassa la request queue.

**`scripts/core/EventBus.mjs`** — Canali validi: `['ai', 'audio', 'scene', 'session', 'ui', 'error', 'analytics']`. Il canale `ai` e' valido, quindi `ai:streamStart`, `ai:token`, `ai:streamEnd`, `ai:streamError` funzionano senza modifiche.

**`scripts/ai/providers/CachingProviderDecorator.mjs`** — `CachingChatDecorator.chatStream()` fa passthrough diretto al provider interno. Non cachea streaming. StreamController riceve lo stesso iterator indipendentemente dal decorator.

**`styles/vox-chronicle.css`** — Ha gia' design tokens definiti in `styles/tokens/`. I token rilevanti per streaming:
- `--vox-font-streaming` (da definire o usare monospace system)
- `--vox-streaming-text-color` (da definire)
- `--vox-led-streaming: #8b5cf6` (viola, gia' nel UX spec)

### Gotchas Critici

1. **`requestAnimationFrame` non esiste in jsdom** — Mock obbligatorio nei test. Usare `globalThis.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 0))` e `globalThis.cancelAnimationFrame = vi.fn(id => clearTimeout(id))`.

2. **`textContent` vs `innerHTML`** — USARE SOLO `textContent` per appendere token. Mai `innerHTML` — i token AI possono contenere markup arbitrario e sarebbe un vettore XSS.

3. **Auto-scroll detection** — Verificare se l'utente ha scrollato manualmente: `const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10`. Se ha scrollato via, NON forzare scroll automatico.

4. **`performance.now()` nei test** — Disponibile in jsdom. Usare per misurare durata e latenza primo token.

5. **Abort signal linking** — Se il caller passa un `abortSignal` esterno, linkarlo al `#abortController` interno con `addEventListener('abort', ...)`. Ma NON abortare il signal esterno se `cancel()` e' invocato internamente — solo il controller interno viene abortato.

6. **Stream multipli** — Se `stream()` viene chiamato mentre gia' in streaming, lanciare errore. L'utente deve chiamare `cancel()` o `reset()` prima di un nuovo stream.

7. **EventBus opzionale** — StreamController deve funzionare anche senza EventBus. Tutti gli emit sono condizionali: `this.#eventBus?.emit(...)`.

8. **Font transition** — La transizione monospace→body avviene via CSS class toggle (`.vox-chronicle-stream--active` → `.vox-chronicle-stream--complete`). Non via JS inline style.

9. **`aria-live="polite"`** — Impostare durante streaming per screen reader. `polite` perche' non deve interrompere — il DM potrebbe star parlando. Rimuovere con `reset()`.

10. **Cursore come pseudo-element** — Il cursore lampeggiante e' un `::after` pseudo-element sulla classe `--active`. Non serve un elemento DOM separato — sparisce automaticamente togliendo la classe.

### Anti-Pattern: Cose da NON Fare

- **NON usare `innerHTML`** per appendere token — rischio XSS. Usare `textContent`
- **NON emettere `ai:token` per OGNI singolo token** — emettere per batch flusciato (ogni ~16ms). Altrimenti si intasa l'EventBus
- **NON usare `setInterval`** per il flush loop — usare `requestAnimationFrame` per sincronizzarsi con il rendering del browser
- **NON creare un nuovo EventBus** — usare l'istanza globale `eventBus` dal modulo `core/EventBus.mjs`
- **NON integrare StreamController in VoxChronicle.mjs o MainPanel** in questa story — l'integrazione UI sara' in Epic 6
- **NON modificare le interfacce provider** — StreamController consuma l'iterator, non modifica il provider
- **NON usare `document.createElement`** per il cursore — usare pseudo-element CSS `::after`
- **NON implementare markdown rendering** in questa story — il testo e' plain text. Markdown rendering sara' considerato in Epic 6
- **NON aggiungere dipendenze npm** — tutto con API browser native (`requestAnimationFrame`, `AbortController`, `performance.now`)

### Stringhe i18n da Aggiungere

Aggiungere in TUTTI gli 8 file lang sotto le chiavi indicate:

```json
{
  "VOXCHRONICLE": {
    "Stream": {
      "Started": "Streaming started",
      "Completed": "Streaming completed ({charCount} characters, {duration}ms)",
      "Cancelled": "Streaming cancelled by user",
      "Error": "Streaming error: {error}",
      "FirstToken": "First token received in {latency}ms"
    }
  }
}
```

### Testing Standards

- Framework: **Vitest** con `jsdom` environment
- Mock `game` object globale con `i18n.localize` e `i18n.format`
- Mock `requestAnimationFrame` e `cancelAnimationFrame` (non disponibili in jsdom)
- Mock `performance.now()` se serve timing deterministico (altrimenti usare il reale)
- Per async iterator: creare helper `async function* mockStream(tokens)` che yielda token con delay configurabile
- Per EventBus: creare mock con `emit: vi.fn()` per verificare payload
- Per AbortController: testare sia abort esterno (signal passato) che interno (`cancel()`)
- `vi.useFakeTimers()` per test deterministici su flush timing
- **Baseline test count**: 4996 test — TUTTI devono passare senza regressioni

### Project Structure Notes

Nuovi file da creare:
```
scripts/ai/
└── StreamController.mjs                    ← NEW

tests/ai/
└── StreamController.test.js               ← NEW
```

File da MODIFICARE:
```
styles/vox-chronicle.css                    ← ADD streaming CSS classes
lang/en.json                                ← ADD Stream.* keys
lang/it.json                                ← ADD Stream.* keys
lang/de.json                                ← ADD Stream.* keys
lang/es.json                                ← ADD Stream.* keys
lang/fr.json                                ← ADD Stream.* keys
lang/ja.json                                ← ADD Stream.* keys
lang/pt.json                                ← ADD Stream.* keys
lang/template.json                          ← ADD Stream.* keys
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#7. Streaming Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4]
- [Source: _bmad-output/planning-artifacts/prd.md#FR15 — Streaming risposte AI token-per-token]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR2 — Rules Q&A streaming entro 1 secondo]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR25 — No flash >3Hz]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#LED Status Indicator — streaming viola]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Suggestion Card — streaming state]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Typography — vox-font-streaming]
- [Source: scripts/ai/providers/ChatProvider.mjs — chatStream() interface]
- [Source: scripts/ai/providers/OpenAIChatProvider.mjs — chatStream() implementation]
- [Source: scripts/core/EventBus.mjs — valid channels include 'ai']
- [Source: CLAUDE.md — coding standards, testing patterns, localization requirements]

### Previous Story Intelligence (Story 2.3)

**Key learnings from Story 2.3:**
- `destroy()` pattern per listener cleanup — AIAssistant e RulesReference ora hanno `destroy()` che rimuove listeners EventBus. StreamController dovrebbe avere un metodo analogo se registra listeners su EventBus (ma StreamController emette solo, non ascolta — quindi `reset()` basta)
- `chatStream` bypassa queue e cache — il decorator fa passthrough, l'iterator arriva invariato a StreamController
- `invalidatePrefix` collect-then-delete pattern — per evitare mutation durante iterazione Map
- Performance test con `performance.now()` — pattern stabilito e funzionante
- Commit style: `feat: description (Story X.Y)`
- Test baseline: 4996 test across 69 files
- Code review ha trovato 4 CRITICAL + 8 HIGH — aspettarsi scrutinio simile, prevenire proattivamente

**Code review findings da Story 2.3 applicabili:**
- C2: Memory leak listeners — StreamController NON registra listeners su EventBus (solo emit), quindi non ha questo problema
- C3: Map mutation during iteration — non applicabile (no Map iteration in StreamController)
- H3: `skipCache` leaked to inner provider — non applicabile (StreamController non interagisce con cache)
- H6: Object mutation — NON mutare oggetti caller. Se StreamController modifica `options`, creare copia

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nessun debug necessario — implementazione pulita al primo tentativo.

### Completion Notes List

- ✅ StreamController implementato con TDD (32 test RED → GREEN → REFACTOR)
- ✅ Buffer rAF pattern: token accumulati e flushati a 60fps via requestAnimationFrame
- ✅ State machine completa: idle → streaming → complete/cancelled/error
- ✅ XSS safe: usa textContent (mai innerHTML) per appendere token
- ✅ EventBus opzionale: emette ai:streamStart, ai:token, ai:streamEnd, ai:streamError
- ✅ Auto-scroll intelligente: scroll automatico solo se utente è in fondo
- ✅ AbortController: supporta sia cancel() interno che AbortSignal esterno
- ✅ Callbacks: onToken, onComplete, onError per integrazione flessibile
- ✅ CSS: cursore lampeggiante ::after con step-end 1Hz (NFR25 safe), prefers-reduced-motion
- ✅ Font transition: monospace (streaming) → body (complete) con CSS transition 0.2s
- ✅ aria-live="polite" per screen reader durante streaming
- ✅ i18n: 5 chiavi Stream.* in 8 lingue (en, it, de, es, fr, ja, pt, template)
- ✅ Full regression: 5028 test passano, +32 nuovi, 0 regressioni

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (adversarial code review)
**Data:** 2026-03-13
**Findings:** 5 HIGH, 6 MEDIUM, 3 LOW

**Issues fixed (11 HIGH + MEDIUM):**

- [x] [AI-Review][HIGH] H1: `textContent +=` distrugge DOM ad ogni flush → sostituito con `appendChild(document.createTextNode())` O(1)
- [x] [AI-Review][HIGH] H2: `reset()` durante streaming crea zombie iterator → aggiunto `this.#abortController?.abort()` in reset()
- [x] [AI-Review][HIGH] H3: `flushInterval` option dead code → implementato throttling con timestamp check nel flush loop
- [x] [AI-Review][HIGH] H4: Callback exceptions corrompono stato stream → wrappati in `#callbackSafe()` con try-catch
- [x] [AI-Review][HIGH] H5: Init failure tra riga 62-85 blocca istanza → spostato `#state = 'streaming'` dopo init
- [x] [AI-Review][MEDIUM] M1: EventBus.emit() senza try-catch uccide flush loop → wrappati in `#emitSafe()` con try-catch
- [x] [AI-Review][MEDIUM] M2: External AbortSignal listener memory leak → aggiunto `#removeExternalAbortListener()` in complete/error/cancel/reset
- [x] [AI-Review][MEDIUM] M3: Token null/undefined coerced a garbage → aggiunta validazione `typeof chunk.token === 'string'`
- [x] [AI-Review][MEDIUM] M4: CSS hardcoda font stack → definiti design token `--vox-font-streaming` e `--vox-streaming-text-color`
- [x] [AI-Review][MEDIUM] M5: `ai:streamEnd` non emesso su error path → aggiunto emit `ai:streamEnd` con `error: true` in #handleError
- [x] [AI-Review][MEDIUM] M6: Exception nel rAF uccide rendering → aggiunto try-catch nel flushTick

**Tests aggiunti (11 nuovi, totale 43):**
- done:true sentinel, empty stream, reset during streaming, double-cancel, non-string token validation, callback error isolation, EventBus emit error isolation, ai:streamEnd on error path, cancelled:false on normal completion, flushInterval throttling, auto-scroll negative case

**Full regression: 5039 test, 0 failure, 70 file**

### Change Log

- 2026-03-13: Implementazione completa Story 2.4 — StreamController, CSS streaming, i18n
- 2026-03-13: Code review fix — 11 issue (5 HIGH + 6 MEDIUM) corretti, +11 test edge case

### File List

**Nuovi:**
- scripts/ai/StreamController.mjs
- tests/ai/StreamController.test.js

**Modificati:**
- styles/vox-chronicle.css (aggiunte classi .vox-chronicle-stream*, @keyframes vox-blink, @media prefers-reduced-motion)
- styles/tokens/semantic.css (aggiunti token --vox-font-streaming, --vox-streaming-text-color)
- lang/en.json (aggiunte chiavi VOXCHRONICLE.Stream.*)
- lang/it.json (aggiunte chiavi VOXCHRONICLE.Stream.*)
- lang/de.json (aggiunte chiavi VOXCHRONICLE.Stream.*)
- lang/es.json (aggiunte chiavi VOXCHRONICLE.Stream.*)
- lang/fr.json (aggiunte chiavi VOXCHRONICLE.Stream.*)
- lang/ja.json (aggiunte chiavi VOXCHRONICLE.Stream.*)
- lang/pt.json (aggiunte chiavi VOXCHRONICLE.Stream.*)
- lang/template.json (aggiunte chiavi VOXCHRONICLE.Stream.*)
