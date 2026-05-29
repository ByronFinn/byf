import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { server: 'src/index.ts' },
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  external: ['@byfriends/agent-core', '@byfriends/kosong', '@byfriends/kaos'],
});
