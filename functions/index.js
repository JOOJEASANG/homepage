const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODELS = { lite: 'gemini-2.5-flash-lite', flash: 'gemini-2.5-flash', '2.0': 'gemini-2.5-flash-lite', '2.5': 'gemini-2.5-flash' };

function text(v, max) { return String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 1000); }
function dayKey() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()); }
function keyOf(req, body) { return (text(body.clientId || req.ip || 'unknown', 80).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'unknown'); }

async function aiConfig() {
  try {
    const s = await db.doc('settings/aiChat').get();
    const d = s.exists ? s.data() || {} : {};
    return {
      enabled: d.enabled !== false,
      globalLimit: Number(d.dailyGlobalLimit || 50),
      clientLimit: Number(d.dailyClientLimit || 5),
      defaultMode: d.defaultMode || 'lite',
      systemPrompt: text(d.systemPrompt || '그린오피스 출력 제본 디지털인쇄 상담원처럼 한국어로 짧고 친절하게 답하세요.', 1800),
      shopGuide: text(d.shopGuide || '', 2500),
      answerRules: text(d.answerRules || '최종 금액, 제작 가능 여부, 납기, 환불 여부는 관리자 확인 후 확정된다고 안내하세요.', 1500)
    };
  } catch (e) {
    return { enabled: true, globalLimit: 50, clientLimit: 5, defaultMode: 'lite', systemPrompt: '그린오피스 출력 제본 디지털인쇄 상담원처럼 한국어로 짧고 친절하게 답하세요.', shopGuide: '', answerRules: '최종 금액, 제작 가능 여부, 납기, 환불 여부는 관리자 확인 후 확정된다고 안내하세요.' };
  }
}

async function consume(req, body, cfg) {
  const day = dayKey();
  const key = keyOf(req, body);
  const ref = db.doc(`ai_usage_daily/${day}`);
  const cref = db.doc(`ai_usage_daily/${day}/clients/${key}`);
  await db.runTransaction(async tx => {
    const gs = await tx.get(ref);
    const cs = await tx.get(cref);
    const g = gs.exists ? Number(gs.data().count || 0) : 0;
    const c = cs.exists ? Number(cs.data().count || 0) : 0;
    if (g >= cfg.globalLimit) throw new Error('GLOBAL_LIMIT');
    if (c >= cfg.clientLimit) throw new Error('CLIENT_LIMIT');
    tx.set(ref, { count: g + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    tx.set(cref, { count: c + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function workGuide() {
  try {
    const snap = await db.collection('work_guides').orderBy('order', 'asc').limit(8).get();
    return snap.docs.map(d => {
      const g = d.data() || {};
      return `${text(g.title, 80)}: ${text(g.content || g.contentHtml, 450)}`;
    }).join('\n').slice(0, 3500);
  } catch (e) { return ''; }
}

async function gemini(apiKey, model, message, cfg, context) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const prompt = [cfg.systemPrompt, '', '[관리자 상담 기준]', cfg.answerRules, '', '[관리자 안내 내용]', cfg.shopGuide || '없음', '', '[작업가이드]', context || '없음', '', '고객 질문: ' + text(message, 700)].join('\n');
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800 } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j && j.error && j.error.message ? j.error.message : 'model error');
  return (((j.candidates || [])[0] || {}).content?.parts || []).map(p => p.text || '').join('').trim().slice(0, 1400);
}

exports.aiChat = onRequest({ region: 'asia-northeast3', cors: true, timeoutSeconds: 30, memory: '256MiB', maxInstances: 2, secrets: [GEMINI_API_KEY] }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  try {
    const body = req.body || {};
    const message = text(body.message, 700);
    if (message.length < 2) return res.status(400).json({ ok: false, error: '질문을 입력해주세요.' });
    const cfg = await aiConfig();
    if (!cfg.enabled) return res.status(403).json({ ok: false, error: 'AI 상담 기능이 현재 꺼져 있습니다.' });
    await consume(req, body, cfg);
    const mode = text(body.mode || cfg.defaultMode || 'lite', 30);
    const model = MODELS[mode] || MODELS.lite;
    const answer = await gemini(GEMINI_API_KEY.value(), model, message, cfg, await workGuide());
    res.json({ ok: true, answer, model, mode });
  } catch (e) {
    const limited = e.message === 'GLOBAL_LIMIT' || e.message === 'CLIENT_LIMIT';
    res.status(limited ? 429 : 500).json({ ok: false, error: limited ? '오늘 사용할 수 있는 AI 상담 횟수를 모두 사용했습니다.' : 'AI 상담 연결에 실패했습니다.' });
  }
});
