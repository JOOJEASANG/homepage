const crypto = require('node:crypto');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAppCheck } = require('firebase-admin/app-check');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const db = getFirestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODELS = {
  lite: 'gemini-2.5-flash-lite',
  flash: 'gemini-2.5-flash',
  '2.0': 'gemini-2.5-flash-lite',
  '2.5': 'gemini-2.5-flash',
};

const DEFAULT_ORIGINS = new Set([
  'https://www.g-print.co.kr',
  'https://g-print.co.kr',
  'https://worklist-1e83a.web.app',
  'https://worklist-1e83a.firebaseapp.com',
]);
const PREVIEW_ORIGIN_RE = /^https:\/\/worklist-1e83a--[a-z0-9-]+\.web\.app$/i;

function text(v, max = 1000) {
  return String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function num(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function dayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function minuteKey() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}`;
}

function requestIp(req) {
  return text(req.ip || req.socket?.remoteAddress || 'unknown', 120);
}

function normalizeFaqExamples(v) {
  if (!Array.isArray(v)) return [];
  return v.map(item => {
    const question = text(item && item.question, 220);
    const answerPrompt = text(item && (item.answerPrompt || item.answer || item.prompt), 700);
    const tags = text(Array.isArray(item && item.tags) ? item.tags.join(', ') : item && item.tags, 120);
    const enabled = !(item && item.enabled === false);
    return { question, answerPrompt, tags, enabled };
  }).filter(x => x.enabled && x.question && x.answerPrompt).slice(0, 30);
}

function faqExamplesText(items) {
  return normalizeFaqExamples(items).map((item, idx) => {
    const tag = item.tags ? `\n분류/키워드: ${item.tags}` : '';
    return `${idx + 1}. 예상질문: ${item.question}\n답변 프롬프트: ${item.answerPrompt}${tag}`;
  }).join('\n\n').slice(0, 9000);
}

function normalizePublicAiConfig(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    enabled: d.enabled === true,
    defaultMode: ['lite', 'flash'].includes(d.defaultMode) ? d.defaultMode : 'lite',
    showModeSelector: d.showModeSelector !== false,
    dailyClientLimit: num(d.dailyClientLimit, 5, 1, 100),
    buttonLabel: text(d.buttonLabel || 'AI 상담', 24),
    widgetTitle: text(d.widgetTitle || '그린오피스 AI 상담', 60),
    widgetSubtitle: text(d.widgetSubtitle || '출력 · 제본 · 디지털인쇄 안내', 90),
    welcomeMessage: text(d.welcomeMessage || '안녕하세요. 출력, 제본, 책자 제작, 디지털 인쇄 중 어떤 작업을 준비 중이신가요?', 500),
    usageNote: text(d.usageNote || 'AI 상담은 참고 안내입니다. 최종 견적금액, 제작 가능 여부, 납기, 환불 여부는 관리자 확인 후 확정됩니다.', 500),
    inputPlaceholder: text(d.inputPlaceholder || '예: A4 40페이지 책자 30부 무선제본 가능할까요?', 120),
    quickPrompts: Array.isArray(d.quickPrompts) ? d.quickPrompts.map(x => text(x, 80)).filter(Boolean).slice(0, 6) : [],
    requireAppCheck: d.requireAppCheck === true,
    appCheckSiteKey: text(d.appCheckSiteKey || '', 180),
  };
}

async function readPublicAiConfig() {
  try {
    const pub = await db.doc('settings/aiChatPublic').get();
    if (pub.exists) return normalizePublicAiConfig(pub.data());
  } catch (_) {}
  try {
    const priv = await db.doc('settings/aiChat').get();
    if (priv.exists) return normalizePublicAiConfig(priv.data());
  } catch (_) {}
  return normalizePublicAiConfig({ enabled: false });
}

async function aiConfig() {
  const fallback = {
    enabled: true,
    globalLimit: 50,
    clientLimit: 5,
    dailyIpLimit: 30,
    burstPerMinute: 8,
    defaultMode: 'lite',
    requireAppCheck: false,
    allowedOrigins: [],
    systemPrompt: '그린오피스 출력 제본 디지털인쇄 상담원처럼 한국어로 짧고 친절하게 답하세요.',
    answerRules: '최종 금액, 제작 가능 여부, 납기, 환불 여부는 관리자 확인 후 확정된다고 안내하세요.',
    businessInfo: '', serviceGuide: '', productionGuide: '', pricingGuide: '', deliveryGuide: '', handoffGuide: '', forbiddenGuide: '', shopGuide: '', faqExamples: [],
  };
  try {
    const s = await db.doc('settings/aiChat').get();
    const d = s.exists ? s.data() || {} : {};
    return {
      enabled: d.enabled !== false,
      globalLimit: num(d.dailyGlobalLimit, 50, 1, 5000),
      clientLimit: num(d.dailyClientLimit, 5, 1, 100),
      dailyIpLimit: num(d.dailyIpLimit, 30, 1, 500),
      burstPerMinute: num(d.burstPerMinute, 8, 1, 60),
      defaultMode: d.defaultMode || 'lite',
      requireAppCheck: d.requireAppCheck === true,
      allowedOrigins: Array.isArray(d.allowedOrigins) ? d.allowedOrigins.map(v => text(v, 200)).filter(Boolean).slice(0, 20) : [],
      systemPrompt: text(d.systemPrompt || fallback.systemPrompt, 2200),
      answerRules: text(d.answerRules || fallback.answerRules, 2200),
      businessInfo: text(d.businessInfo || '', 1600),
      serviceGuide: text(d.serviceGuide || '', 1800),
      productionGuide: text(d.productionGuide || '', 1800),
      pricingGuide: text(d.pricingGuide || '', 1600),
      deliveryGuide: text(d.deliveryGuide || '', 1600),
      handoffGuide: text(d.handoffGuide || '', 1600),
      forbiddenGuide: text(d.forbiddenGuide || '', 1600),
      shopGuide: text(d.shopGuide || '', 2600),
      faqExamples: normalizeFaqExamples(d.faqExamples),
    };
  } catch (_) {
    return fallback;
  }
}

function normalizeOrigin(value) {
  try { return new URL(String(value || '')).origin.toLowerCase(); }
  catch (_) { return ''; }
}

function originAllowed(origin, cfg) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (DEFAULT_ORIGINS.has(normalized) || PREVIEW_ORIGIN_RE.test(normalized)) return true;
  return (cfg.allowedOrigins || []).some(v => normalizeOrigin(v) === normalized);
}

function applyCors(req, res, cfg) {
  const origin = String(req.get('origin') || '');
  if (!originAllowed(origin, cfg)) return false;
  if (origin) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-AppCheck');
  res.set('Access-Control-Max-Age', '3600');
  return true;
}

async function verifyAppCheckIfNeeded(req, cfg) {
  const token = text(req.get('X-Firebase-AppCheck') || '', 4096);
  if (!token) {
    if (cfg.requireAppCheck) throw new Error('APP_CHECK');
    return null;
  }
  try {
    return await getAppCheck().verifyToken(token);
  } catch (_) {
    throw new Error('APP_CHECK');
  }
}

async function consume(req, body, cfg) {
  const day = dayKey();
  const minute = minuteKey();
  const ip = requestIp(req);
  const ipKey = sha256(ip).slice(0, 40);
  const clientId = text(body.clientId || 'unknown', 80);
  const clientKey = sha256(`${ip}|${clientId}`).slice(0, 40);
  const globalRef = db.doc(`ai_usage_daily/${day}`);
  const clientRef = db.doc(`ai_usage_daily/${day}/clients/${clientKey}`);
  const ipRef = db.doc(`ai_usage_daily/${day}/ips/${ipKey}`);
  const burstRef = db.doc(`ai_usage_minute/${minute}/ips/${ipKey}`);

  await db.runTransaction(async tx => {
    const [gs, cs, ips, bs] = await Promise.all([
      tx.get(globalRef), tx.get(clientRef), tx.get(ipRef), tx.get(burstRef),
    ]);
    const g = gs.exists ? Number(gs.data().count || 0) : 0;
    const c = cs.exists ? Number(cs.data().count || 0) : 0;
    const i = ips.exists ? Number(ips.data().count || 0) : 0;
    const b = bs.exists ? Number(bs.data().count || 0) : 0;
    if (g >= cfg.globalLimit) throw new Error('GLOBAL_LIMIT');
    if (c >= cfg.clientLimit) throw new Error('CLIENT_LIMIT');
    if (i >= cfg.dailyIpLimit) throw new Error('IP_LIMIT');
    if (b >= cfg.burstPerMinute) throw new Error('BURST_LIMIT');
    const updatedAt = FieldValue.serverTimestamp();
    tx.set(globalRef, { count: g + 1, updatedAt }, { merge: true });
    tx.set(clientRef, { count: c + 1, updatedAt }, { merge: true });
    tx.set(ipRef, { count: i + 1, updatedAt }, { merge: true });
    tx.set(burstRef, { count: b + 1, updatedAt }, { merge: true });
  });
}

async function workGuide() {
  try {
    const snap = await db.collection('work_guides').orderBy('order', 'asc').limit(10).get();
    return snap.docs.map(d => {
      const g = d.data() || {};
      return `${text(g.title, 80)}: ${text(g.content || g.contentHtml, 500)}`;
    }).join('\n').slice(0, 4500);
  } catch (_) { return ''; }
}

function compactHistory(history) {
  if (!Array.isArray(history)) return '';
  return history.slice(-8).map(item => {
    const role = item && item.role === 'assistant' ? 'AI' : '고객';
    return `${role}: ${text(item && (item.text || item.content || item.message), 260)}`;
  }).filter(line => !line.endsWith(': ')).join('\n').slice(0, 1800);
}

function buildPrompt(message, cfg, context, history) {
  const examples = faqExamplesText(cfg.faqExamples);
  return [
    '[AI 역할]', cfg.systemPrompt, '',
    '[반드시 지킬 상담 기준]', cfg.answerRules, '',
    cfg.businessInfo ? `[업체 기본 정보]\n${cfg.businessInfo}` : '',
    cfg.serviceGuide ? `[서비스 범위]\n${cfg.serviceGuide}` : '',
    cfg.productionGuide ? `[파일 / 인쇄 데이터 기준]\n${cfg.productionGuide}` : '',
    cfg.pricingGuide ? `[가격 / 견적 안내 기준]\n${cfg.pricingGuide}` : '',
    cfg.deliveryGuide ? `[납기 / 마감 안내 기준]\n${cfg.deliveryGuide}` : '',
    cfg.handoffGuide ? `[관리자 연결 기준]\n${cfg.handoffGuide}` : '',
    cfg.forbiddenGuide ? `[금지 / 주의 답변]\n${cfg.forbiddenGuide}` : '',
    cfg.shopGuide ? `[기타 업체 안내]\n${cfg.shopGuide}` : '',
    examples ? `[예상질문별 답변 예시]\n${examples}` : '',
    context ? `[관리자 작업가이드]\n${context}` : '',
    history ? `[최근 대화]\n${history}` : '',
    '', '[답변 방식]',
    '- 한국어로 답한다.',
    '- 고객이 바로 다음 행동을 알 수 있게 안내한다.',
    '- 정확한 견적, 납기, 제작 가능 여부는 관리자 확인 후 확정이라고 안내한다.',
    '- 모르는 내용은 추측하지 말고 전화 또는 관리자 확인을 권한다.',
    '', '고객 질문: ' + text(message, 700),
  ].filter(Boolean).join('\n');
}

async function gemini(apiKey, model, message, cfg, context, history) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(message, cfg, context, history) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || 'model error');
  return (((j.candidates || [])[0] || {}).content?.parts || []).map(p => p.text || '').join('').trim().slice(0, 1800);
}

exports.aiChatConfig = onRequest({
  region: 'asia-northeast3', timeoutSeconds: 10, memory: '128MiB', maxInstances: 2,
}, async (req, res) => {
  const cfg = await aiConfig();
  if (!applyCors(req, res, cfg)) return res.status(403).json({ ok: false, error: '허용되지 않은 요청 출처입니다.' });
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET only' });
  try {
    return res.json({ ok: true, config: await readPublicAiConfig() });
  } catch (_) {
    return res.status(500).json({ ok: false, error: 'AI 설정을 불러오지 못했습니다.' });
  }
});

exports.aiChat = onRequest({
  region: 'asia-northeast3', timeoutSeconds: 30, memory: '256MiB', maxInstances: 2, secrets: [GEMINI_API_KEY],
}, async (req, res) => {
  const cfg = await aiConfig();
  if (!applyCors(req, res, cfg)) return res.status(403).json({ ok: false, error: '허용되지 않은 요청 출처입니다.' });
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  try {
    await verifyAppCheckIfNeeded(req, cfg);
    const body = req.body || {};
    const message = text(body.message, 700);
    if (message.length < 2) return res.status(400).json({ ok: false, error: '질문을 입력해주세요.' });
    if (!cfg.enabled) return res.status(403).json({ ok: false, error: 'AI 상담 기능이 현재 꺼져 있습니다.' });
    await consume(req, body, cfg);
    const mode = text(body.mode || cfg.defaultMode || 'lite', 30);
    const model = MODELS[mode] || MODELS.lite;
    const answer = await gemini(GEMINI_API_KEY.value(), model, message, cfg, await workGuide(), compactHistory(body.history));
    return res.json({ ok: true, answer, model, mode });
  } catch (e) {
    const limited = ['GLOBAL_LIMIT', 'CLIENT_LIMIT', 'IP_LIMIT', 'BURST_LIMIT'].includes(e.message);
    if (limited) res.set('Retry-After', e.message === 'BURST_LIMIT' ? '60' : '3600');
    if (e.message === 'APP_CHECK') return res.status(401).json({ ok: false, error: 'AI 상담 보안 토큰을 확인할 수 없습니다.' });
    return res.status(limited ? 429 : 500).json({
      ok: false,
      error: limited ? 'AI 상담 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.' : 'AI 상담 연결에 실패했습니다.',
    });
  }
});