import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'byf-oauth',
    include: ['test/**/*.test.ts'],
  },
});
