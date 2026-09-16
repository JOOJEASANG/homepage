// quote-print / mypage / admin에서 함께 사용하는 순수 표시·식별 유틸입니다.

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function formatPhoneHyphen(value) {
  const digits = phoneDigits(value);
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  return String(value || '');
}

export function quoteStatusKind(value) {
  const status = String(value || '').trim();
  if (!status) return 'waiting';
  if (/취소|반려|거절/.test(status)) return 'cancelled';
  // '접수완료'는 제작 완료가 아니라 정상 접수된 대기 상태입니다.
  if (/^접수완료$|접수대기|접수중/.test(status)) return 'waiting';
  if (/완료|발송|출고/.test(status)) return 'done';
  if (/제작|진행|인쇄|결제완료|확정/.test(status)) return 'progress';
  return 'waiting';
}

export function formatQuoteStatus(value, fallback = '접수완료') {
  const status = String(value || '').replace(/\s+/g, ' ').trim();
  return status || fallback;
}

export function createReceiptNo({ date = new Date(), random = Math.random, prefix = 'Q' } = {}) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const rnd = String(Math.floor(Math.max(0, Math.min(0.999999, Number(random()) || 0)) * 1000)).padStart(3, '0');
  return `${prefix}${y}${m}${d}-${hh}${mm}${ss}-${rnd}`;
}

export function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[ch]);
}
