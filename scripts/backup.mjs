import { backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSqlite } from '../db/sqlite.mjs';
mkdirSync('backups', { recursive: true, mode: 0o700 });
const target = resolve('backups', `relaydesk-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
await backup(getSqlite(), target);
chmodSync(target, 0o600);
console.log(`Backup saved: ${target}`);
