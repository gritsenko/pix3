import express from 'express';
import path from 'path';
import { config } from './config.js';

export function mountAssetsHandler(app: express.Express): void {
  app.use(
    '/assets',
    express.static(path.resolve(config.PROJECTS_DIR), {
      maxAge: '1h',
      immutable: false,
    })
  );
}
