import {
  db,
  collection,
  onSnapshot,
} from './firebase.js';
import { sanitizeRichText } from './rich-text-sanitizer.js';
import { noticeDayKey, isActiveNotice } from './notice-period-utils.js';

let cachedNotices = [];
let received = false;
let renderedDay = '';
const dismissedPopups = new Set();
const todayKey = noticeDayKey;
function sanitizeHTML(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str || '').replace(/[&<>"']/g, m => map[m]);
}

function renderContent(data) {
  const html = data?.contentHtml ? sanitizeRichText(data.contentHtml) : '';
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

// Two notices by default; older active notices remain accessible without a large board.
export function renderNoticeList(activeNotices) {
  const container = document.getElementById('notice-list-container');
  const section = document.getElementById('home-notice-section');
  const more = document.getElementById('home-notice-more');
  const moreList = document.getElementById('notice-more-list');
  if (!container || !section || !more || !moreList) return;
  const notices = [...activeNotices].sort((a, b) =>
    Number(!!b.isImportant) - Number(!!a.isImportant) ||
    (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );
  section.hidden = !notices.length;
  more.hidden = notices.length <= 2;
  if (more.hidden) more.open = false;
  container.replaceChildren();
  moreList.replaceChildren();
  notices.forEach((data, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'home-notice-row';
    const kind = document.createElement('span');
    kind.className = 'home-notice-kind' + (data.isImportant ? ' is-important' : '');
    kind.textContent = data.isImportant ? '중요' : '공지';
    const title = document.createElement('span');
    title.className = 'home-notice-title-text';
    title.textContent = data.title || '제목 없음';
    title.title = title.textContent;
    const date = document.createElement('span');
    date.className = 'home-notice-date';
    date.textContent = dateLabel(data);
    button.append(kind, title, date);
    button.addEventListener('click', () => openNoticeModal(data));
    (index < 2 ? container : moreList).appendChild(button);
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

  if (!popupNotice || popupHiddenToday(popupNotice.id) || dismissedPopups.has(popupNotice.id)) {
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
    dismissedPopups.add(popupNotice.id);
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
  if (!received) return;
  renderedDay = todayKey();
  const active = cachedNotices.filter(data => isActiveNotice(data, renderedDay));
  renderNoticeList(active);
  renderPopup(active);
}

function renderError() {
  if (received) return;
  const section = document.getElementById('home-notice-section');
  if (section) section.hidden = true;
  console.warn('[notice] 공지사항을 불러오지 못했습니다.');
}

function init() {
  if (!document.getElementById('notice-list-container')) return;
  try {
    // One listener; filter by publication dates before sorting and limiting.
    onSnapshot(collection(db, 'notices'), snap => {
      cachedNotices = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      received = true;
      applyPeriodRules();
    }, renderError);
    // Re-evaluate publication dates at midnight or when a tab becomes visible.
    const refreshDate = () => { if (received && renderedDay !== todayKey()) applyPeriodRules(); };
    setInterval(refreshDate, 60_000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshDate();
    });
  } catch (_) { renderError(); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
