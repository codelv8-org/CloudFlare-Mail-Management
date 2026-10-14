import type { SQLInputValue } from 'node:sqlite';
import { getSqlite } from './sqlite.mjs';
class Statement {
  constructor(readonly sql: string, readonly values: SQLInputValue[] = []) {}
  bind(...values: SQLInputValue[]) { return new Statement(this.sql, values); }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (getSqlite().prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>() {
    return { results: getSqlite().prepare(this.sql).all(...this.values) as T[] };
  }
  async run() {
    const result = getSqlite().prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}
export const database = {
  prepare(sql: string) { return new Statement(sql); },
  async batch(statements: Statement[]) {
    const db = getSqlite();
    db.exec('BEGIN IMMEDIATE');
    try {
      // Execute synchronously inside the transaction before yielding.
      const result = statements.map(statement => {
        const changed = db.prepare(statement.sql).run(...statement.values);
        return { success: true, meta: { changes: Number(changed.changes) } };
      });
      db.exec('COMMIT');
      return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
