import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // Browser-like environment for DOM testing
    globals: true,
    include: ['tests/integration/**/*.test.js', 'tests/integration/**/*.test.mjs'],
    testTimeout: 30000, // Integration tests may take longer
    hookTimeout: 30000,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/']
    }
  }
});
