import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { hashPassword } from '../lib/auth-core.mjs';

// ใช้ Playwright ที่ติดตั้งไว้ หรือระบุแพ็กเกจจาก runtime ภายนอก โดยไม่เพิ่ม dependency ของแอป
const { chromium } = await import(process.env.PLAYWRIGHT_PACKAGE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_PACKAGE_PATH).href : 'playwright');
const directory = mkdtempSync(join(tmpdir(), 'relaydesk-ui-'));
const base = 'http://127.0.0.1:3318';
const origin = 'https://relaydesk-ui.example.test';
const password = 'ui-test-only-password-1234';
const env = { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3318', APP_URL: origin, ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD_HASH: await hashPassword(password), SESSION_SECRET: randomBytes(32).toString('base64'), TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DATABASE_PATH: join(directory, 'database.sqlite') };
const child = spawn(process.execPath, ['scripts/start-production.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser;
child.stdout.on('data', x => { logs += x; });
child.stderr.on('data', x => { logs += x; });
try {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(base + '/api/health')).ok) break; } catch {}
    if (i === 149) throw new Error('Server timeout: ' + logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // จำลอง reverse proxy เฉพาะการทดสอบ โดยใช้ HTTPS origin ของแอปและคง Secure cookie
  await page.context().route(base + '/**', async route => {
    const headers = { ...route.request().headers() };
    if (headers.origin) headers.origin = origin;
    const response = await route.fetch({ headers, maxRedirects: 0 });
    const responseHeaders = response.headers();
    if (responseHeaders.location) responseHeaders.location = responseHeaders.location.replace(origin, base);
    await route.fulfill({ response, headers: responseHeaders });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/login');
  await page.getByRole('heading', { name: 'เข้าสู่พื้นที่ทำงาน' }).waitFor();
  await page.screenshot({ path: join(directory, 'login-desktop.png'), fullPage: true });
  await page.getByRole('textbox', { name: 'อีเมลผู้ดูแล' }).fill(env.ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'แสดงรหัสผ่าน', exact: true }).click();
  assert.equal(await page.locator('input[name="password"]').getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'ซ่อนรหัสผ่าน', exact: true }).click();
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.getByRole('heading', { name: 'ภาพรวม', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'พื้นที่ทำงานสำหรับทุกเส้นทางอีเมล' }).waitFor();
  await page.screenshot({ path: join(directory, 'overview-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'กลุ่มผู้ใช้', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'ชื่อ', exact: true }).fill('กลุ่มทดสอบการใช้งานจริง');
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(directory, 'catalog-modal-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('กลุ่มทดสอบการใช้งานจริง', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'กลุ่มผู้ใช้', exact: true }).click();
  await page.getByText('กลุ่มทดสอบการใช้งานจริง', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'แก้ไข กลุ่มทดสอบการใช้งานจริง', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'ชื่อ', exact: true }).fill('Admin');
  await dialog.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByRole('textbox', { name: 'ชื่อ', exact: true }).inputValue(), 'Admin');
  await dialog.getByRole('textbox', { name: 'ชื่อ', exact: true }).fill('กลุ่มที่แก้ไขแล้ว');
  await dialog.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('กลุ่มที่แก้ไขแล้ว', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'ลบ กลุ่มที่แก้ไขแล้ว', exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  assert.equal(await confirmation.getByRole('button', { name: 'ลบรายการ', exact: true }).isDisabled(), true);
  await confirmation.getByRole('textbox').fill('กลุ่มที่แก้ไขแล้ว');
  await confirmation.getByRole('button', { name: 'ลบรายการ', exact: true }).click();
  await confirmation.waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('กลุ่มที่แก้ไขแล้ว', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'ชื่อ', exact: true }).fill('ร่างที่ต้องเก็บไว้');
  page.once('dialog', d => d.dismiss());
  await page.keyboard.press('Escape');
  assert.equal(await dialog.getByRole('textbox', { name: 'ชื่อ', exact: true }).inputValue(), 'ร่างที่ต้องเก็บไว้');
  page.once('dialog', d => d.accept());
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  // Dialog exit animations can finish after the element becomes hidden.
  // Wait for focus restoration instead of asserting in the same event loop tick.
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(
    button => button.textContent?.trim() === 'เพิ่มรายการ' && button === document.activeElement
  ), null, { timeout: 3000 });
  await page.getByRole('button', { name: 'การเชื่อมต่อ', exact: true }).click();
  await page.getByRole('heading', { name: 'Cloudflare API', exact: true }).waitFor();
  await page.screenshot({ path: join(directory, 'settings-desktop.png'), fullPage: true });
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(directory, `settings-${width}.png`), fullPage: true });
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(dimensions.scroll <= dimensions.client + 1, JSON.stringify({ width, ...dimensions }));
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.getByRole('heading', { name: 'ภาพรวม', exact: true }).waitFor();
  await page.screenshot({ path: join(directory, 'overview-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'กลุ่มผู้ใช้', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'กลุ่มผู้ใช้', exact: true }).first().waitFor();
  // ข้อมูล Cloudflare ส่วนนี้เป็น fixture สำหรับตรวจ UI เท่านั้น ไม่เขียนข้อมูลบัญชีจริง
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await page.evaluate(async () => (await fetch('/api/state')).json());
  const zoneA = 'a'.repeat(32), zoneB = 'b'.repeat(32), account = 'c'.repeat(32);
  const zones = [{ id: zoneA, name: 'example.com', account: { id: account } }, { id: zoneB, name: 'second.example.com', account: { id: account } }];
  const addresses = [{ id: 'd'.repeat(32), email: 'destination@example.com', verified: '2026-10-14T00:00:00Z' }];
  let zoneReads = 0, lastMutation;
  const part = data => ({ data, error: null });
  await page.route(base + '/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let data;
    if (path === '/api/state') data = { ...state, connection: { account, updated: new Date().toISOString() } };
    else if (path === '/api/zones') data = zones;
    else if (path === '/api/destinations') data = addresses;
    else if (path === '/api/zone') {
      zoneReads++;
      const zone = zones.find(z => z.id === url.searchParams.get('zone'));
      if (zone.id === zoneB) await new Promise(resolve => setTimeout(resolve, 400));
      data = { zone, rules: part([{ id: 'e'.repeat(32), name: `กฎของ ${zone.name} สำหรับชื่อภาษาไทยที่ยาวเพื่อทดสอบการแสดงผล`, enabled: true, priority: 50, fingerprint: 'rule-fingerprint', matchers: [{ type: 'literal', value: 'very-long-email-address-for-responsive-layout@' + zone.name }], actions: [{ type: 'forward', value: [addresses[0].email] }] }]), settings: part({ enabled: true, status: 'ready', support_subaddress: false }), dns: part([]), dnsRecords: part([]), catchall: part({ id: 'f'.repeat(32), name: 'Catch-all', enabled: false, fingerprint: 'catch-fingerprint', matchers: [{ type: 'all' }], actions: [{ type: 'forward', value: [addresses[0].email] }] }), destinations: part(addresses), annotations: {}, loadedAt: new Date().toISOString() };
    } else if (path === '/api/rule') { lastMutation = route.request().postDataJSON(); data = { result: {} }; }
    else if (path === '/api/annotations') { lastMutation = route.request().postDataJSON(); data = { result: {} }; }
    else return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Email Routing', exact: true }).click();
  await page.getByText(/กฎของ example.com สำหรับ/).waitFor();
  const beforeRefresh = zoneReads;
  await page.getByRole('button', { name: 'รีเฟรช', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('button[disabled] svg.lucide-refresh-cw'));
  assert.ok(zoneReads > beforeRefresh);
  await page.getByRole('button', { name: 'ตั้งค่า Catch-all', exact: true }).click();
  await dialog.getByRole('button', { name: 'บันทึกกฎ', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(lastMutation.action, 'catchall');
  assert.equal(lastMutation.fingerprint, 'catch-fingerprint');
  await page.getByRole('button', { name: 'แก้ไขกฎ', exact: true }).click();
  await dialog.getByRole('button', { name: 'บันทึกกฎ', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(lastMutation.data, { platforms: [], groups: [], priority: '', note: '' });
  await page.screenshot({ path: join(directory, 'routing-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(directory, 'routing-mobile.png'), fullPage: true });
  const mobile = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(mobile.scroll <= mobile.client + 1, JSON.stringify(mobile));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'การเชื่อมต่อ', exact: true }).click();
  await page.getByRole('combobox', { name: 'เลือกโดเมน', exact: true }).click();
  await page.getByRole('option', { name: 'second.example.com', exact: true }).click();
  await page.getByRole('button', { name: 'Email Routing', exact: true }).click();
  assert.equal(await page.getByText(/กฎของ example.com สำหรับ/).count(), 0);
  await page.getByText(/กฎของ second.example.com สำหรับ/).waitFor();
  await page.unroute(base + '/api/**');
  await page.goto(base + '/logout');
  await page.getByRole('heading', { name: 'ออกจากระบบ Relaydesk', exact: true }).waitFor();
  await page.screenshot({ path: join(directory, 'logout-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'ยืนยันออกจากระบบ', exact: true }).click();
  await page.getByRole('heading', { name: 'เข้าสู่พื้นที่ทำงาน', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(base + '/login?error=rate_limit');
  await page.getByText('พยายามเข้าสู่ระบบถี่เกินไป กรุณารอ 15 นาทีแล้วลองใหม่', { exact: true }).waitFor();
  await page.screenshot({ path: join(directory, 'login-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('UI smoke passed: login, password visibility, real SQLite CRUD, validation recovery, confirmation, Escape/focus, responsive widths, reduced motion.');
  console.log('Screenshots: ' + directory);
  console.log('Cloudflare UI fixtures passed: refresh, Catch-all fingerprint, empty annotations, mobile rule cards, domain switch. External Cloudflare persistence is not verified.');
} finally {
  await browser?.close();
  if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
}
