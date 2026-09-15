import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(root, 'assets/js/pages/quote-book/saddle-calculator.js');
const source = fs.readFileSync(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const saddle = await import(moduleUrl);

assert.equal(saddle.getSaddleSheetsPerCopy(4), 1, '4p는 1장');
assert.equal(saddle.getSaddleSheetsPerCopy(5), 2, '5p는 2장으로 올림');
assert.equal(saddle.getSaddleSheetsPerCopy(40), 10, '40p는 10장');
assert.equal(saddle.getSaddleTotalSheets(20, 50), 250, '20p × 50부는 250장');

assert.equal(saddle.isValidSaddlePageCount(20), true, '20p는 4의 배수');
assert.equal(saddle.isValidSaddlePageCount(18), false, '18p는 4의 배수가 아님');

assert.deepEqual(
  saddle.getSaddleOutputSpec('a5', 0.85),
  { outputSize: 'A4', outputMultiplier: 1 },
  'A5 중철은 A4 출력'
);
assert.deepEqual(
  saddle.getSaddleOutputSpec('0.9', 0.9),
  { outputSize: 'B4', outputMultiplier: 1.8 },
  'B5 중철은 B4 출력'
);
assert.deepEqual(
  saddle.getSaddleOutputSpec('1', 1),
  { outputSize: 'A3', outputMultiplier: 2 },
  'A4 중철은 A3 출력'
);
assert.deepEqual(
  saddle.getSaddleOutputSpec('1.8', 1.8),
  { outputSize: '기존 규격', outputMultiplier: 1.8 },
  '미정의 규격은 기존 배율 유지'
);

assert.deepEqual(
  saddle.getSaddleSectionMetrics({
    pages: 18,
    quantity: 3,
    sectionSizeValue: 'a5',
    fallbackMultiplier: 0.85,
  }),
  {
    pages: 18,
    sheetsPerCopy: 5,
    totalSheets: 15,
    outputSize: 'A4',
    outputMultiplier: 1,
    validPageMultiple: false,
  },
  '18p A5 중철 3부는 권당 5장, 총 15장'
);

// quote-book.js 연결 회귀 검사: 모듈 import, 중철 장수 기준, 기존 제본비 경로 보존.
const quoteBookPath = path.join(root, 'assets/js/pages/quote-book.js');
const quoteBookSource = fs.readFileSync(quoteBookPath, 'utf8');
assert.match(
  quoteBookSource,
  /import \{ getSaddleSectionMetrics \} from "\.\/quote-book\/saddle-calculator\.js";/,
  'quote-book.js가 중철 계산 모듈을 import해야 함'
);
assert.match(
  quoteBookSource,
  /const priceLookupQuantity = saddleMetrics \? saddleMetrics\.totalSheets : \(billablePages \* quantity\);/,
  '중철 단가 구간 조회는 실제 출력 장수를 사용해야 함'
);
assert.match(
  quoteBookSource,
  /const sectionUnits = saddleMetrics \? saddleMetrics\.totalSheets : \(billablePages \* quantity\);/,
  '중철 내지 비용은 실제 출력 장수를 사용해야 함'
);
assert.match(
  quoteBookSource,
  /const bindingTiers = priceConfig\.binding\[bindingType\] \|\| \[\];/,
  '관리자 제본 단가 경로는 유지되어야 함'
);
assert.doesNotMatch(
  quoteBookSource,
  /selectedBindingType === 'saddle' \? 0\.60/,
  '기존 A5 중철 60% 하드코딩은 제거되어야 함'
);

// 브라우저 실행 전 JS 문법 자체도 Node parser로 확인한다. import 대상은 실행하지 않는다.
const syntaxPath = path.join(os.tmpdir(), `quote-book-syntax-${process.pid}.mjs`);
try {
  fs.writeFileSync(syntaxPath, quoteBookSource, 'utf8');
  execFileSync(process.execPath, ['--check', syntaxPath], { stdio: 'pipe' });
} finally {
  try { fs.unlinkSync(syntaxPath); } catch (_) {}
}

console.log('saddle-calculator and quote-book integration tests passed');
