// ============================================================
// book-no-binding-cover-patch.js — 제본 안함 선택 시 표지 옵션 비활성화
// ============================================================

const NO_BINDING_COVER_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

let noBindingCoverPatchScheduled = false;
let noBindingCoverRecalcScheduled = false;

function isNoBindingCoverTarget() {
  return NO_BINDING_COVER_FILE === 'quote-book.html';
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

function scheduleRecalc(itemEl) {
  if (noBindingCoverRecalcScheduled) return;
  noBindingCoverRecalcScheduled = true;
  setTimeout(() => {
    noBindingCoverRecalcScheduled = false;
    try {
      const target = itemEl?.querySelector?.('.quantity') || itemEl?.querySelector?.('.coverPrintType') || itemEl;
      target?.dispatchEvent?.(new Event('change', { bubbles: true }));
    } catch (_) {}
  }, 0);
}

function ensureNoBindingCoverWarning(coverSection) {
  if (!coverSection) return null;
  let warning = coverSection.querySelector('.no-binding-cover-warning');
  if (!warning) {
    warning = document.createElement('div');
    warning.className = 'no-binding-cover-warning hidden mt-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 leading-relaxed';
    warning.innerHTML = '<i class="fas fa-circle-info mr-1"></i>제본 안함 선택 시 표지 옵션은 적용되지 않습니다.';
    coverSection.appendChild(warning);
  }
  return warning;
}

function updateNoBindingCoverState(itemEl, shouldRecalc = false) {
  if (!itemEl) return;
  const bindingInput = itemEl.querySelector('.bindingType');
  const coverSection = findSection(itemEl, '표지 설정');
  if (!bindingInput || !coverSection) return;

  const isNoBinding = bindingInput.value === 'none';
  const warning = ensureNoBindingCoverWarning(coverSection);
  const coverPaper = itemEl.querySelector('.coverPaperType');
  const coverPrint = itemEl.querySelector('.coverPrintType');
  const coverDesign = itemEl.querySelector('.coverDesign');
  const coverOshi = itemEl.querySelector('.coverOshi');

  let changed = false;
  if (isNoBinding) {
    if (coverPaper && coverPaper.value !== 'none' && Array.from(coverPaper.options).some(o => o.value === 'none')) {
      coverPaper.value = 'none';
      changed = true;
    }
    if (coverPrint && coverPrint.value !== 'none') {
      coverPrint.value = 'none';
      changed = true;
    }
    if (coverDesign?.checked) {
      coverDesign.checked = false;
      changed = true;
    }
    if (coverOshi?.checked) {
      coverOshi.checked = false;
      changed = true;
    }
    itemEl.dataset.wireCoverFront = '0';
    itemEl.dataset.wireCoverBack = '0';
    itemEl.querySelectorAll('.wireCoverFront, .wireCoverBack').forEach(el => { el.checked = false; });
    itemEl.querySelector('.wire-cover-print-box')?.classList.add('hidden');
  }

  coverSection.classList.toggle('opacity-50', isNoBinding);
  coverSection.querySelectorAll('select, input, button').forEach(el => {
    el.disabled = isNoBinding;
  });
  warning?.classList.toggle('hidden', !isNoBinding);

  if ((changed || shouldRecalc) && isNoBinding) scheduleRecalc(itemEl);
}

function patchAllNoBindingCoverItems() {
  if (!isNoBindingCoverTarget()) return;
  document.querySelectorAll('.quote-item').forEach(itemEl => updateNoBindingCoverState(itemEl, false));
}

function schedulePatchAllNoBindingCoverItems() {
  if (noBindingCoverPatchScheduled) return;
  noBindingCoverPatchScheduled = true;
  requestAnimationFrame(() => {
    noBindingCoverPatchScheduled = false;
    patchAllNoBindingCoverItems();
  });
}

function bindNoBindingCoverPatch() {
  if (!isNoBindingCoverTarget()) return;
  if (document.documentElement.dataset.noBindingCoverPatchBound === '1') return;
  document.documentElement.dataset.noBindingCoverPatchBound = '1';

  document.addEventListener('click', (e) => {
    const card = e.target?.closest?.('.binding-options .option-card');
    if (!card) return;
    const itemEl = card.closest('.quote-item');
    setTimeout(() => updateNoBindingCoverState(itemEl, true), 0);
  }, true);

  document.addEventListener('input', (e) => {
    if (e.target?.closest?.('.quote-item')) schedulePatchAllNoBindingCoverItems();
  }, false);

  document.addEventListener('change', (e) => {
    if (e.target?.closest?.('.quote-item')) schedulePatchAllNoBindingCoverItems();
  }, false);

  const container = document.getElementById('quote-items-container');
  if (container) {
    new MutationObserver(schedulePatchAllNoBindingCoverItems).observe(container, { childList: true });
  }
}

function initNoBindingCoverPatch() {
  if (!isNoBindingCoverTarget()) return;
  patchAllNoBindingCoverItems();
  bindNoBindingCoverPatch();
  setTimeout(patchAllNoBindingCoverItems, 300);
  setTimeout(patchAllNoBindingCoverItems, 1000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNoBindingCoverPatch, { once: true });
else initNoBindingCoverPatch();
