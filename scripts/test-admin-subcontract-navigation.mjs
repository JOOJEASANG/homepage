import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nav = fs.readFileSync(path.join(root, 'assets/js/admin-quote-navigation.js'), 'utf8');
const calc = fs.readFileSync(path.join(root, 'assets/js/book-admin-subcontract-calculator.js'), 'utf8');
const session = fs.readFileSync(path.join(root, 'assets/js/session.js'), 'utf8');

const prices = await import(pathToFileURL(path.join(root, 'assets/js/pages/shared/subcontract-discount.js')).href);
assert.equal(prices.DEFAULT_SUBCONTRACT_PERCENT, 25);
assert.deepEqual(prices.SUBCONTRACT_PERCENT_OPTIONS, [25, 20]);
assert.deepEqual(prices.calculateSubcontractDiscount(100000, 25),
  { original: 100000, percent: 25, total: 75000, discountAmount: 25000 });
assert.deepEqual(prices.calculateSubcontractDiscount(100000, 20),
  { original: 100000, percent: 20, total: 80000, discountAmount: 20000 });
assert.equal(prices.calculateSubcontractDiscount(100000).total, 75000, 'default remains 25%');
assert.equal(prices.calculateSubcontractDiscount(100000, 99).total, 75000, 'unsupported rate falls back to 25%');
assert.equal(prices.calculateSubcontractDiscount(112345, 20).total, 89800, 'retains 100-won floor');
assert.equal(prices.calculateSubcontractDiscount(112345, 25).total, 84200, 'retains 100-won floor');

assert.match(nav, /quote-book\.html/);
assert.match(nav, /quote-print\.html/);
assert.match(nav, /adminPricing/);
assert.match(nav, /관리자 계산 모드/);
assert.match(nav, /book-admin-subcontract-calculator\.js/);
assert.match(nav, /admin-book-quote-shortcut/);
assert.match(nav, /admin-print-quote-shortcut/);
assert.match(nav, /admin-mobile-quote-shortcuts/);
assert.match(nav, /책자\/제본/);
assert.match(nav, /디지털출력/);
assert.match(nav, /normalizeDigitalOutputLabels/);
assert.match(nav, /디지털인쇄/);
assert.match(nav, /디지털 인쇄/);

assert.match(calc, /Firebase users\/\{uid\}\.role === 'admin'/);
assert.match(calc, /admin-subcontract-enabled/);
assert.match(calc, /admin-subcontract-percent/);
assert.match(calc, /25% 할인/);
assert.match(calc, /20% 할인/);
assert.match(calc, /quote-book\.html/);
assert.match(calc, /quote-print\.html/);
assert.match(nav, /하청 20%·25% 비교/);
assert.match(calc, /calculateSubcontractDiscount\(getCurrentQuoteTotal\(\), selectedPercent\)/);
assert.doesNotMatch(calc, /setDoc|updateDoc|addDoc/);

assert.match(session, /admin-quote-navigation\.js/);

console.log('admin subcontract navigation and shortcut contract passed');
