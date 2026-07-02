// ============================================================
// wire-cover-patch.js — 책자/제본 입력 흐름 보정
//
// 역할:
//   - 책자/제본 페이지에서 견적 항목 순서를
//     기본 정보 → 제본 및 수량 → 표지 설정 → 내지 설정 → 비고로 보정합니다.
//   - 와이어 제본 선택 시 표지 인쇄를 A4 기준 앞면 출력 / 뒷면 출력 체크 방식으로 표시합니다.
//   - 고급 내지 스노우 120g/150g이 일정 페이지 이상이면 무선제본을 비활성화하고 안내문을 표시합니다.
//   - 기존 계산식과 호환되도록 coverPrintType 값을 자동 변환합니다.
// ============================================================

const WIRE_COVER_PATCH_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

const PERFECT_BINDING_LIMITS = {
  snow120: { limit: 80, label: '스노우 120g' },
  snow150: { limit: 60, label: '스노우 150g' },
};

let patchScheduled = false;
let recalcScheduled = false;

function isWireCoverPatchTarget() {
  return WIRE_COVER_PATCH_FILE === 'quote-book.html';
}

function scheduleRecalcFrom(itemEl) {
  if (recalcScheduled) return;
  recalcScheduled = true;
  setTimeout(() => {
    recalcScheduled = false;
    try {
      const target = itemEl?.querySelector?.('.quantity') || itemEl?.querySelector?.('.coverPrintType') || itemEl;
      target?.dispatchEvent?.(new Event('change', { bubbles: true }));
    } catch (_) {}
  }, 0);
}

function schedulePatchQuoteItems() {
  if (patchScheduled) return;
  patchScheduled = true;
  requestAnimationFrame(() => {
    patchScheduled = false;
    patchQuoteItemsNow();
  });
}

function sectionTitleText(section) {
  try { return (section?.querySelector?.('h2')?.textContent || '').replace(/\s+/g, ' ').trim(); }
  catch { return ''; }
}

function findSection(itemEl, keyword) {
  try {
    return Array.from(itemEl.children).find(child => sectionTitleText(child).includes(keyword)) || null;
  } catch { return null; }
}

function reorderQuoteItemSections(itemEl) {
  if (!itemEl || itemEl.dataset.bookSectionOrderPatched === '1') return;

  const bindingSection = findSection(itemEl, '제본 및 수량');
  const coverSection = findSection(itemEl, '표지 설정');
  const innerSection = findSection(itemEl, '내지 설정');
  if (!bindingSection || !coverSection || !innerSection) return;

  if (bindingSection.nextElementSibling !== coverSection) {
    itemEl.insertBefore(bindingSection, coverSection);
  }

  if (coverSection.nextElementSibling !== innerSection) {
    itemEl.insertBefore(coverSection, innerSection);
  }

  itemEl.dataset.bookSectionOrderPatched = '1';
}

function getPerfectBindingBlockReason(itemEl) {
  if (!itemEl) return '';
  const sections = Array.from(itemEl.querySelectorAll('.inner-section'));
  for (const section of sections) {
    const paperType = section.querySelector('.innerPaperType')?.value || '';
    const pages = parseInt(section.querySelector('.innerPages')?.value, 10) || 0;
    const info = PERFECT_BINDING_LIMITS[paperType];
    if (info && pages >= info.limit) {
      return `${info.label}은 ${info.limit}p 이상부터 무선제본이 잘 안될 수도 있습니다. 다른 제본 방식을 선택해 주세요.`;
    }
  }
  return '';
}

function ensurePerfectBindingWarning(itemEl) {
  if (!itemEl) return null;
  const bindingOptions = itemEl.querySelector('.binding-options');
  if (!bindingOptions) return null;

  let warning = itemEl.querySelector('.perfect-binding-warning');
  if (!warning) {
    warning = document.createElement('div');
    warning.className = 'perfect-binding-warning hidden mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 leading-relaxed';
    warning.innerHTML = `<i class="fas fa-triangle-exclamation mr-1"></i><span class="perfect-binding-warning-text">제본이 잘 안될 수도 있습니다.</span>`;
    bindingOptions.insertAdjacentElement('afterend', warning);
  }
  return warning;
}

function updatePerfectBindingAvailability(itemEl) {
  if (!itemEl) return;
  const perfectOption = itemEl.querySelector('.binding-options .option-card[data-value="perfect"]');
  const noneOption = itemEl.querySelector('.binding-options .option-card[data-value="none"]');
  const bindingInput = itemEl.querySelector('.bindingType');
  const warning = ensurePerfectBindingWarning(itemEl);
  if (!perfectOption || !bindingInput || !warning) return;

  const reason = getPerfectBindingBlockReason(itemEl);
  const blocked = !!reason;

  perfectOption.classList.toggle('disabled', blocked);
  perfectOption.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  perfectOption.title = blocked ? reason : '';

  const textEl = warning.querySelector('.perfect-binding-warning-text');
  if (textEl) textEl.textContent = reason || '';
  warning.classList.toggle('hidden', !blocked);

  if (blocked && bindingInput.value === 'perfect') {
    perfectOption.classList.remove('selected');
    noneOption?.classList.add('selected');
    bindingInput.value = 'none';
    scheduleRecalcFrom(itemEl);
  }
}

function ensureWireCoverBox(itemEl) {
  if (!itemEl) return;
  reorderQuoteItemSections(itemEl);
  updatePerfectBindingAvailability(itemEl);
  if (itemEl.dataset.wireCoverPatchReady === '1') return;

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

  front.addEventListener('change', () => { syncSelectFromChecks(); scheduleRecalcFrom(itemEl); });
  back.addEventListener('change', () => { syncSelectFromChecks(); scheduleRecalcFrom(itemEl); });
  coverPrintSelect.addEventListener('change', () => {
    if (bindingInput.value === 'wire') {
      syncChecksFromSelect();
      syncSelectFromChecks();
    }
  });

  const observer = new MutationObserver(updateVisibility);
  observer.observe(bindingInput, { attributes: true, attributeFilter: ['value'] });

  updateVisibility();
}

function patchQuoteItemsNow() {
  if (!isWireCoverPatchTarget()) return;
  document.querySelectorAll('.quote-item').forEach(itemEl => {
    reorderQuoteItemSections(itemEl);
    updatePerfectBindingAvailability(itemEl);
    ensureWireCoverBox(itemEl);
  });
}

function bindBookPatchEvents() {
  if (!isWireCoverPatchTarget()) return;
  if (document.documentElement.dataset.wireCoverPatchBound === '1') return;
  document.documentElement.dataset.wireCoverPatchBound = '1';

  document.addEventListener('click', (e) => {
    const card = e.target?.closest?.('.binding-options .option-card');
    if (!card) return;
    const itemEl = card.closest('.quote-item');

    if (card.dataset.value === 'perfect') {
      updatePerfectBindingAvailability(itemEl);
      if (card.classList.contains('disabled')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    }

    setTimeout(() => {
      reorderQuoteItemSections(itemEl);
      updatePerfectBindingAvailability(itemEl);
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

  document.addEventListener('input', (e) => {
    if (e.target?.closest?.('.quote-item')) schedulePatchQuoteItems();
  }, false);

  document.addEventListener('change', (e) => {
    if (e.target?.closest?.('.quote-item')) schedulePatchQuoteItems();
  }, false);

  const container = document.getElementById('quote-items-container');
  if (container) {
    const rootObserver = new MutationObserver(schedulePatchQuoteItems);
    rootObserver.observe(container, { childList: true });
  }
}

function initWireCoverPatch() {
  if (!isWireCoverPatchTarget()) return;
  patchQuoteItemsNow();
  bindBookPatchEvents();
  setTimeout(patchQuoteItemsNow, 300);
  setTimeout(patchQuoteItemsNow, 1000);
  setTimeout(patchQuoteItemsNow, 2000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWireCoverPatch, { once: true });
else initWireCoverPatch();
