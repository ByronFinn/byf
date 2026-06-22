import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiPort = Number(process.env.PORT) || 5174;
const webPort = Number(process.env.WEB_PORT) || 5173;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: webPort,
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
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
          // Group React core + React Router into one vendor chunk
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          // Group TanStack libraries
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-tanstack';
          }
        },
      },
    },
  },
});
