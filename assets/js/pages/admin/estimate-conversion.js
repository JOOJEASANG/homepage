// Admin-only workflow: turn an existing estimate request into an order after
// the customer has expressly requested production. Keep the original quote ID.
export function canAdminConvertEstimate(quote = {}) {
  return quote?.requestType === 'estimate'
    && ['접수완료', '접수대기', 'submitted'].includes(quote.status || '접수완료')
    && !['requested', 'approved', 'admin_cancelled'].includes(quote.cancelRequestState)
    && quote.estimateStatus !== 'converted';
}

export function adminEstimatePrice(quote = {}) {
  const price = Number(quote.finalPrice ?? quote.totalPrice ?? 0);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function normalizeCustomerOrderRequestNote(value) {
  return String(value ?? '').trim().slice(0, 500);
}

export async function convertEstimateToOrderByAdmin({
  db, doc, collection, runTransaction, serverTimestamp,
  quoteId, expectedPrice, customerRequestNote, actorUid
}) {
  const note = normalizeCustomerOrderRequestNote(customerRequestNote);
  if (!quoteId || !actorUid || !note) throw new Error('CUSTOMER_REQUEST_NOTE_REQUIRED');

  return runTransaction(db, async tx => {
    const quoteRef = doc(db, 'quotes', quoteId);
    const snapshot = await tx.get(quoteRef);
    if (!snapshot.exists() || !canAdminConvertEstimate(snapshot.data())) {
      throw new Error('ESTIMATE_NOT_CONVERTIBLE');
    }
    const saved = snapshot.data() || {};
    if (adminEstimatePrice(saved) !== expectedPrice) {
      throw new Error('ESTIMATE_PRICE_CHANGED');
    }

    const timestamp = serverTimestamp();
    const message = `고객 요청에 따라 관리자가 견적을 주문 접수로 전환했습니다. 요청 확인: ${note}`;
    const messageRef = doc(collection(db, 'quotes', quoteId, 'messages'));
    tx.update(quoteRef, {
      requestType: 'order',
      status: '접수완료',
      estimateStatus: 'converted',
      estimateStatusBeforeConversion: saved.estimateStatus || 'requested',
      convertedToOrderAt: timestamp,
      orderConversionSource: 'admin_customer_request',
      adminConversionReason: note,
      convertedByUid: actorUid,
      hasUnreadCustomerMessage: true,
      lastMessage: message,
      lastMessageAt: timestamp,
      updatedAt: timestamp,
    });
    // Same transaction: no order without the customer-visible audit message.
    tx.set(messageRef, {
      sender: 'admin', type: 'system', text: message,
      timestamp, readByCustomer: false,
    });
    return { converted: true, status: '접수완료', message };
  });
}
