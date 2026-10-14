import { loadEnvironment, validateEnvironment } from './runtime-config.mjs';
loadEnvironment();
const config = validateEnvironment();
const { getSqlite } = await import('../db/sqlite.mjs');
getSqlite();
// Keep Next.js in this process so PM2 owns its signals and PID.
process.argv = [process.execPath, new URL('../node_modules/next/dist/bin/next', import.meta.url).pathname, 'start', '--hostname', config.hostname, '--port', String(config.port)];
await import('next/dist/bin/next');
