# Runtime เดิมสำหรับ rollback

ก่อนการย้าย PHP source ใช้ Next.js + Node.js + SQLite; verified Git baseline คือ `ebe53e86e1c8e643c2da5219566560b0cb8dd957`

Source, package lock, SQL migrations, PM2 startup และ CI เดิมอยู่ใน Git commit นี้ ไม่ใช่ runtime ของ PHP release ปัจจุบัน

ดู source หรือกู้คืน checkout แยกจาก commit ดังกล่าวเมื่อต้อง rollback ห้าม reset working tree ที่มีงานของผู้ใช้ หรือเขียนทับ `.env`, SQLite, uploads และ backups

คู่มือ [aaPanel/PM2 เดิม](deployment/aapanel-pm2.md) และ [Sites starter เดิม](sites-starter-reference.md) เป็น historical references เท่านั้น ห้ามใช้ติดตั้ง PHP release ปัจจุบัน

ฐานข้อมูลใหม่ไม่ import catalog/annotation/audit เก่า เจ้าของข้อมูลต้อง login และเชื่อม Cloudflare ใหม่ กฎภายนอกยังอยู่ใน Cloudflare
