from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = ["quote-book.html", "quote-print.html", "qna.html"]
SHELL_TAG = '<script src="assets/js/header-shell.js"></script>'
MAINTENANCE_TAG = '<script type="module" src="assets/js/maintenance-check.js"></script>'

for rel in HTML_FILES:
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if SHELL_TAG not in text:
        if MAINTENANCE_TAG not in text:
            raise SystemExit(f"guard failed: maintenance tag missing in {rel}")
        text = text.replace(MAINTENANCE_TAG, SHELL_TAG + "\n" + MAINTENANCE_TAG, 1)
        path.write_text(text, encoding="utf-8")

spec_path = ROOT / "tests/e2e/public-pages.spec.mjs"
spec = spec_path.read_text(encoding="utf-8")
marker = "shared navigation survives Firebase module failure"
if marker not in spec:
    spec += r'''

test('shared navigation survives Firebase module failure', async ({ page }) => {
  await page.route('**/assets/js/firebase.js*', route => route.abort());
  for (const url of ['/quote-book.html', '/quote-print.html', '/qna.html']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const header = page.locator('#main-header');
    await expect(header).toBeVisible();
    await expect(header.locator('a[href="quote-book.html"]')).toContainText('책자/제본');
    await expect(header.locator('a[href="quote-print.html"]')).toContainText('디지털인쇄');
    await expect(header.locator('a[href="qna.html"]')).toContainText('고객센터');
    await expect(header.locator('a[aria-label="그린오피스 홈"]')).toBeVisible();
  }
});

test('shared navigation is visible on quote and customer pages during normal load', async ({ page }) => {
  for (const url of ['/quote-book.html', '/quote-print.html', '/qna.html']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-header')).toBeVisible();
    await expect(page.locator('#main-header a[href="quote-book.html"]')).toBeAttached();
    await expect(page.locator('#main-header a[href="quote-print.html"]')).toBeAttached();
    await expect(page.locator('#main-header a[href="qna.html"]')).toBeAttached();
  }
});
'''
    spec_path.write_text(spec, encoding="utf-8")

contract_path = ROOT / "scripts/test-header-shell-contract.mjs"
if not contract_path.exists():
    contract_path.write_text(r'''import fs from 'node:fs';
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
for (const token of ['quote-book.html', 'quote-print.html', 'qna.html', 'work-guide.html', 'id="main-header"', 'data-header-shell="fallback"']) {
  assert.ok(shell.includes(token), `header-shell contract missing: ${token}`);
}
assert.ok(!/from\s+["']\.\/firebase\.js|import\s*\(/.test(shell), 'fallback header must not depend on Firebase or dynamic imports');

console.log('Header fallback contract checks passed');
''', encoding="utf-8")

package_path = ROOT / "package.json"
pkg = json.loads(package_path.read_text(encoding="utf-8"))
scripts = pkg.setdefault("scripts", {})
scripts["test:header-shell"] = "node scripts/test-header-shell-contract.mjs"
ci = scripts.get("test:ci", "")
if "test:header-shell" not in ci:
    scripts["test:ci"] = ci + " && npm run test:header-shell"
package_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print('header patch prepared')
