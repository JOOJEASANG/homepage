// Customer cancellation workflow shared by the admin list and tests.
// Keep the request flag separate from the production status: customers cannot
// change the order status themselves under Firestore security rules.
export function isPendingCancellation(quote = {}) {
  return quote?.cancelRequestState === 'requested'
    || (quote?.status === '취소요청'
      && quote?.cancelRequestState !== 'approved'
      && quote?.cancelRequestState !== 'rejected');
}

// Administrator can cancel any active order without a customer-initiated
// cancellation request, including a request received by phone.
export function canAdminDirectCancel(quote = {}) {
  return !!quote
    && quote.status !== '주문취소'
    && quote.cancelRequestState !== 'approved'
    && quote.cancelRequestState !== 'admin_cancelled';
}

export function cancellationResolution(quote, decision, reason = '') {
  if (!['approve', 'reject', 'direct'].includes(decision)) {
    throw new Error('INVALID_CANCEL_DECISION');
  }
  if (decision === 'direct') {
    if (!canAdminDirectCancel(quote)) throw new Error('CANCEL_ALREADY_HANDLED');
    const cleanedReason = String(reason || '').trim().slice(0, 500);
    return {
      status: '주문취소',
      cancelRequestState: 'admin_cancelled',
      cancelSource: 'admin_direct',
      cancelReason: cleanedReason,
      message: cleanedReason
        ? '관리자가 주문을 취소 처리했습니다. 사유: ' + cleanedReason
        : '관리자가 주문을 취소 처리했습니다.'
    };
  }
  if (!isPendingCancellation(quote) || quote?.status === '주문취소') {
    throw new Error('CANCEL_ALREADY_HANDLED');
  }

  if (decision === 'approve') {
    return {
      status: '주문취소',
      cancelRequestState: 'approved',
      message: '고객님의 주문 취소 요청이 승인되어 주문이 취소되었습니다.'
    };
  }

  const previousStatus = String(quote?.cancelPrevStatus || '').trim();
  const restoredStatus = previousStatus && previousStatus !== '취소요청'
    ? previousStatus : '접수완료';
  const status = quote.status === '취소요청' ? restoredStatus : quote.status;
  const cleanedReason = String(reason || '').trim().slice(0, 500);
  return {
    status,
    cancelRequestState: 'rejected',
    cancelRejectedReason: cleanedReason,
    message: cleanedReason
      ? '주문 취소 요청이 거절되었습니다. 사유: ' + cleanedReason
      : '주문 취소 요청이 거절되었습니다. 자세한 내용은 관리자에게 문의해 주세요.'
  };
}
