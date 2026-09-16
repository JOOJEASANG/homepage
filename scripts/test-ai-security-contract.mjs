import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const api = fs.readFileSync(path.join(root, 'functions', 'ai-api.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'assets', 'js', 'ai-app-check.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'functions', 'main.js'), 'utf8');
const session = fs.readFileSync(path.join(root, 'assets', 'js', 'session.js'), 'utf8');

function hasAll(source, label, needles) {
  for (const needle of needles) assert.ok(source.includes(needle), `${label}: missing ${needle}`);
}

hasAll(api, 'App Check server verification', [
  "require('firebase-admin/app-check')",
  'getAppCheck().verifyToken(token)',
  "req.get('X-Firebase-AppCheck')",
  "throw new Error('APP_CHECK')",
]);

hasAll(api, 'origin allowlist', [
  'DEFAULT_ORIGINS',
  'PREVIEW_ORIGIN_RE',
  'originAllowed(origin, cfg)',
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Headers",
]);
assert.ok(!api.includes('cors: true'), 'hardened AI endpoints must not use wildcard cors:true');

hasAll(api, 'server rate limiting', [
  'dailyIpLimit',
  'burstPerMinute',
  'ai_usage_daily',
  'ai_usage_minute',
  "sha256(`${ip}|${clientId}`)",
  "throw new Error('IP_LIMIT')",
  "throw new Error('BURST_LIMIT')",
]);

hasAll(client, 'App Check client bridge', [
  'ReCaptchaV3Provider',
  'initializeAppCheck',
  'getToken(instance, false)',
  "headers.set('X-Firebase-AppCheck', token)",
]);

assert.ok(main.lastIndexOf("require('./ai-api.js')") > main.lastIndexOf("require('./index.js')"), 'hardened AI exports must override legacy exports');
assert.ok(session.indexOf("await import('./ai-app-check.js')") < session.indexOf("import('./ai-chat.js')"), 'App Check bridge must load before AI chat');

console.log('AI security contract checks passed');
