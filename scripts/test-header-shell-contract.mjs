import fs from 'node:fs';
import assert from 'node:assert/strict';

const pages = ['quote-book.html', 'quote-print.html', 'qna.html'];
const shellTag = '<script src="assets/js/header-shell.js"></script>';
const maintenanceTag = '<script type="module" src="assets/js/maintenance-check.js"></script>';

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes('<div id="site-header"></div>'), `${file}: site-header mount missing`);
  assert.ok(html.includes(shellTag), `${file}: dependency-free header shell missing`);
  assert.ok(html.indexOf(shellTag) < html.indexOf(maintenanceTag), `${file}: shell must load before Firebase-dependent maintenance module`);
}

const shell = fs.readFileSync('assets/js/header-shell.js', 'utf8');
for (const token of [
  'quote-book.html',
  'quote-print.html',
  'qna.html',
  'work-guide.html',
  'id="main-header"',
  'data-header-shell="fallback"',
  'header-shell-critical-style',
  'z-index: 150 !important',
  'MutationObserver',
  "window.addEventListener('pageshow', boot)",
]) {
  assert.ok(shell.includes(token), `header-shell contract missing: ${token}`);
}
assert.ok(!/from\s+["']\.\/firebase\.js|import\s*\(/.test(shell), 'fallback header must not depend on Firebase or dynamic imports');

console.log('Header fallback contract checks passed');
