// Reuse explicit footer links; only fill missing legal destinations on older pages.
const documents = [
  ['guide.html','이용안내','guide'],
  ['personal-info.html','개인정보처리방침','privacy'],
  ['terms.html','이용약관','terms'],
];
export function ensureFooterLegalLinks(footer = document.querySelector('.site-footer') || document.querySelector('footer')) {
  if (!footer) return;
  const existing = new Set(Array.from(footer.querySelectorAll('a[href]')).map(a => {
    try {
      const url = new URL(a.getAttribute('href'), document.baseURI);
      return url.origin === location.origin ? url.pathname.split('/').pop() : '';
    } catch { return ''; }
  }));
  const missing = documents.filter(([path]) => !existing.has(path));
  if (missing.length) {
    let links = footer.querySelector('[data-footer-legal-fallback]');
    if (!links) {
      links = document.createElement('nav');
      links.dataset.footerLegalFallback = '1';
      links.setAttribute('aria-label','이용 및 법적 안내');
      links.className = 'flex flex-wrap justify-center md:justify-end gap-x-5 gap-y-1.5 text-xs font-bold mb-2';
      const rightCol = footer.querySelector('.flex.flex-col.items-center.md\\:items-end') || footer.querySelector('.flex.flex-col.items-center') || footer;
      rightCol.insertBefore(links,rightCol.firstChild);
    }
    for (const [path,label,type] of missing) {
      const a = document.createElement('a');
      a.href=path; a.dataset.legal=type; a.textContent=label;
      a.className='text-slate-400 hover:text-white transition';
      links.appendChild(a);
    }
  }
  footer.dataset.legalLinksReady='1';
}
