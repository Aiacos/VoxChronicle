import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{js,mjs}'],
    exclude: ['tests/integration/**'],
    setupFiles: ['tests/helpers/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      include: ['scripts/**/*.mjs'],
      exclude: [
        'scripts/data/**',
        'scripts/constants.mjs',
        'scripts/main.mjs'
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90
      }
    }
  }
});
