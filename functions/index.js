const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODELS = {
  lite: 'gemini-2.5-flash-lite',
  flash: 'gemini-2.5-flash',
  '2.0': 'gemini-2.5-flash-lite',
  '2.5': 'gemini-2.5-flash'
};

function text(v, max) {
  return String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 1000);
}

async function gemini(key, model, message) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const prompt = [
    'You are an assistant for a Korean print shop called GreenOffice.',
    'Answer in Korean, briefly and clearly.',
    'Do not confirm final price, production possibility, delivery date, cancellation, or refund. Say staff confirmation is required.',
    'Guide book binding customers to quote-book.html and digital print customers to quote-print.html.',
    'Use PDF, font embedding or outlines, 300dpi, 3mm bleed, and 5mm safe margin as file guidance.',
    'Customer question: ' + text(message, 700)
  ].join('\n');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 700 }
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j && j.error && j.error.message ? j.error.message : 'model error');
  const parts = (((j || {}).candidates || [])[0] || {}).content?.parts || [];
  return parts.map(p => p.text || '').join('').trim().slice(0, 1200);
}

exports.aiChat = onRequest({ region: 'asia-northeast3', cors: true, timeoutSeconds: 30, memory: '256MiB', maxInstances: 2, secrets: [GEMINI_API_KEY] }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  try {
    const body = req.body || {};
    const message = text(body.message, 700);
    if (message.length < 2) return res.status(400).json({ ok: false, error: '질문을 입력해주세요.' });
    const mode = text(body.mode || 'lite', 30);
    const model = MODELS[mode] || MODELS.lite;
    const answer = await gemini(GEMINI_API_KEY.value(), model, message);
    res.json({ ok: true, answer, model, mode });
  } catch (e) {
    console.warn('[aiChat]', e.message);
    res.status(500).json({ ok: false, error: 'AI 상담 연결에 실패했습니다.' });
  }
});
