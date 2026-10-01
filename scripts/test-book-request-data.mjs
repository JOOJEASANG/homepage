import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuoteRequestData, buildQuoteUpdatePayload } from '../assets/js/pages/quote-book/quote-request-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const createdAt = { kind: 'created' };
const calculated = {
  orderName: '테스트',
  finalPrice: 11000,
  breakdown: [{ amount: 11000 }],
};

const guest = buildQuoteRequestData({
  calculatedQuote: calculated,
  userId: 'member-ignored',
  isGuest: true,
  ordererName: ' 홍 길 동 ',
  ordererContact: '010-1234-5678',
  normalizedContact: '01012345678',
  ordererCompany: '회사',
  guestLookupKey: 'lookup',
  guestContactRaw: '010-1234-5678',
  guestContactHyphen: '010-1234-5678',
  guestUid: 'anon-uid',
  createdAt,
  breakdownHtml: '<div>breakdown</div>',
  allItemsData: [{ orderName: '책자' }],
});
assert.equal(guest.userId, 'guest');
assert.equal(guest.isGuest, true);
assert.equal(guest.guestName, ' 홍 길 동 ');
assert.equal(guest.guestContact, '01012345678');
assert.equal(guest.guestPwLast4, '5678');
assert.equal(guest.guestNameNorm, '홍길동');
assert.equal(guest.ordererContact, '01012345678');
assert.equal(guest.status, '접수완료');
assert.equal(guest.createdAt, createdAt);
assert.equal(guest.breakdownData, JSON.stringify(calculated.breakdown));
assert.equal(guest.formData, JSON.stringify([{ orderName: '책자' }]));
assert.equal(guest.productType, 'book');

const member = buildQuoteRequestData({
  calculatedQuote: calculated,
  userId: 'member-1',
  isGuest: false,
  ordererName: '회원',
  ordererContact: '02-123-4567',
  normalizedContact: '021234567',
  ordererCompany: '',
  guestLookupKey: 'ignored',
  guestContactRaw: 'ignored',
  guestContactHyphen: 'ignored',
  guestUid: 'ignored',
  createdAt,
  breakdownHtml: '',
  allItemsData: [],
});
assert.equal(member.userId, 'member-1');
assert.equal(member.ordererContact, '02-123-4567');
for (const key of ['guestName','guestContact','guestContactRaw','guestContactHyphen','guestLookupKey','guestUid','guestPwLast4','guestNameNorm']) {
  assert.equal(member[key], null, `${key} should remain null for members`);
}

const requestForEdit = {
  ...member,
  createdAt,
  userId: 'new-user',
  isGuest: false,
  productType: 'book',
  status: '접수완료',
  ordererName: '새 이름',
};
const updatedAt = { kind: 'updated' };
const lastEditedAt = { kind: 'edited' };
const existingMember = {
  userId: 'original-user',
  isGuest: false,
  productType: 'book',
  status: '접수완료',
  ordererName: '기존 이름',
};
const customerPayload = buildQuoteUpdatePayload({
  quoteRequestData: requestForEdit,
  existing: existingMember,
  isAdminEditMode: false,
  adminEditFlag: false,
  updatedAt,
  lastEditedAt,
});
assert.equal('createdAt' in customerPayload, false);
assert.equal(customerPayload.userId, 'original-user');
assert.equal(customerPayload.isGuest, false);
assert.equal(customerPayload.productType, 'book');
assert.equal(customerPayload.status, '접수완료');
assert.equal(customerPayload.ordererName, '새 이름');
assert.equal(customerPayload.lastEditedBy, 'customer');
assert.equal(customerPayload.hasUnreadAdminMessage, true);
assert.equal(customerPayload.hasUnreadCustomerMessage, false);
assert.equal(customerPayload.updatedAt, updatedAt);
assert.equal(customerPayload.lastEditedAt, lastEditedAt);

const adminExisting = {
  userId: 'customer-uid',
  isGuest: false,
  ordererName: '고객 원래 이름',
  ordererContact: '01000000000',
  ordererCompany: null,
  guestLookupKey: null,
  status: '제작중',
};
const adminPayload = buildQuoteUpdatePayload({
  quoteRequestData: { ...requestForEdit, ordererName: '관리자 입력', ordererContact: '변경값' },
  existing: adminExisting,
  isAdminEditMode: true,
  adminEditFlag: true,
  updatedAt,
  lastEditedAt,
});
assert.equal(adminPayload.userId, 'customer-uid');
assert.equal(adminPayload.ordererName, '고객 원래 이름');
assert.equal(adminPayload.ordererContact, '01000000000');
assert.equal(adminPayload.ordererCompany, null);
assert.equal(adminPayload.status, '제작중');
assert.equal(adminPayload.lastEditedBy, 'admin');
assert.equal(adminPayload.hasUnreadAdminMessage, false);
assert.equal(adminPayload.hasUnreadCustomerMessage, true);

const guestExisting = {
  userId: 'guest', isGuest: true, guestUid: 'anon-old', guestLookupKey: 'lookup-old',
  guestPwLast4: '1111', guestName: '기존손님', guestContact: '01011111111',
  guestContactRaw: '010-1111-1111', guestContactHyphen: '010-1111-1111', guestNameNorm: '기존손님',
  ordererName: '기존손님', ordererContact: '01011111111', ordererCompany: '', productType: 'book', status: '접수완료'
};
const guestEditPayload = buildQuoteUpdatePayload({
  quoteRequestData: { ...guest, guestUid: 'anon-new', guestLookupKey: 'lookup-new', guestName: '새손님' },
  existing: guestExisting,
  isAdminEditMode: false,
  adminEditFlag: false,
  updatedAt,
  lastEditedAt,
});
assert.equal(guestEditPayload.guestUid, 'anon-old');
assert.equal(guestEditPayload.guestLookupKey, 'lookup-old');
assert.equal(guestEditPayload.guestName, '기존손님');
assert.equal(guestEditPayload.ordererName, '기존손님');

assert.equal(requestForEdit.createdAt, createdAt, 'helper must not mutate request input');
assert.equal(existingMember.userId, 'original-user', 'helper must not mutate existing input');

const quoteBookSource = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book.js'), 'utf8');
assert.match(quoteBookSource, /quote-request-data\.js/);
assert.match(quoteBookSource, /buildQuoteRequestData\s*\(/);
assert.match(quoteBookSource, /buildQuoteUpdatePayload\s*\(/);
assert.doesNotMatch(quoteBookSource, /const quoteRequestData = \{\s*\.\.\.lastCalculatedQuote/);
assert.doesNotMatch(quoteBookSource, /const payload = \{ \.\.\.quoteRequestData \};/);

console.log('book request data tests passed');
