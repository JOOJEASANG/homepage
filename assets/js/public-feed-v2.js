import {
  db, doc, collection, query, where, orderBy, limit, onSnapshot,
} from './firebase.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);
}

function dateText(value) {
  try {
    const d = value?.toDate ? value.toDate() : null;
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
        <span class="inline-flex items-center justify-center h-5 px-1.5 text-[10px] rounded font-bold border border-slate-300">${typeLabel}</span>
        <span class="text-slate-700 truncate">${escapeHtml(data.orderName || '접수')}</span>
      </div>
      <div class="col-span-3 text-right text-xs text-slate-500">${escapeHtml(data.status || '접수완료')}</div>`;
    container.appendChild(row);
  });
}

function renderQna(snapshot) {
  const container = document.getElementById('recent-qna-container');
  if (!container) return;
  if (snapshot.empty) {
    container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>등록된 공개 문의가 없습니다.</p></div>';
    return;
  }
  container.innerHTML = '';
  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data() || {};
    if (data.isSecret === true) return;
    const answered = !!data.answer;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 px-6 py-3 border-b border-slate-100 items-center cursor-pointer group text-sm';
    row.innerHTML = `
      <div class="col-span-2 text-center"><span class="inline-block w-14 py-0.5 rounded text-[10px] font-bold border ${answered ? 'text-blue-600 border-blue-200' : 'text-slate-500 border-slate-200'}">${answered ? '답변완료' : '대기중'}</span></div>
      <div class="col-span-7 md:col-span-8 min-w-0">
        <div class="truncate text-slate-700">${escapeHtml(data.title || '제목 없음')}</div>
        ${answered ? `<div class="text-xs text-slate-400 truncate mt-0.5">↳ ${escapeHtml(String(data.answer || '').replace(/\s+/g, ' ').trim())}</div>` : ''}
      </div>
      <div class="col-span-3 md:col-span-2 text-right text-xs text-slate-400 font-mono">${dateText(data.createdAt)}</div>`;
    row.addEventListener('click', () => { location.href = 'qna.html'; });
    container.appendChild(row);
  });
}

function init() {
  if (!/(^|\/)index\.html$/i.test(location.pathname) && location.pathname !== '/') return;
  try {
    onSnapshot(doc(db, 'settings', 'site'), snap => {
      renderQuoteItems(snap.exists() ? snap.data()?.recentQuotesPublic : []);
    }, () => renderQuoteItems([]));
  } catch (_) {}
  try {
    const publicQna = query(collection(db, 'qna'), where('isSecret', '==', false), orderBy('createdAt', 'desc'), limit(8));
    onSnapshot(publicQna, renderQna, () => renderQna({ empty: true, docs: [] }));
  } catch (_) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
