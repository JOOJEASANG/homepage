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

function publicQuotePayload(docSnap) {
  const data = docSnap.data() || {};
  const createdMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
  return {
    id: docSnap.id,
    displayName: maskName(data.ordererName || data.guestName || data.userName || data.name || '고객'),
    orderName: text(data.orderName || '인쇄/제본 접수', 80),
    productType: ['book', 'print'].includes(String(data.productType || '')) ? data.productType : 'print',
    status: text(data.status || '접수완료', 24),
    createdMs,
  };
}

async function rebuildFeed() {
  const snap = await db.collection('quotes').orderBy('createdAt', 'desc').limit(10).get();
  const recentQuotesPublic = snap.docs.map(publicQuotePayload);
  await db.doc('settings/site').set({
    recentQuotesPublic,
    recentQuotesPublicUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return recentQuotesPublic.length;
}

exports.syncRecentQuotePublicFeed = onDocumentWritten({
  region: 'asia-northeast3',
  document: 'quotes/{quoteId}',
  memory: '128MiB',
  timeoutSeconds: 20,
  maxInstances: 1,
}, async () => {
  await rebuildFeed();
});

exports.backfillRecentQuotePublicFeed = rebuildFeed;
