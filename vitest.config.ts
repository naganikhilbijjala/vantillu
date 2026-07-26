import { defineConfig } from 'vitest/config';

// Tests target src/core only — it is pure TypeScript and runs in plain Node.
// Nothing here should ever need a React Native or expo-sqlite shim.
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
