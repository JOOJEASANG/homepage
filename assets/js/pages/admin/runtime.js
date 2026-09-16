import { formatPhoneHyphen, formatQuoteStatus, quoteStatusKind } from '../shared/page-utils.js';

// 기존 관리자 보정 모듈을 한 진입점으로 묶습니다.
import '../../customer-center-admin-menu.js';
import '../../portfolio-crop-helper.js';
import '../../admin-safety-patches.js';

export function getAdminQuoteStatusMeta(status) {
  const label = formatQuoteStatus(status);
  return { label, kind: quoteStatusKind(label) };
}

export function normalizeAdminContact(value) {
  return formatPhoneHyphen(value);
}

export function initAdminRuntime() {
  window.GPrintAdminRuntime = {
    getAdminQuoteStatusMeta,
    normalizeAdminContact,
    quoteStatusKind,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminRuntime, { once: true });
} else {
  initAdminRuntime();
}
