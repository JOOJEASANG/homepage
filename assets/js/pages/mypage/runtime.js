import { formatPhoneHyphen, formatQuoteStatus, quoteStatusKind } from '../shared/page-utils.js';

export function getQuoteStatusMeta(status) {
  const label = formatQuoteStatus(status);
  const kind = quoteStatusKind(label);
  return { label, kind };
}

function bindProfileContactFormatting() {
  const input = document.getElementById('profile-contact') || document.getElementById('profileContact');
  if (!input || input.dataset.sharedPhoneFormatBound === '1') return;
  input.dataset.sharedPhoneFormatBound = '1';
  input.addEventListener('blur', () => {
    if (input.value) input.value = formatPhoneHyphen(input.value);
  });
}

function annotateStatusElements() {
  document.querySelectorAll('[data-quote-status]').forEach(el => {
    const status = el.dataset.quoteStatus || el.textContent || '';
    const meta = getQuoteStatusMeta(status);
    el.dataset.quoteStatusKind = meta.kind;
  });
}

export function initMyPageRuntime() {
  bindProfileContactFormatting();
  annotateStatusElements();
  window.GPrintMyPageRuntime = {
    getQuoteStatusMeta,
    formatPhoneHyphen,
    formatQuoteStatus,
    quoteStatusKind,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMyPageRuntime, { once: true });
} else {
  initMyPageRuntime();
}
