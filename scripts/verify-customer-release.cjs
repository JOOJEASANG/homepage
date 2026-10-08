// Production release check: only uniquely named synthetic customer records are changed.
// No credentials, tokens, customer documents, screenshots or browser traces are logged.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const sdk = createRequire(require.resolve('../functions/package.json'));
const { initializeApp } = sdk('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = sdk('firebase-admin/firestore');
const { getAuth } = sdk('firebase-admin/auth');
const { chromium, expect } = require('@playwright/test');

const projectId = 'worklist-1e83a';
initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();
const origin = 'https://www.g-print.co.kr';
const base = `https://asia-northeast3-${projectId}.cloudfunctions.net/`;
const marker = `release-check-${crypto.randomUUID()}`;
const password = crypto.randomBytes(12).toString('hex');
const name = marker;
const contact = '01000000000';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const lookupKey = hash(`${name}|${contact}|${password}`);
const quoteRef = db.doc(`quotes/${marker}`);
const legacyRef = db.doc(`qna/${marker}-legacy`);
const siteRef = db.doc('settings/site');
const userIds = new Set();
let browser, previousFlags, activated = false, verified = false;

async function probe(endpoint) {
  const get = await fetch(base + endpoint, { signal: AbortSignal.timeout(30000) });
  assert.equal(get.status, 405, `${endpoint}: GET method guard`);
  const options = await fetch(base + endpoint, {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(options.status, 204, `${endpoint}: CORS`);
  assert.ok([origin, '*'].includes(options.headers.get('access-control-allow-origin')));
  const unauthenticated = await fetch(base + endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(30000),
  });
  assert.equal(unauthenticated.status, 401, `${endpoint}: authentication guard`);
  console.log(`${endpoint}: method, CORS and authentication guards passed`);
}

async function newCustomer(flagged) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${origin}/qna.html${flagged ? '?qnaApiV2=1' : ''}`, { waitUntil: 'domcontentloaded' });
  const uid = await page.evaluate(async () => {
    const { ensureUser } = await import('/assets/js/qna-secure-v2.js');
    return (await ensureUser()).uid;
  });
  userIds.add(uid);
  return page;
}

async function callQna(page, payload) {
  return page.evaluate(async payload => {
    const { callSecureQna } = await import('/assets/js/qna-secure-v2.js');
    return callSecureQna(payload);
  }, payload);
}

async function lookupInUi(page, lookupName = name) {
  await page.locator('#searchName').fill(lookupName);
  await page.locator('#searchPw').fill(password);
  await page.locator('#searchBtn').click();
  await expect(page.locator('#my-qna-list .qna-thread-shell')).toBeVisible();
}

async function waitForReceipt(ref) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await ref.get()).data()?.answerReadByCustomer === true) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Live answer receipt was not persisted');
}

async function guestCheck(page) {
  const result = await page.evaluate(async ({ name, contact, password, quoteId }) => {
    const { requestGuestAccess } = await import('/assets/js/guest-access-v2.js');
    let rejected = false;
    try { await requestGuestAccess({ name, contactRaw: contact, password: `${password}-wrong` }); }
    catch { rejected = true; }
    const access = await requestGuestAccess({ name, contactRaw: contact, password });
    const { db, doc, getDoc } = await import('/assets/js/firebase.js');
    const own = await getDoc(doc(db, 'quotes', quoteId));
    return { rejected, count: access.count, readable: own.exists() };
  }, { name, contact, password, quoteId: quoteRef.id });
  assert.deepEqual(result, { rejected: true, count: 1, readable: true });
}

async function main() {
  await probe('qnaSecure');
  await probe('guestQuoteAccess');
  const initial = (await siteRef.get()).data() || {};
  previousFlags = Object.fromEntries(['qnaApiV2', 'guestLookupApiV2'].map(key => [key, initial[key] ?? FieldValue.delete()]));
  browser = await chromium.launch();
  const page = await newCustomer(true);
  const submitted = await callQna(page, { action: 'submit', name, password, title: '운영 연결 확인용 임시 문의', body: '자동 검증 후 삭제되는 비공개 테스트입니다.', isSecret: true });
  const ref = db.doc(`qna/${submitted.id}`);
  assert.equal((await ref.get()).data().isSecret, true);
  const wrong = await callQna(page, { action: 'lookup', name, password: `${password}-wrong` });
  assert.equal(wrong.items.length, 0);
  await ref.update({ answer: '운영 연결 확인 답변 1', answeredAt: Timestamp.now(), status: 'answered', answerReadByCustomer: false, answerReadAt: null });
  await lookupInUi(page);
  await expect(page.locator('#my-qna-list')).toContainText('운영 연결 확인 답변 1');
  await waitForReceipt(ref);
  // A second answer must arrive and be acknowledged without another lookup or reload.
  await ref.update({ answer: '운영 연결 확인 답변 2', answeredAt: Timestamp.now(), answerReadByCustomer: false, answerReadAt: null });
  await expect(page.locator('#my-qna-list')).toContainText('운영 연결 확인 답변 2');
  await waitForReceipt(ref);
  await expect(page.locator('#my-qna-list .qna-receipt.read')).toContainText('답변 확인됨');
  console.log('Private Q&A: submit, wrong password, live answer and persisted receipt passed');

  await legacyRef.create({ name: `${name}-legacy`, title: '이전 문의 호환성 확인', body: '자동 삭제 테스트', isSecret: true, pwHash: hash(password), createdAt: Timestamp.now(), answer: '이전 문의 답변', answeredAt: Timestamp.now(), status: 'answered', answerReadByCustomer: false });
  await lookupInUi(page, `${name}-legacy`);
  const migrated = (await legacyRef.get()).data();
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.pwHash, undefined);
  assert.equal(migrated.answerReadByCustomer, true);
  assert.ok((await db.doc(`qna_secrets/${legacyRef.id}`).get()).exists);
  console.log('Legacy private Q&A: password migration and receipt passed');

  await quoteRef.create({ isGuest: true, userId: 'guest', guestName: name, guestNameNorm: name, guestContact: contact, guestLookupKey: lookupKey, createdAt: Timestamp.now(), status: 'release-test' });
  await guestCheck(page);
  console.log('Guest lookup: wrong password rejected and verified quote readable');

  await siteRef.set({ qnaApiV2: true, guestLookupApiV2: true }, { merge: true });
  activated = true;
  const fresh = await newCustomer(false);
  assert.equal(await fresh.evaluate(async () => (await import('/assets/js/qna-secure-v2.js')).featureEnabled()), true);
  await lookupInUi(fresh);
  await expect(fresh.locator('#my-qna-list')).toContainText('운영 연결 확인 답변 2');
  await guestCheck(fresh);
  await fresh.goto(`${origin}/login.html`, { waitUntil: 'domcontentloaded' });
  await expect(fresh.locator('#guest-lookup-form')).toHaveAttribute('data-guest-api-v2-bound', '1');
  verified = true;
  console.log('Both production flags enabled; fresh browser Q&A and guest form verified');
}

async function cleanup() {
  await browser?.close();
  if (activated && !verified) {
    await siteRef.set(previousFlags, { merge: true });
    console.log('Verification failed; previous feature flags restored');
  }
  const docs = [];
  for (const testName of [name, `${name}-legacy`]) {
    const snap = await db.collection('qna').where('name', '==', testName).get();
    for (const item of snap.docs) docs.push(item.ref, db.doc(`qna_secrets/${item.id}`));
  }
  docs.push(quoteRef, legacyRef, db.doc(`qna_secrets/${legacyRef.id}`));
  const sessions = await db.collection('guest_access_sessions').where('lookupKey', '==', lookupKey).get();
  docs.push(...sessions.docs.map(item => item.ref));
  const batch = db.batch();
  for (const ref of docs) batch.delete(ref);
  await batch.commit();
  for (const uid of userIds) await auth.deleteUser(uid);
  console.log('Synthetic inquiries, secrets, quote, sessions and test auth users removed');
}

main().catch(error => {
  console.error('Customer release check failed:', error.message);
  process.exitCode = 1;
}).finally(async () => {
  try { await cleanup(); }
  catch (error) { console.error('Synthetic cleanup failed:', error.message); process.exitCode = 1; }
});
