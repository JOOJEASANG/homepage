// ============================================================
// book-a5-rate-admin.js — 관리자 책자 단가설정 A5 적용률
// ============================================================

import { auth, db, doc, getDoc, setDoc, updateDoc, onSnapshot } from './firebase.js';

const DEFAULT_PERCENT = 85;
let currentPercent = DEFAULT_PERCENT;

function normalizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PERCENT;
  return Math.min(120, Math.max(50, Math.round(n)));
}

function readPercent(data) {
  const multiplier = Number(data?.book?.sizeMultipliers?.a5);
  if (!Number.isFinite(multiplier) || multiplier < 0.5 || multiplier > 1.2) return DEFAULT_PERCENT;
  return Math.round(multiplier * 100);
}

function showLocalMessage(message, type = 'success') {
  let el = document.getElementById('a5-rate-save-message');
  if (!el) return;
  el.textContent = message;
  el.className = 'text-xs font-bold ' + (type === 'error' ? 'text-red-600' : 'text-emerald-600');
  clearTimeout(showLocalMessage._timer);
  showLocalMessage._timer = setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}

function renderCard() {
  const host = document.getElementById('etc-price-sections');
  if (!host) return false;

  let card = document.getElementById('book-a5-rate-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'book-a5-rate-card';
    card.className = 'bg-emerald-50 p-5 rounded-xl border border-emerald-200 md:col-span-2';
    card.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-end gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-600 text-white text-xs font-extrabold">A5</span>
            <label for="book-a5-rate-percent" class="text-sm font-extrabold text-slate-800">A5 적용률</label>
          </div>
          <p class="text-xs text-slate-500 leading-5 mb-3">
            A4 규격을 100%로 보고 A5에 적용할 비율입니다. 작은 규격은 재단·정합·제본 작업성이 떨어지므로 기본값은 85%입니다.
            내지·표지·간지·제본·오시처럼 규격 영향을 받는 비용에는 같은 비율을 적용하고, 표지 디자인비 같은 고정 작업비는 그대로 유지합니다.
          </p>
          <div class="relative max-w-[220px]">
            <input type="number" id="book-a5-rate-percent" min="50" max="120" step="1" class="form-input w-full font-extrabold text-slate-800 pr-10" value="85">
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
          </div>
          <div class="mt-2 text-[11px] text-slate-400">예: A4 기준 규격비 100,000원 → A5 85% 설정 시 85,000원</div>
        </div>
        <div class="flex flex-col items-stretch sm:items-end gap-2">
          <button type="button" id="save-book-a5-rate-btn" class="btn btn-success whitespace-nowrap">
            <i class="fas fa-percent mr-2"></i>A5 적용률 저장
          </button>
          <span id="a5-rate-save-message" class="text-xs font-bold min-h-[16px]"></span>
        </div>
      </div>
    `;
    host.prepend(card);

    const input = card.querySelector('#book-a5-rate-percent');
    const saveBtn = card.querySelector('#save-book-a5-rate-btn');

    input?.addEventListener('input', () => {
      const v = Number(input.value);
      input.classList.toggle('border-red-500', !Number.isFinite(v) || v < 50 || v > 120);
    });

    saveBtn?.addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) {
        showLocalMessage('관리자 로그인이 필요합니다.', 'error');
        return;
      }

      const raw = Number(input?.value);
      if (!Number.isFinite(raw) || raw < 50 || raw > 120) {
        input?.classList.add('border-red-500');
        showLocalMessage('50~120 사이의 퍼센트를 입력해주세요.', 'error');
        return;
      }

      const percent = normalizePercent(raw);
      const multiplier = percent / 100;
      const originalHtml = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>저장 중...';

      try {
        const ref = doc(db, 'settings', 'unitPriceConfig');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, { 'book.sizeMultipliers.a5': multiplier });
        } else {
          await setDoc(ref, { book: { sizeMultipliers: { a5: multiplier } } }, { merge: true });
        }
        currentPercent = percent;
        if (input) input.value = String(percent);
        showLocalMessage(`A5 적용률을 ${percent}%로 저장했습니다.`);
      } catch (err) {
        console.error('[A5 rate] save failed', err);
        showLocalMessage('저장에 실패했습니다. 권한 또는 네트워크를 확인해주세요.', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
      }
    });
  }

  const input = document.getElementById('book-a5-rate-percent');
  if (input && document.activeElement !== input) input.value = String(currentPercent);
  return true;
}

function startUiWatch() {
  if (renderCard()) return;
  const observer = new MutationObserver(() => {
    if (renderCard()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { renderCard(); observer.disconnect(); }, 5000);
}

try {
  onSnapshot(doc(db, 'settings', 'unitPriceConfig'), snap => {
    currentPercent = readPercent(snap.exists() ? (snap.data() || {}) : {});
    renderCard();
  }, () => {
    currentPercent = DEFAULT_PERCENT;
    renderCard();
  });
} catch (_) {}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startUiWatch, { once: true });
} else {
  startUiWatch();
}
