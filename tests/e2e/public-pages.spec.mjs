import { test, expect } from '@playwright/test';

const PAGES = [
  ['/', '그린오피스'],
  ['/quote-book.html', '책자'],
  ['/quote-print.html', '인쇄'],
  ['/qna.html', '고객'],
  ['/login.html', '로그인'],
];

function watchFatalRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => {
    const name = String(error?.name || '');
    const message = String(error?.message || error || '');
    if (name === 'SyntaxError' || /SyntaxError|Unexpected token|Cannot use import statement/.test(message)) {
      errors.push(`${name}: ${message}`);
    }
  });
  return errors;
}

async function assertDocumentBasics(page) {
  await expect(page.locator('html')).toHaveAttribute('lang', /ko/i);
  await expect(page).toHaveTitle(/.+/);
  const h1Count = await page.locator('h1').count();
  expect(h1Count, 'each public page should expose a primary heading').toBeGreaterThan(0);
  const duplicateIds = await page.evaluate(() => {
    const counts = new Map();
    document.querySelectorAll('[id]').forEach(el => counts.set(el.id, (counts.get(el.id) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  });
  expect(duplicateIds, `duplicate ids: ${duplicateIds.join(', ')}`).toEqual([]);
}

async function assertNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body?.scrollWidth || 0,
  }));
  expect(Math.max(metrics.html, metrics.body)).toBeLessThanOrEqual(metrics.viewport + 3);
}

test.describe('public page browser smoke', () => {
  for (const [url, titleHint] of PAGES) {
    test(`${url} loads without fatal syntax errors`, async ({ page }) => {
      const fatalErrors = watchFatalRuntimeErrors(page);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      expect(response?.ok(), `${url} should return 2xx`).toBeTruthy();
      await assertDocumentBasics(page);
      expect((await page.title()).toLowerCase()).toContain(titleHint.toLowerCase());
      await page.waitForTimeout(750);
      expect(fatalErrors).toEqual([]);
    });
  }
});

test('quote-print form accepts core specification inputs without submitting', async ({ page }) => {
  await page.goto('/quote-print.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#quoteForm')).toBeAttached();
  await page.locator('#orderName').fill('E2E 테스트 인쇄물');
  await page.locator('#quantity').fill('250');
  await page.locator('#printSides').selectOption('2');
  await page.locator('#paperSize').selectOption('A4');
  await expect(page.locator('#orderName')).toHaveValue('E2E 테스트 인쇄물');
  await expect(page.locator('#quantity')).toHaveValue('250');
  await expect(page.locator('#printSides')).toHaveValue('2');
  await expect(page.locator('#paperSize')).toHaveValue('A4');
});

test('critical navigation controls expose accessible names', async ({ page }) => {
  await page.goto('/quote-print.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#helpBtnPrint')).toHaveAttribute('aria-label', /도움말/);

  await page.goto('/quote-book.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#helpBtnBook')).toHaveAttribute('aria-label', /도움말/);

  // 공통 헤더는 ES module 초기화 후 주입됩니다. 외부 CDN 지연 시에도 제한된 시간 내에 나타나야 합니다.
  await page.waitForSelector('#btn-mobile-menu', { state: 'attached', timeout: 12_000 });
  await expect(page.locator('#btn-mobile-menu')).toHaveAttribute('aria-label', /메뉴/);
  await expect(page.locator('#main-header a[aria-label="그린오피스 홈"]')).toBeAttached();
});

test.describe('mobile responsiveness', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('homepage mobile navigation opens and has no horizontal overflow', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#btn-mobile-menu', { state: 'visible', timeout: 12_000 });
    await page.locator('#btn-mobile-menu').click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
    await expect(page.locator('#mobile-menu a[href="quote-book.html"]')).toContainText('책자');
    await assertNoHorizontalOverflow(page);
  });

  test('quote pages fit a 390px viewport', async ({ page }) => {
    for (const url of ['/quote-book.html', '/quote-print.html']) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(page);
    }
  });
});
