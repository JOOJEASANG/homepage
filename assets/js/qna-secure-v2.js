import {
  auth, db, doc, getDoc,
  signInAnonymously, setPersistence, browserLocalPersistence,
} from './firebase.js';
import { showQnaSubmission } from './qna-customer-ui.js';

const ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/qnaSecure';

async function featureEnabled() {
  try {
    await ensureUser();
    const snap = await getDoc(doc(db, 'settings', 'site'));
    if (snap.exists() && snap.data()?.qnaApiV2 === true) return true;
  } catch (_) {}
  try { return new URLSearchParams(location.search || '').get('qnaApiV2') === '1'; }
  catch (_) { return false; }
}

let userInitialization = null;
async function ensureUser() {
  await auth.authStateReady?.();
  if (auth.currentUser) return auth.currentUser;
  if (!userInitialization) userInitialization = (async () => {
    await setPersistence(auth, browserLocalPersistence).catch(() => null);
    if (auth.currentUser) return auth.currentUser;
    const credential = await signInAnonymously(auth);
    return credential.user;
  })().finally(() => { userInitialization = null; });
  return userInitialization;
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

async function handleSecureQnaSubmit(button) {
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
    showQnaSubmission({ name, password, isSecret });
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

export { callSecureQna, featureEnabled, ensureUser, handleSecureQnaSubmit };
