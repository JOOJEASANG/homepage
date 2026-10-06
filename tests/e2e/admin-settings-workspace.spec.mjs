import { test, expect } from '@playwright/test';

// Exercise the real admin and guide modules without touching customer or site data.
async function fixture(page, role = 'admin') {
  await page.addInitScript(() => {
    localStorage.setItem('userRole', 'admin');
    window.Sortable = class { destroy() {} };
  });
  const js = body => ({ contentType: 'application/javascript', body });
  await page.route('**/assets/js/maintenance-check.js*', route => route.fulfill(js('')));
  await page.route('**/assets/js/header.js*', route => route.fulfill(js('export function initHeader() {}')));
  await page.route('**/assets/js/session.js*', route => route.fulfill(js('')));
  await page.route('**/sortable.esm.js', route => route.fulfill(js('export default class Sortable { destroy() {} }')));
  await page.route('**/assets/js/firebase.js*', route => route.fulfill(js(`
    export const app = {}, db = {}, storage = {}, browserLocalPersistence = {};
    export const auth = { currentUser: { uid: 'fixture-admin' } };
    export const setPersistence = async () => {};
    export const getApps = () => [app], getApp = () => app;
    export const doc = (_, ...parts) => parts.join('/'), collection = doc;
    export const query = path => path;
    export const orderBy = () => ({}), limit = orderBy, where = orderBy;
    export const serverTimestamp = () => 'fixture-time', deleteField = () => 'fixture-delete';
    const docs = [];
    const snapshot = { docs, size: 0, empty: true, forEach: fn => docs.forEach(fn), docChanges: () => [] };
    export const getDocs = async () => snapshot;
    export const onSnapshot = (_, callback) => { queueMicrotask(() => callback(snapshot)); return () => {}; };
    export const getDoc = async path => {
      const data = path.startsWith('users/') ? { role: ${JSON.stringify(role)} }
        : path === 'settings/site' ? { maintenance: false, maintenanceMessage: '기존 안내문' } : null;
      return { exists: () => data !== null, data: () => data || {} };
    };
    export const onAuthStateChanged = (_, callback) => {
      queueMicrotask(() => callback(auth.currentUser)); return () => {};
    };
    function write(path, data, options) { (window.__fixtureWrites ||= []).push({ path, data, options }); }
    export const setDoc = async (path, data, options) => write(path, data, options);
    export const updateDoc = async (path, data) => write(path, data);
    export const addDoc = async (path, data) => { write(path, data); return { id: 'fixture-created' }; };
    export const deleteDoc = async () => {}, signOut = async () => {};
    export const writeBatch = () => ({ update() {}, commit: async () => {} });
    export const ref = (_, fullPath) => ({ fullPath });
    export const uploadBytesResumable = ref => ({ snapshot: { ref }, on: (_, progress, fail, done) => queueMicrotask(done) });
    export const uploadBytes = async () => ({}), getDownloadURL = async () => '/favicon.ico';
    export const listAll = async () => ({ items: [] }), deleteObject = async () => {};
  `)));
}

async function choose(page, id) {
  if ((page.viewportSize()?.width || 0) < 1280) {
    await page.locator('#mobileMenuOpenBtn').click();
    await page.locator(`.mobile-menu-item[data-click="#${id}"]`).click();
    await expect(page.locator('#mobileMenuSheet')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#mobileMenuOverlay')).toBeHidden();
  } else await page.locator('#' + id).click();
}

async function openAdmin(page) {
  await fixture(page);
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-content')).toBeVisible();
}

async function writes(page, path) {
  return page.evaluate(path => (window.__fixtureWrites || []).filter(w => w.path === path), path);
}

test('all former menu dialogs use the workspace and supplier information is last', async ({ page }) => {
  await openAdmin(page);
  await page.addScriptTag({ type: 'module', url: '/assets/js/customer-center-admin-menu.js' });
  await expect(page.locator('#cc-pay-btn')).toHaveCount(1);
  expect(await page.locator('#top-nav-bar button').last().getAttribute('id')).toBe('company-info-btn');
  expect(await page.locator('#mobileMenuSheet .mobile-menu-item').last().getAttribute('data-click')).toBe('#company-info-btn');
  for (const [button, panel] of [
    ['image-management-btn', 'imageManagementModal'],
    ['homepage-management-btn', 'homepageManagementModal'],
    ['maintenance-mode-btn', 'maintenanceModal'],
    ['work-guide-management-btn', 'work-guide-management-content'],
  ]) {
    await choose(page, button);
    await expect(page.locator('#' + panel)).toBeVisible();
    await expect(page.locator('#reception-management-content')).toBeHidden();
    expect(await page.locator('#' + panel).evaluate(el => el.closest('#main-content > main') !== null)).toBe(true);
    expect(await page.locator('#' + panel).evaluate(el => getComputedStyle(el).position)).not.toBe('fixed');
    if ((page.viewportSize()?.width || 0) >= 1280) {
      const sidebar = await page.locator('#top-nav-bar').boundingBox();
      const box = await page.locator('#' + panel).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(3);
  }
  await choose(page, 'company-info-btn');
  await expect(page.locator('#companyInfoModal')).toBeVisible();
  await page.locator('#closeCompanyInfoModalBtn').click();
  await expect(page.locator('#companyInfoModal')).toBeHidden();
});

test('maintenance, notice, portfolio and image saves still work in the workspace', async ({ page }) => {
  await openAdmin(page);
  await choose(page, 'maintenance-mode-btn');
  await expect(page.locator('#maintenanceMessageInput')).toHaveValue('기존 안내문');
  await page.locator('#maintenanceMessageInput').fill('변경한 점검 안내문');
  await choose(page, 'homepage-management-btn');
  await page.locator('#notice-title').fill('테스트 공지사항');
  await page.locator('#notice-content-editor').fill('공지 본문');
  await choose(page, 'maintenance-mode-btn');
  await expect(page.locator('#maintenanceMessageInput')).toHaveValue('변경한 점검 안내문');
  await page.locator('#saveMaintenanceBtn').click();
  await expect.poll(async () => (await writes(page, 'settings/site')).length).toBe(1);
  expect((await writes(page, 'settings/site'))[0].data.maintenanceMessage).toBe('변경한 점검 안내문');
  await expect(page.locator('#maintenanceModal')).toBeVisible();
  await choose(page, 'homepage-management-btn');
  await expect(page.locator('#notice-title')).toHaveValue('테스트 공지사항');
  await page.locator('#save-notice-btn').click();
  await expect.poll(async () => (await writes(page, 'notices')).length).toBe(1);
  expect((await writes(page, 'notices'))[0].data.content).toContain('공지 본문');
  await page.locator('#homepage-sub-tab-nav [data-tab="portfolio-content-panel"]').click();
  await page.locator('#add-portfolio-item').click();
  await page.locator('.edit-portfolio-btn').click();
  await page.locator('.portfolio-title').fill('테스트 포트폴리오');
  await page.locator('.portfolio-description').fill('프로젝트 설명');
  await page.locator('#save-portfolio-content').click();
  await expect.poll(async () => (await writes(page, 'settings/homepageContent')).length).toBe(1);
  expect((await writes(page, 'settings/homepageContent'))[0].data.portfolio[0].title).toBe('테스트 포트폴리오');
  await choose(page, 'image-management-btn');
  await page.locator('#image-modal-tabs [data-tab="innerPaper-previews"]').click();
  await expect(page.locator('#innerPaper-previews-tab')).toBeVisible();
  await page.locator('#image-modal-tabs [data-tab="coverPaper-previews"]').click();
  const imageInput = page.locator('#coverPaper-previews-tab .image-upload-input').first();
  await imageInput.setInputFiles({ name: 'preview.png', mimeType: 'image/png', buffer: Buffer.from('fixture-image') });
  await expect.poll(async () => (await writes(page, 'settings/imagePreviews')).length).toBe(1);
  expect(JSON.stringify((await writes(page, 'settings/imagePreviews'))[0].data)).toContain('/favicon.ico');
});

test('guide opens as a normal embedded page and preserves and saves its editor', async ({ page }) => {
  await openAdmin(page);
  await choose(page, 'work-guide-management-btn');
  const guide = page.frameLocator('#work-guide-frame');
  await expect(guide.locator('html')).toHaveAttribute('data-admin-embedded', '1');
  await expect(guide.locator('#workGuideModal')).toBeVisible();
  await expect(guide.locator('#adminSidebarAction button')).toBeInViewport();
  await guide.locator('#adminSidebarAction button').click();
  await guide.locator('#editTitle').fill('새 작업 가이드');
  await guide.locator('#wg-content-editor').fill('가이드 작성 내용');
  await choose(page, 'image-management-btn');
  await choose(page, 'work-guide-management-btn');
  await expect(guide.locator('#editTitle')).toHaveValue('새 작업 가이드');
  const frame = page.frames().find(f => f.url().includes('work-guide.html'));
  expect(await frame.evaluate(() => getComputedStyle(document.getElementById('contentArea')).position)).toBe('static');
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(3);
  await guide.locator('[onclick="window.saveGuide()"]').click();
  await expect.poll(() => frame.evaluate(() => window.__fixtureWrites?.length || 0)).toBe(1);
  const write = await frame.evaluate(() => window.__fixtureWrites[0]);
  expect(write.path).toBe('work_guides');
  expect(write.data.title).toBe('새 작업 가이드');
  expect(write.data.content).toContain('가이드 작성 내용');
});

test('the public guide layer still opens and closes normally', async ({ page }) => {
  await fixture(page);
  await page.goto('/work-guide.html?embed=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#workGuideModal')).toBeVisible();
  const close = (page.viewportSize()?.width || 0) < 768 ? '#closeGuideMobile' : '#closeGuideDesktop';
  await page.locator(close).click();
  await expect(page.locator('#workGuideModal')).toBeHidden();
});
