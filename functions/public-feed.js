const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { rebuildPublicFeed } = require('./public-feed-data.js');

exports.syncRecentQuotePublicFeed = onDocumentWritten({
  region: 'asia-northeast3',
  document: 'quotes/{quoteId}',
  memory: '128MiB',
  timeoutSeconds: 20,
  maxInstances: 1,
}, async () => {
  await rebuildPublicFeed();
});

exports.syncRecentQnaPublicFeed = onDocumentWritten({
  region: 'asia-northeast3',
  document: 'qna/{qnaId}',
  memory: '128MiB',
  timeoutSeconds: 20,
  maxInstances: 1,
}, async () => {
  await rebuildPublicFeed();
});

// 기존 데이터도 새 공개 projection에 채워지도록 정기 재생성합니다.
exports.refreshRecentQuotePublicFeed = onSchedule({
  region: 'asia-northeast3',
  schedule: 'every 24 hours',
  timeZone: 'Asia/Seoul',
  memory: '128MiB',
  timeoutSeconds: 60,
}, async () => {
  await rebuildPublicFeed();
});
