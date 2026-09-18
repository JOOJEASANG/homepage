import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');
const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const policy = fs.readFileSync(path.join(root, 'assets/js/file-upload-policy.js'), 'utf8');

for (const text of [
  'function canAccessQuote(quoteId)',
  'quoteData(quoteId).userId == request.auth.uid',
  'quoteData(quoteId).guestUid == request.auth.uid',
  'request.auth.token.guestLookupKey',
  'request.resource.size <= 300 * 1024 * 1024',
  'request.resource.contentType.matches(\'image/.*\')',
  'match /quotes/{quoteId}/attachments/{fileName}',
  'match /quotes/{quoteId}/{fileName}',
]) assert.ok(rules.includes(text), `storage.rules missing: ${text}`);


assert.equal(firebase.storage?.rules, 'storage.rules');
assert.ok(policy.includes('MAX_FILE_BYTES = 300 * 1024 * 1024'));
assert.ok(policy.includes('MAX_TOTAL_BYTES = 600 * 1024 * 1024'));
assert.ok(policy.includes("'hwp'"));
assert.ok(policy.includes("'ai'"));
assert.ok(policy.includes("'psd'"));

console.log('Storage security contract checks passed');
