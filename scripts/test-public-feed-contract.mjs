import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fn = fs.readFileSync(path.join(root, 'functions', 'public-feed.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'assets', 'js', 'public-feed-v2.js'), 'utf8');

for (const text of [
  'function maskName(value)',
  "db.doc('settings/site').set",
  'recentQuotesPublic',
  "orderBy('createdAt', 'desc').limit(10)",
]) assert.ok(fn.includes(text), `public feed Function missing: ${text}`);

assert.ok(!client.includes("collection(db, 'quotes')"), 'homepage public feed must not query raw quotes');
assert.ok(client.includes("doc(db, 'settings', 'site')"), 'homepage must read sanitized quote feed from site settings');
assert.ok(client.includes("where('isSecret', '==', false)"), 'homepage Q&A feed must query only public inquiries');

console.log('Public feed privacy contract checks passed');
