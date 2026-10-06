import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

// Never run these write tests against production services.
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
  assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/, `${key} must point to a local emulator`);
}
let env;
const quote = (overrides = {}) => ({
  userId: 'customer', isGuest: false, createdAt: 100, productType: 'print',
  status: '접수완료', quantity: 10, ...overrides,
});
const db = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const seed = async entries => env.withSecurityRulesDisabled(async context => {
  for (const [path, data] of Object.entries(entries)) await setDoc(doc(context.firestore(), path), data);
});
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-greenoffice',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed({ 'users/admin': { role: 'admin' }, 'quotes/order': quote() });
});

test('customers can submit and edit their own quote, but cannot impersonate an owner or administrator', async () => {
  await assertSucceeds(setDoc(doc(db('customer'), 'quotes/new'), quote()));
  await assertSucceeds(updateDoc(doc(db('customer'), 'quotes/order'), { quantity: 25, lastEditedBy: 'customer' }));
  await assertFails(getDoc(doc(db('stranger'), 'quotes/order')));
  await assertFails(updateDoc(doc(db('stranger'), 'quotes/order'), { quantity: 50 }));
  await assertFails(setDoc(doc(db('customer'), 'quotes/forged'), quote({ adminFinalPrice: 1 })));
  await assertFails(setDoc(doc(db('customer'), 'quotes/forged-owner'), quote({ userId: 'stranger' })));
  await assertSucceeds(updateDoc(doc(db('admin'), 'quotes/order'), { status: '진행중', adminFinalPrice: 20000 }));
});

test('adding, changing and deleting protected pricing/payment fields are all denied', async () => {
  const order = doc(db('customer'), 'quotes/order');
  await assertFails(updateDoc(order, { adminFinalPrice: 1 }));
  await assertFails(updateDoc(order, { paymentStatus: 'paid' }));
  await seed({ 'quotes/order': quote({ adminFinalPrice: 20000, paymentStatus: 'unpaid' }) });
  await assertFails(updateDoc(order, { adminFinalPrice: 1 }));
  await assertFails(updateDoc(order, { adminFinalPrice: deleteField() }));
  await assertFails(updateDoc(order, { paymentStatus: deleteField() }));
  await assertSucceeds(updateDoc(order, { cancelRequestState: 'requested' }));
  await assertFails(updateDoc(order, { cancelRequestState: 'approved' }));
});

test('a guest can transfer only their verified quote and cannot change payment or status during transfer', async () => {
  await seed({ 'quotes/guest': quote({ userId: 'guest', isGuest: true, guestUid: 'guest-owner', guestLookupKey: 'lookup-key' }) });
  const transfer = { userId: 'member', isGuest: false, claimedFrom: 'guest', claimedAt: 200 };
  await assertFails(updateDoc(doc(db('member'), 'quotes/guest'), transfer));
  const verified = doc(db('member', { guestLookupKey: 'lookup-key' }), 'quotes/guest');
  await assertFails(updateDoc(verified, { ...transfer, status: '완료' }));
  await assertFails(updateDoc(verified, { ...transfer, adminFinalPrice: 1 }));
  await assertSucceeds(updateDoc(verified, transfer));
  await assertSucceeds(getDoc(doc(db('member'), 'quotes/guest')));
});

test('original guest ownership still permits editing and a transfer using the same authenticated UID', async () => {
  await seed({ 'quotes/guest': quote({ userId: 'guest', isGuest: true, guestUid: 'guest-owner', guestLookupKey: 'key' }) });
  const order = doc(db('guest-owner'), 'quotes/guest');
  await assertSucceeds(updateDoc(order, { quantity: 30 }));
  await assertSucceeds(updateDoc(order, { userId: 'guest-owner', isGuest: false, claimedAt: 200, claimedFrom: 'guest' }));
});

test('customer chat receipts and proof responses work without permitting new arbitrary fields', async () => {
  await seed({
    'quotes/order': quote({ status: '진행중' }),
    'quotes/order/messages/proof': { sender: 'admin', isProof: true, text: 'proof' },
  });
  const proof = doc(db('customer'), 'quotes/order/messages/proof');
  await assertSucceeds(updateDoc(proof, { readByCustomer: true, readByCustomerAt: 200 }));
  await assertFails(updateDoc(proof, { readByCustomer: true, adminPrice: 1 }));
  await assertSucceeds(updateDoc(proof, { proofStatus: 'rejected', rejectionReason: '수정 요청' }));
  await assertFails(updateDoc(proof, { proofStatus: 'approved', forged: true }));
  await assertFails(updateDoc(proof, { readByCustomer: true, text: deleteField() }));
  await assertSucceeds(updateDoc(doc(db('customer'), 'quotes/order'), { lastMessage: '확인했습니다', unreadByAdmin: 1 }));
  await assertFails(updateDoc(doc(db('customer'), 'quotes/order'), { lastMessage: '확인했습니다', forged: true }));
  await assertSucceeds(setDoc(doc(db('customer'), 'quotes/order/messages/reply'), { sender: 'customer', text: '감사합니다' }));
  await assertFails(setDoc(doc(db('customer'), 'quotes/order/messages/forged'), { sender: 'admin', text: '사칭' }));
});

test('Q&A receipts require the verified owner; public submissions cannot forge answers or expose passwords', async () => {
  const submission = { name: '고객', title: '문의', body: '내용', isSecret: false, pwHash: null, createdAt: 100, status: 'open', answer: '', answeredAt: null };
  await assertSucceeds(setDoc(doc(db('customer'), 'qna/public'), submission));
  await assertFails(setDoc(doc(db('customer'), 'qna/forged'), { ...submission, answer: '관리자 사칭' }));
  await assertFails(setDoc(doc(db('customer'), 'qna/password'), { ...submission, pwHash: 'public-password-hash' }));
  await seed({ 'qna/secret': { ...submission, isSecret: true, ownerUid: 'customer', answer: '답변' } });
  const receipt = { answerReadByCustomer: true, answerReadAt: 200 };
  await assertFails(getDoc(doc(db('stranger'), 'qna/secret')));
  await assertFails(updateDoc(doc(db('stranger'), 'qna/secret'), receipt));
  await assertSucceeds(updateDoc(doc(db('customer'), 'qna/secret'), receipt));
  await assertFails(updateDoc(doc(db('customer'), 'qna/secret'), { ...receipt, injected: true }));
});

test('cached roles cannot grant administrator access or expose server-only credentials', async () => {
  await assertFails(setDoc(doc(db('customer'), 'users/customer'), { role: 'admin' }));
  await assertSucceeds(setDoc(doc(db('customer'), 'users/customer'), { role: 'user' }));
  await assertFails(updateDoc(doc(db('customer'), 'users/customer'), { role: 'admin' }));
  await assertFails(setDoc(doc(db('customer'), 'settings/unitPriceConfig'), { price: 1 }));
  await seed({ 'settings/aiChat': { apiKey: 'fixture-secret' }, 'settings/paymentGuide': { bank: '공개 정보' } });
  await assertFails(getDoc(doc(db('customer'), 'settings/aiChat')));
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'settings/paymentGuide')));
  await assertSucceeds(setDoc(doc(db('admin'), 'settings/unitPriceConfig'), { price: 500 }));
});

test('quote attachment MIME types permit design files only for the quote owner', async () => {
  const upload = (uid, name, type) => uploadBytes(ref(env.authenticatedContext(uid).storage(), `quotes/order/attachments/${name}`), new Uint8Array([1, 2, 3]), { contentType: type });
  for (const [name, type] of [['print.pdf','application/pdf'], ['design.ai','application/illustrator'], ['design.psd','application/vnd.adobe.photoshop'], ['document.hwpx','application/vnd.hancom.hwpx']]) {
    await assertSucceeds(upload('customer', name, type));
  }
  await assertFails(upload('stranger', 'stolen.pdf', 'application/pdf'));
  await assertFails(upload('customer', 'script.html', 'text/html'));
  await assertSucceeds(getBytes(ref(env.authenticatedContext('customer').storage(), 'quotes/order/attachments/design.ai')));
  await assertFails(getBytes(ref(env.authenticatedContext('stranger').storage(), 'quotes/order/attachments/design.ai')));
});
