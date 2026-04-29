// ============================================================
// mypage.js — 마이페이지 (비회원 주문 조회/내역 관리) 전체 로직
//
// 주요 기능:
//   - 비회원 세션 확인 (guestLookupKey SHA-256 해시 매칭)
//   - 접수 목록 실시간 조회 및 렌더링
//   - 견적 상세 보기 / 취소 요청
//   - 관리자 메시지 실시간 수신 + 알림음
//   - 파일 업로드/다운로드 (Firebase Storage)
//   - 회원 전용: 프로필 수정 / 비밀번호 재설정 / 탈퇴
// ============================================================

import { app, auth, db, storage,
         signOut, onAuthStateChanged, sendPasswordResetEmail,
         deleteUser, updateProfile, signInAnonymously,
         setPersistence, browserSessionPersistence, browserLocalPersistence,
         collection, onSnapshot, query, where, doc, getDoc, updateDoc,
         addDoc, serverTimestamp, orderBy, deleteDoc, setDoc, writeBatch,
         Timestamp, getDocs, limit, ref, uploadBytesResumable,
         getDownloadURL, deleteObject,
} from "../firebase.js";
import { initHeader } from "../header.js";
import "../overlays.js";
import "../session.js";

// 페이지 로드 시 공통 헤더 렌더링
document.addEventListener("DOMContentLoaded", () => initHeader(""));

// 인라인 스크립트에서도 auth 접근 가능하도록 전역 등록
try { window.auth = auth; } catch(e) {}
        
        try { window.signOut = signOut; } catch(e) {}
        try { window.signInAnonymously = signInAnonymously; } catch(e) {}
        try { window.onAuthStateChanged = onAuthStateChanged; } catch(e) {}
        try { window.__currentUser = auth.currentUser || null; } catch(e) {}
        try { window.currentUser = auth.currentUser || null; } catch(e) {}

        // SAFE_GUEST_INIT
        const __initialUser = await new Promise((resolve) => {
            const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u || null); });
        });
        if (!__initialUser) {
            await signInAnonymously(auth).catch(() => { /* ignore */ });
        }

        // =========================
        // 공통: 권한(관리자) 라우팅 + 강제 로그아웃
        // =========================
        // ── 관리자 역할 확인 ──────────────────────────────────────
        // 이메일 로그인 회원이 마이페이지 진입 시 관리자인지 확인 (관리자면 admin.html 로 이동)
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
            if (role === 'admin') {
                if (!location.pathname.endsWith('admin.html')) {
                    location.replace('admin.html');
                    return true;
                }
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

        // ==========================================
        // 다운로드 관련 유틸리티 (CORS/Blob/Firebase)
        // ==========================================
        // ── 파일 강제 다운로드 ────────────────────────────────────
        // Firebase Storage URL 을 fetch 로 가져와 Blob 링크로 강제 저장
        async function forceDownload(url, filename = 'download') {
            if (!url) return;
            if (url.startsWith('http://')) url = url.replace('http://', 'https://');
            const encodedFilename = encodeURIComponent(filename);

            if (url.includes('firebasestorage.googleapis.com')) {
                try {
                    const downloadUrl = new URL(url);
                    downloadUrl.searchParams.set('response-content-disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
                    const a = document.createElement('a');
                    a.href = downloadUrl.toString();
                    a.download = filename; 
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    return; 
                } catch (e) { console.warn('URL 변환 실패, 일반 다운로드 시도:', e); }
            }
            try {
                const response = await fetch(url, { mode: 'cors' });
                const blob = await response.blob();
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(blobUrl);
            } catch (e) { window.open(url, '_blank'); }
        }

        // 클릭 이벤트 리스너 (다운로드)
        document.addEventListener('click', async (e) => {
            const anchor = e.target.closest('a[data-force-download="1"]');
            if (!anchor) return;
            e.preventDefault(); e.stopPropagation();
            let url = anchor.href;
            let filename = anchor.getAttribute('download') || anchor.getAttribute('data-name') || 'download';
            filename = filename.replace(/^\d+_+/, '');
            if (url.startsWith('http://')) url = url.replace('http://', 'https://');
            
            try {
                const response = await fetch(url, { mode: 'cors' });
                if (!response.ok) throw new Error('Network response was not ok');
                const blob = await response.blob();
                const blobUrl = window.URL.createObjectURL(blob);
                const tempLink = document.createElement('a');
                tempLink.href = blobUrl;
                tempLink.download = filename;
                document.body.appendChild(tempLink);
                tempLink.click();
                document.body.removeChild(tempLink);
                window.URL.revokeObjectURL(blobUrl);
            } catch (err) {
                console.warn('Blob 다운로드 실패, 대체 방식 시도:', err);
                if (url.includes('firebasestorage.googleapis.com')) {
                    const urlObj = new URL(url);
                    urlObj.searchParams.set('response-content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
                    url = urlObj.toString();
                }
                window.open(url, '_blank');
            }
        }, { capture: true });

        // 전역 변수
        let currentUser = null;

        let unsubscribeQuotesSnapshot = null;
        let unsubscribeQuotes = null;
        let unsubscribeMessages = null;
        let myQuotesCache = [];
        let currentQuoteId = null;
        let companyInfoCache = null;
        let uploadedFile = null; 


        // ── 알림음 재생 시스템 ─────────────────────────────────────
        // 관리자 메시지 도착 시 소리를 재생합니다.
        // 쿨다운으로 연속 재생 방지, 첫 클릭 시 unlockSoundsOnce() 로 잠금 해제
        const __soundCooldown = new Map();
        function safePlay(audioEl, key, cooldownMs = 1800){
            try{
                if(!audioEl) return;
                const k = key || audioEl.id || 'sound';
                const now = Date.now();
                const last = __soundCooldown.get(k) || 0;
                if (now - last < cooldownMs) return;
                __soundCooldown.set(k, now);
                try { audioEl.currentTime = 0; } catch(e) {}
                audioEl.play().catch(()=>{});
            }catch(e){ console.warn('safePlay error:', e); }
        }
        let __soundsUnlockedMypage = false;
        async function unlockSoundsOnce(){
            if (__soundsUnlockedMypage) return;
            try{
                const ids = ['message-sound','file-sound','edit-sound','edit-sound-print'];
                let anyUnlocked = false;
                for (const id of ids){
                    const a = document.getElementById(id);
                    if (!a) continue;
                    try{
                        a.muted = true;
                        const p = a.play();
                        if (p && p.then) await p.catch(()=>{});
                        a.pause();
                        try { a.currentTime = 0; } catch(e) {}
                        a.muted = false;
                        anyUnlocked = true;
                    }catch(e){
                        // ignored (browser autoplay policy)
                    }
                }
                if (anyUnlocked) __soundsUnlockedMypage = true;
            }catch(e){}
        }

        async function getLatestAdminMessageType(quoteId){
            try{
                const qMsg = query(collection(db, `quotes/${quoteId}/messages`), orderBy("timestamp", "desc"), limit(1));
                const snap = await getDocs(qMsg);
                if (snap.empty) return 'text';
                const msg = (snap.docs[0].data() || {});
                // 관리자 메시지만 타입 판별(고객 메시지면 일반 텍스트 취급)
                if (msg.sender !== 'admin') return 'text';
                return msg.type || 'text';
            } catch(e) {
                console.warn('getLatestAdminMessageType error:', e);
                return 'text';
            }
        }

        document.addEventListener('click', () => { unlockSoundsOnce(); }, { once: true, capture: true });

        function isDetailModalOpen(){
            const m = document.getElementById('detailsModal');
            return !!(m && !m.classList.contains('hidden'));
        }

        function applyQuotesSnapshot(snapshot){
            myQuotesCache = snapshot.docs.map(d => {
                const data = d.data() || {};
                const total = (data.finalPrice ?? data.totalPrice ?? data.total ?? data.totalRounded ?? 0);
                const supply = (data.supplyPrice ?? data.supply ?? (Number(total) ? (Number(total)/1.1) : 0) ?? 0);
                const vat = (data.vatPrice ?? data.vat ?? (Number(total) - Number(supply)) ?? 0);
                return {
                    id: d.id,
                    ...data,
                    finalPrice: Number(total) || 0,
                    supplyPrice: Number(supply) || 0,
                    vat: Number(vat) || 0
                };
            });
            myQuotesCache.sort((a, b) => {
                const ta = a.createdAt?.seconds || (a.createdAt?.toDate ? +a.createdAt.toDate() : 0) || 0;
                const tb = b.createdAt?.seconds || (b.createdAt?.toDate ? +b.createdAt.toDate() : 0) || 0;
                return tb - ta;
            });
            renderQuoteList();
            updateOverallNotificationStatus();
        }

        // ── 접수 목록 실시간 구독 ─────────────────────────────────
        // 비회원 모드: guestContact + guestPwLast4 조건으로 Firestore 쿼리
        // 관리자 메시지가 오면 소리를 재생하고 목록을 갱신합니다.
        function startQuotesRealtimeListener({ mode, uid, guestLookupKey, guestContact, guestPwLast4 }){
            try{ if (unsubscribeQuotesSnapshot) unsubscribeQuotesSnapshot(); }catch(e){}
            let q = null;
            if (mode === 'member' && uid){
                q = query(collection(db, "quotes"), where("userId", "==", uid));
            } else if (mode === 'guest' && guestContact){
                // ✅ guestContact 기반 실시간 구독: 책자·인쇄 두 견적 모두 구독 가능
                // (guestLookupKey만 사용 시 다른 페이지의 접수건 누락 가능)
                q = query(collection(db, "quotes"),
                    where("isGuest", "==", true),
                    where("userId", "==", "guest"),
                    where("guestContact", "==", guestContact)
                );
            } else if (mode === 'guest' && guestLookupKey){
                // fallback: guestContact 없는 경우
                q = query(collection(db, "quotes"),
                    where("isGuest", "==", true),
                    where("userId", "==", "guest"),
                    where("guestLookupKey", "==", guestLookupKey)
                );
            } else {
                return;
            }

            let isInitial = true;
            let prev = [];

            unsubscribeQuotesSnapshot = onSnapshot(q, async (snap) => {
                try{
                    const nowDocs = snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
                    if (!isInitial){
                        const flipped = nowDocs.find(n => {
                            const o = prev.find(p => p.id === n.id);
                            return n.hasUnreadCustomerMessage && (!o || !o.hasUnreadCustomerMessage);
                        });
                        if (flipped){
                            const shouldNotify = (!isDetailModalOpen()) || (currentQuoteId !== flipped.id);
                            if (shouldNotify){
                                try{
                                    const t = await getLatestAdminMessageType(flipped.id);
                                    if (t === 'file') {
                                        safePlay(document.getElementById('file-sound'), 'file', 1200);
                                    } else if (t === 'system') {
                                        // 견적 수정(system) 알림: 디지털인쇄는 별도 사운드(있으면), 그 외는 기본 edit 사운드
                                        const isDigitalPrint = (flipped?.productType === 'print') || (flipped?.type === 'digital_print');
                                        const snd = isDigitalPrint ? (document.getElementById('edit-sound-print') || document.getElementById('edit-sound')) : document.getElementById('edit-sound');
                                        safePlay(snd, isDigitalPrint ? 'edit-print' : 'edit', 1200);
                                    } else {
                                        safePlay(document.getElementById('message-sound'), 'message', 1200);
                                    }
                                }catch(e){
                                    safePlay(document.getElementById('message-sound'), 'message', 1200);
                                }
                            }
                        }
                    }
                    prev = nowDocs;
                    applyQuotesSnapshot(snap);
                    isInitial = false;
                }catch(e){
                    console.warn('quotes realtime listener error:', e);
                }
            }, (err) => {
                console.warn('quotes realtime onSnapshot error:', err);
            });
        }
 

        const DOMElements = {
            loadingOverlay: document.getElementById('loading-overlay'),
            mainContent: document.getElementById('main-content'),
            welcomeMessage: document.getElementById('welcome-message'),
            welcomeDetailMsg: document.getElementById('welcome-detail-msg'),
            userTypeBadge: document.getElementById('user-type-badge'),
            guestEmptyBanner: document.getElementById('guest-empty-banner'),
            logoutBtn: document.getElementById('userMenuLogoutBtn'),
            searchInput: document.getElementById('searchInput'),
            statusFilter: document.getElementById('statusFilter'),
            quoteListBody: document.getElementById('quote-list-body'),
            quoteCardsWrap: document.getElementById('quote-cards-wrap'),
            tableLoadingIndicator: document.getElementById('table-loading-indicator'),
            notificationIndicator: document.getElementById('notification-indicator'),
            paymentInfoFooter: document.getElementById('payment-info-footer'),
            accountDetails: document.getElementById('account-details'),
            detailsModal: document.getElementById('detailsModal'),
            modalTitle: document.getElementById('modal-title'),
            modalContent: document.getElementById('modalContent'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            modalTabs: document.getElementById('modal-tabs'),
            chatTab: document.getElementById('chat-tab'),
            chatMessages: document.getElementById('chat-messages'),
            chatForm: document.getElementById('chat-form'),
            chatInput: document.getElementById('chat-input'),
            attachFileBtn: document.getElementById('attach-file-btn'),
            fileInput: document.getElementById('file-input'),
            uploadProgressContainer: document.getElementById('upload-progress-container'),
            uploadFileName: document.getElementById('upload-file-name'),
            uploadProgressBar: document.getElementById('upload-progress-bar'),
            proofTab: document.getElementById('proof-tab'),
            proofList: document.getElementById('proof-list'),
            filesTab: document.getElementById('files-tab'),
            fileList: document.getElementById('file-list'),
            quoteModal: document.getElementById('quoteModal'),
            printableTitle: document.getElementById('printable-title'),
            closeQuoteModalBtn: document.getElementById('closeQuoteModalBtn'),
            quoteBreakdownContent: document.getElementById('quote-breakdown-content'),
            printQuoteBtn: document.getElementById('printQuoteBtn'),
            taxInvoiceModal: document.getElementById('taxInvoiceModal'),
            taxInvoiceForm: document.getElementById('tax-invoice-form'),
            closeTaxInvoiceModalBtn: document.getElementById('closeTaxInvoiceModalBtn'),
            toastContainer: document.getElementById('toast-container'),
            confirmationModal: document.getElementById('confirmationModal'),
            confirmationTitle: document.getElementById('confirmationTitle'),
            confirmationMessage: document.getElementById('confirmationMessage'),
            confirmCancelBtn: document.getElementById('confirmCancelBtn'),
            confirmActionBtn: document.getElementById('confirmActionBtn'),
            imagePreviewModal: document.getElementById('imagePreviewModal'),
            previewImage: document.getElementById('previewImage'),
            closePreviewModalBtn: document.getElementById('closePreviewModalBtn'),
            previewModalTitle: document.getElementById('preview-modal-title'),
            passwordResetBtn: document.getElementById('password-reset-btn'),
            deleteAccountBtn: document.getElementById('delete-account-btn'),
            // Profile edit (member only)
            profileEmail: document.getElementById('profile-email'),
            profileName: document.getElementById('profile-name'),
            profileContact: document.getElementById('profile-contact'),
            profileSaveBtn: document.getElementById('profile-save-btn'),
            profileResetBtn: document.getElementById('profile-reset-btn'),
        };

        // 문서(견적서/거래명세서) 세부내역 표시 토글 상태
        let currentDocQuote = null;
        let currentDocType = null;
        const DOC_DETAILS_KEY = 'docShowDetails';
        function getDocShowDetails(){
            try{ const v = localStorage.getItem(DOC_DETAILS_KEY); return v === null ? true : v === 'true'; } catch(e){ return true; }
        }
        function setDocShowDetails(v){
            try{ localStorage.setItem(DOC_DETAILS_KEY, String(!!v)); } catch(e){}
        }
        function renderDocIfOpen(){
            try{
                const modal = DOMElements.quoteModal;
                const toggleEl = document.getElementById('docDetailsToggle');
                if (!modal || modal.classList.contains('hidden')) return;
                if (!currentDocQuote || !currentDocType) return;
                const showDetails = toggleEl ? !!toggleEl.checked : true;
                if(typeof generatePrintableQuote === 'function') {
                    DOMElements.quoteBreakdownContent.innerHTML = generatePrintableQuote(currentDocQuote, companyInfoCache, currentDocType, showDetails);
                }
            } catch(e){ console.warn('renderDocIfOpen failed', e); }
        }


        function sanitizeHTML(str) {
            if (!str) return '';
            return str.replace(/[&<>"']/g, (m) => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#039;'})[m]);
        }

        // ── 토스트 알림 표시 ──────────────────────────────────────
        // 화면 우상단에 일시적으로 메시지를 표시합니다.
        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            const icons = { success: 'fa-check-circle', error: 'fa-circle-exclamation', info: 'fa-info-circle' };
            const colors = { success: 'bg-green-600', error: 'bg-red-500', info: 'bg-slate-800' };
            
            toast.className = `flex items-center p-4 rounded-lg text-white shadow-xl transform translate-x-full transition-all duration-300 ${colors[type] || 'bg-slate-800'}`;
            toast.innerHTML = `<i class="fas ${icons[type]} mr-3 text-lg"></i><span class="font-medium text-sm">${sanitizeHTML(message)}</span>`;
            try { window.__speakToast && window.__speakToast(message); } catch(e) {}
            
            DOMElements.toastContainer.appendChild(toast);
            requestAnimationFrame(() => toast.classList.remove('translate-x-full'));
            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function showConfirmation(title, message) {
            return new Promise((resolve) => {
                DOMElements.confirmationTitle.textContent = title;
                DOMElements.confirmationMessage.textContent = message;
                DOMElements.confirmationModal.classList.remove('hidden');
                const cleanupAndHide = (result) => {
                    DOMElements.confirmationModal.classList.add('hidden');
                    DOMElements.confirmActionBtn.removeEventListener('click', onConfirm);
                    DOMElements.confirmCancelBtn.removeEventListener('click', onCancel);
                    resolve(result);
                };
                const onConfirm = () => cleanupAndHide(true);
                const onCancel = () => cleanupAndHide(false);
                DOMElements.confirmActionBtn.addEventListener('click', onConfirm);
                DOMElements.confirmCancelBtn.addEventListener('click', onCancel);
            });
        }

        async function loadCompanyInfo() {
             try {
                const docSnap = await getDoc(doc(db, "settings", "companyInfo"));
                if (docSnap.exists()) {
                    companyInfoCache = docSnap.data();
                    if(companyInfoCache.accountNum && companyInfoCache.accountHolder) {
                        DOMElements.accountDetails.textContent = `${companyInfoCache.accountNum} (예금주: ${companyInfoCache.accountHolder})`;
                        DOMElements.paymentInfoFooter.classList.remove('hidden');
                    }
                }
            } catch (e) { console.error("Error fetching company info:", e); }
        }

        function listenToMyQuotes() {
            if (!currentUser) return;

            const runGuestLookup = async () => {
                const primaryKey = currentUser.guestLookupKey;
                const legacyKey = currentUser.guestLookupKeyLegacy;
                const pw4 = (currentUser.guestPwLast4 || "").toString().trim();
                const cDigits = (currentUser.guestContact || "").toString().replace(/[^0-9]/g, "");

                // ✅ Firestore 정적 분석 통과를 위해 isGuest==true + userId=='guest' 반드시 포함
                // 등호(==) 필터만 사용하므로 복합 인덱스 생성 불필요
                const docsMap = new Map();

                const safeGet = async (q) => {
                    try { return await getDocs(q); } catch (e) { return null; }
                };

                const addSnap = (snap) => {
                    if (!snap || !snap.docs) return;
                    snap.docs.forEach(d => {
                        if (!d || !d.id) return;
                        docsMap.set(d.id, d);
                    });
                };

                // ✅ 연락처(guestContact)로 1차 조회 → 책자·인쇄 상관없이 동일 연락처의 모든 접수 조회
                // guestContact는 두 견적페이지 모두 동일하게 저장되므로 가장 신뢰도 높음
                if (cDigits) {
                    addSnap(await safeGet(query(collection(db, "quotes"),
                        where("isGuest", "==", true),
                        where("userId", "==", "guest"),
                        where("guestContact", "==", cDigits)
                    )));
                }

                // 2) primaryKey 추가 조회 (연락처 조회로 안 잡힌 건 보완)
                if (primaryKey) {
                    addSnap(await safeGet(query(collection(db, "quotes"),
                        where("isGuest", "==", true),
                        where("userId", "==", "guest"),
                        where("guestLookupKey", "==", primaryKey)
                    )));
                }

                // 3) legacyKey 추가 조회 (구버전 호환)
                if (legacyKey && legacyKey !== primaryKey) {
                    addSnap(await safeGet(query(collection(db, "quotes"),
                        where("isGuest", "==", true),
                        where("userId", "==", "guest"),
                        where("guestLookupKey", "==", legacyKey)
                    )));
                }

                const mergedDocs = Array.from(docsMap.values());
                return { snapshot: { docs: mergedDocs, empty: mergedDocs.length === 0 }, usedKey: primaryKey };
            };

            const p = (async () => {
                if (currentUser.isGuest) return await runGuestLookup();
                const q = query(collection(db, "quotes"), where("userId", "==", currentUser.uid));
                const snapshot = await getDocs(q);
                return { snapshot, usedKey: null };
            })();

            p.then(({ snapshot, usedKey }) => {
                if (snapshot.empty) {
                    DOMElements.tableLoadingIndicator.classList.add('hidden');
                    if (currentUser.isGuest) {
                        DOMElements.guestEmptyBanner.classList.remove('hidden');
                    }
                    DOMElements.quoteListBody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-400 bg-slate-50/50">
                        <div class="flex flex-col items-center gap-3">
                            <i class="fas fa-folder-open text-3xl opacity-20"></i>
                            <span>조회할 접수 내역이 없습니다.</span>
                        </div>
                    </td></tr>`;
                    return;
                }

                if (currentUser.isGuest && usedKey) {
                    try { sessionStorage.setItem('guestLookupKey', usedKey); } catch(e) {}
                    currentUser.guestLookupKey = usedKey;
                }

                applyQuotesSnapshot(snapshot);

                // ✅ Realtime: 상세/상담창이 닫혀있을 때만 새 메시지 소리
                try{
                    if (currentUser && currentUser.isGuest){
                        if (usedKey) startQuotesRealtimeListener({ mode: 'guest', guestLookupKey: usedKey, guestContact: sessionStorage.getItem('guestContact') || localStorage.getItem('guestContact') || '', guestPwLast4: sessionStorage.getItem('guestPwLast4') || localStorage.getItem('guestPwLast4') || '' });
                    } else if (currentUser){
                        startQuotesRealtimeListener({ mode: 'member', uid: currentUser.uid });
                    }
                }catch(e){ console.warn('startQuotesRealtimeListener failed:', e); }
            }).catch((error) => {
                console.error("Error fetching quotes: ", error);
                try {
                    const msg = String(error && (error.message || error.code) ? (error.message || error.code) : "");
                    if (msg.includes("Missing or insufficient permissions") || msg.toLowerCase().includes("permission")) {
                        if (currentUser && currentUser.isGuest) {
                            showToast('Firestore 권한 오류(403): 비회원 조회는 Firebase "익명 로그인(Anonymous)" 활성화가 필요합니다.\nFirebase 콘솔 → Authentication → Sign-in method → Anonymous 활성화 후 다시 시도해주세요.', 'error');
                        }
                    }
                } catch(_) {}
                if(DOMElements.tableLoadingIndicator) {
                    const cell = DOMElements.tableLoadingIndicator.querySelector('td');
                    cell.innerHTML = `<p class="text-red-500 py-4">목록 로드 실패<br><span class="text-xs text-slate-400">(${error.message})</span></p>`;
                }
            });
        }

        // ── 접수 목록 렌더링 ──────────────────────────────────────
        // 필터(상태, 탭)와 검색어를 적용해 테이블 행을 생성합니다.
        function renderQuoteList() {
            if(DOMElements.tableLoadingIndicator) DOMElements.tableLoadingIndicator.classList.add('hidden');
            DOMElements.quoteListBody.innerHTML = '';
            if (DOMElements.quoteCardsWrap) DOMElements.quoteCardsWrap.innerHTML = '';
            
            const searchTerm = DOMElements.searchInput.value.toLowerCase();
            const statusFilter = DOMElements.statusFilter.value;
            const filteredQuotes = myQuotesCache.filter(q => {
                const receiptNo = (q.receiptNo || '').toString().toLowerCase();
                const orderName = (q.orderName || '').toString().toLowerCase();
                const matchesSearch = searchTerm === '' || orderName.includes(searchTerm) || receiptNo.includes(searchTerm);
                const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
                return matchesSearch && matchesStatus;
            });

            const isMobile = window.matchMedia('(max-width: 640px)').matches;
            if (DOMElements.quoteCardsWrap) DOMElements.quoteCardsWrap.innerHTML = '';

            if (filteredQuotes.length === 0) {
                if (DOMElements.quoteListBody) DOMElements.quoteListBody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-400">조건에 맞는 작업이 없습니다.</td></tr>`;
                if (DOMElements.quoteCardsWrap) DOMElements.quoteCardsWrap.innerHTML = `<div class="text-center py-10 text-slate-400">조건에 맞는 작업이 없습니다.</div>`;
                return;
            }

            filteredQuotes.forEach(q => {
                const tr = document.createElement('tr');
                tr.className = 'bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors group';
                const createdAt = q.createdAt ? q.createdAt.toDate().toLocaleDateString('ko-KR') : '-';
                const hasUnread = q.hasUnreadCustomerMessage;
                const editedBy = q.lastEditedBy || '';
                const editedAt = q.lastEditedAt ? q.lastEditedAt.toDate().toLocaleString('ko-KR') : '';
                
                // 상태 뱃지(확실히 구분되도록 색상/테두리 강화)
                const statusRaw = (q.cancelRequestState === 'approved' || q.cancelApprovedAt) ? '취소확정'
                                : (q.cancelRequestState === 'requested') ? '취소요청'
                                : (q.cancelRequestState === 'rejected') ? '취소거절'
                                : (q.status || '접수대기');

                const statusStyleMap = {
                    // 기본/대기: 회색(파스텔)
                    '접수대기':   'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
                    '접수완료':   'bg-slate-200 text-slate-800 ring-1 ring-slate-300',
                    '접수확인':   'bg-slate-200 text-slate-800 ring-1 ring-slate-300',

                    // 진행/작업: 파랑(파스텔)
                    '작업중':     'bg-blue-200/70 text-blue-900 ring-1 ring-blue-300',
                    '제작중':     'bg-blue-200/70 text-blue-900 ring-1 ring-blue-300',
                    '진행중':     'bg-blue-200/70 text-blue-900 ring-1 ring-blue-300',

                    // 견적: 보라(파스텔)
                    '견적완료':   'bg-violet-200/70 text-violet-900 ring-1 ring-violet-300',
                    '견적발송':   'bg-violet-200/70 text-violet-900 ring-1 ring-violet-300',

                    // 결제: 노랑/연두(파스텔)
                    '결제대기':   'bg-yellow-200/75 text-yellow-900 ring-1 ring-yellow-300',
                    '결제완료':   'bg-lime-200/75 text-lime-900 ring-1 ring-lime-300',

                    // 배송: 하늘(파스텔)
                    '배송중':     'bg-sky-200/75 text-sky-900 ring-1 ring-sky-300',
                    '출고':       'bg-sky-200/75 text-sky-900 ring-1 ring-sky-300',

                    // 완료: 초록(파스텔)
                    '완료':       'bg-emerald-200/75 text-emerald-900 ring-1 ring-emerald-300',
                    '작업완료':   'bg-emerald-200/75 text-emerald-900 ring-1 ring-emerald-300',
                    '주문완료':   'bg-emerald-200/75 text-emerald-900 ring-1 ring-emerald-300',

                    // 취소류: 빨강/주황/핑크(파스텔)
                    '취소요청':   'bg-orange-200/75 text-orange-900 ring-1 ring-orange-300',
                    '취소거절':   'bg-fuchsia-200/75 text-fuchsia-900 ring-1 ring-fuchsia-300',
                    '취소확정':   'bg-red-200/75 text-red-900 ring-1 ring-red-300',
                    '주문취소':   'bg-red-200/75 text-red-900 ring-1 ring-red-300',
                };

                const pickStyle = (s) => {
                    if (!s) return statusStyleMap['접수대기'];
                    // 키워드 기반 보정
                    if (s.includes('취소')) return statusStyleMap[s] || statusStyleMap['주문취소'];
                    if (s.includes('완료')) return statusStyleMap[s] || statusStyleMap['완료'];
                    if (s.includes('결제')) return statusStyleMap[s] || statusStyleMap['결제완료'];
                    if (s.includes('배송') || s.includes('출고')) return statusStyleMap[s] || statusStyleMap['배송중'];
                    if (s.includes('견적')) return statusStyleMap[s] || statusStyleMap['견적완료'];
                    if (s.includes('진행') || s.includes('제작') || s.includes('작업')) return statusStyleMap[s] || statusStyleMap['작업중'];
                    return statusStyleMap[s] || 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
                };

                const statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-extrabold tracking-tight ${pickStyle(statusRaw)}">${statusRaw}</span>`;

const canEdit = (!q.status || q.status === '접수완료');
               
               // [수정된 버튼 HTML] 텍스트를 <span class="lbl">로 감싸 모바일에서 숨김 처리
               
// [개선] 관리 버튼이 많아져도 표가 좁아지지 않도록: 기본 3개 + 더보기(드롭다운)로 분리
const primaryButtons = `
     <button type="button" class="view-quote-btn action-btn items-center justify-center px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm" data-id="${q.id}" title="견적서 보기">
         <i class="fas fa-file-invoice text-slate-400"></i><span class="lbl">견적서</span>
     </button>

     ${canEdit ? `
     <button type="button" class="reload-quote-btn action-btn items-center justify-center px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm" data-id="${q.id}" title="이 내용으로 견적 수정/재신청">
         <i class="fas fa-pen-to-square"></i><span class="lbl">수정하기</span>
     </button>` : `
     <button type="button" class="reload-quote-btn action-btn items-center justify-center px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed opacity-70" data-id="${q.id}" data-locked="1" title="작업 진행 상태에서는 고객 수정이 불가합니다. (상태: ${q.status})">
         <i class="fas fa-lock"></i><span class="lbl">수정불가</span>
     </button>`}

     <button type="button" class="view-details-btn action-btn items-center justify-center px-3 py-1.5 text-xs font-bold text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 shadow-sm transition-all active:scale-95" data-id="${q.id}">
         <i class="fas fa-comments"></i><span class="lbl">상세/상담</span>
     </button>
`;

let extraButtons = '';

// 상태별 취소 버튼 처리 (더보기로 이동)
if (q.status === '주문취소' && (q.cancelRequestState === 'approved' || q.cancelApprovedAt)) {
     extraButtons += `
         <button type="button" class="cancel-confirmed-btn menu-btn w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-red-700 hover:bg-slate-50 rounded-md cursor-not-allowed" data-id="${q.id}" disabled>
             <i class="fas fa-circle-check"></i><span>취소확정</span>
         </button>`;
} else if (q.status === '취소요청' || q.cancelRequestState === 'requested') {
     extraButtons += `
         <button type="button" class="cancel-requested-btn menu-btn w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-amber-800 hover:bg-slate-50 rounded-md cursor-not-allowed" data-id="${q.id}" disabled>
             <i class="fas fa-triangle-exclamation"></i><span>취소요청됨</span>
         </button>`;
} else if (q.status === '접수완료') {
     extraButtons += `
         <button type="button" class="request-cancel-btn menu-btn w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-red-700 hover:bg-slate-50 rounded-md" data-id="${q.id}" title="접수완료 상태에서만 주문취소가 가능합니다.">
             <i class="fas fa-ban"></i><span>주문취소</span>
         </button>`;
} else if (q.status !== '주문취소') {
     extraButtons += `
         <button type="button" class="cancel-disabled-btn menu-btn w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-400 hover:bg-slate-50 rounded-md cursor-not-allowed" data-id="${q.id}" disabled title="작업 진행 상태에서는 주문취소가 불가합니다. (상태: ${sanitizeHTML(q.status || '-')})">
             <i class="fas fa-ban"></i><span>취소불가</span>
         </button>`;
}

// 작업완료/결제완료 시 명세서/계산서
if (q.status === '작업완료' || q.status === '결제완료') {
     extraButtons += `
         <button type="button" class="view-statement-btn menu-btn w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-slate-50 rounded-md" data-id="${q.id}" title="거래명세서 발급">
             <i class="fas fa-receipt"></i><span>거래명세서</span>
         </button>`;
     if (!q.taxInvoiceInfo) {
         extraButtons += `
             <button type="button" class="request-tax-invoice-btn menu-btn w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-md" data-id="${q.id}" title="세금계산서 신청">
                 <i class="fas fa-won-sign"></i><span>세금계산서 신청</span>
             </button>`;
     } else {
         extraButtons += `
             <button type="button" class="menu-btn w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-50 rounded-md cursor-not-allowed" disabled>
                 <i class="fas fa-won-sign"></i><span>세금계산서 신청완료</span>
             </button>`;
     }
}

let buttonsHtml = `
     <div class="action-bar flex flex-nowrap items-center justify-end gap-1.5">
         ${primaryButtons}
         ${extraButtons.trim() ? `
         <div class="relative more-actions-wrap">
             <button type="button" class="more-actions-btn action-btn items-center justify-center px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm" data-id="${q.id}" title="더보기">
                 <i class="fas fa-ellipsis"></i><span class="lbl">더보기</span>
             </button>
             <div class="more-actions-menu hidden absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50" data-id="${q.id}">
                 ${extraButtons}
             </div>
         </div>` : ``}
     </div>
`;

                // 금액 포맷팅 (q.finalPrice가 숫자라고 가정)
                const priceStr = q.finalPrice ? Number(q.finalPrice).toLocaleString() + '원' : '0원';

                tr.innerHTML = `
                    <td class="px-6 py-4 text-slate-500 col-date">${createdAt}</td>
                    <td class="px-6 py-4 text-xs font-mono text-slate-700 whitespace-nowrap col-receipt">${sanitizeHTML(q.receiptNo || "-")}</td>
                    <td class="px-6 py-4 font-bold text-slate-800 group-hover:text-brand-700 transition-colors col-name break-words">
                        ${(() => {
                            const t = (q.productType === 'book') ? '책자/제본' : '디지털인쇄';
                            const cls = (q.productType === 'book')
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200';
                            return `<span class="inline-flex items-center px-2 py-0.5 mr-2 rounded border text-[11px] font-extrabold ${cls}">${t}</span>`;
                        })()}
                        ${sanitizeHTML(q.orderName)}
                        ${hasUnread ? '<span class="ml-2 text-red-500 inline-block animate-pulse" title="새 메시지"><i class="fas fa-comment-dots"></i></span>' : ''}
                    </td>
                    
                    <td class="px-6 py-4 text-right font-medium text-slate-600 tracking-tight col-price">
                        ${priceStr}
                    </td>

                    <td class="px-6 py-4 col-status">${statusBadge}</td>
                    <td class="px-6 py-4 text-right col-actions">${buttonsHtml}</td>
                `;
                DOMElements.quoteListBody.appendChild(tr);

                // 모바일 카드 렌더링
                if (isMobile && DOMElements.quoteCardsWrap) {
                    const card = document.createElement('div');
                    card.className = 'rounded-xl border border-slate-200 bg-white shadow-sm p-4';
                    card.innerHTML = `
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="text-[11px] text-slate-500">${createdAt} · <span class="font-mono">${sanitizeHTML(q.receiptNo || "-")}</span></div>
                                <div class="mt-1 font-extrabold text-slate-800 leading-snug break-words">
                                    ${(() => {
                                        const t = (q.productType === 'book') ? '책자/제본' : '디지털인쇄';
                                        const cls = (q.productType === 'book')
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200';
                                        return `<span class=\"inline-flex items-center px-2 py-0.5 mr-2 rounded border text-[11px] font-extrabold ${cls}\">${t}</span>`;
                                    })()}
                                    ${sanitizeHTML(q.orderName)}
                                    ${hasUnread ? '<span class="ml-2 text-red-500 inline-block animate-pulse" title="새 메시지"><i class="fas fa-comment-dots"></i></span>' : ''}
                                </div>
                            </div>
                            <div class="shrink-0 text-right">
                                <div class="text-sm font-extrabold text-slate-800">${priceStr}</div>
                                <div class="mt-1">${statusBadge}</div>
                            </div>
                        </div>
                        <div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                            ${buttonsHtml}
                        </div>
                    `;
                    // buttonsHtml 안의 외부 래퍼(div.flex...)가 들어가므로 중복 래퍼를 제거
                    const inner = card.querySelector('div.mt-3');
                    if (inner) {
                        const wrap = inner.querySelector('div');
                        if (wrap) {
                            wrap.classList.remove('w-full');
                            wrap.className = 'flex flex-wrap gap-2 justify-end';
                        }
                    }
                    DOMElements.quoteCardsWrap.appendChild(card);
                }
            });
        }
        
        // ── 견적 상세 모달 열기 ──────────────────────────────────
        // 선택한 견적의 전체 정보와 채팅창을 팝업으로 표시합니다.
        function showDetailsModal(quote) {
            currentQuoteId = quote.id;
            DOMElements.modalTitle.textContent = `'${quote.orderName}' 상세 정보`;
            
            if (typeof window.generateDetailedSpecsHtml === 'function') {
                DOMElements.modalContent.innerHTML = window.generateDetailedSpecsHtml(quote);
            } else {
                DOMElements.modalContent.innerHTML = '<p class="p-4 text-slate-500">상세 정보를 불러오는 스크립트가 로드되지 않았습니다.</p>';
            }

            try {
                const atts = Array.isArray(quote.attachments) ? quote.attachments : [];
                if (atts.length > 0) {
                    const block = document.createElement('div');
                    block.className = 'bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6';
                    block.innerHTML = `
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-bold text-slate-800 flex items-center gap-2"><i class="fas fa-paperclip text-slate-400"></i>접수 첨부파일</h4>
                            <span class="text-xs text-slate-400">${atts.length}개</span>
                        </div>
                        <div class="space-y-2">
                            ${atts.map((a, i) => {
                                const name = sanitizeHTML(a?.name || `첨부파일_${i+1}`);
                                const url = (a?.url || '');
                                if (!url) return '';
                                return `
                                  <div class="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                                    <div class="min-w-0">
                                      <p class="text-sm font-medium text-slate-700 truncate">${name}</p>
                                    </div>
                                    <a href="${url}" data-force-download="1" download="${name}" class="shrink-0 px-3 py-1.5 rounded-md text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700">저장</a>
                                  </div>`;
                            }).join('')}
                        </div>
                        <p class="mt-3 text-[11px] text-slate-400">※ ‘저장’을 누르면 브라우저 다운로드로 컴퓨터에 저장됩니다.</p>
                    `;
                    DOMElements.modalContent.prepend(block);
                }
            } catch (e) { console.warn('attachments render failed', e); }
            
            DOMElements.detailsModal.classList.remove('hidden');
            listenToMessages(quote.id);
            if (quote.hasUnreadCustomerMessage) updateDoc(doc(db, "quotes", quote.id), { hasUnreadCustomerMessage: false });
        }
        
        function closeDetailsModal() {
            try {
                DOMElements.detailsModal.classList.add('hidden');
                if (typeof unsubscribeMessages === 'function' && unsubscribeMessages) unsubscribeMessages();
                currentQuoteId = null;
                if (typeof resetUploadUI === 'function') resetUploadUI();
            } catch (e) {
                console.warn('closeDetailsModal failed:', e);
            }
        }

        
        function getCancelBlockedMessage(status){
            const s = (status || '').toString();
            if (s.includes('진행') || s.includes('작업중') || s.includes('제작')) return '작업진행중입니다.';
            if (s.includes('작업완료')) return '작업완료상태입니다.';
            if (s.includes('결제완료')) return '결제가 완료되었습니다.';
            return '현재 상태에서는 주문취소가 불가합니다.';
        }
// ── 주문 취소 요청 ──────────────────────────────────────────
// 고객이 취소 요청 시 Firestore status 를 '취소요청' 으로 업데이트합니다.
async function requestCancelOrder(quote) {
            try {
                if (!quote || !quote.id) return;

                // ✅ 운영 정책: 고객 취소는 '접수완료'에서만 허용
                // 리스트가 오래된 상태일 수 있으므로, 최신 상태를 한번 더 확인합니다.
                const latestSnap = await getDoc(doc(db, 'quotes', quote.id));
                const latest = latestSnap.exists() ? latestSnap.data() : null;
                const latestStatus = latest?.status ?? quote.status;
                if (latestStatus !== '접수완료') {
                    showToast(getCancelBlockedMessage(latestStatus), 'info');
                    return;
                }
const cancelState = quote.cancelRequestState || (quote.status === '취소요청' ? 'requested' : null);
                if (cancelState === 'requested') { showToast('이미 취소요청이 접수되었습니다.', 'info'); return; }
                if (quote.status === '주문취소') { showToast('이미 취소 처리된 주문입니다.', 'info'); return; }

                const ok = await showConfirmation(
                    '주문 취소',
                    '접수완료 상태에서만 주문취소가 가능합니다. 지금 취소요청을 접수할까요?'
                );
                if (!ok) return;

                // ✅ 효율/안정성: 고객은 "상태(status)"를 바꾸지 않고, 취소요청 메타만 기록합니다.
                // (보안규칙/운영정책 충돌 방지 + 레거시 데이터와 호환)
                await updateDoc(doc(db, "quotes", quote.id), {
                    cancelPrevStatus: quote.status || '접수대기',
                    cancelRequestedAt: serverTimestamp(),
                    cancelRequestedBy: currentUser?.isGuest ? 'guest' : 'member',
                    cancelRequestState: 'requested'
                });

                showToast('취소요청이 접수되었습니다.', 'success');
            } catch (err) {
                console.error(err);
                try{
                    const latestSnap2 = await getDoc(doc(db, 'quotes', quote.id));
                    const latest2 = latestSnap2.exists() ? latestSnap2.data() : null;
                    const st2 = latest2?.status ?? quote.status;
                    if (st2 && st2 !== '접수완료') {
                        showToast(getCancelBlockedMessage(st2), 'info');
                    } else {
                        showToast(`취소요청 처리 중 오류가 발생했습니다. (${err?.code || 'unknown'})`, 'error');
                    }
                }catch(_){
                    showToast(`취소요청 처리 중 오류가 발생했습니다. (${err?.code || 'unknown'})`, 'error');
                }
            }
        }

         function renderFileList(messages) {
            const fileMessages = messages.filter(msg => msg.type === 'file' && !msg.isProof);
            // 파일 개수 배지 업데이트
            const badge = document.getElementById('files-count-badge');
            if (badge) badge.textContent = fileMessages.length > 0 ? `파일 ${fileMessages.length}` : '파일';
            if (fileMessages.length === 0) { DOMElements.fileList.innerHTML = '<div class="text-center py-4 text-slate-300 text-xs">파일이 없습니다.</div>'; return; }
            DOMElements.fileList.innerHTML = '';
            fileMessages.forEach(msg => {
                const fileItem = document.createElement('div');
                fileItem.className = 'flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors group';
                fileItem.innerHTML = `
					<a href="${msg.fileURL}" data-force-download="1" download="${sanitizeHTML(msg.fileName)}" class="text-sm font-medium text-slate-700 hover:text-brand-600 truncate flex-grow flex items-center">
                        <div class="w-8 h-8 rounded bg-brand-50 text-brand-600 flex items-center justify-center mr-3 text-lg"><i class="fas fa-file"></i></div>
                        ${sanitizeHTML(msg.fileName)}
                    </a>
                    <div class="flex items-center ml-2">
                        <span class="text-xs text-slate-400 mr-2">${msg.sender==='customer'?'나':'관리자'}</span>
                        ${msg.sender === 'customer' ? `<button data-msg-id="${msg.id}" data-file-path="${msg.filePath}" class="delete-file-btn text-slate-300 hover:text-red-500 transition-colors p-1"><i class="fas fa-trash-alt"></i></button>` : ''}
                    </div>
                `;
                DOMElements.fileList.appendChild(fileItem);
            });
        }
        
        function renderProofList(messages) {
            const proofMessages = messages.filter(msg => msg.type === 'file' && msg.isProof);
            if (proofMessages.length === 0) { DOMElements.proofList.innerHTML = '<div class="text-center py-10 text-slate-300 text-sm">확인할 시안이 없습니다.</div>'; return; }
            DOMElements.proofList.innerHTML = '';
             proofMessages.forEach(msg => {
                const proofItem = document.createElement('div');
                proofItem.className = 'p-4 bg-white border border-slate-200 rounded-xl shadow-sm mb-3';
                let statusBadge = '';
                if (msg.proofStatus === 'approved') statusBadge = `<span class="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">승인됨</span>`;
                else if (msg.proofStatus === 'rejected') statusBadge = `<span class="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">수정 요청</span>`;
                else statusBadge = `<span class="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">확인 대기중</span>`;
                
                const isImage = /\.(jpe?g|png|gif|webp)$/i.test(msg.fileName);
                proofItem.innerHTML = `
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 text-xl flex-shrink-0">
                                <i class="fas ${isImage?'fa-image':'fa-file-pdf'}"></i>
                            </div>
                            <div class="flex flex-col overflow-hidden">
							<a href="${msg.fileURL}" data-force-download="1" download="${sanitizeHTML(msg.fileName)}" class="text-sm font-bold text-slate-800 hover:text-brand-600 truncate transition-colors">${sanitizeHTML(msg.fileName)}</a>
                                <span class="text-xs text-slate-400">${msg.timestamp?.toDate().toLocaleString()}</span>
                            </div>
                        </div>
                        <div class="flex-shrink-0 ml-2">${statusBadge}</div>
                    </div>
                    <div class="flex gap-2 justify-end border-t border-slate-100 pt-3">
                        ${isImage ? `<button class="btn btn-secondary btn-sm preview-image-btn py-1 px-3 text-xs h-8" data-url="${msg.fileURL}">크게 보기</button>` : ''}
                        ${msg.proofStatus !== 'approved' && msg.proofStatus !== 'rejected' ? `<button class="btn btn-success btn-sm approve-proof-btn py-1 px-3 text-xs h-8" data-msg-id="${msg.id}"><i class="fas fa-check "></i>승인</button><button class="btn btn-danger btn-sm reject-proof-btn py-1 px-3 text-xs h-8" data-msg-id="${msg.id}"><i class="fas fa-times "></i>수정요청</button>` : ''}
                    </div>
                    ${msg.rejectionReason ? `<p class="text-xs text-red-600 mt-3 p-3 bg-red-50 rounded-lg border border-red-100"><strong><i class="fas fa-comment-alt "></i>수정 요청:</strong> ${sanitizeHTML(msg.rejectionReason)}</p>` : ''}
                `;
                DOMElements.proofList.appendChild(proofItem);
            });
        }

        // ── 1:1 채팅 메시지 실시간 구독 ─────────────────────────
        // 선택한 견적의 messages 서브컬렉션을 실시간으로 감시합니다.
        function listenToMessages(quoteId) {
            if (unsubscribeMessages) unsubscribeMessages();
            const q = query(collection(db, `quotes/${quoteId}/messages`), orderBy("timestamp"));
            unsubscribeMessages = onSnapshot(q, (snapshot) => {
                DOMElements.chatMessages.innerHTML = '';
                const allMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                let lastDate = '';
                
                allMessages.forEach(msg => {
                    if(msg.isProof) return;
                    
                    const msgDate = msg.timestamp ? msg.timestamp.toDate().toLocaleDateString() : '';
                    if (msgDate && msgDate !== lastDate) {
                        const dateDiv = document.createElement('div');
                        dateDiv.className = 'text-center my-4';
                        dateDiv.innerHTML = `<span class="bg-slate-100 text-slate-400 text-[10px] px-3 py-1 rounded-full">${msgDate}</span>`;
                        DOMElements.chatMessages.appendChild(dateDiv);
                        lastDate = msgDate;
                    }

                    const msgContainer = document.createElement('div');
                    const isCustomer = msg.sender === 'customer';
                    msgContainer.className = `flex flex-col ${isCustomer ? 'items-end' : 'items-start'} mb-3`;
                    
                    let messageContent = '';
                    if (msg.type === 'file' && msg.fileName) {
						messageContent = `<div class="flex items-center gap-2"><div class="w-8 h-8 bg-white/20 rounded flex items-center justify-center"><i class="fas fa-file-alt"></i></div> <a href="${msg.fileURL}" data-force-download="1" download="${sanitizeHTML(msg.fileName)}" class="underline hover:opacity-80 truncate max-w-[200px]">${sanitizeHTML(msg.fileName)}</a></div>`;
                    } else if (msg.text) {
                        messageContent = sanitizeHTML(msg.text);
                    }
                    if(!messageContent) return; 
                    
                    const timeStr = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
                    
                    msgContainer.innerHTML = `
                        <div class="flex items-end gap-1 ${isCustomer ? 'flex-row-reverse' : 'flex-row'}">
                            <div class="chat-bubble ${isCustomer ? 'chat-bubble-customer' : 'chat-bubble-admin'}">${messageContent}</div>
                            <span class="text-[10px] text-slate-300 min-w-[35px] ${isCustomer ? 'text-right' : 'text-left'}">${timeStr}</span>
                        </div>
                    `;
                    DOMElements.chatMessages.appendChild(msgContainer);
                });
                renderFileList(allMessages);
                renderProofList(allMessages);
                DOMElements.chatMessages.scrollTop = DOMElements.chatMessages.scrollHeight;
            });
        }
        
        function resetUploadUI() {
            uploadedFile = null;
            DOMElements.fileInput.value = '';
            DOMElements.uploadProgressContainer.classList.add('hidden');
            DOMElements.uploadFileName.textContent = '';
            DOMElements.uploadProgressBar.style.width = '0%';
            DOMElements.chatForm.querySelector('button[type="submit"]').disabled = false;
        }

        function handleFileSelection(event) {
            const file = event.target.files[0];
            // 업로드 제한(규칙과 동일): 300MB / 주요 문서·이미지·압축 파일만 허용
            const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
            const ext = (file?.name?.split('.').pop() || '').toLowerCase();
            const allowedExt = ['pdf','jpg','jpeg','png','gif','webp','zip','doc','docx','xls','xlsx','ppt','pptx','hwp','heic'];
            if (file.size > MAX_UPLOAD_BYTES) {
                showToast(`파일 용량이 너무 큽니다. 최대 ${Math.floor(MAX_UPLOAD_BYTES/1024/1024)}MB까지 업로드 가능합니다.`, 'error');
                event.target.value = '';
                resetUploadUI && resetUploadUI();
                return;
            }
            // 일부 환경에서 file.type이 비어있는 경우가 있어 확장자 기준도 함께 체크
            if (file.type && !(file.type.startsWith('image/') || ['application/pdf','application/zip','application/x-zip-compressed',
                'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/octet-stream'].includes(file.type))) {
                showToast('허용되지 않은 파일 형식입니다. (pdf/이미지/zip/docx/xlsx/pptx 등)', 'error');
                event.target.value = '';
                resetUploadUI && resetUploadUI();
                return;
            }
            if (!file.type && ext && !allowedExt.includes(ext)) {
                showToast('허용되지 않은 파일 확장자입니다. (pdf/이미지/zip/docx/xlsx/pptx 등)', 'error');
                event.target.value = '';
                resetUploadUI && resetUploadUI();
                return;
            }

            if (!file || !currentQuoteId) return;
            DOMElements.uploadFileName.textContent = file.name;
            DOMElements.uploadProgressContainer.classList.remove('hidden');
            DOMElements.uploadProgressBar.style.width = '0%';
            DOMElements.chatForm.querySelector('button[type="submit"]').disabled = true;
            const storageRef = ref(storage, `quotes/${currentQuoteId}/${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);
            uploadTask.on('state_changed', (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    DOMElements.uploadProgressBar.style.width = progress + '%';
                }, (error) => { console.error("Upload failed:", error); showToast('파일 업로드에 실패했습니다.', 'error'); resetUploadUI(); }, 
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    uploadedFile = { name: file.name, url: downloadURL, path: uploadTask.snapshot.ref.fullPath };
                    showToast('업로드 완료. 전송 버튼을 눌러주세요.', 'success');
                    DOMElements.chatForm.querySelector('button[type="submit"]').disabled = false;
                }
            );
        }
        
        async function handleChatSubmit(event) {
            event.preventDefault();
            const text = DOMElements.chatInput.value.trim();
            if (!text && !uploadedFile) return;
            const submitBtn = DOMElements.chatForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            try {
                const messageData = { sender: 'customer', timestamp: serverTimestamp(), text: text || '' };
                if (uploadedFile) { messageData.type = 'file'; messageData.fileName = uploadedFile.name; messageData.fileURL = uploadedFile.url; messageData.filePath = uploadedFile.path; }
                await addDoc(collection(db, `quotes/${currentQuoteId}/messages`), messageData);
                await updateDoc(doc(db, "quotes", currentQuoteId), { hasUnreadAdminMessage: true });
                DOMElements.chatInput.value = '';
                resetUploadUI();
            } catch (error) { console.error("Message send failed:", error); showToast('메시지 전송에 실패했습니다.', 'error'); } finally { submitBtn.disabled = false; }
        }
        
        function updateOverallNotificationStatus() {
            const hasAnyUnread = myQuotesCache.some(q => q.hasUnreadCustomerMessage);
            DOMElements.notificationIndicator.classList.toggle('hidden', !hasAnyUnread);
        }
        
        async function deleteFile(msgId, filePath) {
            if(!currentQuoteId || !filePath) return;
            const confirmed = await showConfirmation('파일 삭제', '이 파일을 정말로 삭제하시겠습니까?');
            if (!confirmed) return;
            try {
                await deleteObject(ref(storage, filePath));
                await deleteDoc(doc(db, `quotes/${currentQuoteId}/messages`, msgId));
                showToast('파일이 성공적으로 삭제되었습니다.', 'success');
            } catch (error) { showToast('파일 삭제 중 오류가 발생했습니다.', 'error'); }
        }

        async function handlePasswordReset() {
            if (!currentUser || !currentUser.email) { showToast('사용자 정보를 찾을 수 없습니다.', 'error'); return; }
            if (await showConfirmation('비밀번호 재설정', `${currentUser.email} 주소로 비밀번호 재설정 메일을 보내시겠습니까?`)) {
                try { await sendPasswordResetEmail(auth, currentUser.email); showToast('비밀번호 재설정 이메일을 보냈습니다.', 'success'); } catch (error) { showToast('이메일 전송에 실패했습니다.', 'error'); }
            }
        }
        async function handleDeleteAccount() {
            if(currentUser.isGuest) { showToast('비회원은 탈퇴 기능이 없습니다. 로그아웃 하시면 정보가 남지 않습니다.', 'info'); return; }
            if (await showConfirmation( '회원 탈퇴', '정말로 회원 탈퇴를 진행하시겠습니까? 모든 정보가 영구적으로 삭제됩니다.')) {
                try {
                    const user = auth.currentUser;
                    const batch = writeBatch(db);
                    const quotesQ = query(collection(db, "quotes"), where("userId", "==", user.uid));
                    const qSnap = await getDocs(quotesQ);
                    for(const qDoc of qSnap.docs) batch.delete(qDoc.ref);
                    batch.delete(doc(db, "users", user.uid));
                    await batch.commit();
                    await deleteUser(user);
                    showToast('회원 탈퇴 완료', 'success');
                    setTimeout(() => window.location.href = 'index.html', 2000);
                } catch (error) { showToast('오류 발생: 다시 로그인 후 시도해주세요.', 'error'); }
            }
        }
        
        function setupEventListeners() {
            // 1. [헤더] 데스크탑 로그아웃 버튼
            if (DOMElements.logoutBtn) {
                DOMElements.logoutBtn.addEventListener('click', async () => {
                    await window.hardLogout('index.html');
                });
            }

            // 2. [헤더] 데스크탑 상단 아이콘 (로그인/사람 모양)
            const authActionBtn = document.getElementById('auth-action-btn');
            if (authActionBtn) {
                authActionBtn.addEventListener('click', () => {
                    // 로그인 상태가 아니라면 로그인 페이지로 이동
                    if (!currentUser || currentUser.isGuest) {
                        location.href = 'index.html';
                    }
                });
            }

            // 3. [모바일] 메뉴 로그인/로그아웃 버튼 (추가된 부분)
            const mobileAuthBtn = document.getElementById('mobile-auth-btn');
            if (mobileAuthBtn) {
                mobileAuthBtn.addEventListener('click', async () => {
                    // 회원(Member)이거나 비회원(Guest) 조회 세션이 있는 경우 -> 로그아웃 실행
                    const isGuestSession = sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKey');
                    const isLoggedIn = (currentUser && !currentUser.isAnonymous) || isGuestSession;

                    if (isLoggedIn) {
                        await window.hardLogout('index.html');
                    } else {
                        // 로그인되어 있지 않다면 -> 로그인 페이지로 이동
                        location.href = 'index.html';
                    }
                });
            }

            // 4. 검색 및 필터
            if (DOMElements.searchInput) DOMElements.searchInput.addEventListener('input', renderQuoteList);
            if (DOMElements.statusFilter) DOMElements.statusFilter.addEventListener('change', renderQuoteList);

            // 5. 프로필 수정 (회원 전용)
            if (currentUser && !currentUser.isGuest) {
                if (DOMElements.profileContact) {
                    DOMElements.profileContact.addEventListener('input', (e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        e.target.value = formatPhoneHyphen(digits);
                    });
                }
                if (DOMElements.profileResetBtn) {
                    DOMElements.profileResetBtn.addEventListener('click', () => fillProfileFormFromCurrentUser());
                }
                if (DOMElements.profileSaveBtn) {
                    DOMElements.profileSaveBtn.addEventListener('click', async () => {
                        try {
                            if (!currentUser || currentUser.isGuest) return;

                            const name = (DOMElements.profileName?.value || '').trim();
                            const contactRaw = (DOMElements.profileContact?.value || '').trim();
                            const contactDigits = contactRaw.replace(/\D/g, "");

                            if (!name) { showToast('이름을 입력해주세요.', 'error'); DOMElements.profileName?.focus(); return; }
                            if (contactDigits && (contactDigits.length < 9 || contactDigits.length > 11)) { showToast('연락처 형식이 올바르지 않습니다.', 'error'); DOMElements.profileContact?.focus(); return; }

                            DOMElements.profileSaveBtn.disabled = true;
                            DOMElements.profileSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin "></i>저장 중...';

                            const updates = { name, contact: contactDigits || '', updatedAt: serverTimestamp() };
                            await updateDoc(doc(db, "users", currentUser.uid), updates);
                            try { await updateProfile(auth.currentUser, { displayName: name }); } catch (e) {}
                            currentUser.name = name;
                            currentUser.contact = contactDigits || '';

                            const displayName = currentUser.name || '고객';
                            if (DOMElements.welcomeMessage) DOMElements.welcomeMessage.textContent = `${displayName}님의 주문 현황`;
                            showToast('내 정보가 저장되었습니다.', 'success');
                        } catch (e) { console.error(e); showToast('저장 중 오류가 발생했습니다.', 'error'); } finally {
                            if (DOMElements.profileSaveBtn) { DOMElements.profileSaveBtn.disabled = false; DOMElements.profileSaveBtn.innerHTML = '<i class="fas fa-save "></i>저장하기'; }
                        }
                    });
                }
            }

            // 6. 리스트 클릭 이벤트 처리 (테이블 뷰 & 모바일 카드 뷰 공통 로직)
            const handleQuoteAction = (e) => {
                const quoteId = e.target.closest('.more-actions-menu')?.dataset.id
                    || e.target.closest('.more-actions-btn')?.dataset.id
                    || e.target.closest('[data-id]')?.dataset.id;
                if (!quoteId) return;
                const quote = myQuotesCache.find(q => q.id === quoteId);
                if (!quote) return;


// 더보기(드롭다운) 토글
if (e.target.closest('.more-actions-btn')) {
  const btn = e.target.closest('.more-actions-btn');
  const wrap = btn.closest('.more-actions-wrap');
  const menu = wrap?.querySelector('.more-actions-menu');
  if (!menu) return;

  // 다른 메뉴 닫기(포탈 포함)
  document.querySelectorAll('.more-actions-menu').forEach(m => {
    if (m !== menu) closeMoreMenu(m);
  });

  // 토글
  if (menu.classList.contains('hidden')) openMoreMenu(btn, menu);
  else closeMoreMenu(menu);

  return;
}

// 메뉴 내부 버튼 클릭 시(액션 수행 후) 메뉴 닫기 처리를 위해 플래그
const clickedInsideMoreMenu = !!e.target.closest('.more-actions-menu');

                // 상세 보기
                if (e.target.closest('.view-details-btn')) showDetailsModal(quote);
                
                // 견적서 보기
                if (e.target.closest('.view-quote-btn')) { 
                    DOMElements.printableTitle.textContent = '견적서 보기'; 
                    currentDocQuote = quote; currentDocType = '견적서';
                    const t = document.getElementById('docDetailsToggle');
                    if (t) t.checked = getDocShowDetails();
                    renderDocIfOpen();
                    DOMElements.quoteModal.classList.remove('hidden'); 
                    renderDocIfOpen();
                }
                
                // 거래명세서 보기
                if (e.target.closest('.view-statement-btn')) { 
                    DOMElements.printableTitle.textContent = '거래명세서 보기'; 
                    currentDocQuote = quote; currentDocType = '거래명세서';
                    const t = document.getElementById('docDetailsToggle');
                    if (t) t.checked = getDocShowDetails();
                    renderDocIfOpen();
                    DOMElements.quoteModal.classList.remove('hidden'); 
                    renderDocIfOpen();
                }
                
                // 견적 수정/재신청
                const reloadBtnEl = e.target.closest('.reload-quote-btn');
                if (reloadBtnEl) {
                    if (reloadBtnEl.dataset.locked === '1') { showToast(reloadBtnEl.title || '현재 상태에서는 수정할 수 없습니다.', 'error'); return; }
                    try {
                        if (quote.productType === 'book') {
                            localStorage.setItem('quoteToReload', JSON.stringify({
                                mode: 'edit',
                                quoteId: quote.id,
                                productType: 'book',
                                formData: quote.formData,
                                isGuest: (quote.isGuest === true || !!quote.guestLookupKey),
                                guestName: quote.guestName || null,
                                guestContact: quote.guestContact || null,
                                guestContactRaw: quote.guestContactRaw || null,
                                guestLookupKey: quote.guestLookupKey || null
                            }));
                            window.location.href = 'quote-book.html?edit=1';
                        } else {
                            localStorage.setItem('quoteToReload', JSON.stringify({
                                mode: 'edit',
                                quoteId: quote.id,
                                productType: 'print',
                                orderName: (quote.orderName || quote.title || ''),
                                spec: (quote.spec || null),
                                productSubType: quote.productSubType || '',
                                title: quote.title || quote.orderName || '',
                                size: quote.size || '',
                                quantity: quote.quantity || '',
                                options: quote.options || null,
                                isGuest: (quote.isGuest === true || !!quote.guestLookupKey),
                                guestName: quote.guestName || null,
                                guestContact: quote.guestContact || null,
                                guestContactRaw: quote.guestContactRaw || null,
                                guestLookupKey: quote.guestLookupKey || null
                            }));
                            window.location.href = `quote-print.html?edit=1&id=${encodeURIComponent(quote.id)}`;
                        }
                    } catch (err) {
                        console.warn('reload-quote-btn fallback', err);
                        localStorage.setItem('quoteToReload', quote.formData || quote.items || '');
                        window.location.href = quote.productType === 'book' ? 'quote-book.html' : 'quote-print.html';
                    }
                }
                
                // 주문 취소 요청
                if (e.target.closest('.request-cancel-btn')) { requestCancelOrder(quote); }
                
                // 세금계산서 신청
                if (e.target.closest('.request-tax-invoice-btn')) { DOMElements.taxInvoiceModal.classList.remove('hidden'); DOMElements.taxInvoiceForm.dataset.id = quoteId; }

                // 더보기 메뉴에서 실행한 경우 메뉴 닫기
                if (clickedInsideMoreMenu) {
                    document.querySelectorAll('.more-actions-menu').forEach(m => closeMoreMenu(m));
                }
            };

            // 리스트 이벤트 리스너 등록 (데스크탑 테이블 & 모바일 카드)
            DOMElements.quoteListBody.addEventListener('click', handleQuoteAction);
            if (DOMElements.quoteCardsWrap) {
                DOMElements.quoteCardsWrap.addEventListener('click', handleQuoteAction);
            }

            

            // ✅ 포탈(Body로 이동된) 더보기 메뉴 안 버튼 클릭도 처리
            document.addEventListener('click', (ev) => {
                if (!ev.target.closest('.more-actions-menu')) return;
                handleQuoteAction(ev);
            }, true);
// 더보기 메뉴: 바깥 클릭 시 닫기
            document.addEventListener('click', (ev) => {
                if (!ev.target.closest('.more-actions-wrap')) {
                    document.querySelectorAll('.more-actions-menu').forEach(m => closeMoreMenu(m));
                }
            });

// ===== 더보기 메뉴(드롭다운) 포탈(Body로 띄우기) 처리 =====
let __activeMoreMenu = null;

function openMoreMenu(btn, menu) {
  // 원래 자리 기억
  if (!menu.__origin) {
    menu.__origin = { parent: menu.parentNode, next: menu.nextSibling };
  }

  // 일단 보이게 해서 크기 계산
  menu.classList.remove('hidden');

  // body로 옮겨서 fixed로 띄우기(부모 overflow 영향 제거)
  document.body.appendChild(menu);
  menu.style.position = 'fixed';
  menu.style.zIndex = '99999';

  const btnRect = btn.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  // 기본은 버튼 아래로
  let top = btnRect.bottom + 8;

  // 아래가 화면 밖이면 위로 펼치기
  if (top + menuRect.height > window.innerHeight - 8) {
    top = Math.max(8, btnRect.top - 8 - menuRect.height);
  }

  // 오른쪽 정렬 느낌 유지(버튼 우측 기준)
  let left = btnRect.right - menuRect.width;
  left = Math.min(left, window.innerWidth - 8 - menuRect.width);
  left = Math.max(8, left);

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  __activeMoreMenu = menu;
}

function closeMoreMenu(menu) {
  if (!menu) return;

  menu.classList.add('hidden');
  menu.style.position = '';
  menu.style.zIndex = '';
  menu.style.top = '';
  menu.style.left = '';

  // 원래 자리로 복귀(리렌더/DOM변경으로 insertBefore가 실패할 수 있어 안전하게 복구)
  const origin = menu.__origin;
  if (origin?.parent) {
    try {
      if (origin.next && origin.next.parentNode === origin.parent) origin.parent.insertBefore(menu, origin.next);
      else origin.parent.appendChild(menu);
    } catch (_) {
      try { origin.parent.appendChild(menu); } catch (__) {}
    }
  }
if (__activeMoreMenu === menu) __activeMoreMenu = null;
}

            // 7. 모달 및 기타 UI 이벤트
            DOMElements.closeModalBtn.addEventListener('click', () => { 
                DOMElements.detailsModal.classList.add('hidden'); 
                if (unsubscribeMessages) unsubscribeMessages(); 
                currentQuoteId = null; 
                resetUploadUI(); 
            });
            DOMElements.closeQuoteModalBtn.addEventListener('click', () => { DOMElements.quoteModal.classList.add('hidden'); currentDocQuote = null; currentDocType = null; });
            DOMElements.closeTaxInvoiceModalBtn.addEventListener('click', () => DOMElements.taxInvoiceModal.classList.add('hidden'));
            
            // 인쇄 버튼
            DOMElements.printQuoteBtn.addEventListener('click', () => { 
                const w = window.open('', '_blank');
                const printCSS = `
                  <style>
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { margin: 0; padding: 0; background: #fff; }
                    @page {
                      size: A4 portrait;
                      margin: 12mm 10mm 12mm 10mm;
                    }
                    @media print {
                      html, body { width: 210mm; height: 297mm; overflow: hidden; }
                      #printable-quote { width: 100%; max-width: 100%; }
                      #printable-quote > div { max-width: 100% !important; padding: 0 !important; }
                    }
                  </style>
                `;
                w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8">' + printCSS + '</head><body>');
                w.document.write(DOMElements.quoteBreakdownContent.innerHTML);
                w.document.write('</body></html>');
                w.document.close();
                w.onload = () => { w.focus(); w.print(); };
            });

            // 문서 세부내역 표시 토글
            const docDetailsToggle = document.getElementById('docDetailsToggle');
            if (docDetailsToggle) {
                docDetailsToggle.checked = getDocShowDetails();
                docDetailsToggle.addEventListener('change', () => {
                    setDocShowDetails(docDetailsToggle.checked);
                    renderDocIfOpen();
                });
            }


            // 채팅 전송
            DOMElements.chatForm.addEventListener('submit', handleChatSubmit);
            
            // 파일 첨부
            DOMElements.attachFileBtn.addEventListener('click', () => DOMElements.fileInput.click());
            DOMElements.fileInput.addEventListener('change', handleFileSelection);

            // 탭 전환 (이전 호환성 유지, 실제로는 panel 토글로 대체)
            if (DOMElements.modalTabs) {
                DOMElements.modalTabs.addEventListener('click', (e) => {
                    const targetTab = e.target.closest('.tab-btn');
                    if(!targetTab) return;
                    DOMElements.modalTabs.querySelector('.tab-btn.active')?.classList.remove('active');
                    targetTab.classList.add('active');
                    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                    const tabEl = document.getElementById(targetTab.dataset.tab + '-tab');
                    if (tabEl) tabEl.classList.add('active');
                });
            }

            // 파일 패널 토글
            document.getElementById('toggle-files-panel-btn')?.addEventListener('click', () => {
                const panel = document.getElementById('files-panel');
                const proofPanel = document.getElementById('proof-panel');
                if (panel) {
                    if (proofPanel && !panel.classList.contains('hidden')) { /* already open */ }
                    if (proofPanel) proofPanel.classList.add('hidden');
                    panel.classList.toggle('hidden');
                }
            });

            // 시안 패널 토글
            document.getElementById('toggle-proof-panel-btn')?.addEventListener('click', () => {
                const panel = document.getElementById('proof-panel');
                const filesPanel = document.getElementById('files-panel');
                if (panel) {
                    if (filesPanel) filesPanel.classList.add('hidden');
                    panel.classList.toggle('hidden');
                }
            });

            // 시안 확인 리스트 (승인/거절/미리보기)
            DOMElements.proofList.addEventListener('click', async e => {
                const approveBtn = e.target.closest('.approve-proof-btn');
                const rejectBtn = e.target.closest('.reject-proof-btn');
                const previewBtn = e.target.closest('.preview-image-btn');
                
                if (approveBtn && await showConfirmation('시안 승인', '인쇄를 진행하시겠습니까?')) { 
                    await updateDoc(doc(db, `quotes/${currentQuoteId}/messages`, approveBtn.dataset.msgId), { proofStatus: 'approved' }); 
                    showToast('승인되었습니다.', 'success'); 
                }
                if (rejectBtn) { 
                    const reason = prompt('수정 요청 사유'); 
                    if(reason) { 
                        await updateDoc(doc(db, `quotes/${currentQuoteId}/messages`, rejectBtn.dataset.msgId), { proofStatus: 'rejected', rejectionReason: reason }); 
                        showToast('요청되었습니다.', 'success'); 
                    } 
                }
                if (previewBtn) { 
                    DOMElements.previewImage.src = previewBtn.dataset.url; 
                    DOMElements.imagePreviewModal.classList.remove('hidden'); 
                }
            });

            // 이미지 미리보기 닫기
            DOMElements.closePreviewModalBtn.addEventListener('click', () => DOMElements.imagePreviewModal.classList.add('hidden'));

            // 파일 삭제
            DOMElements.fileList.addEventListener('click', (e) => { 
                const btn = e.target.closest('.delete-file-btn'); 
                if (btn) deleteFile(btn.dataset.msgId, btn.dataset.filePath); 
            });

            // 세금계산서 폼 제출
            DOMElements.taxInvoiceForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    await updateDoc(doc(db, "quotes", e.target.dataset.id), { 
                        taxInvoiceInfo: { 
                            bizNum: document.getElementById('tax-bizNum').value, 
                            companyName: document.getElementById('tax-companyName').value, 
                            ceoName: document.getElementById('tax-ceoName').value, 
                            address: document.getElementById('tax-address').value, 
                            email: document.getElementById('tax-email').value, 
                            requestedAt: Timestamp.now() 
                        } 
                    });
                    showToast('제출되었습니다.', 'success'); 
                    DOMElements.taxInvoiceModal.classList.add('hidden');
                } catch (err) { showToast('오류 발생', 'error'); }
            });

            // 비밀번호 재설정 및 회원 탈퇴
            if (DOMElements.passwordResetBtn) DOMElements.passwordResetBtn.addEventListener('click', handlePasswordReset);
            if (DOMElements.deleteAccountBtn) DOMElements.deleteAccountBtn.addEventListener('click', handleDeleteAccount);
        }

       
        // ---------------------------------------------------------
        // 비회원 조회로 생성/조회한 견적을 회원 계정으로 자동 '가져오기(Claim)'
        // - local/sessionStorage 에 guestLookupKey + guestPwLast4 가 남아있으면
        //   해당 비회원 견적을 회원 uid로 소유권 전환(isGuest=false, userId=uid)
        // ---------------------------------------------------------
        async function tryClaimGuestQuotesForMember(memberUid) {
            try {
                const guestKey = (sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKey') || '').trim();
                const pwLast4  = (sessionStorage.getItem('guestPwLast4')  || localStorage.getItem('guestPwLast4')  || '').trim();
                if (!guestKey || !pwLast4) return;

                // 중복 실행 방지
                const flagKey = `guestClaimed_${guestKey}_${memberUid}`;
                if (sessionStorage.getItem(flagKey) === '1') return;

                // 비회원 견적 찾기: 3-field equality 쿼리 (Firestore 정적 분석 통과)
                const q = query(
                    collection(db, "quotes"),
                    where("isGuest", "==", true),
                    where("userId", "==", "guest"),
                    where("guestLookupKey", "==", guestKey)
                );
                const snap = await getDocs(q);
                if (snap.empty) {
                    sessionStorage.setItem(flagKey, '1');
                    return;
                }

                let claimedCount = 0;
                for (const d of snap.docs) {
                    const data = d.data() || {};
                    // 이미 회원 소유로 바뀌었으면 스킵
                    if (data.isGuest === false && data.userId === memberUid) continue;

                    // 규칙에서 요구하는 불변 필드들을 그대로 유지한 채 소유권만 전환
                    const payload = { ...data };
                    payload.isGuest = false;
                    payload.userId = memberUid;
                    payload.claimedAt = serverTimestamp();
                    payload.claimedFrom = "guest";
                    await updateDoc(doc(db, "quotes", d.id), payload);
                    claimedCount++;
                }

                sessionStorage.setItem(flagKey, '1');

                if (claimedCount > 0) {
                    try { showToast(`비회원 견적 ${claimedCount}건을 회원 계정으로 가져왔습니다.`, 'success'); } catch(e) {}
                }
            } catch (e) {
                console.warn('tryClaimGuestQuotesForMember failed:', e);
            }
        }


        // ── 페이지 초기화 ─────────────────────────────────────────
        // Firebase Auth 상태 확인 → 비회원/회원 분기 → 데이터 로드
        async function initializePage(user) {
            try {
                if (!user.isGuest) {
                    const userDocRef = doc(db, "users", user.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    if (userDocSnap.exists()) {
                        currentUser = { uid: user.uid, email: user.email || '', ...userDocSnap.data() };
                        const _digits = getUserContactValue(currentUser);
                        if (_digits) currentUser.contact = _digits;
                    } else {
                        const safeEmail = user.email || '';
                        const safeName = safeEmail ? safeEmail.split('@')[0] : '방문자';
                        currentUser = { uid: user.uid, email: safeEmail, name: safeName };
                    }
                } else {
                    currentUser = user; 
                    if (!currentUser.guestLookupKey) { currentUser.guestLookupKey = sessionStorage.getItem('guestLookupKey'); }
                    if (!currentUser.guestLookupKeyLegacy) { currentUser.guestLookupKeyLegacy = sessionStorage.getItem('guestLookupKeyLegacy'); }
                    
                    if (!currentUser.guestLookupKey && !currentUser.guestLookupKeyLegacy) {
                        alert('비회원 인증 정보가 만료되었습니다. 다시 조회해 주세요.');
                        location.href = 'index.html';
                        return;
                    }
                }

                if (!currentUser.isGuest) { await tryClaimGuestQuotesForMember(currentUser.uid); }
                
                await loadCompanyInfo(); 
                
                const displayName = currentUser.name || '고객';
                if(DOMElements.welcomeMessage) DOMElements.welcomeMessage.textContent = `${displayName}님의 주문 현황`;
                if(DOMElements.welcomeDetailMsg) DOMElements.welcomeDetailMsg.textContent = `${(currentUser.name||'고객')}님 조회/접수현황`;
                
                DOMElements.userTypeBadge.textContent = '';
                DOMElements.userTypeBadge.className = 'hidden';
                // account-section removed from UI; guard against null
                const accountSectionEl = document.getElementById('account-section');
                if (currentUser.isGuest) {
                    if (accountSectionEl) accountSectionEl.classList.add('hidden');
                } else {
                    if (accountSectionEl) accountSectionEl.classList.remove('hidden');
                    fillProfileFormFromCurrentUser();
                }

                DOMElements.loadingOverlay.classList.add('hidden');
                DOMElements.mainContent.classList.remove('hidden');

                // 헤더 상태 업데이트 호출
                renderUserMenu();

                listenToMyQuotes();
                setupEventListeners();

            } catch (error) {
                console.error("초기화 실패:", error);
                alert("정보를 불러오는 중 오류가 발생했습니다.");
                DOMElements.loadingOverlay.classList.add('hidden');
                DOMElements.mainContent.classList.remove('hidden');
            }
        }
        
        function fillProfileFormFromCurrentUser() {
            if (!currentUser || currentUser.isGuest) return;
            if (DOMElements.profileEmail) DOMElements.profileEmail.value = currentUser.email || auth.currentUser?.email || '';
            if (DOMElements.profileName) DOMElements.profileName.value = currentUser.name || auth.currentUser?.displayName || '';
            if (DOMElements.profileContact) {
                const digits = getUserContactValue(currentUser) || '';
                DOMElements.profileContact.value = digits ? formatPhoneHyphen(digits) : '';
            }
        }

        // --- Header User Menu Logic ---
        const userMenuBtn = document.getElementById('user-menu-btn');
        const userMenuModal = document.getElementById('userMenuModal');
        const closeUserMenuBtn = document.getElementById('closeUserMenuBtn');
        const userMenuStatus = document.getElementById('userMenuStatus');
        const userMenuGoMyPageBtn = document.getElementById('userMenuGoMyPageBtn');
        const userMenuGoLoginBtn = document.getElementById('userMenuGoLoginBtn');
        const userMenuLogoutBtn = document.getElementById('userMenuLogoutBtn');

       // [수정] 헤더 아이콘 및 모바일 메뉴 버튼 상태 동기화
        function renderUserMenu() {
            const authActionBtn = document.getElementById('auth-action-btn'); 
            const headerUserMenuBtn = document.getElementById('user-menu-btn');
            const welcomeMsg = document.getElementById('welcome-message');
            const mobileAuthBtn = document.getElementById('mobile-auth-btn'); // 모바일 로그인/로그아웃 버튼

            // 모바일 버튼 스타일 변경 헬퍼 함수
            const setMobileBtnState = (isLoginState) => {
                if (!mobileAuthBtn) return;
                if (isLoginState) {
                    // 로그아웃 상태로 변경 (회색 버튼)
                    mobileAuthBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 로그아웃';
                    mobileAuthBtn.classList.remove('bg-brand-600', 'hover:bg-brand-700', 'text-white');
                    mobileAuthBtn.classList.add('bg-slate-200', 'hover:bg-slate-300', 'text-slate-700');
                } else {
                    // 로그인 상태로 변경 (초록색 버튼)
                    mobileAuthBtn.innerHTML = '로그인';
                    mobileAuthBtn.classList.add('bg-brand-600', 'hover:bg-brand-700', 'text-white');
                    mobileAuthBtn.classList.remove('bg-slate-200', 'hover:bg-slate-300', 'text-slate-700');
                }
            };

            if (!userMenuStatus) return;

            // 1. 회원 로그인 상태
            if (currentUser && !currentUser.isGuest && !currentUser.isAnonymous) {
                userMenuStatus.textContent = `${currentUser.name || currentUser.email || '회원'}님으로 이용 중입니다.`;
                
                userMenuGoMyPageBtn?.classList.remove('hidden');
                userMenuLogoutBtn?.classList.remove('hidden');
                userMenuGoLoginBtn?.classList.add('hidden');

                // 헤더 UI 업데이트
                authActionBtn?.classList.add('hidden');
                headerUserMenuBtn?.classList.remove('hidden');
                welcomeMsg?.classList.remove('hidden');
                
                // [추가] 모바일 버튼 -> 로그아웃
                setMobileBtnState(true);
                return;
            }

            // 2. 비회원/미로그인 상태
            const guestName = (currentUser && (currentUser.name || currentUser.email)) || sessionStorage.getItem('guestName') || '비회원';
            userMenuStatus.textContent = `${guestName}님(비회원)으로 이용 중입니다.`;
            
            userMenuGoMyPageBtn?.classList.add('hidden');
            userMenuLogoutBtn?.classList.remove('hidden'); 
            userMenuGoLoginBtn?.classList.remove('hidden');

            // 헤더 UI 업데이트
            if (currentUser && currentUser.isGuest) {
                 // 비회원 조회 중
                 authActionBtn?.classList.add('hidden'); 
                 headerUserMenuBtn?.classList.remove('hidden');
                 // [추가] 모바일 버튼 -> 로그아웃
                 setMobileBtnState(true);
            } else {
                 // 완전 비로그인
                 authActionBtn?.classList.remove('hidden');
                 headerUserMenuBtn?.classList.add('hidden'); 
                 welcomeMsg?.classList.add('hidden');
                 // [추가] 모바일 버튼 -> 로그인
                 setMobileBtnState(false);
            }
        }

        function openUserMenu() { renderUserMenu(); userMenuModal?.classList.remove('hidden'); userMenuModal?.classList.add('flex'); }
        function closeUserMenu() { userMenuModal?.classList.add('hidden'); userMenuModal?.classList.remove('flex'); }

        userMenuBtn?.addEventListener('click', openUserMenu);
        closeUserMenuBtn?.addEventListener('click', closeUserMenu);
        userMenuModal?.addEventListener('click', (e) => { if (e.target === userMenuModal) closeUserMenu(); });
        userMenuGoMyPageBtn?.addEventListener('click', () => { const _k = localStorage.getItem('guestLookupKey') || sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKeyLegacy') || ''; location.href = _k ? 'mypage.html?guest=1' : 'mypage.html'; });
        userMenuGoLoginBtn?.addEventListener('click', () => { location.href = 'index.html'; });
        userMenuLogoutBtn?.addEventListener('click', async () => {
	            await window.hardLogout('index.html');
        });

	    onAuthStateChanged(auth, (user) => { try { window.__currentFirebaseUser = user; } catch(e) {}
            try { window.__currentUser = user || null; } catch(e) {}
            try { window.currentUser = user || null; } catch(e) {}

	        if (user && !user.isAnonymous) {
	            redirectIfAdmin(user);
	        }
            const params = new URLSearchParams(location.search);
            const guestFlag = params.get('guest') === '1';

            // ✅ sessionStorage ↔ localStorage 동기화 (탭 전환, 리로드 대응)
            // guestLookupKey + Legacy 모두 동기화
            const _ssKey  = sessionStorage.getItem('guestLookupKey');
            const _lsKey  = localStorage.getItem('guestLookupKey');
            const _ssLKey = sessionStorage.getItem('guestLookupKeyLegacy');
            const _lsLKey = localStorage.getItem('guestLookupKeyLegacy');

            if (!_ssKey && _lsKey) {
                sessionStorage.setItem('guestLookupKey', _lsKey);
                sessionStorage.setItem('guestName', localStorage.getItem('guestName') || '');
                sessionStorage.setItem('guestContact', localStorage.getItem('guestContact') || '');
                sessionStorage.setItem('guestPwLast4', localStorage.getItem('guestPwLast4') || '');
                sessionStorage.setItem('guestContactRaw', localStorage.getItem('guestContactRaw') || '');
            }
            if (!_ssLKey && _lsLKey) {
                sessionStorage.setItem('guestLookupKeyLegacy', _lsLKey);
            }

            // ✅ 어떤 스토리지에서든 유효한 키(비어있지 않은 문자열)를 찾아 사용
            const k  = (sessionStorage.getItem('guestLookupKey')  || _lsKey  || '').trim();
            const kl = (sessionStorage.getItem('guestLookupKeyLegacy') || _lsLKey || '').trim();
            const hasGuestSession = !!(k || kl);

            // ✅ 유효 키를 sessionStorage에 확실히 반영
            if (k && !sessionStorage.getItem('guestLookupKey')) {
                try { sessionStorage.setItem('guestLookupKey', k); } catch(e) {}
            }

            if (hasGuestSession && (guestFlag || (user && user.isAnonymous) || !user)) {
                (async () => {
                    let u = user;
                    if (!u) {
                        try {
                            try{ await setPersistence(auth, browserLocalPersistence); }catch(e1){
                            try{ await setPersistence(auth, browserSessionPersistence); }catch(e2){ console.warn('[mypage] setPersistence failed:', e1, e2); }
                        }
                            const cred = await signInAnonymously(auth);
                            u = cred.user;
                        } catch (e) {
                            console.warn('Anonymous sign-in failed:', e);
                            // ✅ 중요: Firestore Rules가 signedIn()을 요구하므로 익명로그인이 실패하면 비회원 조회가 불가능합니다.
                            try {
                                showToast(`비회원 조회를 위해 "Firebase 익명 로그인(Anonymous)"이 필요합니다.
Firebase 콘솔 → Authentication → Sign-in method에서 Anonymous를 활성화해주세요.`, 'error');
                            } catch(_) {}
                        }

                    }
                    if (!u) {
                        // 익명 로그인 실패 -> Firestore Rules(signedIn) 때문에 비회원 조회가 불가능합니다.
                        try {
                            DOMElements.tableLoadingIndicator && DOMElements.tableLoadingIndicator.classList.add('hidden');
                            DOMElements.quoteListBody && (DOMElements.quoteListBody.innerHTML = `
                                <tr>
                                  <td colspan="6" class="text-center py-12 text-slate-400 bg-slate-50/50">
                                    <div class="flex flex-col items-center gap-3">
                                      <i class="fas fa-lock text-3xl opacity-20"></i>
                                      <div class="font-bold text-slate-500">비회원 조회 권한이 없습니다</div>
                                      <div class="text-xs text-slate-400 leading-relaxed">
                                        Firebase 익명 로그인(Anonymous)이 비활성화되어 있어요.<br/>
                                        Firebase 콘솔 → Authentication → Sign-in method에서 Anonymous를 활성화한 뒤 다시 접속해주세요.
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                            `);
                        } catch(_) {}
                        return;
                    }
                    initializePage({
                        uid: (u && u.uid) ? u.uid : ('guest_' + Date.now()),
                        isGuest: true,
                        isAnonymous: true,
                        name: sessionStorage.getItem('guestName') || '비회원',
                        guestLookupKey: k,
                        guestLookupKeyLegacy: kl,
                        guestContact: (sessionStorage.getItem('guestContact') || '').replace(/[^0-9]/g, ''),
                        guestPwLast4: (sessionStorage.getItem('guestPwLast4') || '').trim()

                    });
                })();
                return;
            }

            if (user) {
                // 익명 로그인인데 비회원 세션(guestLookupKey)이 없으면 → 조회 페이지로 안내
                if (user.isAnonymous) {
                    // ✅ 익명 유저 + 비회원 세션 없음 → 주문조회 페이지로 안내
                    // postLoginRedirect 저장: 관리자 이메일 로그인 후 mypage로 복귀하도록
                    try { localStorage.setItem('postLoginRedirect', 'mypage.html'); } catch(e) {}
                    location.href = 'index.html';
                    return;
                }
                initializePage(user);
            } else {
                // ✅ 비로그인 상태 → 주문조회 페이지로 안내
                // postLoginRedirect 저장: 이메일 로그인 후 mypage로 복귀하도록
                try { localStorage.setItem('postLoginRedirect', 'mypage.html'); } catch(e) {}
                location.href = 'index.html';
            }
        });

	    window.showDetailsModal = showDetailsModal;
	    window.closeDetailsModal = closeDetailsModal;

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