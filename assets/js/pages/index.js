import {
  auth, db,
  onAuthStateChanged, signOut, signInAnonymously,
  setPersistence, browserLocalPersistence,
  doc, getDoc, collection, query, where,
  orderBy, limit, getDocs, onSnapshot,
} from "../firebase.js";
import { initHeader } from "../header.js";
import "../overlays.js";
import "../session.js";

// ── 전역 Firebase 브릿지 (인라인 스크립트 호환) ──────────────
window.auth = auth;
window.signOut = signOut;
window.signInAnonymously = signInAnonymously;
window.onAuthStateChanged = onAuthStateChanged;
window.__currentUser = auth.currentUser || null;
window.currentUser   = auth.currentUser || null;
window.__AUTH_READY  = false;

// ── 인증 초기화 ──────────────────────────────────────────────
try { await setPersistence(auth, browserLocalPersistence); } catch(e) { console.warn("[index] setPersistence:", e); }
try {
  if (!auth.currentUser) {
    const suppress = sessionStorage.getItem('suppressAnonOnce');
    if (suppress) {
      try { sessionStorage.removeItem('suppressAnonOnce'); } catch {}
    } else {
      await signInAnonymously(auth);
    }
  }
} catch(e) { console.warn('[index] anon sign-in:', e); }

// ── 유틸리티 ─────────────────────────────────────────────────
async function getUserRole(user) {
  if (!user?.uid) return null;
  const cached = sessionStorage.getItem('userRole');
  if (cached) return cached;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const role = snap.exists() ? (snap.data().role || 'user') : 'user';
    sessionStorage.setItem('userRole', role);
    return role;
  } catch { return null; }
}

async function redirectIfAdmin(user) {
  const role = await getUserRole(user);
  if (role === 'admin' && !location.pathname.endsWith('admin.html')) {
    location.replace('admin.html');
    return true;
  }
  return false;
}

function sanitizeHTML(str) {
  if (!str) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, m => map[m]);
}

function sanitizeNoticeHtml(html) {
  try {
    const allowedTags = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
    const docx = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    // Reverse order: process deepest nodes first to avoid ancestor removal skipping children
    Array.from(docx.body.querySelectorAll('*')).reverse().forEach(el => {
      if (!allowedTags.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'style' || (name === 'href' && /^javascript:/i.test(attr.value)))
          el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
    });
    return docx.body.firstElementChild?.innerHTML || '';
  } catch { return ''; }
}

function renderNoticeContent(data) {
  const html = data?.contentHtml ? sanitizeNoticeHtml(data.contentHtml) : '';
  if (html) return html;
  return sanitizeHTML(data?.content || '').replace(/\n/g, '<br>');
}

function normalizePhone(input) {
  const d = (input || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  return input || '';
}

async function sha256Hex(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Pure-JS fallback for HTTP / non-secure contexts
    function rightRotate(v, a) { return (v >>> a) | (v << (32 - a)); }
    const maxWord = Math.pow(2, 32);
    let result = '', words = [];
    const asciiBitLength = str.length * 8;
    let hash = [], k = [], primeCounter = 0;
    const isComposite = {};
    for (let c = 2; primeCounter < 64; c++) {
      if (!isComposite[c]) {
        for (let i = c * c; i < 313; i += c) isComposite[i] = true;
        hash[primeCounter]  = (Math.pow(c, 0.5) * maxWord) | 0;
        k[primeCounter++]   = (Math.pow(c, 1/3) * maxWord) | 0;
      }
    }
    str = unescape(encodeURIComponent(str)) + '\x80';
    while (str.length % 64 - 56) str += '\x00';
    for (let i = 0; i < str.length; i++) {
      const j = str.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4 * 8);
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength | 0);
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i-15], w2 = w[i-2], a = hash[0], e = hash[4];
        const t1 = hash[7] + (rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25)) + ((e&hash[5])^((~e)&hash[6])) + k[i] +
          (w[i] = (i<16) ? w[i] : (w[i-16]+(rightRotate(w15,7)^rightRotate(w15,18)^(w15>>>3))+w[i-7]+(rightRotate(w2,17)^rightRotate(w2,19)^(w2>>>10)))|0);
        const t2 = (rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22)) + ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
        hash = [(t1+t2)|0].concat(hash); hash[4] = (hash[4]+t1)|0; hash.length = 8;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i]+oldHash[i])|0;
    }
    for (let i = 0; i < 8; i++)
      for (let j = 3; j+1; j--) { const b = (hash[i] >> (j*8)) & 255; result += (b<16?'0':'') + b.toString(16); }
    return result;
  }
}

// ── DOM 참조 ─────────────────────────────────────────────────
const userMenuModal    = document.getElementById('userMenuModal');
const userMenuStatus   = document.getElementById('userMenuStatus');
const btnMyPage        = document.getElementById('userMenuGoMyPageBtn');
const btnLogin         = document.getElementById('userMenuGoLoginBtn');
const btnLogout        = document.getElementById('userMenuLogoutBtn');
const btnGuestLookup   = document.getElementById('guest-lookup-open');
const loadingOverlay   = document.getElementById('loading-overlay');

// ── 사용자 메뉴 토글 ─────────────────────────────────────────
function toggleUserMenu() {
  if (!userMenuModal) return;
  userMenuModal.classList.toggle('hidden');
  userMenuModal.classList.toggle('flex');
}

document.getElementById('user-menu-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleUserMenu(); });
document.getElementById('closeUserMenuBtn')?.addEventListener('click', toggleUserMenu);
userMenuModal?.addEventListener('click', e => { if (e.target === userMenuModal) toggleUserMenu(); });

window.addEventListener('scroll', () => {
  document.getElementById('main-header')?.classList.toggle('glass-header', window.scrollY > 10);
}, { passive: true });

// ── onSnapshot 핸들 (메모리 누수 방지) ──────────────────────
let _quotesUnsub = null;
let _inquiriesUnsub = null;

// ── 인증 상태 처리 (단일 리스너) ─────────────────────────────
onAuthStateChanged(auth, async user => {
  window.__currentFirebaseUser = user;
  window.__currentUser = user || null;
  window.currentUser   = user || null;
  window.__AUTH_READY  = true;
  window.updateAuthLabels?.();

  if (!user) {
    if (!window.__anonAttempted) {
      window.__anonAttempted = true;
      try { await signInAnonymously(auth); return; } catch {}
    }
  }

  if (loadingOverlay) {
    loadingOverlay.style.opacity = '0';
    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
  }

  [btnMyPage, btnLogin, btnLogout, btnGuestLookup].forEach(b => { if (b) b.style.display = 'none'; });

  const hasGuestSession = (() => {
    try {
      const k = sessionStorage.getItem('guestLookupKey') || '';
      const c = sessionStorage.getItem('guestContact') || '';
      const p = sessionStorage.getItem('guestPwLast4') || '';
      return !!k || (!!c && !!p);
    } catch { return false; }
  })();

  if (!user || user.isAnonymous) {
    if (hasGuestSession) {
      const guestName = sessionStorage.getItem('guestName') || '비회원';
      if (userMenuStatus) userMenuStatus.innerHTML = `<span class="font-bold text-slate-800">${guestName}</span>님<br><span class="text-xs text-slate-400">조회 세션 유효함</span>`;
      if (btnMyPage) { btnMyPage.style.display = 'block'; btnMyPage.onclick = () => { location.href = 'mypage.html?guest=1'; }; }
      if (btnLogout) btnLogout.style.display = 'block';
    } else {
      if (userMenuStatus) userMenuStatus.innerHTML = '<span class="font-bold text-slate-800">방문자</span>님 환영합니다.<br><span class="text-xs text-slate-400">로그인이 필요합니다.</span>';
      if (btnLogin) btnLogin.style.display = 'block';
      if (btnGuestLookup) btnGuestLookup.style.display = 'block';
      sessionStorage.removeItem('userName');
    }
  } else {
    let isAdmin = false, userName = '고객';
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        isAdmin  = data.role === 'admin';
        userName = data.name || '고객';
        sessionStorage.setItem('userName', userName);
      }
    } catch {}
    if (userMenuStatus) userMenuStatus.innerHTML = `<span class="font-bold text-brand-700">${userName}</span>님<br><span class="text-xs text-slate-400">${isAdmin ? '관리자 계정' : ''}</span>`;
    if (isAdmin) { await redirectIfAdmin(user); return; }
    if (btnMyPage) { btnMyPage.style.display = 'block'; btnMyPage.onclick = () => { location.href = 'mypage.html'; }; }
    if (btnLogout) btnLogout.style.display = 'block';
  }

  // 이전 리스너 해제 후 재구독
  _quotesUnsub?.();
  _inquiriesUnsub?.();
  _quotesUnsub     = loadRecentQuotes();
  _inquiriesUnsub  = loadRecentInquiries();
});

btnLogout?.addEventListener('click', () => window.hardLogout?.('index.html'));

// ── 실시간 데이터 로더 ────────────────────────────────────────
function loadRecentQuotes() {
  const container = document.getElementById('recent-quotes-container');
  if (!container) return null;
  const q = query(collection(db, 'quotes'), where('isGuest','==',true), where('userId','==','guest'), orderBy('createdAt','desc'), limit(10));
  return onSnapshot(q, snap => {
    if (snap.empty) {
      container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>최근 접수 내역이 없습니다.</p></div>';
      return;
    }
    container.innerHTML = '';
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const name = data.ordererName || data.userName || data.name || '무명';
      const maskedName = name.length > 2 ? (name[0] + '*' + name.at(-1)) : (name[0] + '*');
      const title = data.orderName || '제목 없음';
      const pType = (data.productType || data.category || '').toLowerCase();
      let typeLabel = '', typeClass = 'bg-slate-100 text-slate-500 border border-slate-200';
      if (pType === 'book')       { typeLabel = '책자'; typeClass = 'bg-slate-800 text-white border border-slate-800'; }
      else if (pType === 'print') { typeLabel = '인쇄'; typeClass = 'bg-white text-slate-700 border border-slate-300'; }
      else if (pType)             { typeLabel = pType; }
      const status = data.status || '접수대기';
      let statusColor = 'text-slate-500';
      if (status.includes('제작') || status.includes('진행'))     statusColor = 'text-blue-600 font-bold';
      else if (status.includes('완료') || status.includes('발송')) statusColor = 'text-brand-600 font-bold';
      const div = document.createElement('div');
      div.className = 'grid grid-cols-12 gap-2 px-6 py-3 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors text-sm';
      div.innerHTML = `
        <div class="col-span-3 md:col-span-2 text-slate-700 font-medium truncate">${maskedName}</div>
        <div class="col-span-6 md:col-span-7 flex items-center gap-2 min-w-0">
          ${typeLabel ? `<span class="inline-flex items-center justify-center h-5 px-1.5 text-[10px] rounded font-bold ${typeClass} flex-shrink-0">${typeLabel}</span>` : ''}
          <span class="text-slate-700 truncate cursor-default" title="${sanitizeHTML(title)}">${sanitizeHTML(title)}</span>
        </div>
        <div class="col-span-3 text-right"><span class="text-xs ${statusColor}">${status}</span></div>
      `;
      container.appendChild(div);
    });
  }, () => {});
}

function loadRecentInquiries() {
  const container = document.getElementById('recent-qna-container');
  if (!container) return null;
  const q = query(collection(db, 'qna'), orderBy('createdAt','desc'), limit(8));
  return onSnapshot(q, snap => {
    if (snap.empty) {
      container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>등록된 문의가 없습니다.</p></div>';
      return;
    }
    container.innerHTML = '';
    snap.forEach(d => {
      const data = d.data();
      const isSecret  = data.isSecret;
      const isAnswered = !!data.answer;
      const title = isSecret ? '비밀글입니다.' : (data.title || '제목 없음');
      let dateStr = '-';
      if (data.createdAt?.toDate) {
        const dt = data.createdAt.toDate();
        dateStr = `${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')}`;
      }
      const div = document.createElement('div');
      div.className = 'grid grid-cols-12 gap-2 px-6 py-3 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors cursor-pointer group text-sm';
      div.innerHTML = `
        <div class="col-span-2 text-center">
          <span class="inline-block w-14 py-0.5 rounded text-[10px] font-bold border ${isAnswered ? 'bg-white text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}">${isAnswered ? '답변완료' : '대기중'}</span>
        </div>
        <div class="col-span-7 md:col-span-8 min-w-0">
          <div class="truncate text-slate-700 group-hover:text-brand-700 group-hover:underline decoration-brand-200 underline-offset-2 transition-all">
            ${isSecret ? '<i class="fas fa-lock text-[10px] text-slate-400 mr-1.5"></i>' : ''}${sanitizeHTML(title)}
          </div>
          ${(!isSecret && isAnswered && data.answer) ? `<div class="text-xs text-slate-400 truncate mt-0.5">↳ ${sanitizeHTML(String(data.answer).replace(/\s+/g,' ').trim())}</div>` : ''}
        </div>
        <div class="col-span-3 md:col-span-2 text-right text-xs text-slate-400 font-mono">${dateStr}</div>
      `;
      div.onclick = () => { location.href = 'qna.html'; };
      container.appendChild(div);
    });
  }, () => {});
}

// ── 공지사항 (병렬 쿼리) ─────────────────────────────────────
async function loadNotices() {
  const container = document.getElementById('notice-list-container');
  const modal = document.getElementById('notice-modal');
  try {
    const [snap, popupSnap] = await Promise.all([
      getDocs(query(collection(db,'notices'), orderBy('createdAt','desc'), limit(8))),
      getDocs(query(collection(db,'notices'), where('isPopup','==',true), orderBy('createdAt','desc'), limit(1))),
    ]);

    if (snap.empty) {
      if (container) container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>등록된 공지사항이 없습니다.</p></div>';
    } else if (container) {
      const notices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      notices.sort((a, b) => (b.isImportant ? 1 : 0) - (a.isImportant ? 1 : 0));
      container.innerHTML = '';
      notices.forEach(data => {
        let dateStr = '-';
        if (data.createdAt?.toDate) {
          const d = data.createdAt.toDate();
          dateStr = `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
        }
        const div = document.createElement('div');
        div.className = 'grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors cursor-pointer group text-sm';
        div.innerHTML = `
          <div class="col-span-2 text-center">
            ${data.isImportant
              ? '<span class="inline-block w-10 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">중요</span>'
              : '<span class="inline-block w-10 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">공지</span>'}
          </div>
          <div class="col-span-7 min-w-0">
            <div class="truncate text-slate-700 group-hover:text-brand-700 group-hover:underline decoration-brand-200 underline-offset-2 transition-all">${sanitizeHTML(data.title || '제목 없음')}</div>
          </div>
          <div class="col-span-3 text-right text-xs text-slate-400 font-mono">${dateStr}</div>
        `;
        div.onclick = () => openNoticeModal(data);
        container.appendChild(div);
      });
    }

    function openNoticeModal(data) {
      document.getElementById('notice-modal-title').textContent = data.title || '';
      document.getElementById('notice-modal-date').textContent = data.createdAt?.toDate?.().toLocaleDateString() ?? '';
      document.getElementById('notice-modal-content').innerHTML = renderNoticeContent(data);
      document.getElementById('notice-badge').classList.toggle('hidden', !data.isImportant);
      modal.classList.remove('hidden'); modal.classList.add('flex');
    }
    const closeNoticeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
    document.getElementById('close-notice-modal-btn').onclick = closeNoticeModal;
    modal.onclick = e => { if (e.target === modal) closeNoticeModal(); };

    if (!popupSnap.empty) {
      const popupDoc  = popupSnap.docs[0];
      const popupNotice = { id: popupDoc.id, ...popupDoc.data() };
      const modal2  = document.getElementById('notice-popup-modal');
      const todayKey = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
      const shouldSkip = () => {
        try { const o = JSON.parse(localStorage.getItem('notice_popup_hide') || 'null'); return o?.date === todayKey() && o?.id === popupNotice.id; } catch { return false; }
      };
      if (!shouldSkip()) {
        document.getElementById('notice-popup-title').textContent = popupNotice.title || '';
        document.getElementById('notice-popup-content').innerHTML = renderNoticeContent(popupNotice);
        modal2.classList.remove('hidden'); modal2.classList.add('flex');
        const hideToday = document.getElementById('notice-popup-hide-today');
        const closePopup = () => {
          if (hideToday.checked) {
            try { localStorage.setItem('notice_popup_hide', JSON.stringify({ date: todayKey(), id: popupNotice.id })); } catch {}
          }
          modal2.classList.add('hidden'); modal2.classList.remove('flex');
          hideToday.checked = false;
        };
        document.getElementById('notice-popup-close-btn').onclick = closePopup;
        document.getElementById('notice-popup-confirm-btn').onclick = closePopup;
        modal2.onclick = e => { if (e.target === modal2) closePopup(); };
      }
    }
  } catch(err) { console.error('공지사항 로드 오류:', err); }
}

// ── 포트폴리오 ────────────────────────────────────────────────
async function loadPortfolio() {
  try {
    const docRef = doc(db, 'settings', 'homepageContent');
    const grid   = document.getElementById('portfolio-grid');
    const pager  = document.getElementById('portfolio-page-controls');
    window.__portfolioMainPerPage = 9;
    window.__portfolioMainPage = window.__portfolioMainPage || 1;

    const closeImageModal = () => {
      const m = document.getElementById('portfolio-image-modal');
      document.getElementById('portfolio-image-img').src = '';
      m.classList.add('hidden'); m.classList.remove('flex');
    };

    const render = () => {
      const all  = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
      const item = all[window.__portfolioModalIndex] || {};
      document.getElementById('portfolio-image-img').src = sanitizeHTML(item.imageUrl || '');
      document.getElementById('portfolio-image-title').textContent = item.title || 'Portfolio';
      document.getElementById('portfolio-image-desc').textContent  = item.description || item.desc || '';
    };

    const openImageModal = index => {
      const all = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
      if (!all.length) return;
      window.__portfolioModalIndex = (index % all.length + all.length) % all.length;
      if (!window.__portfolioModalNavBound) {
        window.__portfolioModalNavBound = true;
        const prevBtn = document.getElementById('portfolio-modal-prev');
        const nextBtn = document.getElementById('portfolio-modal-next');
        prevBtn?.addEventListener('click', e => {
          e.stopPropagation();
          const a = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
          if (a.length) { window.__portfolioModalIndex = (window.__portfolioModalIndex - 1 + a.length) % a.length; render(); }
        });
        nextBtn?.addEventListener('click', e => {
          e.stopPropagation();
          const a = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
          if (a.length) { window.__portfolioModalIndex = (window.__portfolioModalIndex + 1) % a.length; render(); }
        });
        window.addEventListener('keydown', e => {
          const m = document.getElementById('portfolio-image-modal');
          if (!m || m.classList.contains('hidden')) return;
          if      (e.key === 'Escape')     { closeImageModal(); }
          else if (e.key === 'ArrowLeft')  { prevBtn?.click(); }
          else if (e.key === 'ArrowRight') { nextBtn?.click(); }
        });
        document.getElementById('close-portfolio-image-modal-btn')?.addEventListener('click', closeImageModal);
        document.getElementById('portfolio-image-modal')?.addEventListener('click', e => {
          if (e.target === document.getElementById('portfolio-image-modal')) closeImageModal();
        });
      }
      render();
      const m = document.getElementById('portfolio-image-modal');
      m.classList.remove('hidden'); m.classList.add('flex');
    };

    const renderPager = (page, totalPages) => {
      if (!pager) return;
      if (totalPages <= 1) { pager.classList.add('hidden'); pager.innerHTML = ''; return; }
      pager.classList.remove('hidden');
      pager.innerHTML = '';
      const cls = active => 'w-8 h-8 flex items-center justify-center rounded border text-xs font-bold transition-colors ' +
        (active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50');
      const mkBtn = (label, pageNum, isActive) => {
        const b = document.createElement('button');
        b.textContent = label; b.className = cls(isActive);
        b.onclick = () => renderMainPage(pageNum);
        return b;
      };
      const start = Math.max(1, page - 2), end = Math.min(totalPages, start + 4);
      if (page > 1) pager.appendChild(mkBtn('<', page - 1, false));
      for (let i = start; i <= end; i++) pager.appendChild(mkBtn(i, i, i === page));
      if (page < totalPages) pager.appendChild(mkBtn('>', page + 1, false));
    };

    const renderMainPage = page => {
      const list = Array.isArray(window.__portfolioAll) ? window.__portfolioAll : [];
      const perPage = window.__portfolioMainPerPage;
      const totalPages = Math.max(1, Math.ceil(list.length / perPage));
      const safePage = Math.min(Math.max(1, page), totalPages);
      window.__portfolioMainPage = safePage;
      if (!grid) return;
      if (!list.length) {
        grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-300 text-sm">등록된 포트폴리오가 없습니다.</div>';
        renderPager(1, 1); return;
      }
      const startIdx = (safePage - 1) * perPage;
      grid.innerHTML = '';
      list.slice(startIdx, startIdx + perPage).forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'group relative aspect-square bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer';
        div.innerHTML = `
          <img src="${sanitizeHTML(item.imageUrl)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="포트폴리오">
          <div class="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="text-white font-bold border border-white px-3 py-1 text-xs uppercase tracking-widest">View</span>
          </div>
        `;
        div.onclick = () => openImageModal(startIdx + i);
        grid.appendChild(div);
      });
      renderPager(safePage, totalPages);
    };

    const applyList = raw => {
      const list = Array.isArray(raw) ? raw.slice().reverse() : [];
      window.__portfolioAll = list;
      const totalPages = Math.max(1, Math.ceil(list.length / window.__portfolioMainPerPage));
      if ((window.__portfolioMainPage || 1) > totalPages) window.__portfolioMainPage = totalPages;
      renderMainPage(window.__portfolioMainPage || 1);
      try {
        const m = document.getElementById('portfolio-image-modal');
        if (m && !m.classList.contains('hidden')) {
          if (!list.length) { closeImageModal(); return; }
          window.__portfolioModalIndex = (window.__portfolioModalIndex % list.length + list.length) % list.length;
          render();
        }
      } catch {}
    };

    if (typeof window.__portfolioSettingsUnsub === 'function') {
      try { window.__portfolioSettingsUnsub(); } catch {}
    }
    window.__portfolioSettingsUnsub = onSnapshot(docRef, snap => {
      applyList(snap.exists() ? snap.data().portfolio : []);
    }, err => {
      console.error('포트폴리오 리스너 오류:', err);
      if (pager) { pager.classList.add('hidden'); pager.innerHTML = ''; }
      if (grid) grid.innerHTML = '<div class="col-span-full text-center py-10 text-red-300 text-sm">포트폴리오를 불러오지 못했습니다.</div>';
    });
  } catch(err) {
    console.error('포트폴리오 로드 오류:', err);
    const grid = document.getElementById('portfolio-grid');
    const pager = document.getElementById('portfolio-page-controls');
    if (pager) { pager.classList.add('hidden'); pager.innerHTML = ''; }
    if (grid) grid.innerHTML = '<div class="col-span-full text-center py-10 text-red-300 text-sm">포트폴리오를 불러오지 못했습니다.</div>';
  }
}

// ── 비회원 조회 폼 ─────────────────────────────────────────────
const guestModal        = document.getElementById('guest-lookup-overlay');
const guestForm         = document.getElementById('guest-lookup-form');
const guestErr          = document.getElementById('guest-err');
const guestNameInput    = document.getElementById('guestName');
const guestContactInput = document.getElementById('guestContact');
const guestPasswordInput = document.getElementById('guestPassword');

btnGuestLookup?.addEventListener('click', e => {
  e.preventDefault();
  userMenuModal?.classList.add('hidden'); userMenuModal?.classList.remove('flex');
  guestModal?.classList.remove('hidden'); guestModal?.classList.add('flex');
  setTimeout(() => guestNameInput?.focus(), 50);
});

document.getElementById('guest-lookup-close')?.addEventListener('click', () => {
  guestModal?.classList.add('hidden'); guestModal?.classList.remove('flex');
  guestErr?.classList.add('hidden');
  guestForm?.reset();
});

guestContactInput?.addEventListener('input', e => { e.target.value = normalizePhone(e.target.value); });

guestForm?.addEventListener('submit', async e => {
  e.preventDefault();
  guestErr?.classList.add('hidden');
  const name       = guestNameInput.value.trim();
  const contactRaw = guestContactInput.value.trim();
  const contact    = contactRaw.replace(/[^0-9]/g, '');
  const password   = guestPasswordInput.value.trim();
  if (!name || !contact || !password) { guestErr?.classList.remove('hidden'); return; }
  try {
    const pwLast4 = contact.slice(-4);
    if (password !== pwLast4) { guestErr?.classList.remove('hidden'); return; }
    const [key, legacyKey] = await Promise.all([
      sha256Hex(`${name}|${contact}|${pwLast4}`),
      sha256Hex(`${name}|${contactRaw}|${pwLast4}`),
    ]);
    const sets = { guestLookupKey: key, guestLookupKeyLegacy: legacyKey, guestName: name, guestContact: contact, guestPwLast4: pwLast4 };
    Object.entries(sets).forEach(([k, v]) => {
      try { sessionStorage.setItem(k, v); } catch {}
      try { localStorage.setItem(k, v); } catch {}
    });
    location.href = 'mypage.html?guest=1';
  } catch { guestErr?.classList.remove('hidden'); }
});

// ── 모바일 내비 ──────────────────────────────────────────────
const mobileNavModal = document.getElementById('mobileNavModal');
document.getElementById('mobile-nav-btn')?.addEventListener('click', () => { mobileNavModal?.classList.remove('hidden'); mobileNavModal?.classList.add('flex'); });
document.getElementById('closeMobileNavBtn')?.addEventListener('click', () => { mobileNavModal?.classList.add('hidden'); mobileNavModal?.classList.remove('flex'); });
mobileNavModal?.addEventListener('click', () => { mobileNavModal?.classList.add('hidden'); mobileNavModal?.classList.remove('flex'); });

document.getElementById('userMenuEditInfoBtn')?.addEventListener('click', () => { location.href = 'mypage.html#profile-edit'; });

(() => {
  const btn = document.getElementById('userMenuLogoutBtn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('userMenuModal')?.classList.add('hidden');
    window.hardLogout?.();
  });
})();

// ── 페이지 초기화 ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHeader('index');
  loadNotices().catch(e => console.error('[index] loadNotices:', e));
  loadPortfolio().catch(e => console.error('[index] loadPortfolio:', e));
});
