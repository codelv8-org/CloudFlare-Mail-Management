import { redirect } from 'next/navigation';
import { getChatGPTUser } from '../chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getChatGPTUser()) redirect('/');
  const { error } = await searchParams;
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="glass w-full max-w-md rounded-2xl p-8"><h1 className="text-2xl font-bold">Relaydesk</h1><p className="hint mt-2 mb-6">เข้าสู่ระบบเพื่อจัดการ Cloudflare Email Routing</p><form method="post" action="/api/auth/login" className="space-y-4"><label className="field">อีเมลผู้ดูแล<input className="note-input" type="email" name="email" autoComplete="username" required maxLength={254}/></label><label className="field">รหัสผ่าน<input className="note-input" type="password" name="password" autoComplete="current-password" required maxLength={256}/></label>{error && <p role="alert" className="error-box">อีเมลหรือรหัสผ่านไม่ถูกต้อง</p>}<button type="submit" className="rounded-xl bg-violet-500 px-5 py-3 font-semibold w-full">เข้าสู่ระบบ</button></form></section></main>;
}
