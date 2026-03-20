# Technology Stack

**Analysis Date:** 2026-03-19

## Languages

**Primary:**
- JavaScript ES6+ with `.mjs` extension - All production code in `scripts/`
- Handlebars `.hbs` - UI templates in `templates/`
- CSS3 - Module styling in `styles/`

**Secondary:**
- JSON - Lang files (`lang/*.json`), module manifest (`module.json`), package config

## Runtime

**Environment:**
- Browser (Foundry VTT's Electron wrapper or any modern browser)
- Node.js >=18.0.0 for dev tooling only (no Node APIs in production code)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Foundry VTT Module API v13 - Application lifecycle, hooks, settings, i18n
- Foundry VTT ApplicationV2 + HandlebarsApplicationMixin - UI components
  - Entry: `scripts/main.mjs`
  - Compatibility: `module.json` minimum: "13", verified: "13"

**Testing:**
- Vitest ^2.0.0 - Test runner with jsdom environment
  - Config: `vitest.config.js`
  - Coverage: v8 provider, thresholds: statements 90%, branches 85%, functions 90%, lines 90%
  - Integration config: `vitest.integration.config.js` (separate, excluded from default run)
- jsdom ^24.0.0 - Browser API simulation for tests

**Build/Dev:**
- ESLint ^9.39.2 with `@eslint/js` and `eslint-plugin-jsdoc` - Linting
- Prettier ^3.8.1 - Code formatting
- No bundler/transpiler - Pure ES modules loaded directly by Foundry VTT
- `build.sh` / `build.bat` - ZIP packaging scripts for Foundry release

## Key Dependencies

**Critical (devDependencies only — zero runtime npm dependencies):**
- `vitest` ^2.0.0 - Test runner
- `@vitest/coverage-v8` ^2.0.0 - Coverage provider
- `@vitest/ui` ^2.0.0 - Test UI
- `jsdom` ^24.0.0 - DOM simulation
- `eslint` ^9.39.2 - Linting
- `eslint-plugin-jsdoc` ^62.5.4 - JSDoc linting
- `prettier` ^3.8.1 - Formatting

**Zero production npm dependencies** — All runtime code uses browser APIs and Foundry VTT APIs only. No bundled third-party libraries.

**External libraries loaded at runtime (CDN):**
- `vis-network` - Loaded on demand for `RelationshipGraph.mjs` (`scripts/ui/RelationshipGraph.mjs`)
  - Pattern: `if (!window.vis)` guard prevents double-load

## Configuration

**Module Manifest:**
- `module.json` — Foundry VTT manifest: version 4.0.3, id "vox-chronicle", ESModules entry, styles array (4 files in order), 7 language packs

**CSS Loading Order (critical — tokens must load before main CSS):**
```
styles/tokens/primitives.css   → raw color/spacing/type primitives
styles/tokens/semantic.css     → semantic roles mapped from primitives
styles/tokens/components.css   → per-component tokens
styles/vox-chronicle.css       → all module styles (references var(--vox-*))
```

**Test Configuration:**
- `vitest.config.js` — Unit tests: `tests/**/*.test.{js,mjs}`, excludes `tests/integration/`
- `vitest.integration.config.js` — Integration tests: `tests/integration/`
- `tests/helpers/setup.js` — Global setup (game mock, Foundry globals)

**Linting/Formatting:**
- ESLint config: `eslint.config.mjs` (inferred from package.json scripts)
- Prettier: `prettier --write 'scripts/**/*.mjs' 'tests/**/*.js'`

**Environment:**
- No `.env` files — API keys stored in Foundry VTT client/world settings at runtime
- No environment variables needed for build
- `game.settings.get(MODULE_ID, 'openaiApiKey')` — reads at runtime from Foundry

## Platform Requirements

**Development:**
- Node.js >=18.0.0
- npm (for devDependencies: vitest, eslint, prettier, jsdom)
- No Foundry VTT needed for unit tests (jsdom mocks browser environment)

**Production:**
- Foundry VTT v13 (minimum and verified)
- No maximum version specified (only "13" range)
- Any browser Foundry supports (Chrome, Firefox, Safari, Edge)
- HTTPS or localhost for microphone access (browser security requirement)

## CI/CD

**GitHub Actions workflows:**
- `.github/workflows/release.yml` — Build & Release
  - Trigger: push to `master` (stable) or `develop` (pre-release RC)
  - Gate: test job must pass before release job runs
  - Node.js version: 20.x
  - Stable tags: `vX.Y.Z` (auto-bumps patch if tag exists)
  - RC tags: `vX.Y.Z-rc.N` (auto-increments RC number)
  - Artifacts: ZIP + standalone `module.json` uploaded as GitHub Release assets
- `.github/workflows/test.yml` — Test runner (inferred from workflow directory)

**Build Scripts:**
- `bash build.sh` — Linux/macOS: creates `releases/{id}-v{version}.zip`
- `build.bat` — Windows equivalent
- Auto-detects module ID, version, and GitHub URL from `module.json`

## NPM Scripts

```bash
npm test                    # Vitest run (unit tests only)
npm run test:watch          # Vitest watch mode
npm run test:ui             # Vitest with UI
npm run test:coverage       # Vitest run with coverage report
npm run test:integration    # Integration tests (separate config)
npm run lint                # ESLint check
npm run lint:fix            # ESLint auto-fix
npm run format              # Prettier write
npm run format:check        # Prettier check
npm run validate            # node --check scripts/main.mjs (syntax only)
```

---

*Stack analysis: 2026-03-19*
