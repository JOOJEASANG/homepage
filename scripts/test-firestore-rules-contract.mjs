import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.resolve(here, '..', 'firestore.rules');
const guestAccessPath = path.resolve(here, '..', 'functions', 'guest-access.js');
const rules = fs.readFileSync(rulesPath, 'utf8');
const guestAccess = fs.readFileSync(guestAccessPath, 'utf8');

function includesAll(source, label, values) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label}: missing ${value}`);
  }
}

includesAll(rules, 'quote create hardening', [
  'function quoteCreateHasSafeServerFields()',
  "request.resource.data.status == '접수완료'",
  "'adminFinalPrice'",
  "'paymentStatus'",
]);

includesAll(rules, 'customer quote mutation hardening', [
  'function customerDidNotChangeAdminFields()',
  'function customerCancelRequestIsSafe()',
  "request.resource.data.cancelRequestState == 'requested'",
]);

includesAll(rules, 'message sender hardening', [
  'function safeCustomerMessageCreate()',
  "request.resource.data.sender == 'customer'",
  'function safeAdminMessageCreate()',
  "request.resource.data.sender == 'admin'",
]);

includesAll(rules, 'proof response compatibility', [
  'function isCustomerProofResponseUpdate()',
  "request.resource.data.proofStatus in ['approved', 'rejected']",
]);

includesAll(rules, 'customer file message delete compatibility', [
  "allow delete: if isAdmin() || (isCustomerForThisQuote() && resource.data.sender == 'customer');",
]);

includesAll(rules, 'server-granted guest claim', [
  'function hasGuestLookupClaim(quote)',
  "'guestLookupKey' in request.auth.token",
  'request.auth.token.guestLookupKey == quote.data.guestLookupKey',
  'match /guest_access_sessions/{id}',
]);

includesAll(guestAccess, 'guest access endpoint', [
  'verifyIdToken(token, true)',
  'setCustomUserClaims',
  'crypto.randomBytes(24)',
  'guest_access_sessions',
  "where('guestLookupKey', '==', lookupKey)",
]);

assert.ok(
  !rules.includes('match /{document=**} { allow read, write: if true;'),
  'rules must not contain a global public read/write fallback',
);

console.log('Firestore and guest access security contract checks passed');
