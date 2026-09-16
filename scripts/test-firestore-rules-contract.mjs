import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.resolve(here, '..', 'firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

function includesAll(label, values) {
  for (const value of values) {
    assert.ok(rules.includes(value), `${label}: missing ${value}`);
  }
}

includesAll('quote create hardening', [
  'function quoteCreateHasSafeServerFields()',
  "request.resource.data.status == '접수완료'",
  "'adminFinalPrice'",
  "'paymentStatus'",
]);

includesAll('customer quote mutation hardening', [
  'function customerDidNotChangeAdminFields()',
  'function customerCancelRequestIsSafe()',
  "request.resource.data.cancelRequestState == 'requested'",
]);

includesAll('message sender hardening', [
  'function safeCustomerMessageCreate()',
  "request.resource.data.sender == 'customer'",
  'function safeAdminMessageCreate()',
  "request.resource.data.sender == 'admin'",
]);

includesAll('proof response compatibility', [
  'function isCustomerProofResponseUpdate()',
  "request.resource.data.proofStatus in ['approved', 'rejected']",
]);

includesAll('customer file message delete compatibility', [
  "allow delete: if isAdmin() || (isCustomerForThisQuote() && resource.data.sender == 'customer');",
]);

assert.ok(
  !rules.includes('match /{document=**} { allow read, write: if true;'),
  'rules must not contain a global public read/write fallback',
);

console.log('Firestore rules contract checks passed');
