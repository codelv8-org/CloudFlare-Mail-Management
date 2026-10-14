# Relaydesk — Cloudflare Email Routing

จัดการ Cloudflare Email Routing, destinations, Platform tags, กลุ่มผู้ใช้, Priority และประวัติการทำงาน

**HTML + PHP 8.3 + MySQL 8.0** — PHP ธรรมดา, PDO prepared statements และ Vanilla JavaScript ไม่มี Node.js/PM2/Composer ใน production runtime

## ติดตั้ง

ดู [คู่มือ aaPanel / PHP-FPM / MySQL](docs/deployment/aapanel-php-mysql.md) สำหรับ HTTPS, schema setup, backup และ rollback

1. สร้าง MySQL database ว่างและผู้ใช้เฉพาะฐานข้อมูล
2. คัดลอก `.env.example` เป็น `.env` แล้วตั้ง `APP_URL`, บัญชีผู้ดูแล, keys และ MySQL configuration
3. สร้าง schema ผ่าน CLI และตั้ง document root เป็น `public/`

```bash
php scripts/setup.php password
php scripts/setup.php key
php scripts/setup.php key
php scripts/setup.php check
php scripts/setup.php migrate-dry-run
php scripts/setup.php migrate
```

PHP ต้องมี `pdo_mysql`, `curl`, `openssl`, `mbstring` และ Argon2id; runtime ไม่สร้าง schema อัตโนมัติ
Password prompt ซ่อนรหัสผ่าน เก็บ hash และ keys ใน `.env` เท่านั้น

Development ใช้ `APP_ENV=development`, `APP_URL=http://127.0.0.1:8080` และฐานข้อมูล local แยก

```bash
php -S 127.0.0.1:8080 -t public public/router.php
```

Production ใช้ Nginx + PHP-FPM + HTTPS ตาม [nginx-php.conf](docs/deployment/nginx-php.conf) ไม่ใช้ PHP development server

## ความสามารถ

- บัญชีผู้ดูแลหนึ่งบัญชี, signed session cookie, session revocation, CSRF และ rate limits
- Cloudflare User/Account Token verification และ AES-256-GCM encryption ผูก owner
- Routing rules: forward/drop/worker, Catch-all, DNS และ Plus Addressing
- CRUD หมวดหมู่แบบ modal, logo upload, bulk annotations, search/filter และ JSON audit export
- Revision/fingerprint conflicts ป้องกัน stale writes, audit บันทึก pending/succeeded/failed/ผลที่ต้องตรวจอีกครั้ง
- Responsive desktop/tablet/mobile พร้อม local LINE Seed Sans TH fonts

## โครงสร้าง

`public/` เป็น web root; `src/` แยก controllers, repositories และ services; `templates/` เป็น HTML/PHP; `database/` เป็น MySQL schema; `scripts/` เป็น CLI; `.env`, data, logs และ backups ต้องอยู่นอก web root

API คง `/api/state`, `/api/catalog`, `/api/connection`, `/api/zones`, `/api/zone`, `/api/rule`, `/api/destination`, `/api/annotations`, `/api/settings`, `/api/audit`, auth และ health ตาม contract เดิม

## ตรวจสอบ

ชุดทดสอบสร้างชื่อ database `relaydesk_test_*` ของตัวเองและลบเฉพาะฐานข้อมูลนั้นเมื่อจบ ต้องใช้ MySQL instance สำหรับทดสอบเท่านั้น ไม่อ่าน production `.env`

```bash
# Linux shell; เลือก port/user/password ของ MySQL instance ทดสอบ
TEST_DB_PORT=33316 TEST_DB_USER=root php scripts/verify.php
# รวม browser checks (ใช้ Playwright จาก tooling environment)
TEST_DB_PORT=33316 TEST_DB_USER=root php scripts/verify.php --ui
```

```powershell
$env:TEST_DB_PORT = '33316'
$env:TEST_DB_USER = 'root'
# หาก MySQL ทดสอบมีรหัสผ่าน กำหนด TEST_DB_PASSWORD ใน environment
# หาก Playwright อยู่ภายนอก กำหนด PLAYWRIGHT_PACKAGE_PATH ไปยัง index.mjs
php scripts/verify.php --ui
```

Browser tests ใช้ Node.js/Playwright เป็น QA tooling เท่านั้น ตั้ง `CHROMIUM_EXECUTABLE` ได้เมื่อ browser อยู่ภายนอก Screenshots และผลตรวจอยู่ใน `outputs/php-tests-*` ซึ่งไม่ commit

Tests ตรวจ HTTP → PHP → MySQL persistence, auth, concurrent counters/revisions และ browser interaction; Cloudflare ใช้ fixtures ไม่มีการเขียนบัญชีจริง ไม่ใช่ production validation

ผลตรวจและขอบเขตหลักฐานล่าสุดอยู่ใน [verification.md](docs/verification.md)

GitHub Actions ใช้ PHP 8.3, MySQL 8.0 service และ Node.js เฉพาะ browser tooling ไม่มี deploy step

## การเริ่มฐานข้อมูลใหม่และ rollback

ไม่มี SQLite/D1 import ผู้ดูแลตั้งรหัสผ่านใหม่และเชื่อม Cloudflare ใหม่ Local catalogs, annotations และ audit เริ่มใหม่ กฎ Routing และ destinations ยังคงอยู่ใน Cloudflare

Source/runtime เดิมอยู่ใน Git baseline `ebe53e86e1c8e643c2da5219566560b0cb8dd957` ดู [ขอบเขต rollback](docs/legacy-runtime.md) ห้ามลบ SQLite หรือเขียนทับ config เดิม การย้าย production ต้องมี backup และตรวจเป้าหมายแยกต่างหาก
