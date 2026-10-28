// 독립 실행되는 디지털출력 초기화 제어.
// Firebase/견적 계산 모듈이 늦게 초기화되어도 초기화 버튼은 동작합니다.
(function () {
  'use strict';
  function setValue(id, value) {
    const field = document.getElementById(id);
    if (field) field.value = value;
  }

  function clearPrintQuote() {
    const form = document.getElementById('quoteForm');
    if (!form) return;

    form.reset();
    setValue('orderName', '');
    setValue('quantity', '100');
    setValue('printSides', '1');
    setValue('paperSize', 'A4');
    setValue('paperType', 'snow');
    setValue('customW', '');
    setValue('customH', '');
    const weight = document.getElementById('paperWeight');
    if (weight && Array.from(weight.options).some(option => option.value === '200')) weight.value = '200';

    const oshi = document.getElementById('oshiEnabled');
    const background = document.getElementById('fullBackgroundEnabled');
    if (oshi) oshi.checked = false;
    if (background) background.checked = false;
    const oneLine = document.querySelector('input[name="oshiLines"][value="1"]');
    if (oneLine) oneLine.checked = true;
    document.getElementById('oshiOptions')?.classList.add('hidden');
    document.getElementById('customSizeWrap')?.classList.add('hidden');

    const fileInput = document.getElementById('attachments');
    if (fileInput) fileInput.value = '';
    for (const key of ['temp_quote_print', 'pending_member_submit_print', 'pendingRequestTypePrint']) {
      try { localStorage.removeItem(key); } catch (_) {}
    }

    // 비동기 로드 중이거나 계산 스크립트 오류가 있어도 이전 금액은 남기지 않습니다.
    const breakdown = document.getElementById('breakdown');
    if (breakdown) breakdown.innerHTML = '<div class="text-slate-500 text-sm">초기화된 견적을 다시 계산합니다.</div>';
    for (const id of ['supplyPrice', 'vatPrice', 'totalPrice']) {
      const field = document.getElementById(id);
      if (field) field.textContent = '0원';
    }
    document.getElementById('minQtyHint')?.classList.add('hidden');
    form.dispatchEvent(new CustomEvent('gprint:print-quote-reset', { bubbles: true }));
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#resetFormBtn') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearPrintQuote();
  }, true);
})();
