import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const formData = await import(pathToFileURL(path.join(root, 'assets/js/pages/quote-book/quote-form-data.js')).href);
const storage = await import(pathToFileURL(path.join(root, 'assets/js/pages/quote-book/quote-storage.js')).href);

function input(value, checked = false) { return { value, checked }; }
function makeInner({ paperSize = '1', paper = 'mimoon80', print = 'bw_duplex', pages = '50' } = {}) {
  const map = {
    '.paperSize': input(paperSize),
    '.innerPaperType': input(paper),
    '.innerPrintType': input(print),
    '.innerPages': input(pages),
  };
  return { querySelector: (sel) => map[sel] };
}
function makeItem({ interleafHidden = false, interleafSheets = '0' } = {}) {
  const interleaf = {
    classList: { contains: (name) => name === 'hidden' && interleafHidden },
    querySelector(sel) {
      return {
        '.interleafColor': input('sky'),
        '.interleafSheets': input(interleafSheets),
        '.includeInterleaf': input('', true),
      }[sel];
    },
  };
  const map = {
    '.orderName': input('자료집'),
    '.coverPaperType': input('snow200'),
    '.coverPrintType': input('color_simplex'),
    '.coverDesign': input('', true),
    '.coverOshi': input('', false),
    '.bindingType': input('perfect'),
    '.bindingDirection': input('portrait-left'),
    '.quantity': input('20'),
    '.remarks': input('요청사항'),
    '.interleaf-section': interleaf,
    '.interleafSheets': input(interleafSheets),
    '.interleafColor': input('sky'),
    '.includeInterleaf': input('', true),
  };
  const inners = [makeInner(), makeInner({ paperSize: '0.9', paper: 'baek100', pages: '20' })];
  return {
    querySelector: (sel) => map[sel],
    querySelectorAll: (sel) => sel === '.inner-section' ? inners : [],
  };
}

const visibleZero = makeItem({ interleafHidden: false, interleafSheets: '0' });
const draftZero = formData.serializeDraftQuoteItem(visibleZero);
assert.equal(draftZero.interleafSheets, '0', 'draft는 보이는 간지 0장을 문자열 그대로 보존');
assert.equal(draftZero.interleafColor, 'sky', 'draft는 간지 0장이어도 색상을 보존');
assert.equal(draftZero.includeInterleaf, true, 'draft는 간지 0장이어도 포함 체크를 보존');

const submitZero = formData.serializeSubmissionQuoteItem(visibleZero);
assert.equal(submitZero.interleafSheets, '0', 'submit은 기존처럼 보이는 간지 0장 값을 유지');
assert.equal('interleafColor' in submitZero, false, 'submit은 0장이면 색상 필드를 생략');
assert.equal('includeInterleaf' in submitZero, false, 'submit은 0장이면 포함 필드를 생략');

const hidden = makeItem({ interleafHidden: true, interleafSheets: '5' });
assert.equal(formData.serializeDraftQuoteItem(hidden).interleafSheets, 0, '숨긴 간지는 draft에서 숫자 0');
assert.equal(formData.serializeSubmissionQuoteItem(hidden).interleafSheets, 0, '숨긴 간지는 submit에서 숫자 0');

const visibleFive = makeItem({ interleafHidden: false, interleafSheets: '5' });
const submitFive = formData.serializeSubmissionQuoteItem(visibleFive);
assert.equal(submitFive.interleafSheets, '5');
assert.equal(submitFive.interleafColor, 'sky');
assert.equal(submitFive.includeInterleaf, true);
assert.equal(submitFive.innerSections.length, 2);
assert.deepEqual(formData.serializeQuoteItems([visibleFive], 'submission'), [submitFive]);

function createStore() {
  const values = new Map();
  return {
    getItem: (k) => values.has(k) ? values.get(k) : null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}
globalThis.localStorage = createStore();
globalThis.sessionStorage = createStore();
const key = storage.getBookTempStorageKey({ uid: 'u1' });
assert.equal(key, 'multiQuoteFormData_u1');
storage.writeBookDraft(key, [draftZero]);
assert.equal(storage.hasBookDraft(key), true);
assert.deepEqual(storage.readBookDraft(key), [draftZero]);
storage.clearBookDraft(key);
assert.equal(storage.hasBookDraft(key), false);

const quoteSource = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book.js'), 'utf8');
assert.ok(quoteSource.includes('quote-form-data.js'), 'quote-book.js must import quote-form-data.js');
assert.ok(quoteSource.includes("serializeQuoteItems(document.querySelectorAll('.quote-item'), 'draft')"), 'draft serialization must use shared module');
assert.ok(quoteSource.includes("serializeQuoteItems(document.querySelectorAll('.quote-item'), 'submission')"), 'submission serialization must use shared module');
assert.ok(quoteSource.includes('writeBookDraft(tempStorageKey, allItemsData)'), 'draft write must use quote-storage');
assert.ok(quoteSource.includes('readBookDraft(tempStorageKey)'), 'draft restore must use quote-storage');

console.log('book form data/storage regression tests passed');
