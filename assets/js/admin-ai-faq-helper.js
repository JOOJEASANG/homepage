// admin-ai-chat.html 예상질문 추가 보정
// 인라인 스크립트가 늦게 실행되거나 일부 오류가 나도 버튼이 동작하도록 DOM 기준으로 직접 추가합니다.

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

function ensureContainer() {
  return document.getElementById('faqExamples');
}

function emptyPlaceholder(container) {
  if (!container) return;
  const only = container.children.length === 1 ? container.children[0] : null;
  if (only && !only.classList.contains('faq-item')) container.innerHTML = '';
}

function addFaqItem(item = {}) {
  const container = ensureContainer();
  if (!container) return false;
  emptyPlaceholder(container);
  const div = document.createElement('div');
  div.className = 'faq-item rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3';
  div.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <label class="flex items-center gap-2 text-sm font-black text-slate-700">
        <input data-faq-enabled type="checkbox" class="w-4 h-4 accent-emerald-600" ${item.enabled === false ? '' : 'checked'}> 사용
      </label>
      <button type="button" data-faq-remove class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-black border border-red-100">삭제</button>
    </div>
    <input data-faq-question class="w-full rounded-xl border px-3 py-2 text-sm bg-white" placeholder="예상질문 예: A4 40페이지 30부 무선제본 얼마인가요?" value="${esc(item.question)}">
    <textarea data-faq-answer rows="4" class="w-full rounded-xl border px-3 py-3 text-sm bg-white" placeholder="답변 프롬프트: AI가 이 질문에 어떤 기준으로 답해야 하는지 입력">${esc(item.answerPrompt || item.answer || item.prompt)}</textarea>
    <input data-faq-tags class="w-full rounded-xl border px-3 py-2 text-sm bg-white" placeholder="키워드/분류 예: 무선제본,책자,견적" value="${esc(item.tags)}">
  `;
  div.querySelector('[data-faq-remove]')?.addEventListener('click', () => div.remove());
  container.appendChild(div);
  div.querySelector('[data-faq-question]')?.focus();
  return true;
}

document.addEventListener('click', e => {
  const btn = e.target?.closest?.('#addFaqBtn');
  if (!btn) return;
  const before = document.querySelectorAll('.faq-item').length;
  setTimeout(() => {
    const after = document.querySelectorAll('.faq-item').length;
    if (after <= before) addFaqItem();
  }, 0);
}, true);

try { window.__addAiFaqItem = addFaqItem; } catch (e) {}
