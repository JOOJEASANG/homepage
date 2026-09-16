const MAX_FILE_BYTES = 300 * 1024 * 1024;
const MAX_TOTAL_BYTES = 600 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  'pdf','jpg','jpeg','png','gif','webp','heic','tif','tiff','zip',
  'doc','docx','xls','xlsx','ppt','pptx','hwp','hwpx','ai','eps','psd','indd'
]);

export function validateUploadFiles(files) {
  const list = Array.from(files || []);
  let total = 0;
  for (const file of list) {
    total += Number(file?.size || 0);
    if (Number(file?.size || 0) > MAX_FILE_BYTES) {
      return { ok: false, message: `파일당 최대 용량은 ${MAX_FILE_BYTES / 1024 / 1024}MB입니다.` };
    }
    const ext = String(file?.name || '').split('.').pop().toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return { ok: false, message: '허용되지 않은 파일 형식입니다. PDF, 이미지, ZIP, Office/HWP 및 주요 디자인 파일만 업로드할 수 있습니다.' };
    }
  }
  if (total > MAX_TOTAL_BYTES) {
    return { ok: false, message: `한 번에 선택할 수 있는 전체 파일 용량은 ${MAX_TOTAL_BYTES / 1024 / 1024}MB입니다.` };
  }
  return { ok: true, totalBytes: total };
}

function showError(message) {
  try {
    if (typeof window.showToast === 'function') {
      window.showToast(message, 'error');
      return;
    }
  } catch (_) {}
  alert(message);
}

function initUploadGuard() {
  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    const result = validateUploadFiles(input.files);
    if (result.ok) return;
    input.value = '';
    event.stopImmediatePropagation();
    showError(result.message);
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUploadGuard, { once: true });
else initUploadGuard();

export { MAX_FILE_BYTES, MAX_TOTAL_BYTES, ALLOWED_EXTENSIONS };
