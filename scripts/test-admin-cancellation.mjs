import assert from 'node:assert/strict';
import { isPendingCancellation, canAdminDirectCancel, cancellationResolution } from '../assets/js/pages/admin/cancellation.js';

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

for (const status of ['접수완료', '접수대기', '작업중', '작업완료', '결제완료', '취소거절']) {
  assert.equal(canAdminDirectCancel({ status }), true, 'admin can directly cancel ' + status);
}
assert.equal(canAdminDirectCancel({ status: '주문취소' }), false);
assert.equal(canAdminDirectCancel({ status: '접수완료', cancelRequestState: 'approved' }), false);
assert.equal(canAdminDirectCancel({ status: '접수완료', cancelRequestState: 'admin_cancelled' }), false);
assert.deepEqual(cancellationResolution({ status: '작업중' }, 'direct', '전화로 취소 요청'), {
  status: '주문취소', cancelRequestState: 'admin_cancelled', cancelSource: 'admin_direct',
  cancelReason: '전화로 취소 요청',
  message: '관리자가 주문을 취소 처리했습니다. 사유: 전화로 취소 요청'
});
assert.throws(() => cancellationResolution({ status: '주문취소' }, 'direct'), /CANCEL_ALREADY_HANDLED/);
assert.throws(() => cancellationResolution({ status: '접수완료', cancelRequestState: 'admin_cancelled' }, 'direct'), /CANCEL_ALREADY_HANDLED/);
