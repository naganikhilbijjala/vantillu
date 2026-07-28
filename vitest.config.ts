import { defineConfig } from 'vitest/config';

// Tests target src/core only — it is pure TypeScript and runs in plain Node.
// Nothing here should ever need a React Native or expo-sqlite shim.
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Coverage is measured over the engine, not the app. Everything outside src/core
      // needs a device or a database, which is exactly why it is not tested here.
      include: ['src/core/**/*.ts'],
      reporter: ['text', 'json-summary'],
      // Phase 2 is done when src/core is above 90%.
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
