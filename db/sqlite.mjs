import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
let database;
export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS relaydesk_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
  const directory = resolve('drizzle');
  for (const name of readdirSync(directory).filter(x => /^\d+_.*\.sql$/.test(x)).sort()) {
    const sql = readFileSync(join(directory, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = db.prepare('SELECT checksum FROM relaydesk_migrations WHERE name=?').get(name);
    if (previous) {
      if (previous.checksum !== checksum) throw new Error(`Migration changed after application: ${name}`);
      continue;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO relaydesk_migrations(name,checksum) VALUES(?,?)').run(name, checksum);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}
export function getSqlite() {
  if (database) return database;
  const path = resolve(process.env.DATABASE_PATH || './data/relaydesk.sqlite');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    chmodSync(path, 0o600);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    migrate(db);
    database = db;
    return db;
  } catch (error) { db.close(); throw error; }
}
