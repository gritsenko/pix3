import 'dotenv/config';
import { config } from './config.js';

console.log(`[pix3-collab] Starting server...`);
console.log(`[pix3-collab] Unified port: ${config.PORT}`);
console.log(`[pix3-collab] Collaboration path: ${config.COLLABORATION_PATH}`);

try {
  // Dynamic import to ensure dotenv is loaded first
  const { startServer } = await import('./server.js');
  await startServer();
} catch (error) {
  console.error('[pix3-collab] Fatal startup error', error);
  process.exit(1);
}
