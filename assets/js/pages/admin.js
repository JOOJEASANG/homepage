// ============================================================
// admin.js — 관리자 페이지 전체 로직
//
// 주요 기능:
//   - Firebase Auth 로그인 상태 확인 (role=admin 만 진입 허용)
//   - 접수 목록 실시간 조회 (Firestore onSnapshot)
//   - 견적 상세 열람 / 상태 변경 / 수정 / 삭제
//   - 고객 1:1 채팅 메시지 실시간 수신·발송
//   - 파일 업로드 / 다운로드 처리
//   - 알림음 + 브라우저 데스크탑 알림 + 탭 제목 깜빡임
//   - 공지사항 CRUD / 포트폴리오 관리 / 홈페이지 콘텐츠 관리
// ============================================================

import { app, auth, db, storage, onAuthStateChanged, signOut,
         setPersistence, browserLocalPersistence,
         collection, onSnapshot, query, orderBy,
         doc, updateDoc, addDoc, serverTimestamp, deleteDoc,
         getDoc, setDoc, getDocs, writeBatch, deleteField,
         limit, where, ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from "../firebase.js";
import { initHeader } from "../header.js";
import "../session.js";

// 페이지 로드 시 헤더 렌더링 (관리자 페이지는 활성 메뉴 없음)
document.addEventListener("DOMContentLoaded", () => initHeader(""));

// ── 운영 로그 제어 ────────────────────────────────────────────
// DEBUG = false 이면 콘솔 출력 없음 (운영 시 로그 노출 방지)
    const DEBUG = false;
    // Ensure logger exists (global + local alias)
    const logger = (window.logger) ? window.logger : {
        log: (...args) => { if (DEBUG) console.log("[admin]", ...args); },
        warn: (...args) => { if (DEBUG) console.warn("[admin]", ...args); },
        error: (...args) => { if (DEBUG) console.error("[admin]", ...args); }
    };
    // 전역 오류(예상치 못한 런타임 오류) 방어: 사용자에게는 간단히 안내하고, 콘솔은 DEBUG일 때만 출력
    window.addEventListener('error', (event) => {
        logger.error('[GlobalError]', event?.message, event?.error);
        try { if (typeof showToast === 'function') showToast('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'error'); } catch (_) {}
    });

    window.addEventListener('unhandledrejection', (event) => {
        logger.error('[UnhandledRejection]', event?.reason);
        try { if (typeof showToast === 'function') showToast('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'error'); } catch (_) {}
    });
        
        
        
        

        // Firebase 설정
        // =========================
        // [공통 브릿지] common.js가 접근할 수 있도록 Firebase Auth를 window로 노출
        // =========================
        try {
            window.auth = auth;
            window.onAuthStateChanged = onAuthStateChanged;
            window.signOut = signOut;
            if (typeof signInAnonymously !== 'undefined') window.signInAnonymously = signInAnonymously;
            window.__AUTH_READY = false;
            window.__currentUser = auth.currentUser || null;
            window.__currentFirebaseUser = auth.currentUser || null;
            onAuthStateChanged(auth, (u) => {
                window.__currentUser = u || null;
                window.__currentFirebaseUser = u || null;
                window.__AUTH_READY = true;
            });
      } catch (e) {
            logger.warn('[bridge] window expose failed:', e);
        }
await setPersistence(auth, browserLocalPersistence);
// 변수 초기화
        let quotesCache = [];
        let currentPage = 1;
        const itemsPerPage = 20;
        let inquiriesCache = [];
        let usersCache = {};
	        // [추천기능] 새 접수 알림/NEW 배지용 상태값
	        // - 최초 onSnapshot 로드에서는 알림을 울리지 않기 위해 플래그 사용
	        // - NEW 배지는 해당 문서 id를 Set으로 관리
	        let isInitialQuotesSnapshot = true;
	        let isInitialInquiriesSnapshot = true;
	        const newQuoteIds = new Set();

        // =========================
        // [추천기능] 새 접수 알림/NEW 배지 유틸
        // =========================

        // 🔔 브라우저 알림 권한(최초 1회) 확보
        async function ensureNotificationPermission() {
            try {
                if (!("Notification" in window)) return false;
                if (Notification.permission === "granted") return true;

                // 사용자가 '차단'한 경우
                if (Notification.permission === "denied") return false;

                const permission = await Notification.requestPermission();
                return permission === "granted";
            } catch (e) {
                logger.warn("ensureNotificationPermission error:", e);
                return false;
            }
        }

        // 🟩 NEW 배지 해제(상세 열람 시)
        function markNewSeen(quoteId) {
            try {
                if (!quoteId) return;
                if (newQuoteIds.has(quoteId)) {
                    newQuoteIds.delete(quoteId);
                    // 리스트만 갱신(필터/정렬 반영)
                    renderQuotes();
                }
            } catch (e) { logger.warn("markNewSeen error:", e); }
        }

        // ✨ 탭 제목 깜빡임
        let __titleBlinkTimer = null;
        let __titleBlinkBaseTitle = document.title || "관리자";
        function startTitleBlink(message) {
            try {
                stopTitleBlink();
                __titleBlinkBaseTitle = document.title || __titleBlinkBaseTitle;
                const a = (message && String(message).trim()) ? String(message).trim() : "새 접수!";
                let toggle = false;
                let ticks = 0;

                __titleBlinkTimer = setInterval(() => {
                    toggle = !toggle;
                    document.title = toggle ? a : __titleBlinkBaseTitle;
                    ticks += 1;
                    // 약 12초 후 자동 종료(0.6s * 20)
                    if (ticks >= 20) stopTitleBlink();
                }, 600);
            } catch (e) { logger.warn("startTitleBlink error:", e); }
        }
        function stopTitleBlink() {
            if (__titleBlinkTimer) {
                clearInterval(__titleBlinkTimer);
                __titleBlinkTimer = null;
            }
            document.title = __titleBlinkBaseTitle || document.title;
        }
        window.addEventListener("focus", stopTitleBlink);
        
        // ── 알림음 재생 시스템 ─────────────────────────────────────
        // 브라우저 자동재생 차단(Autoplay Policy) 대응:
        //   - 첫 클릭 발생 시 unlockSoundsOnce() 로 오디오 잠금 해제
        //   - 쿨다운(cooldown) 으로 같은 소리가 연속 재생되는 것 방지
        //   - window.__notifsEnabled 로 소리 ON/OFF 전역 제어
        window.__notifsEnabled = true
        let __notifsEnabled = window.__notifsEnabled; // 알림(소리) on/off
        try{ const v = localStorage.getItem('adminNotifsEnabled'); if(v !== null) __notifsEnabled = (v === '1'); }catch(e){}
        let __soundsUnlocked = false;
        const __soundCooldown = new Map(); // key -> lastTime(ms)
        function safePlay(audioEl, key, cooldownMs = 1800){
            try{
                if(window.__notifsEnabled === false) return;
                if(!audioEl) return;
                const k = key || audioEl.id || 'sound';
                const now = Date.now();
                const last = __soundCooldown.get(k) || 0;
                if (now - last < cooldownMs) return;
                __soundCooldown.set(k, now);
                try { audioEl.currentTime = 0; } catch(e) {}
                audioEl.play().catch(e => logger.log("Sound error:", e));
            }catch(e){ logger.log("safePlay error:", e); }
        }
        
        async function getLatestCustomerMessageType(quoteId){
            try{
                const qMsg = query(collection(db, `quotes/${quoteId}/messages`), orderBy("timestamp", "desc"), limit(1));
                const snap = await getDocs(qMsg);
                if (snap.empty) return 'text';
                const msg = (snap.docs[0].data() || {});
                // 고객이 보낸 메시지만 타입 판별(관리자 메시지면 일반 텍스트 취급)
                if (msg.sender === 'admin') return 'text';
                return msg.type || 'text';
            } catch(e) {
                logger.warn("getLatestCustomerMessageType error:", e);
                return 'text';
            }
        }

        async function unlockSoundsOnce(){
            if (__soundsUnlocked) return; // 이미 언락된 경우 재시도 불필요
            let anyUnlocked = false;
            try{
                const ids = ['notification-sound','message-sound','file-sound','inquiry-sound','edit-sound'];
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
                        // 브라우저 autoplay 정책 - 무시
                    }
                }
                if (anyUnlocked) {
                    __soundsUnlocked = true;
                    try { updateNotifStatus(); } catch(e) {}
                }
            }catch(e){ logger.warn("unlockSoundsOnce error:", e); }
        }

        // 🔓 첫 사용자 클릭으로 오디오 재생 권한(autoplay unlock) 확보
        document.addEventListener('click', () => { unlockSoundsOnce(); }, { once: true, capture: true });

        
        // ── 알림 토글 버튼 UI 동기화 ────────────────────────────
        // window에 등록해 admin.html 인라인 스크립트에서도 호출 가능
        function __updateNotifUIButton(){
            const on = (window.__notifsEnabled !== false);
            const label = document.getElementById('notif-label');
            const track = document.getElementById('notif-track');
            const thumb = document.getElementById('notif-thumb');
            const icon  = document.getElementById('notif-icon');
            if(label) label.textContent = on ? '알림 끄기' : '알림 켜기';
            if(icon)  icon.textContent  = on ? '🔔' : '🔕';
            if(track) track.style.background = on ? '#22c55e' : '#374151';
            if(thumb) thumb.style.left = on ? '18px' : '2px';
        }
        // admin.html 인라인 스크립트에서 접근할 수 있도록 전역 등록
        window.__updateNotifToggleUI = __updateNotifUIButton;
        function __setNotifsEnabled(v){
            window.__notifsEnabled = !!v;
            try{ localStorage.setItem('adminNotifsEnabled', window.__notifsEnabled ? '1' : '0'); }catch(e){}
            __updateNotifUIButton();
            try{ updateNotifStatus(); }catch(e){}
        }
        // 글로벌 토글(버튼 인라인/이벤트 둘 다 사용)
        window.__toggleAdminNotifs = async function(){
            const on = (window.__notifsEnabled !== false);
            if(on){
                __setNotifsEnabled(false);
                try{ if(typeof showToast==='function') showToast('알림이 꺼졌습니다.', 'info'); }catch(e){}
                return;
            }
            // 켜는 경우: 권한 + 사운드 언락
            try{ await ensureNotificationPermission(); }catch(e){}
            try{ await unlockSoundsOnce(); }catch(e){}
            __setNotifsEnabled(true);
            try{ if(typeof showToast==='function') showToast('알림이 켜졌습니다.', 'success'); }catch(e){}
        };
        // ── 알림 상태 텍스트 갱신 ────────────────────────────────
        // 하단 고정 토글 버튼 위의 작은 상태 텍스트를 최신 상태로 업데이트
function updateNotifStatus(){
            const el = document.getElementById('notif-status');
            if(!el) return;
            const perm = (window.Notification && Notification.permission) ? Notification.permission : 'unsupported';
            const on = (window.__notifsEnabled !== false);
            const permTxt = perm === 'granted' ? '브라우저 알림 허용' : perm === 'denied' ? '브라우저 알림 차단' : '브라우저 알림 미설정';
            const soundTxt = __soundsUnlocked ? '소리 준비됨' : '소리 잠김';
            el.textContent = `${permTxt} · ${soundTxt}`;
            // 토글 UI도 동기화
            try { __updateNotifUIButton(); } catch(e) {}
        }


        // ── 새 접수 알림 트리거 ───────────────────────────────────
        // 새 견적이 들어오면 ① 소리 재생 ② 브라우저 알림 ③ 탭 제목 깜빡임을 동시에 실행
        async function fireNewIntakeAlert(count, firstQuote) {
            try {
                const n = Number(count) || 0;
                if (n <= 0) return;

                // 1) 소리
                const audioEl = document.getElementById('notification-sound');
                safePlay(audioEl, 'intake', 1500);

                // 2) 제목 깜빡임
                const titleMsg = n === 1 ? "새 접수 1건!" : `새 접수 ${n}건!`;
                startTitleBlink(titleMsg);

                // 3) 데스크탑 알림
                const granted = await ensureNotificationPermission();
                if (!granted) return;

                const orderName = firstQuote?.orderName || firstQuote?.ordererName || firstQuote?.guestName || "새 접수";
                const bodyParts = [];
                bodyParts.push(n === 1 ? "새 접수가 등록되었습니다." : `새 접수 ${n}건이 등록되었습니다.`);
                if (orderName) bodyParts.push(`(${orderName})`);

                const notif = new Notification("관리자 알림", {
                    body: bodyParts.join(" "),
                    silent: true
                });

                notif.onclick = () => {
                    try {
                        window.focus();
                        stopTitleBlink();
                    } catch (e) {}
                };
            } catch (e) {
                logger.warn("fireNewIntakeAlert error:", e);
            }
        }

        let currentQuoteId = null;
        let unsubscribeMessages = null;
        let unsubscribeFiles = null;
        let homepageContentCache = {};
        let imagePreviewsCache = {};
        let completedFileInfo = null;
        let companyInfoCache = {};

        // DOM 요소 캐싱
        const DOMElements = {
            quoteListBody: document.getElementById('quote-list-body'),
            inquiryListBody: document.getElementById('inquiry-list-body'),
            
            // Auth
            authCheckOverlay: document.getElementById('auth-check-overlay'),
            authLoading: document.getElementById('auth-loading'),
            authDenied: document.getElementById('auth-denied'),
            mainContent: document.getElementById('main-content'),

            // Modals
            detailsModal: document.getElementById('detailsModal'),
            modalTitle: document.getElementById('modal-title'),
            modalContent: document.getElementById('modalContent'),
            
            companyInfoModal: document.getElementById('companyInfoModal'),
            imageManagementModal: document.getElementById('imageManagementModal'),
            homepageManagementModal: document.getElementById('homepageManagementModal'),
            cannedResponseManagementModal: document.getElementById('cannedResponseManagementModal'),
            inquiryDetailsModal: document.getElementById('inquiry-details-modal'),
            
            // Chat
            chatMessages: document.getElementById('chat-messages'),
        };

        // --- 공통 유틸리티 ---
        function sanitizeHTML(str) {
            if (!str) return '';
            return str.replace(/[&<>"']/g, (m) => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#039;'})[m]);
        }

        function formatBytes(bytes) {
            try {
                const b = Number(bytes || 0);
                if (!Number.isFinite(b) || b <= 0) return '0B';
                const units = ['B','KB','MB','GB'];
                let v = b;
                let u = 0;
                while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
                const dp = (u === 0) ? 0 : (u === 1 ? 0 : 1);
                return `${v.toFixed(dp)}${units[u]}`;
            } catch (e) {
                return '';
            }
        }

     
// 파일 다운로드 함수
async function forceDownload(url, filename = 'download') {
    // [수정 1] URL이 없는 경우 방어 코드
    if (!url) return;

    // [수정 2] http로 시작하는 URL을 강제로 https로 변환 (보안 오류 해결 핵심)
    if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
    }

    // 1. 파일명 인코딩 (한글 깨짐 방지)
    const encodedFilename = encodeURIComponent(filename);

    // 2. 파이어베이스 URL인지 확인
    if (url.includes('firebasestorage.googleapis.com')) {
        try {
            // URL 객체 생성
            const downloadUrl = new URL(url);
            
            // "response-content-disposition" 파라미터 추가
            downloadUrl.searchParams.set(
                'response-content-disposition', 
                `attachment; filename*=UTF-8''${encodedFilename}`
            );

            // 수정된 URL로 다운로드 시도
            const a = document.createElement('a');
            a.href = downloadUrl.toString();
            a.download = filename; 
            document.body.appendChild(a); // Firefox 등 호환성 위해 추가
            a.click();
            document.body.removeChild(a);
            return; 

        } catch (e) {
            logger.warn('URL 변환 실패, 일반 다운로드 시도:', e);
        }
    }

    // 3. 파이어베이스 주소가 아니거나 실패했을 때의 비상 대책
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
    } catch (e) {
        // 최후의 수단: 새 창으로 열기 (HTTPS 강제 변환된 URL 사용)
        window.open(url, '_blank');
    }
}

// [공통 수정] 클릭 이벤트 리스너 (무조건 다운로드 + HTTPS 강제 변환)
// ── 파일 다운로드 처리 ─────────────────────────────────────────
// Firebase Storage URL 에서 파일을 강제 다운로드 (PDF도 미리보기 아닌 저장)
// HTTP → HTTPS 자동 변환 + 한글 파일명 인코딩 처리

// 다운로드 실행 함수
function triggerNativeDownload(url, filename) {
    // [보안 패치] http 주소가 들어오면 무조건 https로 변환
    if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
    }

    // [다운로드 강제] Firebase Storage URL인 경우, 강제 다운로드 파라미터 추가
    // 이 설정이 있으면 브라우저는 PDF라도 미리보기를 하지 않고 무조건 파일을 저장합니다.
    if (url.includes('firebasestorage.googleapis.com')) {
        try {
            const urlObj = new URL(url);
            // 한글 파일명 깨짐 방지 인코딩 + attachment 옵션 설정
            urlObj.searchParams.set(
                'response-content-disposition', 
                `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
            );
            url = urlObj.toString();
        } catch (e) {
            logger.warn('URL 변환 중 오류(기본 URL 사용):', e);
        }
    }

    // 가상 링크를 생성하여 클릭 (CORS 오류를 피하는 가장 확실한 방법)
    const a = document.createElement('a');
    a.href = url;
    a.download = filename; // 일반적인 경우를 위한 대비
    a.target = '_self';    // 새 탭이 아닌 현재 프레임에서 다운로드 시도
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// 2. 클릭 이벤트 리스너
// [최종 수정] 왼쪽 클릭 시 강제 다운로드 (window.open 방식)
document.addEventListener('click', async (e) => {
    // 1. 다운로드 버튼인지 확인
    const anchor = e.target.closest('a[data-force-download="1"]');
    if (!anchor) return;

    // 2. 그냥 열리는 것 방지
    e.preventDefault();
    e.stopPropagation();

    let url = anchor.href;
    
    // [파일명 정리]
    let filename = anchor.getAttribute('download') || anchor.getAttribute('data-name') || 'download';
    filename = filename.replace(/^\d+_+/, '');

    // [https 변환]
    if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
    }

    try {
        // 3. [핵심] 브라우저가 파일을 직접 가져오게 시킴 (fetch)
        // 이렇게 하면 브라우저는 파일 내용을 메모리에 담습니다.
        const response = await fetch(url, { mode: 'cors' });
        
        if (!response.ok) throw new Error('Network response was not ok');

        // 4. 파일 내용을 'Blob(덩어리)'으로 변환
        const blob = await response.blob();
        
        // 5. 메모리에 있는 파일에 가짜 주소를 붙임 (이 주소는 현재 페이지와 동일한 출처로 인식됨)
        const blobUrl = window.URL.createObjectURL(blob);

        // 6. 가짜 링크를 만들어서 강제로 클릭
        const tempLink = document.createElement('a');
        tempLink.href = blobUrl;
        tempLink.download = filename; // 이제 브라우저는 이 속성을 무시하지 않고 무조건 따릅니다.
        document.body.appendChild(tempLink);
        
        tempLink.click(); // '저장' 실행!

        // 7. 뒷정리
        document.body.removeChild(tempLink);
        window.URL.revokeObjectURL(blobUrl);

    } catch (err) {
        // 만약 위 방식(CORS 등)으로 실패하면, 최후의 수단으로 새 창 열기 시도
        logger.warn('Blob 다운로드 실패, 대체 방식 시도:', err);
        
        // Firebase URL에 강제 다운로드 파라미터 붙이기
        if (url.includes('firebasestorage.googleapis.com')) {
            const urlObj = new URL(url);
            urlObj.searchParams.set('response-content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
            url = urlObj.toString();
        }
        window.open(url, '_blank');
    }
}, { capture: true });

        // Storage 다운로드 URL(https://firebasestorage.googleapis.com/v0/b/.../o/...)에서 object 경로를 추출
        // - attachments에 path가 없는 경우에도 Storage 삭제/다운로드 강제에 활용
        function extractStoragePathFromUrl(url) {
            try {
                if (!url) return '';
                const u = new URL(url);
                // /v0/b/<bucket>/o/<encodedPath>
                const m = u.pathname.match(/\/o\/(.+)$/);
                if (!m || !m[1]) return '';
                return decodeURIComponent(m[1]);
            } catch (e) {
                return '';
            }
        }
        
       // 접수 첨부파일 삭제: quotes/{quoteId}.attachments 배열에서 제거 + (가능하면) Storage 파일 삭제
        async function deleteQuoteAttachment(quoteId, match) {
            try {
                const refQuote = doc(db, 'quotes', quoteId);
                const snap = await getDoc(refQuote);
                if (!snap.exists()) return;
                const data = snap.data() || {};
                const atts = Array.isArray(data.attachments) ? data.attachments : [];
                const next = atts.filter(a => {
                    const p = (a?.path || '');
                    const u = (a?.url || '');
                    if (match?.path) return p !== match.path;
                    if (match?.url) return u !== match.url;
                    return true;
                });
                if (next.length === atts.length) {
                    showToast('삭제할 첨부파일을 찾지 못했습니다.', 'info');
                    return;
                }
                await updateDoc(refQuote, { attachments: next });

                // Storage 삭제(best-effort)
                // 1) match.path
                // 2) 같은 url을 가진 항목의 path
                // 3) url에서 Storage 경로 추출
                const foundPath = match?.path || atts.find(a => (a?.url || '') === (match?.url || ''))?.path;
                const derivedPath = extractStoragePathFromUrl(match?.url || '') || extractStoragePathFromUrl(atts.find(a => (a?.url || '') === (match?.url || ''))?.url || '');
                const path = (foundPath || derivedPath || '').trim();
                if (path) {
                    try { await deleteObject(ref(storage, path)); } catch (e) { logger.warn('storage delete failed', e); }
                }
                showToast('첨부파일이 삭제되었습니다.', 'success');
            } catch (e) {
                logger.error(e);
                showToast('첨부파일 삭제에 실패했습니다.', 'error');
            }
        }

        function formatPhoneNumber(phone) {
            if (!phone) return '';
            const numbers = String(phone).replace(/[^0-9]/g, '');
            if (numbers.length === 11) return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
            if (numbers.length === 10) return numbers.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
            return phone;
        }

        // 비회원 비밀번호가 '휴대폰 뒤 4자리'인 경우, 목록(실시간 접수)에서는 마지막 4자리를 가립니다.
        // (상세보기에서는 기본 마스킹 + '번호보기' 토글로 전체 표시 가능)
        function maskPhoneLast4(phone) {
            const formatted = formatPhoneNumber(phone);
            if (!formatted) return '';
            // 010-1234-5678 / 010-123-5678 모두 마지막 4자리만 가리기
            return formatted.replace(/-(\d{4})$/, '-땡땡');
        }
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            const colors = { success: 'bg-brand-600', error: 'bg-red-500', info: 'bg-blue-500' };
            const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
            
            toast.className = `${colors[type] || colors.info} text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 transform translate-x-full transition-all duration-300 z-[9999]`;
            toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span class="font-bold text-sm">${message}</span>`;
            try { window.__speakToast && window.__speakToast(message); } catch(e) {}
            
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.remove('translate-x-full'));
            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function showConfirmation(title, message) {
            return new Promise((resolve) => {
                const modal = document.getElementById('confirmationModal');
                const titleEl = document.getElementById('confirmationTitle');
                const msgEl = document.getElementById('confirmationMessage');
                const okBtn = document.getElementById('confirmActionBtn');
                const cancelBtn = document.getElementById('confirmCancelBtn');

                titleEl.textContent = title;
                msgEl.textContent = message;
                modal.classList.remove('hidden');

                const cleanup = () => {
                    modal.classList.add('hidden');
                    okBtn.onclick = null;
                    cancelBtn.onclick = null;
                }
                okBtn.onclick = () => { cleanup(); resolve(true); };
                cancelBtn.onclick = () => { cleanup(); resolve(false); };
            });
        }

        // --- 사양 텍스트 변환 (업데이트됨) ---
const printOptionMaps = {
    leaflet: {
        leaflet_paperPrint: "용지/사이즈/인쇄",
        leaflet_coating: "코팅",
        leaflet_finishing: "후가공",
    },
    flyer_poster: {
        flyer_sheet: "용지/사이즈/인쇄",
        flyer_coating: "코팅",
        flyer_finishing: "후가공",
    },
    invitation: {
        invitation_card: "카드 종류",
        invitation_finishing: "후가공",
        invitation_envelope: "봉투",
    }
};

        function getSpecText(key, value) {
            // Firestore settings/imagePreviews._meta.items 의 라벨이 있으면 우선 사용
            try {
                const items = imagePreviewsCache?._meta?.items || {};
                if (key === 'coverPaperType') {
                    const arr = Array.isArray(items.coverPaper) ? items.coverPaper : [];
                    const hit = arr.find(x => x && x.key === value);
                    if (hit) return hit.text || hit.label || hit.key;
                }
                if (key === 'innerPaperType') {
                    const arr = Array.isArray(items.innerPaper) ? items.innerPaper : [];
                    const hit = arr.find(x => x && x.key === value);
                    if (hit) return hit.text || hit.label || hit.key;
                }
            } catch (_) {}

            const paperMap = {
                'mimoon80': '미색모조 80g (일반)', 'mimoon100': '미색모조 100g (일반)',
                'baek80': '백색모조 80g (일반)', 'baek100': '백색모조 100g (일반)',
                'snow120': '스노우지 120g (고급)', 'snow150': '스노우지 150g (고급)',
                'none': '없음'
            };
            const printMap = {
                'none': '인쇄 안함', 'bw_simplex': '흑백 단면', 'bw_duplex': '흑백 양면',
                'color_simplex': '컬러 단면', 'color_duplex': '컬러 양면'
            };
            const bindingMap = {
                'perfect': '무선 제본 (책자)', 'wire': '와이어 제본 (스프링)',
                'saddle': '중철 제본 (스테이플러)', 'none': '제본 안함 (낱장)'
            };
            const sizeMap = { '1': 'A4', '0.9': 'B5', '1.8': 'B4', '2': 'A3' };
            const colorMap = { 'sky': '하늘색', 'green': '연두색', 'pink': '분홍색', 'yellow': '노란색' };

if ((printOptionMaps.leaflet && printOptionMaps.leaflet[key]) || 
    (printOptionMaps.flyer_poster && printOptionMaps.flyer_poster[key]) || 
    (printOptionMaps.invitation && printOptionMaps.invitation[key])) {
        return value ? value.replace(/_/g, ' ') : '-';
}

            if (key === 'paper' || key.includes('Paper')) return paperMap[value] || value;
            if (key === 'print' || key.includes('Print')) return printMap[value] || value;
            if (key === 'binding' || key === 'bindingType') return bindingMap[value] || value;
            if (key === 'size' || key === 'paperSize') return sizeMap[value] || value;
            if (key === 'color' || key === 'interleafColor') return colorMap[value] || value;
            
            return value ? value.replace(/_/g, ' ') : '-';
        }
// 회사 정보 불러오기 및 모달 열기
    async function openCompanyInfoModal() {
        try {
            const docRef = doc(db, "settings", "companyInfo");
            const docSnap = await getDoc(docRef);

            // 데이터가 있으면 캐시에 저장하고 폼에 입력
            if (docSnap.exists()) {
                companyInfoCache = docSnap.data();
                const form = document.getElementById('company-info-form');
                
                // 데이터 채우기 (ID 기반 매핑)
                const fields = ['bizNum', 'companyName', 'ceoName', 'address', 'bizCategory', 'bizType', 'accountNum', 'accountHolder', 'tel', 'fax'];
                fields.forEach(key => {
                    const input = document.getElementById(key);
                    if (input && companyInfoCache[key]) {
                        input.value = companyInfoCache[key];
                    }
                });
                
                // 직인 이미지 미리보기
                const sealImg = document.getElementById('companySealPreview');
                if (companyInfoCache.sealUrl && sealImg) {
                    sealImg.src = companyInfoCache.sealUrl;
                }
            } else {
                showToast("저장된 회사 정보가 없습니다. 새로 입력해주세요.", "info");
            }
            // 모달 보이기
            DOMElements.companyInfoModal.classList.remove('hidden');
        } catch (error) {
            logger.error("회사 정보 로딩 에러:", error);
            console.error(error);
        showToast("정보 로딩에 실패했습니다. (콘솔을 확인해주세요)", "error"); 
        }
    }

    // [수정] 회사 정보 저장 로직
    async function handleCompanyInfoSave(event) {
        // submit 이벤트(폼) / click 이벤트(버튼) 모두 대응
        if (event && typeof event.preventDefault === 'function') event.preventDefault();

        // event.target이 버튼일 수 있으니, 항상 form을 안정적으로 잡는다.
        const form = (event?.target && event.target.closest)
            ? (event.target.closest('form') || document.getElementById('company-info-form'))
            : document.getElementById('company-info-form');
        const sealFile = document.getElementById('companySealFile').files[0];
        
        // 폼 데이터 수집
        const updatedInfo = {
            bizNum: document.getElementById('bizNum').value,
            companyName: document.getElementById('companyName').value,
            ceoName: document.getElementById('ceoName').value,
            address: document.getElementById('address').value,
            bizCategory: document.getElementById('bizCategory').value,
            bizType: document.getElementById('bizType').value,
            accountNum: document.getElementById('accountNum').value,
            accountHolder: document.getElementById('accountHolder').value,
            tel: document.getElementById('tel').value,
            fax: document.getElementById('fax').value,
        };

        const saveBtn =
            document.getElementById('saveCompanyInfoBtn') ||
            (form ? form.querySelector('button[type="submit"]') : null) ||
            (event && event.submitter) ||
            null;

        // saveBtn이 없는 경우(마크업 변경/누락 등)에도 저장 로직은 진행되게 한다.
        const originalBtnText = (saveBtn && typeof saveBtn.textContent === 'string') ? saveBtn.textContent : null;
        if (saveBtn) {
            try {
                saveBtn.textContent = "저장 중...";
                saveBtn.disabled = true;
            } catch (_) {}
        }
        
        try {
            // 직인 파일 업로드 처리
            if (sealFile) {
                const storageRef = ref(storage, `settings/company_seal_${Date.now()}`);
                const uploadTask = await uploadBytesResumable(storageRef, sealFile);
                updatedInfo.sealUrl = await getDownloadURL(uploadTask.ref);
            } else if (companyInfoCache?.sealUrl) {
    updatedInfo.sealUrl = companyInfoCache.sealUrl;
}

            await setDoc(doc(db, "settings", "companyInfo"), updatedInfo, { merge: true });
            companyInfoCache = updatedInfo; // 캐시 업데이트
            showToast("회사 정보가 저장되었습니다.", "success");
            DOMElements.companyInfoModal.classList.add('hidden');
        } catch (error) {
            logger.error(error);
            showToast("저장 중 오류 발생", "error");
        } finally {
            if (saveBtn) {
                try {
                    if (originalBtnText !== null) saveBtn.textContent = originalBtnText;
                    saveBtn.disabled = false;
                } catch (_) {}
            }
        }
    }

    // 빠른 답변 목록 실시간 리스너
    let cannedResponsesCache = [];
    function listenToCannedResponses() {
        const q = query(collection(db, "cannedResponses"), orderBy("createdAt", "desc"));
        onSnapshot(q, async (snapshot) => {
            cannedResponsesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderCannedResponses();
        });
    }

    // 빠른 답변 렌더링
    function renderCannedResponses() {
        const popoverList = document.getElementById('canned-response-list');
        const manageList = document.getElementById('response-list-container');
        
        if (popoverList) popoverList.innerHTML = '';
        if (manageList) manageList.innerHTML = '';

        cannedResponsesCache.forEach(res => {
            // 채팅창 팝오버용
            if (popoverList) {
                const li = document.createElement('li');
                li.className = "px-3 py-2 hover:bg-slate-100 cursor-pointer border-b border-slate-50 last:border-0";
                li.innerHTML = `<p class="font-bold text-slate-700">${sanitizeHTML(res.title)}</p><p class="text-xs text-slate-500 truncate">${sanitizeHTML(res.text)}</p>`;
                li.onclick = () => {
                    const chatInput = document.getElementById('chat-input');
                    chatInput.value = res.text;
                    chatInput.focus();
                    document.getElementById('canned-response-popover').classList.add('hidden');
                };
                popoverList.appendChild(li);
            }
            // 관리 모달용
            if (manageList) {
                const div = document.createElement('div');
                div.className = "flex justify-between items-center p-3 border rounded bg-white shadow-sm";
                div.innerHTML = `
                    <div class="overflow-hidden">
                        <p class="font-bold text-sm text-slate-800">${sanitizeHTML(res.title)}</p>
                        <p class="text-xs text-slate-500 truncate">${sanitizeHTML(res.text)}</p>
                    </div>
                    <button class="delete-response-btn text-red-400 hover:text-red-600 ml-2" data-id="${res.id}"><i class="fas fa-trash"></i></button>`;
                manageList.appendChild(div);
            }
        });
    }
        // --- 메인 로직: 견적 리스트 ---
        
        // ---------------------------------------------------------
        // UI 갱신용: 견적 리스트 재렌더(과거 코드 호환)
        // - 실데이터는 listenToQuotes()의 onSnapshot이 갱신함
        // - 일부 액션(첨부 삭제 등) 후 즉시 화면을 다시 그리기 위해 제공
        // ---------------------------------------------------------
        async function loadQuotes() {
            try {
                // Firestore onSnapshot 반영 타이밍을 약간 기다린 뒤 렌더링
                await new Promise((r) => setTimeout(r, 50));
            } catch (e) {}
            try { renderQuotes(); } catch (e) {}
            try { updateDashboard(); } catch (e) {}
            try { updateRevenueStats(); } catch (e) {}
        }

// ── Firestore 실시간 견적 목록 구독 ────────────────────────────
// 관리자 페이지 진입 시 호출. 새 접수/변경이 생기면 자동으로 화면을 갱신합니다.
async function listenToQuotes() {
            const q = query(collection(db, "quotes"), orderBy("createdAt", "desc"));
            const usersRef = collection(db, "users");
            const userDocs = await getDocs(usersRef);
            userDocs.forEach(doc => { usersCache[doc.id] = doc.data(); });

            onSnapshot(q, async (snapshot) => {
                // 알림 권한(최초 1회) 요청
                if (isInitialQuotesSnapshot) { ensureNotificationPermission(); }
                let hasNewUnread = false;
                let newIntakeCount = 0;
                let firstNewIntake = null;
                // 초기 로드 이후에만 '새 접수' 알림
                if (!isInitialQuotesSnapshot) {
                    snapshot.docChanges().forEach((ch) => {
                        if (ch.type !== 'added') return;
                        const data = ch.doc.data() || {};
                        const status = (data.status === 'submitted' || data.status === '접수대기' || !data.status) ? '접수완료' : data.status;
                        // 접수완료로 들어온 신규 건만 알림
                        if (status === '접수완료') {
                            newIntakeCount += 1;
                            const qobj = { id: ch.doc.id, ...data };
                            if (!firstNewIntake) firstNewIntake = qobj;
                            newQuoteIds.add(ch.doc.id);
                        }
                    });
                }

                const newQuotesCache = snapshot.docs.map(d => {
                    const data = d.data() || {};
                    const total = (data.finalPrice ?? data.totalPrice ?? data.total ?? data.totalRounded ?? 0);
                    const supply = (data.supplyPrice ?? data.supply ?? (total ? Math.round(Number(total)/1.1) : 0));
                    const vat = (data.vat ?? data.vatPrice ?? (Number(total) - Number(supply)));
                    return {
                        id: d.id,
                        ...data,
                        finalPrice: Number(total) || 0,
                        supplyPrice: Number(supply) || 0,
                        vat: Number(vat) || 0
                    };
                });

                // 새 고객 메시지(텍스트/파일) 알림 후보(초기 로드 제외 + 상태변화 순간만)
                const unreadChangedIds = [];
                if (quotesCache.length > 0) {
                    newQuotesCache.forEach((newQuote) => {
                        const oldQuote = quotesCache.find(old => old.id === newQuote.id);
                        if (newQuote.hasUnreadAdminMessage && (!oldQuote || !oldQuote.hasUnreadAdminMessage)) {
                            unreadChangedIds.push(newQuote.id);
                        }
                    });
                }

                // 정책: 관리자 상세/상담창이 "열려있지 않을 때만" 새 고객 메시지 소리 알림
                const detailOpen = DOMElements.detailsModal && !DOMElements.detailsModal.classList.contains('hidden');
                if (!detailOpen && unreadChangedIds.length > 0) {
                    hasNewUnread = true;
                    window.__unreadChangedIds = unreadChangedIds; // 사운드 타입(파일/텍스트) 판별에 사용
                } else {
                    window.__unreadChangedIds = [];
                }

                quotesCache = newQuotesCache;
                renderQuotes();
                updateDashboard();
                updateRevenueStats();

                // 새 접수 알림(소리 + 데스크탑 + 제목깜빡임)
                if (newIntakeCount > 0) {
                    fireNewIntakeAlert(newIntakeCount, firstNewIntake);
                }

                // 고객 메시지 알림(텍스트 vs 파일) - 상세/상담창이 닫혀있을 때만
                if (hasNewUnread) {
                    let useFileSound = false;
                    window.__hasUnreadEdit = false;
                    try{
                        const ids = Array.isArray(window.__unreadChangedIds) ? window.__unreadChangedIds : [];
                        // 너무 많은 경우 비용 방지: 최대 3건만 타입 확인
                        const checkIds = ids.slice(0, 3);
                        for (const qid of checkIds) {
                            const t = await getLatestCustomerMessageType(qid);
                            if (t === 'file') { useFileSound = true; break; }
                            if (t === 'system') { window.__hasUnreadEdit = true; }
                        }
                    }catch(e){ logger.warn("message/file sound decide error:", e); }
                    if (useFileSound) {
                        safePlay(document.getElementById('file-sound'), 'file', 1200);
                    } else if (window.__hasUnreadEdit) {
                        safePlay(document.getElementById('edit-sound'), 'edit', 1200);
                    } else {
                        safePlay(document.getElementById('message-sound'), 'message', 1200);
                    }
                }

                isInitialQuotesSnapshot = false;
            });
        }

        function renderQuotes() {
            const tbody = document.getElementById('quote-list-body');
            const paginationContainer = document.getElementById('pagination-controls');
            tbody.innerHTML = '';
            paginationContainer.innerHTML = ''; // 초기화
            
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const statusFilter = document.getElementById('statusFilter').value;

            // Helper functions
            const normalizeStatus = (s) => (s === 'submitted' || s === '접수대기' || !s) ? '접수완료' : s;
            const isGuestQuote = (q) => q?.isGuest === true || q?.guestLookupKey || q?.userId === 'GUEST';
            const getCustomerName = (q) => q?.guestName || q?.ordererName || q?.userName || usersCache[q.userId]?.name || '알수없음';
            const getCustomerContact = (q) => {
                const raw = q?.guestContact || q?.ordererContact || q?.userContact || usersCache[q.userId]?.contact || '';
                return isGuestQuote(q) ? maskPhoneLast4(raw) : formatPhoneNumber(raw);
            };
            const getDisplayPrice = (q) => {
                const v = q?.finalPrice ?? q?.totalPrice ?? 0;
                return Number.isFinite(Number(v)) ? Number(v) : 0;
            };

            // 1. 필터링 및 정렬 (기존 로직 유지)
            const filteredQuotes = quotesCache
                .map(q => ({ ...q, status: normalizeStatus(q.status) }))
                .filter(q => {
                    const name = getCustomerName(q);
                    const contact = getCustomerContact(q);
                    const title = q.orderName || q.title || '';
                    const receiptNo = (q.receiptNo || "").toString();
                    const searchHaystack = `${receiptNo} ${title} ${name} ${contact}`.toLowerCase();
                    return (searchTerm === '' || searchHaystack.includes(searchTerm)) && 
                           (statusFilter === 'all'
                            || q.status === statusFilter
                            || (statusFilter === '취소요청' && (q.status === '취소요청' || q.cancelRequestState === 'requested'))
                            || (statusFilter === '취소거절' && (q.status === '취소거절' || q.cancelRequestState === 'rejected'))
                           );
                })
                .sort((a, b) => {
    // 우선순위: 취소요청(0) → 새접수 NEW(1) → 미확인메시지(2) → 일반(3)
    const isCancelA = ((a.status === '취소요청') || (a.cancelRequestState === 'requested'));
    const isCancelB = ((b.status === '취소요청') || (b.cancelRequestState === 'requested'));
    const isNewA = newQuoteIds.has(a.id);
    const isNewB = newQuoteIds.has(b.id);

    const pa = isCancelA ? 0 : (isNewA ? 1 : (a.hasUnreadAdminMessage ? 2 : 3));
    const pb = isCancelB ? 0 : (isNewB ? 1 : (b.hasUnreadAdminMessage ? 2 : 3));
    if (pa != pb) return pa - pb;

    const ta = a.createdAt?.seconds || (a.createdAt?.toDate ? +a.createdAt.toDate() : 0) || 0;
    const tb = b.createdAt?.seconds || (b.createdAt?.toDate ? +b.createdAt.toDate() : 0) || 0;
    return tb - ta;
});

            if (filteredQuotes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-400">데이터가 없습니다.</td></tr>';
                return;
            }

            // 2. [추가] 페이지네이션 계산
            const totalPages = Math.ceil(filteredQuotes.length / itemsPerPage);
            // 현재 페이지가 전체 페이지보다 크면 1페이지로 리셋 (필터링 시 발생 가능)
            if (currentPage > totalPages) currentPage = 1;

            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedItems = filteredQuotes.slice(startIndex, endIndex);

            // 3. 리스트 렌더링 (paginatedItems만 사용)
            const renderRow = (q) => {
                const tr = document.createElement('tr');
                tr.className = `border-b border-slate-100 hover:bg-slate-50 transition-colors ${q.hasUnreadAdminMessage ? 'bg-blue-50/50' : ''}`;
                
                const date = q.createdAt ? q.createdAt.toDate().toLocaleDateString('ko-KR') : '-';
                const name = getCustomerName(q);
                const contact = getCustomerContact(q);
                const price = getDisplayPrice(q).toLocaleString();

                const isCancelRequest = (q.status === '취소요청') || (q.cancelRequestState === 'requested');
                const isCanceled = q.status === '주문취소';
                const isCancelRejected = (q.cancelRequestState === 'rejected') || (q.status === '취소거절');
                
                let typeBadge = q.productType === 'book' 
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 mr-2 flex-shrink-0">책자</span>`
                    : `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 mr-2 flex-shrink-0">인쇄</span>`;
                
                const userBadge = ``;

                tr.innerHTML = `
                    <td class="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">${date}</td>
                    <td class="px-6 py-4 text-xs text-slate-600 font-mono whitespace-nowrap">${sanitizeHTML(q.receiptNo || "-")}</td>
<td class="px-6 py-4">
                        <div class="flex items-center">
                            ${typeBadge}
                            <span class="font-bold text-slate-700 truncate max-w-[180px] mr-2" title="${sanitizeHTML(q.orderName)} ${(() => { const editedBadge = ''; return editedBadge; })()}">${sanitizeHTML(q.orderName || '제목 없음')}</span>
                            <span class="text-xs text-slate-400 truncate max-w-[150px]">${sanitizeHTML(q.productSubType || '')}</span>
                            ${q.hasUnreadAdminMessage ? '<span class="ml-2 w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0"></span>' : ''}
                            ${newQuoteIds.has(q.id) ? '<span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-green-50 text-green-700 border border-green-100 flex-shrink-0">NEW</span>' : ''}
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center whitespace-nowrap">
                            ${userBadge}
                            <span class="font-bold text-slate-700 text-sm">${sanitizeHTML(name)}</span>
                            ${contact ? `<span class="mx-2 text-slate-300">|</span><span class="text-xs text-slate-500">${sanitizeHTML(contact)}</span>` : ''}
                        </div>
                    </td>
                    <td class="px-6 py-4 text-right font-bold text-slate-600 whitespace-nowrap">${price}원</td>
                    <td class="px-6 py-4 text-center">
                        ${isCancelRequest ? `
                            <div class="flex flex-col items-center gap-1">
                                <span class="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800">취소요청</span>
                                <span class="text-[10px] text-slate-400">(이전: ${sanitizeHTML(q.cancelPrevStatus || '-')} )</span>
                            </div>
                        ` : isCanceled ? `
                            <span class="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">주문취소</span>
                        ` : isCancelRejected ? `
                            <span class="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-slate-200 text-slate-600">취소거절</span>
                        ` : `
                            <select class="status-select text-xs font-bold px-2 py-1 rounded border bg-white border-slate-200 cursor-pointer outline-none focus:border-brand-500" data-id="${q.id}">
                                <option value="접수완료" ${q.status==='접수완료'?'selected':''}>접수완료</option>
                                <option value="작업중" ${q.status==='작업중'?'selected':''}>작업중</option>
                                <option value="작업완료" ${q.status==='작업완료'?'selected':''}>작업완료</option>
                                <option value="결제완료" ${q.status==='결제완료'?'selected':''}>결제완료</option>
                            </select>
                        `}
                    </td>
                    <td class="px-6 py-4 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button class="view-details-btn p-1.5 text-slate-400 hover:text-brand-600 transition-colors" data-id="${q.id}" title="상세보기"><i class="fas fa-eye"></i></button>
                            <button class="admin-edit-quote-btn p-1.5 text-slate-400 hover:text-indigo-600 transition-colors" data-id="${q.id}" title="견적수정(내용 변경)"><i class="fas fa-pen-to-square"></i></button>
                            ${isCancelRequest ? `
                                <button class="approve-cancel-btn px-2 py-1 text-[11px] font-bold rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100" data-id="${q.id}" title="취소확정">취소확정</button>
                                <button class="reject-cancel-btn px-2 py-1 text-[11px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200" data-id="${q.id}" title="취소거절">취소거절</button>
                            ` : `
                                <button class="delete-quote-btn p-1.5 text-slate-400 hover:text-red-500 transition-colors" data-id="${q.id}" title="삭제"><i class="fas fa-trash"></i></button>
                            `}
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            };
            paginatedItems.forEach(renderRow);

            // 4. [추가] 페이지네이션 버튼 렌더링
            if (totalPages > 1) {
                // 이전 버튼
                const prevBtn = document.createElement('button');
                prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                prevBtn.className = `w-8 h-8 rounded border flex items-center justify-center text-xs ${currentPage === 1 ? 'text-slate-300 border-slate-200 cursor-not-allowed' : 'text-slate-500 border-slate-300 hover:bg-white'}`;
                prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderQuotes(); } };
                paginationContainer.appendChild(prevBtn);

                // 페이지 번호 (최대 5개까지만 표시 등 복잡한 로직 대신 심플하게 전체 표시하거나, 간단히 범위 제한)
                // 여기서는 심플하게 구현 (페이지가 너무 많아지면 로직 고도화 필요)
                let startPage = Math.max(1, currentPage - 2);
                let endPage = Math.min(totalPages, startPage + 4);
                if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

                for (let i = startPage; i <= endPage; i++) {
                    const btn = document.createElement('button');
                    btn.textContent = i;
                    const isActive = i === currentPage;
                    btn.className = `w-8 h-8 rounded border flex items-center justify-center text-xs font-bold ${isActive ? 'bg-brand-600 text-white border-brand-600' : 'text-slate-500 border-slate-300 bg-white hover:bg-slate-50'}`;
                    btn.onclick = () => { currentPage = i; renderQuotes(); };
                    paginationContainer.appendChild(btn);
                }

                // 다음 버튼
                const nextBtn = document.createElement('button');
                nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
                nextBtn.className = `w-8 h-8 rounded border flex items-center justify-center text-xs ${currentPage === totalPages ? 'text-slate-300 border-slate-200 cursor-not-allowed' : 'text-slate-500 border-slate-300 hover:bg-white'}`;
                nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderQuotes(); } };
                paginationContainer.appendChild(nextBtn);
            }
        }

        // [새로 추가된 함수] 월별 매출 현황 계산 및 렌더링
        function updateRevenueStats() {
            const stats = {};
            const today = new Date();
            
            // 1. 최근 6개월치 키 생성
            for(let i=0; i<6; i++) {
                const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                stats[key] = { count: 0, total: 0, confirmed: 0 };
            }

            // 2. 캐시된 견적 데이터 순회하며 집계
            quotesCache.forEach(q => {
                if (!q.createdAt || q.status === '주문취소') return;

                const d = q.createdAt.toDate();
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const price = Number(q.finalPrice || q.totalPrice || 0);

                if (stats[key]) {
                    stats[key].count++;
                    stats[key].total += price;
                    if (['결제완료', '작업완료'].includes(q.status)) {
                        stats[key].confirmed += price;
                    }
                }
            });

            // 3. HTML 렌더링
            const tbody = document.getElementById('revenue-stats-body');
            if(!tbody) return;
            tbody.innerHTML = '';

            const sortedKeys = Object.keys(stats).sort().reverse();
            
            sortedKeys.forEach(key => {
                const data = stats[key];
                const percent = data.total > 0 ? (data.confirmed / data.total) * 100 : 0;
                
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition-colors";
                
                // [수정] 각 td에 whitespace-nowrap 적용하여 줄바꿈 방지 -> 가로 스크롤 유도
                tr.innerHTML = `
                    <td class="px-4 py-4 font-bold text-slate-700 text-center bg-slate-50/30 whitespace-nowrap">${key}</td>
                    <td class="px-4 py-4 text-center text-slate-600 whitespace-nowrap">
                        <span class="bg-white border border-slate-200 px-2 py-1 rounded-full text-xs font-bold shadow-sm">${data.count}건</span>
                    </td>
                    <td class="px-4 py-4 text-right whitespace-nowrap">
                        <span class="text-slate-500 font-medium">${data.total.toLocaleString()}원</span>
                    </td>
                    <td class="px-4 py-4 text-right whitespace-nowrap">
                        <span class="text-brand-600 font-bold text-base">${data.confirmed.toLocaleString()}원</span>
                    </td>
                    <td class="px-4 py-4 whitespace-nowrap">
                        <div class="flex items-center gap-3">
                            <div class="w-full min-w-[80px] bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div class="bg-brand-500 h-2.5 rounded-full shadow-sm transition-all duration-1000" style="width: ${percent}%"></div>
                            </div>
                            <span class="text-xs font-bold text-slate-500 w-10 text-right">${Math.round(percent)}%</span>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
// ── 대시보드 통계 갱신 ─────────────────────────────────────────
// 전체/대기/진행중/완료 접수 건수를 계산해 상단 카운터에 표시
function updateDashboard() {
            const today = new Date(); today.setHours(0,0,0,0);
            
            const newOrders = quotesCache.filter(q => q.createdAt && q.createdAt.toDate() >= today).length;
            const inProgress = quotesCache.filter(q => q.status === '작업중').length;
            const unreadChats = quotesCache.filter(q => q.hasUnreadAdminMessage).length;
            // 답변 안 된 1:1 문의
            const unansweredInquiries = inquiriesCache.filter(i => !(i.status === 'answered' || i.status === '답변완료')).length;
            const completed = quotesCache.filter(q => q.status === '작업완료' || q.status === '결제완료').length;

            // 대시보드 카드 숫자 (여기는 합산 유지)
            document.getElementById('stat-today-new').textContent = newOrders;
            document.getElementById('stat-in-progress').textContent = inProgress;
            document.getElementById('stat-unread-chats').textContent = unreadChats + unansweredInquiries;
            document.getElementById('stat-awaiting-payment').textContent = completed;
            
            // [핵심 수정] 상단 메뉴 '1:1 문의 관리' 탭의 빨간 점은 오직 '문의'가 있을 때만 표시
            const indicator = document.getElementById('notification-indicator');
            if (indicator) {
                if (unansweredInquiries > 0) {
                    indicator.classList.remove('hidden');
                    indicator.classList.add('animate-pulse');
                } else {
                    indicator.classList.add('hidden');
                    indicator.classList.remove('animate-pulse');
                }
            }
        }

        async function updateStatus(quoteId, newStatus) {
            try {
                await updateDoc(doc(db, "quotes", quoteId), { status: newStatus });
                showToast("상태가 변경되었습니다.", "success");
            } catch (error) { showToast("상태 변경 중 오류 발생", "error"); }
        }

        async function resolveCancelRequest(quoteId, decision) {
            try {
                const quoteRef = doc(db, "quotes", quoteId);
                const snap = await getDoc(quoteRef);
                if (!snap.exists()) { showToast('주문을 찾을 수 없습니다.', 'error'); return; }
                const q = snap.data();
                if (q.status !== '취소요청' && q.cancelRequestState !== 'requested') { showToast('현재 상태가 취소요청이 아닙니다.', 'info'); return; }

                if (decision === 'approve') {
                    const ok = await showConfirmation('취소확정', '해당 주문을 취소 처리합니다. 진행하시겠습니까?');
                    if (!ok) return;
                    await updateDoc(quoteRef, {
                        status: '주문취소',
                        cancelApprovedAt: serverTimestamp(),
                        cancelResolvedBy: 'admin',
                        cancelRequestState: 'approved'
                    });
                    showToast('취소확정 처리되었습니다.', 'success');
                } else if (decision === 'reject') {
                    const reason = prompt('취소거절 사유(선택)');
                    const prev = q.cancelPrevStatus || '작업중';
                    const ok = await showConfirmation('취소거절', `취소요청을 거절하고 상태를 '${prev}'로 되돌립니다. 진행하시겠습니까?`);
                    if (!ok) return;
                    await updateDoc(quoteRef, {
                        // 거절: 상태는 원래대로 유지(레거시로 status가 '취소요청'인 경우만 prev로 복구)
                        status: (q.status === '취소요청' ? prev : q.status),
                        cancelRejectedAt: serverTimestamp(),
                        cancelRejectedReason: reason || '',
                        cancelPrevStatus: prev,
                        cancelRequestState: 'rejected',
                        cancelResolvedBy: 'admin'
                    });
                                        // 고객에게 상세/상담 메시지로 거절 사유 안내
                    try {
                        if (reason && reason.trim()) {
                            await addDoc(collection(db, `quotes/${quoteId}/messages`), {
                                sender: 'admin',
                                timestamp: serverTimestamp(),
                                type: 'text',
                                text: `취소요청이 거절되었습니다. 사유: ${reason.trim()}`
                            });
                            await updateDoc(quoteRef, { hasUnreadCustomerMessage: true });
                        }
                    } catch (e) {
                        console.warn('[admin] failed to post cancel reject reason message', e);
                    }
showToast('취소거절 처리되었습니다.', 'success');
                }
            } catch (e) {
                logger.error(e);
                showToast(`취소 처리 중 오류 발생 (${e?.code || 'unknown'})`, 'error');
            }
        }

        async function deleteQuote(quoteId) {
            const confirmed = await showConfirmation("견적 삭제", "정말로 삭제하시겠습니까? 채팅 내역과 파일도 함께 삭제됩니다.");
            if (!confirmed) return;

            try {
                // 하위 컬렉션(messages) 삭제 로직은 클라이언트 SDK에서 직접 불가하므로, 
                // 문서 하나씩 삭제하거나 서버 함수를 써야 함. 여기서는 단순화하여 문서와 Storage 파일만 처리 시도.
                // (실제 프로덕션에서는 Cloud Functions 권장)
                
                const msgsRef = collection(db, "quotes", quoteId, "messages");
                const msgsSnap = await getDocs(msgsRef);
                const batch = writeBatch(db);
                
                // 파일 삭제 시도
                for (const msgDoc of msgsSnap.docs) {
                    const msg = msgDoc.data();
                    if(msg.type === 'file' && msg.filePath) {
                        try { await deleteObject(ref(storage, msg.filePath)); } catch(e) { logger.warn(e); }
                    }
                    batch.delete(msgDoc.ref);
                }
           try {
            const quoteSnap = await getDoc(doc(db, "quotes", quoteId));
            if (quoteSnap.exists()) {
                const qd = quoteSnap.data();
                const atts = Array.isArray(qd.attachments) ? qd.attachments : [];
                for (const att of atts) {
                    const p = (att?.path || extractStoragePathFromUrl(att?.url || '') || '').trim();
                    if (p) {
                        try {
                            await deleteObject(ref(storage, p));
                        } catch (storageError) {
                            logger.warn(`Could not delete attachment ${p}:`, storageError);
                        }
                    }
                }
            }
        } catch (e) {
            logger.warn("Could not load quote attachments for deletion:", e);
        }
                
                batch.delete(doc(db, "quotes", quoteId));
                await batch.commit();
                showToast("삭제되었습니다.", "success");
            } catch(e) { logger.error(e); showToast("삭제 중 오류 발생", "error"); }
        }

        // --- 상세 HTML 생성 (핵심 로직) ---
       function generateDetailedSpecsHtml(quote) {
            const s = sanitizeHTML;
            const dateStr = quote.createdAt ? new Date(quote.createdAt.toDate()).toLocaleString('ko-KR') : '-';
            const user = usersCache[quote.userId] || {};
            
            // 회원/비회원 판별 로직
            const isGuest = quote.isGuest === true || quote.guestLookupKey || quote.userId === 'GUEST';
            const userBadge = ``;

            // 상단 정보
            let html = `
                <div class="bg-brand-50 p-5 rounded-xl border border-brand-100 mb-6">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h3 class="text-xl font-bold text-slate-800 flex items-center">
                                <span class="bg-brand-600 text-white text-xs px-2 py-1 rounded mr-2">${quote.productType === 'book' ? '책자/제본' : '디지털인쇄'}</span>
                                ${s(quote.orderName)}
                            </h3>
                            <p class="text-sm text-slate-500 mt-1">접수일시: ${dateStr}</p>
                        </div>
                        <div class="text-sm text-right bg-white p-3 rounded-lg border border-brand-100 shadow-sm w-full md:w-auto">
                            <p class="flex items-center justify-end mb-1">
                                ${userBadge}
                                <span class="font-bold text-slate-600 mr-2">주문자:</span> 
                                ${s(quote.guestName || quote.ordererName || (user.name || quote.userName) || '-')}
                            </p>
                            ${(() => {
                                const rawPhone = (quote.guestContact || quote.ordererContact || (user.contact || user.phone) || '');
                                const full = formatPhoneNumber(rawPhone);
                                if (!full) return `<p><span class="font-bold text-slate-600">연락처:</span> -</p>`;
                                if (!isGuest) return `<p><span class="font-bold text-slate-600">연락처:</span> ${s(full)}</p>`;
                                const masked = maskPhoneLast4(rawPhone);
                                return `
                                  <p class="flex items-center justify-end gap-2">
                                    <span class="font-bold text-slate-600">연락처:</span>
                                    <span id="guest-phone-display" class="font-medium">${s(masked)}</span>
                                    <button id="guest-phone-toggle" type="button" class="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700" data-full="${s(full)}" data-masked="${s(masked)}" data-shown="0">번호보기</button>
                                  </p>`;
                            })()}
                            ${quote.ordererCompany ? `<p><span class="font-bold text-slate-600">소속:</span> ${s(quote.ordererCompany)}</p>` : ''}
                        </div>
                    </div>
                </div>
            `;

// 세금계산서(고객 입력) 정보
try {
    if (quote.taxInvoiceInfo) {
        const t = quote.taxInvoiceInfo || {};
        const reqAt = t.requestedAt?.toDate ? t.requestedAt.toDate().toLocaleString('ko-KR') : '-';
        html += `
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
            <h4 class="font-bold text-slate-800 flex items-center gap-2 mb-3">
                <i class="fas fa-file-invoice text-slate-400"></i> 세금계산서 정보(고객 입력)
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span class="text-slate-500 font-bold">상호:</span> ${s(t.companyName || '-')}</div>
                <div><span class="text-slate-500 font-bold">대표자:</span> ${s(t.ceoName || '-')}</div>
                <div><span class="text-slate-500 font-bold">사업자번호:</span> ${s(t.bizNum || '-')}</div>
                <div><span class="text-slate-500 font-bold">이메일:</span> ${s(t.email || '-')}</div>
                <div class="md:col-span-2"><span class="text-slate-500 font-bold">주소:</span> ${s(t.address || '-')}</div>
                <div class="md:col-span-2 text-[11px] text-slate-400">신청일시: ${s(reqAt)}</div>
            </div>
        </div>`;
    } else {
        html += `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-sm text-slate-500">
            <i class="fas fa-file-invoice mr-1"></i> 세금계산서 신청 정보가 없습니다.
        </div>`;
    }
} catch(e) { logger.warn('taxInvoiceInfo render failed', e); }


            // 접수 첨부파일(견적 신청 시 업로드된 파일)
            try {
                const atts = Array.isArray(quote.attachments) ? quote.attachments : [];
                if (atts.length > 0) {
                    html += `
                    <div id="quote-attachments-section" class="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-bold text-slate-800 flex items-center gap-2"><i class="fas fa-paperclip text-slate-400"></i>접수 첨부파일</h4>
                            <span class="text-xs text-slate-400">${atts.length}개</span>
                        </div>
                        <div class="space-y-2">
                            ${atts.map((a, i) => {
                                const name = s(a?.name || `첨부파일_${i+1}`);
                                const url = s(a?.url || '');
                                const size = formatBytes(a?.size || 0);
                                if (!url) return '';
                                return `
                                  <div class="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                                    <div class="min-w-0">
                                      <p class="text-sm font-medium text-slate-700 truncate">${name}</p>
                                      <p class="text-[11px] text-slate-400">${size}</p>
                                    </div>
                                    <div class="shrink-0 flex gap-2">
                                      <a href="${url}" data-force-download="1" download="${name}" class="px-3 py-1.5 rounded-md text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700">저장</a>
                                      <button type="button" class="delete-attachment-btn px-3 py-1.5 rounded-md text-xs font-bold bg-red-500 hover:bg-red-600 text-white" data-path="${s(a?.path || '')}" data-url="${url}">삭제</button>
                                    </div>
                                  </div>`;
                            }).join('')}
                        </div>
                        <p class="mt-3 text-[11px] text-slate-400">※ ‘저장’을 누르면 브라우저 다운로드로 컴퓨터에 저장됩니다.</p>
                    </div>`;
                }
            } catch(e) { logger.warn('attachments render failed', e); }


            let dataItems = [];
            try { dataItems = JSON.parse(quote.formData || quote.items || '[]'); } catch (e) {}
            let breakdownItems = [];
            try { breakdownItems = quote.breakdownData ? JSON.parse(quote.breakdownData) : []; } catch (e) {}

            if (dataItems.length > 0) {
                dataItems.forEach((item, index) => {
                    const breakdown = breakdownItems[index] || {};
                    html += `<div class="border border-slate-300 rounded-xl overflow-hidden mb-8 shadow-sm bg-white">
                                <div class="bg-slate-100 px-5 py-3 border-b border-slate-300 flex justify-between items-center">
                                    <h4 class="font-bold text-lg text-slate-800">
                                        <span class="text-brand-600 mr-2">#${index + 1}</span> ${s(item.orderName || item.title)}
                                    </h4>
                                    <span class="bg-slate-800 text-white text-xs font-bold px-3 py-1 rounded-full">
                                        ${Number(item.quantity).toLocaleString()}${quote.productType === 'book' ? '부' : '매/개'}
                                    </span>
                                </div>
                                <div class="p-6 space-y-6">`;

                    if (quote.productType === 'book' || item.productType === 'book') {
                        // 표지
                        if (item.coverPaperType && item.coverPaperType !== 'none') {
                            html += `
                            <div class="flex flex-col border-l-4 border-brand-500 pl-4 bg-brand-50/50 py-2 rounded-r-lg">
                                <h5 class="font-bold text-brand-700 mb-2 flex items-center"><i class="fas fa-book-cover mr-2"></i>표지 사양</h5>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm text-slate-700">
                                    <div class="flex justify-between border-b border-slate-200 pb-1"><span>용지</span><span class="font-medium">${getSpecText('paper', item.coverPaperType)}</span></div>
                                    <div class="flex justify-between border-b border-slate-200 pb-1"><span>인쇄</span><span class="font-medium">${getSpecText('print', item.coverPrintType)}</span></div>
                                    <div class="flex justify-between border-b border-slate-200 pb-1"><span>코팅</span><span class="font-medium">${item.coverCoating ? '있음' : '없음'}</span></div>
                                    <div class="flex justify-between border-b border-slate-200 pb-1"><span>오시</span><span class="font-medium">${item.coverOshi ? '신청함' : '신청안함'}</span></div>
                                </div>
                            </div>`;
                        }
                        // 내지
                        if (item.innerSections && item.innerSections.length > 0) {
                            html += `<div class="flex flex-col border-l-4 border-blue-500 pl-4 bg-blue-50/50 py-2 rounded-r-lg mt-4">
                                <h5 class="font-bold text-blue-700 mb-2 flex items-center"><i class="fas fa-file-alt mr-2"></i>내지 구성</h5>`;
                            item.innerSections.forEach((inner, i) => {
                                html += `<div class="bg-white border border-blue-200 rounded p-3 mb-2 shadow-sm text-sm">
                                    <div class="font-bold text-xs text-blue-600 mb-1">내지 #${i + 1}</div>
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div><span class="text-slate-400 text-xs block">사이즈</span>${getSpecText('size', inner.paperSize)}</div>
                                        <div><span class="text-slate-400 text-xs block">용지</span>${getSpecText('paper', inner.innerPaperType)}</div>
                                        <div><span class="text-slate-400 text-xs block">인쇄</span>${getSpecText('print', inner.innerPrintType)}</div>
                                        <div><span class="text-slate-400 text-xs block">페이지</span><span class="font-bold">${inner.innerPages}p</span></div>
                                    </div>
                                </div>`;
                            });
                            html += `</div>`;
                        }
                        // 제본/간지
                        html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            ${item.interleafSheets > 0 ? `<div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200"><h5 class="font-bold text-yellow-700 text-sm mb-1">🎨 간지</h5><p class="text-sm"><span class="font-semibold">${getSpecText('color', item.interleafColor)}</span> / <span class="font-bold">${item.interleafSheets}장</span></p></div>` : ''}
                            <div class="bg-slate-100 p-3 rounded-lg border border-slate-200"><h5 class="font-bold text-slate-700 text-sm mb-1">📚 제본</h5><p class="text-sm font-medium text-slate-900">${getSpecText('binding', item.bindingType)}</p></div>
                        </div>`;
                    
                    } else {
                        // ------------------------------
                        // 디지털인쇄(일반인쇄) 상세 사양/금액 산출 (표 형태 + 그룹핑)
                        // ------------------------------
                        const isPrintItem = (quote.productType === 'print' || item.productType === 'print' || item.category === 'digital_print' || item.type === 'digital_print');
                        const specObj = item.specsText || item.spec || null;
                        const pricingObj = item.pricing || null;

                        const kvRows = (obj) => {
                            if (!obj || typeof obj !== 'object') return '';
                            const entries = Object.entries(obj).filter(([k,v]) => v !== undefined && v !== null && String(v).trim() !== '');
                            if (entries.length === 0) return '';
                            return entries.map(([k,v], idx) => `
                                <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
                                    <th class="w-40 md:w-48 text-left py-2.5 px-3 text-slate-500 font-bold align-top">${s(String(k).replace(/_/g,' '))}</th>
                                    <td class="py-2.5 px-3 text-slate-800 font-medium whitespace-pre-wrap break-words">${s(String(v)).replace(/_/g,' ')}</td>
                                </tr>
                            `).join('');
                        };

                        html += `
                            <div class="bg-slate-50 p-5 rounded-lg border border-slate-200">
                                <div class="flex items-center justify-between mb-3">
                                    <h5 class="font-extrabold text-slate-800 text-base flex items-center gap-2">
                                        <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-900 text-white text-xs">P</span>
                                        디지털인쇄 사양
                                    </h5>
                                    <span class="text-xs font-bold px-2 py-1 rounded-full border ${isPrintItem ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}">
                                        ${s(item.category || item.productType || 'print')}
                                    </span>
                                </div>

                                <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                    <table class="w-full text-sm">
                                        <tbody>
                                            ${kvRows(specObj) || `
                                                <tr><td class="py-6 px-4 text-center text-slate-400">표시할 사양 정보가 없습니다.</td></tr>
                                            `}
                                        </tbody>
                                    </table>
                                </div>
                            </div>`;

                        // ----- 금액 산출 내역 (그룹핑) -----
                        const dp = (() => {
                            // breakdownData 우선, 없으면 pricing으로 대체
                            const b = (breakdown && (breakdown.digital_print || breakdown)) || null;
                            if (b && typeof b === 'object') return b;
                            if (pricingObj && typeof pricingObj === 'object') {
                                return {
                                    unitPrice: item.unitPrice,
                                    mul: (specObj && (specObj['사이즈계수'] || specObj['sizeMultiplier'])) || null,
                                    sides: (specObj && (specObj['인쇄면'] || specObj['sides'])) || null,
                                    basePrint: pricingObj.basePrint,
                                    oshiCost: pricingObj.oshiCost,
                                    supplyRaw: pricingObj.supplyRaw,
                                    totalRaw: pricingObj.totalRaw,
                                    totalRounded: pricingObj.totalRounded,
                                    roundingUnit: pricingObj.roundingUnit,
                                    roundingDiff: pricingObj.roundingDiff,
                                };
                            }
                            return null;
                        })();

                        if (isPrintItem && dp) {
                            const r = (n) => Math.round(Number(n || 0)).toLocaleString();
                            const hasMoney = (v) => v !== undefined && v !== null && Number(v) !== 0;
                            const sidesText = (dp.sides === 2 || String(dp.sides).includes('양면')) ? '양면(2면)' : '단면(1면)';
                            const mulText = (dp.mul != null && !isNaN(dp.mul)) ? Number(dp.mul).toFixed(3) : (dp.mul != null ? String(dp.mul) : '-');
                            const qtyText = (item.quantity != null) ? `${Number(item.quantity).toLocaleString()}매` : '-';
                            const unitPriceText = (dp.unitPrice != null) ? `${r(dp.unitPrice)}원` : '-';

                            const groupHeader = (title, icon, tone) => `
                                <tr class="${tone}">
                                    <td class="py-2 px-3 font-extrabold text-slate-800" colspan="3">
                                        ${icon} ${title}
                                    </td>
                                </tr>
                            `;

                            const row = (label, value, note='') => `
                                <tr class="bg-white">
                                    <td class="py-2.5 px-3 text-slate-600 font-bold">${label}</td>
                                    <td class="py-2.5 px-3 text-right text-slate-900 font-extrabold">${value}</td>
                                    <td class="py-2.5 px-3 text-right text-slate-400 text-xs">${note}</td>
                                </tr>
                            `;

                            html += `
                                <div class="mt-6 pt-5 border-t border-dashed border-slate-300">
                                    <div class="flex items-center justify-between mb-3">
                                        <h5 class="font-extrabold text-slate-800 text-base">💰 금액 산출 내역</h5>
                                        <span class="text-[11px] font-bold text-slate-500">단가/배율/후가공/합계</span>
                                    </div>

                                    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                        <table class="w-full text-xs md:text-sm text-left">
                                            <thead class="bg-slate-100 text-slate-700 border-b">
                                                <tr>
                                                    <th class="py-2 px-3">항목</th>
                                                    <th class="py-2 px-3 text-right">값</th>
                                                    <th class="py-2 px-3 text-right">비고</th>
                                                </tr>
                                            </thead>
                                            <tbody class="divide-y divide-slate-100">
                                                ${groupHeader('단가 / 배율', '🧾', 'bg-emerald-50/70')}
                                                ${row('기준 출력단가(A4·1면·200g)', unitPriceText, '단가관리 기준')}
                                                ${row('사이즈 계수', mulText, '면적/규격 계수')}
                                                ${row('인쇄면', sidesText, '')}
                                                ${row('수량', qtyText, '')}

                                                ${groupHeader('후가공 / 옵션', '🛠️', 'bg-amber-50/70')}
                                                ${hasMoney(dp.oshiCost) ? row('오시비', `${r(dp.oshiCost)}원`, (dp.oshiLines ? `${dp.oshiLines}줄` : '')) : row('오시', '없음', '')}

                                                ${groupHeader('합계', '🧮', 'bg-slate-50')}
                                                ${hasMoney(dp.basePrint) ? row('출력비', `${r(dp.basePrint)}원`, '') : ''}
                                                ${hasMoney(dp.totalRaw) ? row('반올림 전 합계', `${r(dp.totalRaw)}원`, '') : ''}
                                                ${(dp.totalRaw != null && dp.totalRounded != null) ? row('천원단위 반올림', `${r(dp.totalRounded)}원`, `${r(dp.totalRaw)}원 → ${r(dp.totalRounded)}원`) : ''}
                                                ${(dp.roundingDiff != null && Number(dp.roundingDiff) !== 0) ? row('반올림 차이', `${r(dp.roundingDiff)}원`, '') : ''}
                                                ${(pricingObj && pricingObj.supply != null) ? row('공급가액', `${r(pricingObj.supply)}원`, '') : ''}
                                                ${(pricingObj && pricingObj.vat != null) ? row('부가세(10%)', `${r(pricingObj.vat)}원`, '') : ''}
                                                ${row('항목 소계', `${r(item.itemTotal || dp.totalRounded || dp.total || dp.totalPrice || 0)}원`, '해당 항목 합계')}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>`;
                        }
                    }


                    // 요청사항
                    if (item.remarks) {
                        html += `<div class="mt-4 bg-red-50 p-3 rounded-lg border border-red-100"><h5 class="font-bold text-red-600 text-sm mb-1"><i class="fas fa-comment-dots mr-1"></i>요청사항</h5><p class="text-sm text-slate-700 whitespace-pre-wrap">${s(item.remarks)}</p></div>`;
                    }

                    // 금액 산출 내역
                    if (breakdown && (quote.productType === 'book' || item.productType === 'book')) {
                        const r = (n) => Math.round(n).toLocaleString();
                        html += `<div class="mt-6 pt-4 border-t border-dashed border-slate-300">
                            <h5 class="font-bold text-slate-700 text-sm mb-3">💰 금액 산출 내역</h5>
                            <table class="w-full text-xs md:text-sm text-left text-slate-600">
                                <thead class="bg-slate-100 text-slate-700 border-b"><tr><th class="py-2 px-2">항목</th><th class="py-2 px-2 text-right">계산식</th><th class="py-2 px-2 text-right">금액</th></tr></thead>
                                <tbody class="divide-y divide-slate-100">`;
                        
                        if (breakdown.cover) html += `<tr><td class="py-2 px-2">표지</td><td class="py-2 px-2 text-right">${r(breakdown.cover.unitPrice)}원 × ${item.quantity}</td><td class="py-2 px-2 text-right font-medium">${r(breakdown.cover.amount)}원</td></tr>`;
                        if (Array.isArray(breakdown.inners)) breakdown.inners.forEach(inn => html += `<tr><td class="py-2 px-2">내지 #${inn.index}</td><td class="py-2 px-2 text-right">${r(inn.unitPricePerPage)}원 × ${inn.pages}p × ${item.quantity}</td><td class="py-2 px-2 text-right font-medium">${r(inn.amount)}원</td></tr>`);
                        if (breakdown.interleaf) html += `<tr><td class="py-2 px-2">간지</td><td class="py-2 px-2 text-right">${r(breakdown.interleaf.unitPrice)}원 × ${(breakdown.interleaf.sheets * item.quantity).toLocaleString()}장</td><td class="py-2 px-2 text-right font-medium">${r(breakdown.interleaf.amount)}원</td></tr>`;
                        if (breakdown.binding) html += `<tr><td class="py-2 px-2">제본</td><td class="py-2 px-2 text-right">${r(breakdown.binding.unitPrice)}원 × ${item.quantity}</td><td class="py-2 px-2 text-right font-medium">${r(breakdown.binding.amount)}원</td></tr>`;
                        if (breakdown.etc) {
                            if (breakdown.etc.coverDesign) html += `<tr><td class="py-2 px-2">디자인</td><td class="py-2 px-2 text-right">고정비</td><td class="py-2 px-2 text-right font-medium">${r(breakdown.etc.coverDesign)}원</td></tr>`;
                            if (breakdown.etc.coverOshi) html += `<tr><td class="py-2 px-2">오시</td><td class="py-2 px-2 text-right">후가공</td><td class="py-2 px-2 text-right font-medium">${r(breakdown.etc.coverOshi)}원</td></tr>`;
                        }
                        
                        const itemTotal = item.itemTotal || breakdown.itemTotal || (item.unitPrice * item.quantity);
                        html += `<tr class="bg-slate-50 font-bold text-slate-900 border-t border-slate-300"><td class="py-2 px-2" colspan="2">항목 소계</td><td class="py-2 px-2 text-right text-brand-600">${r(itemTotal)}원</td></tr></tbody></table></div>`;
                    }
                    html += `</div></div>`;
                });
            }

            // 최종 합계
            html += `<div class="bg-slate-800 text-white p-6 rounded-xl shadow-lg mt-8">
                <h4 class="text-lg font-bold border-b border-slate-600 pb-3 mb-4">최종 결제 금액</h4>
                <div class="space-y-2 text-sm md:text-base">
                    <div class="flex justify-between"><span class="text-slate-400">공급가액</span><span>${Math.round(quote.supplyPrice||0).toLocaleString()}원</span></div>
                    <div class="flex justify-between"><span class="text-slate-400">부가세 (10%)</span><span>${Math.round(quote.vat||0).toLocaleString()}원</span></div>
                    <div class="border-t border-slate-600 pt-3 mt-2 flex justify-between items-center"><span class="text-xl font-bold">총 합계</span><span class="text-2xl font-extrabold text-brand-400">${Math.round(quote.finalPrice||0).toLocaleString()}원</span></div>
                </div></div>`;
                
            return html;
        }

        // --- 상세 모달 ---
        function showDetailsModal(quoteId) {
            currentQuoteId = quoteId;
            markNewSeen(quoteId);
            const quote = quotesCache.find(q => q.id === quoteId);
            if(!quote) return;

            DOMElements.modalTitle.textContent = `'${quote.orderName}' 상세 정보`;
            DOMElements.modalContent.innerHTML = generateDetailedSpecsHtml(quote);

            // 접수 첨부파일 삭제(스토리지 + Firestore attachments 필드 동기화)
            try {
                DOMElements.modalContent.querySelectorAll('.delete-attachment-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const path = btn.getAttribute('data-path') || '';
                        const url = btn.getAttribute('data-url') || '';
                        const ok = await showConfirmation('첨부파일 삭제', '해당 첨부파일을 삭제할까요?\n(스토리지 파일도 함께 삭제됩니다)');
                        if (!ok) return;
                        btn.disabled = true;
                        const old = btn.textContent;
                        btn.textContent = '삭제중...';
                        await deleteQuoteAttachment(quoteId, { path, url });
                        btn.textContent = old;
                        btn.disabled = false;
                        // UI 갱신
                        await loadQuotes();
                        const updated = quotesCache.find(q => q.id === quoteId);
                        if (updated) {
                            DOMElements.modalContent.innerHTML = generateDetailedSpecsHtml(updated);
                        }
                    });
                });
            } catch (e) { logger.warn('attach delete bind failed', e); }

            // 비회원 연락처 토글(상세보기에서 기본 마스킹)
            const phoneToggleBtn = document.getElementById('guest-phone-toggle');
            if (phoneToggleBtn) {
                phoneToggleBtn.addEventListener('click', () => {
                    const display = document.getElementById('guest-phone-display');
                    if (!display) return;
                    const shown = phoneToggleBtn.getAttribute('data-shown') === '1';
                    if (shown) {
                        display.textContent = phoneToggleBtn.getAttribute('data-masked') || '';
                        phoneToggleBtn.textContent = '번호보기';
                        phoneToggleBtn.setAttribute('data-shown', '0');
                    } else {
                        display.textContent = phoneToggleBtn.getAttribute('data-full') || '';
                        phoneToggleBtn.textContent = '숨기기';
                        phoneToggleBtn.setAttribute('data-shown', '1');
                    }
                });
            }

            DOMElements.detailsModal.classList.remove('hidden');
            
            listenToMessages(quoteId);
            loadMemo(quoteId);
            loadFiles(quoteId); // 파일 탭 로드

            if (quote.hasUnreadAdminMessage) {
                updateDoc(doc(db, "quotes", quoteId), { hasUnreadAdminMessage: false });
            }
        }

        // --- 채팅 ---
        function listenToMessages(quoteId) {
            if (unsubscribeMessages) unsubscribeMessages();
            const q = query(collection(db, `quotes/${quoteId}/messages`), orderBy("timestamp"));
            
            unsubscribeMessages = onSnapshot(q, (snap) => {
                const container = DOMElements.chatMessages;
                container.innerHTML = '';
                
                snap.forEach(doc => {
                    const msg = doc.data();
                    const isAdmin = msg.sender === 'admin';
                    const div = document.createElement('div');
                    div.className = `flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`;
                    
                    let content = '';
                    if(msg.type === 'file') {
                        // 파일 클릭 시 “새창 열기” 대신 강제 다운로드(저장)로 통일
                        const safeName = sanitizeHTML(msg.fileName || 'download');
                        content = `<a href="${msg.fileURL}" data-force-download="1" download="${safeName}" class="flex items-center gap-2 underline"><i class="fas fa-file"></i> ${safeName}</a>`;
                    } else {
                        content = sanitizeHTML(msg.text);
                    }
                    
                    div.innerHTML = `<div class="chat-bubble ${isAdmin ? 'chat-bubble-admin' : 'chat-bubble-customer'}">${content}</div>
                                     <span class="text-[10px] text-slate-400 mt-1 px-1">${msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</span>`;
                    container.appendChild(div);
                });
                container.scrollTop = container.scrollHeight;
            });
        }

        async function sendMessage(text, fileData = null, isProof = false) {
            if(!currentQuoteId) return;
            const data = {
                sender: 'admin',
                timestamp: serverTimestamp(),
                text: text || '',
                type: fileData ? 'file' : 'text'
            };
            if(fileData) {
                data.fileName = fileData.name;
                data.fileURL = fileData.url;
                data.filePath = fileData.path;
                if(isProof) {
                    data.isProof = true;
                    data.proofStatus = 'pending';
                }
            }
            
            await addDoc(collection(db, `quotes/${currentQuoteId}/messages`), data);
            await updateDoc(doc(db, "quotes", currentQuoteId), { hasUnreadCustomerMessage: true });
            
            // Reset UI
            document.getElementById('chat-input').value = '';
            completedFileInfo = null;
            document.getElementById('upload-progress-container').classList.add('hidden');
            document.getElementById('is-proof-checkbox').checked = false;
        }

        // --- 파일 업로드 로직 ---
        document.getElementById('attach-file-btn')?.addEventListener('click', () => document.getElementById('file-input').click());
        document.getElementById('file-input')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            // 업로드 제한(규칙과 동일): 300MB / 주요 문서·이미지·압축 파일만 허용
            const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
            const ext = (file?.name?.split('.').pop() || '').toLowerCase();
            const allowedExt = ['pdf','jpg','jpeg','png','gif','webp','zip','doc','docx','xls','xlsx','ppt','pptx','hwp','heic'];
            if (file.size > MAX_UPLOAD_BYTES) {
                showToast(`파일 용량이 너무 큽니다. 최대 ${Math.floor(MAX_UPLOAD_BYTES/1024/1024)}MB까지 업로드 가능합니다.`, 'error');
                e.target.value = '';
                container.classList.add('hidden');
                return;
            }
            if (file.type && !(file.type.startsWith('image/') || ['application/pdf','application/zip','application/x-zip-compressed',
                'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/octet-stream'].includes(file.type))) {
                showToast('허용되지 않은 파일 형식입니다. (pdf/이미지/zip/docx/xlsx/pptx 등)', 'error');
                e.target.value = '';
                container.classList.add('hidden');
                return;
            }
            if (!file.type && ext && !allowedExt.includes(ext)) {
                showToast('허용되지 않은 파일 확장자입니다. (pdf/이미지/zip/docx/xlsx/pptx 등)', 'error');
                e.target.value = '';
                container.classList.add('hidden');
                return;
            }

            if(!file) return;
            
            const container = document.getElementById('upload-progress-container');
            const nameEl = document.getElementById('upload-file-name');
            const bar = document.getElementById('upload-progress-bar');
            
            container.classList.remove('hidden');
            nameEl.textContent = file.name;
            bar.style.width = '0%';
            
            const storageRef = ref(storage, `quotes/${currentQuoteId}/admin/${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);
            
            uploadTask.on('state_changed', 
                (snap) => {
                    const percent = (snap.bytesTransferred / snap.totalBytes) * 100;
                    bar.style.width = percent + '%';
                },
                (err) => {
                    showToast('업로드 실패', 'error');
                    container.classList.add('hidden');
                },
                async () => {
                    const url = await getDownloadURL(uploadTask.snapshot.ref);
                    completedFileInfo = { name: file.name, url: url, path: uploadTask.snapshot.ref.fullPath };
                    nameEl.textContent = "업로드 완료 (전송 버튼을 눌러주세요)";
                }
            );
        });

        document.getElementById('chat-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = document.getElementById('chat-input').value.trim();
            if(!text && !completedFileInfo) return;
            
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            await sendMessage(text, completedFileInfo, document.getElementById('is-proof-checkbox').checked);
            btn.disabled = false;
        });

        // --- 기타 기능 (메모, 파일목록) ---
        async function loadMemo(quoteId) {
            const docRef = doc(db, "quotes", quoteId);
            const snap = await getDoc(docRef);
            const list = document.getElementById('memo-list');
            list.innerHTML = '';
            
            if(snap.exists() && snap.data().adminMemos) {
                const memos = snap.data().adminMemos;
                if (memos.length === 0) {
                    list.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">등록된 메모가 없습니다.</p>';
                    return;
                }

                memos.forEach((m, index) => {
                    const div = document.createElement('div');
                    // group 클래스 추가 (hover시 버튼 보이기 위해)
                    div.className = "bg-yellow-100 p-3 rounded text-sm text-yellow-900 border border-yellow-200 shadow-sm relative group";
                    div.innerHTML = `
                        <div class="whitespace-pre-wrap">${sanitizeHTML(m.text)}</div>
                        <div class="text-[10px] text-yellow-600 mt-1 text-right">${m.createdAt ? new Date(m.createdAt.seconds ? m.createdAt.toDate() : m.createdAt).toLocaleString('ko-KR') : ''}</div>
                        
                        <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-yellow-100/80 backdrop-blur-sm rounded">
                            <button class="edit-memo-btn w-6 h-6 flex items-center justify-center rounded bg-white text-blue-500 hover:text-blue-700 shadow-sm border border-yellow-200" data-index="${index}" title="수정"><i class="fas fa-pen text-xs"></i></button>
                            <button class="delete-memo-btn w-6 h-6 flex items-center justify-center rounded bg-white text-red-500 hover:text-red-700 shadow-sm border border-yellow-200" data-index="${index}" title="삭제"><i class="fas fa-trash text-xs"></i></button>
                        </div>
                    `;
                    list.appendChild(div);
                });
            } else {
                list.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">등록된 메모가 없습니다.</p>';
            }
        }

// ── 첨부파일 목록 불러오기 ─────────────────────────────────────
// 특정 견적의 채팅 메시지에서 파일 타입을 찾아 파일 탭에 표시
function loadFiles(quoteId) {
            if (unsubscribeFiles) unsubscribeFiles(); // 기존 리스너 해제

            const list = document.getElementById('file-list');
            list.innerHTML = ''; // 초기화

            // 메시지 중 type이 'file'인 것만 실시간 조회
            const q = query(collection(db, `quotes/${quoteId}/messages`), where("type", "==", "file"), orderBy("timestamp", "desc"));
            
            unsubscribeFiles = onSnapshot(q, (snap) => {
                list.innerHTML = '';
                if (snap.empty) {
                    list.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">업로드된 파일이 없습니다.</p>';
                    return;
                }

                snap.forEach(doc => {
                    const file = doc.data();
                    const div = document.createElement('div');
                    div.className = "flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors mb-2";
                    
                    div.innerHTML = `
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="w-8 h-8 rounded bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-file"></i>
                            </div>
                            <div class="flex flex-col overflow-hidden">
                                <a href="${file.fileURL}" data-force-download="1" download="${sanitizeHTML(file.fileName)}" class="text-sm font-bold text-slate-700 hover:text-brand-600 truncate transition-colors">
                                    ${sanitizeHTML(file.fileName)}
                                </a>
                                <span class="text-[10px] text-slate-400">
                                    ${file.sender === 'admin' ? '관리자' : '고객'} • ${file.timestamp ? file.timestamp.toDate().toLocaleString() : ''}
                                </span>
                            </div>
                        </div>
                        <button class="delete-file-only-btn text-slate-300 hover:text-red-500 transition-colors p-2" title="파일 삭제" data-id="${doc.id}" data-path="${file.filePath || ''}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    `;
                    list.appendChild(div);
                });

                // 파일 개수 배지 업데이트
                const badge = document.getElementById('files-count-badge');
                if (badge) badge.textContent = snap.empty ? '파일' : `파일 ${snap.size}`;
                const emptyEl = document.getElementById('file-list-empty');
                if (emptyEl) emptyEl.classList.toggle('hidden', !snap.empty);

                // 파일 삭제 버튼 이벤트 연결
                list.querySelectorAll('.delete-file-only-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        if(!confirm('이 파일을 삭제하시겠습니까? (채팅 내역에서도 사라집니다)')) return;
                        const msgId = btn.dataset.id;
                        const path = btn.dataset.path;
                        try {
                            // 메시지 문서 삭제
                            await deleteDoc(doc(db, `quotes/${quoteId}/messages`, msgId));
                            // Storage 파일 삭제
                            if(path) {
                                try { await deleteObject(ref(storage, path)); } catch(err) { logger.warn('Storage delete fail', err); }
                            }
                            showToast('파일이 삭제되었습니다.', 'success');
                        } catch(err) {
                            logger.error(err);
                            showToast('삭제 실패', 'error');
                        }
                    });
                });
            });
        }

        // [추가] 메모 리스트 클릭 이벤트 (수정/삭제 처리)
        document.getElementById('memo-list')?.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-memo-btn');
            const deleteBtn = e.target.closest('.delete-memo-btn');
            
            if (!currentQuoteId) return;

            // 삭제 기능
            if (deleteBtn) {
                if (!confirm("이 메모를 삭제하시겠습니까?")) return;
                
                try {
                    const index = parseInt(deleteBtn.dataset.index);
                    const docRef = doc(db, "quotes", currentQuoteId);
                    const snap = await getDoc(docRef);
                    let memos = snap.data().adminMemos || [];
                    
                    memos.splice(index, 1); // 배열에서 해당 인덱스 삭제
                    
                    await updateDoc(docRef, { adminMemos: memos });
                    loadMemo(currentQuoteId); // 목록 새로고침
                    showToast("메모가 삭제되었습니다.", "success");
                } catch(err) {
                    logger.error(err);
                    showToast("삭제 중 오류가 발생했습니다.", "error");
                }
            }

            // 수정 기능
            if (editBtn) {
                const index = parseInt(editBtn.dataset.index);
                const docRef = doc(db, "quotes", currentQuoteId);
                const snap = await getDoc(docRef);
                let memos = snap.data().adminMemos || [];
                const currentText = memos[index].text;

                const newText = prompt("메모 내용을 수정하세요:", currentText);
                if (newText === null) return; // 취소 시
                if (newText.trim() === "") {
                    alert("내용을 입력해주세요.");
                    return;
                }

                try {
                    memos[index].text = newText; // 내용 업데이트
                    // 날짜는 유지하거나, 수정일로 바꿀 수 있음. 여기선 유지.
                    
                    await updateDoc(docRef, { adminMemos: memos });
                    loadMemo(currentQuoteId); // 목록 새로고침
                    showToast("메모가 수정되었습니다.", "success");
                } catch(err) {
                    logger.error(err);
                    showToast("수정 중 오류가 발생했습니다.", "error");
                }
            }
        });

        document.getElementById('memo-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = document.getElementById('memo-input').value.trim();
            if(!text || !currentQuoteId) return;
            
            const docRef = doc(db, "quotes", currentQuoteId);
            const memo = { text, createdAt: new Date() };
            
            const snap = await getDoc(docRef);
            let memos = snap.data().adminMemos || [];
            memos.push(memo);
            
            await updateDoc(docRef, { adminMemos: memos });
            document.getElementById('memo-input').value = '';
            loadMemo(currentQuoteId);
        });

        // --- 문의 관리 ---
        function listenToInquiries() {
            const q = query(collection(db, "qna"), orderBy("createdAt", "desc"));
            onSnapshot(q, (snap) => {
                let hasNewInquiry = false;
                if (!isInitialInquiriesSnapshot) {
                    snap.docChanges().forEach((ch) => {
                        if (ch.type === 'added') hasNewInquiry = true;
                    });
                }
                inquiriesCache = snap.docs.map(d => ({id:d.id, ...d.data()}));
                renderInquiries();

                // 1:1 문의가 새로 접수되면 inquiry.mp3 알림
                if (hasNewInquiry) {
                    safePlay(document.getElementById('inquiry-sound'), 'inquiry', 1200);
                }
                isInitialInquiriesSnapshot = false;
            });
        }

        function renderInquiries() {
            const tbody = document.getElementById('inquiry-list-body');
            tbody.innerHTML = '';
            if(inquiriesCache.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-400">문의 내역이 없습니다.</td></tr>';
                return;
            }
            inquiriesCache.forEach(qna => {
                const tr = document.createElement('tr');
                const isAnswered = (qna.status === 'answered' || qna.status === '답변완료');
                const statusText = isAnswered ? '답변완료' : '대기중';
                const statusClass = isAnswered ? 'bg-slate-100 text-slate-500' : 'bg-red-50 text-red-600 font-bold';
                const dateStr = qna.createdAt ? qna.createdAt.toDate().toLocaleDateString('ko-KR') : '-';

                tr.className = `border-b border-slate-100 hover:bg-slate-50 transition-colors ${!isAnswered ? 'bg-red-50/10' : ''}`;
                tr.innerHTML = `
                    <td class="px-6 py-4 text-xs text-slate-500">${dateStr}</td>
                    <td class="px-6 py-4 font-bold text-slate-700">${sanitizeHTML(qna.name)}</td>
                    <td class="px-6 py-4 text-slate-600 truncate max-w-xs">${sanitizeHTML(qna.title)}</td>
                    <td class="px-6 py-4 text-center"><span class="px-2 py-1 rounded text-[10px] ${statusClass}">${statusText}</span></td>
                    <td class="px-6 py-4 text-center flex justify-center gap-2">
                        <button class="view-inquiry-btn btn btn-sm bg-white border border-slate-200 hover:bg-brand-50 hover:text-brand-600 text-slate-500" data-id="${qna.id}">${isAnswered ? '수정' : '답변'}</button>
                        <button class="delete-inquiry-btn btn btn-sm bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-500" data-id="${qna.id}">삭제</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

    // ========================================================
    // [수정] 홈페이지 콘텐츠 관리 (공지사항 & 포트폴리오)
    // ========================================================

    // 1. 데이터 로드 통합 함수
    async function loadHomepageContent() {
        try {
            // 포트폴리오 데이터 로드
            const docRef = doc(db, "settings", "homepageContent");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                homepageContentCache = docSnap.data();
            } else {
                homepageContentCache = { portfolio: [] };
            }
            renderPortfolioListAdmin();
        } catch (error) {
            logger.error("홈페이지 콘텐츠 로딩 실패:", error);
        }
    }

    // 2. 공지사항 실시간 리스너
    function listenToNotices() {
        const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            const notices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderNoticeListAdmin(notices);
        });
    }

    // 3. 공지사항 렌더링 함수
    function renderNoticeListAdmin(notices) {
        const list = document.getElementById('notice-list-admin');
        list.innerHTML = '';
        
        if (!notices || notices.length === 0) {
            list.innerHTML = '<p class="text-center py-4 text-slate-400 text-sm">등록된 공지사항이 없습니다.</p>';
            return;
        }

        notices.forEach(n => {
            const div = document.createElement('div');
            // 마우스 오버 시에만 버튼이 나타나도록 'group' 클래스 추가
            div.className = "flex flex-col gap-3 p-4 border border-slate-200 rounded-lg bg-white mb-2 shadow-sm hover:border-brand-300 transition-colors";
div.innerHTML = `
    <div>
        <div class="font-bold text-sm text-slate-800 mb-1 leading-snug line-clamp-2">
            ${n.isImportant ? '<span class="text-red-500 text-[10px] border border-red-200 bg-red-50 px-1 py-0.5 rounded mr-1">중요</span>' : ''}
            ${n.isPopup ? '<span class="text-brand-600 text-[10px] border border-brand-200 bg-brand-50 px-1 py-0.5 rounded mr-1">팝업</span>' : ''}
            ${sanitizeHTML(n.title)}
        </div>
        <div class="text-[11px] text-slate-400">
            ${n.createdAt ? n.createdAt.toDate().toLocaleDateString('ko-KR') : '-'}
        </div>
    </div> 
    <div class="flex gap-2 justify-end pt-2 border-t border-slate-100">
        <button class="btn btn-secondary btn-sm edit-notice-btn text-xs px-3 py-1" data-id="${n.id}">수정</button>
        <button class="btn btn-danger btn-sm delete-notice-btn text-xs px-3 py-1" data-id="${n.id}">삭제</button>
    </div>`;
            list.appendChild(div);
        });
    }

    // 4. 포트폴리오 렌더링 함수 (매우 중요: ID 및 클래스명 복구)
    function renderPortfolioListAdmin() {
        const list = document.getElementById('portfolio-list-admin');
        if (!list) return;
        
        list.innerHTML = '';
        const portfolio = homepageContentCache.portfolio || [];

        portfolio.forEach((p, idx) => {
            const div = document.createElement('div');
            // 디자인은 유지하되, 기능 동작을 위한 클래스(.portfolio-item 등) 유지
            div.className = "portfolio-item bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col";
            div.dataset.index = idx;
            
            const imgUrl = p.imageUrl || 'https://placehold.co/150?text=No+Image';
            
            div.innerHTML = `
                <div class="relative w-full h-44 bg-slate-100 overflow-hidden group">
                    <img src="${sanitizeHTML(imgUrl)}" class="w-full h-full object-cover portfolio-image-preview">
                    <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" class="text-white text-xs font-bold change-image-btn border border-white px-3 py-2 rounded-lg hover:bg-white hover:text-black transition-colors">
                            이미지 변경
                        </button>
                    </div>
                    <input type="file" class="hidden portfolio-image-upload" accept="image/*">
                </div>

                <div class="p-4 flex flex-col gap-3 min-w-0">
                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 mb-1">제목</label>
                        <input type="text" class="form-input w-full portfolio-title" disabled value="${sanitizeHTML(p.title || '')}" placeholder="프로젝트 제목">
                    </div>

                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 mb-1">설명</label>
                        <textarea class="form-textarea w-full text-xs portfolio-description" disabled rows="3" placeholder="프로젝트 설명">${sanitizeHTML(p.description || '')}</textarea>
                    </div>

                    <div class="mt-1 flex gap-2">
                        <button type="button" class="btn flex-1 bg-white border border-slate-200 hover:bg-brand-50 hover:text-brand-700 text-slate-600 edit-portfolio-btn">
                            <i class="fas fa-pen mr-1"></i>수정
                        </button>
                        <button type="button" class="btn flex-1 bg-brand-600 hover:bg-brand-700 text-white save-portfolio-item-btn hidden">
                            <i class="fas fa-save mr-1"></i>저장
                        </button>
                        <button type="button" class="btn bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-600 remove-portfolio-btn" title="삭제">
                            <i class="fas fa-trash-alt mr-1"></i>삭제
                        </button>
                    </div>
                    </div>
                </div>
            `;
            list.appendChild(div);
        });
    }

    // 5. 공지사항 저장 이벤트 핸들러
    function sanitizeNoticeHtml(html) {
    try {
        const allowedTags = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
        const allowedAttrs = {
            'A': new Set(['href','target','rel']),
            'SPAN': new Set(['style']),
            'P': new Set(['style']),
            'DIV': new Set(['style']),
            'LI': new Set(['style']),
            'UL': new Set(['style']),
            'OL': new Set(['style']),
            'BLOCKQUOTE': new Set(['style'])
        };
        const allowedStyleProps = new Set(['font-size','text-align','font-weight','font-style','text-decoration']);

        const docx = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
        const root = docx.body.firstElementChild;

        const walk = (node) => {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const tag = child.tagName.toUpperCase();

                    // remove disallowed tags but keep their text
                    if (!allowedTags.has(tag)) {
                        const frag = docx.createDocumentFragment();
                        while (child.firstChild) frag.appendChild(child.firstChild);
                        child.replaceWith(frag);
                        continue;
                    }

                    // strip attributes
                    const attrsAllowed = allowedAttrs[tag] || new Set();
                    for (const attr of Array.from(child.attributes)) {
                        const name = attr.name.toLowerCase();
                        if (!attrsAllowed.has(attr.name) && !attrsAllowed.has(name)) {
                            child.removeAttribute(attr.name);
                            continue;
                        }

                        // href safety
                        if (tag === 'A' && name === 'href') {
                            const href = (child.getAttribute('href') || '').trim();
                            if (!href || href.startsWith('javascript:') || href.startsWith('data:')) {
                                child.removeAttribute('href');
                            } else {
                                child.setAttribute('target', '_blank');
                                child.setAttribute('rel', 'noopener noreferrer');
                            }
                        }

                        // style whitelist
                        if (name === 'style') {
                            const styles = (child.getAttribute('style') || '')
                                .split(';')
                                .map(s => s.trim())
                                .filter(Boolean);
                            const safe = [];
                            for (const s of styles) {
                                const [kRaw, vRaw] = s.split(':');
                                if (!kRaw || !vRaw) continue;
                                const k = kRaw.trim().toLowerCase();
                                const v = vRaw.trim();
                                if (!allowedStyleProps.has(k)) continue;
                                // basic value filter
                                if (/expression\(|url\(|javascript:/i.test(v)) continue;
                                safe.push(`${k}: ${v}`);
                            }
                            if (safe.length) child.setAttribute('style', safe.join('; '));
                            else child.removeAttribute('style');
                        }
                    }

                    walk(child);
                } else if (child.nodeType === Node.COMMENT_NODE) {
                    child.remove();
                }
            }
        };
        walk(root);

        return root.innerHTML || '';
    } catch (e) {
        logger.warn('sanitizeNoticeHtml failed', e);
        return '';
    }
}

function getNoticeEditorPayload() {
    const editor = document.getElementById('notice-content-editor');
    const hidden = document.getElementById('notice-content'); // legacy
    const htmlRaw = (editor?.innerHTML || '').trim();
    const textRaw = (editor?.innerText || '').trim();
    if (hidden) hidden.value = textRaw;
    return {
        contentHtml: sanitizeNoticeHtml(htmlRaw),
        contentText: textRaw
    };
}

async function handleNoticeSave(e) {
    e.preventDefault();
    const id = document.getElementById('notice-id').value;

    const { contentHtml, contentText } = getNoticeEditorPayload();

    const payload = {
        title: document.getElementById('notice-title').value,
        content: contentText,          // backward compatible (old index)
        contentHtml: contentHtml,      // rich content (new index)
        isImportant: document.getElementById('notice-isImportant').checked,
        isPopup: document.getElementById('notice-isPopup')?.checked || false,
        createdAt: serverTimestamp()
    };

    const btn = document.getElementById('save-notice-btn');
    btn.disabled = true;

    try {
        let savedId = id;

        if (id) {
            delete payload.createdAt; // 수정 시 날짜 유지
            await updateDoc(doc(db, "notices", id), payload);
            showToast('공지사항이 수정되었습니다.', 'success');
        } else {
            const newRef = await addDoc(collection(db, "notices"), payload);
            savedId = newRef.id;
            showToast('새 공지사항이 등록되었습니다.', 'success');
        }

        // ✅ 팝업 공지는 1개만 유지 (관리 효율 + 중복 팝업 방지)
        if (payload.isPopup) {
            const qPop = query(collection(db, "notices"), where("isPopup", "==", true));
            const snap = await getDocs(qPop);
            const batch = writeBatch(db);
            snap.forEach(d => {
                if (d.id !== savedId) batch.update(d.ref, { isPopup: false });
            });
            await batch.commit();
        }

        document.getElementById('notice-form').reset();
        document.getElementById('notice-id').value = '';
        const editor = document.getElementById('notice-content-editor');
        if (editor) editor.innerHTML = '';
    } catch (err) {
        logger.error(err);
        showToast('저장 중 오류 발생', 'error');
    } finally {
        btn.disabled = false;
    }
}

// 6. 포트폴리오 저장 로직
    async function handlePortfolioSave() {
        const newPortfolio = [];
        // DOM에서 현재 입력된 값들을 모두 읽어옴
        document.querySelectorAll('.portfolio-item').forEach(el => {
            newPortfolio.push({
                imageUrl: el.querySelector('img').src,
                title: el.querySelector('.portfolio-title').value,
                description: el.querySelector('.portfolio-description').value
            });
        });
        
        homepageContentCache.portfolio = newPortfolio;
        
        const btn = document.getElementById('save-portfolio-content');
        const originalText = btn.textContent;
        btn.textContent = "저장 중...";
        btn.disabled = true;

        try {
            await setDoc(doc(db, "settings", "homepageContent"), homepageContentCache, {merge: true});
            showToast('포트폴리오가 저장되었습니다.', 'success');
            renderPortfolioListAdmin(); // 목록 재렌더링
        } catch(err) {
            logger.error(err);
            showToast('저장 실패', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

        // 문의 답변 처리
        document.getElementById('inquiry-list-body')?.addEventListener('click', async (e) => {
            const viewBtn = e.target.closest('.view-inquiry-btn');
            const delBtn = e.target.closest('.delete-inquiry-btn');
            
            if(viewBtn) {
                const qna = inquiriesCache.find(i => i.id === viewBtn.dataset.id);
                document.getElementById('inquiry-modal-id').value = qna.id;
                document.getElementById('inquiry-modal-user').textContent = qna.name;
                document.getElementById('inquiry-modal-date').textContent = qna.createdAt?.toDate().toLocaleString();
                document.getElementById('inquiry-modal-title').textContent = qna.title;
                document.getElementById('inquiry-modal-question').textContent = qna.body || '';
                document.getElementById('inquiry-modal-answer').value = qna.answer || '';
                DOMElements.inquiryDetailsModal.classList.remove('hidden');
            }
            
            if(delBtn) {
                if(await showConfirmation('삭제', '문의 내역을 삭제하시겠습니까?')) {
                    await deleteDoc(doc(db, "qna", delBtn.dataset.id));
                    showToast('삭제되었습니다.', 'success');
                }
            }
        });

        document.getElementById('inquiry-reply-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('inquiry-modal-id').value;
            const answer = document.getElementById('inquiry-modal-answer').value;
            await updateDoc(doc(db, "qna", id), { answer, status: 'answered', answeredAt: serverTimestamp() });
            DOMElements.inquiryDetailsModal.classList.add('hidden');
            showToast('답변이 등록되었습니다.', 'success');
        });

        // FAQ 등록
        document.getElementById('btn-save-as-faq')?.addEventListener('click', async () => {
            const q = document.getElementById('inquiry-modal-title').textContent;
            const a = document.getElementById('inquiry-modal-answer').value;
            if(!a) { showToast('답변을 먼저 입력해주세요.', 'error'); return; }
            
            if(await showConfirmation('FAQ 등록', '이 문의를 자주 묻는 질문(FAQ)에 등록하시겠습니까?')) {
                await addDoc(collection(db, "faq"), { question: q, answer: a, createdAt: serverTimestamp() });
                showToast('FAQ에 등록되었습니다.', 'success');
            }
        });

        // 이미지 관리 (간소화)
        async function loadImagePreviews() {
            try {
                const snap = await getDoc(doc(db, "settings", "imagePreviews"));
                const base = snap.exists() ? (snap.data() || {}) : {};
                const meta = base._meta || {};

                // 레거시 호환: 과거에 settings/imagePreviews.paper 에 저장된 경우가 있어,
                // 새 구조(coverPaper/innerPaper)가 없거나 일부만 있을 때 병합해서 보여주고,
                // 가능하면 새 구조로 자동 마이그레이션합니다.
                const legacyPaper = (base.paper && typeof base.paper === 'object') ? base.paper : null;

                const coverPaper = (base.coverPaper && typeof base.coverPaper === 'object') ? base.coverPaper : {};
                const innerPaper = (base.innerPaper && typeof base.innerPaper === 'object') ? base.innerPaper : {};

                const mergedCover = legacyPaper ? ({ ...legacyPaper, ...coverPaper }) : coverPaper;
                const mergedInner = legacyPaper ? ({ ...legacyPaper, ...innerPaper }) : innerPaper;

                imagePreviewsCache = {
                    coverPaper: mergedCover || {},
                    innerPaper: mergedInner || {},
                    binding: (base.binding && typeof base.binding === 'object') ? base.binding : {},
                    _meta: meta
                };

                // 자동 마이그레이션(베스트 에포트)
                if (legacyPaper && (!base.coverPaper || !base.innerPaper)) {
                    try {
                        await setDoc(doc(db, "settings", "imagePreviews"), {
                            coverPaper: mergedCover || {},
                            innerPaper: mergedInner || {}
                        }, { merge: true });
                    } catch (_) {}
                }

                renderImagePreviews('coverPaper');
                renderImagePreviews('innerPaper');
                renderImagePreviews('binding');
            } catch(e) { logger.error(e); }
        }

        // 이미지 미리보기 값 정규화 (string URL 또는 {url, path} 객체 모두 지원)
        function getPreviewUrl(val) {
            if (!val) return '';
            if (typeof val === 'string') return val;
            if (typeof val === 'object' && val.url) return val.url;
            return '';
        }
        function getPreviewPath(val) {
            if (!val) return '';
            if (typeof val === 'object' && val.path) return val.path;
            return '';
        }

        // [디자인 수정] 이미지 관리 - 세련된 카드 스타일로 변경
        function renderImagePreviews(type) {
            const container = document.getElementById(type + '-previews-tab');
            if(!container) return;

            // 표시할 항목 정의
            const keys = type === 'coverPaper'
                ? [
                    { key: 'snow200', text: '스노우지 200g' },
                    { key: 'snow250', text: '스노우지 250g' },
                    { key: 'arte190', text: '아르떼 190g' }
                ]
                : type === 'innerPaper'
                ? [
                    { key: 'mimoon80', text: '미색모조 80g' }, { key: 'mimoon100', text: '미색모조 100g' },
                    { key: 'baek80', text: '백색모조 80g' }, { key: 'baek100', text: '백색모조 100g' },
                    { key: 'snow120', text: '스노우지 120g' }, { key: 'snow150', text: '스노우지 150g' },
                    
                ]
                : [
                    { key: 'perfect', text: '무선 제본' }, { key: 'wire', text: '와이어 제본' },
                    { key: 'saddle', text: '중철 제본' }, { key: 'none', text: '제본 안함' }
                ];
            


            // 추가 항목(커스텀) - 추후 용지/제본 종류가 늘어나는 것 대비
            const extra = (imagePreviewsCache?._meta?.items?.[type] && Array.isArray(imagePreviewsCache._meta.items[type]))
                ? imagePreviewsCache._meta.items[type]
                : [];
            const customKeySet = new Set(extra.map(x => x?.key).filter(Boolean));
            const exists = new Set(keys.map(x => x.key));
            extra.forEach(it => {
                if (it && it.key && !exists.has(it.key)) {
                    keys.push({ key: it.key, text: it.text || it.key });
                    exists.add(it.key);
                }
            });

            const headerInfo = (t) => {
                if (t === 'coverPaper') return { title: '표지 이미지', hint: '견적페이지의 “표지 용지 미리보기”와 연동됩니다.', icon: 'fa-book', bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' };
                if (t === 'innerPaper') return { title: '내지 이미지', hint: '견적페이지의 “내지 용지 미리보기”와 연동됩니다.', icon: 'fa-layer-group', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' };
                return { title: '제본 이미지', hint: '견적페이지의 제본 미리보기(아이콘)과 연동됩니다.', icon: 'fa-book-medical', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' };
            };
            const hi = headerInfo(type);

            // 해당 타입에 실제 등록된 이미지가 하나도 없으면 “준비중” 안내를 표시
            const hasAnyRealImage = keys.some(it => !!(imagePreviewsCache?.[type]?.[it.key]));

            let html = `
                <div class="p-4 rounded-2xl border ${hi.border} ${hi.bg} mb-5">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <div class="flex items-center gap-2 font-extrabold ${hi.text}">
                                <i class="fas ${hi.icon}"></i>
                                <span>${hi.title}</span>
                            </div>
                            <div class="text-xs text-slate-500 mt-1">${hi.hint}</div>
                            <div class="text-[11px] text-slate-400 mt-1">※ 등록된 것만 견적페이지 미리보기에서 보입니다.</div>
                        </div>
                        <div class="flex items-center gap-2">
                        ${type === 'innerPaper' ? `
                        <button type="button" class="cleanup-legacy-inner-btn btn btn-warning btn-sm" data-type="${type}">
                            <i class="fas fa-broom mr-1"></i>레거시 정리
                        </button>
                        ` : ''}
                        <button type="button" class="add-image-item-btn btn btn-secondary btn-sm" data-type="${type}">
                            <i class="fas fa-plus mr-1"></i>항목 추가
                        </button>
                    </div>
                </div>
                ${hasAnyRealImage ? '' : `
                    <div class="mb-5 p-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-600 flex items-center gap-3">
                        <i class="fas fa-hourglass-half text-slate-400"></i>
                        <div class="text-sm">
                            <div class="font-extrabold">준비중</div>
                            <div class="text-xs text-slate-500 mt-0.5">아직 등록된 이미지가 없습니다. 이미지를 등록하면 견적페이지 미리보기에서 보여요.</div>
                        </div>
                    </div>
                `}
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            `;

            
            keys.forEach(item => {
                const key = item.key;
                const label = item.text;
                const _val = imagePreviewsCache[type]?.[key];
                const url = getPreviewUrl(_val) || 'https://placehold.co/300x200/f1f5f9/94a3b8?text=No+Image';
                const isCustom = customKeySet.has(key);
                
                const badge = (type === 'coverPaper') ? {txt:'표지', cls:'bg-sky-600'} : (type === 'innerPaper') ? {txt:'내지', cls:'bg-amber-600'} : {txt:'제본', cls:'bg-emerald-600'};
                html += `
                    <div class="image-preview-card group relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer">
                        <div class="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                            <div class="absolute top-2 left-2 z-10 px-2 py-1 rounded-full text-[10px] font-extrabold text-white ${badge.cls} shadow">${badge.txt}</div>
                            <div class="absolute top-2 right-2 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button type="button" class="delete-image-btn w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center" title="이미지 삭제" data-type="${type}" data-key="${key}">
                                    <i class="fas fa-eraser text-xs"></i>
                                </button>
                                ${isCustom ? `
                                <button type="button" class="delete-item-btn w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center" title="항목 삭제" data-type="${type}" data-key="${key}">
                                    <i class="fas fa-trash text-xs"></i>
                                </button>
                                ` : ''}
                            </div>
                            <img src="${url}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" id="preview-${type}-${key}">
                            
                            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                <button class="image-upload-btn pointer-events-none px-4 py-2 rounded-full bg-white/20 border border-white/50 text-white text-sm font-bold backdrop-blur-md flex items-center">
                                    <i class="fas fa-camera mr-2"></i>사진 변경
                                </button>
                            </div>
                        </div>
                        
                        <div class="p-4 text-center bg-white relative z-10">
                            <p class="text-sm font-bold text-slate-700 group-hover:text-brand-600 transition-colors">${label}</p>
                            <p class="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-medium">${key}</p>
                        </div>

                        <input type="file" class="hidden image-upload-input" data-type="${type}" data-key="${key}" accept="image/png,image/jpeg,image/jpg,image/webp" onclick="event.stopPropagation()">
                    </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
        }

        // 이미지 카드 클릭 시 파일 선택창 열기 (안전하게 해당 카드의 input을 찾도록 수정)
        document.getElementById('imageManagementModal')?.addEventListener('click', async (e) => {
            // 이미지관리에서 항목 삭제 시 단가관리(settings/unitPriceConfig)에도 자동 반영
            // - coverPaper: book.cover.<paper>_<printType> 삭제
            // - innerPaper: book.inner.upcharges.<paper> 삭제
            async function deleteUnitPriceForPaper(type, key) {
                try {
                    const refDoc = doc(db, 'settings', 'unitPriceConfig');
                    const snap = await getDoc(refDoc);
                    if (!snap.exists()) return;

                    const data = snap.data() || {};
                    const book = data.book || {};

                    const updates = {};

                    if (type === 'innerPaper') {
                        // 내지 추가금 삭제
                        updates[`book.inner.upcharges.${key}`] = deleteField();
                    }

                    if (type === 'coverPaper') {
                        // 표지 단가 삭제 (존재하는 키를 탐색해서 안전하게 제거)
                        const cover = book.cover || {};
                        Object.keys(cover).forEach(k => {
                            if (k === `${key}_color_simplex` || k === `${key}_color_duplex` || k.startsWith(`${key}_`)) {
                                updates[`book.cover.${k}`] = deleteField();
                            }
                        });
                    }

                    // 업데이트할 게 없으면 종료
                    if (Object.keys(updates).length === 0) return;

                    await updateDoc(refDoc, updates);
                } catch (err) {
                    // 단가 삭제 실패는 치명적이지 않으므로 경고만
                    logger.warn('단가관리 자동 삭제 실패:', err);
                }
            }

            
            // ✅ 레거시 내지 용지(삭제된 옵션) 정리: Firestore settings/imagePreviews + Storage 파일 + 단가관리(가능하면)
            const cleanupLegacyBtn = e.target.closest?.('.cleanup-legacy-inner-btn');
            if (cleanupLegacyBtn) {
                e.preventDefault();
                e.stopPropagation();

                const legacyKeys = ['snow200', 'snow250', 'arte190'];
                const ok = await showConfirmation(
                    '레거시 정리',
                    `삭제된 내지 용지(스노우200/250, 아르떼190) 데이터를 정리할까요?\n\n- Firestore: settings/imagePreviews.innerPaper 에서 제거\n- Storage: 등록된 파일이 있으면 삭제(가능한 범위에서)\n- 단가관리: book.inner.upcharges 에서 제거`
                );
                if (!ok) return;

                try {
                    const beforeVals = {};
                    legacyKeys.forEach(k => { beforeVals[k] = imagePreviewsCache?.innerPaper?.[k]; });

                    // 1) Firestore: 해당 키 필드 제거
                    const delPayload = { innerPaper: {}, paper: {} };
                    legacyKeys.forEach(k => {
                        delPayload.innerPaper[k] = deleteField();
                        delPayload.paper[k] = deleteField();
                    });
                    await setDoc(doc(db, 'settings', 'imagePreviews'), delPayload, { merge: true });

                    // 3) Storage: 가능한 경우 파일 삭제
                    const exts = ['png', 'jpg', 'jpeg', 'webp'];
                    const tryDeleteByUrl = async (url) => {
                        try {
                            if (!url || typeof url !== 'string') return;
                            // firebase download url -> object path 추출
                            const m = url.match(/\/o\/([^\?]+)\?/);
                            if (!m) return;
                            const fullPath = decodeURIComponent(m[1]);
                            await deleteObject(ref(storage, fullPath));
                        } catch (_) {}
                    };

                    for (const key of legacyKeys) {
                        const val = beforeVals[key];
                        const path = getPreviewPath(val);
                        const url = getPreviewUrl(val);

                        if (path) {
                            try { await deleteObject(ref(storage, path)); } catch (_) {}
                        } else if (url) {
                            await tryDeleteByUrl(url);
                        } else {
                            // 레거시(확장자 모름) 추정 삭제
                            for (const ext of exts) {
                                try {
                                    await deleteObject(ref(storage, `image_previews/innerPaper/${key}.${ext}`));
                                } catch (_) {}
                            }
                        }

                        // 4) 단가관리(가능하면)
                        try { await deleteUnitPriceForPaper('innerPaper', key); } catch (_) {}
                    }

                    // 2) 캐시 반영
                    legacyKeys.forEach(k => {
                        try { if (imagePreviewsCache?.innerPaper) delete imagePreviewsCache.innerPaper[k]; } catch (_) {}
                    });

                    renderImagePreviews('innerPaper');
                    showToast('레거시 내지 용지 정리가 완료되었습니다.', 'success');
                } catch (err) {
                    logger.error(err);
                    showToast('레거시 정리에 실패했습니다.', 'error');
                }
                return;
            }

// 이미지 삭제 (URL 제거 + 스토리지 파일 best-effort 삭제)
            const delImgBtn = e.target.closest?.('.delete-image-btn');
            if (delImgBtn) {
                // 카드 전체 클릭(onclick)로 파일 선택창이 열리는 것을 방지
                e.preventDefault();
                e.stopPropagation();
                const type = delImgBtn.dataset.type;
                const key = delImgBtn.dataset.key;
                const ok = await showConfirmation('이미지 삭제', `"${key}" 이미지 등록을 삭제할까요?\n(항목은 유지되며, 필요하면 다시 업로드할 수 있습니다.)`);
                if (!ok) return;
                try {
                    // Firestore: URL 제거
                    {
                    const delPayload = { [type]: { [key]: deleteField() } };
                    if (type === 'coverPaper' || type === 'innerPaper') delPayload.paper = { [key]: deleteField() };
                    await setDoc(doc(db, 'settings', 'imagePreviews'), delPayload, { merge: true });
                }
                    // 캐시 반영
                    const _beforeVal = imagePreviewsCache?.[type]?.[key];
                    if (imagePreviewsCache?.[type]) delete imagePreviewsCache[type][key];

                    // Storage: 가능하면 파일도 삭제
                    // 1) 새 구조({url, path})면 path로 정확히 삭제
                    // 2) 레거시(string URL)면 확장자 추정 삭제
                    // 3) 기본 placeholder(none.webp)는 삭제하지 않음
                    const _val = _beforeVal;
                    const _path = getPreviewPath(_val);
                    const _urlForPlaceholderCheck = getPreviewUrl(_val);

                    // ✅ 스토리지 삭제 시도는 "정확한 경로(path)"가 있거나,
                    // 다운로드 URL이 Firebase Storage URL일 때만(best-effort) 수행합니다.
                    // (값이 없는데 확장자 추정 삭제를 하면 404가 연속 발생할 수 있음)
                    const isPlaceholder = (_urlForPlaceholderCheck && _urlForPlaceholderCheck.includes('placehold.co'));
                    const isFirebaseUrl = (_urlForPlaceholderCheck && _urlForPlaceholderCheck.includes('firebasestorage.googleapis.com'));

                    // ✅ 'none'(표지없음) 키는 스토리지에 실제 파일이 없을 수 있으므로,
                    // path가 없으면 스토리지 삭제 요청을 보내지 않습니다(404 방지).
                    const skipStorageDelete = (key === 'none' && !_path);

                    if (!isPlaceholder && !skipStorageDelete) {
                        if (_path) {
                            try { await deleteObject(ref(storage, _path)); } catch (_) {}
                        } else if (isFirebaseUrl) {
                            // URL에서 객체 경로 추출 후 삭제 시도
                            try {
                                const mm = _urlForPlaceholderCheck.match(/\/o\/([^\?]+)\?/);
                                if (mm) {
                                    const fullPath = decodeURIComponent(mm[1]);
                                    await deleteObject(ref(storage, fullPath));
                                }
                            } catch (_) {}
                        } else {
                            // 경로/스토리지 URL이 없으면 스토리지 삭제를 스킵 (URL만 제거)
                        }
                    }

                    renderImagePreviews(type);
                    showToast('이미지가 삭제되었습니다.', 'success');
                } catch (err) {
                    logger.error(err);
                    showToast('이미지 삭제에 실패했습니다.', 'error');
                }
                return;
            }

            // 항목 삭제 (커스텀 항목만) : 메타에서 제거 + URL 제거 + 스토리지 best-effort 삭제
            const delItemBtn = e.target.closest?.('.delete-item-btn');
            if (delItemBtn) {
                // 카드 전체 클릭(onclick)로 파일 선택창이 열리는 것을 방지
                e.preventDefault();
                e.stopPropagation();
                const type = delItemBtn.dataset.type;
                const key = delItemBtn.dataset.key;
                const ok = await showConfirmation('항목 삭제', `"${key}" 항목을 삭제할까요?\n(등록된 이미지도 함께 삭제됩니다.)`);
                if (!ok) return;
                try {
                    // 메타에서 제거
                    const arr = Array.isArray(imagePreviewsCache?._meta?.items?.[type]) ? [...imagePreviewsCache._meta.items[type]] : [];
                    const next = arr.filter(x => x && x.key !== key);
                    if (!imagePreviewsCache._meta) imagePreviewsCache._meta = {};
                    if (!imagePreviewsCache._meta.items) imagePreviewsCache._meta.items = {};
                    imagePreviewsCache._meta.items[type] = next;

                    // Firestore: 메타 업데이트 + URL 제거
                    {
                    const delItemPayload = { _meta: imagePreviewsCache._meta, [type]: { [key]: deleteField() } };
                    if (type === 'coverPaper' || type === 'innerPaper') delItemPayload.paper = { [key]: deleteField() };
                    await setDoc(doc(db, 'settings', 'imagePreviews'), delItemPayload, { merge: true });
                }
                    const _beforeVal = imagePreviewsCache?.[type]?.[key];
                    if (imagePreviewsCache?.[type]) delete imagePreviewsCache[type][key];

                    // 단가관리에서도 해당 용지 키 삭제(자동 반영)
                    await deleteUnitPriceForPaper(type, key);

                    // Storage: best-effort
                    const exts = ['png', 'jpg', 'jpeg', 'webp'];
                    for (const ext of exts) {
                        try {
                            const p = `image_previews/${type}/${key}.${ext}`;
                            await deleteObject(ref(storage, p));
                        } catch (_) {}
                    }

                    renderImagePreviews(type);
                    showToast('항목이 삭제되었습니다.', 'success');
                } catch (err) {
                    logger.error(err);
                    showToast('항목 삭제에 실패했습니다.', 'error');
                }
                return;
            }

            // 항목 추가 (추가 용지/제본 종류 대응)
            const addBtn = e.target.closest?.('.add-image-item-btn');
            if (addBtn) {
                const type = addBtn.dataset.type;
                const key = (prompt('추가할 항목 KEY를 입력하세요.\n예) snow300 / artpaper210', '') || '').trim();
                if (!key) return;
                const textLabel = (prompt('표시될 이름(라벨)을 입력하세요.\n예) 스노우지 300g', '') || '').trim();
                if (!textLabel) return;

                // 내지 용지는 단가관리/견적서 연동을 위해 그룹을 저장(일반/고급)
                let group = null;
                if (type === 'innerPaper') {
                    const g = (prompt('내지 용지 그룹을 입력하세요.\n- general (일반)\n- premium (고급)\n\n비우면 general로 저장합니다.', 'general') || 'general').trim().toLowerCase();
                    group = (g === 'premium') ? 'premium' : 'general';
                }

                if (!imagePreviewsCache._meta) imagePreviewsCache._meta = {};
                if (!imagePreviewsCache._meta.items) imagePreviewsCache._meta.items = {};
                const arr = Array.isArray(imagePreviewsCache._meta.items[type]) ? [...imagePreviewsCache._meta.items[type]] : [];

                if (arr.some(x => x && x.key === key)) {
                    showToast('이미 존재하는 KEY입니다.', 'error');
                    return;
                }

                const payload = group ? { key, text: textLabel, group } : { key, text: textLabel };
                arr.push(payload);
                imagePreviewsCache._meta.items[type] = arr;

                try {
                    // ⚠️ 중요: _meta 전체를 setDoc(merge)로 덮어쓰면,
                    // 로컬 캐시에 없는 다른 타입의 _meta.items 가 사라질 수 있습니다.
                    // 따라서 해당 타입의 배열만 필드 경로로 부분 업데이트합니다.
                    const refDoc = doc(db, 'settings', 'imagePreviews');
                    try {
                        await updateDoc(refDoc, { [`_meta.items.${type}`]: arr });
                    } catch (e2) {
                        // 문서가 없거나 update 실패 시: 해당 필드만 merge로 생성
                        await setDoc(refDoc, { _meta: { items: { [type]: arr } } }, { merge: true });
                    }

                    renderImagePreviews(type);
                    showToast('항목이 추가되었습니다. 이제 해당 카드에서 이미지를 업로드하세요.', 'success');
                } catch (err) {
                    logger.error(err);
                    showToast('항목 추가에 실패했습니다.', 'error');
                }
                return;
            }

            // 카드 아무 곳(이미지/텍스트)을 클릭하면 파일 선택창 열기
            // (삭제/항목삭제 버튼 클릭 시는 상단에서 return 처리됨)
            const card = e.target.closest?.('.image-preview-card');
            if (!card) return;
            const input = card.querySelector?.('.image-upload-input');
            if (input) input.click();
        });

        document.getElementById('imageManagementModal')?.addEventListener('change', async (e) => {
            if(e.target.classList.contains('image-upload-input')) {
                const file = e.target.files[0];
                if(!file) return;
                const { type, key } = e.target.dataset;
                const card = e.target.closest?.('.group');
                const visualBtn = card?.querySelector?.('.image-upload-btn');
                if (visualBtn) {
                    visualBtn.classList.add('pointer-events-none');
                    visualBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>업로드중…';
                }

                // 업로드 완료까지 기다렸다가 URL을 Firestore에 저장해야 새로고침 후에도 유지됩니다.
                const waitUpload = (uploadTask) => new Promise((resolve, reject) => {
                    uploadTask.on('state_changed', null, reject, () => resolve(uploadTask.snapshot));
                });

                try {
                    // 파일 확장자(표시용) - 저장은 png로 통일해도 되고, 안정성을 위해 원본 확장자 기반으로 저장합니다.
                    const extFromName = (file.name || '').split('.').pop()?.toLowerCase();
                    const ext = (extFromName === 'png' || extFromName === 'jpg' || extFromName === 'jpeg' || extFromName === 'webp')
                        ? extFromName
                        : (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');

                    // 경로를 고정해 “수정/재업로드” 시 덮어쓰기 되도록 합니다.
                    const storagePath = `image_previews/${type}/${key}.${ext}`;

                    // 확장자가 바뀌어도 동일 경로로 저장하도록 강제하면 가장 깔끔하지만,
                    // 현재는 “업로드된 실제 경로(storagePath)”를 Firestore에 저장하므로 별도 사전 삭제는 하지 않습니다.
                    // (사전 삭제를 하면 존재하지 않는 파일에 대한 404 요청 로그가 많이 발생할 수 있습니다.)

                    const storageRef = ref(storage, storagePath);

                    const uploadTask = uploadBytesResumable(storageRef, file);
                    await waitUpload(uploadTask);
                    const url = await getDownloadURL(storageRef);

                    // Firestore에는 해당 필드만 업데이트(부분 업데이트)합니다.
                    // (문서가 아직 없으면 updateDoc이 실패할 수 있어 setDoc(merge)로 폴백)
                    // Firestore에는 해당 필드만 업데이트(부분 업데이트)합니다.
                    // (문서가 아직 없으면 updateDoc이 실패할 수 있어 setDoc(merge)로 폴백)
                    const updatePayload = { [`${type}.${key}`]: { url, path: storagePath } };
                    // 레거시 호환: cover/inner 는 paper에도 같이 저장 (binding은 paper에 저장하지 않음: 키 충돌 방지)
                    if (type === 'coverPaper' || type === 'innerPaper') updatePayload[`paper.${key}`] = url;

                    try {
                        await updateDoc(doc(db, 'settings', 'imagePreviews'), updatePayload);
                    } catch (e2) {
                        const setPayload = { [type]: { [key]: { url, path: storagePath } } };
                        if (type === 'coverPaper' || type === 'innerPaper') setPayload.paper = { [key]: url };
                        await setDoc(doc(db, 'settings', 'imagePreviews'), setPayload, { merge: true });
                    }


                    // 캐시/화면 동기화
                    if (!imagePreviewsCache[type]) imagePreviewsCache[type] = {};
                    imagePreviewsCache[type][key] = { url, path: storagePath };
                    if (type === 'coverPaper' || type === 'innerPaper') {
                        if (!imagePreviewsCache.paper) imagePreviewsCache.paper = {};
                        imagePreviewsCache.paper[key] = url;
                    }
                    const img = document.getElementById(`preview-${type}-${key}`);
                    if (img) img.src = url;

                    if (visualBtn) {
                        visualBtn.innerHTML = '<i class="fas fa-camera mr-2"></i>사진 변경';
                    }
                    showToast('이미지가 등록되었습니다.', 'success');
                } catch(err) {
                    logger.error(err);
                    if (visualBtn) {
                        visualBtn.innerHTML = '<i class="fas fa-triangle-exclamation mr-2"></i>업로드 실패';
                    }
                    showToast('이미지 업로드에 실패했습니다. 콘솔 오류를 확인하세요.', 'error');
                } finally {
                    // 같은 파일을 다시 선택할 수 있도록 value 초기화
                    e.target.value = '';
                }
            }
        });

        
    function setupNoticeEditor() {
        const editor = document.getElementById('notice-content-editor');
        if (!editor) return;

        // toolbar actions (execCommand is deprecated but works broadly)
        const toolbar = editor.closest('.border')?.querySelectorAll('.editor-btn') || [];
        toolbar.forEach(btn => {
            btn.addEventListener('click', () => {
                editor.focus();
                const cmd = btn.dataset.cmd;
                const align = btn.dataset.align;
                const list = btn.dataset.list;

                try {
                    if (cmd) document.execCommand(cmd, false, null);
                    else if (align) {
                        if (align === 'left') document.execCommand('justifyLeft', false, null);
                        if (align === 'center') document.execCommand('justifyCenter', false, null);
                        if (align === 'right') document.execCommand('justifyRight', false, null);
                    } else if (list) {
                        if (list === 'ul') document.execCommand('insertUnorderedList', false, null);
                        if (list === 'ol') document.execCommand('insertOrderedList', false, null);
                    }
                } catch(e) {
                    logger.warn('editor command failed', e);
                }
            });
        });

        const sizeSel = document.getElementById('notice-font-size');
        sizeSel?.addEventListener('change', () => {
            const px = parseInt(sizeSel.value || '14', 10);
            if (!px) return;
            editor.focus();
            applyInlineStyleToSelection({ 'font-size': px + 'px' });
        });

        document.getElementById('notice-editor-clear')?.addEventListener('click', () => {
            editor.innerHTML = (editor.innerText || '').replace(/\n/g, '<br>');
            editor.focus();
        });

        // keep legacy textarea synced (for safety)
        editor.addEventListener('input', () => {
            const hidden = document.getElementById('notice-content');
            if (hidden) hidden.value = (editor.innerText || '').trim();
        });
    }

    function applyInlineStyleToSelection(styleObj) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range) return;

        const span = document.createElement('span');
        Object.entries(styleObj || {}).forEach(([k, v]) => span.style.setProperty(k, v));
        try {
            // If selection collapsed, insert span with ZWSP so user can type with style
            if (range.collapsed) {
                span.appendChild(document.createTextNode('\u200B'));
                range.insertNode(span);
                // move caret inside
                const newRange = document.createRange();
                newRange.setStart(span.firstChild, 1);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            } else {
                span.appendChild(range.extractContents());
                range.insertNode(span);
                sel.removeAllRanges();
                const newRange = document.createRange();
                newRange.selectNodeContents(span);
                newRange.collapse(false);
                sel.addRange(newRange);
            }
        } catch(e) {
            logger.warn('applyInlineStyleToSelection failed', e);
        }
    }


// ── 이벤트 바인딩 및 초기화 ────────────────────────────────────
// 공지사항, 포트폴리오, 홈페이지 콘텐츠 등 설정 탭의 이벤트를 연결

// 1. 공지사항
    document.getElementById('notice-form')?.addEventListener('submit', handleNoticeSave);
    setupNoticeEditor();
    document.getElementById('clear-notice-form-btn')?.addEventListener('click', () => {
        document.getElementById('notice-form').reset();
        document.getElementById('notice-id').value = '';
        const editor = document.getElementById('notice-content-editor');
        if (editor) editor.innerHTML = '';
    });
    
    // 공지사항 목록 클릭 이벤트 (수정/삭제)
    document.getElementById('notice-list-admin')?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-notice-btn');
        const deleteBtn = e.target.closest('.delete-notice-btn');
        
        if(deleteBtn) {
            if(await showConfirmation('삭제', '정말 이 공지사항을 삭제하시겠습니까?')) {
                await deleteDoc(doc(db, "notices", deleteBtn.dataset.id));
                showToast('삭제되었습니다.', 'success');
            }
        }
        if(editBtn) {
            const docSnap = await getDoc(doc(db, "notices", editBtn.dataset.id));
            if(docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('notice-id').value = docSnap.id;
                document.getElementById('notice-title').value = data.title;
                document.getElementById('notice-content').value = data.content || '';
                const editor = document.getElementById('notice-content-editor');
                if (editor) {
                    if (data.contentHtml) editor.innerHTML = data.contentHtml;
                    else editor.innerHTML = sanitizeHTML(data.content || '').replace(/\n/g, '<br>');
                }
                document.getElementById('notice-isImportant').checked = !!data.isImportant;
                document.getElementById('notice-isPopup').checked = !!data.isPopup;
                // 입력창으로 스크롤 이동
                document.getElementById('notice-form').scrollIntoView({ behavior: 'smooth' });
            }
        }
    });

    // 2. 포트폴리오 관련 이벤트
    // 추가 버튼
    document.getElementById('add-portfolio-item')?.addEventListener('click', () => {
        if(!homepageContentCache.portfolio) homepageContentCache.portfolio = [];
        // 빈 항목 추가
        homepageContentCache.portfolio.push({ title: '', description: '', imageUrl: 'https://placehold.co/150' });
        renderPortfolioListAdmin();
        // 스크롤 맨 아래로
        setTimeout(() => {
            const list = document.getElementById('portfolio-list-admin');
            list.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    });

    // 전체 저장 버튼
    
    
    // (v10) 포트폴리오 자동저장 제거: '수정/저장' 버튼으로 명시적 저장만 수행

document.getElementById('save-portfolio-content')?.addEventListener('click', handlePortfolioSave);

    // 포트폴리오 리스트 내부 이벤트 (삭제/이미지변경) - 이벤트 위임
    document.getElementById('portfolio-list-admin')?.addEventListener('click', async (e) => {

        // 수정 버튼: 해당 항목만 편집 가능 상태로 전환
        if (e.target.closest('.edit-portfolio-btn')) {
            const item = e.target.closest('.portfolio-item');
            if (!item) return;
            item.classList.add('ring-2','ring-brand-200');
            const titleEl = item.querySelector('.portfolio-title');
            const descEl  = item.querySelector('.portfolio-description');
            if (titleEl) titleEl.disabled = false;
            if (descEl)  descEl.disabled = false;

            // 저장 버튼 노출
            item.querySelector('.save-portfolio-item-btn')?.classList.remove('hidden');
            // 수정 버튼은 숨김(중복 클릭 방지)
            item.querySelector('.edit-portfolio-btn')?.classList.add('hidden');

            // 포커스
            try { titleEl?.focus(); } catch(e) {}
            return;
        }

        // 저장 버튼: 전체 저장(홈페이지Content.portfolio) 실행 후, 다시 잠금
        if (e.target.closest('.save-portfolio-item-btn')) {
            const item = e.target.closest('.portfolio-item');
            try { await handlePortfolioSave(); } catch(e) {}
            // 저장 후에는 전체가 재렌더링되므로 별도 처리 불필요
            return;
        }

        // 삭제 버튼 (완전삭제: Firestore(settings/homepageContent.portfolio) 반영)
        if (e.target.closest('.remove-portfolio-btn')) {
            const item = e.target.closest('.portfolio-item');
            if (!item) return;
            const idx = parseInt(item.dataset.index);
            const target = (homepageContentCache.portfolio || [])[idx] || null;

            const title = (target && (target.title || target.name)) ? (target.title || target.name) : '포트폴리오';
            const ok = confirm(`"${title}" 항목을 삭제할까요?

삭제 후에는 복구할 수 없습니다.`);
            if (!ok) return;

            try {
                homepageContentCache.portfolio = homepageContentCache.portfolio || [];
                homepageContentCache.portfolio.splice(idx, 1);

                // Firestore에 즉시 반영 (index 실시간 반영은 index에서 onSnapshot으로 처리)
                await setDoc(doc(db, "settings", "homepageContent"), { portfolio: homepageContentCache.portfolio }, { merge: true });

                showToast("포트폴리오가 삭제되었습니다.", "success");
            } catch (err) {
                logger.error("Portfolio delete failed:", err);
                showToast("삭제에 실패했습니다. (권한/네트워크 확인)", "error");
            } finally {
                renderPortfolioListAdmin();
            }
            return;
        }
        // 이미지 변경 버튼
        if (e.target.closest('.change-image-btn')) {
            const item = e.target.closest('.portfolio-item');
            item.querySelector('.portfolio-image-upload').click();
        }
    });

    // 포트폴리오 파일 선택 시 처리
    document.getElementById('portfolio-list-admin')?.addEventListener('change', async (e) => {
        if(e.target.classList.contains('portfolio-image-upload')) {
            const file = e.target.files[0];
            if(!file) return;
            
            const itemEl = e.target.closest('.portfolio-item');
            const btn = itemEl.querySelector('.change-image-btn');
            const img = itemEl.querySelector('.portfolio-image-preview');
            
            btn.textContent = "업로드...";
            btn.disabled = true;
            
            try {
                const uid = auth?.currentUser?.uid;
                if (!uid) {
                    btn.textContent = "로그인필요";
                    showToast("업로드하려면 관리자 계정으로 로그인되어 있어야 합니다.", "error");
                    throw new Error("AUTH_REQUIRED_FOR_STORAGE_UPLOAD");
                }
                const storageRef = ref(storage, `portfolio/${Date.now()}_${file.name}`);
                const task = await uploadBytesResumable(storageRef, file);
                const url = await getDownloadURL(task.ref);
                
                img.src = url; // 미리보기 업데이트

                // ✅ 업로드 성공 즉시 Firestore(settings/homepageContent.portfolio)를 갱신하여 index에 바로 보이게 함
                try {
                    const newPortfolio = [];
                    document.querySelectorAll('.portfolio-item').forEach(el => {
                        newPortfolio.push({
                            imageUrl: el.querySelector('img')?.src || '',
                            title: el.querySelector('.portfolio-title')?.value || '',
                            description: el.querySelector('.portfolio-description')?.value || ''
                        });
                    });
                    homepageContentCache.portfolio = newPortfolio;
                    await setDoc(doc(db, "settings", "homepageContent"), { portfolio: newPortfolio }, { merge: true });
                } catch (e) {
                    logger.error("Portfolio Firestore save failed after upload:", e);
                }
                btn.textContent = "완료";
            } catch(err) { 
                // Firebase Storage 권한/인증 문제(403)는 사용자에게 원인을 바로 안내
                const msg = (err && (err.code || err.message)) ? (err.code || err.message) : String(err);
                if (msg.includes("storage/unauthorized") || msg.includes("storage/unauthenticated") || msg.includes("403") || msg.includes("AUTH_REQUIRED_FOR_STORAGE_UPLOAD")) {
                    btn.textContent = "권한없음";
                    showToast("업로드 권한이 없습니다. 관리자 Firebase 로그인/Storage 규칙을 확인하세요.", "error");
                } else {
                    btn.textContent = "실패";
                    showToast("이미지 업로드 실패", "error");
                }
                logger.error(err);
            } finally {
                btn.disabled = false;
                setTimeout(() => { btn.textContent = "변경"; }, 2000);
            }
        }
    });

	        function setupEventListeners() {
	            // 로그아웃: 세션/토큰 확실히 정리 후 메인으로
	            document.getElementById('logout-btn').onclick = async () => {
                    // ✅ 로그아웃: 역할/리다이렉트 키까지 확실히 정리 (admin<->index 루프 방지)
                    try { sessionStorage.clear(); } catch(e) {}
                    try { sessionStorage.setItem('justLoggedOut', '1'); } catch(e) {}
                    try {
                        localStorage.removeItem('userRole');
                        localStorage.removeItem('quoteToReload');
                        localStorage.removeItem('quoteDraft');
                        localStorage.removeItem('lastQuoteDraft');
                        localStorage.removeItem('postLoginRedirect');
                    } catch(e) {}
                    try { await signOut(auth); } catch(e) {}
                    location.replace('index.html');
                };
            // ✅ 공급자(회사) 정보 저장
            document.getElementById('company-info-form')?.addEventListener('submit', handleCompanyInfoSave);

            // ✅ 공급자(회사) 정보 저장 버튼(기본 submit 방지용)
            document.getElementById('saveCompanyInfoBtn')?.addEventListener('click', () => {
                const form = document.getElementById('company-info-form');
                if (!form) return;
                handleCompanyInfoSave({ preventDefault: () => {}, target: form });
            });

            // ✅ 빠른답변(템플릿) 추가
            document.getElementById('add-response-form')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const titleEl = document.getElementById('new-response-title');
                const textEl  = document.getElementById('new-response-text');
                const title = (titleEl?.value || '').trim();
                const text  = (textEl?.value || '').trim();
                if (!title || !text) {
                    showToast('제목과 내용을 입력해 주세요.', 'warning');
                    return;
                }
                try {
                    await addDoc(collection(db, 'cannedResponses'), {
                        title,
                        text,
                        createdAt: serverTimestamp(),
                    });
                    if (titleEl) titleEl.value = '';
                    if (textEl) textEl.value = '';
                    showToast('빠른 답변이 추가되었습니다.', 'success');
                } catch (err) {
                    console.error('add canned response failed', err);
                    showToast('빠른 답변 추가 중 오류가 발생했습니다.', 'error');
                }
            });

            // ✅ 빠른답변(템플릿) 삭제
            document.getElementById('response-list-container')?.addEventListener('click', async (e) => {
                const btn = e.target.closest('.delete-response-btn');
                if (!btn) return;
                const id = btn.dataset.id;
                if (!id) return;
                const ok = confirm('이 빠른 답변을 삭제할까요?');
                if (!ok) return;
                try {
                    await deleteDoc(doc(db, 'cannedResponses', id));
                    showToast('삭제되었습니다.', 'success');
                } catch (err) {
                    console.error('delete canned response failed', err);
                    showToast('삭제 중 오류가 발생했습니다.', 'error');
                }
            });

            
            // 탭 전환 로직들 (통합 네비게이션용으로 수정됨)
            const handleTab = (navId, contentClass) => {
                const nav = document.getElementById(navId);
                if (!nav) return;
                nav.addEventListener('click', (e) => {
                    const btn = e.target.closest('.nav-item') || e.target.closest('.tab-btn');
                    if(!btn) return;
                    
                    // 네비게이션 아이템인 경우 (상단 메뉴)
                    if(btn.classList.contains('nav-item')) {
                        // 1. 모든 네비게이션 active 제거
                        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
                        // 2. 현재 버튼 active 추가
                        btn.classList.add('active');
                        
                        // 3. 모바일/PC 동기화 (data-tab이 같은게 있다면)
                        const tabId = btn.dataset.tab;
                        if(tabId) {
                            // 모바일 메뉴도 동기화
                            document.querySelectorAll(`#mobile-nav-bar .nav-item[data-tab="${tabId}"]`).forEach(mBtn => mBtn.classList.add('active'));
                            document.querySelectorAll(`#top-nav-bar .nav-item[data-tab="${tabId}"]`).forEach(pcBtn => pcBtn.classList.add('active'));

                            // 컨텐츠 패널 전환
                            document.querySelectorAll('.main-tab-content').forEach(c => c.classList.remove('active'));
                            const content = document.getElementById(tabId + '-content');
                            if(content) content.classList.add('active');
                        }
                    } 
                    // 일반 탭 버튼인 경우 (모달 등)
                    else {
                        const container = btn.closest('nav');
                        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        
                        // 컨텐츠 전환
                        let targetId = btn.dataset.tab;
                         // 탭 ID 매칭 로직 (content, tab, panel 접미사 처리)
                        if (!document.getElementById(targetId)) {
                            if (document.getElementById(targetId + '-content')) targetId += '-content';
                            else if (document.getElementById(targetId + '-tab')) targetId += '-tab';
                            else if (document.getElementById(targetId + '-panel')) targetId += '-panel';
                        }
                        
                        const targetContent = document.getElementById(targetId);
                        if(targetContent) {
                            // 형제 컨텐츠들 숨기기
                            const parent = targetContent.parentElement;
                            for(let child of parent.children) {
                                if(child.classList.contains('tab-content') || child.classList.contains('homepage-sub-tab-content')) {
                                    child.classList.remove('active');
                                }
                            }
                            targetContent.classList.add('active');
                        }
                    }
                });
            };


            // [추가] 월별 매출 현황 접기/펼치기 기능
            const revHeader = document.getElementById('revenue-stats-header');
            if(revHeader) {
                revHeader.addEventListener('click', () => {
                    const content = document.getElementById('revenue-stats-content');
                    const chevron = document.getElementById('revenue-chevron');
                    const isHidden = content.classList.contains('hidden');
                    
                    if(isHidden) {
                        content.classList.remove('hidden');
                        chevron.style.transform = 'rotate(180deg)'; // 화살표 위로
                    } else {
                        content.classList.add('hidden');
                        chevron.style.transform = 'rotate(0deg)'; // 화살표 아래로
                    }
                });
            }

            handleTab('top-nav-bar', 'main-tab-content');
            handleTab('mobile-nav-bar', 'main-tab-content'); // 모바일 메뉴 연결
            
            handleTab('modal-tabs', 'tab-content');
            handleTab('homepage-sub-tab-nav', 'homepage-sub-tab-content');
            handleTab('image-modal-tabs', 'tab-content');

            // 검색/필터
            document.getElementById('searchInput')?.addEventListener('input', () => {
                currentPage = 1;
                renderQuotes();
            });
            document.getElementById('statusFilter')?.addEventListener('change', () => {
                currentPage = 1;
                renderQuotes();
            });

            // 모달 닫기 버튼들
            document.getElementById('closeModalBtn').onclick = () => DOMElements.detailsModal.classList.add('hidden');
             if (unsubscribeFiles) unsubscribeFiles();
            document.getElementById('closeCompanyInfoModalBtn').onclick = () => DOMElements.companyInfoModal.classList.add('hidden');
            document.getElementById('closeCannedResponseModalBtn').onclick = () => DOMElements.cannedResponseManagementModal.classList.add('hidden');
            document.getElementById('closeImageManagementModalBtn').onclick = () => DOMElements.imageManagementModal.classList.add('hidden');
            document.getElementById('closeHomepageManagementModalBtn').onclick = () => DOMElements.homepageManagementModal.classList.add('hidden');
            document.getElementById('close-inquiry-modal-btn').onclick = () => DOMElements.inquiryDetailsModal.classList.add('hidden');

            // 파일 패널 토글
            document.getElementById('toggle-files-panel-btn')?.addEventListener('click', () => {
                const panel = document.getElementById('files-panel');
                if (panel) panel.classList.toggle('hidden');
            });

            // 메모 패널 토글
            document.getElementById('toggle-memo-btn')?.addEventListener('click', () => {
                const body = document.getElementById('memo-body');
                const chevron = document.getElementById('memo-chevron');
                if (body) body.classList.toggle('hidden');
                if (chevron) {
                    chevron.classList.toggle('fa-chevron-up');
                    chevron.classList.toggle('fa-chevron-down');
                }
            });

            // 리스트 이벤트 위임
            DOMElements.quoteListBody.addEventListener('change', (e) => {
                if (e.target.classList.contains('status-select')) {
                    updateStatus(e.target.dataset.id, e.target.value);
                }
            });

                        async function startAdminEdit(quoteId){
                try {
                    const qRef = doc(db, "quotes", quoteId);
                    const snap = await getDoc(qRef);
                    if (!snap.exists()) { showToast('견적을 찾을 수 없습니다.', 'error'); return; }
                    const q = { id: quoteId, ...snap.data() };
                    const isBook = (q.productType === 'book');

                    const payload = isBook ? {
                        mode: 'admin_edit',
                        quoteId: q.id,
                        productType: 'book',
                        formData: q.formData || null,
                        breakdownData: q.breakdownData || null,
                        breakdownHtml: q.breakdownHtml || null,
                        isGuest: (q.isGuest === true || !!q.guestLookupKey),
                        guestName: q.guestName || null,
                        guestContact: q.guestContact || null,
                        guestContactRaw: q.guestContactRaw || null,
                        guestLookupKey: q.guestLookupKey || null
                    } : {
                        mode: 'admin_edit',
                        quoteId: q.id,
                        productType: 'print',
                        orderName: q.orderName || q.title || '',
                        spec: q.spec || null,
                        isGuest: (q.isGuest === true || !!q.guestLookupKey),
                        guestName: q.guestName || null,
                        guestContact: q.guestContact || null,
                        guestContactRaw: q.guestContactRaw || null,
                        guestLookupKey: q.guestLookupKey || null
                    };

                    try { localStorage.setItem('quoteToReload', JSON.stringify(payload)); } catch(e){}
                    window.location.href = isBook ? 'quote-book.html?edit=1&adminEdit=1' : `quote-print.html?edit=1&adminEdit=1&id=${encodeURIComponent(q.id)}`;
                } catch (e) {
                    logger.error('startAdminEdit failed', e);
                    showToast('견적 수정 화면으로 이동하지 못했습니다.', 'error');
                }
            }
    

DOMElements.quoteListBody.addEventListener('click', (e) => {
                const viewBtn = e.target.closest('.view-details-btn');
                const editBtn = e.target.closest('.admin-edit-quote-btn');
                const approveCancelBtn = e.target.closest('.approve-cancel-btn');
                const rejectCancelBtn = e.target.closest('.reject-cancel-btn');
                const deleteBtn = e.target.closest('.delete-quote-btn');
                
                if (approveCancelBtn) resolveCancelRequest(approveCancelBtn.dataset.id, 'approve');
                if (rejectCancelBtn) resolveCancelRequest(rejectCancelBtn.dataset.id, 'reject');
                if (viewBtn) showDetailsModal(viewBtn.dataset.id);
                if (editBtn) startAdminEdit(editBtn.dataset.id);
                if (deleteBtn) deleteQuote(deleteBtn.dataset.id);
            });

            // 1. [아이프레임 모달 로직]
            const iframeModal = document.getElementById('iframeModal');
            const contentIframe = document.getElementById('contentIframe');
            const closeIframeBtn = document.getElementById('closeIframeModalBtn');

            function openIframeModal(url) {
                // Defer opening to avoid the same click event immediately closing the modal
                // (backdrop appears under cursor and receives the click).
                contentIframe.src = url;
                requestAnimationFrame(() => {
                    iframeModal.classList.remove('hidden');
                });
            }

            if(closeIframeBtn) {
                closeIframeBtn.onclick = () => {
                    iframeModal.classList.add('hidden');
                    contentIframe.src = ''; 
                }
            // Close when clicking backdrop (only when target is the backdrop itself)
            if (iframeModal) {
                iframeModal.addEventListener('click', (e) => {
                    if (e.target === iframeModal) {
                        iframeModal.classList.add('hidden');
                        contentIframe.src = '';
                    }
                });
            }
;
            }

                        function setAdminNavActive(btnId) {
                try {
                    document.querySelectorAll('button.nav-item').forEach(b => b.classList.remove('active'));
                    const target = document.getElementById(btnId);
                    if (target) target.classList.add('active');
                } catch(e) {}
            }

            // 2. [PC 상단 메뉴 버튼 연결] - (이 부분이 누락되어 있었습니다)
            document.getElementById('book-price-management-btn').onclick = () => openIframeModal('quote-book-price.html?adminEdit=1');
            document.getElementById('price-management-btn').onclick = () => openIframeModal('quote-print-price.html?adminEdit=1');
            
            document.getElementById('company-info-btn').onclick = openCompanyInfoModal;
            document.getElementById('image-management-btn').onclick = () => { setAdminNavActive('image-management-btn'); DOMElements.imageManagementModal.classList.remove('hidden'); };
            document.getElementById('homepage-management-btn').onclick = () => { setAdminNavActive('homepage-management-btn'); DOMElements.homepageManagementModal.classList.remove('hidden'); };

            // 3. [모바일 메뉴 버튼 연결]
            document.getElementById('m-book-price-btn')?.addEventListener('click', () => openIframeModal('quote-book-price.html?adminEdit=1'));
            document.getElementById('m-print-price-btn')?.addEventListener('click', () => openIframeModal('quote-print-price.html?adminEdit=1'));
            document.getElementById('m-company-btn')?.addEventListener('click', openCompanyInfoModal);
            document.getElementById('m-image-btn')?.addEventListener('click', () => DOMElements.imageManagementModal.classList.remove('hidden'));
            document.getElementById('m-home-btn')?.addEventListener('click', () => DOMElements.homepageManagementModal.classList.remove('hidden'));
        }

        onAuthStateChanged(auth, async (user) => { try { window.__currentFirebaseUser = user; } catch(e) {}
    // 1. 관리자가 아니거나 로그인 안 된 경우 처리 함수
    const handleDenied = () => {
        document.getElementById('auth-loading').classList.add('hidden');
        document.getElementById('auth-denied').classList.remove('hidden');
    };

    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            // role이 admin인지 확인
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                
                    try { localStorage.setItem('userRole','admin'); } catch(e) {}
                    try { sessionStorage.setItem('userRole','admin'); } catch(e) {}
                    try { if (window.__setAuthState) window.__setAuthState(user, 'admin'); } catch(e) {}
document.getElementById('auth-check-overlay').classList.add('hidden');
                document.getElementById('main-content').classList.remove('hidden');
                try { window.__ROLE_READY = true; } catch(e) {}
                
                setupEventListeners();
                listenToQuotes();
                listenToInquiries();
                loadHomepageContent();
                listenToNotices();
                listenToCannedResponses();
                loadImagePreviews();
            } else {
                // 로그인 했으나 관리자가 아님
                handleDenied();
            
                 try { localStorage.removeItem('userRole'); } catch(e) {}
                 try { sessionStorage.removeItem('userRole'); } catch(e) {}
}
        } catch(e) { 
            logger.error("Auth check failed:", e);
            // 에러 발생 시(권한 부족 등)에도 '접근 권한 없음' 화면을 띄워줌
            handleDenied();
            alert("관리자 정보를 불러오는데 실패했습니다.\n콘솔(F12)을 확인해주세요.");
        }
    } else {
        // ✅ 로그아웃 직후에는 postLoginRedirect를 다시 심지 않음 (루프 방지)
        try {
            const justOut = sessionStorage.getItem('justLoggedOut');
            if (justOut) {
                sessionStorage.removeItem('justLoggedOut');
                try { localStorage.removeItem('userRole'); } catch(e) {}
                try { sessionStorage.removeItem('userRole'); } catch(e) {}
                window.location.replace('index.html');
                return;
            }
        } catch(e) {}

        localStorage.setItem('postLoginRedirect', 'admin.html');
        window.location.href = 'index.html';
    }
});