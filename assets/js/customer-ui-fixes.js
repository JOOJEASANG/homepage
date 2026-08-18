// ============================================================
// customer-ui-fixes.js — 고객/관리자 화면 안전 보정
//
// 역할:
//   - 공개 헤더에서 관리자 버튼 제거 후 남은 모바일 버튼 이벤트를 주문조회로 연결
//   - 메인 최근 접수 DOM에 위험 태그/속성이 섞이는 경우 후처리로 제거
//   - /admin 직접 접속 시 일부 관리자 UI 보정이 빠지지 않도록 보완
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

function initDirectAdminSearchBoxFallback() {
  if (CURRENT_FILE !== 'admin.html') return;
  const apply = () => {
    if (document.getElementById('direct-admin-searchbox-fix')) return;
    const style = document.createElement('style');
    style.id = 'direct-admin-searchbox-fix';
    style.textContent = `
      #searchInput {
        padding-left: 2.75rem !important;
        text-indent: 0 !important;
      }
      #searchInput::placeholder {
        color: #94a3b8;
        opacity: 1;
      }
      #searchInput + .fa-search,
      #searchInput ~ .fa-search,
      #reception-management-content .relative > .fa-search {
        pointer-events: none;
      }
      #reception-management-content .relative > .fa-search {
        left: 0.95rem !important;
        width: 1rem;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
}

async function initDirectAdminMaintenanceFallback() {
  if (CURRENT_FILE !== 'admin.html') return;
  if (document.body?.dataset.directAdminMaintenanceBound === '1') return;

  const api = await import('./firebase.js').catch(() => null);
  if (!api) return;
  const { auth, db, onAuthStateChanged, doc, getDoc, setDoc, serverTimestamp } = api;

  const isAdmin = async (user) => {
    try {
      if (!user || user.isAnonymous || !user.uid) return false;
      const snap = await getDoc(doc(db, 'users', user.uid));
      return snap.exists() && snap.data()?.role === 'admin';
    } catch (_) {
      return false;
    }
  };

  const flagOn = (data) => {
    if (!data || typeof data !== 'object') return false;
    return [
      data.maintenance,
      data.maintenanceMode,
      data.siteMaintenance,
      data.siteMaintenanceMode,
      data.homepageMaintenance,
      data.homepageMaintenanceMode,
    ].some(v => v === true || v === 'true' || v === 1 || v === '1' || v === 'on' || v === 'ON');
  };

  const getState = async () => {
    const snaps = await Promise.all([
      getDoc(doc(db, 'settings', 'site')).catch(() => null),
      getDoc(doc(db, 'settings', 'homepageContent')).catch(() => null),
    ]);
    return snaps.some(s => s && s.exists() && flagOn(s.data()));
  };

  const render = (on) => {
    ['maintenance-status-pill', 'm-maintenance-status-pill'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = on ? 'ON' : 'OFF';
      el.className = 'ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ' +
        (on ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500');
    });
  };

  const bind = async (user) => {
    if (!await isAdmin(user)) return;
    if (document.body?.dataset.directAdminMaintenanceBound === '1') return;
    document.body.dataset.directAdminMaintenanceBound = '1';

    let busy = false;
    let state = await getState().catch(() => false);
    render(state);

    document.addEventListener('click', async (e) => {
      const btn = e.target?.closest?.('#maintenance-mode-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      if (busy) return;
      busy = true;
      const oldHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin text-slate-400"></i> 처리중...';
      try {
        state = !(await getState());
        const userNow = auth.currentUser;
        await Promise.all([
          setDoc(doc(db, 'settings', 'site'), {
            maintenance: state,
            maintenanceMode: state,
            siteMaintenance: state,
            siteMaintenanceMode: state,
            homepageMaintenance: state,
            homepageMaintenanceMode: state,
            updatedAt: serverTimestamp(),
            updatedBy: userNow?.uid || '',
          }, { merge: true }),
          setDoc(doc(db, 'settings', 'homepageContent'), {
            maintenance: state,
            maintenanceMode: state,
            siteMaintenance: state,
            siteMaintenanceMode: state,
            homepageMaintenance: state,
            homepageMaintenanceMode: state,
            updatedAt: serverTimestamp(),
            updatedBy: userNow?.uid || '',
          }, { merge: true }),
        ]);
        render(state);
        try { window.showToast?.(state ? '홈페이지 점검모드가 ON 되었습니다.' : '홈페이지 점검모드가 OFF 되었습니다.', state ? 'warning' : 'success'); } catch (_) {}
      } catch (_) {
        try { window.showToast?.('점검모드 변경에 실패했습니다. 권한 또는 네트워크를 확인하세요.', 'error'); } catch (_) {}
        render(await getState().catch(() => false));
      } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
        busy = false;
      }
    }, true);
  };

  try {
    onAuthStateChanged(auth, user => bind(user));
    if (auth.currentUser) bind(auth.currentUser);
  } catch (_) {}
}

if (CURRENT_FILE === 'admin.html' || CURRENT_FILE === 'qna.html') {
  import('./qna-conversation-thread.js').catch(() => null);
}

if (CURRENT_FILE === 'admin.html') {
  import('./admin-mobile-header-fix.js').catch(() => null);
  import('./notice-publish-period-admin.js').catch(() => null);
}

if (CURRENT_FILE === 'index.html') {
  import('./notice-publish-period-public.js').catch(() => null);
}

if (CURRENT_FILE === 'quote-book.html') {
  import('./book-a5-size.js').catch(() => null);
}

if (CURRENT_FILE === 'quote-book-price.html') {
  import('./book-a5-rate-admin.js').catch(() => null);
}

if (CURRENT_FILE === 'mypage.html') {
  import('./mypage-quote-price-fix.js').catch(() => null);
}

initAdminButtonCleanupFallback();
initMobileCustomerButtonFallback();
initRecentQuotesSafety();
initDirectAdminSearchBoxFallback();
initDirectAdminMaintenanceFallback().catch(() => null);
