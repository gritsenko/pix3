import 'dotenv/config';
import { config } from './config.js';

console.log(`[pix3-collab] Starting server...`);
console.log(`[pix3-collab] WebSocket port: ${config.WS_PORT}`);
console.log(`[pix3-collab] HTTP port: ${config.HTTP_PORT}`);

// Dynamic import to ensure dotenv is loaded first
const { startServer } = await import('./server.js');
startServer();
