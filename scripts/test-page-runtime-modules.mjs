import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const utilsPath = path.join(root, 'assets', 'js', 'pages', 'shared', 'page-utils.js');
const utils = await import(pathToFileURL(utilsPath).href);

assert.equal(utils.phoneDigits('010-1234-5678'), '01012345678');
assert.equal(utils.formatPhoneHyphen('01012345678'), '010-1234-5678');
assert.equal(utils.formatPhoneHyphen('0101234567'), '010-123-4567');
assert.equal(utils.quoteStatusKind('제작 진행중'), 'progress');
assert.equal(utils.quoteStatusKind('출고완료'), 'done');
assert.equal(utils.quoteStatusKind('취소 요청'), 'cancelled');
assert.equal(utils.quoteStatusKind('접수완료'), 'waiting');
assert.equal(utils.formatQuoteStatus('  제작   진행  '), '제작 진행');

// 디지털출력 단가표는 부가세 포함 가격이므로 고객에게 표시되는 총액을 보존합니다.
const vatPrint = await import(pathToFileURL(path.join(root, 'assets/js/pages/quote-print/vat-calculator.js')).href);
for (const [raw, expected] of [
  [30000, 30000],
  [29999.999999999996, 30000],
  [29999.999999, 30000],
  [33000, 33000],
  [18000, 18000],
  [12349.99, 12340],
  [0, 0],
]) {
  const result = vatPrint.calculateVatIncludedPrintTotal(raw);
  assert.equal(result.total, expected, 'digital print VAT-inclusive total must not lose 10 won');
  assert.equal(result.supply + result.vat, result.total, 'supply and VAT must add up to final price');
}
assert.deepEqual(vatPrint.calculateVatIncludedPrintTotal(30000),
  { supply: 27273, vat: 2727, total: 30000 });

const fixed = new Date(2026, 8, 16, 15, 12, 9);
assert.equal(
  utils.createReceiptNo({ date: fixed, random: () => 0.123 }),
  'Q20260916-151209-123',
);

const session = fs.readFileSync(path.join(root, 'assets', 'js', 'session.js'), 'utf8');
const header = fs.readFileSync(path.join(root, 'assets', 'js', 'header.js'), 'utf8');
const printRuntime = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'quote-print', 'runtime.js'), 'utf8');
const quotePrintPage = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'quote-print.js'), 'utf8');
const vatLabelPatch = fs.readFileSync(path.join(root, 'assets', 'js', 'print-vat-included-patch.js'), 'utf8');
assert.ok(!vatLabelPatch.includes('window.cut10 ='), 'do not monkey-patch global ten-won rounding');

const quoteBookPage = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'quote-book.js'), 'utf8');
const adminPage = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'admin.js'), 'utf8');
const mypageRuntime = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'mypage', 'runtime.js'), 'utf8');
const adminRuntime = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'admin', 'runtime.js'), 'utf8');
const chatReceipts = fs.readFileSync(path.join(root, 'assets', 'js', 'chat-read-receipts.js'), 'utf8');

for (const [file, importPath] of [
  ['quote-print', "./pages/quote-print/runtime.js"],
  ['mypage', "./pages/mypage/runtime.js"],
  ['admin', "./pages/admin/runtime.js"],
]) {
  assert.ok(session.includes(importPath), `session must route ${file} through ${importPath}`);
}

for (const legacyImport of [
  "import('./customer-center-admin-menu.js')",
  "import('./admin-safety-patches.js')",
]) {
  assert.ok(!session.includes(legacyImport), `session should not directly load ${legacyImport}`);
}

assert.ok(quotePrintPage.includes('calculateVatIncludedPrintTotal(totalRaw)'), 'main quote calculator must use the VAT-inclusive helper');
assert.ok(quotePrintPage.includes('const totalRaw = supplyRaw;'), 'do not add VAT twice to inclusive prices');
assert.ok(printRuntime.includes("from '../shared/page-utils.js'"));
assert.ok(printRuntime.includes('export function serializePrintDraft'));
assert.ok(printRuntime.includes('export function generatePrintReceiptNo'));
assert.ok(mypageRuntime.includes("from '../shared/page-utils.js'"));
assert.ok(mypageRuntime.includes("import '../../chat-read-receipts.js'"), 'mypage runtime must load chat read receipts');
assert.ok(mypageRuntime.includes('export function getQuoteStatusMeta'));
assert.ok(adminRuntime.includes("from '../shared/page-utils.js'"));
assert.ok(adminRuntime.includes("import '../../admin-safety-patches.js'"));
assert.ok(adminRuntime.includes("import '../../chat-read-receipts.js'"), 'admin runtime must load chat read receipts');
assert.ok(adminRuntime.includes('export function getAdminQuoteStatusMeta'));

// 관리자 견적 수정 저장 뒤에는 접수관리로, 고객 수정/신규 접수는 기존 마이페이지로 이동합니다.
const { resolveQuoteSaveDestination } = await import(
  pathToFileURL(path.join(root, 'assets', 'js', 'pages', 'shared', 'quote-save-redirect.js')).href
);
for (const [options, expected] of [
  [{ adminEdit: true, editingExisting: true, isGuest: false }, 'admin.html'],
  [{ adminEdit: true, editingExisting: true, isGuest: true }, 'admin.html'],
  [{ adminEdit: false, editingExisting: true, isGuest: false }, 'mypage.html'],
  [{ adminEdit: false, editingExisting: true, isGuest: true }, 'mypage.html?guest=1'],
  [{ adminEdit: false, editingExisting: false, isGuest: false }, 'mypage.html'],
  [{ adminEdit: false, editingExisting: false, isGuest: true }, 'mypage.html?guest=1'],
  [{ adminEdit: true, editingExisting: false, isGuest: true }, 'mypage.html?guest=1'],
]) {
  assert.equal(resolveQuoteSaveDestination(options), expected);
}
for (const [source, label] of [[quoteBookPage, 'book'], [quotePrintPage, 'print']]) {
  for (const expected of [
    'import { resolveQuoteSaveDestination } from "./shared/quote-save-redirect.js";',
    'const destination = resolveQuoteSaveDestination({',
    'adminEdit: editState.adminEdit,',
    'editingExisting: editState.enabled && !!editState.quoteId,',
  ]) {
    assert.ok(source.includes(expected), 'missing ' + label + ' quote redirect flow: ' + expected);
  }
}

// 디지털출력 단가가 Firestore에서 도착하기 전에는 "단가 없음"으로 오인하지 않습니다.
for (const expected of [
  'let unitPriceConfigReady = false',
  'let unitPriceConfigError = null',
  'if (!unitPriceConfigReady)',
  '단가 정보를 불러오는 중입니다.',
  "잠시 후 '재계산' 버튼을 눌러주세요.",
]) {
  assert.ok(quotePrintPage.includes(expected), `quote-print price loading contract missing: ${expected}`);
}

// 실제 관리자 접수 목록 렌더러가 연락처 바로가기 링크를 생성하는지 고정합니다.
for (const expected of [
  'normalizePhoneLink(getCustomerContactRaw(q))',
  'class="mobile-contact-action mobile-contact-action-call"',
  'href="tel:${sanitizeHTML(phoneLink)}"',
  'class="mobile-contact-action mobile-contact-action-message"',
  'href="sms:${sanitizeHTML(phoneLink)}"',
]) {
  assert.ok(adminPage.includes(expected), `admin contact action contract missing: ${expected}`);
}

for (const expected of [
  'readByCustomer: true',
  'readByCustomerAt: readAt',
  'hasUnreadCustomerMessage: false',
  'data-customer-read-receipt="1"',
  "'읽음' : '안읽음'",
  'hasLaterCustomerReply',
  'customerReadQueued',
  'removeLegacyReceiptLabels',
  "event.target?.id !== 'chat-form'",
]) {
  assert.ok(chatReceipts.includes(expected), `chat read receipt contract missing: ${expected}`);
}

// Firebase CDN 초기화 성공 여부와 무관하게 공통 헤더의 접근성/모바일 탐색 계약을 고정합니다.
for (const expected of [
  'id="btn-mobile-menu"',
  'aria-label="메뉴 열기"',
  'aria-label="그린오피스 홈"',
  'id="mobile-menu"',
  'mobileMenu?.classList.toggle("hidden")',
]) {
  assert.ok(header.includes(expected), `header navigation contract missing: ${expected}`);
}
for (const href of ['quote-book.html', 'quote-print.html', 'qna.html', 'work-guide.html']) {
  assert.ok(header.includes(href), `header navigation destination missing: ${href}`);
}

console.log('Shared page utilities, admin quote redirects, runtime modules, chat receipts, and header navigation contract checks passed');
