const crypto = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');

const db = getFirestore();
const auth = getAuth();

function clean(value, max = 1000) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function makeSecret(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const digest = crypto.scryptSync(String(password), salt, 32).toString('base64url');
  return { salt, digest, algorithm: 'scrypt-v1' };
}

function verifySecret(password, secret) {
  if (!secret?.salt || !secret?.digest) return false;
  try {
    const actual = crypto.scryptSync(String(password), secret.salt, 32);
    const expected = Buffer.from(secret.digest, 'base64url');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function bearer(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function requestKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return sha256(forwarded || req.ip || 'unknown').slice(0, 24);
}

function dayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

async function consume(req) {
  const ref = db.doc(`qna_lookup_limits/${dayKey()}_${requestKey(req)}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data().count || 0) : 0;
    if (count >= 40) throw new Error('RATE_LIMIT');
    tx.set(ref, {
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000),
    }, { merge: true });
  });
}

async function verifiedUser(req) {
  const token = bearer(req);
  if (!token) throw new Error('UNAUTHENTICATED');
  return auth.verifyIdToken(token, true);
}

function publicQnaData(data, id) {
  return {
    id,
    name: clean(data.name, 80),
    title: clean(data.title, 220),
    body: clean(data.body, 4000),
    status: clean(data.status, 40),
    answer: clean(data.answer, 4000),
    isSecret: data.isSecret === true,
    createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
    answeredAt: data.answeredAt?.toMillis ? data.answeredAt.toMillis() : null,
  };
}

async function submitQna(decoded, body) {
  const name = clean(body.name, 80);
  const title = clean(body.title, 220);
  const content = clean(body.body, 4000);
  const isSecret = body.isSecret === true;
  const password = String(body.password || '').trim();

  if (!name || !title || !content) throw new Error('INVALID_INPUT');
  if (isSecret && password.length < 4) throw new Error('WEAK_PASSWORD');

  const ref = db.collection('qna').doc();
  const qna = {
    name,
    title,
    body: content,
    isSecret,
    ownerUid: decoded.uid,
    schemaVersion: 2,
    createdAt: FieldValue.serverTimestamp(),
    status: 'open',
    answer: '',
    answeredAt: null,
  };

  const batch = db.batch();
  batch.set(ref, qna);
  if (isSecret) {
    batch.set(db.doc(`qna_secrets/${ref.id}`), {
      ...makeSecret(password),
      ownerUid: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return { id: ref.id };
}

async function migrateLegacySecret(docSnap, password, uid) {
  const data = docSnap.data() || {};
  if (!data.pwHash || data.pwHash !== sha256(password)) return false;
  const secret = makeSecret(password);
  const batch = db.batch();
  batch.set(db.doc(`qna_secrets/${docSnap.id}`), {
    ...secret,
    ownerUid: uid,
    migratedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(docSnap.ref, {
    ownerUid: uid,
    schemaVersion: 2,
    pwHash: FieldValue.delete(),
    migratedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return true;
}

async function lookupQna(decoded, body) {
  const name = clean(body.name, 80);
  const password = String(body.password || '').trim();
  if (!name || password.length < 2) throw new Error('INVALID_INPUT');

  const snap = await db.collection('qna').where('name', '==', name).limit(50).get();
  const matched = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (data.isSecret !== true) continue;

    const secretSnap = await db.doc(`qna_secrets/${docSnap.id}`).get();
    let ok = secretSnap.exists && verifySecret(password, secretSnap.data());
    if (!ok && data.pwHash) ok = await migrateLegacySecret(docSnap, password, decoded.uid);
    if (!ok) continue;

    if (data.ownerUid !== decoded.uid) {
      await docSnap.ref.set({ ownerUid: decoded.uid, schemaVersion: 2 }, { merge: true });
    }
    matched.push(publicQnaData(data, docSnap.id));
  }

  matched.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return matched;
}

exports.qnaSecure = onRequest({
  region: 'asia-northeast3',
  cors: true,
  timeoutSeconds: 15,
  memory: '128MiB',
  maxInstances: 3,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  try {
    await consume(req);
    const decoded = await verifiedUser(req);
    const body = req.body || {};
    const action = clean(body.action, 20);

    if (action === 'submit') {
      const result = await submitQna(decoded, body);
      return res.json({ ok: true, ...result });
    }
    if (action === 'lookup') {
      const items = await lookupQna(decoded, body);
      return res.json({ ok: true, items });
    }
    return res.status(400).json({ ok: false, error: '잘못된 요청입니다.' });
  } catch (error) {
    if (error?.message === 'RATE_LIMIT') return res.status(429).json({ ok: false, error: '조회 시도가 많습니다. 잠시 후 다시 시도해주세요.' });
    if (error?.message === 'UNAUTHENTICATED') return res.status(401).json({ ok: false, error: '인증이 필요합니다.' });
    if (error?.message === 'WEAK_PASSWORD') return res.status(400).json({ ok: false, error: '비공개 문의 비밀번호는 4자 이상 입력해주세요.' });
    if (error?.message === 'INVALID_INPUT') return res.status(400).json({ ok: false, error: '입력 내용을 확인해주세요.' });
    console.error('[qnaSecure]', error);
    return res.status(500).json({ ok: false, error: '문의 처리 중 오류가 발생했습니다.' });
  }
});

exports.scrubPublicQnaSecrets = onSchedule({
  region: 'asia-northeast3',
  schedule: 'every day 03:20',
  timeZone: 'Asia/Seoul',
  timeoutSeconds: 60,
  memory: '128MiB',
}, async () => {
  const snap = await db.collection('qna').where('isSecret', '==', false).limit(300).get();
  const batch = db.batch();
  let changed = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (!Object.prototype.hasOwnProperty.call(data, 'pwHash')) continue;
    batch.set(docSnap.ref, { pwHash: FieldValue.delete() }, { merge: true });
    changed += 1;
  }
  if (changed > 0) await batch.commit();
  console.log(`[scrubPublicQnaSecrets] scrubbed=${changed}`);
});
