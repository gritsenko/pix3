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
    },
  },
});
