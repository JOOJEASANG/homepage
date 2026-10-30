// ============================================================
// book-a5-size.js — 책자/제본 A5 규격 보정
//
// - A5는 안정적인 저장키 "a5"를 사용합니다.
// - A5 70%는 내지 인쇄비에만 적용합니다.
// - 표지·간지·제본·오시·디자인비에는 A5 할인율을 적용하지 않습니다.
// ============================================================

export const A5_INNER_MULTIPLIER = 0.70;

function percentText() {
  return Math.round(A5_INNER_MULTIPLIER * 100);
}

// 가격 계산은 quote-book/calculator-utils.js의 getBookSizeMultiplier()가
// 'a5'를 해석합니다. 전역 window.parseFloat를 바꾸면 다른 모듈까지 영향을
// 받아 불안정해지므로 더 이상 변경하지 않습니다.

function ensureA5Option(select) {
  if (!select || !select.classList?.contains('paperSize')) return false;

  const hadUnknownSavedValue = select.selectedIndex < 0 || select.value === '';
  let option = Array.from(select.options || []).find(o => o.value === 'a5');
  let changed = false;

  if (!option) {
    option = document.createElement('option');
    option.value = 'a5';
    option.dataset.sizeKey = 'a5';

    const a4Option = Array.from(select.options || []).find(o => o.value === '1');
    if (a4Option?.nextSibling) select.insertBefore(option, a4Option.nextSibling);
    else if (a4Option) a4Option.after(option);
    else select.prepend(option);
    changed = true;
  }

  const expectedLabel = `A5 (148×210) · 내지 A4의 ${percentText()}%`;
  if (option.textContent !== expectedLabel) {
    option.textContent = expectedLabel;
    changed = true;
  }
  option.dataset.multiplier = String(A5_INNER_MULTIPLIER);

  if (hadUnknownSavedValue) select.value = 'a5';
  return changed;
}

function applyToAllSelects() {
  document.querySelectorAll('select.paperSize').forEach(ensureA5Option);
}

function recalculateSelectedA5() {
  document.querySelectorAll('select.paperSize').forEach(select => {
    if (select.value !== 'a5') return;
    try { select.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
  });
}

// 한 책자 항목 안에서는 모든 내지 구간의 규격을 동일하게 유지합니다.
function syncBookItemPaperSizes(event) {
  const select = event.target?.closest?.('select.paperSize');
  if (!select) return;
  const item = select.closest('.quote-item');
  if (!item) return;
  const value = select.value;
  item.querySelectorAll('select.paperSize').forEach(other => {
    if (other !== select && other.value !== value) other.value = value;
  });
}

function inheritSizeForNewInnerSection(event) {
  const button = event.target?.closest?.('.add-inner-section-btn');
  if (!button) return;
  const item = button.closest('.quote-item');
  const baseValue = item?.querySelector('select.paperSize')?.value;
  if (!item || !baseValue) return;
  setTimeout(() => {
    const selects = Array.from(item.querySelectorAll('select.paperSize'));
    const newest = selects[selects.length - 1];
    if (newest && newest.value !== baseValue) {
      newest.value = baseValue;
      try { newest.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    }
  }, 0);
}

document.addEventListener('change', syncBookItemPaperSizes, true);
document.addEventListener('click', inheritSizeForNewInnerSection, true);

function initObserver() {
  applyToAllSelects();
  setTimeout(recalculateSelectedA5, 0);

  const root = document.getElementById('quote-items-container') || document.body;
  if (!root || root.dataset?.a5ObserverBound === '1') return;
  if (root.dataset) root.dataset.a5ObserverBound = '1';

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyToAllSelects();
    });
  });
  observer.observe(root, { childList: true, subtree: true });
}

window.__bookA5Multiplier = A5_INNER_MULTIPLIER;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObserver, { once: true });
} else {
  initObserver();
}

setTimeout(() => { applyToAllSelects(); recalculateSelectedA5(); }, 150);
setTimeout(() => { applyToAllSelects(); recalculateSelectedA5(); }, 650);
setTimeout(() => { applyToAllSelects(); recalculateSelectedA5(); }, 1600);
