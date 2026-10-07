import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = fs.readFileSync(path.join(root, 'functions', 'qna-api.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'assets', 'js', 'qna-secure-v2.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'assets', 'js', 'qna-conversation-thread.js'), 'utf8');
const receipts = fs.readFileSync(path.join(root, 'assets', 'js', 'qna-read-receipts.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'functions', 'main.js'), 'utf8');

for (const value of [
  "crypto.scryptSync",
  "crypto.randomBytes(16)",
  "crypto.timingSafeEqual",
  "qna_secrets/",
  "pwHash: FieldValue.delete()",
  "schemaVersion: 2",
  "password.length < 4",
  "scrubPublicQnaSecrets",
  "patch.answerReadByCustomer = true",
  "patch.answerReadAt = FieldValue.serverTimestamp()",
]) {
  assert.ok(api.includes(value), `qna-api missing security/read contract: ${value}`);
}

assert.ok(api.includes("data.answerReadByCustomer !== true"), 'secure Q&A lookup must only write a missing customer read receipt');
assert.ok(!api.includes("batch.set(ref, { pwHash"), 'new Q&A documents must not store a password hash in the public qna document');
assert.ok(client.includes('qnaApiV2'), 'secure Q&A client must remain feature-gated');
assert.ok(client.includes('Authorization: `Bearer ${token}`'), 'secure Q&A client must authenticate requests');
assert.ok(controller.includes('markQnaAnswerRead'), 'verified Q&A conversations must mark displayed answers read');
assert.ok(receipts.includes("doc(db, 'qna', item.id)"), 'receipts must update only the verified qna document');
assert.ok(receipts.includes('answerReadByCustomer: true'), 'secure Q&A client must set the customer read flag');
assert.ok(receipts.includes('answerReadAt: serverTimestamp()'), 'secure Q&A client must timestamp the customer read receipt');
assert.ok(main.includes("...require('./qna-api.js')"), 'Functions aggregator must export Q&A functions');

console.log('Secure Q&A and customer read receipt contract checks passed');
