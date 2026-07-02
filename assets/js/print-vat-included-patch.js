// ============================================================
// print-vat-included-patch.js — 디지털인쇄 부가세 포함 계산 보정
//
// 역할:
//   - 디지털인쇄 견적에서 기존처럼 최종금액에 부가세 10%를 별도 가산하지 않습니다.
//   - 단가관리의 출력단가/오시단가를 부가세 포함 단가로 보고 계산합니다.
//   - 화면에는 포함가 기준 공급가액 / 부가세 / 최종결제금액을 함께 표시합니다.
//   - 기존 quote-print.js의 계산 흐름은 유지하되, quote-print.html에서만 cut10 호출을 보정합니다.
// ============================================================

const PRINT_VAT_PATCH_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

function isPrintVatPatchTarget() {
  return PRINT_VAT_PATCH_FILE === 'quote-print.html';
}

function installVatIncludedCutPatch() {
  if (!isPrintVatPatchTarget()) return false;
  if (window.__printVatIncludedCutPatchInstalled === '1') return true;
  if (typeof window.cut10 !== 'function') return false;

  const originalCut10 = window.cut10;
  let pendingIncludedTotal = null;
  let pendingAt = 0;

  window.cut10 = function printVatIncludedCut10(value) {
    const n = Number(value) || 0;

    // quote-print.js 기존 흐름:
    //   totalRounded = cut10((기본 인쇄비 + 오시비) * 1.1)
    //   supply       = cut10(totalRounded / 1.1)
    // 여기서 첫 번째 cut10은 /1.1로 되돌려 최종금액을 부가세 포함가 기준으로 만들고,
    // 두 번째 cut10은 정상 처리해서 포함가 안의 공급가액/부가세가 보이도록 합니다.
    try {
      const now = performance?.now?.() || Date.now();
      if (
        pendingIncludedTotal !== null &&
        now - pendingAt < 120 &&
        Math.abs(n - (pendingIncludedTotal / 1.1)) <= Math.max(2, pendingIncludedTotal * 0.002)
      ) {
        pendingIncludedTotal = null;
        return originalCut10(n);
      }

      const includedTotal = originalCut10(n / 1.1);
      pendingIncludedTotal = includedTotal;
      pendingAt = now;
      return includedTotal;
    } catch (_) {
      return originalCut10(n);
    }
  };

  window.__printVatIncludedCutPatchInstalled = '1';
  return true;
}

function patchVatIncludedLabels() {
  if (!isPrintVatPatchTarget()) return;
  const breakdown = document.getElementById('breakdown');
  if (!breakdown) return;

  const rows = Array.from(breakdown.querySelectorAll('div.flex.justify-between'));
  const supplyRow = rows.find(row => (row.textContent || '').includes('공급가액'));
  const vatRow = rows.find(row => (row.textContent || '').includes('부가세'));

  if (supplyRow) {
    const label = supplyRow.querySelector('span:first-child');
    if (label) label.textContent = '공급가액 (포함가 기준)';
  }
  if (vatRow) {
    const label = vatRow.querySelector('span:first-child');
    if (label) label.textContent = '부가세 (10%, 포함)';
  }

  const finalCard = Array.from(breakdown.querySelectorAll('div')).find(el => (el.textContent || '').includes('최종결제금액'));
  const finalLabel = finalCard?.querySelector?.('span:first-child');
  if (finalLabel) finalLabel.textContent = '최종결제금액';
}

function scheduleVatLabelPatch() {
  requestAnimationFrame(() => {
    patchVatIncludedLabels();
    setTimeout(patchVatIncludedLabels, 0);
  });
}

function initPrintVatIncludedPatch() {
  if (!isPrintVatPatchTarget()) return;

  const tryInstall = () => {
    if (installVatIncludedCutPatch()) {
      try {
        const target = document.getElementById('quantity') || document.getElementById('paperWeight') || document.getElementById('breakdown');
        target?.dispatchEvent?.(new Event('input', { bubbles: true }));
        target?.dispatchEvent?.(new Event('change', { bubbles: true }));
      } catch (_) {}
      scheduleVatLabelPatch();
      return true;
    }
    return false;
  };

  if (!tryInstall()) {
    setTimeout(tryInstall, 50);
    setTimeout(tryInstall, 200);
    setTimeout(tryInstall, 800);
  }

  const breakdown = document.getElementById('breakdown');
  if (breakdown) {
    new MutationObserver(scheduleVatLabelPatch).observe(breakdown, { childList: true, subtree: true });
  }

  document.addEventListener('input', e => {
    if (e.target?.closest?.('#quoteForm')) scheduleVatLabelPatch();
  }, false);
  document.addEventListener('change', e => {
    if (e.target?.closest?.('#quoteForm')) scheduleVatLabelPatch();
  }, false);
  document.addEventListener('click', e => {
    if (e.target?.closest?.('#submitBtn, #member-submit-btn, #signup-form button[type="submit"]')) {
      patchVatIncludedLabels();
    }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPrintVatIncludedPatch, { once: true });
else initPrintVatIncludedPatch();
