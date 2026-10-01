// ============================================================
// chat-read-receipts.js — 견적 상담 채팅 고객 읽음 확인
//
// - 고객이 상세/상담 창에서 관리자 메시지를 실제로 열면 메시지별 읽음 기록
// - 관리자 화면에서는 관리자가 보낸 일반 상담 메시지에 읽음/안읽음 표시
// - 고객 답장이 뒤에 존재하면 이전 관리자 메시지는 읽음으로 간주
// - 견적 단위 알림 플래그 실패가 메시지별 수신확인을 막지 않도록 분리 처리
// ============================================================

import {
  db, collection, query, orderBy, onSnapshot,
  doc, updateDoc, writeBatch, serverTimestamp,
} from './firebase.js';

const PAGE = (() => {
  try { return ((location.pathname || '').split('/').pop() || 'index.html').toLowerCase(); }
  catch (_) { return 'index.html'; }
})();

let activeCustomerQuoteId = '';
let activeAdminQuoteId = '';
let unsubscribeCustomerMessages = null;
let unsubscribeAdminMessages = null;
let latestCustomerSnapshot = null;
let adminMessageDocs = [];
let adminContainerObserver = null;
let customerReadInFlight = false;
let customerReadQueued = false;

function detailsModalOpen() {
  const modal = document.getElementById('detailsModal');
  if (!modal) return false;
  return !modal.classList.contains('hidden') && document.visibilityState !== 'hidden';
}

function stopCustomerListener() {
  try { if (typeof unsubscribeCustomerMessages === 'function') unsubscribeCustomerMessages(); } catch (_) {}
  unsubscribeCustomerMessages = null;
  latestCustomerSnapshot = null;
  customerReadQueued = false;
}

function stopAdminListener() {
  try { if (typeof unsubscribeAdminMessages === 'function') unsubscribeAdminMessages(); } catch (_) {}
  unsubscribeAdminMessages = null;
  adminMessageDocs = [];
}

async function saveMessageReadReceipts(unreadAdminDocs) {
  if (!unreadAdminDocs.length) return;
  const batch = writeBatch(db);
  const readAt = serverTimestamp();
  unreadAdminDocs.forEach(messageDoc => {
    batch.update(messageDoc.ref, {
      readByCustomer: true,
      readByCustomerAt: readAt,
    });
  });
  await batch.commit();
}

async function clearQuoteUnreadFlag(quoteId) {
  try {
    await updateDoc(doc(db, 'quotes', quoteId), { hasUnreadCustomerMessage: false });
  } catch (error) {
    // 메시지별 읽음 기록과 견적 단위 알림 플래그는 별개입니다.
    // 메타데이터 갱신 권한 문제가 있어도 이미 기록된 메시지 읽음은 유지합니다.
    console.warn('[chat-read-receipts] quote unread flag update failed:', error);
  }
}

async function markAdminMessagesRead(quoteId, snapshot) {
  if (!quoteId || quoteId !== activeCustomerQuoteId || !snapshot || !detailsModalOpen()) return;
  latestCustomerSnapshot = snapshot;

  if (customerReadInFlight) {
    customerReadQueued = true;
    return;
  }

  const unreadAdminDocs = snapshot.docs.filter(messageDoc => {
    const data = messageDoc.data() || {};
    return data.sender === 'admin'
      && data.isProof !== true
      && data.readByCustomer !== true;
  });

  customerReadInFlight = true;
  try {
    if (unreadAdminDocs.length) await saveMessageReadReceipts(unreadAdminDocs);
    await clearQuoteUnreadFlag(quoteId);
  } catch (error) {
    console.warn('[chat-read-receipts] customer message read receipt update failed:', error);
  } finally {
    customerReadInFlight = false;
    if (customerReadQueued) {
      customerReadQueued = false;
      const queuedQuoteId = activeCustomerQuoteId;
      const queuedSnapshot = latestCustomerSnapshot;
      setTimeout(() => {
        markAdminMessagesRead(queuedQuoteId, queuedSnapshot).catch(() => null);
      }, 0);
    }
  }
}

function activateCustomerQuote(quoteId) {
  if (!quoteId || PAGE !== 'mypage.html') return;
  if (activeCustomerQuoteId === quoteId && unsubscribeCustomerMessages) {
    if (latestCustomerSnapshot) markAdminMessagesRead(quoteId, latestCustomerSnapshot).catch(() => null);
    return;
  }

  stopCustomerListener();
  activeCustomerQuoteId = quoteId;
  const messagesQuery = query(collection(db, `quotes/${quoteId}/messages`), orderBy('timestamp'));
  unsubscribeCustomerMessages = onSnapshot(messagesQuery, snapshot => {
    latestCustomerSnapshot = snapshot;
    markAdminMessagesRead(quoteId, snapshot).catch(() => null);
  });
}

function receiptMarkup(read) {
  const state = read ? 'read' : 'unread';
  return `<span data-customer-read-receipt="1" data-read-state="${state}" class="text-[10px] mt-1 px-1 font-bold ${read ? 'text-emerald-600' : 'text-amber-600'}">${read ? '읽음' : '안읽음'}</span>`;
}

function syncReceiptElement(element, read) {
  const state = read ? 'read' : 'unread';
  if (element.dataset.readState === state) return;
  element.dataset.readState = state;
  element.textContent = read ? '읽음' : '안읽음';
  element.classList.toggle('text-emerald-600', read);
  element.classList.toggle('text-amber-600', !read);
}

function removeLegacyReceiptLabels(row) {
  Array.from(row.querySelectorAll('span')).forEach(element => {
    if (element.dataset?.customerReadReceipt === '1') return;
    const text = (element.textContent || '').trim();
    if (text === '읽음' || text === '안읽음') element.remove();
  });
}

function visibleAdminMessageDocs() {
  return adminMessageDocs.filter(messageDoc => (messageDoc.data() || {}).isProof !== true);
}

function hasLaterCustomerReply(messageDocs, messageIndex) {
  for (let index = messageIndex + 1; index < messageDocs.length; index += 1) {
    const data = messageDocs[index]?.data?.() || {};
    if (data.sender === 'customer') return true;
  }
  return false;
}

function annotateAdminReceipts() {
  if (PAGE !== 'admin.html' || !activeAdminQuoteId || !detailsModalOpen()) return;
  const container = document.getElementById('chat-messages');
  if (!container || !adminMessageDocs.length) return;

  const rows = Array.from(container.children).filter(el => el instanceof HTMLElement);
  const messageDocs = visibleAdminMessageDocs();
  if (!rows.length || !messageDocs.length) return;

  messageDocs.forEach((messageDoc, index) => {
    const data = messageDoc.data() || {};
    if (data.sender !== 'admin') return;
    const row = rows[index];
    if (!row) return;

    removeLegacyReceiptLabels(row);

    const existing = row.querySelector('[data-customer-read-receipt="1"]');
    // 고객이 이후 메시지로 답장했다면 그 이전 관리자 메시지는 이미 읽은 것이 확실합니다.
    // 과거 메시지에 readByCustomer 필드가 없던 경우도 올바르게 표시합니다.
    const read = data.readByCustomer === true || hasLaterCustomerReply(messageDocs, index);
    if (existing) {
      syncReceiptElement(existing, read);
      return;
    }
    row.insertAdjacentHTML('beforeend', receiptMarkup(read));
  });
}

function ensureAdminContainerObserver() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  if (adminContainerObserver) adminContainerObserver.disconnect();
  adminContainerObserver = new MutationObserver(() => {
    requestAnimationFrame(annotateAdminReceipts);
  });
  adminContainerObserver.observe(container, { childList: true, subtree: true });
}

function activateAdminQuote(quoteId) {
  if (!quoteId || PAGE !== 'admin.html') return;
  if (activeAdminQuoteId === quoteId && unsubscribeAdminMessages) {
    requestAnimationFrame(annotateAdminReceipts);
    return;
  }

  stopAdminListener();
  activeAdminQuoteId = quoteId;
  ensureAdminContainerObserver();

  const messagesQuery = query(collection(db, `quotes/${quoteId}/messages`), orderBy('timestamp'));
  unsubscribeAdminMessages = onSnapshot(messagesQuery, snapshot => {
    adminMessageDocs = snapshot.docs;
    requestAnimationFrame(() => requestAnimationFrame(annotateAdminReceipts));
  });
}

function quoteIdFromDetailButton(target) {
  const button = target?.closest?.('.view-details-btn');
  return button?.dataset?.id || '';
}

function bindDetailOpenDetection() {
  document.addEventListener('click', event => {
    const quoteId = quoteIdFromDetailButton(event.target);
    if (!quoteId) return;

    if (PAGE === 'mypage.html') {
      setTimeout(() => activateCustomerQuote(quoteId), 0);
    } else if (PAGE === 'admin.html') {
      setTimeout(() => activateAdminQuote(quoteId), 0);
    }
  }, true);

  // 고객이 답장을 보내는 순간에는 이전 관리자 메시지를 실제로 확인한 상태이므로
  // 전송 직전에도 수신확인을 한 번 더 보장합니다.
  document.addEventListener('submit', event => {
    if (PAGE !== 'mypage.html' || event.target?.id !== 'chat-form') return;
    if (!activeCustomerQuoteId || !latestCustomerSnapshot) return;
    markAdminMessagesRead(activeCustomerQuoteId, latestCustomerSnapshot).catch(() => null);
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (PAGE === 'admin.html') requestAnimationFrame(annotateAdminReceipts);
    if (PAGE === 'mypage.html' && activeCustomerQuoteId && latestCustomerSnapshot) {
      markAdminMessagesRead(activeCustomerQuoteId, latestCustomerSnapshot).catch(() => null);
    }
  });

  window.addEventListener('focus', () => {
    if (PAGE === 'admin.html') requestAnimationFrame(annotateAdminReceipts);
    if (PAGE === 'mypage.html' && activeCustomerQuoteId && latestCustomerSnapshot) {
      markAdminMessagesRead(activeCustomerQuoteId, latestCustomerSnapshot).catch(() => null);
    }
  });
}

if (PAGE === 'mypage.html' || PAGE === 'admin.html') {
  bindDetailOpenDetection();
}

window.addEventListener('pagehide', () => {
  stopCustomerListener();
  stopAdminListener();
  try { adminContainerObserver?.disconnect(); } catch (_) {}
  adminContainerObserver = null;
});
