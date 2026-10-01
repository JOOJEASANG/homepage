// ============================================================
// book-a5-display-fix.js — A5 70% 적용 단가 표시 보정
//
// 실제 금액은 calculator-utils.js에서 일괄 70% 적용됩니다.
// 이 모듈은 오른쪽 견적 요약의 원/부·원/p·원/장 표시도 같은 70% 기준으로 맞춥니다.
// ============================================================

const A5_DISPLAY_MULTIPLIER = 0.70;

function isA5Item(itemEl) {
  return itemEl?.querySelector?.('select.paperSize')?.value === 'a5';
}

function parseNumber(text) {
  const match = String(text || '').match(/([0-9][0-9,]*)\s*원\/(부|p|장)/);
  if (!match) return null;
  return { value: Number(match[1].replace(/,/g, '')), unit: match[2], raw: match[0] };
}

function patchUnitLabel(el) {
  if (!el) return;
  const parsed = parseNumber(el.textContent);
  if (!parsed) return;

  const sourceText = el.dataset.a5BaseUnitText || el.textContent;
  const sourceParsed = parseNumber(sourceText);
  if (!sourceParsed) return;

  el.dataset.a5BaseUnitText = sourceText;
  const discounted = Math.round(sourceParsed.value * A5_DISPLAY_MULTIPLIER);
  el.textContent = sourceText.replace(sourceParsed.raw, `${discounted.toLocaleString()}원/${sourceParsed.unit}`);
}

function clearUnitLabelPatch(el) {
  if (!el?.dataset?.a5BaseUnitText) return;
  el.textContent = el.dataset.a5BaseUnitText;
  delete el.dataset.a5BaseUnitText;
}

function applyA5DisplayFix() {
  const priceBreakdown = document.getElementById('priceBreakdown');
  if (!priceBreakdown) return;

  const formItems = Array.from(document.querySelectorAll('.quote-item'));
  const summary = Array.from(priceBreakdown.children).find(el => el.classList?.contains('bg-slate-800'));
  const cards = Array.from(priceBreakdown.children).filter(el => el !== summary && el.querySelector?.('.font-bold.text-slate-800'));

  cards.forEach((card, index) => {
    const a5 = isA5Item(formItems[index]);
    card.querySelectorAll('.text-slate-500.text-xs').forEach(label => {
      if (a5) patchUnitLabel(label);
      else clearUnitLabelPatch(label);
    });

    let badge = card.querySelector('.a5-uniform-rate-badge');
    if (a5 && !badge) {
      badge = document.createElement('div');
      badge.className = 'a5-uniform-rate-badge mt-2 text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-1';
      badge.textContent = 'A5 전체 금액 · A4 기준 70% 일괄 적용';
      card.appendChild(badge);
    }
    if (!a5) badge?.remove();
  });
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyA5DisplayFix();
  });
}

function init() {
  const priceBreakdown = document.getElementById('priceBreakdown');
  if (priceBreakdown && priceBreakdown.dataset.a5DisplayFixBound !== '1') {
    priceBreakdown.dataset.a5DisplayFixBound = '1';
    new MutationObserver(schedule).observe(priceBreakdown, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener('change', e => {
    if (e.target?.closest?.('.quote-item')) setTimeout(schedule, 0);
  }, true);
  document.addEventListener('input', e => {
    if (e.target?.closest?.('.quote-item')) setTimeout(schedule, 0);
  }, true);
  schedule();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
