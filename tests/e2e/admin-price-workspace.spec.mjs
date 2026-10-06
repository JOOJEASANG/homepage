import { test, expect } from '@playwright/test';

// Run the real editors against an in-memory backend; never write live prices.
async function fixture(page, role = 'admin') {
  await page.addInitScript(() => {
    localStorage.setItem('userRole', 'admin');
    window.Sortable = class { constructor() {} };
  });
  await page.route('**/assets/js/maintenance-check.js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/assets/js/header.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'export function initHeader() {}' }));
  await page.route('**/assets/js/session.js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/assets/js/pages/admin.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    import { initAdminWorkspaceNavigation } from './admin/price-workspace.js';
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('auth-check-overlay')?.remove();
    initAdminWorkspaceNavigation();
  ` }));
  await page.route('**/assets/js/firebase.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const app = {}, auth = {}, db = {}, storage = {}, browserLocalPersistence = {};
    export const setPersistence = async () => {};
    export const doc = (_, ...parts) => parts.join('/');
    export const getDoc = async path => ({
      exists: () => path.startsWith('users/'),
      data: () => path.startsWith('users/') ? { role: ${JSON.stringify(role)} } : {}
    });
    export const onAuthStateChanged = (_, callback) => {
      queueMicrotask(() => callback({ uid: 'fixture-user' }));
      return () => {};
    };
    export const setDoc = async (path, data, options) => {
      (window.__fixtureWrites ||= []).push({ path, data, options });
    };
    export const ref = () => ({}), uploadBytes = async () => ({}), getDownloadURL = async () => '';
  ` }));
  page.on('dialog', dialog => dialog.accept());
}

async function choose(page, id) {
  if ((page.viewportSize()?.width || 0) < 1280) {
    await page.locator('#mobileMenuOpenBtn').click();
    await page.locator(`.mobile-menu-item[data-click="#${id}"]`).click();
    await expect(page.locator('#mobileMenuSheet')).toHaveAttribute('aria-hidden', 'true');
  } else await page.locator('#' + id).click();
}

test('price menus use the workspace and preserve editable forms and save handlers', async ({ page }) => {
  await fixture(page);
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#book-price-frame')).not.toHaveAttribute('src', /./);
  await expect(page.locator('#print-price-frame')).not.toHaveAttribute('src', /./);
  await choose(page, 'book-price-management-btn');
  await expect(page.locator('#book-price-management-content')).toBeVisible();
  await expect(page.locator('#reception-management-content')).toBeHidden();
  expect(await page.locator('#iframeModal').count()).toBe(0);
  const book = page.frameLocator('#book-price-frame');
  await expect(book.locator('html')).toHaveAttribute('data-admin-embedded', '1');
  await expect(book.locator('.price-input').first()).toBeVisible();
  await book.locator('.price-input').first().fill('12345');
  const frame = page.frames().find(f => f.url().includes('quote-book-price.html'));
  await frame.evaluate(() => { window.__draftMarker = 'retain-me'; });

  await choose(page, 'price-management-btn');
  await expect(page.locator('#print-price-management-content')).toBeVisible();
  await expect(page.locator('#book-price-management-content')).toBeHidden();
  const print = page.frameLocator('#print-price-frame');
  await expect(print.locator('html')).toHaveAttribute('data-admin-embedded', '1');
  const printInput = print.locator('#snowBaseWrap input[type="number"]').last();
  await expect(printInput).toBeVisible();
  await printInput.fill('23456');
  await choose(page, 'book-price-management-btn');
  await expect(book.locator('.price-input').first()).toHaveValue('12345');
  expect(await frame.evaluate(() => window.__draftMarker)).toBe('retain-me');
  await book.locator('#saveUnitPriceBtn').click();
  await expect.poll(() => frame.evaluate(() => window.__fixtureWrites?.length || 0)).toBe(1);
  const bookWrite = await frame.evaluate(() => window.__fixtureWrites[0]);
  expect(bookWrite.path).toBe('settings/unitPriceConfig');
  expect(JSON.stringify(bookWrite.data.book)).toContain('12345');

  await choose(page, 'price-management-btn');
  await expect(printInput).toHaveValue('23456');
  await print.locator('#saveBtn').click();
  const printFrame = page.frames().find(f => f.url().includes('quote-print-price.html'));
  await expect.poll(() => printFrame.evaluate(() => window.__fixtureWrites?.length || 0)).toBe(1);
  const printWrite = await printFrame.evaluate(() => window.__fixtureWrites[0]);
  expect(printWrite.path).toBe('settings/unitPriceConfig');
  expect(JSON.stringify(printWrite.data.digital_print)).toContain('23456');
  expect(await printFrame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(3);
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(3);
  if ((page.viewportSize()?.width || 0) >= 1280) {
    const sidebar = await page.locator('#top-nav-bar').boundingBox();
    const editor = await page.locator('#print-price-frame').boundingBox();
    expect(editor.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
  }
  await page.locator('.nav-item[data-tab="reception-management"]').first().evaluate(button => button.click());
  await expect(page.locator('#reception-management-content')).toBeVisible();
  await expect(page.locator('#print-price-management-content')).toBeHidden();
});

test('embedded book editor keeps its existing administrator permission check', async ({ page }) => {
  await fixture(page, 'member');
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await choose(page, 'book-price-management-btn');
  const book = page.frameLocator('#book-price-frame');
  await expect(book.locator('#page-content')).toContainText('접근이 거부되었습니다');
  await expect(book.locator('#saveUnitPriceBtn')).toHaveCount(0);
});
