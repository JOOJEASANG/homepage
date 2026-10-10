import { test, expect } from '@playwright/test';

// Isolate presentation from live accounts and customer data. No Firebase writes occur.
async function isolateApp(page) {
  await page.route('**/assets/js/maintenance-check.js*', route => route.fulfill({ body: '' }));
  await page.route('**/assets/js/pages/*.js*', route => route.fulfill({ body: '' }));
  await page.route('**/assets/js/firebase.js*', route => route.abort());
}
async function overflow(page) {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(3);
}
async function exposeFixture(page, kind) {
  await page.evaluate(async kind => {
    const main = document.getElementById('main-content');
    main?.classList.remove('hidden');
    document.getElementById('auth-check-overlay')?.remove();
    document.getElementById('loading-overlay')?.remove();
    if (kind === 'book') {
      const template = await import('/assets/js/pages/quote-book/quote-item-template.js');
      const item = document.createElement('div');
      item.className = 'quote-item';
      item.innerHTML = template.renderQuoteItemTemplate({ quoteItemCounter: 1, designPrice: 10000, oshiPrice: 500 });
      item.querySelector('.inner-sections-container').innerHTML = template.renderInnerSectionTemplate({ sectionCount: 0 });
      document.getElementById('quote-items-container').append(item);
      document.getElementById('priceBreakdown').dataset.quoteTotal = '32500';
    }
    if (kind === 'admin') {
      document.getElementById('quote-list-body').innerHTML = '<tr><td>2026.10.02</td><td>Q20261002-123456789</td><td><div><span>책자</span><b>모바일 자료집 주문 테스트</b></div></td><td><div class="customer-info-row"><span class="customer-name">테스트 고객</span><span class="customer-contact-group"><span class="customer-contact-separator">|</span><span class="customer-contact">010-1234-5678</span><span class="mobile-contact-actions"><a class="mobile-contact-action mobile-contact-action-call" href="tel:01012345678">통화</a><a class="mobile-contact-action mobile-contact-action-message" href="sms:01012345678">문자</a></span></span></div></td><td>32,500원</td><td><select class="status-select"><option>접수완료</option><option>작업중</option></select></td><td><div><button class="view-details-btn" title="상세보기">보기</button><button title="견적수정">수정</button></div></td></tr>';
      const attachment = document.createElement('div');
      attachment.className = 'quote-attachment-item flex items-center justify-between';
      attachment.innerHTML = '<div class="quote-attachment-info">모바일첨부파일.pdf</div><div class="quote-attachment-actions"><a class="quote-attachment-download" href="https://example.com/file.pdf" data-force-download="1" download="모바일첨부파일.pdf" target="_blank" rel="noopener">다운로드</a><button class="quote-attachment-delete">삭제</button></div>';
      document.getElementById('reception-management-content')?.append(attachment);
    }
  }, kind);
}

test.describe('responsive renewal', () => {
  test.beforeEach(async ({ page }) => { await isolateApp(page); });
  for (const width of [360, 390, 768, 1024, 1440]) {
    test(`${width}px homepage, order and account layouts fit`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [url, fixture] of [['index.html',null],['quote-book.html','book'],['quote-print.html',null],['mypage.html',null],['admin.html','admin']]) {
        await page.goto('/' + url, { waitUntil: 'domcontentloaded' });
        await exposeFixture(page, fixture);
        await overflow(page);
        const duplicates = await page.evaluate(() => {
          const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
          return ids.filter((id,i) => ids.indexOf(id) !== i);
        });
        expect(duplicates).toEqual([]);
        if (url === 'admin.html' && width < 768) {
          await expect(page.locator('#quote-list-body tr').first()).toHaveCSS('display','grid');
          await page.locator('.status-select').selectOption({ label: '작업중' });
          await expect(page.locator('.status-select')).toHaveValue('작업중');
          await expect(page.locator('.view-details-btn')).toBeVisible();
          await expect(page.locator('.mobile-contact-action-call')).toBeVisible();
          await expect(page.locator('.mobile-contact-action-call')).toHaveAttribute('href', 'tel:01012345678');
          await expect(page.locator('.mobile-contact-action-message')).toBeVisible();
          await expect(page.locator('.mobile-contact-action-message')).toHaveAttribute('href', 'sms:01012345678');
          await expect(page.locator('.customer-name')).toHaveCSS('font-size', '16px');
          await expect(page.locator('.customer-contact')).toHaveCSS('font-size', '15px');
          const contactLayout = await page.locator('.customer-contact-group').evaluate(group => {
            const contact = group.querySelector('.customer-contact').getBoundingClientRect();
            const call = group.querySelector('.mobile-contact-action-call').getBoundingClientRect();
            const message = group.querySelector('.mobile-contact-action-message').getBoundingClientRect();
            return { contactRight: contact.right, callLeft: call.left, contactTop: contact.top, callTop: call.top, callRight: call.right, messageLeft: message.left };
          });
          expect(contactLayout.callLeft).toBeGreaterThanOrEqual(contactLayout.contactRight);
          expect(Math.abs(contactLayout.callTop - contactLayout.contactTop)).toBeLessThan(8);
          expect(contactLayout.messageLeft).toBeGreaterThanOrEqual(contactLayout.callRight);
          await expect(page.locator('.quote-attachment-download')).toBeVisible();
          await expect(page.locator('.quote-attachment-download')).toHaveCSS('min-height', '46px');
          await expect(page.locator('.quote-attachment-download')).toHaveAttribute('target', '_blank');
        }
        if (url === 'admin.html' && width >= 768) {
          await expect(page.locator('.mobile-contact-actions')).toBeHidden();
        }
        if (url.startsWith('quote-')) {
          if (width < 1024) await expect(page.locator('.mobile-order-bar')).toBeVisible();
          else await expect(page.locator('.mobile-order-bar')).toBeHidden();
        }
      }
    });
  }
  test('mobile quote summary uses existing amount and original submit handler', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [url,kind,button] of [['quote-book.html','book','submitQuoteBtn'],['quote-print.html',null,'submitBtn']]) {
      await page.goto('/' + url, { waitUntil: 'domcontentloaded' });
      await exposeFixture(page,kind);
      await page.evaluate(button => {
        const original = document.getElementById(button);
        original.addEventListener('click',event => { event.preventDefault(); window.__fixtureSubmits = (window.__fixtureSubmits || 0) + 1; });
        const amount = document.getElementById('totalPrice');
        if (amount) amount.textContent = '32,500원';
      },button);
      await expect(page.locator('.mobile-price strong')).toHaveText('32,500원');
      await page.locator('.mobile-price').click();
      await expect(page.locator('.order-summary-sheet')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.order-summary-sheet')).toBeHidden();
      await page.locator('.mobile-order-submit').click();
      expect(await page.evaluate(() => window.__fixtureSubmits)).toBe(1);
      await page.evaluate(button => { document.getElementById(button).disabled = true; },button);
      await expect(page.locator('.mobile-order-submit')).toBeDisabled();
      await page.evaluate(button => { document.getElementById(button).disabled = false; },button);
      await expect(page.locator('.mobile-order-submit')).toBeEnabled();
      await page.locator('.order-step-nav button').nth(1).click();
      await expect(page.locator('.order-step-nav button').nth(1)).toHaveAttribute('aria-current','step');
      await page.evaluate(button => { document.getElementById(button).hidden = true; },button);
      await expect(page.locator('.mobile-order-bar')).toBeHidden();
      await page.evaluate(button => { document.getElementById(button).hidden = false; },button);
      await expect(page.locator('.mobile-order-bar')).toBeVisible();
      await page.evaluate(button => {
        const banner = document.createElement('div');
        banner.id = 'admin-pricing-mode-banner';
        document.body.append(banner);
        document.getElementById(button).disabled = true;
      },button);
      await expect(page.locator('.mobile-order-bar')).toBeHidden();

    }
  });
  test('admin sidebar settings remain clickable and distinct from desktop orders', async ({ page }) => {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto('/admin.html', {waitUntil:'domcontentloaded'});
    await exposeFixture(page,'admin');
    await expect(page.locator('#book-price-management-btn')).toBeVisible();
    await expect(page.locator('#book-price-management-btn')).toHaveCSS('pointer-events','auto');
    const sidebar = await page.locator('#top-nav-bar').boundingBox();
    const main = await page.locator('#main-content > main').boundingBox();
    expect(main.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
  });
});
