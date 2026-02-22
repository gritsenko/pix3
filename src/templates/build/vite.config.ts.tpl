import { defineConfig, type Plugin } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, copyFileSync } from 'fs';

interface AssetManifest {
  files: string[];
}

// Project root is the directory containing this vite.config.ts file.
const projectDir = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(projectDir, 'asset-manifest.json');

function copyRuntimeAssetsPlugin(): Plugin {
  return {
    name: 'copy-runtime-assets',
    closeBundle() {
      if (!existsSync(manifestPath)) {
        console.warn('[RuntimeBuild] asset-manifest.json not found, skipping asset copy');
        return;
      }

      const raw = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw) as AssetManifest;
      const distDir = resolve(projectDir, 'dist');

      for (const relPath of manifest.files) {
        const source = resolve(projectDir, relPath);
        const target = resolve(distDir, relPath);
        const targetDir = dirname(target);

        if (!existsSync(source)) {
          console.warn(`[RuntimeBuild] Missing source asset: ${relPath}`);
          continue;
        }

        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        copyFileSync(source, target);
      }

      console.log(`[RuntimeBuild] Copied ${manifest.files.length} asset file(s) to dist`);
    },
  };
}

export default defineConfig({
  root: projectDir,
  base: './',
  resolve: {
    alias: {
      '@pix3/runtime': resolve(projectDir, 'pix3-runtime/src'),
    },
  },
  build: {
    outDir: resolve(projectDir, 'dist'),
    emptyOutDir: true,
  },
  plugins: [copyRuntimeAssetsPlugin()],
});