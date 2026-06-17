// 사이트 점검 모드 체크 + 공통 UI 보정
// settings/site 또는 settings/homepageContent 문서의 점검 플래그가 true이면 관리자가 아닌 사용자를 maintenance.html로 리다이렉트.
import {
    auth, db,
    doc, getDoc, onAuthStateChanged, onSnapshot,
    collection, query, where, orderBy, limit, getDocs,
} from "./firebase.js";

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

    const directFlags = [
        data.maintenance,
        data.maintenanceMode,
        data.isMaintenance,
        data.isMaintenanceMode,
        data.siteMaintenance,
        data.siteMaintenanceMode,
        data.homepageMaintenance,
        data.homepageMaintenanceMode,
    ];
    if (directFlags.some(v => v === true || v === 'true' || v === 1 || v === '1' || v === 'on' || v === 'ON')) return true;

    const nested = data.site || data.homepage || data.settings || null;
    if (nested && typeof nested === 'object') {
        return hasMaintenanceFlag(nested);
    }
    return false;
}

const MAINTENANCE_DOCS = [
    ["settings", "site"],
    ["settings", "homepageContent"],
];

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
    try { sessionStorage.setItem('maintenanceReturnUrl', location.pathname + location.search); } catch (e) {}
    try { document.documentElement.style.background = '#0f172a'; document.body.style.visibility = 'hidden'; } catch (e) {}
    location.replace('maintenance.html');
}

function startMaintenanceWatch() {
    let states = new Map();
    let redirected = false;

    const evaluate = () => {
        if (redirected) return;
        const anyOn = Array.from(states.values()).some(Boolean);
        if (anyOn) {
            redirected = true;
            redirectToMaintenance();
        }
    };

    MAINTENANCE_DOCS.forEach(([col, id]) => {
        try {
            onSnapshot(doc(db, col, id), (snap) => {
                states.set(`${col}/${id}`, snap.exists() && hasMaintenanceFlag(snap.data()));
                evaluate();
            }, (e) => {
                console.warn(`[maintenance] realtime watch failed ${col}/${id}:`, e);
            });
        } catch (e) {
            console.warn(`[maintenance] watch setup failed ${col}/${id}:`, e);
        }
    });
}

(async () => {
    try {
        if (IS_MAINTENANCE_PAGE || IS_ADMIN_PAGE) return;
        if (await isVerifiedAdmin()) return;
        if (await readMaintenanceState()) {
            redirectToMaintenance();
            return;
        }
        startMaintenanceWatch();
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

// 메인페이지 푸터에 이용안내 / 개인정보처리방침 / 이용약관 링크를 보정 표시합니다.
function initFooterLegalLinks() {
    const run = () => {
        try {
            const footer = document.querySelector('.site-footer') || document.querySelector('footer');
            if (!footer || footer.dataset.legalLinksReady === '1') return;
            footer.dataset.legalLinksReady = '1';

            const links = document.createElement('div');
            links.className = 'flex flex-wrap justify-center md:justify-end gap-x-5 gap-y-1.5 text-xs font-bold mb-2';
            links.innerHTML = `
                <a href="guide.html" class="text-slate-400 hover:text-white transition">이용안내</a>
                <a href="personal-info.html" class="text-slate-400 hover:text-white transition">개인정보처리방침</a>
                <a href="terms.html" class="text-slate-400 hover:text-white transition">이용약관</a>
            `;

            const rightCol = footer.querySelector('.flex.flex-col.items-center.md\\:items-end') || footer.querySelector('.flex.flex-col.items-center') || footer;
            rightCol.insertBefore(links, rightCol.firstChild);
        } catch (e) {
            console.warn('[footer] legal links inject failed:', e);
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    setTimeout(run, 500);
    setTimeout(run, 1500);
}
initFooterLegalLinks();

// 메인 공지사항 로딩 보정.
// 기존 index.js는 일반 공지와 팝업 공지를 Promise.all로 묶어 한쪽 쿼리가 실패하면 전체 공지가 안 뜰 수 있습니다.
function escapeNoticeText(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

function sanitizeNoticeHtmlSafe(html) {
    try {
        const allowed = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
        const docx = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
        Array.from(docx.body.querySelectorAll('*')).reverse().forEach(el => {
            if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
            Array.from(el.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on') || name === 'style' || (name === 'href' && /^javascript:/i.test(attr.value))) {
                    el.removeAttribute(attr.name);
                }
            });
            if (el.tagName === 'A') {
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener noreferrer');
            }
        });
        return docx.body.firstElementChild?.innerHTML || '';
    } catch (e) {
        return '';
    }
}

function renderNoticeBody(data) {
    const html = data?.contentHtml ? sanitizeNoticeHtmlSafe(data.contentHtml) : '';
    if (html) return html;
    return escapeNoticeText(data?.content || '').replace(/\n/g, '<br>');
}

function noticeTimeValue(data) {
    try {
        if (data?.createdAt?.toDate) return data.createdAt.toDate().getTime();
        if (typeof data?.createdAt?.seconds === 'number') return data.createdAt.seconds * 1000;
    } catch (e) {}
    return 0;
}

function formatNoticeDate(data) {
    try {
        const t = noticeTimeValue(data);
        if (!t) return '-';
        const d = new Date(t);
        return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch (e) {
        return '-';
    }
}

async function fetchMainNoticesSafe() {
    try {
        const snap = await getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(8)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('[notice] ordered query failed, fallback:', e);
        try {
            const snap = await getDocs(collection(db, 'notices'));
            return snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => noticeTimeValue(b) - noticeTimeValue(a))
                .slice(0, 8);
        } catch (err) {
            console.warn('[notice] fallback query failed:', err);
            return [];
        }
    }
}

async function fetchPopupNoticeSafe(mainNotices = []) {
    try {
        const snap = await getDocs(query(collection(db, 'notices'), where('isPopup', '==', true), orderBy('createdAt', 'desc'), limit(1)));
        if (!snap.empty) {
            const d = snap.docs[0];
            return { id: d.id, ...d.data() };
        }
    } catch (e) {
        console.warn('[notice] popup query failed, fallback:', e);
    }

    try {
        const fromMain = (Array.isArray(mainNotices) ? mainNotices : [])
            .filter(n => n?.isPopup === true)
            .sort((a, b) => noticeTimeValue(b) - noticeTimeValue(a))[0];
        if (fromMain) return fromMain;

        const snap = await getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(20)));
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(n => n?.isPopup === true)
            .sort((a, b) => noticeTimeValue(b) - noticeTimeValue(a))[0] || null;
    } catch (err) {
        console.warn('[notice] popup fallback failed:', err);
        return null;
    }
}

function openMainNoticeModal(data) {
    const modal = document.getElementById('notice-modal');
    if (!modal) return;
    const titleEl = document.getElementById('notice-modal-title');
    const dateEl = document.getElementById('notice-modal-date');
    const bodyEl = document.getElementById('notice-modal-content');
    const badgeEl = document.getElementById('notice-badge');
    if (titleEl) titleEl.textContent = data?.title || '';
    if (dateEl) {
        const t = noticeTimeValue(data);
        dateEl.textContent = t ? new Date(t).toLocaleDateString('ko-KR') : '';
    }
    if (bodyEl) bodyEl.innerHTML = renderNoticeBody(data);
    if (badgeEl) badgeEl.classList.toggle('hidden', !data?.isImportant);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function bindNoticeModalClose() {
    const modal = document.getElementById('notice-modal');
    const btn = document.getElementById('close-notice-modal-btn');
    if (!modal || modal.dataset.safeNoticeCloseBound === '1') return;
    modal.dataset.safeNoticeCloseBound = '1';
    const close = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
    btn?.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

function renderMainNoticesSafe(notices) {
    const container = document.getElementById('notice-list-container');
    if (!container) return;

    const list = (Array.isArray(notices) ? notices : [])
        .slice()
        .sort((a, b) => ((b.isImportant ? 1 : 0) - (a.isImportant ? 1 : 0)) || (noticeTimeValue(b) - noticeTimeValue(a)));

    if (!list.length) {
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>등록된 공지사항이 없습니다.</p></div>';
        return;
    }

    container.innerHTML = '';
    list.forEach(data => {
        const div = document.createElement('div');
        div.className = 'grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors cursor-pointer group text-sm';
        div.innerHTML = `
          <div class="col-span-2 text-center">
            ${data.isImportant
                ? '<span class="inline-block w-10 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">중요</span>'
                : '<span class="inline-block w-10 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">공지</span>'}
          </div>
          <div class="col-span-7 min-w-0">
            <div class="truncate text-slate-700 group-hover:text-brand-700 group-hover:underline decoration-brand-200 underline-offset-2 transition-all">${escapeNoticeText(data.title || '제목 없음')}</div>
          </div>
          <div class="col-span-3 text-right text-xs text-slate-400 font-mono">${formatNoticeDate(data)}</div>
        `;
        div.addEventListener('click', () => openMainNoticeModal(data));
        container.appendChild(div);
    });
    bindNoticeModalClose();
}

function maybeOpenNoticePopupSafe(popupNotice) {
    if (!popupNotice) return;
    const modal = document.getElementById('notice-popup-modal');
    if (!modal || modal.dataset.safePopupShown === popupNotice.id) return;

    const todayKey = () => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    };
    const shouldSkip = () => {
        try {
            const o = JSON.parse(localStorage.getItem('notice_popup_hide') || 'null');
            return o?.date === todayKey() && o?.id === popupNotice.id;
        } catch (e) {
            return false;
        }
    };
    if (shouldSkip()) return;

    const titleEl = document.getElementById('notice-popup-title');
    const bodyEl = document.getElementById('notice-popup-content');
    const hideToday = document.getElementById('notice-popup-hide-today');
    if (titleEl) titleEl.textContent = popupNotice.title || '';
    if (bodyEl) bodyEl.innerHTML = renderNoticeBody(popupNotice);

    const closePopup = () => {
        if (hideToday?.checked) {
            try { localStorage.setItem('notice_popup_hide', JSON.stringify({ date: todayKey(), id: popupNotice.id })); } catch (e) {}
        }
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        if (hideToday) hideToday.checked = false;
    };

    document.getElementById('notice-popup-close-btn')?.addEventListener('click', closePopup, { once: true });
    document.getElementById('notice-popup-confirm-btn')?.addEventListener('click', closePopup, { once: true });
    modal.addEventListener('click', e => { if (e.target === modal) closePopup(); }, { once: true });

    modal.dataset.safePopupShown = popupNotice.id;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function initSafeMainNoticeLoader() {
    if (CURRENT_FILE !== 'index.html') return;

    const run = async () => {
        const container = document.getElementById('notice-list-container');
        if (!container) return;
        try {
            const notices = await fetchMainNoticesSafe();
            renderMainNoticesSafe(notices);
            const popup = await fetchPopupNoticeSafe(notices);
            maybeOpenNoticePopupSafe(popup);
        } catch (e) {
            console.warn('[notice] safe loader failed:', e);
            container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-red-300 text-sm gap-2 mt-10"><p>공지사항을 불러오지 못했습니다.</p></div>';
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    // 기존 index.js 로딩 실패 또는 늦은 렌더링을 덮기 위한 재시도
    setTimeout(run, 1000);
    setTimeout(run, 3000);
}
initSafeMainNoticeLoader();

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
