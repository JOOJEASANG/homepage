import { db, doc, getDoc } from './firebase.js';

const DOCUMENTS = {
  guide: { title: '이용안내', badge: 'GUIDE', path: 'guide.html' },
  privacy: { title: '개인정보처리방침', badge: 'PRIVACY', path: 'personal-info.html' },
  terms: { title: '이용약관', badge: 'TERMS', path: 'terms.html' },
};
const pageCache = new Map();
let companyInfo;
let displaySequence = 0;
let originalFocus = null;

async function loadCompanyInfo() {
  if (companyInfo !== undefined) return companyInfo;
  try {
    const snap = await getDoc(doc(db, 'settings', 'companyInfo'));
    companyInfo = snap.exists() ? snap.data() || {} : {};
  } catch (_) { companyInfo = {}; }
  return companyInfo;
}
function companyValue(info, key) {
  const fallbacks = {
    companyName: '그린오피스', ceoName: '주재상',
    bizNum: '312-22-73242', address: '충남 천안시 서북구 쌍용14길 29 1층',
    tel: '041-571-4370', email: 'winwork@hanmail.net'
  };
  const alternate = {
    companyName: [info.companyName, info.name],
    ceoName: [info.ceoName, info.representative, info.ownerName],
    bizNum: [info.bizNum, info.businessNumber],
    address: [info.address],
    tel: [info.tel, info.phone, info.contact],
    email: [info.email, info.mail]
  };
  return alternate[key]?.find(value => typeof value === 'string' && value.trim()) || fallbacks[key] || '';
}
async function loadPage(type) {
  if (pageCache.has(type)) return pageCache.get(type);
  const path = DOCUMENTS[type].path;
  const pending = fetch(path, { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('Legal page unavailable');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const content = parsed.querySelector('#legal-policy-content');
    if (!content) throw new Error('Legal page has no article');
    return content.innerHTML;
  });
  pageCache.set(type, pending);
  pending.catch(() => pageCache.delete(type));
  return pending;
}
function ensureModal() {
  let modal = document.getElementById('legal-info-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'legal-info-modal';
  modal.className = 'fixed inset-0 z-[10000] hidden items-center justify-center p-4';
  modal.style.cssText = 'background:rgba(15,23,42,.70);backdrop-filter:blur(4px)';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'legal-modal-title');
  modal.innerHTML = `
    <div class="legal-modal-panel w-full max-w-3xl max-h-[88vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      <div class="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
        <div><p id="legal-modal-badge" class="text-[11px] font-extrabold tracking-widest text-emerald-700 mb-1">GUIDE</p>
          <h2 id="legal-modal-title" class="text-lg md:text-xl font-black text-slate-900">이용안내</h2></div>
        <button id="legal-modal-close" aria-label="안내 창 닫기" type="button" class="w-10 h-10 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-700">닫기</button>
      </div>
      <nav class="px-5 py-3 bg-white border-b border-slate-100 flex flex-wrap gap-2" aria-label="안내문 선택">
        <button type="button" data-legal-tab="guide" class="legal-tab px-3 py-2 rounded-lg text-xs font-bold border">이용안내</button>
        <button type="button" data-legal-tab="privacy" class="legal-tab px-3 py-2 rounded-lg text-xs font-bold border">개인정보처리방침</button>
        <button type="button" data-legal-tab="terms" class="legal-tab px-3 py-2 rounded-lg text-xs font-bold border">이용약관</button>
      </nav>
      <div id="legal-modal-content" class="overflow-y-auto px-5 md:px-7 py-5 text-sm text-slate-600 legal-modal-content" aria-live="polite"></div>
      <div class="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 flex flex-wrap justify-between gap-2">
        <span id="legal-modal-company"></span><a id="legal-modal-full-page" class="text-emerald-700 font-bold underline" href="guide.html">전체 페이지에서 보기</a>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeLegalModal(); });
  modal.querySelector('.legal-modal-panel').addEventListener('click', e => e.stopPropagation());
  modal.querySelector('#legal-modal-close').addEventListener('click', closeLegalModal);
  modal.querySelectorAll('[data-legal-tab]').forEach(b => b.addEventListener('click', () => openLegalModal(b.dataset.legalTab)));
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'assets/css/legal-pages.css?v=20261106';
  css.id = 'legal-modal-styles';
  if (!document.getElementById(css.id)) document.head.appendChild(css);
  const style = document.createElement('style');
  style.textContent = '.legal-tab{border-color:#e2e8f0;background:white;color:#475569}.legal-tab.active{background:#ecfdf5;color:#047857;border-color:#6ee7b7}';
  document.head.appendChild(style);
  return modal;
}
export async function openLegalModal(type = 'guide') {
  const key = Object.prototype.hasOwnProperty.call(DOCUMENTS, type) ? type : 'guide';
  const data = DOCUMENTS[key];
  const modal = ensureModal();
  const sequence = ++displaySequence;
  if (modal.classList.contains('hidden')) originalFocus = document.activeElement;
  modal.classList.remove('hidden'); modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  modal.querySelector('#legal-modal-title').textContent = data.title;
  modal.querySelector('#legal-modal-badge').textContent = data.badge;
  modal.querySelector('#legal-modal-full-page').href = data.path;
  modal.querySelector('#legal-modal-content').textContent = '안내 내용을 불러오는 중입니다.';
  modal.querySelectorAll('[data-legal-tab]').forEach(b => {
    const active = b.dataset.legalTab === key;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  modal.querySelector('#legal-modal-close').focus();
  try {
    const [content, info] = await Promise.all([loadPage(key), loadCompanyInfo()]);
    if (sequence !== displaySequence) return;
    const container = modal.querySelector('#legal-modal-content');
    container.innerHTML = content;
    container.scrollTop = 0;
    container.querySelectorAll('[data-company]').forEach(el => {
      el.textContent = companyValue(info, el.dataset.company);
    });
    modal.querySelector('#legal-modal-company').textContent =
      companyValue(info, 'companyName') + ' · ' + companyValue(info, 'tel');
  } catch (_) {
    if (sequence !== displaySequence) return;
    modal.querySelector('#legal-modal-content').innerHTML =
      '<p>안내 내용을 불러올 수 없습니다. 아래의 전체 페이지에서 확인해 주세요.</p>';
  }
}
export function closeLegalModal() {
  displaySequence++;
  const modal = document.getElementById('legal-info-modal');
  if (!modal) return;
  modal.classList.add('hidden'); modal.classList.remove('flex');
  document.body.style.overflow = '';
  originalFocus?.focus?.();
}
document.addEventListener('click', e => {
  const element = e.target?.closest?.('[data-legal]');
  const type = element?.dataset.legal;
  if (!type || !DOCUMENTS[type]) return;
  e.preventDefault();
  openLegalModal(type);
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLegalModal();
  if (e.key === 'Tab') {
    const modal = document.getElementById('legal-info-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    const focusable = Array.from(modal.querySelectorAll('a[href],button:not([disabled])'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
window.openLegalModal = openLegalModal;
window.closeLegalModal = closeLegalModal;
