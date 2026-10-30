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
      await import('/assets/js/wire-cover-patch.js');
      document.getElementById('priceBreakdown').dataset.quoteTotal = '32500';
    }
    if (kind === 'admin') {
      document.getElementById('quote-list-body').innerHTML = '<tr class="quote-row-clickable" data-quote-id="fixture-order" tabindex="0"><td>2026.10.02</td><td>Q20261002-123456789</td><td><div><span>책자</span><b>모바일 자료집 주문 테스트</b></div></td><td><div class="customer-info-row"><span class="customer-name">테스트 고객</span><span class="customer-contact-group"><span class="customer-contact-separator">|</span><span class="customer-contact">010-1234-5678</span><span class="mobile-contact-actions"><a class="mobile-contact-action mobile-contact-action-call" href="tel:01012345678" data-contact-action="call" title="전화 걸기">통화</a><a class="mobile-contact-action mobile-contact-action-message" href="sms:01012345678" data-contact-action="message" title="문자 보내기">문자</a></span></span></div></td><td>32,500원</td><td><select class="status-select"><option>접수완료</option><option>작업중</option></select></td><td><div><button title="견적수정">수정</button></div></td></tr>';
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
          await expect(page.locator('.view-details-btn')).toHaveCount(0);
          await expect(page.locator('.quote-row-clickable')).toHaveCSS('cursor', 'pointer');
          await expect(page.locator('#quote-list-body td').first()).toHaveCSS('font-size', '17px');
          await expect(page.locator('.customer-name')).toHaveCSS('font-size', '14px');
          await expect(page.locator('.customer-contact')).toHaveCSS('font-size', '14px');
          await expect(page.locator('.mobile-contact-action-call')).toHaveCSS('font-size', '11px');
          const contactLayout = await page.locator('.customer-contact-group').evaluate(group => {
            const row = group.closest('.customer-info-row').getBoundingClientRect();
            const name = group.closest('.customer-info-row').querySelector('.customer-name').getBoundingClientRect();
            const contact = group.querySelector('.customer-contact').getBoundingClientRect();
            const call = group.querySelector('.mobile-contact-action-call').getBoundingClientRect();
            const message = group.querySelector('.mobile-contact-action-message').getBoundingClientRect();
            return { nameRight: name.right, contactLeft: contact.left, contactRight: contact.right,
              nameCenter: (name.top + name.bottom) / 2, contactCenter: (contact.top + contact.bottom) / 2,
              callCenter: (call.top + call.bottom) / 2, callLeft: call.left, callRight: call.right,
              messageLeft: message.left, messageRight: message.right, rowRight: row.right };
          });
          expect(contactLayout.contactLeft).toBeGreaterThanOrEqual(contactLayout.nameRight);
          expect(contactLayout.callLeft).toBeGreaterThanOrEqual(contactLayout.contactRight);
          expect(contactLayout.messageLeft).toBeGreaterThanOrEqual(contactLayout.callRight);
          expect(contactLayout.messageRight).toBeLessThanOrEqual(contactLayout.rowRight + 1);
          expect(Math.abs(contactLayout.nameCenter - contactLayout.callCenter)).toBeLessThan(8);
          expect(Math.abs(contactLayout.contactCenter - contactLayout.callCenter)).toBeLessThan(8);
          await expect(page.locator('.quote-attachment-download')).toBeVisible();
          await expect(page.locator('.quote-attachment-download')).toHaveCSS('min-height', '46px');
          await expect(page.locator('.quote-attachment-download')).toHaveAttribute('target', '_blank');
        }
        if (url === 'admin.html' && width < 1280) {
          await expect(page.locator('.mobile-contact-action-call')).toBeVisible();
          await expect(page.locator('.mobile-contact-action-call')).toHaveAttribute('href', 'tel:01012345678');
          await expect(page.locator('.mobile-contact-action-call')).toHaveAttribute('data-contact-action', 'call');
          await expect(page.locator('.mobile-contact-action-message')).toBeVisible();
          await expect(page.locator('.mobile-contact-action-message')).toHaveAttribute('href', 'sms:01012345678');
          await expect(page.locator('.mobile-contact-action-message')).toHaveAttribute('data-contact-action', 'message');
        }
        if (url === 'admin.html' && width >= 1280) {
          await expect(page.locator('.mobile-contact-actions')).toBeHidden();
        }
        if (url === 'admin.html' && width >= 1280) {
          await expect(page.locator('#top-nav-bar > .nav-btn').first()).toHaveCSS('font-size', '14px');
          await expect(page.locator('#top-nav-bar .nav-group > .nav-btn').first()).toHaveCSS('font-size', '13px');
          await expect(page.locator('#top-nav-bar .dropdown-item').first()).toHaveCSS('font-size', '14px');
        }
        if (url.startsWith('quote-')) {
          if (width < 1024) await expect(page.locator('.mobile-order-bar')).toBeVisible();
          else await expect(page.locator('.mobile-order-bar')).toBeHidden();
        }
        if (url === 'quote-book.html') {
          await expect(page.locator('.order-step-nav button').first()).toHaveText('01 기본 정보');
          await expect(page.locator('.order-step-nav button').first()).toHaveAttribute('aria-current', 'step');
          await expect(page.locator('.order-step-nav button').nth(1)).toHaveText('02 제본방식');
          await expect(page.locator('.quote-item > .order-stage').first()).toHaveAttribute('data-order-stage', 'basics');
          await expect(page.locator('.quote-item > .order-stage').nth(1)).toHaveAttribute('data-order-stage', 'binding');
          await expect(page.locator('.quote-item > .order-stage').first().locator('.step-number')).toHaveText('01');
          await expect(page.locator('.quote-item > .order-stage').nth(1).locator('.step-number')).toHaveText('02');
          const basics = page.locator('.quote-item > [data-order-stage="basics"]').first();
          await expect(basics.getByText('품명', { exact: true })).toBeVisible();
          await expect(basics.getByText('주문 수량 (부)', { exact: true })).toBeVisible();
          await expect(basics.locator('.orderName')).toBeVisible();
          await expect(basics.locator('.quantity')).toBeVisible();
          const inputHeights = await basics.locator('input').evaluateAll(inputs => inputs.map(input => input.getBoundingClientRect().height));
          expect(Math.abs(inputHeights[0] - inputHeights[1])).toBeLessThan(0.5);
          if (width >= 768) {
            const fieldWidths = await basics.locator('.bg-slate-50 > div').evaluateAll(fields => fields.map(field => field.getBoundingClientRect().width));
            expect(fieldWidths[0] / fieldWidths[1]).toBeGreaterThan(3.9);
            expect(fieldWidths[0] / fieldWidths[1]).toBeLessThan(4.1);
          } else {
            const fieldPositions = await basics.locator('.bg-slate-50 > div').evaluateAll(fields => fields.map(field => field.getBoundingClientRect().top));
            expect(fieldPositions[1]).toBeGreaterThan(fieldPositions[0]);
          }
          await expect(page.locator('.quote-item > [data-order-stage="binding"] .quantity')).toHaveCount(0);
          await expect(page.locator('.quote-item > [data-order-stage="binding"] label', { hasText: '제본 방식' })).toHaveCount(0);
        }
      }
    });
  }
  test('admin customer call and SMS buttons are restored when actual row has only phone text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.getElementById('main-content')?.classList.remove('hidden');
      document.getElementById('auth-check-overlay')?.remove();
      document.getElementById('quote-list-body').innerHTML =
        '<tr class="quote-row-clickable" data-quote-id="phone-only"><td>2026.10.19</td><td>Q20261019</td><td>인쇄 주문</td><td><div class="customer-info-row"><span class="customer-name">테스트 고객</span><span class="customer-contact-group"><span class="customer-contact">010-5652-0393</span></span></div></td><td>7,000원</td><td>접수완료</td><td></td></tr>';
    });
    const call = page.locator('#quote-list-body .mobile-contact-action-call');
    const message = page.locator('#quote-list-body .mobile-contact-action-message');
    await expect(call).toBeVisible();
    await expect(message).toBeVisible();
    await expect(call).toHaveAttribute('href', 'tel:01056520393');
    await expect(message).toHaveAttribute('href', 'sms:01056520393');
    await expect(call).toHaveCSS('min-height', '36px');
    await expect(message).toHaveCSS('min-height', '36px');
  });

  test('admin contact links appear for legacy customer cells and survive list refresh', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
    const rowMarkup = '<tr class="quote-row-clickable" data-quote-id="legacy-order">' +
      '<td>2026.10.19</td><td>Q20261019</td><td>인쇄 주문</td>' +
      '<td><div><strong>테스트 고객</strong><div>010-5555-1234</div></div></td>' +
      '<td>7,000원</td><td>접수완료</td><td></td></tr>';
    await page.evaluate(markup => {
      document.getElementById('main-content')?.classList.remove('hidden');
      document.getElementById('auth-check-overlay')?.remove();
      document.getElementById('quote-list-body').innerHTML = markup;
    }, rowMarkup);
    const call = page.locator('#quote-list-body .mobile-contact-action-call');
    const sms = page.locator('#quote-list-body .mobile-contact-action-message');
    await expect(call).toBeVisible();
    await expect(sms).toBeVisible();
    await expect(call).toHaveAttribute('href', 'tel:01055551234');
    await expect(sms).toHaveAttribute('href', 'sms:01055551234');
    await page.evaluate(markup => document.getElementById('quote-list-body').innerHTML = markup, rowMarkup);
    await expect(call).toBeVisible();
    await expect(sms).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(call).toBeHidden();
    await expect(sms).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(call).toBeVisible();
    await expect(sms).toBeVisible();
  });

  test('wire covers allow front and back simplex or duplex with independent prices', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/quote-book.html', { waitUntil: 'domcontentloaded' });
    await exposeFixture(page, 'book');
    await page.evaluate(() => {
      const item = document.querySelector('.quote-item');
      item.querySelector('.bindingType').value = 'wire';
      item.querySelector('.coverPrintType').value = 'color_simplex';
      window.__wireQuoteRecalcs = 0;
      item.querySelector('.quantity').addEventListener('input', () => { window.__wireQuoteRecalcs++; });
    });
    await page.locator('.binding-options [data-value="wire"]').first().click();
    await expect(page.locator('.wire-cover-print-box')).toBeVisible();
    const front = page.locator('.wireCoverFront');
    const back = page.locator('.wireCoverBack');
    const frontMode = page.locator('.wireCoverFrontMode');
    const backMode = page.locator('.wireCoverBackMode');
    await front.check();
    await back.uncheck();

    const calculateVisibleWirePrice = () => page.evaluate(async () => {
      const { getWireCoverCost, getWireCoverPrintImpressions } =
        await import('/assets/js/pages/quote-book/wire-calculator.js');
      const item = document.querySelector('.quote-item');
      return getWireCoverCost(1000, getWireCoverPrintImpressions({
        frontChecked: item.querySelector('.wireCoverFront').checked,
        backChecked: item.querySelector('.wireCoverBack').checked,
        frontMode: item.querySelector('.wireCoverFrontMode').value,
        backMode: item.querySelector('.wireCoverBackMode').value,
        coverPrintType: item.querySelector('.coverPrintType').value
      }));
    });

    expect(await calculateVisibleWirePrice()).toBe(500);
    await frontMode.selectOption('duplex');
    expect(await calculateVisibleWirePrice()).toBe(1000);
    await back.check();
    expect(await calculateVisibleWirePrice()).toBe(1500);
    await backMode.selectOption('duplex');
    expect(await calculateVisibleWirePrice()).toBe(2000);
    await frontMode.selectOption('simplex');
    await backMode.selectOption('simplex');
    expect(await calculateVisibleWirePrice()).toBe(1000);
    await front.uncheck();
    await back.uncheck();
    expect(await calculateVisibleWirePrice()).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__wireQuoteRecalcs)).toBeGreaterThan(0);
  });


  for (const width of [390, 1440]) {
    test(`digital output reset restores all fields and removes stale draft at ${width}px even without the page module`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/quote-print.html', { waitUntil: 'domcontentloaded' });
      await exposeFixture(page, null);
      await page.evaluate(() => {
        const value = (id, x) => { document.getElementById(id).value = x; };
        value('orderName', '기존 작성 중인 견적');
        value('quantity', '275');
        value('printSides', '2');
        value('paperSize', 'CUSTOM');
        value('customW', '280');
        value('customH', '400');
        value('paperType', 'arte');
        document.getElementById('oshiEnabled').checked = true;
        document.getElementById('fullBackgroundEnabled').checked = true;
        document.querySelector('input[name="oshiLines"][value="2"]').checked = true;
        document.getElementById('customSizeWrap').classList.remove('hidden');
        document.getElementById('oshiOptions').classList.remove('hidden');
        document.getElementById('breakdown').textContent = '이전 견적 금액';
        localStorage.setItem('temp_quote_print', '{"orderName":"기존 작성 중인 견적"}');
        localStorage.setItem('pending_member_submit_print', '{"quantity":"275"}');
        localStorage.setItem('pendingRequestTypePrint', 'estimate');
      });
      await page.locator('#resetFormBtn').click();
      await expect(page.locator('#orderName')).toHaveValue('');
      await expect(page.locator('#quantity')).toHaveValue('100');
      await expect(page.locator('#printSides')).toHaveValue('1');
      await expect(page.locator('#paperSize')).toHaveValue('A4');
      await expect(page.locator('#paperType')).toHaveValue('snow');
      await expect(page.locator('#customW')).toHaveValue('');
      await expect(page.locator('#customH')).toHaveValue('');
      await expect(page.locator('#oshiEnabled')).not.toBeChecked();
      await expect(page.locator('#fullBackgroundEnabled')).not.toBeChecked();
      await expect(page.locator('input[name="oshiLines"][value="1"]')).toBeChecked();
      await expect(page.locator('#customSizeWrap')).toBeHidden();
      await expect(page.locator('#oshiOptions')).toBeHidden();
      await expect(page.locator('#breakdown')).not.toContainText('이전 견적 금액');
      expect(await page.evaluate(() => [
        'temp_quote_print', 'pending_member_submit_print', 'pendingRequestTypePrint'
      ].map(key => localStorage.getItem(key)))).toEqual([null, null, null]);
    });
  }

  for (const width of [390, 1440]) {
    test(`estimate completed layer displays calculated total and converts only when confirmed at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 880 });
      await page.goto('/quote-book.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        const { showEstimateCompletedLayer } = await import('/assets/js/pages/shared/estimate-quick-order.js');
        window.__convertedEstimates = 0;
        showEstimateCompletedLayer({
          total: 30000, ready: true, mypageUrl: 'mypage.html',
          onConvert: async () => { window.__convertedEstimates++; },
        });
      });
      const layer = page.locator('#estimate-completed-layer');
      await expect(layer).toBeVisible();
      await expect(layer).toContainText('30,000원');
      await expect(layer).toContainText('아직 주문은 접수되지 않았습니다.');
      expect(await page.evaluate(() => window.__convertedEstimates)).toBe(0);
      await layer.locator('#estimate-completed-order').click();
      await expect(layer).toContainText('주문 접수를 완료했습니다');
      await expect(layer.locator('#estimate-completed-order')).toBeHidden();
      expect(await page.evaluate(() => window.__convertedEstimates)).toBe(1);

      await page.evaluate(async () => {
        const { showEstimateCompletedLayer } = await import('/assets/js/pages/shared/estimate-quick-order.js');
        showEstimateCompletedLayer({ total: 0, ready: false, mypageUrl: 'mypage.html' });
      });
      await expect(layer).toContainText('관리자 확인 필요');
      await expect(layer.locator('#estimate-completed-order')).toBeHidden();
      await expect(layer.locator('#estimate-completed-mypage')).toBeVisible();
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
        const quoteOnly = document.getElementById('quoteOnlyBtn');
        quoteOnly.addEventListener('click',event => { event.preventDefault(); window.__fixtureEstimateSubmits = (window.__fixtureEstimateSubmits || 0) + 1; });
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
      await expect(page.locator('.mobile-quote-only')).toBeVisible();
      await page.locator('.mobile-quote-only').click();
      expect(await page.evaluate(() => window.__fixtureEstimateSubmits)).toBe(1);
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
