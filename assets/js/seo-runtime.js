// Public SEO metadata and private-page robots policy.
// Firebase와 무관한 순수 DOM 모듈로 유지해 검색 메타데이터 관리 지점을 하나로 모읍니다.

const SITE_ORIGIN = 'https://www.g-print.co.kr';

const PUBLIC_PAGES = {
  '/': {
    canonical: '/',
    title: '그린오피스 | 디지털 인쇄·출력·제본 전문',
    description: '천안 디지털 인쇄·출력·제본 전문 그린오피스. 책자, 보고서, 학원교재, 리플렛, 전단지, 포스터 등 온라인 견적과 제작 상담을 제공합니다.',
  },
  '/index.html': {
    canonical: '/',
    title: '그린오피스 | 디지털 인쇄·출력·제본 전문',
    description: '천안 디지털 인쇄·출력·제본 전문 그린오피스. 책자, 보고서, 학원교재, 리플렛, 전단지, 포스터 등 온라인 견적과 제작 상담을 제공합니다.',
  },
  '/quote-book.html': {
    canonical: '/quote-book.html',
    title: '책자·제본 견적 | 그린오피스',
    description: '보고서, 학원교재, 논문, 제안서 등 책자·제본 사양을 입력하고 온라인 견적을 확인하세요.',
  },
  '/quote-print.html': {
    canonical: '/quote-print.html',
    title: '디지털 인쇄 견적 | 그린오피스',
    description: '리플렛, 전단지, 안내장, 포스터 등 디지털 칼라인쇄 사양을 입력하고 온라인 견적을 확인하세요.',
  },
  '/qna.html': {
    canonical: '/qna.html',
    title: '고객센터·문의 | 그린오피스',
    description: '인쇄·출력·제본 견적, 파일 준비, 납기와 제작 관련 문의를 남겨주세요.',
  },
  '/work-guide.html': {
    canonical: '/work-guide.html',
    title: '인쇄 작업가이드 | 그린오피스',
    description: '인쇄·출력·제본 작업 전 필요한 파일 준비와 제작 가이드를 확인하세요.',
  },
};

const PRIVATE_PAGES = new Set([
  '/admin', '/admin.html', '/admin-ai-chat.html', '/mypage.html', '/login.html', '/maintenance.html',
]);

function ensureMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function ensureCanonical(url) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = url;
}

function applyPublicMeta(meta) {
  const canonical = SITE_ORIGIN + meta.canonical;
  ensureCanonical(canonical);
  ensureMeta('meta[name="description"]', { name: 'description', content: meta.description });
  ensureMeta('meta[property="og:title"]', { property: 'og:title', content: meta.title });
  ensureMeta('meta[property="og:description"]', { property: 'og:description', content: meta.description });
  ensureMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  ensureMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'ko_KR' });
  ensureMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
  ensureMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' });
  ensureMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: meta.title });
  ensureMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: meta.description });
}

function applyPrivateRobots() {
  ensureMeta('meta[name="robots"]', { name: 'robots', content: 'noindex, nofollow, noarchive' });
  ensureMeta('meta[name="googlebot"]', { name: 'googlebot', content: 'noindex, nofollow, noarchive' });
}

function applyLocalBusinessSchema() {
  if (document.getElementById('greenoffice-local-business-schema')) return;
  const script = document.createElement('script');
  script.id = 'greenoffice-local-business-schema';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: '그린오피스',
    url: SITE_ORIGIN + '/',
    telephone: '041-571-4370',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '쌍용14길 29 1층',
      addressLocality: '천안시 서북구',
      addressRegion: '충청남도',
      addressCountry: 'KR',
    },
  });
  document.head.appendChild(script);
}

export function applySeoRuntime(pathname = location.pathname || '/') {
  const normalized = pathname === '' ? '/' : pathname;
  if (PRIVATE_PAGES.has(normalized)) {
    applyPrivateRobots();
    return { type: 'private', pathname: normalized };
  }
  const meta = PUBLIC_PAGES[normalized];
  if (!meta) return { type: 'unknown', pathname: normalized };
  applyPublicMeta(meta);
  if (normalized === '/' || normalized === '/index.html') applyLocalBusinessSchema();
  return { type: 'public', pathname: normalized, canonical: SITE_ORIGIN + meta.canonical };
}

try { applySeoRuntime(); } catch (_) {}

export { SITE_ORIGIN, PUBLIC_PAGES, PRIVATE_PAGES };
