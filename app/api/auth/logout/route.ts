import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSqlite } from '@/db/sqlite.mjs';
import { COOKIE_NAME, decodeSession } from '@/lib/auth-core.mjs';
import { isSameOrigin } from '@/lib/server-env';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const id = decodeSession((await cookies()).get(COOKIE_NAME)?.value, process.env.SESSION_SECRET);
  if (id) getSqlite().prepare('DELETE FROM sessions WHERE id=?').run(id);
  const response = NextResponse.redirect(new URL('/login', process.env.APP_URL!), 303);
  response.cookies.set(COOKIE_NAME, '', { httpOnly: true, secure: process.env.APP_URL!.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 0 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
