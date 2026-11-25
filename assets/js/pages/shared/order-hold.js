// Hold is a real persisted status, never a separate order or cancellation.
const blocked = q => ['requested','approved','admin_cancelled'].includes(q?.cancelRequestState) || ['취소요청','주문취소'].includes(q?.status);
export function canHold(q, actor) {
  if (!q || blocked(q)) return false;
  return actor === 'customer' ? q.status === '접수완료' :
    actor === 'admin' && ['접수완료','접수대기','submitted','작업중','제작중','진행중'].includes(q.status || '접수완료');
}
export function canResume(q, actor) {
  return !!q && !blocked(q) && q.status === '보류' &&
    (actor === 'admin' || (actor === 'customer' && q.holdBy === 'customer' && q.holdPreviousStatus === '접수완료'));
}
export function holdPatch(q, actor, action, timestamp) {
  if (action === 'hold' && canHold(q, actor)) {
    const previous = ['접수대기','submitted'].includes(q.status) || !q.status ? '접수완료' : q.status;
    return {status:'보류',holdBy:actor,holdPreviousStatus:previous,holdAt:timestamp,updatedAt:timestamp,
      [actor === 'customer' ? 'hasUnreadAdminMessage' : 'hasUnreadCustomerMessage']:true};
  }
  if (action === 'resume' && canResume(q, actor)) {
    const previous = ['작업중','제작중','진행중'].includes(q.holdPreviousStatus) ? q.holdPreviousStatus : '접수완료';
    return {status:previous,holdBy:null,holdPreviousStatus:null,holdAt:null,updatedAt:timestamp,
      [actor === 'customer' ? 'hasUnreadAdminMessage' : 'hasUnreadCustomerMessage']:true};
  }
  throw new Error('HOLD_STATE_CHANGED');
}
export async function changeOrderHold({db,doc,runTransaction,serverTimestamp,quoteId,actor,action}) {
  return runTransaction(db, async tx => {
    const ref = doc(db,'quotes',quoteId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('HOLD_STATE_CHANGED');
    const patch = holdPatch(snap.data(),actor,action,serverTimestamp());
    tx.update(ref,patch);
    return patch.status;
  });
}
