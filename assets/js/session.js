// ============================================================
// session.js — 세션/스토리지 헬퍼 (비회원 전용 운영 기준)
//
// 역할:
//   - sessionStorage / localStorage 안전 읽기·쓰기·삭제
//   - 비회원 조회키(SHA-256 해시) 조회
//   - 로그아웃 시 클라이언트 상태 전체 초기화
//   - 현재 세션 상태(비회원·회원·비로그인) 판단
// ============================================================

import { auth, signOut, onAuthStateChanged } from "./firebase.js";
import "./ux-refresh-v2.js";

function getCurrentFile() {
  try {
    const raw = ((location.pathname || '').split('/').pop() || 'index.html').toLowerCase();
    if (raw === 'admin') return 'admin.html';
    if (raw === '') return 'index.html';
    return raw;
  } catch (e) {
    return 'index.html';
  }
}

// admin.html 또는 /admin은 관리자 권한 검사 전에 Firebase 로그인 복원이 끝나야 합니다.
// 비로그인 상태라면 공개 메인으로 보내지 않고 관리자 로그인 탭으로 보냅니다.
try {
  const currentFile = getCurrentFile();
  if (currentFile === 'admin.html') {
    const restoredUser = await new Promise(resolve => {
      let done = false;
      let unsub = null;
      const finish = (user = auth.currentUser || null) => {
        if (done) return;
        done = true;
        try { if (typeof unsub === 'function') unsub(); } catch (e) {}
        resolve(user || null);
      };
      try {
        if (auth.currentUser && !auth.currentUser.isAnonymous) return finish(auth.currentUser);
        unsub = onAuthStateChanged(auth, user => {
          if (user && !user.isAnonymous) finish(user);
        }, () => finish(null));
      } catch (e) {
        return finish(null);
      }
      setTimeout(() => finish(auth.currentUser || null), 2500);
    });

    if (!restoredUser || restoredUser.isAnonymous) {
      try { localStorage.setItem('postLoginRedirect', 'admin.html'); } catch (e) {}
      try { sessionStorage.setItem('postLoginRedirect', 'admin.html'); } catch (e) {}
      if (!/login\.html$/i.test(getCurrentFile())) {
        location.replace('login.html?tab=admin');
        await new Promise(() => {});
      }
    }
  }
} catch (e) {}

// 클라이언트 저장소 값만으로 관리자 권한을 승격하지 않습니다.
// 과거 보정용 managerPublicView/manager-view 값은 권한 오판을 막기 위해 제거만 합니다.
try {
  const marker = sessionStorage.getItem('managerPublicView') || localStorage.getItem('managerPublicView');
  const role = sessionStorage.getItem('userRole') || localStorage.getItem('userRole');
  if (marker === '1' || role === 'manager-view') {
    sessionStorage.removeItem('managerPublicView');
    localStorage.removeItem('managerPublicView');
    sessionStorage.removeItem('userRole');
    localStorage.removeItem('userRole');
  }
} catch (e) {}

// 비회원 마이페이지 조회는 연락처 단독 조회가 아닌 guestLookupKey 기반 fallback을 우선하도록 보정합니다.
try {
  const currentFile = getCurrentFile();
  const hasGuestKey = !!(
    sessionStorage.getItem('guestLookupKey') ||
    localStorage.getItem('guestLookupKey') ||
    sessionStorage.getItem('guestLookupKeyLegacy') ||
    localStorage.getItem('guestLookupKeyLegacy')
  );
  if (currentFile === 'mypage.html' && hasGuestKey) {
    ['guestContact', 'guestContactRaw', 'guestContactHyphen'].forEach(k => {
      try { sessionStorage.removeItem(k); } catch (_) {}
      try { localStorage.removeItem(k); } catch (_) {}
    });
  }
} catch (e) {}

// 관리자페이지/메인페이지 보정 항목을 추가합니다.
try {
  const currentFile = getCurrentFile();
  if (currentFile === 'admin.html') {
    import('./customer-center-admin-menu.js').catch(() => null);
    import('./portfolio-crop-helper.js').catch(() => null);
    import('./admin-safety-patches.js').catch(() => null);
  }
  if (currentFile === 'index.html' || currentFile === '') {
    import('./portfolio-index-fix.js').catch(() => null);
  }
  import('./security-patches.js').catch(() => null);
  import('./customer-ui-fixes.js').catch(() => null);
} catch (e) {}

// AI 상담 위젯을 공통 로드합니다.
// ai-chat.js 내부에서 admin/admin-ai-chat/maintenance 페이지는 제외하고,
// settings/aiChatPublic.enabled === false 이면 모든 페이지에서 제거합니다.
try {
  const currentFile = getCurrentFile();
  if (!['admin.html', 'admin-ai-chat.html', 'maintenance.html'].includes(currentFile)) {
    import('./ai-chat.js').catch(() => null);
  }
} catch (e) {}

// ── 스토리지 안전 헬퍼 ──────────────────────────────────────
export function safeGet(key) {
  try { return sessionStorage.getItem(key) ?? localStorage.getItem(key); }
  catch(e) { return null; }
}

export function safeSet(key, val, persist = false) {
  try { (persist ? localStorage : sessionStorage).setItem(key, val); }
  catch(e) {}
}

export function safeRemove(key) {
  try { sessionStorage.removeItem(key); } catch(e) {}
  try { localStorage.removeItem(key); } catch(e) {}
}

export function getGuestKey() {
  const k = (safeGet("guestLookupKey") || safeGet("guestLookupKeyLegacy") || "").trim();
  return k || null;
}

export function clearClientState() {
  [
    "guestLookupKey", "guestLookupKeyLegacy",
    "guestName", "guestContact", "guestContactRaw",
    "guestContactHyphen", "guestPwLast4",
    "guestSession", "guestEmail", "guestUid",
    "mp_guest_cached", "mp_user_cached",
    "mp_last_tab", "mp_last_filter",
    "admin_session",
    "managerPublicView",
    "userRole", "userName", "userEmail",
    "postLoginRedirect", "quoteToReload", "quoteDraft", "lastQuoteDraft",
    "temp_quote_print", "autoSubmitBook", "autoSubmitPrint",
  ].forEach(safeRemove);
}

export async function firebaseSignOutSafe() {
  try { await signOut(auth); } catch(e) {}
}

export async function hardLogout(target = "index.html") {
  try { clearClientState(); } catch(e) {}
  await firebaseSignOutSafe();
  try { location.replace(target); location.reload(); }
  catch(e) { location.href = target; }
}
window.hardLogout = hardLogout;

const _IDLE_MS = 30 * 60 * 1000;
let _idleTimer = null;

function _resetIdleTimer() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(async () => {
    if (safeGet('userRole') === 'admin') return;
    const hasSession = safeGet('userRole') || getGuestKey();
    if (hasSession) await hardLogout('login.html');
  }, _IDLE_MS);
}

(function _initIdleWatch() {
  const evs = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];
  evs.forEach(ev => window.addEventListener(ev, _resetIdleTimer, { passive: true }));

  try {
    onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        _resetIdleTimer();
      } else if (getGuestKey()) {
        _resetIdleTimer();
      } else {
        clearTimeout(_idleTimer);
      }
    });
    if (getGuestKey()) _resetIdleTimer();
  } catch(e) {}
})();

export function getSessionState() {
  const guestKey    = getGuestKey();
  const user        = auth.currentUser;
  const isMember    = !!(user && !user.isAnonymous);
  const isAnon      = !!(user && user.isAnonymous);
  const isGuest     = !!guestKey;
  const displayName = (
    safeGet("guestName") || safeGet("userName") || user?.displayName || ""
  ).trim();
  return { user, isMember, isGuest, isAnon, displayName, guestKey };
}
