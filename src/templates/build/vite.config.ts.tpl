import { defineConfig, type Plugin } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { viteSingleFile } from 'vite-plugin-singlefile';

interface AssetManifest {
  files: string[];
}

interface EmbeddedAssetEntry {
  readonly base64: string;
  readonly mimeType: string;
}

// Project root is the directory containing this vite.config.ts file.
const projectDir = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(projectDir, 'asset-manifest.json');
const EMBEDDED_ASSETS_MODULE_ID = 'virtual:runtime-embedded-assets';
const RESOLVED_EMBEDDED_ASSETS_MODULE_ID = `\0${EMBEDDED_ASSETS_MODULE_ID}`;

function getMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.pix3scene') || lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return 'text/plain;charset=utf-8';
  }
  if (lower.endsWith('.json')) {
    return 'application/json;charset=utf-8';
  }
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.glb')) {
    return 'model/gltf-binary';
  }
  if (lower.endsWith('.gltf')) {
    return 'model/gltf+json';
  }

  return 'application/octet-stream';
}

function buildEmbeddedAssetsModule(): string {
  if (!existsSync(manifestPath)) {
    return 'export const embeddedAssets = {};\n';
  }

  const raw = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw) as AssetManifest;
  const embeddedAssets: Record<string, EmbeddedAssetEntry> = {};

  for (const relPath of manifest.files) {
    const source = resolve(projectDir, relPath);
    const normalizedPath = relPath.replace(/\\\\/g, '/').replace(/^\/+/, '');

    if (!existsSync(source)) {
      console.warn(`[RuntimeBuild] Missing source asset: ${relPath}`);
      continue;
    }

    const fileBytes = readFileSync(source);
    embeddedAssets[normalizedPath] = {
      base64: fileBytes.toString('base64'),
      mimeType: getMimeType(normalizedPath),
    };
  }

  return `export const embeddedAssets = ${JSON.stringify(embeddedAssets)};\n`;
}

function embeddedRuntimeAssetsPlugin(): Plugin {
  return {
    name: 'embedded-runtime-assets',
    resolveId(source) {
      if (source === EMBEDDED_ASSETS_MODULE_ID) {
        return RESOLVED_EMBEDDED_ASSETS_MODULE_ID;
      }

      return null;
    },
    load(id) {
      if (id === RESOLVED_EMBEDDED_ASSETS_MODULE_ID) {
        return buildEmbeddedAssetsModule();
      }

      return null;
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
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [embeddedRuntimeAssetsPlugin(), viteSingleFile()],
});