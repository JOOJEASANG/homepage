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

function normalizeExt(name = '') {
  return String(name || '').split('.').pop().toLowerCase();
}

function isAllowedAdminUploadFile(file) {
  if (!file) return { ok: false, silent: true };

  const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `파일 용량이 너무 큽니다. 최대 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB까지 업로드 가능합니다.` };
  }

  const ext = normalizeExt(file.name);
  const allowedExt = new Set(['pdf','jpg','jpeg','png','gif','webp','zip','doc','docx','xls','xlsx','ppt','pptx','hwp','heic']);
  const allowedTypes = new Set([
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
  ]);

  if (file.type) {
    if (file.type.startsWith('image/') || allowedTypes.has(file.type)) return { ok: true };
    return { ok: false, message: '허용되지 않은 파일 형식입니다. (pdf/이미지/zip/docx/xlsx/pptx 등)' };
  }

  if (ext && allowedExt.has(ext)) return { ok: true };
  return { ok: false, message: '허용되지 않은 파일 확장자입니다. (pdf/이미지/zip/docx/xlsx/pptx 등)' };
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
