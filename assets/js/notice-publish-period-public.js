import {
  db,
  collection,
  query,
  orderBy,
  onSnapshot,
} from './firebase.js';

let cachedNotices = [];
let applying = false;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isActiveNotice(data) {
  const today = todayKey();
  const start = String(data?.publishStartDate || '').trim();
  const end = String(data?.publishEndDate || '').trim();
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

function sanitizeHTML(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str || '').replace(/[&<>"']/g, m => map[m]);
}

function sanitizeNoticeHtml(html) {
  try {
    const allowedTags = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
    const docx = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    Array.from(docx.body.querySelectorAll('*')).reverse().forEach(el => {
      if (!allowedTags.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        return;
      }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'style' || (name === 'href' && /^javascript:/i.test(attr.value))) {
          el.removeAttribute(attr.name);
        }
      });
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return docx.body.firstElementChild?.innerHTML || '';
  } catch {
    return '';
  }
}

function renderContent(data) {
  const html = data?.contentHtml ? sanitizeNoticeHtml(data.contentHtml) : '';
  if (html) return html;
  return sanitizeHTML(data?.content || '').replace(/\n/g, '<br>');
}

function dateLabel(data) {
  try {
    if (data?.createdAt?.toDate) {
      const d = data.createdAt.toDate();
      return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    }
  } catch (_) {}
  return '-';
}

function openNoticeModal(data) {
  const modal = document.getElementById('notice-modal');
  if (!modal) return;
  const title = document.getElementById('notice-modal-title');
  const date = document.getElementById('notice-modal-date');
  const content = document.getElementById('notice-modal-content');
  const badge = document.getElementById('notice-badge');
  if (title) title.textContent = data?.title || '';
  if (date) {
    try { date.textContent = data?.createdAt?.toDate?.().toLocaleDateString() || ''; }
    catch { date.textContent = ''; }
  }
  if (content) content.innerHTML = renderContent(data);
  badge?.classList.toggle('hidden', !data?.isImportant);
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };
  const closeBtn = document.getElementById('close-notice-modal-btn');
  if (closeBtn) closeBtn.onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
}

function renderNoticeList(activeNotices) {
  const container = document.getElementById('notice-list-container');
  if (!container) return;

  const notices = [...activeNotices]
    .sort((a, b) => {
      const imp = Number(!!b.isImportant) - Number(!!a.isImportant);
      if (imp) return imp;
      const ta = a.createdAt?.seconds || 0;
      const tb = b.createdAt?.seconds || 0;
      return tb - ta;
    })
    .slice(0, 8);

  if (!notices.length) {
    container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 mt-10"><p>등록된 공지사항이 없습니다.</p></div>';
    return;
  }

  container.innerHTML = '';
  notices.forEach(data => {
    const div = document.createElement('div');
    div.className = 'grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors cursor-pointer group text-sm';
    div.innerHTML = `
      <div class="col-span-2 text-center">
        ${data.isImportant
          ? '<span class="inline-block w-10 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">중요</span>'
          : '<span class="inline-block w-10 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">공지</span>'}
      </div>
      <div class="col-span-7 min-w-0">
        <div class="truncate text-slate-700 group-hover:text-brand-700 group-hover:underline decoration-brand-200 underline-offset-2 transition-all">${sanitizeHTML(data.title || '제목 없음')}</div>
      </div>
      <div class="col-span-3 text-right text-xs text-slate-400 font-mono">${dateLabel(data)}</div>
    `;
    div.onclick = () => openNoticeModal(data);
    container.appendChild(div);
  });
}

function popupHiddenToday(id) {
  try {
    const stored = JSON.parse(localStorage.getItem('notice_popup_hide') || 'null');
    return stored?.date === todayKey() && stored?.id === id;
  } catch {
    return false;
  }
}

function renderPopup(activeNotices) {
  const modal = document.getElementById('notice-popup-modal');
  if (!modal) return;

  const popupNotice = [...activeNotices]
    .filter(n => n.isPopup)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] || null;

  if (!popupNotice || popupHiddenToday(popupNotice.id)) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    return;
  }

  const title = document.getElementById('notice-popup-title');
  const content = document.getElementById('notice-popup-content');
  const hideToday = document.getElementById('notice-popup-hide-today');
  if (title) title.textContent = popupNotice.title || '';
  if (content) content.innerHTML = renderContent(popupNotice);

  const close = () => {
    if (hideToday?.checked) {
      try {
        localStorage.setItem('notice_popup_hide', JSON.stringify({ date: todayKey(), id: popupNotice.id }));
      } catch (_) {}
    }
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (hideToday) hideToday.checked = false;
  };

  const closeBtn = document.getElementById('notice-popup-close-btn');
  const confirmBtn = document.getElementById('notice-popup-confirm-btn');
  if (closeBtn) closeBtn.onclick = close;
  if (confirmBtn) confirmBtn.onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function applyPeriodRules() {
  if (applying) return;
  applying = true;
  try {
    const active = cachedNotices.filter(isActiveNotice);
    renderNoticeList(active);
    renderPopup(active);
  } finally {
    requestAnimationFrame(() => { applying = false; });
  }
}

function bindGuards() {
  const list = document.getElementById('notice-list-container');
  const popup = document.getElementById('notice-popup-modal');
  const observer = new MutationObserver(() => {
    if (applying) return;
    setTimeout(applyPeriodRules, 0);
  });
  if (list) observer.observe(list, { childList: true, subtree: true });
  if (popup) observer.observe(popup, { attributes: true, attributeFilter: ['class'] });
}

function init() {
  try {
    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
    onSnapshot(q, snap => {
      cachedNotices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      applyPeriodRules();
      setTimeout(applyPeriodRules, 300);
      setTimeout(applyPeriodRules, 1200);
    }, () => null);
    bindGuards();
  } catch (_) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
