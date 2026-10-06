const pages = [
  ['faq', 'FAQ 관리', 'faq-management'],
  ['ai', 'AI 상담 관리', 'ai-management'],
  ['pay', '결제안내 관리', 'payment-management'],
];

function run() {
  const file = (location.pathname || '').split('/').pop() || '';
  if (!['admin', 'admin.html'].includes(file)) return;
  const home = document.getElementById('homepage-management-btn');
  const maintenance = document.getElementById('maintenance-mode-btn');
  const menu = home?.closest('.nav-dropdown-menu') || maintenance?.closest('.nav-dropdown-menu');
  if (menu) {
    let title = document.getElementById('cc-admin-title');
    if (!title) {
      title = document.createElement('div');
      title.id = 'cc-admin-title';
      title.className = 'px-4 py-2 text-xs font-black text-slate-400 border-t border-slate-100 mt-1';
      title.textContent = '고객센터 관리';
      (maintenance || home || menu.lastElementChild).insertAdjacentElement('beforebegin', title);
    }
    let anchor = title;
    for (const [key, label, tab] of pages) {
      let button = document.getElementById(`cc-${key}-btn`);
      if (!button) {
        button = document.createElement('button');
        button.id = `cc-${key}-btn`;
        button.type = 'button';
        button.className = 'dropdown-item nav-item';
        button.dataset.tab = tab;
        button.textContent = label;
        anchor.insertAdjacentElement('afterend', button);
      }
      anchor = button;
    }
  }
  const section = document.querySelector('.mobile-menu-item[data-click="#homepage-management-btn"]')?.closest('.mobile-menu-section');
  if (!section) return;
  for (const [key, label] of pages) {
    if (document.getElementById(`m-cc-${key}-btn`)) continue;
    const button = document.createElement('button');
    button.id = `m-cc-${key}-btn`;
    button.type = 'button';
    button.className = 'mobile-menu-item';
    button.textContent = label;
    button.addEventListener('click', () => {
      document.getElementById(`cc-${key}-btn`)?.click();
      document.getElementById('mobileMenuCloseBtn')?.click();
    });
    section.appendChild(button);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
else run();
setTimeout(run, 500);
setTimeout(run, 1500);
setTimeout(run, 3000);
