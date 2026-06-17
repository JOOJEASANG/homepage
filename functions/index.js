const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

exports.aiChat = onRequest({ region: 'asia-northeast3', cors: true, secrets: [GEMINI_API_KEY] }, async (req, res) => {
  res.json({ ok: true, message: 'AI chat function is ready.' });
});
