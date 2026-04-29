// ============================================================
// login.js — 로그인 페이지 로직
//
// 탭 구성:
//   ① 주문 조회 탭: 비회원이 이름+연락처+비밀번호로 조회 (→ mypage.html)
//   ② 관리자 로그인 탭: 이메일+비밀번호 → Firestore role 확인 (→ admin.html)
//
// ※ 회원가입 기능 없음 (비회원 전용 운영)
// ============================================================

import { app, auth, db, storage,
         signInWithEmailAndPassword, createUserWithEmailAndPassword,
         updateProfile, sendPasswordResetEmail, signInAnonymously,
         signOut, setPersistence, browserSessionPersistence, browserLocalPersistence,
         onAuthStateChanged, doc, setDoc, getDoc, serverTimestamp,
} from "../firebase.js";
import { initHeader } from "../header.js";
import "../session.js";

// 페이지 로드 시 헤더 렌더링 + URL 파라미터로 탭 자동 전환
document.addEventListener("DOMContentLoaded", () => {
    initHeader("");
    // ?tab=guest → 주문조회 탭, ?tab=admin → 관리자 로그인 탭 자동 활성화
    // switchView는 이 파일 하단에서 window.switchView로 등록되므로 setTimeout으로 대기
    try {
        const params = new URLSearchParams(location.search);
        const tab = params.get("tab");
        if (tab === "admin" || tab === "guest") {
            setTimeout(() => {
                if (typeof window.switchView === "function") {
                    window.switchView(tab === "admin" ? "login-container" : "guest-container");
                }
            }, 50);
        }
    } catch(e) {}
});

// 인라인 스크립트에서 Firebase Auth 접근 가능하도록 전역 등록
        try {
            window.auth = auth;
            window.onAuthStateChanged = onAuthStateChanged;
            window.signOut = signOut;
            if (typeof signInAnonymously !== 'undefined') window.signInAnonymously = signInAnonymously;
            window.__AUTH_READY = false;
            window.__currentUser = auth.currentUser || null;
            onAuthStateChanged(auth, (u) => {
                window.__currentUser = u || null;
                window.__AUTH_READY = true;
            });
        } catch (e) {
            console.warn('[bridge] window expose failed:', e);
        }
// SAFE_GUEST_INIT: wait for Firebase Auth to restore session first.
        // If still no user, then (and only then) sign in anonymously for guest features.
        const __initialUser = await new Promise((resolve) => {
            const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u || null); });
        });
        if (!__initialUser) {
            await signInAnonymously(auth).catch(() => { /* ignore */ });
        }

// --- View Switching ---
        window.switchView = function(containerId) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
            const target = document.getElementById(containerId);
            if(target) {
                target.classList.remove('hidden');
                // 애니메이션 효과 재적용
                target.classList.remove('animate-fade-in');
                void target.offsetWidth; 
                target.classList.add('animate-fade-in');
            }
            
            const tabs = document.querySelectorAll('.tab-btn');
            tabs.forEach(t => t.classList.remove('active'));
            if(containerId === 'guest-container') tabs[0].classList.add('active');
            if(containerId === 'login-container') tabs[1].classList.add('active');
            
            hideMessage();
        };

        // --- Utility ---
        function showMessage(msg, type='error') {
            const activeSection = document.querySelector('.view-section:not(.hidden)');
            const errorBox = activeSection.querySelector('.error-msg');
            if(errorBox) {
                errorBox.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-2"></i>${msg}`;
                errorBox.style.display = 'block';
                if(type === 'success') {
                    errorBox.style.backgroundColor = '#f0fdf4';
                    errorBox.style.color = '#15803d';
                    errorBox.style.borderColor = '#bbf7d0';
                } else {
                    errorBox.style.backgroundColor = '#fef2f2';
                    errorBox.style.color = '#ef4444';
                    errorBox.style.borderColor = '#fecaca';
                }
            } else {
                alert(msg);
            }
        }
        function hideMessage() {
            document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
        }

        // SHA-256 Polyfill (비회원 조회용)
        function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
        function sha256Fallback(ascii) {
            var mathPow = Math.pow;
            var maxWord = mathPow(2, 32);
            var lengthProperty = 'length';
            var i, j;
            var result = '';
            var words = [];
            var asciiBitLength = ascii[lengthProperty] * 8;
            var hash = sha256Fallback.h = sha256Fallback.h || [];
            var k = sha256Fallback.k = sha256Fallback.k || [];
            var primeCounter = k[lengthProperty];
            var isComposite = {};
            for (var candidate = 2; primeCounter < 64; candidate++) {
                if (!isComposite[candidate]) {
                    for (i = 0; i < 313; i += candidate) {
                        isComposite[i] = candidate;
                    }
                    hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
                    k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
                }
            }
            ascii += '\x80';
            while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
            for (i = 0; i < ascii[lengthProperty]; i++) {
                j = ascii.charCodeAt(i);
                if (j >> 8) return; 
                words[i >> 2] |= j << ((3 - i) % 4) * 8;
            }
            words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
            words[words[lengthProperty]] = (asciiBitLength);
            for (j = 0; j < words[lengthProperty];) {
                var w = words.slice(j, j += 16);
                var oldHash = hash;
                hash = hash.slice(0, 8);
                for (i = 0; i < 64; i++) {
                    var i2 = i + j;
                    var w15 = w[i - 15], w2 = w[i - 2];
                    var a = hash[0], e = hash[4];
                    var temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
                    var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                    hash = [(temp1 + temp2) | 0].concat(hash);
                    hash[4] = (hash[4] + temp1) | 0;
                }
                for (i = 0; i < 8; i++) {
                    hash[i] = (hash[i] + oldHash[i]) | 0;
                }
            }
            for (i = 0; i < 8; i++) {
                for (j = 3; j + 1; j--) {
                    var b = (hash[i] >> (j * 8)) & 255;
                    result += ((b < 16) ? 0 : '') + b.toString(16);
                }
            }
            return result;
        }

        async function sha256Hex(str) {
            const subtle = globalThis.crypto && globalThis.crypto.subtle;
            if (subtle && globalThis.isSecureContext) {
                try {
                    const msgBuffer = new TextEncoder().encode(str);
                    const hashBuffer = await subtle.digest('SHA-256', msgBuffer);
                    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                } catch (e) { }
            }
            return sha256Fallback(unescape(encodeURIComponent(str)));
        }

        
        // ===== Promise timeout helper (stuck '처리중...' 방지) =====
        function withTimeout(promise, ms, label='timeout') {
            return Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms))
            ]);
        }

// 1. 로그인 로직
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideMessage();
            const email = document.getElementById('login-email').value;
            const pw = document.getElementById('login-pw').value;
            const isKeepLogin = document.getElementById('keep-login').checked;
            const btn = e.target.querySelector('button');
            const originalHTML = btn.innerHTML;

            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 로그인 중...';

            try {
                // 로그인 유지 설정
                const persistenceMode = isKeepLogin ? browserLocalPersistence : browserSessionPersistence;
                await withTimeout(setPersistence(auth, persistenceMode), 3000, 'persistenceTimeout');

                const userCredential = await withTimeout(signInWithEmailAndPassword(auth, email, pw), 8000, 'loginTimeout');
                const user = userCredential.user;

                // 관리자 여부 확인
                let isAdmin = false;
                let userNameFromDB = '';
                let userRoleFromDB = '';  // 'admin' or 'user'
                try {
                    const userSnap = await withTimeout(getDoc(doc(db, 'users', user.uid)), 2000, 'roleCheckTimeout');
                    if (userSnap.exists()) {
                        const udata = userSnap.data() || {};
                        userRoleFromDB = udata.role || '';
                        userNameFromDB = udata.name || '';
                        isAdmin = (userRoleFromDB === 'admin');
                    } else {
                        isAdmin = false;
                    }
                } catch (e) {
                    console.warn('Admin role check failed; fallback to user route.', e);
                }


                // LOGIN_STORAGE_V2: 공통 헤더/메뉴 표시용 캐시
                try {
                    const nameToSave = (userNameFromDB && userNameFromDB.trim()) ? userNameFromDB.trim() : (email ? email.split('@')[0] : '고객');
                    sessionStorage.setItem('userName', nameToSave);
                    localStorage.setItem('userRole', (userRoleFromDB || (isAdmin ? 'admin' : 'user')));
                } catch(e) {}
                // 회원 로그인 시 비회원(조회) 세션 키는 정리
                try {
                    const gKeys = [
                        'guestLookupKey','guestLookupKeyLegacy','guestName','guestContact','guestContactRaw',
                        'guestContactHyphen','guestPwLast4','guestSession','guestEmail','guestUid'
                    ];
                    gKeys.forEach(k=>{ try{ sessionStorage.removeItem(k); }catch(e){} });
                    gKeys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
                } catch(e) {}

        
                let redirectUrl = localStorage.getItem('postLoginRedirect');

                // ✅ Fallback: 견적페이지에서 로그인으로 넘어온 경우(특정 브라우저/캐시에서 postLoginRedirect가 누락되는 케이스 대응)
                if (!redirectUrl) {
                    try {
                        if (localStorage.getItem('autoSubmitBook') === 'true') redirectUrl = 'quote-book.html';
                        else if (localStorage.getItem('autoSubmitPrint') === 'true') redirectUrl = 'quote-print.html';
                    } catch(e) {}
                }
                if (redirectUrl) {
                    localStorage.removeItem('postLoginRedirect');
                    location.href = redirectUrl;
                } else {
                    location.href = isAdmin ? 'admin.html' : 'mypage.html';
                }
            } catch (error) {
                console.error(error);
                let msg = '로그인에 실패했습니다.';
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    msg = '이메일 또는 비밀번호가 올바르지 않습니다.';
                }
                showMessage(msg);
                btn.disabled = false; btn.innerHTML = originalHTML;
            }
        });


        
        // 3. 비회원 조회: 연락처 입력 시 비밀번호(끝 4자리) 자동 입력
        (function(){
            const contactEl = document.getElementById('guest-contact');
            const pwEl = document.getElementById('guest-pw');
            if(!contactEl || !pwEl) return;
            let userEditedPw = false;
            pwEl.addEventListener('input', ()=>{ userEditedPw = true; });
            contactEl.addEventListener('input', ()=>{
                const digits = (contactEl.value||'').replace(/[^0-9]/g,'');
                const last4 = digits ? digits.slice(-4) : '';
                // 사용자가 비번을 직접 고쳤으면 덮어쓰지 않음
                if(!userEditedPw){
                    pwEl.value = last4;
                }
                // 마이페이지 fallback 조회용
                try { sessionStorage.setItem('guestPwLast4', last4); } catch(e){}
                try { sessionStorage.setItem('guestContactRaw', contactEl.value||''); } catch(e){}
            });
        })();

// 3. 비회원 조회 로직
        document.getElementById('guest-lookup-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideMessage();

            const name = document.getElementById('guest-name').value.trim();
            const contactRaw = document.getElementById('guest-contact').value.trim();
            // 숫자만 추출하여 키 생성 (다른 페이지와 동일 로직)
            const contact = contactRaw.replace(/[^0-9]/g, '');
            let pw = document.getElementById('guest-pw').value.trim();
            if (!pw) { pw = (contact || '').slice(-4); try { document.getElementById('guest-pw').value = pw; } catch(e) {} }
            const btn = e.target.querySelector('button');
            const originalHTML = btn.innerHTML;

            if (!name || !contact || !pw) {
                showMessage('모든 정보를 입력해주세요.');
                return;
            }

            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';

            try {
                const key = await sha256Hex(`${name}|${contact}|${pw}`);
                const legacyKey = await sha256Hex(`${name}|${contactRaw}|${pw}`);

                // 비회원 조회는 보통 인증(익명 포함)이 필요하도록 보안 규칙을 두는 경우가 많습니다.
                // 따라서 비회원 조회 세션을 시작할 때 익명 로그인을 보장합니다.
                try {
                    if (!auth.currentUser) {
                        await setPersistence(auth, browserSessionPersistence);
                        await signInAnonymously(auth);
                    }
                } catch (e) {
                    console.warn('Anonymous sign-in skipped/failed:', e);
                }
                
                sessionStorage.setItem('guestLookupKey', key);
                sessionStorage.setItem('guestLookupKeyLegacy', legacyKey);
                sessionStorage.setItem('guestName', name);
                sessionStorage.setItem('guestContact', contact);
                sessionStorage.setItem('guestContactRaw', contactRaw);
                sessionStorage.setItem('guestPwLast4', (pw || '').toString().slice(-4));

                 // persist to localStorage too (prevent session loss on refresh/new tab)
                 try {
                     localStorage.setItem('guestLookupKey', key);
                     localStorage.setItem('guestLookupKeyLegacy', legacyKey);
                     localStorage.setItem('guestName', name);
                     localStorage.setItem('guestContact', contact);
                     localStorage.setItem('guestContactRaw', contactRaw);
                     localStorage.setItem('guestPwLast4', (pw || '').toString().slice(-4));
                 } catch (e) {}
                 location.href = 'mypage.html?guest=1';
                
            } catch (error) {
                console.error(error);
                showMessage('조회 처리 중 시스템 오류가 발생했습니다.');
                btn.disabled = false; btn.innerHTML = originalHTML;
            }
        });
        
        // 4. 비밀번호 재설정
        document.getElementById('reset-password-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideMessage();
            const email = document.getElementById('reset-email').value;
            const btn = e.target.querySelector('button');
            const originalHTML = btn.innerHTML;
            
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 전송 중...';
            
            try {
                await sendPasswordResetEmail(auth, email);
                showMessage('비밀번호 재설정 메일이 전송되었습니다. 이메일을 확인해주세요.', 'success');
                setTimeout(() => switchView('login-container'), 3000);
            } catch (error) {
                showMessage('이메일 전송 실패. 가입된 이메일이 맞는지 확인해주세요.');
            } finally {
                btn.disabled = false; btn.innerHTML = originalHTML;
            }
        });

        // 연락처 자동 포맷
        ['signup-contact', 'guest-contact'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`);
            });
        });
