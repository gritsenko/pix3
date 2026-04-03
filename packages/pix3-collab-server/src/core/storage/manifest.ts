import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ManifestEntry {
  path: string;
  kind: 'file' | 'directory';
  size: number;
  hash: string;
  modified: string;
}

export function buildManifest(projectDir: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];

  if (!fs.existsSync(projectDir)) {
    return entries;
  }

  walkDir(projectDir, projectDir, entries);
  return entries;
}

function walkDir(rootDir: string, currentDir: string, entries: ManifestEntry[]): void {
  const items = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(currentDir, item.name);
    if (item.isDirectory()) {
      const stat = fs.statSync(fullPath);
      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      entries.push({
        path: relativePath,
        kind: 'directory',
        size: 0,
        hash: '',
        modified: stat.mtime.toISOString(),
      });
      walkDir(rootDir, fullPath, entries);
    } else if (item.isFile()) {
      const content = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const stat = fs.statSync(fullPath);
      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      entries.push({
        path: relativePath,
        kind: 'file',
        size: stat.size,
        hash,
        modified: stat.mtime.toISOString(),
      });
    }
  }
}
