import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSqlite } from '@/db/sqlite.mjs';
import { COOKIE_NAME, decodeSession, ownerId } from '@/lib/auth-core.mjs';
export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null };
// Compatibility name for the dashboard; identity comes only from local sessions.
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  const id = decodeSession(cookie, process.env.SESSION_SECRET);
  const email = process.env.ADMIN_EMAIL;
  if (!id || !email) return null;
  const owner = ownerId(email);
  const session = getSqlite().prepare('SELECT id FROM sessions WHERE id=? AND owner=? AND expires>?').get(id, owner, Date.now());
  return session ? { userId: owner, displayName: email, email, fullName: null } : null;
}
export async function requireChatGPTUser(returnTo = '/') {
  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath(returnTo));
  return user;
}
export function chatGPTSignInPath(_returnTo = '/') { return '/login'; }
export function chatGPTSignOutPath(_returnTo = '/') { return '/logout'; }
