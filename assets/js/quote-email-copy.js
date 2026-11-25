// Independent of Firebase: copy the visible file-receipt address without opening a mail app.
(() => {
  async function copyText(value) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {
      // Older or restricted browsers may still support the selection-based fallback.
    }
    const active = document.activeElement;
    const field = document.createElement('textarea');
    field.value = value;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;font-size:16px';
    document.body.append(field);
    try {
      field.select();
      field.setSelectionRange(0, value.length);
      return document.execCommand('copy');
    } catch (_) {
      return false;
    } finally {
      field.remove();
      active?.focus?.({ preventScroll: true });
    }
  }

  document.querySelectorAll('[data-email-copy]').forEach(group => {
    const button = group.querySelector('[data-copy-email]');
    const address = group.querySelector('[data-email-address]');
    const label = group.querySelector('[data-copy-label]');
    const status = group.querySelector('[data-copy-status]');
    if (!button || !address || !label || !status) return;
    let timer;
    button.addEventListener('click', async () => {
      clearTimeout(timer);
      button.disabled = true;
      try {
        const copied = await copyText(address.textContent.trim());
        label.textContent = copied ? '복사 완료' : '복사 실패';
        status.textContent = copied ? '이메일 주소가 복사되었습니다.' : '복사하지 못했습니다. 이메일 주소를 직접 선택해 복사해 주세요.';
        status.classList.toggle('sr-only', copied);
        if (!copied) status.classList.add('w-full', 'text-xs');
        timer = setTimeout(() => {
          label.textContent = '주소 복사';
          status.textContent = '';
          status.classList.add('sr-only');
        }, 3000);
      } finally {
        button.disabled = false;
      }
    });
  });
})();
