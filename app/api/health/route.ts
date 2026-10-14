import { getSqlite } from '@/db/sqlite.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  try { getSqlite().prepare('SELECT 1').get(); return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
