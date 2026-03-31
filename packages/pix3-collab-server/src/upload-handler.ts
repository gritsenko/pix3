import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const ALLOWED_MIME_TYPES = new Set([
  'model/gltf-binary',
  'model/gltf+json',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/mp3',
  'application/octet-stream', // fallback for .glb in some browsers
]);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = req.params.projectId;
    if (!PROJECT_ID_PATTERN.test(projectId)) {
      return cb(new Error('Invalid project ID'), '');
    }
    const dir = path.join(config.PROJECTS_DIR, projectId, 'assets');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Disallowed MIME type: ${file.mimetype}`));
    }
  },
});

export function mountUploadHandler(app: express.Express): void {
  app.post(
    '/api/projects/:projectId/assets',
    upload.array('files', 20),
    (req: express.Request, res: express.Response) => {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }
      const uploaded = files.map(f => ({
        originalName: f.originalname,
        storedName: f.filename,
        size: f.size,
        url: `/assets/${req.params.projectId}/assets/${f.filename}`,
      }));
      res.status(201).json({ files: uploaded });
    }
  );

  // Error handler for multer
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof multer.MulterError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (
        err.message?.startsWith('Disallowed MIME type') ||
        err.message === 'Invalid project ID'
      ) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  );
}
