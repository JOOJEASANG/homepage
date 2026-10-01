import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (name) => import(pathToFileURL(path.join(root, 'assets/js/pages/quote-book', name)).href);

const contact = await mod('contact-utils.js');
assert.equal(contact.normalizeContactDigits('010-1234-5678'), '01012345678');
assert.equal(contact.formatPhoneHyphen('01012345678'), '010-1234-5678');
assert.equal(contact.formatContact('0212345678'), '021-234-5678');
assert.equal(contact.pickContactFromUserData({ profile: { mobile: '010-2222-3333' } }), '01022223333');
assert.match(contact.sha256HexSync('abc'), /^[0-9a-f]{64}$/);

const preview = await mod('preview-utils.js');
assert.equal(preview.getPreviewUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
assert.equal(preview.getPreviewUrl({ downloadURL: 'https://example.com/b.jpg' }), 'https://example.com/b.jpg');
assert.equal(preview.getPreviewUrl({ meta: { url: 'https://example.com/c.jpg' } }), 'https://example.com/c.jpg');
assert.equal(preview.inferInnerGroup('snow150'), 'premium');
assert.equal(preview.inferInnerGroup('mimoon80'), 'general');

const ids = await mod('quote-id.js');
assert.match(await ids.generateBookReceiptNo(), /^Q\d{8}-\d{9}$/);

const templates = await mod('quote-item-template.js');
const itemHtml = templates.renderQuoteItemTemplate({ quoteItemCounter: 2, designPrice: 10000, oshiPrice: 500 });
assert.ok(itemHtml.includes('quote-item-header'));
assert.ok(itemHtml.includes('10,000원'));
assert.ok(itemHtml.includes('500원/부'));
const innerHtml = templates.renderInnerSectionTemplate({ sectionCount: 1 });
assert.ok(innerHtml.includes('remove-inner-section-btn'));
assert.ok(innerHtml.includes('innerPaperType'));

const storageSource = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book/quote-storage.js'), 'utf8');
assert.match(storageSource, /export function getBookTempStorageKey/);
assert.match(storageSource, /export function readLastQuoteCache/);

const quoteSource = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book.js'), 'utf8');
for (const importName of ['contact-utils.js', 'preview-utils.js', 'preview-ui.js', 'quote-storage.js', 'quote-item-template.js', 'quote-id.js']) {
  assert.ok(quoteSource.includes(importName), `missing module import: ${importName}`);
}
for (const removed of ['function getPreviewUrl(val)', 'function sha256HexSync(str)', 'function pickContactFromUserData(userData)', 'newItem.innerHTML = `', 'newSection.innerHTML = `']) {
  assert.ok(!quoteSource.includes(removed), `extracted code still inline: ${removed}`);
}
for (const critical of ['function calculateQuote()', 'async function submitQuoteRequest(', 'async function initializePage(']) {
  assert.ok(quoteSource.includes(critical), `critical orchestration missing: ${critical}`);
}
assert.ok(quoteSource.includes('renderQuoteItemTemplate({ quoteItemCounter, designPrice, oshiPrice })'));
assert.ok(quoteSource.includes('renderInnerSectionTemplate({ sectionCount })'));

// A5 70% 정책/관리자 하청 계산기 연결 회귀 검사
const a5Source = fs.readFileSync(path.join(root, 'assets/js/book-a5-size.js'), 'utf8');
assert.match(a5Source, /A5_FIXED_MULTIPLIER = 0\.70/);
assert.match(a5Source, /book-a5-display-fix\.js/);
assert.match(a5Source, /book-admin-subcontract-calculator\.js/);

const subcontractPath = path.join(root, 'assets/js/book-admin-subcontract-calculator.js');
const subcontractSource = fs.readFileSync(subcontractPath, 'utf8');
assert.match(subcontractSource, /DEFAULT_DISCOUNT_PERCENT = 20/);
assert.match(subcontractSource, /하청업체 적용금액/);
assert.match(subcontractSource, /고객에게 표시되는 견적 및 저장되는 최종금액은 변경하지 않습니다/);
assert.doesNotMatch(subcontractSource, /setDoc|updateDoc|addDoc/, '하청 보조 계산기는 Firestore 견적을 수정하면 안 됨');

const displayFixPath = path.join(root, 'assets/js/book-a5-display-fix.js');
const displayFixSource = fs.readFileSync(displayFixPath, 'utf8');
assert.match(displayFixSource, /A5_DISPLAY_MULTIPLIER = 0\.70/);
assert.match(displayFixSource, /A5 전체 금액 · A4 기준 70% 일괄 적용/);

for (const file of [subcontractPath, displayFixPath, path.join(root, 'assets/js/book-a5-size.js')]) {
  const checkPath = path.join(os.tmpdir(), `book-ui-check-${process.pid}-${path.basename(file)}.mjs`);
  try {
    fs.writeFileSync(checkPath, fs.readFileSync(file, 'utf8'), 'utf8');
    execFileSync(process.execPath, ['--check', checkPath], { stdio: 'pipe' });
  } finally {
    try { fs.unlinkSync(checkPath); } catch (_) {}
  }
}

console.log('book UI/template/contact/storage module regression tests passed');
