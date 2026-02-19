# VoxChronicle Test Suite (v3.0)

## Quick Start

```bash
npm install      # Install dependencies
npm test         # Run all 3742+ tests across 46 files
npm run test:ui  # Vitest interactive UI
```

## Directory Structure

```
tests/
├── ai/                    # AI service tests (7 files)
├── audio/                 # Audio recording and processing (2 files)
├── core/                  # Core module, settings, vocabulary (3 files)
├── helpers/               # Test setup (Foundry mocks, globals)
├── kanka/                 # Kanka API integration (4 files)
├── narrator/              # DM assistant services (8 files)
├── orchestration/         # Session workflows — includes integration flows (5 files)
├── rag/                   # RAG provider system (4 files)
├── ui/                    # UI components + memory leak regression (5 files)
└── utils/                 # Utility function tests (8 files)
```

## Coverage

Coverage enforced via `vitest.config.js` thresholds:
- Statements: 90%, Branches: 85%, Functions: 90%, Lines: 90%

```bash
npm run test:coverage      # Generate coverage report
```

## Key Testing Patterns

- Mock `game` object via `tests/helpers/setup.js` (auto-loaded)
- Mock `fetch` per test with `vi.fn().mockResolvedValue(...)`
- UI components: test AbortController cleanup + memory leak regression
- Orchestration tests cover full live/chronicle integration flows
