// ============================================================
// firebase.js — Firebase 앱 초기화 및 공통 모듈 재내보내기
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

export const firebaseConfig = {
  apiKey:            "AIzaSyAtCY5WIDViQ7Fkml2fm4sA6FUumjOq9MA",
  authDomain:        "worklist-1e83a.firebaseapp.com",
  projectId:         "worklist-1e83a",
  storageBucket:     "worklist-1e83a.firebasestorage.app",
  messagingSenderId: "823710930262",
  appId:             "1:823710930262:web:acaf0fc8e99aa5faa472f7",
  measurementId:     "G-3R9SJYBTFK",
};

let _app;
export function getFirebaseApp() {
  if (_app) return _app;
  const existing = getApps();
  _app = existing.length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

export const app     = getFirebaseApp();
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

try {
  const currentFile = ((location.pathname || '').split('/').pop() || '');
  if (currentFile === 'admin-ai-chat.html') {
    import('./admin-ai-faq-helper.js').catch(e => console.warn('[admin-ai] faq helper load failed:', e));
  }
} catch (e) {}

// ── 하위 모듈 함수 재내보내기 ────────────────────────────────
export {
  initializeApp, getApps, getApp,
  getAuth, onAuthStateChanged, signOut, signInAnonymously,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, deleteUser,
  getFirestore, collection, onSnapshot, query, orderBy,
  doc, updateDoc, addDoc, serverTimestamp, deleteDoc,
  getDoc, setDoc, getDocs, writeBatch, deleteField,
  limit, where, Timestamp, runTransaction,
  getStorage, ref, uploadBytesResumable, getDownloadURL,
  deleteObject, uploadBytes, listAll,
};
