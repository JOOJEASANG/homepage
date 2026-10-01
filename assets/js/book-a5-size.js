// ============================================================
// book-a5-size.js — 책자/제본 A5 규격 보정
//
// - A5는 안정적인 저장키 "a5"를 사용합니다.
// - A5 책자 항목은 표지/내지/간지/제본/후가공/디자인 등 계산 금액 전체에
//   A4 대비 70%를 공통 계산 단계에서 한 번만 적용합니다.
// - 개별 계산식에서 다시 70%를 곱하지 않도록 parseFloat('a5')는 내부적으로 1을 반환합니다.
// ============================================================

export const A5_FIXED_MULTIPLIER = 0.70;
const KNOWN_NON_A5_SIZE_VALUES = new Set(['0.9', '1', '1.8', '2']);

function percentText() {
  return Math.round(A5_FIXED_MULTIPLIER * 100);
}

// quote-book.js는 paperSize 값을 parseFloat()하여 규격 배율로 사용합니다.
// A5 여부는 전역 계산 컨텍스트로 표시하고, 실제 70% 적용은 calculator-utils.js의
// floorToHundred()에서 모든 금액 항목에 한 번만 수행합니다.
try {
  if (!window.__bookA5ParseFloatPatched) {
    const nativeParseFloat = window.parseFloat.bind(window);
    window.__bookA5NativeParseFloat = nativeParseFloat;
    window.parseFloat = function(value) {
      const key = String(value ?? '').trim().toLowerCase();
      if (key === 'a5') {
        window.__bookA5ActiveItem = true;
        return 1;
      }
      if (KNOWN_NON_A5_SIZE_VALUES.has(key)) {
        window.__bookA5ActiveItem = false;
      }
      return nativeParseFloat(value);
    };
    window.__bookA5ParseFloatPatched = true;
  }
} catch (_) {}

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

  const expectedLabel = `A5 (148×210) · A4의 ${percentText()}%`;
  if (option.textContent !== expectedLabel) {
    option.textContent = expectedLabel;
    changed = true;
  }
  option.dataset.multiplier = String(A5_FIXED_MULTIPLIER);

  if (hadUnknownSavedValue) {
    select.value = 'a5';
  }

  return changed;
}

function applyToAllSelects() {
  document.querySelectorAll('select.paperSize').forEach(ensureA5Option);
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

window.__bookA5FixedMultiplier = A5_FIXED_MULTIPLIER;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObserver, { once: true });
} else {
  initObserver();
}

setTimeout(applyToAllSelects, 150);
setTimeout(applyToAllSelects, 650);
setTimeout(applyToAllSelects, 1600);
