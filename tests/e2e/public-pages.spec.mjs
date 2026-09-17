import { test, expect } from '@playwright/test';

const PAGES = [
  ['/', '그린오피스'],
  ['/quote-book.html', '책자'],
  ['/quote-print.html', '인쇄'],
  ['/qna.html', '고객'],
  ['/login.html', '주문 조회'],
];

// 운영 Firestore의 점검모드 값이 E2E 대상 페이지를 maintenance.html로 보내지 않도록
// 테스트 브라우저 안에서 maintenance-check 모듈만 no-op으로 격리합니다.
// 실제 배포 파일과 운영 점검모드 동작은 변경하지 않습니다.
test.beforeEach(async ({ page }) => {
  await page.route('**/assets/js/maintenance-check.js*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: '// Playwright E2E: live maintenance redirect intentionally isolated.\n',
    });
  });
});

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

test('critical page controls expose accessible names', async ({ page }) => {
  await page.goto('/quote-print.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#helpBtnPrint')).toHaveAttribute('aria-label', /도움말/);

  await page.goto('/quote-book.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#helpBtnBook')).toHaveAttribute('aria-label', /도움말/);

  // 공통 동적 헤더는 Firebase CDN 초기화에 의존하므로 source contract에서 검증합니다.
  // 브라우저 E2E에서는 외부 네트워크와 무관한 정적 모바일 탐색 구조를 확인합니다.
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#closeMobileNavBtn')).toHaveAttribute('aria-label', /메뉴 닫기/);
  await expect(page.locator('#mobileNavModal a[href="index.html"]')).toContainText('홈');
  await expect(page.locator('#mobileNavModal a[href="quote-book.html"]')).toContainText('책자');
  await expect(page.locator('#mobileNavModal a[href="quote-print.html"]')).toContainText('디지털');
  await expect(page.locator('#mobileNavModal a[href="qna.html"]')).toContainText('고객');
});

test.describe('mobile responsiveness', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('homepage fits mobile viewport and exposes mobile navigation destinations', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#mobileNavModal a[href="quote-book.html"]')).toContainText('책자');
    await expect(page.locator('#mobileNavModal a[href="quote-print.html"]')).toContainText('디지털');
    await assertNoHorizontalOverflow(page);
  });

  test('quote pages fit a 390px viewport', async ({ page }) => {
    for (const url of ['/quote-book.html', '/quote-print.html']) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(page);
    }
  });
});


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
