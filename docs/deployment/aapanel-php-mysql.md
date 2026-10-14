# Relaydesk: aaPanel + PHP-FPM + MySQL

Runtime ใช้ PHP 8.3+, MySQL 8.0+, HTML/CSS/Vanilla JavaScript ไม่ต้องติดตั้ง Node.js, PM2, Composer หรือ build frontend บน production

## 1. เตรียมเป้าหมายและเก็บ rollback

งานนี้เริ่ม MySQL ใหม่ ไม่ย้าย SQLite, D1, sessions หรือ ciphertext เก่าโดยอัตโนมัติ กฎ Routing และ destinations ยังอยู่ในบัญชี Cloudflare; catalogs, annotations และ audit เริ่มใหม่ใน MySQL

ก่อนเปลี่ยนระบบจริง ให้สำรอง source/release, `.env` และ SQLite ด้วยวิธี online backup ของเวอร์ชันเดิมขณะที่ระบบเดิมยังรัน เก็บนอก document root และบันทึก Nginx/PM2 configuration เดิม ห้ามลบ data หรือเปลี่ยนกุญแจของระบบเดิม

สร้าง PHP Website ใหม่แยกจาก Node Website เดิมจนผ่าน acceptance checks ไม่หยุด PM2 เดิมระหว่างเตรียม หาก rollback ให้เปลี่ยน upstream กลับระบบเดิม พร้อมฐานข้อมูลและ config เดิม ข้อมูลใหม่ใน MySQL ไม่ถูกย้อนกลับเข้า SQLite; ต้องยอมรับขอบเขตนี้ก่อน cutover

## 2. ติดตั้งใน aaPanel

- ติดตั้ง Nginx, PHP 8.3 และ MySQL 8.0 เปิด extensions `pdo_mysql`, `curl`, `openssl`, `mbstring`; PHP ต้องรองรับ Argon2id
- สร้างฐานข้อมูล **ว่าง** `relaydesk` แบบ `utf8mb4` และผู้ใช้เฉพาะฐานข้อมูลนี้ ไม่ใช้ MySQL root ในแอป ให้สิทธิ์ DDL เฉพาะตอน schema setup แล้วลดเหลือ SELECT/INSERT/UPDATE/DELETE สำหรับ runtime
- Clone repo ไป `/www/wwwroot/relaydesk` แล้วตั้ง document root เป็น `/www/wwwroot/relaydesk/public` เท่านั้น
- ตั้ง PHP `max_execution_time=120`, `display_errors=Off`, `log_errors=On`; logs อยู่นอก public และจำกัดสิทธิ์อ่าน
- เปิด HTTPS และ Force HTTPS; ถ้า Cloudflare proxy ใช้ SSL Full (strict)

```bash
cd /www/wwwroot/relaydesk
cp .env.example .env
chmod 600 .env
php scripts/setup.php password
php scripts/setup.php key
php scripts/setup.php key
```

Password prompt ซ่อนรหัสผ่าน รับ 12–256 ตัวอักษร ใช้ Argon2id hash ที่แสดงไปใส่ `ADMIN_PASSWORD_HASH` ภายใน single quotes แยกผล `key` ทั้งสองครั้งเป็น `SESSION_SECRET` และ `TOKEN_ENCRYPTION_KEY` ห้ามส่งรหัสผ่านหรือ Token ใน command line

```dotenv
APP_ENV=production
APP_URL=https://mail.example.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH='$argon2id$...'
SESSION_SECRET=<base64 จาก key ครั้งแรก>
TOKEN_ENCRYPTION_KEY=<base64 จาก key ครั้งที่สอง>
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=relaydesk
DB_USER=relaydesk
DB_PASSWORD='<รหัสผ่านฐานข้อมูล>'
```

ใช้ PHP CLI version และ extensions ตรง PHP-FPM ที่เลือกใน aaPanel `APP_URL` ต้องเป็น origin เดียวกับที่ browser ใช้ ไม่มี path ส่วนท้าย; production บังคับ HTTPS Environment ภายนอกมีลำดับเหนือ `.env` และไม่มีการ interpolate ค่าตัวแปรใน `.env`

เก็บ `ADMIN_EMAIL` คงเดิมเพื่อรักษา owner mapping เก็บ `TOKEN_ENCRYPTION_KEY` พร้อม backup อย่างปลอดภัย เปลี่ยน key นี้ทำให้ Token อ่านไม่ได้ เปลี่ยน `SESSION_SECRET` ทำให้ sessions เดิมต้อง login ใหม่ ห้ามเปิดอ่าน `.env` ผ่านเว็บหรือ commit secrets

## 3. Dry-run และสร้าง schema

```bash
php scripts/setup.php check
php scripts/setup.php migrate-dry-run
php scripts/setup.php migrate
php scripts/setup.php migrate-dry-run
```

Dry-run แสดงชื่อฐานข้อมูลและ checksum โดยไม่เขียน schema Migration ใช้ database lock และ checksum ปฏิเสธฐานข้อมูลที่มีตารางอื่นหรือ schema ไม่ครบ ไม่รัน DDL อัตโนมัติเมื่อมี HTTP request

MySQL DDL ไม่ได้ rollback พร้อม transaction หาก setup ขาดกลางทางให้หยุด ตรวจ log แล้วสร้าง **ฐานข้อมูลว่างใหม่** เฉพาะเป้าหมายที่ตรวจแล้ว ห้ามลบตาราง production เพื่อแก้ checksum mismatch

## 4. Nginx / PHP-FPM

ใช้ [nginx-php.conf](nginx-php.conf) เป็นตัวอย่าง location rules ปรับ PHP-FPM socket ให้ตรงค่าจริงใน aaPanel ไม่ใช้ socket ตัวอย่างโดยไม่ตรวจ หาก aaPanel มี PHP include หรือ location อยู่แล้วให้ปรับเป็นชุดเดียว ห้ามเพิ่ม location ซ้ำหรือเปิด PHP execution ทุก path

ต้องส่งทุก API/page route ไป `public/index.php`, ปิด proxy/FastCGI cache และปฏิเสธ dotfiles, private paths และ `router.php` `router.php` ใช้เฉพาะ PHP development server

ตรวจ Nginx config ก่อน reload และเก็บ config เดิมเพื่อคืนค่า ไม่เปลี่ยน routing ของ production จนกว่าหน้า login, API และ MySQL persistence ของ PHP deployment ผ่านการตรวจ

## 5. ตรวจรับ

```bash
curl -f https://mail.example.com/api/health
curl -I https://mail.example.com/.env
curl -I https://mail.example.com/src/Config.php
curl -I https://mail.example.com/backups/backup.sql
```

Health ต้องตอบ `{"status":"ok"}`; private paths ต้อง 403/404 ไม่มีเนื้อหาไฟล์ ตรวจ login, เพิ่ม/แก้ไข/ลบ catalog, reload แล้วข้อมูลยังอยู่, revision conflict, logout แล้ว cookie เดิมเข้า API ไม่ได้ และหน้าจอ mobile/tablet

เชื่อม Cloudflare ใหม่ด้วย Account ID และ Token ที่มี scope ตามงาน คง Account/Zone resources ให้จำกัด API รองรับ User Token และ Account Token; Token ที่บันทึกถูกเข้ารหัส AES-256-GCM ผูกกับ owner ปลายทาง forward ต้องยืนยันแล้ว ตาม [เอกสาร Cloudflare](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)

การทดสอบ repo ใช้ fixtures สำหรับ Cloudflare ไม่พิสูจน์ Token permissions หรือการส่งอีเมลจริง Live read checks และ live writes ต้องระบุบัญชี/โดเมนที่ได้รับอนุญาตก่อน; deployment guide ไม่ใช่คำสั่งให้ทำ cutover

Session อายุ 8 ชั่วโมง จำกัด login 10 ครั้งต่อ 15 นาทีทั้งบัญชี และ API 60 requests ต่อนาทีต่อ owner Logout เป็น POST และลบ session ใน MySQL คำขอเขียน API ต้องมี same-origin กับ `x-relaydesk-request: 1`

ถ้า Cloudflare write timeout ระบบบันทึก audit ว่าให้ตรวจผล ห้าม retry อัตโนมัติ ให้ reload แล้วตรวจสถานะจริงก่อนทำซ้ำ

## 6. Backup / restore / update

ใช้ aaPanel database backup สำหรับ InnoDB หรือ `mysqldump --single-transaction` สำรอง MySQL พร้อม `.env` และ release แยกนอก public ตั้งสิทธิ์และทดสอบ restore ลงฐานข้อมูลอื่นก่อนใช้จริง ห้าม backup เป็น URL สาธารณะ

```bash
# รันจาก directory สำรองนอก document root; -p จะถามรหัสผ่าน
mysqldump --single-transaction --no-tablespaces -h 127.0.0.1 -u relaydesk -p relaydesk > relaydesk-backup.sql
# Restore ไปฐานข้อมูลเป้าหมายว่างที่ตรวจแล้วเท่านั้น
mysql -h 127.0.0.1 -u relaydesk -p relaydesk_restore < relaydesk-backup.sql
```

ก่อน update: สำรองฐานข้อมูล/config, ตรวจ diff และ schema changes, ทดสอบ release บนฐานข้อมูลแยก แล้วค่อยเปลี่ยน release ไม่มี schema migration ตอน web startup ตรวจ health/login/persistence หลัง deploy ทุกครั้ง

เก็บ SQLite และ release Node เดิมจนหมดช่วง rollback ห้ามนำ Argon2id hash หรือ MySQL config ของเวอร์ชันใหม่ไปทับ `.env` เดิม

อ้างอิง [PHP password_hash](https://www.php.net/manual/en/function.password-hash.php), [Nginx FastCGI](https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html)
