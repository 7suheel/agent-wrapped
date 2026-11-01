import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Stats use local time; pin it so tests pass in every timezone.
    env: { TZ: 'UTC' },
    testTimeout: 30_000,
  },
});
