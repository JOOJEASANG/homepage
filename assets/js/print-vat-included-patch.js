// ============================================================
// print-vat-included-patch.js — 디지털인쇄 부가세 포함 계산 보정
//
// 역할:
//   - 디지털인쇄 견적에서 기존처럼 최종금액에 부가세 10%를 별도 가산하지 않습니다.
//   - 단가관리의 출력단가/오시단가를 부가세 포함 단가로 보고 계산합니다.
//   - 화면에는 포함가 기준 공급가액 / 부가세 / 최종결제금액을 함께 표시합니다.
//   - 상단 안내문 일부를 자연스럽게 정리합니다.
//   - 기존 quote-print.js의 계산 흐름은 유지하되, quote-print.html에서만 cut10 호출을 보정합니다.
// ============================================================

const PRINT_VAT_PATCH_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

let vatLabelPatchScheduled = false;
let vatLabelPatchRunning = false;

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

function setTextIfDifferent(el, text) {
  if (!el || el.textContent === text) return false;
  el.textContent = text;
  return true;
}

function patchPrintIntroCopy() {
  if (!isPrintVatPatchTarget()) return;
  const title = Array.from(document.querySelectorAll('h1')).find(el => (el.textContent || '').includes('디지털'));
  const desc = title?.closest('.lg\:col-span-8')?.querySelector('p.text-slate-500');
  if (!desc || desc.dataset.printIntroCopyPatched === '1') return;

  desc.innerHTML = `
                    초대장, 안내장, 포스터, 전단지 등 다양한 디지털 인쇄물을 간편하게 견적낼 수 있습니다.
                    <br> 종이는 <b>스노우지</b> / <b>아르떼</b>만 사용합니다. 단면/양면 선택 및 사이즈 자동 견적(면적 비례)을 지원합니다.
                `;
  desc.dataset.printIntroCopyPatched = '1';
}

function patchVatIncludedLabels() {
  if (!isPrintVatPatchTarget()) return;
  if (vatLabelPatchRunning) return;
  vatLabelPatchRunning = true;

  try {
    patchPrintIntroCopy();

    const breakdown = document.getElementById('breakdown');
    if (!breakdown) return;

    const rows = Array.from(breakdown.querySelectorAll('div.flex.justify-between'));
    const supplyRow = rows.find(row => (row.textContent || '').includes('공급가액'));
    const vatRow = rows.find(row => (row.textContent || '').includes('부가세'));

    if (supplyRow) {
      const label = supplyRow.querySelector('span:first-child');
      setTextIfDifferent(label, '공급가액 (포함가 기준)');
    }
    if (vatRow) {
      const label = vatRow.querySelector('span:first-child');
      setTextIfDifferent(label, '부가세 (10%, 포함)');
    }

    const finalCard = Array.from(breakdown.querySelectorAll('div')).find(el => (el.textContent || '').includes('최종결제금액'));
    const finalLabel = finalCard?.querySelector?.('span:first-child');
    setTextIfDifferent(finalLabel, '최종결제금액');
  } finally {
    vatLabelPatchRunning = false;
  }
}

function scheduleVatLabelPatch() {
  if (vatLabelPatchScheduled) return;
  vatLabelPatchScheduled = true;
  requestAnimationFrame(() => {
    vatLabelPatchScheduled = false;
    patchVatIncludedLabels();
  });
}

function initPrintVatIncludedPatch() {
  if (!isPrintVatPatchTarget()) return;
  patchPrintIntroCopy();

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
    // quote-print.js가 breakdown.innerHTML을 통째로 갱신할 때만 감지합니다.
    // subtree 감시는 패치가 직접 바꾼 라벨까지 다시 감지해 반복 실행될 수 있어 제외합니다.
    new MutationObserver(scheduleVatLabelPatch).observe(breakdown, { childList: true });
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
