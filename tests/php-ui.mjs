import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_PACKAGE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_PACKAGE_PATH).href : 'playwright');
const base=process.env.APP_URL, artifacts=process.env.TEST_ARTIFACT_DIR;
if(process.env.APP_ENV!=='test'||!process.env.DB_NAME?.startsWith('relaydesk_test_')||!artifacts) throw new Error('Run through php tests/php-suite.php --ui on an isolated test database');
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||chromium.executablePath()});
const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
const nav=name=>page.getByRole('navigation').getByRole('button',{name,exact:true});
const modal=page.locator('#modal');
const confirmation=page.locator('#confirmation');
const save=()=>modal.getByRole('button',{name:'บันทึก',exact:true}).click();
const screenshot=name=>page.screenshot({path:join(artifacts,name+'.png'),fullPage:true});
try {
  await page.goto(base+'/login');await page.getByRole('heading',{name:'เข้าสู่พื้นที่ทำงาน'}).waitFor();await screenshot('login-desktop');
  await page.getByRole('textbox',{name:'อีเมลผู้ดูแล'}).fill(process.env.ADMIN_EMAIL);
  await page.locator('input[name=password]').fill('test-only-password-1234');
  await page.getByRole('button',{name:'แสดงรหัสผ่าน',exact:true}).click();check(await page.locator('input[name=password]').getAttribute('type')==='text','show password');await page.getByRole('button',{name:'ซ่อนรหัสผ่าน',exact:true}).click();
  await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.getByRole('heading',{name:'พื้นที่ทำงานสำหรับทุกเส้นทางอีเมล'}).waitFor();await screenshot('overview-desktop');check(await nav('ภาพรวม').getAttribute('aria-current')==='page','selected navigation');
  await page.evaluate(()=>{document.body.tabIndex=-1;document.body.focus();});await page.keyboard.press('Tab');check(await page.locator('.skip-link').evaluate(el=>el===document.activeElement&&getComputedStyle(el).opacity==='1'),'keyboard skip link');await page.keyboard.press('Enter');check(await page.locator('#workspace-main').evaluate(el=>el===document.activeElement),'skip link reaches main');
  for(const name of ['Email Routing','อีเมลปลายทาง','Platforms','Priority','ประวัติการทำงาน','การเชื่อมต่อ','กลุ่มผู้ใช้']) { await nav(name).click();check(await page.locator('#page-title').textContent()===name,'page '+name); }
  await page.getByRole('button',{name:'เพิ่มรายการ',exact:true}).click();await modal.getByRole('textbox',{name:'ชื่อ',exact:true}).fill('กลุ่มทดสอบจริง');await screenshot('catalog-modal-desktop');await save();await modal.waitFor({state:'hidden'});await page.getByText('กลุ่มทดสอบจริง',{exact:true}).waitFor();
  await page.reload();await nav('กลุ่มผู้ใช้').click();await page.getByText('กลุ่มทดสอบจริง',{exact:true}).waitFor();check(true,'catalog persisted after reload');
  await page.getByRole('button',{name:'แก้ไข กลุ่มทดสอบจริง',exact:true}).click();await modal.getByRole('textbox',{name:'ชื่อ',exact:true}).fill('Admin');await save();await modal.getByRole('alert').waitFor();check(await modal.getByRole('textbox',{name:'ชื่อ',exact:true}).inputValue()==='Admin','draft after duplicate validation');await modal.getByRole('textbox',{name:'ชื่อ',exact:true}).fill('กลุ่มแก้ไขแล้ว');await save();await modal.waitFor({state:'hidden'});await page.getByText('กลุ่มแก้ไขแล้ว',{exact:true}).waitFor();
  await page.getByRole('button',{name:'ลบ กลุ่มแก้ไขแล้ว',exact:true}).click();check(await confirmation.getByRole('button',{name:'ลบรายการ'}).isDisabled(),'delete confirmation locked');await confirmation.getByRole('textbox').fill('กลุ่มแก้ไขแล้ว');await confirmation.getByRole('button',{name:'ลบรายการ'}).click();await confirmation.waitFor({state:'hidden'});check(await page.locator('#catalog-items').getByText('กลุ่มแก้ไขแล้ว',{exact:true}).count()===0,'catalog deleted');
  await page.getByRole('button',{name:'เพิ่มรายการ',exact:true}).click();await modal.getByRole('textbox',{name:'ชื่อ',exact:true}).fill('ร่างยังไม่บันทึก');page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');check(await modal.getByRole('textbox',{name:'ชื่อ',exact:true}).inputValue()==='ร่างยังไม่บันทึก','discard rejected preserves draft');page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});check(await page.getByRole('button',{name:'เพิ่มรายการ',exact:true}).evaluate(el=>el===document.activeElement),'modal restores focus');
  await nav('การเชื่อมต่อ').click();
  await page.route('**/api/connection',route=>route.fulfill({status:503,json:{error:'fixture failure'}}));
  await page.locator('#connection-form [name=account]').fill('a'.repeat(32));await page.locator('#connection-form [name=token]').fill('fixture-only-token-1234567890');await page.locator('#connection-form [type=submit]').click();await page.getByRole('alert').filter({hasText:'fixture failure'}).waitFor();check(await page.locator('#connection-form [name=token]').inputValue()==='fixture-only-token-1234567890','connection failure keeps token draft in memory');check(await page.evaluate(()=>localStorage.length)===0,'no localStorage token');
  // Remote-only UI responses are fixtures; catalog CRUD above uses real PHP/MySQL.
  const zone='b'.repeat(32), ruleId='c'.repeat(32), addressId='d'.repeat(32), account='a'.repeat(32);
  let rules=[{id:ruleId,name:'Fixture rule',enabled:true,priority:0,source:'api',matchers:[{type:'literal',field:'to',value:'a@example.com'}],actions:[{type:'forward',value:['dest@example.net']}],fingerprint:'fixture-fingerprint'}];
  let destinations=[{id:addressId,email:'dest@example.net',verified:'2026-10-14',created:'2026-10-14'}], annotations={}, writes=[];
  const wrapped=data=>({data,error:null});
  const zonePayload=()=>({zone:{id:zone,name:'example.com',account:{id:account}},rules:wrapped(rules),catchall:wrapped({...rules[0],id:ruleId,name:'Catch-all',matchers:[{type:'all'}]}),settings:wrapped({enabled:true,status:'ready',support_subaddress:true}),dns:wrapped([{type:'MX',content:'route.mx.cloudflare.net'}]),dnsRecords:wrapped([[],[]]),destinations:wrapped(destinations),annotations,loadedAt:'2026-10-14T12:00:00Z'});
  await page.route('**/api/state',async route=>{const response=await route.fetch();const value=await response.json();await route.fulfill({response,json:{...value,connection:{account,updated:'2026-10-14T12:00:00Z'}}});});
  await page.route('**/api/zones',route=>route.fulfill({json:[{id:zone,name:'example.com'}]}));
  await page.route('**/api/destinations',route=>route.fulfill({json:destinations}));
  await page.route('**/api/zone?*',route=>route.fulfill({json:zonePayload()}));
  for(const path of ['rule','destination','annotations','settings','disconnect']) await page.route('**/api/'+path,async route=>{
    const data=route.request().postDataJSON();writes.push({path,data});
    if(path==='rule'&&data.action==='create')rules.push({id:'e'.repeat(32),name:data.rule.name,enabled:data.rule.enabled,priority:data.rule.priority,source:'api',matchers:[{type:'literal',field:'to',value:data.rule.email}],actions:[{type:data.rule.type,value:[data.rule.target]}],fingerprint:'new-fingerprint'});
    if(path==='rule'&&data.action==='update')rules=rules.map(rule=>rule.id===data.id?{...rule,name:data.rule.name}:rule);
    if(path==='rule'&&data.action==='delete')rules=rules.filter(rule=>rule.id!==data.id);
    if(path==='annotations')for(const id of data.rules)annotations[id]=data.data;
    if(path==='destination'&&data.action==='create')destinations.push({id:'f'.repeat(32),email:data.email,verified:null});
    if(path==='destination'&&data.action==='delete')destinations=destinations.filter(d=>d.id!==data.id);
    await route.fulfill({json:{result:{ok:true}}});
  });
  await page.reload();await nav('Email Routing').click();await page.getByText('Fixture rule',{exact:true}).waitFor();await screenshot('routing-desktop');
  const filter=page.getByRole('button',{name:'สถานะกฎ',exact:true});await filter.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Enter');check(await page.getByText('Fixture rule',{exact:true}).count()===0,'picker keyboard filter');await filter.click();await page.getByRole('option',{name:'ทุกสถานะ',exact:true}).click();
  await page.getByRole('button',{name:'เพิ่มกฎ',exact:true}).click();await modal.getByRole('textbox',{name:'ชื่อกฎ'}).fill('Created rule');await modal.getByRole('textbox',{name:'อีเมลต้นทาง'}).fill('new@example.com');await modal.getByRole('button',{name:'อีเมลปลายทาง',exact:true}).click();await modal.getByRole('option',{name:'dest@example.net',exact:true}).click();await save();await modal.waitFor({state:'hidden'});await page.getByText('Created rule',{exact:true}).waitFor();check(writes.at(-1).data.rule.target==='dest@example.net','create rule payload');
  await page.getByRole('textbox',{name:'ค้นหาอีเมล',exact:true}).fill('Created');await page.getByRole('button',{name:'แก้ไขกฎ',exact:true}).click();await modal.getByRole('textbox',{name:'ชื่อกฎ'}).fill('Created updated');await save();await modal.waitFor({state:'hidden'});check(await page.getByRole('textbox',{name:'ค้นหาอีเมล',exact:true}).inputValue()==='Created','search preserved after save');check(writes.at(-1).data.fingerprint==='new-fingerprint','edit includes fingerprint');
  await page.getByRole('textbox',{name:'ค้นหาอีเมล',exact:true}).fill('');await page.getByRole('checkbox',{name:'เลือกทั้งหมด',exact:true}).check();await page.getByRole('button',{name:'จัดหมวดหมู่ 2 รายการ',exact:true}).click();await modal.getByRole('checkbox',{name:'Admin',exact:true}).check();await modal.getByRole('textbox',{name:'หมายเหตุ'}).fill('หมายเหตุรวม');await save();await modal.waitFor({state:'hidden'});check(writes.at(-1).data.rules.length===2,'bulk annotations');
  await page.getByRole('button',{name:'ตั้งค่า Catch-all',exact:true}).click();await modal.getByRole('button',{name:'วิธีจัดการ',exact:true}).click();await modal.getByRole('option',{name:'Drop — ไม่รับอีเมล',exact:true}).click();await save();await modal.waitFor({state:'hidden'});check(writes.at(-1).data.action==='catchall'&&writes.at(-1).data.rule.type==='drop','catch-all drop');
  await page.getByRole('textbox',{name:'ค้นหาอีเมล',exact:true}).fill('Created');await page.getByRole('button',{name:'ลบกฎ',exact:true}).click();await confirmation.getByRole('textbox').fill('new@example.com');await confirmation.getByRole('button',{name:'ลบกฎ',exact:true}).click();await confirmation.waitFor({state:'hidden'});check(writes.at(-1).data.action==='delete','delete rule');
  await nav('อีเมลปลายทาง').click();await page.getByRole('button',{name:'เพิ่มอีเมลปลายทาง',exact:true}).click();await modal.getByRole('textbox',{name:'อีเมลปลายทาง',exact:true}).fill('pending@example.net');await save();await modal.waitFor({state:'hidden'});await page.getByText('รอยืนยัน',{exact:true}).waitFor();await page.getByRole('button',{name:'ลบปลายทาง pending@example.net',exact:true}).click();await confirmation.getByRole('textbox').fill('pending@example.net');await confirmation.getByRole('button',{name:'ลบปลายทาง',exact:true}).click();await confirmation.waitFor({state:'hidden'});check(writes.at(-1).data.action==='delete','destination modal create/delete');
  await nav('การเชื่อมต่อ').click();await page.getByRole('button',{name:'เปิด Email Routing',exact:true}).click();await confirmation.getByRole('textbox').fill('example.com');await confirmation.getByRole('button',{name:'ยืนยัน',exact:true}).click();await confirmation.waitFor({state:'hidden'});check(writes.at(-1).data.action==='enable','settings domain confirmation');
  for(const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:900});
    for(const name of ['ภาพรวม','Email Routing','การเชื่อมต่อ','กลุ่มผู้ใช้']) {await nav(name).click();const d=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));check(d.scroll<=d.client+1,`${name} overflow at ${width}: ${JSON.stringify(d)}`);}
    await screenshot('groups-'+width);
    await page.getByRole('button',{name:'เพิ่มรายการ',exact:true}).click();await modal.getByRole('textbox',{name:'ชื่อ',exact:true}).fill('ทดสอบ modal บนหน้าจอแคบ');await screenshot('modal-'+width);const rect=await modal.boundingBox();check(rect.width<=width&&rect.x>=0,`modal fits ${width}`);page.once('dialog',d=>d.accept());await modal.getByRole('button',{name:'ยกเลิก',exact:true}).click();await modal.waitFor({state:'hidden'});
  }
  await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.btn').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<0.01),'reduced motion');
  await nav('ประวัติการทำงาน').click();const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'ดาวน์โหลด JSON',exact:true}).click()]);check(download.suggestedFilename()==='relaydesk-audit.json','audit JSON export');
  await page.getByRole('link',{name:'ออกจากระบบ',exact:true}).click();await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();await page.getByRole('heading',{name:'เข้าสู่พื้นที่ทำงาน'}).waitFor();check(true,'browser logout');check(errors.length===0,'no browser errors: '+errors.join(';'));
  await writeFile(join(artifacts,'ui-result.json'),JSON.stringify({status:'passed',checks,errors,cloudflare:'browser fixtures; catalog/auth use real PHP/MySQL'},null,2));console.log(`Browser suite passed: ${checks} checks`);
} catch(error) {
  await screenshot('failure');
  await writeFile(join(artifacts,'ui-failure.json'),JSON.stringify({url:page.url(),errors,text:(await page.locator('body').innerText()).slice(0,3000)},null,2));
  throw error;
} finally { await browser.close(); }
