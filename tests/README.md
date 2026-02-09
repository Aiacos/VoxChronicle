# VoxChronicle Test Suite

Quick reference for running and writing tests. For comprehensive documentation, see [docs/TESTING.md](../docs/TESTING.md).

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode (auto-rerun on changes)
npm run test:watch

# Interactive UI
npm run test:ui

# Integration tests only
npm run test:integration
```

## Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all unit tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:ui` | Run with Vitest UI (web interface) |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:integration` | Run integration tests only |
| `npm test -- <path>` | Run specific test file or pattern |

### Examples

```bash
# Run a specific test file
npm test -- tests/audio/AudioRecorder.test.js

# Run all AI service tests
npm test -- tests/ai/

# Run tests with coverage threshold check
npm run test:coverage
```

## Directory Structure

```
tests/
├── ai/                    # AI service tests (transcription, images, entity extraction)
├── audio/                 # Audio recording and processing tests
├── content/               # Foundry compendium integration tests
├── core/                  # Core module and settings tests
├── fixtures/              # Test data and sample files
├── helpers/               # Test utilities (Foundry mocks, setup helpers)
├── integration/           # End-to-end workflow tests
├── kanka/                 # Kanka API integration tests
├── mocks/                 # Reusable mocks (OpenAI, Kanka, Foundry)
├── orchestration/         # Session workflow orchestration tests
├── services/              # Service layer tests
├── ui/                    # UI component tests
└── utils/                 # Utility function tests
```

## Coverage Information

Current test coverage (as of latest run):

- **Total Test Files**: 22
- **Total Tests**: 1,189
- **Unit Tests**: 1,102
- **Integration Tests**: 87
- **Coverage**: >80% for all core services

View detailed coverage:
```bash
npm run test:coverage
open coverage/index.html  # View interactive HTML report
```

## Writing Tests

### Basic Test Structure

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('MyService', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something', async () => {
    // Arrange
    const service = new MyService();

    // Act
    const result = await service.doSomething();

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Using Mocks

```javascript
import { setupFoundryMocks } from './helpers/foundry-mock.js';
import { createMockTranscriptionResponse } from './mocks/openai-mock.js';
import { createMockJournalResponse } from './mocks/kanka-mock.js';

beforeEach(() => {
  setupFoundryMocks();  // Mock Foundry VTT globals
});

it('should transcribe audio', async () => {
  const mockResponse = createMockTranscriptionResponse({
    text: 'Test transcription'
  });

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockResponse
  });

  // Your test code
});
```

### Test Fixtures

Use fixtures for consistent test data:

```javascript
import { audioFixtures } from './fixtures/audio-fixtures.js';

it('should process audio file', async () => {
  const audioBlob = audioFixtures.createMockAudioBlob(1024 * 1024); // 1MB
  // Test with audio blob
});
```

## Key Testing Principles

1. **Isolate Tests**: Use mocks to avoid external dependencies (APIs, file system)
2. **Test Behavior**: Focus on what the code does, not how it does it
3. **Clear Assertions**: One clear assertion per test when possible
4. **Descriptive Names**: Test names should describe the expected behavior
5. **Arrange-Act-Assert**: Follow AAA pattern for clarity

## Available Mocks

- **OpenAI Mock** (`mocks/openai-mock.js`): Mock transcription and image generation
- **Kanka Mock** (`mocks/kanka-mock.js`): Mock Kanka API responses
- **Foundry Mock** (`helpers/foundry-mock.js`): Mock Foundry VTT globals (game, settings, i18n)

## Troubleshooting

### Tests failing with "game is not defined"
```javascript
import { setupFoundryMocks } from './helpers/foundry-mock.js';

beforeEach(() => {
  setupFoundryMocks();
});
```

### Tests timing out
Increase timeout for slow operations:
```javascript
it('should handle long operation', async () => {
  // Test code
}, 10000); // 10 second timeout
```

### Coverage not showing new files
Ensure your file matches the coverage patterns in `vitest.config.js`:
```javascript
coverage: {
  include: ['scripts/**/*.mjs']
}
```

## Documentation

- **Comprehensive Testing Guide**: [docs/TESTING.md](../docs/TESTING.md)
- **Contributing Guidelines**: [docs/CONTRIBUTING.md](../docs/CONTRIBUTING.md)
- **Architecture Overview**: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- **API Reference**: [docs/API_REFERENCE.md](../docs/API_REFERENCE.md)

## CI/CD

Tests run automatically on:
- Every pull request
- Every push to main branch
- Manual workflow dispatch

See [docs/TESTING.md#cicd-integration](../docs/TESTING.md#cicd-integration) for CI/CD configuration details.

---

**Need Help?** Check the [comprehensive testing guide](../docs/TESTING.md) or open an issue on GitHub.
