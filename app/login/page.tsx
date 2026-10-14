import { redirect } from 'next/navigation';
import { Cloud, Mail, Network, ShieldCheck, Tags } from 'lucide-react';
import { getChatGPTUser } from '../chatgpt-auth';
import { LoginForm } from './login-form';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getChatGPTUser()) redirect('/');
  const { error } = await searchParams;
  return <main className="login-page">
    <section className="login-story">
      <div className="brand"><span className="brand-icon"><Network/></span><span>relaydesk<small>EMAIL WORKSPACE</small></span></div>
      <span className="eyebrow">CLOUDFLARE EMAIL ROUTING</span>
      <h1>อีเมลเป็นระเบียบ<br/>ทุกเส้นทางชัดเจน</h1>
      <p>จัดการกฎส่งต่ออีเมล ปลายทาง และหมวดหมู่<br/>ในพื้นที่ทำงานเดียวที่คุณควบคุมได้</p>
      <ul className="login-features"><li><Cloud size={19}/>เชื่อมต่อและจัดการโดเมน Cloudflare</li><li><Tags size={19}/>จัดหมวดหมู่ด้วย Platform กลุ่มผู้ใช้ และ Priority</li><li><ShieldCheck size={19}/>Token เข้ารหัส พร้อมประวัติการเปลี่ยนแปลง</li></ul>
    </section>
    <section className="glass login-card" aria-labelledby="login-title">
      <span className="brand-icon mb-6"><Mail size={22}/></span>
      <h2 id="login-title">เข้าสู่พื้นที่ทำงาน</h2>
      <p className="hint mt-2 mb-7">ใช้บัญชีผู้ดูแลเพื่อจัดการ Email Routing</p>
      <LoginForm error={error}/>
      <p className="login-security"><ShieldCheck size={15}/>พื้นที่ส่วนตัวสำหรับผู้ดูแลระบบ</p>
    </section>
  </main>;
}
