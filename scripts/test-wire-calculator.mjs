import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(root, 'assets/js/pages/quote-book/wire-calculator.js');
const wire = await import(pathToFileURL(modulePath).href);

assert.equal(wire.getWireCoverCost(10000), 5000, '와이어 표지비는 1/2');
assert.equal(wire.getWireCoverCost(0), 0, '표지비 0원은 그대로 0');

assert.equal(
  wire.getWireInnerPricingMultiplier({ sectionSizeValue: 'a5', normalSizeMultiplier: 0.85, isColorPrint: false }),
  0.70,
  'A5 와이어 내지는 기존 70% 배율'
);
assert.equal(
  wire.getWireInnerPricingMultiplier({ sectionSizeValue: '0.9', normalSizeMultiplier: 0.9, isColorPrint: true }),
  1,
  'B5 컬러는 기존 100% 배율'
);
assert.equal(
  wire.getWireInnerPricingMultiplier({ sectionSizeValue: '0.9', normalSizeMultiplier: 0.9, isColorPrint: false }),
  0.9,
  'B5 흑백은 기존 90% 배율'
);

assert.equal(wire.isWireBindingAllowed(450), true, '450p는 와이어 가능');
assert.equal(wire.isWireBindingAllowed(451), false, '451p는 와이어 제한');

assert.equal(
  wire.getWireBindingPageCount({ totalInnerPagesSpecified: 200, interleafSheets: 10, includeInterleafInTotal: true }),
  200,
  '간지 포함이면 제본 페이지에 중복 합산하지 않음'
);
assert.equal(
  wire.getWireBindingPageCount({ totalInnerPagesSpecified: 200, interleafSheets: 10, includeInterleafInTotal: false }),
  210,
  '추가 간지는 제본 페이지에 합산'
);

assert.equal(wire.getWireBindingSizeMultiplier(0.85), 1, 'A5 제본 배율은 1');
assert.equal(wire.getWireBindingSizeMultiplier(0.9), 1, 'B5 제본 배율은 1');
assert.equal(wire.getWireBindingSizeMultiplier(1.8), 1.8, 'B4 제본 배율은 1.8');
assert.equal(wire.getWireBindingSizeMultiplier(2), 2, 'A3 제본 배율은 2');

assert.deepEqual(
  wire.getWireBindingMetrics({
    totalInnerPagesSpecified: 300,
    interleafSheets: 6,
    includeInterleafInTotal: false,
    itemSizeMultiplier: 1.8,
  }),
  { actualTotalPages: 306, sizeMultiplier: 1.8 },
  '와이어 제본비 핵심 값 계산'
);

const quoteBookPath = path.join(root, 'assets/js/pages/quote-book.js');
const quoteBookSource = fs.readFileSync(quoteBookPath, 'utf8');

assert.match(
  quoteBookSource,
  /import \{ getWireCoverCost, getWireInnerPricingMultiplier, getWireBindingMetrics, isWireBindingAllowed \} from "\.\/quote-book\/wire-calculator\.js";/,
  'quote-book.js가 와이어 계산 모듈을 import해야 함'
);
assert.match(
  quoteBookSource,
  /if \(wireOption\) wireOption\.classList\.toggle\('disabled', !isWireBindingAllowed\(totalInnerPages\)\);/,
  '와이어 450p 제한은 분리 모듈을 사용해야 함'
);
assert.match(
  quoteBookSource,
  /selectedBindingType === 'wire'\) totalCoverCost = getWireCoverCost\(totalCoverCost\);/,
  '와이어 표지비 1/2 처리는 분리 모듈을 사용해야 함'
);
assert.match(
  quoteBookSource,
  /selectedBindingType === 'wire'\s*\? getWireInnerPricingMultiplier\(/,
  '와이어 내지 배율은 분리 모듈을 사용해야 함'
);
assert.match(
  quoteBookSource,
  /bindingType === 'wire'\s*\? getWireBindingMetrics\(/,
  '와이어 제본 페이지수/배율은 분리 모듈을 사용해야 함'
);
assert.doesNotMatch(
  quoteBookSource,
  /if \(itemEl\.querySelector\('\.bindingType'\)\.value === 'wire'\) totalCoverCost \/= 2;/,
  '기존 와이어 표지비 인라인 1/2 처리는 제거되어야 함'
);
assert.doesNotMatch(
  quoteBookSource,
  /selectedBindingType === 'wire' \? 0\.70 : normalSizeMultiplier/,
  '기존 와이어 A5 70% 인라인 처리는 제거되어야 함'
);
assert.match(
  quoteBookSource,
  /getPerfectInnerPricingMultiplier/,
  '무선제본 모듈 연결은 유지되어야 함'
);
assert.match(
  quoteBookSource,
  /getSaddleSectionMetrics/,
  '중철 모듈 연결은 유지되어야 함'
);
assert.match(
  quoteBookSource,
  /const bindingTiers = priceConfig\.binding\[bindingType\] \|\| \[\];/,
  '관리자 제본 단가표 경로는 유지되어야 함'
);

const syntaxPath = path.join(os.tmpdir(), `quote-book-wire-syntax-${process.pid}.mjs`);
try {
  fs.writeFileSync(syntaxPath, quoteBookSource, 'utf8');
  execFileSync(process.execPath, ['--check', syntaxPath], { stdio: 'pipe' });
} finally {
  try { fs.unlinkSync(syntaxPath); } catch (_) {}
}

console.log('wire-calculator and quote-book integration tests passed');
