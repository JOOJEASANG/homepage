import { test, expect } from '@playwright/test';

// Exercise the real admin and guide modules without touching customer or site data.
async function fixture(page, role = 'admin', realSession = true) {
  await page.addInitScript(() => {
    localStorage.setItem('userRole', 'admin');
    window.Sortable = class { destroy() {} };
  });
  const js = body => ({ contentType: 'application/javascript', body });
  await page.route('**/assets/js/maintenance-check.js*', route => route.fulfill(js('')));
  await page.route('**/assets/js/header.js*', route => route.fulfill(js('export function initHeader() {}')));
  if (!realSession) await page.route('**/assets/js/session.js*', route => route.fulfill(js('')));
  await page.route('**/sortable.esm.js', route => route.fulfill(js('export default class Sortable { destroy() {} }')));
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-*.js', route => route.fulfill(js(`
    export const app = {}, db = {}, storage = {}, browserLocalPersistence = {};
    export const auth = { currentUser: { uid: 'fixture-admin' } };
    export const setPersistence = async () => {};
    export const initializeApp = () => app, getAuth = () => auth;
    export const initializeAuth = () => { window.__fixtureAuthInitializations = (window.__fixtureAuthInitializations || 0) + 1; return auth; };
    export const indexedDBLocalPersistence = {}, browserSessionPersistence = {};
    export const getFirestore = () => db, getStorage = () => storage;
    export const signInAnonymously = async () => {}, signInWithEmailAndPassword = signInAnonymously;
    export const createUserWithEmailAndPassword = signInAnonymously, updateProfile = signInAnonymously;
    export const sendPasswordResetEmail = signInAnonymously, deleteUser = signInAnonymously;
    export const Timestamp = {}, runTransaction = async () => {};
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
    const selector = id.startsWith('cc-') ? `#m-${id}` : `.mobile-menu-item[data-click="#${id}"]`;
    await page.locator(selector).click();
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
  await page.addScriptTag({ type: 'module', url: '/assets/js/admin-quote-navigation.js' });
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

test('maintenance, notice and image saves still work in the workspace', async ({ page }) => {
  await openAdmin(page);
  await choose(page, 'maintenance-mode-btn');
  await expect(page.locator('#maintenanceMessageInput')).toHaveValue('기존 안내문');
  expect(await writes(page, 'settings/site')).toEqual([]);
  expect(await writes(page, 'settings/homepageContent')).toEqual([]);
  await page.locator('#maintenanceMessageInput').fill('변경한 점검 안내문');
  await choose(page, 'homepage-management-btn');
  await page.locator('#notice-title').fill('테스트 공지사항');
  await page.locator('#notice-content-editor').fill('공지 본문');
  await choose(page, 'maintenance-mode-btn');
  await expect(page.locator('#maintenanceMessageInput')).toHaveValue('변경한 점검 안내문');
  await page.locator('#saveMaintenanceBtn').click();
  await expect.poll(async () => (await writes(page, 'settings/site')).length).toBe(1);
  expect((await writes(page, 'settings/site'))[0].data.maintenanceMessage).toBe('변경한 점검 안내문');
  expect((await writes(page, 'settings/homepageContent'))[0].data.maintenanceMode).toBe(false);
  await expect(page.locator('#maintenanceModal')).toBeVisible();
  await choose(page, 'homepage-management-btn');
  await expect(page.locator('#notice-title')).toHaveValue('테스트 공지사항');
  await page.locator('#save-notice-btn').click();
  await expect.poll(async () => (await writes(page, 'notices')).length).toBe(1);
  expect((await writes(page, 'notices'))[0].data.content).toContain('공지 본문');
  await choose(page, 'image-management-btn');
  await page.locator('#image-modal-tabs [data-tab="innerPaper-previews"]').click();
  await expect(page.locator('#innerPaper-previews-tab')).toBeVisible();
  await page.locator('#image-modal-tabs [data-tab="coverPaper-previews"]').click();
  const imageInput = page.locator('#coverPaper-previews-tab .image-upload-input').first();
  await imageInput.setInputFiles({ name: 'preview.png', mimeType: 'image/png', buffer: Buffer.from('fixture-image') });
  await expect.poll(async () => (await writes(page, 'settings/imagePreviews')).length).toBe(1);
  expect(JSON.stringify((await writes(page, 'settings/imagePreviews'))[0].data)).toContain('/favicon.ico');
});

test('guide shares the main admin document and preserves and saves its editor', async ({ page }) => {
  await openAdmin(page);
  await choose(page, 'work-guide-management-btn');
  const guide = page.locator('#work-guide-management-content');
  await expect(guide.locator('#workGuideModal')).toBeVisible();
  await expect(guide.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => window.__fixtureAuthInitializations)).toBe(1);
  await expect(guide.locator('#adminSidebarAction button')).toBeInViewport();
  await guide.locator('#adminSidebarAction button').click();
  await guide.locator('#editTitle').fill('새 작업 가이드');
  await guide.locator('#wg-content-editor').fill('가이드 작성 내용');
  await choose(page, 'image-management-btn');
  await choose(page, 'work-guide-management-btn');
  await expect(guide.locator('#editTitle')).toHaveValue('새 작업 가이드');
  await expect(page).toHaveURL(/admin\.html$/);
  expect(await guide.locator('#contentArea').evaluate(el => getComputedStyle(el).position)).toBe('static');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(3);
  await guide.locator('[onclick="window.saveGuide()"]').click();
  await expect.poll(async () => (await writes(page, 'work_guides')).length).toBe(1);
  const write = (await writes(page, 'work_guides'))[0];
  expect(write.data.title).toBe('새 작업 가이드');
  expect(write.data.content).toContain('가이드 작성 내용');
});

test('the public guide layer still opens and closes normally', async ({ page }) => {
  await fixture(page, 'admin', false);
  await page.goto('/work-guide.html?embed=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#workGuideModal')).toBeVisible();
  const close = (page.viewportSize()?.width || 0) < 768 ? '#closeGuideMobile' : '#closeGuideDesktop';
  await page.locator(close).click();
  await expect(page.locator('#workGuideModal')).toBeHidden();
});

test('guide retry and editing survive a sorting CDN failure without leaving admin', async ({ page }) => {
  await openAdmin(page);
  await page.evaluate(() => { window.Sortable = undefined; });
  await page.route('**/sortable.esm.js', route => route.abort());
  let attempts = 0;
  await page.route('**/work-guide.html', route => {
    if (++attempts === 1) return route.fulfill({ status: 503, body: 'Unavailable' });
    return route.continue();
  });
  await choose(page, 'work-guide-management-btn');
  const guide = page.locator('#work-guide-management-content');
  await expect(guide).toContainText('불러오지 못했습니다');
  await guide.getByRole('button', { name: '다시 불러오기' }).click();
  await guide.locator('#adminSidebarAction button').click();
  await guide.locator('#editTitle').fill('외부 정렬 스크립트 없이 작성');
  await guide.locator('#wg-content-editor').fill('정상 저장');
  await guide.locator('[onclick="window.saveGuide()"]').click();
  await expect.poll(async () => (await writes(page, 'work_guides')).length).toBe(1);
  await expect(page).toHaveURL(/admin\.html$/);
});


test('customer center editors stay in the workspace and preserve and save all three forms', async ({ page }) => {
  await openAdmin(page);
  await page.addScriptTag({ type: 'module', url: '/assets/js/customer-center-admin-menu.js' });
  await expect(page.locator('#cc-pay-btn')).toHaveCount(1);
  await choose(page, 'cc-faq-btn');
  const faq = page.frameLocator('#faq-management-frame');
  await expect(faq.locator('#faqForm')).toBeVisible();
  await faq.locator('#question').fill('출력 파일 접수 방법');
  await faq.locator('#answer').fill('PDF 파일을 접수해 주세요.');
  await choose(page, 'cc-ai-btn');
  const ai = page.frameLocator('#ai-management-frame');
  await expect(ai.locator('#aiForm')).toBeVisible();
  await ai.locator('#widgetTitle').fill('변경한 상담 제목');
  await choose(page, 'cc-pay-btn');
  const payment = page.frameLocator('#payment-management-frame');
  await expect(payment.locator('#form')).toBeVisible();
  await payment.locator('#bankName').fill('테스트 은행');
  await payment.locator('#saveBtn').click();
  await expect(payment.locator('#status')).toContainText('저장 완료');
  const childWrites = (frame, path) => frame.locator('body').evaluate((_, path) =>
    (window.__fixtureWrites || []).filter(w => w.path === path), path);
  expect((await childWrites(payment, 'settings/paymentGuide'))[0].data.bankName).toBe('테스트 은행');
  await choose(page, 'cc-ai-btn');
  await expect(ai.locator('#widgetTitle')).toHaveValue('변경한 상담 제목');
  await ai.locator('#saveBtn').click();
  await expect(ai.locator('#status')).toContainText('저장 완료');
  expect((await childWrites(ai, 'settings/aiChat'))[0].data.widgetTitle).toBe('변경한 상담 제목');
  expect((await childWrites(ai, 'settings/aiChatPublic'))[0].data.widgetTitle).toBe('변경한 상담 제목');
  await choose(page, 'cc-faq-btn');
  await expect(faq.locator('#question')).toHaveValue('출력 파일 접수 방법');
  await faq.locator('#saveBtn').click();
  await expect(faq.locator('#status')).toContainText('등록 완료');
  expect((await childWrites(faq, 'faq'))[0].data.question).toBe('출력 파일 접수 방법');
  for (const frame of [faq, ai, payment]) {
    await expect(frame.locator('header a[href="admin.html"]')).toBeHidden();
    if (await frame.locator('header a[href="qna.html"]').count())
      await expect(frame.locator('header a[href="qna.html"]')).toHaveAttribute('target', '_blank');
    expect(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(3);
  }
  await expect(ai.locator('header a[href="index.html"]')).toHaveAttribute('target', '_blank');
  await expect(page).toHaveURL(/admin\.html$/);
  await expect(page.locator('#main-content')).toBeVisible();
});
