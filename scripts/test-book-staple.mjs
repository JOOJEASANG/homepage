import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countStapleSheetsPerCopy, canStapleSheets, normalizeStapleSelection, STAPLE_MAX_SHEETS_PER_COPY, STAPLE_POSITIONS } from '../assets/js/pages/quote-book/staple-utils.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(STAPLE_MAX_SHEETS_PER_COPY, 50);
assert.deepEqual(Object.values(STAPLE_POSITIONS), ['세로좌상', '가로좌상']);

for (const [pages, mode, expectedSheets, allowed] of [
  [50, 'bw_simplex', 50, true],
  [51, 'bw_simplex', 51, false],
  [100, 'bw_duplex', 50, true],
  [101, 'bw_duplex', 51, false],
  [100, 'color_duplex', 50, true],
  [101, 'color_duplex', 51, false],
]) {
  const sheets = countStapleSheetsPerCopy([{ pages, printType: mode }]);
  assert.equal(sheets, expectedSheets);
  assert.equal(canStapleSheets(sheets), allowed);
  const state = normalizeStapleSelection({ bindingType: 'none', enabled: true, position: 'portrait-upper-left', sheets });
  assert.equal(state.enabled, allowed);
  assert.equal(state.position, allowed ? 'portrait-upper-left' : '');
}
const mixed = [{ pages: 21, printType: 'bw_simplex' }, { pages: 58, printType: 'color_duplex' }];
assert.equal(countStapleSheetsPerCopy(mixed), 50);
assert.equal(countStapleSheetsPerCopy([...mixed, { pages: 1, printType: 'bw_simplex' }]), 51);
assert.equal(countStapleSheetsPerCopy([{ pages: 101, printType: 'bw_duplex' }]), 51);
assert.equal(countStapleSheetsPerCopy([{ pages: 100, printType: 'bw_duplex' }], 1), 51, 'one additional insert sheet exceeds limit');
assert.equal(countStapleSheetsPerCopy([{ pages: 100, printType: 'bw_duplex' }], 1, true), 51, 'included insert still occupies physical sheet');
assert.equal(countStapleSheetsPerCopy([{ pages: 100, printType: 'bw_duplex' }], 0), 50);
assert.equal(normalizeStapleSelection({ bindingType: '', enabled: true, position: 'portrait-upper-left', sheets: 3 }).enabled, false);
assert.equal(normalizeStapleSelection({ bindingType: 'wire', enabled: true, position: 'portrait-upper-left', sheets: 3 }).enabled, false);
assert.equal(normalizeStapleSelection({ bindingType: 'none', enabled: true, position: 'landscape-upper-left', sheets: 50 }).position, 'landscape-upper-left');
assert.equal(normalizeStapleSelection({ bindingType: 'none', enabled: false, position: 'landscape-upper-left', sheets: 50 }).position, '');

const template = readFileSync(path.join(root, 'assets/js/pages/quote-book/quote-item-template.js'), 'utf8');
assert.match(template, /class="bindingType" value=""/, 'new quotes default to no binding');
assert.doesNotMatch(template, /class="option-card selected" data-value="none"/);
for (const text of ['세로좌상', '가로좌상', 'stapleEnabled', 'staple-sheet-count']) assert.ok(template.includes(text));

const source = readFileSync(path.join(root, 'assets/js/pages/quote-book.js'), 'utf8');
for(const str of ['refreshStapleAvailability(itemEl)', 'countStapleSheetsPerCopy(sections, interleafSheets, includeInterleaf)',
  "itemEl.querySelector('.stapleEnabled').checked", 'missingStaplePosition', "if (bindingType && bindingType !== 'none')"]) assert.ok(source.includes(str), 'missing integration ' + str);
console.log('Staple 50-sheet print count, 51/101 page cutoff and binding selection tests passed');
