const crypto = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');

const db = getFirestore();
const auth = getAuth();

function cleanText(value, max = 120) {
  return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function dayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function bearerToken(req) {
  const raw = String(req.headers.authorization || '');
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function ipKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || 'unknown';
  return sha256(ip).slice(0, 24);
}

async function consumeAttempt(req) {
  const ref = db.doc(`guest_lookup_limits/${dayKey()}_${ipKey(req)}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data().count || 0) : 0;
    if (count >= 30) throw new Error('RATE_LIMIT');
    tx.set(ref, {
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000),
    }, { merge: true });
  });
}

async function queryByLookupKey(lookupKey) {
  if (!lookupKey) return [];
  const snap = await db.collection('quotes')
    .where('isGuest', '==', true)
    .where('userId', '==', 'guest')
    .where('guestLookupKey', '==', lookupKey)
    .limit(50)
    .get();
  return snap.docs;
}

function quoteMatchesIdentity(data, normalizedName, normalizedContact) {
  const storedName = cleanText(data.guestNameNorm || data.guestName || data.ordererName || '', 80).replace(/\s+/g, '');
  const storedContact = digits(data.guestContact || data.guestContactRaw || data.ordererContact || '');
  return storedName === normalizedName && storedContact === normalizedContact;
}

async function grantLookupClaim(uid, lookupKey) {
  const user = await auth.getUser(uid);
  const previous = user.customClaims || {};
  await auth.setCustomUserClaims(uid, {
    ...previous,
    guestLookupKey: lookupKey,
    guestLookupGrantedAt: Math.floor(Date.now() / 1000),
  });
}

async function issueOpaqueSession(uid, lookupKey) {
  const token = crypto.randomBytes(24).toString('base64url');
  const tokenHash = sha256(token);
  await db.doc(`guest_access_sessions/${tokenHash}`).set({
    uid,
    lookupKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
  });
  return token;
}

exports.guestQuoteAccess = onRequest({
  region: 'asia-northeast3',
  cors: true,
  timeoutSeconds: 15,
  memory: '128MiB',
  maxInstances: 3,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  try {
    await consumeAttempt(req);

    const token = bearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: '인증이 필요합니다.' });

    const decoded = await auth.verifyIdToken(token, true);
    if (!decoded?.uid) return res.status(401).json({ ok: false, error: '인증이 필요합니다.' });

    const body = req.body || {};
    const name = cleanText(body.name, 80);
    const nameNorm = name.replace(/\s+/g, '');
    const contactRaw = cleanText(body.contactRaw || body.contact, 40);
    const contact = digits(body.contact || contactRaw);
    const password = cleanText(body.password, 32);

    if (nameNorm.length < 1 || contact.length < 9 || contact.length > 11 || password.length < 2) {
      return res.status(400).json({ ok: false, error: '조회 정보를 확인해주세요.' });
    }

    const lookupKey = sha256(`${name}|${contact}|${password}`);
    const legacyKey = sha256(`${name}|${contactRaw}|${password}`);
    const candidateKeys = [...new Set([lookupKey, legacyKey])];

    const found = new Map();
    for (const key of candidateKeys) {
      const docs = await queryByLookupKey(key);
      for (const doc of docs) {
        const data = doc.data() || {};
        if (quoteMatchesIdentity(data, nameNorm, contact)) found.set(doc.id, { doc, key });
      }
    }

    if (found.size === 0) {
      return res.status(404).json({ ok: false, error: '일치하는 접수 내역이 없습니다.' });
    }

    const selectedKey = Array.from(found.values())[0].key;
    await grantLookupClaim(decoded.uid, selectedKey);

    const batch = db.batch();
    for (const { doc } of found.values()) {
      batch.set(doc.ref, {
        guestUid: decoded.uid,
        guestAccessGrantedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();

    const sessionToken = await issueOpaqueSession(decoded.uid, selectedKey);

    return res.json({
      ok: true,
      count: found.size,
      lookupKey: selectedKey,
      sessionToken,
    });
  } catch (error) {
    if (error?.message === 'RATE_LIMIT') {
      return res.status(429).json({ ok: false, error: '조회 시도가 많습니다. 잠시 후 다시 시도해주세요.' });
    }
    console.error('[guestQuoteAccess]', error);
    return res.status(500).json({ ok: false, error: '주문조회 연결에 실패했습니다.' });
  }
});
