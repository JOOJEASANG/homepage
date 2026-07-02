// ============================================================
// book-quote-ux-polish.js — 책자/제본 견적페이지 UX/UI 개선
// ============================================================

const BOOK_UX_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

let bookUxScheduled = false;

function isBookUxTarget() {
  return BOOK_UX_FILE === 'quote-book.html';
}

function injectBookUxStyle() {
  if (!isBookUxTarget()) return;
  if (document.getElementById('book-quote-ux-polish-style')) return;

  const style = document.createElement('style');
  style.id = 'book-quote-ux-polish-style';
  style.textContent = `
    body {
      background:
        radial-gradient(circle at top left, rgba(34,197,94,.08), transparent 32rem),
        linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%) !important;
    }

    #main-content {
      max-width: 1320px;
    }

    .book-ux-flow {
      display: flex;
      flex-wrap: wrap;
      gap: .5rem;
      margin-top: 1rem;
    }
    .book-ux-flow span {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      padding: .45rem .7rem;
      border: 1px solid #dcfce7;
      border-radius: 999px;
      background: rgba(240,253,244,.85);
      color: #166534;
      font-size: 12px;
      font-weight: 900;
      box-shadow: 0 1px 2px rgba(15,23,42,.04);
    }
    .book-ux-flow b {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: #16a34a;
      color: #fff;
      font-size: 11px;
      line-height: 1;
    }

    .quote-item {
      border: 1px solid rgba(148,163,184,.24) !important;
      border-radius: 24px !important;
      padding: 0 !important;
      overflow: hidden;
      background: rgba(255,255,255,.96) !important;
      box-shadow: 0 18px 45px rgba(15,23,42,.07), 0 1px 2px rgba(15,23,42,.04) !important;
    }
    .quote-item-header {
      padding: 1.15rem 1.35rem !important;
      margin-bottom: 0 !important;
      border-bottom: 1px solid #eef2f7 !important;
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    }
    .quote-item > .mb-8,
    .quote-item > div:not(.quote-item-header):not(:last-child) {
      margin: 0 !important;
      padding: 1.15rem 1.35rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .quote-item > div:last-child:not(.quote-item-header) {
      padding: 1.15rem 1.35rem 1.35rem;
    }

    .book-ux-section-title {
      margin-bottom: .75rem !important;
      color: #0f172a !important;
      font-size: .82rem !important;
      letter-spacing: .02em !important;
    }
    .book-ux-step-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: #16a34a;
      color: #fff;
      font-size: 12px;
      font-weight: 900;
      box-shadow: 0 6px 14px rgba(22,163,74,.22);
    }

    .quote-item .bg-slate-50,
    .inner-section,
    .interleaf-section {
      border-radius: 18px !important;
      border-color: #e2e8f0 !important;
      background: #f8fafc !important;
    }
    .quote-item .form-input,
    .quote-item .form-select,
    .quote-item .form-textarea {
      min-height: 44px;
      border-radius: 12px !important;
      border-color: #dbe3ee !important;
      box-shadow: 0 1px 0 rgba(15,23,42,.02);
    }
    .quote-item .form-input:focus,
    .quote-item .form-select:focus,
    .quote-item .form-textarea:focus {
      border-color: #16a34a !important;
      box-shadow: 0 0 0 4px rgba(34,197,94,.12) !important;
    }

    .option-card {
      min-height: 132px;
      border-radius: 18px !important;
      border-color: #dbe3ee !important;
      background: #fff !important;
      box-shadow: 0 1px 2px rgba(15,23,42,.04);
    }
    .option-card:hover:not(.disabled) {
      transform: translateY(-2px);
      border-color: #86efac !important;
      box-shadow: 0 10px 22px rgba(22,163,74,.10);
    }
    .option-card.selected {
      position: relative;
      border-color: #16a34a !important;
      background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%) !important;
      box-shadow: 0 0 0 2px rgba(22,163,74,.18), 0 12px 28px rgba(22,163,74,.12) !important;
    }
    .option-card.selected::after {
      content: '선택됨';
      position: absolute;
      top: .55rem;
      right: .55rem;
      padding: .18rem .42rem;
      border-radius: 999px;
      background: #16a34a;
      color: white;
      font-size: 10px;
      font-weight: 900;
    }
    .option-card.disabled {
      filter: grayscale(.25);
      opacity: .48 !important;
    }
    .option-card.disabled::before {
      content: '선택 불가';
      position: absolute;
      top: .55rem;
      right: .55rem;
      padding: .18rem .42rem;
      border-radius: 999px;
      background: #e2e8f0;
      color: #64748b;
      font-size: 10px;
      font-weight: 900;
    }

    .book-item-live-summary {
      display: flex;
      flex-wrap: wrap;
      gap: .35rem;
      justify-content: flex-end;
      margin-left: auto;
    }
    .book-item-live-summary span {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
      padding: .28rem .5rem;
      border-radius: 999px;
      background: #f1f5f9;
      color: #475569;
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
    }
    .book-item-live-summary .binding {
      background: #ecfdf5;
      color: #047857;
    }

    .wire-cover-print-box,
    .perfect-binding-warning,
    .no-binding-cover-warning {
      border-radius: 14px !important;
    }

    .lg\\:col-span-4 .sticky > .bg-white,
    .lg\\:col-span-4 .sticky > div {
      border-radius: 22px !important;
      box-shadow: 0 14px 36px rgba(15,23,42,.08) !important;
    }
    #priceBreakdown > div,
    #priceBreakdown li {
      border-radius: 14px;
    }
    #submitQuoteBtn {
      min-height: 48px;
      border-radius: 14px !important;
      font-weight: 900 !important;
    }
    #resetFormBtn {
      min-height: 48px;
      border-radius: 14px !important;
    }
    #add-quote-item-btn {
      border-radius: 20px !important;
      background: rgba(255,255,255,.78);
    }

    @media (max-width: 1023px) {
      .lg\\:col-span-4 .sticky {
        position: static !important;
      }
      .quote-item-header {
        align-items: flex-start !important;
        gap: .75rem;
      }
      .book-item-live-summary {
        width: 100%;
        justify-content: flex-start;
        margin-left: 0;
      }
    }

    @media (max-width: 640px) {
      #main-content {
        padding-left: .9rem !important;
        padding-right: .9rem !important;
      }
      .quote-item-header,
      .quote-item > .mb-8,
      .quote-item > div:not(.quote-item-header):not(:last-child),
      .quote-item > div:last-child:not(.quote-item-header) {
        padding-left: 1rem !important;
        padding-right: 1rem !important;
      }
      .option-card {
        min-height: 116px;
        padding: .9rem .65rem !important;
      }
      .book-ux-flow span {
        font-size: 11px;
      }
    }
  `;
  document.head.appendChild(style);
}

function injectFlowGuide() {
  const titleWrap = document.querySelector('#main-content h1')?.closest('.lg\\:col-span-8') || document.querySelector('#main-content h1')?.parentElement?.parentElement;
  if (!titleWrap || titleWrap.querySelector('.book-ux-flow')) return;
  const flow = document.createElement('div');
  flow.className = 'book-ux-flow';
  flow.innerHTML = `
    <span><b>1</b> 제본·수량</span>
    <span><b>2</b> 표지</span>
    <span><b>3</b> 내지</span>
    <span><b>4</b> 견적 확인</span>
  `;
  titleWrap.appendChild(flow);
}

function getBindingText(value) {
  return ({ perfect: '무선제본', wire: '와이어', saddle: '중철', none: '제본안함' })[value] || '제본 선택';
}

function enhanceQuoteItem(itemEl, index) {
  if (!itemEl) return;

  const sectionLabels = ['기본 정보', '제본 및 수량', '표지 설정', '내지 설정', '비고'];
  Array.from(itemEl.children).forEach(section => {
    const title = section.querySelector?.('h2');
    if (!title || title.dataset.bookUxTitleReady === '1') return;
    const txt = (title.textContent || '').replace(/\s+/g, ' ').trim();
    const step = sectionLabels.findIndex(label => txt.includes(label)) + 1;
    if (step > 0) {
      title.dataset.bookUxTitleReady = '1';
      title.classList.add('book-ux-section-title');
      const badge = document.createElement('span');
      badge.className = 'book-ux-step-badge';
      badge.textContent = String(step);
      title.insertBefore(badge, title.firstChild);
    }
  });

  const header = itemEl.querySelector('.quote-item-header');
  if (header && !header.querySelector('.book-item-live-summary')) {
    const summary = document.createElement('div');
    summary.className = 'book-item-live-summary';
    header.appendChild(summary);
  }

  updateLiveSummary(itemEl);
}

function updateLiveSummary(itemEl) {
  const summary = itemEl?.querySelector?.('.book-item-live-summary');
  if (!summary) return;
  const binding = itemEl.querySelector('.bindingType')?.value || 'none';
  const qty = parseInt(itemEl.querySelector('.quantity')?.value, 10) || 0;
  let pages = 0;
  itemEl.querySelectorAll('.innerPages').forEach(el => { pages += parseInt(el.value, 10) || 0; });
  const coverPrint = itemEl.querySelector('.coverPrintType')?.value || 'none';
  const coverText = coverPrint === 'none' ? '표지 없음' : (coverPrint === 'color_duplex' ? '표지 양면' : '표지 단면');

  summary.innerHTML = `
    <span class="binding"><i class="fas fa-book-open"></i>${getBindingText(binding)}</span>
    <span><i class="fas fa-layer-group"></i>${pages || 0}p</span>
    <span><i class="fas fa-box"></i>${qty || 0}부</span>
    <span><i class="fas fa-file-lines"></i>${coverText}</span>
  `;
}

function enhanceBookQuotePageNow() {
  if (!isBookUxTarget()) return;
  injectBookUxStyle();
  injectFlowGuide();
  document.querySelectorAll('.quote-item').forEach((itemEl, index) => enhanceQuoteItem(itemEl, index));
}

function scheduleEnhanceBookQuotePage() {
  if (bookUxScheduled) return;
  bookUxScheduled = true;
  requestAnimationFrame(() => {
    bookUxScheduled = false;
    enhanceBookQuotePageNow();
  });
}

function bindBookUxPolish() {
  if (!isBookUxTarget()) return;
  if (document.documentElement.dataset.bookUxPolishBound === '1') return;
  document.documentElement.dataset.bookUxPolishBound = '1';

  document.addEventListener('input', e => {
    if (e.target?.closest?.('.quote-item')) scheduleEnhanceBookQuotePage();
  }, false);
  document.addEventListener('change', e => {
    if (e.target?.closest?.('.quote-item')) scheduleEnhanceBookQuotePage();
  }, false);
  document.addEventListener('click', e => {
    if (e.target?.closest?.('.quote-item')) setTimeout(scheduleEnhanceBookQuotePage, 0);
  }, true);

  const container = document.getElementById('quote-items-container');
  if (container) new MutationObserver(scheduleEnhanceBookQuotePage).observe(container, { childList: true });
}

function initBookUxPolish() {
  if (!isBookUxTarget()) return;
  enhanceBookQuotePageNow();
  bindBookUxPolish();
  setTimeout(enhanceBookQuotePageNow, 300);
  setTimeout(enhanceBookQuotePageNow, 1000);
  setTimeout(enhanceBookQuotePageNow, 2000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBookUxPolish, { once: true });
else initBookUxPolish();
