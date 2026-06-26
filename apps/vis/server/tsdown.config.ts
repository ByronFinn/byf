import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  deps: {
    alwaysBundle: [/^@byfriends\//],
    neverBundle: [],
  },
});
