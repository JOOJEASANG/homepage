import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
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

console.log('saddle-calculator tests passed');
