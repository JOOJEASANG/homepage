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

// admin.html은 관리자 권한 검사 전에 Firebase 로그인 복원이 끝나야 합니다.
// 복원 전에 admin.js가 먼저 실행되면 로그인된 관리자도 비로그인/익명으로 판단될 수 있어 잠시 대기합니다.
try {
  const currentFile = ((location.pathname || '').split('/').pop() || 'index.html');
  if (currentFile === 'admin.html') {
    await new Promise(resolve => {
      let done = false;
      let unsub = null;
      const finish = () => {
        if (done) return;
        done = true;
        try { if (typeof unsub === 'function') unsub(); } catch (e) {}
        resolve();
      };
      try {
        if (auth.currentUser && !auth.currentUser.isAnonymous) return finish();
        unsub = onAuthStateChanged(auth, user => {
          if (user && !user.isAnonymous) finish();
        }, finish);
      } catch (e) {
        return finish();
      }
      setTimeout(finish, 2500);
    });
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
  const currentFile = ((location.pathname || '').split('/').pop() || 'index.html');
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
  const currentFile = ((location.pathname || '').split('/').pop() || 'index.html');
  if (currentFile === 'admin.html') {
    import('./customer-center-admin-menu.js').catch(() => null);
    import('./portfolio-crop-helper.js').catch(() => null);
    import('./admin-safety-patches.js').catch(() => null);
  }
  if (currentFile === 'index.html' || currentFile === '') {
    import('./portfolio-index-fix.js').catch(() => null);
  }
  import('./security-patches.js').catch(() => null);
} catch (e) {}

// AI 상담 위젯을 공통 로드합니다.
// ai-chat.js 내부에서 admin/admin-ai-chat/maintenance 페이지는 제외하고,
// settings/aiChatPublic.enabled === false 이면 모든 페이지에서 제거합니다.
try {
  const currentFile = ((location.pathname || '').split('/').pop() || 'index.html');
  if (!['admin.html', 'admin-ai-chat.html', 'maintenance.html'].includes(currentFile)) {
    import('./ai-chat.js').catch(() => null);
  }
} catch (e) {}

// ── 스토리지 안전 헬퍼 ──────────────────────────────────────
// try/catch로 감싸 개인정보 보호 모드 등 스토리지 차단 환경에서도 안전하게 동작

// sessionStorage 우선 조회, 없으면 localStorage 에서 가져옴
export function safeGet(key) {
  try { return sessionStorage.getItem(key) ?? localStorage.getItem(key); }
  catch(e) { return null; }
}

// persist=true → localStorage, false(기본) → sessionStorage 에 저장
export function safeSet(key, val, persist = false) {
  try { (persist ? localStorage : sessionStorage).setItem(key, val); }
  catch(e) {}
}

// sessionStorage + localStorage 양쪽에서 동시에 삭제
export function safeRemove(key) {
  try { sessionStorage.removeItem(key); } catch(e) {}
  try { localStorage.removeItem(key); } catch(e) {}
}

// ── 비회원 조회키 ─────────────────────────────────────────────
// 비회원이 주문 조회 시 사용하는 SHA-256 해시키
// 형식: sha256("이름|연락처숫자|비번끝4자리")
export function getGuestKey() {
  const k = (safeGet("guestLookupKey") || safeGet("guestLookupKeyLegacy") || "").trim();
  return k || null;
}

// ── 클라이언트 상태 전체 초기화 ─────────────────────────────
// 로그아웃 시 비회원 관련 키를 localStorage/sessionStorage 양쪽에서 모두 삭제
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
  ].forEach(safeRemove);
}

// ── Firebase 로그아웃 (오류 무시) ────────────────────────────
export async function firebaseSignOutSafe() {
  try { await signOut(auth); } catch(e) {}
}

// ── 완전 로그아웃 ────────────────────────────────────────────
// 클라이언트 상태 초기화 → Firebase 로그아웃 → 지정 페이지로 이동
export async function hardLogout(target = "index.html") {
  try { clearClientState(); } catch(e) {}
  await firebaseSignOutSafe();
  try { location.replace(target); location.reload(); }
  catch(e) { location.href = target; }
}
// 인라인 script 태그에서도 호출할 수 있도록 전역 등록
window.hardLogout = hardLogout;

// ── 자동 로그아웃 (30분 비활성, 관리자 제외) ─────────────────
// 사용자 활동(클릭/키/마우스/스크롤)이 30분간 없으면 자동 로그아웃
// 관리자(userRole=admin)는 제외. 비회원 조회 세션 포함.
const _IDLE_MS = 30 * 60 * 1000; // 30분
let _idleTimer = null;

function _resetIdleTimer() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(async () => {
    if (safeGet('userRole') === 'admin') return; // 관리자 제외
    const hasSession = safeGet('userRole') || getGuestKey();
    if (hasSession) await hardLogout('login.html');
  }, _IDLE_MS);
}

(function _initIdleWatch() {
  const evs = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];
  evs.forEach(ev => window.addEventListener(ev, _resetIdleTimer, { passive: true }));

  // Auth 상태 변경 시 타이머 시작/중단
  try {
    onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        _resetIdleTimer(); // 회원 로그인 시 타이머 시작
      } else if (getGuestKey()) {
        _resetIdleTimer(); // 비회원 조회 세션 시 타이머 시작
      } else {
        clearTimeout(_idleTimer); // 비로그인(익명 포함) 시 타이머 중단
      }
    });
    // 비회원 세션은 onAuthStateChanged 와 별개이므로 즉시도 체크
    if (getGuestKey()) _resetIdleTimer();
  } catch(e) {}
})();

// ── 현재 세션 상태 반환 ──────────────────────────────────────
// 헤더 렌더링 및 페이지 분기 처리에 사용
// 반환: { user, isMember, isGuest, isAnon, displayName, guestKey }
export function getSessionState() {
  const guestKey    = getGuestKey();
  const user        = auth.currentUser;
  const isMember    = !!(user && !user.isAnonymous);   // 이메일 로그인 회원
  const isAnon      = !!(user && user.isAnonymous);     // 익명 로그인 (내부용, UI에는 표시 안 함)
  const isGuest     = !!guestKey;                       // 비회원 조회 세션 (UI 기준)
  // 표시 이름 우선순위: 비회원 저장이름 > 회원 저장이름 > Firebase 프로필명
  const displayName = (
    safeGet("guestName") || safeGet("userName") || user?.displayName || ""
  ).trim();
  return { user, isMember, isGuest, isAnon, displayName, guestKey };
}
