// ============================================================
// security-patches.js — 공통 보안 보정
//
// 역할:
//   - Firestore 등 외부 데이터가 innerHTML로 들어간 뒤 위험 속성이 남지 않도록 보정
//   - 큰 페이지 파일을 직접 교체하지 않아도 XSS 위험 구간을 즉시 완화
//   - 책자/제본 및 디지털인쇄 페이지 전용 보정 스크립트 로드
//   - 비회원 조회 개인정보가 localStorage에 장기 보관되지 않도록 완화
// ============================================================

const CURRENT_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

try {
  if (CURRENT_FILE === 'quote-book.html') {
    import('./wire-cover-patch.js').catch(() => null);
    import('./book-no-binding-cover-patch.js').catch(() => null);
    import('./book-item-unit-price-patch.js').catch(() => null);
  }
  if (CURRENT_FILE === 'quote-print.html') {
    import('./print-vat-included-patch.js').catch(() => null);
  }
} catch (_) {}

function sanitizeHtmlStrict(html) {
  try {
    const allowed = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    const blockedHrefPrefix = 'java' + 'script:';

    Array.from(doc.body.querySelectorAll('*')).reverse().forEach(el => {
      if (!allowed.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        return;
      }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim().toLowerCase();
        if (name.startsWith('on') || name === 'style') el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && value.startsWith(blockedHrefPrefix)) el.removeAttribute(attr.name);
        if (name === 'srcdoc') el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return doc.body.firstElementChild?.innerHTML || '';
  } catch {
    return '';
  }
}

function hardenGuideHtml() {
  if (CURRENT_FILE !== 'quote-print.html') return;

  const apply = () => {
    const guide = document.getElementById('guideText');
    if (!guide) return false;

    const clean = sanitizeHtmlStrict(guide.innerHTML || '');
    if (guide.innerHTML !== clean) guide.innerHTML = clean;

    if (guide.dataset.securityPatchBound !== '1') {
      guide.dataset.securityPatchBound = '1';
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          const next = sanitizeHtmlStrict(guide.innerHTML || '');
          if (guide.innerHTML !== next) guide.innerHTML = next;
        });
      });
      observer.observe(guide, { childList: true, subtree: true, attributes: true, characterData: true });
    }
    return true;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!apply()) setTimeout(apply, 500);
      setTimeout(apply, 1500);
    }, { once: true });
  } else {
    if (!apply()) setTimeout(apply, 500);
    setTimeout(apply, 1500);
  }
}

// innerHTML을 완전히 없애기는 어렵기 때문에, 렌더링 이후 남아 있는 위험 속성을 공통 제거합니다.
function scrubDangerousAttributes(root = document) {
  try {
    if (!root || !root.querySelectorAll) return;
    const blockedHrefPrefix = 'java' + 'script:';
    root.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes || []).forEach(attr => {
        const name = String(attr.name || '').toLowerCase();
        const value = String(attr.value || '').trim().toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && value.startsWith(blockedHrefPrefix)) el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A' && el.getAttribute('target') === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
  } catch (_) {}
}

function initDangerousAttributeObserver() {
  const run = () => {
    scrubDangerousAttributes(document);
    if (document.documentElement?.dataset.securityScrubberBound === '1') return;
    document.documentElement.dataset.securityScrubberBound = '1';

    let scheduled = false;
    const observer = new MutationObserver((mutations) => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        mutations.forEach(m => {
          if (m.type === 'attributes') scrubDangerousAttributes(m.target?.parentElement || document);
          m.addedNodes?.forEach(node => {
            if (node?.nodeType === Node.ELEMENT_NODE) scrubDangerousAttributes(node);
          });
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

// 비회원 조회용 원본 연락처/끝4자리 비밀번호가 localStorage에 오래 남지 않도록 막습니다.
function initGuestLocalStoragePrivacyGuard() {
  const sensitiveGuestKeys = new Set([
    'guestContact', 'guestContactRaw', 'guestContactHyphen', 'guestPwLast4',
    'guestSession', 'guestEmail', 'guestUid'
  ]);

  try {
    sensitiveGuestKeys.forEach(key => {
      const v = localStorage.getItem(key);
      if (v != null && sessionStorage.getItem(key) == null) sessionStorage.setItem(key, v);
      localStorage.removeItem(key);
    });
  } catch (_) {}

  try {
    const nativeSetItem = Storage.prototype.setItem;
    if (Storage.prototype.__guestPrivacyPatched !== true) {
      Object.defineProperty(Storage.prototype, '__guestPrivacyPatched', { value: true, configurable: false });
      Storage.prototype.setItem = function(key, value) {
        try {
          if (this === localStorage && sensitiveGuestKeys.has(String(key))) {
            try { sessionStorage.setItem(key, value); } catch (_) {}
            return undefined;
          }
        } catch (_) {}
        return nativeSetItem.apply(this, arguments);
      };
    }
  } catch (_) {}
}

// quote-book.html의 cut10 함수가 100원 단위로 동작하던 부분을 10원 단위로 보정합니다.
function initBookCut10Patch() {
  if (CURRENT_FILE !== 'quote-book.html') return;
  const apply = () => {
    try {
      window.cut10 = function(v) {
        v = Number(v) || 0;
        return Math.floor(v / 10) * 10;
      };
      return true;
    } catch (_) {
      return false;
    }
  };
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  setTimeout(apply, 300);
  setTimeout(apply, 1200);
}

hardenGuideHtml();
initDangerousAttributeObserver();
initGuestLocalStoragePrivacyGuard();
initBookCut10Patch();
