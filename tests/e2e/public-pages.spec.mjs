import { test, expect } from '@playwright/test';

const PAGES = [
  ['/', '그린오피스'],
  ['/quote-book.html', '책자'],
  ['/quote-print.html', /디지털\s*(?:인쇄|출력)/],
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
    // The fallback header uses 인쇄; the existing runtime normalizes it to 출력.
    ['quote-print.html', /디지털\s*(?:인쇄|출력)/],
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
      if (titleHint instanceof RegExp) await expect(page).toHaveTitle(titleHint);
      else expect((await page.title()).toLowerCase()).toContain(titleHint.toLowerCase());
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

  // Regression guard: the page-init handler must actually run so the quote calculator
  // is wired up. #paperWeight is empty in static HTML and is filled only by
  // fillWeightOptions() inside that handler. If the module evaluates after
  // DOMContentLoaded has already fired (its graph imports a module with a top-level
  // await), a plain DOMContentLoaded listener never fires and quotes never compute.
  await expect.poll(() => page.locator('#paperWeight option').count(), { timeout: 10_000 })
    .toBeGreaterThan(0);
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

test('homepage footer contains contact details once, matches header logo and does not duplicate legal links', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const footer = page.locator('.site-footer');
  await expect(page.locator('.contact-strip')).toHaveCount(0);
  await expect(footer.locator('a[href="tel:041-571-4370"]')).toHaveCount(1);
  await expect(footer.locator('a[href="mailto:winwork@hanmail.net"]')).toHaveCount(1);
  await expect(footer).toContainText('041-571-4370');
  await expect(footer).toContainText('winwork@hanmail.net');
  await page.evaluate(async()=>{
    const {ensureFooterLegalLinks}=await import('/assets/js/footer-legal-links.js');
    ensureFooterLegalLinks();ensureFooterLegalLinks();
  });
  for(const path of ['guide.html','personal-info.html','terms.html']) {
    await expect(footer.locator('a[href="'+path+'"]')).toHaveCount(1);
  }
  await expect(footer.locator('[data-footer-legal-fallback]')).toHaveCount(0);
  await expect(footer.locator('.home-footer-logo i')).toHaveClass(/fa-print/);
  const headerLogo=page.locator('#main-header nav > a:first-child > div');
  await expect(headerLogo.locator('i')).toHaveClass(/fa-print/);
  const logoStyle=await headerLogo.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,width:s.width,height:s.height,radius:s.borderRadius};});
  const footerStyle=await footer.locator('.home-footer-logo').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,width:s.width,height:s.height,radius:s.borderRadius};});
  expect(footerStyle).toEqual(logoStyle);
  const fallback=await page.evaluate(async()=>{
    const {ensureFooterLegalLinks}=await import('/assets/js/footer-legal-links.js');
    const footer=document.createElement('footer');
    footer.innerHTML='<a href="guide.html">이용안내</a>';
    ensureFooterLegalLinks(footer);ensureFooterLegalLinks(footer);
    return Array.from(footer.querySelectorAll('a')).map(a=>a.getAttribute('href'));
  });
  expect(fallback).toEqual(['personal-info.html','terms.html','guide.html']);
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


test('digital print guide recovers after a transient Firestore read failure', async ({ page }) => {
  let blockedOnce = false;
  await page.route('https://firestore.googleapis.com/**', async route => {
    if (!blockedOnce) {
      blockedOnce = true;
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/quote-print.html', { waitUntil: 'domcontentloaded' });
  const guide = page.locator('#guideText');
  await expect(guide).toBeAttached();

  await expect.poll(async () => {
    return await guide.getAttribute('data-guide-state');
  }, { timeout: 9000 }).toBe('loaded');

  await expect.poll(async () => {
    return String((await guide.textContent()) || '').trim();
  }, { timeout: 9000 }).not.toMatch(/안내문을 불러오지 못했습니다|안내문을 불러오는 중입니다/);
});


test('digital print guide keeps safe embedded images after security hardening', async ({ page }) => {
  await page.goto('/quote-print.html', { waitUntil: 'domcontentloaded' });
  const guide = page.locator('#guideText');
  await expect(guide).toBeAttached();

  await expect.poll(async () => {
    return await guide.getAttribute('data-guide-state');
  }, { timeout: 9000 }).toBe('loaded');

  await page.evaluate(() => {
    const el = document.getElementById('guideText');
    if (el) {
      el.innerHTML = '<p>이미지 테스트</p><img src="/favicon.ico" alt="테스트 이미지" onerror="window.__guideImgError=1" style="width:1px">';
    }
  });

  await page.waitForTimeout(250);
  const img = guide.locator('img[src="/favicon.ico"]');
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute('alt', '테스트 이미지');
  await expect(img).not.toHaveAttribute('onerror');
  await expect(img).not.toHaveAttribute('style');
});


test('order lookup control keeps the same button styling across public pages', async ({ page }) => {
  const pages = ['/index.html', '/quote-book.html', '/quote-print.html', '/qna.html'];
  const snapshots = [];

  for (const path of pages) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const control = page.locator('[data-order-lookup-control="1"]').first();
    await expect(control).toBeVisible();
    await page.waitForTimeout(900);

    snapshots.push(await control.evaluate(el => {
      const s = getComputedStyle(el);
      return {
        backgroundColor: s.backgroundColor,
        color: s.color,
        borderRadius: s.borderRadius,
        fontWeight: s.fontWeight,
        paddingTop: s.paddingTop,
        paddingBottom: s.paddingBottom,
      };
    }));
  }

  for (const style of snapshots) {
    expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.backgroundColor).not.toBe('transparent');
    expect(style.color).toBe('rgb(255, 255, 255)');
    expect(Number.parseInt(style.fontWeight, 10)).toBeGreaterThanOrEqual(700);
  }

  for (const style of snapshots.slice(1)) {
    expect(style).toEqual(snapshots[0]);
  }
});


for (const [path, expected] of [
  ['/guide.html', '견적부터 제작까지'],
  ['/personal-info.html', '보유·이용기간'],
  ['/terms.html', '청약철회·환불 및 하자 처리'],
]) {
  test(`legal page ${path} is readable directly and linked from its tabs`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#legal-policy-content')).toContainText(expected);
    await expect(page.locator('#legal-policy-content section')).not.toHaveCount(0);
    for (const href of ['guide.html', 'personal-info.html', 'terms.html']) {
      await expect(page.locator('.legal-tabs a[href="' + href + '"]')).toHaveCount(1);
    }
    await assertNoHorizontalOverflow(page);
  });
}

test('homepage exposes working legal-document links', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const footer = page.locator('footer.site-footer');
  for (const href of ['guide.html', 'personal-info.html', 'terms.html']) {
    await expect(footer.locator('a[href="' + href + '"]')).toBeVisible();
  }
});


test('guest quote and customer forms link to privacy information', async ({ page }) => {
  for (const path of ['/quote-book.html', '/quote-print.html']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#signup-form a[href="personal-info.html"]')).toHaveCount(1);
    await expect(page.locator('#signup-form .btn-text')).toContainText('내용 확인 후 접수하기');
  }
  await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#guest-lookup-form a[href="personal-info.html"]')).toHaveCount(1);
  await page.goto('/qna.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#qna-compose a[href="personal-info.html"]')).toHaveCount(1);
});


test('homepage exposes direct quote, order lookup and preparation paths on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero-actions a[href="quote-book.html"]')).toBeVisible();
  await expect(page.locator('.hero-actions a[href="quote-print.html"]')).toBeVisible();
  await expect(page.locator('.home-quick-links')).toHaveCount(0);
  await expect(page.locator('.hero-copy a[href="login.html"], .hero-copy a[href="work-guide.html"], .hero-copy a[href="qna.html"]')).toHaveCount(0);
  await expect(page.locator('.home-help-grid article')).toHaveCount(6);
  await expect(page.locator('#print-studio .home-help-grid article')).toHaveCount(3);
  await expect(page.locator('#print-studio a[href="booklet-studio.html"]')).toBeHidden();
  await expect(page.locator('#print-studio a[href="cover-studio.html"]')).toBeHidden();
  await expect(page.locator('#print-studio a[href="layout-studio.html"]')).toBeHidden();
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await assertNoHorizontalOverflow(page);
});

test('notice publication dates use the Korean calendar and inclusive date boundaries', async () => {
  const { noticeDayKey, isActiveNotice } = await import('../../assets/js/notice-period-utils.js');
  expect(noticeDayKey(new Date('2026-11-24T15:00:00Z'))).toBe('2026-11-25');
  expect(isActiveNotice({ publishStartDate: '2026-11-26' }, '2026-11-25')).toBe(false);
  expect(isActiveNotice({ publishEndDate: '2026-11-24' }, '2026-11-25')).toBe(false);
  expect(isActiveNotice({ publishStartDate: '2026-11-25', publishEndDate: '2026-11-25' }, '2026-11-25')).toBe(true);
  expect(isActiveNotice({}, '2026-11-25')).toBe(true);
});

test('shared rich text sanitizer removes unsafe notice links and attributes', async ({ page }) => {
  await page.goto('/404.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { sanitizeRichText } = await import('/assets/js/rich-text-sanitizer.js');
    const template = document.createElement('template');
    template.innerHTML = sanitizeRichText('<p onclick="alert(1)">안내</p><a href=" javascript:alert(1)">위험</a><a href="https://example.com/">안전</a>');
    const links = template.content.querySelectorAll('a');
    return { onclick: template.content.querySelector('p').hasAttribute('onclick'), unsafe: links[0].hasAttribute('href'), safe: links[1].getAttribute('href'), rel: links[1].getAttribute('rel') };
  });
  expect(result).toEqual({ onclick: false, unsafe: false, safe: 'https://example.com/', rel: 'noopener noreferrer' });
});


test('homepage replaces public activity boards with compact notices and FAQ', async ({ page }) => {
  await page.route('**/assets/js/notice-publish-period-public.js*', route => route.fulfill({contentType:'application/javascript',body:'// Isolate live notices for the layout/navigation test.'}));
  const activityRequests = [];
  page.on('request', request => {
    if (/public-feed-v2\.js|refreshPublicFeed/.test(request.url())) activityRequests.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#recent-quotes-container, #recent-qna-container, .realtime-section')).toHaveCount(0);
  await expect(page.locator('#home-notice-section')).toHaveCount(1);
  await expect(page.locator('.home-faq-list details')).toHaveCount(3);
  const first = page.locator('.home-faq-list details').first();
  await first.locator('summary').click();
  await expect(first).toHaveAttribute('open', '');
  await expect(first.locator('p')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  expect(activityRequests).toEqual([]);
  await page.locator('.home-faq-section a[href="qna.html#faq"]').click();
  await expect(page).toHaveURL(/qna\.html#faq$/);
  await expect(page.locator('#content-faq')).toBeVisible();
});

test('compact notice list keeps important notices first and older notices expandable', async ({ page }) => {
  await page.route('**/assets/js/firebase.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const db={}; export const collection=()=>({}); export const onSnapshot=()=>()=>{};'
  }));
  await page.goto('/404.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { renderNoticeList } = await import('/assets/js/notice-publish-period-public.js');
    const section = document.createElement('section');
    section.id = 'home-notice-section';
    section.innerHTML = '<div id="notice-list-container"></div><details id="home-notice-more"><summary>더보기</summary><div id="notice-more-list"></div></details>';
    document.body.append(section);
    renderNoticeList([]);
    const emptyHidden = section.hidden;
    renderNoticeList([
      {id:'1',title:'최근 공지',createdAt:{seconds:30}},
      {id:'2',title:'중요 공지',isImportant:true,createdAt:{seconds:10}},
      {id:'3',title:'이전 공지',createdAt:{seconds:20}}
    ]);
    const titles = id => [...document.querySelectorAll('#'+id+' .home-notice-title-text')].map(node => node.textContent);
    return {emptyHidden, visible:!section.hidden, main:titles('notice-list-container'), more:titles('notice-more-list'), moreVisible:!document.getElementById('home-notice-more').hidden};
  });
  expect(result).toEqual({emptyHidden:true, visible:true, main:['중요 공지','최근 공지'], more:['이전 공지'], moreVisible:true});
});

test('quote pages remove studio links and email receipt controls',async({page})=>{
  for(const path of ['/quote-book.html','/quote-print.html']){
    await page.goto(path,{waitUntil:'domcontentloaded'});
    const card=page.locator('[data-quote-file-card]');
    await expect(card.locator('.quote-file-picker')).toBeVisible();
    await expect(card.locator('a[href="cover-studio.html"],a[href="layout-studio.html"],[data-email-copy],#email-file-status')).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  }
});

test('quote attachment design is shared and redundant visible estimate warning is removed', async ({page}) => {
  for (const [path,input,list] of [['/quote-book.html','#quote-attachments','#attachments-list'],['/quote-print.html','#attachments','#print-attachments-list']]) {
    await page.goto(path,{waitUntil:'domcontentloaded'});
    const card=page.locator('[data-quote-file-card]');
    await expect(card.getByRole('heading',{name:'인쇄 파일 첨부'})).toBeVisible();
    await expect(card.locator('.quote-file-picker')).toBeVisible();
    await expect(page.locator('#estimate-request-guide')).toHaveClass('sr-only');
    await expect(page.getByText('견적 요청만으로는 작업이 진행되지 않습니다.',{exact:true})).toHaveCount(0);
    await card.locator(input).setInputFiles([{name:'표지.pdf',mimeType:'application/pdf',buffer:Buffer.from('test pdf')},{name:'내지.pdf',mimeType:'application/pdf',buffer:Buffer.from('test pdf')}]);
    await expect(card.locator(list)).toContainText('표지.pdf');
    await expect(card.locator(list)).toContainText('내지.pdf');
    await assertNoHorizontalOverflow(page);
  }
});
