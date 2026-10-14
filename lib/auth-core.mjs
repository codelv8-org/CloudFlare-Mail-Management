import { scrypt, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const COOKIE_NAME = 'relaydesk_session';
export const SESSION_SECONDS = 8 * 60 * 60;
export async function hashPassword(password) {
  if (password.length < 12 || password.length > 256) throw new Error('Use a password of 12–256 characters');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256 || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored || '')) return false;
  const [, salt, expected] = stored.split('$');
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export function ownerId(email) { return 'admin_' + createHash('sha256').update(email.trim().toLowerCase()).digest('hex'); }
function sign(value, secret) { return createHmac('sha256', secret).update(value).digest('base64url'); }
export function encodeSession(id, secret) { return `${id}.${sign(id, secret)}`; }
export function decodeSession(cookie, secret) {
  if (!secret || typeof cookie !== 'string' || cookie.length > 150) return null;
  const [id, signature, extra] = cookie.split('.');
  if (extra !== undefined || !/^[a-f0-9]{64}$/.test(id || '') || !/^[A-Za-z0-9_-]{43}$/.test(signature || '')) return null;
  const expected = sign(id, secret);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
}
