// GreenOffice 2026 UX/UI runtime — visual and accessibility only.
const VERSION = '20260718b';

function pageKey() {
  try {
    const raw = ((location.pathname || '').split('/').pop() || 'index.html').toLowerCase();
    const file = raw === 'admin' ? 'admin.html' : raw;
    return file.replace(/\.html$/i, '') || 'index';
  } catch (_) {
    return 'index';
  }
}

function loadStyles() {
  if (document.getElementById('ux-refresh-style')) return;
  const link = document.createElement('link');
  link.id = 'ux-refresh-style';
  link.rel = 'stylesheet';
  link.href = `assets/css/ux-refresh.css?v=${VERSION}`;
  document.head.appendChild(link);
}

function markPage() {
  const page = pageKey();
  document.documentElement.dataset.uiRefresh = '1';
  document.documentElement.dataset.page = page;
  if (document.body) {
    document.body.dataset.uiRefresh = '1';
    document.body.dataset.page = page;
  }
}

function enhanceHeader() {
  const header = document.getElementById('main-header');
  if (!header) return;
  const apply = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
  apply();
  if (header.dataset.uxScrollBound !== '1') {
    header.dataset.uxScrollBound = '1';
    window.addEventListener('scroll', apply, { passive: true });
  }
}

function addSkipLink() {
  if (document.getElementById('ux-skip-link')) return;
  const target = document.querySelector('main') || document.getElementById('main-content');
  if (!target) return;
  if (!target.id) target.id = 'ux-main-content';

  const link = document.createElement('a');
  link.id = 'ux-skip-link';
  link.href = `#${target.id}`;
  link.textContent = '본문으로 바로가기';
  link.style.cssText = 'position:fixed;left:12px;top:10px;z-index:100000;padding:10px 14px;border-radius:10px;background:#10583a;color:#fff;font-weight:700;font-size:13px;transform:translateY(-160%);transition:transform .18s ease';
  link.addEventListener('focus', () => { link.style.transform = 'translateY(0)'; });
  link.addEventListener('blur', () => { link.style.transform = 'translateY(-160%)'; });
  document.body.prepend(link);
}

function addScrollTop() {
  if (pageKey() === 'admin' || document.getElementById('ux-scroll-top')) return;
  const button = document.createElement('button');
  button.id = 'ux-scroll-top';
  button.type = 'button';
  button.title = '맨 위로';
  button.setAttribute('aria-label', '맨 위로 이동');
  button.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(button);
  const apply = () => button.classList.toggle('is-visible', window.scrollY > 520);
  apply();
  window.addEventListener('scroll', apply, { passive: true });
}

function enhanceAccessibility(root = document) {
  if (!root || !root.querySelectorAll) return;

  root.querySelectorAll('button').forEach(button => {
    if (button.getAttribute('aria-label')) return;
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
    const title = button.getAttribute('title');
    if (!text && title) button.setAttribute('aria-label', title);
  });

  root.querySelectorAll('[id$="-modal"], [id$="Modal"], [id$="-overlay"]').forEach(modal => {
    if (!modal.getAttribute('role')) modal.setAttribute('role', 'dialog');
    if (!modal.getAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
  });
}

function revealMainPage() {
  if (pageKey() !== 'index') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const items = Array.from(document.querySelectorAll('main section, .hero-section, .service-card, .panel-card, .portfolio-item'))
    .filter(item => !item.closest('[id$="-modal"], [id$="Modal"], [id$="-overlay"]'))
    .slice(0, 60);

  items.forEach(item => item.classList.add('ux-reveal'));
  document.querySelector('.hero-section')?.classList.add('ux-visible');

  if (!('IntersectionObserver' in window)) {
    items.forEach(item => item.classList.add('ux-visible'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('ux-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  items.forEach(item => observer.observe(item));
}

function init() {
  markPage();
  addSkipLink();
  enhanceHeader();
  enhanceAccessibility();
  addScrollTop();
  revealMainPage();
  setTimeout(() => {
    enhanceHeader();
    enhanceAccessibility();
  }, 500);
}

loadStyles();
markPage();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.addEventListener('pageshow', () => {
  markPage();
  enhanceHeader();
});
