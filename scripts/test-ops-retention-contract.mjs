import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ops = fs.readFileSync(path.join(root, 'functions', 'ops-retention.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'functions', 'main.js'), 'utf8');
const storageRules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');

function hasAll(source, label, needles) {
  for (const needle of needles) assert.ok(source.includes(needle), `${label}: missing ${needle}`);
}

hasAll(ops, 'quote file retention', [
  'FILE_RETENTION_DAYS = 30',
  "prefix: 'quotes/'",
  'deleted >= 500',
  "type: 'storage-retention-cleanup'",
]);

hasAll(ops, 'audit logging', [
  'exports.auditQuoteWrites',
  "document: 'quotes/{quoteId}'",
  "db.collection('audit_logs').add",
  'changedFields: changedKeys(before, after)',
  'ownerHash:',
]);
assert.ok(!ops.includes('guestContact:'), 'audit logs must not persist raw guest contact');
assert.ok(!ops.includes('guestName:'), 'audit logs must not persist raw guest name');

hasAll(ops, 'daily backup', [
  'BACKUP_RETENTION_DAYS = 30',
  "_system_backups/",
  'zlib.gzipSync',
  'exports.backupOperationalData',
  "db.collection('system_backup_runs').add",
]);

hasAll(main, 'ops exports', [
  "require('./ops-retention.js')",
]);

hasAll(storageRules, 'backup path is not public', [
  'match /{allPaths=**}',
  'allow read, write: if isAdmin();',
]);
assert.ok(!storageRules.includes("match /_system_backups/{allPaths=**} {\n      allow read: if true;"), 'system backups must never be publicly readable');

console.log('Retention, audit, and backup contract checks passed');
