import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'byf-telemetry',
    include: ['test/**/*.test.ts'],
  },
});
