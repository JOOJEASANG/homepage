// AI 상담 요청에 Firebase App Check 토큰을 선택적으로 첨부합니다.
// 공개 Firestore 설정에 키가 없으면 공개 설정 API에서 App Check 설정만 보완합니다.

import { app, db, doc, getDoc } from './firebase.js';

const AI_CHAT_ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/aiChat';
const AI_CONFIG_ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/aiChatConfig';
const CONFIG_REF = doc(db, 'settings', 'aiChatPublic');

let configPromise = null;
let appCheckPromise = null;
const originalFetch = window.fetch.bind(window);

async function readConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      let local = {};
      try {
        const snap = await getDoc(CONFIG_REF);
        if (snap.exists()) local = snap.data() || {};
      } catch (_) {}

      if (local.appCheckSiteKey && typeof local.requireAppCheck === 'boolean') return local;
      try {
        const res = await originalFetch(AI_CONFIG_ENDPOINT, { method: 'GET', cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok && data.config) return { ...data.config, ...local };
      } catch (_) {}
      return local;
    })();
  }
  return configPromise;
}

async function getAppCheckInstance(siteKey) {
  if (!siteKey) return null;
  if (!appCheckPromise) {
    appCheckPromise = import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js')
      .then(({ initializeAppCheck, ReCaptchaV3Provider }) => initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      }))
      .catch(err => {
        console.warn('[ai-app-check] initialization failed:', err);
        return null;
      });
  }
  return appCheckPromise;
}

async function appCheckToken() {
  const cfg = await readConfig();
  const siteKey = String(cfg.appCheckSiteKey || '').trim();
  if (!siteKey) return '';
  const instance = await getAppCheckInstance(siteKey);
  if (!instance) return '';
  try {
    const { getToken } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js');
    const result = await getToken(instance, false);
    return result?.token || '';
  } catch (err) {
    console.warn('[ai-app-check] token failed:', err);
    return '';
  }
}

window.fetch = async function secureAiFetch(input, init = undefined) {
  const url = typeof input === 'string' ? input : input?.url;
  if (url !== AI_CHAT_ENDPOINT) return originalFetch(input, init);

  const cfg = await readConfig();
  const token = await appCheckToken();
  if (cfg.requireAppCheck === true && !token) {
    throw new Error('AI 상담 보안 연결을 초기화하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
  }
  if (!token) return originalFetch(input, init);

  const nextInit = { ...(init || {}) };
  const headers = new Headers(nextInit.headers || {});
  headers.set('X-Firebase-AppCheck', token);
  nextInit.headers = headers;
  return originalFetch(input, nextInit);
};
