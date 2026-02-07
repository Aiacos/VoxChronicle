# TODO - VoxChronicle

Audit del codebase eseguito il 2026-02-07. Correggere in ordine di priorita'.

## CRITICAL

### C1. Setting `kankaApiTokenCreatedAt` non registrato
- `VoxChronicle.mjs:189` legge con `_getSetting('kankaApiTokenCreatedAt')`
- `VoxChronicle.mjs:194` scrive con `game.settings.set(MODULE_ID, 'kankaApiTokenCreatedAt', ...)`
- `Settings.mjs` non contiene il `game.settings.register()` corrispondente
- **Causa crash runtime** quando il codice tenta di salvare il setting
- **Fix**: Aggiungere registrazione in `Settings.mjs` con `scope: 'world'`, `config: false`, `type: Number`, `default: 0`

### C2. Chiavi di localizzazione mancanti (4 chiavi x 2 lingue)
Usate nel codice ma assenti da `lang/en.json` e `lang/it.json`:

| Chiave | File | Riga |
|---|---|---|
| `VOXCHRONICLE.Kanka.TokenExpiringCritical` | VoxChronicle.mjs | 206 |
| `VOXCHRONICLE.Kanka.TokenExpiringUrgent` | VoxChronicle.mjs | 213 |
| `VOXCHRONICLE.Kanka.TokenExpiring` | VoxChronicle.mjs | 220 |
| `VOXCHRONICLE.Controls.RelationshipGraph` | main.mjs | 136, 194 |

L'utente vedra' la chiave grezza invece del testo tradotto.

### C3. `console.log` diretto invece di Logger (~20 occorrenze)
CLAUDE.md vieta `console.log` diretto. Violazioni in:
- `main.mjs`: righe 46, 57, 70, 76, 80, 183
- `VoxChronicle.mjs`: righe 91, 95, 110, 113, 147, 149, 185, 198, 224, 241, 251, 276
- `Settings.mjs`: riga 239

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
