// ============================================================
// index.js — 홈 페이지 로직
//
// 주요 기능:
//   - 회사 정보, 포트폴리오, 공지사항 로딩 (Firestore)
//   - 팝업 공지사항 표시
//   - 환영 메시지 (비회원 세션 시 이름 표시)
// ============================================================

import { app, auth, db, storage,
         onAuthStateChanged, signOut, signInAnonymously,
         setPersistence, browserLocalPersistence,
         doc, getDoc, collection, query, where,
         orderBy, limit, getDocs, onSnapshot,
} from "../firebase.js";
import { initHeader } from "../header.js";
import "../overlays.js";
import "../session.js";

document.addEventListener("DOMContentLoaded", () => {
  initHeader("index");
  try { loadNotices(); } catch(e) { console.error("[index] loadNotices failed:", e); }
  try { loadPortfolio(); } catch(e) { console.error("[index] loadPortfolio failed:", e); }
});

// ... (기존 인증 및 기본 로직 유지 - 변경 없음) ...
try { window.auth = auth; } catch(e) {}
try { window.signOut = signOut; } catch(e) {}
try { window.signInAnonymously = signInAnonymously; } catch(e) {}
try { window.onAuthStateChanged = onAuthStateChanged; } catch(e) {}
try { window.__currentUser = auth.currentUser || null; } catch(e) {}
try { window.currentUser = auth.currentUser || null; } catch(e) {}
try { window.__AUTH_READY = false; } catch(e) {}

onAuthStateChanged(auth, (u) => {
    try { window.__currentUser = u || null; } catch(e) {}
    try { window.currentUser = u || null; } catch(e) {}
    try { window.__AUTH_READY = true; } catch(e) {}
    try { window.updateAuthLabels && window.updateAuthLabels(); } catch(e) {}
});

try {
  await setPersistence(auth, browserLocalPersistence);
} catch (e) {
  console.warn("[index] setPersistence failed:", e);
}
try {
    if (!auth.currentUser) {
        const __sup = sessionStorage.getItem('suppressAnonOnce');
        if (__sup) {
            try { sessionStorage.removeItem('suppressAnonOnce'); } catch(e) {}
        } else {
            await signInAnonymously(auth);
        }
    }
} catch (e) {
    console.warn('[index] anonymous sign-in failed:', e);
}

// ... (getUserRole, redirectIfAdmin, hardLogout 등 유틸리티 함수 유지) ...
async function getUserRole(user) {
    if (!user || !user.uid) return null;
    const cached = sessionStorage.getItem('userRole');
    if (cached) return cached;
    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const role = snap.exists() ? (snap.data().role || 'user') : 'user';
        sessionStorage.setItem('userRole', role);
        return role;
    } catch (e) {
        return null;
    }
}

async function redirectIfAdmin(user) {
    const role = await getUserRole(user);
    if (role === 'admin' && !location.pathname.endsWith('admin.html')) {
        location.replace('admin.html');
        return true;
    }
    return false;
}

window.hardLogout = async function(redirectUrl = 'index.html') {
    // ... (기존 hardLogout 로직 유지) ...
    try { sessionStorage.clear(); } catch (e) {}
    // ... (생략: 기존 코드와 동일) ...
    try {
        if (typeof auth !== 'undefined' && auth && typeof signOut === 'function') {
            await signOut(auth);
        } else if (window.auth && typeof window.auth.signOut === 'function') {
            await window.auth.signOut();
        }
    } catch (e) {}
    location.replace(redirectUrl || 'index.html');
}

// ... (UI 요소 바인딩 및 notice 로직 유지) ...
const userMenuBtn = document.getElementById('user-menu-btn');
const userMenuModal = document.getElementById('userMenuModal');
const closeUserMenuBtn = document.getElementById('closeUserMenuBtn');
const userMenuStatus = document.getElementById('userMenuStatus');
const btnMyPage = document.getElementById('userMenuGoMyPageBtn');
const btnLogin = document.getElementById('userMenuGoLoginBtn');
const btnLogout = document.getElementById('userMenuLogoutBtn');
const btnGuestLookup = document.getElementById('guest-lookup-open');
const loadingOverlay = document.getElementById('loading-overlay');

function sanitizeHTML(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, (m) => map[m]);
}
// ... (sanitizeNoticeHtml, renderNoticeContent 등 유지) ...
function sanitizeNoticeHtml(html) {
    // ... (기존 코드 유지) ...
    try {
        const allowedTags = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
        // ... (생략) ...
        const docx = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
        return docx.body.firstElementChild.innerHTML || '';
    } catch(e) { return ''; }
}
function renderNoticeContent(data) {
    const html = (data && data.contentHtml) ? sanitizeNoticeHtml(data.contentHtml) : '';
    if (html) return html;
    return sanitizeHTML((data && data.content) ? data.content : '').replace(/\n/g, '<br>');
}

function toggleUserMenu() {
    if (!userMenuModal) return;
    if (userMenuModal.classList.contains('hidden')) {
        userMenuModal.classList.remove('hidden');
        userMenuModal.classList.add('flex');
    } else {
        userMenuModal.classList.add('hidden');
        userMenuModal.classList.remove('flex');
    }
}

userMenuBtn?.addEventListener('click', (e) => { e.stopPropagation(); toggleUserMenu(); });
closeUserMenuBtn?.addEventListener('click', toggleUserMenu);
userMenuModal?.addEventListener('click', (e) => { if (e.target === userMenuModal) toggleUserMenu(); });

// Header Scroll Effect (Glass)
window.addEventListener('scroll', () => {
    const header = document.getElementById('main-header');
    if (!header) return;
    if (window.scrollY > 10) header.classList.add('glass-header');
    else header.classList.remove('glass-header');
});

// Auth State Changed Logic
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.__anonAttempted) {
            window.__anonAttempted = true;
            try { try {
  await setPersistence(auth, browserLocalPersistence);
} catch (e) {
  console.warn("[index] setPersistence failed:", e);
} } catch (e) {}
            try { await signInAnonymously(auth); return; } catch (e) {}
        }
    } 
    // ... (기존 상태 처리 로직 유지) ...
    try { window.__currentFirebaseUser = user; } catch(e) {}
    try { window.__currentUser = user || null; } catch(e) {}
    try { window.currentUser = user || null; } catch(e) {}

    loadingOverlay.style.opacity = '0';
    setTimeout(() => loadingOverlay.style.display = 'none', 500);

    if(btnMyPage) btnMyPage.style.display = 'none';
    if(btnLogin) btnLogin.style.display = 'none';
    if(btnLogout) btnLogout.style.display = 'none';
    if(btnGuestLookup) btnGuestLookup.style.display = 'none';

    const hasGuestSession = (()=>{
        try{
            const c = sessionStorage.getItem('guestContact') || '';
            const p = sessionStorage.getItem('guestPwLast4') || '';
            const k = sessionStorage.getItem('guestLookupKey') || '';
            return (!!k) || (!!c && !!p);
        }catch(e){ return false; }
    })();

    if (!user || user.isAnonymous) {
        if (hasGuestSession) {
            const guestName = (sessionStorage.getItem('guestName') || '비회원');
            userMenuStatus.innerHTML = `<span class="font-bold text-slate-800">${guestName}</span>님<br><span class="text-xs text-slate-400">조회 세션 유효함</span>`;
            if(btnMyPage) { btnMyPage.style.display = 'block'; btnMyPage.onclick = () => location.href = 'mypage.html?guest=1'; }
            if(btnLogout) btnLogout.style.display = 'block';
        } else {
            userMenuStatus.innerHTML = '<span class="font-bold text-slate-800">방문자</span>님 환영합니다.<br><span class="text-xs text-slate-400">로그인이 필요합니다.</span>';
            if(btnLogin) btnLogin.style.display = 'block';
            if(btnGuestLookup) btnGuestLookup.style.display = 'block';
            sessionStorage.removeItem('userName');
        }
        loadRecentQuotes();
        loadRecentInquiries();
    } else {
        loadRecentQuotes();
        loadRecentInquiries();
        let isAdmin = false;
        let userName = "고객";
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if(userDocSnap.exists()) {
                const data = userDocSnap.data();
                isAdmin = (data.role === 'admin');
                userName = data.name || "고객";
                sessionStorage.setItem('userName', userName);
            }
        } catch(e) {}

        userMenuStatus.innerHTML = `<span class="font-bold text-brand-700">${userName}</span>님<br><span class="text-xs text-slate-400">${isAdmin ? '관리자 계정' : ''}</span>`;
        if(isAdmin) { await redirectIfAdmin(user); return; } 
        else { if(btnMyPage) btnMyPage.onclick = () => location.href = 'mypage.html'; }
        
        if(btnMyPage) btnMyPage.style.display = 'block';
        if(btnLogout) btnLogout.style.display = 'block';
    }
    if (window.updateAuthLabels) window.updateAuthLabels();
});

btnLogout?.addEventListener('click', async () => { await window.hardLogout('index.html'); });


// ─────────────────────────────────────────────────────────────
// [수정됨] Load Recent Quotes (Corporate Table Style)
// ─────────────────────────────────────────────────────────────
function loadRecentQuotes() {
    const container = document.getElementById('recent-quotes-container');
    if (!container) return;
    try {
        const q = query(collection(db, 'quotes'), where('isGuest','==', true), where('userId','==','guest'), orderBy('createdAt', 'desc'), limit(10));
        onSnapshot(q, (snap) => {
            container.innerHTML = '';
            if (snap.empty) {
                container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>최근 접수 내역이 없습니다.</p></div>';
                return;
            }

            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                const name = data.ordererName || data.userName || data.name || '무명';
                const maskedName = name.length > 2 ? (name.substring(0, 1) + '*' + name.substring(name.length - 1)) : (name[0] + '*');
                const title = data.orderName || '제목 없음';
                
                const pType = (data.productType || data.category || '').toString().toLowerCase();
                let typeLabel = '';
                // Badge style: compact & square
                let typeClass = 'bg-slate-100 text-slate-500 border border-slate-200';
                if (pType === 'book') { typeLabel = '책자'; typeClass = 'bg-slate-800 text-white border border-slate-800'; }
                else if (pType === 'print') { typeLabel = '인쇄'; typeClass = 'bg-white text-slate-700 border border-slate-300'; }
                else if (pType) { typeLabel = pType; }

                const status = data.status || '접수대기';
                let statusColor = 'text-slate-500';
                if (status.includes('접수') || status === '신규') { statusColor = 'text-slate-500'; }
                else if (status.includes('제작') || status.includes('진행')) { statusColor = 'text-blue-600 font-bold'; }
                else if (status.includes('완료') || status.includes('발송')) { statusColor = 'text-brand-600 font-bold'; }

                const div = document.createElement('div');
                // Row Style for Table
                div.className = 'grid grid-cols-12 gap-2 px-6 py-3 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors text-sm';
                
                div.innerHTML = `
                    <div class="col-span-3 md:col-span-2 text-slate-700 font-medium truncate">
                        ${maskedName}
                    </div>
                    
                    <div class="col-span-6 md:col-span-7 flex items-center gap-2 min-w-0">
                        ${typeLabel ? `<span class="inline-flex items-center justify-center h-5 px-1.5 text-[10px] rounded font-bold ${typeClass} flex-shrink-0">${typeLabel}</span>` : ``}
                        <span class="text-slate-700 truncate cursor-default" title="${sanitizeHTML(title)}">${sanitizeHTML(title)}</span>
                    </div>
                    
                    <div class="col-span-3 text-right">
                        <span class="text-xs ${statusColor}">
                            ${status}
                        </span>
                    </div>
                `;
                container.appendChild(div);
            });
        });
    } catch (err) {}
}

// ─────────────────────────────────────────────────────────────
// [수정됨] Load Recent QnA (Corporate Table Style)
// ─────────────────────────────────────────────────────────────
function loadRecentInquiries() {
    const container = document.getElementById('recent-qna-container');
    if(!container) return;
    try {
        const q = query(collection(db, "qna"), orderBy("createdAt", "desc"), limit(8));
        onSnapshot(q, (snap) => {
            container.innerHTML = '';
            if(snap.empty) {
                container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>등록된 문의가 없습니다.</p></div>';
                return;
            }
            
            snap.forEach(doc => {
                const data = doc.data();
                const isSecret = data.isSecret;
                const isAnswered = !!data.answer;
                const title = isSecret ? "비밀글입니다." : (data.title || "제목 없음");
                
                let dateStr = '-';
                if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                    const d = data.createdAt.toDate();
                    dateStr = `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
                }
                
                const div = document.createElement('div');
                div.className = "grid grid-cols-12 gap-2 px-6 py-3 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors cursor-pointer group text-sm";
                
                div.innerHTML = `
                    <div class="col-span-2 text-center">
                        <span class="inline-block w-14 py-0.5 rounded text-[10px] font-bold border ${isAnswered ? 'bg-white text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}">
                            ${isAnswered ? '답변완료' : '대기중'}
                        </span>
                    </div>
                    <div class="col-span-7 md:col-span-8 min-w-0">
                        <div class="truncate text-slate-700 group-hover:text-brand-700 group-hover:underline decoration-brand-200 underline-offset-2 transition-all">
                            ${isSecret ? '<i class="fas fa-lock text-[10px] text-slate-400 mr-1.5"></i>' : ''}${sanitizeHTML(title)}
                        </div>
                        ${(!isSecret && isAnswered && data.answer) ? `<div class="text-xs text-slate-400 truncate mt-0.5">↳ ${sanitizeHTML(String(data.answer).replace(/\s+/g,' ').trim())}</div>` : ``}
                    </div>
                    <div class="col-span-3 md:col-span-2 text-right text-xs text-slate-400 font-mono">
                        ${dateStr}
                    </div>
                `;
                div.onclick = () => location.href = 'qna.html'; 
                container.appendChild(div);
            });
        });
    } catch (err) {}
}

// ... (loadNotices, loadPortfolio 등 나머지 함수는 로직 유지하되, 일부 디자인 클래스만 HTML에서 변경됨) ...
// loadNotices와 loadPortfolio는 기존 로직을 그대로 사용해도 HTML 클래스 변경으로 인해 스타일이 자동 적용됩니다.
// 다만 Portfolio의 카드 스타일은 여기서 약간 조정합니다.

// ── 공지사항 로딩 ───────────────────────────────────────────
// Firestore notices 컬렉션에서 최신 공지를 불러와 화면에 표시
async function loadNotices() {
    const container = document.getElementById('notice-list-container');
    const modal = document.getElementById('notice-modal');
    
    try {
        // 공지사항 최근 8개 호출 (QnA와 동일하게 제한)
        const q = query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(8));
        const snap = await getDocs(q);
        
        if (snap.empty && container) {
            container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>등록된 공지사항이 없습니다.</p></div>';
        } else if (container) {
            let notices = [];
            snap.forEach(doc => notices.push({ id: doc.id, ...doc.data() }));
            
            // 중요 공지(isImportant)가 항상 상단에 위치하도록 로컬 정렬
            notices.sort((a, b) => {
                if (a.isImportant && !b.isImportant) return -1;
                if (!a.isImportant && b.isImportant) return 1;
                return 0; // 둘 다 중요이거나 둘 다 일반이면, 기본 쿼리의 최신순(createdAt) 유지
            });

            container.innerHTML = '';
            notices.forEach(data => {
                const isImportant = data.isImportant;
                const title = data.title || "제목 없음";
                
                let dateStr = '-';
                if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                    const d = data.createdAt.toDate();
                    dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
                }
                
                const div = document.createElement('div');
                div.className = "grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors cursor-pointer group text-sm";
                
                div.innerHTML = `
                    <div class="col-span-2 text-center">
                        ${isImportant 
                            ? `<span class="inline-block w-10 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">중요</span>` 
                            : `<span class="inline-block w-10 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">공지</span>`
                        }
                    </div>
                    <div class="col-span-7 min-w-0">
                        <div class="truncate text-slate-700 group-hover:text-brand-700 group-hover:underline decoration-brand-200 underline-offset-2 transition-all">
                            ${sanitizeHTML(title)}
                        </div>
                    </div>
                    <div class="col-span-3 text-right text-xs text-slate-400 font-mono">
                        ${dateStr}
                    </div>
                `;
                div.onclick = () => openNoticeModal(data); 
                container.appendChild(div);
            });
        }

        // 모달 열기 로직 (기존 유지)
        function openNoticeModal(data) {
            const mt = document.getElementById('notice-modal-title');
            const md = document.getElementById('notice-modal-date');
            const mc = document.getElementById('notice-modal-content');
            const bd = document.getElementById('notice-badge');
            
            mt.textContent = data.title;
            md.textContent = data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toLocaleDateString() : '';
            mc.innerHTML = renderNoticeContent(data);
            if(data.isImportant) bd.classList.remove('hidden'); else bd.classList.add('hidden');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        document.getElementById('close-notice-modal-btn').onclick = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        modal.onclick = (e) => { if(e.target === modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } }

        // 팝업 로직 (기존 유지)
        try {
            const popupQ = query(collection(db, "notices"), where("isPopup", "==", true), orderBy("createdAt", "desc"), limit(1));
            const popupSnap = await getDocs(popupQ);
            if (!popupSnap.empty) {
                const popupDoc = popupSnap.docs[0];
                const popupData = popupDoc.data();
                const popupNotice = { id: popupDoc.id, ...popupData };
                
                const modal2 = document.getElementById('notice-popup-modal');
                const titleEl = document.getElementById('notice-popup-title');
                const contentEl = document.getElementById('notice-popup-content');
                const closeBtn = document.getElementById('notice-popup-close-btn');
                const okBtn = document.getElementById('notice-popup-confirm-btn');
                const hideToday = document.getElementById('notice-popup-hide-today');

                const getLocalDateKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
                const shouldSkipPopup = () => {
                    try {
                        const raw = localStorage.getItem('notice_popup_hide');
                        if (!raw) return false;
                        const obj = JSON.parse(raw);
                        return obj && obj.date === getLocalDateKey() && obj.id === popupNotice.id;
                    } catch (_) { return false; }
                };
                
                if (!shouldSkipPopup()) {
                    titleEl.textContent = popupNotice.title || '';
                    contentEl.innerHTML = renderNoticeContent(popupNotice);
                    modal2.classList.remove('hidden');
                    modal2.classList.add('flex');
                    
                    const closePopup = () => {
                        if (hideToday.checked) {
                            try { localStorage.setItem('notice_popup_hide', JSON.stringify({ date: getLocalDateKey(), id: popupNotice.id })); } catch (_) {}
                        }
                        modal2.classList.add('hidden'); modal2.classList.remove('flex');
                        hideToday.checked = false;
                    };
                    closeBtn.onclick = closePopup;
                    okBtn.onclick = closePopup;
                    modal2.onclick = (e) => { if(e.target===modal2) closePopup(); };
                }
            }
        } catch(ex){}

    } catch (err) {
        console.error("공지사항 로드 중 오류: ", err);
    }
}

async function loadPortfolio() {
    try {
        const docRef = doc(db, "settings", "homepageContent");
        const grid = document.getElementById('portfolio-grid');
        const pager = document.getElementById('portfolio-page-controls');

        // ===== Modal (Prev/Next) =====
        const openImageModal = (index) => {
            const m = document.getElementById('portfolio-image-modal');
            const i = document.getElementById('portfolio-image-img');
            const t = document.getElementById('portfolio-image-title');
            const d = document.getElementById('portfolio-image-desc');
            const prevBtn = document.getElementById('portfolio-modal-prev');
            const nextBtn = document.getElementById('portfolio-modal-next');

            const all = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
            if (!all.length) return;

            const norm = (n) => (n % all.length + all.length) % all.length;
            window.__portfolioModalIndex = norm(Number(index) || 0);

            const render = () => {
                const item = all[window.__portfolioModalIndex] || {};
                i.src = sanitizeHTML(item?.imageUrl || '');
                t.textContent = item?.title || 'Portfolio';
                d.textContent = item?.description || item?.desc || '';
            };

            if (!window.__portfolioModalNavBound) {
                window.__portfolioModalNavBound = true;

                prevBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const all2 = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
                    if (!all2.length) return;
                    window.__portfolioModalIndex = (window.__portfolioModalIndex - 1 + all2.length) % all2.length;
                    render();
                });
                nextBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const all2 = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
                    if (!all2.length) return;
                    window.__portfolioModalIndex = (window.__portfolioModalIndex + 1) % all2.length;
                    render();
                });

                // keyboard (←/→/Esc)
                window.addEventListener('keydown', (e) => {
                    const modal = document.getElementById('portfolio-image-modal');
                    if (!modal || modal.classList.contains('hidden')) return;
                    if (e.key === 'Escape') {
                        closeImageModal();
                        return;
                    }
                    if (e.key === 'ArrowLeft') {
                        prevBtn?.click();
                    } else if (e.key === 'ArrowRight') {
                        nextBtn?.click();
                    }
                });

                document.getElementById('close-portfolio-image-modal-btn')?.addEventListener('click', closeImageModal);
                document.getElementById('portfolio-image-modal')?.addEventListener('click', (e) => {
                    if (e.target === document.getElementById('portfolio-image-modal')) closeImageModal();
                });
            }

            render();
            m.classList.remove('hidden');
            m.classList.add('flex');
        };

        const closeImageModal = () => {
            const m = document.getElementById('portfolio-image-modal');
            const i = document.getElementById('portfolio-image-img');
            i.src = '';
            m.classList.add('hidden');
            m.classList.remove('flex');
        };

        // ===== Render (Grid + Pager) =====
        window.__portfolioMainPerPage = 9;
        window.__portfolioMainPage = window.__portfolioMainPage || 1;

        const renderPager = (page, totalPages) => {
            if (!pager) return;
            if (totalPages <= 1) {
                pager.classList.add('hidden');
                pager.innerHTML = '';
                return;
            }
            pager.classList.remove('hidden');
            pager.innerHTML = '';

            const btnClass = "w-8 h-8 flex items-center justify-center rounded border text-xs font-bold transition-colors ";
            const activeClass = "bg-slate-800 text-white border-slate-800";
            const inactiveClass = "bg-white text-slate-500 border-slate-200 hover:bg-slate-50";

            const mkBtn = (label, pageNum, isActive) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.className = btnClass + (isActive ? activeClass : inactiveClass);
                b.onclick = () => renderMainPage(pageNum);
                return b;
            };

            let start = Math.max(1, page - 2);
            let end = Math.min(totalPages, start + 4);

            if (page > 1) pager.appendChild(mkBtn('<', page - 1));
            for (let i = start; i <= end; i++) pager.appendChild(mkBtn(i, i, i === page));
            if (page < totalPages) pager.appendChild(mkBtn('>', page + 1));
        };

        const renderMainPage = (page) => {
            const list = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
            const perPage = window.__portfolioMainPerPage;
            const totalPages = Math.max(1, Math.ceil(list.length / perPage));
            const safePage = Math.min(Math.max(1, page), totalPages);
            window.__portfolioMainPage = safePage;

            if (!grid) return;
            grid.innerHTML = '';

            if (!list.length) {
                grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-300 text-sm">등록된 포트폴리오가 없습니다.</div>';
                renderPager(1, 1);
                return;
            }

            const startIdx = (safePage - 1) * perPage;
            const slice = list.slice(startIdx, startIdx + perPage);

            slice.forEach((item, __i) => {
                const div = document.createElement('div');
                div.className = 'group relative aspect-square bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer';
                div.innerHTML = `
                    <img src="${sanitizeHTML(item.imageUrl)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="pf">
                    <div class="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span class="text-white font-bold border border-white px-3 py-1 text-xs uppercase tracking-widest">View</span>
                    </div>
                `;
                div.onclick = () => openImageModal(startIdx + __i);
                grid.appendChild(div);
            });

            renderPager(safePage, totalPages);
        };

        const applyList = (raw) => {
            const list = Array.isArray(raw) ? raw.slice().reverse() : [];
            window.__portfolioAll = list;

            // 현재 페이지가 범위를 벗어나면 자동 보정
            const totalPages = Math.max(1, Math.ceil(list.length / window.__portfolioMainPerPage));
            if ((window.__portfolioMainPage || 1) > totalPages) window.__portfolioMainPage = totalPages;

            renderMainPage(window.__portfolioMainPage || 1);

            // 모달이 열려있고, 삭제/추가로 길이가 바뀐 경우 index 보정
            try {
                const modal = document.getElementById('portfolio-image-modal');
                if (modal && !modal.classList.contains('hidden') && list.length) {
                    const norm = (n) => (n % list.length + list.length) % list.length;
                    window.__portfolioModalIndex = norm(window.__portfolioModalIndex || 0);
                    // 강제로 재렌더
                    const i = document.getElementById('portfolio-image-img');
                    const t = document.getElementById('portfolio-image-title');
                    const d = document.getElementById('portfolio-image-desc');
                    const item = list[window.__portfolioModalIndex] || {};
                    i.src = sanitizeHTML(item?.imageUrl || '');
                    t.textContent = item?.title || 'Portfolio';
                    d.textContent = item?.description || item?.desc || '';
                }
                if (modal && !modal.classList.contains('hidden') && !list.length) {
                    closeImageModal();
                }
            } catch(e) {}
        };

        // ===== Real-time listener (삭제/추가가 index에 즉시 반영) =====
        if (typeof window.__portfolioSettingsUnsub === 'function') {
            try { window.__portfolioSettingsUnsub(); } catch(e) {}
        }
        window.__portfolioSettingsUnsub = onSnapshot(docRef, (snap) => {
            const data = snap.exists() ? snap.data() : {};
            applyList(data?.portfolio || []);
        }, (err) => {
            console.error("포트폴리오 실시간 리스너 오류:", err);
            if (pager) { pager.classList.add('hidden'); pager.innerHTML = ''; }
            if (grid) grid.innerHTML = '<div class="col-span-full text-center py-10 text-red-300 text-sm">포트폴리오를 불러오지 못했습니다. (권한/네트워크 확인)</div>';
        });

    } catch (err) {
        try {
            console.error("포트폴리오 로드 오류:", err);
            const grid = document.getElementById('portfolio-grid');
            const pager = document.getElementById('portfolio-page-controls');
            if (pager) { pager.classList.add('hidden'); pager.innerHTML = ''; }
            if (grid) grid.innerHTML = '<div class="col-span-full text-center py-10 text-red-300 text-sm">포트폴리오를 불러오지 못했습니다. (권한/네트워크 확인)</div>';
        } catch (_) {}
    }
}

// ... (Guest Lookup Form Logic, Mobile Nav Logic - 기존 코드와 동일) ...
function normalizePhone(input) {
    const digits = (input || '').replace(/\D/g, '');
    if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    return input || '';
}

function utf8ToBytes(str) { return new TextEncoder().encode(str); }
async function sha256Hex(str) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (subtle && globalThis.isSecureContext) {
        const digest = await subtle.digest('SHA-256', utf8ToBytes(str));
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
    }
    return "fallback_hash_not_secure_context"; 
}

const guestModal = document.getElementById('guest-lookup-overlay');
const guestCloseBtn = document.getElementById('guest-lookup-close');
const guestForm = document.getElementById('guest-lookup-form');
const guestErr = document.getElementById('guest-err');
const guestNameInput = document.getElementById('guestName');
const guestContactInput = document.getElementById('guestContact');
const guestPasswordInput = document.getElementById('guestPassword');

btnGuestLookup?.addEventListener('click', (e) => {
    e.preventDefault();
    userMenuModal?.classList.add('hidden'); userMenuModal?.classList.remove('flex');
    guestModal?.classList.remove('hidden'); guestModal?.classList.add('flex');
    setTimeout(() => guestNameInput?.focus(), 50);
});

guestCloseBtn?.addEventListener('click', () => {
    guestModal.classList.add('hidden'); guestModal.classList.remove('flex');
    guestErr.classList.add('hidden');
    guestForm.reset();
});

guestContactInput?.addEventListener('input', (e) => {
    e.target.value = normalizePhone(e.target.value);
});

guestForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    guestErr.classList.add('hidden');
    const name = guestNameInput.value.trim();
    const contactRaw = guestContactInput.value.trim();
    const contact = contactRaw.replace(/[^0-9]/g, ''); 
    const password = guestPasswordInput.value.trim();
    
    if (!name || !contact || !password) { guestErr.classList.remove('hidden'); return; }

    try {
        const pwLast4 = (contact||'').toString().replace(/[^0-9]/g,'').slice(-4);
        if(password !== pwLast4){ guestErr?.classList.remove('hidden'); return; }

        const key = await sha256Hex(`${name}|${contact}|${pwLast4}`);
        const legacyKey = await sha256Hex(`${name}|${contactRaw}|${pwLast4}`);
        
        if(legacyKey) sessionStorage.setItem('guestLookupKeyLegacy', legacyKey);
        sessionStorage.setItem('guestLookupKey', key);
        sessionStorage.setItem('guestName', name);
        sessionStorage.setItem('guestContact', contact);
        sessionStorage.setItem("guestPwLast4", password);

         try{
             if(legacyKey) localStorage.setItem('guestLookupKeyLegacy', legacyKey);
             localStorage.setItem('guestLookupKey', key);
             localStorage.setItem('guestName', name);
             localStorage.setItem('guestContact', contact);
             localStorage.setItem('guestPwLast4', pwLast4);
         }catch(e){}
         location.href = 'mypage.html?guest=1';
    } catch (ex) {
        guestErr.classList.remove('hidden');
    }
});

// Mobile Nav
const mobileNavBtn = document.getElementById('mobile-nav-btn'); // 헤더에서 이 ID가 없을 수 있으므로 체크
const mobileNavModal = document.getElementById('mobileNavModal');
const closeMobileNavBtn = document.getElementById('closeMobileNavBtn');
function openMobileNav() { mobileNavModal?.classList.remove('hidden'); mobileNavModal?.classList.add('flex'); }
function closeMobileNav() { mobileNavModal?.classList.add('hidden'); mobileNavModal?.classList.remove('flex'); }
// Header JS에서 바인딩하는 경우 충돌 방지
// 여기서는 직접 바인딩 안하고 Header 로직에 맡기거나, 필요한 경우에만 추가.
// (헤더 모듈에서 처리하므로 여기서는 생략 가능하지만, 비상용으로 둠)
mobileNavBtn?.addEventListener('click', openMobileNav);
closeMobileNavBtn?.addEventListener('click', closeMobileNav);
mobileNavModal?.addEventListener('click', closeMobileNav);

// User Menu Info Edit
document.getElementById('userMenuEditInfoBtn')?.addEventListener('click', () => { window.location.href = 'mypage.html#profile-edit'; });

// Logout Bind
(() => {
  const btn = document.getElementById('userMenuLogoutBtn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    try { document.getElementById('userMenuModal')?.classList.add('hidden'); } catch (err) {}
    window.hardLogout();
  });
})();