// Mobile header styling now lives in ux-refresh.css.
(function () {
  function init() {
    const toolbar = document.getElementById('mobileCurrentSection')?.parentElement;
    toolbar?.classList.add('admin-mobile-toolbar');
    toolbar?.parentElement?.classList.add('admin-mobile-subbar');
    document.getElementById('mobileMenuLogoutBtn')?.setAttribute('aria-label', '관리자 로그아웃');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
