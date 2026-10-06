// ============================================================
// admin-safety-patches.js — 관리자 페이지 런타임 안전 보정
//
// 역할:
//   - 파일 선택 취소/잘못된 파일 선택 시 admin.js 내부 업로드 핸들러가
//     선언 전 변수(container)를 참조하며 중단되는 문제를 선제 차단
// ============================================================

function showSafeToast(message, type = 'error') {
  try {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console.warn(message);
  } catch (_) {}
}

import { validateUploadFiles } from './file-upload-policy.js';

function isAllowedAdminUploadFile(file) {
  if (!file) return { ok: false, silent: true };

  return validateUploadFiles([file]);
}

function bindUploadGuard() {
  if (document.documentElement.dataset.adminUploadGuardBound === '1') return;
  document.documentElement.dataset.adminUploadGuardBound = '1';

  document.addEventListener('change', (e) => {
    const input = e.target;
    if (!input || input.id !== 'file-input') return;

    const file = input.files?.[0] || null;
    const result = isAllowedAdminUploadFile(file);
    if (result.ok) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();

    try { input.value = ''; } catch (_) {}
    try { document.getElementById('upload-progress-container')?.classList.add('hidden'); } catch (_) {}
    if (!result.silent && result.message) showSafeToast(result.message, 'error');
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUploadGuard, { once: true });
else bindUploadGuard();
