import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/core': resolve(__dirname, 'src/core'),
      '@/services': resolve(__dirname, 'src/services'),
      '@/state': resolve(__dirname, 'src/state'),
      '@/fw': resolve(__dirname, 'src/fw'),
      '@pix3/runtime': resolve(__dirname, 'packages/pix3-runtime/src'),
    },
  },
  optimizeDeps: {
    include: ['three', 'lit', 'valtio', 'yaml', 'golden-layout'],
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          'pix3-runtime': ['@pix3/runtime'],
          three: ['three'],
        },
      },
    },
  },
  server: {
    port: 8123,
    fs: {
      allow: ['..'],
    },
    proxy: {
      // Proxy WebSocket connections to the collab server
      '/collab-ws': {
        target: 'ws://localhost:4000',
        ws: true,
        rewrite: (path) => path.replace(/^\/collab-ws/, ''),
      },
    },
  },
  esbuild: {
    sourcemap: false,
  },
});
