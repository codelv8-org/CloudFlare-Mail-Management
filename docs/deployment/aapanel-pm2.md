# ติดตั้ง Relaydesk บน VPS / aaPanel ด้วย PM2

> คู่มือเวอร์ชันเดิมสำหรับ rollback เท่านั้น Release ปัจจุบันใช้ [PHP-FPM / MySQL](aapanel-php-mysql.md) ไฟล์และคำสั่ง Node/PM2 ด้านล่างอยู่ใน Git baseline ที่ระบุใน [legacy-runtime.md](../legacy-runtime.md)

โค้ดใน GitHub ใช้ Next.js บน Node.js, SQLite ใน VPS และบัญชีผู้ดูแลหนึ่งบัญชี
Cloudflare API Token ยังคงเข้ารหัสด้วย AES-GCM ก่อนเก็บในฐานข้อมูล
ไม่ต้องมี Cloudflare D1 หรือ ChatGPT Sites เพื่อรันเวอร์ชันนี้

## 1. เตรียมเครื่อง

- ใช้ Node.js 24 LTS และ npm; ตรวจ `node -v` ก่อนติดตั้ง
- ติดตั้ง Nginx และ SSL สำหรับโดเมนใน aaPanel
- รันแอปและ PM2 ด้วยผู้ใช้ระบบเดียวกันที่มีสิทธิ์เขียนโฟลเดอร์โปรเจกต์
- แนะนำ RAM อย่างน้อย 2 GB สำหรับ build; หาก RAM น้อยให้ build บนเครื่องที่มีหน่วยความจำพอ
- ไม่ต้องเปิดพอร์ต 3000 สู่ภายนอก: แอปฟังที่ 127.0.0.1 และ Nginx รับ 443

```bash
cd /www/wwwroot
git clone https://github.com/codelv8-org/CloudFlare-Mail-Management.git relaydesk
cd relaydesk
npm ci
cp .env.example .env
chmod 600 .env
npm run auth:hash
```

คำสั่ง hash รับรหัสผ่านแบบซ่อน จากนั้นแสดงเฉพาะ hash เพื่อนำไปใส่ `.env`
รหัสผ่านต้องยาว 12–256 ตัวอักษร อย่าใส่รหัสผ่านจริงใน command line

สร้างกุญแจสองค่า โดยรันคำสั่งนี้สองครั้ง:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

แก้ `.env`:

```dotenv
NODE_ENV=production
HOSTNAME=127.0.0.1
PORT=3000
APP_URL=https://mail.example.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH='scrypt$...'
SESSION_SECRET=<ค่าที่สร้างครั้งแรก>
TOKEN_ENCRYPTION_KEY=<ค่าที่สร้างครั้งที่สอง>
DATABASE_PATH=./data/relaydesk.sqlite
```

แทนตัวอย่างด้วยค่าจริง APP_URL ต้องเป็น HTTPS origin ของโดเมน เช่น
`https://mail.yourdomain.com` โดยไม่มี path ต่อท้าย; ใช้ค่านี้ตรวจ Origin และ redirect
เก็บ ADMIN_EMAIL ให้คงเดิม เพราะเป็นตัวกำหนดเจ้าของข้อมูล
เก็บ TOKEN_ENCRYPTION_KEY ไว้ถาวรและสำรองแยกอย่างปลอดภัย การเปลี่ยนค่านี้ทำให้ Token เดิมอ่านไม่ได้
เมื่อเปลี่ยน SESSION_SECRET ผู้ใช้จะต้องล็อกอินใหม่

## 2. Build และเริ่ม PM2

```bash
npm run db:migrate
npm run test:vps
npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

รันคำสั่งที่ `pm2 startup` แสดงให้ครบ เพื่อเริ่มหลัง reboot
ใช้ Node เวอร์ชันเดียวกันสำหรับ install, build, PM2 และ startup service
ไฟล์ startup คือ `scripts/start-production.mjs`; หาก aaPanel ต้องการเลือกไฟล์
ให้เลือกไฟล์นี้ ตั้ง working directory เป็น `/www/wwwroot/relaydesk`
และกำหนด Node.js 24 ไม่ควรเปิดแอปซ้ำทั้งใน aaPanel Node Project และ PM2 CLI

PM2 ใช้ fork หนึ่ง instance เพื่อให้ SQLite และ migration ทำงานสอดคล้องกัน
ไฟล์ `.env` โหลดเมื่อ process เริ่ม ค่า environment ที่กำหนดไว้ภายนอกจะมีลำดับความสำคัญสูงกว่า
หาก aaPanel กำหนด HOSTNAME ไว้ ให้แก้เป็น 127.0.0.1

## 3. ตั้ง Reverse Proxy ใน aaPanel

สร้าง Website สำหรับโดเมน เปิด SSL และ Force HTTPS
ตั้ง Reverse Proxy ไปที่ `http://127.0.0.1:3000` และส่ง Host เป็น `$host`
ดูตัวอย่าง location ใน [nginx-location.conf](nginx-location.conf)
หากใช้ config ตัวอย่าง ให้แทน location `/` เดิม อย่าเพิ่ม location ซ้ำ

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 60s;
    client_max_body_size 1m;
}
```

Document root ของ Nginx ต้องไม่ชี้ไปโฟลเดอร์ source หรือ data ให้ใช้โฟลเดอร์ว่างแยกต่างหาก
ส่งทุก request ไป reverse proxy แทนการเสิร์ฟ source, `.env` หรือ SQLite โดยตรง
ปิด proxy cache สำหรับแอป เพื่อไม่เก็บข้อมูล session/API
ถ้าใช้ Cloudflare proxy ให้เลือก SSL Full (strict) และ SSL ที่ VPS ใช้งานได้จริง

## 4. ตรวจระบบ

```bash
curl -f http://127.0.0.1:3000/api/health
pm2 status
pm2 logs relaydesk --lines 50
```

ผล health ปกติคือ `{"status":"ok"}`
เปิดโดเมน HTTPS แล้วล็อกอินด้วย ADMIN_EMAIL และรหัสผ่านที่ตั้งไว้
เข้าการเชื่อมต่อเพื่อเพิ่ม Cloudflare Account ID และ API Token
บัญชีผู้ดูแลจำกัดการพยายามล็อกอิน 10 ครั้งต่อ 15 นาที และ session มีอายุ 8 ชั่วโมง
การ logout ต้องยืนยันผ่าน POST และเพิกถอน session ในฐานข้อมูล

## 5. อัปเดตและสำรองข้อมูล

```bash
cd /www/wwwroot/relaydesk
npm run db:backup
git pull --ff-only
npm ci
npm run test:vps
npm run build
pm2 restart relaydesk --update-env
pm2 save
```

สำรองด้วย `npm run db:backup` ใช้ SQLite online backup API รองรับ WAL ที่กำลังใช้งาน
เก็บไฟล์ backup และ `.env` แยกนอกเครื่องด้วย ห้ามเก็บไว้ใน public web root
หากกู้คืน ให้หยุด PM2 แล้วคืนฐานข้อมูลจาก backup พร้อมกุญแจเดิม
ลบไฟล์ `relaydesk.sqlite-wal` และ `relaydesk.sqlite-shm` เก่าขณะ process หยุด ก่อนเริ่มระบบ
Migration ใช้ transaction และ checksum; ไม่ควรแก้ SQL migration ที่ใช้แล้ว

## ข้อมูลเดิมจาก Sites

การติดตั้งครั้งแรกสร้างฐานข้อมูล VPS ใหม่ ไม่ได้ย้ายข้อมูล D1 หรือ runtime secrets จาก Sites อัตโนมัติ
สามารถเชื่อมต่อ Cloudflare ใหม่ได้ กฎ Routing และอีเมลปลายทางยังอยู่ใน Cloudflare
Platform tags, กลุ่ม, Priority, annotation และ audit เดิมอยู่ใน D1 ต้อง export/import แยกหากต้องการเก็บ
Token เดิมเข้ารหัสผูกกับ user ID ของ Sites จึงห้ามนำ ciphertext มาเปลี่ยน owner เฉย ๆ
ต้องทำ migration ข้อมูลเฉพาะเมื่อมี export, mapping ของ owner และกุญแจเดิมพร้อม

## อ้างอิง

- https://nextjs.org/docs/app/guides/self-hosting
- https://nodejs.org/api/sqlite.html
- https://pm2.keymetrics.io/docs/usage/application-declaration/
