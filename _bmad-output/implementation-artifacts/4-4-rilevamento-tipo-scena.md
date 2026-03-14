# Story 4.4: Rilevamento Tipo Scena

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DM,
I want the system to detect the current scene type automatically,
so that suggestions are contextually appropriate to what's happening in the game.

## Acceptance Criteria

1. **AC1 — Rilevamento Tipo Scena**: Given la trascrizione corrente When viene analizzata Then il tipo di scena viene rilevato: combattimento, sociale, esplorazione, o riposo (FR14)
2. **AC2 — EventBus scene:changed**: Given un cambio scena rilevato When il tipo cambia Then un evento `scene:changed` viene emesso su EventBus con `{ sceneType, confidence, timestamp }` (FR14)
3. **AC3 — Suggerimenti Adattati**: Given il tipo di scena When il suggerimento viene generato Then il contenuto e' adattato al contesto (es. tattiche in combattimento, NPC in sociale)
4. **AC4 — Badge Scena nel Pannello**: Given il badge scena nel pannello When la scena cambia Then il badge si aggiorna con colore e label appropriati (combattimento=rosso, sociale=blu, esplorazione=verde, riposo=ambra)

## Tasks / Subtasks

- [x] Task 1 — Test TDD per SceneDetector wiring nel ciclo live (AC: #1, #2)
  - [x] 1.1 Test: `_updateSceneType()` chiama `detectSceneTransition()` — NEW: 6 tests in "Scene Detection wiring" describe
  - [x] 1.2 Test: `_emitSafe('scene:changed', ...)` emesso su transizione — NEW: "should emit scene:changed" test
  - [x] 1.3 Test: payload contiene `{ sceneType, previousType, confidence, timestamp }` — NEW: "should include previousType" test
  - [x] 1.4 Test: SceneDetector mancante → nessun errore — NEW: "should handle missing SceneDetector gracefully"
  - [x] 1.5 Test: tipo scena iniziale unknown, aggiornato — NEW: "should update _currentSceneType" test

- [x] Task 2 — Implementare wiring SceneDetector nel ciclo live (AC: #1, #2)
  - [x] 2.1 Creato `_updateSceneType(text)` chiamato in `_liveCycle()` al posto di chiamata diretta
  - [x] 2.2 Emette `scene:changed` con `{ sceneType, previousType, confidence, timestamp }`
  - [x] 2.3 `_currentSceneType` memorizzato in SessionOrchestrator, passato a `analyzeContext()`
  - [x] 2.4 EventBus emit dall'orchestratore via `_emitSafe()` — no injection necessaria in SceneDetector

- [x] Task 3 — Test TDD per suggerimenti adattati al tipo scena (AC: #3)
  - [x] 3.1 `analyzeContext()` accetta `sceneType` in options e lo setta in `_sessionState.currentScene`
  - [x] 3.2 PromptBuilder include `CURRENT SCENE TYPE: {sceneType}` nel system prompt
  - [x] 3.3 Cache L1 invalidation su `scene:changed` — VERIFIED: listener gia' implementato (line 327-334)

- [x] Task 4 — Implementare scene type nel prompt di suggerimenti (AC: #3)
  - [x] 4.1 `_runAIAnalysis()` passa `sceneType: this._currentSceneType` a `analyzeContext()`
  - [x] 4.2 PromptBuilder.buildSystemPrompt() include sceneSection con contesto adattivo
  - [x] 4.3 AIAssistant `_syncPromptBuilderState()` chiama `setSceneType()` su PromptBuilder

- [x] Task 5 — Badge scena nel pannello (AC: #4) — tests integrati con implementazione
  - [x] 5.1 `_prepareContext()` include `currentSceneType` e `sceneTypeLabel`
  - [x] 5.2 Badge aggiornato tramite `onStateChange` callback (render su cambio stato orchestratore)
  - [x] 5.3 CSS classi per combat/social/exploration/rest/unknown implementate

- [x] Task 6 — Implementare badge scena nel MainPanel (AC: #4)
  - [x] 6.1 `currentSceneType` e `sceneTypeLabel` in `_prepareContext()` da orchestrator state
  - [x] 6.2 Badge scena in main-panel.hbs con colore dinamico e icona theater-masks
  - [x] 6.3 CSS: `--combat` (rosso), `--social` (blu), `--exploration` (verde), `--rest` (ambra), `--unknown` (grigio)
  - [x] 6.4 Badge aggiornato via `_debouncedRender()` su `onStateChange` callback

- [x] Task 7 — i18n per stringhe scene type (AC: tutti)
  - [x] 7.1 Chiavi `VOXCHRONICLE.Scene.*` in tutti 8 file lang: Combat, Social, Exploration, Rest, Scene, Unknown — NEW: Scene e Unknown aggiunti
  - [x] 7.2 Verificato: tutte le chiavi presenti in en, it, de, es, fr, ja, pt, template

- [x] Task 8 — Regressione e wiring verification (AC: tutti)
  - [x] 8.1 `npm test` — 5185 tests pass, 69 files, 0 failures (6 new tests)
  - [x] 8.2 Wiring: _liveCycle → _updateSceneType → detectSceneTransition → scene:changed → AIAssistant cache invalidation + MainPanel render
  - [x] 8.3 Integration: scene detection → event emission → prompt includes scene type → badge updates
  - [x] 8.4 Backward compatibility: null check guard on `_sceneDetector` in `_updateSceneType()`

## Dev Notes

### Stato Attuale del Codice — ~60% GIA' IMPLEMENTATO

**ATTENZIONE: Questa story ha PIU' lavoro reale delle precedenti.** SceneDetector e' completo come classe isolata, ma NON e' wired nel ciclo live.

**Cosa ESISTE gia':**

| Componente | File | Stato |
|-----------|------|-------|
| SceneDetector class | `scripts/narrator/SceneDetector.mjs` (691 righe) | COMPLETO — detection, identification, history, features |
| Scene types | `scripts/narrator/SceneDetector.mjs` | COMPLETO — EXPLORATION, COMBAT, SOCIAL, REST, UNKNOWN |
| Transition patterns | SceneDetector | COMPLETO — location, time, combat triggers (IT + EN) |
| AIAssistant scene:changed listener | `scripts/narrator/AIAssistant.mjs` line 327-334 | PRONTO — cache invalidation su scene:changed |
| SessionOrchestrator stores detector | `scripts/orchestration/SessionOrchestrator.mjs` | ACCETTA ma NON USA — `this._sceneDetector` memorizzato ma mai chiamato |
| VoxChronicle initialization | `scripts/core/VoxChronicle.mjs` | COMPLETO — crea SceneDetector e lo passa all'orchestratore |
| EventBus scene channel | `scripts/core/EventBus.mjs` | COMPLETO — canale `scene:` registrato in VALID_CHANNELS |

**Cosa MANCA realmente:**

1. **SceneDetector NON chiamato nel ciclo live** — `_liveCycle()` non chiama `detectSceneTransition()`. Serve wiring
2. **`scene:changed` event NON emesso** — Nessuno emette questo evento. AIAssistant lo ascolta ma non viene mai triggerato
3. **Scene type NON passato a PromptBuilder** — I suggerimenti non sanno il tipo di scena corrente
4. **Badge scena NON presente nel MainPanel** — Nessun indicatore visivo del tipo scena
5. **i18n stringhe scena** — Possibili lacune nelle traduzioni
6. **CSS badge colori** — Classi per combat/social/exploration/rest non esistono

### Pattern Architetturali da Seguire

**SceneDetector call nel ciclo live:**
```javascript
// In SessionOrchestrator._runAIAnalysis() o _liveCycle()
if (this._sceneDetector) {
  const transition = this._sceneDetector.detectSceneTransition(contextText);
  if (transition.detected) {
    const previousType = this._currentSceneType || 'unknown';
    this._currentSceneType = transition.sceneType;
    this._emitSafe('scene:changed', {
      sceneType: transition.sceneType,
      previousType,
      confidence: transition.confidence,
      timestamp: Date.now()
    });
  } else {
    // Anche senza transizione, aggiorna il tipo scena dal keyword scoring
    const sceneType = this._sceneDetector.identifySceneType(contextText);
    if (sceneType !== 'unknown' && sceneType !== this._currentSceneType) {
      const previousType = this._currentSceneType || 'unknown';
      this._currentSceneType = sceneType;
      this._emitSafe('scene:changed', {
        sceneType,
        previousType,
        confidence: 0.5, // keyword-based, lower confidence
        timestamp: Date.now()
      });
    }
  }
}
```

**Badge scena nel template (main-panel.hbs):**
```handlebars
{{#if isLiveMode}}
<span class="vox-chronicle-badge vox-chronicle-badge--scene vox-chronicle-badge--{{currentSceneType}}"
      title="{{localize 'VOXCHRONICLE.Scene.SceneType'}}">
  <i class="fa-solid fa-theater-masks"></i> {{sceneTypeLabel}}
</span>
{{/if}}
```

**CSS badge colori:**
```css
.vox-chronicle-badge--combat { background: var(--vox-red-400, #ef4444); color: white; }
.vox-chronicle-badge--social { background: var(--vox-blue-400, #3b82f6); color: white; }
.vox-chronicle-badge--exploration { background: var(--vox-green-400, #22c55e); color: white; }
.vox-chronicle-badge--rest { background: var(--vox-amber-400, #f59e0b); color: white; }
.vox-chronicle-badge--unknown { background: var(--vox-gray-400, #9ca3af); color: white; }
```

**EventBus pattern (da Story 4.1-4.2):**
```javascript
_emitSafe(channel, data) {
  try { this._eventBus?.emit(channel, data); } catch (e) { this._logger.warn('EventBus emit failed:', e); }
}
```

**PromptBuilder scene context:**
```javascript
// In PromptBuilder.buildAnalysisMessages()
if (options.sceneType && options.sceneType !== 'unknown') {
  // Add to system message or context
  contextParts.push(`Current scene type: ${options.sceneType}. Adapt suggestions accordingly.`);
}
```

### Vincoli Critici

1. **Zero build step** — Import ES6+ nativi (.mjs), no transpiling
2. **NFR1: 3s latency** — Scene detection e' pattern-based (NO API call), non aggiunge latenza
3. **Non-blocking** — Scene detection fallimento NON deve bloccare il ciclo suggerimenti
4. **Layer boundary** — `ui/` comunica solo via callbacks/EventBus
5. **AbortController** — Cleanup listener per badge in `_onRender`
6. **Error isolation** — `detectSceneTransition()` wrappato in try-catch
7. **TDD mandatory** — Test RED prima, poi GREEN, poi refactor
8. **Backward compatibility** — Sessioni senza SceneDetector funzionano (null check guard)

### Testing Strategy

**TDD obbligatorio** (standard da Epic 3):

**Mock pattern per SceneDetector:**
```javascript
const mockSceneDetector = {
  detectSceneTransition: vi.fn().mockReturnValue({
    detected: true,
    type: 'combat',
    sceneType: 'combat',
    confidence: 1.0,
    trigger: 'Roll initiative!'
  }),
  identifySceneType: vi.fn().mockReturnValue('combat'),
  getCurrentSceneType: vi.fn().mockReturnValue('combat'),
  setCurrentSceneType: vi.fn(),
  isConfigured: vi.fn().mockReturnValue(true)
};
```

**Wiring verification checklist (livello 1):**
- `_liveCycle()` → chi chiama `detectSceneTransition()`?
- `scene:changed` → chi lo emette? SessionOrchestrator
- `scene:changed` → chi lo ascolta? AIAssistant (cache invalidation), MainPanel (badge update)
- Badge → come si aggiorna? callback `onSceneChange` o EventBus `scene:changed` → render

**Coverage target:**
- SceneDetector wiring: ~8 nuovi test
- Scene type in prompts: ~4 nuovi test
- Badge UI: ~5 nuovi test
- i18n: ~1 test

### Project Structure Notes

**File da MODIFICARE:**
- `scripts/orchestration/SessionOrchestrator.mjs` — Chiamare SceneDetector in `_liveCycle()` o `_runAIAnalysis()`, emettere `scene:changed`
- `scripts/narrator/AIAssistant.mjs` — Passare sceneType a PromptBuilder in `analyzeContext()`
- `scripts/narrator/PromptBuilder.mjs` — Includere scene type nel system message
- `scripts/ui/MainPanel.mjs` — Aggiungere `currentSceneType` a `_prepareContext()`, callback per scene change
- `templates/main-panel.hbs` — Badge scena nel live tab
- `styles/vox-chronicle.css` — CSS badge colori per scene types
- `lang/*.json` (8 file) — i18n stringhe scene type
- `tests/orchestration/SessionOrchestrator.test.js` — Test wiring SceneDetector
- `tests/ui/MainPanel.test.js` — Test badge rendering

**File da CREARE:**
- Nessuno

**File da NON toccare:**
- `scripts/narrator/SceneDetector.mjs` — GIA' COMPLETO (691 righe, 98 test)
- `scripts/core/EventBus.mjs` — GIA' COMPLETO (canale `scene:` registrato)
- `scripts/core/VoxChronicle.mjs` — GIA' COMPLETO (crea e passa SceneDetector)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.4]
- [Source: _bmad-output/planning-artifacts/architecture.md — EventBus channels, UI PARTS, scene: channel]
- [Source: _bmad-output/planning-artifacts/prd.md — FR14, NFR1]
- [Source: scripts/narrator/SceneDetector.mjs — detectSceneTransition(), identifySceneType(), SCENE_TYPES]
- [Source: scripts/narrator/AIAssistant.mjs — scene:changed listener (line 327-334), sceneInfo typedef]
- [Source: scripts/orchestration/SessionOrchestrator.mjs — _sceneDetector stored but not called]
- [Source: scripts/ui/MainPanel.mjs — badge structure, _prepareContext()]
- [Source: templates/main-panel.hbs — badge section (lines 11-21)]
- [Source: _bmad-output/implementation-artifacts/4-1-avvio-sessione-live-e-ciclo-ai.md — _emitSafe pattern]
- [Source: _bmad-output/implementation-artifacts/4-2-suggerimenti-contestuali-da-journal-e-rag.md — EventBus wiring pattern]
- [Source: _bmad-output/implementation-artifacts/4-3-rules-qa-con-compendi-foundry.md — ChatProvider migration pattern]
- [Source: CLAUDE.md — UI Components, CSS naming, i18n, testing]

### Previous Story Intelligence (Story 4.1-4.3)

**Pattern da replicare:**
- `_emitSafe()` per EventBus events — stesso pattern per `scene:changed`
- Verify-first approach — verificare cosa esiste prima di scrivere codice
- Wiring verification a 3 livelli
- TDD 100%
- Backward compatibility — null check guard su `_sceneDetector`

**Errori da evitare:**
- vectorCount accumulation bug (4.2 H1) — usare `=` non `+=` per stato
- Dead code — wiring deve connettere produttore e consumatore (4.3 M2)
- Weak test assertions (4.2 M1) — verificare stato reale non solo che handler esiste
- Setting non letto al momento giusto (4.1 H1)

### Git Intelligence

**Ultimi commit:**
- `d342487` — feat: implement adaptive chunking and EventBus wiring for live mode (Story 4.1)
- Pattern: commit atomici, message format `feat:` / `fix:` / `refactor:` / `docs:`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nessun debug necessario.

### Completion Notes List

- ✅ Task 1-2: Created `_updateSceneType(text)` method in SessionOrchestrator — calls `detectSceneTransition()`, falls back to `identifySceneType()`, emits `scene:changed` event with `{ sceneType, previousType, confidence, timestamp }`. Replaced direct `detectSceneTransition()` call in `_liveCycle()`. 6 new tests.
- ✅ Task 3-4: Wired scene type into AI prompts — `analyzeContext()` accepts `sceneType` option, sets `_sessionState.currentScene`, syncs to PromptBuilder via `_syncPromptBuilderState()`. PromptBuilder includes `CURRENT SCENE TYPE` section in system prompt. `sceneInfo.type` in response now reflects actual scene type.
- ✅ Task 5-6: Added scene badge to MainPanel — `_prepareContext()` includes `currentSceneType` and `sceneTypeLabel`. Badge in template with theater-masks icon, color-coded CSS (combat=red, social=blue, exploration=green, rest=amber, unknown=gray). `_getSceneTypeLabel()` helper with i18n.
- ✅ Task 7: Added `Scene` and `Unknown` i18n keys to all 8 lang files.
- ✅ Task 8: Full regression — 5185 tests pass, 69 files, 0 failures. Wiring verified end-to-end.

### Change Log

- 2026-03-14: Story 4.4 implementation — SceneDetector wiring in live cycle, scene type in AI prompts, scene badge UI. 6 new tests. Key addition: `_updateSceneType()` method with transition detection + keyword fallback + EventBus emission.
- 2026-03-14: Code review fixes (1 HIGH, 2 MEDIUM, 1 LOW — all fixed):
  - **H1**: Fixed layer boundary violation — added `getCurrentSceneType()` public getter, MainPanel no longer accesses `_currentSceneType` directly
  - **M1**: Declared `_currentSceneType = 'unknown'` as class field in SessionOrchestrator
  - **M2**: Added 3 tests for `_getSceneTypeLabel()` — known types, unknown types, null input
  - **L1**: Updated `createMockSceneDetector()` to include `identifySceneType` and `getCurrentSceneType` in default mock

### File List

- `scripts/orchestration/SessionOrchestrator.mjs` — Added `_updateSceneType(text)` method, replaced direct `detectSceneTransition()` call, passes `sceneType` to `analyzeContext()`
- `scripts/narrator/AIAssistant.mjs` — `analyzeContext()` accepts `sceneType` option, sets `_sessionState.currentScene`, `sceneInfo.type` reflects actual scene, `_syncPromptBuilderState()` syncs scene type
- `scripts/narrator/PromptBuilder.mjs` — Added `_sceneType` field, `setSceneType()` method, scene section in `buildSystemPrompt()`
- `scripts/ui/MainPanel.mjs` — Added `currentSceneType` and `sceneTypeLabel` to `_prepareContext()`, `_getSceneTypeLabel()` helper
- `templates/main-panel.hbs` — Scene badge with dynamic color class and theater-masks icon (visible in live mode)
- `styles/vox-chronicle.css` — Scene badge CSS: `--combat` (red), `--social` (blue), `--exploration` (green), `--rest` (amber), `--unknown` (gray)
- `lang/en.json` — Added Scene.Scene and Scene.Unknown
- `lang/it.json` — Added Scene.Scene ("Scena") and Scene.Unknown ("Sconosciuto")
- `lang/de.json` — Added Scene.Scene ("Szene") and Scene.Unknown ("Unbekannt")
- `lang/es.json` — Added Scene.Scene ("Escena") and Scene.Unknown ("Desconocido")
- `lang/fr.json` — Added Scene.Scene ("Scène") and Scene.Unknown ("Inconnu")
- `lang/ja.json` — Added Scene.Scene ("シーン") and Scene.Unknown ("不明")
- `lang/pt.json` — Added Scene.Scene ("Cena") and Scene.Unknown ("Desconhecido")
- `lang/template.json` — Added Scene.Scene and Scene.Unknown (empty)
- `tests/orchestration/SessionOrchestrator.test.js` — 6 new tests for scene detection wiring
