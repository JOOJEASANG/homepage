// ============================================================
// firebase.js — Firebase 앱 초기화 및 공통 모듈 재내보내기
//
// 역할:
//   - Firebase 앱을 단 한 번만 초기화 (중복 방지)
//   - auth / db / storage 인스턴스를 싱글턴으로 제공
//   - 모든 페이지가 이 파일 하나만 import 해서 Firebase 사용
// ============================================================

import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, signInAnonymously,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, deleteUser,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, onSnapshot, query, orderBy,
  doc, updateDoc, addDoc, serverTimestamp, deleteDoc,
  getDoc, setDoc, getDocs, writeBatch, deleteField,
  limit, where, Timestamp, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL,
  deleteObject, uploadBytes, listAll,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ── 프로젝트 설정 ─────────────────────────────────────────────
// ※ 변경 시 Firebase 콘솔 → 프로젝트 설정 → 내 앱 참고
export const firebaseConfig = {
  apiKey:            "AIzaSyAtCY5WIDViQ7Fkml2fm4sA6FUumjOq9MA",
  authDomain:        "worklist-1e83a.firebaseapp.com",
  projectId:         "worklist-1e83a",
  storageBucket:     "worklist-1e83a.firebasestorage.app",
  messagingSenderId: "823710930262",
  appId:             "1:823710930262:web:acaf0fc8e99aa5faa472f7",
  measurementId:     "G-3R9SJYBTFK",
};

// ── 앱 인스턴스 (중복 초기화 방지) ──────────────────────────
let _app;
export function getFirebaseApp() {
  if (_app) return _app;
  const existing = getApps();
  _app = existing.length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

// 자주 쓰는 서비스 인스턴스 (전 파일 공유)
export const app     = getFirebaseApp();
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// ── 관리자 공사중/점검모드 토글 보정 ─────────────────────────
// admin.html에는 버튼이 있으나 저장 로직이 누락/불일치될 수 있어 공통 Firebase 모듈에서 안전하게 연결합니다.
function __isAdminPageForMaintenance() {
  try { return ((location.pathname || '').split('/').pop() || '') === 'admin.html'; }
  catch (e) { return false; }
}

function __maintenanceFlagFromData(data) {
  if (!data || typeof data !== 'object') return false;
  const flags = [
    data.maintenance,
    data.maintenanceMode,
    data.isMaintenance,
    data.isMaintenanceMode,
    data.siteMaintenance,
    data.siteMaintenanceMode,
    data.homepageMaintenance,
    data.homepageMaintenanceMode,
  ];
  if (flags.some(v => v === true || v === 'true' || v === 1 || v === '1' || v === 'on' || v === 'ON')) return true;
  const nested = data.site || data.homepage || data.settings || null;
  return !!(nested && typeof nested === 'object' && __maintenanceFlagFromData(nested));
}

function __renderMaintenanceModePills(on) {
  const ids = ['maintenance-status-pill', 'm-maintenance-status-pill'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = on ? 'ON' : 'OFF';
    el.className = 'ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ' +
      (on ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500');
  });
}

async function __getMaintenanceModeState() {
  try {
    const snaps = await Promise.all([
      getDoc(doc(db, 'settings', 'site')).catch(() => null),
      getDoc(doc(db, 'settings', 'homepageContent')).catch(() => null),
    ]);
    return snaps.some(snap => snap && snap.exists() && __maintenanceFlagFromData(snap.data()));
  } catch (e) {
    console.warn('[maintenance-admin] read failed:', e);
    return false;
  }
}

async function __ensureAdminForMaintenance(user) {
  try {
    if (!user || user.isAnonymous || !user.uid) return false;
    const snap = await getDoc(doc(db, 'users', user.uid));
    return snap.exists() && snap.data()?.role === 'admin';
  } catch (e) {
    console.warn('[maintenance-admin] role check failed:', e);
    return false;
  }
}

function __toastMaintenance(message, type = 'info') {
  try {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console.log(message);
  } catch (e) {}
}

function __markMaintenanceBusy(busy) {
  ['maintenance-mode-btn', 'm-maintenance-status-pill'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if ('disabled' in el) el.disabled = !!busy;
  });
}

async function __setMaintenanceMode(next) {
  const user = auth.currentUser;
  const okAdmin = await __ensureAdminForMaintenance(user);
  if (!okAdmin) throw new Error('관리자 권한 확인 실패');

  const payload = {
    maintenance: next,
    maintenanceMode: next,
    siteMaintenance: next,
    siteMaintenanceMode: next,
    homepageMaintenance: next,
    homepageMaintenanceMode: next,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };

  // 방문자 체크와 관리자 UI가 같은 값을 보도록 두 문서에 같이 저장합니다.
  await Promise.all([
    setDoc(doc(db, 'settings', 'site'), payload, { merge: true }),
    setDoc(doc(db, 'settings', 'homepageContent'), payload, { merge: true }),
  ]);

  try { localStorage.setItem('maintenanceModeLastSet', next ? '1' : '0'); } catch (e) {}
}

function __bindAdminMaintenanceModeToggle() {
  if (!__isAdminPageForMaintenance()) return;

  let currentState = false;
  let busy = false;

  const refresh = async () => {
    currentState = await __getMaintenanceModeState();
    __renderMaintenanceModePills(currentState);
  };

  const bind = () => {
    // 이벤트 위임으로 처리: 기존 버튼이 늦게 렌더링되거나 모바일 메뉴에서 클릭을 넘겨도 안정적으로 동작합니다.
    if (document.body?.dataset.maintenanceDelegateBound !== '1') {
      document.body.dataset.maintenanceDelegateBound = '1';
      document.addEventListener('click', async (e) => {
        const btn = e.target?.closest?.('#maintenance-mode-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        if (busy) return;
        busy = true;
        __markMaintenanceBusy(true);

        const oldHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin text-slate-400"></i> 처리중...`;

        try {
          // 클릭 직전 최신 상태를 다시 읽어서 ON/OFF 반전 오류를 막습니다.
          currentState = await __getMaintenanceModeState();
          const next = !currentState;
          await __setMaintenanceMode(next);
          currentState = next;
          __renderMaintenanceModePills(currentState);
          __toastMaintenance(next ? '홈페이지 점검모드가 ON 되었습니다.' : '홈페이지 점검모드가 OFF 되었습니다.', next ? 'warning' : 'success');
        } catch (err) {
          console.warn('[maintenance-admin] toggle failed:', err);
          __toastMaintenance('점검모드 변경에 실패했습니다. 권한 또는 네트워크를 확인하세요.', 'error');
          await refresh();
        } finally {
          btn.innerHTML = oldHtml;
          __renderMaintenanceModePills(currentState);
          __markMaintenanceBusy(false);
          busy = false;
        }
      }, true);
    }

    refresh();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
  setTimeout(bind, 500);
  setTimeout(bind, 1500);
  setTimeout(bind, 3000);
}

try {
  onAuthStateChanged(auth, () => __bindAdminMaintenanceModeToggle());
  __bindAdminMaintenanceModeToggle();
} catch (e) {}

// ── 관리자 연락처 전체 표시 보정 ─────────────────────────────
// admin.js에는 비회원 연락처 뒤 4자리를 숨기는 레거시 로직이 있어, 관리자 화면에서는 원본 번호로 다시 표시합니다.
function __isAdminPageForContactUnmask() {
  try { return ((location.pathname || '').split('/').pop() || '') === 'admin.html'; }
  catch (e) { return false; }
}

function __formatAdminPhone(phone) {
  if (!phone) return '';
  const raw = String(phone).trim();
  const numbers = raw.replace(/[^0-9]/g, '');
  if (numbers.length === 11) return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (numbers.length === 10) return numbers.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  return raw;
}

function __pickAdminContact(q, userMap) {
  if (!q || typeof q !== 'object') return '';
  const user = q.userId ? (userMap.get(q.userId) || {}) : {};
  return __formatAdminPhone(
    q.guestContact ||
    q.guestContactRaw ||
    q.ordererContact ||
    q.userContact ||
    q.contact ||
    q.phone ||
    user.contact ||
    user.phone ||
    ''
  );
}

function __bindAdminContactUnmask() {
  if (!__isAdminPageForContactUnmask()) return;

  let quoteContactMap = new Map();
  let userMap = new Map();
  let initialized = false;
  let renderTimer = null;
  let unsubQuotes = null;
  let unsubUsers = null;

  const renderFullContacts = () => {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;

      // 접수 목록 연락처: 행 안의 상세보기 버튼 data-id로 원본 연락처를 찾아 표시합니다.
      document.querySelectorAll('#quote-list-body tr').forEach(row => {
        const id = row.querySelector('.view-details-btn[data-id], .admin-edit-quote-btn[data-id], .delete-quote-btn[data-id]')?.dataset?.id;
        const full = id ? quoteContactMap.get(id) : '';
        if (!full) return;

        const customerCell = row.children && row.children[3] ? row.children[3] : null;
        if (!customerCell) return;

        const spans = Array.from(customerCell.querySelectorAll('span'));
        const contactSpan = spans.find(el => /땡땡|\d{2,3}-\d{3,4}-\d{4}|\d{10,11}/.test(el.textContent || '')) || spans[spans.length - 1];
        if (contactSpan) {
          contactSpan.textContent = full;
          contactSpan.title = full;
          contactSpan.classList.add('font-medium');
        }
      });

      // 상세 모달 연락처: 기존 '번호보기' 토글 없이 바로 전체 번호를 표시합니다.
      const detailDisplay = document.getElementById('guest-phone-display');
      const detailToggle = document.getElementById('guest-phone-toggle');
      const fullFromToggle = detailToggle?.dataset?.full || '';
      if (detailDisplay && fullFromToggle) {
        detailDisplay.textContent = fullFromToggle;
        detailDisplay.title = fullFromToggle;
        detailDisplay.classList.add('font-medium');
        if (detailToggle) detailToggle.classList.add('hidden');
      }
    }, 40);
  };

  const rebuildQuoteContactMap = (quoteDocs) => {
    const next = new Map();
    quoteDocs.forEach(d => {
      const data = d.data ? d.data() : d;
      const id = d.id || data.id;
      const contact = __pickAdminContact(data, userMap);
      if (id && contact) next.set(id, contact);
    });
    quoteContactMap = next;
    renderFullContacts();
  };

  const start = async (user) => {
    if (initialized) return;
    if (!await __ensureAdminForMaintenance(user)) return;
    initialized = true;

    try {
      unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
        userMap = new Map();
        snap.docs.forEach(d => userMap.set(d.id, d.data() || {}));
        renderFullContacts();
      }, (e) => console.warn('[admin-contact] users watch failed:', e));
    } catch (e) {
      console.warn('[admin-contact] users watch setup failed:', e);
    }

    try {
      unsubQuotes = onSnapshot(collection(db, 'quotes'), (snap) => {
        rebuildQuoteContactMap(snap.docs);
      }, (e) => console.warn('[admin-contact] quotes watch failed:', e));
    } catch (e) {
      console.warn('[admin-contact] quotes watch setup failed:', e);
    }

    const observerTarget = document.body || document.documentElement;
    if (observerTarget && observerTarget.dataset.contactUnmaskObserver !== '1') {
      observerTarget.dataset.contactUnmaskObserver = '1';
      const observer = new MutationObserver(renderFullContacts);
      observer.observe(observerTarget, { childList: true, subtree: true, characterData: true });
    }

    window.addEventListener('pageshow', renderFullContacts);
    setTimeout(renderFullContacts, 300);
    setTimeout(renderFullContacts, 1000);
  };

  try {
    onAuthStateChanged(auth, (user) => start(user));
    if (auth.currentUser) start(auth.currentUser);
  } catch (e) {
    console.warn('[admin-contact] init failed:', e);
  }
}

try { __bindAdminContactUnmask(); } catch (e) {}

// ── 관리자 접수목록 검색박스 아이콘/글자 겹침 보정 ───────────────
function __fixAdminSearchBoxPadding() {
  try {
    const current = ((location.pathname || '').split('/').pop() || '');
    if (current !== 'admin.html') return;
    if (document.getElementById('admin-searchbox-padding-fix')) return;
    const style = document.createElement('style');
    style.id = 'admin-searchbox-padding-fix';
    style.textContent = `
      #searchInput {
        padding-left: 2.75rem !important;
        text-indent: 0 !important;
      }
      #searchInput::placeholder {
        color: #94a3b8;
        opacity: 1;
      }
      #searchInput + .fa-search,
      #searchInput ~ .fa-search {
        pointer-events: none;
      }
      #reception-management-content .relative > .fa-search {
        left: 0.95rem !important;
        width: 1rem;
        text-align: center;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  } catch (e) {}
}

try { __fixAdminSearchBoxPadding(); } catch (e) {}

// ── 하위 모듈 함수 재내보내기 ────────────────────────────────
// 각 페이지에서 firebase.js 하나만 import 하면 모든 함수 사용 가능
export {
  // 앱 초기화
  initializeApp, getApps, getApp,
  // 인증(Auth)
  getAuth, onAuthStateChanged, signOut, signInAnonymously,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, deleteUser,
  // Firestore DB
  getFirestore, collection, onSnapshot, query, orderBy,
  doc, updateDoc, addDoc, serverTimestamp, deleteDoc,
  getDoc, setDoc, getDocs, writeBatch, deleteField,
  limit, where, Timestamp, runTransaction,
  // Storage (파일 업로드/다운로드)
  getStorage, ref, uploadBytesResumable, getDownloadURL,
  deleteObject, uploadBytes, listAll,
};