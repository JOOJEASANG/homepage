import { db, doc, runTransaction, serverTimestamp } from './firebase.js';

export function qnaMillis(value) {
  if (typeof value === 'number') return value;
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  if (value?.seconds != null) return Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1e6;
  if (value instanceof Date) return value.getTime();
  return 0;
}

export const hasQnaAnswer = item => !!String(item?.answer || '').trim();
export function isQnaAnswerRead(item) {
  if (!hasQnaAnswer(item) || item.answerReadByCustomer !== true) return false;
  const readAt = qnaMillis(item.answerReadAt);
  const answeredAt = qnaMillis(item.answeredAt);
  return !readAt || !answeredAt || readAt >= answeredAt;
}

// A receipt belongs to the answer actually displayed, even if an admin edits it concurrently.
export async function markQnaAnswerRead(item) {
  if (!item?.id || !hasQnaAnswer(item) || isQnaAnswerRead(item)) return;
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'qna', item.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const current = snapshot.data();
    if (String(current.answer || '') !== String(item.answer || '')
      || qnaMillis(current.answeredAt) !== qnaMillis(item.answeredAt)
      || isQnaAnswerRead(current)) return;
    transaction.update(ref, {
      answerReadByCustomer: true,
      answerReadAt: serverTimestamp(),
    });
  });
}
