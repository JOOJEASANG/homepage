// ============================================================
// customer-ui-fixes.js — 고객 화면 안전 보정
//
// 역할:
//   - 공개 헤더에서 관리자 버튼 제거 후 남은 모바일 버튼 이벤트를 주문조회로 연결
//   - 메인 최근 접수 DOM에 위험 태그/속성이 섞이는 경우 후처리로 제거
//   - 기존 페이지 대형 파일을 직접 흔들지 않고 고객 화면 안정성만 보정
// ============================================================

const CURRENT_FILE = (() => {
  try {
    const raw = (location.pathname || '').split('/').pop() || 'index.html';
    return raw === 'admin' ? 'admin.html' : raw;
  } catch {
    return 'index.html';
  }
})();

function removeDangerousDom(root) {
  try {
    if (!root) return;
    const dangerousTags = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META']);
    root.querySelectorAll?.('*').forEach(el => {
      if (dangerousTags.has(el.tagName)) {
        el.remove();
        return;
      }
      Array.from(el.attributes || []).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim().toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) el.removeAttribute(attr.name);
      });
    });
  } catch (_) {}
}

function initRecentQuotesSafety() {
  if (CURRENT_FILE !== 'index.html') return;

  const apply = () => {
    const box = document.getElementById('recent-quotes-container');
    if (!box) return false;
    removeDangerousDom(box);
    if (box.dataset.safeRecentQuotesBound !== '1') {
      box.dataset.safeRecentQuotesBound = '1';
      const observer = new MutationObserver(() => removeDangerousDom(box));
      observer.observe(box, { childList: true, subtree: true, attributes: true });
    }
    return true;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!apply()) setTimeout(apply, 500);
      setTimeout(apply, 1500);
    }, { once: true });
  } else {
    if (!apply()) setTimeout(apply, 500);
    setTimeout(apply, 1500);
  }
}

function initMobileCustomerButtonFallback() {
  if (CURRENT_FILE !== 'index.html') return;

  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('#mobile-auth-btn');
    if (!btn) return;
    const hasAdminButton = !!document.getElementById('btn-admin-login');
    if (hasAdminButton) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    document.getElementById('btn-order-lookup')?.click();
  }, true);
}

function initAdminButtonCleanupFallback() {
  const remove = () => {
    try { document.getElementById('btn-admin-login')?.remove(); } catch (_) {}
    try { document.getElementById('hdr-admin-modal')?.remove(); } catch (_) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', remove, { once: true });
  else remove();
  setTimeout(remove, 500);
}

initAdminButtonCleanupFallback();
initMobileCustomerButtonFallback();
initRecentQuotesSafety();
