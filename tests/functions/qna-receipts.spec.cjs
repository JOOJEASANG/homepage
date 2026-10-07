const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const timestamp = value => ({ toMillis: () => value });
const deletion = Symbol('delete');

// Run the real request handler with an in-memory store; never connect to customer data.
function apiFixture({ concurrentAnswer = false } = {}) {
  const records = new Map([['qna/inquiry', {
    name: '고객', title: '출력 문의', body: '첫 줄\n둘째 줄', isSecret: true,
    ownerUid: 'customer', pwHash: crypto.createHash('sha256').update('1234').digest('hex'),
    answer: '이전 답변', createdAt: timestamp(1000), answeredAt: timestamp(2000),
    answerReadByCustomer: false,
  }]]);
  const writes = [];
  const apply = (ref, data, options) => {
    const next = options?.merge ? { ...(records.get(ref.path) || {}) } : {};
    for (const [key, value] of Object.entries(data)) {
      if (value === deletion) delete next[key];
      else next[key] = value;
    }
    records.set(ref.path, next);
    writes.push({ path: ref.path, data });
  };
  const ref = documentPath => ({
    path: documentPath, id: documentPath.split('/').pop(),
    get: async () => snapshot(documentPath),
    set: async (data, options) => apply(ref(documentPath), data, options),
  });
  const snapshot = documentPath => {
    const data = records.has(documentPath) ? { ...records.get(documentPath) } : null;
    return { id: documentPath.split('/').pop(), ref: ref(documentPath), exists: !!data, data: () => data };
  };
  const db = {
    doc: ref,
    collection: name => ({
      doc: () => ref(`${name}/new-inquiry`),
      where: (field, _, value) => ({ limit: () => ({ get: async () => ({
        docs: [...records.keys()].filter(key => key.startsWith(`${name}/`) && records.get(key)?.[field] === value).map(snapshot),
      }) }) }),
    }),
    batch: () => {
      const entries = [];
      return { set: (...args) => entries.push(args), commit: async () => entries.forEach(args => apply(...args)) };
    },
    runTransaction: async callback => {
      const entries = [];
      const result = await callback({
        get: async document => {
          if (document.path === 'qna/inquiry' && concurrentAnswer) {
            concurrentAnswer = false;
            records.set(document.path, { ...records.get(document.path), answer: '변경된 답변\n두 번째 줄', answeredAt: timestamp(4000), answerReadByCustomer: false });
          }
          return snapshot(document.path);
        },
        set: (...args) => entries.push(args),
      });
      entries.forEach(args => apply(...args));
      return result;
    },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../../functions/qna-api.js'), 'utf8');
  vm.runInNewContext(source, {
    exports, Buffer, Intl, Date, console,
    require: name => {
      if (name === 'node:crypto') return crypto;
      if (name === 'firebase-admin/auth') return { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'customer' }) }) };
      if (name === 'firebase-admin/firestore') return {
        getFirestore: () => db,
        FieldValue: { serverTimestamp: () => timestamp(5000), delete: () => deletion },
        Timestamp: { fromMillis: timestamp },
      };
      if (name === 'firebase-functions/v2/https') return { onRequest: (_, handler) => handler };
      if (name === 'firebase-functions/v2/scheduler') return { onSchedule: () => () => {} };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  const request = async body => {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await exports.qnaSecure({ method: 'POST', headers: { authorization: 'Bearer fixture-token' }, ip: '127.0.0.1', body }, response);
    return response;
  };
  return { records, writes, request };
}

test('lookup returns and confirms the same answer when an administrator replies concurrently', async () => {
  const fixture = apiFixture({ concurrentAnswer: true });
  const response = await fixture.request({ action: 'lookup', name: '고객', password: '1234' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.items[0].answer, '변경된 답변\n두 번째 줄');
  assert.equal(response.body.items[0].answeredAt, 4000);
  assert.equal(response.body.items[0].answerReadByCustomer, true);
  const saved = fixture.records.get('qna/inquiry');
  assert.equal(saved.answerReadByCustomer, true);
  assert.equal(saved.answerReadAt.toMillis(), 5000);
  assert.equal(saved.answer, response.body.items[0].answer);
});

test('a wrong password exposes no private answer and writes no receipt', async () => {
  const fixture = apiFixture();
  const response = await fixture.request({ action: 'lookup', name: '고객', password: 'wrong-password' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.items.length, 0);
  assert.equal(fixture.writes.filter(write => write.path.startsWith('qna/')).length, 0);
  assert.equal(fixture.records.get('qna/inquiry').answerReadByCustomer, false);
});

test('private submissions preserve lines and keep passwords in server-only secret records', async () => {
  const fixture = apiFixture();
  const response = await fixture.request({ action: 'submit', name: '고객', title: '새 문의', body: '첫 줄\n둘째 줄', password: '1234', isSecret: true });
  assert.equal(response.statusCode, 200);
  const saved = fixture.records.get('qna/new-inquiry');
  assert.equal(saved.body, '첫 줄\n둘째 줄');
  assert.equal(saved.ownerUid, 'customer');
  assert.equal(saved.answer, '');
  assert.equal('pwHash' in saved, false);
  assert.equal('password' in saved, false);
  assert.equal(fixture.records.get('qna_secrets/new-inquiry').algorithm, 'scrypt-v1');
});
