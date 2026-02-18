# TODO - VoxChronicle

Audit del codebase eseguito il 2026-02-07. Aggiornato il 2026-02-18.

## ALL CRITICAL AND WARNING ITEMS RESOLVED

### C1. Setting `kankaApiTokenCreatedAt` non registrato - ✅ FIXED
Risolto in `Settings.mjs` - setting registrato con `scope: 'world'`, `config: false`.

### C2. Chiavi di localizzazione mancanti - ✅ FIXED
Tutte le chiavi aggiunte in tutti i file lingua.

### C3. `console.log` diretto invece di Logger - ✅ FIXED
Tutti i `console.log` diretti sostituiti con Logger in `main.mjs`, `VoxChronicle.mjs`, e `Settings.mjs`.
L'unico file con `console.*` diretto e' `Logger.mjs` (corretto - e' il wrapper).

### W1. Dipendenza circolare `MODULE_ID` - ✅ FIXED (v1.2.1)
Risolto con `scripts/constants.mjs`.

### W2. Icone Font Awesome inconsistenti - ✅ FIXED (v1.2.2)
Tutte le occorrenze `fas fa-*` sostituite con `fa-solid fa-*`.

### W3. `ApiKeyValidator.mjs` non integrato - ✅ RESOLVED (v2.2.11)
File rimosso in v2.2.11 (dead code cleanup). La validazione API e' gestita da `Settings.mjs`.

### I1. File non documentati in CLAUDE.md - ✅ FIXED
### I2. Setting di relazioni non documentati - ✅ FIXED

## Dead Code Cleanup - ✅ COMPLETED (v2.2.11)
- ~1,130 righe CSS morte rimosse (~40% del foglio di stile)
- 4 file sorgente inutilizzati rimossi (ApiKeyValidator, CompendiumSearcher, RecorderControls, KankaRelationshipManager)
- 4 file di test corrispondenti rimossi
- Export inutilizzati rimossi da SensitiveDataFilter e TranscriptionProcessor
- Totale: ~7,080 righe rimosse in 15 file

## INFO - NOTE DI COMPATIBILITA' v13

### I3. Uso di jQuery (deprecato in v13) - ✅ FIXED (v2.3.0)
Tutti i 5 componenti UI migrati da jQuery a vanilla JS (querySelector, querySelectorAll, .value, .dataset, .checked).
Zero `$(...)`, `html.find(...)`, `.val()`, `.each()`, `.is()`, `.prop()` nel codice sorgente.
Dialog v1 callbacks convertiti con pattern `(html[0] ?? html).querySelector(...)`.

### I4. Classi Application/FormApplication legacy - ✅ FIXED (v2.3.0)
Tutti i 5 componenti UI migrati da Application/FormApplication v1 a ApplicationV2 + HandlebarsApplicationMixin:
- MainPanel, RelationshipGraph, EntityPreview, SpeakerLabeling, VocabularyManager
- `static get defaultOptions()` → `static DEFAULT_OPTIONS` + `static PARTS`
- `getData()` → `async _prepareContext(options)`
- `activateListeners(html)` → `actions` map + `_onRender()`
- Compatibilita' minima aggiornata a v13 (v12 non piu' supportata)
