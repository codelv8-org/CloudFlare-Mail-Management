import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const connections = sqliteTable('connections', { owner:text('owner').primaryKey(), account:text('account').notNull(), ciphertext:text('ciphertext').notNull(), updated:text('updated').notNull() });
export const catalogs = sqliteTable('catalogs', { owner:text('owner').primaryKey(), data:text('data').notNull(), revision:integer('revision').notNull().default(0) });
export const annotations = sqliteTable('annotations', { owner:text('owner').notNull(), zone:text('zone').notNull(), rule:text('rule').notNull(), data:text('data').notNull() }, t=>[primaryKey({columns:[t.owner,t.zone,t.rule]})]);
export const audit = sqliteTable('audit', { id:text('id').primaryKey(), owner:text('owner').notNull(), action:text('action').notNull(), target:text('target').notNull(), before:text('before'), outcome:text('outcome').notNull(), created:text('created').notNull() },t=>[index('idx_audit_owner_created').on(t.owner,t.created)]);
export const limits = sqliteTable('limits', { owner:text('owner').primaryKey(), window:integer('window').notNull(), count:integer('count').notNull() });
