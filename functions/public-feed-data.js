const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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

function publicQnaPayload(docSnap) {
  const data = docSnap.data() || {};
  const isSecret = data.isSecret === true;
  const answer = String(data.answer || '').trim();
  const createdMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
  return {
    id: docSnap.id,
    title: isSecret ? '비밀글입니다.' : text(data.title || '제목 없음', 120),
    answerPreview: isSecret ? '' : text(answer, 120),
    answered: Boolean(answer),
    isSecret,
    createdMs,
  };
}

async function rebuildPublicFeed() {
  const db = getFirestore();
  const [quoteSnap, qnaSnap] = await Promise.all([
    db.collection('quotes').orderBy('createdAt', 'desc').limit(10).get(),
    db.collection('qna').orderBy('createdAt', 'desc').limit(8).get(),
  ]);
  const recentQuotesPublic = quoteSnap.docs.map(publicQuotePayload);
  const recentQnaPublic = qnaSnap.docs.map(publicQnaPayload);
  await db.doc('settings/site').set({
    recentQuotesPublic,
    recentQnaPublic,
    recentPublicFeedUpdatedAt: FieldValue.serverTimestamp(),
    recentQuotesPublicUpdatedAt: FieldValue.serverTimestamp(),
    recentQnaPublicUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { quotes: recentQuotesPublic.length, qna: recentQnaPublic.length };
}

async function refreshPublicFeedIfStale(maxAgeMs = 60_000) {
  const site = await getFirestore().doc('settings/site').get();
  const data = site.exists ? site.data() || {} : {};
  const updatedMs = data.recentPublicFeedUpdatedAt?.toMillis?.() || 0;
  const hasFeeds = Array.isArray(data.recentQuotesPublic) && Array.isArray(data.recentQnaPublic);
  if (hasFeeds && Date.now() - updatedMs < maxAgeMs) {
    return { quotes: data.recentQuotesPublic.length, qna: data.recentQnaPublic.length, cached: true };
  }
  return { ...(await rebuildPublicFeed()), cached: false };
}

module.exports = { rebuildPublicFeed, refreshPublicFeedIfStale };
