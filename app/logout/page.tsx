import Link from 'next/link';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Logout() {
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="glass w-full max-w-md p-8"><span className="brand-icon mb-6"><LogOut size={22}/></span><h1 className="text-2xl mb-3">ออกจากระบบ Relaydesk</h1><p className="hint mb-6">คุณสามารถเข้าสู่ระบบอีกครั้งเพื่อกลับมาจัดการอีเมลและหมวดหมู่ได้</p><form method="post" action="/api/auth/logout"><Button className="w-full min-h-12" type="submit">ยืนยันออกจากระบบ</Button></form><Button variant="outline" className="w-full mt-3" asChild><Link href="/">กลับไปหน้าหลัก</Link></Button><p className="login-security"><ShieldCheck size={15}/>ข้อมูลและกฎ Routing ของคุณยังคงอยู่</p></section></main>;
}
