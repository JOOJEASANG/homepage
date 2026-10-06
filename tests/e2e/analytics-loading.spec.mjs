import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Keep this test focused on HTML/script scheduling without accessing live data.
  await page.route('**/assets/js/pages/*.js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/assets/js/maintenance-check.js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
});

for (const path of ['/index.html', '/quote-book.html', '/quote-print.html']) {
  test(`${path} renders when the analytics server never responds`, async ({ page }) => {
    await page.route('https://wcs.pstatic.net/wcslog.js', () => new Promise(() => {}));
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await expect(page.locator('#main-header')).toBeVisible();
    expect(await page.locator('script[src="https://wcs.pstatic.net/wcslog.js"]').evaluate(script => script.async)).toBe(true);
  });
}

test('analytics initializes the existing account exactly once after its SDK arrives', async ({ page }) => {
  await page.route('https://wcs.pstatic.net/wcslog.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.wcs_do = () => { window.__analyticsAccount = window.wcs_add.wa; window.__analyticsVisits = (window.__analyticsVisits || 0) + 1; };',
  }));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__analyticsVisits)).toBe(1);
  expect(await page.evaluate(() => window.__analyticsAccount)).toBe('93643ac58d5');
  await page.addScriptTag({ url: '/assets/js/naver-analytics.js' });
  expect(await page.evaluate(() => window.__analyticsVisits)).toBe(1);
});
