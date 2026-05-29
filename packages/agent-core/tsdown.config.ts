import { defineConfig } from 'tsdown';

import { rawTextPlugin } from '../../build/raw-text-plugin.mjs';

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/agent/records/migration/index.ts',
    './src/session/store/index.ts',
  ],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  clean: true,
  plugins: [rawTextPlugin()],
  deps: {
    alwaysBundle: ['picomatch'],
    neverBundle: ['@byfriends/kosong', '@byfriends/kaos'],
  },
});
