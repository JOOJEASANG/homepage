// ============================================================
// book-a5-size.js — 책자/제본 A5 규격 보정
//
// - A5는 안정적인 저장키 "a5"를 사용합니다.
// - 실제 계산 배율은 settings/unitPriceConfig.book.sizeMultipliers.a5 에서 읽습니다.
// - 기본값은 A4의 85%입니다.
// - 기존 견적 초기화를 방해하지 않도록 DOM 보정과 설정 조회를 가볍게 수행합니다.
// ============================================================

import { db, doc, getDoc } from './firebase.js';

const DEFAULT_A5_MULTIPLIER = 0.85;
let a5Multiplier = DEFAULT_A5_MULTIPLIER;

function normalizeMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.5 || n > 1.2) return DEFAULT_A5_MULTIPLIER;
  return n;
}

function percentText(multiplier) {
  return Math.round(normalizeMultiplier(multiplier) * 100);
}

// quote-book.js는 paperSize 값을 parseFloat()하여 배율로 사용합니다.
// A5 문자열에 대해서만 현재 A5 배율을 반환하고 다른 값은 원래 parseFloat에 위임합니다.
try {
  if (!window.__bookA5ParseFloatPatched) {
    const nativeParseFloat = window.parseFloat.bind(window);
    window.__bookA5NativeParseFloat = nativeParseFloat;
    window.parseFloat = function(value) {
      if (String(value ?? '').trim().toLowerCase() === 'a5') return a5Multiplier;
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

  const expectedLabel = `A5 (국판 148×210) · A4의 ${percentText(a5Multiplier)}%`;
  const expectedMultiplier = String(a5Multiplier);

  // 같은 값을 반복해서 쓰면 MutationObserver가 계속 재호출될 수 있으므로
  // 실제로 달라진 경우에만 DOM을 변경합니다.
  if (option.textContent !== expectedLabel) {
    option.textContent = expectedLabel;
    changed = true;
  }
  if (option.dataset.multiplier !== expectedMultiplier) {
    option.dataset.multiplier = expectedMultiplier;
  }

  if (hadUnknownSavedValue) {
    select.value = 'a5';
  }

  return changed;
}

function applyToAllSelects() {
  document.querySelectorAll('select.paperSize').forEach(ensureA5Option);
}

function triggerRecalculateIfA5Selected() {
  document.querySelectorAll('select.paperSize').forEach(select => {
    if (select.value !== 'a5') return;
    try { select.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
  });
}

function updateMultiplier(next) {
  const normalized = normalizeMultiplier(next);
  const changed = Math.abs(normalized - a5Multiplier) > 0.000001;
  a5Multiplier = normalized;
  window.__bookA5Multiplier = a5Multiplier;
  applyToAllSelects();
  if (changed) triggerRecalculateIfA5Selected();
}

// 한 책자 항목 안에서는 모든 내지 구간의 규격을 동일하게 유지합니다.
// 어느 구간에서 규격을 바꾸더라도 표지/제본 기준과 내지 규격이 어긋나지 않게 합니다.
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

async function loadA5RateAfterBaseQuoteInit() {
  try {
    // 본 견적 페이지의 단가 설정 로딩이 먼저 끝나도록 약간 뒤에 읽습니다.
    await new Promise(resolve => setTimeout(resolve, 1200));
    const snap = await getDoc(doc(db, 'settings', 'unitPriceConfig'));
    const data = snap.exists() ? (snap.data() || {}) : {};
    updateMultiplier(data?.book?.sizeMultipliers?.a5 ?? DEFAULT_A5_MULTIPLIER);
  } catch (_) {
    // 별도 A5 설정 조회 실패가 전체 견적 로딩 실패로 이어지지 않도록 기본 85%를 사용합니다.
    updateMultiplier(DEFAULT_A5_MULTIPLIER);
  }
}

window.__bookA5Multiplier = a5Multiplier;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObserver, { once: true });
} else {
  initObserver();
}

// 초기 렌더와 폼 복원 타이밍 차이를 흡수하되 반복 DOM 갱신은 하지 않습니다.
setTimeout(applyToAllSelects, 150);
setTimeout(applyToAllSelects, 650);
setTimeout(applyToAllSelects, 1600);

loadA5RateAfterBaseQuoteInit();
