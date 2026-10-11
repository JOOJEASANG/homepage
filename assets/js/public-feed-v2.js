import {
  db, doc, onSnapshot,
} from './firebase.js';

const REFRESH_ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/refreshPublicFeed';
const REFRESH_INTERVAL_MS = 60_000;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);
}

function dateText(value) {
  try {
    const d = typeof value === 'number' ? new Date(value) : (value?.toDate ? value.toDate() : null);
    if (!d) return '-';
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch (_) { return '-'; }
}

function renderQuoteItems(items) {
  const container = document.getElementById('recent-quotes-container');
  if (!container) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>최근 접수 내역이 없습니다.</p></div>';
    return;
  }
  container.innerHTML = '';
  list.slice(0, 10).forEach(data => {
    const typeLabel = data.productType === 'book' ? '책자' : '인쇄';
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 px-6 py-3 border-b border-slate-100 items-center text-sm';
    row.innerHTML = `
      <div class="col-span-3 md:col-span-2 text-slate-700 font-medium truncate">${escapeHtml(data.displayName || '고객')}</div>
      <div class="col-span-6 md:col-span-7 flex items-center gap-2 min-w-0">
        <span class="inline-flex shrink-0 whitespace-nowrap min-w-8 items-center justify-center h-5 px-1.5 text-[10px] leading-none rounded font-bold border border-slate-300">${typeLabel}</span>
        <span class="flex-1 min-w-0 text-slate-700 truncate">${escapeHtml(data.orderName || '접수')}</span>
      </div>
      <div class="col-span-3 text-right text-xs text-slate-500">${escapeHtml(data.status || '접수완료')}</div>`;
    container.appendChild(row);
  });
}

function renderQnaItems(items) {
  const container = document.getElementById('recent-qna-container');
  if (!container) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>등록된 문의가 없습니다.</p></div>';
    return;
  }
  container.innerHTML = '';
  list.slice(0, 8).forEach(data => {
    const answered = data.answered === true;
    const isSecret = data.isSecret === true;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 px-6 py-3 border-b border-slate-100 items-center cursor-pointer group text-sm';
    row.innerHTML = `
      <div class="col-span-2 text-center"><span class="inline-block w-14 py-0.5 rounded text-[10px] font-bold border ${answered ? 'text-blue-600 border-blue-200' : 'text-slate-500 border-slate-200'}">${answered ? '답변완료' : '대기중'}</span></div>
      <div class="col-span-7 md:col-span-8 min-w-0">
        <div class="truncate text-slate-700">${isSecret ? '<i class="fas fa-lock text-[10px] text-slate-400 mr-1.5"></i>' : ''}${escapeHtml(data.title || '제목 없음')}</div>
        ${answered && !isSecret && data.answerPreview ? `<div class="text-xs text-slate-400 truncate mt-0.5">↳ ${escapeHtml(data.answerPreview)}</div>` : ''}
      </div>
      <div class="col-span-3 md:col-span-2 text-right text-xs text-slate-400 font-mono">${dateText(data.createdMs)}</div>`;
    row.addEventListener('click', () => { location.href = 'qna.html'; });
    container.appendChild(row);
  });
}

function renderLoadError() {
  const message = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>현황을 불러오지 못했습니다.</p><p class="text-xs">잠시 후 새로고침해주세요.</p></div>';
  const quotes = document.getElementById('recent-quotes-container');
  const qna = document.getElementById('recent-qna-container');
  if (quotes) quotes.innerHTML = message;
  if (qna) qna.innerHTML = message;
}

async function requestRefresh() {
  try {
    await fetch(REFRESH_ENDPOINT, { method: 'GET', cache: 'no-store' });
  } catch (_) {}
}

function init() {
  if (!/(^|\/)index\.html$/i.test(location.pathname) && location.pathname !== '/') return;
  try {
    onSnapshot(doc(db, 'settings', 'site'), snap => {
      const data = snap.exists() ? snap.data() : {};
      renderQuoteItems(data?.recentQuotesPublic || []);
      renderQnaItems(data?.recentQnaPublic || []);
    }, renderLoadError);
  } catch (_) { renderLoadError(); }
  requestRefresh();
  setInterval(requestRefresh, REFRESH_INTERVAL_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
