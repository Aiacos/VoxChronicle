import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // Browser-like environment for DOM testing
    globals: true,
    include: ['tests/integration/**/*.test.js', 'tests/integration/**/*.test.mjs'],
    setupFiles: ['tests/helpers/setup.js'],
    testTimeout: 60000, // Live API tests need generous timeouts
    hookTimeout: 30000,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/']
    }
  }
});
