// ============================================================
// admin-quote-navigation.js — 관리자 견적페이지 직접 접근/보조기능 연결
//
// 목적:
//   - 관리자 로그인 후 책자/제본, 디지털출력 페이지로 직접 이동 가능
//   - 기존 페이지의 관리자 강제리다이렉트와 충돌하지 않도록 adminEdit=1 접근 플래그 부여
//   - 실제 관리자 전용 하청 계산 UI는 Firestore role을 다시 검증한 뒤 표시
// ============================================================

const QUOTE_FILES = new Set(['quote-book.html', 'quote-print.html']);

function currentFile() {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch (_) { return 'index.html'; }
}

function cachedRole() {
  try {
    return String(
      sessionStorage.getItem('userRole') ||
      localStorage.getItem('userRole') ||
      ''
    ).trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

function isCachedAdmin() {
  return cachedRole() === 'admin';
}

function adminQuoteHref(rawHref) {
  try {
    const url = new URL(rawHref, location.href);
    const file = (url.pathname || '').split('/').pop() || '';
    if (!QUOTE_FILES.has(file)) return rawHref;
    url.searchParams.set('adminEdit', '1');
    url.searchParams.set('adminPricing', '1');
    return `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
  } catch (_) {
    return rawHref;
  }
}

function allowCurrentAdminQuotePage() {
  const file = currentFile();
  if (!QUOTE_FILES.has(file) || !isCachedAdmin()) return;
  try {
    const url = new URL(location.href);
    let changed = false;
    if (url.searchParams.get('adminEdit') !== '1') {
      url.searchParams.set('adminEdit', '1');
      changed = true;
    }
    if (url.searchParams.get('adminPricing') !== '1') {
      url.searchParams.set('adminPricing', '1');
      changed = true;
    }
    if (changed) history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (_) {}
}

function patchAdminQuoteLinks(root = document) {
  if (!isCachedAdmin()) return;
  root.querySelectorAll?.('a[href]').forEach(anchor => {
    const raw = anchor.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^https?:\/\//i.test(raw)) return;
    const next = adminQuoteHref(raw);
    if (next !== raw) anchor.setAttribute('href', next);
  });
}

function watchAdminNavigation() {
  if (!isCachedAdmin()) return;
  patchAdminQuoteLinks();

  if (document.documentElement.dataset.adminQuoteNavBound === '1') return;
  document.documentElement.dataset.adminQuoteNavBound = '1';

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      patchAdminQuoteLinks();
    });
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
}

function boot() {
  allowCurrentAdminQuotePage();
  watchAdminNavigation();

  if (QUOTE_FILES.has(currentFile())) {
    import('./book-admin-subcontract-calculator.js').catch(() => null);
  }
}

if (document.readyState === 'loading') {
  boot();
  document.addEventListener('DOMContentLoaded', watchAdminNavigation, { once: true });
} else {
  boot();
}

window.addEventListener('pageshow', () => {
  allowCurrentAdminQuotePage();
  patchAdminQuoteLinks();
});
