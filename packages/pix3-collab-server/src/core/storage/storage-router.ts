import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { config } from '../../config.js';
import { requireAuth, AuthenticatedRequest } from '../auth/auth-middleware.js';
import { getUserRole } from '../projects/projects-service.js';
import { buildManifest } from './manifest.js';

export const storageRouter = Router();

// All storage routes require auth
storageRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

function getProjectDir(projectId: string): string {
  return path.resolve(config.PROJECTS_STORAGE_DIR, projectId);
}

function resolveSafePath(projectDir: string, filePath: string): string | null {
  const resolved = path.resolve(projectDir, filePath);
  // Prevent path traversal
  if (!resolved.startsWith(projectDir + path.sep) && resolved !== projectDir) {
    return null;
  }
  return resolved;
}

function checkAccess(req: AuthenticatedRequest, res: Response, write: boolean): boolean {
  const projectId = req.params.id;
  const userId = req.user!.id;
  const role = getUserRole(projectId, userId);

  if (!role) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  if (write && role === 'viewer') {
    res.status(403).json({ error: 'Write access denied' });
    return false;
  }
  return true;
}

// GET /api/projects/:id/manifest — file tree with hashes
storageRouter.get('/:id/manifest', (req: AuthenticatedRequest, res: Response) => {
  if (!checkAccess(req, res, false)) return;

  const projectDir = getProjectDir(req.params.id);
  const manifest = buildManifest(projectDir);
  res.json({ files: manifest });
});

// GET /api/projects/:id/files/* — download file
storageRouter.get('/:id/files/*', (req: AuthenticatedRequest, res: Response) => {
  if (!checkAccess(req, res, false)) return;

  const filePath = (req.params as Record<string, string>)[0];
  if (!filePath) {
    res.status(400).json({ error: 'File path is required' });
    return;
  }

  const projectDir = getProjectDir(req.params.id);
  const fullPath = resolveSafePath(projectDir, filePath);
  if (!fullPath) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.sendFile(fullPath);
});

// POST /api/projects/:id/files/* — upload/overwrite file
storageRouter.post('/:id/files/*', upload.single('file'), (req: Request & AuthenticatedRequest, res: Response) => {
  if (!checkAccess(req, res, true)) return;

  const filePath = (req.params as Record<string, string>)[0];
  if (!filePath) {
    res.status(400).json({ error: 'File path is required' });
    return;
  }

  const projectDir = getProjectDir(req.params.id);
  const fullPath = resolveSafePath(projectDir, filePath);
  if (!fullPath) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  // Support both multipart upload and raw body
  let content: Buffer;
  if (req.file) {
    content = req.file.buffer;
  } else if (req.body && Buffer.isBuffer(req.body)) {
    content = req.body;
  } else if (typeof req.body === 'string') {
    content = Buffer.from(req.body, 'utf-8');
  } else {
    res.status(400).json({ error: 'No file content provided. Use multipart or raw body.' });
    return;
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);

  res.status(201).json({ path: filePath, size: content.length });
});

// DELETE /api/projects/:id/files/* — delete file
storageRouter.delete('/:id/files/*', (req: AuthenticatedRequest, res: Response) => {
  if (!checkAccess(req, res, true)) return;

  const filePath = (req.params as Record<string, string>)[0];
  if (!filePath) {
    res.status(400).json({ error: 'File path is required' });
    return;
  }

  const projectDir = getProjectDir(req.params.id);
  const fullPath = resolveSafePath(projectDir, filePath);
  if (!fullPath) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  if (fs.statSync(fullPath).isDirectory()) {
    fs.rmSync(fullPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(fullPath);
  }

  res.json({ ok: true });
});
