import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

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
    export const auth = { currentUser: ${role === null ? 'null' : "{ uid: 'fixture-admin', getIdToken: async () => 'fixture-token' }"} };
    export const setPersistence = async () => {};
    export const initializeApp = () => app, getAuth = () => auth;
    export const initializeAuth = () => { window.__fixtureAuthInitializations = (window.__fixtureAuthInitializations || 0) + 1; return auth; };
    export const indexedDBLocalPersistence = {}, browserSessionPersistence = {};
    export const getFirestore = () => db, getStorage = () => storage;
    export const signInAnonymously = async () => {
      if (window.__fixtureSignInDelay == null) return { user: auth.currentUser };
      window.__fixtureAnonymousSignIns = (window.__fixtureAnonymousSignIns || 0) + 1;
      await new Promise(resolve => setTimeout(resolve, window.__fixtureSignInDelay));
      auth.currentUser = { uid: 'fixture-guest', isAnonymous: true, getIdToken: async () => 'fixture-token' };
      (window.__fixtureAuthListeners || []).forEach(callback => queueMicrotask(() => callback(auth.currentUser)));
      return { user: auth.currentUser };
    }, signInWithEmailAndPassword = signInAnonymously;
    export const createUserWithEmailAndPassword = signInAnonymously, updateProfile = signInAnonymously;
    export const sendPasswordResetEmail = signInAnonymously, deleteUser = signInAnonymously;
    export const Timestamp = {};
    export const runTransaction = async (_, callback) => {
      const updates = [];
      const result = await callback({ get: getDoc, update: (path, data) => updates.push({ path, data }) });
      for (const update of updates) write(update.path, update.data);
      return result;
    };
    export const getApps = () => [app], getApp = () => app;
    export const doc = (_, ...parts) => parts.join('/'), collection = doc;
    export const query = (path, ...filters) => path === 'qna' ? { path, filters } : path;
    export const orderBy = () => ({}), limit = orderBy;
    export const where = (field, op, value) => ({ field, op, value });
    export const serverTimestamp = () => window.__fixtureNow || 'fixture-time', deleteField = () => 'fixture-delete';
    function qnaData(data) {
      const result = { ...data };
      for (const key of ['createdAt', 'answeredAt', 'answerReadAt']) if (typeof result[key] === 'number') {
        const value = result[key]; result[key] = { toMillis: () => value, toDate: () => new Date(value) };
      }
      return result;
    }
    const snapshotFor = source => {
      const path = typeof source === 'string' ? source : source.path;
      if (path.startsWith('qna/')) {
        const data = (window.__fixtureQna || []).find(item => item.id === path.slice(4));
        return { exists: () => !!data, data: () => qnaData(data) };
      }
      if (path.startsWith('settings/') || path.startsWith('users/')) {
        const data = path.startsWith('users/') ? { role: ${JSON.stringify(role)} } : path === 'settings/site' ? { maintenance: false } : null;
        return { exists: () => !!data, data: () => data || {} };
      }
      let items = path === 'quotes' ? (window.__fixtureQuotes || []) : path === 'qna' ? (window.__fixtureQna || []) : [];
      for (const filter of source.filters || []) if (filter.field) items = items.filter(item => item[filter.field] === filter.value);
      const docs = items.map(data => ({ id: data.id, data: () => path === 'qna' ? qnaData(data) : ({ ...data }) }));
      return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn), docChanges: () => docs.map(doc => ({ type: 'added', doc })) };
    };
    export const getDocs = async path => { (window.__fixtureQueries ||= []).push(path); if (window.__fixtureRejectNameQuery && path.filters?.some(filter => filter.field === 'name')) throw Object.assign(new Error('private query denied'), { code: 'permission-denied' }); return snapshotFor(path); };
    export const onSnapshot = (path, callback) => {
      const listener = () => callback(snapshotFor(path));
      listener.qna = path === 'qna' || path.path === 'qna' || (typeof path === 'string' && path.startsWith('qna/'));
      (window.__fixtureSnapshotListeners ||= []).push(listener);
      window.__fixtureEmitQna = () => window.__fixtureSnapshotListeners.filter(listener => listener.qna).forEach(listener => listener());
      queueMicrotask(listener);
      return () => { window.__fixtureSnapshotListeners = window.__fixtureSnapshotListeners.filter(item => item !== listener); };
    };
    export const getDoc = async path => {
      (window.__fixtureReads ||= []).push(path);
      if (path.startsWith('qna/')) return snapshotFor(path);
      const data = path.startsWith('users/') ? { role: ${JSON.stringify(role)} }
        : path === 'settings/site' ? { maintenance: false, maintenanceMessage: '기존 안내문', qnaApiV2: window.__fixtureSecureQna === true }
        : path === 'settings/print' ? { guideHtml: window.__fixtureGuideHtml || '' } : null;
      return { exists: () => data !== null, data: () => data || {} };
    };
    export const onAuthStateChanged = (_, callback) => {
      (window.__fixtureAuthListeners ||= []).push(callback);
      queueMicrotask(() => callback(auth.currentUser)); return () => {};
    };
    function write(path, data, options) {
      if (path.startsWith('qna/') && data.answerReadByCustomer === true && window.__fixtureRejectReceipts) throw new Error('fixture receipt permission denied');
      (window.__fixtureWrites ||= []).push({ path, data, options });
      if (path.startsWith('qna/')) {
        window.__fixtureQna = (window.__fixtureQna || []).map(item => item.id === path.slice(4) ? { ...item, ...data } : item);
        queueMicrotask(() => window.__fixtureEmitQna?.());
      }
    }
    export const setDoc = async (path, data, options) => write(path, data, options);
    export const updateDoc = async (path, data) => write(path, data);
    export const addDoc = async (path, data) => { write(path, data); return { id: 'fixture-created' }; };
    export const deleteDoc = async () => {}, signOut = async () => {};
    export const writeBatch = () => ({ update() {}, commit: async () => {} });
    export const ref = (_, fullPath) => ({ fullPath });
    export const uploadBytesResumable = (ref, file) => { (window.__fixtureUploads ||= []).push({ path: ref.fullPath, name: file.name, type: file.type }); return { snapshot: { ref }, on: (_, progress, fail, done) => queueMicrotask(done) }; };
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

const inquiryFixture = () => ({
  id: 'inquiry-fixture', name: '테스트 고객', pwHash: createHash('sha256').update('1234').digest('hex'),
  title: '출력 문의', body: '파일을 준비했습니다.', isSecret: true, ownerUid: 'fixture-admin',
  createdAt: 1000, answer: 'PDF로 보내주세요.', status: 'answered', answeredAt: 2000,
  answerReadByCustomer: false, answerReadAt: null,
});

async function prepareInquiry(page, { failReceipt = false, secure = false } = {}) {
  await fixture(page, 'user');
  await page.addInitScript(({ inquiry, failReceipt, secure }) => {
    localStorage.removeItem('userRole'); sessionStorage.removeItem('userRole');
    window.__fixtureQna = [inquiry]; window.__fixtureNow = 3000;
    window.__fixtureRejectReceipts = failReceipt; window.__fixtureSecureQna = secure;
  }, { inquiry: inquiryFixture(), failReceipt, secure });
  await page.goto('/qna.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#qna-conversation-thread-style')).toHaveCount(1);
  await page.locator('#searchName').fill('테스트 고객');
  await page.locator('#searchPw').fill('1234');
}

async function chooseInquiryManagement(page) {
  if ((page.viewportSize()?.width || 0) < 1280) {
    await page.locator('#mobileMenuOpenBtn').click();
    await page.locator('#mobileMenuSheet [data-tab="inquiry-management"]').click();
  } else await page.locator('#top-nav-bar [data-tab="inquiry-management"]').click();
  await expect(page.locator('#inquiry-management-content')).toBeVisible();
}

test('homepage guide opens a layer even when the Firebase page module is unavailable', async ({ page }) => {
  await fixture(page, 'user', false);
  await page.route('**/assets/js/pages/index.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  if ((page.viewportSize()?.width || 0) < 1024) await page.locator('#btn-mobile-menu-shell').click();
  await page.locator('#site-header a[href="work-guide.html"]:visible').click();
  await expect(page).toHaveURL(/index\.html$/);
  await expect(page.locator('#wg-layer-overlay')).toBeVisible();
  await expect(page.frameLocator('#wg-layer-overlay iframe').locator('#workGuideModal')).toBeVisible();
  await page.evaluate(() => window.postMessage({ type: 'CLOSE_WORK_GUIDE' }, location.origin));
  await expect(page.locator('#wg-layer-overlay')).toBeVisible();
  await page.frameLocator('#wg-layer-overlay iframe').locator('#guideList').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#wg-layer-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.locator('a[href="work-guide.html"]').last().click();
  await expect(page.locator('#wg-layer-overlay')).toHaveCount(1);
  await page.getByRole('button', { name: '작업가이드 닫기', exact: true }).click();
  await expect(page.locator('#wg-layer-overlay')).toHaveCount(0);
});

test('direct guide navigation displays its content instead of a blank page', async ({ page }) => {
  await fixture(page, 'user', false);
  await page.goto('/work-guide.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#workGuideModal')).toBeVisible();
  await expect(page.locator('#guideList')).not.toContainText('Loading...');
});

test('admin digital-output navigation keeps the calculator open with a saved customer draft', async ({ page }) => {
  await openAdmin(page);
  await page.evaluate(() => localStorage.setItem('temp_quote_print', JSON.stringify({ timestamp: Date.now(), quantity: '77' })));
  if ((page.viewportSize()?.width || 0) < 1280) {
    await page.locator('#mobileMenuOpenBtn').click();
    await page.locator('#admin-mobile-quote-shortcuts a[href^="quote-print.html"]').click();
  } else await page.locator('#admin-print-quote-shortcut').click();
  await expect(page).toHaveURL(/quote-print\.html\?.*adminPricing=1/);
  await expect(page.locator('#quantity')).toBeEnabled();
  await expect(page.locator('#admin-pricing-mode-banner')).toBeVisible();
  await expect(page.locator('#guideText')).toHaveAttribute('data-guide-state', 'loaded');
  await page.locator('#quantity').fill('123');
  await expect(page.locator('#quantity')).toHaveValue('123');
  expect(await page.evaluate(() => !!localStorage.getItem('temp_quote_print'))).toBe(true);
});

test('customer reads and replacement answers update receipts in real time', async ({ page }) => {
  await prepareInquiry(page);
  await page.locator('#searchPw').press('Enter');
  await expect(page.locator('#my-qna-list')).toContainText('PDF로 보내주세요.');
  await expect(page.locator('#my-qna-list')).toContainText('답변 확인됨');
  let receiptWrites = await writes(page, 'qna/inquiry-fixture');
  expect(receiptWrites).toHaveLength(1);
  expect(Object.keys(receiptWrites[0].data).sort()).toEqual(['answerReadAt', 'answerReadByCustomer']);
  await page.evaluate(() => {
    window.__fixtureQna[0] = { ...window.__fixtureQna[0], answer: '수정 답변입니다.', answeredAt: 4000, answerReadByCustomer: false, answerReadAt: null };
    window.__fixtureNow = 5000; window.__fixtureEmitQna();
  });
  await expect(page.locator('#my-qna-list')).toContainText('수정 답변입니다.');
  await expect(page.locator('#my-qna-list')).toContainText('답변 확인됨');
  receiptWrites = await writes(page, 'qna/inquiry-fixture');
  expect(receiptWrites).toHaveLength(2);
});

test('failed receipts remain unconfirmed and can be retried without another lookup', async ({ page }) => {
  await prepareInquiry(page, { failReceipt: true });
  await page.locator('#searchBtn').click();
  await expect(page.locator('#qna-receipt-status')).toContainText('저장하지 못했습니다');
  await expect(page.locator('#my-qna-list')).not.toContainText('답변 확인됨');
  expect(await writes(page, 'qna/inquiry-fixture')).toHaveLength(0);
  await page.evaluate(() => { window.__fixtureRejectReceipts = false; });
  await page.locator('#qna-receipt-retry').click();
  await expect(page.locator('#my-qna-list')).toContainText('답변 확인됨');
  await expect(page.locator('#qna-receipt-retry')).toBeHidden();
  expect(await writes(page, 'qna/inquiry-fixture')).toHaveLength(1);
});

test('a denied legacy name query falls back to the authenticated owner without exposing another customer', async ({ page }) => {
  await prepareInquiry(page);
  await page.evaluate(() => {
    window.__fixtureRejectNameQuery = true;
    window.__fixtureQna.push({ ...window.__fixtureQna[0], id: 'other-inquiry', ownerUid: 'another-customer', answer: '다른 고객의 비공개 답변' });
  });
  await page.locator('#searchBtn').click();
  await expect(page.locator('#my-qna-list')).toContainText('답변 확인됨');
  await expect(page.locator('#my-qna-list')).not.toContainText('다른 고객의 비공개 답변');
  expect(await writes(page, 'qna/other-inquiry')).toHaveLength(0);
});

test('answers received while the FAQ is open are confirmed only after returning to the conversation', async ({ page }) => {
  await prepareInquiry(page);
  await page.locator('#searchBtn').click();
  await expect(page.locator('#my-qna-list')).toContainText('답변 확인됨');
  await page.locator('[data-qna-section="faq"]').click();
  await page.evaluate(() => {
    window.__fixtureQna[0] = { ...window.__fixtureQna[0], answer: '새 답변입니다.', answeredAt: 4000, answerReadByCustomer: false, answerReadAt: null };
    window.__fixtureNow = 5000; window.__fixtureEmitQna();
  });
  await expect(page.locator('#my-qna-list')).toContainText('새 답변입니다.');
  expect(await writes(page, 'qna/inquiry-fixture')).toHaveLength(1);
  await page.locator('[data-qna-section="answers"]').click();
  await expect(page.locator('#my-qna-list')).toContainText('답변 확인됨');
  expect(await writes(page, 'qna/inquiry-fixture')).toHaveLength(2);
});

test('secure Q&A has one lookup handler and subscribes only to verified inquiry documents', async ({ page }) => {
  let requests = 0;
  await page.route('https://asia-northeast3-worklist-1e83a.cloudfunctions.net/qnaSecure', route => {
    requests += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, items: [inquiryFixture()] }) });
  });
  await prepareInquiry(page, { secure: true });
  await page.locator('#searchBtn').click();
  await expect(page.locator('#my-qna-list')).toContainText('답변 확인됨');
  expect(requests).toBe(1);
  expect(await page.evaluate(() => (window.__fixtureQueries || []).filter(query => query.filters?.some(filter => filter.field === 'name')))).toEqual([]);
});

test('a receipt for an old answer cannot mark an unseen replacement answer read', async ({ page }) => {
  await prepareInquiry(page);
  await page.evaluate(async () => {
    const oldAnswer = { ...window.__fixtureQna[0] };
    window.__fixtureQna[0] = { ...oldAnswer, answer: '아직 열지 않은 수정 답변', answeredAt: 4000 };
    const { markQnaAnswerRead } = await import('/assets/js/qna-read-receipts.js');
    await markQnaAnswerRead(oldAnswer);
  });
  expect(await writes(page, 'qna/inquiry-fixture')).toHaveLength(0);
});

test('secure submission uses one authenticated API request and preserves answer-lookup credentials in the form', async ({ page }) => {
  const requests = [];
  await page.route('https://asia-northeast3-worklist-1e83a.cloudfunctions.net/qnaSecure', route => {
    requests.push({ body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'secure-created' }) });
  });
  await prepareInquiry(page, { secure: true });
  await page.locator('#qnaName').fill('테스트 고객');
  await page.locator('#qnaPw').fill('1234');
  await page.locator('#qnaTitle').fill('비공개 문의');
  await page.locator('#qnaBody').fill('새 문의입니다.');
  await page.locator('#submitBtn').click();
  await expect(page.locator('#qna-submit-result')).toContainText('접수되었습니다');
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ body: { action: 'submit', isSecret: true }, authorization: 'Bearer fixture-token' });
  expect(await writes(page, 'qna')).toHaveLength(0);
  await expect(page.locator('#searchName')).toHaveValue('테스트 고객');
  await expect(page.locator('#searchPw')).toHaveValue('1234');
});

test('inquiry startup and concurrent operations create one persistent customer session', async ({ page }) => {
  await fixture(page, null);
  await page.addInitScript(() => {
    localStorage.removeItem('userRole'); sessionStorage.removeItem('userRole');
    window.__fixtureSignInDelay = 700;
  });
  await page.goto('/qna.html', { waitUntil: 'domcontentloaded' });
  const uids = await page.evaluate(async () => {
    const { ensureUser } = await import('/assets/js/qna-secure-v2.js');
    return (await Promise.all([ensureUser(), ensureUser()])).map(user => user.uid);
  });
  expect(uids).toEqual(['fixture-guest', 'fixture-guest']);
  expect(await page.evaluate(() => window.__fixtureAnonymousSignIns)).toBe(1);
});

test('admin receives live receipt changes in the list and the open conversation without losing its draft', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(inquiry => { window.__fixtureQna = [inquiry]; window.__fixtureNow = 3000; }, inquiryFixture());
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-content')).toBeVisible();
  await chooseInquiryManagement(page);
  await expect(page.locator('#inquiry-list-body')).toContainText('답변 미수신');
  await page.locator('.view-qna-thread-btn').click();
  await page.locator('#inquiry-modal-answer').fill('작성 중인 새 답변');
  await page.evaluate(() => {
    window.__fixtureQna[0] = { ...window.__fixtureQna[0], answerReadByCustomer: true, answerReadAt: 3000 };
    window.__fixtureEmitQna();
  });
  await expect(page.locator('#inquiry-list-body')).toContainText('답변 수신확인');
  await expect(page.locator('#inquiry-modal-question')).toContainText('고객 수신확인');
  await expect(page.locator('#inquiry-modal-answer')).toHaveValue('작성 중인 새 답변');
  await page.locator('#inquiry-reply-form button[type="submit"]').click();
  const saved = (await writes(page, 'qna/inquiry-fixture'))[0];
  expect(saved.data).toMatchObject({ answer: '작성 중인 새 답변', answerReadByCustomer: false, answerReadAt: null });
  await expect(page.locator('#inquiry-list-body')).toContainText('답변 미수신');
  await page.evaluate(() => {
    window.__fixtureQna[0] = { ...window.__fixtureQna[0], answerReadByCustomer: true, answerReadAt: 4000 };
    window.__fixtureEmitQna();
  });
  await expect(page.locator('#inquiry-list-body')).toContainText('답변 수신확인');
  await page.waitForTimeout(1100); // Covers the removed 900 ms reset that used to undo a customer read.
  expect(await writes(page, 'qna/inquiry-fixture')).toHaveLength(1);
  await expect(page.locator('#inquiry-list-body')).toContainText('답변 수신확인');
});

test('customer-center shortcuts and submission confirmation lead straight to the answer lookup', async ({ page }) => {
  await prepareInquiry(page);
  await expect(page.locator('#qna-submitted-lookup')).toBeHidden();
  await page.locator('[data-qna-section="faq"]').click();
  await expect(page.locator('#content-faq')).toBeVisible();
  await expect(page.locator('#tab-faq')).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-qna-section="compose"]').click();
  await expect(page.locator('#qnaName')).toBeFocused();
  await page.locator('#qnaName').fill('테스트 고객');
  await page.locator('#qnaPw').fill('1234');
  await page.locator('#qnaTitle').fill('후속 문의');
  await page.locator('#qnaBody').fill('출력을 진행해주세요.');
  await page.locator('#submitBtn').click();
  await expect(page.locator('#qna-submit-result')).toContainText('접수되었습니다');
  await expect(page.locator('#searchName')).toHaveValue('테스트 고객');
  await expect(page.locator('#searchPw')).toHaveValue('1234');
  await page.locator('#qna-submitted-lookup').click();
  await expect(page.locator('#my-qna-list')).toContainText('PDF로 보내주세요.');
  const saved = (await writes(page, 'qna'))[0];
  expect(saved.data.ownerUid).toBe('fixture-admin');
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value === '1234'))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(3);
});

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

for (const [path, form] of [['admin-faq.html', '#faqFormWrap'], ['admin-payment-guide.html', '#form'], ['admin-ai-chat.html', '#aiForm']]) {
  for (const role of ['user', null]) {
    test(`${path} rejects cached admin roles with ${role || 'no authenticated user'}`, async ({ page }) => {
      await fixture(page, role, false);
      await page.goto('/' + path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#status')).toContainText('관리자 로그인이 필요합니다');
      await expect(page.locator(form)).toBeHidden();
      expect(await page.evaluate(() => (window.__fixtureWrites || []).length)).toBe(0);
    });
  }
  test(`${path} closes the editor when authentication is lost`, async ({ page }) => {
    await fixture(page, 'admin', false);
    await page.goto('/' + path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(form)).toBeVisible();
    await page.evaluate(async () => { const { auth } = await import('/assets/js/firebase.js'); auth.currentUser = null; for (const callback of window.__fixtureAuthListeners || []) callback(null); });
    await expect(page.locator(form)).toBeHidden();
  });
}

test('admin alias exposes customer center menus and the guide workspace', async ({ page }) => {
  await fixture(page);
  await page.route('**/admin', route => route.fulfill({ contentType: 'text/html', body: readFileSync(new URL('../../admin.html', import.meta.url), 'utf8') }));
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('#cc-pay-btn')).toHaveCount(1);
  await choose(page, 'cc-pay-btn');
  await expect(page.frameLocator('#payment-management-frame').locator('#form')).toBeVisible();
  await choose(page, 'work-guide-management-btn');
  await expect(page.locator('#work-guide-management-content #workGuideModal')).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
});

test('stored guide formatting survives sanitization while executable markup is removed', async ({ page }) => {
  await fixture(page, 'user', false);
  await page.goto('/work-guide.html?embed=1', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { sanitizeRichText } = await import('/assets/js/rich-text-sanitizer.js');
    const clean = sanitizeRichText('<p style="color: red; font-size: 18px; position: fixed" onclick="window.__xss=1"><b>안내</b><img src="/favicon.ico" onerror="window.__xss=1"><a href="javascript:alert(1)">링크</a><script>window.__xss=1</script><iframe srcdoc="bad"></iframe></p>');
    const target = document.createElement('div'); target.innerHTML = clean; document.body.append(target);
    return { clean, text: target.textContent, color: target.querySelector('p').style.color, image: target.querySelector('img')?.getAttribute('src'), executed: !!window.__xss };
  });
  expect(result.text).toBe('안내링크');
  expect(result.color).toBe('red');
  expect(result.image).toBe('/favicon.ico');
  expect(result.clean).not.toMatch(/onerror|onclick|javascript:|<script|<iframe|position:/i);
  expect(result.executed).toBe(false);
});


test('administrator uploads use the same design-file and size policy as customer uploads', async ({ page }) => {
  await openAdmin(page);
  const results = await page.evaluate(async () => {
    const { validateUploadFiles, MAX_FILE_BYTES, MAX_TOTAL_BYTES } = await import('/assets/js/file-upload-policy.js');
    const checks = {
      design: validateUploadFiles([{ name: 'print.AI', size: 100 }, { name: 'image.psd', size: 100 }, { name: 'book.hwpx', size: 100 }]).ok,
      executable: validateUploadFiles([{ name: 'print.exe', size: 100 }]).ok,
      large: validateUploadFiles([{ name: 'print.pdf', size: MAX_FILE_BYTES + 1 }]).ok,
      batch: validateUploadFiles(Array.from({ length: 3 }, () => ({ name: 'print.pdf', size: MAX_TOTAL_BYTES / 3 + 1 }))).ok,
    };
    const input = document.createElement('input'); input.type = 'file'; input.id = 'file-input'; document.body.append(input);
    let handled = 0; input.addEventListener('change', () => handled++);
    const select = (name, type) => { const files = new DataTransfer(); files.items.add(new File(['design'], name, { type })); input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true })); };
    select('design.ai', 'application/illustrator'); select('design.psd', 'application/vnd.adobe.photoshop'); select('book.hwpx', 'application/vnd.hancom.hwpx');
    const designHandled = handled;
    select('script.exe', 'application/octet-stream');
    return { ...checks, designHandled, invalidHandled: handled - designHandled, cleared: input.files.length === 0 };
  });
  expect(results).toEqual({ design: true, executable: false, large: false, batch: false, designHandled: 3, invalidHandled: 0, cleared: true });
});


test('digital print guide loads once, sanitizes stored images before display, and survives late initialization', async ({ page }) => {
  await fixture(page, 'user', false);
  await page.addInitScript(() => { localStorage.removeItem('userRole'); sessionStorage.removeItem('userRole'); window.__fixtureGuideHtml = '<p>파일 준비 안내</p><img src="/favicon.ico" alt="안내 이미지"><img src="/missing-guide-image.png" onerror="window.__guideXss=1"><script>window.__guideXss=1</script>'; });
  await page.goto('/quote-print.html', { waitUntil: 'domcontentloaded' });
  const guide = page.locator('#guideText');
  await expect(guide).toHaveAttribute('data-guide-state', 'loaded');
  await expect(guide.locator('img[src="/favicon.ico"]')).toHaveCount(1);
  await expect(guide.locator('[onerror], script')).toHaveCount(0);
  await page.waitForTimeout(3500);
  await expect(guide.locator('img[src="/favicon.ico"]')).toHaveCount(1);
  expect(await page.evaluate(() => (window.__fixtureReads || []).filter(path => path === 'settings/print').length)).toBe(1);
  expect(await page.evaluate(() => !!window.__guideXss)).toBe(false);
});


test('administrator design files reach the real quote upload handler', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => { window.__fixtureQuotes = [{ id: 'fixture-order', userId: 'customer', isGuest: false, status: '접수완료', productType: 'print', orderName: '파일 검증 접수', totalPrice: 10000, createdAt: { toDate: () => new Date() } }]; });
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await page.locator('.view-details-btn[data-id="fixture-order"]:visible').first().click();
  const input = page.locator('#file-input');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const [name, mimeType] of [['design.ai','application/illustrator'], ['design.psd','application/vnd.adobe.photoshop'], ['book.hwpx','application/vnd.hancom.hwpx']]) {
    await input.setInputFiles({ name, mimeType, buffer: Buffer.from('design') });
    await expect(page.locator('#upload-file-name')).toContainText('업로드 완료');
  }
  expect(await page.evaluate(() => (window.__fixtureUploads || []).map(file => file.name))).toEqual(['design.ai','design.psd','book.hwpx']);
  expect(await page.evaluate(() => (window.__fixtureUploads || []).every(file => file.path.startsWith('quotes/fixture-order/admin/')))).toBe(true);
  await input.setInputFiles([]);
  expect(errors).toEqual([]);
});

test('customer design files and cancelled selections use the real quote upload handler', async ({ page }) => {
  await fixture(page, 'user', false);
  await page.addInitScript(() => {
    localStorage.removeItem('userRole'); sessionStorage.removeItem('userRole');
    window.__fixtureQuotes = [{ id: 'fixture-order', userId: 'fixture-admin', isGuest: false, status: '접수완료', productType: 'print', orderName: '고객 파일 검증', totalPrice: 10000, createdAt: { toDate: () => new Date() } }];
  });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/mypage.html', { waitUntil: 'domcontentloaded' });
  await page.locator('.view-details-btn[data-id="fixture-order"]:visible').first().click();
  const input = page.locator('#file-input');
  for (const [name, mimeType] of [['design.ai','application/illustrator'], ['design.psd','application/vnd.adobe.photoshop'], ['book.hwpx','application/vnd.hancom.hwpx']]) {
    await input.setInputFiles({ name, mimeType, buffer: Buffer.from('design') });
    await expect.poll(() => page.evaluate(() => (window.__fixtureUploads || []).at(-1)?.name)).toBe(name);
    await expect(page.locator('#chat-form button[type="submit"]')).toBeEnabled();
  }
  expect(await page.evaluate(() => (window.__fixtureUploads || []).map(file => file.name))).toEqual(['design.ai','design.psd','book.hwpx']);
  expect(await page.evaluate(() => (window.__fixtureUploads || []).every(file => file.path.startsWith('quotes/fixture-order/')))).toBe(true);
  await input.setInputFiles([]);
  expect(errors).toEqual([]);
});
