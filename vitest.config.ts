import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        'src/core/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
