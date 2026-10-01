// ============================================================
// admin-quote-navigation.js — 관리자 견적페이지 직접 접근/보조기능 연결
//
// 목적:
//   - 관리자 로그인 후 책자/제본, 디지털출력 페이지로 직접 이동 가능
//   - 기존 고객 견적 수정(adminEdit) 흐름과 관리자 계산 전용(adminPricing) 흐름 분리
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

function isExistingAdminEditUrl(url) {
  try {
    return url.searchParams.get('adminEdit') === '1'
      || url.searchParams.get('admin_edit') === '1'
      || url.searchParams.get('edit') === '1';
  } catch (_) {
    return false;
  }
}

function adminQuoteHref(rawHref) {
  try {
    const url = new URL(rawHref, location.href);
    const file = (url.pathname || '').split('/').pop() || '';
    if (!QUOTE_FILES.has(file)) return rawHref;

    // 이미 고객 견적 수정용 링크라면 절대 계산모드로 바꾸지 않습니다.
    if (isExistingAdminEditUrl(url)) return rawHref;

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
    // 기존 관리자 수정 URL은 그대로 둡니다.
    if (isExistingAdminEditUrl(url) && url.searchParams.get('adminPricing') !== '1') return;

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

function isAdminPricingMode() {
  try {
    const params = new URLSearchParams(location.search || '');
    return isCachedAdmin() && QUOTE_FILES.has(currentFile()) && params.get('adminPricing') === '1';
  } catch (_) {
    return false;
  }
}

function applyAdminPricingModeUi() {
  if (!isAdminPricingMode()) return;
  if (document.getElementById('admin-pricing-mode-banner')) return;

  const main = document.getElementById('main-content') || document.querySelector('main');
  if (main) {
    const banner = document.createElement('div');
    banner.id = 'admin-pricing-mode-banner';
    banner.className = 'mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-3';
    banner.innerHTML = `
      <i class="fas fa-calculator mt-0.5 text-amber-700"></i>
      <div>
        <strong class="block font-extrabold">관리자 계산 모드</strong>
        <span class="text-xs text-amber-800">견적 계산과 하청 20% 비교만 사용합니다. 이 화면에서는 고객 견적을 접수하지 않습니다.</span>
      </div>
    `;
    main.prepend(banner);
  }

  // 계산 전용 모드에서 실수로 신규 고객 견적을 접수하지 못하도록 제출 버튼을 비활성화합니다.
  ['submitQuoteBtn', 'submitBtn', 'member-submit-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btn.setAttribute('title', '관리자 계산 모드에서는 견적 접수가 비활성화됩니다.');
  });
}

function watchAdminNavigation() {
  if (!isCachedAdmin()) return;
  patchAdminQuoteLinks();
  applyAdminPricingModeUi();

  if (document.documentElement.dataset.adminQuoteNavBound === '1') return;
  document.documentElement.dataset.adminQuoteNavBound = '1';

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      patchAdminQuoteLinks();
      applyAdminPricingModeUi();
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
  applyAdminPricingModeUi();
});
