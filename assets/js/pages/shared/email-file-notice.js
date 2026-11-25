// Customer declaration only; this is not an inbox integration.
export const isEmailFileNotice = q => ['planned','sent'].includes(q?.emailFileStatus);
export const emailFileLabel = q => q?.emailFileConfirmedAt ? '이메일 파일 확인완료' : q?.emailFileStatus === 'sent' ? '이메일 접수 · 미확인' : q?.emailFileStatus === 'planned' ? '이메일 발송 예정' : '';
export const canReportEmailFile = q => !!q && !q.emailFileConfirmedAt && q.emailFileStatus !== 'sent' && !['주문취소','취소요청','작업완료','결제완료'].includes(q.status) && !['requested','approved','admin_cancelled'].includes(q.cancelRequestState);
export function initEmailFileInput(kind) {
  const input = document.getElementById('email-file-status');
  const key = 'gprint-email-file-' + kind;
  if (!input) return { value: () => null, clear: () => {} };
  const edit = new URLSearchParams(location.search).get('edit') === '1';
  // Keep the existing Firestore 'sent' declaration for compatibility. It does
  // not assert delivery or administrator confirmation; only the customer's choice.
  const selected = () => input.type === 'checkbox' ? input.checked : input.value === 'sent';
  const setSelected = checked => {
    if (input.type === 'checkbox') input.checked = checked;
    else input.value = checked ? 'sent' : '';
  };
  if (edit) input.closest('[data-email-file-input]')?.classList.add('hidden');
  else {
    try { setSelected(sessionStorage.getItem(key) === 'sent'); } catch {}
    input.addEventListener('change', () => {
      try {
        if (selected()) sessionStorage.setItem(key, 'sent');
        else sessionStorage.removeItem(key);
      } catch {}
    });
  }
  return {
    value: () => !edit && selected() ? 'sent' : null,
    clear: () => { setSelected(false); try { sessionStorage.removeItem(key); } catch {} }
  };
}
