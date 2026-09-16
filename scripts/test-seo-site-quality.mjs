import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const canonicalOrigin = 'https://www.g-print.co.kr';
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
const hosting = JSON.parse(read('firebase.json'));
const session = read('assets/js/session.js');
const aiApi = read('functions/ai-api.js');
const seo = await import(pathToFileURL(path.join(root, 'assets/js/seo-runtime.js')).href + `?t=${Date.now()}`);

assert.equal(seo.SITE_ORIGIN, canonicalOrigin);
for (const page of ['/', '/quote-book.html', '/quote-print.html', '/qna.html', '/work-guide.html']) {
  assert.ok(Object.values(seo.PUBLIC_PAGES).some(meta => meta.canonical === page), `SEO runtime missing public canonical ${page}`);
  assert.ok(sitemap.includes(`<loc>${canonicalOrigin}${page === '/' ? '/' : page}</loc>`), `sitemap missing ${page}`);
}

for (const privatePath of ['/admin', '/admin.html', '/admin-ai-chat.html', '/mypage.html', '/login.html', '/maintenance.html']) {
  assert.ok(robots.includes(`Disallow: ${privatePath}`), `robots must disallow ${privatePath}`);
}
assert.ok(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
assert.ok(session.includes('import "./seo-runtime.js";'), 'session must load seo-runtime');

const headers = hosting.hosting?.headers || [];
const flattened = headers.flatMap(item => (item.headers || []).map(h => ({ source: item.source, ...h })));
function hasHeader(key, valuePart, sourcePart = null) {
  return flattened.some(h => h.key === key && String(h.value).includes(valuePart) && (!sourcePart || String(h.source).includes(sourcePart)));
}

assert.ok(hasHeader('X-Content-Type-Options', 'nosniff'));
assert.ok(hasHeader('Referrer-Policy', 'strict-origin-when-cross-origin'));
assert.ok(hasHeader('Permissions-Policy', 'camera=()'));
assert.ok(hasHeader('X-Frame-Options', 'SAMEORIGIN'));
assert.ok(hasHeader('X-Robots-Tag', 'noindex', 'admin'));
assert.ok(hasHeader('Cache-Control', 'no-cache', '**/*.html'));
assert.ok(hasHeader('Cache-Control', 'no-store', 'admin'));
assert.ok(hasHeader('Link', `${canonicalOrigin}/quote-book.html`, '/quote-book.html'));

assert.ok(aiApi.includes("'https://www.g-print.co.kr'"), 'AI CORS defaults must allow canonical production domain');
assert.ok(aiApi.includes("'https://g-print.co.kr'"), 'AI CORS defaults must allow bare production domain');

const seoSource = read('assets/js/seo-runtime.js');
for (const marker of [
  "'@type': 'LocalBusiness'",
  "telephone: '041-571-4370'",
  "streetAddress: '쌍용14길 29 1층'",
  "addressLocality: '천안시 서북구'",
  "property: 'og:url'",
  "name: 'twitter:card'",
]) {
  assert.ok(seoSource.includes(marker), `SEO runtime missing ${marker}`);
}

console.log('SEO, canonical, hosting header, private robots, and production AI-origin checks passed');
