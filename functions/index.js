const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODELS = {
  lite: 'gemini-2.5-flash-lite',
  flash: 'gemini-2.5-flash',
  '2.0': 'gemini-2.5-flash-lite',
  '2.5': 'gemini-2.5-flash',
};

function text(v, max) {
  return String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 1000);
}

function dayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function keyOf(req, body) {
  return (text(body.clientId || req.ip || 'unknown', 80).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'unknown');
}

function num(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
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
  const rows = normalizeFaqExamples(items).map((item, idx) => {
    const tag = item.tags ? `\n분류/키워드: ${item.tags}` : '';
    return `${idx + 1}. 예상질문: ${item.question}\n답변 프롬프트: ${item.answerPrompt}${tag}`;
  });
  return rows.join('\n\n').slice(0, 9000);
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
    quickPrompts: Array.isArray(d.quickPrompts) ? d.quickPrompts.map(x => text(x, 80)).filter(Boolean).slice(0, 6) : ['책자 제본 견적은 어떻게 넣나요?', 'PDF 파일 준비 기준 알려줘', '무선제본 납기 문의'],
  };
}

async function readPublicAiConfig() {
  try {
    const pub = await db.doc('settings/aiChatPublic').get();
    if (pub.exists) return normalizePublicAiConfig(pub.data());
  } catch (e) {}
  try {
    const priv = await db.doc('settings/aiChat').get();
    if (priv.exists) return normalizePublicAiConfig(priv.data());
  } catch (e) {}
  return normalizePublicAiConfig({ enabled: false });
}

async function aiConfig() {
  const fallback = {
    enabled: true,
    globalLimit: 50,
    clientLimit: 5,
    defaultMode: 'lite',
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
      defaultMode: d.defaultMode || 'lite',
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
  } catch (e) {
    return fallback;
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
    const snap = await db.collection('work_guides').orderBy('order', 'asc').limit(10).get();
    return snap.docs.map(d => {
      const g = d.data() || {};
      return `${text(g.title, 80)}: ${text(g.content || g.contentHtml, 500)}`;
    }).join('\n').slice(0, 4500);
  } catch (e) { return ''; }
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
  const sections = [
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
    examples ? `[예상질문별 답변 예시]\n아래 예시는 고객 질문과 의미가 비슷할 때 우선 반영한다. 단, 최종 견적/납기/제작 가능 여부는 관리자 확인 후 확정 원칙을 유지한다.\n\n${examples}` : '',
    context ? `[관리자 작업가이드]\n${context}` : '',
    history ? `[최근 대화]\n${history}` : '',
    '', '[답변 방식]',
    '- 한국어로 답한다.',
    '- 고객이 바로 다음 행동을 알 수 있게 안내한다.',
    '- 예상질문 예시와 비슷한 문의는 해당 답변 프롬프트를 우선 참고한다.',
    '- 정확한 견적, 납기, 제작 가능 여부는 관리자 확인 후 확정이라고 안내한다.',
    '- 모르는 내용은 추측하지 말고 전화 또는 관리자 확인을 권한다.',
    '', '고객 질문: ' + text(message, 700),
  ];
  return sections.filter(Boolean).join('\n');
}

async function gemini(apiKey, model, message, cfg, context, history) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const prompt = buildPrompt(message, cfg, context, history);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1000 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j && j.error && j.error.message ? j.error.message : 'model error');
  return (((j.candidates || [])[0] || {}).content?.parts || []).map(p => p.text || '').join('').trim().slice(0, 1800);
}

exports.aiChatConfig = onRequest({ region: 'asia-northeast3', cors: true, timeoutSeconds: 10, memory: '128MiB', maxInstances: 2 }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET only' });
  try {
    return res.json({ ok: true, config: await readPublicAiConfig() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'AI 설정을 불러오지 못했습니다.' });
  }
});

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
    const answer = await gemini(GEMINI_API_KEY.value(), model, message, cfg, await workGuide(), compactHistory(body.history));
    return res.json({ ok: true, answer, model, mode });
  } catch (e) {
    const limited = e.message === 'GLOBAL_LIMIT' || e.message === 'CLIENT_LIMIT';
    return res.status(limited ? 429 : 500).json({ ok: false, error: limited ? '오늘 사용할 수 있는 AI 상담 횟수를 모두 사용했습니다.' : 'AI 상담 연결에 실패했습니다.' });
  }
});
