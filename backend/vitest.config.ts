import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    },
    globalSetup: ['src/tests/global-setup.ts'],
    setupFiles: ['src/tests/setup.ts']
  }
});