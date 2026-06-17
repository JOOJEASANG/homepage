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
  if (flags.some(v => v === true || v === 'true' || v === 1 || v === '1')) return true;
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
    const snap = await getDoc(doc(db, 'settings', 'site'));
    return snap.exists() && __maintenanceFlagFromData(snap.data());
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

function __bindAdminMaintenanceModeToggle() {
  if (!__isAdminPageForMaintenance()) return;

  const bind = () => {
    const btn = document.getElementById('maintenance-mode-btn');
    if (!btn || btn.dataset.maintenanceBound === '1') return;
    btn.dataset.maintenanceBound = '1';

    let currentState = false;
    let busy = false;

    const refresh = async () => {
      currentState = await __getMaintenanceModeState();
      __renderMaintenanceModePills(currentState);
    };

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      busy = true;

      const next = !currentState;
      const oldHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin text-slate-400"></i> 처리중...`;

      try {
        const user = auth.currentUser;
        const okAdmin = await __ensureAdminForMaintenance(user);
        if (!okAdmin) throw new Error('관리자 권한 확인 실패');

        await setDoc(doc(db, 'settings', 'site'), {
          maintenance: next,
          maintenanceMode: next,
          siteMaintenance: next,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        }, { merge: true });

        currentState = next;
        __renderMaintenanceModePills(currentState);
        __toastMaintenance(next ? '홈페이지 점검모드가 ON 되었습니다.' : '홈페이지 점검모드가 OFF 되었습니다.', next ? 'warning' : 'success');
      } catch (err) {
        console.warn('[maintenance-admin] toggle failed:', err);
        __toastMaintenance('점검모드 변경에 실패했습니다. 권한 또는 네트워크를 확인하세요.', 'error');
        await refresh();
      } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
        __renderMaintenanceModePills(currentState);
        busy = false;
      }
    }, true);

    refresh();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
  setTimeout(bind, 500);
  setTimeout(bind, 1500);
}

try {
  onAuthStateChanged(auth, () => __bindAdminMaintenanceModeToggle());
  __bindAdminMaintenanceModeToggle();
} catch (e) {}

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
