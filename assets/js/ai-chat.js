// ============================================================
// ai-chat.js — Gemini AI 상담 위젯
// - settings/aiChatPublic.enabled === true 일 때만 표시
// - 공개 설정 읽기 실패/문서 없음/OFF 상태면 모든 고객 페이지에서 숨김
// ============================================================

import { db, doc, getDoc, onSnapshot } from './firebase.js';

const AI_CHAT_ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/aiChat';
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

const state = { config: { ...DEFAULT_CONFIG }, rendered: false, unsub: null, els: {} };

function currentFile() {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch (e) { return 'index.html'; }
}

function isPublicPage() {
  return !['admin.html', 'admin-ai-chat.html', 'maintenance.html'].includes(currentFile());
}

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function normalizeText(value, fallback, max = 300) {
  const v = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (v || fallback || '').slice(0, max);
}

function normalizeQuickPrompts(value) {
  const arr = Array.isArray(value) ? value : String(value || '').split(/\n+/);
  const cleaned = arr.map(v => normalizeText(v, '', 80)).filter(Boolean).slice(0, 6);
  return cleaned.length ? cleaned : DEFAULT_CONFIG.quickPrompts.slice();
}

function normalizeConfig(data = null) {
  const src = data && typeof data === 'object' ? data : {};
  const limit = Number(src.dailyClientLimit ?? DEFAULT_CONFIG.dailyClientLimit);
  return {
    enabled: src.enabled === true,
    buttonLabel: normalizeText(src.buttonLabel, DEFAULT_CONFIG.buttonLabel, 24),
    widgetTitle: normalizeText(src.widgetTitle, DEFAULT_CONFIG.widgetTitle, 60),
    widgetSubtitle: normalizeText(src.widgetSubtitle, DEFAULT_CONFIG.widgetSubtitle, 90),
    welcomeMessage: normalizeText(src.welcomeMessage, DEFAULT_CONFIG.welcomeMessage, 500),
    usageNote: normalizeText(src.usageNote, DEFAULT_CONFIG.usageNote, 500),
    inputPlaceholder: normalizeText(src.inputPlaceholder, DEFAULT_CONFIG.inputPlaceholder, 120),
    defaultMode: ['lite', 'flash'].includes(src.defaultMode) ? src.defaultMode : DEFAULT_CONFIG.defaultMode,
    showModeSelector: src.showModeSelector !== false,
    dailyClientLimit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : DEFAULT_CONFIG.dailyClientLimit,
    quickPrompts: normalizeQuickPrompts(src.quickPrompts),
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
  } catch (e) { return 'unknown'; }
}

function getLocalCount() {
  try { return Number(localStorage.getItem('gprint_ai_usage_' + todayKey()) || 0); }
  catch (e) { return 0; }
}

function addLocalCount() {
  try { localStorage.setItem('gprint_ai_usage_' + todayKey(), String(getLocalCount() + 1)); } catch (e) {}
}

function injectStyle() {
  if (document.getElementById('gprint-ai-chat-style')) return;
  const style = document.createElement('style');
  style.id = 'gprint-ai-chat-style';
  style.textContent = `
    #gprint-ai-button{position:fixed;right:22px;bottom:22px;z-index:9997;border:none;border-radius:999px;background:#16a34a;color:#fff;box-shadow:0 16px 40px rgba(22,163,74,.35);padding:14px 18px;font-weight:900;font-size:14px;display:flex;align-items:center;gap:8px;cursor:pointer}
    #gprint-ai-panel{position:fixed;right:22px;bottom:84px;z-index:9997;width:min(390px,calc(100vw - 28px));height:590px;max-height:calc(100vh - 110px);background:#fff;border:1px solid #e2e8f0;border-radius:22px;box-shadow:0 24px 70px rgba(15,23,42,.22);display:none;overflow:hidden;color:#0f172a}
    #gprint-ai-panel.open{display:flex;flex-direction:column}.gprint-ai-head{padding:16px 17px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px}.gprint-ai-head b{font-size:15px}.gprint-ai-head span{display:block;font-size:11px;color:#a7f3d0;margin-top:2px}.gprint-ai-close{width:32px;height:32px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}
    .gprint-ai-mode{padding:10px 14px;border-bottom:1px solid #eef2f7;background:#f8fafc}.gprint-ai-mode.hidden,.gprint-ai-quick-wrap.hidden{display:none}.gprint-ai-mode select{width:100%;border:1px solid #dbe3ea;border-radius:10px;padding:8px 9px;font-size:12px;background:#fff;color:#334155;font-weight:700}
    .gprint-ai-messages{flex:1;overflow:auto;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.gprint-ai-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}.gprint-ai-user{align-self:flex-end;background:#16a34a;color:#fff;border-bottom-right-radius:4px}.gprint-ai-bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;color:#334155;border-bottom-left-radius:4px}.gprint-ai-note{font-size:11px;color:#64748b;line-height:1.5;background:#fff;border:1px dashed #cbd5e1;border-radius:12px;padding:9px 10px}
    .gprint-ai-quick-wrap{padding:10px 12px;border-top:1px solid #eef2f7;background:#fff;display:flex;gap:6px;overflow-x:auto}.gprint-ai-quick{white-space:nowrap;border:1px solid #dbe3ea;background:#f8fafc;color:#334155;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}
    .gprint-ai-input{padding:12px;border-top:1px solid #e2e8f0;background:#fff;display:flex;gap:8px}.gprint-ai-input textarea{flex:1;resize:none;height:44px;max-height:100px;border:1px solid #dbe3ea;border-radius:12px;padding:10px 11px;font-size:13px;line-height:1.5;outline:none}.gprint-ai-send{width:48px;border:none;border-radius:12px;background:#16a34a;color:#fff;font-weight:900;cursor:pointer}.gprint-ai-send:disabled{opacity:.45;cursor:not-allowed}
    @media(max-width:640px){#gprint-ai-button{right:14px;bottom:14px}#gprint-ai-panel{right:14px;bottom:74px;height:min(590px,calc(100vh - 92px))}}
  `;
  document.head.appendChild(style);
}

function addMessage(box, text, who) {
  const div = document.createElement('div');
  div.className = 'gprint-ai-msg ' + (who === 'user' ? 'gprint-ai-user' : 'gprint-ai-bot');
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function removeAiChat() {
  try { state.els.button?.remove(); } catch (e) {}
  try { state.els.panel?.remove(); } catch (e) {}
  try { document.getElementById('gprint-ai-button')?.remove(); } catch (e) {}
  try { document.getElementById('gprint-ai-panel')?.remove(); } catch (e) {}
  state.els = {};
  state.rendered = false;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

function applyConfig() {
  if (!state.rendered) return;
  const cfg = state.config;
  const { button, modeRow, modeEl, titleEl, subtitleEl, noteEl, welcomeEl, input, quickWrap } = state.els;
  if (button) button.innerHTML = `<i class="fas fa-robot"></i><span>${escapeHtml(cfg.buttonLabel)}</span>`;
  if (titleEl) titleEl.textContent = cfg.widgetTitle;
  if (subtitleEl) subtitleEl.textContent = cfg.widgetSubtitle;
  if (noteEl) noteEl.textContent = `${cfg.usageNote} 하루 ${cfg.dailyClientLimit}회까지 사용할 수 있습니다.`;
  if (welcomeEl) welcomeEl.textContent = cfg.welcomeMessage;
  if (input) input.placeholder = cfg.inputPlaceholder;
  if (modeEl) modeEl.value = cfg.defaultMode;
  if (modeRow) modeRow.classList.toggle('hidden', !cfg.showModeSelector);
  if (quickWrap) {
    quickWrap.innerHTML = '';
    quickWrap.classList.toggle('hidden', cfg.quickPrompts.length === 0);
    cfg.quickPrompts.forEach(prompt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gprint-ai-quick';
      btn.textContent = prompt;
      btn.addEventListener('click', () => { if (input) { input.value = prompt; input.focus(); } });
      quickWrap.appendChild(btn);
    });
  }
}

function renderAiChat() {
  if (!isPublicPage() || state.config.enabled !== true) {
    removeAiChat();
    return;
  }
  if (state.rendered && document.getElementById('gprint-ai-button')) {
    applyConfig();
    return;
  }

  injectStyle();
  const button = document.createElement('button');
  button.id = 'gprint-ai-button';
  button.type = 'button';
  const panel = document.createElement('div');
  panel.id = 'gprint-ai-panel';
  panel.innerHTML = `
    <div class="gprint-ai-head"><div><b id="gprint-ai-title"></b><span id="gprint-ai-subtitle"></span></div><button class="gprint-ai-close" type="button" aria-label="닫기"><i class="fas fa-times"></i></button></div>
    <div class="gprint-ai-mode" id="gprint-ai-mode-row"><select id="gprint-ai-mode"><option value="lite">2.0 호환 / 무료우선</option><option value="flash">2.5 Flash / 품질우선</option></select></div>
    <div class="gprint-ai-messages" id="gprint-ai-messages"><div class="gprint-ai-note" id="gprint-ai-note"></div><div class="gprint-ai-msg gprint-ai-bot" id="gprint-ai-welcome"></div></div>
    <div class="gprint-ai-quick-wrap hidden" id="gprint-ai-quick-wrap"></div>
    <form class="gprint-ai-input" id="gprint-ai-form"><textarea id="gprint-ai-text" maxlength="700"></textarea><button class="gprint-ai-send" id="gprint-ai-send" type="submit"><i class="fas fa-paper-plane"></i></button></form>
  `;
  document.body.appendChild(button);
  document.body.appendChild(panel);

  const form = panel.querySelector('#gprint-ai-form');
  const input = panel.querySelector('#gprint-ai-text');
  const sendBtn = panel.querySelector('#gprint-ai-send');
  const msgBox = panel.querySelector('#gprint-ai-messages');
  const modeEl = panel.querySelector('#gprint-ai-mode');
  const history = [];

  state.els = {
    button, panel, form, input, sendBtn, msgBox, modeEl,
    modeRow: panel.querySelector('#gprint-ai-mode-row'),
    titleEl: panel.querySelector('#gprint-ai-title'),
    subtitleEl: panel.querySelector('#gprint-ai-subtitle'),
    noteEl: panel.querySelector('#gprint-ai-note'),
    welcomeEl: panel.querySelector('#gprint-ai-welcome'),
    quickWrap: panel.querySelector('#gprint-ai-quick-wrap'),
  };
  state.rendered = true;

  button.addEventListener('click', () => panel.classList.toggle('open'));
  panel.querySelector('.gprint-ai-close').addEventListener('click', () => panel.classList.remove('open'));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cfg = state.config;
    if (cfg.enabled !== true) return removeAiChat();
    const question = input.value.trim();
    if (!question) return;
    if (getLocalCount() >= cfg.dailyClientLimit) {
      addMessage(msgBox, '오늘 사용할 수 있는 AI 상담 횟수를 모두 사용했습니다. 급한 문의는 고객센터 또는 전화로 문의해주세요.', 'bot');
      return;
    }
    addMessage(msgBox, question, 'user');
    history.push({ role: 'user', text: question });
    input.value = '';
    sendBtn.disabled = true;
    const loading = addMessage(msgBox, '답변을 준비 중입니다...', 'bot');
    try {
      const res = await fetch(AI_CHAT_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, mode: modeEl?.value || cfg.defaultMode || 'lite', clientId: getClientId(), history: history.slice(-8) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'AI 상담 연결에 실패했습니다.');
      loading.textContent = data.answer || '답변을 생성하지 못했습니다.';
      history.push({ role: 'assistant', text: loading.textContent });
      addLocalCount();
    } catch (err) {
      loading.textContent = err.message || 'AI 상담 연결에 실패했습니다.';
    } finally {
      sendBtn.disabled = false;
      msgBox.scrollTop = msgBox.scrollHeight;
    }
  });
  applyConfig();
}

async function readPublicConfigOnce() {
  try {
    const snap = await getDoc(PUBLIC_CONFIG_REF);
    if (!snap.exists()) return normalizeConfig({ enabled: false });
    return normalizeConfig(snap.data());
  } catch (e) {
    console.warn('[ai-chat] public config read failed:', e);
    return normalizeConfig({ enabled: false });
  }
}

async function initAiChat() {
  if (!isPublicPage()) return;
  if (window.__gprintAiChatStarted) return;
  window.__gprintAiChatStarted = true;
  removeAiChat();
  state.config = await readPublicConfigOnce();
  renderAiChat();
  try {
    state.unsub = onSnapshot(PUBLIC_CONFIG_REF, (snap) => {
      state.config = normalizeConfig(snap.exists() ? snap.data() : { enabled: false });
      renderAiChat();
    }, (e) => {
      console.warn('[ai-chat] public config watch failed:', e);
      state.config = normalizeConfig({ enabled: false });
      renderAiChat();
    });
  } catch (e) {
    console.warn('[ai-chat] public config watch setup failed:', e);
    state.config = normalizeConfig({ enabled: false });
    renderAiChat();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAiChat, { once: true });
else initAiChat();
