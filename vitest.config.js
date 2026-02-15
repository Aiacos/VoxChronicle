import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // Browser-like environment for DOM testing
    globals: true,
    include: ['tests/**/*.test.js', 'tests/**/*.test.mjs'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/']
    }
  }
});
