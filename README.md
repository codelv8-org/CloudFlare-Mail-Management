# Relaydesk — Cloudflare Email Routing

จัดการ Cloudflare Email Routing, อีเมลปลายทาง, Platform tags, กลุ่มผู้ใช้, Priority และประวัติการทำงาน

เวอร์ชัน GitHub นี้รันบน **VPS / aaPanel ด้วย PM2** ใช้ **Next.js + Node.js + SQLite**
มีบัญชีผู้ดูแลและ session cookie ของตนเอง พร้อมเข้ารหัส Cloudflare API Token

## ติดตั้ง

ดู [คู่มือติดตั้ง aaPanel / PM2 ภาษาไทย](docs/deployment/aapanel-pm2.md) สำหรับขั้นตอนครบตั้งแต่ clone จนถึง HTTPS, backup และ update

- Node.js 24 LTS
- Startup: `scripts/start-production.mjs`
- PM2: `ecosystem.config.cjs`
- Environment: คัดลอก `.env.example` เป็น `.env` แล้วตั้งค่าก่อนเริ่มระบบ
- ฐานข้อมูล: `data/relaydesk.sqlite` สร้างและ migrate อัตโนมัติเมื่อเริ่มระบบ

```bash
npm ci
cp .env.example .env
npm run auth:hash
# ตั้งค่า .env ตามคู่มือ
npm run db:migrate
npm run test:vps
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

## คำสั่ง

| คำสั่ง | หน้าที่ |
| --- | --- |
| `npm run dev` | Next.js development บน loopback |
| `npm run build` | Build สำหรับ production |
| `npm start` | ตรวจ configuration, migrate SQLite และเปิด Next.js |
| `npm run auth:hash` | สร้าง password hash โดยไม่แสดงรหัสผ่าน |
| `npm run db:migrate` | ใช้ SQL migrations |
| `npm run db:backup` | Online backup SQLite ไป backups/ |
| `npm run test:vps` | ตรวจ auth, migration และ production configuration |

Production ต้องใช้ HTTPS และ Nginx reverse proxy ไป `127.0.0.1:3000`
Cloudflare API Token ใช้จากหน้าเชื่อมต่อ ไม่ต้องใส่ Token ใน source

## ตรวจสอบ UI และการทำงาน

```bash
npm run lint
npm run test:vps
npm run build
npm run test:http
npm run test:ui
```

`test:http` และ `test:ui` ใช้ SQLite ชั่วคราว ไม่แก้ฐานข้อมูลใช้งานจริง
`test:ui` ต้องมี Playwright พร้อม Chromium ในเครื่อง หรือกำหนด `PLAYWRIGHT_PACKAGE_PATH` เป็นพาธไฟล์ `index.mjs` ของแพ็กเกจ Playwright ที่ติดตั้งไว้
ภาพตรวจสอบจะอยู่ในโฟลเดอร์ชั่วคราวที่แสดงในผลการทดสอบ
CRUD หมวดหมู่ตรวจด้วย API และ SQLite จริง ส่วน Cloudflare ใช้ข้อมูลจำลองสำหรับตรวจ UI โดยไม่เขียนบัญชีภายนอก

## GitHub Actions

Workflow [CI](.github/workflows/ci.yml) รันเมื่อ push, เปิดหรืออัปเดต pull request และสั่งเองผ่าน Actions → CI → Run workflow
ใช้ Ubuntu 24.04 และ Node.js 24 พร้อม npm cache จาก `package-lock.json`

ตรวจตามลำดับ: `npm ci` → `npm run lint` → `npm run test:vps` → `npm run build` → `npm run test:http` → `npm run test:ui`
ติดตั้ง Playwright และ Chromium ในพื้นที่ชั่วคราวของ runner โดยไม่เพิ่ม dependency ของแอป
ชุดทดสอบใช้ SQLite ชั่วคราวและข้อมูล Cloudflare จำลอง ไม่ต้องตั้ง GitHub Secrets และไม่มีขั้นตอน deploy

## Auto Deploy ไป aaPanel ภายใน LAN

มี Workflow [Deploy to LAN aaPanel](.github/workflows/deploy-lan.yml) สำหรับ **Private IP + Self-hosted Runner**
โดยรอให้ GitHub-hosted CI ผ่านจากการ Push ไป main ก่อนส่ง Source ผ่าน SSH ใน LAN
ใช้ release แยกจากกัน พร้อม SQLite online backup, PM2 restart, health check และ app-only rollback

**Security gate:** Repository นี้ยังเป็น Public อยู่ จึงตั้งให้ขั้นตอน Deploy ถูก Skip จนกว่าจะเปลี่ยนเป็น Private
และตั้ง Runner Group / branch protection / environment / SSH key / managed release directory ครบ
ไม่มีการเปิด SSH ของ VPS สู่ Internet และการ Merge Workflow ไม่ได้เท่ากับการ Deploy ขึ้น Production

อ่าน [คู่มือติดตั้ง Self-hosted Runner และ Auto Deploy ภาษาไทย](docs/deployment/self-hosted-runner-lan.md)
## ที่มาของโครงการ

นำเข้าจาก Relaydesk บน ChatGPT Sites แล้วปรับ GitHub ให้ self-host ได้
ข้อมูล D1 และ secrets เดิมไม่ถูกย้ายอัตโนมัติ ดูข้อจำกัดการย้ายข้อมูลในคู่มือติดตั้ง
ไฟล์ build/Vinext/Workers เดิมเก็บเพื่ออ้างอิง แต่ไม่ถูกใช้ใน VPS runtime
ดู [เอกสาร starter เดิม](docs/sites-starter-reference.md) สำหรับประวัติของ source
