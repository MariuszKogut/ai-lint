import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 60_000,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './junit.xml',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.system.test.ts', '**/node_modules/**'],
      reporter: ['text', 'text-summary', 'json-summary', 'json'],
    },
  },
})
