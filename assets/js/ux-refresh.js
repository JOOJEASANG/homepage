// ============================================================
// ux-refresh.js — GreenOffice 2026 공통 UX/UI 보정
//
// 기능 로직은 변경하지 않고 다음 항목만 담당합니다.
// - 공통 디자인 CSS 로드
// - 페이지 식별 속성 설정
// - 헤더 스크롤 상태, 섹션 등장 효과, 맨 위로 버튼
// - 기본 접근성 속성 및 모달 키보드 사용성 보완
// ============================================================

const UX_VERSION = '20260718a';

function currentPageKey() {
  try {
    const raw = ((location.pathname || '').split('/').pop() || 'index.html').toLowerCase();
    const file = raw === 'admin' ? 'admin.html' : raw;
    return file.replace(/\.html$/i, '') || 'index';
  } catch (_) {
    return 'index';
  }
}

function loadUxStyles() {
  if (document.getElementById('ux-refresh-style')) return;
  const link = document.createElement('link');
  link.id = 'ux-refresh-style';
  link.rel = 'stylesheet';
  link.href = `assets/css/ux-refresh.css?v=${UX_VERSION}`;
  document.head.appendChild(link);
}

loadUxStyles();
document.documentElement.dataset.uiRefresh = '1';
document.documentElement.dataset.page = currentPageKey();

function setPageMarkers() {
  const page = currentPageKey();
  document.documentElement.dataset.uiRefresh = '1';
  document.documentElement.dataset.page = page;
  if (document.body) {
    document.body.dataset.uiRefresh = '1';
    document.body.dataset.page = page;
  }
}

function enhanceHeader() {
  const header = document.getElementById('main-header');
  if (!header) return false;

  const apply = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
  apply();

  if (header.dataset.uxScrollBound !== '1') {
    header.dataset.uxScrollBound = '1';
    window.addEventListener('scroll', apply, { passive: true });
  }

  const logo = header.querySelector('nav > a:first-child');
  if (logo && !logo.getAttribute('aria-label')) logo.setAttribute('aria-label', '그린오피스 홈');
  return true;
}

function addSkipLink() {
  if (document.getElementById('ux-skip-link')) return;
  const target = document.querySelector('main') || document.getElementById('main-content');
  if (!target) return;
  if (!target.id) target.id = 'ux-main-content';

  const a = document.createElement('a');
  a.id = 'ux-skip-link';
  a.href = `#${target.id}`;
  a.textContent = '본문으로 바로가기';
  a.style.cssText = [
    'position:fixed', 'left:12px', 'top:10px', 'z-index:100000',
    'padding:10px 14px', 'border-radius:10px', 'background:#10583a',
    'color:#fff', 'font-weight:700', 'font-size:13px',
    'transform:translateY(-160%)', 'transition:transform .18s ease'
  ].join(';');
  a.addEventListener('focus', () => { a.style.transform = 'translateY(0)'; });
  a.addEventListener('blur', () => { a.style.transform = 'translateY(-160%)'; });
  document.body.prepend(a);
}

function addScrollTopButton() {
  const page = currentPageKey();
  if (page === 'admin' || document.getElementById('ux-scroll-top')) return;

  const btn = document.createElement('button');
  btn.id = 'ux-scroll-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', '맨 위로 이동');
  btn.title = '맨 위로';
  btn.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);

  const apply = () => btn.classList.toggle('is-visible', window.scrollY > 520);
  apply();
  window.addEventListener('scroll', apply, { passive: true });
}

function enhanceButtonsAndForms(root = document) {
  root.querySelectorAll('button:not([type])').forEach(btn => btn.setAttribute('type', 'button'));

  root.querySelectorAll('button, a').forEach(el => {
    if (el.dataset.uxPressBound === '1') return;
    el.dataset.uxPressBound = '1';
    if (el.tagName === 'BUTTON' && !el.getAttribute('aria-label')) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const title = el.getAttribute('title');
      if (!text && title) el.setAttribute('aria-label', title);
    }
  });

  root.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.disabled) return;
    if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
      const id = el.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const placeholder = el.getAttribute('placeholder');
      if (!label && placeholder) el.setAttribute('aria-label', placeholder);
    }
  });
}

function enhanceDialogs(root = document) {
  root.querySelectorAll('[id$="-modal"], [id$="Modal"], [id$="-overlay"]').forEach(modal => {
    if (!modal.getAttribute('role')) modal.setAttribute('role', 'dialog');
    if (!modal.getAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
  });
}

function initRevealEffects() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const page = currentPageKey();
  if (page !== 'index') return;

  const candidates = Array.from(document.querySelectorAll(
    'main section, .hero-section, .service-card, .panel-card, .portfolio-item'
  )).filter(el => !el.closest('[id$="-modal"], [id$="Modal"], [id$="-overlay"]'));

  candidates.slice(0, 60).forEach(el => el.classList.add('ux-reveal'));

  if (!('IntersectionObserver' in window)) {
    candidates.forEach(el => el.classList.add('ux-visible'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('ux-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });

  candidates.forEach(el => observer.observe(el));
}

function initDynamicEnhancer() {
  if (!document.body || document.body.dataset.uxObserverBound === '1') return;
  document.body.dataset.uxObserverBound = '1';

  let scheduled = false;
  const observer = new MutationObserver(mutations => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const roots = mutations.flatMap(m => Array.from(m.addedNodes || []))
        .filter(n => n && n.nodeType === Node.ELEMENT_NODE);
      if (!roots.length) return;
      roots.forEach(root => {
        enhanceButtonsAndForms(root);
        enhanceDialogs(root);
      });
      enhanceHeader();
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
  setPageMarkers();
  addSkipLink();
  enhanceHeader();
  enhanceButtonsAndForms();
  enhanceDialogs();
  addScrollTopButton();
  initRevealEffects();
  initDynamicEnhancer();

  setTimeout(enhanceHeader, 120);
  setTimeout(() => {
    enhanceButtonsAndForms();
    enhanceDialogs();
  }, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.addEventListener('pageshow', () => {
  setPageMarkers();
  enhanceHeader();
});
