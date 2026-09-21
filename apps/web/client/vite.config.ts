import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Bracket access, not dot: `process.env` is an index signature and the root
// tsconfig turns on `noPropertyAccessFromIndexSignature`. This file is outside
// the client project's `include` ("src" only) but the web-server test imports
// it to assert the dev proxy contract, which brings it into that program.
const apiPort = Number(process.env['PORT']) || 4100;
const webPort = Number(process.env['WEB_PORT']) || 4200;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: webPort,
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        // 必须保留浏览器侧的 Host。web-server 的跨源门(PRD-0038 AC-1.1)比较的是
        // Origin 与请求自身的 Host;`changeOrigin: true` 只把 Host 改写成 api 端口,
        // Origin 仍是 dev server 端口 → 两者不同源 → 开发态所有写请求 403。
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-tanstack';
          }
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/mdast') ||
            id.includes('node_modules/remark-') ||
            id.includes('node_modules/unified')
          ) {
            return 'vendor-markdown';
          }
        },
      },
    },
  },
});
