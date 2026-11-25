// 사이트 점검 모드 체크 + 공통 UI 보정
// 점검 중 일반 고객은 maintenance.html로 이동하지만, 서버에서 확인된 관리자(role=admin)만 접근을 허용합니다.
import {
  auth, db,
  doc, getDoc, onAuthStateChanged, onSnapshot,
} from './firebase.js';
import { ensureFooterLegalLinks } from './footer-legal-links.js';

const CURRENT_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

const ADMIN_FILES = new Set([
  'admin.html', 'admin-ai-chat.html', 'admin-faq.html', 'maintenance.html'
]);
const IS_MAINTENANCE_PAGE = CURRENT_FILE === 'maintenance.html';
const IS_ADMIN_FILE = ADMIN_FILES.has(CURRENT_FILE) || CURRENT_FILE.startsWith('admin-');
const MAINTENANCE_DOCS = [['settings', 'site'], ['settings', 'homepageContent']];

import('./legal-modal.js').catch(e => console.warn('[legal] modal load failed:', e));

// AI 상담 위젯은 고객용 페이지에서 공통 로드합니다. 실제 ON/OFF는 ai-chat.js가 settings/aiChatPublic 기준으로 처리합니다.
if (!IS_ADMIN_FILE && !IS_MAINTENANCE_PAGE) {
  import('./ai-chat.js').catch(e => console.warn('[ai-chat] widget load failed:', e));
}

function getAuthUserOnce(timeoutMs = 3500) {
  return new Promise(resolve => {
    let done = false;
    let unsub = null;
    const finish = user => {
      if (done) return;
      done = true;
      try { if (typeof unsub === 'function') unsub(); } catch {}
      resolve(user || null);
    };
    try {
      if (auth.currentUser) return finish(auth.currentUser);
      unsub = onAuthStateChanged(auth, finish, () => finish(null));
    } catch {
      return finish(null);
    }
    setTimeout(() => finish(auth.currentUser || null), timeoutMs);
  });
}

async function isVerifiedAdmin() {
  try {
    const user = await getAuthUserOnce();
    if (!user || user.isAnonymous || !user.uid) return false;

    const snap = await getDoc(doc(db, 'users', user.uid));
    const ok = snap.exists() && snap.data()?.role === 'admin';

    if (ok) {
      try { sessionStorage.setItem('userRole', 'admin'); } catch {}
    } else {
      try { sessionStorage.removeItem('userRole'); } catch {}
      try { localStorage.removeItem('userRole'); } catch {}
    }
    return ok;
  } catch (e) {
    console.warn('admin role check failed:', e);
    return false;
  }
}

function hasMaintenanceFlag(data) {
  if (!data || typeof data !== 'object') return false;
  const directFlags = [
    data.maintenance, data.maintenanceMode, data.isMaintenance, data.isMaintenanceMode,
    data.siteMaintenance, data.siteMaintenanceMode, data.homepageMaintenance, data.homepageMaintenanceMode,
  ];
  if (directFlags.some(v => v === true || v === 'true' || v === 1 || v === '1' || v === 'on' || v === 'ON')) return true;
  const nested = data.site || data.homepage || data.settings || null;
  return !!(nested && typeof nested === 'object' && hasMaintenanceFlag(nested));
}

async function readMaintenanceState() {
  for (const [col, id] of MAINTENANCE_DOCS) {
    try {
      const snap = await getDoc(doc(db, col, id));
      if (snap.exists() && hasMaintenanceFlag(snap.data())) return true;
    } catch (e) {
      console.warn(`[maintenance] failed to read ${col}/${id}:`, e);
    }
  }
  return false;
}

function redirectToMaintenance() {
  if (IS_MAINTENANCE_PAGE) return;
  try { sessionStorage.setItem('maintenanceReturnUrl', location.pathname + location.search); } catch {}
  try {
    document.documentElement.style.background = '#0f172a';
    document.body.style.visibility = 'hidden';
  } catch {}
  location.replace('maintenance.html');
}

function startMaintenanceWatchForCustomers() {
  let states = new Map();
  let redirected = false;
  const evaluate = async () => {
    if (redirected) return;
    if (await isVerifiedAdmin()) return;
    const anyOn = Array.from(states.values()).some(Boolean);
    if (anyOn) {
      redirected = true;
      redirectToMaintenance();
    }
  };
  MAINTENANCE_DOCS.forEach(([col, id]) => {
    try {
      onSnapshot(doc(db, col, id), snap => {
        states.set(`${col}/${id}`, snap.exists() && hasMaintenanceFlag(snap.data()));
        evaluate();
      }, e => console.warn(`[maintenance] realtime watch failed ${col}/${id}:`, e));
    } catch (e) {
      console.warn(`[maintenance] watch setup failed ${col}/${id}:`, e);
    }
  });
}

(async () => {
  try {
    if (IS_MAINTENANCE_PAGE || IS_ADMIN_FILE) return;
    if (await isVerifiedAdmin()) return;
    if (await readMaintenanceState()) return redirectToMaintenance();
    startMaintenanceWatchForCustomers();
  } catch (e) {
    console.warn('maintenance check skipped:', e);
  }
})();

function normalizeHomeHeader() {
  if (CURRENT_FILE !== 'index.html') return;
  const run = async () => {
    try {
      document.getElementById('mobileNavModal')?.remove();
      const mount = document.getElementById('site-header');
      if (mount && !mount.querySelector('#main-header')) {
        const mod = await import('./header.js');
        if (typeof mod.initHeader === 'function') mod.initHeader('');
      }
    } catch (e) { console.warn('[header] normalize failed:', e); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  setTimeout(run, 500);
}
normalizeHomeHeader();

function initFooterLegalLinks() {
  const run = () => {
    try {
      ensureFooterLegalLinks();
    } catch (e) { console.warn('[footer] legal links inject failed:', e); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  setTimeout(run, 500);
  setTimeout(run, 1500);
}
initFooterLegalLinks();

function resetAdminLoginButton() {
  try {
    const btn = document.getElementById('hdr-admin-submit');
    if (!btn) return;
    const txt = btn.querySelector('.btn-text');
    const spin = btn.querySelector('.fa-spinner');
    btn.disabled = false;
    if (txt) txt.style.opacity = '1';
    if (spin) spin.classList.add('hidden');
  } catch {}
}

function initAdminLoginLoadingGuard() {
  document.addEventListener('click', e => {
    const btn = e.target?.closest?.('#hdr-admin-submit');
    if (!btn) return;
    setTimeout(() => { if (!CURRENT_FILE.endsWith('admin.html')) resetAdminLoginButton(); }, 3500);
  }, true);
  document.addEventListener('click', e => {
    if (e.target?.closest?.('#btn-admin-login')) setTimeout(resetAdminLoginButton, 0);
  }, true);
  window.addEventListener('pageshow', resetAdminLoginButton);
}
initAdminLoginLoadingGuard();

function parseWon(text) {
  const n = Number(String(text || '').replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function formatWon(value) { return `${Math.round(Number(value) || 0).toLocaleString('ko-KR')}원`; }
function patchBookUnitPriceLabel() {
  if (CURRENT_FILE !== 'quote-book.html') return;
  const box = document.getElementById('priceBreakdown');
  if (!box) return;
  const finalLabel = Array.from(box.querySelectorAll('span')).find(el => (el.textContent || '').includes('최종 결제 금액'));
  const finalAmountEl = finalLabel?.parentElement?.querySelector('span:last-child');
  const finalPrice = parseWon(finalAmountEl?.textContent || '');
  if (!finalPrice) return;
  const quantities = Array.from(document.querySelectorAll('.quote-item .quantity')).map(el => Number(el.value || 0)).filter(n => Number.isFinite(n) && n > 0);
  const totalQty = quantities.reduce((sum, n) => sum + n, 0);
  if (!totalQty) return;
  const unitPrice = Math.round((finalPrice / totalQty) / 10) * 10;
  const label = quantities.length > 1 ? '평균 권당 단가' : '권당 단가';
  const qtyText = quantities.length > 1 ? `총 ${totalQty.toLocaleString('ko-KR')}부` : `${totalQty.toLocaleString('ko-KR')}부`;
  const target = Array.from(box.querySelectorAll('span')).find(el => /권당 단가|평균 권당 단가/.test(el.textContent || ''))?.closest('div');
  if (!target) return;
  const nextHtml = `<span class="text-xs text-slate-400">${label} <span class="font-bold text-slate-200">${formatWon(unitPrice)}</span> × <span class="font-bold text-slate-200">${qtyText}</span><span class="ml-1 text-[10px] text-slate-500">(VAT 포함)</span></span>`;
  if (target.innerHTML !== nextHtml) target.innerHTML = nextHtml;
}
function initBookUnitPricePatch() {
  if (CURRENT_FILE !== 'quote-book.html') return;
  const bind = () => {
    const box = document.getElementById('priceBreakdown');
    if (!box) return false;
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; patchBookUnitPriceLabel(); });
    };
    new MutationObserver(schedule).observe(box, { childList: true, subtree: true, characterData: true });
    document.addEventListener('input', e => { if (e.target?.closest?.('.quote-item')) setTimeout(schedule, 0); }, true);
    document.addEventListener('change', e => { if (e.target?.closest?.('.quote-item')) setTimeout(schedule, 0); }, true);
    schedule();
    return true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else if (!bind()) setTimeout(bind, 800);
}
initBookUnitPricePatch();
