// ============================================================
// wire-cover-patch.js — 와이어 제본 표지 출력 선택 보정
//
// 역할:
//   - 책자/제본 페이지에서 와이어 제본 선택 시 표지 인쇄를
//     A4 기준 앞면 출력 / 뒷면 출력 체크 방식으로 선택하게 합니다.
//   - 기존 계산식과 호환되도록 coverPrintType 값을 자동 변환합니다.
//     선택 없음: none
//     앞면 또는 뒷면 중 1개: color_simplex
//     앞면 + 뒷면 2개: color_duplex
// ============================================================

const WIRE_COVER_PATCH_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

function isWireCoverPatchTarget() {
  return WIRE_COVER_PATCH_FILE === 'quote-book.html';
}

function fireRecalcFrom(itemEl) {
  try {
    const target = itemEl?.querySelector?.('.quantity') || itemEl?.querySelector?.('.coverPrintType') || itemEl;
    target?.dispatchEvent?.(new Event('input', { bubbles: true }));
    target?.dispatchEvent?.(new Event('change', { bubbles: true }));
  } catch (_) {}
}

function ensureWireCoverBox(itemEl) {
  if (!itemEl || itemEl.dataset.wireCoverPatchReady === '1') return;
  const coverPrintSelect = itemEl.querySelector('.coverPrintType');
  const bindingInput = itemEl.querySelector('.bindingType');
  if (!coverPrintSelect || !bindingInput) return;

  itemEl.dataset.wireCoverPatchReady = '1';

  const wrapper = document.createElement('div');
  wrapper.className = 'wire-cover-print-box md:col-span-2 hidden bg-blue-50 border border-blue-100 rounded-lg p-3 mt-1';
  wrapper.innerHTML = `
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs font-extrabold text-blue-700">와이어 표지 출력</div>
        <div class="text-[11px] text-blue-500">A4 기준 계산</div>
      </div>
      <div class="flex flex-wrap gap-4">
        <label class="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" class="wireCoverFront rounded text-brand-600 focus:ring-brand-500">
          <span>앞면 출력</span>
        </label>
        <label class="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" class="wireCoverBack rounded text-brand-600 focus:ring-brand-500">
          <span>뒷면 출력</span>
        </label>
      </div>
      <p class="text-[11px] text-slate-500 leading-relaxed">와이어 제본 선택 시 표지는 일반 책자 표지 펼침 기준이 아니라 A4 앞면/뒷면 출력 기준으로 계산됩니다.</p>
    </div>
  `;

  const coverGrid = coverPrintSelect.closest('.grid') || coverPrintSelect.closest('.bg-slate-50');
  const coverPrintField = coverPrintSelect.closest('div');
  if (coverPrintField && coverGrid) coverGrid.insertBefore(wrapper, coverPrintField.nextSibling);
  else coverPrintSelect.insertAdjacentElement('afterend', wrapper);

  const front = wrapper.querySelector('.wireCoverFront');
  const back = wrapper.querySelector('.wireCoverBack');

  function syncChecksFromSelect() {
    const v = coverPrintSelect.value;
    if (v === 'none') {
      front.checked = false;
      back.checked = false;
    } else if (v === 'color_duplex') {
      front.checked = true;
      back.checked = true;
    } else if (!front.checked && !back.checked) {
      front.checked = true;
      back.checked = false;
    }
  }

  function syncSelectFromChecks() {
    const count = (front.checked ? 1 : 0) + (back.checked ? 1 : 0);
    if (count === 0) coverPrintSelect.value = 'none';
    else if (count === 1) coverPrintSelect.value = 'color_simplex';
    else coverPrintSelect.value = 'color_duplex';

    // 기존 select만 저장/계산에 사용되므로, 뒷면만 단독 선택한 경우를 보조 데이터로 남깁니다.
    itemEl.dataset.wireCoverFront = front.checked ? '1' : '0';
    itemEl.dataset.wireCoverBack = back.checked ? '1' : '0';
  }

  function updateVisibility() {
    const isWire = bindingInput.value === 'wire';
    wrapper.classList.toggle('hidden', !isWire);
    coverPrintSelect.closest('div')?.classList.toggle('hidden', isWire);

    if (isWire) {
      syncChecksFromSelect();
      syncSelectFromChecks();
    }
  }

  front.addEventListener('change', () => { syncSelectFromChecks(); fireRecalcFrom(itemEl); });
  back.addEventListener('change', () => { syncSelectFromChecks(); fireRecalcFrom(itemEl); });
  coverPrintSelect.addEventListener('change', () => {
    if (bindingInput.value === 'wire') {
      syncChecksFromSelect();
      syncSelectFromChecks();
    }
  });

  const observer = new MutationObserver(updateVisibility);
  observer.observe(bindingInput, { attributes: true, attributeFilter: ['value'] });

  const originalValueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (originalValueDescriptor && !bindingInput.dataset.wireCoverValueHooked) {
    bindingInput.dataset.wireCoverValueHooked = '1';
  }

  updateVisibility();
}

function patchQuoteItems() {
  if (!isWireCoverPatchTarget()) return;
  document.querySelectorAll('.quote-item').forEach(ensureWireCoverBox);
}

function bindWireOptionClicks() {
  if (!isWireCoverPatchTarget()) return;
  if (document.documentElement.dataset.wireCoverPatchBound === '1') return;
  document.documentElement.dataset.wireCoverPatchBound = '1';

  document.addEventListener('click', (e) => {
    const card = e.target?.closest?.('.binding-options .option-card');
    if (!card) return;
    const itemEl = card.closest('.quote-item');
    setTimeout(() => {
      ensureWireCoverBox(itemEl);
      const box = itemEl?.querySelector?.('.wire-cover-print-box');
      const coverPrintSelect = itemEl?.querySelector?.('.coverPrintType');
      const isWire = itemEl?.querySelector?.('.bindingType')?.value === 'wire';
      box?.classList.toggle('hidden', !isWire);
      coverPrintSelect?.closest('div')?.classList.toggle('hidden', isWire);
      if (isWire) {
        const front = box?.querySelector?.('.wireCoverFront');
        const back = box?.querySelector?.('.wireCoverBack');
        if (front && back && !front.checked && !back.checked && coverPrintSelect?.value !== 'none') front.checked = true;
      }
    }, 0);
  }, true);

  document.addEventListener('input', patchQuoteItems, true);
  document.addEventListener('change', patchQuoteItems, true);

  const rootObserver = new MutationObserver(patchQuoteItems);
  rootObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

function initWireCoverPatch() {
  if (!isWireCoverPatchTarget()) return;
  patchQuoteItems();
  bindWireOptionClicks();
  setTimeout(patchQuoteItems, 300);
  setTimeout(patchQuoteItems, 1000);
  setTimeout(patchQuoteItems, 2000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWireCoverPatch, { once: true });
else initWireCoverPatch();
