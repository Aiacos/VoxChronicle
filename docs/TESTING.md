# Testing Guide

This document provides comprehensive information about VoxChronicle's test suite, including how to run tests, write new tests, and understand test coverage.

## Table of Contents

- [Overview](#overview)
- [Running Tests](#running-tests)
- [Test Infrastructure](#test-infrastructure)
- [Test Coverage](#test-coverage)
- [Writing New Tests](#writing-new-tests)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

VoxChronicle uses a comprehensive test suite to ensure code quality and prevent regressions. The test suite includes:

- **Unit Tests**: Test individual services and utilities in isolation
- **Integration Tests**: Test complete workflows end-to-end
- **Mock Infrastructure**: Reusable mocks for OpenAI, Kanka, and Foundry VTT APIs
- **Test Fixtures**: Pre-configured test data for audio samples and common scenarios
- **CI/CD Pipeline**: Automated testing on every pull request

### Test Framework

- **Vitest**: Fast, modern test framework with built-in coverage
- **jsdom**: Browser-like environment for DOM testing
- **vi.mock**: Module mocking for isolating components

### Test Statistics

As of the latest test run:

- **Total Test Files**: 22
- **Total Tests**: 1,189
- **Unit Tests**: 1,102
- **Integration Tests**: 87
- **Coverage**: >80% for all core services

## Running Tests

### Prerequisites

Install dependencies:

```bash
npm install
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all unit tests once |
| `npm run test:watch` | Run tests in watch mode (auto-rerun on changes) |
| `npm run test:ui` | Run tests with Vitest UI (web interface) |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:integration` | Run integration tests only |

### Examples

**Run all unit tests:**
```bash
npm test
```

**Run a specific test file:**
```bash
npm test -- tests/audio/AudioRecorder.test.js
```

**Run tests matching a pattern:**
```bash
npm test -- tests/ai/
```

**Run with coverage:**
```bash
npm run test:coverage
```

Coverage reports are generated in `coverage/` directory:
- `coverage/index.html` - Browse interactive coverage report
- `coverage/coverage-summary.json` - Machine-readable coverage data

**Run integration tests:**
```bash
npm run test:integration
```

**Watch mode (auto-rerun on file changes):**
```bash
npm run test:watch
```

**Interactive UI:**
```bash
npm run test:ui
```

## Test Infrastructure

### Mock Utilities

VoxChronicle provides reusable mocks to avoid calling real external APIs during testing.

#### OpenAI Mock (`tests/mocks/openai-mock.js`)

Mock OpenAI API responses for transcription and image generation:

```javascript
import {
  createMockTranscriptionResponse,
  createMockImageResponse,
  createMockAuthError,
  MockOpenAIClient
} from '../mocks/openai-mock.js';

// Create mock transcription
const transcription = createMockTranscriptionResponse({
  text: 'Test transcription',
  speakers: ['SPEAKER_00', 'SPEAKER_01']
});

// Create mock client
const client = new MockOpenAIClient();
client.setTranscriptionResponse(transcription);
```

**Available Mock Functions:**
- `createMockTranscriptionResponse(options)` - Generate transcription response
- `createMockImageResponse(options)` - Generate image generation response
- `createMockAuthError()` - Mock authentication error (401)
- `createMockRateLimitError()` - Mock rate limit error (429)
- `createMockServerError()` - Mock server error (500)
- `createMockAudioBlob(size)` - Generate test audio blob
- `createSpeakerSegments(count)` - Generate speaker segments
- `MockOpenAIClient` - Complete mock client class

#### Kanka Mock (`tests/mocks/kanka-mock.js`)

Mock Kanka API responses for entity management:

```javascript
import {
  createMockJournalResponse,
  createMockCharacterResponse,
  createMockLocationResponse,
  MockKankaClient
} from '../mocks/kanka-mock.js';

// Create mock journal
const journal = createMockJournalResponse({
  name: 'Session 1',
  entry: 'Chronicle text'
});

// Create mock client
const client = new MockKankaClient(12345);
client.setEntityResponse('journals', journal);
```

**Available Mock Functions:**
- `createMockJournalResponse(options)` - Generate journal response
- `createMockCharacterResponse(options)` - Generate character response
- `createMockLocationResponse(options)` - Generate location response
- `createMockItemResponse(options)` - Generate item response
- `createMockOrganisationResponse(options)` - Generate organisation response
- `createMockQuestResponse(options)` - Generate quest response
- `createMockNotFoundError()` - Mock not found error (404)
- `createMockValidationError(fields)` - Mock validation error (422)
- `createMockRateLimitError()` - Mock rate limit error (429)
- `MockKankaClient` - Complete mock client class

#### Foundry VTT Mock (`tests/helpers/foundry-mock.js`)

Mock Foundry VTT global objects and APIs:

```javascript
import { setupFoundryMocks, clearFoundryMocks } from '../helpers/foundry-mock.js';

beforeEach(() => {
  setupFoundryMocks();
});

afterEach(() => {
  clearFoundryMocks();
});

// Mock game object is now available
game.settings.set('vox-chronicle', 'apiKey', 'test-key');
```

**Mocked Foundry Objects:**
- `game.settings` - Setting registration and storage
- `game.i18n` - Localization (returns key for missing translations)
- `game.user` - Current user mock
- `game.users` - User collection
- `game.packs` - Compendium pack collection
- `foundry.utils` - Utility functions (mergeObject, deepClone, randomID)
- `Application` - Base Application class for UI components
- `Hooks` - Event hook system

### Test Fixtures

#### Audio Samples (`tests/fixtures/audio-samples.js`)

Pre-configured audio samples for testing:

```javascript
import {
  SMALL_AUDIO_SAMPLES,
  LARGE_AUDIO_SAMPLES,
  REALISTIC_AUDIO_SAMPLES,
  createMockAudioBlob,
  createRealisticWebMBlob
} from '../fixtures/audio-samples.js';

// Use pre-defined samples
const smallAudio = SMALL_AUDIO_SAMPLES.TINY; // 1KB
const largeAudio = LARGE_AUDIO_SAMPLES.EXACTLY_25MB;

// Create custom sample
const customAudio = createMockAudioBlob(1024 * 1024, 'audio/webm');
```

**Available Fixtures:**
- **Size Constants**: `TINY`, `SMALL`, `MEDIUM`, `LARGE`, `HUGE`
- **Pre-defined Samples**: Small (1KB-1MB), Large (10MB-100MB), Realistic (1-60min sessions)
- **Helper Functions**: `createMockAudioBlob()`, `createRealisticWebMBlob()`, `estimateAudioDuration()`

### Test Helpers

Common helper functions used across tests:

```javascript
// Mock audio creation
function createMockAudioBlob(size = 1024) {
  const data = new Uint8Array(size).fill(0);
  return new Blob([data], { type: 'audio/webm' });
}

// Mock transcription result
function createMockTranscriptionResult(options = {}) {
  return {
    text: options.text || 'Test transcription',
    segments: options.segments || [],
    speakers: options.speakers || [],
    language: 'en',
    duration: options.duration || 0
  };
}

// Mock entity extraction result
function createMockEntityExtractionResult() {
  return {
    characters: [],
    locations: [],
    items: [],
    moments: [],
    totalCount: 0
  };
}
```

## Test Coverage

### Current Coverage

Core services coverage (as of latest report):

| Service | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| **AI Services** | 99.18% | 97.50% | 98.00% | 99.18% |
| `OpenAIClient.mjs` | 100% | 100% | 100% | 100% |
| `TranscriptionService.mjs` | 98.46% | 94.73% | 95.00% | 98.46% |
| `ImageGenerationService.mjs` | 100% | 100% | 100% | 100% |
| `EntityExtractor.mjs` | 98.63% | 97.91% | 100% | 98.63% |
| **Audio Services** | 98.66% | 96.42% | 96.15% | 98.66% |
| `AudioRecorder.mjs` | 98.11% | 95.23% | 94.73% | 98.11% |
| `AudioChunker.mjs` | 99.30% | 98.07% | 100% | 99.30% |
| **Kanka Services** | 94.22% | 88.13% | 92.30% | 94.22% |
| `KankaClient.mjs` | 92.85% | 85.00% | 90.00% | 92.85% |
| `KankaService.mjs` | 94.73% | 89.47% | 93.33% | 94.73% |
| `NarrativeExporter.mjs` | 95.65% | 90.00% | 95.00% | 95.65% |
| **Orchestration** | 95.90% | 91.30% | 94.44% | 95.90% |
| `SessionOrchestrator.mjs` | 95.90% | 91.30% | 94.44% | 95.90% |

**Overall Core Coverage**: >95% across all critical paths

### Coverage Thresholds

The CI/CD pipeline enforces minimum coverage thresholds:

- **Statements**: 80%
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%

### Coverage Gaps

Known areas with <100% coverage:

#### Low-Priority Gaps (acceptable)
- **Error edge cases**: Some error handling paths are difficult to trigger in tests (e.g., network timeouts, browser API failures)
- **UI Components**: `RecorderControls.mjs`, `EntityPreview.mjs`, `SpeakerLabeling.mjs` have lower coverage as they require complex DOM interaction testing
- **Settings Registration**: `Settings.mjs` relies heavily on Foundry's runtime and is tested through integration
- **Main Entry Point**: `main.mjs` initializes hooks and is tested through manual QA

#### Medium-Priority Gaps (future improvement)
- **Relationship Extractor**: Complex relationship detection has some uncovered edge cases
- **Compendium Searcher**: Some fuzzy search edge cases are not fully covered
- **Rate Limiter**: Extreme concurrency scenarios not fully tested

#### High-Priority Gaps (should be addressed)
- **Publication Flow Integration**: Currently has 18 failing tests due to mock configuration issues (being tracked separately)

### Viewing Coverage Reports

After running `npm run test:coverage`:

```bash
# Open HTML coverage report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

Coverage highlights:
- **Green**: Well-covered code (>80%)
- **Yellow**: Partially covered (50-80%)
- **Red**: Poorly covered (<50%)

## Writing New Tests

### Unit Test Structure

Unit tests follow this pattern:

```javascript
/**
 * ServiceName Unit Tests
 *
 * Brief description of what's being tested.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies first
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}));

// Import service after mocks
import { ServiceName } from '../../scripts/services/ServiceName.mjs';

describe('ServiceName', () => {
  let service;

  beforeEach(() => {
    service = new ServiceName();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do the expected thing', async () => {
      // Arrange
      const input = 'test';

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle errors gracefully', async () => {
      // Arrange - set up error condition

      // Act & Assert
      await expect(service.methodName(null))
        .rejects.toThrow('Expected error message');
    });
  });
});
```

### Integration Test Structure

Integration tests follow this pattern:

```javascript
/**
 * Feature Flow Integration Tests
 *
 * End-to-end tests for complete workflow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up mocks
import { setupFoundryMocks, clearFoundryMocks } from '../helpers/foundry-mock.js';
import { MockOpenAIClient } from '../mocks/openai-mock.js';
import { MockKankaClient } from '../mocks/kanka-mock.js';

describe('Feature Flow Integration', () => {
  let orchestrator;

  beforeEach(() => {
    setupFoundryMocks();
    orchestrator = new SessionOrchestrator({
      openaiClient: new MockOpenAIClient(),
      kankaClient: new MockKankaClient(12345)
    });
  });

  afterEach(() => {
    clearFoundryMocks();
    vi.clearAllMocks();
  });

  describe('complete workflow', () => {
    it('should complete recording → transcription → publication', async () => {
      // Arrange
      const audioBlob = createMockAudioBlob();

      // Act - start recording
      await orchestrator.startSession();
      await orchestrator.processRecording(audioBlob);

      // Assert - verify entire workflow
      expect(orchestrator.getState()).toBe('COMPLETED');
      expect(orchestrator.getSession().transcript).toBeDefined();
      expect(orchestrator.getSession().entities).toBeDefined();
    });
  });
});
```

### Test File Naming

Follow these conventions:

- **Unit tests**: `{ServiceName}.test.js` in same structure as source
  - Source: `scripts/audio/AudioRecorder.mjs`
  - Test: `tests/audio/AudioRecorder.test.js`

- **Integration tests**: `{feature}-flow.test.js` in `tests/integration/`
  - Example: `tests/integration/recording-flow.test.js`

### What to Test

**DO test:**
- ✅ Public API methods and their return values
- ✅ Error handling and edge cases
- ✅ State transitions and validation
- ✅ Integration between components
- ✅ API request/response handling
- ✅ Data transformations and formatting

**DON'T test:**
- ❌ Internal implementation details (private methods)
- ❌ Third-party library internals
- ❌ Trivial getters/setters (unless they have logic)
- ❌ Auto-generated code

### Mocking Guidelines

**When to mock:**
- External APIs (OpenAI, Kanka)
- File system operations
- Network requests
- Browser APIs (MediaRecorder, fetch)
- Foundry VTT globals
- Time-dependent operations (Date.now(), performance.now())

**When NOT to mock:**
- The service you're testing (test the real thing!)
- Simple utilities (math, string manipulation)
- Data structures (unless they have side effects)

### Example: Adding a New Service Test

Let's say you're adding a new service `ChatAnalyzer`:

1. **Create test file**: `tests/services/ChatAnalyzer.test.js`

2. **Set up mocks**:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    })
  }
}));

import { ChatAnalyzer } from '../../scripts/services/ChatAnalyzer.mjs';
```

3. **Write tests**:
```javascript
describe('ChatAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new ChatAnalyzer();
  });

  describe('analyzeMessage', () => {
    it('should detect in-character speech', () => {
      const message = '"I draw my sword!" said Aragorn';
      const result = analyzer.analyzeMessage(message);

      expect(result.isInCharacter).toBe(true);
      expect(result.speaker).toBe('Aragorn');
    });

    it('should detect out-of-character speech', () => {
      const message = 'Can I roll for initiative?';
      const result = analyzer.analyzeMessage(message);

      expect(result.isInCharacter).toBe(false);
    });
  });
});
```

4. **Run tests**:
```bash
npm test -- tests/services/ChatAnalyzer.test.js
```

## CI/CD Integration

### GitHub Actions Workflow

Tests run automatically on:
- **Push** to `main` or `develop` branches
- **Pull Requests** to any branch

The workflow (`.github/workflows/test.yml`):
1. Checks out code
2. Sets up Node.js (versions 18 and 20)
3. Installs dependencies with cache
4. Runs linting (`npm run lint`)
5. Runs unit tests (`npm test`)
6. Runs integration tests (`npm run test:integration`)
7. Generates coverage report
8. Validates coverage thresholds (80%)
9. Uploads coverage artifacts

### Coverage Threshold Enforcement

The CI enforces minimum coverage:

```bash
# Automatic coverage check
if [ "$LINES_COVERAGE" -lt 80 ]; then
  echo "❌ Coverage below 80% threshold"
  exit 1
fi
```

Pull requests failing coverage checks will not pass CI.

### Test Status Badge

The README includes a test status badge showing current CI status:

```markdown
![Tests](https://img.shields.io/github/workflow/status/Aiacos/VoxChronicle/Test%20Suite)
```

### Local Pre-commit Testing

Before pushing, run:

```bash
# Quick verification
npm test

# Full verification (like CI)
npm run lint && npm test && npm run test:integration
```

## Best Practices

### 1. Arrange-Act-Assert Pattern

Structure tests clearly:

```javascript
it('should calculate correct total', () => {
  // Arrange - set up test data
  const items = [1, 2, 3];

  // Act - perform the operation
  const total = calculateTotal(items);

  // Assert - verify the result
  expect(total).toBe(6);
});
```

### 2. Test One Thing Per Test

❌ **Bad** - testing multiple things:
```javascript
it('should handle user operations', () => {
  expect(user.create()).toBeTruthy();
  expect(user.update()).toBeTruthy();
  expect(user.delete()).toBeTruthy();
});
```

✅ **Good** - focused tests:
```javascript
it('should create user successfully', () => {
  expect(user.create()).toBeTruthy();
});

it('should update user successfully', () => {
  expect(user.update()).toBeTruthy();
});

it('should delete user successfully', () => {
  expect(user.delete()).toBeTruthy();
});
```

### 3. Use Descriptive Test Names

❌ **Bad**:
```javascript
it('works', () => { ... });
it('test 1', () => { ... });
```

✅ **Good**:
```javascript
it('should return empty array when no entities found', () => { ... });
it('should throw error when API key is invalid', () => { ... });
```

### 4. Don't Test Implementation Details

❌ **Bad** - testing private method:
```javascript
it('should call _internalHelper', () => {
  const spy = vi.spyOn(service, '_internalHelper');
  service.publicMethod();
  expect(spy).toHaveBeenCalled();
});
```

✅ **Good** - testing public behavior:
```javascript
it('should return formatted result', () => {
  const result = service.publicMethod();
  expect(result).toBe('formatted');
});
```

### 5. Clean Up After Tests

Always clean up mocks and state:

```javascript
beforeEach(() => {
  vi.clearAllMocks();
  setupFoundryMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearFoundryMocks();
});
```

### 6. Mock External Dependencies

Never call real APIs in tests:

```javascript
// Mock fetch globally
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'mock' })
  })
);
```

### 7. Test Error Cases

Test both happy path and error cases:

```javascript
describe('fetchData', () => {
  it('should return data on success', async () => {
    // Test success case
  });

  it('should throw error on network failure', async () => {
    // Test error case
  });

  it('should retry on rate limit', async () => {
    // Test edge case
  });
});
```

### 8. Use Test Fixtures

Reuse common test data:

```javascript
import { REALISTIC_AUDIO_SAMPLES } from '../fixtures/audio-samples.js';

it('should handle 30-minute session', () => {
  const audio = REALISTIC_AUDIO_SAMPLES.MEDIUM_SESSION_30MIN;
  // Test with realistic data
});
```

## Troubleshooting

### Common Issues

#### Tests failing with "MODULE_ID is not defined"

**Problem**: Logger or other modules can't find MODULE_ID.

**Solution**: Mock the main module:
```javascript
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
```

#### Tests failing with "game is not defined"

**Problem**: Foundry VTT globals not available.

**Solution**: Use Foundry mock helper:
```javascript
import { setupFoundryMocks } from '../helpers/foundry-mock.js';

beforeEach(() => {
  setupFoundryMocks();
});
```

#### Tests timeout or hang

**Problem**: Async operation not completing.

**Solution**:
1. Check for unresolved promises
2. Increase timeout for integration tests:
```javascript
it('should complete long operation', async () => {
  // Test code
}, 30000); // 30 second timeout
```

#### Mock not being used

**Problem**: Real module is imported instead of mock.

**Solution**: Mock BEFORE importing:
```javascript
// ✅ Correct order
vi.mock('../../scripts/utils/Logger.mjs', () => ({ ... }));
import { Service } from '../../scripts/services/Service.mjs';

// ❌ Wrong order
import { Service } from '../../scripts/services/Service.mjs';
vi.mock('../../scripts/utils/Logger.mjs', () => ({ ... }));
```

#### Coverage not updating

**Problem**: Coverage report shows stale data.

**Solution**:
```bash
# Clear coverage cache
rm -rf coverage node_modules/.vitest

# Run coverage again
npm run test:coverage
```

### Getting Help

If you encounter testing issues:

1. **Check existing tests**: Look at similar test files for patterns
2. **Read Vitest docs**: https://vitest.dev/
3. **Check CI logs**: GitHub Actions show detailed error messages
4. **Ask in issues**: Create a GitHub issue with the test failure details

## Contributing

When contributing new code:

1. ✅ Write tests for new features
2. ✅ Ensure tests pass locally (`npm test`)
3. ✅ Maintain or improve coverage (`npm run test:coverage`)
4. ✅ Follow existing test patterns
5. ✅ Add integration tests for new workflows
6. ✅ Update this document if adding new test infrastructure

### Pull Request Checklist

- [ ] All tests pass (`npm test`)
- [ ] Integration tests pass (`npm run test:integration`)
- [ ] Coverage ≥80% for new code (`npm run test:coverage`)
- [ ] Linting passes (`npm run lint`)
- [ ] No console.log or debugging code
- [ ] Tests follow existing patterns
- [ ] New test utilities are documented

---

**Last Updated**: 2026-02-07
**Test Framework**: Vitest 2.0.0
**Node Version**: >=18.0.0
**Coverage Threshold**: 80%
