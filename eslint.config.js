/**
 * ESLint Configuration for VoxChronicle
 *
 * Uses ESLint 9 flat config format to enforce consistent code style
 * matching the existing codebase patterns.
 */

import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  // Recommended base rules
  js.configs.recommended,

  // Global ignores (equivalent to .eslintignore)
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'releases/**',
      '*.zip',
      'coverage/**',
      '.nyc_output/**',
      'logs/**',
      '*.log',
      '.DS_Store',
      'Thumbs.db',
      '.vscode/**',
      '.idea/**',
      '*.swp',
      '*.swo',
      '*~',
      'packs/**',
      'packs-src/**',
      '.git/**',
      '.auto-claude/**',
      'tmp/**',
      'temp/**',
      '*.tmp'
    ]
  },

  // Main configuration for scripts
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    plugins: {
      jsdoc
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser environment
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        URL: 'readonly',
        MediaRecorder: 'readonly',
        MediaStream: 'readonly',
        AudioContext: 'readonly',
        performance: 'readonly',
        navigator: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Audio: 'readonly',
        crypto: 'readonly',
        DOMParser: 'readonly',
        HTMLElement: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        indexedDB: 'readonly',
        IDBKeyRange: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',

        // Foundry VTT globals
        game: 'readonly',
        Hooks: 'readonly',
        ui: 'readonly',
        CONFIG: 'readonly',
        foundry: 'readonly',
        Application: 'readonly',
        FormApplication: 'readonly',
        SettingsConfig: 'readonly',
        Dialog: 'readonly',
        canvas: 'readonly',
        Actor: 'readonly',
        Item: 'readonly',
        Scene: 'readonly',
        JournalEntry: 'readonly',
        RollTable: 'readonly',
        $: 'readonly',

        // Third-party libraries
        vis: 'readonly',
        Handlebars: 'readonly'
      }
    },
    rules: {
      // Formatting rules disabled - handled by Prettier
      'indent': 'off',
      'linebreak-style': 'off',
      'quotes': 'off',
      'semi': 'off',
      'comma-dangle': 'off',
      'no-trailing-spaces': 'off',
      'eol-last': 'off',
      'no-multiple-empty-lines': 'off',
      'object-curly-spacing': 'off',
      'array-bracket-spacing': 'off',
      'space-before-function-paren': 'off',
      'keyword-spacing': 'off',
      'space-infix-ops': 'off',
      'arrow-spacing': 'off',
      'template-curly-spacing': 'off',

      // Best practices
      'no-unused-vars': ['warn', {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],
      'no-console': 'off',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'warn',
      'prefer-template': 'warn',
      'no-var': 'error',
      'no-undef': 'error',
      'eqeqeq': ['error', 'always', {
        'null': 'ignore'
      }],
      'curly': ['error', 'multi-line', 'consistent'],
      'brace-style': ['warn', '1tbs', {
        'allowSingleLine': true
      }],
      'max-len': ['warn', {
        'code': 120,
        'comments': 150,
        'ignoreUrls': true,
        'ignoreStrings': true,
        'ignoreTemplateLiterals': true,
        'ignoreRegExpLiterals': true
      }],

      // JSDoc rules
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-indentation': 'warn',
      'jsdoc/check-param-names': 'warn',
      'jsdoc/check-tag-names': 'warn',
      'jsdoc/check-types': 'warn',
      'jsdoc/require-description': 'off',
      'jsdoc/require-param': 'warn',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-param-type': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-returns-type': 'warn'
    }
  },

  // Test files configuration
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    plugins: {
      jsdoc
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        globalThis: 'writable',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',

        // Browser APIs needed in tests
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        URL: 'readonly',
        Headers: 'readonly',
        MediaRecorder: 'readonly',
        MediaStream: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        TextEncoder: 'readonly',
        navigator: 'readonly',
        AudioContext: 'readonly',
        crypto: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        Audio: 'readonly',

        // Browser/DOM globals used in tests
        document: 'readonly',
        DOMException: 'readonly',

        // Foundry VTT globals used in tests
        game: 'readonly',
        ui: 'readonly',
        Dialog: 'readonly',
        vis: 'readonly',
        Hooks: 'readonly',
        CONFIG: 'readonly',
        foundry: 'readonly',
        canvas: 'readonly',

        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        test: 'readonly'
      }
    },
    rules: {
      // Formatting rules disabled - handled by Prettier
      'indent': 'off',
      'linebreak-style': 'off',
      'quotes': 'off',
      'semi': 'off',
      'comma-dangle': 'off',
      'no-trailing-spaces': 'off',
      'eol-last': 'off',
      'no-multiple-empty-lines': 'off',
      'object-curly-spacing': 'off',
      'array-bracket-spacing': 'off',
      'space-before-function-paren': 'off',
      'keyword-spacing': 'off',
      'space-infix-ops': 'off',
      'arrow-spacing': 'off',
      'template-curly-spacing': 'off',
      'no-unused-vars': ['warn', {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-undef': 'error',
      'no-prototype-builtins': 'off',
      'require-yield': 'off',

      // Relaxed rules for tests
      'max-len': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off'
    }
  }
];
