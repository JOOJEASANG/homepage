function selectTab(tab) {
  const inquiry = tab !== 'faq';
  for (const name of ['inquiry', 'faq']) {
    const selected = inquiry === (name === 'inquiry');
    const button = document.getElementById(`tab-${name}`);
    button?.classList.toggle('active', selected);
    button?.setAttribute('aria-selected', String(selected));
    document.getElementById(`content-${name}`)?.classList.toggle('hidden', !selected);
  }
  document.dispatchEvent(new CustomEvent('qna:section-changed'));
}

function goToSection(section, focus = true) {
  selectTab(section === 'faq' ? 'faq' : 'inquiry');
  const target = document.getElementById(section === 'faq' ? 'content-faq' : `qna-${section}`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (focus) document.getElementById(section === 'answers' ? 'searchName' : section === 'compose' ? 'qnaName' : 'faqSearch')?.focus({ preventScroll: true });
}

export function showQnaSubmission({ name, password, isSecret }) {
  const message = document.getElementById('qna-submit-result');
  if (message) {
    message.hidden = false;
    message.textContent = isSecret
      ? '문의가 접수되었습니다. 아래 답변 확인 버튼에서 진행 상황을 확인하세요.'
      : '문의가 접수되었습니다. 공개 문의 목록에서 답변을 확인하세요.';
  }
  if (isSecret) {
    document.getElementById('searchName')?.removeAttribute('readonly');
    document.getElementById('searchPw')?.removeAttribute('readonly');
    document.getElementById('searchName').value = name;
    document.getElementById('searchPw').value = password;
    // Credentials stay only in the current form, never browser storage or a URL.
    document.getElementById('qna-submitted-lookup')?.removeAttribute('hidden');
  }
}

function boot() {
  const credentialFields = ['qnaName', 'qnaPw', 'searchName', 'searchPw']
    .map(id => document.getElementById(id)).filter(Boolean);
  for (const field of credentialFields) {
    field.value = '';
    const unlock = () => field.removeAttribute('readonly');
    field.addEventListener('focus', unlock, { once: true });
    field.addEventListener('pointerdown', unlock, { once: true });
    field.addEventListener('keydown', unlock, { once: true });
  }
  window.switchTab = selectTab;
  document.querySelectorAll('[data-qna-section]').forEach(button => button.addEventListener('click', () => {
    const section = button.dataset.qnaSection;
    history.replaceState(history.state, '', `#${section}`);
    goToSection(section);
  }));
  document.getElementById('qna-lookup-form')?.addEventListener('submit', event => event.preventDefault());
  document.getElementById('qna-submitted-lookup')?.addEventListener('click', () => {
    goToSection('answers', false);
    document.getElementById('searchBtn')?.click();
  });
  const fromHash = () => {
    const section = location.hash.slice(1);
    if (['answers', 'compose', 'faq'].includes(section)) goToSection(section, false);
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
