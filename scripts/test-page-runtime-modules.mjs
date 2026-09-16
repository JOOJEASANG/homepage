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

const fixed = new Date(2026, 8, 16, 15, 12, 9);
assert.equal(
  utils.createReceiptNo({ date: fixed, random: () => 0.123 }),
  'Q20260916-151209-123',
);

const session = fs.readFileSync(path.join(root, 'assets', 'js', 'session.js'), 'utf8');
const printRuntime = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'quote-print', 'runtime.js'), 'utf8');
const mypageRuntime = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'mypage', 'runtime.js'), 'utf8');
const adminRuntime = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'admin', 'runtime.js'), 'utf8');

for (const [file, importPath] of [
  ['quote-print', "./pages/quote-print/runtime.js"],
  ['mypage', "./pages/mypage/runtime.js"],
  ['admin', "./pages/admin/runtime.js"],
]) {
  assert.ok(session.includes(importPath), `session must route ${file} through ${importPath}`);
}

for (const legacyImport of [
  "import('./customer-center-admin-menu.js')",
  "import('./portfolio-crop-helper.js')",
  "import('./admin-safety-patches.js')",
]) {
  assert.ok(!session.includes(legacyImport), `session should not directly load ${legacyImport}`);
}

assert.ok(printRuntime.includes("from '../shared/page-utils.js'"));
assert.ok(printRuntime.includes('export function serializePrintDraft'));
assert.ok(printRuntime.includes('export function generatePrintReceiptNo'));
assert.ok(mypageRuntime.includes("from '../shared/page-utils.js'"));
assert.ok(mypageRuntime.includes('export function getQuoteStatusMeta'));
assert.ok(adminRuntime.includes("from '../shared/page-utils.js'"));
assert.ok(adminRuntime.includes("import '../../admin-safety-patches.js'"));
assert.ok(adminRuntime.includes('export function getAdminQuoteStatusMeta'));

console.log('Shared page utilities and runtime module checks passed');
