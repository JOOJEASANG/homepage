import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(root, 'assets/js/pages/quote-book/perfect-calculator.js');
const source = fs.readFileSync(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const perfect = await import(moduleUrl);

assert.equal(
  perfect.getPerfectInnerPricingMultiplier({
    sectionSizeValue: 'a5',
    normalSizeMultiplier: 0.85,
    isColorPrint: false,
  }),
  0.70,
  'A5 무선제본 내지는 기존 정책대로 70% 배율'
);
assert.equal(
  perfect.getPerfectInnerPricingMultiplier({
    sectionSizeValue: '0.9',
    normalSizeMultiplier: 0.9,
    isColorPrint: true,
  }),
  1,
  'B5 컬러 내지는 기존 정책대로 A4와 동일한 100%'
);
assert.equal(
  perfect.getPerfectInnerPricingMultiplier({
    sectionSizeValue: '0.9',
    normalSizeMultiplier: 0.9,
    isColorPrint: false,
  }),
  0.9,
  'B5 흑백은 기존 90% 배율 유지'
);
assert.equal(
  perfect.getPerfectInnerPricingMultiplier({
    sectionSizeValue: '1',
    normalSizeMultiplier: 1,
    isColorPrint: false,
  }),
  1,
  'A4는 기본 100% 배율'
);

assert.equal(
  perfect.getPerfectBindingPageCount({
    totalInnerPagesSpecified: 80,
    interleafSheets: 4,
    includeInterleafInTotal: true,
  }),
  80,
  '간지가 전체 페이지에 포함되면 제본 페이지 수에 다시 더하지 않음'
);
assert.equal(
  perfect.getPerfectBindingPageCount({
    totalInnerPagesSpecified: 80,
    interleafSheets: 4,
    includeInterleafInTotal: false,
  }),
  84,
  '추가 간지는 제본 페이지 수에 더함'
);

assert.equal(perfect.getPerfectBindingSizeMultiplier(0.85), 1, 'A5 제본비 배율은 1');
assert.equal(perfect.getPerfectBindingSizeMultiplier(0.9), 1, 'B5 제본비 배율은 1');
assert.equal(perfect.getPerfectBindingSizeMultiplier(1), 1, 'A4 제본비 배율은 1');
assert.equal(perfect.getPerfectBindingSizeMultiplier(1.8), 1.8, 'B4 제본비 배율은 1.8');
assert.equal(perfect.getPerfectBindingSizeMultiplier(2), 2, 'A3 제본비 배율은 2');

assert.deepEqual(
  perfect.getPerfectBindingMetrics({
    totalInnerPagesSpecified: 120,
    interleafSheets: 8,
    includeInterleafInTotal: false,
    itemSizeMultiplier: 1.8,
  }),
  { actualTotalPages: 128, sizeMultiplier: 1.8 },
  '무선제본 제본비 핵심 값 계산'
);

const quoteBookPath = path.join(root, 'assets/js/pages/quote-book.js');
const quoteBookSource = fs.readFileSync(quoteBookPath, 'utf8');

assert.match(
  quoteBookSource,
  /import \{ getPerfectInnerPricingMultiplier, getPerfectBindingMetrics \} from "\.\/quote-book\/perfect-calculator\.js";/,
  'quote-book.js가 무선제본 계산 모듈을 import해야 함'
);
assert.match(
  quoteBookSource,
  /selectedBindingType === 'perfect'\s*\? getPerfectInnerPricingMultiplier\(/,
  '무선제본 내지 배율은 분리 모듈을 사용해야 함'
);
assert.match(
  quoteBookSource,
  /bindingType === 'perfect'\s*\? getPerfectBindingMetrics\(/,
  '무선제본 제본 페이지수/배율은 분리 모듈을 사용해야 함'
);
assert.doesNotMatch(
  quoteBookSource,
  /selectedBindingType === 'perfect' \|\| selectedBindingType === 'wire'/,
  'A5 70% 하드코딩에서 perfect와 wire를 함께 처리하지 않아야 함'
);
assert.match(
  quoteBookSource,
  /selectedBindingType === 'wire' \? 0\.70 : normalSizeMultiplier/,
  '와이어 A5 70% 경로는 이번 작업에서 그대로 유지해야 함'
);
assert.match(
  quoteBookSource,
  /const bindingTiers = priceConfig\.binding\[bindingType\] \|\| \[\];/,
  '관리자 제본 단가표 경로는 그대로 유지되어야 함'
);

const syntaxPath = path.join(os.tmpdir(), `quote-book-perfect-syntax-${process.pid}.mjs`);
try {
  fs.writeFileSync(syntaxPath, quoteBookSource, 'utf8');
  execFileSync(process.execPath, ['--check', syntaxPath], { stdio: 'pipe' });
} finally {
  try { fs.unlinkSync(syntaxPath); } catch (_) {}
}

console.log('perfect-calculator and quote-book integration tests passed');
