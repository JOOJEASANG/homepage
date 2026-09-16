const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');

const db = getFirestore();

function text(value, max = 120) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function maskName(value) {
  const name = text(value, 40);
  if (!name) return '고객';
  if (name.length === 1) return name + '*';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(Math.min(2, name.length - 2)) + name[name.length - 1];
}

function publicQuotePayload(data = {}) {
  return {
    displayName: maskName(data.ordererName || data.guestName || data.userName || data.name || '고객'),
    orderName: text(data.orderName || '인쇄/제본 접수', 80),
    productType: ['book', 'print'].includes(String(data.productType || '')) ? data.productType : 'print',
    status: text(data.status || '접수완료', 24),
    createdAt: data.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

exports.syncRecentQuotePublicFeed = onDocumentWritten({
  region: 'asia-northeast3',
  document: 'quotes/{quoteId}',
  memory: '128MiB',
  timeoutSeconds: 20,
  maxInstances: 3,
}, async event => {
  const quoteId = event.params.quoteId;
  const after = event.data?.after;
  const target = db.doc(`recent_quotes/${quoteId}`);

  if (!after?.exists) {
    await target.delete().catch(() => null);
    return;
  }

  const data = after.data() || {};
  await target.set(publicQuotePayload(data), { merge: false });
});

exports.backfillRecentQuotePublicFeed = async function backfillRecentQuotePublicFeed(limit = 200) {
  const snap = await db.collection('quotes').orderBy('createdAt', 'desc').limit(limit).get();
  const batch = db.batch();
  snap.docs.forEach(docSnap => {
    batch.set(db.doc(`recent_quotes/${docSnap.id}`), publicQuotePayload(docSnap.data() || {}));
  });
  await batch.commit();
  return snap.size;
};
