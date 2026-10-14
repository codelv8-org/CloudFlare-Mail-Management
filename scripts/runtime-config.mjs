import { existsSync } from 'node:fs';
export function loadEnvironment() {
  if (existsSync('.env')) process.loadEnvFile('.env');
}
export function validateEnvironment(env = process.env) {
  let url;
  try { url = new URL(env.APP_URL); } catch { throw new Error('APP_URL must be an absolute URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL must contain only an http(s) origin');
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production APP_URL requires HTTPS');
  if (!env.ADMIN_EMAIL || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.ADMIN_EMAIL)) throw new Error('Set ADMIN_EMAIL');
  if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(env.ADMIN_PASSWORD_HASH || '')) throw new Error('Set ADMIN_PASSWORD_HASH using npm run auth:hash');
  for (const name of ['SESSION_SECRET', 'TOKEN_ENCRYPTION_KEY']) {
    const value = env[name] || '';
    if (Buffer.from(value, 'base64').length !== 32 || Buffer.from(value, 'base64').toString('base64') !== value) throw new Error(`${name} must be a base64-encoded 32-byte random key`);
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  if (env.HOSTNAME && env.HOSTNAME !== '127.0.0.1' && env.HOSTNAME !== '::1') throw new Error('Bind HOSTNAME to loopback behind Nginx');
  return { origin: url.origin, port, hostname: env.HOSTNAME || '127.0.0.1' };
}
