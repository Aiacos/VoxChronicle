# TODO - VoxChronicle

Audit del codebase eseguito il 2026-02-07. Aggiornato il 2026-02-09.

## CRITICAL - FIXED

### C1. Setting `kankaApiTokenCreatedAt` non registrato - ✅ FIXED
**Stato**: Risolto in `Settings.mjs:360-367`
- Il setting e' ora registrato correttamente con `scope: 'world'`, `config: false`, `type: Number`, `default: 0`

### C2. Chiavi di localizzazione mancanti - ✅ FIXED
**Stato**: Tutte le chiavi sono state aggiunte in `lang/en.json` e `lang/it.json` (righe 283-285, 330, 452)
- `VOXCHRONICLE.Kanka.TokenExpiringCritical` ✅
- `VOXCHRONICLE.Kanka.TokenExpiringUrgent` ✅
- `VOXCHRONICLE.Kanka.TokenExpiring` ✅
- `VOXCHRONICLE.Controls.RelationshipGraph` ✅

## CRITICAL - DA CORREGGERE

### C3. `console.log` diretto invece di Logger (~29 occorrenze)
CLAUDE.md vieta `console.log` diretto. Violazioni attuali:

**`scripts/main.mjs`** (8 occorrenze):
- righe 50, 61, 70, 80, 82, 246, 301, 353

**`scripts/core/VoxChronicle.mjs`** (18 occorrenze):
- righe 92, 96, 114, 117, 130, 134, 179, 181, 224, 239, 246, 253, 256, 276, 289, 303, 314, 332, 342, 362, 367

**`scripts/core/Settings.mjs`** (3 occorrenze):
- righe 369, 588, 659

**Fix**: Sostituire con `Logger.info()`, `Logger.error()`, `Logger.warn()`.

## WARNING - FIXED

### W1. Dipendenza circolare `MODULE_ID` - ✅ FIXED (v1.2.1)
**Stato**: Risolto creando `scripts/constants.mjs` con `export const MODULE_ID = 'vox-chronicle'`.
- Tutti i 10 file sorgente ora importano da `constants.mjs` invece di `main.mjs`
- `main.mjs` ri-esporta `MODULE_ID` per compatibilita'
- Tutti i 33 file di test aggiornati con mock per `constants.mjs`

### W2. Icone Font Awesome inconsistenti tra v12 e v13 - ✅ FIXED (v1.2.2)
**Stato**: Tutte le occorrenze di `fas fa-*` sostituite con `fa-solid fa-*`.
- 6 template `.hbs`: config, recorder, speaker-labeling, entity-preview, relationship-graph, vocabulary-manager
- 5 file UI `.mjs`: VoxChronicleConfig, EntityPreview, RecorderControls, SpeakerLabeling, VocabularyManager
- Fix incluse anche pattern Handlebars condizionali (es. `fa-solid {{#if ...}}`)

## WARNING - DA CORREGGERE

### W3. `ApiKeyValidator.mjs` non integrato
- Il file esiste (152 righe) con validazione formato chiavi
- `Settings.mjs` ha `validateOpenAIKey()` e `validateKankaToken()` che fanno validazione live via API
- `ApiKeyValidator` non e' usato da nessuna parte nel codice di produzione (solo nei test)
- Valutare se integrarlo in `Settings.mjs` per validazione formato pre-API o rimuoverlo

## INFO - FIXED

### I1. File non documentati in CLAUDE.md - ✅ FIXED
**Stato**: Risolto in subtask-6-1 - Tutti i file mancanti aggiunti alla sezione Project Structure.

### I2. Setting di relazioni non documentati - ✅ FIXED
**Stato**: Risolto in subtask-6-2 - Settings aggiunti alla documentazione CLAUDE.md.

## INFO - NOTE DI COMPATIBILITA' v13

### I3. Uso di jQuery (deprecato in v13)
- Tutti i file UI usano `html.find(...)`, `$(...)` e metodi jQuery
- In v13, jQuery e' deprecato ma ancora funzionante
- Migrazione a vanilla JS o alla nuova API ApplicationV2 in futuro

### I4. Classi Application/FormApplication legacy
- I componenti UI usano `Application` e `FormApplication` (API v1)
- In v13, `ApplicationV2` e' l'API raccomandata ma v1 e' ancora supportata
- Migrazione non urgente, priorita' bassa
