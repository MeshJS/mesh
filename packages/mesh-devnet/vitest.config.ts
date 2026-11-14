import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'test/**/*.test.ts'],
    // ESM + Node16 module resolution — vitest handles .js imports transparently
    globals: false,
    reporters: ['verbose'],
    pool: 'forks',          // isolate each test file; avoids ESM singleton conflicts
  },
});
