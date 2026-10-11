const { onRequest } = require('firebase-functions/v2/https');
const { refreshPublicFeedIfStale } = require('./public-feed-data.js');

exports.refreshPublicFeed = onRequest({
  serviceAccount: 'worklist-1e83a@appspot.gserviceaccount.com',
  region: 'asia-northeast3',
  cors: true,
  timeoutSeconds: 15,
  memory: '256MiB',
  cpu: 'gcf_gen1',
  minInstances: 0,
  maxInstances: 1,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'GET or POST only' });
  try {
    const result = await refreshPublicFeedIfStale();
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[refreshPublicFeed]', error);
    return res.status(500).json({ ok: false, error: '공개 현황 갱신에 실패했습니다.' });
  }
});
