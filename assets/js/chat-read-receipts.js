// ============================================================
// chat-read-receipts.js — 견적 상담 채팅 고객 읽음 확인
//
// - 고객이 상세/상담 창에서 관리자 메시지를 실제로 열면 메시지별 읽음 기록
// - 관리자 화면에서는 관리자가 보낸 일반 상담 메시지에 읽음/안읽음 표시
// - 기존 견적 알림 플래그(hasUnreadCustomerMessage)와 메시지 수신확인을 함께 동기화
// ============================================================

import {
  db, collection, query, orderBy, onSnapshot,
  doc, writeBatch, serverTimestamp,
} from './firebase.js';

const PAGE = (() => {
  try { return ((location.pathname || '').split('/').pop() || 'index.html').toLowerCase(); }
  catch (_) { return 'index.html'; }
})();

let activeCustomerQuoteId = '';
let activeAdminQuoteId = '';
let unsubscribeCustomerMessages = null;
let unsubscribeAdminMessages = null;
let adminMessageDocs = [];
let adminContainerObserver = null;
let customerReadInFlight = false;

function detailsModalOpen() {
  const modal = document.getElementById('detailsModal');
  if (!modal) return false;
  return !modal.classList.contains('hidden') && document.visibilityState !== 'hidden';
}

function stopCustomerListener() {
  try { if (typeof unsubscribeCustomerMessages === 'function') unsubscribeCustomerMessages(); } catch (_) {}
  unsubscribeCustomerMessages = null;
}

function stopAdminListener() {
  try { if (typeof unsubscribeAdminMessages === 'function') unsubscribeAdminMessages(); } catch (_) {}
  unsubscribeAdminMessages = null;
  adminMessageDocs = [];
}

async function markAdminMessagesRead(quoteId, snapshot) {
  if (!quoteId || quoteId !== activeCustomerQuoteId || !detailsModalOpen() || customerReadInFlight) return;

  const unreadAdminDocs = snapshot.docs.filter(messageDoc => {
    const data = messageDoc.data() || {};
    return data.sender === 'admin'
      && data.isProof !== true
      && data.readByCustomer !== true;
  });

  // 메시지별 읽음과 견적 단위 새 메시지 플래그를 한 번에 맞춥니다.
  customerReadInFlight = true;
  try {
    const batch = writeBatch(db);
    const readAt = serverTimestamp();
    unreadAdminDocs.forEach(messageDoc => {
      batch.update(messageDoc.ref, {
        readByCustomer: true,
        readByCustomerAt: readAt,
      });
    });
    batch.update(doc(db, 'quotes', quoteId), { hasUnreadCustomerMessage: false });
    await batch.commit();
  } catch (error) {
    console.warn('[chat-read-receipts] customer read receipt update failed:', error);
  } finally {
    customerReadInFlight = false;
  }
}

function activateCustomerQuote(quoteId) {
  if (!quoteId || PAGE !== 'mypage.html') return;
  if (activeCustomerQuoteId === quoteId && unsubscribeCustomerMessages) return;

  activeCustomerQuoteId = quoteId;
  stopCustomerListener();
  const messagesQuery = query(collection(db, `quotes/${quoteId}/messages`), orderBy('timestamp'));
  unsubscribeCustomerMessages = onSnapshot(messagesQuery, snapshot => {
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

function annotateAdminReceipts() {
  if (PAGE !== 'admin.html' || !activeAdminQuoteId || !detailsModalOpen()) return;
  const container = document.getElementById('chat-messages');
  if (!container || !adminMessageDocs.length) return;

  const rows = Array.from(container.children).filter(el => el instanceof HTMLElement);
  if (!rows.length) return;

  adminMessageDocs.forEach((messageDoc, index) => {
    const data = messageDoc.data() || {};
    if (data.sender !== 'admin' || data.isProof === true) return;
    const row = rows[index];
    if (!row) return;

    const existing = row.querySelector('[data-customer-read-receipt="1"]');
    const read = data.readByCustomer === true;
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

  activeAdminQuoteId = quoteId;
  stopAdminListener();
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
      // 기존 상세 모달 렌더가 끝난 직후부터 실제 읽음 처리를 시작합니다.
      setTimeout(() => activateCustomerQuote(quoteId), 0);
    } else if (PAGE === 'admin.html') {
      setTimeout(() => activateAdminQuote(quoteId), 0);
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (PAGE === 'admin.html') requestAnimationFrame(annotateAdminReceipts);
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
