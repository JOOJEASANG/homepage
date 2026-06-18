// ============================================================
// ai-chat.js — Gemini AI 상담 위젯
// - Firestore 공개 설정 → Cloud Function fallback 순서로 설정을 읽습니다.
// - enabled === true 일 때만 표시합니다.
// ============================================================

import { db, doc, getDoc, onSnapshot } from './firebase.js';

const AI_CHAT_ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/aiChat';
const AI_CONFIG_ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/aiChatConfig';
const PUBLIC_CONFIG_REF = doc(db, 'settings', 'aiChatPublic');

const DEFAULT_CONFIG = {
  enabled: false,
  buttonLabel: 'AI 상담',
  widgetTitle: '그린오피스 AI 상담',
  widgetSubtitle: '출력 · 제본 · 디지털인쇄 안내',
  welcomeMessage: '안녕하세요. 출력, 제본, 책자 제작, 디지털 인쇄 중 어떤 작업을 준비 중이신가요?',
  usageNote: 'AI 상담은 참고 안내입니다. 최종 견적금액, 제작 가능 여부, 납기, 환불 여부는 관리자 확인 후 확정됩니다.',
  inputPlaceholder: '예: A4 40페이지 책자 30부 무선제본 가능할까요?',
  defaultMode: 'lite',
  showModeSelector: true,
  dailyClientLimit: 5,
  quickPrompts: ['책자 제본 견적은 어떻게 넣나요?', 'PDF 파일 준비 기준 알려줘', '무선제본 납기 문의'],
};

const state = { config: { ...DEFAULT_CONFIG }, rendered: false, els: {} };
const history = [];

function currentFile() {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
}

function isPublicPage() {
  return !['admin.html', 'admin-ai-chat.html', 'maintenance.html'].includes(currentFile());
}

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function cleanText(value, fallback, max = 300) {
  const v = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (v || fallback || '').slice(0, max);
}

function cleanPrompts(value) {
  const arr = Array.isArray(value) ? value : String(value || '').split(/\n+/);
  const cleaned = arr.map(v => cleanText(v, '', 80)).filter(Boolean).slice(0, 6);
  return cleaned.length ? cleaned : DEFAULT_CONFIG.quickPrompts.slice();
}

function normalizeConfig(data = null) {
  const src = data && typeof data === 'object' ? data : {};
  const limit = Number(src.dailyClientLimit ?? DEFAULT_CONFIG.dailyClientLimit);
  return {
    enabled: src.enabled === true,
    buttonLabel: cleanText(src.buttonLabel, DEFAULT_CONFIG.buttonLabel, 24),
    widgetTitle: cleanText(src.widgetTitle, DEFAULT_CONFIG.widgetTitle, 60),
    widgetSubtitle: cleanText(src.widgetSubtitle, DEFAULT_CONFIG.widgetSubtitle, 90),
    welcomeMessage: cleanText(src.welcomeMessage, DEFAULT_CONFIG.welcomeMessage, 500),
    usageNote: cleanText(src.usageNote, DEFAULT_CONFIG.usageNote, 500),
    inputPlaceholder: cleanText(src.inputPlaceholder, DEFAULT_CONFIG.inputPlaceholder, 120),
    defaultMode: ['lite', 'flash'].includes(src.defaultMode) ? src.defaultMode : DEFAULT_CONFIG.defaultMode,
    showModeSelector: src.showModeSelector !== false,
    dailyClientLimit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : DEFAULT_CONFIG.dailyClientLimit,
    quickPrompts: cleanPrompts(src.quickPrompts),
  };
}

function getClientId() {
  try {
    let id = localStorage.getItem('gprint_ai_client_id');
    if (!id) {
      id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('gprint_ai_client_id', id);
    }
    return id;
  } catch { return 'unknown'; }
}

function getLocalCount() {
  try { return Number(localStorage.getItem('gprint_ai_usage_' + todayKey()) || 0); }
  catch { return 0; }
}

function addLocalCount() {
  try { localStorage.setItem('gprint_ai_usage_' + todayKey(), String(getLocalCount() + 1)); } catch {}
}

function injectStyle() {
  if (document.getElementById('gprint-ai-chat-style')) return;
  const style = document.createElement('style');
  style.id = 'gprint-ai-chat-style';
  style.textContent = `#gprint-ai-button{position:fixed;right:22px;bottom:22px;z-index:9997;border:none;border-radius:999px;background:#16a34a;color:#fff;box-shadow:0 16px 40px rgba(22,163,74,.35);padding:14px 18px;font-weight:900;font-size:14px;display:flex;align-items:center;gap:8px;cursor:pointer}#gprint-ai-panel{position:fixed;right:22px;bottom:84px;z-index:9997;width:min(390px,calc(100vw - 28px));height:590px;max-height:calc(100vh - 110px);background:#fff;border:1px solid #e2e8f0;border-radius:22px;box-shadow:0 24px 70px rgba(15,23,42,.22);display:none;overflow:hidden;color:#0f172a}#gprint-ai-panel.open{display:flex;flex-direction:column}.gai-head{padding:16px 17px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px}.gai-head b{font-size:15px}.gai-head span{display:block;font-size:11px;color:#a7f3d0;margin-top:2px}.gai-close{width:32px;height:32px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}.gai-mode{padding:10px 14px;border-bottom:1px solid #eef2f7;background:#f8fafc}.gai-mode.hidden,.gai-quick.hidden{display:none}.gai-mode select{width:100%;border:1px solid #dbe3ea;border-radius:10px;padding:8px 9px;font-size:12px;background:#fff;color:#334155;font-weight:700}.gai-msgs{flex:1;overflow:auto;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.gai-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}.gai-user{align-self:flex-end;background:#16a34a;color:#fff;border-bottom-right-radius:4px}.gai-bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;color:#334155;border-bottom-left-radius:4px}.gai-note{font-size:11px;color:#64748b;line-height:1.5;background:#fff;border:1px dashed #cbd5e1;border-radius:12px;padding:9px 10px}.gai-quick{padding:10px 12px;border-top:1px solid #eef2f7;background:#fff;display:flex;gap:6px;overflow-x:auto}.gai-quick button{white-space:nowrap;border:1px solid #dbe3ea;background:#f8fafc;color:#334155;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}.gai-input{padding:12px;border-top:1px solid #e2e8f0;background:#fff;display:flex;gap:8px}.gai-input textarea{flex:1;resize:none;height:44px;max-height:100px;border:1px solid #dbe3ea;border-radius:12px;padding:10px 11px;font-size:13px;line-height:1.5;outline:none}.gai-send{width:48px;border:none;border-radius:12px;background:#16a34a;color:#fff;font-weight:900;cursor:pointer}.gai-send:disabled{opacity:.45;cursor:not-allowed}@media(max-width:640px){#gprint-ai-button{right:14px;bottom:14px}#gprint-ai-panel{right:14px;bottom:74px;height:min(590px,calc(100vh - 92px))}}`;
  document.head.appendChild(style);
}

function removeAiChat() {
  document.getElementById('gprint-ai-button')?.remove();
  document.getElementById('gprint-ai-panel')?.remove();
  state.els = {};
  state.rendered = false;
}

function addMessage(text, who = 'bot') {
  const div = document.createElement('div');
  div.className = 'gai-msg ' + (who === 'user' ? 'gai-user' : 'gai-bot');
  div.textContent = text;
  state.els.messages.appendChild(div);
  state.els.messages.scrollTop = state.els.messages.scrollHeight;
  return div;
}

function applyConfig() {
  if (!state.rendered) return;
  const c = state.config;
  state.els.button.innerHTML = `<i class="fas fa-robot"></i><span>${c.buttonLabel}</span>`;
  state.els.title.textContent = c.widgetTitle;
  state.els.subtitle.textContent = c.widgetSubtitle;
  state.els.note.textContent = `${c.usageNote} 하루 ${c.dailyClientLimit}회까지 사용할 수 있습니다.`;
  state.els.welcome.textContent = c.welcomeMessage;
  state.els.input.placeholder = c.inputPlaceholder;
  state.els.mode.value = c.defaultMode;
  state.els.modeRow.classList.toggle('hidden', !c.showModeSelector);
  state.els.quick.innerHTML = '';
  state.els.quick.classList.toggle('hidden', c.quickPrompts.length === 0);
  c.quickPrompts.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p;
    b.onclick = () => { state.els.input.value = p; state.els.input.focus(); };
    state.els.quick.appendChild(b);
  });
}

function renderAiChat() {
  if (!isPublicPage() || state.config.enabled !== true) {
    removeAiChat();
    return;
  }
  if (state.rendered) return applyConfig();

  injectStyle();
  const button = document.createElement('button');
  button.id = 'gprint-ai-button';
  button.type = 'button';
  const panel = document.createElement('div');
  panel.id = 'gprint-ai-panel';
  panel.innerHTML = `<div class="gai-head"><div><b data-title></b><span data-subtitle></span></div><button class="gai-close" type="button"><i class="fas fa-times"></i></button></div><div class="gai-mode" data-mode-row><select data-mode><option value="lite">2.0 호환 / 무료우선</option><option value="flash">2.5 Flash / 품질우선</option></select></div><div class="gai-msgs" data-messages><div class="gai-note" data-note></div><div class="gai-msg gai-bot" data-welcome></div></div><div class="gai-quick hidden" data-quick></div><form class="gai-input" data-form><textarea data-input maxlength="700"></textarea><button class="gai-send" data-send type="submit"><i class="fas fa-paper-plane"></i></button></form>`;
  document.body.append(button, panel);
  state.els = {
    button, panel,
    title: panel.querySelector('[data-title]'), subtitle: panel.querySelector('[data-subtitle]'),
    modeRow: panel.querySelector('[data-mode-row]'), mode: panel.querySelector('[data-mode]'),
    messages: panel.querySelector('[data-messages]'), note: panel.querySelector('[data-note]'), welcome: panel.querySelector('[data-welcome]'),
    quick: panel.querySelector('[data-quick]'), form: panel.querySelector('[data-form]'), input: panel.querySelector('[data-input]'), send: panel.querySelector('[data-send]'),
  };
  state.rendered = true;
  button.onclick = () => panel.classList.toggle('open');
  panel.querySelector('.gai-close').onclick = () => panel.classList.remove('open');
  state.els.input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); state.els.form.requestSubmit(); } };
  state.els.form.onsubmit = submit;
  applyConfig();
}

async function submit(e) {
  e.preventDefault();
  if (state.config.enabled !== true) return removeAiChat();
  const q = state.els.input.value.trim();
  if (!q) return;
  if (getLocalCount() >= state.config.dailyClientLimit) return addMessage('오늘 사용할 수 있는 AI 상담 횟수를 모두 사용했습니다. 급한 문의는 고객센터 또는 전화로 문의해주세요.');
  addMessage(q, 'user');
  history.push({ role: 'user', text: q });
  state.els.input.value = '';
  state.els.send.disabled = true;
  const loading = addMessage('답변을 준비 중입니다...');
  try {
    const res = await fetch(AI_CHAT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, mode: state.els.mode.value || state.config.defaultMode, clientId: getClientId(), history: history.slice(-8) }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'AI 상담 연결에 실패했습니다.');
    loading.textContent = data.answer || '답변을 생성하지 못했습니다.';
    history.push({ role: 'assistant', text: loading.textContent });
    addLocalCount();
  } catch (err) {
    loading.textContent = err.message || 'AI 상담 연결에 실패했습니다.';
  } finally {
    state.els.send.disabled = false;
    state.els.messages.scrollTop = state.els.messages.scrollHeight;
  }
}

async function readFunctionConfig() {
  try {
    const res = await fetch(AI_CONFIG_ENDPOINT, { method: 'GET', cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return data && data.ok ? normalizeConfig(data.config) : normalizeConfig({ enabled: false });
  } catch {
    return normalizeConfig({ enabled: false });
  }
}

async function readPublicConfigOnce() {
  try {
    const snap = await getDoc(PUBLIC_CONFIG_REF);
    if (snap.exists()) return normalizeConfig(snap.data());
  } catch (e) {
    console.warn('[ai-chat] firestore config read failed, using function fallback:', e);
  }
  return await readFunctionConfig();
}

async function initAiChat() {
  if (!isPublicPage()) return;
  if (window.__gprintAiChatStarted) return;
  window.__gprintAiChatStarted = true;
  removeAiChat();
  state.config = await readPublicConfigOnce();
  renderAiChat();
  try {
    onSnapshot(PUBLIC_CONFIG_REF, (snap) => {
      if (snap.exists()) {
        state.config = normalizeConfig(snap.data());
        renderAiChat();
      } else {
        readFunctionConfig().then(cfg => { state.config = cfg; renderAiChat(); });
      }
    }, () => readFunctionConfig().then(cfg => { state.config = cfg; renderAiChat(); }));
  } catch {
    readFunctionConfig().then(cfg => { state.config = cfg; renderAiChat(); });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAiChat, { once: true });
else initAiChat();
