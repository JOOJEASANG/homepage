// ============================================================
// session.js — 세션/스토리지 헬퍼 (비회원 전용 운영 기준)
// ============================================================

import { auth, signOut, onAuthStateChanged } from "./firebase.js";
import "./ux-refresh-v2.js";
import "./file-upload-policy.js";

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

try {
  const currentFile = getCurrentFile();
  if (currentFile === 'admin.html') {
    import('./customer-center-admin-menu.js').catch(() => null);
    import('./portfolio-crop-helper.js').catch(() => null);
    import('./admin-safety-patches.js').catch(() => null);
  }
  if (currentFile === 'index.html' || currentFile === '') {
    import('./portfolio-index-fix.js').catch(() => null);
    import('./public-feed-v2.js').catch(() => null);
  }
  if (currentFile === 'login.html') {
    import('./guest-access-v2.js').catch(() => null);
  }
  if (currentFile === 'qna.html') {
    import('./qna-secure-v2.js').catch(() => null);
  }
  import('./security-patches.js').catch(() => null);
  import('./customer-ui-fixes.js').catch(() => null);
} catch (e) {}

try {
  const currentFile = getCurrentFile();
  if (!['admin.html', 'admin-ai-chat.html', 'maintenance.html'].includes(currentFile)) {
    import('./ai-chat.js').catch(() => null);
  }
} catch (e) {}

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
    "guestLookupKey", "guestLookupKeyLegacy", "guestAccessToken",
    "guestName", "guestContact", "guestContactRaw", "guestContactHyphen", "guestPwLast4",
    "guestSession", "guestEmail", "guestUid", "mp_guest_cached", "mp_user_cached",
    "mp_last_tab", "mp_last_filter", "admin_session", "managerPublicView",
    "userRole", "userName", "userEmail", "postLoginRedirect", "quoteToReload",
    "quoteDraft", "lastQuoteDraft", "temp_quote_print", "autoSubmitBook", "autoSubmitPrint",
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
      if (user && !user.isAnonymous) _resetIdleTimer();
      else if (getGuestKey()) _resetIdleTimer();
      else clearTimeout(_idleTimer);
    });
    if (getGuestKey()) _resetIdleTimer();
  } catch(e) {}
})();

export function getSessionState() {
  const guestKey = getGuestKey();
  const user = auth.currentUser;
  const isMember = !!(user && !user.isAnonymous);
  const isAnon = !!(user && user.isAnonymous);
  const isGuest = !!guestKey;
  const displayName = (safeGet("guestName") || safeGet("userName") || user?.displayName || "").trim();
  return { user, isMember, isGuest, isAnon, displayName, guestKey };
}
