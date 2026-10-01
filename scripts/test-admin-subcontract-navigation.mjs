import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nav = fs.readFileSync(path.join(root, 'assets/js/admin-quote-navigation.js'), 'utf8');
const calc = fs.readFileSync(path.join(root, 'assets/js/book-admin-subcontract-calculator.js'), 'utf8');
const session = fs.readFileSync(path.join(root, 'assets/js/session.js'), 'utf8');

assert.match(nav, /quote-book\.html/);
assert.match(nav, /quote-print\.html/);
assert.match(nav, /adminPricing/);
assert.match(nav, /관리자 계산 모드/);
assert.match(nav, /book-admin-subcontract-calculator\.js/);

assert.match(calc, /SUBCONTRACT_DISCOUNT_PERCENT = 20/);
assert.match(calc, /Firebase users\/\{uid\}\.role === 'admin'/);
assert.match(calc, /admin-subcontract-enabled/);
assert.match(calc, /하청업체 20% 할인 적용/);
assert.match(calc, /quote-book\.html/);
assert.match(calc, /quote-print\.html/);
assert.doesNotMatch(calc, /setDoc|updateDoc|addDoc/);

assert.match(session, /admin-quote-navigation\.js/);

console.log('admin subcontract navigation contract passed');
