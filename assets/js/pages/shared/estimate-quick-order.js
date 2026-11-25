/**
 * Automatically priced estimate requests may be ordered immediately.
 * No quote is duplicated: conversion updates the saved quote atomically.
 * Existing nonpriced/manual estimates keep the administrative review path.
 */
export function hasAutomaticEstimatePrice(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

export function savedEstimatePrice(quote) {
  return Number(quote?.finalPrice ?? quote?.totalPrice ?? 0);
}

export async function convertSavedEstimateToOrder({
  db, doc, runTransaction, serverTimestamp, quoteId, shownPrice,
}) {
  if (!quoteId || !hasAutomaticEstimatePrice(shownPrice)) {
    throw new Error('주문으로 전환할 수 있는 견적금액이 없습니다.');
  }
  return runTransaction(db, async transaction => {
    const ref = doc(db, 'quotes', quoteId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('저장된 견적을 찾을 수 없습니다.');
    const saved = snapshot.data() || {};
    if (saved.requestType === 'order') return { converted: false, alreadyOrdered: true };
    if (saved.requestType !== 'estimate' || saved.estimateStatus !== 'completed'
        || saved.status !== '접수완료') {
      throw new Error('주문 전환이 가능한 견적 상태가 아닙니다.');
    }
    if (!hasAutomaticEstimatePrice(savedEstimatePrice(saved))
        || savedEstimatePrice(saved) !== Number(shownPrice)) {
      throw new Error('견적금액이 변경되었습니다. 마이페이지에서 최신 금액을 확인해 주세요.');
    }
    transaction.update(ref, {
      requestType: 'order',
      estimateStatus: 'converted',
      convertedToOrderAt: serverTimestamp(),
      hasUnreadAdminMessage: true,
      updatedAt: serverTimestamp(),
    });
    return { converted: true, alreadyOrdered: false };
  });
}


/** Explicitly distinguish price inquiry from an actual production order. */
export function confirmEstimateIntent() {
  const existing = document.getElementById('estimate-intent-dialog');
  if (existing) return Promise.resolve(null);
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.id = 'estimate-intent-dialog';
    dialog.className = 'fixed inset-0 m-auto w-11/12 max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/60';
    dialog.setAttribute('aria-labelledby','estimate-intent-title');
    dialog.setAttribute('aria-describedby','estimate-intent-description');
    dialog.innerHTML = `
      <div class="border-b border-amber-200 bg-amber-50 px-5 py-5">
        <h2 id="estimate-intent-title" class="text-xl font-extrabold text-slate-900">견적만 요청하시겠습니까?</h2>
        <p id="estimate-intent-description" class="mt-2 text-base font-bold text-amber-900">견적 요청만으로는 작업이 진행되지 않습니다.</p>
      </div>
      <div class="space-y-4 px-5 py-5">
        <p class="text-sm leading-relaxed text-slate-700">견적만 요청하면 금액만 확인합니다. 파일을 첨부해도 제작하지 않습니다. 실제 작업을 원하시면 아래의 ‘주문 접수 및 작업 요청’ 버튼을 선택해 주세요.</p>
        <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm font-bold leading-relaxed text-slate-800"><input id="estimate-intent-check" type="checkbox" class="mt-1 h-5 w-5 shrink-0 accent-amber-700">견적만 요청하면 실제 제작이 진행되지 않는다는 점을 확인했습니다.</label>
        <div class="grid gap-2">
          <button id="estimate-intent-order" type="button" class="rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white">주문 접수 및 작업 요청</button>
          <button id="estimate-intent-only" type="button" disabled class="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">견적만 요청하기</button>
          <button id="estimate-intent-cancel" type="button" class="px-3 py-2 text-sm text-slate-600">돌아가기</button>
        </div>
      </div>`;
    const previous = document.activeElement;
    let choice = null;
    const check = dialog.querySelector('#estimate-intent-check');
    const only = dialog.querySelector('#estimate-intent-only');
    check.addEventListener('change', () => { only.disabled = !check.checked; });
    const finish = value => { choice = value; dialog.close(); };
    only.addEventListener('click', () => { if (check.checked) finish('estimate'); });
    dialog.querySelector('#estimate-intent-order').addEventListener('click', () => finish('order'));
    dialog.querySelector('#estimate-intent-cancel').addEventListener('click', () => finish(null));
    dialog.addEventListener('close', () => { dialog.remove(); previous?.focus?.(); resolve(choice); }, {once:true});
    document.body.appendChild(dialog);
    dialog.showModal();
    check.focus();
  });
}

/**
 * Confirmation layer appears only after a successful Firestore save.
 * Text comes from DOM textContent, never injected into HTML.
 */
export function showEstimateCompletedLayer({
  total, ready, mypageUrl, onConvert,
} = {}) {
  if (typeof document === 'undefined') return null;
  document.getElementById('estimate-completed-layer')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'estimate-completed-layer';
  overlay.className = 'fixed inset-0 z-[99999] bg-slate-950/65 flex items-center justify-center p-4';
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML = `
    <section role="dialog" aria-modal="true" aria-labelledby="estimate-completed-title"
      aria-describedby="estimate-completed-description"
      class="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
      <div class="bg-brand-50 border-b border-brand-100 px-6 py-5">
        <h2 id="estimate-completed-title" class="text-xl font-extrabold text-slate-900">견적 요청 완료</h2>
        <p id="estimate-completed-description" class="mt-2 text-sm text-slate-600 leading-relaxed"></p>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
          <div class="text-sm font-bold text-slate-600">견적금액 · 부가세 포함</div>
          <div id="estimate-completed-price" class="mt-2 text-3xl font-black text-brand-700"></div>
        </div>
        <div id="estimate-completed-warning" class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-base font-extrabold leading-relaxed text-amber-950">아직 주문은 접수되지 않았습니다.<br>실제 제작은 진행되지 않습니다.</div>
        <p id="estimate-completed-message" role="status" aria-live="polite" class="text-sm text-slate-600 leading-relaxed"></p>
        <p id="estimate-completed-error" role="alert" class="hidden text-sm font-bold text-red-600"></p>
        <div class="grid grid-cols-1 gap-2">
          <button type="button" id="estimate-completed-order"
            class="w-full rounded-xl bg-brand-600 px-4 py-3.5 text-base font-bold text-white hover:bg-brand-700">
            금액 확인 후 주문 접수 및 작업 요청
          </button>
          <button type="button" id="estimate-completed-mypage"
            class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
            견적만 저장하고 나가기 (제작 안 함)
          </button>
        </div>
      </div>
    </section>`;
  const desc = overlay.querySelector('#estimate-completed-description');
  const amount = overlay.querySelector('#estimate-completed-price');
  const message = overlay.querySelector('#estimate-completed-message');
  const error = overlay.querySelector('#estimate-completed-error');
  const order = overlay.querySelector('#estimate-completed-order');
  const mypage = overlay.querySelector('#estimate-completed-mypage');
  desc.textContent = ready
    ? '견적금액이 자동으로 계산되어 관리자 확인을 기다리지 않고 주문할 수 있습니다.'
    : '견적 요청이 저장되었습니다. 이 견적은 관리자 확인이 필요합니다.';
  amount.textContent = ready ? Number(total).toLocaleString('ko-KR') + '원' : '관리자 확인 필요';
  message.textContent = ready
    ? '아직 주문은 접수되지 않았습니다. 아래 버튼을 누르면 이 견적이 주문으로 전환됩니다.'
    : '관리자 견적 확인 후 마이페이지에서 주문 접수를 진행해 주세요. 견적이 확정되어도 자동으로 제작되지는 않습니다.';
  if (!ready || typeof onConvert !== 'function') order.classList.add('hidden');
  mypage.addEventListener('click', () => { window.location.href = mypageUrl || 'mypage.html'; });
  let busy = false;
  order.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    order.disabled = true;
    order.textContent = '주문 접수 중...';
    error.classList.add('hidden');
    try {
      await onConvert();
      overlay.querySelector('#estimate-completed-title').textContent = '주문 접수 완료';
      overlay.querySelector('#estimate-completed-warning').classList.add('hidden');
      desc.textContent = '견적을 확인하고 주문 접수를 완료했습니다.';
      message.textContent = '기존 견적번호가 그대로 주문으로 전환되었습니다. 마이페이지에서 진행상황을 확인할 수 있습니다.';
      order.classList.add('hidden');
      mypage.textContent = '마이페이지에서 주문 확인';
      amount.textContent = Number(total).toLocaleString('ko-KR') + '원';
    } catch (e) {
      error.textContent = String(e?.message || '주문 전환에 실패했습니다. 마이페이지에서 다시 시도해 주세요.');
      error.classList.remove('hidden');
      order.disabled = false;
      order.textContent = '주문 접수 다시 시도';
    } finally {
      busy = false;
    }
  });
  // Prevent clicking outside or pressing Escape from silently losing the saved estimate information.
  document.body.appendChild(overlay);
  order.classList.contains('hidden') ? mypage.focus() : order.focus();
  return overlay;
}
