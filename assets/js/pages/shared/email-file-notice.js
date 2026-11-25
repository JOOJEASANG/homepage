// Customer declaration only; this is not an inbox integration.
export const isEmailFileNotice = q => ['planned','sent'].includes(q?.emailFileStatus);
export const emailFileLabel = q => q?.emailFileConfirmedAt ? '이메일 파일 확인완료' : q?.emailFileStatus === 'sent' ? '이메일 발송 · 미확인' : q?.emailFileStatus === 'planned' ? '이메일 발송 예정' : '';
export const canReportEmailFile = q => !!q && !q.emailFileConfirmedAt && q.emailFileStatus !== 'sent' && !['주문취소','취소요청','작업완료','결제완료'].includes(q.status) && !['requested','approved','admin_cancelled'].includes(q.cancelRequestState);
export function initEmailFileInput(kind) {
  const select=document.getElementById('email-file-status');
  const key='gprint-email-file-'+kind;
  if(!select) return {value:()=>null,clear:()=>{}};
  const edit=new URLSearchParams(location.search).get('edit')==='1';
  const valid=v=>['planned','sent'].includes(v)?v:null;
  if(edit) select.closest('[data-email-file-input]')?.classList.add('hidden');
  else {
    try { select.value=valid(sessionStorage.getItem(key))||''; } catch {}
    select.addEventListener('change',()=>{try{sessionStorage.setItem(key,valid(select.value)||'');}catch{}});
  }
  return {value:()=>edit?null:valid(select.value),clear:()=>{select.value='';try{sessionStorage.removeItem(key);}catch{}}};
}
