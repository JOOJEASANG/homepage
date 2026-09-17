// Dependency-free fallback header.
// Firebase/session modules may fail or be delayed; navigation must remain visible regardless.
(function () {
  'use strict';

  const MENU = [
    ['quote-book.html', '책자/제본'],
    ['quote-print.html', '디지털인쇄'],
    ['qna.html', '고객센터'],
    ['work-guide.html', '작업가이드'],
  ];

  function ensureCriticalStyle() {
    if (document.getElementById('header-shell-critical-style')) return;
    const style = document.createElement('style');
    style.id = 'header-shell-critical-style';
    style.textContent = `
      #site-header #main-header { z-index: 150 !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function currentFile() {
    try { return (location.pathname || '').split('/').pop() || 'index.html'; }
    catch (_) { return 'index.html'; }
  }

  function render() {
    ensureCriticalStyle();
    const mount = document.getElementById('site-header');
    if (!mount || mount.querySelector('#main-header')) return;

    const current = currentFile();
    const links = MENU.map(([href, label]) => {
      const active = href === current;
      const cls = active
        ? 'text-brand-700 font-bold border-b-2 border-brand-600'
        : 'text-slate-600 font-medium hover:text-brand-600 hover:bg-slate-50';
      return `<a href="${href}" class="h-16 px-4 flex items-center transition-colors text-[15px] ${cls}">${label}</a>`;
    }).join('');

    const mobileLinks = MENU.map(([href, label]) =>
      `<a href="${href}" class="w-full px-6 py-4 border-b border-slate-50 font-bold text-slate-700 hover:bg-brand-50 hover:text-brand-700">${label}</a>`
    ).join('');

    mount.innerHTML = `
      <header class="fixed w-full top-0 z-[150] bg-white border-b border-slate-200 shadow-sm h-16" id="main-header" data-header-shell="fallback">
        <nav class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <a class="flex items-center gap-2 group mr-2 lg:mr-8 shrink-0" href="index.html" aria-label="그린오피스 홈">
            <div class="w-8 h-8 bg-brand-600 rounded flex items-center justify-center text-white shadow-sm"><i class="fas fa-print"></i></div>
            <span class="text-lg font-extrabold text-slate-800 tracking-tight leading-none">그린오피스</span>
          </a>
          <div class="hidden lg:flex items-center gap-1 h-full flex-grow">${links}</div>
          <div class="flex items-center gap-1">
            <button id="btn-mobile-menu-shell" type="button" class="lg:hidden p-2 text-slate-600 hover:text-brand-600 transition" aria-label="메뉴 열기" aria-expanded="false">
              <i class="fa-solid fa-bars text-lg"></i>
            </button>
            <a href="login.html" class="inline-flex items-center px-3 sm:px-4 py-2 text-[14px] sm:text-[15px] font-medium rounded-lg text-slate-600 hover:text-brand-600 hover:bg-slate-50 transition">주문조회</a>
          </div>
        </nav>
        <div id="mobile-menu-shell" class="lg:hidden hidden absolute top-16 left-0 w-full bg-white border-b border-slate-200 shadow-xl">
          <div class="flex flex-col">${mobileLinks}</div>
        </div>
      </header>`;

    const button = document.getElementById('btn-mobile-menu-shell');
    const menu = document.getElementById('mobile-menu-shell');
    button?.addEventListener('click', () => {
      menu?.classList.toggle('hidden');
      button.setAttribute('aria-expanded', menu && !menu.classList.contains('hidden') ? 'true' : 'false');
    });
  }

  function watchMount() {
    const mount = document.getElementById('site-header');
    if (!mount || mount.__headerShellObserver) return;
    const observer = new MutationObserver(() => {
      if (!mount.querySelector('#main-header')) queueMicrotask(render);
    });
    observer.observe(mount, { childList: true, subtree: false });
    mount.__headerShellObserver = observer;
  }

  function boot() {
    render();
    watchMount();
  }

  if (document.getElementById('site-header')) boot();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.addEventListener('pageshow', boot);

  // Expose only for deterministic browser tests and safe manual recovery.
  window.__renderHeaderShell = render;
})();
