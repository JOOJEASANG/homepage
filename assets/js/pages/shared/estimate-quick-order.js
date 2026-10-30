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
        <h2 id="estimate-completed-title" class="text-xl font-extrabold text-slate-900">견적 요청이 완료되었습니다</h2>
        <p id="estimate-completed-description" class="mt-2 text-sm text-slate-600 leading-relaxed"></p>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
          <div class="text-sm font-bold text-slate-600">견적금액 · 부가세 포함</div>
          <div id="estimate-completed-price" class="mt-2 text-3xl font-black text-brand-700"></div>
        </div>
        <p id="estimate-completed-message" role="status" aria-live="polite" class="text-sm text-slate-600 leading-relaxed"></p>
        <p id="estimate-completed-error" role="alert" class="hidden text-sm font-bold text-red-600"></p>
        <div class="grid grid-cols-1 gap-2">
          <button type="button" id="estimate-completed-order"
            class="w-full rounded-xl bg-brand-600 px-4 py-3.5 text-base font-bold text-white hover:bg-brand-700">
            금액 확인 후 바로 주문 접수
          </button>
          <button type="button" id="estimate-completed-mypage"
            class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
            마이페이지에서 확인 / 나중에 주문
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
    : '마이페이지에서 진행 상태와 확정 견적을 확인할 수 있습니다.';
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
