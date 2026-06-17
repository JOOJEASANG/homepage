// ============================================================
// ai-chat.js — 메인페이지 Gemini AI 상담 위젯
// ============================================================

const AI_CHAT_ENDPOINT = 'https://asia-northeast3-worklist-1e83a.cloudfunctions.net/aiChat';
const DAILY_LOCAL_LIMIT = 5;

function isHomePage() {
  const file = (location.pathname || '').split('/').pop() || 'index.html';
  return file === 'index.html' || file === '';
}

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function getClientId() {
  try {
    let id = localStorage.getItem('gprint_ai_client_id');
    if (!id) {
      id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('gprint_ai_client_id', id);
    }
    return id;
  } catch (e) {
    return 'unknown';
  }
}

function getLocalCount() {
  try {
    const key = 'gprint_ai_usage_' + todayKey();
    return Number(localStorage.getItem(key) || 0);
  } catch (e) {
    return 0;
  }
}

function addLocalCount() {
  try {
    const key = 'gprint_ai_usage_' + todayKey();
    const next = getLocalCount() + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch (e) {
    return 0;
  }
}

function injectStyle() {
  if (document.getElementById('gprint-ai-chat-style')) return;
  const style = document.createElement('style');
  style.id = 'gprint-ai-chat-style';
  style.textContent = `
    #gprint-ai-button{position:fixed;right:22px;bottom:22px;z-index:9997;border:none;border-radius:999px;background:#16a34a;color:#fff;box-shadow:0 16px 40px rgba(22,163,74,.35);padding:14px 18px;font-weight:900;font-size:14px;display:flex;align-items:center;gap:8px;cursor:pointer}
    #gprint-ai-panel{position:fixed;right:22px;bottom:84px;z-index:9997;width:min(380px,calc(100vw - 28px));height:560px;max-height:calc(100vh - 110px);background:#fff;border:1px solid #e2e8f0;border-radius:22px;box-shadow:0 24px 70px rgba(15,23,42,.22);display:none;overflow:hidden;color:#0f172a}
    #gprint-ai-panel.open{display:flex;flex-direction:column}
    .gprint-ai-head{padding:16px 17px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px}
    .gprint-ai-head b{font-size:15px}.gprint-ai-head span{display:block;font-size:11px;color:#a7f3d0;margin-top:2px}.gprint-ai-close{width:32px;height:32px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}
    .gprint-ai-mode{padding:10px 14px;border-bottom:1px solid #eef2f7;background:#f8fafc;display:flex;gap:8px;align-items:center}.gprint-ai-mode select{flex:1;border:1px solid #dbe3ea;border-radius:10px;padding:8px 9px;font-size:12px;background:#fff;color:#334155;font-weight:700}
    .gprint-ai-messages{flex:1;overflow:auto;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.gprint-ai-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}.gprint-ai-user{align-self:flex-end;background:#16a34a;color:#fff;border-bottom-right-radius:4px}.gprint-ai-bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;color:#334155;border-bottom-left-radius:4px}.gprint-ai-note{font-size:11px;color:#64748b;line-height:1.5;background:#fff;border:1px dashed #cbd5e1;border-radius:12px;padding:9px 10px}
    .gprint-ai-input{padding:12px;border-top:1px solid #e2e8f0;background:#fff;display:flex;gap:8px}.gprint-ai-input textarea{flex:1;resize:none;height:44px;max-height:100px;border:1px solid #dbe3ea;border-radius:12px;padding:10px 11px;font-size:13px;line-height:1.5;outline:none}.gprint-ai-send{width:48px;border:none;border-radius:12px;background:#16a34a;color:#fff;font-weight:900;cursor:pointer}.gprint-ai-send:disabled{opacity:.45;cursor:not-allowed}
    @media(max-width:640px){#gprint-ai-button{right:14px;bottom:14px}#gprint-ai-panel{right:14px;bottom:74px;height:min(560px,calc(100vh - 92px))}}
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

function initAiChat() {
  if (!isHomePage() || document.getElementById('gprint-ai-button')) return;
  injectStyle();

  const button = document.createElement('button');
  button.id = 'gprint-ai-button';
  button.type = 'button';
  button.innerHTML = '<i class="fas fa-robot"></i><span>AI 상담</span>';

  const panel = document.createElement('div');
  panel.id = 'gprint-ai-panel';
  panel.innerHTML = `
    <div class="gprint-ai-head">
      <div><b>그린오피스 AI 상담</b><span>출력 · 제본 · 디지털인쇄 안내</span></div>
      <button class="gprint-ai-close" type="button" aria-label="닫기"><i class="fas fa-times"></i></button>
    </div>
    <div class="gprint-ai-mode">
      <select id="gprint-ai-mode">
        <option value="lite">2.0 호환 / 무료우선</option>
        <option value="flash">2.5 Flash / 품질우선</option>
      </select>
    </div>
    <div class="gprint-ai-messages" id="gprint-ai-messages">
      <div class="gprint-ai-note">AI 상담은 참고 안내입니다. 최종 견적금액, 제작 가능 여부, 납기, 환불 여부는 관리자 확인 후 확정됩니다. 하루 5회까지 사용할 수 있습니다.</div>
      <div class="gprint-ai-msg gprint-ai-bot">안녕하세요. 출력, 제본, 책자 제작, 디지털 인쇄 중 어떤 작업을 준비 중이신가요?</div>
    </div>
    <form class="gprint-ai-input" id="gprint-ai-form">
      <textarea id="gprint-ai-text" maxlength="700" placeholder="예: A4 40페이지 책자 30부 무선제본 가능할까요?"></textarea>
      <button class="gprint-ai-send" id="gprint-ai-send" type="submit"><i class="fas fa-paper-plane"></i></button>
    </form>
  `;

  document.body.appendChild(button);
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector('.gprint-ai-close');
  const form = panel.querySelector('#gprint-ai-form');
  const input = panel.querySelector('#gprint-ai-text');
  const sendBtn = panel.querySelector('#gprint-ai-send');
  const msgBox = panel.querySelector('#gprint-ai-messages');
  const modeEl = panel.querySelector('#gprint-ai-mode');
  const history = [];

  button.addEventListener('click', () => panel.classList.toggle('open'));
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    if (getLocalCount() >= DAILY_LOCAL_LIMIT) {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          mode: modeEl.value,
          clientId: getClientId(),
          history: history.slice(-6),
        }),
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
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAiChat, { once: true });
else initAiChat();
setTimeout(initAiChat, 1000);
