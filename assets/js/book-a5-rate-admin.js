// ============================================================
// book-a5-rate-admin.js — 관리자 책자 단가설정 A5 정책 안내
//
// A5 내지 인쇄비는 A4 기준 70%로 고정합니다.
// 표지·간지·제본·오시·디자인비는 기존 단가를 그대로 사용합니다.
// ============================================================

const FIXED_A5_INNER_PERCENT = 70;

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
            <span class="text-sm font-extrabold text-slate-800">A5 내지 적용률</span>
            <span class="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-extrabold text-white">${FIXED_A5_INNER_PERCENT}% 고정</span>
          </div>
          <p class="text-xs text-slate-600 leading-5 mt-2">
            A5 선택 시 <strong>내지 인쇄비만</strong> A4 기준의 70%로 계산합니다.
            표지·간지·제본·오시·디자인비는 A5 할인 없이 기존 단가를 그대로 적용합니다.
          </p>
          <div class="mt-3 text-[11px] font-semibold text-emerald-700">
            예: A4 기준 내지 인쇄비 100,000원 → A5 내지 인쇄비 70,000원
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
