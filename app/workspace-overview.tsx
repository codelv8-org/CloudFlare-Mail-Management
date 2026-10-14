'use client';

import { ArrowRight, Check, Cloud, Globe2, Mail, ShieldCheck, Tags, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  connected: boolean;
  domain?: string;
  rules: number | null;
  active: number | null;
  destinations: number;
  pending: number;
  platforms: number;
  groups: number;
  routingEnabled?: boolean;
  recent: { id: string; action: string; target: string; outcome: string; created: string }[];
  navigate: (page: 'routing' | 'destinations' | 'platforms' | 'groups' | 'activity' | 'settings') => void;
};

export function WorkspaceOverview(p: Props) {
  const steps = [
    { title: 'เชื่อมต่อ Cloudflare', detail: 'ตรวจสอบ Account และ API Token', done: p.connected, page: 'settings' },
    { title: 'ยืนยันอีเมลปลายทาง', detail: 'เลือกกล่องจดหมายที่จะรับอีเมล', done: p.connected && p.destinations > 0, page: 'destinations' },
    { title: 'สร้างเส้นทางอีเมล', detail: 'กำหนดต้นทางและวิธีส่งต่อ', done: p.connected && (p.rules ?? 0) > 0, page: 'routing' },
  ] as const;
  return <>
    <section className="overview-hero glass">
      <div><span className="eyebrow">EMAIL OPERATIONS</span><h2>{p.connected ? 'ทุกเส้นทางอีเมล อยู่ในมือคุณ' : 'พื้นที่ทำงานสำหรับทุกเส้นทางอีเมล'}</h2><p>{p.connected ? `จัดการ ${p.domain || 'โดเมนของคุณ'} ตรวจสถานะ และจัดหมวดหมู่จากข้อมูลจริง` : 'เชื่อมต่อบัญชี ยืนยันปลายทาง แล้วเริ่มส่งต่ออีเมลอย่างเป็นระบบ'}</p><Button onClick={() => p.navigate(p.connected ? 'routing' : 'settings')}>{p.connected ? 'จัดการ Routing rules' : 'เชื่อมต่อ Cloudflare'}<ArrowRight size={17}/></Button></div>
      <div className="route-illustration" aria-hidden="true"><span><Globe2/>โดเมนของคุณ</span><i/><span className="route-hub"><Cloud/>Relaydesk</span><i/><span><Mail/>กล่องจดหมาย</span></div>
    </section>
    <div className="metrics overview-metrics">{[
      { label: 'กฎ Routing', count: p.rules, icon: Mail, page: 'routing', hint: 'ตรวจและจัดการเส้นทางอีเมล' },
      { label: 'กฎที่เปิดใช้งาน', count: p.active, icon: ShieldCheck, page: 'routing', hint: 'สถานะกฎในโดเมนที่เลือก' },
      { label: 'ปลายทางที่ยืนยัน', count: p.connected ? p.destinations : null, icon: Users, page: 'destinations', hint: p.pending ? `${p.pending} รายการกำลังรอยืนยัน` : 'พร้อมใช้สำหรับรับอีเมล' },
      { label: 'Platform tags', count: p.platforms, icon: Tags, page: 'platforms', hint: `${p.groups} กลุ่มผู้ใช้ใน Workspace` },
    ].map(({ label, count, icon: Icon, page, hint }) => <button key={label} className="glass metric metric-link" onClick={() => p.navigate(page as Parameters<Props['navigate']>[0])}><div className="metric-label">{label}<Icon size={19}/></div><strong>{count ?? '—'}</strong><small>{hint}</small><ArrowRight className="metric-arrow" size={16}/></button>)}</div>
    <div className="overview-grid">
      <section className="glass"><div className="panel-head"><div><h2>เริ่มต้นใช้งาน</h2><p className="hint">สามขั้นตอนเพื่อให้พร้อมรับอีเมล</p></div><span className="badge">{steps.filter(s => s.done).length} / 3</span></div><ol className="setup-list">{steps.map((s, i) => <li key={s.title}><span className={`step-number ${s.done ? 'step-done' : ''}`}>{s.done ? <Check size={17}/> : i + 1}</span><div><strong>{s.title}</strong><p>{s.detail}</p></div><Button variant="ghost" size="icon" aria-label={s.title} onClick={() => p.navigate(s.page)}><ArrowRight size={18}/></Button></li>)}</ol>{p.connected && p.routingEnabled === false && <div className="overview-warning">Email Routing ของโดเมนนี้ปิดอยู่ <button onClick={() => p.navigate('settings')}>ตรวจการตั้งค่า →</button></div>}</section>
      <section className="glass"><div className="panel-head"><div><h2>กิจกรรมล่าสุด</h2><p className="hint">การเปลี่ยนแปลงภายในบัญชีของคุณ</p></div><Button variant="ghost" size="sm" onClick={() => p.navigate('activity')}>ดูทั้งหมด<ArrowRight size={15}/></Button></div>{p.recent.length ? <ul className="recent-list">{p.recent.slice(0, 4).map(row => <li key={row.id}><span className={`activity-dot ${row.outcome === 'succeeded' ? 'done' : ''}`}/><div><strong>{row.action}</strong><p>{row.target}</p><small>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.created))}</small></div><span className="hint">{row.outcome === 'succeeded' ? 'สำเร็จ' : row.outcome === 'pending' ? 'รอดำเนินการ' : row.outcome === 'failed' ? 'ไม่สำเร็จ' : row.outcome}</span></li>)}</ul> : <div className="empty-table"><ShieldCheck size={26}/><strong>พร้อมบันทึกทุกการเปลี่ยนแปลง</strong><span>ประวัติจะแสดงเมื่อคุณเริ่มทำรายการ</span></div>}</section>
    </div>
  </>;
}
