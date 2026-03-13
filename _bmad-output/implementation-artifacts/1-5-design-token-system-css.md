# Story 1.5: Design Token System CSS

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want VoxChronicle to look visually consistent and integrated with Foundry VTT,
so that the module feels like a natural part of my game environment.

## Acceptance Criteria

1. **Primitives Layer** — Given il file `styles/tokens/primitives.css`, When caricato, Then definisce la palette colori base (`--vox-green-400`, `--vox-purple-500`, etc.) come CSS custom properties in `:root`
2. **Semantic Layer** — Given il file `styles/tokens/semantic.css`, When caricato, Then mappa primitivi a ruoli semantici (`--vox-color-success`, `--vox-color-warning`, `--vox-color-error`, `--vox-color-ai-bg`, `--vox-led-active`, etc.) con fallback a variabili Foundry dove applicabile
3. **Component Layer** — Given il file `styles/tokens/components.css`, When caricato, Then definisce token per-componente (`--vox-led-active`, `--vox-tab-height`, `--vox-suggestion-card-padding`, etc.) derivati da semantici
4. **Theme Adaptation** — Given i design tokens e un tema Foundry (dark/light), When il tema cambia, Then i colori VoxChronicle si adattano automaticamente tramite le variabili Foundry ereditate
5. **CSS Migration** — Given il file `styles/vox-chronicle.css`, When si usa un design token, Then zero colori hex hardcoded rimangono — tutti sostituiti con `var(--vox-*)` references
6. **Module Loading** — Given `module.json`, When Foundry carica il modulo, Then i 3 file token sono caricati PRIMA di `vox-chronicle.css` nell'array `styles`
7. **Test Regression** — Given i test esistenti, When si esegue `npm test`, Then tutti i 4733+ test passano senza regressioni (questa story non modifica codice JavaScript)
8. **Namespace Audit** — Given tutte le classi CSS del modulo, When si esegue un audit, Then zero classi non-namespaced con `.vox-chronicle` prefix

## Tasks / Subtasks

- [x] Task 1: Creare `styles/tokens/primitives.css` (AC: #1)
  - [x] 1.1: Creare directory `styles/tokens/` se non esiste
  - [x] 1.2: Definire palette colori in `:root` con naming `--vox-{colore}-{shade}`:
    ```css
    /* Greens */
    --vox-green-400: #22c55e;
    --vox-green-500: #06d6a0;  /* legacy compat */
    /* Reds */
    --vox-red-400: #ef4444;
    --vox-red-500: #ef233c;    /* legacy compat */
    /* Ambers */
    --vox-amber-400: #f59e0b;
    --vox-amber-500: #fca311;  /* legacy compat */
    /* Blues/Cyans */
    --vox-cyan-400: #4cc9f0;
    --vox-blue-400: #4a9eff;
    /* Purples */
    --vox-purple-400: #8b5cf6;
    --vox-purple-500: #9b59b6; /* legacy compat */
    /* Grays */
    --vox-gray-400: #9e9e9e;
    --vox-gray-500: #6b7280;
    ```
  - [x] 1.3: Definire scale spacing: `--vox-space-xs: 4px`, `--vox-space-sm: 8px`, `--vox-space-md: 12px`, `--vox-space-lg: 16px`, `--vox-space-xl: 24px`
  - [x] 1.4: Definire scale tipografia: `--vox-font-size-xs: 0.65em`, `--vox-font-size-sm: 0.75em`, `--vox-font-size-md: 0.85em`, `--vox-font-size-base: 0.9em`, `--vox-font-size-lg: 1em`
  - [x] 1.5: Definire scale transitions: `--vox-transition-fast: 150ms`, `--vox-transition-normal: 300ms`
  - [x] 1.6: Definire scale border-radius: `--vox-radius-sm: 3px`, `--vox-radius-md: 4px`, `--vox-radius-lg: 10px`

- [x] Task 2: Creare `styles/tokens/semantic.css` (AC: #2, #4)
  - [x] 2.1: Definire colori stato LED con fallback Foundry dove possibile:
    ```css
    --vox-led-active: var(--vox-green-400);
    --vox-led-warning: var(--vox-amber-400);
    --vox-led-error: var(--vox-red-400);
    --vox-led-idle: var(--vox-gray-500);
    --vox-led-streaming: var(--vox-purple-400);
    ```
  - [x] 2.2: Definire colori semantici:
    ```css
    --vox-color-success: var(--vox-green-400);
    --vox-color-warning: var(--vox-amber-400);
    --vox-color-error: var(--vox-red-400);
    --vox-color-info: var(--vox-cyan-400);
    --vox-color-accent: var(--vox-blue-400, var(--color-border-highlight));
    --vox-color-accent-hover: #6ab4ff;
    ```
  - [x] 2.3: Definire colori AI:
    ```css
    --vox-color-ai-bg: rgba(139, 92, 246, 0.08);
    --vox-color-ai-border: rgba(139, 92, 246, 0.25);
    ```
  - [x] 2.4: Definire colori superficie con fallback Foundry:
    ```css
    --vox-color-surface: rgba(255, 255, 255, 0.04);
    --vox-color-surface-hover: rgba(255, 255, 255, 0.08);
    --vox-color-surface-dark: rgba(0, 0, 0, 0.2);
    --vox-color-border: rgba(255, 255, 255, 0.1);
    --vox-color-border-subtle: rgba(255, 255, 255, 0.05);
    ```
  - [x] 2.5: Definire token tipografici:
    ```css
    --vox-font-title: 600 14px var(--font-primary, system-ui);
    --vox-font-tab: 500 12px var(--font-primary, system-ui);
    ```

- [x] Task 3: Creare `styles/tokens/components.css` (AC: #3)
  - [x] 3.1: Definire token componente per recorder status colors:
    ```css
    --vox-recorder-ready: var(--vox-color-success);
    --vox-recorder-recording: var(--vox-color-error);
    --vox-recorder-paused: var(--vox-color-warning);
    --vox-recorder-processing: var(--vox-color-info);
    ```
  - [x] 3.2: Definire token per suggestion card types:
    ```css
    --vox-suggestion-narration: var(--vox-color-info);
    --vox-suggestion-dialogue: var(--vox-color-success);
    --vox-suggestion-action: var(--vox-color-warning);
    --vox-suggestion-reference: var(--vox-purple-400);
    ```
  - [x] 3.3: Definire token per badge/status/mode components:
    ```css
    --vox-badge-api: var(--vox-color-info);
    --vox-badge-local: var(--vox-color-success);
    --vox-badge-auto: var(--vox-color-warning);
    ```
  - [x] 3.4: Definire token layout pannello:
    ```css
    --vox-tab-height: 32px;
    --vox-status-dot-size: 8px;
    --vox-suggestion-card-padding: 8px 12px;
    ```

- [x] Task 4: Aggiornare `module.json` — styles array (AC: #6)
  - [x] 4.1: Modificare array `styles` in `module.json`:
    ```json
    "styles": [
      "styles/tokens/primitives.css",
      "styles/tokens/semantic.css",
      "styles/tokens/components.css",
      "styles/vox-chronicle.css"
    ]
    ```
  - [x] 4.2: L'ordine e' CRITICO — i token devono essere caricati PRIMA del CSS principale

- [x] Task 5: Migrare `styles/vox-chronicle.css` ai design tokens (AC: #5)
  - [x] 5.1: Sostituire TUTTI i colori hex hardcoded con riferimenti `var(--vox-*)`:
    - `#06d6a0` → `var(--vox-color-success)` o `var(--vox-led-active)` a seconda del contesto
    - `#ef233c` → `var(--vox-color-error)` o `var(--vox-led-error)`
    - `#fca311` → `var(--vox-color-warning)` o `var(--vox-led-warning)`
    - `#4cc9f0` → `var(--vox-color-info)`
    - `#9b59b6` → `var(--vox-suggestion-reference)` o `var(--vox-purple-500)`
    - `#9e9e9e` → `var(--vox-gray-400)` o `var(--vox-led-idle)`
    - `#4caf50` → `var(--vox-color-success)`
    - `#ff9800` → `var(--vox-color-warning)`
    - `#2ecc40` → `var(--vox-color-success)`
    - `#ffdc00` → `var(--vox-color-warning)`
    - `#ff4136` → `var(--vox-color-error)`
    - `#e8a040` → `var(--vox-color-warning)`
  - [x] 5.2: Sostituire `rgba()` hardcoded con varianti dei token dove possibile
  - [x] 5.3: Sostituire spacing hardcoded ripetuti con `var(--vox-space-*)` dove significativo
  - [x] 5.4: Sostituire font-size ripetuti con `var(--vox-font-size-*)` dove significativo
  - [x] 5.5: Sostituire transition timing ripetuti con `var(--vox-transition-*)`
  - [x] 5.6: Sostituire border-radius ripetuti con `var(--vox-radius-*)`
  - [x] 5.7: Verificare che `rgba()` alpha variants usino la stessa base del token (consolidare le sfumature divergenti)

- [x] Task 6: Audit namespace CSS (AC: #8)
  - [x] 6.1: Verificare che tutte le classi in `vox-chronicle.css` abbiano prefisso `.vox-chronicle`
  - [x] 6.2: Verificare che nessuna regola usi selettori generici senza namespace (tranne `input[name="vox-chronicle.*"]` che e' gia' namespaced via attributo)

- [x] Task 7: Verifica regressione (AC: #7)
  - [x] 7.1: Eseguire `npm test` — tutti i test devono passare (questa story modifica SOLO CSS, zero JS)
  - [x] 7.2: Verificare visivamente che nessun colore sia "rotto" (i file CSS token definiscono gli stessi valori attuali come baseline)

## Dev Notes

### Architettura e Pattern

- **Posizione file nuovi**:
  - `styles/tokens/primitives.css` — NUOVO
  - `styles/tokens/semantic.css` — NUOVO
  - `styles/tokens/components.css` — NUOVO
- **File modificati**:
  - `styles/vox-chronicle.css` — REFACTOR (sostituzione hex → var())
  - `module.json` — MODIFICA (array styles)
- **Stack**: CSS puro, zero preprocessor, zero build step
- **Nessun file JavaScript modificato** — questa story e' puramente CSS

### Consolidamento Colori

Il CSS attuale ha colori duplicati per lo stesso ruolo semantico. La migrazione deve consolidarli:

| Ruolo | Hex attuali (duplicati) | Token unificato |
|-------|------------------------|-----------------|
| Success/Green | `#06d6a0`, `#4caf50`, `#2ecc40` | `var(--vox-color-success)` |
| Error/Red | `#ef233c`, `#ff4136` | `var(--vox-color-error)` |
| Warning/Amber | `#fca311`, `#ff9800`, `#ffdc00`, `#e8a040` | `var(--vox-color-warning)` |
| Info/Cyan | `#4cc9f0` | `var(--vox-color-info)` |
| Purple | `#9b59b6` | `var(--vox-purple-500)` |
| Gray | `#9e9e9e` | `var(--vox-gray-400)` |

**DECISIONE CRITICA:** I valori primitivi mantengono i colori ATTUALI (non quelli della UX spec) come baseline per evitare cambi visivi. La UX spec usa valori diversi (`#22c55e` vs `#06d6a0` per il verde) — questi cambi visivi saranno applicati in una story futura (Epic 6) quando il pannello viene ridisegnato. Per ORA, i token devono produrre output identico al CSS attuale.

### Anti-Pattern da Evitare

- **NON** cambiare i valori colore effettivi — solo estrarre in variabili. Il modulo deve apparire IDENTICO prima e dopo
- **NON** usare preprocessor CSS (SASS/LESS) — il progetto e' zero-build
- **NON** creare un file CSS unico gigante — 3 file separati per separation of concerns
- **NON** usare `!important` — namespace `.vox-chronicle` ha specificita' sufficiente
- **NON** aggiungere `prefers-color-scheme` media queries ora — il supporto temi verra' in Epic 6
- **NON** rimuovere commenti o ristrutturare il CSS esistente — solo sostituire valori hardcoded
- **NON** modificare file JavaScript — questa story e' puramente CSS
- **NON** toccare classi non-namespaced in `vox-chronicle.css` (come `input[name="vox-chronicle.*"]`) — sono gia' namespaced via attributo selettore

### Ordine Caricamento CSS

L'ordine in `module.json` e' critico perche' i token devono essere definiti PRIMA di essere usati:
1. `primitives.css` — definisce `--vox-green-400`, etc.
2. `semantic.css` — usa `var(--vox-green-400)` per definire `--vox-color-success`
3. `components.css` — usa `var(--vox-color-success)` per definire `--vox-recorder-ready`
4. `vox-chronicle.css` — usa `var(--vox-recorder-ready)` etc. nei selettori

### Gestione `rgba()` Variants

Il CSS attuale usa pesantemente `rgba()` per backgrounds e borders con lo stesso colore base:
```css
/* Esempio pattern attuale */
background: rgba(6, 214, 160, 0.08);    /* verde al 8% opacity */
border: 1px solid rgba(6, 214, 160, 0.4); /* verde al 40% opacity */
color: #06d6a0;                           /* verde pieno */
```

**Strategia**: Le varianti `rgba()` NON vanno in primitives. Devono restare inline nel CSS principale usando i valori primitivi come riferimento concettuale. CSS custom properties non supportano nativamente il canale alpha separato senza `color-mix()` o `oklch()`, che non hanno supporto universale nei browser target (Chrome 90+). Mantenere `rgba()` hardcoded dove necessario, commentando il token di riferimento se utile.

**Alternativa pragmatica**: Dove il pattern `rgba(r,g,b, alpha)` si ripete identico 3+ volte, creare un token semantico direttamente:
```css
--vox-color-success-bg: rgba(6, 214, 160, 0.08);
--vox-color-success-border: rgba(6, 214, 160, 0.4);
```

### Foundry VTT CSS Variables da Usare come Fallback

```css
/* Colori testo */
--color-text-light-primary    /* testo chiaro primario */
--color-text-dark-primary     /* testo scuro primario */
--color-text-light-6          /* gia' usato nel CSS per summary badge */

/* Sfondo */
--color-bg-option             /* sfondo opzione */
--color-border-light          /* bordo chiaro */
--color-border-highlight      /* bordo evidenziato — usare come fallback per accent */

/* Font */
--font-primary                /* font primario Foundry */
```

### Learnings dalle Story Precedenti

**Da Story 1.4 (ResilienceRegistry):**
- Story puramente additiva — pattern da seguire per la creazione dei 3 file nuovi
- Code review ha trovato issue di observability — per il CSS equivale a verificare che i token siano completi e non manchino mappature

**Da Story 1.3 (SessionStateMachine):**
- Validazione parametri in input — per CSS: verificare che ogni token usato in vox-chronicle.css esista nei file token
- Pattern testabili: il dev agent deve fare un "audit" finale cercando hex residui nel CSS

**Da Story 1.2 (EventBus):**
- Singleton pattern funziona — i `:root` tokens sono l'equivalente CSS
- i18n safety — non applicabile (nessun JS in questa story)

### Git Intelligence

Ultimi 2 commit (Story 1.2 EventBus):
- Pattern: nuovi file creati + modifica file esistenti nella stessa PR
- Test: nessun test JS per file CSS — questa story non richiede nuovi test
- Lang files: modificati nelle ultime 3 story per i18n — questa story NON modifica lang files

### Project Structure Notes

- `styles/tokens/` — NUOVA directory (3 file)
- `styles/vox-chronicle.css` — file esistente 1455 righe, REFACTOR in-place
- `module.json` — modifica campo `styles` array
- Nessun conflitto con struttura definita in architecture.md — la directory `tokens/` e' prevista

### References

- [Source: architecture.md#8. Design Token System] — Pattern 3 livelli: Primitivi → Semantici → Componente
- [Source: architecture.md#Implementation Patterns #7 CSS] — Convenzione BEM `.vox-chronicle`
- [Source: architecture.md#Decision Impact Analysis] — Design Tokens indipendenti, possono procedere in parallelo
- [Source: ux-design-specification.md#Design System Choice] — Foundry-Native + Design Tokens Custom
- [Source: ux-design-specification.md#Implementation Approach] — Layer 1/2/3 con token tables complete
- [Source: ux-design-specification.md#Palette principale] — Valori token indicativi (non binding per questa story)
- [Source: epics.md#Story 1.5] — 5 Acceptance Criteria BDD
- [Source: CLAUDE.md#CSS Naming] — Namespace BEM `.vox-chronicle`
- [Source: module.json] — Array `styles` attuale con singolo file

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nessun debug necessario — story puramente CSS senza errori.

### Completion Notes List

- Creati 3 file token CSS (primitives, semantic, components) con architettura a 3 livelli
- Layer semantico usa varianti -500 (valori attuali) per preservare identita' visiva — switch a -400 previsto per Epic 6
- Aggiunti token rgba semantici (success-bg, error-bg, warning-bg, etc.) per pattern ripetuti 3+ volte
- Migrato vox-chronicle.css: zero hex hardcoded rimasti (solo #888 come fallback Foundry)
- Consolidati colori duplicati (3 verdi, 2 rossi, 4 ambra) in token semantici unificati
- Sostituiti border-radius (2px/3px/4px/10px/12px) con var(--vox-radius-*)
- Sostituiti surface/border rgba ricorrenti con token semantici
- Sostituiti 12 transition timing hardcoded con var(--vox-transition-*)
- Migrati ~42 font-size matchabili (0.65/0.75/0.85/0.9em) a var(--vox-font-size-*)
- Aggiunti token border-light (0.08) e border-strong (0.15) per pattern rgba 5+ volte
- Token accent-hover ora deriva da primitivo --vox-blue-300 (non hex hardcoded)
- Namespace audit: zero classi non-namespaced
- Regression: 4733 test passati, zero fallimenti
- Nessun file JavaScript modificato

### Change Log

- 2026-03-09: Implementazione completa Design Token System CSS (tutti 7 task)
- 2026-03-09: [Code Review] Fix 9 issue (1 CRITICAL, 3 HIGH, 3 MEDIUM, 2 LOW) — transizioni tokenizzate, font-size migrati, rgba pattern consolidati, architettura primitivi→semantici ripristinata

### File List

- styles/tokens/primitives.css (NUOVO)
- styles/tokens/semantic.css (NUOVO)
- styles/tokens/components.css (NUOVO)
- styles/vox-chronicle.css (MODIFICATO — migrazione hex/rgba a var())
- module.json (MODIFICATO — array styles con 4 file)
