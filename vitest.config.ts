import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run test files sequentially to avoid KuzuDB lock conflicts
    // (KuzuDB only supports single-writer access)
    fileParallelism: false,

    // Increase timeout for tests that load embedding models
    testTimeout: 60000,
    hookTimeout: 60000,

    // Include only src/tests directory
    include: ['src/tests/**/*.test.ts'],
  },
});
