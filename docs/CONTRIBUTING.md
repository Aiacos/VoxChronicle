# Contributing to VoxChronicle

Thank you for your interest in contributing to VoxChronicle! We welcome contributions from the community to make this Foundry VTT module even better.

This document provides guidelines and instructions for contributing to the project.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Ways to Contribute](#ways-to-contribute)
3. [Getting Started](#getting-started)
   - [Development Environment Setup](#development-environment-setup)
   - [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
   - [Branching Strategy](#branching-strategy)
   - [Making Changes](#making-changes)
   - [Testing](#testing)
5. [Code Style Guidelines](#code-style-guidelines)
   - [JavaScript Conventions](#javascript-conventions)
   - [CSS Conventions](#css-conventions)
   - [Documentation](#documentation)
6. [Submitting Changes](#submitting-changes)
   - [Pull Request Process](#pull-request-process)
   - [Commit Message Guidelines](#commit-message-guidelines)
7. [Reporting Issues](#reporting-issues)
   - [Bug Reports](#bug-reports)
   - [Feature Requests](#feature-requests)
8. [Documentation Contributions](#documentation-contributions)
9. [Translation Contributions](#translation-contributions)
10. [Getting Help](#getting-help)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors. We expect all participants to:

- Be respectful and considerate of differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what is best for the community and the project
- Show empathy towards other community members

### Unacceptable Behavior

The following behaviors are unacceptable:

- Harassment, discrimination, or offensive comments
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Instances of unacceptable behavior may be reported to the project maintainers. All complaints will be reviewed and investigated promptly and fairly.

---

## Ways to Contribute

There are many ways to contribute to VoxChronicle:

### 1. Code Contributions

- **Bug Fixes**: Fix reported bugs or issues you encounter
- **New Features**: Implement new functionality (discuss with maintainers first)
- **Performance Improvements**: Optimize existing code
- **Refactoring**: Improve code quality and maintainability

### 2. Documentation

- **Improve Existing Docs**: Fix typos, clarify instructions, add examples
- **Add New Documentation**: Document undocumented features or workflows
- **User Guides**: Write tutorials and how-to guides
- **API Documentation**: Improve JSDoc comments and API reference

### 3. Testing

- **Report Bugs**: Test the module and report issues
- **Write Tests**: Add unit tests or integration tests
- **Manual Testing**: Test pull requests and new features

### 4. Design and UX

- **UI Improvements**: Suggest or implement UI enhancements
- **User Experience**: Identify UX issues and propose solutions
- **Icons and Assets**: Contribute visual assets

### 5. Translations

- **Add Languages**: Translate the module to new languages
- **Update Translations**: Keep existing translations up to date

### 6. Community Support

- **Answer Questions**: Help other users in discussions or issues
- **Share Knowledge**: Write blog posts, create videos, or share tips
- **Spread the Word**: Share the project with others who might find it useful

---

## Getting Started

### Development Environment Setup

#### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (comes with Node.js)
- **Git**
- **Foundry VTT** (v13 for testing)
- **Code Editor** (VS Code recommended)

#### Initial Setup

1. **Fork the Repository**

   Fork the [VoxChronicle repository](https://github.com/Aiacos/VoxChronicle) to your GitHub account.

2. **Clone Your Fork**

   ```bash
   git clone https://github.com/YOUR-USERNAME/VoxChronicle.git
   cd VoxChronicle
   ```

3. **Add Upstream Remote**

   ```bash
   git remote add upstream https://github.com/Aiacos/VoxChronicle.git
   ```

4. **Install Dependencies**

   ```bash
   npm install
   ```

5. **Link to Foundry VTT**

   Create a symbolic link from your development directory to your Foundry VTT modules folder:

   **Linux/macOS:**
   ```bash
   ln -s "$(pwd)" ~/.local/share/FoundryVTT/Data/modules/vox-chronicle
   ```

   **Windows (Run as Administrator):**
   ```cmd
   mklink /J "C:\Users\{YourUser}\AppData\Local\FoundryVTT\Data\modules\vox-chronicle" "%CD%"
   ```

6. **Verify Setup**

   ```bash
   npm run validate
   npm test
   ```

   Both commands should complete without errors.

#### Development Tools Setup

**Recommended VS Code Extensions:**

- **ESLint** - JavaScript linting
- **Prettier** - Code formatting
- **Vitest** - Test runner integration
- **Handlebars** - Template syntax highlighting
- **GitLens** - Git integration

### Project Structure

Familiarize yourself with the project structure:

```
vox-chronicle/
├── module.json                  # Foundry VTT manifest
├── scripts/
│   ├── main.mjs                 # Entry point
│   ├── core/                    # Core module functionality
│   ├── audio/                   # Audio recording services
│   ├── ai/                      # OpenAI integration
│   ├── kanka/                   # Kanka API integration
│   ├── orchestration/           # Workflow orchestration
│   ├── content/                 # Foundry content integration
│   ├── ui/                      # User interface components
│   └── utils/                   # Utility functions
├── styles/
│   └── vox-chronicle.css        # Module styles
├── templates/                   # Handlebars templates
├── lang/                        # Localization files
├── tests/                       # Unit and integration tests
└── docs/                        # Documentation

```

**Key Documentation Files:**

- `CLAUDE.md` - AI development context (must read for contributors)
- `docs/ARCHITECTURE.md` - System design documentation
- `docs/API_REFERENCE.md` - Service class documentation
- `README.md` - Project overview and setup

---

## Development Workflow

### Branching Strategy

We follow a simplified Git Flow workflow:

- **`main`** - Stable production-ready code
- **`develop`** - Integration branch for features (if applicable)
- **`feature/*`** - Feature development branches
- **`bugfix/*`** - Bug fix branches
- **`hotfix/*`** - Critical production fixes

### Making Changes

1. **Update Your Fork**

   ```bash
   git checkout main
   git pull upstream main
   git push origin main
   ```

2. **Create a Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

   Use descriptive branch names:
   - `feature/add-discord-integration`
   - `bugfix/fix-audio-recording-pause`
   - `docs/improve-api-reference`

3. **Make Your Changes**

   - Follow the [Code Style Guidelines](#code-style-guidelines)
   - Write or update tests as needed
   - Update documentation if necessary
   - Test your changes in Foundry VTT

4. **Commit Your Changes**

   ```bash
   git add .
   git commit -m "Your commit message"
   ```

   See [Commit Message Guidelines](#commit-message-guidelines) for details.

5. **Keep Your Branch Updated**

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

   Resolve any conflicts that arise.

6. **Push Your Branch**

   ```bash
   git push origin feature/your-feature-name
   ```

### Testing

#### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

#### Writing Tests

All new features and bug fixes should include tests:

1. **Create Test File**

   Place test files in `tests/` directory with `.test.js` extension:
   ```
   tests/services/MyService.test.js
   ```

2. **Test Structure**

   ```javascript
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import { MyService } from '../../scripts/services/MyService.mjs';

   describe('MyService', () => {
     let service;

     beforeEach(() => {
       // Setup
       service = new MyService();
     });

     afterEach(() => {
       // Cleanup
       vi.clearAllMocks();
     });

     describe('methodName', () => {
       it('should do something correctly', () => {
         const result = service.methodName();
         expect(result).toBe(expectedValue);
       });

       it('should handle errors gracefully', () => {
         expect(() => service.methodName(invalidInput)).toThrow();
       });
     });
   });
   ```

3. **Mock External Dependencies**

   ```javascript
   // Mock Foundry game object
   globalThis.game = {
     settings: {
       get: vi.fn(),
       set: vi.fn()
     },
     i18n: {
       localize: vi.fn(key => key)
     }
   };

   // Mock fetch
   global.fetch = vi.fn(() =>
     Promise.resolve({
       ok: true,
       json: () => Promise.resolve({ data: 'test' })
     })
   );
   ```

4. **Test Coverage Requirements**

   - Aim for at least 80% code coverage for new code
   - Test both happy paths and error cases
   - Test edge cases and boundary conditions

#### Manual Testing in Foundry VTT

1. **Enable the Module**
   - Launch Foundry VTT
   - Create or open a test world
   - Enable VoxChronicle module

2. **Test Your Changes**
   - Verify the feature works as expected
   - Test with different Foundry VTT versions (v11 and v12)
   - Test with different browsers (Chrome, Firefox)
   - Check for console errors

3. **Test Integration**
   - Test with OpenAI API (use test API key)
   - Test with Kanka API (use test campaign)
   - Verify data flows correctly end-to-end

---

## Code Style Guidelines

### JavaScript Conventions

Follow the established code patterns in the project. See `CLAUDE.md` for detailed patterns.

#### Module Structure

```javascript
// Use ES6 modules with .mjs extension
import { Logger } from '../utils/Logger.mjs';

// Module constant
const MODULE_ID = 'vox-chronicle';

// Export classes and functions
export class MyService {
  constructor(dependencies) {
    this.logger = Logger.createChild('MyService');
  }

  async myMethod() {
    try {
      // Implementation
      this.logger.debug('Method called');
    } catch (error) {
      this.logger.error('Method failed:', error);
      throw error;
    }
  }
}
```

#### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `AudioRecorder` |
| Methods | camelCase | `startRecording()` |
| Constants | UPPER_SNAKE_CASE | `MAX_CHUNK_SIZE` |
| Private methods | _camelCase | `_getSupportedMimeType()` |
| File names | PascalCase.mjs | `AudioRecorder.mjs` |

#### Code Quality

**DO:**

- Use `const` by default, `let` when reassignment is needed
- Use arrow functions for callbacks
- Use template literals for string interpolation
- Use async/await instead of raw promises
- Handle errors with try/catch blocks
- Use the Logger utility instead of console.log
- Validate input parameters
- Document public methods with JSDoc comments

```javascript
/**
 * Process audio recording and generate transcription
 * @param {Blob} audioBlob - The recorded audio file
 * @param {Object} options - Processing options
 * @param {string} options.language - Language hint for transcription
 * @param {boolean} options.diarize - Enable speaker diarization
 * @returns {Promise<Object>} Transcription result with speaker information
 * @throws {Error} If audio processing fails
 */
async processAudio(audioBlob, options = {}) {
  // Implementation
}
```

**DON'T:**

- Access `game` object before 'init' hook
- Use `var` for variable declarations
- Hardcode English strings (use i18n)
- Store API keys in source code
- Skip error handling for API calls
- Use `console.log` directly (use Logger)
- Create deeply nested callbacks (use async/await)

### CSS Conventions

All CSS must be namespaced with `.vox-chronicle` prefix:

```css
/* Container */
.vox-chronicle {
  /* Base styles */
}

/* Component - BEM-style naming */
.vox-chronicle-recorder {
  /* Component styles */
}

.vox-chronicle-recorder__button {
  /* Element styles */
}

.vox-chronicle-recorder__button--primary {
  /* Modifier styles */
}

.vox-chronicle-recorder--recording {
  /* State modifier */
}
```

**CSS Best Practices:**

- Use BEM (Block Element Modifier) naming convention
- Keep specificity low (avoid deep nesting)
- Use CSS variables for colors and spacing
- Ensure styles work with Foundry VTT themes
- Test in both light and dark themes

### Localization

All user-facing strings must use Foundry VTT's i18n system:

**JavaScript:**
```javascript
// Simple localization
const label = game.i18n.localize('VOXCHRONICLE.Button.StartRecording');

// With interpolation
const message = game.i18n.format('VOXCHRONICLE.Message.RecordingDuration', {
  duration: '1:30:45'
});
```

**Handlebars Templates:**
```handlebars
<button>{{localize "VOXCHRONICLE.Button.StartRecording"}}</button>
```

**Add translations to both language files:**

`lang/en.json`:
```json
{
  "VOXCHRONICLE": {
    "Button": {
      "StartRecording": "Start Recording"
    }
  }
}
```

`lang/it.json`:
```json
{
  "VOXCHRONICLE": {
    "Button": {
      "StartRecording": "Inizia Registrazione"
    }
  }
}
```

### Documentation

#### Code Comments

- Write clear, concise comments explaining "why", not "what"
- Document complex algorithms or non-obvious logic
- Keep comments up-to-date with code changes

```javascript
// Good: Explains why
// Chunk audio because OpenAI API has 25MB file size limit
if (audioBlob.size > MAX_CHUNK_SIZE) {
  chunks = AudioChunker.split(audioBlob);
}

// Bad: States the obvious
// Check if audio size is greater than max chunk size
if (audioBlob.size > MAX_CHUNK_SIZE) {
  chunks = AudioChunker.split(audioBlob);
}
```

#### JSDoc Comments

Document all public methods, classes, and complex types:

```javascript
/**
 * Service for recording audio from various sources
 * @class
 */
export class AudioRecorder {
  /**
   * Start recording audio from specified source
   * @param {Object} options - Recording options
   * @param {string} options.source - Audio source ('microphone' or 'webrtc')
   * @param {boolean} options.echoCancellation - Enable echo cancellation
   * @param {number} options.sampleRate - Audio sample rate in Hz
   * @returns {Promise<void>}
   * @throws {Error} If microphone permission denied or source unavailable
   */
  async startRecording(options = {}) {
    // Implementation
  }
}
```

---

## Submitting Changes

### Pull Request Process

1. **Ensure Your Code is Ready**

   - All tests pass (`npm test`)
   - Code follows style guidelines
   - Documentation is updated
   - Commits are clean and well-formatted

2. **Push Your Branch**

   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create Pull Request**

   - Go to your fork on GitHub
   - Click "New Pull Request"
   - Select your feature branch
   - Fill out the PR template

4. **PR Title Format**

   Use clear, descriptive titles:
   - `feat: Add Discord audio capture support`
   - `fix: Resolve audio chunking memory leak`
   - `docs: Update API reference for KankaService`
   - `refactor: Simplify SessionOrchestrator state management`
   - `test: Add unit tests for AudioRecorder`

5. **PR Description**

   Provide a comprehensive description:

   ```markdown
   ## Description
   Brief summary of the changes and why they're needed.

   ## Type of Change
   - [ ] Bug fix (non-breaking change which fixes an issue)
   - [ ] New feature (non-breaking change which adds functionality)
   - [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
   - [ ] Documentation update

   ## Testing
   Describe how you tested your changes.

   ## Screenshots (if applicable)
   Add screenshots to demonstrate visual changes.

   ## Checklist
   - [ ] Code follows project style guidelines
   - [ ] Self-review of code completed
   - [ ] Code commented where necessary
   - [ ] Documentation updated
   - [ ] Tests added/updated
   - [ ] All tests passing
   - [ ] No console errors in Foundry VTT
   ```

6. **Code Review Process**

   - Maintainers will review your PR
   - Address any feedback or requested changes
   - Once approved, maintainers will merge your PR

7. **After Merge**

   ```bash
   # Update your local main branch
   git checkout main
   git pull upstream main
   git push origin main

   # Delete your feature branch (optional)
   git branch -d feature/your-feature-name
   git push origin --delete feature/your-feature-name
   ```

### Commit Message Guidelines

Follow these conventions for commit messages:

#### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons, etc.)
- **refactor**: Code refactoring (no functional changes)
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Build process or tooling changes
- **revert**: Reverting a previous commit

#### Scope (Optional)

Specify the affected component:
- `audio`: Audio recording functionality
- `ai`: AI/OpenAI integration
- `kanka`: Kanka API integration
- `ui`: User interface
- `core`: Core module functionality
- `docs`: Documentation
- `build`: Build system

#### Subject

- Use imperative mood ("add", not "added" or "adds")
- Don't capitalize first letter
- No period at the end
- Limit to 50 characters

#### Body (Optional)

- Explain what and why, not how
- Wrap at 72 characters
- Separate from subject with blank line

#### Footer (Optional)

- Reference issues: `Fixes #123`, `Closes #456`
- Note breaking changes: `BREAKING CHANGE: description`

#### Examples

```
feat(audio): add pause/resume functionality to AudioRecorder

Implement pause() and resume() methods to allow interrupting
recordings without stopping completely. This enables users to
pause during breaks and continue recording afterward.

Closes #42
```

```
fix(kanka): handle rate limit errors with exponential backoff

Previously, rate limit errors (429) would fail immediately.
Now implements exponential backoff with retry logic to handle
temporary rate limiting gracefully.

Fixes #89
```

```
docs: update API reference for TranscriptionService

Add missing JSDoc comments and update examples to use
the new speaker diarization format introduced in v1.1.0
```

---

## Reporting Issues

### Bug Reports

Before creating a bug report:

1. **Search Existing Issues** - Check if the bug has already been reported
2. **Update to Latest Version** - Verify the bug exists in the latest release
3. **Gather Information** - Collect details about your environment

#### Bug Report Template

```markdown
**Describe the Bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What you expected to happen.

**Actual Behavior**
What actually happened.

**Screenshots**
If applicable, add screenshots to help explain the problem.

**Environment:**
- Foundry VTT Version: [e.g., v11.315]
- VoxChronicle Version: [e.g., 1.0.0]
- Browser: [e.g., Chrome 120]
- OS: [e.g., Windows 11]

**Console Output**
```
Paste any relevant console errors here
```

**Additional Context**
Add any other context about the problem here.
```

### Feature Requests

Feature requests are welcome! Please provide:

1. **Use Case** - Describe the problem you're trying to solve
2. **Proposed Solution** - How you envision the feature working
3. **Alternatives** - Other solutions you've considered
4. **Additional Context** - Any other relevant information

#### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem. Ex. I'm frustrated when [...]

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Alternative solutions or features you've considered.

**Additional context**
Any other context, screenshots, or examples about the feature request.

**Are you willing to contribute?**
- [ ] I can submit a pull request for this feature
- [ ] I can help test this feature
- [ ] I can help document this feature
```

---

## Documentation Contributions

Good documentation is crucial for the project. You can contribute to:

### Types of Documentation

1. **User Documentation** (`docs/USER_GUIDE.md`)
   - Installation instructions
   - Configuration guides
   - Usage tutorials
   - Troubleshooting tips

2. **Developer Documentation** (`docs/ARCHITECTURE.md`, `docs/API_REFERENCE.md`)
   - Architecture overviews
   - API documentation
   - Code examples
   - Design decisions

3. **AI Context** (`CLAUDE.md`)
   - Code patterns
   - Important gotchas
   - Common tasks
   - Development workflows

4. **Inline Documentation**
   - JSDoc comments
   - Code comments
   - README files

### Documentation Style Guide

- **Be Clear and Concise** - Use simple language
- **Provide Examples** - Show, don't just tell
- **Keep it Updated** - Update docs when code changes
- **Use Proper Markdown** - Follow markdown best practices
- **Include Table of Contents** - For longer documents
- **Test Instructions** - Verify steps actually work

### Documentation Pull Requests

Documentation PRs follow the same process as code PRs, but:
- No tests required (unless updating code examples)
- Faster review cycle
- Appreciated by all maintainers!

---

## Translation Contributions

VoxChronicle supports multiple languages. To add a new language or update existing translations:

### Adding a New Language

1. **Create Language File**

   Copy `lang/en.json` to `lang/XX.json` (where XX is the language code):
   ```bash
   cp lang/en.json lang/fr.json
   ```

2. **Translate Strings**

   Translate all values (not keys):
   ```json
   {
     "VOXCHRONICLE": {
       "Button": {
         "StartRecording": "Commencer l'enregistrement"
       }
     }
   }
   ```

3. **Update module.json**

   Add language to the `languages` array in `module.json`:
   ```json
   {
     "lang": "fr",
     "name": "Français",
     "path": "lang/fr.json"
   }
   ```

4. **Test Translation**

   - Launch Foundry VTT
   - Change language in settings
   - Verify all strings display correctly

### Translation Guidelines

- **Maintain JSON Structure** - Don't change keys, only values
- **Preserve Placeholders** - Keep `{variable}` placeholders intact
- **Context Matters** - Consider context when translating
- **Be Consistent** - Use consistent terminology
- **Test In-Game** - Verify translations fit in the UI

### Updating Existing Translations

If you notice missing or incorrect translations:

1. Check the English version (`lang/en.json`) for reference
2. Update the translation file
3. Submit a PR with your changes

---

## Getting Help

### Resources

- **Documentation**: Check `docs/` directory for detailed guides
- **CLAUDE.md**: Read AI development context for patterns and conventions
- **GitHub Issues**: Search existing issues for similar problems
- **GitHub Discussions**: Ask questions and discuss ideas

### Communication Channels

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions, ideas, and general discussion
- **Pull Requests**: For code review and technical discussion

### Questions?

If you're unsure about:

- **Architecture Decisions**: Check `docs/ARCHITECTURE.md`
- **API Details**: Check `docs/API_REFERENCE.md`
- **User Workflows**: Check `docs/USER_GUIDE.md`
- **Code Patterns**: Check `CLAUDE.md`
- **Contribution Process**: Re-read this document or ask in Discussions

### New Contributors

New to open source? No problem!

- Start with documentation improvements or translations
- Look for issues labeled `good first issue`
- Don't hesitate to ask questions
- We're here to help you succeed!

---

## Recognition

All contributors will be:

- Listed in the project's contributors page
- Credited in release notes for significant contributions
- Appreciated by the community!

---

## Thank You!

Your contributions make VoxChronicle better for everyone. Whether you're fixing a typo, adding a feature, or helping other users, every contribution matters.

Happy coding! 🎲🎙️

---

*This document is adapted from best practices in open source contribution guidelines and is continually evolving. Suggestions for improvements are welcome!*
