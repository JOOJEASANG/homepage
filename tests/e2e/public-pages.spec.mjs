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

async function assertSharedHeaderNavigation(page) {
  const header = page.locator('#main-header');
  await expect(header).toBeVisible();

  const expectedLinks = [
    ['quote-book.html', '책자/제본'],
    ['quote-print.html', '디지털인쇄'],
    ['qna.html', '고객센터'],
  ];
  const desktop = (page.viewportSize()?.width || 0) >= 1024;
  for (const [href, text] of expectedLinks) {
    const links = header.locator(`a[href="${href}"]`);
    expect(await links.count(), `${href} should exist in shared header`).toBeGreaterThanOrEqual(1);
    await expect(links.first()).toContainText(text);
    if (desktop) {
      const visibleLinks = header.locator(`a[href="${href}"]:visible`);
      expect(await visibleLinks.count(), `${href} should be visibly rendered in desktop header`).toBeGreaterThanOrEqual(1);
      await expect(visibleLinks.first()).toBeVisible();
    }
  }
  await expect(header.locator('a[aria-label="그린오피스 홈"]').first()).toBeVisible();
}

async function assertHeaderRenderedState(page) {
  const state = await page.evaluate(() => {
    const mount = document.getElementById('site-header');
    const header = document.getElementById('main-header');
    const desktopNav = header?.querySelector('nav > .hidden.lg\\:flex');
    const read = el => {
      if (!el) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity || 1),
        width: rect.width,
        height: rect.height,
        hidden: !!el.hidden,
      };
    };
    return { mount: read(mount), header: read(header), desktopNav: read(desktopNav) };
  });

  expect(state.mount, 'site-header mount should exist').not.toBeNull();
  expect(state.header, 'main-header should exist').not.toBeNull();
  expect(state.mount.display).not.toBe('none');
  expect(state.mount.visibility).not.toBe('hidden');
  expect(state.mount.opacity).toBeGreaterThan(0);
  expect(state.mount.hidden).toBeFalsy();
  expect(state.header.display).not.toBe('none');
  expect(state.header.visibility).not.toBe('hidden');
  expect(state.header.opacity).toBeGreaterThan(0);
  expect(state.header.width).toBeGreaterThan(100);
  expect(state.header.height).toBeGreaterThan(40);
  expect(state.header.hidden).toBeFalsy();
  if ((page.viewportSize()?.width || 0) >= 1024) {
    expect(state.desktopNav, 'desktop navigation container should exist').not.toBeNull();
    expect(state.desktopNav.display).toBe('flex');
    expect(state.desktopNav.visibility).not.toBe('hidden');
    expect(state.desktopNav.opacity).toBeGreaterThan(0);
    expect(state.desktopNav.width).toBeGreaterThan(100);
  }
}

async function assertHeaderAboveLoadingOverlay(page) {
  const stacking = await page.evaluate(() => {
    const header = document.querySelector('#main-header');
    const overlay = document.querySelector('#loading-overlay');
    if (!header) return { header: -1, overlay: -1, overlayVisible: false };
    const headerZ = Number.parseInt(getComputedStyle(header).zIndex, 10) || 0;
    if (!overlay) return { header: headerZ, overlay: -1, overlayVisible: false };
    const overlayStyle = getComputedStyle(overlay);
    const overlayVisible = overlayStyle.display !== 'none' && overlayStyle.visibility !== 'hidden' && Number(overlayStyle.opacity || 1) > 0;
    const overlayZ = Number.parseInt(overlayStyle.zIndex, 10) || 0;
    return { header: headerZ, overlay: overlayZ, overlayVisible };
  });
  if (stacking.overlayVisible) {
    expect(stacking.header, `header z-index ${stacking.header} must be above loading overlay ${stacking.overlay}`).toBeGreaterThan(stacking.overlay);
  }
}

async function clickVisibleHeaderLink(page, href) {
  let link = page.locator(`#main-header a[href="${href}"]:visible`).first();
  if (await link.count()) {
    await link.click();
    return;
  }

  const mobileToggle = page.locator('#main-header #btn-mobile-menu:visible, #main-header #btn-mobile-menu-shell:visible').first();
  await expect(mobileToggle, `mobile menu toggle should be visible before navigating to ${href}`).toBeVisible();
  await mobileToggle.click();

  link = page.locator(`#main-header a[href="${href}"]:visible`).first();
  await expect(link, `mobile navigation link ${href} should become visible`).toBeVisible();
  await link.click();
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
    await assertSharedHeaderNavigation(page);
    await assertHeaderRenderedState(page);
    await assertHeaderAboveLoadingOverlay(page);
  }
});

test('shared navigation is visible on quote and customer pages during normal load', async ({ page }) => {
  for (const url of ['/quote-book.html', '/quote-print.html', '/qna.html']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await assertSharedHeaderNavigation(page);
    await assertHeaderRenderedState(page);
    await assertHeaderAboveLoadingOverlay(page);
  }
});

test('book and customer center header stays visible after async startup settles', async ({ page }) => {
  for (const url of ['/quote-book.html', '/qna.html']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await assertSharedHeaderNavigation(page);
    await page.waitForTimeout(4000);
    await assertSharedHeaderNavigation(page);
    await assertHeaderRenderedState(page);
    await assertHeaderAboveLoadingOverlay(page);
  }
});

test('header remains visible while navigating through its menu links', async ({ page }) => {
  await page.goto('/quote-book.html', { waitUntil: 'domcontentloaded' });
  await assertSharedHeaderNavigation(page);
  await assertHeaderRenderedState(page);
  await assertHeaderAboveLoadingOverlay(page);

  for (const [href, pathname] of [
    ['quote-print.html', '/quote-print.html'],
    ['qna.html', '/qna.html'],
    ['quote-book.html', '/quote-book.html'],
  ]) {
    await Promise.all([
      page.waitForURL(url => url.pathname === pathname),
      clickVisibleHeaderLink(page, href),
    ]);
    await page.waitForTimeout(1000);
    await expect(page.locator('#main-header')).toBeVisible();
    await assertSharedHeaderNavigation(page);
    await assertHeaderRenderedState(page);
    await assertHeaderAboveLoadingOverlay(page);
  }
});
