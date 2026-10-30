// ============================================================
// wire-cover-patch.js — 책자/제본 입력 흐름 보정
//
// 역할:
//   - 책자/제본 페이지에서 견적 항목 순서를
//     기본 정보(품명·수량) → 제본방식 → 표지 → 내지 → 요청사항으로 보정합니다.
//   - 와이어 제본은 앞·뒤 표지별 출력 선택과 단면/양면 설정을 제공합니다.
//   - 고급 내지 스노우 120g/150g이 일정 페이지 이상이면 무선제본을 비활성화하고 안내문을 표시합니다.
//   - 기존 견적/단가 방식과 호환되도록 coverPrintType 및 별도 인쇄면 설정을 동기화합니다.
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
      // 책자 견적은 form의 input 이벤트에서 계산합니다. change만 보내면 이전 금액이 남습니다.
      target?.dispatchEvent?.(new Event('input', { bubbles: true }));
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

function reorderQuoteItemSections(itemEl) {
  if (!itemEl || itemEl.dataset.bookSectionOrderPatched === '1') return;

  const orderedStageKeys = ['basics', 'binding', 'cover', 'inner', 'remarks'];
  const stages = orderedStageKeys.map(key => itemEl.querySelector(`[data-order-stage="${key}"]`));
  const header = itemEl.querySelector('.quote-item-header');
  if (!header || stages.some(stage => !stage)) return;

  let previous = header;
  stages.forEach((stage, index) => {
    if (previous.nextElementSibling !== stage) previous.insertAdjacentElement('afterend', stage);
    const stepNumber = stage.querySelector('.step-number');
    if (stepNumber) stepNumber.textContent = String(index + 1).padStart(2, '0');
    previous = stage;
  });

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
    // 선택 불가능한 제본 해제 후에도 명시적으로 선택해야 '제본안함'이 됩니다.
    bindingInput.value = '';
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
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs font-extrabold text-blue-700">와이어 표지 출력</div>
        <div class="text-[11px] text-blue-500">표지별 단면·양면 선택 / A4 기준</div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="rounded-lg border border-blue-100 bg-white p-3 flex flex-col gap-2">
          <label class="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700">
            <input type="checkbox" class="wireCoverFront rounded text-brand-600 focus:ring-brand-500">
            <span>앞면 출력</span>
          </label>
          <select class="wireCoverFrontMode form-select w-full text-sm" aria-label="앞표지 단면 또는 양면">
            <option value="simplex">단면 출력</option>
            <option value="duplex">양면 출력</option>
          </select>
        </div>
        <div class="rounded-lg border border-blue-100 bg-white p-3 flex flex-col gap-2">
          <label class="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700">
            <input type="checkbox" class="wireCoverBack rounded text-brand-600 focus:ring-brand-500">
            <span>뒷면 출력</span>
          </label>
          <select class="wireCoverBackMode form-select w-full text-sm" aria-label="뒷표지 단면 또는 양면">
            <option value="simplex">단면 출력</option>
            <option value="duplex">양면 출력</option>
          </select>
        </div>
      </div>
      <p class="text-[11px] text-slate-500 leading-relaxed">앞면·뒷면 표지를 각각 출력할 수 있으며, 선택한 표지의 단면은 1면, 양면은 2면 비용으로 계산됩니다.</p>
    </div>
  `;

  const coverGrid = coverPrintSelect.closest('.grid') || coverPrintSelect.closest('.bg-slate-50');
  const coverPrintField = coverPrintSelect.closest('div');
  if (coverPrintField && coverGrid) coverGrid.insertBefore(wrapper, coverPrintField.nextSibling);
  else coverPrintSelect.insertAdjacentElement('afterend', wrapper);

  const front = wrapper.querySelector('.wireCoverFront');
  const back = wrapper.querySelector('.wireCoverBack');
  const frontMode = wrapper.querySelector('.wireCoverFrontMode');
  const backMode = wrapper.querySelector('.wireCoverBackMode');
  let initialised = false;

  function readInitialState() {
    if (initialised) return;
    initialised = true;
    if (itemEl.dataset.wireCoverSettings === '1') {
      front.checked = itemEl.dataset.wireCoverFront === '1';
      back.checked = itemEl.dataset.wireCoverBack === '1';
      frontMode.value = itemEl.dataset.wireCoverFrontMode === 'duplex' ? 'duplex' : 'simplex';
      backMode.value = itemEl.dataset.wireCoverBackMode === 'duplex' ? 'duplex' : 'simplex';
    } else {
      // 기존 견적은 color_duplex가 '앞·뒤 표지 출력'을 의미했습니다.
      // 별도 인쇄면 정보가 없으므로 각각 단면으로 복원합니다.
      front.checked = coverPrintSelect.value !== 'none';
      back.checked = coverPrintSelect.value === 'color_duplex';
      frontMode.value = 'simplex';
      backMode.value = 'simplex';
    }
  }

  function syncSelectFromChecks() {
    const impressions = (front.checked ? (frontMode.value === 'duplex' ? 2 : 1) : 0)
      + (back.checked ? (backMode.value === 'duplex' ? 2 : 1) : 0);
    // 기존 출력 정보는 인쇄된 실제 면 수를 반영하고, 별도 저장 필드로 표지별 설정을 보존합니다.
    coverPrintSelect.value = impressions >= 2 ? 'color_duplex' : impressions === 1 ? 'color_simplex' : 'none';

    itemEl.dataset.wireCoverSettings = '1';
    itemEl.dataset.wireCoverFront = front.checked ? '1' : '0';
    itemEl.dataset.wireCoverBack = back.checked ? '1' : '0';
    itemEl.dataset.wireCoverFrontMode = frontMode.value;
    itemEl.dataset.wireCoverBackMode = backMode.value;

    frontMode.disabled = !front.checked;
    backMode.disabled = !back.checked;
  }

  function updateVisibility() {
    const isWire = bindingInput.value === 'wire';
    wrapper.classList.toggle('hidden', !isWire);
    coverPrintSelect.closest('div')?.classList.toggle('hidden', isWire);
    if (isWire) {
      readInitialState();
      syncSelectFromChecks();
    }
  }

  for (const control of [front, back, frontMode, backMode]) {
    control.addEventListener('change', () => {
      syncSelectFromChecks();
      scheduleRecalcFrom(itemEl);
    });
  }

  // 기존 드래프트 불러오기 등 외부에서 기존 select를 변경하는 흐름과 호환합니다.
  coverPrintSelect.addEventListener('change', () => {
    if (bindingInput.value === 'wire') syncSelectFromChecks();
  });

  const observer = new MutationObserver(updateVisibility);
  observer.observe(bindingInput, { attributes: true, attributeFilter: ['value'] });
  itemEl.__refreshWireCover = updateVisibility;
  updateVisibility();
  // 비동기 패치가 생성되기 전에 초기 견적이 계산됐다면 저장된 단/양면 설정으로 다시 계산합니다.
  if (bindingInput.value === 'wire') scheduleRecalcFrom(itemEl);
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
      // 제본 방식에 맞춰 표지 컨트롤을 표시하고 다시 계산합니다.
      itemEl?.__refreshWireCover?.();
      scheduleRecalcFrom(itemEl);
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
