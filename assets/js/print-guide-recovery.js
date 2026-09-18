// Digital print guide recovery.
// The legacy quote-print flow can attempt Firestore reads before anonymous auth is restored.
// This module retries after auth and replaces transient guide-load errors without touching pricing logic.
import {
  auth, db, doc, getDoc, onAuthStateChanged, signInAnonymously
} from "./firebase.js";

const GUIDE_SELECTOR = "#guideText";
const PRINT_SETTINGS = ["settings", "print"];

function guideElement() {
  return document.querySelector(GUIDE_SELECTOR);
}

function applyGuideData(data) {
  const el = guideElement();
  if (!el) return false;

  const safe = data && typeof data === "object" ? data : {};
  const guideHtml = typeof safe.guideHtml === "string" ? safe.guideHtml.trim() : "";
  const guide = typeof safe.guide === "string" ? safe.guide.trim() : "";

  if (guideHtml) el.innerHTML = guideHtml;
  else el.textContent = guide || "등록된 안내문이 없습니다.";

  el.dataset.guideState = "loaded";
  return true;
}

async function readGuide() {
  const snap = await getDoc(doc(db, ...PRINT_SETTINGS));
  applyGuideData(snap.exists() ? (snap.data() || {}) : {});
  return true;
}

async function waitForAuthRestore(timeoutMs = 2600) {
  if (auth.currentUser) return auth.currentUser;

  return await new Promise((resolve) => {
    let done = false;
    let unsub = null;

    const finish = (user) => {
      if (done) return;
      done = true;
      try { unsub?.(); } catch (_) {}
      resolve(user || null);
    };

    unsub = onAuthStateChanged(auth, finish);
    setTimeout(() => finish(auth.currentUser), timeoutMs);
  });
}

async function ensureReadableAuth() {
  const restored = await waitForAuthRestore();
  if (restored) return restored;

  try {
    const cred = await signInAnonymously(auth);
    return cred?.user || null;
  } catch (err) {
    console.warn("[print-guide] anonymous auth recovery failed:", err);
    return null;
  }
}

async function recoverGuide() {
  const el = guideElement();
  if (!el) return;

  // Public-read rules may already allow this. Try without forcing auth first.
  try {
    await readGuide();
    return;
  } catch (err) {
    console.warn("[print-guide] initial read failed; retrying after auth:", err);
  }

  await ensureReadableAuth();

  try {
    await readGuide();
  } catch (err) {
    console.warn("[print-guide] authenticated read failed:", err);
  }
}

function scheduleRecovery() {
  if (!guideElement()) return;
  recoverGuide();
  // The legacy page loader can write its error message after our first attempt.
  // Retry after initialization settles so a successful guide always wins.
  setTimeout(recoverGuide, 1200);
  setTimeout(recoverGuide, 3200);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleRecovery, { once: true });
} else {
  scheduleRecovery();
}

window.addEventListener("pageshow", () => setTimeout(recoverGuide, 100));
