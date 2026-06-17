// 사이트 점검 모드 체크 + 공통 UI 보정
// settings/site 또는 settings/homepageContent 문서의 점검 플래그가 true이면 관리자가 아닌 사용자를 maintenance.html로 리다이렉트.
import { auth, db, doc, getDoc, onAuthStateChanged } from "./firebase.js";

const CURRENT_FILE = (() => {
    try { return (location.pathname || "").split("/").pop() || "index.html"; }
    catch (e) { return "index.html"; }
})();

const IS_MAINTENANCE_PAGE = CURRENT_FILE === "maintenance.html";
const IS_ADMIN_PAGE = CURRENT_FILE === "admin.html";

function getAuthUserOnce(timeoutMs = 1200) {
    return new Promise((resolve) => {
        let done = false;
        let unsub = null;
        const finish = (user) => {
            if (done) return;
            done = true;
            try { if (typeof unsub === 'function') unsub(); } catch (e) {}
            resolve(user || null);
        };

        try {
            if (auth.currentUser) {
                finish(auth.currentUser);
                return;
            }
            unsub = onAuthStateChanged(auth, finish, () => finish(null));
        } catch (e) {
            finish(null);
            return;
        }

        setTimeout(() => finish(auth.currentUser || null), timeoutMs);
    });
}

async function isVerifiedAdmin() {
    try {
        const user = await getAuthUserOnce();
        if (!user || user.isAnonymous || !user.uid) return false;

        const snap = await getDoc(doc(db, "users", user.uid));
        return snap.exists() && snap.data()?.role === "admin";
    } catch (e) {
        console.warn('admin role check failed:', e);
        return false;
    }
}

function hasMaintenanceFlag(data) {
    if (!data || typeof data !== 'object') return false;

    // 관리자 화면에서 필드명이 바뀌어도 점검모드가 누락되지 않도록 대표 후보를 모두 확인합니다.
    const directFlags = [
        data.maintenance,
        data.maintenanceMode,
        data.isMaintenance,
        data.isMaintenanceMode,
        data.siteMaintenance,
        data.enabled,
    ];
    if (directFlags.some(v => v === true || v === 'true' || v === 1 || v === '1')) return true;

    const nested = data.site || data.homepage || data.settings || null;
    if (nested && typeof nested === 'object') {
        return hasMaintenanceFlag(nested);
    }
    return false;
}

async function readMaintenanceState() {
    const candidates = [
        ["settings", "site"],
        ["settings", "homepageContent"],
    ];

    for (const [col, id] of candidates) {
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
    try { sessionStorage.setItem('maintenanceReturnUrl', location.pathname + location.search); } catch (e) {}
    try { document.documentElement.style.background = '#0f172a'; document.body.style.visibility = 'hidden'; } catch (e) {}
    location.replace('maintenance.html');
}

(async () => {
    try {
        if (IS_MAINTENANCE_PAGE || IS_ADMIN_PAGE) return;
        if (await isVerifiedAdmin()) return;
        if (await readMaintenanceState()) redirectToMaintenance();
    } catch (e) {
        console.warn('maintenance check skipped:', e);
    }
})();

// 메인 페이지에 남아 있던 별도 모바일 헤더/메뉴 DOM을 숨겨 공통 header.js 기준으로 통일합니다.
function normalizeHomeHeader() {
    if (CURRENT_FILE !== 'index.html') return;
    const run = async () => {
        try {
            const legacyMobileNav = document.getElementById('mobileNavModal');
            if (legacyMobileNav) legacyMobileNav.remove();

            const mount = document.getElementById('site-header');
            if (mount && !mount.querySelector('#main-header')) {
                const mod = await import('./header.js');
                if (typeof mod.initHeader === 'function') mod.initHeader('');
            }
        } catch (e) {
            console.warn('[header] normalize failed:', e);
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    setTimeout(run, 500);
}
normalizeHomeHeader();

// 관리자 로그인 성공 후 페이지 이동 전/복원 시 로그인 버튼 스피너가 남는 현상 방지.
function resetAdminLoginButton() {
    try {
        const btn = document.getElementById('hdr-admin-submit');
        if (!btn) return;
        const txt = btn.querySelector('.btn-text');
        const spin = btn.querySelector('.fa-spinner');
        btn.disabled = false;
        if (txt) txt.style.opacity = '1';
        if (spin) spin.classList.add('hidden');
    } catch (e) {}
}

function initAdminLoginLoadingGuard() {
    document.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('#hdr-admin-submit');
        if (!btn) return;
        // 정상 로그인은 admin.html로 이동하지만, 브라우저/인증 상태 재렌더링으로 같은 화면에 남는 경우 스피너를 복구합니다.
        setTimeout(() => {
            if (!CURRENT_FILE.endsWith('admin.html')) resetAdminLoginButton();
        }, 3500);
    }, true);

    document.addEventListener('click', (e) => {
        if (e.target?.closest?.('#btn-admin-login')) setTimeout(resetAdminLoginButton, 0);
    }, true);

    window.addEventListener('pageshow', resetAdminLoginButton);
}
initAdminLoginLoadingGuard();

// 책자/제본 견적 하단 권당 단가 표시 보정.
// 여러 견적 항목이 섞인 경우 단일 품목 권당가처럼 보이지 않도록 "평균 권당 단가"로 표시합니다.
function parseWon(text) {
    const n = Number(String(text || '').replace(/[^0-9]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function formatWon(value) {
    return `${Math.round(Number(value) || 0).toLocaleString('ko-KR')}원`;
}

function patchBookUnitPriceLabel() {
    if (CURRENT_FILE !== 'quote-book.html') return;

    const box = document.getElementById('priceBreakdown');
    if (!box) return;

    const finalLabel = Array.from(box.querySelectorAll('span')).find(el => (el.textContent || '').includes('최종 결제 금액'));
    const finalAmountEl = finalLabel?.parentElement?.querySelector('span:last-child');
    const finalPrice = parseWon(finalAmountEl?.textContent || '');
    if (!finalPrice) return;

    const quantities = Array.from(document.querySelectorAll('.quote-item .quantity'))
        .map(el => Number(el.value || 0))
        .filter(n => Number.isFinite(n) && n > 0);
    const totalQty = quantities.reduce((sum, n) => sum + n, 0);
    if (!totalQty) return;

    const unitPrice = Math.round((finalPrice / totalQty) / 10) * 10;
    const label = quantities.length > 1 ? '평균 권당 단가' : '권당 단가';
    const qtyText = quantities.length > 1 ? `총 ${totalQty.toLocaleString('ko-KR')}부` : `${totalQty.toLocaleString('ko-KR')}부`;

    const target = Array.from(box.querySelectorAll('span'))
        .find(el => /권당 단가|평균 권당 단가/.test(el.textContent || ''))
        ?.closest('div');

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
            requestAnimationFrame(() => {
                scheduled = false;
                patchBookUnitPriceLabel();
            });
        };

        const observer = new MutationObserver(schedule);
        observer.observe(box, { childList: true, subtree: true, characterData: true });
        document.addEventListener('input', (e) => {
            if (e.target?.closest?.('.quote-item')) setTimeout(schedule, 0);
        }, true);
        document.addEventListener('change', (e) => {
            if (e.target?.closest?.('.quote-item')) setTimeout(schedule, 0);
        }, true);
        schedule();
        return true;
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else if (!bind()) setTimeout(bind, 800);
}
initBookUnitPricePatch();
