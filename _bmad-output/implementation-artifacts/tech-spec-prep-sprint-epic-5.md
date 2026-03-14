---
title: 'Prep Sprint Epic 5 — NarrativeExporter ChatProvider Migration'
slug: 'prep-sprint-epic-5'
created: '2026-03-14'
status: 'complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['JavaScript ES6+ (.mjs)', 'Foundry VTT v13', 'Vitest', 'ChatProvider abstraction']
files_to_modify: ['scripts/kanka/NarrativeExporter.mjs', 'scripts/core/VoxChronicle.mjs', 'tests/kanka/NarrativeExporter.test.js']
code_patterns: ['ChatProvider injection via constructor options', 'Dual-path with fallback (chatProvider.chat() || openaiClient.post())', 'Logger.createChild() for module logging']
test_patterns: ['Vitest with vi.fn() mocks', 'Mock ChatProvider with chat() method returning {content, usage}', 'Backward compatibility test (no chatProvider = fallback to openaiClient)']
---

# Tech-Spec: Prep Sprint Epic 5 — NarrativeExporter ChatProvider Migration

**Created:** 2026-03-14

## Overview

### Problem Statement

`NarrativeExporter.generateAISummary()` usa `OpenAIClient.post('/chat/completions', ...)` direttamente (riga 336), bypassando l'astrazione `ChatProvider` adottata nel prep sprint Epic 4 e consolidata in Story 4.3. Questo crea inconsistenza architetturale e impedisce la selezione di provider AI alternativi per la generazione di cronache narrative.

### Solution

Migrare `NarrativeExporter` allo stesso pattern di `RulesLookupService` (Story 4.3): accettare `chatProvider` nelle options del costruttore, usarlo in `generateAISummary()` con fallback a `OpenAIClient` per backward compatibility. Aggiornare `VoxChronicle.initialize()` per wiring il provider.

### Scope

**In Scope:**
- Migrazione `generateAISummary()` a ChatProvider
- Aggiunta `chatProvider` option nel costruttore
- Aggiornamento `setOpenAIClient()` per accettare anche ChatProvider
- Wiring in `VoxChronicle.initialize()` via `registry.getProvider('chat')`
- Test per entrambi i path (ChatProvider e fallback)

**Out of Scope:**
- Refactoring NarrativeExporter oltre la migrazione provider
- Nuove feature per cronache (Epic 5 scope)
- Modifica EntityPreview vis-network loading
- Decomposizione SessionOrchestrator

## Context for Development

### Codebase Patterns

**Pattern ChatProvider migration (consolidato in Story 4.3):**
```javascript
// Costruttore: accetta chatProvider nelle options
constructor(options = {}) {
  this._chatProvider = options.chatProvider || null;
  // ... existing code ...
}

// Metodo: dual-path con fallback
async generateAISummary(segments, options = {}) {
  let answer, usage;
  if (this._chatProvider) {
    const response = await this._chatProvider.chat(messages, {
      model: 'gpt-4o', temperature: 0.7, maxTokens: maxTokens
    });
    answer = response?.content;
    usage = response?.usage || null;
  } else {
    const response = await this._openAIClient.post('/chat/completions', { ... });
    answer = response?.choices?.[0]?.message?.content;
    usage = response?.usage || null;
  }
}

// VoxChronicle.initialize(): wiring
this.narrativeExporter = new NarrativeExporter({
  chatProvider: registry.getProvider('chat')
});
```

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `scripts/kanka/NarrativeExporter.mjs` | Target: migrazione `generateAISummary()` (riga 301-364) |
| `scripts/narrator/RulesLookupService.mjs` | Reference: pattern ChatProvider migration (riga 133-196) |
| `scripts/core/VoxChronicle.mjs` | Wiring: riga 344-346, `setOpenAIClient(openaiApiKey)` → ChatProvider |
| `tests/kanka/NarrativeExporter.test.js` | Test: 29 test esistenti, aggiungere 3-4 per ChatProvider |

### Technical Decisions

1. **Dual-path con fallback** — Come RulesLookupService: ChatProvider preferito, OpenAIClient fallback. Zero breaking change.
2. **chatProvider nelle options del costruttore** — Non come parametro posizionale (consistente con RulesLookupService).
3. **Aggiornare anche `setOpenAIClient()`** — Rinominare internamente a `setChatProvider()` con backward compatibility alias? No — troppo invasivo. Solo aggiungere `setChatProvider(provider)` come nuovo metodo.

## Implementation Plan

### Tasks

- [x] **Task 1: Test RED — ChatProvider in NarrativeExporter** (TDD)
  - [x] 1.1 Test: `generateAISummary()` usa `chatProvider.chat()` quando chatProvider fornito
  - [x] 1.2 Test: fallback a `openAIClient.post()` quando chatProvider non fornito
  - [x] 1.3 Test: parametri corretti passati a `chatProvider.chat()` (model, temperature, maxTokens)
  - [x] 1.4 Test: `chatProvider.chat()` errore → result.success=false

- [x] **Task 2: Implementazione GREEN — Migrazione NarrativeExporter**
  - [ ] 2.1 Aggiungere `_chatProvider` field nel costruttore da `options.chatProvider`
  - [ ] 2.2 In `generateAISummary()`: if chatProvider → use `chatProvider.chat()`, else → existing `openAIClient.post()`
  - [ ] 2.3 Aggiungere `setChatProvider(provider)` public method
  - [ ] 2.4 Aggiornare JSDoc

- [x] **Task 3: Wiring in VoxChronicle.initialize()**
  - [ ] 3.1 Passare `chatProvider: registry.getProvider('chat')` nel costruttore NarrativeExporter
  - [ ] 3.2 Rimuovere `setOpenAIClient(openaiApiKey)` call separata (ora nel costruttore)

- [x] **Task 4: Regressione**
  - [ ] 4.1 `npm test` — tutti i test passano
  - [ ] 4.2 Verificare backward compatibility: NarrativeExporter senza chatProvider funziona

### Acceptance Criteria

1. **Given** NarrativeExporter con chatProvider configurato **When** `generateAISummary()` viene chiamato **Then** usa `chatProvider.chat()` e NON `openAIClient.post()`
2. **Given** NarrativeExporter senza chatProvider **When** `generateAISummary()` viene chiamato **Then** fallback a `openAIClient.post()` (backward compatibility)
3. **Given** VoxChronicle.initialize() **When** NarrativeExporter viene creato **Then** riceve `chatProvider` dal ProviderRegistry
4. **Given** tutti i test esistenti **When** eseguiti dopo la migrazione **Then** passano senza regressioni

## Additional Context

### Dependencies

- `ChatProvider` interface (`scripts/ai/providers/ChatProvider.mjs`) — gia' stabile
- `ProviderRegistry` (`scripts/ai/providers/ProviderRegistry.mjs`) — gia' usato in VoxChronicle.initialize()
- 29 test esistenti in `NarrativeExporter.test.js` — safety net

### Testing Strategy

- **TDD**: RED tests prima, poi GREEN implementation
- **Mock pattern**: `{ chat: vi.fn().mockResolvedValue({ content: '...', usage: {} }) }`
- **Coverage target**: 3-4 nuovi test (ChatProvider path, fallback, params, error)
- **Regression**: `npm test` completo dopo ogni modifica

### Notes

- Pattern identico a Story 4.3 RulesLookupService — copia il pattern esatto
- VoxChronicle.initialize() gia' ha accesso a `registry.getProvider('chat')` (riga 330)
- L'unico servizio rimasto su OpenAIClient diretto dopo questa migrazione sara' `OpenAIClient` stesso (base HTTP client)
