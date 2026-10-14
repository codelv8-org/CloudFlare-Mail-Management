const toggle = document.querySelector('#show-password');
toggle?.addEventListener('click', () => {
  const input = document.querySelector('input[name="password"]');
  const visible = input.type === 'password'; input.type = visible ? 'text' : 'password';
  toggle.textContent = visible ? 'ซ่อน' : 'แสดง'; toggle.setAttribute('aria-label', visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
});
document.querySelector('form')?.addEventListener('submit', event => {
  const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'กำลังเข้าสู่ระบบ…';
});
