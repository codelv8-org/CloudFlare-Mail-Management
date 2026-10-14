import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../db/sqlite.mjs';
import { hashPassword, verifyPassword, encodeSession, decodeSession, ownerId } from '../lib/auth-core.mjs';
import { validateEnvironment } from '../scripts/runtime-config.mjs';

test('password hashing and session signatures reject invalid credentials', async () => {
  const hash = await hashPassword('test-only-long-password');
  assert.equal(await verifyPassword('test-only-long-password', hash), true);
  assert.equal(await verifyPassword('incorrect-password', hash), false);
  assert.equal(await verifyPassword('test-only-long-password', 'invalid'), false);
  const id = 'a'.repeat(64), secret = 'test-only-secret';
  const signed = encodeSession(id, secret);
  assert.equal(decodeSession(signed, secret), id);
  assert.equal(decodeSession(signed, 'different-secret'), null);
  assert.equal(decodeSession(signed + '.suffix', secret), null);
  assert.equal(ownerId(' Admin@Example.com '), ownerId('admin@example.com'));
});

test('migrations are repeatable and preserve existing data', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  db.prepare('INSERT INTO connections VALUES(?,?,?,?)').run('owner', 'account', 'encrypted', 'now');
  migrate(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM connections').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM relaydesk_migrations').get().n, 2);
  db.prepare('UPDATE relaydesk_migrations SET checksum=? WHERE name=?').run('changed', '0000_lyrical_lifeguard.sql');
  assert.throws(() => migrate(db), /Migration changed/);
  db.close();
});

test('production configuration rejects insecure or incomplete settings', () => {
  const key = Buffer.alloc(32, 1).toString('base64');
  const env = { NODE_ENV: 'production', APP_URL: 'https://mail.example.com', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD_HASH: 'scrypt$'+'a'.repeat(32)+'$'+'b'.repeat(128), SESSION_SECRET: key, TOKEN_ENCRYPTION_KEY: key };
  assert.equal(validateEnvironment(env).hostname, '127.0.0.1');
  assert.throws(() => validateEnvironment({ ...env, APP_URL: 'http://mail.example.com' }), /HTTPS/);
  assert.throws(() => validateEnvironment({ ...env, TOKEN_ENCRYPTION_KEY: 'invalid' }), /32-byte/);
  assert.throws(() => validateEnvironment({ ...env, HOSTNAME: '0.0.0.0' }), /loopback/);
});

test('Cloudflare tokens encrypt and remain bound to the owner', async () => {
  const { encrypt, decrypt } = await import('../lib/crypto.ts');
  const key = Buffer.alloc(32, 2).toString('base64');
  const ciphertext = await encrypt('test-only-cloudflare-token', key, 'owner-a');
  assert.notEqual(ciphertext, 'test-only-cloudflare-token');
  assert.equal(await decrypt(ciphertext, key, 'owner-a'), 'test-only-cloudflare-token');
  await assert.rejects(() => decrypt(ciphertext, key, 'owner-b'));
});
