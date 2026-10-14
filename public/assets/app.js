'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone = value => structuredClone(value);
  const blank = () => ({ platforms: [], groups: [], priority: '', note: '' });
  const labels = {overview:'ภาพรวม',routing:'Email Routing',destinations:'อีเมลปลายทาง',platforms:'Platforms',groups:'กลุ่มผู้ใช้',priorities:'Priority',activity:'ประวัติการทำงาน',settings:'การเชื่อมต่อ'};
  const descriptions = {overview:'ตรวจสถานะและเลือกงานที่ต้องทำต่อ',routing:'จัดระเบียบทุกอีเมล ทุกแพลตฟอร์ม ในที่เดียว',destinations:'จัดการและยืนยันอีเมลปลายทางของบัญชี Cloudflare',platforms:'ป้ายกำกับพร้อมโลโก้ แยกการใช้อีเมลตามบริการ',groups:'จัดกลุ่มผู้ใช้งานแยกจากสิทธิ์ในระบบ',priorities:'ลำดับความสำคัญสำหรับจัดระเบียบใน Workspace',activity:'ประวัติการเปลี่ยนแปลงของบัญชีที่เข้าสู่ระบบ',settings:'จัดการ Workspace Email Routing'};
  const icons = {overview:'grid',routing:'mail',destinations:'users',platforms:'tag',groups:'users',priorities:'layers',activity:'clock',settings:'settings'};
  const svgPaths = {grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',mail:'M3 5h18v14H3z M3 5l9 7 9-7',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M22 21v-2a4 4 0 0 0-3-3.87',tag:'M20 13l-7 7L3 10V3h7z M7 7h.01',layers:'M12 3l10 6-10 6L2 9z M2 13l10 6 10-6 M2 17l10 6 10-6',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',arrow:'M5 12h14 M13 6l6 6-6 6',cloud:'M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-1 5 5 0 0 1 0 9z'};
  const icon = name => `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${svgPaths[name] || svgPaths.mail}"/></svg>`;
  const state = {page:'overview',connection:null,connectionDraft:null,catalog:null,revision:0,zones:[],zone:'',zoneData:null,destinations:[],audit:[],selected:new Set(),search:'',filter:'all',catalogSearch:'',loading:true,busy:false,error:'',notice:'',generation:0};
  let opener = null, modalDirty = false, modalBusy = false, modalSave = null, confirmRun = null, pickerId = 0;
  const content = $('#page-content'), modal = $('#modal'), confirmation = $('#confirmation');
  const fmt = value => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short'}).format(date); };
  const button = (text, action, style = 'outline', extra = '') => `<button type="button" class="btn ${style}" data-action="${action}" ${extra}>${text}</button>`;
  const navigate = (page, focus = true) => { state.page = page; render(); if (focus) $('#workspace-main').focus(); };
  const chip = item => `<span class="chip" style="color:${/^#[a-f0-9]{6}$/i.test(item.color) ? item.color : 'var(--foreground)'}">${item.logo ? `<img src="${esc(item.logo)}" alt="" loading="lazy">` : ''}${esc(item.name)}</span>`;
  const chips = (kind, ids) => ids.map(id => state.catalog[kind].find(item => item.id === id)).filter(Boolean).map(chip).join('');
  const picker = (label, value, options, name = '', disabled = false) => {
    const id = `picker-${++pickerId}`;
    const selected = options.find(o => o.value === value);
    return `<div class="picker" data-picker="${esc(name)}"><input type="hidden" name="${esc(name)}" value="${esc(value)}"><button type="button" class="picker-trigger" aria-label="${esc(label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}" ${disabled?'disabled':''}><span>${esc(selected?.label || label)}</span><span class="picker-chevron" aria-hidden="true">⌄</span></button><div role="listbox" aria-label="${esc(label)}" class="picker-menu" id="${id}" hidden>${options.map(o=>`<button type="button" class="picker-option" role="option" aria-selected="${o.value===value}" data-value="${esc(o.value)}" tabindex="-1">${esc(o.label)}</button>`).join('')}</div></div>`;
  };
  function closePickers(except) { document.querySelectorAll('.picker-menu:not([hidden])').forEach(menu => { if (menu !== except) { menu.hidden=true; menu.previousElementSibling.setAttribute('aria-expanded','false'); } }); }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('.picker-trigger');
    if (trigger) { const menu=trigger.nextElementSibling, open=menu.hidden; closePickers(menu); menu.hidden=!open; trigger.setAttribute('aria-expanded',String(open)); if(open) (menu.querySelector('[aria-selected="true"]') || menu.firstElementChild)?.focus(); return; }
    const option=event.target.closest('.picker-option');
    if(option) { const wrapper=option.closest('.picker'); wrapper.querySelector('input').value=option.dataset.value; wrapper.querySelector('.picker-trigger>span').textContent=option.textContent; wrapper.querySelectorAll('[role=option]').forEach(o=>o.setAttribute('aria-selected',String(o===option))); closePickers(); wrapper.querySelector('.picker-trigger').focus(); wrapper.dispatchEvent(new Event('change',{bubbles:true})); return; }
    if(!event.target.closest('.picker')) closePickers();
    const action=event.target.closest('[data-action]'); if(action) dispatch(action.dataset.action, action);
    const nav=event.target.closest('[data-page]'); if(nav) navigate(nav.dataset.page);
    const img=event.target.closest('[data-before]'); if(img) download(JSON.parse(state.audit.find(row=>row.id===img.dataset.before).before),`relaydesk-before-${img.dataset.before}.json`);
  });
  let typeahead='', typeTime=0;
  document.addEventListener('keydown', event => {
    const wrapper=event.target.closest('.picker'); if(!wrapper) return;
    const trigger=wrapper.querySelector('.picker-trigger'), menu=wrapper.querySelector('.picker-menu'), options=[...menu.children];
    if(event.target===trigger && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); closePickers(menu); menu.hidden=false; trigger.setAttribute('aria-expanded','true'); (event.key==='End'?options.at(-1):options[0])?.focus(); return; }
    if(menu.hidden) return;
    const index=options.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End','Escape'].includes(event.key)) { event.preventDefault(); if(event.key==='Escape') { event.stopPropagation(); closePickers(); trigger.focus(); } else (event.key==='Home'?options[0]:event.key==='End'?options.at(-1):options[(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length])?.focus(); }
    else if(event.key.length===1 && event.key!==' ') { const now=Date.now(); typeahead=now-typeTime>700?event.key:typeahead+event.key; typeTime=now; options.find(o=>o.textContent.toLowerCase().startsWith(typeahead.toLowerCase()))?.focus(); }
    else if(event.key==='Tab') closePickers();
  });
  document.addEventListener('change', event => {
    const wrapper=event.target.closest('[data-picker]'); if(!wrapper) return;
    const value=wrapper.querySelector('input').value;
    if(wrapper.dataset.picker==='zone') { state.zone=value; state.zoneData=null; state.selected.clear(); void loadRemote().catch(showError); }
    if(wrapper.dataset.picker==='status-filter') { state.filter=value; renderRules(); }
    if(wrapper.dataset.picker==='type') { const forward=$('[data-forward]',modal), worker=$('[data-worker]',modal); forward.hidden=value!=='forward'; worker.hidden=value!=='worker'; }
  });
  async function api(path, data) {
    const response = await fetch('/api/'+path,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json','x-relaydesk-request':'1'},...(data===undefined?{}:{body:JSON.stringify(data)})});
    if(response.status===401) { location.assign('/login'); throw new Error('กรุณาเข้าสู่ระบบ'); }
    let result; try { result=await response.json(); } catch { throw new Error('ระบบส่งข้อมูลที่อ่านไม่ได้ กรุณารีเฟรชตรวจสอบก่อนทำซ้ำ'); }
    if(!response.ok) throw new Error(result.error || 'ดำเนินการไม่สำเร็จ'); return result;
  }
  function showError(error) { state.error=error.message || String(error); renderFeedback(); }
  function renderFeedback() { $('#feedback').innerHTML=(state.error?`<div class="error-box feedback-row" role="alert"><span>${esc(state.error)}</span>${button('ปิด','dismiss-error','ghost small')}</div>`:'')+(state.notice?`<div class="success-box feedback-row" role="status"><span>${esc(state.notice)}</span>${button('ปิด','dismiss-notice','ghost small')}</div>`:''); }
  async function refresh() {
    const [data,audit]=await Promise.all([api('state'),api('audit')]); Object.assign(state,{connection:data.connection,catalog:data.catalog,revision:data.revision,audit});
    if(!data.connection) { state.zones=[]; state.zone=''; state.zoneData=null; state.destinations=[]; state.loading=false; render(); return; }
    await loadRemote();
  }
  async function loadRemote() {
    const generation=++state.generation; state.loading=true; render();
    try {
      const results=await Promise.allSettled([api('zones'),api('destinations')]); if(generation!==state.generation) return;
      if(results[0].status==='fulfilled') { state.zones=results[0].value; if(!state.zones.some(z=>z.id===state.zone)) { state.zone=state.zones[0]?.id || ''; state.zoneData=null; state.selected.clear(); } } else showError(results[0].reason);
      if(results[1].status==='fulfilled') state.destinations=results[1].value; else showError(results[1].reason);
      const zone=state.zone;
      if(zone) { const data=await api('zone?zone='+encodeURIComponent(zone)); if(generation!==state.generation || zone!==state.zone) return; state.zoneData=data; if(data.destinations.data) state.destinations=data.destinations.data; state.selected=new Set([...state.selected].filter(id=>(data.rules.data||[]).some(r=>r.id===id))); }
    } finally { if(generation===state.generation) { state.loading=false; render(); } }
  }
  async function mutation(path,data,message) {
    if(state.busy) throw new Error('กำลังดำเนินการ กรุณารอ'); state.busy=true;
    try {
      let result;
      try { result=await api(path,data); } catch(error) { showError(error); throw error; }
      if(path==='connection') state.connectionDraft=null;
      state.notice=result.warning || message; state.error=''; renderFeedback();
      // An acknowledged write must never be submitted again because the subsequent refresh failed.
      try { await refresh(); } catch(error) { state.error='บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ: '+error.message; renderFeedback(); }
      return result;
    } finally { state.busy=false; render(); }
  }
  function download(value,name) { const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function openModal(title,description,html,save) {
    if(modal.open||confirmation.open||state.busy) return;
    opener=document.activeElement; modalDirty=false; modalBusy=false; modalSave=save;
    modal.innerHTML=`${button('×','close-modal','ghost dialog-close','aria-label="ปิดหน้าต่าง"')}<h2 id="modal-title">${esc(title)}</h2><p class="dialog-description" id="modal-description">${esc(description)}</p><form id="modal-form">${html}<div class="modal-error error-box" role="alert"></div><div class="form-actions">${button('ยกเลิก','close-modal','outline')}<button type="submit" class="btn primary">${save?'บันทึก':'ปิด'}</button></div></form>`;
    modal.showModal();
    $('#modal-form',modal).addEventListener('submit',async event=>{
      event.preventDefault(); if(modalBusy) return; if(!modalSave) { closeModal(true); return; }
      const values=Object.fromEntries(new FormData(event.currentTarget)); modalBusy=true; $('.modal-error',modal).textContent=''; setModalBusy(true);
      try { await modalSave(values,event.currentTarget); closeModal(true); } catch(error) { $('.modal-error',modal).textContent=error.message; } finally { modalBusy=false; setModalBusy(false); }
    });
  }
  function setModalBusy(busy) { modal.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=busy); const submit=$('[type=submit]',modal); if(submit) submit.textContent=busy?'กำลังดำเนินการ…':(modalSave?'บันทึก':'ปิด'); }
  function closeModal(force=false) { if(!force&&(modalBusy || (modalDirty&&!window.confirm('มีข้อมูลที่ยังไม่บันทึก ต้องการปิดหน้าต่างหรือไม่?')))) return; closePickers(); modal.close(); opener?.focus(); }
  modal.addEventListener('input',()=>modalDirty=true); modal.addEventListener('change',()=>modalDirty=true);
  modal.addEventListener('cancel',event=>{event.preventDefault(); closeModal();});
  function confirm(title,description,expected,run,label='ยืนยัน') {
    if(confirmation.open||modal.open||state.busy) return; opener=document.activeElement; confirmRun=run;
    confirmation.innerHTML=`<h2 id="confirmation-title">${esc(title)}</h2><p class="dialog-description" id="confirmation-description">${esc(description)}</p><form><label class="field">พิมพ์ <code>${esc(expected)}</code> เพื่อยืนยัน<input name="confirm" autocomplete="off" required></label><p class="modal-error error-box" role="alert"></p><div class="form-actions">${button('ยกเลิก','close-confirm','outline')}<button type="submit" class="btn destructive" disabled>${esc(label)}</button></div></form>`;
    const input=$('input',confirmation), submit=$('[type=submit]',confirmation);
    input.addEventListener('input',()=>submit.disabled=input.value!==expected);
    $('form',confirmation).addEventListener('submit',async event=>{event.preventDefault(); if(state.busy||input.value!==expected||submit.disabled) return; input.disabled=true; submit.disabled=true; $('[data-action=close-confirm]',confirmation).disabled=true; $('.modal-error',confirmation).textContent=''; try { await confirmRun(input.value); confirmation.close(); opener?.focus(); } catch(error) { $('.modal-error',confirmation).textContent=error.message; } finally { input.disabled=false; submit.disabled=input.value!==expected; $('[data-action=close-confirm]',confirmation).disabled=false; } });
    confirmation.showModal();
  }
  confirmation.addEventListener('cancel',event=>{if(state.busy) event.preventDefault();});
  function render() {
    $('#navigation').innerHTML=Object.entries(labels).map(([key,label])=>`<button class="nav-button" data-page="${key}" ${state.page===key?'aria-current="page"':''}>${icon(icons[key])}${label}</button>`).join('');
    $('#page-title').textContent=labels[state.page]; $('#page-description').textContent=descriptions[state.page];
    $('#connection-status').textContent=state.connection?'เชื่อมต่อแล้ว':'ยังไม่เชื่อมต่อ';
    $('#zone-picker').innerHTML=state.connection&&state.zones.length?picker('โดเมน',state.zone,state.zones.map(z=>({value:z.id,label:z.name})),'zone',state.loading||state.busy):'';
    let actions=state.connection?button(icon('clock')+' รีเฟรช','refresh','outline',state.loading||state.busy?'disabled':''):'';
    if(['platforms','groups','priorities'].includes(state.page)) actions+=button('เพิ่มรายการ','add-catalog','primary',state.busy?'disabled':'');
    if(state.page==='routing'&&state.zoneData?.rules.data) actions+=button('เพิ่มกฎ','add-rule','primary',state.busy?'disabled':'');
    if(state.page==='destinations'&&state.connection) actions+=button('เพิ่มอีเมลปลายทาง','add-destination','primary',state.busy?'disabled':'');
    $('#page-actions').innerHTML=actions; content.setAttribute('aria-busy',String(state.loading)); renderFeedback();
    if(!state.catalog) { content.innerHTML=`<section class="glass loading-card">${state.error?'ข้อมูลไม่พร้อม '+button('ลองโหลดใหม่','refresh','outline'):'กำลังโหลดข้อมูล Workspace…'}</section>`; return; }
    const page=state.page;
    if(page==='overview') renderOverview();
    if(page==='routing') renderRouting();
    if(page==='destinations') renderDestinations();
    if(['platforms','groups','priorities'].includes(page)) renderCatalog();
    if(page==='activity') renderAudit();
    if(page==='settings') renderSettings();
    content.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>img.hidden=true,{once:true}));
    if(state.busy) content.querySelectorAll('[data-action]').forEach(el=>el.disabled=true);
  }
  const connectHint = () => `<div class="connect-empty"><div class="connect-symbol">${icon('mail')}</div><h2>เริ่มต้นด้วยบัญชี Cloudflare ของคุณ</h2><p>เชื่อมต่อเพื่อจัดการกฎ Routing อีเมลปลายทาง และ Catch-all<br>พร้อมแท็ก Platform กลุ่มผู้ใช้ และ Priority ที่เพิ่มเองได้</p><button class="btn primary" data-page="settings">ตั้งค่าการเชื่อมต่อ</button><small>Token เข้ารหัสฝั่งเซิร์ฟเวอร์ ไม่เก็บในเบราว์เซอร์</small></div>`;
  function renderOverview() {
    const rules=state.zoneData?.rules.data, verified=state.destinations.filter(a=>a.verified).length, steps=[['เชื่อมต่อ Cloudflare','ตรวจสอบ Account และ API Token',!!state.connection,'settings'],['ยืนยันอีเมลปลายทาง','เลือกกล่องจดหมายที่จะรับอีเมล',!!state.connection&&verified>0,'destinations'],['สร้างเส้นทางอีเมล','กำหนดต้นทางและวิธีส่งต่อ',!!rules?.length,'routing']];
    const metrics=[['กฎ Routing',rules?.length??'—','routing','ตรวจและจัดการเส้นทางอีเมล'],['กฎที่เปิดใช้งาน',rules?.filter(r=>r.enabled).length??'—','routing','สถานะกฎในโดเมนที่เลือก'],['ปลายทางที่ยืนยัน',state.connection?verified:'—','destinations','พร้อมใช้สำหรับรับอีเมล'],['Platform tags',state.catalog.platforms.length,'platforms',`${state.catalog.groups.length} กลุ่มผู้ใช้ใน Workspace`]];
    content.innerHTML=`<section class="overview-hero glass"><div><span class="eyebrow">EMAIL OPERATIONS</span><h2>${state.connection?'ทุกเส้นทางอีเมล อยู่ในมือคุณ':'พื้นที่ทำงานสำหรับทุกเส้นทางอีเมล'}</h2><p>${state.connection?'จัดการ '+esc(state.zones.find(z=>z.id===state.zone)?.name||'โดเมนของคุณ')+' ตรวจสถานะ และจัดหมวดหมู่จากข้อมูลจริง':'เชื่อมต่อบัญชี ยืนยันปลายทาง แล้วเริ่มส่งต่ออีเมลอย่างเป็นระบบ'}</p><button class="btn primary" data-page="${state.connection?'routing':'settings'}">${state.connection?'จัดการ Routing rules':'เชื่อมต่อ Cloudflare'} ${icon('arrow')}</button></div><div class="route-illustration" aria-hidden="true"><span>โดเมนของคุณ</span><i></i><span class="route-hub">Relaydesk</span><i></i><span>กล่องจดหมาย</span></div></section><div class="metrics">${metrics.map(([label,count,page,hint])=>`<button class="glass metric" data-page="${page}"><div class="metric-label">${label}</div><strong>${count}</strong><small>${hint}</small></button>`).join('')}</div><div class="overview-grid"><section class="glass"><div class="panel-head"><div><h2>เริ่มต้นใช้งาน</h2><p class="hint">สามขั้นตอนเพื่อให้พร้อมรับอีเมล</p></div><span class="badge">${steps.filter(s=>s[2]).length} / 3</span></div><ol class="setup-list">${steps.map(([title,detail,done,page],index)=>`<li><span class="step-number ${done?'step-done':''}">${done?'✓':index+1}</span><div><strong>${title}</strong><p>${detail}</p></div><button class="btn ghost" data-page="${page}" aria-label="${title}">${icon('arrow')}</button></li>`).join('')}</ol>${state.zoneData?.settings.data?.enabled===false?'<div class="warning-box">Email Routing ปิดอยู่ <button class="btn ghost" data-page="settings">ตรวจการตั้งค่า</button></div>':''}</section><section class="glass"><div class="panel-head"><div><h2>กิจกรรมล่าสุด</h2><p class="hint">การเปลี่ยนแปลงภายในบัญชีของคุณ</p></div><button class="btn ghost" data-page="activity">ดูทั้งหมด</button></div>${state.audit.length?`<ul class="recent-list">${state.audit.slice(0,4).map(row=>`<li><div><strong>${esc(row.action)}</strong><p>${esc(row.target)}</p><small>${fmt(row.created)}</small></div><span class="hint">${esc(row.outcome)}</span></li>`).join('')}</ul>`:'<div class="empty-table"><strong>พร้อมบันทึกทุกการเปลี่ยนแปลง</strong><span>ประวัติจะแสดงเมื่อคุณเริ่มทำรายการ</span></div>'}</section></div>`;
  }
  function renderRouting() {
    if(!state.connection) { content.innerHTML=`<section class="glass route-panel"><div class="panel-head"><h2>เส้นทางอีเมล</h2><span class="badge">ยังไม่เชื่อมต่อ</span></div>${connectHint()}</section><div class="bottom-grid"><section class="glass catalog-card"><h2>Platform tags</h2>${state.catalog.platforms.map(chip).join('')}</section><section class="glass catalog-card"><h2>กลุ่มผู้ใช้ & Priority</h2>${state.catalog.groups.map(chip).join('')}${state.catalog.priorities.map(chip).join('')}</section></div>`; return; }
    const z=state.zoneData;
    content.innerHTML=`${z?.rules.error?`<div class="error-box">โหลดกฎ Routing ไม่ได้: ${esc(z.rules.error)}</div>`:''}<section class="glass route-panel"><div class="panel-head"><div><h2>Routing rules</h2><p class="hint">ลำดับ Cloudflare แสดงตาม Priority จริง ส่วน Priority ของกลุ่มใช้จัดระเบียบใน Relaydesk</p></div><div class="actions"><span class="badge">Catch-all: ${z?.catchall.data?.enabled?'เปิด':'ปิด'}</span>${button('ตั้งค่า Catch-all','catchall','outline',!z?.catchall.data?'disabled':'')}</div></div><div class="tool-row"><label class="searchbox"><span class="visually-hidden">ค้นหาอีเมล</span><input id="rule-search" aria-label="ค้นหาอีเมล" value="${esc(state.search)}" placeholder="ค้นหาอีเมล Platform กลุ่มผู้ใช้…"></label>${picker('สถานะกฎ',state.filter,[{value:'all',label:'ทุกสถานะ'},{value:'true',label:'เปิดใช้งาน'},{value:'false',label:'ปิดใช้งาน'}],'status-filter')}<span id="bulk-actions"></span></div><div class="rules-scroll"><table class="data-table" aria-label="Routing rules"><thead><tr><th><input type="checkbox" id="select-all" aria-label="เลือกทั้งหมด"></th><th>อีเมล / Routing</th><th>กลุ่มและ Platform</th><th>Priority</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody id="rules-body"></tbody></table></div><div class="table-footer" id="rules-footer"></div></section><section class="glass settings-strip"><div><strong>สถานะ Email Routing</strong><p>${esc(z?.settings.data?.status||z?.settings.error||'กำลังโหลด')} · ${z?.settings.data?.enabled?'เปิดใช้งาน':'ปิดใช้งาน'}</p></div><div class="actions">${button('Plus Addressing: '+(z?.settings.data?.support_subaddress?'เปิด':'ปิด'),'subaddress','outline',!z?.settings.data?'disabled':'')}<button class="btn outline" data-page="settings">ดู DNS & การตั้งค่า</button></div></section>`;
    $('#rule-search').addEventListener('input',event=>{state.search=event.target.value;renderRules();});
    $('#select-all').addEventListener('change',event=>{filteredRules().forEach(rule=>event.target.checked?state.selected.add(rule.id):state.selected.delete(rule.id)); renderRules();});
    renderRules();
  }
  function filteredRules() {
    return (state.zoneData?.rules.data||[]).filter(rule=>{
      const annotation=state.zoneData.annotations[rule.id]||blank();
      const haystack=[rule.name,...rule.matchers.map(m=>m.value||''),...rule.actions.flatMap(a=>a.value||[]),annotation.note,...['platforms','groups'].flatMap(kind=>annotation[kind].map(id=>state.catalog[kind].find(i=>i.id===id)?.name||'')),state.catalog.priorities.find(i=>i.id===annotation.priority)?.name||''].join(' ').toLowerCase();
      return (state.filter==='all'||String(rule.enabled)===state.filter)&&haystack.includes(state.search.toLowerCase());
    });
  }
  function renderRules() {
    const tbody=$('#rules-body'); if(!tbody) return; const rules=filteredRules();
    tbody.innerHTML=rules.map(rule=>{
      const ann=state.zoneData.annotations[rule.id]||blank(), priority=state.catalog.priorities.find(i=>i.id===ann.priority);
      return `<tr><td><input type="checkbox" data-rule-select="${rule.id}" aria-label="เลือก ${esc(rule.matchers[0]?.value||rule.name)}" ${state.selected.has(rule.id)?'checked':''}></td><td><strong>${esc(rule.name||rule.matchers[0]?.value||'(ไม่มีชื่อ)')}</strong><div class="rule-target">${esc(rule.matchers[0]?.value||'Catch-all')} → ${esc(rule.actions.map(a=>a.type==='drop'?'Drop':a.type+': '+(a.value||[]).join(', ')).join('; '))}</div><small>${rule.source==='wrangler'?'Wrangler':'Cloudflare API'} · ลำดับ ${esc(rule.priority??'—')}</small></td><td><div class="chip-list">${chips('platforms',ann.platforms)}${chips('groups',ann.groups)}</div>${!ann.platforms.length&&!ann.groups.length?'<small>ยังไม่จัดหมวด</small>':''}${ann.note?`<small>${esc(ann.note)}</small>`:''}</td><td>${priority?chip(priority):'—'}</td><td><span class="state-pill ${rule.enabled?'state-on':''}"><i></i>${rule.enabled?'เปิด':'ปิด'}</span></td><td><div class="actions">${button('ดู','view-rule','ghost small',`data-id="${rule.id}" aria-label="ดูรายละเอียดกฎ"`)}${button('แก้ไข','edit-rule','ghost small',`data-id="${rule.id}" aria-label="แก้ไขกฎ" ${rule.source==='wrangler'?'disabled':''}`)}${button('จัดหมวด','annotate-rule','ghost small',`data-id="${rule.id}" aria-label="จัดหมวดหมู่"`)}${button('ลบ','delete-rule','destructive small',`data-id="${rule.id}" aria-label="ลบกฎ" ${rule.source==='wrangler'?'disabled':''}`)}</div></td></tr>`;
    }).join('') || `<tr><td colspan="6"><div class="empty-table"><strong>${state.loading?'กำลังโหลดกฎของโดเมน…':state.zoneData?.rules.error?'ข้อมูลกฎยังไม่พร้อม':state.search||state.filter!=='all'?'ไม่พบรายการที่ตรงกับการค้นหา':'ยังไม่มี Routing rules ในโดเมนนี้'}</strong><span>ปรับคำค้นหรือเพิ่มกฎเพื่อเริ่มใช้งาน</span></div></td></tr>`;
    tbody.querySelectorAll('[data-rule-select]').forEach(box=>box.addEventListener('change',()=>{box.checked?state.selected.add(box.dataset.ruleSelect):state.selected.delete(box.dataset.ruleSelect);renderSelection(rules);})); renderSelection(rules);
    $('#rules-footer').textContent=`${rules.length} จาก ${state.zoneData?.rules.data?.length||0} กฎ · โหลดล่าสุด ${fmt(state.zoneData?.loadedAt)}`;
  }
  function renderSelection(rules) { const all=$('#select-all'); all.checked=!!rules.length&&rules.every(r=>state.selected.has(r.id)); all.indeterminate=!all.checked&&rules.some(r=>state.selected.has(r.id)); $('#bulk-actions').innerHTML=state.selected.size?button(`จัดหมวดหมู่ ${state.selected.size} รายการ`,'bulk-annotation','outline'):''; }
  function renderDestinations() {
    content.innerHTML=`<section class="glass route-panel"><div class="panel-head"><div><h2>อีเมลปลายทาง</h2><p class="hint">อีเมลปลายทางใช้ร่วมกันใน Cloudflare Account นี้</p></div><span class="badge">${state.destinations.length} รายการ</span></div>${!state.connection?connectHint():`<div class="rules-scroll"><table class="data-table" aria-label="อีเมลปลายทาง"><thead><tr><th>อีเมล</th><th>สถานะยืนยัน</th><th>สร้างเมื่อ</th><th>จัดการ</th></tr></thead><tbody>${state.destinations.map(a=>`<tr><td>${esc(a.email)}</td><td><span class="state-pill ${a.verified?'state-on':'state-warn'}"><i></i>${a.verified?'ยืนยันแล้ว':'รอยืนยัน'}</span></td><td>${fmt(a.created)}</td><td>${button('ลบ','delete-destination','destructive small',`data-id="${esc(a.id)}" aria-label="ลบปลายทาง ${esc(a.email)}"`)}</td></tr>`).join('')||'<tr><td colspan="4"><div class="empty-table"><strong>ยังไม่มีอีเมลปลายทาง</strong><span>เพิ่มแล้วทำขั้นตอนยืนยันผ่านอีเมล</span></div></td></tr>'}</tbody></table></div>`}</section>`;
  }
  function renderCatalog() {
    content.innerHTML=`<section class="glass tool-row"><label class="searchbox"><span class="visually-hidden">ค้นหารายการ</span><input id="catalog-search" aria-label="ค้นหารายการ" placeholder="ค้นหาชื่อ…" value="${esc(state.catalogSearch)}"></label><span class="hint">กลุ่มผู้ใช้เป็นหมวดหมู่ ไม่ใช่สิทธิ์ในระบบ</span></section><div id="catalog-items" class="data-grid"></div>`;
    $('#catalog-search').addEventListener('input',event=>{state.catalogSearch=event.target.value;renderCatalogItems();}); renderCatalogItems();
  }
  function renderCatalogItems() { const items=state.catalog[state.page].filter(i=>i.name.toLowerCase().includes(state.catalogSearch.toLowerCase())).sort((a,b)=>a.rank-b.rank); $('#catalog-items').innerHTML=items.map(item=>`<section class="glass catalog-card"><h2>${chip(item)}</h2><p class="hint">ลำดับ ${item.rank} · ID ${esc(item.id)}</p><div class="actions">${button('ดูรายละเอียด','view-catalog','ghost small',`data-id="${esc(item.id)}"`)}${button('แก้ไข','edit-catalog','outline small',`data-id="${esc(item.id)}" aria-label="แก้ไข ${esc(item.name)}"`)}${button('ลบ','delete-catalog','destructive small',`data-id="${esc(item.id)}" aria-label="ลบ ${esc(item.name)}"`)}</div></section>`).join('')||'<div class="glass empty-table"><strong>ไม่พบรายการ</strong><span>เพิ่มรายการหรือปรับคำค้น</span></div>'; }
  function renderAudit() { content.innerHTML=`<section class="glass route-panel"><div class="panel-head"><div><h2>ประวัติการทำงาน</h2><p class="hint">แสดงรายการของบัญชีที่เข้าสู่ระบบนี้เท่านั้น</p></div>${button('ดาวน์โหลด JSON','export-audit','outline',!state.audit.length?'disabled':'')}</div><div class="rules-scroll"><table class="data-table" aria-label="ประวัติการทำงาน"><thead><tr><th>เวลา</th><th>การทำงาน</th><th>รายการ</th><th>สถานะ</th></tr></thead><tbody>${state.audit.map(row=>`<tr><td>${fmt(row.created)}</td><td>${esc(row.action)}</td><td>${esc(row.target)}</td><td><span class="${row.outcome==='succeeded'?'good':''}">${esc(row.outcome)}</span>${row.before&&row.before!=='null'?`<button class="btn ghost small" data-before="${esc(row.id)}">ดูค่าก่อนเปลี่ยน</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4"><div class="empty-table"><strong>ยังไม่มีประวัติการเปลี่ยนแปลง</strong></div></td></tr>'}</tbody></table></div></section>`; }
  function renderSettings() {
    const z=state.zoneData;
    content.innerHTML=`<section class="glass connection-card"><div class="section-row"><div><h2>Cloudflare API</h2><p class="hint">User API Token หรือ Account API Token</p></div><span class="badge">${state.connection?'เชื่อมต่อแล้ว':'ยังไม่เชื่อมต่อ'}</span></div>${state.connection?`<p>Account ID: <code>${esc(state.connection.account)}</code></p><p class="hint">บันทึกล่าสุด ${fmt(state.connection.updated)}</p>`:''}<form id="connection-form"><label class="field">Cloudflare Account ID<input name="account" value="${esc(state.connection?.account||'')}" required pattern="[a-fA-F0-9]{32}" maxlength="32" autocomplete="off"></label><label class="field">Cloudflare API Token<input type="password" name="token" required minlength="20" maxlength="500" autocomplete="off" placeholder="Token จะถูกเข้ารหัสก่อนจัดเก็บ"></label><div class="actions"><button type="submit" class="btn primary" ${state.busy?'disabled':''}>${state.connection?'อัปเดตการเชื่อมต่อ':'เชื่อมต่อ Cloudflare'}</button>${state.connection?button('ยกเลิกการเชื่อมต่อ','disconnect','destructive'):''}</div><p class="hint">ต้องมี Zone · Zone · Read, Zone · Email Routing Rules · Edit, Account · Email Routing Addresses · Edit และ DNS permissions ตามงานที่ใช้ จำกัด Resources ให้ตรงบัญชีและโดเมน</p><p class="hint">Token ไม่ถูกส่งกลับ browser และไม่ถูกเก็บใน localStorage</p></form></section>${state.connection?`<section class="glass dns-section"><div class="panel-head"><h2>DNS & Email Routing</h2><span class="badge">${esc(z?.zone.name||'เลือกโดเมน')}</span></div><div class="tool-row">${button('เปิด Email Routing','settings-enable','outline',!z?'disabled':'')}${button('ปิด Email Routing','settings-disable','destructive',!z?'disabled':'')}${button('Unlock DNS','settings-unlock','outline',!z?'disabled':'')}${button('Plus Addressing: '+(z?.settings.data?.support_subaddress?'เปิด':'ปิด'),'subaddress','outline',!z?.settings.data?'disabled':'')}</div>${['settings','dns','dnsRecords'].map(key=>`<div class="panel-head"><h3>${{settings:'สถานะ Routing',dns:'DNS ที่ Cloudflare ต้องการ',dnsRecords:'MX / TXT ปัจจุบัน'}[key]}</h3></div>${z?.[key]?.error?`<p class="error-box">${esc(z[key].error)}</p>`:`<pre>${esc(z?JSON.stringify(z[key].data,null,2):'กำลังโหลด…')}</pre>`}`).join('')}</section>`:''}`;
    if(state.connectionDraft) { $('#connection-form [name=account]').value=state.connectionDraft.account; $('#connection-form [name=token]').value=state.connectionDraft.token; }
    $('#connection-form').addEventListener('input',event=>{state.connectionDraft=Object.fromEntries(new FormData(event.currentTarget));});
    $('#connection-form').addEventListener('submit',async event=>{event.preventDefault(); if(state.busy) return; const form=event.currentTarget, data=Object.fromEntries(new FormData(form)); state.connectionDraft=data; form.querySelectorAll('button,input').forEach(el=>el.disabled=true); try { await mutation('connection',data,'เชื่อมต่อ Cloudflare แล้ว'); } catch(error) { showError(error); } });
  }
  function catalogModal(item, view = false) {
    const kind=state.page, original=item||{id:crypto.randomUUID(),name:'',color:'#b5a2ff',logo:'',rank:50};
    if(view) { openModal('รายละเอียด '+item.name,'ข้อมูลหมวดหมู่',`<div>${chip(item)}</div><p class="hint">ID ${esc(item.id)} · ลำดับ ${item.rank}</p>`,null); return; }
    openModal(item?'แก้ไขรายการ':'เพิ่มรายการ',`จัดการ ${labels[kind]} โดยคงชื่อและ ID ไม่ซ้ำ`,`${item?`<input type="hidden" name="id" value="${esc(original.id)}">`:''}<label class="field">ชื่อ<input name="name" value="${esc(original.name)}" required maxlength="50"></label><div class="form-grid"><label class="field">สี<input name="color" type="color" value="${esc(original.color)}"></label><label class="field">ลำดับ<input name="rank" type="number" value="${original.rank}" min="0" max="999" required></label></div><label class="field">โลโก้ PNG / JPEG / WebP<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp"></label><input name="logo" type="hidden" value="${esc(original.logo)}"><p class="hint" id="logo-status">${original.logo?'มีโลโก้อยู่แล้ว':'ไม่จำเป็นต้องมีโลโก้'} · ขนาดไม่เกิน 40 KB</p>${button('ลบโลโก้','clear-logo','outline small')}`,async values=>{
      const name=values.name.trim(); const catalog=clone(state.catalog); if(catalog[kind].some(i=>i.id!==original.id&&i.name.toLowerCase()===name.toLowerCase())) throw new Error('ชื่อและ ID ในหมวดเดียวกันต้องไม่ซ้ำ');
      const updated={id:original.id,name,color:values.color,rank:Number(values.rank),logo:values.logo}; if(item) catalog[kind]=catalog[kind].map(i=>i.id===item.id?updated:i); else catalog[kind].push(updated);
      await mutation('catalog',{catalog,revision:state.revision},'บันทึกรายการแล้ว');
    });
    $('#logo-file',modal).addEventListener('change',async event=>{const file=event.target.files[0]; if(!file) return; if(file.size>40000||!['image/png','image/jpeg','image/webp'].includes(file.type)) { $('.modal-error',modal).textContent='เลือก PNG, JPEG หรือ WebP ขนาดไม่เกิน 40 KB';event.target.value='';return; } const reader=new FileReader();reader.onload=()=>{$('[name=logo]',modal).value=reader.result;$('#logo-status',modal).textContent=file.name;modalDirty=true;};reader.readAsDataURL(file);});
  }
  function ruleModal(rule, catchAll = false) {
    const initial=rule?{name:rule.name||'',email:rule.matchers[0]?.value||'',type:rule.actions[0]?.type||'drop',target:rule.actions[0]?.value?.[0]||'',enabled:rule.enabled,priority:rule.priority??0}:{name:'',email:'',type:'forward',target:'',enabled:true,priority:0};
    const zone=state.zone, destinations=state.destinations.filter(d=>d.verified);
    openModal(catchAll?'ตั้งค่า Catch-all':rule?'แก้ไขกฎ':'เพิ่มกฎ','การเปลี่ยนแปลงนี้เขียนกฎใน Cloudflare',`<label class="field">ชื่อกฎ<input name="name" value="${esc(initial.name)}" maxlength="256" required></label>${catchAll?'<input name="email" type="hidden" value="">':`<label class="field">อีเมลต้นทาง<input name="email" type="email" value="${esc(initial.email)}" maxlength="90" placeholder="name@${esc(state.zoneData.zone.name)}" required></label>`}<label class="field">วิธีจัดการ${picker('วิธีจัดการ',initial.type,[{value:'forward',label:'Forward — ส่งต่อ'},{value:'drop',label:'Drop — ไม่รับอีเมล'},{value:'worker',label:'Worker — ส่งให้ Worker'}],'type')}</label><label class="field" data-forward ${initial.type!=='forward'?'hidden':''}>อีเมลปลายทางที่ยืนยันแล้ว${picker('อีเมลปลายทาง',initial.type==='forward'?initial.target:'',destinations.map(d=>({value:d.email,label:d.email})),'forward-target')}</label><label class="field" data-worker ${initial.type!=='worker'?'hidden':''}>ชื่อ Worker<input name="worker-target" value="${esc(initial.type==='worker'?initial.target:'')}" maxlength="63"></label>${catchAll?'<input name="priority" type="hidden" value="0">':`<label class="field">Priority ใน Cloudflare<input name="priority" type="number" min="0" max="2147483647" value="${initial.priority}" required></label>`}<label class="check-field"><input type="checkbox" name="enabled" ${initial.enabled?'checked':''}>เปิดใช้งาน</label>`,async(values,form)=>{
      const data={zone,action:catchAll?'catchall':rule?'update':'create',...(rule?{id:rule.id,fingerprint:rule.fingerprint}:{}),rule:{name:values.name.trim(),email:values.email,type:values.type,target:values.type==='forward'?values['forward-target']:values.type==='worker'?values['worker-target']:'',enabled:form.elements.enabled.checked,priority:Number(values.priority)}};
      await mutation('rule',data,'บันทึกกฎแล้ว');
    });
  }
  function annotationModal(ids) {
    const data=clone(state.zoneData.annotations[ids[0]]||blank()), zone=state.zone;
    openModal('จัดหมวดหมู่',`ใช้ข้อมูลเดียวกันกับ ${ids.length} กฎ โดยไม่เปลี่ยน Cloudflare Priority`,`${['platforms','groups'].map(kind=>`<fieldset><legend>${labels[kind]}</legend>${state.catalog[kind].map(item=>`<label class="check-field"><input type="checkbox" name="${kind}" value="${esc(item.id)}" ${data[kind].includes(item.id)?'checked':''}>${esc(item.name)}</label>`).join('')}</fieldset>`).join('')}<label class="field">Priority${picker('Priority',data.priority,[{value:'',label:'ไม่กำหนด'},...state.catalog.priorities.map(p=>({value:p.id,label:p.name}))],'priority')}</label><label class="field">หมายเหตุ<textarea name="note" maxlength="2000">${esc(data.note)}</textarea></label>`,async(values,form)=>{const fd=new FormData(form);await mutation('annotations',{zone,rules:ids,data:{platforms:fd.getAll('platforms'),groups:fd.getAll('groups'),priority:values.priority,note:values.note}},'จัดหมวดหมู่แล้ว');});
  }
  function settingsConfirm(action) { const z=state.zoneData; if(!z) return; confirm('ยืนยันการเปลี่ยน Email Routing','การดำเนินการนี้อาจเปลี่ยนการรับอีเมลและ DNS ใน Cloudflare',z.zone.name,text=>mutation('settings',{zone:state.zone,action,confirm:text,...(action==='subaddress'?{enabled:!z.settings.data.support_subaddress}:{})},'อัปเดตการตั้งค่าแล้ว')); }
  function dispatch(action, element) {
    if(element.disabled) return;
    if(action==='dismiss-error') { state.error='';renderFeedback();return; }
    if(action==='dismiss-notice') { state.notice='';renderFeedback();return; }
    if(action==='close-modal') { closeModal();return; }
    if(action==='close-confirm') { if(!state.busy){confirmation.close();opener?.focus();} return; }
    if(action==='clear-logo') { $('[name=logo]',modal).value=''; $('#logo-status',modal).textContent='ไม่มีโลโก้'; $('#logo-file',modal).value=''; modalDirty=true;return; }
    if(state.busy) return;
    if(action==='refresh') { if(state.loading&&state.catalog) return; state.error='';void refresh().catch(error=>{state.loading=false;showError(error);render();});return; }
    if(action==='add-catalog') catalogModal();
    if(['edit-catalog','view-catalog','delete-catalog'].includes(action)) { const kind=state.page,item=state.catalog[kind].find(i=>i.id===element.dataset.id); if(!item) return; if(action==='delete-catalog') confirm('ลบ '+item.name,'รายการที่มี annotation อ้างอิงจะลบไม่ได้',item.name,async()=>{const catalog=clone(state.catalog);catalog[kind]=catalog[kind].filter(i=>i.id!==item.id);await mutation('catalog',{catalog,revision:state.revision},'ลบรายการแล้ว');},'ลบรายการ');else catalogModal(item,action==='view-catalog'); }
    if(action==='add-destination') openModal('เพิ่มอีเมลปลายทาง','Cloudflare จะส่งอีเมลเพื่อให้ยืนยันปลายทาง','<label class="field">อีเมลปลายทาง<input type="email" name="email" maxlength="90" required></label>',values=>mutation('destination',{action:'create',email:values.email},'เพิ่มอีเมลปลายทางแล้ว กรุณาตรวจอีเมลยืนยัน'));
    if(action==='delete-destination') { const a=state.destinations.find(d=>d.id===element.dataset.id);if(a)confirm('ลบอีเมลปลายทาง','ตรวจว่ากฎที่ใช้ปลายทางนี้ได้รับการแก้ไขแล้ว',a.email,text=>mutation('destination',{action:'delete',id:a.id,confirm:text},'ลบอีเมลปลายทางแล้ว'),'ลบปลายทาง'); }
    if(action==='disconnect') confirm('ยกเลิกการเชื่อมต่อ','ระบบจะลบ Token ที่จัดเก็บและคงประวัติการทำงานไว้','DISCONNECT',text=>mutation('disconnect',{confirm:text},'ลบการเชื่อมต่อแล้ว'));
    if(action==='add-rule') ruleModal();
    if(action==='catchall') ruleModal(state.zoneData.catchall.data,true);
    if(['edit-rule','delete-rule','annotate-rule','view-rule'].includes(action)) { const rule=state.zoneData.rules.data.find(r=>r.id===element.dataset.id); if(!rule)return; if(action==='edit-rule') ruleModal(rule);if(action==='annotate-rule')annotationModal([rule.id]);if(action==='delete-rule')confirm('ลบกฎ Routing','การดำเนินการนี้ลบกฎใน Cloudflare',rule.matchers[0]?.value||rule.name,text=>mutation('rule',{zone:state.zone,action:'delete',id:rule.id,fingerprint:rule.fingerprint,confirm:text},'ลบกฎแล้ว'),'ลบกฎ');if(action==='view-rule')openModal('รายละเอียดกฎ','ข้อมูลล่าสุดที่โหลดจาก Cloudflare',`<pre class="note-box">${esc(JSON.stringify({rule,annotation:state.zoneData.annotations[rule.id]||blank()},null,2))}</pre>`,null); }
    if(action==='bulk-annotation') annotationModal([...state.selected]);
    if(action.startsWith('settings-')) settingsConfirm(action.slice(9));
    if(action==='subaddress') settingsConfirm('subaddress');
    if(action==='export-audit') download(state.audit,'relaydesk-audit.json');
  }
  void refresh().catch(error=>{state.loading=false;showError(error);render();});
})();
