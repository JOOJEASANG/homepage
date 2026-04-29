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
