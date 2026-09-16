import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(root, 'assets/js/pages/quote-book/calculator-utils.js');
const source = fs.readFileSync(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const utils = await import(moduleUrl);

// 일반 단가표: 높은 threshold부터 기존 정책대로 선택
const priceTiers = [
  { threshold: 1, price: 100 },
  { threshold: 50, price: 80 },
  { threshold: 100, price: 70 },
];
assert.equal(utils.findPriceTier(priceTiers, 120), 70, '100 이상 단가 선택');
assert.equal(utils.findPriceTier(priceTiers, 75), 80, '50 이상 단가 선택');
assert.equal(utils.findPriceTier(priceTiers, 10), 100, '1 이상 단가 선택');
assert.equal(utils.findPriceTier([], 100), 0, '빈 단가표는 0');
assert.deepEqual(
  priceTiers,
  [
    { threshold: 1, price: 100 },
    { threshold: 50, price: 80 },
    { threshold: 100, price: 70 },
  ],
  '단가 조회 과정에서 관리자 단가표 원본 순서를 변경하지 않아야 함'
);

// 제본 단가표: pageThreshold 오름차순 + 동일 페이지 구간에서 qtyThreshold 내림차순
const bindingTiers = [
  { pageThreshold: 40, pageOperator: 'lte', qtyThreshold: 1, qtyOperator: 'gte', price: 500 },
  { pageThreshold: 40, pageOperator: 'lte', qtyThreshold: 100, qtyOperator: 'gte', price: 300 },
  { pageThreshold: 100, pageOperator: 'lte', qtyThreshold: 1, qtyOperator: 'gte', price: 700 },
];
assert.equal(utils.findBindingPriceTier(bindingTiers, 150, 30), 300, '40p 이하 100부 이상 구간');
assert.equal(utils.findBindingPriceTier(bindingTiers, 10, 30), 500, '40p 이하 기본 수량 구간');
assert.equal(utils.findBindingPriceTier(bindingTiers, 10, 80), 700, '100p 이하 구간');
assert.equal(utils.findBindingPriceTier([], 10, 80), 0, '빈 제본 단가표는 0');

// 금액 절삭과 대형 규격 배율은 기존 계산과 동일해야 함
assert.equal(utils.floorToHundred(1234), 1200, '1234원은 1200원으로 절삭');
assert.equal(utils.floorToHundred(100), 100, '100원은 유지');
assert.equal(utils.floorToHundred(99), 0, '100원 미만은 0원으로 절삭');
assert.equal(utils.getLargeSizeMultiplier(0.85), 1, 'A5 계열 표지/제본 배율은 1');
assert.equal(utils.getLargeSizeMultiplier(0.9), 1, 'B5 계열 표지/제본 배율은 1');
assert.equal(utils.getLargeSizeMultiplier(1), 1, 'A4 배율은 1');
assert.equal(utils.getLargeSizeMultiplier(1.8), 1.8, 'B4 배율은 1.8');
assert.equal(utils.getLargeSizeMultiplier(2), 2, 'A3 배율은 2');
assert.equal(utils.getLargeSizeMultiplier(Number.NaN), 1, '잘못된 배율은 기존 삼항식과 동일하게 1');

const quoteBookPath = path.join(root, 'assets/js/pages/quote-book.js');
const quoteBookSource = fs.readFileSync(quoteBookPath, 'utf8');

assert.match(
  quoteBookSource,
  /import \{ findPriceTier, findBindingPriceTier, floorToHundred, getLargeSizeMultiplier \} from "\.\/quote-book\/calculator-utils\.js";/,
  'quote-book.js가 공통 계산 유틸을 import해야 함'
);
assert.doesNotMatch(quoteBookSource, /function findPriceTier\(/, 'findPriceTier 로컬 구현은 제거되어야 함');
assert.doesNotMatch(quoteBookSource, /function findBindingPriceTier\(/, 'findBindingPriceTier 로컬 구현은 제거되어야 함');
assert.match(
  quoteBookSource,
  /const largeSizeMultiplier = getLargeSizeMultiplier\(itemSizeMultiplier\);/,
  '표지/제본 규격 배율은 공통 유틸을 사용해야 함'
);

for (const expected of [
  'totalCoverCost = floorToHundred(totalCoverCost);',
  'const sectionCost = floorToHundred(sectionCostRaw);',
  'totalInterleafCost = floorToHundred(interleafUnitPrice * totalInterleafSheets);',
  'bindingCost = floorToHundred(bindingUnitPrice * quantity);',
  'etcDesignCost = floorToHundred(priceConfig.etc.coverDesign || 0);',
  'etcOshiCost = floorToHundred((priceConfig.etc.coverOshi || 0) * quantity);',
]) {
  assert.ok(quoteBookSource.includes(expected), `100원 절삭 공통화 누락: ${expected}`);
}

assert.match(
  quoteBookSource,
  /const bindingTiers = priceConfig\.binding\[bindingType\] \|\| \[\];/,
  '관리자 제본 단가표 경로는 그대로 유지되어야 함'
);
assert.match(quoteBookSource, /getSaddleSectionMetrics/, '중철 모듈 연결 유지');
assert.match(quoteBookSource, /getPerfectBindingMetrics/, '무선 모듈 연결 유지');
assert.match(quoteBookSource, /getWireBindingMetrics/, '와이어 모듈 연결 유지');

const syntaxPath = path.join(os.tmpdir(), `quote-book-utils-syntax-${process.pid}.mjs`);
try {
  fs.writeFileSync(syntaxPath, quoteBookSource, 'utf8');
  execFileSync(process.execPath, ['--check', syntaxPath], { stdio: 'pipe' });
} finally {
  try { fs.unlinkSync(syntaxPath); } catch (_) {}
}

console.log('book calculator common utils and quote-book integration tests passed');
