import {
  auth, db, doc, getDoc,
  signInAnonymously, setPersistence, browserSessionPersistence,
} from './firebase.js';

const FUNCTION_URL = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/guestQuoteAccess';

function currentFile() {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
}

function setBoth(key, value) {
  try { sessionStorage.setItem(key, value); } catch (_) {}
  try { localStorage.setItem(key, value); } catch (_) {}
}

function showLookupError(message) {
  const active = document.querySelector('.view-section:not(.hidden)') || document;
  const box = active.querySelector?.('.error-msg');
  if (box) {
    box.textContent = message;
    box.style.display = 'block';
    return;
  }
  try { window.showToast?.(message, 'error'); } catch (_) {}
}

async function featureEnabled() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    if (snap.exists() && snap.data()?.guestLookupApiV2 === true) return true;
  } catch (_) {}
  try {
    return new URLSearchParams(location.search || '').get('guestApiV2') === '1';
  } catch (_) {
    return false;
  }
}

async function ensureAnonymousUser() {
  if (auth.currentUser) return auth.currentUser;
  await setPersistence(auth, browserSessionPersistence).catch(() => null);
  const credential = await signInAnonymously(auth);
  return credential.user;
}

async function requestGuestAccess({ name, contactRaw, password }) {
  const user = await ensureAnonymousUser();
  const idToken = await user.getIdToken();
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      name,
      contactRaw,
      contact: String(contactRaw || '').replace(/\D/g, ''),
      password,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error || '일치하는 접수 내역이 없습니다.');
  }
  await user.getIdToken(true);
  return payload;
}

async function bindSecureGuestLookup() {
  if (currentFile() !== 'login.html') return;
  if (!await featureEnabled()) return;

  const form = document.getElementById('guest-lookup-form');
  if (!form || form.dataset.guestApiV2Bound === '1') return;
  form.dataset.guestApiV2Bound = '1';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const name = (document.getElementById('guest-name')?.value || '').trim();
    const contactRaw = (document.getElementById('guest-contact')?.value || '').trim();
    const contact = contactRaw.replace(/\D/g, '');
    let password = (document.getElementById('guest-pw')?.value || '').trim();
    if (!password) password = contact.slice(-4);

    if (!name || !contact || !password) {
      showLookupError('모든 정보를 입력해주세요.');
      return;
    }

    const button = form.querySelector('button[type="submit"], button:not([type])');
    const original = button?.innerHTML || '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
    }

    try {
      const result = await requestGuestAccess({ name, contactRaw, password });
      setBoth('guestLookupKey', result.lookupKey || '');
      setBoth('guestName', name);
      setBoth('guestContact', contact);
      setBoth('guestAccessToken', result.sessionToken || '');
      try { sessionStorage.setItem('guestPwLast4', password.slice(-4)); } catch (_) {}
      location.href = 'mypage.html?guest=1';
    } catch (error) {
      showLookupError(error?.message || '주문조회에 실패했습니다.');
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }, true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bindSecureGuestLookup().catch(() => null), { once: true });
} else {
  bindSecureGuestLookup().catch(() => null);
}

export { requestGuestAccess };
