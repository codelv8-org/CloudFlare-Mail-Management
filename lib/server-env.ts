import { database } from '@/db/d1';
export const env = {
  DB: database,
  get TOKEN_ENCRYPTION_KEY() { return process.env.TOKEN_ENCRYPTION_KEY; },
};
export function isSameOrigin(req: Request) {
  const origin = process.env.APP_URL;
  if (!origin) return false;
  try { return req.headers.get('origin') === new URL(origin).origin; } catch { return false; }
}
