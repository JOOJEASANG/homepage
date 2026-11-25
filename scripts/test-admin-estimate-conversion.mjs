import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canAdminConvertEstimate, adminEstimatePrice,
  normalizeCustomerOrderRequestNote, convertEstimateToOrderByAdmin } from '../assets/js/pages/admin/estimate-conversion.js';

const base = {
  requestType: 'estimate', estimateStatus: 'requested', status: '접수완료',
  totalPrice: 28000, receiptNo: 'Q-100', attachments: [{name: 'original.pdf'}],
  createdAt: 'original-time',
};
for (const estimateStatus of ['requested', 'completed']) {
  assert.equal(canAdminConvertEstimate({...base, estimateStatus}), true);
}
for (const q of [
  {...base, requestType:'order'}, {...base, status:'주문취소'},
  {...base, status:'작업중'}, {...base, cancelRequestState:'requested'},
  {...base, estimateStatus:'converted'}
]) assert.equal(canAdminConvertEstimate(q), false);
assert.equal(adminEstimatePrice({...base, finalPrice: 19000}), 19000);
assert.equal(adminEstimatePrice({...base, totalPrice: 0}), 0);
assert.equal(adminEstimatePrice({...base, totalPrice: 'error'}), null);
assert.equal(normalizeCustomerOrderRequestNote('   전화 요청  '), '전화 요청');
assert.equal(normalizeCustomerOrderRequestNote('x'.repeat(700)).length, 500);

function context(initial = base) {
  let saved = { ...initial };
  let updates = 0;
  let messages = [];
  const params = {
    db: {}, doc: (...parts) => parts.join('/'), collection: (...parts) => parts.join('/'),
    runTransaction: async (_, callback) => {
      const pending = [];
      const result = await callback({
        get: async () => ({ exists: () => !!saved, data: () => ({...saved}) }),
        update: (_, patch) => pending.push(() => { saved = {...saved, ...patch}; updates++; }),
        set: (_, patch) => pending.push(() => { messages.push(patch); }),
      });
      pending.forEach(fn => fn());
      return result;
    },
    serverTimestamp: () => 'server-time',
    quoteId: 'old-quote', expectedPrice: adminEstimatePrice(initial),
    customerRequestNote: '고객이 전화로 제작 요청함', actorUid: 'admin-uid',
  };
  return {params, quote:() => saved, messages:() => messages, updates:() => updates};
}
for (const estimateStatus of ['requested', 'completed']) {
  const c=context({...base,estimateStatus});
  const result=await convertEstimateToOrderByAdmin(c.params);
  assert.equal(result.converted, true);
  assert.equal(c.updates(), 1);
  assert.equal(c.quote().requestType, 'order');
  assert.equal(c.quote().estimateStatus, 'converted');
  assert.equal(c.quote().estimateStatusBeforeConversion, estimateStatus);
  assert.equal(c.quote().orderConversionSource, 'admin_customer_request');
  assert.equal(c.quote().convertedByUid, 'admin-uid');
  assert.equal(c.quote().convertedToOrderAt, 'server-time');
  assert.equal(c.quote().status, '접수완료');
  assert.equal(c.quote().receiptNo, base.receiptNo);
  assert.equal(c.quote().createdAt, base.createdAt);
  assert.deepEqual(c.quote().attachments, base.attachments);
  assert.equal(c.quote().totalPrice, 28000);
  assert.equal(c.messages().length, 1);
  assert.equal(c.messages()[0].sender, 'admin');
  assert.match(c.messages()[0].text, /전화로 제작 요청/);
  await assert.rejects(convertEstimateToOrderByAdmin(c.params), /ESTIMATE_NOT_CONVERTIBLE/);
  assert.equal(c.messages().length,1);
}
const changed=context(base); changed.params.expectedPrice=1000;
await assert.rejects(convertEstimateToOrderByAdmin(changed.params), /ESTIMATE_PRICE_CHANGED/);
assert.equal(changed.updates(),0);
const canceled=context({...base,cancelRequestState:'requested'});
await assert.rejects(convertEstimateToOrderByAdmin(canceled.params), /ESTIMATE_NOT_CONVERTIBLE/);
assert.equal(canceled.messages().length,0);
const empty=context(base); empty.params.customerRequestNote='  ';
await assert.rejects(convertEstimateToOrderByAdmin(empty.params), /CUSTOMER_REQUEST_NOTE_REQUIRED/);
assert.equal(empty.updates(),0);
const noPrice=context({...base,totalPrice:0});
await convertEstimateToOrderByAdmin(noPrice.params);
assert.equal(noPrice.quote().totalPrice,0);
const admin=fs.readFileSync('assets/js/pages/admin.js','utf8');
assert.match(admin,/admin-convert-estimate-btn/);
assert.match(admin,/convertEstimateToOrderByAdmin\(/);
console.log('Admin customer-requested estimate conversion contract: OK');
