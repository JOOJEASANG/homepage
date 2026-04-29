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
