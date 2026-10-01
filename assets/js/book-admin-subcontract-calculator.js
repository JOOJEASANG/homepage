// ============================================================
// book-admin-subcontract-calculator.js — 관리자 전용 하청 견적 보조 계산기
//
// - 책자/제본 견적의 현재 최종금액을 기준으로 할인율을 별도 계산합니다.
// - 기본 할인율은 20%이며 관리자가 즉시 조정할 수 있습니다.
// - 고객 견적/Firestore 저장 금액에는 절대 반영하지 않는 조회 전용 기능입니다.
// ============================================================

import { auth, db, onAuthStateChanged, doc, getDoc } from './firebase.js';

const DEFAULT_DISCOUNT_PERCENT = 20;
const TARGET_FILE = 'quote-book.html';

function currentFile() {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
}

function parseWon(text) {
  const digits = String(text || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function floorToHundred(value) {
  const n = Number(value) || 0;
  return Math.floor(n / 100) * 100;
}

function normalizeDiscount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_DISCOUNT_PERCENT;
  return Math.min(100, Math.max(0, n));
}

async function isAdmin(user) {
  try {
    if (!user || user.isAnonymous || !user.uid) return false;
    const snap = await getDoc(doc(db, 'users', user.uid));
    return snap.exists() && snap.data()?.role === 'admin';
  } catch (_) {
    return false;
  }
}

function getCurrentQuoteTotal() {
  const priceBreakdown = document.getElementById('priceBreakdown');
  if (!priceBreakdown) return 0;

  const summary = Array.from(priceBreakdown.children)
    .find(el => el.classList?.contains('bg-slate-800'));
  if (!summary) return 0;

  const finalRow = Array.from(summary.querySelectorAll('div'))
    .find(el => (el.textContent || '').includes('최종 결제 금액'));
  if (!finalRow) return 0;

  const values = Array.from(finalRow.querySelectorAll('span'))
    .map(el => parseWon(el.textContent))
    .filter(n => n > 0);
  return Math.max(...values, 0);
}

function renderCalculatorShell() {
  if (document.getElementById('admin-subcontract-calculator')) return true;

  const priceBreakdown = document.getElementById('priceBreakdown');
  const summaryCard = priceBreakdown?.closest('.bg-white.rounded-xl');
  const sticky = summaryCard?.parentElement;
  if (!priceBreakdown || !summaryCard || !sticky) return false;

  const panel = document.createElement('div');
  panel.id = 'admin-subcontract-calculator';
  panel.className = 'bg-amber-50 rounded-xl border border-amber-200 overflow-hidden shadow-sm';
  panel.innerHTML = `
    <div class="px-5 py-4 border-b border-amber-200 bg-amber-100/70 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <i class="fas fa-percent text-amber-700"></i>
        <h3 class="font-extrabold text-amber-900">관리자 전용 · 하청 견적 계산</h3>
      </div>
      <span class="text-[10px] font-extrabold rounded-full bg-amber-700 text-white px-2 py-1">별도 계산</span>
    </div>
    <div class="p-5 space-y-4">
      <div>
        <label for="admin-subcontract-discount" class="block text-xs font-bold text-amber-900 mb-1">할인율</label>
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <input id="admin-subcontract-discount" type="number" min="0" max="100" step="1" value="${DEFAULT_DISCOUNT_PERCENT}"
              class="form-input w-full font-extrabold text-amber-950 pr-9">
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-700">%</span>
          </div>
          <button type="button" id="admin-subcontract-reset" class="px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-800 hover:bg-amber-100">20% 복원</button>
        </div>
      </div>

      <div class="rounded-lg bg-white border border-amber-200 p-4 space-y-2 text-sm">
        <div class="flex justify-between gap-3 text-slate-600">
          <span>현재 전체 견적</span>
          <strong id="admin-subcontract-original" class="text-slate-900">0원</strong>
        </div>
        <div class="flex justify-between gap-3 text-amber-700">
          <span>할인 금액</span>
          <strong id="admin-subcontract-discount-amount">-0원</strong>
        </div>
        <div class="pt-2 border-t border-amber-200 flex justify-between gap-3 items-end">
          <span class="font-extrabold text-amber-950">하청업체 적용금액</span>
          <strong id="admin-subcontract-total" class="text-xl font-extrabold text-amber-700">0원</strong>
        </div>
      </div>

      <p class="text-[11px] leading-5 text-amber-800">
        이 금액은 관리자 확인용 보조 계산값입니다. 고객에게 표시되는 견적 및 저장되는 최종금액은 변경하지 않습니다.
      </p>
    </div>
  `;

  summaryCard.insertAdjacentElement('afterend', panel);

  const input = panel.querySelector('#admin-subcontract-discount');
  const reset = panel.querySelector('#admin-subcontract-reset');
  input?.addEventListener('input', updateCalculator);
  reset?.addEventListener('click', () => {
    if (input) input.value = String(DEFAULT_DISCOUNT_PERCENT);
    updateCalculator();
  });

  return true;
}

function updateCalculator() {
  const panel = document.getElementById('admin-subcontract-calculator');
  if (!panel) return;

  const original = getCurrentQuoteTotal();
  const input = panel.querySelector('#admin-subcontract-discount');
  const percent = normalizeDiscount(input?.value);
  const discounted = floorToHundred(original * (1 - percent / 100));
  const discountAmount = Math.max(0, original - discounted);

  const originalEl = panel.querySelector('#admin-subcontract-original');
  const discountEl = panel.querySelector('#admin-subcontract-discount-amount');
  const totalEl = panel.querySelector('#admin-subcontract-total');

  if (originalEl) originalEl.textContent = `${original.toLocaleString()}원`;
  if (discountEl) discountEl.textContent = `-${discountAmount.toLocaleString()}원`;
  if (totalEl) totalEl.textContent = `${discounted.toLocaleString()}원`;
}

function bindQuoteWatcher() {
  const priceBreakdown = document.getElementById('priceBreakdown');
  if (!priceBreakdown || priceBreakdown.dataset.subcontractWatchBound === '1') return;
  priceBreakdown.dataset.subcontractWatchBound = '1';

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updateCalculator();
    });
  }).observe(priceBreakdown, { childList: true, subtree: true, characterData: true });
}

async function enableForAdmin(user) {
  if (currentFile() !== TARGET_FILE) return;
  if (!await isAdmin(user)) return;

  const mount = () => {
    if (!renderCalculatorShell()) return false;
    bindQuoteWatcher();
    updateCalculator();
    return true;
  };

  if (mount()) return;
  const observer = new MutationObserver(() => {
    if (mount()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { mount(); observer.disconnect(); }, 5000);
}

if (currentFile() === TARGET_FILE) {
  try {
    onAuthStateChanged(auth, user => enableForAdmin(user).catch(() => null));
    if (auth.currentUser) enableForAdmin(auth.currentUser).catch(() => null);
  } catch (_) {}
}
