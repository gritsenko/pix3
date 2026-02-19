import { defineConfig, type Plugin } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, copyFileSync } from 'fs';

interface AssetManifest {
  files: string[];
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const standaloneDir = currentDir;
const projectRoot = resolve(standaloneDir, '..');
const manifestPath = resolve(standaloneDir, 'asset-manifest.json');

function copyStandaloneAssetsPlugin(): Plugin {
  return {
    name: 'copy-standalone-assets',
    closeBundle() {
      if (!existsSync(manifestPath)) {
        console.warn('[StandaloneBuild] asset-manifest.json not found, skipping asset copy');
        return;
      }

      const raw = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw) as AssetManifest;
      const distDir = resolve(projectRoot, 'dist');

      for (const relPath of manifest.files) {
        const source = resolve(projectRoot, relPath);
        const target = resolve(distDir, relPath);
        const targetDir = dirname(target);

        if (!existsSync(source)) {
          console.warn(`[StandaloneBuild] Missing source asset: ${relPath}`);
          continue;
        }

        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        copyFileSync(source, target);
      }

      console.log(`[StandaloneBuild] Copied ${manifest.files.length} asset file(s) to dist`);
    },
  };
}

export default defineConfig({
  root: standaloneDir,
  resolve: {
    alias: {
      '@pix3/runtime': resolve(standaloneDir, 'runtime/src'),
      '@pix3/engine': resolve(standaloneDir, 'src/engine-api.ts'),
    },
  },
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
  },
  plugins: [copyStandaloneAssetsPlugin()],
});
