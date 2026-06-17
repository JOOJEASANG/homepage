// ============================================================
// admin-ai-menu.js — 관리자 메뉴에 AI 상담 관리 항목 추가
// ============================================================

function isAdminPage() {
  try { return ((location.pathname || '').split('/').pop() || '') === 'admin.html'; }
  catch (e) { return false; }
}

function goAiSettings() {
  location.href = 'admin-ai-chat.html';
}

function makePcButton() {
  const btn = document.createElement('button');
  btn.id = 'ai-chat-management-btn';
  btn.type = 'button';
  btn.className = 'dropdown-item';
  btn.innerHTML = '<i class="fas fa-robot text-slate-400"></i> AI 상담 관리';
  btn.addEventListener('click', goAiSettings);
  return btn;
}

function makeMobileButton() {
  const btn = document.createElement('button');
  btn.id = 'm-ai-chat-management-btn';
  btn.type = 'button';
  btn.className = 'mobile-menu-item';
  btn.innerHTML = '<i class="fas fa-robot text-slate-400"></i> AI 상담 관리';
  btn.addEventListener('click', goAiSettings);
  return btn;
}

function injectPcMenu() {
  if (document.getElementById('ai-chat-management-btn')) return true;

  const homepageBtn = document.getElementById('homepage-management-btn');
  const maintenanceBtn = document.getElementById('maintenance-mode-btn');
  const menu = homepageBtn?.closest?.('.nav-dropdown-menu') || maintenanceBtn?.closest?.('.nav-dropdown-menu');
  if (!menu) return false;

  const btn = makePcButton();
  if (homepageBtn) homepageBtn.insertAdjacentElement('afterend', btn);
  else if (maintenanceBtn) maintenanceBtn.insertAdjacentElement('beforebegin', btn);
  else menu.appendChild(btn);
  return true;
}

function injectMobileMenu() {
  if (document.getElementById('m-ai-chat-management-btn')) return true;

  const homepageMobile = document.querySelector('.mobile-menu-item[data-click="#homepage-management-btn"]');
  const maintenanceMobile = document.querySelector('.mobile-menu-item[data-click="#maintenance-mode-btn"]');
  const section = homepageMobile?.closest?.('.mobile-menu-section') || maintenanceMobile?.closest?.('.mobile-menu-section');
  if (!section) return false;

  const btn = makeMobileButton();
  if (homepageMobile) homepageMobile.insertAdjacentElement('afterend', btn);
  else if (maintenanceMobile) maintenanceMobile.insertAdjacentElement('beforebegin', btn);
  else section.appendChild(btn);
  return true;
}

function initAdminAiMenu() {
  if (!isAdminPage()) return;
  injectPcMenu();
  injectMobileMenu();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminAiMenu, { once: true });
else initAdminAiMenu();
setTimeout(initAdminAiMenu, 300);
setTimeout(initAdminAiMenu, 1000);
setTimeout(initAdminAiMenu, 2500);
