import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSqlite } from '@/db/sqlite.mjs';
import { COOKIE_NAME, SESSION_SECONDS, verifyPassword, ownerId, encodeSession, decodeSession } from '@/lib/auth-core.mjs';
import { isSameOrigin } from '@/lib/server-env';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const origin = new URL(process.env.APP_URL!).origin;
  if (Number(req.headers.get('content-length') || 0) > 4096) return new Response('Payload too large', { status: 413 });
  const text = await req.text();
  if (text.length > 4096) return new Response('Payload too large', { status: 413 });
  const form = new URLSearchParams(text);
  const email = form.get('email')?.trim().toLowerCase();
  const password = form.get('password') || '';
  const db = getSqlite();
  // Global account throttle deliberately does not trust visitor-supplied proxy headers.
  const window = Math.floor(Date.now() / 900000);
  const count = db.prepare('INSERT INTO auth_attempts(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count').get('admin', window) as { count: number };
  if (count.count > 10) return new Response('พยายามเข้าสู่ระบบถี่เกินไป กรุณารอ 15 นาที', { status: 429, headers: { 'Retry-After': '900' } });
  const valid = await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);
  if (!valid || email !== process.env.ADMIN_EMAIL?.trim().toLowerCase()) return NextResponse.redirect(new URL('/login?error=1', origin), 303);
  if (!process.env.SESSION_SECRET) return new Response('Authentication unavailable', { status: 503 });
  const id = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
  const previous = decodeSession((req.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE_NAME + '='))?.slice(COOKIE_NAME.length + 1), process.env.SESSION_SECRET);
  if (previous) db.prepare('DELETE FROM sessions WHERE id=?').run(previous);
  db.prepare('INSERT INTO sessions(id,owner,expires) VALUES(?,?,?)').run(id, ownerId(process.env.ADMIN_EMAIL!), Date.now() + SESSION_SECONDS * 1000);
  const response = NextResponse.redirect(new URL('/', origin), 303);
  response.cookies.set(COOKIE_NAME, encodeSession(id, process.env.SESSION_SECRET), { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
