import { createReceiptNo, formatPhoneHyphen } from '../shared/page-utils.js';

const DRAFT_KEY = 'temp_quote_print';

function value(id) {
  return document.getElementById(id)?.value ?? '';
}

function checked(id) {
  return !!document.getElementById(id)?.checked;
}

export function serializePrintDraft(root = document, now = Date.now()) {
  const byId = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  return {
    orderName: byId('orderName')?.value || '',
    quantity: byId('quantity')?.value || '',
    printSides: byId('printSides')?.value || '',
    paperSize: byId('paperSize')?.value || '',
    customW: byId('customW')?.value || '',
    customH: byId('customH')?.value || '',
    paperType: byId('paperType')?.value || '',
    paperWeight: byId('paperWeight')?.value || '',
    oshiEnabled: !!byId('oshiEnabled')?.checked,
    fullBackgroundEnabled: !!byId('fullBackgroundEnabled')?.checked,
    oshiLines: root.querySelector?.('input[name="oshiLines"]:checked')?.value || '1',
    timestamp: Number(now) || Date.now(),
  };
}

export function isPristinePrintDraft(draft) {
  if (!draft) return true;
  return !(String(draft.orderName || '').trim()
    || String(draft.quantity || '') !== '100'
    || String(draft.printSides || '') !== '1'
    || String(draft.paperSize || '') !== 'A4'
    || String(draft.paperType || '') !== 'snow'
    || String(draft.paperWeight || '') !== '200'
    || String(draft.customW || '').trim()
    || String(draft.customH || '').trim()
    || draft.oshiEnabled
    || draft.fullBackgroundEnabled
    || String(draft.oshiLines || '1') !== '1');
}

export function savePrintDraft(storage = localStorage, root = document) {
  const draft = serializePrintDraft(root);
  // 초기화된 폼을 떠날 때 새로운 임시견적을 재생성하지 않습니다.
  if (isPristinePrintDraft(draft)) {
    storage.removeItem(DRAFT_KEY);
    return null;
  }
  storage.setItem(DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

export function readPrintDraft(storage = localStorage) {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function generatePrintReceiptNo(options) {
  return createReceiptNo(options);
}

function bindPhoneFormatting() {
  const selectors = [
    '#guestContact', '#guest-contact', '#ordererContact', '#contact',
    '#signup-guest-contact', '#guest-phone', 'input[type="tel"]',
  ];
  const seen = new Set();
  document.querySelectorAll(selectors.join(',')).forEach(input => {
    if (seen.has(input) || input.dataset.sharedPhoneFormatBound === '1') return;
    seen.add(input);
    input.dataset.sharedPhoneFormatBound = '1';
    input.addEventListener('blur', () => {
      if (input.value) input.value = formatPhoneHyphen(input.value);
    });
  });
}

function bindDraftSafetyNet() {
  if (window.__quotePrintDraftRuntimeBound) return;
  window.__quotePrintDraftRuntimeBound = true;
  window.addEventListener('beforeunload', () => {
    try { savePrintDraft(); } catch (_) {}
  });
}

export function initQuotePrintRuntime() {
  bindPhoneFormatting();
  bindDraftSafetyNet();
  window.GPrintQuotePrintRuntime = {
    serializePrintDraft,
    savePrintDraft,
    readPrintDraft,
    generatePrintReceiptNo,
    formatPhoneHyphen,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQuotePrintRuntime, { once: true });
} else {
  initQuotePrintRuntime();
}
