import { defineConfig } from 'vitest/config';

// Tests target the code that runs in plain Node: `src/core/` (the engine) and the two
// `src/db/` modules that deliberately import neither `db` nor a clock — `todayModel.ts`
// and `settings.ts`. Nothing here should ever need a React Native or expo-sqlite shim.
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The threshold below is the Phase 2 gate on the engine, so coverage stays scoped to
      // `src/core/`. The rest of `src/db/` needs a device or a database; `todayModel.ts`
      // does not and is tested, but it is not what this number is promising.
      include: ['src/core/**/*.ts'],
      reporter: ['text', 'json-summary'],
      // Phase 2 is done when src/core is above 90%.
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
