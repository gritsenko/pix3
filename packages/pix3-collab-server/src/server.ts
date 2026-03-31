import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { mountAssetsHandler } from './assets-handler.js';
import { mountUploadHandler } from './upload-handler.js';

export function startServer(): void {
  // Ensure data directory exists for SQLite
  const sqliteDir = path.dirname(path.resolve(config.SQLITE_PATH));
  fs.mkdirSync(sqliteDir, { recursive: true });

  // Ensure projects directory exists
  fs.mkdirSync(path.resolve(config.PROJECTS_DIR), { recursive: true });

  // --- Hocuspocus WebSocket Server ---
  const hocuspocus = Server.configure({
    port: config.WS_PORT,
    extensions: [
      new SQLite({
        database: config.SQLITE_PATH,
      }),
    ],

    async onConnect({ documentName }) {
      console.log(`[collab] client connected to room: ${documentName}`);
    },

    async onDisconnect({ documentName }) {
      console.log(`[collab] client disconnected from room: ${documentName}`);
    },

    async onStoreDocument({ documentName }) {
      console.log(`[collab] persisted snapshot for: ${documentName}`);
    },
  });

  hocuspocus.listen();
  console.log(`[pix3-collab] WebSocket server listening on port ${config.WS_PORT}`);

  // --- Express HTTP Server ---
  const app = express();
  app.use(cors());

  mountAssetsHandler(app);
  mountUploadHandler(app);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', wsPort: config.WS_PORT });
  });

  app.listen(config.HTTP_PORT, () => {
    console.log(`[pix3-collab] HTTP server listening on port ${config.HTTP_PORT}`);
  });
}
