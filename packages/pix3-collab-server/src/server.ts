import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { initDb } from './core/db.js';
import { authRouter } from './core/auth/auth-router.js';
import { projectsRouter } from './core/projects/projects-router.js';
import { storageRouter } from './core/storage/storage-router.js';
import { adminRouter } from './core/admin/admin-router.js';
import { createHocuspocusServer } from './sync/hocuspocus.js';

export function startServer(): void {
  // Initialize database
  initDb();
  console.log('[pix3-collab] Database initialized');

  // Ensure projects storage directory exists
  fs.mkdirSync(path.resolve(config.PROJECTS_STORAGE_DIR), { recursive: true });

  // --- Hocuspocus WebSocket Server ---
  const hocuspocus = createHocuspocusServer();
  hocuspocus.listen();
  console.log(`[pix3-collab] WebSocket server listening on port ${config.WS_PORT}`);

  // --- Express HTTP Server ---
  const app = express();
  app.use(cookieParser());
  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json());

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects', storageRouter);
  app.use('/api/admin', adminRouter);

  // Admin UI
  const adminPath = path.resolve('src/admin/index.html');
  app.get('/admin', (_req, res) => {
    if (fs.existsSync(adminPath)) {
      res.sendFile(adminPath);
    } else {
      // Fallback for production/dist
      const distAdminPath = path.resolve('dist/admin/index.html');
      if (fs.existsSync(distAdminPath)) {
        res.sendFile(distAdminPath);
      } else {
        res.status(404).send('Admin panel not found');
      }
    }
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', wsPort: config.WS_PORT });
  });

  app.listen(config.HTTP_PORT, () => {
    console.log(`[pix3-collab] HTTP server listening on port ${config.HTTP_PORT}`);
  });
}
