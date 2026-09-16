const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

const db = getFirestore();
const storage = getStorage();
const DAY_MS = 24 * 60 * 60 * 1000;
const FILE_RETENTION_DAYS = 30;
const BACKUP_RETENTION_DAYS = 30;
const BACKUP_COLLECTIONS = [
  'settings', 'users', 'quotes', 'qna', 'notices', 'faq',
  'workGuideTabs', 'work_guides', 'cannedResponses',
];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isoDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}

function safeStatus(data) {
  return data && typeof data === 'object' ? String(data.status || '').slice(0, 40) : '';
}

function changedKeys(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter(k => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])).slice(0, 80);
}

function serializeValue(value) {
  if (value == null) return value;
  if (Buffer.isBuffer(value)) return { __buffer: true, base64: value.toString('base64') };
  if (value && typeof value.toDate === 'function') return { __timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
    return out;
  }
  return value;
}

async function snapshotCollection(name, maxDocs = 5000) {
  const snap = await db.collection(name).limit(maxDocs).get();
  return snap.docs.map(d => ({ path: d.ref.path, data: serializeValue(d.data()) }));
}

async function snapshotMessages(maxDocs = 5000) {
  const snap = await db.collectionGroup('messages').limit(maxDocs).get();
  return snap.docs.map(d => ({ path: d.ref.path, data: serializeValue(d.data()) }));
}

async function writeBackupRun(data) {
  await db.collection('system_backup_runs').add({ ...data, createdAt: FieldValue.serverTimestamp() });
}

async function createOperationalBackup() {
  const startedAt = new Date();
  const payload = {
    version: 1,
    project: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'worklist-1e83a',
    createdAt: startedAt.toISOString(),
    collections: {},
    messages: [],
  };

  for (const name of BACKUP_COLLECTIONS) {
    payload.collections[name] = await snapshotCollection(name);
  }
  payload.messages = await snapshotMessages();

  const json = Buffer.from(JSON.stringify(payload));
  const gzip = zlib.gzipSync(json, { level: 6 });
  const bucket = storage.bucket();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const path = `_system_backups/${isoDay(startedAt)}/operations-${stamp}.json.gz`;
  const file = bucket.file(path);
  await file.save(gzip, {
    resumable: false,
    contentType: 'application/gzip',
    metadata: {
      cacheControl: 'private, no-store, max-age=0',
      metadata: {
        kind: 'operational-backup',
        retentionDays: String(BACKUP_RETENTION_DAYS),
        sourceBytes: String(json.length),
      },
    },
  });

  await writeBackupRun({
    type: 'daily-operational-backup',
    ok: true,
    storagePath: path,
    sourceBytes: json.length,
    backupBytes: gzip.length,
    collectionCounts: Object.fromEntries(Object.entries(payload.collections).map(([k, v]) => [k, v.length])),
    messageCount: payload.messages.length,
  });

  return { path, sourceBytes: json.length, backupBytes: gzip.length };
}

async function cleanupBackupFiles() {
  const bucket = storage.bucket();
  const [files] = await bucket.getFiles({ prefix: '_system_backups/' });
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * DAY_MS;
  let deleted = 0;
  for (const file of files) {
    const created = Date.parse(file.metadata?.timeCreated || file.metadata?.updated || '');
    if (!Number.isFinite(created) || created >= cutoff) continue;
    await file.delete({ ignoreNotFound: true });
    deleted++;
  }
  return deleted;
}

async function cleanupQuoteFiles() {
  const bucket = storage.bucket();
  const [files] = await bucket.getFiles({ prefix: 'quotes/' });
  const cutoff = Date.now() - FILE_RETENTION_DAYS * DAY_MS;
  let deleted = 0;
  let deletedBytes = 0;

  for (const file of files) {
    if (deleted >= 500) break;
    const created = Date.parse(file.metadata?.timeCreated || file.metadata?.updated || '');
    if (!Number.isFinite(created) || created >= cutoff) continue;
    const size = Number(file.metadata?.size || 0);
    await file.delete({ ignoreNotFound: true });
    deleted++;
    deletedBytes += Number.isFinite(size) ? size : 0;
  }

  if (deleted > 0) {
    await db.collection('audit_logs').add({
      type: 'storage-retention-cleanup',
      scope: 'quotes',
      retentionDays: FILE_RETENTION_DAYS,
      deletedCount: deleted,
      deletedBytes,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return { deleted, deletedBytes };
}

exports.auditQuoteWrites = onDocumentWritten({
  region: 'asia-northeast3',
  document: 'quotes/{quoteId}',
  memory: '128MiB',
  timeoutSeconds: 20,
  maxInstances: 3,
}, async event => {
  const beforeExists = !!event.data?.before?.exists;
  const afterExists = !!event.data?.after?.exists;
  const before = beforeExists ? (event.data.before.data() || {}) : {};
  const after = afterExists ? (event.data.after.data() || {}) : {};
  const action = !beforeExists ? 'create' : !afterExists ? 'delete' : 'update';
  const actorHint = after.updatedBy || after.lastEditedBy || before.updatedBy || before.lastEditedBy || '';

  await db.collection('audit_logs').add({
    type: 'quote-write',
    quoteId: event.params.quoteId,
    action,
    changedFields: changedKeys(before, after),
    beforeStatus: safeStatus(before),
    afterStatus: safeStatus(after),
    beforePaymentStatus: String(before.paymentStatus || '').slice(0, 40),
    afterPaymentStatus: String(after.paymentStatus || '').slice(0, 40),
    productType: String(after.productType || before.productType || '').slice(0, 20),
    actorHint: String(actorHint || '').slice(0, 100),
    ownerHash: sha256(after.userId || before.userId || after.guestLookupKey || before.guestLookupKey || '').slice(0, 24),
    createdAt: FieldValue.serverTimestamp(),
  });
});

exports.cleanupExpiredQuoteFiles = onSchedule({
  region: 'asia-northeast3',
  schedule: 'every day 03:20',
  timeZone: 'Asia/Seoul',
  memory: '256MiB',
  timeoutSeconds: 300,
}, async () => {
  await cleanupQuoteFiles();
});

exports.backupOperationalData = onSchedule({
  region: 'asia-northeast3',
  schedule: 'every day 04:10',
  timeZone: 'Asia/Seoul',
  memory: '512MiB',
  timeoutSeconds: 540,
}, async () => {
  try {
    await createOperationalBackup();
    const deletedOldBackups = await cleanupBackupFiles();
    if (deletedOldBackups > 0) {
      await db.collection('audit_logs').add({
        type: 'backup-retention-cleanup',
        retentionDays: BACKUP_RETENTION_DAYS,
        deletedCount: deletedOldBackups,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (error) {
    await writeBackupRun({
      type: 'daily-operational-backup',
      ok: false,
      error: String(error?.message || error || 'unknown').slice(0, 500),
    }).catch(() => null);
    throw error;
  }
});
