// ============================================================
// book-a5-size.js — 책자/제본 A5 규격 보정
//
// - A5는 안정적인 저장키 "a5"를 사용합니다.
// - 실제 계산 배율은 settings/unitPriceConfig.book.sizeMultipliers.a5 에서 읽습니다.
// - 기본값은 A4의 85%입니다.
// - 기존 quote-book.js의 계산 구조를 유지하기 위해 parseFloat('a5')만 현재 배율로 해석합니다.
// ============================================================

import { db, doc, onSnapshot } from './firebase.js';

const DEFAULT_A5_MULTIPLIER = 0.85;
let a5Multiplier = DEFAULT_A5_MULTIPLIER;

function normalizeMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_A5_MULTIPLIER;
  // 잘못 입력된 값으로 견적이 과도하게 흔들리지 않도록 50~120% 범위만 허용합니다.
  if (n < 0.5 || n > 1.2) return DEFAULT_A5_MULTIPLIER;
  return n;
}

function percentText(multiplier) {
  return Math.round(normalizeMultiplier(multiplier) * 100);
}

// quote-book.js는 paperSize의 value를 parseFloat()하여 배율로 사용합니다.
// A5만 의미있는 문자열 키를 유지하면서 기존 계산 코드를 건드리지 않도록 한정 보정합니다.
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
  if (!select || !select.classList?.contains('paperSize')) return;

  const hadUnknownSavedValue = select.selectedIndex < 0 || select.value === '';
  let option = Array.from(select.options || []).find(o => o.value === 'a5');
  if (!option) {
    option = document.createElement('option');
    option.value = 'a5';
    option.dataset.sizeKey = 'a5';

    // A4 다음에 A5를 배치합니다.
    const a4Option = Array.from(select.options || []).find(o => o.value === '1');
    if (a4Option?.nextSibling) select.insertBefore(option, a4Option.nextSibling);
    else if (a4Option) a4Option.after(option);
    else select.prepend(option);
  }

  option.textContent = `A5 (국판 148×210) · A4의 ${percentText(a5Multiplier)}%`;
  option.dataset.multiplier = String(a5Multiplier);

  // 기존에 저장된 paperSize:'a5'를 정적 옵션이 없던 시점에 복원하면
  // selectedIndex가 -1이 됩니다. 이 경우 A5로 복구합니다.
  if (hadUnknownSavedValue) select.value = 'a5';
}

function applyToAllSelects() {
  document.querySelectorAll('select.paperSize').forEach(ensureA5Option);
}

function triggerRecalculateIfA5Selected() {
  const selected = Array.from(document.querySelectorAll('select.paperSize')).filter(s => s.value === 'a5');
  selected.forEach(select => {
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

function initObserver() {
  applyToAllSelects();
  const root = document.getElementById('quote-items-container') || document.body;
  if (!root) return;
  const observer = new MutationObserver(() => applyToAllSelects());
  observer.observe(root, { childList: true, subtree: true });
}

try {
  const ref = doc(db, 'settings', 'unitPriceConfig');
  onSnapshot(ref, snap => {
    const data = snap.exists() ? (snap.data() || {}) : {};
    updateMultiplier(data?.book?.sizeMultipliers?.a5 ?? DEFAULT_A5_MULTIPLIER);
  }, () => updateMultiplier(DEFAULT_A5_MULTIPLIER));
} catch (_) {
  updateMultiplier(DEFAULT_A5_MULTIPLIER);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObserver, { once: true });
} else {
  initObserver();
}

// 초기 렌더/폼 복원 타이밍 차이를 흡수합니다.
setTimeout(applyToAllSelects, 100);
setTimeout(applyToAllSelects, 500);
setTimeout(applyToAllSelects, 1500);
