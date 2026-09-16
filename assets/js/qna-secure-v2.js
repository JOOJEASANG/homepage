import {
  auth, db, doc, getDoc,
  signInAnonymously, setPersistence, browserSessionPersistence,
} from './firebase.js';

const ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/qnaSecure';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);
}

async function featureEnabled() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    if (snap.exists() && snap.data()?.qnaApiV2 === true) return true;
  } catch (_) {}
  try { return new URLSearchParams(location.search || '').get('qnaApiV2') === '1'; }
  catch (_) { return false; }
}

async function ensureUser() {
  if (auth.currentUser) return auth.currentUser;
  await setPersistence(auth, browserSessionPersistence).catch(() => null);
  const credential = await signInAnonymously(auth);
  return credential.user;
}

async function callSecureQna(payload) {
  const user = await ensureUser();
  const token = await user.getIdToken();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || '문의 처리에 실패했습니다.');
  return body;
}

function toast(message, type = 'info') {
  try {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
  } catch (_) {}
  alert(message);
}

function formatDate(ms) {
  if (!ms) return '-';
  try { return new Date(ms).toLocaleDateString('ko-KR'); }
  catch (_) { return '-'; }
}

function renderLookup(items) {
  const area = document.getElementById('search-result-area');
  const list = document.getElementById('my-qna-list');
  if (!area || !list) return;
  area.classList.remove('hidden');
  list.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    list.innerHTML = '<div class="p-6 bg-slate-50 rounded-lg text-center text-slate-500 border border-slate-100">일치하는 비공개 문의가 없습니다.</div>';
    return;
  }

  for (const item of items) {
    const answered = !!item.answer || item.status === 'answered' || item.status === '답변완료';
    const el = document.createElement('div');
    el.className = 'border border-slate-200 rounded-xl overflow-hidden shadow-sm';
    el.innerHTML = `
      <div class="bg-white p-5">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold px-2 py-1 rounded ${answered ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}">${answered ? '답변완료' : '답변대기'}</span>
          <span class="text-xs text-slate-400">${formatDate(item.createdAt)}</span>
        </div>
        <h4 class="font-bold text-sm text-slate-800 mb-3">${escapeHtml(item.title)}</h4>
        <div class="bg-slate-50 p-4 rounded-lg text-slate-600 whitespace-pre-wrap text-sm border border-slate-100 mb-4">${escapeHtml(item.body)}</div>
        ${answered ? `
          <div class="mt-4 pt-4 border-t border-slate-100">
            <p class="font-bold text-brand-700 mb-1 text-sm">관리자 답변</p>
            <div class="text-slate-800 whitespace-pre-wrap leading-relaxed bg-brand-50 p-4 rounded-lg border border-brand-100 text-sm">${escapeHtml(item.answer || '')}</div>
          </div>` : '<p class="text-xs text-slate-400 text-center py-2 bg-slate-50 rounded">아직 관리자의 답변이 등록되지 않았습니다.</p>'}
      </div>`;
    list.appendChild(el);
  }
}

async function handleSubmit(button) {
  const name = (document.getElementById('qnaName')?.value || '').trim();
  const password = (document.getElementById('qnaPw')?.value || '').trim();
  const title = (document.getElementById('qnaTitle')?.value || '').trim();
  const body = (document.getElementById('qnaBody')?.value || '').trim();
  const isSecret = !!document.getElementById('qnaSecret')?.checked;

  if (!name || !title || !body) return toast('이름, 제목, 내용을 입력해주세요.', 'error');
  if (isSecret && password.length < 4) return toast('비공개 문의 비밀번호는 4자 이상 입력해주세요.', 'error');

  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>등록 중...';
  try {
    await callSecureQna({ action: 'submit', name, password, title, body, isSecret });
    toast('문의가 등록되었습니다.', 'success');
    ['qnaName', 'qnaPw', 'qnaTitle', 'qnaBody'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const count = document.getElementById('charCount');
    if (count) count.textContent = '0';
  } catch (error) {
    toast(error?.message || '등록에 실패했습니다.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function handleLookup(button) {
  const name = (document.getElementById('searchName')?.value || '').trim();
  const password = (document.getElementById('searchPw')?.value || '').trim();
  if (!name || !password) return toast('이름과 비밀번호를 모두 입력해주세요.', 'error');

  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const result = await callSecureQna({ action: 'lookup', name, password });
    renderLookup(result.items || []);
  } catch (error) {
    toast(error?.message || '조회에 실패했습니다.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function init() {
  if (!/qna\.html$/i.test(location.pathname)) return;
  if (!await featureEnabled()) return;

  document.addEventListener('click', async event => {
    const submit = event.target.closest?.('#submitBtn');
    const search = event.target.closest?.('#searchBtn');
    if (!submit && !search) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (submit) await handleSubmit(submit);
    if (search) await handleLookup(search);
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init().catch(() => null), { once: true });
else init().catch(() => null);

export { callSecureQna };
