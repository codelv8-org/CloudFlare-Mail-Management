'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginForm({ error }: { error?: string }) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return <form method="post" action="/api/auth/login" className="space-y-5" onSubmit={e => { if (pending) e.preventDefault(); else setPending(true); }}>
    <label className="field">อีเมลผู้ดูแล<Input type="email" name="email" autoComplete="username" required maxLength={254} placeholder="admin@example.com" readOnly={pending}/></label>
    <label className="field">รหัสผ่าน<span className="relative"><Input className="pr-12" type={visible ? 'text' : 'password'} name="password" autoComplete="current-password" required maxLength={256} placeholder="กรอกรหัสผ่านของคุณ" readOnly={pending}/><button className="absolute inset-y-0 right-0 w-11 flex items-center justify-center" type="button" aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
    {error && <p role="alert" className="error-box">{error === 'rate_limit' ? 'พยายามเข้าสู่ระบบถี่เกินไป กรุณารอ 15 นาทีแล้วลองใหม่' : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่'}</p>}
    <Button type="submit" className="w-full min-h-12" disabled={pending}>{pending ? <><LoaderCircle size={18} className="animate-spin"/>กำลังเข้าสู่ระบบ…</> : <>เข้าสู่ระบบ<ArrowRight size={18}/></>}</Button>
  </form>;
}
