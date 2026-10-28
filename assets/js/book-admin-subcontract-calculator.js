// ============================================================
// book-admin-subcontract-calculator.js — 관리자 전용 하청 견적 보조 계산기
//
// 적용 페이지:
//   - quote-book.html (책자/제본)
//   - quote-print.html (디지털출력)
//
// 동작:
//   - Firebase users/{uid}.role === 'admin' 인 경우에만 표시
//   - 하청 할인 활성화 후 25% 또는 20% 선택에 따라 할인 금액을 별도 표시
//   - 고객 견적/Firestore 저장 금액에는 절대 반영하지 않는 조회 전용 기능
// ============================================================

import { auth, db, onAuthStateChanged, doc, getDoc } from './firebase.js';
import { calculateSubcontractDiscount, DEFAULT_SUBCONTRACT_PERCENT } from './pages/shared/subcontract-discount.js?v=20261028-subcontract-choice';

const ALLOWED_FILES = new Set(['quote-book.html', 'quote-print.html']);

function currentFile() {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
}

function parseWon(text) {
  const digits = String(text || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
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

function getBookTotal() {
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

function getPrintTotal() {
  const totalEl = document.getElementById('totalPrice');
  return totalEl ? parseWon(totalEl.textContent) : 0;
}

function getCurrentQuoteTotal() {
  return currentFile() === 'quote-print.html' ? getPrintTotal() : getBookTotal();
}

function getMountInfo() {
  const file = currentFile();
  if (file === 'quote-book.html') {
    const source = document.getElementById('priceBreakdown');
    const card = source?.closest('.bg-white.rounded-xl') || source?.parentElement;
    return source && card ? { source, card } : null;
  }

  if (file === 'quote-print.html') {
    const source = document.getElementById('breakdown');
    const card = source?.closest('.card') || source?.parentElement;
    return source && card ? { source, card } : null;
  }

  return null;
}

function renderCalculatorShell() {
  if (document.getElementById('admin-subcontract-calculator')) return true;

  const mount = getMountInfo();
  if (!mount?.source || !mount?.card) return false;

  const panel = document.createElement('div');
  panel.id = 'admin-subcontract-calculator';
  panel.className = 'bg-amber-50 rounded-xl border border-amber-200 overflow-hidden shadow-sm';
  panel.innerHTML = `
    <div class="px-5 py-4 border-b border-amber-200 bg-amber-100/70 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <i class="fas fa-percent text-amber-700"></i>
        <h3 class="font-extrabold text-amber-900">관리자 전용 · 하청업체 견적</h3>
      </div>
      <span class="text-[10px] font-extrabold rounded-full bg-amber-700 text-white px-2 py-1">ADMIN</span>
    </div>
    <div class="p-5 space-y-4">
      <label class="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-amber-200 bg-white p-3">
        <input id="admin-subcontract-enabled" type="checkbox"
          class="mt-0.5 w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500">
        <span class="flex-1">
          <span class="block text-sm font-extrabold text-amber-950">하청업체 할인 적용</span>
          <span class="block mt-1 text-[11px] leading-4 text-amber-700">20% 또는 25% 할인율을 선택해 관리자 확인용 금액을 계산합니다.</span>
        </span>
      </label>

      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3">
        <label for="admin-subcontract-percent" class="text-sm font-bold text-amber-950">하청업체 할인율</label>
        <select id="admin-subcontract-percent"
          class="rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="하청업체 할인율 선택">
          <option value="25" selected>25% 할인</option>
          <option value="20">20% 할인</option>
        </select>
      </div>

      <div id="admin-subcontract-result" class="hidden rounded-lg bg-white border border-amber-200 p-4 space-y-2 text-sm">
        <div class="flex justify-between gap-3 text-slate-600">
          <span>현재 전체 견적</span>
          <strong id="admin-subcontract-original" class="text-slate-900">0원</strong>
        </div>
        <div class="flex justify-between gap-3 text-amber-700">
          <span id="admin-subcontract-discount-label">하청 할인 (25%)</span>
          <strong id="admin-subcontract-discount-amount">-0원</strong>
        </div>
        <div class="pt-2 border-t border-amber-200 flex justify-between gap-3 items-end">
          <span class="font-extrabold text-amber-950">하청업체 적용금액</span>
          <strong id="admin-subcontract-total" class="text-xl font-extrabold text-amber-700">0원</strong>
        </div>
      </div>

      <p class="text-[11px] leading-5 text-amber-800">
        관리자 확인용 계산값입니다. 고객 화면의 견적금액과 접수·저장되는 최종금액은 변경하지 않습니다.
      </p>
    </div>
  `;

  mount.card.insertAdjacentElement('afterend', panel);
  panel.querySelector('#admin-subcontract-enabled')?.addEventListener('change', updateCalculator);
  panel.querySelector('#admin-subcontract-percent')?.addEventListener('change', () => {
    // 할인율 선택만으로도 금액을 바로 확인할 수 있게 합니다.
    const enabled = panel.querySelector('#admin-subcontract-enabled');
    if (enabled) enabled.checked = true;
    updateCalculator();
  });
  return true;
}

function updateCalculator() {
  const panel = document.getElementById('admin-subcontract-calculator');
  if (!panel) return;

  const enabled = !!panel.querySelector('#admin-subcontract-enabled')?.checked;
  const result = panel.querySelector('#admin-subcontract-result');
  result?.classList.toggle('hidden', !enabled);
  if (!enabled) return;

  const selectedPercent = panel.querySelector('#admin-subcontract-percent')?.value ?? DEFAULT_SUBCONTRACT_PERCENT;
  const { original, total: discounted, percent, discountAmount } =
    calculateSubcontractDiscount(getCurrentQuoteTotal(), selectedPercent);

  const originalEl = panel.querySelector('#admin-subcontract-original');
  const discountEl = panel.querySelector('#admin-subcontract-discount-amount');
  const totalEl = panel.querySelector('#admin-subcontract-total');
  const discountLabel = panel.querySelector('#admin-subcontract-discount-label');

  if (discountLabel) discountLabel.textContent = `하청 할인 (${percent}%)`;
  if (originalEl) originalEl.textContent = `${original.toLocaleString()}원`;
  if (discountEl) discountEl.textContent = `-${discountAmount.toLocaleString()}원`;
  if (totalEl) totalEl.textContent = `${discounted.toLocaleString()}원`;
}

function bindQuoteWatcher() {
  const mount = getMountInfo();
  if (!mount?.source || mount.source.dataset.subcontractWatchBound === '1') return;
  mount.source.dataset.subcontractWatchBound = '1';

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updateCalculator();
    });
  }).observe(mount.source, { childList: true, subtree: true, characterData: true });

  if (currentFile() === 'quote-print.html') {
    const totalEl = document.getElementById('totalPrice');
    if (totalEl && totalEl.dataset.subcontractWatchBound !== '1') {
      totalEl.dataset.subcontractWatchBound = '1';
      new MutationObserver(updateCalculator).observe(totalEl, { childList: true, subtree: true, characterData: true });
    }
  }
}

async function enableForAdmin(user) {
  if (!ALLOWED_FILES.has(currentFile())) return;
  if (!await isAdmin(user)) {
    document.getElementById('admin-subcontract-calculator')?.remove();
    return;
  }

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

if (ALLOWED_FILES.has(currentFile())) {
  try {
    onAuthStateChanged(auth, user => enableForAdmin(user).catch(() => null));
    if (auth.currentUser) enableForAdmin(auth.currentUser).catch(() => null);
  } catch (_) {}
}
