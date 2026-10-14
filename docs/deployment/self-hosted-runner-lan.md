# Auto Deploy ไปยัง aaPanel ใน LAN (Self-hosted Runner)

คู่มือนี้สำหรับกรณีเซิร์ฟเวอร์ aaPanel มี **Private IP เท่านั้น** และไม่เปิด SSH จาก Internet
ระบบใช้ GitHub-hosted runner ตรวจ CI ก่อน จากนั้นใช้ **Linux Self-hosted Runner บนเครื่องแยกใน LAN**
ส่ง source ที่ผ่าน CI ไปยัง aaPanel ผ่าน SSH และรันด้วย PM2

> **สำคัญ: Repository นี้เป็น Public ณ วันที่เพิ่ม Workflow** ตามคำแนะนำด้านความปลอดภัยของ GitHub ไม่ควรผูก Public Repository กับ Self-hosted Runner ที่เข้าถึง Production LAN ได้
> Workflow ที่เพิ่มจึงมีเงื่อนไขปฏิเสธการ Deploy เสมอเมื่อ Repository ยังเป็น Public
> ต้องเปลี่ยนเป็น Private, จำกัดผู้เขียน branch main และตั้ง Runner Group แบบจำกัด Workflow ก่อนเริ่มใช้งานจริง

## สถาปัตยกรรม

~~~text
Developer pushes to main
  -> GitHub Actions: CI (GitHub-hosted Ubuntu, test + build)
  -> CI success on an authentic main push only
  -> Deploy to LAN aaPanel (private repository only)
  -> Self-hosted Runner (separate Linux VM inside LAN)
  -> Verified SSH host key + dedicated deploy SSH key
  -> aaPanel Linux VPS (private IP)
  -> staged release -> npm ci -> tests -> build
  -> SQLite online backup -> atomic current symlink switch
  -> PM2 startOrRestart -> /api/health -> rollback on failure
~~~

Runner ต้องเชื่อมต่อออก GitHub ผ่าน HTTPS 443 และ SSH ไปหา Private IP ของ Server ได้
**ไม่ต้องเปิด SSH ของ aaPanel ออก Internet** และไม่ต้องติดตั้ง Runner บน Production VPS
ไม่ได้ใช้ aaPanel API หรือดัดแปลงฐานข้อมูลภายในของ aaPanel

## 1. ความปลอดภัย GitHub ก่อนเริ่ม

1. เปลี่ยน Visibility ของ codelv8-org/CloudFlare-Mail-Management เป็น **Private** หลังตรวจสอบผลกระทบแล้ว (Settings > General > Change repository visibility)
2. เพิ่ม Branch Protection/Ruleset สำหรับ main: ต้องผ่าน CI ก่อน merge, จำกัดผู้ Push/แก้ Workflow, ใช้ Pull Request Review
3. สร้าง GitHub Environment ชื่อ **production** และ Restrict deployment branches เป็น **main**; ตั้ง Required reviewers สำหรับ Production หากต้องการการอนุมัติก่อน Deploy (กรณีนี้จะไม่เป็น Fully Automatic)
4. ที่ Organization Settings > Actions > Runner groups สร้าง Runner Group ชื่อ **relaydesk-production**
5. จำกัด Runner Group ให้เข้าถึง Repository นี้เท่านั้น และถ้าสิทธิ์/แพลนรองรับให้เลือก Workflow ที่อนุญาตเฉพาะ .github/workflows/deploy-lan.yml บน refs/heads/main
6. อย่าใช้ Runner นี้กับ PR, Fork, Repository อื่น หรือ Workflow ที่รันโค้ดจากผู้ใช้ภายนอก

**ไม่เพียงพอ** ที่จะใส่ job-level if แล้วเชื่อถือ Self-hosted Runner บน Public Repository; การเปลี่ยน Private และกำหนด Access Policy เป็นข้อกำหนดสำหรับระบบนี้

อ้างอิง:
- https://docs.github.com/en/actions/reference/security/secure-use
- https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

## 2. เตรียม Linux Runner แยกจาก aaPanel

ใช้ Linux x64 VM/mini PC ที่อยู่ใน VLAN สำหรับ Deployment โดยมี outbound HTTPS 443 ไป GitHub และเชื่อม SSH ถึง aaPanel Private IP
ติดตั้ง git, bash, openssh-client, tar, curl, jq, coreutils และใช้งาน GitHub runner ด้วยบัญชีที่ไม่มีสิทธิ์ root

ใน Settings > Actions > Runners ของ Repository/Organization เลือก New self-hosted runner แล้วใช้คำสั่งติดตั้ง **ที่ GitHub ออกให้ ณ เวลานั้น** (อย่าใช้ Registration Token ที่แชร์ในเอกสาร)
กำหนด labels อย่างน้อย:

~~~text
self-hosted, linux, x64, relaydesk-deploy
~~~

ให้ Runner อยู่ใน Group ชื่อ relaydesk-production และรันเป็น systemd service ภายใต้ผู้ใช้เฉพาะ

### SSH Identity

สร้าง SSH Key เฉพาะงาน Deploy บน Runner; ติดตั้ง **Public Key** ให้ผู้ใช้ deploy บน aaPanel VPS
เก็บ Private Key บน Runner เท่านั้น ไม่ Commit และไม่ Copy เข้า Workflow Logs

~~~bash
# ตัวอย่างบน Linux Runner (บัญชีที่รัน Actions)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/relaydesk_deploy -C relaydesk-lan-deploy
chmod 600 ~/.ssh/relaydesk_deploy
chmod 600 ~/.ssh/known_hosts
~~~

เพิ่ม fingerprint ของ Server ลง ~/.ssh/known_hosts หลัง **ตรวจสอบ fingerprint จากหน้า Console/ช่องทางที่เชื่อถือได้** เท่านั้น
ไม่ใช้ StrictHostKeyChecking=no และไม่ถือว่า ssh-keyscan ที่ไม่ได้ตรวจ fingerprint เชื่อถือได้
ต้องทดสอบ SSH แบบ non-interactive ด้วย user deploy และ PATH เดียวกับ Runner service
ใช้ SSH key แบบไม่ต้องกรอกรหัสผ่านที่ runtime โดยจำกัดสิทธิ์ของบัญชีและไฟล์ให้เข้มงวด

## 3. เตรียม aaPanel Server

ใช้ Linux User ชื่อ deploy (หรือผู้ใช้ที่กำหนด) ที่มีสิทธิ์เฉพาะโฟลเดอร์แอป
ผู้ใช้นี้ต้องเป็น **PM2 owner เดียวกัน** กับ Process relaydesk และต้องเรียก node, npm, pm2, curl, flock จาก SSH แบบ non-interactive ได้
ต้องใช้ Node.js 24, PM2 และ Nginx Reverse Proxy ไปยัง 127.0.0.1:3000 ตามคู่มือหลัก
ห้ามรันแอปซ้ำผ่าน aaPanel Node Project กับ PM2 CLI พร้อมกัน

ตัวอย่างโครงสร้างที่ **เตรียมล่วงหน้าด้วยเจ้าของโฟลเดอร์ที่ถูกต้อง**:

~~~text
/www/wwwroot/relaydesk/
  releases/                  # แยกตาม SHA + GitHub Run ID
  shared/
    .env                     # chmod 600, ไม่อยู่ใน Git
    data/                    # SQLite/WAL/SHM แบบถาวร
    backups/                 # SQLite online backups
  current -> releases/xxxx   # สร้างโดย Deploy เท่านั้น
~~~

ตัวอย่างคำสั่งสำหรับ Linux Admin ที่มีสิทธิ์ sudo:

~~~bash
sudo install -d -m 700 -o deploy -g deploy /www/wwwroot/relaydesk
sudo -u deploy mkdir -p /www/wwwroot/relaydesk/releases /www/wwwroot/relaydesk/shared/data /www/wwwroot/relaydesk/shared/backups
sudo -u deploy chmod 700 /www/wwwroot/relaydesk/releases /www/wwwroot/relaydesk/shared /www/wwwroot/relaydesk/shared/data /www/wwwroot/relaydesk/shared/backups
sudo -u deploy nano /www/wwwroot/relaydesk/shared/.env
sudo -u deploy chmod 600 /www/wwwroot/relaydesk/shared/.env
~~~

คัดลอกค่าจาก [.env.example](../../.env.example) โดยใส่ค่าจริงทุกช่อง ใช้ DATABASE_PATH=./data/relaydesk.sqlite เพื่อเก็บ SQLite ใน shared/data
ตรวจให้แน่ใจว่าไฟล์ .env อยู่ภายใต้ shared เท่านั้น ข้อมูล Database, Backup และ Secrets ห้าม Commit ไปยัง GitHub

### หากติดตั้ง Relaydesk แบบ Flat Directory อยู่ก่อนแล้ว

**ห้ามใช้ /www/wwwroot/relaydesk เดิมโดยตรง** เพราะ Script ปฏิเสธโฟลเดอร์ที่มี package.json หรือ .git เพื่อไม่ให้ Deployment อัตโนมัติทำลาย Production
ต้องกำหนดช่วง Downtime และย้ายเป็นโครงสร้าง release ล่วงหน้าอย่างระมัดระวัง:

1. ใช้ npm run db:backup จากโฟลเดอร์เดิม แล้วนำ Backup ออกนอกเครื่อง
2. สำรอง .env, data รวมทั้ง SQLite WAL/SHM, PM2 ecosystem, Nginx config และตรวจว่ากู้คืนได้
3. หยุด PM2 relaydesk ก่อน Copy ไฟล์ SQLite แบบ filesystem เพื่อเลี่ยงข้อมูลไม่สอดคล้อง
4. เก็บโฟลเดอร์ Flat เดิมโดย Rename เป็น relaydesk-legacy-* (ห้ามลบทิ้ง)
5. สร้าง Managed Directory และย้าย .env ไป shared/.env และ data ไป shared/data โดยคงเจ้าของไฟล์เดิม
6. เคลียร์ PM2 Process เดิมอย่างระมัดระวัง เพราะแอปใหม่ต้อง Start จาก release layout เดียวกัน
7. ทำ Deployment ครั้งแรก แล้วตรวจ HTTPS, Login และข้อมูล Cloudflare ก่อนปิดแผน Rollback

สคริปต์จะ **ไม่ย้าย Flat Directory อัตโนมัติ** และจะไม่สร้าง PM2 Process ซ้ำซ้อนให้แอปเดิม
แผน Rollback สำหรับ Migration โครงสร้างนี้เป็นการกู้คืนด้วยมือ ไม่ใช่ฟังก์ชัน Auto Rollback

## 4. ตั้งค่า GitHub Environment Variables

สร้าง Environment ชื่อ production แล้วกำหนด Configuration Variables ดังนี้ (ตัวอย่างต้องแทนค่าจริง):

| Variable | Example | Description |
| --- | --- | --- |
| DEPLOY_HOST | 192.168.10.50 | Private IP หรือ DNS ของ aaPanel VPS |
| DEPLOY_USER | deploy | Linux user ที่เป็น PM2 owner |
| DEPLOY_SSH_PORT | 22 | SSH port บน LAN |
| DEPLOY_ROOT | /www/wwwroot/relaydesk | Managed release directory |
| DEPLOY_SSH_KEY_FILE | /home/actions/.ssh/relaydesk_deploy | Absolute path บน Runner VM |
| DEPLOY_SSH_KNOWN_HOSTS | /home/actions/.ssh/known_hosts | Verified host keys บน Runner VM |
| DEPLOY_HEALTH_URL | http://127.0.0.1:3000/api/health | ตรวจ Health Check จาก aaPanel Server เอง |
| DEPLOY_NODE_BIN_DIR | /usr/local/bin | Optional: Path ของ node/npm/pm2 หาก SSH non-interactive หาไม่เจอ |

ให้กำหนด SSH Key ที่ Runner File System แบบ permission 600 และจำกัดบัญชีผู้ใช้
ไม่ต้องใส่ private key ใน GitHub Variables หรือ Source Code
การมี Private SSH Key อยู่บน Runner เป็นความเสี่ยงที่ต้องคุมสิทธิ์, network ACL, backup และ physical access ให้เหมาะสม
ถ้าใช้ Node.js ที่ aaPanel ติดตั้งใน path เฉพาะ ให้ตรวจ bin path ของ node/npm/pm2 แล้วกำหนด DEPLOY_NODE_BIN_DIR ให้ตรง

## 5. การทำงานของ Auto Deploy

Workflow: [.github/workflows/deploy-lan.yml](../../.github/workflows/deploy-lan.yml)

1. Push ไป main -> Existing CI รันบน GitHub-hosted Ubuntu
2. เมื่อ CI สำเร็จ และเป็น Push ของ Repository นี้ไป main (ไม่ใช่ PR/Fork/Manual CI) จึงสามารถ Queue Deploy
3. หาก Repo ยัง Public งาน Deploy ถูก Skip
4. Self-hosted Runner ตรวจ SHA ว่าตรงกับ CI และ main ล่าสุดผ่าน GitHub API ด้วย GITHUB_TOKEN ชั่วคราวที่มี contents:read (ไม่ Persist Credentials) เพื่อไม่ Deploy ผล CI ที่เก่าแล้ว
5. ส่ง Git archive ของ Commit ที่ผ่าน CI ไปยัง Server ผ่าน SSH ภายใน LAN (Server ไม่ต้อง Git Pull หรือออก Internet)
6. เตรียม Release ใหม่; Link .env/data/backups จาก shared; Backup SQLite แบบ online
7. npm ci -> test:vps -> npm run build
8. ย้าย symlink current แบบ atomic, pm2 startOrRestart, ตรวจสถานะ Process/Working Directory และ GET /api/health
9. หากไม่ผ่านภายในรอบที่กำหนด ให้คืน current ไปยัง Release ก่อนหน้าและ Restart PM2
10. หากสำเร็จให้ pm2 save และบันทึก SHA ของ Release ที่ใช้งาน

**ข้อจำกัด:** PM2 ใช้ Fork Mode หนึ่ง Instance จึงอาจสะดุดสั้น ๆ ระหว่าง Restart ไม่รับประกัน Zero Downtime
Auto Rollback ย้อนเฉพาะแอป ไม่ย้อน SQLite Migration หรือข้อมูลที่ถูกแก้ระหว่าง Deploy
Release เก่าไม่ถูกลบอัตโนมัติ ผู้ดูแลต้องตรวจ Disk/Retention เอง
เมื่อ Deploy ไม่ผ่านให้ดู Actions Logs และ PM2 Logs รวมถึงตรวจ Data/DB ก่อน Retry

## 6. ทดสอบและแก้ปัญหา

ทดสอบโดยไม่ต่อ Production ใน CI หรือเครื่องพัฒนา:

~~~bash
node --test tests/deploy-lan.test.mjs
npm run test:vps
~~~

สถานะที่พบได้:
- Workflow Skipped: Repository ยัง Public, CI ไม่ผ่าน หรือ Run ไม่ใช่ Push ที่ main
- Workflow Queued: Runner Group/Label/Environment ยังไม่ตรง หรือ Runner Offline
- SSH host key error: known_hosts ไม่ตรงกับ Server; ตรวจ Fingerprint ห้ามปิด Verification
- Missing Node/PM2: แก้ DEPLOY_NODE_BIN_DIR หรือสิทธิ์ User ที่รัน PM2
- Flat installation refused: ต้อง Migrate ตามหัวข้อ 3 ก่อน
- Health check failed: ตรวจ pm2 logs relaydesk, HTTPS proxy, APP_URL และ Database; Script พยายาม Rollback แอป

ตั้ง Branch Protection และ Production Environment ให้ครบก่อน Merge PR นี้
การ Commit Workflow อย่างเดียว **ยังไม่ใช่การติดตั้ง Runner หรือ Deploy ขึ้น Server จริง**
