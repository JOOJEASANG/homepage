// ============================================================
// admin-ai-menu.js — 관리자 메뉴 보정 항목 추가
// - AI 상담 관리
// - FAQ 관리
// ============================================================

function isAdminPage() {
  try { return ((location.pathname || '').split('/').pop() || '') === 'admin.html'; }
  catch (e) { return false; }
}

function goAiSettings() { location.href = 'admin-ai-chat.html'; }
function goFaqSettings() { location.href = 'admin-faq.html'; }

function makePcButton(id, icon, label, handler) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.className = 'dropdown-item';
  btn.innerHTML = `<i class="fas ${icon} text-slate-400"></i> ${label}`;
  btn.addEventListener('click', handler);
  return btn;
}

function makeMobileButton(id, icon, label, handler) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.className = 'mobile-menu-item';
  btn.innerHTML = `<i class="fas ${icon} text-slate-400"></i> ${label}`;
  btn.addEventListener('click', handler);
  return btn;
}

function injectPcMenu() {
  const homepageBtn = document.getElementById('homepage-management-btn');
  const maintenanceBtn = document.getElementById('maintenance-mode-btn');
  const menu = homepageBtn?.closest?.('.nav-dropdown-menu') || maintenanceBtn?.closest?.('.nav-dropdown-menu');
  if (!menu) return false;

  if (!document.getElementById('ai-chat-management-btn')) {
    const btn = makePcButton('ai-chat-management-btn', 'fa-robot', 'AI 상담 관리', goAiSettings);
    if (homepageBtn) homepageBtn.insertAdjacentElement('afterend', btn);
    else if (maintenanceBtn) maintenanceBtn.insertAdjacentElement('beforebegin', btn);
    else menu.appendChild(btn);
  }

  if (!document.getElementById('faq-management-btn')) {
    const btn = makePcButton('faq-management-btn', 'fa-circle-question', 'FAQ 관리', goFaqSettings);
    const aiBtn = document.getElementById('ai-chat-management-btn');
    if (aiBtn) aiBtn.insertAdjacentElement('afterend', btn);
    else if (homepageBtn) homepageBtn.insertAdjacentElement('afterend', btn);
    else menu.appendChild(btn);
  }
  return true;
}

function injectMobileMenu() {
  const homepageMobile = document.querySelector('.mobile-menu-item[data-click="#homepage-management-btn"]');
  const maintenanceMobile = document.querySelector('.mobile-menu-item[data-click="#maintenance-mode-btn"]');
  const section = homepageMobile?.closest?.('.mobile-menu-section') || maintenanceMobile?.closest?.('.mobile-menu-section');
  if (!section) return false;

  if (!document.getElementById('m-ai-chat-management-btn')) {
    const btn = makeMobileButton('m-ai-chat-management-btn', 'fa-robot', 'AI 상담 관리', goAiSettings);
    if (homepageMobile) homepageMobile.insertAdjacentElement('afterend', btn);
    else if (maintenanceMobile) maintenanceMobile.insertAdjacentElement('beforebegin', btn);
    else section.appendChild(btn);
  }

  if (!document.getElementById('m-faq-management-btn')) {
    const btn = makeMobileButton('m-faq-management-btn', 'fa-circle-question', 'FAQ 관리', goFaqSettings);
    const aiBtn = document.getElementById('m-ai-chat-management-btn');
    if (aiBtn) aiBtn.insertAdjacentElement('afterend', btn);
    else if (homepageMobile) homepageMobile.insertAdjacentElement('afterend', btn);
    else section.appendChild(btn);
  }
  return true;
}

function initAdminMenuPatch() {
  if (!isAdminPage()) return;
  injectPcMenu();
  injectMobileMenu();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminMenuPatch, { once: true });
else initAdminMenuPatch();
setTimeout(initAdminMenuPatch, 300);
setTimeout(initAdminMenuPatch, 1000);
setTimeout(initAdminMenuPatch, 2500);
