import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { hasAutomaticEstimatePrice, savedEstimatePrice, convertSavedEstimateToOrder } = await import(
  pathToFileURL(path.join(root, 'assets/js/pages/shared/estimate-quick-order.js')).href
);

assert.equal(hasAutomaticEstimatePrice(30000), true);
assert.equal(hasAutomaticEstimatePrice(0), false);
assert.equal(hasAutomaticEstimatePrice(NaN), false);
assert.equal(hasAutomaticEstimatePrice('계산 중'), false);
assert.equal(savedEstimatePrice({ finalPrice: 42000, totalPrice: 50000 }), 42000);
assert.equal(savedEstimatePrice({ totalPrice: 30000 }), 30000);

function testTransaction(initial) {
  const quote = { ...initial };
  let updates = 0;
  let transactions = 0;
  const fn = {
    db: {},
    doc: (_db, collection, id) => ({ collection, id }),
    runTransaction: async (_db, callback) => {
      transactions++;
      return callback({
        get: async () => ({ exists: () => true, data: () => ({ ...quote }) }),
        update: (_ref, patch) => { Object.assign(quote, patch); updates++; },
      });
    },
    serverTimestamp: () => 'server-time',
    quoteId: 'existing-estimate',
    shownPrice: Number(initial.finalPrice ?? initial.totalPrice),
  };
  return { quote, fn, counts: () => ({ updates, transactions }) };
}

for (const [type, amount] of [['book', 43000], ['print', 30000]]) {
  const ctx = testTransaction({
    requestType: 'estimate', estimateStatus: 'completed', status: '접수완료',
    ...(type === 'book' ? { finalPrice: amount } : { totalPrice: amount }),
  });
  assert.deepEqual(await convertSavedEstimateToOrder(ctx.fn),
    { converted: true, alreadyOrdered: false });
  assert.equal(ctx.quote.requestType, 'order');
  assert.equal(ctx.quote.estimateStatus, 'converted');
  assert.equal(ctx.quote.hasUnreadAdminMessage, true);
  assert.equal(ctx.counts().updates, 1, 'must update existing quote once, not create a second quote');
  assert.deepEqual(await convertSavedEstimateToOrder(ctx.fn),
    { converted: false, alreadyOrdered: true });
  assert.equal(ctx.counts().updates, 1, 'second click must be idempotent');
}

for (const state of [
  { requestType: 'estimate', estimateStatus: 'requested', status: '접수완료', totalPrice: 30000 },
  { requestType: 'estimate', estimateStatus: 'completed', status: '제작중', totalPrice: 30000 },
]) {
  const ctx = testTransaction(state);
  await assert.rejects(convertSavedEstimateToOrder(ctx.fn), /견적 상태/);
  assert.equal(ctx.counts().updates, 0);
}
const changed = testTransaction({
  requestType: 'estimate', estimateStatus: 'completed', status: '접수완료', totalPrice: 30001,
});
changed.fn.shownPrice = 30000;
await assert.rejects(convertSavedEstimateToOrder(changed.fn), /견적금액이 변경/);
assert.equal(changed.counts().updates, 0);

const book = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book.js'), 'utf8');
const print = fs.readFileSync(path.join(root, 'assets/js/pages/quote-print.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book/quote-request-data.js'), 'utf8');
const mypage = fs.readFileSync(path.join(root, 'assets/js/pages/mypage.js'), 'utf8');
for (const [src, name] of [[book, 'book'], [print, 'print']]) {
  for (const token of ['showEstimateCompletedLayer({', 'convertSavedEstimateToOrder({',
    'savedDocId', 'shownPrice', 'mypageUrl: destination']) {
    assert.ok(src.includes(token), 'missing ' + name + ' estimate flow: ' + token);
  }
}
assert.match(builder, /automaticallyPriced \? 'completed' : 'requested'/);
assert.match(print, /hasAutomaticEstimatePrice\(calc\.total\) \? 'completed' : 'requested'/);
assert.match(mypage, /바로 주문 접수/);
for(const filename of ['quote-book.html', 'quote-print.html']) {
  const html = fs.readFileSync(path.join(root, filename), 'utf8');
  assert.match(html, /안내창에서/);
}
console.log('Automatic estimate confirmation and immediate order conversion tests passed');
