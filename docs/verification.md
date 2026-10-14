# PHP/MySQL migration verification

ตรวจวันที่ 2026-10-14 บน Windows, PHP 8.3.12, MySQL 8.0.30 และ Playwright 1.62.1 / Chromium

## ผลที่รันจริง

```powershell
$env:TEST_DB_PORT = '33316'
$env:PLAYWRIGHT_PACKAGE_PATH = 'C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
php scripts/verify.php --ui
node --check public/assets/app.js
node --check public/assets/login.js
node --check tests/php-ui.mjs
git diff --check
```

- PHP syntax: ผ่าน 20 files
- PHP/MySQL suite: ผ่าน 89 checks
- Browser suite: ผ่าน 52 checks; ไม่มี JavaScript page errors
- JavaScript syntax และ Git whitespace checks: ผ่าน
- Artifacts ของรอบสุดท้าย: `outputs/php-tests-20261014-213010/` (local-only, ignored by Git)

## ขอบเขตหลักฐาน

HTTP tests รัน PHP server จริง เชื่อม MySQL instance ชั่วคราวบน `127.0.0.1:33316` ไม่ใช้ฐานข้อมูล/config production ตรวจ migration dry-run/checksum/idempotency, Argon2id, AES owner binding, signed/expired/revoked sessions, CSRF, identity spoofing, body limits, private paths, rate limits และ persistence หลัง restart

Concurrent tests รัน PHP หลาย process: counters ไม่มี lost updates และ catalog writers ที่ใช้ revision เดียวกันสำเร็จหนึ่งราย อีกหนึ่งรายได้ 409 ทดสอบ referenced catalog deletion และ transaction rollback ด้วย

Cloudflare client/controller ใช้ injected fixtures ตรวจ User/Account verification, permissions errors, pagination, invalid JSON, redirect restrictions, forward/drop/worker validation, zone ownership, stale fingerprint, Wrangler guard, Catch-all/settings, annotations และ uncertain-write audit ไม่มี live Cloudflare writes

Browser tests ใช้ PHP/MySQL จริงสำหรับ login, catalog CRUD, audit และ logout; remote Cloudflare UI ใช้ fixtures ตรวจ search preservation, confirmation text, draft preservation, picker keyboard, modal Escape/focus restoration, skip link, bulk annotations, destination/rule/settings forms และ JSON export

Responsive checks: 320, 390, 768, 1440px ไม่มี document overflow ในหน้าที่ตรวจ; modal อยู่ใน viewport และ reduced-motion มีผล ตรวจ screenshots ของ overview, routing และ modal จริงแล้ว

## ข้อจำกัด

ยังไม่ได้รัน GitHub Actions บน runner, aaPanel/PHP-FPM, Apache หรือ production; Nginx configuration เป็นตัวอย่างสำหรับปรับและทดสอบบนเป้าหมายจริง ไม่ได้ยืนยัน live Cloudflare Token permissions หรือการรับส่งอีเมลจริง

ไม่ได้ทำ automated axe audit, screen-reader certification หรือ pixel-by-pixel comparison กับ React version จึงไม่อ้าง WCAG certification หรือ visual parity score

Project Registry ใน `D:\Projects\secound-brain` ยังไม่มีโครงการนี้ จึงไม่ได้สร้าง/แก้ curated notes หรือ Agent Work Log ใน knowledge base โครงสร้างและพฤติกรรมใหม่ตรวจจาก source ปัจจุบันและ tests โดยตรง

Source/runtime เดิมเก็บใน Git baseline `ebe53e86e1c8e643c2da5219566560b0cb8dd957`; SQLite/config เดิมไม่ถูกย้ายหรือเขียนทับ

MySQL instance ทดสอบถูก shutdown หลังตรวจ identity แล้ว; คำสั่ง cleanup ที่รวมการลบ datadir ถูก automatic approval review บล็อกด้วย `blocked by policy` จึงเก็บ directory ชั่วคราวไว้ใน `%TEMP%` (พาธอยู่ใน `outputs/mysql-path.txt`) ไม่ลบหรือหยุด MySQL instance อื่น
