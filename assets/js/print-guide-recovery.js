// Digital print guide recovery.
// The legacy quote-print flow can attempt Firestore reads before anonymous auth is restored.
// One shared loader retries transient failures without overwriting successfully rendered content.
import {
  auth, db, doc, getDoc, onAuthStateChanged, signInAnonymously
} from "./firebase.js";

import { sanitizeRichText } from "./rich-text-sanitizer.js";

let pendingLoad = null;
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

  if (guideHtml) el.innerHTML = sanitizeRichText(guideHtml);
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
  if (!el) return false;
  el.dataset.guideState = "loading";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await readGuide();
      return true;
    } catch (error) {
      console.warn("[print-guide] read failed:", error);
      if (attempt === 0) await ensureReadableAuth();
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  el.dataset.guideState = "error";
  el.textContent = "안내문을 불러오지 못했습니다. 페이지를 새로고침하거나 고객센터로 문의해주세요.";
  return false;
}

export function loadPrintGuide() {
  if (guideElement()?.dataset.guideState === "loaded") return Promise.resolve(true);
  if (!pendingLoad) pendingLoad = recoverGuide().finally(() => { pendingLoad = null; });
  return pendingLoad;
}

function init() { loadPrintGuide().catch(error => console.warn("[print-guide] load failed:", error)); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  const el = guideElement();
  if (el) delete el.dataset.guideState;
  init();
});
