import assert from 'node:assert/strict';
import { monthlyRevenue,revenueAxisMax,sumMonthlyRevenue } from '../assets/js/pages/admin/monthly-revenue.js';
const date = (y,m) => ({toDate:()=>new Date(y,m-1,10)});
const rows=monthlyRevenue([
 {createdAt:date(2025,12),status:'작업완료',finalPrice:999999},
 {createdAt:date(2026,1),status:'작업완료',finalPrice:12000},
 {createdAt:date(2026,11),status:'결제완료',totalPrice:30000},
 {createdAt:date(2026,11),status:'보류',totalPrice:10000},
 {createdAt:date(2026,11),status:'접수완료',requestType:'estimate',totalPrice:999999},
 {createdAt:date(2026,11),status:'주문취소',totalPrice:999999},
 {createdAt:date(2025,11),status:'결제완료',totalPrice:999999},
 {createdAt:date(2026,12),status:'결제완료',totalPrice:5000},
 {createdAt:date(2027,1),status:'결제완료',totalPrice:999999},
],new Date(2026,10,25));
assert.equal(rows.length,12);
assert.deepEqual(rows[0],{key:'2026-01',count:1,total:12000,confirmed:12000});
assert.deepEqual(rows[1],{key:'2026-02',count:0,total:0,confirmed:0});
assert.deepEqual(rows[10],{key:'2026-11',count:2,total:40000,confirmed:30000});
assert.deepEqual(rows.at(-1),{key:'2026-12',count:1,total:5000,confirmed:5000});
assert.deepEqual(sumMonthlyRevenue(rows),{count:4,total:57000,confirmed:47000});
assert.deepEqual(sumMonthlyRevenue(monthlyRevenue([],new Date(2026,10,25))),{count:0,total:0,confirmed:0});
assert.equal(revenueAxisMax(rows),40000);
assert.equal(revenueAxisMax(monthlyRevenue([],new Date(2026,10,25))),10000);
const next=monthlyRevenue([{createdAt:date(2026,12),status:'결제완료',totalPrice:99999},{createdAt:date(2027,1),status:'결제완료',totalPrice:7000}],new Date(2027,0,1));
assert.equal(next[0].key,'2027-01');
assert.equal(next.at(-1).key,'2027-12');
assert.deepEqual(sumMonthlyRevenue(next),{count:1,total:7000,confirmed:7000});
console.log('Calendar-year revenue aggregation: OK');
