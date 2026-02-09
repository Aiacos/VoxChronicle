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

## WARNING

### W1. Dipendenza circolare `MODULE_ID`
`main.mjs` esporta `MODULE_ID` e importa da `Settings.mjs`, `VoxChronicle.mjs`, che reimportano `MODULE_ID` da `main.mjs`. Lo stesso fa `Logger.mjs` (importato da 16 file).

Funziona perche' `MODULE_ID` e' usato solo dentro funzioni (non a livello di modulo), ma e' fragile.

**Fix**: Spostare `MODULE_ID` in `scripts/constants.mjs` o duplicarlo come costante locale in ogni file.

### W2. Icone Font Awesome inconsistenti tra v12 e v13
- v13 path (`main.mjs:104-147`): usa `fa-solid fa-*` (v13 standard)
- v11/v12 path (`main.mjs:167-206`): usa `fas fa-*` (shorthand vecchio)

Funzionale ma inconsistente.

### W3. `ApiKeyValidator.mjs` non integrato
- Il file esiste (152 righe) con validazione formato chiavi
- `Settings.mjs` ha `validateOpenAIKey()` e `validateKankaToken()` che fanno validazione live via API
- `ApiKeyValidator` non e' usato da nessuna parte nel codice di produzione (solo nei test)
- Valutare se integrarlo in `Settings.mjs` per validazione formato pre-API o rimuoverlo

## INFO

### I1. File non documentati in CLAUDE.md
Aggiunti dopo la stesura originale, da aggiungere alla sezione Project Structure:
- `scripts/utils/SensitiveDataFilter.mjs`
- `scripts/utils/HtmlUtils.mjs`
- `scripts/ui/RelationshipGraph.mjs`
- `scripts/utils/ApiKeyValidator.mjs`
- `templates/relationship-graph.hbs`
- `.gitleaksignore`

### I2. Setting di relazioni non documentati
Registrati in `Settings.mjs` ma non elencati in CLAUDE.md:
- `autoExtractRelationships`
- `relationshipConfidenceThreshold`
- `maxRelationshipsPerSession`
