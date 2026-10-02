// Dependency-free presentation enhancements. Never reads or writes customer data.
(function () {
  'use strict';
  const page = document.documentElement.dataset.page;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function labelControls(root) {
    root.querySelectorAll('label').forEach(label => {
      if (label.htmlFor || label.querySelector('input, select, textarea')) return;
      const control = label.parentElement?.querySelector('input:not([type="hidden"]), select, textarea');
      if (!control || control.hasAttribute('aria-label') || control.id && root.querySelector(`label[for="${control.id}"]`)) return;
      const copy = label.cloneNode(true);
      copy.querySelectorAll('button').forEach(el => el.remove());
      const text = copy.textContent.trim();
      if (text) control.setAttribute('aria-label', text);
    });
    root.querySelectorAll('button[title]:not([aria-label])').forEach(button => {
      if (!button.textContent.trim()) button.setAttribute('aria-label', button.title);
    });
  }

  function enhanceAdminTables() {
    for (const id of ['quote-list-body', 'inquiry-list-body']) {
      const body = document.getElementById(id);
      if (!body) continue;
      const table = body.closest('table');
      table.classList.add('responsive-orders');
      const labels = Array.from(table.querySelectorAll('thead th'), cell => cell.textContent.trim());
      const apply = () => {
        for (const row of body.rows) {
          Array.from(row.cells).forEach((cell, i) => {
            if (!cell.colSpan || cell.colSpan === 1) cell.dataset.label = labels[i] || '';
          });
          row.querySelectorAll('button[title]').forEach(button => button.setAttribute('aria-label', button.title));
          row.querySelectorAll('.status-select').forEach(select => select.setAttribute('aria-label', '주문 상태 변경'));
        }
      };
      apply();
      new MutationObserver(apply).observe(body, { childList: true, subtree: true });
    }
  }

  function enhanceOrder() {
    const form = document.getElementById('quoteForm');
    if (!form) return;
    const book = page === 'quote-book';
    const source = document.getElementById(book ? 'priceBreakdown' : 'breakdown');
    const priceSource = book ? source : document.getElementById('totalPrice');
    const submit = document.getElementById(book ? 'submitQuoteBtn' : 'submitBtn');
    if (!source || !submit) return;
    const stages = book
      ? [['basics','기본 정보'],['cover','표지'],['inner','내지·규격'],['binding','제본·수량'],['remarks','요청사항']]
      : [['basics','품명·수량'],['paper','규격·용지'],['finishing','후가공']];
    const nav = document.createElement('nav');
    nav.className = 'order-step-nav';
    nav.setAttribute('aria-label', '주문 사양 입력 단계');
    stages.forEach(([key,label], i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${String(i + 1).padStart(2, '0')} ${label}`;
      button.dataset.stageTarget = key;
      button.addEventListener('click', () => {
        const target = form.querySelector(`[data-order-stage="${key}"]`);
        if (target) {
          target.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
          markStep(key);
        }
      });
      nav.append(button);
    });
    const fileButton = document.createElement('button');
    fileButton.type = 'button';
    fileButton.textContent = `${book ? '06' : '04'} 파일·접수`;
    fileButton.dataset.stageTarget = 'files';
    const fileInput = document.getElementById(book ? 'quote-attachments' : 'attachments');
    const fileCard = fileInput?.closest(book ? '.bg-white' : '.card');
    fileCard?.setAttribute('data-order-stage', 'files');
    fileButton.addEventListener('click', () => {
      fileCard?.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
      markStep('files');
    });
    nav.append(fileButton);
    form.before(nav);
    function markStep(key) {
      nav.querySelectorAll('button').forEach(button => {
        if (button.dataset.stageTarget === key) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }
    markStep('basics');
    const bar = document.createElement('div');
    bar.className = 'mobile-order-bar';
    bar.innerHTML = '<button type="button" class="mobile-price" aria-haspopup="dialog"><small>예상금액 · 부가세 포함</small><strong>계산 대기</strong><span class="price-details">상세 ⌃</span></button><button type="button" class="mobile-order-submit">주문 접수</button>';
    form.after(bar);
    const mobileSubmit = bar.querySelector('.mobile-order-submit');
    mobileSubmit.addEventListener('click', () => { if (!submit.disabled) submit.click(); });
    const sheet = document.createElement('dialog');
    sheet.className = 'order-summary-sheet';
    sheet.setAttribute('aria-label', '예상 견적 상세');
    sheet.innerHTML = '<div class="summary-sheet-header"><h2>예상 견적 상세</h2><button type="button" aria-label="견적 상세 닫기">×</button></div><div class="summary-sheet-content"></div><p class="summary-sheet-note">접수 후 파일과 사양 확인을 거쳐 최종 금액을 안내합니다.</p>';
    document.body.append(sheet);
    const sheetContent = sheet.querySelector('.summary-sheet-content');
    function copyBreakdown() {
      const copy = source.cloneNode(true);
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      sheetContent.replaceChildren(copy);
    }
    bar.querySelector('.mobile-price').addEventListener('click', () => { copyBreakdown(); sheet.showModal(); });
    sheet.querySelector('button').addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', event => {
      if (event.target !== sheet) return;
      const rect = sheet.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left || event.clientX > rect.right) sheet.close();
    });
    function updateBar() {
      const amount = book ? priceSource?.dataset.quoteTotal : priceSource?.textContent;
      const number = Number(String(amount || '').replace(/[^0-9.]/g, ''));
      bar.querySelector('strong').textContent = /주문 불가/.test(amount || '') ? '사양 확인 필요' : number > 0 ? `${number.toLocaleString('ko-KR')}원` : '계산 대기';
      bar.hidden = getComputedStyle(submit).display === 'none';
      mobileSubmit.disabled = submit.disabled;
      mobileSubmit.textContent = submit.disabled ? '처리 중…' : /수정/.test(submit.textContent) ? '견적 수정' : '주문 접수';
      if (sheet.open) copyBreakdown();
    }
    updateBar();
    new MutationObserver(updateBar).observe(priceSource, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-quote-total'] });
    new MutationObserver(updateBar).observe(submit, { attributes: true, attributeFilter: ['disabled', 'style', 'class'], childList: true, subtree: true });
    if (!book) new MutationObserver(() => { if (sheet.open) copyBreakdown(); }).observe(source, { childList: true, subtree: true });
    const observed = new WeakSet();
    const observer = new IntersectionObserver(entries => {
      const active = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (active) markStep(active.target.dataset.orderStage);
    }, { rootMargin: '-110px 0px -55% 0px', threshold: 0 });
    function enhanceFields() {
      labelControls(form);
      form.querySelectorAll('[data-order-stage]').forEach(stage => {
        if (!observed.has(stage)) { observed.add(stage); observer.observe(stage); }
      });
    }
    enhanceFields();
    const items = document.getElementById('quote-items-container');
    if (items) new MutationObserver(enhanceFields).observe(items, { childList: true, subtree: true });
  }

  function init() {
    labelControls(document);
    if (page === 'admin') enhanceAdminTables();
    if (page === 'quote-book' || page === 'quote-print') enhanceOrder();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
