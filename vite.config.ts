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
    exclude: ['@pix3/runtime'],
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
    fs: {
      allow: ['..'],
    },
  },
  esbuild: {
    sourcemap: false,
  },
});
