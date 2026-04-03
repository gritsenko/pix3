import { Server, Hocuspocus } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';
import fs from 'fs';
import path from 'path';
import * as Y from 'yjs';
import { config } from '../config.js';
import { verifyToken } from '../core/auth/auth-middleware.js';
import { getProjectByShareToken, getUserRole } from '../core/projects/projects-service.js';

export function createHocuspocusServer(): Hocuspocus {
  // Ensure CRDT sqlite directory exists
  const crdtDir = path.dirname(path.resolve(config.HOCUSPOCUS_DB_PATH));
  fs.mkdirSync(crdtDir, { recursive: true });

  return Server.configure({
    port: config.WS_PORT,
    extensions: [
      new SQLite({
        database: config.HOCUSPOCUS_DB_PATH,
      }),
    ],

    async onAuthenticate({ token, connection, documentName }) {
      // Document name format: project:{projectId}
      const projectId = documentName.replace(/^project:/, '');

      // Try JWT auth first
      if (token) {
        try {
          const payload = verifyToken(token);
          const role = getUserRole(projectId, payload.userId);
          if (role) {
            connection.readOnly = role === 'viewer';
            return { userId: payload.userId, role };
          }
        } catch {
          // JWT invalid — fall through to share token check
        }

        // Try as share token
        const project = getProjectByShareToken(token);
        if (project && project.id === projectId) {
          connection.readOnly = true;
          return { userId: 'guest', role: 'viewer' };
        }
      }

      throw new Error('Unauthorized');
    },

    async onLoadDocument({ document, documentName }) {
      const projectId = documentName.replace(/^project:/, '');
      const projectDir = path.resolve(config.PROJECTS_STORAGE_DIR, projectId);

      // If the CRDT document already has data, skip loading from files
      const scenesMap = document.getMap<Y.Map<unknown>>('scenes');
      if (scenesMap.size > 0) {
        return;
      }

      for (const scenePath of listFilesRecursive(projectDir, '.pix3scene')) {
        const relativePath = path.relative(projectDir, scenePath).split(path.sep).join('/');
        const sceneId = deriveSceneId(relativePath);
        const sceneMap = new Y.Map<unknown>();
        const content = fs.readFileSync(scenePath, 'utf-8');
        sceneMap.set('filePath', `res://${relativePath}`);
        sceneMap.set('snapshot', content);
        scenesMap.set(sceneId, sceneMap);
      }

      // Load scripts
      const scriptsMap = document.getMap('scripts');
      const scriptsDir = path.join(projectDir, 'scripts');
      if (fs.existsSync(scriptsDir)) {
        loadScriptsRecursive(scriptsDir, scriptsDir, scriptsMap, document);
      }
    },

    async onStoreDocument({ documentName, document }) {
      const projectId = documentName.replace(/^project:/, '');
      const projectDir = path.resolve(config.PROJECTS_STORAGE_DIR, projectId);
      fs.mkdirSync(projectDir, { recursive: true });

      const sceneFilePaths = new Set<string>();
      const scenesMap = document.getMap<Y.Map<unknown>>('scenes');
      for (const [sceneId, value] of scenesMap.entries()) {
        if (!(value instanceof Y.Map)) {
          continue;
        }

        const filePathValue = value.get('filePath');
        const snapshotValue = value.get('snapshot');
        if (typeof snapshotValue !== 'string') {
          continue;
        }

        const relativePath = normalizeStoredScenePath(
          typeof filePathValue === 'string' && filePathValue.trim()
            ? filePathValue
            : `${sceneId}.pix3scene`
        );
        const fullPath = path.resolve(projectDir, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, snapshotValue, 'utf-8');
        sceneFilePaths.add(fullPath);
      }
      reconcileFiles(projectDir, sceneFilePaths, '.pix3scene');

      // Save scripts
      const scriptsMap = document.getMap('scripts');
      const scriptsDir = path.join(projectDir, 'scripts');
      const scriptFilePaths = new Set<string>();
      for (const [scriptPath, value] of scriptsMap.entries()) {
        if (value instanceof Y.Text) {
          const fullPath = path.join(scriptsDir, scriptPath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, value.toString(), 'utf-8');
          scriptFilePaths.add(fullPath);
        }
      }
      reconcileFiles(scriptsDir, scriptFilePaths, '.ts');

      console.log(`[collab] persisted snapshot for: ${documentName}`);
    },

    async onConnect({ documentName }) {
      console.log(`[collab] client connected to: ${documentName}`);
    },

    async onDisconnect({ documentName }) {
      console.log(`[collab] client disconnected from: ${documentName}`);
    },
  });
}

function loadScriptsRecursive(
  rootDir: string,
  currentDir: string,
  scriptsMap: Y.Map<unknown>,
  doc: Y.Doc
): void {
  const items = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(currentDir, item.name);
    if (item.isDirectory()) {
      loadScriptsRecursive(rootDir, fullPath, scriptsMap, doc);
    } else if (item.isFile() && item.name.endsWith('.ts')) {
      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      const content = fs.readFileSync(fullPath, 'utf-8');
      const yText = new Y.Text(content);
      scriptsMap.set(relativePath, yText);
    }
  }
}

function normalizeStoredScenePath(filePath: string): string {
  const normalized = filePath.replace(/^res:\/\//i, '').replace(/^\/+/, '');
  return normalized.endsWith('.pix3scene') ? normalized : `${normalized}.pix3scene`;
}

function deriveSceneId(resourcePath: string): string {
  const withoutExtension = resourcePath.replace(/\.[^./]+$/i, '');
  const normalized = withoutExtension
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || 'scene';
}

function listFilesRecursive(rootDir: string, extension: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const result: string[] = [];
  const visit = (currentDir: string): void => {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        visit(fullPath);
      } else if (item.isFile() && item.name.endsWith(extension)) {
        result.push(fullPath);
      }
    }
  };

  visit(rootDir);
  return result;
}

function reconcileFiles(rootDir: string, desiredPaths: Set<string>, extension: string): void {
  for (const existingPath of listFilesRecursive(rootDir, extension)) {
    if (!desiredPaths.has(existingPath)) {
      fs.rmSync(existingPath, { force: true });
      pruneEmptyDirectories(path.dirname(existingPath), rootDir);
    }
  }
}

function pruneEmptyDirectories(startDir: string, stopDir: string): void {
  let currentDir = startDir;
  while (currentDir.startsWith(stopDir) && currentDir !== stopDir) {
    const contents = fs.readdirSync(currentDir);
    if (contents.length > 0) {
      return;
    }
    fs.rmdirSync(currentDir);
    currentDir = path.dirname(currentDir);
  }
}
