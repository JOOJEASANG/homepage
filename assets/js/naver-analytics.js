// External analytics must never hold up page rendering or application startup.
(() => {
  if (window.__greenofficeAnalyticsRequested) return;
  window.__greenofficeAnalyticsRequested = true;
  window.wcs_add = window.wcs_add || {};
  window.wcs_add.wa = '93643ac58d5';
  const script = document.createElement('script');
  script.src = 'https://wcs.pstatic.net/wcslog.js';
  script.async = true;
  script.onload = () => {
    try { if (typeof window.wcs_do === 'function') window.wcs_do(); } catch (_) {}
  };
  document.head.appendChild(script);
})();
