import { app, auth, db, storage, signInAnonymously, onAuthStateChanged, onSnapshot, signOut, setPersistence, browserLocalPersistence, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, limit, doc, getDoc } from "../firebase.js";
import { initHeader } from "../header.js";
import "../overlays.js";
import "../session.js";

// --- XSS 방지용 문자열 이스케이프 ---
function sanitizeHTML(str) {
  if (!str) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, (m) => map[m]);
}

document.addEventListener("DOMContentLoaded", ()=>initHeader("cs"));

// ─────────────────────────────────────────────────────────────
// 공개/비공개 토글: 공개 선택 시 비밀번호 입력 숨김
// ─────────────────────────────────────────────────────────────
function syncQnaVisibilityUI() {
    const pub = document.getElementById('qnaPublic');
    const sec = document.getElementById('qnaSecret');
    const pwWrap = document.getElementById('qnaPwWrap');
    const pwEl = document.getElementById('qnaPw');
    const isSecret = sec ? !!sec.checked : true;
    if (pwWrap) {
        if (isSecret) {
            pwWrap.classList.remove('hidden');
        } else {
            pwWrap.classList.add('hidden');
            try { if (pwEl) pwEl.value = ''; } catch(e) {}
        }
    }
    return isSecret;
}
document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'qnaPublic' || t.id === 'qnaSecret') syncQnaVisibilityUI();
});
document.addEventListener('DOMContentLoaded', () => { try { syncQnaVisibilityUI(); } catch(e) {} });


(async () => {
// ✅ 공통 헤더 스크립트(가드/마이페이지 이동)가 참조할 수 있도록 노출
        try { window.auth = auth; } catch(e) {}
        
        try { window.signOut = signOut; } catch(e) {}
        try { window.signInAnonymously = signInAnonymously; } catch(e) {}
        try { window.onAuthStateChanged = onAuthStateChanged; } catch(e) {}
        try { window.__currentUser = auth.currentUser || null; } catch(e) {}
        try { window.currentUser = auth.currentUser || null; } catch(e) {}
        try { window.__AUTH_READY = false; } catch(e) {}

        // ✅ keep header/login button in sync across page transitions
        onAuthStateChanged(auth, (u) => {
            try { window.__currentUser = u || null; } catch(e) {}
            try { window.currentUser = u || null; } catch(e) {}
            try { window.__AUTH_READY = true; } catch(e) {}
            try { window.updateAuthLabels && window.updateAuthLabels(); } catch(e) {}
        });

        await setPersistence(auth, browserLocalPersistence);

        // SAFE_GUEST_INIT: wait for Firebase Auth to restore session first.
        // If still no user, then (and only then) sign in anonymously for guest features.
        const __initialUser = await new Promise((resolve) => {
            const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u || null); });
        });
        if (!__initialUser) {
            await signInAnonymously(auth).catch(() => { /* ignore */ });
        }

        
})();

// =========================
	        // 공통: 관리자 라우팅 + 강제 로그아웃
	        // =========================
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
	                console.warn('role check failed:', e);
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
  // Clear UI/session state
  try { sessionStorage.clear(); } catch (e) {}
  try {
    // Role / user
    localStorage.removeItem('userRole');
    sessionStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    sessionStorage.removeItem('userName');

    // Quote draft / routing
    localStorage.removeItem('quoteToReload');
    localStorage.removeItem('quoteDraft');
    localStorage.removeItem('lastQuoteDraft');
    localStorage.removeItem('postLoginRedirect');

    // Guest lookup keys
    localStorage.removeItem('guestLookupKey');
    localStorage.removeItem('guestLookupKeyLegacy');
    localStorage.removeItem('guestName');
    localStorage.removeItem('guestContact');
    localStorage.removeItem('guestContactRaw');
    localStorage.removeItem('guestContactHyphen');
    localStorage.removeItem('guestPwLast4');
  } catch (e) {}

  // Optional: clear last quote cache keys when present
  try {
    if (typeof __LAST_QUOTE_CACHE_KEY_BOOK !== 'undefined') {
      try { sessionStorage.removeItem(__LAST_QUOTE_CACHE_KEY_BOOK); } catch (e) {}
      try { localStorage.removeItem(__LAST_QUOTE_CACHE_KEY_BOOK); } catch (e) {}
    }
    if (typeof __LAST_QUOTE_CACHE_KEY_PRINT !== 'undefined') {
      try { sessionStorage.removeItem(__LAST_QUOTE_CACHE_KEY_PRINT); } catch (e) {}
      try { localStorage.removeItem(__LAST_QUOTE_CACHE_KEY_PRINT); } catch (e) {}
    }
  } catch (e) {}

  // Optional: unsubscribe snapshot listeners if present (mypage 등)
  try { if (typeof unsubscribeQuotesSnapshot === 'function') unsubscribeQuotesSnapshot(); } catch (e) {}
  try { if (typeof unsubscribeQuotesSnapshot !== 'undefined') unsubscribeQuotesSnapshot = null; } catch (e) {}

  // Admin safety: 관리자에서 로그아웃한 직후 메인에서 1회 익명로그인 억제
  try {
    const p = (location && location.pathname ? location.pathname : '').toLowerCase();
    if (p.endsWith('/admin.html') || p.endsWith('admin.html')) {
      sessionStorage.setItem('suppressAnonOnce', '1');
    }
  } catch (e) {}

  // Firebase sign out (module auth or window.auth)
  try {
    if (typeof auth !== 'undefined' && auth && typeof signOut === 'function') {
      await signOut(auth);
    } else if (window.auth && typeof window.auth.signOut === 'function') {
      await window.auth.signOut();
    }
  } catch (e) {
    console.warn('signOut failed:', e);
  }

  location.replace(redirectUrl || 'index.html');
}

        let currentUser = null;

        // --- User Menu & Auth State (Header) ---
        const userMenuBtn = document.getElementById('user-menu-btn');
        const userMenuModal = document.getElementById('userMenuModal');
        const closeUserMenuBtn = document.getElementById('closeUserMenuBtn');
        const userMenuStatus = document.getElementById('userMenuStatus');
        const userMenuGoMyPageBtn = document.getElementById('userMenuGoMyPageBtn');
        const userMenuGoLoginBtn = document.getElementById('userMenuGoLoginBtn');
        const userMenuLogoutBtn = document.getElementById('userMenuLogoutBtn');
        const userMenuEditInfoBtn = document.getElementById('userMenuEditInfoBtn');
        const btnGuestLookup = document.getElementById('guest-lookup-open');

        function renderUserMenu() {
            if (!userMenuStatus) return;
            const user = window.currentUser;
            
            if (user && !user.isAnonymous) {
                // Member
                const storedName = sessionStorage.getItem('userName');
                const dispName = storedName || user.displayName || user.email || '회원';
                userMenuStatus.innerHTML = `<span class="font-bold text-brand-600">${dispName}</span>님<br><span class="text-xs text-slate-400">오늘도 좋은 하루 되세요!</span>`;
                
                userMenuGoMyPageBtn?.classList.remove('hidden');
                userMenuEditInfoBtn?.classList.add('hidden');
    userMenuLogoutBtn?.classList.remove('hidden');
                userMenuGoLoginBtn?.classList.add('hidden');
                btnGuestLookup?.classList.add('hidden'); // 회원은 비회원 조회 불필요
            } else {
                // Guest or Visitor
                const guestName = sessionStorage.getItem('guestName');
                if (guestName) {
                    userMenuStatus.innerHTML = `<span class="font-bold text-slate-800">${guestName}</span>님 (비회원)<br><span class="text-xs text-slate-400">주문 조회 중입니다.</span>`;
                } else {
                    userMenuStatus.innerHTML = '<span class="font-bold text-slate-800">방문자</span>님 환영합니다.<br><span class="text-xs text-slate-400">로그인 후 더 많은 기능을 이용해보세요.</span>';
                }
                
                userMenuGoMyPageBtn?.classList.add('hidden');
                userMenuEditInfoBtn?.classList.add('hidden');
                userMenuLogoutBtn?.classList.add('hidden');
                userMenuGoLoginBtn?.classList.remove('hidden');
                btnGuestLookup?.classList.remove('hidden');
            }
        }

        function toggleUserMenu() {
            if (userMenuModal.classList.contains('hidden')) {
                renderUserMenu();
                userMenuModal.classList.remove('hidden');
                userMenuModal.classList.add('flex');
            } else {
                userMenuModal.classList.add('hidden');
                userMenuModal.classList.remove('flex');
            }
        }

        userMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleUserMenu();
        });
        
        closeUserMenuBtn?.addEventListener('click', toggleUserMenu);
        userMenuModal?.addEventListener('click', (e) => {
             if (e.target === userMenuModal) toggleUserMenu();
        });

        userMenuGoMyPageBtn?.addEventListener('click', () => { const _k = localStorage.getItem('guestLookupKey') || sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKeyLegacy') || ''; location.href = _k ? 'mypage.html?guest=1' : 'mypage.html'; });
        userMenuEditInfoBtn?.addEventListener('click', () => { location.href = 'mypage.html#profile-edit'; });
        userMenuGoLoginBtn?.addEventListener('click', () => {
            try { localStorage.setItem('postLoginRedirect', 'mypage.html'); } catch(e) {}
            location.href = 'index.html';
        });
        userMenuLogoutBtn?.addEventListener('click', async () => {
	            await window.hardLogout('index.html');
        });

        // --- Guest Lookup Modal Logic ---
        const guestModal = document.getElementById('guest-lookup-overlay');
        const guestCloseBtn = document.getElementById('guest-lookup-close');
        const guestForm = document.getElementById('guest-lookup-form');
        const guestErr = document.getElementById('guest-err');
        
        const guestNameInput = document.getElementById('guestName');
        const guestContactInput = document.getElementById('guestContact');
        const guestPasswordInput = document.getElementById('guestPassword');

        function normalizePhone(input) {
            const digits = (input || '').replace(/\D/g, '');
            if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
            if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
            return input || '';
        }

        btnGuestLookup?.addEventListener('click', (e) => {
            e.preventDefault();
            userMenuModal.classList.add('hidden');
            userMenuModal.classList.remove('flex');
            guestModal.classList.remove('hidden');
            guestModal.classList.add('flex');
            setTimeout(() => guestNameInput?.focus(), 50);
        });
        
        guestCloseBtn?.addEventListener('click', () => {
            guestModal.classList.add('hidden');
            guestModal.classList.remove('flex');
            guestErr.classList.add('hidden');
            guestForm.reset();
        });
        
        guestModal?.addEventListener('click', (e) => {
            if (e.target === guestModal) guestCloseBtn.click();
        });

        let guestPwManuallyEdited = false;
        guestPasswordInput?.addEventListener('input', () => { guestPwManuallyEdited = true; });
        guestContactInput?.addEventListener('input', (e) => {
            const normalized = normalizePhone(e.target.value);
            e.target.value = normalized;
            const digits = (normalized || '').replace(/\D/g, '');
            const isCompletePhone = (digits.length === 10 || digits.length === 11);
            const last4 = isCompletePhone ? digits.slice(-4) : '';
            if (!guestPwManuallyEdited && last4 && guestPasswordInput) {
                guestPasswordInput.value = last4;
            }
        });

        guestForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            guestErr.classList.add('hidden');
            const name = guestNameInput.value.trim();
            const contactRaw = guestContactInput.value.trim();
            const contact = contactRaw.replace(/[^0-9]/g, ''); 
            const password = guestPasswordInput.value.trim();
            
            if (!name || !contact || !password) {
                guestErr.classList.remove('hidden'); return;
            }
            try {
                // SHA-256 Polyfill use or TextEncoder
                const key = await sha256(`${name}|${contact}|${password}`);
                
                // Legacy key generation if needed
                const legacyKey = await sha256(`${name}|${contactRaw}|${password}`);
                if(legacyKey) sessionStorage.setItem('guestLookupKeyLegacy', legacyKey);

                sessionStorage.setItem('guestLookupKey', key);
                sessionStorage.setItem('guestName', name);
                sessionStorage.setItem('guestContact', contact);
                const pwLast4 = (contact||'').toString().replace(/[^0-9]/g,'').slice(-4);
                if ((password||'').toString() !== pwLast4) { guestErr.classList.remove('hidden'); return; }
                sessionStorage.setItem("guestPwLast4", pwLast4);

                location.href = 'mypage.html?guest=1';
            } catch (ex) {
                console.error(ex);
                guestErr.classList.remove('hidden');
            }
        });


        // --- Tab Logic ---
        window.switchTab = function(tabName) {
            const tabInquiry = document.getElementById('tab-inquiry');
            const tabFaq = document.getElementById('tab-faq');
            const contentInquiry = document.getElementById('content-inquiry');
            const contentFaq = document.getElementById('content-faq');

            if (tabName === 'inquiry') {
                tabInquiry.classList.add('active');
                tabFaq.classList.remove('active');
                contentInquiry.classList.remove('hidden');
                contentFaq.classList.add('hidden');
            } else {
                tabInquiry.classList.remove('active');
                tabFaq.classList.add('active');
                contentInquiry.classList.add('hidden');
                contentFaq.classList.remove('hidden');
            }
        };

        // --- Utils ---
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            // Theme colors
            const colors = { success: 'bg-green-600', error: 'bg-red-500', info: 'bg-slate-700' };
            toast.className = `${colors[type] || 'bg-slate-700'} text-white px-6 py-4 rounded-lg shadow-xl transform transition-all duration-300 translate-x-full flex items-center font-medium mb-2`;
            toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} mr-3"></i>${message}`;
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.remove('translate-x-full'));
            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function formatDate(timestamp) {
            if (!timestamp) return '';
            const date = timestamp.toDate();
            return `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;
        }

        // SHA-256 Polyfill (For hashing passwords)
        function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
        function sha256Fallback(ascii) {
            var mathPow = Math.pow; var maxWord = mathPow(2, 32); var lengthProperty = 'length'; var i, j; var result = ''; var words = []; var asciiBitLength = ascii[lengthProperty] * 8; var hash = sha256Fallback.h = sha256Fallback.h || []; var k = sha256Fallback.k = sha256Fallback.k || []; var primeCounter = k[lengthProperty]; var isComposite = {}; for (var candidate = 2; primeCounter < 64; candidate++) { if (!isComposite[candidate]) { for (i = 0; i < 313; i += candidate) { isComposite[i] = candidate; } hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0; k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0; } } ascii += '\x80'; while (ascii[lengthProperty] % 64 - 56) ascii += '\x00'; for (i = 0; i < ascii[lengthProperty]; i++) { j = ascii.charCodeAt(i); if (j >> 8) return; words[i >> 2] |= j << ((3 - i) % 4) * 8; } words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0); words[words[lengthProperty]] = (asciiBitLength); for (j = 0; j < words[lengthProperty];) { var w = words.slice(j, j += 16); var oldHash = hash; hash = hash.slice(0, 8); for (i = 0; i < 64; i++) { var i2 = i + j; var w15 = w[i - 15], w2 = w[i - 2]; var a = hash[0], e = hash[4]; var temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0); var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2])); hash = [(temp1 + temp2) | 0].concat(hash); hash[4] = (hash[4] + temp1) | 0; } for (i = 0; i < 8; i++) { hash[i] = (hash[i] + oldHash[i]) | 0; } } for (i = 0; i < 8; i++) { for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); } } return result;
        }
        async function sha256(str) {
            const subtle = globalThis.crypto && globalThis.crypto.subtle;
            if (subtle && globalThis.isSecureContext) {
                try {
                    const msgBuffer = new TextEncoder().encode(str);
                    const hashBuffer = await subtle.digest('SHA-256', msgBuffer);
                    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                } catch (e) {}
            }
            return sha256Fallback(unescape(encodeURIComponent(str)));
        }

        // --- Logic ---

        // 1. FAQ 로드
        async function loadFAQ() {
            const faqContainer = document.getElementById('faq-list');
            try {
                let q = query(collection(db, "faq"), orderBy("order", "asc"));
                try { await getDocs(query(collection(db, "faq"), limit(1))); } 
                catch(e) { q = query(collection(db, "faq"), orderBy("createdAt", "desc")); }

                const querySnapshot = await getDocs(q);
                faqContainer.innerHTML = '';

                if (querySnapshot.empty) {
                    faqContainer.innerHTML = '<div class="p-12 text-center text-slate-400 bg-slate-50">등록된 자주 묻는 질문이 없습니다.</div>';
                    return;
                }

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const el = document.createElement('div');
                    el.className = "bg-white";
                    el.innerHTML = `
                        <button class="w-full px-8 py-5 text-left flex justify-between items-center focus:outline-none hover:bg-slate-50 transition-colors group">
                            <span class="font-bold text-slate-700 group-hover:text-brand-600 text-base flex items-center">
                                <span class="bg-brand-100 text-brand-600 text-xs font-extrabold px-2 py-1 rounded mr-3">Q</span>
                                ${data.question}
                            </span>
                            <i class="fas fa-chevron-down text-slate-300 group-hover:text-brand-600 transition-transform duration-200"></i>
                        </button>
                        <div class="faq-answer bg-slate-50 border-t border-slate-100">
                            <div class="px-8 py-6 text-slate-600 leading-relaxed whitespace-pre-wrap pl-16 text-sm">
                                <span class="font-bold text-slate-800 mr-2 text-base">A.</span> ${data.answer}
                            </div>
                        </div>
                    `;
                    el.querySelector('button').addEventListener('click', function() {
                        const answerDiv = this.nextElementSibling;
                        const icon = this.querySelector('.fa-chevron-down');
                        if (!answerDiv.style.maxHeight) {
                            answerDiv.style.maxHeight = answerDiv.scrollHeight + "px";
                            icon.classList.add('rotate-180');
                        } else {
                            answerDiv.style.maxHeight = null;
                            icon.classList.remove('rotate-180');
                        }
                    });
                    faqContainer.appendChild(el);
                });
            } catch (error) {
                console.error("FAQ Error:", error);
                faqContainer.innerHTML = '<div class="p-4 text-center text-red-500 text-sm">FAQ를 불러오지 못했습니다.</div>';
            }
        }

        
        // 1-b. 공개 문의 로드
        function loadPublicQna() {
            const container = document.getElementById('public-qna-list');
            if (!container) return;
            try {
                const q = query(
                    collection(db, "qna"),
                    where("isSecret", "==", false),
                    orderBy("createdAt", "desc"),
                    limit(30)
                );
                // 실시간 반영
                onSnapshot(q, (snap) => {
                    const items = [];
                    snap.forEach(d => {
                        const data = d.data();
                        if (data && data.isSecret) return;
                        items.push({ id: d.id, ...data });
                    });
                    container.innerHTML = '';
                    if (items.length === 0) {
                        container.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm">등록된 공개 문의가 없습니다.</div>';
                        return;
                    }
                    items.forEach((it) => {
                        let dateStr = '-';
                        try {
                            if (it.createdAt && typeof it.createdAt.toDate === 'function') {
                                const dt = it.createdAt.toDate();
                                dateStr = `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')}`;
                            }
                        } catch(e) {}

                        const answered = !!it.answer;
                        const title = sanitizeHTML(it.title || '제목 없음');
                        const body = sanitizeHTML(it.body || '');
                        const ans = sanitizeHTML(it.answer || '');

                        const row = document.createElement('div');
                        row.className = 'border border-slate-200 rounded-xl overflow-hidden bg-white';
                        row.innerHTML = `
                            <button type="button" class="w-full px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50 transition-colors">
                                <div class="min-w-0 flex-1 text-left">
                                    <div class="flex items-center gap-2">
                                        <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${answered ? 'bg-white text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}">${answered ? '답변완료' : '대기중'}</span>
                                        <p class="font-semibold text-slate-800 truncate">${title}</p>
                                    </div>
                                    ${answered ? `<p class="text-xs text-slate-400 truncate mt-1">↳ ${ans}</p>` : ``}
                                </div>
                                <div class="shrink-0 text-xs text-slate-400 font-mono">${dateStr}</div>
                                <i class="fas fa-chevron-down text-slate-300 mt-1"></i>
                            </button>
                            <div class="px-4 pb-4 hidden">
                                <div class="mt-2 text-sm text-slate-700 whitespace-pre-wrap">${body}</div>
                                <div class="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                                    <p class="text-xs font-bold text-slate-600 mb-1">관리자 답변</p>
                                    <div class="text-sm text-slate-700 whitespace-pre-wrap">${answered ? ans : '아직 답변이 등록되지 않았습니다.'}</div>
                                </div>
                            </div>
                        `;
                        const btn = row.querySelector('button');
                        const panel = row.querySelector('div.px-4');
                        const icon = row.querySelector('.fa-chevron-down');
                        btn.addEventListener('click', () => {
                            const open = !panel.classList.contains('hidden');
                            if (open) {
                                panel.classList.add('hidden');
                                icon.classList.remove('rotate-180');
                            } else {
                                panel.classList.remove('hidden');
                                icon.classList.add('rotate-180');
                            }
                        });
                        container.appendChild(row);
                    });
                }, (err) => {
                    console.error("Public QnA Load Error:", err);
                    container.innerHTML = '<div class="text-center py-10 text-red-500 text-sm">공개 문의를 불러오지 못했습니다.</div>';
                });
            } catch (e) {
                console.error(e);
                container.innerHTML = '<div class="text-center py-10 text-red-500 text-sm">공개 문의를 불러오지 못했습니다.</div>';
            }
        }

// 2. 문의 등록
        document.getElementById('submitBtn')?.addEventListener('click', async () => {
            const nameEl = document.getElementById('qnaName');
            const pwEl = document.getElementById('qnaPw');
            const titleEl = document.getElementById('qnaTitle');
            const bodyEl = document.getElementById('qnaBody');
            const btn = document.getElementById('submitBtn');

            const name = nameEl.value.trim();
            const pw = pwEl.value.trim();
            const title = titleEl.value.trim();
            const body = bodyEl.value.trim();

            if (!name) return showToast('이름을 입력해주세요.', 'error');
            const isSecret = syncQnaVisibilityUI();
            if (isSecret) {
                if (!pw || pw.length < 2) return showToast('비밀번호를 2자 이상 입력해주세요.', 'error');
            }

            if (!title) return showToast('제목을 입력해주세요.', 'error');
            if (!body) return showToast('내용을 입력해주세요.', 'error');

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>등록 중...';

            try {
                const pwHash = pw ? await sha256(pw) : null;
                await addDoc(collection(db, "qna"), {
                    name, pwHash, title, body,
                    isSecret: !!isSecret,
                    createdAt: serverTimestamp(),
                    status: "open",
                    answer: "",
                    answeredAt: null
                });

                showToast('문의가 등록되었습니다. [내 문의 답변 확인]에서 조회하세요.', 'success');
                nameEl.value = ''; pwEl.value = ''; titleEl.value = ''; bodyEl.value = '';
                document.getElementById('charCount').textContent = '0';
                
            } catch (error) {
                console.error("Submit Error:", error);
                showToast('등록 중 오류가 발생했습니다.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '문의 등록하기';
            }
        });

        // 3. 내 문의 조회
        document.getElementById('searchBtn')?.addEventListener('click', async () => {
            const searchName = document.getElementById('searchName').value.trim();
            const searchPw = document.getElementById('searchPw').value.trim();
            const resultArea = document.getElementById('search-result-area');
            const listContainer = document.getElementById('my-qna-list');

            if (!searchName || !searchPw) {
                showToast('이름과 비밀번호를 모두 입력해주세요.', 'error');
                return;
            }

            const btn = document.getElementById('searchBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const q = query(collection(db, "qna"), where("name", "==", searchName));
                const querySnapshot = await getDocs(q);
                
                const inputPwHash = await sha256(searchPw);
                let myDocs = [];

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.pwHash === inputPwHash) {
                        myDocs.push(data);
                    }
                });

                resultArea.classList.remove('hidden');
                listContainer.innerHTML = '';

                myDocs.sort((a, b) => {
                    const aMs = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                    const bMs = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                    return bMs - aMs;
                });

                if (myDocs.length === 0) {
                    listContainer.innerHTML = `
                        <div class="p-6 bg-slate-50 rounded-lg text-center text-slate-500 border border-slate-100">
                            일치하는 문의 내역이 없습니다.<br>
                            <span class="text-xs text-slate-400">이름이나 비밀번호를 확인해주세요.</span>
                        </div>`;
                } else {
                    myDocs.forEach(data => {
                        const isAnswered = data.status === 'answered' || data.status === '답변완료';
                        
                        const item = document.createElement('div');
                        item.className = "border border-slate-200 rounded-xl overflow-hidden shadow-sm";
                        item.innerHTML = `
                            <div class="bg-white p-5">
                                <div class="flex items-center justify-between mb-3">
                                    <span class="text-xs font-bold px-2 py-1 rounded ${isAnswered ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}">
                                        ${isAnswered ? '<i class="fas fa-check mr-1"></i>답변완료' : '<i class="fas fa-hourglass-half mr-1"></i>답변대기'}
                                    </span>
                                    <span class="text-xs text-slate-400">${formatDate(data.createdAt)}</span>
                                </div>
                                <h4 class="font-bold text-sm text-slate-800 mb-3">${data.title}</h4>
                                <div class="bg-slate-50 p-4 rounded-lg text-slate-600 whitespace-pre-wrap text-sm border border-slate-100 mb-4">${data.body}</div>
                                
                                ${isAnswered && data.answer ? `
                                <div class="mt-4 pt-4 border-t border-slate-100">
                                    <div class="flex items-start">
                                        <div class="bg-brand-500 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs shadow-sm">
                                            <i class="fas fa-comment-dots"></i>
                                        </div>
                                        <div class="w-full">
                                            <p class="font-bold text-brand-700 mb-1 text-sm">관리자 답변</p>
                                            <div class="text-slate-800 whitespace-pre-wrap leading-relaxed bg-brand-50 p-4 rounded-lg border border-brand-100 text-sm">
                                                ${data.answer}
                                            </div>
                                            ${data.answeredAt ? `<p class="text-right text-xs text-slate-400 mt-2">${formatDate(data.answeredAt)} 답변됨</p>` : ''}
                                        </div>
                                    </div>
                                </div>
                                ` : '<p class="text-xs text-slate-400 text-center py-2 bg-slate-50 rounded">아직 관리자의 답변이 등록되지 않았습니다.</p>'}
                            </div>
                        `;
                        listContainer.appendChild(item);
                    });
                }

            } catch (error) {
                console.error("Search Error:", error);
                showToast('조회 중 오류가 발생했습니다. (색인 생성 필요 가능성)', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '조회하기';
            }
        });

        // 글자수 카운트
        document.getElementById('qnaBody')?.addEventListener('input', (e) => {
            document.getElementById('charCount').textContent = e.target.value.length;
        });

        // Auth state listener for header (managed by bottom script, but here for name persistence)
	        onAuthStateChanged(auth, async (user) => { try { window.__currentFirebaseUser = user; } catch(e) {}
            if (!user || user.isAnonymous) {
                currentUser = null;
                // session cleanup handled by bottom script
            } else {
	                // 관리자 계정은 즉시 관리자 페이지로
	                if (await redirectIfAdmin(user)) return;
                
                // Fetch member details
                getDoc(doc(db, "users", user.uid)).then(snap => {
                    const data = snap.exists() ? snap.data() : {};
                    const name = data.name || user.displayName || '회원';
                    sessionStorage.setItem('userName', name);
                    currentUser = { uid: user.uid, ...data, name: name };
                    
                    // Trigger update via global hook if available
                    if(window.updateAuthLabels) window.updateAuthLabels();
                });
            }
        });

        // ===== Mobile Navigation =====
        const mobileNavBtn = document.getElementById('mobile-nav-btn');
        const mobileNavModal = document.getElementById('mobileNavModal');
        const closeMobileNavBtn = document.getElementById('closeMobileNavBtn');

        function openMobileNav() {
            if (!mobileNavModal) return;
            mobileNavModal.classList.remove('hidden');
            mobileNavModal.classList.add('flex');
            document.body.style.overflow = 'hidden';
        }
        function closeMobileNav() {
            if (!mobileNavModal) return;
            mobileNavModal.classList.add('hidden');
            mobileNavModal.classList.remove('flex');
            document.body.style.overflow = '';
        }
        mobileNavBtn?.addEventListener('click', openMobileNav);
        closeMobileNavBtn?.addEventListener('click', closeMobileNav);
        mobileNavModal?.addEventListener('click', closeMobileNav);

        // 초기 실행
        window.addEventListener('DOMContentLoaded', () => {
            loadFAQ();
        loadPublicQna();
        });
    
// ✅ 사용자 메뉴(모달) 내 로그아웃 버튼 바인딩 (누락 방지)
(() => {
  const btn = document.getElementById('userMenuLogoutBtn');
  if (!btn) return;
  // 중복 바인딩 방지
  if (btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      // 모달 닫기
      const modal = document.getElementById('userMenuModal');
      if (modal) modal.classList.add('hidden');
    } catch (err) {}
    window.hardLogout(); // 공통 로그아웃
  });
})();