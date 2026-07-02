// ============================================================
// book-item-unit-price-patch.js — 책자/제본 항목별 권당 단가 표시
//
// 역할:
//   - 다른 사양을 여러 개 추가했을 때 전체 평균 단가가 아니라
//     각 견적 항목별 평균 권당 단가를 표시합니다.
//   - 기존 계산 금액은 건드리지 않고, 오른쪽 견적 요약 표시 영역만 보정합니다.
// ============================================================

const BOOK_ITEM_UNIT_PRICE_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

let bookItemUnitPatchScheduled = false;

function isBookItemUnitPriceTarget() {
  return BOOK_ITEM_UNIT_PRICE_FILE === 'quote-book.html';
}

function parseWon(text) {
  const n = String(text || '').replace(/[^0-9]/g, '');
  return n ? Number(n) : 0;
}

function escapeTextForHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

function findItemTotal(card) {
  const rows = Array.from(card.querySelectorAll('div'));
  const row = rows.find(el => (el.textContent || '').includes('항목 합계'));
  if (!row) return 0;
  const candidates = Array.from(row.querySelectorAll('span, div')).map(el => parseWon(el.textContent));
  return Math.max(...candidates, 0);
}

function collectItemUnitPrices() {
  const priceBreakdown = document.getElementById('priceBreakdown');
  if (!priceBreakdown) return [];

  const summaryCard = Array.from(priceBreakdown.children).find(el => el.classList?.contains('bg-slate-800'));
  const itemCards = Array.from(priceBreakdown.children).filter(el => el !== summaryCard && el.querySelector?.('.font-bold.text-slate-800'));

  return itemCards.map((card, index) => {
    const title = card.querySelector('.font-bold.text-slate-800')?.textContent?.trim() || `견적항목 ${index + 1}`;
    const qtyText = card.querySelector('.text-brand-600')?.textContent || '';
    const quantity = parseWon(qtyText);
    const total = findItemTotal(card);
    const unit = quantity > 0 ? Math.round(total / quantity / 10) * 10 : 0;
    return { title, quantity, total, unit };
  }).filter(item => item.quantity > 0 && item.total > 0);
}

function renderItemUnitPriceRows(items) {
  if (!items.length) return '';
  return `
    <div class="book-item-unit-prices mt-2 pt-2 border-t border-slate-600 space-y-1.5">
      <div class="text-[11px] font-bold text-slate-400 mb-1">항목별 평균 권당 단가</div>
      ${items.map(item => `
        <div class="flex justify-between gap-3 text-xs text-slate-300">
          <span class="truncate max-w-[170px]">${escapeTextForHtml(item.title)}</span>
          <span class="font-bold text-slate-100 whitespace-nowrap">${item.unit.toLocaleString()}원/부 <span class="font-medium text-slate-400">× ${item.quantity.toLocaleString()}부</span></span>
        </div>
      `).join('')}
    </div>
  `;
}

function applyBookItemUnitPricePatch() {
  if (!isBookItemUnitPriceTarget()) return;
  const priceBreakdown = document.getElementById('priceBreakdown');
  if (!priceBreakdown) return;

  const summaryCard = Array.from(priceBreakdown.children).find(el => el.classList?.contains('bg-slate-800'));
  if (!summaryCard) return;

  const items = collectItemUnitPrices();
  if (!items.length) return;

  summaryCard.querySelector('.book-item-unit-prices')?.remove();

  const legacyUnitRow = Array.from(summaryCard.querySelectorAll('div')).find(el => {
    const text = el.textContent || '';
    return text.includes('권당 단가') && !el.classList.contains('book-item-unit-prices');
  });

  if (legacyUnitRow) {
    legacyUnitRow.outerHTML = renderItemUnitPriceRows(items);
  } else {
    summaryCard.insertAdjacentHTML('beforeend', renderItemUnitPriceRows(items));
  }
}

function scheduleBookItemUnitPricePatch() {
  if (bookItemUnitPatchScheduled) return;
  bookItemUnitPatchScheduled = true;
  requestAnimationFrame(() => {
    bookItemUnitPatchScheduled = false;
    applyBookItemUnitPricePatch();
  });
}

function bindBookItemUnitPricePatch() {
  if (!isBookItemUnitPriceTarget()) return;
  if (document.documentElement.dataset.bookItemUnitPricePatchBound === '1') return;
  document.documentElement.dataset.bookItemUnitPricePatchBound = '1';

  const priceBreakdown = document.getElementById('priceBreakdown');
  if (priceBreakdown) {
    new MutationObserver(scheduleBookItemUnitPricePatch).observe(priceBreakdown, { childList: true, subtree: true });
  }

  document.addEventListener('input', e => {
    if (e.target?.closest?.('.quote-item')) scheduleBookItemUnitPricePatch();
  }, false);

  document.addEventListener('change', e => {
    if (e.target?.closest?.('.quote-item')) scheduleBookItemUnitPricePatch();
  }, false);

  document.addEventListener('click', e => {
    if (e.target?.closest?.('.quote-item') || e.target?.closest?.('#add-quote-item-btn')) {
      setTimeout(scheduleBookItemUnitPricePatch, 0);
    }
  }, true);

  document.addEventListener('click', e => {
    if (e.target?.closest?.('#submitQuoteBtn')) applyBookItemUnitPricePatch();
  }, true);
}

function initBookItemUnitPricePatch() {
  if (!isBookItemUnitPriceTarget()) return;
  applyBookItemUnitPricePatch();
  bindBookItemUnitPricePatch();
  setTimeout(applyBookItemUnitPricePatch, 300);
  setTimeout(applyBookItemUnitPricePatch, 1000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBookItemUnitPricePatch, { once: true });
else initBookItemUnitPricePatch();
