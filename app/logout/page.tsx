export default function Logout() {
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="glass rounded-2xl p-8"><h1 className="text-xl mb-4">ออกจากระบบ Relaydesk</h1><form method="post" action="/api/auth/logout"><button className="rounded-xl bg-violet-500 px-5 py-3" type="submit">ยืนยันออกจากระบบ</button></form><a href="/" className="block mt-4">กลับไปหน้าหลัก</a></section></main>;
}
