// ============================================================
// book-a5-rate-admin.js — 관리자 책자 단가설정 A5 정책 안내
//
// A5는 운영 혼선을 막기 위해 A4 대비 70%로 고정합니다.
// 기존 Firestore의 book.sizeMultipliers.a5 값은 더 이상 계산에 사용하지 않습니다.
// ============================================================

const FIXED_A5_PERCENT = 70;

function renderCard() {
  const host = document.getElementById('etc-price-sections');
  if (!host) return false;

  let card = document.getElementById('book-a5-rate-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'book-a5-rate-card';
    card.className = 'bg-emerald-50 p-5 rounded-xl border border-emerald-200 md:col-span-2';
    card.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-600 text-white text-xs font-extrabold">A5</span>
            <span class="text-sm font-extrabold text-slate-800">A5 적용률</span>
            <span class="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-extrabold text-white">${FIXED_A5_PERCENT}% 고정</span>
          </div>
          <p class="text-xs text-slate-600 leading-5 mt-2">
            A5 책자/제본은 A4 기준 금액의 70%를 일괄 적용합니다.
            표지·내지·간지·제본·오시·디자인 등 해당 책자 항목의 계산 금액 전체에 동일하게 적용되며,
            제본 방식(무선/와이어/중철/제본없음)에 따라 중복 할인되지 않습니다.
          </p>
          <div class="mt-3 text-[11px] font-semibold text-emerald-700">
            예: A4 기준 총 100,000원 → A5 적용 총 70,000원
          </div>
        </div>
      </div>
    `;
    host.prepend(card);
  }
  return true;
}

function startUiWatch() {
  if (renderCard()) return;
  const observer = new MutationObserver(() => {
    if (renderCard()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { renderCard(); observer.disconnect(); }, 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startUiWatch, { once: true });
} else {
  startUiWatch();
}
