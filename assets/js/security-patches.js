// ============================================================
// security-patches.js — 공통 보안 보정
//
// 역할:
//   - Firestore 등 외부 데이터가 innerHTML로 들어간 뒤 위험 속성이 남지 않도록 보정
//   - 큰 페이지 파일을 직접 교체하지 않아도 XSS 위험 구간을 즉시 완화
//   - 책자/제본 페이지 전용 보정 스크립트 로드
// ============================================================

const CURRENT_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

try {
  if (CURRENT_FILE === 'quote-book.html') {
    import('./wire-cover-patch.js').catch(() => null);
    import('./book-no-binding-cover-patch.js').catch(() => null);
  }
} catch (_) {}

function sanitizeHtmlStrict(html) {
  try {
    const allowed = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');

    Array.from(doc.body.querySelectorAll('*')).reverse().forEach(el => {
      if (!allowed.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        return;
      }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '');
        if (name.startsWith('on') || name === 'style') el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
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

hardenGuideHtml();
