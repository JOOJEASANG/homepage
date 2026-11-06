import assert from 'node:assert/strict';
import { isPendingCancellation, cancellationResolution } from '../assets/js/pages/admin/cancellation.js';

const requested = { id: 'guest-1', status: '접수완료', cancelRequestState: 'requested', cancelPrevStatus: '접수완료' };
const legacy = { status: '취소요청', cancelPrevStatus: '작업중' };
assert.equal(isPendingCancellation(requested), true);
assert.equal(isPendingCancellation(legacy), true);
assert.equal(isPendingCancellation({ ...requested, cancelRequestState: 'approved', status: '주문취소' }), false);
assert.equal(isPendingCancellation({ status: '취소요청', cancelRequestState: 'rejected' }), false);
assert.equal(isPendingCancellation({ status: '접수완료' }), false);
assert.deepEqual(cancellationResolution(requested, 'approve'), {
  status: '주문취소', cancelRequestState: 'approved',
  message: '고객님의 주문 취소 요청이 승인되어 주문이 취소되었습니다.'
});
assert.deepEqual(cancellationResolution(requested, 'reject', '제작 착수'), {
  status: '접수완료', cancelRequestState: 'rejected', cancelRejectedReason: '제작 착수',
  message: '주문 취소 요청이 거절되었습니다. 사유: 제작 착수'
});
assert.equal(cancellationResolution(legacy, 'reject').status, '작업중');
assert.equal(cancellationResolution({ status: '취소요청' }, 'reject').status, '접수완료');
assert.throws(() => cancellationResolution({ status: '주문취소', cancelRequestState: 'requested' }, 'approve'), /CANCEL_ALREADY_HANDLED/);
assert.throws(() => cancellationResolution(requested, 'undo'), /INVALID_CANCEL_DECISION/);

console.log('Administrator cancellation request decisions passed');
