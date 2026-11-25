import assert from 'node:assert/strict';
import {canHold,canResume,holdPatch,changeOrderHold} from '../assets/js/pages/shared/order-hold.js';
const q={status:'접수완료',requestType:'order',receiptNo:'Q1',totalPrice:1000};
for(const actor of ['admin','customer']){
 const p=holdPatch(q,actor,'hold','now');
 assert.equal(p.status,'보류');assert.equal(p.holdBy,actor);assert.equal(p.holdPreviousStatus,'접수완료');
 assert.equal(p[actor==='admin'?'hasUnreadCustomerMessage':'hasUnreadAdminMessage'],true);
 assert.equal(holdPatch({...q,...p},actor,'resume','now2').status,'접수완료');
}
assert.equal(canHold({...q,status:'작업중'},'customer'),false);
assert.equal(canHold({...q,status:'작업중'},'admin'),true);
assert.equal(canHold({...q,status:'작업완료'},'admin'),false);
assert.equal(canHold({...q,cancelRequestState:'requested'},'customer'),false);
assert.equal(canHold({...q,status:'주문취소'},'admin'),false);
const held=holdPatch({...q,status:'작업중'},'admin','hold','now');
assert.equal(canResume(held,'customer'),false);
assert.equal(holdPatch(held,'admin','resume','now2').status,'작업중');
assert.equal(canHold({...q,requestType:'estimate'},'customer'),true);
assert.throws(()=>holdPatch(held,'customer','resume','now'),/HOLD_STATE_CHANGED/);
let saved={...q};
const args={db:{},doc:()=>({}),runTransaction:async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>saved}),update:(_,p)=>{saved={...saved,...p};}}),serverTimestamp:()=> 'now',quoteId:'Q1',actor:'customer',action:'hold'};
await changeOrderHold(args);
assert.equal(saved.receiptNo,'Q1');assert.equal(saved.totalPrice,1000);
await assert.rejects(changeOrderHold(args),/HOLD_STATE_CHANGED/);
await changeOrderHold({...args,action:'resume'});
assert.equal(saved.status,'접수완료');
console.log('Order hold/resume checks passed');
