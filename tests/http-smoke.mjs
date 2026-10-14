import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { hashPassword } from '../lib/auth-core.mjs';
const directory = mkdtempSync(join(tmpdir(), 'relaydesk-test-'));
const port = 3317, base = `http://127.0.0.1:${port}`, origin = 'https://relaydesk-test.example.com';
const password = 'test-only-password-1234';
const env = { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), APP_URL: origin, ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD_HASH: await hashPassword(password), SESSION_SECRET: randomBytes(32).toString('base64'), TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DATABASE_PATH: join(directory, 'database.sqlite') };
let child, logs = '';
async function start() {
  child = spawn(process.execPath, ['scripts/start-production.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try { const res = await fetch(base + '/api/health'); if (res.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server timeout: ${logs}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
}
try {
  await start();
  assert.equal((await fetch(base + '/', { redirect: 'manual' })).status, 307);
  assert.equal((await fetch(base + '/api/state', { headers: { 'oai-authenticated-user-id': 'fake', 'oai-authenticated-user-email': 'fake@example.com' } })).status, 401);
  const payload = new URLSearchParams({ email: env.ADMIN_EMAIL, password });
  assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', body: payload, headers: { Origin: 'https://attacker.example.com' }, redirect: 'manual' })).status, 403);
  const login = await fetch(base + '/api/auth/login', { method: 'POST', body: payload, headers: { Origin: origin }, redirect: 'manual' });
  assert.equal(login.status, 303);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /Secure/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const state = await fetch(base + '/api/state', { headers: { Cookie: cookie } });
  assert.equal(state.status, 200);
  const data = await state.json();
  assert.equal(data.secureStorage, true);
  const catalog = { ...data.catalog, groups: [...data.catalog.groups, { id: 'smoke', name: 'Smoke test', color: '#123456', logo: '', rank: 999 }] };
  const writeHeaders = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'x-relaydesk-request': '1' };
  assert.equal((await fetch(base + '/api/catalog', { method: 'POST', headers: { ...writeHeaders, Origin: 'https://attacker.example.com' }, body: JSON.stringify({ catalog, revision: data.revision }) })).status, 403);
  const update = await fetch(base + '/api/catalog', { method: 'POST', headers: writeHeaders, body: JSON.stringify({ catalog, revision: data.revision }) });
  assert.equal(update.status, 200, await update.text());
  await stop(); await start();
  const persisted = await (await fetch(base + '/api/state', { headers: { Cookie: cookie } })).json();
  assert.equal(persisted.catalog.groups.some(x => x.id === 'smoke'), true);
  assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin }, redirect: 'manual' })).status, 303);
  assert.equal((await fetch(base + '/api/state', { headers: { Cookie: cookie } })).status, 401);
  // ตรวจว่าการจำกัดความถี่ยังทำงาน และพาผู้ใช้กลับไปอ่านข้อความในฟอร์ม
  for (let i = 0; i < 9; i++) {
    const denied = await fetch(base + '/api/auth/login', { method: 'POST', body: new URLSearchParams({ email: env.ADMIN_EMAIL, password: 'incorrect' }), headers: { Origin: origin }, redirect: 'manual' });
    assert.equal(denied.status, 303);
    assert.equal(new URL(denied.headers.get('location')).searchParams.get('error'), '1');
  }
  const throttled = await fetch(base + '/api/auth/login', { method: 'POST', body: payload, headers: { Origin: origin }, redirect: 'manual' });
  assert.equal(throttled.status, 303);
  assert.equal(new URL(throttled.headers.get('location')).searchParams.get('error'), 'rate_limit');
  assert.equal(throttled.headers.get('retry-after'), '900');
  assert.equal(throttled.headers.get('set-cookie'), null);
  console.log('HTTP smoke passed: login, spoofed headers, CSRF, catalog write, restart persistence, logout revocation.');
} finally { await stop(); rmSync(directory, { recursive: true, force: true }); }
