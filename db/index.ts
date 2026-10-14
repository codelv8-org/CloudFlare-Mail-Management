import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { getSqlite } from './sqlite.mjs';
import * as schema from './schema';
export function getDb() {
  return drizzle(async (sql, params, method) => {
    const statement = getSqlite().prepare(sql);
    if (method === 'run') { statement.run(...params); return { rows: [] }; }
    statement.setReturnArrays(true);
    if (method === 'get') return { rows: statement.get(...params) ?? [] };
    return { rows: statement.all(...params) };
  }, { schema });
}
